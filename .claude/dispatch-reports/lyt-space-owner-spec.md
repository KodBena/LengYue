# A Layout authority for the LengYue SPA — type design, measurement seam, migration map

**Status.** Spec-only. No code was changed; no commit was made. Written against
`lyt-phase2` as-is.

**Charter.** `.claude/dispatch-reports/lyt-final-opus-review.md`, read end to end —
its diagnosis (classes 1/2/3/4/8 are one disease: the SPA has no owner of space)
is this document's premise, not re-argued here.

**Reading discipline, disclosed honestly per the umbrella `CLAUDE.md`'s ADR-0002
corollary.** Read end to end before any claim below: the Opus review; ADR-0000
(`docs/adr/0000-*.md`); ADR-0019 (`docs/adr/0019-appendix-ui-proscriptions.md`,
including its C1–C29 synopsis and full Part 2); `frontend/src/state/layout-model.ts`
(1173 lines, both halves); `frontend/src/state/lyt-layout-types.ts`;
`frontend/src/components/chrome/LytNode.vue`; `frontend/src/state/lyt-layout.gen.ts`
and `lyt-layout-portrait.gen.ts` (both, in full); `frontend/src/composables/chrome/
useResizablePanel.ts` (858 lines, in full); `.claude/dispatch-reports/
lyt-relations-c3-rewrite.md` (in full, as the "relations-first amendment" summary
the charter named). **Partially read, disclosed:** `frontend/src/App.vue` (2047
lines) — the corner-chrome/overlay-stack template and CSS block (lines 1100–1240,
1520–1760) and a `grep` census of every `LytNode`/presence/corner-chrome reference
were read; the script-setup body computing `lytPresenceOverrides`,
`lytTrackStyleOverrides`, `lytPresenceClassDefaults`, and the rest of the ~2000-line
file were not read end to end — claims about App.vue's *wiring* below are grounded
in the sections actually read and in `useResizablePanel.ts`'s own header (which
names its own consumers precisely), never in the unread remainder.
`research/lyt/emit_layout_tree.py` — only its module docstring (≈160 lines) was
read, per the charter's own scoping ("output shape"), not its ~1200-line body;
claims about it are about its *output shape and disclosed scope narrowings*, which
the docstring states explicitly, not about its implementation. Every claim below
is tagged **WITNESSED** (grounded in one of the files above) or **UNEXERCISED**
(a design choice not checked against running code) at the point it matters most,
not exhaustively at every sentence.

---

## 0. What already exists and must be consumed, not replaced

Before designing anything new, the load-bearing fact this whole spec turns on:
**the LYT compile-time side already answers most of Rule 2(a)'s question for
static facts.** WITNESSED — `lyt-relations-c3-rewrite.md` §1/§2 and the two
`.gen.ts` files:

- Every leaf's `min` is either a measured DOM fact (`facts.generated.json`,
  `method: playwright-boundingBox`) or a disclosed literal estimate
  (`facts.residue.json`, `method: read-constant`), reached through the `.lyt`
  grammar's relation primitives (`read-constant`, `width-of`, `height-of`,
  `max-over`, `sum-of`, `pack-rows`). `A_engine_eval`/`A_engine_health` — the
  review's own "534px need against a 139px allotment" Class-1 witness
  (`ToolbarEngineMetrics.vue`'s header, review §Class 1) — are, as of the C3
  rewrite, `{ kind: 'fixed', px: 139 }` in **both** compiled programs, with a
  real `envelopeStates` array carrying the five connected-latency-digit facts
  the 139px is `max-over`'d from. This is *already* the honest, measured floor
  the review asks for at that one site.
- `LytTrackShape` (`lyt-layout-types.ts`) already has a **capped-elastic**
  member — `{ kind: 'elastic-capped', minPx, maxPx }` — structurally identical
  to what a `maxUseful` ceiling requires. It exists in the type today and is
  simply **unpopulated** by either encoding: every elastic leaf in both
  `.gen.ts` files (`tree`, `A_engine_queue`, `otherBand`, `CP-library`/
  `CP-cards`'s own T-pin contributors) is plain `{ kind: 'elastic', minPx,
  frWeight }` — **no `maxPx` at all**, i.e. `max inf` in the DSL. This is Class
  1's mechanism named exactly: `tree`'s track is `elastic { minPx: 110,
  frWeight: 1 }` in landscape (`lyt-layout.gen.ts` path `2.3.0`) — nothing
  stops it from claiming the control panel's freed 664px the instant that
  Exclusive demotes, which is the review's own "613px tree, absent control
  panel" witness (§Class 1, `02-workspace-1920.png`).
- Overflow is **partially** already a compiled fact, but leaf-only:
  `LytLeafNode.content: 'bounded'|'designed'|'unbounded'|null` and
  `.scrollAxes: readonly LytAxis[]` drive `useLytOverflowCss.ts`'s
  `leafOverflowStyle` (referenced in `LytNode.vue`'s own header, "Derived
  overflow"). **`LytBlackboxNode` and `LytExclusiveChild` carry neither
  field** (confirmed by reading `lyt-layout-types.ts` directly: `LytBlackboxNode`
  has only `kind/widget/tag/childWidgets/demote`). Every "collapsed" composite
  — `SP_session`'s six-tab settings blackbox, `CP-analysis`'s nine-leaf
  analysis blackbox — is therefore **structurally outside** the overflow
  contract: the mounted Vue component (`SettingsPane.vue`,
  `AnalysisDashboard.vue`) manages its own CSS overflow with no compiled fact
  governing it at all. **This is the exact mechanism of the review's Settings
  amputation** (§Class 2: eight controls below the viewport, `.lyt-leaf-cell`
  measured `auto` under Other and `visible` under Settings in the same
  session) — Other's `otherBand` leaf is a genuine, opened LYT leaf with
  `content: 'unbounded', scrollAxes: ['v']`; Settings' interior is not a leaf
  at all, it is inside a blackbox whose interior escaped the LYT contract at
  the `_build_node` Exclusive-collapse boundary the docstring names
  (`emit_layout_tree.py`'s own "SETTINGS OPENED LIVE" / "ANALYSIS...remains
  valid" sections).
- The corner is **not** ungoverned by accident either — it is two
  independent, hand-placed `position: fixed` containers. WITNESSED,
  `App.vue` lines 1139 (`#lyt-overlay-stack`) and 1524 (`#lyt-corner-chrome`),
  plus the CSS block at 1685–1734: `#lyt-overlay-stack`'s own `bottom` offset
  is a **hand literal** the comment itself names as "a conservative estimate
  ... rather than a swept number," stacked above `#lyt-corner-chrome` by a
  guessed `+40px`. This is precisely the "z-index is not an arbitration"
  finding (review §Class 4) — WITNESSED at the exact two elements that
  collide in the review's own screenshot evidence.

The consequence for design: **the type this spec proposes is mostly an
extension of vocabulary the compiled program already has** (a real `maxPx` on
the elastic tracks that lack one; a `content`/`scrollAxes` pair on blackbox and
Exclusive-child nodes; a genuine corner-registration list replacing two ad hoc
`position: fixed` divs) plus **one new Vue-runtime type** (`FeasibleLayout`)
that validates the *realized* allotment — compiled defaults reconciled with
runtime measurement and sovereign user overrides — before it is rendered. It
is not a replacement compiler.

---

## 1. Type design

### 1.1 `Measured<Region>` — a region's own honest demand

```ts
/** A CSS-pixel measure, always non-negative, always finite. Branded so a
 *  bare `number` (viewport px, aspect ratio, ch) cannot be passed where a
 *  measured content demand is required — ADR-0012 P1: a region's demand and
 *  its allotment are different currencies until this type says otherwise. */
export type Px = number & { readonly __brand: 'Px' };

export function px(n: number): Px {
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`px(): ${n} is not a finite, non-negative pixel measure (ADR-0002).`);
  }
  return n as Px;
}

/** How a region is permitted to relate to space it does not need or does
 *  not fit in — see §1.3. Required on every `Measured<Region>`; there is no
 *  permissive default (review §Class 2's own diagnosis: "the safe value is
 *  not the default"). */
export type OverflowDiscipline =
  | { readonly kind: 'fit' }
  | { readonly kind: 'scroll'; readonly axes: readonly LytAxis[] };

/** A region's own honestly-supplied demand, per axis it participates in.
 *  Never guessed: `min`/`preferred`/`maxUseful` are each traceable to a
 *  fact (§2) — a compiled LYT relation, a build-time probe, or a runtime
 *  measurement — never a round literal invented at this layer. */
export interface Measured<Region extends string> {
  readonly region: Region;
  readonly axis: LytAxis;
  /** Smallest extent the region can render without violating its own
   *  overflow discipline (a `fit` region below `min` would clip or
   *  overlap its own content; a `scroll` region below `min` would show
   *  nothing usable in the viewport before scrolling). */
  readonly min: Px;
  /** The extent the region would choose if space were free — SOLELY
   *  informational for `fit`/`scroll` allocation (the solver in §1.2
   *  never needs to consult it to be feasible), but load-bearing for a
   *  human-facing diagnostic ("X wants Ypx, has Zpx") and for a future
   *  fair-share tie-break policy question (§5, open). */
  readonly preferred: Px;
  /** The largest extent whose ADDITIONAL px past this point renders no
   *  more of the region's own content — i.e. genuinely wasted space if
   *  granted. `null` means the region has a genuinely unbounded natural
   *  demand along this axis (an unbounded list, free-flowing prose) —
   *  distinct from "not yet measured," which is a constructor refusal,
   *  never a silent `null`. THE decisive field Class 1 names as
   *  currently absent from the codebase; see §2 for who supplies it. */
  readonly maxUseful: Px | null;
}
```

**Invariant, named.** `min <= preferred <= (maxUseful ?? +Infinity)`, checked
at construction (`measured()`'s sole factory below), refused loudly with the
three offending numbers named — never silently reordered or clamped.

```ts
export function measured<R extends string>(input: {
  region: R; axis: LytAxis; min: Px; preferred: Px; maxUseful: Px | null;
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
```

**Closure statement (ADR-0000 2026-07-02 amendment).**

- *Invariant, most general form:* a region's own three-point demand is
  internally ordered, and its ceiling — where one exists — is denominated in
  the same currency (measured CSS px of the region's *own rendered content*,
  never a round literal, never a proxy unit) as its floor.
- *Quantification universe:* **both axes** (`axis: LytAxis` is a required
  field, not an assumption of width-only — the review's own explicit
  correction, §3's quantification note, "a width-only fix regresses on the
  next pass"); **every sibling surface** — in-flow LYT leaves, blackbox
  interiors once given their own `Measured` entries (§3 step 2), fixed corner
  overlays (§1.4), modal/popover boxes (§1.5), and chart containers (the
  ECharts zero-extent warning is the same missing join at the leaf, review
  §Class 1) — because `Measured<Region>` is generic over `Region extends
  string`, not `LytLeafId` alone; a `CornerStack` entry and a modal both
  construct their own `Measured<'presence-menu'>` / `Measured<'mint-card'>`
  the identical way an LYT leaf does. Nothing named here is width-only,
  fixed-surface-only, or in-flow-only.
- *Denomination check:* `Px` is a branded, non-negative, finite CSS-pixel
  measure minted only by `px()`; a `maxUseful` sourced from a round literal
  rather than a traced fact (§2) is a **review-caught**, not
  construction-caught, violation — the type cannot itself verify provenance,
  only well-formedness (see §2's "single home per fact" for the mechanized
  half of this check).

**What this makes unrepresentable.** A region with a `maxUseful` smaller than
its own `preferred`, or a `min` exceeding its own `preferred` — the exact
shape of the "534px need against 139px" mismatch, except now caught at
`measured()`'s own call site instead of discovered by a live-engine
screenshot. A region **without** a declared `OverflowDiscipline` cannot be
constructed at all (no `content`-less/`scrollAxes`-less blackbox interior,
closing the exact gap named in §0's third bullet).

### 1.2 `FeasibleLayout` — the validated whole-screen assignment

```ts
export interface RegionAllotment<Region extends string> {
  readonly region: Region;
  readonly axis: LytAxis;
  readonly px: Px;
}

/** Named per-region diagnostic — the review's own "not enough width right
 *  now" guess, replaced by a computed, specific refusal (ADR-0002; ADR-0019
 *  C8's required fields). Never bare prose: every field is structured so a
 *  presence-menu hint or an overlay banner can render it directly. */
export interface StarvationDiagnostic {
  readonly kind: 'starved' | 'hoarding';
  readonly region: string;
  readonly axis: LytAxis;
  readonly demandPx: Px;   // the starved region's own min, or the hoarder's maxUseful
  readonly grantedPx: Px;  // what the assignment actually gave it
}

/** The Layout authority's sole output type. Never constructed by a literal
 *  object — only `FeasibleLayout.solve()` (or its refusal) produces one.
 *  `null` (a legal, first-class outcome — not thrown) covers "this
 *  geometry cannot honor every region's own min without violating some
 *  other region's own maxUseful," per ADR-0000's "refused loudly, names
 *  which region starved and which hoarded." */
export class FeasibleLayout<Region extends string> {
  private constructor(
    public readonly allotments: ReadonlyMap<Region, RegionAllotment<Region>>,
    public readonly screenClassId: LytScreenClassId,
    public readonly viewport: { readonly widthPx: Px; readonly heightPx: Px },
  ) {}

  /** The sole constructor. `demands` is every region's own `Measured<Region>`
   *  for every axis it participates in (§2 supplies these); `solveAxis` is
   *  the existing LYT/CSS-Grid solve (§3: this wraps the compiler's output,
   *  it does not re-derive it) that produced a candidate allotment per
   *  region per axis BEFORE this validation runs. Returns the validated
   *  layout, or a non-empty list of `StarvationDiagnostic` — never a partial
   *  or best-effort `FeasibleLayout`. */
  static validate<R extends string>(
    demands: readonly Measured<R>[],
    candidate: ReadonlyMap<R, RegionAllotment<R>>,
    screenClassId: LytScreenClassId,
    viewport: { widthPx: Px; heightPx: Px },
  ): FeasibleLayout<R> | { readonly refused: readonly StarvationDiagnostic[] } {
    const diagnostics: StarvationDiagnostic[] = [];
    for (const d of demands) {
      const got = candidate.get(d.region);
      if (got === undefined || got.axis !== d.axis) continue; // region absent this class — §1.3/§3
      if (got.px < d.min) {
        diagnostics.push({ kind: 'starved', region: d.region, axis: d.axis, demandPx: d.min, grantedPx: got.px });
      }
      if (d.maxUseful !== null && got.px > d.maxUseful) {
        diagnostics.push({ kind: 'hoarding', region: d.region, axis: d.axis, demandPx: d.maxUseful, grantedPx: got.px });
      }
    }
    if (diagnostics.length > 0) return { refused: diagnostics };
    return new FeasibleLayout(candidate as ReadonlyMap<R, RegionAllotment<R>>, screenClassId, viewport);
  }
}
```

**Named invariant.** No region's allotment sits below its own `min`; no
region's allotment sits above its own `maxUseful` where one is declared.
Both checked in the same pass over the same `demands` set, so a "starved +
hoarding" pair (the review's own canonical instance — the tree hoarding 613px
while the control panel starves at 0) surfaces as **two diagnostics from one
`validate()` call**, not two separately-triggered code paths that could
disagree.

**Closure statement.**

- *Invariant:* every constructed `FeasibleLayout` satisfies
  `min <= allotment <= (maxUseful ?? +Infinity)` for every region that
  declared a demand on the axis it was allotted.
- *Quantification universe:* every region with a `Measured` entry, on every
  axis it declared one — §1.1's universe, inherited. Presence is folded in
  explicitly (§1.3), not left as a separate boolean the validator doesn't
  see: an absent region contributes **no** demand this pass (its `Measured`
  entry, if any, is simply not consulted), so "demoted to zero" and "granted
  its floor" are never confusable outcomes of the same function.
- *Denomination:* `Px`, inherited from `Measured`.

**What this makes unrepresentable.** A *rendered* screen where one region is
below its own stated floor while another sits above its own stated ceiling —
the review's flagship 1920×1080 finding (control panel absent for lack of
width; tree panel holding 613px of its own 60px content) cannot arise from a
constructed `FeasibleLayout`; it can only arise from a `refused` result the
caller is contractually required to handle (TypeScript's discriminated
return type has no silent "ignore the refusal and render anyway" path — a
caller must narrow on `'refused' in result`).

### 1.3 Presence as an allotment of zero, not a second boolean

Per the review's own quantification note (§3, "presence/absence"): a demoted
or toggled-off region is **not** a value absent from `demands`; it is a
region whose `candidate` allotment is `0px` and whose `Measured` entry is
still present, checked the same way as everything else. Concretely:

```ts
export type RegionPresence<Region extends string> =
  | { readonly kind: 'present' }
  | { readonly kind: 'absent'; readonly reason: 'user-toggle' | 'demoted' };
```

A region resolved `absent` contributes a `candidate` allotment of exactly
`px(0)` with **no** `Measured` check run against it (an absent region has no
"starved at 0" diagnostic — that would be indistinguishable from a genuine
zero-width bug); a region resolved `present` is checked normally, including
against its own `min`. This is the type-level fix for the review's own
"`Not enough width right now`... with the checkbox still checked" finding
(§Class 1): today `presenceOverrides`/`presenceDefaultVisible`
(`LytNode.vue`) and `demote`/`resolveWidthConditionalPresence`
(`layout-model.ts`) are two independently-consulted facts reaching the SAME
zero-or-nonzero outcome through two different code paths; `RegionPresence`
merges them into one discriminated fact `FeasibleLayout.validate` reads once.

### 1.4 `CornerStack` — the same type applied to fixed surfaces

Per the review's own diagnosis (§Class 4's cure: "fixed overlays become
regions with a measure and an allotment like everything else"), a corner
surface is a `Measured<Region>` too — its axis is always `'v'` (surfaces
stack vertically in one corner), its `min`/`preferred` are its own rendered
content height, and its `maxUseful` is typically `preferred` (a presence
menu does not usefully grow). The **new** piece is the stacking order and
anchor, which `Measured` alone doesn't carry:

```ts
export type CornerAnchor = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';

export interface CornerStackEntry<Region extends string> {
  readonly region: Region;
  readonly anchor: CornerAnchor;
  /** Stacking order within one anchor, ascending = closer to the screen
   *  edge. Two entries at the same anchor MUST have distinct order values
   *  — a tie is a construction refusal (see `CornerStack.build` below),
   *  the direct fix for `#lyt-corner-chrome` and `#lyt-overlay-stack`
   *  being two SEPARATE fixed containers with a hand-guessed offset
   *  between them (App.vue lines 1139/1524/1685–1734, §0). */
  readonly order: number;
  readonly measured: Measured<Region>; // axis is always 'v' for a corner entry
  /** Whether this entry claims stacking space even while visually collapsed
   *  to an icon/pill (`reserves: true`, e.g. the presence-menu trigger) or
   *  contributes zero height until opened (`reserves: false`, e.g. an
   *  expandable log panel) — the review's own witnessed collision
   *  (SystemLogPanel expanding over the presence menu, §Class 4) is exactly
   *  a `reserves: false` entry's expansion not being accounted for by its
   *  neighbor's own stacking math; `CornerStack.layout()` (below) makes
   *  that accounting the SAME per-entry rule every corner surface gets,
   *  not a hand-tuned `+40px`. */
  readonly reserves: boolean;
}

/** One `CornerStack` per anchor, built once from every registered entry —
 *  replaces `#lyt-corner-chrome` + `#lyt-overlay-stack` as two independent
 *  `position: fixed` divs with one owner that lays every entry out in a
 *  single flow. */
export class CornerStack<Region extends string> {
  private constructor(private readonly ordered: readonly CornerStackEntry<Region>[]) {}

  static build<R extends string>(entries: readonly CornerStackEntry<R>[]): CornerStack<R> {
    const byAnchor = new Map<CornerAnchor, Map<number, R>>();
    for (const e of entries) {
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

  /** Every entry's own top offset from its anchor edge — the running sum of
   *  every LOWER-order entry's own CURRENT rendered height (its live
   *  `preferred`, which for an expandable entry like the system log IS its
   *  expanded height while expanded) plus a fixed gap. This is the one
   *  computation `#lyt-overlay-stack`'s hand-guessed `+40px` was standing
   *  in for. */
  layout(gapPx: Px): ReadonlyMap<Region, Px> {
    const offsets = new Map<Region, Px>();
    let running = px(0);
    for (const e of this.ordered) {
      offsets.set(e.region, running);
      running = px(running + e.measured.preferred + gapPx);
    }
    return offsets;
  }
}
```

**Closure statement.** *Invariant:* within one anchor, stacking order is a
total order (no two entries share an `order` value) and every entry's own
top offset equals the sum of every lower-order entry's live height plus one
gap — so two surfaces cannot occupy the same rectangle by construction, the
review's own required cure. *Quantification universe:* every fixed corner
surface named in the review's `corner-chrome`/`overlay-stack` census (19 + 10
nodes) — the presence menu, system-log panel and its toggle, the debug pill,
the board-rail popover trigger, the control-panel summon trigger — all
become `CornerStackEntry` registrations at one anchor
(`bottom-right`, matching today's sole occupied anchor), not four separate
`position: fixed` placements. *Denomination:* `Px`, inherited.

**What this makes unrepresentable.** Two corner entries whose rendered boxes
overlap in the stacking direction — the review's own witnessed defect
(SystemLogPanel burying the presence popover's rail-style select and
Default-layout button, Playwright's own actionability-engine occlusion
report, §Class 4) cannot arise from a `CornerStack.layout()` result, because
every entry's offset is derived from its neighbors' *current* height, not a
literal estimated once and never re-measured.

### 1.5 The overlay primitive — one dismissal contract

```ts
export type OverlayKind = 'modal' | 'popover';

export interface OverlayContract {
  readonly kind: OverlayKind;
  readonly open: boolean;
  /** Every dismissal channel this ONE primitive owns — a construction site
   *  cannot select a SUBSET (e.g. "everything but Escape"); the fields are
   *  all required, so an overlay author who wants a DIFFERENT dismissal
   *  policy is naming an exception explicitly (a `false`), never silently
   *  omitting a channel the way the review found (learn-path modal: no
   *  Escape; control-panel popover in portrait: no Escape, contradicting
   *  FEATURES.md's own promise, §Class 8). */
  readonly dismissal: {
    readonly escape: boolean;
    readonly outsideClick: boolean;
    readonly explicitCloseControl: boolean; // the primitive REQUIRES at least one
  };
  readonly focusTrap: boolean; // modal: true by construction; popover: false
  /** The element focus returns to on close — required, never `null`,
   *  per ADR-0019 C17's restore-focus half of keyboard/focus integrity. */
  readonly restoreFocusTo: () => HTMLElement | null;
}

/** Sole constructor: refuses an overlay with NO dismissal channel at all
 *  (every channel `false`), and refuses a `modal` with `focusTrap: false`
 *  or a `popover` with `focusTrap: true` — the two kinds' contracts are
 *  distinct by construction, not by convention. */
export function overlayContract(input: Omit<OverlayContract, never>): OverlayContract {
  const { escape, outsideClick, explicitCloseControl } = input.dismissal;
  if (!escape && !outsideClick && !explicitCloseControl) {
    throw new Error('overlayContract(): an overlay with no dismissal channel at all is unrepresentable.');
  }
  if (input.kind === 'modal' && !input.focusTrap) {
    throw new Error('overlayContract(): a modal without a focus trap is not a modal — use popover.');
  }
  if (input.kind === 'popover' && input.focusTrap) {
    throw new Error('overlayContract(): a popover with a focus trap is not a popover — use modal.');
  }
  return { ...input };
}
```

**Closure statement.** *Invariant:* every constructed overlay has at least
one live dismissal channel, and its `focusTrap` value matches its declared
`kind`. *Quantification universe:* every modal and popover named in the
review's census — eleven modals (64 nodes), six popovers, **and** the
`CornerStack` summon popover (§1.4) and the LYT Exclusive's own P2b summon
mechanism (`LytNode.vue`'s "Popover summon for an absent Exclusive," already
Teleport-based) — construct through this one primitive; a bespoke
`<Teleport>` + hand-rolled `v-if`/`v-show`/keydown listener combination is
not constructible outside it. *Denomination:* boolean presence of each
channel, not a currency in the `Px` sense — named here because ADR-0000's
own amendment requires the universe stated even where the denomination
check is "N/A, this type's currency is presence-of-channel, not pixels,"
disclosed rather than silently skipped.

**What this makes unrepresentable.** The review's own two witnessed
divergences: a modal (`markup contract` — `modal-card` vs `modal-content`,
§Class 8) is no longer two implementations, because both construct the same
`OverlayContract`; a popover that dismisses via three of four expected
channels but not Escape (the portrait control-panel popover) cannot exist
without an explicit, reviewable `escape: false` in its own construction site
— today it is simply missing code, indistinguishable at a glance from an
oversight; under this type it is a named, greppable exception.

### 1.6 The sovereign-override type and its diagnostic

Per the commissioner doctrine named in the charter (ledger rows 2379(3)/2443):
**a user drag is sovereign over any model floor.** The type must make this
literally true — a sovereign override is not merely "usually respected," it
is **structurally exempt** from `FeasibleLayout.validate`'s starvation check
on the region it targets, with the cost of that exemption pushed onto
*other* regions' own diagnostics instead of being silently absorbed.

```ts
/** A user's explicit geometry choice for one region — the ONLY thing that
 *  can override a `Measured<Region>`'s own computed default. Distinct from
 *  a `RegionAllotment` (which is always inside `[min, maxUseful]` once
 *  validated) precisely because a sovereign override is permitted to fall
 *  OUTSIDE that range — that permission is the whole point of sovereignty. */
export interface SovereignOverride<Region extends string> {
  readonly region: Region;
  readonly axis: LytAxis;
  readonly px: Px;
  readonly source: 'user-drag'; // closed union of one, deliberately — see §5 open question 1
}

/** The diagnostic a sovereign override that starves ANOTHER region produces
 *  — never a silent clamp of the override itself (the commissioner's own
 *  words: "never drag resistance"), never a silent starvation of the
 *  OTHER region either (that would just be Class 1 again, moved one level
 *  down). Structured per ADR-0019 C8 (located, remediable, no dead end):
 *  `location` names the region the drag ITSELF targeted (where the user's
 *  attention is), `starved` names every casualty. */
export interface SovereignOverrideDiagnostic {
  readonly location: string; // the region the user actually dragged
  readonly starved: readonly StarvationDiagnostic[];
  readonly message: string; // "your geometry modification no longer permits X to render"
  readonly remediation: 'reduce this region\'s width, or use Default Layout to reset';
  readonly nextAction: 'open-default-layout-control';
}

/** `FeasibleLayout.validate` (§1.2) is never called with a sovereign
 *  override folded into `demands` as if it were a `Measured` entry — a
 *  sovereign override instead REPLACES that region's `candidate` allotment
 *  post-solve, and `resolveSovereignOverrides` (below) re-runs the
 *  starvation half of validate over every OTHER region only, producing a
 *  diagnostic instead of a refusal. The overridden region itself is never
 *  checked against its own `min`/`maxUseful` — sovereignty means exactly
 *  that its own floor/ceiling no longer bind. */
export function resolveSovereignOverrides<R extends string>(
  demands: readonly Measured<R>[],
  solved: ReadonlyMap<R, RegionAllotment<R>>,
  overrides: readonly SovereignOverride<R>[],
): { readonly candidate: ReadonlyMap<R, RegionAllotment<R>>; readonly diagnostics: readonly SovereignOverrideDiagnostic[] } {
  const overriddenRegions = new Set(overrides.map((o) => o.region));
  const next = new Map(solved);
  for (const o of overrides) next.set(o.region, { region: o.region, axis: o.axis, px: o.px });
  const result = FeasibleLayout.validate(
    demands.filter((d) => !overriddenRegions.has(d.region)),
    next,
    // screenClassId/viewport are threaded through by the caller; omitted
    // here for brevity of the worked signature — see §3 step 4's real
    // call site for the full form.
    'landscape' as LytScreenClassId,
    { widthPx: px(0), heightPx: px(0) },
  );
  const starved = 'refused' in result ? result.refused : [];
  const diagnostics = overrides.map((o) => ({
    location: o.region,
    starved,
    message: starved.length > 0
      ? `Your geometry modification no longer permits ${starved.map((s) => s.region).join(', ')} to render.`
      : '',
    remediation: 'reduce this region\'s width, or use Default Layout to reset' as const,
    nextAction: 'open-default-layout-control' as const,
  })).filter((d) => d.starved.length > 0);
  return { candidate: next, diagnostics };
}
```

**Closure statement.** *Invariant:* a `SovereignOverride`'s own region is
never checked against its own `Measured` bounds; every *other* region is
still checked, and a resulting starvation is surfaced as a named diagnostic,
never silently absorbed (no clamp) and never silently dropped (no swallowed
refusal). *Quantification universe:* the two persisted drag facts named by
`useResizablePanel.ts`'s own header (`treeControlRegionWidthPx`,
`treePanelWidthPx`) today, generalized to any region a future resizer
targets — the type is generic over `Region`, not hardcoded to these two
paths. *Denomination:* `Px`, inherited; the diagnostic's `message` is the
one place free text is legitimate (a user-facing string), and even there its
*shape* (which regions, in what order) is derived from the same
`StarvationDiagnostic` list `FeasibleLayout` itself would have produced, not
authored separately.

**What this makes unrepresentable.** A drag that either (a) gets silently
resisted/clamped when it would starve a sibling (the commissioner's own
forbidden shape) or (b) silently starves a sibling with no diagnostic at all
(today's actual behavior at extreme drag positions — UNEXERCISED: no review
evidence was gathered on this specific failure mode, but no mechanism in
`layout-model.ts`'s current clamp functions produces a *diagnostic*, only a
*clamped number*, so the silent-starvation shape is at minimum
constructible today). Under this type, every sovereign drag either fits
cleanly or produces a named, located, remediable diagnostic — there is no
third, silent outcome.

---

## 2. Measurement seam — where each fact honestly lives

The charter's own worked example (disabling every analysis surface did not
narrow the panel) is the test every entry below must pass: **a `maxUseful`
that is wrong when content changes is worse than no `maxUseful` at all**,
because it becomes a second, competing floor. The seam below is organized by
**how a fact can go stale**, since that is the axis the charter's own test
exercises.

| Fact class | Single home | How it's obtained | Staleness story |
|---|---|---|---|
| **Build-time static content demand** (a leaf whose rendered content never varies with app state — a toolbar strip's own label set, a fixed-copy status readout) | `research/lyt/facts.generated.json` (measured) / `facts.residue.json` (disclosed literal), read into the compiled program via the `.lyt` grammar's `read-constant`/`width-of`/`height-of`/`max-over` relations — **already the mechanism** (§0). | The probe harness (`research/lyt/tools/probe_harness/measure_engine_states.mjs`, named in the charter and in `layout-model.ts`'s own `A_engine_eval`/`A_engine_health` derivation comments) drives a real DOM render of the leaf at every state it can be in and records the bounding box. | Stale the moment the leaf's markup changes without a probe re-run — the SAME staleness the compiled program already carries for `min` today (nothing new). The fix is procedural, not typed: the C3 rewrite's own `_load_sizing` grounding means a `maxUseful` derivation belongs in the SAME relation vocabulary (`max-over`, `sum-of`) as `min`, so a future probe-harness run regenerates both floors and ceilings from one source pass, not two independently-maintained numbers. |
| **Runtime content-dependent demand** (a leaf whose natural extent depends on *current app state* — the tree panel's own node count and label lengths, the analysis dashboard *after a user removes chart panels*, the Cards/Browse row count) | A `ResizeObserver`-backed `contentDemandPx` ref, owned by the LEAF component itself (not an ancestor), exposed through a small composable — `useContentDemand(el: Ref<HTMLElement | null>, axis: LytAxis): Ref<Px | null>` — that measures the element's own **intrinsic** (unconstrained) content size, not its currently-allotted box. | The composable temporarily removes the axis constraint (a documented technique: measure `scrollWidth`/`scrollHeight` against a `width: max-content` clone, or — cheaper — read `scrollWidth` directly when the element is NOT currently clipping, which is decidable from `content: 'unbounded'` + whether the region is currently below its own `preferred`) and caches the reading, refreshed on the SAME `ResizeObserver` callback the element's box-size observer already fires (one observer, two readings — matches `frontend/CLAUDE.md`'s "one observer per measured element" imperative-escape discipline). | **This is the seam that answers the charter's own test directly.** A leaf's `maxUseful` for a *content-dependent* region is re-derived every time its own content changes — removing every analysis surface shrinks `AnalysisDashboard`'s own intrinsic content size, so the NEXT `ResizeObserver` firing (triggered by the DOM mutation itself) recomputes a smaller `maxUseful`, which is exactly the "the floor must track ACTUAL current content" requirement. The stale window is bounded by one animation frame (the observer's own callback latency), not "forever, until a probe harness is re-run by hand." |
| **Compile-time structural facts** (which regions exist in this screen class, their nesting, their fixed px, their `elastic-capped` bounds once populated) | The compiled `LytProgram` (`lyt-layout.gen.ts` / `lyt-layout-portrait.gen.ts`), unchanged as the SSOT for structure. | `emit_layout_tree.py`, regenerated from the `.lyt` encodings. | Stale only on an encoding edit with no regeneration — already gated today (`test_render_ts_roundtrip_matches_committed_file`, `lyt-relations-c3-rewrite.md` §7) and unaffected by this spec. |
| **Sovereign override facts** (`treeControlRegionWidthPx`, `treePanelWidthPx`, and any future resizer's own persisted px) | `store.session.ui.*`, unchanged — the existing single-writer-per-drag discipline (`useResizablePanel.ts`'s own header, "the tree pane's width changes through EXACTLY that one channel") is preserved verbatim; `SovereignOverride` (§1.6) is a *read-side* projection of these fields, never a second store. | The two resizer bars, unchanged. | Staleness is the existing "carried verbatim across a viewport change" story, already documented (`computeTreePanelClampedWidthPx`'s own header) — `FeasibleLayout` changes *how the resulting starvation is reported* (a named diagnostic, §1.6), not *when the stored value is considered fresh*. |
| **Corner-surface own height** (`CornerStackEntry.measured`) | Same runtime seam as content-dependent leaves — each corner component (`LytPresenceMenu.vue`, `SystemLogPanel.vue`, the debug pill) owns a `useContentDemand` reading of its own rendered height. | Same `ResizeObserver` mechanism. | An expanding system log recomputes its own height every frame it's visible, which `CornerStack.layout()` (§1.4) reads live — this is the direct fix for the hand-guessed `+40px`: the fact was never wrong because no one measured it once, it was wrong because it was **measured once, by a human, and then never re-measured** (App.vue's own comment: "a conservative estimate... rather than a swept number"). |

**Single home per fact, restated as a rule, not a table row.** No region's
`maxUseful` is ever computed twice by two different call sites. The
compiled-program facts (`facts.generated.json`/`facts.residue.json`) are the
home for build-time facts; `useContentDemand` is the home for runtime facts;
neither is a fallback for the other — a leaf is *classified* (build-time
static vs. runtime content-dependent) once, at the point its `Measured`
entry is constructed, via the SAME `content: LytContentClass` field the
compiled program already carries (`'bounded'`/`'designed'` leaves are
build-time-static candidates; `'unbounded'` leaves are runtime-content-
dependent candidates, `null` is today's undeclared default and should not
survive past step 2 of the migration, §3).

**What this closes that `layout-model.ts` today does not.** Every clamp
function read in full for this spec
(`clampTreeWidthForSideColumn`, `resolveTreeRowWidthPx`,
`resolveWidthConditionalPresence`, `sumFixedRowSiblingReservationPx`) is a
**model-layer estimate of another region's demand**, explicitly disclosed as
such in its own header (`clampTreeWidthForSideColumn`'s doc: "reserves...
`CONTROL_PANEL_MIN_WIDTH_PX` (a model-layer estimate, 300px, projected from
the tab registry — this module's own header) against... — neither of which
is the right fact for THIS row"). This is the tell the measurement seam is
built to remove: `CONTROL_PANEL_MIN_WIDTH_PX` (a *guess* about the control
panel's width from its tab-strip's own text) is a stand-in for a
`Measured<'controlPanel'>.min` that should instead be read from the SAME
place `FeasibleLayout` reads it — one number, one home, consulted by every
caller that needs it, rather than re-derived per clamp site with a
documented "this is not quite the right fact" caveat attached each time.

---

## 3. Migration map

Ordered so each step is **independently shippable and gate-checkable** — no
step requires a later step to already exist to be correct on its own, per
ADR-0004's minimal-touch-under-partial-visibility discipline and the
charter's own "ordered, independently shippable" instruction.

### Step 1 — `Measured<Region>` + `FeasibleLayout` as a pure validation layer, additive only

**What ships.** The types in §1.1/§1.2, plus one adapter function
`measuredFromLytProgram(program: LytProgram): readonly Measured<string>[]`
that reads `min`/(a synthesized `preferred` = `min` where the compiled
program has no separate preferred concept today — UNEXERCISED design choice,
see §5 open question 2) from every leaf already in the compiled program, with
`maxUseful: null` for every leaf whose track is plain `elastic` (§0's
"unpopulated `elastic-capped`" finding) — i.e., **step 1 changes nothing
about what the app allows**, it only makes the CURRENT permissiveness
(`maxUseful: null` everywhere it's genuinely unbounded, which is most
leaves today) explicit and checkable.

**Gate.** A new CI test asserts every mounted geometry (the review's own
geometry sweep — 1280/1366/1600/1800/1920/2200/2560/2880/3000 landscape,
420/540/768/1080/1200 portrait) produces either a `FeasibleLayout` or a
`refused` result with at least one diagnostic — never a silent
`undefined`/exception. This is checkable **today**, before any `maxUseful`
is populated, because `min`-only validation already catches the review's own
Settings-below-viewport and starved-control-panel instances (both are `min`
violations, not `maxUseful` violations).

**Deletes.** Nothing is deleted at this step; it is purely additive.

**Risk.** Low — additive, no runtime behavior change. The gate itself is the
deliverable.

### Step 2 — populate `maxUseful` for the leaves the review names, via the measurement seam

**What ships.** `elastic` → `elastic-capped` for `tree` (both classes) and
any other elastic leaf the review's Class 1 witnesses named, with `maxPx`
sourced per §2's table (`tree`'s natural content is runtime-dependent — node
count, label width — so it is a `useContentDemand` reading, not a
build-time probe). `A_engine_eval`/`A_engine_health` are **already done**
(§0) and need no work here. `LytBlackboxNode`/`LytExclusiveChild` gain
`content`/`scrollAxes` fields (a `.lyt` grammar + `emit_layout_tree.py`
change, cross-boundary to `research/lyt/` — flagged per the umbrella
`CLAUDE.md`'s scope discipline, not silently done as a frontend-only
patch) so the Settings/Analysis blackbox interiors are no longer
structurally outside the overflow contract (§0's third bullet).

**Gate.** The review's own "mount-time Fit assertion" (charter's own
phrase) — a `Fit`-disciplined leaf's `scrollHeight <= clientHeight &&
scrollWidth <= clientWidth`, asserted on mount and on every geometry
transition, failing loudly per ADR-0002. Lands here because it is the FIRST
point a real `maxUseful` exists to assert against.

**Deletes.** `TREE_PANEL_DEFAULT_WIDTH_FRACTION`'s role as a *ceiling*
substitute is retired — the fraction-of-workspace-width default
(`computeTreePanelDefaultWidthPx`) may still supply the tree's own
**preferred** starting point (a UX choice, not a correctness one), but it no
longer needs to double as an implicit anti-hoarding mechanism now that a
real `maxUseful` exists.

**Risk.** Medium — a `maxUseful` sourced from `useContentDemand` that
under-measures (e.g. measured while the tree is scrolled, or before a
virtualization pass has rendered enough rows to know its true natural
width) would introduce a NEW starvation the review never observed. Witnessed
by: the mount-time Fit assertion from this same step, plus a targeted replay
of the review's own width-sweep scenario (`s12`) checking the tree's
rendered width never regresses below what today's uncapped behavior gives it
at the SAME geometries the review measured.

### Step 3 — `FeasibleLayout` becomes the actual solve, not a post-hoc check

**What ships.** `FeasibleLayout.validate` moves from "checks the compiler's
candidate" to "IS what `LytNode.vue`'s `trackList` computed reads" —
`LytNode.vue`'s existing `trackStyleOverrides` mechanism (its own header,
"Resizer drag overrides") is the natural integration point: a
`FeasibleLayout`'s resolved allotments become the source `trackList` reads
from, alongside (not replacing) the compiled program's own static tracks for
regions that never need runtime reconciliation.

**Deletes — the runtime clamps.** Every function in `layout-model.ts` whose
own header discloses it as reservation-math standing in for a fact
`FeasibleLayout` now owns directly:

- `clampTreeWidthForSideColumn`, `resolveTreeRowWidthPx`,
  `sumFixedRowSiblingReservationPx`, `resolveWidthConditionalPresence` —
  all four are `FeasibleLayout.validate` plus `RegionPresence` (§1.3),
  restated as one function instead of four independently-evolved ones (each
  currently has its OWN "which siblings do I reserve against" logic, per
  their own dated-addendum headers — exactly the recurrence ADR-0000 Rule
  2(b) asks to convert to one mechanism).
- `computeTreePanelClampedWidthPx`, `sanitizeTreeControlRegionWidthPx` —
  subsumed by `resolveSovereignOverrides` (§1.6); the "stored value wins
  verbatim, reconciled against the CURRENT row width" shape they each
  hand-implement is exactly a `SovereignOverride` resolved against a fresh
  `FeasibleLayout.validate` pass.
- `computeBoardAreaMaxWidthPx`, `computeUnsetWrapperMaxWidthCss`,
  `freshTreeControlWrapperFloorPx` — the "freeze one flex-grow party at its
  content need, let the sibling absorb the remainder" mechanism these three
  hand-implement in CSS-calc/flex terms is what `FeasibleLayout`'s own
  per-region allotment already IS once every sibling in the row has a real
  `Measured` entry; CSS Grid's own track-sizing (already the substrate,
  per LYT's "browser does the solving, continuously" design, `emit_layout_
  tree.py`'s own docstring) replaces the flex-cap arithmetic outright.

**Survives, unchanged.** `computePaneWidthPx`/`computeTreePanelWidthPx`/
`computeTreeControlRegionWidthPx` (the pure drag-math the mouse handlers
call every `mousemove`) — these are UI-input-to-pixel-delta math, not
region-demand reconciliation; they remain the mechanism that PRODUCES a
`SovereignOverride.px`, just no longer the mechanism that VALIDATES it.
`LayoutClass`/`deriveLayoutClass`/`useDeferredLayoutClass` (the
axis/width-class/screen-class derivation, §Class 3's own "pure function of
geometry" requirement lives here already and is orthogonal to region
demand).

**Gate.** The purity/path-equality property (step 4).

**Risk.** High — this is the step that actually changes runtime layout
behavior for every geometry simultaneously. Mitigated by shipping steps 1–2
first (so `FeasibleLayout` has been checking real geometries in CI for at
least one full step before it starts DRIVING them) and by the review's own
geometry sweep as a before/after regression suite (every screenshot the
review captured is a concrete "does this still render the same or better"
oracle).

### Step 4 — the purity gate (closes Class 3)

**What ships.** A property-level CI test: for a set of geometries and a set
of traversal orders between them (the review's own §Class 3 traversal:
1920×1080 → 480×900 → 2560×1440 → 1024×768 → 1080×1920 → 1366×768 → 900×600
→ 1920×1080), the resulting `FeasibleLayout` at each REVISITED geometry must
be structurally equal (same `allotments` map, modulo floating-point
tolerance) regardless of path — meaningful only once step 1 exists (the
review's own sequencing note, §4: "only meaningful once step 1 exists,
because the equality it asserts is over step 1's output type").

**Mechanism.** `FeasibleLayout.validate` is a pure function of
`(demands, candidate-from-solve, screenClassId, viewport)` with **no**
in-place mutation of a previous result (unlike today's `layout-model.ts`
clamps, several of which explicitly reconcile against a STORED prior value —
`sanitizeTreeControlRegionWidthPx`'s own doc names this precisely: "a value
that reaches App.vue any other way... was rendered unclamped"). Purity here
is a **consequence** of steps 1–3's own construction, not a separate
mechanism bolted on — which is why this step is cheap once available, per
the charter's own framing.

**Deletes.** Nothing new — this step is the CI gate itself.

**Risk.** Low, given step 3 is real. The one residual risk: a
`useContentDemand` reading (§2) that is genuinely order-dependent (e.g. a
virtualized list that has only rendered the rows visible at the LAST
geometry, so its measured `scrollWidth` differs by path) would fail this
gate honestly — which is the gate doing its job, not a false positive. See
§4's risk register.

### Step 5 — `CornerStack` + the overlay primitive (closes Class 4 and half of Class 8)

**What ships.** `#lyt-corner-chrome` and `#lyt-overlay-stack` (App.vue lines
1139/1524) collapse into one `<CornerStackHost>` component that owns
`CornerStack.build`'s registration list and renders every entry via
`CornerStack.layout()`'s computed offsets — no more two independent
`position: fixed` divs. Every modal/popover construction site
(`useLytPresenceMenu.ts`, `BoardRailPopoverTrigger.vue`, the eleven modal
components, the LYT Exclusive summon popover) migrates to `overlayContract`
(§1.5) for its dismissal wiring.

**Deletes.** The `#lyt-overlay-stack` CSS block's own hand-literal `bottom:
calc(var(--space-medium) + 40px)` (App.vue line 1718) and its accompanying
disclosed-estimate comment (lines 1707–1714) — replaced by
`CornerStack.layout()`'s computed offset. The per-modal dismissal
divergence named in the review (`modal-card` vs `modal-content` markup; the
learn-path modal's missing Escape; the portrait control-panel popover's
missing Escape) is closed by construction once every construction site is
migrated — a modal author cannot omit a dismissal channel without an
explicit `false`.

**Gate.** A DOM audit (reused from step 6) asserting no two `CornerStack`
entries' rendered rectangles overlap, at every geometry the review swept.

**Risk.** Medium — `CornerStack`'s `layout()` reads `measured.preferred` for
stacking math, so an entry whose `preferred` under-reports its actually-
rendered height (the same class of risk as step 2's `maxUseful`) reintroduces
the exact collision this step exists to close. Witnessed by the DOM audit
gate, same geometry sweep.

### Step 6 — the ~100-line DOM audit as a per-geometry smoke gate

**What ships.** The review's own audit script (viewport escape, non-scrolling
clip, `elementFromPoint` occlusion, sub-minimum target size — "about a
hundred lines," §5's own description, "It found every finding in Classes 2,
4 and 7 without human judgment") lands in CI, run at every geometry in the
review's sweep, on every PR touching `frontend/src/components/chrome/`,
`frontend/src/state/layout-model.ts`, `frontend/src/state/lyt-layout*`, or
`frontend/src/App.vue`.

**Where it lands in the sequence.** The charter's own instruction: alongside
step 1 ("so the fix cannot silently regress") for the **occlusion/clip**
half of the audit (meaningful immediately, needs no `FeasibleLayout`
machinery), and as the closing gate for steps 2 and 5 specifically for the
**geometry-dependent** half (viewport escape at a given `maxUseful`;
overlap at a given `CornerStack` layout) — i.e. this step is not one
commit, it is a gate that starts enforcing partially at step 1 and gains
teeth as steps 2/5 land.

**Risk.** Low — a read-only audit; its only failure mode is false
negatives (missing a real defect class), not regressions it introduces.

### What survives untouched throughout

- The LYT compiler proper (`research/lyt/compiler.py`, the CP-SAT solve,
  the `.lyt` grammar) — this spec's frontend-side types CONSUME its output;
  §3 step 2's blackbox `content`/`scrollAxes` addition is the one
  cross-boundary touch, flagged as such per the umbrella scope discipline,
  not a silent extension.
- `useResizablePanel.ts`'s drag-input math (`computePaneWidthPx` and its
  two specializations) and its `mousedown`/`mousemove`/`mouseup` DOM
  wiring — pure input-to-delta conversion, orthogonal to region-demand
  validation.
- `LayoutClass`/screen-class derivation (`deriveLayoutClass`,
  `nearestScreenClassId`, the hysteresis mechanism) — already the "pure
  function of geometry" the charter asks for; `FeasibleLayout` takes
  `screenClassId` as an input, it does not re-derive it.
- `LytNode.vue`'s recursive CSS-Grid realization, the Exclusive-node
  tab-strip mechanism, the presence-override/track-override forwarding
  shape — the renderer is not replaced; its `trackStyleOverrides` input
  changes source (from ad hoc clamp functions to `FeasibleLayout`), its
  own recursion and DOM structure do not change.

---

## 4. Risk register

| Step | What can regress | Witnessed by |
|---|---|---|
| 1 (validation layer, additive) | A geometry the review never swept produces a false `refused` (a `min`-only false positive) because the compiled program's own `min` is itself wrong at that geometry — not a new bug, but newly LOUD where it used to render silently-wrong. | The CI gate's own failure output names the exact region/axis/geometry — first-class information, not a regression to fear; but it may surface as a wave of new CI failures on step-1 landing that need triage before step 2 can be trusted. Mitigation: run the gate in report-only (non-blocking) mode for one cycle before flipping to blocking, matching the review's own §Class 5 refusal-default pattern (ADR-0019's own "refusal-default flip" as a separate, deliberate act). |
| 2 (`maxUseful` population) | A `useContentDemand` reading taken before a leaf's content has settled (e.g. mid font-load, mid virtualization-list initial render) under-reports the true `maxUseful`, causing a *new* starvation the pre-step-2 uncapped behavior never exhibited. | Step 2's own mount-time Fit assertion (fires immediately, same render); the width-sweep regression replay against the review's own `s12` scenario. |
| 2 | The `.lyt`/`emit_layout_tree.py` cross-boundary change (blackbox `content`/`scrollAxes`) is out of frontend scope and needs a dispatch, not a silent frontend-side workaround (e.g. hand-authoring the same fields on the TS side, duplicating the compiled program's own SSOT). | Caught by review against the umbrella `CLAUDE.md`'s scope-discipline section — named explicitly here so it is not discovered mid-implementation. |
| 3 (real solve integration) | The single highest-blast-radius step: every geometry's rendered layout can shift simultaneously. A `FeasibleLayout`-driven allotment that differs from today's flex/clamp-derived one at a geometry the review called "correct" (e.g. the 2560×1440/1920×1080 OPTIMAL solver verdicts named in `lyt-relations-c3-rewrite.md` §2/§7) is a regression even if it satisfies every `Measured` bound, because "satisfies its own bounds" and "matches the review's own accepted screenshots" are not the same property until the bounds are proven tight. | The review's full screenshot set (`.claude/dispatch-reports/lyt-final-opus-review-evidence/`) as a before/after oracle, plus the LYT test suite's own 421-test solver-verdict regression (`lyt-relations-c3-rewrite.md` §7's "OPTIMAL/OPTIMAL/INFEASIBLE/OPTIMAL pattern... byte-for-byte identical"). |
| 3 | Deleting `layout-model.ts`'s clamp functions removes their OWN dated-addendum disclosures (the `previewBoard`-visible narrowing named in `computeTreePanelClampedWidthPx`'s header, e.g.) — a disclosed gap that was never actually fixed, only documented, could be silently lost rather than carried forward as an open item against the new mechanism. | A migration checklist item, not a runtime gate: every "disclosed narrowing" comment in the deleted functions is transcribed into a tracked item before the function is deleted (mirrors the memory note "disclosed narrowing needs ratification" already in force for this codebase). |
| 4 (purity gate) | A `useContentDemand` reading that is genuinely path-dependent (virtualization: only-rendered-rows differ by traversal history) fails the gate honestly, but the FIX (force a full measurement pass, e.g. render-to-measure off-screen) has its own performance cost the charter never budgeted. | The gate's own failure is the witness; the performance cost is measured directly (a Playwright timing probe) once a concrete failing case is found — UNEXERCISED, no such case is known to exist yet among today's leaves. |
| 5 (`CornerStack`) | A corner entry's `preferred` height is measured while COLLAPSED (an icon/pill state) but the entry can expand (the system log) — if `CornerStack.layout()` is only ever fed the collapsed reading, the stacking math is wrong exactly the way today's `+40px` is. | §1.4's own design already threads `reserves`/live `preferred` through `layout()` on every call, not once at mount — the DOM audit (step 6) is the regression witness if a future entry's wiring gets this wrong. |
| 5 | Overlay-primitive migration surfaces a LEGITIMATE exception the review didn't catalog (e.g. a transient toast that genuinely should not be Escape-dismissible because it self-dismisses on a timer) as a forced `dismissal.escape: false` construction-site declaration, which is correct but was never audited against the FULL modal/popover census (only the review's own sampled subset was witnessed). | Migration checklist walks the FULL census (review §"Coverage appendix," 64 modal + 10 overlay-stack + corner-chrome nodes), not only the review's sampled 5-of-11 modals. |
| 6 (DOM audit gate) | False negatives — the audit's own ~100-line scope (the review's own description) may not generalize to a defect class step 2/5 introduces that the review never needed to catch (because it didn't exist pre-migration). | Reviewed and extended per the SAME ADR-0000 Rule 2(b) discipline this whole spec is written under — a NEW defect class found post-migration converts to a NEW audit check, not a one-off patch. |

---

## 5. Open questions for the commissioner

Each posed as which fact resolves it — never in px, never pre-resolved here.

1. **Does a sovereign override ever originate from anything other than a
   direct user drag?** `SovereignOverride.source` (§1.6) is a closed union
   of one member (`'user-drag'`) by design, but the review's own §4 closing
   paragraph asks "whether the control panel still needs a presence/
   demotion concept at all once slack stops being hoarded" — if a future
   mechanism (a saved layout preset, a per-device remembered geometry) is
   ever meant to carry the SAME sovereignty the commissioner ruling grants a
   drag, that is a genuine widening of this type's union, not an
   implementation detail. **Which fact resolves it:** whether the
   commissioner intends sovereignty to be a property of the ACT (a human,
   in the moment, dragging a bar) or of the RECORD (any persisted override,
   however it got there) — the ledger rows cited (2379(3)/2443) speak to a
   drag specifically; whether a restored-from-preset value should carry the
   same "never resisted, only diagnosed" treatment is not decided by
   anything read for this spec.

2. **Does `preferred` need to be a genuinely independent fact from `min`, or
   is `min == preferred` an acceptable default for every leaf that has no
   authored preference today?** §3 step 1's adapter synthesizes `preferred
   = min` for the initial `measuredFromLytProgram` pass — this is
   *sufficient* for `FeasibleLayout`'s own correctness (the solver never
   needs `preferred` to be feasible, §1.1's own doc), but it means a
   region's fair-share/priority behavior when multiple regions are BELOW
   their own `maxUseful` and free space remains has no signal to arbitrate
   on beyond the compiled program's existing `frWeight`. **Which fact
   resolves it:** whether any region in the review's own findings actually
   needs a `preferred` distinct from `min` to behave correctly (UNEXERCISED
   — no review finding turns on this distinction), or whether `frWeight`
   already IS the intended fair-share signal and `preferred` is legitimately
   decorative until a concrete case needs it.

3. **Does the control-panel/presence-menu demotion concept survive step 3
   at all?** The review's own §4 closing paragraph names this as a question
   that "should answer itself" post-migration rather than being decided in
   advance, and this spec agrees by construction — `RegionPresence.absent`
   with `reason: 'demoted'` (§1.3) is representable, but nothing in this
   spec REQUIRES any region to ever resolve that way once every sibling in
   a row has a real, non-null `maxUseful`. **Which fact resolves it:**
   re-run the review's own geometry sweep against a step-2/step-3-complete
   build and observe whether the control panel is EVER width-demoted once
   `tree` is capped — if never, the presence-menu's "Control Panel" checkbox
   and its demotion-hint copy are dead code to retire; if still sometimes,
   the demotion concept is validated as genuinely load-bearing, not
   vestigial.

4. **Does the portrait screen class still need a popover-mounted control
   panel, or does it now fit in-flow?** Same shape as question 3, same
   review-named deferral, aimed at the OTHER screen class specifically
   (`presenceDefaultVisible: false` for `controlPanel` in
   `lyt-layout-portrait.gen.ts` path `5.1`, WITNESSED — the portrait
   program demotes it by DEFAULT, not only under width pressure). **Which
   fact resolves it:** the same post-step-3 geometry replay, at the
   portrait representative sizes specifically (420×880 through 1080×1920).

5. **Where does the `CornerStack` anchor set get consumed once a screen
   genuinely needs more than one corner?** §1.4 registers everything at
   `bottom-right` today (matching the current app), but `CornerAnchor` names
   four. **Which fact resolves it:** whether any planned surface (the
   review names none) is meant to occupy a different corner — if none is
   planned, the three unused anchor values are legitimate per ADR-0000's
   own "no class at stake" exception (a closed enum with unused members
   isn't over-typing when the enum's OWN domain — "corner of a rectangle"
   — is naturally four-valued), not a speculative widening to prune.

6. **Does `Measured<Region>`'s `axis: LytAxis` generalize cleanly to a
   region whose demand is genuinely two-dimensional and coupled (the board's
   own `aspect: 1` leaves)?** The board and `previewBoard` are `aspect`-
   locked leaves (`lyt-layout-types.ts`'s own `LytLeafNode.aspect` field,
   WITNESSED) — a single-axis `Measured` entry per leaf may need to become
   TWO entries (one per axis) with an additional aspect-coupling constraint
   `FeasibleLayout.validate` does not currently model (§1.2's `validate`
   checks each `(region, axis)` pair independently). **Which fact resolves
   it:** whether the review's own `board-priority-clamp`/
   `board-priority-self-clamp` track kinds (already handling this exact
   coupling at the CSS-Grid-track layer, per `lyt-layout-types.ts`'s own
   CASE A/CASE B documentation) are a sufficient existing mechanism this
   spec should simply defer to (leaving the board's own aspect-lock outside
   `FeasibleLayout`'s scope, same as today), or whether the starvation/
   hoarding diagnostic is genuinely needed for the board too and the type
   needs a coupled-axis extension — UNEXERCISED, no review finding names a
   board-aspect starvation defect specifically.

---

## License

Public Domain (The Unlicense), per ADR-0006.
