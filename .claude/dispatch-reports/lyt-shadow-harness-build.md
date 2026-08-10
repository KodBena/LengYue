# LYT shadow-mode harness — build report

Phase 1 of the LYT adoption roadmap ("shadow mode"): zero user-visible change
to the SPA. Two deliverables, both landed:

1. **Codegen** (`research/lyt/emit_ts.py`) — solves `current-row-repaired`
   (`research/lyt/encodings/current_row_repaired.lyt`) at every
   representative screen size and emits the solved rectangles as a
   GENERATED TypeScript data module,
   `frontend/src/state/lyt-solved-layout.gen.ts`.
2. **Conformance harness** (`frontend/scripts/lyt-conformance.mjs`) — a
   Playwright script that serves the built SPA on a scratch port, measures
   the RENDERED DOM at each representative size, diffs against the solved
   geometry, and writes a date-stamped divergence report under
   `research/lyt/divergence/`.

Nothing in the SPA imports the generated module; nothing in the build,
test, or CI pipeline invokes the harness. Both are standalone tooling.

---

## Per-claim WITNESSED status

| Claim | Status | Evidence |
|---|---|---|
| Base rebased onto `next` (133e680f+), `SPEC-AMENDMENTS.md` present | WITNESSED | `git log --oneline -1 HEAD` = `133e680f`; `test -f research/lyt/SPEC-AMENDMENTS.md` succeeded |
| Required docs read end to end (ADR-0002) | WITNESSED | `frontend/CLAUDE.md`, `research/lyt/README.md`, `research/lyt/SPEC-AMENDMENTS.md`, `.claude/dispatch-reports/layout-language-consult.md` (700 lines, full document — §5.1/§6 cited only after full read) all read in full via the Read tool this session |
| `emit_ts.py` emits solved rects per representative size for `current-row-repaired` | WITNESSED | `python emit_ts.py` output: `1920x1080 status=OPTIMAL slots=45`, `2560x1440 status=OPTIMAL slots=45`, `1280x1024 status=OPTIMAL slots=45`, `1080x1920-portrait status=INFEASIBLE slots=0` |
| Generated `.gen.ts` header names tool/source/solve-inputs/regen-command, marked GENERATED | WITNESSED | see `frontend/src/state/lyt-solved-layout.gen.ts` lines 1-11 |
| No runtime import from app code | WITNESSED | `grep -rn "lyt-solved-layout" frontend/src --include='*.vue' --include='*.ts' | grep -v '\.gen\.ts'` returns nothing (only the harness script, outside `src/`, imports it) |
| Python gate green, tests added for the emitter (stable shape, deterministic ordering) | WITNESSED | `nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest research/lyt -q` → `41 passed` (33 baseline + 8 new `test_emit_ts_*` tests in `research/lyt/tests/test_lyt.py`) |
| `vue-tsc --noEmit` green (gen file typechecks) | WITNESSED | `nice -n 19 npx vue-tsc --noEmit; echo "TSC:$?"` → `TSC:0` |
| Full vitest suite unchanged-green, ~2930 tests (fresh-base check) | WITNESSED | `Test Files 235 passed \| 3 skipped (238)`, `Tests 2932 passed \| 4 skipped (2936)`, exit 0 |
| Conformance harness serves on scratch port ≥19100, off live ports | WITNESSED | ran on port 19100; script refuses ports <19100 at the CLI-arg level |
| Playwright discipline (systemd-run, MemoryMax=4G, js-flags, single instance, no waitForTimeout, nice) | WITNESSED | invoked as `nice -n 19 systemd-run --user --scope -p MemoryMax=4G -- node --max-old-space-size=2048 scripts/lyt-conformance.mjs --port 19100`; script launches Chromium with `--js-flags=--max-old-space-size=1024`, one `browser` instance closed in `finally`, every wait is `waitForSelector`/`waitForFunction`/polled-`fetch`, never `waitForTimeout` |
| Divergence report emitted, checked in under `research/lyt/divergence/`, date-stamped | WITNESSED | `research/lyt/divergence/2026-08-10T16-26-56-479Z-current-row-repaired.md` |
| Tolerance chosen and justified | WITNESSED | 3px per axis; rationale in the harness's `TOLERANCE_PX` comment and the report's own header |
| No app tuning to force a match | WITNESSED | no `frontend/src` component/style file touched this session (diff is additive: `emit_ts.py`, `lyt-solved-layout.gen.ts`, `lyt-conformance.mjs`, `divergence/*.md`, `tests/test_lyt.py`) |
| Gates run in foreground, explicit timeout, literal exit codes captured (no pipes) | WITNESSED | each gate command redirected to a log file and its exit code echoed separately, per the commission's own instruction |

---

## Slot → selector mapping table (45 slots)

The full table, with per-slot notes (conditional-mount caveats, dev-only
absences), lives in `frontend/scripts/lyt-conformance.mjs`'s
`SLOT_SELECTORS` constant and is reproduced verbatim at the top of every
generated divergence report. Summary:

- **41 slots have a selector.** Most are stable ids/classes read directly
  off the mount sites the consult document's own §2 census cites
  (`App.vue`, `Toolbar.vue`, `StatusBar.vue`, `SidebarWidget.vue`, etc.).
  Five (`mint`/`learn`/`play`/`match` by fixed `:nth-child` position,
  `connect` by `:last-child`, and the three chrome toggles by position in
  `.right-toggles`) rely on the template's own fixed child order rather
  than a unique class/id/`data-testid` — disclosed as positional, not
  content-driven, and only valid for a **production** build (the three
  dev-only buttons that would otherwise sit between `match` and `connect`
  are absent by construction from `npm run build`'s output).
- **4 slots are unmappable by design**: `jankTest`, `clearCache`,
  `autoNav`, `popStress` — all `v-if="isDevBuild"`, genuinely absent from
  a production DOM, no selector exists to write.
- **5 slots (`CP-library`/`cards`/`settings`/`analysis`/`other`) share one
  selector** (`#control-panel`) — correct per LYT's own `T()` (Exclusive)
  semantics: every child of a tab group receives the identical rectangle
  (§4.1 line 297-299), and `TabWidget.vue` renders every pane's content
  into one shared body, `v-show`-ing the active one.
- Several selectors (`engineMetrics`, `captureBanner`, `saveBanner`,
  `systemLog`, `setupChip`) are conditionally mounted at runtime
  (connection state / system-driven presence) — noted in the table so a
  reader isn't surprised when they measure absent on a cold, disconnected,
  message-free load, which is exactly what this harness's no-backend scope
  produces.

## Divergence headline (2026-08-10T16-26-56-479Z run)

| screen | solver status | match | divergent | unmappable |
|---|---|---|---|---|
| 1920x1080 | OPTIMAL | 0 | 36 | 9 |
| 2560x1440 | OPTIMAL | 0 | 36 | 9 |
| 1280x1024 | OPTIMAL | 0 | 36 | 9 |
| 1080x1920-portrait | INFEASIBLE | — (not measured; no solved geometry) | — | — |

Zero slots matched within the 3px tolerance at any measured size — expected
and disclosed up front (`README.md`, `SPEC-AMENDMENTS.md`): the encoding is
a hand-transcribed, hand-repaired description of the app's INTENDED
row-axis structure, not a byte-for-byte reflection of `App.vue`'s current
DOM (unmodeled `html`/`body` margins, `#main-area` padding, the
sidebar-collapse-rail's own box model, `--space-*` custom-property padding
on every leaf, etc. — none of which the LYT sizing stratum represents).
This is the deliverable, not a defect; nothing in the app was touched to
narrow the gap.

**Single most interesting divergence:** at 1280×1024, the eight toolbar
action buttons (`mint`/`learn`/`play`/`match`/`connect`) measure at
**two different `y` values within the same run** — `y=34` at 1920×1080 and
2560×1440, but `y=100` at 1280×1024 — while the solved geometry places
every one of them on the single `y=0` nav-bar row at every size. This is a
**live, runtime-observed instance of the exact L1 violation the consult
document names by file:line** (`Toolbar.vue:244`'s `flex-wrap`, `§5.1`'s
`⚠L1` on the nav bar's `max CONTENT`): the current app's toolbar row
genuinely **wraps to a second line** once the row gets narrow enough,
which is precisely the "toolbar's own height grows at narrow widths"
defect class LYT's `envelope: {single_line, wrapped_two_line}` repair
(applied to `current_row_repaired.lyt`'s nav-bar sizing, see that file's
own header) was written to acknowledge rather than silently absorb. The
harness didn't have to go looking for this — it fell out of measuring the
same encoding at three sizes and comparing y-coordinates.

---

## Scope discipline

No narrowing from the commission as given. Both deliverables cover exactly
`current-row-repaired` (the one encoding the commission named) at the four
representative sizes `research/lyt/runner.py` already defines — no other
encoding (`q5go`, `ogs`, `lengyue_landscape`/`portrait`) was extended with
codegen or harness coverage, since the commission's wording ("the
`current-row-repaired` encoding") named that one specifically.

## Files touched

- `research/lyt/emit_ts.py` (new)
- `research/lyt/tests/test_lyt.py` (appended: 8 new `test_emit_ts_*` tests)
- `frontend/src/state/lyt-solved-layout.gen.ts` (new, generated)
- `frontend/scripts/lyt-conformance.mjs` (new)
- `research/lyt/divergence/2026-08-10T16-26-56-479Z-current-row-repaired.md` (new, generated)
- `.claude/dispatch-reports/lyt-shadow-harness-build.md` (this report)

## License

Public Domain (The Unlicense).
