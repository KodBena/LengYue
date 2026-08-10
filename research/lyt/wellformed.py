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
    L1/L2-non-conformant (`research/lyt/encodings/current_row_asis.lyt`).

    Per the commission's own instruction ("a waiver must name the law and
    the wiki/consult citation" — a documented per-law waiver annotation,
    not a global weakening of the checker), every field is mandatory and
    checked at construction:

      - `law`: which well-formedness law is being waived (currently only
        `"L2"` is checkable at all — see wellformed.py/loader.py's L1
        disclosure — so this is `"L2"` in practice, but the field is
        open-ended rather than hardcoded, in case a future law gains a
        structural checker).
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


def check_wellformed(
    root: ast.Slot, *, layout_name: str, waivers: Optional[List[Waiver]] = None
) -> List[Waiver]:
    """Runs the L2 dominance check and arbitrates it against any declared
    `Waiver`s (see that dataclass's docstring for the full mechanism —
    this is the `--baseline` load-mode support the lyt-constants-swap
    commission asks for). Returns the list of waivers actually APPLIED
    (a subset of `waivers`, in `l2`'s own discovery order) so a caller
    (the runner, the emitter, a test) can report exactly what was let
    through and why, rather than the waiver list silently disappearing
    once it does its job.

    Two loud-refusal cases beyond the un-waived-violations case that
    already existed:
      - a declared waiver whose `(law, path)` matches no violation found
        THIS load ("stale waiver" — see `Waiver`'s docstring).
      - any remaining, un-waived violation (unchanged from before this
        function grew a waiver parameter — the default `waivers=None`
        call shape is byte-identical in behavior to the pre-waiver
        version for every existing caller).
    """
    waivers = list(waivers or [])
    l2 = find_l2_violations(root)
    waiver_index: Dict[Tuple[str, str], Waiver] = {(w.law, w.path): w for w in waivers}
    applied: List[Waiver] = []
    remaining: List[str] = []
    matched_keys: set = set()
    for v in l2:
        path = v.split(":", 1)[0]
        key = ("L2", path)
        w = waiver_index.get(key)
        if w is not None:
            applied.append(w)
            matched_keys.add(key)
        else:
            remaining.append(v)
    stale = [w for k, w in waiver_index.items() if k not in matched_keys]
    if stale:
        raise LytLoadError(
            f"layout {layout_name!r} declares {len(stale)} waiver(s) that "
            "do not match any L2 violation actually found on this load — "
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
        raise LytLoadError(
            f"layout '{layout_name}' violates L2 (zero-standing-cost "
            f"affordances) at {len(remaining)} site(s) not covered by a "
            "declared waiver",
            {"layout": layout_name, "law": "L2", "violations": remaining},
        )
    return applied
