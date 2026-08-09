/**
 * src/composables/review/useMinting.ts
 * Controller for Flashcard Minting and Lineage Resolution.
 * License: Public Domain (The Unlicense)
 */

import { store } from '../../store';
import { backendService } from '../../services/backend-service';
import { serializeActivePath, setSgfRootKomi } from '../../engine/sgf-writer';
import { resolveGameName } from '../../engine/util';
import { compileAnalysisConfig, compileEngineOverrides } from '../../state/analysis-config';
import { useMetadata } from '../auth-app/useMetadata';
import { learnTags } from '../cards/useTags';
import { useKomiCalibration } from './useKomiCalibration';
import { useKnownPositions } from '../cards/useKnownPositions';
import type { KomiCalibrationResult } from '../../engine/katago/komi-calibration';
import type { BuildBatchMintPayloadResult } from '../cards/batch-mint-core';
import { computed, ref } from 'vue';
import type {
  BoardId,
  BoardState,
  CardBatchParentRef,
  CardCreatePayload,
  CardId,
  GameMetadataPayload,
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
 * `prepareDraft` (mint-from-board) and `useLearnPath` (mint-from-
 * synthesized-position) can call it without needing a live board.
 * Extracted from `prepareDraft` (was inline 34b logic) when
 * `useLearnPath` needed the identical construction without a
 * `boardId` to read from.
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
 * card this board was loaded from) or `game_metadata` (a fresh root) —
 * exactly the rule `prepareDraft` below applies for a single mint.
 * Extracted (batch card-minting affordance, ledger rows 926/957/1008)
 * so the batch draft path (`MintCardModal.vue`'s "Mint card(s)")
 * builds its `fallbackParentRef`/`fallbackGameMetadata` — the
 * resolution `batch-mint-core.ts::buildBatchMintPayload` falls back to
 * for any selected node whose nearest ancestor ISN'T also in the
 * batch — through this SAME code, never a re-derived copy of the
 * XOR rule (spec point 3: "the same parent resolution the single mint
 * uses today").
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
  // See prepareDraft's own inline comment (below) for the full
  // rationale (heredity XOR rule, client_game_id dedup key) — verbatim
  // logic, moved here so both callers share it.
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
   * Reads the current board state and user settings, and constructs
   * a Draft Payload for the Minting Modal. Enforces the XOR rule.
   */
  async function prepareDraft(boardId: BoardId): Promise<CardCreatePayload | null> {
    const board = store.boards.find(b => b.id === boardId);
    if (!board) return null;

    // Extract SGF metadata
    // We use a temporary computed to leverage the existing useMetadata logic
    const boardRef = computed(() => board);
    const metadata = useMetadata(boardRef).value;

    // 1. Serialize only the active path (omits sidelines)
    const sgf = serializeActivePath(board);

    // 2. Resolve Lineage (Heredity XOR Rule) — extracted to
    // `resolveBoardLineage` (module-level, above) so the batch
    // card-minting affordance's fallback-parent resolution
    // (`MintCardModal.vue`'s "Mint card(s)" batch draft,
    // `resolveBoardLineageAsBatchFallback`) shares this EXACT code,
    // never a re-derived copy of the XOR rule. See that function's own
    // doc comment for the field-by-field rationale (sourceCardId as
    // the single source of truth, the CardId brand-strip cast,
    // client_game_id dedup, first-mint-wins metadata).
    const { parent_card_id, game_metadata } = resolveBoardLineage(board, metadata);

    // 3. Resolve Palette (Grading Parameter) — the mint-time snapshot has
    // two legs: `analysis_config` (palette) determines how the proxy
    // enriches the response; `overrideSettings` (KataGo runtime
    // overrides) determines what packets KataGo emits in the first
    // place. Both are part of the stable analysis identity for this
    // card; both are read back at review time by `useReviewSession` and
    // threaded through `analyzeRange` so the replay matches the mint-time
    // analysis posture exactly. Extracted to `compileMintGradingParameter`
    // (module-level, above) so `useLearnPath` can build the identical
    // blob without a live `boardId` to read from.
    const grading_parameter = compileMintGradingParameter();

    return {
      raw_content: sgf,
      num_moves: store.profile.settings.minting.defaultNumMoves,
      grading_parameter,
      tags: [],
      parent_card_id,
      game_metadata
    };
  }

  /**
   * Mint-time komi calibration (opt-in, pedagogical). Runs a FRESH
   * bounded evaluation for the board's current position at `visits`,
   * computes the komi that makes the position even, and writes it onto
   * the draft's serialized SGF (`raw_content`) so the minted card stores
   * the even-game komi.
   *
   * Komi travels in the SGF `KM` root property — the card's only komi
   * carrier (there is no separate komi wire field) — so adjusting it is
   * a frontend-only rewrite of `raw_content`. The draft is mutated in
   * place; the live board is untouched (calibration reads the board but
   * does not write to it, and the SGF rewrite operates on the draft's
   * own string).
   *
   * Failure (engine disconnect, wire error packet, timeout) REJECTS
   * (ADR-0002) — `calibrate` throws and the caller aborts the mint
   * loudly. There is no silent fallback to an uncalibrated mint.
   *
   * Returns the calibration result so the caller can report the komi set
   * (and whether it was clamped) in the system log.
   */
  async function calibrateKomiOnDraft(
    boardId: BoardId,
    draft: CardCreatePayload,
    visits: number,
  ): Promise<KomiCalibrationResult> {
    const board = store.boards.find(b => b.id === boardId);
    if (!board) {
      throw new Error(`calibrateKomiOnDraft: board ${boardId} not found in store`);
    }
    const { calibrate } = useKomiCalibration();
    const result = await calibrate({ board, maxVisits: visits });
    draft.raw_content = setSgfRootKomi(draft.raw_content, result.evenKomi);
    return result;
  }

  /**
   * Submits the finalized payload to the API.
   * Automatically adds any newly introduced tags to the user's knownTags list.
   */
  async function commitMint(payload: CardCreatePayload): Promise<number> {
    const newCardId = await backendService.createCard(payload);

    // Route the just-minted tags through the tag-dictionary chokepoint
    // so autocomplete remembers them this session (the metadata-edit
    // path does the same via useCardMetadata — see useTags.ts).
    learnTags(payload.tags);

    // card-position-annotations Stage A: record the just-minted card in
    // known-positions immediately, so it's recognised as a duplicate on
    // a subsequent mint attempt this session without waiting on a
    // re-fetch to route it through `mapToReviewCard`. Best-effort — a
    // failure here must not fail the mint itself (the card was already
    // created successfully above); logged, not rethrown.
    try {
      // Brand mint: `createCard` returns the wire's raw `card_id: number`
      // (see BackendService.createCard); CardId's brand is phantom, so
      // this is the standard boundary re-brand, same pattern as
      // `prepareDraft`'s `parent_card_id as unknown as number` strip
      // above (just the inverse direction).
      await rememberMintedCard(payload.raw_content, newCardId as unknown as CardId);
    } catch (err) {
      console.warn('[useMinting] rememberMintedCard failed (non-fatal):', err);
    }

    return newCardId;
  }

  /**
   * Submits one `POST /cards/batch` request — the non-empty-selection
   * arm of "Mint card(s)" (spec point 2: a non-empty selection mints
   * ALL selected positions in ONE call). `items` is
   * `batch-mint-core.ts::buildBatchMintPayload`'s output; the returned
   * `card_ids` are in the SAME order as `items.nodeOrder`, so the
   * caller (`MintCardModal.vue`) can map each minted id back to the
   * tree node it came from.
   *
   * Mirrors `commitMint`'s two best-effort side effects (tag-dictionary
   * learning, known-positions recording) — a batch of N cards is N
   * mints from the app's own point of view, just wire-batched into one
   * HTTP round trip.
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
    prepareDraft,
    calibrateKomiOnDraft,
    commitMint,
    commitMintBatch,
    checkDuplicate,
    resetDuplicateCheck,
    duplicateCheckStatus,
    duplicateCardId,
  };
}
