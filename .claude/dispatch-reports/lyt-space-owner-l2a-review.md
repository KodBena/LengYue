# L2a review — blackbox/Exclusive-child overflow fields (adversarial, fresh-context)

**Verdict: ACCEPT-WITH-CONDITIONS.**

**Artifact.** Worktree `/home/bork/w/omega/.claude/worktrees/agent-adfdc0375e7c9eb63`,
commits `d76a7c22` (feat) + `d9491ae1` (docs, build report), on `lyt-phase2`'s
tip (`88da0e8c`, "merge: space-owner L1"). Diff verified against
`git diff HEAD~2..HEAD` in the worktree, which is `HEAD~2 == 88da0e8c`
(confirmed by `git rev-parse HEAD~2`).

## Reading discipline

Read end to end before any claim below: `.claude/dispatch-reports/
lyt-space-owner-spec.md` (993 lines, all sections, including §0 third
bullet, §3 step 2, §4's step-2 risk row); ledger rows 2447/2450 (`./autoharn
led show`, main repo); the full `git diff HEAD~2..HEAD`; `research/lyt/
lyt_ast.py`, `loader.py`, `wellformed.py`, `presence.py`,
`emit_layout_tree.py` — every changed region in full with the surrounding
function/docstring context needed to judge each hunk; both `.lyt` encodings
in full (both under 60 lines); `frontend/src/state/lyt-layout-types.ts`'s
changed regions with their full doc comments. Also read, for cross-checking
the specific obligations below: `research/lyt/SPEC-AMENDMENTS.md`'s
Amendment 5 section (verifying the scroll_axes precedent claim directly,
not from memory); `research/lyt/SPEC.md` §13 and its opening grammar
summary; `frontend/src/components/chrome/SettingsPane.vue`,
`frontend/src/components/charts/AnalysisDashboard.vue`,
`frontend/src/components/editors/AnalysisControls.vue`, and
`frontend/src/composables/chrome/useLytOverflowCss.ts` (targeted, for the
encoding-honesty check — not read end to end, their overflow-relevant
sections and headers were); `frontend/src/App.vue`'s control-panel
tab-slot template block (lines ~1370-1470) for the CP-analysis/CP-settings
mount-site ground truth. The builder's own report
(`lyt-space-owner-l2a-build.md`) was read last, only to check for
undisclosed divergence from what the diff itself shows.

## Obligation 1 — Slot-level relocation of `content`

**WITNESSED, sound.** `lyt_ast.py`'s AMENDMENT 10 entry explicitly grounds
the relocation in Amendment 5's own precedent; I verified this against
Amendment 5's actual text in `SPEC-AMENDMENTS.md` (not the paraphrase),
which says verbatim: *"`scroll_axes` lives on `Slot` (not `Leaf`/`Split`,
mirroring `Presence`/`Sizing`'s own placement), since it applies uniformly
regardless of node kind."* The L2a relocation of `content` to `Slot` for
the identical reason (a T-child or Exclusive-wrapper needs somewhere to
put a content-class fact that `Leaf`-only storage structurally cannot
carry) is the same move, not a novel one. `wellformed.py`'s five read
sites (`_subtree_has_designed_leaf`, `find_l5_violations`,
`find_l13_violations`, `find_l16_violations`, `find_l17_violations`) were
each verified individually: every one still gates on
`isinstance(node, ast.Leaf)` exactly as before, only the read target moved
from `node.content` to `slot.content` — dormancy is structurally
preserved, not merely asserted.

Ran the loader over the full `.lyt` corpus directly (not only through the
test suite): `encodings/lengyue_landscape.lyt`, `encodings/
lengyue_portrait.lyt`, `fixtures/reference/{q5go,ogs}.lyt`, and
`fixtures/transcription/current_row_repaired.lyt` all load cleanly with no
waivers. `fixtures/transcription/current_row_asis.lyt` refuses without its
`baseline.BASELINE_WAIVERS` (a pre-existing, disclosed, unrelated L2
non-conformance the test suite's own docstring names as the reason that
fixture needs a waiver in the first place — confirmed by loading it WITH
the waiver, which succeeds) — this is pre-existing behavior, not a
regression this diff introduces. Confirmed the two new regression tests
(`test_content_class_legal_on_an_exclusives_own_wrapping_slot`,
`test_content_class_legal_on_a_direct_exclusive_child_of_any_kind`) and
the two refusal-shape tests genuinely exercise the relocation, including
the non-inheritance boundary (`is_exclusive_child` never threading past
the immediate child, pinned by
`test_content_class_refuses_on_a_split_two_levels_inside_an_exclusive`).

## Obligation 2 — the `presence.py` "bonus fix"

**WITNESSED, correctly scoped, correctly characterized.** Read
`prune_absent`'s pre-change Split/Exclusive branches: both reconstruct a
new `ast.Slot(...)` from the pruned children, forwarding only
`presence`/`sizing`/`violates`/`scroll_axes` — `scroll_axes` itself was
only added to that forward-list by a prior "AMENDMENT 5 fix" (documented
in the same module, with its own regression test), because before
Amendment 5 `scroll_axes` didn't exist to drop. Before L2a, `content`
lived on `Leaf`, which `prune_absent`'s Leaf branch returns UNCHANGED
(`return slot`, no reconstruction) — so `content` was never at risk of
being dropped by this function, because the code path that reconstructs
`Slot` objects never touched a leaf's own content. The instant `content`
moves to `Slot` (this dispatch's own change), the SAME two
already-reconstructing branches (Split, Exclusive) inherit the SAME
forwarding gap `scroll_axes` had before its own fix — this is a genuine
consequence of the migration this dispatch makes, not an independently
pre-existing bug that happened to be found along the way. The build
report's own wording — "a genuine, PRE-EXISTING-CLASS defect" — is
accurate on a close read: it is the *class* of defect (a reconstruction
site with an incomplete forward-list) that is pre-existing and
recurring, not this specific `content`-dropping instance, which could not
have existed before `content` was Slot-level. This is necessary-enabling,
not disclosed-scope-creep owed a STOP: without it, the very fields this
dispatch adds legality for (content on a Split/Exclusive T-child) would
silently vanish under any presence-toggle prune, undermining the
"emitter preserves the fields" half of the commission on any tree that
combines the two features. It is minimal (2 lines per branch), and
pinned by `test_prune_absent_preserves_content_on_reconstructed_composites`,
which I confirmed exercises both reconstruction sites. The disclosed-but-
not-fixed `wrap_policy` sibling instance is correctly left alone and named
in the module docstring rather than silently rediscovered later — good
diligence, appropriately out of this dispatch's own scope.

## Obligation 3 — encoding declarations, honesty check

Six declarations (3 per encoding, landscape/portrait symmetric): Settings
T-wrapper → `content unbounded`; CP-analysis composite wrapper → `content
designed`; CP-other composite wrapper → `content unbounded`. No `scroll`
added anywhere; I independently confirmed the L5b-refusal claim by hand-
inserting `scroll v` at each of the three sites and reloading — all three
refuse with `law: single-scroll-owner`, matching the build report's own
claim (not merely trusting it).

**Settings and CP-other: sound, WITNESSED against real components.** The
Settings T (six sub-tab group) is the exact node that emits as the
`SP_session`-widget blackbox mounting `SettingsPane.vue` (confirmed by
tracing App.vue's `#leaf-SP_session` slot and by grepping the regenerated
`.gen.ts` for the emitted node — see Obligation 4). `SettingsPane.vue`'s
own header independently corroborates the "worst-case-superset"
classification precedent (two of the six sub-panes are individually
`content unbounded, scroll v`; the wrapper inheriting `unbounded` is the
conservative, honest characterization given that mix — the same posture
the pre-existing per-leaf declarations already use). CP-other wraps a
genuinely DOM-opened tab (`otherColorDebug` + `otherBand`, the latter
already `content unbounded, scroll v` pre-dispatch) — `unbounded` at the
wrapper is directly checkable and correct.

**CP-analysis: PARTIALLY VERIFIED, a real open question.** The wrapper's
own descendant leaves (`AT_basic_interval`, `AT_dist_deltaDist`, etc.)
were already individually `content designed` before this dispatch, so the
new wrapper-level `designed` declaration is internally consistent with
the pre-existing modeled tree. But tracing the REAL mount site (App.vue's
`#leaf-CP-analysis` slot mounts `AnalysisControls.vue`, which at line 385
embeds `AnalysisDashboard.vue` directly) surfaces a genuine divergence:
`AnalysisDashboard.vue`'s own `.scrollable-content` class is
`overflow-y: auto` (confirmed by reading the component's `<style>`
block) — the real mounted DOM for this tab **does scroll** its panel
content, which is the opposite of what `content: 'designed'` (L5c's
"chart-carrying containers may never scroll... never a scrollbar") claims.
This is not a live behavioral bug **today**: `useLytOverflowCss.ts`'s own
header discloses its scope explicitly as leaf-only, "Non-leaf nodes
(split/exclusive/blackbox) carry no single scrollAxes fact of their own
and return `{}`" — so nothing currently derives CSS from
`LytBlackboxNode.content`/`.scrollAxes`, and this dispatch's own
commissioned scope (correctly) excludes frontend runtime consumption. But
the encoding's own honesty claim, checked against the real component the
commission specifically asked me to check, does not hold for this one of
the six new declarations — the pre-existing per-leaf tree this wrapper
value was mechanically derived from is itself already a DISCLOSED
narrowing (App.vue's own comment: the analysis tab's fine-grained
per-chart T stays "solver-visible but UNOPENED in the DOM," mounting as
ONE component instead), so this is an inherited representational gap, not
one L2a invented — but L2a's own build report doesn't show evidence of
having checked it against `AnalysisDashboard.vue` specifically (its
verification was about L5b legality, not DOM truth), and the commission
asked for exactly that check. See Condition 2 below.

## Obligation 4 — emitter preservation, traced end to end

**WITNESSED, byte-verified, not merely read.** For Settings: the
encoding's `T(..., content unbounded)` node → `loader.load_slot`'s
Exclusive branch → `ast.Slot(node=excl, ..., content=content)` →
`emit_layout_tree.py`'s `_build_node` Exclusive-collapse boundary reads
`slot.content` at the exact construction site (traced in the diff) →
regenerating `lyt-layout.gen.ts` independently (`python emit_layout_tree.py
--registration landscape`) reproduces
`{ kind: "blackbox", widget: "SP_session", ..., content: "unbounded",
scrollAxes: [] }` byte-for-byte. I regenerated **both** `.gen.ts` files
myself in a fresh venv and diffed them against the committed files with
`diff -q` — zero difference, both registrations. I then diffed the
committed files against their pre-change (`HEAD~2`) versions: every hunk
in both files is a pure insertion (`content`/`scrollAxes` fields added to
existing object literals, or new sibling fields added to
`LytExclusiveChild` entries) — no line is modified or removed, confirming
the "additive-only" claim directly rather than trusting the build
report's own `git diff` summary.

## Obligation 5 — gates, run myself

- `research/lyt` suite: fresh venv (`pytest`, `ortools`), `pytest tests/
  -q` → **424 passed, exit 0.** Matches the claimed baseline-to-424 delta.
- `frontend`: `npm ci` (clean install), `NODE_OPTIONS=--max-old-space-size=2048
  nice -19 npx vue-tsc -b` → **clean, zero errors.**
- `frontend` test suite: `NODE_OPTIONS=--max-old-space-size=2048 nice -19
  npx vitest run --maxWorkers=2` → **3360 passed, 8 skipped, exit 0**
  (267 test files passed, 3 skipped). The commission's own text named
  "3343" as the expected count; the observed 3360 is higher, but since
  this diff touches zero frontend test files (confirmed by the file list
  in Obligation 6's table), the difference is pre-existing drift on
  `lyt-phase2` unrelated to this dispatch, not a regression it
  introduces. Exit code 0 is the load-bearing fact.

## Obligation 6 — directive coverage table

| Directive | Status | Evidence |
|---|---|---|
| `content`/`scroll` legal on blackbox/Exclusive-children, closed vocabulary | WITNESSED | `lyt_ast.py`/`loader.py` diff; 5 new/changed tests, run directly |
| Parser-permissive, loader-refuses division preserved | WITNESSED | `_load_content_class` widened, refusal-shape tests pass |
| Emitter preserves fields through Exclusive-collapse | WITNESSED | end-to-end trace + byte-identical regeneration, both classes |
| Encodings: honest facts, comment-free, no numbers | WITNESSED (5/6) / CONDITIONAL (1/6) | Settings, CP-other verified against real components; CP-analysis's `designed` claim not confirmed against `AnalysisDashboard.vue`'s real `overflow-y:auto` — see Obligation 3 |
| Tests + roundtrip | WITNESSED | 424/424, exit 0; roundtrip covered by existing `test_render_ts_roundtrip_matches_committed_file`-class tests (unaffected, still passing) |
| `.gen.ts` diffs additive-only | WITNESSED | independent regeneration, byte-diff against committed + against pre-change |
| No frontend runtime code | WITNESSED | file list has zero touches under `src/components`, `src/composables`, `src/App.vue` |
| No shadow files | WITNESSED | `lyt-solved-layout*.gen.ts` absent from file list; not in `git status` |
| `prune_absent` bonus fix: necessary-enabling, minimal, tested | WITNESSED | traced pre-change code, confirmed the gap is a genuine consequence of this dispatch's own migration, confirmed minimal diff + dedicated regression test |
| SPEC.md / SPEC-AMENDMENTS.md updated for the new "AMENDMENT 10" | **NOT DONE — gap** | see below |

## A finding outside the enumerated obligations: the amendment ledger

`research/lyt/SPEC-AMENDMENTS.md` is described by `SPEC.md` itself as
*"the append-only, dated **amendment record**... the nine ledger-
adjudicated rulings."* Every prior amendment (1 through 9) has its own
dedicated section there, and `SPEC.md` — billed as *"the current-state,
standalone specification"* — carries a corresponding up-to-date summary
of each. This dispatch's own code repeatedly names its change "AMENDMENT
10" (in `lyt_ast.py`, `loader.py`, `emit_layout_tree.py`, `wellformed.py`,
`presence.py`, and the new tests) — using the established numbering
convention as though it were a ratified, recorded entry in that same
sequence. It is not: `SPEC-AMENDMENTS.md` and `SPEC.md` are both untouched
by this diff (`git diff --stat HEAD~2..HEAD -- research/lyt/SPEC.md
research/lyt/SPEC-AMENDMENTS.md` is empty). Concretely, `SPEC.md` now
contains two passages that are **factually wrong** about the grammar as
this dispatch leaves it: the opening grammar summary (line ~172-173) and
§13.1 (line ~1137-1140) both still read *"`content <class>`... is a
LEAF-only content-class declaration... refused loudly... on a Split or
Exclusive node"* — exactly the constraint this dispatch lifts. This is
not a cosmetic nit in this codebase: the umbrella `CLAUDE.md`'s
"documentation is part of the work" section and this sub-project's own
extremely consistent nine-for-nine amendment-ledger practice both treat
this as load-bearing, and `SPEC.md`'s own "current-state" framing means a
reader (including a future LLM collaborator bound by this repo's own
ADR-0002-for-documentation discipline) would read confidently wrong
prose. This was not caught or disclosed in the build report.

## Conditions for acceptance

1. **Amend `SPEC-AMENDMENTS.md`** with a proper Amendment 10 entry
   (mirroring Amendments 1-9's own shape: ruling/ledger-row citation,
   rationale, what it implements, seam choice, what it touched) and
   **correct `SPEC.md`'s two stale "leaf-only" passages** (§ opening
   grammar summary and §13.1) plus its "nine ledger-adjudicated rulings"
   count — before this arc is treated as closed, whether folded into this
   same change or landed as an immediate same-arc follow-up.
2. **Re-verify the CP-analysis wrapper's `content designed` declaration**
   against `AnalysisDashboard.vue`'s real `overflow-y: auto` behavior
   before L2b (frontend consumption of these fields) lands — either
   correct the declaration, or add an explicit disclosed-narrowing note
   at the encoding site the same way `SettingsPane.vue`'s and App.vue's
   own comments already do for the model/DOM gap elsewhere in this exact
   tree, so a future mount-time Fit assertion isn't built against a
   silently-wrong ceiling for this one interior.

Neither condition blocks the functional/technical merits of this change —
everything shipped is additive, inert at runtime today, well-tested, and
independently reproducible. The grammar/loader/emitter/type work itself
is sound and the gates are all green by direct verification, not by
trusting the build report. The two conditions are documentation-
discipline and honesty-verification gaps this specific codebase's own
governing conventions treat as part of the deliverable, not optional
polish.

## License

Public Domain (The Unlicense), per ADR-0006.
