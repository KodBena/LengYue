"""pytest coverage for the LYT relations-first amendment, dispatch B
(ledger rows 2396/2397/2400/2401). Governing spec:
`.claude/dispatch-reports/lyt-relations-amendment-spec.md` §2 (primitive
inventory) / §3 (grammar sketches).

Every primitive gets a WITNESSED resolution case and, where the census
names one, a REFUSED-AS-EXPECTED case (no matching facts entry, an
unexercised entry, an ambiguous match, a malformed expression). A
synthetic `relations.FactsTable` is installed via
`loader.reset_facts_table_cache` for the duration of each test that needs
one (an `autouse` fixture restores the real, lazily-loaded table
afterward) — none of these tests touch or depend on the real committed
`facts.generated.json`/`facts.residue.json` (a deliberate choice: this
dispatch's own primitives should be provably correct independent of
whatever facts dispatch A/C happen to have populated).

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from pathlib import Path

import pytest

import lyt_ast as ast
import loader
import parser as lytparser
import relations
from compiler import solve_lexicographic
from errors import LytLoadError, RelationsFirstDeprecationWarning


# ---------------------------------------------------------------------------
# Synthetic facts table
# ---------------------------------------------------------------------------


def _entry(
    key,
    *,
    axis=None,
    method,
    value_px,
    unexercised=False,
    has_error=False,
    component=None,
    state=None,
):
    widget_ids, parsed_method, variant = relations._split_key(key)
    assert parsed_method == method
    return relations.FactsEntry(
        key=key,
        widget_ids=widget_ids,
        method=method,
        variant=variant,
        component=component,
        state=state,
        axis=axis,
        value_px=value_px,
        unexercised=unexercised,
        has_error=has_error,
        source="generated",
    )


def _synthetic_facts_table() -> relations.FactsTable:
    entries = [
        _entry("sideRail|playwright-boundingBox", axis="h", method="playwright-boundingBox", value_px=168.0),
        _entry("metrics|playwright-boundingBox|s1", axis="v", method="playwright-boundingBox", value_px=30.0, state="s1 state"),
        _entry("metrics|playwright-boundingBox|s2", axis="v", method="playwright-boundingBox", value_px=45.0, state="s2 state"),
        _entry("board|domain-invariant", method="domain-invariant", value_px=1.0),
        _entry("libraryRow|pitch", method="pitch", value_px=32.0),
        _entry("engineControls|wrap-breakpoint", axis="h", method="wrap-breakpoint", value_px=185.0),
        _entry("subTab|text-width-of", method="text-width-of", value_px=77.0),
        _entry("treeFloor|read-constant", method="read-constant", value_px=140.0),
        # Deliberately unexercised (probe ran, selector absent) — matches
        # the real facts.generated.json's own `unexercised: true` shape.
        _entry("ghostWidget|playwright-boundingBox", axis="h", method="playwright-boundingBox", value_px=None, unexercised=True),
        # Deliberately has an `error` (matches resizerOuter+resizerInner's
        # own real shape: pattern-not-found).
        _entry("brokenConstant|read-constant", method="read-constant", value_px=None, has_error=True),
        # Deliberately AMBIGUOUS: two live entries for the same widget +
        # method + axis, no variant to disambiguate.
        _entry("ambiguousWidget|playwright-boundingBox|a", axis="h", method="playwright-boundingBox", value_px=10.0),
        _entry("ambiguousWidget|playwright-boundingBox|b", axis="h", method="playwright-boundingBox", value_px=20.0),
    ]
    theme_tokens = {"--space-tight": 4.0, "--space-medium": 12.0}
    return relations.FactsTable(entries, theme_tokens)


@pytest.fixture(autouse=True)
def _synthetic_facts():
    """Installs the synthetic facts table for every test in this module,
    restoring the real (lazy-loaded-from-disk) table afterward so no other
    test file in this suite is affected."""
    loader.reset_facts_table_cache(_synthetic_facts_table())
    yield
    loader.reset_facts_table_cache(None)


def _parse_extent(text: str):
    """Parses a bare extent/relation expression (e.g.
    'width-of(sideRail, default)') the same way `parser.parse_sizing`
    parses one inside a `{...}` block — a direct, minimal path to a
    `RawRelation`/`RawExtent` without round-tripping through a full `.lyt`
    fragment."""
    tokens = lytparser.tokenize(text)
    return lytparser.Parser(tokens).parse_extent()


def _resolve(text: str, *, where="test", ctx=None):
    if ctx is None:
        ctx = relations.RelationContext(facts=loader._get_facts_table())
    raw = _parse_extent(text)
    return loader._resolve_extent_like(raw, where=where, ctx=ctx)


# ---------------------------------------------------------------------------
# 1/2. width-of / height-of
# ---------------------------------------------------------------------------


def test_width_of_resolves_witnessed():
    ext = _resolve("width-of(sideRail, default)")
    assert ext.unit == "px"
    assert ext.v == 168.0


def test_height_of_resolves_witnessed():
    ext = _resolve("height-of(metrics, s1)")
    assert ext.unit == "px"
    assert ext.v == 30.0


def test_width_of_refuses_no_matching_entry():
    with pytest.raises(LytLoadError) as exc:
        _resolve("width-of(nonexistentWidget, whatever)")
    assert exc.value.detail["prohibition"] == "no-matching-facts-entry"
    assert exc.value.detail["law"] == "relation"


def test_width_of_refuses_unexercised_entry():
    """An entry that DOES exist but is `unexercised: true` is treated
    identically to an absent one — REFUSED-AS-EXPECTED, not a fallback."""
    with pytest.raises(LytLoadError) as exc:
        _resolve("width-of(ghostWidget)")
    assert exc.value.detail["prohibition"] == "no-matching-facts-entry"
    assert exc.value.detail["candidates_found"] == 1
    assert exc.value.detail["candidates_unexercised"] == 1


def test_read_constant_refuses_entry_with_error():
    with pytest.raises(LytLoadError) as exc:
        _resolve("read-constant(brokenConstant)")
    assert exc.value.detail["prohibition"] == "no-matching-facts-entry"


def test_width_of_refuses_ambiguous_match():
    with pytest.raises(LytLoadError) as exc:
        _resolve("width-of(ambiguousWidget)")
    assert exc.value.detail["prohibition"] == "ambiguous-facts-match"
    assert len(exc.value.detail["matches"]) == 2


def test_relation_without_context_refuses():
    """`_resolve_extent_like` called with `ctx=None` (the ordinary default
    for a caller outside the concrete-syntax loading path) refuses a
    relation expression outright rather than silently no-op'ing."""
    raw = _parse_extent("width-of(sideRail, default)")
    with pytest.raises(LytLoadError) as exc:
        loader._resolve_extent_like(raw, where="test", ctx=None)
    assert exc.value.detail["prohibition"] == "relation-without-context"


def test_unknown_relation_name_refuses():
    with pytest.raises(LytLoadError) as exc:
        _resolve("frobnicate-of(sideRail)")
    assert exc.value.detail["prohibition"] == "unknown-relation"


# ---------------------------------------------------------------------------
# 3/4/5/9. pitch-of / wrap-breakpoint / text-width-of / read-constant
# ---------------------------------------------------------------------------


def test_pitch_of_resolves_witnessed():
    assert _resolve("pitch-of(libraryRow)").v == 32.0


def test_wrap_breakpoint_resolves_witnessed():
    assert _resolve("wrap-breakpoint(engineControls)").v == 185.0


def test_text_width_of_resolves_witnessed():
    """Per ruling 2400(3): text-width-of resolves via the facts table like
    every other lookup primitive — it does NOT build a new live
    text-measurement subsystem, and PX_PER_CH stays untouched (see
    test_px_per_ch_is_unaffected below)."""
    assert _resolve("text-width-of(subTab)").v == 77.0


def test_read_constant_resolves_witnessed():
    assert _resolve("read-constant(treeFloor)").v == 140.0


def test_read_constant_theme_token_resolves():
    """Task 2: gap/spacing tokens resolve from theme.css SOURCE via
    read-constant(theme, <token>) — the same primitive, a special-cased
    source name, not a new one. Note the .lyt-facing spelling never
    carries the token's own leading '--': that spelling collides with
    this language's own '--' line-comment marker (`parser._strip_
    comments`), so the resolver adds the CSS-custom-property prefix
    internally (`relations._resolve_facts_relation`) — an author writes
    `space-tight`, never `--space-tight`."""
    ext = _resolve("read-constant(theme, space-tight)")
    assert ext.v == 4.0
    ext2 = _resolve("read-constant(theme, space-medium)")
    assert ext2.v == 12.0


def test_read_constant_theme_token_refuses_unknown_token():
    with pytest.raises(LytLoadError) as exc:
        _resolve("read-constant(theme, no-such-token)")
    assert exc.value.detail["prohibition"] == "no-matching-facts-entry"


def test_px_per_ch_is_unaffected():
    """Ruling 2400(3): `loader.PX_PER_CH` stays the compiler-internal `ch`
    resolver this wave — untouched by this dispatch."""
    assert loader.PX_PER_CH == 8.0


# ---------------------------------------------------------------------------
# 2. aspect-of (exercised directly against the resolution function — no
#    grammar wiring into the `aspect <number>` sizing key this wave, a
#    disclosed narrowing; see the dispatch report)
# ---------------------------------------------------------------------------


def test_aspect_of_resolves_witnessed():
    rel = _parse_extent("aspect-of(board)")
    ctx = relations.RelationContext(facts=loader._get_facts_table())
    ext = relations.resolve_relation(
        rel, where="test", ctx=ctx, resolve_extent_like=loader._resolve_extent_like
    )
    assert ext.v == 1.0


def test_aspect_of_refuses_no_matching_entry():
    rel = _parse_extent("aspect-of(nonexistent)")
    ctx = relations.RelationContext(facts=loader._get_facts_table())
    with pytest.raises(LytLoadError) as exc:
        relations.resolve_relation(
            rel, where="test", ctx=ctx, resolve_extent_like=loader._resolve_extent_like
        )
    assert exc.value.detail["prohibition"] == "no-matching-facts-entry"


# ---------------------------------------------------------------------------
# 6/7. max-over / sum-of combinators
# ---------------------------------------------------------------------------


def test_max_over_literal_operands():
    assert _resolve("max-over(4px, 12px, 6px)").v == 12.0


def test_max_over_facts_operands():
    assert _resolve("max-over(width-of(sideRail, default), 4px)").v == 168.0


def test_sum_of_literal_operands():
    assert _resolve("sum-of(4px, 12px, 6px)").v == 22.0


def test_sum_of_refuses_empty():
    with pytest.raises(LytLoadError) as exc:
        _resolve("sum-of()")
    assert exc.value.detail["prohibition"] == "empty-sum-of"


def test_max_over_refuses_empty():
    with pytest.raises(LytLoadError) as exc:
        _resolve("max-over()")
    assert exc.value.detail["prohibition"] == "empty-max-over"


def test_sum_of_gap_reference():
    ctx = relations.RelationContext(facts=loader._get_facts_table(), enclosing_gap_px=4.0)
    assert _resolve("sum-of(10px, gap)", ctx=ctx).v == 14.0


def test_sum_of_gap_reference_refuses_without_enclosing_gap():
    ctx = relations.RelationContext(facts=loader._get_facts_table(), enclosing_gap_px=None)
    with pytest.raises(LytLoadError) as exc:
        _resolve("sum-of(10px, gap)", ctx=ctx)
    assert exc.value.detail["prohibition"] == "no-enclosing-gap"


def test_sum_of_sibling_reference():
    sibling_sizing = ast.Sizing(
        min=ast.Extent(unit="px", v=90.0), pref=ast.Extent(unit="px", v=90.0), max=ast.Extent(unit="px", v=90.0)
    )
    ctx = relations.RelationContext(
        facts=loader._get_facts_table(),
        sibling_sizings={"treePanel": sibling_sizing},
        enclosing_gap_px=4.0,
    )
    assert _resolve("sum-of(treePanel.min, gap)", ctx=ctx).v == 94.0


def test_sibling_reference_refuses_forward_reference():
    ctx = relations.RelationContext(facts=loader._get_facts_table(), sibling_sizings={})
    with pytest.raises(LytLoadError) as exc:
        _resolve("sum-of(notYetLoaded.min)", ctx=ctx)
    assert exc.value.detail["prohibition"] == "forward-sibling-reference"


def test_max_over_children_min():
    child_a = ast.Sizing(min=ast.Extent(unit="px", v=40.0), pref=ast.Extent(unit="fr", v=1), max="inf")
    child_b = ast.Sizing(min=ast.Extent(unit="px", v=55.0), pref=ast.Extent(unit="fr", v=1), max="inf")
    ctx = relations.RelationContext(facts=loader._get_facts_table(), children_sizings=[child_a, child_b])
    assert _resolve("max-over(children.min)", ctx=ctx).v == 55.0


def test_max_over_children_min_refuses_outside_exclusive():
    ctx = relations.RelationContext(facts=loader._get_facts_table(), children_sizings=None)
    with pytest.raises(LytLoadError) as exc:
        _resolve("max-over(children.min)", ctx=ctx)
    assert exc.value.detail["prohibition"] == "children-ref-outside-exclusive"


def test_children_ref_refuses_inside_sum_of():
    ctx = relations.RelationContext(facts=loader._get_facts_table(), children_sizings=[])
    with pytest.raises(LytLoadError) as exc:
        _resolve("sum-of(children.min, 4px)", ctx=ctx)
    assert exc.value.detail["prohibition"] == "children-ref-outside-max-over"


def test_nested_relation_composition():
    """Mirrors the governing spec's own §3(b) worked fragment:
    sum-of(max-over(children.min), tree.min, gap)."""
    child_a = ast.Sizing(min=ast.Extent(unit="px", v=664.0), pref=ast.Extent(unit="px", v=664.0), max=ast.Extent(unit="px", v=664.0))
    tree_sizing = ast.Sizing(min=ast.Extent(unit="px", v=110.0), pref=ast.Extent(unit="fr", v=1), max="inf")
    ctx = relations.RelationContext(
        facts=loader._get_facts_table(),
        sibling_sizings={"tree": tree_sizing},
        children_sizings=[child_a],
        enclosing_gap_px=4.0,
    )
    ext = _resolve("sum-of(max-over(children.min), tree.min, gap)", ctx=ctx)
    assert ext.v == 664.0 + 110.0 + 4.0


# ---------------------------------------------------------------------------
# 8. pack-rows
# ---------------------------------------------------------------------------


def test_pack_rows_matches_flow_py_directly():
    import flow

    widths = [113.0, 177.0, 153.0, 153.0, 137.0, 105.0]
    expected = flow.narrowest_width_for_row_count(widths, target_rows=2, search_ceiling=838.0)
    ext = _resolve(
        "pack-rows(items: [113px, 177px, 153px, 153px, 137px, 105px], "
        "target-rows: 2, search-ceiling: 838px)"
    )
    assert ext.v == expected


def test_pack_rows_requires_target_rows():
    with pytest.raises(LytLoadError) as exc:
        _resolve("pack-rows(items: [10px, 20px])")
    assert exc.value.detail["prohibition"] == "missing-target-rows"


def test_pack_rows_refuses_unreachable_target():
    with pytest.raises(LytLoadError) as exc:
        _resolve("pack-rows(items: [500px, 500px, 500px], target-rows: 1, search-ceiling: 500px)")
    assert exc.value.detail["prohibition"] == "pack-rows-unreachable"


def test_pack_rows_items_may_be_relations():
    ext = _resolve(
        "pack-rows(items: [width-of(sideRail, default), 50px], target-rows: 1)"
    )
    # single row -> width_floor is the sum of both items
    assert ext.v == 168.0 + 50.0


# ---------------------------------------------------------------------------
# Reachability against the REAL committed facts files (review §5 fix)
# ---------------------------------------------------------------------------


def _relation_text_for(entry, primitive: str) -> str:
    widget = entry.widget_ids[0]
    args = widget + (f", {entry.variant}" if entry.variant else "")
    return f"{primitive}({args})"


def _primitive_for(entry) -> "str | None":
    """Picks a primitive whose own `method` mapping matches this entry
    AND, where the primitive's name implies an axis (`width-of` ->
    `h`, `height-of` -> `v`), whose axis agrees — `width-of`/`height-of`
    share ONE method (`playwright-boundingBox`), so picking the first
    name that merely matches the method (dict iteration order) would
    silently try to resolve a HEIGHT entry as a WIDTH and fail for a
    reason that has nothing to do with real reachability."""
    candidates = [name for name, m in relations._PRIMITIVE_METHOD.items() if m == entry.method]
    for name in candidates:
        prim_axis = relations._PRIMITIVE_AXIS.get(name)
        if prim_axis is None or entry.axis is None or prim_axis == entry.axis:
            return name
    return candidates[0] if candidates else None


def test_every_real_facts_entry_method_is_mapped_to_some_primitive():
    """Table-driven regression guard (review §5's own required fix): for
    EVERY entry in the real, committed `facts.generated.json` +
    `facts.residue.json`, its `method` field must be a value some
    primitive's own `relations._PRIMITIVE_METHOD` mapping reaches — a
    method string no primitive maps to is exactly the defect this review
    found (facts.residue.json's derived `method` was the empty string,
    matching nothing, so all 19 entries were silently unreachable via
    every one of the nine primitives despite `relations.py`'s own
    docstring claiming residue entries are 'just as authoritative' as
    measured ones). A future facts entry that mints a method nothing
    resolves now fails HERE, at build time, not by a future review."""
    real_table = relations.FactsTable.load()
    reachable_methods = set(relations._PRIMITIVE_METHOD.values())
    unreachable = sorted(
        {e.key for e in real_table.entries if e.method not in reachable_methods}
    )
    assert not unreachable, f"facts entries whose method matches no primitive: {unreachable}"


def test_every_real_facts_entry_resolves_or_is_disclosed_unusable():
    """The fuller, live check: actually construct `<primitive>(widget[,
    variant])` relation text for every real entry (using its own
    `widget_ids[0]`/`variant` FIELDS, never the raw `key` string — the
    same discipline this module's own resolution functions follow) and
    resolve it through the real loader/relations pipeline, installed as
    the process-wide facts table (not the synthetic fixture this file's
    `autouse` fixture installs for every other test in this module).

    An entry with a genuine value (`not unexercised and not has_error`)
    MUST resolve successfully — this is the review's own §5 finding,
    made permanent as a regression test. An entry that is honestly
    `unexercised`/carries an `error` is expected to REFUSE
    (`no-matching-facts-entry`) rather than resolve — a probe that was
    genuinely run and came back empty is not the same defect as an
    entry that was never reachable in the first place, and this test
    tells the two apart rather than conflating them."""
    real_table = relations.FactsTable.load()
    loader.reset_facts_table_cache(real_table)
    try:
        broken = []
        for entry in real_table.entries:
            primitive = _primitive_for(entry)
            if primitive is None:
                broken.append((entry.key, "no primitive maps to this method"))
                continue
            text = _relation_text_for(entry, primitive)
            has_usable_value = (
                not entry.unexercised and not entry.has_error and entry.value_px is not None
            )
            try:
                ext = _resolve(text)
                if not has_usable_value:
                    broken.append((entry.key, f"resolved to {ext.v!r} but should have refused"))
                elif ext.v != float(entry.value_px):
                    broken.append((entry.key, f"resolved to {ext.v!r}, expected {entry.value_px!r}"))
            except LytLoadError as exc:
                if has_usable_value:
                    broken.append((entry.key, f"refused ({exc.detail.get('prohibition')}) but should have resolved"))
                # else: correctly refused (unexercised/error entry) — fine.
        assert not broken, f"facts entries with mismatched reachability: {broken}"
    finally:
        loader.reset_facts_table_cache(_synthetic_facts_table())


# ---------------------------------------------------------------------------
# Backward compat / deprecation channel (task 4)
# ---------------------------------------------------------------------------


def test_literal_px_still_parses_and_loads_with_deprecation_warning():
    ctx = relations.RelationContext(facts=loader._get_facts_table())
    with pytest.warns(Warning) as record:
        ext = _resolve("28px", ctx=ctx)
    assert ext.v == 28.0
    assert any("RELATIONS-FIRST" in str(w.message) for w in record)
    assert ctx.deprecated_literals == [{"where": "test", "unit": "px", "v": 28.0}]


def test_literal_extent_with_no_ctx_emits_no_warning():
    """The diagnostic is scoped to the relations-aware loading path — a
    direct call with `ctx=None` (a caller outside `load_layouts`, e.g. a
    pre-existing unit test in test_lyt.py) sees no warning at all."""
    import warnings

    with warnings.catch_warnings():
        warnings.simplefilter("error")
        ext = loader._resolve_extent_like(_parse_extent("28px"), where="test", ctx=None)
    assert ext.v == 28.0


# ---------------------------------------------------------------------------
# Dispatch C4 — the refusal-default flip (ledger rows
# 2396/2397/2400/2419/2425/2436/2445). `refuse_literal_bounds` on
# `RelationContext`/`load_slot`/`load_layouts` turns a px/ch literal's
# deprecation warning into a structured `LytLoadError`, scoped to px/ch
# only (never fr/inf — see `relations.RelationContext.refuse_literal_
# bounds`'s own docstring for why) and, at the file level, scoped to
# `encodings/` only (`runner.is_governed_encoding`/`load_governed_
# layouts` — never fixtures/, per row 2426: "transcriptions are
# measurements ... they stay loadable").
# ---------------------------------------------------------------------------

STRICT_SYNTHETIC_ENCODING = """
layout strict-synthetic =
  {min 0px, pref 1fr, max inf} H(
    {28px} sideRail[common, action],
    {pref 1fr} board[board]
  )
"""


def test_strict_mode_refuses_px_literal_naming_where_and_unit():
    """The core C4 refusal shape: a px literal bound resolved under
    `refuse_literal_bounds=True` raises `LytLoadError`
    (`prohibition == "px-literal-in-governed-encoding"`) naming the
    exact site (`where`), the literal's own unit/value, and — when the
    caller supplies one — the source file, instead of merely warning."""
    with pytest.raises(LytLoadError) as exc:
        loader.load_layouts(
            STRICT_SYNTHETIC_ENCODING,
            refuse_literal_bounds=True,
            source_file="encodings/strict-synthetic.lyt",
        )
    detail = exc.value.detail
    assert detail["prohibition"] == "px-literal-in-governed-encoding"
    assert detail["law"] == "relations-first"
    assert detail["unit"] == "px"
    assert detail["v"] == 28.0
    assert detail["source_file"] == "encodings/strict-synthetic.lyt"
    assert "strict-synthetic" in detail["where"]


def test_strict_mode_off_by_default_stays_warning_only():
    """`refuse_literal_bounds` defaults to `False` — byte-identical to
    every pre-C4 `load_layouts` call. The same snippet that refuses
    above merely warns here, matching `test_literal_px_still_parses_
    and_loads_with_deprecation_warning`'s own established behavior."""
    with pytest.warns(RelationsFirstDeprecationWarning):
        layouts = loader.load_layouts(STRICT_SYNTHETIC_ENCODING)
    assert "strict-synthetic" in layouts


def test_strict_mode_does_not_refuse_fr_or_inf_literals():
    """Structural fr/inf sizing keywords have no relations-first analog
    to convert to (dispatch C3's own empirical finding, ~60 of the two
    real encodings' own 119 residual deprecation warnings are exactly
    this kind) — strict mode leaves them as warnings, never refusals,
    even though the SAME warning channel fires for them. Uses a snippet
    with NO px/ch literal at all (unlike `STRICT_SYNTHETIC_ENCODING`,
    which carries one and would raise before ever reaching a fr/inf
    site) so this test genuinely isolates the fr/inf-is-unaffected
    claim. `min` is left UNDECLARED — an omitted `min` defaults to a
    hardcoded `0px` (`loader._load_sizing`'s own "disclosed general
    completion rule") that never passes through `_resolve_extent_like`
    at all, so it emits no warning and would not contaminate this test
    the way an explicit `min 0px` term would."""
    text = """
layout strict-fr-only =
  {pref 1fr, max inf} board[board]
"""
    with pytest.warns(RelationsFirstDeprecationWarning):
        layouts = loader.load_layouts(text, refuse_literal_bounds=True)
    assert "strict-fr-only" in layouts


def test_strict_mode_carries_forward_into_child_and_descendant_contexts():
    """A single root-level `refuse_literal_bounds=True` must reach a
    px literal several levels deep — inside a Split's child AND inside
    a T (Exclusive) node's own child — not just the root slot's own
    sizing. Regression guard for the Split/Exclusive branches' own
    child_relctx/own_relctx propagation (loader.py `load_slot`)."""
    text = """
layout strict-nested =
  {min 0px, pref 1fr, max inf} H(
    {pref 1fr} V(
      {24px} deepLeaf[board, info]
    ),
    {pinned max-over(children.min)} T(
      {min 40px, pref 1fr, max inf} panelA[common],
      {min 55px, pref 1fr, max inf} panelB[common]
    )
  )
"""
    with pytest.raises(LytLoadError) as exc:
        loader.load_layouts(text, refuse_literal_bounds=True)
    assert exc.value.detail["prohibition"] == "px-literal-in-governed-encoding"
    assert "deepLeaf" in exc.value.detail["where"]


def test_load_slot_direct_call_honors_refuse_literal_bounds():
    """`load_slot` itself (not only `load_layouts`) accepts
    `refuse_literal_bounds`/`source_file` and seeds a fresh root context
    from them when no explicit `relctx` is supplied — the same
    "byte-identical when omitted" contract every other `load_slot`
    parameter this codebase adds already keeps."""
    tokens = lytparser.tokenize("{28px} leaf[common, action]")
    rs = lytparser.Parser(tokens).parse_slot()
    with pytest.raises(LytLoadError) as exc:
        loader.load_slot(rs, refuse_literal_bounds=True, source_file="x.lyt")
    assert exc.value.detail["prohibition"] == "px-literal-in-governed-encoding"
    assert exc.value.detail["source_file"] == "x.lyt"


# ---------------------------------------------------------------------------
# Directory scoping (`runner.is_governed_encoding` / `load_governed_layouts`)
# ---------------------------------------------------------------------------


def test_is_governed_encoding_true_for_encodings_dir():
    import runner

    p = runner.resolve_encoding_file("lengyue_landscape.lyt")
    assert p.parent == runner.ENCODINGS_DIR
    assert runner.is_governed_encoding(p) is True


def test_is_governed_encoding_false_for_fixtures_reference():
    import runner

    p = runner.resolve_encoding_file("q5go.lyt")
    assert p.parent == runner.FIXTURES_REFERENCE_DIR
    assert runner.is_governed_encoding(p) is False


def test_is_governed_encoding_false_for_fixtures_transcription():
    import runner

    p = runner.resolve_encoding_file("current_row_asis.lyt")
    assert p.parent == runner.FIXTURES_TRANSCRIPTION_DIR
    assert runner.is_governed_encoding(p) is False


def test_load_governed_layouts_refuses_on_a_real_encodings_file():
    """The real, committed `lengyue_landscape.lyt` still carries
    unconverted px/ch literals (dispatch C3's own disclosed residual —
    ~59 of 119, genuinely unreachable against the committed facts files
    this wave) — `load_governed_layouts` routes it through strict mode
    (directory-scoped, not hand-picked), so loading it this way is
    EXPECTED to refuse, at the first literal the loader's own recursive
    descent reaches. This test pins that expectation rather than
    leaving it an unverified claim in a docstring."""
    import runner

    with pytest.raises(LytLoadError) as exc:
        runner.load_governed_layouts("lengyue_landscape.lyt")
    assert exc.value.detail["prohibition"] == "px-literal-in-governed-encoding"
    assert exc.value.detail["source_file"] == "encodings/lengyue_landscape.lyt"


def test_load_governed_layouts_does_not_refuse_a_fixtures_file():
    """The directory-scoping half of the same mechanism: a file that
    resolves OUTSIDE `encodings/` never enters strict mode, regardless
    of how many literal bounds it carries — proven against a REAL
    fixture (`current_row_asis.lyt`, `fixtures/transcription/`), not a
    synthetic stand-in, so the directory check is exercised against the
    actual on-disk layout this dispatch inherited."""
    import runner
    from baseline import BASELINE_WAIVERS

    layouts = runner.load_governed_layouts(
        "current_row_asis.lyt", waivers=BASELINE_WAIVERS
    )
    assert "current-row-asis" in layouts


# ---------------------------------------------------------------------------
# `pinned` sizing key
# ---------------------------------------------------------------------------


def test_pinned_key_resolves_like_fixed_shorthand():
    tokens = lytparser.tokenize("{pinned max-over(4px, 9px)}")
    rs = lytparser.Parser(tokens).parse_sizing()
    ctx = relations.RelationContext(facts=loader._get_facts_table())
    sizing = loader._load_sizing(rs, where="test", node_kind="leaf", relctx=ctx)
    assert sizing.min.v == sizing.pref.v == sizing.max.v == 9.0


def test_fixed_and_pinned_together_is_refused():
    tokens = lytparser.tokenize("{4px, pinned 9px}")
    # `4px` parses into rs.fixed via the bare-shorthand path even mid-bag
    # (see parser.py's own `parse_sizing` docstring on this quirk); the
    # loader refuses the resulting BOTH-declared shape rather than one
    # silently winning.
    rs = lytparser.Parser(tokens).parse_sizing()
    ctx = relations.RelationContext(facts=loader._get_facts_table())
    with pytest.raises(LytLoadError) as exc:
        loader._load_sizing(rs, where="test", node_kind="leaf", relctx=ctx)
    assert exc.value.detail["prohibition"] == "fixed-and-pinned"


# ---------------------------------------------------------------------------
# L3 envelope repair (task 3, ruling 2400(4))
# ---------------------------------------------------------------------------


def test_envelope_derives_from_facts_and_matches_pref():
    text = """
layout envelope-test =
  {pref max-over(height-of(metrics, s1), height-of(metrics, s2)), envelope: {s1: height-of(metrics, s1), s2: height-of(metrics, s2)}} metrics[common, info]
"""
    layouts = loader.load_layouts(text)
    slot = layouts["envelope-test"]
    assert slot.sizing.basis == "envelope"
    assert slot.sizing.pref.v == 45.0
    assert slot.sizing.envelope_state_extents["s1"].v == 30.0
    assert slot.sizing.envelope_state_extents["s2"].v == 45.0


def test_envelope_refuses_when_declared_state_has_no_facts_entry():
    text = """
layout envelope-missing-test =
  {pref height-of(metrics, s1), envelope: {s1: height-of(metrics, s1), nope: height-of(metrics, nonexistent_state)}} metrics[common, info]
"""
    with pytest.raises(LytLoadError) as exc:
        loader.load_layouts(text)
    assert exc.value.detail["prohibition"] == "no-matching-facts-entry"


def test_legacy_bare_envelope_still_loads_unchanged():
    """Task 4 (backward compat): the pre-existing bare-name envelope
    spelling — no per-state extents at all — is UNCHANGED and does not
    require any facts entry; both mainline encodings still carry it."""
    text = """
layout legacy-envelope-test =
  {28px, envelope: {disconnected, connected}} metrics[common, info]
"""
    layouts = loader.load_layouts(text)
    slot = layouts["legacy-envelope-test"]
    assert slot.sizing.basis == "envelope"
    assert slot.sizing.pref.v == 28.0
    assert slot.sizing.envelope_state_extents is None


# ---------------------------------------------------------------------------
# End-to-end: a small synthetic encoding written relations-first, loaded
# and solved via CP-SAT (task 5's own required minimum).
# ---------------------------------------------------------------------------

SYNTHETIC_RELATIONS_FIRST_ENCODING = """
layout synthetic-relations =
  {min 0px, pref 1fr, max inf} H(
    {pinned width-of(sideRail, default)} sideRail[common, action],
    {pref 1fr} V(
      {min 24px, pref 24px, max 24px} boardInfo[board, info],
      {pref maximize, aspect 1} board[board]
    ),
    {pinned sum-of(90px, 55px, 4px)} V(
      {pref max-over(height-of(metrics, s1), height-of(metrics, s2)), envelope: {s1: height-of(metrics, s1), s2: height-of(metrics, s2)}} metrics[common, info],
      {pref 1fr, gap 4px} H(
        {min 90px, pref 90px, max 90px} treePanel[board, info+action],
        @demote(h sum-of(max-over(children.min), treePanel.min, gap)) {pinned max-over(children.min)} T(
          {min 40px, pref 1fr, max inf} panelA[common],
          {min 55px, pref 1fr, max inf} panelB[common]
        )[PANELS]
      )
    )
  )
"""


def test_synthetic_relations_first_encoding_loads_and_resolves():
    layouts = loader.load_layouts(SYNTHETIC_RELATIONS_FIRST_ENCODING)
    root = layouts["synthetic-relations"]
    h = root.node
    assert isinstance(h, ast.Split) and h.axis == "h"
    side_rail_slot = h.children[0]
    assert side_rail_slot.sizing.min.v == side_rail_slot.sizing.pref.v == side_rail_slot.sizing.max.v == 168.0

    side_column = h.children[2].node
    assert h.children[2].sizing.min.v == h.children[2].sizing.pref.v == h.children[2].sizing.max.v == 149.0
    metrics_slot = side_column.children[0]
    assert metrics_slot.sizing.pref.v == 45.0
    assert metrics_slot.sizing.envelope_state_extents["s2"].v == 45.0

    inner_h = side_column.children[1].node
    tree_slot, t_slot = inner_h.children
    assert tree_slot.sizing.min.v == 90.0
    # T's own pinned floor: max-over(children.min) = max(40, 55) = 55.
    assert t_slot.sizing.min.v == t_slot.sizing.pref.v == t_slot.sizing.max.v == 55.0
    # T's @demote threshold: sum-of(max-over(children.min)=55, tree.min=90, gap=4) = 149.
    assert t_slot.presence.kind == "demote"
    assert t_slot.presence.demote_axis == "h"
    assert t_slot.presence.demote_below_px == 55.0 + 90.0 + 4.0


def test_synthetic_relations_first_encoding_solves_end_to_end():
    """Task 5's own required minimum: at least one end-to-end CP-SAT solve
    of a small synthetic encoding written relations-first."""
    layouts = loader.load_layouts(SYNTHETIC_RELATIONS_FIRST_ENCODING)
    slot = layouts["synthetic-relations"]
    result = solve_lexicographic(
        slot,
        class_id="test",
        w_px=1920,
        h_px=1080,
        board_widget="board",
        reach_preferred_widgets=["sideRail", "metrics"],
        time_limit_s=30,
    )
    assert result.status in ("OPTIMAL", "FEASIBLE")
    board_path = [p for p, w in result.leaf_names.items() if w == "board"][0]
    board_rect = result.rects[board_path]
    assert board_rect.w == board_rect.h
    assert board_rect.w > 0
    root_rect = result.rects["root"]
    assert root_rect.w == 1920
    assert root_rect.h == 1080
    for rect in result.rects.values():
        assert rect.x >= 0 and rect.y >= 0 and rect.w >= 0 and rect.h >= 0


def test_synthetic_relations_first_encoding_emits_deprecation_for_its_literals():
    """The tree above still carries several literal px bounds (boardInfo's
    24px, treePanel's 90px, panelA/panelB's mins) — every one of them
    should emit the deprecation diagnostic (task 4), proving the channel
    is live on an ordinary `load_layouts` call, not just in isolation."""
    with pytest.warns(Warning) as record:
        loader.load_layouts(SYNTHETIC_RELATIONS_FIRST_ENCODING)
    messages = [str(w.message) for w in record]
    assert any("RELATIONS-FIRST" in m for m in messages)
    assert len(messages) >= 4
