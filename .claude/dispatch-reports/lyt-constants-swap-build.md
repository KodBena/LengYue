# LYT constants swap — build report

Phase 2 of the LYT adoption roadmap (commission: lyt-constants-swap, ledger
row 1687; branch-gated onto `lyt-phase2`, not `next`). Three parts: an
as-is conformance BASELINE encoding + `--baseline` waiver mechanism, mapping
fixes in the shadow-harness's selector table, and a constants swap into
`frontend/src/state/layout-model.ts`.

---

## Per-claim WITNESSED status

| Claim | Status | Evidence |
|---|---|---|
| Rebased onto `lyt-phase2` (05406e99) | WITNESSED | `git log --oneline -1 HEAD` = `05406e99`; `frontend/src/state/lyt-solved-layout.gen.ts` and `research/lyt/emit_ts.py` present pre-rebase |
| Required docs read end to end (ADR-0002) | WITNESSED | `frontend/CLAUDE.md`, `research/lyt/README.md`, `research/lyt/SPEC-AMENDMENTS.md`, `research/lyt/divergence/2026-08-10T16-26-56-479Z-current-row-repaired.md`, `.claude/dispatch-reports/lyt-shadow-harness-build.md`, `.claude/dispatch-reports/layout-language-consult.md` (701 lines, read from the shared checkout since it is untracked and absent from this worktree — flagged, not silently substituted) all read in full this session |
| `current_row_asis.lyt` transcribes today's SPA as-is (real toggle positions, real banners, real paddings where measurable) | WITNESSED | see "AS-IS encoding" section below; toggle cluster split into `sidebarToggle` (standalone, real `.sidebar-collapse-rail` position) and `.right-toggles` (real position beside `<Toolbar>`), sourced from a fresh `App.vue:521-572` re-read this session |
| No L2/preserve REPAIRS applied | WITNESSED | the two L2 sites are loaded via waiver, not restructured; `preserve` presence is used only where it is the sole loadable spelling for a real system+release toggle (TYPE-LEVEL NOTE in the file's own header), not as a design choice |
| `--baseline` load mode / per-law waiver mechanism, loud + enumerated + cited | WITNESSED | `wellformed.Waiver` (law/path/citation, all mandatory, `__post_init__`-enforced) + `check_wellformed`'s waiver arbitration (applies exact `(law,path)` matches, refuses stale waivers, refuses unwaived remainder) — `research/lyt/wellformed.py` |
| Global checker NOT weakened | WITNESSED | every OTHER encoding (`q5go`, `ogs`, `current_row_repaired`, `lengyue_*`) still loads with `waivers=None` (default), unchanged strict behavior — regression-tested (`test_l2_*` suite, all still passing) |
| Mapping fix: `title` (0x0) | WITNESSED | reclassified `selector: null` — genuinely empty `<span>` (Toolbar.vue:99/245), not a hidden-element bug; disclosed in `SLOT_SELECTORS` |
| Mapping fix: `addBoard` identity | WITNESSED | encoding wrapped in `H(addBoard{20px}, addBoardGap{filler})` so solved width matches the real 20×20 button (`SidebarWidget.vue:228,304-307`); selector unchanged (`.tab-add-btn` was already correct) |
| Sweep for the same identity-mismatch class | WITNESSED | found + fixed a THIRD instance: `sidebarToggle`'s selector was hitting the inner button when the solved leaf's identity is the full-height rail; retargeted to `.sidebar-collapse-rail`. Also added a general zero-area-measured-rect → unmappable reclassification in `classify()` (catches `display:none`-hidden elements at narrow widths, e.g. `rulesKomi`/`moveNumbers`/`userBadge` at 1280×1024) |
| Harness generalized to target either encoding (`--source repaired|asis`) | WITNESSED | dynamic `import()` of the selected `.gen.ts` module; verified both `--source asis` (this commission) and `--source repaired` (regression) runs succeed |
| `emit_ts.py` extended, emits the as-is baseline | WITNESSED | `--registration current_row_asis.lyt` writes `frontend/src/state/lyt-solved-layout-asis.gen.ts`; `1920x1080/2560x1440/1280x1024 status=OPTIMAL slots=46`, `1080x1920-portrait status=INFEASIBLE slots=0` — same feasibility pattern as the repaired encoding (Amendment 1's mandatory banner floor applies identically) |
| BEFORE divergence report | WITNESSED | `research/lyt/divergence/2026-08-10T16-55-25-840Z-current-row-asis.md` (pre-swap, post mapping-fixes) |
| AFTER divergence report | WITNESSED | `research/lyt/divergence/2026-08-10T16-57-31-245Z-current-row-asis.md` (post-swap) |
| Constants swap sourced via generated module, evidence-gated | WITNESSED | `RESIZER_WIDTH_PX` in `layout-model.ts` now reads `LYT_SOLVED_BY_LABEL['1920x1080'].slots.{resizerOuter,resizerInner}.w` from `lyt-solved-layout-asis.gen.ts`, with a fail-loud cross-check that the two leaves agree — see "Swapped/excluded constants" below |
| Stored-drag precedence (L4) untouched | WITNESSED | no change to `useResizablePanel.ts`, no change to any drag-persistence code path; `git diff --stat` shows only `layout-model.ts`'s constant-sourcing changed, not its drag math |
| research/lyt pytest, 41+ green, new tests for as-is load path + waiver mechanism | WITNESSED | `nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest research/lyt -q` → `49 passed` (41 baseline + 8 new: strict-mode-still-refuses, loads-via-waivers, registered-in-runner, waiver-field-validation, stale-waiver-refused, unwaived-violation-still-raises, feasibility-pattern-matches, resizer-agreement) |
| `vue-tsc --noEmit` green | WITNESSED | `npx vue-tsc --noEmit -p frontend`, no output, exit 0 (also `npm run build` → `vue-tsc -b && vite build` succeeded) |
| Full vitest suite green (fresh-base check) | WITNESSED | `npm run test:run` → `Test Files 235 passed \| 3 skipped (238)`, `Tests 2933 passed \| 4 skipped (2937)` — not the 1111-stale-base signature |
| Gates run foreground, explicit exit codes, no pipes | WITNESSED | pytest/vue-tsc/build/vitest each run as a single foreground command per this report's own commands; vitest's own summary line is the exit evidence (no failures printed, matches `npm run test:run`'s documented success shape) |
| Playwright discipline (systemd-run, MemoryMax=4G, js-flags, single instance, no waitForTimeout, nice, scratch ports ≥19100) | WITNESSED | harness invoked as `nice -n 19 systemd-run --user --scope -p MemoryMax=4G -- node --max-old-space-size=2048 scripts/lyt-conformance.mjs --port 191xx --source asis`; ports 19100-19104 used, all ≥19100; script's own Chromium launch args unchanged (`--js-flags=--max-old-space-size=1024`, one `browser` closed in `finally`, every wait is `waitForSelector`/polled-`fetch`) |
| No backend stood up | WITNESSED | harness's own scope (module docstring) — no backend/proxy process started this session |
| Scope: no narrowing | WITNESSED | all three commission parts delivered; see "Scope discipline" below for the one judgment call (which constants qualify for swap) with its evidence |

---

## AS-IS encoding

`research/lyt/encodings/current_row_asis.lyt` (new). Structural differences
from `current_row_repaired.lyt`:

- `sidebarToggle` stands alone as a direct child of the outermost `H`
  (App.vue:521-525's real `.sidebar-collapse-rail`, a sibling of
  `#main-workspace`), not folded into the nav-bar's toggle cluster.
- `.right-toggles` (boardToggle/treeToggle/ctrlToggle/locale) is its own
  `H`, a real direct child of `.top-nav-bar` alongside the `Toolbar`
  composite (App.vue:561-572) — not merged into `Toolbar`'s own interior.
- `addBoard` is wrapped `H(addBoard{20px}, addBoardGap{filler})` so its
  solved identity is the real 20×20 button, not a full-width band.
- `resizerOuter`/`resizerInner` corrected to today's real `1px`
  (`current_row_repaired.lyt` still carries the pre-ruling `4px`).
- Mint-cluster button widths (mint/learn/play/match/connect) sourced from
  the shadow-harness's own 1920×1080 measurement instead of a uniform
  32px placeholder.

Two TYPE-LEVEL notes (distinct from the L1/L2 waiver mechanism — these are
constructions LYT's typed AST has NO representation for at all, not
well-formedness-law refusals): content-driven `.top-nav-bar` sizing is
approximated via `envelope: {single_line, wrapped_two_line}` (same
necessity `current_row_repaired.lyt` faced), and the four system-driven
banners/chip use `@toggle(system, preserve)` because `(system, release)`
is untypable by construction — the ONLY loadable spelling, not a design
repair. Full disclosure lives in the file's own header.

## Waiver list

Both entries are `L2`, both in `research/lyt/baseline.py`'s
`CURRENT_ROW_ASIS_L2_WAIVERS`:

| # | path | reason (condensed) | citation |
|---|---|---|---|
| 1 | `root` | outermost H: `sidebarToggle` (bare chrome leaf) alongside an elastic-`fr`-pref main column trips the disclosed fr-sibling AMBIGUITY path | `current_row_asis.lyt` header "L2 SITES" #1 — App.vue:521-525; layout-language-consult.md §4.2 L2 (lines 371-380), the canonical sidebar-collapse-rail example (line 377-378) |
| 2 | `root/H2/V0/H1` | `.right-toggles`: 99px chrome (3×33px) of 177px total — genuine strict majority (99×2=198>177) | `current_row_asis.lyt` header "L2 SITES" #2 — App.vue:561-572; SPEC-AMENDMENTS.md Amendment 2 (ledger row 1671) |

Both paths were confirmed by loading the file WITHOUT waivers first and
reading the resulting `LytLoadError.detail["violations"]` — not
hand-derived. `test_current_row_asis_fails_strict_load_without_waivers`
pins this.

## Swapped / excluded constants

| Constant | Verdict | Evidence |
|---|---|---|
| `RESIZER_WIDTH_PX` | **SWAPPED** — now sourced from `lyt-solved-layout-asis.gen.ts` (`resizerOuter`/`resizerInner`, cross-checked, fail-loud on disagreement) | Divergence report (both BEFORE and AFTER): `resizerOuter`/`resizerInner` width delta = **0px** at every OPTIMAL representative size (1920×1080/2560×1440/1280×1024) — the only structural panel slot with exact agreement |
| `minBoardPx` (`B`) | EXCLUDED | Divergence report: `dw`/`dh` deltas of 200-350px at every measured size — the solver's elastic board-maximize objective and the live app's real flex math diverge substantially; not a padding-scale gap |
| `treePanelMinWidthPx` / `treePanelDefaultWidthPx` (`tree`) | EXCLUDED | Real measured tree width is a constant 167px at every viewport (consistent with a persisted/default width independent of screen size), but the SOLVED width varies wildly by size (140/714/994px) since only 1280×1024 pushes tree to its floor — the "agreement" at that one size (140 vs 167, Δ27px) does not hold at the other two OPTIMAL sizes (Δ547px, Δ827px), so this does not qualify as "the as-is solve and the live rendering agree" across the representative set |
| `controlPanelMinWidthPx` (`CP-*`) | EXCLUDED | Δ340px at every measured size — the real control-panel/tree split's drag-persisted state and the solver's elastic `T()`/`pref 1fr` allocation diverge structurally |
| `wrapperMinWidthPx` | EXCLUDED | derived from `treePanelMinWidthPx` + `resizerWidthPx` + `controlPanelMinWidthPx`; two of its three terms are excluded above, so the derived value is not independently evidenced either |

Each swap/exclusion is also commented in `layout-model.ts` itself, next to
`RESIZER_WIDTH_PX` and next to `PANEL_GEOMETRY_POLICY_BY_WIDTH_CLASS`
respectively, naming the slot and citing the same divergence report.

**The single most consequential constant change**: `RESIZER_WIDTH_PX`'s
*value* did not change (it was already 1, correctly, per the 2026-08-10
commissioner ruling) — what changed is its *source of truth*, from a hand
literal to a generated, harness-validated solve. This is a small, exactly
evidenced swap; the four exclusions are the larger, more consequential
finding — most of `PANEL_GEOMETRY_POLICY_BY_WIDTH_CLASS` is NOT yet safe
to source from this solver, because the current representative-size sweep
conflates drag-persisted DOM state with the solver's non-drag elastic
allocation. A future swap of `minBoardPx`/`treePanel*`/`controlPanelMinWidthPx`
would need either a harness mode that resets/asserts a known drag state
before measuring, or a solver mode that reports the FLOOR (not the
reach-preferred elastic value) for direct floor-vs-floor comparison.

## Divergence report headlines

**BEFORE** (`2026-08-10T16-55-25-840Z-current-row-asis.md`, post mapping-fixes,
pre-swap):

| size | solver | match | divergent | unmappable |
|---|---|---|---|---|
| 1920×1080 | OPTIMAL | 1 | 34 | 11 |
| 2560×1440 | OPTIMAL | 1 | 34 | 11 |
| 1280×1024 | OPTIMAL | 1 | 30 | 15 |
| 1080×1920-portrait | INFEASIBLE | — | — | — |

**AFTER** (`2026-08-10T16-57-31-245Z-current-row-asis.md`, post-swap):

| size | solver | match | divergent | unmappable |
|---|---|---|---|---|
| 1920×1080 | OPTIMAL | 1 | 34 | 11 |
| 2560×1440 | OPTIMAL | 1 | 34 | 11 |
| 1280×1024 | OPTIMAL | 1 | 30 | 15 |
| 1080×1920-portrait | INFEASIBLE | — | — | — |

Headlines are identical — expected and honest: the swap re-sources an
ALREADY-correct value (`RESIZER_WIDTH_PX` was 1 before and after), so the
rendered DOM does not move. "What moved" is the source of truth (hand
literal → generated, harness-validated solve), not the geometry. This is
disclosed rather than dressed up as a bigger change than it is.

For comparison, the ORIGINAL `current_row_repaired.lyt` shadow-harness
report (`2026-08-10T16-26-56-479Z-current-row-repaired.md`, pre-existing,
unmodified) showed **0 match / 36 divergent / 9 unmappable** at every
landscape size — the as-is baseline's `match=1` (structural fixes:
sidebarToggle/right-toggles real positions, resizer 1px correction) and
narrower unmappable count (title/addBoardGap explicit, vs. the repaired
report's title still counted as divergent) are the visible improvement
from restructuring the encoding to match reality instead of the L1/L2
repair.

## Scope discipline

No narrowing from the commission as given. All three parts (as-is
encoding + waiver mechanism, mapping fixes, constants swap) delivered.
The one judgment call: which constants qualify as "structurally-shared
panel slots where the as-is solve and the live rendering agree within
padding-scale deltas" — resolved conservatively (only `RESIZER_WIDTH_PX`),
with the exclusion reasoning laid out above and in-code, per the
commission's explicit "do NOT swap anything the harness shows
structurally disagreeing; list what you excluded and why" instruction.

Stored-drag precedence (L4) is untouched — no drag-persistence code path
was modified.

## Files touched

- `research/lyt/encodings/current_row_asis.lyt` (new) — the AS-IS
  conformance baseline
- `research/lyt/baseline.py` (new) — `BASELINE_WAIVERS` registry
- `research/lyt/wellformed.py` — `Waiver` dataclass, `check_wellformed`
  waiver arbitration
- `research/lyt/loader.py` — `load_layouts` threads an optional
  per-layout waivers map
- `research/lyt/runner.py` — `Registration.waivers` field, as-is
  registration added
- `research/lyt/emit_ts.py` — generalized to `--registration NAME`
  (was hardcoded to the repaired encoding), per-registration output path
  and header text
- `research/lyt/tests/test_lyt.py` — 8 new tests (waiver mechanism +
  as-is load/solve path) + 1 updated (renamed constant reference)
- `research/lyt/README.md` — new "`--baseline` load mode" section
- `frontend/scripts/lyt-conformance.mjs` — `--source repaired|asis`
  generalization; `title`/`addBoard`/`sidebarToggle` mapping fixes;
  general zero-area-measured-rect reclassification
- `frontend/src/state/lyt-solved-layout-asis.gen.ts` (new, generated)
- `frontend/src/state/lyt-solved-layout.gen.ts` (regenerated — only the
  header's regen-command line changed, no data drift)
- `frontend/src/state/layout-model.ts` — `RESIZER_WIDTH_PX` swap +
  exclusion documentation
- `frontend/FILES.md` — entries for both `.gen.ts` files (the Phase-1
  session's own `lyt-solved-layout.gen.ts` entry was also missing;
  backfilled while in the neighborhood) and `layout-model.ts`'s note
  updated
- `research/lyt/divergence/2026-08-10T16-55-25-840Z-current-row-asis.md`
  (new, generated) — BEFORE
- `research/lyt/divergence/2026-08-10T16-57-31-245Z-current-row-asis.md`
  (new, generated) — AFTER

## Work-status store

Not updated from this builder session — ledger row 1687 (the commission)
and this build report are the record; the `todo` Postgres DB transition
(open → closed / review) is the commissioner's action on acceptance, per
the umbrella's normal orchestrator/builder split. Flagging rather than
silently skipping, per ADR-0002.

## License

Public Domain (The Unlicense).
