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
 * **Dispatch L2b addendum (§3 step 2, ledger rows 2447/2450/2460): the
 * runtime overlay, and a disclosed narrower gate than the spec's own
 * words.** `measuredFromLytProgram` gains an optional second parameter,
 * `overlay` — a `region -> live maxUseful` map fed by
 * `useContentDemand.ts` (spec §2's runtime-content-dependent-demand
 * seam). Per the spec's own §3 step 2 text ("runtime demands supersede
 * build-time nulls for regions classified content-dependent per the
 * compiled content field"), the LITERAL gate would be `node.content ===
 * 'unbounded'`. Checked directly against both compiled programs
 * (`lyt-layout.gen.ts`/`lyt-layout-portrait.gen.ts`): the `tree` leaf —
 * the spec's own named flagship hoarder — carries `content: null` in
 * BOTH, not `'unbounded'`; classifying it as `'unbounded'` is a `.lyt`
 * ENCODING edit (`research/lyt/encodings/lengyue_{landscape,portrait}.lyt`
 * + a regeneration), a cross-boundary `research/lyt/` touch per the
 * umbrella `CLAUDE.md`'s scope discipline and EXACTLY the risk the spec's
 * own §4 risk register names for step 2 ("The `.lyt`/`emit_layout_tree.py`
 * cross-boundary change ... is out of frontend scope and needs a
 * dispatch, not a silent frontend-side workaround"). This build's own
 * scope (per the dispatch brief) is the FRONTEND half only — no
 * `research/lyt/` file is touched here. The gate actually implemented
 * below is therefore narrower and purely frontend-computable: an overlay
 * entry supersedes a synthesized entry's `maxUseful` ONLY when that
 * entry's `maxUseful` is ALREADY `null` (i.e. the region is currently
 * unbounded per the TYPE, regardless of whether its `content` field has
 * been classified yet) — which is a strict SUBSET of what the literal
 * `content === 'unbounded'` gate would allow (every `content: 'unbounded'`
 * leaf's track is ALSO plain `elastic` today, so its adapter-synthesized
 * `maxUseful` is ALWAYS `null` too — the two gates agree on every leaf
 * that already carries the classification; they diverge only for `tree`,
 * where this narrower gate still fires and the literal one would not).
 * Flagged here, not silently substituted, per ADR-0004: reclassifying
 * `tree`'s own `content` field (closing the divergence, and unblocking a
 * FUTURE `OverflowDiscipline`-driven leaf-cell contract for it) is a
 * residual item for a follow-up dispatch to `research/lyt/`, matching the
 * spec's own risk-register framing.
 *
 * **Superseded by the row 2501 repair (`.claude/dispatch-reports/
 * lyt-cure-repair-build.md`, `resolveEffectiveDemand` below).** This
 * paragraph originally described the effective value as `max(entry.min,
 * overlayPx)` — a live reading below the compiled floor clamped UP to
 * that floor, on the theory that the floor was "a declared readability
 * guarantee no measurement can shrink." The live-witness rig
 * (`.claude/dispatch-reports/lyt-cure-live-witness.md` FAILs 1/2) found
 * that rule was never actually applied at EVERY site that constructs a
 * `Measured<'tree'>` triple from a raw live reading —
 * `resolveSideColumnLiveLayout`'s own sovereign branch built one
 * directly from the unclamped reading, so a live demand 1px below the
 * compiled floor self-contradicted at `measured()`'s own construction
 * (a construction-time THROW, uncaught, crashing the reactive `computed`
 * that reads it). Rather than merely make the clamp-up rule consistent
 * everywhere, the rule itself is reversed for a content-dependent
 * region: the compiled floor is a disclosed, solver-only relaxation, so
 * live truth wins and the WHOLE triple (including `min`) lowers to the
 * live reading. See `resolveEffectiveDemand`'s own header for the full
 * account (including the review's own obligation-2 demand-of-0 special
 * case); this function and `resolveSideColumnLiveLayout` both consume
 * it now, so the rule has exactly one home.
 *
 * License: Public Domain (The Unlicense)
 */
import type { LytAxis, LytChild, LytDemotion, LytNodeData, LytProgram, LytTrackShape } from './lyt-layout-types';

// ── §1.1 Measured<Region> ──────────────────────────────────────────────

/**
 * Row 2501 review repair (`.claude/dispatch-reports/
 * lyt-cure-repair-review.md` obligation 1): minted ONLY by `px()`'s and
 * `measured()`'s own construction-refusal throws below — the two places
 * that check a region's own `min <= preferred <= (maxUseful ?? +Infinity)`
 * ordering and its `Px` finiteness/non-negativity. Deliberately NOT thrown
 * by any OTHER guard in this module: `resolveSideColumnLiveLayout`'s own
 * two ADR-0002 caller-contract checks (a non-`elastic` tree track, a
 * non-`h` demote axis) and `fixedTrackPx`'s own "not a fixed track" guard
 * all stay plain `Error` — those are wiring/shape bugs a caller made, not
 * a measurement self-contradiction, and per the review's own adversarial
 * probe (an `others` entry with a broken/undefined track) they must
 * PROPAGATE rather than degrade into a "layout could not be computed"
 * system message, which would misdescribe what actually went wrong and
 * hide a caller-side bug behind a content-demand-shaped excuse.
 * `resolveSideColumnLiveLayout`'s own defense-in-depth catch (§3 step 3's
 * doc, "Defense in depth") narrows on `instanceof MeasurementRefusalError`
 * specifically — see that function's own doc for the narrowed catch.
 */
export class MeasurementRefusalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MeasurementRefusalError';
  }
}

/** A CSS-pixel measure, always non-negative, always finite. Branded so a
 *  bare `number` (viewport px, aspect ratio, ch) cannot be passed where a
 *  measured content demand is required — ADR-0012 P1: a region's demand
 *  and its allotment are different currencies until this type says
 *  otherwise. */
export type Px = number & { readonly __brand: 'Px' };

/** Sole constructor for `Px`. Refuses loudly (ADR-0002) rather than
 *  silently clamping a negative/non-finite input — a caller that computed
 *  a negative pixel measure has a bug upstream, not a value this
 *  constructor should paper over. Throws `MeasurementRefusalError` (row
 *  2501 review repair) — this specific refusal shape is exactly what
 *  `resolveSideColumnLiveLayout`'s own defense-in-depth catch is scoped
 *  to degrade gracefully. */
export function px(n: number): Px {
  if (!Number.isFinite(n) || n < 0) {
    throw new MeasurementRefusalError(`px(): ${n} is not a finite, non-negative pixel measure (ADR-0002).`);
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
    throw new MeasurementRefusalError(
      `measured(${input.region}, ${input.axis}): min (${input.min}) exceeds ` +
        `preferred (${input.preferred}) — a region's own supplied demand is ` +
        'self-contradictory; this is a measurement-site bug, never clamped here.',
    );
  }
  if (input.maxUseful !== null && !(input.preferred <= input.maxUseful)) {
    throw new MeasurementRefusalError(
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

// ── Row 2501 repair (`.claude/dispatch-reports/lyt-cure-repair-build.md`,
//    `.claude/dispatch-reports/lyt-cure-live-witness.md` FAILs 1/2):
//    the live floor/ceiling rule for a content-dependent region ────────

/**
 * When a content-dependent region's own live measured demand undercuts
 * its own COMPILED floor, the compiled floor is a disclosed, solver-only
 * relaxation (spec §0's own facts-provenance table: the compiled `min`
 * on an `elastic` track is a STATIC estimate the LYT solver assumed at
 * compile time, never re-measured against the region's own CURRENT
 * rendered content) — live truth wins, and the region's WHOLE demand
 * triple lowers to the measured value (`min = preferred = maxUseful =
 * liveDemandPx`), rather than the prior rule (`max(compiledMinPx,
 * liveDemandPx)`) that clamped a low reading UP to the compiled floor.
 *
 * That prior rule was itself safe wherever it was actually applied
 * (`measuredFromLytProgram`'s own `applyOverlay`, below) — but it was
 * NOT applied at every site that constructs a `Measured<'tree'>` triple
 * from a raw live reading: `resolveSideColumnLiveLayout`'s own sovereign
 * branch built `measured({ min: treeTrack.minPx, preferred:
 * treeTrack.minPx, maxUseful: input.tree.maxUsefulPx })` directly from
 * the UNCLAMPED live reading, so a live demand even 1px below the
 * compiled floor (110 vs. a live 109) self-contradicted at construction
 * — exactly the live-witness FAILs 1/2 (`measured(tree, h): preferred
 * (110) exceeds maxUseful (109)`), which crashed the reactive `computed`
 * that reads it (`useSideColumnLiveLayout.ts`), demoting the panel to
 * 1px (FAIL 1) and making every interactive drag inert (FAIL 2).
 *
 * Rather than patch every call site to individually clamp (fragile —
 * the NEXT call site would reintroduce the same class of bug), this
 * function is now the ONE place the floor/ceiling relationship for a
 * live reading is decided, consumed by both `applyOverlay` (below) and
 * `resolveSideColumnLiveLayout` (§3 step 3) — "single home per fact"
 * (spec §2), applied to this rule itself. When the live demand meets or
 * exceeds the compiled floor, the floor stands unchanged — the
 * ordinary, already-consistent case, byte-identical to the pre-repair
 * behavior.
 *
 * **Demand-of-0, review obligation 2 (`.claude/dispatch-reports/
 * lyt-cure-repair-review.md`).** A live demand of exactly `0` (a
 * genuinely empty tree) is deliberately NOT treated as "live truth" the
 * way any positive-but-small reading is. Per spec §1.3's own
 * `RegionPresence` doctrine: a region resolved `absent` contributes a
 * `px(0)` candidate with NO `Measured` check run against it at all
 * (indistinguishable, if checked, from a genuine zero-width bug) — but a
 * region resolved `present` is ALWAYS checked against its own `min`,
 * with no zero-content exception carved out. `tree` here is, by
 * construction, on the PRESENT path (this function is only ever reached
 * for a region genuinely rendering in the grid) — so letting a live
 * demand of `0` lower the floor to `0` would produce exactly the
 * outcome §1.3 reserves for absence, on a region the caller has already
 * decided is present. The user-visible consequence would be
 * indistinguishable from the ORIGINAL cure's own target symptom: a
 * nominally-present region rendered invisibly (FAIL 1's own 1px panel,
 * one pixel from a literal 0). Read together with §1.3, the answer is
 * that presence implies a usable minimum — zero belongs to absence, not
 * to a present region's own demand — so BOTH the floor and the ceiling
 * pin to the compiled minimum when the live demand is `<= 0`: the
 * region is granted exactly its compiled floor, never less, and the
 * "no more useful past this point" ceiling is that same floor (there is
 * no content to grow into past it either). Any STRICTLY POSITIVE live
 * demand below the compiled floor is unaffected by this special case —
 * the ordinary "whole triple lowers to the live reading" rule still
 * applies there.
 */
function resolveEffectiveDemand(compiledMinPx: number, liveDemandPx: number): { readonly minPx: number; readonly maxUsefulPx: number } {
  if (liveDemandPx <= 0) return { minPx: compiledMinPx, maxUsefulPx: compiledMinPx };
  return { minPx: Math.min(compiledMinPx, liveDemandPx), maxUsefulPx: liveDemandPx };
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
 *  silently dropped — see this module's header.
 *
 *  `overlay` (dispatch L2b, this module's header addendum): a
 *  `region -> live maxUseful` map. An overlay entry supersedes a
 *  synthesized entry's `maxUseful` ONLY when that entry's own `maxUseful`
 *  is already `null` (never a compiled `fixed`/`elastic-capped` ceiling —
 *  "runtime demands supersede build-time NULLS", never a real compiled
 *  fact) and only when `overlay` itself supplies a non-null `Px` for that
 *  region (an overlay entry of `null`, or a region simply absent from
 *  `overlay`, leaves the synthesized `maxUseful: null` exactly as step 1
 *  produced it — the default parameter value, an empty map, therefore
 *  reproduces step 1's output BYTE-IDENTICALLY). The superseding value is
 *  `max(entry.min, overlayPx)`, never the raw overlay reading — see this
 *  module's header for why a live reading below the region's own compiled
 *  floor does not lower `maxUseful` below that floor. */
export function measuredFromLytProgram(
  program: LytProgram,
  overlay: ReadonlyMap<string, Px | null> = new Map(),
): readonly Measured<string>[] {
  const out: Measured<string>[] = [];

  function applyOverlay(entry: Measured<string>): Measured<string> {
    if (entry.maxUseful !== null) return entry; // a real compiled ceiling — never superseded
    const overlayPx = overlay.get(entry.region);
    if (overlayPx === undefined || overlayPx === null) return entry; // no live reading yet
    // Row 2501 repair: the whole triple lowers to the live reading when it
    // undercuts the compiled floor — see `resolveEffectiveDemand`'s own
    // header, including its obligation-2 demand-of-0 special case.
    // `eff.minPx <= eff.maxUsefulPx` always holds by construction, so this
    // never violates `measured()`'s own `preferred <= maxUseful` check.
    const eff = resolveEffectiveDemand(entry.min, overlayPx);
    return measured({
      region: entry.region,
      axis: entry.axis,
      min: px(eff.minPx),
      preferred: px(eff.minPx),
      maxUseful: px(eff.maxUsefulPx),
    });
  }

  function visitChild(child: LytChild, parentAxis: LytAxis): void {
    visitNode(child.node, parentAxis, child.track);
  }

  function visitNode(node: LytNodeData, axis: LytAxis, ownTrack: LytTrackShape | null): void {
    switch (node.kind) {
      case 'leaf': {
        if (node.aspect !== null) return; // board aspect-coupled leaf — out of scope, row 2447
        if (ownTrack !== null) {
          const m = measuredFromTrack(node.widget, axis, ownTrack);
          if (m !== null) out.push(applyOverlay(m));
        }
        return;
      }
      case 'blackbox': {
        if (ownTrack !== null) {
          const m = measuredFromTrack(node.widget, axis, ownTrack);
          if (m !== null) out.push(applyOverlay(m));
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
          if (m !== null) out.push(applyOverlay(m));
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

// ── §3 step 3: the side-column live solve (dispatch L3, ledger rows
//    2447/2450/2460/2461) ────────────────────────────────────────────

/** One row-child fact the side-column solve needs: its own compiled
 *  track (from the active `LytProgram`) and its persisted-or-class-
 *  default DESIRED visibility (before any width evaluation) — the same
 *  "desired" input the now-deleted `resolveWidthConditionalPresence`
 *  (`layout-model.ts`) used to take, folded here into `RegionPresence`
 *  resolution instead of a bare boolean return (spec §1.3: "presence
 *  unifies through `RegionPresence`"). */
export interface SideColumnFixedRegion {
  readonly widgetId: string;
  readonly track: LytTrackShape;
  readonly desiredVisible: boolean;
  /** Compiled `@demote` threshold, or `null` when this region never
   *  demotes by width (`previewBoard` today — its own presence toggle is
   *  unconditional, per the dated addendum this dispatch's own header
   *  transcribes). */
  readonly demote: LytDemotion | null;
}

export interface SideColumnLiveLayoutInput {
  /** `#tree-control-wrapper`'s own live DOM width (`sideColumnWidthPx`,
   *  `useResizablePanel.ts`'s second `ResizeObserver`). `<= 0` means "not
   *  yet measured." */
  readonly wrapperWidthPx: number;
  readonly gapPx: number;
  readonly tree: {
    /** Must be `'elastic'` — this solve only knows how to read an
     *  elastic leaf's own `minPx` floor; a different compiled shape is a
     *  caller error (ADR-0002, guarded at this function's own entry). */
    readonly track: LytTrackShape;
    /** Content-demand ceiling (dispatch L2b's `useContentDemand` overlay
     *  — `TreeWidget.vue`'s own exposed `contentDemandPx`), `null` when
     *  not yet measured or genuinely unbounded. THE decisive fact this
     *  dispatch wires live: without it, `tree`'s own candidate below has
     *  no ceiling at all and reproduces the review's own flagship
     *  hoarding defect. */
    readonly maxUsefulPx: Px | null;
  };
  /** `store.session.ui.treePanelWidthPx` — `undefined` means never
   *  dragged this session. */
  readonly treeSovereignPx: number | undefined;
  /** The un-dragged default (`computeTreePanelDefaultWidthPx`) — used
   *  ONLY as this function's own "not yet measured" pass-through value;
   *  the live solve otherwise re-derives the un-dragged candidate itself
   *  from `wrapperWidthPx` and the row's own reservations (subsuming the
   *  deleted `resolveTreeRowWidthPx`'s widen-into-freed-space behavior). */
  readonly treeDefaultPx: number;
  /** `controlPanel` then `previewBoard`, in row order — every OTHER
   *  fixed-demand sibling this row can carry (mirrors the deleted
   *  `clampTreeWidthForSideColumn`'s own `fixedSiblings` parameter). */
  readonly others: readonly SideColumnFixedRegion[];
  readonly screenClassId: LytScreenClassIdInput;
}

export interface SideColumnRegionOutcome {
  readonly widgetId: string;
  readonly present: boolean;
  readonly candidatePx: number;
}

export interface SideColumnLiveLayoutResult {
  readonly treePx: number;
  readonly others: readonly SideColumnRegionOutcome[];
  /** Non-empty only when `tree` is sovereign (dragged this session) AND
   *  the resulting candidate starves another region — §1.6's own
   *  contract, never a silent clamp, never a silent starvation. */
  readonly diagnostics: readonly SovereignOverrideDiagnostic[];
}

/**
 * Dispatch L4 (`.claude/dispatch-reports/lyt-space-owner-spec.md` §3 step
 * 4, ledger rows 2447/2484/2498): closes the "no sibling to diagnose
 * against" fork the L3 build report parked (`.claude/dispatch-reports/
 * lyt-space-owner-l3-build.md` §7 finding 2, §8) — a sovereign `tree`
 * drag whose own candidate overflows the side column's own physical
 * capacity produces NO diagnostic from `resolveSovereignOverrides` alone
 * when no OTHER `Measured` region exists to check it against (`others:
 * []`, or every `others` entry resolved absent): that function's own
 * contract (§1.6) only ever validates "another region," never the row's
 * own container.
 *
 * **Resolution, no new type — ratified at orchestrator level, ledger row
 * 2498, per the L4 review's own condition 1
 * (`.claude/dispatch-reports/lyt-space-owner-l4-review.md` §2).**
 * `StarvationDiagnostic.region` is already `string` — confirmed by
 * reading the type directly, unchanged by this dispatch — not a closed
 * union over a fixed `Region` set. This is the actual, narrow textual
 * support for "no new type": NOT a spec sentence naming the viewport as
 * part of some checked quantification universe (an earlier version of
 * this comment cited "§1.2's closure," which is inaccurate — §1.2's own
 * closure statement says only "§1.1's universe, inherited," and §1.1's
 * own enumerated universe — in-flow leaves, blackbox interiors, corner
 * overlays, modal/popover boxes, chart containers — names things that
 * RENDER content; `FeasibleLayout.viewport` is descriptive context
 * metadata in the spec's own §1.2 type, never itself validated against a
 * `Measured` entry. The spec's own text does not decide this fork either
 * way; the disposition rests on `region: string`'s own open type plus
 * ledger row 2498's explicit ratification, not on spec provenance).
 * Minting a `Measured<'side-column-capacity'>` demand — `min` = the row's
 * own ACTUAL rendered claim (tree's own sovereign candidate plus every
 * present sibling's own reservation), `candidate` = the side column's own
 * REAL physical width (`wrapperWidthPx`) — and running it through the
 * SAME `FeasibleLayout.validate` this module already uses everywhere else
 * produces exactly a `'starved'` diagnostic (the side column is starved
 * of the space the row's own content demands) whenever the row's total
 * claim exceeds its own capacity. No field is added to any type;
 * `'side-column-capacity'` is a new REGION NAME threaded through a
 * pre-existing shape, the same way `'tree'`/`'controlPanel'` already are.
 *
 * **Naming, disclosed (L4 review §2, "a coincidental prior-art
 * wrinkle").** The region name is deliberately NOT `'wrapper'` — the L4
 * review found `useResizablePanel.ts`'s own (L3-vintage)
 * `outerRowSovereignDiagnostic` already uses the literal string
 * `'wrapper'` as a region name, but for the OPPOSITE role: there it
 * denotes the sovereign, RENDERED control-region pane itself (the drag
 * target), where here it would denote the row's own non-rendering
 * CONTAINER capacity (the thing being checked, never a drag target). No
 * runtime collision existed either way (each `FeasibleLayout.validate`
 * call builds its own small, self-contained `demands`/`candidate` maps),
 * but one string carrying two unrelated domain meanings across this file
 * family is a real naming-hygiene gap a future reader grepping for
 * `'wrapper'` diagnostics would trip on — `'side-column-capacity'` names
 * the checked quantity unambiguously and cannot collide with
 * `useResizablePanel.ts`'s own usage.
 *
 * **Scope, disclosed.** This check runs ONLY in the sovereign branch. A
 * non-sovereign candidate is constructed to fit within `wrapperWidthPx` by
 * its own clamp (this function's own doc, "the non-sovereign candidate is
 * CONSTRUCTED to respect every present sibling's own reservation") — it
 * can still fall short of `tree`'s own compiled floor at a pathologically
 * narrow wrapper (`treeTrack.minPx` exceeding `wrapperWidthPx` outright),
 * but that is a DIFFERENT, pre-existing gap this dispatch does not open;
 * named here rather than silently folded in, per ADR-0004.
 */
const SIDE_COLUMN_CAPACITY_REGION = 'side-column-capacity';

function sideColumnCapacityStarvation(
  totalRowClaimPx: number,
  wrapperWidthPx: number,
  screenClassId: LytScreenClassIdInput,
): StarvationDiagnostic | null {
  const demand = measured({
    region: SIDE_COLUMN_CAPACITY_REGION,
    axis: 'h',
    min: px(totalRowClaimPx),
    preferred: px(totalRowClaimPx),
    maxUseful: null,
  });
  const candidate = new Map<string, RegionAllotment<string>>([
    [SIDE_COLUMN_CAPACITY_REGION, { region: SIDE_COLUMN_CAPACITY_REGION, axis: 'h', px: px(wrapperWidthPx) }],
  ]);
  const result = FeasibleLayout.validate([demand], candidate, screenClassId, {
    widthPx: px(wrapperWidthPx),
    heightPx: px(0),
  });
  if (!('refused' in result)) return null;
  // Exactly one demand was passed in, so at most one diagnostic returns —
  // named defensively rather than assumed, per ADR-0002.
  return result.refused[0] ?? null;
}

/** Composes the side-column-capacity check above into whatever
 * `resolveSovereignOverrides` already produced for the SAME sovereign
 * drag: merged into the existing 'tree'-located diagnostic when one
 * already exists (a sibling starvation AND a capacity overflow can both
 * be real at once — the review's own "starved+hoarding pair from one
 * call" discipline, §1.2, applied here to a second diagnostic source), or
 * synthesized fresh when `resolveSovereignOverrides` found nothing to
 * diagnose (the exact parked-fork shape: no sibling, so its own `starved`
 * array was empty and it emitted no diagnostic at all). */
function mergeSideColumnCapacityDiagnostic(
  diagnostics: readonly SovereignOverrideDiagnostic[],
  capacityStarved: StarvationDiagnostic | null,
): readonly SovereignOverrideDiagnostic[] {
  if (capacityStarved === null) return diagnostics;
  const existing = diagnostics.find((d) => d.location === 'tree');
  if (existing !== undefined) {
    const starved = [...existing.starved, capacityStarved];
    return diagnostics.map((d) => (d.location === 'tree' ? { ...d, starved, message: sovereignMessage(starved) } : d));
  }
  const starved = [capacityStarved];
  return [
    ...diagnostics,
    {
      location: 'tree',
      starved,
      message: sovereignMessage(starved),
      remediation: 'reduce this region\'s width, or use Default Layout to reset',
      nextAction: 'open-default-layout-control',
    },
  ];
}

/** `SIDE_COLUMN_CAPACITY_REGION` is not a renderable region (nothing
 * "renders" a container overflowing itself) — its own clause reads
 * differently from the render-target clause `resolveSovereignOverrides`
 * already produces for a genuine sibling, rather than folding it into the
 * same "no longer permits X to render" sentence, which would misdescribe
 * what actually happened. */
function sovereignMessage(starved: readonly StarvationDiagnostic[]): string {
  const renderTargets = starved.filter((s) => s.region !== SIDE_COLUMN_CAPACITY_REGION).map((s) => s.region);
  const overflows = starved.some((s) => s.region === SIDE_COLUMN_CAPACITY_REGION);
  const clauses: string[] = [];
  if (renderTargets.length > 0) clauses.push(`no longer permits ${renderTargets.join(', ')} to render`);
  if (overflows) clauses.push('no longer fits within the available space');
  return clauses.length > 0 ? `Your geometry modification ${clauses.join(', and ')}.` : '';
}

function fixedTrackPx(track: LytTrackShape, widgetId: string): number {
  if (track.kind !== 'fixed') {
    throw new Error(
      `resolveSideColumnLiveLayout: ${widgetId}'s own compiled track is ${JSON.stringify(track.kind)}, ` +
        'not "fixed" — this solve only knows how to reserve a fixed-px sibling demand (ADR-0002); the ' +
        'compiled program declared something else.',
    );
  }
  return track.px;
}

/**
 * The row `FeasibleLayout` now DRIVES, live (dispatch L3, spec §3 step 3):
 * `tree`, `controlPanel` (the Exclusive), `previewBoard` — exactly the row
 * the four now-deleted `layout-model.ts` functions
 * (`clampTreeWidthForSideColumn`, `resolveTreeRowWidthPx`,
 * `sumFixedRowSiblingReservationPx`, `resolveWidthConditionalPresence`)
 * used to hand-clamp. `computeTreePanelClampedWidthPx` and
 * `sanitizeTreeControlRegionWidthPx` (also deleted) are subsumed by
 * `resolveSovereignOverrides` itself, called below.
 *
 * **Presence.** Every `others` entry with a `demote` is evaluated against
 * `wrapperWidthPx` and every OTHER present sibling's own reservation
 * (mirrors `resolveWidthConditionalPresence`'s own `otherFixedSiblings`
 * question, now asked once per region instead of once per call site).
 *
 * **Tree's own candidate.** SOVEREIGN (`treeSovereignPx !== undefined`):
 * the stored value wins VERBATIM — no clamp against `tree`'s own
 * `minPx`/`maxUsefulPx`, no reservation against a sibling's demand
 * (§1.6: "its own floor/ceiling no longer bind"). Only a floor of `0` is
 * applied (a negative pixel measure is not renderable CSS, never a
 * starvation-avoidance clamp). NON-SOVEREIGN: the candidate is
 * `wrapperWidthPx` minus every present sibling's own reservation, clamped
 * to `[tree.track.minPx, tree.maxUsefulPx ?? +Infinity]` — this ONE
 * expression reproduces the deleted wave-A shrink clamp, the deleted
 * wave-B1/N2 widen-into-freed-space behavior, AND (new) the content-
 * demand ceiling dispatch L2b wired but never consumed until now — this
 * is the flagship fix: at a geometry where every sibling is absent and
 * `tree`'s own content is 60px wide, the un-dragged candidate is capped
 * at 60px (or the sibling reservation, whichever binds), never "claim
 * everything freed."
 *
 * **The other regions' own candidates.** `previewBoard` is never shrunk
 * when present — its own presence toggle is unconditional and
 * independent of `controlPanel`'s width gate (the dated addendum this
 * dispatch's own header transcribes); `controlPanel` absorbs whatever the
 * row has left after `tree` and `previewBoard` claim theirs — which CAN
 * fall below `controlPanel`'s own compiled fixed px once `tree` is
 * sovereign. This is the sovereignty completion (SCOPE item 3): the
 * commissioner's ~640px control-panel drag floor is gone by construction
 * — nothing in this function reserves `controlPanel`'s own demand against
 * `tree`'s sovereign candidate, so a drag that claims the whole wrapper
 * genuinely shrinks `controlPanel` toward `0`, never resisted.
 *
 * **Diagnostics.** Only the SOVEREIGN path can produce a starvation — the
 * non-sovereign candidate is CONSTRUCTED to respect every present
 * sibling's own reservation, so it can never itself starve one.
 * `resolveSovereignOverrides` (§1.6) is the one call site that both
 * APPLIES the override and re-validates every other region in one pass.
 *
 * **Defense in depth (row 2501, `.claude/dispatch-reports/
 * lyt-cure-repair-build.md`; narrowed per the review's own obligation 1,
 * `.claude/dispatch-reports/lyt-cure-repair-review.md`).** The two
 * ADR-0002 guards immediately below (a non-`elastic` tree track; a
 * non-`h` demote axis) are genuine CALLER contract violations — the
 * compiled program declared a shape this solve doesn't know how to read
 * — and stay loud, immediate throws: catching those would silently hide
 * a real encoding/wiring bug. Everything AFTER those guards runs inside a
 * `try`/`catch`, but the catch is narrowed to `instanceof
 * MeasurementRefusalError` specifically — the type `px()`/`measured()`
 * mint for their own construction-time refusals (the live-witness FAILs
 * 1/2's own crash site — a self-contradictory live reading this function
 * failed to construct consistently before the row 2501 fix, and the
 * class of thing a FUTURE bug at this seam could reintroduce). Anything
 * ELSE thrown inside the guarded region — `fixedTrackPx`'s own "not a
 * fixed track" guard included, a wiring bug distinct from a measurement
 * self-contradiction — is RE-THROWN immediately, never degraded into a
 * "layout could not be computed for the current content" message that
 * would misdescribe a caller-contract violation as a content-demand
 * problem. **The review's own adversarial probe proved the pre-repair
 * blanket `catch (err)` absorbed exactly this class of unrelated bug**
 * (an `others` entry with a broken/undefined track), surfacing only by
 * accident because the fallback's own construction happened to make the
 * identical unguarded assumption and threw a SECOND, uncaught error —
 * not a designed narrowness. Kept as a permanent regression test below
 * (`feasible-layout.test.ts`'s own "unrelated error propagates" case).
 * The fallback itself is ALSO hardened per the review's own second half
 * of obligation 1 (a defensive `o.track?.kind === 'fixed'` rather than
 * the unguarded `o.track.kind`) so a coincidentally-broken `others` entry
 * UNRELATED to the genuine `MeasurementRefusalError` being handled can
 * never make the fallback's OWN construction throw a second time. The
 * fallback shape itself is the SAME "not yet measured" compiled-defaults
 * shape the early-return branch below already produces (`treeDefaultPx`/
 * each sibling's own `desiredVisible`-gated compiled px), plus ONE
 * diagnostic naming the refusal, so `useSideColumnLiveLayout.ts`'s own
 * EXISTING `pushSystemMessage` watcher (no new wiring needed) surfaces
 * it.
 */
export function resolveSideColumnLiveLayout(input: SideColumnLiveLayoutInput): SideColumnLiveLayoutResult {
  if (input.tree.track.kind !== 'elastic') {
    throw new Error(
      `resolveSideColumnLiveLayout: tree's own compiled track is ${JSON.stringify(input.tree.track.kind)}, ` +
        'not "elastic" — this solve only knows how to read an elastic leaf\'s own minPx floor (ADR-0002); ' +
        'the compiled program declared something else.',
    );
  }
  const treeTrack = input.tree.track;
  // The demote-axis guard is also a caller contract violation (ADR-0002),
  // not a measurement refusal — validated HERE, before the try/catch
  // below, so it stays a loud immediate throw rather than being silently
  // absorbed into the row 2501 fallback (this function's own doc above).
  for (const o of input.others) {
    if (o.demote !== null && o.demote.axis !== 'h') {
      throw new Error(
        `resolveSideColumnLiveLayout: unsupported demote axis ${JSON.stringify(o.demote.axis)} for ` +
          `${o.widgetId} — only "h" (measured against the side column's own live width) is wired (ADR-0002).`,
      );
    }
  }
  try {
    return resolveSideColumnLiveLayoutUnguarded(input, treeTrack);
  } catch (err) {
    // Row 2501 defense in depth, narrowed per review obligation 1 — see
    // this function's own doc above. Anything that is not a
    // `MeasurementRefusalError` is a caller-contract/wiring bug, not a
    // measurement self-contradiction, and must propagate rather than
    // degrade.
    if (!(err instanceof MeasurementRefusalError)) throw err;
    const reason = err.message;
    const treePx = input.treeSovereignPx !== undefined ? Math.max(0, Math.round(input.treeSovereignPx)) : input.treeDefaultPx;
    return {
      treePx,
      // `o.track?.kind === 'fixed' ? o.track.px : 0` — NOT `fixedTrackPx`
      // (which throws on a non-'fixed' track), and NOT the unguarded
      // `o.track.kind` this fallback originally used (the review's own
      // obligation 1: a coincidentally-broken `others` entry, UNRELATED
      // to the genuine refusal being handled here, must not make this
      // fallback throw a SECOND, uncaught error while trying to degrade
      // gracefully from the first).
      others: input.others.map((o) => ({
        widgetId: o.widgetId,
        present: o.desiredVisible,
        candidatePx: o.desiredVisible && o.track?.kind === 'fixed' ? o.track.px : 0,
      })),
      diagnostics: [
        {
          location: 'tree',
          starved: [],
          message:
            `Layout could not be computed for the current content (${reason}) — the ` +
            'default layout was used instead.',
          remediation: 'reduce this region\'s width, or use Default Layout to reset',
          nextAction: 'open-default-layout-control',
        },
      ],
    };
  }
}

// ── Root-split live solve (GAP A, dispatch `.claude/dispatch-reports/
//    lyt-cure-final-repair.md`, ledger rows 2502/2503) ─────────────────

/** The board composite's own aspect-locked-demand facts this solve needs
 *  — read STRAIGHT OFF the compiled `board-priority-clamp` track
 *  (`lyt-layout.gen.ts` root child "2", `state/lyt-layout-types.ts`'s own
 *  CASE A doc), never re-derived: `fixedSiblingSumPx` is the board
 *  composite's own fixed internal siblings (`I_board`+`A_board`, 52px
 *  today) that share the board's row-height budget — the SAME field
 *  `useLytTrackCss.ts#trackCssValue`'s `board-priority-clamp` branch
 *  already consumes to build its CSS `calc()`. This module does not
 *  invent a second aspect-coupling derivation (ratified fork default,
 *  row 2447, §5 open question 6) — it evaluates the IDENTICAL closed
 *  form numerically, against LIVE measured `rowHeightPx`, instead of
 *  leaving it as a browser-evaluated `calc(100vh - ...)` (which assumes
 *  the row's own height tracks the literal viewport `vh` unit exactly —
 *  true only when no chrome above `#split-workspace` consumes vertical
 *  space; a live `rowHeightPx` reading is exact regardless).
 *
 *  Row 2502/2503 review repair (`.claude/dispatch-reports/
 *  lyt-cure-final-repair-review.md` condition C1): `naturalBoardCrossUnit`
 *  is carried alongside `fixedSiblingSumPx` — not silently ignored — so
 *  `resolveRootSplitLiveLayout` can refuse loudly (ADR-0002) rather than
 *  silently substituting a `rowHeightPx`-based formula for a track that
 *  declared a DIFFERENT natural cross unit. The field exists on the
 *  compiled type specifically because it can vary (`'vh' | 'vw'`,
 *  `lyt-layout-types.ts`'s own CASE A doc); this resolver's own closed
 *  form only mirrors the `'vh'` half of `trackCssValue`'s CASE A branch
 *  (`useLytTrackCss.ts`), so a `'vw'` (or any future) unit must be a
 *  construction-time refusal, never a silent divergence from the CSS
 *  branch it numerically twins. */
export interface RootSplitBoardRegion {
  readonly fixedSiblingSumPx: number;
  readonly naturalBoardCrossUnit: 'vh' | 'vw';
}

/** The side column's own compiled `board-priority-clamp` bounds
 *  (`minPx`/`maxPx`) — the solver-time floor/ceiling, unchanged and
 *  read verbatim from the SAME compiled track as `RootSplitBoardRegion`
 *  above (both are fields of the ONE `board-priority-clamp` track
 *  object at root child "2" — see this module's own `measuredFromTrack`
 *  for the sibling case that already reads a track object's fields this
 *  way). */
export interface RootSplitSideColumnRegion {
  readonly minPx: number;
  readonly maxPx: number;
}

export interface RootSplitLiveLayoutInput {
  /** `#split-workspace`'s own live width/height — `useResizablePanel.ts`'s
   *  `rowWidthPx`/`rowHeightPx` ResizeObserver readings, unchanged. */
  readonly rowWidthPx: number;
  readonly rowHeightPx: number;
  /** The root split's own compiled gap between the board composite and
   *  the side column (`lyt-layout.gen.ts` root `gapPx`). */
  readonly gapPx: number;
  /** `boardRail`'s own live reserved width (its fixed px plus one root
   *  gap) when visible, `0` otherwise — mirrors `LytNode.vue`'s own
   *  `boardRailReservedPx` computed (this module's twin, evaluated by
   *  the CALLER, which alone knows boardRail's resolved presence). */
  readonly boardRailReservedPx: number;
  readonly board: RootSplitBoardRegion;
  readonly sideColumn: RootSplitSideColumnRegion;
  /** The board's own hard floor (`MIN_BOARD_PX`, `state/layout-model.ts`)
   *  — this module does not import `layout-model.ts` (this file's own
   *  header, "one-directional dependency"), so the caller threads the
   *  literal floor through, mirroring how `useResizablePanel.ts`'s own
   *  `outerRowSovereignDiagnostic` already threads `MIN_BOARD_PX` in. */
  readonly boardFloorPx: number;
  /** `store.session.ui.treeControlRegionWidthPx` — `undefined` means
   *  never dragged this session. Sovereignty is UNCHANGED by this
   *  function: a dragged value wins verbatim, byte-identical to
   *  `effectiveTreeControlRegionWidthPx`'s own existing sovereign
   *  branch — this function only replaces the UN-DRAGGED default's own
   *  derivation (previously `computeTreeControlRegionDefaultWidthPx`'s
   *  flat 32%-of-row-width fraction, `state/layout-model.ts`, wholly
   *  disconnected from the board's own aspect lock — the live-witness
   *  rig's own flagship finding, `.claude/dispatch-reports/
   *  lyt-cure-live-witness.md` item 1). */
  readonly sovereignWrapperPx: number | undefined;
}

export interface RootSplitLiveLayoutResult {
  /** The side column's (root child "2") own resolved candidate width —
   *  feeds the SAME `trackStyleOverrides` channel
   *  `effectiveTreeControlRegionWidthPx` used to feed, verbatim. */
  readonly sideColumnPx: number;
  /** The board's own aspect-locked useful width at the current
   *  `rowHeightPx` — informational (a diagnostic/test fact), not itself
   *  written anywhere: the board's OWN grid track stays plain `elastic
   *  1fr` (`lyt-layout.gen.ts` root child "1") and absorbs CSS Grid's
   *  own complement once `sideColumnPx` (and boardRail's reservation)
   *  are subtracted — this module never overrides the board's track
   *  directly, per §3 step 3's own "consume, don't rebuild" framing. */
  readonly boardUsefulPx: number;
}

/**
 * GAP A: brings the ROOT split (board vs. side column) under the SAME
 * live-measurement authority `resolveSideColumnLiveLayout` already
 * applies to the side column's OWN interior (tree/controlPanel/
 * previewBoard) — closing the live-witness rig's flagship finding that
 * the panel could not dock at 1920×1080 even after every interior fix
 * landed, because the ROOT split's own un-dragged default never
 * consulted the board's aspect-locked demand at all.
 *
 * **The board's useful width.** `boardUsefulPx = max(0, rowHeightPx -
 * board.fixedSiblingSumPx)` — the board is a square (`aspect: 1`,
 * `lyt-layout.gen.ts`'s own `B` leaf); its useful width is bounded by
 * the row's own AVAILABLE HEIGHT, never by the row's width — past that
 * point, extra width renders as dead centered margin around the square
 * (`.lyt-board-cell`'s own `place-items: center`, `LytNode.vue`), the
 * exact "hoarding" shape the tree region was guilty of pre-cure, now
 * named for the board too (per this dispatch's own framing).
 *
 * **Non-sovereign candidate.** `naturalSideColumnPx = availableForSplitPx
 * - boardUsefulPx` — the IDENTICAL closed form
 * `useLytTrackCss.ts#trackCssValue`'s `board-priority-clamp` branch
 * already encodes as a CSS `calc()`, evaluated here numerically against
 * LIVE `rowWidthPx`/`rowHeightPx` instead of the browser's own
 * `calc(100vh - ...)`. Clamped to `[sideColumn.minPx,
 * maxRegionWidthPx]`, where `maxRegionWidthPx` additionally reserves
 * `boardFloorPx` for the board (mirrors
 * `computeTreeControlRegionDefaultWidthPx`'s own protective bound,
 * `state/layout-model.ts`, so this replacement default does not
 * regress that floor's protection at a pathologically narrow
 * viewport).
 *
 * **Deliberately NOT demand-forcing.** An earlier version of this
 * function additionally floored the candidate at the side column's own
 * live CONTENT demand (`max(demandPx, naturalSideColumnPx)`) — rejected
 * on review: that would force the side column past what the board can
 * actually spare, silently squeezing the board below its own useful
 * (square) size even when its natural yield genuinely can't cover the
 * panel's demand (the narrower-viewport case the acceptance arithmetic
 * table's own 1366×768 row names: "demotion remains honest"). This
 * function answers ONLY "how much can the row spare the side column
 * without the board hoarding past its own useful ceiling" — whether
 * that's enough to dock the panel is the INTERIOR solve's own question
 * (`resolveSideColumnLiveLayout`, fed by this function's own
 * `sideColumnPx` output as its `wrapperWidthPx` input), not this one's.
 *
 * **Sovereign.** The stored value wins verbatim — this function does
 * not change drag behavior, only the un-dragged default's derivation.
 *
 * **Row 2502/2503 review repair, condition C1.** `board.
 * naturalBoardCrossUnit` is checked FIRST, before any arithmetic —
 * `boardUsefulPx = rowHeightPx - fixedSiblingSumPx` is only the correct
 * closed form when the compiled track's own natural cross unit is
 * `'vh'` (height-based); a `'vw'` track (CASE A's own declared other
 * member, `lyt-layout-types.ts`) would need `rowWidthPx`, not
 * `rowHeightPx`, and this function does not implement that branch.
 * Refuses loudly (`MeasurementRefusalError`, naming the offending unit)
 * rather than silently computing a wrong number against the wrong
 * dimension — the exact class of divergence-from-the-CSS-branch this
 * module's own header names as the risk this field's own carry-through
 * exists to prevent.
 */
export function resolveRootSplitLiveLayout(input: RootSplitLiveLayoutInput): RootSplitLiveLayoutResult {
  if (input.board.naturalBoardCrossUnit !== 'vh') {
    throw new MeasurementRefusalError(
      `resolveRootSplitLiveLayout: board.naturalBoardCrossUnit is ${JSON.stringify(input.board.naturalBoardCrossUnit)}, ` +
        'not "vh" — this resolver\'s own closed form only mirrors the height-based CASE A branch ' +
        '(useLytTrackCss.ts); a "vw" (width-based) natural cross unit needs a different formula this ' +
        'function does not implement, and computing rowHeightPx-based arithmetic against it would silently ' +
        'diverge from the compiled CSS calc() it is meant to numerically twin (ADR-0002).',
    );
  }
  const boardUsefulPx = Math.max(0, input.rowHeightPx - input.board.fixedSiblingSumPx);
  if (input.sovereignWrapperPx !== undefined) {
    return { sideColumnPx: Math.max(0, Math.round(input.sovereignWrapperPx)), boardUsefulPx };
  }
  if (!Number.isFinite(input.rowWidthPx) || input.rowWidthPx <= 0 || !Number.isFinite(input.rowHeightPx) || input.rowHeightPx <= 0) {
    // Not yet measured: degrade to the side column's own compiled floor —
    // the same "not yet measured" convention every other solve in this
    // module shares.
    return { sideColumnPx: input.sideColumn.minPx, boardUsefulPx: 0 };
  }
  const availableForSplitPx = input.rowWidthPx - input.boardRailReservedPx - input.gapPx;
  const naturalSideColumnPx = availableForSplitPx - boardUsefulPx;
  const maxRegionWidthPx = Math.max(
    input.sideColumn.minPx,
    Math.min(input.sideColumn.maxPx, availableForSplitPx - input.boardFloorPx),
  );
  const sideColumnPx = Math.min(Math.max(Math.round(naturalSideColumnPx), input.sideColumn.minPx), maxRegionWidthPx);
  return { sideColumnPx, boardUsefulPx };
}

function resolveSideColumnLiveLayoutUnguarded(
  input: SideColumnLiveLayoutInput,
  treeTrack: Extract<LytTrackShape, { kind: 'elastic' }>,
): SideColumnLiveLayoutResult {
  if (!Number.isFinite(input.wrapperWidthPx) || input.wrapperWidthPx <= 0) {
    // Not yet measured: every quantity passes through unclamped — the
    // SAME "not yet measured" convention every deleted function shared.
    const treePx = input.treeSovereignPx ?? input.treeDefaultPx;
    return {
      treePx,
      others: input.others.map((o) => ({
        widgetId: o.widgetId,
        present: o.desiredVisible,
        candidatePx: o.desiredVisible ? fixedTrackPx(o.track, o.widgetId) : 0,
      })),
      diagnostics: [],
    };
  }

  // ── Presence: fold the compiled @demote threshold into RegionPresence.
  function reservationExcept(exceptWidgetId: string): number {
    let total = 0;
    for (const o of input.others) {
      if (o.widgetId === exceptWidgetId || !o.desiredVisible) continue;
      total += fixedTrackPx(o.track, o.widgetId) + input.gapPx;
    }
    return total;
  }

  const presentByWidgetId = new Map<string, boolean>();
  for (const o of input.others) {
    if (o.demote === null) {
      presentByWidgetId.set(o.widgetId, o.desiredVisible);
      continue;
    }
    // `o.demote.axis === 'h'` is guaranteed here — validated in the outer
    // `resolveSideColumnLiveLayout`, before this function is ever called.
    const fits = input.wrapperWidthPx >= o.demote.belowPx + reservationExcept(o.widgetId);
    presentByWidgetId.set(o.widgetId, fits ? o.desiredVisible : false);
  }

  // ── Tree's own candidate ────────────────────────────────────────────
  const sovereign = input.treeSovereignPx !== undefined;
  // Row 2501 repair: when tree's own live content demand undercuts its
  // compiled floor, the floor itself lowers to match it — including the
  // review's own obligation-2 demand-of-0 special case (see
  // `resolveEffectiveDemand`'s own header) — computed once, consumed by
  // BOTH the non-sovereign candidate clamp below and the sovereign
  // branch's own diagnostic-demand construction, so the two paths can
  // never disagree about what "tree's own floor/ceiling" currently mean.
  const effectiveTreeDemand = input.tree.maxUsefulPx !== null ? resolveEffectiveDemand(treeTrack.minPx, input.tree.maxUsefulPx) : null;
  const effectiveTreeMinPx = effectiveTreeDemand?.minPx ?? treeTrack.minPx;
  const effectiveTreeMaxUsefulPx = effectiveTreeDemand?.maxUsefulPx ?? null;

  let treePx: number;
  if (sovereign) {
    // `sovereign` is exactly `input.treeSovereignPx !== undefined` — TS's
    // own narrowing does not propagate that fact from the `const`
    // computed two lines above into this `if` branch, so the cast
    // restates a truth already established, not a bypass of one.
    treePx = Math.max(0, Math.round(input.treeSovereignPx as number));
  } else {
    let reservedPx = 0;
    for (const o of input.others) {
      if (presentByWidgetId.get(o.widgetId)) reservedPx += fixedTrackPx(o.track, o.widgetId) + input.gapPx;
    }
    const roomPx = input.wrapperWidthPx - reservedPx;
    // `effectiveTreeMaxUsefulPx`, not the raw `input.tree.maxUsefulPx` —
    // row 2501 obligation 2: a raw `0` reading must not become a `0`
    // ceiling (which would immediately re-clamp `treePx` back down to 0
    // via the `Math.min` below, undoing `effectiveTreeMinPx`'s own
    // demand-of-0 floor).
    const ceilingPx = effectiveTreeMaxUsefulPx ?? Number.POSITIVE_INFINITY;
    treePx = Math.max(effectiveTreeMinPx, Math.min(Math.round(roomPx), ceilingPx));
  }

  // ── Others' own candidates ──────────────────────────────────────────
  const outcomes: SideColumnRegionOutcome[] = [];
  let claimedPx = treePx;
  for (const o of input.others) {
    const present = presentByWidgetId.get(o.widgetId) ?? false;
    if (!present) {
      outcomes.push({ widgetId: o.widgetId, present: false, candidatePx: 0 });
      continue;
    }
    if (o.widgetId === 'previewBoard') {
      claimedPx += input.gapPx + fixedTrackPx(o.track, o.widgetId);
      outcomes.push({ widgetId: o.widgetId, present: true, candidatePx: fixedTrackPx(o.track, o.widgetId) });
      continue;
    }
    // Absorbs whatever the row has left, capped at its OWN compiled fixed
    // px (never grants MORE than its declared demand — the leftover slack
    // a content-demand-capped `tree` frees up is simply unclaimed here,
    // same as CSS Grid's own fixed track never growing past its declared
    // size) and floored at 0 (never negative — this is where the
    // sovereignty completion bites: `remainingPx` can fall below the
    // sibling's own fixed demand once `tree` is sovereign).
    const remainingPx = Math.max(0, Math.round(input.wrapperWidthPx - claimedPx - input.gapPx));
    outcomes.push({ widgetId: o.widgetId, present: true, candidatePx: Math.min(fixedTrackPx(o.track, o.widgetId), remainingPx) });
  }

  // ── FeasibleLayout / sovereignty ─────────────────────────────────────
  let diagnostics: readonly SovereignOverrideDiagnostic[] = [];
  if (sovereign) {
    // Row 2501 repair: `effectiveTreeMinPx`/`effectiveTreeMaxUsefulPx`
    // (computed above) replace the raw `treeTrack.minPx`/
    // `input.tree.maxUsefulPx` here — this is the EXACT construction site
    // the live witness caught throwing (`measured(tree, h): preferred
    // (110) exceeds maxUseful (109)`), because the raw live reading was
    // passed through UNCLAMPED while `min`/`preferred` stayed pinned at
    // the compiled floor. `effectiveTreeMinPx <= (effectiveTreeMaxUsefulPx
    // ?? +Infinity)` always holds by construction (including the
    // obligation-2 demand-of-0 case, where both pin to the SAME compiled
    // floor), so this can no longer self-contradict.
    const demands: Measured<string>[] = [
      measured({
        region: 'tree',
        axis: 'h',
        min: px(effectiveTreeMinPx),
        preferred: px(effectiveTreeMinPx),
        maxUseful: effectiveTreeMaxUsefulPx !== null ? px(effectiveTreeMaxUsefulPx) : null,
      }),
    ];
    const solved = new Map<string, RegionAllotment<string>>([['tree', { region: 'tree', axis: 'h', px: px(treePx) }]]);
    for (const o of input.others) {
      if (!(presentByWidgetId.get(o.widgetId) ?? false)) continue;
      const demandPx = px(fixedTrackPx(o.track, o.widgetId));
      demands.push(measured({ region: o.widgetId, axis: 'h', min: demandPx, preferred: demandPx, maxUseful: demandPx }));
      const outcome = outcomes.find((x) => x.widgetId === o.widgetId);
      solved.set(o.widgetId, { region: o.widgetId, axis: 'h', px: px(outcome ? outcome.candidatePx : 0) });
    }
    const result = resolveSovereignOverrides(
      demands,
      solved,
      [{ region: 'tree', axis: 'h', px: px(treePx), source: 'user-drag' }],
      input.screenClassId,
      { widthPx: px(input.wrapperWidthPx), heightPx: px(0) },
    );

    // Dispatch L4's own parked-fork closure (this module's own
    // `sideColumnCapacityStarvation` doc above): the row's OWN total claim
    // (tree's sovereign candidate plus every present sibling's own
    // reservation) can overflow `wrapperWidthPx` itself — with or without
    // a sibling for `resolveSovereignOverrides` to have diagnosed against.
    const totalRowClaimPx = outcomes.reduce(
      (sum, o) => (o.present ? sum + input.gapPx + o.candidatePx : sum),
      treePx,
    );
    const capacityStarved = sideColumnCapacityStarvation(totalRowClaimPx, input.wrapperWidthPx, input.screenClassId);
    diagnostics = mergeSideColumnCapacityDiagnostic(result.diagnostics, capacityStarved);
  }

  return { treePx, others: outcomes, diagnostics };
}
