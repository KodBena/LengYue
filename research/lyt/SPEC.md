# LYT — the LengYue layout description language: specification

LYT is a small language for describing the shape of a screen. It exists
so that the layout of LengYue's SPA (the Go-study application this
umbrella project builds — see the umbrella [README.md](../../README.md) for what LengYue
is) can be written down and checked independently of the code that
renders it. A person or program that reads a `.lyt` file should be able
to answer, without running the app: which rectangles will appear on
screen, in what order, how big each one is allowed to get, and whether a
particular family of layout bugs (a control jumping sideways when the
network connects, a toggle button costing standing screen space it never
gives back) is even *possible* in this description. That last question —
"is this bug possible by construction?" — is what LYT is for: a
description language whose well-formedness laws make two known defect
classes into refusals at load time, not style advice a reviewer might
miss.

LYT was designed by an external documentation/design consult
([.claude/dispatch-reports/layout-language-consult.md](../../.claude/dispatch-reports/layout-language-consult.md), hereafter "the
consult document") and has since been implemented, exercised, and
amended by a Python prototype living in this directory
(`research/lyt/`). **This file is the current-state specification —
what LYT means and how it behaves today**, reconciling the consult
document's original design with five ledger-adjudicated amendments
([SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md)) and with the prototype's own disclosed narrowings
and inventions where the two sources diverge. Every claim below about
implemented behavior is checked against the code in this directory as
it stands (`parser.py`, `lyt_ast.py`, `loader.py`, `wellformed.py`,
`presence.py`, `compiler.py`, `emit_mockup.py`); where the consult
document's prose and the code disagree, both are stated and the
divergence is named, never silently resolved one way.

This document does not itself decide anything about `frontend/` — LYT
is, today, research tooling: a language and a solver, not application
code. See "Status of the other LYT documents" at the end of this file
for how this specification relates to [README.md](README.md) and
[SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md).

## 1. Structure stratum

A `.lyt` program describes a **screen** as a tree. Every node in the
tree is a **Slot**: a rectangle with a **presence** (whether/how it can
disappear, §3) and a **sizing** (how big it is allowed to be, §4). A
Slot wraps exactly one of three node kinds:

- **Leaf** — a single widget: an identity (`widget: str`), a set of
  **facets** drawn from `{action, info}` describing whether the widget
  is something a user acts on, something that displays information, or
  both, a **domain** drawn from the consult document's own five-member
  union `{go, common, debug, board, chrome}` describing which
  subject-matter region of the app it belongs to, and (§14, AMENDMENT 6)
  an orthogonal **boundary** flag marking "an unmodeled subtree stands
  here" — the recursion's own base case, re-homed off a retired sixth
  domain literal, `blackbox`, that this implementation carried between
  Amendments 0 and 5 (see §14 for the full disclosure of that retirement
  and why it was an ADR-0008 category error).
- **Split** (`H` or `V`) — an ordered, variable-arity partition of its
  own rectangle among its children, along one axis. `H` partitions
  width (every child gets the split's full height); `V` partitions
  height (every child gets the split's full width). Child order is
  semantically significant: it is the left-to-right or top-to-bottom
  order the reader/user perceives, not an arbitrary list.
- **Exclusive** (`T`) — a tab group: every child receives the *same*
  rectangle (the whole Exclusive's own rectangle), and exactly one is
  visible at a time, selected by the user. This is what makes switching
  tabs reflow-free by construction: the group's own reserved size in
  its parent is fixed regardless of which child is active.

A **Program** (`lyt_ast.Program`) is a finite family of such trees, one
per **screen class** (§6), plus an objective (§7) and, in principle, a
widget census (`widgets: list`) — the prototype leaves the census empty
per §7's own note that its cross-check is advisory, not a gate.

### 1.1 Concrete syntax

The consult document's base EBNF ([layout-language-consult.md](../../.claude/dispatch-reports/layout-language-consult.md), lines
274–287) is:

```
program   ::= widgetsec classsec layoutsec+ objectivesec
layoutsec ::= "layout" classid "=" slot
slot      ::= presence? sizing node
node      ::= leaf | split | excl
split     ::= ("H" | "V") "(" slot ("," slot)* ")"
excl      ::= "T" "(" slot ("," slot)* ")"
leaf      ::= widgetid "[" domain ("," facet)* "]"
presence  ::= "@fixed" | "@dev"
            | "@toggle" "(" ("user" | "system") "," ("release" | "preserve") ")"
sizing    ::= "{" "min" extent "," "pref" extent "," "max" (extent | "inf")
              ("," "aspect" number)? ("," "envelope")? "}"
extent    ::= number ("px" | "ch" | "fr")
```

The implementation's parser (`parser.py`) reads **only the `layoutsec`
production** — `widgetsec`, `classsec`, and `objectivesec` have no
worked concrete-syntax example anywhere in the consult document (every
one of its §5 examples is a bare `layout X = ...` fragment), so rather
than invent syntax nobody has demonstrated, the census, screen classes,
and objective are supplied in Python (`lyt_ast.Program`, populated by
`runner.py`'s `Registration` records) instead of parsed from text. A
`.lyt` file today is therefore a sequence of `layout NAME = <slot>`
fragments only.

The parser is also **deliberately permissive**: it accepts syntax that
is well-formed per the grammar above but that LYT's own laws forbid
(the sentinel `CONTENT` in extent position, the presence combination
`@toggle(system, release)`) because the consult document's own worked
"as-is" transcription (§5.1) contains both, as an illustration of what
the laws exist to catch. Turning those into loud refusals is the
*loader's* job (§9), not the parser's — this "parser permissive, loader
refuses" division of labor recurs throughout the implementation and is
named explicitly wherever it applies below.

**Grammar extensions the implementation adds**, all required to parse
the consult document's own worked examples verbatim (disclosed in
`parser.py`'s module docstring, read in full):

- `-- text` line comments.
- `⚠L<digit>` warning markers prefixing a slot (as the consult document
  itself uses to flag known violations in its as-is transcription),
  preserved as `Slot.violates` metadata. This metadata is inert — no
  code reads it as an active check; it is disclosed provenance only.
- A domain identifier **or a widget identifier** may carry a trailing
  `?` (e.g. `common?`, `boardRail?`) marking the census's own "flagged,
  not forced" ambiguity (consult document §3); either spelling sets the
  same `Leaf.flagged` field.
- Facets may be joined with `+` as well as `,` (`info+action`).
- A bare facet name (`info` or `action`) in domain position — e.g.
  `I[info]` — loads as domain `common` with the token folded into the
  facet set instead: a disclosed fallback for the generic "information
  panel" leaves the q5go/OGS comparison encodings (§6 names what these
  two reference encodings are) use, which don't map onto LengYue's own
  domain census.
- A `[TAG]` bracket may trail a `T(...)` node (e.g. `[BLACK BOX]`) as a
  documentation-only annotation, stored as `Exclusive.tag`.
- Extra sizing keys beyond the base grammar's `min`/`pref`/`max`/
  `aspect`/`envelope`: `width <extent>` (an alias for `pref`),
  `aspect-coupled` (sugar for an elastic, unaspected wrapper — the real
  aspect clamp lives on the wrapped leaf, not the wrapper), and
  `drag-persisted` (parses but has no effect anywhere downstream — see
  the L4 discussion in §5). `envelope` gained an optional `:
  {state, state, ...}` state list, because the base grammar's bare
  `envelope` keyword has nowhere to put the states L3 (§5) requires;
  the bare keyword still parses (spec-legal syntax must not become a
  parse error) but is refused at *load* time, since only the loader
  knows why a stateless envelope is wrong. An *explicit but empty*
  state list — `envelope: {}` — is refused the same way, with its own
  `prohibition: "empty-envelope-states"` token: an earlier build of the
  loader treated `rs.envelope_states == []` as falsy and silently fell
  through to `basis='reserved'`, dropping the author's envelope
  declaration with no error at all; this was a genuine implementation
  hole (finding S1, [.claude/dispatch-reports/lyt-spec-grammar-audit.md](../../.claude/dispatch-reports/lyt-spec-grammar-audit.md),
  ledger row 1778), now fixed in `loader.py` — see §4.3 and §12.
- Extents may be sums (`340px+60ch`), resolved to plain px at load
  time.
- **Amendment 3** ([SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md), ledger row 1715): an H/V
  split's sizing block may carry an optional `gap <extent>` term — one
  more key in the same bag every other sizing key already uses. The
  parser accepts any extent unit here (permissive, per its own
  architecture); the loader is where the amendment's actual law — px
  only, refused on `fr`/`ch`/any symbolic extent, and refused entirely
  on a `T` node — is enforced (§9.4).
- **Amendment 5** ([SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md), ledger row 1937): two more
  sizing-bag keys, same "one more recognized key" extension precedent.
  `scroll <axis>` (`axis` ∈ `h`/`v`) is legal on ANY node kind at any
  depth and, unlike every other sizing key, may be declared MORE THAN
  ONCE in the same block to name both axes (`scroll h, scroll v`
  accumulates rather than overwrites). `content <class>` (`class` ∈
  `bounded`/`designed`/`unbounded`) is a LEAF-only content-class
  declaration, deliberately placed in the sizing bag rather than the
  leaf's `[domain, facets]` bracket — see §13 for the full rationale and
  the L5/L5a/L5b/L5c laws both keys feed.
- Three symbolic size sentinels: `CONTENT` (the literal spelling of the
  forbidden content-driven sizing basis, from the consult document —
  refused by the loader, §9.1), `WRAPPER_MIN` (a named-but-undefined
  constant the consult document cites without a value; the loader
  resolves it to a disclosed 300px, matching the control-panel floor
  the same document cites elsewhere), and `maximize` (any letter case)
  — prose-in-syntax for "this leaf is the subject of a maximize-area
  objective term" (§7); the loader resolves it to an elastic `pref 1fr`
  and relies on the Python-registered objective to actually carry the
  maximize-area term for that widget (a disclosed invention this
  prototype adds, not present in the consult document's own symbol
  set). §1.2's worked example uses it (`pref maximize`, the board
  leaf); §8 stage 1 is where the registered objective term actually
  does the maximizing.
- A sizing block may also be written as a bare extent in braces —
  `{28px}` — a shorthand meaning `min = pref = max` = that extent; it
  is combinable with an `envelope: {...}` clause in the same braces
  (the reserved extent stays that one fixed number regardless of which
  declared state is active — see §4.2). This shorthand is used
  throughout §1.2's worked example and is otherwise mentioned only in
  passing, in §10. Two completion rules apply when a key is simply
  omitted from a non-shorthand sizing block: an omitted `min` defaults
  to `0px`; an omitted `max` defaults to `inf`; an omitted `pref` is
  refused at load (`"missing 'pref'"` — `pref` is a target the
  objective needs, so there is no honest least-constraining default
  for it the way there is for `min`/`max`). Separately, a bare unitless
  number in extent position is treated as `px` — this applies in `gap`
  position too, so `gap 4` loads as a plain 4px gap without the author
  ever writing a unit.

A handful of further parsing/loading conventions, none named explicitly
above, round out the concrete-syntax picture:

- A sizing block is a **bag of keys**, not the ordered triple the base
  EBNF's `sizing` production literally quotes — keys may appear in any
  order, and a key repeated within the same block is last-write-wins
  (`{min 5px, min 9px, ...}` resolves to `min 9px`). Amendment 3's own
  "one more key in the same bag" phrasing implies this reading; it is
  stated explicitly here rather than left to be inferred.
- Presence keywords and arguments (`@TOGGLE(USER, RELEASE)`), sizing
  keys (`MIN`/`PREF`/`MAX`/...), and the symbolic extent sentinels are
  all case-folded by the parser/loader — this document's own examples
  are lowercase throughout, but any letter case parses identically.
- §4.1's "refused loudly" for an `fr` bound with no enclosing split (the
  root slot, or a direct `T`-node child) fires at **compile** time
  (`compiler.py`, `prohibition: "unresolvable-fr-bound"`), not at load
  time — a program using such a bound loads without complaint and is
  only refused when a screen class is actually solved. This differs
  from every other refusal named in this section, which fires inside
  `load_layouts` (§9); readers relying on §9's "loader.py is the single
  choke point" framing should not assume this one refusal is load-time
  too.
- L2 violation paths and waiver paths are always rooted at the literal
  string `root` (`root/H0`, `root/V0/T1`, ...), never at the layout's
  own name — §9.2's "an exact tree path" means this convention. A
  waiver written against the layout name instead of `root` is a stale
  waiver, refused the same way an absent waiver would be.

### 1.2 Worked example — current syntax

The clean-room landscape encoding (`encodings/lengyue_landscape.lyt`),
as it stands today (after Amendments 3 and 4 — see §9.4 and §11):

```
layout lengyue-landscape =
  {min 0px, pref 1fr, max inf, gap 12px} H(
    @toggle(user, release) {min 168px, pref 168px, max 168px} boardRail[common, info+action],
    {pref 1fr} V(
      {pref maximize, aspect 1} B[board],
      {min 24px, pref 24px, max 24px} I_board[board, info],
      {min 28px, pref 28px, max 28px} A_board[board, action]
    ),
    {min 340px, pref 32fr, max 340px+60ch, gap 4px} V(
      {28px} A_go[go, action],
      {28px, envelope: {disconnected, connected_5digit_latency}} I_engine[common, info],
      {28px} A_common[common, action],
      {pref 1fr, gap 4px} H(
        {min 140px, pref 140px, max 140px} tree[board, info+action],
        {pref 1fr} T(
          {min WRAPPER_MIN, pref 1fr, max inf} CP-library[blackbox],
          {min WRAPPER_MIN, pref 1fr, max inf} CP-cards[blackbox],
          {min WRAPPER_MIN, pref 1fr, max inf} CP-settings[blackbox],
          {min WRAPPER_MIN, pref 1fr, max inf} CP-analysis[blackbox],
          {min WRAPPER_MIN, pref 1fr, max inf} CP-other[blackbox]
        )[BLACK BOX],
        @toggle(user, release) {min 160px, pref 160px, max 160px, aspect 1} previewBoard[common, info]
      )
    )
  )
```

Reading this tree: the root `H` splits the width into a toggleable
168px board-rail column, an elastic (`pref 1fr`) board composite, and a
side control column with its own `max` cap (`340px + 60ch`). The board
composite is itself a `V` — a square, aspect-locked board leaf plus two
fixed-height info/action strips. The side column is a `V` of three
28px action/info strips and a final elastic row, itself an `H` of the
tree panel, a five-tab exclusive group (the control-panel "black box" —
its five tabs are all `blackbox`-domain leaves, §1's placeholder-domain
note above), and a togglable square preview board. Every extent in the tree is
either a constant, a `ch`-measured constant, an aspect-derived
constraint, or an `fr` share — never a function of rendered content
(§4.1's "no `basis: 'content'`" prohibition, §9.1).

## 2. Denotational semantics of the structure nodes

Each Slot denotes, for a given screen class and presence valuation
(§6), an axis-aligned rectangle. The combinators:

- **`H(s₁,…,sₙ)`**, rectangle `R`: children receive an ordered
  partition of `R`'s width — `Σwᵢ + (n−1)·gap = R.w` — and every
  child's height equals `R.h` exactly (the parent's cross axis is
  filled, not merely bounded). `V` is the transpose: children partition
  height, every child's width equals `R.w`.
- **`T(s₁,…,sₙ)`**: every child receives the identical rectangle — the
  whole `T` node's own rectangle. The group's own minimum, along each
  axis, is the componentwise **max** of its children's declared minima
  (its "envelope" in the plain sense: big enough for whichever child is
  showing).
- Order within an `H`/`V` is semantically significant — it is the
  perceptual left-to-right/top-to-bottom sequence, carried through
  unchanged from structure to the eventual rendering (§10).
- Overlays (modals, popover drop-downs) are **not** tree nodes. They
  contribute no constraints and occupy no standing space; a popover
  that must not occlude a particular region is expressed, per the
  consult document, by promoting it into the tree as a `preserve`ing
  slot instead — not by inventing an overlay-geometry concept LYT does
  not otherwise have.

**Implementation deviation, disclosed** (not present in the consult
document's own prose, discovered by the prototype): the exact
cross-fill equality above collides with an `aspect`-bearing leaf (the
board), because the leaf's cross dimension is a function of its own
`aspect` and along-dimension, not of its parent's share, and the two
generally cannot be reconciled by an exact equality. `compiler.py`
relaxes the cross-fill constraint from `==` to `<=` specifically for
aspect-locked leaves, letting the leaf shrink to fit within whatever
room its column leaves it (and centering it in the resulting slack at
render time — §10). This is a real, load-bearing choice with a
disclosed direction (see §12 for the fuller discussion): the *opposite*
relaxation (loosening the along axis instead of the cross axis) would
report a different, also-defensible feasible/infeasible split at
several screen sizes. The literal §4.1 semantics and `aspect` are
jointly unsatisfiable in general; this prototype's one-directional
patch is the mechanism that lets the aspect-bearing worked examples
solve at all, and it is a spec-level open question, not merely an
implementation detail, which direction (if either) is correct.

## 3. Presence

Presence answers "can this slot's rectangle vanish, and if so, in what
sense": whether the space it occupies goes away too (`release`) or
stays reserved while the slot stops painting (`preserve`), and who
drives the transition (`user` or `system`).

```
type Presence =
  | { kind: 'fixed' }
  | { kind: 'build';  variant: 'dev' }
  | { kind: 'toggle'; by: 'user';   hidden: 'release' | 'preserve' }
  | { kind: 'toggle'; by: 'system'; hidden: 'preserve' }
```

Concrete syntax: `@fixed`, `@dev`, `@toggle(user|system, release|preserve)`.
`@fixed` means always present. `@dev` means present only in a
development build (the language's answer to LengYue's own debug-only
widget class). `@toggle` names who drives the transition and what
happens to the reservation.

**The typed impossibility.** The fifth logical combination —
`{by: 'system', hidden: 'release'}`, a system-driven event that both
appears *and* re-partitions its siblings — is **unrepresentable by
construction**. `lyt_ast.Presence.__post_init__` raises if a caller
(bypassing the concrete-syntax loader) constructs it directly, and the
loader raises the same way for the concrete syntax `@toggle(system,
release)` before it ever reaches the typed AST. This is a real
constructor-level fact, not merely documented prose: there is no code
path, anywhere in this implementation, that can produce a `Presence`
value with that combination. The rationale, per the consult document
(line 268 in the original numbering): a system-driven appearance may
only fill space already reserved for it (this is what L1, §4.3, is for);
letting it also *release* space when hidden would let a network event
or an error arrival silently move every sibling, which is exactly the
first defect class named in this document's opening paragraph above
(a control jumping sideways when the network connects) that LYT exists
to forbid.

`hidden: 'preserve'` means the slot's rectangle survives across the
transition — it keeps its reserved size and merely stops painting.
`hidden: 'release'` means the slot's reservation is removed from its
parent's partition and the freed extent redistributes among the
remaining siblings (per §2's partition equality, now over one fewer
child).

## 4. Sizing stratum

Every Slot also carries a sizing block — the typed shape below is what a
`.lyt` file's `{min ..., pref ..., max ..., ...}` clause loads into:

```
interface Sizing {
  min:  Extent;
  pref: Extent;
  max:  Extent | 'inf';
  aspect?: number;
  basis: 'reserved' | 'envelope';
  envelope_states?: string[];   // required when basis == 'envelope'
}
type Extent =
  | { unit: 'px'; v: number }
  | { unit: 'ch'; v: number }
  | { unit: 'fr'; v: number };
```

`min` is a hard floor, `max` a hard cap (or `'inf'` for no cap), and
`pref` a *target* — not a constraint the solver must meet, but the
quantity the objective's second stage (§8) rewards reaching. `aspect`
constrains `w = aspect · h` for a leaf whose shape must not distort
(the board is the canonical case, `aspect 1`).

### 4.1 Units

- `px` — device-independent pixels, resolved as-is.
- `ch` — a text-measure unit, resolved to `px` at load time via a
  single global constant, `loader.PX_PER_CH = 8.0`. The consult
  document says only that `ch` is "resolved per class via a declared
  px-per-ch input" without giving the constant or saying whether it
  varies by class; the implementation's one global constant, applied
  identically to every screen class, is a disclosed simplification of
  that deferral, not a reading of text that specifies a value.
- `fr` — a share of the parent's free space, resolved by the partition
  equality (§2) when used in `pref` position. Used in `min`/`max`
  position, `fr` means something the consult document's §6 sketch never
  states: the implementation's disclosed convention is that `N fr` in
  min/max position means `N`% of the enclosing split's own extent along
  its partition axis (`compiler.FR_MIN_MAX_DENOMINATOR = 100`), applied
  as a genuine linear constraint against the split's own solved size —
  refused loudly, rather than resolved to an arbitrary meaning, when
  there is no enclosing split to denominate against (the root slot, or
  a direct child of a `T` node, which shares the whole parent rectangle
  on both axes and so has no single partition-axis length to be a share
  of).

### 4.2 Reservation, not measurement — the language's answer to defect (a)

There is **deliberately no `basis: 'content'`.** `Sizing.basis` is
closed to `{'reserved', 'envelope'}` — there is no way, anywhere in
this type, to spell "size me from what I actually render." This is the
second typed impossibility (alongside §3's system-release presence):
`lyt_ast.Sizing`'s constructor cannot produce a content-driven sizing,
and the loader refuses the concrete-syntax sentinel `CONTENT` for the
same reason before it reaches the AST at all. Content may vary only
*inside* a reservation (ellipsis, a placeholder glyph, an `envelope`'s
declared states) — it may never re-partition a parent.

- **`basis: 'reserved'`** — the extent is a constant of the `(class,
  presence)` pair; content never reads into it.
- **`basis: 'envelope'`** — for a leaf whose content genuinely varies
  (a latency readout that renders as 1–5 digits, an engine status that
  is "disconnected" or "connected"): the author declares the *content
  states*, and the slot's reserved extent is understood as the max over
  those states — though see the divergence noted just below.

**Implementation narrowing, disclosed.** `Sizing` is 1-dimensional per
slot (a `min`/`pref`/`max` triple describes only the slot's extent
*along its parent's partition axis* — the cross axis is always filled
exactly by §2's partition equality, or relaxed per the aspect exception
above). An `envelope`'s declared states therefore have nowhere to drive
*different* reserved extents in this implementation — the reserved
extent is a single number regardless of which state is named, and the
state list is, in the prototype, documentation attached to that number
rather than a mechanism that computes it. This is a real gap between
the consult document's "the slot's reserved extent is the max over the
declared states" framing and what the code does: the code does not
compute a max over anything; it stores a fixed extent and a state list
side by side, and law L3 (§5) is what actually uses the state list — to
check the list is non-empty and treated as documentation of what
`envelope` was declared *for*, not to compute a size from it.

### 4.3 Well-formedness laws L1–L4, as currently implemented

The consult document names four laws. **Their implementation status
differs sharply between them, and this is stated exactly, per law:**

- **L1 (control stability).** *Not structurally checked.* The law
  quantifies over runtime states — "screen class, user-initiated toggle
  states, user drags" — not over static tree shape, so a genuine L1
  checker would need to reason about behavior across time, which this
  static, offline tree-walker does not attempt. The **one corner of L1
  this prototype does touch** is Amendment 1 ([SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md),
  ledger row 1670): a `preserve` slot's `min` is raised to `max(min,
  pref)` at load time (`loader._apply_preserve_reservation`), so that
  "preserve" is a genuine floor the solver cannot squeeze to zero — see
  §5 for the full account and its checkable form. The rest of L1 (the
  connect-driven mount, the unreserved-latency-width, and similar
  instances the consult document's own §5.1 worked "as-is" example
  marks with `⚠L1`) has no structural check in this implementation at
  all; a violating `.lyt` file loads without complaint unless one of
  its slots also happens to be a non-conforming `preserve`.
- **L2 (zero-standing-cost affordances).** *Checked*, by
  `wellformed.py`, in the form Amendment 2 ([SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md),
  ledger row 1671) gives it — see §5 for the full derivation and its
  checkable form.
- **L3 (envelope honesty).** *Checked* at load time
  (`loader._load_sizing` / `_refuse_bare_envelope`): a slot declared
  `basis: 'envelope'` must carry a non-empty list of declared content
  states (enforced by `lyt_ast.Sizing.__post_init__` itself — this is a
  construction-time invariant, not merely a loader check); a bare
  `envelope` keyword with no `: {states}` clause is refused loudly at
  load time (`prohibition: "bare-envelope-no-states"`), and so is an
  *explicit but empty* `envelope: {}` clause
  (`prohibition: "empty-envelope-states"`) — the two spellings reach the
  loader as distinguishable raw shapes (`RawSizing.envelope_bare` vs.
  `RawSizing.envelope_states == []`) but both are equally underspecified
  per L3, and both are refused rather than either one being allowed to
  silently coerce to `basis='reserved'`. (The empty-list spelling was,
  for a time, a genuine gap: `_load_sizing`'s original guard treated an
  empty list as falsy and let it fall through unrefused — fixed per
  finding S1, [.claude/dispatch-reports/lyt-spec-grammar-audit.md](../../.claude/dispatch-reports/lyt-spec-grammar-audit.md),
  ledger row 1778; see §12.) What this check does *not* do — per §4.2's disclosed
  narrowing — is verify that an *observed runtime* content state
  matches one of the declared ones; that half of L3 ("an observed
  content state outside the declaration is a fail-loud event") has no
  runtime component in this offline prototype at all, since there is no
  runtime here to observe.
- **L4 (single writer: a slot's extent has at most one writer among
  {solver constant, user drag}).** *Entirely unimplemented.* The
  `drag-persisted` sizing keyword parses (`parser.RawSizing
  .drag_persisted`) but is dropped immediately after parsing — it never
  reaches `lyt_ast.Sizing` (which has no such field), never reaches the
  loader's semantic checks, and never reaches the compiler. A `.lyt`
  file that declares `drag-persisted` gets **no enforcement of L4 from
  this prototype**, full stop. This is a defensible scope call for a
  static offline solver with no runtime drag state to arbitrate against
  — but it is stated here as an honest absence, not glossed over: a
  reader relying on `errors.LytLoadError`'s docstring reference to
  "L1-L4" as what this prototype enforces should not have to read every
  `.lyt` file's comments to discover that L4 is a no-op.
- **L5, L5a, L5b, L5c (overflow honesty; Amendment 5).** *Checked*, by
  `wellformed.py`'s `find_l5_violations`, in the SAME enforcement family
  as L2's dominance test — see §13 for the full grammar, semantics, and
  derivation. Unlike L1-L4 (named by the original consult document), all
  four are inventions of Amendment 5 itself; unlike L2, all four are
  gated on an explicit `scroll`/`content` declaration existing somewhere
  in the tree, so every encoding without one (every encoding as of this
  amendment) is unaffected — see §13's own "Dormancy" note.
## 5. L2 in full: the dominance test (Amendment 2)

L2's prose, quoted from the consult document in full: *"A leaf whose
only function is toggling another slot's presence (`domain: 'chrome'`,
facets `{action}`) may not be the sole occupant of a child of any
split — it must be a descendant of a slot that also carries non-chrome
content ... Equivalently: no band of any partition axis is reserved for
hide/show affordances alone."*

The **original implementation** approximated this as a local
tree-shape test: a bare chrome/action leaf standing as a split child
conformed the instant *any* other bare non-chrome leaf sat beside it in
the same split, regardless of size. An adversarial review of the prototype
([.claude/dispatch-reports/lyt-compiler-prototype-review.md](../../.claude/dispatch-reports/lyt-compiler-prototype-review.md),
REJECT verdict, 2 MAJOR / 4 MODERATE / 5 MINOR findings — see
[README.md](README.md) for the fuller build/review trail) demonstrated this is
trivially defeatable — a `{min 1px, pref 1px, max 1px}` decoy sibling,
under 4% of the wrapped band, flips the verdict from violation to
conforms on a construction that is, geometrically, still exactly the
kind of "band reserved for a toggle alone" L2 forbids.

**Amendment 2** ([SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md), ledger row 1671) replaces the
tree-shape test with a magnitude (dominance) test, implemented in
`wellformed.find_l2_violations`:

> For every Split (H/V) node `n`, let `chrome_px` be the sum of `pref`
> (in px, along `n`'s own partition axis) of `n`'s *direct* children
> that are bare chrome/action leaves (`domain == 'chrome'`,
> `facets == {action}` exactly — a leaf wrapped inside its own composite
> child contributes 0 here; its own interior is checked independently,
> when that composite is itself visited as `n`). Let `total_px` be the
> sum of `pref` (px) of *all* `n`'s direct children, plus
> `n.gap_px * max(len(children) - 1, 0)` — the same quantity the
> compiler's own partition equality sums to. `n` is an L2 violation iff
> `chrome_px * 2 > total_px` (strict majority; a 50/50 split does not
> violate).

**Checkable form.** A Split node fails L2 exactly when its direct
chrome-toggle children's combined `pref` is a strict majority of the
Split's own total reserved extent along its own axis. The check runs
once per Split node encountered while walking the tree (`H`/`V` only —
a `T` node's children each receive the whole rectangle, so "a band of a
partition axis" does not describe a `T` child's relationship to its
siblings; this scoping is unchanged by the amendment).

**Disclosed interpretation choices**, each pinned by a witness:

1. "Band" is the Split node itself, measured against the aggregate of
   *all* its direct children — not one child measured against its
   siblings' total, and not a child measured against only its own
   declared `pref`. Both alternatives were tried and rejected: the
   first gets the consult document's own canonical sidebar-toggle
   witness wrong (a 27px toggle beside a 168px column and a `1fr`
   elastic column is nowhere near a *sibling-total* majority, yet is
   the canonical L2 violation); the second flags every bare
   chrome/action leaf trivially, including the consult document's own
   labeled "L2-conformers (embedded)" cluster.
2. `pref` is the only extent consulted — `min`/`max` play no role in
   the dominance measure.
3. `fr` handling: `pref` is never `'inf'` by construction, so that half
   of the ambiguity never arises; `ch` is already resolved to `px` by
   the time this check runs. When a Split contains chrome content
   *and* a direct child (chrome or not) whose `pref` is `fr`, the total
   is genuinely incomparable without a disclosed `fr`-pref convention
   this amendment does not introduce — refused loudly: a
   `LytLoadError` with `detail.law == "L2"`, whose `detail.violations[]`
   entry contains the text "L2 dominance is INCOMPARABLE" (there is no
   separate `reason` key — the earlier draft of this bullet, and of
   `wellformed.py`'s own module docstring, quoted a
   `"incomparable-fr-sibling"` token that appears in neither the raised
   message nor its structured `detail`; corrected per finding M5,
   [.claude/dispatch-reports/lyt-spec-grammar-audit.md](../../.claude/dispatch-reports/lyt-spec-grammar-audit.md), ledger row
   1778) — rather than guessed either direction.
4. Strict majority (`chrome_px * 2 > total_px`), not `>=`.
5. Only *bare* chrome/action leaves count toward the numerator — a
   composite child's own interior dominance is checked independently,
   when it is itself visited as the band.

**Consequence for the reference encodings.** The consult document's own
worked "current LengYue, row axis" example wraps its four chrome toggle
buttons plus `locale` in a dedicated inner band (96px of chrome inside
a 120px total) and labels it an "L2-conformer" — under this dominance
test that inner band is a genuine, unambiguous majority violation
(`96·2 = 192 > 120`), which **disagrees with the consult document's own
casual label for that construction**. `encodings/current_row_repaired
.lyt` was restructured — the wrapper unwrapped, its five children
promoted to direct children of the substantial nav-bar row — per L2's
own textually-prescribed remedy ("ride the already-reserved nav bar"),
after which the same chrome content (96px of a ~900px+ row) is a
comfortable minority and conforms. This is a genuine divergence between
the consult document's own worked-example labeling and the current
implementation's checkable form of the law it is labeling against — the
divergence is surfaced (via this restructuring and its accompanying
regression tests), not silently absorbed.

## 6. Screen classes and nearest-neighbor selection

A screen class is the unit a Program's tree is compiled against — the
typed shape a screen class carries is:

```
interface ScreenClass { id: ClassId; w_px: number; h_px: number }
```

A Program carries one whole tree per screen class — a landscape shape
and a portrait shape are different trees, not one tree with
conditional attributes. Runtime selection (per the consult document's
sketch, not exercised at runtime by this offline prototype, since there
is no runtime) is nearest-neighbor by scale-normalized distance:
`argmin` over classes of the distance between the observed `(w, h)` and
each class's representative point. `runner.py` implements the
class-selection machinery for its own CLI-driven "solve at these
representative sizes" purpose; only `lengyue_landscape.lyt` /
`lengyue_portrait.lyt` register two classes (landscape and portrait) —
the other four reference encodings (`q5go` and `ogs`, LYT transcriptions
of two existing third-party Go client UIs — q5go, a desktop SGF editor,
and OGS, the Online Go Server's own web UI — used as outside comparison
points; `current_row_repaired` and `current_row_asis`, transcriptions of
LengYue's own current row-axis layout) each register exactly one
default class that always wins, since the consult document never
demonstrates a second class for them.

## 7. Objective

A Program also carries an objective — an ordered list of terms the
compiler solves in priority order (§8), typed as:

```
type Objective = ObjectiveTerm[];
type ObjectiveTerm =
  | { kind: 'maximize-area'; leaf: WidgetId }
  | { kind: 'reach-preferred'; weight: Record<WidgetId, number> }
  | { kind: 'minimize-slack' };
```

Lexicographic, highest priority first. "Maximize the board's dimension"
is always an *objective term*, never a *constraint* — a hard
maximize-height constraint would be unsatisfiable the moment a
horizontal-demanding info box must coexist with it. This composes with
the board-maximize stage documented in §8 below.

## 8. The CP-SAT compilation contract

`compiler.py` compiles a loaded `Slot` tree, for one screen class, into
a Google OR-Tools CP-SAT model and solves it in stages. This section is
the normative summary of what that compiler actually builds — every
claim below is checked against `compiler.py` as it stands.

**Decision variables.** The compiler declares one integer `(w, h)` pair
per Slot, per screen class, in px. There are no `x, y` position variables and no
no-overlap constraints — the tree structure *is* the non-overlap proof
(an ordered partition can never produce two overlapping children);
positions are recovered afterward by walking the solved tree and
accumulating partition offsets (`compiler._extract_rects`).

**Hard constraints.**

- Root: `w_root = W_class`, `h_root = H_class`.
- `H` node: `Σ along_i + (n−1)·gap == this_along_extent`; every child's
  cross-axis variable equals the parent's cross-axis variable exactly
  (the `<=` relaxation for aspect-locked leaves, §2, is the one
  disclosed exception). `V` is the transpose.
- `T` node: every child's `(w, h)` equals the `T` node's own `(w, h)`
  exactly; the `T` node's own `min`, on each axis, is derived as the
  componentwise max of its children's declared minima (the loader
  leaves an omitted `T` `min` at a disclosed 0px default; the compiler
  is the actual source of the real floor).
- Sizing bounds (`min ≤ extent ≤ max`) are applied to the axis a
  slot's own sizing describes — its extent along its parent's
  partition axis — for a Split child. For the **root slot** and for
  **direct children of a `T` node**, which have no parent partition
  axis to describe an "along" direction for, the bounds instead apply
  to **both** axes (`compiler._constrain`'s `along=None` branch): a `T`
  child's declared `min`, for instance, constrains the whole `T` group
  on both `w` and `h`, which is how §2's componentwise-max floor
  actually arises. (Corrected per finding M6,
  [.claude/dispatch-reports/lyt-spec-grammar-audit.md](../../.claude/dispatch-reports/lyt-spec-grammar-audit.md), ledger row
  1778 — an earlier draft of this bullet claimed the bound "never"
  applies to the cross axis; a `T` child with `min 120px` under a
  100px-tall root is a counterexample, `INFEASIBLE` purely from the
  cross axis. The reach-preferred stage below measures a `T` child's
  shortfall on both axes for the same reason.) `fr` in `min`/`max` position resolves
  via the disclosed percentage-of-enclosing-split convention (§4.1);
  `fr` in `pref` position is a free variable within `[min, max]`, grown
  only by the reach-preferred objective stage below — there is no
  separate "fr proportionality" hard constraint.
- `aspect`: `w = aspect · h` as an integer equality (scaled to avoid
  float coefficients in CP-SAT).
- Presence: the compiler itself is **presence-blind** — it compiles
  whatever tree it is handed. *Which* tree that is (all slots present,
  or one with some release-toggled leaves pruned) is decided one layer
  up, by `presence.py` (§9.2), before compilation.

**Objective — staged lexicographic solve**, matching the consult
document's own "solve term 1, fix its optimum as a constraint, solve
term 2, ..." framing (chosen over a single dominating-weighted-sum
alternative because it needs no weight tuning and each stage is
independently witnessable):

1. **Maximize board width** (the board leaf's `w`; the aspect equality
   keeps `h` in lock step). For a square board this is area
   maximization, but linear in this 1-D-per-axis model, so no
   multiplication constraint is needed.
2. *(Implementation-only stage, not in the consult document's own
   three-term list, disclosed as a deviation)* **resolve aspect-slack**:
   the `<=` cross-axis relaxation for aspect leaves (§2) leaves an
   aspect leaf's parent split free to claim more cross-axis room than
   the leaf can use; this stage minimizes that slack before the
   reach-preferred stage runs, so no later stage inherits an arbitrary,
   already-baked-in oversized column.
3. **Reach preferred**: minimize the sum, over every registered
   reach-preferred widget, of `max(pref − extent, 0)` on that widget's
   own along-axis (not exceeding `pref` costs nothing further; falling
   short is penalized).
4. **Minimize slack**: minimize total unused room across every
   finite-`max` slot whose solved extent falls short of that cap — per
   the consult document's own framing, mostly a guard against authoring
   caps that strand space, since slack inside the tree's own partition
   equalities is already zero by construction.

Each stage after the first fixes the *sum* of its objective terms (not
each individual variable) as a hard constraint before the next stage
runs, so a later stage can still redistribute a tie among earlier-stage
optima rather than being frozen into one arbitrary solution.

**INFEASIBLE is an answer, not an error.** When a stage's model has no
feasible solution, the compiler returns a `SolveResult` with
`status="INFEASIBLE"` rather than raising — a screen class a program's
tree genuinely cannot serve is a fact about the geometry (or, per §12,
about the language's own aspect/exact-cross-fill collision), reported
honestly rather than coerced into some smaller, silently-wrong layout.

## 9. Loading: type-level refusals and the well-formedness pass

`loader.py` is the single choke point every `.lyt` text passes through
on its way to a typed `Slot` tree (`load_layouts` is the only public
entry point that returns one). It performs two independent checks:

### 9.1 Type-level (construction-unrepresentable) prohibitions

The two typed impossibilities named in §3 and §4.2 (system-release
presence; content-driven sizing) are caught here by routing the
parser's permissively-accepted tokens into the typed AST's own
constructors, which raise. This is why both are called
*constructor-level* facts rather than merely documented rules: the
refusal happens because `lyt_ast.Presence.__post_init__` and
`lyt_ast.Sizing`'s absent `'content'` basis member make the forbidden
values literally unconstructable, and the loader's job is only to turn
that construction failure into a structured `LytLoadError` instead of
letting a raw `ValueError` escape.

### 9.2 Structural well-formedness (L2)

`load_layouts` runs `wellformed.check_wellformed` on every fully-built
tree before returning it — this is "load time" for L2's purposes. A
declared `waivers` map (`wellformed.Waiver`) lets a caller load an
honestly, disclosedly L2-non-conformant encoding (the as-is baseline,
`encodings/current_row_asis.lyt`) without either refusing to load it at
all or silently weakening the checker for every other encoding: each
`Waiver` names an exact law, an exact tree path, and a citation, and a
waiver that matches no violation actually present on this load ("stale
waiver") is itself refused loudly, exactly like an unwaived violation.
Omitting `waivers` (the default) is strict mode for every layout.

### 9.3 Amendment 1 — `preserve` implies a genuine reservation

**Ruling** ([SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md), ledger row 1670): a slot whose
presence is `@toggle(_, preserve)` gets its `min` raised to
`max(min, pref)` on its presence-bearing axis (the axis its sizing
block constrains under its parent's split — both axes for a `T`
child, per §8's `along=None` bound-application branch), at load time
(`loader._apply_preserve_reservation`, called from every branch of
`load_slot`).

**Rationale.** The consult document's own prose promises that a
`preserve` slot "keeps its rectangle and merely stops painting" — but
nothing in the original `Sizing` semantics forced that rectangle to be
non-empty in the first place. A `min 0px` preserve slot could, and
did, solve to a literal zero-height rectangle whenever a higher-
priority objective stage wanted the room: the type (`Presence`) carried
the promise, but the sizing did not. This is defect (b) — standing
cost of a show/hide affordance, here inverted into a *broken* promise
of standing reservation — wearing a different face.

**Checkable form.** `min := max(min, pref)`, applied only when
`presence.kind == 'toggle'` and `presence.hidden == 'preserve'`.
`max`/`aspect`/`basis` are untouched by this rule.

**Consequence, named rather than left implicit.** This is a **real
hard constraint** the solver must now satisfy — some encodings that
previously solved (by silently squeezing a nominally-preserved slot to
nothing) can now become genuinely `INFEASIBLE` at some screen sizes.
That is correct behavior surfacing a real design choice ("can this
screen size actually afford the reserved banner height, or does the
banner need to move to the overlay stratum instead"), not a bug to
route around. Concretely, in `current_row_repaired.lyt`, this raises
three system-preserve banners' combined floor to a genuine 314px
(32+32+250px) — feasibility at the runner's four representative sizes
is unchanged, but the *solved geometry* changes (the board settles for
a smaller width to make room for the now-genuine banner floor), and a
bisection search finds a new infeasibility threshold (a fixed
1920px-wide column becomes infeasible between 640px and 650px tall,
versus 330–340px pre-amendment) pinned as a regression test.

**Disclosed edge cases.** A `min`/`pref` unit mismatch (only `px` vs
`fr` can actually arise, since `ch` is already normalized earlier in
the same pass) has no common unit to compare against — refused loudly
rather than guessed. `pref ≤ min` (the floor already meets or exceeds
the target) is a no-op; a raised `min` that now exceeds a smaller `max`
surfaces as the ordinary `min > max` → `INFEASIBLE` outcome at solve
time, not a load-time check.

### 9.4 Amendment 3 — split-node uniform gap

**Ruling** ([SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md), ledger row 1715): split nodes gain an
optional uniform, constant-px gap declaration — never solvable or
elastic, since "rhythm is not negotiable under board-maximization."
`compiler.py` had carried a fully general `(k−1)·gap` partition term
since the original build, but no concrete syntax ever set it — the
loader hardcoded `gap_px=0.0` unconditionally. This amendment adds the
syntax; the compiler and CSS-grid realization (§10) needed no change,
since both already consumed `gap_px` generically.

**Syntax.** `gap <extent>`, one more term in a split node's own sizing
block: `{min 340px, pref 32fr, max 340px+60ch, gap 8px} V(...)`.

**Semantics.**

1. Legal only on `H`/`V` split nodes — refused loudly on a `T` node
   (whose children all share one rectangle; there is no "between
   children" for a gap to reserve) and on a bare leaf (no children at
   all).
2. Must resolve to a constant `px` literal — `fr`, `ch`, extent sums,
   and symbolic sentinels are all refused, even though `ch` is
   otherwise resolvable to px elsewhere in this loader: gap position
   deliberately does not inherit that resolution, so a `ch`-declared
   gap is never silently reinterpreted through a constant the author
   didn't name in gap position.
3. Maps 1:1 onto the compiler's pre-existing `(k−1)·gap` partition term
   and onto CSS Grid's native `gap` (§10) — no new compiler mechanism,
   no new CSS-side concept.
4. An unfittable gap is a loud `INFEASIBLE`, never silently absorbed,
   because the partition equality is a hard `==` constraint.
5. Nonuniform spacing remains an explicit spacer leaf between the two
   slots that need the wider gap — this amendment does not introduce a
   per-child gap list or alternating rhythm.

## 10. The CSS Grid realization mapping

`emit_mockup.py` realizes a loaded (and, per §9.2/§5, well-formed)
`.lyt` tree as live, resizable HTML/CSS — one CSS Grid container per
`H`/`V`/`T` node, nested to the tree's own depth, so the browser's own
layout engine solves the geometry at view time rather than the page
being a frozen snapshot of one CP-SAT solve. (The CP-SAT-solved
rectangles are retained as a toggleable debug overlay for verifying
solve-vs-live-CSS agreement, not as the page's positioning mechanism.)
This mapping is a normative *realization* of the structure and sizing
strata — it does not add or change any language semantics of its own.

- **`H` node** (partitions width): `display:grid; grid-auto-flow:
  column; grid-template-columns:<one track per child, in child order>;
  grid-template-rows:1fr;`
- **`V` node** (partitions height): the transpose —
  `grid-auto-flow:row; grid-template-rows:<tracks>;
  grid-template-columns:1fr;`. CSS Grid's own default
  `align-items`/`justify-items: stretch` already gives every child the
  parent's full cross-axis extent for free — exactly the structure
  stratum's exact-cross-fill semantics (§2), with no extra CSS needed.
- **`T` node**: realized as a tab strip (`auto`-height row) plus a
  single active body (`1fr` row) — `display:grid;
  grid-template-rows:auto 1fr; grid-template-columns:1fr;`. This is a
  disclosed simplification: rather than literally stacking every child
  in one shared grid cell with only one visible, the non-active
  children render as tab labels only, not duplicate body DOM. The
  law-relevant property — no child ever gets a size the others don't
  share — still holds, since the body area's own track is sized once,
  by the `T` node's own track in *its* parent, never by whichever child
  happens to be active.
- **Per-child track**, by sizing shape:
  - fixed (`min == pref == max`, e.g. `{28px}`) → `"<v>px"`.
  - elastic (`max == inf`, `pref` an `fr` value) → `"minmax(<min>px,
    Nfr)"`.
  - elastic with a cap (`max` a finite px or `px+ch` sum, `pref` still
    `fr`) → `"minmax(<min>px, <max>px)"`. CSS `minmax()` takes only two
    arguments, so there is no third slot for the `fr` weight once a
    hard `max` is also declared — the hard cap (LYT's `max` is a
    genuine constraint) wins over the soft target (LYT's `pref` is an
    objective term, not a constraint), so the `fr` weight is dropped
    for this one shape, not the cap.
- **`T` node's own track floor**: the loader leaves an omitted `T`
  `min` at a disclosed 0px default and lets the compiler derive the
  real one (§8); the emitter reproduces that same derivation
  (componentwise max of the `T`'s children's own declared minima, both
  axes) so the `T` node's track in its parent carries the same floor
  the solver enforces, not the loader's un-derived 0px.
- **Gap** (Amendment 3, §9.4): a split's declared `gap_px` maps
  directly onto CSS Grid's native `column-gap`/`row-gap` on the
  matching axis — a pre-existing browser primitive that already means
  exactly "constant, non-elastic space between grid tracks," so no
  CSS-side invention was needed for this amendment either.

**One disclosed, honest divergence between the live grid and the
CP-SAT solve.** The "elastic with a cap" track shape is the one place
the two genuinely disagree: the solver's lexicographic objective can
leave a capped track short of its own `max` when a higher-priority
stage needs the room elsewhere, while CSS Grid's `minmax()` always
grows a non-flex track to its max before any `fr` track gets anything.
For the one elastic-and-capped track that sits as a direct sibling of
the board composite in both clean-room encodings, `emit_mockup.py`
replaces the bare `minmax()` mapping with a `clamp(min, 100% -
natural_board, max)` expression that eliminates the divergence for
that specific shape (a closed-form reproduction of the board-maximize
stage); any *other* elastic-and-capped track, in any other encoding,
keeps the bare mapping and its disclosed divergence unresolved. The
debug overlay exists precisely to surface this class of disagreement
on demand, not to hide it.

## 11. Presence valuations (Amendment 4) — per-valuation solving

**Ruling** ([SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md), ledger row 1737): this is not a new
law but the implementation of a paragraph the consult document's own §6
already prescribes: "solve the all-`preserve`-slots-present valuation
... `release` toggles are user-initiated only [...] so each
user-reachable presence valuation is legitimately a *separate* solve;
in practice solve the default valuation plus any valuation the author
lists as common." Pre-amendment, `compiler.py`'s own module docstring
disclosed the gap outright: only the "all slots present" valuation was
ever solved, regardless of any slot's own declared default-hidden
state.

**The language surface** (`presence.py`, new module for this
amendment): a `PresenceValuation(name, absent_widgets: FrozenSet[str])`
is a named set of *leaf widget ids* considered absent for one solve —
identified by widget id (the same identity convention `runner.py` and
`compiler.py` already use for referring to a slot generically), not by
tree path; a narrower concept than `emit_mockup.py`'s own path-keyed
UI-toggle registry, which some entries name a whole composite subtree
that has no single widget id. Only a bare leaf can be named in a
`PresenceValuation`.

**Validation.** `presence.validate_valuation` refuses loudly
(`LytLoadError`, `detail.law == "presence-valuation"`) when a named
widget either does not exist in the tree, or exists but its declared
`Presence` is not a genuine `{kind: 'toggle', by: 'user', hidden:
'release'}` — a `preserve` slot (keeps its rectangle by definition) or
a `@fixed`/`@dev` slot can never be named absent. This is Amendment 4's
own ledger-row-1737 ruling, quoted verbatim: "a named slot that isn't a
user-release toggle is an error."

**Pruning, not zeroing.** `presence.prune_absent` returns a *new* Slot
tree with every leaf named absent removed from its parent's children
list entirely — the parent's own arity genuinely drops. This is why the
compiler needed no change for this amendment: its existing
`(k−1)·gap` partition term already sums the gap over `len(children)`,
whatever tree it is handed, so pruning *before* compiling is sufficient
on its own to make that term use the present count.

**Declaration.** The *declaration* of which valuation is default lives
at the `runner.Registration` layer (`default_valuation`, defaulting to
`presence.ALL_PRESENT` — every registration that declares nothing of
its own keeps the exact pre-amendment behavior), following the same
"registration-level facts are Python-declared, not `.lyt` syntax"
precedent `lyt_ast.Program` already uses for screen classes and the
objective. Only the LengYue registration declares a non-default
valuation: `absent_widgets = {"boardRail", "previewBoard"}`. Both
encodings' own concrete syntax now genuinely declares
`@toggle(user, release)` on those two leaves (previously `@fixed`, with
the toggle behavior living only in the mockup generator's own UI
registry) — so the validation above is checking a real fact of the
typed AST, not a UI-layer convention the language itself never
asserted.

**Feasibility outcome, honestly reported.** Solving the default
valuation (both widgets genuinely absent) flips two previously-
`INFEASIBLE` sizes to `OPTIMAL` — landscape 1366×768 and portrait
420×880. Three other sizes named by the motivating investigation —
landscape 1024×700, 900×600, and 1280×1024 — remain `INFEASIBLE` **for
a presence-independent reason**: the board composite's own `V`-split
forces an exact board width from the viewport height alone (via the
aspect equality), which collides with the tree/panels row's own
`WRAPPER_MIN`-driven floor (300px `T`-node + 140px tree + 4px gap =
444px, present in *every* valuation, since neither `tree` nor the `T`
node itself is release-toggled or prunable by any valuation) regardless
of `boardRail`/`previewBoard`'s presence. This is a genuine geometry
fact about the current board-composite shape, not a defect this
amendment's own scope extends to fixing — reported as such rather than
forced to match the motivating investigation's original predicted
count.

## 12. Known limitations and open questions

Stated honestly, per this document's own standard (the fresh-context
legibility discipline this specification is written to —
[ADR-0017, the zero-context reader](../../docs/adr/0017-the-zero-context-reader.md)):

- **The aspect / exact-cross-fill collision (§2, §8's aspect-slack
  stage) is a genuine, unresolved spec-level tension**, not merely an
  implementation quirk. The structure stratum's literal semantics
  ("every child's [cross-axis extent] is R.[cross]") and the sizing
  stratum's `aspect` constraint are jointly unsatisfiable in general;
  this prototype's one-directional `<=`-relaxation choice (shrink the
  aspect leaf's cross axis, never the along axis of its siblings) is
  disclosed as one defensible choice among at least two, with the
  reported feasible/infeasible split at various screen sizes being a
  consequence of *encoding-plus-patch-direction*, not of geometry
  alone. Which direction (if either) the language itself should commit
  to is an open question this specification does not resolve.
- **The compact-landscape infeasibility finding is real and
  presence-independent** (§11): several mid-sized landscape and one
  portrait screen size remain genuinely `INFEASIBLE` under the current
  clean-room encoding even after Amendment 4's release-toggle presence
  handling, because the board's aspect-forced width plus the tree/
  panels row's structural floor exceeds the available width — a fact
  about this specific tree's geometry at those sizes, not a solver
  defect.
- **`preserve`-geometry semantics are scoped narrowly by Amendment 1**
  (§9.3): the amendment fixes the *floor* (`min := max(min, pref)`) for
  a `preserve` slot's presence-bearing axis only. It does not address
  the cross-axis geometry of a preserved slot, nor does it change
  `max`, nor does it retroactively decide what "the overlay stratum"
  concept the consult document gestures at (as an alternative home for
  a banner that cannot afford its reservation) would formally look
  like in this language — that concept remains prose, not a typed
  construct.
- **L1 and L4 have no structural checker** (§4.3) beyond the one L1
  corner Amendment 1 touches. A `.lyt` file can declare
  `drag-persisted` and receive zero enforcement of the single-writer
  law it names; a `.lyt` file can mount a system-driven `@fixed` leaf
  inside a shared row and receive no complaint about the row-
  repartition L1 exists to forbid, unless a `preserve` slot's floor
  happens to be involved.
- **The census's domain axis is inherently judgment**, per the consult
  document's own §3 discussion (the board is genuinely
  multi-category; several widgets are flagged rather than forced into
  one domain) — any mechanization of a census-to-tree cross-check must
  stay advisory, never a gate, and this prototype leaves the census
  (`Program.widgets`) empty rather than half-populate it.
- **`envelope`'s declared states are documentation, not a computed
  sizing input**, in this 1-D-per-slot implementation (§4.2) — a
  divergence from the consult document's own "reserved extent is the
  max over declared states" framing, named rather than silently
  resolved either way.
- **An explicit but empty `envelope: {}` state list used to load
  silently as `basis='reserved'`, dropping the author's declaration**
  (finding S1, [.claude/dispatch-reports/lyt-spec-grammar-audit.md](../../.claude/dispatch-reports/lyt-spec-grammar-audit.md),
  ledger row 1778) — a hole in the loader's `_load_sizing`, not merely
  an underdocumented corner: `envelope_bare` was only set for the
  *no-colon* spelling, so `envelope: {}` reached neither refusal path.
  Fixed: `loader.py` now refuses it loudly (`law: "L3"`,
  `prohibition: "empty-envelope-states"`), matching the bare-keyword
  refusal — see §1.1 and §4.3.
- **The CSS Grid realization's one disclosed divergence** (§10, the
  elastic-and-capped track shape) is fixed only for the one board-
  adjacent track both clean-room encodings share; any other encoding's
  elastic-and-capped track would carry the same unresolved
  solve-vs-live-CSS disagreement.

## 13. Amendment 5 — overflow as a typed language concept: `scroll`, content-class, and L5/L5a/L5b/L5c

Adopted per [.claude/dispatch-reports/lyt-tab-region-consult.md](../../.claude/dispatch-reports/lyt-tab-region-consult.md)
(ledger row 1937). Before this amendment, LYT had no concept of overflow
at all — a slot whose content exceeded its reservation was simply outside
the language's vocabulary, while the realization (`frontend/`'s DOM) had
THREE independently-owned `overflow: auto` layers. This section is the
current-state grammar/semantics; [SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md)'s own Amendment 5
entry is the dated ruling/rationale record.

### 13.1 Grammar

Two new sizing-bag keys (§1.1), following the same "one more recognized
key in the existing bag" precedent Amendment 3's `gap` used:

- **`scroll <axis>`**, `axis` ∈ `{h, v}` — legal on ANY node kind (leaf,
  split, exclusive) at any depth. May be declared more than once in the
  same sizing block to name BOTH axes (`scroll h, scroll v`) —
  accumulated, not overwritten, a disclosed departure from this
  language's usual last-write-wins bag semantics for a repeated key
  (two `scroll` terms naming different axes are not repetitions of "the
  same key" in any useful sense).
- **`content <class>`**, `class` ∈ `{bounded, designed, unbounded}` — a
  LEAF-only content-class declaration. Refused loudly (`law:
  "content-class-declaration"`, `prohibition:
  "content-class-on-non-leaf"`) on a Split or Exclusive node.

Both keep the parser permissive (any identifier accepted in axis/class
position) and the loader as the enforcement point (`loader.py`'s
`_load_scroll_axes`/`_load_content_class`), matching this parser's
established "parser permissive, loader refuses" division of labor.

### 13.2 Why `content` is not `domain` or a `facet`

*(At the time this section was written, the census still carried a
disclosed misfit: `domain: 'blackbox'` was a boundary marker ("an
unmodeled subtree stands here") wearing a subject-matter-domain spelling,
named as such by the consult report's own §6.3. §14 (AMENDMENT 6) RETIRES
that spelling — `blackbox` is no longer a `Domain` member; the boundary
fact moved to its own `Leaf.boundary` flag. This section's own prose is
kept verbatim below, since it is the disclosure that MOTIVATED §14's
retirement, not a claim about the current type — a reader relying on it
for the current `Domain` union should read §14 instead.)*

`content` is a genuinely ORTHOGONAL axis — how much of a
leaf's content there is (bounded/designed/unbounded), not what
subject-matter region it belongs to (`domain`) or what a user does with
it (`facets`). Conscripting `content` into either existing axis would
re-mint the exact category error `blackbox` used to be, one paragraph
after it was named as a misfit to avoid (ADR-0008) — and §14 retires that
category error at the root rather than merely avoiding repeating it.

### 13.3 The laws L5, L5a, L5b, L5c

All four are structural, load-time tree walks, implemented by
`wellformed.find_l5_violations` in the SAME enforcement family as L2's
dominance test, and arbitrated through the SAME `(law, path)`-keyed
`Waiver` mechanism `check_wellformed` already generalizes for.

- **L5 (overflow honesty).** An `unbounded`-content leaf may not ALSO
  declare `basis == 'envelope'` (§4.2, L3) — an envelope enumerates a
  FINITE set of content states, which is not an honest claim for content
  that is unbounded by definition. `bounded`/`designed` leaves are
  unaffected: their envelope, or their plain reservation alone, is an
  honest claim.
- **L5a (coverage).** An `unbounded`-class leaf REQUIRES exactly one
  scroll owner — a `scroll` declaration on some slot along its
  root-to-leaf path, inclusive of the leaf's own slot. A leaf with none
  anywhere on its path is refused. `bounded`/`designed` leaves carry no
  such requirement.
- **L5b (single scroll owner).** On any root-to-leaf path, at most one
  slot declares `scroll` per AXIS. A second declaration on the SAME axis
  on the SAME path is refused — "which container absorbs the overflow"
  must stay unambiguous. Two DIFFERENT axes on the same path do not
  conflict, and the same axis declared on two DIFFERENT (sibling) paths
  does not conflict either — this law is quantified per root-to-leaf
  path, not over the whole tree.
- **L5c (chart exclusion, subtree-quantified fold).** A slot may declare
  `scroll` only if its OWN subtree (itself included) contains NO
  `designed`-class leaf — computed as a fold over the subtree, never a
  per-slot tag: a container is chart-bearing because a descendant
  genuinely is one, not because someone remembered to mark the
  container. This is the mechanized form of the commissioner's ruling
  (quoted in full in [SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md)'s Amendment 5 entry): chart-carrying
  containers may never scroll; their declared demand is a hard
  reservation the solver must fit, `INFEASIBLE` where it cannot, never a
  scrollbar.

**Dormancy.** Every one of the four checks fires only when the tree it
walks contains a genuine `content`/`scroll` declaration — L5/L5a look
only at a leaf whose `content` is non-`None`; L5b/L5c look only at a
slot whose `scroll_axes` is non-empty. A tree with none of either (every
encoding as of this amendment, including both clean-room encodings —
`lengyue_landscape.lyt`/`lengyue_portrait.lyt` are untouched by this
amendment) triggers none of the four checks. The laws bind declarations;
they do not retroactively indict silence.

### 13.4 Per-T-group shortfall advisory

`research/lyt/advisory.py` (new module) computes, for every Exclusive
(T) group in a solved tree, each child's declared `pref` demand against
the group's own solved shared rectangle (every T child receives the
identical rectangle, §2) — the mechanized form of the consult report's
own witnessed symptom ("the Basic and Stability panes ... need
scrolling ... different amounts") made a program-level fact instead of a
DOM-only observation. **Advisory only** (ADR-0011 Rule 5: "a
judgment-shaped output never gates") — printed by `runner.py`'s stdout
after each solve; never raised, never a load-time check, never affects
`runner.run_all`'s own exit code.

The demand metric is deliberately `pref`, never `min`: `min` is a HARD
constraint (the T node's own floor is the componentwise max of its
children's declared `min`s, enforced as a real bound on the group's
solved `(w, h)`, §8), so a child whose `min` genuinely exceeds the
group's available room makes the WHOLE MODEL `INFEASIBLE` before a
rectangle is ever solved — there is no "solved but short" state for
`min` to report a shortfall against. `pref` is a soft target the solver
may leave unmet, so a positive shortfall against it is a real, reachable,
non-gating fact.

## 14. Amendment 6 — the boundary marker, and constructor-total tree consumers

Adopted per [.claude/dispatch-reports/lyt-tab-region-consult.md](../../.claude/dispatch-reports/lyt-tab-region-consult.md)
§6.3/§6.4/§8.1 (ledger row 1937, same ratification as Amendment 5; work
item lyt-tab-skeleton-encoding, the "Option C" wave). Where Amendment 5
gave overflow a typed vocabulary, Amendment 6 re-homes a PRE-EXISTING
disclosed category error (§13.2's own prose above, kept verbatim, IS the
disclosure that motivated this retirement) and retires one language-level
narrowing that had nothing to do with the language's own type.

### 14.1 The re-homing

`Domain` shrinks back to the consult document's own five-member union
(`go | common | debug | board | chrome`) — the implementation-added sixth
literal, `blackbox`, is RETIRED. In its place, `Leaf` gains a `boundary:
bool` flag (concrete syntax: a bare `boundary` sizing-bag key, leaf-only,
same "one more recognized key" precedent `gap`/`scroll`/`content` all use).
`boundary=True` carries EXACTLY the fact `domain=='blackbox'` used to —
"an unmodeled subtree stands here" — while leaving the leaf's `domain`
free to be its TRUE subject-matter classification (or the census's
existing `?`/`flagged` convention when genuinely ambiguous). Every
existing `blackbox`-domain leaf in this repository's four `.lyt`
encodings updates mechanically: `domain='blackbox'` → the leaf's honest
domain + `boundary`. Geometry-inert on its own.

### 14.2 Constructor-total consumers

The consult report's own closure statement (its §6.2, quoted there in
full) names the class this re-homing closes: three consumers of the
`Slot` tree — `emit_layout_tree.py`'s Exclusive-node collapse, its
generated `blackbox` node kind, and `LytNode.vue`'s terminal-T case —
were depth-assuming special cases beside the general recursive shape
`parser.py`/`loader.py`/`wellformed.py`/`compiler.py` already exercise.
This wave retires the FIRST of those three: `emit_layout_tree.py`'s
Exclusive branch no longer asserts every T-child is a bare `ast.Leaf`
(`emit_layout_tree.py`'s own module docstring has the full disclosure);
it is now a genuine structural fold, total over Leaf|Split|Exclusive, so
a T-child may be an arbitrarily deep composite. The whole Exclusive node
still collapses to ONE synthetic `blackbox` leaf in the emitted TS
regardless of interior depth (§8.1's own resolution: "Wave 1 ships
solver-side with the marker sitting at the T... byte-identical") — the
retirement is about what the EMITTER refuses to accept as input, not
about where the realization boundary sits. `LytNode.vue`'s own
terminal-T case (the second/third consumers §6.2 names) is UNCHANGED by
this wave — a declared, still-open residual, not silently closed.

### 14.3 What this buys

Opening a control-panel tab's interior one level (Amendment 6's own
motivating case, `CP-analysis`/`CP-settings` in the lengyue encodings) is
now ordinary encoding data — moving where a `boundary`-marked leaf sits,
never a language change, never (for the emitter, at least) a tooling
change. The three-consumer class this retires is Rule 2(a)'s own worked
instance (ADR-0000): a depth-assumption in a consumer, foreclosed by
naming the fold total over the type's own constructors rather than
patching the one instance in view.

## 15. Amendment 7 — four keys and three laws ported from the model-iteration loop experiment: `ceiling`/L9, `unit <axis> <px>`/L10, `wrap <policy>`, `measure-bound`/L11

Adopted per M1 of the model-implementation arc (ledger rows 2107/2108;
the ratified program row 1937 continues), porting a verified language
extension proven out on the `lyt-model-loop-experiment` branch (six
iteration rounds, gallery-recorded) to mainline. [SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md)'s
own Amendment 7 entry is the dated ruling/rationale/provenance record;
this section is the current-state grammar/semantics, in the same form
§13/§14 give Amendments 5/6.

### 15.1 Grammar

Four more sizing-bag keys (§1.1), following the same "one more
recognized key in the existing bag" precedent every prior amendment's
extension used:

- **`ceiling`** (bare flag) — LEAF-only; requires `content bounded`
  (§13.1's `content` key). Refused loudly (`law: "L9"`) on a Split or
  Exclusive, or on a leaf whose `content` is not `bounded`.
- **`unit <axis> <extent>`**, `axis` ∈ `{h, v}` — LEAF-only; requires
  `content` in `{bounded, unbounded}`. Like `scroll` (§13.1), may be
  declared more than once in the same block to name both axes
  (accumulated, not overwritten); unlike `scroll`, at most ONE
  declaration per axis is legal — a second on the same axis is refused
  (`prohibition: "duplicate-unit-axis"`). The extent must resolve to a
  bare `px` literal — `fr`, `ch`, extent sums, and symbolic sentinels
  are all refused (`prohibition: "non-px-unit"`), the same "never
  silently reinterpret the author's declared unit" posture `gap` (§9.4)
  already takes.
- **`measure-bound`** (bare flag) — legal on a Leaf or a Split; refused
  on an Exclusive (`law: "L11"`, `prohibition:
  "measure-bound-on-exclusive"`) — every T-child shares one rectangle,
  so there is no residual for the declaration to name.
- **`wrap <policy>`**, closed vocabulary `{balanced}` — legal on a Leaf
  (requires a declared horizontal `unit`) or an Exclusive (no `unit`
  declaration required or accepted, since a T-group's own children ARE
  its units); refused on a Split (`law: "wrap-policy"`, `prohibition:
  "wrap-on-split"`).

Both `ceiling` and `measure-bound` keep the parser permissive (any
identifier accepted as a bare flag token) and the loader as the
enforcement point (`loader.py`'s `_load_ceiling_flag`/
`_load_measure_bound`), matching this parser's established "parser
permissive, loader refuses" division of labor. `unit`/`wrap` are
likewise parsed permissively (`parser.py`'s `_load_unit_axes` equivalent
at parse time accepts any identifier/extent pair) with the closed
vocabularies and node-kind/precondition refusals enforced by
`loader._load_unit_axes`/`_load_wrap_policy`.

### 15.2 Why these are four separate keys, not folded into existing ones

`ceiling` and `measure-bound` are both **realization-binding, solver-
inert** facts (like a cross-axis `scroll`/`unit` declaration, §13.3's
own "disclosed, not hidden" note) — `compiler.py` never reads either
field; both change only how the CSS Grid realization (§10) distributes
residual space once the CP-SAT solve has already run. `unit` and `wrap`
are a **declared vocabulary and its distribution policy** — orthogonal
to `content` (which says *what kind* of content a leaf holds) and to
`scroll` (which says *which container absorbs overflow*), the same
"don't conscript an orthogonal axis into an existing one" reasoning
§13.2 gives for keeping `content` off of `domain`/`facets`.

### 15.3 The laws L9, L10, L11

- **L9 (ceiling honesty).** *Load-time only* (`loader._load_ceiling_flag`)
  — no structural tree-walk checker, unlike L10/L11 below. A `ceiling`
  declaration says the slot's extent is an upper bound its content may
  occupy less than; enforcing that promise is a realization-time fact
  (does the rendered content actually stay within the reservation), not
  something a static tree walk over declared extents can check.
- **L10 (unit integrity).** *Checked*, by `wellformed.find_l10_violations`,
  in the SAME enforcement family as L2's dominance test and L5's overflow
  walk. Where a leaf's declared `unit <axis>` names the axis the leaf's
  own slot is actually PARTITIONED on (both axes for the root or a
  T-child, the `along=None` reading §8's bound-application branch
  already establishes), the slot's declared `min` must reserve at least
  one whole unit — a reservation that cannot stand one whole unit of the
  thing it is made of can only realize by splitting a unit. A unit on
  the CROSS axis constrains nothing checkable in this 1-D-per-slot
  sizing model (disclosed silence, same footing as `ceiling`); a `min`
  that is not a plain `px` extent is skipped rather than compared
  (ADR-0002: an honest silence over a fabricated comparison).
- **L11 (measure integrity).** *Checked*, by `wellformed.find_l11_violations`,
  same enforcement family. A `measure-bound` declaration is refused at
  the root (no parent partition to measure against, no sibling to leave
  the residual to) and over any subtree that does not hold EXACTLY ONE
  aspect-locked leaf (§4.1's `aspect` constraint) — none leaves nothing
  to convert a page measure into an extent; more than one leaves which
  leaf's lock does the converting ambiguous, the same unambiguous-owner
  reasoning L5b (§13.3) applies to scroll ownership.
- **`wrap-policy`** is deliberately UNTYPED — `detail.law ==
  "wrap-policy"`, a string token, not a numbered law. It never claimed a
  law number on the experiment branch that authored it (its own
  round-6 commit message called it "L8", but that number belongs to
  `measure-bound`'s own structural checker) and this port does not mint
  one for it retroactively.

All three numbered laws are arbitrated through the SAME `(law,
path)`-keyed `Waiver` mechanism `check_wellformed` already generalizes
for (§9.2), alongside L2 and L5/L5a/L5b/L5c.

**Dormancy.** Every one of L9/L10/L11 (and every `wrap-policy` refusal)
fires only when the tree it walks contains a genuine `ceiling`/`unit`/
`measure-bound`/`wrap` declaration. Neither reference encoding
(`lengyue_landscape.lyt`/`lengyue_portrait.lyt`) declares any of the
four keys as of this amendment — both are byte-identical, and both
re-solve to byte-identical CP-SAT output before and after this
amendment (verified; see [SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md)'s Amendment 7 entry and this
port's own dispatch report, `.claude/dispatch-reports/lyt-m1-substrate-port.md`).
The laws bind declarations; they do not retroactively indict silence —
the same posture §13.3's own dormancy note states for L5/L5a/L5b/L5c.

## 16. Amendment 8 — six keys and six laws ported from arc 4 of the model-iteration loop experiment: `min <axis>`/L12, `elastic <axis>`/L13, `ceiling <axis>` + the along/across role frame/L14, `activity`/`@demote`/L15, `floor <axis>`/L16, `edge <axis>`/L17

Adopted per M2 of the model-implementation arc (ledger rows
2107/2108/2157/2209/2228/2241/2269/2286; the ratified program row 1937
continues), porting arc 4 of the `lyt-model-loop-experiment` branch's
own six rounds to mainline, continuing §15's own M1 port of arc 1-2.
[SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md)'s own Amendment 8 entry is the
dated ruling/rationale/provenance record; this section is the
current-state grammar/semantics, in the same form §13/§14/§15 give
Amendments 5/6/7.

### 16.1 Grammar

Six more sizing-bag keys, plus one presence kind and one axis-token
extension, following the same "one more recognized key" precedent every
prior amendment used:

- **`min <axis> <extent>`**, `axis` ∈ `{h, v}` — accumulated like
  `scroll`/`unit`; legal only where the slot's rectangle is its parent's
  on both axes (root, or a direct child of an Exclusive/T node);
  refused structurally elsewhere (`law: "L12"`).
- **`elastic <axis>`**, `axis` ∈ `{h, v}` — LEAF-only; requires `content
  unbounded` (`law: "L13"`).
- **`ceiling <axis>`** — the per-axis form of §15's bare `ceiling` flag;
  LEAF-only, `{h,v}` after role resolution, requires an excess-owner on
  the same axis (`content bounded`, or a `scroll` on that axis) (`law:
  "L14"`).
- **The `along`/`across` role frame** — every axis-taking key above,
  plus `scroll`/`unit`/`min <axis>` from §13/§15, additionally accepts
  `along` (the leaf's own declared `orient`, §15.1 is unaffected — this
  reuses the same `orient` key) or `across` (the other axis) in place of
  a physical token. Resolved to a physical axis at load time
  (`loader._resolve_axis_token`) and never survives into the AST.
  Leaf-only — a role token on a Split or Exclusive names nothing (`law`
  matches the key it was declared on, `prohibition:
  "role-axis-on-non-leaf"`).
- **`activity <level>`**, closed vocabulary `{sustained, occasional}` —
  LEAF-only, last-write-wins (`law: "L15"`).
- **`@demote(<axis> <extent>)`** — a fourth presence kind beside
  `@fixed`/`@dev`/`@toggle` (§4.1); requires `activity occasional` and
  `content bounded` on the same leaf, a closed PHYSICAL axis vocabulary
  (roles refused by name here — a demotion's axis is the BAND's, not the
  leaf's own frame), and a constant px threshold (`law: "L15"`).
- **`floor <axis> <extent>`**, `axis` ∈ `{h, v}` — accumulated; LEAF-only;
  `{h,v}` after role resolution; a constant px extent judged on the RAW
  term before `ch` is folded into px (`law: "L16"`).
- **`edge <axis> <disposition>`**, `disposition` ∈ `{unit, item,
  continuous}` — accumulated; LEAF-only; `{h,v}` after role resolution;
  both directions of a join to `unit <axis>` (§15.1) are checked (`law:
  "L17"`).

Every key stays permissive at the parser layer (any identifier/extent
accepted) with the closed vocabularies, node-kind rules, and
preconditions enforced by `loader.py`, matching the established "parser
permissive, loader refuses" division of labor.

### 16.2 The laws L12-L17

- **L12 (floor attribution).** *Checked*, `wellformed.
  find_l12_violations`. SOLVER-VISIBLE, unlike every other law this
  amendment adds — `compiler._constrain` and the Exclusive branch's own
  componentwise-max both read `Sizing.axis_min(axis)`.
- **L13 (surplus attribution).** *Checked*, `wellformed.
  find_l13_violations`. Fires at the same both-axes position L12
  distinguishes: an unbounded leaf there must dispose of every axis its
  reservation can exceed its floor on, by `scroll`, `elastic`, or a
  pinned floor==cap.
- **L14 (demand attribution).** *Checked*, `wellformed.
  find_l14_violations`. The complement of L12/L13's scope — fires only
  at a Split child (one axis bound) whose leaf scrolls both axes and
  pins its partition axis with no `ceiling` on it.
- **L15 (demotion attribution).** *Checked*, `wellformed.
  find_l15_violations`, three clauses: a wrapping leaf must declare
  `activity`; a ranking is band-wide (all-or-nothing among a Split's
  direct leaf children); and a Split that can vacate entirely is a
  presence slot in disguise.
- **L16 (deficit attribution).** *Checked*, `wellformed.
  find_l16_violations`, three clauses: the trigger (an unbounded leaf
  that disposed of surplus and excess but never deficit); the join to
  L15 (reserve the floor, or be able to `@demote`); and reachability (a
  floor above the leaf's own constant cap is incoherent).
- **L17 (edge attribution).** *Checked*, `wellformed.
  find_l17_violations`, three clauses: the trigger (an unbounded,
  scrolling leaf owes an `edge` — WIDER than L16's own trigger, no
  `elastic` precondition); an edge is only where a scroll is; and the
  join to L13 (`edge <a> unit` and `elastic <a>` cannot both hold).

All six are arbitrated through the SAME `(law, path)`-keyed `Waiver`
mechanism `check_wellformed` already generalizes for, alongside L2, L5,
and L10/L11 (§13.3, §15.3).

**Dormancy.** Every one of L12-L17 fires only against a genuine
declaration or condition its own clause names — L12 on a declared
axis-keyed `min`; L13/L14/L15/L16/L17's structural halves on the
underlying condition (unbounded content, a two-axis scroller, a
wrapping leaf, a surplus-plus-excess leaf, a scroll) each law exists to
find, rather than only on a declaration of the law's own key. Neither
reference encoding declares any Amendment-8 key nor trips any of the
five condition-based checks, so all six return `[]` unconditionally as
of this amendment; both encodings re-solve to byte-identical CP-SAT
output before and after (verified; see
[SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md)'s Amendment 8 entry and this
port's own dispatch report,
`.claude/dispatch-reports/lyt-m2-substrate-port.md`). The laws bind
declarations and the conditions that oblige one; they do not
retroactively indict silence — the same posture §13.3/§15.3's own
dormancy notes state.

**Scope note.** This port covers the `research/lyt` Python language
substrate only. The experiment branch's own `emit_layout_tree.py`
realization-layer emission for these six keys, and the frontend-side
`along h|v` orientation-invariance consumer, are explicitly out of this
amendment's scope — see [SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md)'s
Amendment 8 entry for the disclosed reasons.

## Status of the other LYT documents

This file is the **current-state, standalone specification**. The two
other documents in this history now serve narrower, explicitly
different roles:

- **[.claude/dispatch-reports/layout-language-consult.md](../../.claude/dispatch-reports/layout-language-consult.md)** is the
  original external design consult — the historical record of LYT's
  first design. It is cited above wherever this specification traces a
  claim back to it, and quoted where its own prose is the subject of a
  divergence; it is not restated or rewritten, and it is not itself
  kept current — this file is.
- **[SPEC-AMENDMENTS.md](SPEC-AMENDMENTS.md)** is the append-only, dated **amendment
  record**: the five ledger-adjudicated rulings, their rationale as
  recorded on each ledger row, and each amendment's diff against the
  consult document's original prose. It remains the place to find *why*
  a rule changed and *when*; this specification is the place to find
  *what the rule is today*.
- **[README.md](README.md)** is the **operational guide** — how to run the
  prototype, what its CLI does, what a `--baseline` load does, and the
  build/review-report trail. Language-definition prose that used to
  live there now points here instead.

## License

Public Domain (The Unlicense), matching [layout-language-consult.md](../../.claude/dispatch-reports/layout-language-consult.md)'s
own license and the umbrella's ADR-0006 per-file convention.
