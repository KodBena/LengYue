# Explicit documentation-graph artifact with commit-age heatmap

> **Dissolved deferred-items entry — closed (implemented/resolved).** Status is canonical in the work-status SSOT: see item `doc-graph-artifact` in `docs/work-status.json`. Archived here as the working-memory record of the original `docs/notes/deferred-items.md` entry.


- **Implemented:** 2026-06-01 on branch `bork/tooling/doc-graph-artifact`.
  Generator at `tools/doc-graph/generate.mjs` (zero-dep Node, shells out to
  `dot`); committed artifacts `docs/doc-graph.{json,svg,md}` +
  `docs/doc-graph-report.md`; CI freshness gate at
  `.github/workflows/doc-graph-ci.yml`. Measured: 330 doc nodes,
  1663 edges (1417 resolved, 246 dangling — 67 from live docs / 179 expected
  archive drift — 0 ambiguous). Worklog:
  `docs/worklog/2026-06-01-doc-graph-artifact.md`; design note (the spec)
  transitioned to `implemented`.
- **Surfaced:** 2026-06-01. The documentation graph (the READMEs, the
  handoff, the ten ADRs, the CLAUDE.md tree, FILES.md / IDENTIFIERS.md,
  the growing `docs/notes/` incl. the consult records, decisions-deferred,
  this ledger) is now heavy even from a bird's-eye view — hard to hold the
  whole cross-reference structure in one's head, and hard to see at a
  glance which nodes have gone stale.
- **Want:** an explicit, maintained graph of the documentation —
  - **Nodes** = the docs; **edges** = the cross-references between them
    (the doc-graph the project already curates by hand — handoff→ADRs,
    FILES.md↔IDENTIFIERS.md, consults↔decisions-deferred, etc.).
  - **Age heatmap:** each node gradient-coloured by a *discrete* age bucket
    = commit-distance from when the document was committed (fresh → stale),
    so neglected corners of the graph surface visually.
  - **Format:** open — `mermaid` renders natively in GitHub markdown (no
    toolchain; reads on GitHub directly), Graphviz `.dot` has richer layout
    for a heavy graph but needs a render step (e.g. CI → SVG). Decide at
    pickup; the machine-readable requirement below is orthogonal to it.
- **Hard requirement — machine-readable semantics.** Any semantic content
  shown *in practice* (the age encoding above all) must be machine-readable,
  not merely a colour the maintainer eyeballs. The age value lives in the
  data — a labelled node attribute or an accompanying manifest — not only in
  the rendered pixels, so tooling (a freshness check, a "stale docs" report,
  the generator itself) can consume it and the gradient is a *projection* of
  machine-readable data, not the source of truth.
- **Open questions for pickup:**
  - **Generation must be scripted, not hand-drawn** — a hand-maintained
    graph would itself become the stalest node (the meta-irony). A
    git-driven generator: enumerate the doc set, compute each doc's
    commit-distance (`git log`), derive edges by scanning for doc-path
    references, emit {graph + machine-readable age manifest} from one pass.
  - **Node / edge boundary** — which docs are nodes (all of `docs/` + the
    CLAUDE.md tree + the root maps? include `docs/archive/`?), and what
    counts as an edge (any path mention, or markdown links only).
  - **Age semantics + bucketing** — "from when the document was committed"
    reads as distance-since-last-touched (staleness) vs since-first-committed
    (absolute age); clarify which, and the discrete bucket thresholds.
  - **Location + the artifact's own freshness** — committed-and-regenerated
    (a script / CI hook) vs generated on demand; if committed, it needs the
    same regeneration discipline its own heatmap is meant to flag.
- **Cross-references:** composes with ADR-0005 (documentation discipline)
  and the umbrella "Documentation is part of the work" rule — this makes the
  doc-graph's *shape and staleness* a first-class inspectable artifact rather
  than an implicit structure carried in maintainer memory.
- **Design note (2026-06-01):** `docs/notes/documentation-graph-artifact-plan.md`
  works the open questions above (manifest-first → the picture + a doc-link
  *validator* fall out of one pass; staleness via commit-distance, both values
  in the manifest; `dot`→committed `.svg` primary + pruned Mermaid; docs-only
  nodes, typed/directed edges; committed + CI-verified-fresh). Sibling to the
  `doc-graph-discipline-plan.md` frontmatter-substrate plan, not a replacement.
  Implemented 2026-06-01 (see the **Implemented** line at the top of this entry).

---

License: Public Domain (The Unlicense).
