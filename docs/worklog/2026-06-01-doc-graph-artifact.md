# Documentation-graph artifact — generator, manifest, SVG, validator, CI gate

- **Status:** Shipped 2026-06-01 on branch `bork/tooling/doc-graph-artifact`
  (umbrella-level). Generator runs clean; manifest is valid JSON; the SVG is
  well-formed with one clickable `URL=` per node; the freshness `--check`
  passes and is robust to HEAD advancement.
- **Genre:** Tooling — implements the `docs/notes/documentation-graph-artifact-plan.md`
  design note (the spec), which transitions to `implemented` in the same PR.
  Closes the `deferred-items.md` entry "Explicit documentation-graph artifact
  with commit-age heatmap."
- **Date:** 2026-06-01.
- **Subproject:** umbrella (the doc-graph spans the whole repo; `proxy/` is out
  of scope and is never read).

## What shipped

- **`tools/doc-graph/generate.mjs`** — a zero-dependency Node `.mjs` generator
  (consistent with the `frontend/scripts/perf-*.mjs` tooling; no venv, no
  `node_modules`). One git-driven prose-scan pass over the doc tree emits a
  machine-readable manifest, then projects four artifacts from it. Uses only
  Node built-ins + `git` + `dot`.
- **`docs/doc-graph.json`** — the manifest (source of truth):
  `{generated_at_head, head_sha, node_count, edge_count, age_buckets, nodes[],
  edges[]}`. Each node carries `path`, `genre`, `is_hub`, `first_committed`,
  `last_committed`, `commit_distance` (since last touch — the staleness
  signal), `commit_distance_since_first` (absolute age), `age_bucket`. Each edge
  carries `from`, `to`, `kind`, `site`, `resolved`.
- **`docs/doc-graph.svg`** — Graphviz `dot` → committed SVG, the **primary**
  artifact: clustered by directory, staleness-coloured per the discrete bucket
  gradient, with a per-node `URL=` so every node is a clickable hyperlink to its
  document in GitHub's blob view. Hub out-edges drawn extra-faint; archive→
  archive edges suppressed *in the picture* (not the manifest) to keep the live
  structure legible.
- **`docs/doc-graph.md`** — a thin index page: artifact links, an at-a-glance
  summary, the staleness-bucket legend, a most-stale-top-30 table, a **pruned**
  inline Mermaid block (the 10 ADRs + 3 hub docs with edges among that set — a
  readable orientation thumbnail, since the full graph and even a first-order
  hub expansion hairball), the broken-ref summary, and the regeneration note.
- **`docs/doc-graph-report.md`** — the validator REPORT, split by origin:
  dangling refs from **live** docs (genuine-action candidates) vs from **frozen
  archive** (expected historical drift), plus ambiguous refs. A report, not a
  gate.
- **`.github/workflows/doc-graph-ci.yml`** — the CI **freshness** gate. Mirrors
  the `frontend-ci.yml` posture. Installs Graphviz, checks out full history
  (`fetch-depth: 0`, needed for commit-distance), and runs
  `node tools/doc-graph/generate.mjs --check`.

## Edge extraction (prose-scan, per the design note)

Frontmatter coverage is ~2/165 docs, so edges are prose-scanned (not read from a
`references:` field). The conventions parsed:

- **ADR tokens** `ADR-NNNN` → `docs/adr/NNNN-*.md` (`adr-related`, or
  `synopsis-of` when the source is `adr-synopsis.md`).
- **Backtick repo-paths** `` `docs/…md` `` / `` `frontend/…md` `` /
  `` `backend/…md` `` → direct resolution (`path-mention`).
- **Backtick bare-filenames** `` `2026-…-foo.md` `` → unique-basename lookup;
  non-unique → `ambiguous`, no-match → `dangling` (never silently picks a
  winner — ADR-0002).
- **Dispatch filenames** `{from}-to-{to}-{topic}.md` → directed `dispatch-pair`
  edges paired by topic-cluster key.

Self-edges are dropped. Fenced code blocks and template placeholders (`X.md`,
`YYYY-…`, `NNNN`, `<…>`, `{…}`, `*` globs, `foo`/`bar` examples) are skipped per
the ADR-0005 Rule 4 code-block exemption, so the validator surfaces the
genuine-drift class rather than the false-positive flood.

## Measured counts (first run, at the design-note HEAD)

- **Nodes:** 330 documents (all of `docs/` incl. `docs/archive/`, the root
  `README`/`CLAUDE`/`FEATURES`, the `frontend/` maps + READMEs, `backend/`
  READMEs + `backend/docs/`).
- **Edges:** 1663 — 1417 resolved, 246 dangling, 0 ambiguous.
- **Dangling split:** 67 from live docs (the genuine-action candidates), 179
  from frozen archive (expected drift — ADR-0005's incremental-retrofit posture
  does not rewrite frozen history). The live count includes ~10 self-referential
  entries — this worklog and the design note quote known-broken paths (e.g.
  `docs/adr/0008-adr-meta-review.md`, `docs/INDEX.md`) as *examples* of the
  drift the validator finds; those quoted specimens get counted as live
  references. Identifiable by origin (the doc-graph's own docs); not new drift.

These are in the design note's measured ballpark (it found 471 `ADR-0002`
tokens / 1098 `docs/` backtick paths / 86 raw unresolved `docs/*.md` of which a
chunk were placeholders). My live-origin dangling count (57) is the
post-placeholder-filter, archive-excluded genuine subset; the wider raw counts
match (478 `ADR-0002`, 1317 `docs/` paths in the current, larger tree).

## Validator findings — the live-origin genuine-drift list (for the maintainer)

The 57 live-origin dangling refs are NOT auto-fixed (the spec forbids it — the
maintainer reviews first). The notable genuine-drift specimens the design note
predicted, confirmed present:

- `docs/adr/0008-adr-meta-review.md` — an ADR number that moved (0008 is now
  classification-discipline; the meta-review is RFC-0001).
- `docs/ANALYSIS_PERSISTENCE_PLAN.md`, `frontend/ANALYSIS_PERSISTENCE_PLAN.md` —
  renamed / moved files.
- `docs/archive/notes/qeubo-namespace-unification-plan.md`,
  `docs/notes/frontend-theming-plan.md` — files now at a different path.
- `docs/INDEX.md`, `docs/audits/README.md` — forward references to planned-but-
  uncreated docs (the discipline plan / RFC-0001 artifacts).
- A cluster of `frontend/docs/…`, `frontend/TODO.md`, `backend/TODO.md`,
  `backend/routers/REFERENCE.md` etc. — references describing the pre-umbrella
  layout, surviving in live orientation docs.

The full enumerated list is `docs/doc-graph-report.md`.

## Decisions (and the ones already fixed by the spec)

- **Manifest-first.** One pass → JSON manifest is the source of truth; SVG /
  Mermaid / report are projections. The validator falls out for free.
- **Heatmap = staleness via commit-distance**, discrete buckets, counts-not-
  wall-clock. Both age values in the manifest; only staleness is the gradient.
- **Docs-only node set.** `src/foo.ts` code targets in FILES.md / IDENTIFIERS.md
  are not graph edges (the path regex requires `.md`).
- **Freshness gate scoped to graph structure, not raw bytes.** The heatmap
  fields are HEAD-relative and shift uniformly as the repo advances (a doc
  untouched for one more commit is legitimately one commit staler). Byte-equality
  would spuriously fail on every later commit. The `--check` therefore compares
  the structural skeleton (node set + edges + resolution); the committed heatmap
  is an honest snapshot at last regeneration. Verified: the check stays green
  when only the HEAD-relative numbers shift, and fails on a real node/edge change.
- **Self-artifacts are projections, not nodes.** `docs/doc-graph.{json,svg,md}` +
  the report are excluded from the node set (avoids the self-reference
  instability where the artifact's own commit-distance flips null→0 on first
  commit) but resolve as link targets so a reference to `docs/doc-graph.md` does
  not dangle.

## Dependency note — Graphviz `dot`

`dot` is a hard dependency for the SVG projection. The generator shells out to
`dot` and **fails loudly** (ADR-0002) if it is absent — it does not silently
skip the SVG — and `renderSvg` runs before any file is written, so a missing
`dot` leaves no half-written artifacts. `dot` was **not installed** in the
implementation sandbox (`dot -V` → not found, and `sudo` install was blocked by
interactive-auth). For local verification only, the artifacts were rendered via
a non-committed WASM-`dot` shim (`@hpcc-js/wasm-graphviz`) placed on `PATH`; the
committed generator is unchanged and uses the real `dot` binary. The CI workflow
installs `graphviz` via `apt-get`. **Maintainer action:** install graphviz
locally (`zypper install graphviz`) to regenerate the artifact by hand.

## Verification performed

- `node --check` on the generator (syntax clean).
- Manifest parses as JSON; node/edge counts stable across reruns (idempotent).
- SVG parses as well-formed XML; 327 `xlink:href` = 327 nodes; sampled node URLs
  resolve to real repo files (`../docs/adr/0002-…md` etc.).
- `--check` passes on fresh artifacts, stays green under simulated HEAD-relative
  number drift, and fails (exit 1, clear message) on a simulated structural
  change.
- `dot`-absent path fails loudly with an install hint and writes nothing.

## License

Public Domain (The Unlicense).
