/**
 * src/engine/analysis/kernels.ts
 * Pure functions for extracting single data points from an analysis sequence.
 * License: Public Domain (The Unlicense)
 */

import type { MetricKernel } from '../../services/analysis-ledger';

// FIX: Defensive optional chaining all the way down
export const scoreLead: MetricKernel = (seq, i) => {
  return seq[i]?.rootInfo?.scoreLead ?? null;
};

export const pointLoss: MetricKernel = (seq, i) => {
  if (i === 0) return 0;
  
  const current = seq[i]?.rootInfo?.scoreLead;
  const prev = seq[i - 1]?.rootInfo?.scoreLead;
  
  if (current == null || prev == null) return null;
  
  // Point loss is the drop in scoreLead relative to the current player's perspective
  const currentPlayer = seq[i]?.rootInfo?.currentPlayer;
  if (!currentPlayer) return null;

  const delta = current - prev;
  // If Black just played (i.e., it is now White's turn), Black's point loss is negative delta.
  return currentPlayer === 'W' ? -delta : delta;
};
