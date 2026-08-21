"""Structural well-formedness checks that are NOT construction-unrepresentable
(those — content-driven sizing, system+release presence — are enforced
inline by the typed AST's own constructors and by loader.py; see that
module's docstring). L2 is a *graph-shape* law over an already-legal tree,
so it needs its own walk.

L2, quoted in full (layout-language-consult.md lines 371-380):

    "A leaf whose only function is toggling another slot's presence
    (domain: 'chrome', facets {action}) may not be the sole occupant of a
    child of any split — it must be a descendant of a slot that also
    carries non-chrome content ... Equivalently: no band of any partition
    axis is reserved for hide/show affordances alone."

AMENDMENT 2 (ledger row 1671, commissioner-delegated; see
`SPEC-AMENDMENTS.md`) — L2 dominance semantics
--------------------------------------------------------------------------

The original implementation (see git history / `SPEC-AMENDMENTS.md`'s
diff section for the retired text) was a *local tree-shape* test: a bare
chrome/action leaf standing as a split child conformed to L2 the moment
ANY other bare, non-chrome leaf sat in the same split — regardless of
size. The cold review (`lyt-compiler-cold-review.md`, "L2 checker is
trivially defeated by a near-zero decoy sibling") demonstrated this is
trivially defeatable: a `{min 1px, pref 1px, max 1px}` decoy sibling,
under 4% of the wrapped band, flips the verdict from VIOLATION to
CONFORMS on a construction that is, geometrically, still exactly the
kind of "band reserved for a toggle alone" L2 forbids. That gap is now
CLOSED — the tree-shape test is retired, replaced by a magnitude test:

    For every Split (H/V) node `n` ("a band"): let `chrome_px` be the sum
    of `pref` (px, along `n`'s own partition axis) of `n`'s DIRECT
    children that are bare chrome/action leaves (`domain: 'chrome'`,
    `facets == {action}` exactly — same restriction to BARE leaves the
    original check used; a leaf wrapped in its own composite is checked
    independently, at its OWN level, when that composite is itself
    visited as `n`). Let `total_px` be the sum of `pref` (px) of ALL of
    `n`'s direct children, plus `n.gap_px * max(len(children)-1, 0)` (the
    same quantity the compiler's own H/V partition equality sums to —
    `compiler.py`'s `_constrain`, Split branch: `Σ along_vars + gap*(n-1)
    == this_along_extent`). `n` is an L2 violation iff `chrome_px * 2 >
    total_px` (strict majority; a 50/50 split does not violate).

Why "band" = the SPLIT NODE ITSELF, not one of its children (disclosed
interpretation choice): the amendment's own phrasing — "chrome-action
leaves account for the majority of ITS reserved extent along THE
PARENT'S partition axis" — reads most consistently, against the two
witnesses below, as "the parent" referring to `n` in its role as parent
of the leaves being measured (`n`'s own partition axis, along which its
children's `pref` values are declared and summed by the partition
equality), not to some further-out grandparent `n` doesn't have (`n`
itself may be the tree's root, which has no grandparent at all, yet
still needs a well-defined "reserved extent along its own partition
axis" — the sum of its own children's `pref`). Two alternative readings
were tried and rejected because they mishandle at least one required
witness:

  - "band = a single split-CHILD, measured against its own siblings'
    total" gets the canonical §5.1 sidebar-collapse-rail witness WRONG:
    `sidebarToggle{27px}` sits beside a `168px` sidebar column and a
    `1fr` (elastic) main column — 27px is nowhere near a majority of
    that sibling total, yet this IS the spec's own canonical ⚠L2
    violation.
  - "band = a single split-child, self-measured against its OWN declared
    pref" (i.e. "what fraction of MY OWN reservation is chrome-action
    content") flags EVERY bare chrome/action leaf trivially (a leaf's
    content is always 100% of its own reservation by definition) — that
    would flag the spec's own "L2-conformers (embedded)" toggle cluster
    riding the nav bar too, contradicting the "genuine mixed toolbars...
    MUST still pass" requirement.

The adopted per-SPLIT-NODE aggregate reading gets both required witnesses
right (see the two encodings this drove structural changes in, discussed
below) and matches the document's own "no band of any partition axis is
reserved for hide/show affordances alone" — "band" there is naturally the
split's own partition, not an arbitrary child of it.

**Witness 1 — the decoy construction, now flagged (cold review's
`l2_sneak`).** An inner `H(sidebarToggle{26px,chrome}, decoy{1px,
common})`, itself a direct child of a bigger outer `H`, alongside two big
composite siblings: checked as its OWN band (`n` = the inner H),
`chrome_px = 26`, `total_px = 27` (26+1, no gap) → `52 > 27` → VIOLATION.
The outer H is checked independently too: its own direct children are
the inner H (a COMPOSITE, not a bare leaf — contributes 0 to `chrome_px`
at the outer level) and the two big V siblings — no violation there,
which is fine; the inner-H violation alone is sufficient. See
`tests/test_lyt.py::test_l2_decoy_construction_is_rejected`.

**Witness 2 — a genuine mixed toolbar, still passing.** A toolbar `H`
whose direct children are several substantial non-chrome groups (a
title+URI cluster, an engine-metrics strip, a mint-cluster of go/common/
debug action buttons, …) PLUS a couple of bare chrome/action toggle
leaves, where the chrome leaves' combined `pref` is a minority of the
row's total: `chrome_px < total_px / 2` → CONFORMS. See
`tests/test_lyt.py::test_l2_mixed_toolbar_conforms`.

**Consequence for `current_row_repaired.lyt`**: the previous transcription
WRAPPED the four chrome toggle buttons (`sidebarToggle`/`boardToggle`/
`treeToggle`/`ctrlToggle`, 24px each = 96px) together with `locale` (24px)
in their OWN dedicated inner `H{pref 120px}` — checked as its OWN band,
that inner H is `96*2=192 > 120` → a genuine, UNAMBIGUOUS majority
violation under the new semantics (this is NOT the ambiguity case below;
it is a clean majority failure). Per L2's OWN prescribed remedy — "ride
the already-reserved nav bar" (line 380) — the fix is to UNWRAP that
inner H, promoting its five children to be DIRECT children of the outer
nav-bar row H instead of a segregated sub-band. This changes no solved
geometry (an H's partition is associative when an inner wrapper's own
`pref` equals the exact sum of its children's `pref`, which it did here:
120 = 96+24) but changes which node is checked as `n`: at the nav-bar
row's own level, `chrome_px = 96` against a `total_px` around 900px (the
row's other substantial groups) — comfortably a minority, CONFORMS. See
`current_row_repaired.lyt`'s own header for the restructuring note.

Fixed-not-dodged, per the same discipline AMENDMENT 1's build report
applies: this restructuring is not "weakening a sizing to dodge" the new
check — it implements L2's own textually-prescribed remedy more
faithfully than the previous transcription did (the previous wrapper was
a stylistic convenience, not semantically required), and it changes no
solved rectangle.

**Ambiguity — genuinely incomparable cases, refused loudly (ADR-0002),
not guessed (disclosed edge-case choice).** `pref` is never `'inf'` by
construction (`lyt_ast.Sizing.pref: Extent` has no `inf` member — only
`max` does — so the "inf" half of the amendment's own "e.g. inf/fr
handling" phrasing never actually arises here; noted for completeness).
`ch` is already normalized to px by the loader before this check runs.
The one unit that CAN reach this check unresolved is `fr` (an elastic
pref, e.g. `pref 1fr` on a composite sibling — genuinely common in this
prototype's encodings, since most composite columns/rows use `pref 1fr`
to mean "the rest of the available space"). When a Split `n` contains at
least one bare chrome/action leaf (`chrome_px > 0` would otherwise be
computed) AND at least one direct child (chrome or not) whose `pref` is
`fr` rather than `px`, `total_px` cannot be resolved to a definite
number without a resolved (and, for a bare `fr` pref with no obvious
"whole" to be a share of, currently undefined) convention — refused
loudly with `detail.law == "L2"` (the message text names the fr-pref
sibling ambiguity; there is no `reason` key — see SPEC.md §5 for the
real error shape, corrected per the grammar audit), rather than
silently treating the `fr` sibling as 0 (which could manufacture a false
majority) or as infinite (which could hide a true one). This is a real
consequence: `current_row_wart_l2.lyt` (the flat, undecorated
sidebar-collapse-rail transcription — `sidebarToggle{27px,chrome}` beside
a `168px` sidebar V and a `1fr` main V) now trips THIS ambiguity refusal
rather than the old tree-shape violation — it still refuses to load
(the fixture's purpose — demonstrating a REFUSAL — is preserved), just
via a different, more honest mechanism: this prototype genuinely cannot
certify or refute L2 conformance for that specific construction without
a disclosed fr-pref convention this amendment does not introduce. If a
future encoding needs that convention resolved, it is a fresh scope
question, not a silent guess made here.

MAGNITUDE, RETIRED: the previous version of this docstring warned that
"a clean L2 pass [was] weak assurance against adversarial or accidental
decoys, not a guarantee" and that the checker was "trivially defeated by
a near-zero decoy sibling". That caveat is RETIRED — Witness 1 above is
exactly the construction that caveat described, and it is now correctly
flagged. The dominance test is not a complete formalization of L2's
prose (the "does removing the leaf collapse its axis to zero" 2-D
reading, discussed and rejected below, is arguably closer still), but it
closes the specific, previously-disclosed, and cold-review-quantified
loophole.

The alternative reading we (still) reject — "does the chrome leaf's own
axis dimension collapse to zero if it is removed" — is arguably closer
to the document's "no band ... reserved ... alone" phrasing, but requires
genuine 2-D reasoning about which axis a leaf's presence widens (a
system-level property spanning axis-crossing nesting, not a tree-local
one) and remains out of scope for this prototype's checker, same as
before this amendment.

Applies to Split (H/V) nodes only, not Exclusive (T) — a T node's children
each receive the *whole* rectangle (§4.1 line 297-298), so "a band of a
partition axis" does not describe a T child's relationship to its
siblings. Disclosed scoping choice, unchanged by this amendment.

AMENDMENT 5 (ledger row 1937, commissioner-delegated; see
`SPEC-AMENDMENTS.md` and
`.claude/dispatch-reports/lyt-tab-region-consult.md`) — overflow as a
typed, checkable language concept
--------------------------------------------------------------------------

Four laws, all enforced by `find_l5_violations` below in the SAME
enforcement family as L2's dominance test — a structural tree-walk run
at load time, over the SAME `(law, path)` waiver mechanism `Waiver`/
`check_wellformed` already generalize for (that dataclass's own
docstring names the field as "open-ended... in case a future law gains
a structural checker" — this is that future law):

  - **L5 (overflow honesty).** Checkable form implemented: an
    `unbounded`-content leaf may not ALSO claim `basis == 'envelope'` —
    an envelope enumerates a FINITE set of content states (L3), which is
    not an honest claim for content that is unbounded by definition.
    (The report's own §9.2: "the registry case and the chart case are
    both theorems of the classification" — this is the half of L5 that
    is a genuine, distinct, checkable rule rather than being fully
    subsumed by L5a/L5c below; a `bounded`/`designed` leaf's "envelope OR
    plain reservation" both remain honest per the report's own "a
    bounded/designed leaf requires its envelope/reservation to fit"
    clause, so neither is refused by this rule.)
  - **L5a (coverage).** An `unbounded`-class leaf REQUIRES exactly one
    scroll owner (a `scroll` declaration on some slot along its
    root-to-leaf path, inclusive of the leaf's own slot) — a leaf with
    NO scroll owner anywhere on its path is refused. A `bounded`/
    `designed` leaf carries no such requirement (its own reservation, or
    an honest envelope, is sufficient per L5 above) — this is the
    checkable half of "a bounded/designed leaf requires its envelope/
    reservation to fit": DISCLOSED RESIDUAL, same footing as L3's own
    ("declarations can lie; completeness is review's") — this walk
    cannot verify that a `designed` leaf's declared demand genuinely
    matches its rendered content, only that the STRUCTURAL disposition
    (no scroll escape hatch, per L5c below) is honored.
  - **L5b (single scroll owner).** On any root-to-leaf path, at most one
    slot declares `scroll` per AXIS. A second declaration on the SAME
    axis on the SAME path is refused — "which container absorbs the
    overflow" must be unambiguous (report §9.1); two DIFFERENT axes
    (`scroll h` at one slot, `scroll v` at a descendant) are not in
    conflict and do not violate this law.
  - **L5c (chart exclusion, subtree-quantified fold).** A slot may
    declare `scroll` only if its OWN subtree (itself included) contains
    NO `designed`-class leaf — computed as a fold over the subtree, not
    a per-slot tag (report §9.2: "a container is chart-bearing because a
    descendant is a chart, not because someone remembered to tag the
    container"). This is what makes a chart-bearing container's declared
    demand a HARD reservation the solver must fit (INFEASIBLE, never a
    scrollbar, where it cannot) — see SPEC.md §11's Amendment-1 banner-
    floor precedent for the same "a genuine floor may make sizes
    infeasible, and that is correct" posture applied here.

**Dormancy, by construction (the HARD CONSTRAINT this implementation
wave is bound by).** Every one of the four checks above is gated on an
explicit `content`/`scroll` declaration existing somewhere in the tree:
L5/L5a only look at a leaf whose `Slot.content` (AMENDMENT 10, ledger
rows 2447/2450 — relocated from `Leaf.content`) is genuinely non-`None`;
L5b/L5c only fire at a slot whose `Slot.scroll_axes` is genuinely
non-empty. A tree with NO Amendment-5 declarations anywhere — every
existing encoding as of this amendment — triggers none of the four
checks; `find_l5_violations` returns `[]` unconditionally for such a
tree. The laws bind declarations; they do not retroactively indict
silence.

L4 ACCOUNTING (cold review, lyt-compiler-cold-review.md, "L4 has no
accounting anywhere a reader would look for one"): this module implements
L2 only. L4 ("a slot's extent has at most one writer among {solver
constant, user drag}", line 350-364 region) is NOT implemented here, or
anywhere in this prototype — not approximated, not partially checked,
just absent. The `drag-persisted` sizing keyword parses (parser.py's
`RawSizing.drag_persisted`) but is dropped on the floor: it is never
copied onto `lyt_ast.Sizing` (which has no such field), and never read by
loader.py, this module, or compiler.py. This is a defensible prototype
scope call — this is a static, offline solver with no runtime drag state
to arbitrate, so there is no "other writer" for a solver-only pass to
conflict with — but, mirroring the discipline this module already applies
to L1 elsewhere (see loader.py's F7 correction paragraph), the absence
gets its own accounting rather than silent omission: a reader who trusts
this module's docstring, or `errors.py`'s reference to "L1-L4" as what
`LytLoadError` enforces, should not have to read every `.lyt` encoding's
comments to learn that L4 is a no-op in this codebase.

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

import lyt_ast as ast
from errors import LytLoadError


@dataclass(frozen=True)
class Waiver:
    """A single, loud, enumerated exemption from one well-formedness law
    at one tree location — the mechanism named by the lyt-constants-swap
    commission for loading an as-is baseline encoding that is honestly
    L1/L2-non-conformant (`research/lyt/fixtures/transcription/current_row_asis.lyt`).

    Per the commission's own instruction ("a waiver must name the law and
    the wiki/consult citation" — a documented per-law waiver annotation,
    not a global weakening of the checker), every field is mandatory and
    checked at construction:

      - `law`: which well-formedness law is being waived (`"L2"`, or —
        since AMENDMENT 5, ledger row 1937 — one of `"L5"`/`"L5a"`/
        `"L5b"`/`"L5c"`; see wellformed.py/loader.py's L1 disclosure for
        why L1/L4 are not checkable at all and so can never be named
        here. This field was always open-ended rather than hardcoded, in
        anticipation of exactly this: a future law gaining a structural
        checker.).
      - `path`: the exact tree path `find_l2_violations`'s walk reports
        for the violating Split node (`"root/H0"` etc.) — matched
        EXACTLY, not as a prefix, so a waiver only ever silences the one
        site it was written against, never an unrelated sibling that
        happens to share a path prefix.
      - `citation`: the wiki/consult-document citation naming WHY this
        specific site is a known, accepted baseline wart rather than a
        defect to fix (e.g. a `layout-language-consult.md` line range, or
        an ADR). A waiver with no citation is exactly the "silently
        passing it" failure mode the commission forbids.

    `check_wellformed` below additionally refuses to load if a declared
    waiver does NOT match any violation actually found on this load (a
    "stale waiver" — one that no longer names a real site, whether
    because the encoding changed or the path was mistyped) — a decorative
    waiver that silences nothing real is exactly as dishonest as an
    unwaived violation passing silently, so it is refused the same way.
    """

    law: str
    path: str
    citation: str

    def __post_init__(self) -> None:
        if not self.law:
            raise ValueError("Waiver.law must be non-empty")
        if not self.path:
            raise ValueError("Waiver.path must be non-empty")
        if not self.citation:
            raise ValueError(
                "Waiver.citation must name the wiki/consult citation this "
                "waiver rests on — an uncited waiver is the silent-pass "
                "failure mode ADR-0002 and the lyt-constants-swap "
                "commission both forbid."
            )


def _is_bare_chrome_action_leaf(slot: ast.Slot) -> bool:
    n = slot.node
    return (
        isinstance(n, ast.Leaf)
        and n.domain == "chrome"
        and n.facets == frozenset({"action"})
    )


def find_l2_violations(root: ast.Slot, *, path: str = "root") -> List[str]:
    """AMENDMENT 2 dominance check (ledger row 1671) — see module
    docstring for the full derivation. For every Split node `n`
    encountered while walking the tree, compares the summed `pref` (px)
    of `n`'s direct bare-chrome/action-leaf children against `n`'s own
    total reserved extent (summed `pref` of ALL direct children, plus
    gap). Returns one formatted string per Split node that either (a)
    is a genuine strict-majority violation, or (b) cannot be resolved
    at all because an `fr` pref makes the total incomparable while
    chrome content is present — both cases are reported the same way
    (as an entry in this list, surfaced by `check_wellformed` as a
    single `law: "L2"` `LytLoadError`), since both represent "this
    prototype will not certify this band as L2-conforming."
    """
    violations: List[str] = []

    def walk(slot: ast.Slot, path: str) -> None:
        n = slot.node
        if isinstance(n, ast.Split):
            axis = n.axis
            chrome_px = 0.0
            total_px = 0.0
            has_chrome = False
            ambiguous = False
            terms: List[Tuple[int, ast.Slot]] = list(enumerate(n.children))
            for i, child in terms:
                pref = child.sizing.pref
                is_chrome = _is_bare_chrome_action_leaf(child)
                has_chrome = has_chrome or is_chrome
                if pref.unit != "px":
                    # ch is already resolved to px by the loader; only
                    # 'fr' reaches here. A chrome leaf itself declared
                    # with an elastic pref is ALSO an ambiguous case (an
                    # unbounded chrome reservation can't be shown to be
                    # a minority either), same as an 'fr' non-chrome
                    # sibling denying us a definite total — either way
                    # the verdict is deferred to below, once we know
                    # whether chrome is present at all in this split.
                    ambiguous = True
                    continue
                if is_chrome:
                    chrome_px += pref.v
                total_px += pref.v
            if has_chrome:
                total_px += n.gap_px * max(len(n.children) - 1, 0)
                if ambiguous:
                    violations.append(
                        f"{path}: L2 dominance is INCOMPARABLE — this band "
                        "contains chrome/action content alongside a "
                        "direct child whose 'pref' is 'fr' (elastic, no "
                        "static px value), so the majority-of-reserved-"
                        "extent test cannot be resolved without guessing "
                        "(refused per ADR-0002, AMENDMENT 2 ledger row "
                        "1671's disclosed edge-case choice)"
                    )
                elif chrome_px * 2 > total_px:
                    violations.append(
                        f"{path}: L2 dominance violation — chrome/action "
                        f"direct children reserve {chrome_px:g}px of this "
                        f"band's {total_px:g}px total along the '{axis}' "
                        "partition axis (> half)"
                    )
            for i, child in terms:
                walk(child, f"{path}/{axis.upper()}{i}")
        elif isinstance(n, ast.Exclusive):
            for i, child in enumerate(n.children):
                walk(child, f"{path}/T{i}")
        # Leaf: nothing further to walk.

    walk(root, path)
    return violations


def _subtree_has_designed_leaf(slot: ast.Slot) -> bool:
    """L5c's subtree fold: True iff `slot` or ANY descendant is a leaf
    whose `content == 'designed'`. Computed structurally — a container is
    chart-bearing because a descendant genuinely is one, never because a
    tag was hand-applied to the container (report §9.2).

    AMENDMENT 10 (ledger rows 2447/2450): `content` relocated from
    `Leaf.content` to `Slot.content` (`lyt_ast.py`'s own Amendment 10
    entry) — read here as `slot.content`, not `node.content` (`Leaf` no
    longer has that field). The check itself is UNCHANGED: still gated on
    `isinstance(node, ast.Leaf)`, so a `content` declaration at either of
    Amendment 10's two new non-leaf positions (an Exclusive's own
    wrapping slot, an Exclusive-child's own wrapping slot) is invisible
    to this fold exactly as an unclassified leaf always was — only a
    LEAF's own declared class ever makes a subtree chart-bearing."""
    node = slot.node
    if isinstance(node, ast.Leaf):
        return slot.content == "designed"
    if isinstance(node, (ast.Split, ast.Exclusive)):
        return any(_subtree_has_designed_leaf(c) for c in node.children)
    return False


def find_l5_violations(root: ast.Slot, *, path: str = "root") -> List[Tuple[str, str, str]]:
    """AMENDMENT 5 (ledger row 1937) — see module docstring for the full
    derivation of each law. Returns one `(law, path, message)` triple per
    violation, in tree-walk order — `law` is one of `"L5"`, `"L5a"`,
    `"L5b"`, `"L5c"`, matching `find_l2_violations`' own "one entry per
    violating site" shape but carrying its own law tag explicitly
    (rather than a hardcoded `"L2"`), since `check_wellformed` below now
    arbitrates violations from more than one law against the same
    `(law, path)`-keyed `Waiver` mechanism.

    `owners`, threaded down the walk, is `{axis: [declaring_path, ...]}`
    — every slot ALONG THE ROOT-TO-CURRENT-NODE PATH that has already
    declared `scroll` on that axis, in declaration order. A fresh
    (structurally-shared-nothing) copy is built at every node so a
    sibling subtree never sees another sibling's declarations — this is
    the same "per ROOT-TO-LEAF PATH" quantification L5a/L5b's own law
    text names, not a whole-tree aggregate.
    """
    violations: List[Tuple[str, str, str]] = []

    def walk(slot: ast.Slot, path: str, owners: Dict[str, List[str]]) -> None:
        node = slot.node

        # L5c — chart exclusion: THIS slot's own subtree (self included)
        # must contain no 'designed' leaf, checked BEFORE recursing so a
        # violation names the declaring slot, not a leaf beneath it.
        if slot.scroll_axes and _subtree_has_designed_leaf(slot):
            violations.append((
                "L5c",
                path,
                f"{path}: L5c chart-exclusion violation — this slot "
                f"declares scroll ({', '.join(sorted(slot.scroll_axes))}) "
                "but its own subtree contains a 'designed'-class leaf; a "
                "chart-carrying container may not scroll — its declared "
                "demand must be a hard reservation the solver fits, never "
                "a scrollbar escape hatch (AMENDMENT 5, ledger row 1937)",
            ))

        # L5b — single scroll owner per axis per root-to-leaf path.
        new_owners: Dict[str, List[str]] = {axis: list(v) for axis, v in owners.items()}
        for axis in sorted(slot.scroll_axes):
            existing = new_owners.setdefault(axis, [])
            if existing:
                violations.append((
                    "L5b",
                    path,
                    f"{path}: L5b single-scroll-owner violation — axis "
                    f"{axis!r} already has a scroll owner at "
                    f"{existing[0]!r} on this root-to-leaf path; a second "
                    f"declaration at {path!r} is ambiguous (which "
                    "container absorbs the overflow? — AMENDMENT 5, "
                    "ledger row 1937)",
                ))
            existing.append(path)

        if isinstance(node, ast.Leaf):
            # AMENDMENT 10 (ledger rows 2447/2450): `slot.content`, not
            # `node.content` — see `_subtree_has_designed_leaf`'s own
            # Amendment 10 note above for the full relocation disclosure.
            if slot.content == "unbounded":
                has_owner = any(new_owners.get(axis) for axis in ("h", "v"))
                if not has_owner:
                    violations.append((
                        "L5a",
                        path,
                        f"{path}: L5a coverage violation — leaf "
                        f"{node.widget!r} is content: unbounded but has no "
                        "scroll owner anywhere on its root-to-leaf path "
                        "(an unbounded leaf REQUIRES exactly one declared "
                        "scroll axis, on itself or an ancestor — "
                        "AMENDMENT 5, ledger row 1937)",
                    ))
                if slot.sizing.basis == "envelope":
                    violations.append((
                        "L5",
                        path,
                        f"{path}: L5 overflow-honesty violation — leaf "
                        f"{node.widget!r} is content: unbounded and also "
                        "declares basis='envelope' — an envelope "
                        "enumerates a FINITE set of content states, which "
                        "is not an honest claim for content that is "
                        "unbounded by definition (AMENDMENT 5, ledger row "
                        "1937)",
                    ))
            return
        if isinstance(node, ast.Split):
            for i, child in enumerate(node.children):
                walk(child, f"{path}/{node.axis.upper()}{i}", new_owners)
        elif isinstance(node, ast.Exclusive):
            for i, child in enumerate(node.children):
                walk(child, f"{path}/T{i}", new_owners)

    walk(root, path, {})
    return violations


def find_l10_violations(root: ast.Slot, *, path: str = "root") -> List[Tuple[str, str, str]]:
    """AMENDMENT 7 (ledger rows 2107/2108, ported from the model-iteration
    loop experiment round 5, ledger rows 2037/2038/2066/2079) — L10, unit
    integrity. Returns one `(law, path, message)` triple per violation,
    the same shape `find_l5_violations` returns and arbitrated through
    the same `(law, path)`-keyed waiver mechanism.

    THE LAW. A leaf may declare the indivisible UNIT its content is made
    of (`unit <axis> <px>`, `Leaf.unit_axes`, see
    `loader._load_unit_axes` for the load-time half of this law). Where
    the declared axis is the axis the slot is actually PARTITIONED on,
    its declared `min` must reserve at least ONE WHOLE UNIT: a
    reservation that cannot stand one whole unit of the thing it is made
    of is refused, because every honest realization of it must then
    split a unit — the wrap falling between a label and its own value,
    the scroll edge falling mid-word, the strip standing a fraction of a
    tab.

    WHICH AXIS A SLOT IS PARTITIONED ON is a fact only a tree walk has,
    which is why this half of the law cannot live in the loader beside
    the other half: a slot inside an H split declares a WIDTH, inside a V
    split a HEIGHT, and a T-child declares BOTH (SPEC.md §8's own
    `along=None` branch). The root slot is likewise both-axes.

    DISCLOSED, NOT HIDDEN — the two places this law is deliberately
    silent:
      - A unit on the CROSS axis constrains no declared extent in this
        1-D-per-slot sizing bag, so it is REALIZATION-BINDING ONLY, the
        same footing `ceiling`/L9 has.
      - A `min` that is not a plain px extent (an `fr` share, a symbolic
        sentinel) is skipped rather than guessed at: comparing a share of
        an unknown partition against a px unit would be a fabricated
        comparison, and ADR-0002 prefers an honest silence to a
        confident wrong answer.
    """
    violations: List[Tuple[str, str, str]] = []

    def walk(slot: ast.Slot, path: str, along: Optional[str]) -> None:
        node = slot.node
        if isinstance(node, ast.Leaf) and node.unit_axes:
            # `along is None` means both axes bind (root slot, or a
            # T-child sharing one rectangle with its siblings).
            binding = {"h", "v"} if along is None else {along}
            for axis, unit_px in sorted(node.unit_axes):
                if axis not in binding:
                    continue
                m = slot.sizing.min
                if m.unit != "px":
                    continue
                if m.v + 1e-9 < unit_px:
                    violations.append((
                        "L10",
                        path,
                        f"{path}: L10 unit-integrity violation — leaf "
                        f"{node.widget!r} declares an indivisible {unit_px:g}px "
                        f"unit along its own partition axis {axis!r} but "
                        f"reserves only {m.v:g}px, so no realization of this "
                        "reservation can stand one whole unit; a container "
                        "that reserves less than the thing it is made of can "
                        "only split it (AMENDMENT 7, ledger rows 2107/2108)",
                    ))
        if isinstance(node, ast.Split):
            for i, child in enumerate(node.children):
                walk(child, f"{path}/{node.axis.upper()}{i}", node.axis)
        elif isinstance(node, ast.Exclusive):
            for i, child in enumerate(node.children):
                walk(child, f"{path}/T{i}", None)

    walk(root, path, None)
    return violations


def find_l11_violations(root: ast.Slot, *, path: str = "root") -> List[Tuple[str, str, str]]:
    """AMENDMENT 7 (ledger rows 2107/2108, ported from the model-iteration
    loop experiment round 6, ledger rows 2037/2038/2066) — L11, measure
    integrity. Returns one `(law, path, message)` triple per violation,
    the same shape `find_l5_violations`/`find_l10_violations` return and
    arbitrated through the same `(law, path)`-keyed waiver mechanism.

    THE LAW. A slot may declare that its extent along its parent's
    partition axis comes from the PAGE MEASURE its aspect-locked content
    is bound by, rather than from a share of that partition
    (`measure-bound`, `Sizing.measure_bound`; see
    `loader._load_measure_bound` for the load-time half of this law). Two
    structural conditions make that declaration meaningful, and both need
    a tree walk, which is why they cannot live beside the other half:

      (a) NOT THE ROOT. The root's own rectangle IS the page; it has no
          parent partition to be measured against and no sibling to
          leave the residual to. A root declaring it would be claiming
          the page from itself.
      (b) EXACTLY ONE ASPECT-LOCKED LEAF IN ITS SUBTREE (itself
          included). The measure becomes an extent only by passing
          through an aspect lock — that leaf is the whole mechanism.
          None, and there is nothing to convert a width into a height;
          more than one, and WHICH leaf's lock does the converting is
          ambiguous, the same "unambiguous owner" reasoning L5b applies
          to scroll.

    DISCLOSED, NOT HIDDEN: like `ceiling`/L9 and a cross-axis `unit`/L10,
    this law binds the REALIZATION rather than the solve — nothing in
    `compiler.py` reads it.
    """
    violations: List[Tuple[str, str, str]] = []

    def count_aspect_leaves(slot: ast.Slot) -> int:
        node = slot.node
        if isinstance(node, ast.Leaf):
            return 1 if slot.sizing.aspect is not None else 0
        if isinstance(node, (ast.Split, ast.Exclusive)):
            return sum(count_aspect_leaves(c) for c in node.children)
        return 0

    def walk(slot: ast.Slot, spath: str, is_root: bool) -> None:
        if slot.sizing.measure_bound:
            if is_root:
                violations.append((
                    "L11",
                    spath,
                    f"{spath}: L11 measure-integrity violation — the ROOT slot "
                    "declares 'measure-bound', but the root's rectangle IS the "
                    "page: it has no parent partition to take a measure "
                    "against and no sibling to leave the residual to "
                    "(AMENDMENT 7, ledger rows 2107/2108)",
                ))
            n = count_aspect_leaves(slot)
            if n != 1:
                violations.append((
                    "L11",
                    spath,
                    f"{spath}: L11 measure-integrity violation — 'measure-bound' "
                    f"declared over a subtree holding {n} aspect-locked leaves; "
                    "exactly one is required, because the aspect lock IS the "
                    "mechanism that turns a page measure into an extent (none "
                    "leaves nothing to convert it; several leave WHICH lock "
                    "converts it ambiguous, the same unambiguous-owner "
                    "reasoning L5b applies to scroll) (AMENDMENT 7, ledger "
                    "rows 2107/2108)",
                ))
        node = slot.node
        if isinstance(node, ast.Split):
            for i, child in enumerate(node.children):
                walk(child, f"{spath}/{node.axis.upper()}{i}", False)
        elif isinstance(node, ast.Exclusive):
            for i, child in enumerate(node.children):
                walk(child, f"{spath}/T{i}", False)

    walk(root, path, True)
    return violations


def find_l12_violations(root: ast.Slot, *, path: str = "root") -> List[Tuple[str, str, str]]:
    """LOOP ITERATION 8 / ARC 4 (model-iteration loop EXPERIMENT, ledger rows
    2037/2066/2107/2157; branch lyt-model-loop-experiment, NOT merged without
    ratification) — L12, floor attribution. Returns one `(law, path, message)`
    triple per violation, the same shape `find_l5_violations` /
    `find_l10_violations` / `find_l11_violations` return, arbitrated through
    the same `(law, path)`-keyed waiver mechanism.

    THE LAW. `min <axis> <extent>` (`Sizing.axis_mins`;
    `loader._load_axis_mins` carries the load-time half) declares a floor for
    ONE axis. That is only a distinct fact from the axis-agnostic `min` where
    `min` is read on BOTH axes — the root, and a direct child of an
    Exclusive/T node, the two positions `compiler._constrain` visits with
    `along=None`. Everywhere else a slot's `min` already names exactly one
    axis (the one its parent partitions on) and the OTHER axis is fixed by
    the parent's own cross-axis equality, so an axis-keyed floor there is
    either a redundant restatement of `min` or a claim about an axis this
    slot does not get to make — and a declaration that cannot bind is the
    decorative-declaration failure mode this language's whole L3/L5/L10
    family exists to refuse (SPEC.md §4.2's own "the code does not compute a
    max over anything" is the same complaint one law family over).

    Only a tree walk knows a slot's parent, which is why this half cannot
    live beside the load-time one.

    DISCLOSED, NOT HIDDEN: unlike `ceiling`/L9, a cross-axis `unit`/L10 and
    `measure-bound`/L11 — all three realization-binding — L12 is
    SOLVER-VISIBLE. `compiler._constrain` applies the per-axis floor to the
    matching CP-SAT variable, and the Exclusive branch's own componentwise-
    max derivation takes each child's floor per axis. A program that
    declares no axis-keyed `min` anywhere solves byte-identically to its
    pre-iteration self (verified by re-running the full matrix before and
    after the mechanism landed, with the encodings still unedited).
    """
    violations: List[Tuple[str, str, str]] = []

    def walk(slot: ast.Slot, spath: str, both_axes: bool) -> None:
        if slot.sizing.axis_mins and not both_axes:
            axes = sorted(axis for axis, _ in slot.sizing.axis_mins)
            violations.append((
                "L12",
                spath,
                f"{spath}: L12 floor-attribution violation — declares a "
                f"per-axis floor ({', '.join('min ' + a for a in axes)}) at a "
                "slot whose own `min` already names exactly ONE axis (the "
                "axis its parent partitions on); the other axis is fixed by "
                "the parent's cross-axis equality, so this declaration binds "
                "nothing. A per-axis floor is meaningful only where the "
                "slot's rectangle IS its parent's on both axes — the root, "
                "or a direct child of an Exclusive/T node (LOOP ITERATION 8 "
                "/ ARC 4, ledger rows 2037/2066/2107/2157)",
            ))
        node = slot.node
        if isinstance(node, ast.Split):
            for i, child in enumerate(node.children):
                walk(child, f"{spath}/{node.axis.upper()}{i}", False)
        elif isinstance(node, ast.Exclusive):
            for i, child in enumerate(node.children):
                walk(child, f"{spath}/T{i}", True)

    walk(root, path, True)
    return violations


def _can_exceed_its_floor(sizing: ast.Sizing, axis: str) -> bool:
    """True when this slot's reservation on `axis` can be granted MORE than
    its own floor — i.e. there is a residual for L13 to attribute. `max
    inf` always can; an `fr` floor is a share, not a constant, so it is
    treated as "cannot be compared" (ADR-0002's honest silence over a
    confident wrong answer, the same disposition `find_l10_violations`
    takes for a non-px `min`)."""
    lo = sizing.axis_min(axis)
    hi = sizing.max
    if hi == "inf":
        return True
    if not isinstance(lo, ast.Extent) or not isinstance(hi, ast.Extent):
        return False
    if lo.unit != hi.unit:
        return False
    return hi.v > lo.v


def find_l13_violations(root: ast.Slot, *, path: str = "root") -> List[Tuple[str, str, str]]:
    """LOOP ITERATION 9 / ARC 4 ROUND 2 (model-iteration loop EXPERIMENT,
    ledger rows 2037/2066/2107/2157/2209/2212; branch
    lyt-model-loop-experiment, NOT merged without ratification) — L13,
    surplus attribution. Returns one `(law, path, message)` triple per
    violation, the same shape every other structural checker in this module
    returns, arbitrated through the same `(law, path)`-keyed waiver mechanism.

    THE LAW. A rectangle that is larger than what occupies it is this
    language's founding complaint, and until now the language could only say
    it from one end: `ceiling` (L9) shrinks a reservation back to a FINITE
    demand. Content declared `unbounded` has no finite demand to shrink to,
    so for it the question is the other one — does the occupant GROW to what
    it was granted, or does the difference fall to bare background? Nothing
    in this language answered that, and the answer was being decided,
    per-component and invisibly to the model, by hand-authored CSS caps.

    So: a leaf declaring `content unbounded` must DISPOSE of every axis
    along which its own reservation can be granted more than its floor.
    There are exactly three honest dispositions, and this law asks only that
    one of them be named:

      - `scroll <axis>` — the content EXCEEDS the reservation on that axis,
        so there is never a surplus to attribute (L5a already names its
        owner);
      - `elastic <axis>` — the OCCUPANT claims whatever it is granted;
      - a pinned axis (floor == cap) — no surplus can arise in the first
        place.

    An axis with none of the three has a residual that belongs to nobody.

    SCOPE, DELIBERATE AND DISCLOSED. The walk fires only where a slot's own
    declaration binds BOTH of its axes at once — the root and a direct child
    of an Exclusive/T node, exactly the `along=None` position L12 already
    distinguishes. Everywhere else a leaf declares an extent for ONE axis
    (its parent's partition axis) and simply takes the parent's extent on
    the other, so the model holds no floor/cap pair on the cross axis to
    compare and this law would be guessing. That is the same "honest
    silence over a confident wrong answer" corner L10's non-px-`min` skip
    already occupies — named here, not hidden. It also means the law's
    reach today is the control-panel tab bodies, which is precisely where
    the round-1 review measured the surplus.

    Realization-binding, not solver-visible: `compiler.py` never reads
    `elastic_axes`; what the declaration changes is which claimant the
    realization's own CSS hands the residual to
    (`useLytOverflowCss.leafElasticStyle` publishes it, the occupant's own
    cap reads it). Same footing `ceiling`/L9 and `unit`/L10 have.

    M2 PORT DISCLOSURE [corrected 2026-08-12, M2 stage B2a, ledger rows
    2108/2331]: this function is fully ported and correct, exercised
    directly by its own tests (see `tests/test_loop_laws.py`), and IS
    included in `check_wellformed`'s enforced `all_violations` list as of
    stage B2a -- `CP-library`/`CP-cards` now carry `elastic h` (the
    horizontal disposition: a browse table's width reflows into whatever
    it is granted, never scrolls sideways) alongside their pre-existing
    `scroll v`, so this function returns `[]` against both committed
    reference encodings (verified directly). See `check_wellformed`'s own
    M2 PORT DISCLOSURE paragraph for the wiring, and `.claude/
    dispatch-reports/lyt-m2-b2a-encoding-compliance.md` for the encoding
    edits and their L16 cascade consequence (`elastic h` + `scroll v` over
    `unbounded` content newly obliges `floor v`, ALREADY wired since
    Amendment 8 -- closed in the same edit).
    """
    violations: List[Tuple[str, str, str]] = []

    def walk(slot: ast.Slot, spath: str, both_axes: bool) -> None:
        node = slot.node
        # AMENDMENT 10 (ledger rows 2447/2450): `slot.content`, not
        # `node.content` — see `_subtree_has_designed_leaf`'s own
        # Amendment 10 note for the full relocation disclosure.
        if isinstance(node, ast.Leaf) and both_axes and slot.content == "unbounded":
            for axis in ("h", "v"):
                if axis in slot.scroll_axes:
                    continue
                if axis in node.elastic_axes:
                    continue
                if not _can_exceed_its_floor(slot.sizing, axis):
                    continue
                violations.append((
                    "L13",
                    spath,
                    f"{spath}: L13 surplus-attribution violation — leaf "
                    f"'{node.widget}' declares `content unbounded` and its "
                    f"reservation can be granted more than its floor along "
                    f"the {axis!r} axis, but names no disposition for that "
                    "axis: no `scroll` (content exceeds it), no `elastic` "
                    "(the occupant claims it), and no pinned floor==cap (no "
                    "surplus arises). The residual therefore belongs to "
                    "nobody and is painted as bare background — the "
                    "standing-cost defect this language exists to forbid, "
                    "arriving from the opposite side of the same question "
                    "`ceiling`/L9 answers for bounded content (LOOP "
                    "ITERATION 9 / ARC 4 ROUND 2, ledger rows "
                    "2037/2066/2107/2157/2209)",
                ))
        if isinstance(node, ast.Split):
            for i, child in enumerate(node.children):
                walk(child, f"{spath}/{node.axis.upper()}{i}", False)
        elif isinstance(node, ast.Exclusive):
            for i, child in enumerate(node.children):
                walk(child, f"{spath}/T{i}", True)

    walk(root, path, True)
    return violations


def find_l14_violations(root: ast.Slot, *, path: str = "root") -> List[Tuple[str, str, str]]:
    """LOOP ITERATION 10 / ARC 4 ROUND 3 (model-iteration loop EXPERIMENT,
    ledger rows 2037/2066/2107/2157/2229; branch lyt-model-loop-experiment,
    NOT merged without ratification) -- L14, demand attribution. Returns one
    `(law, path, message)` triple per violation, the same shape every other
    structural checker in this module returns, arbitrated through the same
    `(law, path)`-keyed waiver mechanism.

    THE LAW. A leaf that declares `scroll` on BOTH of its axes is not
    rendering a strip or a reflowing paragraph; it is drawing a
    TWO-DIMENSIONAL STRUCTURE, one that can outgrow its rectangle in either
    direction independently. For such a leaf the extent on either axis is a
    property OF THE STRUCTURE -- how wide the widest branch is, how deep the
    deepest one -- and never a constant. So a two-dimensionally scrollable
    leaf whose own declaration PINS its partition axis (floor == cap) has
    asserted a fixed extent for a quantity nothing measured: at best it is
    the structure's current demand, restated where it will go stale; at
    worst -- and this is the observed case that mints the law -- it is a
    round multiple of the leaf's own declared `unit`, i.e. "n lanes",
    reserved permanently for a structure that is presently one lane wide,
    with the difference standing as dead band for the entire length of the
    other axis.

    The remedy the law asks for is one word, and the language already had
    the word for the ONE-dimensional case: `ceiling <axis>` (L14's own
    load-time half, `loader._load_ceiling_axes`). Declaring it says the pin
    is a BOUND -- the structure takes its demand, gives the rest back, and
    the `scroll` this leaf already declares on that axis owns anything past
    the bound. A pin with a ceiling is a reservation; a pin without one is
    an assertion.

    SCOPE, DELIBERATE AND DISCLOSED -- and note it is the COMPLEMENT of
    L12/L13's. Those two fire only where a slot's declaration binds BOTH
    axes at once (the root, a T-child). This one fires only where it binds
    exactly ONE -- a Split child, where the declared extent is unambiguously
    about the parent's partition axis and the pin is therefore a real,
    checkable floor==cap pair on a known axis. At the root and at a T-child
    the same declaration is read on both axes at once and "which axis is
    pinned" is not a question this walk could answer without guessing, so it
    stays silent there: the same "honest silence over a confident wrong
    answer" corner L10's non-px-`min` skip and L13's own scope note already
    occupy.

    It is dormant for every leaf that does not declare scroll on both axes
    -- a one-axis scroller (a strip, a reflowing pane) is exactly the shape
    whose cross extent IS honestly a constant, and this law says nothing
    about it.

    Realization-binding, not solver-visible: `compiler.py` never reads
    `ceiling_axes`. The pin is what the solve reserves and what any
    board-priority sibling sum plans for, unchanged; what the declaration
    changes is whether the realization's own track hands the unused part
    back. Same footing `ceiling`/L9, `unit`/L10, `measure-bound`/L11 and
    `elastic`/L13 all have.
    """
    violations: List[Tuple[str, str, str]] = []

    def pinned_on(sizing: ast.Sizing) -> bool:
        lo, hi = sizing.min, sizing.max
        if hi == "inf":
            return False
        if not isinstance(lo, ast.Extent) or not isinstance(hi, ast.Extent):
            return False
        if lo.unit != hi.unit:
            return False
        return lo.v == hi.v

    def walk(slot: ast.Slot, spath: str, parent_axis: Optional[str]) -> None:
        node = slot.node
        if (
            isinstance(node, ast.Leaf)
            and parent_axis is not None
            and {"h", "v"} <= set(slot.scroll_axes)
            and parent_axis not in node.ceiling_axes
            and pinned_on(slot.sizing)
        ):
            units = dict(node.unit_axes)
            unit_note = (
                f" (its own declared unit on that axis is {units[parent_axis]:g}px, so the "
                f"pin reads as a constant multiple of it)"
                if parent_axis in units
                else ""
            )
            violations.append((
                "L14",
                spath,
                f"{spath}: L14 demand-attribution violation -- leaf "
                f"'{node.widget}' declares `scroll h` AND `scroll v`, so it "
                "draws a two-dimensional structure whose extent on either "
                "axis is a property of that structure; but its own "
                f"reservation on the {parent_axis!r} axis its parent "
                "partitions is PINNED (floor == cap) with no `ceiling "
                f"{parent_axis}` to say the pin is a BOUND{unit_note}. A pin "
                "without a ceiling asserts a fixed extent for a quantity "
                "nothing measured, and the difference between it and the "
                "structure's real demand stands as dead band for the whole "
                "length of the other axis (LOOP ITERATION 10 / ARC 4 ROUND "
                "3, ledger rows 2037/2066/2107/2157/2229)",
            ))
        if isinstance(node, ast.Split):
            for i, child in enumerate(node.children):
                walk(child, f"{spath}/{node.axis.upper()}{i}", node.axis)
        elif isinstance(node, ast.Exclusive):
            for i, child in enumerate(node.children):
                walk(child, f"{spath}/T{i}", None)

    walk(root, path, None)
    return violations


def find_l15_violations(root: ast.Slot, *, path: str = "root") -> List[Tuple[str, str, str]]:
    """LOOP ITERATION 11 / ARC 4 ROUND 4 (model-iteration loop EXPERIMENT,
    ledger rows 2037/2066/2107/2157/2241; branch lyt-model-loop-experiment,
    NOT merged without ratification) -- L15, demotion attribution. Returns
    one `(law, path, message)` triple per violation, the same shape every
    other structural checker here returns, arbitrated through the same
    `(law, path)`-keyed waiver mechanism.

    THE LAW, in three clauses that are one idea: a band under pressure must
    know which of its members it may shed, and the model must not be able
    to answer that question by accident.

      (a) `wrap` OBLIGES AN ACTIVITY ANSWER. A LEAF that declares `wrap
          <policy>` has admitted, in its own bag, that its vocabulary may
          not stand in one row. `wrap` then decides where the break BETWEEN
          units falls (iteration 6's own ruling) -- but it takes for
          granted that breaking is what happens, and that is the
          assumption this round's review named: "wrapping is the fallback
          the model should reach for LAST; right now it is the only thing
          it does." The moment a leaf admits its vocabulary may need more
          than one row, "may this content leave instead" is a question the
          model has to have an answer to, and `activity` is the answer.
          Either level is a fine answer; SILENCE is not. (An Exclusive may
          declare `wrap` without an `activity` -- its units are its own
          declared children, each of which is a leaf that answers for
          itself, exactly the reasoning `_load_unit_axes` uses to refuse
          `unit` on a container.)

      (b) A RANKING IS A BAND-WIDE FACT. Within one Split, if ANY direct
          LEAF child declares `activity`, EVERY direct leaf child must.
          "Which member leaves first" has no answer for the members that
          never entered the ranking, and a band that can shed some of its
          contents on a partial ordering will shed whichever one happens to
          be declared -- the same unambiguous-owner reasoning L5b applies
          to scroll ownership and L13 to surplus.

      (c) A BAND MAY NOT BE ENTIRELY DEMOTABLE. A Split every one of whose
          children is a leaf declaring `@demote` can vacate completely, and
          a band that can vacate completely is a PRESENCE SLOT -- for which
          `@toggle(user, release)` is already this language's word (loop
          iteration 4's own `A_setup` finding). Two mechanisms for one fact
          is the duplication ADR-0012 P1 forbids, and the presence spelling
          is the one that says what is actually true.

    SCOPE, DISCLOSED. This walk is about SPLIT BANDS. It says nothing about
    a T-node's children (alternatives, one on screen at a time -- there is
    no band for them to crowd), and nothing about the root (which has no
    siblings to shed for). Clause (a) alone is leaf-local rather than
    band-local, and fires wherever a wrapping leaf stands.

    Solver-inert, like L9/L10/L11/L13/L14: `compiler.py` never reads
    `activity`, and the demotion presence reaches the solve only through
    `presence.prune_absent`, which is the SAME path `@toggle(user,
    release)` already took -- a demoted valuation is a separate solve, not
    a modified one.
    """
    violations: List[Tuple[str, str, str]] = []

    def walk(slot: ast.Slot, spath: str) -> None:
        node = slot.node
        # (a) leaf-local: a wrapping leaf must have ranked itself.
        if isinstance(node, ast.Leaf) and slot.wrap_policy is not None and node.activity is None:
            violations.append((
                "L15",
                spath,
                f"{spath}: L15 demotion-attribution violation -- leaf "
                f"'{node.widget}' declares `wrap {slot.wrap_policy}`, which "
                "admits its own vocabulary may not stand in one row, but "
                "declares no `activity`. A model that can only ever answer "
                "width pressure by wrapping pays for every member of a band "
                "at the same rate regardless of what that member is worth "
                "to the task; declaring `activity sustained` (the rows are "
                "earned) or `activity occasional` (this content may leave "
                "for the overlay stratum instead) is the answer, and "
                "silence is not one (LOOP ITERATION 11 / ARC 4 ROUND 4, "
                "ledger rows 2037/2066/2107/2157/2241)",
            ))
        if isinstance(node, ast.Split):
            leaf_children = [
                (i, c) for i, c in enumerate(node.children) if isinstance(c.node, ast.Leaf)
            ]
            # (b) a partial ranking within one band.
            ranked = [(i, c) for i, c in leaf_children if c.node.activity is not None]
            if ranked and len(ranked) != len(leaf_children):
                unranked = [
                    c.node.widget for i, c in leaf_children if c.node.activity is None
                ]
                violations.append((
                    "L15",
                    spath,
                    f"{spath}: L15 demotion-attribution violation -- this "
                    f"band ranks {len(ranked)} of its {len(leaf_children)} "
                    "leaf children by `activity` and leaves "
                    f"{sorted(unranked)} unranked. A ranking is a fact about "
                    "a BAND, not about one member of it: with a partial "
                    "order, 'which member leaves first under pressure' has "
                    "no answer for the members that never entered it, and "
                    "the band sheds whichever one happens to be declared "
                    "(LOOP ITERATION 11 / ARC 4 ROUND 4, ledger rows "
                    "2037/2066/2107/2157/2241)",
                ))
            # (c) a band that can vacate entirely.
            if (
                node.children
                and len(leaf_children) == len(node.children)
                and all(c.presence.kind == "demote" for _, c in leaf_children)
            ):
                violations.append((
                    "L15",
                    spath,
                    f"{spath}: L15 demotion-attribution violation -- every "
                    f"one of this band's {len(node.children)} children "
                    "declares `@demote`, so the band can vacate completely. "
                    "A band that can vacate completely is a PRESENCE SLOT, "
                    "and `@toggle(user, release)` is already this "
                    "language's word for one — declaring the same fact "
                    "twice, in two mechanisms, is the duplication the "
                    "derive-don't-duplicate discipline forbids (LOOP "
                    "ITERATION 11 / ARC 4 ROUND 4, ledger rows "
                    "2037/2066/2107/2157/2241)",
                ))
            for i, child in enumerate(node.children):
                walk(child, f"{spath}/{node.axis.upper()}{i}")
        elif isinstance(node, ast.Exclusive):
            for i, child in enumerate(node.children):
                walk(child, f"{spath}/T{i}")

    walk(root, path)
    return violations


def find_l16_violations(root: ast.Slot, *, path: str = "root") -> List[Tuple[str, str, str]]:
    """LOOP ITERATION 12 / ARC 4 ROUND 5 (model-iteration loop EXPERIMENT,
    ledger rows 2037/2066/2107/2157/2268-2271; branch
    lyt-model-loop-experiment, NOT merged without ratification) -- L16,
    deficit attribution. Returns one `(law, path, message)` triple per
    violation, the same shape every other structural checker here returns,
    arbitrated through the same `(law, path)`-keyed waiver mechanism.

    THE LAW, in three clauses that are one idea: a leaf that has reasoned
    about having too MUCH room must also have reasoned about having too
    LITTLE, and the answer must be one it can actually keep.

      (a) THE TRIGGER -- A LEAF THAT DISPOSED OF SURPLUS AND EXCESS BUT
          NEVER OF DEFICIT. A leaf declaring `content unbounded` plus
          `elastic <a>` (L13: "the occupant claims the room I did not
          need") plus `scroll <b>` (L5a: "this owner takes the content I
          could not hold") has answered, in its own bag, both of the
          questions a rectangle can be asked when it is TOO BIG for its
          content or its content too big for IT. It has said nothing about
          the third: how little room makes its own vocabulary unreadable.
          The two it answered can only ever waste space. The one it did not
          is the only one whose consequence is a control cut through its own
          glyph row -- measured live at 540x960, the Decks form is granted
          26px of a 257px demand, its deck combobox bisected, with the
          solve reporting OPTIMAL over it. `floor <b> <px>` is the answer,
          declared on the axis the leaf scrolls, because that is the axis
          on which "granted less than I need" is a state this leaf has
          already admitted it can be in.

      (b) THE JOIN TO L15 -- RESERVE IT OR LEAVE. A declared floor is not a
          wish: a leaf that names one must either RESERVE it (its own
          floor position on that axis, `min <axis>` where declared and the
          axis-agnostic `min` where that binds -- `Sizing.axis_min`) or be
          able to LEAVE (`@demote`, L15's fourth presence kind, which
          releases the whole extent to its siblings and re-hosts the
          content in the overlay stratum). Those are the only two honest
          dispositions. A leaf that can do NEITHER is one the solve may
          grant 26px and still call OPTIMAL, which is exactly the state
          this law exists to make unrepresentable -- and note this is what
          gives a band a SECOND recourse: L15 alone left a band with one
          demotable member and nothing after it, while a floor makes the
          cost of the next slice VISIBLE TO THE SOLVE instead of deferred
          to whatever the realization happens to clip.

      (c) A FLOOR MUST BE REACHABLE. If the leaf's own declared cap on the
          floored axis is a CONSTANT smaller than the floor, the bag holds
          two facts that cannot both be true: a reservation that may never
          grow that big, and a content unusable below it. A non-constant
          cap (`inf`, or an `fr` share) is not comparable and is passed
          over in honest silence, the same disposition `_can_exceed_its_
          floor` takes.

    SCOPE, DISCLOSED. Clause (a) fires only on a leaf that declares BOTH
    `elastic` and `scroll` over `unbounded` content -- deliberately narrow.
    A one-axis scroller with no elastic claim (`settingsPane`, `otherBand`,
    `boardRail`) has never asserted that it reasoned about its residual, so
    this law does not put words in its mouth; a `bounded` leaf's smallest
    form is its demand, which `ceiling`/L14 already governs; and `designed`
    content is L5c's hard reservation. Run against either reference
    encoding as it stood at iteration 11's HEAD, clause (a) fires at
    exactly the two sites round 5's review named -- `CP-library` and
    `CP-cards` -- and nowhere else. Both silences are pinned by their own
    tests rather than left implied.

    Solver-inert in the same sense L9-L15 are: `compiler.py` never reads
    `floor_axes`. What is NOT inert is the reservation clause (b) obliges
    a leaf to carry, which is an ordinary `min` the solver has always read.
    """
    violations: List[Tuple[str, str, str]] = []

    def walk(slot: ast.Slot, spath: str) -> None:
        node = slot.node
        if isinstance(node, ast.Leaf):
            floors = dict(node.floor_axes)
            # (a) the trigger. AMENDMENT 10 (ledger rows 2447/2450):
            # `slot.content`, not `node.content` — see
            # `_subtree_has_designed_leaf`'s own Amendment 10 note for the
            # full relocation disclosure.
            if (
                slot.content == "unbounded"
                and node.elastic_axes
                and slot.scroll_axes
            ):
                for axis in sorted(slot.scroll_axes):
                    if axis in floors:
                        continue
                    violations.append((
                        "L16",
                        spath,
                        f"{spath}: L16 deficit-attribution violation -- leaf "
                        f"'{node.widget}' declares `content unbounded`, "
                        f"`elastic {sorted(node.elastic_axes)[0]}` and "
                        f"`scroll {axis}`, so it has an owner for the room it "
                        "does not need and an owner for the content it cannot "
                        f"hold, but declares no `floor {axis}`: nothing says "
                        "how little room along that axis makes this leaf's own "
                        "vocabulary unreadable. The two facts it declared can "
                        "only ever waste space; the one it did not is the one "
                        "whose consequence is a control CUT THROUGH its own "
                        "glyph row while the solve reports OPTIMAL over it. "
                        "Measure the leaf's own smallest whole form and "
                        "declare it (LOOP ITERATION 12 / ARC 4 ROUND 5, "
                        "ledger rows 2037/2066/2107/2157/2268-2271)",
                    ))
            for axis in sorted(floors):
                floor = floors[axis]
                # (b) reserve it or leave.
                reserved = slot.sizing.axis_min(axis)
                can_reserve = (
                    isinstance(reserved, ast.Extent)
                    and reserved.unit == floor.unit
                    and reserved.v >= floor.v
                )
                can_leave = slot.presence.kind == "demote"
                if not can_reserve and not can_leave:
                    shown = (
                        f"{reserved.v:g}{reserved.unit}"
                        if isinstance(reserved, ast.Extent)
                        else str(reserved)
                    )
                    violations.append((
                        "L16",
                        spath,
                        f"{spath}: L16 deficit-attribution violation -- leaf "
                        f"'{node.widget}' declares `floor {axis} "
                        f"{floor.v:g}{floor.unit}` but neither RESERVES it "
                        f"(its own floor on {axis} is {shown}) nor may LEAVE "
                        "(no `@demote`). A floor is not a wish: a leaf that "
                        "names the extent below which it is unusable has "
                        "exactly two honest dispositions -- stand its ground "
                        "in the partition, or vacate the band for the overlay "
                        "stratum L15 gave it. A leaf that can do neither is "
                        "one the solve may grant a fraction of its floor and "
                        "still call OPTIMAL, and an optimum over a sliced "
                        "control is the verdict this law exists to make "
                        "unreachable (LOOP ITERATION 12 / ARC 4 ROUND 5, "
                        "ledger rows 2037/2066/2107/2157/2268-2271)",
                    ))
                # (c) reachable within the leaf's own cap.
                cap = slot.sizing.max
                if (
                    isinstance(cap, ast.Extent)
                    and cap.unit == floor.unit
                    and cap.v < floor.v
                ):
                    violations.append((
                        "L16",
                        spath,
                        f"{spath}: L16 deficit-attribution violation -- leaf "
                        f"'{node.widget}' declares `floor {axis} "
                        f"{floor.v:g}{floor.unit}` above its own cap "
                        f"({cap.v:g}{cap.unit}), so the reservation may never "
                        "grow to the extent the content is declared unusable "
                        "below. That is not a tension for the solver to "
                        "arbitrate; it is two facts in one bag that cannot "
                        "both hold (LOOP ITERATION 12 / ARC 4 ROUND 5, ledger "
                        "rows 2037/2066/2107/2157/2268-2271)",
                    ))
        if isinstance(node, ast.Split):
            for i, child in enumerate(node.children):
                walk(child, f"{spath}/{node.axis.upper()}{i}")
        elif isinstance(node, ast.Exclusive):
            for i, child in enumerate(node.children):
                walk(child, f"{spath}/T{i}")

    walk(root, path)
    return violations


def find_l17_violations(root: ast.Slot, *, path: str = "root") -> List[Tuple[str, str, str]]:
    """LOOP ITERATION 13 / ARC 4 ROUND 6 (model-iteration loop EXPERIMENT,
    ledger rows 2037/2066/2107/2157/2286; branch lyt-model-loop-experiment,
    NOT merged without ratification) -- L17, edge attribution. Returns one
    `(law, path, message)` triple per violation, the same shape every other
    structural checker here returns, arbitrated through the same
    `(law, path)`-keyed waiver mechanism.

    THE LAW, in three clauses that are one idea: a scroll is a promise that
    content continues past a BOUNDARY, and the leaf that made the promise
    owes an account of what the boundary falls on.

      (a) THE TRIGGER -- A LEAF THAT DECLARED A SCROLL AND NOTHING ABOUT ITS
          EDGE. Every key this language has minted reasons about an AREA:
          `scroll <a>` names who owns content the rectangle could not hold
          (L5a), `elastic` disposes of room the occupant did not need (L13),
          `ceiling` hands a finite surplus back (L14), `floor` refuses a
          rectangle too small for the leaf's whole vocabulary (L16). A leaf
          can satisfy every one of them and still show a row bisected
          through its own glyph rows, because a cut does not happen in the
          area -- it happens at the boundary the scroll itself created, and
          no key was about the boundary. So: a leaf declaring `content
          unbounded` and `scroll <a>` owes an `edge <a>`. Deliberately
          WIDER than L16's trigger, which required an `elastic` claim
          first: a floor is a fact about a leaf's own vocabulary and only
          a leaf that reasoned about its residual was obliged to have one,
          while an edge is created by the scroll itself. Every scroller in
          the app has one whether or not it has thought about it, and that
          is the point.

      (b) AN EDGE IS ONLY WHERE A SCROLL IS. An `edge <a>` on an axis this
          slot does not declare `scroll <a>` on is a fact about nothing:
          without a scroll there is no boundary between shown and unshown
          content, only the partition, and the partition is the parent's.
          This is the converse of (a) and is checked here rather than at
          load time because `scroll` is a `Slot`-level fact resolved
          separately from the leaf's own bag.

      (c) THE JOIN TO L13 -- A PLACEABLE EDGE AND AN ELASTIC CLAIM ON THE
          SAME AXIS ARE TWO FACTS IN ONE BAG. `edge <a> unit` says the
          sub-unit remainder along `a` is GIVEN BACK so the boundary can
          fall between two items; `elastic <a>` (L13) says the occupant
          CLAIMS every pixel of residual along `a`. They dispose of the
          same pixels in opposite directions, and no solver arbitration
          can make both true.

    WHAT THE DISPOSITIONS OBLIGE, stated here because it is the law's
    content and not merely its realization: a `unit` edge is QUANTIZED
    (the leaf's viewport along that axis takes a whole number of its own
    L10 units, and the remainder is left rather than painted through); an
    `item` edge is ANNOUNCED (a standing lane across from the boundary
    says the content continues, so a partial item at the edge reads as
    "more below" rather than as a slice) -- and note the honest limit
    this vocabulary is drawing: with a fixed viewport over variable-pitch
    content, NO placement of the boundary is between items, so `item` is
    the language admitting a cut it cannot remove and requiring that the
    cut not LIE; a `continuous` edge owes neither.

    SCOPE, DISCLOSED. Clause (a) is silent for `bounded` and `designed`
    content: a bounded leaf's content fits by construction (L14 governs
    its demand) and `designed` content is L5c's hard reservation, so
    neither creates a boundary that could cut. Run against either
    reference encoding as it stood at iteration 12's HEAD, clause (a)
    fires at six leaves and seven axes per class -- `boardRail`, `tree`
    (both axes), `CP-library`, `CP-cards`, `settingsPane`, `otherBand` --
    i.e. at EVERY scroller in the app, which is the breadth round 6's
    review asked for over another leaf-local reservation. Clauses (b) and
    (c) fire nowhere on the encodings and are pinned by their own tests.

    Solver-inert in the same sense L9-L16 are: `compiler.py` never reads
    `edge_axes`, and unlike L16 this law obliges no reservation either --
    what it changes is what the realization is allowed to do at a boundary
    the solve had already placed.

    M2 PORT DISCLOSURE [corrected 2026-08-12, M2 stage B2a, ledger rows
    2108/2331]: this function is fully ported and correct, exercised
    directly by its own tests (see `tests/test_loop_laws.py`), and IS
    included in `check_wellformed`'s enforced `all_violations` list as of
    stage B2a -- `CP-library`/`CP-cards`/`settingsPane`/`otherBand` (the
    four leaves that genuinely trip this law's trigger on mainline's own
    committed encodings; `boardRail`/`tree` never did -- neither leaf
    declares `content`/`scroll` in either file, a correction to this
    paragraph's own earlier text, which named them as violating sites
    without independently re-verifying against mainline's own committed
    tree) now each carry an `edge v <disposition>` reasoned from that
    leaf's own content nature (`item` for the two browse tables and the
    settings placeholder's own registry-shaped sub-tabs; `continuous` for
    the freeform-JSON/registry editor), so this function returns `[]`
    against both committed reference encodings (verified directly). See
    `check_wellformed`'s own M2 PORT DISCLOSURE paragraph for the wiring.
    """
    violations: List[Tuple[str, str, str]] = []

    def walk(slot: ast.Slot, spath: str) -> None:
        node = slot.node
        if isinstance(node, ast.Leaf):
            edges = dict(node.edge_axes)
            # (a) the trigger. AMENDMENT 10 (ledger rows 2447/2450):
            # `slot.content`, not `node.content` — see
            # `_subtree_has_designed_leaf`'s own Amendment 10 note for the
            # full relocation disclosure.
            if slot.content == "unbounded":
                for axis in sorted(slot.scroll_axes):
                    if axis in edges:
                        continue
                    violations.append((
                        "L17",
                        spath,
                        f"{spath}: L17 edge-attribution violation -- leaf "
                        f"'{node.widget}' declares `content unbounded` and "
                        f"`scroll {axis}`, so it has promised that its "
                        "content continues past a BOUNDARY on that axis, but "
                        f"declares no `edge {axis}`: nothing says what that "
                        "boundary falls on. Every other key this leaf may "
                        "carry is about its AREA -- who owns the surplus "
                        "(`elastic`), who owns the excess (`scroll`), how "
                        "little is too little (`floor`) -- and a leaf can "
                        "satisfy all of them while cutting a row in half, "
                        "because the cut happens at the edge the scroll "
                        "itself created. Say whether that edge falls on a "
                        "constant-pitch sequence (`unit`, which quantizes "
                        "it), on indivisible things of no constant pitch "
                        "(`item`, which announces it), or on nothing "
                        "indivisible (`continuous`) (LOOP ITERATION 13 / ARC "
                        "4 ROUND 6, ledger rows 2037/2066/2107/2157/2286)",
                    ))
            for axis in sorted(edges):
                disposition = edges[axis]
                # (b) an edge is only where a scroll is.
                if axis not in slot.scroll_axes:
                    violations.append((
                        "L17",
                        spath,
                        f"{spath}: L17 edge-attribution violation -- leaf "
                        f"'{node.widget}' declares `edge {axis} "
                        f"{disposition}` on an axis it does not `scroll "
                        f"{axis}`. Without a scroll there is no boundary "
                        "between shown and unshown content on that axis, "
                        "only the parent's partition -- and where the "
                        "partition falls is not this leaf's fact to state "
                        "(LOOP ITERATION 13 / ARC 4 ROUND 6, ledger rows "
                        "2037/2066/2107/2157/2286)",
                    ))
                # (c) the join to L13.
                if disposition == "unit" and axis in node.elastic_axes:
                    violations.append((
                        "L17",
                        spath,
                        f"{spath}: L17 edge-attribution violation -- leaf "
                        f"'{node.widget}' declares both `edge {axis} unit` "
                        f"and `elastic {axis}`. The first gives the "
                        "sub-unit remainder BACK so the boundary can fall "
                        "between two items; the second claims every pixel "
                        "of residual for the occupant. They dispose of the "
                        "same pixels in opposite directions, which is not a "
                        "tension for the solver to arbitrate but two facts "
                        "in one bag that cannot both hold (LOOP ITERATION "
                        "13 / ARC 4 ROUND 6, ledger rows "
                        "2037/2066/2107/2157/2286)",
                    ))
        if isinstance(node, ast.Split):
            for i, child in enumerate(node.children):
                walk(child, f"{spath}/{node.axis.upper()}{i}")
        elif isinstance(node, ast.Exclusive):
            for i, child in enumerate(node.children):
                walk(child, f"{spath}/T{i}")

    walk(root, path)
    return violations


def find_residual_child(node: ast.Slot) -> Optional[ast.Slot]:
    """AMENDMENT 9 (ledger row 2310, derived orientation). Given a Split's
    own `Slot`, structurally identify its UNIQUE residual-holding direct
    child, if one exists — the one child whose own `pref` is `fr`-typed
    (`ast.Extent(unit='fr', ...)`), i.e. the child that ABSORBS whatever
    the OTHER children's declared extents (plus gaps) leave over, per the
    partition equality (SPEC.md §2). Returns `None` when the Split has no
    `fr`-pref child at all, or MORE than one — an ambiguous split (two or
    more elastic siblings competing for the same residual) has no single
    child that "the residual" can be said to belong to, so neither is
    treated as residual-holding (disclosed choice: this is a silent
    non-applicability, not a refusal — the ruling names a single,
    unambiguous residual holder, and this prototype does not invent an
    ordering rule to break a tie the ruling never adjudicated).

    Applies to `ast.Split` nodes only — an `ast.Exclusive` node's children
    each receive the WHOLE rectangle (§2), so there is no partition
    residual between them to attribute (the same scoping `gap`/
    `measure-bound`'s own T-node refusals already use).
    """
    if not isinstance(node.node, ast.Split):
        return None
    fr_children = [
        c for c in node.node.children
        if isinstance(c.sizing.pref, ast.Extent) and c.sizing.pref.unit == "fr"
    ]
    if len(fr_children) != 1:
        return None
    return fr_children[0]


def find_residual_leaves(root: ast.Slot, *, path: str = "root") -> Dict[str, str]:
    """AMENDMENT 9 (ledger row 2310). Walks the whole tree and returns a
    `widget id -> tree path` map, one entry per LEAF that is the unique
    residual-holding child (`find_residual_child`) of its own immediate
    Split parent. A Split/Exclusive residual child (not a leaf) contributes
    no entry — `orient`/the L14 role frame are leaf-only facts (SPEC.md
    §16.1), so there is nothing to derive for a residual holder that is
    itself a container.

    Shared by `find_l18_violations` below (the load-time refusal) and
    `orientation.py`'s own `compute_derived_orientations` (the post-solve
    derivation) — ONE structural definition of "residual-holding", not two
    independently-maintained ones.
    """
    out: Dict[str, str] = {}

    def walk(slot: ast.Slot, spath: str) -> None:
        node = slot.node
        if isinstance(node, ast.Split):
            residual = find_residual_child(slot)
            for i, child in enumerate(node.children):
                cpath = f"{spath}/{node.axis.upper()}{i}"
                if child is residual and isinstance(child.node, ast.Leaf):
                    out[child.node.widget] = cpath
                walk(child, cpath)
        elif isinstance(node, ast.Exclusive):
            for i, child in enumerate(node.children):
                walk(child, f"{spath}/T{i}")

    walk(root, path)
    return out


def find_l18_violations(root: ast.Slot, *, path: str = "root") -> List[Tuple[str, str, str]]:
    """AMENDMENT 9 (ledger row 2310) — L18, derived-orientation authorship.
    Returns one `(law, path, message)` triple per violation, the same
    shape every other structural checker here returns, arbitrated through
    the same `(law, path)`-keyed waiver mechanism.

    THE RULING (commissioner-ratified, ledger row 2310): a leaf's mount
    orientation is DERIVED from the aspect of its own residual slot (the
    box left over after its Split siblings are placed — `find_residual_
    child` above), not authored, whenever that leaf genuinely IS its
    Split's unique residual-holding child. `orient` remains a legal,
    authored OVERRIDE everywhere else (a non-residual placement, per the
    ruling's own sub-ruling (a)) — this law fires ONLY at the specific
    residual-holding leaf, never at a sibling.

    THE LAW. A leaf that is (a) the unique residual-holding child of its
    Split parent (`find_residual_child` returns it) AND (b) has
    `orientation_declared == True` (the author wrote `orient`, whatever
    physical axis it named) is a violation: the encoding is DECLARING a
    fact the model DERIVES, which is exactly the "an authored `orient` on
    a residual-holding leaf is a wellformedness REFUSAL" sub-ruling states,
    verbatim. This is a genuine STRUCTURAL law (not a load-time,
    single-node check) because "is this leaf residual-holding" is a fact
    about its SIBLINGS, which only a tree walk with parent context can see
    — the same reason L2's dominance test and L12's both-axes-position
    gate live here rather than in loader.py.

    Dormancy: fires only where a leaf is genuinely both residual-holding
    AND authors `orient`. Neither reference encoding declares `orient`
    anywhere (Amendment 8's own dormancy note), so this law returns `[]`
    unconditionally against both — but the STRUCTURAL half is NOT
    dormant, disclosed rather than silently assumed: both
    `lengyue_landscape.lyt`/`lengyue_portrait.lyt` DO carry genuine
    residual-holding leaves today (`B`, via the `pref maximize` sugar
    that resolves to elastic `pref 1fr`; `settingsPane`/`otherBand`, both
    explicit `pref 1fr` — three per class, `find_residual_leaves` finds
    them directly). None of the three happens to author `orient`, which
    is the only reason this law is silent — the same "laws bind
    declarations, they do not retroactively indict silence" posture
    every prior amendment's dormancy note states, not a claim that the
    residual-holding STRUCTURE itself is absent. `tree` — the leaf the
    ruling's own illustrative language names — is the one genuinely
    non-residual-holding leaf of the three sites this law COULD apply to
    in the row it actually sits in (`H(tree, T(...), previewBoard)`):
    `tree` is fixed `min==pref==max` today, and `T(...)` (that row's own
    sole `pref: fr` child) is an Exclusive, not a Leaf, so it was never
    an eligible subject regardless — see this amendment's own dispatch
    report for the full disclosure and the STOP-and-report on what an
    encoding edit would need to change for that to hold.
    """
    violations: List[Tuple[str, str, str]] = []

    def walk(slot: ast.Slot, spath: str) -> None:
        node = slot.node
        if isinstance(node, ast.Split):
            residual = find_residual_child(slot)
            for i, child in enumerate(node.children):
                cpath = f"{spath}/{node.axis.upper()}{i}"
                if (
                    child is residual
                    and isinstance(child.node, ast.Leaf)
                    and child.node.orientation_declared
                ):
                    violations.append((
                        "L18",
                        cpath,
                        f"{cpath}: L18 derived-orientation violation -- leaf "
                        f"'{child.node.widget}' authors `orient` while also "
                        "being the unique residual-holding child of its own "
                        "Split parent (its `pref` is the split's sole "
                        "`fr`-typed child). Per the ruling (ledger row 2310), "
                        "a residual-holding leaf's orientation is DERIVED "
                        "from its solved residual box's aspect, never "
                        "authored -- an authored `orient` here is declaring "
                        "what the model derives. Remove the `orient` "
                        "declaration (or, if a fixed orientation is "
                        "genuinely wanted, make this leaf a non-residual "
                        "placement instead, where `orient` remains a legal "
                        "override).",
                    ))
                walk(child, cpath)
        elif isinstance(node, ast.Exclusive):
            for i, child in enumerate(node.children):
                walk(child, f"{spath}/T{i}")

    walk(root, path)
    return violations


def check_wellformed(
    root: ast.Slot, *, layout_name: str, waivers: Optional[List[Waiver]] = None
) -> List[Waiver]:
    """Runs the L2 dominance check, the AMENDMENT 5 L5/L5a/L5b/L5c walk
    (`find_l5_violations`), the AMENDMENT 7 L10 unit-integrity walk
    (`find_l10_violations`) AND the AMENDMENT 7 L11 measure-integrity
    walk (`find_l11_violations`), and arbitrates all of them against any declared
    `Waiver`s (see that dataclass's docstring for the full mechanism —
    this is the `--baseline` load-mode support the lyt-constants-swap
    commission asks for, generalized here to every law that gains a
    structural checker, exactly as `Waiver.law`'s own docstring already
    disclosed it would: "the field is open-ended, in case a future law
    gains a structural checker"). Returns the list of waivers actually
    APPLIED (a subset of `waivers`, in discovery order) so a caller (the
    runner, the emitter, a test) can report exactly what was let through
    and why, rather than the waiver list silently disappearing once it
    does its job.

    Two loud-refusal cases beyond the un-waived-violations case that
    already existed:
      - a declared waiver whose `(law, path)` matches no violation found
        THIS load ("stale waiver" — see `Waiver`'s docstring).
      - any remaining, un-waived violation.

    `detail.law` (singular) is populated, unchanged, when every
    remaining violation shares ONE law — every existing caller/test that
    asserts `detail["law"] == "L2"` (a fixture with ONLY L2 violations)
    sees byte-identical behavior. `detail.laws` (plural, a sorted list)
    is populated instead when a load trips more than one distinct law at
    once — a case no fixture reached before this amendment, since only
    L2 had a structural checker.

    M2 PORT DISCLOSURE [corrected 2026-08-12, M2 stage B2a encoding-
    compliance pass, ledger rows 2108/2331 -- the paragraph below replaces
    an earlier version that left L13/L17 unwired; that version is
    superseded, not deleted -- see SPEC-AMENDMENTS.md's own Amendment 8
    entry for the dated correction and `.claude/dispatch-reports/
    lyt-m2-b2a-encoding-compliance.md` for the encoding edits that made
    this wiring possible]: L12, L13, L14, L15, L16, and L17 ALL join this
    walk-and-arbitrate family. L12/L14/L15/L16 are genuinely dormant
    against mainline's own two reference encodings (each function's own
    docstring has the why). **L13 and L17 are not dormant -- they are
    SATISFIED**: stage B2a edited both `.lyt` encodings (`elastic h` +
    `floor v` on `CP-library`/`CP-cards` for L13; `edge v <disposition>`
    on `CP-library`/`CP-cards`/`settingsPane`/`otherBand` for L17,
    reasoned per leaf from its own content nature) so that both real
    encodings now load CLEAN under both laws (verified directly:
    `find_l13_violations`/`find_l17_violations` both return `[]` against
    both `lengyue_landscape.lyt`/`lengyue_portrait.lyt` as committed).
    `boardRail`/`tree` were never genuine L13/L17 sites on mainline's own
    committed encodings -- neither leaf declares `content`/`scroll` in
    either file, so neither ever tripped either law's trigger; the prior
    version of this docstring (and of SPEC-AMENDMENTS.md's Amendment 8
    entry) named them as violating sites, which was FALSE relative to
    mainline's actual committed content at the time it was written (that
    prose was inherited from the experiment branch's own differently-
    shaped encoding, never independently re-verified against mainline's
    own tree until this stage did so directly) -- corrected here, dated,
    per this file's own established "supersede honestly, do not delete"
    posture for a previously-shipped claim found wrong.
    """
    waivers = list(waivers or [])
    l2 = [("L2", v.split(":", 1)[0], v) for v in find_l2_violations(root)]
    l5 = find_l5_violations(root)
    # AMENDMENT 7 (ledger rows 2107/2108): L10 and L11 join the same
    # walk-and-arbitrate family, dormant by the same construction L5's
    # own dormancy paragraph names — L10 fires only at a leaf that
    # genuinely declares a `unit`, L11 only at a slot that genuinely
    # declares `measure-bound`, so a tree with neither anywhere (every
    # encoding as of this amendment) is unaffected.
    l10 = find_l10_violations(root)
    l11 = find_l11_violations(root)
    # LOOP ITERATION 8 / ARC 4 (ledger rows 2037/2066/2107/2157): L12 joins
    # the same walk-and-arbitrate family, dormant by the same construction —
    # it fires only at a slot that genuinely declares an axis-keyed `min`.
    l12 = find_l12_violations(root)
    # M2 STAGE B2a (ledger rows 2108/2331): L13 joins the walk-and-arbitrate
    # family. NOT dormant on either mainline encoding -- both `CP-library`/
    # `CP-cards` now carry `elastic h` + `floor v`, satisfying the law
    # (verified directly: `find_l13_violations([]))` against both committed
    # encodings) -- see this function's own M2 PORT DISCLOSURE paragraph
    # above and `find_l13_violations`'s own docstring.
    l13 = find_l13_violations(root)
    # LOOP ITERATION 10 / ARC 4 ROUND 3 (ledger row 2229): L14 joins the same
    # walk-and-arbitrate family. It is NOT dormant on a declaration of its
    # own key -- it fires at any Split-child leaf that scrolls on both axes
    # and pins its partition axis, whether or not that leaf ever mentions
    # `ceiling`, which is the point: the law exists to find the constant
    # standing where a measured demand belongs. Verified dormant against
    # both mainline reference encodings directly (neither has a leaf of
    # this shape today).
    l14 = find_l14_violations(root)
    # LOOP ITERATION 11 / ARC 4 ROUND 4 (ledger row 2241): L15 joins the same
    # walk-and-arbitrate family. It is NOT dormant on a declaration of its
    # own key -- clause (a) fires at any LEAF declaring `wrap` that has not
    # ranked itself, whether or not `activity` appears anywhere in the file.
    # Verified dormant against both mainline reference encodings directly.
    l15 = find_l15_violations(root)
    # LOOP ITERATION 12 / ARC 4 ROUND 5 (ledger row 2271): L16 joins the same
    # walk-and-arbitrate family. It is NOT dormant on a declaration of its
    # own key -- clause (a) fires at any unbounded leaf that declared both
    # an elastic claim and a scroll owner and never said how little room
    # makes it unusable. Verified dormant against both mainline reference
    # encodings directly (neither declares `elastic` today, since L13 is
    # not wired either -- see above).
    l16 = find_l16_violations(root)
    # M2 STAGE B2a (ledger rows 2108/2331): L17 joins the walk-and-arbitrate
    # family. NOT dormant on either mainline encoding -- `CP-library`/
    # `CP-cards`/`settingsPane`/`otherBand` now each carry an `edge v
    # <disposition>` reasoned from that leaf's own content nature (verified
    # directly: `find_l17_violations` returns `[]` against both committed
    # encodings) -- see this function's own M2 PORT DISCLOSURE paragraph
    # above and `find_l17_violations`'s own docstring.
    l17 = find_l17_violations(root)
    # AMENDMENT 9 (ledger row 2310): L18 joins the same walk-and-arbitrate
    # family. It fires only where a leaf is BOTH the unique residual-
    # holding child of its Split parent AND authors `orient`. Both real
    # encodings DO carry genuine residual-holding leaves (`B`/
    # `settingsPane`/`otherBand`, three per class) -- the structural half
    # is not dormant -- but none of them authors `orient`, so this returns
    # `[]` unconditionally against both today (see `find_l18_violations`'s
    # own docstring for the full disclosure).
    l18 = find_l18_violations(root)
    all_violations: List[Tuple[str, str, str]] = (
        l2 + l5 + l10 + l11 + l12 + l13 + l14 + l15 + l16 + l17 + l18
    )
    waiver_index: Dict[Tuple[str, str], Waiver] = {(w.law, w.path): w for w in waivers}
    applied: List[Waiver] = []
    remaining: List[Tuple[str, str, str]] = []
    matched_keys: set = set()
    for law, path, msg in all_violations:
        key = (law, path)
        w = waiver_index.get(key)
        if w is not None:
            applied.append(w)
            matched_keys.add(key)
        else:
            remaining.append((law, path, msg))
    stale = [w for k, w in waiver_index.items() if k not in matched_keys]
    if stale:
        raise LytLoadError(
            f"layout {layout_name!r} declares {len(stale)} waiver(s) that "
            "do not match any violation actually found on this load — "
            "a waiver must name a real, currently-present site "
            "(ADR-0002: a decorative waiver silencing nothing is refused "
            "loudly, not left in place)",
            {
                "layout": layout_name,
                "law": "waiver-integrity",
                "stale": [
                    {"law": w.law, "path": w.path, "citation": w.citation} for w in stale
                ],
            },
        )
    if remaining:
        laws_present = sorted({law for law, _, _ in remaining})
        detail: Dict[str, object] = {
            "layout": layout_name,
            "violations": [msg for _, _, msg in remaining],
        }
        if len(laws_present) == 1:
            detail["law"] = laws_present[0]
        else:
            detail["laws"] = laws_present
        raise LytLoadError(
            f"layout '{layout_name}' violates well-formedness at "
            f"{len(remaining)} site(s) not covered by a declared waiver "
            f"(law(s): {', '.join(laws_present)})",
            detail,
        )
    return applied
