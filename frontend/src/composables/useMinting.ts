/**
 * src/composables/useMinting.ts
 * Controller for Flashcard Minting and Lineage Resolution.
 * License: Public Domain (The Unlicense)
 */

import { store } from '../store';
import { ebisuService } from '../services/ebisu-service';
import { serializeActivePath } from '../engine/sgf-writer';
import { compileAnalysisConfig } from '../services/analysis-config';
import { useMetadata } from './useMetadata';
import { computed } from 'vue';
import type { BoardId, CardCreatePayload, GameMetadataPayload } from '../types';

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

    // 2. Resolve Lineage (Heredity XOR Rule)
    let parent_card_id: number | undefined = undefined;
    let game_metadata: GameMetadataPayload | undefined = undefined;

    const reviewSession = store.session.reviews[boardId];
    if (reviewSession && reviewSession.status !== 'IDLE') {
      // Minting from an active review session: this is a branch mutation.
      const activeCard = reviewSession.queue[reviewSession.currentIndex];
      if (activeCard) {
        parent_card_id = activeCard.id as unknown as number;
      }
    }

    // If there is no parent card, it is a Root. We must provide game_metadata.
    if (!parent_card_id) {
      game_metadata = {
        description: metadata?.gameName || 'Free Play Mint',
        player_white: metadata?.whiteName,
        player_black: metadata?.blackName
      };
    }

    // 3. Resolve Palette (Grading Parameter)
    const mintingPrefs = store.profile.settings.minting;
    const env = store.profile.settings.engine.katago.analysis_env;

    // 34b: `grading_parameter` is declared with a widening annotation
    // (`Record<string, any>`) because we mutate it below to add
    // `default_visits`. Without this, TypeScript would infer the narrower
    // object-literal type from the initializer and reject the mutation.
    let grading_parameter: Record<string, any> = {
      data: { analysis_config: compileAnalysisConfig() }
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
            }
          }
        };
      }
    }

    // 34b: `default_visits` now lives inside `grading_parameter.data`
    // instead of at the top level of the payload. Merged in after
    // palette resolution so both the "active" and "specific palette"
    // branches pick it up uniformly.
    grading_parameter.data.default_visits = mintingPrefs.defaultVisits;

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
    const newCardId = await ebisuService.createCard(payload);
    
    // Update profile's known tags so autocomplete remembers them locally
    const currentTags = new Set(store.profile.knownTags);
    let tagsChanged = false;
    
    for (const tag of payload.tags) {
      if (!currentTags.has(tag)) {
        currentTags.add(tag);
        tagsChanged = true;
      }
    }
    
    if (tagsChanged) {
      store.profile = {
        ...store.profile,
        knownTags: Array.from(currentTags)
      };
    }

    return newCardId;
  }

  return {
    prepareDraft,
    commitMint
  };
}
