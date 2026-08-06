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

import { computed } from 'vue';
import { useNavigation } from './useNavigation';
import { useEngineModelSelection } from './useEngineModelSelection';
import { useReviewSession } from './review/useReviewSession';
import { requestMintDialog } from './useMintDialogSignal';
import { activeBoard, store, touchSession } from '../store';
import { analysisService } from '../services/analysis-service';
import type { BoardId, KeybindingActionId } from '../types';
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
  navToggleMainLine:                asActionId('nav.toggleMainLine'),
  enginePonderToggle:               asActionId('engine.ponderToggle'),
  engineSwapLastActiveModel:        asActionId('engine.swapLastActiveModel'),
  engineCycleModel:                 asActionId('engine.cycleModel'),
  displayToggleMoveSuggestions:     asActionId('display.toggleMoveSuggestions'),
  displayToggleMoveNumbers:         asActionId('display.toggleMoveNumbers'),
  displayToggleOwnershipContinuous: asActionId('display.toggleOwnershipContinuous'),
  displayToggleOwnershipDots:       asActionId('display.toggleOwnershipDots'),
  displayToggleOwnershipLiveness:   asActionId('display.toggleOwnershipLiveness'),
  reviewNextCard:                   asActionId('review.nextCard'),
  cardMint:                         asActionId('card.mint'),
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

// Coarse gate for the two model-selection actions: SELECTOR mode is
// the only mode with more than one model to swap/cycle between (LEAF
// mode's `availableModels` is a single synthesised entry — see
// `EngineModelEntry`'s doc comment in `types/engine.ts`). Narrower
// than `engineConnected` alone; mirrors the Toolbar's own
// `isSelectorMode` gate for the `<select>` render
// (`ToolbarEngineMetrics.vue`).
export const engineSelectorMode: KeybindingEnabledPredicate = () =>
  store.engine.status === 'connected'
  && store.engine.info.capabilities !== null
  && 'selector' in store.engine.info.capabilities;

// ── Handler closures ─────────────────────────────────────────
//
// `useNavigation()` is a module-safe composable (closure over
// `activeBoard` + `mutateBoard`, no setup-only side effects), so
// invoking it at module scope is correct. The returned `nav`
// methods read reactive state at call time — matching the
// `useScopedScroll` posture.
const nav = useNavigation();

// `useEngineModelSelection()` is likewise module-safe (closure over
// `store` + `setSelectedModel`, no lifecycle hooks).
const engineModelSelection = useEngineModelSelection();

// `useReviewSession(boardIdRef)` registers no lifecycle hooks either
// (grepped — no `onUnmounted`/`watch` in its body), so a module-scope
// instance is safe the same way `nav` is. Bound to a computed that
// re-derives from `activeBoard` on every read, matching how
// `ReviewSessionPanel.vue` / `ForestDirectory.vue` bind their own
// instances to the active board's id — a tab switch changes which
// board's review session `nextCard` (and `reviewSessionHasCurrentCard`
// above) act on.
const activeBoardId = computed<BoardId | null>(() => activeBoard.value?.id ?? null);
const reviewSession = useReviewSession(activeBoardId);

// Gate for `review.nextCard`: mirrors ForestDirectory's own
// `inReviewSession` panel-visibility predicate
// (`currentCard.value !== null`) — the button this action reproduces
// is only reachable in the UI when that panel is mounted, so the
// keybinding shouldn't be reachable outside it either. Declared after
// `reviewSession` above (not with the other predicates) since it
// closes over that instance.
export const reviewSessionHasCurrentCard: KeybindingEnabledPredicate = () =>
  reviewSession.currentCard.value !== null;

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
  {
    // "Toggle main line variation" — switch to the nearest ancestor
    // fork's alternate branch (uncle/cousin) and back. `u` mnemonic;
    // unused by the existing catalog, passes C15 (not a browser/AT-
    // reserved chord). Coalesced like the other nav.* actions —
    // holding it down should rAF-batch the same way arrow-repeat
    // does, per the domain's dispatchMode convention (see the
    // registry's own ship-time test).
    id: ACTIONS.navToggleMainLine,
    labelKey: 'keybindings.action.navToggleMainLine.label',
    descriptionKey: 'keybindings.action.navToggleMainLine.description',
    defaultKey: 'u',
    dispatchMode: 'coalesced',
    enabledWhen: activeBoardExists,
    handler: nav.toggleMainLine,
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
  {
    // "Swap last-active engine" — toggle between the two most
    // recently selected SELECTOR-mode models. `[` mnemonic-free but
    // unused and passes C15; paired visually with `]` (cycle) below.
    id: ACTIONS.engineSwapLastActiveModel,
    labelKey: 'keybindings.action.engineSwapLastActiveModel.label',
    descriptionKey: 'keybindings.action.engineSwapLastActiveModel.description',
    defaultKey: '[',
    dispatchMode: 'immediate',
    enabledWhen: engineSelectorMode,
    handler: engineModelSelection.swapLastActiveModel,
  },
  {
    // "Cycle engine" — advance through `availableModels` in order,
    // wrapping, skipping unhealthy entries (mirrors the dropdown's
    // `:disabled` on unhealthy options).
    id: ACTIONS.engineCycleModel,
    labelKey: 'keybindings.action.engineCycleModel.label',
    descriptionKey: 'keybindings.action.engineCycleModel.description',
    defaultKey: ']',
    dispatchMode: 'immediate',
    enabledWhen: engineSelectorMode,
    handler: engineModelSelection.cycleModel,
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
      touchSession();
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
      touchSession();
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
      touchSession();
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
      touchSession();
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
      touchSession();
    },
  },
  // ── Review session (immediate) ─────────────────────────────
  {
    // "Next card" — the same guarded advance `ReviewSessionPanel.vue`'s
    // button dispatches (`reviewSession.nextCard`, doubling as "skip"
    // mid-review and "next" once FINISHED per that composable's own
    // doc comment) — not a bypass of the grading state machine, the
    // literal same function the UI calls. `enabledWhen` reproduces the
    // panel's own mount gate (`currentCard !== null`) so the
    // keybinding is reachable exactly when the button is visible;
    // `nextCard` needs no further internal guard beyond what it
    // already has (queue/currentIndex bounds), matching this
    // catalog's established pattern of a coarse `enabledWhen` plus
    // whatever no-op guard the handler itself already carries (see
    // `enginePonderToggle` above). `.` — unused in the existing
    // catalog, passes C15; `Enter` was the more obvious "confirm/
    // advance" mnemonic but it's in `RESERVED_KEYS`
    // (`lib/keybindings-capture.ts`) — the same key vocabulary the
    // rebind editor refuses to let a user capture — so a default
    // that quietly ships unrebindable-away-from-by-convention is
    // avoided in favour of an unreserved key.
    id: ACTIONS.reviewNextCard,
    labelKey: 'keybindings.action.reviewNextCard.label',
    descriptionKey: 'keybindings.action.reviewNextCard.description',
    defaultKey: '.',
    dispatchMode: 'immediate',
    enabledWhen: reviewSessionHasCurrentCard,
    handler: reviewSession.nextCard,
  },
  // ── Card (immediate) ───────────────────────────────────────
  {
    // "Mint card" — opens MintCardModal for the active board.
    // Previously PROPOSED-ONLY (see the hotkeys-batch build
    // report): the modal is opened today only via a component-ref
    // method (`App.vue`'s `triggerMint`), and this module-scope
    // catalog has no component instance to hold that ref. Wired
    // via `requestMintDialog()` — a module-scoped counter signal
    // (`useMintDialogSignal.ts`, same shape as `captureMode` /
    // `anyModalOpen`) that `App.vue` watches to call its own
    // `triggerMint()`. `enabledWhen: activeBoardExists` mirrors the
    // Toolbar mint button's own implicit gate (`triggerMint` is a
    // no-op without an active board) and the modal's own required
    // `boardId` parameter. `k` — unused, C15-clean; no stronger
    // mnemonic was available (`m` is already `display.
    // toggleMoveSuggestions`) — every action is user-rebindable via
    // the Phase 4 editor regardless.
    id: ACTIONS.cardMint,
    labelKey: 'keybindings.action.cardMint.label',
    descriptionKey: 'keybindings.action.cardMint.description',
    defaultKey: 'k',
    dispatchMode: 'immediate',
    enabledWhen: activeBoardExists,
    handler: requestMintDialog,
  },
];
