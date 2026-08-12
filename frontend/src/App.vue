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
 * License: Public Domain (The Unlicense)
 */
import { computed, watch } from 'vue';
import { ref as vueRef } from 'vue';
import { useI18n } from 'vue-i18n';

import { useMetadata }       from './composables/auth-app/useMetadata';
import { useEngineControls } from './composables/useEngineControls';
import { useUserIORegistry } from './composables/useUserIORegistry';
import { useAuth }           from './composables/auth-app/useAuth';
import { workspaceIdentityKey } from './composables/auth-app/workspace-identity-key';
import { getPanelContentPolicy, useDeferredLayoutClass } from './state/layout-model';
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
import BoardWidget      from './components/board/BoardWidget.vue';
import TreeWidget       from './components/tree/TreeWidget.vue';
import SettingsSubstrip from './components/chrome/SettingsSubstrip.vue';
import SettingsPane     from './components/chrome/SettingsPane.vue';
import AnalysisControls from './components/editors/AnalysisControls.vue';
import ToolbarEngineCluster from './components/chrome/ToolbarEngineCluster.vue';
import ToolbarAppCluster    from './components/chrome/ToolbarAppCluster.vue';
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
const {
  startResizeInner,
  startResizeOuter,
  effectiveTreeControlRegionWidthPx,
  effectiveTreePanelWidthPx,
  rowWidthPx,
  rowHeightPx,
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

// path -> DOM id, PORTRAIT's own map — same load-bearing legacy ids
// (commission item 4), reassigned to portrait's own tree paths (its
// board composite is root child '3', not '1'; its tree/control/preview
// row is root child '5', not '2.3' — see lyt-layout-portrait.gen.ts).
// '3'/'3.0' (was '2'/'2.0') and '5'/'5.0'/'5.1' (was '4'/'4.0'/'4.1'):
// M2 stage B2a/B2b — the new root-level `A_setup` leaf ('2') inserted
// ahead of the board split shifted every subsequent root child's own
// index by one (board '2' -> '3', engine '3' -> '4' [and grew into a
// 4-child composite in place], tree/control/preview '4' -> '5').
const LYT_DOM_ID_BY_PATH_PORTRAIT: Record<string, string> = {
  '': 'split-workspace',
  '3': 'board-area',
  '3.0': 'board-square',
  '5': 'tree-control-wrapper',
  '5.0': 'vue-tree-panel',
  '5.1': 'control-panel',
};

// W3 resizer drag overrides — see LytNode.vue's own header ("Resizer
// drag overrides") for the override-wins-verbatim contract. INNER
// (tree-panel width) applies to BOTH classes at each program's own tree
// leaf path. OUTER (tree+control REGION width) is LANDSCAPE-ONLY this
// wave — DISCLOSED NARROWING: landscape's OUTER bar drags root child '2'
// (the whole side column, whose board-priority-clamp track IS a WIDTH
// fact — see useResizablePanel.ts's header for the wrapper-vs-side-
// column derivation); portrait has no analogous "side column beside the
// board" concept (its board composite is a separate ROW, not a width-
// contested sibling), so what the OUTER bar's persisted WIDTH fact
// should even mean in a single-column stack is a genuine open design
// question, not one this wave invents an answer to. `startResizeOuter`
// and its corner bar are therefore only mounted in landscape (template
// below); `treeControlRegionWidthPx` itself is untouched by a portrait
// session (never written there), so returning to landscape restores
// the user's own prior drag exactly.
const lytTrackStyleOverrides = computed<Record<string, string>>(() => {
  // '2.3.0' (was '2.2.0') / '5.0' (was '4.0'): M2 stage B2a/B2b —
  // landscape's side column GREW from three V-children to four (the new
  // `A_setup` leaf inserted at '2.2', ahead of the tree row), shifting
  // the tree/panels row's own path from '2.2' to '2.3'; portrait's root
  // grew the same way (its own `A_setup` leaf inserted at '2', ahead of
  // the board split), shifting the tree/panels row from '4' to '5'.
  const treePanelPath = activeScreenClassId.value === 'portrait' ? '5.0' : '2.3.0';
  const overrides: Record<string, string> = {
    [treePanelPath]: `${effectiveTreePanelWidthPx.value}px`,
  };
  if (activeScreenClassId.value === 'landscape' && effectiveTreeControlRegionWidthPx.value !== undefined) {
    overrides['2'] = `${effectiveTreeControlRegionWidthPx.value}px`;
  }
  return overrides;
});

// Phase 3 (resolution roadmap, audit finding R3), carried into W1
// unchanged: the declared measure/reflow policy for the workspace's
// width class, threaded to the two control-panel tabs whose content is
// dense text/tables (Library, Cards). See `getPanelContentPolicy`'s doc
// (`state/layout-model.ts`).
const panelContentPolicy = computed(() => getPanelContentPolicy(layoutClass.value));

// path -> DOM id, forwarded to every recursive LytNode instance.
// Preserves the load-bearing legacy hooks (commission item 4) — the
// existing test suite and CSS below still resolve these selectors
// unchanged; only the mechanism producing the elements they attach to
// changed (CSS grid item instead of a flex child). See `LytNode.vue`'s
// own header ("DOM-id wiring") for the repair-pass fix that makes this
// map actually resolve (W1 repair, ledger row 1781, review finding B).
// '2.3'/'2.3.0'/'2.3.1' (was '2.2'/'2.2.0'/'2.2.1'): M2 stage B2a/B2b —
// see `lytTrackStyleOverrides`'s own comment just above for why the
// tree/panels row's path shifted.
const LYT_DOM_ID_BY_PATH_LANDSCAPE: Record<string, string> = {
  '': 'split-workspace',
  '1': 'board-area',
  '1.0': 'board-square',
  '2.3': 'tree-control-wrapper',
  '2.3.0': 'vue-tree-panel',
  '2.3.1': 'control-panel',
};

// W3: which of the two path -> DOM id maps is active follows the SAME
// screen-class swap as the compiled program itself — see
// `LYT_DOM_ID_BY_PATH_PORTRAIT`'s own comment (declared above, next to
// the other W3 screen-class-swap state) for why the paths differ between
// classes despite sharing every DOM id's own name.
const activeLytDomIdByPath = computed(() =>
  activeScreenClassId.value === 'portrait' ? LYT_DOM_ID_BY_PATH_PORTRAIT : LYT_DOM_ID_BY_PATH_LANDSCAPE,
);

// REALIZATION WAVE (`.claude/dispatch-reports/lyt-realization-wave.md`):
// the control-panel Exclusive's own dotted path, per class — derived from
// `activeLytDomIdByPath` (the one map that already names '#control-panel'
// per class) rather than a THIRD hand-maintained '2.3.1'/'5.1' literal
// pair (ADR-0012 P1 — one home, not a third copy of a fact
// `LYT_DOM_ID_BY_PATH_*` already states).
const controlPanelLytPath = computed<string>(() => {
  const entry = Object.entries(activeLytDomIdByPath.value).find(([, id]) => id === 'control-panel');
  if (!entry) {
    throw new Error(
      'App.vue: no LYT tree path resolves to "control-panel" in activeLytDomIdByPath — ' +
        'the control-panel Exclusive node must always have a DOM-id entry (LytNode.vue anchors ' +
        'the resizer-inner bar and #control-panel\'s own CSS off it).',
    );
  }
  return entry[0];
});

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
const lytPresenceOverrides = computed<Record<string, boolean>>(() => {
  const presence = store.session.ui.lytPresence;
  if (store.session.ui.railStyle === 'popover') {
    return { ...presence, boardRail: false };
  }
  return presence;
});

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
        <div id="lyt-overlay-stack">
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
               `next-futureblob-recovery`, rows 1942/1982; merged into the
               W4 overlay stack — same zero-standing-space stratum as its
               sibling banners, same v-if gate as on `next`): the ONGOING
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

          <SystemLogPanel
            v-if="store.session.ui.systemLogExpanded || transientLogReveal"
          />
        </div>

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

          <!-- LYT toolbar ontology reencode (item 2, "ONE ENGINE CLUSTER,
               ENVELOPE-RESERVED"): connect/disconnect, the engine-controls
               button cluster, and engine metrics are now ONE component,
               mounted at this one leaf — SAME widget id in both classes
               (landscape's own root child '2', portrait's own root V
               child previously named `I_engine`; see
               research/lyt/encodings/lengyue_portrait.lyt's header for why
               that class needed no tree reshuffle). -->
          <template #leaf-A_engine>
            <div class="lyt-toolbar-strip">
              <ToolbarEngineCluster
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

          <!-- LYT toolbar ontology reencode (item 3, "ONE APP CLUSTER"):
               Load/Save SGF, the sliders/setup/PBO popover triggers, the
               engine URI editor, and the locale picker — SAME widget id
               in both classes (landscape's own root child '2', portrait's
               own root V child previously named `A_top`). Self-contained
               (ToolbarAppCluster.vue sources its own SGF composables —
               see that file's own header), so this mount needs no
               App.vue-local wiring at all, unlike the pre-reencode
               `.lyt-toolbar-strip` block this replaces. -->
          <template #leaf-A_app>
            <div class="lyt-toolbar-strip">
              <ToolbarAppCluster />
            </div>
          </template>

          <template #leaf-tree>
            <!-- OUTER resizer bar (W3, landscape only — see this file's
                 script-header "W3 resizer drag overrides" note for the
                 disclosed narrowing). Anchored at #vue-tree-panel's own
                 LEFT edge — topologically identical to the boundary
                 between root child '1' (board) and root child '2' (side
                 column) in the ROOT split, since '2.3' (this leaf's own
                 parent split, was '2.2' before M2 stage B2a/B2b's new
                 `A_setup` leaf shifted it) cross-fills '2''s full width
                 with zero left offset. Paint 1px / grab ~4px per the standing
                 resizer ruling (mirrors App.vue's pre-LYT
                 `.panel-resizer` history — see the <style> block below). -->
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
              :nodes="activeBoard.nodes"
              :board-id="activeBoard.id"
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

              <!-- settingsSubstrip / settingsPane: OPENED LIVE (work item
                   `lyt-settings-live-opening`, ledger rows 2007/2009/2001) —
                   the encoding's own modeled V(settingsSubstrip, settingsPane)
                   interior now mounts as TWO separately-mounted LYT leaves,
                   reached via CP-settings' own now-genuine `split` node
                   (LytNode.vue's existing generic Split recursion, no
                   LytNode.vue change needed). See SettingsSubstrip.vue/
                   SettingsPane.vue's own headers and lyt-widget-registry.ts's
                   updated entries. CP-analysis: DISCLOSED SCOPE NARROWING
                   (unchanged from the realization wave's own delivery
                   report) — the encoding's own modeled nested-T interior
                   stays solver-visible but UNOPENED in the DOM; still mounts
                   as ONE component, unchanged wiring from the pre-wave
                   #analysis TabWidget slot. -->
              <template #leaf-settingsSubstrip>
                <div :key="controlPanelIdentityKey" style="width: 100%;">
                  <SettingsSubstrip />
                </div>
              </template>

              <template #leaf-settingsPane>
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

        <!-- Corner presence menu + (style-B-only) board-rail popover
             trigger — W2, roadmap §8 W2 items 1/2. Overlays, NOT LYT
             tree nodes (SPEC.md §2: "Overlays... contribute no
             constraints and occupy no standing space"), positioned
             fixed at the extreme lower-right of the chrome, riding on
             top of the existing workspace with zero grid-track cost.
             The button cluster itself never covers #board-square (a
             small fixed-size corner cluster, not a spreading overlay);
             each popover opens ABOVE its own trigger (see each
             component's own `<style>` — `bottom: 100%` anchors), so
             opening either one still never occludes the board.

             D2 fix (`.claude/dispatch-reports/lyt-w5-parity-build.md`
             Defect D2): `SystemLogToggle` restores the system log's
             manual open/close affordance the W1 skeleton replacement
             lost — see its own header for the placement rationale
             (why here rather than folded into `DebugMenu`, which is
             dev-build-only, or `LytPresenceMenu`, whose guard is
             specific to LYT grid-presence targets the log isn't). -->
        <div id="lyt-corner-chrome">
          <DebugMenu />
          <BoardRailPopoverTrigger v-if="store.session.ui.railStyle === 'popover'" />
          <LytPresenceMenu />
          <SystemLogToggle />
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

/* W4 item 1 — OVERLAY STRATUM (roadmap §7 ruling). `position: fixed`
   takes this stack out of `#main-workspace`'s flex column entirely —
   the SAME mechanism `#lyt-corner-chrome` already uses (that rule's
   own comment, below, has the fuller SPEC.md §2 citation) — so its
   appearance/disappearance can NEVER push `#split-workspace` or any
   toolbar child (the categorical "no layout push" requirement; a
   mount/unmount test — `tests/integration/overlay-stack-no-push.test.ts`
   — pins zero `#board-square`/`#split-workspace` rect movement across
   every v-if toggle this stack carries).

   Non-occlusion argument: anchored bottom-right, STACKED ABOVE
   `#lyt-corner-chrome` (the `bottom` offset below clears that
   cluster's own typical height + gap) — the SAME corner
   `#lyt-corner-chrome`'s own comment already argues is provably
   outside `#board-square` in BOTH screen classes (the side column /
   tree-panels row is the page's rightmost-and-bottommost region in
   landscape; the tree-panels row is the LAST, bottom-most row in
   portrait too — see `encodings/lengyue_landscape.lyt`'s own
   previewBoard placement note for the landscape half of this
   argument). `max-width` is capped well inside the side column's own
   reserved floor (280px post-W4-floor-softening) so the stack never
   reaches into the board's own territory even at the narrowest tested
   viewports. DISCLOSED, not independently re-derived per screen class
   with a live-measured corner-chrome height the way the W1 REPAIR
   toolbar reservation was (see that section's own methodology in
   `research/lyt/encodings/lengyue_landscape.lyt`) — the `bottom`
   offset below is a conservative estimate (one pill/button row's
   height plus its own gap) rather than a swept number; a follow-up
   wave re-measuring it live is the more rigorous confirmation, same
   disclosure posture the codebase already models elsewhere. */
#lyt-overlay-stack {
  position: fixed;
  right: var(--space-medium);
  bottom: calc(var(--space-medium) + 40px);
  z-index: var(--z-chrome-overlay);
  display: flex;
  flex-direction: column-reverse;
  gap: var(--space-tight);
  max-width: min(320px, 90vw);
  max-height: 60vh;
  pointer-events: none;
}
/* Each overlay piece opts back INTO pointer events individually — the
   stack's own container stays click-through where no piece is
   rendered, so an empty stack (the common case: no banner, log
   collapsed) never silently steals clicks from whatever chrome sits
   underneath it. */
#lyt-overlay-stack > * {
  pointer-events: auto;
}
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

/* Corner presence-menu / board-rail-popover cluster (W2). `position:
   fixed` takes it out of #main-workspace's flex column flow entirely —
   it does not add a row, does not participate in any LYT grid track,
   and rides ABOVE whatever chrome happens to be underneath it (SPEC.md
   §2's "overlays contribute no constraints and occupy no standing
   space", realized literally). Anchored to the viewport's own
   lower-right corner, matching the encoding's own placement rationale
   for previewBoard (`encodings/lengyue_landscape.lyt`'s own comment:
   "the rightmost slot of the new tree/panels row... IS the page's
   lower-right corner (already home to the corner presence-menu
   button..."). */
#lyt-corner-chrome {
  position: fixed;
  bottom: var(--space-medium);
  right: var(--space-medium);
  z-index: 900;
  display: flex;
  align-items: center;
  gap: var(--space-tight);
}

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
   directly in `ToolbarEngineCluster.vue`/`ToolbarAppCluster.vue`'s own
   scoped stylesheets (`.engine-cluster`/`.app-cluster`/`.toolbar-cluster`/
   `.engine-controls` there), since both components only ever mount in
   this narrow side-column context — no external override needed. */
.lyt-toolbar-strip .engine-cluster,
.lyt-toolbar-strip .app-cluster {
  flex: 1 1 0;
  min-width: 0;
  width: auto;
}

.hue-slider-hint { font-size: var(--text-body); color: var(--text-0); margin: 0 0 var(--space-default) 0; }
</style>
