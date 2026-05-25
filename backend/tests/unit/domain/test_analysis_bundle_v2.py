"""
tests/unit/domain/test_analysis_bundle_v2.py

Coverage for the v1/v2 wire-shape discrimination in
``domain.analysis_bundle``. The v2 shape ships with the
cross/analysis-bundle-compression-v2 arc; this file pins the
union-resolution behaviour the route layer relies on.

What gets tested here is purely the Pydantic validation surface —
the codec dispatch in the repository and the route-level body
parsing both depend on these instantiation rules holding.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pytest
from pydantic import TypeAdapter, ValidationError

from domain.analysis_bundle import (
    AnalysisBundle,
    AnalysisBundleRecord,
    AnalysisBundleSummary,
    AnalysisBundleUpload,
    AnalysisBundleV1,
    AnalysisBundleV2,
)

pytestmark = pytest.mark.unit


_BUNDLE_UPLOAD_ADAPTER = TypeAdapter(AnalysisBundleUpload)


def _v1_dict_without_wire_format() -> dict:
    """A canonical v1 upload payload as a pre-cutover SPA would send
    it — no ``wire_format`` discriminator."""
    return {
        "schema_version": 1,
        "records": [
            {"config_hash": "h1", "node_id": "n1", "packet": {"k": 1}},
        ],
    }


def _v2_dict() -> dict:
    """A canonical v2 upload payload."""
    return {
        "wire_format": "v2",
        "schema_version": 1,
        "format_descriptor": {"scheme": "ofb-q4-q8", "version": 1},
        "record_count": 3,
        "uncompressed_byte_size": 12345,
        "data_b64": "AAAA",
    }


# ─── AnalysisBundle / V1 alias is instantiable ──────────────────────────────


def test_analysis_bundle_is_v1_alias():
    """The legacy ``AnalysisBundle`` name aliases ``AnalysisBundleV1``
    so existing imports + instantiations continue to work."""
    assert AnalysisBundle is AnalysisBundleV1


def test_v1_instance_defaults_wire_format_to_v1():
    """v1 instances constructed without an explicit ``wire_format``
    get the default ``"v1"`` — this is what pre-cutover SPAs and
    existing tests rely on."""
    inst = AnalysisBundleV1(schema_version=1, records=[])
    assert inst.wire_format == "v1"


# ─── V2 instantiation rules ─────────────────────────────────────────────────


def test_v2_instance_requires_explicit_wire_format():
    """V2's ``wire_format`` has no default — missing it is a
    validation error. This is load-bearing for the union's
    discrimination: V1 happily accepts a missing discriminator;
    V2 doesn't."""
    payload = _v2_dict()
    del payload["wire_format"]
    with pytest.raises(ValidationError):
        AnalysisBundleV2(**payload)


def test_v2_rejects_wrong_wire_format_value():
    """V2 only accepts ``wire_format="v2"`` — sending ``"v1"`` or
    any other value fails validation."""
    payload = _v2_dict()
    payload["wire_format"] = "v1"
    with pytest.raises(ValidationError):
        AnalysisBundleV2(**payload)


def test_v2_validates_with_required_fields_present():
    inst = AnalysisBundleV2(**_v2_dict())
    assert inst.wire_format == "v2"
    assert inst.format_descriptor == {"scheme": "ofb-q4-q8", "version": 1}
    assert inst.record_count == 3
    assert inst.uncompressed_byte_size == 12345
    assert inst.data_b64 == "AAAA"


def test_v2_missing_format_descriptor_raises():
    payload = _v2_dict()
    del payload["format_descriptor"]
    with pytest.raises(ValidationError):
        AnalysisBundleV2(**payload)


def test_v2_missing_record_count_raises():
    payload = _v2_dict()
    del payload["record_count"]
    with pytest.raises(ValidationError):
        AnalysisBundleV2(**payload)


def test_v2_missing_uncompressed_byte_size_raises():
    payload = _v2_dict()
    del payload["uncompressed_byte_size"]
    with pytest.raises(ValidationError):
        AnalysisBundleV2(**payload)


def test_v2_missing_data_b64_raises():
    payload = _v2_dict()
    del payload["data_b64"]
    with pytest.raises(ValidationError):
        AnalysisBundleV2(**payload)


# ─── Union discrimination — the route's load-bearing behaviour ──────────────


def test_union_resolves_v1_input_without_wire_format_to_v1():
    """A canonical v1 payload (no ``wire_format``) must resolve to
    V1 through the union — this is the pre-cutover-SPA backward-
    compat case."""
    inst = _BUNDLE_UPLOAD_ADAPTER.validate_python(_v1_dict_without_wire_format())
    assert isinstance(inst, AnalysisBundleV1)


def test_union_resolves_v1_input_with_explicit_wire_format_to_v1():
    payload = _v1_dict_without_wire_format()
    payload["wire_format"] = "v1"
    inst = _BUNDLE_UPLOAD_ADAPTER.validate_python(payload)
    assert isinstance(inst, AnalysisBundleV1)


def test_union_resolves_v2_input_to_v2():
    inst = _BUNDLE_UPLOAD_ADAPTER.validate_python(_v2_dict())
    assert isinstance(inst, AnalysisBundleV2)


def test_union_rejects_unknown_wire_format():
    """An input with a wire_format the backend doesn't recognise is
    a 422 — neither V1 nor V2 accepts it."""
    payload = _v1_dict_without_wire_format()
    payload["wire_format"] = "v99"
    with pytest.raises(ValidationError):
        _BUNDLE_UPLOAD_ADAPTER.validate_python(payload)


# ─── Summary's new optional fields ──────────────────────────────────────────


def test_summary_accepts_legacy_v1_shape_without_new_fields():
    """The pre-v2-arc summary shape (no ``uncompressed_byte_size``,
    no ``format_descriptor``) still validates — both new fields
    default to None for legacy compatibility."""
    from datetime import datetime, timezone
    from uuid import uuid4

    summary = AnalysisBundleSummary(
        board_id=uuid4(),
        record_count=2,
        stored_scheme="json+gzip",
        stored_byte_size=1024,
        updated_at=datetime.now(timezone.utc),
    )
    assert summary.uncompressed_byte_size is None
    assert summary.format_descriptor is None


def test_summary_carries_v2_fields_when_provided():
    """v2-rows worth of summary metadata round-trip cleanly."""
    from datetime import datetime, timezone
    from uuid import uuid4

    summary = AnalysisBundleSummary(
        board_id=uuid4(),
        record_count=5,
        stored_scheme="v2-brotli",
        stored_byte_size=2048,
        updated_at=datetime.now(timezone.utc),
        uncompressed_byte_size=8192,
        format_descriptor={"scheme": "ofb-q4-q8", "version": 1},
    )
    assert summary.uncompressed_byte_size == 8192
    assert summary.format_descriptor == {"scheme": "ofb-q4-q8", "version": 1}
