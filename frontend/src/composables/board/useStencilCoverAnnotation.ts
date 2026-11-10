/**
 * src/composables/board/useStencilCoverAnnotation.ts
 *
 * Raw-ledger source for the stencil-cover board overlay. The caller supplies
 * only the current node id; this leaf-local computed owns the packet-rate
 * ledger subscription per ADR-0010, rather than making BoardWidget read
 * stencilCover and re-render whenever analysis packets arrive.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, type ComputedRef } from 'vue';
import { ledger } from '../../state/analysis-ledger';
import { activeAnalysisKeys } from '../../state/analysis-config';
import type { StencilCoverAnnotation } from '../../engine/katago/types';
import type { NodeId } from '../../types';

/**
 * @param getCurrentNodeId Accessor so the current node and ledger version are
 *                         read inside this leaf's computed tracking scope.
 */
export function useStencilCoverAnnotation(
  getCurrentNodeId: () => NodeId,
): ComputedRef<StencilCoverAnnotation | null> {
  return computed(() => {
    const rawKey = activeAnalysisKeys.value.rawKey;
    return ledger.getRaw(rawKey, getCurrentNodeId())?.stencilCover ?? null;
  });
}
