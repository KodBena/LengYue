# Work-status SSOT — design note

Status: draft — a roadmap/spec for maintainer sign-off **before** any
code. Captured 2026-06-02 at the maintainer's request, acting on the
`docs/notes/deferred-items.md` "ADR-effectiveness audits" entry's
**Maintainer decision (2026-06-01)** and on guard **G5** of
`docs/notes/rca-discipline-lapses-2026-06-01.md`. This note is a sibling
to `docs/notes/documentation-graph-artifact-plan.md` (the doc-graph
artifact's design note); the relationship — and the one load-bearing way
this artifact *differs* from that one — is worked out in §The framing and
§Relation. Nothing below is implemented; this is the contract-and-types
step the authoring posture asks for before glue.

## The decision this implements (not re-litigated here)

The maintainer settled the shape on 2026-06-01. Quoting the
`deferred-items.md` entry verbatim so the design is anchored to the
decision, not a paraphrase of it:

> consolidate the three status-bearing docs (this ledger, `TODO.md`,
> `handoff-current.md`) onto a single machine-readable work-status SSOT
> that `TODO.md` *projects* from (RCA guard G5; the doc-graph's
> manifest-first shape), with a forward-compatible best-effort schema
> since future items are unknown-unknowns.

That resolves RCA open-question #3 ("overload `TODO.md`, or a thin
dedicated status surface?") in favour of a **separate** machine-readable
manifest — not an overloaded `TODO.md`. This note designs *that manifest
and its projections*; it does not reopen the choice. The broader
consolidation the same entry flags (doc retirement, taxonomy, a
`docs/notes/` hierarchy, a mandated reorganization discipline) is a
separate, explicitly-deferred arc and is out of scope here.

## The thought

Lapse 2 of the RCA was a shipped feature (`AnalysisTabsEditor.vue` et al.,
PRs #301/#302/#304) that stayed documented as **open** for two days — in
`TODO.md` as a Future project and in `deferred-items.md` as a "future
want", and *absent* from `handoff-current.md`. The RCA's Finding 2d names
the root: **work-status is duplicated across three independently-editable
prose docs with no single source of truth** — an ADR-0005 Rule 1
violation, applied to *status* rather than to item *numbers* (the
generalization Rule 1 was never drawn to). Three docs can each assert
"open" and nothing reconciles them against the code.

The same drift is visible right now on a *fourth* axis: `handoff-current.md`
and the umbrella `CLAUDE.md` both assert the proxy pin is **v1.0.21**, but
`HEAD` pins **v1.0.27** — prose status, drifted from reality, on one of the
three target docs. The class is general; the fix has to be structural, not
another careful re-read.

The fix (G5): one document owns "open vs shipped vs deferred" for each
piece of work, and the others *delegate* status to it — they keep the
ability to **describe** work, lose the ability to **independently assert**
its open/shipped state (ADR-0005 Rule 3: "describe relations, not content
snapshots"). The maintainer's chosen owner is a machine-readable manifest,
mirroring the doc-graph's `docs/doc-graph.json` → `docs/doc-graph.md`
manifest-first shape.

## The framing (the load-bearing idea: a generation-direction inversion)

The doc-graph artifact and this one are both "manifest-first" — the
machine-readable data is the SoT, the human-readable view is a projection
of it. But they invert on *which direction the manifest is generated*, and
that inversion drives almost every downstream decision here:

- **Doc-graph:** the **docs are the SoT**; the manifest (`doc-graph.json`)
  is **derived** from them by a generator (git `log` + prose-scan). The
  manifest is *downstream* — a cache. The discipline plan states the rule
  exactly: "a *cache* of the metadata, regenerable from source. If it
  disagrees with frontmatter, frontmatter wins."
- **Work-status:** the **manifest is the authored SoT**; `TODO.md` (and
  the status assertions in `deferred-items.md` / `handoff-current.md`) are
  **derived** from *it*. The manifest is *upstream* — there is no source to
  regenerate it from, because "is this work shipped?" is an **editorial
  fact a human asserts**, not a value computable from the tree (contrast
  commit-distance, which git supplies for free).

Two consequences fall directly out of the inversion, and they are the
spine of this design:

1. **The CI gate is a *consistency* check, not a *regeneration* check.**
   The doc-graph CI runs `generate.mjs --check` and fails iff a fresh
   *regeneration* drifts from the committed artifact — it can do that
   because the manifest is recomputable. Here, nothing recomputes the
   manifest. So the gate instead verifies that **the prose docs do not
   contradict the manifest**: every `~~strikethrough~~ *(shipped)*`
   marker, every "Future project" placement, every handoff "is shipped /
   in progress" assertion must agree with the manifest's status for that
   item, or CI fails. This *is* G4 (retire-on-ship) and G5 (single SoT)
   mechanized — the narrow mechanizable slice the RCA's G6 gestured at, but
   grounded in an **authored** SoT instead of G6's filename-existence
   heuristic, so it is a check, not a guess.

2. **The validator falls out for free — and it's the rent-payer.** The
   doc-graph design's load-bearing observation is that once edges carry
   `resolved: bool`, "the same manifest that draws the graph *is* a
   doc-link validator." The dual here: once each manifest item carries a
   `status` and a list of source `refs`, the same manifest that projects
   `TODO.md` **is a status-consistency validator** — it flags (a) any prose
   doc asserting a status that disagrees with the manifest (the
   reconciliation gate above), and (b) the exact Lapse-2 signature: an item
   marked `open` whose named source path now *exists* on `main`. The
   picture (a tidy `TODO.md`) is the nicety; the consistency report is the
   thing that pays rent.

## What the manifest carries (the schema)

The RCA's open-question #3 noted a status SSOT "arguably wants to be terse
and tabular." It should. One record per work item; the **required core is
tiny** and everything else is optional, per the "forward-compatible
best-effort schema, future items are unknown-unknowns" instruction.

Proposed shape (JSON shown for parity with `doc-graph.json`; the
JSON-vs-authored-format fork is in §Design-space — it matters *more* here
than there, precisely because this manifest is hand-edited):

```json
{
  "schema_version": 1,
  "statuses": ["open", "scheduled", "in-progress", "shipped", "deferred", "superseded"],
  "items": [
    {
      "id": "analysis-tab-customisable-subtabs",
      "title": "Analysis tab — user-customisable sub-tabs binding chart components",
      "status": "shipped",
      "scope": "frontend",
      "tier": "future",
      "shipped": { "date": "2026-05-29", "refs": ["PR#301", "PR#302", "PR#304"] },
      "trigger": null,
      "refs": [
        { "kind": "worklog",        "path": "docs/worklog/..." },
        { "kind": "deferred-entry", "path": "docs/notes/deferred-items.md#analysis-chart-layout-affordance" },
        { "kind": "source",         "path": "frontend/src/components/editors/AnalysisTabsEditor.vue" }
      ],
      "home": "docs/TODO.md",
      "legacy_number": null
    }
  ]
}
```

Field-by-field, with the design judgment that picked each:

- **`id` — stable kebab slug, the one piece the project lacks today.**
  Work items are currently keyed by their *prose title* (mutable) or an
  abandoned `item N` scheme (27, 30c/30d, 32, 34/34a/34b — inconsistent,
  dropped for newer items). The slug is assigned at creation, **never
  re-derived from the title**, so retitling/reordering doesn't break the
  cross-references the manifest accumulates. (Same reasoning the doc-graph
  uses `path` as a stable node key — work items need an analogue, and the
  title isn't it.) `legacy_number` preserves continuity for the handful of
  numbered items without resurrecting the scheme.
- **`status` — a closed-but-amendable vocabulary.** This is the ADR-0008
  decision point: a closed set, and an *unknown* status is a loud error
  (fail-loudly on a closed vocabulary), but the set is **amendable** — a
  new status is a one-line edit to `statuses`, exactly as the discipline
  plan's genre enum is "closed; new genres require an amendment." This is
  how "forward-compatible" and "fail-loudly on a closed set" reconcile:
  amend the vocabulary, never fuzzy-match into it. Proposed initial set
  above; the `deferred` / `superseded` members let the manifest absorb what
  `deferred-items.md`'s Closed section and `decisions-deferred.md`'s
  revisit-outcomes express today.
- **`scope`** — `frontend` | `backend` | `both` | `proxy` | `umbrella`.
  TODO.md's `[frontend]/[backend]/[both]` tags, plus `proxy`/`umbrella` the
  prose already needs.
- **`tier`** — `small` | `medium` | `large` | `future`, optional. TODO's
  complexity-ordering axis; null for items that don't live in TODO.
- **`shipped`** — `{date, refs[]}` when `status: shipped`. Replaces the
  informal `*(shipped 2026-05-29)*` / PR-number prose with structured
  fields the projection re-renders and the validator can check against git.
- **`trigger`** — the "when do we pick this up" line TODO uses heavily;
  free text, optional.
- **`refs` — typed cross-references**, mirroring the doc-graph's typed
  edges (`kind`: `worklog` | `design-note` | `deferred-entry` | `dispatch`
  | `adr` | `source` | …). The `source` kind is what powers the Lapse-2
  validator: an `open` item with a `source` ref that resolves on `main` is
  flagged.
- **`home`** — which doc currently *describes* the item in prose (so the
  projection knows where the rich body lives and the delegation is
  explicit). Usually `docs/TODO.md` or `docs/notes/deferred-items.md`.

**What does NOT go in the manifest:** the rich prose — design questions,
rationale, the multi-paragraph bodies like the Chess-clone breakdown or the
content-addressed-identity investigation. That prose is *content*, not
*status*; it stays in `TODO.md` / `deferred-items.md` (or, over time,
migrates to design notes). Putting markdown bodies inside JSON strings is
the anti-pattern that would make the SSOT unmaintainable. The manifest owns
**status and its scaffolding**; the prose docs own **the thinking**.

## The projection mechanism (the real fork)

"`TODO.md` *projects* from" the manifest is the decision; *how much* of
`TODO.md` is generated is the open engineering fork, because `TODO.md`
carries irreducible hand-authored prose. Three points on the spectrum:

- **P1 — full generation.** `TODO.md` is generated wholesale; all prose
  lives in the manifest or migrates out to design notes. Cleanest literal
  reading of "projects from"; **highest migration cost**; reintroduces the
  markdown-in-JSON anti-pattern unless the prose first moves to notes. Not
  recommended for v1.
- **P2 — hybrid generation (recommended).** The **status scaffolding** is
  generated between explicit `<!-- work-status:begin -->` / `:end` markers —
  the section placement (Active-by-tier / Future / Completed), the
  `~~strikethrough~~ *(shipped …)*` markers, the scope tag, the trigger
  line, the ref links — while the **prose body of each item stays
  hand-authored** beneath its generated header. This is the
  `doc-graph.md`-style "generated regions in a human doc" pattern; it
  honours "projects from" for the *status view* without a risky wholesale
  prose migration, and it composes with ADR-0004 (the generator only ever
  rewrites between its own markers).
- **P3 — checker-only.** No generation; `TODO.md`/`deferred`/`handoff` stay
  fully hand-authored and a `--check` validator fails CI on any status that
  contradicts the manifest. Lowest cost, delivers the root-cause
  reconciliation, but `TODO.md` is then "reconciled-with" rather than
  "projected-from" — slightly weaker than the decision's wording.

**Recommendation: ship P3's checker first, then P2's generated status
view, in that order.** The checker *is* the root-cause fix (it makes the
three docs incapable of silently disagreeing with the SoT), and it's
valuable even before a single line of `TODO.md` is generated. The generated
status view (P2) is then a strict improvement layered on a working gate,
not a prerequisite for it. Where the generated view lives — a block inside
`TODO.md` vs. a thin sibling `docs/work-status.md` that `TODO.md` links to —
is a reversible sub-choice (§Design-space); `doc-graph.md` is the precedent
for a thin generated index, and a thin `work-status.md` keeps `TODO.md`'s
prose hand-edited and uncluttered.

## The genre boundary (G5's caveat, drawn explicitly)

G5's hard part, in its own words: "delegate all status to `TODO.md` must
not strip the others of the ability to *describe* work, only of the ability
to independently assert its *open/shipped state*." The boundary, per the
discipline plan's genre classification:

- **`docs/TODO.md`** (`living-doc`) — the **scheduling** projection: what's
  queued, by tier, with triggers. Hosts the generated status view (P2).
- **`docs/notes/deferred-items.md`** (`live-ledger`) — working-memory
  offload. Keeps describing items; its open/closed *markers* delegate to
  the manifest (the validator enforces agreement). Its rich design prose
  stays.
- **`docs/handoff-current.md`** (`living-doc`) — orientation. Keeps
  describing surfaces; its "is shipped / in progress" *assertions* delegate
  to the manifest. (This is also where the v1.0.21-vs-v1.0.27 pin drift
  gets a structural home — though note a *pin value* is a fact, not a work
  item, so see open-question Q4 on whether such facts belong in this
  manifest or only motivate a sibling check.)
- **`docs/notes/decisions-deferred.md`** (`live-ledger`) — **out of scope.**
  It tracks *decisions against action* with revisit-triggers, not
  work-status; its entries have their own "edited-not-removed, outcome
  recorded on revisit" lifecycle. A `deferred` work item (something queued
  but not now) is distinct from a *deferred decision* (something chosen
  against). The manifest is for the former; the line is worth stating so a
  future author doesn't fold the two.

This is the precise sense in which the work-status SSOT is the **per-item
layer the frontmatter-substrate plan deliberately left open**: that plan's
`live-ledger` genre carries a single doc-level status (`active`) and says
"entries within carry their own state." It never modelled the per-entry
state — by design. This manifest is exactly that per-entry layer; the two
are orthogonal (per-*document* metadata vs. per-*work-item* status), and
neither blocks the other (§Relation).

## Design-space survey — is it flat?

Following the doc-graph note's discipline of naming the few forks that
aren't flat rather than padding:

1. **Manifest-first vs. doc-first is *forced*, not chosen** — the decision
   already made it (manifest-first). Not a fork.
2. **The generation-direction inversion is the real structural fact**, and
   it's *not* a choice either — it's forced by "work-status is editorial,
   not computable." Its consequence (consistency-check, not regeneration)
   is the one thing a reader most needs to internalize.
3. **Identity scheme is a real fork** (slug vs. resurrected `item N`
   integers vs. content-hash). Recommended: stable kebab slug + optional
   `legacy_number`. Real because the project genuinely lacks a stable
   work-item key today.
4. **Projection mechanism (P1/P2/P3) is the real engineering fork** —
   addressed above; recommend P3-then-P2.
5. **Manifest file format (JSON vs. YAML/TOML) matters *more here than for
   the doc-graph*, because of the inversion.** `doc-graph.json` is
   *generated*, so JSON's hand-edit hostility never bites. This manifest is
   *hand-authored*, so authoring ergonomics (comments, no comma/quote noise)
   favour YAML/TOML. Against that: the doc-graph generator is zero-dep Node,
   and JSON is the only zero-dep-parseable option (YAML/TOML need a parser
   dep or a hand-roll). Genuine tension; reversible; lean JSON for zero-dep
   parity unless the hand-authoring friction proves real, in which case a
   single small YAML dep is justified. Flagged, not pre-decided.
6. **Where the generated view lives** (block-in-`TODO.md` vs. sibling
   `work-status.md`) — flat/reversible; lean sibling.

Everything else — the exact `kind` enumeration for `refs`, the colour of
nothing (there's no heatmap here), the precise status spellings — is flat:
pick a reasonable option and move on.

## Blind-spots — things to get right

- **The migration is a bounded one-time sweep, and it's the bulk of the
  work.** Populating the manifest means walking the *current* live items in
  `TODO.md` (Active + Future), `deferred-items.md` (Open + Closed), and the
  status assertions in `handoff-current.md`, assigning each a slug and a
  status, and de-duplicating items that appear in more than one doc (the
  analysis-tab item is the worked example — it's in all three). Estimate:
  comparable to the discipline plan's "1–2 focused sessions" sweep. Scope it
  in the design; schedule it separately.
- **The CI gate's trigger set and failure mode.** It mirrors
  `doc-graph-ci.yml` (single-maintainer rationale, runs on `docs/**` +
  `CLAUDE.md` changes), but its *check* is the consistency check, not a
  regeneration diff. Like the doc-graph's broken-link report, the
  **existence**-based half (open-item-whose-source-exists) should be an
  *advisory report the maintainer reviews*, never a hard gate — it's a
  heuristic and would false-positive (a file exists but the capability
  doesn't). The **contradiction** half (prose marker disagrees with
  manifest) *can* be a hard gate — it's exact, not heuristic.
- **Forward-compatibility means tolerate-unknown-shape, not
  tolerate-unknown-status.** New *fields* on an item (things we can't
  foresee) are tolerated/ignored by old tooling — that's the "best-effort"
  in the instruction. New *status values* are the opposite: the closed
  vocabulary fails loud on an unknown member (amend the enum instead).
  Keeping those two straight is the schema's main correctness obligation.
- **Don't let the manifest become a second prose store.** The discipline is
  status-fields-only; the moment someone is tempted to paste a paragraph
  into a field, that paragraph belongs in a doc the manifest `refs`. (This
  is the same self-discipline `doc-graph.json` keeps by storing only
  bucket+dates, never bodies.)
- **The doc-graph itself must be regenerated when this lands.** Adding
  `work-status.json` + `work-status.md` + this note + the `tools/` generator
  is a *structural* doc-graph change (new nodes, new edges), so the landing
  PR must run `node tools/doc-graph/generate.mjs` or `doc-graph-ci` fails —
  the umbrella "Documentation is part of the work" rule applied to this
  arc's own delivery.

## Feasibility verdict

**Doable; the tooling is the easy part.** A zero-dep Node generator/checker
in the mould of `tools/doc-graph/generate.mjs` (read manifest → reconcile
against the three docs' markers → emit the P2 status view + the consistency
report; `--check` for CI) is a small program. The real work is twofold and
both halves are editorial, not technical: (1) the **schema freeze** (this
note, pending sign-off), and (2) the **one-time migration sweep** that
populates the manifest from the current three docs and rewires their status
markers to delegate. The subproject, sequenced:

1. Freeze the schema (`id` scheme, status vocabulary, `refs` kinds,
   file format) — *this note, for sign-off*.
2. Write the migration: enumerate live items across the three docs, slug +
   status each, de-dup cross-doc items.
3. Write the generator/checker: emit the P2 view + the consistency report;
   `--check` mode for CI.
4. Wire the consistency gate into CI (contradiction half = hard gate;
   existence half = advisory report), mirroring `doc-graph-ci.yml`.
5. Regenerate the doc-graph in the landing PR (structural change).

Steps (1)–(2) deliver the root-cause fix (one reconciled SoT) before any
projection is generated — the same "validator before picture" ordering the
doc-graph note recommends.

## Relation

- **`docs/notes/documentation-graph-artifact-plan.md`** — the sibling
  manifest-first artifact this one is modelled on. Shared posture
  (machine-readable SoT, human view is a projection, committed +
  CI-verified, single-maintainer rationale); the one divergence is the
  generation-direction inversion (§The framing) — that manifest is
  *derived* from docs, this one is *authored* and docs derive from it,
  which is why this one's CI gate is a consistency check rather than a
  regeneration diff.
- **`docs/notes/doc-graph-discipline-plan.md`** (`status: draft`) — the
  *per-document* metadata layer. Orthogonal: it governs each doc's genre /
  doc-level status / `references` in YAML frontmatter; this manifest governs
  each *work item*'s status. Its `live-ledger` genre's "entries within carry
  their own state" is the seam this fills. They compose and neither blocks
  the other; if that plan ever ratifies, a doc's frontmatter and this
  manifest stay distinct SoTs for distinct things. (Aside: that plan
  proposes its discipline as "ADR-0008", a slot since taken by Classification
  Discipline — a stale internal reference, noted but not this arc's to fix.)
- **`docs/notes/rca-discipline-lapses-2026-06-01.md`** — the origin. This
  implements **G5** (single work-status SSOT) and mechanizes **G4**
  (retire-on-ship) as the consistency gate; it realizes the **G6** "narrow
  mechanizable slice" *correctly* by grounding the open-item-vs-source check
  in an authored SoT rather than G6's filename heuristic. Its Finding 2d
  (status duplicated across three unreconciled docs) is the defect removed;
  its Section 3 common-shape ("invisible-at-authoring, visible-only-in-
  aggregate, policy-not-mechanism") is the class the gate converts from
  policy to mechanism.
- **`docs/adr/0005-documentation-discipline.md`** — Rule 1 (SSOT per handle)
  generalized from item *numbers* to *work-status*; Rule 3 (relations, not
  content snapshots) is exactly what the delegating docs do once their
  status markers point at the manifest.
- **`docs/adr/0008-classification-discipline.md`** — the closed-but-amendable
  status vocabulary is its positive register: refuse a fuzzy/unknown status,
  amend the closed set instead.
- **The umbrella "Documentation is part of the work" rule** — the manifest
  *is* the mechanical form of that rule's "Does `docs/TODO.md` need updating
  to mark items complete?" audit prompt; retire-on-ship stops depending on
  one person's memory firing.

## Open questions (genuinely open — for the maintainer)

1. **Projection depth for v1.** P3-then-P2 is recommended, but is the
   checker-only first cut acceptable as the v1 deliverable (root-cause fix,
   no generated `TODO.md` yet), or does "projects from" mean the generated
   view must ship in the same arc?
2. **Manifest file format.** JSON (zero-dep parity with `doc-graph.json`) or
   a hand-authoring-friendly YAML/TOML (worth a small parser dep, given this
   manifest is hand-edited)? §Design-space fork 5.
3. **Generated-view location.** A generated block inside `TODO.md`, or a
   thin sibling `docs/work-status.md` that `TODO.md` links to?
4. **Do non-work *facts* belong here?** The proxy-pin drift is a status-like
   drift but not a *work item*. Does the manifest stay strictly work-items,
   with doc-fact drift left to a separate (or no) mechanism — or is there a
   thin "asserted facts with a checkable source" extension? Recommend
   strictly work-items for v1; flagged because the pin drift is a live
   instance of the same shape.
5. **RCA open-question #5 (does the recurrence warrant a tenet) is upstream
   of this note**, not settled by it. This artifact is per-surface
   mechanization; whether the cross-cutting "mechanize the aggregate-only
   defect" shape deserves its own tenet is the maintainer's call and the
   ADR-effectiveness-audit item is the vehicle if so.

## License

Public Domain (The Unlicense).
