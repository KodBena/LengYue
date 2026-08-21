<!-- doc-attest-exempt: consult-authored companion adopted by maintainer decision 2026-07-22
("We'll take the consolidated... stand it next to the ADR"). Verbatim consult text below the
install header; removal condition: superseded by a later ratified edition. -->

# UI Failure Proscriptions — Consolidated (blind + sighted consults merged)

*Phase 2. This document critiques the prior sighted consult
(`design/CONSULT-OPUS-UI-PROSCRIPTIONS-2026-07-22.md`, "SPn" below) against my own blind
consult ("BPn" below), then merges both into one deduplicated proscription set ordered by
enforcement strength. Provenance is tagged per rule: **[sighted]** = originated only in the
codebase-aware consult; **[blind]** = originated only in the codebase-blind consult;
**[convergent]** = both instances produced it independently.*

**Standing of this document (maintainer framing).** The Synopsis below is required reading for UI
implementers; the full rules (Part 2) and the critique (Part 1) are consulted per good judgment.
An implementer who reads only the Synopsis should never build something a full rule would refuse —
where a rule's nuance cannot survive compression, its synopsis entry ends with "(full rule has
load-bearing detail)" so judgment knows to open it.

---

## Synopsis — one entry per rule (C1–C29)

*Rule id · short name · what is refused and when · enforcement, in a word or two. Tiers match Part
2. This is the required-reading layer; open the full rule when its entry flags load-bearing detail
or when your case sits near its edge.*

### Tier A — Construction-time typed refusal

- **C1 — One fact, one control.** Two controls bound to one model slot (aliasing), or one slot
  surfaced as two editable/mirrored controls, is refused at UI start. *Enforcement: construction-time
  typed (bijection check over the binding registry).*
- **C2 — No editable derived value.** Binding an editable control to a value the system derives
  (status, count, computed summary) is refused; derived values render read-only. *Enforcement:
  construction-time typed (field-kind `source|derived`).*
- **C3 — Live projection, no shadow store.** A per-widget or per-section form store reconciled by a
  "Save"/"Apply" is refused; the on-screen value is the live model. A single transactional commit of
  the whole model is permitted. *Enforcement: construction-time typed; review backstop. (full rule
  has load-bearing detail — the whole-model commit boundary is the permitted exception.)*
- **C4 — Config commits validated + atomic.** Committing operator input to the live target without
  validating the whole document first, or with a non-atomic (partial-on-failure) write, is refused.
  *Enforcement: construction-time typed (parse-don't-validate brand) + atomic write.*
- **C5 — Success only from durable ack.** Entering a success/committed state before the backend
  acknowledges durability is refused; optimistic rendering is allowed only as a distinct labelled
  provisional state with a rollback. *Enforcement: construction-time typed (async state machine).*
- **C6 — State-tagged async data.** Rendering a value such that loading, error, empty, genuine zero,
  and no-data-yet are indistinguishable is refused. *Enforcement: construction-time typed
  (discriminated union + exhaustiveness).*
- **C7 — As-of time + stale state.** Rendering an aging operational datum without a viewer-legible
  as-of time and a visibly distinct stale/disconnected state (past a declared threshold) is refused.
  *Enforcement: construction-time typed (required `asOf` + staleness policy).*
- **C8 — Errors located, remediable, no dead end.** An error/failure presentation that fails to
  locate the cause, state the remedy, and offer a reachable next action is refused. *Enforcement:
  construction-time typed (required error fields) + review for dead-end reachability.*
- **C9 — Cancellable long operations.** Offering an operation past ~10 s, or any side-effecting one
  running longer than instantaneously, without a cancel/abort wired to actually stop it, is refused.
  *Enforcement: construction-time typed (cancellation token in the runner signature).*
- **C10 — Irreversible actions guarded.** A destructive/irreversible action (delete, overwrite,
  reset, discard) that commits without either a confirm step or a registered undo is refused.
  *Enforcement: construction-time typed (action reversibility kind).*
- **C11 — No in-band control sentinel.** Carrying navigation/command/mode meaning as a sentinel
  parsed out of the data-entry stream (e.g. a typed `<` meaning "back") is refused; control uses the
  platform's out-of-band input layer. *Enforcement: construction-time (absence of a sentinel parser)
  + review.*

### Tier B — Construction-time via a witnessed in-repo gate

- **C12 — Bounded text measure.** Emitting a text line whose width is a function of the
  viewport/terminal, rather than a fixed measure (~66 ch; setup-TUI uses 78), is refused at the
  renderer. *Enforcement: construction-time gate (witnessed; renderer wraps to a constant).*
- **C13 — Typed semantic elements.** Operator-facing content as a raw string doing its own layout
  (embedded newlines, hand-spaced pseudo-columns, ASCII-art tables) rather than a typed element
  (heading/paragraph/table/status/note/rule) is refused. *Enforcement: construction-time typed
  (witnessed; closed vocabulary + purity gate).*
- **C14 — No substrate emulation.** A print-stream/teletype as the primary surface, or a hand-rolled
  scroll/selection where the toolkit provides one, is refused; if nothing is focusable/scrollable/
  addressable it does not start. *Enforcement: construction-time gate (witnessed; the print-ban is
  the real bite — see full rule).*

### Tier C — Load/startup-time validation, and CI gate / lint

- **C15 — No host-chord collision.** Binding a chord the host reserves (tmux prefix `ctrl+b`,
  terminal flow-control/signals; browser/AT chords `ctrl+w/t/l`) is refused against the known-reserved
  set. *Enforcement: load-time gate vs. known set; review for the open tail.*
- **C16 — Input survives error/navigation.** Discarding operator-entered data on validation failure,
  transient error, or navigation-away without preserving it or an explicit unsaved-changes guard is
  refused. *Enforcement: typed (errors returned with input) + CI gate (leave-guard on editor routes).*
- **C17 — Keyboard/focus integrity.** A control not reachable/operable by standard keyboard traversal,
  a focus trap with no keyboard exit, a pointer-only or undiscoverable action, or a missing focus
  indicator, is refused. *Enforcement: CI gate (axe/a11y-lint on Vue; focus-chain test on Textual).*
- **C18 — No color-only meaning.** Encoding a state distinction (status/validity/severity/selection)
  by hue alone, with no redundant label/glyph/shape/position, is refused. *Enforcement:
  construction-time (status component) + CI gate (axe); Textual must also respect `NO_COLOR`.*
- **C19 — Contrast thresholds.** Rendering text/essential glyphs below WCAG contrast (4.5:1 normal,
  3:1 large/non-text) against the actual background is refused. *Enforcement: CI gate (Vue); review +
  no absolute-background assumption (Textual — honest ceiling drops).*
- **C20 — Real labels, not placeholders.** An input whose only label is disappearing placeholder
  text, or whose label is not programmatically associated, is refused. *Enforcement: CI gate (axe /
  a11y-lint).*
- **C21 — Minimum target size.** A pointer target below the minimum (24×24 CSS px baseline; 44×44
  AAA) with no larger equivalent hit area is refused. *Enforcement: CI gate (Vue); low-severity
  review (Textual cell grid).*
- **C22 — Sanctioned tokens only.** A color/spacing/control instantiated with raw literals (hex,
  magic spacing, hand-rolled buttons) outside the sanctioned design-token/component set is refused.
  *Enforcement: CI lint (stylelint / TCSS `$`-variables only).*
- **C23 — No swallowed errors.** An error path that returns the UI to an apparently-nominal state
  without surfacing a diagnosable message (empty catch, catch-and-only-log) is refused in UI code.
  *Enforcement: CI lint (ban `catch {}`/`except: pass`) + typed `Result` floor.*
- **C24 — No UI-thread blocking.** Running a potentially-slow operation (network, disk, heavy compute)
  synchronously on the render/event thread such that input freezes is refused. *Enforcement: CI lint
  (ban blocking calls in handlers) + worker/async routing; Textual: `@work`.*

### Tier D — Spec-time + review, hardening where declared (review is the honest ceiling)

- **C25 — Navigation matches data topology.** Presenting a product-type/partial-order configuration
  as a forced linear Back/Next wizard, or dissolving a genuine dependency chain into free navigation
  that skips a real prerequisite, is refused; a wizard is licensed only by a declared total order.
  *Enforcement: spec-time + review, hardening to load-time where the order is encoded. (full rule has
  load-bearing detail — both directions are refused.)*
- **C26 — Feedback / busy state.** An action with no perceptible feedback within its threshold, or an
  operation past ~1 s with no busy indicator (past ~10 s, no determinate progress), is refused; the
  UI does not block silently. *Enforcement: review for sufficiency (honest ceiling); lint at async
  seams. Distinct from C24 (freeze) and C5 (truth of a success claim).*
- **C27 — Auto-refresh yields to interaction.** An auto-updating view that mutates content under the
  operator's active focus/selection/scroll, or resets in-progress input on refresh, is refused.
  *Enforcement: CI lint (guard present) + review (guard adequate).*
- **C28 — Prioritized, capped alarms.** An operational dashboard presenting alarms/notifications
  without a required severity and without ordering/rate-cap (so a critical signal is buried) is
  refused. *Enforcement: construction-time (required severity) + load-time policy assertion; review
  for threshold tuning.*
- **C29 — Modes show an indicator.** A mode that changes what the same input does, with no
  persistent always-visible indication of which mode is active, is refused (removing the mode
  outranks indicating it). *Enforcement: construction-time (binding present) + review (legibility).*

---

## Part 1 — Critique of the sighted consult, on its own merits

### 1a. Independent content vs. generalized incident

The sighted consult's twelve points split cleanly, and the split matters more than the count.
**Eight points are specimen-anchored** (SP1–SP7, SP12 each generalize one witnessed defect
S1–S7). **Four points foreclose unwitnessed classes** (SP8–SP11). This is the seam the
maintainer's "meh except where it spells out what we've done wrong" verdict is pointing at, and
the verdict is half right in a way worth being precise about:

- The specimen-anchored eight *do* carry independent content — each names a class strictly
  broader than its instance (SP1 is not "the teletype," it is *any* substrate downgrade named by
  discarded capability; SP4 is not "S5's aliased checkboxes," it is *any* non-bijective
  control↔slot map). That generalization is real work, not restatement. Where the maintainer reads
  them as merely "what we've done wrong," I read them as the strongest rules in the document —
  precisely because a witnessed incident proves the class is load-bearing and, in three cases
  (SP1, SP7, SP12), a *witnessed mechanism already enforces it* (the setup-TUI purity gate and
  typed element vocabulary). A rule with a shipped gate is not weak; it is the opposite.
- The foreclosing four (SP8 keyboard/focus, SP9 feedback, SP11 irreversibility — and to a lesser
  degree SP10 derived-value) are where "meh" lands, and here I partly agree but for a different
  reason than the maintainer likely means. They are not weak because unwitnessed; they are the
  most generic because they are the field's bedrock — and the proof is that **my blind consult,
  with zero codebase access, produced SP8, SP9, and SP11's guard-clause independently from the
  same canon** (Nielsen #1/#3/#5, WCAG 2.1.x, Miller 1968). That convergence is not redundancy to
  discount; it is evidence these three are the genuinely universal, non-project-specific
  proscriptions — the ones any competent reviewer reconstructs from the literature. They read
  "meh" *because* they are canonical, and canonical is exactly what you want load fixed against
  taste. SP10 (editable derived value) is the exception among the four: it is genuinely
  non-obvious independent content the blind consult missed, and it is strong.

### 1b. Enforcement claims — real vs. hand-waved

Graded against the ladder honestly:

- **Real and strong.** SP4 (mount-time check over a `slot→[controls]` binding registry — genuinely
  mechanical *if* bindings are declared as data, which the setup-TUI architecture supplies), SP7
  (witnessed renderer-constant gate + red fixture), SP12 (witnessed closed vocabulary + purity
  gate), SP10 (typed field-kind `source|derived`), SP6 (load-time check against a *known* reserved
  chord set, with the open tail honestly marked review). These do not overclaim.
- **Real core, hand-waved backstop.** SP1's primary claim (the `print`/`.say` ban is a shipped
  gate) is solid; its *extension* — "the top-level surface must be composed of toolkit widgets,
  checkable structurally" — is thinner than stated, because on both Vue and Textual the surface is
  *already* a widget tree by construction, so the only real, mechanizable bite is the print-ban.
  SP3's construction claim ("the binding *is* the value accessor, so there is no second store to
  police") is true only under disciplined framework use; its stated backstop, "a lint against a
  form store shadowing a bound model field," is aspirational — statically detecting a shadow store
  is hard, and the doc should have said review, not lint. SP5 is similar: "bind to actions/keys so
  there is no sentinel parser" is real as *absence*, but "a gate against a code path that inspects
  entered text for control tokens" is not a check anyone has sketched runnably.
- **Honestly review-bounded, and says so.** SP2 (is this data genuinely a sequence?), SP9's
  general case, SP11's dead-end half. These name review as the ceiling in plain words — the
  document's best discipline, and the register the whole preamble argues for.

Net: the sighted consult's enforcement honesty is good — no point rests on "an expert will
notice" while pretending to be a gate. Its one recurring weakness is claiming a *lint backstop*
(SP3, SP5) for classes whose only real enforcement is the construction-time absence plus review.

### 1c. The organizing frame ("correspondences")

The maintainer found the reframe "inapplicable," and I largely concur, though I'd locate the
problem precisely: the correspondence frame (view↔model, control↔variable, navigation↔topology)
is a genuine and well-pedigreed lens (Norman's mappings, Green & Petre's Cognitive Dimensions),
and it does real work for the *structural/architectural* defects — which is exactly the cluster
the witnessed incidents fell into. But it is a frame optimized for the defects that bit, and it
**systematically under-covers the two genres the commission actually named**: it has almost
nothing on operational-dashboard *data integrity* and little on config-editor *commit safety*,
because those failures are not broken correspondences between a control and a variable — they are
broken correspondences between *what the screen asserts and what is true of the world*, which the
frame does not reach for. So I keep my own decidability principle as the organizing spine
(below) and treat "correspondence" as one productive lens among several, not the load-bearing
axiom.

### 1d. What the sighted consult missed that the blind consult found

This is the substantive gap, and it is genre-shaped. Despite full codebase access, the sighted
consult missed nearly the entire **operational-dashboard data-integrity cluster** and the
**config-apply safety cluster** — the two clusters most specific to the commission's named
genres:

- **Stale data shown as live** (BP4) — a datum that can age, rendered with no as-of time and no
  distinct disconnected state. This is *the* canonical control-room fatality (the frozen gauge),
  and its absence from a document about operational dashboards is the largest single gap.
- **No-data indistinguishable from zero / loading / error** (BP3) — the "is it 0 or is the feed
  down" collapse. SP9 gestures at "hidden system state" but does not close this class.
- **Undifferentiated alarm flood without severity** (BP17) — EEMUA 191 / ISA-18.2 alarm
  management, the discipline built precisely for operational panels. Absent.
- **Config committed without validation and atomicity** (BP9) — parse-don't-validate at the apply
  boundary, partial-write forbidden. Central to config editors; absent.
- **Success reported before durable acknowledgement** (BP2) — the optimistic lie, acute for a
  config-apply that reports "saved" before the backend confirms. Absent.
- **Non-cancellable long/side-effecting operations** (BP12), **auto-refresh clobbering active
  interaction** (BP16), and the standard perceptual WCAG cluster — **color-as-sole-channel**
  (BP5), **contrast** (BP6), **placeholder-as-label** (BP15), **target size** (BP19) — all absent.
  Some of these (contrast, targets) SP8's a11y-lint would *catch* mechanically, but the consult
  did not name them as classes, so they are not law.

### 1e. What the sighted consult found that the blind consult missed

Symmetric honesty — the sighted consult's codebase access earned genuine content the blind
consult had no way to reach:

- **SP1 substrate emulation / teletype**, **SP2 wizard-over-product-type**, **SP5 in-band
  sentinel**, **SP6 host-chord collision** — four classes tied to specific project incidents that
  a blind consult would not invent, all real and (SP6 especially) enforceable.
- **SP4 one-fact-one-control bijection** and **SP10 editable-derived-value** — two strong
  construction-time typed rules over a declared binding/field table; the blind consult missed both
  and they are among the best in either document.
- **SP7 bounded text measure** (Bringhurst) — a real, witnessed-enforceable class the blind
  consult simply did not think of.
- **SP12 typed semantic elements** — adjacent to the blind consult's BP18 (design tokens) but
  distinct: SP12 governs *content structure*, BP18 governs *visual constants*. The sighted framing
  is the stronger of the two for the "wall of text" class.

### 1f. The convergence, named

Three rules appear in both documents, derived independently from the field's canon by a blind and
a sighted instance: **keyboard/focus integrity** (SP8 ≡ BP7), **irreversible-action guard**
(SP11a ≡ BP1), and **feedback / system-status visibility** (SP9 ≡ BP11). A fourth is a near-miss
convergence on the error-recovery path (SP11's dead-end clause ≈ BP14's remediation requirement).
Two instances starting from opposite information states landing on the same four rules is the
strongest available evidence that these are the field's bedrock proscriptions — universal, not
project-idiosyncratic. They are tagged [convergent] below and should carry the least controversy.

### Organizing principle carried into the merge

UI-failure knowledge becomes law only where the defect is a **decidable property of the artifact
or its state machine** — inspectable in the source, the types, the binding table, or the
enumerable state transitions — rather than a property of a user's subjective experience.
"Intuitive" cannot be refused; "an aging datum rendered with no as-of time," "a control bound to
two model slots," "a success state reachable without an acknowledgement edge" can. Every rule
below is that move applied once: take the pedigreed heuristic, name the artifact-level invariant
whose violation is the failure, and push the check to the earliest ladder rung that honestly
holds. The two substrates fail differently (Vue: a DOM with an a11y tree, arbitrary color, a
pointer, mature axe/stylelint/ESLint tooling; Textual: a keyboard-native character grid over a
terminal the operator owns, whose color/background/width are unknown at build time), and each
rule's binding note is included only where the binding genuinely differs.

**Enforcement ladder, strongest first:** (1) construction-time typed refusal (illegal state
unconstructable) > (2) load/startup-time validation with loud refusal > (3) mechanical gate/lint
in CI > (4) human review only (named as such where it is the honest ceiling).

---

## Part 2 — Consolidated proscription set (29 rules, ordered by enforcement strength)

### Tier A — Construction-time typed refusal

#### C1 — One fact, one control: the control↔variable map is bijective [sighted]
**Proscription.** Every model slot binds to exactly one control and every control edits exactly
one slot. Two controls writing one slot (aliasing — same-named toggles in two sections collapsing
to one fact), or one slot surfaced as two editable/mirrored controls, is refused at UI start,
naming the fact and every claimant.
**Class.** Non-bijective control↔variable mapping (aliasing or mirroring). Decidable from the
declared binding table.
**Enforcement.** Construction-time typed. Build `slot→[controls]` and `control→[slots]` from the
binding registry at mount; any slot with >1 control or control with >1 slot is refused. Real gate
over data, not review.
**Pedigree.** Norman 1:1 control-effect mapping and gulf of evaluation; Green & Petre hidden
dependencies; information-architecture unique-placement / polyhierarchy-as-hazard.
**Substrate.** *Vue:* two `v-model`s onto one store path, or a getter-only computed shown as
editable. *Textual:* two widgets whose `reactive` targets one attribute. The registry check reads
declared bindings, so it is substrate-independent.

#### C2 — No editable control on a derived value [sighted]
**Proscription.** A value the system derives (a status, count, computed summary, function of other
fields) is rendered read-only, never as an editable widget. Binding an input to a derived quantity
is refused: it invites the operator to set what the system recomputes, minting a second writer of a
derived fact.
**Class.** Editable derived value. Decidable: a field is typed `source` (editable) or `derived`
(read-only); a `derived` field carrying an editable control is the class.
**Enforcement.** Construction-time typed. The renderer refuses to bind an editable control to a
`derived` field, naming it. Real gate over the field table.
**Pedigree.** Derive-don't-duplicate (the project's own ADR-0012 P1 lineage); Norman's
feedback-vs-input distinction; Green & Petre hidden dependencies.
**Substrate.** *Vue:* getter-only `computed` renders as text/disabled, never a `v-model` target.
*Textual:* a `compute`d/`reactive` renders read-only; no `Input` bound to it.

#### C3 — The editing surface is a live projection of the model; no per-widget/per-section shadow store [sighted]
**Proscription.** A field's on-screen value is a live view of the model slot it edits — reading it
reads the model, changing it changes the model. Maintaining a separate form store reconciled by a
per-field or per-section "Save"/"Apply" is refused: it mints two writers of one truth joined by a
manual sync the operator can desynchronize. A single transactional commit of the *whole* model
(see C4) is not this class and is permitted.
**Class.** Dual-store view/model desync. Decidable where bindings are declared; residual is review
(statically detecting an ad-hoc shadow store is hard — this is the honest limit the sighted
consult overstated as a lint).
**Enforcement.** Construction-time typed for the primary case (the binding is the value accessor;
no second store to declare). Review backstop where a framework makes a form store idiomatic —
named as review, not a claimed lint.
**Pedigree.** Shneiderman direct manipulation; Norman gulf of evaluation; Green & Petre hidden
dependencies; the project's one-home-per-fact lineage.
**Substrate.** *Vue:* `v-model`/reactive binding to the store; a local `ref` copy a Save handler
writes back is the anti-pattern. *Textual:* the widget's reactive *is* the model slot; a separate
dict a Save button flushes is refused.

#### C4 — Configuration commits only a validated whole, atomically [blind]
**Proscription.** A config editor is refused from committing operator input to the live target
without (a) validating the whole document against the target's schema before commit and (b) writing
atomically — a partial write on failure is forbidden, the target is left fully-old or fully-new.
The apply path consumes only a value the validator could have produced.
**Class.** Unvalidated or non-atomic config commit. Decidable from the apply function's input type
and its write strategy.
**Enforcement.** Construction-time typed via parse-don't-validate: `apply()` accepts only a branded
`Validated<Config>` whose sole constructor is the validator, so applying raw input does not
type-check. Atomicity (temp + atomic swap / transaction) is a load-time property assertable in
tests. Disabling the button is not sufficient and is not the required control.
**Pedigree.** Alexis King "Parse, don't validate"; Norman error-prevention / forcing functions;
Nielsen #5; atomic-configuration tradition (etcd, Nix generations, ACID).
**Substrate.** *Vue:* `apply` typed to the branded config; client validation is convenience, not
the contract. *Textual:* the same typed gate on the Python action; write via temp-file + atomic
rename, never in place, never on partial validation.

#### C5 — Success is reported only from a durable acknowledgement [blind]
**Proscription.** The UI is refused from entering a committed/success state before the operation's
authority acknowledges durability. Optimistic rendering is allowed only as a distinct, labelled
*provisional* state with a defined rollback; a success flag set in the same turn as the dispatch,
with no acknowledgement edge, is forbidden. The interface may not lie about what the backend has
done.
**Class.** Success state reachable without an acknowledgement in-edge. Decidable by inspecting the
state machine's edges into the terminal-success node.
**Enforcement.** Construction-time typed via an explicit async state machine
(`idle|pending|ack-success|ack-error`); the success node is unreachable except from the ack event.
**Pedigree.** Nielsen #1 (true system status); Norman gulf of evaluation; ISO 9241-110; the
distributed-systems maxim that an unacknowledged write is not a write.
**Substrate.** *Vue:* forbid flipping success `ref`s before the awaited promise resolves.
*Textual:* forbid `post_message`/notify of success before the worker's completion event; worker
`state` is the acknowledgement source.

#### C6 — Async/fallible data is state-tagged; loading, error, empty, zero, and no-data are never collapsed [blind]
**Proscription.** A view is refused from rendering a value such that *loading*, *error*, *empty
result*, *genuine zero*, and *no-data-yet* are indistinguishable. Each has a presentation the
viewer can tell apart. A dashboard showing `0` when it means "feed down" is a defect at the
severity of showing wrong data, because the operator acts on it.
**Class.** Rendering a resource payload without discriminating its state.
**Enforcement.** Construction-time typed: model remote data as a discriminated union
(`Loading|Error|Empty|Loaded<T>`); the payload is reachable only inside `Loaded`, and an
exhaustiveness check (TS `never` / `assert_never`) forces all arms handled.
**Pedigree.** Nielsen #1 and #9; Norman gulf of evaluation; the null-vs-zero data-integrity
tradition (Codd's NULL; the nil-punning hazard).
**Substrate.** *Vue:* a `RemoteData<T>` type + exhaustive `v-if`; lint against reading
`resource.data` outside a state guard. *Textual:* a `reactive` holding the union; `render()` must
`match` all arms.

#### C7 — An aging datum carries an as-of time and a distinct stale state [blind]
**Proscription.** Any operational datum whose value can age relative to its source is refused from
rendering without (a) a viewer-legible as-of/recency indication and (b) a visibly distinct degraded
appearance when the feed is stale or disconnected past a declared threshold. Live-looking data that
has silently frozen is the canonical control-room fatality mode.
**Class.** A time-varying metric rendered without a freshness timestamp and staleness policy.
Decidable from the component's inputs.
**Enforcement.** Construction-time typed: the metric component type requires a non-optional `asOf`
and a staleness policy; omission is a compile error. The stale rendering is a pure function of
`asOf` vs now, testable in CI.
**Pedigree.** Nielsen #1; EEMUA 191 / ISA-18.2; the aviation "failure of the failure indicator"
lesson; process-control HCI after Three Mile Island; Tufte on graphical integrity.
**Substrate.** *Vue:* a required `asOf: Date` prop + shared "STALE" chrome. *Textual:* a widget
requiring `as_of` in its constructor; the staleness signal must be a glyph/label (the terminal
cannot animate a pulse), recomputed each refresh tick.

#### C8 — Errors are located, remediable, and never a dead end [convergent: blind BP14 + sighted SP11b]
**Proscription.** A user-facing error/failure presentation is refused if it does not (a) locate the
offending cause, (b) state what would make it valid, and (c) offer a reachable next action (retry,
correction, exit). "Invalid configuration" with no field, no remedy, and no way forward is a defect
that converts a two-second fix into a hunt and can strand the operator.
**Class.** Error/failure states lacking location, remediation, or a forward action. The
location+remediation core is decidable from the error object's fields; whether a given failure
state is a true dead end is a reachability judgment over the flow — the honest review tail.
**Enforcement.** Construction-time typed for the core: the error type requires
`{location, message, remediation, nextAction}`; an error missing a field cannot be constructed.
Review for the dead-end reachability tail, named as such.
**Pedigree.** Nielsen #9 and #3 ("emergency exit"); WCAG SC 3.3.1 (Error Identification) and 3.3.3
(Error Suggestion); Shneiderman informative feedback / easy reversal; Wroblewski inline validation.
**Substrate.** *Vue:* the error component requires a field ref + suggestion + action; wire
`aria-describedby`/`aria-invalid`. *Textual:* the `Validator` `Failure` carries a description
rendered adjacent to the input; a failure screen always binds a keyboard-reachable action to leave
it.

#### C9 — Long or side-effecting operations are cancellable [blind]
**Proscription.** An operation past ~10 s, or one with observable side effects running longer than
instantaneously, is refused from being offered without a cancel/abort affordance wired to actually
stop the work. "Start" without "stop" strands the operator who realizes the parameters were wrong.
**Class.** A long-running/side-effecting operation whose runner accepts no honored cancellation
token. Decidable from the runner's signature.
**Enforcement.** Construction-time typed: the sanctioned long-op runner requires a cancellation
token (`AbortSignal` / worker handle), so a non-cancellable long op cannot be constructed through
it. Residual review for work that ignores the token it was given.
**Pedigree.** Nielsen #3 (user control / emergency exit); Shneiderman internal locus of control;
Miller thresholds.
**Substrate.** *Vue:* `AbortController` plumbed through fetch, exposed as a cancel control.
*Textual:* Textual workers are cancellable by design (`Worker.cancel`) — the rule is to *expose*
cancel to the operator and to check cancelled-state at safe points.

#### C10 — Irreversible actions are guarded or undoable [convergent: sighted SP11a + blind BP1]
**Proscription.** A destructive/irreversible action (delete, overwrite, reset-to-default, discard
unsaved work) is refused from committing unless it is confirmed *or* undoable — reversibility is a
typed property of the action, not an afterthought. Confirmation and undo are alternatives; neither
being present is the defect.
**Class.** Destructive actions minus those guarded by a confirm step or a registered undo.
Reversibility is author-declared, so membership is decidable from the action's declaration.
**Enforcement.** Construction-time typed if mutations flow through one command layer: the
`destructive` action variant's constructor demands a `confirm` or `undo` field; omission fails the
type check. Lint backstop where handlers bind directly.
**Pedigree.** Nielsen #3 and #5; Shneiderman "permit easy reversal of actions"; Norman forcing
functions / poka-yoke; Cooper on gratuitous vs. earned confirmation.
**Substrate.** *Vue:* route through a typed `dispatch(Command)`; ESLint against direct mutating
calls in templates. *Textual:* a base class requiring a confirm `Screen` push or undo-stack entry
for actions declared destructive, checked over the action registry at startup.

#### C11 — No in-band control sentinel; navigation and commands use the platform input layer [sighted]
**Proscription.** Navigation, command invocation, and mode changes use the toolkit's native input
primitives — focus traversal, key bindings, actions. Inventing a bespoke protocol (a typed
sentinel like `<` parsed out of the data-entry stream, an in-band control code, a magic string) is
refused. Data input and control input must not share one in-band channel; the operator's literal
`<` is data.
**Class.** In-band control signaling — control meaning carried inside the data channel as parsed
sentinels rather than through out-of-band platform input.
**Enforcement.** Construction-time as *absence*: navigation binds to actions/keys, so there is no
sentinel parser. (The sighted consult's "gate against a code path inspecting entered text for
control tokens" is not runnably sketched — treat the enforcement as construction-time absence plus
review, not a claimed lint.)
**Pedigree.** Nielsen #4 / least astonishment; Green & Petre role-expressiveness; the protocol-
design abandonment of in-band signaling (the Bell System / blue-box cautionary tale).
**Substrate.** *Textual:* `BINDINGS`/`action_*` and the focus system carry navigation; nothing
reads `Input.value` for control tokens. *Vue:* `@keydown` bound to named commands + standard focus
order; no parsing typed text for sentinels.

### Tier B — Construction-time via a witnessed in-repo gate

#### C12 — Text measure is bounded; no line's width is a function of the viewport [sighted]
**Proscription.** The width of a rendered text element is a fixed typographic measure, not the
accident of the viewport. No line may span "whatever the terminal happens to be"; prose wraps to a
bounded measure (~66 ch neighborhood; the setup-TUI uses 78), tables cap columns and wrap within a
cell. A 348-character line filling the operator's tmux width is refused at the renderer.
**Class.** Unbounded text measure — line length determined by container width rather than a fixed
readability measure.
**Enforcement.** Construction-time / mechanical gate, **witnessed** in-repo: the canonical renderer
wraps to a measure constant and a red fixture proves an over-wide paragraph renders with no line
over measure. Width is a renderer constant, not a viewport read.
**Pedigree.** Bringhurst (the 45–75 char line, 66 ideal); Tinker legibility research; responsive
`max-width` in `ch`.
**Substrate.** *Vue:* `max-width` in `ch`/`rem` on running prose, never `width:100%`; the viewport
scrolls, the measure does not grow. *Textual:* the renderer wraps at the measure constant before
the backend styles; terminal width is irrelevant to line length.

#### C13 — Content is typed semantic elements; no layout carried inside a string [sighted]
**Proscription.** Everything shown is constructed as one of a closed set of typed semantic elements
(heading, paragraph, table with real columns, status line, note-with-tone, separator), each
visually delimited. A wall of text — an undifferentiated block, or a raw string doing layout with
embedded newlines and hand-spaced pseudo-columns (ASCII-art tables, dashed fake headers) — is
refused. Distinct from C12: C12 bounds *width*; C13 requires *semantic structure*.
**Class.** Untyped presentational blob — operator-facing content that is a raw string carrying its
own layout rather than a typed element the renderer lays out.
**Enforcement.** Construction-time typed, **witnessed** in-repo: a closed element vocabulary
replaces the free `say(str)` register, and the purity gate refuses `print`/`.say` outside the
renderers and raises on an unknown element type.
**Pedigree.** Gestalt proximity/similarity; typographic hierarchy; separation of content and
presentation (semantic markup vs. layout-in-content); Green & Petre role-expressiveness.
**Substrate.** *Vue:* semantic components / `<table>`/`<h_>`/lists with styling in CSS; never a
`<pre>` blob of hand-spaced columns. *Textual:* the typed vocabulary with `DataTable` for tabular
data; no ASCII-art columns inside a `Static`.

#### C14 — No substrate emulation; a print-stream is not the primary surface [sighted]
**Proscription.** A UI on a widget toolkit uses that toolkit's native interaction model (focus,
traversal, scrollback, selection, live regions). Reimplementing a lower-capability substrate inside
it — a teletype/print-stream as the primary surface, a hand-rolled scroll buffer or selection model
where the toolkit provides one — is refused. If nothing on screen is focusable, scrollable, or
addressable as a widget, it is not a UI in the toolkit's terms and does not start.
**Class.** Substrate downgrade — discarding a native toolkit capability (focus, scroll, selection,
addressable region) to hand-roll a weaker equivalent, named by capability.
**Enforcement.** Construction-time / mechanical gate, **witnessed** in-repo for the load-bearing
case: the purity gate forbids `print`/`.say` outside the two renderer files, so the primary surface
cannot be a raw print loop. (The broader "surface must be composed of widgets" is largely automatic
on both substrates; the print-ban is the real bite — do not overclaim beyond it.)
**Pedigree.** Nielsen #4 / #2; least astonishment; platform-HIG conformance; Kay's point that a
medium emulating its predecessor wastes the medium.
**Substrate.** *Textual:* every screen `compose()`d from widgets with a real focus chain; a
`RichLog` may be a transcript component, not the whole surface. *Vue:* rendering through the
component tree; no imperative `innerHTML` string-appending teletype.

### Tier C — Load/startup-time validation, and CI gate / lint

#### C15 — No keybinding collides with a host-reserved chord [sighted]
**Proscription.** Key bindings are declared as a set and must not collide with chords the host
reserves. A Textual TUI must not bind the tmux prefix (`ctrl+b`) or the terminal's flow-control /
signal chords; a Vue SPA must not bind over browser/AT-reserved chords (`ctrl+w/t/l`, screen-reader
pass-through). The binding table is checked against a known-reserved set.
**Class.** Host-chord collision — a binding shadowing a chord the multiplexer/terminal/browser/AT
already claimed. Distinct from C11 (C11 forbids inventing a control channel; C15 forbids a
legitimate binding stepping on the host).
**Enforcement.** Load-time / mechanical gate against the *known* reserved set (real check over the
declared bindings). Review-only for the *open* tail (a rebound tmux prefix, an exotic multiplexer),
named honestly — the host set is not fully knowable at build time.
**Pedigree.** Nielsen #4 / least astonishment; WCAG 2.1 SC 2.1.4 (Character Key Shortcuts —
remappable/avoidable precisely because single keys collide).
**Substrate.** *Textual:* check `BINDINGS` against the terminal/multiplexer reserved set at start;
prefer app-scoped chords. *Vue:* check global handlers against browser/AT reserved chords; always
provide a visible alternative control.

#### C16 — In-progress input survives error and navigation [blind]
**Proscription.** A flow is refused from discarding operator-entered data on validation failure, a
transient error, or navigation-away without either preserving the input or interposing an explicit
unsaved-changes guard. Re-typing a config the machine already had wastes the operator's most
expensive resource.
**Class.** Two decidable sub-classes: (a) error handlers that reset the input model instead of
returning errors alongside preserved input; (b) navigation/exit edges out of a dirty editor with no
guard.
**Enforcement.** (a) Construction-time-leaning: the validator returns `errors + original input`, so
clearing on failure is not on the type's surface. (b) CI gate: editor routes/screens must register
a leave guard; absence fails the gate. Composes with C3/C4 — the live model (C3) is flushed
atomically (C4), and C16 guards the in-memory edits before flush.
**Pedigree.** Nielsen #5 and #3; Shneiderman reduce short-term-memory load; Wroblewski.
**Substrate.** *Vue:* `beforeRouteLeave` + `beforeunload` on dirty forms; validation must not reset
`v-model`. *Textual:* the `App` quit/screen-pop path runs a dirty check; `Input` retains its value
on validation failure.

#### C17 — Keyboard/focus integrity: reachable, escapable, visible [convergent: sighted SP8 + blind BP7]
**Proscription.** Every actionable control is reachable and operable via standard keyboard/focus
traversal, in a sensible order, with a visible focus indicator, and does not trap focus. A
mouse-only control, a modal capturing focus with no keyboard exit, or an action available only
through an undiscoverable gesture is refused.
**Class.** Keyboard-inoperability / focus-integrity failure — unreachable control, focus trap,
pointer-only action, no visible focus. Named by concrete failure so a gate/reviewer applies it
without taste.
**Enforcement.** Mechanical gate. *Vue:* strong — axe-core / `eslint-plugin-vuejs-accessibility`
catch missing focusability, tab-order, traps. *Textual:* the focus chain is introspectable — a test
asserts every declared interactive widget is in the focus order and every modal has a dismiss
binding. The "is this gesture discoverable" tail is review, named honestly.
**Pedigree.** WCAG 2.1 SC 2.1.1, 2.1.2, 2.4.3, 2.4.7; Nielsen flexibility/efficiency; Norman
discoverability.
**Substrate.** As above — Vue must *earn* keyboard access the DOM does not give free; Textual gets
it free and must not *lose* it behind mouse-only events.

#### C18 — No meaning carried by color alone [blind]
**Proscription.** A state distinction (status, validity, severity, selection) is refused from being
carried by hue alone; every such distinction has a redundant non-color channel — text label, glyph,
shape, or position. Roughly one in twelve male operators cannot reliably separate the red/green
operational panels lean on hardest.
**Class.** A semantic distinction whose only differentiator is a color token. Decidable by
inspecting whether two states differ only in hue.
**Enforcement.** Construction-time for the common case (a `Status` component that will not render
without a glyph+label) + CI gate (axe-core use-of-color) for ad-hoc cases. Bespoke canvas/table
color-diffs remain review — said plainly.
**Pedigree.** WCAG 2.x SC 1.4.1, 1.4.11; Ware Information Visualization; the color-vision-deficiency
prevalence literature.
**Substrate.** *Vue:* a status pill enforcing icon+label; axe in CI. *Textual:* the hazard is
sharper — the terminal may be monochrome, honor `NO_COLOR`, or remap the palette; forbid style-only
status, require a glyph, respect `NO_COLOR`.

#### C19 — Text and essential glyphs meet contrast thresholds [blind]
**Proscription.** Text and information-bearing glyphs are refused from rendering below WCAG contrast
(4.5:1 normal, 3:1 large / non-text) against their actual background. Low-contrast gray-on-gray is
a defect, especially on the sunlit or projected screens operational UIs run on.
**Class.** A text/glyph foreground-background pair below threshold. Decidable by computing the
contrast ratio.
**Enforcement.** *Vue:* CI gate — token-level contrast test + axe over rendered pages. *Textual:*
the honest ceiling drops — the terminal background is operator-controlled and unknown at build time;
the enforceable rule is to forbid *assuming* a specific background and hardcoded absolute
foregrounds, preferring theme/role colors that inherit the terminal's contrast contract; residual
is review + a documented minimum-terminal assumption.
**Pedigree.** WCAG SC 1.4.3, 1.4.6, 1.4.11.
**Substrate.** Stated inline — a hard CI gate on Vue, an honestly review-bounded discipline on
Textual because one substrate owns its pixels and the other borrows the operator's terminal.

#### C20 — Inputs are labelled; placeholder is never the label [blind]
**Proscription.** An input is refused if its only label is placeholder text that disappears on
entry, or if its label is not programmatically associated. A config field whose name vanishes when
the operator starts typing forces them to clear the field to recall it.
**Class.** Inputs lacking a persistent, associated label distinct from any placeholder. Decidable
from the input's label association.
**Enforcement.** CI gate: axe / `eslint-plugin-vuejs-accessibility` require a programmatic label and
flag placeholder-only inputs. On Textual, assert each `Input` has a `Label`/`border_title` and is
not relying on `placeholder` as its name. (Overlaps C17's a11y-lint mechanically but closes a
distinct WCAG class — 3.3.2/1.3.1, not 2.1.x.)
**Pedigree.** WCAG SC 1.3.1, 3.3.2, 2.4.6; the placeholder-usability research (Wroblewski, NN/g).
**Substrate.** *Vue:* every input has `<label for>`/`aria-label`; placeholder is hint, never name.
*Textual:* pair each `Input` with a visible `Label`/`border_title`; placeholder vanishes on entry
exactly as in the DOM.

#### C21 — Pointer targets meet minimum size [blind]
**Proscription.** A pointer target is refused from rendering below the minimum interactive size
(WCAG 2.5.8 baseline 24×24 CSS px; 44×44 at AAA) unless an equivalent larger hit area is provided.
A target too small to hit reliably becomes one hit wrong — and on a destructive control that is
C10's hazard delivered by a mis-click.
**Class.** A pointer target below the minimum size/spacing exemption. Decidable by computing
rendered dimensions.
**Enforcement.** *Vue:* CI gate — computed-size / axe target-size checks. *Textual:* the ceiling and
severity are lower — the substrate is keyboard-first and its unit is the cell; the rule reduces to
"mouse-clickable regions span enough cells and dense clickable rows are separated" — a review item
plus a modest lint on 1-cell click targets.
**Pedigree.** Fitts's Law (1954); WCAG SC 2.5.5, 2.5.8; Apple HIG / Material touch guidance.
**Substrate.** Stated inline — a hard CI gate on Vue, a low-severity review-bounded rule on Textual;
the asymmetry is itself the honest reporting the ladder demands.

#### C22 — Visual constants come from the sanctioned design-token/component set [blind]
**Proscription.** A color, spacing, or interactive control is refused if instantiated with raw/
ad-hoc values (hex, magic spacing, hand-rolled buttons) outside the project's sanctioned tokens and
component set. Consistency here is not aesthetic: it lets an operator transfer a learned control
across panels, and it is the surface on which C10/C7/C18/C8 become enforceable *once* rather than
per-widget (the sanctioned components carry the confirm gate, the as-of prop, the glyph+label, the
structured error). Distinct from C13 (C13 governs content structure; C22 governs visual constants).
**Class.** Styling values / control instantiations using raw literals outside the sanctioned set.
Decidable by static detection of literals.
**Enforcement.** CI gate/lint: stylelint (Vue) forbidding raw hex/px outside tokens and ad-hoc
controls; Textual CSS (TCSS) with theme `$`-variables only, banning inline hardcoded style literals
(which also satisfies C18/C19 by inheriting the theme's contrast contract).
**Pedigree.** Nielsen #4 consistency and standards; ISO 9241-110 conformity; the design-system
tradition (Frost, Atomic Design; design tokens).
**Substrate.** Stated inline.

#### C23 — No swallowed errors; a failure never returns a silent nominal state [blind]
**Proscription.** An error/exception path is refused from returning the UI to an apparently-nominal
state without surfacing a diagnosable message (and, per C8, a way forward). An empty catch, or a
catch that only logs and continues, is forbidden in UI code. Failures are loud at the surface the
operator watches, not only in a log they are not.
**Class.** Error-handling constructs that neither rethrow nor surface a user-visible diagnosable
error. Decidable by static inspection of catch/except bodies and unhandled-rejection wiring.
**Enforcement.** CI gate/lint (ban `catch {}` / `except: pass` / catch-and-only-log in UI modules) +
a typed floor where feasible (a `Result<T,E>` return forces handling). A global error boundary must
exist and surface, not suppress.
**Pedigree.** Nielsen #9 and #1; ISO 9241-110; the engineering tradition that a swallowed exception
is a latent defect.
**Substrate.** *Vue:* `app.config.errorHandler` + per-component boundaries that render a visible
error; ban silent catches and unhandled rejections. *Textual:* the `App` exception hook surfaces;
worker exceptions not swallowed; `except: pass` in handlers banned.

#### C24 — The UI thread is not blocked during long work [blind]
**Proscription.** An operation is refused from executing on the render/event thread when it can
exceed the response-time thresholds (~0.1 s instant, ~1 s flow, ~10 s attention) such that input
freezes. A frozen operational panel during an incident is worse than a slow one — the operator
cannot tell it from a crash. Distinct from C26 (freeze vs. feedback-absence).
**Class.** A potentially-slow operation (network, disk, heavy compute) invoked synchronously from an
event handler. Decidable by static detection of blocking calls on the UI thread.
**Enforcement.** CI lint (ban sync network, `time.sleep`, known-heavy calls inside handlers) + a
typed nudge to route long work through the async/worker primitive. Not fully construction-time (a
hand-rolled compute loop can still block) — honest floor is lint + review for compute-bound loops.
**Pedigree.** Miller (1968) thresholds; Nielsen response-time limits; Card/Moran/Newell.
**Substrate.** *Vue:* forbid sync XHR / heavy sync compute in handlers; offload CPU to a Web Worker.
*Textual:* the substrate hands you the answer — `@work(thread=True)` for blocking IO — so the lint
is "no blocking call inside a message handler or `compose`; it belongs in a worker."

### Tier D — Spec-time + review, hardening where declared (review is the honest ceiling)

#### C25 — Navigation topology is isomorphic to the data's access topology [sighted]
**Proscription.** The navigation structure matches the access structure of the data it edits. A
configuration is a product type with at most a partial dependency order — a random-access space —
and is presented as a persistent tree/partition of the whole space, not a forced linear Back/Next
wizard. The converse is equally refused: a genuinely sequential dependency chain dissolved into
free navigation that lets the operator skip a real prerequisite. A wizard is licensed only by a
declared, real total dependency order.
**Class.** Topology mismatch — a traversal order not homomorphic to the data's genuine access order.
The discriminator is declarable (the build basis states product / partial-order / total-order).
**Enforcement.** Spec-time (required in the build basis) + review, hardening toward load-time where
the dependency order is encoded: a linearization violating a declared partial order *can* be refused
at load-time, and a stepper over a type with no declared order can be flagged mechanically (no order
⇒ no wizard). The general "is this really a sequence?" is the honest review ceiling.
**Pedigree.** Rosenfeld & Morville Information Architecture; Norman natural mapping; Shneiderman's
Visual Information-Seeking Mantra (overview first — which a wizard structurally denies, a
visibility failure in Green & Petre's terms).
**Substrate.** *Vue:* a tree/tab/section-list with router or panel switching, not a `<Stepper>`; a
stepper in a settings view is the smell. *Textual:* a `Tree`/`TabbedContent`/section list with the
whole space always visible, not screens gated by "Next."

#### C26 — Every action gives feedback; long operations show a busy/progress state [convergent: sighted SP9 + blind BP11]
**Proscription.** Every operator action produces perceptible feedback within its response-time
threshold, and every operation past ~1 s shows a busy indicator (past ~10 s, determinate progress
where knowable). The UI does not block silently or leave the operator inferring completion. Distinct
from C24 (a correctly non-blocking operation can still leave the screen unchanged) and C5 (this is
*any* feedback, not the truthfulness of a *success* claim).
**Class.** An action or state transition whose occurrence is not perceptible within the relevant
threshold.
**Enforcement.** Review-only for the general "is this feedback sufficient" perceptual judgment —
named as the honest maximum. Hardens at the seams: where C5/C6's state machine is in force the
`pending` arm exists and the exhaustiveness check forces it rendered, so an unrendered pending state
fails mechanically; and "an async handler that touches the surface with no status transition" is a
lint target.
**Pedigree.** Nielsen #1 (most-cited heuristic); Norman feedback; Miller (1968) and Nielsen's
0.1/1/10 s bands.
**Substrate.** *Vue:* pending state bound to a visible indicator; no `await` in a handler that
leaves the surface unchanged. *Textual:* `LoadingIndicator`/`ProgressBar`/footer status driven by
worker state — the terminal has no busy cursor, so the in-panel indicator is the only signal and its
absence is more acute than on the web.

#### C27 — Auto-refresh does not clobber in-progress interaction [blind]
**Proscription.** An auto-updating view is refused from mutating content under the operator's active
focus, selection, or scroll position, or from resetting in-progress input on refresh. A panel that
yanks a row out from under a click, or wipes a half-typed filter every five seconds, fights the
operator.
**Class.** Timer/stream-driven refreshes that do not pause or diff-preserve around active
interaction. Partly decidable — the *presence* of an interaction/dirty guard on the refresh path is
checkable; the guard's *adequacy* is review.
**Enforcement.** CI lint that refresh timers consult an interaction/dirty guard (presence) + review
for adequacy — the honest ceiling.
**Pedigree.** Nielsen #1 held against #3; Shneiderman internal locus of control; live process-
monitoring HCI.
**Substrate.** *Vue:* reactive/websocket refreshes must not overwrite a dirty form or reset a
selection; pause while editing. *Textual:* `set_interval` refresh must not steal focus or reset an
`Input`; `DataTable` refresh preserves cursor/selection rather than rebuilding.

#### C28 — Alarms/notifications are severity-prioritized and flood-suppressed [blind]
**Proscription.** An operational dashboard is refused from presenting alarms/notifications without
severity prioritization and flood/rate suppression, such that a critical signal is buried or
indistinguishable from noise. Alarm fatigue is a documented cause of operators disabling the very
signal that would have warned them.
**Class.** Alarm/notification sinks where items lack a required severity or the sink lacks an
ordering/rate-cap policy. Decidable that severity is required and a policy exists; threshold *tuning*
is review.
**Enforcement.** Construction-time for the required severity (an alarm without a severity enum cannot
be constructed) + a load-time policy assertion that the sink sorts/caps by severity. Residual review
on threshold tuning, named as such.
**Pedigree.** EEMUA 191 and ANSI/ISA-18.2 (alarm management); the Three Mile Island alarm-flood
literature; Endsley situation awareness; Nielsen #8 (signal over noise).
**Substrate.** *Vue:* an alarm-feed component requiring severity, deduping and rate-limiting; critical
alarms visually/positionally dominant. *Textual:* the same in-panel, with `notify` severity used
deliberately rather than a toast per event — the narrow terminal makes capping more necessary.

#### C29 — Modes carry a persistent, visible indicator [blind]
**Proscription.** An interface mode that changes the effect of the same input is refused from
existing without a persistent, always-visible indication of which mode is active. Mode errors — the
right input into the wrong mode — are a distinct, catalogued class; the fix is to remove the mode or
make its state impossible to lose track of (removal outranks indication).
**Class.** Modes (states where identical input maps to different effects) lacking an always-visible
indicator. Partly decidable — that a mode enum has a rendered indicator binding is checkable; that
the indicator is *always visible and legible* is review.
**Enforcement.** Construction-time for the binding (a mode enum with no registered indicator binding
fails a startup assertion) + review for persistence/legibility — the honest ceiling.
**Pedigree.** Raskin The Humane Interface (modes/quasimodes, the case against modes); Norman mode
errors/slips; Tesler (conservation of complexity; his campaign against modes).
**Substrate.** *Vue:* modal editing state drives a persistent indicator; no hidden global mode flags
silently changing what a keypress does. *Textual:* screen "modes" and vi-style key layers surface
the active mode in the footer/header — the binding display is the natural, required indicator
surface.

---

### Provenance and enforcement roll-up

- **[sighted] (9):** C1, C2, C3, C11, C12, C13, C14, C15, C25 — the structural/architectural cluster
  where the witnessed incidents lived; three (C12, C13, C14) carry a shipped in-repo gate.
- **[blind] (16):** C4, C5, C6, C7, C9, C16, C18, C19, C20, C21, C22, C23, C24, C27, C28, C29 — the
  data-integrity, config-safety, and perceptual-a11y clusters the sighted consult under-covered
  relative to the named genres.
- **[convergent] (4):** C8, C10, C17, C26 — produced independently by both a blind and a sighted
  instance from the field's canon; the least controversial, the field's bedrock.

Construction-time typed refusal is the honest surface for C1–C11 (C1–C7, C9, C10 strongly; C3, C8,
C11 with a named review tail). Witnessed in-repo gates carry C12–C14. Load-time / CI gate/lint
carries C15–C24. Spec-time-plus-review, hardening where an order/guard is declared, is the honest
ceiling for C25–C29 — each says so in plain words rather than claiming a gate it lacks.
