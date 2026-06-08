/**
 * src/composables/analysis/useEnrichedData.ts
 * Reactive transformation of enriched KataGo data — incrementally maintained.
 *
 * ## Design
 *
 * This composable accepts a reactive path (`Ref<NodeId[]>`) and returns a
 * `Ref<EnrichedResult>` derived from each path node's merged analysis packet.
 *
 * The derivation is O(path length). The prior shape was a `computed` that
 * re-ran the whole pass whenever *any* path node received a packet — and the
 * chart watchers access it eagerly every frame, so under a packet flood it
 * re-derived the entire game per frame (the dominant per-packet reactive cost
 * in the combined-stress profile: ~N `ledger.getRaw` reactive reads × per
 * frame). A `computed` cannot be made incremental — it recomputes wholesale on
 * access-while-dirty.
 *
 * So the derivation moves into a pure `EnrichedAccumulator` and the reactivity
 * is split:
 *
 *   - **Structural changes** (path, config hash, active-palette state_fn names,
 *     theme) → `watch` → full `rebuild`. Rare; O(N) is fine here.
 *   - **Per-node data changes** → the ledger's `onLedgerFlush` changed-key
 *     signal → `patchNode` on just the node(s) that moved → O(1). This reads
 *     `getRaw` for *only* the changed node, not all N, which is the win.
 *
 * The output is a `shallowRef`; each batch publishes a fresh `EnrichedResult`
 * reference so downstream consumers (charts) detect the change. The projection
 * stays exactly live — no throttle, no shown-vs-live asymmetry — and the
 * incremental path is pinned byte-equal to the full rebuild by
 * `enriched-accumulator.test.ts`.
 *
 * Note the per-node version refs in the ledger remain the reactive surface for
 * *other* `getRaw` consumers (move suggestions, wait-for-analysis, the
 * timeline visit vector); this composable simply no longer subscribes to them,
 * driving off the changed-key signal instead.
 *
 * License: Public Domain (The Unlicense)
 */

import { shallowRef, watch, onUnmounted, type Ref } from 'vue';
import { ledger, onLedgerFlush } from '../../services/analysis-ledger';
import { store } from '../../store';
import { type NodeId } from '../../types';
import { activeAnalysisKeys } from '../../services/analysis-config';
import {
  EnrichedAccumulator,
  EMPTY_ENRICHED,
  type EnrichedResult,
} from './enriched-accumulator';

// Re-export the output contract so existing consumers importing it from here
// (e.g. useAnalysisContext) keep compiling unchanged.
export type { EnrichedResult, EnrichedSeries } from './enriched-accumulator';

/** The active palette's state_fn names — the series-seed set. */
function activeSeedNames(): string[] {
  const env = store.profile.settings.engine.katago.analysis_env;
  const palette = env.palettes.find(p => p.id === env.activePaletteId);
  return palette ? Object.keys(palette.state_fns) : [];
}

export function useEnrichedData(pathIdsRef: Ref<NodeId[]>): Ref<EnrichedResult> {
  const acc = new EnrichedAccumulator();
  const out = shallowRef<EnrichedResult>(EMPTY_ENRICHED);

  // Full rebuild for a structural change. Reads getRaw for every path node —
  // but only on structural changes (nav / config / palette / theme), not per
  // packet.
  function rebuild(): void {
    const { rawKey, enrichedKey } = activeAnalysisKeys.value;
    acc.reset({
      pathIds: pathIdsRef.value,
      seedNames: activeSeedNames(),
    });
    acc.rebuild((nodeId) => ledger.getCombined(rawKey, enrichedKey, nodeId));
    out.value = acc.snapshot();
  }

  // Structural-change watcher. The palette seed set is reduced to a stable
  // string (JSON.stringify) so the watch fires only when the *names* change,
  // not on every analysis_env mutation. JSON.stringify rather than a join: the
  // seed names are display strings that contain spaces ("Win Probability",
  // "Score Advantage"), so a space- (or any printable-char-) joined signal
  // could collide; JSON escaping makes the signal unambiguous.
  // Watch the enriched key (not both keys): it is a function of palette +
  // overrides + model, so it changes on ANY structural change that also moves
  // the raw key (raw = overrides + model ⊆ enriched) — watching it alone
  // catches every rebuild trigger while keeping a primitive (string) compare.
  watch(
    [pathIdsRef, () => activeAnalysisKeys.value.enrichedKey, () => JSON.stringify(activeSeedNames())],
    rebuild,
    { immediate: true },
  );

  // Per-node incremental patching, driven by the ledger's changed-key signal.
  const stopFlush = onLedgerFlush((changedKeys) => {
    const { rawKey, enrichedKey } = activeAnalysisKeys.value;
    let dirty = false;
    for (const key of changedKeys) {
      // key = `${key}:${nodeId}` where the key-part is EITHER the raw or the
      // enriched key (the two spaces are disjoint strings). Split on the first
      // ':' (keys carry none, NodeIds are UUID-style) and accept a change to
      // either store for this node; `getCombined` re-reads both so the patch
      // reflects the current raw + enrichment view regardless of which moved.
      const sep = key.indexOf(':');
      if (sep < 0) continue;
      const keyPart = key.slice(0, sep);
      if (keyPart !== rawKey && keyPart !== enrichedKey) continue;
      const nodeId = key.slice(sep + 1) as NodeId;
      if (acc.patchNode(nodeId, ledger.getCombined(rawKey, enrichedKey, nodeId))) dirty = true;
    }
    if (dirty) out.value = acc.snapshot();
  });

  onUnmounted(stopFlush);

  return out;
}
