/**
 * src/composables/review/useMinting.ts
 * Controller for Flashcard Minting and Lineage Resolution.
 * License: Public Domain (The Unlicense)
 */

import { store } from '../../store';
import { setSgfRootKomi } from '../../engine/sgf-writer';
import { resolveGameName } from '../../engine/util';
import { compileAnalysisConfig, compileEngineOverrides } from '../../state/analysis-config';
import { learnTags } from '../cards/useTags';
import { useKomiCalibration } from './useKomiCalibration';
import { useKnownPositions } from '../cards/useKnownPositions';
import { backendService } from '../../services/backend-service';
import type { KomiCalibrationResult } from '../../engine/katago/komi-calibration';
import type { BuildBatchMintPayloadResult } from '../cards/batch-mint-core';
import { ref } from 'vue';
import type {
  BoardId,
  BoardState,
  CardBatchParentRef,
  CardId,
  GameMetadataPayload,
  NodeId,
} from '../../types';

/** `duplicateCheckStatus` states for the mint-dialog duplicate warning
 * (card-position-annotations Stage A, C6 posture: a lookup in flight
 * renders as "checking", never as a silent "no duplicate"). */
export type DuplicateCheckStatus = 'idle' | 'checking' | 'checked';

/**
 * Compiles the `grading_parameter` blob shared by every card-create
 * payload: the palette snapshot (active, or a user-pinned specific
 * palette per `minting.defaultPaletteId`), the engine-override
 * snapshot, `default_visits`, and `gamma`. Pure function of the
 * current profile settings — no board dependency — so both
 * `MintCardModal.vue`'s "Mint card(s)" batch draft and `useLearnPath`
 * (mint-from-synthesized-position, pre-batch-affordance history) can
 * call it without needing a live board. Originally extracted from the
 * single-mint `prepareDraft` (retired — batch card-minting affordance,
 * ledger rows 926/957/1008: the single mint is now the degenerate
 * one-item case of the SAME batch draft construction, not a separate
 * function).
 */
export function compileMintGradingParameter(): Record<string, any> {
  const mintingPrefs = store.profile.settings.minting;
  const env = store.profile.settings.engine.katago.analysis_env;

  const overrideSettingsSnapshot = compileEngineOverrides();
  let grading_parameter: Record<string, any> = {
    data: {
      analysis_config: compileAnalysisConfig(),
      ...(overrideSettingsSnapshot ? { overrideSettings: overrideSettingsSnapshot } : {}),
    },
  };

  // If the user specified a specific default palette, compile just that one
  if (mintingPrefs.defaultPaletteId !== 'active') {
    const specificPalette = env.palettes.find(p => p.id === mintingPrefs.defaultPaletteId);
    if (specificPalette) {
      grading_parameter = {
        data: {
          analysis_config: {
            bindings: {
              delta_fn: specificPalette.delta_fn,
              state_fns: specificPalette.state_fns,
              summary_fn: specificPalette.summary_fn
            },
            parameters: env.parameters,
            symbols: env.symbols
          },
          ...(overrideSettingsSnapshot ? { overrideSettings: overrideSettingsSnapshot } : {}),
        }
      };
    }
  }

  grading_parameter.data.default_visits = mintingPrefs.defaultVisits;
  grading_parameter.data.gamma = mintingPrefs.defaultGamma;

  return grading_parameter;
}

/**
 * Resolves a board's XOR lineage — `parent_card_id` (a branch off the
 * card this board was loaded from) or `game_metadata` (a fresh root).
 * The SOLE resolution rule the batch card-minting affordance's
 * fallback parent resolution uses (ledger rows 926/957/1008):
 * `MintCardModal.vue`'s "Mint card(s)" batch draft builds its
 * `fallbackParentRef`/`fallbackGameMetadata` from this — the
 * resolution `batch-mint-core.ts::buildBatchMintPayload` falls back to
 * for any selected node whose nearest ancestor ISN'T also in the
 * batch (spec point 3: "the same parent resolution the single mint
 * uses today" — a single mint is now just a batch of one, so "today"
 * and "the batch's own fallback" are the same rule by construction,
 * not two rules kept in sync).
 *
 * `metadata` is the caller's already-computed `useMetadata(boardRef)`
 * projection (player names) — threaded in rather than recomputed here
 * so this stays a pure function of its arguments, no composable
 * instantiation of its own.
 */
export function resolveBoardLineage(
  board: BoardState,
  metadata: { whiteName?: string; blackName?: string } | null | undefined,
): { parent_card_id?: number; game_metadata?: GameMetadataPayload } {
  // Heredity XOR rule: the board's `sourceCardId` is the single
  // source of truth for "this board was derived from card X" — set by
  // the card-load paths (database tab via useDirtyBoardGuard, SR queue
  // via useReviewSession.loadCard); absent on fresh boards from
  // createInitialBoard and on SGF file uploads via useSgfLoader. Per
  // the wire contract the two fields are mutually exclusive: supply
  // game_metadata only when there is no upstream card. The
  // `as unknown as number` cast strips the CardId brand at the wire
  // boundary (CardId = Brand<number, 'CardId'>); the brand erases at
  // runtime, so this is the standard ADR-0002-justified brand-erasure
  // cast on the way to a snake_case wire payload.
  if (board.sourceCardId !== undefined) {
    return { parent_card_id: board.sourceCardId as unknown as number };
  }
  return {
    game_metadata: {
      description: resolveGameName(board),
      player_white: metadata?.whiteName,
      player_black: metadata?.blackName,
      client_game_id: board.clientGameId,
    },
  };
}

/**
 * `resolveBoardLineage`'s `parent_card_id`/`game_metadata` shape,
 * translated to the batch wire's `parent_ref` shape
 * (`{card_id}` | `null`) for `buildBatchMintPayload`'s
 * `fallbackParentRef` parameter.
 */
export function resolveBoardLineageAsBatchFallback(
  board: BoardState,
  metadata: { whiteName?: string; blackName?: string } | null | undefined,
): { fallbackParentRef: CardBatchParentRef | null; fallbackGameMetadata?: GameMetadataPayload } {
  const lineage = resolveBoardLineage(board, metadata);
  if (lineage.parent_card_id !== undefined) {
    return { fallbackParentRef: { card_id: lineage.parent_card_id } };
  }
  return { fallbackParentRef: null, fallbackGameMetadata: lineage.game_metadata };
}

export function useMinting() {
  const { checkForDuplicate, rememberMintedCard } = useKnownPositions();

  // Duplicate-check state for the currently-open draft. Reset by the
  // caller (`MintCardModal.open`) on each new draft; `checkDuplicate`
  // below is the sole writer.
  const duplicateCheckStatus = ref<DuplicateCheckStatus>('idle');
  const duplicateCardId = ref<CardId | null>(null);

  /**
   * Resolve `rawContent`'s content_hash via the stateless backend
   * endpoint and look it up against the caller's known positions.
   * Fire-and-await from the modal AFTER it has already opened with the
   * draft — the check must never block the draft from appearing (design
   * §4: "not a hard block", the user may proceed deliberately while the
   * check is still in flight or has found nothing).
   */
  async function checkDuplicate(rawContent: string): Promise<void> {
    duplicateCheckStatus.value = 'checking';
    duplicateCardId.value = null;
    try {
      duplicateCardId.value = await checkForDuplicate(rawContent);
    } finally {
      duplicateCheckStatus.value = 'checked';
    }
  }

  /** Reset duplicate-check state — called when a fresh draft opens. */
  function resetDuplicateCheck(): void {
    duplicateCheckStatus.value = 'idle';
    duplicateCardId.value = null;
  }

  /**
   * Mint-time komi calibration (opt-in, pedagogical). Runs a FRESH
   * bounded evaluation for `boardId`'s position at `targetNodeId`
   * (defaults to the board's current node) at `visits`, computes the
   * komi that makes THAT position even, and writes it onto `target`'s
   * serialized SGF (`raw_content`) so the minted card stores the
   * even-game komi.
   *
   * `target` is structurally typed (`{raw_content: string}`) rather
   * than pinned to `CardCreatePayload` — batch card-minting affordance
   * (ledger rows 926/957/1008): `MintCardModal.vue`'s single caller
   * passes one `BatchCardItemPayload` entry from a built batch, and
   * (ledger row 1063) calls this ONCE PER CARD in the batch — each
   * card calibrated to its OWN position, `targetNodeId` set to the
   * NodeId that card was built from (not necessarily the board's
   * current cursor). Both payload shapes carry a plain mutable
   * `raw_content: string` field, and this function reads/writes
   * nothing else.
   *
   * Komi travels in the SGF `KM` root property — the card's only komi
   * carrier (there is no separate komi wire field) — so adjusting it is
   * a frontend-only rewrite of `raw_content`. `target` is mutated in
   * place; the live board is untouched (calibration reads the board but
   * does not write to it, and the SGF rewrite operates on `target`'s
   * own string, not the board's).
   *
   * Failure (engine disconnect, wire error packet, timeout) REJECTS
   * (ADR-0002) — `calibrate` throws and the caller aborts the mint
   * loudly. There is no silent fallback to an uncalibrated mint.
   *
   * Returns the calibration result so the caller can report the komi set
   * (and whether it was clamped) in the system log. `evenKomi` is
   * already rounded to the nearest half-integer and clamped to KataGo's
   * accepted [-150, 150] range (`engine/katago/komi-calibration.ts`) —
   * one evaluation, one round, one clamp; never a search/loop for a
   * closer-than-0.5 result (KataGo's own wire constraint makes ~0.5
   * point from even the best achievable — never promised or chased
   * further).
   */
  async function calibrateKomiOnDraft(
    boardId: BoardId,
    target: { raw_content: string },
    visits: number,
    targetNodeId?: NodeId,
  ): Promise<KomiCalibrationResult> {
    const board = store.boards.find(b => b.id === boardId);
    if (!board) {
      throw new Error(`calibrateKomiOnDraft: board ${boardId} not found in store`);
    }
    const { calibrate } = useKomiCalibration();
    const result = await calibrate({ board, maxVisits: visits, targetNodeId });
    target.raw_content = setSgfRootKomi(target.raw_content, result.evenKomi);
    return result;
  }

  /**
   * Submits one `POST /cards/batch` request — the SOLE mint call site
   * `MintCardModal.vue`'s "Mint card(s)" uses (spec: "the single mint
   * is the degenerate case of the batch, one code path, not two" — an
   * empty selection resolves to a one-element batch of the board's
   * current node before this is ever called; there is no separate
   * single-item `POST /cards/` path through this affordance any more).
   * `items` is `batch-mint-core.ts::buildBatchMintPayload`'s output;
   * the returned `card_ids` are in the SAME order as `items.nodeOrder`,
   * so the caller can map each minted id back to the tree node it came
   * from.
   *
   * Two best-effort side effects per card (tag-dictionary learning,
   * known-positions recording) — a batch of N cards is N mints from
   * the app's own point of view, just wire-batched into one HTTP round
   * trip.
   */
  async function commitMintBatch(
    items: Pick<BuildBatchMintPayloadResult, 'cards' | 'nodeOrder'>,
  ): Promise<number[]> {
    const cardIds = await backendService.createCardsBatch({ cards: [...items.cards] });

    for (let i = 0; i < items.cards.length; i++) {
      const card = items.cards[i];
      const cardId = cardIds[i];
      learnTags(card.tags);
      try {
        await rememberMintedCard(card.raw_content, cardId as unknown as CardId);
      } catch (err) {
        console.warn('[useMinting] rememberMintedCard failed for batch item (non-fatal):', err);
      }
    }

    return cardIds;
  }

  return {
    calibrateKomiOnDraft,
    commitMintBatch,
    checkDuplicate,
    resetDuplicateCheck,
    duplicateCheckStatus,
    duplicateCardId,
  };
}
