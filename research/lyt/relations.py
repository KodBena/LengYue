"""research/lyt/relations.py

LYT relations-first amendment, dispatch B (ledger rows 2396/2397/2400/2401).
Governing spec: `.claude/dispatch-reports/lyt-relations-amendment-spec.md`
§2 (primitive inventory), §3 (grammar sketches), §4 (probe contract).
Dispatch A's review (`lyt-relations-a-review.md`) finding on the facts-key
shape is the load-bearing fact this module is built against: `component`/
`state`/`axis` are carried as FIELDS on a facts entry, not folded into its
`"key"` string, and every resolution function in this module reads those
FIELDS, never a raw key string.

[Corrected 2026-08-13, fresh-context review (`lyt-relations-b-review.md`
§5): this docstring originally went one step further and claimed a
facts-file entry's `"key"` is UNIVERSALLY shaped
`{widget-id}[+widget-id...]|{method}[|variant]`, parsed once centrally
by `_split_key`. That shape is `facts.generated.json`'s OWN convention
(dispatch A's), not a fact about facts files in general — applying it
unconditionally is exactly what left every one of `facts.residue.json`'s
19 real entries unreachable (bare descriptive keys, no `"|"`, no
`method` field) despite this module's own "just as authoritative" claim
for residue entries. `FactsTable.load` now binds `widget_ids`/`method`/
`variant` from entry FIELDS FIRST (`raw.get(...)`, per the review's own
extension of "bind to the fields" to identity resolution, not only to
interpretation) and falls back to `_split_key`'s key-string convention
only for an entry that supplies none of the three — `_split_key` is a
fallback parser for one facts source's own key convention now, not the
general story. `facts.residue.json` itself was updated in the same
change to carry those fields explicitly.]

WHAT THIS MODULE OWNS. `parser.py` accepts relation-expression syntax
permissively (any `IDENT(...)` call, regardless of name) — this module is
where the closed nine-primitive vocabulary, argument shapes, and the actual
RESOLUTION against the generated facts tables live, matching the "parser
permissive, loader refuses" division of labor this whole codebase already
uses for the sentinel value `WRAPPER_MIN`, the bare `envelope` keyword,
`gap`'s px-only rule, and every Amendment-7/8/9 sizing key. `loader.py`
imports this module and threads its own `_resolve_extent_like` function in
as a callback (dependency injection, not a circular import: this module
resolves `sum-of`/`pack-rows`/`max-over` OPERANDS that may themselves be
plain extent literals, which is `loader.py`'s own resolution logic, not
duplicated here).

THE NINE PRIMITIVES (governing spec §2), and how each resolves:

  1. `width-of(widget, state?)` / `height-of(widget, state?)` — a facts-
     table lookup keyed on widget id + axis (`h`/`v` respectively) +
     `method == "playwright-boundingBox"`, optionally narrowed by a
     `state` argument matched against the entry's own `variant` or `state`
     text. Refuses loudly (no coercion, no default) when no entry matches,
     when every matching entry is `unexercised`, or when more than one
     entry matches ambiguously.
  2. `aspect-of(widget)` — the same lookup, `method == "domain-invariant"`,
     axis-agnostic; the matched entry's `value_px` is read as a bare
     dimensionless ratio (a disclosed, documented field reuse — no such
     entries exist in the committed `facts.generated.json` as of this
     dispatch, so every real use refuses until dispatch C's probe harness
     grows a domain-invariant entry; exercised here only against this
     dispatch's own synthetic test fixtures).
  3. `pitch-of(widget, state?)` — `method == "pitch"`, axis-agnostic
     lookup, same shape as (1).
  4. `wrap-breakpoint(widget, state?)` — `method ==
     "wrap-breakpoint"`, axis defaulted to `h` (every census row using
     this primitive is a column-width breakpoint).
  5. `text-width-of(widget, state?)` — `method == "text-width-of"`. Per
     ruling 2400(3), `loader.PX_PER_CH` stays the compiler-internal `ch`
     resolver THIS WAVE — this primitive does NOT build a new live
     text-measurement subsystem; it is a facts-table lookup exactly like
     (1)/(3)/(4), so it "enters the grammar" (parses, is a recognized
     primitive with real resolution semantics) without touching `ch`/
     `PX_PER_CH` at all. A future wave that wants a genuine live text
     probe replaces the underlying facts entries' own generation, not
     this resolution function.
  6. `max-over(operand, operand, ...)` — a closed combinator. Two shapes:
     (a) the single-operand form `max-over(children.min)` /
     `max-over(children.max)`, legal ONLY as an Exclusive (T) node's own
     `min`/`pref`/`max`/`pinned` value, resolved from that T node's own
     already-loaded children's sizing (structural, no facts lookup at
     all — governing spec §3(b)'s T-floor-derivation worked fragment);
     (b) the general form, one or more operands each independently
     resolved to a px value (a literal, a nested relation, or a
     `widget.min`/`widget.pref`/`widget.max`/`gap` reference into the
     ENCLOSING split's own already-loaded siblings), combined by `max`.
  7. `sum-of(operand, operand, ..., gap?)` — the general-form combinator
     from (6)(b), combined by `+` instead of `max`.
  8. `pack-rows(items: [...], target-rows: N)` — wires `flow.py`'s own
     `narrowest_width_for_row_count` for real: `items` is a bracketed list
     of extent-like operands (each independently resolved to px, the same
     resolution (6)(b)'s operands use), `target-rows` is the row-count
     design decision (an author-chosen parameter, never derivable — see
     the governing spec §3(c)'s own "genuinely irreducible design
     decision" framing). Kept as a named primitive per ruling 2400(7).
  9. `read-constant(source, symbol)` — the same facts-table lookup shape
     as (1)/(3)/(4)/(5), `method == "read-constant"`, EXCEPT for one
     special-cased source: `read-constant(theme, <token>)` (per task 2's
     own instruction) resolves against a small, separately-loaded THEME
     TOKEN table — `frontend/src/assets/css/theme.css`'s own CSS custom
     properties (`--space-tight: 4px;` etc.), parsed once at
     `FactsTable.load` time — rather than against `facts.generated.json`,
     since a theme token is not tied to any one widget's own probed state
     the way every other `read-constant` use in the census is.

REFUSAL DISCIPLINE (ADR-0002). Every resolution function below raises
`errors.LytLoadError` with a structured `detail` dict — `law: "relation"`,
a `prohibition` token, and enough context (`relation`, `subject`, `where`)
for a caller to assert on WHY a relation failed to resolve, never a bare
string. No relation silently falls back to a guessed number, an average, or
a stale cached value; a facts entry that IS present but `unexercised` is
treated identically to one that is entirely ABSENT (the probe genuinely
could not measure the value; using it anyway would fabricate provenance no
different from typing a literal by hand — exactly what this amendment
exists to retire).

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

import parser as lytparser
from errors import LytLoadError

_HERE = Path(__file__).resolve().parent
DEFAULT_FACTS_GENERATED_PATH = _HERE / "facts.generated.json"
DEFAULT_FACTS_RESIDUE_PATH = _HERE / "facts.residue.json"
# research/lyt -> research -> <umbrella root> -> frontend/...
DEFAULT_THEME_CSS_PATH = (
    _HERE.parent.parent / "frontend" / "src" / "assets" / "css" / "theme.css"
)

# The nine ratified primitives (governing spec §2). Closed vocabulary —
# an unrecognized relation name is refused loudly, never silently ignored
# or guessed at (same "closed vocabulary, refused loudly" posture every
# other sizing-bag key in this language already takes).
FACTS_LOOKUP_RELATIONS = {
    "width-of", "height-of", "aspect-of", "pitch-of", "wrap-breakpoint",
    "text-width-of", "read-constant",
}
COMBINATOR_RELATIONS = {"max-over", "sum-of", "pack-rows"}
RELATION_NAMES = FACTS_LOOKUP_RELATIONS | COMBINATOR_RELATIONS

# Which facts-entry `method` value each facts-lookup primitive matches,
# and which `axis` (when the primitive's own name implies one). A
# primitive whose axis is not implied by its name (aspect-of, pitch-of,
# read-constant) matches any axis, refusing loudly on ambiguity rather
# than guessing which of two axis-differentiated entries was meant.
_PRIMITIVE_METHOD = {
    "width-of": "playwright-boundingBox",
    "height-of": "playwright-boundingBox",
    "aspect-of": "domain-invariant",
    "pitch-of": "pitch",
    "wrap-breakpoint": "wrap-breakpoint",
    "text-width-of": "text-width-of",
    "read-constant": "read-constant",
}
_PRIMITIVE_AXIS = {"width-of": "h", "height-of": "v"}

_THEME_SOURCE_NAMES = {
    "theme", "theme.css", "frontend/src/assets/css/theme.css",
}
_THEME_TOKEN_RE = re.compile(r"(--[A-Za-z0-9_-]+)\s*:\s*([0-9.]+)px")


@dataclass(frozen=True)
class FactsEntry:
    key: str
    widget_ids: Tuple[str, ...]
    method: str
    variant: Optional[str]
    component: Optional[str]
    state: Optional[str]
    axis: Optional[str]
    value_px: Optional[float]
    unexercised: bool
    has_error: bool
    source: str  # "generated" | "residue"


def _split_key(key: str) -> Tuple[Tuple[str, ...], str, Optional[str]]:
    """Splits a facts-file `"key"` into `(widget_ids, method, variant)`,
    per dispatch A's OWN convention for `facts.generated.json`
    (`{widget}[+widget...]|{method}[|variant]`) — used ONLY as a
    fallback, in `FactsTable.load` below, when an entry carries no
    `widget_ids`/`method`/`variant` FIELDS of its own. This is not the
    general parsing story any more; it is one facts source's own
    convention, applied when nothing more direct is available.

    [Corrected 2026-08-13, fresh-context review (`lyt-relations-b-
    review.md` §5): the first cut of this module called this function
    UNCONDITIONALLY, for every entry in every facts source, deriving
    `method` (and `widget_ids`/`variant`) from the key STRING even where
    `facts.generated.json`'s own entries already carry a `"method"` field
    directly — a real, if usually harmless, duplication of already-
    present data (the review's own minor finding 1). Worse,
    `facts.residue.json`'s 19 real entries do NOT follow this
    convention at all (bare descriptive names, no `"|"`, no per-entry
    `"method"` field, several comma-joined multi-widget strings) — every
    one of them silently failed to resolve via ANY primitive, directly
    contradicting this module's own "residue entries are just as
    authoritative" docstring claim, and dispatch B's own 44 tests never
    caught it because all of them used a synthetic, pipe-keyed table.
    `FactsTable.load` now reads `widget_ids`/`method`/`variant` from
    entry FIELDS first (per dispatch A review's own "bind to the fields,
    never parse the key string" instruction, applied here to identity
    resolution too, not just to the interpretation of an already-parsed
    entry); this function is the fallback for a facts source (still, in
    practice, only `facts.generated.json`) that hasn't been given
    explicit fields of its own. `facts.residue.json` was updated in the
    same change to carry explicit `widget_ids`/`method` (and `variant`
    where landscape/portrait disambiguation is needed) — see that file's
    own `_comment` header for the added-field disclosure.]"""
    parts = key.split("|")
    widget_ids = tuple(parts[0].split("+"))
    method = parts[1] if len(parts) > 1 else ""
    variant = parts[2] if len(parts) > 2 else None
    return widget_ids, method, variant


def _load_theme_tokens(path: Path) -> Dict[str, float]:
    """Task 2's own instruction: gap tokens resolve from
    `frontend/src/assets/css/theme.css` SOURCE, "the way the encodings'
    current TOK census rows describe" — a plain regex extraction of every
    `--custom-property: Npx;` declaration, parsed once at `FactsTable.load`
    time. Returns `{}` (never raises) when the file is absent — a missing
    theme.css is reported at RESOLUTION time, when a `read-constant(theme,
    ...)` call actually needs a token and finds none, not at table-load
    time (the same "the absence of a fact is not itself a load-time
    failure" posture the rest of this table takes for missing
    facts.generated.json/facts.residue.json entries)."""
    if not path.exists():
        return {}
    text = path.read_text()
    return {name: float(v) for name, v in _THEME_TOKEN_RE.findall(text)}


class FactsTable:
    """The resolved facts substrate a `.lyt` load resolves relations
    against: every entry from `facts.generated.json` + `facts.residue.json`
    (concatenated — a residue entry is just as authoritative a source of a
    px number as a measured one, per the governing spec's own RES/REL
    classification; `source` records which so a caller can tell them
    apart), plus the theme-token table.

    [Corrected 2026-08-13, fresh-context review (`lyt-relations-b-
    review.md` §5): the "just as authoritative" claim above did not
    hold until this fix — `facts.residue.json`'s own 19 entries carried
    no `method` field and a key shape `_split_key` couldn't parse into a
    usable identity, so every one of them was silently unreachable via
    any primitive despite this exact docstring's own claim otherwise.
    `FactsTable.load` (below) now binds `widget_ids`/`method`/`variant`
    from entry FIELDS first, falling back to `_split_key`'s
    key-string convention only where a field is absent — and
    `facts.residue.json` itself now carries those fields explicitly (see
    that file's own `_comment` header). The reachability claim above is
    now backed by a test (`tests/test_relations.py`'s
    `test_every_real_facts_entry_is_reachable_via_some_primitive`) that
    loads the REAL committed files and checks every entry, not merely
    asserted in this docstring.]"""

    def __init__(self, entries: List[FactsEntry], theme_tokens: Dict[str, float]):
        self.entries = entries
        self.theme_tokens = theme_tokens

    def lookup(
        self, widget_id: str, *, method: Optional[str] = None, axis: Optional[str] = None
    ) -> List[FactsEntry]:
        out = []
        for e in self.entries:
            if widget_id not in e.widget_ids:
                continue
            if method is not None and e.method != method:
                continue
            if axis is not None and e.axis is not None and e.axis != axis:
                continue
            out.append(e)
        return out

    @classmethod
    def load(
        cls,
        *,
        generated_path: Optional[Path] = None,
        residue_path: Optional[Path] = None,
        theme_css_path: Optional[Path] = None,
    ) -> "FactsTable":
        entries: List[FactsEntry] = []
        for path, source in (
            (generated_path or DEFAULT_FACTS_GENERATED_PATH, "generated"),
            (residue_path or DEFAULT_FACTS_RESIDUE_PATH, "residue"),
        ):
            p = Path(path)
            if not p.exists():
                continue
            data = json.loads(p.read_text())
            for raw in data.get("entries", []):
                # Field-first (review §5 / `_split_key`'s own corrected
                # docstring): an entry that carries its own
                # `widget_ids`/`method`/`variant` FIELDS is bound to
                # those directly — `_split_key`'s key-string convention
                # is consulted only for whatever a given entry does NOT
                # supply as a field, entry by entry (not source by
                # source), so a facts source could in principle mix
                # field-carrying and key-only entries without either
                # losing identity.
                needs_fallback = (
                    "widget_ids" not in raw or "method" not in raw or "variant" not in raw
                )
                fallback_ids: Tuple[str, ...] = ()
                fallback_method = ""
                fallback_variant: Optional[str] = None
                if needs_fallback:
                    fallback_ids, fallback_method, fallback_variant = _split_key(raw["key"])
                widget_ids = (
                    tuple(raw["widget_ids"]) if "widget_ids" in raw else fallback_ids
                )
                method = raw["method"] if "method" in raw else fallback_method
                variant = raw["variant"] if "variant" in raw else fallback_variant
                entries.append(
                    FactsEntry(
                        key=raw["key"],
                        widget_ids=widget_ids,
                        method=method,
                        variant=variant,
                        component=raw.get("component"),
                        state=raw.get("state"),
                        axis=raw.get("axis"),
                        value_px=raw.get("value_px"),
                        unexercised=bool(raw.get("unexercised", False)),
                        has_error=raw.get("error") is not None,
                        source=source,
                    )
                )
        theme_tokens = _load_theme_tokens(theme_css_path or DEFAULT_THEME_CSS_PATH)
        return cls(entries, theme_tokens)


@dataclass
class RelationContext:
    """Everything a relation expression at one load-time position may
    resolve against. Built fresh, incrementally, by `loader.py`'s
    `load_slot` as it walks the tree (see that module's own docstring for
    the exact threading) — NOT a global singleton, since `sibling_sizings`
    and `enclosing_gap_px` are genuinely per-position facts."""

    facts: FactsTable
    # widget id -> that sibling's own already-loaded Sizing, accumulated
    # LEFT TO RIGHT within the enclosing split (a disclosed scoping
    # choice: a relation may reference an EARLIER sibling in the same
    # split, never a later one — see `_resolve_ref` below).
    sibling_sizings: Dict[str, object] = field(default_factory=dict)
    # Set only while resolving an Exclusive (T) node's OWN sizing block —
    # the list of that T's own already-loaded children's Sizing, for
    # `max-over(children.min)`/`max-over(children.max)`. `None` everywhere
    # else (including while resolving one of the T's own CHILDREN's
    # sizing, where `children.*` is not yet meaningful).
    children_sizings: Optional[List[object]] = None
    # The enclosing split's own declared `gap_px`, for a bare `gap`
    # reference inside `sum-of`. `None` when there is no enclosing split
    # (the root slot) or the slot is not inside a split at all (a T's
    # direct child — a T has no gap, §9.4).
    enclosing_gap_px: Optional[float] = None
    # LYT relations-first amendment, task 4 (backward compat): every
    # literal px/ch bound resolved while this context was in play is
    # recorded here, so a caller (loader.py's `load_layouts`, ultimately)
    # can report how many deprecated literals a load still carries — the
    # channel dispatch C's own encoding rewrite flips from "recorded" to
    # "refused".
    deprecated_literals: List[dict] = field(default_factory=list)
    # LYT relations-first amendment, dispatch C4 (ledger rows
    # 2396/2397/2400/2419/2425/2436/2445 — the flip this whole channel was
    # built for). `False` (the default, byte-identical to every pre-C4
    # call) keeps a px/ch literal a non-fatal `RelationsFirstDeprecation
    # Warning`, exactly as dispatch B shipped it. `True` — set only by
    # `load_slot`/`load_layouts` callers that opt a load into STRICT mode
    # — makes `_resolve_extent_like` raise a structured `LytLoadError`
    # instead of warning, for a px/ch literal specifically (an `fr`/`inf`
    # structural sizing keyword is UNCHANGED either way: neither has a
    # relations-first analog to convert to, so refusing one would refuse
    # a construct this language has no other way to spell — see C3's own
    # dispatch report, `.claude/dispatch-reports/lyt-relations-c3-
    # rewrite.md` §7, for the empirical finding that ~60 of the two real
    # encodings' own 119 residual deprecation warnings are exactly this
    # kind, not a coverage gap). `load_slot`'s Split/Exclusive branches
    # carry this flag (and `source_file`, below) forward into every child
    # context they build, the same way they already carry `facts`
    # forward — a child slot loaded under a strict parent load is itself
    # strict, never silently downgraded.
    refuse_literal_bounds: bool = False
    # The `.lyt` source file this context's load ultimately came from
    # (e.g. `"encodings/lengyue_landscape.lyt"`), threaded through purely
    # for a refusal's own structured `detail` — "naming file/site/literal"
    # per this dispatch's own brief. `None` (the default) for any caller
    # that never supplied one (a direct `load_slot`/`_resolve_extent_like`
    # call, or a `load_layouts` call that omitted `source_file`) — the
    # refusal still fires correctly on `refuse_literal_bounds` alone, it
    # just omits the file name from its own detail dict.
    source_file: Optional[str] = None


ResolveExtentLike = Callable[..., object]  # (raw, *, where, ctx=None) -> ast.Extent


def resolve_relation(
    rel: "lytparser.RawRelation",
    *,
    where: str,
    ctx: Optional[RelationContext],
    resolve_extent_like: ResolveExtentLike,
):
    """Resolves a parsed `RawRelation` to an `ast.Extent` (always `unit ==
    'px'` — no relation in this closed set produces an `fr`/`ch` result).
    `resolve_extent_like` is `loader._resolve_extent_like` itself, threaded
    in as a callback so this module can resolve a literal-extent operand
    without importing `loader.py` (which imports THIS module — the
    callback is what keeps the dependency a DAG, not a cycle)."""
    import lyt_ast as ast  # local import: avoids a module-load-order

    if ctx is None:
        raise LytLoadError(
            f"a relation expression ('{rel.name}(...)') appears at {where} "
            "but no resolution context (facts table / sibling scope) was "
            "supplied at this call site — relations are only resolvable "
            "where loader.py threads a RelationContext through (LYT "
            "relations-first amendment, dispatch B, ledger rows "
            "2396/2397/2400/2401)",
            {"where": where, "law": "relation", "prohibition": "relation-without-context", "relation": rel.name},
        )
    name = rel.name.lower()
    if name not in RELATION_NAMES:
        raise LytLoadError(
            f"unknown relation '{rel.name}' at {where} — the closed "
            f"vocabulary (governing spec §2) is {sorted(RELATION_NAMES)}",
            {"where": where, "law": "relation", "prohibition": "unknown-relation", "got": rel.name},
        )
    if name in FACTS_LOOKUP_RELATIONS:
        return _resolve_facts_relation(name, rel, where=where, ctx=ctx)
    if name == "max-over":
        return _resolve_max_over(rel, where=where, ctx=ctx, resolve_extent_like=resolve_extent_like)
    if name == "sum-of":
        return _resolve_sum_of(rel, where=where, ctx=ctx, resolve_extent_like=resolve_extent_like)
    if name == "pack-rows":
        return _resolve_pack_rows(rel, where=where, ctx=ctx, resolve_extent_like=resolve_extent_like)
    raise AssertionError(f"unreachable: relation name {name!r} in RELATION_NAMES but not dispatched")


def _positional_args(rel: "lytparser.RawRelation") -> List[object]:
    return [a for a in rel.args if not isinstance(a, lytparser.RawRelationKwarg)]


def _kwargs(rel: "lytparser.RawRelation") -> Dict[str, object]:
    return {a.name: a.value for a in rel.args if isinstance(a, lytparser.RawRelationKwarg)}


def _resolve_facts_relation(name: str, rel, *, where: str, ctx: RelationContext):
    import lyt_ast as ast

    args = _positional_args(rel)
    if not args or not isinstance(args[0], lytparser.RawRelationRef):
        raise LytLoadError(
            f"{name} at {where} requires a bare reference as its first "
            "argument (a widget id, or a source name for read-constant) — "
            f"got {(args[0] if args else None)!r}",
            {"where": where, "law": "relation", "prohibition": "missing-relation-subject", "relation": name},
        )
    subject = args[0].text
    variant = None
    if len(args) > 1:
        if not isinstance(args[1], lytparser.RawRelationRef):
            raise LytLoadError(
                f"{name} at {where}: second argument (a state/variant name) "
                f"must be a bare reference, got {args[1]!r}",
                {"where": where, "law": "relation", "prohibition": "malformed-relation-argument", "relation": name},
            )
        variant = args[1].text
    if len(args) > 2:
        raise LytLoadError(
            f"{name} at {where} takes at most two positional arguments "
            f"(subject, state), got {len(args)}",
            {"where": where, "law": "relation", "prohibition": "too-many-relation-arguments", "relation": name},
        )

    if name == "read-constant" and subject.lower() in _THEME_SOURCE_NAMES:
        if variant is None:
            raise LytLoadError(
                f"read-constant(theme, ...) at {where} needs a token name "
                "as its second argument",
                {"where": where, "law": "relation", "prohibition": "missing-theme-token", "relation": name},
            )
        # NOTE: a `.lyt` author writes the token WITHOUT its leading
        # `--` (`read-constant(theme, space-tight)`, never `read-constant(
        # theme, --space-tight)`) — a leading `--` in concrete syntax
        # collides with this language's own `-- text` line-comment marker
        # (`parser._strip_comments`, applied before tokenization even
        # sees the rest of the line), so the CSS-custom-property prefix
        # is added HERE rather than ever appearing in source text. A
        # caller constructing a `RawRelationRef` directly (bypassing the
        # concrete-syntax parser, e.g. this dispatch's own tests) may
        # still spell it either way — both normalize to the same lookup.
        token = variant if variant.startswith("--") else f"--{variant}"
        if token not in ctx.facts.theme_tokens:
            raise LytLoadError(
                f"read-constant(theme, {variant!r}) at {where} names no "
                f"token theme.css declares — known tokens: "
                f"{sorted(ctx.facts.theme_tokens)} (governing spec §4: refuse "
                "loudly rather than guess a value)",
                {
                    "where": where, "law": "relation",
                    "prohibition": "no-matching-facts-entry",
                    "relation": name, "token": token,
                },
            )
        return ast.Extent(unit="px", v=ctx.facts.theme_tokens[token])

    method = _PRIMITIVE_METHOD[name]
    axis = _PRIMITIVE_AXIS.get(name)
    matches = ctx.facts.lookup(subject, method=method, axis=axis)
    if variant is not None:
        # A `state` argument NARROWS among matches that actually
        # distinguish states (a `variant` field, or a `state` prose field
        # naming it) — it is not required to match an entry that carries
        # neither (the common case: one entry per widget+method+axis,
        # with no state discrimination at all, `variant`/`state` both
        # unset). Narrow only when the narrowing actually finds
        # something; otherwise the un-narrowed match set stands, so a
        # state name harmlessly disambiguates docs-only intent without
        # being REQUIRED to also be present as a matchable field.
        narrowed = [
            e for e in matches
            if e.variant == variant or (e.state is not None and variant in e.state)
        ]
        if narrowed:
            matches = narrowed
        elif len(matches) > 1:
            # A variant WAS given, it matched none of several candidates
            # that DO carry variant/state discrimination between them —
            # this is an honest "no entry for that state" (not "keep every
            # candidate and call it ambiguous"), the same distinction the
            # governing spec's §4 probe contract draws between a genuinely
            # absent fact and an under-specified query.
            matches = []
        # else: exactly one non-discriminating candidate (no variant/state
        # field at all) — a named state harmlessly fails to narrow it
        # further, and the sole candidate stands.
    live = [e for e in matches if not e.unexercised and not e.has_error and e.value_px is not None]
    if not live:
        raise LytLoadError(
            f"{rel.name}({subject}"
            + (f", {variant}" if variant else "")
            + f") at {where} has no matching, exercised facts entry — refused "
            "loudly rather than falling back to a guessed number (ADR-0002; "
            "governing spec §4 probe contract)",
            {
                "where": where, "law": "relation",
                "prohibition": "no-matching-facts-entry",
                "relation": name, "subject": subject, "variant": variant,
                "candidates_found": len(matches),
                "candidates_unexercised": sum(1 for e in matches if e.unexercised),
            },
        )
    if len(live) > 1:
        raise LytLoadError(
            f"{rel.name}({subject}...) at {where} matches {len(live)} facts "
            "entries ambiguously — name a state/variant to disambiguate",
            {
                "where": where, "law": "relation",
                "prohibition": "ambiguous-facts-match",
                "relation": name, "subject": subject,
                "matches": [e.key for e in live],
            },
        )
    return ast.Extent(unit="px", v=float(live[0].value_px))


def _resolve_ref(ref: "lytparser.RawRelationRef", *, where: str, ctx: RelationContext) -> float:
    """Resolves a bare reference used as a `max-over`/`sum-of` OPERAND
    (never a facts-lookup subject — that path is `_resolve_facts_relation`
    above) to a plain px float: `gap`, `children.min`/`children.max`
    (refused HERE — only legal as `max-over`'s SOLE operand, handled
    specially by `_resolve_max_over` before reaching this function), or
    `widget.min`/`widget.pref`/`widget.max` naming an already-loaded
    sibling in the SAME enclosing split."""
    text = ref.text
    if text == "gap":
        if ctx.enclosing_gap_px is None:
            raise LytLoadError(
                f"'gap' referenced at {where} but the enclosing split "
                "declares no gap (or there is no enclosing split)",
                {"where": where, "law": "relation", "prohibition": "no-enclosing-gap"},
            )
        return ctx.enclosing_gap_px
    if text.startswith("children."):
        raise LytLoadError(
            f"'{text}' at {where} is only legal as max-over's SOLE operand "
            "(a T node's own pinned floor, governing spec §3(b)) — not "
            "inside sum-of, and not alongside other max-over operands",
            {"where": where, "law": "relation", "prohibition": "children-ref-outside-max-over"},
        )
    if "." in text:
        widget, _, field_name = text.partition(".")
        if field_name not in ("min", "pref", "max"):
            raise LytLoadError(
                f"unknown field {field_name!r} in {text!r} at {where} — "
                "expected .min, .pref, or .max",
                {"where": where, "law": "relation", "prohibition": "unknown-sibling-field", "got": field_name},
            )
        if widget not in ctx.sibling_sizings:
            raise LytLoadError(
                f"{text!r} at {where} references a sibling not (yet) "
                "loaded — this loader resolves LATERAL sibling references "
                "LEFT TO RIGHT only (a disclosed scoping choice, dispatch "
                f"B): declare {widget!r} BEFORE the slot that references it "
                "in the same split (the governing spec's own §3(b) worked "
                "example orders `tree` before `T(...)` for exactly this "
                "reason)",
                {
                    "where": where, "law": "relation",
                    "prohibition": "forward-sibling-reference", "widget": widget,
                },
            )
        ext = getattr(ctx.sibling_sizings[widget], field_name)
        if isinstance(ext, str) or ext.unit != "px":
            raise LytLoadError(
                f"{text!r} at {where}: sibling's {field_name} is not a "
                f"constant px extent ({ext!r}) — cannot combine",
                {"where": where, "law": "relation", "prohibition": "non-px-sibling-reference"},
            )
        return float(ext.v)
    raise LytLoadError(
        f"unresolvable bare reference {text!r} at {where} — expected "
        "'gap', 'children.min'/'children.max', or "
        "'widget.min'/'widget.pref'/'widget.max'",
        {"where": where, "law": "relation", "prohibition": "unresolvable-reference", "got": text},
    )


def resolve_operand_to_px(
    arg, *, where: str, ctx: RelationContext, resolve_extent_like: ResolveExtentLike
) -> float:
    """Resolves ONE `max-over`/`sum-of`/`pack-rows`-items operand to a
    plain px float — a reference, a nested relation, or an ordinary extent
    literal (which may itself carry a nested relation, e.g. a `ch` literal
    can't, but `_resolve_extent_like` already refuses non-px/ch/fr symbols
    on its own)."""
    if isinstance(arg, lytparser.RawRelationRef):
        return _resolve_ref(arg, where=where, ctx=ctx)
    if isinstance(arg, lytparser.RawRelation):
        ext = resolve_relation(arg, where=where, ctx=ctx, resolve_extent_like=resolve_extent_like)
        if ext.unit != "px":
            raise LytLoadError(
                f"nested relation '{arg.name}' at {where} resolved to a "
                f"non-px extent ({ext.unit}) — operands must be constant px",
                {"where": where, "law": "relation", "prohibition": "non-px-operand"},
            )
        return float(ext.v)
    if isinstance(arg, (lytparser.RawExtent, lytparser.RawExtentSum)):
        ext = resolve_extent_like(arg, where=where, ctx=ctx)
        if ext.unit != "px":
            raise LytLoadError(
                f"operand at {where} resolved to a non-px extent "
                f"({ext.unit}) — max-over/sum-of/pack-rows only combine "
                "constant px quantities",
                {"where": where, "law": "relation", "prohibition": "non-px-operand"},
            )
        return float(ext.v)
    raise LytLoadError(
        f"unsupported operand at {where}: {arg!r} — expected a reference, "
        "a relation, or an extent literal",
        {"where": where, "law": "relation", "prohibition": "unsupported-operand-shape"},
    )


def _resolve_max_over(rel, *, where: str, ctx: RelationContext, resolve_extent_like: ResolveExtentLike):
    import lyt_ast as ast

    args = _positional_args(rel)
    if not args:
        raise LytLoadError(
            f"max-over at {where} needs at least one operand",
            {"where": where, "law": "relation", "prohibition": "empty-max-over"},
        )
    if (
        len(args) == 1
        and isinstance(args[0], lytparser.RawRelationRef)
        and args[0].text in ("children.min", "children.max")
    ):
        field_name = args[0].text.split(".", 1)[1]
        if ctx.children_sizings is None:
            raise LytLoadError(
                f"max-over(children.{field_name}) at {where} used outside a "
                "T (Exclusive) node's own sizing — 'children' only names "
                "something for an Exclusive's own pinned floor (governing "
                "spec §3(b))",
                {"where": where, "law": "relation", "prohibition": "children-ref-outside-exclusive"},
            )
        if not ctx.children_sizings:
            raise LytLoadError(
                f"max-over(children.{field_name}) at {where}: this "
                "Exclusive has no children to take a max over",
                {"where": where, "law": "relation", "prohibition": "empty-max-over"},
            )
        values = []
        for child_sizing in ctx.children_sizings:
            ext = getattr(child_sizing, field_name)
            if isinstance(ext, str) or ext.unit != "px":
                raise LytLoadError(
                    f"max-over(children.{field_name}) at {where}: a child's "
                    f"own {field_name} is not a constant px extent ({ext!r}) "
                    "— cannot combine",
                    {"where": where, "law": "relation", "prohibition": "non-px-child-extent"},
                )
            values.append(ext.v)
        return ast.Extent(unit="px", v=max(values))
    values = [
        resolve_operand_to_px(a, where=where, ctx=ctx, resolve_extent_like=resolve_extent_like)
        for a in args
    ]
    return ast.Extent(unit="px", v=max(values))


def _resolve_sum_of(rel, *, where: str, ctx: RelationContext, resolve_extent_like: ResolveExtentLike):
    import lyt_ast as ast

    args = _positional_args(rel)
    if not args:
        raise LytLoadError(
            f"sum-of at {where} needs at least one operand",
            {"where": where, "law": "relation", "prohibition": "empty-sum-of"},
        )
    total = 0.0
    for a in args:
        total += resolve_operand_to_px(a, where=where, ctx=ctx, resolve_extent_like=resolve_extent_like)
    return ast.Extent(unit="px", v=total)


def _resolve_pack_rows(rel, *, where: str, ctx: RelationContext, resolve_extent_like: ResolveExtentLike):
    import lyt_ast as ast
    import flow as _flow
    from errors import LytFlowError

    kwargs = _kwargs(rel)
    positional = _positional_args(rel)
    items_arg = kwargs.get("items")
    if items_arg is None and positional:
        items_arg = positional[0]
    if items_arg is None:
        raise LytLoadError(
            f"pack-rows at {where} needs an 'items' list (positional or "
            "'items:' keyword)",
            {"where": where, "law": "relation", "prohibition": "missing-pack-rows-items"},
        )
    if not isinstance(items_arg, lytparser.RawRelationList):
        raise LytLoadError(
            f"pack-rows at {where}: 'items' must be a bracketed list of "
            f"extents/relations, got {items_arg!r}",
            {"where": where, "law": "relation", "prohibition": "malformed-pack-rows-items"},
        )
    target_rows_arg = kwargs.get("target-rows")
    if target_rows_arg is None:
        raise LytLoadError(
            f"pack-rows at {where} needs a 'target-rows: N' keyword argument",
            {"where": where, "law": "relation", "prohibition": "missing-target-rows"},
        )
    if not isinstance(target_rows_arg, lytparser.RawRelationNumber):
        raise LytLoadError(
            f"pack-rows at {where}: 'target-rows' must be a bare number, "
            f"got {target_rows_arg!r}",
            {"where": where, "law": "relation", "prohibition": "malformed-target-rows"},
        )
    target_rows = int(target_rows_arg.v)

    search_ceiling = None
    if "search-ceiling" in kwargs:
        search_ceiling = resolve_operand_to_px(
            kwargs["search-ceiling"], where=where, ctx=ctx, resolve_extent_like=resolve_extent_like
        )

    widths = [
        resolve_operand_to_px(it, where=where, ctx=ctx, resolve_extent_like=resolve_extent_like)
        for it in items_arg.items
    ]
    if not widths:
        raise LytLoadError(
            f"pack-rows at {where}: items list is empty",
            {"where": where, "law": "relation", "prohibition": "empty-pack-rows-items"},
        )
    ceiling = search_ceiling if search_ceiling is not None else sum(widths)
    try:
        width_floor = _flow.narrowest_width_for_row_count(
            widths, target_rows, search_ceiling=ceiling
        )
    except LytFlowError as exc:
        raise LytLoadError(
            f"pack-rows at {where} could not reach target_rows={target_rows}: "
            f"{exc.message}",
            {"where": where, "law": "relation", **exc.detail, "prohibition": "pack-rows-unreachable"},
        ) from exc
    return ast.Extent(unit="px", v=width_floor)
