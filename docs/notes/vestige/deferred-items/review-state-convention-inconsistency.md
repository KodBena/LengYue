# Review-state convention inconsistency between App.vue and BoardTab.vue

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status store: see item `review-state-convention-inconsistency` in the `todo` Postgres store (query: `psql -h 192.168.122.1 -d todo -c "SELECT * FROM items WHERE id='review-state-convention-inconsistency'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced:** 2026-05-03 (during the audit pass for the
  anchor-decouple-via-alias PR).
- **Concern:** Two sites render review-session lifecycle state
  with different anchor choices for what looks like the same
  conceptual state.
  - `BoardTab.vue` `.review-complete` → `--state-success`
    (green).
  - `App.vue` review-state ternary line ~331 →
    `--accent-secondary` (orange) when
    `reviewSession.state.value === 'FINISHED'`,
    `--state-attention` (red) otherwise.

  Either the two sites mean different things (e.g., App.vue's
  "FINISHED" indicator is meant to read as "session ended, take
  next action," while BoardTab's `.review-complete` is meant to
  read as "this card's review is done"), in which case they're
  legitimately different anchors and need clearer naming; or
  they're meant to render the same state and one of them is
  off-convention.

- **Suggested next action:** Decide what each site is rendering,
  then either adopt the new `--review-active` /
  `--review-intermission` / `--review-complete` aliases on
  App.vue too (if the conceptual state matches BoardTab) or
  introduce a separate anchor for the App.vue indicator. Either
  way, the visible inconsistency is recorded for explicit
  resolution rather than silent drift.

---

License: Public Domain (The Unlicense).
