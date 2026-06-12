# Worklog — preview-snapshot shared composable (2026-06-12)

> Delivery record for the work-status item `preview-snapshot-shared-composable`,
> promoted at the PR #424 close from that PR's worklog's not-filed markers
> ("duplication, not extraction"; "test restates the quartet"; orphaned
> `getThumbnailSvg`/`snapshotToSvg`). One arc: extract a `usePreviewSnapshot`
> composable, migrate the cured-quartet sites to it, point the #424 seam test
> at the real unit, and retire the orphaned thumbnail-SVG API.

## The deferral being discharged

PR #424 (`docs/worklog/2026-06-11-chart-panel-preview-migration.md`) cured the
content-resurrection race in `ScoreLeadPanel.vue` / `MergedDeltaPanel.vue` by
mirroring the shape PR #413 established for `TreeWidget` / `FloatingThumbnail`:

> The visible preview ref is written only **synchronously**; the only async
> work is a fire-and-forget cache **warm** that writes the shared (reactive)
> snapshot cache, never the gate.

The #424 out-of-frame HRA recorded three deferrals that all share one root: the
cured "quartet" (a `previewNode` ref + accessor + `showPreview` + reset) lived
in **three hand-written copies** (two panels + the seam test's helper), and the
seam test restated the quartet rather than driving a real unit *because no
shared unit existed to drive*. This arc single-sources the quartet.

## What "the four sites" actually are (contract conformance)

The item names four sites: TreeWidget, the FloatingThumbnail/ChartPreviewBox
host, ScoreLeadPanel, MergedDeltaPanel. Reading all of them in full at HEAD,
they do **not** all implement the same *quartet* — they share the same
*invariant* (synchronous gate + cache warm + accessor over `getSnapshotSync`),
but the gate-ownership shape differs. Honest classification (ADR-0008: refuse a
force-fit against a vocabulary that doesn't precisely fit):

| Site | Gate | Accessor | Verdict |
|---|---|---|---|
| `ScoreLeadPanel.vue` | local `previewNode: NodeId\|null` | `getSnapshotSync(previewNode)` | **exact quartet** — migrated to `usePreviewSnapshot(boardId)` whole |
| `MergedDeltaPanel.vue` | local `previewNode: NodeId\|null` | `getSnapshotSync(previewNode)` | **exact quartet** — migrated whole |
| `TreeWidget.vue` + `FloatingThumbnail.vue` | gate (`visible`/`source`) lives in the **child**, set imperatively via `show()`/`hide()` | host builds a one-shot accessor, decorated with `markerLabels` | **diverges** — no host-owned gate; reuses only the warm-plus-accessor **sub-unit** |
| `SidebarWidget.vue` docked rail preview (the "FloatingThumbnail/ChartPreviewBox host" in the docked sense) | local `previewBoardId: **BoardId**\|null` | `getSnapshotSync(board.**currentNodeId**)` — the board's *live* current node, re-resolved per read | **diverges materially** — board-keyed, node derived dynamically, not a fixed hovered `NodeId` |
| `MultiresolutionIntervalPanel.vue` interval preview (a **fifth** site the initial census missed — surfaced by the out-of-frame HRA; see below) | `hoveredCell: **HeatmapCell**\|null` (two endpoints `s`/`t` + colour) | two snapshots `getSnapshotSync(startNode)` / `getSnapshotSync(endNode)`, derived from the current cell | **diverges** (two-board, cell-keyed) but **brought onto the invariant in-place** — see below |

So **two** sites take the full quartet; **TreeWidget** takes the gate-less
sub-unit (its gate is legitimately owned by `FloatingThumbnail`, whose own seam
test pins that ownership — relocating it would be a regression, not a
cleanup); **SidebarWidget** genuinely diverges (a `BoardId` gate over a moving
current node is a different data shape) and is **reported, not force-fit**, per
the commission's explicit STOP-and-report directive. Forcing a parallel
board-keyed variant into the composable for SidebarWidget's single consumer
would violate ADR-0003's "extract a Port only when a second concrete consumer
exists" and ADR-0004's minimal-touch.

### The fifth site (initial-census gap, corrected after the out-of-frame HRA)

The first pass of this arc enumerated four sites and called the invariant
"uniform across all the sites that share it." The out-of-frame
hack-rationalization audit (Appendix B) independently enumerated a **fifth**
hover-preview gate the census had silently excluded:
`MultiresolutionIntervalPanel.vue`, which wrote `startSnap.value = await
getSnapshot(...)` / `endSnap.value = await getSnapshot(...)` — an awaited
snapshot into *visible* state, the precise shape the cured family names as the
defect — masked only by a separate latest-wins `hoverToken` counter, not by the
synchronous-gate invariant. Not a live bug (the leave path bumps the token), but
a structurally different cure the "uniform" claim glossed over.

That gap is corrected here: the interval panel is brought **onto the invariant
in-place** (the same in-place application SidebarWidget uses, since its gate is a
two-endpoint `HeatmapCell`, not a single NodeId the composable could take). The
synchronously-written `hoveredCell` is the gate; the two endpoints' node ids and
their snapshots are now `computed` derivations through `getSnapshotSync`; a
`watch(hoveredCell)` fires two fire-and-forget warms (cache-only). The
`hoverToken` counter is removed — the synchronous-gate shape makes it redundant:
a stale warm only fills the cache, and the computeds read the *current* cell, so
a leave can never be resurrected. This eliminates the defect shape at the seam
rather than guarding around it (ADR-0002), and makes the census's "uniform"
claim true: five sites, four mechanisms collapsed to one invariant (three on the
NodeId composable, two — SidebarWidget + IntervalPanel — applying it in-place
over a non-NodeId gate).

## The shared unit

`src/composables/cards/usePreviewSnapshot.ts` [B3], two call shapes:

- `usePreviewSnapshot(boardId): { previewNode, getPreview, showPreview, reset }`
  — the full quartet for a host that owns its gate. The two chart panels
  consume this whole; their migrated scripts shed ~25 lines of hand-copied
  quartet each and now read `const { getPreview, showPreview, reset } =
  usePreviewSnapshot(boardId)`.
- `warmSnapshotAccessor(nodeId, boardId): () => BoardSnapshot | null` — the
  gate-less sub-unit (warm the cache fire-and-forget, return the accessor over
  `getSnapshotSync`). `TreeWidget.onToggleEnter` reuses this and decorates the
  returned snapshot with `markerLabels` in its own closure, keeping
  `FloatingThumbnail`'s gate where it belongs.

Band: **B3** (Go-bound) — it deals in `BoardSnapshot` / `NodeId` / board
thumbnails. Sits beside `useThumbnailCache.ts` [B3] (the cache API it wraps).

## The seam test, repointed

`tests/integration/chart-panel-preview.seam.test.ts` now drives the **real**
`usePreviewSnapshot` rather than a hand-restated `makePanelSeam` helper. The
three cases (synchronous gate fill; no-resurrection-after-reset; warm writes
only the cache) are preserved. To model the slow cache miss (the race window)
without splitting the shared-cache module graph, `useThumbnailCache` is mocked
once (hoisted) to the **real** implementation with `getSnapshot` wrapped in a
test-controlled gate (`warmGate`); `getSnapshotSync` and the underlying reactive
cache stay the genuine production singletons, so "the cache genuinely fills"
exercises real code.

**Guard verified live.** An inverted probe (the composable's `showPreview`
temporarily rewritten to the OLD await-then-write-the-gate shape) turns the seam
cases RED — confirming the test distinguishes the cured shape from the defect,
not a test that cannot fail. Probe removed; tree clean.

## Orphaned API retired

`getThumbnailSvg` / its private `snapshotToSvg` (in `useThumbnailCache.ts`) lost
their last production consumer when PR #424 removed the async-write hover
handlers. Orphan verification at HEAD (grep over `src/` + `tests/`, plus a
dynamic/string-reference sweep):

- **Zero production call sites.** `getThumbnailSvg`'s only non-definition
  references were three **defensive test-mock stubs** (`auth-lifecycle`,
  `useAnalysisProjection`, `migration-store-roundtrip` — `getThumbnailSvg:
  vi.fn()` in their `vi.mock` factories, none actually exercised) and two
  **past-tense historical comments** (`useChartNavigation.ts`,
  `SidebarWidget.vue`) that explain *why* the cured shape exists.
- `snapshotToSvg` was private, called only by `getThumbnailSvg`.
- Confirmed orphaned ⇒ retired: removed `getThumbnailSvg`, `snapshotToSvg`,
  the export, and the now-dead `renderBoardToSvg` import; removed the three
  stale mock-stub lines; updated the module header to record the retirement.

The two historical comments are left in place: they are past-tense narrative
("the old handlers *wrote* an awaited `getThumbnailSvg` result"), load-bearing
rationale for the cured shape — preserving the reasoning trace (ADR-0005), not
stale references to a live symbol (ADR-0004 minimal-touch).

## Band-conformance

The extraction mints one new band-ordering edge: `TreeWidget.vue [B2] →
usePreviewSnapshot.ts [B3]`. This is the same dominant-concern shape as the
already-intended `TreeWidget → FloatingThumbnail` exception (a B2 tree host
consuming the B3 Go-board hover machinery as an opaque affordance) and as
TreeWidget's pre-existing baseline `useThumbnailCache` edge that the same
extraction inherits. Adjudicated by adding the `from→to` pair to
`BAND_EXCEPTIONS` with that reason (retagging `usePreviewSnapshot` B2 or
`TreeWidget` B3 would each be the greater lie).

The out-of-frame HRA (Appendix B) also caught that the cited
`TreeWidget → FloatingThumbnail` precedent was **inert**: its `BAND_EXCEPTIONS`
key pointed at `src/components/board/FloatingThumbnail.vue`, but the file lives
at `src/components/chrome/FloatingThumbnail.vue` (a move the key never tracked),
so the real edge had been sitting un-absolved in the advisory baseline all
along. Corrected the key `board/` → `chrome/` in the same change; that absolves
the real edge, dropping the advisory count 47 → 46, so the
`NO_NEW_FINDINGS_RATCHET.baseline` is ratcheted DOWN to 46 (per the tool's
ratchet-down-in-the-same-change rule). `--check` clean at the new 46 baseline,
no new leak. (`TreeWidget → useThumbnailCache` remains an un-absolved advisory
finding by design — the maintainer's review surface, pre-existing and out of
scope per ADR-0004.)

*(Coordinator renumbering at the merge-train rebase, 2026-06-12: the 47 → 46
figures above were authored against the pre-tranche-2 baseline. PR #432's
maintainer band adjudication landed first and took the baseline 47 → 31, so
the same key fix lands on main as 31 → **30** — re-measured at the rebase,
`--check` clean at the 30 baseline. The mechanism and arithmetic of this
section are otherwise unchanged.)*

## Verification (gates)

- `npm run build` (`vue-tsc -b` strict + `vite build`): pass, 1061 modules.
- `npx eslint .`: exit 0.
- `npm run test:run`: **1041 passed | 4 skipped** (4 skips pre-existing;
  identical to the pre-change baseline — the seam test keeps its 3 cases).
- `node tools/band-conformance/check.mjs --self-test`: 2 passed.
- `node tools/band-conformance/check.mjs --check`: no structural drift; 46
  advisory findings at the (ratcheted-down) 46 baseline — no new leaks.
- Doc-graph regenerated (`node tools/doc-graph/generate.mjs`) — this worklog is
  a structural doc addition.

No perf claim is made; this is a structural refactor with no behaviour change
on the four originally-named sites (the cured shape and its cold-cache flicker
are byte-identical to what shipped in #424/#413, now single-sourced). The fifth
site (`MultiresolutionIntervalPanel`) changes its preview *mechanism*
(await-into-visible-state + `hoverToken` → synchronous-gate + derived snapshots)
but not its observable behaviour: the panel still shows the hovered interval's
start/end positions, now race-free by construction rather than by counter. The
cold-cache flicker property now applies there too (an empty frame for the
warm-landing window), uniform with the rest of the family.

## Out-of-frame audit (corrections applied)

Per the coordinator disciplines (probe-before-trust; artifact-before-verdict),
this change was put through the `hack-rationalization-detector` skill **out of
frame** — a separate subagent that did not see the implementer's reasoning. Its
verdict was `narrower-but-justified`, and it surfaced two load-bearing findings
that were **fixed in this change** before filing (not deferred):

1. The fifth hover-preview site (`MultiresolutionIntervalPanel`) the census had
   silently excluded — migrated onto the invariant in-place (see "The fifth
   site" above).
2. The inert `TreeWidget → FloatingThumbnail` `BAND_EXCEPTIONS` key (wrong
   directory) the new exception's justification leaned on — corrected and the
   ratchet ratcheted down (see "Band-conformance" above).

The auditor's third note — the word "uniform" overstating across five sites and
four mechanisms — is dissolved by fix (1), which collapses the IntervalPanel's
fourth mechanism into the invariant. The full audit artifact is reproduced
verbatim in Appendix B (ADR-0005 Rule 11; verdict-with-artifact).

## Residue / decisions under ambiguity

- **SidebarWidget docked preview NOT migrated onto the composable** — board-keyed
  (`BoardId` gate) over a live current node; a materially different data shape
  that the NodeId quartet does not fit. Reported per the STOP-and-report
  directive rather than force-fit; its in-place shape is already race-free by the
  same invariant. **not-filed:** an accepted divergence, not a defect — a
  board-keyed variant would be a single-consumer Port extraction ADR-0003
  declines.
- **`MultiresolutionIntervalPanel` and SidebarWidget apply the invariant
  in-place rather than through the composable** — both have non-NodeId gates
  (a `HeatmapCell` two-endpoint and a `BoardId`), so neither consumes
  `usePreviewSnapshot`; they spell the synchronous-gate + warm + accessor shape
  directly. If a third non-NodeId consumer ever appears, a generalised
  gate-agnostic seam would be worth extracting (ADR-0003 second-adopter rule);
  two is not yet that bar. **not-filed:** accepted shape, surfaced for the
  maintainer's awareness.
- **The pre-existing inconsistency** that TreeWidget's `useThumbnailCache` edge
  is an *un-absolved* advisory baseline finding while its sibling
  `FloatingThumbnail` and now `usePreviewSnapshot` edges are in
  `BAND_EXCEPTIONS` is **pre-existing and out of scope** (ADR-0004); left as
  the maintainer's review surface. **not-filed.**
- **Cold-cache first-hover flicker** — explicitly record-declined by the
  maintainer as an accepted property of the whole cured family, uniform across
  surfaces. Not touched. **not-filed.**

## Appendix A — out-of-frame HRA commission (verbatim)

> You are running the hack-rationalization-detector skill OUT OF FRAME. You did
> NOT write the change under review and you have NOT seen the implementer's
> reasoning. Treat any justification you find (commit message, comments,
> worklog) as the OBJECT OF SUSPICION, not as context to agree with.
>
> Run the skill at /home/bork/.claude/skills/hack-rationalization-detector —
> read its SKILL.md and references/known-cases.md fully, run
> scripts/grep_tells.py and scripts/enumerate_writers.py as the procedure
> directs, and produce the skill's EXACT output template, returned VERBATIM as
> your final message.
>
> CHANGE UNDER REVIEW — worktree
> /home/bork/w/omega/.claude/worktrees/agent-ad11d7ae3c8a80392, the single most
> recent commit (HEAD). Sub-project frontend/. Item
> preview-snapshot-shared-composable. [Full description: extraction of the cured
> hover-preview quartet — synchronous `previewNode` gate + fire-and-forget cache
> warm + `getSnapshotSync` accessor — into `usePreviewSnapshot`, migration of
> the hover-preview sites onto it, and retirement of the allegedly-orphaned
> `getThumbnailSvg` / `snapshotToSvg` API.] YOUR JOB — audit (1) whether the
> extraction is a GENERAL fix (one invariant single-sourced over all the sites
> that share it) or a partial/force-fit dressed as discipline: how many of the
> four named sites (TreeWidget, FloatingThumbnail/ChartPreviewBox host,
> ScoreLeadPanel, MergedDeltaPanel) actually migrated, which did NOT, and whether
> any non-migration is an honest divergence or a skipped generalization
> (read SidebarWidget + TreeWidget+FloatingThumbnail in full; independently
> enumerate every writer of every preview-gate slot); (2) whether
> `getThumbnailSvg`/`snapshotToSvg` is genuinely orphaned at HEAD (grep the
> entire frontend at HEAD~1 and HEAD for any consumer; confirm the retirement
> broke nothing). Verify the repointed seam test would FAIL under the old defect
> shape — don't trust the claim. Read-only; do not modify source, commit, touch
> the todo DB, or read backend/qeubo/. Return the skill's exact output template
> verbatim.

## Appendix B — out-of-frame HRA artifact (verbatim)

> ## Hack-rationalization review: 199549c8 (preview-snapshot-shared-composable)
>
> FRAME CHECK: Out-of-frame. I did not author this commit, did not see the
> implementer's reasoning except the committed worklog/commit-message, and
> treated those as the object of suspicion. The verdict and findings below are
> derived independently from the code at HEAD and HEAD~1 plus a live test run.
>
> GENERAL FIX:   For every surface that shows a hover/docked board thumbnail, the
> *visible* preview gate is written only synchronously; the only async work is a
> fire-and-forget cache warm that writes the shared snapshot cache and never the
> gate. (The change states this invariant correctly and single-sources it as a
> composable.)
> PATCH SHIPPED: Extracts the NodeId-keyed cured quartet into
> `usePreviewSnapshot(boardId)` + a gate-less `warmSnapshotAccessor` sub-unit;
> migrates the two chart panels (ScoreLeadPanel, MergedDeltaPanel) onto the full
> quartet and TreeWidget onto the sub-unit; repoints the seam test at the real
> composable; retires the genuinely-orphaned `getThumbnailSvg`/`snapshotToSvg`
> API and its three dead mock stubs.
> DOWNGRADE:     SidebarWidget's docked rail preview is left un-migrated. The
> cost named is concrete and real: its gate is `BoardId`-keyed over a *live*
> current node re-resolved per read (`getSnapshotSync(board.currentNodeId)`), not
> a captured `NodeId` — a genuinely different data shape the NodeId-keyed unit
> cannot express without a single-consumer second variant (ADR-0003 "extract a
> Port only when a second concrete consumer exists"). This is a cost, not a mood.
> The downgrade is honest *for SidebarWidget*. It does not, however, cover the
> unmentioned fifth site (see findings).
> WRITER DELTA:  Claimed: 4 sites, 3 gate slots (`previewNode`, FloatingThumbnail
> `visible`/`source`, `previewBoardId`). Enumerated: the 3 named gate slots check
> out — `previewNode` written only inside `usePreviewSnapshot.ts`
> (showPreview/reset, both synchronous; neither panel writes it directly
> post-migration); `visible`/`source` written only in FloatingThumbnail via
> synchronous `show()`/`hide()`; `previewBoardId` written only in SidebarWidget
> (onHoverEnter/onHoverLeave, synchronous). The cured invariant holds at all
> three. **But a fourth gate-pair exists that the change did not enumerate:**
> `startSnap`/`endSnap` in `MultiresolutionIntervalPanel.vue:58-59`, written via
> `startSnap.value = await getSnapshot(...)` (an awaited snapshot into *visible*
> state — the exact shape the change calls "the defect"). (writers:
> `usePreviewSnapshot.showPreview`/`reset`; FloatingThumbnail `show`/`hide`;
> SidebarWidget `onHoverEnter`/`onHoverLeave`; **MultiresolutionIntervalPanel
> `watch(hoveredCell)` — un-enumerated**)
> RUNTIME:       Reproduced + verified. `chart-panel-preview.seam.test.ts` passes
> (3/3) driving the real `usePreviewSnapshot`; the no-resurrection case is
> structurally guaranteed because `showPreview` writes the gate synchronously and
> fires `void getSnapshot` without an await-then-write — under the old `gate =
> await getSnapshot()` shape the released warm would repopulate the gate and the
> assertions would fail, so the guard distinguishes cured from defect. The three
> test files that lost `getThumbnailSvg` mock stubs pass (17/17), confirming the
> stubs were dead. Orphan retirement verified: at HEAD~1 the only non-doc
> references to `getThumbnailSvg`/`snapshotToSvg` were the definition, the
> export, the private callee, and three never-exercised mock stubs — zero
> production call sites; `renderBoardToSvg` remains legitimately used elsewhere
> (only the unused import was dropped).
>
> TELLS (Step 1): `grep_tells.py` on the full commit: 0 co-occurrence tells (13
> minimality-terms, 11 named-fix cues, none within window). The worklog's
> "Residue / decisions under ambiguity" section narrates each non-migration with
> a concrete data-shape cost rather than a discipline-word, so the laundering
> signature is absent from the prose. (Absence of a tell is not absolution —
> Step 2/4 carried the audit.)
>
> VERDICT: narrower-but-justified
>
> WHY: The extraction is a real generalization, not a force-fit: the invariant is
> stated once and single-sourced over the three NodeId-shaped gate slots, each
> independently confirmed to hold, and the seam test genuinely exercises the real
> unit and fails under the defect shape. SidebarWidget's non-migration cites a
> concrete different data shape (BoardId gate over a live current node), which is
> a cost and not a mood. The orphan retirement is verified consumer-less and
> breaks no test.
>
> FINDINGS BEYOND VERDICT (required):
>   - **A fifth hover-preview site was missed and unnamed:
>     `MultiresolutionIntervalPanel.vue`.** It writes `startSnap.value = await
>     getSnapshot(...)` / `endSnap.value = await getSnapshot(...)` — an awaited
>     snapshot into *visible* state, the precise shape the change defines as the
>     defect — cured not by the synchronous-gate invariant but by a separate
>     `hoverToken` latest-wins counter (`MultiresolutionIntervalPanel.vue:68-86`).
>     It is not currently a live bug (the leave path routes through the same
>     watcher and bumps the token, so an in-flight resolve bails), but it is a
>     structurally different cure that the change's "uniform across all the sites
>     that share it" / four-site frame silently excludes. Neither this worklog nor
>     the prior #424 worklog mentions it. This is the same *failed-to-generalize*
>     shape Case A warns about, one register milder: the unit covers the producers
>     it enumerated, and the un-enumerated producer survives on a parallel
>     mechanism. The honest move would have been to name it as a fifth site and
>     classify it (migrate-able accessor pair, or a documented token-guard
>     divergence) — not to leave it out of the census entirely.
>   - **The band-conformance precedent the change leans on is a dead key.** The
>     pre-existing `BAND_EXCEPTIONS` entry the commit cites as "the same shape as
>     the adjudicated TreeWidget → FloatingThumbnail exception" is keyed on
>     `src/components/board/FloatingThumbnail.vue` (check.mjs:205), but
>     FloatingThumbnail actually lives at `src/components/chrome/FloatingThumbnail.vue`
>     and TreeWidget imports it from `../chrome/`. That precedent key matches
>     nothing — it is inert. The check passes at the 47 baseline regardless
>     because a stale exception simply never fires, but the new exception's stated
>     justification ("identical in shape to the adjudicated precedent") rests on an
>     adjudication that is itself a no-op. Pre-existing defect, inherited by the
>     reasoning; worth a one-line fix to the stale path.
>   - The "uniform across both hover surfaces" claim in the TreeWidget and
>     FloatingThumbnail comments, and the worklog's "race-free by the same
>     invariant" line for SidebarWidget, are accurate for the three
>     migrated/in-place NodeId+BoardId gate slots — but the word "uniform"
>     overstates given the IntervalPanel token-guard variant. The invariant spans
>     four mechanisms across five sites; the code unit spans three sites. That gap
>     is exactly what the census should have surfaced.
>   - No residual concern on the retirement or the seam test beyond the above —
>     both check out cleanly and independently.

---

License: Public Domain (The Unlicense).
