Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).

# LYT finish-pass wave B1 — portrait board-priority repair (F3 + F4)

Commission: `.claude/dispatch-reports/lyt-finish-pass.md` §3, findings F3
(BLOCKER, portrait board size) and F4 (MAJOR, portrait tree width). Read
in full before starting, along with the F3/F4 screenshots
(`vp420x880-01-initial.png`, `vp768x1024-01-initial.png`,
`vp768x1024-19-tree-row-band.png`, recovered from a prior session's
scratchpad since the report's own screenshot directory is scratch, not
committed).

## 1. Base freshness (FIRST ACT)

`git fetch origin` resolved `origin/lyt-phase2` to `891b551e` — exactly
the commit named in the commission. This agent's worktree started on an
unrelated branch (`worktree-agent-ad7aac1307af444b6` at `3378806f`, a
`main`-branch merge — NOT an ancestor: `git merge-base --is-ancestor
891b551e HEAD` exit 1). Working tree had only untracked `.claude/`
(harness state), no tracked changes to lose. Hard-reset the worktree
branch onto `origin/lyt-phase2`; re-verified `git merge-base
--is-ancestor 891b551e HEAD` exit 0.

**HEAD at delivery: see the commit this report is filed alongside.**

## 2. F4 diagnosis (done first, per the commission's own instruction)

**Verdict: neither of the two named candidate diagnoses, precisely —
closest to the second but the actual mechanism is more specific.**

Confirmed by direct measurement (isolated rig, §5): at both 768x1024
and 420x880, portrait's `H(tree, controlPanel, previewBoard)` row (a
direct ROOT `V(...)` child — no side-column-sharing context the way
landscape has) resolves `controlPanel`/`previewBoard` both ABSENT by
default (P1's repetition-first disposition, ledger row 2333) — `tree`
is therefore the row's SOLE, residual-holding child, its compiled
`pref 1fr` track declaring "claim whatever the row doesn't otherwise
need" (Amendment 9, SPEC.md §17). `#tree-control-wrapper` (the row
itself) correctly measures the FULL row width (420px / 768px) — it is
NOT shrunk to fit its children, ruling out "the row's H-split granting
tree only its floor" in the literal sense the commission's second
candidate names. The row's OWN grid track is fine; what pins `tree` is
its OWN child track override.

The real mechanism: **not a persisted drag override leaking across
classes** — a fresh, never-dragged session reproduces the defect
identically, and `session.ui.treePanelWidthPx` is confirmed `undefined`
throughout. It is `computeTreePanelDefaultWidthPx`'s own un-dragged
DEFAULT formula (`TREE_PANEL_DEFAULT_WIDTH_FRACTION = 0.12` of the FULL
workspace width, floored at `TREE_PANEL_MIN_WIDTH_PX = 140`) —
authored for LANDSCAPE's side-column-sharing shape, where a fixed-664px
control panel is USUALLY standing beside the tree and a modest fraction
default is the right conservative starting point before a user ever
drags. That formula floors to exactly 140px at every portrait
representative width (12% of 420 = 50, of 768 = 92, both under the
140px floor) with **no regard for whether the row's other children are
even present** — `clampTreeWidthForSideColumn` (W-A's own reservation
clamp) only ever SHRINKS this floored default, never widens it, so
nothing in the pre-existing pipeline ever corrects a floored-but-wrong
default upward even when 100% of the row is free. Screenshot-witnessed
before the fix: `tree` renders a 140x140 square pinned to the row's
left edge, with 280px (@420) / 628px (@768) of the row sitting empty —
exactly reproducing F4's own reported shape.

## 3. F4 fix — `resolvePortraitTreeRowWidthPx`

**Composes with, does not fork, W-A's `clampTreeWidthForSideColumn`.**
New pure function in `frontend/src/state/layout-model.ts`: delegates the
shrink half verbatim to `clampTreeWidthForSideColumn` (byte-identical
behavior for every case it already covers — a present sibling, or ANY
user drag on record), and additionally RAISES the result to the row's
own measured width (`sideColumnWidthPx`) when, and only when, BOTH:

- the user has never dragged the INNER bar this session
  (`isUnsetDefault`, `session.ui.treePanelWidthPx === undefined`); and
- every fixed sibling the row could carry is currently absent
  (`reservedPx === 0`, via the SAME `sumFixedRowSiblingReservationPx`
  W-A's own shrink path already reads — ADR-0012 P1).

**On the ledger-row-414 invariant, per the commission's own framing.**
The invariant's own text (`useResizablePanel.ts`'s header) protects the
tree pane's width from changing "automatically" via **content**
(no fit-to-content, no auto-grow on branch expansion or navigation) and
protects the **user's own drag** as the single write channel for the
*persisted* value. It says nothing about sibling structural presence.
The un-dragged DEFAULT branch this fix touches was *already*
reactive to live viewport width on every render before this change
(`computeTreePanelDefaultWidthPx`'s own doc: "varies with the WINDOW,
once, at render time, not with content") — this fix widens that SAME
already-reactive branch to also read the row's own sibling-presence
fact; it never writes to `session.ui.treePanelWidthPx`, and a user's
drag (however narrow, even with every sibling absent) still wins
verbatim, untouched, exactly as before. Read this way, the fix does not
need the invariant relaxed — it answers the narrower, portrait-specific
question the commission itself distinguished ("whether it extends to
portrait's un-dragged default is a genuine question"), not the broader
LANDSCAPE fork W-A's own STOP-and-report (`lyt-wA-width-demotion.md`
§7/§9 item 2) left open. That broader fork (should landscape's tree
ALSO widen into space its own siblings free, e.g. the 1920x1080/
1280x1024 "unclaimed dead grid space" W-A disclosed and explicitly did
not fix) is **not resolved by this pass** — landscape's call site is
byte-identical to before (verified, §6) — and remains exactly the open
question W-A left it as. I did not judge that fork; I scoped this fix
to the narrower one the commission itself carved out. If the
commissioner reads this differently — that ANY sibling-presence-
conditioned widen, even portrait-only, needed a ruling before landing —
that is the one judgment call in this delivery to flag explicitly.

**Scope: PORTRAIT ONLY**, at the App.vue call site (the class branch
lives where every other class branch in this file already lives, e.g.
`effectiveTreeControlRegionWidthPx`'s landscape-only OUTER-bar
override) — `layout-model.ts` itself stays class-agnostic.
`clampTreeWidthForSideColumn`'s own landscape call site in
`lytTrackStyleOverrides` is unmodified, passing the identical arguments
it did before this wave.

## 4. F3 fix — corrected A_app reservation (portrait only), measured

The stale dispatch report's own numbers (128px board, 420px chrome =
48%) turned out to be dominated by a **rig data artifact**, not a live
defect: the shared sample DB's persisted workspace document carries
`session.ui.lytPresence.boardRail: true`, migrated forward from a
legacy `sidebarExpanded: true` field that predates the repetition-first
disposition (P1, ledger row 2333) — `store/defaults.ts`'s own fresh-
profile default is `boardRail: false`. With `boardRail` correctly
resolving absent (per the compiled program's own default, verified by
directly correcting the persisted document's `lytPresence.boardRail` to
`false` and confirming `#sidebar-widget` disappears), the board at
420x880 was ALREADY ~388-420px tall before any code change in this
pass — the encoding's own P1/P2c work had already substantially closed
the gap the stale report measured. This is disclosed, not silently
substituted for the commission's own framing: the commission's stated
finding (128px, 48% chrome) does not currently reproduce against a
correctly-defaulted profile; what remains is a smaller, still-real,
measured gap.

**Per-widget reasoning, the commission's own named candidates:**

- **A_setup** (`@toggle`, "present by default — should it default-
  absent"): already `@toggle(user, release)`, and already in BOTH the
  shared `default_valuation` and portrait's own
  `default_valuation_by_class` absent set (`runner.py`, verified by
  direct read) — the commission's premise is stale; nothing to do.
- **The engine row** (controls needed for connect/match; eval/health/
  queue "secondary telemetry"): considered, not pursued. The row's 80px
  height reservation is driven by `.engine-controls`' OWN wrap need
  (M2 STAGE B2b item 4's own re-grounding, ledger row 2347), not by
  eval/health/queue — demoting those three by default (even if
  expressible without a new realization mechanism, via `@toggle`)
  would not reduce the row's HEIGHT budget at all, since all four
  groups share one fixed-height envelope regardless of which are
  present. Portrait's board-priority problem is a HEIGHT-budget
  problem (root `V` splits height); a fix that only reduces WIDTH
  clutter doesn't move F3's own goal metric. Not implemented.
  **Adjacent observation, explicitly out of scope**: `.engine-controls`
  measured 116px tall at 420px width in this pass's own rig — TALLER
  than its 80px reservation. This looks like the SAME class of defect
  F2 already names (the engine toolbar cluster's reserved-height/clip-
  rect mismatch) surfacing in portrait too, not a new finding this
  pass investigated further — F2 is explicitly out of this
  commission's scope (F3+F4 only).
- **I_metrics/status surfaces**: no standalone `I_metrics` leaf exists
  in the current portrait encoding — the M2 STAGE B2b engine-status
  decomposition (`A_engine_controls`/`_eval`/`_health`/`_queue`)
  already supersedes that concept. Candidate is moot.
- **The settings substrip**: lives entirely inside `controlPanel`
  (`T(...)[BLACK BOX]`), which is absent by default in portrait — it
  contributes nothing to the chrome-above-board budget already.
  Nothing to do.
- **A_app** (LOAD/SAVE SGF, engine-URI edit, sliders/PBO popovers,
  locale picker, setup-toggle trigger — 7 capabilities,
  `ToolbarAppCluster.vue`): the one substantive finding. This file's
  own header (OPTION C / TOOLBAR ONTOLOGY REENCODE section) claims its
  `160px` reservation is "a REAL Playwright measurement... taking the
  WORSE (narrower, 420px) case... plus a ~10px margin". A fresh
  measurement on this pass's own isolated rig, boardRail correctly
  absent, at all five of `coverage_matrix.PORTRAIT_SIZES`' widths
  found the CURRENT component's real wrapped-content height is 28px
  (ONE row) at 1080/1200/768/540, and 56px (TWO rows) at 420 — the
  worst case among the representative set is 56px, not ~150px.
  `.lyt-toolbar-strip`'s `align-items: center` was silently absorbing
  roughly 100px of pure centering whitespace inside the declared band
  at every representative width. Whether this is a genuine regression
  since the 160px figure was recorded, or the figure was never
  correct, is NOT established (no bisection run) — named as a
  discrepancy, not attributed. Corrected to the SAME "worst
  representative width + ~10px margin" convention the original figure
  claims: `56 + 10 = 66px`. **PORTRAIT ONLY** — `lengyue_landscape.lyt`'s
  own `A_app` (also `160px`, same shared component, different —
  side-column — context) is untouched; its own real wrap behavior at
  ITS OWN widths was not independently re-measured, out of this pass's
  named scope.

**No new realization mechanism.** A_app's leaf-level `@demote(h 616px)`
declaration already exists in the compiled program but its own
realization (moving the 7 capabilities to a `menu-path`/popover form,
per `lyt-capability-registry.ts`'s own `LYT_CAPABILITY_REALIZATION
.demoted` table) is explicitly disclosed in that file as DATA ONLY —
"nothing here constructs or groups chrome, and no component reads this
table to decide anything" — not yet wired to any consumer. Building
that wiring would be a genuinely new realization mechanism (a
menu-path collapse `LytNode.vue`'s existing P2b machinery does not
generically provide) — out of the sanctioned seam per this commission's
own SEAM NOTE. The reservation-number correction above is a pure
encoding-value fix; it invents no new mechanism.

## 5. Rig (isolation)

Ports `19400`/`19401`/`19402`, each probed dead (Python `socket`
`connect_ex`, not `/dev/tcp` — this worktree's sandbox refused
`/dev/tcp` redirection entirely) before use and confirmed dead again
after teardown.

- **Backend** `127.0.0.1:19400` — main checkout's venv
  (`/home/bork/w/omega/backend/venv/bin/python -m fastapi run`),
  `DATABASE_URI` pointed at a **copy** of `backend/samples/cards.sample.db`
  in scratchpad. The real `cards.db` was never opened. `QEUBO_ENABLED=false`.
  Verified live via successful app boot (workspace document fetch
  succeeded).
- **Frontend** `127.0.0.1:19401` — `vite --strictPort`,
  `VITE_API_BASE_URL=http://127.0.0.1:19400`,
  `VITE_KATAGO_WS_URL=ws://127.0.0.1:19402` (never contacted — engine
  not exercised by this pass, F3/F4 are layout-only findings).
- `frontend/node_modules` was absent in this fresh worktree; symlinked
  from the main checkout after diffing `package-lock.json`
  (`LOCK-IDENTICAL`), same precedent every prior LYT rig used.
- None of 4173/5173/5174/8764/1235/1242/195xx was touched. Only this
  session's own PIDs were started and explicitly killed at the end
  (re-verified dead via the same Python probe).
- **Disclosed data correction.** The sample DB's `documents` row
  (`user_workspace_01`) carries `session.ui.lytPresence.boardRail:
  true` (migrated forward from a legacy `sidebarExpanded: true`) —
  corrected to `false` via a direct `UPDATE ... json_set(...)` SQL
  statement against the SQLite copy (not the real `cards.db`) so this
  pass's own default-valuation measurements reflect the compiled
  program's actual intent rather than a stale carried-forward
  preference. Disclosed in full in §4 above.
- **Playwright**: `playwright-core` (no `@playwright/test` package),
  chromium at `/usr/bin/chromium` with
  `--js-flags=--max-old-space-size=1024`, one browser instance per
  script run, closed in a `finally`. No `systemd-run` wrapper was used
  for these ad-hoc probe scripts (a disclosed narrowing versus prior
  waves' full `systemd-run --user --scope -p MemoryMax=4G` invocation —
  each probe process was still short-lived, single-browser, and
  explicitly closed). No wall-clock waits beyond disclosed short
  settle timeouts (200-300ms) after a `waitForFunction` on a real DOM
  condition (`#board-square` non-zero width) — one exception, disclosed:
  an early probe reusing one page across two `setViewportSize` calls
  showed the SECOND measurement stuck at the FIRST viewport's tree
  width even after a 600ms wait — traced to a `ResizeObserver`/CDP
  resize-settle artifact specific to reusing one page across
  `setViewportSize` calls (a FRESH page load directly at 768x1024
  reproduced the correct, widened result immediately) — not a bug in
  the fix. Every reported AFTER measurement below is from a fresh page
  load per viewport, avoiding that artifact entirely.
- **Theme**: left at the default (`dark`) for measurement purposes —
  this pass's findings (F3/F4) are pure-geometry facts (element
  rects), not contrast/color facts, so theme was not driven to
  `'cluster'`. Screenshots are therefore dark-themed; disclosed rather
  than silently assumed equivalent to a `'cluster'` capture.

## 6. Screenshot witness

Under `…/scratchpad/wB1-rig/shots/` (scratch, not committed —
established LYT convention):

| File | What it shows |
|---|---|
| `BEFORE-420x880.png` | before either fix, boardRail corrected absent: board already ~420x388, chrome ~196px (the "already better than the stale report" baseline) |
| `BEFORE-768x1024.png` | same, 768 width: board ~768x532, tree stuck at 140x140 (F4's own defect, pre-fix) |
| `AFTER-420x880.png` | both fixes: board 420x420 (genuinely SQUARE), tree spans the full 420px row width |
| `AFTER-768x1024.png` | both fixes: board 768x626, tree spans the full 768px row width |
| `AFTER-1920x1080.png` | landscape regression check: tree panel 230px — byte-identical to W-A's own documented pre-existing figure |

**Achieved board size at 420x880 (GOAL FACT):** `#board-square`
420x420px — genuinely square, occupying 100% of the available width and
48% of the 880px viewport height. Before this pass's two fixes (but
with the rig's boardRail data artifact already corrected): 420x388
(44%). Before the boardRail correction (reproducing the stale report's
own artifact-laden baseline): ~220px tall board, matching the original
report's own qualitative shape. `#tree-control-wrapper`/`#vue-tree-panel`
both measure 420px wide (F4: was 140px, now spans the full row).

**Chrome share at 420x880, before/after F3's own A_app correction:**
chrome-above-board (root `V`'s children before the board composite,
`A_app` only, `boardRail`/`A_setup` correctly absent) — before: 196px
(22%); after: 102px (12%).

**768x1024:** board 768x626 (61% of the 1024px viewport height); tree
768px wide (was 140px).

**1920x1080 landscape:** unchanged — `#vue-tree-panel` 230px,
`#main-area` `scrollWidth === clientWidth === 1920` (no overflow),
matching W-A's own completion-pass report exactly.

## 7. Gates

| Gate | Result |
|---|---|
| `research/lyt` pytest (`nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest research/lyt/tests -q`) | **375 passed** (unchanged from baseline — the encoding edit required a `.gen.ts` regen, done in the same pass; post-regen, the roundtrip test is green again) |
| `coverage_matrix.py` before/after | **byte-identical** — every one of the 24 axis points reports the identical status before and after this pass's encoding edit (portrait `default`/`demoted` all 5 sizes OPTIMAL both before and after; landscape untouched). Delta: **none** |
| `.gen.ts` regen | `frontend/src/state/lyt-layout-portrait.gen.ts` regenerated via `emit_layout_tree.py --registration portrait`; landscape's own `.gen.ts` untouched (not regenerated — no landscape encoding edit) |
| mockups regen | `emit_mockup.py` re-run; `research/lyt/mockups/portrait.html` changed (2 lines), `landscape.html` byte-identical (not diffed as a changed file) |
| `npx eslint .` | **0 errors, 0 warnings** |
| `npm run build` (`vue-tsc -b && vite build`) | **exit 0** |
| `npx vitest run` | **exit 0** — 3241 passed, 8 skipped (baseline 3234 + 7 new: the `resolvePortraitTreeRowWidthPx` describe block) |
| `npx vitest run tests/integration/App-boot.test.ts` (isolated) | **exit 0** — 5 passed |
| Screenshot witness | 420x880, 768x1024 (both fixes verified), 1920x1080 (landscape regression check) — §6 |

## 8. Style/discipline checks

- No px used as bare reasoning currency without a citation — every new
  number (`66px` for A_app) is measured on this pass's own isolated
  rig, at every named representative width, with the worst case +
  margin shown; the F4 fix introduces no new pixel literal at all (it
  reads `sideColumnWidthPx`/compiled tracks, the same facts
  `clampTreeWidthForSideColumn` already reads).
- `resolvePortraitTreeRowWidthPx` delegates its ADR-0002 throw-on-
  wrong-track-kind guard to `clampTreeWidthForSideColumn` rather than
  duplicating the check (ADR-0012 P1).
- Ports 4173/5173/5174/8764/1235/1242/195xx never touched — verified
  by process-list inspection before and after.
- Every test edit is additive (one new `describe` block in
  `layout-model.test.ts`, 7 `it`s) — no existing test's expectation was
  changed; the +7 delta matches the vitest count exactly.

## 9. STOP-and-report

1. **The ledger-row-414 fork, narrowed but not fully resolved.** This
   pass's own reading (§3) is that the invariant does not need
   relaxing for the PORTRAIT-only, un-dragged-default widen this fix
   implements — but that reading is this session's own judgment, not
   a ruling. If the commissioner disagrees with that reading, this
   fix's F4 half should be treated as unlanded pending a ruling, not
   as already-settled. W-A's own broader fork (should LANDSCAPE's tree
   also widen into freed space, e.g. the disclosed 1920x1080/1280x1024
   "unclaimed dead grid space") remains exactly as open as W-A left
   it — this pass does not touch landscape's call site at all.
2. **F3's commission-stated numbers (128px board, 48% chrome) did not
   reproduce against a correctly-defaulted profile.** The gap was
   dominated by a stale sample-DB artifact (`lytPresence.boardRail:
   true`, migrated from a legacy field), not a live encoding/
   realization defect — disclosed in full in §4. The REMAINING,
   measured gap (A_app's over-reserved 160px) was real and is now
   fixed. If the commissioner's own F3 finding was captured against a
   DIFFERENT sample DB or session state that reproduces 128px/48%
   even with `boardRail` genuinely absent, that would be a different,
   unaddressed defect this pass did not find — flagged rather than
   assumed away.
3. **`.engine-controls` measured 116px tall against its own 80px
   reservation at 420px width** — adjacent to F2 (engine toolbar
   cluster reserved-height/clip-rect mismatch, already named and
   explicitly out of this commission's scope). Not investigated
   further; noted so it isn't silently lost.
4. **A_app's leaf-level `@demote(h 616px)` realization remains
   unwired** (`lyt-capability-registry.ts`'s own disclosure — DATA
   only). Building the `menu-path`/popover realization for A_app's 7
   capabilities below 616px width is a new realization mechanism,
   named here as a candidate for a future wave, not attempted.

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).
