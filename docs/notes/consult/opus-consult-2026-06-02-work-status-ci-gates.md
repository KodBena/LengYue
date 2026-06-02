# Opus Consult — Work-status SSOT: CI-gate / automation value of a fixed schema (analytic firewall, 2026-06-02)

Analytic-firewall consult (Opus 4.8, independent agent), requested by the
maintainer of LengYue to enumerate the **CI-gate-like / mechanical-automation
benefits** that fixing the work-status SSOT's schema unlocks — the checks,
invariants, and derivations that *structure* makes mechanically checkable that
prose cannot — and to feed that back into **how the schema should be shaped**.

This is a *scoped* consult: automation is one aspect of a larger SSOT design,
not the whole thing. The maintainer has already decided to build the SSOT (the
2026-06-01 decision in `docs/notes/deferred-items.md`'s "ADR-effectiveness
audits" entry; RCA guard G5). The current thinking has also moved past the
original design note (`docs/archive/notes/design/work-status-ssot-plan.md`): the SSOT is now a
**single authored structured file that IS the source of truth** (the three
status-bearing prose docs merge their status into it and stop asserting it
independently), with a two-field `state`+`resolution` shape, faceted independent
fields, typed directional inter-item relations, opaque stable ids, closed-but-
amendable vocabularies, and tombstone+compaction retirement. The prior firewall
(`docs/notes/consult/opus-consult-2026-06-02-work-status-ssot-plan.md`) argued *against*
the authored-upstream design in favour of a derived cache; this consult does
**not** re-litigate that — it takes the fixed-authored-schema as given and asks
what automation it buys.

**Calibration the maintainer set, held throughout:** the honest answer may be
that the automatable benefit is a thin sliver — that is a perfectly good and
valuable conclusion. I do not manufacture benefits to justify a schema. Where a
check is cheap-but-worthless ceremony, or only heuristic/advisory rather than a
real gate, I say so plainly. The maintainer has a formal-methods background, so
the argument is pitched at the level of invariants, decidability, and what
structure makes mechanically checkable. The maintainer is deliberately
withholding their provisional view to avoid biasing me.

Saved verbatim for auditability per the consult-record convention. License:
Public Domain (The Unlicense).

---

# Analytic Firewall — "What CI-gate-like automation does fixing the work-status schema unlock, and how should that shape the schema?"

**Consult date:** 2026-06-02
**Reviewer stance:** Independent. No stake in whether any particular check ships.
**Calibration:** Single-maintainer project; formal-methods maintainer; the project's loudness hierarchy (ADR-0002) ranks compile/build/CI gates highest but treats *a gate on a heuristic* as worse than no gate, because false failures train the maintainer to ignore the gate. I am ruthless about that line throughout.

---

## Bottom line up front

**The valuable hard-gate set is a thin sliver — three checks — and all three are cheap well-formedness/closure properties that JSON Schema plus a ~150-line zero-dep Node checker deliver. The high-drama automations (the DAG check, the FSM transition-legality check, the status-vs-git ground-truth gate) are each either trivially-satisfiable, not-decidable-from-one-snapshot, or irreducibly heuristic — so they earn an *advisory report*, not a gate. And the single most important design consequence is a *subtraction*: consolidating to one authored SSOT makes the prior design's headline automation — the "prose-status agrees with the manifest" cross-doc consistency check — *disappear entirely*, because after consolidation there is no second asserter to disagree. That is the cleanest result here: better design removes the need for an automation rather than enabling one.**

The ranked verdict, gates first:

| # | Automation | Gate or advisory | Value | Required schema feature |
|---|---|---|---|---|
| **G-1** | **Intrinsic validity** (closed-vocab membership, required-field presence, type conformance, id uniqueness, schema-version) | **Hard gate** | **Real** — directly mechanizes ADR-0002 Rule 7 (closed-vocab fail-loud) and ADR-0008; the *only* group that is a clean gate with zero false positives | closed `enum`s for `state`/`resolution`/`scope`/`tier`/`ref.kind`; `required` arrays; `additionalProperties` posture; unique `id` |
| **G-2** | **Referential integrity** (every typed relation target — `parent`, `depends-on`, `supersedes`, `refs[].id`/doc-path — resolves) | **Hard gate** (intra-file ids) / **advisory** (filesystem doc-paths) | **Real for ids; partial for paths** — the dual of the doc-graph's dangling-link validator, and *fully decidable* for the intra-file half | ids referenced by *typed id fields*, not free text; `refs` split into a typed `item`-ref vs `doc`-ref vs `source`-ref so resolution rules differ per kind |
| **G-3** | **Cross-field state/resolution consistency** (`resolution` present iff `state: closed`; `resolution ∈ legal-set-for-state`; `shipped ⇒ has ship-ref`) | **Hard gate** | **Real** — this is the two-field ontology's whole payoff made mechanical; pure intra-record predicate, no I/O, no heuristic | the two-field `state`+`resolution` split itself, plus a declared `resolution`-legal-per-`state` map and a `shipped`→`ship-ref` requirement |
| **A-1** | **Graph acyclicity** (depends-on a DAG; parent/subtask a forest; supersedes chains terminate) | **Gate that almost never fires** — keep it, but it is insurance, not a worker | **Thin** — decidable and cheap, but on *this* data the relation count is tiny (one `depends-on`: 30c→30d) so it will essentially never catch anything; its value is forward-looking | typed `depends-on`/`parent`/`supersedes` id-relations (the seed); without typed relations there is nothing to check |
| **A-2** | **Ground-truth coupling to git** (`closes: [PR#N]` ⇒ PR merged; `state: open` + `source:` path exists on `main` ⇒ flag) | **Advisory report only** (the PR-merge half *could* gate but should not; the source-exists half is irreducibly heuristic — G6's verdict stands) | **Mixed** — the source-exists half is the *only* check that would have caught Lapse 2, but at low precision; the PR-merge half is precise but near-worthless once consolidated | structured `closes: [PR-ref]` (not free text) for the precise half; `source:`-kind refs for the heuristic half |
| **A-3** | **Retirement eligibility** (terminal `state` + settled `resolution` + aged ⇒ eligible for tombstone/compaction) | **Derivation** (not a gate) | **Real but modest** — automates the batched-compaction the design already wants; pure projection | terminal-state set declared; a date field (`closed`/`shipped` date) to age against; git supplies commit-distance as the doc-graph does |
| **A-4** | **Human view / TODO projection generation** | **Derivation** (not a gate) | **Real** — the "TODO projects from SSOT" deliverable; this is the rent the structure pays a human, distinct from any gate | the whole schema; specifically `home`/`tier`/`scope` to place items in the rendered view |
| **X-1** | **FSM transition-legality** (only legal `state` transitions occur) | **Not feasible as a single-snapshot gate** | **Near-zero** — needs history/diff of two snapshots; git gives it but at real cost and low marginal value over G-3 | would need a transition table *and* a diff harness; not worth it |
| **X-2** | **Cross-doc "prose agrees with SSOT" consistency** | **Disappears under consolidation** | **N/A** — the consolidation *removes the need*; this is the prior design's headline check and it evaporates | none — its absence is the point |

The one-sentence synthesis: **the schema features that pay for themselves are the closed enums, the required-field set, the unique typed id, and the two-field state+resolution split — these unlock G-1/G-2/G-3, the entire hard-gate sliver. The typed `depends-on`/`parent`/`supersedes` relations and the structured `closes`/`source` refs earn their place too, but for *advisories and derivations*, not gates. Nothing in the proposed schema unlocks an automation that is both a clean gate and high-value beyond that core; and the consolidation's biggest automation effect is to delete a check, not add one.**

---

## How I'm drawing the gate/advisory line (the decidability frame)

The maintainer's formal-methods framing makes the right partition crisp. For each candidate I ask three questions in order:

1. **Is the property decidable from the artifact alone (the committed SSOT file), with no external I/O?** If yes, it can be a *pure* check — the strongest, because it is total and deterministic. (G-1, G-3, A-1 intra-file.)
2. **If it needs I/O (git, filesystem), is the I/O itself deterministic and the predicate exact?** If yes (e.g. "is PR#N in `git log --merges`"), it can still be a gate in principle — but I then ask whether it *should* be, given the false-failure-trains-ignore hazard and the existing-drift problem the doc-graph CI explicitly dodges. (G-2 path half, A-2 PR half.)
3. **Is the predicate a proxy for the real property?** If the check is "file named like the entry exists" standing in for "the capability the entry describes exists," it is a *heuristic* — and per ADR-0002's own logic a gate on a heuristic is a net negative. It can only be an advisory. (A-2 source half — exactly G6's verdict, which I confirm below.)

This is the same discipline the doc-graph generator already embodies: resolution against the filesystem `nodeSet` is *not soft* and is checked; the broken-link *report* is a report not a gate "because existing doc drift would make every PR red" (verified — `.github/workflows/doc-graph-ci.yml` lines 14–19, and the report page's own preamble at `generate.mjs` `buildReportPage`). The freshness gate is clean precisely because "whatever the generator produces is, by definition, fresh." I lean on that precedent throughout: it is the project's own worked example of where the gate/advisory line falls.

---

## The enumerated automations

### G-1 — Intrinsic validity *(HARD GATE — the cleanest, highest-confidence item)*

**What it checks, precisely.** For every record: (a) `state ∈ {open, closed}`; `resolution ∈` the closed resolution set; `scope ∈ {frontend, backend, both, proxy, umbrella}`; `tier ∈ {small, medium, large, future}`; each `ref.kind ∈` the closed ref-kind set. (b) Required fields are present (`id`, `title`, `state`, `scope`). (c) Types conform (`id` is a string matching the slug pattern; dates are ISO-8601; `refs` is an array). (d) `id` is unique across the file. (e) `schema_version` is the expected integer.

**Gate vs advisory.** **Hard gate, no false positives.** This is the textbook case for a CI gate: the property is decidable from the file alone, the predicate is exact, and a violation is unambiguously an error (an unknown `state` value is *never* "intended" — it is a typo or an un-amended vocabulary). This is the mechanical form of ADR-0002 Rule 7 ("closest-match selection surfaces too" — refuse a fuzzy value, amend the closed set) and ADR-0008's positive register, both of which I read end to end and which the design note's §`status` field correctly invokes. *(verified — ADR-0002 Rule 7 lines 185–217; ADR-0008 reconciliation in the design note lines 154–163)*

**Value: genuine guarantee, but note its modesty.** This is the strongest *kind* of check and the weakest *kind* of failure it prevents. It guarantees the file is well-formed and every controlled value is in-vocabulary — real type-sanity, exactly the project's primary motive. But: **would its absence have caused a past failure?** No. Lapse 2 was not a malformed-status failure; it was a *true-looking* status (`open`) that was *semantically false*. G-1 cannot catch a semantically-false-but-well-formed record — and the RCA's whole point (Finding 2c, §3) is that the project's characteristic failure is the locally-correct-act, not the malformed one. So G-1 is real type-hygiene with zero demonstrated-incident coverage. It is worth having (it is nearly free and it is the substrate every other check stands on), but it is not the rent-payer. *(verified — RCA Findings 2c, §3)*

**Feasibility/cost.** Trivial. **JSON Schema** expresses all of (a)–(c) and `schema_version` directly; `uniqueItems` does not cover id-uniqueness-across-objects, so (d) needs ~5 lines of custom JS (or a `$id`-keyed check). A single `ajv` invocation or a zero-dep hand-rolled validator (the doc-graph generator is the template — it is zero-dep Node, no `node_modules`) gates it in CI. The closed-but-amendable property is honoured naturally: the enum lives *in the schema*, and amending the vocabulary is a one-line schema edit, exactly as the design note specifies.

**Required schema feature.** Closed `enum`s for every controlled field; `required: [id, title, state, scope]`; an explicit `additionalProperties` decision (see synthesis — this interacts with "forward-compatible best-effort"); a slug-pattern `id` with a uniqueness obligation; `schema_version`.

---

### G-2 — Referential integrity *(HARD GATE for intra-file id-refs; ADVISORY for filesystem doc-paths)*

**What it checks, precisely.** Every typed relation target resolves. Split by kind:
- **Intra-file id-refs** (`parent: <id>`, `depends-on: [<id>]`, `supersedes: <id>`, `duplicates: <id>`, and any `refs[]` of kind `item`): the referenced id exists as a record in the same file.
- **Filesystem doc/source refs** (`refs[]` of kind `worklog`/`design-note`/`adr`/`source`/etc., carrying a repo-relative path): the path resolves to an existing file on `main`.

**Gate vs advisory.**
- **Intra-file half: hard gate, fully decidable, zero false positives.** This is the *exact* dual of the doc-graph's dangling-edge resolution, but *better* than the doc-graph's, because the targets are first-class ids in the same file rather than prose-scanned basenames — there is no ambiguous-basename seam, no placeholder-in-code-block false-positive class. Resolution here is total and exact: an id either is a key in the record set or it is not. This is the single place the seed example ("typed id-referencing relations") most clearly pays off — and it pays off for referential integrity *before* it pays off for acyclicity (see A-1).
- **Filesystem half: advisory, same reason the doc-graph's link report is advisory.** A `source:` or `worklog:` path either resolves or it does not — that *is* decidable. But making it a *gate* re-creates exactly the problem `doc-graph-ci.yml` documents and refuses: existing drift (a worklog that moved, a renamed source file) would make PRs red for reasons orthogonal to the change at hand. The doc-graph's broken-reference report measured **68 dangling refs from live docs** right now (verified — `docs/doc-graph.md` line 159); a gate on path-resolution would inherit that whole population. So: report it, mirror the doc-graph's split-by-origin presentation, let the maintainer review. *(verified — doc-graph-ci.yml lines 14–19; doc-graph.md line 159)*

**Value.** The intra-file gate is **genuine and cheap** — but, like G-1, it guards a failure class the project has not actually hit (no recorded incident of a dangling `parent`/`depends-on`). Its value is forward-looking insurance against the schema's own consistency as the item set grows, and it is the precondition for A-1 (you cannot meaningfully check a DAG if edges can point at non-existent nodes). The filesystem-advisory half is worth roughly what the doc-graph's report is worth — a periodic "these point at nothing" list — no more.

**Feasibility/cost.** Intra-file: trivial (~10 lines — build the id set, check every relation target against it). JSON Schema *cannot* express cross-object id-resolution (it has no "this string must equal some other object's `id`"), so this is a custom-checker job, not a schema-validator job — note that for the synthesis. Filesystem: trivial `existsSync` per path, identical to the doc-graph generator's resolution.

**Required schema feature.** This is the strongest feedback-into-design point: **relations must be typed id fields, and `refs` must be a discriminated kind-tagged shape**, not free text. `depends-on: ["30d"]` (id-list) is checkable; "Pairs naturally with item 30d" (prose — verbatim from `TODO.md` line 630) is not. And `refs` must distinguish `item`-refs (resolve intra-file) from `doc`/`source`-refs (resolve on filesystem) so the checker applies the right resolution rule and the right gate/advisory disposition per kind. The design note's `refs.kind` enum already gestures at this; the design point is that the *resolution rule and the gate-disposition are per-kind*, so the kind tag is load-bearing, not decorative.

---

### G-3 — Cross-field state/resolution consistency *(HARD GATE — the two-field ontology's mechanical payoff)*

**What it checks, precisely.** Intra-record predicates coupling the two faceted fields:
- `resolution` is present **iff** `state: closed` (an open item has no resolution; a closed item must have one).
- `resolution ∈` the subset legal for `closed` (e.g. `{shipped, deferred, superseded, duplicate, wontfix}` — not, say, `in-progress`, which would be a `state`-like value leaking into `resolution`).
- **`resolution: shipped ⇒ a ship-ref is present`** (a `shipped` record must carry `closes`/`ship` PR-refs or a ship date; a shipped feature with no evidence pointer is the structurally-incomplete record).
- (optionally) `resolution: superseded ⇒ a `supersedes`/`superseded-by` pointer is present` — a supersession with no target is incoherent.

**Gate vs advisory.** **Hard gate, no I/O, no heuristic.** Every clause is a pure predicate over one record's own fields. This is the most *characteristically valuable* gate of the set, because it is the one the chosen ontology (two-field `state`+`resolution`) specifically enables — a single-field `status: shipped|open|deferred|...` enum could *not* express "resolution present iff closed" because there is no second field to be consistent with. The two-field split is the schema feature; G-3 is what makes the split earn its keep mechanically rather than merely conceptually.

**Value.** **Real, and the closest of the gates to a demonstrated failure surface.** Consider Lapse 2 re-encoded into this schema: the analysis-tab item shipped on 2026-05-29. Under G-3, the *only* well-formed terminal encoding is `state: closed, resolution: shipped, closes: [PR#301, PR#302, PR#304]`. G-3 does not *catch* the author who leaves it `state: open` (that is A-2's job, and it is heuristic) — but it makes the *correct* state impossible to record incompletely: you cannot write `resolution: shipped` and omit the PR-refs, and you cannot write `state: closed` and omit the resolution. It converts "remember to fill in the ship evidence" from memory-discipline into a mechanical obligation. That is precisely the RCA's "convert policy to mechanism" (§3) applied at the record level. It is not a *total* fix for Lapse 2 (nothing single-snapshot is), but it is the part of the fix that is a clean gate.

**Feasibility/cost.** Trivial — a handful of intra-record predicates in the custom checker. JSON Schema *can* express the "resolution present iff closed" coupling via `if`/`then`/`else` (draft-07+ conditional subschemas: `if {state: closed} then {required: [resolution]} else {not: {required: [resolution]}}`) and `shipped ⇒ ship-ref` similarly. So a chunk of G-3 is even pure-JSON-Schema, no custom code. *(asserted — JSON Schema conditional-subschema capability; standard draft-07 feature, not repo-specific)*

**Required schema feature.** The two-field `state`+`resolution` split itself; a declared **resolution-legal-per-state map** (which resolutions are legal for `closed`; that `open` permits none); a **`shipped`-requires-ship-ref** rule; a structured ship-ref/`closes` field for that rule to check.

---

### A-1 — Graph acyclicity (DAG / forest / terminating chains) *(GATE that essentially never fires — keep as insurance, do not oversell)*

**What it checks, precisely.** (a) The `depends-on`/`blocks` relation is acyclic (a strict partial order — a DAG). (b) `parent`/`subtask` forms a forest (no cycles; each node ≤ 1 parent). (c) `supersedes` chains terminate (no A supersedes B supersedes … supersedes A).

**Gate vs advisory.** **It *can* be a hard gate** — cycle detection is decidable, total, deterministic (Kahn's algorithm / DFS back-edge detection, O(V+E)), zero false positives. This is the seed example and it is *correctly* a gate-class property. **But** I have to be honest about what it would catch on *this* data.

**Value: thin, and I want to be ruthless here per the calibration.** I read both `TODO.md` and `deferred-items.md` end to end looking for the actual relation density. The findings:
- **There is exactly one dependency relation in the entire live corpus**: "30c pairs with item 30d … doing 30d first is easier to review" (`TODO.md` lines 629–631) and "Pairs naturally with item 30d — once the lineage CTE is consolidated, 30c becomes a one-liner" (lines 630). That is *one* edge, 30c→30d. *(verified — TODO.md)*
- **Parent/subtask nesting exists but is shallow and tree-shaped by construction**: RB-1/RB-2/RB-3 under the regime-B nav item (`TODO.md` lines 467–492); the knob-registry follow-ups list (lines 562–610); the 34/34a/34b lineage referenced in prose. None of these is remotely at risk of a cycle — they are authored as bullet lists under a heading. *(verified — TODO.md)*
- **Supersession exists** (item 32's number was reused then disambiguated; the pre-umbrella TODOs superseded by the merged one, `TODO.md` lines 9–12) but as one-step pointers, not chains.

So a DAG check on the real data has **nothing to bite on** — the dependency graph is a single edge, the hierarchy is hand-authored trees, the supersession is one-hop. A cycle would require a future authoring error that does not resemble anything in the current corpus. **This is the seed example, and it is the canonical case of a cheap, correct, gate-class check whose actual catch-rate on this project is approximately zero.** I keep it in the "adopt" column *only* because (a) it is nearly free once typed relations exist for G-2's sake anyway, and (b) it is forward-looking insurance whose cost is a few lines. But I will not pretend it is a worker. It is the airbag, not the seatbelt. The maintainer's calibration explicitly invited this conclusion and it is the honest one: the DAG check is the most *intellectually satisfying* automation and one of the *least* valuable on this data.

**Feasibility/cost.** Trivial — standard cycle detection over the id-relation edges, ~20 lines.

**Required schema feature.** Typed `depends-on`/`parent`/`supersedes` id-relations (the same feature G-2 needs). No additional schema cost beyond what G-2 already buys — which is the real reason to keep it: its marginal cost is ~zero given the typed relations exist regardless.

---

### A-2 — Ground-truth coupling to git/code *(ADVISORY — the one check that touches Lapse 2, at a price)*

This is "the big one" the brief flags, and it splits into two sub-checks with opposite characters.

**A-2a — `closes: [PR#N]` ⇒ PR#N is merged.**
- *What it checks:* a `resolution: shipped` record's `closes` PR-refs correspond to actually-merged PRs (queryable via `gh pr view N --json state` or `git log --merges --grep`).
- *Gate or advisory:* **It is decidable and exact** (a PR is merged or it is not — this is real ground truth, not a proxy), so it *could* gate. **But it should not, for two reasons.** First, it has the existing-drift problem: historical `shipped` records reference PRs whose merge-status query may be unreliable (squash-merges lose the PR number from `git log`; `gh` needs network + auth in CI). Second and decisive: **once consolidated, its value is near-zero.** The maintainer authors `resolution: shipped` and `closes: [PR#N]` in the same edit; the failure mode it guards (claiming shipped against an unmerged PR) is one a single author writing one record essentially never commits. It is a precise check of a thing that does not go wrong.
- *Value:* **low.** Precise but near-worthless post-consolidation. Demote to an occasional advisory at most, or omit.

**A-2b — `state: open` whose `source:` path exists on `main` ⇒ flag.** *(This is the Lapse-2 signature.)*
- *What it checks:* an item still marked `open`/un-terminal whose `refs[]` of kind `source` names a path that now resolves on `main` — the exact shape of Lapse 2 (the analysis-tab item stayed `open` while `frontend/src/components/editors/AnalysisTabsEditor.vue` existed; I verified that file is on disk, 8524 bytes, dated May 29 — *(verified — `ls` + git)*).
- *Gate or advisory:* **Advisory only, irreducibly. The RCA's G6 verdict is correct and I confirm it head-on.** The predicate "a file named like the entry's `source` exists" is a *heuristic proxy* for "the capability the entry describes is built." It false-positives (a file can exist while the described capability does not — a stub, a partial, a same-named-but-different thing) and false-negatives (the feature ships under a different path/name than the entry's `source` guessed — which is *more* likely when the entry was authored *before* the code, as the Lapse-2 TODO was, authored 2026-05-28, one day before the code). RCA Finding 2e and G6 both say this precisely: "existence of a file named like the entry's subject is weak evidence … it will both false-positive … and false-negative … recommend this *only* as a low-confidence advisory report, never as a CI gate." *(verified — RCA G6 lines 408–431)*
- **Does coupling to git/code (real ground truth) change the verdict versus the prior firewall's "two hand-maintained artifacts" critique?** This is the sharpest question in the brief and the answer is nuanced. **Yes, it changes the verdict *partially*, in exactly one direction.** The prior firewall's critique (`opus-consult-2026-06-02-work-status-ssot-plan.md` claim 3) was that the *contradiction* check (prose-vs-manifest) compares two hand-maintained things and so is not ground-truth validation. That critique is *about A-2's now-deleted sibling X-2*, not about A-2b. A-2b *does* couple to real ground truth (the filesystem on `main` is not a hand-maintained assertion — it is what the code actually is). So A-2b escapes the "two hand-maintained artifacts" objection: one side is genuinely the ground truth. **But it does not escape G6's objection**, which is a *different* and orthogonal one: the *predicate* (filename existence) is a low-precision proxy for the *property* (capability existence). Ground-truth-coupling fixes the "is one side real?" problem; it does not fix the "is the predicate a faithful test?" problem. So: coupling to git/code makes A-2b *better than* the prose-vs-prose check (one side is real) but *still only an advisory* (the predicate is still a proxy). That is the honest synthesis of the two skeptical positions the brief asked me to engage — they are attacking different links in the chain, and A-2b survives one and not the other.
- *Value:* **the highest-value-per-incident of any check here, but at low precision.** It is the *only* automation in the entire set that would have surfaced Lapse 2 (G6 notes it "would have caught *this* case … but only because the naming happened to align"). So it has demonstrated-incident relevance that G-1/G-2/G-3 lack — but it pays for that relevance in false-positive noise. The right framing: A-2b is a **low-confidence advisory the maintainer reviews periodically**, in the exact mould of the doc-graph's broken-reference report. It is worth building *because* it is the one thing touching the actual failure — but it must never gate, or the first false-positive trains the maintainer to ignore it (and an ignored Lapse-2 detector is strictly worse than none, because it manufactures false confidence).

**Feasibility/cost.** A-2a: `gh`/`git` query per shipped record — moderate (network/auth in CI is the cost). A-2b: `existsSync` per `source` ref of an open record — trivial, identical to the doc-graph's resolution pass.

**Required schema feature.** A-2a needs a **structured `closes: [PR-ref]`** field (typed PR-references, not "shipped via PR #301" free text — verbatim the current prose form at `TODO.md` line 414). A-2b needs **`source`-kind refs carrying repo-relative paths** and the `state: open` flag to filter on. Both are feedback-into-design: the PR-ref and source-ref must be *fielded and typed*, or neither check is possible.

---

### A-3 — Retirement eligibility *(DERIVATION — automates the design's own tombstone/compaction want)*

**What it derives, precisely.** The set of records eligible for tombstoning/batched compaction: `state: closed` **and** `resolution ∈` settled-terminal set **and** aged past a threshold (closed-date older than N, or commit-distance > bucket, exactly as the doc-graph computes staleness). The design already wants "retirement = tombstone + batched compaction" of "terminal+settled items"; this is the predicate that *identifies* the batch.

**Gate or advisory.** **Neither — it is a derivation** (a computed projection, like the doc-graph's staleness table). It does not pass/fail anything; it produces a list the maintainer acts on in a compaction pass.

**Value.** **Real but modest.** It mechanizes the eligibility judgment so compaction is a batched, criteria-driven sweep rather than a per-item memory call — genuinely useful for the live-ledger's growth (deferred-items.md is already 1078 lines with a Closed section accreting). It is not a gate and prevents no failure; it is an ergonomic derivation.

**Feasibility/cost.** Trivial — a filter over the records plus a git commit-distance per record (the doc-graph's `nodeAge`/`bucketFor` is literally reusable). *(verified — generate.mjs `nodeAge` lines 231–251, `bucketFor` 253–257)*

**Required schema feature.** A declared terminal-state set; a **date field** (`closed`/`shipped` date — the design note's `shipped.date` already has it) to age against; nothing new beyond what G-3 needs.

---

### A-4 — Human view / TODO projection generation *(DERIVATION — the structure's rent to a human)*

**What it derives.** The rendered `TODO.md` status view (or a thin `work-status.md`): items grouped by `tier`/`scope`, terminal ones struck through with their ship-refs, triggers listed — the P2 "generated status scaffolding between markers" the design note recommends.

**Gate or advisory.** **Derivation.** A freshness *gate* on the rendered view *can* exist (regenerate-and-diff, exactly like `doc-graph-ci`'s structure-only check) — and that freshness gate *is* a clean gate (whatever the generator produces is by definition fresh). So there is a real gate hiding here: **"the committed rendered view matches a fresh render of the SSOT."** That is decidable, exact, zero-false-positive, and structurally identical to the existing doc-graph freshness gate. I list it under derivations because the *value* is the human view; the freshness gate is the same trick the doc-graph already plays and transfers verbatim.

**Value.** **Real** — this is the literal deliverable ("TODO projects from the SSOT"). The prior firewall argued (claim 5) that the *projectable surface* of TODO.md is tiny relative to its hand-authored prose, so the generated view is thin. I confirm that observation against the data — the analysis-tab entry is ~17 lines of prose around one status line; the Chess-clone entry ~30 lines (`TODO.md` lines 137–166); "Automatic mistake discovery" ~40 lines of open design questions (lines 698–740). The *status scaffolding* the SSOT can generate is a sliver of each entry. But that does not make the projection worthless — it makes it a *thin generated index plus hand-authored bodies*, which is fine and is the doc-graph's own `doc-graph.md` shape. The freshness gate on that index is where the automation value lands.

**Feasibility/cost.** Moderate — the generator is the bulk of the tooling work, but the doc-graph generator is a complete template (read manifest → emit markdown between `<!-- GENERATED -->` markers → `--check` mode diffs structure). *(verified — generate.mjs `buildIndexPage`, `checkDrift`, `--check` driver)*

**Required schema feature.** The whole schema; specifically `home`/`tier`/`scope` to place and group items in the view.

---

### X-1 — FSM transition-legality *(NOT a single-snapshot gate — assess and reject)*

**What it would check.** Only legal `state`/`resolution` transitions occur over time (e.g. `closed:shipped → open` is illegal without an explicit reopen; `open → closed:shipped` is legal).

**Why it is not feasible cheaply, assessed honestly.** Transition-legality is a property of a *pair* of snapshots (before/after), not of one committed file. The SSOT-at-HEAD does not contain its own history — you need the previous committed version to diff against. Git *supplies* this (`git show HEAD~1:docs/work-status.json` vs the working tree), so it is not *impossible*. But: (a) it needs a diff harness keyed on stable ids (which the opaque-stable-id design helpfully provides — this is the one place the stable id is load-bearing for an automation); (b) the marginal value over G-3 is small — G-3 already guarantees every *snapshot* is internally consistent, and the illegal-transition failure mode (silently un-shipping a shipped item) is not a failure this project has hit or is plausibly at risk of; (c) it introduces a history-dependent CI check whose failures are harder to reason about than pure-snapshot checks. **Verdict: the cost/value is upside-down. Reject for v1.** Note it as a thing the stable-id design *would* enable later if a transition-discipline need ever appears — but do not build it speculatively.

**Required schema feature (if ever built).** The opaque stable `id` (so records can be diffed across snapshots) plus a declared transition table. The stable id earns a footnote here as the enabler, not a present automation.

---

### X-2 — Cross-doc "prose agrees with SSOT" consistency *(DISAPPEARS under consolidation — the cleanest result)*

**What it would have checked.** That `TODO.md`'s `~~strikethrough~~ *(shipped)*` markers, `deferred-items.md`'s "Closed"/"Open" markers, and `handoff-current.md`'s in-flight assertions each agree with the SSOT's status for the same item. This was the original design note's headline gate (§The framing, consequence 1; "the validator falls out for free," consequence 2) and the prior firewall's main target (claim 3: it "compares two hand-maintained artifacts").

**Why it disappears, and why that is the most important finding for the schema.** The current thinking is **consolidation**: the three prose docs *stop independently asserting status* and reference the SSOT. After that consolidation there is **no second asserter** — `TODO.md`'s status section is *generated from* the SSOT (A-4), not hand-authored, so it cannot disagree with its own source; `deferred-items.md` and `handoff-current.md` carry *descriptions* and *relations* (ADR-0005 Rule 3) but not status assertions, so there is nothing to reconcile. **The check does not become easy — it becomes meaningless, because the thing it checked for (two independent status assertions) no longer exists by construction.**

This is the single most important point for shaping the schema, and it is a *subtraction*: **good design removes an entire automation rather than enabling one.** The prior design needed the consistency check because it left the three docs as independent asserters and tried to *gate* their agreement. The consolidated design makes the SSOT the sole asserter and *generates* the views — so the agreement is structural (a generated view is its source by definition), enforced by the A-4 freshness gate, not by a semantic consistency comparison. The maintainer's instinct to consolidate is therefore *also* the instinct that eliminates the prior design's hardest and most-criticized check. That is the cleanest invariant-level result in this consult: the duplication that motivated the SSOT is removed by the single-asserter property, and the consistency check that the duplication required is removed with it.

**The one residual.** Consolidation only deletes X-2 *to the extent the prose docs genuinely stop asserting status*. If, in practice, `deferred-items.md` entries keep an inline "Closed 2026-06-01" line (as every Closed entry there does today — verified, e.g. lines 88, 292, 300, 1020), then a *vestigial* status assertion survives and X-2 reincarnates as "the inline Closed marker matches the SSOT." The schema cannot prevent that authoring habit; only the migration-and-discipline can. So the design point is: **the consolidation's automation benefit (deleting X-2) is contingent on the prose docs actually surrendering status assertions, not merely being told to.** That is a discipline obligation, not a schema feature — but it is the precondition for the subtraction to hold.

---

## Synthesis — which schema features earn their place, ranked

Mapping automations back to the schema features that enable them, and ranking the *features* by automation-value-per-feature:

**Tier 1 — features that unlock a clean hard gate (build these; they pay for themselves):**

1. **Closed `enum`s on every controlled field** (`state`, `resolution`, `scope`, `tier`, `ref.kind`). Unlocks **G-1**. Also the mechanical form of ADR-0002 Rule 7 / ADR-0008. Cheapest, highest-confidence, pure JSON Schema.
2. **The two-field `state`+`resolution` split** (with a declared resolution-legal-per-state map and a `shipped⇒ship-ref` rule). Unlocks **G-3** — the one gate closest to a demonstrated failure surface, and the gate the chosen ontology specifically enables (a single-field status enum could not express it). Pure intra-record predicate; partly even pure JSON Schema (`if/then`).
3. **Unique typed `id` + typed id-relations (`parent`/`depends-on`/`supersedes`) + kind-discriminated `refs`.** Unlocks **G-2 intra-file** (hard gate, exact, better than the doc-graph's prose-scan because targets are first-class ids) and is the *precondition* for A-1/X-1. The kind-tag on `refs` is load-bearing because resolution-rule and gate-disposition are per-kind. Custom checker (JSON Schema can't do cross-object id-resolution).

**Tier 2 — features that unlock advisories and derivations (build these, but for reports/views, not gates):**

4. **Structured `closes: [PR-ref]` and `source`-kind path refs.** Unlock **A-2** — the only checks touching Lapse 2, but both advisory (A-2a precise-but-worthless post-consolidation; A-2b high-relevance-but-heuristic, G6's verdict confirmed). Worth fielding the data; never worth gating on it.
5. **A terminal-state set + a date field.** Unlock **A-3** (retirement-eligibility derivation) and feed **G-3**. Modest ergonomic value; trivial cost.
6. **`home`/`tier`/`scope` for placement.** Unlock **A-4** (the generated human view) and its freshness gate — the structure's rent to a human reader, and where a *second* clean gate (regenerate-and-diff, doc-graph-identical) actually lives.

**Tier 3 — features whose automation value is thin or forward-looking (include if cheap, do not oversell):**

7. **Typed `depends-on` (again) for A-1's DAG check.** The acyclicity gate is decidable and cheap but on this data (one dependency edge, hand-authored trees) **catches essentially nothing**; it is insurance whose marginal cost is ~zero given the relations exist for G-2. Keep it; do not claim it works.
8. **The opaque stable `id` for X-1's diff harness.** Only enables FSM transition-legality, which is **not worth building for v1** (history-dependent, low marginal value over G-3). The stable id is justified on *other* grounds (the design note's anti-rigidity argument — status is anti-rigid so the id must not encode it; verified, design note §`id` lines 144–153) and is genuinely the missing primitive the project lacks today (work keyed by mutable title or the abandoned `item N` scheme — verified in `TODO.md`: items 27/30c/30d/32 coexist with un-numbered items). Its *automation* payoff is just this one deferred check; its *design* payoff (stable cross-references) is real and independent.

**Features that unlock nothing worth having (do not add for automation's sake):**

- **A `priority`/ordering field** — no check depends on it; it is a sort key for A-4 at most.
- **Free-text status-adjacent fields** (a prose `trigger`, a prose `notes`) — fine to carry (the design note keeps `trigger` as free text), but they unlock *zero* automation by construction (unparseable), so they must not be sold as enabling anything. They are human payload the checker ignores.
- **`additionalProperties: false`** — this one is a genuine tension to flag, not a free win. "Forward-compatible best-effort schema" (the maintainer's instruction, design note §Blind-spots lines 316–321) means *tolerate unknown fields* (new per-item fields we can't foresee are ignored by old tooling). That is **`additionalProperties: true`**. But unknown *values* of *known* closed-vocab fields must fail loud (G-1). These are not in conflict — they apply to different axes (unknown *fields* tolerated; unknown *enum members* fatal) — but the schema must encode them *oppositely*: open `additionalProperties` at the record level, closed `enum`s on the controlled fields. Getting this backwards (closed `additionalProperties`) would turn every forward-compatible field-addition into a spurious gate failure — a gate-on-non-error, the exact anti-pattern the calibration warns against. This is the schema's main correctness obligation and the design note already names it; I flag it here because it is the place "fixed schema" and "forward-compatible" must be reconciled at the `additionalProperties` keyword, not in prose.

---

## Direct answers to the brief's dimensions

- **Intrinsic validity:** Valuable as a *clean gate* (G-1), but it is well-formedness hygiene with zero demonstrated-incident coverage — real type-sanity, not a Lapse-2 fix. The substrate every other check stands on.
- **Referential integrity:** Hard gate for intra-file id-refs (better than the doc-graph's, because ids beat prose-scanned basenames); advisory for filesystem paths (same existing-drift reason the doc-graph's link report is advisory).
- **Graph invariants (DAG):** Decidable, cheap, correct — and catches **nothing** on this data (one dependency edge total). The seed example is the canonical cheap-correct-but-near-zero-yield gate. Keep as insurance; do not oversell.
- **Cross-field state/resolution:** The most characteristically valuable gate (G-3) — pure predicate, no I/O, and the one the two-field ontology specifically enables. Closest of the gates to Lapse 2 (makes the *correct* terminal encoding impossible to record incompletely).
- **Lifecycle/FSM transition-legality:** Needs two snapshots; git supplies them but the cost/value is upside-down vs G-3. Reject for v1; the stable id would enable it later.
- **Ground-truth coupling:** The PR-merge half is precise but near-worthless post-consolidation; the source-exists half is the only check touching Lapse 2 but is irreducibly heuristic (G6 confirmed). Coupling to git/code beats the prior firewall's "two hand-maintained artifacts" objection (one side is genuinely real) but does **not** beat G6's orthogonal "the predicate is a proxy" objection — so it survives one skeptic and not the other, and lands as a low-confidence advisory, never a gate.
- **Consolidation's effect on the consistency check:** This is the headline. Consolidation **deletes** X-2 (the prose-vs-SSOT check) rather than enabling it — there is no second asserter once the prose docs surrender status. Better design removes the automation. Contingent on the prose docs *actually* dropping inline status markers (a discipline obligation the schema can't enforce).
- **Derivations:** A-3 (retirement eligibility) and A-4 (the human view + its clean freshness gate) are the schema-enabled automations distinct from gates — real ergonomic value, the structure's rent to a human, and (in A-4's freshness check) the second genuinely-clean gate of the whole set.

---

## Verified vs. asserted

**Verified by repo read:**
- The live dependency-relation corpus is *one edge* (30c→30d): "Pairs naturally with item 30d … doing 30d first is easier to review" (`TODO.md` lines 629–631). Hierarchy (RB-1/2/3 lines 467–492; knob-registry follow-ups 562–610) is hand-authored trees; supersession (item 32 number-reuse 679–684; pre-umbrella TODOs 9–12) is one-hop. The DAG check has nothing to bite on. *(read `docs/TODO.md` end to end)*
- TODO.md is prose-dominant; the SSOT-projectable status surface is a sliver of each entry (analysis-tab ~17 lines around one status line, line 806; Chess-clone ~30 lines 137–166; mistake-discovery ~40 lines 698–740). *(read end to end)*
- The ship-evidence is currently free text ("Shipped via PR #272 (commit `355b1e2`…)" line 414; "shipped 2026-05-29 as the three-phase…" line 808), not a fielded `closes` — so A-2a needs a structured PR-ref field. *(read end to end)*
- Every Closed entry in `deferred-items.md` carries an inline "Closed <date>" status assertion (lines 88, 292, 300, 1020) — the vestigial-status-marker risk that makes X-2's deletion contingent on discipline. *(read `docs/notes/deferred-items.md` end to end)*
- The doc-graph CI gate is freshness-on-structure-only and explicitly *not* a broken-link gate, "because existing doc drift would make every PR red"; the broken-reference report counts **68 dangling refs from live docs** right now. Resolution against the filesystem `nodeSet` is exact/total; ambiguous bare-names are marked never guessed (ADR-0002). The generator is zero-dep Node; `nodeAge`/`bucketFor`/`checkDrift`/`--check` are directly reusable as templates. *(read `tools/doc-graph/generate.mjs`, `.github/workflows/doc-graph-ci.yml`, `docs/doc-graph.md` end to end)*
- RCA G6 says the source-exists check is "weak evidence … both false-positive … and false-negative … recommend this *only* as a low-confidence advisory report, never as a CI gate" (lines 408–431); Finding 2c (status-blindness at authoring time) and §3 (the policy-not-mechanism aggregate-defect shape) frame why G-1/G-2 lack demonstrated-incident coverage. *(read end to end)*
- ADR-0002's loudness hierarchy ranks compile/build/CI highest (lines 90–116); Rule 7 closed-vocab fail-loud (185–217); the UI-input silent-fallback *exception* (319–331) confirms sentinel-at-contract-boundary is not exempt here. *(read end to end)*
- Proxy-pin drift is live: HEAD pins commit `b871127` = **v1.0.27**; the design note and `CLAUDE.md` assert v1.0.21. The analysis-tab source files exist on disk (`AnalysisTabsEditor.vue` 8524 bytes, `panel-registry.ts`), confirming the A-2b Lapse-2 signature is real. No `work-status.json` exists yet. *(verified — `git ls-tree HEAD proxy`, `git -C proxy describe`, `ls`, `git ls-files`)*
- The opaque-stable-id-because-status-is-anti-rigid argument and the "project lacks a stable work-item key today" gap (items 27/30c/30d/32 vs un-numbered items). *(verified — design note §`id` lines 144–153; TODO.md item numbering)*

**Asserted from reasoning (flagged):**
- That JSON Schema draft-07 `if/then/else` can express G-3's "resolution present iff closed" and "shipped ⇒ ship-ref" couplings, and that JSON Schema *cannot* express cross-object id-resolution (G-2 needs custom code). *(standard JSON Schema capability, not repo-specific; not separately verified against an `ajv` run here)*
- That A-2a (PR-merge) is "near-worthless post-consolidation" is a judgment from the single-author-writes-one-record argument, not a measured false-something rate.
- That coupling to git/code beats the prior firewall's "two hand-maintained artifacts" objection but not G6's "predicate-is-a-proxy" objection is an analytic decomposition of the two skeptics' arguments into the two links of the inference chain (is-one-side-real vs is-the-predicate-faithful); it is reasoning, not a proof.
- That the DAG check's catch-rate on future data is "approximately zero" is extrapolation from the current single-edge corpus; a future authoring pattern could change it (which is exactly why it is kept as cheap insurance rather than dropped).
- That consolidation *deletes* X-2 holds only if the prose docs actually surrender status assertions; the vestigial-marker risk (verified above) is the named contingency, and whether the discipline holds is not something I can verify in advance.

---

## One closing observation

The brief asked whether the valuable-automation set might be a thin sliver and invited that conclusion. It is. **Three clean hard gates (G-1, G-2-intra-file, G-3) plus one freshness gate (A-4) — all of them cheap well-formedness/closure/projection checks — and everything dramatic (the DAG, the FSM, the git-coupled status check) is either near-zero-yield, not-single-snapshot-decidable, or irreducibly heuristic.** That is not a disappointing result; it is the *correct* result for this failure class. The RCA is explicit (§3) that the project's characteristic defect is the locally-correct-act invisible-in-aggregate, and the brutal truth is that **the gates a fixed schema unlocks guard well-formedness, while the failure that motivated the schema (Lapse 2) is a semantic-truth failure that only a heuristic advisory can even gesture at.** The schema is worth fixing — for the type-sanity of G-1/G-3, for the genuine referential integrity of G-2, and above all for the *subtraction* (consolidation deletes the consistency check). But the honest framing for the maintainer is: the schema's automation pays its rent in well-formedness gates and in *removing* a check, not in a mechanical detector for the semantic-staleness failure that started this. That failure stays, as the RCA always said it would, mostly a matter of the retire-on-ship discipline (G4) — which no schema mechanizes.

---

## Appendix — verbatim prompt

The exact brief given to this firewall agent (Opus 4.8, independent), repo-relative paths preserved. License: Public Domain (The Unlicense).

````text
You are an independent "analytic firewall" — a fresh, disinterested opinion for the maintainer of LengYue, a single-maintainer Go spaced-repetition study app (soft monorepo: Vue 3 + TS frontend, FastAPI backend, KataProxy git-submodule), hosted on GitHub. Repo root: `/home/bork/w/omega`. Reason independently and adversarially; you have NO stake. 

**Calibration that overrides everything: the honest answer may be that the automatable benefit is a thin sliver — that is a perfectly good and valuable conclusion. Do NOT manufacture or inflate benefits to justify a schema. If a check is cheap-but-worthless ceremony, or only heuristic/advisory rather than a real gate, say so plainly.** The maintainer has a formal-methods background; argue at the level of invariants, decidability, and what structure makes mechanically checkable that prose cannot. Do NOT inject or assume any preferred conclusion — the maintainer has a provisional view and is deliberately withholding it to avoid biasing you.

## The question (scoped — automation is ONE aspect of a larger design, not the whole thing)

LengYue is going to consolidate every work-actionable item into a single, **fixed-schema**, machine-AND-human-readable structured file — the work-status SSOT (a JSON/structured doc that IS the source of truth; the prose docs stop independently asserting status and reference it).

**Enumerate the CI-gate-like / mechanical-automation benefits that fixing the schema unlocks** — the checks, invariants, and derivations that *structure* makes possible and prose cannot — and use that to inform **how the schema should be shaped**. Seed example: a typed, id-referencing `depends-on` relation makes the dependency graph's **acyclicity (DAG-ness) machine-checkable**; prose "A pairs with B, do B first" does not. Find the rest. For EACH candidate automation, report:
- **What it checks/derives**, precisely.
- **Gate vs advisory:** can it be a hard CI gate (deterministic, no false positives), or only an advisory report (heuristic, would false-fire)? Per ADR-0002's loudness hierarchy a build/CI gate is a strong level — but a *gate on a heuristic* is worse than no gate, because false failures train the maintainer to ignore it. Be ruthless about this line.
- **Value:** genuine guarantee vs ceremony. Would its absence have caused a real past failure (see the RCA) or is it theoretical?
- **Feasibility/cost** (and what tech: JSON Schema, a custom Node checker like the existing doc-graph generator, a git query, etc.).
- **Required schema feature:** the specific field/relation/typing the schema must have for this check to be possible — this is the feedback into design (e.g., "needs an explicit typed `closes: [PR-ref]` field, not free text").

Then synthesize: **which schema features earn their place by unlocking a high-value automation, and which proposed features unlock nothing worth having.** Rank. Be willing to conclude the valuable-automation set is small.

## Dimensions to consider (don't pre-judge value; some may be worthless — say so)

- **Intrinsic validity:** closed-vocabulary membership (status/scope/resolution ∈ fixed sets → fail-loud), required-field presence, type conformance, id uniqueness, schema-version. (JSON Schema territory — cheap. Valuable, or just well-formedness hygiene?)
- **Referential integrity:** every typed relation target (`parent`, `depends-on`, `supersedes`, doc/source `refs`) resolves to an existing item/file — the dual of the existing doc-graph's dangling-link validator.
- **Graph invariants:** dependency graph **acyclic (DAG)** — the seed; parent/subtask a forest (no cycles); supersedes chains terminate.
- **Cross-field invariants:** two-field `state`+`resolution` consistency (resolution present iff closed; resolution ∈ the set legal for that state); shipped ⇒ has a ship-ref; etc.
- **Lifecycle/transition legality (FSM):** only legal state transitions occur — BUT this needs *history/diff* (two snapshots), which a single committed file may not give cheaply; assess the cost honestly.
- **The big one — ground-truth coupling:** status vs git/PR/code. An item `state: closed, resolution: shipped, closes: [PR#N]` → is PR#N merged? An item `state: open` whose `source:` path already exists on `main` → flag (the exact Lapse-2 signature). WHICH of these can be a deterministic hard gate vs only a low-precision advisory? The RCA's G6 is skeptical of the existence-check's precision; the prior firewall argued a check between two hand-maintained artifacts is not ground-truth validation. Engage both head-on — does coupling to *git/code* (real ground truth) change that verdict versus coupling to prose?
- **Consolidation's effect on the consistency check:** the earlier design needed a "prose-status agrees with manifest" check because status lived in ~4 places. If the SSOT is the *single* consolidated source and the prose docs no longer assert status, does that whole class of check **disappear**? Assess — this may be a case where better design *removes* the need for an automation rather than enabling one.
- **Derivations (automations that aren't gates):** generating the human TODO view/projection; computing **retirement eligibility** (terminal state + settled + aged → eligible for batched compaction/tombstoning); staleness/age (commit-distance, as the doc-graph does). Note these as schema-enabled automations distinct from gates.

## Read on disk (end to end — this project treats partial reading of a cited doc as an ADR-0002 violation)

- `docs/archive/notes/design/work-status-ssot-plan.md` — the original design note. NOTE: partly superseded (see "current thinking" below); read for its manifest/projection/validator framing and schema sketch.
- `docs/notes/consult/opus-consult-2026-06-02-work-status-ssot-plan.md` — the FIRST firewall on this design; especially its "validator falls out for free" analysis and its "a check between two hand-maintained artifacts is not ground-truth validation" argument. Your question is partly: which automations survive that critique.
- `docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md` — the origin. G1 (lint), G4 (checklist), G5 (SSOT), and especially **G6** (semantic-staleness: "low precision, never a gate") and Lapse 2 (the shipped-but-documented-open failure any ground-truth automation is ultimately trying to catch). Finding 2e (commit-freshness ≠ semantic truth) is directly on point.
- `docs/archive/notes/design/documentation-graph-artifact-plan.md`, `docs/doc-graph.md`, `tools/doc-graph/generate.mjs` (skim), `.github/workflows/doc-graph-ci.yml` — the EXISTING precedent: a Node generator + a structure-only CI freshness gate + a dangling-reference validator. Mine it for which check-kinds already work here and which transfer to a work-status schema.
- `docs/adr/0002-fail-loudly.md` — the loudness hierarchy (compile/build/CI rank highest; closed-vocabulary fail-loud). The frame for "is a gate appropriate here."
- `docs/TODO.md` and `docs/notes/deferred-items.md` — the ACTUAL items. Ground the analysis in real data: the RB-1/2/3 nested sub-items (each with own status), the "30c pairs with 30d, do 30d first" dependency, the `~~strikethrough~~ *(shipped PR#N)*` markers, supersession cases. Use these to test whether a proposed check would actually fire usefully on real items.

## Current thinking (not all on disk — conveyed so you're not anchored to the superseded note)

- The SSOT is a **single authored structured file** that IS the source of truth (the "consolidation" — the three status-bearing prose docs merge their status into it and stop asserting it independently). It is both machine- and human-readable (JSON, possibly tidied via jq-style tooling — tooling that reads/formats the one source is fine; a second authored artifact is not).
- Ontology-grounded shape under consideration (assume this and pressure-test it): **two-field `state`(open/closed) + `resolution`**; **faceted** independent fields (status/scope/tier); **typed, directional inter-item relations** (parent/subtask = hierarchy/forest; depends-on/blocks = a strict partial order that must be a **DAG**; supersedes/duplicates = a deprecation pointer); an **opaque, stable id** (status is anti-rigid, so NOT encoded in the id); **closed-but-amendable** controlled vocabularies (unknown value = error; amend the set deliberately); **retirement = tombstone + batched compaction** (terminal+settled items' bodies move to an archive store, leaving a stub so references resolve).
- The maintainer is NOT asking you to redesign this; they ask specifically: **what automation/CI value does fixing this schema unlock, and how should that feedback shape the fields/relations/typing** — knowing the automatable benefit might be small, which is fine.

## Deliverable

A least-regret, honestly-rated account: the enumerated automations (each: what / gate-vs-advisory / value / feasibility / required-schema-feature), ranked, and the synthesized feedback into schema shape (which features pay for themselves in checks; which unlock nothing). Be willing to conclude the valuable hard-gate set is a thin sliver. Mark every load-bearing claim **verified** (repo read) vs **asserted** (reasoning). Web search is allowed if useful (e.g., what JSON Schema / CUE can and cannot express, or how real trackers gate), but the core is reasoning about THIS codebase. WRITE your verbatim assessment to `docs/notes/consult/opus-consult-2026-06-02-work-status-ci-gates.md` — self-contained, markdown, bottom-line-up-front, verified-vs-asserted marked, matching the structure/tone of the prior consult records (see `docs/notes/consult/opus-consult-2026-06-01-neverthrow-overhaul.md` and `docs/notes/consult/opus-consult-2026-06-02-work-status-ssot-plan.md`). Open with a short framing paragraph (what this is — an analytic-firewall consult on the CI/automation value of a fixed work-status schema — its provenance, and the "saved verbatim for auditability / License: Public Domain (The Unlicense)" convention). END with an "## Appendix — verbatim prompt" section containing this ENTIRE brief in a fenced block, plus a `License: Public Domain (The Unlicense).` line. Do NOT run git or modify any other file; just write that one record. Return a short bottom-line summary to me.
````

License: Public Domain (The Unlicense).
