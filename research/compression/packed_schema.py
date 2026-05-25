"""
research/compression/packed_schema.py

Static schema definitions for the schema-aware PackedLossless
serialiser. The KataGo wire packet's dict shapes are pinned here;
the encoder consults the schema at every fixed-shape dict to emit
field values in a known order with no field-name bytes.

Field kinds
═══════════
A `Field` declares one slot in a fixed-shape dict. `kind` selects
the encoder/decoder routine:

  uint        non-negative integer, plain varint
  int         signed integer, plain varint of |n| with sign byte
  float       IEEE float64, 8 raw bytes
  bool        single byte (0x00 / 0x01)
  str         varint length + UTF-8 bytes
  flarr       list of float; varint count + N*8 raw bytes
  iarr        list of uint; varint count + N varints
  sarr        list of str; varint count + N (varint length + bytes)
  fixed_dict  nested fixed-shape dict; `sub` carries the inner field list
  fixed_list  list of fixed-shape dicts; `sub` carries the dict's fields
  tagged      heterogeneous / dynamic value; falls back to the V2-style
              generic encoder with the per-blob key table

A fixed-shape dict is encoded as a presence bitmap (ceil(N/8) bytes,
where N is the number of declared fields) followed by the values of
present fields in schema order. Unknown fields (those not declared
in the schema for that dict shape) are encoded into a trailing
"unknown tail": a varint count, then (varint key-id, tagged value)
pairs that share the per-blob key table with FK_TAGGED regions.

Fail-loud-on-type-mismatch is the encoder's contract: if a value
doesn't match its declared `kind`, the encoder raises with the
field name. Lossless round-trip is preserved only when the wire
shape matches the schema; unknown new fields are absorbed via the
unknown tail (still lossless), but type drift on a declared field
is a hard error.

Move-number safety: every length, count, and integer value is
varint-encoded — Python's arbitrary-precision integers round-trip
through varints regardless of magnitude. The `tests` module has a
synthetic high-turn-number case that exercises this end to end.

Each schema's field order is locked: adding new fields means
appending (so prior bitmap positions stay stable) AND bumping
SCHEMA_VERSION. Re-ordering or removing an existing field is a
breaking change and requires a new schema version.

License: Public Domain (The Unlicense)
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any


SCHEMA_VERSION = 1

# Field-kind tokens.
FK_UINT = "uint"
FK_INT = "int"
FK_FLOAT = "float"
FK_BOOL = "bool"
FK_STR = "str"
FK_FLARR = "flarr"
FK_IARR = "iarr"
FK_SARR = "sarr"
FK_FIXED_DICT = "fixed_dict"
FK_FIXED_LIST = "fixed_list"
FK_TAGGED = "tagged"


@dataclass(frozen=True)
class Field:
    name: str
    kind: str
    sub: Any = None  # Inner schema (list[Field]) for fixed_dict / fixed_list


# ── rootInfo dict ───────────────────────────────────────────────────────────
# 18 observed fields. Ordering chosen by category for readability;
# functionally any order works as long as it stays stable. Strings are
# `currentPlayer` ('B'/'W'), `symHash`, `thisHash` (hex hashes). Everything
# else is numeric.

ROOTINFO_FIELDS: list[Field] = [
    Field("currentPlayer", FK_STR),
    Field("visits", FK_UINT),
    Field("weight", FK_FLOAT),
    Field("winrate", FK_FLOAT),
    Field("scoreLead", FK_FLOAT),
    Field("scoreSelfplay", FK_FLOAT),
    Field("scoreStdev", FK_FLOAT),
    Field("utility", FK_FLOAT),
    Field("rawLead", FK_FLOAT),
    Field("rawNoResultProb", FK_FLOAT),
    Field("rawScoreSelfplay", FK_FLOAT),
    Field("rawScoreSelfplayStdev", FK_FLOAT),
    Field("rawStScoreError", FK_FLOAT),
    Field("rawStWrError", FK_FLOAT),
    Field("rawVarTimeLeft", FK_FLOAT),
    Field("rawWinrate", FK_FLOAT),
    Field("symHash", FK_STR),
    Field("thisHash", FK_STR),
]


# ── moveInfo dict ───────────────────────────────────────────────────────────
# 20 observed fields. `isSymmetryOf` is an optional move-coordinate string
# pointing at the canonical-symmetry move; rare. `pv`, `pvVisits`,
# `pvEdgeVisits` are the principal-variation lists.

MOVEINFO_FIELDS: list[Field] = [
    Field("move", FK_STR),
    Field("visits", FK_UINT),
    Field("order", FK_UINT),
    Field("winrate", FK_FLOAT),
    Field("scoreLead", FK_FLOAT),
    Field("scoreMean", FK_FLOAT),
    Field("scoreSelfplay", FK_FLOAT),
    Field("scoreStdev", FK_FLOAT),
    Field("utility", FK_FLOAT),
    Field("utilityLcb", FK_FLOAT),
    Field("lcb", FK_FLOAT),
    Field("prior", FK_FLOAT),
    Field("weight", FK_FLOAT),
    Field("edgeVisits", FK_UINT),
    Field("edgeWeight", FK_FLOAT),
    Field("playSelectionValue", FK_FLOAT),
    Field("isSymmetryOf", FK_STR),
    Field("pv", FK_SARR),
    Field("pvVisits", FK_IARR),
    Field("pvEdgeVisits", FK_IARR),
]


# ── extra.{black,white} dict (KataPlayerExtra) ──────────────────────────────
# All three observed fields are FK_TAGGED in this revision: across the
# 608-packet collection corpus, they were always empty (cwt reserved,
# triangular empty, deltas empty). FK_TAGGED falls to the generic
# encoder, which handles empty dicts/lists in 1-2 bytes. If a future
# corpus shows these are routinely populated with a predictable shape,
# pin a specific schema then.

PLAYER_EXTRA_FIELDS: list[Field] = [
    Field("triangular", FK_TAGGED),
    Field("deltas", FK_TAGGED),
    Field("cwt", FK_TAGGED),
]


# ── extra dict ──────────────────────────────────────────────────────────────
# `state` is a dynamic-key dict (Record<turn-string, Record<metric-string,
# number>>); the outer keys vary per packet and inner keys are palette-
# driven, so FK_TAGGED. `black` / `white` are fixed-shape.

EXTRA_FIELDS: list[Field] = [
    Field("state", FK_TAGGED),
    Field("black", FK_FIXED_DICT, sub=PLAYER_EXTRA_FIELDS),
    Field("white", FK_FIXED_DICT, sub=PLAYER_EXTRA_FIELDS),
]


# ── Root packet ─────────────────────────────────────────────────────────────
# 9 observed top-level fields. `userMoveInfo` is None whenever present in
# this corpus — declaring it FK_TAGGED lets the generic encoder handle
# the None case (1 byte) and any future moveInfo-dict shape gracefully.

ROOT_FIELDS: list[Field] = [
    Field("id", FK_STR),
    Field("isDuringSearch", FK_BOOL),
    Field("turnNumber", FK_UINT),
    Field("moveInfos", FK_FIXED_LIST, sub=MOVEINFO_FIELDS),
    Field("rootInfo", FK_FIXED_DICT, sub=ROOTINFO_FIELDS),
    Field("ownership", FK_FLARR),
    Field("policy", FK_FLARR),
    Field("extra", FK_FIXED_DICT, sub=EXTRA_FIELDS),
    Field("userMoveInfo", FK_TAGGED),
]
