"""
research/compression/packed.py

Schema-aware binary serialised family. Replaces the v1 "naïve
type-tagged" packed format (which spent 26% of its byte budget on
repeated field-name strings, per the firewall review at
`/tmp/packed_v2.py`) with a schema-pinned encoding that emits zero
field-name bytes for the wire shape's known dict structures.

Format overview
═══════════════
The KataGo wire packet's dict shapes are statically declared in
`packed_schema.py`. The encoder consults the schema at every
fixed-shape dict (root, rootInfo, moveInfo, extra, KataPlayerExtra)
and emits:

  [presence bitmap: ceil(N_known_fields / 8) bytes]
  [value for each present field, in schema order, per declared kind]
  [unknown-tail count (varint)]
  [for each unknown field: varint key-id, V2-tagged value]

The "unknown tail" preserves losslessness against forward-compatible
wire growth: if KataGo adds a new field, the encoder routes it
through the V2-style generic encoder (the same path FK_TAGGED uses
for heterogeneous / dynamic-keyed sub-trees like `extra.state`).

Blob layout
═══════════
  [1 byte: schema version (currently 1)]
  [varint: key-table size]
  [for each key: varint length + UTF-8 bytes]
  [root, encoded by ROOT_FIELDS schema]

The key table contains only the keys encountered by the V2 generic
path (FK_TAGGED regions, unknown-tail keys). Fixed-shape dicts emit
zero field-name bytes. Lossless round-trip is preserved against any
packet that matches the schema and any future packet that adds new
fields under the unknown-tail rule.

Move-number safety
══════════════════
Every length, count, and integer value uses varint encoding —
Python's arbitrary-precision ints round-trip through varints
regardless of magnitude. There are no hardcoded byte-width limits
on any value-carrying field. `tests/test_packed.py` exercises a
synthetic high-turn-number case (turnNumber=1024, extra.state
indexed up to 1024, pv lengths past 100).

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

import gzip
import io
import struct
from typing import Any

import brotli
import zstandard

from .compressor import LosslessCompressor
from .packed_schema import (
    EXTRA_FIELDS,
    FK_BOOL,
    FK_FIXED_DICT,
    FK_FIXED_LIST,
    FK_FLARR,
    FK_FLOAT,
    FK_IARR,
    FK_INT,
    FK_SARR,
    FK_STR,
    FK_TAGGED,
    FK_UINT,
    Field,
    MOVEINFO_FIELDS,
    PLAYER_EXTRA_FIELDS,
    ROOT_FIELDS,
    ROOTINFO_FIELDS,
    SCHEMA_VERSION,
)

# Generic-encoder type tags (the FK_TAGGED fallback path).
T_NULL = 0x00
T_FALSE = 0x01
T_TRUE = 0x02
T_UINT = 0x03
T_NINT = 0x04
T_FLOAT = 0x05
T_STR = 0x06
T_LIST = 0x07
T_DICT = 0x08
T_FLOAT_LIST = 0x09
T_INT_LIST = 0x0A
T_STR_LIST = 0x0B


# ── varint primitives ───────────────────────────────────────────────────────

def _write_uvarint(out: io.BytesIO, n: int) -> None:
    """Plain (non-zigzag) varint for non-negative integers. Python's
    arbitrary-precision int handles arbitrary magnitude; the loop
    emits 7 bits per byte until the value is small enough."""
    if n < 0:
        raise ValueError(f"_write_uvarint called with negative {n}")
    while n > 0x7F:
        out.write(bytes([(n & 0x7F) | 0x80]))
        n >>= 7
    out.write(bytes([n & 0x7F]))


def _read_uvarint(buf: bytes, pos: int) -> tuple[int, int]:
    shift = 0
    n = 0
    while True:
        b = buf[pos]
        pos += 1
        n |= (b & 0x7F) << shift
        if not (b & 0x80):
            return n, pos
        shift += 7


# ── Per-blob key table for the V2 generic-encoder path ──────────────────────

class _KeyTable:
    """Per-encode accumulator. Strings encountered as dict keys in
    FK_TAGGED regions or as unknown-tail keys land here; each gets
    a varint id; the table is emitted once at the blob header so
    the decoder can resolve ids back to strings."""

    def __init__(self) -> None:
        self.ids: dict[str, int] = {}
        self.order: list[str] = []

    def get_or_add(self, k: str) -> int:
        i = self.ids.get(k)
        if i is None:
            i = len(self.order)
            self.ids[k] = i
            self.order.append(k)
        return i


# ── V2-style generic encoder (FK_TAGGED path + unknown-tail values) ─────────

def _emit_tagged(v: Any, out: io.BytesIO, kt: _KeyTable) -> None:
    """Encode an arbitrary JSON-compatible value with a leading
    type tag. Specialises homogeneous lists for float / non-negative
    int / str element types (saves ~1 byte per element on the
    common ownership / policy / pv shapes)."""
    if v is None:
        out.write(bytes([T_NULL]))
    elif v is False:
        out.write(bytes([T_FALSE]))
    elif v is True:
        out.write(bytes([T_TRUE]))
    elif isinstance(v, bool):
        out.write(bytes([T_TRUE if v else T_FALSE]))
    elif isinstance(v, int):
        if v >= 0:
            out.write(bytes([T_UINT]))
            _write_uvarint(out, v)
        else:
            out.write(bytes([T_NINT]))
            _write_uvarint(out, -v)
    elif isinstance(v, float):
        out.write(bytes([T_FLOAT]))
        out.write(struct.pack("<d", v))
    elif isinstance(v, str):
        out.write(bytes([T_STR]))
        b = v.encode("utf-8")
        _write_uvarint(out, len(b))
        out.write(b)
    elif isinstance(v, list):
        if v and all(isinstance(x, float) for x in v):
            out.write(bytes([T_FLOAT_LIST]))
            _write_uvarint(out, len(v))
            for x in v:
                out.write(struct.pack("<d", x))
        elif v and all(
            isinstance(x, int) and not isinstance(x, bool) and x >= 0 for x in v
        ):
            out.write(bytes([T_INT_LIST]))
            _write_uvarint(out, len(v))
            for x in v:
                _write_uvarint(out, x)
        elif v and all(isinstance(x, str) for x in v):
            out.write(bytes([T_STR_LIST]))
            _write_uvarint(out, len(v))
            for s in v:
                sb = s.encode("utf-8")
                _write_uvarint(out, len(sb))
                out.write(sb)
        else:
            out.write(bytes([T_LIST]))
            _write_uvarint(out, len(v))
            for x in v:
                _emit_tagged(x, out, kt)
    elif isinstance(v, dict):
        out.write(bytes([T_DICT]))
        _write_uvarint(out, len(v))
        for k, val in v.items():
            if not isinstance(k, str):
                raise TypeError(f"tagged dict keys must be str, got {type(k)}")
            kid = kt.get_or_add(k)
            _write_uvarint(out, kid)
            _emit_tagged(val, out, kt)
    else:
        raise TypeError(f"unsupported type for tagged encoding: {type(v)}")


def _read_tagged(buf: bytes, pos: int, keys: list[str]) -> tuple[Any, int]:
    tag = buf[pos]
    pos += 1
    if tag == T_NULL:
        return None, pos
    if tag == T_FALSE:
        return False, pos
    if tag == T_TRUE:
        return True, pos
    if tag == T_UINT:
        return _read_uvarint(buf, pos)
    if tag == T_NINT:
        n, pos = _read_uvarint(buf, pos)
        return -n, pos
    if tag == T_FLOAT:
        return struct.unpack_from("<d", buf, pos)[0], pos + 8
    if tag == T_STR:
        n, pos = _read_uvarint(buf, pos)
        return buf[pos:pos + n].decode("utf-8"), pos + n
    if tag == T_FLOAT_LIST:
        n, pos = _read_uvarint(buf, pos)
        out = list(struct.unpack_from(f"<{n}d", buf, pos))
        return out, pos + 8 * n
    if tag == T_INT_LIST:
        n, pos = _read_uvarint(buf, pos)
        out: list[int] = []
        for _ in range(n):
            v, pos = _read_uvarint(buf, pos)
            out.append(v)
        return out, pos
    if tag == T_STR_LIST:
        n, pos = _read_uvarint(buf, pos)
        out_s: list[str] = []
        for _ in range(n):
            slen, pos = _read_uvarint(buf, pos)
            out_s.append(buf[pos:pos + slen].decode("utf-8"))
            pos += slen
        return out_s, pos
    if tag == T_LIST:
        n, pos = _read_uvarint(buf, pos)
        items: list[Any] = []
        for _ in range(n):
            v, pos = _read_tagged(buf, pos, keys)
            items.append(v)
        return items, pos
    if tag == T_DICT:
        n, pos = _read_uvarint(buf, pos)
        d: dict[str, Any] = {}
        for _ in range(n):
            kid, pos = _read_uvarint(buf, pos)
            v, pos = _read_tagged(buf, pos, keys)
            d[keys[kid]] = v
        return d, pos
    raise ValueError(f"unknown tagged tag 0x{tag:02x} at offset {pos - 1}")


# ── Schema-aware fixed-shape encoders ───────────────────────────────────────

def _coerce_float(v: Any, field_name: str) -> float:
    """Coerce int → float for FK_FLOAT fields. JSON parses `1` as
    Python int and `1.0` as float; KataGo's wire occasionally emits
    integer-valued floats. Coercing on encode + decoding as float
    yields a dict-`==`-equal round-trip since `1 == 1.0` in Python."""
    if isinstance(v, float):
        return v
    if isinstance(v, int) and not isinstance(v, bool):
        return float(v)
    raise TypeError(f"FK_FLOAT field {field_name!r}: expected number, got {type(v).__name__}")


def _emit_field(value: Any, field: Field, out: io.BytesIO, kt: _KeyTable) -> None:
    """Emit one fixed-schema field's value. Type validation per
    `field.kind` — encoder is fail-loud on type drift (ADR-0002),
    with the one int→float coercion noted above. List counts and
    integer values are varint; floats are raw 8-byte IEEE."""
    k = field.kind
    if k == FK_UINT:
        if not isinstance(value, int) or isinstance(value, bool):
            raise TypeError(f"FK_UINT field {field.name!r}: expected int, got {type(value).__name__}")
        if value < 0:
            raise ValueError(f"FK_UINT field {field.name!r}: negative value {value}")
        _write_uvarint(out, value)
    elif k == FK_INT:
        if not isinstance(value, int) or isinstance(value, bool):
            raise TypeError(f"FK_INT field {field.name!r}: expected int, got {type(value).__name__}")
        if value < 0:
            out.write(b"\x01")
            _write_uvarint(out, -value)
        else:
            out.write(b"\x00")
            _write_uvarint(out, value)
    elif k == FK_FLOAT:
        out.write(struct.pack("<d", _coerce_float(value, field.name)))
    elif k == FK_BOOL:
        out.write(b"\x01" if value else b"\x00")
    elif k == FK_STR:
        if not isinstance(value, str):
            raise TypeError(f"FK_STR field {field.name!r}: expected str, got {type(value).__name__}")
        b = value.encode("utf-8")
        _write_uvarint(out, len(b))
        out.write(b)
    elif k == FK_FLARR:
        if not isinstance(value, list):
            raise TypeError(f"FK_FLARR field {field.name!r}: expected list")
        _write_uvarint(out, len(value))
        for x in value:
            out.write(struct.pack("<d", _coerce_float(x, field.name)))
    elif k == FK_IARR:
        if not isinstance(value, list):
            raise TypeError(f"FK_IARR field {field.name!r}: expected list")
        _write_uvarint(out, len(value))
        for x in value:
            if not isinstance(x, int) or isinstance(x, bool) or x < 0:
                raise ValueError(f"FK_IARR field {field.name!r}: bad element {x!r}")
            _write_uvarint(out, x)
    elif k == FK_SARR:
        if not isinstance(value, list):
            raise TypeError(f"FK_SARR field {field.name!r}: expected list")
        _write_uvarint(out, len(value))
        for s in value:
            if not isinstance(s, str):
                raise TypeError(f"FK_SARR field {field.name!r}: non-str element {s!r}")
            sb = s.encode("utf-8")
            _write_uvarint(out, len(sb))
            out.write(sb)
    elif k == FK_FIXED_DICT:
        _emit_fixed_dict(value, field.sub, out, kt)
    elif k == FK_FIXED_LIST:
        if not isinstance(value, list):
            raise TypeError(f"FK_FIXED_LIST field {field.name!r}: expected list")
        _write_uvarint(out, len(value))
        for item in value:
            _emit_fixed_dict(item, field.sub, out, kt)
    elif k == FK_TAGGED:
        _emit_tagged(value, out, kt)
    else:
        raise ValueError(f"unknown field kind: {k}")


def _emit_fixed_dict(
    value: dict[str, Any],
    schema: list[Field],
    out: io.BytesIO,
    kt: _KeyTable,
) -> None:
    """Encode a fixed-shape dict: presence bitmap + values for
    present known fields + unknown-tail. The bitmap accommodates
    any number of schema fields via ceil(N/8) bytes — no hardcoded
    width limit. Unknown fields (keys in the dict but not in the
    schema) are emitted in a trailing key-id-keyed tail using the
    shared per-blob key table."""
    if not isinstance(value, dict):
        raise TypeError(f"_emit_fixed_dict: expected dict, got {type(value).__name__}")

    schema_index = {f.name: i for i, f in enumerate(schema)}
    nbits = len(schema)
    nbytes = (nbits + 7) // 8
    bitmap = bytearray(nbytes)
    unknowns: list[str] = []
    for k in value:
        i = schema_index.get(k)
        if i is None:
            unknowns.append(k)
        else:
            bitmap[i // 8] |= 1 << (i % 8)
    out.write(bytes(bitmap))

    for i, f in enumerate(schema):
        if bitmap[i // 8] & (1 << (i % 8)):
            _emit_field(value[f.name], f, out, kt)

    _write_uvarint(out, len(unknowns))
    for k in unknowns:
        kid = kt.get_or_add(k)
        _write_uvarint(out, kid)
        _emit_tagged(value[k], out, kt)


# ── Schema-aware decoders (symmetric to the encoders above) ─────────────────

def _read_field(
    buf: bytes,
    pos: int,
    field: Field,
    keys: list[str],
) -> tuple[Any, int]:
    k = field.kind
    if k == FK_UINT:
        return _read_uvarint(buf, pos)
    if k == FK_INT:
        sign = buf[pos]
        pos += 1
        n, pos = _read_uvarint(buf, pos)
        return (-n if sign else n), pos
    if k == FK_FLOAT:
        return struct.unpack_from("<d", buf, pos)[0], pos + 8
    if k == FK_BOOL:
        return buf[pos] == 1, pos + 1
    if k == FK_STR:
        n, pos = _read_uvarint(buf, pos)
        return buf[pos:pos + n].decode("utf-8"), pos + n
    if k == FK_FLARR:
        n, pos = _read_uvarint(buf, pos)
        out = list(struct.unpack_from(f"<{n}d", buf, pos))
        return out, pos + 8 * n
    if k == FK_IARR:
        n, pos = _read_uvarint(buf, pos)
        items_i: list[int] = []
        for _ in range(n):
            v, pos = _read_uvarint(buf, pos)
            items_i.append(v)
        return items_i, pos
    if k == FK_SARR:
        n, pos = _read_uvarint(buf, pos)
        items_s: list[str] = []
        for _ in range(n):
            slen, pos = _read_uvarint(buf, pos)
            items_s.append(buf[pos:pos + slen].decode("utf-8"))
            pos += slen
        return items_s, pos
    if k == FK_FIXED_DICT:
        return _read_fixed_dict(buf, pos, field.sub, keys)
    if k == FK_FIXED_LIST:
        n, pos = _read_uvarint(buf, pos)
        items: list[Any] = []
        for _ in range(n):
            d, pos = _read_fixed_dict(buf, pos, field.sub, keys)
            items.append(d)
        return items, pos
    if k == FK_TAGGED:
        return _read_tagged(buf, pos, keys)
    raise ValueError(f"unknown field kind: {k}")


def _read_fixed_dict(
    buf: bytes,
    pos: int,
    schema: list[Field],
    keys: list[str],
) -> tuple[dict[str, Any], int]:
    nbits = len(schema)
    nbytes = (nbits + 7) // 8
    bitmap = buf[pos:pos + nbytes]
    pos += nbytes

    d: dict[str, Any] = {}
    for i, f in enumerate(schema):
        if bitmap[i // 8] & (1 << (i % 8)):
            v, pos = _read_field(buf, pos, f, keys)
            d[f.name] = v

    n_unknown, pos = _read_uvarint(buf, pos)
    for _ in range(n_unknown):
        kid, pos = _read_uvarint(buf, pos)
        v, pos = _read_tagged(buf, pos, keys)
        d[keys[kid]] = v
    return d, pos


# ── Top-level Compressor classes ────────────────────────────────────────────

class PackedLossless(LosslessCompressor):
    """Schema-aware packed binary. No codec layer (the no-compression
    baseline of the Packed family — analogous to `IdentityLossless`
    in the JSON family).

    Blob layout: 1-byte schema version, varint-prefixed key table,
    root encoded by ROOT_FIELDS schema. The schema lives in
    `packed_schema.py`; growing it means appending fields (so prior
    bitmap positions stay stable) and bumping SCHEMA_VERSION.
    """

    name = "Packed"

    def _serialise(self, packet: dict[str, Any]) -> bytes:
        kt = _KeyTable()
        body = io.BytesIO()
        _emit_fixed_dict(packet, ROOT_FIELDS, body, kt)

        out = io.BytesIO()
        out.write(bytes([SCHEMA_VERSION]))
        _write_uvarint(out, len(kt.order))
        for k in kt.order:
            kb = k.encode("utf-8")
            _write_uvarint(out, len(kb))
            out.write(kb)
        out.write(body.getvalue())
        return out.getvalue()

    def _deserialise(self, blob: bytes) -> dict[str, Any]:
        if not blob:
            raise ValueError("packed: empty blob")
        version = blob[0]
        if version != SCHEMA_VERSION:
            raise ValueError(
                f"packed: schema version {version} not supported by this decoder "
                f"(version {SCHEMA_VERSION})"
            )
        pos = 1
        n_keys, pos = _read_uvarint(blob, pos)
        keys: list[str] = []
        for _ in range(n_keys):
            klen, pos = _read_uvarint(blob, pos)
            keys.append(blob[pos:pos + klen].decode("utf-8"))
            pos += klen
        d, pos = _read_fixed_dict(blob, pos, ROOT_FIELDS, keys)
        if pos != len(blob):
            raise ValueError(
                f"packed decode left {len(blob) - pos} trailing bytes — corrupt or wrong format"
            )
        return d

    def _codec_compress(self, b: bytes) -> bytes:
        return b

    def _codec_decompress(self, b: bytes) -> bytes:
        return b

    def encode(self, packet: dict[str, Any]) -> bytes:
        return self._codec_compress(self._serialise(packet))

    def decode(self, blob: bytes) -> dict[str, Any]:
        return self._deserialise(self._codec_decompress(blob))


class PackedGzipLossless(PackedLossless):
    """Packed binary + gzip."""

    name = "PackedGzip"
    LEVEL = 6

    def _codec_compress(self, b: bytes) -> bytes:
        return gzip.compress(b, compresslevel=self.LEVEL)

    def _codec_decompress(self, b: bytes) -> bytes:
        return gzip.decompress(b)


class PackedZstdLossless(PackedLossless):
    """Packed binary + zstd."""

    name = "PackedZstd"
    LEVEL = 3

    def _codec_compress(self, b: bytes) -> bytes:
        return zstandard.ZstdCompressor(level=self.LEVEL).compress(b)

    def _codec_decompress(self, b: bytes) -> bytes:
        return zstandard.ZstdDecompressor().decompress(b)


class PackedBrotliLossless(PackedLossless):
    """Packed binary + brotli."""

    name = "PackedBrotli"
    QUALITY = 6

    def _codec_compress(self, b: bytes) -> bytes:
        return brotli.compress(b, quality=self.QUALITY)

    def _codec_decompress(self, b: bytes) -> bytes:
        return brotli.decompress(b)
