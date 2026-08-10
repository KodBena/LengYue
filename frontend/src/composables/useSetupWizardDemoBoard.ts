/**
 * src/composables/useSetupWizardDemoBoard.ts
 *
 * Wizard-step-local demo board (ledger slug swz-setup-wizard, step
 * "d"): loads the static demo asset (`lib/setup-wizard-demo-loader.ts`),
 * replays it to a real `BoardState`, and seeds the SAME analysis
 * ledger the live engine path writes
 * (`state/analysis-ledger.ts::ledger.recordRaw`) under the SAME key
 * `BoardWidget.vue` reads live (`state/analysis-config.ts::
 * activeAnalysisKeys`, derived from the current palette/overrides/
 * model — the raw half doesn't depend on the palette, so a palette
 * swap mid-wizard doesn't invalidate this seed). ADR-0012: one fact,
 * one home — this composable is a second SOURCE for the ledger, never
 * a second ledger.
 *
 * ADR-0002 (fail loudly): a malformed asset throws inside
 * `loadSetupWizardDemo()`; this composable catches once, at the
 * boundary, surfaces it via `pushSystemMessage('error', ...)`, and
 * exposes `loadError` so the wizard step can render a visible failure
 * instead of a silently blank board.
 *
 * Ledger reseed on every call, not just the first (found while
 * building the merged demo-board+PV step's live-feedback witness,
 * ledger rows 1357/1358): the parse+replay is genuinely expensive and
 * stays cached, but the ledger WRITE is cheap and MUST re-run on every
 * call — the shared `ledger` is a module-level singleton anything else
 * can purge from under an already-mounted wizard (`resetWorkspace()`'s
 * `ledger.purgeAll`, O8). Before this fix, a purge that happened after
 * the first `useSetupWizardDemoBoard()` call left the demo board
 * mounted but ledger-empty — its own suggestion overlay would go
 * silently blank for the rest of the session, exactly the class of
 * bug ADR-0002 exists to make loud instead. `cachedRawAnalysis` below
 * is what makes the reseed replay-free: it's the same `demo.rawAnalysis`
 * captured once, just written into the ledger again.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, shallowRef, type Ref, type ShallowRef } from 'vue';
import { loadSetupWizardDemo, type SetupWizardDemoProvenance } from '../lib/setup-wizard-demo-loader';
import { ledger } from '../state/analysis-ledger';
import { compileAnalysisConfig, compileEngineOverrides, deriveAnalysisKeys } from '../state/analysis-config';
import { store } from '../store';
import { pushSystemMessage } from '../store';
import { i18n } from '../i18n';
import type { BoardState, NodeId } from '../types';
import type { RawAnalysis } from '../engine/katago/types';

export interface SetupWizardDemoBoard {
  /** The replayed demo board, or `null` if the asset failed to load. */
  readonly board: ShallowRef<BoardState | null>;
  readonly provenance: Ref<SetupWizardDemoProvenance | null>;
  /** True once the asset failed loudly — the step renders an error, never a blank board. */
  readonly loadError: Ref<string | null>;
  /**
   * The captured top move's PV (KataGo/GTP coordinates), unmodified
   * from the asset — the PV-playback controls folded into
   * `WizardStepDemoBoard.vue` (formerly the separate
   * `WizardStepPvAnimation.vue` step, merged per ledger rows
   * 1357/1358) demonstrate the live `usePvAnimation` cfg
   * (`session.ui.pvAnimation`) against this sequence. Empty if the
   * asset failed to load or recorded no moveInfos.
   */
  readonly topPv: Ref<readonly string[]>;
}

let cached: SetupWizardDemoBoard | null = null;
// Captured once alongside `cached`, replayed into the ledger on EVERY
// call (see file header "Ledger reseed on every call") — never
// re-derived, so the reseed carries none of the expensive parse+replay
// cost the `cached` guard exists to avoid.
let cachedRawAnalysisForReseed: { nodeId: NodeId; rawAnalysis: RawAnalysis } | null = null;

function reseedLedger(): void {
  if (!cachedRawAnalysisForReseed) return;
  const { rawKey } = deriveAnalysisKeys(
    compileAnalysisConfig(),
    compileEngineOverrides(),
    store.engine.selectedModel ?? undefined,
  );
  ledger.recordRaw(rawKey, cachedRawAnalysisForReseed.nodeId, cachedRawAnalysisForReseed.rawAnalysis);
}

/**
 * Module-memoised: every wizard-step consumer of the demo board
 * shares the SAME replayed BoardState instance (so the checkbox /
 * slider / PV-playback controls all reflect the one board), and the
 * asset is parsed + replayed at most once per session. The ledger
 * WRITE, unlike the parse+replay, re-runs on every call — see file
 * header.
 */
export function useSetupWizardDemoBoard(): SetupWizardDemoBoard {
  if (cached) {
    reseedLedger();
    return cached;
  }

  const board = shallowRef<BoardState | null>(null);
  const provenance = ref<SetupWizardDemoProvenance | null>(null);
  const loadError = ref<string | null>(null);
  const topPv = ref<readonly string[]>([]);

  try {
    const demo = loadSetupWizardDemo();
    board.value = demo.board;
    provenance.value = demo.provenance;
    topPv.value = demo.rawAnalysis.moveInfos[0]?.pv ?? [];

    cachedRawAnalysisForReseed = { nodeId: demo.nodeId, rawAnalysis: demo.rawAnalysis };
    reseedLedger();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    loadError.value = message;
    pushSystemMessage('error', i18n.global.t('wizard.demoBoard.loadError', { message }));
  }

  cached = { board, provenance, loadError, topPv };
  return cached;
}
