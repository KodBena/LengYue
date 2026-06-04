# Doc-graph SVG — Graphviz `dot` orth/curve spline-routing layout failure

> **Dissolved deferred-items entry — open.** Work status is canonical in the work-status store: see item `doc-graph-svg-spline-failure` in the `todo` Postgres store (query: `psql -h 192.168.122.1 -d todo -c "SELECT * FROM items WHERE id='doc-graph-svg-spline-failure'"`). This file preserves the working-memory prose of the original `docs/notes/deferred-items.md` entry and carries no authoritative status of its own. It moves to `docs/archive/notes/vestige/deferred-items/` when the item ships.


- **Surfaced:** 2026-06-01 (doc-graph artifact CI, PR #330).
- **Symptom:** rendering the full doc-graph (`dot -Tsvg`, ~330 nodes / 1663
  edges) makes `dot` exit non-zero with `Error: in routesplines, cannot find
  NORMAL edge` while still emitting a complete SVG. It is **not** "just a
  warning to ignore" — it is a real **layout failure in dot's orthogonal /
  curved spline routing** for at least one edge on this large, clustered,
  hub-heavy graph (the failed edge is routed degenerately or dropped). It is
  also **not critical** — the manifest is the source of truth and the picture
  is a projection; one mis-routed edge among 1663 doesn't compromise the
  artifact's usefulness.
- **Current handling (stopgap, not a fix):** `tools/doc-graph/generate.mjs`
  `renderSvg` tolerates the non-zero exit — it uses the SVG `dot` produced
  and logs the warning, failing loud only on genuinely-empty output (so CI's
  freshness gate passes). This swallows the symptom; it does not address the
  layout failure.
- **Investigate when convenient:** which edge(s) fail routing and why; whether
  it's the `splines=` mode (ortho/curved/polyline), the hub-edge bundling,
  the directory clustering, or a degenerate self-/parallel-edge interacting
  with the spline router. Likely fixes: a different `splines` setting, more
  aggressive hub-edge pruning in the *picture* (manifest unaffected), or a
  layout tweak. Version-sensitive — surfaces on CI's apt `dot` (older), not on
  local graphviz 14.1.2 — so reproduce against the apt version.
- **Where:** `tools/doc-graph/generate.mjs` (`buildDot` / `renderSvg`).

---

License: Public Domain (The Unlicense).
