# Settle-aware `useLytFitAssertion` (row 2591) — build report

## Base

Started per dispatch on local `next` at `baaff377` (`fix(frontend): unify
tree panel's drag floor with its render floor`, row 2578). Confirmed via
`git log --oneline -1 next` at dispatch time and re-confirmed
immediately before final gates — unchanged throughout the session, so no
merge/absorb was needed. Claimed the work item: `./autoharn led work
claim settingssubstrip-overflow` from the main repo root returned "row
2593 written" (a prior claim by a finished builder existed per the
brief's own warning; proceeded per the commissioner's ruling, row 2591,
that the item is this session's by dispatch).

Read end to end before starting, per ADR-0002/`frontend/CLAUDE.md`: the
repo-root `CLAUDE.md`, `frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`,
`.claude/dispatch-reports/settingssubstrip-overflow-build.md` (the
salvaged diagnosis — its 145px-reservation fix is what this item's
ruling overrides; its measured-facts table is what this fix is built
on), and `.claude/dispatch-reports/lytnode-recursion-fix2-build.md` (how
the fit assertion's read/write pattern feeds `system-message-sink.ts`,
and why the crash it diagnoses is a distinct, already-closed class from
this one).

## The mechanism (recap, for context — not this item's territory)

`useLytFitAssertion.ts` re-checks a Fit-disciplined leaf's cell on every
`ResizeObserver` callback (plus once synchronously at `.observe()`
registration). The `settingsSubstrip` leaf's surrounding `<LytNode>`
split settles its CSS-grid tracks through two deterministic transient
widths (230px, then 280px) before reaching the real settled width
(663px at 1920×1080, 355px at 1280×900) on every boot into Settings; at
both transient widths the strip's natural content height (135px/101px)
genuinely exceeded the 77px reservation, and the naive "check on every
callback" shape reported both as "Layout defect" toasts even though the
settled state (33px demand vs. 77px reserved) never overflows. The
prior session's own 145px-reservation fix cleared the symptom by
spending real settled space it didn't need to spend (documented, in its
own report, as a real tradeoff) — this item's ruling (row 2591) is to
fix the assertion's *timing* instead, leaving the reservation at 77px.

## The fix

`useLytFitAssertion.ts`'s `observe()` and its `ResizeObserver` callback
no longer call `checkFit` (renamed `reportIfOverflowing`) synchronously.
Instead, every arming event (mount-time registration or a later
`ResizeObserver` delivery) calls `scheduleSettleCheck(region)`, which:

- Cancels any settle-debounce chain already pending for that region
  (`cancelPendingSettle`).
- Arms a fresh `SETTLE_QUIET_FRAMES` (= 2) `requestAnimationFrame`
  chain. If no further arming event supersedes it before the chain
  elapses, the chain re-measures the region's CURRENTLY tracked element
  (not a captured snapshot — `tracked.get(region)` reads the live
  registration) and reports iff it is STILL overflowing at that point.
- A later arming event cancels the in-flight chain and starts a fresh
  one — so a burst of transient deliveries (the settingsSubstrip
  230px→280px→settled sequence, or any longer burst) keeps resetting the
  clock and never reaches the report step until deliveries genuinely
  stop for two consecutive quiet frames.

**Settle definition chosen, and why.** The brief named three candidates
already present in this codebase's own idiom:
`useDeferredContainerBreakpoint.ts`'s "defer commit until an existing
settling SIGNAL (`isAnyPanelResizing`) goes quiet", `useElementWidth.ts`'s
rAF-chain settle-remeasure burst (used when no such signal exists), and
"N consecutive stable deliveries." No signal analogous to
`isAnyPanelResizing` exists for "this `<LytNode>` split's own grid
tracks are still settling" — that mechanism is explicitly out of this
item's fence (LytNode.vue/CSS-grid territory), so gating on it isn't
available. "N consecutive STABLE deliveries" doesn't fit either: the
settingsSubstrip sequence delivers three DIFFERENT widths (230, 280,
settled) before stopping, so "stability" only ever holds at the very
last delivery — the actual invariant to gate on is deliveries **stopping**,
not deliveries **agreeing**. That leaves debounce-on-quiescence, the
same shape `useElementWidth.ts`'s rAF chain already uses (a short
`requestAnimationFrame` chain, guarded by `typeof requestAnimationFrame
=== 'undefined'` the same way this module's existing `ResizeObserver`
guard already handles a `rAF`-less environment), applied here as a
debounce rather than a fixed burst since the arming event itself
(not a timer from mount) is what needs to quiesce.

**Frame count (2).** `ResizeObserver` deliveries are spec-batched to at
most one per animation frame, so each of the settingsSubstrip
investigation's own measured transient passes is a single delivery,
naturally already frame-aligned; two consecutive quiet frames comfortably
supersedes each transient delivery with the next one's re-arm before the
first's chain could ever complete, while staying well under a
human-perceptible delay for a genuine violation. Not a design-point
literal cited elsewhere (unlike `useElementWidth.ts`'s
`SETTLE_REMEASURE_FRAMES`, which spans a whole burst rather than gating
on quiescence), so the file only documents the reasoning inline, no
external doc reference.

**Honesty preserved.** The debounce delays *when* the check runs; it
never widens, narrows, or otherwise touches *what* it measures. A
transient violation that resolves before the quiet window elapses is
never reported (self-healing within the settle window is not a
defect — the whole point of this fix). A genuine settled violation is
detected and reported exactly as before, with the same real measured
deficit, merely a couple of frames later. Pinned by the honesty witness
below (a contrived, throwaway reservation shrink) and by the unit
tests' "reports a settled overflow that persists" case.

## ADR-0000 closure statement

**Class:** "fit asserted against pre-settlement geometry." **Foreclosed
for:** every Fit-disciplined leaf registered through
`useLytFitAssertion.observe()` — the fix is at the composable's own
`observe()`/`ResizeObserver`-callback entry points, not at any one
leaf's call site or at `LytNode.vue`'s wiring, so it is quantified over
the whole registration surface, not just `settingsSubstrip`. **Not
covered, named explicitly:** the `<LytNode>` split's own CSS-grid-track
settling mechanism (why a column measures 230px then 280px before
reaching its final width) is unchanged and unexplained further here —
explicitly fenced out of this item, per the settingssubstrip-overflow
report's own disclosure and this dispatch's own fence (no `.lyt`/
`.gen.ts`/`ratified-literals.json` edits; that territory is row 2592's).
The reservation itself (77px) is untouched, per the same fence — this
fix's territory is strictly the assertion's timing, not the leaf's
demand/reservation arithmetic.

## Tests

`frontend/tests/unit/composables/chrome/useLytFitAssertion.test.ts` —
extended the existing suite's own idiom (a `FakeResizeObserver`) with a
parallel `FakeRaf` (a controllable `requestAnimationFrame`/
`cancelAnimationFrame` queue, flushed one frame at a time — the same
"fake the observer, drive it deterministically" idiom the file already
used for `ResizeObserver`). Every existing case was updated to flush the
settle window (`settleFrames()`, two `flushFrame()` calls) before
asserting a push, since a push is no longer synchronous. New
`describe('settle debounce (row 2591, ADR-0000 closure)')` block:

- Does not report a transient overflow (230px/280px-shaped: content
  135px/101px against a 77px cell) that resolves to a settled fit (33px)
  before the settle window elapses.
- Reports a settled overflow (101px content against a 77px cell,
  persisting) once the debounce settles, with the real 24px deficit in
  the message text — matching the live toast's own historical wording.
- A later delivery cancels and re-arms the pending debounce rather than
  stacking two reports (fires exactly once).
- Unregistering a region while its settle check is pending reports
  nothing.
- Re-registering the same region with a new element checks only the new
  one (a stale pending chain against the old element never fires).
- A burst of 5 rapid, still-genuinely-overflowing re-arming deliveries
  produces exactly one report, not one per delivery.
- `stop()` cancels a pending settle check so it never fires after
  teardown.

`frontend/tests/integration/LytNode-fit-assertion.test.ts` — same
`FakeRaf` idiom added (jsdom in this vitest environment ships a REAL,
timer-driven `requestAnimationFrame`, confirmed live via a throwaway
scratch test — `typeof requestAnimationFrame` is `'function'` before any
override — so leaving it unfaked would have left the settle-debounced
push on real, non-deterministically-flushable timing); every existing
assertion that expects a push now calls `settleFrames()` first. No new
cases added here — the composable's own settle logic is already pinned
at the unit tier; this file's job is proving the wiring, which is
unchanged in shape (only in timing).

## Gates

- `nice -n 19 npx vue-tsc -b --noEmit` — clean, exit 0, no output. Run
  twice (once mid-session, once against the final tree); clean both
  times.
- **Targeted `nice -n 19 npx vitest run`**, synchronous, foreground,
  output read: the fit-assertion unit + integration suites, the sink
  test, and every suite named in the brief plausibly reachable from this
  import graph — `useLytFitAssertion` (unit), `LytNode-fit-assertion`
  (integration), `TabWidget-keydown-propagation`,
  `LytNode-exclusive-overflow`, `LytNode-dom-id-wiring`,
  `settings-live-opening`, `LytNode-presence-toggle`,
  `TabWidget-overflow`, `LytNode-exclusive-rendering`,
  `settings-substrip-reservation`, `system-message-sink`,
  `lyt-activity-invariance`, `useLytTrackCss`, `lyt-tree-orientation`,
  `lyt-path-key-regression`, `feasible-layout-purity`,
  `feasible-layout`, `feasible-layout-geometry-sweep` — **17 files, 263
  tests, all passed**, exit 0. Re-run once more against the final tree
  (after the honesty-witness throwaway edit was reverted) with the same
  result.
- `nice -n 19 npm run build` (`vue-tsc -b && vite build`) — succeeds,
  exit 0, against the final tree. Same pre-existing "chunk larger than
  500kB" advisory prior reports also saw, unrelated.
- No full untargeted `npx vitest run` was run, per the standing
  targeted-gates directive (durable rows 2570/2590) for this class of
  change.

## Live witnesses

Environment: isolated SQLite backend
(`DATABASE_URI=sqlite+aiosqlite:///<scratch>/isolated.db HOST=127.0.0.1
PORT=19791 SECRET_KEY_FILE=<scratch>/.jwt_secret nice -n 19
/home/bork/scratchpad/venv/bin/python backend/main.py`), frontend `cd
frontend && nice -n 19 npx vite --port 19191 --strictPort --host
0.0.0.0` with `frontend/.env.local` pointing `VITE_API_BASE_URL` at the
isolated backend (ports 19180/19781 from the recipe doc were already in
use by a concurrent session; picked free ones). `frontend/node_modules`
symlinked to the shared tree (disk-tight constraint), never `npm
install`.

`frontend/scratch-shot.mjs` recovered from the banked commit `b289ec32`
(same recipe prior sessions used) and extended with `fill`/`clickText`
action types (not load-bearing for this session's own witness, added for
future reuse per the existing convention of extending this file in
place). `frontend/scratch-witness.mjs` (new, throwaway, uncommitted) is
a dedicated one-off driver: registers/logs in a fresh user against the
isolated backend directly (bypassing the UI login form), seeds
`session.ui.activeTab: 'settings'` via a direct document `GET`+`PUT`
(fetches the app's own already-created document after first boot,
mutates the one field, PUTs it back — same recipe the prior report used
and flagged: a raw store-field write bypasses `sync-service.ts`'s
`sessionVersion`-gated watcher, so the seed goes through the real
persistence API instead), reloads, dismisses the onboarding wizard,
clicks through all six sub-tabs, and reads `window.store.engine.messages`
for any "Layout defect" entry. Both scratch files left uncommitted in
the worktree, per the existing scratch-tool convention.

- **1920×1080, boot into Settings, post-fix**: `SUBTABS_REACHABLE:
  {"Session (UI)":true,"Analysis Environment":true,"Card Sets
  (Decks)":true,"Advanced Registry":true,"Analysis Layout":true,
  "Keybindings":true}`; `MESSAGES` contains only the pre-existing "Sync:
  workspace loaded" info message; `LAYOUT_DEFECTS: []`. No toast, all
  six sub-tabs clicked through successfully.
- **1280×900, boot into Settings, post-fix**: same — all six sub-tabs
  reachable (two-row wrap, confirmed visually in the screenshot), no
  "Layout defect" entries.
- **Honesty witness (contrived settled overflow)**: temporarily edited
  `frontend/src/state/lyt-layout.gen.ts`'s `settingsSubstrip` track from
  `{ kind: "fixed", px: 77 }` to `px: 20` (a throwaway, single-line edit,
  commented `// THROWAWAY: honesty-witness contrived shortfall (row 2591
  build), reverted before delivery`), restarted the dev server, and
  re-ran the same 1920×1080 boot-into-Settings witness:
  `LAYOUT_DEFECTS` now contains exactly one entry — `Layout defect:
  "settingsSubstrip" is declared Fit (no scroll) but its content
  overflows its own cell — 13px too short (height)` (33px real demand
  minus the contrived 20px reservation) — confirming the settle-aware
  assertion still fires, exactly once, for a GENUINE settled violation,
  with the real measured deficit. All six sub-tabs were still reachable
  in this run too. Reverted immediately after
  (`diff src/state/lyt-layout.gen.ts <backed-up original>` confirmed
  empty before restarting the dev server clean and re-witnessing the
  no-toast state one final time).
- `git log --oneline -1 next` re-checked immediately before final gates:
  still `baaff377` — unchanged throughout the session, no merge/absorb
  needed.
- Final `git status --short` (frontend + repo root): exactly
  `frontend/src/composables/chrome/useLytFitAssertion.ts`,
  `frontend/tests/integration/LytNode-fit-assertion.test.ts`,
  `frontend/tests/unit/composables/chrome/useLytFitAssertion.test.ts`
  modified, plus the two uncommitted scratch driver files
  (`frontend/scratch-shot.mjs`, `frontend/scratch-witness.mjs`).

## Fences

- `.lyt` encodings, `ratified-literals.json`, `.gen.ts` files: **not
  touched** in the delivered diff (the honesty witness's throwaway edit
  to `lyt-layout.gen.ts` was reverted before any gate or commit; `git
  diff` on that file is empty in the final state). That territory
  (row 2592) is untouched by this item, per the brief.
- `system-message-sink.ts` / any store push internals: **not touched** —
  `useLytFitAssertion` still calls `pushSystemMessage` exactly as before,
  only later and conditionally on the debounced re-measurement.
- Divider mechanics, `StatusBar.vue`, `proxy/`: **not touched**.
- `next` did not move during the session (re-checked immediately before
  final gates) — no merge/absorb was needed.

## What was honestly NOT done

- **The `<LytNode>` split's own CSS-grid-track settling mechanism**
  (why a column genuinely measures 230px then 280px before its final
  width) is unchanged and unexplained further — explicitly fenced out
  per this item's own scope and the prior session's disclosure. This
  fix makes the *assertion* settle-aware; it does not make the *layout*
  itself settle faster or explain why it settles in passes.
- **The `settingsSubstrip` reservation** stays at 77px, per the
  commissioner's ruling (row 2591) that supersedes the prior session's
  145px fix — not re-litigated here.
- **A dedicated component-level (mounted, real-timer) regression test**
  for the settle debounce was not attempted beyond the existing
  integration file's own `FakeRaf`-driven cases — the composable-level
  unit tests (fake `ResizeObserver` + fake `requestAnimationFrame`,
  driven deterministically) are the ones that actually pin the settle
  mechanism per-frame; a real-timer test would be flaky by construction
  and add no coverage the fakes don't already give.
- **`useElementWidth.ts` and `useDeferredContainerBreakpoint.ts`
  themselves** are unchanged — read for idiom, not modified; this fix
  introduces its own (third, but structurally matching) debounce
  instance in `useLytFitAssertion.ts` rather than factoring a shared
  "settle debounce" helper out of the three, since the shapes differ
  enough (a signal-gated commit vs. a fixed-burst remeasure vs. a
  quiescence debounce) that a premature shared abstraction seemed more
  likely to obscure than clarify; flagging this as a judgment call in
  case a reviewer reads it differently.
