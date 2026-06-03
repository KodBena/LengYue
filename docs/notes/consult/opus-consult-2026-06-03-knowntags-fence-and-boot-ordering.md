# Opus Consult — `knownTags`-in-profile fence + boot-ordering hazards (investigation, 2026-06-03)

Read-only Opus investigation (general-purpose agent, model `opus`), requested by
the maintainer before acting on the deferred `tags-fetch-hydration-race` item.
The maintainer leaned toward moving `knownTags` out of the persisted profile
(fix option 3) and asked, by Chesterton's fence, *why it lives there*; and —
given that a known ordering race sitting in the boot path "should never have
happened" — whether sibling bugs of the same class exist and what organizational
lapse allowed it.

Investigates work-status item: `tags-fetch-hydration-race`.

Saved verbatim for auditability per the consult-record convention.
License: Public Domain (The Unlicense).

---

# Investigation Report: `tags-fetch-hydration-race` and the `knownTags`-in-profile fence

All claims below are grounded in the files cited. I read `useAppBootstrap.ts`, `sync-service.ts`, `store/index.ts` (the hydrate/persist boundary), `lib/utils.ts` (`deepMerge`), `types.ts` (`ProfileState`), `defaults.ts`, both migration files, `useQeubo.ts` (the precedent watchers + bootstrap), `resource-service.ts`, `analysis-persistence-service.ts`, `useAutoSaveAnalyses.ts`, all three `knownTags` consumers, the test tree, and the work-status SSOT entry, each end to end for the regions cited.

## Confirming the race premise

- `deepMerge` (`src/lib/utils.ts:28-43`) recurses only into plain objects; `isObject` (`:21-23`) excludes arrays, so an array value hits the `else` branch (`:37-39`) and is **replaced wholesale**. Confirmed.
- `updateFromRemote` (`src/store/index.ts:600`): `if (migrated.profile) store.profile = deepMerge(store.profile, migrated.profile)`. If the remote blob carries a `knownTags` key, it replaces the in-store array.
- The two writes are genuinely unordered: `sync.connect()` is fire-and-forget (`useAppBootstrap.ts:407`); inside it `onAuthStateChange` → `void this.hydrate(...)` (`sync-service.ts:121`, `:140`) is also un-awaited. Meanwhile `await backendService.getTags()` then `store.profile = { ...store.profile, knownTags }` runs at `useAppBootstrap.ts:411-412`. Whichever async chain resolves last wins.
- `buildPersistencePayload` (`store/index.ts:641-647`) always serializes `store.profile`, and `store.profile` always carries `knownTags` (it's a required field, `types.ts:1787`, defaulted at `defaults.ts:607`). So **the persisted blob essentially always carries a `knownTags` key** — the "only when the persisted profile carries a knownTags key" caveat is satisfied for any user who has ever synced. The race is live for the entire returning-user population, not an edge case.

---

## Part 1 — Chesterton's fence on `knownTags` in the persisted profile

### Where it lives and who touches it
- **Declared:** `src/types.ts:1787` (`knownTags: string[]` on `ProfileState`).
- **Defaulted:** `src/store/defaults.ts:607` (`['$mistake', '$opening', '$joseki', '$life_and_death']`).
- **Persisted:** rides in the `store.profile` blob via `buildPersistencePayload` (`store/index.ts:645`); hydrated via `deepMerge` (`store/index.ts:600`).
- **Migrated:** **nothing.** No migration in `migrations.ts` or `archived-migrations.ts` references `knownTags`. (The grep hits are all `cardSets`, card-level `tags`, and `katago` settings.) The default seed at `defaults.ts:607` is the only initializer. **No migration coupling exists** — this removes one candidate fence.
- **Read (3 consumers, all tag-autocomplete):**
  - `src/components/CardMetadataPanel.vue:109` — inline card-tags edit autocomplete.
  - `src/components/modals/MintCardModal.vue:75` — mint-modal tag autocomplete.
  - `src/composables/review/useMinting.ts:168,181` — read-modify-write: on a successful mint, newly-introduced tags are unioned into `knownTags` (`commitMint`).

### Is the fence load-bearing?

I find **one substantive reason it's in the profile, and it is the `useMinting.commitMint` write (`:164-185`), not the persistence.** When a user mints a card with a brand-new tag, `commitMint` adds that tag to `store.profile.knownTags` **locally and immediately** so autocomplete remembers it within the session. The backend `/stats/tags` endpoint (`backend-service.getTags`, `:212`) is a *stats* endpoint (returns `{name, count}` — `mapTagStat`, `:221-226`); a freshly-minted tag won't surface from it until the next boot-time fetch. So the local write is the only thing that surfaces a just-minted tag for the rest of the session. **This is a genuine local-availability behavior, not incidental.**

But note carefully: that behavior is about *in-session reactivity of a top-level reactive field*, **not about persistence**. It would work identically whether `knownTags` is a persisted profile field or a non-persisted top-level reactive ref. The *persistence* of `knownTags` buys only one marginal thing: a returning user sees their session-minted tags in autocomplete on next cold-start *before* the `getTags` fetch resolves (a sub-second window). That window is exactly the one the race corrupts, and the dictionary is re-fetched on every boot anyway (`useAppBootstrap.ts:411`) — so the persisted copy is **strictly redundant with the server fetch** except for that sub-second cold-start flash. There is **no offline story** (the SPA can't mint or browse cards offline — everything goes through `api.request`), **no cross-tab story** (the concurrency contract at `sync-service.ts:236-249` is explicitly single-tab-last-write-wins), and **no ACL translation** (tags are bare strings; `mapTagStat` is field-identical).

**Verdict: the fence is *incidental as persisted data*, load-bearing only as a *reactive field*.** `knownTags` is a server-derived cache (`getTags` is the source of truth, refreshed every boot). It was dropped into `ProfileState` because that was the convenient reactive bag — it is not user-authored data. Moving it *out of the persisted blob* is safe. The one piece that must be preserved is its **reactivity as a top-level field** so `commitMint`'s session-local union and the two autocomplete reads keep working.

### What changes/breaks under each move-out option

**(a) Non-persisted top-level store field** (e.g., `store.knownTags: string[]`, excluded from `buildPersistencePayload` and never merged in `updateFromRemote`):
- `types.ts`: remove from `ProfileState`, add to `GlobalStore`.
- `defaults.ts:607`: move the seed to the `GlobalStore` initializer.
- 3 consumers change `store.profile.knownTags` → `store.knownTags` (CardMetadataPanel `:109`, MintCardModal `:75`, useMinting `:168,181`).
- `useAppBootstrap.ts:412`: write becomes `store.knownTags = tags.map(...)` (no more profile-spread).
- **Regression check:** `resetWorkspace` (`store/index.ts:566`) currently re-seeds `knownTags` via `structuredClone(defaultProfile)` on identity-out — a top-level field needs an explicit re-seed there, or the prior identity's dictionary leaks across a logout (privacy: minor, since tag *names* aren't sensitive, but the discipline at frontend `CLAUDE.md` "Resource ownership at mutation sites" says name it). This is the one new cleanup obligation the move introduces. **Nothing else regresses** — the race vanishes because `updateFromRemote`/`deepMerge` no longer see the key.

**(b) Dedicated composable/ref re-fetched on identity change:**
- Same 3 consumers rewire to the composable's exposed ref.
- The fetch moves from `onMounted` into an auth-state watcher (matching the qeubo/analysis-persistence pattern at `useAppBootstrap.ts:247-318`), naturally re-fetching on identity flip.
- More code than (a); the identity-flip re-fetch is cleaner than (a)'s manual re-seed, but it's a new composable for a single `string[]`. Heavier than the problem warrants.

### Ranking the three candidate fixes

1. **RECOMMENDED — Move `knownTags` out of the persisted profile (option 3 / move-out (a)).** It eliminates the *class*, not the instance: the race is structurally impossible because the field is never in the merged blob. It's the smallest behavioral surface (the field stays reactive; only its home and persistence change). The fence is incidental, so this is safe. Cost: ~6 call-site edits + one `resetWorkspace` re-seed line + an entry in FILES.md/IDENTIFIERS.md if applicable. This aligns with the maintainer's lean and with the project's "server-derived caches must not live in persisted-user-data" instinct.

2. **Second — `whenHydrated()` gate (option 1).** Await hydration before the tags fetch. This is the *more general* guard (it fixes any boot-write-vs-hydrate race, not just this one) and is the natural home for Part 3's structural recommendation. But as a fix for *this bug specifically* it's heavier: it requires a new `Promise`/gate on `SyncService` and serializes the tags fetch behind the hydration GET (a latency cost on cold-start autocomplete readiness). Recommend it as the **structural guard** (Part 3), not the point-fix.

3. **Third — re-apply via a watcher on profile-replacement (option 2).** This mirrors the qeubo precedent (`useAppBootstrap.ts:176-183`). It's the **most fragile**: it re-introduces the same re-fire-after-replace dance the qeubo code needed, adds a watcher whose only job is to paper over an ordering bug, and is still racy in principle (the watcher fires on the profile-replace, but if `getTags` hasn't resolved yet there's nothing to re-apply, and if it resolves *after* the watcher there's no second trigger). It treats the symptom. Avoid.

**The decisive point:** options 1 and 2 keep a server-derived cache inside the persisted-user-data blob, which is the *root* miscategorization. Option 3 (move-out) removes the miscategorization. Recommend move-out.

---

## Part 2 — Sibling ordering-hazard inventory

I surveyed every `onMounted` write and every auth-state / hydrate-boundary watcher that touches shared reactive state.

| # | Site | What it writes | Verdict |
|---|------|----------------|---------|
| 1 | **`useAppBootstrap.ts:411-412`** getTags → `store.profile = {...store.profile, knownTags}` | `store.profile` (array key) | **GENUINELY RACY** — the subject bug. Un-awaited hydration at `:407` deep-merges over it. |
| 2 | **`resourceService.loadVisitDistribution()`** (`useAppBootstrap.ts:409`; `resource-service.ts:53-63`) | writes only the **module-scope intensity factory** (`initializeIntensityFactory`), *not* the store | **GUARDED / not in class.** Touches no persisted reactive state. The `intensityHueShift` watcher (`useAppBootstrap.ts:116-120`) re-applies the hue on hydration independently; the early-return-and-record pattern noted at `:108-115` handles ordering. Safe. |
| 3 | **`qeubo.bootstrap()`** via auth watcher (`useAppBootstrap.ts:247-260`; `useQeubo.ts:521-576`) | in-memory refs (`_statusRef`/`_pairRef`/`_bestRef`/`_calibrationEnabledRef`) + in-memory claim map; `reconcileQeuboKnobs` writes `store.profile.settings.knobs` | **GUARDED.** This is the *worked precedent*: bootstrap reads `parameter_meta` before hydrate completes, but the `parameter_meta` deep-watcher (`:176-183`) **re-fires `reconcileQeuboKnobs` + `rehydrateExperimentClaims` after `updateFromRemote` replaces `store.profile`**, against populated data. `rehydrate` is idempotent (`useQeubo.ts:407-437`, guarded by `_statusRef !== null` and `_claimedKnobIds.has`). The comment at `:160-175` documents exactly this. Mitigated. |
| 4 | **`analysisPersistenceService.refreshSummaries()`** via auth watcher (`useAppBootstrap.ts:299-318`; service `:381-388`) | the service-local `summaries` Map, **not** the store | **GUARDED by keying + the per-board watcher.** Summaries are boardId-keyed; the restore watcher (`:339-358`) only fires `restore(id)` for boards **already in `store.boards`** (populated by hydration). `restore` writes the **analysis ledger** (`replayBundleIntoLedger`, service `:352`), boardId-keyed, never `store.profile/session`. Ordering-safe by construction: restore can't run before its board exists, and boards arrive via hydration. The dedup `Set` + `boardsSetVersion` reconcile (`:336-391`) handles the "summary arrives after board" rising edge. |
| 5 | **`useAutoSaveAnalyses()`** (`useAppBootstrap.ts:60`; composable `:153`) | schedules PUTs of board analyses | **GUARDED.** Comment at `useAutoSaveAnalyses.ts:153`: "mount doesn't fire a save against state we just hydrated." Gated like SyncService's own `scheduleSync` identity gate (`sync-service.ts:200-217`). |
| 6 | **SyncService's own save path** (`sync-service.ts:200-287`) | PUTs `buildPersistencePayload()` | **GUARDED — the model.** `scheduleSync` (`:205-207`) refuses unless `hydratedForUserId === state.userId`; `sendSync` (`:266-277`) re-asserts (defense-in-depth, fails loudly per ADR-0002). The `hydrationGeneration` counter (`:57`, `:141`, `:144`, `:149`) discards superseded hydrations. This is the **only place in the boot path with an explicit hydration gate** — and notably, the one place that *writes back to the server* is gated, while the one place that writes the local store from a fetch (#1) is not. That asymmetry is the structural tell (Part 3). |
| 7 | The five setup-time `immediate: true` watchers (theme `:137`, locale `:230`, intensity `:116`, knob-registry `:198`, qeubo-reconcile `:176`) | mirror profile fields onto DOM / module state | **GUARDED.** All are *re-applying* watchers: `immediate` fires on the pre-hydration default, then re-fires when hydration replaces `store.profile`. They *converge* on the hydrated value by design — the opposite of the race (they read profile and write elsewhere; #1 reads elsewhere and writes profile, which hydration then clobbers). |

**Component-level `onMounted` handlers** (LibraryTab, BoardTab, TreeWidget, charts, etc.) are **not in the class**: they mount when their view first renders, which is gated behind auth + the initial render, well after the hydrate boundary; none writes `store.profile/session` from an un-awaited fetch racing hydration.

**Net:** exactly **one genuine hazard (#1, the subject bug)**. The other six candidates are real-looking but already mitigated — three by the post-hydrate re-fire watcher pattern (#3, #7), one by boardId-keying + board-existence ordering (#4), two by the explicit identity/hydration gate (#5, #6). The codebase has *converged* on two mitigation patterns; #1 is the one site that uses neither.

---

## Part 3 — Why this class was possible, and the proportionate guard

### Root cause (structural, not careless)

The pattern is **a one-directional asymmetry the codebase never named**:

- Every *write-back-to-server* path is gated on hydration (`sync-service.ts:205-207, 266-277`).
- Almost every *read-server-write-store* path re-converges after hydration via a re-firing watcher (#3, #7) or is keyed so it can't run early (#4).
- The tags fetch (#1) is the **lone read-server-write-store path that does neither** — it writes `store.profile` once, eagerly, in `onMounted`, with no gate and no re-fire watcher.

It was *introduced* during the B5/identity-aware-SyncService rework (per the SSOT, 2026-04-27) because at that time the move from "overwrite whole profile" to `deepMerge` changed the failure mode (from "knownTags dropped" to "knownTags reverts to last-saved") without anyone re-examining the `onMounted` write — the SSOT description itself records this drift correction on 2026-06-03. It was *left un-fixed* because the symptom is genuinely benign (a re-fetchable dictionary briefly reverts) and there was no **invariant** to make the un-gated write *look* wrong. The missing invariant is the bus-factor hazard: the safe pattern lives in the author's head (and in three scattered comment blocks), not in any mechanism a future edit must satisfy.

### The missing invariant

Two candidate invariants; the second is the sharper one:

- *Weak:* "No boot-time write to persisted store state runs before hydration completes."
- **Sharp (recommended framing):** **"Server-derived caches do not live in the persisted store blob; only user-authored data is persisted."** `knownTags` violates this; the fix (move-out) *restores* the invariant rather than adding machinery to tolerate the violation. This is the higher-leverage framing because it makes the *category error* visible, and it generalizes: any future "convenient reactive bag" insertion of a server cache into `ProfileState` becomes a recognizable smell.

### Recommended guards (1-2, proportionate, restraint over ceremony)

**Guard 1 (primary, structural) — Adopt the move-out as the fix, and document the invariant where it bites.** Moving `knownTags` to a non-persisted top-level field *is* the structural guard: it makes this specific recurrence impossible and demonstrates the "server-cache ≠ persisted-profile" rule with a worked example. Add one sentence to `ProfileState`'s doc-comment in `types.ts` (near `:1781`): *persisted profile holds user-authored data only; server-derived caches (tag dictionary, stats) live as non-persisted top-level reactive fields.* That comment is the lowest-ceremony durable carrier of the invariant — it sits exactly where the next person would be tempted to add another `knownTags`-shaped field. (And per the "Resource ownership at mutation sites" discipline, wire the `resetWorkspace` re-seed of the new top-level field with the inline-comment convention.)

**Guard 2 (secondary, optional — only if the maintainer wants belt-and-suspenders) — A tier-3 integration test asserting hydration-vs-bootstrap-write ordering.** The test posture supports it (`tests/CLAUDE.md` tier 3: composables driven against fakes, store/navigator real). A focused test: fake `getTags` to resolve *before* the hydrate GET, run a hydrate carrying a different `knownTags`, assert the final `store.profile.knownTags` (or the new top-level field) reflects the *fetched* dictionary, not the stale blob. There is **currently zero test coverage of the hydrate boundary or `deepMerge`** (verified: no `deepMerge` test, no `SyncService`/`updateFromRemote`/`knownTags` test in the tree) — so this test would also be the first guard on `updateFromRemote`'s merge semantics generally. After the move-out, this test mostly guards against *re-introduction* (someone re-persisting the field). It's worth one test; it is *not* worth an ESLint rule or a `whenHydrated()` framework gate — those are disproportionate to a single benign field.

**Explicitly NOT recommended as the preventive:** a general `SyncService.whenHydrated()` that all boot writes await. It's tempting as "the general fix," but (a) the move-out makes it unnecessary for this bug, (b) it adds a serialization point and a new public surface for a problem that has exactly one current instance, and (c) the codebase's *existing* mitigation (re-firing watchers + identity gates) already covers the other paths. Build the gate only if a *second* genuine instance of the class appears — at which point the invariant in Guard 1's comment will have made it recognizable.

### Summary
The fence is incidental-as-persisted, load-bearing only as a reactive field; **move `knownTags` out of the persisted profile to a non-persisted top-level reactive field** (recommended fix #1), preserving its reactivity for `commitMint`'s session-local union and the two autocomplete reads, and re-seeding it in `resetWorkspace`. Part 2: only the subject site is genuinely racy; six sibling candidates are already mitigated by two convergent patterns. Part 3: the root is an unnamed asymmetry (write-back gated, read-write-store not) and a missing "server-caches aren't persisted-profile-data" invariant; the proportionate guard is the move-out itself plus a one-sentence invariant comment on `ProfileState`, with an optional single tier-3 ordering test (no ESLint rule, no `whenHydrated` framework).
