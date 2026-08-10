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

Disclosed interpretation (the document states this law in prose and calls
it "checked structurally", line 347, but does not give a formal check, and
its own two examples under-determine a naive reading — see build report for
the full reasoning). We implement:

    For every Split (H/V) node `n`, for every child slot `c` of `n`: if
    `c`'s node is a *bare* chrome/action Leaf (no wrapping Split/Exclusive
    around it), it is an L2 violation UNLESS at least one OTHER child of
    the SAME `n` is *also* a bare Leaf (not a composite) carrying
    non-chrome content.

This gets both of the document's own worked examples right:
  - the sidebar-collapse rail (§5.1 line 456-458): its enclosing H's other
    two children are composite V(...) subtrees, not bare leaves, so no
    sibling qualifies -> VIOLATION, matching the document's own ⚠L2.
  - the board/tree/controls toggle cluster riding the nav bar
    (§5.1 line 481-482): its enclosing H also directly contains
    `locale[common, action]` as a bare, non-chrome leaf sibling ->
    CONFORMS, matching the document's own "L2-conformers (embedded)" note.

The alternative reading we rejected — "does the chrome leaf's own axis
dimension collapse to zero if it is removed" — is arguably closer to the
document's "no band ... reserved ... alone" phrasing, but requires 2-D
reasoning about which axis a leaf's presence widens (a system-level
property, not a tree-local one) and was judged out of scope for a
prototype checker. Flagged, not silently narrowed.

MAGNITUDE (cold review, lyt-compiler-cold-review.md, "L2 checker is
trivially defeated by a near-zero decoy sibling"): the gap above is not a
theoretical edge case. A single near-zero-width non-chrome sibling — the
review's witness uses `{min 1px, pref 1px, max 1px}`, under 4% of the
wrapped band — is sufficient to satisfy the "at least one OTHER bare
non-chrome leaf sibling" test above and flip the checker's verdict from
VIOLATION to CONFORMS, on a tree that is, geometrically, still a band of
the partition axis reserved for a hide/show affordance alone. This
checker is a local, tree-shape approximation of the spec's prose law; it
provides weak assurance against adversarial or accidental decoys, not a
guarantee that L2's intent is upheld. Strengthening the check (e.g. the
2-D reasoning rejected above) is a language-design question, not
addressed here.

Applies to Split (H/V) nodes only, not Exclusive (T) — a T node's children
each receive the *whole* rectangle (§4.1 line 297-298), so "a band of a
partition axis" does not describe a T child's relationship to its
siblings. Disclosed scoping choice.

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

from typing import List

import lyt_ast as ast
from errors import LytLoadError


def _is_bare_chrome_action_leaf(slot: ast.Slot) -> bool:
    n = slot.node
    return (
        isinstance(n, ast.Leaf)
        and n.domain == "chrome"
        and n.facets == frozenset({"action"})
    )


def _is_bare_nonchrome_leaf(slot: ast.Slot) -> bool:
    n = slot.node
    return isinstance(n, ast.Leaf) and n.domain != "chrome"


def find_l2_violations(root: ast.Slot, *, path: str = "root") -> List[str]:
    violations: List[str] = []

    def walk(slot: ast.Slot, path: str) -> None:
        n = slot.node
        if isinstance(n, ast.Split):
            for i, child in enumerate(n.children):
                child_path = f"{path}/{n.axis.upper()}{i}"
                if _is_bare_chrome_action_leaf(child):
                    has_conforming_sibling = any(
                        j != i and _is_bare_nonchrome_leaf(sib)
                        for j, sib in enumerate(n.children)
                    )
                    if not has_conforming_sibling:
                        widget = child.node.widget  # type: ignore[union-attr]
                        violations.append(
                            f"{child_path} ({widget}): sole chrome/action "
                            f"occupant of a split child with no bare "
                            f"non-chrome sibling in {path}"
                        )
                walk(child, child_path)
        elif isinstance(n, ast.Exclusive):
            for i, child in enumerate(n.children):
                walk(child, f"{path}/T{i}")
        # Leaf: nothing further to walk.

    walk(root, path)
    return violations


def check_wellformed(root: ast.Slot, *, layout_name: str) -> None:
    l2 = find_l2_violations(root)
    if l2:
        raise LytLoadError(
            f"layout '{layout_name}' violates L2 (zero-standing-cost "
            f"affordances) at {len(l2)} site(s)",
            {"layout": layout_name, "law": "L2", "violations": l2},
        )
