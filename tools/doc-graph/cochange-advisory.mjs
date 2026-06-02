#!/usr/bin/env node
/**
 * tools/doc-graph/cochange-advisory.mjs — co-change advisory for derived docs.
 *
 * Some docs are *content projections* of others — the ADR synopsis summarizes
 * the ADRs; `docs/TODO.md` projects from `docs/work-status.json`. The doc-graph
 * resolves their cross-reference EDGES and tracks node AGE, but neither catches
 * the failure where a *source* changes and its *derived* doc silently lags (the
 * ADR-0005 Rule 3 hazard — a content snapshot going stale while its link stays
 * valid). adr-synopsis missing ADR-0005 Rule 9 after PR #339 was exactly this.
 *
 * This advisory closes that gap. A derived doc declares its sources inline:
 *
 *     <!-- derived-from: docs/adr/*.md -->
 *
 * and on a PR this tool flags any derived doc whose source changed but which
 * was not itself updated.
 *
 * It is **per-PR-diff, not state-based** — it fires only on the PR whose diff
 * actually changes a source-without-its-derived, and computes purely from
 * `<base>...HEAD`. Once that PR merges the change leaves the diff, so it cannot
 * re-fire on later PRs: transience is structural. (A state-based "derived is
 * older than source" check would nag on *every* PR until the derived doc is
 * touched — one false positive forever. Deliberately not that.)
 *
 * **Silence valve.** Within the firing PR the advisory re-emits each CI run
 * until you act. If a source change genuinely does not warrant a derived-doc
 * update, add to any commit in the PR:
 *
 *     cochange-ack: docs/adr-synopsis.md — typo fix in ADR-0005, no semantic change
 *
 * The tool scans the PR's commit messages, suppresses that specific pair, and
 * the decision + rationale live in the commit that made the call (durable in
 * `git log`, no accreting ack-file). Because the check is per-PR, the ack never
 * carries forward. A pair acked on *every* PR is signalling it is not really a
 * derivation — undeclare it (remove the marker) rather than ack forever.
 *
 * **Advisory, never a gate** (exit 0): a source change does not always oblige a
 * derived-doc update, so this prompts review, it does not block (ADR-0005
 * Alternative C — too soft to gate). Zero-dep; `--selftest` covers the core.
 *
 * Usage: `node tools/doc-graph/cochange-advisory.mjs [<base-ref>]`  (default
 * base `origin/main`). `--selftest` runs the pure-core cases.
 *
 * License: Public Domain (The Unlicense).
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MARKER = /<!--\s*derived-from:\s*([^>]+?)\s*-->/i;

const git = args => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' });

// Derived docs declare their sources inline near the top: a derived-from
// marker whose value is one or more space-separated globs.
function findDerivations() {
  const files = git(['ls-files', '*.md']).split('\n').filter(Boolean);
  const out = [];
  for (const f of files) {
    let head;
    try { head = readFileSync(resolve(REPO, f), 'utf8').slice(0, 2000); } catch { continue; }
    const m = head.match(MARKER);
    if (m) out.push({ derived: f, sources: m[1].split(/\s+/).filter(Boolean) });
  }
  return out;
}

// `*` matches within a path segment only (does not cross `/`).
function globToRe(g) {
  return new RegExp('^' + g.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*') + '$');
}
const matches = (glob, f) => globToRe(glob).test(f);

// Pure core (selftested): derived docs whose source changed this PR but which
// were neither updated nor acknowledged.
function advise(derivations, changed, acked) {
  const ackedSet = new Set(acked), changedSet = new Set(changed);
  const flags = [];
  for (const { derived, sources } of derivations) {
    if (changedSet.has(derived) || ackedSet.has(derived)) continue;
    const hits = changed.filter(f => f !== derived && sources.some(g => matches(g, f)));
    if (hits.length) flags.push({ derived, sources, hits });
  }
  return flags;
}

const getChanged = base => {
  try { return git(['diff', '--name-only', `${base}...HEAD`]).split('\n').filter(Boolean); }
  catch { return []; }
};

// Ack tokens in the PR's commit messages: `cochange-ack: <derived-path>[ — reason]`.
function getAcks(base) {
  let log = '';
  try { log = git(['log', `${base}..HEAD`, '--format=%B']); } catch { return []; }
  const acks = [], re = /cochange-ack:\s*(\S+)/gi;
  let m; while ((m = re.exec(log))) acks.push(m[1]);
  return acks;
}

function main() {
  const base = process.argv[2] || 'origin/main';
  const derivations = findDerivations();
  if (!derivations.length) { console.log('co-change advisory: no derived-from declarations found.'); process.exit(0); }
  const flags = advise(derivations, getChanged(base), getAcks(base));
  if (!flags.length) {
    console.log(`co-change advisory: clean — ${derivations.length} derivation(s) checked against ${base}...HEAD.`);
    process.exit(0);
  }
  console.log(`co-change advisory — ${flags.length} derived doc(s) whose source changed without them in this PR:`);
  console.log('(advisory only — review whether the derived doc needs updating; if it genuinely');
  console.log(' does not, add `cochange-ack: <derived-doc> — <reason>` to any commit to silence)');
  for (const f of flags) {
    console.log('');
    console.log(`  ${f.derived}  ⟵ derived-from: ${f.sources.join(' ')}`);
    for (const h of f.hits) console.log(`    changed source: ${h}`);
    console.log(`    → review ${f.derived}, or:  cochange-ack: ${f.derived} — <reason>`);
  }
  process.exit(0); // advisory: never gates CI
}

function selftest() {
  const D = [
    { derived: 'docs/adr-synopsis.md', sources: ['docs/adr/*.md'] },
    { derived: 'docs/TODO.md', sources: ['docs/work-status.json'] },
  ];
  const cases = [
    ['source changed, derived not, no ack → flag', ['docs/adr/0005-x.md'], [], ['docs/adr-synopsis.md']],
    ['source + derived both changed → no flag', ['docs/adr/0005-x.md', 'docs/adr-synopsis.md'], [], []],
    ['source changed but acked → no flag', ['docs/adr/0005-x.md'], ['docs/adr-synopsis.md'], []],
    ['unrelated change → no flag', ['frontend/src/x.ts'], [], []],
    ['glob does not cross / (nested) → no flag', ['docs/adr/sub/x.md'], [], []],
    ['exact-path json source → flag', ['docs/work-status.json'], [], ['docs/TODO.md']],
    ['both derivations fire independently', ['docs/adr/0001-x.md', 'docs/work-status.json'], [], ['docs/TODO.md', 'docs/adr-synopsis.md']],
  ];
  let fail = 0;
  for (const [name, changed, acked, want] of cases) {
    const got = advise(D, changed, acked).map(f => f.derived).sort();
    const ok = JSON.stringify(got) === JSON.stringify([...want].sort());
    if (!ok) { fail++; console.error(`MISS  ${name}: got ${JSON.stringify(got)} want ${JSON.stringify([...want].sort())}`); }
    else console.log(`ok    ${name}`);
  }
  console.log(`\nselftest: ${cases.length} cases, ${fail} failure(s)`);
  process.exit(fail ? 1 : 0);
}

if (process.argv[2] === '--selftest') selftest();
else main();
