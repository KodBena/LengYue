#!/usr/bin/env python3
# tools/work-status/migrate-to-pg.py — seed the `todo` Postgres DB from the JSON.
#
# Loads docs/work-status.json into the relational work-status store defined by
# tools/work-status/schema.sql (psql -h 192.168.122.1 -d todo). It applies the
# schema (drop + recreate), inserts the data with parameterized statements
# (psycopg3 — never psycopg2), and then SELF-CERTIFIES: it reconstructs every
# item back out of the database and compares it field-for-field to the JSON,
# refusing to finish (non-zero exit, ADR-0002) on any count mismatch, invariant
# violation, or round-trip difference. Array order is treated as insignificant
# (the maintainer confirmed it carries no meaning), so comparison is set/multiset
# based.
#
# This is a RE-SEED tool: every run drops and rebuilds from the JSON. Safe while
# the JSON is still the working copy; once writes start landing directly in
# Postgres, re-running this would clobber them — don't, unless you intend a reset.
#
# Usage:  python tools/work-status/migrate-to-pg.py
#
# License: Public Domain (The Unlicense).

import json
import subprocess
import sys
from pathlib import Path

import psycopg
from psycopg.types.json import Json

REPO = Path(__file__).resolve().parents[2]
DATA = REPO / "docs" / "work-status.json"
SCHEMA = Path(__file__).resolve().parent / "schema.sql"
PG = {"host": "192.168.122.1", "dbname": "todo"}

# Scalar item columns (1:1 with the `items` table); everything else on an item is
# either a child table (depends_on/refs/labels) or hoisted into `extra` jsonb.
SCALAR = ["id", "title", "description", "state", "disposition", "resolution",
          "scope", "tier", "closed_on", "parent", "superseded_by", "legacy_number"]
CHILD_KEYS = {"depends_on", "refs", "labels"}
KNOWN = set(SCALAR) | CHILD_KEYS


def normalize(item: dict) -> dict:
    """Canonical, order-insensitive view of an item for round-trip comparison."""
    return {
        "scalars": {c: (item.get(c) if item.get(c) is not None else None) for c in SCALAR},
        "depends_on": sorted(item.get("depends_on", [])),
        "refs": sorted((r["kind"], r["target"]) for r in item.get("refs", [])),
        "labels": sorted(item.get("labels", [])),
        "extra": {k: v for k, v in item.items() if k not in KNOWN},
    }


def reconstruct(conn) -> dict:
    """Rebuild every item from the relational tables, keyed by id."""
    out: dict[str, dict] = {}
    with conn.cursor() as cur:
        cur.execute(f"SELECT {', '.join(SCALAR)}, extra FROM items")
        for row in cur.fetchall():
            d = dict(zip(SCALAR, row[:-1]))
            extra = row[-1] or {}
            # date → ISO string to match the JSON's text representation
            if d.get("closed_on") is not None:
                d["closed_on"] = d["closed_on"].isoformat()
            it = {k: v for k, v in d.items() if v is not None}
            it["depends_on"], it["refs"], it["labels"] = [], [], []
            it.update(extra)
            out[d["id"]] = it
        cur.execute("SELECT item_id, depends_on FROM deps")
        for item_id, dep in cur.fetchall():
            out[item_id]["depends_on"].append(dep)
        cur.execute("SELECT item_id, kind, target FROM refs")
        for item_id, kind, target in cur.fetchall():
            out[item_id]["refs"].append({"kind": kind, "target": target})
        cur.execute("SELECT item_id, label FROM labels")
        for item_id, label in cur.fetchall():
            out[item_id]["labels"].append(label)
    return out


def main() -> None:
    doc = json.loads(DATA.read_text())
    if doc.get("schema_version") != 1:
        sys.exit(f"unexpected schema_version: {doc.get('schema_version')!r}")
    items = doc["items"]

    # DDL via psql (purpose-built, ON_ERROR_STOP); data via psycopg (parameterized).
    subprocess.run(
        ["psql", "-h", PG["host"], "-d", PG["dbname"],
         "-X", "-q", "-w", "-v", "ON_ERROR_STOP=1", "-f", str(SCHEMA)],
        check=True,
    )

    with psycopg.connect(**PG) as conn:
        with conn.cursor() as cur:
            cur.executemany(
                f"INSERT INTO items ({', '.join(SCALAR)}, extra) "
                f"VALUES ({', '.join(['%s'] * len(SCALAR))}, %s)",
                [[it.get(c) for c in SCALAR]
                 + [Json({k: v for k, v in it.items() if k not in KNOWN})]
                 for it in items],
            )
            cur.executemany(
                "INSERT INTO deps (item_id, depends_on) VALUES (%s, %s)",
                [(it["id"], d) for it in items for d in it.get("depends_on", [])],
            )
            cur.executemany(
                "INSERT INTO refs (item_id, kind, target) VALUES (%s, %s, %s)",
                [(it["id"], r["kind"], r["target"]) for it in items for r in it.get("refs", [])],
            )
            cur.executemany(
                "INSERT INTO labels (item_id, label) VALUES (%s, %s)",
                [(it["id"], l) for it in items for l in it.get("labels", [])],
            )

        # Commit first: deferred FKs (parent/superseded_by/depends_on) are checked
        # at COMMIT, so a dangling reference fails loudly here, before we certify.
        conn.commit()

        # --- self-certify (ADR-0002): counts, invariants, full round-trip ---
        with conn.cursor() as cur:
            counts = {
                "items": (one(cur, "SELECT count(*) FROM items"), len(items)),
                "deps": (one(cur, "SELECT count(*) FROM deps"),
                         sum(len(it.get("depends_on", [])) for it in items)),
                "refs": (one(cur, "SELECT count(*) FROM refs"),
                         sum(len(it.get("refs", [])) for it in items)),
                "labels": (one(cur, "SELECT count(*) FROM labels"),
                           sum(len(it.get("labels", [])) for it in items)),
            }
            mismatched = {k: v for k, v in counts.items() if v[0] != v[1]}
            if mismatched:
                sys.exit(f"FAIL — count mismatch (db, json): {mismatched}")

            cur.execute("SELECT id, violation FROM work_status_violations ORDER BY id")
            violations = cur.fetchall()
            if violations:
                sys.exit(f"FAIL — {len(violations)} invariant violation(s): {violations}")

        rebuilt = reconstruct(conn)
        diffs = []
        for it in items:
            got = rebuilt.get(it["id"])
            if got is None:
                diffs.append(f"{it['id']}: absent from DB")
            elif normalize(it) != normalize(got):
                diffs.append(f"{it['id']}: round-trip differs\n"
                             f"    json: {normalize(it)}\n    db:   {normalize(got)}")
        if diffs:
            sys.exit("FAIL — round-trip mismatch on {} item(s):\n{}".format(
                len(diffs), "\n".join(diffs[:10])))

    print(f"OK — {len(items)} items round-trip faithfully into `{PG['dbname']}` "
          f"({counts['deps'][0]} deps, {counts['refs'][0]} refs, "
          f"{counts['labels'][0]} labels); 0 invariant violations.")


def one(cur, sql):
    cur.execute(sql)
    return cur.fetchone()[0]


if __name__ == "__main__":
    main()
