#!/usr/bin/env node
/**
 * tools/source-headers/check.mjs
 *
 * Source-file-header path-presence checker (umbrella-level tooling) — the
 * mechanization half of ADR-0006's source-file-header discipline, scoped to
 * its first, crispest part: does a source file's HEAD BLOCK carry its
 * subproject-relative path?
 *
 * ── Enforcement level: ADVISORY (ADR-0011 Rule 1) ──
 *
 * Per ADR-0011 Rule 1 (a discipline declares its enforcement surface) this
 * checker's level is **advisory surface**: it REPORTS per-file path-presence
 * misses and a summary count, and `--check` exits 0 regardless of how many
 * misses it finds. It is the measure-first (ADR-0011 Rule 3) first step
 * ADR-0006 Revisit #1 named ("a linter would partially mechanize the
 * discipline … the rule could be tightened"). It does NOT gate, and it does
 * NOT drive a retroactive sweep — ADR-0006's "no retroactive rewrite" posture
 * (Consequences › Neutral) is unchanged; misses accrete fixes incrementally as
 * files cycle through normal editing (the ADR-0004 retrofit composition).
 *
 * The structural precedent is `tools/band-conformance/check.mjs`: a
 * committed-report Node tool, zero runtime deps (Node built-ins only, no
 * node_modules, no venv), `--check` for CI, advisory on the judgment-shaped
 * half and fail-loud only on a crisp structural impossibility.
 *
 * ── What it checks ──
 *
 * For every NON-EXEMPT source file in the two subprojects:
 *   - frontend `src/**\/*.{ts,vue}`
 *   - backend  `**\/*.py`
 * it reads the file's HEAD BLOCK (the leading comment/docstring region) and
 * asks: does that block contain the file's path RELATIVE TO ITS SUBPROJECT
 * ROOT, as a literal substring? (frontend: `src/components/Foo.vue`;
 * backend: `services/card_service.py`.)
 *
 * The path may appear in any of the head-block forms the corpus uses:
 *   - frontend `.ts`: the leading JSDoc block (a slash-star-star … star-slash
 *     comment, like this file's own header).
 *   - frontend `.vue`: the SFC `<script>` JSDoc (ADR-0006's prescribed form)
 *     OR a leading HTML template comment (angle-bang-dash-dash form). The
 *     corpus splits ~19/50 between these two forms (measured 2026-06-11);
 *     both make the file
 *     self-locating, which is the path's PURPOSE (ADR-0006 "Why pathname").
 *     This tool checks for the path's PRESENCE in the head block, not its
 *     placement in one specific comment syntax — the placement nuance is
 *     recorded as data (HEAD_BLOCK_NOTE) rather than reported as a miss, so
 *     the measurement stays faithful to the path-presence question the
 *     work-status item (`source-file-header-lint`) names and comparable to
 *     its 2026-06-10 sample. A follow-up that wants to enforce the ADR's
 *     exact `<script>`-JSDoc placement is a tighter, separate check.
 *   - backend `.py`: the module docstring (`"""…"""`), where the path
 *     conventionally appears on the first or second line.
 *
 * The head block is taken as the first HEAD_BLOCK_LINES physical lines
 * (generous; a header sits at the very top by definition). This is a
 * line-window scan, not a comment parse — the zero-deps posture, same as
 * band-conformance's best-effort import scan. Its gap is named below.
 *
 * ── The exemption list (encoded as data; ADR-0006 §Exceptions) ──
 *
 * ADR-0006 scopes the discipline with an explicit exemption list; this tool
 * encodes that list as data with the ADR cited per entry (EXEMPTIONS). A file
 * matching any exemption is not counted in the denominator. The list is:
 *
 *   - GENERATED files — `frontend/src/types/backend.ts` (OpenAPI codegen),
 *     and backend `alembic/versions/*.py` (Alembic migration templates, whose
 *     docstring is the migration message, not a path). ADR-0006 §Exceptions
 *     "Generated files … do not carry a hand-written header".
 *   - `__init__.py` — ADR-0006 §Exceptions "a header is fine but not
 *     required".
 *   - VENDORED / licensing-firewalled — `backend/qeubo/**` is MIT-licensed
 *     vendored + runtime code (Meta Platforms; `backend/qeubo/LICENSE`),
 *     behind the directory-scoped licensing firewall
 *     (`backend/qeubo/README.md`). ADR-0006's per-file PD-license purpose
 *     contradicts MIT files, and the firewall forbids reading those source
 *     bodies; the proxy-submodule precedent ("Submodules follow their own
 *     conventions") is the umbrella analog. So qeubo is exempt by license
 *     boundary AND its bodies are never read by this walker (it is skipped at
 *     the directory level — see enumerateBackend). Recorded as data here so
 *     the exemption is auditable, not silent.
 *   - Config / data / tooling trees that are not subproject source under
 *     ADR-0006's scope ("source code intended for human reading"): the venv,
 *     bytecode caches, and node_modules are excluded at walk time
 *     (EXCLUDE_DIR_NAMES); they are not part of the corpus the ADR governs.
 *
 * ── The fail-loud structural check (always fatal) ──
 *
 *   - SUBPROJECT MISSING: a subproject root (`frontend/src`, `backend`) that
 *     does not exist on disk. A crisp set-difference fact (ADR-0002): the tool
 *     cannot measure a tree that is not there; failing loudly beats silently
 *     reporting 0/0. A SELF-TEST FIXTURE proves the path-presence predicate
 *     fires on a headerless file and is silent on a headered/exempt one (the
 *     probe-before-trust the brief mandates).
 *
 * The path-presence MISSES are advisory; the missing-subproject is fatal.
 *
 * Usage:
 *   node tools/source-headers/check.mjs            # report (human)
 *   node tools/source-headers/check.mjs --check    # CI: advisory (exit 0 on
 *                                                  # header misses; fatal only
 *                                                  # on a missing subproject)
 *   node tools/source-headers/check.mjs --strict   # misses fatal too (local)
 *   node tools/source-headers/check.mjs --json     # machine-readable dump
 *   node tools/source-headers/check.mjs --self-test # run the probe fixtures
 *
 * License: Public Domain (The Unlicense)
 */

import {
  readFileSync,
  readdirSync,
  existsSync,
  statSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";
import { tmpdir } from "node:os";

// ── Substrate tokens ─────────────────────────────────────────────────────────

/** Repo root = two levels up from tools/source-headers/. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FRONTEND = join(REPO_ROOT, "frontend");
const FRONTEND_SRC = join(FRONTEND, "src");
const BACKEND = join(REPO_ROOT, "backend");

/**
 * How many physical lines from the top constitute the "head block" we scan
 * for the path. Generous on purpose: a header sits at the very top by
 * definition, and over-reading is harmless (we only substring-match the
 * path). This is the only place a body line could be read; for the
 * licensing-firewalled qeubo tree we never reach here (it is skipped at the
 * directory level in enumerateBackend).
 */
const HEAD_BLOCK_LINES = 40;

/**
 * Directory names pruned at walk time in BOTH subprojects: virtualenvs,
 * bytecode caches, dependency trees. Not subproject source under ADR-0006's
 * scope ("source code intended for human reading"); excluded so they never
 * enter the corpus or get read.
 */
const EXCLUDE_DIR_NAMES = new Set([
  "venv",
  ".venv",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  "node_modules",
  ".git",
]);

/**
 * The exemption list, encoded as data with ADR-0006 cited per entry. A file
 * matching any predicate here is NOT counted (neither hit nor miss). Each
 * entry is `{ id, why, match(subproj, relPath) }` where `relPath` is
 * subproject-relative (the form the path-presence check keys on).
 *
 * Per ADR-0006 §Exceptions and §"What this tenet does NOT mean".
 */
const EXEMPTIONS = [
  {
    id: "generated-openapi",
    why:
      "Generated file (OpenAPI codegen output) — regenerated top-to-bottom, " +
      "no hand-written header. ADR-0006 §Exceptions (the named exemplar is " +
      "this exact file, frontend/src/types/backend.ts).",
    match: (subproj, rel) => subproj === "frontend" && rel === "src/types/backend.ts",
  },
  {
    id: "generated-alembic-migration",
    why:
      "Generated file (Alembic migration template) — its module docstring is " +
      "the migration message ('Revision ID: …'), not a path; Alembic " +
      "rewrites these. ADR-0006 §Exceptions ('Generated files … do not carry " +
      "a hand-written header').",
    match: (subproj, rel) => subproj === "backend" && rel.startsWith("alembic/versions/"),
  },
  {
    id: "python-package-init",
    why:
      "__init__.py — ADR-0006 §Exceptions: 'a header is fine but not " +
      "required. These files are often empty or contain only re-exports.'",
    match: (subproj, rel) => subproj === "backend" && rel.split("/").pop() === "__init__.py",
  },
  {
    id: "vendored-mit-licensing-firewall",
    why:
      "backend/qeubo/** is MIT-licensed vendored + runtime code (Meta " +
      "Platforms; backend/qeubo/LICENSE) behind the directory-scoped " +
      "licensing firewall (backend/qeubo/README.md). ADR-0006's per-file " +
      "PD-license purpose contradicts MIT files; the proxy-submodule " +
      "precedent ('Submodules follow their own conventions') is the umbrella " +
      "analog. EXEMPT BY LICENSE BOUNDARY — and this walker never reads those " +
      "bodies (skipped at the directory level in enumerateBackend).",
    match: (subproj, rel) => subproj === "backend" && rel.startsWith("qeubo/"),
  },
];

// The opening / closing HTML-comment delimiters, built by concatenation so the
// literal token sequences never appear in this ESM source (Node rejects them).
const HTML_OPEN = "<!" + "--";
const HTML_CLOSE = "--" + ">";

/**
 * Recorded-as-data placement nuance (not a miss): a .vue file carrying its
 * path in a leading HTML template comment (HTML_OPEN … HTML_CLOSE) rather than
 * the `<script>` JSDoc ADR-0006 prescribes. ~50 of 69 .vue files use this form
 * (measured 2026-06-11). Both forms make the file self-locating (the path's
 * purpose); this tool checks PRESENCE, not placement, so these are HITS. A
 * tighter check enforcing the exact `<script>`-JSDoc placement is a separate,
 * narrower follow-up (filed honestly in the worklog, not forced here).
 */
const HEAD_BLOCK_NOTE =
  "frontend .vue path may sit in the SFC <script> JSDoc (ADR-0006 form) or a " +
  `leading ${HTML_OPEN} … ${HTML_CLOSE} template comment; both count as present ` +
  "(presence, not placement).";

function isExempt(subproj, rel) {
  for (const ex of EXEMPTIONS) {
    if (ex.match(subproj, rel)) return ex;
  }
  return null;
}

// ── Source-file enumeration (per subproject) ─────────────────────────────────

/** Recursively collect files matching `extRe` under `absRoot`, pruning EXCLUDE_DIR_NAMES. */
function walkFiles(absRoot, extRe) {
  const out = [];
  const walk = (absDir) => {
    let entries;
    try {
      entries = readdirSync(absDir, { withFileTypes: true });
    } catch {
      return; // unreadable dir — skip (the missing-root check catches absence)
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (EXCLUDE_DIR_NAMES.has(e.name)) continue;
        walk(join(absDir, e.name));
      } else if (extRe.test(e.name)) {
        out.push(join(absDir, e.name));
      }
    }
  };
  walk(absRoot);
  return out;
}

/** Frontend corpus: `.ts`/`.vue` under frontend/src, subproject-relative (`src/…`). */
function enumerateFrontend() {
  return walkFiles(FRONTEND_SRC, /\.(ts|vue)$/)
    .map((abs) => "src/" + relative(FRONTEND_SRC, abs).replace(/\\/g, "/"))
    .sort();
}

/**
 * Backend corpus: `.py` under backend/, subproject-relative. The qeubo tree is
 * pruned at the directory level here (the licensing firewall) IN ADDITION to
 * the EXEMPTIONS data entry — defense in depth so the walker never reads an
 * MIT body even if the exemption check were edited.
 */
function enumerateBackend() {
  return walkFiles(BACKEND, /\.py$/)
    .map((abs) => relative(BACKEND, abs).replace(/\\/g, "/"))
    .filter((rel) => !rel.startsWith("qeubo/")) // licensing firewall: never read qeubo bodies
    .sort();
}

// ── Head-block path-presence predicate ───────────────────────────────────────

/** Read the first HEAD_BLOCK_LINES physical lines of a file as one string. */
function readHeadBlock(absPath) {
  const text = readFileSync(absPath, "utf8");
  const lines = text.split("\n");
  return lines.slice(0, HEAD_BLOCK_LINES).join("\n");
}

/**
 * Does the head block carry the subproject-relative path as a literal
 * substring? The path forms the corpus uses are exact subproject-relative
 * strings (`src/components/Foo.vue`, `services/card_service.py`), so a literal
 * substring test is the honest predicate. (Named gap: a file that mentions its
 * path in prose lower in the head block but not as a self-locating header
 * line would read as a hit — the same best-effort tradeoff band-conformance's
 * line-based import scan makes; in practice the corpus's path lines are the
 * only occurrences. Recorded per ADR-0002.)
 */
function headCarriesPath(absPath, relPath) {
  const head = readHeadBlock(absPath);
  return head.includes(relPath);
}

/**
 * For a `.vue` file that DOES carry its path: is the path in the ADR-0006-
 * PRESCRIBED placement (the SFC `<script>`-block JSDoc), or ONLY in a leading
 * HTML template comment (HTML_OPEN … HTML_CLOSE before the `<script>`/template)?
 * Returns "script" | "html-comment" | "other". Used to QUANTIFY the
 * presence-vs-placement swing in the report (Finding from the 2026-06-11
 * out-of-frame audit): the headline 97.4% counts the HTML-comment form as
 * present; a placement-strict run would report those as misses, and a
 * skim-reader deserves the magnitude, not just the prose note.
 *
 * Heuristic, not a parse (zero-deps posture): the path is "script" if it
 * appears AT OR AFTER the first `<script` opener in the head block, and
 * "html-comment" if it appears only BEFORE it. Named-gap: a file mixing both
 * is classed "script" (the prescribed form wins). Only meaningful for `.vue`.
 */
function vuePathPlacement(absPath, relPath) {
  const head = readHeadBlock(absPath);
  const pathAt = head.indexOf(relPath);
  if (pathAt < 0) return "other";
  const scriptAt = head.indexOf("<script");
  if (scriptAt < 0) return "html-comment"; // no <script> in window: header is the leading comment
  return pathAt >= scriptAt ? "script" : "html-comment";
}

// ── Analysis ─────────────────────────────────────────────────────────────────

/**
 * Run the path-presence analysis for one subproject. Pure-ish over its inputs
 * (takes the enumerated rel-path list + an absolute-path resolver) so the
 * self-test can drive it with a synthetic fixture tree.
 */
function analyzeSubproject(subproj, relPaths, absOf) {
  let present = 0;
  const misses = [];
  const exemptById = new Map();
  let counted = 0;
  // Placement breakdown for present `.vue` files (Finding: quantify the swing).
  let vuePresent = 0;
  let vueHtmlCommentOnly = 0;

  for (const rel of relPaths) {
    const ex = isExempt(subproj, rel);
    if (ex) {
      exemptById.set(ex.id, (exemptById.get(ex.id) ?? 0) + 1);
      continue;
    }
    counted++;
    const abs = absOf(rel);
    if (headCarriesPath(abs, rel)) {
      present++;
      if (rel.endsWith(".vue")) {
        vuePresent++;
        if (vuePathPlacement(abs, rel) === "html-comment") vueHtmlCommentOnly++;
      }
    } else {
      misses.push(rel);
    }
  }

  return {
    subproject: subproj,
    counted,
    present,
    misses: misses.sort(),
    exempt: [...exemptById.entries()]
      .map(([id, n]) => ({ id, count: n }))
      .sort((a, b) => a.id.localeCompare(b.id)),
    // Placement-strict view (.vue only): how many present .vue carry the path
    // ONLY in the HTML-comment form, not the ADR-0006-prescribed <script> JSDoc.
    // A placement-strict run would move these from present → miss.
    vuePresent,
    vueHtmlCommentOnly,
  };
}

/** Top-level analysis over both subprojects. Returns the structured result. */
function analyze() {
  // Fatal structural check: a subproject root must exist.
  const missingRoots = [];
  if (!existsSync(FRONTEND_SRC) || !statSync(FRONTEND_SRC).isDirectory())
    missingRoots.push("frontend/src");
  if (!existsSync(BACKEND) || !statSync(BACKEND).isDirectory()) missingRoots.push("backend");

  const subprojects = [];
  if (!missingRoots.includes("frontend/src")) {
    subprojects.push(
      analyzeSubproject("frontend", enumerateFrontend(), (rel) => join(FRONTEND, rel))
    );
  }
  if (!missingRoots.includes("backend")) {
    subprojects.push(
      analyzeSubproject("backend", enumerateBackend(), (rel) => join(BACKEND, rel))
    );
  }

  return { missingRoots, subprojects };
}

// ── Report ───────────────────────────────────────────────────────────────────

function pct(present, counted) {
  if (counted === 0) return "—";
  return ((100 * present) / counted).toFixed(1) + "%";
}

function printReport(r) {
  const out = [];
  out.push("source-headers: ADR-0006 path-presence audit (advisory; ADR-0011 Rule 1)");
  out.push("");

  // Fatal structural class.
  out.push("── Structural check (fail-loud; ADR-0002) ──");
  if (r.missingRoots.length === 0) {
    out.push("  ok — both subproject roots (frontend/src, backend) exist.");
  } else {
    out.push(`  MISSING SUBPROJECT ROOT(S): ${r.missingRoots.join(", ")}`);
    out.push("  Cannot measure a tree that is not on disk (ADR-0002).");
  }
  out.push("");

  for (const s of r.subprojects) {
    out.push(
      `── ${s.subproject}: ${s.present}/${s.counted} path-present (${pct(s.present, s.counted)}) ──`
    );
    if (s.exempt.length) {
      out.push("  exempt (not counted): " + s.exempt.map((e) => `${e.id}=${e.count}`).join(", "));
    }
    // Placement-strict disclosure (.vue): quantify the presence-vs-placement
    // swing so a skim-reader sees what the headline counts as present.
    if (s.vueHtmlCommentOnly > 0) {
      const strictNumer = s.present - s.vueHtmlCommentOnly;
      out.push(
        `  placement note: ${s.vueHtmlCommentOnly} present .vue carry the path in the leading HTML-comment`
      );
      out.push(
        `    form, NOT the ADR-0006-prescribed <script> JSDoc; a placement-strict run would report`
      );
      out.push(
        `    them as misses → ${strictNumer}/${s.counted} (${pct(strictNumer, s.counted)}). Counted present here (presence, not placement).`
      );
    }
    if (s.misses.length === 0) {
      out.push("  no misses — every counted file's head block carries its path.");
    } else {
      out.push(
        `  ${s.misses.length} miss(es) — head block does NOT carry the subproject-relative path:`
      );
      for (const m of s.misses) out.push(`    - ${m}`);
    }
    out.push("");
  }

  out.push("── Notes ──");
  out.push(`  • ${HEAD_BLOCK_NOTE}`);
  out.push("  • Advisory: misses do NOT gate (ADR-0011 Rule 1, advisory surface) and");
  out.push("    do NOT trigger a retroactive sweep (ADR-0006 'no retroactive rewrite';");
  out.push("    headers retrofit incrementally on touch, ADR-0004 composition).");
  out.push("");
  return out.join("\n");
}

// ── Self-test (the probe-before-trust fixtures) ──────────────────────────────

/**
 * Synthetic on-disk fixtures proving the path-presence predicate (a) REPORTS a
 * headerless file, (b) is SILENT on a properly-headered file (both the
 * <script>-JSDoc and the leading-HTML-comment forms), (c) is SILENT on an
 * exempt file (generated, __init__.py, qeubo), and (d) FAILS CLOSED on a file
 * whose path appears ONLY below the head-block window (a deep mention is NOT a
 * header — it must still be a miss). Fixture (d) is the negative probe the
 * 2026-06-11 out-of-frame audit asked for: it pins the bounded-window behaviour
 * so the predicate cannot be edited into scanning the whole file (which would
 * fail open on body mentions). This is the probe the brief mandates, standing
 * in the tool so a future edit that neuters the predicate goes red. Drives
 * analyzeSubproject directly with a synthetic absOf.
 */
function selfTest() {
  let passed = 0;
  let failed = 0;
  const log = (ok, name, detail) => {
    if (ok) passed++;
    else failed++;
    process.stdout.write(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
  };
  process.stdout.write("source-headers self-test (probe-before-trust):\n");

  const tmpRoot = join(tmpdir(), `source-headers-selftest-${process.pid}`);

  const headeredScript = "src/components/Headered.vue"; // path in <script> JSDoc
  const headlessTs = "src/composables/headless.ts"; // NO path → miss
  const headeredComment = "src/components/CommentHeadered.vue"; // path in HTML-comment form
  const deepMentionTs = "src/composables/deepMention.ts"; // path only BELOW the window → miss
  const exemptInit = "__init__.py"; // backend exempt
  const exemptGen = "src/types/backend.ts"; // frontend generated exempt
  const exemptQeubo = "qeubo/runtime/service.py"; // backend MIT firewall exempt

  // A body that mentions the path only on a line beyond HEAD_BLOCK_LINES: a
  // comment in the file body, not a header. Must FAIL CLOSED (be a miss).
  const deepMentionBody =
    "import { ref } from 'vue';\n" +
    "// padding\n".repeat(HEAD_BLOCK_LINES + 5) +
    `// see ${deepMentionTs} for the original\nexport const y = ref(0);\n`;

  const files = {
    [headeredScript]:
      `<script setup lang="ts">\n/**\n * ${headeredScript}\n *\n * License: Public Domain (The Unlicense)\n */\n</script>\n`,
    [headlessTs]: `import { ref } from 'vue';\nexport const x = ref(0);\n`,
    [headeredComment]:
      `${HTML_OPEN}\n  ${headeredComment}\n  License: Public Domain (The Unlicense)\n${HTML_CLOSE}\n<template><div/></template>\n`,
    [deepMentionTs]: deepMentionBody,
    [exemptInit]: `from .foo import bar\n`,
    [exemptGen]:
      `/**\n * This file was auto-generated by openapi-typescript.\n */\nexport interface paths {}\n`,
  };

  for (const [rel, body] of Object.entries(files)) {
    const abs = join(tmpRoot, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body, "utf8");
  }
  const absOf = (rel) => join(tmpRoot, rel);

  try {
    // Frontend set: headeredScript (hit), headlessTs (miss), headeredComment
    // (hit), deepMentionTs (miss — path below the window), generated (exempt).
    const fe = analyzeSubproject(
      "frontend",
      [headeredScript, headlessTs, headeredComment, deepMentionTs, exemptGen],
      absOf
    );
    log(
      fe.present === 2 &&
        fe.counted === 4 && // headeredScript + headlessTs + headeredComment + deepMentionTs
        fe.misses.length === 2 &&
        fe.misses.includes(headlessTs),
      "headerless file is REPORTED; <script>-JSDoc + HTML-comment headers are SILENT",
      `present=${fe.present}/${fe.counted}, misses=[${fe.misses.join(",")}]`
    );
    log(
      fe.misses.includes(deepMentionTs),
      "path only BELOW the head-block window is a MISS (predicate fails CLOSED)",
      `misses=[${fe.misses.join(",")}]`
    );
    log(
      fe.vueHtmlCommentOnly === 1 && fe.vuePresent === 2,
      "placement breakdown: HTML-comment-only present .vue is quantified (1 of 2)",
      `vueHtmlCommentOnly=${fe.vueHtmlCommentOnly}, vuePresent=${fe.vuePresent}`
    );
    log(
      fe.exempt.some((e) => e.id === "generated-openapi" && e.count === 1),
      "generated file is EXEMPT (not counted)",
      JSON.stringify(fe.exempt)
    );

    // Backend set: exempt __init__.py and exempt qeubo (neither counted, qeubo
    // body never read).
    const be = analyzeSubproject("backend", [exemptInit, exemptQeubo], absOf);
    log(
      be.counted === 0 &&
        be.exempt.some((e) => e.id === "python-package-init" && e.count === 1) &&
        be.exempt.some((e) => e.id === "vendored-mit-licensing-firewall" && e.count === 1),
      "__init__.py and backend/qeubo/** are EXEMPT (qeubo body never read)",
      `counted=${be.counted}, exempt=${JSON.stringify(be.exempt)}`
    );
  } finally {
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }

  process.stdout.write(`  → ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

// ── Driver ───────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) {
    process.exit(selfTest() ? 0 : 1);
  }

  const r = analyze();

  if (argv.includes("--json")) {
    process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    return;
  }

  process.stdout.write(printReport(r) + "\n");

  const totalMisses = r.subprojects.reduce((n, s) => n + s.misses.length, 0);
  const structuralFatal = r.missingRoots.length > 0;

  if (argv.includes("--strict")) {
    // Local zero-miss run: path-presence misses are fatal too.
    if (structuralFatal || totalMisses > 0) {
      process.stderr.write(
        "source-headers: --strict — missing subproject or path-presence misses present.\n"
      );
      process.exit(1);
    }
    return;
  }

  if (argv.includes("--check")) {
    // CI: ONLY the crisp missing-subproject class gates (ADR-0002). Path-presence
    // misses are advisory (ADR-0011 Rule 1) and never fail the build.
    if (structuralFatal) {
      process.stderr.write(
        "\nsource-headers: MISSING SUBPROJECT ROOT (fatal) — a subproject tree is\n" +
          "not on disk. A crisp set-difference fact (ADR-0002). (Path-presence\n" +
          "misses above are advisory and do not gate.)\n"
      );
      process.exit(1);
    }
    process.stdout.write(
      "source-headers: advisory run — path-presence misses do not gate (ADR-0011 Rule 1).\n"
    );
    return;
  }
}

main();
