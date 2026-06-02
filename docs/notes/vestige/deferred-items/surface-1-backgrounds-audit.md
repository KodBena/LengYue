# `--surface-1` backgrounds (low-contrast on the default theme)

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status SSOT: see item `surface-1-backgrounds-audit` in `docs/work-status.json` (query: `node tools/work-status/sql.mjs "SELECT * FROM items WHERE id='surface-1-backgrounds-audit'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced:** 2026-05-29 (Phase-3 tab-editor review).
- **Concern:** `var(--surface-1)` resolves to a dark-grey on the
  default "cluster" theme; under the black default text it reads as
  low-contrast and tiring. It is almost never the right background —
  `--surface-0` is the default for content / cards / inputs, and any
  `--surface-1` should be a justified exception. The Phase-3 editor's
  `.tab-block` shipped with `--surface-1` and was fixed to `--surface-0`;
  a few other call sites still use it, unaudited.
- **Suggested next action:** `grep -rn "surface-1" frontend/src` and
  excise the non-deliberate usages (→ `--surface-0`, or annotate the
  genuine exceptions with a justification comment). Low priority —
  cosmetic/contrast, not functional. The convention is recorded in the
  assistant memory `feedback-surface-1-exception-only`.

---

License: Public Domain (The Unlicense).
