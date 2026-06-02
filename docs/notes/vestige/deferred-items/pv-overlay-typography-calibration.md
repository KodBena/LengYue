# PV-overlay typography proportions — calibration question

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status SSOT: see item `pv-overlay-typography-calibration` in `docs/work-status.json` (query: `node tools/work-status/sql.mjs "SELECT * FROM items WHERE id='pv-overlay-typography-calibration'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced:** 2026-05-03 (during magic-literals audit Pass 2
  Tier-1 #3 — the geometry substrate. The audit's named
  triggering specimen was the `* 0.88` PV-stone-radius variant
  removed earlier; the geometry PR closes the `* 0.46` and
  `* 0.4` clusters by introducing `STONE_RADIUS_RATIO` and
  `MARKER_INNER_RATIO` in `engine/constants.ts`. Five
  PV-overlay-specific multipliers in `MoveSuggestions.vue`
  remain unaddressed and are the subject of this entry.)
- **Concern:** `MoveSuggestions.vue` carries five
  stoneR-relative multipliers for the suggestion / PV-preview
  overlay typography:

  | Site             | Expression          | Role                                                                |
  |------------------|---------------------|---------------------------------------------------------------------|
  | line 160         | `stoneR * 1.01`     | suggestion cluster ring radius (1% wider than stone — outline)      |
  | line 193         | `stoneR * 0.72`     | suggestion winrate-label font-size (primary text, e.g. "53%")       |
  | line 200         | `stoneR * 0.62`     | suggestion score-label vertical offset (positioning, not size)      |
  | line 202         | `stoneR * 0.58`     | suggestion score-label font-size (secondary text, e.g. "+2")        |
  | line 229         | `stoneR * 0.82`     | PV-preview move-number label font-size (overlaid on PV stones)      |

  The font-size triple (0.58 / 0.72 / 0.82) is honestly a
  typographic hierarchy: secondary text < primary text <
  PV-preview text, with the score-label offset (0.62) coupled
  to the font-size relationship. The 1.01 outline is mostly
  independent (just-larger-than-stone for the stroke). These
  values are likely **co-calibrated by eye** for the PV
  preview's visual rhythm — they're not drift, they're a tuned
  typography hierarchy.

  This is the same shape as the use-pv-animation defaults
  deferral (recorded above): the magic-literals audit's two
  working principles (snap-by-cluster and decouple-via-alias)
  don't apply. Naming them individually as constants without
  also naming the calibration would lose the context that the
  values are meant to relate to each other in a specific way.

- **Suggested next action:** When the user prioritises a
  PV-overlay typography revisit (e.g. as part of the broader
  font-size scale substrate for the Tier-2 sweep, or as a
  standalone polish pass), walk the MoveSuggestions overlay
  and decide whether to (a) name the calibration explicitly
  (e.g. a `pvTypography = { winrate: 0.72, score: 0.58, scoreOffset: 0.62, pvLabel: 0.82 }`
  object with a doc comment naming the relationships and the
  by-eye tuning rationale), (b) consolidate to the broader
  font-size scale if the PV preview's text sizes turn out to
  align with chrome typography tiers, or (c) leave inline
  with `magic-literal:` comments naming the calibration.
  The 1.01 outline can be split off cleanly as
  `SUGGESTION_OUTLINE_RATIO` if useful or left inline. Until
  investigated, the magic-literals audit's Pass 2 sequencing
  leaves these set aside (referenced in
  `magic-literals-audit-inventory.md`'s adjacent observations
  and the geometry-ratios PR's worklog).

- **Partial resolution (2026-05-22):** the `magic-literal: 60ms
  suggestion-ring/disk fade` block that previously sat alongside
  these five multipliers and referenced this entry has been
  promoted to a user-controlled knob
  (`display.move-suggestions-fade-ms`, range [0, 200] ms,
  default 60). The original deferral rationale ("calibration
  context would be lost if we extracted the value individually")
  no longer applies for that piece — the user is now the one
  choosing the calibration. The five typography multipliers
  documented above remain deferred; only the fade duration
  was promoted.

---

License: Public Domain (The Unlicense).
