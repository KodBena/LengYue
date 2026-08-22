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

  // Show-once dedup (commissioner's second complaint — the "geometry
  // changed from default" diagnostic spamming the system-diagnostics
  // panel). Collapses IDENTICAL CONSECUTIVE pushes (same type/text/
  // remediation/nextAction as the current newest entry) into one row with
  // a bumped `count`, while a genuinely new occurrence — different
  // content, or one that arrives after a different message intervened —
  // always starts a fresh row. A prior attempt at this broke legitimate
  // re-notification tests (e.g. a producer's own latch resetting and
  // re-pushing identical wording after an unrelated intervening event);
  // the key here only ever compares against the immediate head, so it
  // does not reach back across the log.
  describe('show-once dedup', () => {
    it('the same message pushed 5x consecutively renders once, with count 5', async () => {
      const sink = await import('../../../src/services/system-message-sink');
      const store = await import('../../../src/store');

      store.clearSystemMessages();
      for (let i = 0; i < 5; i++) sink.pushSystemMessage('warning', 'geometry changed from default');

      expect(store.store.engine.messages).toHaveLength(1);
      expect(store.store.engine.messages[0]).toMatchObject({
        text: 'geometry changed from default',
        count: 5,
      });
    });

    it('interleaved different messages all render, each starting its own count at 1', async () => {
      const sink = await import('../../../src/services/system-message-sink');
      const store = await import('../../../src/store');

      store.clearSystemMessages();
      sink.pushSystemMessage('warning', 'a');
      sink.pushSystemMessage('warning', 'b');
      sink.pushSystemMessage('warning', 'a'); // same text as the FIRST push, but a different message (b) intervened

      expect(store.store.engine.messages).toHaveLength(3);
      expect(store.store.engine.messages.map((m) => m.text)).toEqual(['a', 'b', 'a']);
      expect(store.store.engine.messages.every((m) => (m.count ?? 1) === 1)).toBe(true);
    });

    it('a different type with the same text does not collapse', async () => {
      const sink = await import('../../../src/services/system-message-sink');
      const store = await import('../../../src/store');

      store.clearSystemMessages();
      sink.pushSystemMessage('info', 'same text');
      sink.pushSystemMessage('warning', 'same text');

      expect(store.store.engine.messages).toHaveLength(2);
    });

    it('differing remediation/nextAction details do not collapse', async () => {
      const sink = await import('../../../src/services/system-message-sink');
      const store = await import('../../../src/store');

      store.clearSystemMessages();
      sink.pushSystemMessage('warning', 'same text', { remediation: 'do X' });
      sink.pushSystemMessage('warning', 'same text', { remediation: 'do Y' });

      expect(store.store.engine.messages).toHaveLength(2);
    });

    it('a repeat that arrives after the head was dismissed starts a fresh row, not a collapse', async () => {
      const sink = await import('../../../src/services/system-message-sink');
      const store = await import('../../../src/store');

      store.clearSystemMessages();
      sink.pushSystemMessage('warning', 'repeat me');
      const firstId = store.store.engine.messages[0].id;
      store.dismissSystemMessage(firstId);
      sink.pushSystemMessage('warning', 'repeat me');

      expect(store.store.engine.messages).toHaveLength(1);
      expect(store.store.engine.messages[0].count ?? 1).toBe(1);
    });
  });

  // Row 2562 (LytNode recursive-update crash): the sink is a producer-facing
  // PORT — it can be called from anywhere, including synchronously from
  // inside a caller's own active reactive effect (the worked case:
  // `useLytFitAssertion.ts`'s mount-time `checkFit`, invoked from a
  // `<LytNode>` template `:ref` callback while that component's own render
  // effect is Vue's `activeEffect`). Before the fix, `push()`'s dedup read
  // of `store.engine.messages[0]` got silently TRACKED as a dependency of
  // whatever effect was active at the call site, and the very next line's
  // write (`.unshift` / `head.count++`) RE-TRIGGERED that same effect —
  // "a reactive effect that is mutating its own dependencies and thus
  // recursively triggering itself" (Vue's own diagnostic), which is
  // exactly the `<LytNode>` crash.
  //
  // `App.vue`'s full render tree can't be exercised in jsdom for this (no
  // real `scrollWidth`/`clientWidth` overflow ever occurs there), but the
  // actual defect is a Vue reactivity-TRACKING-mechanics bug, not a layout
  // bug — so it is pinned here at the mechanism's own level, with the one
  // detail that makes a component's render effect special: Vue explicitly
  // marks a component's own update job `ALLOW_RECURSE` (`toggleRecurse`,
  // `@vue/runtime-core`) precisely so it CAN be re-triggered by its own
  // write — the same flag a plain `watchEffect`/`watch` does NOT carry (a
  // plain effect's self-trigger is silently swallowed by Vue's own
  // recursion guard, which is why a `watchEffect`-based version of this
  // test cannot reproduce the bug — verified while drafting this pin). A
  // raw `ReactiveEffect` with `ALLOW_RECURSE` set and a scheduler that
  // re-runs it, exactly mirroring a component's own
  // `effect.scheduler = () => queueJob(job)` wiring, is the minimal vehicle
  // that actually carries the same reactive shape as `<LytNode>`'s render
  // effect. A hard cap stands in for Vue's own `RECURSION_LIMIT` breaker
  // so a regression here fails as a false-negative-proof count (10, the
  // cap) rather than hanging the suite.
  describe('untracked read/write (row 2562 — a caller must never become a dependency of its own push)', () => {
    it('pushSystemMessage from inside a recursion-permitting effect (a render-effect stand-in) does not retrigger that same effect', async () => {
      const { ReactiveEffect, EffectFlags } = await import('@vue/reactivity');
      const sink = await import('../../../src/services/system-message-sink');
      const store = await import('../../../src/store');

      store.clearSystemMessages();
      let runs = 0;
      const CAP = 10; // stand-in for Vue's own RECURSION_LIMIT (100) — small enough to fail fast, large enough to distinguish "looped" from "ran once".
      const renderEffectStandIn = new ReactiveEffect(() => {
        runs++;
        // A genuinely NEW message every run (not a dedup hit) is the
        // stronger form of this guard: even a push that unshifts a
        // fresh row (not just the in-place `count` bump) must not be
        // attributable back to this effect's own dependency set.
        sink.pushSystemMessage('error', `overflow check run ${runs}`);
      });
      renderEffectStandIn.flags |= EffectFlags.ALLOW_RECURSE;
      renderEffectStandIn.scheduler = () => {
        if (runs < CAP) renderEffectStandIn.run();
      };
      renderEffectStandIn.run();

      // Absent the fix, the push's untracked read of
      // `store.engine.messages[0]` gets recorded as this effect's OWN
      // dependency, and the immediately following `.unshift` re-triggers
      // it via the scheduler above — synchronously, repeatedly, hitting
      // the cap. `runs` staying at 1 is the pin.
      expect(runs).toBe(1);
      expect(store.store.engine.messages).toHaveLength(1);
    });

    it('a genuine subscriber (reading messages in its own effect) still sees a push', async () => {
      const { watchEffect, nextTick } = await import('vue');
      const sink = await import('../../../src/services/system-message-sink');
      const store = await import('../../../src/store');

      store.clearSystemMessages();
      let observedHeadText: string | undefined;
      let observations = 0;
      const stop = watchEffect(() => {
        observations++;
        observedHeadText = store.store.engine.messages[0]?.text;
      });
      await nextTick();
      expect(observations).toBe(1);
      expect(observedHeadText).toBeUndefined();

      // Pushed from OUTSIDE the subscriber's own effect — the pauseTracking
      // guard only shields the SINK's internal bookkeeping read from being
      // attributed to an unrelated active effect; it must never suppress
      // the WRITE's normal notification to an effect that legitimately
      // subscribed by reading `engine.messages` in its own body.
      sink.pushSystemMessage('info', 'a real notice');
      await nextTick();

      expect(observations).toBe(2);
      expect(observedHeadText).toBe('a real notice');
      stop();
    });
  });
});
