#!/usr/bin/env node
/**
 * tools/work-status/check.mjs — validate the work-status SSOT.
 *
 * Three layers, all zero-dep (no JSON-Schema-validator dependency — a small
 * generic validator INTERPRETS docs/work-status.schema.json, so the schema
 * stays the single source of truth for every data constraint; nothing is
 * re-encoded in JS, and dropping a value from an enum in the schema
 * automatically tightens the data check):
 *
 *   1. Meta-schema lints (on the schema file itself):
 *      - enum disjointness — no string is a member of two field enums
 *        (the nominal-type disjointness JSON Schema's string-enums erase;
 *        this is the lint that would have caught `future` leaking into the
 *        `tier` enum when it already meant something in `disposition`).
 *        Deliberate overlaps go in ALLOWLIST (empty today).
 *      - conditional references — the if/then conditionals only mention
 *        fields and enum values that actually exist (a typo fails loud
 *        rather than silently never-matching).
 *   2. Data validation (G-1): docs/work-status.json against the schema.
 *   3. Graph / cross-record invariants JSON Schema cannot express:
 *      - id uniqueness; referential integrity of parent/depends_on/
 *        superseded_by to existing ids (HARD); depends_on acyclic + parent
 *        chains acyclic (A-1, HARD); doc/source ref paths exist on disk
 *        (ADVISORY — reported, not gated, mirroring the doc-graph link report).
 *
 * Exit non-zero on any HARD error; advisory warnings never fail the gate.
 * `--selftest` proves the checker catches each violation class.
 *
 * License: Public Domain (The Unlicense).
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = resolve(REPO, 'docs/work-status.schema.json');
const DATA = resolve(REPO, 'docs/work-status.json');

// Deliberate cross-enum value overlaps (none today). A value here is exempt
// from the disjointness lint — add with a justification comment.
const DISJOINTNESS_ALLOWLIST = new Set();

// ---- generic JSON-Schema-subset validator (interprets the schema) ----

const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);

function resolveRef(ref, root) {
  return ref.replace(/^#\//, '').split('/').reduce((o, k) => o?.[k], root);
}

function typeOk(v, t) {
  switch (t) {
    case 'object': return isObj(v);
    case 'array': return Array.isArray(v);
    case 'string': return typeof v === 'string';
    case 'integer': return Number.isInteger(v);
    case 'number': return typeof v === 'number';
    case 'boolean': return typeof v === 'boolean';
    case 'null': return v === null;
    default: return true;
  }
}

function validate(value, schema, root, path, errs) {
  if (schema.$ref) return validate(value, resolveRef(schema.$ref, root), root, path, errs);
  if ('const' in schema && value !== schema.const)
    errs.push(`${path}: expected ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`);
  if (schema.enum && !schema.enum.includes(value))
    errs.push(`${path}: ${JSON.stringify(value)} not in {${schema.enum.join(', ')}}`);
  if (schema.type && !(Array.isArray(schema.type) ? schema.type.some(t => typeOk(value, t)) : typeOk(value, schema.type)))
    errs.push(`${path}: expected type ${JSON.stringify(schema.type)}`);
  if (typeof value === 'string') {
    if (schema.minLength != null && value.length < schema.minLength) errs.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errs.push(`${path}: does not match /${schema.pattern}/`);
    if (schema.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errs.push(`${path}: not an ISO date`);
  }
  if (Array.isArray(value)) {
    if (schema.items) value.forEach((el, i) => validate(el, schema.items, root, `${path}[${i}]`, errs));
    if (schema.contains && !value.some(el => passes(el, schema.contains, root)))
      errs.push(`${path}: no element satisfies 'contains'`);
  }
  if (isObj(value)) {
    for (const k of schema.required ?? []) if (!(k in value)) errs.push(`${path}: missing required '${k}'`);
    if (schema.properties) for (const k of Object.keys(value)) if (schema.properties[k]) validate(value[k], schema.properties[k], root, `${path}.${k}`, errs);
    if (schema.additionalProperties === false && schema.properties)
      for (const k of Object.keys(value)) if (!(k in schema.properties)) errs.push(`${path}: unexpected property '${k}'`);
  }
  for (const sub of schema.allOf ?? []) validate(value, sub, root, path, errs);
  if (schema.not && passes(value, schema.not, root)) errs.push(`${path}: must NOT satisfy 'not' subschema`);
  if (schema.if) {
    if (passes(value, schema.if, root)) { if (schema.then) validate(value, schema.then, root, path, errs); }
    else if (schema.else) validate(value, schema.else, root, path, errs);
  }
  return errs;
}
const passes = (value, schema, root) => validate(value, schema, root, '', []).length === 0;

// ---- meta-schema lints ----

function lintEnumDisjointness(schema) {
  const fieldEnums = {};
  for (const [f, s] of Object.entries(schema.$defs.item.properties)) if (s.enum) fieldEnums[f] = s.enum;
  const refKind = schema.$defs.ref?.properties?.kind;
  if (refKind?.enum) fieldEnums['ref.kind'] = refKind.enum;
  const seen = {};
  for (const [f, vals] of Object.entries(fieldEnums)) for (const v of vals) (seen[v] ??= []).push(f);
  const errs = [];
  for (const [v, fs] of Object.entries(seen))
    if (fs.length > 1 && !DISJOINTNESS_ALLOWLIST.has(v))
      errs.push(`enum value "${v}" appears in ${fs.length} field enums: ${fs.join(', ')} (facets must be disjoint; allowlist a deliberate overlap)`);
  return errs;
}

function lintConditionalReferences(schema) {
  const itemProps = schema.$defs.item.properties;
  const refKindEnum = schema.$defs.ref?.properties?.kind?.enum ?? [];
  const errs = [];
  // const-references on item fields: properties.{field}.const must be in that field's enum
  const checkConstRefs = (node, inRefsContains) => {
    if (!isObj(node)) return;
    if (node.properties) for (const [field, sub] of Object.entries(node.properties)) {
      if ('const' in sub) {
        if (inRefsContains) { /* ref.kind const — check against ref kinds */
          if (field === 'kind' && !refKindEnum.includes(sub.const)) errs.push(`conditional refs.kind const "${sub.const}" not a ref kind`);
        } else if (!(field in itemProps)) errs.push(`conditional references unknown field '${field}'`);
        else if (itemProps[field].enum && !itemProps[field].enum.includes(sub.const))
          errs.push(`conditional ${field} const "${sub.const}" not in its enum {${itemProps[field].enum.join(', ')}}`);
      }
      if (sub.enum && (inRefsContains || field === 'kind')) for (const v of sub.enum)
        if (!refKindEnum.includes(v)) errs.push(`conditional refs.kind enum value "${v}" not a ref kind`);
    }
    for (const k of node.required ?? []) if (!inRefsContains && !(k in itemProps) && k !== 'kind') errs.push(`conditional 'required' names unknown field '${k}'`);
    for (const key of ['if', 'then', 'else', 'not']) if (node[key]) checkConstRefs(node[key], inRefsContains);
    for (const sub of node.allOf ?? []) checkConstRefs(sub, inRefsContains);
    if (node.properties?.refs?.contains) checkConstRefs(node.properties.refs.contains, true);
  };
  for (const sub of schema.$defs.item.allOf ?? []) checkConstRefs(sub, false);
  return errs;
}

// ---- graph / cross-record invariants ----

function graphChecks(items) {
  const hard = [], advisory = [];
  const ids = new Set();
  for (const it of items) { if (ids.has(it.id)) hard.push(`duplicate id '${it.id}'`); ids.add(it.id); }

  for (const it of items) {
    if (it.parent && !ids.has(it.parent)) hard.push(`${it.id}: parent '${it.parent}' does not resolve`);
    for (const d of it.depends_on ?? []) if (!ids.has(d)) hard.push(`${it.id}: depends_on '${d}' does not resolve`);
    if (it.superseded_by && !ids.has(it.superseded_by)) hard.push(`${it.id}: superseded_by '${it.superseded_by}' does not resolve`);
  }

  // acyclicity of depends_on and of parent chains
  const cycle = (edgesOf, label) => {
    const color = {}; items.forEach(it => (color[it.id] = 0));
    const dfs = u => {
      color[u] = 1;
      for (const v of edgesOf(u)) {
        if (color[v] === 1) { hard.push(`${label} cycle through '${u}' → '${v}'`); return; }
        if (color[v] === 0 && ids.has(v)) dfs(v);
      }
      color[u] = 2;
    };
    const by = {}; items.forEach(it => (by[it.id] = it));
    items.forEach(it => { if (color[it.id] === 0) dfs(it.id); });
    void by;
  };
  const byId = Object.fromEntries(items.map(it => [it.id, it]));
  cycle(u => byId[u]?.depends_on ?? [], 'depends_on');
  cycle(u => (byId[u]?.parent ? [byId[u].parent] : []), 'parent');

  // advisory: doc/source ref paths exist on disk
  const FILE_KINDS = new Set(['worklog', 'design-note', 'adr', 'dispatch', 'source']);
  for (const it of items) for (const r of it.refs ?? [])
    if (FILE_KINDS.has(r.kind) && !existsSync(resolve(REPO, r.target)))
      advisory.push(`${it.id}: ref ${r.kind} '${r.target}' does not resolve to a file`);

  return { hard, advisory };
}

// ---- run ----

function run(schemaObj, dataObj) {
  const hard = [], advisory = [];
  hard.push(...lintEnumDisjointness(schemaObj).map(e => `[meta:disjointness] ${e}`));
  hard.push(...lintConditionalReferences(schemaObj).map(e => `[meta:conditionals] ${e}`));
  hard.push(...validate(dataObj, schemaObj, schemaObj, '$', []).map(e => `[schema] ${e}`));
  const g = graphChecks(dataObj.items ?? []);
  hard.push(...g.hard.map(e => `[graph] ${e}`));
  advisory.push(...g.advisory.map(e => `[advisory] ${e}`));
  return { hard, advisory };
}

function main() {
  const schemaObj = JSON.parse(readFileSync(SCHEMA, 'utf8'));
  const dataObj = JSON.parse(readFileSync(DATA, 'utf8'));
  const { hard, advisory } = run(schemaObj, dataObj);
  for (const w of advisory) console.error(`WARN  ${w}`);
  if (advisory.length) console.error(`(${advisory.length} advisory; not gated)`);
  if (hard.length) {
    for (const e of hard) console.error(`ERROR ${e}`);
    console.error(`\nFAIL — ${hard.length} hard error(s) in ${dataObj.items?.length ?? 0} items.`);
    process.exit(1);
  }
  console.log(`PASS — ${dataObj.items.length} items valid (G-1/G-2/G-3/A-1 + meta-lints), ${advisory.length} advisory.`);
}

// Prove the checker catches each violation class: clone the real inputs,
// inject one violation, assert at least one HARD error results.
function selftest() {
  const baseSchema = JSON.parse(readFileSync(SCHEMA, 'utf8'));
  const baseData = JSON.parse(readFileSync(DATA, 'utf8'));
  const clone = o => JSON.parse(JSON.stringify(o));
  const cases = [];

  // real inputs must pass
  cases.push(['real corpus passes', baseSchema, baseData, false]);

  // 1. enum collision in the schema (the `future`-in-tier class)
  { const s = clone(baseSchema); s.$defs.item.properties.tier.enum.push('future'); cases.push(['enum disjointness collision', s, baseData, true]); }
  // 2. conditional references a non-existent enum value
  { const s = clone(baseSchema); s.$defs.item.allOf[1].then.required.push('nonexistent_field'); cases.push(['conditional names unknown field', s, baseData, true]); }
  // 3. bad enum value in data
  { const d = clone(baseData); d.items[0].scope = 'frontnd'; cases.push(['bad enum value', baseSchema, d, true]); }
  // 4. open item with a resolution
  { const d = clone(baseData); const it = d.items.find(i => i.state === 'open'); it.resolution = 'shipped'; cases.push(['open item has resolution', baseSchema, d, true]); }
  // 5. closed item without closed_on
  { const d = clone(baseData); const it = d.items.find(i => i.state === 'closed'); delete it.closed_on; cases.push(['closed item missing closed_on', baseSchema, d, true]); }
  // 6. shipped item without ship-ref
  { const d = clone(baseData); const it = d.items.find(i => i.resolution === 'shipped'); it.refs = [{ kind: 'design-note', target: 'x.md' }]; cases.push(['shipped without ship-ref', baseSchema, d, true]); }
  // 7. dangling depends_on
  { const d = clone(baseData); d.items[0].depends_on = ['no-such-id']; cases.push(['dangling depends_on', baseSchema, d, true]); }
  // 8. duplicate id
  { const d = clone(baseData); d.items.push(clone(d.items[0])); cases.push(['duplicate id', baseSchema, d, true]); }
  // 9. depends_on cycle
  { const d = clone(baseData); d.items[0].depends_on = [d.items[1].id]; d.items[1].depends_on = [d.items[0].id]; cases.push(['depends_on cycle', baseSchema, d, true]); }
  // 10. unexpected top-level property
  { const d = clone(baseData); d.bogus = 1; cases.push(['unexpected top-level property', baseSchema, d, true]); }

  let failures = 0;
  for (const [name, s, d, expectErr] of cases) {
    const { hard } = run(s, d);
    const caught = hard.length > 0;
    const ok = caught === expectErr;
    if (!ok) { failures++; console.error(`MISS  ${name}: expected hard error=${expectErr}, got ${caught}`); }
    else console.log(`ok    ${name}${expectErr ? ` (caught: ${hard[0]})` : ''}`);
  }
  console.log(`\nselftest: ${cases.length} cases, ${failures} failure(s)`);
  process.exit(failures ? 1 : 0);
}

if (process.argv[2] === '--selftest') selftest();
else main();
