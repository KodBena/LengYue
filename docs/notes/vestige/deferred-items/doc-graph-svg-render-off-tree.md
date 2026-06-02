# Doc-graph SVG — render off-tree (committed SVG removed as interim honest step)

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status SSOT: see item `doc-graph-svg-render-off-tree` in `docs/work-status.json` (query: `node tools/work-status/sql.mjs "SELECT * FROM items WHERE id='doc-graph-svg-render-off-tree'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced / decided:** 2026-06-01.
- **State:** `docs/doc-graph.svg` was **removed from the repository** and
  `.gitignore`d. It re-layouts wholesale on any structural change and GitHub
  counts every line of it — and `.gitattributes -diff` does **not** decount on
  GitHub (it only affects local `git`), confirmed on PRs #332 and #334. The
  committed manifest (`docs/doc-graph.json`) stays the source of truth; the
  generator still renders the SVG locally (`node tools/doc-graph/generate.mjs`,
  needs `dot`) for browsing. Per the maintainer: links inside the SVG no longer
  resolve on GitHub (it isn't there), but the local picture is still useful.
  This is the interim honest step; the real fix is below.
- **The honest fix (planned):** render the SVG *off the counted tree* — a CI job
  renders from the committed manifest and publishes to a dedicated render branch
  (GitHub renders a committed `.svg` in the blob view with `xlink:href` links
  intact) or to GitHub Pages, with the index linking to it. Pairs with sorting
  the committed manifest's edges deterministically so a structural change is a
  minimal JSON diff. A contained tooling arc, separable from the broader
  doc-graph consolidation (the "ADR-effectiveness audits" entry above).
- **Where:** `tools/doc-graph/generate.mjs` (`renderSvg` / `writeArtifacts` /
  `checkDrift`), `.gitignore`, `.gitattributes`, `docs/doc-graph.md`.

---

License: Public Domain (The Unlicense).
