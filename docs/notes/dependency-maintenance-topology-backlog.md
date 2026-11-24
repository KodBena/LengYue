# Branch and dependency-maintenance backlog

**Status:** frontend dependency CI implemented on `main`; propagation to `gne` is held pending a passing baseline test suite  
**Scope:** repository maintenance / GitHub automation  
**Context:** branch review and Dependabot review, 2026-11-24

## Goal

Make dependency maintenance follow the branches that are deliberately supported,
rather than letting every historical branch become a separate maintenance
obligation.

In practical terms: Dependabot should open update pull requests only for the
branch or branches that represent supported product lines. A branch kept only
for history, documentation, or an old experiment should not keep receiving
routine dependency-update pull requests.

## Current branch contract

The intended roles are:

- `main`: vanilla KataProxy compatibility line.
- `gne`: provisional active development line.
- `next`: historical/intermediate line; its current head is already contained
  in `gne`. It can be treated as deprecated for new development, but the
  branch should be retained as historical evidence.
- Other historical/documentation branches: preserve them; do not make them
  routine dependency-maintenance targets unless their purpose changes.

The ancestry check found that the current heads of both `main` and `next`
are ancestors of `gne`. `main` and `next` themselves diverged, so the
history is not a simple `main → next → gne` chain.

## Why this matters

Dependabot creates a pull request for each configured branch/update target.
If old branches remain configured as targets, the same dependency can produce
multiple update pull requests. Those branches then need separate review,
testing, and merge decisions—even when nobody intends to ship from them.

That is maintenance work without a corresponding supported product.

## Proposed work

1. **Confirm the supported release targets.** Decide whether `main` and
   `gne` are both independently maintained/shipped, or whether one is the
   canonical dependency-update source and changes are deliberately propagated
   to the other.
2. **Inspect the existing Dependabot configuration.** Inventory every package
   ecosystem, directory, schedule, and branch target in
   `.github/dependabot.yml` (or the actual configuration path).
3. **Configure only supported targets.** Remove routine update targeting for
   `next` and historical branches. Keep security-update coverage for every
   branch that is genuinely supported.
4. **Define the propagation rule.** If updates are raised against `main`,
   specify how and when they are integrated into `gne` (for example, through
   an ordinary forward-integration pull request with the full `gne` checks).
   Do not assume that ancestry automatically propagates later commits.
5. **Avoid duplicate work.** Group related updates where that preserves
   compatibility and reviewability; keep runtime and development dependencies
   distinguishable; do not group unrelated ecosystems merely to reduce PR
   count.
6. **Verify the result.** Confirm that Dependabot creates the intended PRs on
   the supported branch set, that lockfiles are updated, and that each
   supported line has appropriate CI coverage.
7. **Document the operating rule.** Explain which branch receives dependency
   updates, how updates reach the other supported line, and why historical
   branches are excluded.

## Acceptance criteria

- The supported branch set and the role of each branch are written down.
- Dependabot's configured update targets match that set; deprecated and
  historical branches are not routine targets.
- Security updates still reach every branch that is actually supported.
- There is one explicit, reviewable propagation path between supported lines.
- CI validates the dependency changes on each supported line before merge.
- No branch history is rewritten or deleted as part of this work.

## Decisions still needed

- Is `gne` independently shipped/deployed, or is it a development line whose
  changes are eventually promoted elsewhere?
- Should dependency PRs target both `main` and `gne`, or target one branch
  with a defined forward-integration process?
- What minimum CI checks are required for backend, frontend, and Rust/Tauri
  dependency updates?

## Maintenance-mode CI decision

On 2026-11-24, the automatic doc-graph freshness gate was made manual-only.
The workflow `.github/workflows/doc-graph-ci.yml` and generator
`tools/doc-graph/generate.mjs` are retained for a future maintainer, but the
workflow now runs only through an explicit manual dispatch. Documentation
graph freshness is not an acceptance criterion for maintenance-mode changes.
This is a deliberate scope decision, not deletion of the capability.

## Current maintenance observation

The Dependabot batch reviewed on 2026-11-24 contained 12 open PRs, all targeting
`main`. Two backend pin updates had successful `source-headers-ci` runs.
The ten frontend/Tauri PRs had failed `frontend-ci` runs. The failures include
repository ratchet/audit gates and a lint failure; they must be diagnosed at
the defect-class level rather than bypassed or waived just to merge dependency
updates. See the individual PRs in the repository for the exact run details.


## Frontend dependency CI profile — implementation

On 2026-11-24, PR #484 implemented the dependency-aware frontend CI profile on
`main` (`.github/scripts/classify_frontend_change.py` and
`.github/workflows/frontend-ci.yml`).

The change-impact classifier is fail-closed:

- Only the known frontend dependency manifest/lockfile paths can qualify for
  dependency-only validation.
- For `package.json` and `Cargo.toml`, it parses the manifest and confirms
  that non-dependency fields are unchanged. Unknown paths, malformed manifests,
  mixed application/test/build changes, and changed non-dependency manifest
  fields require the full application gates.
- CI control-plane changes may accompany validated dependency-only changes.
  This is needed for a normal merge-forward when `main` carries both the CI
  policy and dependency changes.
- Dependency updates still run `npm ci`, typecheck/build, and the full
  unit/integration test suite. Tauri dependency updates also run
  `cargo test --locked --all-targets`.
- The Rust test job supplies a test-only Tauri config overlay to omit the
  separately packaged PyInstaller sidecars. It does not skip Rust compilation
  or tests. Source formatting was intentionally not added to the lockfile-only
  validation path because the pre-existing Rust tree does not pass
  `cargo fmt --check`.
- Application-source gates (ESLint, band-conformance, cycle, layout, and
  style-token audits) remain enabled for application/test/build or
  unclassified changes. No baselines or source checks were weakened.

The classifier self-tests and the mandatory npm install/build/test sequence
passed on the CI-policy PR. The dependency updates merged to `main` after
their current-head checks passed include the earlier Brotli, PyJWT, Vite,
source-map-js, Vitest, js-yaml, postcss-selector-parser, undici, and rustls
updates. The rustls update additionally passed the locked Cargo test job.

## gne propagation status

PR #485 is the ordinary merge-forward of the CI policy from `main` to
`gne`. Its classifier succeeds and its locked Rust tests, npm install, and
typecheck/build pass. Its full frontend test suite fails with 18 assertions in
unchanged `gne` source/test areas, including MiniBoard SVG parity, StatusBar
control sizing, pointer-target CSS, stencil geometry, system-message sink
counts, and context-ID macro calls.

These failures are outside PR #485's changed source paths. The same mandatory
frontend suite passed on the corresponding dependency-only `main` PRs. This
does not prove the unmodified `gne` head is independently clean; it establishes
that propagation is currently blocked by test failures on the merged `gne`
tree. Do not merge #485 by skipping or weakening the test job. Diagnose the
failure classes against the `gne` source/test contracts before retrying the
forward integration.

The open dependency PRs remaining after this batch should be refreshed against
the latest `main` and revalidated after each shared-lockfile merge. Old green
runs on earlier heads are not sufficient evidence for the final lockfile tree.


### First defect-class diagnosis from the gne test failures

The `context-id-macros` failures have a confirmed contract mismatch:

- The current `gne` implementation of `expandContextIdMacros` accepts
  `readonly number[]` so wildcard expansion can enumerate known ordinals.
- The production caller in `ForestDirectory.vue` now supplies that array.
- The unit tests still pass the old `(ordinal: number) => boolean`
  membership predicate. The test runtime therefore reaches
  `new Set(knownGameSourceOrdinals)` with a function and throws
  `TypeError: function is not iterable`.

The general defect class is *typed API drift at a test boundary*: callers of a
changed function contract remain syntactically executable because the test
sources are not part of the TypeScript build. The typing discipline that
would make this particular mismatch unrepresentable is a strict TypeScript
project for test sources, referencing the same source contracts, with that
project included in CI. The existing root `tsconfig.json` references only
`tsconfig.app.json` (which includes `src/**`) and `tsconfig.node.json`
(which includes `vite.config.ts`); there is no test tsconfig. Vitest's runtime
transformation consequently executes these tests without first checking
their argument types.

The operational lapse was treating `vue-tsc -b` as comprehensive TypeScript
validation while its project graph excludes `tests/**`. Before fixing
individual tests, establish and run a strict test typecheck; then update the
tests to the authoritative `readonly number[]` contract and re-run the suite.
Do not restore the old callback or weaken the function signature.

The other observed failure groups—SVG serialization, StatusBar sizing,
pointer-target CSS, stencil geometry, and system-message sink counts—remain
unclassified. Their assertions and production contracts need comparison
before deciding whether implementation or tests are wrong. No baseline changes
or expectation rewrites are authorized by this diagnosis alone.

## Work-tracking note

The repository's `docs/TODO.md` says the canonical work-item status lives in
the separate `todo` PostgreSQL database and that this Markdown file is only a
generated/human-maintained index. This note is therefore explanatory backlog
documentation, not a claim that the corresponding database work item has
already been created. When the work-status database is available, register
this item there and link back to this document.


## Dependency batch closure — 2026-11-24

The reviewed Dependabot batch is now clear: the latest open-PR query returned
no open Dependabot pull requests. The following dependency updates were merged
to `main` after current-head validation:

- Backend pins: PyJWT (#467) and Brotli (#473).
- Frontend/Tauri: Vite (#472), source-map-js (#470), Vitest (#465),
  js-yaml (#466), postcss-selector-parser (#471), undici (#474),
  rustls (#475), vue-i18n (#483), and brace-expansion (#482).

The nanoid PR (#479) was closed by Dependabot because it determined the
dependency was already up to date. All merges used ordinary merge commits.
The remaining frontend dependency PRs were refreshed after each shared
lockfile merge and tested again on their final combined lockfile heads. The
rustls update also passed `cargo test --locked --all-targets` using the
test-only Tauri sidecar overlay described above.

The main-branch push validation for the latest dependency merge commit
(`ec84b99`) was still running at the time of this note update; the preceding
main push validation on `80c5201` completed successfully. Do not infer a
failure on a main push from PR #485: that failing check is the pull-request
validation for a merge-forward whose head is `main` and whose base is `gne`.

PR #485 remains open and unmerged. The current `gne` merge-result frontend
suite has the 18 test failures described above. It is not a dependency PR and
is the only maintenance-related open PR. No failed check has been waived, no
ratchet baseline lowered, and no source/test expectation changed to obtain a
green result.
