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
 * element AND runs an IMMEDIATE synchronous check (the "on mount" half of
 * the dispatch's "assert on mount and on geometry transition" — a real
 * browser's own `ResizeObserver` also fires once on first `observe()`,
 * but that first callback is async, so the synchronous check here is what
 * makes "on mount" true rather than "on the next animation frame after
 * mount"). Every SUBSEQUENT observer callback (a genuine geometry
 * transition — the cell's own box resizing because the screen class or a
 * sovereign drag changed) re-checks the SAME element, which is the
 * "on geometry transition" half: a leaf cell resizing IS a geometry
 * transition by construction (this composable doesn't need its own
 * separate screen-class watcher to catch it).
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
  /** Releases the shared `ResizeObserver` — callers wire this to
   *  `onUnmounted` (resource-ownership-at-mutation-sites discipline,
   *  `frontend/CLAUDE.md`). */
  stop(): void;
}

/**
 * `text.type` reuses `SystemMessage['type']` transitively via
 * `pushSystemMessage`'s own signature — `'error'` for a genuine Fit
 * violation, matching the severity every other loud-refusal-grade push
 * in `analysis-service.ts` uses for a defect the user cannot self-correct
 * by retrying.
 */
function checkFit(region: string, el: HTMLElement): void {
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

export function useLytFitAssertion(): LytFitAssertionApi {
  const tracked = new Map<string, HTMLElement>();
  let observer: ResizeObserver | null = null;

  // `typeof ResizeObserver !== 'undefined'` guard: the SAME idiom
  // `useResizablePanel.ts`'s own `rowObserver`/`wrapperObserver` use — an
  // environment with no global `ResizeObserver` (a jsdom test that hasn't
  // stubbed one) still gets the synchronous mount-time check below (the
  // "on mount" half of this composable's own contract); it simply never
  // re-checks on a LATER geometry transition, which no current test
  // exercises without its own stub already in place.
  function ensureObserver(): ResizeObserver | null {
    if (observer === null && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          for (const [region, el] of tracked) {
            if (el === entry.target) {
              checkFit(region, el);
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
    if (el === null) return;
    tracked.set(region, el);
    ensureObserver()?.observe(el);
    checkFit(region, el); // synchronous mount-time check — see file header
  }

  function stop(): void {
    observer?.disconnect();
    observer = null;
    tracked.clear();
  }

  return { observe, stop };
}
