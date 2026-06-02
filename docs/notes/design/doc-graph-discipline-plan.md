---
genre: design-note
note_type: feature-plan
status: draft
created: 2026-04-27
last_reviewed: 2026-04-27
references:
  - docs/adr/0005-documentation-discipline.md
  - docs/rfcs/0001-adr-meta-review.md
  - docs/notes/auditor-notes.md
  - docs/notes/decisions-deferred.md
---

# Plan: documentation graph liveness and navigability

Drafted following an audit-pass meta-scope on documentation-graph
opacity, requested mid-session on 2026-04-27. The plan is `draft`
until ratified; on ratification it transitions to `accepted` and
triggers a one-time back-catalog sweep plus drafting of a new ADR
(proposed slot ADR-0008) carrying the discipline.

Two evaluation metrics throughout: **opacity** (can a fresh reader
determine a doc's role and current relevance without reading the
body?) and **efficiency** (does the substrate let an LLM allocate
attention well without burning context on classification?). Each
section traces back to one or both.

## Goals and non-goals

**Goals.**

- Make every doc's genre, status, and reading priority
  *mechanically visible* without reading the body.
- Reduce the "should I read this?" coin flip to a one-line answer
  per doc.
- Provide a forward authoring discipline that prevents new docs
  from re-introducing the same opacity.
- Migrate the back-catalog as a bounded one-time sweep.

**Non-goals.**

- Tooling beyond markdown frontmatter and an optional generator
  script.
- Reorganization of `adr/`, `notes/`, `playbooks/`, `rfcs/`, or
  `archive/` — they already partition by genre.
- Coverage of `proxy/` (out of scope per the same exemption
  RFC-0001 takes).
- Coverage of `CLAUDE.md` files outside `docs/` (logged below for
  separate revisit).

## 1. Genre vocabulary — closed enumeration

Ten genres. New genres require an amendment to the ADR carrying
this discipline. Each genre has a single canonical lifecycle.

| Genre | What it is |
|---|---|
| `adr` | Architectural record; sub-typed `tenet` or `decision` via `adr_type`. |
| `rfc` | Proposal under review; resolves to acceptance, rejection, or withdrawal. |
| `design-note` | Forward-looking blueprint or system description; sub-typed via `note_type` (`system`, `feature-plan`, `spec`). |
| `retrospective` | Closure-event reflection; frozen on authoring, addenda allowed. |
| `live-ledger` | Append-only ledger; entries close in place (auditor-notes, deferred-items, decisions-deferred, frontend-backlog). |
| `dispatch-entry` | Cross-team request, tracked through closure. |
| `worklog-entry` | Execution record; frozen on completion. |
| `playbook` | Procedural sequence; one-shot or recurring. |
| `living-doc` | Continuously updated SoT (handoff-current, TODO, README, adr-synopsis, directory READMEs). |
| `archive` | Frozen historical artifact. |

Sub-fields preserve meaningful distinctions inside genres without
expanding the top-level enumeration. **Closed enumeration** is the
choice (vs. open-ended) because the LLM-classification benefit
dominates the governance cost — the codebase has produced exactly
these ten in two years; the rate of new-genre invention is low.

## 2. Status vocabulary — per genre

Per-genre states; combinations not listed are illegitimate.

| Genre | States |
|---|---|
| `adr` | `proposed`, `accepted`, `superseded`, `retired` |
| `rfc` | `draft`, `accepted`, `rejected`, `withdrawn` |
| `design-note` | `draft`, `accepted`, `implemented`, `obsolete` |
| `retrospective` | `published` |
| `live-ledger` | `active` (the file is active; entries within carry their own state) |
| `dispatch-entry` | `open`, `closed`, `superseded` |
| `worklog-entry` | `in-flight`, `executed`, `superseded` |
| `playbook` | `draft`, `executing`, `executed`, `obsolete` |
| `living-doc` | `current` (the only legitimate state) |
| `archive` | `frozen` |

State-per-genre rather than universal vocabulary because illegitimate
combinations would be visible noise in the metadata.

## 3. Substrate — YAML frontmatter

Frontmatter is the single source of truth for status, genre, dates,
and cross-references. Prose may echo a status line for humans; if
prose disagrees with frontmatter, frontmatter wins (per ADR-0005
Rule 1, with frontmatter as the canonical handle).

**Required fields:**

```yaml
---
genre: adr
status: accepted
created: 2026-04-26
last_reviewed: 2026-04-27
---
```

**Conditional fields:**

- `adr_type` (`tenet` | `decision`) — required for `adr`.
- `note_type` (`system` | `feature-plan` | `spec`) — required for
  `design-note`.
- `subproject` (`umbrella` | `frontend` | `backend`) — required for
  `worklog-entry`; optional elsewhere when scope matters.
- `closed`, `closes` — required when `dispatch-entry` reaches
  `closed`.
- `supersedes`, `superseded_by` — when applicable.
- `references` — list of related docs (loose link, no semantic
  obligation).

**Why YAML not prose-headers.** YAML is universally LLM-tokenized,
structurally greppable (`grep '^status: open' docs/dispatch/*`),
and survives without a parser. The boilerplate cost is ~5 lines
per file. Existing prose headers (`- **Status:** ...`) can stay or
be retired; the YAML block lives above them and dominates as the
canonical source.

## 4. Directory structure

Dispatch is primarily for LLMs (LLM-coordination across
sub-projects, not a human-skim destination); flat is fine. Worklog
by sub-project is the only structural change.

**Changes:**

- `docs/worklog/` → `docs/worklog/{frontend, backend, umbrella}/`.
  Sessions are scoped to a sub-project per `CLAUDE.md`; the
  directory should reflect that. Existing entries move into
  `frontend/`.
- `docs/dispatch/` stays flat. Filenames already encode the
  sub-project roles.

**No changes** to `adr/`, `notes/`, `playbooks/`, `rfcs/`,
`archive/`, `handoff/archive/`.

## 5. Generated index

`docs/INDEX.md` — single-file overview of every doc, grouped by
genre and status. **Optional generator script** reads frontmatter
and produces the index; in v1, hand-maintenance is acceptable at
~35 entries.

The index is a *cache* of the metadata, regenerable from source.
If it disagrees with frontmatter, frontmatter wins. This preserves
ADR-0005 Rule 1 against the "parallel SoT" risk.

The index serves the LLM-orientation question directly: a fresh
session reads `INDEX.md` and learns the graph in one read, then
drills in by task. It also makes the inverse skim ("what's open?",
"what's superseded?", "what's living?") trivial for human
reviewers.

## 6. Migration — one-time sweep

A sweep is warranted; scheduling is deferred. The plan commits the
sweep's shape so the schedule decision is purely about timing.

**Scope.** Every file under `docs/`, plus `backend/docs/tree-dsl.md`
(the sole sub-project doc). `archive/` content gets `genre: archive`,
`status: frozen` headers but no further classification work.

**Cost per file.**

- Genre classification — deterministic from prose.
- Status — deterministic from existing status headers; trivial
  inference otherwise.
- `created` from git log; `last_reviewed` set to sweep date.
- Cross-references where obvious.

Estimate: 1–2 focused sessions, depending on whether the generator
script is written in v1.

**Scheduling — three candidate triggers:**

1. Before the next release-readiness milestone (couples with that
   gate).
2. Coupled with the first audit pass per RFC-0001 (if accepted).
3. Standalone slot in a calm umbrella window.

Lean (1) or (3); (2) creates an unnecessary dependency. Picking
the trigger is the user's call.

## 7. Authoring discipline going forward

Per ADR-0005 Rule 6 (author as you decide):

- **At creation.** New doc requires frontmatter with `genre`,
  `status` (initial state per Section 2), `created`,
  `last_reviewed`. Conditional fields populated as applicable.
- **At state transitions.** When a dispatch closes, an RFC accepts,
  an ADR is superseded, a worklog entry executes — frontmatter
  updates *at that moment*, with the corresponding date field.
  Not retroactively swept.
- **At cross-reference.** When document A explicitly references B
  (in the ADR-0005 Rule 3 sense), A's `references` field includes
  B. This makes cross-references mechanically queryable for the
  doc-graph integrity check (RFC-0001 open question 6, addressed
  below).
- **For new authoring.** A frontmatter block is required at file
  creation. "I'll add it later" is wrong by default — the cost is
  small enough that deferring is itself the failure mode this plan
  addresses.

## 8. Where the discipline lands

A new ADR — proposed slot **ADR-0008** (or whatever number is next
when this lands). The discipline is structurally a *tenet*:
cross-cutting, durable, retrofittable.

**Not** an amendment to ADR-0005. ADR-0005 codifies seven prose
rules about authoring discipline; the metadata-and-genre framework
is structurally distinct (it adds a substrate, not a rule).
Folding into ADR-0005 would dilute both.

## 9. Relationship to RFC-0001

Independent. They benefit from each other:

- An audit pass can verify frontmatter coverage as one mechanical
  signal.
- The audit ledger (per RFC-0001's `docs/audits/`) is a new doc
  shape that fits naturally as a `live-ledger` or new genre under
  this plan's enumeration.
- This plan addresses RFC-0001 open question 6 (doc-graph integrity
  check) directly: structured `references` / `supersedes` /
  `superseded_by` fields are graph-walkable.

But neither blocks the other. If both accept, they sequence as
0008 / 0009 in order of acceptance.

## 10. Tooling — frontmatter + optional generator; no DB

Restated. **No relational DB or external store**. Frontmatter is
the SoT; an optional script produces `INDEX.md`.

**Trigger conditions to revisit:**

- Doc graph exceeds ~100 files, or any directory accumulates
  twenty-plus heterogeneous entries.
- Cross-document audit becomes a recurring operation under
  RFC-0001 (multiple passes per year).
- Multi-contributor or multi-LLM coordination on doc-graph state
  requires conflict detection.
- A web-shaped doc-graph viewer becomes a real product surface.

Naming the triggers means the decision can be reopened cleanly
when warranted, rather than re-litigated by inertia. None hold
today.

**On LLM efficiency specifically.** An LLM's marginal cost of
"skim 30 doc headers" is dramatically lower than "make 30 tool
calls against a DB." For graphs at this scale, plain text wins on
efficiency too; the DB advantage only kicks in when the graph
exceeds an LLM's working set. The Pareto answer for this codebase
is the simplest substrate that exposes the metadata, not the most
powerful one.

## 11. Unresolved questions — logged for return

Where resolution wasn't possible, the question is logged here with
a recommended provisional answer (italicized) and a trigger for
revisitation:

1. **Per-sub-project docs (`backend/docs/`, future
   `frontend/docs/`).** *Provisional: yes — the discipline applies
   symmetrically. Sub-project-internal docs adopt frontmatter with
   `subproject:` set.* Trigger: when a sub-project adds its second
   internal doc, the question becomes concrete.

2. **`CLAUDE.md` files outside `docs/`.** *Provisional: out of
   scope. They are harness instructions to the assistant, not
   project documentation; their lifecycle differs (they're
   maintained against assistant behavior, not against project
   state).* Trigger: any move to standardize harness-instruction
   artifacts across the umbrella.

3. **Mutability of frozen state.** *Provisional: body content
   frozen on transition to a terminal state (`executed`,
   `published`, `frozen`, `superseded`); annotations allowed via
   clearly-marked addendum sections (e.g., `## Annotation
   2026-MM-DD: …`). This matches the `audit-reflections.md`
   "audit-LLM observation overturned 2026-MM-DD" pattern already
   in use.* Trigger: first time someone wants to edit a frozen
   doc.

Recommended filing destination for these three: append to
`docs/notes/decisions-deferred.md`, each as a "considered,
provisional answer recorded, revisit trigger named" entry per
that file's existing pattern. The cluster fits comfortably; no
new ledger needed.
