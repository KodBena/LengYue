/**
 * tests/unit/lib/knobs.test.ts
 *
 * Tier-1 (pure-logic) tests for `src/lib/knobs.ts` — the substrate
 * primitives of the knob-registry arc. Phase 1 deliverables under test:
 *
 *   - Path-walk accessors: `readKnob` / `writeKnob` against a passed-in
 *     reactive (or plain) root, including the ADR-0002 failure surface
 *     (missing intermediate, missing leaf, non-numeric leaf, non-finite
 *     write).
 *   - Vue-reactivity round-trip: a `computed` reading via `readKnob`
 *     re-evaluates after `writeKnob` mutates the leaf.
 *   - Named-transform library: identity, linear, lockstep-hue-rotate,
 *     fixed-luminance-arc — exercised over representative inputs plus
 *     the dimension-mismatch failure modes.
 *   - Startup-time `validateRegistry`: vacuous on the empty registry
 *     (Phase 1's seeded shape); throws on stale paths, dimension
 *     mismatches, bad ranges, and id/key disagreement.
 *
 * No DOM, no fakes, no Vue component lifecycle. The reactivity test
 * uses `reactive` / `computed` directly to verify the substrate is
 * transparent to Vue's tracking pathway.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import { computed, reactive } from 'vue';
import {
  readKnob,
  writeKnob,
  applyTransform,
  validateRegistry,
} from '../../../src/lib/knobs';
import type {
  KnobDecl,
  KnobId,
  KnobRegistry,
  KnobTransform,
} from '../../../src/types';

// ── Helpers ────────────────────────────────────────────────────────

function asKnobId(s: string): KnobId {
  return s as unknown as KnobId;
}

function decl(partial: {
  id: string;
  inputs?: ReadonlyArray<{ range: readonly [number, number] }>;
  outputs: ReadonlyArray<{ path: string }>;
  transform?: KnobTransform;
}): KnobDecl {
  return {
    id: asKnobId(partial.id),
    domain: 'experimental',
    inputs: partial.inputs ?? [{ range: [0, 1] as const }],
    outputs: partial.outputs,
    transform: partial.transform,
  };
}

// ── readKnob ──────────────────────────────────────────────────────

describe('readKnob', () => {
  it('reads a finite numeric leaf at a nested path', () => {
    const root = { a: { b: { c: 0.42 } } };
    expect(readKnob(root, 'a.b.c')).toBe(0.42);
  });

  it('reads a top-level numeric leaf', () => {
    const root = { x: 7 };
    expect(readKnob(root, 'x')).toBe(7);
  });

  it('throws when an intermediate segment is missing', () => {
    const root = { a: {} };
    expect(() => readKnob(root, 'a.b.c')).toThrow(/segment "b" is missing/);
  });

  it('throws when an intermediate segment is not an object', () => {
    const root = { a: { b: 5 } };
    expect(() => readKnob(root, 'a.b.c')).toThrow(/is not an object/);
  });

  it('throws when the leaf is not a number', () => {
    const root = { a: { b: 'string-leaf' } };
    expect(() => readKnob(root, 'a.b')).toThrow(/non-numeric or non-finite/);
  });

  it('throws when the leaf is NaN or Infinity', () => {
    expect(() => readKnob({ x: Number.NaN }, 'x')).toThrow(/non-finite/);
    expect(() => readKnob({ x: Number.POSITIVE_INFINITY }, 'x')).toThrow(/non-finite/);
  });

  it('throws on empty / malformed paths', () => {
    expect(() => readKnob({}, '')).toThrow(/path is empty/);
    expect(() => readKnob({}, 'a..b')).toThrow(/empty segment/);
    expect(() => readKnob({}, '.a')).toThrow(/empty segment/);
  });
});

// ── writeKnob ─────────────────────────────────────────────────────

describe('writeKnob', () => {
  it('writes a finite value to an existing numeric leaf', () => {
    const root = { a: { b: 1 } };
    writeKnob(root, 'a.b', 99);
    expect(root.a.b).toBe(99);
  });

  it('refuses to extend a parent that does not declare the leaf', () => {
    const root = { a: { b: 1 } };
    expect(() => writeKnob(root, 'a.c', 5)).toThrow(/does not exist/);
  });

  it('refuses non-finite writes', () => {
    const root = { x: 0 };
    expect(() => writeKnob(root, 'x', Number.NaN)).toThrow(/non-finite/);
    expect(() => writeKnob(root, 'x', Number.NEGATIVE_INFINITY)).toThrow(/non-finite/);
  });

  it('round-trips through Vue reactivity', () => {
    const root = reactive({ a: { b: 1 } });
    const c = computed(() => readKnob(root, 'a.b') * 2);
    expect(c.value).toBe(2);
    writeKnob(root, 'a.b', 7);
    // Vue computeds are lazy but eagerly invalidate; reading `.value`
    // settles them. If `writeKnob` weren't reactivity-transparent,
    // the cached value would survive — the assertion would fail.
    expect(c.value).toBe(14);
  });
});

// ── applyTransform — identity ─────────────────────────────────────

describe('applyTransform identity', () => {
  it('returns a copy of the input vector', () => {
    const input = [1, 2, 3];
    const out = applyTransform({ kind: 'identity' }, input);
    expect(out).toEqual([1, 2, 3]);
    expect(out).not.toBe(input);
  });

  it('handles the scalar (N=1) case', () => {
    expect(applyTransform({ kind: 'identity' }, [0.5])).toEqual([0.5]);
  });
});

// ── applyTransform — linear ───────────────────────────────────────

describe('applyTransform linear', () => {
  it('K=N identity matrix returns the input', () => {
    const transform: KnobTransform = {
      kind: 'linear',
      coefficients: [
        [1, 0],
        [0, 1],
      ],
    };
    expect(applyTransform(transform, [3, 4])).toEqual([3, 4]);
  });

  it('K=2, N=3 projects R^3 → R^2', () => {
    const transform: KnobTransform = {
      kind: 'linear',
      coefficients: [
        [1, 2, 0],
        [0, 1, -1],
      ],
    };
    expect(applyTransform(transform, [1, 1, 1])).toEqual([3, 0]);
  });

  it('throws on input/coefficients dimension mismatch', () => {
    const transform: KnobTransform = {
      kind: 'linear',
      coefficients: [[1, 0]],
    };
    expect(() => applyTransform(transform, [1, 2, 3])).toThrow(/does not match/);
  });

  it('throws on a ragged coefficient matrix', () => {
    const transform: KnobTransform = {
      kind: 'linear',
      coefficients: [
        [1, 0],
        [0, 1, 1],
      ],
    };
    expect(() => applyTransform(transform, [1, 1])).toThrow(/rectangular/);
  });
});

// ── applyTransform — lockstep-hue-rotate ──────────────────────────

describe('applyTransform lockstep-hue-rotate', () => {
  it('rotates every anchor by the scalar offset', () => {
    const transform: KnobTransform = {
      kind: 'lockstep-hue-rotate',
      anchors: [0, 90, 180, 270],
    };
    expect(applyTransform(transform, [45])).toEqual([45, 135, 225, 315]);
  });

  it('wraps modulo 360 across the boundary', () => {
    const transform: KnobTransform = {
      kind: 'lockstep-hue-rotate',
      anchors: [350],
    };
    expect(applyTransform(transform, [20])).toEqual([10]);
  });

  it('normalises negative offsets to the positive [0, 360) range', () => {
    const transform: KnobTransform = {
      kind: 'lockstep-hue-rotate',
      anchors: [10],
    };
    expect(applyTransform(transform, [-30])).toEqual([340]);
  });

  it('throws on non-scalar input', () => {
    const transform: KnobTransform = {
      kind: 'lockstep-hue-rotate',
      anchors: [0],
    };
    expect(() => applyTransform(transform, [0, 0])).toThrow(/1-D rotation offset/);
  });
});

// ── applyTransform — fixed-luminance-arc ──────────────────────────

describe('applyTransform fixed-luminance-arc', () => {
  it('returns the first waypoint at t=0', () => {
    const transform: KnobTransform = {
      kind: 'fixed-luminance-arc',
      waypoints: [
        [10, 20, 30],
        [40, 50, 60],
        [70, 80, 90],
      ],
    };
    expect(applyTransform(transform, [0])).toEqual([10, 20, 30]);
  });

  it('returns the last waypoint at t=1', () => {
    const transform: KnobTransform = {
      kind: 'fixed-luminance-arc',
      waypoints: [
        [10, 20],
        [40, 50],
        [70, 80],
      ],
    };
    expect(applyTransform(transform, [1])).toEqual([70, 80]);
  });

  it('interpolates linearly between waypoints', () => {
    const transform: KnobTransform = {
      kind: 'fixed-luminance-arc',
      waypoints: [
        [0, 0],
        [10, 100],
      ],
    };
    const out = applyTransform(transform, [0.25]);
    expect(out[0]).toBeCloseTo(2.5, 10);
    expect(out[1]).toBeCloseTo(25, 10);
  });

  it('lands the midpoint of three waypoints at t=0.5', () => {
    const transform: KnobTransform = {
      kind: 'fixed-luminance-arc',
      waypoints: [
        [0],
        [10],
        [100],
      ],
    };
    expect(applyTransform(transform, [0.5])).toEqual([10]);
  });

  it('clamps inputs outside [0, 1] to the boundary', () => {
    const transform: KnobTransform = {
      kind: 'fixed-luminance-arc',
      waypoints: [
        [0],
        [100],
      ],
    };
    expect(applyTransform(transform, [-1])).toEqual([0]);
    expect(applyTransform(transform, [2])).toEqual([100]);
  });

  it('throws on fewer than two waypoints', () => {
    const transform: KnobTransform = {
      kind: 'fixed-luminance-arc',
      waypoints: [[0]],
    };
    expect(() => applyTransform(transform, [0.5])).toThrow(/at least 2 waypoints/);
  });

  it('throws on inconsistent waypoint dimensions', () => {
    const transform: KnobTransform = {
      kind: 'fixed-luminance-arc',
      waypoints: [
        [0, 0],
        [1, 1, 1],
      ],
    };
    expect(() => applyTransform(transform, [0.5])).toThrow(/dimension/);
  });

  it('throws on non-scalar input', () => {
    const transform: KnobTransform = {
      kind: 'fixed-luminance-arc',
      waypoints: [[0], [1]],
    };
    expect(() => applyTransform(transform, [0.5, 0.5])).toThrow(/1-D arc position/);
  });
});

// ── validateRegistry ──────────────────────────────────────────────

describe('validateRegistry', () => {
  it('is a no-op on the empty registry (Phase 1 seeded shape)', () => {
    const empty: KnobRegistry = {};
    expect(() => validateRegistry({}, empty)).not.toThrow();
  });

  it('passes a well-formed identity-transform KnobDecl', () => {
    const root = { ui: { brightness: 0.5 } };
    const registry: KnobRegistry = {
      brightness: decl({
        id: 'brightness',
        outputs: [{ path: 'ui.brightness' }],
      }),
    };
    expect(() => validateRegistry(root, registry)).not.toThrow();
  });

  it('throws when an output path is missing on the root', () => {
    const root = { ui: {} };
    const registry: KnobRegistry = {
      brightness: decl({
        id: 'brightness',
        outputs: [{ path: 'ui.brightness' }],
      }),
    };
    expect(() => validateRegistry(root, registry)).toThrow(
      /knob "brightness" output\[0\] path "ui\.brightness" failed to resolve/,
    );
  });

  it('throws on identity transform when N !== K', () => {
    const root = { a: 1, b: 2, c: 3 };
    const registry: KnobRegistry = {
      bad: decl({
        id: 'bad',
        inputs: [{ range: [0, 1] as const }],
        outputs: [{ path: 'a' }, { path: 'b' }],
      }),
    };
    expect(() => validateRegistry(root, registry)).toThrow(
      /identity transform requires inputs\.length \(1\) === outputs\.length \(2\)/,
    );
  });

  it('throws on linear transform dimension mismatch', () => {
    const root = { a: 1, b: 2 };
    const registry: KnobRegistry = {
      bad: decl({
        id: 'bad',
        inputs: [{ range: [0, 1] as const }, { range: [0, 1] as const }],
        outputs: [{ path: 'a' }, { path: 'b' }],
        transform: {
          kind: 'linear',
          coefficients: [[1]],
        },
      }),
    };
    expect(() => validateRegistry(root, registry)).toThrow(
      /linear transform has 1 coefficient rows; expected outputs\.length \(2\)/,
    );
  });

  it('throws on lockstep-hue-rotate with non-scalar input', () => {
    const root = { a: 0, b: 0 };
    const registry: KnobRegistry = {
      bad: decl({
        id: 'bad',
        inputs: [{ range: [0, 1] as const }, { range: [0, 1] as const }],
        outputs: [{ path: 'a' }, { path: 'b' }],
        transform: {
          kind: 'lockstep-hue-rotate',
          anchors: [0, 90],
        },
      }),
    };
    expect(() => validateRegistry(root, registry)).toThrow(
      /lockstep-hue-rotate transform requires a 1-D input/,
    );
  });

  it('throws on lockstep-hue-rotate when anchors.length !== outputs.length', () => {
    const root = { a: 0, b: 0 };
    const registry: KnobRegistry = {
      bad: decl({
        id: 'bad',
        inputs: [{ range: [0, 360] as const }],
        outputs: [{ path: 'a' }, { path: 'b' }],
        transform: {
          kind: 'lockstep-hue-rotate',
          anchors: [0, 90, 180],
        },
      }),
    };
    expect(() => validateRegistry(root, registry)).toThrow(
      /3 anchors; expected outputs\.length \(2\)/,
    );
  });

  it('throws on fixed-luminance-arc with < 2 waypoints', () => {
    const root = { a: 0 };
    const registry: KnobRegistry = {
      bad: decl({
        id: 'bad',
        inputs: [{ range: [0, 1] as const }],
        outputs: [{ path: 'a' }],
        transform: {
          kind: 'fixed-luminance-arc',
          waypoints: [[0]],
        },
      }),
    };
    expect(() => validateRegistry(root, registry)).toThrow(/≥ 2 waypoints/);
  });

  it('throws on bad input range (lo >= hi)', () => {
    const root = { a: 0 };
    const registry: KnobRegistry = {
      bad: decl({
        id: 'bad',
        inputs: [{ range: [1, 0] as const }],
        outputs: [{ path: 'a' }],
      }),
    };
    expect(() => validateRegistry(root, registry)).toThrow(
      /input\[0\] has invalid range/,
    );
  });

  it('throws on key/id disagreement', () => {
    const root = { a: 0 };
    const registry: KnobRegistry = {
      keyA: decl({
        id: 'idB',
        outputs: [{ path: 'a' }],
      }),
    };
    expect(() => validateRegistry(root, registry)).toThrow(
      /entry keyed "keyA" carries id "idB"/,
    );
  });

  it('throws on zero-input or zero-output decls', () => {
    const root = { a: 0 };
    const zeroInputs: KnobRegistry = {
      zi: {
        id: asKnobId('zi'),
        domain: 'experimental',
        inputs: [],
        outputs: [{ path: 'a' }],
      },
    };
    expect(() => validateRegistry(root, zeroInputs)).toThrow(
      /zero input dimensions/,
    );

    const zeroOutputs: KnobRegistry = {
      zo: {
        id: asKnobId('zo'),
        domain: 'experimental',
        inputs: [{ range: [0, 1] as const }],
        outputs: [],
      },
    };
    expect(() => validateRegistry(root, zeroOutputs)).toThrow(
      /zero output paths/,
    );
  });
});
