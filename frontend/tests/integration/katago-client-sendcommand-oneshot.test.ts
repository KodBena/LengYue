/**
 * tests/integration/katago-client-sendcommand-oneshot.test.ts
 *
 * Tier-3 (service integration) tests for `KataGoClient.sendCommand`'s
 * one-shot path, pinned as the load-bearing constraint behind the typed
 * `subscribe<Q>` API (work-status item
 * `subscribe-dispatch-structural-narrowing`).
 *
 * The constraint: `sendCommand` resolves its promise on the FIRST
 * response routed onto its action query's id — including a
 * `KataErrorResponse`. This is exactly why `handleIncomingMessage`
 * surfaces an error packet and then FALLS THROUGH to the per-id
 * subscriber rather than early-returning: a blanket early-return would
 * starve `sendCommand`'s ephemeral subscription and hang the promise.
 * The typed-subscribe narrowing (which makes the analysis callback
 * discriminate the union at compile time) must not perturb this — an
 * action query's callback receives `KataActionResponse | KataErrorResponse`
 * and resolves on either.
 *
 * These tests drive the REAL `KataGoClient` against a mock `WebSocket`,
 * so `sendCommand` → `subscribe` → `sendRaw` and the inbound
 * `handleIncomingMessage` dispatch all run as in production.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { KataGoClient } from '../../src/engine/katago/katago-client';
import type { KataGoResponse } from '../../src/engine/katago/types';

// Minimal stand-in for the browser WebSocket the real KataGoClient
// constructs. `readyState` starts OPEN so `sendRaw`'s guard passes
// without an async handshake (sibling shape to the analysis-service
// integration tests' MockWebSocket).
class MockWebSocket {
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static last: MockWebSocket | null = null;

  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number; reason: string }) => void) | null = null;
  onerror: ((err: unknown) => void) | null = null;

  readonly sent: Record<string, unknown>[] = [];

  constructor(public url: string) {
    MockWebSocket.last = this;
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000, reason: 'mock-close' });
  }

  /** Deliver a raw response object to the id-keyed subscriber. */
  inject(packet: Record<string, unknown>): void {
    this.onmessage?.({ data: JSON.stringify(packet) });
  }
}

let client: KataGoClient;
let errors: string[];

beforeEach(() => {
  vi.stubGlobal('WebSocket', MockWebSocket);
  MockWebSocket.last = null;
  errors = [];
  client = new KataGoClient('ws://mock');
  client.connect('ws://mock', {
    onDisconnect: () => {},
    onError: (msg) => errors.push(msg),
  });
});

afterEach(() => {
  client.disconnect();
  vi.unstubAllGlobals();
});

describe('KataGoClient.sendCommand one-shot resolution (typed subscribe)', () => {
  it('resolves on a matching KataActionResponse', async () => {
    const ws = MockWebSocket.last!;
    const promise = client.sendCommand({ id: 'v-1', action: 'query_version' });

    // The query reached the wire under its id.
    expect(ws.sent.find(q => q.id === 'v-1' && q.action === 'query_version')).toBeDefined();

    ws.inject({ id: 'v-1', action: 'query_version', version: '1.0.27' });

    const res: KataGoResponse = await promise;
    expect('action' in res && res.action).toBe('query_version');
  });

  it('resolves on a KataErrorResponse routed onto the action id (the fall-through constraint)', async () => {
    const ws = MockWebSocket.last!;
    const promise = client.sendCommand({ id: 'cc-1', action: 'clear_cache' });

    // An error packet on the action query's id must still resolve the
    // one-shot promise — `handleIncomingMessage` surfaces it globally
    // AND falls through to this id's ephemeral subscriber.
    ws.inject({ id: 'cc-1', error: 'cache backend unavailable' });

    const res: KataGoResponse = await promise;
    expect('error' in res && res.error).toBe('cache backend unavailable');

    // The error also reached the connection-global onError surface.
    expect(errors).toContain('cache backend unavailable');
  });

  it('tears down the one-shot subscription after resolving (a second packet does not re-resolve)', async () => {
    const ws = MockWebSocket.last!;
    const promise = client.sendCommand({ id: 'qm-1', action: 'query_models' });

    ws.inject({ id: 'qm-1', action: 'query_models', models: [] });
    const first: KataGoResponse = await promise;
    expect('action' in first && first.action).toBe('query_models');

    // A second packet on the same id has no live subscriber to route to
    // (sendCommand's callback unsubscribed itself on first resolve), so
    // it does not throw and the global onError stays unfired for a
    // non-error packet. We assert no error surfaced from the stray packet.
    ws.inject({ id: 'qm-1', action: 'query_models', models: [] });
    expect(errors).toHaveLength(0);
  });
});
