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

import { describe, it, expect, beforeEach } from 'vitest';
import { computed, reactive } from 'vue';
import {
  readKnob,
  writeKnob,
  applyTransform,
  validateRegistry,
  claimKnob,
  releaseKnob,
  currentClaim,
  onClaimChange,
  writeKnobValue,
  _resetClaimStateForTests,
} from '../../../src/lib/knobs';
import type {
  ClaimChangeEvent,
  ConsumerClaim,
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
  inputs?: ReadonlyArray<{ range: readonly [number, number]; maxFromKnob?: KnobId; minFloor?: number }>;
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

  // ── maxFromKnob cross-knob constraint (added 2026-05-15) ────────
  // The substrate's optional `KnobInputDecl.maxFromKnob` declares
  // that this knob's effective max bound is read from another
  // knob's stored value reactively. validateRegistry checks the
  // reference resolves at startup so a dangling link doesn't
  // silently fall back to the static max at runtime.

  it('passes when maxFromKnob references a registered knob', () => {
    const root = { a: 0.1, b: 0.05 };
    const registry: KnobRegistry = {
      cadence: decl({
        id: 'cadence',
        outputs: [{ path: 'a' }],
      }),
      first: decl({
        id: 'first',
        inputs: [{ range: [0.01, 4.0] as const, maxFromKnob: asKnobId('cadence') }],
        outputs: [{ path: 'b' }],
      }),
    };
    expect(() => validateRegistry(root, registry)).not.toThrow();
  });

  it('throws when maxFromKnob references a knob that does not exist', () => {
    const root = { a: 0.05 };
    const registry: KnobRegistry = {
      first: decl({
        id: 'first',
        inputs: [{ range: [0.01, 4.0] as const, maxFromKnob: asKnobId('nonexistent') }],
        outputs: [{ path: 'a' }],
      }),
    };
    expect(() => validateRegistry(root, registry)).toThrow(
      /maxFromKnob="nonexistent" but no KnobDecl is registered/,
    );
  });

  it('throws when maxFromKnob references a knob with no output path', () => {
    const root = { a: 0.05 };
    const orphan: KnobDecl = {
      id: asKnobId('orphan'),
      domain: 'experimental',
      inputs: [{ range: [0, 1] as const }],
      outputs: [],
    };
    const first = decl({
      id: 'first',
      inputs: [{ range: [0.01, 4.0] as const, maxFromKnob: asKnobId('orphan') }],
      outputs: [{ path: 'a' }],
    });
    const registry: KnobRegistry = { orphan, first };
    // The orphan itself triggers the zero-outputs check first
    // (iteration order over Object.entries is insertion order for
    // string keys). Test asserts on the maxFromKnob target check
    // by ordering `first` ahead of the orphan in the registry:
    const registryFirstOrder: KnobRegistry = { first, orphan };
    expect(() => validateRegistry(root, registryFirstOrder)).toThrow(
      /maxFromKnob="orphan" but that knob has no output path/,
    );
  });

  // ── minFloor absolute lower bound (added 2026-05-15) ────────────
  // The substrate's optional `KnobInputDecl.minFloor` declares an
  // external-constraint-induced lower bound (distinct from the
  // knob's intrinsic `range[0]`). validateRegistry checks the floor
  // is a finite number and (when paired with a static range) does
  // not exceed `range[1]` — an incoherent declaration is a startup-
  // time loud failure per ADR-0002. Worked-example use case: the
  // KataGo first-report-after floor (`limits.ts`) workaround for an
  // upstream cliff at ~25 ms.

  it('passes when minFloor is a finite number within the static range', () => {
    const root = { a: 0.05 };
    const registry: KnobRegistry = {
      first: decl({
        id: 'first',
        inputs: [{ range: [0.01, 4.0] as const, minFloor: 0.035 }],
        outputs: [{ path: 'a' }],
      }),
    };
    expect(() => validateRegistry(root, registry)).not.toThrow();
  });

  it('passes when minFloor equals range[0] (degenerate but coherent)', () => {
    const root = { a: 0.05 };
    const registry: KnobRegistry = {
      first: decl({
        id: 'first',
        inputs: [{ range: [0.01, 4.0] as const, minFloor: 0.01 }],
        outputs: [{ path: 'a' }],
      }),
    };
    expect(() => validateRegistry(root, registry)).not.toThrow();
  });

  it('throws when minFloor is NaN', () => {
    const root = { a: 0.05 };
    const registry: KnobRegistry = {
      first: decl({
        id: 'first',
        inputs: [{ range: [0.01, 4.0] as const, minFloor: Number.NaN }],
        outputs: [{ path: 'a' }],
      }),
    };
    expect(() => validateRegistry(root, registry)).toThrow(
      /minFloor=NaN which is not a finite number/,
    );
  });

  it('throws when minFloor is Infinity', () => {
    const root = { a: 0.05 };
    const registry: KnobRegistry = {
      first: decl({
        id: 'first',
        inputs: [{ range: [0.01, 4.0] as const, minFloor: Number.POSITIVE_INFINITY }],
        outputs: [{ path: 'a' }],
      }),
    };
    expect(() => validateRegistry(root, registry)).toThrow(
      /minFloor=Infinity which is not a finite number/,
    );
  });

  it('throws when minFloor exceeds the static range upper bound', () => {
    const root = { a: 0.05 };
    const registry: KnobRegistry = {
      first: decl({
        id: 'first',
        inputs: [{ range: [0.01, 4.0] as const, minFloor: 5.0 }],
        outputs: [{ path: 'a' }],
      }),
    };
    expect(() => validateRegistry(root, registry)).toThrow(
      /minFloor=5 above the static range upper bound 4/,
    );
  });

  it('passes when minFloor is paired with maxFromKnob (no interaction)', () => {
    const root = { a: 0.2, b: 0.05 };
    const registry: KnobRegistry = {
      cadence: decl({
        id: 'cadence',
        outputs: [{ path: 'a' }],
      }),
      first: decl({
        id: 'first',
        inputs: [{
          range: [0.01, 4.0] as const,
          maxFromKnob: asKnobId('cadence'),
          minFloor: 0.035,
        }],
        outputs: [{ path: 'b' }],
      }),
    };
    expect(() => validateRegistry(root, registry)).not.toThrow();
  });

  // ── Path-prefix allowlist (axis 4; PR #410 out-of-frame gate, finding 3).
  // The knob substrate is a data-driven writer over ANY finite-numeric leaf
  // its decls resolve to; path-resolvability alone (axis 1) does not bound
  // which store subtree a decl may write. `allowedPathPrefixes` closes the
  // class: an out-of-prefix output path is a loud validation failure. The
  // production caller (useAppBootstrap) passes ['profile.', 'session.ui.'] —
  // the subtrees the profile-owner knob seam is sanctioned to drive.
  describe('path-prefix allowlist (allowedPathPrefixes)', () => {
    const ALLOWED = ['profile.', 'session.ui.'] as const;

    it('is unrestricted when no allowlist is supplied (substrate stays domain-agnostic)', () => {
      // A bare `engine.*`-shaped path resolves and passes WITHOUT the allowlist —
      // the substrate itself imposes no subtree restriction.
      const root = { engine: { something: 0.5 } };
      const registry: KnobRegistry = {
        'engine.something': decl({ id: 'engine.something', outputs: [{ path: 'engine.something' }] }),
      };
      expect(() => validateRegistry(root, registry)).not.toThrow();
    });

    it('refuses a decl targeting a store subtree outside the allowlist (a bare engine.* leaf)', () => {
      const root = {
        engine: { something: 0.5 },
        profile: { settings: { x: 0 } },
        session: { ui: {} },
      };
      const registry: KnobRegistry = {
        'engine.something': decl({ id: 'engine.something', outputs: [{ path: 'engine.something' }] }),
      };
      expect(() => validateRegistry(root, registry, ALLOWED)).toThrow(
        /knob "engine\.something" output\[0\] path "engine\.something" targets a store subtree the knob substrate is not permitted to write/,
      );
    });

    it('passes the two seeded session.ui.* decls (and the profile.* family) under the allowlist', () => {
      // Mirrors the production seeded shape: every output path begins with
      // `profile.` or `session.ui.`. The two session.ui decls are
      // move-filter-threshold and pv-fade-ms (src/store/defaults.ts).
      const root = {
        profile: { settings: { appearance: { ownershipOpacityCeiling: 0.5 }, engine: { katago: { watchdogAnimationMs: 800 } } } },
        session: { ui: { moveFilterThreshold: 0.3, pvAnimation: { fadeDurationMs: 200 } } },
      };
      const registry: KnobRegistry = {
        'display.move-filter-threshold': decl({
          id: 'display.move-filter-threshold',
          outputs: [{ path: 'session.ui.moveFilterThreshold' }],
        }),
        'display.pv-fade-ms': decl({
          id: 'display.pv-fade-ms',
          outputs: [{ path: 'session.ui.pvAnimation.fadeDurationMs' }],
        }),
        'display.ownership-opacity-ceiling': decl({
          id: 'display.ownership-opacity-ceiling',
          outputs: [{ path: 'profile.settings.appearance.ownershipOpacityCeiling' }],
        }),
        'engine.watchdog-animation-ms': decl({
          id: 'engine.watchdog-animation-ms',
          // NB: this is `profile.settings.engine.katago.*` — a profile.* path,
          // NOT a bare engine.* one. It correctly passes the allowlist.
          outputs: [{ path: 'profile.settings.engine.katago.watchdogAnimationMs' }],
        }),
      };
      expect(() => validateRegistry(root, registry, ALLOWED)).not.toThrow();
    });

    it('checks the prefix before resolvability (the crisper reason wins)', () => {
      // The offending path does not even exist on the root; the allowlist
      // failure surfaces first, naming the subtree violation rather than a
      // downstream resolve error.
      const root = { profile: { settings: {} }, session: { ui: {} } };
      const registry: KnobRegistry = {
        'boards.count': decl({ id: 'boards.count', outputs: [{ path: 'boards.count' }] }),
      };
      expect(() => validateRegistry(root, registry, ALLOWED)).toThrow(
        /targets a store subtree the knob substrate is not permitted to write/,
      );
    });
  });
});

// ── Phase 2 — claim state machine ─────────────────────────────────

function claim(consumerId: string, policy: 'hard' | 'soft', reason?: string): ConsumerClaim {
  return { consumerId, policy, ...(reason ? { reason } : {}) };
}

describe('claimKnob / releaseKnob / currentClaim', () => {
  beforeEach(() => {
    _resetClaimStateForTests();
  });

  it('starts unclaimed', () => {
    expect(currentClaim(asKnobId('k1'))).toBeNull();
  });

  it('acquires an unclaimed knob and surfaces the holder', () => {
    const k = asKnobId('k1');
    const c = claim('qeubo', 'hard', 'experiment-x');
    const result = claimKnob(k, c);
    expect(result).toEqual({ kind: 'acquired' });
    expect(currentClaim(k)).toEqual(c);
  });

  it('rejects a conflicting claim and names the existing holder', () => {
    const k = asKnobId('k1');
    const first = claim('qeubo', 'hard');
    const second = claim('autonomous-sr', 'soft');
    claimKnob(k, first);
    const result = claimKnob(k, second);
    expect(result).toEqual({
      kind: 'rejected',
      reason: 'already-claimed',
      holder: first,
    });
    expect(currentClaim(k)).toEqual(first);
  });

  it('accepts a re-claim by the same consumer (idempotent acquire)', () => {
    const k = asKnobId('k1');
    const c = claim('qeubo', 'hard');
    claimKnob(k, c);
    const result = claimKnob(k, c);
    expect(result).toEqual({ kind: 'acquired' });
  });

  it('releases a held claim and returns to unclaimed', () => {
    const k = asKnobId('k1');
    claimKnob(k, claim('qeubo', 'hard'));
    const result = releaseKnob(k, 'qeubo');
    expect(result).toEqual({ kind: 'released' });
    expect(currentClaim(k)).toBeNull();
  });

  it('refuses release by a non-holder consumer', () => {
    const k = asKnobId('k1');
    const held = claim('qeubo', 'hard');
    claimKnob(k, held);
    const result = releaseKnob(k, 'autonomous-sr');
    expect(result).toEqual({
      kind: 'rejected',
      reason: 'not-claim-holder',
      holder: held,
    });
    expect(currentClaim(k)).toEqual(held);
  });

  it('refuses release of an unclaimed knob (catches bookkeeping bugs)', () => {
    const k = asKnobId('k1');
    const result = releaseKnob(k, 'qeubo');
    expect(result).toEqual({
      kind: 'rejected',
      reason: 'not-claim-holder',
      holder: null,
    });
  });
});

// ── Phase 2 — onClaimChange listener registry ─────────────────────

describe('onClaimChange', () => {
  beforeEach(() => {
    _resetClaimStateForTests();
  });

  it('fires on acquire with previous=null, next=<claim>', () => {
    const events: ClaimChangeEvent[] = [];
    onClaimChange((e) => events.push(e));
    const k = asKnobId('k1');
    const c = claim('qeubo', 'hard');
    claimKnob(k, c);
    expect(events).toEqual([{ knobId: k, previous: null, next: c }]);
  });

  it('fires on release with previous=<claim>, next=null', () => {
    const events: ClaimChangeEvent[] = [];
    const k = asKnobId('k1');
    const c = claim('qeubo', 'hard');
    claimKnob(k, c);
    onClaimChange((e) => events.push(e));
    releaseKnob(k, 'qeubo');
    expect(events).toEqual([{ knobId: k, previous: c, next: null }]);
  });

  it('does not fire on idempotent re-claim by the same consumer', () => {
    const events: ClaimChangeEvent[] = [];
    const k = asKnobId('k1');
    const c = claim('qeubo', 'hard');
    claimKnob(k, c);
    onClaimChange((e) => events.push(e));
    claimKnob(k, c);
    expect(events).toEqual([]);
  });

  it('does not fire on a rejected conflicting claim', () => {
    const events: ClaimChangeEvent[] = [];
    const k = asKnobId('k1');
    claimKnob(k, claim('qeubo', 'hard'));
    onClaimChange((e) => events.push(e));
    claimKnob(k, claim('autonomous-sr', 'hard'));
    expect(events).toEqual([]);
  });

  it('does not fire on a rejected release attempt', () => {
    const events: ClaimChangeEvent[] = [];
    const k = asKnobId('k1');
    claimKnob(k, claim('qeubo', 'hard'));
    onClaimChange((e) => events.push(e));
    releaseKnob(k, 'autonomous-sr');
    expect(events).toEqual([]);
  });

  it('unsubscribe stops further events', () => {
    const events: ClaimChangeEvent[] = [];
    const unsubscribe = onClaimChange((e) => events.push(e));
    const k = asKnobId('k1');
    claimKnob(k, claim('qeubo', 'hard'));
    unsubscribe();
    releaseKnob(k, 'qeubo');
    expect(events).toHaveLength(1);
    expect(events[0].next).not.toBeNull();
  });

  it('refuses duplicate listener registration', () => {
    const cb = (_e: ClaimChangeEvent) => {};
    onClaimChange(cb);
    expect(() => onClaimChange(cb)).toThrow(/already registered/);
  });

  it('tolerates a listener that unsubscribes itself mid-iteration', () => {
    const seen: string[] = [];
    let unsubscribeA: (() => void) | null = null;
    unsubscribeA = onClaimChange(() => {
      seen.push('a');
      unsubscribeA?.();
    });
    onClaimChange(() => seen.push('b'));
    const k = asKnobId('k1');
    claimKnob(k, claim('qeubo', 'hard'));
    // Both listeners should fire the first time (snapshot-on-emit).
    expect(seen).toEqual(['a', 'b']);
    seen.length = 0;
    releaseKnob(k, 'qeubo');
    // After the first event, A unsubscribed itself, so only B fires.
    expect(seen).toEqual(['b']);
  });
});

// ── Phase 2 — writeKnobValue policy dispatch ──────────────────────

describe('writeKnobValue — policy dispatch', () => {
  beforeEach(() => {
    _resetClaimStateForTests();
  });

  function makeRoot(): { ui: { brightness: number; contrast: number } } {
    return reactive({ ui: { brightness: 0, contrast: 0 } });
  }

  function makeScalarRegistry(): KnobRegistry {
    return {
      brightness: decl({
        id: 'brightness',
        inputs: [{ range: [0, 1] as const }],
        outputs: [{ path: 'ui.brightness' }],
      }),
    };
  }

  it('unclaimed + manual: writes through the transform', () => {
    const root = makeRoot();
    const result = writeKnobValue(
      root,
      makeScalarRegistry(),
      asKnobId('brightness'),
      [0.7],
      { kind: 'manual' },
    );
    expect(result).toEqual({ kind: 'written' });
    expect(root.ui.brightness).toBe(0.7);
  });

  it('unclaimed + consumer: refused — consumers must claim first', () => {
    const root = makeRoot();
    const result = writeKnobValue(
      root,
      makeScalarRegistry(),
      asKnobId('brightness'),
      [0.7],
      { kind: 'consumer', consumerId: 'qeubo' },
    );
    expect(result).toEqual({
      kind: 'refused',
      reason: 'consumer-not-claim-holder',
      activeClaim: null,
    });
    expect(root.ui.brightness).toBe(0);
  });

  it('hard-claim + manual: refused (substrate belt-and-braces)', () => {
    const root = makeRoot();
    const knobId = asKnobId('brightness');
    const held = claim('qeubo', 'hard', 'experiment-x');
    claimKnob(knobId, held);
    const result = writeKnobValue(
      root,
      makeScalarRegistry(),
      knobId,
      [0.5],
      { kind: 'manual' },
    );
    expect(result).toEqual({
      kind: 'refused',
      reason: 'hard-claim-held',
      holder: held,
    });
    expect(root.ui.brightness).toBe(0);
    // Claim is unaffected by the refused write.
    expect(currentClaim(knobId)).toEqual(held);
  });

  it('hard-claim + holder consumer: writes', () => {
    const root = makeRoot();
    const knobId = asKnobId('brightness');
    claimKnob(knobId, claim('qeubo', 'hard'));
    const result = writeKnobValue(
      root,
      makeScalarRegistry(),
      knobId,
      [0.4],
      { kind: 'consumer', consumerId: 'qeubo' },
    );
    expect(result).toEqual({ kind: 'written' });
    expect(root.ui.brightness).toBe(0.4);
  });

  it('hard-claim + non-holder consumer: refused', () => {
    const root = makeRoot();
    const knobId = asKnobId('brightness');
    const held = claim('qeubo', 'hard');
    claimKnob(knobId, held);
    const result = writeKnobValue(
      root,
      makeScalarRegistry(),
      knobId,
      [0.4],
      { kind: 'consumer', consumerId: 'autonomous-sr' },
    );
    expect(result).toEqual({
      kind: 'refused',
      reason: 'consumer-not-claim-holder',
      activeClaim: held,
    });
    expect(root.ui.brightness).toBe(0);
  });

  it('soft-claim + manual: releases the soft claim then writes', () => {
    const root = makeRoot();
    const knobId = asKnobId('brightness');
    const held = claim('autonomous-sr', 'soft', 'scenario-1');
    claimKnob(knobId, held);
    const events: ClaimChangeEvent[] = [];
    onClaimChange((e) => events.push(e));

    const result = writeKnobValue(
      root,
      makeScalarRegistry(),
      knobId,
      [0.3],
      { kind: 'manual' },
    );

    expect(result).toEqual({
      kind: 'written-after-soft-release',
      releasedHolder: held,
    });
    expect(root.ui.brightness).toBe(0.3);
    expect(currentClaim(knobId)).toBeNull();
    expect(events).toEqual([
      { knobId, previous: held, next: null },
    ]);
  });

  it('soft-claim + holder consumer: writes (no auto-release)', () => {
    const root = makeRoot();
    const knobId = asKnobId('brightness');
    const held = claim('autonomous-sr', 'soft');
    claimKnob(knobId, held);
    const result = writeKnobValue(
      root,
      makeScalarRegistry(),
      knobId,
      [0.6],
      { kind: 'consumer', consumerId: 'autonomous-sr' },
    );
    expect(result).toEqual({ kind: 'written' });
    expect(root.ui.brightness).toBe(0.6);
    expect(currentClaim(knobId)).toEqual(held);
  });

  it('soft-claim + non-holder consumer: refused', () => {
    const root = makeRoot();
    const knobId = asKnobId('brightness');
    const held = claim('autonomous-sr', 'soft');
    claimKnob(knobId, held);
    const result = writeKnobValue(
      root,
      makeScalarRegistry(),
      knobId,
      [0.6],
      { kind: 'consumer', consumerId: 'qeubo' },
    );
    expect(result).toEqual({
      kind: 'refused',
      reason: 'consumer-not-claim-holder',
      activeClaim: held,
    });
    expect(root.ui.brightness).toBe(0);
  });

  it('throws on an unknown knobId (caller used a stale id)', () => {
    const root = makeRoot();
    expect(() =>
      writeKnobValue(
        root,
        makeScalarRegistry(),
        asKnobId('does-not-exist'),
        [0.5],
        { kind: 'manual' },
      ),
    ).toThrow(/no KnobDecl registered/);
  });

  it('throws on input vector arity mismatch', () => {
    const root = makeRoot();
    expect(() =>
      writeKnobValue(
        root,
        makeScalarRegistry(),
        asKnobId('brightness'),
        [0.5, 0.5],
        { kind: 'manual' },
      ),
    ).toThrow(/expects an input vector of length 1/);
  });

  it('writes through a linear transform to multiple output paths', () => {
    const root = reactive({ a: 0, b: 0 });
    const registry: KnobRegistry = {
      twoOut: decl({
        id: 'twoOut',
        inputs: [{ range: [0, 1] as const }, { range: [0, 1] as const }],
        outputs: [{ path: 'a' }, { path: 'b' }],
        transform: {
          kind: 'linear',
          coefficients: [
            [1, 0],
            [0, 2],
          ],
        },
      }),
    };
    const result = writeKnobValue(
      root,
      registry,
      asKnobId('twoOut'),
      [3, 4],
      { kind: 'manual' },
    );
    expect(result).toEqual({ kind: 'written' });
    expect(root.a).toBe(3);
    expect(root.b).toBe(8);
  });
});
