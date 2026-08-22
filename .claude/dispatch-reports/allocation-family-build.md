# Allocation-family closing-arc build

Worktree: `agent-a76a3b01b4d504c48`, branch reset to `lyt-phase2` tip
`2be85ff6` at session start (the worktree had started stale at
`3378806f`, well behind — reset via `git reset --hard 2be85ff6`, no
uncommitted work lost). Commit: `d3f13762`.

## Gate results (literal)

- `nice -n 19 npm run build` (`npm --prefix frontend run build`,
  `vue-tsc -b && vite build`): **exit 0**, confirmed on the final
  commit's tree.
- `vitest run --changed=2be85ff6 --maxWorkers=2`: attempted three
  times (once at `--maxWorkers=2` foregrounded-then-backgrounded, once
  redirected to a log at `--maxWorkers=2`, once at `--maxWorkers=1`
  after killing a leftover `vite` dev server of my own to free
  memory). All three were killed before producing a `Test Files`
  summary line (exit 143 / SIGTERM on the completed ones) — the box
  was at 7.6Gi/9.6Gi RAM used and 2Gi/4Gi swap used at the time, with
  five-plus sibling agents' own `vitest`/`vite`/`fastapi` processes
  running concurrently (`ps aux` at the time is in this session's own
  transcript). Per the commissioner's mid-session policy change
  (machine-health directive), the delivery gate for this build is
  **build-only**; I killed the in-flight vitest run and did not rerun
  it. **New/changed test files below ship uncommitted-verified** — the
  orchestrator's own centralized post-merge vitest run is the
  authoritative check for them.
- `eslint` (informational, not a required gate): ran clean (no output)
  against every changed `.ts`/`.vue` file.

## Item 1 — card-tree orientation auto-derives from its container: DONE

The Lineage Explorer's card-tree (`CardTreeWidget.vue`, hosted by
`ForestDirectory.vue`) used to default to a fixed `'vertical'`
orientation via a component-local, unpersisted `ref` — regardless of
the container's own shape. The maintainer's own remedy (a manual
"⇕ VERTICAL" toggle) already existed; this build makes the *default*
auto-derive from the tree/card-editor container's aspect ratio and
turns the manual toggle into an override of that derived value.

**New composable**: `frontend/src/composables/chrome/
useContainerAspectOrientation.ts` — `useElementWidth.ts`'s sibling,
generalized to both axes. `derivedOrientation` is `'horizontal'` when
`widthPx >= heightPx` (wide-or-square), `'vertical'` otherwise;
synchronous first-measurement at `observe()` time (no one-tick default
flash), `ResizeObserver`-driven afterward, released via `stop()`.

**`ForestDirectory.vue`**: `.tree-panel` (the container hosting the
chart + the side-by-side metadata panel at wide/vast width classes) is
now the `ResizeObserver` target. `orientation` is a computed:
`store.session.ui.cardTreeOrientationOverride ?? derivedOrientation`.
The panel-header button now cycles a three-state override — auto ->
horizontal -> vertical -> auto — rather than a two-state flip, since
the field now expresses three real choices.

**Persistence**: new field `session.ui.cardTreeOrientationOverride:
'horizontal' | 'vertical' | null` (schema-version 78). Migration
`77 -> 78` in `migrations.ts` backfills `null` (no legacy predecessor —
the pre-78 toggle was never persisted at all). Per the rolling-archive
discipline (`migrations.ts`'s own header — keep exactly the latest two
migrations as style anchors), the `75 -> 76` body moved to
`archived-migrations.ts`; that file's own scope-header comment is
updated to match (`1 -> 2` through `75 -> 76`).

**i18n**: two new keys (`cards.lineage.switchToAuto`,
`cards.lineage.orientationAuto`) added to `en.json`/`ko.json`/
`ja.json`/`zh-CN.json`.

**Tests** (new, uncommitted-verified per the build-only gate above):
- `frontend/tests/integration/useContainerAspectOrientation.test.ts` —
  derivation rule (wide/tall/square-tie), live `ResizeObserver`
  re-derivation, the 0×0 unmeasured-callback guard, and `observe`/
  `stop` resource lifecycle. Mirrors
  `useDeferredContainerBreakpoint.test.ts`'s `FakeResizeObserver`
  pattern (jsdom's own `ResizeObserver` stub never invokes its
  callback).
- `frontend/tests/unit/store/migrations.test.ts` — new `describe('77
  → 78: …')` block: backfill-to-null, idempotent preservation of a
  valid override, replacement of an invalid value, no-op on a partial
  blob, and an end-to-end `migrate()` walk from v77 to
  `CURRENT_SCHEMA_VERSION`.

**FILES.md**: entry added for the new composable.

**Not done in this pass**: a live-witness screenshot confirming the
fix visually at the maintainer's own fd2a geometry — the dev server I
launched for this purpose (`vite --port 5183`) was killed to relieve
memory pressure per the machine-health directive before a screenshot
was taken. The unit-level contract pins the derivation rule; a visual
confirmation is a reasonable follow-up but not, on the evidence
available, load-bearing for correctness.

## Items 2, 3, 4 — investigated, not further changed

**Item 2 (board vertical space)** and **item 3 (S2 — engine/action
toolbar allocation)** and, by strong inference, **item 4 (S3 — Cards
content-column void)** all trace, on inspection, to the SAME
mechanism this branch's own most recent merges already repaired:

- `frontend/src/state/feasible-layout.ts`'s `resolveRootSplitLiveLayout`
  (GAP A, dispatch `lyt-cure-final-repair.md`, already on `lyt-phase2`
  before this session started) computes `boardUsefulPx = max(0,
  rowHeightPx - board.fixedSiblingSumPx)` — the board's aspect-locked
  useful width bounded by the row's own *available height*, live-
  measured — and its own header names this as the fix for "the board
  hoarding past its own useful ceiling," i.e. exactly item 2's
  symptom.
- The SAME function's "Ledger row 2511 pragmatic repair" comment block
  explicitly states the side column's compiled `board-priority-clamp`
  ceiling (820px) no longer binds — "the ONLY ceiling that still
  binds is the board's own hard floor" — and names **both** "S2's
  `.engine-controls` frozen at 265px and S3's Cards content column
  frozen at 664px" as tracing back to that same static ceiling, now
  removed. `A_engine_controls`'s own compiled track
  (`lyt-layout.gen.ts`) is `elastic minPx:185 frWeight:1`, so once the
  side column can genuinely widen, that leaf's CSS Grid `1fr` share
  should widen with it.
- Commit `83a1a903` (already on this branch before I started, message:
  "…disclosed DSL bypass per row 2511") and the branch tip `829e952c`
  ("cure final repairs — root split through the authority… vh-unit
  guard, screen-class reactivity with window-resize fallback for the
  dead-observer mechanism") both predate this session and read as
  directly targeting these three symptoms.

**The concrete blocker**: I could not get a live screenshot to confirm
this reading against the maintainer's actual geometries (fd2a/e518/
9440/z-toolbar-1920) before the machine-health directive required
killing the dev server I'd started for that purpose, and the box's
resource contention (documented above) made a second attempt
irresponsible given the directive's intent. Static code reading is
strong evidence these three items are already resolved by code
already merged into `lyt-phase2` ahead of this session, but I am
declining to either (a) claim they're fixed without having watched
them render, or (b) make speculative further edits to this
extensively-reviewed, sovereignty-sensitive layout core on no more
than a plausible reading — either would be the wrong kind of
confidence for code this dense with prior review history.

**Recommended next step**: a live-witness pass (screenshot the four
maintainer geometries against current `lyt-phase2` tip) once the
machine has headroom, to either close items 2/3/4 as "already fixed,
confirmed" or surface a residual gap precisely.
