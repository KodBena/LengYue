/**
 * tests/unit/lib/dsl-harness.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/lib/dsl-harness.ts`. The harness
 * is the parse / validate / substitute engine for deck-pipeline
 * hyperparameters; this file pins its behaviour at the four
 * boundaries (parse, format, validate, substitute) plus the
 * round-trip property on the parse∘format pair.
 *
 * No DOM, no fakes, no Vue reactivity. Inputs are source strings or
 * holey ASTs; outputs are inspected directly.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import {
  parse,
  format,
  validate,
  substitute,
  hasHoles,
  isHole,
  UnboundHoleError,
} from '../../../src/lib/dsl-harness';
import type { HyperparamDecl, PipelineStageWithHoles } from '../../../src/types';

describe('parse — JSON-strict subset', () => {
  it('parses an empty pipeline', () => {
    const r = parse('[]');
    expect(r.errors).toEqual([]);
    expect(r.value).toEqual([]);
  });

  it('parses a literal pipeline (no holes)', () => {
    const r = parse(`[
      { "stage": "select", "selection": { "type": "DescendantSelection" } },
      { "stage": "take", "n": 20 },
      { "stage": "shuffle" }
    ]`);
    expect(r.errors).toEqual([]);
    expect(r.value).toHaveLength(3);
    expect(r.value![1]).toEqual({ stage: 'take', n: 20 });
  });

  it('parses numbers with sign, decimal, exponent', () => {
    const r = parse('[{ "stage": "take", "n": -1.5e2 }]');
    expect(r.errors).toEqual([]);
    expect((r.value![0] as { n: number }).n).toBe(-150);
  });

  it('parses true / false / null as keywords, not holes', () => {
    const r = parse('[{ "stage": "shuffle", "a": true, "b": false, "c": null }]');
    expect(r.errors).toEqual([]);
    const stage = r.value![0] as Record<string, unknown>;
    expect(stage.a).toBe(true);
    expect(stage.b).toBe(false);
    expect(stage.c).toBe(null);
  });
});

describe('parse — JSON5 ergonomics', () => {
  it('admits trailing commas in objects and arrays', () => {
    const r = parse('[{ "stage": "take", "n": 20, },]');
    expect(r.errors).toEqual([]);
    expect(r.value).toHaveLength(1);
  });

  it('admits single-quoted strings', () => {
    const r = parse("[{ 'stage': 'take', 'n': 20 }]");
    expect(r.errors).toEqual([]);
    expect(r.value![0]).toEqual({ stage: 'take', n: 20 });
  });
});

describe('parse — bare identifiers as holes', () => {
  it('parses a bare identifier in value position as a hole', () => {
    const r = parse('[{ "stage": "take", "n": deck_size }]');
    expect(r.errors).toEqual([]);
    const n = (r.value![0] as { n: unknown }).n;
    expect(isHole(n)).toBe(true);
    expect((n as { $param: string }).$param).toBe('deck_size');
  });

  it('supports identifiers with digits and underscores after first char', () => {
    const r = parse('[{ "stage": "take", "n": my_param_2 }]');
    expect(r.errors).toEqual([]);
    expect(((r.value![0] as { n: { $param: string } }).n).$param).toBe('my_param_2');
  });

  it('rejects bare identifiers in key position', () => {
    const r = parse('[{ stage: "take" }]');
    expect(r.value).toBeNull();
    expect(r.errors).toHaveLength(1);
  });
});

describe('parse — error surface', () => {
  it('reports top-level non-array', () => {
    const r = parse('{ "stage": "shuffle" }');
    expect(r.value).toBeNull();
    expect(r.errors[0].message).toMatch(/array/i);
  });

  it('reports unterminated string', () => {
    const r = parse('[{ "stage": "tak');
    expect(r.value).toBeNull();
    expect(r.errors).toHaveLength(1);
  });

  it('reports unexpected trailing content', () => {
    const r = parse('[] {}');
    expect(r.value).toBeNull();
    expect(r.errors[0].message).toMatch(/trailing/i);
  });

  it('attaches line and column to errors', () => {
    const r = parse('[\n  ,\n]');
    expect(r.value).toBeNull();
    expect(r.errors[0].line).toBeGreaterThanOrEqual(1);
    expect(r.errors[0].column).toBeGreaterThanOrEqual(1);
  });
});

describe('format', () => {
  it('emits an empty pipeline compactly', () => {
    expect(format([])).toBe('[]');
  });

  it('emits holes as bare identifiers', () => {
    const ast: PipelineStageWithHoles[] = [
      { stage: 'take', n: { $param: 'deck_size' } } as PipelineStageWithHoles,
    ];
    const out = format(ast);
    expect(out).toContain('deck_size');
    expect(out).not.toContain('"deck_size"');
    expect(out).not.toContain('$param');
  });

  it('round-trips parse∘format on a literal pipeline', () => {
    const src = `[
  {
    "stage": "select",
    "selection": {
      "type": "DescendantSelection"
    }
  },
  {
    "stage": "take",
    "n": 20
  },
  {
    "stage": "shuffle"
  }
]`;
    const ast = parse(src).value!;
    expect(format(ast)).toBe(src);
  });

  it('round-trips parse∘format on a holey pipeline', () => {
    const src = `[
  {
    "stage": "take",
    "n": deck_size
  }
]`;
    const ast = parse(src).value!;
    expect(format(ast)).toBe(src);
  });
});

describe('validate', () => {
  const numDecl = (name: string): HyperparamDecl => ({ name, type: 'number', default: 10 });
  const strDecl = (name: string): HyperparamDecl => ({ name, type: 'string', default: '' });

  it('passes a hole-free pipeline with empty declarations', () => {
    const ast = parse('[{ "stage": "shuffle" }]').value!;
    const r = validate(ast, []);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('errors on undeclared $param', () => {
    const ast = parse('[{ "stage": "take", "n": deck_size }]').value!;
    const r = validate(ast, []);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0].message).toMatch(/deck_size/);
  });

  it('warns on declared-but-unused hyperparameter', () => {
    const ast = parse('[{ "stage": "shuffle" }]').value!;
    const r = validate(ast, [numDecl('unused')]);
    expect(r.errors).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0].message).toMatch(/unused/);
  });

  it('errors on duplicate declaration names', () => {
    const ast = parse('[]').value!;
    const r = validate(ast, [numDecl('x'), numDecl('x')]);
    expect(r.errors.some(e => /Duplicate/.test(e.message))).toBe(true);
  });

  it('errors when take.n is filled by a non-number decl', () => {
    const ast = parse('[{ "stage": "take", "n": deck_size }]').value!;
    const r = validate(ast, [strDecl('deck_size')]);
    expect(r.errors.some(e => /numeric slot/.test(e.message))).toBe(true);
  });

  it('errors when tag_expression is filled by a number decl', () => {
    const ast = parse(`[
      { "stage": "select",
        "selection": { "type": "filter", "tag_expression": my_filter, "base": { "type": "DescendantSelection" } } }
    ]`).value!;
    const r = validate(ast, [numDecl('my_filter')]);
    expect(r.errors.some(e => /tag-expression slot/.test(e.message))).toBe(true);
  });

  it('accepts an enum decl in a tag_expression slot', () => {
    const ast = parse(`[
      { "stage": "select",
        "selection": { "type": "filter", "tag_expression": my_filter, "base": { "type": "DescendantSelection" } } }
    ]`).value!;
    const r = validate(ast, [{ name: 'my_filter', type: 'enum', default: 'a', options: ['a', 'b'] }]);
    expect(r.errors).toEqual([]);
  });
});

describe('substitute', () => {
  it('returns a hole-free pipeline unchanged in shape', () => {
    const ast = parse('[{ "stage": "take", "n": 20 }]').value!;
    const out = substitute(ast, {});
    expect(out).toEqual([{ stage: 'take', n: 20 }]);
  });

  it('replaces a single hole with the bound value', () => {
    const ast = parse('[{ "stage": "take", "n": deck_size }]').value!;
    const out = substitute(ast, { deck_size: 50 });
    expect(out).toEqual([{ stage: 'take', n: 50 }]);
  });

  it('replaces nested holes', () => {
    const ast = parse(`[
      { "stage": "select",
        "selection": { "type": "filter", "tag_expression": filter_str, "base": { "type": "DescendantSelection" } } },
      { "stage": "take", "n": deck_size }
    ]`).value!;
    const out = substitute(ast, { filter_str: 'opening', deck_size: 30 });
    expect(out).toEqual([
      { stage: 'select', selection: { type: 'filter', tag_expression: 'opening', base: { type: 'DescendantSelection' } } },
      { stage: 'take', n: 30 },
    ]);
  });

  it('throws UnboundHoleError on a missing binding', () => {
    const ast = parse('[{ "stage": "take", "n": deck_size }]').value!;
    expect(() => substitute(ast, {})).toThrow(UnboundHoleError);
  });

  it('UnboundHoleError carries the unbound name', () => {
    const ast = parse('[{ "stage": "take", "n": deck_size }]').value!;
    try {
      substitute(ast, {});
    } catch (err) {
      expect(err).toBeInstanceOf(UnboundHoleError);
      expect((err as UnboundHoleError).paramName).toBe('deck_size');
    }
  });
});

describe('hasHoles', () => {
  it('returns false on a hole-free pipeline', () => {
    const ast = parse('[{ "stage": "shuffle" }]').value!;
    expect(hasHoles(ast)).toBe(false);
  });

  it('returns true when any leaf is a hole', () => {
    const ast = parse('[{ "stage": "take", "n": deck_size }]').value!;
    expect(hasHoles(ast)).toBe(true);
  });
});
