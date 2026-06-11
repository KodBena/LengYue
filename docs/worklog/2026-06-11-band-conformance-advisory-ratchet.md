# Worklog — band-conformance advisory ratchet (2026-06-11)

> Audit trail for the no-new-findings ratchet on the band-conformance
> checker — the ADR-0011 Rule-3 graduation the band-conformance-ci-check
> adversarial review flagged as the natural successor (the band-ordering
> advisory class was ungated; nothing failed CI on a genuinely new band
> leak). Work-status item: `band-conformance-advisory-ratchet` (successor
> filed at the closure of `band-conformance-ci-check`). Branch:
> `bork/discipline/band-conformance-ratchet`.
>
> SCOPE NOTE: this discharges the RATCHET MECHANISM only. The item also
> carries two maintainer-review legs that are explicitly NOT discharged here
> and remain open by design (see "Maintainer-review legs left open" below);
> the coordinator retitles the item at merge.

## What shipped

- **`NO_NEW_FINDINGS_RATCHET`** in `tools/band-conformance/check.mjs` — a
  measured-baseline constant modelled on `tools/doc-graph/generate.mjs`'s
  `NO_NEW_DANGLERS_RATCHET` (same baseline-snapshot shape: `{ baselineDate,
  baseline }`; same ratchet-DOWN convention). The two read as siblings in
  structure.

- **`--check` gates on the ratchet.** The structural-drift class still gates
  (unchanged, fatal, zero baseline). Added: if the advisory band-ordering
  finding COUNT exceeds the baseline, `--check` exits non-zero with the
  over-baseline delta named (a new band leak). A count at-or-below the
  baseline does not gate. The finding DETAIL stays advisory — printed in full
  every run, never a per-finding tollgate (ADR-0011 Rule 5).

- **Report ratchet line** in `printReport` — a "No-new-findings ratchet
  (gates --check)" section reporting current-vs-baseline, mirroring the
  doc-graph report's "Advisory ratchet" section. The findings section's
  stale "Advisory — does not gate" line was corrected to "detail is advisory;
  the COUNT gates via the ratchet below".

- **CI wiring** in `.github/workflows/frontend-ci.yml` — the
  `band-conformance` job already ran `--check`, so the ratchet gates through
  the existing step (minimal change: no new command). The job's two comment
  blocks and the check step's name were updated — the prior prose asserted
  the band-ordering class was "NON-GATING ... never fail the build", which is
  now inaccurate (the count gates).

## Sibling-divergence (the one axis that differs from the precedent)

The doc-graph `NO_NEW_DANGLERS_RATCHET` is **report-only**: its CI gate
(`doc-graph-ci`) checks artifact *freshness*, not the dangler count, so that
ratchet *surfaces but does not prevent* — its report text says "Advisory
only (this report does not gate)". This band-conformance ratchet is the same
SHAPE but **wired to gate**: `--check` exits non-zero on a count above the
baseline. That divergence is deliberate and is exactly the graduation the
successor item asked for — the band-conformance-ci-check worklog's
adversarial-review section recorded the residual ("advisory-mode means the
whole band-ordering class is currently ungated — nothing fails CI on a
genuine new band leak") and named the no-new-findings ratchet as the honest
Rule-3 graduation. The header records the divergence explicitly so the two
ratchets are not mistaken for identical.

## Measured baseline (measure-first; ADR-0011 Rule 3)

Measured at HEAD (`ed1ce43`, origin/main tip, PR #422) by running the
checker:

```
node tools/band-conformance/check.mjs --json | (read counts.findings)
→ findings: 47
```

(Full count line from `--check`: `230 src files, 237 FILES.md band rows, 848
relative import edges scanned; type-only edges exempt 56; hub/exception-
explained 44; 47 advisory findings.`)

**The baseline is 47, NOT 40.** The `band-conformance-ci-check` worklog
(2026-06-11) recorded 40 at the *checker's* adoption a few PRs earlier; the
tree grew between (225 → 230 src files, 818 → 848 import edges), so 47 is the
honest HEAD-measured high-water mark. Per the commission, the measured number
is the baseline and the discrepancy is surfaced (not assumed to be 40). The
47 findings are the maintainer's review surface; this work does not touch,
retag, or annotate any of them.

## Probe (probe-before-trust; both directions)

The commission asked to confirm the gate fails, in both directions, then
revert. Both were run on a backup-and-restore basis with no residue left.

- **Probe A — lower the constant by one (47 → 46).** With the current count
  47 exceeding a baseline of 46, `node tools/band-conformance/check.mjs
  --check` exited **1** with "NO-NEW-FINDINGS RATCHET EXCEEDED (fatal)".
  Constant restored to 47; verified `baseline: 47` back in place.

- **Probe B — inject a synthetic new band leak.** Prepended a value import
  `import '../engine/util';` (a `[B3]` target) to the `[B1]` file
  `frontend/src/engine/helper.ts`. The count rose 47 → **48**; `--check`
  exited **1** with "48 advisory band-ordering findings against a baseline of
  47 ... 1 NEW band leak(s)". File restored; `diff` against the backup
  IDENTICAL; count back to 47; `--check` exit 0.

This confirms the ratchet is **deny-by-default on the delta**: a fresh leak
fails LOUD at the next instance, not silently. (The band-conformance-ci-check
worklog already probed that a fresh `[B1]→[B3]` edge *surfaces* in the
advisory report; this probe confirms it now also *gates*.)

## Gates run

- `node tools/band-conformance/check.mjs --self-test` → **2/2 pass** (the
  ghost-row + parser-round-trip fixtures; unchanged by this work).
- `node tools/band-conformance/check.mjs --check` → **exit 0** (no structural
  drift; 47 findings AT the 47 baseline — no new leaks).
- `node tools/band-conformance/check.mjs --strict` → exit 1 (47 band findings
  present; the documented local-zero-drift mode, behaviour unchanged).
- `node tools/band-conformance/check.mjs --json` → valid JSON.
- `node --check tools/band-conformance/check.mjs` → syntax OK.

**`cd frontend && npm run build` NOT run — not applicable.** The touched files
are `tools/band-conformance/check.mjs` (umbrella-level zero-deps Node tooling,
outside the frontend `vue-tsc -b && vite build` graph), `.github/workflows/
frontend-ci.yml` (CI config, not built), and this worklog. None is covered by
the frontend build, so running it would be a pointless gate. The relevant
correctness check is the checker's own self-test + `--check`, run clean above.

## Maintainer-review legs left open (by design)

The work-status item carries two review surfaces that are the maintainer's,
not this worker's. Both remain OPEN; the coordinator retitles the item at
merge:

1. **The `useTags.ts` `[B1]`-vs-`[B2]` band call** — flagged at row creation,
   made under ambiguity by the band-conformance-ci-check implementer
   (`composables/cards/useTags.ts` sits in `cards/` among `[B2]` files; a
   reviewer could reasonably argue `[B2]`). Not adjudicated here.

2. **The standing 47-finding review surface** — each finding is either a
   wrong tag (retag FILES.md) or a dominant-concern exception to annotate
   (add to `BAND_EXCEPTIONS` with a reason). Untouched here; as findings are
   resolved, the count drops below 47 and the maintainer ratchets the
   baseline DOWN (the `--check` output prints the ratchet-down prompt when
   `current < baseline`).

## Deferrals (ADR-0005 Rule 10)

- **Out-of-frame adversarial review** of this ratchet (a separate-invocation
  hack-rationalization-detector pass, stronger than an in-frame one).
  `not-filed:` the change is a small, single-writer constant + a gate edge
  with both probe directions verified; left to the maintainer's merge review
  rather than self-filed.

## Doc-graph

This worklog is a new doc-graph node. Regenerated from repo root with
`node tools/doc-graph/generate.mjs` (Graphviz `dot` 14.1.2 present) in the
same change, per the umbrella CLAUDE.md structural-doc cadence.
