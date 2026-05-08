# Store Schema Versioning + Hydrate Migration Framework

- **Status:** Shipped on branch
  `frontend/store-schema-versioning`, 2026-04-27.
  `npm run build` green; manual smoke confirmed by user.
- **Genre:** Worklog entry — framework PR closing auditor
  observation #2 (the auditor's #1 priority from yesterday's
  entry).
- **Date:** 2026-04-27.
- **Origin:** `docs/notes/auditor-notes.md` item #2; the
  forcing function was the de-branding tier in `docs/TODO.md`
  whose three "rewrite-on-hydrate shim" entries were heading
  toward ad-hoc accretion without a unifying frame.

## Context

The auditor flagged that `SyncService` PUTs the entire
GlobalStore-shaped blob and that the handoff explicitly named
the risk: "stale values can appear after a redeploy — either
bump a schema version or clear the local user's saved state."
The de-branding tier in TODO (theme identifier rename, default
card-set id rename, default palette formula rename) was
proposing three independent rewrite-on-hydrate shims; landing
those without a unifying versioning frame would have left three
overlapping pieces of one-shot migration logic in the codebase.

This PR ships the frame. `CURRENT_SCHEMA_VERSION = 1`, an
empty append-only `migrations[]` array, a `migrate()`
orchestrator, plus the wiring that makes outbound saves stamp
the version and inbound hydrations migrate before applying.

The de-branding PR (next on the Path A ladder) lands the three
renames as one migration `1 → 2` in the registry. Future schema
changes append `2 → 3`, etc.

## Approach

### `frontend/src/store/migrations.ts` (new)

A pure-function module owning the versioning logic. Public
exports:

- `CURRENT_SCHEMA_VERSION` — integer, currently `1`.
- `migrations: Migration[]` — append-only array;
  `migrations[i]` migrates from version `(i + 1)` to `(i + 2)`.
  Currently empty.
- `migrate(blob)` — orchestrator. Treats missing
  `schemaVersion` as 1 (legacy = framework-introduction
  version). Runs registered migrations in order. Returns the
  migrated blob with `schemaVersion` stamped. Throws on
  future-version blobs (rolled-back code) and on missing
  migrations (defensive — shouldn't happen with append-only
  discipline).

The file's JSDoc names the integer-monotonic versioning
scheme, the append-only invariant (write-once migrations), the
add-a-migration recipe, the missing-version legacy treatment,
and the ADR-0002 fail-loud contract.

### `frontend/src/store/index.ts`

Two wiring changes:

- **`updateFromRemote` runs `migrate()` first.** Signature
  widens to `Partial<GlobalStore> & { schemaVersion?: number }`;
  the body reads from `migrated` instead of `remoteData`.
  Existing field-by-field application (boards, activeBoardIndex,
  profile, session) is preserved verbatim. Migration failures
  throw out, propagating to SyncService's existing hydrate
  catch.
- **New `buildPersistencePayload()` export.** Returns the
  outbound blob with `schemaVersion: CURRENT_SCHEMA_VERSION`
  stamped. The store owns both the schema and the persistence
  shape; SyncService becomes a pure transport.
- Re-exports `CURRENT_SCHEMA_VERSION` and `migrate` from the
  store module's surface so callers can reach them through
  `../store` rather than the deeper `../store/migrations` path
  if they want to.

### `frontend/src/services/sync-service.ts`

`sendSync` replaces inline payload construction with a single
`const payload = buildPersistencePayload();` call. SyncService
no longer references the persistence shape's individual
fields — it just transports the result of the builder. Import
list updated accordingly.

### Failure semantics (ADR-0002)

Three failure paths, all loud:

- **Future-version blob** (rolled-back code, or schema bump
  that hasn't propagated): `migrate` throws. SyncService's
  existing hydrate catch surfaces "Sync: workspace did not
  load. Your changes will not persist this session." The store
  stays at defaults; `hydratedForUserId` stays null; the gate
  stays closed; no saves. The user's too-new backend blob is
  preserved unchanged.
- **Missing migration for a required step**: defensive throw
  inside `migrate`. Same propagation path as above.
- **Migration body throws** (programmer bug or corrupt data):
  Same propagation path.

The hydrate generation counter (B5 finalization's race guard)
continues to apply — it's checked before `updateFromRemote` is
invoked, so migrate-on-hydrate runs only for the latest
generation.

### Auditor #2 retired

Per `auditor-notes.md`'s ledger discipline, item 2's body has
been replaced with a one-line closure note pointing at this
branch and naming what shipped. The heading stays as
historical record.

## Critical files

- **Created:** `frontend/src/store/migrations.ts` (~100 lines
  including JSDoc).
- **Edited:** `frontend/src/store/index.ts` (import + 
  re-export from migrations; `updateFromRemote` signature
  widening + migrate call; new `buildPersistencePayload`
  export).
- **Edited:** `frontend/src/services/sync-service.ts` (import
  list updated; `sendSync` uses `buildPersistencePayload`).
- **Edited:** `docs/notes/auditor-notes.md` (item 2 retired
  in-place per ledger discipline).

## Reused existing surface

- `updateFromRemote`'s field-by-field application logic
  (`deepMerge`, `normalizeBoard`, the boards/activeBoardIndex/
  profile/session reads) — preserved verbatim, only the input
  source changes.
- `hydrate`'s existing try/catch + system-message error
  surfacing — inherits migration-failure handling for free.
- `boardsVersion`, `pushSystemMessage`, all existing store
  exports — unchanged.
- The hydration generation counter from B5 finalization — its
  race-guard semantics continue to apply unchanged.

No new types beyond a local `Migration` alias inside
`migrations.ts`.

## Verification

1. **Static check.** `npm run build` green
   (`vue-tsc -b && vite build`, 1.90s, 842 modules — one more
   than before, the new `migrations.ts`).

2. **Manual smoke** in the live dev server (HMR-applied);
   user-confirmed:

   - **Reload while logged in.** Workspace hydrates as before;
     no errors. Existing-blob (no `schemaVersion` field)
     migrates through the legacy=1 path; current=1; no
     migrations run; data applied. ✓
   - **Force Persistence stamps the version.** PUT body's
     `data` includes `"schemaVersion": 1` alongside `boards`,
     `activeBoardIndex`, `profile`, `session`. ✓
   - **Re-hydrate after stamped save.** Blob now carries
     `schemaVersion: 1`; migrate sees current==stamped; no
     migrations; applied. No errors. ✓

3. **No-regression check.** B5 finalization, auth-lifecycle
   UX, and TODO #28 (JWT 401 retry) flows continue to work —
   none of their code paths touched the persistence shape.

## Outcomes

- Schema-aware persistence layer.
- Pattern established for future schema evolution
  (append-only migrations, monotonic integer versions, missing
  = legacy = 1, fail-loud on future-version or missing
  migration).
- The de-branding tier's three rewrite-on-hydrate shim
  proposals are now landable as one principled migration in a
  follow-up PR.
- Auditor observation #2 closed.

## Out of scope (explicitly)

- **The de-branding migration `1 → 2`.** This PR ships the
  empty registry; the de-branding PR uses it. Splitting into
  two PRs keeps the framework introduction reviewable on its
  own.
- **Migration testing infrastructure.** `migrate` is a pure
  function and trivially testable from a console or future
  test file; building a harness today is premature.
- **Schema documentation in `docs/`.** The framework's JSDoc
  in `migrations.ts` is the documentation. ADR-0005 Rule 1
  (single source of truth) — a separate `docs/notes/schema-
  versioning.md` would be a duplicate.
- **Backward migrations (`N → N-1`).** Forward-only is the
  contract. Rolling back code on a too-new blob throws; the
  blob is preserved untouched until forward code is restored.
- **Per-field versioning** (e.g., `profile.schemaVersion`).
  One whole-blob version is sufficient and simpler.

## Documentation follow-up

- This worklog entry.
- `docs/notes/auditor-notes.md` item 2 retired.
- No `deferred-items.md` entry; no ADR amendment; no RFC
  update.

## Branch + PR workflow

Branched off main post-PR-#9 merge (`38db922`). Single PR to
main. Establishes the pattern; no behavior change. Sets up the
de-branding PR (next on the Path A ladder).
