# Resizer rearchitecture — fresh-context review

Reviewer: dispatched fresh-context review agent (REFUTE posture), independent
of the builder. Branch `worktree-agent-aea2fabfe830f1b89`
(worktree `/home/bork/w/omega/.claude/worktrees/agent-aea2fabfe830f1b89`),
head `94eab0f1`, against `next` head `50f9ee6c`. Merge-base:
`3378806f28bca3bdd9f57601826d0ee64f7af97d` (`git merge-base next
worktree-agent-aea2fabfe830f1b89`) — confirms the coordinator's flag that the
worktree base is stale: it predates 51 `next` commits, including two
independent arcs that collide with this branch's own changes (below).

Every claim below is **WITNESSED** (with the observation), **REFUSED-AS-
EXPECTED**, or **UNEXERCISED** (with the concrete blocker). The builder's own
report (`.claude/dispatch-reports/resizer-rearchitecture-build.md`, in the
worktree) was read **last**, after forming an independent view from the code,
the law, and the diagnostic.

---

## VERDICT: ACCEPT-WITH-FINDING — architecturally sound, but not mergeable as-is

The nested-splitter architecture and the geometric fix are **structurally
correct and well-evidenced**: I re-derived the sign/cancellation argument
independently from the CSS and reproduced the build/lint/test gates myself.
But the **trial merge into current `next` surfaces a real, undisclosed
persistence regression** (§2) that the builder's own tests cannot catch
because they were authored against the stale base, plus a substantial (but
mechanically resolvable) merge-conflict surface (§1) and one law violation
(§4). None of these were in the builder's disclosed-gaps list. **Do not merge
until §1–§2 are fixed**; §3–§5 are lower-severity nits.

---

## 1. Merge composition — WITNESSED, real conflicts, mechanically resolved

Trial merge performed at `/tmp/omega-trial-merge` (`git worktree add -B
trial-merge-next-scratch /tmp/omega-trial-merge next`, then `git merge
--no-commit --no-ff worktree-agent-aea2fabfe830f1b89`; **not** pushed, **not**
touching the real `next`). Result: **8 files conflicted** (`git merge
--no-commit` output), not just the migration number the coordinator
pre-flagged:

| File | Conflict shape |
|---|---|
| `frontend/src/store/migrations.ts` | Genuine version collision: both sides independently claimed `61 → 62` (branch: resizer-field strip; `next`: `analysisRange → analysisRanges` reshape, unrelated). `next`'s `CURRENT_SCHEMA_VERSION` is **already 63** (a further `62→63` `highContrastText` backfill shipped after the collision). |
| `frontend/src/store/archived-migrations.ts` | Rolling-archive-discipline conflict: both sides archived through different points. |
| `frontend/src/App.vue` | **5 hunks, largest 215 lines.** `next` independently shipped (a) an ADR-0019-audit cold-load gate (`<template v-if="workspaceLoadState.kind==='loaded'">` wrapping the whole workspace, with `v-else-if` loading/error siblings) and (b) a `toggleChrome()` / `activeTab` computed-writable refactor (both call `touchSession()` explicitly — see §2) that this branch's diff has no knowledge of. The conflict hunks are **not** a clean "old vs. new" split in one spot: git's context-matching mis-aligned one hunk (the `.right-toggles` toolbar block appears to be reintroduced/duplicated inside the resizer region) purely because `next` **moved** that block up into the new gated `top-nav-bar` — resolving it correctly requires recognizing the move, not just picking a side. |
| `frontend/src/components/tree/ForestDirectory.vue` | Trivial: adjacent import lines (`touchSession` on `next`'s side, `useDeferredContainerBreakpoint` on the branch's side) — both needed. |
| `frontend/src/composables/chrome/useResizablePanel.ts` | Full-file rewrite on the branch; `next`'s side is the ui-fix-56 baseline this branch superseded — verified byte-identical to `next`'s actual shipped `1e246e6d`/`6ebf81f2` (the branch's own `027851f2` "bring in ui-fix-56 as baseline" commit is a verbatim cherry-pick — `git diff 1e246e6d 027851f2` is empty), so taking the branch's file wholesale is correct. |
| `frontend/tests/unit/composables/chrome/useResizablePanel.test.ts` | add/add — both sides created a same-named file; branch's is the correct successor. |
| `frontend/tests/unit/store/migrations.test.ts` | The `61→62` test blocks for both migrations collide the same way the migration bodies do. |
| `frontend/FILES.md` | Adjacent-line entry conflict, trivial. |

**I resolved all eight** (renumbering the resizer-strip migration to `63 → 64`,
bumping `CURRENT_SCHEMA_VERSION` to 64, moving `next`'s `61→62`
`analysisRange` migration into the archive per the rolling-archive-of-two
discipline, reconciling the `App.vue` `.right-toggles` move, preserving
`next`'s `toggleChrome()`/`activeTab` computed and the `@update-rules`
StatusBar handler that the branch's stale base doesn't know about) and ran
the full gate suite against the merged tree:

- **`npm run build`** (`vue-tsc -b && vite build`) — **WITNESSED green**: `✓ 1095 modules transformed`, `✓ built in 2.91s`.
- **`npx eslint .`** — **WITNESSED clean**, zero output.
- **`npm run test:run`** — **WITNESSED green**: `Test Files 108 passed | 3 skipped (111)`, `Tests 1367 passed | 4 skipped (1371)`.

So the conflict surface, while real and non-trivial (this is not "just
renumber the migration"), **is mechanically resolvable** and the resolved
tree passes every existing gate — which is exactly why §2's regression matters:
it passes *because nothing in the existing suite exercises it*, not because
it's actually safe.

**Merge-composition requirement for whoever lands this:** do not `git merge`
this branch naively. Use the resolution above as the worked reference (the
resolved tree is sitting in the scratch worktree at `/tmp/omega-trial-merge`,
uncommitted, for inspection — not pushed anywhere) — in particular the
`App.vue` `.right-toggles` move and the `activeTab`/`toggleChrome` seam are
easy to get wrong silently (they'd still compile and pass the existing suite
if resolved wrong, per §2's lesson).

## 2. CRITICAL — the resizer's persisted facts don't survive merge into current `next`'s persistence architecture

**WITNESSED**, and this is the load-bearing finding of this review.

`next` shipped `ec840417`/`f645ca42` ("version-count `store.session` in
SyncService instead of deep-watching it") **after** this branch's base commit.
`SyncService.startWatcher()` no longer deep-watches `store.session` — it
watches a shallow `sessionVersion` counter (`store/index.ts`) that **every**
persistence-relevant `store.session` write must bump explicitly via
`touchSession()`. This is enforced today by a purpose-built regression net,
`tests/integration/sync-session-version.test.ts`, whose own docstring states
the exact risk: *"a session mutation that forgets to bump the counter is a
SILENTLY LOST SAVE."*

`useResizablePanel.ts`'s header (this branch) asserts the opposite of current
reality: *"Every mousemove write is a plain reactive mutation on
`store.session`... `SyncService.startWatcher()` already deep-watches
`store.session`, so both facts persist... No separate touch call needed."*
That was true against the branch's stale base; it is **false** against `next`
today. Neither `onMouseMoveInner` nor `onMouseMoveOuter` calls
`touchSession()` — confirmed by `grep -n "touchSession"
useResizablePanel.ts`, which matches only the (now-incorrect) prose comment,
no call site.

I built a minimal witness against the merged tree (ADR-0021 Rule 1: observe
the claimed property directly, at the site of the claim) rather than trust
the prose:

```ts
it('a direct store.session.ui.treePanelWidthPx write (as onMouseMoveInner performs) does NOT bump sessionVersion', () => {
  const before = sessionVersion.value;
  store.session.ui.treePanelWidthPx = 321;
  expect(sessionVersion.value).toBe(before);
});
```

**Both legs (inner and outer fact) PASS** — i.e., the write is invisible to
`SyncService`'s watcher. Run against the merged tree at `/tmp/omega-trial-merge`,
`npx vitest run` on an ad hoc integration-tier file, then discarded (not
committed; not part of the deliverable).

**Consequence:** merged as-is, dragging either resizer bar would silently
never schedule a save. The rearch's own Anomaly-5 claim ("REFUTED against
this build... both round-trip... identically regardless of value") is true
only against `buildPersistencePayload`/`updateFromRemote` called directly —
which is exactly what `resizer-persistence-roundtrip.test.ts` does (bypasses
`SyncService`'s watcher entirely, never asserts a mutation *schedules* a
save). That test is a **proxy witness** in the ADR-0021 sense: it observes
"does the value round-trip if a save happens," not "does a drag cause a save
to happen" — the actual user-facing claim. `sync-session-version.test.ts`
itself stays green through this merge for the boring reason that it doesn't
yet enumerate the two new write sites — the gap is invisible to CI, not
caught-and-ignored.

Net effect if shipped unfixed: the exact "my layout doesn't stick" user
complaint the whole rearch exists to fix (diagnostic §7, Anomaly 5) **would
reappear**, in a new and more silent form (100% of drags lost, not just the
past-saturation regime), and nothing in the existing test suite would flag
it.

**Required for merge:** add `touchSession()` calls at both `onMouseMoveInner`
and `onMouseMoveOuter` (mirroring `toggleChrome`'s pattern, now present in
`next`'s `App.vue`), and extend `sync-session-version.test.ts`'s enumerated
mutation categories to cover the two new fields — per that test's own stated
purpose, a dropped `touchSession()` at a covered site must turn a case red
there; today it can't, because the site isn't covered.

## 3. Architecture — ACCEPT

Independently re-derived (before reading the build report) from `App.vue`'s
CSS/template and `useResizablePanel.ts`: the nested-flex structure
(`#board-column` / `#resizer-outer` / `#tree-control-wrapper` >
[`#vue-tree-panel`, `#resizer-inner`, `#control-panel`]) genuinely forecloses
the cancellation-at-a-distance class the live diagnostic measured (up to
541px lag) **by construction**, not by tuning: each bar's locally-absorbing
sibling is structurally on the opposite side from the directly-dragged pane,
at both nesting levels. `grep -rn "treePanelWidthPx\s*="` (branch) confirms a
single write channel (`onMouseMoveInner`) — row 414's constraint holds.
`#control-panel` and `#board-column` are both pure-CSS-derived, no JS width
of their own — ADR-0012 P1 (one home per fact) satisfied for both facts.

`dragOriginPx` is read from rendered geometry at `mousedown`, before any
reactive write — the class of defect in diagnostic §4 (measure-then-mutate
in one tick) is structurally absent: I confirmed neither `startResizeInner`
nor `startResizeOuter` writes to the store before its `getBoundingClientRect`
reads. Pointer position (`totalDelta = e.clientX - {tree,region}LastMouseX`,
`*LastMouseX` set once at `mousedown`, never reassigned mid-drag) and layout
position (`store.session.ui.*WidthPx`) are kept as genuinely distinct facts,
combined only through the pure `computePaneWidthPx`.

Diagnostic Anomalies 1/4 (board-freeze / lag past saturation) are
structurally foreclosed, not patched: `#board-column` moved to `flex: 1 1
auto` with the aspect-ratio square split out to `#board-square`
(`align-self: center`) one level down, so there is no longer a saturation
point for either bar's screen position to decouple at. This also means
diagnostic Finding 4 (dead half-range with no cue) has no dead range left to
cue — the underlying mechanism it was a symptom of is gone, not deferred.

## 4. Witness quality — one finding: a prohibited wall-clock sleep

**WITNESSED.** `grep -rn "waitForTimeout\|setTimeout("` across the diff and
probe scripts finds exactly one hit:
`.claude/dispatch-reports/resizer-rearch-probe.mjs:293`:

```js
await page.waitForTimeout(50); // let any (there should be none) reflow settle
```

This sits directly before the ledger-row-414 "no auto-resize" negative-claim
read (`#vue-tree-panel`/`#tree-control-wrapper` geometry, pre/post branch-
expand + navigation). The review charter names `waitForTimeout`/wall-clock
sleeps as **prohibited outright** (ADR-0021 amendment) — this is a finding,
not a judgment call, regardless of whether the 50ms happens to be harmless
in practice (Vue's DOM flush is a microtask, not timer-scheduled, so the
sleep is very likely inert here — but "probably fine" is exactly the
category ADR-0021 Rule 1 asks reviewers to stop accepting on faith). Fix:
poll on a real condition (e.g. two consecutive `requestAnimationFrame`s, or
comparing consecutive `getBoundingClientRect()` reads until stable) instead
of a fixed sleep. Low severity (one call site, in a throwaway probe script,
not shipped product code) but should be fixed before this pattern is copied
into the next probe.

Rest of ADR-0021 held up under inspection: the negative claim (ledger row
414, "content changes never touch tree width") is converted to a positive
before/after geometry comparison rather than left as an absence claim — the
authoring correction disclosed in the build report (an overly-broad
`[class*="toggle"]` selector producing a false positive, caught and narrowed
to `#vue-tree-panel .toggle-box`) is exactly the right instinct and is
disclosed rather than silently fixed. The sign-bug catch (INNER bar reusing
OUTER's sign, 1188px lag) is a real red-then-green witness at the right site
(the geometry function itself, pinned by unit tests) — Rule 4 satisfied.

## 5. Live probe reproduction — WITNESSED, own run

Rebuilt and ran the builder's own probe against a fresh dev server in the
worktree (own port, `npx vite --port 4737`, killed after). Reproduced the
same shape reported: **INNER bar** — 1 failure, `maxLag≈41px` at a mid-range
`dx`, non-fixed position across runs; **OUTER bar** — zero failures across
its full swept range. This matches the build report's own disclosure
verbatim; I did not find the root cause either in the time available
(**UNEXERCISED** beyond what's below — a third run to separate
"systematic-to-`#vue-tree-panel`" from "headless-timing artifact" was not
performed).

One candidate the build report didn't name, worth flagging for whoever picks
this up: `#vue-tree-panel`'s CSS (`border-left: 1px solid; padding-right:
5px;`) puts non-zero border+padding on exactly the element whose
`getBoundingClientRect().width` both the drag-origin read and the persisted
`width` value key off of — a box-sizing/content-vs-border-box mismatch
between the two would show up as a **magnitude-bounded, position-dependent**
residual, the same shape observed (6px of border+padding doesn't obviously
reach 41px on its own, but `TreeWidget`'s own internal SVG width recompute
sits behind that same box and wasn't ruled out either). Flagging as a
plausible next diagnostic step, not a diagnosis — genuinely UNEXERCISED.

## 6. ADR-0019 genre check — ACCEPT

Outer-left-of-tree / inner-between matches the maintainer's row-391
adjudication exactly (`#board-column`, `#resizer-outer`,
`#tree-control-wrapper` > [`#vue-tree-panel`, `#resizer-inner`,
`#control-panel}`] — confirmed against `App.vue`'s actual DOM order, not just
the header comment's claim).

## 7. Builder's disclosed gaps — assessed, both acceptable to defer

- **Library (700px) / Analysis (379px) breakpoints not converted** to
  `useDeferredContainerBreakpoint` (only `ForestDirectory` was). Acceptable
  to defer: the composable is generic, the conversion is mechanical
  (same pattern, disclosed honestly as not yet done), and it's strictly
  additive follow-up, not a merge blocker for this PR's own scope.
  `useDeferredContainerBreakpoint.test.ts` (11/11) does cover the
  hysteresis/no-commit-mid-drag properties in isolation, which is the load-
  bearing logic the other two sites would reuse unchanged.
- **~41px INNER-bar residual lag** — disclosed honestly, reproduced
  independently (§5), correctly deprioritized relative to the 13–29×-larger
  headline defects it replaced. Acceptable to ship as a tracked residual,
  *given §2 is fixed first* (a lost-drag bug matters more than a 41px lag on
  a drag that persists).

Neither disclosed gap is what blocks this review — §2 is undisclosed and is
the actual blocker.

---

## Summary — merge-composition requirements

1. **Fix §2 first**: add `touchSession()` to both `onMouseMoveInner` and
   `onMouseMoveOuter`; extend `sync-session-version.test.ts`'s mutation
   census to cover `treePanelWidthPx`/`treeControlRegionWidthPx`. This is a
   correctness regression, not a nit — do not merge without it.
2. Resolve the 8-file conflict set per §1 (renumber migration to `63→64`,
   `CURRENT_SCHEMA_VERSION` → 64, archive `next`'s `61→62 analysisRange`
   migration, reconcile `App.vue`'s `.right-toggles` move + `toggleChrome`/
   `activeTab` computed + `@update-rules` handler this branch's stale base
   doesn't know about). The resolved tree at `/tmp/omega-trial-merge`
   (uncommitted scratch worktree) is available as a worked reference; build
   + eslint + full test suite (1367 tests) are green there once §1 alone is
   fixed — §2 needs the additional `touchSession()` fix on top.
3. Fix the `waitForTimeout(50)` in `resizer-rearch-probe.mjs:293` (§4) —
   low severity, but a named-prohibited pattern.
4. Architecture (§3), ADR-0019 genre fit (§6), and both disclosed gaps (§7)
   are ACCEPT as-is.

**Overall: ACCEPT-WITH-FINDING.** The geometric/architectural work is sound
and well-evidenced; §2 is a real regression this review's trial-merge step
exists specifically to catch, and must be fixed before this lands on `next`.
