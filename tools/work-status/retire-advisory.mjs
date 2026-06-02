#!/usr/bin/env node
/**
 * tools/work-status/retire-advisory.mjs — design-note retirement advisory.
 *
 * Design notes are load-bearing, must-read docs that accumulate under
 * `docs/notes/`. The work-status SSOT links each item to its planning doc via
 * `design-note`-kind refs, so retirement is *derivable*: a live design note
 * whose EVERY referencing SSOT item is closed has no open work depending on
 * it and is an **archival candidate** (move to `docs/archive/notes/`).
 *
 * This is the SSOT-driven half of the doc-retirement leg of
 * `adr-effectiveness-audits`. It is **advisory, never a gate** (exit 0
 * always): archival is an editorial judgment — a note may retain residual
 * value, and archiving it breaks inbound cross-references, so it costs a
 * cross-reference audit to reach homeostasis (the `consolidation-xref-
 * fallout.md` pattern is the template). The tool names candidates; a human
 * decides.
 *
 * Scope, by construction:
 *   - Only `design-note` refs whose target is under `docs/notes/` — the
 *     canonical live design-note home. Targets already under `docs/archive/`
 *     are retired; targets elsewhere (e.g. `frontend/docs/`) have their own
 *     lifecycle. Both are out of scope.
 *   - A design note with NO `design-note` ref in the SSOT is invisible here
 *     (there is no item whose closure could signal its retirement). That is
 *     the deliberate limit: retirement is keyed on the SSOT linkage, not on a
 *     filesystem sweep of `*-plan.md`.
 *
 * A transitional section (OLD_STYLE_ALLOWLIST) additionally watches the
 * pre-consolidation design notes that are NOT yet SSOT-anchored — the forward
 * gate cannot see them (no `design-note` ref), so it reads their own
 * `design-note:` / `Status:` marker and flags any that has gone terminal. It
 * is **self-retiring**: when the allowlist empties (every old-style note
 * anchored, implemented, or archived), the section is deleted and the bespoke
 * check leaves CI (ADR-0005 Rule 7 + Rule 9). New design notes never land
 * here — they are SSOT-anchored from the start.
 *
 * Zero-dep (pure Node, built-ins only). `--selftest` proves it flags an
 * all-closed-referencer note and spares notes with any open referencer, any
 * already-archived target, and any non-`docs/notes/` target, and that the
 * old-style marker parse treats `revised` as open (not terminal).
 *
 * License: Public Domain (The Unlicense).
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = resolve(REPO, 'docs/work-status.json');

const LIVE_PREFIX = 'docs/notes/'; // the canonical live design-note home

// Live design notes (docs/notes/ design-note refs) whose every referencing
// SSOT item is closed. Returns [{ path, refs: [{id, resolution}] }] sorted by
// path. `docs/archive/notes/...` targets fail the LIVE_PREFIX test (they start
// with `docs/archive/`), so already-retired notes are excluded for free.
function archivalCandidates(items) {
  const byTarget = new Map(); // design-note target -> [{id, state, resolution}]
  for (const it of items) for (const r of it.refs ?? []) {
    if (r.kind !== 'design-note') continue;
    if (!byTarget.has(r.target)) byTarget.set(r.target, []);
    byTarget.get(r.target).push({ id: it.id, state: it.state, resolution: it.resolution ?? null });
  }
  const candidates = [];
  for (const [path, refs] of byTarget) {
    if (!path.startsWith(LIVE_PREFIX)) continue;
    if (refs.every(r => r.state === 'closed')) candidates.push({ path, refs });
  }
  candidates.sort((a, b) => a.path.localeCompare(b.path));
  return candidates;
}

// ---- transitional: pre-SSOT design notes (sunset allowlist) ----
//
// MORATORIUM (ADR-0005 Rule 7 + Rule 9). These are pre-consolidation design
// notes relocated into docs/notes/design/ but not yet SSOT-anchored, so the
// forward gate above cannot see them. Until each is anchored, implemented, or
// archived we watch its own `design-note:` / `Status:` marker and flag any
// that has gone terminal. This section is bespoke and self-retiring: WHEN
// OLD_STYLE_ALLOWLIST IS EMPTY, DELETE THIS WHOLE SECTION, its call in main(),
// and its selftest case — the bespoke check is then purged from CI.
const OLD_STYLE_ALLOWLIST = [
  'docs/notes/design/adaptive-reevaluate-widening-plan.md',
  'docs/notes/design/autonomous-srs-loop.md',
  'docs/notes/design/autonomous-srs-loop-revised.md',
  'docs/notes/design/doc-graph-discipline-plan.md',
  'docs/notes/design/migration-test-rotation-plan.md',
  'docs/notes/design/mistake-finder-design-space.md',
  'docs/notes/design/mistake-finder-pedagogy-and-followups.md',
  'docs/notes/design/mistake-stability-surface-synthesis.md',
  'docs/notes/design/proxy-topology-testing-plan.md',
  'docs/notes/design/proxy-topology-testing-plan-revised.md',
  'docs/notes/design/qeubo-namespace-unification-plan.md',
  'docs/notes/design/stability-surface-design-space.md',
  'docs/notes/design/typed-effect-documentation-plan.md',
];

// Terminal markers = the note's work is done → archival candidate. `revised`
// is deliberately NOT terminal: a revised edition is the *current*
// pre-implementation note (e.g. autonomous-srs-loop-revised), not a finished
// one — treating it as done would wrongly archive live work.
const TERMINAL_MARKERS = new Set(['implemented', 'locally-implemented', 'closed-with-rationale']);

// Extract a design-note lifecycle marker from a note's head — matches both
// `design-note: <status>` and a bare `Status: <status>` line.
function parseMarker(text) {
  const m = text.slice(0, 1500).match(/(?:design-note:\s*`?|^\s*\*{0,2}Status:?\*{0,2}\s*`?(?:design-note:\s*)?)([a-z][a-z-]+)/im);
  return m ? m[1].toLowerCase() : null;
}

// Old-style notes whose own marker is terminal (→ archive + drop from list),
// plus allowlist entries that have vanished (→ drop; the list self-shrinks).
function oldStyleCandidates() {
  const terminal = [], stale = [];
  for (const rel of OLD_STYLE_ALLOWLIST) {
    const abs = resolve(REPO, rel);
    if (!existsSync(abs)) { stale.push(rel); continue; }
    const marker = parseMarker(readFileSync(abs, 'utf8'));
    if (marker && TERMINAL_MARKERS.has(marker)) terminal.push({ path: rel, marker });
  }
  return { terminal, stale };
}

function oldStyleReport({ terminal, stale }) {
  if (!OLD_STYLE_ALLOWLIST.length) return null; // section retired; delete it
  const lines = ['', `— transitional: pre-SSOT old-style notes (sunset allowlist, ${OLD_STYLE_ALLOWLIST.length} tracked) —`];
  if (terminal.length) {
    lines.push(`${terminal.length} whose own marker is terminal → archive + drop from allowlist:`);
    for (const t of terminal) lines.push(`  ${t.path}  [design-note: ${t.marker}]`);
  } else {
    lines.push('none terminal yet (all still planned / in-progress / exploratory / revised).');
  }
  if (stale.length) {
    lines.push('allowlist entries no longer present — drop them:');
    for (const s of stale) lines.push(`  ${s}`);
  }
  return lines.join('\n');
}

function report(candidates) {
  const lines = [];
  if (!candidates.length) {
    lines.push('design-note retirement: no archival candidates — every live design note in');
    lines.push('docs/notes/ has at least one open referencing item.');
    return lines.join('\n');
  }
  lines.push(`design-note retirement advisory — ${candidates.length} archival candidate(s):`);
  lines.push('(every referencing SSOT item is closed; advisory only — archival is an');
  lines.push(' editorial judgment, and breaks inbound cross-refs → run a cross-reference');
  lines.push(' audit, cf. docs/notes/consolidation-xref-fallout.md)');
  for (const c of candidates) {
    lines.push('');
    lines.push(`  ${c.path}`);
    for (const r of c.refs) lines.push(`    ← ${r.id} [closed${r.resolution ? `/${r.resolution}` : ''}]`);
    lines.push('    → candidate for docs/archive/notes/');
  }
  return lines.join('\n');
}

function main() {
  const data = JSON.parse(readFileSync(DATA, 'utf8'));
  console.log(report(archivalCandidates(data.items ?? [])));
  const old = oldStyleReport(oldStyleCandidates());
  if (old) console.log(old);
  // Advisory only: never gates CI.
  process.exit(0);
}

function selftest() {
  const items = [
    { id: 'done', state: 'closed', resolution: 'shipped', refs: [{ kind: 'design-note', target: 'docs/notes/done-plan.md' }] },
    { id: 'live', state: 'open', refs: [{ kind: 'design-note', target: 'docs/notes/live-plan.md' }] },
    // mixed: same note referenced by one closed + one open item → not a candidate
    { id: 'mix-closed', state: 'closed', resolution: 'shipped', refs: [{ kind: 'design-note', target: 'docs/notes/mixed-plan.md' }] },
    { id: 'mix-open', state: 'open', refs: [{ kind: 'design-note', target: 'docs/notes/mixed-plan.md' }] },
    // already archived target → excluded by the docs/notes/ prefix test
    { id: 'archived', state: 'closed', resolution: 'shipped', refs: [{ kind: 'design-note', target: 'docs/archive/notes/old-plan.md' }] },
    // non-docs/notes/ target → out of scope
    { id: 'elsewhere', state: 'closed', resolution: 'shipped', refs: [{ kind: 'design-note', target: 'frontend/docs/x.md' }] },
    // a non-design-note ref to a docs/notes/ path → not a design note
    { id: 'other-kind', state: 'closed', resolution: 'shipped', refs: [{ kind: 'worklog', target: 'docs/notes/not-a-plan.md' }] },
  ];
  const got = archivalCandidates(items).map(c => c.path);
  const want = ['docs/notes/done-plan.md'];
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    console.error(`MISS  expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
    process.exit(1);
  }
  console.log(`ok    flags all-closed-referencer note; spares open/mixed/archived/out-of-tree/other-kind`);

  // 2. old-style marker parse: terminal-vs-open, with `revised` = open.
  const mk = [
    ['- **Status:** `design-note: implemented`', 'implemented'],
    ['Status: design-note: revised (2026-05-09)', 'revised'],
    ['**Status:** `design-note: planned`.', 'planned'],
    ['# Foo\nStatus: implemented (2026-06-01).', 'implemented'],
  ];
  for (const [txt, want] of mk) {
    const got = parseMarker(txt);
    if (got !== want) { console.error(`MISS  parseMarker(${JSON.stringify(txt)}) = ${got}, want ${want}`); process.exit(1); }
  }
  const termOk = ['implemented', 'locally-implemented', 'closed-with-rationale'].every(m => TERMINAL_MARKERS.has(m))
    && !TERMINAL_MARKERS.has('revised') && !TERMINAL_MARKERS.has('planned');
  if (!termOk) { console.error('MISS  TERMINAL_MARKERS classification'); process.exit(1); }
  console.log(`ok    parseMarker + terminal classification (revised is NOT terminal)`);

  console.log(`\nselftest: 2 cases, 0 failure(s)`);
  process.exit(0);
}

if (process.argv[2] === '--selftest') selftest();
else main();
