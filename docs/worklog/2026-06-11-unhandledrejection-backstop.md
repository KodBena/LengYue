# Worklog — window `unhandledrejection` backstop (2026-06-11)

> Work-status item `unhandledrejection-backstop` (filed from the
> 2026-06-10 deferral harvest, `docs/notes/audit/audit-deferral-harvest-2026-06-10.md`
> row 30; origin the root-error-boundary worklog
> `docs/archive/worklog/2026-04-pre-v1.0/2026-04-27-root-error-boundary.md`,
> its "Out of scope" § naming `window.addEventListener('unhandledrejection')`
> as worth-doing-eventually). Branch `bork/fix/unhandledrejection-backstop`,
> PR #<filled on push>. Frontend sub-project.

## Context

The root error boundary closed the white-screen failure mode for errors
that propagate through Vue's reactivity: `RootErrorBoundary.vue`'s
`onErrorCaptured` for descendant render/watcher/lifecycle/event-handler
errors, and `main.ts`'s `app.config.errorHandler` as the last-resort
backstop for errors that escape every component boundary (App.vue setup,
mount). Both fire `console.error` (developer surface) + `pushSystemMessage`
(user surface), per ADR-0002's loudness hierarchy.

A promise that rejects with no `.catch` **outside** Vue's render cycle —
a raw `fetch().then(...)` with no rejection handler, an `async` callback
on a non-Vue event, a detached `Promise` chain — escapes both. The
root-error-boundary worklog named this explicitly as out of scope and
worth doing eventually. Verified at HEAD 2026-06-10 (re-confirmed at HEAD
2026-06-11): no `unhandledrejection` handler anywhere under
`frontend/src`. Such a rejection reaches only the browser console —
invisible to the user, the ADR-0002 silent class.

## The change

A `window.addEventListener('unhandledrejection', …)` at app root
(`main.ts`, the bootstrap/wiring surface, sibling to the existing
`app.config.errorHandler`), delegating to a handler built by a new
Band-1 module `src/lib/unhandled-rejection-backstop.ts`.

Posture mirrors the error boundary:

- **Level 5 (developer surface):** `console.error` with the raw reason,
  on **every** rejection — the developer never loses one.
- **Level 4 (user surface):** a `pushSystemMessage('error', …)` entry,
  **de-duplicated** (see below).
- **Not level 3 (a throw):** the rejection has already escaped; a throw
  inside the listener would itself be an unhandled error, compounding
  the failure. The error boundary takes the same stance. The
  `pushSystemMessage` call is wrapped in `try/catch` for the same
  reason — a store-write regression can't become a second unhandled
  rejection inside the handler.

### De-dup design (the enrichment-merge latch precedent, generalized)

The item names the enrichment-merge latch as the worked de-dup
precedent (`services/analysis-ledger.ts`, the §5.5
`nestedNullEscalatedLabels` `Set<string>`): there, a packet flood from
one mislabelled wire field surfaces to the system log **once** per
workspace session, every occurrence still `console.warn`s, and
`purgeAll` clears the latch with the workspace.

The same shape here, with one addition the precedent didn't need. The
precedent's key space is a tiny **fixed** vocabulary (one wire label),
so a per-key `Set` is already bounded. A rejection reason is
**open-ended**, so an unbounded stream of *distinct* reasons would
still wipe the 50-message log if every distinct reason surfaced. Two
gates close both vectors:

1. **Same-reason de-dup.** Keyed on the reason's message string (an
   `Error` keys on its message; a non-Error on its `String(…)`). The
   first occurrence of each distinct reason surfaces to the system log;
   repeats only `console.error`. A looping rejection collapses to one
   log entry. Two distinct `Error` instances with the same message are
   one failure (matching the precedent's one-label-one-anomaly stance).
2. **Distinct-reason cap.** `maxDistinctSurfaced` (default 8) bounds
   the worst case — once `cap` distinct reasons have surfaced, one
   final "further rejections suppressed" notice lands and no further
   distinct reason surfaces. 8 is small relative to the log's 50-slot
   cap; `console.error` is untouched by both gates.

`reset()` clears the latch (the analog of `purgeAll`). It is exported
and exercised by the test; see the deferral below for why it is not
wired to a production lifecycle event today.

### Why a factory over injected sinks

`createRejectionBackstop(deps)` takes `pushSystemMessage` / `translate`
/ `logError` (+ optional `cap`) as injected sinks, so the de-dup logic
is exercisable against the real store + real i18n (and a console spy)
without a real `window`. The real-dependency wiring and the listener
registration live in `main.ts`. This keeps the lib module dependency-
free Band 1 (it imports nothing; it knows nothing of Go, the game tree,
or the engine wire).

## i18n

Two keys added to **all four** catalogs (`en`, `zh-CN`, `ja`, `ko`),
placed in the existing `errors.*` flat group next to `errors.unhandled`:

- `errors.unhandledRejection` — `{msg}` interpolation, the per-rejection
  user-surface line. English `{msg}` passes through per the (a)
  backend-error approach, same as the sibling `errors.unhandled`.
- `errors.unhandledRejectionStorm` — `{count}` interpolation, the
  one-time storm-suppression notice.

The four catalogs are kept in lockstep for this group; `i18n`'s
`fallbackLocale: 'en'` + `missingWarn` would surface any drift.

## Resource-ownership checklist walk (frontend/CLAUDE.md)

The change registers **one document-level listener**. Walking the
authoring checklist:

1. **What external state is keyed by this entity?** The de-dup latch
   (`surfacedKeys` Set + `suppressionNoticeFired` flag) lives inside
   the factory closure. Single owner, single instantiation
   (`main.ts:91`), single write-path (the `handle` closure) — verified
   with the audit's `enumerate_writers.py` (1 writer for `surfacedKeys`;
   all three `suppressionNoticeFired` writes inside the one closure).
2. **What if the owner exited without releasing?** There is no owning
   *entity* that is created and destroyed mid-session. `main.ts` is the
   app root, below any component; the listener has exactly **one
   lifetime — the app's**. The process owns it until the document is
   torn down (page unload / reload), which releases both the listener
   and the closure-held latch for free.
3. **Fix / document / defer?** Deliberate **non-removal**, documented
   inline at the registration site. `onUnmounted`/teardown is **not
   applicable at app root** — there is no component lifecycle here, and
   removing the listener would be wrong: a rejection during the brief
   shutdown window should still surface. The discipline's target
   failure (a later-arriving consumer with a *different* lifecycle) is
   structurally absent — there is exactly one registration site, one
   lifetime. (Contrast the imperative-escape `ResizeObserver`s, which a
   remounting leaf owns and MUST release in `onUnmounted`.)

The inline comment at the registration site names the resource, the
deliberate non-removal, and the failure class it is exempt from.

## Verification

- `npm run build` green (`vue-tsc -b && vite build`, 1052 modules).
- `npx eslint .` exit 0. Notable rule interactions checked: the new
  module is `src/lib/**` (no component→services boundary), it constructs
  no `as any` casts, `pushSystemMessage` is the **named store mutator**
  (the `local/store-write-needs-owner` rule restricts direct
  `store.engine` writes to the store + engine-connection owners — the
  handler writes through the mutator, not the slot).
- `npm run test:run` — 895 passed | 4 skipped, including the new
  `tests/integration/unhandled-rejection-backstop.test.ts` (7 tests):
  single-rejection both-surfaces, non-Error reason via `String()`,
  same-reason storm (1 user entry / N dev logs), same-message-distinct-
  instance collapse, distinct-reason cap + storm notice, `reset()`
  re-surfacing, and `pushSystemMessage`-throws-doesn't-escape. The test
  drives the real store + real i18n catalogs with a console spy — the
  `main.ts` wiring minus the `window` listener (the item scopes out
  full-window e2e; "fire a synthetic rejection through the handler
  function" = call `handle(reason)`, which is exactly what the listener
  delegates to).

## Hack-rationalization pass (in-frame, scripts-led)

I produced this change, so the pass is in-frame and weaker than an
out-of-frame run — recorded honestly. Verdict **general**: the patch is
statable as one invariant over both log-exhaustion vectors and closes
both; the latch is single-owner (0 named-then-downgraded tells; writer
delta 1-claimed-vs-1-enumerated). Full artifact preserved below the
deferrals.

## Deferrals

- The `window 'error'` event (synchronous async errors outside Vue — a
  throw in a raw `setTimeout`, a resource-load error) is a **separate**
  escaped-error surface that remains console-only. This commission was
  scoped to `unhandledrejection` specifically (mirroring the
  root-error-boundary deferral, which named only that event), so this is
  in-scope-complete — but it is not "all escaped async errors now
  surface." not-filed: a plausible sibling follow-up, outside this
  commission's scope; would need its own deferral-harvest entry before
  filing.
- `reset()` is exported (and test-exercised) but wired to no production
  lifecycle event, so the latch never clears for the page's life: once
  the distinct-reason cap is hit, only the console shows further
  rejections until reload. Left unwired because a rejection storm
  crossing a workspace identity flip is not obviously a fresh slate, and
  coupling a Band-1 infra latch to `resetWorkspace` speculatively (with
  no demonstrated need) would be the over-reach the resource-ownership
  discipline warns against. not-filed: a UX judgment for the maintainer,
  not a known defect.

## Documentation touched

- `frontend/FILES.md` — new row for `src/lib/unhandled-rejection-backstop.ts`
  (`[B1]`).
- Doc-graph regenerated (`docs/doc-graph.json` + `docs/doc-graph.md`)
  per the structural-doc discipline.
- No FEATURES.md entry: this surfaces a previously-console-only failure
  to the existing system-log surface; it adds no new user-exercisable
  capability (a Go player reading the tour would not misunderstand the
  app's offering without it). No ADR amendment — it is a concrete
  application of ADR-0002, not a change to the tenet.
- No IDENTIFIERS.md row: no new branded id (the de-dup key is an
  internal `string`, not a domain identifier type).

## Appendix — hack-rationalization artifact (verbatim)

```
## Hack-rationalization review: unhandledrejection-backstop

FRAME CHECK: NOT out-of-frame — I (the implementer) produced this change and
am running the pass on my own diff. Per the skill's own rule this run is
weaker than an out-of-frame one; I have treated my own justification text as
the object of suspicion and leaned on the two deterministic scripts rather
than on my own taste. A genuinely independent reviewer should still run it.

GENERAL FIX:   Every unhandled async failure that escapes Vue's reactivity
               reaches the user via the system-message surface (level 4) and
               the developer via console (level 5), de-duplicated so no
               failure stream — repeated OR distinct — can exhaust the
               50-slot system log.
PATCH SHIPPED: A `window.addEventListener('unhandledrejection')` at app root
               delegating to a factory-built handler that: logs every
               rejection (level 5); surfaces the first occurrence of each
               distinct reason once (level 4), keyed on the reason's
               message; and caps distinct-reason surfacing at
               `maxDistinctSurfaced` (default 8) with one storm notice, so an
               unbounded distinct-reason stream cannot wipe the log.
DOWNGRADE:     None taken under a discipline-word. The shipped patch IS the
               general invariant above — both arms of the log-exhaustion
               worst case (same-reason loop AND distinct-reason storm) are
               closed, not just the cheap one. The `unhandledrejection`
               event is the complete browser surface for escaped async
               rejections; there is no broader handler this narrows from.
               (The sibling `window 'error'` event for non-promise async
               errors is a DIFFERENT surface, not a narrowing of this one —
               see findings.)
WRITER DELTA:  claimed 1 owner vs enumerated 1 owner.
               - `surfacedKeys` Set: 1 write-site (the `const` in the
                 closure). enumerate_writers confirms.
               - `suppressionNoticeFired`: 3 write-sites, all inside the
                 single closure (init / set-true at cap / reset-false). One
                 logical owner.
               - factory instantiated exactly once (`main.ts:91`); `.handle`
                 called from exactly one listener site; `.reset` called from
                 no production site (test-only today). Single-owner latch —
                 the multi-writer-gate failure shape does not apply.
RUNTIME:       Unverified by live-app observation — derived against the test
               harness (7 integration tests, real store + real i18n, pass)
               and the production build (vue-tsc + vite green). No browser
               repro of a real escaped rejection was run; ADR-0009 perf-claim
               rules don't bite (no perf claim made), but the user-visible
               surfacing was confirmed only through the store assertion path,
               not a running page.

TELLS (Step 1): 0 co-occurrence tells. 4 minimality-terms and 4 named-fix
                cues seen but never adjacent — the scanner found no
                "named-the-better-fix-then-downgraded-it" sentence.

VERDICT: general

WHY: The patch is statable as one invariant that quantifies over both
log-exhaustion vectors, and it closes both rather than handling example
cases. The de-dup latch has a single owner with a single instantiation, so
there is no per-writer gate that a future producer reopens. No better fix was
named and set aside.

FINDINGS BEYOND VERDICT (required):
  - SCOPE BOUNDARY, honestly named, not a hack: this closes the
    `unhandledrejection` surface ONLY. A `window.addEventListener('error')`
    for synchronous async errors outside Vue (e.g. a throw in a raw
    setTimeout callback, a resource-load error) is a SEPARATE escaped-error
    surface that remains console-only. The item commissioned the rejection
    backstop specifically (mirroring the root-error-boundary deferral, which
    named only `unhandledrejection`), so this is in-scope-complete — but a
    reader should not infer "all escaped async errors now surface." Not
    filed: the `window 'error'` backstop is a plausible sibling follow-up but
    was not commissioned and is not filed as a todo item (not-filed: outside
    this commission's scope; would need its own deferral-harvest entry).
  - The de-dup key is the reason's MESSAGE STRING, not identity. Two
    genuinely-different failures that happen to share a message ("Network
    error") collapse to one user-surface entry. This is deliberate (matches
    the enrichment-merge latch's one-label-one-anomaly stance) and the
    console keeps every occurrence, so no information is lost to the
    developer — but it is a real behavioural choice, not a free lunch.
  - `reset()` is exported and wired into the factory but has NO production
    caller — only the test uses it. The latch therefore never clears for the
    life of the page. That is consistent with the "one lifetime = the app's"
    teardown argument (the latch GCs on unload), but it means the
    `maxDistinctSurfaced` cap, once hit, stays hit until reload: a
    long-running session that crosses 8 distinct rejection reasons will show
    no further rejection entries (only the console will). Whether that is the
    right UX or whether `reset()` should be wired to `resetWorkspace`
    (identity flip) is a judgment the maintainer should make; I left it
    unwired because a rejection storm crossing a workspace switch is not
    obviously a fresh slate, and wiring it speculatively would couple a
    Band-1 infra module's latch to a workspace-lifecycle event without a
    demonstrated need. Not filed (not-filed: a UX judgment for the
    maintainer, not a known defect).
  - The "no teardown needed at app root" claim is honest: enumerate_writers
    and the single-instantiation check confirm the listener has exactly one
    lifetime (the document's), there is no owning entity created/destroyed
    mid-session, and the discipline's target failure (a later-arriving
    consumer with a different lifecycle) is structurally absent. The listener
    is deliberately NOT removed so a rejection during the shutdown window
    still surfaces. This is the correct call, not a skipped cleanup — but it
    rests on the listener never being re-registered (a second
    `createRejectionBackstop` + `addEventListener` would stack handlers and
    double-log). Today there is exactly one registration site; a future
    second one is the thing to watch.
```
