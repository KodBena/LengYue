# Worklog — Wave-3 gate-recommendations sweep (2026-06-11)

> Durable record that the auditor-VERIFIED recommendations from the four
> Wave-3 PRs' out-of-frame hack-rationalization gates (#410–#413) were
> discharged completely. Branch `bork/fix/gate-recommendations-sweep`.
> The gate artifacts — the verbatim comments on each PR — are the specs;
> each was read end to end before any change. The work-status `todo` DB
> was READ-ONLY this session; item closures and any new-item filings are
> the coordinator's call on merge.

## Provenance and discipline

The four Wave-3 PRs each carry an out-of-frame hack-rationalization
review as a verbatim PR comment. Those reviews issued FINDINGS BEYOND
VERDICT — bounded residues the verdict label compresses away. The
coordinator triaged those findings; rows 1–8 below are the subset
selected for application in this sweep. "Auditor-VERIFIED" means the
finding was re-derived independently in the gate's own throwaway
worktree, not taken from the implementer's prose. Where a row's claim
needed a fresh empirical check at HEAD (Row 1 in particular), this sweep
re-verified it with its own scratch probe before adopting — recorded
in the row.

Each change is small and precisely specified. The ADR posture held
throughout: ADR-0002 fail-loudly (structured validation refusals, the
undisclosed-delta disclosure), ADR-0004 minimal-touch, ADR-0005 Rule 11
(in-situ corrections to merged worklogs are DATED strike-don't-delete
additions, not silent edits), ADR-0009 (no perf claims — none made),
ADR-0011 Rule 4 (quantify over the class). The nine custom eslint rules
at `error` stayed green; no new cast was introduced.

## Triage table (rows 1–8)

| # | Source gate | What | Status |
|---|-------------|------|--------|
| 1 | PR #410 | Widen `PROFILE_ALIASED_WRITE_SELECTORS` with the descendant-combinator over-approximation; correct the "esquery cannot express the recursive root walk" impossibility claim at the selector comment + as a dated worklog addition | APPLIED |
| 2 | PR #410 | Path-prefix allowlist in the knob-decl validation (`profile.*` / `session.ui.*`), refused loudly with structured detail; unit test (engine.* refused, seeded session.ui pass) | APPLIED |
| 3 | PR #411 | Delta-(c) lifecycle test: a failed login/register against a still-valid prior session leaves storage intact (state 'error', prior JWT survives a reload-shaped read) | APPLIED |
| 4 | PR #411 | The undisclosed fourth delta's corner: rejection watch ALSO clears storage when a token is stored + state non-'authenticated'; corner test (dead-token-in-error-state); DATED disclosure of the previously-undisclosed delta | APPLIED |
| 5 | PR #411 | flush:'sync' prose: dated worklog correction of the "load-bearing" claim (cheap belt-and-suspenders, not uniquely load-bearing) | APPLIED |
| 6 | PR #411 | Derive auth-lifecycle drain assertions from `identityScopedCacheLabels()` so the asserted set tracks the registry (a new/renamed entry fails loudly) | APPLIED |
| 7 | PR #413 | Warm-guard asymmetry: reset `lastWarmedPath` inside the node-invalidation hook (O9 rationale verbatim), covering `purgeBoardThumbnails`; owner-module test extended | APPLIED |
| 8 | — | This sweep worklog (the durable discharge record) | APPLIED (this file) |

### Rows done-at-merge for #412 / #413 (not re-applied here)

The coordinator's fixups already landed two gate items before this sweep:

- **PR #413 band re-band adjudication** — the FloatingThumbnail B1→B3
  re-band minted an advisory band edge ([B2] TreeWidget → [B3]
  FloatingThumbnail); the coordinator adjudicated it with a
  `BAND_EXCEPTIONS` entry in the merge fixup (see the thumbnail
  worklog's coordinator dated addition).
- **PR #411 drain mock-path re-point** — commit `0c04d895` re-pointed the
  auth-lifecycle drain spy to the purge's new owner module
  (`thumbnail-render-resources`) after PR #413 moved it. That was a
  point hotfix; Row 6 above is the STRUCTURAL successor (assert the
  derived set, so the next path move can't drift silently).

## Filed items (recorded for the coordinator; this session is read-only)

The gates named follow-ups that exceed the sweep's row scope. They are
NOT this worker's to file (todo DB read-only); recorded here as the
coordinator's filing/closure docket:

- **`chart-panel-preview-migration`** (PR #413 gate finding 1) — the
  live async-write-into-a-preview-ref shape in
  `ScoreLeadPanel`/`MergedDeltaPanel` (mischaracterized as dead code by
  the in-frame artifact; LIVE per the out-of-frame gate). Already filed
  per the thumbnail worklog's coordinator dated addition. Not touched by
  this sweep — it is a separate migration arc, not a row.
- **`app-vue-extraction-residue`** (PR #412 gate findings 1/2/4) — the
  cascade-neutrality enumeration sentence is false-as-written (its
  conclusion holds on the backstop clauses), the "component chunks load
  after App.vue's" claim is inverted in the production bundle, and the
  entry-point-coverage net is a `not-filed:` prose marker. PR #412 was
  done-at-merge for its CSS relocation; these are corrective/follow-up
  residues for coordinator curation. Not a row in this sweep.
- **`profile-owner-scope-analysis-net`** (PR #410 gate finding 2) — the
  alias-write class can recur (`const p = store.profile; p.x = …`)
  because `mutateProfile` is a routing point with no runtime
  enforcement and the nets are name-matched/were depth-bounded. Row 1
  closes the depth-escape class; the remaining intermediate-variable /
  renamed-import escape is the store-write-needs-owner scope-analysis
  follow-up the in-frame HRA itself named and did not file. Coordinator's
  to file or mark `not-filed:` at item closure (ADR-0005 Rule 10).

## Informational records (the gates' meta-findings, recorded so the next reader doesn't re-pay them)

- **In-frame HRA numerics are leads, not certified counts** — twice
  non-reproducible at the merge candidate. PR #410's in-frame WRITER
  DELTA said "25 sites / 9 files / useQeubo ×10"; the out-of-frame
  enumeration found "24 / 8 / ×9" (overcount, harmless direction, but the
  in-frame line was not machine-checked). PR #413's in-frame Step-1
  numbers (2/12/0) did not reproduce against the committed diff (7/30/1,
  the 1 a test-comment false positive). Treat any in-frame deterministic
  count as a grep-grade lead to re-derive, not a certified figure.
- **Probe-overclaim shape** — PR #411's "all 7 fail against the
  pre-refactor src" is literally true but 5 of the 7 reds are
  missing-export TypeErrors at the first `authSessionRejections.value`
  read, not per-pin behavioural regressions; the gate's surgical
  mutations (not the probe) established the two load-bearing pins. A
  shape-detection probe is not per-pin coverage — say which it is.
- **Liveness-by-convention on the auth watch** — the owner's
  session-rejected watch exists only because App.vue loads useAuth; a
  future entry point importing api-client alone would report rejections
  into the void. Carried-forward, independently confirmed still true at
  HEAD; unchanged and not addressed by this sweep (out of row scope).
- **The v-model harness-vs-component gap** (PR #410) — AnalysisControls'
  five real computeds are exercised by vue-tsc + lint only; the
  behavioural pin drives a harness that MIRRORS the wiring (2 of 5
  leaves). A harness-vs-component divergence remains behaviourally
  invisible. Bounded (five identical six-line computeds); recorded.
- **Re-run-the-scripts-at-the-final-commit convention** (PR #413 gate
  finding 4) — the verbatim-appendix discipline (ADR-0005 Rule 11) is
  better served by re-running the deterministic HRA scripts at the FINAL
  merge commit, so the appendix certifies what is actually merged rather
  than a superseded tree state. Recorded as a process note for future
  HRA appendices.

## Per-row implementation notes

### Row 1 — descendant-combinator over-approximation (PR #410)

Re-verified both gate claims with a scratch probe before adopting:
(a) the descendant combinator
(`CallExpression[callee.name='updateRegistry']
MemberExpression[object.name='store'][property.name='profile']`) fires
on depth-1/2/3/4 roots — confirmed; (b) zero firings across the whole
`src/` tree at HEAD — confirmed (no false positives). The two
depth-bounded `updateRegistry` selectors were REPLACED by the single
descendant-combinator selector (strictly stronger). The
`writeKnobValue`/`writeKnob` selector is unchanged. The over-
approximation's one cost, named per ADR-0002 at the selector constant:
it also fires when `store.profile` appears as a non-target READ
argument of an `updateRegistry` call (zero such sites at HEAD; a future
one takes an annotated inline disable). Probe-verified the widened
selector fires on a reintroduced depth-3 escape, then reverted. The
"esquery cannot express the recursive root walk" claim is corrected at
the selector comment AND as a dated addition to the
settings-profile-mutator-owner worklog.

### Row 2 — knob-decl path-prefix allowlist (PR #410)

`validateRegistry` / `validateDecl` (`src/lib/knobs.ts`) gain an OPTIONAL
`allowedPathPrefixes` parameter (axis 4), defaulting to no restriction
so the Band-1 substrate stays domain-agnostic (ADR-0003) — the
GlobalStore-coupled prefix vocabulary is the CALLER's to supply. The
production call site (`useAppBootstrap.ts`) passes `['profile.',
'session.ui.']` via `KNOB_ALLOWED_PATH_PREFIXES`: every seeded decl
targets one of those (`profile.settings.*` for the profile-document
knobs — including the `profile.settings.engine.katago.*` ones, which are
profile.* paths — and `session.ui.*` for the two move-filter / pv-fade
session knobs). An out-of-prefix path (a bare `engine.*` / `boards.*`
leaf) is refused loudly with structured detail per ADR-0002, checked
BEFORE resolvability so the crisper "writes a subtree it's not allowed
to" reason wins. Unit test exercises: engine.* refused, the two seeded
session.ui decls + the profile.* family pass, prefix-before-resolvability
ordering, and the unrestricted default (existing substrate tests with
arbitrary roots untouched).

### Rows 3/4/5/6 — auth lifecycle (PR #411)

- **Row 3** adds two delta-(c) lifecycle tests to
  `tests/integration/auth-lifecycle.test.ts`: a failed login attempt and
  a failed register attempt against a still-valid prior session each
  leave the prior identity in storage (state 'error', prior JWT survives
  a reload-shaped read; the auth-endpoint 401 never bumps the rejection
  counter).
- **Row 4** fixes the undisclosed fourth delta in `useAuth.ts`: the
  rejection watch's full-transition guard stays kind-guarded, and an
  else-branch clears storage when a token is stored
  (`api.cachedUsername() !== null`) and the state is non-'authenticated'
  — the dead-token corner. The in-flight-reauth skip is preserved
  structurally (the counter only bumps when `!isReauthInFlight`, so any
  rejection reaching the watch is observed after re-auth is no longer in
  flight). No state-flip/warning in the else-branch (the state is already
  off 'authenticated' and may carry a meaningful 'error' message). The
  corner test (`dead-token-in-error-state`) pins: rejection clears
  storage, state stays 'error', a subsequent request fires zero further
  re-login attempts. The previously-undisclosed delta and this fix are
  disclosed as a dated addition to the single-owner-auth-state worklog
  (per its own ADR-0002 standard). An in-frame hack-rationalization pass
  was run on this >1-writer change (justification-as-suspect mode, both
  deterministic scripts, writers re-derived) — verdict general, two
  bounded latent findings recorded; per the skill's rule the in-frame run
  does not discharge the gate, and this row applies an already-
  out-of-frame-VERIFIED recommendation.
- **Row 5** corrects the flush:'sync' "load-bearing" prose as a dated
  worklog addition: the gate found it not uniquely load-bearing
  (removing it leaves all suite tests green; the pre-flush microtask runs
  before the rejection propagates through any await chain). It stays as
  cheap belt-and-suspenders — costs nothing, documents the intended
  timing, removes any future await-shape dependency from the correctness
  argument — but is not the unique guarantor the original sentence
  implied. The timing property itself is not separately pinned; that gap
  is recorded, not papered over.
- **Row 6** is the structural successor to the coordinator's mock-path
  hotfix: the drain assertions now derive from
  `identityScopedCacheLabels()` via a label→spy map (`installDrainSpies`
  / `expectFullDrain`), so EVERY registry label's spy must fire (and the
  set is the registry's, not hand-enumerated). The previously-omitted
  `stability-trajectories` entry is now covered (a `vi.spyOn` on the live
  singleton, like the ledger). Verified loud-failure: injecting an
  unmapped registry label makes the suite red with a named-gap message
  pointing at `installDrainSpies()`.

### Row 7 — warm-guard asymmetry (PR #413)

`invalidateNodeSnapshots` (the node-content invalidation hook) now resets
`lastWarmedPath` unconditionally — the O9 rationale verbatim ("a stale
fingerprint would short-circuit the next warm"). The reset is the single
delete primitive both the hook and `purgeBoardThumbnails` funnel through,
so the board purge inherits it (a single-point fix co-located with the
delete, not duplicated per entry point). The reset is conservative
(unconditional): clearing the guard can only force a re-warm, never
strand one. Two new owner-module tests pin it
(`invalidateNodeSnapshots` resets the guard; `purgeBoardThumbnails`
inherits it); probe-verified both go red when the reset is reverted. The
resource-ownership checklist's "lastWarmedPath — O9 only" row (gate
finding 6) is thereby closed.

## Verification

- `npm install` clean; `npm run build` (vue-tsc strict + vite) exit 0.
- `npx eslint .` exit 0 — all nine custom rules at `error` green,
  including the widened profile-aliased-write selector (owner inline
  disables still suppress correctly).
- `npm run test:run`: 978 passed / 4 skipped (the pre-existing skips). New
  tests: knobs path-prefix allowlist (×4), auth-lifecycle delta-c (×2) +
  dead-token (×1) + the refactored derived-drain assertion, thumbnail
  warm-guard reset (×2).
- Probe-before-trust applied per row where a claim was empirical (Row 1
  selector behaviour, Row 6 loud-failure, Row 7 fix load-bearingness) —
  each probe reverted, tree clean before commit.
- Scratch eslint configs and probe edits deleted/reverted before commit.

## Documentation audit

- **Work-status store:** READ-ONLY this session per the commission. Item
  closures and the new-item filings named in "Filed items" are the
  coordinator's call on merge.
- **Worklogs amended (dated additions, ADR-0005 Rule 11):**
  settings-profile-mutator-owner (Row 1 impossibility correction),
  single-owner-auth-state (Row 4 undisclosed-delta disclosure + Row 5
  flush:'sync' correction), thumbnail-render-lifecycle-consolidation
  (Row 7 warm-guard fix).
- **FILES.md:** no edit — no `src/` file created, moved, or deleted (all
  changes are to existing files); no band re-tag.
- **IDENTIFIERS.md:** no edit — no brand minted or moved.
- **FEATURES.md:** no edit — behaviour-preserving corrective sweep; no
  user-facing capability changes (the auth dead-token fix removes a
  futile-retry edge, not a capability; the knob-prefix allowlist is a
  data-validation guard with no user-facing surface).
- **handoff-current.md:** read end to end; no orientation surface it
  carries is affected.
- **Dispatch ledger:** no open dispatch addressed to the frontend bears
  on this sweep.
- **Doc-graph:** this worklog is a new node — regenerated via
  `node tools/doc-graph/generate.mjs` in the same change; committed
  json+md.

## Deferrals (ADR-0005 Rule 10)

- The intermediate-variable / renamed-import alias-write escape of the
  store-write-needs-owner family — not-filed by this worker (todo DB
  read-only); recorded above under `profile-owner-scope-analysis-net` for
  coordinator filing/marking at item closure. Row 1 narrows the
  depth-escape class to zero; the scope-analysis follow-up the in-frame
  HRA named is the remaining gap.
- The flush:'sync' timing property is not separately pinned (Row 5) —
  not-filed: the flag is retained as belt-and-suspenders and the
  correctness argument no longer depends on it, so a dedicated timing
  pin is a low-value speculative test; recorded in the worklog so the
  next editor knows the property is documented-but-unpinned.
- The auth watch's liveness-by-convention (the App.vue load dependency)
  — not-filed: carried-forward pre-existing property, unchanged by this
  sweep, named in the PR #411 gate; out of this sweep's row scope.

## Appendix — Row 4 hack-rationalization-detector run (verbatim, per ADR-0005 Rule 11)

The Row 4 fix touches the >1-writer auth-state slot (localStorage
JWT/username + reactive AuthState), so the hack-rationalization-detector
was run on it. The run is IN-FRAME (the sweep worker produced the change),
so per the skill's own rule it does not discharge a gate — but the row
APPLIES an already-out-of-frame-VERIFIED PR #411 recommendation, and the
in-frame pass was run in justification-as-suspect mode with both
deterministic scripts. Commission and full report recorded verbatim.

### Commission

> Review the Row 4 fix on branch bork/fix/gate-recommendations-sweep: the
> useAuth rejection watch (src/composables/auth-app/useAuth.ts) now ALSO
> clears storage when a token is stored and the state is non-'authenticated'
> (the dead-token-in-error-state corner from PR #411's out-of-frame gate).
> This touches the >1-writer auth-state slot (localStorage JWT/username +
> reactive AuthState). Frame: I (this sweep worker) produced the change.
> Treat my justification as the object of suspicion. Pay particular
> attention to: whether the kind-guard-plus-else-clause is the right shape
> or a per-writer patch; whether the in-flight-reauth skip is genuinely
> preserved; whether clearing storage in a non-'authenticated' state could
> wrongly strip a still-valid prior JWT (composing with delta-c); whether
> the new test could pass against the old code.

### Report (the full artifact; the verdict label does not travel without it)

```
## Hack-rationalization review: Row 4 — dead-token-in-error-state (gate-recommendations sweep)

FRAME CHECK: IN-FRAME — this run was executed by the sweep worker who produced
the change, in justification-as-suspect mode (both deterministic scripts run,
writers re-derived from code rather than memory). Per the skill's own rule a
self-applied run is NOT a discharge: this artifact is evidence-gathering. The
change is a Row applied against PR #411's already-VERIFIED out-of-frame gate
recommendation, so the *recommendation* carries an out-of-frame provenance; this
pass certifies the *application*, not the recommendation, and the coordinator's
own review remains the gate for the merged PR.

GENERAL FIX:   Every storage-mutating transition of the nominal auth state is
performed by the single owner (useAuth) and is driven by the same property
("the stored token is dead, so clear it") regardless of which state-kind the
SPA is in — not a per-state enumeration of when-to-clear.

PATCH SHIPPED: The session-rejected watch keeps the full transition (clear +
state-flip + warning) for the 'authenticated' case, and ADDS an else-branch:
when the state is NOT 'authenticated' but a stored identity exists
(`api.cachedUsername() !== null`), it clears storage (`api.clearToken()`, both
keys) without a state-flip or warning. The dead token thus stops re-entering the
re-login retry loop.

DOWNGRADE:     No minimality-word laundering. Two narrowings, each with a
concrete reason: (1) the else-branch does NOT flip state or warn — concrete
cost of doing so would be clobbering a meaningful 'error' message the user is
acting on, and the state is already off 'authenticated' so no transition is
owed; (2) the else-branch keys on `cachedUsername()` rather than a "token
stored" probe — concrete reason: `cachedUsername()` (USER_KEY) is exactly the
condition api-client.ts:190 reads to decide whether to fire the retry loop, so
it is the precise predicate for "this dead identity would re-enter the loop",
and api-client exposes no public token-presence accessor (the token getter is
private). Neither downgrade rests on a discipline-word.

WRITER DELTA:  claimed 1 owner module (useAuth) vs enumerated: MATCH, no new
writer introduced. Storage writers (TOKEN_KEY/USER_KEY) are all five in
api-client.ts behind `login`/`setCachedUsername`/`clearToken`/the token setter
(lines 87/88/272/273/308/319/320); every out-of-module caller of those is in
useAuth.ts (clearToken at 134/140/193/344; login at 278/320; setCachedUsername
at 185). The archived-migrations.ts:2142 removeItem is a NON-auth key
(`lengyue.fOptimizerCache.v1`). The new clearToken call (useAuth.ts:140) is the
SAME owner module invoking the SAME public owner method — it adds a call site,
not a writer module. _authState is still written only by setState (useAuth).
The change does not widen the writer set; it widens WHEN the existing owner
clears, which is the single-owner-shape-preserving direction.

RUNTIME:       Reproduced + verified at the test level (the suite's sanctioned
stubbed-fetch boundary; no live backend). The dead-token-in-error-state test
drives the real useAuth + real api-client: authenticate as bob → failed
switch-to-ghost leaves state 'error' with bob's token stored → server goes
'rejecting' → a data request 401s, the one identity-honest retry (login bob)
also 401s, the counter bumps, the watch fires (sync flush) and clears storage;
asserted that both keys are null afterward, state stays 'error', and a SECOND
request fires ZERO further re-login attempts (the loop is broken). Confirmed the
new test fails against old code: the pre-change watch (b7bc36c4) has no
else-clause, so the token would persist and the `toBeNull()` assertions would
go red. The in-flight skip was verified at its real location: the bump guard
(api-client.ts:221) includes `!this.isReauthInFlight`, so any rejection reaching
the watch is, by construction, observed after re-auth is no longer in flight —
the watch needs no separate in-flight check, and adding one would be a
redundant per-writer guard.

TELLS (Step 1): grep_tells over the useAuth diff: 2 minimality-terms, 0
named-fix cues, 0 co-occurrence tells. No named-better-fix-then-downgraded
sentence. (The 2 minimality-terms are "minimal repair" in the new comment,
describing why no state-flip is added — a stated reason, not a mood.)

VERDICT: general
WHY: The clear is driven by one property ("the rejected token is dead") that
quantifies over state-kind rather than enumerating per-state clear rules; the
single-owner invariant is preserved (the new clear is the owner invoking its own
public storage method, not a second writer); and the delta-c composition is
safe because the rejection counter only bumps on a NON-auth-endpoint 401 (a
data request whose token the server rejected), never on a failed login/register
attempt (those hit /auth/* and are skipped), so the prior-valid-JWT that delta-c
preserves is never reached by this branch — the token this branch clears is
provably the one the server just rejected.

FINDINGS BEYOND VERDICT (required):
  - The kind-guard-plus-else is two branches over the same slot, which reads as
    a near-enumeration. It is defensible here because the two branches do
    genuinely different things (a full transition vs a storage-only repair) and
    the discriminating property (authenticated-vs-not) maps to a real
    distinction (whether a state transition is owed). But a maintainer should
    note this is the SECOND special-case the watch now carries; a third
    state-conditional clause would be the signal to refactor the watch into a
    "reconcile storage and state against the rejection" function with one
    decision table, rather than accreting branches.
  - The else-branch's predicate is `cachedUsername() !== null`, which detects
    the USER_KEY, not the TOKEN_KEY. In the normal flow they are written and
    cleared together, so this is sound; but if a future code path ever leaves a
    TOKEN_KEY without a USER_KEY (an inconsistent half-state), this branch would
    not clear the orphan token. That orphan would also not trigger the retry
    loop (the loop is USER_KEY-gated), so it is harmless to the stated bug — but
    it is a latent asymmetry between "what detects the dead identity" and "what
    a fully-symmetric clear would target". Bounded and not reachable today; named
    so it is visible rather than latent.
  - Liveness remains convention-bound, unchanged by this row: the watch only
    runs because App.vue loads useAuth (PR #411 gate's carried-forward finding).
    This row does not regress that and does not address it; it was out of scope
    for the recommendation.
  - The flush:'sync' belt-and-suspenders correction (Row 5) and this fix touch
    the same watch; the corrected understanding (sync is not uniquely
    load-bearing) does not affect this branch's correctness — the storage clear
    is observable to the test regardless of flush mode, same as the
    authenticated branch.
```

(End of verbatim artifact.)

License: Public Domain (The Unlicense).
