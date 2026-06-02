# Anchor role overloading in the chrome substrate

> **Dissolved deferred-items entry — closed (implemented/resolved).** Status is canonical in the work-status SSOT: see item `anchor-role-overloading` in `docs/work-status.json`. Archived here as the working-memory record of the original `docs/notes/deferred-items.md` entry.


- **Surfaced:** 2026-05-02. **Closed:** 2026-05-03 in PR
  `frontend/anchor-decouple-via-alias`. Worklog:
  `docs/archive/worklog/2026-05-v1.0-to-v1.1/2026-05-03-anchor-decouple-via-alias.md`. TODO
  Completed row: under Frontend.
- **Outcome:** Strict-scope decouple-via-alias landed for the
  two named overloading patterns. Five role aliases added to
  `theme.css` and `ChromeAnchor`: `--player-black`,
  `--player-white`, `--review-active`,
  `--review-intermission`, `--review-complete`. Six chart sites
  swept to use the new player aliases (`useEnrichedData.ts`,
  `useAnalysisProjection.ts`, `AnalysisChartPanel.vue`); three
  sites swept to use the review-state aliases (`BoardTab.vue`).
  Visual unchanged at the time of the change; future tuning can
  break the aliasing without disturbing chrome.
- **Settled direction recorded:** the decouple-via-alias
  principle and the related "color-mix derivation over
  multi-tone anchor families" preference now live as a
  "Substrate evolution" section in
  `docs/archive/notes/frontend-theming-plan.md` — settled direction for
  any future substrate-tuning PR, applicable to typography /
  spacing / animation / z-index by analogy when those SSOT
  refactors arrive.

---

License: Public Domain (The Unlicense).
