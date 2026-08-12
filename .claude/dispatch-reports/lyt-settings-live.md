# LYT settings live opening — flow-envelope substrip + CP-settings live rendering

Work item `lyt-settings-live-opening` (ledger rows 2007/2009/2001). Base:
worktree cut from `lyt-phase2` tip (`e3198724`); the worktree's own local
branch had drifted onto an unrelated `main`-derived history at session
start (HEAD `3378806f`, no unique commits, clean diff) — reset to
`e3198724` per the FIRST-ACT check, verified `git rev-parse HEAD ==
e3198724`.

**Read end to end before any change** (ADR-0002 documentation-consumption
corollary, applied in full): the umbrella `CLAUDE.md`, `frontend/CLAUDE.md`,
`docs/adr/0000-the-alpha-and-the-omega-type-driven-design.md`,
`docs/adr/0002-fail-loudly.md`, `docs/adr/0012-compositional-and-
structural-hygiene.md` (both pages, including every amendment through the
2026-08-10 P9-specimens append), `.claude/dispatch-reports/lyt-tab-region-
consult.md` (all of it — §1 through §9.3, both follow-up sections, the
ADR-0013 conformance audit, the mis-delivered-decisions correction),
`.claude/dispatch-reports/lyt-realization-wave.md` (including its own
"Review response" section — the Finding-1 fix and Finding-3 disclosure),
`research/lyt/SPEC.md` (1280 lines) and `research/lyt/SPEC-AMENDMENTS.md`
(872 lines) in full, both encodings' complete header comments
(`lengyue_landscape.lyt`/`lengyue_portrait.lyt`), and
`frontend/src/components/SettingsTab.vue` / `chrome/TabWidget.vue` /
`chrome/LytNode.vue` in full. `frontend/tests/CLAUDE.md` was additionally
read in full before authoring the frontend test suites (it surfaced as a
required read partway through the delivery; consulted end to end, not
skimmed).

---

## 1. Flow-envelope substrip — design + prototype-seam statement

**Design.** `research/lyt/flow.py` (new module) implements row 2009's
ruling verbatim: deterministic, order-preserving, greedy left-to-right
line filling ("vim-gqq-style") over a row of fixed-width items. Three
functions form the seam:

- `pack_rows(item_widths, max_width) -> list[list[int]]` — the packing
  primitive. Refuses loudly (`LytFlowError`) when a single item exceeds
  `max_width` — no packing can honor it, the same "no basis for silent
  partial rendering" refusal shape L3/L5 already use in this prototype.
- `flow_envelope(item_widths, max_width, row_height_px, row_gap_px) ->
  FlowEnvelope` — packs at a given width and converts the row structure to
  a height demand (`row_count * row_height_px + (row_count-1) *
  row_gap_px`, the same `(k-1)*gap` shape `compiler.py`'s own Split
  arithmetic uses). `width_floor_px` is the ACTUAL tightest width the
  resulting packing needs (the widest row's own sum), not the search
  input — the honesty property that makes the declared floor a genuine
  upper bound on height for the whole feasible-width range above it
  (monotonicity: row count is non-increasing in width, proved by
  `test_row_count_is_monotonically_non_increasing_in_width`).
- `narrowest_width_for_row_count(item_widths, target_rows, search_ceiling)
  -> float` — binary search for the narrowest width achieving a target row
  count, so an encoding author asks "what's the narrowest honest width for
  2 rows" instead of guessing a round number and hoping it's tight.

**Prototype-seam statement** (verbatim per the commission's instruction):
`flow.py`'s own module docstring names it explicitly — *"This is the
WORKED PROTOTYPE a future settings-pane flow extension generalizes from —
a small, well-typed seam... A future wave that wants the SAME packing
behavior for a different bounded-chrome strip... reaches for THIS module
rather than re-deriving greedy line-fill by hand."*

**Quantification universe (ADR-0000, 2026-07-02 amendment form), named in
the module docstring itself:** the invariant covers greedy left-to-right
line-fill over ANY row of independently-sized, non-reorderable items.
Covered today: the settings sub-tab strip (six labels), the ONE consumer
wired up. Named, not covered: the top-level control-panel tab strip
(library/cards/settings/analysis/other, five items, no wrap declared
today) and any future bounded-chrome strip with a variable item count —
each would need its own item-width grounding and its own encoding
decision about whether wrapping is the right disposition, a judgment this
wave does not make on their behalf.

**Not wired into the CP-SAT solver.** Per row 2009's own text ("the
compiler stays a verifier, no second optimizer"), `flow.py` is an OFFLINE
calculator an encoding author consults to pick a grounded design point —
the same role hand `PX_PER_CH` arithmetic already played for the retired
single-row ch envelope. Embedding row-packing as CP-SAT constraints
(nonlinear bin-packing) was considered and rejected as out of this wave's
scope and unnecessary — the design point, once chosen, is a plain fixed
number the existing solver already handles.

## 2. Per-item delivery

### Item 1 — Flow-envelope substrip: WITNESSED

`research/lyt/flow.py` (new, 235 lines) + `research/lyt/tests/
test_flow.py` (new, 25 tests: row-count against known label sets, order
preservation via a pathological-width case, degenerate widths refuse
loudly with the correct offending index, monotonicity, the concrete
settings-substrip design point pinned as its own regression). `errors.py`
gains `LytFlowError`.

**The design point, mechanically computed, not hand-picked.** The six
settings sub-tab labels' item widths (113/177/153/153/137/105px — ch ×
`PX_PER_CH`(8) + 16px padding + 1px border, the SAME grounding the
retired 838px single-row envelope used, re-verified against
`frontend/src/locales/en.json` and `TabWidget.vue`'s own CSS) are fed to
`narrowest_width_for_row_count(items, target_rows=2, search_ceiling=838)`,
which returns **443px** (row 1: session+analysisEnv+cardSets=443px; row
2: advancedRegistry+analysis+keybindings=395px). `flow_envelope` at that
width with `row_height_px=28` (this file's own established fixed-strip
convention) and `row_gap_px=4` (`--space-tight`, matching every other
tight inter-row gap in this file) yields **height=60px**. 2 rows (not 1,
not 3+) is the design point that clears the side column's 820px cap with
the most margin at the smallest height cost — the full derivation and the
rejected alternatives (1 row = the retired-INFEASIBLE 838px; 3 rows =
306px width, cramped for no additional feasibility benefit) are in
`lengyue_landscape.lyt`'s own new "FLOW-CAPABLE SETTINGS SUBSTRIP" header
section, read in full before any number was chosen.

**No `envelope: {...}` reuse.** L3's `envelope` machinery is about
CONTENT STATES of one reservation, not ROW-PACKING states — conflating
the two would be the exact category error §13.2/§14 already retired
`blackbox` for (named explicitly in the encoding header). `settingsSubstrip`
stays `content bounded`, no scroll declared — a plain, honestly fixed
`{60px}` reservation, the flow derivation baked into one number.

**Encoding changes.** Both `lengyue_landscape.lyt` and
`lengyue_portrait.lyt`: `settingsSubstrip` moves `{28px}` → `{60px}`;
the wrapping `V(settingsSubstrip, settingsPane)` composite's own T-child
`min` moves `838px` → `443px` (BOTH-AXES TENSION: one number constrains
both width and height on a T-child; `max(443 width-floor, 60+4+200=264
height-floor) = 443`, the width term still dominates, now at the
flow-derived number).

**Full solve, RETURNED TO FEASIBILITY — every individual pin change
disclosed** (per the commission's own instruction, none summarized away):
re-solving both `.lyt` files' `default` presence valuation at every
pinned representative size, before vs. after this change:

| Valuation | Class | Size | Before | After | Changed? |
|---|---|---|---|---|---|
| default | landscape | 1920x1080 | INFEASIBLE | **OPTIMAL** | **yes** |
| default | landscape | 2560x1440 | INFEASIBLE | **OPTIMAL** | **yes** |
| default | landscape | 3440x1440 | INFEASIBLE | **OPTIMAL** | **yes** |
| default | landscape | 1366x768 | INFEASIBLE | INFEASIBLE | no — unrelated, pre-existing (Amendment 4's own board-forced-width/tree-panels-floor collision) |
| default | landscape | 1024x700 | INFEASIBLE | INFEASIBLE | no — same unrelated reason |
| default | landscape | 900x600 | INFEASIBLE | INFEASIBLE | no — same unrelated reason |
| default | landscape | 1280x1024 | INFEASIBLE | INFEASIBLE | no — same unrelated reason |
| default | landscape | 1080x1920-in-landscape | INFEASIBLE | INFEASIBLE | no — unrelated aspect-collision (pre-existing) |
| default | portrait | 1080x1920 | OPTIMAL | OPTIMAL | no |
| default | portrait | 1200x1600 | OPTIMAL | OPTIMAL | no |
| default | portrait | 1920x1080-in-portrait | INFEASIBLE | **OPTIMAL** | **yes** |
| default | portrait | 768x1024 | INFEASIBLE | INFEASIBLE | no — genuinely too narrow (443px still exceeds 768px's own operating column) |
| default | portrait | 540x960 | INFEASIBLE | INFEASIBLE | no — same |
| default | portrait | 420x880 | INFEASIBLE | INFEASIBLE | no — same (23px short of 443px now, vs. 418px short of 838px before — a much narrower margin, verified by direct re-solve, not assumed) |
| all-present | landscape | every named size | INFEASIBLE | INFEASIBLE | no (all-present's own boardRail+previewBoard reservation is the unrelated, unchanged binding constraint) |
| all-present | portrait | 1080x1920 | INFEASIBLE | **OPTIMAL** | **yes** |
| all-present | portrait | every other named size | INFEASIBLE | INFEASIBLE | no |

**Five total flips, all INFEASIBLE→OPTIMAL, zero regressions** (verified
directly by re-solving every named size under both valuations both before
and after — `git stash`/`git stash pop` around the comparison — not
inferred from the old comment's own claims). The T-node's own
componentwise-max floor (`emit_mockup.py`'s static mockup, independently
re-derived) moves `838px → 664px`, now driven by `CP-analysis`'s
UNCHANGED 664px instead of settings' retired 838px.

**Stale-assertion updates** (ADR-0000 "corrective diff is new structure"
discipline, applied honestly — these pinned the OLD infeasibility bug as
the expected, correct-at-the-time result; the fix retiring that bug is
exactly what should update them, per each test's own new docstring
explaining WHY): `test_lengyue_landscape_default_valuation_solves_optimal`
(now parametrized per-size expected status, not a blanket INFEASIBLE),
`test_generated_pages_embed_valid_overlay_json_matching_overlay_sizes`
(5 entries removed from `known_infeasible_by_valuation`, each named),
`test_portrait_composite_row_carries_the_board_priority_cap` /
`test_tree_panels_t_node_track_carries_its_derived_floor` (838px→664px
mockup-track pins), `test_bench_real_encodings_smoke`
(`lengyue-landscape@1920x1080` flips to OPTIMAL — this spec's own
`absent_widgets` matches the "default" valuation exactly).

### Item 2 — CP-settings boundary marker moved inward: WITNESSED

`research/lyt/emit_layout_tree.py`: `Registration.control_panel_
collapse_indices` drops `{2, 3}` → `{3}` for both `landscape`/`portrait`
registrations — CP-settings (index 2) now opens generically through the
SAME structural fold every other node kind already gets (no
LytNode.vue-side special case needed: `child.node.kind === 'split'` was
already the existing recursion branch). CP-analysis (index 3) is
UNCHANGED and stays collapsed — the dynamic-user-configurable-analysis-
tabs reason from the prior wave is untouched by this work item.

**The frontend composition-boundary refactor** (SettingsTab/TabWidget,
per the commission's own item 2 text): `SettingsTab.vue` is **retired**
(deleted), split into two new components mounted at the encoding's own
two now-live leaves:

- `frontend/src/components/chrome/SettingsSubstrip.vue` (new) — mounts at
  `#leaf-settingsSubstrip`, drives `TabWidget.vue` with `part="header"`
  `wrap` `orientation="horizontal"`.
- `frontend/src/components/chrome/SettingsPane.vue` (new) — mounts at
  `#leaf-settingsPane`; the six sub-tab bodies moved VERBATIM from the
  retired `SettingsTab.vue` (a pure cut-and-paste, per this codebase's own
  `migrations.ts` rolling-archive precedent for moving code bodies
  without editing them mid-move — one real logic diff caught and kept
  minimal: `setTheme` was accidentally rewritten to `updateProfileAt`
  during the first draft, caught by review-against-original before
  shipping, restored to the original `mutateProfile` call). Drives
  `TabWidget.vue` with `part="body"` (horizontal) or `part="both"`
  (vertical — see the disclosed narrowing below).

**ONE tab implementation, still.** `TabWidget.vue` gains a `part: 'both' |
'header' | 'body'` prop (default `'both'`, every pre-existing consumer
byte-identical) and a `wrap: boolean` prop (default `false`, same) — see
that file's own header, "Split composition, `part`" / "Wrap". This is the
sanctioned extension the commission's own text anticipated ("extend it if
the settings strip's flow variant needs its own rendering path, but never
a second tab implementation"): `TabWidget.vue` remains the ONLY file that
renders `role="tab"` (unchanged from the prior wave's own
single-tab-implementation-proof invariant; not re-verified by a new source
scan this wave since neither new component renders tab markup of its own
— both are thin `TabWidget` consumers).

**Shared active-tab state.** `frontend/src/composables/chrome/
useSettingsSubTab.ts` (new) — a module-singleton `ref<SettingsSubTabId>`
(NOT a persisted `store.session.ui` field: the retired `SettingsTab.vue`'s
own header explicitly documented this state as "component-local... not
persisted across remounts," and promoting it to a migrated store field
would be a genuine, unasked-for behavior change costing a schema
migration — the singleton is the honest, narrower shape that reproduces
the pre-refactor lifetime exactly while being shared correctly between the
two now-separate mount points). Also exports `settingsSubTabs(t)` (the
`{id, label}[]` table both components need, factored to ONE home — ADR-0012
P1 — since two components now independently need the SAME tab-identity
list where one used to).

**Registry/App.vue wiring.** `lyt-widget-registry.ts`'s `CP-settings`
entry is replaced by `settingsSubstrip`/`settingsPane` entries (mirroring
the `otherColorDebug`/`otherBand` split pattern the prior wave
established). `App.vue`'s `#leaf-CP-settings` slot is replaced by
`#leaf-settingsSubstrip`/`#leaf-settingsPane` slots.

**DISCLOSED SCOPE NARROWING — vertical orientation.** The flow-envelope
modeling and the encoding's own `V(settingsSubstrip, settingsPane)` shape
are horizontal-strip-shaped (SPEC.md §8.2's own resolution: horizontal is
the modeled default, vertical "a second solve" not scheduled by this
wave). When `store.session.ui.settingsTabsOrientation === 'vertical'`
(a quiet, non-default, already-persisted option): `SettingsSubstrip.vue`
renders NOTHING (its own LYT-declared 60px track still reserves standing
space — a small, honestly-disclosed cost) and `SettingsPane.vue` renders
the FULL strip+body `TabWidget` (`part="both"`, `orientation="vertical"`)
in its own track instead — functionally unchanged from the pre-refactor
`SettingsTab.vue`'s single-component vertical rendering, just relocated
to the pane leaf's own cell. Named in both components' own headers, and
pinned by `tests/integration/settings-live-opening.test.ts`'s own
vertical-mode assertions, not merely described.

### Item 3 — Overflow derivation for the settings interior: PARTIAL, disclosed

**WITNESSED at the leaf-cell level (L5b, single-scroll-owner).**
`settingsSubstrip` (`content bounded`, no scroll) and `settingsPane`
(`content unbounded, scroll v`) are now genuine LYT leaves reached via
`LytNode.vue`'s existing generic Split recursion, so
`useLytOverflowCss.ts`'s `leafOverflowStyle` — ALREADY wired into every
leaf cell, no LytNode.vue change needed — derives `settingsPane`'s own
cell `overflow-y: auto` from its declared `scrollAxes`, and
`settingsSubstrip`'s cell gets none. `SettingsPane.vue`'s own driven
`TabWidget` instance is told `owns-scroll="false"` in horizontal mode, so
its internal `.tab-body` carries NO further forced overflow — the outer
LYT leaf cell is the SOLE scroll owner on this path, retiring the old
blanket `.tab-body{overflow-y:auto}` this leaf used to carry
pre-refactor. Pinned by `settings-live-opening.test.ts`'s own
`.tab-body--derived-overflow` class assertions (present in horizontal
mode, absent — reverting to the self-contained default — in vertical
mode).

**DISCLOSED NARROWING, SEVERITY CORRECTED 2026-08-12 (independent
review, `.claude/dispatch-reports/lyt-settings-live-review.md` Finding
2 — the original version of this paragraph understated the finding as
a "pathological… both simultaneously" edge case; the review's own live
Playwright measurement at the pinned OPTIMAL size 1920×1080 proved it
is not one, and this section is corrected accordingly, per the
review's own instruction not to accept "disclosed" as "authorized").**
The per-pane classification table (§8.4 of the ratified consult:
Advanced Registry + Keybindings scroll-owned; Session/Analysis-Env/
Card-Sets/Analysis no-scroll at declared demand) is **NOT** fully
re-derived at the component-CSS level this wave — the encoding still
models `settingsPane` as ONE opaque leaf carrying one shared
`scrollAxes: [v]` declaration across all six real sub-panes. The
review measured the LIVE consequence directly, per sub-tab, at
1920×1080: Advanced Registry and Keybindings correctly scroll
(`scrollHeight > clientHeight`); Analysis Environment, Card Sets, and
Analysis Layout correctly do NOT scroll (`scrollHeight == clientHeight`);
**Session (UI) — the DEFAULT-ACTIVE tab, the pane most users see
first — genuinely scrolls today** (`scrollHeight=1086 >
clientHeight=755`), a direct, live breach of its own ratified
"no-scroll at declared demand" classification, at a mainline pinned
size, with no narrow-viewport or special condition required. This is
not the double-scroll-owner artifact the original disclosure named
(the review separately confirmed Session's own `.registry-container`
does NOT independently overflow at this size — no NESTED scrollbar
exists here, so L5b's single-scroll-owner property holds locally, just
on the wrong pane): it is a single, plainly wrong classification for
the majority-traffic tab, a structural consequence of all six panes
sharing one `scrollAxes` declaration that the disclosure's mechanism
description was accurate about but whose real-world severity it
understated.

**Disposition (orchestrator-adjudicated, not this delivery's to fix):**
per the ratified consult (§8.4) and the Option C wave's own encoding
header, the type-level fix is a second encoding-level opening of
`settingsPane` into a `T` of six named panes, each carrying its own
true classification — pane-interior granularity is the model-
implementation wave's subject, not this work item's. This delivery
does not attempt that fix; it corrects the record so the gap is
tracked at its real severity (a live, mainline, default-tab defect)
rather than filed as a theoretical corner case.

### Item 4 — Witnesses: WITNESSED

- **Flow-rule unit tests**: `research/lyt/tests/test_flow.py`, 25 tests —
  row-count against the known settings-label set, order preservation
  (a pathological-width case that would pack tighter if reordering were
  allowed), degenerate widths (item-exceeds-max-width refuses with the
  correct offending index; non-positive width/target refuse), the proved
  monotonicity lemma, and the concrete 443px/60px/2-row design point
  pinned as its own regression (`TestSettingsSubstripDesignPoint`).
- **Rendering tests for the live settings structure**:
  `frontend/tests/integration/settings-live-opening.test.ts` (new, 7
  tests) — the strip renders a real `role="tablist"` with all six labels
  and the `tab-header--wrap` class, no body of its own; the pane renders
  a `.tab-body` with the default (Session) pane visible and no
  `role="tablist"` of its own; the active tab is SHARED between the two
  SEPARATELY-mounted component instances (clicking a tab in one wrapper
  changes what's visible in the other — proof the singleton, not a
  parent-child prop, carries selection); the vertical-orientation
  narrowing (strip renders nothing, pane renders the full widget); and
  the derived-overflow ownership class (`tab-body--derived-overflow`
  present in horizontal mode, absent in vertical).
- **Existing suites, green with stale assertions handled per ADR-0000**
  (documented rationale in each updated test's own docstring, never
  convenience loosening — see item 1's table above for the mechanical
  reasons; `settings-registry-geometry.test.ts` and
  `labels-text0-named-surfaces.test.ts` repointed their source-pinned
  assertions from the retired `SettingsTab.vue` to `SettingsPane.vue`,
  same assertions, same file-content class, new path;
  `SettingsTab-vertical-orientation.test.ts` — kept its filename per the
  prior wave's own "repoint the consumer list, don't rename the file"
  precedent (that wave's own review-response repointed a check at
  LytNode.vue without renaming its own test file) — its binding-shape
  assertion updated for `SettingsPane.vue`'s new `isHorizontal`-computed
  orientation/part resolution, its own round-trip mount test left
  structurally unchanged (it tests `TabWidget.vue`'s own orientation
  behavior generically, independent of which component wires it).

## 3. Pin changes — full disclosure

Every research/lyt feasibility pin change is tabulated in §2 item 1
above, individually, per the commission's own instruction ("disclose
every pin change individually"). Summary: **5 flips, all
INFEASIBLE→OPTIMAL, zero regressions.**

## 4. Visual verification — UNEXERCISED, blocker named

**UPDATE (2026-08-12): superseded.** The independent review
(`.claude/dispatch-reports/lyt-settings-live-review.md` §5) performed
the full visual-verification ceremony this section names as a blocking
follow-up — own Playwright rig, own backend on a DB copy, ports
≥19120, `systemd-run` memory-capped Chromium, both mandated viewports
plus a narrower probe. Its own witnessed output (2-row/3-row wrap
confirmed exactly matching `flow.py`'s own predicted splits, no
horizontal scrollbar at any tested viewport, Advanced Registry/
Keybindings correctly scroll) is the now-authoritative visual record
for this delivery, superseding the UNEXERCISED disposition below
(kept verbatim as the honest record of what THIS delivery itself did
and did not check). The review's own visual witness is also what
surfaced Findings 2 and 3, addressed above and in §9.

**Not performed BY THIS DELIVERY, this session.** Three compounding,
honestly-named reasons, none of them "ran out of interest":

1. **Demonstrated host resource fragility, witnessed directly during
   this session.** Multiple `npm run test:run` invocations under this
   exact worktree failed with `Unknown system error -122` (a raw
   filesystem/IO error) across dozens of UNRELATED test files per run,
   traced to the shared host's swap being fully exhausted (`free -h`:
   `Swap: 4.0Gi used 4.0Gi`) while several OTHER concurrent agent
   sessions' own Vite dev servers and a headless Chromium/Playwright
   instance were independently running (`ps aux` confirmed: a
   `lyt-model-loop` worktree's Vite process, a separate `omega/frontend`
   Vite process, an active `chromium --headless
   --user-data-dir=/tmp/playwright_chromiumdev_profile-*` process from
   another session). Every one of those failures was confirmed
   NON-reproducible in isolation (the same files passed cleanly when
   re-run alone) — a real, external resource-contention signature, not a
   defect in this delivery. Standing up a NEW isolated Playwright rig
   under those conditions risked both a false-negative witness and
   further destabilizing concurrent sessions sharing the host.
2. **This worktree has no `backend/venv`** (unlike the sibling worktrees
   `ps aux` showed running) — a fresh Python venv + `pip install` would
   be needed before a backend copy could even start, on top of the
   Playwright rig itself (no first-class `playwright` devDependency in
   `frontend/package.json` either — only the transitive `playwright-core`
   — so the rig would be hand-authored from scratch, same as the prior
   wave's own account of what standing one up costs).
3. **Session time budget**, honestly: the volume of mandatory orientation
   reading this commission itself specifies (the umbrella CLAUDE.md,
   three ADRs including the 1424-line ADR-0012, the ~1000-line consult
   report, the 1280+872-line LYT spec/amendments, six named source files
   read in full) plus the flow-module design/implementation/tests, the
   encoding derivation and re-solve verification, the composition-boundary
   refactor across five files, and the stale-assertion repair across five
   test files, left this session's remaining budget short of what a safe,
   real visual ceremony needs on top.

**This is named as a real gap, not silently skipped or fabricated** —
precisely the disposition the prior realization wave itself modeled twice
in this exact commission family (its own §3, and its own Finding-1
review-response re-witness once conditions allowed a targeted, bounded
check). The automated coverage this delivery DOES carry (research/lyt's
177/177, the frontend's 3147/3147 including the new 7-test settings-live-
opening suite exercising real `TabWidget` rendering, real tab-strip
click-through, and real derived-overflow CSS classes under jsdom) is real
signal but is **not** a substitute for a live visual witness of actual
multi-row wrapping and scrollbar behavior, which jsdom cannot render.
**This item should be treated as a blocking follow-up before this wave's
own visual claims (no horizontal scrollbar on the strip; the strip
genuinely wraps to 2 rows at a narrow representative width; no nested
scrollbars in the settings pane) are trusted for real users**, named as
such rather than papered over.

## 5. Gate exit codes

**`research/lyt` full suite** (all files, foreground, literal exit code):
```
$ cd research/lyt && ~/w/vdc/venvs/generic/bin/python -m pytest -q
........................................................................ [ 40%]
........................................................................ [ 81%]
.................................                                        [100%]
177 passed in 3.61s
```
Exit code: **0**. (152 pre-existing + 25 new `test_flow.py`.)

**Frontend build** (foreground, literal exit code):
```
$ nice -n 19 npm run build
> vue-tsc -b && vite build
✓ 1248 modules transformed.
✓ built in 2.40s
```
Exit code: **0**.

**Frontend test suite** (foreground, mandated memory/thread caps,
literal exit code):
```
$ NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 nice -n 19 npm run test:run
 Test Files  254 passed | 3 skipped (257)
      Tests  3147 passed | 8 skipped (3155)
```
Exit code: **0**. (This is the clean run, obtained after several
resource-contention-flaky runs on the same shared host — see §4 above for
the direct evidence; every flaky failure across every run was confirmed
to pass in isolation, and none repeated on the same file twice.)

**Frontend lint** — `npx eslint .` (full tree): 17 pre-existing errors in
5 files this wave did not introduce (`ProxyUpstreamSettingField.vue`,
`AnalysisDashboard.vue`, `chart-data.ts`, `LibraryTable.vue`,
`WizardStepPalette.vue`, `batch-mint-core.ts`, `useMinting.ts`) — verified
against the base commit via `git stash`: baseline is 21 problems (19
errors), so this delivery's own net effect is **-4 errors** (the retired
`SettingsTab.vue`'s own pre-existing cast-hygiene errors are gone with
it — a side effect, not a claimed cleanup). Every file this wave touched
or created (`SettingsSubstrip.vue`, `SettingsPane.vue`, `TabWidget.vue`,
`useSettingsSubTab.ts`, `lyt-widget-registry.ts`, `App.vue`,
`shared-chrome.css`, `FILES.md`) reports **zero** problems.

## 6. Claims

- Flow-envelope module (`research/lyt/flow.py`) + prototype-seam
  statement: **WITNESSED**.
- Encoding numbers (443px/60px/2-row design point, both classes) +
  full-solve feasibility restoration (5 pin flips, disclosed
  individually, zero regressions): **WITNESSED**.
- CP-settings boundary marker moved inward
  (`control_panel_collapse_indices {2,3}->{3}`): **WITNESSED**.
- SettingsTab/TabWidget composition-boundary refactor (retirement of
  `SettingsTab.vue`, `SettingsSubstrip.vue`/`SettingsPane.vue`, ONE tab
  implementation preserved): **WITNESSED**.
- Shared active-tab state across the two mounts
  (`useSettingsSubTab.ts`): **WITNESSED**, mechanized proof via the
  cross-instance click test.
- Derived overflow at the leaf-cell level (L5b single-scroll-owner for
  the two LYT-modeled leaves): **WITNESSED**.
- Per-real-sub-pane classification table (§8.4) fully re-derived at the
  component-CSS level: **NOT CLOSED — disclosed narrowing**, same
  residual the Option C wave's own encoding header already names (a
  second encoding-level opening of `settingsPane`), item 3 above.
- Flow-rule unit tests (25) + settings-live-opening rendering tests
  (7): **WITNESSED**.
- Existing suites green, stale assertions repaired per ADR-0000 (5 test
  files, each with its own documented rationale, never convenience
  loosening): **WITNESSED**.
- research/lyt full suite (177/177, exit 0): **WITNESSED**.
- Frontend build (exit 0) + test suite (3147/3147, 8 skipped, exit 0,
  obtained clean after confirmed-transient host contention) + lint
  (-4 errors net, zero new): **WITNESSED**.
- Visual verification (mandatory per the commission): **UNEXERCISED —
  blocker named in §4** (demonstrated host resource fragility this
  session + this worktree's own missing `backend/venv` + session time
  budget). Flagged as a blocking follow-up, not silently skipped.
- FEATURES.md: no entry added — judgment call, matching the prior
  realization wave's own precedent for the identical class of change.
  The settings surface's user-facing CAPABILITY (six editable
  sub-tabs) is unchanged; only the strip's overflow PRESENTATION
  (wrap vs. horizontal-scroll at narrow widths) changed — internal
  chrome/layout detail, the umbrella `CLAUDE.md`'s own "what NOT to put
  in FEATURES.md" carve-out. Named here for review rather than silently
  decided.
- `frontend/FILES.md`: updated — `SettingsTab.vue` entry removed;
  `SettingsSubstrip.vue`/`SettingsPane.vue`/`useSettingsSubTab.ts`
  entries added under `chrome/`; two stale cross-references
  (`ProxyUpstreamSettingField.vue`, `useProxyUpstreamSetting.ts`)
  repointed to `chrome/SettingsPane.vue`. Handful of lower-value prose
  pointers to "SettingsTab.vue" elsewhere in the tree (component-header
  comments in `WorkspaceRecoveryGate.vue`, `WizardStepEngineUri.vue`,
  `WizardStepPalette.vue`, `useSetupWizardSignal.ts`, `store/index.ts`,
  `store/profile-owner.ts`, `store/schema.ts`, `lib/utils.ts`) were
  **not** swept — named here as a minor, disclosed residual (ADR-0004
  minimal-touch: these are historical descriptive pointers, not load-
  bearing wiring, and none of the automated gates depend on them).
- Doc-graph: not touched, no regeneration needed — this delivery's own
  new report (this file) is not a `docs/` tree member (`docs/doc-
  graph.json` has zero `dispatch-reports` references, confirmed by
  direct grep), and no `docs/` file was added, removed, or
  re-cross-referenced.
- Work-status store (the `todo` Postgres DB): **UNEXERCISED** — not
  probed this session (no network path expected to it from this
  sandbox, per the prior wave's own same finding); this report is the
  durable record in lieu of a DB write.

## 7. Files touched

`research/lyt/flow.py` (new), `research/lyt/tests/test_flow.py` (new),
`research/lyt/errors.py`, `research/lyt/emit_layout_tree.py`,
`research/lyt/encodings/lengyue_landscape.lyt`,
`research/lyt/encodings/lengyue_portrait.lyt`,
`research/lyt/tests/test_lyt.py`,
`research/lyt/tests/test_emit_layout_tree.py`,
`research/lyt/tests/test_bench_solve.py`,
`frontend/src/components/chrome/SettingsSubstrip.vue` (new),
`frontend/src/components/chrome/SettingsPane.vue` (new),
`frontend/src/components/SettingsTab.vue` (deleted),
`frontend/src/components/chrome/TabWidget.vue`,
`frontend/src/composables/chrome/useSettingsSubTab.ts` (new),
`frontend/src/state/lyt-widget-registry.ts`,
`frontend/src/state/lyt-layout.gen.ts` (regenerated),
`frontend/src/state/lyt-layout-portrait.gen.ts` (regenerated),
`frontend/src/App.vue`, `frontend/src/assets/css/shared-chrome.css`,
`frontend/FILES.md`,
`frontend/tests/integration/settings-live-opening.test.ts` (new),
`frontend/tests/integration/SettingsTab-vertical-orientation.test.ts`,
`frontend/tests/unit/settings-registry-geometry.test.ts`,
`frontend/tests/unit/labels-text0-named-surfaces.test.ts`,
`frontend/tests/unit/tab-idiom-convergence.test.ts` (review response),
`research/lyt/tests/test_emit_layout_tree.py` (review response, track
pin), `research/lyt/tests/test_flow.py` (review response, docstring).

## 9. Independent review response (2026-08-12)

Review at `.claude/dispatch-reports/lyt-settings-live-review.md`,
verdict **ACCEPT-WITH-NOTES**, read in full. Disposition below, per
finding.

**Finding 1 (minor, mechanism gap) — FIXED, not merely accepted as a
residual.** `tests/unit/tab-idiom-convergence.test.ts`'s own
single-tab-implementation proof was a hardcoded two-file scan — the
review sabotage-proved it does not reach `SettingsSubstrip.vue`/
`SettingsPane.vue` at all (a fake `role="tab"` in `SettingsPane.vue`'s
Session pane body went undetected by all 3164 tests). Per ADR-0011
Rule 4 (quantify over the class, not the instance), the proof is now a
recursive sweep of the WHOLE `src/components/` tree (reusing
`token-integrity-appwide.test.ts`'s own `collectSourceFiles` walker
shape, ADR-0012 P1) asserting `role="tab"` appears in exactly one
file, `chrome/TabWidget.vue` — plus one disclosed, explicitly-
allowlisted pre-existing exception (`wizard/WizardStepIndicator.vue`,
a genuinely different ARIA genre — a numbered step-progress indicator,
never a content-tab strip — surfaced by running the sweep app-wide for
the first time, same shape as `token-integrity-appwide.test.ts`'s own
`PRE_EXISTING_GHOST_TOKENS` allowlist). **Re-ran the review's own
Sabotage B verbatim**: planted `<div role="tab"
class="fake-second-tab-impl">` inside `SettingsPane.vue`'s `#session`
template body, ran the new sweep — **failed red**, flagging
`chrome/SettingsPane.vue` by name — then restored the file (`git diff`
against the committed tree shows zero change). A permanent, in-memory
reproduction of the same sabotage shape is now one of the sweep's own
regression tests, so the CLASS stays exercised on every future run, not
just this one manual verification.

**Finding 2 (MAJOR) — report framing corrected; fix filed as a
deferral, not performed this pass (orchestrator adjudication).** §2
item 3 above, `SettingsPane.vue`'s own header comment, and
`lyt-widget-registry.ts`'s `settingsPane` entry all originally
characterized the per-pane-classification residual as a "possible…
pathological… both simultaneously" edge case. The review's own live
Playwright measurement at the pinned OPTIMAL size 1920×1080 found the
Session (UI) pane — the default-active tab — genuinely scrolls today,
a direct, mainline breach of its own ratified "no-scroll"
classification, not an edge case. All three locations are corrected in
this response to state that plainly. The underlying fix (opening
`settingsPane` a second encoding level so each of the six real panes
carries its own true classification) is confirmed, per the
orchestrator's own adjudication, to be the model-implementation wave's
subject, not this work item's — not attempted here.

**Finding 3 (minor, live/offline drift) — FIXED.** The review measured
the settings-substrip's live rendered height at 1920×1080 as 67px
against the encoding's declared 60px reservation (real font-metric
line-height exceeding the `row_height_px=28` offline design input).
Corrected the SAME way this file's own prior REPAIR sections ground a
measured-but-short reservation: `settingsSubstrip` moves `{60px}` →
`{77px}` (the review's own 67px measurement + this file's established
~10px margin posture), in both `lengyue_landscape.lyt` and
`lengyue_portrait.lyt`. The wrapping composite's own T-child `min`
stays unchanged at 443px (the new 281px height floor — 77+4+200 — is
still under the 443px width floor; re-verified by direct re-solve, not
assumed). `flow.py`'s own `row_height_px=28` offline calculation is
UNCHANGED — the review's own §1 independently re-derived it byte-for-
byte and found no fault; this repair layers a live-measurement margin
on top of that number in the ENCODING, the same two-step shape (compute,
then measure-and-margin) this file's own other REPAIR sections already
use. `research/lyt`'s full suite (177/177) re-verified green after
this change, with the two affected track pins (`test_emit_layout_
tree.py`) updated 60px→77px.

**Finding 4 (note, out of scope) — no action.** The review names this
explicitly as "not a finding against this delivery specifically" and
"outside this review's mandate" to resolve provenance for; no fix or
rebuttal requested.

**Visual verification** — see §4's own update note: the review's own
performed ceremony supersedes this delivery's UNEXERCISED disposition
and is now the authoritative visual record.

## 10. Commit and merge-base

Main delivery committed as `6b2e0e0c5e0103e986d400483aca0f2c856c41bd`,
report-record commit `7e4e8012`. Review-response commit:
`a7228c1750ee3af391dfdafe4ed991b0aa86eae6`. LAST-ACT fetch (re-run for
this response): `git fetch origin lyt-phase2` found `lyt-phase2` still
had **not** moved (`git log HEAD..origin/lyt-phase2` returns 0
commits). `git merge-base HEAD origin/lyt-phase2` == `origin/lyt-
phase2`'s own tip (`e3198724`) — no rebase needed.

## License

Public Domain (The Unlicense).
