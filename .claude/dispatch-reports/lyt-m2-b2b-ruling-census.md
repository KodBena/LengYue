# LYT M2 stage B2b — the ruling-basket census

Commission: M2 stage B2b (ledger rows 2073/2108/2151, the ruling-basket
census), branch `lyt-phase2-b2b` (cut from `origin/lyt-phase2` at
`2f4cd687`, since the literal name `lyt-phase2` was already checked out
in the main worktree — see "Base freshness" below), worktree
`.claude/worktrees/agent-a12e562c46f5d0b6f`. This report is the
deliverable named in the brief.

## Base freshness (FIRST ACT)

`git fetch origin` resolved `origin/lyt-phase2` to `2f4cd687`. The
worktree's own default branch (`worktree-agent-a12e562c46f5d0b6f`) was
cut from an unrelated, older base (`3378806f`, main-line history) —
`git merge-base --is-ancestor 2f4cd687 HEAD` failed on it. The literal
branch name `lyt-phase2` was unavailable (already checked out in the
main worktree `/home/bork/w/omega`), so a differently-named branch,
`lyt-phase2-b2b`, was cut directly off `origin/lyt-phase2` at `2f4cd687`
— the same disclosed-deviation shape stages B1/B2a both report for the
same reason. `git merge-base --is-ancestor 2f4cd687 HEAD` confirmed
after the switch.

## Orientation reading (end to end, per ADR-0002/CLAUDE.md)

`research/lyt/SPEC.md` (full, including its now-corrected §1/"Status of
the other LYT documents" sections), `research/lyt/SPEC-AMENDMENTS.md`
(full, Amendments 1-9), both `encodings/lengyue_landscape.lyt` /
`lengyue_portrait.lyt` (full, including every header comment),
`.claude/dispatch-reports/lyt-m2-substrate-port.md` (full, including its
own fix-pass section), `lyt-m2-b1-derived-orientation.md` (full),
`lyt-m2-b2a-encoding-compliance.md` (full) — all read completely before
any code was written. Ledger rows 2073, 2108, 2134, 2151 read directly
via `./autoharn led show <id>` (their exact statements are quoted
verbatim in the sections below) since none of the three model-side
rulings this stage implements had yet been transcribed into any
committed document. `.claude/dispatch-reports/lyt-tab-region-consult.md`
§8.4's assignment table (the settings sub-pane classification) was
re-consulted for item 3. A mid-flight amendment from the coordinator
(default/demoted are the feasibility-bearing valuations, all-present is
a diagnostic upper envelope; mobile-first disposition on portrait
infeasibility) is incorporated into this report's framing below and did
not require reopening any already-closed item.

## Summary — per-item found vs. changed

### Item 1 — three-vocabulary engine-status decomposition (ledger row 2073)

**Ruling, quoted verbatim (row 2073):** *"the engine status line is a
MISCATEGORIZATION as one unit ('metric band'); the compliant
decomposition is three vocabularies: {winrate, lead} | {pps, latency,
watchdog} | {queue}. Model consequence: three distinct leaves/groups
with their own demand bases, activity states, and candidate homes — not
one strip that must fit somewhere."*

**Found:** `A_engine[go, action+info]` was a single leaf conflating the
connect/disconnect + engine-controls ACTION cluster with all six INFO
readouts (winrate, scoreLead, pps, latency, watchdog, queue) in one
`action+info` facet bag. No literal string `"metric band"` appears
anywhere in either encoding, but the single-leaf shape IS that framing
under a different name — the miscategorization the ruling names.

**Changed:** Both encodings' `A_engine` leaf is replaced by
`H(A_engine_controls, A_engine_eval, A_engine_health, A_engine_queue)`
in the SAME tree position — one leaf per vocabulary (`eval` =
{winrate, lead}, `health` = {pps, latency, watchdog}, `queue` =
{queue}), plus a fourth for the action cluster the ruling's own
three-way split doesn't name but the retired leaf's `action` facet-half
still needs a home for. The wrapping `H(...)` carries the SAME `{60px,
envelope: {disconnected, connected}}` height reservation the single leaf
declared before (unchanged) plus a new `gap 4px` (cited to this file's
own `--space-tight` tier, matching every other tight row). Each of the
four new leaves is grounded to a real component region
(`ToolbarEngineMetrics.vue`'s own `winrateDisplay`/`scoreLeadDisplay`
block, its `metric-pps`/`metric-latency`/watchdog-dot block,
`EngineQueueTooltip.vue`'s own badge, `useEngineControls`'s own button
cluster) — see each encoding's own M2 STAGE B2b header section for the
full per-leaf citation.

**Deliberately NOT authored:** a per-group WIDTH floor. A grounded
number IS computable from `ToolbarEngineMetrics.vue`'s cited `min-width`
`ch` values plus the real `en.json` label strings plus `theme.css`'s
spacing tokens (worked out by hand in the encoding's own header: eval
~236px, health ~276px, queue ~68px) — but authoring it as each leaf's
own `min` would raise the side column's own effective width floor from
345px to ~580px+, a major, unverified feasibility regression this stage
does not introduce unilaterally without a live re-sweep of how the real
`.engine-metrics-bar` (a CSS flex row) actually wraps at narrow widths —
the same class of problem `flow.py` solved for `settingsSubstrip`, not
yet attempted here. **Filed as a frontier item** (see below).

`activity sustained` is retired from this leaf's own position (leaf-only
per SPEC.md §16.1, and `A_engine` is no longer a leaf); no cascade
consequence — the four new leaves sit one level deeper than the
band-wide check's own scope (direct leaf children of a Split).

### Item 2 — palette-as-presence-slot (ledger row 2108)

**Ruling, quoted verbatim (row 2108):** *"PALETTE ADOPTION — ruled yes
('yep, why not'): the loop's discovery (setup palette as `@toggle(user,
release)` presence slot, trigger relocated out of the slot) is adopted
on MAINLINE, superseding the standing in-flow/visibility-hidden
ruling."*

**Found:** `SetupToolPalette.vue`'s own 296px-measured `.setup-toolkit`
reservation was NOT a Slot in either encoding at all — it was folded,
unconditionally and invisibly, into the side column's own blanket `min
345px` floor (landscape's own W4 FLOOR CORRECTION section: "a
flex-column sibling minimum at ALL times... never `display: none`"),
reserving space for the palette whether or not it was open. This is
defect (b) from SPEC.md's own opening paragraph wearing the palette's
own face — the exact defect class `boardRail`/`previewBoard`'s own
Amendment-4 adoption already corrected for two other widgets.

**Changed:** `A_setup[common, action]` (new leaf, `@toggle(user,
release)`, `{80px, content bounded, activity occasional}`) added as a
direct sibling of `A_app`/`A_engine` — the side column's own `V(...)`
in landscape, the root `V(...)` in portrait (no separate side column
there) — placed directly after `A_app` (the trigger's own tree
position). `80px` is the model-loop experiment's own measured "70px at
every width" + this file's established ~10px margin posture, carried
forward with a disclosed caveat (the experiment's own toolbar was a
four-leaf split, mainline's is two/four-leaf; the palette body's own
height is a property of the component itself, not the surrounding
split, so the number transfers regardless). `runner.py`'s
`default_valuation` gains `"A_setup"` in `absent_widgets`, matching
`boardRail`/`previewBoard`'s own default-off convention. `activity
occasional` cascades onto `A_setup` (L15's band-wide clause) and, in
portrait only, onto `boardRail` too (portrait's root has three direct
leaf siblings sharing the band, landscape's side column has two) —
mirrors the exact asymmetry `lengyue_portrait.lyt`'s own pre-existing
header note already discloses for the same mechanism.

**Deliberately NOT resolved:** whether the side column's own `min 345px`
width floor (driven by the palette's WIDTH, not height) should ALSO
shrink now that the palette is presence-conditional. LYT's 1-D-per-slot
model means `A_setup`'s own declared axis is HEIGHT (a `V`-child); there
is no per-axis presence-conditional expression for the WIDTH-side
consequence in this language today (the same class of limitation the
BOTH-AXES TENSION note already discloses for CP-* T-children). **Filed
as a frontier item.**

### Item 3 — pane granularity (ledger rows 2134/2151)

**Ruling, quoted verbatim (row 2151, filing the deferral adjudicated at
row 2134):** *"settingsPane second-level opening — per-pane
classification realized (Session UI pane currently scrolls live at a
pinned OPTIMAL size despite no-scroll classification, a standing ruled
violation). Owed by the model-implementation wave; its acceptance
criteria include this symptom's disappearance."*

**Found:** `settingsPane` was ONE opaque leaf standing for whichever of
the six sub-tab bodies is showing, classified `content unbounded, scroll
v` — the "DISCLOSED CONSERVATIVE CHOICE" both encodings' own CP-settings
header sections already named as the worst-case superset of its six
possible bodies (four genuinely bounded, two genuinely unbounded),
over-reserving scroll-affordance for the four bounded ones — exactly the
granularity gap the ratified §8.4 assignment table
(`lyt-tab-region-consult.md`) already named but neither encoding
realized.

**Changed:** Opened one level, mirroring `CP-analysis`'s own nested
`T(...)`: `T(SP_session, SP_analysisEnv, SP_cardSets,
SP_advancedRegistry, SP_analysis, SP_keybindings)`, six leaves named
directly off `frontend/src/composables/chrome/useSettingsSubTab.ts`'s
own `SettingsSubTabId` union (the ADR-0012 P1 single source of truth
`SettingsSubstrip.vue`/`SettingsPane.vue` both already consume) —
prefixed `SP_` to avoid colliding with `AT_*`'s own unrelated "analysis"
tab. Classification follows the ratified §8.4 table directly: four
bounded (`SP_session`/`SP_analysisEnv`/`SP_cardSets`/`SP_analysis`, no
scroll declared), two genuinely unbounded/scroll-declared
(`SP_advancedRegistry`/`SP_keybindings`, mirroring `CP-library`/
`CP-cards`'s own `elastic h` + `floor v` + `edge v item` shape for the
SAME L13/L16/L17 reasons). Per-leaf `min` reuses the ALREADY-declared
200px floor the single opaque leaf carried before (both classes) —
feasibility-neutral by construction (the T's own componentwise-max floor
is unchanged). `find_l13_violations`/`find_l16_violations`/
`find_l17_violations` all re-verified `[]` against both files.

**A latent `emit_layout_tree.py` bug this stage's own edit newly
activated, fixed in the same change:** the emitter's nested-Exclusive
collapse fallback hardcoded the synthetic placeholder widget id
`"controlPanel"` for ANY nested `T` reached with `open_control_panel`
locally False — correct for the one case anticipated at authoring time
(the top-level control panel itself, reached directly on a bare
`build_program()` call) but never actually exercised for a SECOND nested
case, because `CP-analysis`'s own inner analysis-tabs T is always
reached via the outer T's own `control_panel_collapse_indices` shortcut,
which never calls back into this branch. Opening `settingsPane` makes
this branch genuinely reachable a second way (a non-collapsed tab's own
subtree, recursed into with `open_control_panel=False`), which would
have mislabeled the new placeholder `"controlPanel"` too — a real,
if latent, misnomer. Fixed with a new `_within_opened_tab` parameter
distinguishing "this Exclusive IS the top-level control panel" (keeps
the id `"controlPanel"`) from "this Exclusive is nested inside an
ALREADY-open tab's own interior" (derives its own id from its first
collected leaf, `emit_mockup.py`'s own `_first_leaf_widget` convention)
— yields `"SP_session"` for the settingsPane case. Regression-covered by
the updated `test_control_panel_blackbox_floor_is_wrapper_min_derived`
(the bare-call, top-level-only case, still `"controlPanel"`).

## Coverage matrix — before/after, framed per the mid-flight amendment

Per the coordinator's mid-flight framing: **the `default`/`demoted`
valuations are the feasibility-bearing ones; `all-present` is a
diagnostic upper envelope whose `INFEASIBLE` cells are named facts, not
defects** (boardRail/previewBoard/A_setup are all default-off
release/demote toggles — a real page essentially never renders the
all-present state).

Both `default` and `demoted` columns are **byte-identical, status-name
for status-name, before and after this stage's own edits** at all 16
representative-size × valuation points `coverage_matrix.py` checks
(`landscape`: OPTIMAL/OPTIMAL/INFEASIBLE at 1920x1080/2560x1440/
1280x1024; `portrait`: OPTIMAL/OPTIMAL/INFEASIBLE/INFEASIBLE/INFEASIBLE
at 1080x1920/1200x1600/768x1024/540x960/420x880 — unchanged in both
columns). `all-present` is likewise byte-identical (diagnostic-only,
already `INFEASIBLE` at landscape's three representative sizes
pre-existing this stage). The three portrait `default`/`demoted` rows
that remain `INFEASIBLE` (768x1024, 540x960, 420x880) are PRE-EXISTING —
confirmed by the M2 fix pass and B2a's own re-derivation against the
committed encoding's own prior history, unrelated to this stage's edits.
Per the coordinator's own general disposition (non-prescriptive, applied
here to framing only): closing these three would be a repetition-first
functionality-set shaping question (which widgets does a spaced-
repetition-primary mobile session actually need?), not a floor-shrinking
exercise against desktop demands — named for the frontier list, not
attempted this stage (out of the ruled-basket's own three items).

`runner.py`'s own four representative sizes: byte-identical
`OPTIMAL`/`INFEASIBLE` status lines before/after (`diff` on the
status-only extract, exit 0); the full transcript differs only in the
expected, structural ways (new widget rows, renamed leaves) — verified
directly, not assumed.

## Item 4 — relic dissolution: the complete three-way table

Every distinct authored numeric quantity in both encodings' LAYOUT
BODIES (comment-embedded prose numbers excluded — those are
documentation, not `.lyt` syntax), cross-referenced against each file's
own header comments. Column (a) = already cites a named non-numeric
basis; column (b) = dissolved into such a basis THIS session; column
(c) = unresolved relic, no basis found, listed honestly rather than
invented.

| Value | Where | Column | Basis cited |
|---|---|---|---|
| `168px` | boardRail width | (a) | `current_row_asis.lyt`'s own real sidebar-rail transcription |
| `24px` | I_board height | (a) | consult document §5.4 transcription, unchanged |
| `28px` | A_board height | (a) | consult document §5.4 transcription, unchanged |
| `160px` | previewBoard (landscape) | (a) | `LibraryPreviewPane.vue`'s own "160×160 box" CSS precedent |
| `96px` | previewBoard (portrait) | (a)* | disclosed judgment call ("scaled sensibly"), not a raw measurement — flagged as such by the file's own prose |
| `345px` | side column min (landscape) | (a) | W4 FLOOR CORRECTION's own live Playwright width-sweep (335px no-overflow floor + ~10px margin) |
| `340px`+`60ch` | side column max cap | (a)* | cited as "separately-ratified" — provenance named (an external ratification event), not re-derived in this file |
| `32fr` | side column pref weight (landscape) | (c) | **no citation anywhere in either header** for why 32 (vs any other weight) was chosen; genuinely load-bearing (competes with the board composite's own `1fr` sibling) |
| `100fr` | B's own `width` alias (portrait) | (c) | **no citation**; functionally inert (B is the sole `fr`-typed child of its own V, so any positive weight solves identically) but still an authored magic number |
| `4px` | tight-row gaps (both files, many sites) | (a) | `theme.css`'s `--space-tight` design token, cited explicitly at every use |
| `12px` | root split gap (both files) | (a) | `theme.css`'s `--space-medium` design token |
| `60px` | A_engine wrapping-H height (both) | (a) | LYT TOOLBAR ONTOLOGY REENCODE's own Playwright measurement (connected-state cluster + margin) |
| `160px` | A_app height (both) | (a) | same reencode section, measured real component width |
| `616px` | `@demote` threshold, A_app (both) | (a) | model-loop experiment's own measured 615.3px one-row-vocabulary probe |
| `80px` | A_setup height (both, NEW) | (b) | model-loop experiment's own measured "70px at every width" + this file's ~10px margin posture — dissolved this session |
| `110px` | tree floor (landscape) | (a) | `layout-model.ts`'s `TREE_PANEL_MIN_WIDTH_PX`, adjusted by W4 FLOOR SOFTENING; disclosed dead-for-live-rendering (resizer override) |
| `140px` | tree floor (portrait) | (a) | same constant, untouched by W4 (portrait-specific) |
| `664px` | T-node componentwise-max floor (both) | (a) | derived value, traced to CP-analysis's own composite floor, itself composed of the grounded panel floors below |
| `160px`/`200px` | CP-library/CP-cards floor (landscape/portrait) | (a) | W4 FLOOR SOFTENING's own literal per-child floor, scoped to this encoding |
| `443px` | settingsSubstrip+pane composite floor (both) | (a) | `flow.py`'s own mechanically-computed `narrowest_width_for_row_count` design point (6 real ch-measured label widths) |
| `77px` | settingsSubstrip height (both) | (a) | live-measured 67px (Playwright) + ~10px margin |
| `200px` | SP_* sub-pane floors (both, NEW) | (b) | the already-established settingsPane floor (200px, both classes), reused per-child — dissolved this session |
| `580px` | AT_multires height (both) | (a) | `MultiresolutionIntervalPanel.vue:153`'s own CSS `height: 580px` |
| `200px` | AT_basic_scoreLead/mergedDelta/dist/stab panel floors (both) | (c) | **already self-disclosed as an ESTIMATE** by the encoding's own prose ("NOT independently re-measured... a commonly-workable minimum") — carried into this table honestly rather than silently promoted to (a) |
| `90px` | AT_basic_interval height (both) | (c) | same self-disclosed ESTIMATE posture |
| `80px` | timelineStrip height (both) | (c) | PARTLY grounded (a 16px sub-component CSS fact) and partly estimated (header/controls rows, not individually measured) — the FULL 80px is not fully grounded, so classified (c) rather than (a) |
| `264px` | otherColorDebug height (both) | (a) | REPAIR section's own live Playwright measurement (254px max + ~10px margin) |
| `204px` | otherColorDebug+otherBand composite's own outer min (both) | (c) | **no citation anywhere in either file's header** — only ever referenced as one of the componentwise-max inputs, never independently derived. Informational, not load-bearing on this table's own verdict: a `git log` search of the model-loop-experiment branch's own commit messages (NOT a document read; disclosed as such) surfaces that branch's own iter9 commit found a measured 215px for the analogous composite via live Playwright, never ported to mainline — named here for the commissioner, not treated as a citation |
| `1` | `aspect 1` (B, previewBoard, both) | (a) | domain fact — a Go board is square; not an empirical measurement but an unambiguous design constant |

*Marked entries carry a caveat noted in the "Basis cited" column — not
a raw measurement, but a genuine, named provenance, judged sufficient
per the norm's own "a measurement with provenance, a spacing token, a
type metric, a component design fact" menu.

**Column counts: (a) 22, (b) 3, (c) 8** (30 distinct authored quantities
total, both classes' union). No number in this table was invented to
fill a gap — every (c) entry is either a pre-existing self-disclosed
estimate (already honest in the encoding's own prose before this
session) or a genuinely uncited magic number this session found but did
not invent a basis for.

## Item 5 — SPEC staleness (fixed)

`SPEC.md`'s two "five ledger-adjudicated amendments"/"the five
ledger-adjudicated rulings" mentions corrected to "nine", each with a
dated `[corrected 2026-08-12, M2 stage B2b, ...]` note per this
document's own established convention. Swept `SPEC-AMENDMENTS.md` for
the same class of staleness: its own opening paragraph ("Four language
amendments... the four rulings") describes the file's state when FIRST
written (before Amendments 5-9 were appended) — preserved verbatim
(append-only convention) with a dated correction paragraph appended
immediately after. `README.md` swept, no stale amendment-count language
found. **Noted, not fixed** (outside this item's own scope, which named
SPEC.md specifically): `README.md`'s own "L1-L4, plus Amendment 5's L5
family" section header and `errors.py`'s own `LytLoadError` docstring
("L1-L4") both likely understate the actual enforced law set (L2, L5,
L10-L18 are all wired today) — flagged for a future documentation pass,
not touched here.

## Item 6 — model-side frontier items (enumerated, not solved)

### Frontier A — the scroll quantum for item-disposition edges

**Current model fact:** `CP-library`, `CP-cards`, `SP_advancedRegistry`,
`SP_keybindings` all declare `edge v item` (L17) rather than `edge v
unit` (the quantized L10-paired form) — per SPEC.md §16.2, `unit` is
biconditional with a declared `unit <axis>` pitch, and no `.lyt` file in
this repository declares one for any of these four leaves, because no
grounded constant row-pitch exists in the committed comments for their
own live components.

**What a solution would need:** No new language construct — L10/`unit
<axis>`/L17/`edge <axis> unit` machinery already exists and is fully
wired. Purely an ENCODING edit: a live-measured per-widget row-height
constant (Playwright, the same methodology every measured number in
this file already uses), then flip `edge v item` → `edge v unit` +
`unit v <px>` on each of the four leaves.

**WHICH-FACT-YIELDS**, per-candidate verdict: (1) "measure
`CP-library`'s own row pitch live" — not cheaply computable in this
environment (no running app, no live engine, matching this repository's
own standing isolation posture); (2) "measure `SP_advancedRegistry`/
`SP_keybindings`'s own row pitch live" — same; (3) "leave `item`
standing" — zero-cost, already shipped, satisfies L17 honestly (an
announced-not-quantized boundary is not a false claim, only a
less-precise one). No candidate is cheaply computable this session;
(3) is what ships. A live-measurement follow-up wave is the honest
remaining gap, not attempted here.

### Frontier B — the Cards-tab wide-view dead area

**Current model fact:** `CP-cards` declares `content unbounded, scroll
v, elastic h` — the same shape as `CP-library`, a virtual-scrolled
browse structure that elastically claims whatever width its own T-slot
grants it.

**What a solution would need:** depends on a fact this stage cannot
establish without live app access — whether the REAL Cards browse
component (a) genuinely cannot use unbounded width (e.g., a
fixed-max-content-width thumbnail grid), in which case the honest
encoding fix is `ceiling h` (bounded upper-bound reservation, L9/L14)
instead of `elastic h`, redirecting the freed residual to a sibling; or
(b) COULD reflow wider but has a live CSS/component bug, in which case
no encoding change is warranted at all — this would be a `frontend/`-
only fix, out of `research/lyt`'s own scope.

**WHICH-FACT-YIELDS**, per-candidate verdict: neither (a) nor (b) is
cheaply computable without live app inspection (browser DevTools or a
Playwright rig) — this is exactly the class of question the umbrella's
own "asking before assuming" discipline (CLAUDE.md) names: operating
blind to the non-local (live-rendered) side and guessing which fork is
true would be the fragmentary-diagnosis failure mode that discipline
forbids. Flagged for a follow-up wave with live app access; not guessed
at here.

## Witness status per claim

- **Base freshness**: WITNESSED (`git merge-base --is-ancestor 2f4cd687
  HEAD`, exit 0, on the new branch).
- **Both encodings load clean under strict `check_wellformed`** (every
  wired law, L2/L5/L10-L18): WITNESSED — direct `loader.load_layouts`
  call against both committed files after every edit, this session.
- **L13/L15/L16/L17 all return `[]` against both encodings** after items
  1-3's own edits: WITNESSED, direct call.
- **Feasibility neutral — `default`/`demoted`/`all-present` all
  byte-identical, status-name for status-name, before/after**:
  WITNESSED three ways — `runner.py`'s own four representative sizes
  (status-line-only diff, exit 0); `coverage_matrix.py`'s full 24-row
  table (diff shows only wall-clock-time and output-path lines differ,
  every status cell identical).
- **`emit_mockup.py` regenerated after the encoding edits**: WITNESSED —
  `mockups/landscape.html`/`portrait.html` regenerated and committed
  (48625/51655 bytes).
- **`emit_layout_tree.py` output changed → both `.gen.ts` files
  regenerated** (derive-not-author, pre-authorized by this stage's own
  commission): WITNESSED — `frontend/src/state/lyt-layout.gen.ts` /
  `lyt-layout-portrait.gen.ts` regenerated via `emit_layout_tree.py
  --registration <class>`, both roundtrip tests pass against the fresh
  output.
- **Full suite, literal exit code**: WITNESSED —
  ```
  $ nice -n 19 /home/bork/w/vdc/venvs/generic/bin/python -m pytest research/lyt/tests -q
  361 passed in 3.78s
  $ echo $?
  0
  ```
  (361 passed both before and after this session's edits — no net test
  count change; every failure the structural edits caused was fixed by
  an individually-justified assertion update, not a weakened check; see
  "Test edits, individually justified" below.)
- **SPEC.md/SPEC-AMENDMENTS.md staleness corrected**: WITNESSED (both
  files' own dated correction notes, this session).
- **Relic table columns (a)/(b)/(c) counted directly against both
  encodings' own committed text**: WITNESSED (22/3/8, this session).

## Test edits, individually justified

Every failure the structural edits (items 1-3) caused was a path-index
shift, a widget-id rename, or a node-kind change (`leaf` → `blackbox`)
downstream of a real tree-shape change — none weakens a check's own
subject:

1. **`test_derived_orientation.py`, 1 test renamed + rewritten**
   (`...four_residual_holding_leaves...` → `...three_residual_holding
   ...`): `settingsPane` drops from the residual-leaves dict because it
   is no longer a bare leaf (item 3's own T-group opening) — per SPEC.md
   §17.1, only a LEAF residual-holder is a derivation subject, the same
   rule that already excludes the control-panel `T(...)` itself.
2. **`test_lyt.py`, 4 tests** — `A_setup` added to the default-valuation
   assertion; two track-var index shifts (`--track-2-2-1` →
   `--track-2-3-1` landscape, `--track-4-1` → `--track-5-1` portrait);
   the board-composite-child index shift in portrait (2 → 3).
3. **`test_emit_layout_tree.py`, 10 tests** — path-index shifts
   throughout (the new `A_setup` leaf, the `A_engine` composite
   replacement), plus the `settingsPane` → `SP_session`-blackbox rename
   in the two `control_panel_...` tests, plus the two roundtrip tests
   (regenerated, now match).

No test was deleted or had an assertion removed without a replacement
assertion covering the same fact under its new name/path.

## Discipline notes

- Scope held to `research/lyt/` plus the two pre-authorized `.gen.ts`
  regenerations (derive-not-author) and this dispatch report.
  `frontend/`'s own source (components, composables) is untouched.
- No px used as bare reasoning currency without a cited basis — see the
  relic table above; every NEW number this session introduced (80px,
  200px×6) is column (b), dissolved into an already-established basis,
  not invented.
- No wall-clock sleeps; every solve/test run went through `nice -n 19`.
- No touch to ports 4173/5173/5174/8764/1235/1242/195xx — this session
  never started a dev server or live app.
- `autoharn`/`deployment.json` (the ledger-governance tooling, copied
  from the main checkout per the same precedent stages B1/B2a already
  disclose) and `research/lyt/coverage_matrix_result.json` (a generated
  scratch artifact from this session's own witness run) are left
  untracked — operational/generated, not part of the deliverable.

## Commit

Committed on this worktree's own branch, `lyt-phase2-b2b`.

LAST-act freshness check (repeated, post-commit): `git fetch origin`;
`git merge-base --is-ancestor 2f4cd687 HEAD` — exit 0, `2f4cd687` is
still an ancestor of `HEAD` (`lyt-phase2`'s own tip did not move during
this session).

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source code,
so no header is added to it).
