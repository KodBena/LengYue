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
import type {
  CardId,
  CardCreatePayload,
  CardLineageTree,
  CardMetadataPatch,
  CardPublicId,
  ContentHash,
  ResolveRootsResult,
  ReviewCard,
} from '../../src/types';

export const fakeBackendService = {
  submitReview: vi.fn<(cardId: CardId, scores: number[]) => Promise<ReviewCard>>(),
  createCard: vi.fn<(payload: CardCreatePayload) => Promise<number>>(),
  updateCardMetadata: vi.fn<(cardId: CardId, patch: CardMetadataPatch) => Promise<ReviewCard>>(),
  // useLearnPath's dedup-coverage read path (frontend/CLAUDE.md fakes
  // discipline: added when useLearnPath.test.ts started exercising it).
  // Browse-leak-fix (ledger rows 417/423): fetchTreeByRoot takes the
  // per-user display id, not the raw CardId.
  resolveRoots: vi.fn<(cardIds: CardId[]) => Promise<ResolveRootsResult>>(),
  fetchTreeByRoot: vi.fn<(rootCardPublicId: CardPublicId, maxNodes?: number) => Promise<CardLineageTree>>(),
  fetchCard: vi.fn<(cardId: CardId) => Promise<ReviewCard>>(),
  // card-position-annotations Stage A: the stateless hash lookup
  // (`POST /positions/hash`) — exercised by useMinting/useKnownPositions'
  // mint-time duplicate check.
  hashPosition: vi.fn<(rawContent: string) => Promise<ContentHash>>(),
  // card-position-annotations Stage B: the batched hash lookup
  // (`POST /positions/hash-batch`) — exercised by
  // useNodePositionHashes' viewport-driven tree-node cache fill.
  hashPositionsBatch: vi.fn<(rawContents: string[]) => Promise<ContentHash[]>>(),
};

export function resetFakeBackendService(): void {
  fakeBackendService.submitReview.mockReset();
  fakeBackendService.createCard.mockReset();
  fakeBackendService.updateCardMetadata.mockReset();
  fakeBackendService.resolveRoots.mockReset();
  fakeBackendService.fetchTreeByRoot.mockReset();
  fakeBackendService.fetchCard.mockReset();
  fakeBackendService.hashPosition.mockReset();
  fakeBackendService.hashPositionsBatch.mockReset();
}
