"""
research/compression/probe_mpeg_ownership_delta.py

Synthetic probe: does MPEG-style P-frame encoding of Q4 ownership
maps across consecutive moves in a game yield meaningful byte
savings over full-frame Q4 encoding, both pre- and post-brotli?

Methodology
═══════════
Corpus: the 40-game redis store at 127.0.0.1:6380 (collected
during the 2026-05-25 compression research arc). Each "trajectory"
key `traj:{stem}:t{turn}:r0` is one position's final-analysis
packet; grouped by stem and sorted by turn, we recover 40 sequences
of sequential move-by-move analyses — the structure MPEG-style
delta encoding can exploit.

For each game:
  1. Quantise each packet's ownership to Q4 over [-1, 1] (181
     packed bytes per packet, two cells per byte, low-nibble-
     first).
  2. **Full-frame stream**: concatenate every packet's 181-byte
     packed ownership.
  3. **Delta-encoded stream**: first packet's full 181 bytes
     ("I-frame"); each subsequent packet's "P-frame" carries
     only the cells whose Q4 bin index changed from the prior
     packet.

     Two P-frame encodings tested:
       (a) Pair list: 2-byte uint16 cell index + 1-byte new Q4
           value per changed cell = 3 bytes per changed cell.
           Wins when few cells change.
       (b) Bitmap + values: 46-byte presence bitmap (one bit per
           cell, set if changed) + half-byte (4-bit) Q4 value for
           each changed cell, two-per-byte packed.
           Wins when many cells change (~50+).

     The encoder picks per packet (lower of the two encodings,
     with 1 byte prefix to discriminate at decode time).

  4. Brotli quality-6 each stream end-to-end (matches the
     production v2-brotli setting on the backend).

  5. Report per-game and aggregate ratios. The headline number is
     the post-brotli delta-stream bytes vs the post-brotli full-
     frame bytes — this is what the SPA's wire actually sees after
     the backend's mandatory brotli wrap.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import pickle
import statistics
from collections import defaultdict

import brotli
import numpy as np
import redis


OWNERSHIP_CELLS = 361
Q4_PACKED_BYTES = (OWNERSHIP_CELLS + 1) // 2  # 181


def q4_pack(ownership: list[float]) -> bytes:
    """Quantise a 361-cell ownership map at 4 bits per cell.
    Returns 181 bytes, two cells per byte (low nibble first).
    Mirrors the SPA's `quantiseOwnershipQ4` byte-for-byte."""
    a = np.clip(np.asarray(ownership, dtype=np.float64), -1.0, 1.0)
    idx = np.floor((a + 1.0) * 8.0).astype(np.int64)
    np.minimum(idx, 15, out=idx)
    np.maximum(idx, 0, out=idx)
    out = bytearray(Q4_PACKED_BYTES)
    for i in range(OWNERSHIP_CELLS):
        if (i & 1) == 0:
            out[i >> 1] |= int(idx[i])
        else:
            out[i >> 1] |= int(idx[i]) << 4
    return bytes(out)


def q4_indices_from_packed(packed: bytes) -> np.ndarray:
    """Inverse: unpack 181 bytes → 361-element uint8 array of Q4
    indices (0..15)."""
    idxs = np.zeros(OWNERSHIP_CELLS, dtype=np.uint8)
    for i in range(OWNERSHIP_CELLS):
        b = packed[i >> 1]
        idxs[i] = (b & 0x0f) if (i & 1) == 0 else ((b >> 4) & 0x0f)
    return idxs


# ── P-frame encodings ────────────────────────────────────────────────────────

# 1-byte discriminator on each P-frame so the decoder can dispatch.
PFRAME_TAG_PAIRS = 0x01
PFRAME_TAG_BITMAP = 0x02


def pframe_pairs(changed_cells: list[tuple[int, int]]) -> bytes:
    """(cell_index_uint16, new_q4_value_uint8) per changed cell.
    3 bytes per cell; cell_index is uint16 because 361 < 65536 and
    we don't want to bit-fiddle a 9-bit index."""
    out = bytearray()
    out.append(PFRAME_TAG_PAIRS)
    # 2-byte length prefix (number of changed cells).
    out.extend(len(changed_cells).to_bytes(2, "little"))
    for cell_idx, new_val in changed_cells:
        out.extend(cell_idx.to_bytes(2, "little"))
        out.append(new_val)
    return bytes(out)


def pframe_bitmap(changed_mask: np.ndarray, new_values: list[int]) -> bytes:
    """46-byte presence bitmap (one bit per cell) + 4-bit Q4
    values for the changed cells, two-per-byte packed."""
    bitmap = np.packbits(changed_mask.astype(np.uint8), bitorder="little").tobytes()
    if len(bitmap) < (OWNERSHIP_CELLS + 7) // 8:
        bitmap += b"\x00" * ((OWNERSHIP_CELLS + 7) // 8 - len(bitmap))
    # Pack 4-bit values, two-per-byte.
    n = len(new_values)
    values_packed = bytearray((n + 1) // 2)
    for i, v in enumerate(new_values):
        if (i & 1) == 0:
            values_packed[i >> 1] |= v & 0x0f
        else:
            values_packed[i >> 1] |= (v & 0x0f) << 4
    out = bytearray()
    out.append(PFRAME_TAG_BITMAP)
    # 2-byte length prefix (number of changed cells).
    out.extend(n.to_bytes(2, "little"))
    out.extend(bitmap)
    out.extend(bytes(values_packed))
    return bytes(out)


def make_pframe(prev_idx: np.ndarray, curr_idx: np.ndarray) -> bytes:
    """Encode the smaller of (pairs, bitmap) P-frame."""
    diff_mask = prev_idx != curr_idx
    changed = [(int(i), int(curr_idx[i])) for i in np.where(diff_mask)[0]]
    pairs = pframe_pairs(changed)
    bitmap = pframe_bitmap(diff_mask, [v for _, v in changed])
    return pairs if len(pairs) <= len(bitmap) else bitmap


# ── Corpus walk ──────────────────────────────────────────────────────────────


def load_games(r: redis.Redis) -> dict[str, list[bytes]]:
    """Returns {stem: [packed_ownership_bytes_in_turn_order]}.
    One Q4-packed ownership per position; sorted by turn."""
    keys = sorted(k.decode() for k in r.keys("traj:*:r0"))
    by_stem_turn: dict[tuple[str, int], bytes] = {}
    for k in keys:
        parts = k.split(":")
        stem = parts[1]
        turn = int(parts[2][1:])
        entries = r.xrange(k, "-", "+")
        if not entries:
            continue
        _, fields = entries[0]
        packet = pickle.loads(fields[b"msg"])
        if packet.get("isDuringSearch"):
            continue
        own = packet.get("ownership")
        if own is None or len(own) != OWNERSHIP_CELLS:
            continue
        by_stem_turn[(stem, turn)] = q4_pack(own)
    # Group by stem, ordered by turn.
    games: dict[str, list[bytes]] = defaultdict(list)
    for (stem, _turn), packed in sorted(by_stem_turn.items()):
        games[stem].append(packed)
    return games


def main() -> int:
    r = redis.Redis(host="127.0.0.1", port=6380, decode_responses=False)
    print("[1/3] loading corpus")
    games = load_games(r)
    print(f"  {len(games)} games; "
          f"{sum(len(v) for v in games.values())} positions total")

    print()
    print("[2/3] encoding & measuring per game")
    print()
    hdr = (f"{'game':18s} "
           f"{'N':>4s} "
           f"{'full+br':>8s}  "
           f"{'delta+br':>9s} {'d_ratio':>8s}  "
           f"{'xor+br':>8s} {'x_ratio':>8s}  "
           f"{'avg Δcells':>10s}")
    print(hdr)
    print("-" * len(hdr))

    full_pre_total = 0
    full_br_total = 0
    delta_pre_total = 0
    delta_br_total = 0
    xor_pre_total = 0
    xor_br_total = 0
    delta_cells_all: list[int] = []
    per_game_d_ratio: list[float] = []
    per_game_x_ratio: list[float] = []

    for stem in sorted(games):
        packed_list = games[stem]
        n = len(packed_list)
        if n == 0:
            continue
        # Full-frame stream: every packet's 181 bytes, concatenated.
        full_pre = b"".join(packed_list)
        full_br = brotli.compress(full_pre, quality=6)

        # Delta-encoded stream (pair-list / bitmap P-frames):
        # I-frame then P-frames with sparse cell-change lists.
        delta_buf = bytearray()
        delta_buf.append(0x00)  # I-frame tag
        delta_buf.extend(packed_list[0])
        prev_idx = q4_indices_from_packed(packed_list[0])
        for packed in packed_list[1:]:
            curr_idx = q4_indices_from_packed(packed)
            delta_cells_all.append(int((prev_idx != curr_idx).sum()))
            delta_buf.extend(make_pframe(prev_idx, curr_idx))
            prev_idx = curr_idx
        delta_pre = bytes(delta_buf)
        delta_br = brotli.compress(delta_pre, quality=6)

        # Byte-level XOR stream: each P-frame is 181 bytes (curr
        # XOR prev). Zero bytes mark unchanged nibble-pairs;
        # brotli's run detection should compress them aggressively.
        xor_buf = bytearray(packed_list[0])  # I-frame is literal
        for i in range(1, len(packed_list)):
            prev_b = packed_list[i - 1]
            curr_b = packed_list[i]
            xor_buf.extend(bytes(a ^ b for a, b in zip(prev_b, curr_b)))
        xor_pre = bytes(xor_buf)
        xor_br = brotli.compress(xor_pre, quality=6)

        avg_delta_cells = (
            statistics.mean(delta_cells_all[-(n - 1):]) if n > 1 else 0.0
        )
        d_ratio = len(delta_br) / len(full_br)
        x_ratio = len(xor_br) / len(full_br)
        print(f"{stem:18s} {n:>4d} "
              f"{len(full_br):>8d}  "
              f"{len(delta_br):>9d} {d_ratio:>8.3f}  "
              f"{len(xor_br):>8d} {x_ratio:>8.3f}  "
              f"{avg_delta_cells:>10.1f}")

        full_pre_total += len(full_pre)
        full_br_total += len(full_br)
        delta_pre_total += len(delta_pre)
        delta_br_total += len(delta_br)
        xor_pre_total += len(xor_pre)
        xor_br_total += len(xor_br)
        per_game_d_ratio.append(d_ratio)
        per_game_x_ratio.append(x_ratio)

    print("-" * len(hdr))
    print()
    print("[3/3] aggregate")
    print()
    print(f"  full-frame  pre-brotli:    {full_pre_total:>10,} bytes")
    print(f"  full-frame  +brotli:       {full_br_total:>10,} bytes")
    print(f"  pair/bitmap pre-brotli:    {delta_pre_total:>10,} bytes")
    print(f"  pair/bitmap +brotli:       {delta_br_total:>10,} bytes")
    print(f"  byte-XOR    pre-brotli:    {xor_pre_total:>10,} bytes")
    print(f"  byte-XOR    +brotli:       {xor_br_total:>10,} bytes")
    print()
    print(f"  pair/bitmap vs full:")
    print(f"    pre-brotli:  {delta_pre_total / full_pre_total:.3f} "
          f"({(1 - delta_pre_total / full_pre_total) * 100:+.1f}% savings)")
    print(f"    post-brotli: {delta_br_total / full_br_total:.3f} "
          f"({(1 - delta_br_total / full_br_total) * 100:+.1f}% savings)")
    print(f"  byte-XOR vs full:")
    print(f"    pre-brotli:  {xor_pre_total / full_pre_total:.3f} "
          f"({(1 - xor_pre_total / full_pre_total) * 100:+.1f}% savings)")
    print(f"    post-brotli: {xor_br_total / full_br_total:.3f} "
          f"({(1 - xor_br_total / full_br_total) * 100:+.1f}% savings)")
    print()
    if delta_cells_all:
        print(f"  changed-cells-per-P-frame:  "
              f"p50={int(np.percentile(delta_cells_all, 50))}  "
              f"p95={int(np.percentile(delta_cells_all, 95))}  "
              f"max={max(delta_cells_all)}  "
              f"mean={statistics.mean(delta_cells_all):.1f}")
    print()
    print("Per-game distribution of post-brotli ratios (variant / full-frame):")
    print("  < 1.0  ⇒ savings; > 1.0  ⇒ regression")
    print()
    print(f"{'variant':14s} {'min':>6s} {'p5':>6s} {'p25':>6s} "
          f"{'p50':>6s} {'p75':>6s} {'p95':>6s} {'max':>6s} {'mean':>6s}")
    print("-" * 70)
    for label, ratios in [("pair/bitmap", per_game_d_ratio),
                          ("byte-XOR", per_game_x_ratio)]:
        if not ratios:
            continue
        arr = np.array(ratios)
        print(f"{label:14s} "
              f"{arr.min():>6.3f} "
              f"{np.percentile(arr, 5):>6.3f} "
              f"{np.percentile(arr, 25):>6.3f} "
              f"{np.percentile(arr, 50):>6.3f} "
              f"{np.percentile(arr, 75):>6.3f} "
              f"{np.percentile(arr, 95):>6.3f} "
              f"{arr.max():>6.3f} "
              f"{arr.mean():>6.3f}")
    print()
    print("Notes on aggregate vs per-game ratios:")
    print("- Aggregate ratio (totals) weights games by their byte size — long")
    print("  games dominate. Per-game mean treats every game equally.")
    print("- The savings *number* the user sees on a single bundle is closer")
    print("  to the per-game ratio for that bundle's length, not the aggregate.")
    print()
    print("Headline: the post-brotli savings number is what the SPA's wire")
    print("would actually see after the backend's mandatory brotli wrap.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
