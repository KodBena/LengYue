/**
 * src/composables/use-move-suggestions.ts
 * Refined Intensity Mapping: Normalized against max-visits of non-best moves.
 */

import { computed } from 'vue';
import { ledger } from '../services/analysis-ledger';
import { store } from '../store';
import type { KataAnalysisResponse } from '../engine/katago/types';
import type { StoneColor, NodeId } from '../types';
import { 
  BEST_MOVE_COLOR, 
  getIntensityColor, 
  CLUSTER_PALETTES 
} from '../engine/suggestion-colors';
import { groupMovesByCluster } from '../engine/analysis/clustering';
import type { PvMove } from './use-pv-animation';
import { activeConfigHash } from '../services/analysis-config';

const GTP_ALPHABET = 'ABCDEFGHJKLMNOPQRSTUVWXYZ';

export function gtpToBoard(gtp: string): { x: number; y: number } | null {
  if (!gtp || gtp.toLowerCase() === 'pass') return null;
  const letter = gtp[0].toUpperCase();
  const col = GTP_ALPHABET.indexOf(letter);
  if (col === -1) return null;
  const row = parseInt(gtp.slice(1), 10) - 1; 
  if (isNaN(row) || row < 0) return null;
  return { x: col, y: row };
}

export interface SuggestionDisk {
  x: number;
  y: number;
  color: string;
  isBest: boolean;
  winrateLabel: string;
  scoreLabel: string;
  moveIndex: number;
  clusterColor?: string;
  clusterId?: string | number;
}

/**
 * `getNodeId` is now typed as `() => NodeId` rather than `() => string`.
 * Every call site of this composable produces NodeIds (they come from
 * `currentNodeId` on the active board, or from the variation path); the
 * loose `string` return type was a signature lie. Tightening it pushes
 * the cast (where any caller has a plain string) to the call site
 * rather than to the ledger lookup here.
 */
export function useMoveSuggestions(
  getNodeId: () => NodeId
) {
  const packet = computed<KataAnalysisResponse | null>(() => 
    ledger.getRaw(activeConfigHash.value, getNodeId())
  );

  const compiledFilter = computed(() => {
    const exprString = (store.session.ui.moveFilterExpression as string) 
      || 'move.order === 0 || (move.visits / root.visits) >= ui.threshold';
    try {
      return new Function('move', 'root', 'ui', `return ${exprString};`);
    } catch (err) {
      console.error('[MoveFilter] Failed to compile expression:', err);
      return () => true; 
    }
  });

  const suggestions = computed<SuggestionDisk[]>(() => {
    const p = packet.value;
    if (!p || p.moveInfos.length === 0) return [];

    const filterFn = compiledFilter.value;
    const uiContext = { threshold: store.session.ui.moveFilterThreshold };

    // 1. First Pass: Filter visible moves
    const visibleMoves = p.moveInfos.map((info, moveIndex) => ({ info, moveIndex })).filter(({ info }) => {
      try { return filterFn(info, p.rootInfo, uiContext); } catch { return false; }
    });

    // 2. Identify Multi-Tenant Clusters (Transpositions)
    const clusters = groupMovesByCluster(visibleMoves.map(m => m.info));
    const multiTenantIds = Array.from(clusters.entries()).filter(([_, moves]) => moves.length > 1).map(([id]) => id);

    const clusterColorMap = new Map<string, string>();
    const numClusters = multiTenantIds.length;
    if (numClusters > 0) {
      const paletteKey = numClusters === 1 ? 2 : Math.min(numClusters, 16);
      const palette = CLUSTER_PALETTES[paletteKey];
      multiTenantIds.forEach((cid, index) => {
        clusterColorMap.set(cid, palette[index % palette.length]);
      });
    }

    // ─── 3. NEW: Normalized Intensity Calculation ───────────────────────────
    // We find the max visits among moves that are NOT the best move (order != 0).
    // This allows the color gradient to use its full range on the "runners up".
    const nonBestMoves = visibleMoves.filter(m => m.info.order !== 0);
    const maxNonBestVisits = nonBestMoves.length > 0 
      ? Math.max(...nonBestMoves.map(m => m.info.visits))
      : 0;
    // ───────────────────────────────────────────────────────────────────────

    // 4. Final Pass: Map to UI Disks
    return visibleMoves.flatMap(({ info, moveIndex }) => {
      const coords = gtpToBoard(info.move);
      if (!coords) return [];

      const isBest = info.order === 0;
      
      // Calculate 'z' (normalized visit ratio)
      let z = 0;
      if (!isBest && maxNonBestVisits > 0) {
        z = info.visits / maxNonBestVisits;
      }

      const color = isBest ? BEST_MOVE_COLOR : getIntensityColor.value(z);

      const winrateLabel = `${info.visits}`;
      const scoreLabel = (info.scoreLead >= 0 ? '+' : '') + info.scoreLead.toFixed(1);
      const clusterColor = info.clusterId !== undefined ? clusterColorMap.get(String(info.clusterId)) : undefined;

      return [{ ...coords, color, isBest, winrateLabel, scoreLabel, moveIndex, clusterColor, clusterId: info.clusterId }];
    });
  });

  function buildPvMoves(moveIndex: number): PvMove[] {
    const p = packet.value;
    if (!p) return [];
    const info = p.moveInfos[moveIndex];
    if (!info?.pv?.length) return [];
    const firstPlayer = p.rootInfo.currentPlayer;
    const moves: PvMove[] = [];
    for (let i = 0; i < info.pv.length; i++) {
      const coords = gtpToBoard(info.pv[i]);
      if (!coords) continue; 
      const color: StoneColor = i % 2 === 0 ? firstPlayer : (firstPlayer === 'B' ? 'W' : 'B');
      moves.push({ ...coords, color, moveNumber: i + 1 });
    }
    return moves;
  }

  return { suggestions, packet, buildPvMoves };
}
