/**
 * tools/import-graph.mjs
 *
 * Shared import-graph recovery for the umbrella's frontend-src Node tools.
 * NOT a CLI tool — a library, consumed by `tools/band-conformance/check.mjs`
 * (ADR-0003 band-ordering) and `tools/cycle-check/check.mjs` (import-cycle
 * ratchet). It owns ONE fact: how a relative import edge in `frontend/src` is
 * recovered from source (enumeration → Vite/TS-style resolution → a
 * line-based import scan). Extracted from band-conformance's check.mjs so the
 * two consumers derive the graph from one home rather than re-authoring the
 * walker (ADR-0012 P1 derive-don't-duplicate; ADR-0008 — each tool keeps its
 * own single classification, the walker is neither tool's identity).
 *
 * Flat under `tools/` rather than `tools/lib/`: a single shared module does
 * not earn a subdirectory (ADR-0008 earn-your-place ≥4 files / strong
 * cluster). When a second shared lib appears, `tools/lib/` earns its place and
 * both relocate.
 *
 * Zero external dependencies: pure Node. The line-based scan is best-effort
 * (no full TS parse) by the same zero-deps posture the sibling tools hold.
 *
 * License: Public Domain (The Unlicense)
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

// ── Path substrate ───────────────────────────────────────────────────────────

/** Repo root = one level up from tools/ (this file is tools/import-graph.mjs). */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const FRONTEND = join(REPO_ROOT, "frontend");
export const SRC_DIR = join(FRONTEND, "src");

// ── Source-file enumeration ──────────────────────────────────────────────────

/** Absolute path → `src/<...>` relative form. */
export function srcRelOf(abs, srcRoot = SRC_DIR) {
  return "src/" + relative(srcRoot, abs).replace(/\\/g, "/");
}

/** Every `.ts`/`.vue` file under src, src-relative, excluding the codegen file. */
export function enumerateSrcFiles(srcRoot = SRC_DIR) {
  const out = [];
  const walk = (absDir) => {
    for (const e of readdirSync(absDir, { withFileTypes: true })) {
      const abs = join(absDir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (/\.(ts|vue)$/.test(e.name)) out.push(srcRelOf(abs, srcRoot));
    }
  };
  walk(srcRoot);
  // src/types/backend.ts is OpenAPI-generated — never hand-tagged, excluded
  // from FILES.md, and excluded here (it is the ACL's generated wire types).
  return out.filter((f) => f !== "src/types/backend.ts").sort();
}

// ── Module resolution ────────────────────────────────────────────────────────

/**
 * Resolve a relative import specifier from a file to a src-relative path.
 * Returns `{ resolved, exists }`. Mirrors Vite/TS module resolution for the
 * extensionless + directory-index forms the codebase uses (`../store` →
 * `store/index.ts`). Bare specifiers (npm, `vue`) resolve to `null`.
 */
export function resolveImport(fromSrcRel, spec, srcRoot = SRC_DIR) {
  if (!spec.startsWith(".")) return null; // bare → npm package, not in-graph
  const fromAbs = join(srcRoot, relative("src", fromSrcRel));
  const baseAbs = resolve(dirname(fromAbs), spec);
  const candidates = [
    baseAbs,
    baseAbs + ".ts",
    baseAbs + ".vue",
    baseAbs + ".json",
    join(baseAbs, "index.ts"),
    join(baseAbs, "index.vue"),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) {
      return { resolved: srcRelOf(c, srcRoot), exists: true };
    }
  }
  return { resolved: srcRelOf(baseAbs, srcRoot), exists: false };
}

// ── Import scan ──────────────────────────────────────────────────────────────

const IMPORT_FROM_RE = /^\s*(?:export\s+)?import\s+(type\s+)?[\s\S]*?from\s*['"]([^'"]+)['"]/;
const EXPORT_FROM_RE = /^\s*export\s+(type\s+)?(?:\*|\{[\s\S]*?\})\s*from\s*['"]([^'"]+)['"]/;
const SIDE_EFFECT_RE = /^\s*import\s+['"]([^'"]+)['"]/;

/**
 * Extract a file's runtime import edges. Each edge is
 * `{ from, spec, target, exists, typeOnly }`. `typeOnly` is true for
 * `import type` / `export type` (compile-time-erased — exempt). Re-export
 * `from` lines are edges too (a barrel's re-export is a runtime dependency on
 * the leaf for value re-exports; `export type` is type-only).
 *
 * Best-effort line-based scan (no full TS parse — zero-deps posture). It reads
 * single-line `import … from '…'` and the common multi-line member form is
 * handled by the `[\s\S]*?` in the regex only when the `from` lands on the
 * same logical match; for robustness across multi-line member lists we
 * pre-join continuation lines that lack a `from` with their closing `from`.
 */
export function extractEdges(fromSrcRel, body) {
  const edges = [];
  const seen = new Set();
  // Pre-join: collapse a multi-line `import { … \n … } from '…'` into one line
  // so the single-line regexes catch it. We join lines from an `import`/
  // `export` opener up to the line carrying the closing `from '…'`.
  const physical = body.split("\n");
  const logical = [];
  let buffer = null;
  for (const line of physical) {
    const opensImport = /^\s*(?:export\s+)?import\b/.test(line) || /^\s*export\b/.test(line);
    if (buffer !== null) {
      buffer += " " + line.trim();
      if (/from\s*['"][^'"]+['"]/.test(line) || /['"][^'"]+['"]\s*;?\s*$/.test(line)) {
        logical.push(buffer);
        buffer = null;
      }
      continue;
    }
    if (opensImport && !/from\s*['"][^'"]+['"]/.test(line) && !SIDE_EFFECT_RE.test(line) && /[{,]\s*$/.test(line)) {
      buffer = line.trim();
      continue;
    }
    logical.push(line);
  }
  if (buffer !== null) logical.push(buffer);

  for (const line of logical) {
    let typeOnly = false;
    let spec = null;
    let m;
    if ((m = line.match(IMPORT_FROM_RE))) {
      typeOnly = !!m[1];
      spec = m[2];
    } else if ((m = line.match(EXPORT_FROM_RE))) {
      typeOnly = !!m[1];
      spec = m[2];
    } else if ((m = line.match(SIDE_EFFECT_RE))) {
      typeOnly = false;
      spec = m[1];
    } else {
      continue;
    }
    if (!spec || !spec.startsWith(".")) continue;
    const r = resolveImport(fromSrcRel, spec);
    if (!r) continue;
    const key = `${r.resolved}|${typeOnly}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push({ from: fromSrcRel, spec, target: r.resolved, exists: r.exists, typeOnly });
  }
  return edges;
}

// ── Whole-graph convenience ──────────────────────────────────────────────────

/**
 * Recover every relative import edge in `frontend/src`. Returns
 * `{ srcFiles, edges }` where `edges` is the flat concatenation of every
 * file's `extractEdges`. The single home both consumers walk; band-conformance
 * keeps its own interleaved loop (it reads bands as it goes), cycle-check uses
 * this directly.
 */
export function collectEdges({ srcRoot = SRC_DIR } = {}) {
  const srcFiles = enumerateSrcFiles(srcRoot);
  const edges = [];
  for (const f of srcFiles) {
    const abs = join(srcRoot, relative("src", f));
    if (!existsSync(abs)) continue;
    for (const e of extractEdges(f, readFileSync(abs, "utf8"))) edges.push(e);
  }
  return { srcFiles, edges };
}
