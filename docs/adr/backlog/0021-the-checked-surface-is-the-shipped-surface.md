# ADR-0021 — Review reads the real object (the checked surface is the shipped surface; a comment asserting a property is a claim)

<!-- doc-attest-exempt: DRAFT awaiting maintainer ratification; the real A:B:C legibility
loop runs at (or before) the ratification pass and this marker is struck when its
attestation is recorded. A draft ADR is not living law and its prose is still the
maintainer's to reshape. -->

DRAFT — Fable-authored 2026-07-25 at the maintainer's direction ("the only thing I could
make of it is a new review-class ADR"), awaiting his ratification. Provenance: the
2026-07-23 review campaign ([postmortem](../history/POSTMORTEM-REVIEW-CAMPAIGN-2026-07-23.md),
ledger rows 1229–1260) witnessed one defect structure in four independent habitats, none
of them covered by ADR-0020's meaning axis or the row-1887 search-breadth clauses:

- the pre-commit gate chain judged the **working tree** while `git commit` embeds the
  **staged index** — stage a violation, restore the tree, every gate passes (row 1234);
- a fixture asserted identity markers found in template **source** where the property
  lived in executed **output** — a marker that never prints is vacuously green;
- a help-never-writes witness observed the **worktree** while a help path could have
  written **outside the repo**;
- a "zero residue" claim swept **filesystem and process table** while the leaked writes
  sat in the **kernel** (the live ledger, rows 1237–1244).

Every check was real, ran honestly, and passed. Every defect lived in the gap between the
surface the check observed and the surface the act actually shipped, committed, or
persisted. ADR-0020 names the conservation proxy — *no content lost* standing in for *no
meaning changed*. This is its structural sibling: **a faithful check aimed at a sibling of
the real surface**.

## Rule A — the checked surface is the shipped surface

Plainly: *a check that watches the wrong thing passes while the real thing breaks.*

**A verification's object must be the artifact that ships — the bytes the commit embeds,
the output the process emits, the store the write lands in — not a convenient sibling of
it.** Where checking the shipped surface is genuinely impossible or disproportionate, the
check may observe a proxy surface only if it NAMES that fact where its verdict is read: a
verdict line, docstring, or report that says which surface was observed and which was not.
An unnamed proxy-surface check is a defect of the check, regardless of how honestly it
runs — its green is a claim about a surface nobody examined.

## Rule B — comments and code drift; a comment asserting a property is a claim

Plainly, in the maintainer's own reading at ratification time: *comments and code can
drift — look out for it.* The reviewer's sharpened form:

**A comment asserting a safety or concurrency property ("belt-and-suspenders",
"structurally impossible", "harmless no-op", "this race is closed") is itself a claim
under the witness discipline, and review reads it against the code as adversarially as
the code is read against the spec.** Passing tests do not discharge it — both specimens
below ran green. And specifically for races: a fix names its exclusivity primitive — the
mechanism that makes the bad interleaving impossible (a lock, a bind, an O_EXCL create) —
and a timing argument (a sleep, a grace window, an "in practice this is fast enough") is
not one. Witnessed twice in one axis on 2026-07-23: a grace-sleep presented as closing a
race it only narrowed, and a comment claiming "pid check AND re-probe" over code that was
an OR.

## Subsidiary clause — carve-outs state predicates, not names

A special-case exemption states its membership predicate (e.g. "any verb added after
already-scaffolded deployments existed") and mechanically enumerates the members
satisfying it; the names are derived, never authored. A carve-out granted to the one
member the author happened to meet is how `asof-export` stranded every pre-2026-07-18
deployment while `doctor`, with the identical chronology, was exempted. (ADR-0000's
quantification-universe discipline, brought down to the humble compatibility case.)

## Relation to neighbors

Composes with ADR-0020 (which governs whether a transformation preserved *meaning*; this
ADR governs whether a check observed the *right object* — a transformation can preserve
meaning perfectly while its verification watches a sibling), with row 1887's audit biases
(false-SILENT is searching too few surfaces; this is searching the wrong one faithfully),
and with the witness discipline (WITNESSED means witnessed *on the shipped surface*).

*Enforcement surface: review-time (a reviewer of any check, gate, fixture, or residue
claim asks "is the observed surface the shipped surface, and if not, is the gap named
where the verdict is read?") and spec-time (a commission for a verification mechanism
states which surface it observes). Recognizing that two surfaces have diverged is
judgment; that recognition being someone's assigned question is what this ADR adds.*

## License

Public Domain (The Unlicense).
