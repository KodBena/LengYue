#!/usr/bin/env node
/**
 * tools/work-status/sql.mjs — ad-hoc SQL over the work-status SSOT.
 *
 * docs/work-status.json is the source of truth. This tool builds a TRANSIENT,
 * in-memory SQLite view of it on every run (never persisted — so it can never
 * go stale against the JSON) and runs the SQL query you pass. It is the
 * consistent READ path for work-status questions; WRITES go to
 * docs/work-status.json directly (this view is read-only). There is no enum
 * enforcement here — columns are TEXT; vocabulary validity is the schema
 * validator's job (docs/work-status.schema.json), not the query layer's.
 *
 * Usage:
 *   node tools/work-status/sql.mjs "<SQL>"           run a query (table; full cells)
 *   node tools/work-status/sql.mjs --max-col N "<SQL>"  cap+…-truncate columns at N
 *   node tools/work-status/sql.mjs --json "<SQL>"    run a query (NDJSON rows)
 *   node tools/work-status/sql.mjs --schema          show the table columns
 *   node tools/work-status/sql.mjs --selftest        round-trip-validate the loader
 *
 * Table output prints every cell in full by default (no truncation); pass
 * `--max-col N` for a compact, `…`-truncated view aligned to N columns.
 *
 * Tables (the relational decomposition of the SSOT):
 *   items(id,title,description,state,disposition,resolution,scope,tier,
 *         closed_on,parent,superseded_by,legacy_number)
 *   deps(item_id, depends_on)     -- one row per depends_on edge
 *   refs(item_id, kind, target)   -- one row per ref
 *   labels(item_id, label)        -- one row per label tag
 *
 * Zero external deps (Node built-in node:sqlite). Fails loud (ADR-0002):
 * a missing/malformed SSOT or a SQL error exits non-zero with a message.
 *
 * License: Public Domain (The Unlicense).
 */

// Suppress the node:sqlite ExperimentalWarning (stderr-only noise) before the
// module loads. Scoped to exactly that warning so other warnings still surface.
const _emit = process.emit;
process.emit = function (name, data, ...rest) {
  if (name === 'warning' && data && data.name === 'ExperimentalWarning'
      && typeof data.message === 'string' && data.message.includes('SQLite')) return false;
  return _emit.call(this, name, data, ...rest);
};

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const { DatabaseSync } = await import('node:sqlite');

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SSOT = resolve(REPO, 'docs/work-status.json');

const ITEM_COLS = ['id', 'title', 'description', 'state', 'disposition', 'resolution',
  'scope', 'tier', 'closed_on', 'parent', 'superseded_by', 'legacy_number'];

function loadDb() {
  let raw;
  try { raw = readFileSync(SSOT, 'utf8'); }
  catch (e) { throw new Error(`cannot read SSOT at ${SSOT}: ${e.message}`); }
  let data;
  try { data = JSON.parse(raw); }
  catch (e) { throw new Error(`SSOT is not valid JSON: ${e.message}`); }
  if (!data || !Array.isArray(data.items)) throw new Error('SSOT has no items[] array');

  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE items (${ITEM_COLS.map(c => `${c} TEXT`).join(', ')});
    CREATE TABLE deps (item_id TEXT, depends_on TEXT);
    CREATE TABLE refs (item_id TEXT, kind TEXT, target TEXT);
    CREATE TABLE labels (item_id TEXT, label TEXT);
  `);
  const insItem = db.prepare(
    `INSERT INTO items (${ITEM_COLS.join(',')}) VALUES (${ITEM_COLS.map(() => '?').join(',')})`);
  const insDep = db.prepare('INSERT INTO deps (item_id, depends_on) VALUES (?, ?)');
  const insRef = db.prepare('INSERT INTO refs (item_id, kind, target) VALUES (?, ?, ?)');
  const insLabel = db.prepare('INSERT INTO labels (item_id, label) VALUES (?, ?)');
  for (const it of data.items) {
    insItem.run(...ITEM_COLS.map(c => (it[c] == null ? null : String(it[c]))));
    for (const d of it.depends_on ?? []) insDep.run(it.id, d);
    for (const r of it.refs ?? []) insRef.run(it.id, r.kind, r.target);
    for (const l of it.labels ?? []) insLabel.run(it.id, l);
  }
  return { db, data };
}

// Table renderer. By default prints every cell in full — the table is the
// SSOT's honest read surface, and silently eliding a long `description` with a
// trailing `…` is exactly the kind of boundary data-loss ADR-0002 forbids (it
// reads as complete when it isn't). `maxCol` (from `--max-col N`) opts into a
// compact, `…`-truncated view when the caller wants column alignment over
// completeness. Whitespace within a cell is still collapsed so one row is one
// line; the final column is never padded (trailing run of spaces is noise).
function printTable(rows, maxCol) {
  if (rows.length === 0) { console.log('(0 rows)'); return; }
  const cols = Object.keys(rows[0]);
  const cap = maxCol ?? null; // null ⇒ no truncation (the default)
  const cell = v => (v == null ? '' : String(v)).replace(/\s+/g, ' ');
  const fit = s => (cap != null && s.length > cap ? s.slice(0, cap - 1) + '…' : s);
  const w = {};
  for (const c of cols) {
    const max = Math.max(c.length, ...rows.map(r => cell(r[c]).length));
    w[c] = cap != null ? Math.min(cap, max) : max;
  }
  const lastIdx = cols.length - 1;
  const lay = vals => vals.map((v, i) => (i === lastIdx ? v : v.padEnd(w[cols[i]]))).join('  ');
  console.log(lay(cols.map(c => fit(c))));
  console.log(lay(cols.map(c => '-'.repeat(w[c]))));
  for (const r of rows) console.log(lay(cols.map(c => fit(cell(r[c])))));
  console.error(`(${rows.length} row${rows.length === 1 ? '' : 's'})`);
}

function runQuery(sql, json, maxCol) {
  const { db } = loadDb();
  let rows;
  try { rows = db.prepare(sql).all(); }
  catch (e) { console.error(`SQL error: ${e.message}`); process.exit(2); }
  if (json) { for (const r of rows) console.log(JSON.stringify(r)); console.error(`(${rows.length} rows)`); }
  else printTable(rows, maxCol);
}

function schema() {
  console.log('items(' + ITEM_COLS.join(', ') + ')');
  console.log('deps(item_id, depends_on)     -- one row per depends_on edge');
  console.log('refs(item_id, kind, target)   -- one row per ref');
  console.log('labels(item_id, label)        -- one row per label tag');
}

// Round-trip validation: the loader is the trust anchor (if it mis-normalizes,
// every "correct" query is silently wrong). Expectations are DERIVED from the
// JSON, not hardcoded, so this stays valid as the SSOT grows.
function selftest() {
  const { db, data } = loadDb();
  const items = data.items;
  const fail = [];
  const eq = (a, b, m) => { if (a !== b) fail.push(`${m}: ${a} !== ${b}`); };

  eq(db.prepare('SELECT count(*) n FROM items').get().n, items.length, 'items count');
  eq(db.prepare('SELECT count(*) n FROM deps').get().n,
    items.reduce((s, it) => s + (it.depends_on?.length ?? 0), 0), 'deps count');
  eq(db.prepare('SELECT count(*) n FROM refs').get().n,
    items.reduce((s, it) => s + (it.refs?.length ?? 0), 0), 'refs count');
  eq(db.prepare('SELECT count(*) n FROM labels').get().n,
    items.reduce((s, it) => s + (it.labels?.length ?? 0), 0), 'labels count');

  const get = db.prepare(`SELECT ${ITEM_COLS.join(',')} FROM items WHERE id=?`);
  for (const it of items) {
    const row = get.get(it.id);
    if (!row) { fail.push(`row missing for ${it.id}`); continue; }
    for (const c of ITEM_COLS) {
      const want = it[c] == null ? null : String(it[c]);
      if (row[c] !== want) fail.push(`${it.id}.${c}: ${JSON.stringify(row[c])} !== ${JSON.stringify(want)}`);
    }
  }

  // Relational logic end-to-end: "actionable now" (open && no open dependency)
  // must never include an open item that has an open dependency.
  const actionable = db.prepare(`
    SELECT i.id FROM items i WHERE i.state='open'
      AND NOT EXISTS (SELECT 1 FROM deps d JOIN items p ON p.id=d.depends_on
                      WHERE d.item_id=i.id AND p.state != 'closed')`).all().map(r => r.id);
  const blocked = new Set(items.filter(it => it.state === 'open'
    && (it.depends_on ?? []).some(d => { const t = items.find(x => x.id === d); return t && t.state !== 'closed'; }))
    .map(it => it.id));
  for (const id of actionable) if (blocked.has(id)) fail.push(`actionable includes blocked ${id}`);

  console.log(`selftest: ${items.length} items, ${fail.length} failure(s)`);
  if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
  console.log('PASS — loader round-trips and relational logic holds');
}

const argv = process.argv.slice(2);
if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
  console.log(`usage:
  node tools/work-status/sql.mjs "<SQL>"              run a query (table; full cells)
  node tools/work-status/sql.mjs --max-col N "<SQL>"  table, columns capped + …-truncated at N
  node tools/work-status/sql.mjs --json "<SQL>"       run a query (NDJSON rows)
  node tools/work-status/sql.mjs --schema             show the table columns
  node tools/work-status/sql.mjs --selftest           round-trip-validate the loader

tables:`);
  schema();
  process.exit(argv.length === 0 ? 1 : 0);
}
if (argv[0] === '--schema') { schema(); process.exit(0); }
if (argv[0] === '--selftest') { selftest(); process.exit(0); }

// Parse flags from anywhere in argv; everything else joins into the SQL. Both
// `--json` and `--max-col N` / `--max-col=N` are position-independent. Fail
// loud (ADR-0002) on a `--max-col` without a positive-integer value.
let json = false;
let maxCol = null;
const sqlParts = [];
function parseMaxCol(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`--max-col needs a positive integer, got ${JSON.stringify(v)}`);
    process.exit(1);
  }
  return n;
}
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--json') { json = true; continue; }
  if (a === '--max-col') { maxCol = parseMaxCol(argv[++i]); continue; }
  if (a.startsWith('--max-col=')) { maxCol = parseMaxCol(a.slice('--max-col='.length)); continue; }
  sqlParts.push(a);
}
const sql = sqlParts.join(' ');
if (!sql.trim()) { console.error('no SQL query given'); process.exit(1); }
runQuery(sql, json, maxCol);
