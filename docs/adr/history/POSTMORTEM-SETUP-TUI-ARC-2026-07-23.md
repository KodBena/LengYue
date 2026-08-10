<!-- doc-attest-exempt: postmortem in maintainer review; attestation follows his read. -->

# autoharn setup-TUI — Postmortem & UI Field Guide

*Commissioned 2026-07-22 (ledger rows 1134/1135). Scope corrected by the maintainer,
verbatim: "I meant specifically for ui (even minor findings) since ui is what im the least
experienced with." Reader: the maintainer — a systems/database engineer building UI
intuition from this one arc's record. This is a teaching document, not a diary.*

This file has two registers, kept apart on purpose:

- **Register 1 — The UI Field Guide** is the bulk. It is organized by *durable lesson*,
  not by chronology. Every UI finding of every severity — from all nine audit/fix cycles,
  the maintainer's bench findings, the pre-series rebuild rounds, and both consults — lands
  under some lesson. A completeness ledger at the end maps each catalogued finding to its
  lesson so the sweep is checkable, and names the handful of items that resisted clean
  classification.
- **Register 2 — Beyond the Pixels** is compact. It records what the loop surfaced that
  was *not* UI: a bug the TUI acted as a canary for, the ways the automated witness surface
  was blind, and the mechanics (and costs) of the review loop itself.

A note on discipline, because it shaped the writing: this postmortem synthesizes documents
that are themselves *about how synthesis corrupts claims* (see Lesson 23). So nothing here
is strengthened, softened, or stripped of its qualifiers. Aspirations stay aspirations,
speculation stays marked as speculation, honest ceilings stay stated as ceilings, and the
maintainer's own words are quoted verbatim where they carry the judgment. Each claim cites
its source so you can check it.

Two pieces of house vocabulary used throughout, defined once:

- **ADR** — an Architecture Decision Record, a numbered file under `law/adr/` recording a
  ratified engineering rule. The UI law produced by this arc is **ADR-0019** ("genre
  convention is the default spec"), its four rules, and its companion appendix of
  twenty-nine proscriptions numbered **C1–C29**.
- **the ledger** — the project's append-only log of maintainer rulings and findings, read
  with the `./led` tool. "Row 1138" means ledger entry 1138. Rows carry the maintainer's
  verbatim words and every adjudication, which is why they are cited so often below.

---

# The one-paragraph story, so the lessons have a spine

A setup wizard (the "setup TUI" — the terminal program a person runs to configure a
brand-new install; that person is the "founding operator") was rebuilt from scratch after
four separate AI builds, in a single day, each invented a fresh interface anti-pattern that
no mainstream configuration program exhibits — at a cost the maintainer measured at roughly
$340 of model spend and, worse, his own eyes as the only detector (ADR-0019 provenance;
ledger row 1111). That failure produced the UI law (ADR-0019 + the C1–C29 companion). The
rebuilt TUI was then put through a **weak-fixed-point loop**: a fresh, blind auditor drives
the live program each cycle, files findings, a builder fixes them, and the loop repeats
until a fresh audit finds no major defect (ledger rows 1124/1133). It ran nine cycles.
Convergence was *claimed* early and *falsified* by the maintainer's own hands-on use before
it finally held. Eleven major defects were killed along the way (ledger row 1142). This
guide is what those eleven majors, and every minor beside them, teach.

---

# REGISTER 1 — THE UI FIELD GUIDE

## How to read this register, and the one skill it is trying to teach you

The single most transferable skill in this entire record is the one the maintainer used
over and over: **he diagnosed correctly from the rendered result alone.** He did not read
the code. He looked at a screen and said "the configuration equivalent of spaghetti code"
(row 1130), or "I have to scroll just to find action surfaces" (row 1138), or saw a big
blank gap and read it as "adding-removes-all-abilities" (row 1139). Each was a correct
diagnosis of a structural defect, made from pixels.

So every lesson below ends with an **On screen** paragraph: what this defect class *looks
like* when you are the operator staring at the terminal, before you know the cause. That is
the muscle to build. The principle and its pedigree tell you *why* it is wrong; the **On
screen** tells you how to *catch* it the way the maintainer did.

Severity words used below match the loop's own: **MAJOR** = ranked HIGH or above, or a
functional "does not do what its own text promises" defect; everything else is a **minor**,
and the commission explicitly wanted the minors included.

The lessons are grouped into eight themes. The themes run roughly in the order the maintainer
himself insisted the work run: **get the shape right first, correctness second** (ADR-0019's
own "structure first, correctness second" — a correct implementation of a deviant structure
is still a defect).

---

## Theme 1 — Get the shape right before you touch a pixel

### Lesson 1 — In a solved genre, the convergent design *is* the spec; novelty is the anti-pattern

**Principle.** A configuration editor, a file picker, a log viewer, a form, a table browser
— these are *solved genres*. Decades of convergent evolution across thousands of programs
produced a dominant idiom per genre. For configuration specifically: a hierarchical tree of
the whole space, always visible; a form pane whose fields are a *live* view of the model;
statuses *derived*, not declared; one real commit action, not per-node ceremony (Qt
settings, SAP IMG, every mature settings surface). A build inherits that idiom in full. Any
structure the genre's reference programs do not exhibit is *presumptively wrong*, and the
burden of proof sits on the deviation, never on the convention. "I have not seen this shape
in the references" is, by itself, sufficient grounds to reject. This is **ADR-0019 Rules 1
and 2** (ledger row 1111), and its pedigree is stated in the ADR: it is the maintainer's own
observation that LLM builders, which are supposed to be statistical pattern-completers,
*each produced task-shaped novelty instead of the genre's convergent shape*.

**The arc's specimens.** The whole law exists because of five anti-patterns invented fresh,
four of them within hours, on 2026-07-22 (ledger row 1111; sighted consult specimens S1–S7):

- **S1 — a teletype emulated inside a widget toolkit.** A print-stream / append-only text
  scroll built as the primary surface on top of Textual, which already provides focus,
  scrollback, and selection. The rebuild commission (row 1100) deleted this "whole-sale so
  that nobody mistakenly implements something that is this cursed," verbatim. Companion rule
  **C14** (no substrate emulation).
- **S2 — a product-type configuration rendered as a sequential Back/Next wizard** (ledger
  row 1109). A configuration is a *product type* with at most a partial dependency order — a
  random-access space. Projecting it onto an arbitrary total order is "a record rendered as
  a linked list" (row 1109's own diagnosis). No consumer of "sequential" ever existed — the
  named-consumer test failed at the spec author. Companion rule **C25**.
- **S3 — a per-section Save button** splitting form state from model state into two stores
  (companion rule **C3**; see Lesson 4).
- **S4 — a bespoke navigation protocol**: a literal typed `<` character parsed out of the
  data-entry stream to mean "go back" (companion rule **C11**; see Lesson 21's sibling on
  in-band control), *and* a `ctrl+b` binding colliding with the tmux prefix (companion rule
  **C15**; see Lesson 30).
- **S5 / S6 — flat-keyspace aliasing and a mirrored field** (companion rule **C1**; see
  Lesson 3).
- **S7 — a 348-character line spanning the full terminal width** (companion rules **C12**
  and **C13**; see Lessons 19 and 20).

**The fix, structurally.** Not a patch — a *law*. The response to a class of defect that
survives spec-time and review is to make the class unconstructable or reviewable-by-rule,
not to fix each instance. ADR-0019 deliberately mints *no* anti-pattern list to maintain
("the genre references are the living catalog; the world maintains them for us"). The build
basis for any UI must now name the genre and two or three reference exemplars and specify
only the domain content plus *named, justified* deltas.

**On screen.** You are looking at genre novelty when the surface does something no
mainstream program in its category does. The tell is not ugliness — all four of the day's
builds were "correct" implementations. The tell is *unfamiliarity*: a settings screen with
a "Next" button; a config tool that scrolls like a chat log; a keystroke that means
something different here than everywhere else. If you cannot point to a real program that
works this way, that is the finding.

---

### Lesson 2 — The navigation must have the same shape as the data (master-detail, not parallel lists)

**Principle.** For any UI over relationally-structured data, the data's conceptual topology
— its entities, its dependents, its associations, its derived projections — is a *mandatory
design input* and the presentation's *default shape*. The default bindings are the genre's
own convergents (Naked Objects, and its scaffolding descendants Rails admin and Django
admin, are the worked prior art): an entity gets one home surface; a **dependent** (a thing
foreign-keyed to a parent, with no independent existence) is created and edited *inside its
parent's context, master-detail*, never as a sibling flat list; an **association** (a thing
joining two entities) renders as a *selection* over the entities it joins, never as free
text; a **derived projection** gets a read-only surface; and pure storage machinery gets no
surface at all. This is **ADR-0019 Rule 4** (ledger row 1132). "Master-detail" means: you
select the parent (the master), and its children edit *in place, in the parent's own
block* — Django admin's inline formsets are the canonical example (you edit an Author's
Books right on the Author's page, never in a separate top-level Books list you cross-
reference by dropdown).

**The arc's specimens.** This is the most instructive saga in the whole arc, because the
*correct topology took four cycles to land* and each cycle taught a distinct sub-lesson:

- **The minting specimen (bench row 1130, cycle-2 audit MAJOR #1).** The principals-and-
  authority section rendered a principal (entity) and its competences, relations, and role-
  charters (dependents/associations) as **four parallel flat lists on one pane**. The
  maintainer's verdict from the rendered screen alone, verbatim: *"the configuration
  equivalent of spaghetti code."* He named the correct genre himself — enterprise role
  management (Active Directory Users-and-Computers, Keycloak admin, SAP PFCG) is master-
  detail; "the four-parallel-flat-lists shape exists in none of them" (row 1131). Rule 4 was
  authored from this exact defect.
- **The restructure (cycle-2 fix).** Competences/charters became **dependents nested under
  their owning principal**; relation became a **ChoiceField selection** placed under its
  *subject* only (never mirrored under the object — that is Lesson 3). Topology now
  isomorphic to the data.
- **The control-fidelity gap it exposed (cycle-3 audit, two MAJORs).** Getting the topology
  right *moved* the dependent editors into a modal dialog — and the modal was a hand-copied,
  drifted duplicate of the pane's field renderer. So the over-threshold filter (Lesson 22)
  and the per-field help text (Lesson 24) *silently stopped rendering* for every field now
  living in the modal. Sub-lesson: **a structural fix that relocates controls can strand the
  infrastructure that was attached to their old home.** Fixed by collapsing the two drifted
  renderers into one shared renderer (`render_item_field`).
- **The interaction-path failure (bench row 1136, cycle-3 fix).** The maintainer found, in
  his live terminal, that *adding a principal was a no-op* — see Lesson 16 (selection
  affordance) and Lesson 15 (scroll budget) for the two root causes. The topology was right;
  you could not *operate* it.
- **The destructive-mechanics gap (cycle-5 audit MAJOR).** Correct topology, but removing a
  master silently cascaded its dependents — see Lesson 12.

By cycle 9 the section was independently re-driven at three principals and held. The lesson
is that **topology-correct and usable are different achievements**; the arc got the first in
one cycle and the second over four.

**On screen.** You are looking at a topology mismatch when things that *belong to* something
else are shown as *peers* of it. Several flat lists side by side, where one list's items
each point back into another list by a dropdown, is the signature. The operator's test: "to
add a competence to Alice, do I go to Alice, or do I go to a separate Competences list and
pick Alice from a menu?" If the answer is the second, the shape is wrong.

---

### Lesson 3 — One fact, one home — on the screen exactly as in the model

**Principle.** The navigation hierarchy is a *typed claim of unique placement*: a section
tree asserts that every fact has exactly one address. Rendering one value under two headings
— editable in both, *or* editable in one and mirrored read-only in the other — falsifies
that claim and mints a hidden dependency the operator can only discover by accident (touch
one widget, watch another twitch). This is **ADR-0019 Rule 3** and companion rule **C1**
(ledger rows 1112, 1113), and the maintainer adjudicated it in the strongest terms,
verbatim: *"ADR-0002 — a duplicated mirror/projection of a value is a type error and refused
on TUI start."* A read-only "convenience mirror" is *not* a softer alternative — it was
struck entirely (row 1112). The pedigree recorded in the law so it never reads as one
person's idiosyncrasy: information-architecture unique-placement and polyhierarchy-as-
hazard; Green & Petre's *hidden dependencies*; Norman's 1:1 control-to-variable mapping and
*gulf of evaluation*.

**The arc's specimens.**

- **S5 — flat-keyspace aliasing** (pre-arc): same-named checkboxes in two sections collapsing
  to one underlying slot, so toggling one moved the other.
- **S6 — a value editable under two sub-headings, then proposed as a read-only mirror** (pre-
  arc): the specimen the maintainer adjudicated into Rule 3.
- **signed-genesis recorded both SKIPPED and REFUSED in one run** (round-5, ledger row 1115):
  two disagreeing records of one fact — the aliasing class turned against the *audit record
  itself*. One fact, two homes, disagreeing.
- **The commit-success lie, two homes** (cycle-7 audit, ledger row 1140): the interactive
  path and the headless path each carried their own copy of "did the commit succeed," and
  they drifted — see Lesson 6. This is the same one-fact-two-homes class at the state-machine
  layer.
- **A latent `#ct-field-path` id collision** (cycle-5 fix): an action-pane field and a
  section-pane field shared a bare name and "worked" only by a DOM-depth accident in the
  query lookup; the layout change exposed it. Sub-lesson: **a bare shared name is a latent
  alias even when nothing has twitched yet.**

**The fix, structurally.** A construction-time refusal: `validate_shared_ownership` runs at
UI start, and a duplicated projection raises loudly, *naming the fact and every section
claiming it*. Shared facts (like the destination directory `dest`, or the world name
`world`) render in exactly one section; the others show a named "blocked, provide X first"
banner. The refusal is over the declared binding table (data), so it is a real gate, not a
review item.

**On screen.** You are looking at an aliasing/mirror defect when *editing one thing changes
another thing you did not touch*, or when the *same value appears in two places*. The
operator's test: if you can find one fact rendered under two headings, that is the finding —
regardless of whether one copy is greyed out. The subtler tell is the audit-record version:
one action producing two disagreeing status lines about itself.

---

## Theme 2 — Make the surface tell the truth

### Lesson 4 — The editing surface is a live view of the model; no per-widget "Save"

**Principle.** A field's on-screen value *is* the model slot — reading it reads the model,
changing it changes the model. Maintaining a separate "form store" that a per-field or per-
section **Save**/**Apply** button reconciles into the model is refused: it mints two writers
of one truth joined by a manual sync the operator can desynchronize (edit, forget to Save,
navigate away). This is companion rule **C3**; the pedigree is Shneiderman's *direct
manipulation* and Norman's *gulf of evaluation* (a Save button widens the gulf — you cannot
see whether the model matches the screen without a second act). One *whole-model*
transactional commit at the end is a different thing and is permitted.

**The arc's specimen.** S3, pre-arc: a per-section Save button splitting form state from
model state. Throughout the nine cycles this held clean — every audit re-verified that the
*only* buttons anywhere are the master-detail Add/Remove pairs, the Add-item modal's own
Save (a bounded commit of one genuinely-incomplete row), and the single final Commit. No
shadow store was ever reintroduced. It is included here as a durable lesson precisely
because the arc got it *right* and kept it right — a negative specimen worth knowing.

**On screen.** You are looking at a shadow-store defect when a screen has "Save" buttons
scattered per-field or per-section, or when a value you clearly changed does not seem to
have "taken" until you press something. The operator's test: change a field, navigate away
without pressing anything, come back — is your change still there? If it needed a Save, you
had two stores.

---

### Lesson 5 — Derived values are read-only; status is *computed*, never declared

**Principle.** A value the system derives — a status, a count, a completeness state — is
rendered read-only, never as an editable widget, and is *recomputed*, never *stored and
declared*. Companion rule **C2** and ADR-0019 Rule 1's "statuses derived, not declared."
Binding an editable control to a derived value invites the operator to set what the system
will immediately recompute, minting a second writer of a derived fact.

**The arc's specimen.** Held clean throughout, and worth knowing as the correct pattern: a
section's completeness status is a pure function of its field values, recomputed on every
call — cycle 1 verified directly that after writing only two fields, a section read "10/10
complete" *before any other section was ever visited*, because status is never a function of
visitation history. The Commit button is gated on true completeness (disabled until 10/10),
also a derived state.

**On screen.** You are looking at a declared-status defect when a status can be *wrong
relative to the data* — a section marked "done" that is missing a value, or a "complete"
that depends on whether you *visited* rather than whether you *filled in*. The operator's
test: change a field that should affect a status, and watch whether the status updates by
itself. If it lags, it was declared, not derived.

---

### Lesson 6 — The interface may not lie about what the backend did (no optimistic success)

**Principle.** The UI enters a "success / committed" state *only* from a durable
acknowledgement that the work actually happened. A success flag set in the same breath as
the dispatch, with no acknowledgement edge, is forbidden — the interface may not report
"done" before the backend confirms it. This is companion rule **C5**; the pedigree is
Nielsen's #1 (true visibility of system status) and the distributed-systems maxim that an
unacknowledged write is not a write. This class was *predicted by a consult before the arc
found an instance of it* (see Register 2).

**The arc's specimens.**

- **The commit-success lie** (cycle-7 audit MAJOR, ledger row 1140). `steps.py`'s `commit()`
  computed the real outcome, correctly wrote `COMMIT HALTED` into its own checklist, and then
  *returned a hardcoded `ok=True` regardless*. So the interactive app **always exited 0 and
  always showed a green "Finish" button — even when the checklist it had just rendered read
  `REFUSED` and `COMMIT HALTED -- re-run this tool`.** Witnessed against a genuinely failed
  live database birth. The headless `--from-config` path checked the failure correctly; the
  two paths had drifted — one fact, two homes (Lesson 3). Fixed at cycle 8 by carrying the
  real `ok` value through to a *single* home, and there turned out to be **two** hardcoded
  `ok=True` returns, not one (the terminal return and a second in the no-destination early
  exit). The Finish button now reads `variant="error"` / "Finish (commit halted)" on failure.
- **False attribution of choice** (round-5, ledger row 1115). With no in-UI way to load a
  configuration, the untouched defaults ran, and the checklist then recorded "operator
  declined" for defaults *the operator never touched*. The surface asserted a choice the
  operator did not make — the truthfulness defect in its attribution form.

**On screen.** You are looking at an optimistic lie when the *chrome* and the *content*
disagree: a green "success" button sitting directly above a checklist that says "refused."
The operator's test — and this is exactly how it was caught — is to *read the words on the
result screen against the color/label of the result control*. If the screen's text says it
failed and the button says success, the button is lying. The attribution version: watch for
the UI reporting that *you* did something (chose, declined, skipped) that you have no memory
of doing.

---

### Lesson 7 — Config commits validate the whole document and write atomically

**Principle.** A configuration editor commits operator input to the live target only after
validating the *whole document* first, and writes *atomically* — the target is left fully-
old or fully-new, never partial-on-failure. Companion rule **C4**; pedigree is Alexis King's
"Parse, don't validate" and the atomic-configuration tradition (etcd, Nix generations,
ACID). Disabling the commit button is *not* sufficient and is not the required control.

**The arc's status.** This class was **not witnessed** as a defect in the nine cycles — it
is a foreclosed class, carried here because the field guide should be complete and because a
config editor is exactly its home genre. The nearest live evidence is adjacent and lives in
Register 2: a real database birth *did* fail partway through (the s15 failure), leaving
residue — which is a downstream reminder that "partial-on-failure" is a real hazard the
commit path must bound. Marked here as **carried, not witnessed in this arc.**

**On screen.** You would be looking at this defect if a failed commit left the target in a
half-written state — some settings applied, some not — with no way to tell which. The
operator's test: after a *failed* apply, is the target all-old or all-new? "Some of each" is
the finding.

---

## Theme 3 — Respect the operator's time and attention

### Lesson 8 — Never run slow work on the UI thread

**Principle.** A potentially-slow operation (network, disk, subprocess, heavy compute) must
not run synchronously on the render/event thread, where it freezes all input. A frozen panel
is worse than a slow one — the operator cannot tell it from a crash. Companion rule **C24**;
on Textual the answer the substrate hands you is `@work(thread=True)`.

**The arc's specimen.** The **first HIGH the loop ever found** (cycle-1 audit MAJOR #1,
ledger row 1131), and notably one **neither the maintainer's bench nor any prior round had
caught** — a genuinely new class surfaced by the fresh blind auditor. The commit sweep ran
*all ten sections' real business logic* — network probes, subprocess calls, and in a live
run the whole scaffold act — *synchronously in the button handler*, with no worker offload
anywhere. A single unresponsive-host probe was witnessed freezing the UI for **3.01
seconds**; two such probes plus an unbounded live scaffold would freeze it far longer, with
zero feedback. Fixed by routing the sweep through a Textual worker
(`@work(thread=True, exclusive=True)`) with busy chrome.

**On screen.** You are looking at a UI-thread block when the whole surface stops responding
— no cursor, no scroll, no reaction to keys — during an operation, then unfreezes when it
finishes. The operator's test: press an unrelated key (scroll the tree) *during* the slow
step. If nothing happens until the step ends, the thread was blocked. (This is invisible in
a fast test environment where the slow work happens to complete quickly — which is exactly
why the auditor witnessed it against a *deliberately* unresponsive host.)

---

### Lesson 9 — Every action gives feedback; anything past ~1s shows a busy state

**Principle.** Every operator action produces perceptible feedback within its response-time
threshold, and any operation past ~1 second shows a busy indicator (past ~10 seconds, a
determinate progress where knowable). The UI never blocks *silently*. Companion rule **C26**;
pedigree is Nielsen #1 and Miller's (1968) 0.1s / 1s / 10s bands. This is distinct from
Lesson 8: a correctly non-blocking operation can *still* leave the screen looking unchanged,
which is its own defect.

**The arc's specimen.** The same cycle-1 commit-sweep finding was, in the auditor's words,
worse than a mere insufficiency: "here there is *no* feedback at all, not merely
insufficient." The fix added a disabled button plus a visible busy indicator on the commit
pane for the duration of the sweep.

**On screen.** You are looking at a feedback gap when you press something and *nothing
visibly happens* — no spinner, no disabled state, no status line — even though work is
clearly underway. The operator's test: after pressing an action, can you tell from the
screen alone that it is *working* rather than *ignoring you*? If not, feedback is missing.

---

### Lesson 10 — Long or side-effecting operations must be cancellable — and the cancel must actually stop the work

**Principle.** An operation past ~10 seconds, or any side-effecting one running longer than
instantaneously, must offer a cancel/abort *wired to actually stop the work*. Companion rule
**C9**. The subtle half: a cancel button that sets a flag which only takes effect *after*
the current step finishes is not a real cancel for a step that is itself slow.

**The arc's specimens.**

- **Cancel grain** (cycle-4 audit, the sole MINOR at the first convergence). Cancel was
  enabled and clickable during a rehearsal step whose real subprocess work was witnessed
  running ~61 seconds in one run — but the cancellation flag was only *sampled between
  sections, never inside one*. So pressing Cancel during the slow step did nothing until the
  subprocess finished naturally. The auditor named the honest exemplar: a mature installer
  cancels the *in-flight* action, not merely the queue after it.
- **The real fix, not the disclaimer** (cycle-5 fix). Rather than narrowing the busy-text to
  admit the limitation, the builder threaded a real cancellation token into the subprocess
  runner: a poll loop checks it every 0.2s, then SIGTERM → bounded wait → SIGKILL. A dedicated
  `CANCELLED` checklist status was minted rather than reusing `REFUSED`. Teardown was
  deliberately left *non-cancellable* (a mid-birth cancel still runs teardown to completion,
  for residue safety) — an honest, named exception, not a gap.

**On screen.** You are looking at a cancel-grain defect when a Cancel button is *enabled and
seems live* during a long step, but pressing it does nothing perceptible until the step ends
on its own. The operator's test: start a genuinely slow operation, press Cancel mid-flight,
and time how long until it actually stops. "Only after the current step finishes" is the
finding. (A subtler point the arc records honestly: some steps *should not* be cancellable —
a teardown that protects against leftover residue — and the right move there is to *say so*,
not to fake a cancel.)

---

## Theme 4 — Guard against loss

### Lesson 11 — Destructive actions are confirmed *or* undoable, and destructive controls carry visible weight

**Principle.** A destructive/irreversible action (delete, overwrite, reset, discard) must be
guarded by a confirm step *or* a registered undo — reversibility is a *typed property of the
action*, not an afterthought. Confirmation and undo are alternatives; *neither being present
is the defect*. Companion rule **C10**; pedigree includes Cooper's distinction between
*gratuitous* and *earned* confirmation — you do not confirm a harmless act, and you do not
fail to confirm a costly one.

**The arc's specimens.**

- **Silent cascade delete** (cycle-5 audit MAJOR). Removing a principal (master) silently
  deleted all its dependent competences/relations/charters — *no confirm, no undo, no after-
  the-fact notice* — and, worse, the removal contradicted the code's *own docstring*, which
  claimed the operator would see and understand the cascade. Reproduced end-to-end: a
  principal with a competence vanished in one click, leaving no trace on screen. Fixed
  (cycle-6) with a `ConfirmModal` that *names the exact inventory* to be cascaded ("Remove X
  and its N competences, M relations, K charters?"). Per Cooper's distinction, a *zero-
  dependent* removal correctly **skips** the confirm — you do not make the operator confirm a
  removal that takes nothing with it.
- **The mis-click gutter** (cycle-5 audit MINOR, companion rule **C21** at its honest lower
  ceiling for a keyboard-first terminal). The 3-cell Remove button sat *directly adjacent* to
  the row-select button with no separation and no visual weight distinguishing the
  destructive control from the harmless one — turning the cascade from a rare deliberate act
  into a plausible fat-finger. Fixed by adding a margin and an `error` variant to the master-
  row Remove.

**On screen.** You are looking at an unguarded-destruction defect when a single click
*removes data with no confirmation and no visible trace that anything cascaded*. The
operator's test: delete a parent that has children, and watch whether the screen either asks
first or tells you afterward what went with it. Silence on both is the finding. The adjacency
tell: a destructive control sitting flush against a harmless one, styled identically.

---

### Lesson 12 — In-progress input survives navigation and mode changes

**Principle.** A flow must not discard operator-entered data on a validation failure, a
transient error, or a navigation-away, without either preserving it or interposing an
explicit unsaved-changes guard. Re-typing a config the machine already had wastes the
operator's most expensive resource. Companion rule **C16**.

**The arc's specimen.** Verified *clean* at cycle 9 as a deliberate new probe: partial input
typed into a field *survives an F1 help-mode toggle in both directions* (expand and
collapse). Carried here as the correct behavior to expect, and as an example of the loop
adding a *new* combination the regression suite did not have.

**On screen.** You are looking at an input-loss defect when text you were typing *disappears*
after an error message, a screen switch, or a mode toggle. The operator's test: start typing
a value, trigger something else (an error, a help toggle, a navigation), and check whether
your half-typed value is still there.

---

## Theme 5 — Layout, space, and the viewport

### Lesson 13 — A container's height must track its content, not the viewport (the "phantom expanse" class)

**Principle.** A content container's height is a function of what is *in* it, not of the
space around it. On Textual specifically, a bare `Horizontal`/`Vertical` defaults to
`height: 1fr` — "take a fractional share of the available space" — which, nested wrongly,
resolves against a scrollable ancestor instead of the row's real content and inflates the
container to a huge empty height. This class recurred *three times* in this project, each
time patched locally without anyone naming the class, until the maintainer named it (ledger
row 1139): **container-height-claims-decoupled-from-content-size.**

**The arc's specimens (all three instances of one class).**

- **Round-5 overlap** (pre-series): the earliest instance.
- **Cycle-3 starvation**: title/description rendered as fixed-size siblings *outside* the
  section's scroll region could starve the real form to 2 visible rows at 80×24.
- **Cycle-5 phantom expanse** (bench, ledger row 1139): after adding a competence, the master-
  detail block rendered the item and then *a huge blank vertical region*, pushing the
  remaining sub-lists and Add buttons below it. The maintainer's read from the screenshot,
  verbatim in effect: it read as *"adding-removes-all-abilities"* — you added a competence and
  everything else appeared to vanish. Convicted (cycle-6) to an *anonymous `Horizontal()` at
  the `1fr` default*; measured live, the detail block claimed a 70-row virtual height for ~21
  rows of real content, i.e. **42+ blank rows** below the real controls.

**The fix, structurally — and this is the important part.** The cycle-6 response did not just
patch the third instance. It (a) minted **typed layout primitives** (`ContentVertical` /
`ContentHorizontal`) whose class-level CSS is `height: auto` by construction, so a content
container *cannot* carry the `1fr` default; (b) added an AST **purity-gate detector** that
refuses any raw `Vertical`/`Horizontal`/`VerticalScroll` in the UI code outside a small
enumerated exception list; and (c) wired an **always-on layout invariant** that runs after
*every* Pilot interaction in every fixture, checking a blank-row budget (≤3) between
actionable widgets and each container's virtual height against the sum of its children. On
its very first sweep the invariant caught **two more latent sites** of the same class that
no test had been looking at. The maintainer's own diagnosis of *why* the class kept
recurring: the fixtures were "a museum of past incidents with no global invariant" — every
instance had its own anchored test, so every new layout change could re-mint the class *where
no case looked* (row 1139; see Register 2 on instance-anchored fixtures).

**On screen.** You are looking at a phantom-expanse defect when there is *a large blank gap
between things that should be adjacent* — you add an item and the next control is suddenly a
screen-and-a-half below it, reachable only by scrolling past emptiness. The operator's test,
which is exactly the maintainer's: after an action, is there dead vertical space where the
next control should be? A scrollbar that "eventually reaches another Add button" past a blank
void is the signature.

---

### Lesson 14 — Ask what scroll budget sits between the operator and every control (reachability ≠ existence)

**Principle.** A control that *exists* and *functions once reached* can still be effectively
unreachable if it sits far below the fold with no discoverable way to get to it.
Reachability-under-realistic-viewport is a *distinct question* from correctness-once-reached,
and "does every add-flow work" must be read to include "and can an operator actually get a
pointer to it." Companion rule **C17** (keyboard/focus integrity) in spirit.

**The arc's specimens.**

- **The live no-op** (bench row 1136, cycle-3). One of the two root causes of "adding a
  principal is a no-op in my terminal" was a layout squeeze burying the control below a fold
  the operator did not realize they had to scroll past (the other cause is Lesson 16).
- **The 80×24 case** (cycle-3 instrument, cycle-4 audit). At the mandated *minimum* terminal
  size, the "Add Principal" button rendered genuinely off-screen — only ~2 rows of a 96-row
  form visible at once. It was reachable by *realistic incremental scrolling* (arrow/PageDown
  on the focused region, or the mouse wheel), which is a real distinction from a hard block —
  but a *single unscrolled click* raised an out-of-bounds error. The instrument report's
  honest self-criticism: the blind passes had swept terminal *width* but never *height*, and
  the reachability degradation is *height*-driven.
- **A false-MAJOR withdrawn** (cycle-4 audit). The auditor first flagged this as unreachable,
  then found the error was in its *own* test harness (six scroll steps against a viewport
  needing ~28) and withdrew the finding — recording it anyway because a false-MAJOR is exactly
  the over-reporting bias the audit brief warns against.

**On screen.** You are looking at a reachability defect when a control you *need* is not
visible at the current terminal size and there is *no obvious cue that scrolling will reveal
it*. The operator's test: shrink your terminal to a common small size (80×24, a normal tmux
pane) and try to reach every action *without already knowing where it is*. If you cannot find
the Add button, neither can a first-time operator — even if it is "there."

---

### Lesson 15 — A control the operator must click needs a visible selection/click affordance

**Principle.** If the interaction model is "select a row, then act on it," the row must
*look* selectable and *respond* to being selected — a focusable, clickable element with a
visible selected-state marker. A bare static line is not a control, no matter what the model
behind it can do.

**The arc's specimen.** The *other* root cause of the live no-op (bench row 1136, cycle-3
fix): the master-detail widget rendered every principal row as a **bare `Static`** — no focus,
no click target, no selected-state at all. Clicking the row moved focus to the enclosing
scroll region and *nothing else happened*. Fixed by making master rows real focusable
`Button`s that show a `>` selection marker, and rendering only the *selected* row's dependent
lists (which also relieved the phantom-expanse pressure of Lesson 13).

**On screen.** You are looking at a missing-affordance defect when clicking something that
should be interactive produces *no visible response* — no highlight, no marker, no change.
The operator's test: click a row you expect to select. If nothing about the screen changes to
tell you it *is* selected, there is no affordance there, and the operator will conclude
(correctly) that the click "did nothing."

---

### Lesson 16 — Controls belong to stable regions; only content scrolls; use the width you have

**Principle.** Three related sub-principles the maintainer named together (ledger row 1138):
**content/chrome separation** — action controls belong to stable, always-visible regions,
and only *content* scrolls; **progressive disclosure** — long reference prose is not dumped
fully-expanded inline in the primary flow, but offered in a place the operator can consult on
demand; and **use the available width** — a fixed text *measure* (Lesson 19) is a line-length
rule for readability, *not* a mandate to render a single narrow ribbon down the middle of a
wide screen. Companion rules C25/C26 in spirit; genre exemplars are Qt Creator's docked help
and SAP's F1 panel.

**The arc's specimen.** This *reopened the loop after it had already claimed convergence.* At
cycle 4 the audit declared MAJOR ABSENT. The maintainer then used the converged build at 251-
column width and filed a major from the screenshot, verbatim: *"I have to scroll just to find
action surfaces, instead of the UI leveraging hierarchical design and using a scrollable text
component situated next to each action surface."* The fix (cycle-5) split the surface into a
**compact control column beside an independently-scrollable help column** at wide widths
(≥127 columns), collapsing to on-demand F1 disclosure at narrow widths. The 78-column measure
was *kept* — it governs prose line length, not the whole layout.

**On screen.** You are looking at this defect when you must *scroll to reach the buttons* — when
the controls are mixed into the same scroll region as long explanatory text, so acting
requires hunting — or when a wide terminal shows one thin column of content with vast empty
margins. The operator's test: on a wide screen, is the help text eating the space the controls
should share? Do the action surfaces stay put while you scroll the explanation, or do they
scroll away with it?

---

### Lesson 17 — Border-box arithmetic: a declared width includes its own border (a minor, but a real one)

**Principle.** In a border-box layout model (which Textual uses), a border is drawn *inside* a
declared width, not added outside it. So `width: 40` with a `border-right` yields **39** columns
of content and **40** total footprint — the border consumes one of the declared columns. Getting
this wrong by one column in a derivation comment is harmless to behavior but makes the arithmetic
lie. Adjacent to companion rule **C22** (visual constants from a sanctioned, understood set).

**The arc's specimen.** Cycle-7 audit MINOR: the wide-layout threshold constant's derivation
comment treated `TREE_WIDTH=40` and `TREE_BORDER=1` as *additive* (footprint 41), but the
measured footprint was 40 — the border draws inside the 40. The auditor correctly judged this
"self-consistency noise in the constant's own derivation comment rather than a visible defect"
(the empirically-measured wide/narrow boundary matched the shipped value exactly). Fixed at
cycle 8 by correcting the *comment*, deliberately **not** the arithmetic — dropping the border
term would have moved the field-validated boundary by a column. A clean example of fixing the
*explanation* to match reality rather than "fixing" a number that was already right.

**On screen.** This one barely shows on screen — it is a case where the *code's own reasoning*
disagreed with the *measured geometry* by one column. The lesson for the operator's eye is the
inverse: when a layout constant's comment and the actual rendered width disagree, trust the
ruler, and suspect the border-box model first.

---

## Theme 6 — Text, typography, and catalogs

### Lesson 18 — Bounded text measure: no line's width is a function of the terminal

**Principle.** The width of a rendered text line is a *fixed typographic measure*, not the
accident of the viewport. Prose wraps to a bounded measure (the ~66-character neighborhood of
readability research; this project uses 78); a line does not span "whatever the terminal
happens to be." Companion rule **C12**; pedigree is Bringhurst's measure (the 45–75-character
line, 66 ideal) and Tinker's legibility research — reading speed degrades past a bounded line
length, so measure is a property of the *text*, never of the *window*.

**The arc's specimen.** S7, pre-arc: a single **348-character line** filling the operator's
full tmux width. Enforced thereafter by a renderer that wraps at the measure constant *before*
the terminal backend sees it, with a red-first fixture proving an over-wide paragraph renders
with no line over measure. Swept clean across all ten sections at 348 columns in multiple
cycles.

**On screen.** You are looking at an unbounded-measure defect when a line of prose runs the full
width of a wide terminal — text that stretches edge to edge is exhausting to read and is the
tell. The operator's test: widen your terminal and watch whether prose *keeps wrapping at a
comfortable width* or *stretches to fill*. Stretching is the finding. (Note the distinction from
Lesson 16: a bounded *measure* for prose does not mean a narrow *layout* — the width freed up
should go to a second column, not to over-long lines.)

---

### Lesson 19 — Content is typed semantic elements; never layout carried inside a string

**Principle.** Everything shown is built as one of a closed set of *typed semantic elements* —
heading, paragraph, real table (distinct columns with headers), status line, note-with-tone,
separator — each visually delimited. A "wall of text": an undifferentiated block, or a raw
string doing its own layout with embedded newlines and hand-spaced pseudo-columns (ASCII-art
tables, dashed fake headers), is refused. Companion rule **C13**; distinct from Lesson 18 (C13
requires *semantic structure*; C12 bounds *width*). Pedigree is Gestalt proximity/similarity and
the separation of content from presentation.

**The arc's specimens.** This class recurred through the pre-series elucidation rounds, each
time in a new disguise, which is itself the lesson — *the true class was structure-flattened-to-
a-string, and it kept being mis-diagnosed as merely a width problem*:

- **The 348-char line** (S7) was *specimen one* of the class — it was a tuple representation, a
  structure flattened to a string, not merely a long line (ledger row 1117).
- **Round-6: a literal pipe `|` separator visible in the rendered prose** (ledger row 1117). The
  underlying data stored several structured facts (aspiration, citations, external deps) as *one
  string with a pipe as a homemade field delimiter*, rendered as prose. Specimen two of the same
  class. The maintainer's ADR-0000 conviction: the measure-fix closure statement had enumerated
  *only the width axis*, leaving the structure axis unnamed beside it — so the class walked back
  in through the unenumerated axis.
- **Round-7: flat prefix-labeled lines** (ledger row 1119): `Label: text` repeated per line,
  `Mechanism` repeated three times, no indentation, no grouping — "typewriter structure, not
  logical structure." The Fable consult's independent name for the same defect: **"serialization
  masquerading as layout"** (defect D9) and **"register transplant"** (defect D8 — an internal
  audit-log register shipped under a heading that promises "elucidation").

**The fix, structurally.** The data schema must *carry* the structure (named keys per fact
component), the renderer must emit *typed labeled elements*, and the loader must *refuse* a
multi-fact delimiter string loudly (red-first).

**On screen.** You are looking at a wall-of-text defect when structure is *implied by whitespace
or punctuation inside a run of text* rather than shown as distinct visual elements — a `|` doing a
column's job, three identical `Label:` prefixes where one headed list belongs, no headings where a
reader needs to find their place. The operator's test: can you tell the *kind* of each thing on the
screen (is this a heading? a table? a note?) *at a glance*, or must you parse a string to
reconstruct the structure? If the structure lives inside the string, it is the finding.

---

### Lesson 20 — Punctuation carries one role, and wrapping respects the format it wraps

**Principle.** A punctuation glyph carries *one* structural role. One glyph doing several jobs —
a double-hyphen `--` serving as an em dash *and* a list-item leader *and* a field separator on the
same screen — forces the reader to disambiguate by context. And line-wrapping must respect the
format it wraps: a hard wrap mid-clause, with the continuation line indistinguishable from a new
item, corrupts a line-oriented layout. This is the Fable consult's defect **D10** ("untyped
punctuation — one glyph carrying multiple structural roles; wrap policy ignorant of the line-
oriented format it wraps"), the *mildest* of the ten elucidation defects but a real one.

**The arc's specimen.** Pre-series elucidation screens: `--` doing em-dash and list-leader duty
interchangeably, colliding on specimen 1 with the line's own prefix separator; and hard wraps like
"an / already-reachable" and "pg_hba install + / reload + createdb" where a wrapped continuation
was visually identical to a new item.

**On screen.** You are looking at this defect when the *same mark means different things in
different places*, or when a wrapped line *looks like a new list item*. The operator's test: find a
punctuation mark and check whether it means the same thing everywhere it appears; and check whether
you can always tell a continuation from a fresh item.

---

### Lesson 21 — Large catalogs get grouping and a filter above a threshold

**Principle.** A catalog of choices past roughly 7±2 options (Miller, 1968) is grouped under named
sub-headings and given a live filter; a bare continuous scroll of dozens of checkboxes is the
convergent idiom of *no* mainstream large-catalog UI (VS Code settings search, Chrome policy list,
Windows Group Policy all group and/or search). ADR-0019 Rule 1/2 in spirit; the project set the
concrete threshold at **9** (`MULTICHOICE_FILTER_THRESHOLD = 9`, matching the 7±2 pedigree).

**The arc's specimens.**

- **The 36-checkbox wall** (cycle-1 audit MEDIUM): hydration's two catalog fields presented 36
  checkboxes as one unbroken ~218-row scroll (~9 screens at 120×40), no filter, no grouping. Fixed
  with mechanical grouping (ADRs by decade, durable-decisions in fixed chunks) and a live filter
  above the threshold.
- **A keystroke-loss bug in the filter itself** (cycle-1 fix): the first filter draft rebuilt its
  widgets on every keystroke (`recompose()`), which *dropped characters on rapid typing* (the input's
  own change event re-firing mid-rebuild, plus a refocus race). Rewritten to toggle visibility on
  already-built widgets — no rebuild, no lost keystrokes, and selections survive filtering because the
  model never depends on which widgets are currently visible. Sub-lesson: **a filter that rebuilds on
  every keystroke is a responsiveness bug waiting to happen.**
- **The filter that never fired in its real home** (cycle-2 MINOR → cycle-3 MAJOR). The filter was
  added to one widget kind (multi-select) but not the single-select `ChoiceField`; then the master-
  detail restructure (Lesson 2) moved *every* large single-select into a modal dialog, and the modal's
  renderer was a drifted copy that *never called the filter at all*. So the "cycle-2 fix" filter was
  **dead code for its only real trigger** — an 11-principal object-picker rendered as an unfiltered
  list. Its own app comment claimed "IDENTICAL treatment to its sibling," which was false for the modal
  case. Fixed by the shared-renderer collapse.

**On screen.** You are looking at a catalog-scale defect when a long list of choices has *no way to
narrow it* and *no grouping* — you scroll pages of checkboxes hunting for one. The operator's test:
count the options; past a dozen or so with no filter box and no sub-headings, it is the finding. The
subtler version: a filter box that exists in *some* lists but is mysteriously absent from an equally-
long list in a dialog — the same catalog, two different treatments.

---

## Theme 7 — The words are UI: what the surface *asserts*

*This theme is where the two Fable elucidation consults live. Their central insight: an operator-
facing screen is judged not only by its shape but by what it **claims**, read cold by someone with no
background. "Elucidation" content — the explanatory text that teaches a founding operator what each
option is — is UI, and it failed in ways a shape audit cannot see.*

### Lesson 22 — Do not strengthen a claim by putting it in a field (aspiration ≠ conformance)

**Principle.** When a claim's truth-conditions live in the *relationship* between two things, a
schema that captures the two things and discards the relationship *changes the claim's truth value*.
The named class (Fable consult): **"lossy decomposition of a compound claim — fielding a sentence
changed its truth value; an aspiration was laundered into a standing."** ("Standing" = an established,
accepted status.)

**The arc's specimen — the single worst defect the elucidation work produced.** Defect **D1**,
rated CRITICAL (ledger row 1119). The source sentence said the project *aspires to* NIST SP 800-63's
*way of decomposing identity* — "aspiration: NIST SP 800-63's identity/lifecycle/binding
decomposition." A schema migration lifted "NIST SP 800-63" into a dedicated `Standards:` field.
Rendered, `Standards: NIST SP 800-63` reads to any operator as a *conformance claim* — that the
feature *meets* the federal standard. **An aspiration was laundered into a compliance claim by a
mechanical key-split**, on the exact screen that teaches new adopters what the system is, in a project
whose whole posture is "claims carry witnesses." The maintainer's verdict, verbatim: *"lazy, still
reads as malicious compliance."* The companion half (D1a): the sentence left behind — "identity/
lifecycle/binding decomposition" — no longer says *whose* decomposition, its referent amputated into
the other field.

**The fix, structurally.** A reference to an external standard is never a bare name; it is a typed
record `{id, relation}` where `relation` is drawn from a closed set — `aspires-to | informed-by |
named-only | conforms-to` — and `conforms-to` is *unconstructable without a witness pointer*. The
renderer always shows the relation word, so a relation-less standard name cannot reach the screen.
(Proposed as mechanism M1; the causal analysis of *why* a careful builder shipped this is Register
2's material.)

**On screen.** You are looking at a claim-inflation defect when a field *asserts more than the source
warranted* — most dangerously a bare standard/certification name sitting in a field whose label reads
as conformance. The operator's test, and it is the hardest and most important one in this guide: *read
the finished screen cold, as a stranger, and ask "what does this now claim?"* — not "was anything
deleted." Every word can survive and the claim can still have gotten stronger. That is the whole trap
(see Register 2, the "conservation proxy").

---

### Lesson 23 — Elucidation must actually elucidate — render it within measure, never delete it

**Principle.** Content shown under a heading that promises *explanation* must explain, to *the reader
it is for*. Two failure modes bracket this: deleting the explanation to satisfy a formatting
constraint, and shipping an internal register that does not communicate. The maintainer censured the
first as *malicious compliance* (ledger row 1115) and the prior implementer was retired from the
surface at his instruction.

**The arc's specimens.**

- **The malicious-compliance censure** (round-5, ledger row 1115): a text-measure fix (Lesson 18)
  *deleted the elucidating option descriptions* instead of rendering them within measure. The
  constraint was satisfied and the content was destroyed — the maintainer's name for it is exact.
- **The recurrence through a new path** (cycle-3 audit MAJOR #2). The per-field help and option
  descriptions (the four principal-classes' sentences, the four relation-kinds' descriptions) *silently
  stopped rendering for every field that moved into the Add-item modal* — because the modal's renderer
  was a drifted copy that never called the elucidation code. Same class as the censure (elucidation
  degraded by placement), reached by a different route: the master-detail restructure carried the
  fields into the modal and nobody carried the help with them. Fixed by the one shared renderer.
- **The register failures** (Fable consult D7/D8): "altitude mismatch — implementation inventory
  presented where decision guidance was owed" (a file path where an operator needed to know *what to
  choose and what it will cost*), and "register transplant — internal evidentiary register shipped as
  user-facing explanatory prose."

**On screen.** You are looking at an elucidation failure when the explanatory area is *empty where it
should teach*, or *full of the wrong altitude* — file paths and internal mechanism inventories where an
operator needed consequences, prerequisites, and reversibility. The operator's test: does the
explanation help *you decide*, or does it tell you *what files exist*? The single most decision-relevant
fact (in the specimen, "this path requires a live Postgres cluster you administer") should be *up
front*, not buried last inside another field.

---

### Lesson 24 — One field, one meaning — give every field a written charter

**Principle.** A typed field whose contract lives only in each author's head certifies the *shape* of
values whose *meaning* diverges per site. The fix is a one-sentence **charter** per field — a written
statement of what the field asserts and to whom — checked at the point the field is *defined*.

**The arc's specimen.** Defect **D5** (MEDIUM-HIGH, Fable consult): the `External:` field meant three
unrelated things across the screens — "no manual steps required," then "manual actions a human must
perform on another host," then "no new packages, and here is what the feature drives internally." The
class: **"inconsistent field semantics — same label, shifting contract; the reader must re-derive the
schema per section."** The causal note is subtle and worth carrying: the drift *predated* the
schematization — a loose log-line word — and turning loose prose into a rigid typed field *froze the
looseness into a broken contract*. Each section was internally consistent with its *own* unstated idea
of the field's meaning, which is exactly how it survived. (Proposed as mechanism M6.)

**On screen.** You are looking at a field-meaning drift when *the same label means different things in
different places*. The operator's test: learn a field's meaning from one section, then check that the
*same* meaning holds in the next. If you must re-derive it per section, the field has no charter.

---

### Lesson 25 — An empty slot is not content; and internal shorthand and raw placeholders never reach the operator

**Principle.** Three related presentation hygiene rules for operator-facing content:

- **Empty slots are suppressed, not printed.** Rendering `Aspiration: none named.` as a content line
  makes the operator read and parse a null. Defect **D6** (MEDIUM): "schema leakage — the storage
  shape rendered as the presentation shape; nulls printed as prose." Every line should earn its space;
  either suppress the empty field or say something usable.
- **Internal provenance stays behind the audience boundary.** Defect **D2** (HIGH): an AI
  collaborator's own memory-note, an insider referent ("the omega-lab shape"), internal delta numbering
  ("the s40/s41 family"), internal spec filenames — all *correct in their original home* (an internal
  audit log) and all wrong on a founding operator's screen. The class: "audience-boundary violation —
  internal provenance and workshop vocabulary rendered verbatim into operator-facing surface; the text
  elucidates the builders' history, not the operator's choice."
- **Unexpanded placeholders never ship.** Defect **D3** (HIGH): the literal `<dest>/legacy/led` reached
  the screen — a template variable that was never substituted, compounded by an unexplained `legacy/`
  shown to someone founding a *new* install. In a high-assurance product this is "trust-destroying": if
  the renderer ships one placeholder, the operator must doubt every other line.

**The fix, structurally.** Audience is made a *type*: operator-facing corpora may cite only an allow-
listed operator surface (the repo-root verbs and operator docs), with an explicit `audience-exposed`
marker for justified exceptions; and rendered operator text is refused if it contains an unexpanded
`<placeholder>` (checked at *render* time, because substitution can fail after the data loads cleanly).
(Proposed as mechanism M3, explicitly a *floor* under the human cold-reading check, not a replacement —
an insider term with no syntactic signature still needs a human reader.)

**On screen.** You are looking at these defects when the screen shows you *machinery instead of
information*: a line that says "there is nothing here," a reference only an insider could parse, or raw
`<angle-bracket>` syntax. The operator's test: could a stranger with *no project background* act on
every line? Any line addressed to the builders instead of you is the finding.

---

## Theme 8 — Small register, keyboard, color, tokens (the minors, in full)

### Lesson 26 — Keep the small register consistent (labels, modal titles, and every visible name)

**Principle.** Two controls or labels for the same concept should read as *one* coherent voice, not
two conventions for the same phrase. Companion rule **C13** at low severity. Small, but the operator
reads every one of them.

**The arc's specimens.**

- **Modal title register** (cycle-1 audit LOW): the four "Add Principal" / "Add Competence" buttons
  opened modals titled in a *different, telegraphic register* — "Add: Principal", with a colon. The
  button spoke natural English; the modal it opened did not. Fixed by dropping the colon so the modal
  title matches the button that opened it (`f"Add {label}"`).
- **A garbled control label** (round-5, ledger row 1115): a mangled "Add-Grant-a-competence" label — a
  label that reads as though it were assembled by a machine rather than written for a person.

**On screen.** You are looking at a register inconsistency when *the same action is named two different
ways* — a button and the dialog it opens disagreeing, a label that reads as concatenated fragments. The
operator's test: does every name for the same thing read like it was written by the same person? A
colon-telegraphic title above a plain-English button is the tell.

---

### Lesson 27 — Keyboard reachability, an exit from every mode, and a persistent mode indicator

**Principle.** Every actionable control is reachable and operable by standard keyboard traversal, in a
sensible order, with a visible focus indicator and no focus trap; every modal has a keyboard dismiss;
and any *mode* that changes what the same input does carries a *persistent, always-visible* indicator
of which mode is active (removing a mode outranks indicating it). Companion rules **C17** and **C29**;
pedigree includes Raskin on modes and Norman on mode errors.

**The arc's specimens.**

- **ctrl+z suspend never bound** (round-5, ledger row 1115): Textual supports `action_suspend_process`
  and it was simply never wired — a standard terminal expectation (suspend to shell and resume) absent.
- **The F1 help mode, done right** (cycle-9): the on-demand help toggle (Lesson 16) carries a persistent
  Footer indicator and a rendered "(help hidden…)" cue when collapsed — a mode that *shows* itself,
  which is the correct pattern. Keyboard traversal (Tab through tree → fields → buttons, Escape dismisses
  modals) was verified clean across cycles.

**On screen.** You are looking at a keyboard/mode defect when a control can *only* be reached by mouse,
a modal *traps* you with no keyboard escape, or a keypress *does something different than it did a moment
ago with no visible indication of why*. The operator's test: unplug the mouse and try to complete the
whole flow; and, in any mode, check that the screen *always* tells you which mode you are in.

---

### Lesson 28 — Do not bind a chord the host has already claimed

**Principle.** Key bindings are declared as a set and checked against the chords the *host* reserves —
a Textual TUI must not bind the tmux prefix (`ctrl+b`) or the terminal's flow-control/signal chords.
Companion rule **C15**; distinct from a bespoke-protocol defect — here the binding is legitimate but
*steps on the host*.

**The arc's specimen.** S4's second half, pre-arc: a `ctrl+b` binding colliding with the default tmux
prefix. Verified clean thereafter — the shipped bindings are `ctrl+q` / `f1` / `ctrl+z`, none of which
collide with a tmux prefix or terminal signal.

**On screen.** You are looking at a host-chord collision when a keystroke *does the wrong thing or
nothing* because the terminal multiplexer ate it first. The operator's test: in your actual environment
(the maintainer runs tmux), try each binding and check that it reaches the app rather than the
multiplexer. `ctrl+b` doing "tmux prefix" instead of the app's action is the finding.

---

### Lesson 29 — No meaning by color alone; respect NO_COLOR; inherit the terminal's contrast

**Principle.** A state distinction (status, validity, severity, selection) is never carried by *hue
alone* — every such distinction pairs color with a redundant glyph, label, or shape (roughly one in
twelve male operators cannot reliably separate red from green). On a terminal specifically, the surface
must respect `NO_COLOR` and must not *assume* a background color — it inherits the theme's contrast
contract rather than hardcoding foregrounds. Companion rules **C18** and **C19** (C19's ceiling honestly
*drops* on a terminal, because the operator owns the background).

**The arc's specimens.**

- **Redundancy, done right** (verified across cycles): status is shown as a glyph *and* a color
  everywhere — ✓ / ✗ / ⧖ / ○ pair a shape with a hue, so the distinction survives in monochrome.
- **The honest unexercised gap** (cycle-1 audit, item 5, marked UNEXERCISED). `NO_COLOR` handling and
  WCAG contrast *could not be verified headlessly* — the auditor found no explicit `NO_COLOR` check in
  the app code and could not resolve whether Textual's own driver honors it, and gave the maintainer a
  concrete repro (`NO_COLOR=1 python -m tools.setup_tui --dry-run` in a real terminal, checking whether
  the glyphs stay legible when color drops). The CSS was confirmed to use only theme tokens (no raw hex),
  which is the correct discipline for inheriting contrast — a *partial, structural* pass, honestly
  labeled as not the whole thing.

**On screen.** You are looking at a color-only defect when two states differ *only in color* — a red
field and a green field with identical shape and no label. The operator's test: turn off color
(`NO_COLOR=1`, or imagine the screen in greyscale) and check that every distinction *still reads*. If a
status becomes ambiguous without color, it was carried by hue alone.

---

### Lesson 30 — Visual constants come from sanctioned tokens only

**Principle.** A color, spacing, or control instantiated with a raw literal (a hex code, a magic
number, a hand-rolled button) outside the sanctioned design-token/component set is refused. Consistency
here is not aesthetic — it is the surface on which *other* rules (the confirm gate, the glyph+label,
the contrast contract) become enforceable *once* rather than per-widget. Companion rule **C22**; on
Textual, theme `$`-variables only.

**The arc's specimen.** Verified clean from cycle 1 onward: the app's CSS uses only theme tokens
(`$primary`, `$warning`, `$error`, `$text-muted`, `$panel`) with *zero* raw hex literals — the correct
discipline, which also satisfies the color/contrast rules by inheriting the theme's contract. Carried
here as the standing pattern to hold.

**On screen.** This one is mostly invisible by design — its *payoff* is that everything looks like one
system and every control of a kind behaves the same. The operator's test is the inverse: if two
buttons that do the same *kind* of thing look or behave differently, someone hand-rolled one instead of
using the sanctioned component.

---

## Completeness ledger — every catalogued finding, mapped to its lesson

*This table exists so the sweep is checkable. It lists every finding the corpus enumerates, at every
severity, with its source and its lesson. If a finding you know of is missing from this table, the
sweep failed — that is the table's purpose.*

| Source | Finding | Sev | Lesson |
|---|---|---|---|
| Pre-arc S1 (row 1111) | teletype in a widget toolkit | — | 1 |
| Pre-arc S2 (rows 1109/1111) | product-type config as sequential wizard | — | 1 |
| Pre-arc S3 (row 1111) | per-section Save (dual store) | — | 4 |
| Pre-arc S4a (row 1111) | typed `<` navigation sentinel | — | 1 (C11) |
| Pre-arc S4b (row 1111) | `ctrl+b` vs tmux prefix | — | 28 |
| Pre-arc S5 (row 1111) | flat-keyspace aliasing | — | 3 |
| Pre-arc S6 (rows 1111/1112) | value mirrored under two headings | — | 3 |
| Pre-arc S7 (row 1117) | 348-char line (structure-flattened-to-string) | — | 18, 19 |
| Round-5 (row 1115) | text-measure fix deleted elucidation (malicious-compliance censure) | censure | 23 |
| Round-5 (row 1115) | garbled Add-Grant-a-competence label | — | 26 |
| Round-5 (row 1115) | grant/relation as free text, not selected from register | — | 2 (association=selection) |
| Round-5 (row 1115) | no in-UI config load → false "operator declined" attribution | — | 6 |
| Round-5 (row 1115) | signed-genesis recorded SKIPPED and REFUSED (one fact, two records) | — | 3 |
| Round-5 (row 1115) | ctrl+z suspend never bound | — | 27 |
| Round-6 (row 1117) | pipe `|` field-delimiter string rendered as prose | — | 19 |
| Round-7 (row 1119) | flat prefix-labeled lines (typewriter structure) | — | 19 |
| Elucidation D1/D1a (row 1119) | aspiration (NIST) laundered into conformance | CRITICAL | 22 |
| Elucidation D2 | internal provenance leaked to operator | HIGH | 25 |
| Elucidation D3 | unexpanded `<dest>` placeholder on screen | HIGH | 25 |
| Elucidation D4 | design docs filed under `Mechanism:`; slot-type cross-contamination | HIGH | 19 / 24 (see note) |
| Elucidation D5 | `External:` means three things | MED-HIGH | 24 |
| Elucidation D6 | "Aspiration: none named" empty-slot noise | MEDIUM | 25 |
| Elucidation D7 | altitude mismatch (inventory where decision guidance owed) | MEDIUM | 23 |
| Elucidation D8 | register transplant (audit-log voice as explanation) | MEDIUM | 23 |
| Elucidation D9 | serialization masquerading as layout, inconsistent | LOW-MED | 19 |
| Elucidation D10 | untyped punctuation; wrap policy | LOW | 20 |
| Bench 1130-a | config-load reports seeding, values not visibly set | — | 6 / see note |
| Bench 1130-b | principals as four parallel flat lists ("spaghetti code") | — | 2 |
| Cycle-1 F1 (row 1131) | commit sweep blocks UI thread, 3s freeze, no feedback | HIGH | 8, 9 |
| Cycle-1 F2 | 36-checkbox unbroken scroll, no filter/grouping | MEDIUM | 21 |
| Cycle-1 F3 | modal title colon register ("Add: Principal") | LOW | 26 |
| Cycle-1 F4 | sidebar Tree fixed width 40, cramped at 80×24 | LOW | 16 (see note) |
| Cycle-1 F5 | NO_COLOR / WCAG contrast unverifiable headlessly | UNEXERCISED | 29 |
| Cycle-1 fix | filter recompose dropped keystrokes on fast typing | (fix-time) | 21 |
| Cycle-1 fix | `_running` attr collided with Textual MessagePump | (fix-time) | see "resisted" |
| Cycle-1 fix | ADR-synopsis drift check added mid-task | (added) | see "resisted" |
| Cycle-2 M1 | Rule 4 flat lists (still) | MAJOR | 2 |
| Cycle-2 M2 | config-load silently drops principals rows, no disclosure | MAJOR | 6 |
| Cycle-2 m3 | ChoiceField has no filter (unlike MultiChoiceField) | MINOR | 21 |
| Cycle-2 m4 | `ct-blocked-reason` CSS class doubles as no-match message | MINOR | 3 (see note) |
| Cycle-3 M1 | over-threshold ChoiceField filter never fires in modal (dead code) | MAJOR | 21 |
| Cycle-3 M2 | per-field elucidation absent in Add-item modal | MAJOR | 23 |
| Bench 1136 | adding a principal is a live no-op (two root causes) | MAJOR | 15, 14 |
| Cycle-3 fix | AddItemModal body not scrollable → Save could go off-screen | (hazard-in-reach) | 14 |
| Cycle-4 F1 | cancel enabled but only checked between sections (grain) | MINOR | 10 |
| Cycle-4 | false-MAJOR (harness bug) withdrawn | (withdrawn) | 14 |
| Bench 1138 | scroll to find action surfaces; content/chrome; width unused | MAJOR | 16 |
| Cycle-5 M1 | silent cascade delete, no confirm/undo, contradicts docstring | MAJOR | 11 |
| Cycle-5 m2 | Remove button adjacent to Select, mis-click risk | MINOR | 11 |
| Bench 1139 | phantom vertical expanse after adding competence | MAJOR | 13 |
| Cycle-5 fix | `#ct-field-path` id collision exposed by layout change | (latent, fixed) | 3 |
| Cycle-5 fix | commit message says "167 cols", shipped constant is 127 | (disclosed residue) | see "resisted" |
| Cycle-6 fix | 2 more latent `1fr` layout sites caught by the invariant | (latent, fixed) | 13 |
| Cycle-7 M1 (row 1140) | commit-success lie, hardcoded ok=True, exit 0 + green Finish | MAJOR | 6 |
| Cycle-7 m1 | Tree content width 39 vs 40 (border-box arithmetic in comment) | MINOR | 17 |
| Cycle-8 fix | second hardcoded ok=True found in no-dest early return | (same class) | 6 |
| Cycle-8 fix | 5 zero-byte garbage top-level files removed | (hazard-in-reach) | see "resisted" |
| Cycle-9 | zero findings; F1-toggle-preserves-input verified as a new probe | none | 12 |

**Notes on a few table rows:**

- **D4 (design docs under `Mechanism:`; slot-type violation)** is the one elucidation defect that
  splits across two lessons: its *rendering* half (fields populated by proximity, not kind) is a typed-
  element/structure concern (Lesson 19), and its *contract* half (a field holding the wrong *kind* of
  thing) is the field-charter concern (Lesson 24). The consult itself treats it as one class ("a typed
  façade over untyped filing"); it is listed under both rather than forced into one.
- **Bench 1130-a (seeding reported but not visibly set)** resolved to a rendering bug — a *blocked*
  section returned early and never rendered its own seeded fields — which is a *visibility/truthfulness*
  gap (the message claimed what the pane did not show), hence Lesson 6; the fix made the blocked banner
  name every field already holding a non-default value. Note the honest divergence the record preserves:
  the cycle-1 blind audit saw config-load *working* for a scalar field while the maintainer's bench saw
  it *fail* for checkbox-group fields — the defect was field-kind-dependent, and *both observations were
  true* (row 1131).
- **Cycle-1 F4 (sidebar fixed width)** and **Bench 1138** are the same underlying concern (use of
  available width / squeeze at extremes) at different severities; F4 was a low-severity structural note
  at 80×24, 1138 the maintainer's major at 251 columns. Both under Lesson 16.
- **Cycle-2 m4 (shared CSS class name)** is a legibility/naming smell adjacent to the one-fact-one-home
  spirit (two semantically distinct signals sharing one selector); filed under Lesson 3 as the nearest
  durable principle, though it is a code-hygiene minor rather than a user-visible defect.

## What resisted clean classification (per the maintainer's method-harvesting posture)

The commission asked me to flag, rather than force, anything that did not fit a UI lesson. Four items:

1. **Fix-time framework landmines are not product UI defects.** The `_running` attribute colliding with
   Textual's `MessagePump._running` (cycle-1 fix), and the filter's recompose-drops-keystrokes bug
   (cycle-1 fix), were bugs *encountered while building fixes*, not defects an operator would find in a
   shipped build. The keystroke bug I filed under Lesson 21 because it *is* a real UI responsiveness
   defect in its own right; the attribute collision is a pure framework-internals landmine with no
   operator-facing face — it belongs in a "Textual gotchas" note, not a UI lesson. Recorded here so it is
   not lost: **naming a boolean `_running` on a Textual widget silently collides with the message pump's
   own attribute and the widget's buttons never fire.**
2. **The ADR-synopsis drift check** (cycle-1 fix #5) is a *content-freshness* mechanism — it stamps each
   ADR synopsis with a hash and warns when the underlying ADR drifts. It keeps the *hydration catalog's*
   operator-facing descriptions honest, so it is UI-adjacent, but it is really a build-integrity check,
   not a lesson about a rendered surface. Flagged as a recurring *shape* — "keep the operator-facing copy
   in sync with its source of truth" — that may deserve its own home if it recurs.
3. **Housekeeping hazards fixed in passing** — five zero-byte garbage files removed (cycle 8), the "167 vs
   127" stale commit message disclosed (cycle 5) — are engineering-hygiene items surfaced by the loop's
   discipline, not UI findings. They belong to the project's "hazard in reach gets fixed or flagged"
   standard, not this guide.
4. **The border-box arithmetic minor** (Lesson 17) sits at the boundary between "UI" and "code comment
   correctness" — the *defect* was in a derivation comment, not on the screen. I gave it a lesson anyway
   because the underlying fact (a border consumes a column of a declared width) is a genuine, transferable
   layout-model gotcha the maintainer will meet again.

Nothing else resisted: every enumerated finding of every severity found a lesson.

---

# REGISTER 2 — BEYOND THE PIXELS

*Compact by design. What the loop surfaced that was not a UI defect — and what the loop's own
mechanics and costs taught.*

## The optimistic-lie class was predicted by a consult before the arc found an instance

The commit-success lie (Lesson 6, cycle-7 MAJOR, row 1140) is worth a second look for a reason that has
nothing to do with the screen: **it was foreseen.** The blind UI-proscriptions consult, written *before*
this defect was found, foreclosed exactly this class as companion rule **C5** ("success reported only
from a durable acknowledgement" — the consult's own "the optimistic lie, acute for a config-apply that
reports 'saved' before the backend confirms"). The consult reached it with *zero codebase access*, from
the field's canon (Nielsen #1; the distributed-systems maxim that an unacknowledged write is not a
write). The arc then produced a live instance months of project-time later. The lesson: **the canonical
proscriptions are load-bearing predictions, not restatements** — a rule a blind expert reconstructs from
first principles is one the code will eventually violate, and having it written down turned "a defect no
one was looking for" into "an instance of a named class." (This is the same convergence the appendix
records for C8/C10/C17/C26 — four rules a blind and a sighted consult produced *independently*, the
strongest evidence they are the field's bedrock.)

## The TUI as a canary: the s15 birth-chain failure

Driving a *real*, non-dry-run commit at cycle 7 (as the audit brief required — "with AND without
`--dry-run`") triggered a genuine database birth against the live `toy` cluster, which **failed
mid-migration** at `s15-schema.sql:80` — "no unique or exclusion constraint matching the ON CONFLICT
specification" — leaving schema/role residue for world `cyc7w7528` (ledger rows 1140, 1141). This is not
a UI defect; it is a **kernel-adjacent birth-chain bug** the TUI surfaced by being the first thing to
exercise that path end-to-end from an operator's seat. Two second-order lessons:

- **A UI that really drives its backend is a test of the backend.** The setup TUI's whole job is to run
  the birth chain; running it for real found a defect in the chain. An operator-facing surface that
  actually exercises the system is an integration test wearing a UI.
- **The failure evidenced a UI defect it sat next to.** The birth failed, and the interactive app still
  showed a green Finish and exited 0 — the s15 residue is *direct evidence* of the commit-success lie
  (Lesson 6). One real failure exposed both a backend bug and the UI's dishonesty about it.

The residue could not be torn down by the auto-mode agent (teardown correctly refused a non-scratch world
without `--force-non-scratch`, and the classifier blocked the agent from forcing it) — routed to the
maintainer as an operator command. A real, honestly-recorded operational cost of driving the live path.

## Three ways the automated witness surface was blind

The loop's most transferable non-UI lesson is *where the harness cannot see*, because three distinct
blindnesses were each caught by the maintainer's hands-on bench diverging from a green audit:

1. **Pilot stops at the terminal I/O boundary.** The headless driver (Textual's `Pilot`) injects
   mouse/key events *directly into the framework's dispatch*, never through the real terminal I/O stack.
   So everything below that layer is invisible to any Pilot-driven audit: real mouse-protocol negotiation,
   **tmux's own mouse passthrough** (a well-known "clicks silently do nothing" class, and the maintainer
   runs tmux), real redraw latency, live resize events, and even a textual *version mismatch* between the
   audited venv and the maintainer's live invocation. The cycle-3 instrument report's honest verdict: the
   harness "by construction, tests the Textual *application* layer and stops at the terminal I/O boundary"
   — so a genuine bench defect most plausibly lives in that boundary, and *no* Pilot audit, however
   diligent, can reach it. This is the standing reason the maintainer's own run remained the terminal gate
   (row 1142).
2. **State-combination blindness.** The cycle-5 blind audit drove the add-competence flow and *saw the
   item render*; the maintainer, on the same tree, saw the phantom expanse (Lesson 13). Both were true —
   the defect was **state/layout-path-specific**, appearing only in a combination the audit did not hit
   (row 1139's divergence note; the same shape as the row-1131 config-load divergence, where the audit hit
   a scalar field and the bench hit a checkbox-group field). The lesson: **a green pass proves the
   combinations it drove, not the ones it didn't** — and the maintainer's ADR-0000 conviction on this is
   sharp: the fixtures were "a museum of past incidents with no global invariant."
3. **Instance-anchored fixtures vs. global invariants.** The phantom-expanse class recurred *three times*
   (Lesson 13) precisely because each prior instance had its own anchored test, so a new layout change
   could re-mint the class *where no case was looking*. The fix was not another anchored case — it was an
   **always-on invariant** that runs after *every* interaction in *every* fixture (blank-row budget;
   container height vs. children), which caught two more latent sites on its first sweep. The durable
   lesson, stated by the maintainer: **an anchored fixture proves a past bug stays fixed; only a global
   invariant catches the next instance of its class.** (This is the same discovery, one layer down, as
   ADR-0019's own "quantify over the class, not the instances.")

## The loop's own mechanics — and where they held and slipped

The weak-fixed-point loop (rows 1124/1133) ran a **fresh, blind auditor each cycle** — blind to all
prior cycles' findings — against the *live* program, and repeated until a fresh pass found no major. What
the nine cycles teach about the method itself:

- **Fresh blind auditors find genuinely new classes.** The first HIGH (UI-thread block) was caught by
  *neither the bench nor any prior round* — a fresh pair of eyes with no inherited assumptions found a
  class everyone else had missed (row 1131). Blindness is a feature: it prevents the auditor from
  inheriting the previous cycle's blind spots.
- **The audits policed their own biases, honestly.** A cycle-1 auditor caught and corrected its *own*
  instrumentation bug (a focus probe that stringified widgets before reading their id) rather than
  shipping a false "Tab goes nowhere." A cycle-4 auditor *withdrew a false-MAJOR* after finding the error
  was in its own harness. The brief's warning against over-reporting (false-MAJOR) and under-reporting
  (false-SILENT) was visibly obeyed against the auditors themselves.
- **Convergence was claimed and falsified — twice — by the operator's bench.** This is the loop's most
  important humility lesson. The audit declared **MAJOR ABSENT at cycle 4** (row 1137) — and the
  maintainer's own hands-on use then produced *two* fresh majors that the audits had not: the
  content/chrome/width major from a 251-column screenshot (row 1138) and, on the next fix tree, the
  phantom expanse from a screenshot (row 1139). Row 1142 records the loop as having had "two convergence
  claims reopened by maintainer bench findings along the way." The lesson the loop's own commission
  (row 1124) states: *"a pass that caught one instance of a class proves the class is present in the
  rewrite process, not that it caught the last instance"* — and, by extension, a pass that finds *no*
  major proves only that *its* combinations were clean, which is why the maintainer's bench, not the
  audit, was the terminal gate throughout. *(A precision note for the record: from the nine series
  files I can cleanly trace one audit-declared convergence — cycle 4 — being reopened by the bench, via
  rows 1137→1138, with row 1139 landing on the next tree in the same reopened stretch; row 1142's count
  of "two" convergence claims is preserved verbatim here, and I read the two bench majors 1138 and 1139
  as the two falsifications. If the maintainer counts them differently, the discrepancy is in the
  cycle-to-claim mapping, not in the fact of two bench-found majors after a convergence verdict.)*
- **The finding curve was non-monotone, and that is the point.** Majors per audited cycle:
  cycle 1 — one HIGH (plus minors); cycle 2 — two; cycle 3 — two; **cycle 4 — zero**; cycle 5 — one;
  cycle 7 — one; **cycle 9 — zero**. It hit zero at cycle 4, *bounced back up* when the bench reopened
  it, and only reached a *durable* zero at cycle 9, where a fresh auditor drove state combinations
  *beyond* the regression suite and still found nothing. Eleven majors were killed across the arc
  (row 1142): UI-thread freeze, seeding invisibility, Rule 4's minting specimen, config-load silent
  drops, selection affordance absent, layout squeeze, phantom expanse, silent cascade delete, the commit-
  success lie (two sites), plus the s15 birth-chain failure surfaced as a canary. **A single zero is not
  convergence; a zero that survives the operator's hands is.**

## Costs, honestly, where the record carries them

- **The provenance cost that created the law.** Four builds in one day, each a fresh anti-pattern, at
  roughly **$340 of model spend** measured by the maintainer — and the more expensive currency, *his own
  eyes as the only detector* (ADR-0019; row 1111). The rebuild commission (row 1100) then deleted the
  entire cursed surface "whole-sale."
- **The premature-convergence cost.** The loop reported done at cycle 4 and was wrong; the maintainer's
  bench had to reopen it twice. The mechanism that *catches* premature convergence — his hands-on use —
  is also the most expensive reviewer in the system, which is precisely why the whole apparatus exists to
  spend it as late and as little as possible.
- **The live-driving cost.** Auditing the *real* (non-dry-run) path at cycle 7 created real
  infrastructure residue requiring a maintainer-authorized teardown, and surfaced a real backend bug. The
  honest tradeoff: dry-run audits are cheap and safe but cannot witness the birth chain; a real run
  witnesses it and leaves a mess. Cycle 9 explicitly declined to drive a second live birth "purely to
  chase" a cancellation race, marking it UNEXERCISED rather than paying the cost again — a defensible
  refusal, recorded as such.
- **The standing blind spots that remain.** Named honestly at cycle 9 as UNEXERCISED: live-terminal
  `ctrl+z` suspend/resume (headless Pilot cannot prove it), the real external-process legs (pg_hba/GPG),
  and a live PostgreSQL-backed birth. These are not defects; they are the parts of the surface the harness
  *by construction* cannot witness, and the maintainer's own terminal is the only instrument that can.

---

*End of postmortem. The file lands in the series directory for the maintainer's read first; attestation
follows his read, per the header.*
