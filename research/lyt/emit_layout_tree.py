"""research/lyt/emit_layout_tree.py

W1 commission (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
S3, "layout as data, not template"; S8 W1 item 1). Sibling to `emit_ts.py`
rather than an extension of it: `emit_ts.py`'s job is a CP-SAT-SOLVED
rectangle registry (Phase-1 shadow mode, used only by the conformance
harness); this script's job is a different data shape entirely -- the
compiled LYT PROGRAM itself (the H/V/Exclusive tree, its sizing/gap/
presence declarations, unsolved) as typed TS data, which
`frontend/src/components/chrome/LytNode.vue` interprets at RUNTIME as
nested CSS Grid containers (the browser's own layout engine does the
solving, continuously, under live resize -- exactly the mechanism
`research/lyt/emit_mockup.py`'s static-HTML mockups already proved out;
see that module's own docstring, read in full, for the LYT -> CSS Grid
mapping table this script's `_track_shape_for_child` reproduces as JSON
track-shape descriptors instead of literal CSS strings).

Scope, W3 (portrait build): both screen classes are now compiled --
`encodings/lengyue_landscape.lyt`'s `lengyue-landscape` layout (as
before, W1) AND `encodings/lengyue_portrait.lyt`'s `lengyue-portrait`
layout (new, W3). Each class is its own registration
(`REGISTRATIONS`, keyed `"landscape"` / `"portrait"`) naming its own
`.lyt` source, layout name, class id, default-presence table, TS
const name, and default output path; `build_program` and every helper
it calls take these as explicit parameters rather than module globals,
so a single process can build both classes without any global
reassignment footgun (a script that might build both classes in one
run -- e.g. from a test -- must not rely on module-level state a
second call could stomp). `main`'s `--registration {landscape,portrait}`
CLI flag selects which one a given invocation emits; landscape keeps
its historical default output path
(`frontend/src/state/lyt-layout.gen.ts`) and portrait gets its own new
sibling file (`frontend/src/state/lyt-layout-portrait.gen.ts`), per
the roadmap's own disclosed shape for this wave.

Portrait's board composite is a DIFFERENT shape than landscape's --
CASE B, not CASE A, in `emit_mockup.py`'s `_board_priority_tracks`
taxonomy (that function's own ~70-line docstring, read in full, is the
normative derivation for both cases). Landscape's root is `H(...)` and
its board composite is a `V(...)`, so `composite.axis ('v') !=
node.axis ('h')` -- CASE A, "cap the non-board elastic+capped
sibling". Portrait's root is `V(...)` and its board composite is
ALSO a `V(...)`, so `composite.axis == node.axis` -- CASE B, "cap the
COMPOSITE's OWN track at its natural ceiling" instead. `_apply_board_
priority` below implements both branches (ported from `emit_mockup.
py`'s CASE B, verbatim in its arithmetic) rather than raising
`NotImplementedError` for CASE B the way the original W1-only version
did.

CASE B's track shape (`{kind: 'board-priority-self-clamp',
naturalCrossUnit, fixedSiblingSumPx}`) is a NEW member of the JSON
track-shape vocabulary (and the TS `LytTrackShape` discriminated
union it renders as) alongside CASE A's existing `board-priority-
clamp`. Unlike CASE A, CASE B carries no independent `minPx`/`maxPx`
-- its cap is a bare `minmax(0px, natural)`, not a three-way clamp --
so the two kinds are genuinely different shapes, not the same fields
renamed. See `frontend/src/state/lyt-layout-types.ts`'s own doc-
comment on this union member for the exact CSS this compiles to
(`frontend/src/composables/chrome/useLytTrackCss.ts` is the
compiler; that file is NOT touched by this script or by this
commission -- it belongs to the parallel Vue-side W3 task).

Exclusive (T) node collapse (disclosed simplification, matches the
roadmap's own S8 W1 item 2 framing -- "the control panel...is ONE leaf,
commissioner: black box"): rather than expand the T node's five CP-*
children into their own grid children (which W1's widget registry does
not populate -- TabWidget.vue already owns the tab-strip-plus-body
realization internally), this emitter collapses the WHOLE Exclusive node
into a single synthetic leaf (`kind: 'blackbox'`, widget id
`controlPanel`) whose track uses the SAME `_exclusive_derived_min_px`
floor the CP-SAT compiler and `emit_mockup.py`'s mockup both use (the
componentwise max of the five children's own declared `min`). The five
child widget ids are still carried (`childWidgets`) for documentation/
report-table parity -- nothing about the census is lost, only the GRID
EXPANSION of it. This applies identically to both classes -- both
`.lyt` encodings give their T node the same six-child shape.

AMENDMENT 6 retirement (ledger row 1937, .claude/dispatch-reports/
lyt-tab-region-consult.md §6.2/§6.4/§8.1, the "Option C" tab-skeleton-
encoding wave): the paragraph above's "five CP-* children" is no longer
five bare leaves -- CP-analysis and CP-settings are now composite Split
subtrees (a nested tab group and a strip+pane, respectively), opened one
structural level per the ratified consult. The plain-leaf-T assertion this
Exclusive branch used to raise (`isinstance(c.node, ast.Leaf)` required, a
`NotImplementedError` otherwise) is RETIRED: `_build_node`'s Exclusive
branch no longer inspects each child's node kind at all before collapsing
-- it always collapses the WHOLE node to one `blackbox` leaf, and
`childWidgets` is now populated by `_collect_leaf_widgets`, a genuine
structural fold (total over Leaf|Split|Exclusive, not a one-level
`c.node.widget` read) so a composite tab's interior leaves are still named
for documentation, never silently dropped. The emitted TS shape and
LytNode.vue's realization boundary are UNCHANGED by this wave (§8.1's own
"Wave 1 ships solver-side... byte-identical" resolution) -- the only
observable diff, regenerating both classes' `.gen.ts` after this wave, is
`childWidgets`' own contents (now longer, listing the opened tabs'
interior leaves instead of the bare `CP-analysis`/`CP-settings` strings),
a field this module's own docstring above already discloses as
documentation-only and `LytNode.vue` never reads.

REALIZATION WAVE (2026-08-11, work item lyt-realization-exclusive-overflow,
ledger row 1937, `.claude/dispatch-reports/lyt-tab-region-consult.md` §8.1):
the "Wave 1 ships solver-side... byte-identical" boundary named above is a
STARTING point, not a permanent one -- §8.1's own resolution treats the
realization boundary as encoding/registration DATA (a movable base-case
marker), not a standing architectural decision. This wave moves that marker
inward for the OUTER control-panel Exclusive node specifically: rather than
ALWAYS collapsing an Exclusive to one synthetic `blackbox` leaf, a new
`Registration.open_control_panel` flag (set for both `landscape`/`portrait`)
tells `_build_node`'s Exclusive branch to emit a genuine `exclusive` node --
each child either opened (recursed into normally, the same generic fold
every other node kind already gets) or individually collapsed per
`Registration.control_panel_collapse_indices`.

DISCLOSED, DELIBERATE SCOPE NARROWING relative to the full ratified consult
(STOP-and-report per the umbrella CLAUDE.md; recorded in the wave's own
delivery report, `.claude/dispatch-reports/lyt-realization-wave.md`): of the
outer T's five children (library/cards/settings/analysis/other, in encoding
order), `control_panel_collapse_indices = {2, 3}` keeps the SETTINGS and
ANALYSIS composites collapsed to one synthetic leaf each this wave --
`CP-settings` mounts `SettingsTab.vue` unchanged (which owns its OWN
horizontal/vertical sub-tab TabWidget internally, matching the encoding's
own `V(settingsSubstrip, settingsPane)` shape conceptually without splitting
it into two separately-mounted DOM leaves this wave); `CP-analysis` mounts
`AnalysisControls`/`AnalysisDashboard.vue` unchanged, which owns a SECOND,
genuinely DYNAMIC, user-configurable tab set (`AppSettings.analysisTabs`) --
literally rendering the encoding's own nested `T(AT_basic, AT_distributions,
AT_stability, AT_multires)` live would hard-code the DOM to the STATIC
DEFAULT four-tab configuration and silently break that dynamic behavior for
any user who has customized their analysis tabs (the exact residual the
ratified consult's own §8.3 names: "the static guarantee covers the declared
DEFAULT configuration ... the only sound instrument for user-authored
layouts is a runtime advisory check ... a different, larger commission").
LIBRARY and CARDS (bare leaves, indices 0/1) and OTHER (index 4, a
`V(otherColorDebug, otherBand)` composite with no dynamic per-user data) are
NOT in the collapse set -- they open normally via the SAME generic recursion
every other node kind already gets, with no special-casing beyond the
collapse-set membership test.

SETTINGS OPENED LIVE (2026-08-11, work item `lyt-settings-live-opening`,
ledger rows 2007/2009/2001): the SETTINGS narrowing named above is RETIRED.
`control_panel_collapse_indices` drops from `{2, 3}` to `{3}` -- index 2
(`CP-settings`) now opens generically like library/cards/other, per the
composition-boundary refactor named in that work item's own commission (the
frontend's own `SettingsTab.vue` is split into `SettingsSubstrip.vue`/
`SettingsPane.vue`, mounted at the encoding's own `settingsSubstrip`/
`settingsPane` leaves -- see those files' own headers and `frontend/src/
state/lyt-widget-registry.ts`'s updated entries). ANALYSIS (index 3) is
UNCHANGED and stays collapsed -- the reason above (a genuinely dynamic,
user-configurable tab set the static encoding only models the default
configuration of) is untouched by this work item and remains valid.

REPAIR (2026-08-11, `.claude/dispatch-reports/lyt-optionc-review.md`
Finding 2, corrected in `.claude/dispatch-reports/lyt-optionc-repair.md`):
the paragraph above's own "UNCHANGED... byte-identical" claim was FALSE for
one field -- the collapsed blackbox leaf's own TRACK (not just
`childWidgets`). The pre-repair build of this branch still called
`_exclusive_derived_min_px` (the componentwise max of the T's DIRECT
children's own declared `min`) to compute the emitted track's floor -- a
derivation that was geometry-inert back when every T child was a bare
`WRAPPER_MIN`-floored leaf (all five identical), but which pulls a
COMPOSITE child's own interior-derived floor (up to 880px, the settings
substrip's ch-measured demand) into the emitted track the instant Option C
opens a T child into a Split. That 880px is a genuine, LIVE-CONSUMED CSS
Grid minimum (`App.vue` imports this file's `LYT_LANDSCAPE`/`LYT_PORTRAIT`
directly; `useLytTrackCss.ts` renders an `elastic` track's `minPx` as a
literal `minmax()` floor) -- not a solver-only number, contradicting the
"solver-side only" framing this wave's own encoding header claims.
`_exclusive_derived_min_px` and its floor-override plumbing are RETIRED
from this module (kept, independently, in `emit_mockup.py`'s own copy --
that generator's static-HTML mockup output is not live-consumed, so it is
out of this repair's scope, named as a residual in the repair report).
`_build_node`'s Split branch now calls `_track_shape_for_child` uniformly
for every child kind, off the child SLOT's own declared `sizing.min` --
for an Exclusive child, that is the T's own wrapping slot, which the two
`.lyt` encodings now declare EXPLICITLY (`min 160px` landscape / `min
200px` portrait -- the exact pre-Option-C marker reservation, see each
encoding's own header note) rather than leaving it at the loader's
disclosed 0px default for the compiler to re-derive. The COMPILER's own
independent T-floor derivation (componentwise max of children, §8's
`along=None` branch) is UNTOUCHED -- it still enforces the real 838-880px
interior floor for solving purposes (the genuine INFEASIBLE finding
survives this repair intact); only the EMITTER stops re-deriving that same
number for the LIVE track.

Presence (repair pass, ledger row 1781, W1 REPAIR; generalized here to
portrait, W3): both `.lyt` source files declare `@toggle(user,
release)` presence on `boardRail`/`previewBoard` (AMENDMENT 4, ledger
row 1737, `research/lyt/presence.py`). The toggle annotation only
affects `slot.presence` (consumed by `presence.py`'s valuation
machinery -- `runner.py`, `emit_ts.py`, `emit_mockup.py`), never
`slot.sizing` -- this emitter reads only `slot.sizing`
(`_track_shape_for_child`), so it stays presence-BLIND for TRACK
SHAPES specifically and needs no change there to keep working against
a presence-annotated encoding. `presenceDefaultVisible` itself is a
DIFFERENT fact this emitter DOES need from the presence story --
originally (W1/W3) a hand-maintained, path-keyed table kept
independently of `presence.py`'s own valuation-solving machinery ("no
presence MENU this wave... 'default visible or not' is the only fact
consumed"); LYT presence arc P2a (see the module docstring's own
section by that name) retires that independence -- the fact is now
DERIVED from `presence.py`'s own machinery (`is_named_absent` against
`runner.valuation_for_class`'s resolved `absent_widgets`), not
duplicated ahead of it, so a future presence-model change (a new
default-off widget, a class-specific override) reaches this emitter's
own output automatically rather than needing its own, easily-forgotten
mirror edit here.

Regeneration command (also written into each generated file's own
header):

    cd research/lyt && \\
      nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_layout_tree.py --registration landscape
    cd research/lyt && \\
      nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_layout_tree.py --registration portrait

(landscape writes to ../../frontend/src/state/lyt-layout.gen.ts by
default, portrait to ../../frontend/src/state/lyt-layout-portrait.gen.ts;
pass --out PATH to redirect either, e.g. for this emitter's own tests.
`--registration` defaults to `landscape`, matching this script's
pre-W3 behavior when called with no arguments.)

M2 STAGE F1 PORT (2026-08-12, ledger row 2311 disposition 2): brings the
model-iteration loop experiment's (`lyt-model-loop-experiment`, tip
9d9c1cae) realization-layer LEAF METADATA fields into this, mainline's
post-B2b emitter: `elasticAxes` (L13), `ceilingAxes` (L14, the PER-AXIS
form -- distinct from the whole-leaf `Sizing.ceiling` flag), `floorAxes`
(L16), `edgeAxes` (L17), `orientation` (METAMODEL WAVE item 1), `activity`
and `demote` (L15), `envelopeStates` (METAMODEL WAVE item 2c). Every one of
these reads an AST attribute (`ast.Leaf.elastic_axes` /
`.ceiling_axes` / `.floor_axes` / `.edge_axes` / `.orientation` /
`.activity`, `ast.Slot.presence`, `ast.Sizing.envelope_states`) that a
SEPARATE, EARLIER port (AMENDMENT 7 to `lyt_ast.py`/`loader.py`, ledger
rows 2107/2108, the "M1 substrate port") already landed on mainline --
this stage's own job is narrower: read those already-loaded, already-
validated attributes and carry them into the EMITTED program, the same
"expose, don't re-derive" posture every other leaf fact in this function
already takes.

DISCLOSED, DELIBERATE SCOPE NARROWING relative to the experiment's own
emitter (STOP-and-report per the umbrella CLAUDE.md; recorded in this
stage's own delivery report): the experiment's emitter ALSO carries
`unitAxes` (L10) and `wrapPolicy` (a leaf's own wrap declaration, plus an
Exclusive node's own `wrapPolicy` field) and wires TWO track-shape-
algorithm changes off Sizing flags that are NOT metadata pass-through --
a `ceiling`/`demand` track-shape kind in `_track_shape_for_child` (driven
by the whole-leaf `Sizing.ceiling` flag and by a leaf's `ceiling_axes`
matching its parent's own partition axis) and a `Sizing.measure_bound`
gate on `_apply_board_priority`'s CASE B. None of these three is ported
this stage. The reason is a genuine, checked fact about mainline's own
`.lyt` encodings, not a arbitrary cut: mainline's `lengyue_landscape.lyt`/
`lengyue_portrait.lyt` never declare the `ceiling` (whole-leaf),
`measure-bound`, `unit`, or `wrap` concrete-syntax tokens ANYWHERE today
(confirmed by direct grep across both files) -- `Sizing.ceiling` and
`Sizing.measure_bound` read `False` and `Leaf.unit_axes`/`Slot.wrap_policy`
read empty/`None` for every leaf the AMENDMENT 7 port's own dispatch
report already established as "dormant... byte-identical solver output".
Porting the `ceiling`/`demand` track-kind branches would therefore be
inert TODAY -- but porting the experiment's `measure_bound` GATE on CASE B
would NOT be inert: mainline's own CASE B (portrait's board composite)
currently applies `board-priority-self-clamp` UNCONDITIONALLY whenever
`_find_board_composite_child`'s shape match fires, with no declaration
gate. The experiment's own portrait encoding declares `measure-bound` on
that composite (verified: mainline's does not), so porting the
experiment's gated condition verbatim onto mainline's UN-declared encoding
would SILENTLY REMOVE portrait's board-priority-self-clamp track override
-- a genuine rendered-output regression, exactly the "realization changes
as a side effect of this port" stop condition the commission names. `_
apply_board_priority`, `_track_shape_for_child`'s track-KIND vocabulary,
`LytExclusiveNode.wrapPolicy`, and `LytLeafNode.unitAxes`/`.wrapPolicy` are
therefore left untouched by this port; a future stage that wants the
`ceiling`/`demand`/`measure-bound` behavior needs its own encoding-level
change (declaring the tokens) alongside the emitter change, not a
metadata-only port. The 8 fields this stage DOES port carry through
already-loaded AST data with no algorithmic branch added anywhere in this
module -- confirmed additive-only: every existing consumer of the leaf
node shape (`LytNode.vue`, `useLytTrackCss.ts`, `useLytOverflowCss.ts`,
the widget registry) reads only the fields it already read before this
port; none is wired to read any of the 8 new ones this wave, so the
compiled programs' CONSUMED behavior is unchanged even though their DATA
is richer (verified by the roundtrip regeneration this stage's own
delivery report records).

LYT presence arc P2a (`.claude/dispatch-reports/lyt-p2a-presence-contract.md`,
row 2358 follow-up 1): closes two gaps P1 (the model side, `.claude/dispatch-
reports/lyt-p1-presence-model.md`) left in this EMITTER, reviewer-confirmed.

(a) Exclusive-node `demote`: the leaf branch below already emitted a
`demote` field (M2 STAGE F1 PORT, `slot.presence.kind == "demote"`), but
every Exclusive-node construction site (both `blackbox` shapes and the
genuinely-opened `exclusive` shape) never did -- the control panel's own
`@demote(h 778px)`/`@demote(h 808px)` declaration (both encodings' own
`T(...)[BLACK BOX]` wrapping slot) was therefore invisible to the compiled
contract even though `slot.presence` carries it exactly the same way a
leaf's does. Fixed by extracting the shared `_demote_field(slot)` helper
the leaf branch now also calls, applied uniformly at all FOUR
blackbox/exclusive construction sites (including the one inline `child_node`
built directly in the `open_control_panel` loop for a still-collapsed tab,
e.g. `CP-analysis` -- that site reads `_demote_field(child)`, the TAB's own
wrapping slot, not the outer T's).

(b) `presenceDefaultVisible` derivation: `DEFAULT_VISIBLE_BY_PATH`/
`DEFAULT_VISIBLE_BY_PATH_PORTRAIT` -- two hand-maintained, path-keyed
dicts duplicating exactly the disease rows 2345/2350 retired in App.vue
-- are RETIRED outright. Every Split child's `presenceDefaultVisible` is
now derived at emit time from the SAME identity rule `presence.py`'s own
`prune_absent`/`validate_valuation` already use (`presence.is_named_absent`,
made public this arc for exactly this second call site) against the
class's own resolved default valuation (`runner.valuation_for_class`, P1's
own single seam) -- a leaf's `widget` id, or a tagged Exclusive's `[TAG]`,
checked against that valuation's `absent_widgets`. This is what makes
portrait's own repetition-first default (the control-panel `T(...)[BLACK
BOX]` genuinely absent by default on portrait, per P1 item 2) finally
reach the compiled program: the hand-authored table could only ever encode
what its own author remembered to mirror, and P1's portrait valuation
change was never mirrored into it (the exact reviewer-confirmed gap this
arc closes). No path-keyed literal survives in this module after this
change -- `default_visible_by_path` is no longer a `Registration` field,
`build_program` parameter, or `_build_node` parameter; `absent_widgets:
FrozenSet[str]` (threaded through the same positions) is what replaces it.

Shared TS types (ADR-0012 one-home-per-fact, W3): the `LytProgram`
data-shape types (`LytAxis`, `LytTrackShape`, etc.) used to be
duplicated verbatim inside this script's own `render_ts` (the only
consumer, landscape's `lyt-layout.gen.ts`). Now that a second
generated file exists, this script instead emits an `import type
{...} from './lyt-layout-types'` plus a re-export (`export type *`)
into EACH generated file -- the actual interface/union declarations
live once, hand-written, at `frontend/src/state/lyt-layout-types.ts`.
Every existing consumer's import path (`from '../../state/lyt-layout.
gen'`) keeps resolving unchanged, since the re-export makes the types
transitively available there too.

P2d -- emit the DERIVED orientation (2026-08-12, ledger row 2310's own
Amendment 9 mechanism, finally threaded through to emission; commission
`.claude/dispatch-reports/lyt-p2d-orientation-emission.md`). Closes the
gap R1 disclosed and left open (`.claude/dispatch-reports/
lyt-r1-orientation-pathmap.md`, "CRITICAL SUBTLETY" section): the `tree`
leaf's `orientation` field used to come from `_load_orientation`'s bare
load-time placeholder default (`'v'`, unconditionally, for EVERY class --
`orientation.py`'s own derivation machinery was never called by this
emitter at all), not from the genuine per-solve verdict Amendment 9's own
mechanism (`orientation.compute_derived_orientations`) computes.

`_derive_tree_orientation(class_id)` (new function, below) reproduces
`runner.run_all`'s own solve shape for `tree` specifically: resolve the
class's own default presence valuation (`runner.valuation_for_class`,
the same seam `_absent_widgets_for_class` above already uses), prune via
`presence.resolve_and_validate` (so `tree` is genuinely the row's SOLE
residual-holding content wherever a `@toggle`d sibling is absent by
default -- SPEC.md §17.4's own portrait finding), then solve at EVERY
size the class's own representative solve set names --
`coverage_matrix.LANDSCAPE_SIZES`/`PORTRAIT_SIZES`, reused verbatim per
this commission's own "do not invent sizes" instruction, since that is
already the encoding's own declared coverage-checked point set (Amendment
4's own feasibility table, `coverage_matrix.py`'s module docstring). An
INFEASIBLE size contributes no derived value (there is no solved
rectangle to derive an aspect from -- the same honest skip
`compute_derived_orientations` itself already applies) and is not treated
as a disagreement.

If every solvable size's derived value agrees, that value is threaded
into `_build_node`'s leaf branch for the `tree` widget specifically (a
new `tree_orientation` parameter, threaded the same way `absent_widgets`
already is) -- every OTHER leaf keeps reading its own load-time
`node.orientation` exactly as before (this section's own "non-residual
leaves keep their authored/default orientation" instruction, read
together with the disclosed scope narrowing two paragraphs below: `tree`
is the only RESIDUAL leaf this stage threads the derivation through, not
every residual leaf the language could in principle name one for).

**Result, both classes, verified by direct re-solve (see this
commission's own dispatch report for the full table).** Landscape: `tree`
derives `'v'` at both its solvable representative sizes (1920x1080,
2560x1440 -- 1280x1024 is INFEASIBLE, contributing no vote) -- unanimous,
and IDENTICAL to the pre-P2d static default, so landscape's compiled
program is byte-identical to before this stage. Portrait: `tree` derives
`'h'` at all five of its representative sizes -- unanimous, and DIFFERENT
from the pre-P2d static default (`'v'`) -- this is the one observable
diff this stage produces, exactly matching the commission's own named
expectation and R1's own `activeTreeOrientation` wiring's downstream
consumption (`frontend/src/App.vue`; no frontend source change needed,
since R1 already reads `leafNodes['tree'].orientation` off whichever
value the compiled program itself carries).

**Fail-loud disagreement refusal (ADR-0002), exercised, not merely
theoretical.** If a class's own solvable representative sizes ever
disagreed on `tree`'s derived orientation, `_derive_tree_orientation`
raises `OrientationDerivationError` (below) naming every disagreeing
size and its derived value, rather than picking one silently or
averaging/interpolating -- the static compiled contract cannot honestly
carry a size-varying fact as one field. This is not a hypothetical
branch: running the FULLY GENERAL form of Amendment 9's own mechanism
(`orientation.compute_derived_orientations`, which derives a value for
EVERY residual leaf `wellformed.find_residual_leaves` names, not just
`tree`) against landscape's own pruned default-valuation tree finds
THREE residual leaves -- `B`, `tree`, `otherBand` -- and `otherBand`
GENUINELY DISAGREES across landscape's own two solvable representative
sizes: `'h'` at 1920x1080 (solved rect 664x564, aspect 1.18 > 1) versus
`'v'` at 2560x1440 (solved rect 664x924, aspect 0.72 < 1) -- a real,
checked fact about the current encoding (`otherBand`'s width is pinned
to the control panel's own fixed 664px column while its height is
genuinely elastic, so it flips wide-short to narrow-tall as the viewport
grows taller), not a derivation bug. `B`'s own derived value is
unanimous `'v'` in both classes at every solvable size (matching its own
pre-existing static default exactly, so deriving it would be a byte-
identical no-op either way).

**DISCLOSED, DELIBERATE SCOPE NARROWING (STOP-and-report per the
umbrella CLAUDE.md; recorded in this stage's own dispatch report).** This
stage threads the derivation through for `tree` ONLY, not for every
residual leaf Amendment 9's mechanism could in principle name one for.
Three reasons, together: (1) this arc's own named target, throughout the
commission's own text, is `tree`'s orientation specifically -- the one
leaf a live consumer (`frontend/src/App.vue`'s `activeTreeOrientation`,
wired in R1) actually reads; (2) `B`'s derivation is a verified no-op (no
behavior to gain by threading it); (3) `otherBand`'s derivation
GENUINELY DISAGREES within landscape, and there is no current downstream
consumer of `otherBand`'s `orientation` field at all (it is one of the
M2 STAGE F1 PORT's own disclosed "no current consumer reads them yet"
fields) -- threading the fully general mechanism through emission today
would make landscape's ENTIRE compiled program refuse to build over a
field nothing reads, a consequence far outside this arc's own scope and
squarely the kind of disposition (does the static contract simply never
carry `otherBand`'s orientation, does a future consumer need runtime
re-derivation instead, does the encoding itself need to change) the
commission's own text reserves for the orchestrator, not something to
improvise here. `otherBand`/`B` therefore keep reading their own
load-time `node.orientation` default exactly as every leaf did before
this stage, byte-identical -- this stage touches only the `tree` widget's
own emitted value, in both classes.

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, FrozenSet, List, Optional, Tuple

import lyt_ast as ast
import loader
import orientation
import runner
from compiler import solve_lexicographic
from coverage_matrix import LANDSCAPE_SIZES, PORTRAIT_SIZES
from presence import is_named_absent, resolve_and_validate
from runner import ENCODINGS_DIR, _gather_reach_preferred_widgets

STATE_DIR = Path(__file__).parent.parent.parent / "frontend" / "src" / "state"

# P2d: the one leaf widget id this stage threads Amendment 9's derivation
# through (module docstring, "P2d -- emit the DERIVED orientation" /
# "DISCLOSED, DELIBERATE SCOPE NARROWING" sections).
TREE_WIDGET_ID = "tree"

# P2d: `_derive_tree_orientation`'s own representative-size lookup, keyed
# by class id -- reuses `coverage_matrix.py`'s own declared size lists
# verbatim (the commission's own "the sizes the encoding/coverage
# machinery already names -- reuse the existing size lists, do not invent
# sizes" instruction), never a fresh list invented here.
_REPRESENTATIVE_SIZES: Dict[str, List[Tuple[str, int, int]]] = {
    "landscape": LANDSCAPE_SIZES,
    "portrait": PORTRAIT_SIZES,
}


class OrientationDerivationError(ValueError):
    """P2d (module docstring, "Fail-loud disagreement refusal" section):
    raised by `_derive_tree_orientation` when a class's own solvable
    representative sizes disagree on `tree`'s genuinely derived
    orientation -- the compiled static contract cannot honestly carry a
    size-varying fact as one field (ADR-0002). `.detail` carries the
    disagreement as data (size label -> derived value), not just the
    formatted message, so a caller can assert on *why* this was refused
    without re-parsing prose -- the same "structured error" posture
    `errors.py`'s own `LytError` family uses elsewhere in this
    substrate (this exception is a plain `ValueError` subclass, not that
    dataclass family, since this is an emit-time-only refusal with no
    parse/load-error sibling to share a base with)."""

    def __init__(self, message: str, *, detail: Dict[str, List[str]]):
        super().__init__(message)
        self.detail = detail

# Landscape's default output path is unchanged from the pre-W3 script
# (kept as its own name, `DEFAULT_OUT`, for backward compatibility with
# existing callers/tests that reference it directly).
DEFAULT_OUT = STATE_DIR / "lyt-layout.gen.ts"
DEFAULT_OUT_PORTRAIT = STATE_DIR / "lyt-layout-portrait.gen.ts"

LAYOUT_FILE = "lengyue_landscape.lyt"
LAYOUT_NAME = "lengyue-landscape"
CLASS_ID = "landscape"

# LYT presence arc P2a: `DEFAULT_VISIBLE_BY_PATH`/`DEFAULT_VISIBLE_BY_PATH_
# PORTRAIT`, the two hand-maintained path-keyed dicts this module used to
# carry here, are RETIRED -- see the module docstring's own "LYT presence
# arc P2a" section for the full rationale (reviewer-confirmed gap: the
# tables were a hand-mirror of `presence.py`'s own valuation machinery that
# P1's portrait repetition-first default was never re-mirrored into). Each
# Split child's `presenceDefaultVisible` is now derived at emit time,
# per-class, from `runner.valuation_for_class` + `presence.is_named_absent`
# -- see `_absent_widgets_for_class` and `_build_node`'s Split branch below.


@dataclass(frozen=True)
class Registration:
    """One screen class's full set of build-program inputs -- threaded
    explicitly through `build_program`/`_build_node` rather than read off
    module globals, so a single process can build multiple registrations
    without any global-reassignment footgun (see module docstring)."""

    layout_file: str
    layout_name: str
    class_id: str
    const_name: str
    default_out: Path
    # REALIZATION WAVE additions (see module docstring's own section by that
    # name for the full rationale). `open_control_panel=False` reproduces the
    # pre-wave "always collapse the whole Exclusive" behavior byte-for-byte --
    # every prior registration (there were none before this wave; both
    # current registrations opt in) would have defaulted here.
    open_control_panel: bool = False
    # Tab id per outer-T child, in ENCODING order -- must match the T's own
    # child count when `open_control_panel` is True. Doubles as the i18n key
    # suffix (`app.tabs.<id>`) and the synthetic collapsed-child widget id
    # (`CP-<id>`).
    control_panel_tab_ids: Tuple[str, ...] = ()
    # Child INDICES (0-based, encoding order) that stay collapsed to one
    # synthetic `blackbox` leaf each, per this wave's own disclosed scope
    # narrowing (module docstring).
    control_panel_collapse_indices: frozenset = frozenset()


REGISTRATIONS: Dict[str, Registration] = {
    "landscape": Registration(
        layout_file=LAYOUT_FILE,
        layout_name=LAYOUT_NAME,
        class_id=CLASS_ID,
        const_name="LYT_LANDSCAPE",
        default_out=DEFAULT_OUT,
        open_control_panel=True,
        control_panel_tab_ids=("library", "cards", "settings", "analysis", "other"),
        control_panel_collapse_indices=frozenset({3}),
    ),
    "portrait": Registration(
        layout_file="lengyue_portrait.lyt",
        layout_name="lengyue-portrait",
        class_id="portrait",
        const_name="LYT_PORTRAIT",
        default_out=DEFAULT_OUT_PORTRAIT,
        open_control_panel=True,
        control_panel_tab_ids=("library", "cards", "settings", "analysis", "other"),
        control_panel_collapse_indices=frozenset({3}),
    ),
}


def _runner_registration_for_class(class_id: str) -> runner.Registration:
    """LYT presence arc P2a: locates the `runner.Registration` (a DIFFERENT
    dataclass from this module's own `Registration` above -- same name,
    two separate concepts, see each module's own docstring) that declares
    `class_id` among its `layout_by_class` keys. For both screen classes
    this module knows about today, that is the one `"lengyue_landscape+
    portrait"` entry in `runner.REGISTRATIONS` -- resolved by search rather
    than hardcoded, so a future third class registered on either side stays
    correctly paired without this function needing an edit."""
    for reg in runner.REGISTRATIONS:
        if class_id in reg.layout_by_class:
            return reg
    raise ValueError(
        f"no runner.Registration declares screen class {class_id!r} -- "
        "emit_layout_tree.py's presence derivation (LYT presence arc P2a) "
        "has no valuation to resolve against."
    )


def _absent_widgets_for_class(class_id: str) -> FrozenSet[str]:
    """The one seam `build_program` below resolves a class's own default
    presence valuation through (LYT presence arc P2a) -- `runner.
    valuation_for_class` is P1's own single seam for "which valuation does
    this class solve as its default"; this function just narrows the
    result to the `absent_widgets` set `_build_node`'s Split branch needs."""
    reg = _runner_registration_for_class(class_id)
    return runner.valuation_for_class(reg, class_id).absent_widgets


def _derive_tree_orientation(class_id: str) -> str:
    """P2d (module docstring, "P2d -- emit the DERIVED orientation"
    section): the one seam `build_program` resolves the `tree` leaf's
    genuine per-solve orientation through. Reproduces `runner.run_all`'s
    own solve shape for this ONE widget (raw load -> per-class prune via
    `resolve_and_validate` -> solve at every representative size), then
    applies Amendment 9's own `orientation.compute_derived_orientations`
    at each solvable size and requires unanimous agreement -- see
    `OrientationDerivationError`'s own docstring for the disagreement
    refusal shape.

    An INFEASIBLE representative size contributes no vote (there is no
    solved rectangle to derive an aspect from -- `compute_derived_
    orientations` itself already skips these; this function does too, by
    construction, since it only records a vote when that dict actually
    names `TREE_WIDGET_ID`). A class with NO solvable representative size
    at all, or one whose pruned tree never makes `tree` a residual leaf
    in the first place, raises a plain `ValueError` -- there is nothing
    to derive, which is itself a fact worth failing loudly over rather
    than silently falling back to the load-time placeholder."""
    reg = _runner_registration_for_class(class_id)
    layout_name = reg.layout_by_class[class_id]
    if class_id not in _REPRESENTATIVE_SIZES:
        raise ValueError(
            f"_derive_tree_orientation has no representative-size list for class {class_id!r} -- "
            f"only {sorted(_REPRESENTATIVE_SIZES)} are known (coverage_matrix.py's own declared lists)."
        )
    raw_layouts: Dict[str, ast.Slot] = {}
    for f in reg.files:
        text = (ENCODINGS_DIR / f).read_text()
        raw_layouts.update(loader.load_layouts(text, waivers=reg.waivers))
    valuation = runner.valuation_for_class(reg, class_id)
    slot = resolve_and_validate(raw_layouts, [layout_name], valuation)[layout_name]
    reach = _gather_reach_preferred_widgets(slot, reg.board_widget)
    votes: Dict[str, List[str]] = {}
    for label, w_px, h_px in _REPRESENTATIVE_SIZES[class_id]:
        result = solve_lexicographic(
            slot,
            class_id=class_id,
            w_px=w_px,
            h_px=h_px,
            board_widget=reg.board_widget,
            reach_preferred_widgets=reach,
            time_limit_s=20.0,
        )
        if result.status not in ("OPTIMAL", "FEASIBLE"):
            continue  # INFEASIBLE: no solved rectangle, no vote (not a disagreement).
        derived = orientation.compute_derived_orientations(slot, result)
        value = derived.get(TREE_WIDGET_ID)
        if value is not None:
            votes.setdefault(value, []).append(label)
    if not votes:
        raise ValueError(
            f"_derive_tree_orientation: class {class_id!r} has no solvable representative size at "
            f"which {TREE_WIDGET_ID!r} is a residual-holding leaf -- nothing to derive."
        )
    if len(votes) > 1:
        raise OrientationDerivationError(
            f"class {class_id!r}: representative sizes disagree on {TREE_WIDGET_ID!r}'s derived "
            f"orientation -- {votes!r}. The compiled static contract cannot honestly carry a "
            "size-varying fact as one field (ADR-0002); resolving this (runtime re-derivation, an "
            "encoding change, or something else) is a disposition for the orchestrator, not this "
            "emitter.",
            detail=votes,
        )
    return next(iter(votes))


def _px(e: ast.Extent, *, where: str) -> float:
    if e.unit != "px":
        raise NotImplementedError(
            f"{where}: expected a resolved px extent, got unit={e.unit!r} (v={e.v}) -- "
            "emit_layout_tree.py's grid mapping only handles the sizing shapes actually "
            "present in encodings/lengyue_landscape.lyt and encodings/lengyue_portrait.lyt; "
            "extend _track_shape_for_child before pointing this generator at a new shape."
        )
    return e.v


def _is_fixed(sizing: ast.Sizing) -> bool:
    if sizing.max == "inf":
        return False
    if sizing.min.unit != "px" or sizing.pref.unit != "px" or sizing.max.unit != "px":
        return False
    return sizing.min.v == sizing.pref.v == sizing.max.v


def _track_shape_for_child(sizing: ast.Sizing, *, where: str) -> dict:
    """Mirrors emit_mockup.py's `_track_for_child` mapping table (that
    module's own docstring, read in full, is the normative source) but
    returns a JSON-serializable shape descriptor instead of a literal CSS
    string -- `LytNode.vue` does the final `minmax()`/`clamp()` string
    assembly at runtime, off this same closed vocabulary.

    REPAIR (`.claude/dispatch-reports/lyt-optionc-repair.md`, Finding 2):
    this function used to accept a `floor_override_px` that let an
    Exclusive/T child's emitted floor be RE-DERIVED from its own children
    (the componentwise max the solver uses) rather than read off the
    child's OWN declared `sizing.min`. That override is retired -- every
    node kind, T included, now emits its own slot's declared `min`
    unconditionally, which is the marker's own honest reservation, not a
    solver-side derivation leaking into a live-consumed track. See this
    module's own docstring (AMENDMENT 6 / REPAIR section) for the full
    account of why the two diverged and why only the emitter's copy of the
    derivation was the bug."""
    if _is_fixed(sizing):
        return {"kind": "fixed", "px": _px(sizing.pref, where=where)}
    min_px = _px(sizing.min, where=where)
    if sizing.max == "inf":
        if sizing.pref.unit == "fr":
            return {"kind": "elastic", "minPx": min_px, "frWeight": sizing.pref.v}
        raise NotImplementedError(f"{where}: uncapped non-fr-pref sizing has no disclosed track mapping: {sizing!r}")
    max_px = _px(sizing.max, where=where)
    if sizing.pref.unit == "fr":
        return {"kind": "elastic-capped", "minPx": min_px, "maxPx": max_px}
    raise NotImplementedError(f"{where}: capped non-fr-pref sizing has no disclosed track mapping: {sizing!r}")


def _find_board_composite_child(node: ast.Split) -> Optional[Tuple[int, ast.Split, float]]:
    """Verbatim port of emit_mockup.py's own `_find_board_composite_child`
    -- see that function's docstring for the full derivation. Detects the
    one recognized shape (a Split child = [one aspect-locked Leaf, ...
    otherwise only FIXED siblings]) so the CASE A/B board-maximize
    override below can be applied only where it was actually derived.
    Class-agnostic -- called against both landscape's and portrait's root
    split, and correctly finds exactly one match in each (verified by
    this module's own test suite)."""
    matches: List[Tuple[int, ast.Split, float]] = []
    for i, child in enumerate(node.children):
        if not isinstance(child.node, ast.Split):
            continue
        sub = child.node
        aspect_leaves = [c for c in sub.children if isinstance(c.node, ast.Leaf) and c.sizing.aspect is not None]
        if len(aspect_leaves) != 1:
            continue
        others = [c for c in sub.children if c is not aspect_leaves[0]]
        if not all(_is_fixed(c.sizing) for c in others):
            continue
        fixed_sum = sum(_px(c.sizing.pref, where=f"board-composite-fixed-sum@{i}") for c in others)
        matches.append((i, sub, fixed_sum))
    return matches[0] if len(matches) == 1 else None


def _apply_board_priority(
    node: ast.Split, shapes: List[dict], *, match: Tuple[int, ast.Split, float]
) -> List[dict]:
    """Ports BOTH cases of emit_mockup.py's `_board_priority_tracks`
    (that function's own ~70-line docstring is the normative derivation
    for the CASE A/B split -- read it in full before touching this
    function). `node` is always the tree's ROOT split (see this module's
    `_build_node` call site) -- the 100vw/100vh constants below are only
    valid when `node` itself is hard-pinned to the full viewport, which
    is true for the root and NOT generally true for a split nested
    deeper in the tree.

    CASE A (`composite.axis != node.axis` -- landscape's H-root/V-
    composite shape): caps the ONE non-board elastic+capped SIBLING's
    track via a `board-priority-clamp` descriptor (unchanged from the
    original W1 version of this function).

    CASE B (`composite.axis == node.axis` -- portrait's V-root/V-
    composite shape): caps the COMPOSITE's OWN track (not a sibling's)
    via a NEW `board-priority-self-clamp` descriptor -- `minmax(0px,
    calc(100<naturalCrossUnit> + fixedSiblingSumPx px))`, no independent
    min/max the way CASE A's clamp has (see
    frontend/src/state/lyt-layout-types.ts's doc-comment on this union
    member for the full CSS-mapping disclosure). `node_cross_unit` is
    the SAME viewport-relative constant emit_mockup.py's CASE A and
    CASE B both key off -- when `composite.axis == node.axis`,
    composite's own cross axis (opposite `composite.axis`) is the same
    axis as node's own cross axis (opposite `node.axis`, which equals
    `composite.axis` by this branch's own condition), so one shared
    derivation correctly serves both branches."""
    board_idx, composite, fixed_sum = match
    out = list(shapes)
    node_cross_unit = "vh" if node.axis == "h" else "vw"
    if composite.axis == node.axis:
        # CASE B: cap composite's OWN track at its natural ceiling.
        out[board_idx] = {
            "kind": "board-priority-self-clamp",
            "naturalCrossUnit": node_cross_unit,
            "fixedSiblingSumPx": fixed_sum,
        }
        return out
    # CASE A: cap the non-board, elastic+capped sibling(s).
    for j, child in enumerate(node.children):
        if j == board_idx:
            continue
        sizing = child.sizing
        if _is_fixed(sizing) or sizing.max == "inf" or sizing.pref.unit != "fr":
            continue  # not the elastic+capped shape this override is for
        min_px = _px(sizing.min, where=f"board-priority/sibling-min@{j}")
        max_px = _px(sizing.max, where=f"board-priority/sibling-max@{j}")
        out[j] = {
            "kind": "board-priority-clamp",
            "minPx": min_px,
            "maxPx": max_px,
            "naturalBoardCrossUnit": node_cross_unit,
            "fixedSiblingSumPx": fixed_sum,
            "parentGapPx": node.gap_px,
        }
    return out


def _domain_facets(leaf: ast.Leaf) -> Tuple[str, List[str]]:
    return leaf.domain, sorted(leaf.facets)


def _collect_leaf_widgets(slot: ast.Slot) -> List[str]:
    """AMENDMENT 6 (ledger row 1937, .claude/dispatch-reports/
    lyt-tab-region-consult.md §6.2/§6.4): a structural fold, total over
    Leaf|Split|Exclusive, collecting every LEAF widget id in a subtree in
    document order. Replaces the retired plain-leaf-T assertion's
    one-level-only `c.node.widget` read (see `_build_node`'s Exclusive
    branch below) -- a T-node child no longer has to BE a bare Leaf for
    this emitter to describe it; it only has to be SOME well-typed subtree,
    and this fold walks whatever depth/shape it actually has. For a bare
    Leaf child (every CP-* tab pre-Amendment-6, and still CP-library/
    CP-cards/CP-other today) this returns exactly `[leaf.widget]` --
    byte-identical output to the pre-Amendment-6 one-level read."""
    node = slot.node
    if isinstance(node, ast.Leaf):
        return [node.widget]
    if isinstance(node, ast.Split):
        return [w for c in node.children for w in _collect_leaf_widgets(c)]
    if isinstance(node, ast.Exclusive):
        return [w for c in node.children for w in _collect_leaf_widgets(c)]
    raise TypeError(f"unknown LayoutNode kind: {node!r}")


def _demote_field(slot: ast.Slot) -> Optional[dict]:
    """LYT presence arc P2a (module docstring, section by that name, item
    (a)): the ONE place a Slot's own `@demote(<axis> <extent>)` declaration
    (`slot.presence.kind == "demote"`) becomes the emitted `demote` field
    shape -- the leaf branch below used to inline this; the Exclusive
    branch never called an equivalent at all (the reviewer-confirmed gap
    this arc closes), so both now share this one function rather than the
    Exclusive branch growing its own second copy of the same three lines."""
    if slot.presence.kind != "demote":
        return None
    return {"axis": slot.presence.demote_axis, "belowPx": slot.presence.demote_below_px}


def _build_node(
    slot: ast.Slot,
    *,
    path: Tuple[int, ...],
    absent_widgets: FrozenSet[str] = frozenset(),
    open_control_panel: bool = False,
    control_panel_tab_ids: Tuple[str, ...] = (),
    control_panel_collapse_indices: frozenset = frozenset(),
    tree_orientation: Optional[str] = None,
    _within_opened_tab: bool = False,
) -> dict:
    node = slot.node
    if isinstance(node, ast.Leaf):
        domain, facets = _domain_facets(node)
        # P2d (module docstring, "P2d -- emit the DERIVED orientation"
        # section): `tree_orientation` is the genuinely derived value for
        # the ONE widget id this stage threads Amendment 9's mechanism
        # through -- every OTHER leaf (including the two other residual
        # leaves, `B`/`otherBand`, disclosed narrowing above) still reads
        # its own load-time `node.orientation` exactly as before.
        orientation_value = (
            tree_orientation
            if (node.widget == TREE_WIDGET_ID and tree_orientation is not None)
            else node.orientation
        )
        return {
            "kind": "leaf",
            "widget": node.widget,
            "domain": domain,
            "facets": facets,
            "aspect": slot.sizing.aspect,
            # REALIZATION WAVE (item 3, overflow derivation): the Slot's own
            # `scroll_axes` (Amendment 5) and the Leaf's own `content` class
            # -- carried through so a live-rendered leaf's overflow CSS can
            # be DERIVED from the program instead of hand-authored per
            # component. Sorted for deterministic emitted output.
            "scrollAxes": sorted(slot.scroll_axes),
            "content": node.content,
            # M2 STAGE F1 PORT (module docstring, same name): the eight
            # realization-layer leaf metadata fields, read off already-
            # loaded ast.Leaf/ast.Slot/ast.Sizing attributes (AMENDMENT 7's
            # own earlier port already put them on the AST -- this stage
            # only exposes them to the emitted program). See the module
            # docstring's own disclosed-narrowing paragraph for the three
            # experiment fields/behaviors this port deliberately does NOT
            # carry (unitAxes, wrapPolicy, the ceiling/demand track kinds,
            # the measure_bound CASE B gate).
            "elasticAxes": sorted(node.elastic_axes),
            "ceilingAxes": sorted(node.ceiling_axes),
            "floorAxes": [
                {"axis": a, "px": e.v}
                for a, e in sorted(node.floor_axes, key=lambda pair: pair[0])
            ],
            "edgeAxes": [
                {"axis": a, "disposition": d}
                for a, d in sorted(node.edge_axes, key=lambda pair: pair[0])
            ],
            "orientation": orientation_value,
            "activity": node.activity,
            "demote": _demote_field(slot),
            "envelopeStates": (
                sorted(slot.sizing.envelope_states) if slot.sizing.envelope_states else None
            ),
        }
    if isinstance(node, ast.Exclusive):
        # AMENDMENT 6 (ledger row 1937, .claude/dispatch-reports/
        # lyt-tab-region-consult.md §6.2/§6.4/§8.1): the plain-leaf-T
        # assertion this branch used to raise is RETIRED -- a T-node child
        # no longer has to be a bare ast.Leaf.
        #
        # REALIZATION WAVE (module docstring, same section name): a
        # `open_control_panel`-flagged Exclusive no longer collapses
        # unconditionally -- it emits a genuine 'exclusive' node, folding
        # generically into whichever of its children are NOT in
        # `control_panel_collapse_indices` (recursed via THIS SAME
        # function, open_control_panel reset to False so a nested Exclusive
        # -- today, only CP-analysis's own inner analysis-tabs T -- keeps
        # the pre-wave full-collapse behavior unless a FUTURE wave opts it
        # in explicitly by the same mechanism). An Exclusive this parameter
        # does not flag falls through to a genuine collapse, the SAME shape
        # the pre-wave code always produced for the whole control panel.
        #
        # M2 STAGE B2b (ledger rows 2073/2108/2151, the pane-granularity
        # fix): this branch is NO LONGER reachable ONLY at the true top
        # level -- the settingsPane leaf this stage opens one level (a new
        # nested `T(SP_session, ...)`) sits inside the SETTINGS tab, which
        # is NOT a `control_panel_collapse_indices` member, so the walk
        # genuinely recurses into it with `open_control_panel=False` and
        # lands here TOO. The two callers are distinguishable only by
        # HISTORY, not by local state (`open_control_panel` reads False in
        # both) -- `_within_opened_tab` (new parameter, set True at the
        # ONE recursive call site inside an opened tab's own subtree
        # below, threaded through unconditionally by the Split branch)
        # carries that history: False means "this Exclusive IS the
        # top-level control panel itself" (the pre-existing, still-correct
        # `"controlPanel"` id); True means "this Exclusive is nested inside
        # an ALREADY-open tab's own interior" (a genuinely different
        # region, needing its OWN identity). For the True case, the
        # collapsed placeholder's own widget id is its FIRST collected leaf
        # (`_collect_leaf_widgets(node)[0]`), the SAME "represent a
        # composite by its first leaf" convention `emit_mockup.py`'s own
        # `_first_leaf_widget` already uses for an analogous
        # composite-T-child placeholder -- for the settingsPane case this
        # yields `"SP_session"` (its own first declared leaf), an honest,
        # real widget id rather than a name belonging to an unrelated
        # sibling region.
        if not open_control_panel:
            if _within_opened_tab:
                child_widgets = [w for c in node.children for w in _collect_leaf_widgets(c)]
                return {
                    "kind": "blackbox",
                    "widget": child_widgets[0] if child_widgets else "controlPanel",
                    "tag": node.tag,
                    "childWidgets": child_widgets,
                    "demote": _demote_field(slot),
                }
            child_widgets = [w for c in node.children for w in _collect_leaf_widgets(c)]
            return {
                "kind": "blackbox",
                "widget": "controlPanel",
                "tag": node.tag,
                "childWidgets": child_widgets,
                "demote": _demote_field(slot),
            }
        if len(node.children) != len(control_panel_tab_ids):
            raise ValueError(
                f"open_control_panel Exclusive has {len(node.children)} children but "
                f"control_panel_tab_ids names {len(control_panel_tab_ids)} -- the two must "
                "agree 1:1, in encoding order (module docstring, 'REALIZATION WAVE')."
            )
        ex_children = []
        for i, child in enumerate(node.children):
            cpath = path + (i,)
            tab_id = control_panel_tab_ids[i]
            if i in control_panel_collapse_indices:
                child_widgets = _collect_leaf_widgets(child)
                child_node = {
                    "kind": "blackbox",
                    "widget": f"CP-{tab_id}",
                    "tag": None,
                    "childWidgets": child_widgets,
                    # LYT presence arc P2a: `child` (not the outer T's own
                    # `slot`) -- this is the TAB's own wrapping slot, a
                    # collapsed placeholder for that tab's interior, not for
                    # the control panel itself.
                    "demote": _demote_field(child),
                }
            else:
                child_node = _build_node(
                    child,
                    path=cpath,
                    absent_widgets=absent_widgets,
                    open_control_panel=False,
                    control_panel_tab_ids=(),
                    control_panel_collapse_indices=frozenset(),
                    tree_orientation=tree_orientation,
                    # M2 STAGE B2b: marks every descendant of an opened
                    # tab's own subtree as "inside", so a nested Exclusive
                    # found deeper in (e.g. settingsPane's own new T) is
                    # never confused with the top-level control panel
                    # itself -- see the Exclusive branch's own comment.
                    _within_opened_tab=True,
                )
            ex_children.append(
                {
                    "path": ".".join(str(p) for p in cpath),
                    "tabId": tab_id,
                    "tabLabelKey": f"app.tabs.{tab_id}",
                    "node": child_node,
                }
            )
        return {
            "kind": "exclusive",
            "widget": "controlPanel",
            "tag": node.tag,
            "defaultTabId": control_panel_tab_ids[0],
            "children": ex_children,
            "demote": _demote_field(slot),
        }
    if isinstance(node, ast.Split):
        axis = node.axis
        shapes: List[dict] = []
        for i, child in enumerate(node.children):
            cpath = path + (i,)
            # REPAIR (`.claude/dispatch-reports/lyt-optionc-repair.md`,
            # Finding 2): no more per-Exclusive floor re-derivation here --
            # `_track_shape_for_child` reads `child.sizing.min` directly for
            # every node kind, T included, which is the T's OWN wrapping
            # slot's declared min (now explicit in both .lyt encodings,
            # `min 160px` landscape / `min 200px` portrait) rather than a
            # componentwise max recomputed from the T's (now composite)
            # children. See `_track_shape_for_child`'s own docstring.
            shapes.append(_track_shape_for_child(child.sizing, where=str(cpath)))
        if path == ():
            match = _find_board_composite_child(node)
            if match is not None:
                shapes = _apply_board_priority(node, shapes, match=match)
        children = []
        for i, child in enumerate(node.children):
            cpath = path + (i,)
            children.append(
                {
                    "path": ".".join(str(p) for p in cpath),
                    # LYT presence arc P2a: derived, not table-looked-up --
                    # `is_named_absent` is the SAME identity predicate
                    # `presence.py`'s own `prune_absent`/`validate_valuation`
                    # consult (a leaf's own `widget` id, or a tagged
                    # Exclusive's own `[TAG]`), checked against THIS class's
                    # own resolved default valuation's `absent_widgets`. A
                    # Split child (no identity of its own) is never named
                    # absent, so this is `True` for every Split/plain
                    # container child, matching the retired table's own
                    # "every path it doesn't mention defaults True"
                    # convention exactly -- see `_absent_widgets_for_class`.
                    "presenceDefaultVisible": not is_named_absent(child, absent_widgets),
                    "track": shapes[i],
                    "node": _build_node(
                        child,
                        path=cpath,
                        absent_widgets=absent_widgets,
                        # Threaded through unconditionally (REALIZATION WAVE):
                        # a Split ancestor of the control-panel Exclusive must
                        # forward the SAME open_control_panel/tab-id/collapse
                        # facts all the way down, or the outer T would silently
                        # fall back to full collapse the moment it sits behind
                        # ANY intervening Split (which it always does -- see
                        # both encodings' own root H(...)/V(...) nesting).
                        open_control_panel=open_control_panel,
                        control_panel_tab_ids=control_panel_tab_ids,
                        control_panel_collapse_indices=control_panel_collapse_indices,
                        tree_orientation=tree_orientation,
                        _within_opened_tab=_within_opened_tab,
                    ),
                }
            )
        return {"kind": "split", "axis": axis, "gapPx": node.gap_px, "children": children}
    raise TypeError(f"unknown LayoutNode kind at path {path}: {node!r}")


def build_program(
    *,
    layout_file: str = LAYOUT_FILE,
    layout_name: str = LAYOUT_NAME,
    class_id: str = CLASS_ID,
    open_control_panel: bool = False,
    control_panel_tab_ids: Tuple[str, ...] = (),
    control_panel_collapse_indices: frozenset = frozenset(),
) -> dict:
    text = (ENCODINGS_DIR / layout_file).read_text()
    layouts = loader.load_layouts(text)
    slot = layouts[layout_name]
    if not isinstance(slot.node, ast.Split):
        raise TypeError(f"{layout_name}'s root is not a Split: {slot.node!r}")
    # LYT presence arc P2a: resolved ONCE per build, off `class_id` alone --
    # `_build_node`'s Split branch consults this same frozenset at every
    # depth via `is_named_absent`, so a widget's presence identity (leaf id
    # or tagged-Exclusive tag) drives its own `presenceDefaultVisible`
    # wherever in the tree it appears, no path table required.
    absent_widgets = _absent_widgets_for_class(class_id)
    # P2d: resolved ONCE per build, same posture as `absent_widgets` above --
    # `_derive_tree_orientation` raises (`OrientationDerivationError` or a
    # plain `ValueError`) rather than let a bad derivation reach emission
    # silently (module docstring, "P2d -- emit the DERIVED orientation").
    tree_orientation = _derive_tree_orientation(class_id)
    root = _build_node(
        slot,
        path=(),
        absent_widgets=absent_widgets,
        open_control_panel=open_control_panel,
        control_panel_tab_ids=control_panel_tab_ids,
        control_panel_collapse_indices=control_panel_collapse_indices,
        tree_orientation=tree_orientation,
    )
    return {"classId": class_id, "root": root}


def build_program_for(registration: Registration) -> dict:
    """Convenience wrapper -- `build_program` keyed off one of
    `REGISTRATIONS`'s entries instead of four separate keyword args."""
    return build_program(
        layout_file=registration.layout_file,
        layout_name=registration.layout_name,
        class_id=registration.class_id,
        open_control_panel=registration.open_control_panel,
        control_panel_tab_ids=registration.control_panel_tab_ids,
        control_panel_collapse_indices=registration.control_panel_collapse_indices,
    )


# ---------------------------------------------------------------------------
# TS rendering (pure formatting, deterministic -- no timestamp/hostname/
# random iteration order, matching emit_ts.py's own determinism discipline).
# ---------------------------------------------------------------------------


def _ts_track_shape(shape: dict) -> str:
    kind = shape["kind"]
    if kind == "fixed":
        return f'{{ kind: "fixed", px: {shape["px"]:g} }}'
    if kind == "elastic":
        return f'{{ kind: "elastic", minPx: {shape["minPx"]:g}, frWeight: {shape["frWeight"]:g} }}'
    if kind == "elastic-capped":
        return f'{{ kind: "elastic-capped", minPx: {shape["minPx"]:g}, maxPx: {shape["maxPx"]:g} }}'
    if kind == "board-priority-clamp":
        return (
            "{ kind: \"board-priority-clamp\", "
            f'minPx: {shape["minPx"]:g}, maxPx: {shape["maxPx"]:g}, '
            f'naturalBoardCrossUnit: {json.dumps(shape["naturalBoardCrossUnit"])}, '
            f'fixedSiblingSumPx: {shape["fixedSiblingSumPx"]:g}, parentGapPx: {shape["parentGapPx"]:g} }}'
        )
    if kind == "board-priority-self-clamp":
        return (
            "{ kind: \"board-priority-self-clamp\", "
            f'naturalCrossUnit: {json.dumps(shape["naturalCrossUnit"])}, '
            f'fixedSiblingSumPx: {shape["fixedSiblingSumPx"]:g} }}'
        )
    raise ValueError(f"unknown track shape kind: {kind!r}")


def _ts_demote(demote: Optional[dict]) -> str:
    """Shared TS-literal rendering for a `demote` field's value -- LYT
    presence arc P2a: both the leaf branch and the (newly demote-carrying)
    blackbox/exclusive branches of `_ts_node` below call this, rather than
    each inlining its own copy of the same null-vs-object ternary."""
    if demote is None:
        return "null"
    return f'{{ axis: {json.dumps(demote["axis"])}, belowPx: {demote["belowPx"]:g} }}'


def _ts_node(node: dict, indent: str) -> str:
    kind = node["kind"]
    if kind == "leaf":
        aspect = "null" if node["aspect"] is None else f'{node["aspect"]:g}'
        facets = ", ".join(json.dumps(f) for f in node["facets"])
        scroll_axes = ", ".join(json.dumps(a) for a in node["scrollAxes"])
        content = "null" if node["content"] is None else json.dumps(node["content"])
        # M2 STAGE F1 PORT (module docstring, same name): serialization for
        # the eight ported realization-layer leaf metadata fields.
        elastic_axes = ", ".join(json.dumps(a) for a in node["elasticAxes"])
        ceiling_axes = ", ".join(json.dumps(a) for a in node["ceilingAxes"])
        floor_axes = ", ".join(
            f'{{ axis: {json.dumps(f["axis"])}, px: {f["px"]:g} }}' for f in node["floorAxes"]
        )
        edge_axes = ", ".join(
            f'{{ axis: {json.dumps(e["axis"])}, '
            f'disposition: {json.dumps(e["disposition"])} }}'
            for e in node["edgeAxes"]
        )
        orientation = json.dumps(node["orientation"])
        activity = "null" if node["activity"] is None else json.dumps(node["activity"])
        demote = _ts_demote(node["demote"])
        envelope_states = (
            "null"
            if node["envelopeStates"] is None
            else "[" + ", ".join(json.dumps(s) for s in node["envelopeStates"]) + "]"
        )
        return (
            f'{{ kind: "leaf", widget: {json.dumps(node["widget"])}, '
            f'domain: {json.dumps(node["domain"])}, facets: [{facets}], aspect: {aspect}, '
            f"scrollAxes: [{scroll_axes}], content: {content}, "
            f"elasticAxes: [{elastic_axes}], ceilingAxes: [{ceiling_axes}], "
            f"floorAxes: [{floor_axes}], edgeAxes: [{edge_axes}], "
            f"orientation: {orientation}, activity: {activity}, demote: {demote}, "
            f"envelopeStates: {envelope_states} }}"
        )
    if kind == "blackbox":
        tag = "null" if node["tag"] is None else json.dumps(node["tag"])
        child_widgets = ", ".join(json.dumps(w) for w in node["childWidgets"])
        # LYT presence arc P2a, item (a): `demote` now carried here too --
        # see the module docstring's own section by that name.
        demote = _ts_demote(node["demote"])
        return (
            f'{{ kind: "blackbox", widget: {json.dumps(node["widget"])}, tag: {tag}, '
            f"childWidgets: [{child_widgets}], demote: {demote} }}"
        )
    if kind == "exclusive":
        inner = indent + "  "
        tag = "null" if node["tag"] is None else json.dumps(node["tag"])
        # LYT presence arc P2a, item (a): same addition as the blackbox
        # case above -- the genuinely-opened control panel's own `@demote`
        # declaration reaches the compiled program too.
        demote = _ts_demote(node["demote"])
        children_lines = []
        for child in node["children"]:
            children_lines.append(f"{inner}  {{")
            children_lines.append(f'{inner}    path: {json.dumps(child["path"])},')
            children_lines.append(f'{inner}    tabId: {json.dumps(child["tabId"])},')
            children_lines.append(f'{inner}    tabLabelKey: {json.dumps(child["tabLabelKey"])},')
            children_lines.append(f'{inner}    node: {_ts_node(child["node"], inner + "    ")},')
            children_lines.append(f"{inner}  }},")
        children_block = "\n".join(children_lines)
        return (
            f'{{\n{inner}kind: "exclusive", widget: {json.dumps(node["widget"])}, tag: {tag}, '
            f'defaultTabId: {json.dumps(node["defaultTabId"])}, demote: {demote},\n'
            f"{inner}children: [\n{children_block}\n{inner}],\n{indent}}}"
        )
    if kind == "split":
        inner = indent + "  "
        children_lines = []
        for child in node["children"]:
            children_lines.append(f"{inner}  {{")
            children_lines.append(f'{inner}    path: {json.dumps(child["path"])},')
            children_lines.append(f'{inner}    presenceDefaultVisible: {json.dumps(child["presenceDefaultVisible"])},')
            children_lines.append(f'{inner}    track: {_ts_track_shape(child["track"])},')
            children_lines.append(f'{inner}    node: {_ts_node(child["node"], inner + "    ")},')
            children_lines.append(f"{inner}  }},")
        children_block = "\n".join(children_lines)
        return (
            f'{{\n{inner}kind: "split", axis: {json.dumps(node["axis"])}, gapPx: {node["gapPx"]:g},\n'
            f"{inner}children: [\n{children_block}\n{inner}],\n{indent}}}"
        )
    raise ValueError(f"unknown node kind: {kind!r}")


def render_ts(program: dict, *, registration: Registration) -> str:
    lines: List[str] = []
    lines.append("/**")
    lines.append(" * GENERATED FILE — do not hand-edit.")
    lines.append(" * Tool: research/lyt/emit_layout_tree.py")
    lines.append(
        f" * Source encoding: research/lyt/encodings/{registration.layout_file} "
        f"(layout `{registration.layout_name}`)"
    )
    lines.append(
        " * The compiled LYT program (H/V/Exclusive tree, unsolved) as typed TS data — "
        "consumed at runtime by LytNode.vue, which realizes each Split as a live CSS "
        "Grid container (roadmap S3, 'layout as data, not template')."
    )
    lines.append(
        " * REALIZATION WAVE: the control-panel Exclusive (T) node is now genuinely "
        "opened (kind 'exclusive', widget 'controlPanel') for library/cards/settings/"
        "other; analysis stays collapsed to a 'blackbox' leaf (CP-analysis) — a "
        "disclosed, deliberate scope narrowing (dynamic user-configurable analysis "
        "tabs) — see this tool's own module docstring, 'REALIZATION WAVE' and "
        "'SETTINGS OPENED LIVE' sections."
    )
    lines.append(
        " * M2 STAGE F1 PORT: leaf nodes now carry eight additional "
        "realization-layer metadata fields (elasticAxes/ceilingAxes/floorAxes/"
        "edgeAxes/orientation/activity/demote/envelopeStates), ported from the "
        "model-iteration loop experiment as inert data — no current consumer "
        "reads them yet; see this tool's own module docstring, 'M2 STAGE F1 "
        "PORT' section, for the disclosed narrowing (unitAxes/wrapPolicy and "
        "two track-shape algorithm changes are NOT ported this stage)."
    )
    lines.append(
        " * LYT presence arc P2a: `presenceDefaultVisible` (on every Split child) is "
        "now DERIVED per class from `runner.valuation_for_class`'s own resolved "
        "presence valuation, not a hand-maintained path table — a class's own "
        "portrait/landscape default is a single fact this file mechanically reflects. "
        "`demote` is also now carried on 'blackbox'/'exclusive' nodes (previously "
        "leaf-only) — see this tool's own module docstring, 'LYT presence arc P2a' "
        "section."
    )
    lines.append(
        " * P2d: the `tree` leaf's `orientation` field is now the GENUINELY DERIVED "
        "value (Amendment 9, SPEC.md §17; `orientation.compute_derived_orientations`), "
        "not the load-time placeholder default — every OTHER leaf (including the two "
        "other residual leaves, `B`/`otherBand`) still reads its own load-time default, "
        "a disclosed scope narrowing; see this tool's own module docstring, 'P2d — emit "
        "the DERIVED orientation' section, for the full derivation and the disclosed "
        "`otherBand` disagreement finding this stage does NOT resolve."
    )
    lines.append(
        " * Data-shape types (LytProgram, LytTrackShape, etc.) are NOT declared here — "
        "see './lyt-layout-types.ts' (hand-written, ADR-0012 one-home-per-fact), "
        "re-exported below."
    )
    lines.append(
        f" * Regenerate: cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/python "
        f"emit_layout_tree.py --registration {registration.class_id}"
    )
    lines.append(" *")
    lines.append(" * Public Domain (The Unlicense), matching research/lyt/__init__.py's")
    lines.append(" * license line and the umbrella's ADR-0006 per-file convention.")
    lines.append(" */")
    lines.append("")
    # Only `LytProgram` is a VALUE-position type reference below (the
    # `export const LYT_*: LytProgram = ...` annotation) — importing the
    # other nine names too (as a prior build of this emitter did) tripped
    # `vue-tsc -b`'s `noUnusedLocals` (TS6196) on every one of them, since
    # an `export type { X } from 'Y'` re-export is NOT a usage of a
    # separately-imported `X` in TS's own accounting. The re-export block
    # below carries all ten regardless — that is what actually republishes
    # them under this file's own import path for existing consumers.
    lines.append("import type { LytProgram } from './lyt-layout-types';")
    lines.append("")
    lines.append("export type {")
    lines.append("  LytAxis,")
    lines.append("  LytDomain,")
    lines.append("  LytFacet,")
    lines.append("  LytLeafNode,")
    lines.append("  LytBlackboxNode,")
    lines.append("  LytTrackShape,")
    lines.append("  LytSplitNode,")
    lines.append("  LytExclusiveNode,")
    lines.append("  LytExclusiveChild,")
    lines.append("  LytNodeData,")
    lines.append("  LytChild,")
    lines.append("  LytProgram,")
    lines.append("} from './lyt-layout-types';")
    lines.append("")
    lines.append(f"export const {registration.const_name}: LytProgram = {{")
    lines.append(f'  classId: {json.dumps(program["classId"])},')
    lines.append(f'  root: {_ts_node(program["root"], "  ")},')
    lines.append("};")
    lines.append("")
    return "\n".join(lines)


def main(argv: Optional[List[str]] = None) -> int:
    parser_ = argparse.ArgumentParser(description=__doc__)
    parser_.add_argument(
        "--registration",
        choices=sorted(REGISTRATIONS),
        default="landscape",
        help="which screen class to compile (default: landscape, matching this script's pre-W3 behavior)",
    )
    parser_.add_argument("--out", type=Path, default=None, help="output .ts path (default: the registration's own)")
    args = parser_.parse_args(argv)

    registration = REGISTRATIONS[args.registration]
    out = args.out if args.out is not None else registration.default_out

    program = build_program_for(registration)
    text = render_ts(program, registration=registration)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text)
    print(f"[emit_layout_tree] wrote {out} (registration={args.registration})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
