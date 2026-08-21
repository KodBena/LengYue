Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
`law/adr/0008-classification-discipline.md` at commit
`ff691bb9bc430ad497d74ff82d580f758a969f99` under
`design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
retro-edited; the lessons these records teach live as rules in the parent ADR.

# Extracted from ADR-0008 (Classification Discipline) — the chocofarm substrate

This file holds the project-specific ("chocofarm") material the ADR-0008 portability
refactor moved out of the live ADR text, per
[`design/MAINT-ADR-PORTABILITY-SPEC.md`](../../../design/MAINT-ADR-PORTABILITY-SPEC.md)
§2's row for ADR-0008. The parent ADR keeps an Extraction Pointer at each place material
left; this file is the destination those pointers resolve to. Three orienting facts for a
reader arriving cold: **chocofarm** is the source project (a research codebase) ADR-0008
was originally authored against, before this refactor generalized the tenet for reuse by
other projects; **"the audit"** below is chocofarm's 2026-06-15 architectural audit, an
artifact of that project not held in this repository; and the demarcation convention is
that this intro, the `## From …` headings, and the one section marked as added at
extraction time are extraction-time framing (written 2026-07-13), while everything
**under** a `## From …` heading is the frozen record, reproduced verbatim from the source
commit named in the banner — including its original headings and bullet structure. The
extraction is sentence-faithful but partial: sentences that stayed normative remain in
the parent ADR and are not duplicated here, so a frozen block may begin or end
mid-paragraph relative to the source.

## From the ADR's "Context" section (frozen record, verbatim from here to the next `## From` heading)

The 2026-06-15 architectural
audit surfaces both registers in chocofarm.

### Substrate — positive register (fuzzy match against an inadequate vocabulary)

- **The detector mis-specification (consult-002).** The original detector
  model keyed sensing to *regions* (`cover_mask[i] = {i} ∪ overlap-neighbours`)
  — the closest available encoding, the union over every face in a region,
  passed off as a simultaneous disjunction. It was the wrong vocabulary: the
  honest sensing unit is the *arrangement face*, not the region. The mismatch
  propagated through six commits and three agent reports (each measuring
  `cover_mask` against itself) before the consult caught it. The corrected
  model re-keys the vocabulary from regions to faces
  (`docs/consults/consult-002-detector-misspec-report.md` §(4)) — exactly the
  "revise the vocabulary, don't pick the closest fit" move this register
  prescribes.
- **The `('d', i)` action-key preservation.** When the env adopted the face
  model, the action-key shape `('d', i)` was *deliberately preserved* (the env
  is "re-keyed from regions to faces; the action shape … UNCHANGED IN FORM" —
  `model/env.py`). This is the honest move: the vocabulary element (`('d', i)`)
  still fit; only the underlying data changed. The discipline is not "always
  invent new names" — it is "verify the vocabulary still fits before reusing
  it."

### Substrate — negative register (fabricate a category under ambiguity)

- **The fossil arrays in `instance.json`.** The instance file carried
  the superseded 16-region `overlaps` / `delta_treasures` arrays the face
  arrangement replaced (audit §3.1, appendix). A reader cannot tell which
  fields are live and which are fossils; an edit to `overlaps` silently does
  nothing. This is the negative-register failure: stale categorisation left
  in the canonical vocabulary, which the next reader reads as authoritative.
  *(Amended 2026-06-15: the two fossil arrays were subsequently stripped from
  `instance.json` — both are derivable from the live geometry (`overlaps` ==
  the arrangement co-coverage edge set, `delta_treasures` == the treasures no
  face covers), and the one remaining reader, `scripts/verify_faces.py`, now
  re-derives the old cover_mask from `regions_wkt` rather than the frozen array.
  The instance now carries only live, non-derivable facts. The example above is
  preserved as the motivating instance for this register.)*
- **The audit's own band/severity vocabulary.** The audit classifies findings
  `critical`/`major`/`minor` and modules `sound`/`messy`. It is disciplined
  about the failure mode this register names: severity is calibrated by the
  *substitution test* (below), not by the observed instance's cost, and the
  audit's §10 self-critique flags that the `critical`/`major` line "is softer
  than the line between `confirmed` and `refuted`" — naming the vocabulary's
  own imprecision rather than pretending it is crisp.

## From the ADR's "Positive register" Decision section (frozen record, verbatim from here to the next `## From` heading)

The
detector model is the worked chocofarm instance: when "enter region Δ_i" did
not honestly model a single-point sensor, the fix was to re-derive the
vocabulary (faces, not regions), not to keep using the closest-fitting region
encoding.

## From the ADR's "Negative register" Decision section (frozen record, verbatim from here to the next `## From` heading)

The fossil
`instance.json` arrays are the dual failure: a stale categorisation left
standing is as misleading as a fabricated one — the remedy is to strip the
fossils (mark them dead or remove them), not to leave the reader to guess.

## From the ADR's "Severity calibration" section (frozen record, verbatim from here to the next `##` heading)

The audit's §4 reference-rate trace is the chocofarm worked example. A frozen
`DECOMP_ANCHOR` literal used *only* as a TensorBoard display line has near-zero
cost. The *same failure shape* — a derived value frozen as a literal — applied
to the `%VoI` divisor (`exit_loop.py`) or to `vhat_lam` (a numerical input to
a provable bound, `eval_bound.py`) has catastrophic cost: a silently wrong
research result or a corrupted certificate. The discipline that catches the
harmless instance must be calibrated to the worst case, not the observed one.

## Cross-reference added at extraction time (framing, not frozen record)

The reference-rate drift in the last frozen block above — a derived quantity ("%VoI",
the source project's value-of-information percentage metric, and its siblings) frozen as
literals that had already drifted — is the same underlying chocofarm incident that
grounds [ADR-0002](../0002-fail-loudly.md) Rule 6's frozen-literal lesson; see
[history/0002-chocofarm-fail-loud-substrate.md](0002-chocofarm-fail-loud-substrate.md).
The two ADRs cite one incident from their own registers: ADR-0002 as a latent silent
failure, ADR-0008 as the worked calibration for its substitution test.
