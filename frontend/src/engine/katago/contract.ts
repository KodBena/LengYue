import type {
  KataGoAnalysisQuery,
  KataGoResponse,
  KataGoActionQuery
} from './types';

/**
 * The KataGoClient is a "Black Box" that manages the WebSocket.
 * It uses a "Callback Registry" to route messages.
 */
export interface IKataGoClient {
  /**
   * Sends a query and provides a stream of responses.
   * @param query The Analysis Request
   * @param onUpdate Called every time a packet (pondering or final) arrives
   * @returns A function to "Unsubscribe" (terminate) this specific analysis
   */
  subscribe(
    query: KataGoAnalysisQuery,
    onUpdate: (response: KataGoResponse) => void
  ): () => void;

  /**
   * Execute a one-off action (like clear_cache).
   */
  sendCommand(query: KataGoActionQuery): Promise<KataGoResponse>;

  /** Lifecycle management */
  connect(): void;
  disconnect(): void;
}
