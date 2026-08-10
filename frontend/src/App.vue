<script setup lang="ts">
/**
 * src/App.vue
 *
 * Root application component. Provides the top-level layout — the
 * resizable board/control-panel split, the tab bar, and workspace
 * auth scaffolding. The <style> block carries App-local chrome only;
 * the shared chrome classes other components consume live in
 * assets/css/shared-chrome.css (imported below, relocated 2026-06-11
 * so editing this file cannot silently restyle distant components).
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, watch } from 'vue';
import { ref as vueRef } from 'vue';
import { useI18n } from 'vue-i18n';

import { useMetadata }       from './composables/auth-app/useMetadata';
import { useSgfLoader }      from './composables/sgf/useSgfLoader';
import { useSgfDownload }    from './composables/sgf/useSgfDownload';
import { useEngineControls } from './composables/useEngineControls';
import { useUserIORegistry } from './composables/useUserIORegistry';
import { useAuth }           from './composables/auth-app/useAuth';
import { workspaceIdentityKey } from './composables/auth-app/workspace-identity-key';
import { useResizablePanel, CONTROL_PANEL_MIN_WIDTH_PX, isAnyPanelResizing } from './composables/chrome/useResizablePanel';
import { CONTROL_PANEL_TAB_IDS, useDeferredLayoutClass, getPanelContentPolicy, computeTreePanelBoundWidth } from './state/layout-model';
import { useDirtyBoardGuard } from './composables/board/useDirtyBoardGuard';
import { useAppBootstrap } from './composables/auth-app/useAppBootstrap';
import { useTransientLogReveal } from './composables/useTransientLogReveal';
import { mintDialogRequestCount } from './composables/useMintDialogSignal';
import { passRequestCount } from './composables/board/usePassSignal';
import { setupWizardOpen, openSetupWizard } from './composables/useSetupWizardSignal';
import {
  store,
  activeBoard,
  mutateBoard,
  pushSystemMessage,
  touchSession,
} from './store';

import type { BoardId, NodeId, UISession }   from './types';
import { navigateTo }     from './engine/navigator';
import type { RulesetName } from './engine/rulesets';
import { getKomi, getRulesetResolution } from './engine/util';
import { normalizeKomiForRuleset } from './engine/katago/komi-calibration';

import { KATAGO_WS_URL } from './config/env';
import { usePlayMatch } from './composables/board/usePlayFromPosition';
import { useEngineResponder } from './composables/board/useEngineResponder';
import { useBoardMoveRouting } from './composables/board/useBoardMoveRouting';
import { usePlayVsEngine } from './composables/board/usePlayVsEngine';
import { useKnownPositionNodes } from './composables/board/useKnownPositionNodes';
import { useFollowMePonder } from './composables/board/useFollowMePonder';

import BoardWidget      from './components/board/BoardWidget.vue';
import SidebarWidget    from './components/chrome/SidebarWidget.vue';
import TreeWidget       from './components/tree/TreeWidget.vue';
import TabWidget        from './components/chrome/TabWidget.vue';
import SettingsTab      from './components/SettingsTab.vue';
import AnalysisControls from './components/editors/AnalysisControls.vue';
import Toolbar          from './components/chrome/Toolbar.vue';
import StatusBar        from './components/board/StatusBar.vue';
import MintCardModal    from './components/modals/MintCardModal.vue';
import LearnPathModal   from './components/modals/LearnPathModal.vue';
import { getSelectedNodeIds } from './composables/cards/mint-selection';
import { getAnalyzingNodeId } from './composables/cards/learn-path-progress';
import ConfirmLoadModal from './components/modals/ConfirmLoadModal.vue';
import EngineMatchModal from './components/modals/EngineMatchModal.vue';
import PlayEngineModal  from './components/modals/PlayEngineModal.vue';
import SetupWizardModal from './components/wizard/SetupWizardModal.vue';
import AppConfirmDialog from './components/modals/AppConfirmDialog.vue';
import AppPromptDialog  from './components/modals/AppPromptDialog.vue';
import ForestDirectory  from './components/tree/ForestDirectory.vue';
import LibraryTab       from './components/library/LibraryTab.vue';
import SystemLogPanel   from './components/chrome/SystemLogPanel.vue';
import RootErrorBoundary from './components/chrome/RootErrorBoundary.vue';
import LocalePicker     from './components/chrome/LocalePicker.vue';

import { useReviewSession } from './composables/review/useReviewSession';
import ColorDebugStrip  from './components/charts/ColorDebugStrip.vue';
import QeuboBookmarks   from './components/qeubo/QeuboBookmarks.vue';
import KnobRegistryEditor from './components/KnobRegistryEditor.vue';
import VisitsLerpConfig from './components/VisitsLerpConfig.vue';
import PerQueryOverridesConfig from './components/PerQueryOverridesConfig.vue';
import { captureMode, resolveCapturingActionLabel } from './lib/keybindings-capture';
import { KEYBINDINGS_REGISTRY } from './composables/keybindings-catalog';

useUserIORegistry();

const { t } = useI18n();

// M8(c) (menus-ui audit row 1291, found not assumed): a keybinding-
// capture row's own window-level listener (keybindings-capture.ts)
// swallows every keypress in the app while armed — a fact the prior
// UI signalled only via ~11px italic text inside the one settings row
// itself (invisible if the user's attention isn't on that row, or the
// Settings tab isn't even the active tab). `captureMode` is the same
// module-scope ref KeybindingRow.vue sets; this banner mirrors the
// `#workspace-save-banner` idiom just below it (role="alert", opaque,
// no scrim) so the app has exactly one vocabulary for "a global fact
// you should notice regardless of where you're looking" — a lighter
// vehicle than routing capture through the AppPromptDialog family,
// which would turn a one-keypress interaction into a full modal
// round-trip for every rebind.
//
// Review remedy (ledger row 1335): the id -> label derivation itself
// (registry lookup + translate, with the "id not found" fallback) now
// lives in `resolveCapturingActionLabel` (keybindings-capture.ts) as a
// plain, unit-testable function — this computed is a thin wrapper
// wiring it to the live `captureMode` ref and this component's `t`.
const capturingActionLabel = computed<string | null>(() =>
  resolveCapturingActionLabel(captureMode.value, KEYBINDINGS_REGISTRY, t),
);
const { openFileDialog } = useSgfLoader();
const { downloadActiveBoard } = useSgfDownload();
const engineControls     = useEngineControls();
const metadata           = useMetadata(activeBoard);
const auth               = useAuth();

const activeBoardId = computed<BoardId | null>(() => activeBoard.value?.id ?? null);
// Batch card-minting selection (commissioner-designed, ledger rows
// 926/957/1008) — reads the module-scope registry both `TreeWidget`'s
// ctrl+click handler and `LearnPathModal` (via `useLearnPath`) write
// to; see `mint-selection.ts` for why this lives at module scope
// rather than as a prop threaded from the modal (siblings, not
// parent/child).
const activeBoardSelectedNodeIds = computed(() =>
  activeBoardId.value ? getSelectedNodeIds(activeBoardId.value) : undefined,
);
// "Learn this path" on-demand-analysis progress marker (commission
// ledger row 881) — same module-scope-registry-read shape as
// `activeBoardPendingMintIds` above, for the same sibling-not-parent
// reason (see `learn-path-progress.ts`'s header).
const activeBoardAnalyzingNodeId = computed(() =>
  activeBoardId.value ? getAnalyzingNodeId(activeBoardId.value) : null,
);

// Identity key for the control panel. Remounts the Cards / Library tabs
// when the logged-in identity changes, so user B never sees user A's
// component-instance fetched data (ForestDirectory's `roots`, LibraryTab's
// query/preview state) — the leak `resetWorkspace`'s cache registry can't
// reach, since that state lives in component instances, not module scope.
// Derivation (and why username, not userId) in workspace-identity-key.ts.
const controlPanelIdentityKey = computed(() => workspaceIdentityKey(auth.state.value));
const reviewSession = useReviewSession(activeBoardId);
const mintModalRef = vueRef<InstanceType<typeof MintCardModal> | null>(null);
const learnPathModalRef = vueRef<InstanceType<typeof LearnPathModal> | null>(null);
const matchModalRef = vueRef<InstanceType<typeof EngineMatchModal> | null>(null);
const playModalRef  = vueRef<InstanceType<typeof PlayEngineModal>  | null>(null);

// "Play vs engine" responder — watches the active board's cursor +
// games map and fires engine responses at engine-turn nodes inside
// a game-root's descendant tree. Mounted at App scope so the
// watcher lives for the app lifetime; identity-flip teardown is
// handled by `resetWorkspace`'s `boards = [createInitialBoard()]`
// which bumps `boardsSetVersion` and (through the responder's
// `gamesKey` fingerprint) re-evaluates from scratch. See
// `useEngineResponder` and the play-vs-engine worklog for the
// trigger contract.
const engineResponder = useEngineResponder();

// Engine-vs-engine match controls. Lifecycle is independent of the
// singleton analysis-service: `usePlayMatch.start` opens its own
// WebSocket via `connectFresh` (matches the proxy's MAX_SESSIONS=256
// per-connection budget), runs the alternating queries, closes when
// done or stopped. The Toolbar's MATCH button toggles between
// "open the modal" (idle) and "request cooperative stop" (running)
// based on `matchControls.isRunning`.
const matchControls = usePlayMatch(activeBoardId);

function triggerMatch() {
  if (activeBoardId.value) {
    matchModalRef.value?.open();
  }
}

function handleStartMatch(opts: {
  numMoves: number;
  black: { model?: string; maxVisits: number };
  white: { model?: string; maxVisits: number };
}) {
  // Match opens its own WS to the same URL the singleton uses (or
  // would use after Connect). The `||` (not `??`) is intentional so
  // an empty-string profile setting falls through to the env-var
  // default — same convention as analysis-service's `connect()`.
  const url = store.profile.settings.engine.katago.url || KATAGO_WS_URL;
  matchControls.start({
    katagoUrl: url,
    numMoves: opts.numMoves,
    black: opts.black,
    white: opts.white,
  }).catch((err: Error) => {
    pushSystemMessage('error', t('match.failed', { error: err.message }));
  });
}

function handleStopMatch() {
  matchControls.stop();
}

// ── "Play vs Engine" wiring ──────────────────────────────────────────────────
//
// Modal surface lives in `PlayEngineModal.vue`; per-board game-root
// entries live on `BoardState.games` (schema 52). App.vue owns the
// modal ref and the open trigger, matching the existing modal pattern
// (MintCardModal, EngineMatchModal, ConfirmLoadModal); the game-session
// policy (start/end/heads + the synchronous engine kick when the start
// position is the engine's turn) lives in `usePlayVsEngine`.
function triggerPlay() {
  if (activeBoardId.value) {
    playModalRef.value?.open();
  }
}

const { handleStartGame, handleEndGame, activeBoardGameHeadIds } =
  usePlayVsEngine(engineResponder);

// card-position-annotations Stage B: the known-position highlight set
// (cache ∩ known-positions) for the active board's tree, passed to
// TreeWidget the same way activeBoardGameHeadIds is.
const { activeBoardKnownPositionNodeIds } = useKnownPositionNodes();

// "Follow Me" ponder watcher — restarts pondering on same-board
// navigation (board switches deliberately excluded). Watcher scope:
// App lifetime. See the composable for the trigger contract.
useFollowMePonder();

function triggerMint() {
  if (activeBoardId.value) {
    mintModalRef.value?.open(activeBoardId.value);
  }
}

// "Learn this path" (wiki #8) — mirrors triggerMint's pattern. The
// modal's own `open()` doesn't need the precondition (loaded-card-at-
// root) checked here; useLearnPath.explore surfaces a failed
// precondition as a reported error inside the modal.
function triggerLearnPath() {
  if (activeBoardId.value) {
    learnPathModalRef.value?.open(activeBoardId.value);
  }
}

// `card.mint` keybinding entry point: the catalog is module-scope and
// has no component instance to hold `mintModalRef`, so it can't call
// `triggerMint()` directly. It instead bumps `mintDialogRequestCount`
// (`useMintDialogSignal.ts`) and this watcher — living at App scope,
// which does hold the ref — reacts by calling the same `triggerMint()`
// the Toolbar button already dispatches. No cleanup to wire: a Vue
// `watch` registered in `setup` is torn down automatically on unmount
// (umbrella CLAUDE.md's resource-ownership discipline names this as
// the automatically-cleaned case, unlike module-scope subscriptions).
watch(mintDialogRequestCount, () => {
  triggerMint();
});

// First-run setup wizard trigger (ledger slug swz-setup-wizard).
// `store.workspaceLoadState.kind` flips to 'loaded' exactly once
// hydrate has resolved — either a real persisted blob (migrated,
// `onboarding.completed` backfilled `true` by migration 69 → 70) or
// a genuinely fresh profile (never persisted; `completed` stays the
// `defaults.ts` seed of `false`). `{ immediate: true }` covers the
// already-loaded-by-mount-time race (workspaceLoadState can reach
// 'loaded' before this watcher registers, e.g. a synchronous local
// default with no remote fetch in flight); the `kind === 'loaded'`
// guard keeps it a no-op while still 'loading'/'error'. Re-running
// via Settings goes through the same `openSetupWizard()` entry point
// (`useSetupWizardSignal.ts`) and never touches this watcher.
watch(
  () => store.workspaceLoadState.kind,
  (kind) => {
    if (kind === 'loaded' && !store.profile.settings.onboarding.completed) {
      openSetupWizard();
    }
  },
  { immediate: true },
);

// Komi write site (ledger row 1146): the raw `newKomi` off the
// StatusBar `<input>` is routed through `normalizeKomiForRuleset`
// against the board's CURRENT ruleset before it is persisted, so a
// Tromp-Taylor board can never end up with a stored non-integer komi —
// the per-ruleset domain function `engine/katago/komi-calibration.ts`
// owns (TT: integers; the other three: half-integers in [-150, 150]).
function handleUpdateKomi(newKomi: number) {
  if (!activeBoard.value || isNaN(newKomi)) return;
  mutateBoard(activeBoard.value.id, draft => {
    const root = draft.nodes[draft.rootNodeId];
    if (root) {
      const ruleset = getRulesetResolution(draft).name;
      root.properties['KM'] = [normalizeKomiForRuleset(newKomi, ruleset).toString()];
    }
  });
}

// Parallel to handleUpdateKomi. `newRules` is one of the four
// ruling-mandated canonical spellings (RulesetName) — StatusBar's
// dropdown only emits values drawn from RULESET_NAMES, so this writes
// the canonical spelling directly to root `RU`, no re-normalization
// needed for RU itself. The board's existing `KM`, however, IS
// renormalized against the NEW ruleset here (ledger row 1146): a
// switch INTO Tromp-Taylor must not leave a half-integer komi (e.g.
// 6.5, carried over from Chinese/AGA/Japanese) sitting on the board —
// that would be exactly the invalid state `handleUpdateKomi`'s own
// write-time normalization exists to make unrepresentable. Switching
// AWAY from Tromp-Taylor is a no-op here (an integer is already inside
// every other ruleset's half-integer domain).
function handleUpdateRules(newRules: RulesetName) {
  if (!activeBoard.value) return;
  mutateBoard(activeBoard.value.id, draft => {
    const root = draft.nodes[draft.rootNodeId];
    if (root) {
      root.properties['RU'] = [newRules];
      root.properties['KM'] = [normalizeKomiForRuleset(getKomi(draft), newRules).toString()];
    }
  });
}

const confirmLoadModalRef = vueRef<InstanceType<typeof ConfirmLoadModal> | null>(null);
const {
  handleLoadCard,
  handleLoadLibraryGame,
  handleLoadLibraryGameInNewBoard,
} = useDirtyBoardGuard(confirmLoadModalRef);

const {
  startResizeInner,
  startResizeOuter,
  effectiveTreeControlRegionWidthPx,
  freshTreeControlWrapperMinWidthPx,
  boardColumnMaxWidthPx,
  unsetWrapperMaxWidthCss,
  rowWidthPx,
  rowHeightPx,
} = useResizablePanel();

// Phase 1 (resolution roadmap): the LayoutClass this workspace is
// currently in, derived from #split-workspace's own live geometry
// (the SAME ResizeObserver-cached rowWidthPx/rowHeightPx the board-
// column-cap and restore-time clamps above already read — see
// state/layout-model.ts's header for why this reuses that observer
// rather than standing up a second one). `isAnyPanelResizing` freezes
// the axis (a discrete flex-direction flip) for the duration of an
// in-flight resizer drag, same discipline
// useDeferredContainerBreakpoint.ts already established for
// ForestDirectory's own narrow-stack reorg.
const layoutClass = useDeferredLayoutClass(rowWidthPx, rowHeightPx, isAnyPanelResizing);
const workspaceAxisColumn = computed(() => layoutClass.value.axis === 'column');

// Phase 3 (resolution roadmap, audit finding R3): the declared
// measure/reflow policy for THIS workspace's width class — read once
// here and threaded down to the two control-panel tabs whose content
// is dense text/tables (Library, Cards) rather than re-derived
// per-tab. See `getPanelContentPolicy`'s doc (`state/layout-model.ts`).
const panelContentPolicy = computed(() => getPanelContentPolicy(layoutClass.value));

// Phase 3 (audit findings R3/R5), review follow-up (ledger rows
// 929/926): the `#vue-tree-panel` `:style` WIDTH DECISION — extracted
// from what used to be a template ternary into `computeTreePanelBoundWidth`
// (state/layout-model.ts) so the stored-drag-precedence property (a
// user-dragged `treePanelWidthPx` wins verbatim over the fraction
// default, across ANY workspace width and axis flip) is a pure
// function's contract, unit-testable directly, rather than true only
// by inspection of the template. This computed is the ONLY read site
// for `store.session.ui.treePanelWidthPx` in the template below —
// still a pure render-time projection, not a second write channel.
const treePanelBoundWidth = computed(() =>
  computeTreePanelBoundWidth({
    axisColumn: workspaceAxisColumn.value,
    storedWidthPx: store.session.ui.treePanelWidthPx,
    workspaceWidthPx: rowWidthPx.value,
  }),
);
const treePanelStyle = computed(() =>
  treePanelBoundWidth.value.mode === 'full'
    ? {}
    : { width: treePanelBoundWidth.value.widthPx + 'px', flex: '0 0 auto' },
);

// Defect 6 (ui-fix-56), preserved as a documented, minor cosmetic
// nicety under the nested-splitter geometry (ledger rows 391/414) —
// see useResizablePanel.ts's header for the two-level nesting model
// this composes with. #split-workspace centers its row content when
// the control panel is toggled off entirely.
//
// Under the nested model this is now LARGELY (not fully) redundant
// with a structural effect: #board-column is `flex: 1 1 auto` and
// #board-square (the actual visual square) is `align-self: center`
// within it, so #board-column growing into freed space already
// re-centers the square WITHIN #board-column's own box, continuously,
// with no discrete class flip. The discrete `justify-content: center`
// here additionally centers the square across the FULL row (including
// the tree-only wrapper's own leftover width when control is hidden)
// rather than only within #board-column's box — the two differ by at
// most half the tree panel's width (~70px at the default 140px),
// judged acceptable to keep as the simpler, already-shipped mechanism
// rather than removing it and accepting that small a asymmetry as a
// visible regression. `!treeExpanded` deliberately does NOT
// participate: hiding the tree alone doesn't strand space the way
// disabling the whole control region does (the wrapper's own binding
// below already un-claims that space structurally).
const splitWorkspaceCentered = computed(() => !store.session.ui.controlsExpanded);

const { sync } = useAppBootstrap(auth);

// Transient auto-reveal of the system-log panel on error/warning
// arrivals when `systemLogExpanded` is false. See the composable for
// the UX rationale and timer mechanics.
const transientLogReveal = useTransientLogReveal();

// Computed so the labels re-evaluate on locale change. The TabWidget
// renders `tab.label` directly; Vue's reactivity passes through the
// prop, so a locale flip propagates without per-tab re-mounting.
//
// Mapped from `CONTROL_PANEL_TAB_IDS` (state/layout-model.ts) rather
// than a second hand-written id list — that array is ALSO what
// `computeControlPanelMinWidthPx` projects the tab-strip floor from
// (audit finding R2), so a tab added/removed here moves the floor by
// construction; a second, drifted id list would silently defeat that.
const controlTabs = computed(() =>
  CONTROL_PANEL_TAB_IDS.map((id) => ({ id, label: t(`app.tabs.${id}`) })),
);

// Board-mutation entry points (click-to-play + paste-PV), routed
// through the grading-integrity gate: AWAITING_MOVE moves go to the
// review session's graded single-move handler, transient SR states
// refuse board mutation, and free play (with the play-vs-engine
// head trigger) is an IDLE/FINISHED-only affordance. Policy +
// rationale live in the composable; tier-3 tests pin the gating.
const { handleBoardMove, handlePass, handlePastePv } =
  useBoardMoveRouting(reviewSession, engineResponder);

// Same signal shape as `mintDialogRequestCount` above: the module-
// scope keybindings catalog can't call `handlePass` directly (it
// closes over `reviewSession`/`engineResponder`, both App-setup-
// scoped), so `board.pass`'s handler bumps `passRequestCount` and
// this watcher calls the real handler.
watch(passRequestCount, () => {
  handlePass();
});

// StatusBar's pass-button enabled state: mirrors `handlePass`'s own
// no-op arms (transient SR states, REVIEWED) so the button's
// disabled-ness never lies about what a click would do.
const canPass = computed(() =>
  reviewSession.state.value !== 'LOADING'
  && reviewSession.state.value !== 'ANALYZING'
  && reviewSession.state.value !== 'REVIEWED',
);

// Tightened from `nodeId: string` to `nodeId: NodeId` to match
// TreeWidget's tightened `select-node` emit signature. The handler
// now receives the branded type directly; navigateTo (which expects
// NodeId) is satisfied without a cast.
function handleNodeSelect(nodeId: NodeId): void {
  if (!activeBoard.value) return;
  mutateBoard(activeBoard.value.id, draft => navigateTo(draft, nodeId));
}

// Boolean keys of `UISession` — the only shape the chrome toggle below
// handles (it flips a boolean in place). Keeps the helper from being
// pointed at a non-boolean session field.
type BooleanUiKey = {
  [K in keyof UISession]-?: UISession[K] extends boolean ? K : never;
}[keyof UISession];

// Chrome panel toggle (sidebar / board / tree / controls). These are
// persisted `session.ui` flags, so the toggle bumps `touchSession()` —
// SyncService keys session persistence on the `sessionVersion` counter
// now, not a deep `store.session` watch (see `sessionVersion` in
// `store/index.ts`). Replaces the inline `@click="store.session.ui.X =
// !store.session.ui.X"` template writes, which the counter would not
// observe.
function toggleChrome(key: BooleanUiKey): void {
  store.session.ui[key] = !store.session.ui[key];
  touchSession();
}

// Control-panel active tab — persisted `session.ui.activeTab`. A
// writable computed so the TabWidget v-model write routes through
// `touchSession()` (same session-counter reason as `toggleChrome`).
const activeTab = computed<string>({
  get: () => store.session.ui.activeTab,
  set: (v) => {
    store.session.ui.activeTab = v;
    touchSession();
  },
});

</script>

<template>
  <RootErrorBoundary>
  <div id="main-area">
    <SetupWizardModal v-if="setupWizardOpen" />
    <AppConfirmDialog />
    <AppPromptDialog />
    <MintCardModal ref="mintModalRef" />
    <LearnPathModal ref="learnPathModalRef" />
    <ConfirmLoadModal ref="confirmLoadModalRef" />
    <EngineMatchModal ref="matchModalRef" @start-match="handleStartMatch" />
    <PlayEngineModal
      ref="playModalRef"
      @start-game="handleStartGame"
      @end-game="handleEndGame"
    />
    <SidebarWidget
      v-if="store.workspaceLoadState.kind === 'loaded'"
      v-show="store.session.ui.sidebarExpanded"
      @load-sgf="openFileDialog"
      @save-sgf="downloadActiveBoard"
    />

    <div id="main-workspace">

      <!-- ADR-0019 audit Finding S1: cold-load honest gate. Before
           the workspace fetch has resolved (or resolved to "nothing
           to fetch"), the store's default boards must not be
           rendered as a plausible, interactive workspace — that was
           the audit's phantom-37-boards defect. `store.workspaceLoadState`
           (SyncService-owned, see types/app.ts) drives an exhaustive
           three-way gate over the board/tree/control-panel surfaces:
           chrome (toolbar, tab strip) that could mutate workspace
           state is withheld the same way. The system-log bar and
           modals stay outside the gate — the log is diagnostic-only
           and the modals are inert until a (gated-away) toolbar
           button opens one. -->
      <template v-if="store.workspaceLoadState.kind === 'loaded'">
        <div class="top-nav-bar">
          <button class="collapse-btn" @click="toggleChrome('sidebarExpanded')" :title="$t('app.chrome.toggleSidebar')">
            {{ store.session.ui.sidebarExpanded ? '◀' : '▶' }}
          </button>

          <Toolbar
            :is-match-running="matchControls.isRunning.value"
            @toggle-engine="engineControls.toggle"
            @mint-card="triggerMint"
            @open-match="triggerMatch"
            @stop-match="handleStopMatch"
            @open-play="triggerPlay"
            @open-learn-path="triggerLearnPath"
            style="flex: 1; border-bottom: none;"
          />

          <div class="right-toggles">
            <button class="collapse-btn" @click="toggleChrome('boardExpanded')" :title="$t('app.chrome.toggleBoard')">
              🔲 {{ store.session.ui.boardExpanded ? '▶' : '◀' }}
            </button>
            <button class="collapse-btn" @click="toggleChrome('treeExpanded')" :title="$t('app.chrome.toggleTree')">
              🌲 {{ store.session.ui.treeExpanded ? '▶' : '◀' }}
            </button>
            <button class="collapse-btn" @click="toggleChrome('controlsExpanded')" :title="$t('app.chrome.toggleControls')">
              ⚙️ {{ store.session.ui.controlsExpanded ? '▶' : '◀' }}
            </button>
            <LocalePicker />
          </div>
        </div>

        <!-- Keybinding-capture banner (menus-ui audit M8(c), row 1291):
             persistent, opaque (no scrim/translucency — standing
             ruling), always mounted at the top of the chrome —
             board-adjacent, same tier as the save-failure banner below
             — for as long as `captureMode` is armed, regardless of
             which tab/panel currently has visual focus. -->
        <div
          v-if="capturingActionLabel !== null"
          id="keybinding-capture-banner"
          role="alert"
        >
          {{ $t('app.keybindingCapture.banner', { action: capturingActionLabel }) }}
        </div>

        <!-- Save-failure banner (menus-ui audit M14): the write-path
             counterpart of the #workspace-boot-state error leg below,
             same idiom (role="alert", plain-language message, explicit
             Retry) but non-blocking — a failed write must not withhold
             the workspace the user is still actively editing, only
             announce that the last write to it didn't land.
             `store.workspaceSaveState` is SyncService's one home for
             this fact (see types/app.ts); it persists across further
             local edits and clears only on the next successful PUT,
             never on a timer, so it can't disappear while the failure
             is still live. Retry is manual (`sync.retrySave()`),
             matching the load-error banner's own idiom below rather
             than introducing a second recovery model in the same app. -->
        <div
          v-if="store.workspaceSaveState.kind === 'error'"
          id="workspace-save-banner"
          role="alert"
        >
          <span class="save-banner-text">{{ $t('app.workspace.saveFailed') }}</span>
          <button class="action-btn-large" style="width: auto; padding-left: var(--space-medium); padding-right: var(--space-medium);" @click="sync.retrySave()">
            {{ $t('app.workspace.retry') }}
          </button>
        </div>

        <!-- Persistent system-log bar. Visible when either:
               (a) `systemLogExpanded` is checked in the Session (UI)
                   registry — the always-on case, or
               (b) `transientLogReveal` is currently flashing — an
                   error- or warning-level message arrived in the
                   last few seconds while `systemLogExpanded` was
                   false. See `composables/useTransientLogReveal.ts`
                   for the timer mechanics.
             Messages continue to accumulate in the store regardless
             of the visibility gate. -->
        <SystemLogPanel
          v-if="store.session.ui.systemLogExpanded || transientLogReveal"
        />

        <!-- Phase 1 (resolution roadmap, audit findings R1/R2/R6):
             `.axis-column` (state/layout-model.ts's LayoutClass,
             `layoutClass.axis === 'column'`) is a taller-than-wide
             workspace — half-screen tiles, portrait monitors — where
             the row shape crushed tree+control to their floors
             sharing a row that had no business existing (R1/R2) and
             let the board render at a fraction of the available width
             (R6, up to 48% letterboxed in a 1280×1440 tile). Below
             puts tree+control BELOW the board at full window width —
             the Sabaki/OGS shape — instead. See the `.axis-column`
             CSS rules (below this template) for what each descendant
             does differently; `workspaceAxisColumn`'s own comment
             above for the measurement this is derived from.
             `splitWorkspaceCentered` only applies in row axis — a
             column layout has nothing to horizontally center, every
             stacked child is already full-width. -->
        <div
          id="split-workspace"
          :class="{ 'axis-column': workspaceAxisColumn }"
          :style="splitWorkspaceCentered && !workspaceAxisColumn ? { justifyContent: 'center' } : {}"
        >

        <!-- resizer-rearch (nested-splitter amendment, ledger row
             391; geometry corrected per the live diagnostic,
             .claude/dispatch-reports/panel-weirdness-live-investigation.md
             §3/§6). #board-column is purely DERIVED — never a second
             writer (C2) — from the row's structural layout, and now
             `flex: 1 1 auto` (TRUE flex-fill, not `0 1 auto`): it
             absorbs 100% of whatever space the tree panel, BOTH
             resizer bars, and the control panel — each an
             independently-owned persisted fact
             (session.ui.treePanelWidthPx, session.ui.controlPanelWidthPx
             — see useResizablePanel.ts) — did NOT claim, CONTINUOUSLY,
             with no cap of its own. This is what makes a resizer bar
             ALWAYS track the cursor 1:1: the diagnostic measured up to
             541px of pointer/divider lag under the prior `flex: 0 1
             auto` shape, because that shape let #board-column stop
             absorbing freed space once its own aspect-ratio square
             saturated, decoupling every bar's screen position (which
             is a function of #board-column's width) from the drag
             past that point. The aspect-ratio SQUARE itself moves down
             one level, to #board-square below — see its own comment
             for why splitting "the row-flex slot" from "the visual
             square" is what fixes this without losing the square.

             boardColumnMaxWidthPx (commission row 848, "space should
             not be wasted" — useResizablePanel.ts's header, "Board-
             column width cap"): a HEIGHT-bound board-square can't
             render past the row's own height regardless of how much
             row WIDTH #board-column's flex-fill claims; left
             uncapped, the excess became dead centered margin around
             the square while #tree-control-wrapper starved at its
             floor. The cap freezes #board-column at its actual usable
             width once reached, and native flexbox hands the
             remaining free space to the wrapper's own flex-grow
             instead — undefined (not yet measured, controls
             collapsed, or an explicit dragged/restored wrapper width
             already governs the split) falls back to the prior
             uncapped behaviour. -->
        <div
          id="board-column"
          v-show="store.session.ui.boardExpanded"
          :style="!workspaceAxisColumn && boardColumnMaxWidthPx !== undefined ? { maxWidth: boardColumnMaxWidthPx + 'px' } : {}"
        >
          <!-- The visual board square + status bar, centered within
               whatever width #board-column (now unbounded) received.
               `align-self: center` (not the parent's default stretch)
               is what lets `aspect-ratio: 1/1` + `height: 100%` derive
               THIS element's width from its height, independent of
               #board-column's own (now often wider) box — exactly the
               same aspect-ratio-cap mechanism #board-column itself
               used to carry, just no longer coupled to the row's flex
               math. `max-width: 100%` preserves the existing
               overconstrained-viewport behavior: shrinks below the
               natural square (tall-narrow rectangle) rather than
               overflowing, and the board SVG's own preserveAspectRatio
               letterboxes inside it exactly as before. -->
          <div id="board-square">
            <div id="content">
              <BoardWidget
                v-if="activeBoard"
                :key="activeBoard.id"
                :state="activeBoard"
                @move="handleBoardMove"
                @paste-pv="handlePastePv"
              />
            </div>
            <StatusBar
              v-if="activeBoard"
              :board="activeBoard"
              :metadata="metadata"
              :can-pass="canPass"
              @update-komi="handleUpdateKomi"
              @update-rules="handleUpdateRules"
              @pass="handlePass"
            />
          </div>
        </div>

        <!-- OUTER resizer (nested-splitter amendment, ledger row 391;
             geometry per ledger row 414): sits between #board-column
             and #tree-control-wrapper, directly sets
             session.ui.treeControlRegionWidthPx — the WRAPPER's own
             width, never either pane inside it. Gated on
             controlsExpanded (matching the wrapper's own visibility
             below): with the control region entirely collapsed there
             is nothing for this bar to divide board-vs-wrapper room
             for that the tree's own presence doesn't already handle
             via #board-column's flex-fill. Also gated on
             `!workspaceAxisColumn` (Phase 1): in column axis
             tree+control stack full-width below the board — there is
             no board-vs-wrapper WIDTH split for this bar to drag; the
             drag affordance is inapplicable by construction (task
             charter), not a removed feature — the user's dragged
             session.ui.treeControlRegionWidthPx is left untouched and
             takes effect again the moment the workspace flips back to
             row axis. -->
        <div v-show="store.session.ui.controlsExpanded && !workspaceAxisColumn" class="panel-resizer" id="resizer-outer" @mousedown="startResizeOuter"></div>

        <!-- The combined tree+control region (nested-splitter
             amendment). TRUE nested flex container — see
             useResizablePanel.ts's header for why this two-level
             nesting (not one flat row with JS-derived widths) is what
             makes BOTH resizer bars track the cursor 1:1. Width bound
             to session.ui.treeControlRegionWidthPx ONLY while
             controlsExpanded — with the control panel hidden, the
             wrapper holds only the tree and should size to ITS
             content (140px default or the user's own
             treePanelWidthPx), not to a stored width that accounted
             for a control panel that isn't currently rendered.

             ui-5-3: reads effectiveTreeControlRegionWidthPx, NOT the
             raw store value — useResizablePanel.ts clamps the
             persisted number against #split-workspace's CURRENT live
             width on every render (not just mid-drag), so a value
             hydrated from a different/wider viewport (or otherwise
             stale/migrated/garbage) can never squeeze #board-column
             below MIN_BOARD_PX ("board restored minimized" after
             upgrading). See useResizablePanel.ts's header for the
             full rationale.

             fresh-profile floor (ledger row 802): the flex-fill branch
             below (never dragged, nothing to restore) previously had no
             width floor of its own — #tree-control-wrapper's CSS
             `min-width: 0` (needed so the two branches above can shrink
             it to an explicit px) applies here too, so on a first paint
             whose flex-share came out narrower than the wrapper's own
             content (tree + inner resizer + control-panel's floor),
             #control-panel overflowed past the wrapper and off the
             viewport's right edge (witnessed at a 1366×768 first paint —
             see useResizablePanel.ts's freshTreeControlWrapperFloorPx
             doc). `freshTreeControlWrapperMinWidthPx` supplies that
             floor, recomputed off treeExpanded so a tree-collapsed first
             paint doesn't over-reserve room for a hidden tree panel.

             Phase 3 (audit finding R3): the SAME flex-fill branch also
             now carries a `maxWidth` (`unsetWrapperMaxWidthCss`,
             useResizablePanel.ts / computeUnsetWrapperMaxWidthCss,
             state/layout-model.ts) — tree-default + resizer + the
             panel-content reading measure. Freezes the wrapper at its
             actual content need once the row is wide enough to exceed
             it, handing the freed flex-grow share to #board-column
             (flex: 1 1 auto) instead of leaving it as dead space inside
             an oversized #control-panel — the "surplus flows back to
             the board" half of R3. Applies ONLY to this never-dragged
             default branch; an explicit (dragged/restored)
             treeControlRegionWidthPx above is untouched.

             Init-vs-drag divergence fix (ledger rows 1505/1510): this
             flex-fill/maxWidth branch and #board-column's own
             boardColumnMaxWidthPx cap used to BOTH engage for every
             never-dragged render, and could both saturate below the
             row's actual width, leaving the remainder as dead space
             (the reported defect — a wide unused band right of the
             control panel, fixed only by a drag). effectiveTreeControl
             RegionWidthPx (useResizablePanel.ts) now resolves to an
             EXPLICIT default the instant the row is measured
             (computeTreeControlRegionDefaultWidthPx, state/layout-
             model.ts), so the branch above (line 791) is taken on
             every steady-state render instead of this one — this
             flex-fill branch, and boardColumnMaxWidthPx, now apply
             only for the single frame before that first measurement
             lands (rowWidthPx still 0), same transient window the
             bare CSS 140px #vue-tree-panel fallback below already
             covers. -->
        <!-- Phase 1: in column axis this wrapper's width comes from
             the `.axis-column` CSS rule (100%, flex-direction:
             column — tree above control, each full-width, natural
             height) instead of any of the three JS-derived styles
             below, which are ALL row-axis pixel-width branches
             (persisted, fresh-profile-floored, or none). The style
             binding itself falls through to `{}` in column axis so it
             never fights the CSS rule's `width`/`flex-direction`. -->
        <div
          id="tree-control-wrapper"
          :style="workspaceAxisColumn
            ? {}
            : store.session.ui.controlsExpanded && effectiveTreeControlRegionWidthPx !== undefined
              ? { flex: '0 0 auto', width: effectiveTreeControlRegionWidthPx + 'px' }
              : store.session.ui.controlsExpanded
                ? { flex: '1 1 0', minWidth: freshTreeControlWrapperMinWidthPx + 'px', maxWidth: unsetWrapperMaxWidthCss }
                : {}"
        >
          <!-- resizer-rearch charter amendment + maintainer constraint
               (ledger row 414): bound to session.ui.treePanelWidthPx —
               undefined until the user first drags the INNER bar
               (natural 140px default, byte-identical to the
               pre-amendment fixed width), an explicit px width after.
               This is the tree pane's ONLY write channel: no
               fit-to-content, no auto-grow on branch expansion or
               navigation — content changes never touch this value.
               See useResizablePanel.ts.

               Phase 3 (audit finding R5): the "never dragged" fallback
               no longer falls through to bare CSS 140px — it applies
               `treePanelDefaultWidthPx` (`computeTreePanelDefaultWidthPx`,
               state/layout-model.ts), a fraction of the workspace's own
               live width, floored at the SAME TREE_PANEL_MIN_WIDTH_PX
               this pane has always dragged down to. Still a pure
               render-time DEFAULT, not a second write channel: nothing
               here touches `session.ui.treePanelWidthPx`, and the
               moment the user drags #resizer-inner once, that stored
               value takes over verbatim, forever, exactly as before.

               Review follow-up (ledger rows 929/926): the width
               decision itself (full-width in column axis / stored
               verbatim / fraction default) is `treePanelBoundWidth`'s
               `computeTreePanelBoundWidth` call above, not an inline
               ternary here — see that computed's doc for the
               stored-drag-precedence property this now witnesses
               directly in `layout-model.test.ts`. -->
          <div
            id="vue-tree-panel"
            v-show="store.session.ui.treeExpanded"
            :style="treePanelStyle"
          >
            <div id="tree-panel-header">{{ $t('app.chrome.gameTreePanelHeader') }}</div>
            <TreeWidget
              v-if="activeBoard"
              :nodes="activeBoard.nodes"
              :board-id="activeBoard.id"
              :game-head-ids="activeBoardGameHeadIds"
              :known-position-node-ids="activeBoardKnownPositionNodeIds"
              :review-start-node-id="reviewSession.startingNodeId.value"
              :selected-for-mint-ids="activeBoardSelectedNodeIds"
              :analyzing-node-id="activeBoardAnalyzingNodeId"
              @select-node="handleNodeSelect"
            />
          </div>

          <!-- INNER resizer (ledger row 414): sits between
               #vue-tree-panel and #control-panel, INSIDE the wrapper.
               Directly sets session.ui.treePanelWidthPx — the tree
               pane's ONE write channel. -->
          <div v-show="store.session.ui.controlsExpanded && store.session.ui.treeExpanded && !workspaceAxisColumn" class="panel-resizer" id="resizer-inner" @mousedown="startResizeInner"></div>

          <!-- CONTROL_PANEL_MIN_WIDTH_PX (re-exported from
               useResizablePanel.ts; DECLARED in state/layout-model.ts,
               resolution-roadmap Phase 0) — projected from
               CONTROL_PANEL_TAB_IDS.length via
               computeControlPanelMinWidthPx, not a hand literal: audit
               finding R2's root cause was exactly a hand-picked 220px
               ("4 tabs") surviving a fifth tab shipping. A sixth tab
               (or `controlTabs` above growing) now moves this floor by
               construction. The iter-17 container-query threshold
               (479px, ForestDirectory.vue) is a SEPARATE derivation
               (its own content facts — the Cards-tab left-panel's
               natural width + its tree-panel's usable floor — live
               next to `computeForestNarrowThresholdPx` in
               state/layout-model.ts) — the two floors are not
               numerically coupled, despite this comment's own prior
               claim that changing one would invalidate the other.

               resizer-rearch geometry fix (ledger row 414): ALWAYS
               `flex: 1 1 0` — pure CSS flex-fill WITHIN the wrapper,
               no JS-derived width, no persisted fact of its own. This
               is what makes #resizer-inner track the cursor 1:1: the
               tree pane is directly dragged, and #control-panel
               absorbs the wrapper-local complement on the bar's OTHER
               side. See useResizablePanel.ts's header for the full
               argument. -->
          <div
            id="control-panel"
            v-show="store.session.ui.controlsExpanded"
            :style="workspaceAxisColumn
              ? {}
              : { flex: '1 1 0', minWidth: CONTROL_PANEL_MIN_WIDTH_PX + 'px' }"
          >
            <TabWidget
              :key="controlPanelIdentityKey"
              :tabs="controlTabs"
              v-model="activeTab"
            >

              <template #library>
                <div style="flex: 1; display: flex; min-height: 0; width: 100%;">
                  <LibraryTab
                    :two-column-reflow="panelContentPolicy.twoColumnReflow"
                    @open-library-game="handleLoadLibraryGame"
                    @open-library-game-new-tab="handleLoadLibraryGameInNewBoard"
                  />
                </div>
              </template>

              <template #cards>
                <div style="flex: 1; display: flex; min-height: 0; width: 100%;">
                  <ForestDirectory :two-column-reflow="panelContentPolicy.twoColumnReflow" @load-card="handleLoadCard" />
                </div>
              </template>

              <template #settings>
                <SettingsTab @force-save="sync.forceSave()" />
              </template>

              <template #analysis>
                <AnalysisControls v-if="activeBoard" :boardId="activeBoard.id" />
              </template>

              <template #other>
                <div class="tab-padding">
                  <h3 class="sub-header">{{ $t('other.section.knobRegistry') }}</h3>
                  <KnobRegistryEditor />

                  <h3 class="sub-header section-divider" style="margin-top: var(--space-loose);">{{ $t('other.section.gradientCalibration') }}</h3>
                  <p class="hue-slider-hint">{{ $t('other.label.gradientCalibrationNotice') }}</p>
                  <ColorDebugStrip :steps="500" />

                  <h3 class="sub-header section-divider" style="margin-top: var(--space-loose);">{{ $t('other.section.visitsLerp') }}</h3>
                  <VisitsLerpConfig />

                  <h3 class="sub-header section-divider" style="margin-top: var(--space-loose);">{{ $t('other.section.perQueryOverrides') }}</h3>
                  <PerQueryOverridesConfig />

                  <h3 class="sub-header section-divider" style="margin-top: var(--space-loose);">{{ $t('other.section.qeuboBookmarks') }}</h3>
                  <QeuboBookmarks />
                </div>
              </template>

            </TabWidget>
          </div>
        </div>
        </div>
      </template>

      <div
        v-else-if="store.workspaceLoadState.kind === 'loading'"
        id="workspace-boot-state"
        role="status"
        aria-busy="true"
        aria-live="polite"
      >
        <div class="workspace-boot-spinner" aria-hidden="true"></div>
        <p>{{ $t('app.workspace.loading') }}</p>
      </div>

      <div
        v-else-if="store.workspaceLoadState.kind === 'error'"
        id="workspace-boot-state"
        role="alert"
      >
        <p>{{ $t('app.workspace.loadFailed') }}</p>
        <button class="action-btn-large" style="width: auto; padding-left: var(--space-loose); padding-right: var(--space-loose);" @click="sync.retryHydrate()">
          {{ $t('app.workspace.retry') }}
        </button>
      </div>

    </div> </div>
  </RootErrorBoundary>
</template>

<style>
@import "./assets/css/theme.css";
@import "./assets/css/style.css";
@import "./assets/css/palettes.css";
/* Shared chrome classes consumed by other components (SettingsTab,
   ForestDirectory, ReviewSessionPanel, KeybindingsView, the editors
   and modals) — relocated out of this block 2026-06-11 so App.vue
   edits cannot silently restyle distant components. Imported here,
   after the three substrate sheets and before the App-local rules
   below, to preserve the cascade position the rules held in place. */
@import "./assets/css/shared-chrome.css";

#app {
  height: 100vh; width: 100vw;
  background-color: var(--surface-2); color: var(--text-0);
  overflow: hidden;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.resizing * { user-select: none !important; -webkit-user-select: none !important; }
#main-area { display: flex; flex-direction: row; height: 100%; width: 100%; overflow: hidden; }

/* The new main workspace column */
#main-workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: var(--surface-0);
}

/* magic-literal: 32px `.top-nav-bar` min-height. The bar hosts the
   sidebar-toggle button + Toolbar + right-side toggles. 32 is enough
   for the toggle buttons (text-emphasis font at ~14px line-box) plus
   2-3px of top/bottom margin so the bar reads as chrome, not crammed.
   `min-height` (not `height`) so iter-13's Toolbar `flex-wrap` can
   grow the bar vertically at narrow widths; if Toolbar's height
   changes from its current 28px floor, retune in tandem. */
.top-nav-bar {
  display: flex; align-items: center; background: var(--surface-0);
  border-bottom: 1px solid var(--border-1); padding: 0 var(--space-default); min-height: 32px; flex-shrink: 0;
}

/* The lower area where the resizer lives. justify-content is bound
   inline (splitWorkspaceCentered, script setup above) rather than
   here: it's conditional on runtime UI state (controlsExpanded),
   not a static rule. Default flex-start below; see
   splitWorkspaceCentered's comment for when it flips to centered. */
#split-workspace {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

/* ADR-0019 audit S1: cold-load loading/error state, occupying the
   same flex slot `#split-workspace` would (`#main-workspace`'s
   `flex-direction: column` + this block's `flex: 1`), so the
   toolbar-then-content layout shape doesn't jump when the gate
   resolves. Minimal — a pulsing dot (PboPopover's `.busy-dot`
   `@keyframes pulse` is the existing chrome idiom for a busy
   indication) plus centred text, not a full skeleton; C26 only
   needs a busy indication within ~1s, not a content-shaped
   placeholder. */
#workspace-boot-state {
  flex: 1; min-width: 0; min-height: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--space-default);
  color: var(--text-2); font-size: var(--text-emphasis);
}

/* Save-failure banner (menus-ui audit M14). Slim, non-blocking strip —
   contrast with #workspace-boot-state's error leg, which replaces the
   whole workspace because there is nothing to show yet; here the
   workspace IS showing and stays interactive, so this only occupies
   its own row. Background matches SystemLogPanel.vue:108's `.msg-error`
   treatment EXACTLY — `--state-attention` mixed with `transparent`, not
   `--surface-1` (review correction: `--surface-1` is exception-only in
   this SPA and reads low-contrast under the cluster palette; the prior
   annotation here claimed SystemLogPanel parity while actually mixing
   against `--surface-1`, which it does not). `--state-attention` alone
   is still the token that names "this is a failure" everywhere in the
   app. */
/* Keybinding-capture banner (M8(c)): opaque solid fill — deliberately
   NOT the `color-mix(…, transparent)` translucent treatment
   `#workspace-save-banner` below uses — per the standing ruling that a
   NEW indicator must be an opaque surface, never a translucent layer.
   `--text-on-accent` (theme.css, minted for LibraryTable.vue's
   `.library-row.selected`) is the established "text directly on a
   saturated chrome fill" role token — reused here rather than adding
   a new one for the same category of pairing (see StatusBar.vue's
   `.setup-mode-chip` and KeybindingRow.vue's `.row-capturing`, the
   same M8 audit finding's other two indicators). */
#keybinding-capture-banner {
  flex-shrink: 0;
  padding: var(--space-tight) var(--space-medium);
  background: var(--state-attention);
  color: var(--text-on-accent);
  font-weight: bold;
  text-align: center;
}
#workspace-save-banner {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-default);
  padding: var(--space-tight) var(--space-medium);
  background: color-mix(in srgb, var(--state-attention) 12%, transparent);
  border-bottom: 1px solid var(--state-attention);
  color: var(--text-0);
}
.save-banner-text { font-size: var(--text-body); }
.workspace-boot-spinner {
  width: 20px; height: 20px; border-radius: 50%;
  border: 3px solid var(--surface-2); border-top-color: var(--accent-primary);
  animation: workspace-boot-spin 0.8s linear infinite;
}
@keyframes workspace-boot-spin { to { transform: rotate(360deg); } }

/* resizer-rearch (replaces the release-scope item 7 board-width-cap
   model — see useResizablePanel.ts's header for the full defect this
   fixes, ADR-0019 audit S2; extended to a nested-splitter tree under
   the charter amendment, ledger row 391 / geometry ledger row 414;
   THIS shape corrected per the live diagnostic,
   .claude/dispatch-reports/panel-weirdness-live-investigation.md
   §3/§6, which measured a resizer bar decoupling from the cursor by
   up to 541px because a `flex: 0 1 auto` (never-grow) board column
   stops absorbing freed row space the moment its own aspect-ratio
   square saturates).

   `flex: 1 1 auto` — TRUE flex-fill. #board-column now claims 100% of
   whatever width #tree-control-wrapper (below — a TRUE nested flex
   container, itself bound to session.ui.treeControlRegionWidthPx, the
   OUTER bar's own persisted fact) did NOT claim — continuously,
   unconditionally, with no CSS-authored cap of its own here: no
   `max-width` or `aspect-ratio` in this static rule — the visual
   square lives one level down, in #board-square.

   The inline `:style` binding on the element (template, above —
   `boardColumnMaxWidthPx`, useResizablePanel.ts) DOES add a `max-
   width` conditionally, but it is disabled (`undefined`) the instant
   an explicit `treeControlRegionWidthPx` exists — which includes
   every frame of an active OUTER-bar drag, since `onMouseMoveOuter`
   writes that field on the very first `mousemove`. So the cap and the
   1:1-tracking argument below never overlap in time: while a drag is
   genuinely in flight, #board-column is exactly as uncapped as this
   comment always described; the cap only ever engages in the
   NO-EXPLICIT-WIDTH flex-fill distribution (never dragged, nothing
   restored), where there is no cursor to track yet. See
   useResizablePanel.ts's header, "Board-column width cap", for why
   that distribution needed one.

   Because #board-column is the OUTER row's
   ONLY flex-grow party, and the wrapper's own width is the ONLY thing
   the OUTER bar directly drags, #resizer-outer's screen position (a
   function of #board-column's width, since it sits immediately after
   it) tracks the cursor 1:1 across the bar's ENTIRE range — see
   useResizablePanel.ts's header for the full nesting argument, and
   the diagnostic's Anomaly 1 (up to 541px lag) / Anomaly 4 (board
   frozen for ~1250px of travel) for the failure mode this replaces. */
#board-column {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1 1 auto;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

/* The visual board square, pushed down from #board-column (see that
   rule's comment for why). `align-self: center` overrides the
   parent's default cross-axis stretch, which is what lets
   `aspect-ratio: 1/1` + `height: 100%` derive THIS element's width
   from its own height — the same mechanism #board-column used to
   carry directly, just no longer coupled to the row's flex math, so
   #board-column can be as wide as the row leaves it (absorbing freed
   space for bar-tracking continuity) while #board-square stays a true
   square (or a letterboxed tall-narrow rectangle when overconstrained
   — same fallback as before) regardless. `max-width: 100%` is the
   overconstrained-viewport floor: shrinks below the natural square
   rather than overflowing #board-column; the board SVG's own
   preserveAspectRatio letterboxes inside it exactly as before. */
#board-square {
  display: flex;
  flex-direction: column;
  align-self: center;
  height: 100%;
  aspect-ratio: 1 / 1;
  min-width: 0;
  max-width: 100%;
  min-height: 0;
}

#content { flex: 1; display: flex; justify-content: center; align-items: center; min-height: 0; }

/* The combined tree+control region — a TRUE nested flex container
   (nested-splitter amendment, ledger row 391 / geometry ledger row
   414). Its own width is session.ui.treeControlRegionWidthPx (bound
   inline, App.vue template) — the OUTER bar's persisted fact. `row`
   direction so #vue-tree-panel, #resizer-inner, and #control-panel
   lay out exactly like #split-workspace's own children one level up.
   `min-width: 0` is required for the SAME reason it's required on
   every flex item wrapping shrinkable content: without it, a flex
   item's automatic minimum size is its content's intrinsic width,
   which can force the wrapper wider than its own flex-basis. */
#tree-control-wrapper { display: flex; flex-direction: row; height: 100%; min-width: 0; min-height: 0; }

/* magic-literal: 140px `#vue-tree-panel` FALLBACK width (was 220px,
   iter-21 slim-down; was the sole default pre-Phase-3). Nested-splitter
   amendment (ledger row 391; maintainer constraint ledger row 414 —
   this is the tree pane's ONLY write channel, ever): the panel is
   user-resizable via the INNER `.panel-resizer` (`#resizer-inner`,
   inside the wrapper above). Phase 3 (audit finding R5): the inline
   `width` style (App.vue template) now ALWAYS wins once the workspace
   has been measured once — either `session.ui.treePanelWidthPx` (user
   dragged) or `treePanelDefaultWidthPx` (computed from live workspace
   width, `computeTreePanelDefaultWidthPx`, `state/layout-model.ts`) —
   so this bare CSS rule only paints the one frame before the first
   `ResizeObserver` callback lands (`rowWidthPx` still 0), where
   `computeTreePanelDefaultWidthPx` itself also degrades to
   `TREE_PANEL_MIN_WIDTH_PX` (140), keeping the two in sync by
   construction rather than by both hard-coding 140 independently.
   magic-literal: 5px padding-right — preserved
   from prior; gives the tree the standard tight margin against the
   right chrome edge without affecting tree-widget layout. */
/* Token categories per ledger row 742 (surface-token discipline): borders
   use border tokens, backgrounds use surface tokens. The pre-2026-08-07
   form (background: var(--border-1); border: var(--surface-1)) was a
   category inversion minted by the 2026-05-02 nearest-value var() sweep;
   background matches TreeWidget's own --surface-2. The vestigial
   padding-right: 5px (the "grey bar" the background used to show
   through) was removed by commissioner directive the same day. */
#vue-tree-panel { width: 140px; flex-shrink: 0; display: flex; flex-direction: column; border-left: 1px solid var(--border-1); background: var(--surface-2); min-height: 0; }
#tree-panel-header { height: 20px; background: var(--surface-0); border-bottom: 1px solid var(--border-1); display: flex; align-items: center; padding: 0 var(--space-default); font-size: var(--text-tiny); letter-spacing: var(--tracking-wide); color: var(--text-2); text-transform: uppercase; flex-shrink: 0; }
#control-panel { border-left: 1px solid var(--border-1); background: var(--surface-3); min-width: 0; display: flex; flex-direction: column; }

/* Phase 1 (resolution roadmap, audit findings R1/R2/R6) — column
   axis: the workspace is taller than it is wide (LayoutClass.axis
   === 'column', state/layout-model.ts), so tree+control move BELOW
   the board and take the full window width, Sabaki/OGS-style. Every
   row-axis rule above (the flex-fill board-column, the pixel-width
   nested splitter, the resizer bars) is superseded here rather than
   removed — the moment the workspace measures back into row axis,
   those rules and the user's persisted drag widths apply again
   unchanged (no second writer, ADR-0012: this class only ever
   overrides layout, never touches session.ui.treePanelWidthPx /
   treeControlRegionWidthPx). `overflow-y: auto` on the workspace
   itself: stacked board+tree+control can exceed one viewport's
   height where a side-by-side row never could, so THIS is the one
   axis-column rule that changes SCROLL behaviour, not just flex
   geometry. */
#split-workspace.axis-column {
  flex-direction: column;
  overflow-y: auto;
}
/* Width-bound instead of height-bound (row axis's #board-square:
   `height: 100%; aspect-ratio: 1/1`, deriving width FROM height): here
   the board takes the full stacked width and derives its OWN height
   from that width instead, so it renders at its actual usable size
   rather than a row-axis square letterboxed into a narrow row (audit
   finding R6, up to 48% letterboxed at a 1280×1440 tile). */
#split-workspace.axis-column #board-column {
  flex: 0 0 auto;
  width: 100%;
  height: auto;
}
#split-workspace.axis-column #board-square {
  width: 100%;
  height: auto;
  max-width: 100%;
  max-height: 100%;
}
/* Tree above control, each full-width and sized to its own natural
   content height — not a flex-grow split (row axis's `flex: 1 1 0`
   assumed a fixed-height ROW to divide; a column stack has no such
   shared height to divide, and forcing an equal vertical split would
   just reintroduce R1/R2's crush in the other axis). The INNER/OUTER
   resizer bars are v-show-hidden in this axis (App.vue template) —
   the row-only drag affordance the task charter names as
   inapplicable here, not a removed feature. */
#split-workspace.axis-column #tree-control-wrapper {
  flex-direction: column;
  width: 100%;
  height: auto;
}
#split-workspace.axis-column #vue-tree-panel {
  width: 100%;
  flex: 0 0 auto;
  border-left: none;
  border-top: 1px solid var(--border-1);
}
#split-workspace.axis-column #control-panel {
  width: 100%;
  flex: 1 1 auto;
  border-left: none;
  border-top: 1px solid var(--border-1);
}

/* theme-exception: .panel-resizer #eba46d is a peach accent color
   outside the substrate vocabulary (the chrome substrate has
   --accent-primary cyan and --accent-secondary orange #f0a04a; this
   peach is distinct from both). Used as a visual handle for both
   nested-splitter divider bars (#resizer-outer, board↔tree;
   #resizer-inner, tree↔control — see useResizablePanel.ts). */
.panel-resizer { width: 4px; background: #eba46d; cursor: col-resize; z-index: var(--z-affordance); flex-shrink: 0; transition: background var(--duration-default); }
.panel-resizer:hover, .panel-resizer:active { background: var(--accent-primary); }

.collapse-btn { background: var(--surface-0); border: 1px solid var(--border-2); color: var(--text-2); height: 18px; padding: 0 var(--space-tight); cursor: pointer; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-default); font-size: var(--text-body); }
.right-toggles { display: flex; gap: var(--space-default); margin-left: auto; }

/* Gradient-calibration notice (the hue-offset slider lifted into
   the cross-domain knob registry; see Other-tab Knob Registry's
   Display group). The preview strip below stays — it's the
   calibration view the slider feeds. */
.hue-slider-hint { font-size: var(--text-body); color: var(--text-1); margin: 0 0 var(--space-default) 0; }
</style>
