/**
 * src/composables/review/useMinting.ts
 * Controller for Flashcard Minting and Lineage Resolution.
 * License: Public Domain (The Unlicense)
 */

import { store } from '../../store';
import { backendService } from '../../services/backend-service';
import { serializeActivePath } from '../../engine/sgf-writer';
import { resolveGameName } from '../../engine/util';
import { compileAnalysisConfig, compileEngineOverrides } from '../../services/analysis-config';
import { useMetadata } from '../auth-app/useMetadata';
import { learnTags } from '../cards/useTags';
import { computed } from 'vue';
import type { BoardId, CardCreatePayload, GameMetadataPayload } from '../../types';

export function useMinting() {
  
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

    // 2. Resolve Lineage (Heredity XOR Rule).
    // The board's `sourceCardId` is the single source of truth for
    // "this board was derived from card X" — set by the card-load
    // paths (database tab via useDirtyBoardGuard, SR queue via
    // useReviewSession.loadCard); absent on fresh boards from
    // createInitialBoard and on SGF file uploads via useSgfLoader.
    // Per the wire contract the two fields are mutually exclusive:
    // supply game_metadata only when there is no upstream card.
    // The `as unknown as number` cast strips the CardId brand at the
    // wire boundary (CardId = Brand<number, 'CardId'>); the brand
    // erases at runtime, so this is the standard ADR-0002-justified
    // brand-erasure cast on the way to a snake_case wire payload.
    let parent_card_id: number | undefined = undefined;
    let game_metadata: GameMetadataPayload | undefined = undefined;

    if (board.sourceCardId !== undefined) {
      parent_card_id = board.sourceCardId as unknown as number;
    }

    // If there is no parent card, it is a Root. We must provide game_metadata.
    //
    // `description` runs through `resolveGameName` directly rather than the
    // `metadata?.gameName` projection so this codepath doesn't depend on the
    // composable surface for a value the wire requires; the four-rung
    // ladder (GN → EV → sourceFileName → date-stamped catch-all) is the
    // SSOT for "user-friendly game name" and `useMetadata` reads from
    // the same helper for display.
    //
    // `client_game_id` is the dedup key per
    // `docs/dispatch/backend-to-frontend-game-source-dedup-status.md`.
    // Sent unconditionally on every root-mint from this board's lifetime;
    // backend's get-or-create on `(user_id, client_game_id)` resolves
    // subsequent mints to the same game_source row, so two mints from
    // positions A and B of one loaded SGF surface as a single forest
    // entry with two roots underneath. First-mint-wins on metadata —
    // the description / player names from the second mint are ignored
    // backend-side, which matches the user intent of editing SGF root
    // properties between mints not retroactively rewriting the recorded
    // game name.
    if (!parent_card_id) {
      game_metadata = {
        description: resolveGameName(board),
        player_white: metadata?.whiteName,
        player_black: metadata?.blackName,
        client_game_id: board.clientGameId,
      };
    }

    // 3. Resolve Palette (Grading Parameter)
    const mintingPrefs = store.profile.settings.minting;
    const env = store.profile.settings.engine.katago.analysis_env;

    // 34b: `grading_parameter` is declared with a widening annotation
    // (`Record<string, any>`) because we mutate it below to add
    // `default_visits`. Without this, TypeScript would infer the narrower
    // object-literal type from the initializer and reject the mutation.
    //
    // The mint-time snapshot has two legs: `analysis_config` (palette)
    // determines how the proxy enriches the response; `overrideSettings`
    // (KataGo runtime overrides) determines what packets KataGo emits
    // in the first place — winrate sign convention, symmetry sampling,
    // root noise. Both are part of the stable analysis identity for
    // this card; both are read back at review time by `useReviewSession`
    // and threaded through `analyzeRange` so the replay matches the
    // mint-time analysis posture exactly. The hash that buckets ledger
    // entries combines both via `compileAnalysisDescriptorFromParts`.
    //
    // `compileEngineOverrides()` returns `undefined` when the user has
    // no overrides configured; we conditionally include the field so a
    // legacy card's snapshot shape (no `overrideSettings` key) is
    // reachable as a deliberate "no overrides" semantic for future
    // mints from a registry-cleared profile.
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

    // 34b: `default_visits` now lives inside `grading_parameter.data`
    // instead of at the top level of the payload. Merged in after
    // palette resolution so both the "active" and "specific palette"
    // branches pick it up uniformly.
    grading_parameter.data.default_visits = mintingPrefs.defaultVisits;

    // Recall-discount γ rides in the same opaque blob — the wire is
    // OpenAPI-honest about the shape (`{[key: string]: unknown} |
    // null`); the backend reads it back via the same `data.gamma`
    // path on grading. The MintCardModal surfaces it as editable so
    // the per-card override is set at mint time; this seeds the
    // user's profile-default value. Read-side counterpart in
    // `backend-service.ts::mapToReviewCard`'s `?? 0.9` fallback.
    grading_parameter.data.gamma = mintingPrefs.defaultGamma;

    return {
      raw_content: sgf,
      num_moves: mintingPrefs.defaultNumMoves,
      grading_parameter,
      tags: [],
      parent_card_id,
      game_metadata
    };
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

    return newCardId;
  }

  return {
    prepareDraft,
    commitMint
  };
}
