/**
 * tests/unit/lib/engine-uri-probe.test.ts
 *
 * Tier-1 tests for `src/lib/engine-uri-probe.ts` — the bounded
 * reachability probe behind the wizard's "Test connection" affordance
 * (commissioner ledger rows 1365/1366). Installs a fake `WebSocket`
 * global so the three branches (open, error, timeout) are driven
 * directly, with no real network I/O and no DOM.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { probeEngineUri } from '../../../src/lib/engine-uri-probe';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static throwOnConstruct = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    if (FakeWebSocket.throwOnConstruct) {
      throw new DOMException('malformed URL', 'SyntaxError');
    }
    FakeWebSocket.instances.push(this);
  }
  close(): void {
    this.closed = true;
  }
}

const realWebSocket = globalThis.WebSocket;

beforeEach(() => {
  FakeWebSocket.instances = [];
  FakeWebSocket.throwOnConstruct = false;
  // @ts-expect-error — test double, not a spec-complete WebSocket.
  globalThis.WebSocket = FakeWebSocket;
});

afterEach(() => {
  globalThis.WebSocket = realWebSocket;
  vi.useRealTimers();
});

describe('probeEngineUri', () => {
  it('resolves ok:true and closes the socket when it opens', async () => {
    const resultPromise = probeEngineUri('ws://reachable.example:1242');
    const [socket] = FakeWebSocket.instances;
    expect(socket.url).toBe('ws://reachable.example:1242');

    socket.onopen?.();
    const result = await resultPromise;

    expect(result).toEqual({ ok: true });
    expect(socket.closed).toBe(true);
  });

  it('resolves ok:false reason:error and closes the socket on a WS error event', async () => {
    const resultPromise = probeEngineUri('ws://unreachable.example:1242');
    const [socket] = FakeWebSocket.instances;

    socket.onerror?.();
    const result = await resultPromise;

    expect(result).toEqual({ ok: false, reason: 'error' });
    expect(socket.closed).toBe(true);
  });

  it('resolves ok:false reason:error when constructing the WebSocket throws synchronously', async () => {
    FakeWebSocket.throwOnConstruct = true;
    const result = await probeEngineUri('not-actually-parseable');
    expect(result).toEqual({ ok: false, reason: 'error' });
  });

  it('resolves ok:false reason:timeout when neither open nor error fires within the bound', async () => {
    vi.useFakeTimers();
    const resultPromise = probeEngineUri('ws://silent.example:1242', 4000);
    const [socket] = FakeWebSocket.instances;

    await vi.advanceTimersByTimeAsync(4000);
    const result = await resultPromise;

    expect(result).toEqual({ ok: false, reason: 'timeout' });
    expect(socket.closed).toBe(true);
  });

  it('only settles once — a late open after a timeout is a no-op', async () => {
    vi.useFakeTimers();
    const resultPromise = probeEngineUri('ws://late.example:1242', 100);
    const [socket] = FakeWebSocket.instances;

    await vi.advanceTimersByTimeAsync(100);
    const result = await resultPromise;
    expect(result).toEqual({ ok: false, reason: 'timeout' });

    // Firing onopen after settlement must not throw or change anything
    // observable — the promise already resolved.
    expect(() => socket.onopen?.()).not.toThrow();
  });
});
