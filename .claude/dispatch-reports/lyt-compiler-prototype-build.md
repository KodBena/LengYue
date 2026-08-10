# LYT compiler prototype — build report

Commission: "we have ortools installed in ~/w/vdc/venvs/generic/, can you
try it out? Or, do we have a compiler for the suggested DSL?" — build a
prototype compiler making LYT (the layout-description language in
`.claude/dispatch-reports/layout-language-consult.md`) runnable end to
end: parser/loader, CP-SAT compiler per §6, well-formedness enforcement,
and a runner that solves + renders.

Read end to end before starting: `layout-language-consult.md` (all 701
lines, all seven sections). Environment: `~/w/vdc/venvs/generic/bin/python`
(ortools 9.15.6755, confirmed importable, `cp_model` available). All Python
invocations below ran under `nice -n 19`, in the foreground, with
`timeout=600000` on the first attempt of each.

Code lives at `research/lyt/` in the worktree (exploratory research
tooling, not application code — `frontend/` untouched, per umbrella scope
discipline). Plain Python, stdlib + ortools only.

## Concrete-syntax choice

The consult document gives BOTH an abstract TS-interface AST (§4.1,
normative per its own words, "the AST is normative") AND an EBNF concrete
syntax, and works five examples in that concrete syntax (§5). We
implemented **both**: `lyt_ast.py` mirrors the TS interfaces as frozen
Python dataclasses (the normative representation everything downstream
operates on), and `parser.py` is a real tokenizer + recursive-descent
parser for the EBNF-derived concrete syntax, because §5's own worked
examples are given in that syntax and transcribing them "faithfully"
means transcribing that text, not re-deriving a Python literal from
scratch. `loader.py` sits between the two: it type-checks a parsed raw
tree into the typed AST, and is where ADR-0002 refusals actually happen.

## Per-claim status

1. **Parser/loader for LYT descriptions, all five §5 encodings
   transcribed.** WITNESSED. `research/lyt/parser.py` (tokenizer +
   recursive-descent, ~270 lines) implements the EBNF at consult-doc lines
   274-287 plus disclosed extensions (below). `research/lyt/loader.py`
   type-checks into `lyt_ast.py`'s dataclasses. All five `encodings/*.lyt`
   files load cleanly:
   ```
   $ nice -n 19 ~/w/vdc/venvs/generic/bin/python -c "
   import loader
   for name in ['q5go','ogs','lengyue_landscape','lengyue_portrait','current_row_repaired']:
       layouts = loader.load_layouts(open(f'encodings/{name}.lyt').read())
       print(name, 'OK', list(layouts.keys()))
   "
   q5go OK ['q5go']
   ogs OK ['ogs']
   lengyue_landscape OK ['lengyue-landscape']
   lengyue_portrait OK ['lengyue-portrait']
   current_row_repaired OK ['current-row-repaired']
   ```
   §5.1 ("current LengYue, as-is") is transcribed **twice**: verbatim in
   three small `current_row_wart_*.lyt` fragments that are NOT expected to
   load (see claim 3), and as `current_row_repaired.lyt`, the same tree
   with exactly the document's own named warts fixed, which does load and
   solve. Both are faithful to the source text; see "Disclosed
   inventions" for why a single loadable transcription of §5.1 as literally
   written is impossible by construction.

2. **CP-SAT compiler per §6.** WITNESSED. `compiler.py` implements: one
   `(w,h)` IntVar pair per Slot (no x/y variables, positions recovered from
   the ordered partition — §6 line 619-622); root pinned to the screen
   class's `W×H`; H/V partition equalities; T-node same-rectangle sharing
   with structurally-derived min (componentwise max of children); sizing
   min/max bounds; aspect as an integer equality; staged lexicographic
   objective (maximize-board, reach-preferred, minimize-slack). See claim
   4 for solved output. Two real bugs were found and fixed during
   construction — see "Bugs found and fixed" below; both are now covered
   implicitly by every passing solve.

3. **Well-formedness checks, both typed prohibitions + L2, enforced
   loudly at load time.** WITNESSED, three separate refusals, each with a
   structured (not free-text-only) error:
   ```
   $ nice -n 19 ~/w/vdc/venvs/generic/bin/python -c "
   import loader
   from errors import LytLoadError
   for name in ['current_row_wart_content','current_row_wart_presence','current_row_wart_l2']:
       try:
           loader.load_layouts(open(f'encodings/{name}.lyt').read())
           print(name, 'UNEXPECTED: loaded OK')
       except LytLoadError as e:
           print(name, 'REFUSED as expected:', e.detail)
   "
   current_row_wart_content REFUSED as expected: {'where': 'current-row-wart-content:navBarRow', 'prohibition': 'content-driven-sizing', 'token': 'CONTENT'}
   current_row_wart_presence REFUSED as expected: {'where': 'current-row-wart-presence:engineMetrics', 'prohibition': 'system-release-presence', 'by': 'system', 'hidden': 'release'}
   current_row_wart_l2 REFUSED as expected: {'layout': 'current-row-wart-l2', 'law': 'L2', 'violations': ['root/H0 (sidebarToggle): sole chrome/action occupant of a split child with no bare non-chrome sibling in root']}
   ```
   Each fragment is the document's own text for that exact wart (§5.1
   lines 467, 471-472, 456-458 respectively), isolated to a minimal
   loadable file. REFUSED-AS-EXPECTED for all three.

   The two *typed* prohibitions (content-driven sizing, system+release
   presence) are enforced by the typed AST's own constructors
   (`lyt_ast.Sizing`/`lyt_ast.Presence`) refusing to be built with those
   values — "unrepresentable by construction" is literal here, not just a
   design intention. L2 is a separate structural pass
   (`wellformed.py:check_wellformed`), since it's a graph-shape law over
   an already-legal tree, not a construction-time impossibility.

4. **Runner: solve every encoding at ≥4 representative sizes (1920×1080,
   2560×1440, 1280×1024, 1080×1920 portrait), nearest-neighbor class
   selection, print solved rectangles + ASCII render.** WITNESSED.
   `runner.py` does all of this; full transcript in
   `/tmp/lyt_final_run.txt` during the build (599 lines; key excerpts
   below). Nearest-neighbor is a scale-normalized log-aspect-ratio
   distance (disclosed — §4.4 names the *property* wanted, not a formula).
   It is genuinely exercised only for the LengYue landscape/portrait pair
   (the only §5 pair that comes as two whole trees for two classes — see
   "Disclosed narrowing" below): at 1920×1080 it picks `landscape`, at
   1080×1920 it picks `portrait`, confirmed in the transcript.

5. **pytest coverage: well-formed solves, content-driven-sizing rejected,
   L2 rejected.** WITNESSED, with `pytest` (present in the target venv —
   no `unittest` fallback needed):
   ```
   $ nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest research/lyt -v
   ...
   tests/test_lyt.py::test_well_formed_encoding_loads[q5go-q5go] PASSED
   tests/test_lyt.py::test_well_formed_encoding_loads[ogs-ogs] PASSED
   tests/test_lyt.py::test_well_formed_encoding_loads[lengyue_landscape-lengyue-landscape] PASSED
   tests/test_lyt.py::test_well_formed_encoding_loads[lengyue_portrait-lengyue-portrait] PASSED
   tests/test_lyt.py::test_well_formed_encoding_loads[current_row_repaired-current-row-repaired] PASSED
   tests/test_lyt.py::test_well_formed_encoding_solves PASSED
   tests/test_lyt.py::test_content_driven_sizing_is_rejected PASSED
   tests/test_lyt.py::test_system_release_presence_is_rejected PASSED
   tests/test_lyt.py::test_l2_violation_is_rejected PASSED
   tests/test_lyt.py::test_l2_conformer_does_not_raise PASSED
   tests/test_lyt.py::test_unknown_domain_is_rejected PASSED
   ============================== 11 passed in ~2s ==============================
   ```
   `test_l2_conformer_does_not_raise` additionally guards against a
   checker that flags every chrome/action leaf indiscriminately (which
   would make the L2-rejection test pass for the wrong reason).

Nothing in the commission is UNEXERCISED — all four numbered items plus
the pytest requirement were run and witnessed directly.

## The single most interesting thing the solver revealed

Not a bug — a proof. Once the compiler was correct (see "Bugs found and
fixed"), CP-SAT returned **INFEASIBLE, with no objective at all, for the
*base* feasibility model** (not a staging artifact) in these cases:

| encoding | screen | why |
|---|---|---|
| `ogs` (`V(H(B,A),I)`) | 1920×1080, 2560×1440, 1280×1024 | the info panel `I` is stacked *below* a `H(B,A)` row that is forced to span the full viewport width; a square board in that row would need to be as tall as the viewport is wide, which no landscape screen has the height for |
| `q5go` (`H(V(B,A),I)`) | 1280×1024, 1080×1920 | the mirror problem: `I`'s own `min`/`max` (40–60ch) leaves the board column too narrow (1280) or forces the board too tall for the leftover width (1920×1080 portrait, i.e. narrow) to stay square |
| `lengyue-landscape` | 1280×1024 | the side column's declared 340px floor (§5.4 line 566) leaves the board column narrower than the board's own aspect-driven height demands at that size |
| `current-row-repaired` | 1080×1920 (portrait) | the row-axis "as-is" tree was never designed for a portrait screen — exactly the gap the consult document itself names ("the column-axis variant... is already LYT-shaped", line 518-519) but never works out in §5 |

Every one of these was independently confirmed by solving the **base
model with no objective at all** (`compile_program` + a bare `Solve()`,
no `Maximize`/`Minimize` call), ruling out a staging artifact:
```
q5go 1280 1024 INFEASIBLE
lengyue_landscape 1280 1024 INFEASIBLE
current_row_repaired 1080 1920 INFEASIBLE
```
The comparison languages (q5go, OGS) are each given as a **single static
tree** in §5 — no second screen class, unlike LengYue's own clean-room
proposal (§5.4 + §5.5, two trees for two classes). The solver proves,
rather than requiring anyone to eyeball it, that a single static tree
cannot serve both landscape and portrait for either comparison language —
which is exactly the empirical case *for* the multi-class/nearest-neighbor
architecture (§4.4) that the clean-room proposal adopts and that neither
comparison encoding bothers to demonstrate. This wasn't asserted by the
consult document; it fell out of actually running the solver, which is
the entire reason the commissioner asked for a prototype instead of
reading the design on faith.

## Bugs found and fixed (both axis-conflation, both real)

`Slot.sizing` describes the extent "ALONG ITS PARENT'S AXIS" only
(`lyt_ast.py` docstring, quoting consult-doc line 261) — the *cross*
dimension is supposed to come from the parent's own cross-axis fill
equality, not from the child's own sizing a second time. Two functions
applied a child's `min`/`max` to **both** `w` and `h` regardless of which
one was actually "along": `_constrain` (the hard-constraint builder) and
`_collect_slack_terms` (the stage-3 objective). Every one of the five
encodings was INFEASIBLE under the buggy version — a 28px-tall action
strip's height bound was also being applied to its width, which is
typically hundreds of pixels, an unsatisfiable `<= 28`. Fixed by threading
an explicit `along: 'w'|'h'|None` parameter through both functions
(`None` for the root and for Exclusive/T children, which share their
parent's full rectangle on both axes). Both fixes are exercised by every
passing solve in this report — there's no separate regression test beyond
that, which is itself a gap worth naming: a smaller, targeted unit test
asserting "a `{min 28px,...}` leaf under a V-parent doesn't bound its
own width" would have caught this faster and is a natural follow-up if
this prototype gets extended.

A third, non-bug discovery, disclosed in `compiler.py`: even after the
fix, a *feasible* aspect-locked leaf (the board) can be given more
cross-axis room by its parent's partition than its own aspect wants (an
uncapped `pref 1fr` column claims leftover H-partition width, but the
board's own aspect, driven by the column's *height*, wants less). §6's
"no x,y variables... the tree IS the non-overlap proof" (line 620-622)
implicitly assumes every non-aspect-locked child fills its cross axis
exactly; an aspect-locked leaf generally does not. We relaxed the
cross-axis equality to `<=` specifically for aspect-locked leaves,
centered them in the resulting slack during rectangle extraction (the
choice a real UA would make), and added a "stage 1.5" to the lexicographic
solve that resolves this specific slack right after board-maximization —
before reach-preferred, which would otherwise lock in an arbitrary
oversized column width. This is a disclosed *deviation* from §6's literal
3-term ordering, not a bug in the sense above; full reasoning is in
`compiler.py`'s docstrings at the relevant functions.

## Disclosed inventions

Every place the consult document was ambiguous, underspecified, or
internally inconsistent, and what we chose. Numbered for the summary
count at the end of this report.

**Grammar/parsing (needed to parse the document's own §5 text at all):**
1. Only `layoutsec` concrete syntax is parsed; `widgetsec`/`classsec`/
   `objectivesec` have no worked example anywhere in §5 to be faithful
   to, so `Program.classes`/`.objective` are supplied in Python by the
   runner (`lyt_ast.py` docstring).
2. `--` line comments (§5.1 is comment-annotated throughout).
3. `⚠L<digit>` warning markers, preserved as `Slot.violates` metadata
   rather than discarded.
4. A domain or widget identifier may carry a trailing `?`
   (`loadSave[common?, action]`, line 460) — the census's own "flagged,
   not forced" marker (§3); stored as `Leaf.flagged`.
5. Facets may be joined with `+` as well as `,` (`info+action`, line 462).
6. `[TAG]` may trail a `T(...)` node (`[BLACK BOX]`, line 577) as a
   documentation-only annotation.
7. Sizing gained `width <extent>` (alias for `pref`, §5.5 line 592),
   `aspect-coupled` (sugar for `pref 1fr` with the real aspect clamp left
   on the wrapped board leaf, §5.1 line 489), `drag-persisted`
   (documentation flag, no geometric effect in this static-solve
   prototype, §5.1 lines 500/502), and `envelope: {state, ...}` (the base
   grammar's bare `envelope` keyword, line 286, has nowhere to put the
   states L3 requires, line 381).
8. Extents may be sums (`340px+60ch`, §5.4 line 566), resolved to plain
   px at load time.
9. A bare-fixed-extent sizing shorthand, `{28px}` (meaning
   `min=pref=max=28px`), needed for §5.4/§5.5's `A_go[go,
   action]{28px}`-style leaves.
10. Two symbolic sentinels the document writes as prose-in-syntax:
    `CONTENT` (line 467 — the forbidden basis, refused by the loader,
    see claim 3) and `WRAPPER_MIN` (line 500, undefined in the text,
    referencing `layout-model.ts:216` — resolved to 300px, matching the
    control-panel floor the same document cites at
    `layout-model.ts:186-191`).
11. `pref maximize` (§5.2/§5.3/§5.4's board leaf) resolved to `pref 1fr`;
    the actual `maximize-area` objective term is wired in Python by the
    runner, per point 1.
12. A bare number with no unit (`min 0`, §5.1 line 462) is treated as px.

**Semantic/domain resolution:**
13. `I[info]` (§5.2/§5.3) puts a facet name where the grammar's leaf
    production expects a domain. Resolved to `domain='common',
    facets={'info'}`.
14. `A_top[*, action]` (§5.5 line 589) uses `*` as a domain wildcard
    merging two census domains (`A_go ⧺ A_common`). LYT's `Domain` type
    has no union member; resolved to `'common'`.
15. A sixth `Domain` literal, `'blackbox'`, added for the control-panel
    tab region §2 explicitly commissions as opaque and out of the
    five-way A/go|common|debug|board|chrome classification — used for
    the `CP-library`/`CP-cards`/etc. bare identifiers in §5.4/§5.5's
    `T(...)` groups, which aren't bracketed `widgetid[domain,...]` leaves
    at all in the source text.
16. §5.5's further-abbreviated `T( tree, CP-* )[BLACK BOX]{...}` (bare
    `tree`, wildcard `CP-*`) is expanded to the same six children as
    §5.4's less-abbreviated version — same census entities, different
    prose shorthand.
17. `I_engine[...]{28px, envelope as above}` (§5.5 line 596) — "as
    above" is a backreference the grammar has no production for; spelled
    out explicitly instead. Envelope state names
    (`"connected×latency≤5digits"`) are not legal identifiers; renamed
    (`connected_5digit_latency`).
18. A `T` node's own `min` (when omitted, as in "min envelope over tabs",
    §5.4 line 577, itself prose not a value) is derived structurally by
    the compiler as the componentwise max of its children's declared
    `min`, rather than defaulted or guessed.
19. `resizerOuter`/`resizerInner` are tagged `[chrome, action]` in §5.1's
    own worked encoding (lines 499, 503), but §2's census classifies
    resizer bars under domain `B`/`common` ("drag affordances", not
    toggle affordances). Our L2 checker's literal reading of L2's own
    criterion ("domain: 'chrome', facets {action}", line 372) flagged
    them as violations — the document never marks them ⚠L2, and doing so
    would conflate "drags a slot's extent" with "toggles a slot's
    presence", which is not what L2 is about. We deferred to the census
    domain instead of the worked-encoding's own tag; see finding below.

**Sizing completion (elided detail, not warts):**
20. Every one of the five layouts elides sizing on its ROOT slot entirely
    (`layout q5go = H(...)`, no leading `{...}`) — every `Slot` requires
    a `Sizing`, and the compiler pins the root to the class's `W×H`
    regardless, so we supply a no-op placeholder,
    `{min 0, pref 1fr, max inf}`.
21. Sizing is moved to precede its node (`{pref 1fr} V(...)` not
    `V(...) {pref 1fr}`) to match the EBNF's own stated production order
    (line 277) — q5go/OGS write it the other way round in the source
    text.
22. A general completion rule: an omitted `min` defaults to `0px`, an
    omitted `max` defaults to `inf` (both the least-constraining choice)
    — covers the document's own `"…"`-elided lines (`{min 44px …}`,
    `{min 100fr…}`) without special-casing each one; used throughout
    `current_row_repaired.lyt` for the eight uniformly-sized toolbar
    buttons the source elides individually.

**L2 formalization (the document states the law in prose and calls it
"checked structurally" but never gives a formal check):**
23. A Split child is an L2 violation iff its node is a bare chrome/action
    leaf AND no sibling in the same Split is *itself* a bare non-chrome
    leaf (as opposed to a composite). This gets both of the document's
    own worked examples right (sidebar rail = violation, nav-bar toggle
    cluster = conformer) — see `wellformed.py` for the alternative
    reading considered and rejected (whether the leaf's own axis
    dimension would collapse to zero if removed — arguably closer to the
    law's "no band... reserved... alone" phrasing, but needs 2-D
    reasoning judged out of scope for a prototype checker).
24. L2 checking applies to Split (H/V) nodes only, not Exclusive (T) —
    a T child's rectangle is the *whole* parent rectangle (§4.1 line
    297-298), so "a band of a partition axis" doesn't describe a T
    child's relationship to its siblings.

**Compiler-level (§6 is explicitly "sketch... secondary" and silent on
these):**
25. Cross-axis fill relaxed to `<=` (with centering) specifically for
    aspect-locked leaves — see "Bugs found and fixed" above for why `==`
    is wrong there.
26. Lexicographic ordering gained an inserted "stage 1.5" (aspect-slack
    resolution) between maximize-board and reach-preferred, not in §6's
    literal 3-term list — also explained above.
27. `PX_PER_CH = 8.0`, one constant for every screen class (the document
    says only that `ch` is "resolved per class via a declared px-per-ch
    input", line 326-328, without saying whether it varies by class).
28. Presence: only the all-slots-present valuation is solved (§6 line
    636-641 also names solving "any valuation the author lists as
    common", but no worked encoding names one).
29. Non-1 aspect ratios are supported in the constraint-generation code
    path but unexercised — none of the five encodings uses one.
30. The ASCII renderer draws only the first child of a `T(...)` group
    (all children share an identical rectangle per §4.1; drawing all
    would just overwrite the same cells) — a rendering-only choice.

**Total: 30 disclosed inventions/deviations**, spanning grammar
extensions needed just to parse the document's own text, domain/semantic
resolutions where the census scheme and the worked encodings disagree
with each other, sizing completions for elided detail, one formalization
of a law the document states only in prose, and compiler-level choices
where §6 is silent by its own admission.

## Solved output: landscape and portrait, both requested screen sizes

Full transcript (599 lines, all five encodings × four screen sizes) is
not reproduced here in full; this section gives the two clean-room
LengYue encodings at the two sizes the commission named explicitly.

### `lengyue-landscape` @ 1920×1080 (nearest-neighbor picks class `landscape`)

```
objective_values (stage-by-stage) = [1028.0, -0.0, -0.0]
    B                    x=   36 y=    0 w= 1028 h= 1028
    I_board              x=    0 y= 1028 w= 1100 h=   24
    A_board              x=    0 y= 1052 w= 1100 h=   28
    A_go                 x= 1100 y=    0 w=  820 h=   28
    I_engine             x= 1100 y=   28 w=  820 h=   28
    A_common             x= 1100 y=   56 w=  820 h=   28
    tree                 x= 1100 y=   84 w=  820 h=  996
    CP-library           x= 1100 y=   84 w=  820 h=  996
    CP-cards             x= 1100 y=   84 w=  820 h=  996
    CP-settings          x= 1100 y=   84 w=  820 h=  996
    CP-analysis          x= 1100 y=   84 w=  820 h=  996
    CP-other             x= 1100 y=   84 w=  820 h=  996

landscape  1920x1080px  status=OPTIMAL  objective=[1028.0, -0.0, -0.0]
+----------------------------------------------------------------------------------------------------+
| |----------------------------------------------------|  |-----------------------------------------||
| |                                                    |  |-----------------------------------------||
| |                                                    |  |-----------------------------------------||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                         B                          |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                  tree                   ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |                                                    |  |                                         ||
| |----------------------------------------------------|  |                                         ||
||-------------------------------------------------------||                                         ||
||-------------------------------------------------------||-----------------------------------------||
+----------------------------------------------------------------------------------------------------+
```
Board area maximized to 1028×1028 (aspect 1, centered in the leftover
column width via the aspect-relaxation fix); side column at its 32fr
preference, black-box tree/tabs region gets the remainder. `reach-preferred`
and `minimize-slack` are both `-0.0` — every reachable preferred extent was
already met by the maximize-board stage, and no capped slot left slack.

### `lengyue-portrait` @ 1080×1920 (nearest-neighbor picks class `portrait`)

```
objective_values (stage-by-stage) = [1080.0, -0.0, -0.0]
    A_top                x=    0 y=    0 w= 1080 h=   28
    B                    x=    0 y=   28 w= 1080 h= 1080
    I_board              x=    0 y= 1108 w= 1080 h=   24
    A_board              x=    0 y= 1132 w= 1080 h=   28
    I_engine             x=    0 y= 1160 w= 1080 h=   28
    tree                 x=    0 y= 1188 w= 1080 h=  732
    CP-library           x=    0 y= 1188 w= 1080 h=  732
    CP-cards             x=    0 y= 1188 w= 1080 h=  732
    CP-settings          x=    0 y= 1188 w= 1080 h=  732
    CP-analysis          x=    0 y= 1188 w= 1080 h=  732
    CP-other             x=    0 y= 1188 w= 1080 h=  732

portrait  1080x1920px  status=OPTIMAL  objective=[1080.0, -0.0, -0.0]
+----------------------------------------------------------------------------------------------------+
||--------------------------------------------------------------------------------------------------||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                B                                                 ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||--------------------------------------------------------------------------------------------------||
||--------------------------------------------------------------------------------------------------||
||--------------------------------------------------------------------------------------------------||
||--------------------------------------------------------------------------------------------------||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                               tree                                               ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||                                                                                                  ||
||--------------------------------------------------------------------------------------------------||
```
Board maximized to the full 1080px width (portrait's board is
width-bound, `width 100fr` per §5.5), square, everything else stacked
below it as declared.

## Files

- `research/lyt/lyt_ast.py` — typed AST (dataclasses).
- `research/lyt/parser.py` — tokenizer + recursive-descent concrete-syntax parser.
- `research/lyt/loader.py` — raw tree → typed AST, typed-prohibition enforcement.
- `research/lyt/wellformed.py` — L2 structural check.
- `research/lyt/errors.py` — structured `LytParseError`/`LytLoadError`.
- `research/lyt/compiler.py` — CP-SAT compiler + staged lexicographic solve.
- `research/lyt/render.py` — ASCII-art renderer.
- `research/lyt/runner.py` — CLI: nearest-neighbor class selection + solve + render, all five encodings × four screen sizes.
- `research/lyt/encodings/*.lyt` — the five §5 worked encodings, plus three isolated refusal-demonstration fragments.
- `research/lyt/tests/test_lyt.py` + `conftest.py` — pytest coverage (11 tests, all passing).

## What was NOT attempted

- No UI/visual rendering beyond ASCII — out of scope per the commission.
- No wiring back into the actual frontend codebase — this is a
  standalone research prototype, per the commission's own framing of the
  consult as "no application changes are made or proposed" and the
  umbrella's scope discipline (sessions scoped to a sub-project; this
  work stayed under `research/`, not `frontend/`).
- Alternate presence valuations (§6 line 640-641) — no worked encoding
  names one to solve, so only the default (all-present) valuation is
  implemented; see disclosed invention 28.
