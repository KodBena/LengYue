/**
 * src/types/analysis-env.ts
 *
 * Analysis-palette / analysis-environment vocabulary: the
 * user-authored palette shape (`AnalysisPalette`), the per-parameter
 * qEUBO-calibration metadata (`ParameterMeta`), and the
 * `AnalysisEnvironment` container persisted under
 * `AppSettings.engine.katago.analysis_env`. The palette subsystem is
 * the `'palette'` knob domain (see `types/knobs.ts`); qEUBO is one
 * consumer of it (see `types/qeubo.ts`). Carved from the single-file
 * `src/types.ts` (2026-06-10, history-lessons audit §3.15); bodies
 * are verbatim from the pre-split file.
 *
 * License: Public Domain (The Unlicense)
 */

// AnalysisPalette is mutated through the PaletteEditor.
//
// `delta_ordering` declares which direction of `delta_fn`'s output
// counts as worse (a mistake). SPA-side consumer-only — the proxy
// emits `extra.<color>.deltas` as the user-authored `delta_fn`
// returns it; this flag tells consumers (mistake-finder, future
// ranking composables) how to orient those scalars for severity.
// The substrate stays non-opinionated about `delta_fn`'s sign
// convention; the flag records the palette author's choice.
// See `docs/notes/mistake-finder-design-space.md` §Option α.
export interface AnalysisPalette {
  id: string;
  name: string;
  delta_fn: string;
  delta_ordering: 'lower_is_worse' | 'higher_is_worse';
  summary_fn: string;
  state_fns: Record<string, string>;
}

// Per-parameter metadata for the qEUBO calibration loop. Authored
// via the PaletteEditor's Analysis Environment view; mutated in
// place. `range` is required when `qeubo_controlled` is true (the
// optimizer needs both endpoints to map [0, 1]^d → actual values);
// the editor surfaces a validation error when the contract is
// violated, per ADR-0002. Parameter declarations not under qEUBO
// control may still carry a range for documentation, or carry
// neither field. Snake_case matches the surrounding analysis_env
// subtree convention (sibling to `parameters`, `symbols`).
export interface ParameterMeta {
  range?: [number, number];
  qeubo_controlled?: boolean;
}

export interface AnalysisEnvironment {
  symbols: Record<string, string>;
  parameters: Record<string, number>;
  parameter_meta?: Record<string, ParameterMeta>;
  palettes: AnalysisPalette[];
  activePaletteId: string;
}
