/**
 * src/composables/chrome/useLytFitAssertion.ts
 *
 * Space-owner cure, dispatch L2b (`.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §3 step 2's own "Gate" paragraph, "the review's
 * own 'mount-time Fit assertion'"; ledger rows 2447/2450/2460). Every leaf
 * whose compiled `content` is `'bounded'`/`'designed'` (a Fit-disciplined
 * leaf — `OverflowDiscipline`'s `{ kind: 'fit' }` member,
 * `src/state/feasible-layout.ts` §1.1) declares that it will render its
 * own content WITHOUT scrolling; this module is the FIRST point a real
 * check exists for whether that declaration actually holds
 * (`scrollHeight<=clientHeight && scrollWidth<=clientWidth`), per the
 * spec's own framing: "Lands here because it is the FIRST point a real
 * `maxUseful` exists to assert against."
 *
 * **Scope, precisely (no behavior change beyond the assertion).** Per the
 * dispatch's own instruction: this module ONLY asserts and reports — no
 * clamp, no layout write, no CSS change. A violation pushes a structured,
 * user-visible system message (`services/system-message-sink.ts`, the
 * SAME channel `services/analysis-service.ts` uses for every other
 * loud-refusal-grade user-facing notice) naming the offending leaf and the
 * overflow amount(s); it never mutates the DOM, the compiled program, or
 * any store field. Report-only, matching step 1/2's own additive-only
 * migration discipline (spec §3 step 1's "changes nothing about what the
 * app allows").
 *
 * **Mechanism.** One shared `ResizeObserver` per `LytNode.vue` instance
 * (not one per leaf cell — this component can host several Fit-class
 * leaf cells among its own direct children, and a single observer taking
 * multiple `.observe()` targets is the resource-conservative form; see
 * `frontend/CLAUDE.md`'s imperative-escape discipline). `observe(region,
 * el)` is called once per leaf-cell template ref (`LytNode.vue`'s own
 * function-ref callback on its `.lyt-leaf-cell` div) — it registers the
 * element AND arms the settle-debounced check below (the "on mount" half
 * of the dispatch's "assert on mount and on geometry transition"). Every
 * SUBSEQUENT observer callback (a genuine geometry transition — the
 * cell's own box resizing because the screen class or a sovereign drag
 * changed) re-arms the SAME settle-debounced check on the SAME element,
 * which is the "on geometry transition" half: a leaf cell resizing IS a
 * geometry transition by construction (this composable doesn't need its
 * own separate screen-class watcher to catch it).
 *
 * **Settle-aware assertion (row 2591, ADR-0000 closure).** The naive
 * "check on every callback" shape above pushed false-positive violations
 * against TRANSIENT mid-settling geometry: the `settingsSubstrip` leaf's
 * cell was measured at two deterministic transient widths (230px, then
 * 280px) while its surrounding `<LytNode>` split's own CSS-grid tracks
 * were still settling, and both transient widths genuinely overflowed a
 * reservation that was never short at the SETTLED width — see
 * `.claude/dispatch-reports/settingssubstrip-overflow-build.md`'s
 * "Diagnosis: measured live, not assumed" for the measured facts. Every
 * Fit-disciplined leaf is equally exposed to this class (quantified over
 * the mechanism, not the one leaf that happened to detonate first): ANY
 * `<LytNode>` split whose grid tracks pass through an intermediate width
 * before settling can transiently overflow a leaf that is comfortably
 * within its reservation once settled.
 *
 * The fix reuses this codebase's own established settle idiom rather
 * than minting a third one — `useDeferredContainerBreakpoint.ts` defers
 * a discrete commit until a settling SIGNAL (`isAnyPanelResizing`) goes
 * quiet; `useElementWidth.ts`'s settle-remeasure burst re-reads geometry
 * across a short `requestAnimationFrame` chain after mount because NO
 * such signal exists for its class of caller. This module is in the
 * second shape: nothing in `LytNode.vue`'s own reactivity currently
 * exposes "the surrounding grid is still settling its tracks" as a
 * signal (that mechanism itself is explicitly out of scope — see the
 * settingsSubstrip report's "Diagnosis" section), so a genuine reading of
 * a `<LytNode>` split's own settling state isn't available to gate on.
 * Instead: EVERY `checkFit`-worthy event (mount-time registration or a
 * later `ResizeObserver` callback) (re)arms a short quiet-period
 * `requestAnimationFrame` debounce (`SETTLE_QUIET_FRAMES`, mirroring
 * `useElementWidth.ts`'s `SETTLE_REMEASURE_FRAMES` naming) instead of
 * checking immediately. A LATER event for the same region cancels the
 * pending debounce and re-arms it — so a rapid burst of transient
 * deliveries (the 230px/280px passes) never gets far enough to fire; only
 * once no further delivery arrives for `SETTLE_QUIET_FRAMES` consecutive
 * frames does the debounce re-measure the tracked element's CURRENT
 * geometry and report if it is STILL overflowing at that point. A
 * transient violation that resolves before the quiet period elapses is
 * never reported — self-healing within the settle window is not a
 * defect. A GENUINE settled overflow is unaffected in substance: it is
 * still detected and still reported, merely a few frames later than
 * before, and the reported deficit is still the real measured one (the
 * debounce delays WHEN the check runs, never widens or narrows what it
 * measures).
 *
 * License: Public Domain (The Unlicense)
 */
import { pushSystemMessage } from '../../services/system-message-sink';

export interface LytFitAssertionApi {
  /**
   * Register (or re-register) `el` as the Fit-checked element for
   * `region` (the leaf/blackbox's own `widget` id — the same identity
   * `StarvationDiagnostic.region`/`Measured.region` use, spec §1.1/§1.2,
   * so a violation message names the SAME region a `FeasibleLayout`
   * diagnostic would). `el === null` unregisters `region` (the leaf
   * unmounted — a toggled-off/demoted region, `LytNode.vue`'s own
   * "Runtime presence overrides" — and is never checked again until
   * re-registered with a real element).
   */
  observe(region: string, el: HTMLElement | null): void;
  /** Releases the shared `ResizeObserver` and any pending settle checks —
   *  callers wire this to `onUnmounted` (resource-ownership-at-mutation-
   *  sites discipline, `frontend/CLAUDE.md`). */
  stop(): void;
}

/**
 * `text.type` reuses `SystemMessage['type']` transitively via
 * `pushSystemMessage`'s own signature — `'error'` for a genuine Fit
 * violation, matching the severity every other loud-refusal-grade push
 * in `analysis-service.ts` uses for a defect the user cannot self-correct
 * by retrying.
 */
function reportIfOverflowing(region: string, el: HTMLElement): void {
  const overflowWidthPx = el.scrollWidth - el.clientWidth;
  const overflowHeightPx = el.scrollHeight - el.clientHeight;
  if (overflowWidthPx <= 0 && overflowHeightPx <= 0) return;
  const parts: string[] = [];
  if (overflowWidthPx > 0) parts.push(`${overflowWidthPx}px too narrow (width)`);
  if (overflowHeightPx > 0) parts.push(`${overflowHeightPx}px too short (height)`);
  pushSystemMessage(
    'error',
    `Layout defect: "${region}" is declared Fit (no scroll) but its content overflows its own ` +
      `cell — ${parts.join(', ')}. This is a compiled-program or measurement bug, not something ` +
      'you can fix by resizing the window.',
  );
}

// Settle-debounce quiet period (see file header, "Settle-aware
// assertion"). 2 consecutive quiet `requestAnimationFrame` frames after
// the LAST arming event: short enough that a genuine violation still
// surfaces promptly (well under a human-perceptible delay), long enough
// that the `settingsSubstrip` investigation's own measured transient
// passes — each a single settling `ResizeObserver` delivery, naturally
// frame-aligned per the ResizeObserver spec's own delivery timing — are
// superseded by the NEXT delivery's re-arm before the debounce ever
// fires against them. Not a design-point literal cited elsewhere (unlike
// `useElementWidth.ts`'s `SETTLE_REMEASURE_FRAMES`, which spans a whole
// settle burst rather than gating on quiescence), so no external doc
// reference is warranted.
const SETTLE_QUIET_FRAMES = 2;

export function useLytFitAssertion(): LytFitAssertionApi {
  const tracked = new Map<string, HTMLElement>();
  const pendingSettle = new Map<string, number>(); // region -> rAF id of its debounce chain
  let observer: ResizeObserver | null = null;

  function cancelPendingSettle(region: string): void {
    const rafId = pendingSettle.get(region);
    if (rafId !== undefined) {
      if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(rafId);
      pendingSettle.delete(region);
    }
  }

  // Re-measures `region`'s CURRENTLY tracked element (not a captured
  // snapshot — `tracked.get` reads the live registration, so a region
  // unregistered while its debounce was in flight is correctly skipped
  // rather than reporting against a stale/detached element).
  function reportIfStillTracked(region: string): void {
    pendingSettle.delete(region);
    const el = tracked.get(region);
    if (el === undefined) return;
    reportIfOverflowing(region, el);
  }

  // Arms (or re-arms, cancelling any prior chain for `region`) the
  // settle-debounce described in the file header. `typeof
  // requestAnimationFrame === 'undefined'` guard mirrors
  // `useElementWidth.ts`'s own jsdom-safety posture: an environment with
  // no global `requestAnimationFrame` (a jsdom test without its own
  // stub) falls back to an immediate check, so "on mount" still holds
  // synchronously there — the same posture this module's ResizeObserver
  // guard already took before this change.
  function scheduleSettleCheck(region: string): void {
    cancelPendingSettle(region);
    if (typeof requestAnimationFrame === 'undefined') {
      reportIfStillTracked(region);
      return;
    }
    let framesLeft = SETTLE_QUIET_FRAMES;
    const tick = (): void => {
      framesLeft -= 1;
      if (framesLeft > 0) {
        pendingSettle.set(region, requestAnimationFrame(tick));
      } else {
        reportIfStillTracked(region);
      }
    };
    pendingSettle.set(region, requestAnimationFrame(tick));
  }

  // `typeof ResizeObserver !== 'undefined'` guard: the SAME idiom
  // `useResizablePanel.ts`'s own `rowObserver`/`wrapperObserver` use — an
  // environment with no global `ResizeObserver` (a jsdom test that hasn't
  // stubbed one) still gets the settle-debounced mount-time check below
  // (the "on mount" half of this composable's own contract); it simply
  // never re-checks on a LATER geometry transition, which no current
  // test exercises without its own stub already in place.
  function ensureObserver(): ResizeObserver | null {
    if (observer === null && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          for (const [region, el] of tracked) {
            if (el === entry.target) {
              scheduleSettleCheck(region);
              break;
            }
          }
        }
      });
    }
    return observer;
  }

  function observe(region: string, el: HTMLElement | null): void {
    const prev = tracked.get(region);
    if (prev !== undefined && prev !== el) {
      observer?.unobserve(prev);
      tracked.delete(region);
    }
    cancelPendingSettle(region); // a fresh registration/transition supersedes any in-flight debounce
    if (el === null) return;
    tracked.set(region, el);
    ensureObserver()?.observe(el);
    scheduleSettleCheck(region); // settle-debounced mount-time check — see file header
  }

  function stop(): void {
    observer?.disconnect();
    observer = null;
    tracked.clear();
    for (const region of Array.from(pendingSettle.keys())) cancelPendingSettle(region);
  }

  return { observe, stop };
}
