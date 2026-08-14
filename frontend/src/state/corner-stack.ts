/**
 * src/state/corner-stack.ts
 *
 * Space-owner cure, dispatch L5 (`.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §1.4, §3 step 5, ledger rows 2447/2484/2499).
 * `CornerStack` applies `Measured<Region>`/`Px` (`feasible-layout.ts`,
 * dispatch L1) to fixed-position corner surfaces — per the spec's own
 * diagnosis (§Class 4's cure: "fixed overlays become regions with a
 * measure and an allotment like everything else"). The NEW piece beyond
 * `Measured` itself is the stacking order and anchor: a corner surface's
 * axis is always `'v'` (surfaces stack vertically in one corner), and
 * `CornerStack.layout()` derives every entry's own offset from its
 * neighbors' CURRENT live height — the direct fix for `App.vue`'s own
 * `#lyt-overlay-stack`/`#lyt-corner-chrome` split, two independent
 * `position: fixed` containers with a hand-guessed `+40px` clearance
 * between them (that file's own disclosed comment: "a conservative
 * estimate... rather than a swept number").
 *
 * License: Public Domain (The Unlicense)
 */
import { px, type Px } from './feasible-layout';
import type { Measured } from './feasible-layout';

export type CornerAnchor = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface CornerStackEntry<Region extends string> {
  readonly region: Region;
  readonly anchor: CornerAnchor;
  /** Stacking order within one anchor, ascending = closer to the screen
   *  edge. Two entries at the same anchor MUST have distinct order
   *  values — a tie is a construction refusal. */
  readonly order: number;
  /** Axis is always `'v'` for a corner entry — checked at construction,
   *  not merely documented (see `CornerStack.build`'s own guard). */
  readonly measured: Measured<Region>;
  /** Whether this entry claims stacking space even while visually
   *  collapsed to an icon/pill (`reserves: true`, e.g. the corner
   *  trigger row) or contributes zero height until opened
   *  (`reserves: false`, e.g. the system log panel). Informational for
   *  a consumer's own rendering decision — `layout()` below already
   *  reads each entry's LIVE `measured.preferred` unconditionally
   *  (a `reserves: false` entry not currently rendered supplies `0` as
   *  its own `measured.preferred`, the caller's responsibility per
   *  this field's own doc, not a special case `layout()` needs to know
   *  about internally). */
  readonly reserves: boolean;
}

/**
 * One `CornerStack` per anchor, built once from every registered entry —
 * replaces `#lyt-corner-chrome` + `#lyt-overlay-stack` as two independent
 * `position: fixed` divs with one owner that lays every entry out in a
 * single flow.
 */
export class CornerStack<Region extends string> {
  // Parameter-property shorthand (`private constructor(private readonly
  // x: ...)`) is disallowed under this project's `erasableSyntaxOnly`
  // TS config — see `feasible-layout.ts`'s own `FeasibleLayout` class
  // for the identical disclosure; the field is declared explicitly and
  // assigned in the constructor body instead.
  private readonly ordered: readonly CornerStackEntry<Region>[];

  private constructor(ordered: readonly CornerStackEntry<Region>[]) {
    this.ordered = ordered;
  }

  /** Refuses (ADR-0002) a stacking-order collision within one anchor —
   *  the review's own required cure: two corner entries whose rendered
   *  boxes overlap in the stacking direction must be unrepresentable.
   *  Also refuses an entry whose own `measured.axis` isn't `'v'` — a
   *  corner surface stacks vertically by definition (this module's own
   *  header); an `'h'`-axis `Measured` entry threaded in here is a
   *  caller wiring bug, not a shape this stack can lay out. */
  static build<R extends string>(entries: readonly CornerStackEntry<R>[]): CornerStack<R> {
    const byAnchor = new Map<CornerAnchor, Map<number, R>>();
    for (const e of entries) {
      if (e.measured.axis !== 'v') {
        throw new Error(
          `CornerStack.build: ${e.region}'s own Measured entry has axis ${JSON.stringify(e.measured.axis)}, ` +
            'not "v" — a corner-stack entry stacks vertically by construction (ADR-0002).',
        );
      }
      const seen = byAnchor.get(e.anchor) ?? new Map<number, R>();
      const clash = seen.get(e.order);
      if (clash !== undefined) {
        throw new Error(
          `CornerStack.build: anchor ${e.anchor} has two entries at order ${e.order} ` +
            `(${clash} and ${e.region}) — stacking order must be a total order per anchor.`,
        );
      }
      seen.set(e.order, e.region);
      byAnchor.set(e.anchor, seen);
    }
    return new CornerStack([...entries].sort((a, b) => a.order - b.order));
  }

  /** Every entry's own top offset from its anchor edge — the running sum
   *  of every LOWER-order entry's own CURRENT rendered height (its live
   *  `measured.preferred`, which for an expandable entry like the
   *  system log IS its expanded height while expanded) plus one fixed
   *  gap. This is the one computation `#lyt-overlay-stack`'s
   *  hand-guessed `+40px` was standing in for. */
  layout(gapPx: Px): ReadonlyMap<Region, Px> {
    const offsets = new Map<Region, Px>();
    let running = px(0);
    for (const e of this.ordered) {
      offsets.set(e.region, running);
      running = px(running + e.measured.preferred + gapPx);
    }
    return offsets;
  }

  /** The total live height every entry in this stack occupies (every
   *  entry's own `measured.preferred` plus one gap each) — the
   *  "clearance" a sibling surface anchored at the SAME corner but
   *  outside this stack's own registration (a popover opening
   *  `bottom: 100%` from a trigger INSIDE this stack, e.g.) needs to add
   *  to its own offset so it clears whatever is stacked above the
   *  trigger's own row. Zero when this stack has no entries. */
  totalHeight(gapPx: Px): Px {
    let total = 0;
    for (const e of this.ordered) total += e.measured.preferred + gapPx;
    return px(total);
  }
}
