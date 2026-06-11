# Worklog — chart-panel preview migration (2026-06-11)

> Delivery record for the work-status item `chart-panel-preview-migration`,
> filed 2026-06-11 by the PR #413 out-of-frame gate (see the dated coordinator
> addition at the foot of
> `docs/worklog/2026-06-11-thumbnail-render-lifecycle-consolidation.md`). The
> gate found that the async-write-into-a-preview-ref shape PR #413's in-frame
> artifact reported as extinguished was in fact still **live** in
> `ScoreLeadPanel.vue` and `MergedDeltaPanel.vue`. This arc applies PR #413's
> cured shape to both panels and removes the last dead instance of the shape
> (`useChartNavigation`'s hover handlers).

## The defect

Both panels held the docked hover/position thumbnail as
`preview = ref<BoardSnapshot | null>` and wrote it from the hover/leave
continuations with `preview.value = await getSnapshot(nodeId, boardId)`. That
is an **awaited write into the visible-gate ref**, last-write-wins. A slow
cache-miss `getSnapshot` resolve that lands *after* a leave-time `resetPreview`
(which sets `preview.value = null` in the `activeIndex === null` case)
repopulates the docked preview with the stale hovered position —
content-resurrection. The `activeIndex`/`activeMergedIndex` `{ immediate: true }`
watch drives the same `resetPreview`, so the race is reachable on any
hover→leave with a cold cache.

## The cured shape (mirrored from PR #413, `TreeWidget.onToggleEnter`)

The fix is one invariant over **every** writer of the preview slot in both
panels:

> The visible preview ref is written only **synchronously**; the only async
> work is a fire-and-forget cache **warm** that writes the shared (reactive)
> snapshot cache, never the gate.

Concretely, in each panel:

- `preview = ref<BoardSnapshot | null>` → `previewNode = ref<NodeId | null>`.
  The gate now holds the *target node*, not an awaited snapshot.
- `showPreview(nodeId)` sets `previewNode.value = nodeId` synchronously, then
  `void getSnapshot(nodeId, boardId)` — a fire-and-forget warm that fills the
  shared `ref(Map)` cache (`thumbnail-render-resources.ts`) and never touches
  the gate.
- `getPreview = () => previewNode.value ? getSnapshotSync(previewNode.value) :
  null` — the `() => BoardSnapshot | null` accessor `ChartPreviewBox` already
  consumes. The cache being a `ref(Map)`, the accessor (read inside
  `ChartPreviewBox`'s own `computed`) re-evaluates and fills when the warm
  lands.
- `resetPreview` and `handleHover` route through `showPreview` (non-null
  target) or set `previewNode.value = null` (leave/clear), so no writer awaits
  a snapshot into the gate.

A late resolve can therefore fill a *still-targeted* thumbnail but can never
resurrect a node the leave-time reset already cleared.

### Writers of `previewNode` (re-derived from code, per panel)

- **ScoreLeadPanel**: `showPreview` (sync set + warm; called from
  `resetPreview` and `handleHover`); `resetPreview` (`= null` on the
  `activeIndex === null` branch + the `watch(activeIndex, …, {immediate})`).
- **MergedDeltaPanel**: `showPreview` (sync set + warm; called from
  `resetPreview` and `handleHover`); `resetPreview` (`= null` on the
  `activeMergedIndex === null` / no-node branches + the
  `watch(activeMergedIndex, …, {immediate})`).

Every non-null write goes through `showPreview` (set-then-warm); every null
write is a leave/clear. No writer writes an awaited snapshot into the gate.
This is a single invariant over all writers, not a per-writer gate.

## Dead-handler removal

`useChartNavigation.handleMainHover` / `handlePlayerHover` wrote an awaited
`getThumbnailSvg` result into a caller-supplied `previewRef: { value: string }`
— the same async-write shape, and the last instance of it. Consumer
measurement (grep over `src/` + `tests/`):

- **Zero live (production) consumers.** The only references were the two
  handlers' own definitions / return-object entries and the two test `describe`
  blocks in `useChartNavigation.test.ts`. `useChartNavigation` itself stays live
  — `useAnalysisContext` consumes its `handleMainClick` / `handlePlayerClick`.
- Both handlers removed, along with the `useThumbnailCache` import and the
  `getThumbnailSvg` destructure they were the sole users of, the two stale
  `describe` blocks, and the test's now-unused `useThumbnailCache` mock + `ref`
  import. The composable's header and the player-panel asymmetry comment are
  rewritten to the click-only reality.

`getThumbnailSvg` / `snapshotToSvg` (in `useThumbnailCache.ts`) are **not**
removed — see Deferrals. The `useChartNavigation.ts` purpose line in
`FILES.md` is retagged ("Pure black-box click-navigation handler … hover-preview
is owned panel-side").

## Tests

The migration property is pinned by `tests/integration/chart-panel-preview.seam.test.ts`,
mirroring PR #413's `FloatingThumbnail.seam.test.ts` "a warm landing after
hide() does not resurrect the thumbnail" case for the docked surface. Three
cases: (1) hover sets the gate synchronously and the accessor fills once the
warm resolves; (2) **a warm landing after a leave-time reset does not resurrect
the stale preview** (the load-bearing case — a deferred warm models the slow
cache miss, released after the reset); (3) the async warm writes only the
shared cache, never the gate.

The test drives the **real** `useThumbnailCache` (`getSnapshot` /
`getSnapshotSync`) against a real board; the panel quartet (`previewNode` ref +
two one-line setters + accessor) is the minimal glue the helper restates,
byte-faithful to both panels. **Guard verified live**: an inverted probe (the
helper rebuilt with the OLD awaited-write-into-the-gate shape) turns cases (2)
and (3) red — confirming the test actually distinguishes the cured shape from
the defect, not a test that cannot fail. Probe removed; tree clean.

## Verification (gates)

- `npm run build` (`vue-tsc -b` strict + `vite build`): pass, 1058 modules
  transformed.
- `npx eslint .`: exit 0.
- `npm run test:run`: **1018 passed | 4 skipped** (4 skips pre-existing). The
  trimmed `useChartNavigation.test.ts` (7 cases, hover blocks removed) and the
  new seam suite (3 cases) are included.

## Perf battery (counts; no perf claims)

Per the maintainer's standing battery rule for chart/interaction changes and
the capture-normalization protocol: `full-stress` (blinking popover + autonav +
clear_cache + streaming range analysis, SELECTOR `ws://127.0.0.1:1235`, model
`b10c128`) captured against the worktree dev build (`:5175`) at the branch
point (clean HEAD) and after.

- Before: `~/w/vdc/chromium_profiles/full-stress-2026-06-11T20-51-02-037Z.json`
  (34.5 MB, 169479 events).
- After: `~/w/vdc/chromium_profiles/full-stress-2026-06-11T21-06-48-725Z.json`
  (32.1 MB, 157389 events).

Comparability proxies first: `autonav:step` **100 = 100** (navigation volume
identical). `rb3:handler` 145 → 119 (packet volume differs — the documented
cache-warmth/timing confound, so packet-coupled components are compared only
directionally). On the comparable axes: the render-coupling invariant holds —
**R/P = 1.00 for every component in both captures** (no render-coupling tell);
the cache-bound thumbnail pipeline is count-identical (ChartPreviewBox
204 = 204, MiniBoard 201 = 201, MiniBoardCanvas 201 = 201); TreeWidget
101 = 101 (untouched). The packet-coupled components moved with their own
(lower) packet volume in the after-run: ScoreLeadPanel/MergedDeltaPanel
126 → 106, AnalysisChartPanel/BaseChart 252 → 212 — directional, tracking the
`rb3:handler` drop, not attributable to the change. **No perf property is
claimed**; this ships as a correctness/structural fix. (The relevant scenario
exists and was run; there is no loud absence to record.)

## Deferrals (ADR-0005 Rule 10)

- **`getThumbnailSvg` / `snapshotToSvg` are now orphaned of production
  consumers.** After the hover-handler removal, `getThumbnailSvg`'s only
  remaining references are its own definition, a comment in `SidebarWidget.vue`,
  and three test mocks that defensively stub it. Removing it (and the private
  `snapshotToSvg`) is a separate decision about `useThumbnailCache`'s public API
  surface — a different composable, a separately-reviewable removal that the
  item does not scope, and amputating it mid-migration would grow scope the same
  way PR #413 declined to. **not-filed:** flagged here and in the PR body for
  coordinator triage at item closure (file-or-mark per ADR-0005 Rule 10); this
  worker's todo-DB access is read-only.
- **The seam test restates the panel quartet rather than mounting the real
  SFCs** (out-of-frame HRA finding 2). It is byte-faithful to both panels today,
  so the pin is sound now; but a future in-SFC regression (someone reintroducing
  an awaited write directly in a panel) would not turn it red, because it tests
  its own copy. The structural close would be a shared `useChartHoverPreview`
  composable the test imports and both panels use. **not-filed:** the item
  instructs "match the #413 idiom exactly", and the #413 idiom is per-component
  spelling (TreeWidget spells its own copy in the SFC); extracting a composable
  deviates from that instruction and widens scope. Surfaced for maintainer
  triage rather than decided unilaterally.
- **Cold-cache flicker** (out-of-frame HRA finding 1). On a cache miss,
  `showPreview` sets `previewNode` synchronously while `getSnapshotSync` returns
  null until the warm lands, so `ChartPreviewBox` shows an empty box for that
  window before the `ref(Map)` fill re-evaluates the accessor. This is an
  accepted property of the whole cured family (TreeWidget / FloatingThumbnail
  have the same empty-then-fill), and is the deliberate trade for eliminating
  content-resurrection — a brief empty-on-cold-miss over a stale position.
  **not-filed:** not a regression introduced here; behaviour is uniform with the
  PR #413 surfaces.
- **Duplication, not extraction** (out-of-frame HRA finding 3). The cured
  quartet lives in three hand-written copies (two panels + the test helper). A
  shared composable would single-source the invariant. **not-filed:** same root
  as the test-fidelity deferral and the same "match the idiom exactly"
  consideration; folded into that maintainer-triage item.

## Appendix A — out-of-frame HRA commission (verbatim)

> You are running the hack-rationalization-detector skill OUT OF FRAME. You did
> NOT write the change under review and you have NOT seen the implementer's
> reasoning. Treat any justification you find (commit messages, comments,
> worklog) as the OBJECT OF SUSPICION, not as context to agree with.
>
> [Skill SKILL.md path + full procedure cited.] CHANGE UNDER REVIEW — worktree
> /home/bork/w/omega/.claude/worktrees/agent-a40b44fea1944e776, branch
> bork/fix/chart-panel-preview-migration, diff vs HEAD ed1ce435 (uncommitted).
> Sub-project frontend/. Item chart-panel-preview-migration. [Full description
> of the migration from `preview = ref<BoardSnapshot|null>` awaited-write to the
> `previewNode = ref<NodeId|null>` synchronous-gate + fire-and-forget warm +
> `getSnapshotSync` accessor shape; the dead-handler + test-describe removals;
> the new seam test.] YOUR JOB — audit whether this is a GENERAL fix (one
> invariant over all writers of the previewNode slot) or a per-writer patch
> dressed as discipline. Independently enumerate EVERY write site to previewNode
> (and preview) in BOTH panels. Confirm every writer obeys the synchronous-gate
> discipline. Check the deleted handlers truly have zero live consumers. Verify
> the new test would fail under the old shape (don't trust the claim). Note
> residual fragility. Produce the skill's exact output template and return it
> verbatim. Read-only; do not modify source, commit, touch the todo DB, or read
> backend/qeubo/.

## Appendix B — out-of-frame HRA artifact (verbatim)

> ## Hack-rationalization review: chart-panel-preview-migration
>
> FRAME CHECK: Out of frame. I did not write the change, did not see the
> implementer's reasoning, and treated the diff comments / docstrings / the new
> test's self-description as the object of suspicion. The justification text was
> read as a claim to verify, not context to agree with.
>
> GENERAL FIX:   Over both panels' `previewNode` slot, hold one invariant —
>                "the visible preview ref is written only synchronously; the only
>                async work is a fire-and-forget cache warm that writes the shared
>                (reactive) snapshot cache, never the gate" — so no late resolve
>                can write the slot. Every writer (hover, leave, the activeIndex
>                immediate watch) obeys it, and the slot is read through an
>                accessor over `getSnapshotSync`.
>
> PATCH SHIPPED: Exactly that invariant. `preview = ref<BoardSnapshot|null>`
>                (written via `preview.value = await getSnapshot(...)`) is replaced
>                in both ScoreLeadPanel.vue and MergedDeltaPanel.vue by
>                `previewNode = ref<NodeId|null>` written synchronously, a
>                `showPreview(nodeId)` = `previewNode.value = nodeId; void
>                getSnapshot(...)`, and `getPreview = () => previewNode.value ?
>                getSnapshotSync(previewNode.value) : null`. The dead
>                `useChartNavigation.handleMainHover/handlePlayerHover` (and their
>                two test describe blocks) are removed. A seam test is added.
>
> DOWNGRADE:     None. No general fix was named and set aside; no minimality-word
>                is used to discharge a named-better-fix. The scanner found one
>                minimality cue and one named-fix cue but ZERO co-occurrence (they
>                sit in unrelated sentences). This is the cured shape applied
>                whole, not a narrowing.
>
> WRITER DELTA:  Claimed writers (per the prompt): showPreview (hover),
>                resetPreview (leave + the activeIndex/activeMergedIndex immediate
>                watch). Independently enumerated writers of `previewNode`:
>                  ScoreLeadPanel — showPreview (line 49, sync + warm; called from
>                    resetPreview L58 and handleHover L71); resetPreview (line 62,
>                    `= null`; also the `watch(activeIndex, …, {immediate})` L66).
>                  MergedDeltaPanel — showPreview (line 92, sync + warm; called
>                    from resetPreview L281 and handleHover L298); resetPreview
>                    (lines 273 + 283, `= null`; also `watch(activeMergedIndex, …,
>                    {immediate})` L287).
>                No discrepancy: claimed == enumerated. EVERY non-null write goes
>                through showPreview (set-then-warm); every null write is a
>                leave/clear (no warm needed). NO writer writes an awaited snapshot
>                into the gate — the only `await getSnapshot` / `preview.value =
>                await` strings left in the tree are inside explanatory comments.
>                (Note: scripts/enumerate_writers.py returned zero hits — it walks
>                a `.vue` path as a directory, and its assign-regex matches
>                `previewNode =` but not `previewNode.value =`; the `.value` infix
>                defeats it. Enumeration was re-derived by reading both files in
>                full.)
>
> RUNTIME:       Reproduced + verified. The new seam test passes (10/10 across it
>                and the trimmed nav test). Crucially I did NOT trust the "would
>                fail under the old shape" claim: I built an inverted probe (a
>                copy of the test whose makePanelSeam uses the OLD awaited-write
>                shape, `previewSnap.value = await warm(...)`) and ran it — 2 of
>                the 3 cases go RED (the post-reset resurrection case and the
>                "warm writes only the cache" case), with the slow resolve
>                repopulating the visible snapshot after reset. The probe was
>                removed; the tree is clean. The test genuinely pins the property.
>
> TELLS (Step 1): No co-occurrence tells. grep_tells over the full diff:
>                 "minimality-terms seen: 1 | named-fix cues seen: 1 |
>                 co-occurrence tells: 0". The lone minimality word is the
>                 useChartNavigation "Scope note:" header explaining why the dead
>                 handlers were removed (zero live consumers) — a deletion
>                 rationale, not a named-better-fix being argued down.
>
> VERDICT: general
>
> WHY: The fix is one invariant quantified over all writers of the slot in both
> panels (synchronous gate write + fire-and-forget cache warm + accessor read),
> not an enumeration of per-writer patches; the independently-enumerated writer
> set matches the claimed set with no missed producer; and the cured shape is the
> same one already established for the floating/tree hover surface, applied whole
> rather than narrowed. The race-closing property is verified at runtime against
> both the cured and the inverted (old-shape) seam, not derived on paper.
>
> FINDINGS BEYOND VERDICT (required):
>   - COLD-CACHE FLICKER is real but is an accepted property of this whole cured
>     family, not a regression this change introduces. On a cache miss,
>     showPreview sets previewNode synchronously while getSnapshotSync returns
>     null until the warm resolves, so ChartPreviewBox (`<MiniBoard v-if="snapshot">`,
>     snapshot = `computed(() => accessor() ?? null)`) shows EMPTY for the window
>     until the fill lands. The fill DOES surface because the cache is a `ref(Map)`
>     (thumbnail-render-resources.ts L62-71 "Reactivity note (load-bearing)") whose
>     `.set()` re-fires the computed — verified. The trade is deliberate: a brief
>     empty-on-cold-miss in exchange for eliminating content-resurrection. The
>     same empty-then-fill exists in TreeWidget/FloatingThumbnail. Worth a
>     maintainer's eyes only if a docked preview that previously showed the LAST
>     snapshot now blanks momentarily on first hover of an un-warmed node — a
>     visible behavior change, though strictly an improvement over showing a stale
>     position.
>
>   - TEST MODELS A RE-IMPLEMENTED SEAM, NOT THE REAL SFCs. The seam test's
>     makePanelSeam hand-rebuilds the quartet (previewNode + showPreview +
>     getPreview + resetPreview) rather than mounting ScoreLeadPanel/
>     MergedDeltaPanel. I confirmed the helper is byte-faithful to both panels'
>     actual code today (the cured triple is identical across both SFCs — no
>     drift), so the test is sound NOW. But the pin is structural-by-restatement:
>     if a panel's real showPreview/resetPreview later regresses (e.g. someone
>     reintroduces an awaited write directly in the SFC), THIS test keeps passing
>     because it tests its own copy. A mount-based test, or a shared composable the
>     test imports, would close that gap. This is the residual fragility the green
>     test cannot see past.
>
>   - DUPLICATION, NOT EXTRACTION. The cured quartet is duplicated verbatim across
>     the two SFCs instead of extracted to a shared composable (e.g.
>     useChartHoverPreview). Not a correctness defect and consistent with the
>     codebase's existing per-component idiom (TreeWidget spells its own copy too),
>     but it means the invariant lives in three independent hand-written copies
>     (two panels + the test's helper); the next panel added is a fourth place to
>     get it right by hand. A shared composable would make the invariant
>     single-sourced and let the test drive the real unit.
>
>   - DEAD-HANDLER REMOVAL IS CLEAN. handleMainHover/handlePlayerHover have zero
>     live consumers anywhere in src or tests (the only remaining occurrences are
>     the new explanatory docstring). getThumbnailSvg — which those handlers used —
>     is correctly NOT removed: it is still consumed (SidebarWidget reference; three
>     test mocks defensively stub it), so deleting it would have broken other
>     surfaces. The handler prop contracts (onIndexHover/onMouseLeave) are
>     `=> void`, so the consumer never awaited the handlers; the old async shape
>     was unsynchronized at the seam, which is precisely why the late resolve
>     raced. The synchronous handlers now match the `=> void` contract exactly.
>
>   - DOC-DEBT (out of scope to fix, flagged per the umbrella checklist): a new
>     src file was not added, but a new test file was (chart-panel-preview.seam.
>     test.ts) and useChartNavigation's purpose narrowed (hover handling removed).
>     Whether frontend/FILES.md / the work-status store need touching is a
>     delivery-completeness item for the implementer, not a correctness finding.

---

License: Public Domain (The Unlicense).
