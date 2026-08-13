#!/usr/bin/env node
/**
 * frontend/scripts/style-tokens-audit.mjs
 *
 * ADR-0019 C22 gate (commission per
 * `.claude/dispatch-reports/lyt-final-opus-review.md` §3 Rule 2(b)):
 * "A color/spacing/control instantiated with raw literals (hex, magic
 * spacing, hand-rolled buttons) outside the sanctioned design-token/
 * component set is refused. Enforcement: CI lint (stylelint / TCSS
 * `$`-variables only)."
 *
 * This is that lint, written as a zero-dependency static scanner in
 * the project's own established idiom (`tools/band-conformance/check.mjs`,
 * `tools/cycle-check/check.mjs` — grep/regex over the source tree, no
 * `node_modules` dependency, `--check` gates CI). `stylelint` itself was
 * deliberately NOT added as a devDependency: this build's scope is
 * "mechanical gates only, no product code changes," and a real
 * stylelint config presupposes the sanctioned component/token set
 * ADR-0019 C22's full cure requires (`AppSelect`/`AppButton`/`AppInput`,
 * per the final-opus-review's Class 7 cure) — which does not exist yet
 * ("a later dispatch builds it; your gate is what will hold it," per
 * the build commission). This scanner is the interim "or equivalent"
 * the commission names, and reports at WARN level with a ratchet
 * baseline, exactly as instructed.
 *
 * ── What it checks ─────────────────────────────────────────────────
 *
 *   raw-hex-color    : a `#RGB`/`#RRGGBB`/`#RRGGBBAA` literal inside a
 *                       `<style>` block or a `.css` file, OUTSIDE the
 *                       sanctioned token files (`src/assets/css/theme.css`,
 *                       `src/assets/css/palettes.css` — the SSOT
 *                       theme.css's own header names). Hex literals
 *                       INSIDE those two files are the tokens
 *                       themselves and are exempt by construction.
 *   raw-native-control : a `<select`, `<input`, or `<button` tag
 *                        opened directly in a `.vue` template, in ANY
 *                        file — the sanctioned `AppSelect`/`AppInput`/
 *                        `AppButton` set named by the C22 cure does not
 *                        exist yet, so this rule currently fires on
 *                        every native control in the tree BY DESIGN
 *                        (see the header above); its exemption list
 *                        (`SANCTIONED_COMPONENT_DIRS`) is empty today
 *                        and is where a future `src/components/app/`
 *                        set would be excluded once it ships.
 *
 * ── Keying (same discipline as layout-audit.mjs) ───────────────────
 *
 * Findings are keyed by `${relativeFilePath}::${ruleId}::${identity}`,
 * where `identity` is derived from FILE CONTENT (the literal hex value
 * / the tag's own distinguishing attribute), never a line number —
 * an unrelated edit earlier in the same file must not renumber an
 * existing finding out from under the baseline. See
 * `stableFindingIdentity` below and its unit test
 * (`tests/unit/style-tokens-audit-key-stability.test.ts`).
 *
 * Severity: WARN-level report (never fails the build on its own
 * finding COUNT/DETAIL — ADR-0011 Rule 5, judgment-shaped output stays
 * advisory) + a NO-NEW-FINDINGS ratchet baseline
 * (`style-tokens-audit-baseline.json`), modelled on
 * `tools/band-conformance/check.mjs`'s own ratchet: `--check` fails
 * only when a finding's key is NOT in the baseline (a new raw literal
 * or new bare control), never on the existing count.
 *
 * Usage: node scripts/style-tokens-audit.mjs [--check] [--out FILE]
 *
 * License: Public Domain (The Unlicense)
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = join(__dirname, '..');
const SRC_ROOT = join(FRONTEND_ROOT, 'src');
const BASELINE_PATH = join(FRONTEND_ROOT, 'style-tokens-audit-baseline.json');

// The token SSOT files -- hex literals here ARE the tokens, exempt by
// construction (theme.css's own header: "the SSOT for chrome design
// decisions in the codebase").
const TOKEN_FILES = new Set([
  'src/assets/css/theme.css',
  'src/assets/css/palettes.css',
]);

// Directories whose native `<select>`/`<input>`/`<button>` usages are
// the SANCTIONED component set's own internals, not a leak -- empty
// today because the set does not exist yet (see header). A future
// `src/components/app/AppSelect.vue` etc. would be added here.
const SANCTIONED_COMPONENT_DIRS = [];

const HEX_RE = /#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b/g;
const CONTROL_TAG_RE = /<(select|input|button)\b/g;

async function walk(dir, exts, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, exts, out);
    } else if (exts.some((ext) => entry.name.endsWith(ext))) {
      out.push(full);
    }
  }
  return out;
}

/** Nearest preceding CSS selector / opening-tag context for a match
 * offset, used only to build a content-stable identity -- never
 * exposed as the sole key component if it would collapse distinct
 * literals (the hex value/tag attrs travel in the key too). */
function nearestSelectorBefore(text, offset) {
  const before = text.slice(0, offset);
  const m = before.match(/([.#][-\w]+|--[-\w]+)\s*\{[^}]*$/);
  return m ? m[1] : null;
}

/** Content-derived identity for a raw-hex-color finding: the literal
 * value plus its nearest enclosing selector (if any) -- stable under
 * any edit that doesn't touch this declaration itself. */
export function stableHexIdentity(fileText, matchIndex, hexValue) {
  const selector = nearestSelectorBefore(fileText, matchIndex);
  return selector ? `${hexValue}@${selector}` : hexValue;
}

/** Content-derived identity for a raw-native-control finding: the
 * control tag plus its own distinguishing attribute (id/class/v-model/
 * name) read from the opening tag text -- never a line number or an
 * ordinal position. Falls back to the trimmed tag+attrs text itself
 * (still content, not position) when no distinguishing attribute is
 * present. */
export function stableControlIdentity(fileText, matchIndex, tagName) {
  const tail = fileText.slice(matchIndex, matchIndex + 300);
  const tagMatch = tail.match(/^<[a-zA-Z-]+[^>]*?(?:\/?>|$)/s);
  const tagText = tagMatch ? tagMatch[0] : tail.slice(0, 60);
  const idAttr = tagText.match(/\bid="([^"]+)"/);
  const classAttr = tagText.match(/\bclass="([^"]+)"/);
  const vModelAttr = tagText.match(/\bv-model(?:[.:][^\s="]+)?="([^"]+)"/);
  const nameAttr = tagText.match(/\bname="([^"]+)"/);
  if (idAttr) return `${tagName}#${idAttr[1]}`;
  if (vModelAttr) return `${tagName}[v-model=${vModelAttr[1]}]`;
  if (classAttr) return `${tagName}.${classAttr[1].trim().split(/\s+/).sort().join('.')}`;
  if (nameAttr) return `${tagName}[name=${nameAttr[1]}]`;
  // Last resort: the tag's own literal text, truncated -- content, not
  // position; identical anonymous tags collapse onto one key exactly
  // as layout-audit.mjs's stableSelector collapses identical rows (a
  // documented, intentional weakness, not silent).
  return `${tagName}:${tagText.replace(/\s+/g, ' ').trim().slice(0, 80)}`;
}

function isUnderSanctionedDir(relPath) {
  return SANCTIONED_COMPONENT_DIRS.some((d) => relPath.startsWith(d));
}

async function scanHexColors(files) {
  const findings = [];
  for (const file of files) {
    const relPath = relative(FRONTEND_ROOT, file).split('\\').join('/');
    if (TOKEN_FILES.has(relPath)) continue;
    const text = await readFile(file, 'utf8');
    // Only inspect <style> blocks in .vue files; whole file for .css.
    const regions = relPath.endsWith('.vue')
      ? [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => ({ text: m[1], offset: m.index + m[0].indexOf(m[1]) }))
      : [{ text, offset: 0 }];
    for (const region of regions) {
      for (const m of region.text.matchAll(HEX_RE)) {
        const hexValue = m[0];
        const absOffset = region.offset + m.index;
        const identity = stableHexIdentity(text, absOffset, hexValue);
        findings.push({
          key: `${relPath}::raw-hex-color::${identity}`,
          ruleId: 'raw-hex-color',
          file: relPath,
          detail: { hexValue },
        });
      }
    }
  }
  return findings;
}

async function scanNativeControls(files) {
  const findings = [];
  for (const file of files) {
    if (!file.endsWith('.vue')) continue;
    const relPath = relative(FRONTEND_ROOT, file).split('\\').join('/');
    if (isUnderSanctionedDir(relPath)) continue;
    const text = await readFile(file, 'utf8');
    const templateMatch = text.match(/<template[^>]*>([\s\S]*?)<\/template>/);
    if (!templateMatch) continue;
    const templateText = templateMatch[1];
    const templateOffset = templateMatch.index + templateMatch[0].indexOf(templateText);
    for (const m of templateText.matchAll(CONTROL_TAG_RE)) {
      const tagName = m[1];
      const absOffset = templateOffset + m.index;
      const identity = stableControlIdentity(text, absOffset, tagName);
      findings.push({
        key: `${relPath}::raw-native-control::${identity}`,
        ruleId: 'raw-native-control',
        file: relPath,
        detail: { tagName },
      });
    }
  }
  return findings;
}

async function collectAllFindings() {
  const vueFiles = await walk(SRC_ROOT, ['.vue']);
  const cssFiles = await walk(SRC_ROOT, ['.css']);
  const [hexFindings, controlFindings] = await Promise.all([
    scanHexColors([...vueFiles, ...cssFiles]),
    scanNativeControls(vueFiles),
  ]);
  return [...hexFindings, ...controlFindings];
}

// ── CLI ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const doCheck = argv.includes('--check');
function flag(name, def) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : def;
}
const outPath = flag('out', join(FRONTEND_ROOT, 'style-tokens-audit-report.json'));

async function main() {
  const findings = await collectAllFindings();
  const keys = new Set(findings.map((f) => f.key));

  const byRule = {};
  for (const f of findings) byRule[f.ruleId] = (byRule[f.ruleId] || 0) + 1;

  console.log('[style-tokens-audit] ADR-0019 C22 -- WARN-level report (never fails on detail/count alone).');
  console.log(`[style-tokens-audit] ${keys.size} distinct finding(s) across ${findings.length} occurrence(s):`);
  for (const [rule, n] of Object.entries(byRule)) console.log(`  ${rule.padEnd(20)} ${n}`);

  const report = {
    generatedAt: new Date().toISOString(),
    findings,
  };
  await writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(`[style-tokens-audit] wrote ${outPath}`);

  let exitCode = 0;
  if (doCheck) {
    let baselineKeys = new Set();
    try {
      const baselineText = await readFile(BASELINE_PATH, 'utf8');
      baselineKeys = new Set(JSON.parse(baselineText).keys || []);
    } catch (err) {
      console.error(`[style-tokens-audit] --check requires a baseline at ${BASELINE_PATH}: ${err.message}`);
      process.exit(2);
    }
    const newKeys = [...keys].filter((k) => !baselineKeys.has(k));
    if (newKeys.length > 0) {
      console.error(`[style-tokens-audit] FAILED (ratchet): ${newKeys.length} finding(s) not in the committed baseline:`);
      for (const k of newKeys) console.error(`  NEW: ${k}`);
      exitCode = 1;
    } else {
      console.log(`[style-tokens-audit] within baseline (${keys.size}/${baselineKeys.size} baseline keys observed).`);
    }
  }
  process.exitCode = exitCode;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[style-tokens-audit] FATAL:', err);
    process.exitCode = 1;
  });
}
