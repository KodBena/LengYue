# History record — ADR-0009's 2026-07-12 autoharn re-instancing amendment

<!-- doc-attest-exempt: point-in-time record (ADR-0005 Rule 8), moved verbatim under the ADR
portability refactor and never retro-edited (ADR-0017 Exceptions: point-in-time records are
cited as evidence, not subject to the fresh-context legibility test) -->

> *Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
> `law/adr/0009-performance-investigation-discipline.md` at commit `ff691bb` under
> `design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
> retro-edited; the lessons these records teach live as rules in the parent ADR.*

*Zero-context orientation: on 2026-07-12 the maintainer approved re-instancing ADR-0009 (the
performance/equivalence-investigation tenet) from its original chocofarm substrate onto
autoharn's own experiment surface — this file is that dated amendment, preserved verbatim as
the record of the act. Its substance (the `./judge` and `research.reading`/`research.finding`
tool-surface mapping) now lives as first-class prose in the parent ADR's own "Instance
bindings (autoharn)" section, written fresh rather than quoted, per
`design/MAINT-ADR-PORTABILITY-SPEC.md` §4 (Scope/Genre-adjacent re-instancing prose may be
rewritten; the dated amendment recording the act of rewriting stays verbatim, relocated here
rather than deleted). Nothing below is superseded in substance — it is kept as the frozen,
dated record that the current Instance-bindings section was derived from.*

---

### 2026-07-12 — Re-instanced for autoharn (maintainer YES; Scope + Provenance bracket-edited above; tool surface + metric vocabulary extended here)

*(This is a dated append per ADR-0005 Rule 8. Provenance: BACKLOG.md flagged this document
2026-07-11 as an unadapted chocofarm copy — Scope still bound "the `chocofarm/`
package," the tool list still named chocofarm's harness, byte-identical to the
transferred original. Tracked as maintainer decision `adr0009-reinstance`
(`design/MAINTAINER-DECISION-BRIEF.md` §3). Maintainer ruling, 2026-07-12,
near-verbatim: "obviously... it's trivia" — a mild yes, at his convenience,
recorded here as the act: someone rewrites the document's scope and tool
references for autoharn.)*

The Provenance and Scope header fields above are bracket-edited in place
(struck original preserved, per ADR-0005 Rule 8's in-situ-dated-strike
convention) to bind autoharn's own experiment/investigation surface rather
than chocofarm's tree. This amendment supplies the tool-surface and
metric-vocabulary mapping the 2026-06-24 amendment's own precedent already
established the shape of (extend §Tools / §Metric vocabulary by dated
amendment, rather than rewriting the chocofarm-era prose in place) — the same
move, applied a second time, to a second substrate.

**Tool surface, autoharn register (extending §Tools):**

- **Equivalence tool — `./judge` (the ASP/SQL differential).** This is
  autoharn's `bench_equivalence.py` analog and its two-tier bar reborn: every
  ledger verdict is derived independently via ASP (clingo) *and* SQL, and the
  two must agree. `AGREE` is the bit-exact tier (a discrete/symbolic
  verdict — no floating-point noise to tolerate, so agreement is exact or it
  is a defect, exactly §Calibration's "logic invariant" case).
  `DIVERGE_BY_DESIGN` is a documented, expected divergence (the closed-form
  analog of chocofarm's tolerance-banded behavioral case: named and
  substantiated, not silently accepted). `DIVERGE_DEFECT` / `QUARANTINED` are
  escalation events of a kind this project calls "typed" — meaning the
  event carries a fixed, named category rather than free-text prose, so
  "which failure happened" is a fact a script can read, not a sentence a
  human has to parse — and here they mean a real bug or an unsafe input,
  either way never silently patched around (composes with
  `engine/contemp_differential.py`'s QUARANTINE guard and, per this ADR's
  own §Calibration, never relaxed to a tolerance). Diagnosis walkthrough:
  `engine/docs/JUDGE-READING.md`.
- **Investigation-capture tool — `filing/record_reading.py` writing to
  `stores/001_research_ledger.sql`.** This is autoharn's captured-
  investigation-DB analog, direct structural sibling of chocofarm's
  `exp_db.py` / `throughput_research` store the 2026-06-24 amendment above
  already names: a measurement (`research.reading`, immutable, frozen at
  write) is distinct from an interpretation drawn from it (`research.finding`,
  supersedable, `status ∈ {provisional, retracted}`) — the same
  measured-vs-interpreted separation, same author, same rationale, second
  project. `research.finding_confirmed` derives confirmation from three
  conditions at once: a clean git tree, a qualified instrument (one whose
  `research.instrument.qualification` column reads `'qualified'` rather
  than `'provisional'`, `'suspect'`, or `'retracted'` — a status a human
  sets, not a default), and a real session — never a writable field, so
  "confirmed" cannot be asserted, only earned.
- **No `bench_hotpath.py` analog is built for autoharn's own hot paths**
  (kernel-lineage delta-apply time, `./audit` wall time, a world scaffold's
  cost) as of this writing. A per-component before/after timing harness for
  those paths does not yet exist. Per this ADR's own §Exceptions
  ("Exploratory observations") and §Acceptance-criteria ("the absence of
  substantiation does not block a change... but states the absence
  explicitly"), a perf claim about autoharn's own hot paths is honest today
  only as an explicitly-marked exploratory observation, not an authoritative
  claim — and per this project's own standing prudential posture (a ledger
  work-item named `prudential-filed-candidates`, listed by running
  `./led work list` from this repository's root and read in full with
  `./led show <its id>`, whose own text says "build on witnessed need... not
  speculatively"), a dedicated bench harness is built when a real perf claim
  first needs one, not spun up now on spec.

**Metric vocabulary, autoharn register (extending §Metric vocabulary):**

- **Verdict counts** — `AGREE` / `DIVERGE_BY_DESIGN` / `DIVERGE_DEFECT` /
  `QUARANTINED` tallies from `./judge` — the equivalence comparable.
- **Contemporaneity verdict counts** — the four verdicts `./audit` (this
  project's separate check that a ledger row was recorded close in time to
  the act it describes, rather than backfilled later) can assign to a row:
  `CONTEMPORANEOUS` (recorded close enough in time to trust), `BATCHED_DECLARED`
  (recorded late but the lateness was itself declared honestly),
  `LATE_DECLARED` (recorded later still, again declared), and
  `BACKFILL_SUSPECT` (recorded late with no honest declaration — the one
  verdict that fails the check) — a timeliness comparable specific to this
  project's kernel, with no chocofarm analog.
- **`value` / `stderr` / `n`** recorded via `research.reading` — the
  behavioral comparable, for the (currently rare) autoharn claim that
  involves a repeated, noisy measurement rather than a discrete verdict.

**What is unchanged.** The tenet's spine — a perf or equivalence claim is
honest only when its investigation is captured and reproducible — is
untouched; §Calibration's bit-vs-behavioral distinction is untouched and
still the correct discriminator (`./judge`'s `AGREE` is the bit case;
`research.reading`'s noisy measurements are the behavioral case); the whole
chocofarm-era body of this document (every section between this document's
header and this 2026-07-12 Amendment, as the Provenance bracket above
enumerates in full — including its worked examples such as
`bench_hotpath.py`/`bench_equivalence.py` and `netvalue_ismcts.py:54`) is
left as-authored, a point-in-time record of the discipline as it read on
the substrate it was adapted to before this one — not deleted, not
asserted current for autoharn. This is the same never-retro-edit posture
ADR-0000 and ADR-0013 use for their own dated, first-person failure
records: both documents keep their original context sections intact and
add their corrections as separate, clearly dated "Amendment"/"Revisit"
sections at the foot, exactly as this document now does.

*Enforcement surface: review-only, same as the rest of this tenet — this
amendment maps vocabulary and tools, it mints no new mechanism (ADR-0011
Rule 1).*

## License

Public Domain (The Unlicense).
