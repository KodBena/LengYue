# Branch and dependency-maintenance backlog

**Status:** proposed; design and implementation not yet complete  
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

## Work-tracking note

The repository's `docs/TODO.md` says the canonical work-item status lives in
the separate `todo` PostgreSQL database and that this Markdown file is only a
generated/human-maintained index. This note is therefore explanatory backlog
documentation, not a claim that the corresponding database work item has
already been created. When the work-status database is available, register
this item there and link back to this document.
