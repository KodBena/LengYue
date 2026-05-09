/**
 * tests/e2e/seed.ts
 *
 * Backend-side fixture seeding for the e2e fuzzing harness. The
 * harness needs a fresh authenticated identity per scenario and a
 * single card with a known SGF and the flat `visit_ratio` palette.
 * This module does both without going through `useMinting` (which
 * would otherwise pull palette / defaults from the user's profile,
 * binding the test to the seeded defaults).
 *
 * License: Public Domain (The Unlicense)
 */

import { api } from '../../src/services/api-client';
import { backendService } from '../../src/services/backend-service';
import type { CardCreatePayload, CardId } from '../../src/types';

/**
 * Register and log in a fresh open-access account. The username is
 * timestamp-suffixed so the harness can run repeatedly without
 * backend cleanup. Resolves once the JWT is in localStorage (or our
 * shim — see `tests/setup.ts`).
 */
export async function seedTestUser(): Promise<{ username: string }> {
  const username = `e2e_review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await api.register(username);
  await api.login(username);
  return { username };
}

export interface SeedTestCardOptions {
  readonly sgf: string;
  readonly numMoves: number;
  readonly defaultVisits: number;
  readonly gamma: number;
  readonly analysis_config: unknown;
  readonly description: string;
}

/**
 * Create a single root card with a custom palette. Wire shape mirrors
 * what `useMinting` builds (see `src/composables/useMinting.ts`) but
 * with `analysis_config` taken from the caller rather than the user's
 * profile.
 */
export async function seedTestCard(opts: SeedTestCardOptions): Promise<CardId> {
  const payload: CardCreatePayload = {
    raw_content: opts.sgf,
    num_moves: opts.numMoves,
    grading_parameter: {
      data: {
        analysis_config: opts.analysis_config,
        default_visits: opts.defaultVisits,
        gamma: opts.gamma,
      },
    },
    tags: [],
    game_metadata: {
      description: opts.description,
      player_white: 'KataGo (test fixture)',
      player_black: 'KataGo (test fixture)',
    },
  };
  return (await backendService.createCard(payload)) as CardId;
}
