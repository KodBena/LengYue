/**
 * src/types/knobs.ts
 *
 * Knob-registry substrate vocabulary: `KnobDecl` and its input /
 * output / transform / widget shapes, the persisted `KnobRegistry`,
 * and the consumer-claim state machine (`ConsumerClaim` /
 * `ClaimResult` / `WriteResult` / claim-change events). The runtime
 * substrate lives in `src/lib/knobs.ts`; the design is
 * `docs/notes/knob-registry-plan.md`. Carved from the single-file
 * `src/types.ts` (2026-06-10, history-lessons audit §3.15); bodies
 * are verbatim from the pre-split file.
 *
 * License: Public Domain (The Unlicense)
 */

import type { Brand } from './ids';

// ── Knob registry (substrate-level) ───────────────────────────────────────────
//
// User-controllable variables in the SPA live in scattered places today
// (registry editor settings, the Other tab's hue slider, move-filter
// thresholds, per-card metadata, magic-literals residue). The knob
// registry is the substrate that brings them under one declaration
// vocabulary: each controllable variable is a `KnobDecl` declaring its
// input vector (R^N), output vector (R^K), the transform connecting
// them, and the widget shape that edits it. Consumers (the SPA UI's
// editor surfaces, qEUBO when active, autonomous-SR harnesses) sit
// above the substrate and read/write knobs through a stable interface.
//
// Phase 1 ships the type vocabulary, path-walk accessors, the
// named-transform library, and a seeded-empty registry on the profile.
// Phase 3+ promotes the originating-riddle scalars onto KnobDecls and
// wires the cross-domain editor surface. See
// `docs/notes/knob-registry-plan.md` for the full design.

/** Stable identifier for a registry-declared knob. */
export type KnobId = Brand<string, 'KnobId'>;

/**
 * Dot-separated path into the reactive `GlobalStore`, terminating at
 * a numeric leaf. v1 stays as `string`; the deferred v2 shape is a
 * `Path<GlobalStore>` discriminated union over the literal dot-paths
 * the store admits (so a renamed setting fails the typecheck at every
 * KnobDecl pointing at the old path). Until that lands, startup-time
 * validation in `src/lib/knobs.ts::validateRegistry` catches stale or
 * type-mismatched paths at one layer earlier than runtime.
 */
export type StorePath = string;

/**
 * UX taxonomy — categorises a knob by *where it lives in the user's
 * mental model*, not by *who might claim it*. The latter is
 * `ConsumerClaim.consumerId` plus `KnobDecl.qeuboControlled`; the
 * two are deliberately orthogonal per the substrate / consumer
 * split in `docs/notes/knob-registry-plan.md` §2.
 *
 * `'qeubo'` was a value here in the v1 spec; that was a category
 * error (consumer-name leaking into the domain enum) corrected on
 * 2026-05-14 — see
 * `docs/notes/postmortem-knob-registry-qeubo-domain-2026-05.md`.
 * `'palette'` is its successor: the analysis-environment / palette
 * subsystem where `analysis_env.parameter_meta`-derived knobs live.
 * qEUBO is one consumer that may hold a hard claim on palette
 * knobs during an experiment; that's `qeuboControlled` territory,
 * not `KnobDomain` territory.
 */
export type KnobDomain =
  | 'display'
  | 'engine'
  | 'review'
  | 'palette'
  | 'experimental';

/**
 * Closed widget enum. The substrate is widget-agnostic — the
 * `KnobDecl` declares the shape; the editor consumer maps shape to
 * widget per §6's dispatch policy. The slider widget is scalar-only
 * (`inputs.length === 1`) by construction; vector knobs require
 * bespoke widgets per their domain. Adding a new widget is a
 * frontend code change so dispatch stays exhaustively-checkable.
 */
export type KnobWidget =
  | 'slider'
  | 'gamut-picker'
  | 'two-d-pad'
  | 'matrix-editor';

/** One dimension of a knob's input vector. */
export interface KnobInputDecl {
  readonly range: readonly [number, number];
  /**
   * Optional sub-identifier disambiguating the dimensions of a
   * multi-input knob. When this knob is qEUBO-controlled the
   * wire key is `${id}.${subId}` per the predecessor plan's
   * encoding; for manual-only knobs the sub-identifier is editor
   * metadata only.
   */
  readonly subId?: string;
  readonly label?: string;
  /**
   * Optional cross-knob constraint: when set, the slider's
   * effective max is `min(range[1], readKnob(linkedKnob))` rather
   * than the static `range[1]`. The KnobSlider widget reads the
   * linked knob's value reactively, so the slider's max bound
   * tracks the linked knob's current value. The store leaf
   * itself is NOT auto-clamped — the user's preference is
   * preserved while the slider's effective range follows the
   * constraint. Wire-layer consumers should defense-in-depth
   * clamp at send time so the contract reaching the engine is
   * always coherent (see `analysis-service.ts`'s cadence-knob
   * sites for the worked example).
   *
   * `validateRegistry` (`lib/knobs.ts`) checks at startup that
   * any `maxFromKnob` reference resolves to an actual KnobDecl;
   * an unresolved reference is a loud failure per ADR-0002.
   *
   * Added 2026-05-15 with the KataGo cadence-knob pair
   * (`engine.first-report-during-search-after` bounded by
   * `engine.report-during-search-every`). One use case today;
   * the field is optional and absent on every existing decl.
   */
  readonly maxFromKnob?: KnobId;
  /**
   * Optional absolute lower bound, in the knob's native unit.
   * Distinct from `range[0]`: `range[0]` describes the knob's
   * intrinsic meaningful range from the SPA's perspective;
   * `minFloor` represents an external-constraint-induced lower
   * bound — typically an upstream protocol minimum or a
   * dependency-imposed limitation. The substrate keeps the two
   * separate so the SSOT for the upstream constraint is one
   * field rather than entangled with `range[0]`'s editorial
   * choice.
   *
   * When set, the KnobSlider widget's effective min is
   * `max(range[0], minFloor)` — drags below the floor pin to it.
   * The stored leaf is NOT auto-clamped (user preference is
   * preserved); the wire-layer consumer should
   * `Math.max(minFloor, …)` as defence-in-depth so the contract
   * reaching the dependency respects the floor regardless of
   * stored-leaf state. `analysis-service.ts`'s first-report-after
   * sites are the worked example: the KataGo protocol-documented
   * minimum (`KATAGO_FIRST_REPORT_FLOOR_S`) is exported from the
   * timing catalog (`lib/timing.ts`, §7) and clamped at send time.
   *
   * `validateRegistry` (`lib/knobs.ts`) checks that `minFloor` is
   * a finite number when present and (when both are set) does not
   * exceed `range[1]`. Per ADR-0002, an incoherent declaration is
   * a loud startup failure rather than a silent runtime fallback.
   */
  readonly minFloor?: number;
}

/**
 * One dimension of a knob's output vector. The path resolves into
 * the reactive store; `writeKnob` walks it and writes through Vue's
 * reactivity so downstream consumers (CSS variables, watchers, etc.)
 * respond the same way they do to manual edits.
 */
export interface KnobOutputDecl {
  readonly path: StorePath;
  readonly label?: string;
}

/**
 * Named transforms from the input vector (R^N) to the output vector
 * (R^K). Discriminated by `kind` so dispatch is exhaustively checked.
 * Parameter data the transform needs (the linear coefficient matrix,
 * the hue anchors, the luminance-arc waypoints) lives on the
 * discriminant itself rather than as code — adding a new instance is
 * a runtime data change, not a code change. The closed set of
 * `kind`s is what stays exhaustive.
 */
export type KnobTransform =
  | { readonly kind: 'identity' }
  | {
      readonly kind: 'linear';
      /** `K × N` coefficient matrix. `output[k] = Σ_n coefficients[k][n] * input[n]`. */
      readonly coefficients: readonly (readonly number[])[];
    }
  | {
      readonly kind: 'lockstep-hue-rotate';
      /**
       * Length-K vector of base hue anchors in degrees [0, 360). A
       * scalar input rotates every anchor by the same offset modulo
       * 360. Drives the theme-anchor case the predecessor plan
       * articulates.
       */
      readonly anchors: readonly number[];
    }
  | {
      readonly kind: 'fixed-luminance-arc';
      /**
       * Sequence of waypoints in the K-dimensional output space.
       * A scalar input in [0, 1] interpolates linearly through the
       * waypoints (with `t = 0` at `waypoints[0]`, `t = 1` at
       * `waypoints[waypoints.length - 1]`). Phase 1 uses linear
       * interpolation as the simplest correct implementation; a
       * later phase may refine to a perceptually-coherent arc
       * preserving CIELab luminance.
       */
      readonly waypoints: readonly (readonly number[])[];
    };

/** A registry-declared user-controllable variable. */
export interface KnobDecl {
  readonly id: KnobId;
  readonly label?: string;
  readonly domain: KnobDomain;
  readonly inputs: readonly KnobInputDecl[];
  readonly outputs: readonly KnobOutputDecl[];
  /**
   * Defaults to `{ kind: 'identity' }` when `inputs.length ===
   * outputs.length` and no transform is specified.
   */
  readonly transform?: KnobTransform;
  /**
   * Editor-side hint. Absent → derive from `inputs.length` plus
   * transform per the §6 dispatch policy.
   */
  readonly widget?: KnobWidget;
  /**
   * When `true` AND a qEUBO experiment is active, this knob
   * participates in the optimizer's search. When `false` or absent,
   * the knob is user-controlled-only.
   */
  readonly qeuboControlled?: boolean;
  /**
   * Optional render-order hint. Editor surfaces (the cross-domain
   * KnobRegistryEditor, the toolbar quick-access popover) sort by
   * ascending priority within each domain; `undefined` sorts last.
   * Smaller numbers render first — `priority: 0` is the user's
   * most-likely-needed knob.
   *
   * The field is also a hook for a future preference-learning
   * surface that promotes frequently-used knobs to lower numbers
   * automatically. Auto-promotion isn't shipped (a reordering that
   * happens behind the user's back would be jarring); the field
   * exists so that future consumer can write to it through the
   * same shape the user authors today.
   */
  readonly priority?: number;
}

/**
 * The persisted registry. Keyed by `KnobId` (as a string at the
 * `Record` type level; runtime values carry the brand). Phase 1
 * seeds empty; Phase 3+ populates as scalars promote off of
 * inline literals.
 */
export type KnobRegistry = Record<string, KnobDecl>;

/** Claim policy in the per-knob ownership state machine (§7). */
export type ClaimPolicy = 'hard' | 'soft';

/**
 * Active claim record held by a non-UI consumer (qEUBO during an
 * experiment, an autonomous-SR scenario, a test harness). Claims
 * are runtime-only — they live in the substrate's in-memory state,
 * never in the persisted profile.
 */
export interface ConsumerClaim {
  readonly consumerId: string;
  readonly policy: ClaimPolicy;
  /** Human-readable; surfaced in disabled-slider tooltips. */
  readonly reason?: string;
}

/** Return value of `claimKnob`. First-come-first-served arbitration. */
export type ClaimResult =
  | { readonly kind: 'acquired' }
  | {
      readonly kind: 'rejected';
      readonly reason: 'already-claimed';
      readonly holder: ConsumerClaim;
    };

/** Return value of `releaseKnob`. Only the holding consumer may release. */
export type ReleaseResult =
  | { readonly kind: 'released' }
  | {
      readonly kind: 'rejected';
      readonly reason: 'not-claim-holder';
      readonly holder: ConsumerClaim | null;
    };

/**
 * Caller identity for `writeKnobValue` — drives the per-state policy
 * dispatch. The SPA UI passes `{ kind: 'manual' }`; non-UI consumers
 * (qEUBO, autonomous-SR, test harnesses) pass their consumer id so
 * the substrate can verify they hold the claim.
 */
export type WriteContext =
  | { readonly kind: 'manual' }
  | { readonly kind: 'consumer'; readonly consumerId: string };

/**
 * Outcome of a policy-aware write. The four variants name the
 * states the substrate distinguishes:
 *
 *   - `written`: the write succeeded against an unclaimed knob, or
 *     a soft-claimed knob held by the writer, or a hard-claimed
 *     knob held by the writer. No side effects beyond the store
 *     mutation.
 *   - `written-after-soft-release`: a manual write on a soft-claimed
 *     knob; the substrate released the soft claim on the user's
 *     behalf (firing the standard claim-change event) before
 *     performing the write. The replaced claim is named so
 *     consumers can react.
 *   - `refused` / `hard-claim-held`: a manual write or a non-holder
 *     consumer write attempted against a hard-claimed knob. The
 *     store is unchanged.
 *   - `refused` / `consumer-not-claim-holder`: a consumer write
 *     attempted without holding the knob's claim. The store is
 *     unchanged. `activeClaim` names the current holder (null if
 *     unclaimed — consumer writes always require an active claim).
 */
export type WriteResult =
  | { readonly kind: 'written' }
  | {
      readonly kind: 'written-after-soft-release';
      readonly releasedHolder: ConsumerClaim;
    }
  | {
      readonly kind: 'refused';
      readonly reason: 'hard-claim-held';
      readonly holder: ConsumerClaim;
    }
  | {
      readonly kind: 'refused';
      readonly reason: 'consumer-not-claim-holder';
      readonly activeClaim: ConsumerClaim | null;
    };

/** Single argument to `ClaimChangeListener`. */
export interface ClaimChangeEvent {
  readonly knobId: KnobId;
  readonly previous: ConsumerClaim | null;
  readonly next: ConsumerClaim | null;
}

/**
 * Callback registered through `onClaimChange`. Fires synchronously
 * on every claim transition (claim, release, soft-release fallout
 * from a manual write).
 */
export type ClaimChangeListener = (event: ClaimChangeEvent) => void;

/** Returned by every `on…` subscriber registration. */
export type UnsubscribeFn = () => void;
