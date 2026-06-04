# Deferred-items vestige (open) — a deliberate blemish

This directory is what became of `docs/notes/deferred-items.md` when the
work-status SSOT consolidation dissolved it on 2026-06-02. Each file here is
**one open deferred item**, named by its SSOT id (`<id>.md`), carrying the
working-memory prose of the original ledger entry.

**This directory is meant to be ugly.** The maintainer's framing: *"the
fact that deferred-items even exist is a blemish that we should resolve as
soon as expedient."* A flat pile of one-item files is a nail in the eye on
purpose — it makes the backlog of un-closed working-memory items visible and
slightly irritating, so the pressure is to *resolve* them, not to let them
accumulate quietly in a tidy ledger.

How it works:

- **Status is not here.** Each item's canonical open/closed status lives in
  the work-status store (the `todo` Postgres DB). The filename *is* the
  back-reference: a file `surface-1-backgrounds-audit.md` is the prose for
  store item `surface-1-backgrounds-audit`. Query it:
  `psql -h 192.168.122.1 -d todo -c "SELECT * FROM items WHERE id='<id>'"`.
- **Open only.** These are the *unresolved* items. When one ships, its file
  moves to the archive counterpart,
  `docs/archive/notes/vestige/deferred-items/` (implemented work belongs in
  the archive, not in `docs/notes/`).
- **No new entries here.** New working-memory items go straight into the
  SSOT as `state: open` items; this directory only holds the dissolved
  legacy ledger and shrinks as items close.

The genre boundary the old ledger named still holds:
`docs/notes/decisions-deferred.md` is a *distinct* genre (decisions made
*against* action, with revisit triggers) and was **not** consolidated.

License: Public Domain (The Unlicense).
