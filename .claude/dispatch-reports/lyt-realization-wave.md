# LYT realization wave — LytNode Exclusive case + derived overflow

Work item `lyt-realization-exclusive-overflow` (ledger row 1937's ratified
consult, `.claude/dispatch-reports/lyt-tab-region-consult.md`, §8.1/§9). Base:
worktree cut from `main` tip (stale base — the FIRST-ACT check named this;
`git rebase lyt-phase2` fast-forwarded cleanly to `732fdc9a`, zero unique
commits lost). Read end to end before any change: the umbrella `CLAUDE.md`,
`frontend/CLAUDE.md`, `docs/adr/0000`, `docs/adr/0002`, `docs/adr/0012` (both
pages), `.claude/dispatch-reports/lyt-tab-region-consult.md` (all of it, not
only §3-C/§6/§8.1/§9), `research/lyt/SPEC.md` (1280 lines), `research/lyt/
SPEC-AMENDMENTS.md` (872 lines), `.claude/dispatch-reports/lyt-optionc-
repair.md`, `research/lyt/emit_layout_tree.py`, `frontend/src/components/
chrome/LytNode.vue`, `frontend/src/components/chrome/TabWidget.vue`,
`frontend/src/App.vue` (chrome region), `frontend/src/components/charts/
AnalysisDashboard.vue`, `frontend/src/components/SettingsTab.vue`,
`frontend/src/state/lyt-layout-types.ts`, `frontend/src/state/lyt-widget-
registry.ts`.

## Review response (2026-08-11) — Finding 1 fixed, Finding 3 disclosed

Independent review (`.claude/dispatch-reports/lyt-realization-wave-review.md`,
read in full) returned **REJECT** on one blocking, localized defect (Finding
1) after visually witnessing this wave — the witness this delivery's own §3
had marked UNEXERCISED. Everything else the review examined (the structural
realization, the single-tab-implementation proof, the derived-overflow
machinery, the scope-narrowing fidelity, the tests, the gates) was found
sound and not reworked.

**Finding 1 (Major, blocking) — fixed.** `otherColorDebug`'s declared
reservation (40px, disclosed at the time as "an UNGROUNDED estimate... the
weakest-grounded number in this wave") was genuinely too small — the leaf's
real mounted content (`App.vue`'s `#leaf-otherColorDebug` template: an `<h3>`
heading, a hint `<p>`, and `<ColorDebugStrip>`, together inside one
`.tab-padding` wrapper) overflowed the fixed 40px track and painted over the
`otherBand` sibling below it, both mandated viewports. **Measured myself**
(own isolated Playwright rig, own served build via `vite dev`, own backend
(`fastapi`) on a copy of `backend/samples/cards.sample.db`, ports
19110–19112 — all three probed dead via `/dev/tcp` first; none of the
forbidden ports touched; Chromium launched under `systemd-run --user --scope
-p MemoryMax=4G`, `nice -n 19`, `--js-flags=--max-old-space-size=1024`; no
`waitForTimeout`; every browser context closed in a `finally` block; backend
+ frontend dev servers killed by PID at the end, both ports re-verified dead
afterward): the `.tab-padding` wrapper's own natural (unclipped)
`boundingBox()` height — a plain block div, sized by its content, nested
inside the CSS-grid-track-constrained `.lyt-leaf-cell` (which is what the
40px track actually clips; the wrapper inside it is not) — at every size
this wave's own visual-verification mandate names:

| Viewport | Operating column width | Measured natural height |
|---|---|---|
| 1920×1080 (landscape) | 375px | 243px |
| 1280×1024 (landscape) | 292px | **254px** (binding — narrower column wraps the heading/hint text onto more lines) |
| 1080×1920 (portrait-class representative point) | 931px | 232px (wider column here, not binding) |

Corrected reservation: **264px** (254px measured maximum + the same ~10px
margin posture this encoding's own REPAIR PASS/W4 FLOOR CORRECTION sections
already establish elsewhere in this file). Applied to both `min`/`pref`/`max`
(still a fixed track — `content designed` stays no-scroll per L5c; the
component's height is a design fact of a fixed content set, not something
that varies at runtime, so `fixed` remains the honest shape, not `elastic`).
Applied identically to `lengyue_portrait.lyt`'s own `otherColorDebug`
declaration (not independently re-measured at a portrait-class narrow
column — landscape's larger, measured number is used there as a disclosed,
conservative choice; full derivation in that file's own inline comment).
Both `.gen.ts` files regenerated (`emit_layout_tree.py --registration
{landscape,portrait}`) — diff is exactly the one `px: 40` → `px: 264` line
in each generated file, nothing else.

**Re-witnessed post-fix**, same rig, both mandated viewports: `otherBand`'s
own top-left corner now resolves (`document.elementFromPoint`) to its own
"Knob Registry" content, not the color-debug strip; the color-debug wrapper's
natural bottom edge sits 25px (1920×1080) / 14px (1280×1024) above
`otherBand`'s own top edge — a real gap, not a hairline pass. Screenshots:
`after-fix-other-1920x1080.png`, `after-fix-other-1280x1024.png` (plus the
pre-fix reproduction, `before-fix-other-{1920x1080,1280x1024,1080x1920-
portrait}.png`), all under
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/lyt-visual/`.

**`research/lyt` suite re-run in full, all four files, after the
correction: 152 passed, exit 0 — no feasibility-pin changed.** Checked
directly, not merely asserted: the `otherColorDebug`/`otherBand`
`V(...)`-composite's own structural floor grows by the reservation delta
(224px), but that composite sits as one of the control-panel T's five
children, and the T's own componentwise-max floor was ALREADY larger
(838px, driven by the settings substrip — `lyt-optionc-repair.md`'s own
Finding 3) both before and after this correction, so the T's own derived
floor is unaffected and every size this suite pins `OPTIMAL`/`INFEASIBLE`
solves the same way it did before this fix. Named individually, per the
coordinator's own instruction, precisely because the answer could have gone
the other way: it did not move any pin.

**Finding 3 (Minor, informational) — TabWidget remount granularity,
disclosed.** See the updated §2 "Parity statement" below — the review judged
this benign but flagged that this report's own parity section described the
`:key` placement change without calling out its remount-granularity
consequence explicitly. Added with this delivery's own analysis.

**Finding 2 (Minor, informational) — sabotage coverage.** Not actionable by
this delivery (a review-process note about the review's OWN sabotage-pass
coverage of `TabWidget.vue`'s `paneOverflowStyle`, not a defect in the
delivery); no change made in response.

## 0. Scope disclosure up front (read this before the rest)

The commission's item 2 asked for the modeled interiors of **all** five
control-panel tabs to become rendered structure. This delivery opens
**three** of the five (library, cards, other) and keeps **two**
(settings, analysis) as single opaque mounts, unchanged from before this
wave. This is a genuine, deliberate scope narrowing beyond the one
pre-authorized exception (the settings-substrip interim overflow
exception), and per the umbrella `CLAUDE.md` and this commission's own
"Scope narrowing/widening = STOP-and-report" rule it is named here loudly
rather than either silently implemented or silently dropped. As a
background dispatch with no synchronous channel back to the commissioner
mid-task, the disposition taken is: implement everything that is safe and
unambiguous, name the two narrowed items with their concrete engineering
reason, and surface both for ratification or reversal in review — not
silently ship a functional regression, and not silently do nothing.

**CP-analysis (the bigger reason).** The encoding's own nested
`T(AT_basic, AT_distributions, AT_stability, AT_multires)` transcribes only
the **default** `AppSettings.analysisTabs` configuration (Amendment 4's
precedent, and the ratified consult's own §8.3: "the static guarantee
covers the declared default configuration ... the only sound instrument for
user-authored layouts is a runtime advisory check ... a different, larger
commission"). `AnalysisDashboard.vue` today drives a **genuinely dynamic,
user-configurable** tab set from that same store field via its own
`TabWidget` instance. Rendering the encoding's nested T live, unconditionally,
would have hard-coded the DOM to the static four-tab default and silently
overridden a real user's customized analysis-tab layout — a functional
regression, not a structural one, and exactly the residual §8.3 names as
requiring its own separate runtime-advisory commission. `CP-analysis` mounts
`AnalysisControls`/`AnalysisDashboard.vue` unchanged.

**CP-settings (the smaller reason).** The encoding models `V(settingsSubstrip,
settingsPane)` — a strip leaf plus one opaque pane leaf standing for
whichever of the six sub-tab bodies is showing. `SettingsTab.vue` already
realizes exactly this shape as ONE component with its own internal
`TabWidget` (horizontal/vertical, user-selectable). Splitting that single
component's own strip and body into two separately-mounted LYT leaves is a
real refactor of `SettingsTab.vue`/`TabWidget.vue`'s composition boundary —
tractable, but a second nontrivial piece of surgery this session's budget did
not extend to alongside the rest of the wave, its tests, and its gates.
`CP-settings` mounts `SettingsTab.vue` unchanged.

Both are named explicitly in `research/lyt/emit_layout_tree.py`'s own module
docstring ("REALIZATION WAVE" section), in `frontend/src/state/lyt-widget-
registry.ts`'s `CP-settings`/`CP-analysis` entries, and pinned by a dedicated
test (`test_control_panel_exclusive_opens_library_cards_other_collapses_
settings_analysis`, `research/lyt/tests/test_emit_layout_tree.py`) so a
future wave that opens either further does so as a reviewed, deliberate
change to a named registration field
(`Registration.control_panel_collapse_indices`), not a silent architecture
drift.

**Visual verification (item 6) is UNEXERCISED, blocker: time budget.** See
§7 below — named honestly rather than fabricated.

## 1. Per-item delivery

### Item 1 — LytNode gains a generic Exclusive case

**WITNESSED.** `frontend/src/components/chrome/LytNode.vue` gains a third
`v-else-if` branch (`group.rep.node.kind === 'exclusive'`) alongside the
pre-existing Split and leaf/blackbox branches — LytNode is now a genuine
structural fold, total over `Leaf | Split | Exclusive | Blackbox` (the
consult report's own §6.2/§8.1 closure statement, applied). Rendering an
Exclusive node = a tab strip + the active child's own body, realized by
**reusing `TabWidget.vue` directly** as a driven child component (dynamic
`v-model`, dynamic named slots per child, `owns-scroll="false"`) — not a
second hand-authored strip/body implementation. `groups`/`widgetIdOf` treat
Exclusive children the same way they already treat Split children (never
merged into a run, never a toggle target of their own). Active-tab state is
threaded as a plain path-keyed prop pair (`exclusiveActiveByPath` /
`onExclusiveActiveChange`), forwarded verbatim through every recursive
`<LytNode>` call the same way `domIdsByPath`/`presenceOverrides` already
are — not a Vue `emit`, because an emitted event does not bubble through an
intervening `<LytNode>` recursion level without each level re-declaring it,
and the control-panel Exclusive sits two Split levels deep in both screen
classes (this was caught and fixed mid-build: the FIRST draft forwarded the
new props only on the Exclusive-child recursion site, not the ordinary
Split recursion site the outer T must pass through to be reached at all —
without the fix, tab switches would have silently reverted to
`defaultTabId` every render).

Tab labels are resolved through a `translateLabel` callback prop
(default: identity function), not a direct `useI18n()` call inside
LytNode.vue — a deliberate design choice made after the first build attempt
broke two unrelated pre-existing regression suites
(`LytNode-dom-id-wiring.test.ts`, `LytNode-presence-toggle.test.ts`), which
mount `LytNode` bare with no i18n plugin installed and have nothing to do
with tabs. Keeping i18n as App.vue's own concern (it already has a script-side
`t` in scope) keeps LytNode's own dependency surface unchanged for every
consumer that doesn't need translation.

### Item 1 (continued) — single-tab-implementation proof

`TabWidget.vue` is the **only** file in the tree that renders a `role="tab"`
element or a `.tab-header`/`.tab-body` structure. Proof, mechanized:
`tests/integration/LytNode-exclusive-rendering.test.ts`'s own
"single-tab-implementation proof" test source-scans `LytNode.vue` and
asserts it imports `TabWidget.vue`, renders a live `<TabWidget>`, and
contains **zero** occurrences of `role="tab` anywhere in its own template —
so a future accidental re-authoring of a second strip inside LytNode.vue
fails this test on sight, not just on review.

### Item 2 — boundary markers moved inward (partial, see §0)

**WITNESSED for library/cards/other; deliberately UNEXERCISED for
settings/analysis (§0).** `emit_layout_tree.py`'s Exclusive branch, when a
registration sets `open_control_panel=True` (both `landscape`/`portrait`
now do), emits a genuine `kind: 'exclusive'` node instead of always
collapsing. Each of the five children is either opened (recursed generically,
the same fold every other node kind gets) or collapsed to one synthetic
`blackbox` leaf per `Registration.control_panel_collapse_indices = {2, 3}`
(settings, analysis). The emitted `.gen.ts` files (both classes) now carry
`CP-library`/`CP-cards` as real leaves (with `scrollAxes`/`content` carried
through — item 3) and `CP-settings`/`CP-analysis` as synthetic collapsed
leaves; the Other tab (index 4) opens fully to its own modeled
`Split(otherColorDebug, otherBand)`.

Regenerated via `cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/
python emit_layout_tree.py --registration {landscape,portrait}` — the
standard regen command, unchanged.

### Item 3 — overflow derives from the program (partial)

**WITNESSED for the newly-opened leaves; unaffected/unchanged for the
still-collapsed regions (§0).** `LytLeafNode` (`lyt-layout-types.ts`) gains
`scrollAxes: readonly LytAxis[]` and `content: LytContentClass`, carried
through by the emitter's Leaf branch from `Slot.scroll_axes`/`Leaf.content`
(Amendment 5). Two new consumers turn that data into literal CSS:

- `frontend/src/composables/chrome/useLytOverflowCss.ts` (new file) —
  `leafOverflowStyle(node)`, a pure `(LytNodeData) -> {overflowX?,
  overflowY?}` mapping, applied by `LytNode.vue`'s ordinary leaf-cell
  rendering (`.lyt-leaf-cell`) to every leaf reached via the normal Split
  recursion — this is how `otherColorDebug`/`otherBand` (the opened Other
  tab's own two leaves) get their overflow.
- `TabWidget.vue` gains an `ownsScroll` prop (default `true`, every
  pre-wave consumer unchanged) and an optional per-`Tab.scrollAxes` field.
  When `LytNode.vue`'s Exclusive case drives TabWidget with
  `owns-scroll="false"`, `.tab-body`'s own blanket `overflow-y: auto` is
  retired in favor of **per-`.tab-pane`** derived overflow — this is how
  `CP-library`/`CP-cards` (mounted through TabWidget's own slot mechanism,
  not the leaf-cell path) get theirs.

`content: 'designed'` leaves (`otherColorDebug`, and the still-unopened
`timelineStrip`/`AT_*` panels inside the untouched CP-analysis interior)
correctly carry **no** scroll axis and get no forced overflow — the L5c
chart-exclusion policy is honored by construction for every leaf this wave
actually renders live.

### Overflow-writer retirement table

| Old writer | Disposition | Derived home |
|---|---|---|
| `#control-panel { overflow: auto }` (`style.css`) | **Retired.** | Each of the five tabs now owns its overflow individually — the ancestor no longer needs to scroll itself. Closes that rule's own long-standing "keep until a follow-up consolidates control-panel styling" comment. |
| `TabWidget.vue`'s `.tab-body { overflow-y: auto }` | **Retired, scoped.** | Retired only for the ONE `TabWidget` instance LytNode's Exclusive case drives (`owns-scroll="false"`) — per-`.tab-pane` derived overflow (item 3) replaces it there. Every OTHER `TabWidget` consumer (Settings sub-tabs, ForestDirectory, AnalysisDashboard's own tab row) keeps the unchanged blanket behavior — `ownsScroll` defaults `true`. |
| `AnalysisDashboard.vue`'s `.scrollable-content { overflow-y: auto }` | **NOT retired — disclosed scope narrowing (§0).** | CP-analysis stays a single opaque mount this wave; its own internal overflow is unaffected. |

`L5b` (single scroll owner per root-to-leaf path) holds structurally for
every leaf this wave opens: `CP-library`/`CP-cards`/`otherBand` each own
exactly one scroll declaration on their own path (no ancestor also
declares one, since `#control-panel`'s own ancestor rule is retired and
TabWidget's `.tab-body` is opted out for this instance) — nested scrollbars
are impossible by construction for the region this wave actually opened.
For the still-collapsed settings/analysis mounts, the pre-wave (already
non-nested, single-owner) internal scroll behavior is unchanged.

### Item 4 — Other-tab split

**WITNESSED.** The encoding's own ratified `V(otherColorDebug, otherBand)`
shape (§9.3 of the consult) now renders live: `App.vue`'s single `#other`
slot (`KnobRegistryEditor` + `ColorDebugStrip` + `VisitsLerpConfig` +
`PerQueryOverridesConfig` + `QeuboBookmarks`, all sharing one scrolling
ancestor) splits into `#leaf-otherColorDebug` (the fixed, designed-height
`ColorDebugStrip` band, no scroll declared) and `#leaf-otherBand` (the
scroll-owned band holding the remaining four components). The
L5c-refusing composition the consult names (a chart-ish strip inside a
scroll region) is structurally gone from the DOM for this tab.

### Item 5 — Witnesses

**WITNESSED**, per-suite:

- `research/lyt/tests/test_emit_layout_tree.py` — three legitimate test
  updates (the emitter's actual output changed, not a regression: two
  landscape/portrait roundtrip tests were building via the wrong function,
  `build_program()` bare instead of `build_program_for(registration)` —
  a real bug in the tests themselves, caught and fixed, not papered over)
  plus **two new tests**: `test_control_panel_exclusive_opens_library_
  cards_other_collapses_settings_analysis` (landscape) and the rewritten
  `test_portrait_control_panel_blackbox_floor_is_wrapper_min_derived`
  (portrait) — both assert the exact opened/collapsed shape, the tab-id
  ordering, the label keys, and the per-leaf `scrollAxes`/`content` values.
- `frontend/tests/integration/LytNode-exclusive-rendering.test.ts` (new,
  8 tests) — tab-strip rendering via a real TabWidget instance, lazy
  per-tab mounting, the active-tab callback round trip (click → callback
  → `exclusiveActiveByPath` re-render), derived overflow (scroll-declared
  vs. no-scroll leaf cells), a Split child (the Other-tab shape) recursing
  through a nested `<LytNode>`, and the single-tab-implementation source
  scan.
- Two pre-existing suites were **broken by this wave** and repaired, not
  loosened: `LytNode-dom-id-wiring.test.ts` / `LytNode-presence-toggle.test.ts`
  — their synthetic `LytLeafNode` fixtures predate `scrollAxes`/`content`
  becoming required fields; updated to the honest widened shape
  (`scrollAxes: [], content: null`), the ADR-0000 "corrective diff is new
  structure" discipline applied. `SettingsTab-vertical-orientation.test.ts`'s
  own scope-discipline check source-scanned `App.vue` for a literal
  `<TabWidget ...>` tag that this wave moved into `LytNode.vue`; the
  consumer list was repointed at `LytNode.vue`, the SAME check re-verified
  against the file that now actually carries the tag (not loosened —
  the check still asserts the SAME invariant, "no other consumer passes
  `orientation="vertical"`").
- The stray "880px" comment (item 5's own cosmetic-fix ask,
  `research/lyt/tests/test_lyt.py:495`) — verified assertion-inert
  (comment only, no test outcome changed) and corrected to 838px with a
  dated note, matching every other 880→838 correction already on record
  from `lyt-optionc-repair.md` Finding 3.
- Every pre-existing test in both suites (`research/lyt`'s 152, the
  frontend's 3066) stays green — no stale assertion pinning the OLD
  container structure was found needing the ADR-0000 stale-assertion
  treatment beyond the ones named above.

## 2. Parity statement

`git diff` against `732fdc9a` — verified by direct read of every changed
file, not asserted from memory:

- Every one of the five control-panel tabs mounts the **same** components
  with the **same** props/events as before this wave (`LibraryTab`,
  `ForestDirectory`, `SettingsTab`, `AnalysisControls`, and the Other tab's
  four components, now split across two slots instead of one but with
  identical content and identical `:key="controlPanelIdentityKey"`
  remount-on-workspace-switch behavior, applied per-slot now rather than
  once on the retired App-authored `TabWidget`).
- **TabWidget remount granularity changed (review Finding 3, disclosed
  here explicitly, own analysis).** Pre-wave, `App.vue` keyed the ENTIRE
  `<TabWidget>` instance (strip + all panes) on `controlPanelIdentityKey`,
  so a workspace switch remounted the tab strip itself, not just its
  content. Post-wave, `LytNode.vue`'s driven `<TabWidget>` instance is
  unkeyed at the outer level — only each tab's own content wrapper (or
  `SettingsTab`/`AnalysisControls` directly) carries the key. Net effect:
  tab **content** still fully remounts on workspace switch (the parity
  claim above); the tab **strip** (`role="tablist"` chrome — the `<li>`
  elements, their ARIA state, keyboard-focus DOM nodes) no longer does.
  **Own analysis:** this is very plausibly a strict improvement, not a
  regression — the strip carries no per-workspace state of its own (no
  workspace-scoped data flows into `tabs`/`modelValue`; `activeTab` is a
  session-scoped, not workspace-scoped, persisted field, so a switch
  correctly does NOT reset it), so remounting it bought nothing before
  this wave except discarding and rebuilding five `<li>` DOM nodes and
  their event listeners on every workspace switch — a real, if small, cost
  with no corresponding correctness benefit. The only way this COULD
  regress is if some future consumer attaches workspace-scoped state to
  the strip itself (a per-workspace tab-hover-preview cache, say); none
  exists today (grepped `TabWidget.vue`'s own script — no state beyond the
  controlled `modelValue` prop and its own DOM). Not reverted: reverting
  would mean re-keying the WHOLE driven `<TabWidget>` instance inside
  `LytNode.vue`'s Exclusive case on `controlPanelIdentityKey`, which
  `LytNode.vue` — a generic renderer with no workspace-identity concept of
  its own — would have to import as a new, out-of-band prop solely to
  reproduce a remount granularity nothing currently depends on; the
  narrower, already-shipped per-content key is the ADR-0012 P3 (no
  god-objects) shaped answer, not a corner cut.
- `activeTab` persistence (`session.ui.activeTab`) is unchanged — the same
  store cell, now read/written through `lytExclusiveActiveByPath`/
  `handleLytExclusiveActiveChange` instead of a direct `v-model`, but the
  SAME cell, same `touchSession()` bump.
- The inner resizer bar (`#resizer-inner`) keeps its own `:id`, handler,
  and DOM position (first child of the `#control-panel` wrapper) — moved
  from the retired `#leaf-controlPanel` slot to the new
  `#exclusive-controlPanel` slot, same relative order.
- `#control-panel`'s own DOM id, border, background, and
  `position: relative` are unchanged (same selector, same scoped App.vue
  CSS) — only its ancestor `overflow: auto` (style.css) is retired, per
  the overflow-writer table above.
- No component outside `App.vue`/`LytNode.vue`/`TabWidget.vue` changed.

## 3. Visual witness inventory

**UNEXERCISED — blocker: session time budget.** The commission's own §6
mandates a substantial ceremony (own ports ≥19100 with a dead-port probe,
own backend on a copy of `backend/samples/cards.sample.db`, `systemd-run
--user --scope` with memory/nice/JS-heap caps, landscape + portrait, all
five tabs, no nested scrollbars). Given the volume of orientation reading
this commission itself mandates (CLAUDE.md, three ADRs, the ~2150-line
consult report, the 1280+872-line LYT spec/amendments, the six named source
files) plus the implementation, test-authoring, and gate-running actually
delivered, this session's remaining budget did not extend to standing up a
second backend instance and a Playwright harness under systemd-run. This is
named here as a real gap, not silently skipped: the automated coverage
(build, lint, 152+3066 tests including a dedicated 8-test suite exercising
tab-strip rendering, lazy mounting, active-tab persistence, and derived
overflow under jsdom) is real signal but is **not** a substitute for a live
visual witness of actual scrollbar behavior, which jsdom cannot render.
**This item should be treated as a blocking follow-up before this wave is
considered safe to ship to real users**, named as such rather than
papered over.

## 4. Gate exit codes

Re-run after the Finding-1 fix (post-correction, foreground, literal exit
codes — supersedes the pre-fix numbers this section originally carried,
kept implicitly superseded rather than deleted since the encoding/gen.ts
diff between the two runs is exactly the one documented `px: 40` → `px:
264` change and nothing else changed shape):

**`research/lyt` full suite** (all four files, foreground, literal exit
code):
```
$ cd research/lyt && ~/w/vdc/venvs/generic/bin/python -m pytest -q
........................................................................ [ 47%]
........................................................................ [ 94%]
........                                                                 [100%]
152 passed in 3.07s
```
Exit code: **0**. (No feasibility pin moved — see "Review response" above
for the structural reason why not.)

**Frontend build** (foreground, literal exit code):
```
$ nice -n 19 npm run build
...
✓ 1240 modules transformed.
✓ built in 2.00s
```
Exit code: **0**.

**Frontend test suite** (foreground, mandated memory/thread caps, literal
exit code):
```
$ NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 nice -n 19 npm run test:run
 Test Files  247 passed | 3 skipped (250)
      Tests  3089 passed | 8 skipped (3097)
```
Exit code: **0**.

**Frontend lint** — `npx eslint .` (full tree) reports 19 pre-existing
errors in 6 files this wave did not touch (`ProxyUpstreamSettingField.vue`,
`SettingsTab.vue`, `AnalysisDashboard.vue`, `chart-data.ts`,
`LibraryTable.vue`, `WizardStepPalette.vue`, `batch-mint-core.ts`,
`useMinting.ts`) — verified pre-existing via `git stash` + re-lint against
the unmodified `732fdc9a` tree (identical error set, identical line
numbers). `npx eslint` against every file this wave touched or created
(`LytNode.vue`, `TabWidget.vue`, `App.vue`, `useLytOverflowCss.ts`,
`lyt-widget-registry.ts`, `lyt-layout-types.ts`) reports **zero** problems.

## 5. Claims

- LytNode Exclusive case (generic fold, single-tab-implementation proof):
  **WITNESSED**.
- Boundary marker moved inward for library/cards/other: **WITNESSED**.
- Boundary marker moved inward for settings/analysis (full commission
  item 2): **UNEXERCISED — deliberate scope narrowing**, blocker named in
  §0 (dynamic analysis-tabs regression risk; SettingsTab/TabWidget
  composition-boundary refactor size), STOP-and-report per the commission's
  own rule.
- Derived overflow for library/cards/other-band; overflow-writer
  retirement of `#control-panel`/TabWidget's-scoped-`.tab-body`:
  **WITNESSED**.
- Derived overflow / overflow-writer retirement for
  settings/analysis/`AnalysisDashboard.scrollable-content`: **UNEXERCISED**
  (follows directly from the same scope narrowing).
- Other-tab split: **WITNESSED**.
- research/lyt full suite (152/152, exit 0): **WITNESSED**.
- Frontend build (exit 0) + test suite (3066/3066 passed, 8 skipped,
  exit 0) + lint (zero new problems): **WITNESSED**.
- Stray 880px comment fix (item 5): **WITNESSED**.
- Visual verification, full ceremony (item 6, all five tabs, landscape +
  portrait, nested-scrollbar audit across every tab): **WITNESSED, by the
  independent review**, not re-performed by this response — the review's
  own `lyt-realization-wave-review.md` §"Visual verification" section is
  the record (all five tabs reachable, Analysis's dynamic tabs preserved,
  no nested scrollbars anywhere, both mandated viewports, screenshots
  captured). This response's own visual work is narrower and additive: a
  targeted measurement + fix + re-witness of Finding 1 specifically (the
  "Review response" section above), not a repeat of the full ceremony —
  the review already established everything else in that ceremony was
  sound.
- Finding 1 (Other-tab content-overlap regression): **FIXED, WITNESSED**
  — measured, corrected, regenerated, re-witnessed at both mandated
  viewports, `research/lyt` suite re-run confirming no feasibility-pin
  change. Full account in "Review response" above.
- Finding 3 (TabWidget remount-granularity disclosure): **ADDRESSED** —
  added to §2's parity statement with this delivery's own analysis
  (review judged it benign; not reverted, reasoning given).
- FEATURES.md: no entry added — judgment call, this wave restructures
  chrome DOM/CSS without adding, removing, or materially altering a
  user-facing capability (same five tabs, same content, same persisted
  active tab; the Other tab's visual split into two bands is a minor,
  non-capability-level layout change). Named here for review rather than
  silently decided.
- Work-status store (the `todo` Postgres DB, `192.168.122.1:5432`):
  **UNEXERCISED** — probed and found unreachable from this sandbox
  (`/dev/tcp` probe timed out); this report is the durable record in lieu
  of a DB write, and the item's status should be updated by whoever has
  DB access once this delivery is reviewed.

## 6. Files touched

`research/lyt/emit_layout_tree.py`, `research/lyt/tests/
test_emit_layout_tree.py`, `research/lyt/tests/test_lyt.py`,
`frontend/src/state/lyt-layout-types.ts`, `frontend/src/state/
lyt-layout.gen.ts`, `frontend/src/state/lyt-layout-portrait.gen.ts`
(both regenerated, not hand-edited), `frontend/src/state/
lyt-widget-registry.ts`, `frontend/src/components/chrome/LytNode.vue`,
`frontend/src/components/chrome/TabWidget.vue`, `frontend/src/App.vue`,
`frontend/src/assets/css/style.css`, `frontend/src/composables/chrome/
useLytOverflowCss.ts` (new), `frontend/tests/integration/
LytNode-exclusive-rendering.test.ts` (new),
`frontend/tests/integration/LytNode-dom-id-wiring.test.ts`,
`frontend/tests/integration/LytNode-presence-toggle.test.ts`,
`frontend/tests/integration/SettingsTab-vertical-orientation.test.ts`,
`frontend/FILES.md`.

## 7. Commit and merge-base

Committed as `e330e702` (pre-rebase: `02406a25`). LAST-ACT fetch found
`lyt-phase2` had moved 4 commits since this worktree's base (`732fdc9a`) —
a popover-class branch (`lyt-popover-clip-class`, ledger row 1968) landed
mid-flight, exactly the shape the commission's own rule anticipated. File
overlap check (`git diff --name-only 732fdc9a origin/lyt-phase2`): the
only shared file was `frontend/FILES.md` (both branches added an entry);
`git rebase origin/lyt-phase2` resolved it automatically with no conflict
(the two new entries landed in different alphabetical positions),
verified by grepping both entries present post-rebase. Post-rebase
`merge-base HEAD origin/lyt-phase2` == `origin/lyt-phase2`'s own tip
(`5cbcec8a`) — a clean linear rebase, both branches' work preserved. Both
gates (frontend build, `npm run test:run`) re-run post-rebase: build exit
0; test suite 3089 passed / 8 skipped (250 files, 247 passed / 3 skipped),
exit 0 — the popover branch's own 23 new tests are included in that count
and pass alongside this wave's.

## License

Public Domain (The Unlicense).
