"""
research/compression/test_bundle.py

Roundtrip tests for the bundle-level framework. Mirrors
`test_packed.py`'s shape — synthetic edge cases plus a corpus
roundtrip when redis is available.

Run with:
  /home/bork/w/vdc/venvs/kataproxy/bin/python -m research.compression.test_bundle

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import sys
from typing import Any

from .bundle import (
    BrotliBundle,
    GzipBundle,
    LosslessBundleCompressor,
    OwnershipFactoredBundle,
    PerPacketBundle,
    ZstdBundle,
)
from .identity import IdentityLossless
from .lossy_ownership import (
    DeltaUniformScalarQuantOwnership,
    KMeansScalarQuantOwnership,
    ProductResidualVQOwnership,
    ProductVQOwnership,
    UniformScalarQuantOwnership,
)
from .ownership import (
    DeltaOwnership,
    FlatSortedDeltaOwnership,
    RawOwnership,
    SortedDeltaOwnership,
    TransposedDeltaOwnership,
    TransposedOwnership,
)
from .packed import PackedLossless
from .test_packed import _synthesise_packet

REGISTRY: list[LosslessBundleCompressor] = [
    PerPacketBundle(IdentityLossless()),
    PerPacketBundle(PackedLossless()),
    OwnershipFactoredBundle(IdentityLossless(), RawOwnership()),
    OwnershipFactoredBundle(IdentityLossless(), TransposedOwnership()),
    OwnershipFactoredBundle(IdentityLossless(), DeltaOwnership()),
    OwnershipFactoredBundle(IdentityLossless(), TransposedDeltaOwnership()),
    OwnershipFactoredBundle(IdentityLossless(), SortedDeltaOwnership()),
    OwnershipFactoredBundle(IdentityLossless(), FlatSortedDeltaOwnership()),
    GzipBundle(OwnershipFactoredBundle(IdentityLossless(), RawOwnership())),
    GzipBundle(OwnershipFactoredBundle(IdentityLossless(), SortedDeltaOwnership())),
    GzipBundle(OwnershipFactoredBundle(IdentityLossless(), FlatSortedDeltaOwnership())),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), SortedDeltaOwnership())),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), FlatSortedDeltaOwnership())),
]


def _roundtrip(bundle: list[dict[str, Any]]) -> None:
    for c in REGISTRY:
        decoded = c.decode(c.encode(bundle))
        assert decoded == bundle, (
            f"{c.name}: roundtrip mismatch (bundle of {len(bundle)} packets)"
        )


def test_empty_bundle() -> None:
    """Trivial: an empty bundle should encode + decode to itself."""
    _roundtrip([])
    print("  test_empty_bundle: OK")


def test_single_packet_bundle() -> None:
    _roundtrip([_synthesise_packet(
        turn_number=5, n_move_infos=3, pv_len=2, state_max_turn=5,
    )])
    print("  test_single_packet_bundle: OK")


def test_multi_packet_bundle() -> None:
    """A bundle of 10 packets exercising the cross-packet
    accumulation path (OFB strips and recombines ownership across
    multiple packets; transpose sees actual N>1)."""
    bundle = [
        _synthesise_packet(
            turn_number=t,
            n_move_infos=10 + (t % 5),
            pv_len=3,
            state_max_turn=t,
        )
        for t in range(1, 11)
    ]
    _roundtrip(bundle)
    print("  test_multi_packet_bundle: OK")


def test_delta_byte_count_matches_raw() -> None:
    """Delta and TransposedDelta encodings must produce blobs of
    the same byte count as Raw — XOR-delta is a per-cell transform
    that preserves the N×W×8 payload size; the byte content
    differs, the count doesn't."""
    bundle = [
        _synthesise_packet(turn_number=t, n_move_infos=5, pv_len=2, state_max_turn=t)
        for t in range(1, 21)
    ]
    raw_sz = len(OwnershipFactoredBundle(IdentityLossless(), RawOwnership()).encode(bundle))
    delta_sz = len(OwnershipFactoredBundle(IdentityLossless(), DeltaOwnership()).encode(bundle))
    td_sz = len(OwnershipFactoredBundle(IdentityLossless(), TransposedDeltaOwnership()).encode(bundle))
    assert raw_sz == delta_sz == td_sz, (
        f"byte counts differ: raw={raw_sz} delta={delta_sz} td={td_sz}"
    )
    print(f"  test_delta_byte_count_matches_raw: OK ({raw_sz}B)")


def test_delta_bit_exact_varied_floats() -> None:
    """A bundle whose ownership values exercise the full float64
    bit pattern space — not just the {0.5} fixture default. XOR-
    delta must round-trip bit-exact on these; FP subtraction would
    introduce rounding errors that break dict-`==` equality."""
    import math
    import random
    rng = random.Random(20260525)
    bundle = []
    for t in range(1, 16):
        p = _synthesise_packet(turn_number=t, n_move_infos=5, pv_len=2, state_max_turn=t)
        # Replace ownership with a varied bit-pattern. Values include
        # exact integers, irrationals (pi, e), small near-zeros,
        # large near-±1, and a deliberate sign-flip across packets to
        # exercise the rare XOR-with-sign-bit case.
        own = [
            (math.pi - 3.0),                # 0.14159...
            -math.pi + 3.0,                 # -0.14159...
            0.999999 - 0.0001 * t,          # near +1, drifting
            -0.999999 + 0.0001 * t,         # near -1, drifting
            math.sin(0.1 * t),              # smooth oscillation
            1.0 if t < 8 else -1.0,         # sign flip mid-bundle
        ]
        # Pad with a deterministic pseudo-random tail to 361.
        own.extend(rng.uniform(-1, 1) for _ in range(361 - len(own)))
        p["ownership"] = own
        bundle.append(p)
    _roundtrip(bundle)
    print("  test_delta_bit_exact_varied_floats: OK")


def test_transpose_byte_count_matches_raw() -> None:
    """Raw and Transposed ownership encodings must produce blobs of
    the same byte count — they hold the same N×W floats, just in
    different order."""
    bundle = [
        _synthesise_packet(turn_number=t, n_move_infos=5, pv_len=2, state_max_turn=t)
        for t in range(1, 21)
    ]
    raw_blob = OwnershipFactoredBundle(IdentityLossless(), RawOwnership()).encode(bundle)
    tr_blob = OwnershipFactoredBundle(IdentityLossless(), TransposedOwnership()).encode(bundle)
    # The non-ownership bytes are identical between the two; only
    # the ownership payload byte order differs. Total length must
    # be equal.
    assert len(raw_blob) == len(tr_blob), (
        f"raw={len(raw_blob)} != transposed={len(tr_blob)}"
    )
    print(f"  test_transpose_byte_count_matches_raw: OK ({len(raw_blob)}B)")


def test_bundle_with_missing_ownership() -> None:
    """A heterogeneous bundle where some packets carry ownership
    and others don't. The presence bitmap path should handle this
    cleanly."""
    bundle = []
    for t in range(1, 6):
        p = _synthesise_packet(
            turn_number=t, n_move_infos=3, pv_len=2, state_max_turn=t,
        )
        if t % 2 == 0:
            del p["ownership"]
        bundle.append(p)
    _roundtrip(bundle)
    print("  test_bundle_with_missing_ownership: OK")


def test_uniform_quant_error_bounded() -> None:
    """UniformScalarQuant(bits) has max-abs reconstruction error
    bounded by half-bin-width = 1/2^bits. Verify the bound holds
    on a synthetic bundle with varied float values."""
    import math
    bundle = []
    for t in range(1, 11):
        p = _synthesise_packet(turn_number=t, n_move_infos=3, pv_len=2, state_max_turn=t)
        # Spread values across [-1, 1] to exercise all bins.
        p["ownership"] = [
            math.sin(0.5 * t + 0.01 * i)
            for i in range(361)
        ]
        bundle.append(p)
    for bits in (1, 2, 4, 8):
        c = OwnershipFactoredBundle(IdentityLossless(), UniformScalarQuantOwnership(bits))
        decoded = c.decode(c.encode(bundle))
        assert not c.is_lossless, "UniformQuant should not claim losslessness"
        # Non-ownership fields must still round-trip exactly.
        for orig, rec in zip(bundle, decoded):
            for k in orig:
                if k != "ownership":
                    assert orig[k] == rec[k], f"non-ownership field {k} drift at bits={bits}"
        # Ownership max-abs ≤ half-bin-width = 1/2^bits.
        bound = 1.0 / (1 << bits)
        for orig, rec in zip(bundle, decoded):
            mabs = max(abs(o - r) for o, r in zip(orig["ownership"], rec["ownership"]))
            assert mabs <= bound + 1e-12, (
                f"UniformQ{bits}b: max-abs {mabs} exceeds bound {bound}"
            )
    print("  test_uniform_quant_error_bounded: OK")


def test_kmeans_quant_runs() -> None:
    """KMeansScalarQuant fits a 1D codebook and round-trips through
    the bundle. Reconstruction error isn't bounded analytically
    (depends on data distribution); we just check the variant
    runs and the rest of the packet round-trips."""
    bundle = []
    for t in range(1, 21):
        p = _synthesise_packet(turn_number=t, n_move_infos=3, pv_len=2, state_max_turn=t)
        # Clustered ownership: half cells near -1, half near +1.
        p["ownership"] = (
            [-1.0 + 0.001 * t] * 180
            + [0.0 + 0.001 * t] * 1
            + [1.0 - 0.001 * t] * 180
        )
        bundle.append(p)
    for k in (4, 16, 256):
        c = OwnershipFactoredBundle(IdentityLossless(), KMeansScalarQuantOwnership(k))
        decoded = c.decode(c.encode(bundle))
        assert not c.is_lossless
        for orig, rec in zip(bundle, decoded):
            for fld in orig:
                if fld != "ownership":
                    assert orig[fld] == rec[fld]
    print("  test_kmeans_quant_runs: OK")


def test_delta_uniform_quant_runs() -> None:
    """DeltaUniformScalarQuant runs end-to-end on a varied bundle.
    Reconstruction uses the same DPCM loop as the encoder, so error
    is bounded per-step by delta_range / 2^bits."""
    import math
    bundle = []
    for t in range(1, 21):
        p = _synthesise_packet(turn_number=t, n_move_infos=3, pv_len=2, state_max_turn=t)
        # Slowly drifting ownership — exercises the DPCM loop's
        # accumulation behaviour.
        p["ownership"] = [
            0.9 * math.sin(0.1 * t + 0.01 * i) for i in range(361)
        ]
        bundle.append(p)
    for bits, dr in [(4, 2.0), (8, 2.0), (4, 0.5)]:
        c = OwnershipFactoredBundle(
            IdentityLossless(), DeltaUniformScalarQuantOwnership(bits, dr),
        )
        decoded = c.decode(c.encode(bundle))
        assert not c.is_lossless
        # Non-ownership fields exact.
        for orig, rec in zip(bundle, decoded):
            for k in orig:
                if k != "ownership":
                    assert orig[k] == rec[k]
    print("  test_delta_uniform_quant_runs: OK")


def test_product_vq_runs() -> None:
    """ProductVQ requires W divisible by M. For W=361, M=19 works
    (361 / 19 = 19). Test runs without error and recovers a non-
    ownership-equal bundle (lossy on ownership only)."""
    bundle = []
    for t in range(1, 21):
        p = _synthesise_packet(turn_number=t, n_move_infos=3, pv_len=2, state_max_turn=t)
        # Vary ownership a bit so K-means has structure to find.
        p["ownership"] = [
            (-1.0 if (i // 19) % 2 == 0 else 1.0) + 0.001 * t
            for i in range(361)
        ]
        bundle.append(p)
    for k in (16, 256):
        c = OwnershipFactoredBundle(IdentityLossless(), ProductVQOwnership(19, k))
        decoded = c.decode(c.encode(bundle))
        assert not c.is_lossless
        for orig, rec in zip(bundle, decoded):
            for fld in orig:
                if fld != "ownership":
                    assert orig[fld] == rec[fld]
    print("  test_product_vq_runs: OK")


def test_product_residual_vq_runs() -> None:
    """PRVQ via FAISS: fit codebooks + residual stages, encode,
    decode. Verify round-trip produces reasonable values (not bit-
    exact; lossy by construction). Non-ownership fields exact."""
    bundle = []
    for t in range(1, 41):
        p = _synthesise_packet(turn_number=t, n_move_infos=3, pv_len=2, state_max_turn=t)
        # 361 ownership values with row-structure so PRVQ's
        # row-sub-vector split has structure to find.
        p["ownership"] = [
            (-1.0 if (i // 19) % 2 == 0 else 1.0) + 0.001 * t + 0.0001 * (i % 19)
            for i in range(361)
        ]
        bundle.append(p)
    for ns, m, b in [(19, 2, 4), (19, 3, 4)]:
        c = OwnershipFactoredBundle(
            IdentityLossless(), ProductResidualVQOwnership(ns, m, b),
        )
        decoded = c.decode(c.encode(bundle))
        assert not c.is_lossless
        # Non-ownership fields exact.
        for orig, rec in zip(bundle, decoded):
            for k in orig:
                if k != "ownership":
                    assert orig[k] == rec[k]
    print("  test_product_residual_vq_runs: OK")


def test_corpus_bundle_roundtrip() -> None:
    """Group corpus by stem and roundtrip each bundle through every
    registered compressor."""
    try:
        import pickle
        from collections import defaultdict
        import redis
        r = redis.Redis(host="127.0.0.1", port=6380, decode_responses=False)
        r.ping()
    except Exception as e:
        print(f"  test_corpus_bundle_roundtrip: SKIPPED (redis unreachable: {e})")
        return

    by_stem: dict[str, list[tuple[int, dict]]] = defaultdict(list)
    for k in r.keys("traj:*:r0"):
        ks = k.decode()
        parts = ks.split(":")
        stem = parts[1]
        turn = int(parts[2][1:])
        entries = r.xrange(k, "-", "+")
        if not entries:
            continue
        by_stem[stem].append((turn, pickle.loads(entries[0][1][b"msg"])))
    bundles = []
    for stem in sorted(by_stem):
        bundles.append((stem, [p for _, p in sorted(by_stem[stem])]))

    if not bundles:
        print("  test_corpus_bundle_roundtrip: SKIPPED (corpus empty)")
        return

    for stem, bundle in bundles:
        for c in REGISTRY:
            decoded = c.decode(c.encode(bundle))
            assert decoded == bundle, (
                f"{c.name}: corpus bundle {stem} ({len(bundle)} packets) roundtrip mismatch"
            )
    total = sum(len(b) for _, b in bundles)
    print(f"  test_corpus_bundle_roundtrip: OK ({len(bundles)} bundles, {total} packets)")


def main() -> int:
    print("running bundle-level roundtrip tests:")
    test_empty_bundle()
    test_single_packet_bundle()
    test_multi_packet_bundle()
    test_transpose_byte_count_matches_raw()
    test_delta_byte_count_matches_raw()
    test_delta_bit_exact_varied_floats()
    test_bundle_with_missing_ownership()
    test_uniform_quant_error_bounded()
    test_kmeans_quant_runs()
    test_product_vq_runs()
    test_delta_uniform_quant_runs()
    test_product_residual_vq_runs()
    test_corpus_bundle_roundtrip()
    print("all tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
