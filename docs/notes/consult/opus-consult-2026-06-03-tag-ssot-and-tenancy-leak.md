# Opus Consult — tag-mutation SSOT + tenancy card-set leak (investigation, 2026-06-03)

Read-only Opus investigation (general-purpose agent, model `opus`), requested
after the maintainer tested the `tags-fetch-hydration-race` fix and found three
bugs he believed were pre-existing: (A) minting with a brand-new tag "does not
work"; (B/C) adding a tag via the card-metadata editor doesn't cache it locally
(an SSOT violation between card-tags and the `knownTags` dictionary); (D) the SPA
leaks already-fetched card-set data to the next user who logs in. The maintainer
asked for the mechanisms, the right structural shapes (a tag ACL/chokepoint; a
tenancy-reset guard), and the unit tests that would have caught each — to fix +
test in the same PR(s).

Investigates work-status items: `tags-fetch-hydration-race` (tag subsystem) and a
new tenancy-leak item to be filed.

Saved verbatim for auditability per the consult-record convention.
License: Public Domain (The Unlicense).

---

# Investigation Report: Three Pre-Existing Bugs Around Tag Mutation and Tenancy

I confirm the maintainer's belief: **all three bugs are pre-existing.** The knownTags field-move (commit `5b57d25`) is a pure `store.profile.knownTags → store.knownTags` retarget; it changes neither tag persistence nor the cache-clear topology. Verified by reading the commit diff.

---

## Bug A — minting with a brand-new tag

### Finding: the code path is correct end-to-end; the symptom is NOT reproducible from code alone

I traced the full path and it is sound at every layer:

- **`MintCardModal.submit`** (`src/components/modals/MintCardModal.vue:169-215`) — when a palette override is active it rebuilds `grading_parameter` (lines 190-200) but **does not touch `draft.tags`**. Tags survive into `commitMint`.
- **`useMinting.commitMint`** (`src/composables/review/useMinting.ts:164-187`) — forwards the full `payload` (including `tags`) to `createCard`, then unions into `store.knownTags`. Correct.
- **ACL `createCard`** (`src/services/backend-service.ts:207-210`) — `api.request('POST', '/cards/', payload)` forwards the payload verbatim; `tags` is in the wire contract (`src/types/backend.ts:1021-1025`, `CardCreate.tags: string[]`). No drop, no mis-map.
- **Backend route → service** (`backend/api/routes/cards.py:91-120` → `backend/services/card_service.py:207-211`) — step 6 calls `repository.attach_tags(new_card_id, data.tags)` inside the atomic `db.begin()`.
- **`attach_tags`** (`backend/repositories/card_repository.py:395-464`) — dialect-agnostic get-or-create: SELECT existing by name, bulk-INSERT missing with `RETURNING`, then link via `card_tag`. The `tag` table is **global** (`backend/db/schema.py:294-301`, `name` UNIQUE, no `user_id`).
- **`/stats/tags` read** (`backend/repositories/stats_repository.py:51+`) returns **all** global tag rows (LEFT OUTER JOIN preserves the row), so a brand-new tag *does* surface for the minter with count=1.

**Runtime evidence the DB already holds 44 tags including free-text ones** (`blindspot`, `cheater`), proving brand-new-tag creation has succeeded historically. SQLite is 3.53 (RETURNING fully supported). So the multi-row-`RETURNING` failure hypothesis is refuted.

### Conclusion: cannot be pinned from code; needs runtime evidence
The knownTags move is **not** implicated (verified). To disambiguate, capture on a live repro:
1. **DevTools Network tab** on the `POST /cards/` — inspect the request payload's `tags` array (is it `[]` because the user never pressed Enter/comma — see the UX gap below — or populated?) and the response status (201 vs 4xx/5xx).
2. If the POST 500s, the **backend `pytest -vv` / server log** for the `attach_tags` transaction.
3. **Console** for the `alert(t('mint.alert.failed'))` text (line 211) — if the whole mint throws, this fires and names the failure.

**One code-pinnable UX adjacency worth fixing in the same PR:** an uncommitted tag in `tagInput` (typed but no Enter/comma) is silently dropped on Mint — `submit()` ignores `tagInput.value`. If the maintainer's "doesn't work" is "I typed a tag and minted but it wasn't attached," **this is the root cause**: `MintCardModal.submit` should flush a non-empty `tagInput` via `addTag(tagInput.value)` before `commitMint`. This is the single most likely code-level explanation for Bug A and is testable.

---

## Bug B/C — tag-mutation SSOT violation

### Root cause: only the mint path updates `store.knownTags`; the metadata-edit path never does

**Enumeration of every tag-write path:**

| Path | File:line | Updates `store.knownTags`? |
|---|---|---|
| Mint (new card) | `useMinting.ts:172-184` | ✅ unions `payload.tags` |
| Metadata edit — review queue | `ReviewSessionPanel.vue:133-160` (`handleCardMetadataPatch` → `useCardMetadata.updateMetadata`) | ❌ **never** |
| Metadata edit — Browse tree | `ForestDirectory.vue:296-316` (same composable) | ❌ **never** |
| ACL `updateCardMetadata` | `backend-service.ts:191-205` | ❌ (ACL, not its job) |
| Composable `useCardMetadata.updateMetadata` | `useCardMetadata.ts:25-27` | ❌ thin pass-through |

`CardMetadataPanel.addTag` (`CardMetadataPanel.vue:126-133`) emits a `patch {tags:[...]}` that round-trips through the backend and splices the returned card back into local state — but the new tag never enters `store.knownTags`. **Divergence:** a tag created via the metadata panel is attached to the card and persisted server-side, but autocomplete (`MintCardModal.vue:72-78`, `CardMetadataPanel.vue:106-112` — both read `store.knownTags`) won't suggest it until the next boot's `getTags()`. Card-tags and the local dictionary are incoherent for the rest of the session.

### Right structural shape: a `useTags` composable chokepoint
A backend-service ACL method is the wrong home (the ACL is stateless and shouldn't import the store). The proportionate fix is a small **`src/composables/cards/useTags.ts`** owning the dictionary mutation:

```ts
// learnTags(names): union brand-new names into store.knownTags (the
// commitMint logic, lifted verbatim). Returns whether it changed.
export function useTags() {
  function learnTags(names: readonly string[]): void { /* the Set-union from commitMint */ }
  return { learnTags };
}
```

Route every tag-write site through it:
- `useMinting.commitMint` calls `learnTags(payload.tags)` (replacing the inlined Set logic).
- Both `handleCardMetadataPatch` handlers (ReviewSessionPanel + ForestDirectory) call `learnTags(updated.tags)` after the PATCH resolves (the returned `ReviewCard.tags` is authoritative).

This is one composable, one method, three call sites. Restraint over ceremony — no event bus, no reactive auto-sync.

### The test that catches it (Tier 3, integration)
New `tests/integration/useTags.test.ts` (or extend a metadata test): mock `backendService.updateCardMetadata` (add to `fakeBackendService`) to resolve a card whose `tags` include `'brand-new'`; drive `handleCardMetadataPatch` (or `learnTags` directly); assert `store.knownTags` contains `'brand-new'`. Today this fails (dictionary unchanged); after the fix it passes.

---

## Bug D — tenancy leak (the serious one)

### Root cause: identity-scoped data that `resetWorkspace` cannot reach, in components not remounted on identity flip

First, what works: `resetWorkspace` (`store/index.ts:534-585`) **is** invoked on every identity transition, including switch-user (A→B). Switch-user via LoginModal (`LoginModal.vue:60-66` → `useAuth.login`) goes `authenticated{A}` → `authenticating` → `authenticated{B}`; the `authenticating` step hits `SyncService.onAuthStateChange`'s `else if (wasHydrated)` branch (`sync-service.ts:122-130`) → `resetWorkspace()`. So **every module-scope cache is cleared** — I verified all of them are wired in:
- `board-card-trees.ts:95` `clearAllBoardCardTrees`, `useCardThumbnail.ts:36` `clearCardThumbnailCache` (the two CardId-keyed, collision-prone ones), plus ledger/thumbnail/persistence/stability (UUID-keyed). All in `resetWorkspace`.

**The leak is what `resetWorkspace` structurally cannot touch: component-instance-scoped fetched data, in components that are not unmounted on the auth flip.**

1. **`ForestDirectory.vue:58` `const roots = ref<ForestStat[]>([])`** — A's forest-stats ("already-fetched card-set data"). Fetched once in `onMounted` (`:103`). The component is in the control-panel `TabWidget`, which is `keepMounted:false` (`TabWidget.vue:37-40,65-67`) — but the **active** tab stays mounted across the auth flip, and there is **no identity-keyed `:key`** anywhere on the control panel (`App.vue:463-511`; the only `:key` is `activeBoard.id` on the board widget at `:427`, a different subtree). So `onMounted` never re-fires → `roots` keeps A's data → user B sees A's forest list.

2. **Active re-leak into module scope:** `ForestDirectory.vue:120-122` — `watch(boardIdRef, () => { if (roots.value.length > 0) tree.setForestStats(roots.value); })`. When B's hydrate replaces `store.boards`, `boardIdRef` changes and this live watcher **re-injects A's stale `roots` into B's freshly-reset board-card-tree slot** — re-polluting the module-scope structure `resetWorkspace` just cleared, microseconds earlier.

3. **`LibraryTab` instance state:** `useLibraryQuery`'s `pages` Map (`useLibraryQuery.ts:120`, GameSourceId-keyed game-library rows) and `useLibraryPreview`'s `selectedRow`/`selectedGame` — all instance-scoped, re-fetched only in `LibraryTab.onMounted` (`LibraryTab.vue:50-53`). Same non-remount story: if Library is the active tab during switch-user, B sees A's library rows and preview.

How a second user observes it: on a shared computer, A logs in, opens Cards (or Library) tab, browses; A switches user to B via the LoginModal without navigating away. B's workspace store is reset+rehydrated, but the on-screen forest list / library table / preview still shows A's fetched data, and (via #2) A's forest-stats get re-seeded into B's board slot.

### Why it isn't caught: each cache clear is hand-wired; no registry; no invariant on instance-scoped data
`resetWorkspace` is a hand-maintained list of 9 clears (documented O7–O13). Adding a new identity-scoped **module** cache that forgets to register is a silent miss (bus-factor hazard). And **instance-scoped** identity data has no discipline at all — `resetWorkspace` can't reach it by construction.

### Fix (two parts)
**Part 1 — close the actual leak (remount on identity flip).** Add an identity `:key` so identity-scoped components remount on auth change. Cleanest: in `App.vue`, key the control-panel `TabWidget` (or wrap the Library/Cards tab content) on the auth userId, e.g. `:key="auth.state.value.kind === 'authenticated' ? auth.state.value.userId : 'anon'"`. Remount re-runs `onMounted`, dropping A's `roots`/`pages`/preview and re-fetching for B. This also kills the #2 re-injection (fresh `roots = []` at remount). This is the proportionate fix and aligns with the existing `:key="activeBoard.id"` precedent.

**Part 2 — structural guard against future module-cache misses (restraint).** Convert `resetWorkspace`'s hand-wired clears into a tiny registry: a module-level `identityScopedCaches: Array<() => void>` that each cache module registers into at import (`registerIdentityScopedCache(clearFn)`), with `resetWorkspace` iterating it. A new cache that forgets to register simply won't be in the array — but pair it with the test below so the omission fails loudly in CI rather than silently. (If a full registry feels heavy, the minimum viable guard is the test alone.)

### The tests that catch it
- **Tenancy-flip integration test** (extend `tests/integration/store-mutators.test.ts`, which already mocks every cleanup): simulate A→B by driving `SyncService.onAuthStateChange` (or directly: populate a board-card-tree slot + knownTags + a stub `roots`, fire `resetWorkspace`, then assert all identity-scoped state is empty). Assert `clearAllBoardCardTrees`/`clearCardThumbnailCache` fired — already partially covered; **add** an assertion that the registry (Part 2) was fully drained.
- **Registry-completeness guard:** a test that imports each `*-service.ts` / cache composable and asserts its clear fn is registered (or, simpler, asserts `resetWorkspace` leaves a known-populated set of every identity-scoped cache empty). This is the "impossible to forget" mechanism.
- **Component-remount guard** (the real leak): a render-count-style mount of `ForestDirectory`, populate `roots`, change the identity `:key`, assert `onMounted` re-fired and the rendered roots reset. (Tier 3, mirrors the existing `tests/integration/library/*` and render-count harness.)

---

## Ordered implementation plan

1. **Bug B/C first (cleanest, unblocks the SSOT):** add `src/composables/cards/useTags.ts` (`learnTags`); route `useMinting.commitMint` + both `handleCardMetadataPatch` sites through it. Add `createCard`/`getTags`/`updateCardMetadata` spies to `tests/fakes/backend-service.ts`. Add `tests/integration/useTags.test.ts`.
2. **Bug D Part 1 (the leak):** add the identity `:key` on the control-panel tab content in `App.vue`. Add the component-remount guard test.
3. **Bug D Part 2 (the guard):** convert `resetWorkspace`'s clears to a registry; add the registry-completeness test in `store-mutators.test.ts`.
4. **Bug A:** flush uncommitted `tagInput` in `MintCardModal.submit` before `commitMint` (the one code-pinnable cause); add an integration test asserting a typed-but-uncommitted tag reaches `createCard`'s payload. **Then ask the maintainer for the DevTools Network/console capture** to confirm whether the deeper persistence symptom remains — it cannot be pinned from code, since the create→attach→stats path is correct end to end.

### Key files
- `src/composables/review/useMinting.ts`, `src/components/modals/MintCardModal.vue`, `src/components/CardMetadataPanel.vue`, `src/components/ReviewSessionPanel.vue:133-160`, `src/components/tree/ForestDirectory.vue:58,103,120-122,296-316`
- `src/composables/cards/useCardMetadata.ts`, `src/composables/cards/board-card-trees.ts`, `src/composables/cards/useCardThumbnail.ts`
- `src/store/index.ts:534-585` (`resetWorkspace`), `src/services/sync-service.ts:111-131` (`onAuthStateChange`), `src/App.vue:463-511`, `src/components/chrome/TabWidget.vue:37-67`
- `src/services/backend-service.ts:207-215`, `backend/repositories/card_repository.py:395-464`, `backend/repositories/stats_repository.py:51+`
- Tests: `tests/integration/store-mutators.test.ts`, `tests/fakes/backend-service.ts`, `tests/integration/library/`
