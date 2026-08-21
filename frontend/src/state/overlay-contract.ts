/**
 * src/state/overlay-contract.ts
 *
 * Space-owner cure, dispatch L5 (`.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §1.5, §3 step 5, ledger rows 2447/2484/2499).
 * The overlay primitive: ONE dismissal contract every modal and popover
 * construction site in this SPA is meant to build through, replacing the
 * hand-rolled `Teleport` + `v-if`/`v-show` + keydown-listener combinations
 * the final Opus review found independently re-implemented (and
 * independently DIVERGING — the review's own §Class 8, "the login modal's
 * markup contract" and "the learn-path modal's missing Escape") at every
 * one of them.
 *
 * **What this file does NOT do.** It does not render anything, does not
 * own any DOM listener, and does not decide WHEN an overlay opens or
 * closes. It is a construction-time REFUSAL — the same shape
 * `feasible-layout.ts`'s `measured()`/`FeasibleLayout.validate` already
 * establish for this dispatch chain: a well-formed `OverlayContract` is
 * mechanically checkable (every channel `false` is refused; a `kind`/
 * `focusTrap` mismatch is refused), but WHETHER a given call site's
 * `dismissal` flags are the RIGHT ones for its surface is a review-caught
 * judgment, not something this constructor can itself verify — exactly
 * the same "well-formedness vs. provenance" split `feasible-layout.ts`'s
 * own header names for `Px`/`maxUseful`.
 *
 * **Verbatim from the spec, §1.5** — the type shapes and the
 * `overlayContract()` refusals below are the spec's own worked sketch,
 * unmodified (this dispatch's own scope is to LAND the type and migrate
 * every construction site to it, not to redesign it).
 *
 * License: Public Domain (The Unlicense)
 */

export type OverlayKind = 'modal' | 'popover';

/**
 * Every dismissal channel this ONE primitive owns — a construction site
 * cannot select a SUBSET (e.g. "everything but Escape"); the fields are
 * all required, so an overlay author who wants a DIFFERENT dismissal
 * policy is naming an exception explicitly (a `false`), never silently
 * omitting a channel the way the review found (the learn-path modal: no
 * Escape; the portrait control-panel popover: no Escape, contradicting
 * FEATURES.md's own promise).
 */
export interface OverlayDismissal {
  readonly escape: boolean;
  readonly outsideClick: boolean;
  readonly explicitCloseControl: boolean;
}

export interface OverlayContract {
  readonly kind: OverlayKind;
  readonly open: boolean;
  readonly dismissal: OverlayDismissal;
  /** modal: `true` by construction; popover: `false`. */
  readonly focusTrap: boolean;
  /** The element focus returns to on close — required, never `null`,
   *  per ADR-0019 C17's restore-focus half of keyboard/focus integrity.
   *  A construction site with no natural "opener" element (e.g. a modal
   *  mounted only while open via a parent `v-if`, no local trigger of
   *  its own) still supplies a function — `() => document.body` or an
   *  equivalent stable fallback — never `null` itself; `null` is this
   *  field's OWN return type for "nothing to restore to at this precise
   *  moment" (the opener already left the DOM), not a licence to omit
   *  the function. */
  readonly restoreFocusTo: () => HTMLElement | null;
}

/**
 * Sole constructor. Refuses an overlay with NO dismissal channel at all
 * (every channel `false`), and refuses a `modal` with `focusTrap: false`
 * or a `popover` with `focusTrap: true` — the two kinds' contracts are
 * distinct by construction, not by convention.
 *
 * `open` is accepted for the type's own completeness (a caller
 * introspecting a constructed contract can read it back) but is NEVER
 * itself the source of truth for a live UI's open/closed state — that
 * lives in the caller's own reactive `ref`, exactly the same split
 * `FeasibleLayout`'s own `allotments` (a validated snapshot) has from
 * the reactive geometry that produced it. Every composable in this
 * dispatch that constructs an `OverlayContract` does so ONCE, at setup,
 * with `open: false` — the constructed object's job is the refusal, not
 * live state tracking.
 */
export function overlayContract(input: OverlayContract): OverlayContract {
  const { escape, outsideClick, explicitCloseControl } = input.dismissal;
  if (!escape && !outsideClick && !explicitCloseControl) {
    throw new Error(
      'overlayContract(): an overlay with no dismissal channel at all is unrepresentable ' +
        '(ADR-0002) — every construction site must declare at least one of ' +
        'escape/outsideClick/explicitCloseControl true.',
    );
  }
  if (input.kind === 'modal' && !input.focusTrap) {
    throw new Error('overlayContract(): a modal without a focus trap is not a modal — use popover.');
  }
  if (input.kind === 'popover' && input.focusTrap) {
    throw new Error('overlayContract(): a popover with a focus trap is not a popover — use modal.');
  }
  return { ...input, dismissal: { ...input.dismissal } };
}
