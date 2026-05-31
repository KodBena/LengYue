/**
 * src/composables/analysis/useMistakeFinder.ts
 *
 * Calculated property over per-move deltas: which moves are
 * mistakes (above the per-board severity quantile) and which
 * mistakes were left unpunished by the opponent's immediate
 * follow-up. Pure-ish composable — reads reactive inputs (the
 * active palette, the appearance.mistakeFinderThresholdQuantile
 * knob value, the per-board enriched delta series) and returns
 * a ComputedRef<MistakeMarker[]>; no effects.
 *
 * ── Orientation ──────────────────────────────────────────────────
 * The palette's `delta_ordering` flag declares which direction
 * of its `delta_fn`'s output counts as worse — the substrate is
 * intentionally non-opinionated about sign across palettes
 * (quality palettes emit goodness in [0, 1] where higher = better;
 * score-loss palettes emit positive-as-loss). We multiply by an
 * orient factor so post-orientation "higher = worse" holds
 * uniformly downstream. See
 * `docs/notes/mistake-finder-design-space.md` §Option α.
 *
 * ── Threshold ────────────────────────────────────────────────────
 * Quantile-based per-board: the worst Q proportion of the
 * board's observed moves (across both colours, pooled) qualify
 * as mistakes. A constant-magnitude threshold would not compose
 * across palettes whose delta_fn outputs live on different
 * scales; quantile sidesteps that and matches the design note's
 * "threshold is a knob" framing.
 *
 * ── Un-punished red-flag ──────────────────────────────────────────
 * Pedagogy requirement from
 * `docs/notes/mistake-finder-pedagogy-and-followups.md` §API
 * implications: a user-mistake whose opponent did not punish
 * (the next move is also a mistake) deserves emphasis the user
 * cannot accidentally hide. Detected as "mistake at
 * chronological ply P AND mistake at chronological ply P+1";
 * the earlier one is flagged. Always-on by design — no toggle.
 *
 * ── Chronological ply convention ──────────────────────────────────
 * The merged chart's x-axis is parity-interleaved: black's K-th
 * colour-local move sits at x=2K, white's at x=2K+1. The
 * `MistakeMarker.ply` field uses the same convention so the
 * consumer can place each dot at the correct chart x without
 * re-deriving the interleaving.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed, type ComputedRef, type Ref } from 'vue';
import { store } from '../../store';
import type { EnrichedResult } from './useEnrichedData';

export interface MistakeMarker {
  /** Chronological ply on the parity-interleaved merged axis. */
  ply: number;
  /** Player whose move this is. */
  color: 'B' | 'W';
  /** Colour-local move index (K such that ply = 2K for B, 2K+1 for W). */
  colorLocalIdx: number;
  /** Raw delta_fn output at this move — for chart-y placement. */
  deltaValue: number;
  /** Severity ∈ [0, 1], normalised to the per-board oriented range. */
  severity: number;
  /** True if the immediately-following opponent move is also a mistake. */
  unpunished: boolean;
}

export function useMistakeFinder(
  // Accepts any Ref — `useEnrichedData` now returns a shallowRef (incrementally
  // maintained) rather than a computed; the read contract is identical.
  enriched: Ref<EnrichedResult>,
): ComputedRef<MistakeMarker[]> {
  return computed<MistakeMarker[]>(() => {
    const env = store.profile.settings.engine.katago.analysis_env;
    const palette = env.palettes.find(p => p.id === env.activePaletteId);
    if (!palette) return [];

    const quantile = store.profile.settings.appearance.mistakeFinderThresholdQuantile;
    if (quantile <= 0) return [];

    // After orient multiplication, "higher = worse" holds uniformly:
    // 'lower_is_worse' palettes (quality, rank) emit goodness; negate.
    // 'higher_is_worse' palettes (score_loss) emit loss-as-positive; pass through.
    const orient = palette.delta_ordering === 'lower_is_worse' ? -1 : 1;

    type Row = {
      ply: number;
      color: 'B' | 'W';
      colorLocalIdx: number;
      raw: number;
      oriented: number;
    };
    const rows: Row[] = [];

    const blackData = enriched.value.deltaSeries.black[0]?.data ?? [];
    const whiteData = enriched.value.deltaSeries.white[0]?.data ?? [];

    for (const [k, v] of blackData) {
      if (v === null) continue;
      rows.push({ ply: 2 * k, color: 'B', colorLocalIdx: k, raw: v, oriented: orient * v });
    }
    for (const [k, v] of whiteData) {
      if (v === null) continue;
      rows.push({ ply: 2 * k + 1, color: 'W', colorLocalIdx: k, raw: v, oriented: orient * v });
    }

    if (rows.length === 0) return [];

    // Per-board observed oriented range — drives severity normalisation
    // (so the gradient encoding is relative to *this game's* spread,
    // not an absolute scale that would be saturated by any one wild
    // move). A degenerate (range = 0) board gets severity = 0 across
    // the board, which is honest: every move was equivalent under the
    // palette's signal.
    const orientedValues = rows.map(r => r.oriented);
    const minOriented = Math.min(...orientedValues);
    const maxOriented = Math.max(...orientedValues);
    const range = maxOriented - minOriented;

    // Quantile threshold: the (1 - quantile)-th percentile of oriented
    // values. Moves with oriented >= threshold qualify as mistakes.
    // Tied values at the threshold all pass — acceptable; the UI
    // intent is "approximately the worst N%", not "exactly N%".
    const sortedAsc = [...orientedValues].sort((a, b) => a - b);
    const thresholdIdx = Math.min(
      Math.floor(sortedAsc.length * (1 - quantile)),
      sortedAsc.length - 1,
    );
    const threshold = sortedAsc[thresholdIdx];

    const mistakeRows = rows
      .filter(r => r.oriented >= threshold)
      .sort((a, b) => a.ply - b.ply);

    const mistakePlies = new Set(mistakeRows.map(r => r.ply));

    return mistakeRows.map(r => ({
      ply: r.ply,
      color: r.color,
      colorLocalIdx: r.colorLocalIdx,
      deltaValue: r.raw,
      severity: range > 0 ? (r.oriented - minOriented) / range : 0,
      unpunished: mistakePlies.has(r.ply + 1),
    }));
  });
}
