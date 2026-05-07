/**
 * tests/fakes/backend-service.ts
 *
 * Fake substitute for the `backendService` singleton exported from
 * `src/services/backend-service.ts`. Exposes the subset of the real
 * surface that test subjects in this tree exercise; spy functions
 * (`vi.fn()`) record call arguments and let each test configure
 * return values.
 *
 * Usage pattern (see tests/integration/useReviewSession.test.ts):
 *
 *     vi.mock('../../src/services/backend-service', async () => {
 *       const { fakeBackendService } = await import('../fakes/backend-service');
 *       return { backendService: fakeBackendService };
 *     });
 *
 * The fake is a module-scope singleton; tests must call
 * `resetFakeBackendService()` in their `beforeEach` to clear call
 * records and return-value configurations across tests.
 *
 * Extend by adding more spies as new test subjects exercise more of
 * the BackendService surface — keep the fake's shape strictly to
 * what's actually exercised, so a contributor reading this file
 * sees the test-time contract verbatim.
 *
 * License: Public Domain (The Unlicense)
 */

import { vi } from 'vitest';
import type { CardId, ReviewCard } from '../../src/types';

export const fakeBackendService = {
  submitReview: vi.fn<(cardId: CardId, scores: number[]) => Promise<ReviewCard>>(),
};

export function resetFakeBackendService(): void {
  fakeBackendService.submitReview.mockReset();
}
