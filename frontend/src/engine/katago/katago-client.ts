/**
 * src/engine/katago/katago-client.ts
 * Asynchronous WebSocket Transport for KataGo Analysis Engine.
 * License: Public Domain (The Unlicense)
 */

import { 
  type KataGoQuery, 
  type KataGoAnalysisQuery, 
  type KataGoResponse, 
  type KataGoActionQuery,
} from './types';

type ResponseCallback = (response: KataGoResponse) => void;

export interface ClientCallbacks {
  onDisconnect: (code: number, reason: string) => void;
  onError: (errorMsg: string) => void;
  // Fires on each successful WebSocket open — initial connection
  // and every reconnect. The parent uses this to issue identity
  // probes (`query_version`, `query_models`) so the status bar
  // reflects the live engine config rather than a stale snapshot
  // from before the drop. Optional so existing callers that don't
  // care about the connect-time hook stay one-line.
  onConnect?: () => void;
}

export class KataGoClient {
  private ws: WebSocket | null = null;
  private url: string;
  private subscribers = new Map<string, Set<ResponseCallback>>();
  private isConnecting = false;
  private callbacks?: ClientCallbacks;

  constructor(url: string) {
    this.url = url;
  }

  /**
   * Establishes the WebSocket connection and sets up global message routing.
   */
  public connect(url: string, callbacks: ClientCallbacks): void {
    this.url = url;
    this.callbacks = callbacks;

    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.isConnecting = false;
      // Notify parent of fresh connection so it can probe the
      // engine identity (version + models). Fires on each open —
      // initial connection and every reconnect — so a service
      // restart with new config is visible without remounting.
      this.callbacks?.onConnect?.();
    };

    this.ws.onmessage = (event) => {
      this.handleIncomingMessage(event.data);
    };

    this.ws.onclose = (event) => {
      this.isConnecting = false;
      this.ws = null;

      // Notify parent of unexpected disconnects
      if (this.callbacks) {
        this.callbacks.onDisconnect(event.code, event.reason);
      }
    };

    this.ws.onerror = (err) => {
      this.isConnecting = false;
      console.error(`[katago-client] WebSocket Error:`, err);
      // We don't always get text from WS Error events, but we fire a generic callback
      if (this.callbacks) {
        this.callbacks.onError("WebSocket connection error. Is the middleware running?");
      }
    };
  }

  /**
   * Parses the raw JSON and dispatches it to any callback matching the 'id'.
   */
  private handleIncomingMessage(rawData: string): void {
    try {
      const response: KataGoResponse = JSON.parse(rawData);
      
      // NEW: Intercept Error Packets (e.g. from bad Python Palettes)
      if ('error' in response) {
        console.error(`[katago-client] Received Error Packet:`, response.error);
        if (this.callbacks) {
          this.callbacks.onError(response.error);
        }
      }

      const callbacks = this.subscribers.get(response.id);
      if (callbacks) {
        callbacks.forEach(cb => cb(response));
      }
    } catch (err) {
      console.error(`[katago-client] Failed to parse response:`, err);
    }
  }

  public subscribe(query: KataGoAnalysisQuery, onUpdate: ResponseCallback): () => void {
    const id = query.id;

    if (!this.subscribers.has(id)) {
      this.subscribers.set(id, new Set());
    }
    this.subscribers.get(id)!.add(onUpdate);

    this.sendRaw(query);

    return () => {
      const callbacks = this.subscribers.get(id);
      if (callbacks) {
        callbacks.delete(onUpdate);
        if (callbacks.size === 0) {
          this.subscribers.delete(id);
        }
      }
    };
  }

  public sendCommand(query: KataGoActionQuery): Promise<KataGoResponse> {
    return new Promise((resolve) => {
      const cleanup = this.subscribe(query as any, (res) => {
        cleanup();
        resolve(res);
      });
    });
  }

  private sendRaw(query: KataGoQuery): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn(`[katago-client] Cannot send. WebSocket is waiting to connect.`);
      return;
    }
    this.ws.send(JSON.stringify(query));
  }

  public disconnect(): void {
    // Unset callbacks so intentional disconnects don't trigger the error UI
    this.callbacks = undefined;
    this.ws?.close();
    this.ws = null;
  }
}
