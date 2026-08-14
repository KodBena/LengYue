<script setup lang="ts">
/**
 * src/App.vue
 *
 * Root application component. Provides the top-level layout — since the
 * W1 LYT skeleton rework
 * (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`), this
 * renders a compiled LYT program (`state/lyt-layout.gen.ts` /
 * `state/lyt-layout-portrait.gen.ts`) through the generic `<LytNode>`
 * grid renderer, plus the tab bar and workspace auth scaffolding. The
 * <style> block carries App-local chrome only; the shared chrome classes
 * other components consume live in assets/css/shared-chrome.css
 * (imported below, relocated 2026-06-11 so editing this file cannot
 * silently restyle distant components).
 *
 * W3 (roadmap §8 W3): the program is now SCREEN-CLASS-SWAPPED —
 * `activeLytProgram`/`activeLytDomIdByPath` select landscape or portrait
 * per `activeScreenClassId`'s own nearest-neighbor derivation
 * (`state/layout-model.ts`, SPEC.md §6) — and the OUTER/INNER resizer
 * bars (L4, `useResizablePanel.ts`) are reinstated, rewired to write
 * grid-track overrides via `lytTrackStyleOverrides` rather than the
 * pre-LYT flex `:style` bindings. The five `session.ui.*Expanded` fields
 * remain untouched and unread by this skeleton — board/tree/control-
 * panel are unconditionally shown (roadmap §5: tree "always visible",
 * board "never optional", control panel a permanent black box);
 * `sidebarExpanded`'s region (boardRail) and `boardRail`'s sibling
 * `previewBoard` are both `presenceDefaultVisible: false` in the
 * compiled program, so LytNode.vue renders neither unless the corner
 * presence menu (W2) turns them on — see `state/lyt-widget-registry.ts`'s
 * own notes on both. The old `.top-nav-bar` (Toolbar mounted horizontally
 * above the workspace row) is superseded: two purposed clusters —
 * `ToolbarEngineCluster.vue` (connect/disconnect, the engine-controls
 * button cluster, engine metrics) and `ToolbarAppCluster.vue` (Load/Save
 * SGF, sliders/setup/PBO popovers, the engine URI editor, the locale
 * picker) — now mount into the side column's `A_engine`/`A_app` leaves in
 * landscape, or the same-named leaves in portrait (retaining that class's
 * pre-existing A_top/I_engine tree positions — see
 * `research/lyt/encodings/lengyue_portrait.lyt`'s own header for why no
 * structural reshuffle was needed there).
 *
 * LYT TOOLBAR ONTOLOGY REENCODE (commissioner-ratified 2026-08-11, ledger
 * rows 1930/1931; `.claude/dispatch-reports/lyt-toolbar-ontology-reencode.md`):
 * the former single `Toolbar.vue` mount spanning three stacked bands
 * (A_go/I_engine/A_common) is replaced by these two clusters, one leaf
 * each, so the reservation the `.lyt` encoding grants is envelope-based
 * over engine connection state for the engine cluster (item 2 — the
 * commissioner's witnessed defect, "actions still reorganize the buttons
 * in the toolbar [on] connecting", forecloses by construction: connecting
 * changes what's ENABLED/VISIBLE within the reserved slot, never where
 * anything sits) and structurally separate for the app cluster (item 3).
 * The move-navigation cluster (|< < > >|) relocates out of the toolbar
 * entirely, into `StatusBar.vue` — see that file's own header note
 * (item 1, "board controls go to the board").
 *
 * Repair pass (ledger row 1781, W1 REPAIR;
 * `.claude/dispatch-reports/lyt-w1-skeleton-review.md` findings A/B):
 * two defects in the rejected prior attempt are fixed here, both at
 * the REALIZATION layer (the finding A root-cause note below explains
 * why a realization fix, not an encoding correction, is the honest fix
 * for the toolbar overflow) —
 *
 *  - Finding B (DOM-id wiring): `LYT_DOM_ID_BY_PATH`'s ids never
 *    resolved to real elements because `LytNode.vue`'s own recursive
 *    calls didn't thread each instance's OWN path down — every nested
 *    grid `<div>` looked up the SAME `''` key. Fixed in `LytNode.vue`
 *    itself (see that file's header); this file's own
 *    `LYT_DOM_ID_BY_PATH` map and its call site are unchanged from the
 *    prior attempt (they were already correct — the bug was entirely
 *    inside the renderer).
 *  - Finding A (toolbar clipped off-viewport): `Toolbar.vue`'s own
 *    `.toolbar` rule (scoped, unmodified — Toolbar.vue has exactly one
 *    other mount site, `App.vue` itself, so nothing else depends on its
 *    old sizing behaviour) declares `flex-shrink: 0` — correct for its
 *    PRE-rework mount (a full-viewport-width `.top-nav-bar` that never
 *    needed to shrink) but wrong for this NEW mount: as a flex item
 *    inside `.lyt-toolbar-strip`'s row, `flex-shrink: 0` pins `.toolbar`
 *    at its own unwrapped natural content width (measured ~1532px at
 *    1920×1080) rather than letting it shrink down to the ~820px cell,
 *    so its OWN internal `flex-wrap: wrap` never had a reason to engage
 *    — wrap only fires when the box's WIDTH is constrained below the
 *    content's natural flow width. The fix below (`.lyt-toolbar-strip
 *    .toolbar`, a plain global selector — App.vue's `<style>` block is
 *    NOT `scoped`, so it reaches Toolbar.vue's own `scoped` `.toolbar`
 *    class by name without needing `:deep()`, which is a scoped-block-
 *    only feature) overrides `flex-shrink`/`flex-basis`/`min-width`
 *    at THIS mount site only (Toolbar.vue's own file is untouched, so
 *    a future second mount elsewhere keeps the original full-width
 *    behaviour) — this lets `.toolbar`'s existing `flex-wrap: wrap`
 *    mechanism do exactly the job its own CSS comment already claims
 *    ("wraps onto multiple rows when squeezed"), now actually squeezed.
 *    See the `<style>` block's own comment on the rule for the measured
 *    before/after and why this is a realization fix, not an encoding
 *    correction (the reserved BOX itself — 820px × 84px — already
 *    exceeds the wrapped content's floor once wrapping is engaged; the
 *    prior attempt's realization simply never let the box's width
 *    constrain the content).
 *
 * Finding A, dated note (2026-08-11, toolbar ontology reencode): the
 * `Toolbar.vue` this finding names was retired by the reencode above —
 * its `.toolbar`/`flex-shrink:0` shape is gone, replaced by
 * `ToolbarEngineCluster.vue`/`ToolbarAppCluster.vue`, each authoring the
 * same shrink-and-wrap behaviour natively in its own scoped stylesheet
 * (`.engine-cluster`/`.app-cluster`, `flex-wrap: wrap`, no `flex-shrink:
 * 0`) rather than needing this file's override rule at all — see the
 * `<style>` block below, `.lyt-toolbar-strip .toolbar` no longer exists.
 * Finding A's own lesson (flex-shrink:0 defeats wrap under a squeeze)
 * stands as the historical record of why; it does not describe live code
 * after this dated note per ADR-0002 Rule 6.
 *
 * [corrected 2026-08-12, M2 stage B2b boot-restoration wiring,
 * `.claude/dispatch-reports/lyt-boot-restoration.md`, ledger row 2346]:
 * `ToolbarEngineCluster.vue` (named several places above) is itself now
 * retired — ruling row 2073's own three-vocabulary decomposition needs
 * FOUR independently-mounted leaves (`A_engine_controls`/`_eval`/
 * `_health`/`_queue`), not one merged cluster. `ToolbarEngineControls.vue`
 * is its direct successor for the button cluster;
 * `ToolbarEngineMetrics.vue` (now `group`-parameterised) and
 * `EngineQueueTooltip.vue` (mounted directly) cover the three info
 * groups. `SetupToolPalette` also moves out of `ToolbarAppCluster.vue`
 * into its own new `A_setup` leaf (ruling row 2108) — see
 * `state/lyt-widget-registry.ts`'s own updated entries for the full
 * grounding and disclosed scope calls. The paragraphs above describing
 * the pre-B2b two-cluster shape are historical, not live code, per the
 * same ADR-0002 Rule 6 convention Finding A's dated note already
 * establishes in this file.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, watch } from 'vue';
import { ref as vueRef, type ComponentPublicInstance } from 'vue';
import { useI18n } from 'vue-i18n';

import { useMetadata }       from './composables/auth-app/useMetadata';
import { useEngineControls } from './composables/useEngineControls';
import { useUserIORegistry } from './composables/useUserIORegistry';
import { useAuth }           from './composables/auth-app/useAuth';
import { workspaceIdentityKey } from './composables/auth-app/workspace-identity-key';
import {
  getPanelContentPolicy,
  useDeferredLayoutClass,
  computeTreePanelDefaultWidthPx,
  TREE_CONTROL_WRAPPER_ROW_GAP_PX,
} from './state/layout-model';
import type { LytTrackShape } from './state/lyt-layout-types';
import { useSideColumnLiveLayout } from './composables/chrome/useSideColumnLiveLayout';
import { resolveRootSplitLiveLayout } from './state/feasible-layout';
import type { Px, SideColumnFixedRegion } from './state/feasible-layout';
import { MIN_BOARD_PX } from './state/layout-model';
import { useDirtyBoardGuard } from './composables/board/useDirtyBoardGuard';
import { useAppBootstrap } from './composables/auth-app/useAppBootstrap';
import { useWorkspaceRecovery } from './composables/auth-app/useWorkspaceRecovery';
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

import type { BoardId, NodeId }   from './types';
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

import LytNode           from './components/chrome/LytNode.vue';
import { LYT_LANDSCAPE }  from './state/lyt-layout.gen';
import { LYT_PORTRAIT }   from './state/lyt-layout-portrait.gen';
import { useResizablePanel } from './composables/chrome/useResizablePanel';
import { buildLytProgramIndex, lytParentPath, lytOrientationToProp } from './composables/chrome/useLytProgramIndex';
import { usePopoverEdgeClamp } from './composables/chrome/usePopoverEdgeClamp';
import { useDismissiblePopover } from './composables/chrome/useDismissiblePopover';
import type { LytPresenceTargetId } from './composables/chrome/useLytPresenceMenu';
import BoardWidget      from './components/board/BoardWidget.vue';
import TreeWidget       from './components/tree/TreeWidget.vue';
import SettingsSubstrip from './components/chrome/SettingsSubstrip.vue';
import SettingsPane     from './components/chrome/SettingsPane.vue';
import AnalysisControls from './components/editors/AnalysisControls.vue';
import ToolbarEngineControls from './components/chrome/ToolbarEngineControls.vue';
import ToolbarEngineMetrics  from './components/chrome/ToolbarEngineMetrics.vue';
import EngineQueueTooltip    from './components/chrome/EngineQueueTooltip.vue';
import ToolbarAppCluster    from './components/chrome/ToolbarAppCluster.vue';
import SetupToolPalette     from './components/chrome/SetupToolPalette.vue';
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
import SidebarWidget     from './components/chrome/SidebarWidget.vue';
import LytPresenceMenu   from './components/chrome/LytPresenceMenu.vue';
import BoardRailPopoverTrigger from './components/chrome/BoardRailPopoverTrigger.vue';
import DebugMenu from './components/chrome/DebugMenu.vue';
import SystemLogToggle from './components/chrome/SystemLogToggle.vue';
import CornerStackHost from './components/chrome/CornerStackHost.vue';
import PreviewBoardPanel from './components/board/PreviewBoardPanel.vue';
import WorkspaceRecoveryGate from './components/chrome/WorkspaceRecoveryGate.vue';

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

// ── LYT root measurement + resizers (W3) ─────────────────────────────
//
// W1 stood up a NARROW, standalone ResizeObserver here (no resizers that
// wave). W3 (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
// §8 W3, §4 item 1) reinstates the L4 drag machinery, REWIRED to the LYT
// skeleton (`useResizablePanel.ts`'s own header, "W3 rewire", has the
// full derivation) — that composable owns the SAME `#split-workspace`
// ResizeObserver this file used to stand up independently, so it is
// reused here directly (`rowWidthPx`/`rowHeightPx` below are its own
// return values) rather than duplicated (ADR-0010 imperative-escape
// discipline: one observer per measured element).
// GAP A (`.claude/dispatch-reports/lyt-cure-final-repair.md`): the
// composable's own `effectiveTreeControlRegionWidthPx` is no longer
// destructured here — App.vue's own `rootSplitLayout` (below) now owns
// the side column's track override, including its own byte-identical
// reproduction of the sovereign (dragged) branch. The composable's
// export itself is UNCHANGED (`useResizablePanel.test.ts`/
// `resizer-restore-clamp.test.ts`/`lyt-default-layout.test.ts` all drive
// it directly, unaffected by this file's own consumption change).
const {
  startResizeInner,
  startResizeOuter,
  outerRowSovereignDiagnostic,
  rowWidthPx,
  rowHeightPx,
  sideColumnWidthPx,
} = useResizablePanel();

const layoutClass = useDeferredLayoutClass(rowWidthPx, rowHeightPx);

// ── Screen-class swap (W3, roadmap §4 item 2) ────────────────────────
//
// `layoutClass.value.screenClassId` (SPEC.md §6 nearest-neighbor,
// `state/layout-model.ts`) selects WHICH compiled program renders — a
// whole-program swap, not a per-node CSS branch. Both `.lyt` encodings
// share their widget ids verbatim for every shared role (`research/lyt/
// runner.py`'s own registration comment, read in full), so every
// existing `#leaf-*` template slot below works unchanged for whichever
// program is active. LYT toolbar ontology reencode (2026-08-11):
// portrait's former `A_top`/`I_engine` ids (which used to diverge in
// disposition from landscape's own A_go/I_engine/A_common — see
// `lyt-widget-registry.ts`'s prior "class-scoped overrides" note) are
// renamed to the SAME `A_app`/`A_engine` ids landscape now uses, both
// 'mounted' identically in both classes — the divergence this comment
// used to describe is gone, and so is the override table that carried
// it (see that file's own header for the simplification).
const activeScreenClassId = computed(() => layoutClass.value.screenClassId);
const activeLytProgram = computed(() => (activeScreenClassId.value === 'portrait' ? LYT_PORTRAIT : LYT_LANDSCAPE));

// LYT R1 PART 2 (`.claude/dispatch-reports/lyt-r1-orientation-pathmap.md`,
// ADR-0011 Rule 2 trigger, row 2345): every path-keyed fact below this
// point is DERIVED from `activeLytProgramIndex` — a `widget id -> path`
// index built by walking the active compiled program ONCE
// (`useLytProgramIndex.ts`) — rather than a hand-copied literal dotted
// path. A widget id (`B`, `tree`, `controlPanel`) is the STABLE identity
// `emit_layout_tree.py` never renumbers; the PATH is the artifact that
// shifts whenever a `.lyt` encoding edit inserts/removes a sibling (the
// 2.2->2.3 incident this file's own git history records, and the M2 stage
// B2a/B2b `A_setup` insertion's SECOND instance of the same class,
// row 2345). `tests/unit/lyt-path-key-regression.test.ts` now asserts the
// DERIVATION itself (a widget id resolves to a path that exists in the
// program) rather than a set of hard-coded path literals.
const activeLytProgramIndex = computed(() => buildLytProgramIndex(activeLytProgram.value));

/** Fails loudly (ADR-0002) when a widget id this file depends on has no
 *  path in the active compiled program — an absent widget id here means
 *  the `.lyt` encoding dropped or renamed it, which every consumer below
 *  needs to know about immediately rather than silently rendering with an
 *  undefined DOM id / track override. */
function requireWidgetPath(widgetId: string): string {
  const path = activeLytProgramIndex.value.widgetPaths[widgetId];
  if (path === undefined) {
    throw new Error(
      `App.vue: no path resolves for widget id "${widgetId}" in the active compiled LYT program ` +
        `(classId=${JSON.stringify(activeScreenClassId.value)}) — every widget id this file's ` +
        'path-keyed derivations depend on must exist in every registered screen class.',
    );
  }
  return path;
}

/** Finish-pass wave A completion pass review addendum (2026-08-13,
 *  `.claude/dispatch-reports/lyt-wA-width-demotion-review.md`, "New
 *  finding"): fails loudly (ADR-0002) when a widget id the side-column
 *  tree clamp / width-demotion reservation depends on has no wrapping
 *  `LytChild.track` in the active compiled program — mirrors
 *  `requireWidgetPath`'s own contract for the track fact instead of a
 *  second, per-call-site undefined check. */
function requireTrack(widgetId: string): LytTrackShape {
  const track = activeLytProgramIndex.value.trackByWidget[widgetId];
  if (track === undefined) {
    throw new Error(
      `App.vue: no compiled track resolves for widget id "${widgetId}" in the active LYT program ` +
        `(classId=${JSON.stringify(activeScreenClassId.value)}) — the side-column tree clamp / ` +
        'width-demotion reservation has nothing to read.',
    );
  }
  return track;
}

// LYT R1 PART 1 (`.claude/dispatch-reports/lyt-r1-orientation-pathmap.md`,
// commissioner ruling row 2310): the compiled program's `tree` leaf now
// carries an `orientation` field (Amendment 9 / M2 stage F1's `orient`
// key, `state/lyt-layout-types.ts`'s own `LytLeafNode.orientation` doc) —
// this reads it straight through to `TreeWidget`'s own `orientation` prop
// rather than the prop's hardcoded `'vertical'` default. DISCLOSED FACT
// (verified directly against both `.gen.ts` files, `research/lyt/SPEC.md`
// §17.4, and a live re-solve of both encodings at every representative
// screen size, `research/lyt/runner.py`'s own `SCREEN_SIZES`): the
// emitted value is `'v'` in BOTH classes today, and — because
// `emit_layout_tree.py`'s `build_program` calls `loader.load_layouts`
// directly and never threads the derivation through
// `orientation.rebind`/`compute_derived_orientations` — that emitted
// value is the LOAD-TIME UNDECLARED DEFAULT, not a value the Amendment 9
// derivation mechanism actually computed for emission. A direct re-solve
// (this commission's own build-report has the transcript) confirms the
// GENUINE derivation independently agrees with `'v'` at every OPTIMAL
// representative size in both classes — `tree`'s own residual box is
// structurally narrow-and-tall everywhere the current encoding solves
// (its width is capped near its own floor by the side column's `max
// 340px+60ch` bound minus the control-panel Exclusive's now-pinned 664px
// floor, while its height inherits the row's full — much taller —
// extent) — so wiring the compiled static value is not a design gap: it
// is what the model says, and no live-resize scenario within this
// encoding's own feasible region is known to disagree with it. A future
// `.lyt` edit that widens the side column enough for `tree` to actually
// go wide-and-short would need `emit_layout_tree.py` to thread the
// derivation through before this field's emitted value could ever
// reflect it — out of this commission's own scope (research/lyt language
// substrate), named here rather than silently assumed away.
const activeTreeOrientation = computed<'vertical' | 'horizontal'>(() => {
  const leaf = activeLytProgramIndex.value.leafNodes['tree'];
  if (!leaf) {
    throw new Error(
      `App.vue: no leaf node resolves for widget id "tree" in the active compiled LYT program ` +
        `(classId=${JSON.stringify(activeScreenClassId.value)}) — TreeWidget's orientation prop ` +
        'has nothing to read.',
    );
  }
  return lytOrientationToProp(leaf.orientation);
});

// path -> DOM id, derived from the widget ids each legacy id anchors on
// (commission item 4's own load-bearing hooks, unchanged): 'board-area' /
// 'tree-control-wrapper' are the PARENT Split of the `B` / `tree` leaves
// respectively (the board composite, and the tree/control/preview row);
// 'board-square' / 'vue-tree-panel' are those leaves' own paths directly;
// 'control-panel' is the `controlPanel` Exclusive node's own path. Same
// map shape for both classes — only the underlying paths differ (derived,
// never hand-transcribed per class).
const activeLytDomIdByPath = computed<Record<string, string>>(() => {
  const boardPath = requireWidgetPath('B');
  const treePath = requireWidgetPath('tree');
  const controlPanelPath = requireWidgetPath('controlPanel');
  return {
    '': 'split-workspace',
    [lytParentPath(boardPath)]: 'board-area',
    [boardPath]: 'board-square',
    [lytParentPath(treePath)]: 'tree-control-wrapper',
    [treePath]: 'vue-tree-panel',
    [controlPanelPath]: 'control-panel',
  };
});

// W3 resizer drag overrides — see LytNode.vue's own header ("Resizer
// drag overrides") for the override-wins-verbatim contract. INNER
// (tree-panel width) applies to BOTH classes at the `tree` leaf's own
// derived path. OUTER (tree+control REGION width) is LANDSCAPE-ONLY this
// wave — DISCLOSED NARROWING: landscape's OUTER bar drags the SIDE
// COLUMN (the `tree` leaf's own grandparent Split — the row containing
// `tree` is itself a child of the side column, whose board-priority-clamp
// track IS a WIDTH fact — see useResizablePanel.ts's header for the
// wrapper-vs-side-column derivation); portrait has no analogous "side
// column beside the board" concept (its board composite is a separate
// ROW, not a width-contested sibling), so what the OUTER bar's persisted
// WIDTH fact should even mean in a single-column stack is a genuine open
// design question, not one this wave invents an answer to. `startResizeOuter`
// and its corner bar are therefore only mounted in landscape (template
// below); `treeControlRegionWidthPx` itself is untouched by a portrait
// session (never written there), so returning to landscape restores
// the user's own prior drag exactly.
// HISTORICAL (superseded by dispatch L3, below): the finish-pass wave A
// completion pass and its two 2026-08-13 dated addenda, plus finish-
// pass-2 finding N2, hand-rolled the side column's own tree-vs-siblings
// reservation across four separate `layout-model.ts` functions
// (`clampTreeWidthForSideColumn`, `resolveTreeRowWidthPx`,
// `sumFixedRowSiblingReservationPx`, `resolveWidthConditionalPresence`,
// plus `computeTreePanelClampedWidthPx`) — the full worked diagnoses
// (the 2560x1440 clip, the generalized-reservation addendum, the N2
// un-dragged widen fix) are preserved in those functions' own deleted
// headers, transcribed in full in `.claude/dispatch-reports/
// lyt-space-owner-l3-build.md`'s "Transcribed disclosures" section per
// ADR-0002 Rule 6 (a disclosed narrowing never dies with its function).
// All four are DELETED by dispatch L3; the mechanism they hand-rolled is
// now the one live solve below.
// Dispatch L3 (`.claude/dispatch-reports/lyt-space-owner-spec.md` §3 step
// 3, ledger rows 2447/2450/2460/2461): the side-column row (`tree`,
// `controlPanel`, `previewBoard`) is now solved LIVE by
// `resolveSideColumnLiveLayout` (`state/feasible-layout.ts`) — the four
// `layout-model.ts` clamp functions the paragraphs above described
// (`clampTreeWidthForSideColumn`, `resolveTreeRowWidthPx`,
// `sumFixedRowSiblingReservationPx`, `resolveWidthConditionalPresence`)
// are DELETED by this dispatch; every computed below reads THIS one
// solve's own output instead of re-deriving its own slice of the row.
// `treeWidgetRef` closes dispatch L2b's own residual item — that build's
// own report named `contentDemandPx` as wired into `TreeWidget.vue` but
// never consumed by the live rendering path; it is consumed here, as the
// `tree` region's own `maxUsefulPx` ceiling — THE decisive fact behind
// the flagship fix (§3 step 3's own "the control panel must be PRESENT
// with the tree capped at its content demand").
//
// Presence arc P2b item 1: the active screen class's own compiled
// `presenceDefaultVisible`, per presence-menu target — derived ONCE off
// `activeLytProgramIndex` (ADR-0012 P1) and threaded into
// `<LytPresenceMenu>`'s own `classDefaults` prop, which forwards it into
// `useLytPresenceMenu.ts`. MOVED above `sideColumnOtherRegions`/
// `sideColumnLayout` below (dispatch L3) — see the ordering note further
// down, at this declaration's ORIGINAL location, for why the reorder is
// load-bearing (a real jsdom-witnessed TDZ `ReferenceError`, not a style
// preference).
const lytPresenceClassDefaults = computed<Partial<Record<LytPresenceTargetId, boolean>>>(() => {
  const d = activeLytProgramIndex.value.widgetDefaultVisible;
  return {
    boardRail: d.boardRail,
    previewBoard: d.previewBoard,
    controlPanel: d.controlPanel,
    A_setup: d.A_setup,
  };
});

// Finish-pass wave A: the `controlPanel` Exclusive's own compiled
// `@demote` declaration (778px landscape / 808px portrait — P1's derived
// thresholds), read off the SAME `activeLytProgramIndex` walk every other
// per-class fact above already reads (ADR-0012 P1) rather than a second,
// hand-typed literal per class. MOVED above `sideColumnOtherRegions`
// alongside `lytPresenceClassDefaults` — same reorder, same reason.
const controlPanelDemote = computed(() => activeLytProgramIndex.value.demoteByWidget.controlPanel ?? null);

const treeWidgetRef = vueRef<InstanceType<typeof TreeWidget> | null>(null);
const treeContentDemandPx = computed<Px | null>(() => treeWidgetRef.value?.contentDemandPx ?? null);
const treeDefaultPx = computed<number>(() => computeTreePanelDefaultWidthPx(rowWidthPx.value));

// `others`, in row order — every OTHER fixed-demand sibling the side
// column can carry. `desiredControlPanel`/`desiredPreviewBoard` read
// straight off the persisted-or-class-default chain, deliberately NOT
// through `lytPresenceOverrides` below (itself DERIVED from this solve's
// own output, `sideColumnLayout` — a forward read INTO this computed
// would be circular).
const sideColumnOtherRegions = computed<readonly SideColumnFixedRegion[]>(() => {
  const presence = store.session.ui.lytPresence;
  const desiredControlPanel = presence.controlPanel ?? lytPresenceClassDefaults.value.controlPanel ?? true;
  const desiredPreviewBoard = presence.previewBoard ?? lytPresenceClassDefaults.value.previewBoard ?? false;
  return [
    {
      widgetId: 'controlPanel',
      track: requireTrack('controlPanel'),
      desiredVisible: desiredControlPanel,
      demote: controlPanelDemote.value,
    },
    {
      widgetId: 'previewBoard',
      track: requireTrack('previewBoard'),
      desiredVisible: desiredPreviewBoard,
      demote: null,
    },
  ];
});

const sideColumnLayout = useSideColumnLiveLayout({
  wrapperWidthPx: sideColumnWidthPx,
  gapPx: TREE_CONTROL_WRAPPER_ROW_GAP_PX,
  treeTrack: computed(() => requireTrack('tree')),
  treeMaxUsefulPx: treeContentDemandPx,
  treeSovereignPx: computed(() => store.session.ui.treePanelWidthPx),
  treeDefaultPx,
  others: sideColumnOtherRegions,
  screenClassId: activeScreenClassId,
});

// outerRowSovereignPushGate (dispatch L3): `outerRowSovereignDiagnostic`
// (`useResizablePanel.ts`) is a PLAIN computed with no push side effect
// of its own — see that computed's own header for why. Only App.vue
// knows the active screen class, and the OUTER bar's own width fact
// (`treeControlRegionWidthPx`) is LANDSCAPE-ONLY (this file's own
// header, "W3 resizer drag overrides" / "DISCLOSED NARROWING") — a
// value carried over from an earlier landscape session must not push a
// spurious "board starved" diagnostic while the SPA is rendering
// portrait, where that stored fact means nothing (WITNESSED: an early
// build pushed exactly this spurious diagnostic in the layout-audit's
// own portrait geometries, inflating the system-log-panel and
// cascading into unrelated `viewport-escape`/`target-size` findings —
// caught by the audit's own before/after baseline comparison, not
// silently shipped). Dedup mirrors `useSideColumnLiveLayout.ts`'s own
// convention: push only when the starved-region SET changes.
let lastPushedOuterRowDiagnosticKey = '';
watch(
  () => (activeScreenClassId.value === 'landscape' ? outerRowSovereignDiagnostic.value : []),
  (diagnostics) => {
    if (diagnostics.length === 0) {
      lastPushedOuterRowDiagnosticKey = '';
      return;
    }
    const key = diagnostics.map((d) => `${d.location}:${d.starved.map((s) => s.region).join(',')}`).join('|');
    if (key === lastPushedOuterRowDiagnosticKey) return;
    lastPushedOuterRowDiagnosticKey = key;
    // Dispatch L3 repair (`.claude/dispatch-reports/
    // lyt-space-owner-l3-review.md` §3 condition 3, residual): mirrors
    // `useSideColumnLiveLayout.ts`'s own inner-bar wiring exactly — the
    // outer bar's own `SovereignOverrideDiagnostic` carries the SAME
    // `remediation`/`nextAction` fields, so it threads them through the
    // same sink `details` parameter rather than diverging between the
    // two symmetric bars.
    for (const d of diagnostics) {
      pushSystemMessage('warning', d.message, { remediation: d.remediation, nextAction: d.nextAction });
    }
  },
);

// GAP A (`.claude/dispatch-reports/lyt-cure-final-repair.md`, ledger
// rows 2502/2503): `boardRail`'s own live reserved width — mirrors
// `LytNode.vue`'s own internal `boardRailReservedPx` computed (that
// file's own header, "boardRail reservation generalization") at the
// App.vue level, since `resolveRootSplitLiveLayout` (below) needs the
// SAME number LytNode.vue's `trackList` already derives for the ROOT
// split's own `board-priority-clamp` CSS branch, and App.vue is the one
// place that already resolves boardRail's own final presence
// (`lytPresenceOverrides`, above — the `railStyle === 'popover'` override
// included). Not a second, independently-driftable derivation of
// presence: only the RESERVATION ARITHMETIC (fixed px + one root gap) is
// new here, reusing `lytPresenceOverrides.value.boardRail` verbatim.
const boardRailReservedPx = computed<number>(() => {
  const present = lytPresenceOverrides.value.boardRail ?? lytPresenceClassDefaults.value.boardRail ?? false;
  if (!present) return 0;
  const track = requireTrack('boardRail');
  return track.kind === 'fixed' ? track.px + activeLytProgram.value.root.gapPx : 0;
});

// GAP A: the root split (board composite vs. side column, root children
// "1"/"2") brought under `FeasibleLayout`'s live-measurement authority —
// see `resolveRootSplitLiveLayout`'s own header (`state/feasible-
// layout.ts`) for the full derivation. LANDSCAPE-ONLY, mirroring the
// OUTER bar's own existing disclosed narrowing (this file's own header,
// "W3 resizer drag overrides" / "DISCLOSED NARROWING") — portrait's
// board composite is a separate ROW, not a width-contested sibling of
// any side column, so this solve has nothing to replace there.
const rootSplitLayout = computed(() => {
  if (activeScreenClassId.value !== 'landscape') return null;
  const treePanelPath = requireWidgetPath('tree');
  const sideColumnPath = lytParentPath(lytParentPath(treePanelPath));
  const sideColumnTrack = activeLytProgram.value.root.children.find((c) => c.path === sideColumnPath)?.track;
  if (sideColumnTrack === undefined || sideColumnTrack.kind !== 'board-priority-clamp') {
    throw new Error(
      `App.vue: side column's own compiled root-split track at path ${JSON.stringify(sideColumnPath)} is ` +
        `${JSON.stringify(sideColumnTrack?.kind ?? null)}, not "board-priority-clamp" (ADR-0002) — ` +
        'resolveRootSplitLiveLayout has nothing to read.',
    );
  }
  return resolveRootSplitLiveLayout({
    rowWidthPx: rowWidthPx.value,
    rowHeightPx: rowHeightPx.value,
    gapPx: activeLytProgram.value.root.gapPx,
    boardRailReservedPx: boardRailReservedPx.value,
    board: {
      fixedSiblingSumPx: sideColumnTrack.fixedSiblingSumPx,
      naturalBoardCrossUnit: sideColumnTrack.naturalBoardCrossUnit,
    },
    sideColumn: { minPx: sideColumnTrack.minPx, maxPx: sideColumnTrack.maxPx },
    boardFloorPx: MIN_BOARD_PX,
    sovereignWrapperPx: store.session.ui.treeControlRegionWidthPx,
  });
});

const lytTrackStyleOverrides = computed<Record<string, string>>(() => {
  const treePanelPath = requireWidgetPath('tree');
  const overrides: Record<string, string> = {
    [treePanelPath]: `${sideColumnLayout.value.treePx}px`,
  };
  // Sovereignty completion (SCOPE item 3): controlPanel's own track is
  // ALSO overridden with the live-solved candidate — which can fall
  // below its compiled fixed 664px once `tree` is sovereign (dragged),
  // genuinely shrinking the panel below its floor rather than the
  // compiled fixed track silently overflowing the wrapper's own box.
  const controlPanelOutcome = sideColumnLayout.value.others.find((o) => o.widgetId === 'controlPanel');
  if (controlPanelOutcome?.present) {
    overrides[requireWidgetPath('controlPanel')] = `${controlPanelOutcome.candidatePx}px`;
  }
  // GAP A: the root split's own live solve REPLACES
  // `effectiveTreeControlRegionWidthPx` as the side column's track
  // override — that computed's own sovereign branch and this one's
  // agree byte-for-byte (both read `store.session.ui.
  // treeControlRegionWidthPx` verbatim when dragged); only the
  // UN-DRAGGED default's derivation differs (see `rootSplitLayout`'s own
  // header above).
  if (rootSplitLayout.value !== null) {
    const sideColumnPath = lytParentPath(lytParentPath(treePanelPath));
    overrides[sideColumnPath] = `${rootSplitLayout.value.sideColumnPx}px`;
  }
  return overrides;
});

// Phase 3 (resolution roadmap, audit finding R3), carried into W1
// unchanged: the declared measure/reflow policy for the workspace's
// width class, threaded to the two control-panel tabs whose content is
// dense text/tables (Library, Cards). See `getPanelContentPolicy`'s doc
// (`state/layout-model.ts`).
const panelContentPolicy = computed(() => getPanelContentPolicy(layoutClass.value));

// REALIZATION WAVE (`.claude/dispatch-reports/lyt-realization-wave.md`),
// re-derived per LYT R1 PART 2: the control-panel Exclusive's own dotted
// path, per class — read directly off `activeLytProgramIndex` (the SAME
// `controlPanel` widget id `activeLytDomIdByPath` above already resolves
// through `requireWidgetPath`) rather than a second, independently-derived
// copy of the same fact (ADR-0012 P1 — one home, not a second derivation
// of a fact `activeLytProgramIndex` already states).
const controlPanelLytPath = computed<string>(() => requireWidgetPath('controlPanel'));

// LytNode's Exclusive-case active-tab wiring (file header, "Active-tab
// state") — the SAME persisted `session.ui.activeTab` cell the pre-wave,
// App.vue-authored TabWidget instance wrote through `activeTab` above,
// now threaded as a path-keyed read/write pair instead of a single
// TabWidget's own v-model.
const lytExclusiveActiveByPath = computed<Record<string, string>>(() => ({
  [controlPanelLytPath.value]: activeTab.value,
}));
function handleLytExclusiveActiveChange(path: string, tabId: string): void {
  if (path !== controlPanelLytPath.value) return;
  activeTab.value = tabId;
}

// LytNode runtime presence overrides (W2, roadmap §8 W2 item 1). Reads
// straight off the persisted `session.ui.lytPresence` map for
// `previewBoard`/`controlPanel` — LytNode.vue's own fallback
// (`presenceOverrides[id] ?? child.presenceDefaultVisible`) already
// degrades correctly for any id this map doesn't mention.
//
// `boardRail` gets ONE extra rule beyond a straight pass-through: when
// `railStyle === 'popover'` (style B, roadmap §7 ruling 2), the
// boardRail LEAF's own grid track must stay permanently collapsed
// regardless of the stored `lytPresence.boardRail` value — in that
// style the rail is realized entirely by `BoardRailPopoverTrigger.vue`
// (a separate, ungridded popover mount), so the grid leaf must never
// claim standing space. `lytPresence.boardRail` itself is still
// preserved untouched in the store either way (only the OVERRIDE this
// computed feeds to LytNode is style-conditioned, not the persisted
// preference) — flipping back to 'slot' style restores the user's own
// prior boardRail checkbox state exactly, not a reset default.
// Presence arc P2b (`.claude/dispatch-reports/lyt-p2b-presence-
// realization.md`, item 4): the M2 stage B2b boot-restoration's own
// unconditional `A_setup: true` force-override (ledger row 2346) is
// RETIRED — `A_setup` is now a genuine 4th `useLytPresenceMenu.ts`
// target (item 5), reading/writing `session.ui.lytPresence.A_setup` the
// same as `boardRail`/`previewBoard`/`controlPanel` below, sovereign to
// the user's own choice once made, defaulting to the compiled program's
// own `presenceDefaultVisible: false` (`lytPresenceClassDefaults` below)
// until then. `SetupToolPalette.vue`'s own internal trigger/body split
// (its `.setup-trigger` button always rendered, `.setup-palette`'s own
// body toggling via its OWN `paletteOpen` state — see that file's own
// header) is unchanged; what changes here is only whether the WHOLE
// `A_setup` LEAF (trigger included) is mounted at all — ruling row 2108's
// own "PALETTE ADOPTION" `@toggle(user, release)` intent, finally wired
// rather than left permanently forced on.
//
// HISTORICAL (superseded by dispatch L3): `controlPanel`'s own resolved
// presence used to be evaluated by the now-deleted, standalone
// `resolveWidthConditionalPresence` (`state/layout-model.ts`) — the width-
// conditional `@demote` evaluation, the user-sovereignty framing ("width
// only ever narrows `true` down to `false`, never `false` to `true`"),
// and the `previewBoard`-reservation addendum this paragraph used to
// describe are ALL preserved, unchanged in effect, inside
// `resolveSideColumnLiveLayout`'s own presence resolution (`state/
// feasible-layout.ts`, `sideColumnLayout` above) — see that function's
// own header. `controlPanelForcedAbsent` below (consumed by
// `<LytPresenceMenu>`) still discloses the "wants visible, currently
// can't" state in the presence menu, unchanged.
//
const lytPresenceOverrides = computed<Record<string, boolean>>(() => {
  const presence = store.session.ui.lytPresence;
  const base: Record<string, boolean> =
    store.session.ui.railStyle === 'popover' ? { ...presence, boardRail: false } : { ...presence };
  const desiredControlPanel = base.controlPanel ?? lytPresenceClassDefaults.value.controlPanel ?? true;
  const controlPanelOutcome = sideColumnLayout.value.others.find((o) => o.widgetId === 'controlPanel');
  base.controlPanel = controlPanelOutcome?.present ?? desiredControlPanel;
  return base;
});

// `lytPresenceClassDefaults`/`controlPanelDemote` moved ABOVE
// (dispatch L3): `sideColumnOtherRegions`/`sideColumnLayout` reference
// them, and `useSideColumnLiveLayout`'s own internal `watch()` forces an
// EAGER evaluation during `setup()` (Vue's `watch` always runs its
// getter once synchronously to collect dependencies, `immediate` or
// not) — a forward reference to a `const` declared LATER in this
// `<script setup>` body throws a real TDZ `ReferenceError` the instant
// that eager evaluation runs, unlike a lazily-evaluated plain `computed`
// (which the pre-L3 `lytPresenceOverrides`'s own forward-reference to
// `controlPanelDemote` relied on safely). WITNESSED:
// `tests/integration/App-boot.test.ts` caught this exact
// `ReferenceError: Cannot access 'lytPresenceClassDefaults' before
// initialization` before the reorder.

// Presence arc P2b item 3 (control-panel popover summon). Whether the
// control-panel Exclusive resolves PRESENT right now — the SAME formula
// `LytNode.vue`'s own internal `isPresent` applies
// (`presenceOverrides[id] ?? child.presenceDefaultVisible`), evaluated
// here too because App.vue-level chrome (the summon trigger's own
// visibility, below) needs to know this WITHOUT a prop LytNode doesn't
// expose. Not a second, independently-driftable source of truth — both
// read the identical `lytPresenceOverrides`/`lytPresenceClassDefaults`
// facts this file already resolves in one place each (ADR-0012 P1).
// `lytPresenceOverrides.value.controlPanel` is now ALWAYS width-resolved
// (never `undefined` — see that computed above), so the `??` fallbacks
// below are defensive continuity with the pre-wave formula, not a live
// path.
const controlPanelIsPresent = computed<boolean>(
  () => lytPresenceOverrides.value.controlPanel ?? lytPresenceClassDefaults.value.controlPanel ?? true,
);

// 2026-08-13 dated addendum (`.claude/dispatch-reports/
// HISTORICAL (superseded by dispatch L3): `previewBoardIsPresent` used to
// be consumed by the now-deleted `lytTrackStyleOverrides`'s own
// generalized reservation (`clampTreeWidthForSideColumn`) — `previewBoard`
// has no `@demote` of its own, so its resolved presence is always the raw
// persisted-or-default choice; `sideColumnOtherRegions` above reads that
// same fact directly (`desiredPreviewBoard`) rather than through a
// separately-named computed.

// Finish-pass wave A: disclosed in `<LytPresenceMenu>` (F1's "USER
// SOVEREIGNTY" clause) — true exactly when the user's own persisted-or-
// class-default choice for `controlPanel` is "visible" but the width
// evaluator above demoted it anyway. Read by the presence menu to show a
// hint instead of presenting the checkbox as a silent no-op; the
// checkbox itself stays enabled (toggling the underlying preference is
// still meaningful — it takes effect the instant width allows).
const controlPanelForcedAbsent = computed<boolean>(() => {
  const desired = store.session.ui.lytPresence.controlPanel ?? lytPresenceClassDefaults.value.controlPanel ?? true;
  return desired && !controlPanelIsPresent.value;
});
const lytPresenceForcedAbsent = computed<Partial<Record<LytPresenceTargetId, boolean>>>(() => ({
  controlPanel: controlPanelForcedAbsent.value,
}));

// ── Control-panel popover summon (P2b item 3) ───────────────────────────
// Session-local (never persisted — "Dismissal restores the demoted
// state" is the commission's own words; matches `useLytPresenceMenu.ts`'s
// own `open` ref and `BoardRailPopoverTrigger.vue`'s own `open` ref, both
// ephemeral UI state, not a stored preference).
//
// Positioning composable — DEVIATION FROM THE COMMISSION'S NAMED
// `useFixedAnchoredPopover`, disclosed with the evidence: this trigger
// mounts in `#lyt-corner-chrome` (`position: fixed`, viewport
// bottom-right corner), the SAME position `BoardRailPopoverTrigger.vue`/
// `LytPresenceMenu.vue` already occupy — and BOTH of those already use
// `usePopoverEdgeClamp` + a `bottom: 100%` CSS anchor (opens UPWARD from
// the trigger), not `useFixedAnchoredPopover`. `useFixedAnchoredPopover`
// was tried first (per the commission's own naming) and empirically
// failed AT THIS EXACT POSITION: its hardcoded `top: triggerRect.bottom`
// anchor opens DOWNWARD, and — because the trigger already sits at the
// viewport's own bottom edge — the composable's own viewport-bottom
// clamp then pulls the popover back UP, directly over the trigger button
// itself, making it un-clickable to dismiss (the screenshot witness rig
// caught this directly: `page.click('#control-panel-summon-btn')` timed
// out after the popover opened, Playwright reporting the button's own
// area as occluded by `.control-panel-popover`). `useFixedAnchoredPopover`
// exists to escape an `overflow: auto` CLIPPING ANCESTOR
// (`EngineQueueTooltip.vue`'s own header has the full diagnosis) — a
// precondition that doesn't hold here either: `#lyt-corner-chrome` is
// already outside any such ancestor, exactly like its two siblings.
// Space-owner cure, dispatch L5 (`.claude/dispatch-reports/
// lyt-space-owner-spec.md` §1.5/§3 step 5): dismissal migrated onto
// `useDismissiblePopover` (`composables/chrome/useDismissiblePopover.ts`)
// — the ONE click/outside-click/Escape mechanism this file's own former
// comment (below the composable call) named as "verbatim the same
// shape" three other components independently re-implemented. The
// below-extraction-threshold reasoning that comment gave is superseded:
// this dispatch's own scope is exactly "collapse the repeated idiom
// into the overlay primitive," so the threshold no longer applies.
const { open: controlPanelPopoverOpen, rootRef: controlPanelPopoverRootEl, toggle: toggleControlPanelPopoverDismissible } =
  useDismissiblePopover();
// `controlPanelPopoverRootEl` is bound to the summon wrapper's own
// template root (`ref="controlPanelPopoverRootEl"`, below) — see
// `LytPresenceMenu.vue`'s own identical comment for why `noUnusedLocals`
// needs this explicit acknowledgment.
void controlPanelPopoverRootEl;
const { setPopoverEl: setEdgeClampPopoverEl, xShift: controlPanelPopoverXShift } =
  usePopoverEdgeClamp(controlPanelPopoverOpen);
// Corner-stack clearance (dispatch L5): the live px every trigger-row
// popover's own `bottom: 100%` anchor must ALSO clear — whatever
// `CornerStackHost.vue` currently has stacked above the trigger row
// (the system log panel, the banner cluster). Read via a template ref +
// `defineExpose` (see `CornerStackHost.vue`'s own header for why
// provide/inject does not fit this slot-content shape) and threaded
// down as an ordinary prop to `LytPresenceMenu`/`BoardRailPopoverTrigger`;
// the control-panel-summon popover below (this file's own content, not
// a child component) reads the computed directly.
const cornerStackHostRef = vueRef<InstanceType<typeof CornerStackHost> | null>(null);
const cornerStackClearancePx = computed<number>(() => cornerStackHostRef.value?.clearancePx ?? 0);
// Presence arc P2b: the Teleport target `LytNode.vue`'s own Exclusive
// branch relocates the control panel's live content into when absent —
// see that file's header, "Popover summon for an absent Exclusive", and
// the template's own comment (nested inside the trigger's own
// `v-if="!controlPanelIsPresent"` wrapper) for why this element is
// guaranteed to exist by the time a summon can occur. `v-show`, never
// `v-if`, WITHIN that wrapper's own lifetime — Teleport needs a stable
// target across the open/close toggle, not a remounted one each time.
// Vue templates bind exactly one `:ref` per element; this element needs
// TWO readers (this file's own `controlPanelPopoverEl`, used as the
// Teleport target AND the dismiss-listener's own "is this click inside
// the popover" check below, plus `usePopoverEdgeClamp`'s own internal
// measurement) — `setControlPanelPopoverEl` below is a combined
// function-ref that feeds both from the one template binding.
const controlPanelPopoverEl = vueRef<HTMLElement | null>(null);
function setControlPanelPopoverEl(el: Element | ComponentPublicInstance | null): void {
  controlPanelPopoverEl.value = el as HTMLElement | null; // DOM: only ever bound to a plain <div> below
  setEdgeClampPopoverEl(el);
}
const exclusivePopoverOpenMap = computed<Record<string, boolean>>(() => ({
  controlPanel: controlPanelPopoverOpen.value,
}));

// `useDismissiblePopover`'s own `rootRef` (bound to `controlPanelPopoverRootEl`
// in the template below) already scopes the outside-click check to the
// wrapper's full subtree — the popover panel (`controlPanelPopoverEl`,
// the Teleport target) is a DOM DESCENDANT of that same wrapper (see the
// template), so no second, separately-tracked containment check is
// needed here any more (the pre-dispatch "belt-and-suspenders" comment
// this replaced named that redundancy explicitly). `toggleControlPanelPopover`
// keeps its own pre-dispatch name at this call site (the template's own
// `@click`) rather than renaming every reference to the composable's
// generic `toggle`.
const toggleControlPanelPopover = toggleControlPanelPopoverDismissible;

const { sync } = useAppBootstrap(auth);

// Future-version workspace-recovery wiring (work item
// `next-futureblob-recovery`): `WorkspaceRecoveryGate.vue` and the
// `workspaceSaveState.kind === 'suppressed'` banner below both emit
// into this — see `useWorkspaceRecovery`'s header for why the
// destructive path's confirmation lives in one shared composable
// rather than duplicated at each call site.
const recovery = useWorkspaceRecovery(sync);

// Narrowed accessor for the `future-version` load-state leg (types/
// app.ts). A plain `store.workspaceLoadState.blobVersion` template
// read inside the `v-else-if="... .kind === 'future-version'"` branch
// would rely on the template compiler narrowing the union across
// separate attribute-binding expressions on the same element — not a
// guarantee this codebase leans on elsewhere (the sibling 'error' legs
// above never read their own `.message` in the template either). This
// computed narrows once, explicitly, so `WorkspaceRecoveryGate`'s
// props are typed `number`, never a possibly-`undefined` read off the
// wrong union leg.
const futureVersionLoadState = computed(() => {
  const s = store.workspaceLoadState;
  return s.kind === 'future-version' ? s : null;
});

// Same narrowing rationale as `futureVersionLoadState` above, for the
// ongoing `workspaceSaveState.kind === 'suppressed'` banner.
const suppressedSaveState = computed(() => {
  const s = store.workspaceSaveState;
  return s.kind === 'suppressed' ? s : null;
});

// Transient auto-reveal of the system-log panel on error/warning
// arrivals when `systemLogExpanded` is false. See the composable for
// the UX rationale and timer mechanics.
const transientLogReveal = useTransientLogReveal();

// REALIZATION WAVE: the App-authored `controlTabs`/`TabWidget` pair this
// comment used to document is retired — LytNode.vue's own Exclusive case
// now drives TabWidget itself, deriving each tab's label from the compiled
// program's own `tabLabelKey` (`app.tabs.<id>`, the SAME i18n key family
// this computed used to build) rather than App.vue re-deriving the same
// list from `CONTROL_PANEL_TAB_IDS`. `CONTROL_PANEL_TAB_IDS` itself is
// still consulted directly by `computeControlPanelMinWidthPx`
// (`state/layout-model.ts`) and by the emitter's own
// `Registration.control_panel_tab_ids` (`emit_layout_tree.py`) — three
// independent readers of the SAME ordered id list, not three writers of it.

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

// Control-panel active tab — persisted `session.ui.activeTab`. A
// writable computed so the TabWidget v-model write routes through
// `touchSession()` (same session-counter reason chrome toggles used to).
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

    <div id="main-workspace">

      <!-- ADR-0019 audit Finding S1: cold-load honest gate. Before
           the workspace fetch has resolved (or resolved to "nothing
           to fetch"), the store's default boards must not be
           rendered as a plausible, interactive workspace — that was
           the audit's phantom-37-boards defect. `store.workspaceLoadState`
           (SyncService-owned, see types/app.ts) drives an exhaustive
           three-way gate over the board/tree/control-panel surfaces:
           chrome that could mutate workspace state is withheld the
           same way. The system-log bar and modals stay outside the
           gate — the log is diagnostic-only and the modals are inert
           until a (gated-away) toolbar button opens one. -->
      <template v-if="store.workspaceLoadState.kind === 'loaded'">

        <!-- W4 item 1 (roadmap §7 ruling: "banners + system log =
             overlay stratum, never occluding the board"): the
             keybinding-capture banner, the workspace-save-error
             banner, and the system log's reveal moved OUT of
             `#main-workspace`'s in-flow column (where their appearance
             used to PUSH `#split-workspace` down, costing real board
             area — the "~300px lesson" the roadmap's own §7 draft
             names) into `#lyt-overlay-stack` below, a `position: fixed`
             stack that contributes ZERO layout constraints (SPEC.md §2:
             "Overlays... contribute no constraints and occupy no
             standing space") — see that element's own template/CSS
             comments for the full placement derivation and the
             non-occlusion argument. Each piece keeps its EXACT same
             v-if gate as before (`capturingActionLabel !== null` /
             `workspaceSaveState.kind === 'error'` /
             `systemLogExpanded || transientLogReveal`) — only the
             RENDER TARGET moved, not the trigger conditions or (per
             `store/schema.ts`) the underlying field semantics, so no
             schema migration was needed for this item (disclosed
             judgment call: `systemLogExpanded` still means exactly
             "does the user want the log panel visible" — only WHERE
             it renders changed). -->
        <!-- Space-owner cure, dispatch L5: the banner cluster and
             `SystemLogPanel` moved into `<CornerStackHost>`'s own
             `banners`/`log` slots below (adjacent to the former
             `#lyt-corner-chrome` site) — DOM position no longer matters
             for a `position: fixed` overlay stack whose own offsets
             `CornerStack.layout()` now computes explicitly per region,
             so this relocation carries no visual change. See
             `CornerStackHost.vue`'s own header for the full derivation. -->

        <!-- The LYT skeleton (roadmap §3, "layout as data"), now SCREEN-
             CLASS-SWAPPED (W3): `activeLytProgram` is the landscape or
             portrait compiled program per `activeScreenClassId`'s own
             nearest-neighbor derivation (`state/layout-model.ts`). Every
             leaf/blackbox slot App.vue owns a real component for is
             projected through a named `#leaf-<widgetId>` slot — see
             `state/lyt-widget-registry.ts` for the full leaf -> mount
             disposition table and LytNode.vue for the renderer. This is
             the program ROOT call — no `path` prop given, so LytNode.vue's
             own default (`''`) applies, matching
             `activeLytDomIdByPath['']`. -->
        <LytNode
          :node="activeLytProgram.root"
          :dom-ids-by-path="activeLytDomIdByPath"
          :presence-overrides="lytPresenceOverrides"
          :class-id="activeScreenClassId"
          :track-style-overrides="lytTrackStyleOverrides"
          :exclusive-active-by-path="lytExclusiveActiveByPath"
          :on-exclusive-active-change="handleLytExclusiveActiveChange"
          :translate-label="t"
          :exclusive-popover-open="exclusivePopoverOpenMap"
          :exclusive-popover-target="controlPanelPopoverEl ?? undefined"
        >

          <!-- W2: style A only (railStyle === 'slot') actually shows this
               leaf visible — in 'popover' style App.vue's own
               `lytPresenceOverrides` forces this leaf's track collapsed,
               so this slot never actually mounts (LytNode's v-else-if
               gate never reaches it) regardless of what's declared here.
               W5 AUDIT CORRECTION: this mount previously bound
               @load-sgf/@save-sgf listeners, but SidebarWidget.vue's own
               W4 change (see its header comment) removed both emits —
               the app cluster's #leaf-A_app mount (below) is the one
               remaining Load/Save SGF source (lyt-widget-registry.ts's
               boardRail note). The listeners were dead (bound to events
               that never fire) and are removed here; verified via a
               repo-wide grep that nothing still emits
               `load-sgf`/`save-sgf`. -->
          <template #leaf-boardRail>
            <SidebarWidget />
          </template>

          <template #leaf-B>
            <div id="content">
              <BoardWidget
                v-if="activeBoard"
                :key="activeBoard.id"
                :state="activeBoard"
                @move="handleBoardMove"
                @paste-pv="handlePastePv"
              />
            </div>
          </template>

          <!-- I_board's mount spans I_board+A_board (registry: A_board
               'absorbed' into I_board) — StatusBar already carries both
               the info readout and the action buttons internally, PLUS
               (LYT toolbar ontology reencode, item 1) the relocated
               move-navigation cluster; see lyt-widget-registry.ts's own
               I_board note and StatusBar.vue's own header. -->
          <template #leaf-I_board>
            <StatusBar
              v-if="activeBoard"
              :board="activeBoard"
              :metadata="metadata"
              :can-pass="canPass"
              @update-komi="handleUpdateKomi"
              @update-rules="handleUpdateRules"
              @pass="handlePass"
            />
          </template>

          <!-- M2 stage B2b boot-restoration wiring
               (`.claude/dispatch-reports/lyt-boot-restoration.md`, ledger
               row 2346): ruling row 2073's three-vocabulary decomposition
               retires the single `A_engine` leaf into FOUR leaves, each
               mounted at its own slot — see lyt-widget-registry.ts's own
               per-leaf notes for the real-component grounding and the
               disclosed identity-slot judgment call. All four sit in the
               SAME compiled-program Split (path "2.0"), so LytNode.vue's
               own CSS Grid lays them out in one row — no wrapping flex
               component needed here the way the retired
               ToolbarEngineCluster.vue's `.engine-cluster` used to
               provide. -->
          <template #leaf-A_engine_controls>
            <div class="lyt-toolbar-strip">
              <ToolbarEngineControls
                :is-match-running="matchControls.isRunning.value"
                @toggle-engine="engineControls.toggle"
                @mint-card="triggerMint"
                @open-match="triggerMatch"
                @stop-match="handleStopMatch"
                @open-play="triggerPlay"
                @open-learn-path="triggerLearnPath"
              />
            </div>
          </template>

          <template #leaf-A_engine_eval>
            <div class="lyt-toolbar-strip">
              <ToolbarEngineMetrics v-if="engineControls.isConnected.value" group="eval" />
            </div>
          </template>

          <template #leaf-A_engine_health>
            <div class="lyt-toolbar-strip">
              <ToolbarEngineMetrics v-if="engineControls.isConnected.value" group="health" />
            </div>
          </template>

          <template #leaf-A_engine_queue>
            <div class="lyt-toolbar-strip">
              <EngineQueueTooltip v-if="engineControls.isConnected.value" />
            </div>
          </template>

          <!-- LYT toolbar ontology reencode (item 3, "ONE APP CLUSTER"):
               Load/Save SGF, the sliders/PBO popover triggers, the
               engine URI editor, and the locale picker — SAME widget id
               in both classes (landscape's own root child '2', portrait's
               own root V child previously named `A_top`). Self-contained
               (ToolbarAppCluster.vue sources its own SGF composables —
               see that file's own header), so this mount needs no
               App.vue-local wiring at all, unlike the pre-reencode
               `.lyt-toolbar-strip` block this replaces. M2 stage B2b:
               SetupToolPalette moved OUT of this cluster to its own
               A_setup leaf below (ruling row 2108). -->
          <template #leaf-A_app>
            <div class="lyt-toolbar-strip">
              <ToolbarAppCluster />
            </div>
          </template>

          <!-- M2 stage B2b (ruling row 2108, "PALETTE ADOPTION"): the
               setup-tool palette as its own presence slot, a direct
               sibling of A_app. DISCLOSED SCOPE CALL (see
               lyt-widget-registry.ts's own A_setup entry and
               ToolbarAppCluster.vue's own header): the compiled program
               declares this leaf `presenceDefaultVisible: false`; rather
               than build the ruling's own anticipated trigger/body split
               plus a new presence-menu entry (out of this commission's
               "restore boot" scope), `lytPresenceOverrides` below forces
               it permanently visible, preserving the palette's
               pre-existing always-reachable behaviour. -->
          <template #leaf-A_setup>
            <div class="lyt-toolbar-strip">
              <SetupToolPalette />
            </div>
          </template>

          <template #leaf-tree>
            <!-- OUTER resizer bar (W3, landscape only — see this file's
                 script-header "W3 resizer drag overrides" note for the
                 disclosed narrowing). Anchored at #vue-tree-panel's own
                 LEFT edge — topologically identical to the boundary
                 between the board composite and the side column in the
                 ROOT split, since the `tree` leaf's own parent split
                 (`lytTrackStyleOverrides`' derived `sideColumnPath`,
                 `tree`'s own grandparent — LYT R1 PART 2) cross-fills the
                 side column's full width with zero left offset. Paint 1px
                 / grab ~4px per the standing resizer ruling (mirrors
                 App.vue's pre-LYT `.panel-resizer` history — see the
                 <style> block below). -->
            <div
              v-if="activeScreenClassId === 'landscape'"
              id="resizer-outer"
              class="lyt-resizer lyt-resizer-vertical"
              role="separator"
              aria-orientation="vertical"
              :aria-label="$t('app.chrome.resizerOuterLabel')"
              @mousedown="startResizeOuter"
            ></div>
            <div id="tree-panel-header">{{ $t('app.chrome.gameTreePanelHeader') }}</div>
            <TreeWidget
              v-if="activeBoard"
              ref="treeWidgetRef"
              :nodes="activeBoard.nodes"
              :board-id="activeBoard.id"
              :orientation="activeTreeOrientation"
              :game-head-ids="activeBoardGameHeadIds"
              :known-position-node-ids="activeBoardKnownPositionNodeIds"
              :review-start-node-id="reviewSession.startingNodeId.value"
              :selected-for-mint-ids="activeBoardSelectedNodeIds"
              :analyzing-node-id="activeBoardAnalyzingNodeId"
              @select-node="handleNodeSelect"
            />
          </template>

          <!-- The now-OPENED control-panel Exclusive node (lyt-layout.gen.ts
               header, "REALIZATION WAVE") — LytNode.vue's own Exclusive case
               drives a live TabWidget instance itself; App.vue fills the
               per-TAB leaf slots below (library/cards, plus the two
               still-collapsed synthetic leaves CP-settings/CP-analysis, plus
               the Other tab's own two newly-opened leaves) instead of one
               single #leaf-controlPanel slot around an App-authored
               TabWidget. -->
          <template #exclusive-controlPanel>
            <!-- INNER resizer bar (W3, both screen classes — see
                 useResizablePanel.ts's own header for the drag math).
                 Anchored at #control-panel's own LEFT edge, exactly the
                 tree/control-panel boundary this bar has always owned.
                 Unaffected by the Exclusive-node opening: LytNode.vue's
                 wrapper div (not TabWidget's own root) still carries
                 `position: relative` and this bar's own `:id`/handler are
                 unchanged. -->
            <div
              id="resizer-inner"
              class="lyt-resizer lyt-resizer-vertical"
              role="separator"
              aria-orientation="vertical"
              :aria-label="$t('app.chrome.resizerInnerLabel')"
              @mousedown="startResizeInner"
            ></div>
          </template>

              <template #leaf-CP-library>
                <div :key="controlPanelIdentityKey" style="flex: 1; display: flex; min-height: 0; width: 100%;">
                  <LibraryTab
                    :two-column-reflow="panelContentPolicy.twoColumnReflow"
                    @open-library-game="handleLoadLibraryGame"
                    @open-library-game-new-tab="handleLoadLibraryGameInNewBoard"
                  />
                </div>
              </template>

              <template #leaf-CP-cards>
                <div :key="controlPanelIdentityKey" style="flex: 1; display: flex; min-height: 0; width: 100%;">
                  <ForestDirectory :two-column-reflow="panelContentPolicy.twoColumnReflow" @load-card="handleLoadCard" />
                </div>
              </template>

              <!-- settingsSubstrip / SP_session (formerly settingsPane):
                   OPENED LIVE (work item `lyt-settings-live-opening`,
                   ledger rows 2007/2009/2001) — the encoding's own modeled
                   V(settingsSubstrip, SP_session) interior now mounts as
                   TWO separately-mounted LYT leaves, reached via
                   CP-settings' own now-genuine `split` node (LytNode.vue's
                   existing generic Split recursion, no LytNode.vue change
                   needed). M2 stage B2b (`.claude/dispatch-reports/lyt-
                   boot-restoration.md`): the second leaf's own compiled
                   id renamed settingsPane -> SP_session (a `kind:
                   "blackbox"` node now, not `"leaf"` — the settings tab's
                   own interior gained a nested, still-collapsed six-way
                   T over the real sub-tab ids; LytNode.vue's leaf/blackbox
                   terminal case treats both kinds identically, so this
                   slot rename is the only change needed here). See
                   SettingsSubstrip.vue/SettingsPane.vue's own headers and
                   lyt-widget-registry.ts's updated entries. CP-analysis:
                   DISCLOSED SCOPE NARROWING (unchanged from the
                   realization wave's own delivery report) — the
                   encoding's own modeled nested-T interior stays
                   solver-visible but UNOPENED in the DOM; still mounts
                   as ONE component, unchanged wiring from the pre-wave
                   #analysis TabWidget slot. -->
              <template #leaf-settingsSubstrip>
                <div :key="controlPanelIdentityKey" style="width: 100%;">
                  <SettingsSubstrip />
                </div>
              </template>

              <template #leaf-SP_session>
                <div :key="controlPanelIdentityKey" style="flex: 1; display: flex; min-height: 0; width: 100%;">
                  <SettingsPane @force-save="sync.forceSave()" />
                </div>
              </template>

              <template #leaf-CP-analysis>
                <AnalysisControls v-if="activeBoard" :key="controlPanelIdentityKey" :boardId="activeBoard.id" />
              </template>

              <!-- Other tab, OPENED (item 4, §9.3's ratified target shape):
                   a fixed designed-height band (the chart-ish
                   ColorDebugStrip) + a scroll-owned band (the unbounded
                   registry/config editors) — two separately-mounted LYT
                   leaves now, replacing the pre-wave single #other slot's
                   one mixed-scroll `.tab-padding` block (the L5c-refusing
                   composition the ratified consult names dies here in the
                   DOM too). Overflow is DERIVED (item 3): otherColorDebug
                   declares no scroll axis (content designed, L5c no-scroll);
                   otherBand declares `scroll v` — see
                   useLytOverflowCss.ts's own `leafOverflowStyle`, applied by
                   LytNode.vue's leaf-cell rendering. -->
              <template #leaf-otherColorDebug>
                <div :key="controlPanelIdentityKey" class="tab-padding">
                  <h3 class="sub-header section-divider" style="margin-top: var(--space-loose);">{{ $t('other.section.gradientCalibration') }}</h3>
                  <p class="hue-slider-hint">{{ $t('other.label.gradientCalibrationNotice') }}</p>
                  <ColorDebugStrip :steps="500" />
                </div>
              </template>

              <template #leaf-otherBand>
                <div :key="controlPanelIdentityKey" class="tab-padding">
                  <h3 class="sub-header">{{ $t('other.section.knobRegistry') }}</h3>
                  <KnobRegistryEditor />

                  <h3 class="sub-header section-divider" style="margin-top: var(--space-loose);">{{ $t('other.section.visitsLerp') }}</h3>
                  <VisitsLerpConfig />

                  <h3 class="sub-header section-divider" style="margin-top: var(--space-loose);">{{ $t('other.section.perQueryOverrides') }}</h3>
                  <PerQueryOverridesConfig />

                  <h3 class="sub-header section-divider" style="margin-top: var(--space-loose);">{{ $t('other.section.qeuboBookmarks') }}</h3>
                  <QeuboBookmarks />
                </div>
              </template>

          <!-- W2 (roadmap §8 W2 item 3): previewBoard's first real
               content — see PreviewBoardPanel.vue's own header for the
               disclosed active-board-placeholder scope narrowing. -->
          <template #leaf-previewBoard>
            <PreviewBoardPanel />
          </template>

        </LytNode>

        <!-- Space-owner cure, dispatch L5 (`.claude/dispatch-reports/
             lyt-space-owner-spec.md` §1.4/§3 step 5): ONE
             `<CornerStackHost>` replaces the former two independent
             `position: fixed` containers (`#lyt-corner-chrome` +
             `#lyt-overlay-stack`) — see that component's own header for
             the full derivation (the `CornerStack` registration order,
             the live-measured offsets replacing the hand-guessed
             `+40px`). The banner cluster and `SystemLogPanel` (formerly
             `#lyt-overlay-stack`, above the LYT skeleton in this file's
             own DOM order pre-dispatch) now live in this element's own
             `banners`/`log` slots; every corner trigger (formerly
             `#lyt-corner-chrome`) lives in its `triggers` slot. Content
             and `v-if` gates are UNCHANGED from pre-dispatch — only the
             stacking/offset MECHANISM moved. -->
        <CornerStackHost ref="cornerStackHostRef">
          <template #banners>
            <div
              v-if="capturingActionLabel !== null"
              id="keybinding-capture-banner"
              role="alert"
            >
              {{ $t('app.keybindingCapture.banner', { action: capturingActionLabel }) }}
            </div>

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

            <!-- Persist-suppression banner (work item
                 `next-futureblob-recovery`, rows 1942/1982): the ONGOING
                 reminder after "continue on defaults" from the
                 future-version recovery gate. No Retry affordance — a
                 'suppressed' write is refused structurally by
                 SyncService.sendSync every time (`persistSuppression`),
                 it isn't a failed attempt; the destructive escape hatch
                 rides along in case the user reconsiders. -->
            <div
              v-if="suppressedSaveState"
              id="workspace-suppressed-banner"
              role="alert"
            >
              <span class="save-banner-text">{{ $t('sync.recovery.suppressedBanner', {
                blobVersion: suppressedSaveState.blobVersion,
                appVersion: suppressedSaveState.appVersion,
              }) }}</span>
              <button
                class="recovery-banner-reset-btn"
                @click="recovery.resetServerWorkspace(suppressedSaveState.blobVersion, suppressedSaveState.appVersion)"
              >
                {{ $t('sync.recovery.resetButton') }}
              </button>
            </div>
          </template>

          <template #log>
            <SystemLogPanel
              v-if="store.session.ui.systemLogExpanded || transientLogReveal"
            />
          </template>

          <template #triggers>
            <DebugMenu />
            <BoardRailPopoverTrigger v-if="store.session.ui.railStyle === 'popover'" :clearance-px="cornerStackClearancePx" />
            <!-- Control-panel popover summon (P2b item 3): reachable ONLY
                 while the control panel is absent from the grid (class
                 default demoted it, or the user toggled it off via
                 LytPresenceMenu below) — when present, the grid already
                 shows it, so no summon affordance is needed.

                 Positioning: `usePopoverEdgeClamp` + a CSS `bottom: 100%`
                 anchor (opens UPWARD from the trigger), the SAME idiom
                 this element's own trigger-row siblings
                 (`BoardRailPopoverTrigger.vue`/`LytPresenceMenu.vue`)
                 use — NOT `useFixedAnchoredPopover` (script header's
                 original plan, per the commission's own naming).
                 Witnessed empirically wrong for THIS trigger's position:
                 that composable's `top: triggerRect.bottom` anchor opens
                 DOWNWARD, and this trigger already sits at the fixed
                 viewport BOTTOM-right corner — the viewport-bottom clamp
                 then pulls the popover back UP over the trigger itself,
                 blocking the very re-click needed to dismiss it
                 (screenshot rig transcript:
                 `page.click('#control-panel-summon-btn')` timed out,
                 `<button>` occluded by its own now-open popover).
                 Dispatch L5 addendum: `margin-bottom` now ALSO adds
                 `cornerStackClearancePx` (this file's own computed) so
                 the popover clears whatever `CornerStackHost` currently
                 has stacked above the trigger row (the system log panel,
                 the banner cluster) — the review's own witnessed
                 collision this dispatch closes. -->
            <div v-if="!controlPanelIsPresent" ref="controlPanelPopoverRootEl" class="control-panel-summon-wrap">
              <button
                id="control-panel-summon-btn"
                type="button"
                class="control-panel-summon-trigger"
                :title="$t('app.chrome.presence.controlPanelSummon')"
                :aria-label="$t('app.chrome.presence.controlPanelSummon')"
                aria-haspopup="true"
                :aria-expanded="controlPanelPopoverOpen"
                aria-controls="control-panel-popover-mount"
                @click="toggleControlPanelPopover"
              >
                <span aria-hidden="true">&#9776;</span>
              </button>

              <!-- The control panel's own Teleport target when absent-but-
                   summoned — see LytNode.vue's header ("Popover summon for
                   an absent Exclusive") for what gets relocated in here.
                   ALWAYS mounted (`v-show`, never `v-if`) WHILE this wrapper
                   itself is mounted — LytNode's own Teleport only ever
                   targets this element while `controlPanelIsPresent` is
                   false, the SAME condition gating this wrapper's own
                   `v-if`, so the target is guaranteed to exist by the time
                   a summon can occur (the trigger button that starts a
                   summon lives inside this same wrapper). Opaque
                   (--surface-0, the same standing occlusion law
                   `LytPresenceMenu.vue`'s own header names). -->
              <div
                id="control-panel-popover-mount"
                :ref="setControlPanelPopoverEl"
                v-show="controlPanelPopoverOpen"
                class="control-panel-popover"
                role="dialog"
                :aria-label="$t('app.chrome.presence.controlPanel')"
                :style="{
                  transform: `translateX(${controlPanelPopoverXShift}px)`,
                  marginBottom: `${cornerStackClearancePx}px`,
                }"
              ></div>
            </div>
            <LytPresenceMenu
              :class-defaults="lytPresenceClassDefaults"
              :forced-absent="lytPresenceForcedAbsent"
              :clearance-px="cornerStackClearancePx"
            />
            <SystemLogToggle />
          </template>
        </CornerStackHost>
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

      <!-- Future-version recovery gate (work item
           `next-futureblob-recovery`, ratified program row 1937,
           incident row 1942): occupies the SAME slot as the
           loading/error legs above — the workspace surfaces stay
           withheld until the user makes an explicit choice — but
           this is a DISTINCT, EXPECTED typed boot outcome
           (`WorkspaceLoadState.kind === 'future-version'`,
           `types/app.ts`), not a generic fetch failure, so it gets
           its own leg with a two-choice recovery affordance instead
           of a bare Retry (which would just re-throw the same
           `FutureSchemaVersionError` — see `migrations.ts`). -->
      <WorkspaceRecoveryGate
        v-else-if="futureVersionLoadState"
        :blob-version="futureVersionLoadState.blobVersion"
        :app-version="futureVersionLoadState.appVersion"
        @continue="recovery.continueOnDefaults()"
        @reset="recovery.resetServerWorkspace(futureVersionLoadState.blobVersion, futureVersionLoadState.appVersion)"
      />


    </div>
  </div>
  </RootErrorBoundary>
</template>

<style>
@import "./assets/css/theme.css";
@import "./assets/css/style.css";
@import "./assets/css/palettes.css";
/* Shared chrome classes consumed by other components (SettingsPane,
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

#main-area { display: flex; flex-direction: row; height: 100%; width: 100%; overflow: hidden; }

/* The main workspace column */
#main-workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: var(--surface-0);
}

/* ADR-0019 audit S1: cold-load loading/error state, occupying the
   same flex slot the LYT root would (`#main-workspace`'s
   `flex-direction: column` + this block's `flex: 1`), so the
   toolbar-then-content layout shape doesn't jump when the gate
   resolves. */
#workspace-boot-state {
  flex: 1; min-width: 0; min-height: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--space-default);
  color: var(--text-0); font-size: var(--text-emphasis);
}

/* W4 item 1 — OVERLAY STRATUM (roadmap §7 ruling), superseded by
   dispatch L5 (`.claude/dispatch-reports/lyt-space-owner-spec.md`
   §1.4/§3 step 5): the banner cluster below (still `#keybinding-
   capture-banner`/`#workspace-save-banner`/`#workspace-suppressed-
   banner`, unchanged markup) now mounts inside `<CornerStackHost>`'s
   own `banners` slot, `App.vue`'s template — that component's own
   `<style>` block owns the `position: fixed`/stacking-offset mechanics
   this comment used to describe, including the mount/unmount
   no-layout-push guarantee `tests/integration/overlay-stack-no-push.
   test.ts` pins. The hand-guessed `bottom: calc(var(--space-medium) +
   40px)` this rule used to carry — the review's own witnessed "a
   conservative estimate... rather than a swept number" — is RETIRED:
   `CornerStack.layout()` computes every region's own offset from its
   neighbors' live measured height instead (see `CornerStackHost.vue`'s
   own header for the full derivation). Individual banner rules below
   (background/border/padding) are otherwise unchanged from pre-dispatch. */
#keybinding-capture-banner {
  /* Opaque (--surface-0-backed via --state-attention's own solid
     fill — no scrim/translucency, the standing banner ruling this
     rule already followed pre-overlay). Rounded now that it is a
     floating card rather than a full-width in-flow bar. No
     box-shadow (effects-ban sweep, ledger row 1506, bans it outright
     regardless of value) — the opaque fill alone reads as a distinct
     surface. */
  border-radius: var(--radius-default);
  padding: var(--space-tight) var(--space-medium);
  background: var(--state-attention);
  color: var(--text-on-accent);
  font-weight: bold;
  text-align: center;
}
#workspace-save-banner {
  border-radius: var(--radius-default);
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-default);
  padding: var(--space-tight) var(--space-medium);
  /* Opaque (--surface-0), per the standing "no scrim/translucency"
     ruling — the pre-overlay `color-mix(...transparent)` fill relied
     on the in-flow bar's own opaque page background showing through;
     as a floating card over arbitrary chrome underneath, it now
     paints a genuinely solid surface first. */
  background: var(--surface-0);
  border: 1px solid var(--state-attention);
  color: var(--text-0);
}
.save-banner-text { font-size: var(--text-body); }
/* Persist-suppression banner (work item `next-futureblob-recovery`):
   same layout shape as #workspace-save-banner immediately above, but
   `--state-error` rather than `--state-attention` — this fact is
   stronger than "the last write failed" (nothing has been written for
   the whole session, deliberately), and `--state-error` is this SPA's
   established "destructive / irreversible-if-ignored" token (theme.css:
   "delete, destructive, winrate-negative"). No box-shadow / transition
   / blur (standing bans); --text-0 for the banner text (max-contrast
   rule). */
#workspace-suppressed-banner {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-default);
  padding: var(--space-tight) var(--space-medium);
  background: color-mix(in srgb, var(--state-error) 12%, transparent);
  border-bottom: 1px solid var(--state-error);
  color: var(--text-0);
}
.recovery-banner-reset-btn {
  background: var(--surface-0); border: 1px solid var(--state-error); color: var(--state-error);
  padding: var(--space-tight) var(--space-medium);
  border-radius: var(--radius-default);
  font-weight: bold; cursor: pointer; white-space: nowrap;
}
.workspace-boot-spinner {
  width: 20px; height: 20px; border-radius: 50%;
  border: 3px solid var(--surface-2); border-top-color: var(--accent-primary);
  animation: workspace-boot-spin 0.8s linear infinite;
}
@keyframes workspace-boot-spin { to { transform: rotate(360deg); } }

/* ── LYT-realized chrome (W1, screen-class-swapped W3) ─────────────────
   The LytNode root (id from activeLytDomIdByPath['']) IS #split-workspace
   now — a grid, not the old flex row, but the same id (both classes'
   own maps agree on it) so the existing ResizeObserver-measurement
   convention and any test still targeting this selector keep resolving
   regardless of which program is currently active. flex:1 makes it fill
   #main-workspace's remaining column height exactly like the old
   #split-workspace did. */
#split-workspace {
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

/* Corner trigger row (W2), superseded by dispatch L5: this cluster
   (DebugMenu / board-rail-popover trigger / control-panel summon /
   LytPresenceMenu / SystemLogToggle) now mounts inside
   `<CornerStackHost>`'s own `triggers` slot — `#corner-stack-triggers`
   in that component's own `<style>` block carries the `position: fixed`
   mechanics this rule used to own. See `CornerStackHost.vue`'s header. */

/* Presence arc P2b item 3: control-panel popover summon trigger. Same
   28px pointer-target floor + look as its trigger-row siblings
   (`BoardRailPopoverTrigger.vue`'s `.board-rail-trigger`,
   `LytPresenceMenu.vue`'s `.lyt-presence-trigger`) — App.vue's own
   `<style>` block is NOT scoped (see this file's own header), so this
   rule reuses the SAME token pattern those two components' scoped
   styles independently declare, rather than introducing a new look. */
.control-panel-summon-wrap { position: relative; display: inline-flex; }
.control-panel-summon-trigger {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  color: var(--text-0);
  cursor: pointer;
  font-size: var(--text-emphasis);
}
.control-panel-summon-trigger:hover { border-color: var(--border-3); }
.control-panel-summon-trigger[aria-expanded="true"] { border-color: var(--accent-primary); }

/* Presence arc P2b item 3: the control panel's own popover panel —
   opaque (--surface-0, the same standing occlusion law
   `LytPresenceMenu.vue`'s own header names), anchored ABOVE the trigger
   (`bottom: 100%`, `usePopoverEdgeClamp`'s own `xShift` piped into
   `transform: translateX`) — the SAME anchor scheme
   `BoardRailPopoverTrigger.vue`'s own `.board-rail-popover` uses at this
   exact corner position; see this file's own script-header comment on
   `controlPanelPopoverOpen` for why `useFixedAnchoredPopover` (the
   commission's original naming) empirically does not fit here. Sized
   generously enough for the tabbed content (Library/Cards/Settings/
   Analysis/Other) to be genuinely usable — the SAME 664px fixed width
   the grid's own control-panel track reserves, capped against the
   viewport for narrow screens; a bounded, scrollable height rather than
   an unbounded one so the panel never grows past the viewport itself. */
.control-panel-popover {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 4px;
  display: flex;
  flex-direction: column;
  width: 664px;
  max-width: calc(100vw - 8px);
  height: 70vh;
  max-height: 600px;
  overflow: auto;
  background: var(--surface-0);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-default);
  z-index: var(--z-popover-chrome);
}
/* The inner tree/control-panel resizer bar (`#resizer-inner`, the
   `#exclusive-controlPanel` slot's own content) rides along with every
   Teleport of the control panel's content (LytNode.vue's own Exclusive
   branch relocates the WHOLE slot, not just TabWidget) — its drag
   affordance assumes the grid's own `#control-panel`-relative geometry,
   which the popover doesn't reproduce. Grid and popover mounts are
   mutually exclusive by construction (P2b: the Exclusive is never
   simultaneously present-in-grid AND summoned-to-popover), so this
   selector only ever hides the ONE `#resizer-inner` instance that
   actually exists at a time — never both. */
.control-panel-popover #resizer-inner { display: none; }

/* #board-area (root child 1, the board/info/action V-composite): under
   CSS grid this is itself a nested grid container (LytNode's own
   `.lyt-node` class handles display:grid); no flex centering trick
   needed — the board-priority-clamp track (see useLytTrackCss.ts) gives
   it its full natural share directly. */
#board-area {
  height: 100%;
}

/* #board-square (the B leaf's aspect-containment cell, LytNode's own
   `.lyt-board-cell`) — #content wraps BoardWidget one level inside,
   unchanged nesting from pre-rework App.vue. */
#content { display: flex; justify-content: center; align-items: center; width: 100%; height: 100%; }

/* #tree-control-wrapper (root child 2.3: tree / control-panel / preview
   row) is itself a nested grid (LytNode). No extra rule needed beyond
   height/width fill, which the grid item's own stretch default gives it. */
#tree-control-wrapper {
  height: 100%;
}

/* #vue-tree-panel (the tree leaf's own cell): stacks the header above
   TreeWidget, same as pre-rework App.vue. `position: relative` (W3) is
   the OUTER resizer bar's own anchor — see the template's own comment
   at its usage site for why this leaf's LEFT edge is topologically the
   same boundary the pre-LYT OUTER bar sat at. */
#vue-tree-panel {
  display: flex; flex-direction: column;
  position: relative;
  border-left: 1px solid var(--border-1); background: var(--surface-2);
  height: 100%;
}
#tree-panel-header { height: 20px; background: var(--surface-0); border-bottom: 1px solid var(--border-1); display: flex; align-items: center; padding: 0 var(--space-default); font-size: var(--text-tiny); letter-spacing: var(--tracking-wide); color: var(--text-0); text-transform: uppercase; flex-shrink: 0; }

/* #control-panel (the collapsed T(CP-*) black-box leaf): TabWidget fills
   it edge-to-edge, matching pre-rework App.vue's own flex-column shape.
   `position: relative` (W3) anchors the INNER resizer bar at this leaf's
   own left edge. */
#control-panel {
  border-left: 1px solid var(--border-1); background: var(--surface-3);
  display: flex; flex-direction: column; position: relative; height: 100%;
}

/* ── W3 resizer bars (roadmap §8 W3, §4 item 1) ───────────────────────
   Standing ruling (App.vue's pre-LYT `.panel-resizer` history, carried
   forward in spirit): paint 1px, grab area ~4px via a `::before`
   pseudo-element overhang that occupies no additional GRID-TRACK space
   (the bar is a zero-track-cost absolute overlay under the LYT grid —
   see LytNode.vue's own header, "Resizer drag overrides", for why the
   grid track sizing itself is untouched by these elements).

   DISCLOSED FIX (build-time, not a later narrowing): a first draft
   anchored the bar OUTSIDE its positioned ancestor's own box
   (`left: -1px`, straddling the boundary line symmetrically) — this
   silently failed to receive pointer events on `#control-panel`
   specifically, because `assets/css/style.css`'s own pre-existing
   `#control-panel { overflow: auto; ... }` rule (kept intentionally,
   per that file's own comment, "until a follow-up consolidates
   control-panel styling") CLIPS any absolutely-positioned descendant
   that renders outside its padding box — the negative-offset bar was
   silently un-hit-testable there (confirmed live: `elementsFromPoint`
   at the bar's own rendered coordinate returned `#control-panel`
   itself, never the bar or its `::before`). `#vue-tree-panel` (the
   OUTER bar's own anchor) carries no such rule and was unaffected —
   an inconsistency this fix removes by construction rather than
   leaving one bar on a fragile, anchor-dependent positioning scheme.
   Both bars now render `left: 0` — the FIRST pixel INSIDE their own
   positioned ancestor's padding box, never past it — with the pointer-
   target overhang extending only INWARD (`::before`, 4px, `left: 0`)
   for the same reason. Cosmetically this paints the 1px line as the
   anchor's own leftmost column rather than literally straddling the
   split's gap — visually indistinguishable at this hairline width,
   and the boundary it drags is unchanged. */
.lyt-resizer {
  position: absolute;
  top: 0;
  z-index: 10;
}
.lyt-resizer-vertical {
  left: 0;
  width: 1px;
  height: 100%;
  background: var(--border-2);
  cursor: col-resize;
}
.lyt-resizer-vertical::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
}

/* Each of the two cluster leaves' own mounting div (LYT toolbar ontology
   reencode, 2026-08-11): `.lyt-toolbar-strip` wraps EITHER
   `<ToolbarEngineCluster>` or `<ToolbarAppCluster>` alone now (one per
   leaf, `#leaf-A_engine` / `#leaf-A_app`) — previously it also carried
   the SGF buttons and LocalePicker as siblings of the merged `Toolbar`;
   both moved inside `ToolbarAppCluster.vue` itself (self-contained, see
   that file's header), so this wrapper's own job shrinks to "size the
   cell, let the mounted cluster's own flex-wrap degrade within it." */
.lyt-toolbar-strip { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-default); height: 100%; width: 100%; min-width: 0; overflow-y: auto; }
/* SGF load/save buttons — now rendered inside `ToolbarAppCluster.vue`
   (moved there, see that file's header), but this rule stays HERE: this
   `<style>` block is not `scoped`, so a plain class selector already
   reaches into any child component's markup, which is exactly how the
   pre-reencode `Toolbar.vue` overrides above worked too — no change of
   mechanism, just of which component's buttons carry the class. 24px
   pointer floor (standing
   law); token-correct surface/border/text per the umbrella's category
   discipline. */
.lyt-sgf-btn {
  min-height: 24px; padding: 0 var(--space-default);
  background: var(--surface-0); border: 1px solid var(--border-2);
  color: var(--text-0); border-radius: var(--radius-default);
  cursor: pointer; font-size: var(--text-body); flex-shrink: 0;
}

/* W1 repair (ledger row 1781, review finding A) is now HISTORICAL — see
   this file's own script-header "Finding A, dated note" (2026-08-11):
   `Toolbar.vue` and its `.toolbar`/`.toolbar-cluster`/`.engine-controls`
   classes are retired, along with the global (non-scoped) override rules
   that used to reach past its scoping boundary from here. The wrap/
   shrink behaviour those rules patched in from outside is now authored
   directly in each mounted component's own scoped stylesheet
   (`.engine-controls`/`.app-cluster`/`.toolbar-cluster` there), since
   every one of them only ever mounts in this narrow side-column
   context — no external override needed.
   [corrected 2026-08-12, M2 stage B2b boot-restoration wiring]:
   `.engine-cluster` (the retired ToolbarEngineCluster.vue's own root
   class) is replaced by three new root classes now that the ruling row
   2073 decomposition mounts three independent components per row —
   `.engine-controls` (ToolbarEngineControls.vue), `.engine-metrics-bar`
   (ToolbarEngineMetrics.vue, both groups), `.queue-metric`
   (EngineQueueTooltip.vue's own root, a `<div class="metric
   queue-metric">`). Each gets the same flex-basis treatment
   `.engine-cluster` used to. */
.lyt-toolbar-strip .engine-controls,
.lyt-toolbar-strip .engine-metrics-bar,
.lyt-toolbar-strip .queue-metric,
.lyt-toolbar-strip .app-cluster {
  flex: 1 1 0;
  min-width: 0;
  width: auto;
}

.hue-slider-hint { font-size: var(--text-body); color: var(--text-0); margin: 0 0 var(--space-default) 0; }
</style>
