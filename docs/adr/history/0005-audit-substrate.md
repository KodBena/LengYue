Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
`law/adr/0005-documentation-discipline.md` at commit `ff691bb` under
`design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
retro-edited; the lessons these records teach live as rules in the parent ADR,
[`law/adr/0005-documentation-discipline.md`](../0005-documentation-discipline.md).

Each section below is the original, unedited prose from the pre-refactor ADR-0005,
naming which rule (or which non-rule section) it was extracted from. Section order
matches the order the material appeared in the source file.

## Context

chocofarm is a fast-moving research scratch project with an extensive `docs/`
corpus, and the 2026-06-15 architectural audit (`docs/notes/audit/`)
surfaced documentation rot and drift patterns that share a common root:
**documentation written reactively, after-the-fact, or without an explicit
lifecycle decays into low-trust artifacts faster than the code decays around
it.** The audit names several concrete instances:

- **A doc written to cure staleness that was stale in 24 seconds.** The
  2026-06-15 handoff listed a `train_value.py` docstring fix as "pending";
  git shows that exact fix committed 24 seconds later (audit §9, L10). A live
  task queue narrated in immutable prose is stale before it is read.
- **A binding convention with no definition.** `ADR-0002` was cited 16 times
  across the code, and the handoff pointed readers to "the ADR-0002 registry"
  — which did not exist (audit §9, L9). This ADR corpus is the fix; the
  citations now resolve.
- **A dangling pointer to the simulation's heart.** `consult-002 §4`, the
  authority for the env's corrected face model, was filed in the wrong
  directory (`docs/agents/` rather than `docs/consults/`) and its report had
  no literal `§4` anchor (audit §9). Relocated and re-anchored as part of
  establishing this corpus.
- **Load-bearing knowledge offloaded to volatile prose.** 111 `design §N`
  citations make a design doc the de-facto spec, while several of its
  load-bearing specifics (`37-slot` space, `90-float` vector, ISMCTS teacher)
  are marked STALE in the very code implementing their successors (audit
  §2.G).

## Rule 1

*(the SSOT drift instance — extracted from Rule 1: Single source of truth per nominal handle)*

The audit's sharpest SSOT findings are exactly this failure: the three reference rates
hand-copied across ~10 files (one already drifted, `0.0941` vs `0.094`); the
belief mechanics duplicated where the dual bound certifies against them; the
feature layout written in three places. The structural fix is one owner per
fact (the env computes the rates; one `FEATURE_LAYOUT(env)` owns the layout;
`env.max_steps` owns the horizon), with everything else deriving from it —
the discipline ADR-0008 (classification) and the audit's target architecture
(§6) generalize.

## Rule 2

*(the original docs/ directory table, the misfiling instance, and the LengYue-derivation note
— extracted from Rule 2: Consult and design records live where the convention says)*

Records have a predictable home, not an author's-convenience one:

- **Design notes** live under `docs/design/`.
- **Consult records** (an independent review commissioned and treated as
  evidence) live under `docs/consults/`, as `consult-NNN-*`.
- **Agent commission/report pairs** live under `docs/agents/`.
- **Results** live under `docs/results/`; **audit records** under
  `docs/notes/audit/`.

The load-bearing commitment is **one place, known to the next reader**. The
`consult-002` misfiling (it lived under `docs/agents/` though it is a consult)
is the concrete violation this rule fixes; relocating it to `docs/consults/`
was part of establishing this corpus.

*(LengYue's Rule 2 named a cross-team dispatch ledger. chocofarm is a single
package with no sub-projects, so there is no dispatch ledger; this rule is
re-instanced as the consult/design/agent/results/audit directory convention,
which is the chocofarm analog of "one place, both parties know where.")*

## Rule 3

*(the consult-002 anchor-repointing instance — extracted from Rule 3: Descriptions describe
relations, not content snapshots)*

When fixing a relocated reference (the `consult-002` path
repointing, the `honest-rates-faces.md` path fix), the citation must still
accurately describe the real relation: a citation that points at a section
must point at a section that *exists* (the report's `## (4) The correct model
and remedy`, cited as `§(4)` — never the dangling `§4` that resolved
nowhere).

## Rule 5

*(the consult-002 relocation instance — extracted from Rule 5: File location reflects content,
not authoring history)*

The `consult-002` relocation is the worked
instance: a consult record filed under `docs/agents/` is exactly the
location-misleads-content trap this rule names.

## Rule 6

*(the 24-seconds-stale handoff instance — extracted from Rule 6: Documentation lifecycle —
author as you decide)*

The audit's 24-seconds-stale handoff is the failure this rule
prevents: a "pending" item narrated in prose that was done before the prose
was read.

## Rule 8

*(the architectural audit's dated-correction convention, worked, and the frozen-commission-record
note — extracted from Rule 8: Sibling revisions / dated corrections over silent edits of
point-in-time records)*

The architectural-audit corpus is the worked instance of the convention done
right: it is explicitly **point-in-time and not retro-edited** — where a
worker overstated, the original stands verbatim in the appendix and the
correction is made in the audit's §5 (the deflation record), dated. (This is
why the agent commission records' old `docs/agents/`
references to the relocated consult-002 were left intact — they are frozen
records of what an agent was told, not live links to repoint.)

## Rule 9

*(the 35-worker verbatim appendix and the consult commission/report pairing — extracted from
Rule 9: Commissioned-review artifacts are recorded verbatim, in-tree)*

The architectural-audit is the largest worked instance: every one of 35 workers'
raw outputs is reproduced verbatim in
`architectural-audit-2026-06-15-appendix.md`, and the consult records carry
both the commission and the verbatim report (`consult-001`, `consult-002`,
`consult-003`).

## Consequences

*(the chocofarm doc-graph-validator note — extracted from the Negative Consequences)*

chocofarm has no doc-graph validator (LengYue's mechanization); cross-reference
resolution is review's, not a CI gate's — a declared review-only surface
(ADR-0011 Rule 1).
