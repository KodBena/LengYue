/**
 * src/lib/knobs.ts
 *
 * Substrate primitives for the knob registry — the SSOT for
 * user-controllable variables in the SPA. Phase 1 deliverable per
 * `docs/notes/knob-registry-plan.md` §§3–5: type-driven path-walk
 * accessors, the named-transform library, and startup-time
 * validation of declared knob paths. Pure-ish over a passed-in
 * reactive root; no Vue lifecycle, no singleton store coupling, no
 * Go-specific vocabulary — band 1 per ADR-0003.
 *
 * Failure contract (ADR-0002):
 *
 *   - Path walks throw on missing intermediate segments and on
 *     type-mismatched leaves; sentinel returns are not allowed at
 *     the substrate boundary.
 *   - Transform application throws on dimension mismatches between
 *     the input vector and the transform's declared shape (identity:
 *     output.length === input.length; linear: coefficients dims
 *     consistent with input/output dims; arc/rotate: input length 1).
 *   - `validateRegistry` throws on the first KnobDecl whose declared
 *     output paths or transform dimensions are incoherent against the
 *     reactive root. Phase 1 ships the registry seeded empty so
 *     production startup is vacuously a no-op until Phase 3 promotes
 *     the first scalar onto a KnobDecl.
 *
 * License: Public Domain (The Unlicense)
 */

import type {
  KnobDecl,
  KnobRegistry,
  KnobTransform,
  StorePath,
} from '../types';

// ── Path walk ──────────────────────────────────────────────────────

/**
 * Walk `root` along the dot-separated `path` and return the numeric
 * leaf. Throws if any intermediate segment is absent or non-object,
 * or if the leaf is not a finite number.
 *
 * Vue reactivity transparency: reading a reactive property through a
 * plain object reference triggers the standard tracking pathway, so
 * a `computed` that calls `readKnob(store, path)` re-evaluates when
 * the leaf changes.
 */
export function readKnob(root: object, path: StorePath): number {
  const leaf = walkTo(root, path, 'read');
  if (typeof leaf !== 'number' || !Number.isFinite(leaf)) {
    throw new Error(
      `readKnob: path "${path}" resolved to a non-numeric or non-finite ` +
      `leaf (got ${describe(leaf)}). The substrate's correctness invariant ` +
      `requires every knob output path to terminate at a finite number.`,
    );
  }
  return leaf;
}

/**
 * Walk `root` along all but the last segment of `path`, then assign
 * `value` to the last segment. Throws if any intermediate segment is
 * absent or non-object, or if `value` is non-finite.
 *
 * The assignment goes through Vue's reactivity unchanged: callers
 * pass the reactive root and writes propagate via the same tracking
 * pathway manual edits use. The substrate has no "knob-driven write"
 * shadow pathway distinct from "manual write."
 */
export function writeKnob(
  root: object,
  path: StorePath,
  value: number,
): void {
  if (!Number.isFinite(value)) {
    throw new Error(
      `writeKnob: refused to write non-finite value (${describe(value)}) ` +
      `to path "${path}". Knob values must be finite numbers.`,
    );
  }
  const segments = parsePath(path);
  const last = segments[segments.length - 1];
  const parentPath = segments.slice(0, -1).join('.');
  const parent =
    segments.length === 1 ? root : walkTo(root, parentPath, 'write');
  if (typeof parent !== 'object' || parent === null) {
    throw new Error(
      `writeKnob: path "${path}" — parent at "${parentPath}" is not an ` +
      `object (got ${describe(parent)}); cannot assign final segment ` +
      `"${last}".`,
    );
  }
  // Existence check on the leaf so we don't accidentally extend an
  // object the caller didn't intend us to extend. Phase 1's contract:
  // knobs write to paths that already exist on the store; new paths
  // are added through seed-time defaults and migrations, not through
  // first-write side-effects.
  if (!(last in (parent as Record<string, unknown>))) {
    throw new Error(
      `writeKnob: path "${path}" — final segment "${last}" does not ` +
      `exist on the parent object. Add the leaf via the store's ` +
      `defaults / migration before declaring a KnobDecl that writes to it.`,
    );
  }
  (parent as Record<string, number>)[last] = value;
}

function parsePath(path: StorePath): string[] {
  if (path.length === 0) {
    throw new Error('readKnob/writeKnob: path is empty.');
  }
  const segments = path.split('.');
  for (const s of segments) {
    if (s.length === 0) {
      throw new Error(
        `readKnob/writeKnob: path "${path}" contains an empty segment ` +
        `(check for leading/trailing dots or consecutive dots).`,
      );
    }
  }
  return segments;
}

function walkTo(
  root: object,
  path: StorePath,
  mode: 'read' | 'write',
): unknown {
  const segments = parsePath(path);
  let cursor: unknown = root;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (typeof cursor !== 'object' || cursor === null) {
      throw new Error(
        `${mode === 'read' ? 'readKnob' : 'writeKnob'}: path "${path}" — ` +
        `segment "${segments.slice(0, i).join('.') || '<root>'}" is not ` +
        `an object (got ${describe(cursor)}); cannot descend into "${seg}".`,
      );
    }
    if (!(seg in (cursor as Record<string, unknown>))) {
      throw new Error(
        `${mode === 'read' ? 'readKnob' : 'writeKnob'}: path "${path}" — ` +
        `segment "${seg}" is missing at "${segments.slice(0, i).join('.') || '<root>'}".`,
      );
    }
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  return cursor;
}

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `array(length ${value.length})`;
  return typeof value;
}

// ── Transform library ──────────────────────────────────────────────

/**
 * Apply `transform` to `input`, producing the K-dimensional output
 * vector. Dispatches over the discriminated `kind` so adding a new
 * named transform forces a TypeScript exhaustiveness error at the
 * switch default — the substrate's correctness-by-construction
 * anchor for the closed transform set.
 */
export function applyTransform(
  transform: KnobTransform,
  input: readonly number[],
): number[] {
  switch (transform.kind) {
    case 'identity':
      return [...input];
    case 'linear':
      return applyLinear(transform.coefficients, input);
    case 'lockstep-hue-rotate':
      return applyLockstepHueRotate(transform.anchors, input);
    case 'fixed-luminance-arc':
      return applyFixedLuminanceArc(transform.waypoints, input);
    default: {
      // Exhaustiveness — adding a new `kind` without extending this
      // switch is a TypeScript error at the assignment to `_never`.
      const _never: never = transform;
      throw new Error(
        `applyTransform: unhandled transform kind ${JSON.stringify(_never)}.`,
      );
    }
  }
}

function applyLinear(
  coefficients: readonly (readonly number[])[],
  input: readonly number[],
): number[] {
  const K = coefficients.length;
  if (K === 0) {
    throw new Error(
      `applyTransform(linear): coefficient matrix has zero rows; ` +
      `output dimension must be ≥ 1.`,
    );
  }
  const N = coefficients[0].length;
  if (input.length !== N) {
    throw new Error(
      `applyTransform(linear): input length ${input.length} does not ` +
      `match coefficient matrix column count ${N}.`,
    );
  }
  const out = new Array<number>(K);
  for (let k = 0; k < K; k += 1) {
    const row = coefficients[k];
    if (row.length !== N) {
      throw new Error(
        `applyTransform(linear): coefficient row ${k} has length ` +
        `${row.length}, expected ${N} (matrix must be rectangular).`,
      );
    }
    let acc = 0;
    for (let n = 0; n < N; n += 1) {
      acc += row[n] * input[n];
    }
    out[k] = acc;
  }
  return out;
}

function applyLockstepHueRotate(
  anchors: readonly number[],
  input: readonly number[],
): number[] {
  if (input.length !== 1) {
    throw new Error(
      `applyTransform(lockstep-hue-rotate): input must be a 1-D rotation ` +
      `offset; got ${input.length} dimensions.`,
    );
  }
  const offset = input[0];
  const out = new Array<number>(anchors.length);
  for (let k = 0; k < anchors.length; k += 1) {
    // Modulo-360 with positive result, so a negative offset rotates
    // backward without producing negative hues at the boundary.
    out[k] = ((anchors[k] + offset) % 360 + 360) % 360;
  }
  return out;
}

function applyFixedLuminanceArc(
  waypoints: readonly (readonly number[])[],
  input: readonly number[],
): number[] {
  if (input.length !== 1) {
    throw new Error(
      `applyTransform(fixed-luminance-arc): input must be a 1-D arc ` +
      `position; got ${input.length} dimensions.`,
    );
  }
  if (waypoints.length < 2) {
    throw new Error(
      `applyTransform(fixed-luminance-arc): need at least 2 waypoints ` +
      `for interpolation; got ${waypoints.length}.`,
    );
  }
  const dim = waypoints[0].length;
  for (let i = 0; i < waypoints.length; i += 1) {
    if (waypoints[i].length !== dim) {
      throw new Error(
        `applyTransform(fixed-luminance-arc): waypoint ${i} has dimension ` +
        `${waypoints[i].length}, expected ${dim}.`,
      );
    }
  }
  const t = clamp(input[0], 0, 1);
  // Locate the segment. With M waypoints there are M-1 segments;
  // segment s ∈ [0, M-2] covers t ∈ [s/(M-1), (s+1)/(M-1)].
  const segments = waypoints.length - 1;
  const scaled = t * segments;
  const sIndex = Math.min(Math.floor(scaled), segments - 1);
  const localT = scaled - sIndex;
  const a = waypoints[sIndex];
  const b = waypoints[sIndex + 1];
  const out = new Array<number>(dim);
  for (let d = 0; d < dim; d += 1) {
    out[d] = a[d] + (b[d] - a[d]) * localT;
  }
  return out;
}

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

// ── Startup-time validation ────────────────────────────────────────

/**
 * Validate every KnobDecl in `registry` against the reactive `root`.
 * Throws on the first incoherence; the thrown message names the
 * knob, the failing axis, and the recovery the caller should take.
 *
 * Three axes are checked:
 *
 *   1. Each `outputs[i].path` walks to a finite number leaf on
 *      `root`. Catches renamed settings, deleted leaves, type
 *      drift between the store and a stale KnobDecl.
 *   2. The transform's input/output dimensions are coherent with
 *      `inputs.length` and `outputs.length`. Catches authoring
 *      errors where a 2-D knob declares an identity transform
 *      against 3-D outputs.
 *   3. Input ranges are well-formed (`range[0] < range[1]`).
 *      Catches paste-flipped ranges at decl time.
 *
 * Phase 1 ships with an empty registry; calling this against the
 * empty registry is a vacuous no-op. The function exists so Phase
 * 3+ promotions get validated automatically without a wiring step.
 */
export function validateRegistry(
  root: object,
  registry: KnobRegistry,
): void {
  for (const [key, decl] of Object.entries(registry)) {
    validateDecl(root, key, decl);
  }
}

function validateDecl(root: object, key: string, decl: KnobDecl): void {
  if (decl.id !== key) {
    throw new Error(
      `KnobRegistry validation: entry keyed "${key}" carries id ` +
      `"${decl.id}" (the key and the declared id must agree).`,
    );
  }
  if (decl.inputs.length === 0) {
    throw new Error(
      `KnobRegistry validation: knob "${key}" declares zero input ` +
      `dimensions; every knob must have at least one input.`,
    );
  }
  if (decl.outputs.length === 0) {
    throw new Error(
      `KnobRegistry validation: knob "${key}" declares zero output ` +
      `paths; every knob must drive at least one store leaf.`,
    );
  }
  for (let i = 0; i < decl.inputs.length; i += 1) {
    const [lo, hi] = decl.inputs[i].range;
    if (!(Number.isFinite(lo) && Number.isFinite(hi) && lo < hi)) {
      throw new Error(
        `KnobRegistry validation: knob "${key}" input[${i}] has invalid ` +
        `range [${lo}, ${hi}] (need finite numbers with lo < hi).`,
      );
    }
  }
  const transform: KnobTransform =
    decl.transform ?? { kind: 'identity' };
  validateTransformDimensions(key, transform, decl.inputs.length, decl.outputs.length);
  for (let i = 0; i < decl.outputs.length; i += 1) {
    const out = decl.outputs[i];
    try {
      readKnob(root, out.path);
    } catch (cause) {
      throw new Error(
        `KnobRegistry validation: knob "${key}" output[${i}] path ` +
        `"${out.path}" failed to resolve at startup. Either the store ` +
        `leaf was renamed, or the migration that introduced this ` +
        `KnobDecl has not yet run on this profile. Underlying cause: ` +
        `${(cause as Error).message}`,
      );
    }
  }
}

function validateTransformDimensions(
  key: string,
  transform: KnobTransform,
  N: number,
  K: number,
): void {
  switch (transform.kind) {
    case 'identity':
      if (N !== K) {
        throw new Error(
          `KnobRegistry validation: knob "${key}" identity transform ` +
          `requires inputs.length (${N}) === outputs.length (${K}).`,
        );
      }
      return;
    case 'linear': {
      if (transform.coefficients.length !== K) {
        throw new Error(
          `KnobRegistry validation: knob "${key}" linear transform has ` +
          `${transform.coefficients.length} coefficient rows; expected ` +
          `outputs.length (${K}).`,
        );
      }
      for (let k = 0; k < K; k += 1) {
        if (transform.coefficients[k].length !== N) {
          throw new Error(
            `KnobRegistry validation: knob "${key}" linear transform row ` +
            `${k} has ${transform.coefficients[k].length} columns; expected ` +
            `inputs.length (${N}).`,
          );
        }
      }
      return;
    }
    case 'lockstep-hue-rotate':
      if (N !== 1) {
        throw new Error(
          `KnobRegistry validation: knob "${key}" lockstep-hue-rotate ` +
          `transform requires a 1-D input (got ${N}).`,
        );
      }
      if (transform.anchors.length !== K) {
        throw new Error(
          `KnobRegistry validation: knob "${key}" lockstep-hue-rotate ` +
          `transform has ${transform.anchors.length} anchors; expected ` +
          `outputs.length (${K}).`,
        );
      }
      return;
    case 'fixed-luminance-arc':
      if (N !== 1) {
        throw new Error(
          `KnobRegistry validation: knob "${key}" fixed-luminance-arc ` +
          `transform requires a 1-D input (got ${N}).`,
        );
      }
      if (transform.waypoints.length < 2) {
        throw new Error(
          `KnobRegistry validation: knob "${key}" fixed-luminance-arc ` +
          `transform needs ≥ 2 waypoints (got ${transform.waypoints.length}).`,
        );
      }
      if (transform.waypoints[0].length !== K) {
        throw new Error(
          `KnobRegistry validation: knob "${key}" fixed-luminance-arc ` +
          `transform waypoint dimensionality ${transform.waypoints[0].length} ` +
          `does not match outputs.length (${K}).`,
        );
      }
      return;
    default: {
      const _never: never = transform;
      throw new Error(
        `validateTransformDimensions: unhandled transform kind ` +
        `${JSON.stringify(_never)}.`,
      );
    }
  }
}
