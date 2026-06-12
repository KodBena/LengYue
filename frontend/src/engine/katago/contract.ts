/**
 * src/engine/katago/contract.ts
 * Black-box callback-registry contract for the KataGoClient transport.
 * License: Public Domain (The Unlicense)
 */

import type {
  KataGoQuery,
  KataGoResponse,
  KataGoActionQuery,
  ResponseFor,
} from './types';

/**
 * The KataGoClient is a "Black Box" that manages the WebSocket.
 * It uses a "Callback Registry" to route messages.
 */
export interface IKataGoClient {
  /**
   * Sends a query and provides a stream of responses.
   *
   * Generic over the query type so the callback receives only the
   * responses that query's id can carry (`ResponseFor<Q>`): an analysis
   * query yields `KataAnalysisResponse | KataErrorResponse`, an action
   * query yields `KataActionResponse | KataErrorResponse`. The subscriber
   * must discriminate `'error' in res` before reading the variant — the
   * type-enforced narrowing the dispatch layer cannot give for free.
   *
   * @param query The query (analysis stream or one-shot action)
   * @param onUpdate Called every time a packet (pondering or final) arrives
   * @returns A function to "Unsubscribe" (terminate) this specific query
   */
  subscribe<Q extends KataGoQuery>(
    query: Q,
    onUpdate: (response: ResponseFor<Q>) => void
  ): () => void;

  /**
   * Execute a one-off action (like clear_cache).
   */
  sendCommand(query: KataGoActionQuery): Promise<KataGoResponse>;

  /** Lifecycle management */
  connect(): void;
  disconnect(): void;
}
