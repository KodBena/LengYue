/**
 * src/composables/chrome/useNncacheControl.ts
 *
 * Thin composable wrapper over `services/nncache-session.ts`, for the
 * SAME reason `useEngineControls.ts` wraps `analysisService`'s
 * connect/disconnect: the component layer is deny-by-default on
 * `src/services/**` (frontend/CLAUDE.md "Architectural shape" — "no
 * direct service calls"; ESLint `no-restricted-imports`). This is
 * the single point of contact between `EngineNncacheControl.vue` and
 * the NN-cache-context session driver.
 *
 * License: Public Domain (The Unlicense)
 */

import type { ComputedRef } from 'vue';
import {
  nncacheEnabled,
  nncacheRawContext,
  nncacheStatus,
  type NncacheSessionStatus,
  setNncacheRawContextText,
  enable,
  disable,
  transition,
} from '../../services/nncache-session';

export interface NncacheControl {
  readonly enabled: ComputedRef<boolean>;
  readonly rawContext: ComputedRef<string>;
  readonly status: ComputedRef<NncacheSessionStatus>;
  /** Stage an edit without attempting a wire transition (checkbox currently off). */
  setRawContextText: (text: string) => void;
  /** User ticked the checkbox: attach `rawContext`. */
  enableWith: (rawContext: string) => void;
  /** User unticked the checkbox: detach, discarding undumped work. */
  disableIt: () => void;
  /** User committed an edit to the text field WHILE enabled: dump+detach the old context, attach the new one. */
  transitionTo: (rawContext: string) => void;
}

export function useNncacheControl(): NncacheControl {
  return {
    enabled: nncacheEnabled,
    rawContext: nncacheRawContext,
    status: nncacheStatus,
    setRawContextText: setNncacheRawContextText,
    enableWith: (rawContext: string) => { void enable(rawContext); },
    disableIt: () => { void disable(); },
    transitionTo: (rawContext: string) => { void transition(rawContext); },
  };
}
