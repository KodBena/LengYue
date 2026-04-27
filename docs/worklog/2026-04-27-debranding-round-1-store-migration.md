# De-branding Round 1 — Store Migration `1 → 2` (Theme / Cardset / Palette)

- **Status:** Shipped on branch
  `frontend/debranding-round-1-store-migration`, 2026-04-27.
  `npm run build` green; manual smoke + cleanup confirmed by user
  on existing-profile and new-profile paths.
- **Genre:** Worklog entry — first practical use of the
  schema-versioning framework (PR #10), with a mid-execution
  lesson about defensive collision-guards.
- **Date:** 2026-04-27.
- **Origin:** `docs/notes/auditor-notes.md` item #2 (closed in
  PR #10) named the de-branding tier as the forcing function for
  the framework. PR #10 shipped the framework. This PR ships the
  framework's first user — the migration that retires three
  Medium-tier TODO entries (theme, default card-set, default
  palette formula) as one principled step.

## Context

Three Medium-tier de-branding entries in `docs/TODO.md`:

1. **Theme**: `'ebisu-dark'` → `'dark'`, `'ebisu-light'` →
   `'light'` in `profile.settings.appearance.theme`.
2. **Default card-set id**: `'default_ebisu'` → `'default'` in
   `profile.cardSets[id]` keys plus `session.ui.activeCardSetId`.
3. **Default palette formula name**: `'ebisu_delta'` →
   `'quality_delta'` in `profile.settings.engine.katago.analysis_env.symbols`
   keys plus `palettes[*].delta_fn` references.

Each independently proposed an ad-hoc rewrite-on-hydrate shim;
PR #10's schema-versioning framework lets them all land as one
migration `1 → 2` in the registry. This PR plus `defaults.ts` /
`types.ts` updates so new users get the new identifiers
directly, existing users have their stored blobs forward-migrated
on next hydrate.

Out of scope for this PR (deferred to a "round 2" sweep):
- File rename `ebisu-service.ts` → `backend-service.ts`.
- localStorage auth keys rename (`ebisu_jwt_token` → `auth_token`,
  `ebisu_username` → `auth_username`) with one-shot compat shim.
- Documentation prose sweeps.
- Source-comment de-brands.
- `docs/archive/` policy decision.

## Approach

### `frontend/src/store/migrations.ts`

`CURRENT_SCHEMA_VERSION` bumped from 1 → 2. `migrations[]` gains
the `1 → 2` migration as its first entry. The migration uses
`structuredClone` for the no-mutation contract (matches
`resetWorkspace`'s pattern), then performs five rewrites:

1. `theme === 'ebisu-dark'` → `'dark'`; `'ebisu-light'` → `'light'`.
2. `cardSets.default_ebisu` → promote to `cardSets.default`
   (with `id` field rewritten); delete the old key.
3. `session.ui.activeCardSetId === 'default_ebisu'` → `'default'`.
4. `symbols.ebisu_delta` → promote to `symbols.quality_delta`;
   delete old key.
5. `palettes[*].delta_fn === 'ebisu_delta'` → `'quality_delta'`.

### `frontend/src/store/defaults.ts`

Eight line edits — five identifier renames and three prose
updates. New users get the v2 shape directly, no migration
needed at first save (because `buildPersistencePayload` stamps
`CURRENT_SCHEMA_VERSION` directly).

### `frontend/src/types.ts`

The `theme` literal-union narrows from `'ebisu-dark' | 'ebisu-light'`
to `'dark' | 'light'`. ADR-0001-honest: post-migration data shape
and type stay in agreement.

## Mid-execution lesson — defensive collision-guards considered harmful here

The first version of the migration carried defensive
collision-guards on the two key-rename paths:

```typescript
// First version (now removed)
if (cardSets && cardSets.default_ebisu && !cardSets.default) { ... }
if (symbols && 'ebisu_delta' in symbols && !('quality_delta' in symbols)) { ... }
```

The guards' stated intent: "if the user somehow has both old and
new keys (e.g., a custom card-set named 'default'), preserve
their custom 'default' rather than overwrite." Sound-sounding.

In practice, the user's smoke surfaced a 3-key state in the
in-memory store after hydrate:
`['default', 'fringe_first', 'default_ebisu']`. Diagnosing:

1. `store.profile` initializes from new defaults at module init:
   `cardSets = {default, fringe_first}`.
2. Hydrate fetches the v1 blob from backend:
   `cardSets = {default_ebisu, fringe_first}`.
3. Migration's `migrate(blob)` runs. Per the input alone — blob
   has `default_ebisu`, not `default` — the guard would pass.
   *But*: a watcher-fired save during a prior session already
   committed a hybrid state to the backend (path B below), so
   the actual blob input had both keys.
4. With both keys in the input, the guard's third clause
   (`!cardSets.default`) was false. The rename was *skipped*.
   The blob retained both keys.
5. `updateFromRemote` then `deepMerge`d the (un-renamed) blob
   onto `store.profile`. `deepMerge` copies target's keys, then
   adds source's keys not in target. Result: 3 keys.
6. The watcher's next save committed the 3-key state. Backend
   now persistently in 3-key state. Subsequent hydrates: blob
   at v2 (no migration), 3-key state preserved.

How the hybrid state arose initially (path B, step 3 above):
during the first reload after this PR's code loaded, the *very
first* migration *did* rewrite the blob correctly (1 → 2,
single-key result). But somewhere between then and the user's
snapshot, a save fired with the new defaults' `cardSets.default`
present alongside the migrated `default_ebisu` (perhaps from a
HMR-triggered store re-init order, or a watcher firing
mid-`updateFromRemote` before the rename completed) — and that
save persisted the hybrid.

The honest fix: **always promote** `default_ebisu` to `default`
(and `ebisu_delta` to `quality_delta`), even on apparent
collision. The reasoning that justifies this: in this codebase,
users don't manually create card-sets with id literal `'default'`
or symbols literal `'quality_delta'`. If both keys exist in a
blob being migrated from v1, the "new" key is an
auto-generated template; the user's actual customization (or the
auto-generated v1 default) lives at the old key. Preferring the
old key's data is the more user-respectful outcome.

The wider lesson, captured here for future migrations:

> Defensive collision-guards in migrations should ask "is the
> destination identifier something the user might have
> *intentionally* created" — not "is the destination identifier
> *somehow* present in the input." With `deepMerge`-style
> hydration patterns, the destination can appear in the input
> via paths the migration author didn't anticipate (template
> seeding from new defaults, prior partial migrations,
> watcher-fired saves mid-hydrate). If the destination
> identifier is auto-generated by the system rather than
> user-authored, the guard should not fire — always promote
> the user's data to the canonical key.

The user's existing-profile blob was already in the 3-key
hybrid state when this lesson surfaced. Fix path:
- Code: drop the collision-guards, always promote.
- Data: manual cleanup via console (`delete
  store.profile.cardSets.default_ebisu` plus
  `delete ...symbols.ebisu_delta`, then Force Persistence).
- Verification: synthetic v1 blob (PUT-ed via console) hydrates
  to clean v2 with no orphans.

## Critical files

- **Edited:** `frontend/src/store/migrations.ts` — bump
  `CURRENT_SCHEMA_VERSION` to 2; register `migrations[0]`
  (the 1 → 2 migration, with the mid-execution
  collision-guard removal).
- **Edited:** `frontend/src/store/defaults.ts` — eight line
  edits across identifier renames and prose updates.
- **Edited:** `frontend/src/types.ts` — line 176, theme
  literal-union narrows to `'dark' | 'light'`.

## Reused existing surface

- The schema-versioning framework from PR #10 — `migrate()`,
  `migrations[]`, `CURRENT_SCHEMA_VERSION`,
  `buildPersistencePayload`. The migration plugs into
  `migrations[0]`.
- `structuredClone` for the migration's no-mutation contract.
- `EbisuRecallKey` references in `defaults.ts:74` and
  `ebisu-service.ts` (algorithm-correct; preserved per the
  TODO's preservation note — out of scope by design).

No new types, no new services.

## Verification

1. **Static check.** `npm run build` green
   (`vue-tsc -b && vite build`, 1.83s, 842 modules).

2. **Manual smoke** confirmed by user:

   - **New profile path.** `localStorage.clear()` + reload as
     `local_user`: defaults give `'default'`, `'quality_delta'`,
     `'dark'` directly. ✓
   - **Existing-profile path** (after the cleanup recipe was
     run): in-memory state shows
     `cardSets: ['default', 'fringe_first']`,
     `symbols` with `quality_delta` and no `ebisu_delta`,
     `theme: 'dark'`, `activeCardSetId: 'default'`,
     `palettes[0].delta_fn: 'quality_delta'`. ✓
   - **Synthetic v1 blob** (planted via console PUT, then
     reloaded): the now-aggressive migration rewrites cleanly
     to v2 shape — no orphans. ✓ (This is the regression test
     for the collision-guard lesson.)

3. **Save stamps v2.** Force Persistence commits
   `schemaVersion: 2` plus the renamed identifiers throughout.

## Out of scope (explicitly)

- **File rename `ebisu-service.ts` → `backend-service.ts`** —
  follow-up PR; touches many import sites.
- **localStorage auth keys rename** (`ebisu_jwt_token` →
  `auth_token`, `ebisu_username` → `auth_username`) — different
  storage layer (api-client localStorage, not the GlobalStore
  blob), different migration mechanism (one-shot compat shim).
  Follow-up PR.
- **Documentation prose sweeps** (handoff-current.md,
  frontend/README.md, frontend/CLAUDE.md, dispatch, ADR-0002).
  Follow-up PR.
- **Source-comment de-brands** in api-client.ts:3, env.ts:26,
  ebisu-service.ts:2-3. Follow-up PR.
- **`docs/archive/` policy decision** — user decision, not
  coding work.
- **EbisuModel / EbisuRecallKey renames** — algorithm-correct;
  preserved per the TODO's preservation note.
- **A v2 → v3 cleanup migration** for users who happened to be
  in the hybrid state mid-PR-testing. The user (the only one
  affected) ran the manual cleanup recipe; no other deployed
  users to worry about pre-merge. If a hybrid-state user
  surfaces post-merge, manual cleanup is still the right path
  (one-shot, console-pasteable).

## Documentation follow-up

- This worklog entry.
- **`docs/TODO.md`** — three Medium-tier entries retired
  (theme identifiers, default card-set id, default palette
  formula). Moved to the Completed Frontend table with a
  one-line synopsis pointing at this PR.
- No `deferred-items.md` entry.
- No ADR amendment triggered. The collision-guard lesson is
  worklog-shaped — a concrete pattern surfaced during a
  specific PR, captured here for citation by future migrations
  rather than promoted to a tenet.

## Branch + PR workflow

Branched off main post-PR-#10 merge (`565bf45`). Single PR to
main. Establishes the migration registry's first entry plus the
"always promote, never collision-guard" convention for future
identifier renames.

Branch name: `frontend/debranding-round-1-store-migration`.
