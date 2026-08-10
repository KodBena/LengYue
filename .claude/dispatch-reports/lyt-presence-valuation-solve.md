# lyt-presence-valuation-solve build report

Commission: worktree `agent-ae06c07498eccc186` (slug
`lyt-presence-valuation-solve`, ledger row 1737), rebased onto `lyt-phase2`
@ `d2759153` (verified fresh at session start -- HEAD was already exactly
`d2759153` after `git fetch origin && git rebase lyt-phase2`;
`research/lyt/encodings/lengyue_landscape.lyt` confirmed to contain both
`boardRail` and `previewBoard` slots before any edit).

Commissioner's own words (§6 of the spec, `.claude/dispatch-reports/
layout-language-consult.md` line 636-641): "solve the all-preserve-slots-
present valuation... `release` toggles are user-initiated only, so each
user-reachable presence valuation is legitimately a separate solve; in
practice solve the default valuation plus any valuation the author lists
as common." Motivating finding: `.claude/dispatch-reports/
lyt-tree-always-visible-build.md`'s own disclosure that the prototype's
presence-blind solver counted `boardRail`/`previewBoard`'s reservations at
every size regardless of their default-OFF state, making five sizes
falsely `INFEASIBLE`.

## Read record (ADR-0002)

Read end to end before any claim: `research/lyt/README.md`,
`research/lyt/SPEC-AMENDMENTS.md`, `.claude/dispatch-reports/
layout-language-consult.md` (700 lines, untracked in this worktree, read
from the main checkout's absolute path -- same disclosed practice prior
LYT build reports used, since `docs/` doc-graph does not track
`research/lyt/`), `.claude/dispatch-reports/lyt-tree-always-visible-
build.md`, `lyt_ast.py`, `parser.py`, `loader.py`, `compiler.py`,
`runner.py`, `emit_mockup.py` (full, including `TOGGLE_TARGETS`,
`build_overlay_data`, `build_html_for_class`, `build_all`, `_child_wrap`,
`render_split`, the `_SCRIPT` overlay JS), `emit_ts.py`, `errors.py`, both
`.lyt` encodings' full header comments, `tests/test_lyt.py` in full
(structure, existing `known_infeasible` bookkeeping, fixtures). The
umbrella `CLAUDE.md` and this world's `.claude/HOOKS.md` /
`GOVERNED_FILES.md` were also read (the autoharn ledger change-gate --
see "Ledger governance" below).

## What changed, structurally

1. **New module `research/lyt/presence.py`**: `PresenceValuation(name,
   absent_widgets: FrozenSet[str])`, `ALL_PRESENT` (the spec's own §6
   baseline, nothing absent), `prune_absent(slot, absent_widgets)` (returns
   a NEW tree with named leaves REMOVED from their parent's children --
   not zeroed), `validate_valuation` (refuses loudly, `LytLoadError`,
   `detail.law == "presence-valuation"`, when a named widget doesn't
   exist or isn't a genuine `@toggle(user, release)` slot), and
   `resolve_and_validate` (the one entry point every consumer calls, so
   validate-then-prune can't be reordered or split apart by a caller).

2. **`encodings/lengyue_landscape.lyt` / `lengyue_portrait.lyt`**:
   `boardRail` and `previewBoard` now genuinely declare
   `@toggle(user, release)` presence (was `@fixed` -- the toggle behavior
   previously lived ONLY in `emit_mockup.py`'s UI registry, disclosed as
   such in both files' own pre-existing header comments). This makes
   `validate_valuation`'s "is this really a release toggle" check a real
   fact of the typed AST, not a UI-layer convention the language itself
   never asserted. Both files' headers updated to record the change and
   point at this amendment.

3. **`runner.py`**: `Registration` gains `default_valuation:
   PresenceValuation` (default `ALL_PRESENT` -- every registration keeps
   byte-identical pre-amendment behavior unless it opts in) and
   `common_valuations: List[PresenceValuation]` (empty everywhere; no
   worked encoding's own header names a second common valuation, so none
   is invented). The lengyue registration declares
   `default_valuation=PresenceValuation(name="default",
   absent_widgets=frozenset({"boardRail", "previewBoard"}))`. `run_all`
   now resolves+prunes via `presence.resolve_and_validate` before solving,
   so the CLI's own printed geometry is the DEFAULT valuation's solve
   (byte-identical to before for every non-lengyue registration).

4. **`emit_mockup.py`**: `build_overlay_data` now solves EVERY valuation
   that matters (`default_valuation` + `ALL_PRESENT` + any
   `common_valuations`) and returns `{valuation_name: [per-size dict,
   ...]}` instead of a flat list. `build_html_for_class` embeds
   `{"valuations": {...}, "defaultValuationName", "allPresentValuationName",
   "defaultAbsentSlugs"}` in the page's `<script id="lyt-solved-data">`
   tag. New helper `_widget_at_path` resolves a `TOGGLE_TARGETS`
   child-index path to a bare leaf's widget id (or `None` for a composite
   target), used both to build `defaultAbsentSlugs` and by a new
   regression test cross-checking `TOGGLE_TARGETS` against
   `Registration.default_valuation`. The page's own JS (`_SCRIPT`) gained
   `currentValuationName()`: reads the CURRENT `boardRail`/`previewBoard`
   checkbox state, matches it against the two solved valuations (both
   unchecked -> `default`; both checked -> `all-present`; anything else
   has no solved valuation -- falls back to `default` with an honest
   on-page note). See "Overlay-behavior choice" below.

5. **`tests/test_lyt.py`**: new "AMENDMENT 4" section (13 new tests --
   see "Per-claim WITNESSED status" #5 below); `known_infeasible`
   bookkeeping in `test_generated_pages_embed_valid_overlay_json_
   matching_overlay_sizes` rewritten as `known_infeasible_by_valuation`
   (keyed `(valuation_name, class_id, label)`), matching the new
   `{"valuations": {...}}` JSON shape and the REAL (not the motivating
   finding's predicted) feasibility outcome -- see "Feasibility
   before/after" below.

6. **`research/lyt/README.md` / `SPEC-AMENDMENTS.md`**: new "AMENDMENT 4"
   sections. This is an amendment that IMPLEMENTS the spec's own already-
   written §6 presence paragraph, not a change to the spec's text -- same
   footing Amendments 1-3 use, stated explicitly in both documents.

## Ledger governance (autoharn, this omega world)

This worktree is governed by autoharn's PreToolUse change gate
(`.claude/HOOKS.md`, `.claude/GOVERNED_FILES.md`): creating a NEW file via
the `Write` tool is refused until a ledger row names that file
(`./autoharn led -f <file> decision "..."`, run against the absolute path
`/home/bork/w/omega/autoharn` since the binary itself is untracked/
scaffold-local and not present inside this isolated worktree). Every new
file this commission created (`presence.py`, this report) was preceded by
its own ledger row (1738, 1750); every edited file that the gate reached
for (via `Edit`, observed to fire inconsistently across files in this
session -- some edits went through unchallenged, others demanded a row)
got one too, defensively, once the pattern was confirmed
(`errors.py`=1737-adjacent via the presence.py row's own retry, `runner.py`
=1741, `emit_mockup.py`=1742/1744, `test_lyt.py`=1745,
`lengyue_landscape.lyt`=1739, `lengyue_portrait.lyt`=1740,
`SPEC-AMENDMENTS.md`=1747, `README.md`=1748, `presence.py`'s license-line
follow-up=1749, this report=1750). No ledger row's content was invented or
guessed at the file's actual state -- each names the real file and a real,
specific rationale for the change about to be made.

## Per-claim WITNESSED status

1. **Language surface: default valuation + malformed-declaration
   refusal.** WITNESSED -- `runner.REGISTRATIONS`'s lengyue entry carries
   `default_valuation.absent_widgets == frozenset({"boardRail",
   "previewBoard"})`
   (`test_lengyue_default_valuation_registered_on_the_runner_registration`,
   passing); every OTHER registration's `default_valuation.absent_widgets
   == frozenset()` (same test, second half). Malformed declarations refuse
   loudly: `test_validate_valuation_refuses_unknown_widget` (a nonexistent
   widget name) and `test_validate_valuation_refuses_a_slot_that_is_not_a_
   user_release_toggle` (both a `@fixed` leaf AND a
   `@toggle(user, preserve)` leaf named absent) both raise `LytLoadError`
   with `detail.law == "presence-valuation"` and the specific
   `detail.prohibition`, both passing.

2. **Solver: absent slots contribute zero extent/no reservation; the
   (k-1)*gap term uses the PRESENT count.** WITNESSED --
   `test_absent_slot_gap_arithmetic_uses_the_present_count`: a 3-child,
   `gap 10px` split with one child pruned absent solves with exactly ONE
   gap contribution (`(2-1)*10=10px`, not `(3-1)*10=20px`), and the
   reclaimed 10px plus the removed leaf's own 50px reservation flow
   entirely to the two remaining siblings (`230px` combined all-present ->
   `290px` combined default-valuation, a hand-computed exact match, not an
   approximate check). `test_prune_absent_removes_leaf_from_parent_and_
   drops_arity` independently confirms the pruned tree's own
   `len(children)` literally drops from 3 to 2 (removal, not zero-sizing).
   Both passing. No `compiler.py` change was needed for this -- confirmed
   by NOT touching that file at all this commission (`git diff --stat`
   shows zero lines changed in `compiler.py`).

3. **Verification: feasibility flips.** WITNESSED, with an honest
   correction to the motivating finding's predicted count -- see
   "Feasibility before/after" below for the full table and the
   presence-independent mechanism causing three of the five named sizes
   to stay `INFEASIBLE`. `test_lengyue_landscape_default_valuation_
   solves_optimal` (parametrized: 1920x1080/2560x1440/3440x1440/1366x768,
   all `OPTIMAL`) and `test_lengyue_portrait_default_valuation_solves_
   optimal_at_420x880` (`OPTIMAL`) are the pinned regression tests, all
   passing. `known_infeasible` bookkeeping in `test_generated_pages_
   embed_valid_overlay_json_matching_overlay_sizes` updated to the REAL
   outcome (verified against the actual solver, not asserted from the
   motivating finding's prediction) -- passing.

4. **Overlay/mockup regeneration + power-set verifier + screenshots.**
   WITNESSED -- `emit_mockup.py` regenerated
   `research/lyt/mockups/{landscape,portrait}.html` (both now carry the
   new `{"valuations": {...}}` JSON shape, confirmed by the passing
   `test_generated_pages_embed_valid_overlay_json_matching_overlay_sizes`).
   `frontend/node_modules` populated via `npm ci --prefer-offline
   --no-audit --no-fund` in `frontend/` (exit 0; playwright-core's
   already-cached chromium browsers reused, no browser download needed),
   PLUS a temporary `node_modules -> frontend/node_modules` symlink at the
   worktree root (Node's bare-specifier resolution walks up from
   `research/lyt/mockups/*.mjs`, which isn't inside `frontend/`) -- REMOVED
   immediately after both scripts ran, confirmed absent via `git status`
   (no untracked `node_modules` anywhere in the tree, both before and
   after this session's own two runs). `verify_power_set.mjs` (systemd-run
   wrapped, `--max-old-space-size=1024`): landscape 128/128 states walked
   (12 N2 guard checks), portrait 64/64 states walked (10 N2 guard
   checks), **total violations: 0**, every restore-all deep-equals
   baseline. `shoot.mjs` (same wrapping): 18 screenshots + measurements.json
   regenerated, board `Δ=0.0px` at all 14 measured viewports (the initial
   page-load state has both `boardRail`/`previewBoard` unchecked, so the
   JS's own `currentValuationName()` picks the `default` valuation's
   overlay data, which is the one that matches the live default-hidden
   page -- confirming the overlay-selection JS logic end to end, not just
   by inspection).

5. **Pytest, 84+ green plus new tests.** WITNESSED -- `nice -n 19
   ~/w/vdc/venvs/generic/bin/python -m pytest research/lyt -q >
   pytest.log 2>&1; echo "EXIT:$?"`, foreground, no pipes, explicit
   `timeout=600000` on the first (and only) attempt: **97 passed**, `EXIT:0`.
   Baseline was 84 (`lyt-tree-always-visible-build.md`'s own witnessed
   count at this worktree's base commit, `d2759153`); this commission adds
   exactly 13 new tests (6 single tests for `presence.py`'s own mechanics
   + validation, 4 parametrized landscape default-valuation feasibility
   pins, 1 portrait default-valuation feasibility pin, 1 registration-
   declaration pin, 1 `TOGGLE_TARGETS`-vs-`Registration` cross-check),
   `84 + 13 = 97`, matching exactly.

## Feasibility before/after (the honest result)

Of the FIVE sizes `lyt-tree-always-visible-build.md` named as newly,
falsely `INFEASIBLE` (the presence-blind solver counting
boardRail/previewBoard's reservations unconditionally), solving the
DEFAULT valuation flips **two**: landscape **1366x768** and portrait
**420x880**. The other three -- landscape **1024x700**, **900x600**, and
the pre-existing **1280x1024** -- remain `INFEASIBLE` even with
boardRail/previewBoard genuinely absent, for a real, presence-INDEPENDENT
reason (verified by hand-derivation, cross-checked against the solver):
the board composite's own V-split forces `B.h == root.h − 52` and, via
`aspect 1`, `B.w == B.h` EXACTLY (a hard equality, not something a
"maximize board width" objective term can negotiate down) -- at these
sizes the board's forced width, PLUS the tree/panels row's own
`WRAPPER_MIN`-driven floor (300px T-node + 140px tree + 4px gap = 444px,
present in EVERY valuation since `tree`/`T(...)` are not release-toggled
and cannot be pruned by any valuation), PLUS the root's own 12px gap,
exceeds the available width regardless of boardRail/previewBoard's
presence. This is not something this commission's scope extends to
fixing (same posture the motivating build report itself took for the
ORIGINAL all-present infeasibility -- shrinking an already-grounded
reservation just to force a presence-blind-adjacent solve to agree would
be picking a number not grounded in anything). See
`SPEC-AMENDMENTS.md`'s own Amendment 4 section for the full arithmetic
derivation.

| size | class | all-present (pre-amendment behavior, unchanged) | default (this amendment) | changed? |
|---|---|---|---|---|
| 1920x1080 | landscape | OPTIMAL | OPTIMAL | no |
| 2560x1440 | landscape | OPTIMAL | OPTIMAL | no |
| 3440x1440 | landscape | OPTIMAL | OPTIMAL | no |
| 1280x1024 | landscape | INFEASIBLE | INFEASIBLE | no -- presence-independent (side-column floor / board-forced-width collision) |
| **1366x768** | landscape | INFEASIBLE | **OPTIMAL** | **yes** |
| 1024x700 | landscape | INFEASIBLE | INFEASIBLE | no -- presence-independent (board-forced-width collision) |
| 900x600 | landscape | INFEASIBLE | INFEASIBLE | no -- presence-independent (board-forced-width collision) |
| 1080x1920-in-landscape | landscape | INFEASIBLE | INFEASIBLE | no -- presence-independent (aspect collision, pre-existing) |
| 1080x1920 | portrait | OPTIMAL | OPTIMAL | no |
| 1200x1600 | portrait | OPTIMAL | OPTIMAL | no |
| 768x1024 | portrait | OPTIMAL | OPTIMAL | no |
| 540x960 | portrait | OPTIMAL | OPTIMAL | no |
| **420x880** | portrait | INFEASIBLE | **OPTIMAL** | **yes** |
| 1920x1080-in-portrait | portrait | OPTIMAL | OPTIMAL | no |

The `all-present` column above is byte-identical to this prototype's
pre-Amendment-4 behavior for every size in both classes -- confirmed by
`known_infeasible_by_valuation`'s own `("all-present", ...)` entries
matching the PRE-amendment `known_infeasible` set exactly (same six
sizes, unchanged).

## Overlay-behavior choice (commission item 3, "state your choice")

The debug overlay shows the solve matching the CURRENT
`boardRail`/`previewBoard` checkbox state when that state is EXACTLY
"both unchecked" (`default` valuation) or EXACTLY "both checked"
(`all-present` valuation) -- the only two valuations this amendment
solves. Any OTHER combination (e.g. `boardRail` checked, `previewBoard`
unchecked) has no dedicated solved valuation; the JS falls back to the
`default` valuation's data and prints an on-page note naming the fallback
explicitly (`"[no solved valuation matches the current toggle state --
showing nearest solved valuation: default]"`) rather than silently
showing stale or wrong rectangles. This was chosen over solving all four
combinations of `{boardRail, previewBoard}` (a real option, only 2x more
solves) because the commission's own instruction only asks for the
DEFAULT valuation plus "any valuation the author lists as common" -- no
worked encoding names a "boardRail-only" or "previewBoard-only" common
valuation, and inventing one to fill this gap would be exactly the kind
of unrequested scope growth the umbrella's minimal-touch discipline
(ADR-0004) cautions against. The fallback note keeps this an HONEST
degradation (the commission's own words) rather than a silent one.

## Scope discipline

`frontend/` untouched except for `npm ci` populating `node_modules`
(gitignored, confirmed via `git status --ignored`) -- no source file
under `frontend/src/` was read or edited. `compiler.py` untouched (zero
diff) -- the pruning approach was chosen specifically so the generic
CP-SAT compiler never needed to become presence-aware itself. No file
outside `research/lyt/` and `.claude/dispatch-reports/` was edited.

## License

Public Domain (The Unlicense), matching `research/lyt/__init__.py`'s
license line and the umbrella's ADR-0006 per-file convention.
