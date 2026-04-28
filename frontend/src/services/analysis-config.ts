/**
 * src/services/analysis-config.ts
 * Pure utilities for compiling and hashing the Analysis Environment.
 *
 * The qEUBO audition (toggle Applied / A / B in the toolbar) flows
 * through the `parameters` field below. When an experiment exists
 * and the toolbar is in 'A' or 'B' mode, the corresponding pair's
 * decoded values overlay `env.parameters`; the engine sees the
 * audition without the audition being persisted. `activeConfigHash`
 * is reactive on this overlay so analyses re-issue automatically
 * when the user toggles the audition. See `useQeubo.ts` for the
 * computed (`effectiveParameterValues`) the overlay is derived from.
 *
 * License: Public Domain (The Unlicense)
 */

import { computed } from 'vue';
import { useQeubo } from '../composables/useQeubo';
import { store } from '../store';

const qeubo = useQeubo();

/**
 * Compiles the frontend AnalysisEnvironment into the wire-format analysis_config
 */
export function compileAnalysisConfig() {
  const env = store.profile.settings.engine.katago.analysis_env;
  if (!env || !env.palettes) return undefined;

  const activePalette = env.palettes.find(p => p.id === env.activePaletteId) || env.palettes[0];
  if (!activePalette) return undefined;

  // qEUBO audition: when an experiment is active, the composable's
  // `effectiveParameterValues` is the source of truth for what the
  // engine should see. It already overlays the pair's A/B values on
  // env.parameters when toolbarView is 'A' / 'B'; falls through to
  // env.parameters unchanged when 'applied' (or when no pair is
  // loaded). When no experiment exists, we read env.parameters
  // directly to avoid the spread copy on every analysis.
  const parameters = qeubo.experimentExists.value
    ? qeubo.effectiveParameterValues.value
    : env.parameters;

  // Explicitly ordered to maximize deterministic JSON.stringify
  return {
    bindings: {
      delta_fn: activePalette.delta_fn,
      state_fns: activePalette.state_fns,
      summary_fn: activePalette.summary_fn
    },
    parameters,
    symbols: env.symbols
  };
}

/** Fast, deterministic DJB2 hash for the config string */
export function hashConfig(config: any): string {
  if (!config) return 'default';
  const str = JSON.stringify(config);
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

/** 
 * A reactive computed for UI composables to track the current active hash.
 * Changes instantly when a palette is swapped or a symbol is edited.
 */
export const activeConfigHash = computed(() => hashConfig(compileAnalysisConfig()));
