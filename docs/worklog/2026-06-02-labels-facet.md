# Worklog — work-status labels facet (2026-06-02)

## What

A multi-valued `labels` facet on work-status items — GitHub-style tags for free
specificity (a perf bug is `["bug", "performance"]`). Implements the
`work-status-labels-facet` item.

## Why this shape (not a kind-taxonomy)

The maintainer wanted to specify an item's *kind* (bug / architectural-cruft /
performance / …) without a deep `issue | feature | refactor | …` hierarchy.
The relation that motivates a hierarchy — *an issue need not be a bug, but a bug
is always an issue* — is real, but carrying it to its limit is the ADR-0008
forced-classification trap. GitHub solved the same problem with **flat,
long-lived, battle-tested labels**, and that is what this is: kind-ness is a
label, not a top-level split, and an item is simply left unlabeled when no label
honestly fits (ADR-0008 negative register).

## Mechanism

- **Schema** (`docs/work-status.schema.json`): `labels` is an optional
  `array` with `uniqueItems`, each item drawn from a **closed-but-amendable**
  enum — `bug, feature, performance, refactor, architectural-cruft,
  investigation, docs, tooling, test, ux, security`. An unknown value is an
  error (widen the enum deliberately, ADR-0002/0008); the values are **disjoint
  from every other facet enum**.
- **Checker** (`check.mjs`): the generic validator already enforced
  array-of-enum, extended here with `uniqueItems`; the **enum-disjointness
  meta-lint now also covers `items.enum`**, so a label colliding with a
  scope/tier/etc. value fails loud (e.g. a future label `backend` would be
  caught). Three selftest cases added (bad value, collision, duplicate).
- **Query** (`sql.mjs`): a `labels(item_id, label)` table, mirroring
  `refs`/`deps`. Filter by label —
  `SELECT i.id FROM items i JOIN labels l ON l.item_id=i.id WHERE l.label='performance'`.
- **Backfill**: 73 of 76 items labeled by confident primary kind; 3 left
  unlabeled (the two PV-calibration items + `rename-tag`) per ADR-0008. Backfill
  is incremental and labels are reversible — adjust freely. Initial histogram:
  feature 22, refactor 15, architectural-cruft 11, performance 11, tooling 10,
  bug 7, investigation 7, docs 4, ux 4, test 2 (`security` allowed but unused).

## Verification

`check.mjs` PASS (76 items, 0 advisory); `check.mjs --selftest` 15/15;
`sql.mjs --selftest` round-trips the labels table; sample label queries return.

## Files

- `docs/work-status.schema.json` (labels property)
- `tools/work-status/check.mjs` (uniqueItems + disjointness items.enum + 3 cases)
- `tools/work-status/sql.mjs` (labels table)
- `docs/work-status.json` (labels backfill + this item closed)
- `docs/TODO.md` (projection refresh — the item left the open index)

License: Public Domain (The Unlicense).
