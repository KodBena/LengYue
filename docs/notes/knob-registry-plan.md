# Knob Registry — Design Note

**Status:** `design-note: planned`. Picks up from
`qeubo-namespace-unification-plan.md` (which transitions to
`design-note: revised` per ADR-0005 Rule 8 in the same arc).
That document remains the canonical record of the qEUBO-driven
thinking that surfaced the registry shape; this document is
the canonical record of the **substrate-first reframing** the
2026-05-14 session produced and of the **infrastructure-first
implementation roadmap** chosen against the sequencing tension
the TODO entry of the same date named.

**Genre.** Infrastructure-and-implementation roadmap. The
predecessor note articulates the data shapes (KnobDecl, the
named-transform library, encode/decode flow) at length; this
note reframes their architectural role, names the consumer
protocol the substrate must support, and lays out the phased
implementation order.

**Date:** 2026-05-14.

**Author audience.** A future implementer, or a future reader
reconstructing why the registry has the shape it has rather
than the qEUBO-driven shape its predecessor implied.

---

## Amendment — 2026-05-14: `KnobDomain` enum correction

Per ADR-0005 Rule 8 (sibling revisions over silent edits): the
`KnobDomain` enum named in §3 below carries a category error.
The body of §3 is preserved as written for historical fidelity;
**the corrected enum and its rationale live in this amendment**,
and Phase 1 / 3a / 5 / 6 code already implements §3 as
originally written. The correction shipped as a remediation
commit on the `KodBena/feat/knob-registry` branch immediately
after the postmortem.

**What §3 below says (incorrect):**

```ts
domain: 'display' | 'engine' | 'review' | 'qeubo' | 'experimental';
```

**What `src/types.ts` carries post-remediation (correct):**

```ts
domain: 'display' | 'engine' | 'review' | 'palette' | 'experimental';
```

**Why.** `KnobDomain` answers "where does this knob live in the
user's mental model" — a UX taxonomy. `'qeubo'` named a
*consumer identity* (the same value used as
`ConsumerClaim.consumerId` in the claim API per §7). Mixing the
two on one enum collapsed the substrate-vs-consumer split this
note's §2 was shaped around. `'palette'` is the right successor
for analysis-environment parameters; qEUBO's involvement is
expressed by `KnobDecl.qeuboControlled: boolean` (already
correct in §3) and the claim API (already correct in §7).

**Full chain and lessons learned** in
`docs/notes/postmortem-knob-registry-qeubo-domain-2026-05.md`,
filed 2026-05-14. The contributing factors include both
spec-side (the enum shipped without §3 articulating what
`KnobDomain` is *for*, leaving `'qeubo'` unchallenged) and
implementation-side (closest-match enum selection that should
have flagged the missing category at Phase 5 implementation
time).

**Scope of the remediation commit:**

- `src/types.ts` — `KnobDomain` corrected.
- Migration 38 → 39 — rewrites every `qeubo.*` decl's
  `domain: 'qeubo'` to `'palette'`. Idempotent. The 37 → 38
  migration is left frozen per the append-only invariant; the
  walker reaches the corrected state at 38 → 39.
- `src/composables/useQeubo.ts` — `ensureKnobDecl` and
  `reconcileQeuboKnobs` produce `'palette'`. The reconcile
  short-circuit was extended to compare `domain` so stale
  decls are self-healed.
- i18n catalogs (en / ja / ko / zh-CN) — dropped
  `knobRegistry.domain.qeubo`, added `knobRegistry.domain.palette`.
- Tests — `tests/unit/store/migrations.test.ts` gains a 38 → 39
  describe block; `tests/integration/qeubo-knob-reconcile.test.ts`
  expects `'palette'` from reconcile output and exercises the
  stale-domain self-heal path.

The remediation does **not** rename the `qeubo.<name>`
KnobDecl id convention. The id is a substrate-internal handle
keyed by `useQeubo.knobIdForParam`; the rename surface would
touch `ensureKnobDecl`, `reconcileQeuboKnobs`,
`acquireExperimentClaims`, the claim Map's keys, and a coordinated
migration — all out of scope for fixing a UX-taxonomy bug. The
domain is the visible axis; the id stays as a substrate
implementation detail.

---

## 1. Motivation

User-controllable variables in the SPA today live in scattered
places: the Registry Editor (the `engine.katago.*` settings
tree, surfaced as typed leaves), the Other tab (the hue-offset
slider), the move-suggestion overlay (the move-filter
threshold slider), the per-card metadata panel (the four
fields from card-metadata arc 2), MintCardModal, the per-card
visits override in the review-session panel, and one-off
`<input type="range">` / `<input type="number">` sites
throughout the chrome. Other values that *should* be
user-controllable but currently are not include the ownership-
overlay opacity ceiling (lifted to a hardcoded `0.55` during
the 2026-05-13 polish-arc — the originating riddle of the
2026-05-14 session) and many entries from the magic-literals
audit inventory that read as preferences rather than
invariants.

The state is not bad — it is **incomplete**. The Registry
Editor competently surfaces typed leaves of
`profile.settings.*`. The chrome substrate (theme.css and
friends) competently consolidates aesthetic decisions. What is
missing is a **dedicated substrate for values that the user
might reasonably want to adjust at runtime** — values that are
neither theme-determined (chrome substrate's job) nor
invariant (named module-level constants per the magic-literals
audit's carve-out for band-3 domain literals), but
controllable.

A second motivation is the qEUBO consumer. qEUBO targets
`analysis_env.parameter_meta` today — a single bag of
controllable parameters indexed by flat key. The substrate
this note proposes is a generalisation: every controllable
value the qEUBO optimizer might want to vary becomes
addressable, regardless of where in the settings tree it
actually lives. The qEUBO Bayesian-optimization arc is one
load-bearing use case for the substrate, not its driver — the
substrate exists whether or not qEUBO is enabled.

**The substrate-vs-consumer reframing is the load-bearing
move of this note.** The predecessor plan's title positioned
qEUBO as the unification's driver. qEUBO is in fact normally
off (it ships with `QEUBO_ENABLED=False` by default, requires
gigabytes of Python ML libraries on the backend, and remains
in `[experimental]` state per FEATURES.md). A design that
treats qEUBO as load-bearing for the registry's basic shape
fails the test "what if qEUBO is never installed?" The answer
must be: the user-controllable-variable substrate still works
for every other consumer.

## 2. The substrate is one tier; consumers are another

The architecture has two strict tiers:

**The substrate layer** is the canonical record of which
values in the system are controllable, where they live, what
range they admit, what semantic identity they carry, and what
shape (scalar, vector, transform-projected) they take. The
substrate is consumer-agnostic. It supports any consumer that
can read or write a value through a stable interface.

**The consumer layer** sits above the substrate. Each consumer
declares which knobs it engages with, claims them for the
duration of its work, reads or writes their values through the
substrate's accessors, and releases them when done.

Three categories of consumer are immediately motivated:

- **The SPA UI consumer.** The user, mediated through chrome
  widgets — sliders for scalar knobs, bespoke per-knob widgets
  (gamut pickers, 2D pads, matrix editors) for vector knobs.
  The "unified scalar-slider surface" of the originating
  riddle is the SPA UI consumer's cross-domain editor.
- **The qEUBO consumer.** Active only when an experiment is
  running. Claims knobs marked `qeuboControlled`, drives them
  through the optimizer's search loop, releases them on
  experiment end. Currently the predecessor plan's worked
  example.
- **Programmatic / harness consumers.** Autonomous-SR
  scenarios, test harnesses, plugins. Claim knobs for the
  duration of their scenario; release.

A fourth category is plausibly future-relevant: a
**replay-on-bookmark consumer** that re-applies a stored
bookmark to the controlled knobs without an active optimizer
running. The substrate accommodates this without special-case
plumbing.

**Substrate is one substrate; consumers are many.** The
asymmetry is by design. Adding a new consumer (a hypothetical
hyperparameter-sweep harness, or a future "share parameters
with a friend" feature) requires no substrate change — only
the new consumer's claim/release protocol against the existing
substrate.

## 3. The KnobDecl shape

A knob is identified by a `KnobId` (branded `string`, per
ADR-0001's value-object discipline). Its declaration:

```ts
type KnobDecl = {
  /** Stable identifier; the wire-key prefix when this knob is qEUBO-controlled. */
  id: KnobId;

  /** Human-readable label for the editor surface. */
  label?: string;

  /** Knob domain — controls categorisation in the cross-domain editor. */
  domain: 'display' | 'engine' | 'review' | 'qeubo' | 'experimental';

  /**
   * Input vector declaration. Each entry declares one
   * dimension's range and optional sub-identifier. The
   * length of this array is the qEUBO search dimensionality
   * (`N`) when this knob is qEUBO-controlled, and the
   * dimensionality of the user's input vector when manually
   * controlled.
   */
  inputs: ReadonlyArray<{
    range: readonly [number, number];
    subId?: string;
    label?: string;
  }>;

  /**
   * Output paths — where the transform-projected values land
   * in the reactive `store`. Length `K` may exceed `N` when
   * the transform projects a smaller input space to a larger
   * output space.
   */
  outputs: ReadonlyArray<{
    path: StorePath;
    label?: string;
  }>;

  /**
   * Transform mapping input vector → output vector.
   * `'identity'` when `inputs.length === outputs.length`
   * and the user wants a one-to-one map (the most common
   * scalar-knob case).
   */
  transform?: KnobTransform;

  /**
   * Widget hint for the editor surface. When omitted, the
   * editor derives a widget from `inputs.length` plus
   * `transform`; see §6.
   */
  widget?: KnobWidget;

  /**
   * Optional qEUBO-control flag. When `true` AND a qEUBO
   * experiment is active, this knob participates in the
   * optimizer's search. When `false` or absent, the knob is
   * user-controlled-only. Default `false`.
   */
  qeuboControlled?: boolean;
};
```

The `KnobDecl` shape carries forward from the predecessor
plan without substantive change. Two minor additions: the
`domain` tag (drives the editor's cross-domain
categorisation; consumer-agnostic), and the `widget` hint
(drives editor dispatch; see §6).

Worth noting explicitly: **scalar knobs are the
`inputs.length === 1` case**. The substrate does not
privilege scalars structurally — they are the most common
instance of the shape, not the special case. The unified
slider-surface (the originating riddle) is the editor consumer
that specifically renders `inputs.length === 1` knobs as
sliders; other consumers (qEUBO especially) treat scalars and
vectors uniformly.

## 4. Transform library

Carried forward from the predecessor plan with no
substrate-level revision. The named transforms are:

- **`'identity'`** — `N = K`. The input vector is the output
  vector verbatim. Default when `inputs.length ===
  outputs.length` and no transform is specified.
- **`'linear'`** — `K × N` matrix; coefficient table lives as
  runtime data on the KnobDecl (not code). The editor
  surfaces the matrix as a widget for the user to author.
- **`'lockstep-hue-rotate'`** — scalar-driven vector
  transform; rotates a fixed family of hue anchors by a
  single offset. Drives the theme-anchor case the predecessor
  plan articulates.
- **`'fixed-luminance-arc'`** — scalar-driven vector
  transform; sweeps a one-parameter arc through CIELab
  preserving perceptual luminance. Drives the
  perceptually-coherent theme-tuning case.

User-authored transforms (JS-as-string in a sandbox) remain
out of scope for v1; the named library plus `'linear'` covers
the cases the predecessor plan motivated, and sandboxing
arbitrary code isn't worth the substrate-level complexity.

Adding a new named transform is a frontend code change, not a
runtime config change. The `KnobTransform` type is a
discriminated union over the named transforms; TypeScript's
exhaustiveness checking at the dispatch site is the
correctness witness (ADR-0002 in the small).

## 5. Path-walk accessors

Two pure functions form the substrate's read/write interface:

```ts
function readKnob(path: StorePath): number;
function writeKnob(path: StorePath, value: number): void;
```

Both walk the reactive `store` along the dot-separated path.
`writeKnob` writes through Vue's reactivity so downstream
consumers (CSS variables for theme, watchers for engine
config, the inline-edit panel's local refs, etc.) respond to
substrate-driven changes the same way they respond to manual
edits — there is no special "knob-driven write" pathway
distinct from "manual write."

**Failure modes (ADR-0002).**

- Type-mismatched leaves throw. A KnobDecl whose `outputs[i].path`
  resolves to a non-numeric leaf is a contract violation at
  decl-time; the migration that introduces a KnobDecl
  validates each path resolves to a number.
- Stale paths throw at startup. A KnobDecl whose path no
  longer resolves (a renamed setting, a deleted bag entry)
  fails loud at the substrate's initialization, not silently
  on first write attempt.

**Type safety.** The accessors take a `StorePath` —
nominally a `string` today, with the long-term direction being
a `Path<GlobalStore>` discriminated union over the literal
dot-paths the store admits. The full type-system shape is
deferred to v2 of this arc; v1 ships with `StorePath = string`
plus the startup-time validation as the correctness anchor.
The deferred path-type work is recorded in §14.

## 6. Widget dispatch

The slider widget is a **scalar-only primitive** by
construction: a one-dimensional UI control manages a
one-dimensional quantity. Rendering an N-dimensional vector
knob as N sliders — the RGB-as-three-sliders anti-pattern many
design tools fall into — misrepresents semantically-coupled
components as independent. Vector knobs require **bespoke
widgets per knob's domain**: a gamut / heatmap picker for a
colour knob, a 2-D pad for a two-parameter knob, a matrix
editor for a linear-transform coefficient table, etc.

The substrate is widget-agnostic. The KnobDecl declares the
*shape*; an editor consumer maps shape to widget. The editor's
dispatch policy:

- **`widget` hint present.** Use the named widget verbatim.
- **`widget` hint absent.** Derive:
  - `inputs.length === 1` → `'slider'`.
  - `inputs.length === 2 && transform === 'lockstep-hue-rotate'`
    → `'gamut-picker'`.
  - `inputs.length === 2` (other transforms) → `'two-d-pad'`.
  - `inputs.length > 2` → `'matrix-editor'`.

The hint exists so a KnobDecl can specify a different widget
than derivation would default to — for instance, a 2-D knob
whose two inputs are not semantically a hue-saturation pair
might prefer the explicit `'two-d-pad'` even though the
derivation default already lands there.

**The widget enum is closed.** `'slider'`, `'gamut-picker'`,
`'two-d-pad'`, `'matrix-editor'` is the v1 set; adding a new
widget is a frontend code change. The closed set is what
makes the dispatch exhaustively-checkable.

## 7. Ownership state machine

When multiple consumers may write the same knob, the
substrate carries a per-knob **current controller** property
naming who owns the knob right now. The state machine has
three states:

- **`unclaimed`**: default. The SPA UI consumer is the sole
  effective writer; the user's slider is responsive. Any
  consumer may claim.
- **`claimed-hard`**: a non-UI consumer holds exclusive
  control. The SPA UI's slider widget renders disabled with
  a tooltip naming the controller. Manual edits are
  refused at the widget layer. Only the holding consumer
  may release.
- **`claimed-soft`**: a non-UI consumer holds advisory
  control. The SPA UI's slider remains responsive. A manual
  edit transitions the claim to `unclaimed` (the user's
  action releases the soft claim on their behalf) — useful
  for transient scenarios where the consumer expects the
  user might want to override.

The substrate's API:

```ts
function claimKnob(knobId: KnobId, claim: ConsumerClaim): ClaimResult;
function releaseKnob(knobId: KnobId, consumerId: string): void;
function currentClaim(knobId: KnobId): ConsumerClaim | null;
function onClaimChange(callback: (knobId: KnobId, prev: ConsumerClaim | null, next: ConsumerClaim | null) => void): UnsubscribeFn;

type ConsumerClaim = {
  consumerId: string;        // 'qeubo' | 'autonomous-sr' | ...
  policy: 'hard' | 'soft';
  reason?: string;           // human-readable; surfaced in disabled-slider tooltips
};

type ClaimResult =
  | { kind: 'acquired' }
  | { kind: 'rejected'; reason: 'already-claimed'; holder: ConsumerClaim };
```

**Arbitration policy.** First-come-first-served. A claim
against an already-claimed knob fails loudly per ADR-0002 —
the requesting consumer is responsible for surfacing the
failure (e.g. qEUBO would refuse to start an experiment that
targets a knob another consumer holds, with a system message
naming the conflict). The substrate does not arbitrate
between competing claims; that's a consumer-policy concern,
not a substrate concern.

**Per-consumer policy mapping** is established at the
consumer's call site:

- **qEUBO** uses `'hard'` during an active experiment. The
  GP surrogate's data points are coherent only if the
  parameter ranges stay stable; manual mid-experiment edits
  would corrupt the optimization.
- **Autonomous-SR scenarios** use `'soft'`. The user may
  want to override a scenario's choices mid-run; the soft
  claim lets the user reclaim ownership by simply moving the
  slider.
- **Test harnesses / replay-on-bookmark** use `'soft'` or
  `'hard'` depending on the scenario; the consumer decides.

The state machine's `onClaimChange` callback is what makes
the SPA UI's slider widget reactive to claim transitions —
when qEUBO starts an experiment, every claim-changed event
fires, every targeted slider rerenders as disabled.

**Open question for implementation:** whether `ConsumerClaim`
should carry a *priority* field that allows a higher-priority
consumer to evict a lower-priority one's claim. The v1
recommendation is *no* — first-come-first-served is simpler
to reason about, and the consumer-policy mapping above keeps
practical conflicts rare. Revisit if a second non-UI consumer
ships and the conflicts become real.

## 8. Declarative vs imperative consumption — design space

The v1 substrate as documented above is **consumer-imperative**
at the claim layer (consumers call `claimKnob` /
`releaseKnob`; the substrate either acquires or rejects) and
**partially knob-declarative** at the rendering layer (the
`widget?` hint on `KnobDecl` is a knob-side statement of "I
want to live in widget X"). The two are not symmetric — a
knob can express widget preference, but cannot express
consumer preference. This section names the design space the
asymmetry sits inside so future extensions don't have to
rediscover it.

### Two complementary axes

The substrate's consumption protocol decomposes into two
axes:

**Consumer-imperative axis.** Consumers initiate. The claim
API is on this axis: a consumer says "I want this knob" and
the substrate dispatches accordingly. The knob is passive at
the consumption-protocol level — it doesn't choose its
consumer; the consumer chooses the knob. Today's v1 design
puts the claim API entirely here.

**Knob-declarative axis.** Knobs initiate. The `KnobDecl`
carries declarative intent at the rendering level
(`widget?`), the data level (`outputs.path`), the
optimization-eligibility level (`qeuboControlled?`), and the
categorisation level (`domain`). A knob-declarative
*consumer* model would let a knob say "I should be controlled
by consumer-class Y" or "I should be consumed via modality Z"
at declaration time, and the substrate dispatches consumers
accordingly.

The two axes are complementary, not mutually exclusive. A
mature substrate likely uses both: the imperative axis for
transient or scenario-driven claims (a qEUBO experiment that
varies *these specific knobs this run*; an autonomous-SR
scenario whose target set depends on session state), and the
declarative axis for stable structural facts about a knob
(which widget it belongs in, which optimization modality it's
compatible with, whether multiple writers are sane against
its semantics).

### ZeroMQ-style modality framing

A useful design vocabulary for future modality declarations
on `KnobDecl` is the **ZeroMQ socket-type taxonomy**, adapted
from messaging to value-distribution. The user surfaced this
analogy directly in the 2026-05-14 session; it's the right
shape because each ZeroMQ socket type names a *coupling
pattern* the substrate may want to express explicitly rather
than implicitly:

- **`PUB/SUB` — one-to-many broadcast.** One canonical
  writer; many readers via reactive subscription. Readers
  don't acknowledge; the writer doesn't know who's listening.
  This is the **implicit modality every v1 knob uses**, via
  the reactive `store` walk in `readKnob` / `writeKnob`. Vue's
  reactivity primitives match the pattern verbatim.
- **`REQ/REP` — synchronous request-response.** A knob whose
  value is computed on demand rather than stored. The
  "writer" is a function; consumers request a fresh
  evaluation each read. Could model derived knobs (whose
  value is a function of other knobs) or knobs with expensive
  lazy computation that shouldn't run unless someone asks.
- **`PUSH/PULL` — pipeline.** A knob that's part of a
  producer/consumer queue. The producer pushes values without
  knowing readers; readers pull. Could model knobs whose
  value flows from a measurement source — the engine emits
  per-tick values; the substrate buffers; consumers pull.
- **`EXCLUSIVE PAIR` — one-to-one bidirectional.** A knob
  with a single designated consumer; the substrate enforces
  exclusive coupling. Could model knobs where multi-consumer
  ownership would corrupt semantics (a "current experiment
  run-id" knob coupled to a single experiment manager; a
  "live debug-overlay target" knob coupled to its overlay).

The four modalities are not exhaustive — ZeroMQ has more
(ROUTER/DEALER, etc.) — but they cover the space densely
enough to start. A future `KnobDecl` extension might declare
`modality?: 'pub-sub' | 'req-rep' | 'push-pull' | 'exclusive-pair'`,
defaulting to `'pub-sub'` (the implicit shape v1 ships with).

### Worked example: a value the substrate can't host today

Consider the current visit count of an in-flight KataGo
query. Today the visit count lives ephemerally on the
analysis-service ledger; it's not user-controllable and
doesn't fit the substrate as v1 documents it (no `outputs.path`
in the store; not authored by a user; updated by the engine
and consumed by the queue-tooltip telemetry). But if the
substrate carried a modality field, this value could be
declared as a `'push-pull'`-modality knob with `outputs: [{
path: 'engine.activeQuery.currentVisits' }]`:

- The substrate would expose it through the same `readKnob` /
  subscription interface every other knob uses — the
  queue-tooltip telemetry would consume it through the
  registry rather than through a separate side-channel.
- The slider widget would gate off (the `'push-pull'`
  modality declares "no manual writes"); the substrate's
  consistency invariant doesn't even need a runtime check —
  the type system at the consumer layer makes manual writes
  to push-pull knobs unrepresentable.
- A future consumer (a "live-progress" indicator widget; a
  notification system; a per-session statistics aggregator)
  could subscribe through the same modality-aware interface
  without inventing a parallel registry for engine-emitted
  values.

The substrate becomes a **uniform interface for any value the
codebase wants other components to interact with** —
controllable values, derived values, pipeline-flowing values —
all under the same vocabulary. This is structurally what the
v1 substrate aims at; the modality axis is what unlocks the
non-user-controlled half of the space.

### What v1 commits to

The v1 substrate documented in §§3–7 is **forward-compatible
with all the extensions sketched here** by construction:

- **The `KnobDecl` shape is open to additive fields.**
  TypeScript optional properties; adding `modality?:` later is
  a backward-compatible change. Existing KnobDecls remain
  valid `'pub-sub'`-implicit knobs (the default-when-absent
  semantic) without retroactive amendment.
- **The claim API is consumer-imperative**, but it doesn't
  preclude a future declarative-affinity layer that
  pre-resolves which consumer should hold a given knob's
  claim based on the knob's declared modality. The
  imperative API stays as the low-level primitive; a
  higher-level dispatch can compose on top.
- **The widget dispatch already uses the hint-or-derive
  pattern** (§6). Future modality declarations can layer the
  same dispatch logic for consumer-affinity: a
  `'push-pull'`-modality knob's effective claim might
  default to the configured push-pull consumer (likely a
  derived-knob computation runner), with the hint as
  override.
- **The transform library is a closed enum** (§4); adding
  modality-aware transforms is a code change but a
  localised one.

The asymmetry — knobs partially declarative (widget),
consumers fully imperative (claims) — is **not load-bearing**.
It's an artifact of v1's scope. A future arc that fills in
the asymmetry can do so without disturbing the Phase-1
through Phase-6 implementation roadmap.

### What this section is NOT

It is not a commitment to ship modality extensions in the v1
arc. The roadmap of §11 closes at Phase 6; modality-axis
extensions are a separate arc, opened when a concrete
consumer-side need surfaces (the first push-pull-shaped
knob to want into the registry; the first req-rep-shaped
knob a domain consumer is willing to author). The discussion
exists here so:

- Future implementers don't accumulate "the registry would
  have wanted to do X but we can't get there from here"
  technical debt; the extension points are pre-named.
- The v1 substrate's design choices are visibly justifiable
  as one consistent point in a larger space rather than as
  the only possible substrate.
- A future user with the same intuition the originating
  session surfaced (declarative knob → widget binding,
  generalised to declarative knob → consumer modality) has a
  discussion anchor rather than having to re-derive the
  framing.

## 9. Editor surface

Three editor surfaces share the substrate:

**The cross-domain `KnobRegistryEditor.vue`** — new, the
originating riddle's ask. Lists every knob in the registry,
categorised by `domain`. Each row renders the per-knob widget
(slider for scalars, gamut / 2-D pad / matrix editor for
vectors per §6's dispatch). Disabled state derives from the
current claim. Search / filter as the registry grows. This is
the "where do my user-controllable variables live?" answer.

**Per-domain editors** continue to work:

- `RegistryEditor.vue` keeps surfacing the typed-leaf settings
  tree; KnobDecl outputs *write to the same tree*, so the
  registry editor reads them coherently.
- `PaletteEditor.vue`'s analysis-environment view continues
  to surface `analysis_env.parameter_meta` entries; those
  entries become KnobDecls (via migration) but the
  PaletteEditor's per-domain affordances stay.
- The Other tab's hue slider keeps its surface; the slider
  itself becomes a knob-driven widget (one of the first
  motivating cases for the magic-literals promotion sweep).

**Per-knob bespoke vector widgets** are SFC-per-widget files
under `src/components/knobs/`:

- `KnobSlider.vue` — the unified scalar widget.
- `KnobGamutPicker.vue` — the colour-domain bespoke widget.
- `KnobTwoDPad.vue` — generic 2D control.
- `KnobMatrixEditor.vue` — the linear-transform coefficient
  table editor.

The widget dispatch at the cross-domain editor renders the
appropriate SFC per knob. The bespoke widgets are
self-contained — they own their drag / click behaviour, their
value-to-pixel mapping, their accessibility hooks — and
expose the same prop / event interface (`v-model:value` over
the input vector).

## 10. Magic-literals promotion pipeline

The magic-literals audit (`docs/archive/notes/magic-literals-audit-inventory.md`,
closed 2026-05-03) explicitly carved out **band-3 domain
literals** as the audit's non-target — values like the
ownership-overlay opacity ceiling, geometry multipliers,
suggestion-colour palette intensities — leaving them as
"module-level named constants OR inline-justified." The knob
registry is the natural successor surface for the subset of
that residue that are **user-controllable preferences**
rather than design invariants.

The discriminator is not whether a value is "magic" but
whether the **user might reasonably want to adjust it at
runtime**:

- The ownership-overlay opacity ceiling (`0.55` since the
  2026-05-13 polish-arc) — yes, user-controllable. The
  originating riddle. → Promoted to a KnobDecl.
- `BOARD_PX` — no, design invariant. Stays named in
  `engine/constants.ts`.
- `stoneR = cell * 0.46` — no, geometry derivation. Stays.
- The watchdog animation duration (`500ms` keyframe) — yes,
  user-controllable (the user has noted the existing
  hardcoding feels arbitrary). → Promoted.
- The move-suggestion threshold cluster colour intensities —
  ambiguous; depends on whether the user wants to tune them
  or whether they're better thought of as palette decisions.
  Inspect at promotion time.

**The promotion pipeline** for each candidate:

1. Lift the literal to a registry leaf under a coherent
   namespace (typically `profile.settings.<domain>.<name>`).
2. Declare a KnobDecl naming the leaf as its single output
   path, with sensible range bounds and the `domain` tag.
3. Retarget the consumer (the SFC or composable that used
   the literal) to read from the leaf rather than the
   inline constant.
4. The new KnobDecl appears in the unified cross-domain
   editor automatically; the user can adjust it.

The pipeline is per-literal, single-PR-sized. The promotion
sweep (Phase 6 of the roadmap) closes the candidates one at a
time without a batched substrate change.

## 11. Sequencing — infrastructure-first

The TODO entry of 2026-05-14 named the sequencing tension
between (a) infrastructure-first — land the substrate then
promote scalars onto it; and (b) scalars-first — promote
scalars as registry leaves now, absorb onto KnobDecls when the
substrate lands. **This note commits to infrastructure-first**
per the user's explicit decision in the same session.

The rationale, recorded so the choice is durable:

- **Type-sanity primary motive.** The codebase's posture
  (per the user's authoring memory) is comprehensive type
  tightening; the scalars-first path produces interim
  registry leaves with no type-system witness for the
  substrate's eventual shape, accumulating drift that the
  later migration must clean up.
- **Migration shape coherence.** Scalars-first means the
  KnobDecl migration arrives later and must absorb literals
  the substrate didn't get to choose the placement of.
  Infrastructure-first means the substrate gets to choose
  the path-namespace convention up front; subsequent
  promotions snap into the convention without retrofit.
- **Audit-trail visibility.** A user-facing slider added
  scalars-first is opaque — the user sees a slider but not
  the substrate behind it. Infrastructure-first means the
  cross-domain editor exists by the time the first slider
  ships; the user can see the substrate's shape.
- **"Build it back the right way."** The user has named
  explicitly that they would call for a teardown if the
  infrastructure was judged poor. The knob registry *is* the
  teardown vehicle relative to today's ad-hoc state;
  shipping it incrementally as a substrate before any
  consumer-side code reaches a settled shape is the
  build-it-right move.

The cost is delayed gratification on the originating riddle
(the ownership-opacity slider doesn't ship until Phase 3).
The user has signalled acceptance of that cost.

## 12. Implementation roadmap

Six phases, each independently mergeable. Phase 1 and 2 form
the substrate proper; phases 3 through 6 are consumer-side.

### Phase 1 — Substrate primitives

Land the types, the path-walk accessors, the transform
library. No UI, no consumer migrations. The deliverable is a
testable library, not a feature.

- `src/types.ts` — `KnobId` (branded), `KnobDecl`,
  `KnobRegistry`, `KnobTransform` (discriminated union),
  `KnobWidget` (closed enum), `ConsumerClaim`.
- `src/lib/knobs.ts` — `readKnob`, `writeKnob`,
  startup-time path validation, the named-transform library
  (`identity`, `linear`, `lockstep-hue-rotate`,
  `fixed-luminance-arc`).
- `src/store/migrations.ts` — schema bump adding
  `profile.settings.knobs: KnobRegistry`, seeded empty.
  Existing `analysis_env.parameter_meta` entries do NOT
  migrate yet; that happens in Phase 5 alongside the qEUBO
  consumer migration.

**Tests.** Unit suite for `knobs.ts`:
- Path-walk correctness (`readKnob` / `writeKnob`).
- Each transform function over representative inputs.
- Startup-time validation: a KnobDecl with a bad path throws.
- A round-trip through `writeKnob` triggers reactivity.

### Phase 2 — Ownership state machine

Add the per-knob current-claim property and the consumer API
(`claimKnob` / `releaseKnob` / `currentClaim` /
`onClaimChange`). Still no UI; the deliverable is the state
machine plus its event surface.

- `src/lib/knobs.ts` (extend) — claim state, callback
  registry, the arbitration policy (first-come-first-served,
  loud failure on conflict).

**Tests.** Unit suite extending Phase 1:
- Claim and release lifecycle (`unclaimed` → `claimed-hard`
  → `unclaimed`).
- Conflicting claim raises loudly with the expected
  `ClaimResult.rejected` shape naming the holder.
- `onClaimChange` callbacks fire with the right transition
  payload.
- Hard vs soft policy: a manual `writeKnob` from outside the
  claim holder transitions a `soft`-claimed knob to
  `unclaimed`, but is refused (or returns a structured
  error) for a `hard`-claimed knob.

### Phase 3 — Scalar-slider unification (cross-domain editor)

The originating riddle's deliverable. New
`KnobRegistryEditor.vue` lists every knob with
`inputs.length === 1`, categorised by `domain`, rendered with
`KnobSlider.vue`. The motivating scalars are promoted onto
KnobDecls in this phase — Phase 3's PR is what makes the
ownership-opacity ceiling user-controllable.

- New `src/components/knobs/KnobSlider.vue`.
- New `src/components/KnobRegistryEditor.vue` — mounted as a
  new tab or a new section in an existing tab (call deferred
  to implementation time; the Other tab is the natural
  candidate given its current scope is gradient calibration
  + qEUBO bookmarks, both substrate-adjacent).
- Motivating-scalars-as-KnobDecls migration:
  - **Ownership-overlay opacity ceiling.** Lifted to
    `profile.settings.appearance.ownershipOpacityCeiling`;
    KnobDecl seeded under `domain: 'display'`,
    `range: [0, 1]`, default `0.55`. Consumer in
    `BoardWidget.vue::ownershipColor` retargeted to read
    the leaf.
  - **Move-filter threshold.** Already in
    `session.ui.moveFilterThreshold`. KnobDecl seeded over
    the existing leaf; consumer (the move-filter slider
    in chrome) retargeted through the substrate.
  - **Hue offset.** Already in
    `appearance.intensityHueShift`. KnobDecl seeded;
    consumer (the Other tab's slider) retargeted.
  - **Watchdog animation duration.** Currently the keyframe
    duration in `Toolbar.vue`. Lifted to
    `profile.settings.engine.katago.watchdogAnimationMs`;
    KnobDecl seeded; the keyframe duration becomes a CSS
    custom property bound to the registry leaf.

**Tests.** Integration:
- The cross-domain editor renders a synthetic knob registry.
- Slider drag triggers `writeKnob` through the substrate.
- Claim-state disable: a `claimed-hard` knob shows the
  disabled slider with the right tooltip.

### Phase 4 — Vector widget dispatch

The first bespoke vector widget. The theme-anchored
`lockstep-hue-rotate` colour knob is the natural starter (it
exists in the predecessor plan's worked examples and the
chrome-substrate already has the anchors).

- New `src/components/knobs/KnobGamutPicker.vue`.
- Widget dispatch hooked into `KnobRegistryEditor.vue` per
  §6's policy.
- One worked KnobDecl using the gamut picker (the
  theme-accent-rotation knob, per the predecessor plan's
  motivating example).

**Tests.** Integration:
- The gamut picker dispatches on the right KnobDecl shape.
- Drag on the gamut picker writes both output paths
  coherently (the `lockstep-hue-rotate` transform's joint
  effect is visible).

### Phase 5 — qEUBO consumer migration

The predecessor plan's body becomes implementable here.
`useQeubo` reads its controlled-parameter list from the
registry (knobs with `qeuboControlled: true`), wire keys
derive from KnobDecl input dimensions, bookmark schema
migrates to `Record<KnobId, number[]>`.

- `src/composables/useQeubo.ts` — refactor reads, writes,
  bookmark plumbing.
- `src/services/qeubo-service.ts` — verify wire-key
  derivation is consistent.
- Schema migration: bookmark `parameters` reshape; existing
  `analysis_env.parameter_meta` entries seed direct
  `N = K = 1` KnobDecls.

**Tests.** Integration + migration:
- An existing bookmark from the predecessor schema
  round-trips through the migration without value drift.
- An active experiment claims the right knobs (hard policy)
  and releases them on experiment end.
- A manual edit during an experiment is refused with the
  expected ADR-0002-flavoured loud failure.

### Phase 6 — Magic-literals promotion sweep

The discretionary phase. Per the magic-literals audit's
inventory plus session-surfaced candidates, sweep
preference-flavoured literals into the registry as
KnobDecls. Each promotion is its own small PR — the audit's
methodology applies (snap-by-cluster / decouple-via-alias /
co-tuned-constants from the audit inventory's working
principles section).

The sweep's deliverable closes when "every literal in the
codebase outside the substrate-named SSOTs is either in the
knob registry as a controllable knob OR carries a
`magic-literal:` justification comment per the audit's
established convention."

**No defined endpoint.** Phase 6 runs as long as candidates
accumulate. Its priority floats below in-flight feature work.

## 13. Migration

Schema version bumps:

- **Phase 1** introduces `profile.settings.knobs: KnobRegistry`,
  seeded empty.
- **Phase 3** introduces motivating-scalar KnobDecls and
  lifts hardcoded literals to registry leaves.
- **Phase 5** rewrites bookmark schema (`Record<string, number>`
  → `Record<KnobId, number[]>`) and seeds direct KnobDecls
  from `analysis_env.parameter_meta`.

Each migration is idempotent per the established pattern
(structuredClone the blob, mutate only what's missing,
return). Each pairs with a focused migration test in the
existing migrations test suite shape.

**Order matters.** Phase 5's migration must run *after* Phase
3's, since some Phase-3 motivating scalars may overlap with
qEUBO-controlled candidates (the same range a Phase-3
KnobDecl declares may want to be qEUBO-controlled). The
sequencing ensures the KnobDecl exists before the
qEUBO-control flag flips.

## 14. Type safety — what's in v1, what's deferred

**In v1:**
- `KnobId` branded.
- `KnobDecl` / `KnobRegistry` / `KnobTransform` /
  `KnobWidget` / `ConsumerClaim` fully typed.
- `KnobTransform` as a discriminated union with
  exhaustiveness-checked dispatch.
- Closed `KnobWidget` enum.
- Per-leaf type validation at the substrate's startup pass
  (a KnobDecl declaring an output path that doesn't resolve
  to a `number` throws).
- The named-transform library is end-to-end-typed.

**Deferred to v2:**
- `Path<GlobalStore>` — a discriminated-union type over the
  literal dot-paths the reactive store admits. With this in
  place, `KnobDecl.outputs[i].path` is compile-time-checked
  rather than startup-time-validated; a refactor that
  renames a setting fails the typecheck at every KnobDecl
  pointing at the renamed path. The compile-time win is
  large, but the implementation involves a non-trivial type
  derivation over the store schema, and the startup-time
  validation in v1 catches the same class of bug at one
  layer earlier than runtime. Deferred until the cost-benefit
  is clear.
- User-authored JS-as-string transforms. Out of scope
  permanently for safety reasons; named-library plus
  `'linear'` covers the cases.

## 15. Cross-references

- `docs/notes/qeubo-namespace-unification-plan.md` — the
  predecessor; transitions to `design-note: revised` in the
  same arc as this note. Its body remains the canonical
  record of the qEUBO-driven thinking that surfaced the
  KnobDecl shape; this note picks up the substrate
  reframing and the implementation roadmap.
- `docs/archive/notes/magic-literals-audit-inventory.md` —
  the audit closure that explicitly carves out band-3
  domain literals; the registry is the natural successor
  surface for the user-controllable subset of that residue.
  See §10.
- `docs/archive/notes/frontend-theming-plan.md` — the
  substrate-evolution principles (decouple-via-alias,
  snap-by-cluster) that the `lockstep-hue-rotate` and
  `fixed-luminance-arc` transforms compose with.
- `docs/archive/notes/qEUBO.md` — the qEUBO integration
  arc's successor-session map; this note's Phase 5 is the
  qEUBO consumer migration that transitions qEUBO's
  documentation entry to `design-note: implemented`.
- `docs/archive/dispatch/frontend-to-backend-qeubo-integration.md`
  — the qEUBO wire contract. This note preserves the
  contract verbatim; encode/decode stays in backend route
  code, transforms run frontend-side.
- ADR-0001 — value-objects-keep-readonly discipline;
  KnobDecl is a value object.
- ADR-0002 — fail-loudly applied to: path validation
  (startup), conflicting claims (consumer-side surfacing),
  transform exhaustiveness (TypeScript), widget dispatch
  exhaustiveness (TypeScript).
- ADR-0003 — band-1 placement for the substrate
  (`src/lib/knobs.ts` is truly domain-agnostic). Band-2 or
  band-3 for specific consumer-side widgets per their domain
  coupling.
- ADR-0005 Rule 8 — this note's sibling relationship to the
  predecessor plan.
- ADR-0006 — every new file carries the standard header.

## 16. Open questions deferred to implementation time

1. **Editor mount.** Where does `KnobRegistryEditor.vue`
   live in the tab structure? Other-tab extension is the
   natural candidate but a new top-level tab is also
   defensible. Settled when Phase 3's PR opens.
2. **Default range for promoted scalars.** Some lifts
   (ownership opacity, watchdog duration) admit obvious
   ranges; others (potential future promotions from the
   magic-literals residue) may need per-knob judgment.
   Per-knob call at promotion time.
3. **i18n for knob labels.** Each KnobDecl carries a
   `label` string; whether labels are i18n keys or literal
   strings is consistent-with-the-rest decision. Existing
   `cardMetadata.*` keys are the established pattern;
   knob labels probably follow.
4. **Whether to ship the cross-domain editor's claim-status
   diagnostics surface.** When qEUBO holds a hard claim on a
   knob, the slider is disabled with a tooltip naming the
   holder. Whether to *also* surface a "show me what's
   currently controlled" diagnostic view (a list of every
   claimed knob and its holder) is a polish call deferred to
   Phase 5 when the qEUBO consumer is the first consumer to
   issue hard claims.
5. **Consumer claim priority.** Whether claim priority is
   needed (allowing higher-priority consumers to evict
   lower-priority ones) ships as `no` in v1;
   first-come-first-served is the policy. Revisit when a
   second non-UI consumer ships and the conflicts become
   real.

## 17. Maintenance contract

This is `design-note: planned`. When Phase 1 lands, the
status line at the top transitions; Phase 1's PR and worklog
get named here. When the full arc closes (all six phases or
the arc is closed-with-deferral on Phase 6's open-ended
sweep), the status transitions to `design-note: implemented`
and the body becomes historical record.

If implementation reveals the design is wrong in some
load-bearing way, file a sibling `design-note: revised`
rather than silently editing this one. The predecessor plan's
own transition (today) is the worked example of this
discipline; future revisions follow the same shape.

The predecessor plan
(`qeubo-namespace-unification-plan.md`) carries its own
maintenance contract for its `design-note: revised` state.

## 18. License

Public Domain (The Unlicense).
