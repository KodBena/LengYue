#!/usr/bin/env node
/**
 * tools/doc-graph/generate.mjs
 *
 * Documentation-graph artifact generator (umbrella-level tooling).
 *
 * One git-driven prose-scan pass over the repo's documentation tree emits a
 * machine-readable manifest `{nodes, edges}` (the source of truth), then
 * projects four artifacts from it:
 *
 *   - `docs/doc-graph.json`   — the manifest (machine-readable substrate).
 *   - `docs/doc-graph.svg`    — Graphviz `dot` → committed SVG (primary;
 *                               per-node `URL=` so nodes are clickable in
 *                               GitHub's blob view; clustered by directory;
 *                               hub edges bundled/faint).
 *   - `docs/doc-graph.md`     — thin index page carrying a pruned Mermaid
 *                               block + a human-readable staleness table +
 *                               the broken-reference report + a manifest link.
 *   - `docs/doc-graph-report.md` — the validator REPORT (genuine dangling /
 *                               ambiguous cross-references, after the
 *                               ADR-0005 Rule 4 code-block/placeholder filter).
 *
 * Design note (the SPEC): `docs/notes/documentation-graph-artifact-plan.md`.
 * Substrate plan: `docs/notes/doc-graph-discipline-plan.md`.
 * Originating entry: `docs/notes/deferred-items.md`.
 *
 * Manifest-first (the load-bearing inversion): the picture and the validator
 * are both projections of the same manifest. Per ADR-0002, the validator
 * never silently picks a winner for an ambiguous bare-filename reference — it
 * marks `resolved: "ambiguous"` / `resolved: "dangling"` and surfaces it.
 *
 * Heatmap: staleness via commit-distance (`git rev-list --count
 * <last-touch-sha>..HEAD`), discrete buckets, counts-not-wall-clock. Both age
 * values (since-last-touch AND since-first-commit) live in the manifest; the
 * gradient projects staleness only.
 *
 * `dot` (Graphviz) is a hard dependency: if it is absent the generator fails
 * loudly (ADR-0002) rather than silently skipping the SVG. Install graphviz
 * to render the artifact.
 *
 * Usage:
 *   node tools/doc-graph/generate.mjs            # regenerate all artifacts
 *   node tools/doc-graph/generate.mjs --check    # fail if committed artifacts
 *                                                # drift from a fresh run (CI)
 *
 * Zero runtime dependencies (Node built-ins + `git` + `dot`), consistent with
 * the `frontend/scripts/perf-*.mjs` tooling — no venv, no node_modules.
 *
 * License: Public Domain (The Unlicense)
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, basename, posix } from "node:path";

// ── Substrate tokens (magic-literals discipline) ────────────────────────────

/** Repo root = two levels up from tools/doc-graph/. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Output artifact paths, repo-relative. */
const OUT_JSON = "docs/doc-graph.json";
const OUT_SVG = "docs/doc-graph.svg";
const OUT_INDEX = "docs/doc-graph.md";
const OUT_REPORT = "docs/doc-graph-report.md";

/**
 * Discrete staleness buckets, keyed on commit-distance since last touch
 * (`git rev-list --count <last-touch>..HEAD`). Counts, not wall-clock —
 * consistent with the project's counts-not-wall-clock perf posture and immune
 * to the "no commits for a week" calendar artifact. Thresholds are the design
 * note's defensible defaults (§The heatmap). magic-literal: bucket cutoffs are
 * a tuning surface, not a substrate token — named here as the single source.
 */
const AGE_BUCKETS = [
  { name: "fresh", maxDistance: 20, color: "#1a9850" }, // ≤ 20 commits behind HEAD
  { name: "recent", maxDistance: 80, color: "#a6d96a" }, // ≤ 80
  { name: "aging", maxDistance: 250, color: "#fdae61" }, // ≤ 250
  { name: "stale", maxDistance: Infinity, color: "#d73027" }, // > 250
];

/**
 * Directory genres → cluster grouping + node tint. The genre is derived from
 * the node's location in the tree (the doc tree already partitions by genre,
 * per doc-graph-discipline-plan.md §4). magic-literal: cluster colours are a
 * presentation choice, named here as the single source.
 */
const GENRE_BY_PREFIX = [
  { prefix: "docs/adr/", genre: "adr", clusterColor: "#e8eef7" },
  { prefix: "docs/rfcs/", genre: "rfc", clusterColor: "#f0e8f7" },
  { prefix: "docs/dispatch/", genre: "dispatch", clusterColor: "#f7f0e8" },
  { prefix: "docs/worklog/", genre: "worklog", clusterColor: "#eef7e8" },
  { prefix: "docs/playbooks/", genre: "playbook", clusterColor: "#e8f7f4" },
  { prefix: "docs/archive/", genre: "archive", clusterColor: "#eeeeee" },
  { prefix: "docs/notes/", genre: "note", clusterColor: "#f7f7e8" },
  { prefix: "docs/", genre: "doc-root", clusterColor: "#f4f4ff" },
  { prefix: "frontend/", genre: "subproject-frontend", clusterColor: "#e8f4f7" },
  { prefix: "backend/", genre: "subproject-backend", clusterColor: "#f7e8ee" },
  { prefix: "", genre: "umbrella-root", clusterColor: "#ffffff" },
];

/**
 * Edge kinds and their projection styling. Direction is kept on every edge.
 *   - adr-related   : an `ADR-NNNN` token cited in prose (directed A→ADR).
 *   - path-mention  : a backtick repo-path cited in prose (directed A→B).
 *   - dispatch-pair : a {from}-to-{to}-{topic} filename pairing (directed).
 *   - synopsis-of   : the adr-synopsis → every-ADR fan-out (distinct kind so
 *                     it can be filtered out of the "interesting" view).
 * magic-literal: edge stroke/penwidth are presentation, named here as SoT.
 */
const EDGE_STYLE = {
  "adr-related": { color: "#3b6ea5", penwidth: 1.1, style: "solid" },
  "path-mention": { color: "#999999", penwidth: 0.6, style: "solid" },
  "dispatch-pair": { color: "#b5651d", penwidth: 1.4, style: "bold" },
  "synopsis-of": { color: "#cccccc", penwidth: 0.4, style: "dashed" },
};

/**
 * Hub nodes that hairball a naive draw (measured in the design note: these
 * three are star-centres). Their out-edges are drawn faint and the inline
 * Mermaid projection prunes to first-order structure around them. The manifest
 * stays complete; only the picture is pruned. magic-literal: hub set is an
 * empirical layout-legibility choice, named here as the single source.
 */
const HUB_NODES = new Set([
  "docs/adr-synopsis.md",
  "docs/handoff-current.md",
  "docs/TODO.md",
]);

/** The adr-synopsis fan-out source — its ADR citations are `synopsis-of`. */
const SYNOPSIS_NODE = "docs/adr-synopsis.md";

/** Mermaid pruned-view node budget: ADRs + hubs + their first-order edges. */
const MERMAID_INCLUDE_GENRES = new Set(["adr"]);

// ── Node enumeration ─────────────────────────────────────────────────────────

/**
 * Directories scanned for documentation nodes, repo-relative. `proxy/` is out
 * of scope (submodule, own conventions) and is never read.
 */
const SCAN_DIRS = ["docs"];

/** Explicit single-file nodes outside the scanned dirs (root + sub-project). */
const EXTRA_NODE_FILES = [
  "README.md",
  "CLAUDE.md",
  "FEATURES.md",
  "frontend/README.md",
  "frontend/CLAUDE.md",
  "frontend/FILES.md",
  "frontend/IDENTIFIERS.md",
  "backend/README.md",
  "backend/CLAUDE.md",
];

/** Recursively collect `.md` files under a repo-relative directory. */
function collectMarkdown(relDir) {
  const out = [];
  const abs = join(REPO_ROOT, relDir);
  if (!existsSync(abs)) return out;
  for (const entry of readdirSync(abs)) {
    const childRel = posix.join(relDir, entry);
    const childAbs = join(REPO_ROOT, childRel);
    const st = statSync(childAbs);
    if (st.isDirectory()) {
      out.push(...collectMarkdown(childRel));
    } else if (entry.endsWith(".md")) {
      out.push(childRel);
    }
  }
  return out;
}

/**
 * The generator's own `.md`/`.json`/`.svg` artifacts are *projections* of the
 * graph, not documentation nodes within it — excluding them from the node set
 * keeps the artifact from appearing in its own picture and, crucially, avoids
 * the self-reference instability where the artifact's own commit-distance flips
 * (null → 0) the moment it is first committed. They are excluded from both
 * nodes and edge-sources. The index page links to its siblings via plain
 * markdown links (not backtick repo-paths), so the path-mention scan in
 * authored docs never produces a dangling edge to them either.
 */
const SELF_ARTIFACTS = new Set([OUT_INDEX, OUT_REPORT, OUT_JSON, OUT_SVG]);

/** Enumerate every documentation node, repo-relative, sorted, de-duplicated. */
function enumerateNodes() {
  const set = new Set();
  for (const dir of SCAN_DIRS) for (const f of collectMarkdown(dir)) set.add(f);
  // backend/docs/ is the sole sub-project doc tree (per the discipline plan §6).
  for (const f of collectMarkdown("backend/docs")) set.add(f);
  for (const f of EXTRA_NODE_FILES) if (existsSync(join(REPO_ROOT, f))) set.add(f);
  for (const f of SELF_ARTIFACTS) set.delete(f);
  return [...set].sort();
}

// ── Git commit-distance (the heatmap substrate) ──────────────────────────────

/** HEAD commit count — the reference point for commit-distance. */
function headCommitCount() {
  return Number(git(["rev-list", "--count", "HEAD"]).trim());
}

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

/**
 * For a node, returns { firstCommitted, lastCommitted, distanceLastTouch,
 * distanceFirstCommit }. Distances are commit-counts behind HEAD. A node with
 * no commit history yet (newly created, unstaged) fails loudly: its age is
 * undefined and the caller must decide — we surface distance:null rather than
 * coercing a sentinel (ADR-0002, the silent-default class the umbrella memory
 * flags at contract boundaries).
 */
function nodeAge(relPath) {
  const lastSha = git(["log", "-1", "--format=%H", "--", relPath]).trim();
  const firstSha = git(["log", "--reverse", "--format=%H", "--", relPath])
    .trim()
    .split("\n")[0];
  if (!lastSha || !firstSha) {
    return {
      firstCommitted: null,
      lastCommitted: null,
      distanceLastTouch: null,
      distanceFirstCommit: null,
    };
  }
  const lastDate = git(["log", "-1", "--format=%cs", "--", relPath]).trim();
  const firstDate = git(["log", "-1", "--format=%cs", firstSha]).trim();
  const distLast = Number(git(["rev-list", "--count", `${lastSha}..HEAD`]).trim());
  const distFirst = Number(git(["rev-list", "--count", `${firstSha}..HEAD`]).trim());
  return {
    firstCommitted: firstDate,
    lastCommitted: lastDate,
    distanceLastTouch: distLast,
    distanceFirstCommit: distFirst,
  };
}

function bucketFor(distanceLastTouch) {
  if (distanceLastTouch === null) return "uncommitted";
  for (const b of AGE_BUCKETS) if (distanceLastTouch <= b.maxDistance) return b.name;
  return AGE_BUCKETS[AGE_BUCKETS.length - 1].name;
}

function genreFor(relPath) {
  for (const g of GENRE_BY_PREFIX) if (relPath.startsWith(g.prefix)) return g.genre;
  return "umbrella-root";
}

// ── Edge extraction (prose-scan) ─────────────────────────────────────────────

const ADR_TOKEN_RE = /ADR-([0-9]{4})/g;
const BACKTICK_PATH_RE = /`((?:docs|frontend|backend)\/[^`\n]+?\.md)`/g;
const BACKTICK_BARENAME_RE = /`([0-9]{4}-[^`\n/]+?\.md)`/g;
const FENCE_RE = /^```/;

/**
 * Placeholder patterns ADR-0005 Rule 4 exempts (template / worked-example
 * filenames, not real references). The validator skips these so it does not
 * flood with the false-positive class — the design note's measured concern
 * (86 raw unresolved `docs/*.md` of which a chunk are `X.md` / `YYYY-…` /
 * `docs/audits/README.md`-style placeholders inside worked examples).
 * magic-literal: placeholder shapes are the Rule-4 exemption spec, named here
 * as the single source.
 *
 * The patterns, in order:
 *   - template tokens:   X.md, N.md, NNNN, YYYY, MM-DD, XX
 *   - angle/brace holes: <topic>, {from}, {1,2,3} brace-expansion
 *   - glob wildcards:    `*` anywhere (e.g. `docs/dispatch/backend-to-frontend-*.md`)
 *   - ellipsis:          `...` (e.g. `0004-...md`)
 *   - example basenames: foo / bar / baz (case-insensitive) as the stem
 */
const PLACEHOLDER_RE =
  /(^|\/)(X\.md$|N\.md$)|XX|YYYY|MM-DD|NNNN|<[^>]+>|\{[^}]+\}|\*|\.\.\.|(^|[-/])(foo|bar|baz)(\.md$|[-.])/i;

function isPlaceholder(refPath) {
  return PLACEHOLDER_RE.test(refPath);
}

/**
 * Strip fenced code blocks from a doc body so refs inside them are not scanned
 * (ADR-0005 Rule 4: filenames in code blocks are fine, not edges). Returns the
 * body with fenced regions replaced by blank lines (preserving line counts is
 * unnecessary here; we only scan the remainder for references).
 */
function stripFencedCode(body) {
  const lines = body.split("\n");
  const out = [];
  let inFence = false;
  for (const line of lines) {
    if (FENCE_RE.test(line.trimStart())) {
      inFence = !inFence;
      out.push("");
      continue;
    }
    out.push(inFence ? "" : line);
  }
  return out.join("\n");
}

/** Map `ADR-NNNN` → the canonical adr filepath, by unique-prefix lookup. */
function buildAdrIndex(nodes) {
  const idx = new Map(); // "0002" → "docs/adr/0002-*.md"
  for (const n of nodes) {
    const m = n.match(/^docs\/adr\/([0-9]{4})-[^/]+\.md$/);
    if (m) idx.set(m[1], n);
  }
  return idx;
}

/** Build a basename → [paths] index for unique-basename bare-filename lookup. */
function buildBasenameIndex(nodes) {
  const idx = new Map(); // "foo.md" → [paths]
  for (const n of nodes) {
    const b = basename(n);
    if (!idx.has(b)) idx.set(b, []);
    idx.get(b).push(n);
  }
  return idx;
}

/**
 * Extract every edge from one node's body. Self-edges are dropped. Each edge
 * carries {from, to, kind, site, resolved}. `site` records the literal token
 * scanned (for the report). `resolved` is one of:
 *   "resolved"  — target exists in the node set (or is a self-artifact target).
 *   "dangling"  — target does not resolve to any node (genuine drift or typo).
 *   "ambiguous" — bare-filename matched more than one node (never guess —
 *                 ADR-0002).
 * Non-`.md` repo-paths (e.g. `src/foo.ts` code targets in FILES.md /
 * IDENTIFIERS.md) are not scanned at all: the path regex requires a `.md`
 * suffix, so the docs-only node set (per the design note) never sees them.
 */
function extractEdges(from, rawBody, ctx) {
  const { nodeSet, adrIndex, basenameIndex } = ctx;
  const body = stripFencedCode(rawBody);
  const edges = [];
  const seen = new Set(); // dedupe (to,kind) within a node

  const push = (to, kind, site, resolved) => {
    if (to === from) return; // drop self-edges
    const key = `${to}|${kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from, to, kind, site, resolved });
  };

  // 1. ADR tokens → docs/adr/NNNN-*.md
  for (const m of body.matchAll(ADR_TOKEN_RE)) {
    const num = m[1];
    const target = adrIndex.get(num);
    const kind = from === SYNOPSIS_NODE ? "synopsis-of" : "adr-related";
    if (target) push(target, kind, `ADR-${num}`, "resolved");
    else push(`docs/adr/${num}-*.md`, kind, `ADR-${num}`, "dangling");
  }

  // 2. Backtick repo-paths → direct resolution against the node set.
  for (const m of body.matchAll(BACKTICK_PATH_RE)) {
    const ref = m[1].replace(/[#:].*$/, ""); // drop #anchor / :line suffix
    if (isPlaceholder(ref)) continue;
    if (nodeSet.has(ref)) push(ref, "path-mention", `\`${m[1]}\``, "resolved");
    else if (SELF_ARTIFACTS.has(ref)) {
      // The generator's own artifacts resolve but are not graph nodes (they are
      // projections — see SELF_ARTIFACTS). A reference to e.g. `docs/doc-graph.md`
      // is honest, not drift; resolve it without giving it a manifest row.
      push(ref, "path-mention", `\`${m[1]}\``, "resolved");
    } else if (ref.endsWith(".md")) {
      // A .md target that is not a node: genuine dangling reference. (Non-.md
      // code targets are excluded by the regex; docs-only node set per spec.)
      push(ref, "path-mention", `\`${m[1]}\``, "dangling");
    }
  }

  // 3. Backtick bare-filenames → unique-basename lookup (the recall seam).
  for (const m of body.matchAll(BACKTICK_BARENAME_RE)) {
    const bare = m[1];
    if (isPlaceholder(bare)) continue;
    const matches = basenameIndex.get(bare) || [];
    if (matches.length === 1) push(matches[0], "path-mention", `\`${bare}\``, "resolved");
    else if (matches.length === 0) push(bare, "path-mention", `\`${bare}\``, "dangling");
    else push(bare, "path-mention", `\`${bare}\``, "ambiguous"); // never guess
  }

  return edges;
}

/**
 * Dispatch-pair edges, derived from filenames (not body prose). A dispatch
 * `{from}-to-{to}-{topic}.md` encodes a directed cross-team edge. Where a
 * reverse `{to}-to-{from}-{topic*}.md` exists sharing the topic-cluster key,
 * the pair is linked request↔response. We emit the directed filename→filename
 * edge for every dispatch whose counterpart shares the leading topic key.
 */
function dispatchPairEdges(nodes) {
  const edges = [];
  const dispatches = nodes.filter((n) => n.startsWith("docs/dispatch/"));
  // Parse {from}-to-{to}-{topic}.
  const parsed = dispatches.map((n) => {
    const base = basename(n).replace(/\.md$/, "");
    const m = base.match(/^([a-z]+)-to-([a-z]+)-(.+)$/);
    return m ? { node: n, from: m[1], to: m[2], topic: m[3] } : null;
  }).filter(Boolean);
  for (const a of parsed) {
    for (const b of parsed) {
      if (a.node === b.node) continue;
      // Counterpart: reversed direction, topic-cluster overlap (shared prefix).
      if (a.to === b.from && a.from === b.to) {
        const keyA = a.topic.split("-").slice(0, 4).join("-");
        const keyB = b.topic.split("-").slice(0, 4).join("-");
        if (keyA === keyB || a.topic.startsWith(keyB) || b.topic.startsWith(keyA)) {
          edges.push({
            from: a.node,
            to: b.node,
            kind: "dispatch-pair",
            site: `${a.from}→${a.to} ↔ ${b.from}→${b.to}`,
            resolved: "resolved",
          });
        }
      }
    }
  }
  return edges;
}

// ── Manifest assembly ────────────────────────────────────────────────────────

function buildManifest() {
  const nodes = enumerateNodes();
  const nodeSet = new Set(nodes);
  const headCount = headCommitCount();
  const adrIndex = buildAdrIndex(nodes);
  const basenameIndex = buildBasenameIndex(nodes);

  const manifestNodes = nodes.map((path) => {
    const age = nodeAge(path);
    return {
      path,
      genre: genreFor(path),
      is_hub: HUB_NODES.has(path),
      first_committed: age.firstCommitted,
      last_committed: age.lastCommitted,
      commit_distance: age.distanceLastTouch, // staleness (since last touch)
      commit_distance_since_first: age.distanceFirstCommit, // absolute age
      age_bucket: bucketFor(age.distanceLastTouch),
    };
  });

  const ctx = { nodeSet, adrIndex, basenameIndex };
  let edges = [];
  for (const path of nodes) {
    const body = readFileSync(join(REPO_ROOT, path), "utf8");
    edges.push(...extractEdges(path, body, ctx));
  }
  edges.push(...dispatchPairEdges(nodes));

  return {
    generated_at_head: headCount, // HEAD commit count (reproducible reference)
    head_sha: git(["rev-parse", "HEAD"]).trim(),
    node_count: manifestNodes.length,
    edge_count: edges.length,
    age_buckets: AGE_BUCKETS.map((b) => ({ name: b.name, max_distance: b.maxDistance })),
    nodes: manifestNodes,
    edges,
  };
}

// ── Projections ──────────────────────────────────────────────────────────────

/** GitHub blob-view URL fragment for a node, relative to the repo root. */
function nodeUrl(path) {
  // Relative path works in GitHub's blob/file view of docs/doc-graph.svg —
  // the SVG lives at docs/, so links are relative to docs/.
  return "../" + path;
}

function dotEscape(s) {
  return s.replace(/"/g, '\\"');
}

/** Short label for a node in the picture (basename, with dir disambiguation). */
function nodeLabel(path) {
  return basename(path);
}

/** Build the Graphviz `dot` source from the manifest. */
function buildDot(manifest) {
  const colorByName = Object.fromEntries(AGE_BUCKETS.map((b) => [b.name, b.color]));
  colorByName["uncommitted"] = "#ffffff";
  const nodeSet = new Set(manifest.nodes.map((n) => n.path));

  // Cluster nodes by genre/directory.
  const clusters = new Map();
  for (const n of manifest.nodes) {
    if (!clusters.has(n.genre)) clusters.set(n.genre, []);
    clusters.get(n.genre).push(n);
  }
  const clusterColor = Object.fromEntries(GENRE_BY_PREFIX.map((g) => [g.genre, g.clusterColor]));

  // Layout: cluster by directory (compound), pack clusters side-by-side rather
  // than one tall column (packmode=array reduces the height of the dense
  // archive cluster dramatically), concentrate parallel edges, faint hubs.
  // magic-literal: layout spacings are presentation tuning, named inline.
  const lines = [];
  lines.push("digraph doc_graph {");
  lines.push("  graph [rankdir=LR, fontname=\"sans-serif\", fontsize=10, " +
    "compound=true, concentrate=true, splines=true, overlap=false, " +
    "pack=true, packmode=\"array_t3\", nodesep=0.12, ranksep=0.6];");
  lines.push("  node [shape=box, style=\"rounded,filled\", fontname=\"sans-serif\", " +
    "fontsize=8, margin=\"0.06,0.03\", height=0.22];");
  lines.push("  edge [arrowsize=0.5];");

  let ci = 0;
  for (const [genre, ns] of clusters) {
    lines.push(`  subgraph cluster_${ci++} {`);
    lines.push(`    label="${genre} (${ns.length})";`);
    lines.push(`    style=filled; color="#dddddd"; fillcolor="${clusterColor[genre] || "#ffffff"}"; fontsize=9;`);
    for (const n of ns) {
      const fill = colorByName[n.age_bucket] || "#ffffff";
      const peripheries = n.is_hub ? 2 : 1;
      lines.push(
        `    "${dotEscape(n.path)}" [label="${dotEscape(nodeLabel(n.path))}", ` +
        `fillcolor="${fill}", URL="${dotEscape(nodeUrl(n.path))}", ` +
        `tooltip="${dotEscape(n.path)} — ${n.age_bucket} (${n.commit_distance ?? "n/a"} commits behind)", ` +
        `peripheries=${peripheries}];`
      );
    }
    lines.push("  }");
  }

  for (const e of manifest.edges) {
    // Only draw edges whose endpoints are both nodes in the picture. (Resolved
    // edges to a self-artifact target — e.g. `docs/doc-graph.md` — are honest
    // in the manifest but have no node to point at, so they are not drawn.)
    if (e.resolved !== "resolved") continue;
    if (!nodeSet.has(e.from) || !nodeSet.has(e.to)) continue;
    // Projection-prune (manifest stays complete): archive→archive edges are
    // frozen historical cross-references that bury the live structure and
    // account for ~40% of drawn edges. Suppress them in the picture; keep
    // archive↔live edges so a reader still sees how live docs point into
    // history. The pruning is the picture's, never the data's.
    if (e.from.startsWith("docs/archive/") && e.to.startsWith("docs/archive/")) continue;
    const st = EDGE_STYLE[e.kind] || EDGE_STYLE["path-mention"];
    // Hub out-edges drawn extra-faint to keep the picture legible.
    const isHubEdge = HUB_NODES.has(e.from);
    const penwidth = isHubEdge ? Math.min(st.penwidth, 0.4) : st.penwidth;
    lines.push(
      `  "${dotEscape(e.from)}" -> "${dotEscape(e.to)}" ` +
      `[color="${st.color}", penwidth=${penwidth}, style=${st.style}];`
    );
  }

  lines.push("}");
  return lines.join("\n");
}

/** Render `dot` source to SVG, shelling out to the `dot` binary. */
function renderSvg(dotSource) {
  // Fail loudly (ADR-0002) if `dot` is absent — do NOT silently skip the SVG.
  try {
    execFileSync("dot", ["-V"], { stdio: "ignore" });
  } catch {
    throw new Error(
      "doc-graph: `dot` (Graphviz) not found on PATH. The SVG projection " +
      "requires it. Install graphviz (e.g. `zypper install graphviz` / " +
      "`apt install graphviz` / `brew install graphviz`) and re-run. " +
      "Failing loudly rather than emitting a doc-graph without its picture."
    );
  }
  // maxBuffer raised: the rendered SVG for a 300-plus-node graph exceeds the
  // 1 MB execFileSync default. magic-literal: 64 MB output ceiling — generous
  // headroom for the doc tree's growth, not a substrate token.
  return execFileSync("dot", ["-Tsvg"], {
    input: dotSource,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

/**
 * Build the pruned Mermaid block — the *inline* view for readers who land on
 * the markdown. The full graph hairballs at this scale, and so would a
 * first-order expansion around the hubs (the hubs cite ~80 docs each, so their
 * neighbourhood is essentially the whole tree). The genuinely readable pruned
 * view is the **core set only**: ADRs + the three hub documents, with edges
 * drawn only *among that set* — the ADR lattice plus how each hub connects to
 * the ADRs and to the other hubs. The complete, clickable graph is the SVG;
 * this is the orientation thumbnail. `synopsis-of` edges are filtered (the
 * adr-synopsis fan-out is real but is noise in this view).
 */
function buildMermaid(manifest) {
  const include = new Set();
  for (const n of manifest.nodes) {
    if (MERMAID_INCLUDE_GENRES.has(n.genre) || n.is_hub) include.add(n.path);
  }

  const id = new Map();
  let i = 0;
  for (const p of [...include].sort()) id.set(p, `n${i++}`);

  const lines = ["flowchart LR"];
  for (const p of [...include].sort()) {
    const label = nodeLabel(p).replace(/"/g, "").replace(/\.md$/, "");
    lines.push(`  ${id.get(p)}["${label}"]`);
  }
  const drawn = new Set();
  for (const e of manifest.edges) {
    if (e.resolved !== "resolved") continue;
    if (e.kind === "synopsis-of") continue;
    if (!include.has(e.from) || !include.has(e.to)) continue;
    const key = `${e.from}|${e.to}`;
    if (drawn.has(key)) continue;
    drawn.add(key);
    lines.push(`  ${id.get(e.from)} --> ${id.get(e.to)}`);
  }
  return lines.join("\n");
}

/** Build the human-readable staleness table (most-stale first). */
function buildStalenessTable(manifest) {
  const rows = [...manifest.nodes]
    .filter((n) => n.commit_distance !== null)
    .sort((a, b) => b.commit_distance - a.commit_distance)
    .slice(0, 30);
  const lines = [
    "| Document | Bucket | Commits behind HEAD (last touch) | Since first commit |",
    "|---|---|---|---|",
  ];
  for (const n of rows) {
    lines.push(
      `| \`${n.path}\` | ${n.age_bucket} | ${n.commit_distance} | ${n.commit_distance_since_first} |`
    );
  }
  return lines.join("\n");
}

/** Collect the genuine broken-reference rows (dangling + ambiguous). */
function brokenRefs(manifest) {
  const rows = manifest.edges.filter(
    (e) => e.resolved === "dangling" || e.resolved === "ambiguous"
  );
  // Deduplicate by (from, site, resolved).
  const seen = new Set();
  const out = [];
  for (const e of rows) {
    const key = `${e.from}|${e.site}|${e.resolved}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out.sort((a, b) => a.from.localeCompare(b.from) || a.site.localeCompare(b.site));
}

const GENERATED_BANNER =
  "<!-- GENERATED by tools/doc-graph/generate.mjs — do not edit by hand. " +
  "Run `node tools/doc-graph/generate.mjs` to regenerate. -->";

function buildIndexPage(manifest, mermaid) {
  const broken = brokenRefs(manifest);
  const danglingAll = broken.filter((e) => e.resolved === "dangling");
  const dangling = danglingAll.length;
  const danglingLive = danglingAll.filter((e) => !e.from.startsWith("docs/archive/")).length;
  const ambiguous = broken.filter((e) => e.resolved === "ambiguous").length;
  const resolved = manifest.edges.filter((e) => e.resolved === "resolved").length;
  return `${GENERATED_BANNER}

# Documentation graph

A machine-generated map of the project's documentation graph — nodes are
documents, edges are the cross-references between them — with a commit-distance
staleness heatmap. Generated by \`tools/doc-graph/generate.mjs\` from one
git-driven prose-scan pass; the manifest \`docs/doc-graph.json\` is the source
of truth and the picture is a projection of it.

- **Primary artifact:** [\`docs/doc-graph.svg\`](./doc-graph.svg) — clickable,
  clustered-by-directory, staleness-coloured. Open it in GitHub's file view;
  each node links to its document.
- **Manifest (source of truth):** [\`docs/doc-graph.json\`](./doc-graph.json).
- **Broken-reference report:** [\`docs/doc-graph-report.md\`](./doc-graph-report.md).
- **Design note (the spec):**
  [\`docs/notes/documentation-graph-artifact-plan.md\`](./notes/documentation-graph-artifact-plan.md).

## At a glance

- **Nodes:** ${manifest.node_count} documents.
- **Edges:** ${manifest.edge_count} cross-references
  (${resolved} resolved, ${dangling} dangling, ${ambiguous} ambiguous).
- **Generated at HEAD:** \`${manifest.head_sha.slice(0, 12)}\`
  (${manifest.generated_at_head} commits deep).

## Staleness heatmap (buckets)

Each node is coloured by commit-distance since its last touch
(\`git rev-list --count <last-touch>..HEAD\`) — counts, not wall-clock. Buckets:
${AGE_BUCKETS.map((b) =>
  b.maxDistance === Infinity
    ? `**${b.name}** (> ${AGE_BUCKETS[AGE_BUCKETS.length - 2].maxDistance})`
    : `**${b.name}** (≤ ${b.maxDistance})`
).join(", ")}. Absolute age (since first commit) is also in the manifest but is
*not* the gradient — a foundational ADR should be old and untouched; that is
not rot.

### Most-stale documents (top 30 by commit-distance)

${buildStalenessTable(manifest)}

## Pruned graph (inline)

The full graph hairballs at this scale (and so would a first-order expansion
around the hubs, which cite most of the tree). The inline Mermaid view below is
**pruned to the core set** — the ten ADRs plus the three hub documents
(\`adr-synopsis\`, \`handoff-current\`, \`TODO\`), with edges drawn only among
that set: the ADR lattice and how each hub connects to it. The complete,
clickable graph is [\`docs/doc-graph.svg\`](./doc-graph.svg).

\`\`\`mermaid
${mermaid}
\`\`\`

## Broken-reference report

${dangling + ambiguous === 0
  ? "No genuine dangling or ambiguous references detected (after the ADR-0005 Rule 4 code-block/placeholder filter)."
  : `**${danglingLive}** dangling references from **live** documents (genuine-action candidates), ${dangling - danglingLive} from frozen archive (expected drift), and ${ambiguous} ambiguous, after the ADR-0005 Rule 4 code-block/placeholder filter. See [\`docs/doc-graph-report.md\`](./doc-graph-report.md) for the full list, split by origin — the maintainer reviews it; nothing is auto-fixed.`}

## Regeneration

This artifact is committed and CI-verified-fresh: a workflow regenerates it on
every doc-touching PR and fails iff the committed manifest's **graph structure**
(node set, edges, resolution) drifts from a fresh run — a committed-but-stale
doc-graph would be self-refuting. The check is scoped to graph structure, not
the raw bytes, because the heatmap fields (commit-distance, bucket) are
HEAD-relative and shift uniformly as the repo moves: a doc untouched for one
more commit is legitimately one commit staler. So the committed heatmap is a
snapshot at its last regeneration and refreshes whenever a doc-touching change
regenerates the artifact. To regenerate locally:

\`\`\`
node tools/doc-graph/generate.mjs
\`\`\`

The generator requires \`dot\` (Graphviz) on PATH for the SVG; it fails loudly
if absent (ADR-0002).

## License

Public Domain (The Unlicense).
`;
}

/** A frozen-archive source: dangling refs from here are expected drift. */
function isArchiveOrigin(from) {
  return from.startsWith("docs/archive/");
}

function buildReportPage(manifest) {
  const broken = brokenRefs(manifest);
  const dangling = broken.filter((e) => e.resolved === "dangling");
  const ambiguous = broken.filter((e) => e.resolved === "ambiguous");
  const danglingLive = dangling.filter((e) => !isArchiveOrigin(e.from));
  const danglingArchive = dangling.filter((e) => isArchiveOrigin(e.from));
  const fmt = (e) =>
    `- \`${e.from}\` → ${e.site} *(${e.kind})*` +
    (e.resolved === "dangling"
      ? ` — target \`${e.to}\` does not resolve to any node.`
      : ` — matches multiple nodes; not guessing (ADR-0002).`);

  return `${GENERATED_BANNER}

# Documentation graph — broken-reference report

Generated by \`tools/doc-graph/generate.mjs\`. This is a **report**, not a gate:
the maintainer reviews the list and decides what to fix. The doc-graph CI
workflow checks artifact *freshness* (the committed artifact must match a fresh
run); it does **not** block merges on broken references, because existing drift
would make every PR red.

The validator applies the ADR-0005 Rule 4 exemption: references inside fenced
code blocks and obvious template placeholders (\`X.md\`, \`YYYY-…\`, \`NNNN\`,
\`<…>\`, \`{…}\`, \`*\` globs, \`foo\`/\`bar\` examples) are skipped, so this
list is the genuine-drift class, not the false-positive flood.

The dangling references are split by **origin**: references *from* frozen
archive documents (\`docs/archive/…\`) are *expected* drift — an archived note
honestly records the paths that existed when it was written, and ADR-0005's
incremental-retrofit posture does not retroactively rewrite frozen history.
References from **live** documents are the genuine-action candidates.

## Summary

- **Dangling from LIVE documents** (genuine-action candidates): **${danglingLive.length}**.
- **Dangling from frozen archive** (expected historical drift): **${danglingArchive.length}**.
- **Ambiguous references** (bare filename matches more than one node — never
  silently resolved, per ADR-0002): **${ambiguous.length}**.

## Dangling references — from LIVE documents (review these)

${danglingLive.length === 0 ? "_None._" : danglingLive.map(fmt).join("\n")}

## Ambiguous references

${ambiguous.length === 0 ? "_None._" : ambiguous.map(fmt).join("\n")}

## Dangling references — from frozen archive (expected drift)

These are listed for completeness; they are not action items unless an archive
file is being un-frozen.

${danglingArchive.length === 0 ? "_None._" : danglingArchive.map(fmt).join("\n")}

## License

Public Domain (The Unlicense).
`;
}

// ── Driver ───────────────────────────────────────────────────────────────────

function generate() {
  const manifest = buildManifest();
  const dotSource = buildDot(manifest);
  const svg = renderSvg(dotSource); // fails loudly if `dot` is absent
  const mermaid = buildMermaid(manifest);
  const index = buildIndexPage(manifest, mermaid);
  const report = buildReportPage(manifest);
  return {
    [OUT_JSON]: JSON.stringify(manifest, null, 2) + "\n",
    [OUT_SVG]: svg,
    [OUT_INDEX]: index,
    [OUT_REPORT]: report,
    _manifest: manifest,
  };
}

function writeArtifacts(artifacts) {
  for (const [rel, content] of Object.entries(artifacts)) {
    if (rel.startsWith("_")) continue;
    writeFileSync(join(REPO_ROOT, rel), content);
  }
}

/**
 * Structural skeleton of the manifest — everything that is NOT HEAD-relative.
 * The freshness gate compares this, not the raw bytes, because the heatmap
 * fields (`commit_distance`, `age_bucket`, `generated_at_head`, `head_sha`)
 * shift uniformly every time HEAD advances: a doc untouched for one more commit
 * is one commit "staler," which is the heatmap working as intended, not drift
 * the contributor must chase. The skeleton is the node set (path + genre +
 * hub-ness), the edge set (from/to/kind/resolved), and the broken-ref report —
 * the *graph structure*. A change there means a real "forgot to regenerate"
 * drift (a doc added/removed/re-genred, an edge resolution changed); a change
 * only in the heatmap numbers does not.
 *
 * Consequence (named honestly per ADR-0002): the committed SVG/index heatmap is
 * a snapshot-at-commit-time and goes stale as HEAD advances between
 * regenerations — exactly the staleness the artifact is meant to surface.
 * Regenerating on any doc-touching change refreshes it; the gate guards the
 * structure, not the pixels.
 */
function manifestSkeleton(manifest) {
  return JSON.stringify({
    nodes: manifest.nodes
      .map((n) => ({ path: n.path, genre: n.genre, is_hub: n.is_hub }))
      .sort((a, b) => a.path.localeCompare(b.path)),
    edges: manifest.edges
      .map((e) => ({ from: e.from, to: e.to, kind: e.kind, resolved: e.resolved }))
      .sort((a, b) =>
        a.from.localeCompare(b.from) || a.to.localeCompare(b.to) || a.kind.localeCompare(b.kind)
      ),
  });
}

function checkDrift(freshManifest) {
  const drifted = [];
  // 1. The manifest must exist and its structural skeleton must match.
  const jsonAbs = join(REPO_ROOT, OUT_JSON);
  if (!existsSync(jsonAbs)) return [`${OUT_JSON} (missing — never generated)`];
  let committed;
  try {
    committed = JSON.parse(readFileSync(jsonAbs, "utf8"));
  } catch {
    return [`${OUT_JSON} (not valid JSON)`];
  }
  if (manifestSkeleton(committed) !== manifestSkeleton(freshManifest)) {
    drifted.push(`${OUT_JSON} (graph structure: nodes/edges/resolution drift)`);
  }
  // 2. The SVG and index/report must at least exist (they are projections of
  // the manifest; their heatmap content is HEAD-relative and not byte-compared).
  for (const rel of [OUT_SVG, OUT_INDEX, OUT_REPORT]) {
    if (!existsSync(join(REPO_ROOT, rel))) drifted.push(`${rel} (missing)`);
  }
  return drifted;
}

function main() {
  const checkMode = process.argv.includes("--check");
  const artifacts = generate();
  const m = artifacts._manifest;
  if (checkMode) {
    const drifted = checkDrift(m);
    if (drifted.length) {
      process.stderr.write(
        "doc-graph: committed artifact has STALE graph structure — it drifts " +
        "from a fresh run.\n" +
        "Drifted: " + drifted.join(", ") + "\n" +
        "Run `node tools/doc-graph/generate.mjs` and commit the result.\n"
      );
      process.exit(1);
    }
    process.stdout.write(
      `doc-graph: graph structure fresh (${m.node_count} nodes, ${m.edge_count} edges).\n`
    );
    return;
  }
  writeArtifacts(artifacts);
  const resolved = m.edges.filter((e) => e.resolved === "resolved").length;
  const dangling = m.edges.filter((e) => e.resolved === "dangling").length;
  const ambiguous = m.edges.filter((e) => e.resolved === "ambiguous").length;
  process.stdout.write(
    `doc-graph: wrote ${OUT_JSON}, ${OUT_SVG}, ${OUT_INDEX}, ${OUT_REPORT}\n` +
    `  nodes: ${m.node_count}\n` +
    `  edges: ${m.edge_count} (resolved ${resolved}, dangling ${dangling}, ambiguous ${ambiguous})\n`
  );
}

main();
