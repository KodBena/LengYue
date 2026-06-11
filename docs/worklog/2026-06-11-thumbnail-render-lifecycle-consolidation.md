# Worklog — thumbnail render-lifecycle consolidation (2026-06-11)

> Delivery record for PR #413 (work-status item
> `thumbnail-render-lifecycle-consolidation`). The texture-flash
> investigation (2026-06-09) closed with a signpost: two thumbnail
> consumers rendered the same MiniBoard along different lifecycles, and a
> "shared" resource that was actually per-instance stayed latent until the
> remount-per-hover consumer arrived. This arc executes the consolidation
> the signpost named: one owned lifecycle for the shared render resources,
> and the hover surfaces unified on the #365 race-free shape.

## The change

- **One resource owner.** The new module
  `frontend/src/composables/cards/thumbnail-render-resources.ts` owns every
  shared MiniBoard render resource: the `BoardSnapshot` cache and its
  warmed-path guard (data layer), and the wood texture + stone-sprite store
  (paint layer — previously a plain-`<script>` block inside
  `MiniBoardCanvas.vue`, the PR #366 fix's location). A real `.ts` module is
  module-scoped *by construction*: the `<script setup>` per-instance footgun
  (the texture-flash class; syntactic guard
  `local/module-intent-in-script-setup`) is structurally inexpressible
  there, for every consumer lifecycle — persistent or remount-per-hover.
- **An explicit invalidation surface.** The owner exports the board-close
  purge (audit pair O4), the identity-flip purge (audit pair O9 — now also
  resetting the warmed-path guard it owns), and the **caller-less**
  `invalidateNodeSnapshots` hook: the latent applySetup obligation the
  hydration-residue audit recorded (§3.2 — node-content immutability holds
  only while `applySetup` stays caller-less). The obligation is documented
  at the hook *and* at `applySetup` itself, so the future setup-edit author
  meets it at the commit site. The store's purge imports re-point to the
  owner; `useThumbnailCache.ts` reduces to the fill/projection API
  (replay, sync read, SVG-string projection, path warm, variation labels).
- **The sprite cache key is branded.** `SpriteKey` (declaration in
  `src/types/game.ts`, sole factory `spriteKey` in the owner) names the
  sprite's full dependency set per the keyed-cache rule — `color`
  [domain-bound] × `rpx` [agnostic]. IDENTIFIERS.md row added.
- **The floating hover surface joins the #365 shape.** `FloatingThumbnail`
  drops the async `show(svg-string)` + v-html sink for a synchronous
  `show(() => BoardSnapshot | null, x, y)` accessor (the ChartPreviewBox
  accessor contract, ADR-0010 read-locality: the cache subscription lives in
  the leaf that displays it). The visible gate is set/cleared synchronously;
  the host's fire-and-forget warm writes only the shared cache — a late
  resolve can fill a visible thumbnail but can never resurrect a hidden one.
  Both hover surfaces (docked sidebar pane, floating tree preview) now share
  one shape: synchronous gate + derived snapshot + cache-only async. The
  80px anchor-radius / scroll / blur stranding backstops are unchanged.
  `TreeWidget.onToggleEnter` becomes synchronous; A/B variation labels are
  derived tree-structurally (`variationMarkerLabels`) and composed onto the
  cached snapshot. FloatingThumbnail re-bands B1→B3 (FILES.md).
- **Mount lifecycles deliberately not forced to one strategy.** The
  consolidation makes the shared-resource class indifferent to mount
  lifecycle (remount is flash-free by construction) rather than forcing
  persistent mounting — the #365-shaped, tested v-if behaviour of both hover
  panes is preserved.

## Felt behavior (runtime-verified, real pointer input)

Driven against the worktree dev build in real Chromium with real mouse
events: hover shows promptly (the synchronous replay fills within the same
microtask turn, so the first painted frame is typically already boarded);
a 3px in-radius jiggle holds; a clean leave hides via the host fast path;
the lost-`mouseleave` stranding repro (toggle `<g>` removed under a
stationary pointer, then pointer moved away) is cleared by the 80px
backstop; rapid enter/leave + 600ms shows no resurrection; A/B variation
labels render through the new snapshot path (verified on the SVG renderer;
the canvas renderer draws them as pixels); the sidebar docked pane (the
#365 surface, untouched by this arc) fills on hover and clears on leave.
Two earlier probe runs that *appeared* to show a dead backstop were probe
artifacts — Playwright's synthetic `dispatchEvent('mouseenter', {clientX})`
did not deliver coordinates, yielding a non-finite anchor — re-running with
fully real pointer input confirmed the backstop; recorded here so the next
prober doesn't re-pay it.

One user-visible nuance: the floating variation preview now honors
`appearance.miniBoardRenderer` like every other MiniBoard consumer
(previously it was always the string-SVG projection). FEATURES.md judgment:
no edit — the tour's "hovering surfaces a board-thumbnail preview" remains
accurate; the change is renderer plumbing, not capability.

## Verification

`npm run build` (vue-tsc strict + vite), `npx eslint .` (exit 0, all eight
local rules at error), `npm run test:run`: **932 passed** (13 new).
New tests:

- `tests/integration/thumbnail-render-resources.test.ts` — pins the
  load-bearing `ref(Map)` collection reactivity (previously only a comment;
  the #365 out-of-frame audit's finding 3), the invalidation surface
  (node-hook / O4 / O9 incl. warm-guard reset), one-wood-load semantics with
  waiter add/remove, and sprite-store sharing per `SpriteKey`.
- `tests/integration/FloatingThumbnail.seam.test.ts` — pins the seam
  invariants: synchronous show, reactive cache-miss fill without a second
  show, no async resurrection after hide, the 80px backstop, scroll/blur
  stranding watchers, viewport clamping, unmount listener release.
  (Component-mounting, but the narrow-exception genre: the assertions are on
  seam arbitration, not template output.)

Note re-derived at HEAD: the commission's "the #365 invariants are pinned by
tests" did not hold at the branch point — #365's evidence was runtime
Playwright, and committed coverage was the SVG parity + render-count guards.
The two suites above are the pinning, added by this arc.

## Perf battery null check (counts; no perf claims)

Per the capture-normalization protocol and the ADR-0009 count-based
Chromium comparable: `full-stress` (blinking popover + autonav +
clear_cache + streaming range analysis, SELECTOR :1235, model b10c128)
captured at the branch point and after, against the worktree dev build.

- Before: `~/w/vdc/chromium_profiles/full-stress-2026-06-11T14-44-30-811Z.json`
  (32.9 MB, 160785 events).
- After: `~/w/vdc/chromium_profiles/full-stress-2026-06-11T14-59-40-148Z.json`
  (31.6 MB, 155339 events).

Comparability proxies first: `autonav:step` **100 = 100** (navigation
volume identical); `rb3:handler` 137 → 106 (packet volume differs — the
documented cache-warmth/timing confound, so packet-coupled components are
compared only directionally). On the comparable axes: the thumbnail
pipeline is count-identical (ChartPreviewBox 204 = 204, MiniBoard
201 = 201, MiniBoardCanvas 201 = 201), TreeWidget 101 = 101 (the
consolidation added no hover/cache read to its render — the accessor
subscription lives in the FloatingThumbnail leaf), render/patch ratio 1.00
for every component in both captures (no render-coupling tell), mount
counts unchanged. The packet-coupled components (AnalysisChartPanel /
BaseChart 222→198, ScoreLead/MergedDelta 111→99, timeline/tooltip rows)
moved with their own packet volume in both directions. **Null result on
the comparable axes; no perf property is claimed for this change** — it
ships as a structural/ownership refactor, mirroring the texture-scope
fix's own verdict.

## Deferrals (ADR-0005 Rule 10)

- `useChartNavigation.handleMainHover` / `handlePlayerHover` are dead at
  HEAD (zero live consumers — the chart panels moved to snapshot accessors
  → ChartPreviewBox) and carry the last async-write-into-a-preview-ref
  shape; removing them would also orphan `getThumbnailSvg` /
  `snapshotToSvg` and their tests. Flagged in PR #413 for coordinator
  triage — not-filed: this worker's todo-DB access is read-only; the
  coordinator files or marks it at item closure.
- A guard against non-finite `show()` coordinates (which would disarm the
  radius backstop) — not-filed: unreachable from real pointer events
  (typed `number`; `clientX` is always finite); surfaced only by a
  synthetic-dispatch probe artifact, and a guard would be a speculative
  per-writer defence.
- A codebase-wide net for shared render resources of *other* classes
  declared per-instance outside SFCs — not-filed: zero current instances;
  the syntactic lint covers the paid-for `<script setup>` shape, and
  ADR-0011 Rule 3 (measure-first) argues against a mechanism with an empty
  baseline.
- `SpriteKey` gains a theme leg if stone sprite styling ever becomes
  themable — not-filed: no such theming exists or is planned; the brand
  declaration names the current legs precisely so that review happens at
  that moment.

## Appendix A — in-frame HRA commission (verbatim)

> Audit the uncommitted change on branch bork/refactor/thumbnail-render-lifecycle in worktree /home/bork/w/omega/.claude/worktrees/wf_d4be5d46-2e8-4 (diff vs HEAD 8cdf9f8d). The change consolidates the thumbnail render lifecycle: a new owner module frontend/src/composables/cards/thumbnail-render-resources.ts (snapshot cache + wood texture + sprite store + invalidation surface incl. a caller-less applySetup hook), useThumbnailCache.ts reduced to fill/projection API, FloatingThumbnail.vue switched from async v-html string to a synchronous show(accessor) + derived MiniBoard snapshot, TreeWidget's onToggleEnter made synchronous with a fire-and-forget warm. Item: thumbnail-render-lifecycle-consolidation.

## Appendix B — in-frame HRA artifact (verbatim)

**Frame caveat, stated before the artifact:** this run was executed by the
implementer (in-frame), as the wave commissioned — justification-as-suspect
mode, both deterministic scripts run, writers re-derived from code. Per the
skill's own rule a self-applied run is not a discharge; the verdict below is
provisional and the coordinator's out-of-frame pass before merge remains the
gate.

> ## Hack-rationalization review: thumbnail-render-lifecycle-consolidation (branch bork/refactor/thumbnail-render-lifecycle, diff vs 8cdf9f8d)
>
> FRAME CHECK: IN-FRAME — the auditor wrote the diff. This run is the wave's
> commissioned in-frame pass, executed in justification-as-suspect mode (the
> implementer's own reasoning treated as the object of suspicion, both
> deterministic scripts run, writers re-derived from code rather than memory).
> Per the skill's own rule a self-applied run cannot be trusted as a discharge:
> this artifact is evidence-gathering, NOT the gate. The coordinator's
> out-of-frame pass before merge remains required and is not discharged here.
>
> GENERAL FIX:   Every shared MiniBoard render resource (snapshot cache, wood
> texture, stone sprites) lives in ONE module-scope owner with an explicit
> invalidation surface quantified over its lifecycle events (board close,
> identity flip, node-content mutation) — and every hover-preview host sets and
> clears the preview's VISIBLE state synchronously, with async work permitted to
> write only the shared cache, never the gate.
>
> PATCH SHIPPED: A new owner module (composables/cards/thumbnail-render-resources.ts)
> holds the snapshot cache + warmed-path guard + wood texture + SpriteKey-keyed
> sprite store and the full invalidation surface (O4 board purge, O9 identity
> purge, and the caller-less `invalidateNodeSnapshots` applySetup hook, with the
> obligation cross-named at applySetup itself); useThumbnailCache.ts is reduced
> to the fill/projection API over it; MiniBoardCanvas's plain-`<script>` block is
> deleted in favour of the owner module; FloatingThumbnail switches from async
> `show(svg-string)` + v-html to a synchronous `show(() => BoardSnapshot | null)`
> accessor rendered via MiniBoard (the ChartPreviewBox accessor contract), with
> the 80px/scroll/blur stranding backstops unchanged; TreeWidget's onToggleEnter
> becomes synchronous with a fire-and-forget cache warm.
>
> DOWNGRADE:     Three deliberate narrowings, each with a concrete cost stated
> (none discharged on a discipline-word):
>   (1) useCardThumbnail's CardId-keyed SVG cache stays outside the owner module
>       — it is a different resource class (per-identity ECharts-tooltip string
>       cache, privacy-netted by O10, keyed by CardId not NodeId) with a
>       different invalidation contract; folding it in would merge two contracts
>       under one roof for no shared consumer.
>   (2) Mount lifecycles are not forced to a single persistent mount — the
>       consolidation instead makes the shared-resource class mount-lifecycle-
>       independent (remount is flash-free by construction), preserving the
>       #365-shaped, runtime-verified v-if behaviour of both hover surfaces.
>   (3) useChartNavigation's dead async hover handlers are left in place — they
>       are caller-less at HEAD (verified, see WRITER DELTA), the same composable
>       carries LIVE click handlers, and amputating the string projection chain
>       mid-PR would grow scope into a separately-reviewable removal. Recorded
>       as finding 1 with a deferral marker, not waved at.
>
> WRITER DELTA:  claimed = enumerated, on all three audited surfaces.
>   - Snapshot-cache producers: claimed 1 (getSnapshot → cacheSnapshot; warmPath
>     funnels through getSnapshot). Enumerated: `cacheSnapshot(` has exactly one
>     call site (useThumbnailCache.ts:98); the raw `snapshotCache` Map is written
>     nowhere outside the owner module (enumerate_writers.py: 1 site = the
>     declaration). Invalidation writers: store/index.ts:492 (closeBoard O4),
>     store/index.ts:565 (identity registry O9), plus the deliberately
>     caller-less hook (grep: zero callers — that IS its contract).
>   - FloatingThumbnail visible-state writers: show()/hide() in the seam; sole
>     imperative host TreeWidget (show at TreeWidget.vue:124, hide at :131; all
>     other `FloatingThumbnail`/`.show(` hits are comments). 1 claimed = 1 found.
>   - Paint-layer writers: ensureWood / stoneSprite write only inside the owner
>     module; no other module touches wood or sprite state.
>
> RUNTIME:       Reproduced + verified against the running app (real Chromium,
> real pointer events, worktree dev build): real hover shows the derived-snapshot
> thumbnail with A/B variation labels; 3px in-radius jiggle holds; far move
> hides; the lost-mouseleave repro (toggle element removed under a stationary
> pointer, then pointer moved away) is cleared by the 80px backstop; rapid
> enter/leave + 600ms shows no async resurrection; the sidebar docked pane
> (the #365 surface, untouched) still fills on hover and clears on leave. Note:
> two earlier probe runs that appeared to show a dead backstop were probe
> artifacts (Playwright dispatchEvent not carrying clientX → non-finite anchor),
> not app behaviour — re-run with fully real pointer input before concluding.
> Suite: build + eslint + 932 tests green, including 13 new tests pinning the
> owner module's contracts and the seam invariants.
>
> TELLS (Step 1): None. grep_tells.py over the full diff: 2 minimality-terms,
> 12 named-fix cues, 0 co-occurrence tells. The named-fix cues are the new
> module's deliberate ownership/invalidation vocabulary, not a named-then-
> downgraded alternative.
>
> VERDICT: general
> WHY: The change is statable as one invariant quantifying over all resources
> and all hosts (see GENERAL FIX), and the writer enumeration confirms no
> producer was modelled away: one cache producer, one imperative host, owner-
> module-only paint writers. The prior per-instance-vs-shared seam is removed
> structurally (a .ts module cannot express the `<script setup>` scope footgun),
> not gated per-consumer; the async-resurrection class is removed from the last
> live hover host by construction rather than guarded. In-frame caveat: this
> verdict is provisional by the skill's own rule and binds nothing — the
> out-of-frame pass is the gate.
>
> FINDINGS BEYOND VERDICT (required):
>   - **The last async-write-to-a-preview-ref shape survives as DEAD code.**
>     useChartNavigation's handleMainHover/handlePlayerHover write an awaited
>     `getThumbnailSvg` result into a caller-supplied `previewRef` — zero live
>     consumers at HEAD (chart panels moved to snapshot accessors →
>     ChartPreviewBox), but the exports and their tests remain. If a panel ever
>     rewires them, the async-fill-a-visible-string shape returns (though as a
>     fill-only ref, not a visible gate — resurrection needs a host that gates
>     visibility on the string). Removal would also orphan `getThumbnailSvg` +
>     `snapshotToSvg` entirely. Deferred: not-filed — this worker's todo-DB
>     access is read-only; flagged in the PR body for coordinator triage
>     (file-or-mark at item closure per ADR-0005 Rule 10).
>   - **The owner module covers the thumbnail resource class, not the codebase
>     class of shared render resources.** Nothing structurally prevents a future
>     shared resource of a different class being declared per-instance somewhere
>     else; the lint (`local/module-intent-in-script-setup`) catches only the
>     comment-claims-sharing shape inside `<script setup>`. Residual surface:
>     review + the lint, as before. No new net added here (would be
>     speculative: zero current instances).
>   - **Two mount lifecycles still exist** (persistent accessor consumers like
>     ChartPreviewBox vs v-if remount-per-hover panes). The consolidation made
>     the shared-resource class indifferent to mount lifecycle rather than
>     unifying the mounts themselves — "single shared rendering lifecycle"
>     should be read as "single resource-ownership lifecycle + single hover
>     shape", not "one mount strategy".
>   - **Non-finite show() coordinates would disarm the radius backstop**
>     (NaN distance compares false against r²). Unreachable from real pointer
>     events (clientX/clientY are always finite; the signature is typed
>     number), surfaced only by a synthetic-dispatch probe that dropped the
>     coordinates. not-filed: test-tooling artifact, no production path; a
>     guard would be a speculative per-writer defence.
>   - **SpriteKey's dependency set holds only while the sprite gradient stops
>     stay literal constants.** If stone styling ever becomes themable, the
>     theme becomes a key leg the brand declaration must gain — the declaration
>     names the two current legs precisely so this review happens at that
>     moment. not-filed: no theming of stone sprites exists or is planned.

---

License: Public Domain (The Unlicense).

---

*[Dated addition 2026-06-11, coordinator, per the out-of-frame gate artifact
(PR #413 comment): the FloatingThumbnail B1→B3 re-band minted a new advisory
band edge (TreeWidget [B2] → FloatingThumbnail [B3]) which the checker's
protocol requires adjudicating; adjudicated in the same fixup as a
dominant-concern BAND_EXCEPTIONS entry with reason. The gate also found the
async-write-into-preview-ref shape LIVE in ScoreLeadPanel/MergedDeltaPanel
(not extinguished as the in-frame artifact implied) — filed as work-status
item `chart-panel-preview-migration`.]*
