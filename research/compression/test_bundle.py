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
from .ownership import RawOwnership, TransposedOwnership
from .packed import PackedLossless
from .test_packed import _synthesise_packet

REGISTRY: list[LosslessBundleCompressor] = [
    PerPacketBundle(IdentityLossless()),
    PerPacketBundle(PackedLossless()),
    OwnershipFactoredBundle(IdentityLossless(), RawOwnership()),
    OwnershipFactoredBundle(IdentityLossless(), TransposedOwnership()),
    GzipBundle(OwnershipFactoredBundle(IdentityLossless(), RawOwnership())),
    GzipBundle(OwnershipFactoredBundle(IdentityLossless(), TransposedOwnership())),
    ZstdBundle(OwnershipFactoredBundle(IdentityLossless(), RawOwnership())),
    BrotliBundle(OwnershipFactoredBundle(IdentityLossless(), TransposedOwnership())),
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
    test_bundle_with_missing_ownership()
    test_corpus_bundle_roundtrip()
    print("all tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
