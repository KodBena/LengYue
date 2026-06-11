# Worklog — band-conformance CI check (2026-06-11)

> Audit trail for the band-conformance checker — the first concrete
> per-tenet mechanization of ADR-0003's band discipline. Work-status item:
> `band-conformance-ci-check` (ACTIVE; its description carries the
> six-expectation design brief). PR: bork/tooling/band-conformance-ci-check.
> ADR-0008 Revisit-#4's named fuller firing; ships the ADR-0003 amendment
> (structural half became mechanism, content half stays review judgment).

## What shipped

- **`tools/band-conformance/check.mjs`** — a zero-dependency Node tool
  (Node built-ins + the filesystem only; no `node_modules`, no npm
  install), modelled on `tools/doc-graph/generate.mjs` as the
  committed-report-tool precedent. It parses `frontend/FILES.md`'s band
  tags out of the tree block (box-drawing indentation → directory stack),
  walks the relative-import graph of `frontend/src`, and enforces

      band(file) >= band(import)        ([B1] < [B2] < [B3])

  i.e. a more-portable module must not depend at runtime on a
  less-portable one.

- **`tools/band-conformance/fixtures/ghost-row.files.md`** — the self-test
  fixture that reintroduces the `jquery-bridge.ts` ghost-row shape (a
  FILES.md row naming a file that does not exist on disk), proving the
  fail-loud path fires. `check.mjs --self-test` parses it and asserts the
  ghost is caught.

- **CI wiring** — a `band-conformance` job in `.github/workflows/
  frontend-ci.yml` (not `doc-graph-ci`: the tool's two inputs are
  `frontend/src/**` AND `frontend/FILES.md`, both under `frontend/**`;
  doc-graph-ci triggers on FILES.md but not `src/**`, so a band leak
  introduced by a new import would not retrigger it).

- **Documentation** — ADR-0003 amendment + Negative-consequence note
  (structural half became mechanism); ADR-0008 Amendments + Revisit-#4
  trigger note (fuller firing shipped); FILES.md "scripted drift check"
  note re-pointed at the shipped tool; three previously-missing FILES.md
  rows added (see "Structural drift fixed" below).

## The six design-brief expectations, each discharged

1. **Keybindings fused-file dependency annotations** (PR #390:
   `useUserIORegistry` [B2] + the [B1] editors depending on the [B3]
   catalog). Surfaced: the checker reports `KeybindingRow.vue [B1] →
   keybindings-catalog.ts [B3]`, `KeybindingsView.vue [B1] → catalog [B3]`,
   and `useUserIORegistry.ts [B2] → catalog [B3]` in the advisory list.

2. **ADR-0003 sizing-row disagreements** (corpus audit A3.4:
   `wait-for-analysis.ts`, `engine/helper.ts` reversed). The checker keys
   on **tags, not directory paths** (`engine/helper.ts` is [B1], so a [B2]
   importing it is conformant — no false positive). `wait-for-analysis.ts`
   is [B3]; edges into it from [B2] surface advisory.

3. **ADR-0008 Revisit-#4's named fuller firing** — recorded at the trigger
   and on the Amendments line (this PR).

4. **The dominant-concern legend question** (corpus audit §6.5: the
   exception list encodes legend judgments, expected non-empty). The
   `HUB_EXEMPT_TARGETS` map (two band-mixed hubs) and `BAND_EXCEPTIONS`
   list are framed in the tool header as **encoding** FILES.md's
   dominant-concern legend rule per ADR-0008's "deliberately-imprecise
   tag" exception — non-empty by design, not a backlog to zero.

5. **The RegistryEditor [B1] drift annotation** (FILES.md:123). Seeded into
   `BAND_EXCEPTIONS` as a named-and-owned leak (the WINRATE_FRAMINGS import
   from [B3] `engine/katago/types`; fix owned by config-schema-projections
   Phase 1).

6. **The jquery-bridge ghost row** (FILES.md:57, file absent) as the
   fail-loud test case. **Verified fixed** on the real tree (no row, no
   file); the self-test fixture is the standing proof the loud failure
   would fire if it returned.

## Measured baseline (ADR-0011 Rule 3, measure-first)

Run over the tree at adoption (225 src files, 231 FILES.md band rows after
the three additions, 818 relative import edges):

- **Literal rule** (every edge): ~119 violations — DROWNS, exactly the
  brief's design-decision (a). 74 of 119 (62%) flow into the two
  band-mixed hubs (`types.ts` barrel [B3], `store/index.ts` [B3]).
- **After type-only exemption** (44–56 edges, compile-time-erased): removed.
- **After hub exemption** (two named hubs): −40.
- **After the annotated-exception list** (4 seeded entries): −4.
- **Residual advisory findings: 40** runtime value edges where
  `band(file) < band(import)`, each an ADR-0003 seam to adjudicate.

This 40-case judgment baseline is **not** a zero-or-fully-triaged baseline,
so per ADR-0011 Rule 3 the band-ordering audit is **not** adopted at
`error`. Per Rule 5 (a mandatory gate on judgment-shaped output is
miscalibrated — advisory surface, not tollgate) it is **advisory-first**:
printed every run, never failing the build.

## What DOES gate (the crisp ADR-0002 fail-loud class)

The structural-drift class is a set-difference fact (a path resolves or it
does not), not a judgment, so it gates at `error` on a **zero baseline**:

- **ghost rows** — a FILES.md band row → no file on disk (jquery-bridge
  class).
- **missing rows** — a `src/` `.ts`/`.vue` file → no FILES.md band row.
- **broken import edges** — a relative import resolving to no file.

`--check` exits non-zero on any of these; `--strict` additionally fails on
band findings (the local zero-drift run mode).

## Structural drift fixed (the missing-row class, reached zero baseline)

The checker found **three real `src/` files absent from FILES.md** — the
inverse of the jquery-bridge ghost. Adding their rows (the FILES.md same-PR
cadence) brought the fatal class to zero so the gate has teeth without being
red on existing drift (the doc-graph precedent's lesson):

- `composables/auth-app/workspace-identity-key.ts` → **[B1]** (per-identity
  remount key from `username`; domain-free tenancy guard).
- `composables/cards/useTags.ts` → **[B1]** (the tag-dictionary chokepoint;
  a flat label-set SSOT, domain-free). *Band call made by the implementer
  under ambiguity — it sits in `cards/` among [B2] files; a reviewer could
  reasonably argue [B2]. Flagged for maintainer eyes (ADR-0008 negative
  register: a classification made under ambiguity, surfaced not silenced).*
- `composables/useAutoSaveAnalyses.ts` → **[B3]** (analysis-persistence
  auto-save; KataGo storage toggles + the analysis-bundle/persistence
  imports).

## Settled policies (recorded per the brief)

- **Type-only imports exempt.** An `import type` / `export type` / inline
  `import('…').T` is compile-time-erased — no runtime coupling — so it sits
  outside the rule's target, the same logic as the eslint
  component→services boundary's `allowTypeImports`. A type dependency on a
  [B3] vocabulary doesn't make the importer Go-coupled at runtime (the fork
  swaps the type module; the importer's runtime structure survives). Worked
  cases: `SidebarWidget.vue:13` (`board-geometry` type-only),
  `types/cards.ts → types/game.ts` (type-only).
- **Dev-only imports.** Not auto-detected (the import sits at top-of-file;
  the `import.meta.env.DEV` gate is at the call site, and a reliable static
  link is fragile). Carried in `BAND_EXCEPTIONS` with a reason instead:
  `main.ts → sgf-writer` and `main.ts → perf/scenarios` (the DEV-block
  console handles + perf-harness install, tree-shaken from production).
- **Hub handling.** Chose "exempt the two named hubs explicitly" over
  "scope to B3-leaf/engine imports" — naming the two dominant-concern hubs
  the corpus already documents (ADR-0003's `types.ts`-exclusion note;
  FILES.md's barrel row) is the narrower, more honest cut than a coarse
  directory predicate.
- **`[B?]` exempt** per the spec (no `[B?]` files at adoption; the one in
  the ADR-0003 amendment census is `useReviewSession`-adjacent, tagged
  [B3] not [B?] in the current FILES.md).

## FILES.md legend re-keying

The brief's "re-key the [B1] legend line to the any-domain test at
adoption" was **already satisfied** — the legend was re-keyed to the
any-knowledge-domain criterion on 2026-06-10 (FILES.md:25–45, alongside
ADR-0003's same-day amendment). No further edit needed; the checker keys on
the tag the legend already defines.

## Adversarial review (hack-rationalization-detector)

Ran the skill's deterministic scripts in-frame (a separate-invocation
auditor would be stronger — flagged as residual). Tells scanner: 0
co-occurrence tells. Writer-delta probe: injected a fresh [B1]→[B3] value
edge (`correlation.ts → logic.ts`); it **surfaced in the advisory report**,
confirming `BAND_EXCEPTIONS` is **deny-by-default with named exemptions**
(ADR-0011 Rule 4's prescribed shape) — it fails LOUD at the next instance,
NOT open. Verdict: general. The substantive residual finding the maintainer
should weigh: **advisory-mode means the whole band-ordering class is
currently ungated** — nothing fails CI on a genuine new band leak; it only
surfaces in a report. The honest Rule-3 graduation is a no-new-findings
**advisory ratchet** (the doc-graph `NO_NEW_DANGLERS_RATCHET` pattern),
which this PR does NOT build — see Deferrals.

## Deferrals (ADR-0005 Rule 10)

- **Advisory ratchet (no-new band findings).** A baseline-count ratchet
  that flags *additions* to the 40-finding advisory population (the
  doc-graph `NO_NEW_DANGLERS_RATCHET` precedent) would convert the advisory
  surface from "surfaces leaks" toward "prevents new leaks" without gating
  on the existing 40. Not built this PR; the natural Rule-3 graduation
  path. not-filed: a follow-up the maintainer should weigh against the
  cost — left to sign-off rather than self-filed, since closure-residual
  filing is the coordinator's (per the campaign rule).
- **`useTags.ts` band adjudication.** [B1] vs [B2] is a genuine ADR-0003
  seam call I made as the implementer. not-filed: surfaced here for
  maintainer review rather than self-adjudicated.
- **The 40 advisory findings** are the standing ADR-0003 review surface.
  Each is either a wrong tag (retag FILES.md) or an expected
  dominant-concern artifact (add to `BAND_EXCEPTIONS` with a reason).
  not-filed: this is the advisory surface working as designed, not a
  deferral to close — the report IS the artifact.

## Verification

- `node tools/band-conformance/check.mjs --self-test` → 2/2 pass.
- `node tools/band-conformance/check.mjs --check` → exit 0 (no structural
  drift; band findings advisory).
- `cd frontend && npm install && npm run build` → built.
- `npx eslint .` → exit 0.
- `npm run test:run` → 912 passed, 4 skipped (env-gated e2e).
