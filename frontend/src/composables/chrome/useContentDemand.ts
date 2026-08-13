/**
 * src/composables/chrome/useContentDemand.ts
 *
 * Space-owner cure, dispatch L2b (`.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §2's "Runtime content-dependent demand" row;
 * §3 step 2, ledger rows 2447/2450/2460). The runtime half of the
 * measurement seam the spec names as the ONE home for a leaf whose
 * natural extent depends on current app state (the tree panel's own node
 * count and label widths, chosen as the review's flagship hoarder — see
 * `lyt-final-opus-review.md` §Class 1, "the tree's own content across all
 * of these is a single column of nodes measuring 60 px"). Distinct from
 * the BUILD-time seam (`facts.generated.json`/`facts.residue.json`, read
 * through the compiled LYT program's own `min` — unaffected by this
 * module) — see the spec's §2 table for the two seams side by side.
 *
 * **Mechanism, per the spec's own §2 cell.** A single `ResizeObserver` per
 * measured element (`frontend/CLAUDE.md`'s imperative-escape discipline,
 * "ResizeObserver-cached geometry ... never read synchronously on the hot
 * path") reads the element's own INTRINSIC content extent — `scrollWidth`/
 * `scrollHeight` — on every callback, which fires once the element's own
 * content mutates the DOM (a node inserted/removed under a virtualized
 * tree, a label growing) as well as on a genuine box-size change. This is
 * the "cheaper" technique the spec's own §2 row names ("read `scrollWidth`
 * directly when the element is NOT currently clipping ... decidable from
 * `content: 'unbounded'`") rather than the more expensive max-content-clone
 * probe — `scrollWidth`/`scrollHeight` already report the FULL laid-out
 * content extent regardless of the element's own current `overflow`
 * disposition (a clipped/`overflow:auto` element's `scrollWidth` is its
 * full unclipped content width, not its visible viewport width), so no
 * temporary constraint-removal is needed for this call site.
 *
 * **Staleness bound.** Per the spec's own §2 closure: "the stale window is
 * bounded by one animation frame (the observer's own callback latency),
 * not 'forever, until a probe harness is re-run by hand.'" A content
 * mutation that changes the element's own `scrollWidth`/`scrollHeight`
 * triggers the SAME `ResizeObserver` callback a box-size change would
 * (browsers fire `ResizeObserver` on content-box changes generally, which
 * includes an overflow content growing/shrinking under a fixed clip box
 * IF the observed box itself is size-constrained — see "Caveat" below for
 * the one case this does not cover).
 *
 * **Caveat, disclosed rather than silently assumed.** If the OBSERVED
 * element's own box is itself content-sized (not clipped/constrained by an
 * ancestor), its `scrollWidth`/`scrollHeight` and its `clientWidth`/
 * `clientHeight` grow together and `ResizeObserver`'s own content-box
 * entry DOES fire on every content-driven size change (this is the common
 * case — a virtualized scroll container like `TreeWidget`'s own
 * `outerRef`, whose OWN box is grid-cell-constrained while its CONTENT
 * (the SVG canvas) can exceed it). A pathological element whose box is
 * BOTH unconstrained AND whose content changes without ever changing the
 * box's own reported size (content painted via a canvas 2D context with a
 * fixed `<canvas width>` attribute, e.g.) would not re-fire — not a shape
 * any current caller of this composable exercises (`TreeWidget`'s own
 * `outerRef` is grid-constrained, per `LytNode.vue`'s `.lyt-node`
 * `width:100%; height:100%` — see that file's own W1-repair comment).
 *
 * License: Public Domain (The Unlicense)
 */
import { onMounted, onUnmounted, ref, watch, type Ref } from 'vue';
import { px, type Px } from '../../state/feasible-layout';
import type { LytAxis } from '../../state/lyt-layout-types';

/**
 * `el`: a template ref the caller binds to the measured element — this
 * composable never creates or queries the DOM itself, only observes
 * whatever `el` resolves to (the same "caller supplies the element"
 * shape `useDeferredContainerBreakpoint`'s `observe(el)` and
 * `useElementWidth`'s own ref param use).
 *
 * `axis`: which extent to report — `'h'` reads `scrollWidth`, `'v'` reads
 * `scrollHeight`. Required, not inferred, matching `Measured<Region>`'s
 * own per-axis shape (spec §1.1) — a caller measuring both axes of one
 * element calls this composable twice (two independent `ResizeObserver`s,
 * one per (element, axis) pair is NOT the "one observer per measured
 * element" the header above names — see the two-axis case disclosed at
 * this composable's own call sites if one arises; no current caller needs
 * both axes of the same element).
 *
 * Returns a `Ref<Px | null>` — `null` before the first measurement (no
 * element bound yet) and after `el` resolves to `null` again (e.g. a
 * `v-if`-gated ancestor unmounting the observed element without
 * unmounting THIS composable's own host — not exercised by
 * `TreeWidget`'s own always-mounted `outerRef`, but handled honestly
 * rather than left stale).
 *
 * **Loud refusals (ADR-0002).** An `axis` outside `'h'|'v'` throws at
 * call time — `LytAxis` types this out at compile time, but a caller
 * threading an un-narrowed string through (e.g. from a compiled
 * program's own data) gets the SAME refusal `px()`/`measured()` give
 * their own malformed inputs, not a silent `undefined` behavior. An
 * `el` still `null` once this composable's OWN host component has
 * mounted is refused loudly too: a template ref that resolves to `null`
 * past mount is a caller wiring bug (the ref target was never actually
 * rendered, or the wrong ref was passed) — "not yet ready" is not a
 * legitimate state for a template ref by the time `onMounted` fires,
 * per Vue's own template-ref contract.
 */
export function useContentDemand(el: Ref<HTMLElement | null>, axis: LytAxis): Ref<Px | null> {
  if (axis !== 'h' && axis !== 'v') {
    throw new Error(
      `useContentDemand(): unknown axis ${JSON.stringify(axis)} — only 'h'/'v' are measurable ` +
        '(ADR-0002; LytAxis types this out at compile time, but this call site received an ' +
        'un-narrowed value at runtime).',
    );
  }

  const demand: Ref<Px | null> = ref(null);
  let observer: ResizeObserver | null = null;
  let observedEl: HTMLElement | null = null;

  function measure(target: HTMLElement): void {
    const raw = axis === 'v' ? target.scrollHeight : target.scrollWidth;
    demand.value = px(raw);
  }

  function attach(target: HTMLElement | null): void {
    if (observedEl && observer) observer.unobserve(observedEl);
    observedEl = target;
    if (target) {
      measure(target);
      observer?.observe(target);
    } else {
      demand.value = null;
    }
  }

  // `typeof ResizeObserver !== 'undefined'` guard: the SAME idiom
  // `useResizablePanel.ts`'s own `rowObserver`/`wrapperObserver` use — an
  // environment with no global `ResizeObserver` (a jsdom test that hasn't
  // stubbed one) still gets the synchronous initial measurement below
  // (via `watch(..., { immediate: true })`); it simply never re-measures
  // on a LATER resize, which no current caller needs in that environment.
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // `ResizeObserverEntry.target` is typed `Element` (the DOM lib's own
        // generic contract), but the equality check above already narrows
        // it: only `observedEl` (an `HTMLElement`, this composable's own
        // sole `.observe()` target) is ever compared equal, so the cast
        // reflects a fact this closure already established, not a bypass.
        if (entry.target === observedEl) measure(entry.target as HTMLElement);
      }
    });
  }

  // `immediate: true` measures as soon as `el` first resolves — which may
  // be BEFORE this component's own `onMounted` (a template ref is set
  // during the DOM-patch phase, ahead of the `mounted` lifecycle hook) —
  // so a caller reading `demand.value` in its own `onMounted` sees a real
  // number already, not a one-tick-stale `null`.
  watch(el, (next) => attach(next), { immediate: true });

  onMounted(() => {
    if (el.value === null) {
      throw new Error(
        'useContentDemand(): the measured element ref is still null after mount — a template ref ' +
          'must resolve to a real element by the time its own host mounts (Vue\'s template-ref ' +
          'contract); a null element here is a caller wiring bug (the wrong ref, or a ref bound to ' +
          'an element behind a v-if that never rendered), never a legitimate "not yet ready" state ' +
          '(ADR-0002).',
      );
    }
  });

  // Resource-ownership-at-mutation-sites discipline (frontend/CLAUDE.md):
  // the ResizeObserver this composable registers is released here, the
  // same imperative-escape shape `useDeferredContainerBreakpoint`'s own
  // `stop()` and `useElementWidth`'s own teardown use — this composable
  // owns its lifecycle internally (via `onUnmounted`) rather than
  // returning a separate `stop()` for the caller to remember, since every
  // current call site's lifetime is exactly its host component's own.
  onUnmounted(() => {
    observer?.disconnect();
    observer = null;
    observedEl = null;
  });

  return demand;
}
