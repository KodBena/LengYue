# Worklog — work-status store audit trail (2026-06-11)

> Audit trail for the PR attesting the store's new history layer
> (maintainer-approved 2026-06-11: the hand-rolled, no-extension design —
> the host carries no temporal extensions and vanilla PostgreSQL has no
> native SYSTEM_TIME AS OF). The live DDL was applied by the coordinating
> session ahead of this PR per the ratified staging convention; this PR is
> the in-repo attestation (schema.sql §Audit trail), the discovery surface
> (umbrella CLAUDE.md work-status bullet), the per-commit time-travel
> helper (tools/work-status/asof.sh), and the reseed re-baselining
> (migrate-to-pg.py calls audit_genesis_snapshot() post-load, guarded).

## The change

- `audit_log` + `record_audit()` triggers on items/refs/labels/deps/meta;
  actor = application_name; optional commit anchor via the `audit.commit`
  GUC (set on ship-closures, null elsewhere — absence is honest).
- `table_asof(tbl, t)` — reconstruction is a single indexed DISTINCT ON
  query; transaction-granular (`at` is xact-stable now(); audit_id orders
  within). At the store's scale (~600 rows across tables) it is effectively
  instant.
- `audit_genesis_snapshot()` — baseline rows tagged 'genesis-snapshot';
  called at install and after every reseed.
- Deliberate carve-out: the audit objects are NOT in schema.sql's
  drop-and-recreate list; triggers are re-created unconditionally since
  DROP TABLE kills them silently; the reseed discontinuity (DROP fires no
  row triggers) is closed by the loader's genesis call.

## Install-time verification (run live, 2026-06-11)

- Probe cycle on `meta` (insert→update→delete): three trail rows, correct
  ops, actor='coordinator'.
- Reconstruction equality: `table_asof('items', now())` = live table,
  141/141 rows, 0 mismatches.
- Genesis: 597 rows baselined across the five tables.
- First real entries: the Wave-1 ship-closures (PRs #396–#402), recorded
  with commit anchoring.

## Notes

- ADR-0011 Rule 1 register: an advisory-recording write-time surface (it
  refuses nothing; it makes history reconstructable) — the mechanization of
  the umbrella CLAUDE.md's ledger-everything clause for store curation.
- The dated-description-append convention stays: appends are the
  reader-facing record inside an item; the trail is the mechanical
  substrate underneath (recoverability + verification).
- Backend cards-DB "no row-level audit log" rough edge: this is now the
  in-project worked precedent if that ever matters. not-filed: the backend
  edge is already recorded in docs/handoff-current.md's rough-edges list.

License: Public Domain (The Unlicense).
