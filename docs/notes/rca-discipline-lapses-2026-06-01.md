# RCA — Two Discipline Lapses (stringly-typed errors; shipped-but-open docs), 2026-06-01

**DRAFT — for maintainer review.**

A root-cause analysis, maintainer-requested, of two discipline lapses
that surfaced on 2026-06-01. It is a *process / organizational* RCA, not
a per-site code fix: the per-site fixes (PR #318 / commit `5a88178` for
Lapse 1) and the doc corrections (Lapse 2, unstarted) are separate work.
The job here is to explain how each lapse was *reachable* while the
governing disciplines — ADR-0002 (fail-loudly), the type-driven-design
tenet, ADR-0005 (documentation discipline), and the umbrella
"Documentation is part of the work" rule — were all in force the whole
time, and to recommend mechanical guards rated by feasibility.

**Framing the maintainer asked be held throughout.** This is a
single-maintainer project with no second reviewer. The discipline's only
guard is one person's attention and memory. That is the lapse-surface to
examine — *not* to treat as exculpatory. "Review would have caught it"
is unavailable as a corrective; the question is what *mechanism* could
have, since the human guard demonstrably did not.

Nothing below is pre-judged. Where the evidence is incomplete I say so.

---

## 1. Lapse 1 — the stringly-typed-error anti-pattern across six sites

### 1.1 What it was

`api-client.ts` threw an error whose *message string* encoded the
structured `status` + `body` it held at the throw site
(`API Error <status>: <body>`), discarding the structure. Six consumer
sites then reverse-engineered that structure back out by regex /
substring on `err.message`. The full inventory is in
`docs/notes/deferred-items.md` (the "Stringly-encoded API errors
reverse-engineered downstream" entry). The emergency fix
(PR #318, commit `5a88178`, 2026-06-01) introduced
`class ApiError extends Error { status, body }` and converted the six;
the `.message` format is preserved for back-compat. Post-fix, seven
files reference `ApiError` (the class plus six branching consumers) and
no `.match` / `.includes` on the message string survives in
`src/services/` or `src/composables/` (verified by grep on `main` at the
time of writing).

### 1.2 Evidence — the timeline (git, dates ascending)

The throw format and the reparse sites were introduced as follows
(`git log -S` pickaxe on each pattern, confirmed against the introducing
commit's diff where the file-creation commit was ambiguous):

| When | Commit | Site | What landed |
|------|--------|------|-------------|
| 2026-04-26 | `e5c857b` (initial) | `api-client.ts` | The `API Error <status>: <body>` throw format — present from the **first commit of the repository**. |
| 2026-04-26 | `eb2ba5d` | `useAuth.ts` | First reparse: `msg.includes('API Error 401')`, **with a `Brittle in principle` comment at the same site**. |
| 2026-04-28 | `a059703` | `qeubo-service.ts` | `/^API Error (\d+):/` rebuilding `QeuboError`. |
| 2026-04-29 | `d698d47` | `backend-service.ts` | `/^API Error 422:/` rebuilding `CardTreeOverflowError`. |
| 2026-05-07 | `060ebf2` | `analysis-bundle.ts` | `/^API Error (\d+):\s*(.*)$/` rebuilding the `AnalysisBundleStorageError` union. |
| 2026-05-07 | `f6e53ee` | `analysis-persistence-service.ts` | `/^API Error 404:/`. |
| 2026-05-24 | `8d44c35` | `library-service.ts` | `/^API Error 404:/`. |

(`useAuth.ts`'s file path moved on 2026-05-11 in `39e200d`, a directory
reorganization — that is a path change, not the logic's introduction;
the reparse and the `Brittle in principle` comment both date to
`eb2ba5d`, 2026-04-26.)

### 1.3 Findings

**Finding 1a — the throw format predates every consumer; it was the
original shape, not a deliberate later entrenchment.** The
`API Error <status>: <body>` string is in the initial commit
(`e5c857b`). The `api-client.ts:216`-era comment the maintainer pointed
at ("keep the string format") *rationalized* a pre-existing shape; it did
not introduce one. So "the throw site deliberately chose to keep the
string and that entrenched the pattern" is **only half true**: the
string was there from the start, and the documented choice to keep it
came later and reinforced rather than originated it. The first-mover
cause is upstream of any deliberate decision — the error channel was
*never* structured, so the very first consumer that needed `status` had
no structured field to read and reached for the only thing present: the
message.

**Finding 1b — the first reparse site flagged its own hazard, and the
flag did not arrest the spread.** This is the load-bearing finding. The
*first* consumer (`useAuth.ts`, `eb2ba5d`, 2026-04-26) carries a
`Brittle in principle` comment at the reparse site. The author saw the
hazard at instance #1, named it in the code, judged it "acceptable in
[the local context]," and moved on. Five further sites then accreted over
the next four weeks. So the question "did review not catch the spread
because each instance looked locally reasonable?" inverts: the spread was
not *un-noticed* — the hazard was *noticed and locally tolerated at the
first instance*, and there was no mechanism that escalated a
locally-tolerated single instance into a recognized accreting pattern. A
`Brittle in principle` comment is a note-to-self; it is invisible to the
author writing reparse site #4 three weeks later in a different file,
because nothing aggregates the comments. The single-maintainer frame
sharpens this: the only place the "this is brittle" judgment lived was
one comment in one file and the author's memory, and memory does not
reliably fire "I've now done this six times" when each instance is weeks
apart and in a different service.

**Finding 1c — each instance was, in isolation, locally idiomatic.**
Each reparse site rebuilds a *typed* domain error (`QeuboError`,
`CardTreeOverflowError`, the `AnalysisBundleStorageError` union) — i.e.,
each consumer was *doing the type-driven-design thing locally*: turning a
generic failure into a discriminated domain error the rest of the code
branches on cleanly. The anti-pattern is invisible *at the consumer*:
the consumer's output is well-typed; only the *input* (reparse of a
string) is the smell, and that input looked like the only option given
the unstructured throw (Finding 1a). This is why "each instance looked
locally reasonable" is accurate — but the reasonableness was real, not a
review miss. The defect is a property of the *aggregate* (one
unstructured source feeding N reparsers), and no individual diff exhibits
the aggregate.

**Finding 1d — no mechanical gate existed for the pattern, though the
config has slots shaped for one.** `frontend/eslint.config.js` already
mechanizes several ADR-0002-flavored disciplines:
`@typescript-eslint/no-floating-promises` (the silent-async class),
`@typescript-eslint/switch-exhaustiveness-check` (the discriminated-union
`never`-default discipline), and `no-restricted-imports` for the
wire-type ACL boundary. It has **no** rule against `.match` / `.includes`
/ `.startsWith` on an error message, nor against a thrown-string contract.
Such a rule (`no-restricted-syntax` on the relevant member-expression
shapes) would sit naturally alongside the existing ones. So the gate was
*absent*, not *infeasible* — the lint surface is already an established
home for exactly this kind of mechanized tenet.

**Synthesis of Lapse 1.** The proliferation was reachable because (a) the
error channel was unstructured from commit one, so reparse was the only
available read; (b) the first instance's hazard flag was a local comment
that could not aggregate into a pattern-level signal; (c) each later
instance was locally idiomatic and exhibited the defect only in
aggregate; and (d) no mechanical gate watched the reparse shape, in a
project where the only other guard is one person's four-weeks-apart
memory.

---

## 2. Lapse 2 — a shipped feature stayed documented as open

### 2.1 What it was

The "Settings → Analysis Layout" / customizable-analysis-tab surface is
fully implemented and live: a panel registry
(`frontend/src/components/charts/panel-registry.ts`,
`panel-ids.ts`), a multi-tab composable
(`frontend/src/composables/analysis/useAnalysisTabs.ts`), a Settings
editor (`frontend/src/components/editors/AnalysisTabsEditor.vue`, wired
into `frontend/src/components/SettingsTab.vue:137` and bound to
`store.profile.settings.analysisTabs`), a schema migration that backfills
default named tabs, and an i18n key (`analysisTabs.newTabName` in
`frontend/src/locales/en.json:23`). Yet it is still documented as **open**
in two places: `docs/TODO.md`'s "Analysis tab — user-customisable
sub-tabs binding chart components" *Future project*, and
`docs/notes/deferred-items.md`'s collapsed-chart entry, which names "the
**future** Settings → Analysis Layout registry surface." An assistant
consulting TODO.md + handoff-current.md + deferred-items.md recommended
*building the already-shipped feature*.

### 2.2 Evidence — the timeline (git, dates)

| When | Commit / PR | What happened |
|------|-------------|---------------|
| 2026-05-28 | `ee1ae20` `docs(TODO)` | The TODO "Future project" entry is **authored** — "Proposal:", "v1 scope question", "Open design questions". |
| 2026-05-29 | `6305af7` (PR #301, Phase 1) | Panel registry + `<component :is>` dispatch ships. |
| 2026-05-29 | `9240314` (PR #302, Phase 2) | Multi-tab over the registry; **migration 54 → 55** backfills `profile.settings.analysisTabs` with default named tabs ("Basic", "Distributions", "Stability", "Multiresolution"). |
| 2026-05-29 | `0158be2` (PR #304, Phase 3) | The tab-layout **editor in Settings** ships. |
| 2026-05-29 | `bd611c2` (a perf PR) | Touches `docs/TODO.md` — but only to **cross-reference the entry as a still-open "Future project below"**, not to retire it. |
| 2026-05-30 | `d8f30c6` `docs(deferred)` | The deferred-items collapsed-chart entry is authored — **a day after ship** — and calls the surface "the future Settings → Analysis Layout registry surface." |

The feature shipped in a Phase-0/1/2/3 arc (PRs #298, #301, #302, #304)
on 2026-05-29, the **day after** the TODO proposal was written, following
the proposal's sketch closely (registry of declared panels; tabs as
ordered `(name, panelIds)`; persisted in the workspace blob via a schema
migration).

### 2.3 Findings

**Finding 2a — the three feature-shipping commits touched no
documentation at all.** `git show --stat` on `6305af7`, `9240314`, and
`0158be2` shows none of them touched `docs/TODO.md`,
`docs/notes/deferred-items.md`, or `docs/handoff-current.md`. The
umbrella "Documentation is part of the work" audit — which explicitly
asks "Does `docs/TODO.md` need updating to mark items complete?" — was not
run, or was run and the open entry was not recognized as describing the
shipped work. The feature went from *proposed* (TODO authored 05-28) to
*shipped* (05-29) inside ~24 hours, and the retire-the-proposal step fell
in the gap.

**Finding 2b — the same day, a doc edit re-asserted the entry as open.**
`bd611c2` (2026-05-29, a perf commit) edited `docs/TODO.md` and referred
to the analysis-tab entry as "the … Future project below" — i.e., the
TODO was *touched on the very day the feature shipped*, but the touch
treated it as open. This is the mechanism the maintainer's hint predicts:
status duplicated across independently-editable prose, where a touch for
one reason (perf cross-reference) cements the stale status rather than
correcting it, because the editor's attention was on the perf arc, not on
auditing the cited entry's truth.

**Finding 2c — the deferred-items entry was authored *after* ship and
still called the surface "future."** `d8f30c6` (2026-05-30) is one day
*after* the 2026-05-29 ship. The author wrote a fresh entry describing a
real bug (collapsed charts still process packets) and, in naming where
the fix belongs, called the already-shipped editor "the future Settings →
Analysis Layout registry surface." This is the sharpest evidence that the
lapse is not staleness-by-neglect (an old entry left to rot) but
**status-blindness at authoring time**: the author did not hold "this
shipped yesterday" in mind while writing about an adjacent concern. The
single-maintainer frame again: there is no second party whose mental
model of "what shipped this week" would have flagged the contradiction.

**Finding 2d — status is duplicated across three independently-editable
prose docs with no single source of truth, an ADR-0005 Rule 1
violation applied to status.** ADR-0005 Rule 1 ("single source of truth
per nominal handle") names exactly this: "anything that names a piece of
work has exactly one owning document. Parallel documents tracking the
same handles drift silently." The analysis-tab work's *status* is named
in `docs/TODO.md` (as a Future project), in `docs/notes/deferred-items.md`
(as a future want), and is *absent* from `docs/handoff-current.md` (which
describes the palette system and the persistence arc but not the tab
editor — grep finds no panel/tab/customization mention). Three documents
can each independently assert "open," and nothing reconciles them against
the code. Rule 1's structural fix (one owning document; slimmed views
delegate status questions to it) was never applied to *work-status* — it
was conceived for item *numbers*, and the generalization to "shipped vs
open" status was not drawn.

**Finding 2e — the doc-graph artifact cannot catch this, by
construction.** `tools/doc-graph/generate.mjs` computes node staleness as
**commit-distance** (`git rev-list --count <last-touch-sha>..HEAD`) — how
many commits behind HEAD the node's last edit is. The TODO entry was last
touched 2026-05-29 (`bd611c2`) and the deferred-items entry was authored
2026-05-30 (`d8f30c6`); both are *commit-fresh*. The doc-graph would color
them green. Commit-freshness measures *when a node was last edited*, not
*whether the edit's assertions still match reality*. A freshly-edited
entry asserting a shipped feature is unbuilt is precisely the case the
artifact is blind to — semantic staleness is orthogonal to commit
staleness, and the artifact (correctly, per its own design note) tracks
only the latter.

**Synthesis of Lapse 2.** The shipped-but-open state was reachable
because (a) ship and proposal were ~24h apart, so the retire-on-ship step
fell in a compressed window; (b) no mechanical or checklist trigger fired
"a TODO entry names this shipped surface"; (c) status lives in three
independently-editable prose docs with no SSOT and no reconciliation
against code, so any one of them can assert "open" unchallenged; and
(d) the one tool that watches doc freshness measures commit-age, not
semantic truth, so it cannot detect a fresh-but-false entry — in a
project where the only semantic check is one person's memory of what
shipped this week.

---

## 3. Common root cause

Both lapses share a single shape:

> **A discipline that is fully in force, but enforced only by one
> person's attention and memory, fails silently at the aggregate level —
> because each individual act is locally correct, the defect is a
> property of the accumulation, and no mechanism aggregates the
> individual acts into the pattern-level or reality-level signal that
> would expose it.**

The components, stated as the maintainer framed them:

- **Single-maintainer, memory-as-only-guard.** There is no second
  reviewer. The only thing standing between "locally reasonable act" and
  "recognized pattern / recognized contradiction" is one person noticing,
  weeks apart, across different files. Memory does not reliably fire on
  "I've done this six times" or "this shipped yesterday."

- **Discipline in force but no mechanical gate.** ADR-0002, the
  type-driven-design tenet, ADR-0005 Rule 1, and the "Documentation is
  part of the work" audit were all live. None is mechanized for the
  specific failure: there is no lint for thrown-string reparse, and no
  check that a TODO/deferred entry's "open" status matches the code. The
  disciplines are policy; policy enforced by memory is exactly what a
  single maintainer cannot scale.

- **Locally-reasonable acts accreting undetected.** Each reparse site
  produced a well-typed domain error (locally idiomatic); each doc entry
  described a real concern (locally accurate when written). The defect in
  both cases lives in the *aggregate* — one unstructured source feeding N
  reparsers; one piece of work whose status is asserted by three
  unreconciled docs — and no single diff or single entry exhibits the
  aggregate.

This is the same diagnosis the render-coupling postmortem
(`docs/notes/postmortem-render-coupling-at-composition-nodes-2026-05-29.md`)
reached for a *third*, unrelated lapse: "the absence of a preventive
convention / mechanical net, not a failure of management or review
diligence — review cannot catch what nothing taught it to look for." The
recurrence of that exact shape across three independent surfaces
(performance, error-typing, doc-status) is itself a finding: **this
project's characteristic failure mode is the invisible-at-authoring-time,
visible-only-in-aggregate defect, against which its heavy policy
discipline is structurally weak and only mechanical nets help.**

### What differs

The two lapses differ in *which surface* the missing gate lives on, and
that difference dictates different correctives:

- **Lapse 1 is a code-lint surface.** The defect has a *syntactic
  signature* (`.match` / `.includes` / regex on an error message; a
  thrown bare string or `new Error(template)` carrying parseable
  structure). Syntactic signatures are exactly what ESLint catches. The
  guard is feasible and cheap.

- **Lapse 2 is a doc-SSOT / semantic-truth surface.** The defect has *no
  syntactic signature* — "this prose entry's assertion no longer matches
  the code" is a semantic judgment about reality, not a pattern in text.
  The doc-graph's commit-staleness is the closest existing tool and it is
  structurally the wrong instrument (Finding 2e). The guard is therefore
  *harder* and lands mostly as process / SSOT structure, not as a
  mechanical checker — with one narrow mechanizable slice (below).

---

## 4. Recommended mechanical guards (feasibility-rated)

Ordered within each lapse by leverage-per-effort. None are mandates; this
is the option space for the maintainer's decision, in the spirit of the
render-coupling postmortem's recommendation register.

### For Lapse 1 (code-lint surface)

**G1 — ESLint `no-restricted-syntax` against error-message reparse.
FEASIBLE, HIGH LEVERAGE, LOW COST.** Add a rule flagging
`.match(...)` / `.includes(...)` / `.startsWith(...)` / `.test(...)`
called on an expression named `*message`/`*msg`/`*err*` (best-effort —
the rule keys on member-expression shape, since ESLint without type info
cannot know the receiver is an `Error`). The error message points at
`ApiError` and the structured-error idiom. This sits directly alongside
the existing `no-floating-promises` / `switch-exhaustiveness-check`
ADR-0002 lint block in `frontend/eslint.config.js` (Finding 1d) — the
home is established. *Caveat:* it is a syntactic heuristic, so it will
have false positives (a legitimate `.includes` on a non-error string
variable that happens to be named `msg`) and false negatives (a reparse
through an intermediate variable not name-matched). It is a *signal at the
boundary that matters*, not a proof — the same honest framing the
render-coupling postmortem applied to its lint heuristic. Worth it: the
false-positive rate is low given the naming conventions, and a flagged
false positive is cheap to `// eslint-disable-next-line` with a comment.

**G2 — A type-aware lint forbidding `.match`/`.includes` on a value of
type `Error` (or subtype). FEASIBLE, NARROWER, HIGHER PRECISION.** The
config already runs a type-checked block (`projectService: true`) for the
two `@typescript-eslint` rules. A custom type-aware rule could restrict
the check to receivers whose type extends `Error`, eliminating G1's
naming-heuristic false positives. *Cost:* a custom rule is more work than
a `no-restricted-syntax` entry (it needs the typescript-eslint rule
scaffolding), and it only catches reparse of values *typed* as `Error` —
a `catch (e)` where `e` is `unknown` and narrowed by hand would slip
through unless the narrowing is also modeled. Recommend G1 first (cheap,
catches the common case); consider G2 only if G1's false-positive rate
proves annoying in practice.

**G3 — A lint or convention forbidding thrown bare strings / discarding
structure at the throw site. FEASIBLE for bare strings, PARTIAL for the
real target.** `@typescript-eslint/only-throw-error` (forbids throwing
non-`Error` values) is a standard rule and would prevent the *bare-string
throw* variant. But the actual Lapse-1 throw was an `Error` *subclass*
whose structure was hidden in the message — `only-throw-error` would not
have fired on it. So G3 closes an adjacent door, not this one. Low cost
to adopt for hygiene; do not over-credit it as the Lapse-1 guard.

### For Lapse 2 (doc-SSOT / semantic-truth surface)

**G4 — A retire-on-ship checklist item in the "Documentation is part of
the work" audit. FEASIBLE, LOW COST, the highest-leverage doc guard.**
The umbrella `CLAUDE.md` audit already asks "Does `docs/TODO.md` need
updating to mark items complete?" Strengthen it to an explicit
*retire-on-ship* prompt that names *all three* status-bearing docs:
"Before declaring a feature shipped: does this work close a TODO.md Future
project, a deferred-items want, or a handoff in-flight description? Retire
each in the same PR." This is policy, not mechanism — its weakness is the
same memory-dependence that failed here — *but* it converts an implicit
expectation into an explicit, enumerated step, which is the cheapest
intervention with real effect. The render-coupling postmortem's
Recommendation 1 ("name the convention so it stops being authored
wrong") is the analog: naming the step is the highest-leverage cheap move
even when it is not mechanically enforced. **Honest caveat:** a checklist
guarded by memory is weaker than a lint; this is a mitigation, not a
fix.

**G5 — A single work-status SSOT, with the other docs delegating status
to it. FEASIBLE, MEDIUM COST, addresses the root (Finding 2d) directly.**
Apply ADR-0005 Rule 1 to *status*, not just to item numbers: designate
**one** document (the natural candidate is `docs/TODO.md`, which already
owns "actively scheduled work" and has a Completed section) as the single
owner of "shipped vs open," and have `deferred-items.md` and
`handoff-current.md` *delegate* status questions to it rather than
restating "future"/"open" inline. Then a feature can be marked shipped in
one place and the others carry only relations, not status assertions
(which is also Rule 3 — "describe relations, not content snapshots"). This
is the structural fix; its cost is a one-time reorganization of how the
three docs reference work-status, and ongoing discipline to route status
through the SSOT. *Tension to surface:* the three docs have genuinely
different genres (TODO = scheduled work; deferred-items = working-memory
offload; handoff = orientation), and each *legitimately* needs to mention
in-flight work — so "delegate all status to TODO.md" must not strip the
others of the ability to *describe* work, only of the ability to
independently assert its *open/shipped state*. Drawing that line cleanly
is the design work; it is feasible but not free.

**G6 — A doc-graph extension that flags *semantic* (not commit)
staleness. PARTIALLY FEASIBLE, NARROW, do NOT over-scope.** Generalized
semantic staleness ("does this prose still match the code?") is not
mechanizable — it is the human-judgment core ADR-0005 Alternative C
correctly declined to automate. But a *narrow* slice is feasible: a
checker that scans TODO.md / deferred-items.md "open"/"future" entries
for references to *source paths or symbols that now exist* and flags the
pair for human review ("this entry calls X 'future' but
`src/.../X` exists on `main`"). That is a heuristic — existence of a file
named like the entry's subject is weak evidence the entry is stale, and it
will both false-positive (a file exists but the *described capability*
doesn't) and false-negative (the feature shipped under a different name
than the entry uses). It would have caught *this* case (the entry names
"Analysis Layout"/"sub-tabs binding chart components" and
`AnalysisTabsEditor.vue` / `panel-registry.ts` exist), but only because
the naming happened to align. Recommend this *only* as a low-confidence
advisory report (like the dangling-cross-reference validator), never as a
CI gate — and only if G4 + G5 prove insufficient. The honest assessment:
G4 and G5 are the load-bearing doc guards; G6 is a speculative
nice-to-have whose precision is too low to lean on. The maintainer's own
design note already records that the doc-graph tracks commit-distance by
deliberate choice; G6 would be a *separate* tool, not an extension of the
heatmap, to avoid muddying that artifact's clean "commit-age only"
semantics.

### Feasibility summary

| Guard | Surface | Feasibility | Leverage | Verdict |
|-------|---------|-------------|----------|---------|
| G1 `no-restricted-syntax` on message reparse | code-lint | High | High | **Adopt** — cheap, established home, catches the common case |
| G2 type-aware `Error`-receiver lint | code-lint | High | Medium | Defer — adopt only if G1 false-positives annoy |
| G3 `only-throw-error` / no bare-string throw | code-lint | High | Low (adjacent) | Adopt for hygiene; not the Lapse-1 guard |
| G4 retire-on-ship checklist item | doc-process | High | High | **Adopt** — cheapest doc guard with real effect |
| G5 single work-status SSOT | doc-structure | Medium | High (root) | **Adopt with care** — the structural fix; design the genre boundary |
| G6 semantic-staleness advisory | doc-tooling | Partial | Low | Defer / speculative — low precision; never a gate |

The pairing that actually *addresses root cause* mirrors the
render-coupling postmortem's "1 + 2" structure: **G1 + G4 + G5**. G1
mechanizes the code-side aggregate defect at its syntactic boundary; G4
names the doc-side retire-on-ship step so it stops being skipped; G5
removes the duplicated-status structure that let three docs drift
independently. The rest are adjacent or speculative.

---

## 5. Open questions (genuinely open)

These are not pre-judged; they need the maintainer's call or further
evidence.

1. **Lapse-1 exhaustiveness is unestablished.** This RCA traced the *six
   known* reparse sites and confirmed no `.match`/`.includes` on
   `API Error` survives in `services/` or `composables/`. It did **not**
   prove the set is complete across the whole tree, nor sweep for
   *non-API* stringly-typed contracts (any `.match`/`.includes` on any
   thrown message). The deferred-items entry explicitly keeps that
   exhaustiveness audit open; this RCA does not close it. G1, once
   adopted, would *retroactively* surface any missed instances — which is
   an argument for adopting G1 before declaring the audit done.

2. **Would G1's false-positive rate be tolerable in practice?** Asserted
   low on the strength of the naming conventions, but not measured. The
   honest move is to run the rule in `warn` mode on `src/` once and count,
   the way the existing `no-floating-promises` rule was measured (7
   violations, all resolved) before being set to `error` — that
   measurement discipline is recorded in `frontend/eslint.config.js`
   itself.

3. **Is `docs/TODO.md` the right status SSOT, or is a new dedicated
   status surface warranted?** G5 proposes TODO.md because it already owns
   scheduled work and has a Completed section. But TODO.md is *also* large
   and prose-heavy (the analysis-tab entry alone runs ~120 lines), and a
   status SSOT arguably wants to be terse and tabular. Whether to overload
   TODO.md or introduce a thin status ledger is a genre-design question
   the maintainer should settle — and it interacts with the
   deferred-items / decisions-deferred / TODO distinction the project
   already maintains.

4. **Does the recurrence across three surfaces (perf, error-typing,
   doc-status) warrant a tenet, or is per-surface mechanization enough?**
   The render-coupling postmortem produced ADR-0010 (a tenet) for its
   surface. This RCA stops at recommending per-surface guards. Whether the
   *common shape* ("invisible-at-authoring, visible-only-in-aggregate,
   policy-not-mechanism") deserves its own cross-cutting articulation — a
   meta-tenet on "mechanize the aggregate-only defect classes" — or
   whether that would be over-abstraction is a judgment for the
   maintainer. The ADR-effectiveness-audit item already open in
   deferred-items.md (2026-04-26) is the adjacent vehicle if so.

5. **Why did the "Documentation is part of the work" audit not fire for
   Lapse 2 specifically?** This RCA establishes that the feature-shipping
   commits touched no docs (Finding 2a) but cannot determine from git
   *whether the audit was run-and-failed or simply skipped*. The ~24h
   proposal-to-ship compression (Finding 2, 2.2) is the leading
   hypothesis for why the retire step was missed, but "the author ran the
   audit and did not recognize the open entry as describing the shipped
   work" is an alternative the evidence does not exclude. Distinguishing
   them would require the maintainer's recollection — exactly the kind of
   memory the single-maintainer frame says not to rely on, so the
   distinction may be unrecoverable. Recorded as open rather than guessed.

---

## References

- `docs/notes/deferred-items.md` — the "Stringly-encoded API errors
  reverse-engineered downstream" entry (Lapse 1 inventory + the
  maintainer-requested RCA framing) and the "Analysis-chart layout
  affordance (Settings → Analysis Layout) + collapsed charts" entry
  (one of the two stale Lapse-2 assertions).
- `docs/TODO.md` — the "Analysis tab — user-customisable sub-tabs
  binding chart components" Future project (the other stale Lapse-2
  assertion).
- `docs/adr/0005-documentation-discipline.md` — Rule 1 (SSOT per
  handle), Rule 3 (relations not snapshots), Rule 7 (transitional docs
  sunset), Alternative C and Revisit-when #2 (the partial mechanization
  via the doc-graph).
- `docs/notes/postmortem-render-coupling-at-composition-nodes-2026-05-29.md`
  — the third instance of the common shape; the tone and
  recommendation-register model for this RCA.
- `frontend/eslint.config.js` — the existing ADR-0002-flavored lint block
  (`no-floating-promises`, `switch-exhaustiveness-check`,
  `no-restricted-imports`) where G1/G2/G3 would sit.
- `tools/doc-graph/generate.mjs` — the commit-distance staleness
  mechanism (Finding 2e); design note
  `docs/notes/documentation-graph-artifact-plan.md`.
- Git evidence: throw format `e5c857b`; first reparse + hazard comment
  `eb2ba5d`; further reparse sites `a059703`, `d698d47`, `060ebf2`,
  `f6e53ee`, `8d44c35`; ApiError fix `5a88178` (PR #318). Feature ship
  `6305af7` (#301), `9240314` (#302, migration 54→55), `0158be2` (#304);
  TODO authored `ee1ae20`, re-cited-as-open `bd611c2`; deferred-items
  authored-as-future `d8f30c6`.

License: Public Domain (The Unlicense).
