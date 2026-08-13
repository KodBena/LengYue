/**
 * src/state/feasible-layout.ts
 *
 * Space-owner cure, dispatch L1 (`.claude/dispatch-reports/
 * lyt-space-owner-spec.md` §3 step 1, ledger rows 2446/2447). The types
 * this module mints — `Measured<Region>`, `FeasibleLayout`,
 * `RegionPresence`, `SovereignOverride`/`resolveSovereignOverrides` — are
 * the ADR-0000 abstraction the final Opus review (`.claude/dispatch-
 * reports/lyt-final-opus-review.md`) names as the single missing type
 * behind Classes 1/2/3/4/8: a region's allotment and its own honest
 * content demand are today related only in a human reviewer's head, not
 * by any type the compiler or the runtime checks. This module is that
 * join, built additive-only per step 1's own risk register (no existing
 * runtime behavior changes — `layout-model.ts`'s clamp functions, the
 * compiled `.gen.ts` programs, and `LytNode.vue`'s realization are all
 * untouched by this file).
 *
 * **Step 1 scope, precisely.** Per the spec's §3 step 1: the types below
 * (§1.1 `Measured`/`measured`/`Px`/`px`/`OverflowDiscipline`, §1.2
 * `RegionAllotment`/`StarvationDiagnostic`/`FeasibleLayout`, §1.3
 * `RegionPresence`, §1.6 `SovereignOverride`/`SovereignOverrideDiagnostic`/
 * `resolveSovereignOverrides`) plus the one adapter,
 * `measuredFromLytProgram`, that reads `Measured` entries out of an
 * already-compiled `LytProgram` (`lyt-layout.gen.ts` /
 * `lyt-layout-portrait.gen.ts`). §1.4 (`CornerStack`) and §1.5
 * (`OverlayContract`) are OUT of this step's scope — the dispatch names
 * only §1.1/§1.2/§1.3/§1.6 as this build's types; they are not
 * implemented here.
 *
 * **Ratified fork defaults (ledger row 2447), threaded through this
 * module's shapes:**
 *
 *   - `SovereignOverride.source` stays the closed union of one member,
 *     `'user-drag'` — the spec's own open question 1 (§5) is NOT resolved
 *     here; widening it to a second source is a future, deliberate act.
 *   - `measuredFromLytProgram` synthesizes `preferred = min` for every
 *     leaf — the spec's own open question 2 (§5): "sufficient for
 *     `FeasibleLayout`'s own correctness," decorative until a concrete
 *     case needs otherwise.
 *   - Board aspect-coupled leaves/composites are OUT of scope for this
 *     adapter: a `LytLeafNode` with `aspect !== null` (`B`, `previewBoard`
 *     in both compiled programs) and any track of kind
 *     `'board-priority-clamp'` / `'board-priority-self-clamp'` (the
 *     board-composite's own coupled-axis track, `lyt-layout-types.ts`'s
 *     own CASE A/CASE B documentation) are excluded from
 *     `measuredFromLytProgram`'s output — this is the spec's own open
 *     question 6 (§5), left unresolved by design: `Measured<Region>` is
 *     single-axis, and a two-dimensional aspect-coupled demand needs a
 *     genuine extension this step does not attempt. Documented here, not
 *     silently dropped.
 *
 * **Untracked Exclusive-tab children, a second disclosed narrowing.** A
 * `LytExclusiveChild.node` (a controlPanel tab's own leaf/blackbox, e.g.
 * `CP-library`/`CP-analysis`) carries no `LytChild.track` of its own —
 * SPEC.md §2's "every child shares the parent's box" — so it has no
 * track-shape to synthesize `min`/`maxUseful` from at this step. This
 * adapter does not invent one; only a further-nested `Split` reached
 * through an Exclusive tab (e.g. the Settings tab's own
 * `settingsSubstrip`/`SP_session` children, both of which DO carry a
 * `track`) yields `Measured` entries. `CP-library`/`CP-cards`/
 * `CP-analysis` (the three tabs whose own node is a bare leaf/blackbox,
 * not a further split) therefore contribute NO `Measured` entry from this
 * adapter — a step-1 scope narrowing, not a silent omission; a future
 * step's `useContentDemand` seam (spec §2's runtime-content-dependent
 * row) is the eventual home for their own demand.
 *
 * License: Public Domain (The Unlicense)
 */
import type { LytAxis, LytChild, LytNodeData, LytProgram, LytTrackShape } from './lyt-layout-types';

// ── §1.1 Measured<Region> ──────────────────────────────────────────────

/** A CSS-pixel measure, always non-negative, always finite. Branded so a
 *  bare `number` (viewport px, aspect ratio, ch) cannot be passed where a
 *  measured content demand is required — ADR-0012 P1: a region's demand
 *  and its allotment are different currencies until this type says
 *  otherwise. */
export type Px = number & { readonly __brand: 'Px' };

/** Sole constructor for `Px`. Refuses loudly (ADR-0002) rather than
 *  silently clamping a negative/non-finite input — a caller that computed
 *  a negative pixel measure has a bug upstream, not a value this
 *  constructor should paper over. */
export function px(n: number): Px {
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`px(): ${n} is not a finite, non-negative pixel measure (ADR-0002).`);
  }
  // Sole minting site for the `Px` brand: the guard above is the entire
  // runtime contract the brand promises (finite, non-negative), so the
  // cast is the brand's own constructor, not a bypass of it.
  return n as Px;
}

/** How a region is permitted to relate to space it does not need or does
 *  not fit in. Required on every construction site that declares one (no
 *  permissive default — the review's own diagnosis, Class 2: "the safe
 *  value is not the default"). Not yet consulted by `measured()`/
 *  `FeasibleLayout` at this step (no construction site here requires it
 *  today); carried as a first-class type per the spec's §1.1 so a future
 *  step's leaf-cell construction can require it without a second type
 *  being invented then. */
export type OverflowDiscipline =
  | { readonly kind: 'fit' }
  | { readonly kind: 'scroll'; readonly axes: readonly LytAxis[] };

/** A region's own honestly-supplied demand, per axis it participates in.
 *  `min`/`preferred`/`maxUseful` are each traceable to a fact — a
 *  compiled LYT relation, a build-time probe, or a runtime measurement —
 *  never a round literal invented at this layer (spec §2's measurement
 *  seam names where each class of fact lives). */
export interface Measured<Region extends string> {
  readonly region: Region;
  readonly axis: LytAxis;
  /** Smallest extent the region can render without violating its own
   *  overflow discipline. */
  readonly min: Px;
  /** The extent the region would choose if space were free — solely
   *  informational for the solver in `FeasibleLayout.validate` (never
   *  consulted for feasibility), load-bearing only for a human-facing
   *  diagnostic and a future fair-share tie-break (spec §5 open question
   *  2). */
  readonly preferred: Px;
  /** The largest extent whose additional px past this point renders no
   *  more of the region's own content. `null` means a genuinely unbounded
   *  natural demand along this axis — distinct from "not yet measured,"
   *  which is a constructor refusal, never a silent `null`. */
  readonly maxUseful: Px | null;
}

/** Sole factory for `Measured<Region>`. Refuses loudly (ADR-0002) rather
 *  than silently reordering or clamping a self-contradictory triple —
 *  `min <= preferred <= (maxUseful ?? +Infinity)` is checked here and
 *  nowhere else. */
export function measured<R extends string>(input: {
  region: R;
  axis: LytAxis;
  min: Px;
  preferred: Px;
  maxUseful: Px | null;
}): Measured<R> {
  if (!(input.min <= input.preferred)) {
    throw new Error(
      `measured(${input.region}, ${input.axis}): min (${input.min}) exceeds ` +
        `preferred (${input.preferred}) — a region's own supplied demand is ` +
        'self-contradictory; this is a measurement-site bug, never clamped here.',
    );
  }
  if (input.maxUseful !== null && !(input.preferred <= input.maxUseful)) {
    throw new Error(
      `measured(${input.region}, ${input.axis}): preferred (${input.preferred}) ` +
        `exceeds maxUseful (${input.maxUseful}) — same class of self-contradiction.`,
    );
  }
  return { ...input };
}

// ── §1.2 FeasibleLayout ────────────────────────────────────────────────

export interface RegionAllotment<Region extends string> {
  readonly region: Region;
  readonly axis: LytAxis;
  readonly px: Px;
}

/** Named per-region diagnostic — the review's own "not enough width right
 *  now" guess, replaced by a computed, specific refusal (ADR-0002;
 *  ADR-0019 C8's required fields). */
export interface StarvationDiagnostic {
  readonly kind: 'starved' | 'hoarding';
  readonly region: string;
  readonly axis: LytAxis;
  /** The starved region's own `min`, or the hoarder's own `maxUseful`. */
  readonly demandPx: Px;
  /** What the assignment actually gave it. */
  readonly grantedPx: Px;
}

/** The Layout authority's sole output type. Never constructed by a
 *  literal object — only `FeasibleLayout.validate()` (or its refusal)
 *  produces one. The refusal (`{ refused: [...] }`) is a legal,
 *  first-class outcome — not thrown — per ADR-0000's "refused loudly,
 *  names which region starved and which hoarded." */
export class FeasibleLayout<Region extends string> {
  public readonly allotments: ReadonlyMap<Region, RegionAllotment<Region>>;
  public readonly screenClassId: LytScreenClassIdInput;
  public readonly viewport: { readonly widthPx: Px; readonly heightPx: Px };

  // Parameter-property shorthand (`private constructor(public readonly
  // x: ...)`) is disallowed under this project's `erasableSyntaxOnly`
  // TS config (type-only erasure, no runtime class-field emission from
  // constructor parameters) — fields are declared above and assigned
  // explicitly here instead.
  private constructor(
    allotments: ReadonlyMap<Region, RegionAllotment<Region>>,
    screenClassId: LytScreenClassIdInput,
    viewport: { readonly widthPx: Px; readonly heightPx: Px },
  ) {
    this.allotments = allotments;
    this.screenClassId = screenClassId;
    this.viewport = viewport;
  }

  /** The sole constructor. `demands` is every region's own
   *  `Measured<Region>` for every axis it participates in; `candidate` is
   *  the allotment a solve (today: the compiled program's own tracks, a
   *  later step's real CSS-Grid realization) produced BEFORE this
   *  validation runs. Returns the validated layout, or a non-empty list
   *  of `StarvationDiagnostic` — never a partial or best-effort
   *  `FeasibleLayout`.
   *
   *  A region present in `demands` but absent from `candidate` (`got ===
   *  undefined`, or an axis mismatch) is "this region is not modeled at
   *  this screen class" and is skipped — not a diagnostic. This is
   *  DIFFERENT from a region resolved `RegionPresence.absent` (§1.3):
   *  that case is the CALLER's job to keep out of `demands` for the pass
   *  entirely (an absent region contributes no demand — see
   *  `RegionPresence`'s own doc); `validate()` itself has no presence
   *  concept and checks every `(region, axis)` pair it is given a
   *  candidate for. */
  static validate<R extends string>(
    demands: readonly Measured<R>[],
    candidate: ReadonlyMap<R, RegionAllotment<R>>,
    screenClassId: LytScreenClassIdInput,
    viewport: { widthPx: Px; heightPx: Px },
  ): FeasibleLayout<R> | { readonly refused: readonly StarvationDiagnostic[] } {
    const diagnostics: StarvationDiagnostic[] = [];
    for (const d of demands) {
      const got = candidate.get(d.region);
      if (got === undefined || got.axis !== d.axis) continue;
      if (got.px < d.min) {
        diagnostics.push({ kind: 'starved', region: d.region, axis: d.axis, demandPx: d.min, grantedPx: got.px });
      }
      if (d.maxUseful !== null && got.px > d.maxUseful) {
        diagnostics.push({
          kind: 'hoarding',
          region: d.region,
          axis: d.axis,
          demandPx: d.maxUseful,
          grantedPx: got.px,
        });
      }
    }
    if (diagnostics.length > 0) return { refused: diagnostics };
    // `candidate` is already `ReadonlyMap<R, RegionAllotment<R>>` by its own
    // parameter type — this cast only re-states that type for the
    // constructor call site (TS's generic inference over the map's own
    // declared type does not need widening here); no unsafety is erased.
    return new FeasibleLayout(candidate as ReadonlyMap<R, RegionAllotment<R>>, screenClassId, viewport);
  }
}

/** `FeasibleLayout`'s own `screenClassId` field is deliberately NOT typed
 *  against `layout-model.ts`'s `LytScreenClassId` — this module does not
 *  import from `layout-model.ts` (a one-directional dependency: the spec
 *  names `layout-model.ts` as consumed BY a later migration step, not a
 *  dependency of this additive-only one — see the spec §3 step 3's own
 *  "deletes the runtime clamps" framing, which runs the other direction).
 *  A plain string keeps this module's own type surface self-contained;
 *  callers threading a real `LytScreenClassId` in (as the geometry-sweep
 *  test does) get structural compatibility for free since
 *  `LytScreenClassId` is itself a string-literal union. */
export type LytScreenClassIdInput = string;

// ── §1.3 Presence as an allotment of zero, not a second boolean ────────

/** A demoted or toggled-off region is not a value absent from `demands`;
 *  it is a region whose `candidate` allotment is `0px` and whose
 *  `Measured` entry is still present, checked the same way as everything
 *  else — EXCEPT that a caller resolving a region to `'absent'` must omit
 *  that region's `Measured` entry from the `demands` array passed to
 *  `validate()` for that pass, so an absent region never produces a
 *  "starved at 0" diagnostic (indistinguishable, if it were checked, from
 *  a genuine zero-width bug). `RegionPresence` itself carries no
 *  enforcement of this — it is the discriminated fact a caller resolves
 *  BEFORE building `demands`; `FeasibleLayout.validate` has no presence
 *  concept of its own (see that method's own doc). */
export type RegionPresence<Region extends string> =
  | { readonly kind: 'present'; readonly region: Region }
  | { readonly kind: 'absent'; readonly region: Region; readonly reason: 'user-toggle' | 'demoted' };

// ── §1.6 Sovereign override ─────────────────────────────────────────────

/** A user's explicit geometry choice for one region — the ONLY thing that
 *  can override a `Measured<Region>`'s own computed default. Distinct
 *  from a `RegionAllotment` (always inside `[min, maxUseful]` once
 *  validated) precisely because a sovereign override is permitted to fall
 *  OUTSIDE that range — that permission is the whole point of
 *  sovereignty (commissioner doctrine, ledger rows 2379(3)/2443). */
export interface SovereignOverride<Region extends string> {
  readonly region: Region;
  readonly axis: LytAxis;
  readonly px: Px;
  /** Closed union of one, deliberately (ledger row 2447 ratified fork
   *  default) — see this module's header and spec §5 open question 1. */
  readonly source: 'user-drag';
}

/** The diagnostic a sovereign override that starves ANOTHER region
 *  produces — never a silent clamp of the override itself (the
 *  commissioner's own words: "never drag resistance"), never a silent
 *  starvation of the other region either. Structured per ADR-0019 C8
 *  (located, remediable, no dead end). */
export interface SovereignOverrideDiagnostic {
  /** The region the user actually dragged. */
  readonly location: string;
  readonly starved: readonly StarvationDiagnostic[];
  readonly message: string;
  readonly remediation: 'reduce this region\'s width, or use Default Layout to reset';
  readonly nextAction: 'open-default-layout-control';
}

/** `FeasibleLayout.validate` (§1.2) is never called with a sovereign
 *  override folded into `demands` as if it were a `Measured` entry — an
 *  override instead REPLACES that region's `candidate` allotment
 *  post-solve, and this function re-runs the starvation half of validate
 *  over every OTHER region only, producing a diagnostic instead of a
 *  refusal. The overridden region itself is never checked against its
 *  own `min`/`maxUseful` — sovereignty means exactly that its own
 *  floor/ceiling no longer bind.
 *
 *  Unlike the spec's own §1.6 worked sketch (which elides
 *  `screenClassId`/`viewport` for brevity, "see §3 step 4's real call
 *  site for the full form"), this is the REAL threaded signature — a
 *  caller supplies the actual screen class and viewport the override was
 *  taken against, and that same pair is what the internal
 *  `FeasibleLayout.validate` call is scoped to, rather than a placeholder
 *  `'landscape'`/`{0,0}`. */
export function resolveSovereignOverrides<R extends string>(
  demands: readonly Measured<R>[],
  solved: ReadonlyMap<R, RegionAllotment<R>>,
  overrides: readonly SovereignOverride<R>[],
  screenClassId: LytScreenClassIdInput,
  viewport: { readonly widthPx: Px; readonly heightPx: Px },
): { readonly candidate: ReadonlyMap<R, RegionAllotment<R>>; readonly diagnostics: readonly SovereignOverrideDiagnostic[] } {
  const overriddenRegions = new Set(overrides.map((o) => o.region));
  const next = new Map(solved);
  for (const o of overrides) next.set(o.region, { region: o.region, axis: o.axis, px: o.px });
  const result = FeasibleLayout.validate(
    demands.filter((d) => !overriddenRegions.has(d.region)),
    next,
    screenClassId,
    viewport,
  );
  const starved = 'refused' in result ? result.refused : [];
  const diagnostics = overrides
    .map((o): SovereignOverrideDiagnostic => ({
      location: o.region,
      starved,
      message:
        starved.length > 0
          ? `Your geometry modification no longer permits ${starved.map((s) => s.region).join(', ')} to render.`
          : '',
      remediation: 'reduce this region\'s width, or use Default Layout to reset',
      nextAction: 'open-default-layout-control',
    }))
    .filter((d) => d.starved.length > 0);
  return { candidate: next, diagnostics };
}

// ── §3 step 1 adapter: measuredFromLytProgram ──────────────────────────

/** One `LytTrackShape` compiled to (at most) one `Measured<string>` entry
 *  — `null` for a track kind this adapter's ratified fork default (row
 *  2447) excludes (`board-priority-clamp`/`board-priority-self-clamp`,
 *  the board-composite's own aspect-coupled track). `preferred` is
 *  synthesized as `= min` throughout (spec §5 open question 2, ratified
 *  as sufficient for step 1). */
function measuredFromTrack(region: string, axis: LytAxis, track: LytTrackShape): Measured<string> | null {
  switch (track.kind) {
    case 'fixed':
      return measured({ region, axis, min: px(track.px), preferred: px(track.px), maxUseful: px(track.px) });
    case 'elastic':
      return measured({ region, axis, min: px(track.minPx), preferred: px(track.minPx), maxUseful: null });
    case 'elastic-capped':
      return measured({
        region,
        axis,
        min: px(track.minPx),
        preferred: px(track.minPx),
        maxUseful: px(track.maxPx),
      });
    case 'board-priority-clamp':
    case 'board-priority-self-clamp':
      // Ratified fork default, ledger row 2447 — board aspect-coupled
      // composites are OUT of scope for step 1 (spec §5 open question 6).
      return null;
    /* istanbul ignore next -- exhaustiveness guard, ADR-0002 */
    default: {
      const _exhaustive: never = track;
      throw new Error(`measuredFromLytProgram: unhandled LytTrackShape kind: ${JSON.stringify(_exhaustive)}`);
    }
  }
}

/** Reads every track-bearing leaf/blackbox/exclusive node of a compiled
 *  `LytProgram` into a flat `Measured<string>[]` — the region key is the
 *  node's own `widget` id. Recurses through `split` nodes (whose own
 *  children each carry a `track`) and through `exclusive` nodes' own tab
 *  children whose `node` is ITSELF a further `split` (so e.g. the
 *  Settings tab's `settingsSubstrip`/`SP_session` still yield entries);
 *  a bare leaf/blackbox reached directly as an Exclusive tab's own `node`
 *  (no `LytChild.track` of its own — SPEC.md §2) yields none, per this
 *  module's header disclosure.
 *
 *  Excluded, per the ratified fork default (ledger row 2447): any leaf
 *  whose `aspect !== null` (the board-aspect-coupled leaves, `B` and
 *  `previewBoard` in both compiled programs) and any track of kind
 *  `board-priority-clamp`/`board-priority-self-clamp` (the board
 *  composite's own coupled-axis wrapper). Both are documented, not
 *  silently dropped — see this module's header. */
export function measuredFromLytProgram(program: LytProgram): readonly Measured<string>[] {
  const out: Measured<string>[] = [];

  function visitChild(child: LytChild, parentAxis: LytAxis): void {
    visitNode(child.node, parentAxis, child.track);
  }

  function visitNode(node: LytNodeData, axis: LytAxis, ownTrack: LytTrackShape | null): void {
    switch (node.kind) {
      case 'leaf': {
        if (node.aspect !== null) return; // board aspect-coupled leaf — out of scope, row 2447
        if (ownTrack !== null) {
          const m = measuredFromTrack(node.widget, axis, ownTrack);
          if (m !== null) out.push(m);
        }
        return;
      }
      case 'blackbox': {
        if (ownTrack !== null) {
          const m = measuredFromTrack(node.widget, axis, ownTrack);
          if (m !== null) out.push(m);
        }
        return;
      }
      case 'split': {
        for (const child of node.children) visitChild(child, node.axis);
        return;
      }
      case 'exclusive': {
        if (ownTrack !== null) {
          const m = measuredFromTrack(node.widget, axis, ownTrack);
          if (m !== null) out.push(m);
        }
        for (const tabChild of node.children) {
          // Exclusive-tab children carry no LytChild.track of their own
          // (SPEC.md §2: every child shares the parent's box) — only
          // recurse when the tab's own node is a further Split, whose OWN
          // children DO carry tracks (see this module's header).
          if (tabChild.node.kind === 'split') {
            for (const nested of tabChild.node.children) visitChild(nested, tabChild.node.axis);
          }
        }
        return;
      }
      /* istanbul ignore next -- exhaustiveness guard, ADR-0002 */
      default: {
        const _exhaustive: never = node;
        throw new Error(`measuredFromLytProgram: unhandled LytNodeData kind: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  for (const child of program.root.children) visitChild(child, program.root.axis);
  return out;
}
