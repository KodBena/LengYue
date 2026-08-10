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

Applies to Split (H/V) nodes only, not Exclusive (T) — a T node's children
each receive the *whole* rectangle (§4.1 line 297-298), so "a band of a
partition axis" does not describe a T child's relationship to its
siblings. Disclosed scoping choice.
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
