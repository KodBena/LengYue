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
 * Zero-dep (pure Node, built-ins only). `--selftest` proves it flags an
 * all-closed-referencer note and spares notes with any open referencer, any
 * already-archived target, and any non-`docs/notes/` target.
 *
 * License: Public Domain (The Unlicense).
 */

import { readFileSync } from 'node:fs';
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
  const candidates = archivalCandidates(data.items ?? []);
  console.log(report(candidates));
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
  console.log(`\nselftest: 1 case, 0 failure(s)`);
  process.exit(0);
}

if (process.argv[2] === '--selftest') selftest();
else main();
