/**
 * tests/integration/useContentDemand.test.ts
 *
 * Space-owner cure, dispatch L2b (`.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §3 step 2, ledger rows 2447/2450/2460):
 * `useContentDemand.ts`'s own ResizeObserver-backed measurement — see
 * that file's header for the full mechanism. jsdom's own `ResizeObserver`
 * stub (`tests/integration/render-count/jsdom-stubs.ts`) is a permanent
 * no-op that never invokes its callback (per that file's own doc, reused
 * verbatim by `useDeferredContainerBreakpoint.test.ts`) — useless for
 * driving this composable's own measurement logic, so this suite installs
 * its own controllable fake, matching that existing test's idiom exactly.
 *
 * Tier: composable integration (Vue lifecycle — `onMounted`/`onUnmounted`
 * via `withSetup`, real `ref`/`watch` reactivity — but no real DOM layout;
 * `scrollWidth`/`scrollHeight` are jsdom-inert getters overridden per test
 * via `Object.defineProperty`, the standard jsdom workaround for a
 * layout-dependent read this environment never computes for real).
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, nextTick, ref } from 'vue';
import { withSetup } from './with-setup';
import { useContentDemand } from '../../src/composables/chrome/useContentDemand';

// Controllable ResizeObserver fake — same idiom as
// `useDeferredContainerBreakpoint.test.ts`'s own `FakeResizeObserver`:
// captures the callback so a test can fire synthetic entries on demand,
// and records observe/unobserve/disconnect for the resource-ownership
// assertions.
class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  callback: ResizeObserverCallback;
  observed: Element[] = [];
  unobserved: Element[] = [];
  disconnected = false;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    FakeResizeObserver.instances.push(this);
  }
  observe(el: Element) {
    this.observed.push(el);
  }
  unobserve(el: Element) {
    this.unobserved.push(el);
  }
  disconnect() {
    this.disconnected = true;
  }
  fire(target: Element) {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
}

const originalResizeObserver = globalThis.ResizeObserver;

beforeEach(() => {
  FakeResizeObserver.instances = [];
  (globalThis as any).ResizeObserver = FakeResizeObserver;
});

afterEach(async () => {
  (globalThis as any).ResizeObserver = originalResizeObserver;
  await nextTick();
});

function lastObserver(): FakeResizeObserver {
  const inst = FakeResizeObserver.instances.at(-1);
  if (!inst) throw new Error('no ResizeObserver constructed');
  return inst;
}

function elWithScroll(scrollWidthPx: number, scrollHeightPx: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidthPx, configurable: true });
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeightPx, configurable: true });
  return el;
}

describe('useContentDemand — loud refusals (ADR-0002)', () => {
  it('refuses an unknown axis synchronously, at call time', () => {
    expect(() => useContentDemand(ref(null), 'diagonal' as never)).toThrow(/unknown axis/);
  });

  it('refuses a null element ref still unresolved after its host mounts', () => {
    // NOT `withSetup` here: `withSetup` registers its `onTestFinished`
    // cleanup AFTER `app.mount()` returns — a composable that throws
    // DURING mount (this case, deliberately) means `app.mount()` itself
    // throws, so that cleanup line never runs and the app instance leaks
    // (mounted, never unmounted) across tests. Managed directly instead,
    // so this test's own instance is always torn down regardless of the
    // expected throw (the failure-safe-teardown discipline,
    // `tests/CLAUDE.md`).
    //
    // A SECOND, sharper reason not to let the error propagate out of
    // `app.mount()` itself (an `expect(() => app.mount(...)).toThrow()`
    // shape): a genuinely UNCAUGHT synchronous exception during Vue's own
    // `mounted`-hook flush left `app.mount()` in a state `app.unmount()`
    // then refuses ("Cannot unmount an app that is not mounted") — and,
    // empirically (caught by running this suite's OWN full file, not in
    // isolation — the exact "if your census is missing an entry, suspect
    // the derivation" discipline this dispatch's own spec names,
    // generalized to test isolation), left SOME later, unrelated
    // `createApp`/`mount`/`unmount` cycle's `onUnmounted` silently not
    // firing — a genuine cross-test leak this file's own resource-
    // ownership test caught. Registering a custom `app.config.errorHandler`
    // BEFORE mounting lets Vue's OWN internal try/catch around the hook
    // flush complete normally (`app.mount()` returns without throwing);
    // the handler captures the error and this test rethrows it itself,
    // getting the SAME assertion coverage without corrupting later tests.
    let caught: unknown;
    const app = createApp({
      setup() {
        useContentDemand(ref(null), 'h');
        return () => null;
      },
    });
    app.config.errorHandler = (err) => {
      caught = err;
    };
    app.mount(document.createElement('div'));
    app.unmount();
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toMatch(/still null after mount/);
  });

  it('does NOT refuse when the ref resolves to a real element before mount', () => {
    const el = elWithScroll(42, 0);
    expect(() => withSetup(() => useContentDemand(ref(el), 'h'))).not.toThrow();
  });
});

describe('useContentDemand — measurement', () => {
  it('measures scrollWidth for axis "h" immediately on attach (before any observer callback)', () => {
    const el = elWithScroll(123, 456);
    const demand = withSetup(() => useContentDemand(ref(el), 'h'));
    expect(demand.value).toBe(123);
  });

  it('measures scrollHeight for axis "v" immediately on attach', () => {
    const el = elWithScroll(123, 456);
    const demand = withSetup(() => useContentDemand(ref(el), 'v'));
    expect(demand.value).toBe(456);
  });

  it('re-measures on every ResizeObserver callback for its own observed element', () => {
    const el = elWithScroll(100, 0);
    const demand = withSetup(() => useContentDemand(ref(el), 'h'));
    expect(demand.value).toBe(100);

    Object.defineProperty(el, 'scrollWidth', { value: 260, configurable: true });
    lastObserver().fire(el);
    expect(demand.value).toBe(260);
  });

  it('ignores a callback entry for a DIFFERENT element than the one currently observed', () => {
    const el = elWithScroll(100, 0);
    const otherEl = elWithScroll(999, 0);
    const demand = withSetup(() => useContentDemand(ref(el), 'h'));
    expect(demand.value).toBe(100);

    lastObserver().fire(otherEl);
    expect(demand.value).toBe(100); // unchanged — otherEl is not the tracked target
  });

  it('re-attaches when the caller\'s el ref is reassigned to a different element', async () => {
    const first = elWithScroll(50, 0);
    const second = elWithScroll(90, 0);
    const elRef = ref<HTMLElement | null>(first);
    const demand = withSetup(() => useContentDemand(elRef, 'h'));
    expect(demand.value).toBe(50);

    elRef.value = second;
    await nextTick(); // `watch(el, ...)` (no `flush: 'sync'`) resolves on the microtask queue
    expect(demand.value).toBe(90);
    const observer = lastObserver();
    expect(observer.unobserved).toContain(first);
    expect(observer.observed).toContain(second);
  });
});

describe('useContentDemand — resource ownership (frontend/CLAUDE.md)', () => {
  it('disconnects its ResizeObserver on unmount', () => {
    // withSetup itself unmounts only at test-finish (via onTestFinished),
    // too late for a BEFORE/AFTER assertion within one test body — this
    // one case drives `createApp` directly so the unmount can happen
    // mid-test.
    const el = elWithScroll(10, 10);
    const app = createApp({
      setup() {
        useContentDemand(ref(el), 'h');
        return () => null;
      },
    });
    app.mount(document.createElement('div'));
    expect(lastObserver().disconnected).toBe(false);
    app.unmount();
    expect(lastObserver().disconnected).toBe(true);
  });
});
