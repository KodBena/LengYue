# PV-animation defaults — pairwise-calibration question

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status store: see item `pv-animation-defaults-calibration` in the `todo` Postgres store (query: `psql -h 192.168.122.1 -d todo -c "SELECT * FROM items WHERE id='pv-animation-defaults-calibration'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced:** 2026-05-03 (during magic-literals audit Pass 1
  inventory authoring; the divergence was initially flagged
  Tier-1 in PR #98 before the user surfaced the calibration
  concern).
- **Concern:** `composables/use-pv-animation.ts:95-97` declares
  its own defaults for `stepDelayMs: 350`, `windowDurationMs:
  600`, `fadeDurationMs: 150`, `pvOpacity: 1` — the same numeric
  values that `store/defaults.ts:225-227` already owns. The
  structural shape matches the gradingParameter Item-18 finding
  (two sources of truth for the same nominal handles, no
  compiler check), and the magic-literals audit's Pass 1
  inventory initially flagged "import from `defaults.ts`" as
  the consolidation move.

  The calibration concern: the four values may be **pairwise-
  calibrated** to produce the repeating-window animation's
  intended visual rhythm — `windowDurationMs` and `stepDelayMs`
  jointly determining how many PV stones are simultaneously
  visible, `fadeDurationMs` setting their on/off envelope, and
  the ensemble being tuned-by-eye rather than each value being
  independent. If they are co-tuned, "merge to one source"
  flattens an invariant the values hold; the right move is
  *naming the calibration as a calibration* (e.g., a comment
  block or a typed `PVAnimationCalibration` shape), not removing
  the duplication. A recent fix to the PV-animation code may
  have decoupled the pairwise interaction; the user is not
  certain and the magic-literals audit isn't the place to
  determine it.

  This is a **third pattern** beyond the magic-literals audit's
  two working principles: snap-by-cluster (collapse drift) and
  decouple-via-alias (separate accidental-value-matches between
  distinct roles). **Co-tuned constants** — values whose
  individual identities are subordinate to a calibrated
  relationship — neither consolidate cleanly nor decouple
  cleanly. Recording the pattern here so the same shape, when
  encountered in future audits, gets the same treatment:
  postpone consolidation until the calibration question is
  answered.

- **Suggested next action:** Walk `use-pv-animation.ts`'s
  defaults against the composable's window logic to determine
  whether the four values are pairwise-coupled (e.g., does
  `windowDurationMs` need to be ≥ `stepDelayMs *
  (windowSize - 1) + fadeDurationMs * 2` for the intended
  rhythm?) or whether the recent fix decoupled them. If
  coupled: keep as-is, document the calibration in the file
  header, treat `defaults.ts`'s names as the entry-point
  vocabulary and the composable's local declaration as the
  calibration's authoritative implementation. If decoupled:
  standard consolidate-via-import, then close as Item-18-class
  divergence. Until investigated, the magic-literals audit's
  Pass 2 sequencing leaves this set aside (referenced in
  `magic-literals-audit-inventory.md`'s adjacent observations
  and category N verdict).

---

License: Public Domain (The Unlicense).
