"""research/lyt/tools/dump_ratifiable_sites.py

LYT relations-first amendment, dispatch C4's RATCHET form (ledger rows
2396/2445). Enumerates every (file, site_id, construct, unit, value)
tuple a WARNING-mode (non-strict) load of the two governed encodings
resolves through the literal-bound path. This is the CANDIDATE list a
human reviews before hand-editing `ratified-literals.json`: this script
only ever prints, it never writes the manifest —
`relations.RatifiedManifest` is authored, commissioner-owned, per that
class's own docstring.

WHY WARNINGS, NOT `ctx.deprecated_literals`. `RelationContext.
deprecated_literals` only reliably accumulates the OUTERMOST context's
own direct literals — `load_slot`'s Split/Exclusive branches each build
a FRESH `child_relctx`/`own_relctx` (a new object, its own empty list)
for every recursive call, so a descendant's own literal is recorded on
THAT descendant's own transient context object, never propagated back up
to the root context a caller still holds a reference to. The warning
STREAM, by contrast, is process-global regardless of which context
object fired it — `loader._resolve_extent_like`'s own warning message
now carries `[site_id=... construct=...]` (dispatch C4's own addition)
precisely so this script can recover the same information from the one
channel that actually surfaces every site, not just the root's.

Run one FRESH SUBPROCESS PER FILE (matching `tools/count_deprecations.py`'s
own reasoning), so no cross-file cache/registry state can contaminate one
file's own enumeration with another's.

Usage: `nice -n 19 <python> tools/dump_ratifiable_sites.py` from
`research/lyt/`.

License: Public Domain (The Unlicense), matching research/lyt/__init__.py's
license line and the umbrella's ADR-0006 per-file convention.
"""
from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent  # research/lyt/
ENCODINGS_DIR = HERE / "encodings"

_MESSAGE_RE = re.compile(
    r"px/ch literal bound at (?P<where>.+?) \((?P<value>[\d.]+)(?P<unit>px|ch)\).*?"
    r"\[site_id=(?P<site_id>'[^']*'|None) construct=(?P<construct>'[^']*'|None)\]"
)

_SNIPPET = """
import sys, warnings
sys.path.insert(0, {here!r})
import loader
from errors import RelationsFirstDeprecationWarning

text = open({path!r}).read()
with warnings.catch_warnings(record=True) as w:
    warnings.simplefilter("always")
    loader.load_layouts(text)
for x in w:
    if issubclass(x.category, RelationsFirstDeprecationWarning):
        print(str(x.message))
"""


def dump_file(path: Path) -> list:
    result = subprocess.run(
        [sys.executable, "-c", _SNIPPET.format(here=str(HERE), path=str(path))],
        cwd=str(HERE),
        capture_output=True,
        text=True,
        check=True,
    )
    rows = []
    for line in result.stdout.splitlines():
        m = _MESSAGE_RE.search(line)
        if not m:
            continue
        if m.group("unit") not in ("px", "ch"):
            continue
        rows.append(
            {
                "where": m.group("where"),
                "value": float(m.group("value")),
                "unit": m.group("unit"),
                "site_id": eval(m.group("site_id")),  # 'x' or None, safe: our own format
                "construct": eval(m.group("construct")),
            }
        )
    return rows


def main() -> int:
    for p in sorted(ENCODINGS_DIR.glob("*.lyt")):
        rel = f"encodings/{p.name}"
        rows = dump_file(p)
        print(f"=== {rel} ({len(rows)} px/ch sites) ===")
        # Group by (site_id, construct, unit) so a compound construct's
        # own repeated values (pack-rows items, sum-of operands) show up
        # as one bucket with a value SET, matching the manifest's own
        # shape.
        buckets: dict = {}
        for r in rows:
            key = (r["site_id"], r["construct"], r["unit"])
            buckets.setdefault(key, {"values": [], "wheres": []})
            buckets[key]["values"].append(r["value"])
            buckets[key]["wheres"].append(r["where"])
        for (site_id, construct, unit), payload in sorted(
            buckets.items(), key=lambda kv: (kv[0][0] or "", kv[0][1] or "")
        ):
            values = sorted(set(payload["values"]))
            print(
                f"  site_id={site_id!r:16} construct={construct!r:26} "
                f"unit={unit!r:5} values={values}  (first where: {payload['wheres'][0]})"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
