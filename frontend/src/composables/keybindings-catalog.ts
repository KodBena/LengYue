/**
 * src/composables/keybindings-catalog.ts
 * The application's keybinding action catalog.
 *
 * Single declarative registry — `KEYBINDINGS_REGISTRY` — of every
 * user-rebindable keyboard action the SPA ships, plus the `ACTIONS`
 * id const and the named `enabledWhen` predicates the entries use.
 * The generic machinery that consumes this catalog (declaration
 * shape, key resolution, validation) is the substrate at
 * `src/lib/keybindings.ts`; this module is the domain half of the
 * substrate/catalog split (2026-06-10 history-lessons audit §3.16,
 * work-status item `keybindings-substrate-catalog-split`).
 *
 * Homed in the composables layer: the handlers are thin dispatch
 * into the logic layer — `useNavigation` verbs, `analysisService`
 * calls, named `store.session.ui` writes — i.e. the keyboard analog
 * of App-wiring. Band-mixed by entry (nav.* is game-tree [B2];
 * ponder / ownership-overlay toggles are Go/KataGo-flavored [B3]);
 * structurally [B3] via the `analysis-service` import. A fork
 * replaces this file wholesale and keeps the substrate.
 *
 * **Persisted-id contract.** Action `id` strings are keys into the
 * persisted `store.profile.settings.keybindings` overrides blob
 * (and roam across devices via SyncService). Renaming an id
 * orphans every user's saved binding for that action — never
 * rename; retire-and-add with a migration instead. The id strings
 * are pinned by `tests/unit/composables/keybindings-catalog.test.ts`.
 *
 * Adding a new action: extend `ACTIONS` AND append the
 * corresponding `KeybindingActionDecl` to `KEYBINDINGS_REGISTRY`.
 * Design note: `docs/archive/notes/design/keybindings-plan.md`.
 *
 * License: Public Domain (The Unlicense)
 */

import { useNavigation } from './useNavigation';
import { activeBoard, store } from '../store';
import { analysisService } from '../services/analysis-service';
import type { KeybindingActionId } from '../types';
import type { KeybindingActionDecl, KeybindingEnabledPredicate } from '../lib/keybindings';

// ── Action ids — branded literals ────────────────────────────

const asActionId = (id: string): KeybindingActionId => id as KeybindingActionId; // brand factory: sole KeybindingActionId mint

/**
 * Stable id catalog. The `as const satisfies` shape gives per-key
 * literal narrowing while constraining values to branded
 * `KeybindingActionId`. See the persisted-id contract in the
 * module header before touching existing entries.
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

// ── enabledWhen predicates ───────────────────────────────────
//
// The catalog's gate vocabulary, expressed as substrate-shaped
// predicates (the substrate's `enabledWhen` is an opaque
// `() => boolean`; these are the three gates the current actions
// need). Reactive state is read at call time — the dispatcher
// re-calls per keydown. Exported for the catalog's tier-1 tests.

export const always: KeybindingEnabledPredicate = () => true;

export const activeBoardExists: KeybindingEnabledPredicate = () =>
  activeBoard.value !== null;

export const engineConnected: KeybindingEnabledPredicate = () =>
  store.engine.status === 'connected';

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
  //
  // Parameterless nav handlers use direct method references
  // rather than `() => nav.method()` wrappers — eliminates one
  // function-call frame per coalesced dispatch (the four
  // arrow-rate actions, which dominate sustained-hold cost).
  // The variation handlers still need closures (parameter pass).
  // Per-handler internal `if (activeBoard.value)` checks in
  // `useNavigation` cover the schedule-vs-fire state-change
  // window; the dispatcher deliberately doesn't recheck at rAF
  // fire time (see the callback comment in `useUserIORegistry`).
  {
    id: ACTIONS.navNext,
    labelKey: 'keybindings.action.navNext.label',
    descriptionKey: 'keybindings.action.navNext.description',
    defaultKey: 'ArrowDown',
    dispatchMode: 'coalesced',
    enabledWhen: activeBoardExists,
    handler: nav.next,
  },
  {
    id: ACTIONS.navPrev,
    labelKey: 'keybindings.action.navPrev.label',
    descriptionKey: 'keybindings.action.navPrev.description',
    defaultKey: 'ArrowUp',
    dispatchMode: 'coalesced',
    enabledWhen: activeBoardExists,
    handler: nav.prev,
  },
  {
    id: ACTIONS.navVariationPrev,
    labelKey: 'keybindings.action.navVariationPrev.label',
    descriptionKey: 'keybindings.action.navVariationPrev.description',
    defaultKey: 'ArrowLeft',
    dispatchMode: 'coalesced',
    enabledWhen: activeBoardExists,
    handler: () => nav.variation(-1),
  },
  {
    id: ACTIONS.navVariationNext,
    labelKey: 'keybindings.action.navVariationNext.label',
    descriptionKey: 'keybindings.action.navVariationNext.description',
    defaultKey: 'ArrowRight',
    dispatchMode: 'coalesced',
    enabledWhen: activeBoardExists,
    handler: () => nav.variation(1),
  },
  {
    id: ACTIONS.navHome,
    labelKey: 'keybindings.action.navHome.label',
    descriptionKey: 'keybindings.action.navHome.description',
    defaultKey: 'Home',
    dispatchMode: 'coalesced',
    enabledWhen: activeBoardExists,
    handler: nav.home,
  },
  {
    id: ACTIONS.navEnd,
    labelKey: 'keybindings.action.navEnd.label',
    descriptionKey: 'keybindings.action.navEnd.description',
    defaultKey: 'End',
    dispatchMode: 'coalesced',
    enabledWhen: activeBoardExists,
    handler: nav.end,
  },
  // ── Engine (immediate) ─────────────────────────────────────
  {
    id: ACTIONS.enginePonderToggle,
    labelKey: 'keybindings.action.enginePonderToggle.label',
    descriptionKey: 'keybindings.action.enginePonderToggle.description',
    defaultKey: ' ',
    dispatchMode: 'immediate',
    enabledWhen: engineConnected,
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
    enabledWhen: activeBoardExists,
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
    enabledWhen: activeBoardExists,
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
    enabledWhen: activeBoardExists,
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
    enabledWhen: activeBoardExists,
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
    enabledWhen: activeBoardExists,
    handler: () => {
      store.session.ui.overlayLayers.ownership.liveness = !store.session.ui.overlayLayers.ownership.liveness;
    },
  },
];
