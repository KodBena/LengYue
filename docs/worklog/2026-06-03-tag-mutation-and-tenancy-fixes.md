# Worklog — mint-tag drop, tag-mutation SSOT, tenancy instance-cache leak (2026-06-03)

## Trigger

Three bugs the maintainer found while testing the `tags-fetch-hydration-race`
fix. An Opus investigation
(`docs/notes/consult/opus-consult-2026-06-03-tag-ssot-and-tenancy-leak.md`)
confirmed all three **pre-existing** (the knownTags field-move did not cause
them) and mapped each to root cause + fix + the missing test. The maintainer's
framing: the real defect is the **absent test coverage** that let these rot, so
fixes ship with the tests that would have caught them. Bug A was confirmed by the
maintainer ("the tag was NOT attached"); Bug D ("full plan incl. reset registry").

## Bug A — mint silently drops a typed-but-uncommitted tag

`MintCardModal.submit` ignored `tagInput`: a tag typed but not turned into a chip
(no Enter/comma) never reached `draft.tags`, so the card minted without it. The
create→attach_tags→/stats/tags wire path is correct end to end (investigation
verified) — this is purely the un-flushed input.

- **Fix:** `submit()` flushes a non-empty `tagInput` via `addTag(tagInput.value)`
  before `commitMint`.
- **Test:** `tests/integration/MintCardModal.test.ts` — mount, type a tag without
  Enter, click Mint, assert `commitMint`'s draft carries the tag.

## Bug B/C — tag-mutation SSOT violation

Only the mint path folded new tags into `store.knownTags`; the metadata-edit path
(`CardMetadataPanel` → `useCardMetadata.updateMetadata`, used by both
ReviewSessionPanel and ForestDirectory) attached the tag to the card server-side
but never told the dictionary — so a tag added via the editor was invisible to
autocomplete until the next boot's `getTags()`.

- **Fix (chokepoint):** new `src/composables/cards/useTags.ts` owns the dictionary
  mutation (`learnTags`). `useMinting.commitMint` and `useCardMetadata.updateMetadata`
  both route through it — the latter is the single shared chokepoint for *both*
  metadata-edit call sites, so the divergence can't recur per-component.
- **Test:** `tests/integration/useTags.test.ts` — `learnTags` (union / idempotent /
  empty); and `updateMetadata` folding the returned card's tags into
  `store.knownTags`.

## Bug D — tenancy: instance-scoped fetched data leaks to the next user (serious)

`resetWorkspace` *is* called on every identity flip and clears every **module**
cache — but it structurally **cannot reach component-instance state** in
components that aren't remounted on the flip: `ForestDirectory`'s `roots` (the
fetched forest/"card-set" list) and `LibraryTab`'s query/preview state. With no
identity `:key`, `onMounted` never re-fired, so user B saw user A's fetched data;
worse, a live `watch` in ForestDirectory re-injected A's stale `roots` into B's
freshly-reset board slot.

- **Fix part 1 (the leak):** an identity `:key` on the control-panel `TabWidget`
  in `App.vue` (`workspaceIdentityKey(auth.state)`), so the Cards/Library subtrees
  remount on identity change — dropping A's instance state and re-fetching for B,
  and tearing down the re-injecting watcher. Keyed on **username**, not userId
  (stable across the late `/auth/me` verify step, so no spurious double-remount —
  the subtle bit, extracted to `workspace-identity-key.ts` and unit-tested).
- **Fix part 2 (the structural guard):** `resetWorkspace`'s hand-wired O8–O13
  clears are now a single `IDENTITY_SCOPED_CACHES` registry it drains. Adding
  identity-scoped module state is one row in one named place; a clear can't be
  silently forgotten. (Module-cache registry only — instance data is covered by
  the `:key` above; the registry doc-comment says so.)
- **Tests:** `tests/unit/composables/workspace-identity-key.test.ts` (the remount
  invariant: distinct identities differ, stable across userId-verify); and
  `tests/integration/store-mutators.test.ts` — knownTags re-seeds to defaults on
  reset (no prior-user dictionary leak) + the registry covers exactly the known
  caches (fails on any silent add/remove).

## Incidental

- `store/index.ts`'s `resetWorkspace` docstring pointer to the dissolved
  `deferred-items.md` retargeted to the live SSOT item
  `engine-connection-lifecycle-logout`.

## Verification

`npm run build` green; `npm run test:run` 807 passed / 3 skipped (+10 new across
the five test files); `eslint .` clean; work-status checker green. No FEATURES.md
change (no user-facing capability change — these restore intended behavior). Closes
`mint-uncommitted-tag-drop`, `tag-mutation-ssot`, `tenancy-instance-cache-leak`.

License: Public Domain (The Unlicense).
