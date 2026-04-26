/**
 * src/services/analysis-config.ts
 * Pure utilities for compiling and hashing the Analysis Environment.
 * License: Public Domain (The Unlicense)
 */

import { computed } from 'vue';
import { store } from '../store';

/**
 * Compiles the frontend AnalysisEnvironment into the wire-format analysis_config
 */
export function compileAnalysisConfig() {
  const env = store.profile.settings.engine.katago.analysis_env;
  if (!env || !env.palettes) return undefined;

  const activePalette = env.palettes.find(p => p.id === env.activePaletteId) || env.palettes[0];
  if (!activePalette) return undefined;

  // Explicitly ordered to maximize deterministic JSON.stringify
  return {
    bindings: {
      delta_fn: activePalette.delta_fn,
      state_fns: activePalette.state_fns,
      summary_fn: activePalette.summary_fn
    },
    parameters: env.parameters,
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
