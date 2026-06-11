/**
 * src/lib/dsl-harness.ts
 *
 * Pure parse / validate / format / substitute for the deck pipeline's
 * hyperparameter harness. Authoring dialect is a JSON5 superset:
 * trailing commas and single-quoted strings are admitted as sugar,
 * and a bare identifier in value position parses to a Hole marker
 * `{ $param: name }`. Everything else stays JSON-strict.
 *
 * Four exported surfaces, all band-1 per ADR-0003 (no Go, no Vue, no
 * network):
 *
 *   parse(src)        — source text → holey AST + parse errors.
 *   format(ast)       — holey AST → source text (round-trip target).
 *   validate(ast, h)  — cross-check $param sites vs hyperparameter
 *                       declarations; surfaces undeclared sites
 *                       (error) and unused declarations (warning).
 *   substitute(ast, v) — resolve every hole; throws on unbound name
 *                       per ADR-0002 (silent skip would let a deck
 *                       run with a missing hyperparameter and the
 *                       user wouldn't know).
 *
 * Path-aware schema coherence checks are minimal in v1 (TakeStage.n
 * must declare type 'number'; FilterSelection.tag_expression must be
 * 'string' or 'enum'). The backend's typed pipeline executor remains
 * the loud-failure surface for malformed pipelines beyond those two
 * paths; this module's validate() is the editor-time signal.
 *
 * License: Public Domain (The Unlicense)
 */

import type {
  Hole,
  HyperparamDecl,
  PipelineStage,
  PipelineStageWithHoles,
} from '../types';

// ── Parse ──────────────────────────────────────────────────────────

export interface ParseError {
  message: string;
  line: number;
  column: number;
}

export interface ParseResult {
  value: PipelineStageWithHoles[] | null;
  errors: ParseError[];
}

type Value =
  | string
  | number
  | boolean
  | null
  | Hole
  | Value[]
  | { [k: string]: Value };

class ParseFailure extends Error {
  line: number;
  column: number;
  constructor(line: number, column: number, message: string) {
    super(message);
    this.line = line;
    this.column = column;
  }
}

export function parse(src: string): ParseResult {
  const cursor = { pos: 0, src };
  try {
    skipWhitespace(cursor);
    const v = parseValue(cursor);
    skipWhitespace(cursor);
    if (cursor.pos !== src.length) {
      const { line, column } = locate(src, cursor.pos);
      return {
        value: null,
        errors: [{ message: 'Unexpected trailing content', line, column }],
      };
    }
    if (!Array.isArray(v)) {
      return {
        value: null,
        errors: [{
          message: 'Pipeline must be a JSON array of stages',
          line: 1, column: 1,
        }],
      };
    }
    // Validated an array above; the JSON5 parse produced `Value` nodes and
    // a top-level array of stages is a PipelineStageWithHoles[] by the
    // dialect contract (Band-1 internal AST shape).
    return { value: v as PipelineStageWithHoles[], errors: [] };
  } catch (err) {
    if (err instanceof ParseFailure) {
      return {
        value: null,
        errors: [{ message: err.message, line: err.line, column: err.column }],
      };
    }
    throw err;
  }
}

interface Cursor { pos: number; src: string; }

function fail(c: Cursor, message: string): never {
  const { line, column } = locate(c.src, c.pos);
  throw new ParseFailure(line, column, message);
}

function locate(src: string, pos: number): { line: number; column: number } {
  let line = 1, column = 1;
  for (let i = 0; i < pos && i < src.length; i++) {
    if (src[i] === '\n') { line++; column = 1; } else { column++; }
  }
  return { line, column };
}

function skipWhitespace(c: Cursor): void {
  while (c.pos < c.src.length && /\s/.test(c.src[c.pos])) c.pos++;
}

function peek(c: Cursor): string {
  return c.pos < c.src.length ? c.src[c.pos] : '';
}

function consume(c: Cursor, ch: string): void {
  if (peek(c) !== ch) fail(c, `Expected '${ch}' but found '${peek(c) || 'EOF'}'`);
  c.pos++;
}

function parseValue(c: Cursor): Value {
  skipWhitespace(c);
  const ch = peek(c);
  if (ch === '{') return parseObject(c);
  if (ch === '[') return parseArray(c);
  if (ch === '"' || ch === "'") return parseString(c, ch);
  if (ch === '-' || (ch >= '0' && ch <= '9')) return parseNumber(c);
  if (isIdentStart(ch)) return parseIdentOrHole(c);
  fail(c, `Unexpected character '${ch || 'EOF'}'`);
}

function parseObject(c: Cursor): { [k: string]: Value } {
  consume(c, '{');
  const obj: { [k: string]: Value } = {};
  skipWhitespace(c);
  if (peek(c) === '}') { c.pos++; return obj; }
  for (;;) {
    skipWhitespace(c);
    const k = peek(c);
    if (k !== '"' && k !== "'") fail(c, `Expected string key, found '${k || 'EOF'}'`);
    const key = parseString(c, k);
    skipWhitespace(c);
    consume(c, ':');
    obj[key] = parseValue(c);
    skipWhitespace(c);
    if (peek(c) === ',') { c.pos++; skipWhitespace(c); if (peek(c) === '}') { c.pos++; return obj; } continue; }
    if (peek(c) === '}') { c.pos++; return obj; }
    fail(c, `Expected ',' or '}' in object`);
  }
}

function parseArray(c: Cursor): Value[] {
  consume(c, '[');
  const arr: Value[] = [];
  skipWhitespace(c);
  if (peek(c) === ']') { c.pos++; return arr; }
  for (;;) {
    arr.push(parseValue(c));
    skipWhitespace(c);
    if (peek(c) === ',') { c.pos++; skipWhitespace(c); if (peek(c) === ']') { c.pos++; return arr; } continue; }
    if (peek(c) === ']') { c.pos++; return arr; }
    fail(c, `Expected ',' or ']' in array`);
  }
}

function parseString(c: Cursor, quote: string): string {
  consume(c, quote);
  let out = '';
  while (c.pos < c.src.length) {
    const ch = c.src[c.pos];
    if (ch === quote) { c.pos++; return out; }
    if (ch === '\\') {
      c.pos++;
      const esc = c.src[c.pos++];
      const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '\\': '\\', '"': '"', "'": "'", '/': '/', b: '\b', f: '\f' };
      if (esc in map) { out += map[esc]; continue; }
      if (esc === 'u') {
        const hex = c.src.slice(c.pos, c.pos + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail(c, 'Invalid \\uXXXX escape');
        out += String.fromCharCode(parseInt(hex, 16));
        c.pos += 4;
        continue;
      }
      fail(c, `Invalid escape sequence \\${esc}`);
    }
    if (ch === '\n') fail(c, 'Unterminated string');
    out += ch;
    c.pos++;
  }
  fail(c, 'Unterminated string');
}

function parseNumber(c: Cursor): number {
  const start = c.pos;
  if (peek(c) === '-') c.pos++;
  while (c.pos < c.src.length && /[0-9]/.test(c.src[c.pos])) c.pos++;
  if (peek(c) === '.') { c.pos++; while (c.pos < c.src.length && /[0-9]/.test(c.src[c.pos])) c.pos++; }
  if (peek(c) === 'e' || peek(c) === 'E') {
    c.pos++;
    if (peek(c) === '+' || peek(c) === '-') c.pos++;
    while (c.pos < c.src.length && /[0-9]/.test(c.src[c.pos])) c.pos++;
  }
  const raw = c.src.slice(start, c.pos);
  const n = Number(raw);
  if (!Number.isFinite(n)) fail(c, `Invalid number '${raw}'`);
  return n;
}

function isIdentStart(ch: string): boolean {
  return /[A-Za-z_$]/.test(ch);
}

function isIdentPart(ch: string): boolean {
  return /[A-Za-z0-9_$]/.test(ch);
}

function parseIdentOrHole(c: Cursor): Value {
  const start = c.pos;
  while (c.pos < c.src.length && isIdentPart(c.src[c.pos])) c.pos++;
  const name = c.src.slice(start, c.pos);
  if (name === 'true') return true;
  if (name === 'false') return false;
  if (name === 'null') return null;
  return { $param: name };
}

// ── Hole predicate ─────────────────────────────────────────────────

export function isHole(v: unknown): v is Hole {
  return (
    typeof v === 'object' &&
    v !== null &&
    !Array.isArray(v) &&
    // `v` narrowed to a non-null non-array object above; read its keys /
    // $param field for the Hole shape predicate (internal AST probe).
    Object.keys(v as object).length === 1 &&
    // Same checked-object probe: read $param to test the Hole discriminator.
    typeof (v as { $param?: unknown }).$param === 'string'
  );
}

// ── Format ─────────────────────────────────────────────────────────

export function format(pipeline: PipelineStageWithHoles[]): string {
  // PipelineStageWithHoles[] is structurally a `Value` (array of JSON-AST
  // nodes); widen to the recursion type the formatter walks.
  return formatValue(pipeline as Value, 0);
}

function formatValue(v: Value, indent: number): string {
  if (isHole(v)) return v.$param;
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return JSON.stringify(v);
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    const pad = '  '.repeat(indent + 1);
    const close = '  '.repeat(indent);
    return '[\n' + v.map(x => pad + formatValue(x, indent + 1)).join(',\n') + '\n' + close + ']';
  }
  const entries = Object.entries(v);
  if (entries.length === 0) return '{}';
  const pad = '  '.repeat(indent + 1);
  const close = '  '.repeat(indent);
  return '{\n' + entries
    // Object.entries on a `Value` object yields `unknown` values; each is a
    // `Value` by the AST's recursive shape — narrow for the recursive call.
    .map(([k, val]) => pad + JSON.stringify(k) + ': ' + formatValue(val as Value, indent + 1))
    .join(',\n') + '\n' + close + '}';
}

// ── Validate ───────────────────────────────────────────────────────

export interface ValidationIssue {
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export function validate(
  pipeline: PipelineStageWithHoles[],
  declarations: HyperparamDecl[],
): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Collect $param references (name → list of "where-seen" tags).
  const references = new Map<string, string[]>();
  // PipelineStageWithHoles[] widens to `Value` for the generic AST walker.
  walkHoles(pipeline as Value, '', (hole, path) => {
    const list = references.get(hole.$param) ?? [];
    list.push(path);
    references.set(hole.$param, list);
  });

  // Declaration-name uniqueness.
  const declNames = new Set<string>();
  for (const d of declarations) {
    if (declNames.has(d.name)) {
      errors.push({ severity: 'error', message: `Duplicate hyperparameter name '${d.name}'` });
    }
    declNames.add(d.name);
  }

  // Every $param must be declared.
  for (const [name, paths] of references) {
    if (!declNames.has(name)) {
      errors.push({
        severity: 'error',
        message: `Hole '${name}' at ${paths[0]} has no matching hyperparameter declaration`,
      });
    }
  }

  // Declared but never referenced — legitimate intent, warn only.
  for (const d of declarations) {
    if (!references.has(d.name)) {
      warnings.push({
        severity: 'warning',
        message: `Hyperparameter '${d.name}' is declared but never used`,
      });
    }
  }

  // Path-aware coherence checks (v1: take.n, FilterSelection.tag_expression).
  const declByName = new Map(declarations.map(d => [d.name, d]));
  // PipelineStageWithHoles[] widens to `Value` for the generic AST walker.
  walkHoles(pipeline as Value, '', (hole, path) => {
    const decl = declByName.get(hole.$param);
    if (!decl) return;
    if (path.endsWith('take.n')) {
      if (decl.type !== 'number') {
        errors.push({
          severity: 'error',
          message: `Hole '${hole.$param}' fills a numeric slot at ${path} but is declared type '${decl.type}'`,
        });
      }
    }
    if (path.endsWith('filter.tag_expression')) {
      if (decl.type !== 'string' && decl.type !== 'enum') {
        errors.push({
          severity: 'error',
          message: `Hole '${hole.$param}' fills a tag-expression slot at ${path} but is declared type '${decl.type}'`,
        });
      }
    }
  });

  return { errors, warnings };
}

function walkHoles(v: Value, path: string, visit: (h: Hole, p: string) => void): void {
  if (isHole(v)) { visit(v, path || '$'); return; }
  if (Array.isArray(v)) {
    v.forEach((x, i) => walkHoles(x, `${path}[${i}]`, visit));
    return;
  }
  if (v !== null && typeof v === 'object') {
    // Absorb the discriminator field (stage / type) into the path so a
    // hole at e.g. `take.n` carries the surrounding stage's name and
    // path-aware validation can key off it. Sibling discriminator
    // → ancestor-style path segment.
    // Read the discriminator off the narrowed non-null object (members are
    // `unknown`); `disc` is checked for `string` below before use.
    const disc = (v as Record<string, unknown>).stage ?? (v as Record<string, unknown>).type;
    const segment = typeof disc === 'string' ? disc : '';
    const here = segment ? (path ? `${path}.${segment}` : segment) : path;
    for (const [k, val] of Object.entries(v)) {
      if ((k === 'stage' || k === 'type') && typeof val === 'string') continue;
      // Each entry value is a `Value` by the AST's recursive shape.
      walkHoles(val as Value, here ? `${here}.${k}` : k, visit);
    }
  }
}

// ── Substitute ─────────────────────────────────────────────────────

export class UnboundHoleError extends Error {
  paramName: string;
  constructor(paramName: string) {
    super(`Hyperparameter '${paramName}' has no value bound at pipeline-run time`);
    this.paramName = paramName;
  }
}

export function substitute(
  pipeline: PipelineStageWithHoles[],
  values: Record<string, number | string | boolean>,
): PipelineStage[] {
  // Widen each holey stage to `Value` for substitution, then re-narrow the
  // hole-free result to PipelineStage[]: substituteValue resolves every Hole
  // to a scalar, so the output carries no holes by construction (the
  // PipelineStageWithHoles → PipelineStage contract this fn discharges).
  return (pipeline as Value[]).map(stage => substituteValue(stage, values)) as PipelineStage[];
}

function substituteValue(v: Value, values: Record<string, number | string | boolean>): Value {
  if (isHole(v)) {
    if (!(v.$param in values)) throw new UnboundHoleError(v.$param);
    return values[v.$param];
  }
  if (Array.isArray(v)) return v.map(x => substituteValue(x, values));
  if (v !== null && typeof v === 'object') {
    const out: { [k: string]: Value } = {};
    // Each entry value is a `Value` by the AST's recursive shape.
    for (const [k, val] of Object.entries(v)) out[k] = substituteValue(val as Value, values);
    return out;
  }
  return v;
}

// Convenience: a deck has holes iff at least one $param appears.
export function hasHoles(pipeline: PipelineStageWithHoles[]): boolean {
  let found = false;
  // PipelineStageWithHoles[] widens to `Value` for the generic AST walker.
  walkHoles(pipeline as Value, '', () => { found = true; });
  return found;
}
