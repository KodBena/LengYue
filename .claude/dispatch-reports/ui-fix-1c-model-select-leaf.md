# Fix 1c — model-select isolation leaf (`EngineModelSelect.vue`)

Docs read end-to-end before this work: `frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`,
`.claude/dispatch-reports/ui-fix-1b-diagnosis.md` (the spec for this task, with the
live-witnessed root cause), and — because the assigned worktree started on a stale
branch (see Hygiene) — `.claude/dispatch-reports/sgf-pass-diagnosis.md` for the
WITH-ENGINE connection method reused here.

## Design

`ToolbarEngineMetrics.vue` whole-renders on every `ENGINE_METRICS_TICK_MS` (1000ms)
store tick because the merged prior fix's 250ms `useThrottledSnapshot` throttle is
inert against a driving signal already slower than its own window (a trailing
throttle only coalesces bursts *faster* than the window). Per ADR-0010's
render-locality corollary, that whole-render touched the model `<select>`'s
`v-for` block regardless of whether the model actually changed, and Vue's
option-patch path re-touches every `<option>`'s `value` attribute
unconditionally on each patch — enough to make the browser's native
open-`<select>` popup redraw and drop the user's hover.

Class-level fix (per the diagnosis): give the model `<select>` its own
component instance with an independent render effect. `EngineModelSelect.vue`
(`frontend/src/components/chrome/EngineModelSelect.vue`, 128 lines) now owns
the whole MODEL slot — label, tooltip, SELECTOR-mode `<select>`, and the
LEAF-mode static-name fallback — reading directly off the store:
`store.engine.info.availableModels`, `store.engine.selectedModel`,
`store.engine.info.capabilities` (`isSelectorMode`), `store.engine.info.internalName`
(fallback), `store.engine.info.modelsPayload` (tooltip). None of these are
metrics-derived and none change on the tick. `ToolbarEngineMetrics.vue` mounts
it (`<EngineModelSelect />`) with **zero props** and no longer holds any of
this state itself — the `engineInternalName` / `isSelectorMode` / `availableModels`
/ `selectedModel` / `onSelectModel` / `modelTooltip` computeds and the `setSelectedModel`
import were removed from it entirely.

## Reference-stability audit

Zero props are passed from parent to leaf, so there is no "freshly-built array
each render" hazard to audit at the parent boundary — the usual failure mode
this task warned about (rebuilding the coupling via an unstable prop) cannot
occur here because nothing crosses the component boundary at all. Inside the
leaf, `availableModels` / `selectedModel` / `isSelectorMode` are each their
own `computed()` reading directly off `store.engine.info` / `store.engine.selectedModel`
— Vue's own dependency tracking (not object identity) governs whether the
leaf's *own* render re-runs, and none of its dependencies are touched by the
metrics tick. This is the same self-sourcing shape already used by
`EngineQueueTooltip.vue` and the pre-extraction `ToolbarEngineMetrics.vue`
itself (`useEngineControls()`), not a new pattern.

## Test status

`tests/integration/render-count/ToolbarEngineMetrics.render-count.test.ts`
(new). Property under test: "the metrics tick cannot re-render the select."
Mounts `ToolbarEngineMetrics` for real (SELECTOR-mode engine state seeded on
`store.engine.*`), wraps `EngineModelSelect`'s compiled `render` in a counting
shim via `vi.mock` (the child-component analog of `mountWithRenderCount`'s
technique — that harness only instruments a directly-mounted top-level
component, not a descendant), drives 6 synthetic metrics ticks via
fresh-object reassignment of `store.engine.metrics` (mirroring
`analysis-service.ts`'s `startMetrics` interval), and asserts the leaf's
render count stays exactly 0 across all six. A paired positive control flips
`store.engine.info.availableModels` and asserts the leaf's render count goes
to ≥1, so the counter is proven live (same discipline as
`BoardTab.render-count.test.ts`). No fake timers needed — the guarantee is
structural (an independent render effect with no dependency on the tick), not
timing-dependent.

Result: **2/2 passing.** Full suite: `npm run test:run` → 91 files / 1158
tests passing, 3 files / 4 tests skipped (pre-existing skips, unrelated).

## Live probe (WITNESSED)

Rebuilt (`npm run build`, clean), served `npx vite preview --port 4602` in the
worktree, connected a real KataGo SELECTOR proxy at `ws://127.0.0.1:1235`
(already running, matching `ui-fix-1b-diagnosis.md`'s and
`sgf-pass-diagnosis.md`'s WITH-ENGINE method), selected model `14`.

MutationObserver + IDL property-setter spy on `select.engine-model-select`
(same technique as `ui-fix-1b-diagnosis.md`'s live witness), dispatched
`mouseover`/`mouseenter` on the non-active `18` option, held 4.2s:

```
mutationCount: 0
valueWrites: 0
selectedIndexWrites: 0
```

**Zero mutations, zero IDL writes** — WITNESSED, versus the pre-fix session's
30 attribute mutations at ~1000ms period over the same class of window.

Connection liveness (WITNESSED via CDP WebSocket-frame capture, since this is
a production preview build with no `window.store` escape hatch): initial
`query_version`/`query_models` probe round-trip, then a watchdog
`query_version` ping (`wd-...`) fired and returned ~5s later — confirms the
connection was genuinely live and the analysis-service's periodic watchdog
plumbing (which feeds `metrics.value.latencyMs`/`pingPendingSince`, folded
into `ToolbarEngineMetrics`'s `liveMetrics`) was active during the probe
window. `PPS` stayed `0` (no active ponder/analyze query was running, so no
packet-rate signal) — this does **not** weaken the result: per the diagnosis
and `analysis-service.ts`'s `startMetrics`, the 1Hz `ENGINE_METRICS_TICK_MS`
interval reassigns `store.engine.metrics` to a fresh object unconditionally
while connected, independent of packet volume (the pre-fix session's own
mutation bursts were observed under exactly this idle-tick condition). That
specific claim — the interval's unconditional-reassignment behavior — is
established by reading `analysis-service.ts` (cited in `ui-fix-1b-diagnosis.md`,
not independently re-derived by static analysis this session — flagged per the
"claims carry witnesses" convention.

Screenshots + probe log:
`.claude/dispatch-reports/ui-fix-1c-01-advanced-registry.png` through
`ui-fix-1c-05-final-cleanup.png` (Advanced Registry engine-url field showing
the already-matching `ws://127.0.0.1:1235`, post-connect toolbar with
`VERSION v1.17.1` / `MODEL [14 ▾]` / watchdog dot, model selected, post-probe
state, final cleanup). Raw probe script (ephemeral, not committed):
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/probe-1c-final.mjs`.

## Hygiene (WITNESSED, with a disclosed incident)

- **Worktree base commit.** The assigned worktree started on a stale branch
  with no ancestry to `next` (missing the merged prior fix c0f3867e and every
  file this task's spec depends on, including the diagnosis report itself,
  which is untracked in the umbrella checkout). Reset the worktree branch to
  local `next` (`df64f5e5`) — confirmed by checksum-matching
  `ToolbarEngineMetrics.vue` against the main checkout before editing. Copied
  `.claude/dispatch-reports/` (untracked in the umbrella checkout) into the
  worktree so the diagnosis and prior-report corpus were actually available
  to read, per this fix's own "read before work" discipline.
- **Board-count incident, disclosed.** `frontend/CLAUDE.md`/`sgf-pass-diagnosis.md`
  note the SPA auto-authenticates as a shared `local_user` against a real
  backend (`localhost:8764`) also reachable by concurrent agent worktrees.
  During exploratory UI navigation (finding the Settings → Advanced Registry
  path before scripting the final probe), the shared workspace's board count
  grew from an initially-observed 9 to 13, and one intermediate cleanup
  attempt (closing what were believed to be self-created extra boards) showed
  a transient, unreliable count (17, then a stale-DOM read of up to 78) that
  did not survive a fresh page load — the real, settled count stabilized at
  13 and did not move again across the remainder of this session (confirmed
  by screenshot board-list at the start and end of the final probe run).
  Given concurrent multi-agent access to the same backend (other
  `worktree-agent-*` branches were visible in `git branch -a` during this
  session) and the risk the earlier close-clicks may have hit another
  session's boards rather than freshly-created ones, **no further bulk-close
  was attempted** — this is disclosed as an unresolved discrepancy rather
  than silently corrected. This task's actual test path (engine connect +
  model-select probe) touches no board at all, so no board was created or
  needed to be closed by the final, committed probe run itself.
- Engine URL: read as `ws://127.0.0.1:1235` at the start of this session's
  probing (already matching the target; no change made, so no revert
  needed). Disconnected at the end of the final probe run — confirmed via
  the final screenshot showing the `CONNECT` button restored.
- Preview server on port 4602: killed after the probe run; confirmed absent
  from `ss -ltnp` afterward.

## Gate tails

`npm run build` (`vue-tsc -b && vite build`):
```
✓ 1087 modules transformed.
dist/index.html                     0.84 kB
dist/assets/index-BDKrobdM.css    116.65 kB
dist/assets/index-B2V089oe.js   2,925.15 kB
✓ built in 2.04s
```
(pre-existing >500kB chunk-size warning, unrelated to this change)

`npx eslint .`: clean, no output.

`npm run test:run`:
```
Test Files  91 passed | 3 skipped (94)
     Tests  1158 passed | 4 skipped (1162)
```

## Files

- `frontend/src/components/chrome/EngineModelSelect.vue` — new leaf (128
  lines).
- `frontend/src/components/chrome/ToolbarEngineMetrics.vue` — MODEL-slot
  state/markup removed, mounts the leaf; header + inline comments updated to
  explain the split and correct the prior (inert) throttle-based
  explanation. Still 324 lines — over the ADR-0007 ≤250 target; this was
  already true before this change (331/365 lines pre-fix) and is not newly
  introduced, but is not resolved here either (out of this task's declared
  scope; flagged honestly rather than silently left uncommented).
- `frontend/FILES.md` — new row for `EngineModelSelect.vue`; updated row for
  `ToolbarEngineMetrics.vue`.
- `frontend/tests/integration/render-count/ToolbarEngineMetrics.render-count.test.ts`
  — new render-count regression guard.

License: Public Domain (The Unlicense)
