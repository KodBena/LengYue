# LytNode recursive-update crash (row 2562) — investigation report, STALL disposition

**Disposition: STALLED, per ADR-0014.** Live reproduction succeeded, reliably and
minimally. Deep instrumentation ruled out every layout/geometry computed and
watcher I could locate as the exploding effect. The specific self-mutating
line was not isolated within the effort this session could responsibly spend.
No fix is shipped. This report is the honest record ADR-0000 Rule 2(a)/(b)
calls for when the reflex stalls — the disposition itself, not a patch.

## Base

Started on the commissioned base `90b67af3c69aca222b4a6d3da518e130dc79cc5f`
(confirmed via `git rev-parse HEAD` before any work). Mid-session the
orchestrator merged the reviewed statusbar/cards delivery into `next`
(`fa12e353`); I merged that into my worktree (clean fast-forward, no
conflicts) and re-verified the crash on the new tip before finalizing this
report. All witnesses below are re-confirmed on `fa12e353` unless marked
otherwise.

## Live-repro environment (recipe for the next session)

- Isolated backend: fresh SQLite at a scratch path, run via
  `/home/bork/scratchpad/venv/bin/python backend/main.py` with
  `DATABASE_URI=sqlite+aiosqlite:///<scratch>/isolated.db`,
  `HOST=127.0.0.1 PORT=19764`, `SECRET_KEY_FILE=<scratch>/.jwt_secret`.
  (`python3 backend/main.py` directly fails — no `sqlalchemy` in the bare
  interpreter; the existing venv at `/home/bork/scratchpad/venv` has the
  full backend dependency set already installed.)
- Frontend dev server: `cd frontend && npx vite --port 19173 --strictPort
  --host 0.0.0.0` — must be run with `frontend/` as the actual process cwd
  (a `vite --port ... ` invoked from the repo root serves the WRONG root
  and 404s on `/`, since Vite's root defaults to cwd, not to the config
  file's directory).
- `frontend/.env.local`: `VITE_API_BASE_URL=http://127.0.0.1:19764`.
- `frontend/scratch-shot.mjs` recovered from the banked commit `b289ec32`
  (`git show b289ec32:frontend/scratch-shot.mjs > frontend/scratch-shot.mjs`)
  and extended in this session with a few new action types (`clickAt`,
  `dismissWizard`) and CDP-based diagnostics (`Debugger`/`Runtime` domain
  hooks) used during the investigation. Left in the worktree, uncommitted
  to `src/`, per its own scratch-tool status — not part of the shipped
  deliverable, but worth keeping for whoever resumes this.
- A fresh test user per repro run avoids contaminating the isolated
  backend's one SQLite file across runs (the backend has no per-worktree
  reset otherwise).

## Exact repro recipe (new, minimal — supersedes "Library tab + reload")

**Booting the app with `store.session.ui.activeTab === 'settings'` already
persisted crashes it, reliably, regardless of every other field's value.**

Concretely: `PUT /documents/user_workspace_01` a document whose
`session.ui` is otherwise byte-for-byte the schema default (`defaults.ts`'s
`defaultSessionUI`, which itself defaults `activeTab: 'cards'`) except
`activeTab: 'settings'`, with `profile` left as its own default shape and
exactly one board present (a fresh 3-move game or a pristine root-only
board — board content does not matter, see "Ruled out" below). Then load
the app fresh (a plain `page.goto`, no further interaction needed). The
crash fires within the first second of boot, before any user interaction.

This reproduced identically:
- On the original base (`90b67af3`).
- On the merged tip (`fa12e353`) after merging the statusbar/cards
  delivery — confirmed fresh, not a residual/replayed page state.
- Across three separately-registered backend users (`local_user`,
  `settings_repro_2`) and a from-scratch SQLite file, ruling out
  contamination specific to one account.

**This directly matches the orchestrator's mid-session hint** ("the crash
fires on persisted/contaminated user state... the cycle involves state
hydrated from persistence") and the closeout doc's second repro path
("activeTab=cards + prior mint/browse history") — my finding narrows it: the
*specific* persisted fact that matters is `activeTab` naming a **control-
panel tab that is not the default** (confirmed: `'settings'` crashes;
`'cards'`, `'library'`, `'analysis'` do **not** crash under an otherwise
identical fixture). I did not get a chance to test `'other'` before time
ran out; I'd bet with moderate confidence it doesn't crash either, since
`'analysis'` didn't — the discriminator appears to be **Settings**
specifically, not "any non-default control-panel tab."

**Refuted claim, disclosed:** the closeout doc's *primary* repro ("navigate
to LIBRARY, reload") does **not** reproduce on this base or the merged tip
in my hands — screenshot `lytnode-library-reload-no-crash.png` shows a
clean render after Library-tab-then-reload, several independent attempts,
with and without prior moves/mint activity. I cannot rule out that it
reproduced for the other builders on a different commit (their worktrees
still carried the divider-mechanics arc, later reverted) or under a
condition I didn't hit. Naming this now rather than silently dropping it.

**Live-witness screenshots** (committed alongside this report):
- `lytnode-recursion-crash-settings-boot.png` — the RootErrorBoundary
  fallback (`.reb-overlay`), boot with `activeTab='settings'`, base
  `90b67af3`.
- `lytnode-recursion-crash-postmerge-fa12e353.png` — same crash,
  re-confirmed on the merged tip `fa12e353`.
- `lytnode-library-reload-no-crash.png` — the refuted Library-tab-reload
  path, clean render, for contrast.

**Console evidence** (every repro, verbatim):
```
[RootErrorBoundary] Caught error: Maximum recursive updates exceeded in
component <LytNode>. This means you have a reactive effect that is
mutating its own dependencies and thus recursively triggering itself.
Possible sources include component template, render function, updated
hook or watcher source function. watcher callback

[unhandledrejection] Unhandled promise rejection: Maximum recursive
updates exceeded in component <LytNode>. ...
```

## The two questions (ADR-0000 Rule 2), honestly answered

**(a) What type would make this defect class unrepresentable?** I cannot
answer this honestly yet, because I could not identify *which* reactive
effect is looping — see "What I ruled out" below. Naming a type without
knowing the mechanism would be exactly the "guessed patch" ADR-0000
forbids. My best partial answer: **whatever the exploding effect turns out
to be, it is reading a value derived from `activeTab` (or from something
`activeTab='settings'` uniquely causes to mount) and writing a value that
feeds back into that same effect's own dependency set** — a Vue
`ReactiveEffect` self-triggering past its 100-iteration recursion cap
(`checkRecursiveUpdates`, `@vue/runtime-core`). The type that would
foreclose this whole *class* (not just this instance) is a **structural
constraint that a mount-time reactive computation cannot read a value it
also writes**, but Vue's own reactivity system has no such static
enforcement — this would need either an architectural convention (a
lint rule flagging `computed`/`watch` bodies that read-then-write the
same store path) or a runtime invariant test. I don't have enough
information to specify it more precisely than that without guessing.

**(b) What operational lapse let this recur?** Two candidates, both
plausible and not mutually exclusive: (1) no test in this codebase drives
a *full App.vue boot with a non-default persisted `activeTab`* — every
existing App-boot test (`App-boot.test.ts`) either uses the schema
default or explicitly stubs geometry for the landscape/portrait split,
never for a specific control-panel tab; (2) per `frontend/CLAUDE.md`'s
own "Vue/CSS footgun checklist," this project has *already* paid once for
"ResizeObserver box-size delivery ... not reproducible in jsdom" — this
defect may be the same class recurring in a new spot (see the jsdom
finding below), which would mean the executive lapse is: the mechanized
net for that specific footgun class is a *prose checklist entry*, not a
gate, so a new instance of the same shape isn't caught until a live
witness finds it. I'm naming this as the most likely (b)-answer, but I
want to flag it as a hypothesis, not a proven root cause, given (a) is
unresolved.

**Closure statement:** I cannot honestly produce one — the invariant, the
quantification universe, and the denomination check all presuppose
knowing which effect loops and over which axis. Filing this stall
explicitly, per the escape hatch (ADR-0014), rather than writing a
closure statement that would be dressed-up guessing.

## What I ruled out, with direct evidence (this is the bulk of the session's real work)

Live, in-browser instrumentation (temporary `console.log` calls, reverted
before finalizing — never committed) at every site I could construct a
plausible self-reference hypothesis for:

1. **`LytNode.vue`'s own render/template.** Bound a plain (uncached)
   counter function directly in the root `<div>`'s template
   (`:data-dbg-tick="__dbgRenderTick()"`), which increments and logs on
   *every actual render-function execution*, bypassing computed
   memoization. Across all ~6 concurrently-mounted `<LytNode>` instances
   (root, side-column split, board-row split, tree/controlPanel split,
   the settings-tab inner split), each logged **exactly one tick** before
   the crash. `onRenderTriggered`/`onUpdated` hooks corroborated this — a
   handful of trigger events total, never approaching 100. LytNode's own
   render effect is not the one whose scheduler job hits the recursion
   cap, *or* Vue 3.4's `ReactiveEffect.runIfDirty` lazy-dirty-check means
   a job can be re-queued and counted by `checkRecursiveUpdates` without
   the render function itself re-executing each time — I could not
   distinguish these two possibilities with the tooling available (see
   "Tooling notes" below). This is the largest remaining uncertainty in
   my own instrumentation's reliability, disclosed rather than glossed
   over.
2. **`resolveSideColumnLiveLayout`** (`state/feasible-layout.ts`) — the
   "two-pass presence fixpoint" the task brief itself flagged as a
   suspect. Logged every call's full input (`wrapperWidthPx`,
   `treeMaxUsefulPx`, `treeSovereignPx`, `others`) — it evaluates **3
   times total**, converging cleanly (`treeMaxUsefulPx: null → null →
   77`, `treePx`/`controlPanelPx` settling at `77px`/`264px` and staying
   there). Not looping.
3. **`rootSplitLayout`** (App.vue computed) — evaluates **2 times**,
   both against `rowWidthPx=0, rowHeightPx=0` (never actually measured —
   see point 5). Not looping.
4. **`useContentDemand`'s `measure()`** (TreeWidget's content-demand
   ResizeObserver callback) — **never fires** in this repro path (no log
   at all, at any count).
5. **`useResizablePanel.ts`'s `measureRowDims`/`measureWrapperWidth`/
   `attachRowObserver`/`attachWrapperObserver`.** `attachRowObserver`'s
   *own* unconditional entry log fired exactly **once**, finding
   `document.getElementById('split-workspace')` **null** — the
   documented "cold-load gate" case. `measureRowDims`/
   `measureWrapperWidth` never logged at all (never actually run) — so
   `rowWidthPx`/`sideColumnWidthPx` stay at their `0` default for the
   entire crash window. **The crash does not depend on any real DOM
   measurement ever landing.**
6. **`TabWidget.vue`** — read in full; genuinely stateless (no
   `watch`/`computed`), matching its own docstring.
7. **`useSettingsSubTab.ts`** — a plain module-scope `ref`, no watcher.
8. **Every `watch()` call in `App.vue`** (I enumerated all of them:
   `mintDialogRequestCount`, `workspaceLoadState.kind` ×2,
   `activeScreenClassId`, `outerRowSovereignDiagnostic`,
   `rootSplitLayout.sovereignClampedFromPx`, `activeTab`,
   `passRequestCount`) and in `useSideColumnLiveLayout.ts` /
   `state/layout-model.ts`'s `useDeferredLayoutClass` — all created while
   `App.vue` is the active component instance (verified against
   `@vue/runtime-core`'s own source: a watcher's scheduler-job owner
   (`job.i`) is `getCurrentInstance()` at the *point `watch()` is called*,
   which for every composable invoked from `App.vue`'s own `<script
   setup>` is `App.vue`, never `LytNode`). Since Vue's crash message
   explicitly names `<LytNode>`, none of these — however suspicious a few
   looked on paper (the `activeScreenClassId` → `reattachObservers`
   watcher, in particular) — can be the attributed job, by construction.
9. A live CDP `Debugger.setPauseOnExceptions('all')` + async-stack-trace
   capture (`Debugger.setAsyncCallStackDepth`) consistently shows the
   crash's enclosing promise chain as `hydrate() → store.updateFromRemote
   () → (a reactive write) → useResizablePanel.ts`'s post-hydrate
   `nextTick` re-attach callback — but per finding 5, that callback's own
   body never executes past its first line. My best reading: this
   nextTick callback is riding the **same promise chain** as whatever
   *actually* explodes (both were scheduled by the same `hydrate()`
   write), and a rejected promise's `.then(onFulfilled)` skips
   `onFulfilled` entirely — so the async trace shows "who else was
   waiting on this same flush," not "who is exploding." This resolved my
   earlier confusion (I initially over-read this trace as directly
   implicating `useResizablePanel`) but left me without a name for the
   real culprit.
10. Confirmed, empirically, that the crash is **not** an artifact of
    Vite's dependency-cache serving stale bytecode: deleted
    `frontend/node_modules/.vite/deps/` entirely, restarted the dev
    server (fresh content hash), and the crash still reproduced
    identically.

**Not reached, disclosed as a deferred lead:** the six Settings
sub-tab components that mount simultaneously (`keep-mounted`) whenever
the Settings control-panel tab is active — `RegistryEditor` (×2, session
+ profile roots), `CardSetEditor` (CodeMirror), `PaletteEditor`
(CodeMirror), `AnalysisTabsEditor`, `KeybindingsView`. I read
`KeybindingsView.vue` and `TabWidget.vue` in full (both clean) but did
**not** get to fully instrument `CardSetEditor.vue`/`PaletteEditor.vue`'s
own reactive wiring or `vue-codemirror`'s internals before time ran out.
Given Settings is architecturally distinguished from every non-crashing
tab (`analysis`, `cards`, `library`) by mounting these six components at
once — two of them wrapping a genuinely complex third-party editor
library — this is the most promising unexplored surface for whoever
resumes.

## jsdom cannot reproduce this (disclosed limitation, not a negative finding)

Per this session's mandate, I wrote a component-level regression test
(`tests/integration/lytnode-settings-boot-repro.test.ts`, mounting the
full `App.vue` — the same shape `App-boot.test.ts` already establishes —
driven through the *real* `SyncService.hydrate() → store.updateFromRemote
()` path via a stubbed `fetch` router, exactly mirroring the live
browser's own causal chain, with a `session.ui.activeTab: 'settings'`
fixture document and a realistic board fixture). **It passed — the crash
did not reproduce.**

This is consistent with (and does not contradict) the live-browser
finding: `frontend/CLAUDE.md`'s own "Vue/CSS footgun checklist" already
names, from a prior investigation, "ResizeObserver box-size delivery ...
not reproducible in jsdom, which never runs real ResizeObserver box-size
delivery at all" (`useResizablePanel.ts`'s own header, "Dispatch row
2504's A2b finding"). Given point 5 above shows the crash doesn't even
need a *measurement* to land, the jsdom gap here is more likely something
else jsdom fakes or no-ops silently — a real `<textarea>`/CodeMirror
DOM-manipulation difference, real CSS Grid/flex layout affecting a
`<details>` disclosure's natural height, or genuine `ResizeObserver`
delivery timing (even absent a real resize) — rather than the specific
gap the prior lesson named. I deleted the test rather than keep a green
test that cannot exercise the actual defect: a passing test that gives
false assurance is worse than no test, per this project's own
discipline. If a future session identifies the real mechanism and it
*is* jsdom-visible once instrumented correctly, this harness (the
fetch-router + full-App-mount shape, already proven for other App-boot
suites) is the right vehicle to re-attempt the pinning test in.

## Fence compliance

- `StatusBar.vue` and status-bar-related code: untouched.
- Divider-mechanics: untouched, not re-landed.
- `proxy/`: untouched.
- All temporary debug instrumentation (in `LytNode.vue`,
  `useResizablePanel.ts`, `useContentDemand.ts`, `feasible-layout.ts`,
  `App.vue`, and one throwaway edit to the *generated* Vite dep cache
  file, never part of the source tree) was reverted via `git checkout --`
  before finalizing; `git diff` against `fa12e353` is empty for every
  source file. The only artifacts this session leaves behind are this
  report, its two screenshots, and `frontend/scratch-shot.mjs` (a scratch
  tool, not `src/`, explicitly named in the task brief as recoverable).

## Gates (run synchronously, output read, on the clean — no source diff — tree)

- `npx vue-tsc -b --noEmit` — clean, exit 0, no output.
- `npx vitest run` — **3579 passed, 8 skipped, 0 failed** (293 files
  passed, 3 skipped), exit 0.
- `npm run build` (`vue-tsc -b && vite build`) — succeeds, exit 0 (one
  benign "chunk larger than 500kB" advisory, pre-existing, unrelated).

These gates pass trivially because this session ships no source change —
they're run to confirm the tree is left exactly as clean as it was
handed over, not as evidence toward a fix.

## What was honestly NOT done

- **The fix itself.** Per ADR-0000 Rule 2 and the task's own explicit
  instruction, no patch is shipped without first identifying the
  foreclosed class. I did not reach that point.
- **A component/composable-level regression test that actually pins the
  crash.** Attempted (see above); jsdom would not reproduce it, and I
  judged a green-but-untestable test worse than none. Deleted.
- **The `'other'` control-panel tab** as a third data point (only
  `'settings'` confirmed crashing; `'cards'`/`'library'`/`'analysis'`
  confirmed clean).
- **`CardSetEditor.vue`/`PaletteEditor.vue`/`vue-codemirror`
  instrumentation** — the most promising unexplored lead, named above,
  not reached before time ran out.
- **A live "crash-absent, same repro path, post-fix" witness** — there is
  no fix, so there is nothing to witness as fixed. Only "crash-present"
  witnesses exist (two, pre- and post-merge).

## Recommendation

Per ADR-0014, this should go to a second pair of eyes — ideally with
either (a) real browser-based step-through debugging (attach an actual
Chrome DevTools session with the Vue devtools extension, not just raw
CDP, to get proper watcher/effect naming that this session's tooling
couldn't cleanly extract) or (b) instrumentation focused specifically on
`CardSetEditor.vue`/`PaletteEditor.vue`/the CodeMirror integration, the
one architecturally-distinguishing, unexamined surface between the
crashing and non-crashing control-panel tabs.
