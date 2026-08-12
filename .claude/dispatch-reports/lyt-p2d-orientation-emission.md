Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).

# LYT P2d — emit the DERIVED orientation

Commission: P2d, ledger row 2310's own Amendment 9 mechanism, finally
threaded through to emission. Base `3e4f6bec` on `lyt-phase2`.

## Base freshness (FIRST ACT)

`git fetch origin` (no new remote refs; `origin/lyt-phase2` already
resolved to `3e4f6bec`). This agent's own isolated worktree started on
an unrelated branch (`worktree-agent-a8629efb7520c60c5`, tip
`3378806f`, NOT an ancestor of `3e4f6bec` — `git merge-base
--is-ancestor 3e4f6bec HEAD` failed). The literal branch name
`lyt-phase2` was unavailable in this worktree (no collision found —
the worktree's own branch had no commits of its own beyond `3378806f`,
so `git reset --hard origin/lyt-phase2` was safe: `git status` showed
a clean tree, only the untracked `.claude/` scratch directory). Reset
directly onto `origin/lyt-phase2`'s tip rather than cutting a new
branch, since this worktree's own branch carried nothing to preserve.
`git merge-base --is-ancestor 3e4f6bec HEAD` — exit 0, confirmed
immediately after.

## Orientation reading (end to end, per ADR-0002/CLAUDE.md)

`research/lyt/orientation.py` (full, 203 lines — the derivation seam:
`derive_orientation`, `compute_derived_orientations`, `rebind`, and the
"WHY THIS IS SOLVER-INERT" / "THE RE-LOAD SEAM" sections); `research/lyt/
emit_layout_tree.py` (full, pre-edit, 1136 lines — the emitter this
commission modifies, including every prior wave's own disclosed-narrowing
section); `research/lyt/SPEC.md` §17 (Amendment 9 — derived orientation
and law L18, lines 1576-1729, read as the terminal section of a
targeted read of that heading; the umbrella's documentation-consumption
discipline was honored for the section actually relied on for a claim —
§17.1 through §17.4 in full); `.claude/dispatch-reports/
lyt-r1-orientation-pathmap.md` (full, 461 lines — the original
static-`'v'` finding, the frontend wiring `activeTreeOrientation`
depends on, and its own 2026-08-12 fix pass); `.claude/dispatch-reports/
lyt-p2c-portrait-row-floor.md` (full, 360 lines — the per-size
before/after orientation table this commission's own "current facts"
claim is built on, and the portrait row-floor fix that makes every
portrait representative size solvable). Also read directly against the
running source, as needed to establish the emission mechanism's own
inputs: `research/lyt/runner.py` (`REGISTRATIONS`, `valuation_for_class`,
`run_all`'s own `orientation.rebind` call site), `research/lyt/
coverage_matrix.py` (`LANDSCAPE_SIZES`/`PORTRAIT_SIZES`, the
representative-size lists this commission's own "reuse the existing size
lists" instruction points at), `research/lyt/errors.py` (the `LytError`
structured-error family, consulted to decide `OrientationDerivationError`'s
own shape — a plain `ValueError` subclass, disclosed as a deliberate
divergence from that family in the new exception's own docstring),
`frontend/src/App.vue` and `frontend/src/composables/chrome/
useLytProgramIndex.ts` (R1's own wiring, to confirm no frontend source
change was needed), `frontend/tests/unit/lyt-tree-orientation.test.ts`
(the existing pin this commission updates), `research/lyt/tests/
test_emit_layout_tree.py` (the existing emitter test file this
commission extends), `frontend/CLAUDE.md` and `frontend/tests/CLAUDE.md`
(both already in context per the system prompt for this session).

`docs/dispatch/` swept for open items addressed to `frontend` or
`research/lyt`: every `*-to-frontend-*` file present is named
`-shipped`/`-consumed`/`-status`, none flagged open — same finding
every prior LYT-session report in this directory already recorded, not
re-verified end-to-end (out of this commission's own named scope).

## THE GAP, confirmed directly

`emit_layout_tree.py`'s `build_program` never called
`orientation.compute_derived_orientations`/`orientation.rebind` at
all — every leaf's `orientation` field, including `tree`'s, came
straight off `node.orientation` (the AST's own load-time undeclared
default, `'v'`, per `loader._load_orientation`). R1 had already
established (dispatch report above) that this static `'v'` happened
to agree with the genuine derivation at every OPTIMAL size it tested,
in both classes — but that finding predates P2c's own portrait
row-floor fix, which is what makes portrait's `768x1024`/`540x960`/
`420x880` representative points solvable (and therefore votable) at
all; before P2c, `768x1024` was a degenerate zero-height row whose
derived orientation fell to the SAME `'v'` fallback
`derive_orientation`'s own `h<=0` branch names, coincidentally
matching the static default rather than genuinely agreeing with it.

## THE FIX

`research/lyt/emit_layout_tree.py`:

- **`_derive_tree_orientation(class_id)`** (new function): reproduces
  `runner.run_all`'s own solve shape for the ONE widget this stage
  cares about — resolve the class's own default presence valuation
  (`runner.valuation_for_class`, the same seam `_absent_widgets_for_class`
  already uses), prune via `presence.resolve_and_validate`, solve at
  EVERY size the class's own representative solve set names
  (`coverage_matrix.LANDSCAPE_SIZES`/`PORTRAIT_SIZES`, reused verbatim
  — no size invented), and apply `orientation.compute_derived_orientations`
  at each solvable size. An INFEASIBLE size contributes no vote (no
  solved rectangle to derive an aspect from — the same honest skip
  `compute_derived_orientations` itself already applies, not a
  disagreement). If every vote agrees, that value is returned. If votes
  disagree, `OrientationDerivationError` (new exception, `ValueError`
  subclass, `.detail` carries the disagreement as `{value: [size,
  ...]}` data) is raised, naming every disagreeing size. If NO
  solvable size names `tree` as residual at all, a plain `ValueError`
  is raised — a genuinely different refusal shape ("nothing to
  derive" vs. "derived, but disagrees"), not conflated.

- **`_build_node`**: a new `tree_orientation: Optional[str]` parameter,
  threaded through every recursive call site the same way
  `absent_widgets` already is. The leaf branch reads
  `tree_orientation` (falling back to `node.orientation`) ONLY when
  `node.widget == TREE_WIDGET_ID` ("tree") — every other leaf,
  including `B`/`otherBand` (both also, technically, residual-holding
  leaves the language could in principle derive an orientation for)
  keeps reading its own load-time default exactly as before.

- **`build_program`**: calls `_derive_tree_orientation(class_id)` once
  per build (same posture as `absent_widgets`), threading the result
  into `_build_node`.

**DISCLOSED, DELIBERATE SCOPE NARROWING (STOP-and-report) — the
`otherBand` disagreement finding.** Before committing to the `tree`-only
scope, I ran the FULLY GENERAL form of Amendment 9's own mechanism
(`orientation.compute_derived_orientations`, which derives a value for
EVERY residual leaf `wellformed.find_residual_leaves` names, not just
`tree`) against both classes' pruned default-valuation trees, direct
probe:

| class | residual leaves (pruned) | derived, per representative size |
|---|---|---|
| landscape | `B`, `tree`, `otherBand` | `B`: v,v (1280x1024 INFEASIBLE); `tree`: v,v; `otherBand`: **h at 1920x1080, v at 2560x1440** |
| portrait | `B`, `tree` (`otherBand` pruned away — its `T(...)` parent is absent-by-default on portrait) | `B`: v,v,v,v,v; `tree`: h,h,h,h,h |

`otherBand` GENUINELY DISAGREES within landscape — solved rect
664×564 (aspect 1.18>1 → `h`) at 1920×1080 versus 664×924 (aspect
0.72<1 → `v`) at 2560×1440. This is a real, checked structural fact
(its width is pinned to the control panel's own fixed 664px column
while its height is genuinely elastic, so it flips wide-short to
narrow-tall as the viewport grows taller), not a derivation bug.
`B`'s own derivation is unanimous `'v'` in both classes at every
solvable size — a verified no-op if threaded (identical to its
existing static default).

Threading the fully general mechanism through emission today would
make landscape's ENTIRE compiled program refuse to build over a field
(`otherBand`'s `orientation`) that has NO current downstream consumer
at all (confirmed: it is one of the M2 STAGE F1 PORT's own disclosed
"no current consumer reads them yet" fields) — a consequence far
outside this arc's own named scope (every mention in the commission
text is "the tree leaf's orientation" specifically) and squarely the
kind of disposition the commission's own text reserves for the
orchestrator ("the disposition — runtime re-derivation in the
frontend — is a design fork for the orchestrator, not yours to
improvise"). I therefore scoped `_derive_tree_orientation`/the new
`_build_node` parameter to `tree` only, leaving `B`/`otherBand` reading
their own load-time defaults exactly as before (byte-identical for
both — `B`'s derivation is a no-op anyway; `otherBand` is simply not
threaded). **This is the one STOP-and-report item this commission
surfaces**: resolving `otherBand`'s own genuine per-size disagreement
(does the static contract simply never carry it, does a future
consumer need runtime re-derivation instead, does the encoding itself
need to change) is not resolved here and needs the orchestrator's own
disposition before any future stage touches it.

## Result, both classes — verified by direct re-solve AND by the
committed `.gen.ts` diff

| class | `tree` votes (representative sizes) | derived value | pre-P2d static value | diff |
|---|---|---|---|---|
| landscape | `v` at 1920x1080, `v` at 2560x1440 (1280x1024 INFEASIBLE, no vote) | `v` | `v` | **none** |
| portrait | `h` at all 5 of 1080x1920/1200x1600/768x1024/540x960/420x880 | `h` | `v` | **`v` → `h`** |

Fresh-emit byte-identity: re-ran both `--registration` invocations a
second time immediately after regenerating; `diff` against the
just-written files was empty for both (`LANDSCAPE BYTE-IDENTICAL`,
`PORTRAIT BYTE-IDENTICAL`).

`.gen.ts` diff, literal:

```
$ git diff frontend/src/state/lyt-layout-portrait.gen.ts
...
-              node: { kind: "leaf", widget: "tree", ..., orientation: "v", ... },
+              node: { kind: "leaf", widget: "tree", ..., orientation: "h", ... },
```

Landscape's `.gen.ts` diff is header-comment-only (the new P2d
docstring line added to both generated files' own header block) — the
compiled program body is byte-identical.

Mockups (`research/lyt/emit_mockup.py`) regenerated: zero diff in
either `mockups/landscape.html` or `mockups/portrait.html` —
`emit_mockup.py` is a separate, untouched generator (its own docstring
already disclosed it keeps its own independent orientation-finding
copy and is out of this stage's scope), so this is the expected
no-op confirmation, not an oversight.

## No frontend source change needed — verified directly

`frontend/src/App.vue:556-565`:

```ts
const activeTreeOrientation = computed<'vertical' | 'horizontal'>(() => {
  const leaf = activeLytProgramIndex.value.leafNodes['tree'];
  ...
  return lytOrientationToProp(leaf.orientation);
});
```

This reads `leafNodes['tree'].orientation` off whichever compiled
program (`LYT_LANDSCAPE`/`LYT_PORTRAIT`) is active — R1's own wiring
already consumes exactly the field this stage changes, with no
knowledge of WHERE the value came from. Confirmed via direct grep:
`activeTreeOrientation`, `lytOrientationToProp`, and the `:orientation=`
binding are all R1-era, untouched by this commission. `git diff` on
every `frontend/src/**/*.vue`/`*.ts` file except the one test file
below is empty.

## Test edits — individually justified

**`research/lyt/tests/test_emit_layout_tree.py` — five tests added,
no-tautology discipline.** `_independent_tree_orientation_votes`
re-derives `tree`'s orientation via its OWN solve + walk (`runner`/
`orientation`/`presence`/`compiler` called directly), deliberately
never calling `elt._derive_tree_orientation` (the function under
test) — the same "independent second opinion" shape
`lyt-r1-orientation-pathmap.md`'s own fix pass established for
`findWidgetPathIndependently`.

1. `test_p2d_landscape_tree_orientation_matches_independent_derivation`
   — independent votes `{"v": ["1920x1080", "2560x1440"]}`, cross-checked
   against `build_program_for`'s own emitted `tree` leaf (`'v'`).
2. `test_p2d_portrait_tree_orientation_matches_independent_derivation`
   — independent votes unanimous `'h'` across all five sizes,
   cross-checked against emission (`'h'`).
3. `test_p2d_disagreement_raises_structured_error` — a genuine
   RED-WITHOUT-FIX witness for the refusal path (monkeypatches
   `orientation.compute_derived_orientations` to return `'h'` then
   `'v'` across landscape's two solvable calls; asserts
   `OrientationDerivationError` is raised with `.detail == {"h":
   ["1920x1080"], "v": ["2560x1440"]}` and that the fake was called
   exactly twice — proving 1280x1024's own INFEASIBLE status never
   reaches the derivation call at all).
4. `test_p2d_no_votes_raises_plain_value_error` — the distinct
   "nothing to derive" refusal shape (monkeypatched to return no votes
   at all), asserted NOT to be an `OrientationDerivationError`.
5. `test_p2d_non_residual_leaves_unaffected` — `CP-library` (a plain,
   non-residual leaf) still reads its own load-time default (`'v'`),
   confirming the scope narrowing holds structurally, not just for
   `tree`/`B`/`otherBand` by absence of a counter-example.

No existing test was weakened. The two pre-existing roundtrip tests
(`test_render_ts_roundtrip_matches_committed_file`,
`test_portrait_render_ts_roundtrip_matches_committed_file`) went red
between the code edit and the `.gen.ts` regeneration (expected —
same "transient failure, resolved by regenerating" pattern P2c's own
report already recorded) and are green again post-regeneration. The
pre-existing `test_f1_port_leaf_fields_default_empty_for_a_plain_leaf`
(asserts landscape's `tree` orientation `== "v"`) needed no edit — it
remains true post-P2d, confirming landscape's own byte-identity from
an orthogonal angle.

**`frontend/tests/unit/lyt-tree-orientation.test.ts` — updated, not
weakened.** The portrait assertion flips from `'v'` to `'h'`
(mechanically required by the emitted-value change); the landscape
assertion is untouched (`'v'`, still true). Docstring rewritten to
name P2d, the per-class representative-size unanimity, and the
Python-side no-tautology re-derivation this file's own two literals
mirror. The third test (App.vue wiring source-scan) is untouched — no
source changed for it to re-scan differently.

## Documentation audit (per umbrella CLAUDE.md's own checklist)

- **`research/lyt/SPEC.md` §17.4**: updated in place, "supersede, do
  not delete" convention (the section's own established pattern for
  two prior corrections). §17.4's own "the derivation genuinely runs;
  it has nothing downstream to show a difference in yet" claim is now
  FALSE for `tree` specifically — a new dated correction paragraph
  (2026-08-12, P2d) says so, names the frontend consumer, and scopes
  the correction to `tree` alone (leaving the prior paragraph's own
  claim intact for `B`/`otherBand`/`settingsPane`).
- **Doc-graph** (`docs/doc-graph.json`): `SPEC.md` IS a tracked node,
  but this edit is content-only (no doc added/removed/renamed, and
  `.claude/dispatch-reports/*` files are confirmed NOT doc-graph nodes
  at all — direct grep found zero matches for `dispatch-reports` in
  `docs/doc-graph.json`) — per the umbrella CLAUDE.md's own rule, a
  content-only edit does not require `node tools/doc-graph/generate.mjs`
  regeneration. Not regenerated this session; disclosed rather than
  silently skipped, same posture every prior LYT-session report in
  this directory takes for the identical situation.
- **Work-status store** (`todo` DB): queried
  (`psql -h 192.168.122.1 -d todo`) for an item matching `orientation`,
  `P2d`, or `lyt` by title — none found (`0 rows`). No item id was
  named in the commission text either. Not created unilaterally
  (the store's own schema and this codebase's convention treat item
  creation as commissioner-directed, not something a delivery session
  infers); if one should exist, that is the commissioner's own
  follow-up, disclosed rather than silently skipped.
- **`docs/handoff-current.md` / `FEATURES.md`**: neither touched. This
  is a data-derivation-fidelity fix to an already-shipped, already-
  described surface (FEATURES.md's own "Workspace and chrome" section
  already describes the GAME TREE panel and the landscape/portrait
  screen-class split; it says nothing about the tree's own node-layout
  axis as a distinguishing feature) — the portrait GAME TREE panel now
  renders its own nodes left-to-right instead of top-to-bottom, which
  is a rendering-fidelity correction (the compiled contract now
  honestly carries the model's own genuine per-solve verdict) rather
  than a new or removed user-facing capability, the same judgment
  `lyt-p2c-portrait-row-floor.md`'s own report made for its own
  visibility-restoring fix ("arguably a bugfix restoring intended
  behavior rather than a new capability").
- Per ADR-0006: no new source files were created this stage (only
  existing files edited in place); each edited file's existing header
  is extended, not replaced, per this codebase's own "supersede in
  place" convention (`emit_layout_tree.py`'s module docstring gained
  the new "P2d" section; no header-format file was touched).
- **`frontend/FILES.md`**: not touched — no file created, moved, or
  deleted; the two edited `.gen.ts` files and the one edited test file
  are pre-existing entries whose purpose is unchanged by this stage.

## Per-claim witness status

- **Base freshness**: WITNESSED (`git merge-base --is-ancestor
  3e4f6bec HEAD`, exit 0, immediately after the reset).
- **THE GAP (emitter never threads the derivation)**: WITNESSED (direct
  read of pre-edit `build_program`/`_build_node`, confirmed no
  `orientation.compute_derived_orientations`/`.rebind` call anywhere
  in the file before this stage's edit).
- **`otherBand` landscape disagreement**: WITNESSED (direct re-solve,
  both representative sizes, `SolvedRect` values and derived
  orientations printed above — 664×564 aspect 1.18 at 1920×1080 vs.
  664×924 aspect 0.72 at 2560×1440).
- **`research/lyt` pytest**: WITNESSED, 375 passed, exit 0.
- **Fresh-emit byte-identity, both classes**: WITNESSED (`diff`
  against a second immediate regeneration, empty both times).
- **`.gen.ts` diff is exactly the portrait `tree` leaf's `orientation`
  field (plus both files' own new header-comment line)**: WITNESSED
  (`git diff --stat` + literal diff transcript above).
- **Mockup regeneration is a no-op**: WITNESSED (`git diff --stat
  research/lyt/mockups/` empty after re-running `emit_mockup.py`).
- **No frontend source change needed**: WITNESSED (direct grep of
  `App.vue`'s existing `activeTreeOrientation` computed, confirmed
  R1-era and untouched; `git status` shows no `.vue`/production `.ts`
  diff).
- **`npm run build`**: WITNESSED, exit 0, 1249 modules transformed,
  built in 2.09s.
- **`npm run test:run`** (`NODE_OPTIONS=--max-old-space-size=2048
  VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 nice -n 19`): WITNESSED, 257
  test files passed / 3 skipped (260), 3201 tests passed / 8 skipped
  (3209), exit 0.
- **`tests/integration/App-boot.test.ts` in isolation**: WITNESSED, 5
  passed, exit 0.
- **`npx eslint .`**: WITNESSED, 15 errors across 7 pre-existing files
  (`ProxyUpstreamSettingField.vue`, `AnalysisDashboard.vue`,
  `chart-data.ts`, `LibraryTable.vue`, `WizardStepPalette.vue`,
  `composables/cards/batch-mint-core.ts`, `composables/review/
  useMinting.ts`), plus 2 pre-existing warnings in `scripts/
  lyt-conformance.mjs` — none in any file this commission touched.
  (The commission text named "six" pre-existing files; direct count
  this session found seven, 15 errors total either way — a minor
  discrepancy in the commission's own prose, not a regression: ZERO
  new violations introduced, confirmed by cross-referencing every
  flagged file against `git status`.)
- **Screenshot witness, isolated rig**: WITNESSED, all three targets —
  see below.

## Screenshot witness — isolated rig

Own ports, all verified dead before use and again after teardown:
backend `127.0.0.1:19601`, frontend dev server `127.0.0.1:19603`,
KataGo WS placeholder `127.0.0.1:19602` (pinned, never contacted).
None of the forbidden ports (4173/5173/5174/8764/1235/1242/195xx)
were touched — `19601`/`19602`/`19603` individually probed dead via
`nc -z` before use; `19601`(picked first, found alive on the first
probe of `19501` from an unrelated pre-existing session — discarded,
re-probed a fresh block at `1960x`) and `19603` both re-verified dead
after teardown, no stray process left running.

- **Backend**: `/home/bork/w/omega/backend/venv/bin/python -m fastapi
  run backend/main.py --host 127.0.0.1 --port 19601`, `DATABASE_URI`
  pointed at a COPY of `backend/samples/cards.sample.db`
  (`cards.rig.db`, under this session's own scratch dir — never the
  real `cards.db`), rewritten to the async driver form
  (`sqlite+aiosqlite:///...`, per `backend/core/config.py`'s own
  default). `QEUBO_ENABLED=false`.
- **Theme**: the DB copy's `documents` row
  (`key='user_workspace_01'`) `profile.settings.appearance.theme`
  rewritten `'dark'` → `'cluster'` via a direct sqlite3/Python write,
  verified by re-reading the row after the write. Playwright's own
  `colorScheme: 'light'` context option forced the second half of the
  mandate. All three real screenshots confirm `data-theme="cluster"`
  and `background-color: rgb(255, 245, 255)` live.
- **Frontend**: `vite --port 19603 --host 127.0.0.1 --strictPort`,
  `VITE_API_BASE_URL=http://127.0.0.1:19601`,
  `VITE_KATAGO_WS_URL=ws://127.0.0.1:19602`.
- **Playwright**: `systemd-run --user --scope -p MemoryMax=4G -- nice
  -n 19 node --max-old-space-size=1024 <script>.mjs`, chromium
  launched with `executablePath: '/usr/bin/chromium'` and `args:
  ['--js-flags=--max-old-space-size=1024']`, one browser instance,
  closed in a `finally`. No wall-clock waits — every wait is
  `waitForSelector`/`waitForFunction` on a real DOM condition
  (`#split-workspace` populated, `#board-area` present, `#vue-tree-panel`
  measuring nonzero width).

**Captures** (`/tmp/claude-1000/-home-bork-w-omega/
046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/lyt-p2d-rig/`, not
committed — established LYT-session convention):

- `portrait-768x1024.png` — GAME TREE panel renders its node-dot chain
  HORIZONTALLY (● — ○ — ● — ○ — ●, left-to-right), directly visible at
  the bottom of the frame. `#vue-tree-panel` measured 140×140 (matches
  P2c's own witnessed post-fix geometry).
- `portrait-420x880.png` — same horizontal node-dot layout, visibly
  present in the captured viewport. `#vue-tree-panel` also 140×140.
- `landscape-1920x1080.png` — GAME TREE column renders its node-dot
  chain VERTICALLY (stacked top-to-bottom), unchanged from every prior
  landscape witness in this directory. `#vue-tree-panel` measured
  230×828.

Console noise observed in all three captures (`/resources/
visit-distribution` 500, a 503 from the dead-pinned KataGo WS shim):
both pre-existing, unrelated to this change (given the sample DB and
the deliberately dead-pinned engine), matching every prior LYT-session
report's own disclosure of the identical noise.

## STOP-and-report items

**One.** The `otherBand` landscape disagreement named above — the
fully general form of Amendment 9's own derivation mechanism
(applied to EVERY residual leaf, not just `tree`) finds a genuine,
checked per-size disagreement in landscape's `otherBand` leaf (`'h'`
at 1920×1080, `'v'` at 2560×1440). This stage does NOT thread the
general mechanism through emission (scoped to `tree` only, disclosed
above) precisely because doing so would make landscape's entire
compiled program refuse to build over a field with no current
consumer. Whether `otherBand`'s own orientation should ever reach the
compiled program (and if so, how a size-varying fact should be
represented — a runtime frontend re-derivation, an encoding change
that removes the disagreement structurally, or something else) is a
disposition this report surfaces rather than improvises.

## Discipline notes

- Scope held to `research/lyt/emit_layout_tree.py`,
  `research/lyt/tests/test_emit_layout_tree.py`,
  `research/lyt/SPEC.md` (§17.4 correction only),
  `frontend/src/state/lyt-layout.gen.ts`/`lyt-layout-portrait.gen.ts`
  (regenerated, not hand-edited), `frontend/tests/unit/
  lyt-tree-orientation.test.ts`, `research/lyt/mockups/*.html`
  (regenerated, zero diff), and this dispatch report. No `.lyt`
  encoding was touched. No frontend production source
  (`.vue`/non-test `.ts`) was touched — verified directly, not merely
  assumed.
- No px used as bare reasoning currency for any DESIGN claim — every
  pixel value cited above (664/564/924/152/140/230/828/1920×1080/
  2560×1440/768×1024/420×880/...) is either a solved-geometry witness
  value, a viewport-simulation input, or a screenshot's own measured
  dimension.
- box-shadow/transitions/blur: none introduced — this change adds no
  new CSS at all (pure Python derivation logic feeding an existing
  data field; the frontend consumes it through R1's own pre-existing
  wiring, unmodified).
- `--surface-0`/`--text-0`: not applicable — no new visible chrome
  introduced, only a data-driven layout-axis flip on an existing
  panel.
- `frontend/node_modules` symlinked from the main checkout for the
  duration of the frontend gates/screenshot rig (byte-identical
  `package-lock.json` diff confirmed first), removed again after.
  `.jwt_secret` scratch artifact from the backend rig cleaned up.
  `research/lyt/__pycache__` artifacts cleaned. `.claude/logs/` is
  harness-internal (invocation logging), left untouched — not a
  scratch artifact this session created.

## Commit

Committed on this worktree's own `lyt-phase2`-based branch (reset
directly onto `origin/lyt-phase2`'s tip, `3e4f6bec` — see "Base
freshness" above; no differently-named branch was needed this
session). Not pushed.

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).
