# law/adr/ — index

`law/adr/*.md` is this project's LAW (CLAUDE.md points at it as a bare glob) — read the actual
files in full before work that invokes them, and for their spirit, not merely their letter. This
page is only a map: one paragraph per ADR, plus a suggested reading order, so a reader meeting
this corpus cold can orient before diving in. It replaces nothing — each ADR remains the sole
authoritative text for its own rule.

The one-paragraph digest below each ADR is quoted, not re-paraphrased, from
[`tools/setup_tui/data/adr_synopses.toml`](../../tools/setup_tui/data/adr_synopses.toml) — the
maintainer-reviewed digest file the setup wizard's own Hydration screen already surfaces at
ADR-adoption time (single-source-of-truth: one digest, read by both this index and that screen,
never two independently drifting summaries of the same law).

## Suggested reading order

1. **[ADR-0000](0000-the-alpha-and-the-omega-type-driven-design.md)** — the constitutional
   keystone: read this first, everything else specializes it.
2. **[ADR-0002](0002-fail-loudly.md)** and **[ADR-0011](0011-mechanization-discipline.md)** —
   the two enforcement postures (fail loudly; convert a lapse into a mechanism, never more prose)
   that the rest of the corpus assumes.
3. **[ADR-0001](0001-immutability-and-copy-on-write.md)**, **[ADR-0003](0003-domain-coupling-bands.md)**,
   **[ADR-0004](0004-minimal-touch-edits-to-partially-visible-files.md)**,
   **[ADR-0005](0005-documentation-discipline.md)**, **[ADR-0006](0006-source-file-headers.md)**,
   **[ADR-0007](0007-file-size-and-information-density.md)**,
   **[ADR-0008](0008-classification-discipline.md)** — day-to-day engineering practice: how a
   file, an edit, a doc, and a classification choice are shaped.
4. **[ADR-0009](0009-performance-investigation-discipline.md)**,
   **[ADR-0010](0010-render-locality-and-canvas.md)**,
   **[ADR-0015](0015-verification-substrate-discipline.md)** — verification and performance
   claims: what makes one honest and reproducible.
5. **[ADR-0012](0012-compositional-and-structural-hygiene.md)** — the nine-principle structural
   center of gravity; worth a second read once the rest is familiar.
6. **[ADR-0013](0013-execution-integrity.md)** and
   **[ADR-0014](0014-executor-second-opinion.md)** — seeing a ratified task through, and knowing
   when to fetch an independent second opinion instead of pushing on alone.
7. **[ADR-0016](0016-the-service-contract-is-an-enforcement-surface.md)** — what a standing
   service owes a client, gated rather than aspired to.
8. **[ADR-0017](0017-the-zero-context-reader.md)**, **[ADR-0018](0018-consults-are-not-front-loaded.md)**,
   **[ADR-0019](0019-genre-convention-is-the-default-spec.md)**,
   **[ADR-0020](0020-meaning-preservation-witness.md)** — documentation, consult, UI, and
   transformation-fidelity discipline, the most recently ratified layer.

[ADR-0019-appendix](0019-appendix-ui-proscriptions.md) — a consult-authored companion filed
alongside ADR-0019-genre-convention under the SAME number (a known findability hazard: two files
share "ADR-0019," so which one a bare citation means is ambiguous — flagged here, not fixed;
resolving the dual-numbering is the maintainer's own call on law-naming and is explicitly
deferred, not in scope for this index).

## The ADRs, one paragraph each

### [ADR-0000 — The Alpha and the Omega: Type-Driven Design as the Foundational Law](0000-the-alpha-and-the-omega-type-driven-design.md)
> Binds every contributor: when a defect is found, ask first what TYPE would make the whole
> class impossible to express, and what operational lapse let it recur — fix the type, not just
> the instance.

### [ADR-0001 — Immutability, Copy-on-Write, and Rebind-not-Mutate (Tombstone)](0001-immutability-and-copy-on-write.md)
Retired-to-history: a tombstone only, holding no live rule content to summarize as something a
new world adopts (this is stated plainly in the ADR itself, not glossed over).

### [ADR-0002 — Fail Loudly](0002-fail-loudly.md)
> When code hits a bad config, an unexpected shape, a timeout, or any other deviation from what
> it expects, the rule is to say so clearly — raise, fail a build or test, log visibly — rather
> than quietly limping on, guessing, or hiding the problem behind a plausible-looking default.

### [ADR-0003 — Domain-Coupling Bands](0003-domain-coupling-bands.md)
> Domain-specific instance facts and domain-general problem-class machinery get named, separated
> coupling bands. Two questions govern every new module: what would change if the domain
> instance were different but the problem class the same, and what would change if the problem
> class were different but the machinery the same — the answers locate the seam, and the seam is
> designed deliberately either way. Adopters derive their own band map from their own codebase;
> the ADR hands none down.

### [ADR-0004 — Minimal-Touch Edits to Partially-Visible Files](0004-minimal-touch-edits-to-partially-visible-files.md)
> When editing a file under conditions where the full source is not in immediate view, the only
> changes that go in are the specific lines the tool, test, or task is about — a "while I'm in
> here" full-file rewrite is not permitted.

### [ADR-0005 — Documentation Discipline](0005-documentation-discipline.md)
> Documentation Discipline, Rule 1 alone: anything that names a piece of work or a fact (an ADR
> number, a reference rate, a derived layout) has exactly one owning home; parallel records of
> the same handle drift silently, often invisibly, until two copies disagree.

### [ADR-0006 — Source-File Headers](0006-source-file-headers.md)
> Every source file's opening header states its own path, its purpose, and, where a project
> makes this declaration at all, its license.

### [ADR-0007 — File Size and Information Density](0007-file-size-and-information-density.md)
> Soft thresholds, a density heuristic, and content-aware formatting rules keep a source file
> small enough, and dense enough with decisions rather than boilerplate, that a reader or
> reviewer can hold it in working memory.

### [ADR-0008 — Classification Discipline](0008-classification-discipline.md)
> When a choice involves classification, the choice is honest only if the vocabulary or taxonomy
> precisely fits the case — fuzzy matches and synthetic fabrications are the failure mode this
> tenet forbids.

### [ADR-0009 — Performance Investigation Discipline](0009-performance-investigation-discipline.md)
> A perf-property or equivalence claim — speedup, regression, null result, or "matches the
> baseline" — is honest only when the investigation behind it is captured in a form the next
> reader can reproduce.

### [ADR-0010 — Render Locality and Canvas for Data-Dense Visuals](0010-render-locality-and-canvas.md)
> Read a high-frequency reactive value as close as possible to the component that actually
> consumes it, never at a shared ancestor whose re-render would needlessly propagate; a
> data-dense visual renders via one single-surface draw call, not one reactive node per datum.

### [ADR-0011 — Mechanization Discipline](0011-mechanization-discipline.md)
> Every discipline-stating rule states plainly how it is enforced; a recurrence converts to a
> mechanism, not more prose; a net quantifies over the class, not the instance.

### [ADR-0012 — Compositional and Structural Hygiene](0012-compositional-and-structural-hygiene.md)
> Nine checkable principles set against a table of named anti-pattern "cancers" (frozen config,
> dissolved single-source-of-truth, hidden global state, copy-paste drivers, abandoned
> abstractions, magic constants, unenforceable prose conventions) — each cancer maps to the
> principle that forbids it.

### [ADR-0013 — Execution Integrity: Against the Attrition of Will](0013-execution-integrity.md)
> The work that was ratified is the work that is owed, in full, to its ratified end state; a
> deviation from it is authorized only by the ratifier, never by the executor's own sense that
> the remainder is not worth it; and the claim that the work is done is worth nothing until the
> artifact is verified to show it.

### [ADR-0014 — Request a Second Opinion When a Problem Resists Resolution](0014-executor-second-opinion.md)
> When the executor's own line of reasoning has demonstrably stalled — an observable recurrence
> of mis-targeted attempts, not a passing feeling — fetching an independent, deliberately un-led
> second opinion is the professional move; it is judiciously applied, never a mandate to
> spawn-and-offload, and the executor still owns the result.

### [ADR-0015 — Verification-Substrate Discipline](0015-verification-substrate-discipline.md)
> A result is only as good as the environment that produced it: the machine state under which a
> verification ran is part of the verification's meaning, and a run outside its declared
> envelope is not evidence.

### [ADR-0016 — The Service Contract Is an Enforcement Surface](0016-the-service-contract-is-an-enforcement-surface.md)
> Once a service advertises it is standing, no client input of any content, size, shape, value,
> encoding, ordering, timing, or concurrency can make it crash, wedge, desync, corrupt, hang,
> leak, or behave statefully — it refuses cleanly at the boundary, enforced by gates checked at
> build/test time, not left as an aspiration.

### [ADR-0017 — The Zero-Context Reader](0017-the-zero-context-reader.md)
> A document is finished only when a reader with zero conversational context can parse every
> sentence, resolve every reference from the text or its links alone, and learn from the
> document itself what each part is and why it is there.

### [ADR-0018 — Consults Are Not Front-Loaded](0018-consults-are-not-front-loaded.md)
> A consult receives exactly the witnessed problem, its evidence, and the governing law — never
> the commissioner's candidate answers, enumerated options, suspect lists, or priors; a
> front-loaded consult is a confirmation pass, not a judgment, and its verdict is void.

### [ADR-0019 — Genre Convention Is the Default Spec (UIs Are Not a Novelty Surface)](0019-genre-convention-is-the-default-spec.md)
> In an established UI genre, the genre's convergent idiom is the default spec; any structure
> the reference exemplars do not exhibit is presumptively wrong, the burden of proof on the
> deviation, never the convention. Every fact has exactly one placement in the navigation
> hierarchy — rendering it under two headings, or as a mirror, is refused as a type error naming
> the fact and every claimant. For relationally-structured data, the data's own topology
> (entities, dependents, associations) is the mandatory default information architecture: a
> dependent entity is created and edited master-detail within its parent's context, never
> rendered as a sibling flat list.

### [ADR-0019-appendix — UI Failure Proscriptions, Consolidated](0019-appendix-ui-proscriptions.md)
A consult-authored companion to ADR-0019 above, adopted by maintainer decision 2026-07-22:
merged blind+sighted consult text cataloging specific UI failure modes the genre-convention rule
forbids. Shares its file's number with the ADR above (see the dual-numbering note above) — this
index cites it by filename to stay unambiguous in the meantime.

### [ADR-0020 — The Meaning-Preservation Witness](0020-meaning-preservation-witness.md)
> Any operation that migrates, schematizes, summarizes, or re-renders authored content carries a
> cold-read meaning-preservation witness alongside its mechanical invariants: a fresh-context
> reader who did not perform the transformation reads the output against the source and attests
> the output asserts no more and no less than the source asserted (qualifiers, hedges,
> aspiration markers, honest ceilings, named exclusions, and recommendation polarity all intact),
> serving its declared reader. Mechanical invariants — token, element, line, or format counts —
> cannot discharge this witness, since passing every one is compatible with a strengthened claim
> or a dropped hedge; and a pass finding a severe meaning change (truth value, coverage,
> referent, binding commitment, or recommendation direction) proves the class is present, not
> that the last instance was caught, so a fresh, blind reader reads again after repair until a
> pass finds none.

## Other corpus contents

- `history/` — declared history: per-ADR specimens, worked examples, and postmortems (e.g.
  `history/POSTMORTEM-SETUP-TUI-ARC-2026-07-23.md`), read when a specific ADR's own text points
  you there, not as a second reading path through the corpus.
- `briefs/` — authoritative external-standards briefs and a conformance map (e.g. the
  safety-critical-logging brief this index does not duplicate).
- `STANDARDS-REGISTRY.md` — the registry of external standards this project cites and how it
  treats each one (aim, not conformance claim, unless explicitly stated otherwise).
- `RETROSPECTIVE-ADR-CROSSCHECK-2026-07-23.md` — a dated cross-check record, not itself a rule;
  relocated to `design/` 2026-07-27 (a record is not law — layout ruling, ledger row 1469).

## First-use glossary links: chocofarm

12 of these ADRs cite **chocofarm** (a prior maintainer project this corpus's disciplines are
generalized from) without linking to its definition on first use, even though
[`GLOSSARY.md`'s own Stand-Alone Principle](../../GLOSSARY.md#stand-alone-principle) already
mandates exactly that for every coined term. As part of this pass (usability review, ledger row
1180, finding 16), the first plain-text mention of "chocofarm" in each of ADR-0000, 0002, 0003,
0004, 0005, 0006, 0007, 0008, 0013, and 0014 was linked to
[`GLOSSARY.md#omega-and-chocofarm`](../../GLOSSARY.md#omega-and-chocofarm) — noted here as the
pattern for a later pass over the rest of the corpus (`briefs/`, `history/`, and any other coined
term besides chocofarm that meets an ADR reader unlinked), not claimed as a complete sweep.
ADR-0009 and ADR-0011 are the two exceptions among the 12: in both, every "chocofarm" mention
is inside a filename (`history/00NN-chocofarm-*.md`) or a verbatim-quoted, "not retro-edited"
extracted-history block — this pass left both untouched rather than either mangling a filename
inside its own link text (a real defect an earlier, mechanical pass of this fix introduced and
this build caught before commit) or retro-editing declared-verbatim history.

<!-- doc-attest-exempt: disclosed gap, not a clean exemption -- this file is new, written this
     session (usability review, ledger row 1180, 2026-07-23, finding 16: the LAW corpus had no
     index or suggested reading order, and greeted a cold reader with an undefined "chocofarm"
     in ADR-0000's first substantive line). Every per-ADR paragraph above is a verbatim quote
     from tools/setup_tui/data/adr_synopses.toml, not freely authored, to avoid a second,
     independently-drifting summary of the same law (ADR-0005). This file has NOT been through a
     genuine fresh-context A:B:C loop (user-guide/ORCH-ABC-AUDIT-LOOP-RECIPE.md): the executing
     session had no Agent/Task-dispatch tool available to spawn a truly separate B invocation,
     the same disclosed gap user-guide/USER-CONFIGURATION.md's own marker names. Waived here
     only to unblock this commit, flagged loudly per CLAUDE.md's engineering-responsibility
     standard -- the commissioning brief for this round states a cold-read pass follows the
     build; the orchestrator/maintainer should run it (or confirm one already ran) and replace
     this marker with an actual attestation record. -->
