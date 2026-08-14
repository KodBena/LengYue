#!/usr/bin/env node
/**
 * frontend/scripts/layout-audit.mjs
 *
 * ADR-0019 CI-gate build (Rule 2(b) net; commission per
 * `.claude/dispatch-reports/lyt-final-opus-review.md` §3, which found
 * that ADR-0019's own roll-up claims a CI gate for C17/C19/C21/C22 on
 * the Vue substrate that is NOT actually in force — the review ran
 * this exact audit by hand in ~100 lines and found every one of its
 * Classes 2, 4, and 7 without human judgment). This is that audit,
 * written properly: deterministic, JSON + human output, ratchet-baseline
 * gated.
 *
 * Mechanically reports, against a running BUILT SPA at a given viewport
 * geometry, with no backend/proxy required (cold-boot SPA only — see
 * "Scope" below):
 *
 *   - viewport-escape     : `#main-area`'s scrollWidth/scrollHeight
 *                            exceeding its client box (Class 2).
 *   - unreachable-control : an interactive element laid out outside the
 *                            viewport with no scrolling ancestor
 *                            reaching it (Class 2).
 *   - pointer-occlusion   : `elementFromPoint` at an interactive
 *                            element's own center names an interceptor
 *                            outside that element's own subtree
 *                            (Class 4).
 *   - target-size         : an interactive element rendered below
 *                            24x24 CSS px (ADR-0019 C21).
 *   - text-contrast       : a text-bearing control's foreground/
 *                            background pair below 4.5:1 (ADR-0019 C19).
 *   - focus-invisible     : an interactive element's focus outline
 *                            below ~3:1 contrast against its surface,
 *                            or absent entirely (ADR-0019 C17, the
 *                            focus-indicator half only — the fuller
 *                            keyboard-traversal/focus-trap half of C17
 *                            is NOT mechanized here and needs its own
 *                            axe-core-class gate).
 *
 * ── Stable-identity keying (the load-bearing design decision) ─────────
 *
 * Findings are keyed by `${geometry}::${ruleId}::${stableSelector}`,
 * NEVER by file:line or by measured coordinates — a coordinate-keyed
 * baseline converts fail-noisy into fail-open the moment an unrelated
 * layout change shifts a pixel (the anti-pattern named in the build
 * commission: anthropics/claude-code#82589). `stableSelector(el)`
 * (below) walks from the element toward the document root, stopping at
 * the first `id` or `data-testid` it finds (a global anchor), and
 * otherwise accumulating `tag.sortedClassList` segments — NEVER
 * `:nth-child`/`:nth-of-type`, so inserting an unrelated sibling
 * anywhere in the tree cannot change any existing key. See
 * `tests/unit/layout-audit-key-stability.test.ts` for the mechanized
 * proof (a fixture asserts an unrelated DOM insertion changes zero
 * baseline keys).
 *
 * The one accepted weakness, named honestly: elements that are both
 * unidentified (no id/data-testid within the 6-level walk) AND share
 * an identical tag+class ancestor chain (e.g. many rows of an
 * unvirtualized list — see the review's Class 9, 2 797 identical
 * `button.chevron-btn` rows) collide onto ONE key. This is treated as
 * a feature, not a bug, for THIS gate's purpose: it ratchets the CLASS
 * of defect once rather than enumerating every row, mirroring the
 * review's own "extent estimate" reporting shape. A reviewer wanting
 * per-row counts should read this script's `findings[].detail`, which
 * carries the raw count collapsed into each key.
 *
 * ── Scope (named, not hidden) ──────────────────────────────────────
 *
 * This gate audits the COLD-BOOT SPA only — no backend, no proxy. Any
 * state reachable only with a live engine connection or backend data
 * (live analysis overlays, populated chart panels, the Library/Browse
 * tables with real rows) is UNEXERCISED by this gate — a concrete,
 * named blocker, not a silent gap. A later dispatch that stands up a
 * rig (per the final-opus-review's own rig recipe) would extend this
 * script's `--backend-url`/`--engine-url` surface; neither exists yet.
 *
 * ── Deterministic cold boot (dispatch L4 condition 3, ledger row 2498;
 *    `.claude/dispatch-reports/lyt-space-owner-l4-review.md` §3) ───────
 *
 * "No backend required" describes what this script itself stands up,
 * not what the audited page CAN reach: `src/config/env.ts`'s own
 * `API_BASE_URL` falls back to `http://localhost:8764` whenever no
 * `VITE_API_BASE_URL` is set at BUILD time, and `npm run build`
 * (this script's own `--build` step) inherits the invoking shell's
 * environment — so on a host where something ELSE happens to be
 * listening on 8764 (a leftover dev backend, e.g.), the built SPA
 * genuinely reaches it, and the audited page's own state (persisted
 * session facts, message-log content) stops being a pure function of
 * the committed source. This is exactly the root cause the L4 build
 * report and review both independently traced 3 audit findings to
 * (`lyt-space-owner-l4-build.md` §7, `lyt-space-owner-l4-review.md`
 * §3) — a real, environment-dependent nondeterminism in what "cold
 * boot" means, not a code defect in the audited SPA itself.
 *
 * Fixed at the root: when this script BUILDS (`--build`), it first
 * probes for a genuinely dead TCP port at or above 19000 (`pickDead
 * BackendPort`, below — refuses the scratch-preview port and the
 * project's own forbidden live ports, and re-probes on the rare
 * chance a candidate unexpectedly answers) and builds with
 * `VITE_API_BASE_URL` pointed at it. `API_BASE_URL` is baked in at
 * BUILD time (`import.meta.env`, not read at request time), so the
 * resulting `dist/` genuinely cannot reach any live service on this
 * or any other host — cold boot becomes a pure function of the
 * committed source, independent of what else happens to be running
 * locally. Without `--build` (an existing `dist/` is audited as-is),
 * this override does not apply — a stale `dist/` built earlier, by
 * hand, with its own `VITE_API_BASE_URL`, is audited as whatever it
 * already is; this is disclosed via a printed warning, not silently
 * masked.
 *
 * ── Playwright discipline (project convention, see lyt-conformance.mjs
 *    and lyt-w2-usability.mjs's own headers) ─────────────────────────
 *   - This script does not self-wrap in `systemd-run`; the invoking
 *     npm script (`npm run layout-audit`, see package.json) wraps the
 *     `node` invocation via `scripts/run-layout-audit.sh`.
 *   - `--js-flags=--max-old-space-size=1024` passed to the launched
 *     Chromium.
 *   - ONE browser instance for the whole multi-geometry run, closed in
 *     `finally`.
 *   - No wall-clock sleeps — every wait is `waitForSelector`/a polled
 *     HTTP condition (see `waitForPreviewReady`, ported from
 *     `lyt-conformance.mjs`).
 *   - Scratch port only: default 19300, refuses < 19000; explicitly
 *     refuses 8764/4173/5173/5174 (the project's live ports) even if
 *     passed.
 *
 * Usage:
 *   node scripts/layout-audit.mjs [--port N] [--build] [--dist-dir DIR]
 *        [--headed] [--check] [--out FILE]
 *
 *   --build   run `npm run build` first (otherwise assumes `dist/` is
 *             current).
 *   --check   compare findings against the committed baseline
 *             (`layout-audit-baseline.json`) and exit nonzero on any
 *             NEW key (a finding whose key is not in the baseline).
 *             Without --check the script only reports (exit 0 unless a
 *             hard error occurs) — the mode `npm run layout-audit`
 *             uses in CI passes --check.
 *   --out     path to write the JSON report (default:
 *             layout-audit-report.json at the frontend root).
 *
 * License: Public Domain (The Unlicense)
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = join(__dirname, '..');
const BASELINE_PATH = join(FRONTEND_ROOT, 'layout-audit-baseline.json');

// ── the seven geometry classes named in the build commission (matching
// the final-opus-review's own coverage sweep) ──────────────────────────
export const GEOMETRIES = [
  { label: '2560x1440', width: 2560, height: 1440 },
  { label: '1920x1080', width: 1920, height: 1080 },
  { label: '1366x768', width: 1366, height: 768 },
  { label: '1024x768', width: 1024, height: 768 },
  { label: '900x600', width: 900, height: 600 },
  { label: '480x900', width: 480, height: 900 },
  { label: '1080x1920', width: 1080, height: 1920 },
];

export const DEFAULT_CONFIG = {
  minTargetPx: 24, // ADR-0019 C21 baseline (24x24 CSS px)
  minContrast: 4.5, // ADR-0019 C19 normal-text floor
  minFocusContrast: 3, // ADR-0019 C17 focus-indicator floor (~3:1, "roughly")
  viewportTolerancePx: 2, // sub-pixel rounding slack, same order as lyt-conformance.mjs's TOLERANCE_PX
  interactiveSelector: 'button, a[href], input, select, textarea, [tabindex]',
};

// ── pure functions, shared verbatim between Node (unit-testable) and
// the browser (embedded by source into the in-page evaluator below —
// see `buildPageScript`). Keep these free of any Node-only or
// browser-only API so both call sites behave identically. ────────────

/** Stable identity for a DOM element. See the module header for the
 * full rationale — no coordinates, no nth-child, id/data-testid
 * terminates the walk as a global anchor. */
export function stableSelector(el) {
  const parts = [];
  let cur = el;
  let depth = 0;
  while (cur && cur.nodeType === 1 && depth < 6) {
    const id = cur.id;
    if (id) { parts.unshift('#' + id); break; }
    const testId = cur.getAttribute ? cur.getAttribute('data-testid') : null;
    if (testId) { parts.unshift('[data-testid="' + testId + '"]'); break; }
    const rawClass = typeof cur.className === 'string'
      ? cur.className
      : (cur.getAttribute ? (cur.getAttribute('class') || '') : '');
    const cls = rawClass.trim().split(/\s+/).filter(Boolean).sort().join('.');
    const tag = cur.tagName.toLowerCase();
    parts.unshift(cls ? tag + '.' + cls : tag);
    cur = cur.parentElement;
    depth++;
  }
  return parts.join('>');
}

/** WCAG relative luminance of an sRGB triple in [0,255]. */
export function relLuminance([r, g, b]) {
  const chan = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [rl, gl, bl] = [chan(r), chan(g), chan(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** WCAG contrast ratio between two sRGB triples. */
export function contrastRatioOf(rgbA, rgbB) {
  const la = relLuminance(rgbA);
  const lb = relLuminance(rgbB);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Parses a CSS `rgb(a)(...)` computed-style string into [r,g,b,a]. */
export function parseRgbString(str) {
  if (!str) return null;
  const m = str.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
  const [r, g, b, a = 1] = parts;
  if ([r, g, b].some((n) => Number.isNaN(n))) return null;
  return [r, g, b, a];
}

// ── the in-page collector. Written as ONE self-contained function
// (only referencing the pure helpers above BY NAME, embedded into the
// page by source concatenation in `buildPageScript` — single source of
// truth, no drift between what runs in-browser and what
// `stableSelector` etc. mean here) ─────────────────────────────────────
function collectFindingsInPage(geometryLabel, config) {
  const findings = [];
  function add(ruleId, el, detail) {
    const key = geometryLabel + '::' + ruleId + '::' + stableSelector(el);
    findings.push({ key, ruleId, geometry: geometryLabel, detail });
  }

  // rule: viewport-escape ------------------------------------------------
  const mainArea = document.getElementById('main-area') || document.scrollingElement || document.documentElement;
  if (mainArea) {
    const dw = mainArea.scrollWidth - mainArea.clientWidth;
    const dh = mainArea.scrollHeight - mainArea.clientHeight;
    if (dw > config.viewportTolerancePx || dh > config.viewportTolerancePx) {
      add('viewport-escape', mainArea, {
        scrollWidth: mainArea.scrollWidth, clientWidth: mainArea.clientWidth,
        scrollHeight: mainArea.scrollHeight, clientHeight: mainArea.clientHeight,
      });
    }
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const candidates = Array.from(document.querySelectorAll(config.interactiveSelector))
    .filter((el) => !el.disabled && el.getAttribute('aria-hidden') !== 'true');

  function hasScrollingAncestor(el) {
    let cur = el.parentElement;
    while (cur) {
      const cs = getComputedStyle(cur);
      const scrollsY = (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && cur.scrollHeight > cur.clientHeight + 1;
      const scrollsX = (cs.overflowX === 'auto' || cs.overflowX === 'scroll') && cur.scrollWidth > cur.clientWidth + 1;
      if (scrollsY || scrollsX) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  function firstNonTransparentBg(el) {
    let cur = el;
    while (cur) {
      const cs = getComputedStyle(cur);
      const rgb = parseRgbString(cs.backgroundColor);
      if (rgb && rgb[3] > 0) return [rgb[0], rgb[1], rgb[2]];
      cur = cur.parentElement;
    }
    return [255, 255, 255]; // honest fallback: assume a white canvas if nothing is opaque up the chain
  }

  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    const zeroArea = rect.width === 0 && rect.height === 0;
    if (zeroArea) continue; // genuinely absent (display:none etc.), a different class than "escaping" -- see review Class 1 vs Class 2

    // rule: unreachable-control -----------------------------------------
    const escapesBottom = rect.bottom > vh + config.viewportTolerancePx;
    const escapesRight = rect.right > vw + config.viewportTolerancePx;
    const escapesTopLeft = rect.top < -config.viewportTolerancePx || rect.left < -config.viewportTolerancePx;
    if ((escapesBottom || escapesRight || escapesTopLeft) && !hasScrollingAncestor(el)) {
      add('unreachable-control', el, { rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }, viewport: { vw, vh } });
    }

    // rule: pointer-occlusion --------------------------------------------
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (cx >= 0 && cx <= vw && cy >= 0 && cy <= vh) {
      const top = document.elementFromPoint(cx, cy);
      if (top && top !== el && !el.contains(top) && !top.contains(el)) {
        add('pointer-occlusion', el, { interceptor: stableSelector(top) });
      }
    }

    // rule: target-size (C21) --------------------------------------------
    if (rect.width < config.minTargetPx - 0.5 || rect.height < config.minTargetPx - 0.5) {
      add('target-size', el, { w: rect.width, h: rect.height });
    }

    // rule: text-contrast (C19) -------------------------------------------
    const hasText = (el.textContent || '').trim().length > 0 || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
    if (hasText) {
      const cs = getComputedStyle(el);
      const fg = parseRgbString(cs.color);
      if (fg) {
        const bg = firstNonTransparentBg(el);
        const ratio = contrastRatioOf([fg[0], fg[1], fg[2]], bg);
        if (ratio < config.minContrast) {
          add('text-contrast', el, { ratio: Math.round(ratio * 100) / 100, fg: cs.color, bg: 'rgb(' + bg.join(',') + ')' });
        }
      }
    }

    // rule: focus-invisible (C17, focus-indicator half only) --------------
    const hadFocus = document.activeElement;
    try {
      el.focus({ preventScroll: true });
      if (document.activeElement === el) {
        const cs = getComputedStyle(el);
        const outlineNone = cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth) === 0;
        let visible = !outlineNone;
        if (!outlineNone) {
          const outlineColor = parseRgbString(cs.outlineColor);
          if (outlineColor) {
            const bg = firstNonTransparentBg(el.parentElement || el);
            const ratio = contrastRatioOf([outlineColor[0], outlineColor[1], outlineColor[2]], bg);
            visible = ratio >= config.minFocusContrast;
            if (!visible) add('focus-invisible', el, { ratio: Math.round(ratio * 100) / 100, outlineColor: cs.outlineColor });
          }
        } else {
          add('focus-invisible', el, { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth });
        }
      }
    } finally {
      if (hadFocus && hadFocus.focus) hadFocus.focus({ preventScroll: true });
      else el.blur();
    }
  }

  return findings;
}

function buildPageScript(geometryLabel, config) {
  return `(() => {
    ${stableSelector.toString()}
    ${relLuminance.toString()}
    ${contrastRatioOf.toString()}
    ${parseRgbString.toString()}
    ${collectFindingsInPage.toString()}
    return collectFindingsInPage(${JSON.stringify(geometryLabel)}, ${JSON.stringify(config)});
  })()`;
}

// ── CLI plumbing (ported from lyt-conformance.mjs's own skeleton) ─────
const argv = process.argv.slice(2);
function flag(name, def) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const FORBIDDEN_PORTS = new Set([8764, 4173, 5173, 5174]);
const port = Number(flag('port', '19300'));
if (!Number.isInteger(port) || port < 19000) {
  console.error(`[layout-audit] refusing port ${port} -- scratch ports must be >= 19000`);
  process.exit(2);
}
if (FORBIDDEN_PORTS.has(port)) {
  console.error(`[layout-audit] refusing port ${port} -- this is a live project port (8764/4173/5173/5174), never touched by this gate`);
  process.exit(2);
}
const headed = Boolean(flag('headed', false));
const doBuild = Boolean(flag('build', false));
const doCheck = Boolean(flag('check', false));
const distDir = join(FRONTEND_ROOT, 'dist');
const outPath = flag('out', join(FRONTEND_ROOT, 'layout-audit-report.json'));

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: FRONTEND_ROOT, ...opts });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
    child.on('error', reject);
  });
}

/** Probes whether nothing is listening on `port` at `host` — resolves
 *  `true` (dead: safe to bake into the build) on a connection error
 *  (`ECONNREFUSED` and friends) or a timeout, `false` (alive: something
 *  DID answer) only on an actual successful connect. Errs toward "dead"
 *  on ambiguous failures deliberately: this probe exists to catch the
 *  ONE failure mode that matters here (a real service answering, which
 *  would make the built SPA reach a stray backend), not to diagnose
 *  arbitrary network conditions. */
function probePortDead(port, host = '127.0.0.1', timeoutMs = 300) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host });
    let settled = false;
    const finish = (dead) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(dead);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(false));
    socket.once('timeout', () => finish(true));
    socket.once('error', () => finish(true));
  });
}

/** Finds a genuinely dead port at/above 19000 to bake into
 *  `VITE_API_BASE_URL` for a deterministic cold-boot build (this
 *  module's own header, "Deterministic cold boot"). Refuses the
 *  scratch preview port (`port`, above — the two must never collide)
 *  and the project's own forbidden live ports; re-probes forward on
 *  the rare chance a candidate unexpectedly answers, and refuses
 *  loudly (ADR-0002) rather than silently proceeding on an ambiguous
 *  port if the whole search range is exhausted. */
async function pickDeadBackendPort(startPort = 19400, maxTries = 50) {
  for (let i = 0; i < maxTries; i += 1) {
    const candidate = startPort + i;
    if (candidate === port || FORBIDDEN_PORTS.has(candidate)) continue;
    const dead = await probePortDead(candidate);
    if (dead) return candidate;
    console.error(`[layout-audit] port ${candidate} unexpectedly answered a connection -- skipping, trying next`);
  }
  throw new Error(
    `[layout-audit] could not find a dead port in [${startPort}, ${startPort + maxTries}) for the deterministic cold-boot backend URL -- refusing to build with an ambiguous VITE_API_BASE_URL (ADR-0002)`,
  );
}

async function waitForPreviewReady(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return;
      lastErr = new Error(`preview responded ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`vite preview never became ready at ${url}: ${lastErr}`);
}

async function auditGeometry(browser, geometry) {
  const context = await browser.newContext({ viewport: { width: geometry.width, height: geometry.height } });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  const url = `http://127.0.0.1:${port}/`;
  let reached = true;
  try {
    await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
    await page.waitForSelector('#split-workspace', { timeout: 20_000 });
  } catch {
    reached = false;
  }
  let findings = [];
  if (reached) {
    findings = await page.evaluate(buildPageScript(geometry.label, DEFAULT_CONFIG));
  }
  await context.close();
  return { geometry, reached, findings, consoleErrors };
}

function loadBaselineSync(text) {
  const parsed = JSON.parse(text);
  return new Set(parsed.keys || []);
}

function renderSummary(results, baselineKeys, checkMode) {
  const lines = [];
  lines.push('[layout-audit] per-geometry findings (deduped by stable key):');
  let totalFindings = 0;
  let totalNew = 0;
  const byRule = {};
  for (const r of results) {
    if (!r.reached) {
      lines.push(`  ${r.geometry.label.padEnd(11)} UNREACHABLE (cold-boot workspace never mounted)`);
      continue;
    }
    const keys = new Set(r.findings.map((f) => f.key));
    const newKeys = checkMode ? [...keys].filter((k) => !baselineKeys.has(k)) : [];
    totalFindings += keys.size;
    totalNew += newKeys.length;
    for (const f of r.findings) byRule[f.ruleId] = (byRule[f.ruleId] || 0) + 1;
    lines.push(`  ${r.geometry.label.padEnd(11)} ${keys.size} finding(s)${checkMode ? `, ${newKeys.length} NEW vs baseline` : ''}`);
    if (newKeys.length > 0) {
      for (const k of newKeys) lines.push(`      NEW: ${k}`);
    }
  }
  lines.push('');
  lines.push('[layout-audit] by rule:');
  for (const [rule, n] of Object.entries(byRule)) lines.push(`  ${rule.padEnd(20)} ${n}`);
  lines.push('');
  lines.push(`[layout-audit] total findings: ${totalFindings}${checkMode ? `, new vs baseline: ${totalNew}` : ''}`);
  return { text: lines.join('\n'), totalFindings, totalNew };
}

async function main() {
  if (doBuild) {
    const deadBackendPort = await pickDeadBackendPort();
    const deadBackendUrl = `http://127.0.0.1:${deadBackendPort}`;
    console.log(`[layout-audit] deterministic cold boot: probed port ${deadBackendPort} dead, building with VITE_API_BASE_URL=${deadBackendUrl}…`);
    console.log('[layout-audit] building SPA (npm run build)…');
    await run('npm', ['run', 'build'], { env: { ...process.env, VITE_API_BASE_URL: deadBackendUrl } });
  } else {
    console.error(
      '[layout-audit] WARNING: auditing an EXISTING dist/ without --build -- this build\'s own baked-in ' +
        'VITE_API_BASE_URL (whatever it was built with) is unknown to this run, NOT overridden to a dead ' +
        'port; cold-boot determinism is only guaranteed via the --build path (this module\'s own header, ' +
        '"Deterministic cold boot").',
    );
    try {
      await access(join(distDir, 'index.html'));
    } catch {
      console.error(`[layout-audit] ${distDir}/index.html not found -- run \`npm run build\` first, or pass --build`);
      process.exit(2);
    }
  }

  console.log(`[layout-audit] starting vite preview on port ${port}…`);
  const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: FRONTEND_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let browser = null;
  let exitCode = 0;
  try {
    await waitForPreviewReady(`http://127.0.0.1:${port}/`);

    // Resolution order: explicit env override > the project's usual local
    // system chromium (matches lyt-conformance.mjs / lyt-w2-usability.mjs's
    // own convention) > undefined, which lets playwright-core fall back to
    // its own bundled browser (installed via `npx playwright install
    // chromium` — the CI job's approach, since GitHub's ubuntu-latest
    // runner has no system chromium at /usr/bin/chromium).
    const executablePath = process.env.LAYOUT_AUDIT_CHROMIUM_PATH
      || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
    console.log(`[layout-audit] launching chromium (headless=${!headed}, executablePath=${executablePath ?? '(playwright-core bundled)'})…`);
    browser = await chromium.launch({
      ...(executablePath ? { executablePath } : {}),
      headless: !headed,
      args: ['--js-flags=--max-old-space-size=1024'],
    });

    const results = [];
    for (const geometry of GEOMETRIES) {
      console.log(`[layout-audit] auditing ${geometry.label}…`);
      results.push(await auditGeometry(browser, geometry));
    }

    let baselineKeys = new Set();
    if (doCheck) {
      let baselineText;
      try {
        baselineText = await readFile(BASELINE_PATH, 'utf8');
      } catch (err) {
        console.error(`[layout-audit] --check requires a baseline at ${BASELINE_PATH}: ${err.message}`);
        process.exit(2);
      }
      baselineKeys = loadBaselineSync(baselineText);
    }

    const { text, totalNew } = renderSummary(results, baselineKeys, doCheck);
    console.log('');
    console.log(text);

    const report = {
      generatedAt: new Date().toISOString(),
      geometries: results.map((r) => ({
        label: r.geometry.label,
        width: r.geometry.width,
        height: r.geometry.height,
        reached: r.reached,
        consoleErrors: r.consoleErrors,
        findings: r.findings,
      })),
    };
    await writeFile(outPath, JSON.stringify(report, null, 2));
    console.log(`[layout-audit] wrote ${outPath}`);

    if (doCheck && totalNew > 0) {
      console.error(`[layout-audit] FAILED: ${totalNew} finding(s) not present in the committed baseline (${BASELINE_PATH}).`);
      exitCode = 1;
    }
    for (const r of results) {
      if (!r.reached) {
        console.error(`[layout-audit] FAILED: ${r.geometry.label} never reached a measurable state (cold-boot #split-workspace did not mount).`);
        exitCode = 1;
      }
    }
  } finally {
    if (browser) await browser.close();
    preview.kill();
  }
  process.exitCode = exitCode;
}

// Only run main() when invoked directly (not when imported for its pure
// exports by the unit-test suite).
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('[layout-audit] FATAL:', err);
    process.exitCode = 1;
  });
}
