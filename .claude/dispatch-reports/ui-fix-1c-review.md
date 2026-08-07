# Review — Fix 1c (EngineModelSelect leaf isolation)

Fresh-context, refute-posture review. Own runs, not the builder's self-report.

## Findings (WITNESSED)

1. **Leaf isolation traced by hand.** `EngineModelSelect.vue` reads only
   `store.engine.info.{availableModels,capabilities,internalName,modelsPayload}` and
   `store.engine.selectedModel`. Traced every writer of `store.engine.info` and
   `store.engine.selectedModel` (`grep -rn "engine\.info\s*="` /
   `setSelectedModel`): only `engine-connection.ts:131,142,156` (connect/disconnect/
   version-probe) and the explicit user-driven `setSelectedModel` mutator write these.
   The metrics tick's writers — `recordPacketRate`, `markWatchdogPingPending`,
   `recordWatchdogPong` (`engine-connection.ts:162-175`) — touch only
   `store.engine.metrics`, never `store.engine.info`/`selectedModel`. No reachable
   path from `ENGINE_METRICS_TICK_MS` to this leaf's render. WITNESSED.

2. **Render-count test.** Ran directly: `2/2 passing`. Zero-count assertion drives 6
   synthetic `store.engine.metrics` reassignments (fresh-object shape matching
   `startMetrics`) and asserts `EngineModelSelect`'s wrapped render count stays 0.
   Positive control flips `store.engine.info.availableModels` and asserts count
   ≥1 — red-for-the-right-reason is proven live, not just claimed. WITNESSED.

3. **Behavior parity.** Diffed old inline `<select>`/`<option>` markup against the
   extracted leaf: identical `v-for`, `:key`, `:value`, `:disabled`, `:title`,
   `@change` handler (including the `target.blur()` space-bar-focus workaround),
   and LEAF-mode fallback span — verbatim move, not a rewrite. Scoped styles
   duplicated correctly (component boundary blocks cascade). WITNESSED.

4. **ADR-0007.** `ToolbarEngineMetrics.vue` stays at 324 lines (pre-existing
   over-target, disclosed honestly, not worsened — this change only removes
   lines from it). Not newly introduced. WITNESSED.

5. **Gates, run independently in the worktree:** `npm run build` clean,
   `npx eslint .` clean (no output), `npm run test:run` → 91 files/1158 tests
   passed, 3 files/4 skipped (pre-existing). All match the builder's reported
   tails exactly. WITNESSED.

## VERDICT: ACCEPT

No defect found. The class-level fix is structurally sound — the leaf's render
effect has no reactive dependency on any metrics-tick-mutated state, confirmed
by tracing every writer, not just reading the builder's claim.
