"""
tests/integration/routes/test_global_sequence_schema_walk.py

Enforcement test #1 of 2 for the per-user-id-enumeration design's
non-leak guarantee (`.claude/dispatch-reports/
per-user-id-enumeration-design.md`, Decision 7.1): "no user-facing
wire response value is drawn from a global (cross-tenant) sequence."

This test introspects the FastAPI app's OpenAPI schema (the same
`app.openapi()` the frontend's `npm run gen:api` pulls from) and
flags any `integer`-typed field on any component schema whose name
is id-shaped (`*_id`, exactly `id`, or `*_ids` for arrays) UNLESS the
`(schema_name, field_name)` pair is on the allowlist in
`tests/enforcement/global_sequence_allowlist.py`. Every allowlist
entry carries a named reason — "exceptions enumerated, never
silent," per the amendment.

This sits beside the route tier conceptually (it drives the same
app-construction fixtures as `tests/integration/routes/*.py` and
introspects the actual wire contract, not a Port fake) but is
schema-level rather than a DB round trip — named as its own small
addition to `tests/CLAUDE.md`'s tier taxonomy rather than force-fit
into "route test" or "adapter integration."

**Honest ceiling** (also stated in the allowlist module's docstring):
this test catches "did a global-sequence-shaped field appear on the
wire and go unnoticed." It does NOT catch a value interpolated into
free text (an error `detail=` message reading "card 50231 not
found") — that class stays review-only, per the design's Decision 7
honest-ceiling note.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import re

import pytest

from tests.enforcement.global_sequence_allowlist import GLOBAL_SEQUENCE_ALLOWLIST
from tests.integration.routes.conftest import _build_test_app

pytestmark = pytest.mark.integration

# `id`, `<name>_id`, or `<name>_ids` (the array-of-ids plural form),
# where `<name>` itself may contain underscores (`root_card_id`,
# `card_source_id`) — the prefix character class MUST include `_`,
# or multi-word-prefixed fields silently fail to match at all (a
# real bug this test's own tripwire subtest caught: an earlier
# `[a-zA-Z0-9]+_id` prefix rejected every underscore-containing
# prefix, which is most of the fields that actually matter).
# Deliberately does NOT match a bare `_ids`/`_id` (no name-prefix) or
# non-id-shaped names like `client_game_id`'s STRING-typed sibling —
# the type check below (integer / array-of-integer) is what actually
# separates a leaking raw PK from a UUID-shaped opaque handle; the
# name pattern alone is just the candidate filter.
_ID_SHAPED_NAME = re.compile(r"^(id|[a-zA-Z0-9_]+_id|[a-zA-Z0-9_]+_ids)$")


def _integer_id_shaped_fields(schema: dict) -> list[tuple[str, str]]:
    """
    For one OpenAPI component schema dict, return the
    `(schema_title, field_name)` pairs for every property that is
    both id-shaped by name AND integer-typed (directly, or as the
    `items` of an integer array — the `*_ids` plural case).
    """
    title = schema.get("title", "")
    found: list[tuple[str, str]] = []
    for field_name, field_schema in (schema.get("properties") or {}).items():
        if not _ID_SHAPED_NAME.match(field_name):
            continue
        field_type = field_schema.get("type")
        if field_type == "integer":
            found.append((title, field_name))
        elif field_type == "array":
            items = field_schema.get("items") or {}
            if items.get("type") == "integer":
                found.append((title, field_name))
    return found


_REF_PREFIX = "#/components/schemas/"


def _schema_refs(node) -> set[str]:
    """
    Recursively collect every `#/components/schemas/<Name>` reference
    reachable from an arbitrary OpenAPI fragment (a schema dict, a
    list of them, or a scalar leaf — the recursion terminates on
    non-dict/list values).
    """
    refs: set[str] = set()
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str) and ref.startswith(_REF_PREFIX):
            refs.add(ref[len(_REF_PREFIX):])
        for value in node.values():
            refs |= _schema_refs(value)
    elif isinstance(node, list):
        for item in node:
            refs |= _schema_refs(item)
    return refs


def _response_reachable_schema_names(openapi_doc: dict) -> set[str]:
    """
    Every component schema name reachable from a RESPONSE body
    somewhere in the OpenAPI document — deliberately excludes
    request-body-only schemas (`ForestQuery`, `ResolveRootsRequest`,
    `ImportGamesRequest`, …), because a value the client supplies in
    a request is not a leak vector: the client already knows it. Per
    the design's own phrasing (Decision 7.1): "introspects every
    FastAPI response model reachable from the OpenAPI schema."

    BFS: seed with every schema directly referenced by a `responses`
    block, then transitively follow every `$ref` inside each reached
    schema (nested models, list-of-model fields, discriminated-union
    members) until the frontier is empty.
    """
    component_schemas = openapi_doc.get("components", {}).get("schemas", {})
    frontier: set[str] = set()
    for path_item in openapi_doc.get("paths", {}).values():
        for operation in path_item.values():
            if not isinstance(operation, dict):
                continue
            for response in operation.get("responses", {}).values():
                content = response.get("content", {})
                json_body = content.get("application/json", {})
                frontier |= _schema_refs(json_body.get("schema", {}))

    reached: set[str] = set()
    while frontier:
        name = frontier.pop()
        if name in reached:
            continue
        reached.add(name)
        component_schema = component_schemas.get(name, {})
        frontier |= _schema_refs(component_schema) - reached
    return reached


def test_no_unlisted_global_sequence_field_on_the_wire(test_db):
    """
    Walk every RESPONSE-reachable component schema in the OpenAPI
    document; every integer/array-of-integer id-shaped field on one
    of those schemas must be on the allowlist. A new field failing
    this test is either a genuine leak (fix the wire shape) or a
    legitimate addressing exception that needs a named allowlist
    entry (the maintainer decides which).
    """
    app = _build_test_app(test_db)
    schema = app.openapi()
    component_schemas = schema.get("components", {}).get("schemas", {})
    reachable = _response_reachable_schema_names(schema)

    violations: list[str] = []
    for schema_name in reachable:
        component_schema = component_schemas.get(schema_name, {})
        # Use the OpenAPI component KEY (schema_name) as the primary
        # identity — `title` inside the schema dict is often absent
        # or differs from the component key for nested/generic
        # models. Fall back to a synthetic dict carrying the key as
        # title so `_integer_id_shaped_fields` has a stable label.
        labeled = {**component_schema, "title": schema_name}
        for title, field_name in _integer_id_shaped_fields(labeled):
            key = (schema_name, field_name)
            if key not in GLOBAL_SEQUENCE_ALLOWLIST:
                violations.append(f"{schema_name}.{field_name}")

    assert not violations, (
        "Unlisted id-shaped integer field(s) on a response-reachable "
        f"wire schema: {violations}. Either this is a genuine "
        "global-sequence leak (fix the response shape) or a "
        "legitimate exception that needs a named row in "
        "tests/enforcement/global_sequence_allowlist.py with a "
        "stated reason."
    )


def test_response_reachability_excludes_request_only_schemas(test_db):
    """
    Witness that the reachability filter actually does something —
    request-body-only schemas (never returned in any response) are
    excluded from the walk. Without this, the test above would be
    checking the same "every schema" set as a naive full walk and
    the reachability computation would be dead code.
    """
    app = _build_test_app(test_db)
    schema = app.openapi()
    reachable = _response_reachable_schema_names(schema)
    assert "ForestQuery" not in reachable
    assert "ResolveRootsRequest" not in reachable
    # Sanity: a genuinely response-reachable schema IS present, so
    # the exclusion above isn't just an empty-set false negative.
    assert "CardWithRecall" in reachable


def test_tripwire_a_deliberately_added_unlisted_field_is_caught():
    """
    Witness that the walk actually fires red for a genuinely new,
    unlisted field — not just a test that trivially passes because
    its assertion can never fail. Constructs a synthetic OpenAPI
    component schema (bypassing the real app) with an unlisted
    `sequential_widget_id: integer` field and confirms the detector
    flags it.
    """
    fake_schema = {
        "title": "NotARealModel",
        "properties": {
            "sequential_widget_id": {"type": "integer"},
            "name": {"type": "string"},
        },
    }
    found = _integer_id_shaped_fields(fake_schema)
    assert ("NotARealModel", "sequential_widget_id") in found
    assert ("NotARealModel", "sequential_widget_id") not in GLOBAL_SEQUENCE_ALLOWLIST
