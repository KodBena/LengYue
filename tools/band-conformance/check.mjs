#!/usr/bin/env node
/**
 * tools/band-conformance/check.mjs
 *
 * Band-conformance checker (umbrella-level tooling) — the mechanization
 * half of ADR-0003's band discipline.
 *
 * ADR-0003 names its own weakness ("the principle is policy, not
 * mechanism") and ADR-0002 Rule 7 / ADR-0008 (classification discipline)
 * already name the `[B1]/[B2]/[B3]` band tags as a fail-loudly-governed
 * closed vocabulary. This script is that vocabulary's first concrete
 * per-tenet mechanization: it parses `frontend/FILES.md`'s band tags, walks
 * the runtime import graph of `frontend/src`, and enforces the band-ordering
 * invariant
 *
 *     band(file) >= band(import)        ([B1] < [B2] < [B3])
 *
 * i.e. a more-portable module must not depend (at RUNTIME) on a
 * less-portable one. A `[B1]` (any-knowledge-domain) module importing a
 * `[B3]` (Go-bound) value is a portability leak: a fork that replaces the
 * Go surface wholesale would strand the "portable" module on a dependency
 * that no longer exists.
 *
 * Structural precedent: `tools/doc-graph/generate.mjs` — a committed-report
 * Node tool, zero runtime deps (Node built-ins only, no node_modules, no
 * venv), `--check` for CI, fail-loud on a structural impossibility.
 *
 * ── What this checks, and what it deliberately does NOT (the design brief) ──
 *
 * The LITERAL rule (`band(file) >= band(import)` over every edge) DROWNS:
 * measured on the tree at adoption, 119 hits, 74 of them (62%) flowing into
 * the two BAND-MIXED HUBS — the `src/types.ts` barrel (`[B3]`, re-exporting
 * modules that span all three bands) and `src/store/index.ts` (`[B3]`,
 * the central reactive store every layer touches). FILES.md tags a
 * band-mixed file for its DOMINANT concern (its legend says so explicitly);
 * the literal rule reads the dominant tag as if it were the whole file, so a
 * `[B1]` module pulling one agnostic symbol through the `[B3]` barrel reads
 * as a violation it is not. Three structural responses, all recorded here:
 *
 *   1. TYPE-ONLY imports are exempt. An `import type` (and the inline
 *      `import('…').T` type-position form) is compile-time-erased — it
 *      carries no runtime coupling, so it sits outside this rule's target
 *      exactly as it sits outside the eslint component→services boundary's
 *      `allowTypeImports`. A type dependency on a `[B3]` vocabulary does not
 *      make the importer Go-coupled at runtime; the fork replaces the type
 *      module and the importer's runtime structure survives. (44 of the 119
 *      at adoption.)
 *
 *   2. The two band-mixed HUBS are exempt as import TARGETS (HUB_EXEMPT_TARGETS),
 *      with the reason recorded per entry. This is the brief's "exempt hubs
 *      explicitly" option (the alternative was "scope to B3-leaf/engine
 *      imports"); exempting the two named hubs is the narrower, more honest
 *      cut — it names exactly the two dominant-concern hubs the corpus
 *      already documents (ADR-0003's `types.ts`-exclusion note; FILES.md's
 *      barrel row), rather than a coarse directory predicate.
 *
 *   3. The ANNOTATED-EXCEPTION list (BAND_EXCEPTIONS) carries the residual
 *      `from → to` pairs that are dominant-concern-legend artifacts or
 *      named-and-owned drift, each with a reason. Per ADR-0008's Exceptions
 *      ("deliberately-imprecise tag") this list ENCODES FILES.md's
 *      dominant-concern legend rule — it is expected NON-EMPTY by design,
 *      not a backlog to drive to zero. A violation neither type-only, nor
 *      into a hub, nor on this list is REPORTED.
 *
 * ── Severity: advisory-first (warn), with a no-new-findings ratchet ──
 *
 * Per ADR-0011 Rule 3 (mechanisms adopt measure-first; adopt at `error` only
 * on a zero-or-fully-triaged baseline) and Rule 5 (a mandatory gate on
 * judgment-shaped output is miscalibrated — advisory surface for
 * judgment-shaped predicates), the band-ordering CLASS stays ADVISORY in its
 * DETAIL: every finding is printed every run, never silenced, because each is
 * a genuine ADR-0003 seam judgment (is this band tag wrong, or is this an
 * expected dominant-concern artifact?), not a crisp mechanical predicate.
 * Driving the whole population to a zero `error` baseline would demand
 * adjudicating that judgment, which is the review work ADR-0003's "content
 * half" keeps with the human.
 *
 * But the unratcheted advisory stance leaves the class UNGATED: nothing fails
 * CI on a genuinely NEW band leak — the report surfaces it, it does not
 * prevent it (the residual the band-conformance-ci-check adversarial review
 * recorded, and the successor item this ratchet discharges). The honest
 * Rule-3 graduation, modelled on the doc-graph `NO_NEW_DANGLERS_RATCHET`
 * pattern, is a NO-NEW-FINDINGS RATCHET (`NO_NEW_FINDINGS_RATCHET` below):
 * a measured baseline count of advisory findings, and a `--check` exit that
 * FAILS when the current count EXCEEDS it. This gates on the DELTA (a new
 * leak) while never gating on the EXISTING baseline (the review surface stays
 * the human's). The finding detail is unchanged — still printed in full,
 * still advisory; only the count crossing the baseline is fatal.
 *
 * Sibling-divergence note: the doc-graph `NO_NEW_DANGLERS_RATCHET` is
 * REPORT-ONLY (its CI gate checks artifact freshness, not the dangler count,
 * so the ratchet there surfaces-but-does-not-prevent). This ratchet is the
 * same SHAPE — a measured baseline that ratchets DOWN as findings are
 * resolved — but it is WIRED TO GATE: `--check` exits non-zero on a count
 * above the baseline. The two read as siblings in structure; they differ in
 * the one axis the band-conformance successor item asked to graduate.
 *
 * RATCHETING DOWN: the baseline is a high-water mark, never a target floor.
 * As the maintainer adjudicates findings — retagging a wrong band in
 * FILES.md, or moving a dominant-concern artifact into BAND_EXCEPTIONS with a
 * reason — the current count drops below the baseline. When it does, LOWER
 * `NO_NEW_FINDINGS_RATCHET.baseline` to the new measured count in the SAME
 * change (and bump `baselineDate`). The ratchet only goes down; it never
 * rises to admit a new leak. A finding count BELOW the baseline is within
 * tolerance and does not gate (the slack absorbs an in-flight retag landing
 * before the constant is lowered); a count ABOVE it is the new leak the gate
 * exists to catch.
 *
 * `--check` still exits NON-ZERO on the one CRISP, mechanical impossibility
 * the brief mandates fail-loud: a FILES.md row resolving to no file, or a src
 * file with no FILES.md row (structural drift, ADR-0002). `--strict` flips
 * ALL band findings (not just the over-baseline delta) to fatal for local
 * zero-drift runs.
 *
 * ── The fail-loud structural checks (always fatal) ──
 *
 *   - GHOST ROW: a FILES.md band row naming a path that does not exist on
 *     disk. The `jquery-bridge.ts` ghost (deleted 2026-06-01 in 9949b28,
 *     its FILES.md row lingering) was the worked case; it is fixed at
 *     adoption, so a SELF-TEST FIXTURE (`fixtures/ghost-row.files.md`)
 *     proves the loud failure fires. This composes with FILES.md's own
 *     flagged "future scripted check" (its "Maintaining this map" tail).
 *   - MISSING ROW: a src `.ts`/`.vue` file with no FILES.md band row. The
 *     inverse drift; three were found at adoption (filed, see worklog).
 *
 * Both are crisp set-difference facts (ADR-0002): a path either resolves or
 * it does not. They gate; the band-ordering findings advise.
 *
 * Usage:
 *   node tools/band-conformance/check.mjs            # report (human)
 *   node tools/band-conformance/check.mjs --check    # CI: structural-drift
 *                                                    # gate + no-new-findings
 *                                                    # ratchet (fails if the
 *                                                    # advisory count exceeds
 *                                                    # NO_NEW_FINDINGS_RATCHET;
 *                                                    # finding detail stays
 *                                                    # advisory)
 *   node tools/band-conformance/check.mjs --strict   # ALL band findings fatal too
 *   node tools/band-conformance/check.mjs --json     # machine-readable dump
 *   node tools/band-conformance/check.mjs --self-test # run the fixture proofs
 *
 * License: Public Domain (The Unlicense)
 */

import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative, basename } from "node:path";

// ── Substrate tokens ─────────────────────────────────────────────────────────

/** Repo root = two levels up from tools/band-conformance/. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FRONTEND = join(REPO_ROOT, "frontend");
const SRC_DIR = join(FRONTEND, "src");
const FILES_MD = join(FRONTEND, "FILES.md");

/** Band ordering: a more-portable band is a SMALLER rank. */
const BAND_RANK = { B1: 1, B2: 2, B3: 3 };

/**
 * Import targets that are deliberately exempt because they are BAND-MIXED
 * HUBS tagged for their dominant concern (FILES.md legend: "tagged for the
 * dominant concern in the file"). The literal rule reads the dominant tag as
 * the whole file; for these two that misreads the file. Recorded per ADR-0008
 * Exceptions (the dominant-concern legend rule is encoded here, expected
 * non-empty). Paths are src-relative (the form the checker keys on).
 */
const HUB_EXEMPT_TARGETS = new Map([
  [
    "src/types.ts",
    "Barrel over per-domain type modules spanning all three bands (FILES.md " +
      "row; ADR-0003's types.ts-exclusion note). Tagged [B3] for the highest " +
      "band it re-exports; a value import of an agnostic symbol through it is " +
      "not a Go-coupling. The per-leaf module under types/ carries the honest " +
      "band — depend on the leaf directly to get a real edge.",
  ],
  [
    "src/store/index.ts",
    "Central reactive GlobalStore singleton (FILES.md row [B3]; ADR-0003 " +
      "Revisit-#3 disagreement on record — Band-1 'no change' in the Chess " +
      "sizing vs [B3] here). Every layer touches the store; the [B3] tag " +
      "reflects the board/engine slices that dominate the schema, not a claim " +
      "that every reader is Go-coupled. The store-write-needs-owner eslint " +
      "rule already governs WHO may write its slices.",
  ],
]);

/**
 * Annotated band exceptions: residual `from → to` value edges that are
 * dominant-concern-legend artifacts or named-and-owned drift. Per ADR-0008's
 * "deliberately-imprecise tag" exception, this list ENCODES FILES.md's
 * dominant-concern legend rule and is expected NON-EMPTY by design. Each key
 * is `"<from>|<to>"` (src-relative); the value is the reason. Seeded at
 * adoption with the unambiguous legend cases (named-and-owned leaks, the
 * bootstrap/wiring entry points, the dev-gated harness wiring); the genuinely
 * judgment-shaped band disagreements are left in the advisory REPORT, not
 * pre-absolved here, so the report's untriaged list is the real review
 * surface (ADR-0011 Rule 5).
 */
const BAND_EXCEPTIONS = new Map([
  // [B2] tree widget hosting the [B3] hover thumbnail: dominant-concern edge —
  // the thumbnail IS a Go-board MiniBoard surface; the tree consumes it as an
  // opaque hover affordance. Adjudicated 2026-06-11 at the PR #413 gate (the
  // re-band minted this edge; retagging TreeWidget [B3] would be the greater lie).
  ['src/components/tree/TreeWidget.vue|src/components/board/FloatingThumbnail.vue',
   'B2 host consumes B3 thumbnail as opaque affordance (dominant concern holds)'],
  // [B2] scenario registry importing the [B3] jank-extended scenario:
  // dominant-concern edge — the registry's job is to enumerate every
  // registered scenario regardless of band; it consumes jankExtended as an
  // opaque factory. Minted 2026-06-12 when jankExtended was honestly
  // retagged B3 (it writes KataGo wire-capability settings); retagging the
  // whole registry B3 over one entry would also adjudicate its pre-existing
  // baseline finding (scenarios.ts→analysis-service, the maintainer's
  // review surface) as a side effect — the greater lie, same shape as the
  // TreeWidget precedent above.
  ['src/composables/perf/scenarios.ts|src/composables/perf/jankExtended.ts',
   'B2 registry consumes B3 scenario as opaque factory (dominant concern holds)'],
  [
    "src/components/editors/RegistryEditor.vue|src/engine/katago/types.ts",
    "Named-and-owned leak: FILES.md's RegistryEditor row records the " +
      "WINRATE_FRAMINGS import from [B3] engine/katago/types; the structural " +
      "fix is owned by the config-schema-projections Phase 1 arc.",
  ],
  [
    "src/main.ts|src/App.vue",
    "Bootstrap entry point: main.ts ([B1]) mounts the [B3] App.vue. The app " +
      "root is intrinsically the whole instance; a fork swaps both together. " +
      "Wiring, not a portable-module leak (FILES.md App.vue/useAppBootstrap " +
      "'wiring, not a B1 substrate' register).",
  ],
  [
    "src/main.ts|src/engine/sgf-writer.ts",
    "DEV-only bootstrap wiring: main.ts exposes serializeBoard/" +
      "serializeActivePath as untyped DEV console debug handles " +
      "(import.meta.env.DEV-gated; tree-shaken from production). The [B1] tag " +
      "is the production-runtime band; the DEV handle is not a shipped edge.",
  ],
  [
    "src/main.ts|src/composables/perf/scenarios.ts",
    "DEV-only bootstrap wiring: installPerfScenarios is the perf-harness " +
      "install, import.meta.env.DEV-gated and tree-shaken from production " +
      "(perf/ is the dev-only capture harness, ADR-0009).",
  ],
  // ── 2026-06-12 maintainer band adjudication (tranche 2) ──
  // Worklog: docs/worklog/2026-06-12-band-adjudication-tranche-2.md.
  //
  // The keybindings substrate/catalog split (history-lessons audit §3.16):
  // the catalog is maintainer-confirmed [B3] — the domain half, which a fork
  // replaces wholesale while keeping the lib/keybindings.ts substrate. Its
  // three consumers are generic machinery taking the catalog as an opaque
  // decl registry; dominant concern holds on all three importers.
  ['src/components/KeybindingRow.vue|src/composables/keybindings-catalog.ts',
   "B1 row machinery passes the B3 catalog through as findActionByKey's registry argument (dominant concern holds)"],
  ['src/components/KeybindingsView.vue|src/composables/keybindings-catalog.ts',
   'B1 registry view walks the injected B3 catalog as an opaque decl list (dominant concern holds)'],
  ['src/composables/useUserIORegistry.ts|src/composables/keybindings-catalog.ts',
   'B2 dispatcher consumes the B3 catalog as an opaque decl registry (dominant concern holds)'],
  // SettingsTab retagged B2→B1 (maintainer adjudication: generic settings
  // chrome). Its domain edges are named-and-owned contamination — the
  // adjudication records they "may be structural necessity", possibly
  // dissolved by config-schema-projections (the RegistryEditor
  // WINRATE_FRAMINGS entry above is the same register, same owner).
  ['src/components/SettingsTab.vue|src/components/editors/PaletteEditor.vue',
   'Named-and-owned: B1 settings chrome hosts the B3 analysis-env editor; owned by config-schema-projections'],
  ['src/components/SettingsTab.vue|src/components/editors/AnalysisTabsEditor.vue',
   'Named-and-owned: B1 settings chrome hosts the B3 analysis-tab-layout editor; owned by config-schema-projections'],
  ['src/components/SettingsTab.vue|src/components/editors/CardSetEditor.vue',
   'Named-and-owned: B1 settings chrome hosts the B2 deck-pipeline editor; owned by config-schema-projections'],
  ['src/components/SettingsTab.vue|src/store/profile-owner.ts',
   'Named-and-owned: settings mutations route through the B3 profile owner (settings-profile-mutator-owner pattern); owned by config-schema-projections'],
  // ForestDirectory retagged B2→B1 (maintainer adjudication: deck/card/
  // lineage browsing is a domain-free SRS surface, "B1 modulo the B2/B3
  // specifics ... the delineation is fairly obvious"). The eleven edges
  // below ARE that delineation, annotated: a B1 orchestrator hosting the
  // domain halves of the browse/review surface (the main.ts|App.vue wiring
  // register). Whether the B2 card/forest composables deserve B1 themselves
  // is a separate, unadjudicated question — see the worklog.
  ['src/components/tree/ForestDirectory.vue|src/components/CardMetadataPanel.vue',
   'B1 orchestrator hosts the B3 card-metadata panel (maintainer-named specific: per-domain card labels)'],
  ['src/components/tree/ForestDirectory.vue|src/components/ReviewSessionPanel.vue',
   'B1 orchestrator hosts the B3 in-session SR panel (maintainer-named specific: review session)'],
  ['src/components/tree/ForestDirectory.vue|src/composables/review/useReviewSession.ts',
   'B1 orchestrator drives the B3 review-session composable (maintainer-named specific: review session)'],
  ['src/components/tree/ForestDirectory.vue|src/components/charts/CardTreeWidget.vue',
   'B1 orchestrator hosts the B2 card-tree forest display (wiring register)'],
  ['src/components/tree/ForestDirectory.vue|src/components/tree/ForestTreeNav.vue',
   'B1 orchestrator hosts the B2 hierarchical navigator (wiring register)'],
  ['src/components/tree/ForestDirectory.vue|src/composables/cards/useCardMetadata.ts',
   'B1 orchestrator calls the B2 card-metadata boundary (wiring register)'],
  ['src/components/tree/ForestDirectory.vue|src/composables/cards/useCardTreeData.ts',
   'B1 orchestrator drives the B2 per-board card-tree projection (wiring register)'],
  ['src/components/tree/ForestDirectory.vue|src/composables/forest/useForestBrowsePolicy.ts',
   'B1 orchestrator wires the B2 selection-to-pane policy (wiring register)'],
  ['src/components/tree/ForestDirectory.vue|src/composables/forest/useForestNavigation.ts',
   'B1 orchestrator drives the B2 forest navigator state (wiring register)'],
  ['src/components/tree/ForestDirectory.vue|src/composables/forest/useForestStats.ts',
   'B1 orchestrator calls the B2 forest-stats boundary (wiring register)'],
  ['src/components/tree/ForestDirectory.vue|src/utils/context-id-macros.ts',
   'B1 orchestrator expands B2 context-id macros for the deck pipeline (wiring register)'],
]);

/**
 * No-new-findings ratchet (the GATING graduation of the advisory class). The
 * baseline is the MEASURED count of advisory band-ordering findings at
 * adoption — runtime value edges where `band(file) < band(import)` that are
 * not type-only, not into a band-mixed hub, and not on BAND_EXCEPTIONS. In
 * `--check`, the count exceeding this baseline is FATAL (a new band leak); the
 * count at-or-below it does not gate. The finding DETAIL stays advisory (the
 * report prints every finding, every run) — only the count delta gates.
 *
 * Modelled on `tools/doc-graph/generate.mjs`'s `NO_NEW_DANGLERS_RATCHET` (same
 * baseline-snapshot shape, same ratchet-DOWN convention). It diverges in ONE
 * axis: doc-graph's ratchet is report-only (its CI checks artifact freshness,
 * not the count), whereas this one is wired to gate `--check`. That divergence
 * is the deliberate Rule-3 graduation the band-conformance-ci-check
 * adversarial review flagged as the natural successor (the advisory class was
 * ungated; this prevents NEW leaks without gating on the existing baseline).
 *
 * RATCHET DOWN, never up. When the maintainer adjudicates findings (retag a
 * wrong band in FILES.md, or move a dominant-concern artifact into
 * BAND_EXCEPTIONS with a reason) the current count drops; LOWER `baseline` to
 * the new measured count in the same change and bump `baselineDate`. Raising
 * it to admit a new leak is the move this constant exists to forbid.
 *
 * Baseline note: measured at 47 on 2026-06-11 at the ratchet's adoption HEAD.
 * The band-conformance-ci-check worklog (2026-06-11) recorded 40 at the
 * checker's own adoption a few PRs earlier; the tree grew between (225 → 230
 * src files, 818 → 848 edges), so 47 is the honest HEAD-measured high-water
 * mark, not the stale 40. magic-literal: the baseline is a measured snapshot,
 * named here as the single source.
 *
 * Ratcheted 47 → 31 on 2026-06-12 (maintainer band adjudication, tranche 2):
 * SidebarWidget/LibraryTab retags (B1→B3) dissolved 7 findings;
 * SettingsTab/ForestDirectory retags (→B1) surfaced 9 previously-masked
 * edges; 18 adjudicated edges moved to BAND_EXCEPTIONS. 47 − 7 + 9 − 18 = 31.
 * Worklog: docs/worklog/2026-06-12-band-adjudication-tranche-2.md.
 */
const NO_NEW_FINDINGS_RATCHET = {
  baselineDate: "2026-06-12",
  baseline: 31, // measured advisory band-ordering findings at adoption HEAD
};

// ── FILES.md band-tag parser ─────────────────────────────────────────────────

const BAND_TAG_RE = /\[(B[123?])\]/;

/**
 * Parse FILES.md's tree block into a `srcRelPath → band` map. The tree is a
 * box-drawing rendering: each nesting level is one 4-char unit (`│   ` for a
 * continuation column, `├── ` / `└── ` for the entry connector). We track a
 * directory stack keyed on indent depth; a line ending in `/` pushes a dir, a
 * line carrying a `[Bx]` tag is a file row at the current stack depth.
 *
 * The root line `frontend/src/` establishes the base; everything under it is
 * keyed `src/<...>` (the form the import graph resolves to). Fails loudly
 * (ADR-0002) if the tree fence is never found.
 */
function parseFilesMd() {
  const text = readFileSync(FILES_MD, "utf8");
  const lines = text.split("\n");
  const bandByPath = new Map(); // src-relative path → band
  const rowOrigin = new Map(); // src-relative path → 1-based FILES.md line no.

  let inTree = false;
  let sawTree = false;
  const dirStack = []; // [{ depth, name }]

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trimEnd() === "```") {
      inTree = !inTree;
      if (inTree) sawTree = true;
      continue;
    }
    if (!inTree) continue;

    // The base line: `frontend/src/`.
    if (/^frontend\/src\/\s*$/.test(raw)) {
      dirStack.length = 0;
      continue;
    }

    // Split the box-drawing prefix from the entry token. The prefix is any run
    // of box-drawing chars and spaces; depth is the count of 4-char units.
    const m = raw.match(/^([│├└─\s]*)([A-Za-z0-9._-]+\/?)(.*)$/);
    if (!m) continue;
    const [, prefix, token, rest] = m;
    // Each indent unit is 4 visual columns ("│   " or "├── "/"└── ").
    const depth = Math.floor(prefix.length / 4);

    // Pop the stack to the current depth.
    while (dirStack.length && dirStack[dirStack.length - 1].depth >= depth) {
      dirStack.pop();
    }

    if (token.endsWith("/")) {
      dirStack.push({ depth, name: token.slice(0, -1) });
      continue;
    }

    const tag = rest.match(BAND_TAG_RE);
    if (!tag) continue; // a non-file annotation line, or a comment row

    const dirs = dirStack.map((d) => d.name);
    const srcRel = ["src", ...dirs, token].join("/");
    bandByPath.set(srcRel, tag[1]);
    rowOrigin.set(srcRel, i + 1);
  }

  if (!sawTree) {
    throw new Error(
      "band-conformance: could not find the FILES.md tree fence (```…```). " +
        "The parser depends on the tree block; failing loudly (ADR-0002)."
    );
  }
  return { bandByPath, rowOrigin };
}

// ── Source-file enumeration + import graph ───────────────────────────────────

/** Every `.ts`/`.vue` file under src, src-relative, excluding the codegen file. */
function enumerateSrcFiles(srcRoot = SRC_DIR) {
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

/** Absolute path → `src/<...>` relative form. */
function srcRelOf(abs, srcRoot = SRC_DIR) {
  return "src/" + relative(srcRoot, abs).replace(/\\/g, "/");
}

/**
 * Resolve a relative import specifier from a file to a src-relative path.
 * Returns `{ resolved, exists }`. Mirrors Vite/TS module resolution for the
 * extensionless + directory-index forms the codebase uses (`../store` →
 * `store/index.ts`). Bare specifiers (npm, `vue`) resolve to `null`.
 */
function resolveImport(fromSrcRel, spec, srcRoot = SRC_DIR) {
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
function extractEdges(fromSrcRel, body) {
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

// ── Analysis ─────────────────────────────────────────────────────────────────

/**
 * Run the conformance analysis over a (srcFiles, bandByPath) pair. Pure over
 * its inputs so the self-test fixtures can drive it with synthetic data.
 * Returns the structured result the report + CI driver both consume.
 */
function analyze({ srcFiles, bandByPath, rowOrigin, srcRoot }) {
  // 1. Structural drift (CRISP, fatal): ghost rows + missing rows.
  const srcSet = new Set(srcFiles);
  const ghostRows = []; // FILES.md band row → no file on disk
  for (const [p] of bandByPath) {
    // locale .json + style.css are tagged but are not in the .ts/.vue src set;
    // confirm against disk directly rather than the src-file enumeration.
    const abs = join(srcRoot ?? SRC_DIR, relative("src", p));
    if (!existsSync(abs)) ghostRows.push({ path: p, line: rowOrigin?.get(p) ?? null });
  }
  const missingRows = []; // src file → no FILES.md band row
  for (const f of srcFiles) {
    if (!bandByPath.has(f)) missingRows.push(f);
  }

  // 2. Band-ordering findings (advisory).
  const findings = []; // unexplained band violations (the review surface)
  const explained = []; // violations covered by hub / exception (audit trail)
  const ghostEdges = []; // edges whose target resolves to no file (ADR-0002)
  let edgeCount = 0;
  let typeOnlyExempt = 0;

  for (const f of srcFiles) {
    const fromBand = bandByPath.get(f);
    const abs = join(srcRoot ?? SRC_DIR, relative("src", f));
    if (!existsSync(abs)) continue; // a ghost-row path that is not a real file
    const body = readFileSync(abs, "utf8");
    for (const e of extractEdges(f, body)) {
      edgeCount++;
      if (!e.exists) {
        // An import that resolves to no file: a broken edge. Surfaced loud.
        ghostEdges.push(e);
        continue;
      }
      if (e.target.endsWith(".css") || e.target.endsWith(".json")) continue;
      const toBand = bandByPath.get(e.target);
      if (!toBand) continue; // target missing a row → caught by missingRows
      if (e.typeOnly) {
        // Type-only: compile-time-erased, exempt by settled policy.
        if (fromBand !== "B?" && toBand !== "B?" && BAND_RANK[fromBand] < BAND_RANK[toBand]) {
          typeOnlyExempt++;
        }
        continue;
      }
      if (fromBand === "B?" || toBand === "B?") continue; // [B?] exempt per spec
      if (BAND_RANK[fromBand] >= BAND_RANK[toBand]) continue; // conformant
      // A genuine band-ordering violation. Classify it.
      const rec = { from: f, fromBand, to: e.target, toBand, spec: e.spec };
      if (HUB_EXEMPT_TARGETS.has(e.target)) {
        explained.push({ ...rec, why: "hub", reason: HUB_EXEMPT_TARGETS.get(e.target) });
      } else if (BAND_EXCEPTIONS.has(`${f}|${e.target}`)) {
        explained.push({ ...rec, why: "exception", reason: BAND_EXCEPTIONS.get(`${f}|${e.target}`) });
      } else {
        findings.push(rec);
      }
    }
  }

  return {
    counts: {
      srcFiles: srcFiles.length,
      bandRows: bandByPath.size,
      edges: edgeCount,
      typeOnlyExempt,
      findings: findings.length,
      explained: explained.length,
      ghostRows: ghostRows.length,
      missingRows: missingRows.length,
      ghostEdges: ghostEdges.length,
    },
    ghostRows,
    missingRows,
    ghostEdges,
    findings: findings.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
    explained: explained.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to)),
  };
}

// ── Report ───────────────────────────────────────────────────────────────────

function band(b) {
  return `[${b}]`;
}

function printReport(r) {
  const out = [];
  out.push("band-conformance: ADR-0003 band-ordering audit of frontend/src");
  out.push("");
  const c = r.counts;
  out.push(
    `  ${c.srcFiles} src files, ${c.bandRows} FILES.md band rows, ` +
      `${c.edges} relative import edges scanned.`
  );
  out.push(
    `  type-only edges exempt (would-be violations): ${c.typeOnlyExempt}; ` +
      `hub/exception-explained violations: ${c.explained}.`
  );
  out.push("");

  // Structural drift — the fatal class.
  out.push("── Structural drift (fail-loud; ADR-0002) ──");
  if (c.ghostRows === 0 && c.missingRows === 0 && c.ghostEdges === 0) {
    out.push("  none — every FILES.md row resolves to a file, every src file has a row,");
    out.push("  every relative import resolves.");
  } else {
    if (c.ghostRows) {
      out.push(`  GHOST ROWS (${c.ghostRows}) — FILES.md band row, no file on disk:`);
      for (const g of r.ghostRows) {
        out.push(`    - ${g.path}${g.line ? ` (FILES.md:${g.line})` : ""}`);
      }
    }
    if (c.missingRows) {
      out.push(`  MISSING ROWS (${c.missingRows}) — src file, no FILES.md band row:`);
      for (const m of r.missingRows) out.push(`    - ${m}`);
    }
    if (c.ghostEdges) {
      out.push(`  BROKEN IMPORT EDGES (${c.ghostEdges}) — import resolves to no file:`);
      for (const e of r.ghostEdges) out.push(`    - ${e.from} → ${e.spec}`);
    }
  }
  out.push("");

  // Band-ordering findings — the advisory review surface (detail advisory;
  // the COUNT is ratcheted, see the ratchet line below).
  out.push("── Band-ordering findings (advisory detail; count ratcheted; ADR-0003 review surface) ──");
  if (r.findings.length === 0) {
    out.push("  none — every runtime value edge conforms or is hub/exception-explained.");
  } else {
    out.push(
      `  ${r.findings.length} runtime value edges where band(file) < band(import) ` +
        "and the edge is not type-only, not into a band-mixed hub, and not on the"
    );
    out.push(
      "  annotated-exception list. Each is an ADR-0003 seam to adjudicate: a wrong"
    );
    out.push("  band tag (retag in FILES.md), or an expected dominant-concern artifact");
    out.push("  (add to BAND_EXCEPTIONS with a reason). The detail is advisory (printed,");
    out.push("  never a per-finding tollgate); the COUNT gates via the ratchet below.");
    out.push("");
    for (const f of r.findings) {
      out.push(`    ${band(f.fromBand)} ${f.from}`);
      out.push(`      → ${band(f.toBand)} ${f.to}  (via '${f.spec}')`);
    }
  }
  out.push("");

  // No-new-findings ratchet status (the gating line; sibling of the doc-graph
  // NO_NEW_DANGLERS_RATCHET report section).
  {
    const { baseline, baselineDate } = NO_NEW_FINDINGS_RATCHET;
    const current = r.findings.length;
    out.push("── No-new-findings ratchet (gates --check) ──");
    out.push(
      `  ${current} advisory findings against a baseline of ${baseline} (${baselineDate}).`
    );
    if (current > baseline) {
      out.push(
        `  EXCEEDED — ${current - baseline} new band leak(s) since the baseline. ` +
          "--check FAILS."
      );
      out.push("  Fix the new edge in the PR that introduced it (retag FILES.md, or add the");
      out.push("  from→to pair to BAND_EXCEPTIONS with a reason).");
    } else if (current < baseline) {
      out.push(
        "  Within baseline (below it). Ratchet down: lower " +
          `NO_NEW_FINDINGS_RATCHET.baseline to ${current}`
      );
      out.push("  (and bump baselineDate) in tools/band-conformance/check.mjs.");
    } else {
      out.push("  At baseline — no new band leaks. --check passes.");
    }
  }
  out.push("");
  out.push(
    `── Explained violations (${c.explained}; encodes FILES.md's dominant-concern legend) ──`
  );
  out.push(
    "  Expected non-empty by design (ADR-0008 'deliberately-imprecise tag'). The"
  );
  out.push("  two band-mixed hubs + the annotated-exception list. Run --json for reasons.");
  out.push("");
  return out.join("\n");
}

// ── Self-test (the loud-failure fixture proofs) ──────────────────────────────

/**
 * Synthetic fixtures proving the two fatal structural checks fire. The
 * jquery-bridge ghost is FIXED on the real tree, so this fixture is the
 * standing proof that the loud failure would fire if it (or any future ghost
 * row) returned. Mirrors the doc-graph generator's posture of a probe-verified
 * net (the brief: "add a self-test fixture proving the loud failure").
 */
function selfTest() {
  const fixtureDir = join(REPO_ROOT, "tools", "band-conformance", "fixtures");
  let passed = 0;
  let failed = 0;
  const log = (ok, name, detail) => {
    if (ok) passed++;
    else failed++;
    process.stdout.write(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}\n`);
  };

  process.stdout.write("band-conformance self-test:\n");

  // Fixture 1: a band row naming a path that does not exist (the jquery-bridge
  // ghost shape). The parser tags it; analyze() must surface it as a ghost row.
  {
    const ghostMd = join(fixtureDir, "ghost-row.files.md");
    const text = readFileSync(ghostMd, "utf8");
    const { bandByPath, rowOrigin } = parseFilesMdText(text);
    // Drive analyze against an empty src tree rooted at a dir that lacks the
    // ghost file, so the ghost path cannot resolve on disk.
    const fakeSrcRoot = join(fixtureDir, "empty-src");
    const r = analyze({ srcFiles: [], bandByPath, rowOrigin, srcRoot: fakeSrcRoot });
    const caught = r.ghostRows.some((g) => g.path === "src/engine/jquery-bridge.ts");
    log(
      caught && r.counts.ghostRows >= 1,
      "ghost-row fixture surfaces the deleted jquery-bridge.ts row as fatal drift",
      `ghostRows=${r.counts.ghostRows}`
    );
  }

  // Fixture 2: the parser must round-trip a known nested path. (Guards the
  // box-drawing indentation logic against silent regression.)
  {
    const { bandByPath } = parseFilesMd();
    const checks = [
      ["src/store/index.ts", "B3"],
      ["src/engine/helper.ts", "B1"],
      ["src/composables/analysis/wait-for-analysis.ts", "B3"],
      ["src/types/game.ts", "B3"],
      ["src/lib/utils.ts", "B1"],
    ];
    let ok = true;
    const wrong = [];
    for (const [p, b] of checks) {
      if (bandByPath.get(p) !== b) {
        ok = false;
        wrong.push(`${p}=${bandByPath.get(p) ?? "(absent)"} (want ${b})`);
      }
    }
    log(ok, "FILES.md parser round-trips known nested band rows", wrong.join("; "));
  }

  process.stdout.write(`  → ${passed} passed, ${failed} failed\n`);
  return failed === 0;
}

/** Parse a FILES.md given as TEXT (for fixtures), sharing parseFilesMd's logic. */
function parseFilesMdText(text) {
  const lines = text.split("\n");
  const bandByPath = new Map();
  const rowOrigin = new Map();
  let inTree = false;
  let sawTree = false;
  const dirStack = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trimEnd() === "```") {
      inTree = !inTree;
      if (inTree) sawTree = true;
      continue;
    }
    if (!inTree) continue;
    if (/^frontend\/src\/\s*$/.test(raw)) {
      dirStack.length = 0;
      continue;
    }
    const m = raw.match(/^([│├└─\s]*)([A-Za-z0-9._-]+\/?)(.*)$/);
    if (!m) continue;
    const [, prefix, token, rest] = m;
    const depth = Math.floor(prefix.length / 4);
    while (dirStack.length && dirStack[dirStack.length - 1].depth >= depth) dirStack.pop();
    if (token.endsWith("/")) {
      dirStack.push({ depth, name: token.slice(0, -1) });
      continue;
    }
    const tag = rest.match(BAND_TAG_RE);
    if (!tag) continue;
    const dirs = dirStack.map((d) => d.name);
    const srcRel = ["src", ...dirs, token].join("/");
    bandByPath.set(srcRel, tag[1]);
    rowOrigin.set(srcRel, i + 1);
  }
  if (!sawTree) throw new Error("band-conformance: fixture has no tree fence.");
  return { bandByPath, rowOrigin };
}

// ── Driver ───────────────────────────────────────────────────────────────────

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--self-test")) {
    process.exit(selfTest() ? 0 : 1);
  }

  const { bandByPath, rowOrigin } = parseFilesMd();
  const srcFiles = enumerateSrcFiles();
  const r = analyze({ srcFiles, bandByPath, rowOrigin, srcRoot: SRC_DIR });

  if (argv.includes("--json")) {
    process.stdout.write(JSON.stringify(r, null, 2) + "\n");
    return;
  }

  process.stdout.write(printReport(r) + "\n");

  const structuralDrift =
    r.counts.ghostRows + r.counts.missingRows + r.counts.ghostEdges > 0;

  if (argv.includes("--strict")) {
    // Local zero-drift run: band findings are fatal too.
    if (structuralDrift || r.counts.findings > 0) {
      process.stderr.write(
        "band-conformance: --strict — structural drift or band findings present.\n"
      );
      process.exit(1);
    }
    return;
  }

  if (argv.includes("--check")) {
    // CI: the crisp structural-drift class gates (ADR-0002), AND the no-new-
    // findings ratchet gates on the advisory COUNT exceeding the baseline. The
    // finding DETAIL stays advisory (ADR-0011 Rule 5) — printed above, never a
    // per-finding tollgate; only a count over the baseline (a new leak) fails.
    if (structuralDrift) {
      process.stderr.write(
        "\nband-conformance: STRUCTURAL DRIFT (fatal) — a FILES.md row resolves to\n" +
          "no file, a src file has no FILES.md row, or an import resolves to no\n" +
          "file. These are crisp set-difference facts (ADR-0002); fix FILES.md or\n" +
          "the import. (Band-ordering findings above are advisory and do not gate.)\n"
      );
      process.exit(1);
    }
    const { baseline, baselineDate } = NO_NEW_FINDINGS_RATCHET;
    const current = r.counts.findings;
    if (current > baseline) {
      process.stderr.write(
        `\nband-conformance: NO-NEW-FINDINGS RATCHET EXCEEDED (fatal) — ${current} advisory\n` +
          `band-ordering findings against a baseline of ${baseline} (${baselineDate}). ` +
          `${current - baseline} NEW band\nleak(s) since the baseline. Each is a runtime value edge where ` +
          "band(file) <\nband(import), not type-only, not into a band-mixed hub, and not on the\n" +
          "annotated-exception list (see the advisory list above). Fix the new edge in\n" +
          "the PR that introduced it: retag the band in frontend/FILES.md if the tag is\n" +
          "wrong, or add the from→to pair to BAND_EXCEPTIONS with a reason if it is an\n" +
          "expected dominant-concern artifact. (The existing baseline does NOT gate —\n" +
          "only this delta does.)\n"
      );
      process.exit(1);
    }
    if (current < baseline) {
      process.stdout.write(
        `band-conformance: no structural drift; ${current} advisory findings, BELOW the ` +
          `${baseline} baseline (${baselineDate}).\n` +
          "  → ratchet down: lower NO_NEW_FINDINGS_RATCHET.baseline to " +
          `${current} (and bump baselineDate) in tools/band-conformance/check.mjs.\n`
      );
      return;
    }
    process.stdout.write(
      `band-conformance: no structural drift; ${current} advisory findings, at the ` +
        `${baseline} baseline (${baselineDate}) — no new band leaks. Finding detail advisory.\n`
    );
    return;
  }
}

main();
