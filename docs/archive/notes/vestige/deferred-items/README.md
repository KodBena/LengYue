# Deferred-items vestige (archive) — implemented / resolved entries

The archive counterpart of `docs/notes/vestige/deferred-items/`. When
`docs/notes/deferred-items.md` was dissolved on 2026-06-02 (work-status SSOT
consolidation), its entries whose work had already **shipped or otherwise
resolved** were archived here rather than kept in `docs/notes/` — implemented
work belongs in the archive, and only the *open* blemish stays visible under
`docs/notes/`.

Each file is one resolved entry, named by its SSOT id (`<id>.md`), preserving
the working-memory prose of the original ledger entry. Canonical status (and
resolution: shipped / superseded / dropped / deferred) lives in the
work-status SSOT (`docs/work-status.json`, where these are `state: closed`
items). Per the archive convention (ADR-0005), internal references point at
paths as they existed at capture time and are not retro-edited; some may
dangle, which is expected drift.

An open item's vestige file migrates *into* this directory from
`docs/notes/vestige/deferred-items/` when it ships.

License: Public Domain (The Unlicense).
