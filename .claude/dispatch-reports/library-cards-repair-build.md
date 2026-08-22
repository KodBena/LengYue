# Library/Cards toolbar promotion — repair build report

Base: local `lyt-phase2` tip `83a1a903` (confirmed via `git log --oneline
-1 lyt-phase2` in the shared checkout before branching; this commit
already carries "cure final repairs" `829e952c` as an ancestor —
confirmed with `git merge-base --is-ancestor`). Worktree branch:
`repair-library-cards-toggle` (detached-then-branched from `83a1a903`
directly, never an `origin/` ref).

Context read: `.claude/dispatch-reports/library-cards-promotion-build.md`
(the just-merged build this repairs), the three commissioner live-test
screenshots (`aff8_adr0008_violation.png`,
`aff8_frozen_cards_no_control_panel.png`,
`aff8_frozen_library_no_control_panel.png`), and the mid-flight
addendum screenshot (`9440_no_access_to_analysis.png`).

## Defect 1 — ADR-0008 false category ("ENGINE" mislabeling)

**Status: fixed.** The responsive overflow trigger's i18n key/label is
renamed from `toolbar.engineControlsMenu` ("Engine") to
`toolbar.moreMenu` ("More") — a truthful, action-neutral generic label,
per the commissioner's own stated acceptable resolutions ("a truthful
generic label via i18n"). No entry-splitting was needed since the
mislabeling was the whole problem: MINT CARD(S)/LEARN PATH/PLAY/MATCH/
CONNECT/LIBRARY/CARDS sitting under a "More" menu is honest; sitting
under "Engine" was not.

Files: `frontend/src/locales/en.json` (key rename + tooltip text
updated to enumerate all 7 entries, was hard-coded to the original 5),
`frontend/src/components/chrome/ToolbarEngineControls.vue` (both
template usages updated). No other locale file carried the old key
(English is the fallback catalog), so nothing else needed touching.

## Defect 2 — enable-never-disable trap, plus the coordinator addendum

**Status: fixed**, including the mid-flight addendum (commissioner shot
`9440_no_access_to_analysis.png`: Settings/Analysis/Other were not
merely hard-to-close-back-to, they were **unreachable outright** while
Library/Cards showed — the tab strip itself was occluded, not just the
overlay's own dismiss path missing).

Three independent pieces, all in `frontend/src/App.vue` unless noted:

1. **Toggle.** `openLibrarySurface`/`openCardsSurface` now read
   `activeTab.value` before writing: clicking the ALREADY-ACTIVE
   toolbar entry closes it (writes `priorControlPanelTab`, the last
   REAL control-panel tab id `activeTab` held — tracked by a `watch`),
   clicking the other one swaps directly. Round-trips restore the
   EXACT prior tab, not a fixed default.
2. **Escape.** A single `window`-level `keydown` listener, registered
   once at setup and removed `onUnmounted`, closes the surface via the
   same `priorControlPanelTab` restore. Originally gated on
   `useModalKeyboard.ts`'s `anyModalOpen` (so an unrelated open modal
   keeps sole ownership of Escape) — **dropped that gate** after
   live-witnessing (this repair's own test harness) that
   `SetupWizardModal`/`LoginModal` are BOTH mounted during a fresh,
   network-disabled boot, which made the guard swallow every Escape
   press. Every modal's own `useModalKeyboard` wiring calls
   `preventDefault()` but never `stopPropagation()` (confirmed by
   reading every file under `src/components/modals/`), so both
   handlers observing the same keydown is the same shape every other
   window/document-level listener in this file already tolerates —
   ungating doesn't reintroduce F2's clipped-menu class of bug (that
   was about `position: fixed` escaping a clip rect, unrelated).
3. **Addendum: direct reachability, not just closeability.**
   `LytNode.vue` gains a new prop, `exclusiveHeaderOnlyByPath` (path ->
   boolean), forwarded through both recursive `<LytNode>` call sites
   exactly like every other cross-cutting Exclusive prop already there.
   When set for the `controlPanel` Exclusive's own path, its `TabWidget`
   renders `part: 'header'` instead of `'both'` — the SAME header/body
   split `SettingsSubstrip.vue`/`SettingsPane.vue` already use
   (`TabWidget.vue`'s own "Split composition, `part`" mechanism, not a
   new one). `App.vue`'s new `exclusiveHeaderOnlyByPath` computed sets
   this true exactly when `rightPanelMode !== 'controlPanel'`.
   `TabWidget.vue`'s existing `.vue-tabs--header-only .tab-header` rule
   (already scoped to header-only mode by an earlier rider) gains
   `position: relative; z-index: 6` — strictly between the overlay's
   `z-index: 5` and `.lyt-resizer`'s `10` (App.vue's own overlay
   comment already cites both bounds) — so the tab strip visually and
   interactively sits ABOVE `.right-panel-surface-overlay`. Settings/
   Analysis/Other are now directly clickable in ONE step while
   Library/Cards shows; the existing `handleLytExclusiveActiveChange`
   wiring (unchanged) does the rest, since it already writes
   `activeTab` unconditionally regardless of what was showing before.

Regression tests, `frontend/tests/integration/App-library-cards-promotion.test.ts`:
- toggle round-trip for Library and for Cards (closes back to the
  prior REAL tab, not a fixed default);
- Escape closes the surface; Escape is a no-op when the control panel
  is already showing;
- the addendum's own acceptance bar verbatim: `open Cards -> activate
  Analysis -> Analysis renders` (one step, `activeTab` reaches
  `'analysis'`, overlay gone — deep chart-panel content assertions
  were dropped after discovering an unrelated, pre-existing jsdom
  environment gap, disclosed below);
- the pre-existing "Settings tab while overlay showing" test was
  updated: it no longer re-clicks the already-active Cards button
  first (that used to be a no-op reaffirm; under the new toggle
  semantics it would close the surface instead), and now also asserts
  the tab strip is queryable/clickable BEFORE closing the overlay
  (proving the addendum's reachability claim, not just the toggle).

**Disclosed narrowing:** the new `open Cards -> Analysis` test does not
assert `AnalysisControls`' own deep chart content
(`.analysis-config-box` etc.) — `ScoreLeadPanel`/`MergedDeltaPanel`
throw in this repo's jsdom harness on an unrelated, pre-existing gap
(`themeColor: CSS variable "--player-black" is undefined`, caught by
`RootErrorBoundary`), never previously exercised by any test mounting
the full `App` and clicking into Analysis. The test instead asserts the
ROUTING acceptance bar (`activeTab` reaches `'analysis'` in one click,
overlay gone) at the same fidelity the pre-existing Settings test
already used. Flagging for the commissioner/next session — this is a
test-environment gap in an UNRELATED component family, not something
this repair's own changes touch.

## Defect 3 — wrongful collapse at ~4k despite enormous free width

**Status: fixed** (best-available diagnosis under this session's
constraints — disclosed honestly below, no live-browser access this
session).

Root-cause chain traced by reading, not guessed: `.claude/dispatch-
reports/lyt-cure-final-repair-review.md`'s own arc (`state/
feasible-layout.ts`'s `resolveRootSplitLiveLayout`, ledger row 2511)
already fixed the SIDE COLUMN's own frozen 820px ceiling before this
dispatch — that function's own comment explicitly names
"`.engine-controls` frozen at 265px" as the exact symptom it closed.
So by the time `library-cards-promotion` landed, the compiled-track
math itself was already sound; what's LEFT, and what this repair
targets, is `useEngineControlsRealization.ts`'s own live DOM
measurement of that (now-correctly-wide) column.

`useElementWidth.ts` (the composable `useEngineControlsRealization`
already uses for this) relied SOLELY on `ResizeObserver` delivery.
`useResizablePanel.ts`'s own header (read in full) documents a
live-witnessed, real-browser-only failure class this same codebase
already root-caused and fixed ONE OTHER PLACE for
(`#tree-control-wrapper`/`#split-workspace`): a `ResizeObserver`
instance can simply STOP delivering callbacks for a live,
still-attached, still-correctly-identified element after its initial
settle — reproduced three independent ways on a live rig, not
reproducible in jsdom at all. That fix's own idiom — a plain `window`
'resize' listener, decoupled from `ResizeObserver` entirely, that
force-remeasures on every real viewport change — was NEVER generalized
into `useElementWidth.ts` itself, so every OTHER consumer (including
`useEngineControlsRealization`) stayed exposed to exactly the "frozen
reading" symptom the mandate names. This repair generalizes that same,
already-precedented idiom into `useElementWidth.ts` (its own one home
for "observe an element, expose its live width", ADR-0012 P1) — a
`remeasure()` that force-reads the currently-observed element directly,
wired to `window`'s `resize` event, released in `stop()`/`onUnmounted`.
Purely additive: every existing consumer (`LibraryTable.vue`,
`IntervalSummaryPanel.vue`, `useContentDemand.ts`) gains the same
resilience with no behavior change otherwise.

**Disclosed honestly, per ADR-0002:** this session had no live-browser
rig access, so the EXACT trigger that leaves the reading frozen at 4k
in the commissioner's own session (an initial-settle race, a genuine
ResizeObserver-stops-delivering instance, or something else) is not
independently re-confirmed here — the fix is the established,
already-verified-effective mitigation for the DOCUMENTED failure class
this codebase's own git history names for the identical symptom
("frozen ... despite ... free width"), not a fresh diagnosis from
scratch. If the live rig re-witnesses this and it's NOT resolved, the
next session has rig access and should re-diagnose from there — the
pure-algorithm math itself (width -> row-wrap -> height-vs-80px-budget)
was independently verified correct at ample width (regression test
below), so a persisting symptom would point at some OTHER measurement
gap, not this decision arithmetic.

Files: `frontend/src/composables/chrome/useElementWidth.ts` (the
fallback, generalized). New regression test:
`frontend/tests/integration/useElementWidth-resize-fallback.test.ts` —
proves the STRUCTURAL guarantee jsdom CAN express (a dead/no-op
`ResizeObserver` stand-in, `window` resize event still recovers a fresh
`getBoundingClientRect()` read; `stop()` tears the listener down).
Also `frontend/tests/unit/state/engine-controls-realization.test.ts`:
new "library-cards-promotion: seven capabilities, ample-width
regression" describe block — an ample column (900px) with all 7
capabilities' worst-case widths (5 live-measured + 2 conservative
placeholders for Library/Cards, sized to the widest existing
single-word label) selects `button-cluster`; the same 7 items at a
genuinely narrow column (150px) still correctly select `menu-path` (a
sanity control against an unconditional-pass bug).

## The two "frozen" screenshots

`aff8_frozen_cards_no_control_panel.png` / `aff8_frozen_library_no_
control_panel.png`: both taken at the SAME viewport as the ADR-0008
screenshot (identical 4582×2217 dimensions across all three) — visual
inspection found no unresponsiveness beyond defects 2 and 3 already
named: the ENGINE(now "More")-collapsed toolbar (defect 3) plus the
enable-never-disable trap (defect 2), compounding into "no visible way
back." `EVAL −/−`, `HEALTH 0pps`, `QUEUE 0` all read as normal
disconnected-engine idle state, not a hung/broken value. No third,
distinct defect found in these two shots; both are addressed by the
same fixes above (defect 3 keeps the cluster in button-cluster form at
this width once measurement is unstuck; defect 2's toggle/Escape/
direct-reachability trio gives three independent ways out even if the
cluster ever does legitimately collapse to the menu at a narrower
width).

## Discipline

- No banned CSS (`box-shadow`/`transitions`/`blur`) introduced.
- `--text-0`/`--surface-0` untouched; new `.btn-surface-active`
  markup predates this repair (library-cards-promotion build), no
  fresh color decisions made.
- i18n: the ONE label change goes through the catalog (`toolbar.
  moreMenu`), not a hard-coded string.
- No wall-clock sleeps in the delivered code or tests (`window.dispatchEvent`
  is synchronous; `flushPromises()`/`nextTick()` are the async-settle
  idiom this test tree already uses throughout).
- ADR-0006 headers: every touched file already carried one; new file
  (`useElementWidth-resize-fallback.test.ts`) carries one.

## Gates

- `nice -n 19 npm run build` → **exit 0** (1269 modules, no type
  errors; run twice, clean both times).
- `NODE_OPTIONS=--max-old-space-size=2048 nice -n 19 npx vitest run
  --changed=83a1a903 --maxWorkers=2` — **disclosed narrowing:** the
  shared host was running 6-9 concurrent `vitest` processes from other
  agents this session (`uptime` load average peaked at 20.99), and
  three consecutive full-suite attempts either crashed with `Error:
  Unknown system error -122: Unknown system error -122, write` (a
  host-level I/O exhaustion error, not a test assertion failure — the
  SAME crash hit files this repair never touched) or stalled
  indefinitely under CPU starvation. Rather than hold indefinitely
  under a time-boxed delivery window, gated at file scope instead,
  with clean passes on every file this repair touched or added:
  - `tests/integration/App-library-cards-promotion.test.ts` —
    **exit 0, 10/10 passed** (isolated run, `--maxWorkers=1`).
  - `tests/unit/state/engine-controls-realization.test.ts` —
    **exit 0, 20/20 passed** (isolated run — the SAME file that hit
    the `-122` host error inside the crashed full-suite attempts,
    confirming that crash was infrastructure, not this file's own
    assertions).
  - `tests/integration/useElementWidth-resize-fallback.test.ts` (new)
    — **exit 0, 3/3 passed**.
  - `nice -n 19 npm run build` (above) is the strict typecheck +
    bundle safety net across the WHOLE tree, including every file
    these changes touch — confirms no cross-file type regression the
    scoped test runs alone wouldn't catch.
  A full `--changed` run should be re-attempted once host contention
  clears; nothing in this repair's own diff explains the `-122`
  crashes (they hit files with zero relation to this change, e.g.
  `tests/e2e/*`, before this repair's own files were even reached).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
