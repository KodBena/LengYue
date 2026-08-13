# LYT relations-first amendment — dispatch A: relocation, fixture moves, probe harness

Dispatch A of the LYT relations-first amendment (ledger rows
2396/2397/2399/2400). Scope: relocate comment content per the governing
spec's §5 purge accounting, execute the ratified fixture moves, build and
run a probe harness per §4, and report discrepancies for dispatch C. No
grammar changes, no encoding rewrites, per the brief.

**Documents read end to end** (per ADR-0002): the governing spec
(`.claude/dispatch-reports/lyt-relations-amendment-spec.md`), `SPEC.md`
(1784 lines), `SPEC-AMENDMENTS.md` (1721 lines, both before this
dispatch's own edits), `encodings/lengyue_landscape.lyt` (1479 lines),
`encodings/lengyue_portrait.lyt` (525 lines), the three
`current_row_wart_*.lyt` fixtures, `ogs.lyt`, `q5go.lyt`, `loader.py`
(2626 lines), `runner.py` (382 lines), `tests/test_lyt.py`'s header and
every section referencing the moved fixtures, `frontend/scripts/
lyt-conformance.mjs` (as isolated-rig precedent), and
`ToolbarEngineControls.vue`, `SetupToolPalette.vue` (header),
`layout-model.ts`, `MultiresolutionIntervalPanel.vue` (CSS rule),
`lyt-widget-registry.ts` (slotName convention). `lyt_ast.py` and
`emit_layout_tree.py` were read in full by the orchestrating agent per
the brief and are cited on that basis. **Narrowed, disclosed**:
`LibraryPreviewPane.vue`, `StatusBar.vue`, `AnalysisTimelinePanel.vue`,
`SettingsSubstrip.vue`, `TabWidget.vue` were read only in part (header
comments and grep-located key facts, not end to end) — a real,
budget-driven narrowing under this dispatch's own time pressure, named
per the umbrella's "asking before assuming" discipline rather than
silently absorbed. None of these five files' own literal numbers needed
independent re-derivation in this dispatch (they weren't touched), so
the narrowing bears only on how confidently this report's prose
describes their internals, not on any number reported below.

## 1. Relocation itemization

| Comment content | Destination |
|---|---|
| Grounding derivations (185px engine-controls breakpoint, 92px A_setup, 264px otherColorDebug, 443px/77px settingsSubstrip, etc.) | `facts.generated.json` (WITNESSED entries) / `facts.residue.json` (estimated entries), per component — the provenance field IS the new home, per the spec's own instruction. No duplication into SPEC.md. |
| Ledger row citations, dispatch-report references, amendment history | Unchanged — canonically the autoharn ledger and `.claude/dispatch-reports/*.md`. Spot-checked (below); three dangling citations found and reported, not fabricated. |
| BOTH-AXES TENSION (T-child min applies to both axes identically) | New SPEC.md §12 bullet, general form (no per-leaf numbers) — see the diff. |
| Engine-controls wrap-breakpoint mechanism (component, worst-case items, ceiling-not-floor CP-SAT rounding) | New SPEC.md §12 bullet, general terms — closes the spec's own named gap ("no SPEC.md §12 counterpart at all today"). |
| Aspect/exact-cross-fill collision | Already fully homed at SPEC.md §2/§12 first bullet; audited against the encodings — the encodings don't carry a fuller treatment of this one, nothing to relocate. |
| L13/L16 cascade reasoning (surplus+excess disposed but not deficit trips L16) | Already homed as general law text at SPEC.md §16.2 (L13/L16 definitions) — this is law documentation, not a limitation; left there. |
| CP-settings "worst-case superset" disclosure | Found ALREADY STALE, self-superseded in place: the landscape/portrait encodings' own later "M2 STAGE B2b, (3) PANE GRANULARITY" section documents the resolution (settingsPane opened into six per-classified SP_* leaves) using this file's own "supersede, don't delete" convention. Nothing further to relocate — the encoding's own later comment already carries the correction. |
| Six chart-panel 200px estimates, AT_basic_interval's 90px | `facts.residue.json`, `status: "estimated"`, each with a one-line basis. |
| CP-library/CP-cards/SP_*/otherBand WRAPPER_MIN-analog floors (160px landscape, 200px portrait), the 340px side-column cap component, `PX_PER_CH`, `WRAPPER_MIN` sentinel, previewBoard's portrait downscale | `facts.residue.json`. |
| `340px+60ch` cap's undocumented `340px`; the three un-authored `A_engine_eval`/`health`/`queue` width floors | New SPEC-AMENDMENTS.md "## Residual items" section, items R1/R2 — durable home for what the spec itself said "I did not find them in SPEC.md or SPEC-AMENDMENTS.md." |

## 2. Fixture moves

- `ogs.lyt`, `q5go.lyt` → `research/lyt/fixtures/reference/` (new directory).
- `current_row_wart_content.lyt`, `current_row_wart_l2.lyt`,
  `current_row_wart_presence.lyt` → `research/lyt/tests/` (alongside
  `test_lyt.py`, whose existing docstrings already carry the
  "deliberately invalid, expected to be refused" disclosure per test —
  only the path resolution needed updating).
- `current_row_asis.lyt`/`current_row_repaired.lyt` untouched, per the
  ruling.

**Reference-audit grep** (`grep -rln 'ogs\.lyt\|q5go\.lyt\|current_row_wart_content\|current_row_wart_l2\|current_row_wart_presence'`, scoped to this worktree, excluding other agents' worktrees and dated dispatch-report prose):

Before: `runner.py`, `emit_ts.py`, `bench_solve.py` (no q5go/ogs refs
found there — dead end, no edit needed), `coverage_matrix.py`,
`emit_mockup.py`, `emit_layout_tree.py`, `wellformed.py`,
`SPEC-AMENDMENTS.md`, `tests/test_lyt.py`, `encodings/lengyue_landscape.lyt`
(prose citation), `encodings/current_row_repaired.lyt` (prose citation).

Live references updated: every module that reads a `Registration.files`
entry by joining `ENCODINGS_DIR` with a bare filename
(`runner.py`, `emit_ts.py`, `coverage_matrix.py`, `emit_mockup.py`,
`emit_layout_tree.py`) now resolves through a new
`runner.resolve_encoding_file(filename)` helper, which checks
`encodings/` then `fixtures/reference/` and raises `FileNotFoundError`
loudly if neither has the file. `tests/test_lyt.py`'s own `_load` helper
gained the matching three-directory resolution
(`encodings/`, `fixtures/reference/`, this directory). `wellformed.py`
and `SPEC-AMENDMENTS.md`'s own prose citations of `current_row_wart_l2.lyt`
by basename were left as-is — they name the fixture's *behavior*, not a
path, and remain true after the move (not dangling in the technical
sense: nothing tries to open a path from that prose). `bench_solve.py`
needed no edit — its own `REAL_SPECS` never names `ogs.lyt`/`q5go.lyt`.

**After: zero hits** for `encodings/ogs.lyt`, `encodings/q5go.lyt`, or
`encodings/current_row_wart_*` anywhere in `*.py`/`*.md`.

## 3. Harness design

`research/lyt/tools/probe_harness/measure.mjs`. Two mechanisms:

- `read-constant`: a static regex read of a named source file/symbol —
  no browser. Used for `TREE_PANEL_MIN_WIDTH_PX` (`layout-model.ts`),
  `MultiresolutionIntervalPanel.vue:153`'s CSS `height: 580px`, and an
  attempted `.panel-resizer` CSS-rule read in `App.vue` (found NO
  current match — the rule appears retired; the live-probe entry for
  `resizerOuter` supplies this fact instead, WITNESSED at 1px).
- `playwright-boundingBox`: serves `frontend/dist/` (built via
  `npm run build`, exit 0) on a scratch static server (plain
  `node:http`, no `vite preview` dependency), launches ONE Chromium
  instance, waits for `#split-workspace`, then `getBoundingClientRect()`
  on a per-widget selector.

**Correction made mid-run, disclosed rather than silently fixed.** The
harness's first draft assumed `lyt-widget-registry.ts`'s own `slotName`
field (e.g. `'#leaf-A_setup'`) was a literal DOM `id`. A first real run
(WITNESSED) found every such selector absent from the live DOM;
inspection of the rendered page showed `slotName` is actually a Vue
NAMED-SLOT key (`LytNode.vue`'s own `#[name]` re-export), not an id —
the real DOM anchors are per-component CSS classes
(`.engine-controls`, `.app-cluster`, `.setup-toolkit`) or a few
hardcoded ids (`#vue-tree-panel`, `#control-panel`, `#resizer-outer`,
`#board-square`) inherited from the pre-decomposition realization. The
harness was corrected to use these real, DOM-verified selectors — named
in the script's own comment, not silently patched without a trace.

**Process/port/memory discipline, as actually used**: `systemd-run
--user --scope -p MemoryMax=4G -- nice -n 19 node
--max-old-space-size=2048 research/lyt/tools/probe_harness/measure.mjs
--port 19200`. **Disclosed deviation**: `-p Nice=19` and
`-p CPUSchedulingPolicy=batch` as literal `systemd-run` properties both
raised `Unknown assignment` in this environment's systemd version —
substituted with a `nice -n 19` process wrapper around `node` instead,
achieving the same niceness without the two rejected unit properties.
Chromium launched with `--js-flags=--max-old-space-size=1024`. ONE
instance, closed in `finally`. Static server closed in the same
`finally`. Port 19200 (>= 19000, not one of the four forbidden ports).
No `waitForTimeout` anywhere — every wait is `waitForSelector` (bounded)
or the HTTP-poll `waitForServerReady` loop (bounded, condition-based).

## 4. Facts files

`facts.generated.json`: 12 entries (3 read-constant, 9 live-probe), 7
measured (WITNESSED), 5 unexercised. Sample:

```json
{"key": "A_engine_controls|playwright-boundingBox", "component": ".engine-controls",
 "state": "default locale, disconnected (cold boot, no backend/engine reachable)",
 "axis": "h", "method": "playwright-boundingBox", "value_px": 185, "unexercised": false}
```

**Methodological caveat, disclosed**: for elastic (`pref: 1fr`) leaves
(`tree`, the `#control-panel` Exclusive group), the measured value is
the LIVE GRID TRACK's granted share at 1920x1080 default state, not a
re-derivation of the encoding's own worst-case/breakpoint facts — these
numbers are genuinely different questions (§2 of the governing spec's
own `wrap-breakpoint` vs. `width-of` distinction). Reported as measured,
not force-fit into a discrepancy comparison that would compare apples to
oranges.

`facts.residue.json`: 20 hand-transcribed entries, top-level
`"status": "draft, pending commissioner ratification"` per ruling 5.
Sample:

```json
{"key": "AT_basic_scoreLead", "component": "frontend/src/components/charts/ScoreLeadPanel.vue",
 "value_px": 200, "axis": "v", "status": "estimated",
 "basis": "commonly-workable minimum legible chart height, not measured -- BaseChart declares height:100%..."}
```

## 5. Discrepancy table (measured vs. encoded)

| Component/state | Encoded literal | Harness measured | Note |
|---|---|---|---|
| `A_engine_controls`, width | `min 185px` | 185px (grid track) | Agrees exactly — but this confirms the GRID renders the declared min, not an independent re-derivation of the 184.03125px→185px breakpoint arithmetic itself (which needs the bespoke worst-case-label shadow-DOM rig `useEngineControlsRealization` already runs live, not reproduced by this generic harness). |
| `A_app`, height | `66px` (portrait) / `160px` (landscape) | 28px (landscape, 1920x1080) | Real disagreement, tabled for dispatch C — the live `.app-cluster` box measured smaller than either declared figure at this default state; not investigated further here (out of this dispatch's scope to explain, per the brief's "table it, don't fix it" instruction). |
| `tree`, width | `110px` (landscape, disclosed solver-only) / `140px` (portrait, live constant) | 614px | Not a disagreement — `tree` is the row's residual-holding leaf (`pref: 1fr`); 614px is the live-granted share at 1920x1080, not its floor. |
| `CP-*` Exclusive group | `min 664px` (both classes) | 828px | Not a disagreement, same reason — elastic leaf, granted share reported not floor. |
| `resizerOuter`/`resizerInner` | `1px` (read-constant, `RESIZER_WIDTH_PX`) | 1px | Agrees exactly. |
| `AT_multires` | `580px` (read-constant) | 580px | Agrees exactly (static source read, not independently live-remeasured). |
| `A_engine_eval`/`A_setup`/`boardRail`/`previewBoard` | various | UNEXERCISED | Gated on engine connection or a presence state this cold, unauthenticated, backend-less boot never reaches — matches the encodings' own disclosed isolation limit for exactly this component family. |

## 6. Gates — exact commands, exit codes

- `cd research/lyt && ~/w/vdc/venvs/generic/bin/python -m pytest tests/ -x -q`
  — **BEFORE** the fixture move (via `git stash`): exit 0, 375 passed.
  **AFTER**: exit 0, 375 passed. **FINAL** (after the SPEC.md/
  SPEC-AMENDMENTS.md/facts-file additions): exit 0, 375 passed.
- `cd frontend && npm install`: completed, 336 packages, no fatal errors
  (4 high-severity `npm audit` findings, pre-existing, out of this
  dispatch's scope).
- `cd frontend && node node_modules/playwright-core/cli.js install
  chromium`: completed (`npx playwright install --with-deps` failed —
  requires interactive sudo auth this sandbox doesn't have; the
  non-`--with-deps` form via the LOCAL `playwright-core`'s own CLI
  succeeded once the version mismatch against the globally-resolved
  `npx playwright` was worked around).
- `cd frontend && npm run build`: exit 0 (`vue-tsc -b && vite build`,
  1252 modules transformed, `dist/` produced).
- `systemd-run --user --scope -p MemoryMax=4G -- nice -n 19 node
  --max-old-space-size=2048 research/lyt/tools/probe_harness/measure.mjs
  --port 19200`: exit 0 (script's own final `console.log`, no thrown
  error) — WITNESSED, ran twice (once with the incorrect `#leaf-`
  selector assumption, once corrected).
- No frontend `src/` files were modified by this dispatch — `npm run
  lint`/a strict `npm run build` re-check beyond the one already run
  above were judged out of scope (the harness lives under
  `research/lyt/tools/`, not `frontend/`, and borrows the frontend's
  already-built `dist/`/`node_modules/` as a runtime dependency only).

## 7. Witness-status summary

- **WITNESSED**: both encodings read in full; loader.py/runner.py/the
  three wart fixtures/ogs.lyt/q5go.lyt read in full; the fixture-move
  reference audit (before/after grep, zero dangling hits); pytest
  before/after/final (375 passed, exit 0 all three times); `npm run
  build` (exit 0); the harness's own two real runs (facts.generated.json
  is real tool output, not authored); the three dangling dispatch-report
  citations (confirmed missing via `ls`, not fabricated).
- **REFUSED-AS-EXPECTED**: not directly re-exercised in this dispatch (no
  loader-refusal test was re-run standalone beyond the full pytest
  suite, which already covers `test_content_driven_sizing_is_rejected`
  / `test_system_release_presence_is_rejected` / `test_l2_violation_is_
  rejected` against the moved wart fixtures — all three passed as part
  of the 375).
- **UNEXERCISED, disclosed**: `LibraryPreviewPane.vue`/`StatusBar.vue`/
  `AnalysisTimelinePanel.vue`/`SettingsSubstrip.vue`/`TabWidget.vue` read
  only partially (headers + grep, not end to end) — a real, named
  narrowing; 5 of 12 `facts.generated.json` entries (engine-connected
  states, `A_setup`/`boardRail`/`previewBoard` at their toggle-on
  states) — gated on infrastructure (live KataGo engine, an
  authenticated backend) this sandboxed dispatch cannot stand up; the
  `A_engine_controls` worst-case-label breakpoint arithmetic itself
  (185px) was NOT independently re-derived by this harness — only the
  grid's rendering of the already-declared min was confirmed.

## STOP-and-report items

1. **Three dangling dispatch-report citations** in the encodings' own
   comment prose: `.claude/dispatch-reports/lyt-measurement-wave.md`
   (the real file is `lyt-measurement-encoding-pass.md`),
   `lyt-optionc-review.md` (real: `lyt-optionc-encoding.md` +
   `lyt-optionc-repair.md`), `lyt-realization-wave-review.md` (real:
   `lyt-realization-wave.md`). Not fabricated or silently corrected —
   named here for dispatch C or a documentation corrective to resolve
   (rename the citation, or confirm the cited report was never actually
   filed under that name).
2. **`A_app` height discrepancy** (66px/160px encoded vs. 28px measured
   at cold-boot default) — tabled in §5 above, not investigated further;
   a genuine finding for dispatch C, not a silent footnote.
3. **The harness's live-probe measurements for elastic leaves
   (`tree`, `#control-panel`) are NOT comparable to the encoded `min`
   figures** — they report the granted share, not the floor. Any
   future consumer of `facts.generated.json` should read each entry's
   own `state`/`method` fields rather than assume every entry is a
   floor re-derivation.
4. **`resizerOuter+resizerInner` read-constant entry returned `null`** —
   the `.panel-resizer` CSS rule its comment expected no longer exists
   verbatim in `App.vue` (retired/renamed since that comment was
   written); the live-probe entry for the same fact (1px, WITNESSED)
   supersedes it, but the dead read-constant entry is left in
   `facts.generated.json` with its own `error` field rather than
   silently dropped.

## Commit record

Two commits in this worktree (not pushed, not touching `main`/
`lyt-phase2` directly): the fixture-move commit and the relocation
+harness+facts-files commit. `git status --short` is clean of tracked
changes beyond these two commits (an untracked `.claude/logs/` directory
and `node_modules/`/`dist/`/`__pycache__` build artifacts are excluded,
none committed).
