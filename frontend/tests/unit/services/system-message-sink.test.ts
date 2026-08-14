/**
 * tests/unit/services/system-message-sink.test.ts
 *
 * Tier-1 tests for the registered system-message sink port
 * (`src/services/system-message-sink.ts`). The port decouples message
 * *producers* (api-client, analysis-service, analysis-ledger, …) from the
 * store that owns the message list — the decoupling that breaks the
 * api-client→store import edge (cycle-check ratchet, ADR-0011).
 *
 * Two contracts:
 *   - Fail-loud (ADR-0002): `pushSystemMessage` throws if no sink is
 *     registered, rather than silently dropping a user-visible message.
 *   - Wiring: once the store loads (it registers the sink at init), a push
 *     lands in `store.engine.messages`.
 *
 * Each case runs against a FRESH module graph (`vi.resetModules()` +
 * dynamic import) so the registration state of one case can't leak into
 * another — the un-registered state is otherwise unobservable once any
 * importer of the store has loaded.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('system-message-sink', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('pushSystemMessage throws before a sink is registered (fail-loud)', async () => {
    // Fresh sink module, store NOT loaded → no sink registered.
    const sink = await import('../../../src/services/system-message-sink');
    expect(() => sink.pushSystemMessage('info', 'no sink yet')).toThrow(
      /before a SystemMessageSink was registered/,
    );
  });

  it('after the store registers, a push lands in store.engine.messages', async () => {
    // Loading the store registers the concrete sink at module init.
    const sink = await import('../../../src/services/system-message-sink');
    const store = await import('../../../src/store');

    store.clearSystemMessages();
    sink.pushSystemMessage('warning', 'hello from the sink');

    expect(store.store.engine.messages).toHaveLength(1);
    expect(store.store.engine.messages[0]).toMatchObject({
      type: 'warning',
      text: 'hello from the sink',
    });
  });

  it("the store's re-export and the sink's push are the same function", async () => {
    const sink = await import('../../../src/services/system-message-sink');
    const store = await import('../../../src/store');
    // The store re-exports the sink's push verbatim, so the ~13
    // component/composable importers that pull it from the store get the
    // identical implementation.
    expect(store.pushSystemMessage).toBe(sink.pushSystemMessage);
  });

  it('an optional third argument (remediation/nextAction) lands on the message unchanged — dispatch L3 repair, ADR-0019 C8', async () => {
    const sink = await import('../../../src/services/system-message-sink');
    const store = await import('../../../src/store');

    store.clearSystemMessages();
    sink.pushSystemMessage('warning', 'a starved region', {
      remediation: 'reduce this region\'s width, or use Default Layout to reset',
      nextAction: 'open-default-layout-control',
    });

    expect(store.store.engine.messages[0]).toMatchObject({
      type: 'warning',
      text: 'a starved region',
      remediation: 'reduce this region\'s width, or use Default Layout to reset',
      nextAction: 'open-default-layout-control',
    });
  });

  it('a push with no third argument carries neither field — additive, byte-identical to every pre-repair call site', async () => {
    const sink = await import('../../../src/services/system-message-sink');
    const store = await import('../../../src/store');

    store.clearSystemMessages();
    sink.pushSystemMessage('info', 'plain message, no details');

    expect(store.store.engine.messages[0].remediation).toBeUndefined();
    expect(store.store.engine.messages[0].nextAction).toBeUndefined();
  });

  it('caps the message list at 50 (preserved behaviour)', async () => {
    const sink = await import('../../../src/services/system-message-sink');
    const store = await import('../../../src/store');

    store.clearSystemMessages();
    for (let i = 0; i < 60; i++) sink.pushSystemMessage('info', `m${i}`);

    expect(store.store.engine.messages).toHaveLength(50);
    // unshift order: newest first.
    expect(store.store.engine.messages[0].text).toBe('m59');
  });
});
