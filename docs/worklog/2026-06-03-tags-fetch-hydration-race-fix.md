# Worklog — fix tags-fetch-hydration-race (move knownTags out of the persisted profile) (2026-06-03)

## Trigger

Work-status item `tags-fetch-hydration-race` (frontend / bug). `useAppBootstrap`'s
`onMounted` wrote `store.profile = { ...store.profile, knownTags }` right after a
fire-and-forget `sync.connect()`; if the `getTags()` fetch won the race,
hydration's `updateFromRemote` → `deepMerge` reverted `knownTags` to the
persisted snapshot. Surfaced 2026-04-27 (B5 / identity-aware SyncService),
deferred as benign, never fixed.

Before acting, an Opus investigation (`docs/notes/consult/opus-consult-2026-06-03-knowntags-fence-and-boot-ordering.md`)
did the Chesterton's-fence check the maintainer asked for and surveyed the class.
Findings adopted here: the `knownTags`-in-profile fence is **incidental as
persisted data** (load-bearing only as a *reactive field* — `commitMint` unions
just-minted tags for the session; `/stats/tags` won't surface them until next
boot); it's a server-derived cache re-fetched every boot, so persisting it buys
only the sub-second cold-start flash the race corrupts. Only this one site is
genuinely racy (six sibling boot writers are already mitigated). Root: an unnamed
asymmetry — write-back-to-server is hydration-gated, read-server→write-store is
not, and this is the lone read-server→write-store path with neither a gate nor a
re-fire watcher. The maintainer chose the full structural fix (move-out +
invariant + test).

## The fix — move `knownTags` from `ProfileState` to a non-persisted `GlobalStore` field

`knownTags` is now a top-level `GlobalStore` field, not a `ProfileState` field.
Because `buildPersistencePayload` cherry-picks (`boards`/`activeBoardIndex`/
`profile`/`session`) and `updateFromRemote` merges only those, a top-level field
is **automatically excluded from persistence and untouched by hydration** — the
two writes now target different fields, so order can't matter. The race is
*structurally* impossible, not merely sequenced away.

- `types.ts`: `knownTags` removed from `ProfileState`, added to `GlobalStore`; the
  **invariant** is documented on `ProfileState` ("persisted profile holds
  user-authored data only; server-derived caches live as non-persisted top-level
  fields") and on the new field — the durable carrier of the rule, sitting where
  the next person would be tempted to re-add a `knownTags`-shaped field.
- `store/defaults.ts`: seed extracted to `defaultKnownTags`; removed from
  `defaultProfile`.
- `store/index.ts`: store-init seeds `knownTags` (cloned); `resetWorkspace`
  re-seeds it on identity-out (it no longer rides `profile`'s clone-reset — the
  one new cleanup obligation the move introduces, wired with the
  resource-ownership comment convention so the prior identity's dictionary can't
  leak).
- Consumers retargeted `store.profile.knownTags` → `store.knownTags`:
  `useMinting.commitMint` (read-modify-write, now a direct assign), `CardMetadataPanel`,
  `MintCardModal`.
- `useAppBootstrap.ts`: the racing write becomes `store.knownTags = tags.map(...)`,
  with a comment naming the closed race.
- **Migration 57 → 58** strips the now-stale `profile.knownTags` from persisted
  blobs (idempotent `delete`). Without it an old blob's key would survive
  `deepMerge` as a stray runtime key on `store.profile` and re-persist forever,
  half-defeating the move — so the invariant holds for the returning-user
  population, not just fresh installs. No value is carried forward (the boot fetch
  repopulates). `CURRENT_SCHEMA_VERSION` 57 → 58; rolling-archive moved 55 → 56
  into the archive (active body back to the latest two); range comments corrected.

## Guard (Part 3 of the investigation, proportionate)

The move-out *is* the structural guard (the invariant becomes enforced-by-shape),
plus the `ProfileState` invariant comment. Tests close the "zero coverage of the
hydrate boundary / deepMerge" gap the investigation flagged:

- `tests/unit/store/migrations.test.ts`: a 57 → 58 block (strip / idempotent /
  profile-absent / end-to-end walk).
- `tests/integration/hydration-knowntags.test.ts` (new): `buildPersistencePayload`
  excludes `knownTags`; `updateFromRemote` leaves `store.knownTags` untouched; a
  legacy blob's `profile.knownTags` is stripped on hydrate. These mostly guard
  against re-introduction now.

Per the investigation, deliberately **not** done: a general `SyncService.whenHydrated()`
gate or an ESLint rule — disproportionate for one (now-eliminated) instance; build
the gate only if a second instance of the class appears, at which point the
invariant comment makes it recognizable.

## Verification

`npm run build` green; `npm run test:run` 797 passed / 3 skipped (+7: 4 migration,
3 store-guarantee); `eslint .` clean; work-status checker green. No FEATURES.md
change (no user-facing capability change — autocomplete behaves identically).
`knownTags` is not a branded identifier, so no IDENTIFIERS.md change; no new `src/`
file, so no FILES.md change. Closes `tags-fetch-hydration-race`.

License: Public Domain (The Unlicense).
