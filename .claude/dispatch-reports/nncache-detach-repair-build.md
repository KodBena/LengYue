# NN-cache-context detach repair — build report

Fresh-context repair against `.claude/dispatch-reports/nncache-context-review.md`
(ACCEPT-WITH-CONDITIONS verdict on `b66a8a60`/`b0e97cad`). Branch
`nncache-detach-repair`, cut from `b0e97cad` (feature tip on top of
`829e952c`).

## The defect (review's framing)

`disable()` and `dumpAndDetach()` in `frontend/src/services/nncache-session.ts`
cleared `state/nncache-context.ts`'s attached-context slot (and flipped
`enabled`/`status` back to the "disabled" shape) **unconditionally**, even
when the wire `cache_detach` — or, in `dumpAndDetach`, the preceding
`cache_dump` — was refused by the engine.

Per `Analysis_Engine.md` § "Attributing what a query earns in the cache":
with exactly one context attached to a model, a query with no `cacheContext`
is implicitly attributed to that context. A refused detach leaves the engine
*still attached*. The old code nonetheless cleared `activeAttachedContext`,
so `query-routing.ts::finalizeAnalysisRouting` stopped stamping outgoing
queries — the next untagged query would be silently attributed by the
engine to the card the user had just tried to leave. Two integration tests
and the `state/nncache-context.ts` docstring pinned this as intentional.

## The repair

Ratified semantics (per the dispatch): on a REFUSED/failed `cache_detach`
(or a refused `cache_dump` ahead of one — that leg never touches attach
state either, so the same rule applies), local state stays in the settled
**attached** shape:

- `_state.enabled` is left `true` (never set `false` on a refusal).
- `_state.status` reverts to `'attached'` (not `'idle'`) — visibly
  distinguishable from a genuine disable, without introducing a new status
  enum value (kept to the existing `'idle' | 'attaching' | 'attached' |
  'detaching'` set — minimal-touch).
- `activeAttachedContext` (in `state/nncache-context.ts`) is left
  **untouched** — `clearAttachedContext()` is only called on paths that
  actually confirm nothing is attached (a successful detach, a refused
  `cache_attach`, or the driver's own `ctx === null` bookkeeping branches).
  Because `query-routing.ts` reads that slot directly, outgoing analyze
  queries keep being stamped with the context the user tried to leave —
  the ordering requirement from the brief ("stop stamping is gated on the
  detach actually succeeding") falls out for free from never clearing the
  slot on a refusal, rather than needing a separate ordering fix.
- The refusal surfaces via `pushSystemMessage('warning', …)` with the
  engine's own `detail` text; no automatic retry (ADR-0002) — the user
  re-ticks the checkbox / retries the card advance.

`enable()` needed no change — it was already clean (state only commits
after a successful wire round-trip).

### Files touched

- `frontend/src/services/nncache-session.ts` — `disable()` and
  `dumpAndDetach()` rewritten per the semantics above; `transition()`'s
  doc comment corrected to describe the new (correct) revert-to-attached
  behavior instead of the old clear-on-refusal one; module header's
  "Quiescence" section rewritten to name the SPA's own
  `usePlayFromPosition.ts`/`useKomiCalibration.ts` `connectFresh` paths
  honestly instead of framing the gap as only "other clients of a shared
  proxy/leaf" (review finding 2 — no new quiesce machinery added, per the
  brief); disconnect-hook registration wrapped in an `import.meta.hot.data`
  guard so a dev-mode HMR reload of this module doesn't push a second
  stale-closure hook into `analysisService`'s `disconnectHooks` array
  (review finding 8).
- `frontend/src/state/nncache-context.ts` — `clearAttachedContext()`'s
  docstring rewritten to state truthfully when it is and (now, explicitly)
  is NOT called; it previously claimed to run "after a successful
  `cache_detach`," which was false (it ran on failure too).
- `frontend/src/services/analysis-service.ts` — `hasActiveQueries()`'s doc
  comment corrected: it claimed to be used by `nncache-session.ts`'s
  quiesce step, but is never actually called there (grepped; only
  referenced in a comment) — `quiesce()` calls `stopAllBoardAnalyses()`
  directly, which happens to leave the same postcondition true. Comment
  now says so honestly (review finding 2).
- `frontend/tests/integration/nncache-session.test.ts` — see below.
- `frontend/src/locales/{en,ja,ko,zh-CN}.json` — see i18n section below.

### Tests rewritten

Both pinning tests the review named, plus one pre-existing test that
turned out to pin the same bug from the dump-refusal angle (not named
explicitly in the review's line numbers, but caught while fixing the
sibling case — same root cause, same contract):

1. **`nncache-session: disable` — "sends cache_detach with
   discardUndumped:true..."** (was: "…and clears attachment locally
   regardless of the wire result", the review's line-129 pin). Split into
   two tests: the success case now asserts `status === 'idle'` explicitly
   in addition to `enabled === false` / `activeAttachedContext === null`;
   a new test, **"a REFUSED cache_detach leaves the context attached...
   never silently believed detached"**, asserts `enabled === true`,
   `status === 'attached'`, `activeAttachedContext === 'alice.card-5'`
   (unchanged), the warning message surfaces the engine's detail text,
   and no second wire call is made (no auto-retry).

2. **`nncache-session: transition` — "a refused detach still clears local
   attachment state (never left half-tracked)..."** (the review's line-192
   pin) renamed to **"a refused detach leaves the OLD context attached
   (engine truth mirrored) and does not attempt the new attach"** — now
   asserts `activeAttachedContext === 'alice.card-5'` (the OLD context,
   not cleared), `enabled === true`, `status === 'attached'`, and the
   refusal's detail text in the surfaced warning.

3. **`nncache-session: transition` — "a refused dump aborts the
   transition..."** (pre-existing, not named in the review by line number,
   but asserted `activeAttachedContext === null` / `enabled === false` on
   a dump refusal — the same bug one leg earlier, since `cache_dump`
   never touches attach state at all). Corrected to assert the context
   stays attached, `status === 'attached'`, same as the detach-refusal
   case.

No new test files; the rewritten/added assertions live in the existing
`describe` blocks. Full file re-read after edits to confirm no duplicate
or dangling tests remained.

### `state/nncache-context.ts` docstring

Rewritten to state precisely when `clearAttachedContext()` runs (successful
detach; refused attach; the driver's own already-nothing-attached
bookkeeping branches) and explicitly that it is never called on a refused
detach or a refused dump-ahead-of-detach, with the rationale inline and a
pointer to the two functions that changed.

### Non-blocking review findings folded in

- **`hasActiveQueries()` doc-comment overclaim** and the **module-header
  "other clients" framing** — both corrected as described above.
- **Dev-HMR double-registration guard** on the disconnect hook — added via
  an `import.meta.hot.data` flag (see file list above). Verified the guard
  doesn't break under Vitest, where `import.meta.hot` is present in some
  form but partial — both the read (`import.meta.hot?.data?.…`) and the
  write (`import.meta.hot?.data` before assigning the property) are
  optional-chained rather than assuming Vite's full `HotContext` shape;
  a first attempt tried `import.meta.hot.data ??= {}`, which `vue-tsc`
  correctly rejected (`TS2540: Cannot assign to 'data' because it is a
  read-only property` — the property itself can't be reassigned, only
  mutated), so the guard checks `.data` truthiness instead of trying to
  initialize it.

### Not folded in (per the brief)

The two disclosed-not-ratified scope items (i18n narrowed to `en.json`
only; quiescence-as-unconditional-termination) were flagged by the review
as needing an explicit commissioner yes/no, not resolved here — this
dispatch's i18n propagation (below) addresses the first mechanically, but
the ratification question itself is the commissioner's, not this repair's,
to answer. No new quiesce machinery was added — the brief was explicit
("do NOT build new quiesce machinery today"), and the module-header fix is
a documentation correction, not a design change.

## i18n propagation

The five `toolbar.nncache.*`/`nncache.*` keys that shipped in `en.json`
only are now present in `ja.json`, `ko.json`, and `zh-CN.json`, matching
the existing `[TODO] …` prefix convention already used for other
untranslated keys in those catalogs (e.g. `sync.workspaceFutureVersion`
in `ja.json`) — English text, prefixed, marked for a human translator.
Inserted at the same relative position as `en.json` (between
`toolbar.metric.pbo` and `toolbar.sliders.empty`) in all three files.

`en.json`'s own `nncache.detachRefused` / `nncache.dumpRefused` strings
were also reworded to say the consequence, not just the wire event —
"…it remains attached, and outgoing analyses keep being tagged to it:
{detail}" — since both are now used on the repaired revert-to-attached
path and the old wording ("KataGo refused to detach the NN-cache context:
{detail}") no longer tells the user what state they're actually in.

All four locale JSON files verified to parse with `JSON.parse` after
editing.

## Gates (literal exit codes, run on the final tree)

- `nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048 npm run build`
  (`vue-tsc -b && vite build`) — **exit 0**. (First attempt at the HMR
  guard failed `vue-tsc` with `TS2540`; fixed as described above, then
  reran clean.)
- `nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048 npx vitest run
  --maxWorkers=2` (full suite) — **exit 0**: `279 passed | 3 skipped`
  test files, `3483 passed | 8 skipped` tests, 268.72s. (A targeted run of
  just `tests/integration/nncache-session.test.ts` +
  `tests/unit/engine/katago/query-routing.test.ts` was also run standalone
  during development — 35/35 passed — before the full-suite gate.)

No wall-clock sleeps were added to any test (grepped the touched test
file for `waitForTimeout`/delay-`setTimeout` — none).

## Commit

Committed as a single change on `nncache-detach-repair`; see the parent
message for the commit hash.
