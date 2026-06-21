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
 *   - `docs/doc-graph.svg`    — Graphviz `dot` render (clustered; per-node
 *                               `URL=` clickable links). Rendered LOCALLY for
 *                               browsing and `.gitignore`d — NOT committed: a
 *                               full re-layout on every structural change is
 *                               counted by GitHub regardless of
 *                               `.gitattributes -diff`, distorting PR stats. An
 *                               honest off-tree render (CI → branch/Pages) is
 *                               the planned fix (see deferred-items); until
 *                               then run the generator to produce it locally.
 *   - `docs/doc-graph.md`     — thin index page carrying a pruned Mermaid
 *                               block + a human-readable staleness table +
 *                               the broken-reference report + a manifest link.
 *   - `docs/doc-graph-report.md` — the validator REPORT (genuine dangling /
 *                               ambiguous cross-references, after the
 *                               ADR-0005 Rule 4 code-block/placeholder filter,
 *                               split by ORIGIN bucket — live / executed-playbook
 *                               / frozen (archive + worklog) — and, within live,
 *                               by TARGET class — missing-on-disk /
 *                               outside-node-set / retired-tombstone — plus a
 *                               named directory-reference class and an advisory
 *                               no-new-danglers ratchet. Report sections only;
 *                               none of it gates).
 *
 * Design note (the SPEC): `docs/archive/notes/design/documentation-graph-artifact-plan.md`.
 * Substrate plan: `docs/notes/design/doc-graph-discipline-plan.md`.
 * Originating entry: `docs/archive/notes/vestige/deferred-items/doc-graph-artifact.md`.
 *
 * Manifest-first (the load-bearing inversion): the picture and the validator
 * are both projections of the same manifest. Per ADR-0002, the validator
 * never silently picks a winner for an ambiguous bare-filename reference — it
 * marks `resolved: "ambiguous"` / `resolved: "dangling"` and surfaces it.
 *
 * Heatmap: staleness via commit-distance (`git rev-list --count
 * <last-touch-sha>..HEAD`), discrete buckets, counts-not-wall-clock. The raw
 * distances are computed in-memory — they drive the bucket assignment and the
 * staleness-table ordering — but are deliberately NOT written to the committed
 * manifest: being HEAD-relative they shift on every commit, which churned the
 * artifact ~700 lines per commit for no structural reason (the +5k/-5k PR-diff
 * symptom the churn-reduction worklog records). The committed manifest carries
 * only the STABLE projection — the discrete `age_bucket` plus the absolute
 * first/last-commit dates — so a content-only doc change produces a small,
 * bounded diff (or none, if not regenerated) rather than a wholesale re-render.
 * See `committedManifest` for the projection and `manifestSkeleton` for why the
 * freshness gate was already structure-only. The gradient projects staleness.
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

// ── Broken-reference report classification (origin buckets + target classes) ─

/**
 * Origin buckets for the broken-reference report. The frozen boundary follows
 * the project's working convention (recorded in
 * `docs/notes/consolidation-xref-fallout.md` §Method): references FROM
 * `docs/archive/**` AND FROM completed worklogs (`docs/worklog/**`) are
 * point-in-time captures — "do not edit to fix" — so their danglers are
 * expected, tolerated drift. Executed playbooks under `docs/playbooks/monorepo/`
 * are the same note's "quasi-frozen" class (executed, reference-only) and get
 * their own bucket so the live list is not polluted by them. Everything else is
 * LIVE — the genuine-action surface. Buckets affect the REPORT sections only;
 * the manifest records every edge regardless (manifest-first).
 * magic-literal: the bucket boundary is the project convention, named here as
 * the single source.
 */
const FROZEN_ORIGIN_PREFIXES = ["docs/archive/", "docs/worklog/"];
const EXECUTED_ORIGIN_PREFIXES = ["docs/playbooks/monorepo/"];

/**
 * Deliberately retired hub documents (tombstones): paths that many docs
 * legitimately cited while the hub lived, whose retirement was a recorded
 * decision rather than drift. A dangling reference TO a tombstoned path is
 * classified `retired` and sectioned separately from genuine rot — the
 * reference is historical record of a hub that was retired on purpose, and the
 * successor is named here so the report points readers at it. Extend this map
 * when another hub is deliberately retired. magic-literal: the tombstone set is
 * a curated record of retirement decisions, named here as the single source.
 */
const TOMBSTONES = new Map([
  [
    "docs/notes/deferred-items.md",
    "retired into the work-status store (the `todo` PostgreSQL DB; schema in " +
      "`tools/work-status/schema.sql`); per-item vestige notes live under " +
      "`docs/notes/vestige/deferred-items/`.",
  ],
]);

/**
 * Advisory no-new-danglers ratchet (a report section, NOT a gate — the
 * project's gate history counsels advisory-first: the umbrella CLAUDE.md
 * records that merge-blocking framing for report-shaped disciplines was tried
 * and retracted). The baseline counts dangling
 * references from LIVE documents in the two genuine-rot classes
 * (`missing-on-disk` + `retired`); the `outside-node-set` class is excluded
 * because those targets exist on disk — the "dangler" status is a scan-scope
 * artifact, not reference rot. When the current count drops below the
 * baseline, lower the baseline here (ratchet down); when it exceeds the
 * baseline, the report flags it for review. magic-literal: the baseline is a
 * measured snapshot, named here as the single source.
 */
const NO_NEW_DANGLERS_RATCHET = {
  baselineDate: "2026-06-10",
  baseline: 38, // live missing-on-disk + live retired at the baseline date
};

/** Origin bucket for a reference source: "live" | "executed" | "frozen". */
function originClass(from) {
  for (const p of FROZEN_ORIGIN_PREFIXES) if (from.startsWith(p)) return "frozen";
  for (const p of EXECUTED_ORIGIN_PREFIXES) if (from.startsWith(p)) return "executed";
  return "live";
}

/**
 * Target class for a dangling reference: tombstones first (a retired hub is
 * missing on disk too — the retirement decision is the more specific fact),
 * then disk existence. `outside-node-set` is the named class for targets that
 * exist on disk but fall outside the generator's scan scope (`docs/`,
 * `backend/docs/`, the explicit root/sub-project files) — previously these
 * were reported with the same wording as deleted files, which is the
 * signal-conflation this split removes. Bare-filename danglers (no directory)
 * cannot be located on disk and honestly classify as `missing-on-disk` by the
 * same existence probe. Computed at generation time and kept IN-MEMORY only —
 * see `committedManifest` for why it is not committed.
 */
function classifyDanglingTarget(to) {
  if (TOMBSTONES.has(to)) return "retired";
  if (existsSync(join(REPO_ROOT, to))) return "outside-node-set";
  return "missing-on-disk";
}

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

function git(args) {
  return execFileSync("git", args, { cwd: REPO_ROOT, encoding: "utf8" });
}

/**
 * For a node, returns { firstCommitted, lastCommitted, distanceLastTouch }.
 * `distanceLastTouch` is the commit-count behind HEAD since the last touch —
 * the staleness metric that drives the bucket and the table ordering; it is NOT
 * committed (HEAD-relative; see `committedManifest`). The dates ARE committed.
 * A node with no commit history yet (newly created, unstaged) fails loudly: its
 * age is undefined and the caller must decide — we surface distance:null rather
 * than coercing a sentinel (ADR-0002, the silent-default class the umbrella
 * memory flags at contract boundaries). (Absolute age in *commits* since first
 * commit is no longer derived — only the first-commit date is kept — so the
 * per-node `firstSha..HEAD` rev-list it cost is gone.)
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
    };
  }
  const lastDate = git(["log", "-1", "--format=%cs", "--", relPath]).trim();
  const firstDate = git(["log", "-1", "--format=%cs", firstSha]).trim();
  const distLast = Number(git(["rev-list", "--count", `${lastSha}..HEAD`]).trim());
  return {
    firstCommitted: firstDate,
    lastCommitted: lastDate,
    distanceLastTouch: distLast,
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
/**
 * Backtick repo-DIRECTORY references (trailing `/`). `BACKTICK_PATH_RE`
 * requires a `.md` suffix, so directory citations were previously not scanned
 * at all — a structurally invisible reference class. They are not graph edges
 * (a directory is a collection, not a document node), so they are recorded as
 * their own named class: scanned with the same fence-strip + placeholder
 * filter, resolved against DISK existence, and surfaced in the report when
 * missing. Disjoint from `BACKTICK_PATH_RE` by construction (`.md` vs `/`).
 */
const BACKTICK_DIR_RE = /`((?:docs|frontend|backend)\/[^`\n]*?\/)`/g;
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
 * Extract directory references from one node's body (see `BACKTICK_DIR_RE`).
 * Each carries {from, ref, exists} — `exists` is a disk probe, not a node-set
 * lookup, because directories are not nodes. De-duplicated per node.
 */
function extractDirRefs(from, rawBody) {
  const body = stripFencedCode(rawBody);
  const seen = new Set();
  const out = [];
  for (const m of body.matchAll(BACKTICK_DIR_RE)) {
    const ref = m[1];
    if (isPlaceholder(ref)) continue;
    if (seen.has(ref)) continue;
    seen.add(ref);
    out.push({ from, ref, exists: existsSync(join(REPO_ROOT, ref)) });
  }
  return out;
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
      commit_distance: age.distanceLastTouch, // in-memory only (bucket + table sort)
      age_bucket: bucketFor(age.distanceLastTouch),
    };
  });

  const ctx = { nodeSet, adrIndex, basenameIndex };
  let edges = [];
  const dirRefs = [];
  for (const path of nodes) {
    const body = readFileSync(join(REPO_ROOT, path), "utf8");
    edges.push(...extractEdges(path, body, ctx));
    dirRefs.push(...extractDirRefs(path, body));
  }
  edges.push(...dispatchPairEdges(nodes));

  // Annotate dangling edges with their target class (missing-on-disk /
  // outside-node-set / retired). IN-MEMORY only — `committedManifest` strips
  // it, and `manifestSkeleton` deliberately excludes it (see both for why).
  for (const e of edges) {
    if (e.resolved === "dangling") e.target_class = classifyDanglingTarget(e.to);
  }

  // The in-memory manifest keeps the raw commit-distances (manifestNodes
  // carries them) because buildDot's bucket fill, the staleness-table ordering,
  // and the bucket assignment all read them. `committedManifest` strips them
  // (and the HEAD-relative top-level provenance) from the projection written to
  // disk — that is the churn boundary.
  return {
    node_count: manifestNodes.length,
    edge_count: edges.length,
    age_buckets: AGE_BUCKETS.map((b) => ({ name: b.name, max_distance: b.maxDistance })),
    nodes: manifestNodes,
    edges,
    dir_refs: dirRefs, // in-memory only (report projection); see committedManifest
  };
}

/**
 * The committed-JSON projection: the in-memory manifest minus its HEAD-relative
 * fields. The per-node `commit_distance` is computed for the bucket + table sort
 * but is NOT committed (HEAD-relative → it shifts every commit, the ~700-line
 * churn source); the absolute first/last-commit dates and the discrete
 * `age_bucket` ARE committed (they change only when a doc is actually touched or
 * crosses a bucket boundary). The former top-level `generated_at_head` /
 * `head_sha` are likewise dropped — git's own history of this file records which
 * commit generated it. The freshness gate reads only the structural skeleton
 * (see `manifestSkeleton`), so stripping these does not weaken it.
 *
 * The per-edge `target_class` and the top-level `dir_refs` array are likewise
 * stripped: both depend on DISK existence of paths outside the doc tree (e.g.
 * `backend/samples/README.md`), and the doc-graph CI workflow's path filter
 * cannot see non-doc file changes — committing disk-coupled fields would let an
 * unrelated code PR strand the committed artifact "stale" and fail the gate on
 * the next doc PR. They are recomputed on every regeneration and live in the
 * report snapshot, same posture as the heatmap (the gate guards structure, not
 * the snapshot).
 */
function committedManifest(m) {
  return {
    node_count: m.node_count,
    edge_count: m.edge_count,
    age_buckets: m.age_buckets,
    nodes: m.nodes.map((n) => ({
      path: n.path,
      genre: n.genre,
      is_hub: n.is_hub,
      first_committed: n.first_committed,
      last_committed: n.last_committed,
      age_bucket: n.age_bucket,
    })),
    edges: m.edges.map((e) => ({
      from: e.from,
      to: e.to,
      kind: e.kind,
      site: e.site,
      resolved: e.resolved,
    })),
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
  // Escape the escape char (`\`) before the quote, or a backslash in the
  // input would corrupt the quote-escaping it precedes (CodeQL
  // js/incomplete-sanitization). Inputs are repo-resident doc paths/labels,
  // so this is defence-in-depth rather than an attacker-controlled surface.
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
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
  // archive cluster dramatically), faint hubs.
  // magic-literal: layout spacings are presentation tuning, named inline.
  //
  // `concentrate` is deliberately OFF. It merges parallel/bidirectional edges
  // (this graph has ~90 A↔B pairs) into shared virtual-node chains; on the CI
  // apt `dot` (graphviz 2.42.2) the spline router then cannot trace 2 of those
  // merged chains back to a NORMAL edge and emits `Error: in routesplines,
  // cannot find NORMAL edge` (twice) — a real per-edge layout failure that
  // routes those edges degenerately, not a cosmetic warning. The mechanism is
  // `getmainedge` walking a merged virtual chain that no longer terminates at a
  // NORMAL edge (graphviz lib/dotgen/dotsplines.c); it is fixed in later
  // graphviz (local 14.1.2 renders clean even WITH concentrate), so the failure
  // is version-sensitive to CI's older `dot`. Since the SVG is
  // local-only/`.gitignore`d (a browsing aid, not a committed artifact), the
  // marginal legibility concentrate bought on parallel edges is not worth a
  // degenerate-spline failure on the version CI actually runs. See
  // `docs/worklog/2026-06-11-doc-graph-svg-spline-failure.md`.
  const lines = [];
  lines.push("digraph doc_graph {");
  lines.push("  graph [rankdir=LR, fontname=\"sans-serif\", fontsize=10, " +
    "compound=true, splines=true, overlap=false, " +
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
        // Tooltip reads only STABLE fields (bucket + last-touched date), never
        // the raw commit-distance — embedding the distance would re-churn the
        // SVG every commit, defeating committedManifest's whole purpose.
        `    "${dotEscape(n.path)}" [label="${dotEscape(nodeLabel(n.path))}", ` +
        `fillcolor="${fill}", URL="${dotEscape(nodeUrl(n.path))}", ` +
        `tooltip="${dotEscape(n.path)} — ${n.age_bucket}${n.last_committed ? `, last touched ${n.last_committed}` : ""}", ` +
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
  try {
    return execFileSync("dot", ["-Tsvg"], {
      input: dotSource,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (err) {
    // Defense-in-depth (kept, but tightened — ADR-0002). Two things changed
    // around this catch: (1) the freshness gate (`--check`, what CI runs) no
    // longer renders the SVG at all (see `generate`/`main`), so this branch is
    // now reached only on a LOCAL full render — CI can no longer be silently
    // green-with-a-buried-error here; (2) the original
    // `routesplines: cannot find NORMAL edge` non-zero exit was caused by
    // `concentrate=true` (see buildDot's graph-attr comment), now off, so `dot`
    // is expected to exit 0. A non-zero exit here is therefore no longer an
    // "expected, tolerated warning" — it is an unexpected layout FAILURE (a
    // degenerately-routed edge: some edge in the picture got no spline), and
    // treating it as benign is exactly the silent-failure ADR-0002 forbids. We
    // still complete when `dot` produced a usable SVG (so a local browse is not
    // blocked by one bad edge — the item scoped this as "loud but still
    // completing"), but we report it LOUDLY as a regression that wants
    // investigation, echo dot's exit status + full stderr, and name the
    // expected-clean baseline so the next reader does not re-shrug it off. When
    // there is genuinely no picture, we re-throw (a real, fatal failure).
    const svg = typeof err?.stdout === "string" ? err.stdout : "";
    if (svg.includes("</svg>")) {
      process.stderr.write(
        "[doc-graph] WARNING — `dot` exited non-zero but still emitted an SVG. " +
        "With `concentrate` off this is NOT expected and should be treated as a " +
        "layout REGRESSION, not a benign warning: at least one edge was routed " +
        "degenerately. The SVG is used so a local browse is not blocked, but " +
        "this wants investigation (re-check the `routesplines: cannot find " +
        "NORMAL edge` class against the current `dot` version; the original " +
        "instance is documented in " +
        "`docs/worklog/2026-06-11-doc-graph-svg-spline-failure.md`).\n" +
        `[doc-graph] dot exit status: ${err?.status ?? "unknown"}\n` +
        (err?.stderr ? `[doc-graph] dot stderr:\n${err.stderr}\n` : "")
      );
      return svg;
    }
    throw err;
  }
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

/**
 * Build the human-readable staleness table (most-stale first). Ordered by the
 * in-memory commit-distance (the true staleness metric, counts-not-wall-clock),
 * but the DISPLAYED columns are stable — the discrete bucket and the absolute
 * last-touched date — never the raw distance, which would re-churn this table
 * (and the index page it lives in) every commit. The row order therefore shifts
 * only when a doc is actually touched (its distance resets), not on every HEAD
 * advance.
 */
function buildStalenessTable(manifest) {
  const rows = [...manifest.nodes]
    .filter((n) => n.commit_distance !== null)
    .sort((a, b) => b.commit_distance - a.commit_distance)
    .slice(0, 30);
  const lines = [
    "| Document | Bucket | Last touched |",
    "|---|---|---|",
  ];
  for (const n of rows) {
    lines.push(`| \`${n.path}\` | ${n.age_bucket} | ${n.last_committed ?? "uncommitted"} |`);
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
  const liveDangling = danglingAll.filter((e) => originClass(e.from) === "live");
  const liveActionable = liveDangling.filter((e) => e.target_class !== "outside-node-set").length;
  const ambiguous = broken.filter((e) => e.resolved === "ambiguous").length;
  const resolved = manifest.edges.filter((e) => e.resolved === "resolved").length;
  return `${GENERATED_BANNER}

# Documentation graph

A machine-generated map of the project's documentation graph — nodes are
documents, edges are the cross-references between them — with a commit-distance
staleness heatmap. Generated by \`tools/doc-graph/generate.mjs\` from one
git-driven prose-scan pass; the manifest \`docs/doc-graph.json\` is the source
of truth and the picture is a projection of it.

- **Manifest (committed source of truth):** [\`docs/doc-graph.json\`](./doc-graph.json).
- **The picture (\`docs/doc-graph.svg\`):** rendered locally, **not committed** —
  run \`node tools/doc-graph/generate.mjs\` (needs Graphviz \`dot\`) and open the
  result locally. \`.gitignore\`d because committing a full-relayout SVG distorted
  PR stats (GitHub counts it regardless of \`.gitattributes\`); an honest off-tree
  render is the planned fix.
- **Broken-reference report:** [\`docs/doc-graph-report.md\`](./doc-graph-report.md).
- **Design note (the spec):**
  [\`docs/archive/notes/design/documentation-graph-artifact-plan.md\`](./archive/notes/design/documentation-graph-artifact-plan.md).

## At a glance

- **Nodes:** ${manifest.node_count} documents.
- **Edges:** ${manifest.edge_count} cross-references
  (${resolved} resolved, ${dangling} dangling, ${ambiguous} ambiguous).

## Staleness heatmap (buckets)

Each node is coloured by commit-distance since its last touch
(\`git rev-list --count <last-touch>..HEAD\`) — counts, not wall-clock. Buckets:
${AGE_BUCKETS.map((b) =>
  b.maxDistance === Infinity
    ? `**${b.name}** (> ${AGE_BUCKETS[AGE_BUCKETS.length - 2].maxDistance})`
    : `**${b.name}** (≤ ${b.maxDistance})`
).join(", ")}. The first-commit date (\`first_committed\`) is recorded per node
too, but absolute age is deliberately *not* the gradient — a foundational ADR
should be old and untouched; that is not rot. (The raw commit-distances are
computed but not committed; the bucket and the dates are the stable record —
see the Regeneration note.)

### Most-stale documents (top 30 by commit-distance)

${buildStalenessTable(manifest)}

## Pruned graph (inline)

The full graph hairballs at this scale (and so would a first-order expansion
around the hubs, which cite most of the tree). The inline Mermaid view below is
**pruned to the core set** — the ten ADRs plus the three hub documents
(\`adr-synopsis\`, \`handoff-current\`, \`TODO\`), with edges drawn only among
that set: the ADR lattice and how each hub connects to it. The complete graph is
the locally-rendered \`docs/doc-graph.svg\` (not committed — run the generator).

\`\`\`mermaid
${mermaid}
\`\`\`

## Broken-reference report

${dangling + ambiguous === 0
  ? "No genuine dangling or ambiguous references detected (after the ADR-0005 Rule 4 code-block/placeholder filter)."
  : `**${liveActionable}** dangling references from **live** documents in the genuine-rot classes (missing-on-disk + retired-target; ${liveDangling.length} live total — the remainder point at on-disk files outside the node set), ${dangling - liveDangling.length} from frozen / executed documents (expected drift), and ${ambiguous} ambiguous, after the ADR-0005 Rule 4 code-block/placeholder filter. See [\`docs/doc-graph-report.md\`](./doc-graph-report.md) for the full list, split by origin bucket and target class — the maintainer reviews it; nothing is auto-fixed.`}

## Regeneration

This artifact is committed and CI-verified-fresh: a workflow checks that the
committed manifest's **graph structure** (node set, edges, resolution) matches a
fresh run, and fails iff it drifts — a committed-but-stale doc-graph would be
self-refuting. The check is scoped to graph structure, not the raw bytes: the
committed manifest stores only **stable** heatmap fields (the discrete
\`age_bucket\` and the absolute first/last-commit dates), never the raw
HEAD-relative commit-distances, so it changes only when a doc is added, removed,
re-genred, re-cross-referenced, *or actually touched* (its date/bucket move) —
not on every commit. A **structural** change must be regenerated in the same PR
or the gate fails; a **content-only** edit need not (the gate guards structure,
and the heatmap is an explicit snapshot — regenerating refreshes the touched
doc's freshness, a small bounded diff, but skipping it only leaves that one node
a bucket stale until the next structural regeneration). To regenerate locally:

\`\`\`
node tools/doc-graph/generate.mjs
\`\`\`

The generator requires \`dot\` (Graphviz) on PATH for the SVG; it fails loudly
if absent (ADR-0002).

## License

Public Domain (The Unlicense).
`;
}

function buildReportPage(manifest) {
  const broken = brokenRefs(manifest);
  const dangling = broken.filter((e) => e.resolved === "dangling");
  const ambiguous = broken.filter((e) => e.resolved === "ambiguous");

  const byOrigin = { live: [], executed: [], frozen: [] };
  for (const e of dangling) byOrigin[originClass(e.from)].push(e);

  const liveMissing = byOrigin.live.filter((e) => e.target_class === "missing-on-disk");
  const liveRetired = byOrigin.live.filter((e) => e.target_class === "retired");
  const liveOutside = byOrigin.live.filter((e) => e.target_class === "outside-node-set");

  // Directory references: only the missing ones are drift; resolved ones are
  // honest collection citations and are counted, not listed.
  const dirRefs = manifest.dir_refs || [];
  const dirMissing = dirRefs.filter((d) => !d.exists);
  const dirMissingLive = dirMissing.filter((d) => originClass(d.from) === "live");
  const dirMissingOther = dirMissing.filter((d) => originClass(d.from) !== "live");

  const ratchetCurrent = liveMissing.length + liveRetired.length;
  const { baseline, baselineDate } = NO_NEW_DANGLERS_RATCHET;

  const fmt = (e) => {
    const head = `- \`${e.from}\` → ${e.site} *(${e.kind})*`;
    if (e.resolved === "ambiguous") return `${head} — matches multiple nodes; not guessing (ADR-0002).`;
    switch (e.target_class) {
      case "retired":
        return `${head} — target \`${e.to}\` was deliberately retired: ${TOMBSTONES.get(e.to)}`;
      case "outside-node-set":
        return `${head} — target \`${e.to}\` exists on disk but is outside the doc-graph node set.`;
      default:
        return `${head} — target \`${e.to}\` does not resolve to any node and does not exist on disk.`;
    }
  };
  const fmtDir = (d) =>
    `- \`${d.from}\` → \`${d.ref}\` *(directory-ref)* — directory does not exist on disk.`;

  return `${GENERATED_BANNER}

# Documentation graph — broken-reference report

Generated by \`tools/doc-graph/generate.mjs\`. This is a **report**, not a gate:
the maintainer reviews the list and decides what to fix. The doc-graph CI
workflow checks artifact *freshness* (the committed artifact must match a fresh
run); it does **not** block merges on broken references, because existing drift
would make every PR red. The classification sections below — origin buckets,
target classes, directory references, the advisory ratchet — are likewise
report-only.

The validator applies the ADR-0005 Rule 4 exemption: references inside fenced
code blocks and obvious template placeholders (\`X.md\`, \`YYYY-…\`, \`NNNN\`,
\`<…>\`, \`{…}\`, \`*\` globs, \`foo\`/\`bar\` examples) are skipped, so this
list is the genuine-drift class, not the false-positive flood.

Dangling references are split by **origin bucket**, per the working convention
recorded in \`docs/notes/consolidation-xref-fallout.md\`:

- **Live** — the genuine-action surface.
- **Executed playbooks** (\`docs/playbooks/monorepo/…\`) — executed,
  reference-only records; their references are point-in-time captures.
- **Frozen** (\`docs/archive/…\` **and** completed worklogs,
  \`docs/worklog/…\`) — *expected* drift: a frozen note honestly records the
  paths that existed when it was written ("do not edit to fix"), and ADR-0005's
  incremental-retrofit posture does not retroactively rewrite frozen history.

Within the live bucket, danglers are split by **target class**: genuinely
**missing on disk** (rot or typo — review these), pointing at a
**deliberately retired** hub (tombstoned; the successor is named per entry),
or pointing at a file that **exists on disk but outside the node set** (a
scan-scope artifact — the generator scans \`docs/\`, \`backend/docs/\`, and an
explicit root/sub-project file list — not reference rot).

## Summary

- **Dangling from LIVE documents, missing on disk** (review these): **${liveMissing.length}**.
- **Dangling from LIVE documents, retired (tombstoned) targets**: **${liveRetired.length}**.
- **Dangling from LIVE documents, on disk but outside the node set**: **${liveOutside.length}**.
- **Dangling from EXECUTED playbooks** (reference-only records): **${byOrigin.executed.length}**.
- **Dangling from FROZEN documents** (archive + worklogs; expected drift): **${byOrigin.frozen.length}**.
- **Directory references missing on disk**: **${dirMissingLive.length}** from live
  documents, **${dirMissingOther.length}** from frozen/executed
  (${dirRefs.length} directory references scanned in total).
- **Ambiguous references** (bare filename matches more than one node — never
  silently resolved, per ADR-0002): **${ambiguous.length}**.

## Advisory ratchet — no new danglers

Live-document danglers in the two genuine-rot classes (missing-on-disk +
retired-target): **${ratchetCurrent}**, against a recorded baseline of
**${baseline}** (${baselineDate}). ${ratchetCurrent <= baseline
    ? "Within baseline. When the count drops, ratchet the baseline down in `tools/doc-graph/generate.mjs` (`NO_NEW_DANGLERS_RATCHET`)."
    : "**EXCEEDED — new danglers have been introduced since the baseline.** Review the live sections above for the additions. Advisory only (this report does not gate), but the convention is: fix the new ones in the PR that introduced them, or record why not."}

## Dangling references — from LIVE documents, missing on disk (review these)

${liveMissing.length === 0 ? "_None._" : liveMissing.map(fmt).join("\n")}

## Dangling references — from LIVE documents, retired (tombstoned) targets

The targets below were deliberately retired — a recorded decision, not drift.
The references are historical record; re-point them at the named successor
when (and only when) the referencing document is otherwise being edited.

${liveRetired.length === 0 ? "_None._" : liveRetired.map(fmt).join("\n")}

## Dangling references — from LIVE documents, on disk but outside the node set

These targets exist on disk; the "dangling" status is a scan-scope artifact,
not reference rot. They are the inventory for any future widening of the
node-set scope (a maintainer decision, not an action item here).

${liveOutside.length === 0 ? "_None._" : liveOutside.map(fmt).join("\n")}

## Directory references missing on disk

Backtick directory citations (trailing \`/\`) are not graph edges — a
directory is a collection, not a document node — but a citation of a
directory that no longer exists is the same drift class as a dangling file
reference. Resolved directory references are scanned but not listed.

### From live documents (review these)

${dirMissingLive.length === 0 ? "_None._" : dirMissingLive.map(fmtDir).join("\n")}

### From frozen / executed documents (expected drift)

${dirMissingOther.length === 0 ? "_None._" : dirMissingOther.map(fmtDir).join("\n")}

## Ambiguous references

${ambiguous.length === 0 ? "_None._" : ambiguous.map(fmt).join("\n")}

## Dangling references — from EXECUTED playbooks (reference-only records)

Listed for completeness; executed playbooks are quasi-frozen records of work
already performed, so these are not action items.

${byOrigin.executed.length === 0 ? "_None._" : byOrigin.executed.map(fmt).join("\n")}

## Dangling references — from FROZEN documents (archive + worklogs; expected drift)

Listed for completeness; they are not action items unless a frozen file is
being un-frozen.

${byOrigin.frozen.length === 0 ? "_None._" : byOrigin.frozen.map(fmt).join("\n")}

## License

Public Domain (The Unlicense).
`;
}

// ── Driver ───────────────────────────────────────────────────────────────────

/**
 * Build every artifact from one manifest pass. `renderPicture` gates the SVG
 * render specifically: the freshness gate (`--check`, what CI runs) compares
 * only the manifest skeleton + the existence of INDEX/REPORT (`checkDrift`) and
 * never consumes the SVG — `OUT_SVG` is explicitly NOT required there. Rendering
 * it in check mode was therefore dead work whose ONLY effect was to expose CI to
 * `dot`'s version-bound layout quirks (the `routesplines: cannot find NORMAL
 * edge` non-zero exit on CI's apt graphviz 2.42.2). Skipping the render in check
 * mode makes the gate robust to that whole class of failure — not just the one
 * trigger — which is the structural fix; the `concentrate`-off change in
 * `buildDot` additionally keeps the LOCAL full render (`renderPicture=true`)
 * clean on an older `dot`. See
 * `docs/worklog/2026-06-11-doc-graph-svg-spline-failure.md`.
 */
function generate({ renderPicture = true } = {}) {
  const manifest = buildManifest();
  const mermaid = buildMermaid(manifest);
  const index = buildIndexPage(manifest, mermaid);
  const report = buildReportPage(manifest);
  const artifacts = {
    // Committed JSON is the STABLE projection (committedManifest); the full
    // in-memory manifest is returned as _manifest for the --check skeleton.
    [OUT_JSON]: JSON.stringify(committedManifest(manifest), null, 2) + "\n",
    [OUT_INDEX]: index,
    [OUT_REPORT]: report,
    _manifest: manifest,
  };
  if (renderPicture) {
    const dotSource = buildDot(manifest);
    artifacts[OUT_SVG] = renderSvg(dotSource); // fails loudly if `dot` is absent
  }
  return artifacts;
}

function writeArtifacts(artifacts) {
  for (const [rel, content] of Object.entries(artifacts)) {
    if (rel.startsWith("_")) continue;
    writeFileSync(join(REPO_ROOT, rel), content);
  }
}

/**
 * Structural skeleton of the manifest — the node set (path + genre + hub-ness)
 * and the edge set (from/to/kind/resolved), sorted. The freshness gate compares
 * this, not the raw bytes, for two reasons:
 *
 *   1. The committed manifest no longer carries the raw HEAD-relative
 *      commit-distances at all (`committedManifest` strips them); the staleness
 *      data it does carry — `age_bucket` plus the first/last-commit dates — is a
 *      deliberate snapshot. A doc crossing a bucket boundary as HEAD advances,
 *      with no edit, is the heatmap working as intended, not a "forgot to
 *      regenerate" drift; comparing buckets would fail the gate spuriously on it.
 *   2. Structure is the honest definition of "did the graph change": a doc
 *      added / removed / re-genred, or an edge whose resolution flipped. That,
 *      and only that, is what a committed-but-stale artifact would misrepresent.
 *
 * Consequence (named per ADR-0002): the committed bucket/date heatmap is a
 * snapshot and can lag reality by up to a bucket between structural
 * regenerations — exactly the staleness the artifact is meant to surface. The
 * gate guards the structure, not the snapshot.
 *
 * The per-edge `target_class` and the `dir_refs` array are deliberately NOT
 * part of the skeleton (and not committed — see `committedManifest`): they
 * depend on disk existence of files outside the doc-graph CI workflow's path
 * filter, so gating on them would fail doc PRs for drift introduced by code
 * PRs the workflow never saw. Report-snapshot posture, same as the heatmap.
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
  // 2. The index/report must at least exist (they are projections of the
  // manifest; their heatmap content is HEAD-relative and not byte-compared).
  // OUT_SVG is intentionally NOT required: the SVG is rendered locally for
  // browsing but no longer committed (a full re-layout on any structural change
  // is counted by GitHub regardless of `.gitattributes -diff`). See
  // deferred-items "Doc-graph SVG — render off-tree".
  for (const rel of [OUT_INDEX, OUT_REPORT]) {
    if (!existsSync(join(REPO_ROOT, rel))) drifted.push(`${rel} (missing)`);
  }
  return drifted;
}

function main() {
  const checkMode = process.argv.includes("--check");
  // The freshness gate never consumes the SVG (checkDrift compares the manifest
  // skeleton + INDEX/REPORT existence; OUT_SVG is intentionally not required), so
  // render the picture ONLY when we are going to write artifacts. This keeps CI's
  // `--check` immune to `dot`'s version-bound layout failures (ADR-0002: the gate
  // should fail on real structural drift, never on a rendering quirk it discards).
  const artifacts = generate({ renderPicture: !checkMode });
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
