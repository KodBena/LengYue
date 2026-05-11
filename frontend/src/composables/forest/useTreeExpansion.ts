/**
 * src/composables/forest/useTreeExpansion.ts
 * Expansion state logic: Default = Variations Hidden.
 */
import { ref, type Ref } from 'vue';
import type { GameNode } from '../../types';

export interface TreeExpansionState {
  readonly expandedNodes: Ref<ReadonlySet<string>>;
  readonly isExpanded: (nodeId: string) => boolean;
  readonly toggle: (nodeId: string) => void;
  readonly expandMany: (nodeIds: readonly string[]) => void;
  readonly collapseAll: () => void;
  readonly focusPath: (nodes: Record<string, GameNode>, activePath: readonly string[]) => void;
}

export function useTreeExpansion(): TreeExpansionState {
  // Now tracks nodes that ARE showing variations. Default empty = all collapsed.
  const expandedNodes = ref<ReadonlySet<string>>(new Set<string>());

  const isExpanded = (nodeId: string): boolean =>
    expandedNodes.value.has(nodeId);

  const toggle = (nodeId: string): void => {
    const next = new Set(expandedNodes.value);
    if (next.has(nodeId)) {
      next.delete(nodeId);
    } else {
      next.add(nodeId);
    }
    expandedNodes.value = next;
  };

  const expandMany = (nodeIds: readonly string[]): void => {
    const next = new Set(expandedNodes.value);
    for (const id of nodeIds) next.add(id);
    expandedNodes.value = next;
  };

  const collapseAll = (): void => {
    expandedNodes.value = new Set<string>();
  };

  // The `nodes` parameter is declared to match the TreeExpansionState
  // interface (callers pass the full node map so a future implementation
  // can walk siblings/parents when computing "interesting" expansions).
  // The current implementation only uses `activePath`, so `nodes` is
  // underscore-prefixed to signal intentional non-use without breaking
  // the contract.
  const focusPath = (_nodes: Record<string, GameNode>, activePath: readonly string[]): void => {
    // In this "Default Collapsed" world, focusPath might simply clear everything 
    // or expand only the nodes on the path that have siblings.
    // For now, let's make it expand every node on the current path.
    expandedNodes.value = new Set(activePath);
  };

  return { expandedNodes, isExpanded, toggle, expandMany, collapseAll, focusPath };
}
