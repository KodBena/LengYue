# Worklog — Multi-writer slots get owners: maxVisitsTarget guard, blind-mode pref snapshot, engine-connection owner, writer-enumeration lint (2026-06-10)

> Audit trail for work-status item `multi-writer-slots-get-owners`,
> executing §3.7 of the 2026-06-10 history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`; lesson
> L2: "multi-writer slots want owners, not per-writer gates"); branch
> `bork/fix/multi-writer-slots-get-owners`, PR #381. Four legs, in
> order: the `maxVisitsTarget` board write moved behind `analyzeRange`'s
> refusal guards and through `mutateBoard`; a snapshot/restore owner for
> the session-UI prefs blind mode flips; an engine-connection owner
> module collapsing the ~20 scattered `store.engine` writes; and the
> data-driven `local/store-write-needs-owner` writer-enumeration lint,
> recorded as ADR-0001's Revisit-#3 response.

## Maintainer-decided defaults baked in (approved 2026-06-10)

- **finishCard's force-enable of move suggestions is PRESERVED** as
  deliberate pedagogy — the reveal after the blind attempt (audit
  §7.3). The fix restores the user's pre-review value at `endSession`
  and on the abort paths instead of forcing `true` there;
  `treeExpanded` gets the snapshot/restore treatment on all three
  paths (finishCard restores it — the tree carries no grading reveal).
- **`restartActiveAnalyses` semantics PRESERVED exactly**; the open
  question (should "active" mean *not explicitly stopped* — current —
  or *in flight*?) is recorded in the owner module's docstring per the
  hydration-rebind residue audit §3.3 wrinkle 2 / §6.1, not decided.

## Leg 1 — `analyzeRange`'s maxVisitsTarget write behind the guards

`analysis-service.ts::analyzeRange` wrote `board.maxVisitsTarget`
*before* its early-return guards — the write fired even when the query
was refused (disconnected engine, empty path, inverted range) — and as
a direct aliased write it never bumped `boardsVersion`, so the
debounced SyncService sync missed it until an unrelated mutation fired
one. The write now sits after both guards and routes through
`mutateBoard` (one fix, both halves). `BoardTab`'s rugplot reads the
field as its visit-depth denominator; behaviour on the success path is
unchanged.

**Deviation, recorded loudly:** the item description's "delete the
unjustified cast" was already done — the `(board as any)` vestige was
removed by the cast-hygiene-lint arc earlier the same day (its
worklog's "two vestige casts whose target types already declare the
fields (analysis-service ×2)"). Nothing remained to delete; the
guard-reorder and `mutateBoard` routing were the live halves of the
leg.

## Leg 2 — blind-mode pref snapshot/restore owner

New module `frontend/src/composables/review/blind-mode-prefs.ts`:
`createUiPrefSnapshotOwner(keys)` is the generic mechanism
(snapshot-if-absent / owned-write / subset-restore / release over a
**supplied** key list — the fork-reshape contract), and
`blindModePrefs` is the review session's instance with today's
domain-supplied list `{showMoveSuggestions, treeExpanded}`. The
policy lives at the `useReviewSession.ts` call sites:

- `loadCard` — `capture(bId)` (idempotent across the session's cards,
  so the *pre-review* truth survives multi-card sessions), then owned
  writes of the blind values (`false`, `false`).
- `finishCard` — owned write `showMoveSuggestions = true` (the
  intermission reveal, preserved per the maintainer call) +
  `restoreKeys(['treeExpanded'])`.
- `endSession` — `release(bId)`: every key returns to its snapshot
  value. The prior unconditional `= true` clobbered a persisted
  off-preference (`session.ui` rides `buildPersistencePayload`), and
  the clobber survived reloads — audit §3.7 leg (ii).
- `abortBoardReview(boardId)` / `abortAllReviews()` — the existing
  abort-controller registry helpers (reached from `closeBoard` /
  `resetWorkspace`) now also `release(boardId)` / `releaseAll()`. The
  release is keyed on snapshot ownership, not on a pending controller:
  a review can sit in `AWAITING_MOVE` with no in-flight wait and
  closing the board must still un-blind the session UI.

Mid-review manual toggles (the keybinding action for
`showMoveSuggestions`; App.vue's template button for `treeExpanded` —
both sanctioned direct writers) are routed into the snapshot by one
`flush: 'sync'` watcher per key, guarded by an owner-write reentrancy
flag, so the eventual restore lands on the user's *latest* deliberate
choice. The watchers are installed lazily on the first `capture()`:
the module sits on the `store/index.ts → useReviewSession → here →
store` import cycle, and a sync watch runs its getter at creation —
at module scope that read can land while the store module is still
mid-initialization (caught by the test suite as 29 import-order
failures; the lazy install is the fix, and the rationale is inline).

Known edges recorded in the module header rather than engineered
around: concurrent reviews on two boards share the one global pref
record (pre-existing conflict surface; first-to-enter owns the
snapshot); a mid-review reload persists the blind values — the
pre-existing "review state survives reload" question, deliberately not
decided here (not-filed: whether review sessions should survive reload
at all is a maintainer-level semantics call predating this item; no
work-status item exists for it); hydration during a session reads as
an external write (persisted truth wins). The store↔review import
cycle the lazy watcher install works around
(`store/index.ts → useReviewSession → blind-mode-prefs → store`) is
itself untouched (not-filed: decoupling the abort/cleanup registry
from the store module is the store-hub Band-2/3-imports problem the
history-lessons audit treats under §3.8's phase-registry design,
gated on the maintainer question recorded there — §7.2).

**Tests** (`tests/integration/useReviewSession.test.ts`, new
"blind-mode pref ownership" describe — three cases covering the
commissioned scenarios, driven through the REAL `startSession` →
`loadCard` SGF-parse path): (a) preference-off user completes a
review — suggestions revealed during the intermission, `treeExpanded`
restored there, both prefs back to pre-review values at `endSession`;
(b) `closeBoard` mid-review restores via `abortBoardReview`, with no
pending wait (pinning ownership-keyed release); (c) a mid-review
manual toggle updates the snapshot — the user's new choice wins at
session end. The pre-existing `endSession` test's force-true
assertion was updated to the new contract (no snapshot active ⇒ prefs
untouched), with a comment pointing at the new describe block.

## Leg 3 — engine-connection owner module

New module `frontend/src/services/engine-connection.ts`, named for the
problem class (analysis-provider connection lifecycle: connect /
disconnect-reset / info / selection / metrics — nothing KataGo-specific
in it). It owns the `store.engine` subtree writes; `analysis-service`
keeps the transport, the per-query bookkeeping, and its public surface
unchanged (a seam extraction, not a rewrite):

- `applyEngineDisconnectReset()` collapses the disconnect-reset block
  previously duplicated between the WS `onDisconnect` callback and the
  user-initiated `disconnect()` (status / activeMode wipe / identity
  clear / selection clear via `setSelectedModel(null)` / ping-marker
  reset). Transport-side teardown (telemetry sweep, timer clears, the
  system message) stays in the service.
- `markEngineConnected`, `setEngineInfo`, `refreshEngineVersion`
  (watchdog version refresh), `recordPacketRate`,
  `markWatchdogPingPending`, `recordWatchdogPong`,
  `recordLastResponseBoard`, `setBoardActiveMode`.
- The SELECTOR auto-select now routes through the existing
  `setSelectedModel` named mutator (it previously bypassed it — the
  audit's :192/:408 finding).

Preserved exactly, with records: `resetWorkspace`'s deliberate
non-reset of `store.engine` (the owner's header carries the
`engine-connection-lifecycle-logout` beneficiary note — the future
logout arc lands here); the `activeMode` projection logic stays in
`analysis-service::recomputeActiveMode` threaded through query
minting/release (only the terminal write goes through the owner); the
restart-thunk semantics and the §6.1 open question are recorded
verbatim-in-substance in the owner's header; the O15
reconcile-on-next-interaction no-clear decision stays documented at
the `onDisconnect` callback.

## Leg 4 — `local/store-write-needs-owner` writer-enumeration lint

New rule `frontend/eslint-rules/store-write-needs-owner.js`, joined to
the shared `LOCAL_RULE_PLUGIN`. Data-driven `{storeSubtreePath →
ownerFiles}` config in `eslint.config.js`; a write (assignment,
compound assignment, `++`/`--`, `delete`) to a configured subtree
outside its owner files is an error. Template expressions are covered
via `defineTemplateBodyVisitor`, including `v-model` (reported on the
element's start tag so the HTML-comment escape hatch is usable).
ADR-0001's template-toggle exception is carved out as config
(`templateToggleExemptPrefixes: ['session.ui']`, template context
only), with the exception's terms quoted from the ADR in the rule
file's header. Named gaps per ADR-0002 (the sibling-rule posture):
aliased roots, method-call mutations, name-matched `store`,
destructuring targets.

Today's entries: `store.boards` → `src/store/index.ts`;
`store.engine` → `src/store/index.ts` + the leg-3 owner module;
`store.profile` → `src/store/index.ts`.

### Writer-enumeration baseline (measured, AST-grade)

Branch-point baseline measured by stashing `src/` and running the rule
at `error`; "after" is this branch at adoption. The grep-grade audit
estimate (~19 engine writes; 1 template profile write) undercounted —
the AST measurement found 20 and 5 respectively.

| Subtree | Baseline hits (branch point) | After | Disposition |
|---|---|---|---|
| `store.engine` | 20 — all `analysis-service.ts` (incl. the duplicated disconnect-reset and the two `setSelectedModel` bypasses) | 0 | collapsed into `services/engine-connection.ts` (leg 3) |
| `store.boards` | 0 | 0 | mutator convention already held; leg 1's `maxVisitsTarget` was an *aliased* write through `boards.find()` — outside the rule's syntactic reach, routed through `mutateBoard` in the same change |
| `store.profile` | 10 — `AnalysisControls.vue` ×5 (template `v-model`s on settings leaves), `useLocale.ts` ×1, `useQeubo.ts` ×2, `scenarioContext.ts` ×2 | 10, all annotated | every one a deliberate slice write; kept as inline `eslint-disable-next-line` exemptions with slice-naming justifications (the `vue/no-v-html` model). The `AnalysisControls` v-models are template writes to PROFILE state — outside the ADR-0001 `session.ui` sanction, so annotated as named layering debt, not exempted by config. The discharge the annotations point at — a settings-editor mutator arc giving `store.profile.settings` a real owner — is a deferral (not-filed: no work-status item exists; the exemption comments are the in-tree record) |

Adopted at `error` on this fully-triaged baseline (`npx eslint .` exit
0), per the config's measure-first posture.

### Probe verification (scratch, reverted)

- Reintroducing the original defect shape (`store.engine.status =
  'connected'` in analysis-service) fires the rule at exactly that
  site; clean again after revert.
- A scratch config enumerating `session.ui`: the script-side direct
  writes in `keybindings.ts` fire (5 sites); App.vue's template
  toggles do **not** (the ADR-0001 exemption) — and a negative control
  with the exemption emptied makes the same 4 App.vue template writes
  fire, proving the carve-out is load-bearing, not a dead branch. The
  scratch config was deleted before commit.

### ADR-0001 amendment

Appended (never rewrote) per the ADR's fresh 2026-06-10 amendment
convention: a second dated entry in the header's Amendments field; an
inline *(Mechanized 2026-06-10 — …)* annotation on the
Negative-consequences vigilance bullet; and a **(Response recorded
2026-06-10 — trigger not fired.)** note under Revisit-when #3 carrying
the measured numbers and the trigger's still-live terms.
`docs/adr-synopsis.md`'s ADR-0001 entry co-changed (its
"code-review responsibility, not a type-system enforcement" sentence
now names the partial mechanization).

## Perf null check (regression insurance, no claims either way)

Protocol: `docs/notes/perf-capture-normalization-protocol.md` read end
to end; battery `frontend/scripts/perf-capture.mjs full-stress --model
b10c128` (headless Chromium, SELECTOR proxy `ws://127.0.0.1:1235`),
parsed by `scripts/perf-trace-parse.mjs`.

**Engine-availability complication, named loudly:** at the first
capture attempt every upstream LEAF (host-side, `192.168.122.1:1236–42`)
was down — the SELECTOR answered probes but analysis queries returned
"no healthy upstream", so that capture ran without the streaming-range
half and was **discarded**
(`full-stress-2026-06-10T05-50-56-421Z.json`). The `b10c128` upstream
revived mid-arc; both captures of the comparison pair below ran under
healthy-engine conditions (baseline re-captured at the branch point by
stashing `src/`).

**Deviation from the commission's wording:** "per-frame medians"
(RefreshDriverTick p50) is the protocol's *Firefox-profiler* metric;
this Chromium harness's documented comparable is **counts, not
wall-clock** (`perf-trace-parse.mjs` header: render/patch operation
counts, normalized on the scenario proxies). The comparison below
follows the harness's own discipline.

Comparability proxies first, per the protocol: `autonav:step` 100 = 100;
packet volume `rb3:handler` 111 (before) vs 102 (after) — within
cache/visit jitter, and the analysis-coupled counts are read
per-packet below.

| Signal | Before (branch point, `06-21-01`) | After (this branch, `06-19-56`) | Read |
|---|---|---|---|
| R/P ratio, every component | 1.00 | 1.00 | render-coupling invariant holds on both sides |
| Total render/patch ops | 1793 / 1793 | 1734 / 1734 | scales with packet volume (111 vs 102 handlers) |
| AnalysisChartPanel renders per packet | 198/111 ≈ 1.78 | 178/102 ≈ 1.75 | flat |
| Nav-coupled leaves (BoardWidget / TreeWidget / StatusBar / BoardDisplay) | 101 / 101 / 101 / 101 | 102 / 101 / 101 / 101 | ≈ nav steps; ±1 is popover-cycle jitter (8 vs 7 opens) |
| MiniBoard / MiniBoardCanvas / ChartPreviewBox | 201 / 201 / 204 | 201 / 201 / 204 | identical |
| DOM nodes / JS listeners (peak) | 4559 / 714 | 4558 / 725 | flat |

**Verdict: null check passes** — no regression signal; per-packet and
per-nav-normalized counts are flat and every R/P ratio is 1.00 on both
sides. Per ADR-0009 this is recorded as insurance, not as a perf claim
in either direction. Named residual gap: the review-session paths
(legs 1–2) are not exercised by the full-stress scenario, so their
perf neutrality rests on inspection (a per-move `mutateBoard` call and
a handful of sync-watcher comparisons per pref write), not capture.
Traces under `~/w/vdc/chromium_profiles/` per the ADR-0009 share
convention.

## Deviations from the item description (summary)

1. Leg 1's cast was already deleted by the same-day cast-hygiene arc —
   recorded above, nothing silently absorbed.
2. The perf comparison uses the Chromium harness's counts-not-wall-clock
   discipline rather than the commission's literal "per-frame medians"
   (a Firefox-profiler vocabulary) — recorded above.
3. "One integration test" is delivered as one describe block with three
   test cases (the three commissioned scenarios), for diagnostic
   granularity.
4. The blind-mode watchers install lazily on first `capture()` rather
   than at module scope (import-cycle constraint, found by the suite;
   rationale inline in the module).

## Documentation audit

- **Work-status store:** read-only this session per the commission; the
  item's closure is the coordinator's call on merge.
- **ADR-0001:** amended (Revisit-#3 response; see leg 4).
  `docs/adr-synopsis.md` co-changed.
- **FILES.md:** rows added for `services/engine-connection.ts` ([B3] —
  it writes the engine slice of the [B3] store hub and speaks the
  engine band's types, though named for the problem class; the row
  carries the wholesale-replaceability note) and
  `composables/review/blind-mode-prefs.ts` ([B3] via its store import
  and consumer; band-agnostic core noted for the fork).
- **FEATURES.md:** no edit. The tour's review-session entries (blind
  AWAITING_MOVE, intermission reveal) remain accurate; post-session
  pref state was never described, and the change restores user intent
  rather than altering a described capability.
- **handoff-current.md:** read end to end; no orientation surface it
  carries is affected (its ADR-0001 paragraph remains accurate under
  the amendment).
- **Dispatch ledger:** no open dispatch addressed to the frontend bears
  on this item (checked `docs/dispatch/` listing).
- **Doc-graph:** this worklog is a new node — regenerated via
  `node tools/doc-graph/generate.mjs` in the same change; committed
  json+md.

## Verification

`npm install` + `npm run build` green (vue-tsc + vite); `npx eslint .`
exit 0 (new rule at `error`); `npm run test:run` 868 passed / 4 skipped
(the 865 pre-existing plus the three new blind-mode cases; the
mid-implementation 29-file import-order failure described in leg 2 was
caught by this battery and fixed before commit). All probe edits were
scratch-only and reverted; the scratch measurement config was deleted.
One tooling incident, recorded honestly: the second `git stash push -u
-- frontend/src` cycle (the baseline perf capture) restored the
changes to the *index* but left the `frontend/src` worktree at HEAD;
the desync was caught by the hack-rationalization pass's independent
writer enumeration reading pre-change file shapes, the worktree was
restored from the index (`git restore --worktree -- frontend/src`),
and the full battery re-run green on the restored tree before commit.

## Appendix — hack-rationalization-detector run (verbatim, per the standing verbatim-record discipline)

### Commission

> Review the uncommitted working-tree changes on branch
> bork/fix/multi-writer-slots-get-owners in
> /home/bork/w/omega/.claude/worktrees/agent-aa5093505d3a4b6ee (diff vs
> HEAD 59c1447). The change claims to give three multi-writer store
> slots owners (work-status item multi-writer-slots-get-owners, audit
> §3.7): (1) analysis-service's maxVisitsTarget write moved behind
> analyzeRange's guards and through mutateBoard; (2) a blind-mode
> snapshot/restore owner (blind-mode-prefs.ts) for session-UI prefs
> flipped by the review session, hooked into
> loadCard/finishCard/endSession/abortBoardReview/abortAllReviews;
> (3) an engine-connection owner module (services/engine-connection.ts)
> collapsing ~20 direct store.engine writes incl. a duplicated
> disconnect-reset; (4) a data-driven ESLint writer-enumeration rule
> (eslint-rules/store-write-needs-owner.js + eslint.config.js block)
> adopted at error, with 10 store.profile hits kept as annotated inline
> exemptions. Pay particular attention to: whether the snapshot owner
> is a real owner or a dressed-up per-writer gate; whether the inline
> exemptions are honest triage or laziness; whether the lazy watcher
> install hides a deeper init-order problem; whether any
> preserved-semantics claim (restartActiveAnalyses, resetWorkspace
> non-reset, activeMode projection) is actually preserved; and whether
> the lint's named gaps make the rule vacuous.

### Report (the full artifact; the verdict label does not travel without it)

```
## Hack-rationalization review: multi-writer-slots-get-owners
   (branch bork/fix/multi-writer-slots-get-owners, pre-commit working
   tree vs 59c1447)

FRAME CHECK: DEFICIENT — run by the implementing session (this harness
exposes no subagent affordance), in the fallback mode: the
implementer's justification treated as the object of suspicion,
anchored on the two deterministic scripts (grep_tells,
enumerate_writers), which cannot be reasoned around. A genuinely
out-of-frame rerun by a separate session remains available to the
maintainer and is recommended before full trust. This deficiency is
surfaced in the PR body, not absorbed.

GENERAL FIX:   every writer-bearing store slot gets a single owner
that quantifies over ALL writers — for the review-flipped prefs, "a
flow that overrides persisted prefs snapshots at entry, folds any
external write into the snapshot, and restores at every exit"; for
store.engine, "only the owner module and named mutators write the
subtree"; both backed by a lint that enumerates the writer set per
subtree.
PATCH SHIPPED: exactly that for store.engine (owner module + lint at
error; 20 → 0 stray writers, probe-verified) and for the blind-mode
prefs (snapshot owner whose sync-watcher fold-in quantifies over all
external writers, all three current exit paths hooked); maxVisitsTarget
routed through mutateBoard behind the refusal guards; store.profile
NOT given an owner — its 10 deliberate writers were frozen in place as
annotated inline exemptions.
DOWNGRADE:     for store.profile the stated reason is scope ("the
settings-editor surfaces are the natural future mutator arc") — a
discipline-flavored phrase, but the narrowing was specified by the
commissioning item itself ("genuine strays … exempted-with-annotation")
and the concrete cost is real: rerouting five live v-model widgets
through mutators is a behavior-risk settings-editor refactor outside
this item's writ. No other downgrade found.
WRITER DELTA:  claimed = enumerated, on the final tree —
  showMoveSuggestions: 1 direct writer remains (keybindings.ts:217,
    the sanctioned manual toggle; folded into the snapshot by the sync
    watcher) + the owner's guarded writes;
  treeExpanded: 1 (App.vue:410 template toggle; same fold-in) + owner;
  maxVisitsTarget: 0 direct (mutateBoard route); normalizeBoard's
    hydration default (store/index.ts) is in the owner file;
  store.engine.*: 0 outside engine-connection.ts + store/index.ts
    (lint-checked at error; probe re-fired on reintroduction);
  store.profile: 10 annotated writers (5 template v-models + 5 script
    sites), unchanged by design.
  The enumeration also CAUGHT a real defect in this session: it read
  pre-change file shapes, exposing that a stash cycle had desynced the
  worktree from the index; the tree was restored and re-verified.
RUNTIME:       integration-level — the three new tests drive the real
startSession → loadCard → finishCard → endSession / closeBoard paths
(jsdom, fakes at the effect boundaries), and the pre-existing
endSession test pinning the old force-true contract had to be
inverted (inspection-grade red evidence: it would fail on the new
code unmodified, and the new restore assertions would fail on the old
code). No browser-level repro of the original persisted-pref clobber
was performed. The engine-side refactor is exercised at runtime by the
perf harness's connect/probe/watchdog path against a live SELECTOR.

TELLS (Step 1): 1 co-occurrence — the worklog's "mid-review reload
persists the blind values (the pre-existing 'review state survives
reload' question, out of scope)" near "ownership". Adjudication: the
reload gap is a distinct pre-existing defect class (review-session
rows persist while module state does not), not a narrowing of this
fix — but it had been deferred without an item id, the L3
deferral-evaporation shape. Discharged in this pass: the worklog's
deferral bullets now carry grep-able `not-filed:` markers (reload
question; store-profile mutator arc; the store↔review import cycle).

VERDICT: narrower-but-justified
WHY: the two slots the audit's L2 evidence centered on (the engine
subtree; the blind-mode prefs) received true owners stating one
invariant over all writers, mechanically backed; the narrowings
(store.profile fenced-not-owned; aliased writes outside the lint's
reach) are commission-specified or carry named concrete costs. What
keeps this from "general" is that two of the narrowings leave original
failure shapes reachable — findings 1 and 2.

FINDINGS BEYOND VERDICT:
  - Nothing mechanically prevents leg 1's own bug class from
    recurring: the maxVisitsTarget defect was an ALIASED write (a
    board object from `boards.find()`), and aliased roots are a named
    gap of the new lint. The lint guards the dotted-path shape the
    engine population had, not the shape leg 1 fixed; recurrence
    defense for aliased writes is review plus ADR-0001's annotated
    vigilance bullet only.
  - store.profile gained a fence, not an owner: the lint freezes
    today's 10 writers, but the slot still has no single mutator and
    the five settings-editor v-models remain live two-way bindings to
    persisted state. The discharge the annotations point at (a
    settings-editor mutator arc) is not a filed work-status item
    (not-filed marker now in the worklog).
  - The blind-mode owner's EXIT set is enumerated (endSession + the
    two abort helpers); a future review-exit path added without a
    release() call reopens the leak silently. No mechanical guard ties
    "review leaves non-IDLE" to "snapshot released". The watcher side
    quantifies over all writers; the exit side does not quantify over
    future exits.
  - The lazy watcher install is a workaround for a PRE-EXISTING import
    cycle (store/index.ts → useReviewSession → blind-mode-prefs →
    store); the cycle itself is untouched and was not named in the
    implementer's prose until this review forced it (now a not-filed
    marker pointing at the §3.8 phase-registry design, which is gated
    on a recorded maintainer question).
  - The snapshot is not persisted: a mid-review reload leaves blind
    values in the persisted blob with no restore path. Post-session
    and post-abort clobbers are fixed; exit-via-reload is not — the
    audit's "the clobber survives reloads" is discharged for the
    session-lifecycle paths only.
  - Concurrent reviews on two boards share the one global snapshot;
    first-to-capture-owns is documented but arbitrary, and
    releaseAll() on identity flip restoring board A's values while
    board B is mid-blind is a reachable oddity (bounded: the prefs
    were already a shared conflict surface before this change).
  - Preserved-semantics claims verified against the diff:
    restartActiveAnalyses and the restartCallbacks map are untouched;
    resetWorkspace still does not touch store.engine; the activeMode
    projection logic is byte-identical with only its terminal write
    routed through the owner. The lint is not vacuous against its
    motivating population (all 20 engine writes were the dotted-path
    shape it guards), but see finding 1 for the shape it does not.
```

License: Public Domain (The Unlicense).
