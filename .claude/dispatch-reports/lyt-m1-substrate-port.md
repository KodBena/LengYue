# LYT M1 — substrate port from the model-iteration loop experiment to mainline

Commission: M1 of the model-implementation arc (ledger rows 2107/2108;
the ratified program row 1937 continues), worktree
`.claude/worktrees/agent-aef9e8a4d5a75cea6`, branch
`worktree-agent-aef9e8a4d5a75cea6`, cut from `lyt-phase2` at `9fbc899b`.
This report is the deliverable named in the brief.

## Summary

Ported the four keys (`ceiling`, `unit <axis> <px>`, `wrap <policy>`,
`measure-bound`) and three laws (L9 ceiling honesty, L10 unit integrity,
L11 measure integrity) formalized on the `lyt-model-loop-experiment`
branch (rounds 3/5/6, consolidated and verified by that branch's own
`lyt-substrate-consolidation` commission) to mainline `research/lyt` —
`parser.py`/`loader.py`/`lyt_ast.py`/`wellformed.py`. Ported the
experiment's 46-test `test_loop_laws.py` near-clean. Added
`SPEC-AMENDMENTS.md`'s Amendment 7 entry and `SPEC.md` §15. Verified
dormancy for both mainline encodings two ways: the full mainline suite
(now 223 tests, was 177) passes with zero regressions, and both
`lengyue_landscape.lyt`/`lengyue_portrait.lyt` re-solve via `runner.py`
to **byte-identical stdout** before and after this change. Frontend
gates (`npm run build`, `npm run test:run`) pass at exit 0 with zero
frontend source changes.

## Base-freshness check (FIRST ACT)

The worktree's initial `HEAD` (`3378806f`) predated `lyt-phase2`'s tip
and was NOT an ancestor of it in the reverse direction —
`git merge-base HEAD lyt-phase2` resolved to `3378806f` itself (i.e.
`3378806f` IS an ancestor of `lyt-phase2`, just stale/behind, not
diverged). Fast-forwarded via `git merge --ff-only 9fbc899b` before any
substantive work — clean fast-forward, 1045 files updated, no conflicts.

## Orientation read (end to end, per ADR-0002/CLAUDE.md)

`CLAUDE.md` (umbrella root), `docs/adr/0000-the-alpha-and-the-omega-
type-driven-design.md`, `docs/adr/0002-fail-loudly.md`,
`research/lyt/SPEC.md` (1280 lines, both pages), `research/lyt/
SPEC-AMENDMENTS.md` (872 lines) — all read start to finish before any
claim referencing them was made. On the experiment branch
(`lyt-model-loop-experiment`, read-only via `git show`/`git log`, never
checked out): `.claude/dispatch-reports/lyt-substrate-consolidation.md`
(402 lines, full) and the four named commits (`457c6258`, `36f4defa`,
`a102f13b`, `b5f3c43b`), plus the earlier iteration commits that
actually introduced the language machinery (`b556e02c` round 3,
`ebfe90a3` round 5, `e75ab790` round 6 — the consolidation commits
themselves only fix/renumber/test/document; the substrate-introducing
diffs live on the iteration commits, so those were read directly).

## Per-key port notes

All four keys' implementations reference no encoding-specific fact
anywhere (no widget id, tree path, or specific pixel value baked into
any accept/refuse rule) — every rule is stated purely in terms of node
kind, declared `content` class, declared axis, and tree structure. **No
generalizing was needed for any of the four keys or three laws** — the
port is a clean carry with renumbered citations only:

- **`ceiling` (L9)** — `loader._load_ceiling_flag`: leaf-only, requires
  `content bounded`, solver-inert. Ported clean from `b556e02c`, comment
  provenance updated `LOOP ITERATION 3, ledger rows 2037/2038` →
  `AMENDMENT 7, ledger rows 2107/2108`; law token `L6` → `L9` (direct
  mainline numbering, not routed through the experiment's own
  intermediate `L6` — the experiment's renumbering commit `36f4defa` was
  read to confirm the final `L9` form, then applied directly).
- **`unit <axis> <px>` (L10)** — `loader._load_unit_axes` (load-time
  half) + `wellformed.find_l10_violations` (structural half). Ported
  clean from `ebfe90a3` + `36f4defa`'s renumbering. `Leaf.unit_axes`
  gained the same `__post_init__` construction-time guard
  (axis/positivity/no-duplicate) the experiment's `lyt_ast.py` carries.
- **`wrap <policy>`** — `loader._load_wrap_policy`. Ported clean from
  `e75ab790`. Untyped by design (`detail.law == "wrap-policy"`), per the
  experiment consolidation's own naming correction (the round-6 commit
  message called it "L8", but that number belongs to `measure-bound`'s
  structural checker) — this port states that correction directly rather
  than reproducing the historical mis-naming and correcting it after.
- **`measure-bound` (L11)** — `loader._load_measure_bound` (load-time
  half) + `wellformed.find_l11_violations` (structural half). Ported
  clean from `e75ab790` + `36f4defa`.

**What did NOT come along**, per the commission's explicit instruction:
the experiment's own `emit_mockup.py`/`emit_layout_tree.py` realization
edits (settings-live-specific, `I_metrics`/`A_setup`/`A_engine`
widget-table entries), its `.lyt` encoding edits (the six-round
restructuring `boardRail`/settings sub-tab/metric-strip work these keys
were originally authored against), its `screenshot.mjs` harness-view
additions, and the frontend law-renumbering comment edits (`App.vue`,
`useLytOverflowCss.ts`, etc. — comment-only on the experiment branch,
and not applicable to mainline since mainline's frontend never carried
the experiment's `L6/L7/L8` tokens in the first place). `git diff`
against `research/lyt/encodings/` for this port is empty — verified
below.

## Dormancy proof — before/after solver diff

Both reference encodings (`lengyue_landscape.lyt`, `lengyue_portrait.lyt`)
re-solved via `runner.py` (all registered screen classes, both presence
valuations, the Amendment 5 per-T-group shortfall advisory) before and
after this port's code changes:

```
$ git stash push -- research/lyt/loader.py research/lyt/lyt_ast.py \
    research/lyt/parser.py research/lyt/wellformed.py
$ python runner.py > runner-before.txt 2>&1   # exit 1 (expected -- some
                                                # sizes are genuinely
                                                # INFEASIBLE, per SPEC.md
                                                # §11/§12; this is the
                                                # program's own normal
                                                # exit code, unrelated to
                                                # this port)
$ git stash pop
$ python runner.py > runner-after.txt 2>&1    # exit 1, same reason
$ diff runner-before.txt runner-after.txt
$ echo $?
0
```

`diff` reported **zero differences** — byte-identical stdout, including
every solved rectangle, every `OPTIMAL`/`INFEASIBLE` verdict, and the L5
per-T-group shortfall advisory block. `git diff --stat` against
`research/lyt/encodings/` for this change is empty (confirmed via `git
status --short research/lyt/encodings/`, no output) — neither `.lyt`
file was touched.

## Test inventory

`research/lyt/tests/test_loop_laws.py` — 46 tests, ported near-clean
from the experiment branch's file of the same name (fixtures are
self-contained encodings; only the module docstring's provenance prose
and two internal comment cross-references — `SPEC.md §4.2` →
`SPEC.md §8`, `LOOP ITERATION N` → `AMENDMENT 7` — needed adaptation):

- `ceiling`/L9: 6 tests (accept, undeclared-default, refuse×2 non-leaf
  shapes, refuse×2 content-class shapes, refuse undeclared-content).
- `unit`/L10: 20 tests — load-time (parse/round-trip, refuse non-leaf×2,
  refuse content-class×2, refuse duplicate-axis, refuse invalid-axis,
  refuse non-px×3) and structural (refuse-under, accept-exact,
  accept-multiple, cross-axis dormancy, both-axes-at-root, both-axes-at-
  T-child, non-px-min silence, nesting depth ≥3).
- `wrap-policy`: 8 tests (accept-with-unit, undeclared-default, refuse
  unknown/on-split/no-unit/vertical-only-unit, accept-on-exclusive).
- `measure-bound`/L11: 8 tests (accept-on-split, accept-on-leaf, refuse
  root/exclusive/zero-aspect/two-aspect, nesting depth ≥3).
- Cross-key interaction: 5 tests (the three real shapes composed on one
  leaf, ceiling+unit both refusing a split, L10+L11 co-occurrence in
  `detail.laws`).
- Dormancy: 2 tests (no declarations anywhere trips nothing; both
  mainline reference encodings load clean end to end).

## Suite + gate results (foreground, no pipes, literal exit codes)

**`research/lyt` suite, ortools venv (`~/w/vdc/venvs/generic/bin/
python`):**

```
$ python -m pytest research/lyt/tests -q
........................................................................ [ 32%]
........................................................................ [ 64%]
........................................................................ [ 96%]
.......                                                                  [100%]
223 passed in 3.68s
$ echo $?
0
```

(Was 177 passed / 0 failed before this port; +46 from
`test_loop_laws.py`, 0 regressions, 0 pre-existing failures encountered
— unlike the experiment branch's own starting state, mainline's suite
was already green before this port began.)

**Frontend build** (`NODE_OPTIONS=--max-old-space-size=2048 npm run
build`, foreground):

```
✓ 1248 modules transformed.
✓ built in 2.17s
$ echo $?
0
```

**Frontend tests** (`NODE_OPTIONS=--max-old-space-size=2048
VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 npm run test:run`, foreground):

```
 Test Files  254 passed | 3 skipped (257)
      Tests  3152 passed | 8 skipped (3160)
$ echo $?
0
```

Zero frontend source files were changed by this port (`git status
--short frontend/` was empty throughout); both gates run to confirm the
"no gen regeneration should occur" acceptance bar the brief names — no
emitter output changed because no emitter input (the two `.lyt`
encodings) changed, and the frontend gates are green independent of
this port's own additions.

## SPEC-AMENDMENTS.md / SPEC.md

`SPEC-AMENDMENTS.md` gains **Amendment 7** (not "Amendment 6" as the
commission brief named it — mainline's own Amendment 6, the boundary-
marker re-homing, had already landed under the same ledger-row-1937
provenance by the time this port was built; the entry names this
numbering correction explicitly rather than silently resolving it,
consistent with this file's own append-only, diff-disclosed
discipline). Covers all four keys + L9/L10/L11, provenance cited to the
loop experiment's rounds 3/5/6 and to
`.claude/dispatch-reports/lyt-substrate-consolidation.md`, in the
established Ruling/Rationale/What-it-implements/Dormancy/Diff/What-it-
touched form. The experiment branch's own "EXPERIMENT STATUS" framing on
its addendum is replaced throughout by mainline-status prose (no
"experiment", "not merged without ratification", or branch-name
qualifiers survive into the mainline entry).

`SPEC.md` gains **§15** (grammar/semantics), in the same form §13/§14
give Amendments 5/6: concrete syntax (§15.1), why the four keys are
separate axes rather than folded into `content`/`domain`/`scroll`
(§15.2), and the three laws' checkable forms plus the dormancy statement
(§15.3).

## ADR-0000 closure statements (per key/law)

- **L9 (ceiling honesty).** Invariant: a leaf declaring `ceiling` may not
  realize larger than its declared extent, and must be `content
  bounded`. Quantification universe: node kind (leaf/split/exclusive —
  all three covered, non-leaf refused), content class (bounded/
  designed/unbounded/undeclared — all four covered). Denomination: a
  boolean flag, no numeric bound to misdenominate.
- **L10 (unit integrity).** Invariant: a slot whose leaf declares `unit
  <axis>` must reserve ≥ 1 whole unit along its own partition axis.
  Quantification universe: axis (h/v, both covered, both independently
  duplicate-checked), node kind (leaf/split/exclusive, non-leaf
  refused), content class (bounded/unbounded accepted, designed/
  undeclared refused), extent unit in `unit` position (px accepted;
  ch/fr/sums/symbolic refused, `non-px-unit`), partition binding
  (along-axis checked, cross-axis dormant by disclosed design, root/
  T-child both-axes), `min` unit at check time (px compared, non-px
  skipped — disclosed silence, not a gap). Denomination: px throughout,
  matching the resource that actually detonates (a reservation smaller
  than the content it must hold).
- **L11 (measure integrity).** Invariant: a `measure-bound` declaration
  requires exactly one aspect-locked leaf in its own subtree and is
  illegal at the root. Quantification universe: node kind (leaf/split
  accepted, exclusive refused at load time, root refused structurally),
  aspect-leaf count in subtree (0, 1, 2+ all covered — 1 accepts, 0 and
  2+ both refuse with distinct messages), nesting depth (≥3 tested).
  Denomination: a boolean flag plus a subtree count, no extent
  misdenomination possible.
- **`wrap-policy` (untyped).** Invariant: a `wrap <policy>` declaration
  requires a closed-vocabulary policy, is illegal on a Split, and on a
  Leaf requires a pre-declared horizontal `unit`. Quantification
  universe: policy vocabulary (`balanced` accepted, unknown refused),
  node kind (leaf/split/exclusive — split refused, leaf gated, exclusive
  unconditional), unit-axis presence on a leaf (h present/absent, v-only
  refused as insufficient). No numeric denomination applies (a string
  enum).

## Witness status per claim

- **Fast-forward to `lyt-phase2` tip clean, no conflicts**: WITNESSED
  (`git merge --ff-only 9fbc899b`, this session's first tool call).
- **All four keys' implementations are encoding-shape-independent (no
  generalizing needed)**: WITNESSED (direct read of all four commits'
  diffs restricted to `lyt_ast.py`/`parser.py`/`loader.py`/
  `wellformed.py`, cross-checked against every accept/refuse branch's
  own condition — none references a widget id, tree path, or literal
  pixel value).
- **Mainline suite green before this port began (no pre-existing
  breakage to fix, unlike the experiment branch's own starting state)**:
  WITNESSED (`pytest research/lyt/tests -q` on `9fbc899b`,
  177 passed, before any edit).
- **223 passed / 0 failed after the port (177 + 46, zero regressions)**:
  WITNESSED (`pytest research/lyt/tests -q`, this session, exit 0).
- **Dormancy — byte-identical solver output before/after**: WITNESSED
  (`diff runner-before.txt runner-after.txt`, exit 0, this session).
- **Neither `.lyt` encoding was touched**: WITNESSED (`git status
  --short research/lyt/encodings/`, empty, this session).
- **Frontend build/test gates green, zero frontend source changes**:
  WITNESSED (`git status --short frontend/` empty throughout; `npm run
  build` exit 0; `npm run test:run` exit 0, 3152 passed / 8 skipped —
  the 8 skips are pre-existing, unrelated to this port).

## Commit(s) and merge-base

See the final message for this worktree's own commit sha and the
merge-base-vs-`lyt-phase2`-tip check performed as the LAST act, per the
commission's own rule.
