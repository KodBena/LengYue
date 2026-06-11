# Worklog — single-owner auth state (RFC-0001 Q9 closure)

> Work-status item: `single-owner-auth-state`. PR: #TBD
> (`bork/refactor/single-owner-auth-state`). >1-writer arc — the
> coordinator's out-of-frame writer-enumeration review gates the merge;
> the in-frame HRA pass below does not discharge that gate.

## What changed

The SPA's nominal auth state ("who is the SPA logged in as") had two
physical representations — the JWT + cached username in localStorage
(managed by `api-client.ts`) and the reactive `AuthState` in
`useAuth.ts` — with **two writer modules** coordinated by convention:
on an unrecovered non-auth-endpoint 401, `api-client.request()` cleared
the JWT itself and then invoked a useAuth-registered
`onTokenInvalidated` callback that flipped `auth.state`. RFC-0001 open
question 9 recorded this as the conventional-alignment drift class and
parked the structural fix; the 2026-06-10 deferral harvest filed it as
this item.

Shipped shape — RFC-0001 Q9 remediation pattern (a), *single owner with
the other module strictly observing*:

- **`api-client.ts` never mutates auth-visible state on its own
  initiative.** Both self-initiated `this.token = null` sites are gone
  (the final-401 clear, and the pre-clear ahead of the item-28 retry's
  re-login). The `onTokenInvalidatedCallback` field and
  `onTokenInvalidated()` registration surface are deleted. On an
  unrecovered non-auth-endpoint 401 the client **throws `ApiError` and
  bumps a read-only reactive counter**, `authSessionRejections` — a
  transport *report*, not a transition.
- **`useAuth.ts` owns every transition.** A module-scope
  `watch(authSessionRejections, …, { flush: 'sync' })` replaces the
  callback registration and performs the *complete* session-rejected
  transition: storage clear (both keys, via the owner-invoked
  `api.clearToken()`), `setState({ kind: 'unauthenticated' })`, and the
  user-visible warning. `flush: 'sync'` preserves the retired
  callback's timing — the transition lands before the `ApiError`
  reaches the caller, so no consumer observes a rejected world with
  `auth.state` still `'authenticated'`.
- **Item-28 lineage preserved.** The identity-honest single retry is
  untouched in shape: on 401, one re-login as the *cached* identity,
  then one retry. On success `login()` replaces the JWT under the same
  identity (an identity-*preserving* refresh, not a transition); on
  failure the stored JWT now survives untouched (previously it was
  pre-cleared, leaving storage mutated without an owner transition).
  The stale Bearer header the un-cleared token leaves on the re-login
  POST is ignored server-side — verified against
  `backend/api/routes/auth.py` (`/auth/token` reads only the OAuth2
  form body).
- **Auth-endpoint skip preserved.** `/auth/*` 401s never bump the
  counter; their callers (useAuth's login / verify flows) own those
  transitions directly, exactly as they owned them before.

## Writer enumeration (the >1-writer record)

After this change, quantified over the class:

- `_authState` (useAuth module): written only by `setState`, whose
  callers are all in `useAuth.ts` — `tryAutoLogin`, `login`,
  `register`, `logout`, `_setAuthenticatedAfterVerify`, and the
  session-rejected watch. **One writer module.**
- localStorage `auth_token` / `auth_username` (single enforcement site
  unchanged: `api-client.ts`): written by `login()` /
  `setCachedUsername()` / `clearToken()` — every call site of those
  methods outside api-client is in `useAuth.ts`, and api-client's only
  self-initiated invocation is the item-28 retry's `login(cached)`,
  which is identity-preserving by construction (same cached username).
  `ensureAuthenticated()` (the passwordless auto-fill dance) is invoked
  only by `useAuth.tryAutoLogin`.
- `authSessionRejections` (the new transport report): written only by
  `request()`'s unrecovered-401 branch; exported `readonly`. It carries
  no identity data — it is a monotonic event counter, deliberately not
  auth state.

## Race closed in passing (named, same edit site)

The old shape unconditionally cleared + notified on *every*
final non-auth 401, including a 401 observed by a concurrent request
while another request's re-auth was still in flight — if that re-auth
then succeeded, the SPA ended with a valid JWT but `auth.state`
flipped to `'unauthenticated'` (false logout; divergence in the
opposite direction). The new bump condition skips while
`isReauthInFlight` is set: the in-flight retry's own outcome decides
(its fall-through 401 bumps after the flag resets). Pinned by the
"concurrent 401 while a re-auth is in flight" test.

## Behavioural deltas (named per ADR-0002)

1. **Unrecovered rejection now clears the cached username too.** The
   owner transition uses `clearToken()` (both keys); the old bridge
   cleared only the JWT, leaving `auth_username` behind — which let
   follow-up 401s keep re-attempting recovery as a dead identity (the
   "spammy follow-up 401s" RFC-0001 Q9 records). Now follow-up requests
   fail fast (no cached identity ⇒ no retry), and the kind-guard makes
   the transition itself idempotent.
2. **A failed login/register *attempt* no longer strips a still-valid
   prior session's JWT.** Previously a 401 from `/auth/token` (e.g.
   switching user with a wrong password) cleared the prior identity's
   token as a transport side effect; non-401 failures (e.g. register
   conflicts) did not — an inconsistency. Now `'error'` transitions
   deliberately leave storage alone: storage is the recovery source of
   truth for `tryAutoLogin`, and only transitions that mean "the stored
   session is dead" (verify-401, session-rejected, logout) clear it.
   Recorded in `useAuth.ts`'s header (storage-clear policy).
3. **Transition timing on burst rejections.** Unchanged in effect
   (sync flush + kind-guard), but the mechanism is now a watch rather
   than a callback; a rejection burst still produces exactly one
   transition and one warning.

## Tests

- `tests/integration/api-client-isolation.test.ts` (new) — imports
  api-client *without* useAuth, so every assertion observes the
  transport alone: unrecovered 401 throws and leaves storage untouched
  (the regression pin for the retired clear); identity-honest retry;
  recovered 401 replaces the token with no report; no-cached-identity
  401 doesn't retry; auth-endpoint 401 never reports; the
  concurrent-reauth race; and the export-surface tripwire (exact export
  set pinned — the bridge cannot be silently re-introduced).
- `tests/integration/auth-lifecycle.test.ts` (new) — real useAuth +
  real api-client + real SyncService against a stubbed fetch router and
  the store-mutators cleanup fakes: the passwordless auto-login path
  unchanged; the mid-session unrecovered 401 forcing the owner
  transition AND the downstream identity-flip chain end-to-end
  (SyncService auth watcher → `resetWorkspace` → the
  `IDENTITY_SCOPED_CACHES` drain, pinned via the registry-backed
  spies); burst idempotency; and the verify-401 auth-endpoint skip.

## Documentation

- `docs/rfcs/0001-adr-meta-review.md` — dated in-situ amendment to open
  question 9 (the worked example resolved to pattern (a); the proposal
  text stands).
- `frontend/README.md` Tenancy — one sentence naming the single-owner
  shape; both operating modes' description unchanged.
- `frontend/FILES.md` / `frontend/IDENTIFIERS.md` — no changes: no new
  `src/` files, no new branded identifier (the counter is a plain
  readonly `Ref<number>`, not an identifier type).
- `FEATURES.md` — no change (behaviour-preserving for users; auth UX
  surfaces identically).
- `docs/handoff-current.md` — no change (auth internals are not an
  orientation surface it carries).

## Deferrals

- None filed from this arc. The two adjacent debts observed in passing
  are already owned: the engine-connection lifecycle on logout is
  work-status item `engine-connection-lifecycle-logout`; the
  multi-tab sync coordination is the documented `SyncService`
  last-write-wins contract (not-filed: pre-existing documented
  limitation, unchanged by this arc and already named in
  `docs/handoff-current.md`'s rough-edges section).

## Appendix — hack-rationalization-detector artifact (verbatim)

(Recorded per ADR-0005 Rule 11. Commission prompt for the pass:
*"Review the working-tree diff on branch
bork/refactor/single-owner-auth-state (repo worktree
/home/bork/w/omega/.claude/worktrees/wf_d4be5d46-2e8-2): the
single-owner-auth-state refactor — api-client no longer mutates
auth-visible state on 401 (callback bridge removed, replaced by a
readonly reactive counter authSessionRejections), useAuth owns all
transitions via a sync-flush watch. This touches state with more than
one writer (the JWT/localStorage + AuthState pair)."*)

```
## Hack-rationalization review: single-owner-auth-state (working tree @ 8cdf9f8d)

FRAME CHECK: NOT out-of-frame — this pass was run by the implementer, per the
commission's explicit in-frame mandate (deterministic scripts at minimum,
justification treated as the object of suspicion). A self-applied judge pass
is structurally weaker than an independent one; per the commission, the
coordinator's OUT-OF-FRAME writer-enumeration review remains the merge gate
for this >1-writer arc and this artifact does not discharge it.

GENERAL FIX:   Every transition of the nominal auth state (the AuthState ref
               AND its durable localStorage projection) is performed by
               exactly one module, useAuth; the transport layer may only
               throw and report, never write.
PATCH SHIPPED: Exactly that invariant: api-client's two self-initiated
               `this.token = null` sites and the `onTokenInvalidated`
               registration surface are deleted; an unrecovered non-auth 401
               throws ApiError and bumps a readonly counter
               (authSessionRejections); useAuth's sync-flush watch performs
               the complete transition (clearToken + setState + warning).
               The one transport-side storage write that remains is the
               item-28 retry's `login(cachedUsername)` — identity-preserving
               by construction and an explicit preservation constraint of
               the commission, not a transition.
DOWNGRADE:     Two narrower-than-maximal choices, each with a concrete cost:
               (1) RFC-0001 Q9 pattern (c) (collapse to a single physical
               representation) was not taken — the JWT must survive page
               reloads (localStorage) while AuthState is in-memory reactive;
               collapsing would lose reload persistence, so ownership
               unification is the honest equivalent. (2) Lifting the whole
               auth policy (retry, passwordless dance, storage keys) out of
               api-client into useAuth was not taken — the commission pins
               the item-28 retry lineage and the single-enforcement-site
               storage invariant in place, and moving the retry above the
               transport would put the per-request chokepoint outside the
               module that owns requests. Neither downgrade rests on a
               minimality word.
WRITER DELTA:  claimed 1 writer-module per representation vs enumerated:
               _authState — 1 write site (setState, useAuth.ts; all 12
               setState callers in useAuth.ts). TOKEN_KEY/USER_KEY — all 5
               localStorage sites in api-client.ts behind login /
               setCachedUsername / clearToken; every out-of-module caller of
               those is in useAuth.ts; in-module self-initiated invocation:
               the retry's login(cached) (identity-preserving) and
               ensureAuthenticated's dance (sole caller: useAuth.tryAutoLogin).
               _authSessionRejections — 1 bump site, exported readonly.
               No missed producer found. (The archived-migration
               localStorage.removeItem hit is a different key — not auth.)
RUNTIME:       Probe-verified against the literal defect shape: the 7
               isolation-suite guards (storage-untouched on 401, export-set
               tripwire, identity-honest retry, auth-endpoint skip,
               concurrent-reauth deferral) were run against the PRE-refactor
               src (git stash) — all 7 fail there, all pass after. Full
               suite: 928 passed. Not exercised against a live backend; the
               network boundary is a stubbed fetch (the suite's sanctioned
               boundary).

TELLS (Step 1): 3 prose hits + 1 diff hit, all 'follow-up'/'defer' near
'owner'. Read each: [1][2] describe follow-up *401 requests* failing fast
(runtime behaviour, not a deferred fix); [3] is the historical record that
RFC-0001 *parked* the fix this change now ships (the opposite of a
downgrade); [diff 1] is the concurrent-401 race comment — "defers to that
retry's own outcome" describes the runtime protocol, not deferred work. No
hit names a better fix that was argued down.

VERDICT: general
WHY: The fix is statable (and stated) as one invariant quantifying over the
writer class, not an enumeration of writers; the bump-skip conditions
quantify over endpoint classes (auth vs non-auth) and the reauth flag, not
over known callers. The two named narrower choices carry concrete costs
(reload persistence; a commission-pinned lineage), and the previously-named
better fix (RFC Q9 pattern (a)) is the thing shipped rather than the thing
deferred.

FINDINGS BEYOND VERDICT (required):
  - Liveness, not safety, is convention-bound: the owner's watch exists only
    once useAuth's module loads (App.vue loads it at startup). If a future
    entry point used api-client without ever importing useAuth, rejections
    would be reported into the void — same liveness property as the retired
    callback (a never-registered callback was equally void), so no
    regression, but nothing structural enforces "exactly one live watcher".
  - The single-writer property over the STORAGE representation is enforced
    by review + the export tripwire, not by a mechanical net over future
    callers: api.clearToken()/api.login() remain public (useAuth needs
    them), so a future module could call them directly and re-create a
    second transition writer without tripping any lint (the
    store-write-needs-owner lint covers GlobalStore subtrees only, not this
    slot). The isolation suite pins api-client's own behaviour and the
    export surface, not the caller set.
  - A future edit to the retry that substitutes a different username would
    violate identity-honesty; the isolation test pins loginAttempts ==
    ['<cached>'] so the literal substitution shape is caught, but only for
    the tested paths.
  - Pre-existing divergence corner survives (named in the worklog as
    behavioural delta 2): a failed login-as-B attempt leaves state 'error'
    while a still-valid prior JWT sits in storage; reload resurrects the
    prior identity. Coherent under the new storage-clear policy, but it is
    a behaviour change from the old blanket 401-clear, and nothing pins it
    in tests.
  - Test-harness fragility: auth-lifecycle.test.ts depends on a
    load-bearing import order (store before the auth chain) to avoid a
    vitest module-runner deadlock through the analysis-persistence fake's
    api-client import; documented in-file, but nothing prevents an
    import-sorting tool from silently breaking it (the failure mode is a
    hung CI run, which is at least loud).
```

(End of verbatim artifact.)
