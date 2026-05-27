/**
 * src/lib/keybindings.ts
 * User-configurable keybindings substrate.
 *
 * Single declarative registry — `KEYBINDINGS_REGISTRY` — of every
 * user-rebindable keyboard action the SPA ships. Each entry
 * (`KeybindingActionDecl`) carries:
 *
 *   - `id`: branded `KeybindingActionId`, stable across reshuffles
 *     (the i18n label can change; the id is the contract with
 *     persisted user overrides on `AppSettings.keybindings`).
 *   - `defaultKey`: what the action ships bound to (null for
 *     actions that ship unbound — none currently).
 *   - `dispatchMode`: `'immediate'` for toggles or `'coalesced'` for
 *     nav-style actions (rAF-coalesce against OS key repeat per the
 *     posture established by perf Fix #1 — see the worklog at
 *     `docs/worklog/2026-05-27-perf-fix1-raf-coalesce-keydown.md`).
 *   - `enabledWhen`: predicate gating dispatch (three cases —
 *     `always`, `activeBoardExists`, `engineConnected` — covering
 *     every current action's runtime gate).
 *   - `handler`: pure side-effecting `() => void` invoked at
 *     dispatch time. Reads `activeBoard` / `store.engine` etc.
 *     directly; no parameters means context is re-read at fire
 *     time (matches the `useScopedScroll` posture).
 *
 * The user's overrides live at `store.profile.settings.keybindings`
 * as a sparse `Partial<Record<KeybindingActionId, string | null>>`
 * (absence = use registry default; explicit null = user unbound).
 * `effectiveKey(action, overrides)` resolves the live binding.
 *
 * Phase 1 of the keybindings arc (per `docs/notes/keybindings-plan.md`):
 * substrate only. The registry IS defined and validated at module
 * load (defensive ship-time conflict check), but
 * `useUserIORegistry` keeps its hardcoded switch — Phase 2
 * rewrites the dispatcher to consume this registry. No
 * user-visible behaviour change in Phase 1.
 *
 * License: Public Domain (The Unlicense)
 */

import { useNavigation } from '../composables/useNavigation';
import { activeBoard, store } from '../store';
import { analysisService } from '../services/analysis-service';
import type { KeybindingActionId } from '../types';

// ── Types ─────────────────────────────────────────────────────

/**
 * When this action is dispatchable. Three cases cover every
 * current runtime gate; if a fourth case shows up (e.g., a
 * card-review-only action), promote this to a predicate function
 * `(store: GlobalStore) => boolean` rather than widening the enum
 * cap further.
 */
export type KeybindingEnabledWhen =
  | 'always'
  | 'activeBoardExists'
  | 'engineConnected';

/**
 * Dispatch mode for a keybinding action.
 *
 *   - `'immediate'` for toggles / one-shot actions; fires
 *     synchronously per keydown (one key = one toggle).
 *   - `'coalesced'` for nav-style actions; the dispatcher
 *     rAF-coalesces against OS key-repeat so heavy downstream
 *     work can't back-pressure the input queue. Established in
 *     perf Fix #1.
 */
export type KeybindingDispatchMode = 'immediate' | 'coalesced';

export interface KeybindingActionDecl {
  readonly id: KeybindingActionId;
  /** i18n key for the user-visible action label (short imperative). */
  readonly labelKey: string;
  /** i18n key for a sentence-length description (rendered in tooltips / details rows). */
  readonly descriptionKey: string;
  /** Default key as shipped; `null` for actions that ship unbound (none currently). */
  readonly defaultKey: string | null;
  readonly dispatchMode: KeybindingDispatchMode;
  readonly enabledWhen: KeybindingEnabledWhen;
  /** Pure side-effecting handler. Reads reactive state at fire time. */
  readonly handler: () => void;
}

// ── Action ids — branded literals ────────────────────────────

const asActionId = (id: string): KeybindingActionId => id as KeybindingActionId;

/**
 * Stable id catalog. Adding a new action: extend this object AND
 * append the corresponding `KeybindingActionDecl` to
 * `KEYBINDINGS_REGISTRY` below. The `as const satisfies` shape
 * gives per-key literal narrowing while constraining values to
 * branded `KeybindingActionId`.
 */
export const ACTIONS = {
  navNext:                          asActionId('nav.next'),
  navPrev:                          asActionId('nav.prev'),
  navVariationPrev:                 asActionId('nav.variationPrev'),
  navVariationNext:                 asActionId('nav.variationNext'),
  navHome:                          asActionId('nav.home'),
  navEnd:                           asActionId('nav.end'),
  enginePonderToggle:               asActionId('engine.ponderToggle'),
  displayToggleMoveSuggestions:     asActionId('display.toggleMoveSuggestions'),
  displayToggleMoveNumbers:         asActionId('display.toggleMoveNumbers'),
  displayToggleOwnershipContinuous: asActionId('display.toggleOwnershipContinuous'),
  displayToggleOwnershipDots:       asActionId('display.toggleOwnershipDots'),
  displayToggleOwnershipLiveness:   asActionId('display.toggleOwnershipLiveness'),
} as const satisfies Record<string, KeybindingActionId>;

// ── Handler closures ─────────────────────────────────────────
//
// `useNavigation()` is a module-safe composable (closure over
// `activeBoard` + `mutateBoard`, no setup-only side effects), so
// invoking it at module scope is correct. The returned `nav`
// methods read reactive state at call time — matching the
// `useScopedScroll` posture.
const nav = useNavigation();

// ── Registry ─────────────────────────────────────────────────

export const KEYBINDINGS_REGISTRY: ReadonlyArray<KeybindingActionDecl> = [
  // ── Navigation (coalesced) ─────────────────────────────────
  {
    id: ACTIONS.navNext,
    labelKey: 'keybindings.action.navNext.label',
    descriptionKey: 'keybindings.action.navNext.description',
    defaultKey: 'ArrowDown',
    dispatchMode: 'coalesced',
    enabledWhen: 'activeBoardExists',
    handler: () => nav.next(),
  },
  {
    id: ACTIONS.navPrev,
    labelKey: 'keybindings.action.navPrev.label',
    descriptionKey: 'keybindings.action.navPrev.description',
    defaultKey: 'ArrowUp',
    dispatchMode: 'coalesced',
    enabledWhen: 'activeBoardExists',
    handler: () => nav.prev(),
  },
  {
    id: ACTIONS.navVariationPrev,
    labelKey: 'keybindings.action.navVariationPrev.label',
    descriptionKey: 'keybindings.action.navVariationPrev.description',
    defaultKey: 'ArrowLeft',
    dispatchMode: 'coalesced',
    enabledWhen: 'activeBoardExists',
    handler: () => nav.variation(-1),
  },
  {
    id: ACTIONS.navVariationNext,
    labelKey: 'keybindings.action.navVariationNext.label',
    descriptionKey: 'keybindings.action.navVariationNext.description',
    defaultKey: 'ArrowRight',
    dispatchMode: 'coalesced',
    enabledWhen: 'activeBoardExists',
    handler: () => nav.variation(1),
  },
  {
    id: ACTIONS.navHome,
    labelKey: 'keybindings.action.navHome.label',
    descriptionKey: 'keybindings.action.navHome.description',
    defaultKey: 'Home',
    dispatchMode: 'coalesced',
    enabledWhen: 'activeBoardExists',
    handler: () => nav.home(),
  },
  {
    id: ACTIONS.navEnd,
    labelKey: 'keybindings.action.navEnd.label',
    descriptionKey: 'keybindings.action.navEnd.description',
    defaultKey: 'End',
    dispatchMode: 'coalesced',
    enabledWhen: 'activeBoardExists',
    handler: () => nav.end(),
  },
  // ── Engine (immediate) ─────────────────────────────────────
  {
    id: ACTIONS.enginePonderToggle,
    labelKey: 'keybindings.action.enginePonderToggle.label',
    descriptionKey: 'keybindings.action.enginePonderToggle.description',
    defaultKey: ' ',
    dispatchMode: 'immediate',
    enabledWhen: 'engineConnected',
    handler: () => {
      if (!activeBoard.value) return;
      const boardId = activeBoard.value.id;
      if (analysisService.isPondering(boardId)) {
        analysisService.stopPonderOnBoard(boardId);
      } else {
        analysisService.analyzeActiveNode(boardId, 'ponder');
      }
    },
  },
  // ── Display toggles (immediate) ────────────────────────────
  {
    id: ACTIONS.displayToggleMoveSuggestions,
    labelKey: 'keybindings.action.displayToggleMoveSuggestions.label',
    descriptionKey: 'keybindings.action.displayToggleMoveSuggestions.description',
    defaultKey: 'm',
    dispatchMode: 'immediate',
    enabledWhen: 'activeBoardExists',
    handler: () => {
      store.session.ui.showMoveSuggestions = !store.session.ui.showMoveSuggestions;
    },
  },
  {
    id: ACTIONS.displayToggleMoveNumbers,
    labelKey: 'keybindings.action.displayToggleMoveNumbers.label',
    descriptionKey: 'keybindings.action.displayToggleMoveNumbers.description',
    defaultKey: 'n',
    dispatchMode: 'immediate',
    enabledWhen: 'activeBoardExists',
    handler: () => {
      store.session.ui.showStoneMoveNumbers = !store.session.ui.showStoneMoveNumbers;
    },
  },
  {
    id: ACTIONS.displayToggleOwnershipContinuous,
    labelKey: 'keybindings.action.displayToggleOwnershipContinuous.label',
    descriptionKey: 'keybindings.action.displayToggleOwnershipContinuous.description',
    defaultKey: 'c',
    dispatchMode: 'immediate',
    enabledWhen: 'activeBoardExists',
    handler: () => {
      store.session.ui.overlayLayers.ownership.continuous = !store.session.ui.overlayLayers.ownership.continuous;
    },
  },
  {
    id: ACTIONS.displayToggleOwnershipDots,
    labelKey: 'keybindings.action.displayToggleOwnershipDots.label',
    descriptionKey: 'keybindings.action.displayToggleOwnershipDots.description',
    defaultKey: 'd',
    dispatchMode: 'immediate',
    enabledWhen: 'activeBoardExists',
    handler: () => {
      store.session.ui.overlayLayers.ownership.dots = !store.session.ui.overlayLayers.ownership.dots;
    },
  },
  {
    id: ACTIONS.displayToggleOwnershipLiveness,
    labelKey: 'keybindings.action.displayToggleOwnershipLiveness.label',
    descriptionKey: 'keybindings.action.displayToggleOwnershipLiveness.description',
    defaultKey: 'l',
    dispatchMode: 'immediate',
    enabledWhen: 'activeBoardExists',
    handler: () => {
      store.session.ui.overlayLayers.ownership.liveness = !store.session.ui.overlayLayers.ownership.liveness;
    },
  },
];

// ── effectiveKey ─────────────────────────────────────────────

/**
 * Resolve the effective key for an action given the user's
 * overrides. Returns `null` when the action is unbound (either by
 * default OR by explicit user override) — the dispatcher should
 * skip unbound actions; no keydown ever triggers them.
 */
export function effectiveKey(
  action: KeybindingActionDecl,
  overrides: Partial<Record<KeybindingActionId, string | null>>,
): string | null {
  if (action.id in overrides) return overrides[action.id] ?? null;
  return action.defaultKey;
}

// ── enabledWhen evaluation ───────────────────────────────────

/**
 * Evaluate an action's `enabledWhen` predicate against the
 * current reactive state. Pure — re-call on each dispatch.
 */
export function isActionEnabled(action: KeybindingActionDecl): boolean {
  switch (action.enabledWhen) {
    case 'always':            return true;
    case 'activeBoardExists': return activeBoard.value !== null;
    case 'engineConnected':   return store.engine.status === 'connected';
  }
}

// ── Registry validation ──────────────────────────────────────

/**
 * Defensive ship-time check: every action's id is unique, and no
 * two actions claim the same `defaultKey`. Throws per ADR-0002
 * on conflict (a shipped registry with conflicts is a developer
 * bug, not a user-facing condition). Called once at app
 * bootstrap from `useAppBootstrap`.
 */
export function validateKeybindingsRegistry(): void {
  const seenIds = new Set<KeybindingActionId>();
  const seenDefaultKeys = new Map<string, KeybindingActionDecl>();
  for (const action of KEYBINDINGS_REGISTRY) {
    if (seenIds.has(action.id)) {
      throw new Error(`[keybindings] duplicate action id: ${action.id}`);
    }
    seenIds.add(action.id);
    if (action.defaultKey !== null) {
      const existing = seenDefaultKeys.get(action.defaultKey);
      if (existing !== undefined) {
        throw new Error(
          `[keybindings] default-key conflict: "${action.defaultKey}" bound to both ${existing.id} and ${action.id}`,
        );
      }
      seenDefaultKeys.set(action.defaultKey, action);
    }
  }
}
