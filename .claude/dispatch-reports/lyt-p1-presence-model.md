Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).

# LYT presence arc P1 — the model side

Commission: presence arc P1, `research/lyt/` only, branch `lyt-phase2`.
Base `b73b1735`.

## Base freshness (FIRST ACT)

`git fetch origin` resolved `origin/lyt-phase2` to `b73b1735` — the
exact base commit named in the commission. This agent's own isolated
worktree started on an unrelated branch (`worktree-agent-
a194457e944f966b9`, tip `3378806f`, NOT an ancestor of `b73b1735`), so
a new branch, `lyt-phase2-work`, was cut directly from `b73b1735`
(fetched from `origin/lyt-phase2`, whose own tip is byte-identical to
the named base). `git merge-base --is-ancestor b73b1735 HEAD` — exit 0,
confirmed on the new branch before any other work, per the same
base-freshness discipline every prior LYT stage report in this
directory follows (the literal branch name `lyt-phase2` was unavailable
— already checked out in the shared main checkout, `/home/bork/w/omega`
— the same disclosed-deviation shape those reports use).

## Orientation reading (end to end, per ADR-0002/CLAUDE.md)

`research/lyt/SPEC.md` (full, 1742 lines, including the corrected
"nine amendments" / "Status of the other LYT documents" sections),
`research/lyt/SPEC-AMENDMENTS.md` (full, 1689 lines, Amendments 1-9 and
every dated correction/addendum), both encodings in full
(`lengyue_landscape.lyt`, 1318 lines; `lengyue_portrait.lyt`, 370
lines, including every header-comment line), `research/lyt/presence.py`
and `research/lyt/orientation.py` (full), and the three named dispatch
reports (`.claude/dispatch-reports/lyt-m2-b2b-ruling-census.md`, 461
lines; `lyt-measurement-wave.md`, 600 lines, found only in the shared
main checkout — not committed to this branch, read via absolute path;
`lyt-measurement-encoding-pass.md`, 308 lines) — all read completely
before any code was written. Relevant code sections consulted directly
against the running source as needed: `lyt_ast.py`'s `Presence`/`Leaf`/
`Slot` dataclasses, `loader.py`'s presence-loading branches for all
three node kinds, `wellformed.py`'s `find_l15_violations`/
`find_residual_child`, `runner.py`'s `Registration`/`run_all`,
`coverage_matrix.py`, `emit_ts.py`, `emit_mockup.py`.

## Work items

### 1. Control-panel demotion

**Grammar gap found, and the STOP-and-report call made about it.**
`@demote(<axis> <extent>)` (Amendment 8, L15) was leaf-only at
commission start — `loader._load_demote_presence` refused any other
node kind, and `presence.PresenceValuation`'s own identity namespace
was leaf-`widget`-id-only. The commission's own item 1 explicitly
directs encoding `@demote` "on the control-panel Exclusive," and item 2
(portrait) turns out to be UNREACHABLE without the same construct (the
control panel's own pinned 664px floor is what makes narrow portrait
widths infeasible; no leaf-level pruning inside the tab group can touch
it, since the group's componentwise-max floor is dominated by a
COMPOSITE child, `CP-analysis`, not a bare leaf). Given the commission
names this construct directly (not merely implies a possible need for
one), this was built rather than escalated as a bare STOP-item — but
the widening itself is disclosed as a real, scoped language extension,
not silently assumed already-legal:

- `loader._load_demote_presence` now also admits an EXCLUSIVE node,
  on the strength of a real structural fact a Split does not share
  (SPEC.md §2: every `T`-child already shares one rectangle and only
  one is ever visible, so the whole group is already ONE
  presence-relevant unit, the same way a single leaf is). A Split
  stays refused (`prohibition: "demote-on-non-leaf-non-exclusive"`) —
  its children are independently-addressable siblings, not
  alternatives; this widening does not extend there. The leaf-only
  preconditions (`activity occasional`, `content bounded`) do not
  apply to an Exclusive (neither field exists on that node kind); in
  their place, an Exclusive MUST carry a non-empty `[TAG]`
  (`prohibition: "demote-exclusive-without-tag"`), since that is what
  gives it an identity to be named absent by at all.
- `presence.py`'s `absent_widgets: FrozenSet[str]` namespace widens
  correspondingly — a leaf's own `widget` id OR a tagged Exclusive's
  own `[TAG]` string, one flat namespace (`prune_absent`,
  `validate_valuation`, `_collect_leaf_presence` all updated together,
  via one shared `_is_named_absent` predicate so the pruning and
  validation paths can never drift on which identities count).
- No new concrete syntax was invented — `@demote(<axis> <extent>)` and
  `[TAG]` both already existed; only their NODE-KIND eligibility
  widened. `SPEC.md` §16.1 and `SPEC-AMENDMENTS.md`'s Amendment 8 entry
  both carry a dated widening note.

**The threshold, derived from named facts (row 2047's own "a decision
posed in pixels is a defect" discipline).** Both encodings' own
control-panel `T(...)[BLACK BOX]` now declares `@demote(h <N>px)`,
where `<N>` is the sum of three ALREADY-NAMED facts in that same file —
never a freshly-invented number:

- **Landscape**: `664px` (T's own pinned floor, M2 stage B2a) +
  `110px` (`tree`'s own floor, W4 FLOOR SOFTENING) + `4px` (one
  `--space-tight` row gap, since `previewBoard` is already absent
  under `default`/`demoted`) = **778px**.
- **Portrait**: `664px` (SAME pinned T floor as landscape) + `140px`
  (`tree`'s own floor, portrait-specific,
  `TREE_PANEL_MIN_WIDTH_PX`) + `4px` (same gap tier) = **808px**.

Landscape's own `default_valuation` is UNCHANGED (row 2333's own "do
NOT shrink any desktop demand to get there") — the control panel stands
by default at every landscape representative size (all comfortably
above 778px). `coverage_matrix.py`'s own pre-existing "demoted"
diagnostic row (`DEMOTED_EXTRA_WIDGETS`) gains `"BLACK BOX"` alongside
`A_app`, exercising landscape's own control-panel absence as a
COVERAGE point, not a default-behavior change.

### 2. Portrait repetition-first presence set

`runner.Registration` gains an OPTIONAL per-class override,
`default_valuation_by_class: Dict[str, PresenceValuation]` (empty for
every registration but the lengyue one, byte-identical fallback to the
shared `default_valuation` otherwise) — needed because the shared
`default_valuation` object was previously the ONE valuation validated
against BOTH classes' trees; naming the control panel absent there
would have pruned it from landscape's own default too, violating row
2333. A new module-level seam, `runner.valuation_for_class(reg,
class_id)`, is the ONE place every consumer (`run_all`, `emit_ts.py`,
`emit_mockup.py`, `coverage_matrix.py`) now resolves "this class's own
default" through, so the override and the shared fallback can never
drift between callers.

Portrait's own `default_valuation_by_class["portrait"]` (named
`"default"`, matching the shared valuation's own name — each class's
default is already disambiguated by which page/JSON/print-line it
belongs to, so no name collision exists to avoid) adds `"BLACK BOX"`
to the existing `{boardRail, previewBoard, A_setup}` absent set —
board + `tree` (match/play, repetition-first: reviewing/replaying a
game) stay primary; the whole control-panel tab group (every
analysis-graph surface — `AT_*` — plus the browse tables, settings,
and debug panes it also collapses) is absent by default at every
portrait width, not merely below a dynamically-checked threshold (this
offline solver does not evaluate `demote_below_px` dynamically against
a solved size — see `orientation.py`'s own "WHY THIS IS SOLVER-INERT"
section for the identical reasoning already established for L14's role
frame; `@demote`'s threshold is a REALIZATION-facing fact, and
"absent under `default`" is a static, registration-declared valuation
the same way `boardRail`/`previewBoard` already are).

`tree` itself is NOT demoted — per SPEC.md §17 (Amendment 9, M2 stage
B2a), it is the row's residual-holding sibling, and per the
repetition-first disposition it is a primary surface, not secondary.

**Goal fact, verified.** The three portrait `default` INFEASIBLE
points (420x880/540x960/768x1024) are now `OPTIMAL` — see the coverage
table below for the full before/after, point by point.

### 3. The zero-height tree row at portrait 768x1024 (row 2350)

**Diagnosis: MODEL-SIDE, a genuine solver verdict under current facts
— NOT fixed by the presence edits above, and not a realization bug.**

Direct solve at exactly 768×1024, under portrait's NEW default
valuation (control panel genuinely absent):

```
tree   root/V3/H0   x=0 y=1024 w=768 h=0
```

`tree`'s row (`{pref 1fr, gap 4px} H(tree, T(...), previewBoard)`) is
itself a child of the root `V(...)`, which partitions HEIGHT — the
ROW's own sizing block declares NO `min` of its own (defaults to `0px`
per SPEC.md §1.1's completion rule), so nothing stops the solver's
board-maximize-first objective stage from squeezing this row's own
solved height to a literal, honestly-reported zero once every other
sibling (the board composite, the toolbar strips) has claimed its
share of the 1024px budget. Once the ROW's own height is 0, `H`'s
cross-fill semantics (§2) force every child inside it — `tree`
included — to inherit that same 0px height. `tree`'s OWN declared
floor (`min 140px`) is a WIDTH constraint (the axis this row's `H`
partitions), never a height one, so it never engages here.

This is specific to 768×1024's own aspect ratio, not a general defect
— re-solving at the other four portrait representative points finds
tree_rect heights of 512px (1080×1920), 72px (1200×1600), 92px
(540×960), and 132px (420×880); only 768×1024 degenerates to exactly
0. The presence edits above make this point SOLVABLE at all (it was
outright `INFEASIBLE` before), but they do not address this narrower,
pre-existing gap (the row's own missing floor) — a genuine model
weakness, honestly reported rather than silently absorbed or
unilaterally patched: giving this row its own explicit `min` (e.g.
matching `tree`'s own established floor) is a further, disclosed model
decision this session did not make unasked, named here as a
recommendation for a follow-up stage.

### 4. Horizontal-tree check

Re-ran the derived-orientation probe (`wellformed.find_residual_leaves`
+ `orientation.derive_orientation`) at every representative size where
the panel demotes:

**Landscape (`demoted` diagnostic valuation — the panel is NOT absent
under landscape's own `default`):**

| size | status | tree rect (x,y,w,h) | derived orientation |
|---|---|---|---|
| 1920x1080 | OPTIMAL | 1100,84,820,996 | v |
| 2560x1440 | OPTIMAL | 1740,84,820,1356 | v |
| 1280x1024 | INFEASIBLE | — | — |
| 1024x700 | OPTIMAL | 660,84,364,616 | v |

**Portrait (`default` — the panel IS absent here, per item 2):**

| size | status | tree rect (x,y,w,h) | derived orientation |
|---|---|---|---|
| 1080x1920 | OPTIMAL | 0,1408,1080,512 | h |
| 1200x1600 | OPTIMAL | 0,1528,1200,72 | h |
| 768x1024 | OPTIMAL | 0,1024,768,0 | v (degenerate — item 3's own zero-height finding; `derive_orientation`'s own documented `h<=0` fallback, not a fresh bug) |
| 540x960 | OPTIMAL | 0,868,540,92 | h |
| 420x880 | OPTIMAL | 0,748,420,132 | h |

**Report.** The commissioner's original goal becomes real for
PORTRAIT: once the control panel is genuinely absent, `tree` becomes
its row's sole occupant, the row's own width equals the full viewport
(wide) while its height is whatever the root `V`'s partition grants it
(narrow, at every representative size except the degenerate 768x1024
point) — 4 of 5 points derive `'h'`, landscape-oriented, exactly as
anticipated. For LANDSCAPE's own diagnostic "demoted" scenario, the
outcome is HONESTLY DIFFERENT from what the illustrative framing might
suggest: the side column itself is a narrow VERTICAL strip (820px/
820px/364px wide vs. 996px/1356px/616px tall at the three solvable
points) — `tree`'s residual box there is taller than wide at every size
that solves, so the derivation stays `'v'`, not `'h'`. This is a real,
disclosed geometry fact (the side column's own shape), not a defect in
the demotion mechanism or the derivation — reported as found, not
forced to match a prior expectation.

### 5. Ride-along: `orientation.py`'s stale docstring

Fixed. `rebind`'s own docstring claimed `tree` was still `FIXED
(min==pref==max)` and "not residual-holding" — true at Amendment 9's
own original writing, false since M2 stage B2a's own encoding swap
(SPEC.md §17.4's own corrected account, which this session's fix now
matches). Also corrected the stale "THREE... `settingsPane`/
`otherBand`" enumeration: `find_residual_leaves`, run directly against
both committed files, names exactly `B`/`tree`/`otherBand` today —
`settingsPane` was a FOURTH residual-holding leaf for one stage's
duration (B2a) but dropped back out at stage B2b when it was opened
into a `T` of six named sub-panes (a Split/Exclusive residual-holder
contributes no derivation subject, since `orient` is leaf-only). The
new docstring text names this full arc rather than repeating the stale
snapshot.

### 6. STOP-and-report items

None required inventing new grammar beyond the scoped widening item 1
already discloses (existing `@demote`/`[TAG]` syntax, widened
node-kind eligibility only). One recommendation, not acted on
unilaterally: item 3's own zero-height-row finding names a genuine gap
(the tree/panels row's own missing `min`) that a future stage could
close with an explicit floor — left open per this session's own
minimal-touch scope, not silently patched.

## Gates

**`research/lyt` pytest, literal exit code:**

```
$ nice -n 19 /home/bork/w/vdc/venvs/generic/bin/python -m pytest research/lyt/tests -q
367 passed in 4.08s
$ echo $?
0
```

367 passed both before and after this session's edits — one net new
test (`test_demote_accepts_a_tagged_exclusive`), two renamed/split
(`test_demote_refuses_a_container[V]`/`[T]` → `test_demote_refuses_a_split`
/ `test_demote_refuses_an_untagged_exclusive`, since the two shapes now
diverge in their own refusal reason), one existing test's own pinned
`known_infeasible_by_valuation` set updated (three portrait `default`
entries removed, individually disclosed inline where they were pinned)
— every edit is a direct, disclosed consequence of the widening or the
feasibility flip, not a weakened assertion.

**`coverage_matrix.py` before/after, every status delta named:**

| class | valuation | size | before | after | delta |
|---|---|---|---|---|---|
| landscape | all-present | 1920x1080/2560x1440/1280x1024 | INFEASIBLE/INFEASIBLE/INFEASIBLE | unchanged | — |
| portrait | all-present | 1080x1920/1200x1600 | OPTIMAL/OPTIMAL | unchanged | — |
| portrait | all-present | 768x1024/540x960/420x880 | INFEASIBLE | unchanged | — (diagnostic-only, pre-existing, presence-independent) |
| landscape | default | 1920x1080/2560x1440 | OPTIMAL | unchanged | — |
| landscape | default | 1280x1024 | INFEASIBLE | unchanged | — (pre-existing, presence-independent, Amendment 4's own disclosure) |
| portrait | default | 1080x1920/1200x1600 | OPTIMAL | unchanged | — |
| portrait | default | **768x1024** | **INFEASIBLE** | **OPTIMAL** | **CHANGED** |
| portrait | default | **540x960** | **INFEASIBLE** | **OPTIMAL** | **CHANGED** |
| portrait | default | **420x880** | **INFEASIBLE** | **OPTIMAL** | **CHANGED** |
| landscape | demoted | 1920x1080/2560x1440 | OPTIMAL | unchanged | — |
| landscape | demoted | 1280x1024 | INFEASIBLE | unchanged | — (control-panel demotion alone doesn't fix it — a different floor collision) |
| portrait | demoted | 1080x1920/1200x1600 | OPTIMAL | unchanged | — |
| portrait | demoted | **768x1024/540x960/420x880** | **INFEASIBLE** | **OPTIMAL** | **CHANGED (rides the same default-valuation fix)** |

Six status changes total, all `portrait`, all `INFEASIBLE → OPTIMAL`,
zero landscape/desktop changes (row 2333 respected by construction and
verified by direct re-solve).

**`.gen.ts` regeneration (both):** `emit_layout_tree.py --registration
landscape`/`--registration portrait` re-run; `frontend/src/state/
lyt-layout.gen.ts`/`lyt-layout-portrait.gen.ts` are BYTE-IDENTICAL to
the committed files (verified via diff, zero output) — this arc's own
edits are presence/valuation facts, none of which this emitter reads
(it uses its own separate, hand-maintained `default_visible_by_path`
static map, untouched by this session). No regeneration needed; the
committed files are correct as-is.

**Mockups:** `emit_mockup.py` regenerated (`mockups/landscape.html`
unchanged, 48625 bytes; `mockups/portrait.html` changed — one line, the
embedded solved-data JSON blob, 51653 → 49399 bytes, reflecting the
three newly-OPTIMAL points' real per-widget rects replacing empty
`{}` slot maps).

**Frontend `npm run build`:** exit 0, 1249 modules transformed, built
in 2.04s (pre-existing "chunks larger than 500kB" warning, unrelated,
present before this session too). `node_modules` symlinked from the
main checkout (`package-lock.json` diffed byte-identical first,
matching the measurement-wave report's own established precedent for
this worktree class).

**Frontend `npm run test:run`** (`NODE_OPTIONS=--max-old-space-size=2048
VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 nice -n 19`): exit 0 — 257 test
files passed, 3 skipped (260); 3181 tests passed, 8 skipped (3189). No
failures — expected, since no `frontend/src` file was touched this
session. `tests/integration/App-boot.test.ts` (the widget-id-registry
boot-crash guard the umbrella's own measurement-wave report names as
this codebase's single most load-bearing regression test) confirmed
green in isolation too: `npx vitest run tests/integration/App-boot.
test.ts` → 2 passed, exit 0. No `frontend/src/state/lyt-widget-registry.
ts`/`App.vue` edit was made or needed this session (this arc never adds
or renames a widget id the registry doesn't already know — `@demote`/
`[TAG]`/per-class valuations are entirely `research/lyt/`-side facts),
so this test's own ability to catch an unregistered id is unchanged,
not merely re-passing by coincidence.

## Discipline notes

- Scope held to `research/lyt/` plus the two emitter-consumer checks
  (`.gen.ts` regeneration — confirmed byte-identical, not re-committed
  since there is no diff — and `mockups/` regeneration, committed) and
  this dispatch report. No `frontend/src` component/composable code was
  touched.
- No px used as bare reasoning currency without a cited basis — the
  778px/808px thresholds are both sums of three already-named facts
  each, derivation shown in both encodings' own header comments and
  above.
- No wall-clock sleeps; every solve/test run went through `nice -n 19`;
  the frontend test:run was backgrounded and awaited via its own
  completion notification, not polled.
- No touch to ports 4173/5173/5174/8764/1235/1242/195xx or any live
  process/DB.
- `autoharn`/`deployment.json` (the ledger-governance tooling, copied
  from the main checkout per the same precedent the M2b2b census report
  already discloses) and `research/lyt/coverage_matrix_result.json`
  (a generated scratch artifact from this session's own witness runs)
  are left untracked — operational/generated, not part of the
  deliverable.

## Commit

Committed on this worktree's own branch, `lyt-phase2-work` (cut
directly from `origin/lyt-phase2` at `b73b1735`, the exact commit named
in this commission — see "Base freshness" above for why a differently-
named branch was needed). Not pushed/merged by this session — that
integration step is left to the commissioning orchestrator, per this
commission's own "Commit on your worktree branch" instruction (not
"push").

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source code,
so no header is added to it).
