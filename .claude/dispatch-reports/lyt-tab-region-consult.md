# LYT and the unmodeled control-panel tab region — design consult

External design consult per ADR-0018 (witnessed problem + evidence + law only;
no candidate answers received). Commissioned 2026-08-11 against the witnessed
symptoms: the Basic and Stability analysis panes each need scrolling inside the
control-panel container — *different amounts* of scrolling — and the settings
tab's horizontal layout produces scrollbars; the control-panel tab group is
today five opaque `[blackbox]` leaves in the LYT encodings, so none of this is
visible at the program level.

**Read record (ADR-0002-on-documentation).** Read end to end for this consult:
the umbrella `CLAUDE.md`; `docs/adr/0000-the-alpha-and-the-omega-type-driven-design.md`;
`docs/adr/0002-fail-loudly.md`; `docs/adr/0008-classification-discipline.md`;
`docs/adr/0012-compositional-and-structural-hygiene.md`;
`docs/adr/0018-consults-are-not-front-loaded.md`; `research/lyt/README.md`;
`research/lyt/SPEC.md`; `research/lyt/SPEC-AMENDMENTS.md`;
`research/lyt/encodings/lengyue_landscape.lyt` (all header comments) and
`lengyue_portrait.lyt`; `.claude/dispatch-reports/layout-language-consult.md`
(the spec-of-record consult document); `frontend/src/components/chrome/LytNode.vue`;
`frontend/src/state/lyt-layout.gen.ts`;
`frontend/src/components/charts/AnalysisDashboard.vue`. Consulted partially
(sanctioned lookup mode / targeted excerpts): `frontend/FILES.md`,
`frontend/src/App.vue` (control-panel mount + `#control-panel` CSS),
`frontend/src/components/SettingsTab.vue` (header docstring + sub-tab list),
`frontend/src/components/chrome/TabWidget.vue` (overflow rules, via grep),
`frontend/assets` overflow rules in `frontend/src/assets/css/style.css` (grep),
`frontend/src/store/defaults.ts` (default analysis-tab table, grep),
`research/lyt/emit_layout_tree.py` (T-collapse disclosure, targeted). The
ledger row 1849 purpose ruling is relied on in the commission's paraphrase, as
supplied. Nothing else is cited below.

---

## 1. What is actually there — the witnessed structure, established

Before the option space can be justified, the facts of the region must be on
the table, because they constrain which options are even coherent.

**The encoding side.** In both encodings the control-panel region is a
`T(CP-library, CP-cards, CP-settings, CP-analysis, CP-other)[BLACK BOX]` whose
five children are `[blackbox]`-domain leaves carrying only a width floor
(landscape: `min 160px, pref 1fr, max inf` since the W4 floor-softening;
portrait: `min 200px`). The opacity is the original commission's ratified
scope: the consult document's §2 explicitly commissions the tab contents as an
opaque black box, and the landscape encoding's header records that the five
CP-* names in §5.4 "aren't bracketed leaves at all — they're prose naming the
control-panel tabs."

**The realization side.** `emit_layout_tree.py` collapses the whole Exclusive
node into a single synthetic `blackbox` leaf (widget id `controlPanel`) in
`lyt-layout.gen.ts` — and *asserts* that every T-node child is a plain leaf
(line ~384). `LytNode.vue` treats the blackbox as terminal and projects one
named slot (`#leaf-controlPanel`), which `App.vue` fills with `TabWidget` and
the five tab bodies. So the LYT/DOM boundary today sits exactly at the T node:
everything inside it is invisible to the program, the solver, and the
generated tree alike.

**What the box actually contains** (the part the symptoms live in):

- The **analysis tab** (`CP-analysis`) mounts `AnalysisControls` →
  `AnalysisDashboard`, which is: a persistent timeline header, then a **second,
  nested tab group** — the user-defined analysis tabs
  (`AppSettings.analysisTabs`; defaults in `store/defaults.ts`: **Basic** =
  interval-summary + scoreLead + mergedDelta panels, a Distributions tab, and
  **Stability** = stability + stability-cross-correlation panels) — each pane a
  vertical stack of panels inside `.scrollable-content { overflow-y: auto }`.
  The witnessed "different amounts of scrolling" is precisely: sibling panes of
  a T-shaped group whose interior height demands differ, inside one shared
  rectangle, each independently scrolling its own shortfall.
- The **settings tab** (`CP-settings`) mounts `SettingsTab`, which hosts **six
  sub-tabs** via `TabWidget` in (default) horizontal orientation; the strip
  carries its own `overflow-x: auto`, and the vertical-tabs alternative exists
  as a quiet persisted user option precisely because the horizontal strip
  scrolls at reasonable widths — the witnessed settings scrollbars.
- Overflow behavior is scattered across at least three nested CSS layers with
  independent owners: `#control-panel { overflow: auto }` in `style.css` (its
  own comment: kept "until a follow-up consolidates control-panel styling"),
  `TabWidget`'s `.tab-body { overflow-y: auto }`, and
  `AnalysisDashboard`'s `.scrollable-content { overflow-y: auto }`.

**Three load-bearing facts about the language**, verified against SPEC.md:

1. **The T node is already the right shape for tab groups** — every child gets
   the same rectangle; the group's min is the componentwise max of children's
   minima; switching is reflow-free by construction (§2). The witnessed defect
   class is not "LYT cannot describe tabs"; it is "the tabs *inside* the
   blackbox were never described."
2. **A T child's sizing bounds apply to both axes** (§8, the `along=None`
   branch) — one `min/pref/max` triple per child, constraining w *and* h
   identically. A bare leaf therefore cannot declare "160px wide but 600px
   tall." However, a **composite** T child (a V split with interior leaves)
   acquires a structural height floor from its children's hard partition
   equality — so per-pane height demands *are* expressible in the current
   language, via interior modeling, with no 2-D sizing extension.
3. **Scrolling interiors are today deliberately out of the language.** The
   consult document's §6: "a leaf that scrolls is just a leaf whose content
   exceeds its reservation — the reservation still holds." Meanwhile the
   landscape encoding's W1 REPAIR header treats scrolling as *rejected* under
   the standing "never hide content" law for the toolbar. These two postures
   coexist unreconciled: scroll is sanctioned-by-silence inside the blackbox
   and rejected-as-hiding outside it. The witnessed symptoms sit exactly on
   this unreconciled seam. (See §5, question Q1 — this needs a ruling, not a
   derivation.)

**The governing purpose ruling** (row 1849, paraphrase on record): LYT is the
disciplined reasoning medium for layout; the DOM/CSS realization is
subordinate; an aesthetic defect should be isolatable at the program level
without navigating a DOM in a browser. Today the witnessed defects are
*unrepresentable* at the program level — the program says `blackbox, min
160px` and nothing else — so the commissioner's "the analysis tabs aren't
modeled" observation is, in ADR-0000 terms, the finding that the current type
leaves the defect class not merely representable but **invisible**.

---

## 2. Justifying the option space itself

The space of coherent options is spanned by two independent axes:

- **Axis 1 — how deep the modeling boundary moves.** The blackbox boundary can
  stay where it is; move one structural level in (the nested tab groups and
  their panes as opaque-but-sized children); or go to full leaf depth (every
  panel, strip, and editor a census leaf).
- **Axis 2 — whether overflow becomes a language concept.** Scroll can remain
  unmodeled (the consult document's §6 posture); or become a typed, declared
  disposition with a law; or be eliminated by construction (reserve the
  envelope max, no scroll anywhere).

Everything below is a point or path in this 3×3 grid, minus the corners that
are incoherent. What was **considered and excluded** from the space entirely:

- **A dynamic-tree stratum for user-authored layouts.** The analysis tabs are
  runtime data — users add/rename/reorder tabs and re-assign panels
  (`AnalysisTabsEditor`). A language extension in which the Program's tree
  varies with user configuration would dissolve LYT's foundational shape (a
  *finite family* of static trees per screen class, §6) and make the offline
  solver's question ("is this geometry feasible?") unanswerable at authoring
  time. Excluded as category error, not as too-expensive: the precedent for
  runtime-varying facts is Amendment 4's move — solve the **default**
  valuation statically, name the residual honestly — not a dynamic tree.
- **A `basis: 'content'` revival ("size the pane from what it renders").**
  The absence of content-driven sizing is the language's one load-bearing idea
  and its first typed impossibility (§4.2). Any option that reintroduces
  content measurement — even dressed as "measure the pane once and reserve
  that" — re-opens defect class (a) at the language level. Excluded absolutely.
- **2-D per-axis sizing blocks for T children.** Considered because of
  load-bearing fact 2 above; excluded as *unnecessary* for this problem
  (composite interiors already carry cross-axis floors structurally) and as a
  larger spec surgery than the witnessed defect warrants. Recorded as a spec
  observation (§6) rather than an option.
- **Content-adaptive interiors** ("the panel shrinks its chart to fit") —
  content behavior inside a reservation is outside LYT's strata by design; the
  realization owns it. Excluded.

The options that survive these exclusions are enumerated in §3 below.

---

## 3. The option space

### Option 0 — Reaffirm the black box; declare the symptoms out of scope

Keep the ratified opacity. Scrolling interiors remain the consult document §6's
"reservation still holds" case; the differential-scroll aesthetic and the
settings scrollbars are treated as realization-layer CSS matters.

- **Boundary:** no language, encoding, or realization change.
- **Expressible/checkable:** nothing new. The witnessed defects stay
  *unrepresentable* in the program.
- **Tradeoffs:** zero cost; maximal stability of the ratified scope. But it
  directly contradicts the row-1849 purpose ruling — a witnessed aesthetic
  defect that cannot be isolated at the program level is exactly what that
  ruling says LYT exists to prevent — and it leaves the "never hide content"
  law unreconciled with three layers of silent `overflow: auto`. Under
  ADR-0000 Rule 2 this is the patch-reflex's null form: the class stays
  representable (here: invisible), and the next symptom is one content change
  away.
- **Forecloses:** nothing (the box can be opened later); but it *defers* the
  reconciliation of the scroll/never-hide-content seam, which is the actual
  root.

Included for honesty; not recommended.

### Option A — Open the box to full leaf depth (encoding-maximal)

Replace each CP-* blackbox leaf with a full interior transcription: every
panel, strip, editor, and header a census leaf with facets/domains, nested
T nodes for the analysis tabs and settings sub-tabs, envelope declarations on
every varying readout.

- **Boundary:** encoding + census (registration layer) only; the language
  already has every needed construct. Realization: `emit_layout_tree.py`'s
  plain-leaf assertion breaks — either the emitter learns to collapse a
  composite T regardless of interior shape (modeling stays solver-side), or
  `LytNode.vue` learns to recurse into T nodes (a substantial realization
  arc — the current `#leaf-controlPanel` slot boundary, TabWidget, the
  identity-key remount, and the inner resizer anchor all live there).
- **Expressible/checkable:** per-pane height demands become structural floors;
  the T's envelope (componentwise max) becomes a *derived, honest* number; the
  solver answers "can this screen size afford the worst pane?" per size; L2
  runs inside the panes; per-pane shortfall (demand − reservation) is
  computable offline — the full row-1849 isolatability.
- **Tradeoffs and why it overreaches:**
  1. **The census explodes into judgment territory.** The panel surface is
     large, band-3-heavy, and much of it is data-dense chart content whose
     "height demand" has no honest static answer — a stability chart or a
     virtual-scrolled library table has no envelope state list that is not a
     lie. L3's own honest limit (declarations can lie; completeness is
     review's) is stretched past what review can carry. ADR-0008's negative
     register applies: forcing every interior element into the census
     fabricates classifications under ambiguity.
  2. **The user-defined analysis tabs make full static modeling impossible
     anyway** — the encoding could only ever transcribe the *default* tab
     configuration; full depth buys no coverage of the actual variability.
  3. It re-litigates the original commission's deliberate scope with maximal
     force where a narrower opening captures the entire witnessed defect
     class (Option C).
- **Forecloses:** little formally, but it commits the census to a large
  maintenance surface that every future panel change must keep in sync — a
  standing two-writers hazard (ADR-0012 B) between the panel registry
  (`panel-registry.ts`, `AppSettings.analysisTabs`) and the encoding.

### Option B — Make overflow a typed language concept (language-first)

Amend the language (Amendment 5 candidate) so that overflow is a **declared,
typed disposition** rather than an unmodeled CSS accident. Sketch, staying
inside the parser's established "one more key in the same bag" extension
style: a sizing block may carry `scroll <axis>` (`scroll v` / `scroll h`),
legal on leaves and T children. Paired law (call it **L5, overflow honesty**):

> A slot whose content can exceed its reservation on an axis must either carry
> an `envelope` whose declared states are all claimed to fit, or declare
> `scroll` on that axis. A slot with neither makes any observed overflow a
> fail-loud event (ADR-0002), not a silent clip and not a silent scrollbar.

And the differential-scroll aesthetic becomes *observable*: for every T group,
the toolchain emits an advisory per-child report — declared demand vs shared
rectangle, i.e. each pane's shortfall — so "these siblings scroll by different
amounts" is a program-level fact printed by the runner, per ADR-0011 Rule 5's
judgment-shaped-output-gets-an-advisory-surface (the aesthetic *policy* — is
differential scroll acceptable? — is the commissioner's, §5 Q1; the language's
job is to make it visible and checkable, not to decide it).

- **Boundary:** language (parser/loader/AST + one law) + encoding (the
  declarations at whatever depth the box is opened) + a small but real
  realization consequence: the scattered `overflow` CSS (three independent
  writers today) gets one authoritative home in the program, and the
  realization *derives* its overflow behavior from the declaration — the
  ADR-0012 P1/P7 move (one authority, every side derives, no second
  hand-author). The `style.css` comment "until a follow-up consolidates
  control-panel styling" is that follow-up's natural discharge.
- **Expressible/checkable:** scroll stops being invisible. Whichever way the
  never-hide-content ruling goes, the declaration is the enforcement point: if
  scroll is ruled compatible with the law (reachable-by-scroll ≠ hidden), an
  *undeclared* overflow is the violation; if ruled incompatible for a class of
  slots (chrome/action bands, say), the *declaration itself* is refusable on
  those slots by type — `scroll` on a leaf with `action ∈ facets` can be a
  load refusal, exactly parallel to `@toggle(system, release)`'s typed
  impossibility. The rule is policy-neutral machinery for a policy the
  commissioner owns.
- **Tradeoffs:** it is a genuine language extension (same footing as
  Amendments 1–4: not a reading recovered from existing text — the consult
  document's §6 explicitly declined to model scrolling, and this reverses
  that). Alone — without opening the box at all — it has almost nothing to
  attach to in this region: the blackbox leaves would each carry one blanket
  `scroll v` and the differential-scroll fact would still be invisible (one
  leaf, one declaration, no siblings to compare). **B without some of A/C is
  toothless here; B is a companion amendment, not a standalone resolution.**
- **Forecloses:** nothing; leaves the depth question open.

### Option C — Open the box one structural level; model the tab *skeletons*, keep pane contents opaque (the middle path)

Replace each CP-* leaf with a shallow composite that models exactly the
structure the symptoms live in, and no more:

- `CP-analysis` → `V( timeline-strip, T( AT-basic, AT-distributions,
  AT-stability ) )` where the nested T transcribes the **default** analysis-tab
  configuration (Amendment 4's default-valuation precedent, applied to
  structure) and each `AT-*` child is itself a small `V` of **opaque pane-body
  leaves carrying honest height floors/envelopes** — blackbox-domain still, but
  *sized*. Chart panels with a designed preferred height declare it; unbounded
  content (tables) declares `scroll` (if Option B lands) or an envelope named
  honestly as the bounded part.
- `CP-settings` → `V( substrip, pane )` (or the transposed H for the vertical
  orientation variant — see §5 Q3): the sub-tab strip is a leaf whose width
  demand is a **ch-measured envelope over the six static sub-tab labels** —
  the settings-scrollbar symptom becomes a load-time/solve-time comparison of
  strip demand vs the column floor, i.e. exactly the class of fact the W4
  floor-softening arc negotiated for the toolbar, now derivable instead of
  Playwright-swept. The pane body stays an opaque sized leaf.
- `CP-library`, `CP-cards`, `CP-other` stay opaque leaves (no witnessed
  symptom; opening them is not earned — ADR-0008: don't classify what hasn't
  crystallised), but gain honest height floors where a real one is known.

- **Boundary:** encoding + census (a dozen-odd new leaves, not hundreds);
  **no language change strictly required** (load-bearing fact 2/§1: composite
  T children carry height floors structurally today); Option B is the natural
  companion, not a prerequisite. Realization: the first-wave form is
  **solver-side only** — `emit_layout_tree.py` collapses the (now composite) T
  to the same single `controlPanel` blackbox it emits today (its plain-leaf
  assertion relaxed to "collapse any T subtree"), `LytNode.vue` and the
  `#leaf-controlPanel` slot untouched. The program models the interior; the
  offline solver reasons about it; the live DOM keeps its current mount.
  The realization end-state is resolved in §8.1 (it is derivable, not a
  ratifier decision): LytNode becomes constructor-total, and the realization
  boundary becomes encoding data — filed as a named work-status item at
  adoption, never left as an unfiled "later wave" (ADR-0013 Rule 4).
- **Expressible/checkable:** the two witnessed symptoms become program-level
  facts. Differential scrolling: the nested T's children have differing
  structural height demands; the per-T shortfall report (or, pre-B, simply the
  per-child derived minima printed by the runner) states *which pane exceeds
  the shared rectangle by how much, at which screen size* — isolatable without
  a browser, per row 1849. Settings scrollbars: strip ch-demand vs column
  width, same. Infeasibility stays an answer, not an error: if the Stability
  pane's honest floor cannot fit at 1366×768, the solve says so, and the
  design choice (raise the region, shrink the pane's declared demand by
  redesign, or declare scroll) is surfaced to the commissioner exactly the way
  Amendment 1's banner-floor consequence was.
- **What remains honestly unrepresentable, named:** (i) user-*modified*
  analysis-tab layouts — only the default configuration is modeled; a user who
  builds a seven-panel tab is outside the static guarantee (residual named in
  §5 Q2); (ii) data-dependent content growth inside a pane — the language
  bounds the *reservation* and (with B) the overflow *disposition*, never the
  content; (iii) the L3 half-gap carries over: envelope completeness for pane
  demands is review's to keep honest, same as every enumerated vocabulary.
- **Tradeoffs:** the encoding acquires its first *derived-from-component-
  design* height numbers, which can drift from the components the same way any
  reservation can (the existing discipline — grounding citations in the
  encoding header, measured sweeps for contested floors — is the mitigation,
  already practiced in this file's W1-REPAIR/W4 history). And the nested-T
  transcription duplicates a fact that lives in `store/defaults.ts` /
  `panel-registry.ts` — a real, bounded two-writers seam; the honest
  disposition is a cross-check test (registration-layer regression comparing
  the encoding's nested-T children to the default `analysisTabs` table, the
  same move Amendment 4 made for `TOGGLE_TARGETS` vs `default_valuation`), so
  the drift is loud, not silent.

### Option D — Realization-only normalization

Consolidate the three scattered overflow layers into one canonical scroll
container with uniform behavior; touch neither language nor encoding.

- **Boundary:** realization (CSS/Vue) only.
- **Tradeoffs:** it would likely *improve* the felt symptom (one consistent
  scroll surface instead of nested independent ones), and the `style.css`
  consolidation comment already gestures at it. But it is precisely the move
  the row-1849 ruling subordinates: the defect gets fixed in the DOM while the
  program still cannot express that it existed. Under ADR-0000 it is the
  contrast specimen — the instance patched, the class (unmodeled interior
  demand) untouched. Legitimate as a *by-product* of Option B's
  derive-overflow-from-the-program move; illegitimate as the resolution.

### Option E — No-scroll-by-construction (reserve the envelope max)

Model interiors (as in A or C) and then *forbid* scroll: the T group's
reservation must cover the max pane demand; anything else is INFEASIBLE.

- **Tradeoffs:** this is the purest reading of "never hide content," and for
  bounded interiors it is simply Option C with the strictest law setting. But
  applied to the whole region it collides with reality: pane contents include
  genuinely unbounded data (tables, logs, long editors), for which "reserve
  the max" has no honest number — the encoding would either lie (an L3
  violation by construction) or go INFEASIBLE at every size. It also
  pre-empts the commissioner's aesthetic ruling by hard-coding one answer.
  Viable only as the per-slot strict end of Option B's law dial, chosen
  slot-by-slot; not viable as the region's blanket rule.

---

## 4. Recommendation

**Adopt C, with B as its companion amendment; stage them C-first. Explicitly
do not do 0, A, D-as-resolution, or blanket E.**

Reasoning, in the codebase's own register:

1. **C is the type-driven answer at the right granularity.** ADR-0000 Rule 2(a)
   asks what shape makes the class unrepresentable. The class here is
   "interior demand invisible to the program." C forecloses it for exactly the
   structures the symptoms occupy — nested tab groups and their panes — using
   constructs the language already owns (T semantics, composite children,
   envelopes, ch units, the default-configuration precedent from Amendment 4).
   No new mechanism is minted where an existing one serves (ADR-0012's
   propagation-by-default: the right idea, applied once at the outer tab
   group, finally propagated inward one level).
2. **B is what makes the *scroll* half of the symptom a typed fact rather than
   a CSS accident**, and it is policy-neutral: it gives the commissioner's
   forthcoming never-hide-content ruling (§5 Q1) an enforcement surface
   whichever way it goes, and it converts today's three-writer overflow CSS
   into a derive-from-one-authority shape (ADR-0012 P1/P7). Staged second
   because its law's severity setting depends on Q1, while C's modeling value
   is ruling-independent.
3. **The census stays honest.** C opens only what the symptoms have earned;
   the three quiet tabs stay opaque-but-sized (ADR-0008: flat/opaque under
   ambiguity beats fabricated classification), and the user-authored residual
   is named, not papered over — the same honest-residual posture every
   amendment in SPEC-AMENDMENTS.md models.
4. **The realization boundary moves zero pixels in the first wave.**
   Solver-side modeling with the emitter's collapse retained keeps W1–W4's
   hard-won mount/resizer/identity-key structure untouched and keeps the
   change auditable as an encoding diff plus solver output — the reasoning
   medium leads, the DOM follows later if ratified, which is the row-1849
   ordering.

**What I would explicitly NOT do, and why:**

- **Not Option 0** — it contradicts the purpose ruling and leaves the
  scroll/never-hide-content seam silently unreconciled (the ADR-0002 silent
  failure, at the constitutional level).
- **Not Option A** — full-depth census is fabricated classification over
  data-driven content, buys no coverage of the actual (user-authored)
  variability, and maximizes the two-writers maintenance surface for no
  additional capture of the witnessed class.
- **Not D as the resolution** — DOM-first is the subordination row 1849
  forbids; keep it only as B's derived by-product.
- **Not blanket E** — "reserve the max" has no honest number for unbounded
  content; as a region-wide rule it forces either lying envelopes or
  universal infeasibility, and it usurps a ruling that is the commissioner's.
- **Not a content-measurement basis, not a dynamic-tree stratum, not 2-D
  T-child sizing** — per §2's exclusions (the first is the language's founding
  prohibition; the second dissolves the finite-static-family shape; the third
  is unnecessary surgery given structural floors).

---

## 5. Questions that genuinely require the commissioner's ruling

Named as such per the commission; none is derivable from the law on record.

**Q1 — Where does scrolling sit relative to "never hide content"?** The record
is genuinely split: the W1 REPAIR header rejects scrolling for the toolbar
under that law, while the consult document §6 sanctions scrolling interiors
("the reservation still holds") and the control panel scrolls today at three
nested layers. Is reachable-by-scroll "hidden"? Is the answer facet-dependent
(scroll never on `action`-faceted chrome, permissible on `info`/content
panes)? Option B's machinery serves any answer, but the *law setting* — which
slots may declare `scroll`, and whether differential scroll among T siblings
is a violation, an advisory, or acceptable — is an aesthetic/product ruling
only the commissioner can make. This is the single question the whole region
hangs on.

**Q2 — Does the modeling guarantee extend to user-authored analysis-tab
layouts, or to the default configuration only?** The static tree can model the
default (Amendment 4's precedent). If the guarantee must cover user-authored
layouts, the only honest instruments are runtime ones (a dev-build advisory
check comparing a user's tab layout demands to the live region rectangle —
L3's fail-loud runtime half, finally given a runtime), which is a different,
larger commission. Ruling needed on which residual is acceptable.

**Q3 — Is the settings vertical-tabs orientation variant in scope for
modeling?** It is a persisted user choice producing two structural variants of
`CP-settings`'s interior. Precedent offers two shapes — model the default
(horizontal, per the standing "bad old times" ruling) and name the variant as
residual, or treat orientation like a presence valuation (two solves). Small
either way, but it is a scope call on ratified prior rulings (rows
1505/1509/1515/1516), so it is the commissioner's.

**Q4 — Ratification of the boundary move itself.** The blackbox opacity was
the original commission's ratified scope; Option C narrows it deliberately.
This consult recommends the narrowing but cannot ratify it — per the standing
disclosed-narrowing discipline, the boundary change is surfaced here for
explicit ratification, not enacted.

---

## 6. Follow-up (2026-08-11) — commissioner question: "What is the ADR-0000 shape that permits arbitrary nesting?"

Answered per ADR-0018 (derived, not supplied). Short form first: **the shape
already exists, and it is the language's own core type — `Slot` is an
inductive sum type, closed under its own constructors. Arbitrary nesting is
not a feature to add; it is what an inductive type *is*. What forbids
arbitrary nesting today is not the type but three consumers and one
classification that break faith with the recursion.** The ADR-0000
disposition is therefore not "extend the language" but "hold every consumer
to the type, and re-home one misfiled fact."

### 6.1 The type, named

```
Slot      = Presence × Sizing × Node
Node      = Leaf | Split(axis, gap, children: Slot⁺) | Exclusive(children: Slot⁺)
```

This is a recursively defined algebraic data type — `Split` and `Exclusive`
children are `Slot`s, so a T inside a V inside a T is a well-typed value at
every depth, today, with no amendment. The semantics compose the same way:
§2's T rule ("every child receives the whole rectangle") applied to a nested
T gives the inner children the inner rectangle, which *is* the outer one —
exactly the witnessed DOM (a TabWidget strip inside a TabWidget body:
control-panel tabs → AnalysisDashboard tabs). The §10 realization mapping
(T = auto strip + 1fr body) nests strips-within-bodies with no new rule.
Under ADR-0000 Rule 1 this is the whole answer to "what permits nesting":
**the recursion in the type is the design; depth-genericity is its
consequence, not a capability layered on.**

### 6.2 The class, and where it actually lives

Rule 2(a), class named in its most general form: *"a consumer of the Slot
tree that pattern-matches an assumed depth or an assumed constructor shape,
so structure at the next depth is silently invisible or refused."* The
witnessed "the analysis tabs aren't modeled" is one instance; the class is
depth-assumption in consumers, and the corpus splits cleanly:

- **Conformers (structural folds, total over the three constructors):**
  `parser.py`/`loader.py` (recursive descent), `wellformed.py` (walks every
  Split at any depth), `compiler.py` (`_constrain` recurses generically —
  Amendment 4's prune and the `is_aspect_leaf` generalization are prior
  worked proofs that this consumer quantifies over the class, not an
  instance).
- **Violators (depth-assuming special cases):**
  1. `emit_layout_tree.py`'s collapse **asserts every T child is a plain
     leaf** (~line 384) — a constructor-shape assumption that makes a
     composite T child a build error, not a rendered structure;
  2. the generated `lyt-layout.gen.ts` consequently carries a synthetic
     terminal `blackbox` node kind that the hand-written types must mirror;
  3. `LytNode.vue` treats the (collapsed) Exclusive as terminal — it
     recurses into Split but not into T.

  Each is ADR-0012's cancer E in miniature: the general recursive shape
  exists (and is exercised by the solver) beside a hand-specialized live
  path; and each is ADR-0011 Rule 4's enumeration-fails-open — conformant at
  today's depth, broken at depth+1.

**Closure statement** (ADR-0000, 2026-07-02 amendment form): *invariant* —
every LYT tree consumer is a structural fold over `Leaf | Split | Exclusive`,
total in depth and constructor position; *quantification universe* — the
seven consumers above (four conform; the emitter, the generated node
vocabulary, and the Vue renderer's T case do not; the runtime toggle registry
`lyt-widget-registry.ts` inherits the emitter's terminal-blackbox shape and
is covered under it); *denomination* — the bound is denominated in
constructor coverage, not in tree depth or child count, because constructor
coverage is the resource that actually detonates (a depth literal would be
the wrong-currency bound the amendment forbids).

### 6.3 The one re-homing: opacity is a boundary marker, not a domain

The current spelling of "unmodeled" is `domain: 'blackbox'` — a sixth member
appended to the *subject-matter* domain union, which SPEC §1 itself discloses
as "a placeholder domain for content this prototype does not model further."
That is an ADR-0008 category misfit, disclosed but load-bearing: it conflates
two orthogonal axes (what region of the app a leaf belongs to; whether the
encoding models past this node), and it forces opacity to be leaf-shaped —
you cannot mark "opaque beyond here" on a node that has any modeled
structure, which is exactly why "open the box one level" reads as a special
event rather than a routine encoding edit.

The ADR-0000-clean shape: **the modeling boundary is the recursion's base
case, placeable as a value at any node** — a leaf whose *meaning* is "an
unmodeled subtree stands here" (its true domain tag free to say `go`,
`common`, or honestly-flagged, per the census's existing `?` convention),
rather than a domain that says "unmodeled" while occupying the subject-matter
axis. With that re-homing, the boundary's position becomes pure encoding
data over an already-depth-generic type: opening CP-analysis one level, or a
future interior three levels, is moving where the base-case markers sit —
never a language change, never an emitter change, at any depth, forever.

### 6.4 Consequence for the recommendation (§4), unchanged but sharpened

Option C's "one level" is thereby not an instance patch wearing a
recommendation: the *level count* is an encoding decision over a type that
already permits every depth; what Rule 2(a) additionally demands — and this
follow-up adds to the recommendation — is that the accompanying wave
**retire the three depth-assumptions** (relax the emitter's plain-leaf-T
assertion to "collapse any subtree at a boundary marker"; keep or extend the
Vue T-case knowingly, as a *declared* realization boundary rather than an
assumed one) and **file the `blackbox`-domain re-homing** as the ADR-0008
vocabulary revision it is (in scope for the same amendment wave as Option B,
or filed as its own small ruling). Then the next "the inner X isn't modeled"
can never recur as a language or tooling event — only as an encoding
decision the commissioner can read, contest, and move.

### 6.5 Second follow-up question (same date) — "Additionally, the option to prevent scrolling at all," resolved in its own right

§3's Option E treated no-scroll as a law setting inside Option B; the
commissioner asks for it as a first-class option. Resolved here as one.

**What the option means, stated precisely.** "Prevent scrolling at all" =
for every slot, at every screen class and presence valuation, content demand
≤ reservation on both axes — the T-group idea ("big enough for whichever
child is showing") applied not just to tab *switching* but to tab
*contents*: reserve the componentwise max over every pane's demand, and let
INFEASIBLE, not a scrollbar, be the answer where a size cannot afford it.

**First finding — the status quo already "prevents" scrolling, in the way
that doesn't work.** LYT today has no scroll concept at all: scrolling is
*unrepresentable in the model* and simultaneously *rampant in the
realization* (three nested `overflow: auto` layers, §1). This is the proof,
on the record, that refusing to model scroll is not preventing it — it is
being unable to see it. So the option cannot be achieved by keeping scroll
out of the language; it requires the same machinery as the permissive
answer — modeled interior demand (Option C) plus a law plus
realization-derives-from-program — with the law's dial turned to its strict
end: the `scroll` disposition simply *not admitted* (or admitted and
refusable per slot class), and L5 reading "every content-varying slot is
envelope-covered and every envelope fits its reservation." Strict-mode
no-scroll and permissive declared-scroll differ **only in the law setting**,
not in the machinery. That is why E was folded into B in §3; unfolded here,
it resolves by content class:

**Second finding — satisfiability splits into three content classes**, and
the option's honesty differs per class:

1. **Statically bounded chrome and controls** (strips, toolbars, sub-tab
   rails, fixed-field editors): an honest envelope exists (ch-measured
   labels, fixed field sets). No-scroll is achievable outright, and the
   record already contains its worked unit economics: the W1 REPAIR arc
   rejected scrolling for the toolbar under "never hide content," raised the
   reservation to the measured demand (340→480→345px, 84→384px), and paid in
   board width and a feasibility-pin negotiation. The settings sub-tab strip
   is exactly this class — its scrollbar is eliminable the same way the
   toolbar's was, priced by the solver instead of a Playwright sweep once
   modeled.
2. **Designed-height panels** (the analysis charts, interval summary): the
   demand is a design fact, not a data fact — an envelope is honest if the
   component's height is genuinely designed rather than emergent. No-scroll
   is achievable *conditionally*: the T reserves the max pane demand; where
   a pinned-OPTIMAL size (1366×768, the W4-recovered trio) cannot afford it,
   the solve goes INFEASIBLE and surfaces a real design choice — shrink the
   default panel stack, redesign a panel's height, spend a feasibility pin,
   or grow the region. Amendment 1's banner-floor consequence is the exact
   precedent: a genuine floor may make sizes infeasible, and that is correct
   behavior surfacing a tradeoff, not a bug.
3. **Unbounded data collections** (library table, cards/forest browse,
   registry editors, system log): the pigeonhole fact governs — a bounded
   rectangle cannot display unbounded content, so *some* content is
   off-canvas under **any** mechanism. "Preventing scroll" here does not
   eliminate hiding; it substitutes the reach affordance (pagination,
   search/filter, collapse, virtualization — the library table is already
   virtual-scrolled). That substitution is a **component-redesign
   commission, not a layout fact**: LYT can express the reservation and
   refuse the scroll declaration, but it cannot make a table paginate. And
   whether paged-but-reachable is less "hidden" than scrollable-but-
   reachable is precisely the Q1 ruling again, in different clothes — not
   derivable.

**Resolution.** The option is coherent, expressible, and *partially*
adoptable — but not as a global rule, and not first:

- **Do not adopt globally.** For class 3 the global rule forces either lying
  envelopes (an L3 violation by construction, which the language must refuse)
  or permanent infeasibility; the strictest honest global statement is "no
  *undeclared* overflow anywhere" (which is L5 itself), not "no scroll
  anywhere."
- **Adoptable per class, as the strict setting of the same dial:** classes
  1–2 can be ruled no-scroll (the `scroll` disposition made *refusable by
  type* on those slot classes — the same constructor-level move as
  `@toggle(system, release)`), with class 3 retaining declared scroll or
  graduating to redesigned reach affordances under its own future
  commission.
- **Sequence it after Option C's modeling, deliberately.** The option's real
  price — which screen sizes go INFEASIBLE under max-pane reservation, and
  how much board width the region must claim — is *computable offline by the
  solver only once the interiors are modeled*. Ruling no-scroll before
  modeling would be pricing it blind, in a browser, which is the exact
  subordination row 1849 forbids. C first makes E's cost a table the
  commissioner reads; then the no-scroll ruling (global for classes 1–2,
  never for class 3 without redesign) is an informed law-setting, one
  encoding + one law edit, no new machinery.

This leaves §4's recommendation standing with one refinement: Option E is
not a rejected alternative but the **strict end-state candidate for classes
1–2**, reachable through C+B, priced by the solver, and gated on Q1 — which
this resolution narrows to its sharpest form: *does "never hide content"
distinguish reachable-by-scroll from reachable-by-page from
reachable-by-affordance, and for which slot classes?*

### 6.6 Commissioner ruling received (same date), incorporated as law

Ruling, verbatim: *"The pre-LYT version had no-scroll as a goal. Scrolling
is fine, but should be tuneable, for example scrolling in chart-carrying
containers is no-good, scrolling in the advanced registry is expected."*
Treated as policy and historical evidence; the mechanism derivation below
remains this consult's own.

**What the ruling discharges.**

- **Q1 is substantially discharged.** The scroll/never-hide-content seam
  (§1, fact 3) resolves as: scroll is not categorically "hiding" — it is a
  **per-container policy fact**, and the pre-LYT no-scroll goal explains the
  W1 REPAIR header's rejection (that band sat under the old global goal)
  without binding the new per-container regime. §6.5's global-vs-per-class
  analysis is confirmed in the per-class direction, and its class split maps
  onto the ruling's own two examples exactly: chart-carrying containers are
  class 2 (designed-height — no-scroll), the advanced registry is class 3
  (unbounded data — scroll expected).
- **The witnessed analysis symptom is now a *ruled* violation, not just an
  unmodeled aesthetic.** The Basic/Stability panes are chart-carrying
  containers scrolling today (`.scrollable-content`, §1) — under the ruling
  that is "no-good" on its face. The differential-scroll observation is
  subsumed: when chart panes stop scrolling (reserve their designed demand),
  the differential disappears with the scrolling; where the region cannot
  afford a pane's demand at a size, the honest outcome is the solver's
  INFEASIBLE surfacing a design choice (§6.5 class 2), never a scrollbar.

**The mechanism "tuneable" commissions — derived, not supplied.** Tuneable
per-container scroll policy is *precisely* the Option B shape: the typed
per-slot `scroll <axis>` declaration is the tuning knob, and L5 is its
enforcement — a slot that declares scroll may overflow reachably (the
registry); a slot that does not must be envelope-covered and fit
(chart-carrying panes), with overflow there a fail-loud event. The ruling
thereby converts B from "recommended companion" to "directly commissioned":
no other option in §3 expresses a *per-container* policy at all (0 and D
have no per-container fact anywhere; global E contradicts the ruling's
"scrolling is fine"; A/C carry the containers but not the policy). Two
enforcement surfaces, declared honestly per ADR-0011 Rule 1:

1. **Floor (authorship, review-policed):** the tuning is the encoding
   author's declaration pattern — `scroll v` on the registry pane leaf,
   omitted on chart pane leaves. Cheap, immediate, but "chart-carrying ⇒ no
   scroll declaration" lives in review judgment.
2. **Stronger (type-level, on recurrence or at ratification):** the census
   gains a content-class fact that makes `scroll` on a chart-class leaf a
   *load refusal* — the same constructor-level move as
   `@toggle(system, release)`. This requires an ADR-0008-clean vocabulary
   for the classes ("chart-carrying" is today not a census concept; §6.5's
   three classes are this consult's proposal for that vocabulary), so it
   lands with the amendment wave, not before the vocabulary is ratified.

**Residual for ratification (Q1's remainder, now narrow).** What is left of
Q1 is no longer policy direction but *enumeration*: the ratified class
vocabulary and the per-container assignment table (which of the region's
containers is chart-class/no-scroll, which is data-class/scroll-declared —
the two ruled examples fix the endpoints; the middle cases — the Other tab's
mixed stack, the cards/library browses, the timeline strip — need the
commissioner's per-row sign-off, ideally read off the modeled encoding after
Option C lands, per §6.5's sequencing). The recommendation of §4 is
unchanged in content and strengthened in mandate: C first (model the
containers so the policy has slots to bind to and the solver can price the
no-scroll rows), B with it (the tuning knob the ruling asks for), E's strict
setting applied per the ruling to chart-carrying rows rather than globally.

---

## 7. ADR-0013 conformance note (2026-08-11, on maintainer instruction)

The maintainer flagged that staged/scoped language in this report could read
as ADR-0013 tell-shapes. ADR-0013 was read end to end for this section (it
was not in the original commission's law list), and the report audited
against it. The findings, stated compactly so this section can be read as
assurance rather than more length:

1. **Structural position: no ratified work is narrowed here.** This is a
   pre-work consult; there is as yet no ratified implementation mandate to
   attrite. Every scope reduction in this report is a *proposal addressed to
   the ratifier before any work* — Rule 1's sanctioned channel — with the
   decision points named as Q1–Q4 (§5) and the ruling already received on Q1
   (§6.6). Nothing herein self-authorizes; Q4 exists precisely because even
   the recommended boundary move is the commissioner's to ratify.
2. **The staged recommendation is not a self-narrowing license.** "C first,
   B with it" means: *if ratified, both are owed in full.* B does not
   evaporate after C ships; the emitter/LytNode depth-assumption
   retirements and the `blackbox`-domain re-homing (§6.4), the
   encoding-vs-`defaults.ts` cross-check test (§3 C), the realization-
   boundary decision (§3 C, repaired wording), and the per-container
   assignment table (§6.6) are each **named deliverables to be filed as
   work-status items at adoption** — Rule 4's fix-or-file, never
   narrated-and-left. A wave that ships C and quietly drops the rest is the
   Specimen-1 shape and is rejected in advance by this report's own terms.
3. **Where a weaker enforcement surface is proposed first (§6.6's
   review-policed floor before the type-level chart-class refusal), the
   reason is a genuine external dependency, not convenience:** the
   type-level refusal requires a ratified class vocabulary that does not yet
   exist (an ADR-0008 vocabulary decision only the commissioner can make).
   That is ADR-0013's Exceptions second clause (a named external bound
   surfaced upward), not a "for now" deferral — and the stronger surface is
   named, with its trigger, rather than left implicit.
4. **Rejections of A and global-E are priced, not demurred.** They are
   grounded in law (ADR-0008 fabricated classification; L3
   lying-envelopes-by-construction; the pigeonhole fact), with both
   directions' costs stated, and both remain available to the ratifier —
   the report recommends against them on their merits; it does not
   pre-decide them. Per Rule 3 the recommendation's justification should
   not self-certify: if the commissioner wants the out-of-frame check, the
   hack-rationalization pass run on §4 + §6.6 is the standing instrument
   for exactly that, and this report invites it rather than substituting
   for it.
5. **One wording repair was made under this audit** (§3 Option C): "minimal
   viable form" / unfiled "later wave" — the Rule 3 tell-shape — replaced
   with the filed-deferral form. No other content changed.

---

## 8. Correction (2026-08-11, on maintainer instruction) — mis-delivered decisions, resolved

The maintainer flagged a second, mirror-image ADR-0013 failure in §7's own
repair: "the realization-boundary decision is yours" delivered a *derivable
technical question* upward as ratifier deference. The commission was to
resolve the design space; routing a resolvable question to the commissioner
is executor work left undone, dressed as respect. Audited for the class, not
the instance (ADR-0000 Rule 2a): three more items in §5/§6.6 carried the
same shape. Each resolvable one is resolved here; what remains addressed to
the commissioner is only what is *constitutively* his (ratification itself,
taste/product policy, scheduling).

### 8.1 The realization boundary — resolved

The question "should LytNode eventually render the nested T, or should
modeling stay solver-side?" dissolves under §6's own analysis; it was never
a standing decision. Derivation:

1. Post-C, the interior tab structure exists in two places — the DOM
   (nested TabWidget mounts) and the encoding (the modeled T). Two writers
   of one truth (ADR-0012 cancer B) unless one side derives from the other;
   a cross-check test alone is P7's weakest rung (runtime parity backstop),
   not the contract.
2. §6.2's closure statement already binds every consumer to be a structural
   fold over all three constructors. LytNode's terminal-T case is one of
   the three named violators.
3. Therefore the end-state is forced, not chosen: **LytNode gains a generic
   Exclusive case** (tab strip + active body — SPEC §10's mapping, which
   the existing TabWidget already *is*, so this is convergence, not new
   UI), and **the realization boundary becomes the same base-case boundary
   marker as §6.3** — encoding data, not an architectural decision. Wave 1
   ships solver-side with the marker sitting at the T (today's behavior,
   byte-identical); moving the marker inward later is an encoding edit
   reviewed like any other. There is no residual "boundary decision" for
   anyone to make — that is the point of the shape.
4. The two-writers seam between the encoding's default-configuration T and
   `store/defaults.ts`/`panel-registry.ts` resolves per P7's hierarchy at
   the strongest feasible level: the tab tables are the authority (they are
   the product's SSOT of default tabs), and the encoding's nested-T
   fragment is **derived or build-time-linted against them** — the §3
   cross-check test is the floor, the build-time form the named target.

Sequencing (solver-side first) is thereby *dependency order* — the renderer's
Exclusive case consumes the modeled T, which must exist first — owed within
the same ratified arc, not a decision parked with the commissioner.

**Why this is the more general form of the dichotomy originally posed.** §3
Option C framed the realization question as a two-horn choice: *solver-side
only* vs. *push the realization boundary inward*. That dichotomy is an
enumeration of two points, and enumerations fail open at the next instance
(ADR-0011 Rule 4): it cannot express a *partial* boundary (render the
analysis pane's nested T live but keep the settings interior collapsed), a
*per-class* boundary (landscape expanded, portrait collapsed), or any future
third depth — each would arrive as a fresh architectural decision, re-posed
to the commissioner each time, which is exactly the footgun. The resolution
replaces the choice-of-point with the *space the points live in*: once
LytNode is constructor-total and opacity is a base-case marker placeable at
any node (§6.3), **both original horns become values of one parameter** —
"solver-side only" is the marker sitting at the T; "fully inward" is no
marker anywhere in the subtree; every intermediate and future configuration
is the same parameter at a different node set. This is the ADR-0000 move in
the same register as §6.1: the dichotomy was an instance-enumeration over an
implicit type; the ruling names the type (a fold with a movable base case),
whereupon the enumeration's members — and every member it was missing — fall
out as ordinary data. A decision that recurs per instance was the tell that
a type was missing; supplying the type is what retires the decision, which
is why no residual "boundary question" survives to be delegated.

### 8.2 §5 Q3 (settings orientation) — resolved, withdrawn as a ruling request

The orientation variant is a two-valued structural fact with an exact
precedent already in the language: Amendment 4's valuation machinery (one
encoding, N solves). The general form: a T-interior with a finite set of
*declared structural variants* is solved per variant, default first, exactly
as presence valuations are — horizontal is the default per the standing
ruling (rows 1505/1509/1515/1516), the vertical variant a second solve. No
ruling is required; Q3 is withdrawn.

### 8.3 §5 Q2 (user-authored layouts) — design half resolved; only scheduling remains

The design resolution is derivable and general: the **static guarantee
covers the declared default configuration** (Amendment 4's precedent), and
the **only sound instrument for user-authored layouts is a runtime advisory
check** — L3's fail-loud runtime half, comparing a user's tab layout demands
against the live region rectangle in dev builds, advisory per ADR-0011
Rule 5 (a judgment-shaped output never gates). There is no third mechanism;
a static guarantee over unbounded user authorship is unrepresentable (§2).
What remains for the commissioner is *scheduling* — whether and when the
runtime instrument is commissioned — which is priority, not design. Q2 is
resolved as design; only its scheduling rides the ordinary work-status
process.

### 8.4 §6.6's "middle cases" — assignment table supplied, not delegated

Asking per-row sign-off without proposing the rows was the same shape at
smaller scale. The consultant's assignment, by §6.5's three-class test, for
the commissioner to veto rather than construct:

| Container | Class | Scroll disposition |
|---|---|---|
| Analysis pane stacks (Basic/Distributions/Stability) | 2 — designed-height charts | **no-scroll** (ruled, §6.6) |
| Timeline strip | 2 — designed-height | no-scroll |
| Settings sub-tab strip | 1 — bounded chrome | no-scroll (envelope over six labels) |
| Settings panes: Session/Analysis-Env/Card-Sets/Analysis | 1/2 — bounded editors | no-scroll at declared demand |
| Settings pane: Advanced Registry | 3 — unbounded data | **scroll declared** (ruled, §6.6) |
| Settings pane: Keybindings | 3 — unbounded-ish list | scroll declared |
| Library browse, Cards/Forest browse | 3 — unbounded data (virtual-scrolled today) | scroll declared |
| Other tab (mixed editor stack) | 3 — unbounded (freeform JSON, registry editor) | scroll declared |

Rationale rows are one-line by design; any veto is a one-cell edit at
ratification, not a construction task.

### 8.5 What genuinely remains the commissioner's

After this correction, exactly three items: **Q4** (ratifying the boundary
move — ratification is constitutively his), **the veto pass over §8.4's
table** (taste retained, construction not delegated), and **scheduling** of
the adopted waves and the §8.3 runtime instrument. Q1 was his and is ruled
(§6.6); everything else in this report is resolved.

---

## 9. Follow-up (2026-08-11) — does the extension provide nesting and conditional no-scroll predicates?

Commissioner's question: does the proposed language extension provide
nesting, and conditional no-scroll predicates — so that an advanced registry
*can* scroll (as it should) and a chart-bearing container *cannot* (as it
must not)?

**Answer: nesting yes, for free; conditional predicates yes, but only once
two things my §3 sketch under-specified are added — a per-path
single-scroll-owner law and a typed content-class axis with
subtree-quantified predicates.** Both are derivable and specified here; with
them, §8.4's hand-assigned table stops being an assignment at all and
becomes a *consequence* the loader computes.

### 9.1 Nesting — free from the inductive type, but needing one law

Because `scroll <axis>` is one more key in the sizing bag on `Slot`, and
`Slot` is inductive (§6.1), a scroll disposition can sit at any node at any
depth — declarations nest without any further mechanism. But bare
nestability reproduces the witnessed pathology: today's DOM has **three
stacked scroll layers** (`#control-panel`, `.tab-body`,
`.scrollable-content`), and a language that lets scroll owners stack
silently would merely transcribe that defect into the model. So nesting
demands a law the sketch lacked:

> **L5b (single scroll owner).** On any root-to-leaf path, at most one slot
> declares `scroll` per axis. A second declaration on the same axis on the
> same path is a load refusal — which container absorbs the overflow must
> be unambiguous, and nested scrollbars are the visible form of that
> ambiguity.

This is a structural tree-walk check, the same enforcement family as L2,
and it forecloses the triple-scroll DOM shape *by construction* once the
realization derives overflow from the program.

### 9.2 Conditional predicates — via a typed content-class axis, quantified over subtrees

The ruling's two poles ("registry: scroll expected; chart-carrying:
no-good") are conditions on **what a container carries**, not on the
container itself — "chart-bearing" is a property of a subtree. So the
predicate cannot live in per-slot authoring discipline (my §6.6 floor);
it needs a typed fact on leaves and a fold over the tree:

- **The census gains an orthogonal content-class axis** on leaves —
  `content: bounded | designed | unbounded` (bounded chrome; designed-height
  chart/panel; unbounded data). Deliberately *not* spelled through `domain`
  or `facets`: §6.3 just un-conscripted `blackbox` from the domain axis, and
  conscripting `chart` into it would re-mint the same ADR-0008 misfit.
- **L5c (chart exclusion, subtree-quantified):** a slot may declare
  `scroll` only if its subtree contains **no** `designed`-class leaf. This
  is exactly "chart-bearing containers must not scroll," computed as a fold
  — a container is chart-bearing because a descendant is a chart, not
  because someone remembered to tag the container. Consequence: a
  chart-class leaf has no scroll owner anywhere on its path, so its
  declared demand is a hard constraint the solver must fit — INFEASIBLE,
  never a scrollbar, where it cannot (§6.5 class 2, now type-enforced).
- **L5a (coverage, restated over the classes):** an `unbounded`-class leaf
  **requires** exactly one scroll owner on its path — the registry not
  merely *may* scroll but *must have* a declared scroll home, and an
  unbounded leaf with no scroll owner is a load refusal (undeclared
  overflow, the original L5). A `bounded`/`designed` leaf requires its
  envelope to fit.

Together: the registry case and the chart case are both *theorems of the
classification*, checked at load time by the same walk that checks L2 —
wrong declarations are not reviewable lapses but unrepresentable programs,
the `@toggle(system, release)` move applied to overflow.

### 9.3 What this buys, concretely — including a case with teeth

- §8.4's table is no longer hand-assigned: classify the *leaves* once, and
  every container row falls out of L5a–c mechanically. The commissioner's
  veto surface shrinks to the leaf classifications.
- The **Other tab** demonstrates the predicates bite: its current stack
  mixes an unbounded editor (freeform JSON, registry) with a chart-ish
  strip (`ColorDebugStrip`) in one scrolling band. Under L5c that container
  refuses to load as declared — the law *surfaces a real composition
  defect* (a chart living inside a scroll region) and forces the honest
  restructure: split the stack into a fixed designed-height band and a
  scroll-owned band. That is the language doing exactly what row 1849 asks:
  the defect isolated at the program level, before any DOM is consulted.
- L5b + realization-derives-overflow retires the three-layer scroll DOM as
  a representable shape.

**Amendment to §4/§6.6's enforcement note:** with §9.2, the "stronger
type-level surface" no longer waits on a separate vocabulary ruling as a
distinct wave — the content-class axis *is* the vocabulary, it ships with
Option B's amendment, and the §6.6 "floor" (authoring discipline) is only
the interim state while C's modeling lands. The classification of each leaf
remains a judgment (ADR-0008), made once, in the encoding, where the
commissioner reads it.

## License

Public Domain (The Unlicense).
