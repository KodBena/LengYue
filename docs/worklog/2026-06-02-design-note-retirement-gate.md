# Worklog — design-note retirement advisory (2026-06-02)

## Question

Design notes are load-bearing, must-read docs that accumulate under
`docs/notes/`. The doc-retirement leg of `adr-effectiveness-audits` wants a
mechanism to surface which ones are stale enough to archive. The maintainer
flagged this as the thing to do *immediately after* the surrender-status
consolidation (work-status SSOT). SSOT item:
`design-note-retirement-archive-gate`.

## The derivation that makes it cheap

The consolidation already linked each work item to its planning doc via
`design-note`-kind refs in `docs/work-status.json`. That makes retirement
*derivable* rather than a judgment call about each note's content: a live
design note (under `docs/notes/`) whose **every** referencing SSOT item is
`closed` has no open work depending on it → archival candidate. No new
metadata, no frontmatter sweep, no second hand-maintained list — the SSOT
linkage that already exists is the signal.

## Shape

`tools/work-status/retire-advisory.mjs` — a third sibling alongside
`check.mjs` (validity) and `sql.mjs` (query), keeping responsibilities clean:
this tool answers *"which design notes are archival candidates?"*, a
doc-lifecycle question distinct from *"is the SSOT well-formed?"*.

- Reads `docs/work-status.json`; groups `design-note` refs by target; flags
  targets under `docs/notes/` whose referencing items are all closed.
- **Advisory, never gates** (exit 0 always). Archival is an editorial
  judgment — a note may retain residual value — and archiving breaks inbound
  cross-references, so it costs a cross-reference audit to reach homeostasis
  (the `docs/notes/consolidation-xref-fallout.md` pattern is the template).
- Scope is deliberate: `docs/archive/notes/...` targets are excluded for free
  (they don't start with `docs/notes/`); `frontend/docs/` and other trees have
  their own lifecycle; a design note with no SSOT `design-note` ref is
  invisible (retirement is keyed on the linkage, not a filesystem `*-plan.md`
  sweep). The header documents these limits.
- `--selftest` proves it flags an all-closed-referencer note and spares the
  open / mixed-open-and-closed / already-archived / out-of-tree / wrong-ref-
  kind cases.

Wired into `.github/workflows/work-status-ci.yml` as two steps (the advisory
+ its selftest), mirroring the checker/sql selftests. `tools/work-status/**`
already triggers the workflow, so no path change.

## What it finds

On first run, two legitimate candidates — both genuinely done:

- `docs/notes/documentation-graph-artifact-plan.md` ← `doc-graph-artifact`
  [shipped] — a real design note whose feature is implemented.
- `docs/notes/audit-stringly-typed-contracts-2026-06-01.md` ←
  `stringly-typed-api-errors` [shipped] — an audit record; a candidate, though
  "residual value" may argue for keeping it (the advisory leaves that to the
  human, by design).

Closing this item (`design-note-retirement-archive-gate`) makes a third
appear: `docs/notes/consolidation-xref-fallout.md`, whose only referencer is
now this (closed) item. That is correct — the fallout artifact's job is done
once the gate ships. The gate flagging its own enabling artifact is the
mechanism working, not a bug.

These candidates are **surfaced, not actioned** — archiving each is a separate
editorial step with its own cross-reference audit, on the maintainer's call.

## Verification

- `node tools/work-status/retire-advisory.mjs` → 2 candidates, exit 0.
- `node tools/work-status/retire-advisory.mjs --selftest` → 1 case, 0 failures.
- `node tools/work-status/check.mjs` → PASS (SSOT still valid after closing
  the item); both existing selftests still green.

## Files

- `tools/work-status/retire-advisory.mjs` (new)
- `.github/workflows/work-status-ci.yml` (two steps + header)
- `docs/work-status.json` (`design-note-retirement-archive-gate` → closed/
  shipped, refs this worklog)

License: Public Domain (The Unlicense).
