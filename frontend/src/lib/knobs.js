/**
 * src/lib/knobs.ts
 *
 * Substrate primitives for the knob registry — the SSOT for
 * user-controllable variables in the SPA. Phases 1 + 2 deliverable
 * per `docs/notes/knob-registry-plan.md` §§3–7:
 *
 *   Phase 1 — type-driven path-walk accessors, the named-transform
 *   library, startup-time validation of declared knob paths.
 *   Phase 2 — per-knob ownership state machine: claim API
 *   (first-come-first-served arbitration), claim-change listener
 *   registry, policy-aware `writeKnobValue` that consults the
 *   active claim before mutating the store.
 *
 * Pure-ish over a passed-in reactive root for the path-walk and
 * transform layers; module-scope state for the claim machinery
 * (claims are runtime-only and never persist in the profile blob).
 * No Vue lifecycle, no singleton store coupling, no Go-specific
 * vocabulary — band 1 per ADR-0003.
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
 *     reactive root — and, when `allowedPathPrefixes` is supplied, on
 *     the first output path that resolves but escapes the allowed
 *     subtree prefixes (the path-prefix allowlist; see below).
 *   - `claimKnob` returns a structured `ClaimResult.rejected` on
 *     conflict (does not throw — the requesting consumer needs to
 *     surface the conflict in its own UX). `releaseKnob` returns
 *     `ReleaseResult.rejected` when the caller isn't the holder.
 *   - `writeKnobValue` returns a structured `WriteResult` naming
 *     why a write was refused (hard claim held, consumer lacks
 *     claim) rather than silently no-op'ing.
 *
 * License: Public Domain (The Unlicense)
 */
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
export function readKnob(root, path) {
    const leaf = walkTo(root, path, 'read');
    if (typeof leaf !== 'number' || !Number.isFinite(leaf)) {
        throw new Error(`readKnob: path "${path}" resolved to a non-numeric or non-finite ` +
            `leaf (got ${describe(leaf)}). The substrate's correctness invariant ` +
            `requires every knob output path to terminate at a finite number.`);
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
export function writeKnob(root, path, value) {
    if (!Number.isFinite(value)) {
        throw new Error(`writeKnob: refused to write non-finite value (${describe(value)}) ` +
            `to path "${path}". Knob values must be finite numbers.`);
    }
    const segments = parsePath(path);
    const last = segments[segments.length - 1];
    const parentPath = segments.slice(0, -1).join('.');
    const parent = segments.length === 1 ? root : walkTo(root, parentPath, 'write');
    if (typeof parent !== 'object' || parent === null) {
        throw new Error(`writeKnob: path "${path}" — parent at "${parentPath}" is not an ` +
            `object (got ${describe(parent)}); cannot assign final segment ` +
            `"${last}".`);
    }
    // Existence check on the leaf so we don't accidentally extend an
    // object the caller didn't intend us to extend. Phase 1's contract:
    // knobs write to paths that already exist on the store; new paths
    // are added through seed-time defaults and migrations, not through
    // first-write side-effects.
    if (!(last in parent)) {
        throw new Error(`writeKnob: path "${path}" — final segment "${last}" does not ` +
            `exist on the parent object. Add the leaf via the store's ` +
            `defaults / migration before declaring a KnobDecl that writes to it.`);
    }
    parent[last] = value; // checked object + leaf-exists above; write the numeric knob value
}
function parsePath(path) {
    if (path.length === 0) {
        throw new Error('readKnob/writeKnob: path is empty.');
    }
    const segments = path.split('.');
    for (const s of segments) {
        if (s.length === 0) {
            throw new Error(`readKnob/writeKnob: path "${path}" contains an empty segment ` +
                `(check for leading/trailing dots or consecutive dots).`);
        }
    }
    return segments;
}
function walkTo(root, path, mode) {
    const segments = parsePath(path);
    let cursor = root;
    for (let i = 0; i < segments.length; i += 1) {
        const seg = segments[i];
        if (typeof cursor !== 'object' || cursor === null) {
            throw new Error(`${mode === 'read' ? 'readKnob' : 'writeKnob'}: path "${path}" — ` +
                `segment "${segments.slice(0, i).join('.') || '<root>'}" is not ` +
                `an object (got ${describe(cursor)}); cannot descend into "${seg}".`);
        }
        if (!(seg in cursor)) { // checked object above; open-record for the `in` probe
            throw new Error(`${mode === 'read' ? 'readKnob' : 'writeKnob'}: path "${path}" — ` +
                `segment "${seg}" is missing at "${segments.slice(0, i).join('.') || '<root>'}".`);
        }
        cursor = cursor[seg]; // checked object above; descend one segment
    }
    return cursor;
}
function describe(value) {
    if (value === null)
        return 'null';
    if (Array.isArray(value))
        return `array(length ${value.length})`;
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
export function applyTransform(transform, input) {
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
            const _never = transform;
            throw new Error(`applyTransform: unhandled transform kind ${JSON.stringify(_never)}.`);
        }
    }
}
function applyLinear(coefficients, input) {
    const K = coefficients.length;
    if (K === 0) {
        throw new Error(`applyTransform(linear): coefficient matrix has zero rows; ` +
            `output dimension must be ≥ 1.`);
    }
    const N = coefficients[0].length;
    if (input.length !== N) {
        throw new Error(`applyTransform(linear): input length ${input.length} does not ` +
            `match coefficient matrix column count ${N}.`);
    }
    const out = new Array(K);
    for (let k = 0; k < K; k += 1) {
        const row = coefficients[k];
        if (row.length !== N) {
            throw new Error(`applyTransform(linear): coefficient row ${k} has length ` +
                `${row.length}, expected ${N} (matrix must be rectangular).`);
        }
        let acc = 0;
        for (let n = 0; n < N; n += 1) {
            acc += row[n] * input[n];
        }
        out[k] = acc;
    }
    return out;
}
function applyLockstepHueRotate(anchors, input) {
    if (input.length !== 1) {
        throw new Error(`applyTransform(lockstep-hue-rotate): input must be a 1-D rotation ` +
            `offset; got ${input.length} dimensions.`);
    }
    const offset = input[0];
    const out = new Array(anchors.length);
    for (let k = 0; k < anchors.length; k += 1) {
        // Modulo-360 with positive result, so a negative offset rotates
        // backward without producing negative hues at the boundary.
        out[k] = ((anchors[k] + offset) % 360 + 360) % 360;
    }
    return out;
}
function applyFixedLuminanceArc(waypoints, input) {
    if (input.length !== 1) {
        throw new Error(`applyTransform(fixed-luminance-arc): input must be a 1-D arc ` +
            `position; got ${input.length} dimensions.`);
    }
    if (waypoints.length < 2) {
        throw new Error(`applyTransform(fixed-luminance-arc): need at least 2 waypoints ` +
            `for interpolation; got ${waypoints.length}.`);
    }
    const dim = waypoints[0].length;
    for (let i = 0; i < waypoints.length; i += 1) {
        if (waypoints[i].length !== dim) {
            throw new Error(`applyTransform(fixed-luminance-arc): waypoint ${i} has dimension ` +
                `${waypoints[i].length}, expected ${dim}.`);
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
    const out = new Array(dim);
    for (let d = 0; d < dim; d += 1) {
        out[d] = a[d] + (b[d] - a[d]) * localT;
    }
    return out;
}
function clamp(x, lo, hi) {
    return x < lo ? lo : x > hi ? hi : x;
}
// ── Startup-time validation ────────────────────────────────────────
/**
 * Validate every KnobDecl in `registry` against the reactive `root`.
 * Throws on the first incoherence; the thrown message names the
 * knob, the failing axis, and the recovery the caller should take.
 *
 * Four axes are checked:
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
 *   4. (When `allowedPathPrefixes` is supplied.) Each output path
 *      begins with one of the allowed subtree prefixes. Closes the
 *      "writes ANY finite-numeric leaf in the whole store" class
 *      that path-resolvability alone admits — see below.
 *
 * Why a path-prefix allowlist (PR #410 out-of-frame gate, finding 3):
 * the substrate is a data-driven writer over *any* finite-numeric
 * leaf its output paths resolve to. Path-resolvability (axis 1) alone
 * does NOT bound which store subtree a decl may write — a decl
 * arriving in a persisted profile, a migration, or a future
 * decl-editor surface could target e.g. a bare `engine.*` /
 * `boards.*` leaf and the knob substrate would write it, bypassing
 * that subtree's owner enumeration (the store-write-needs-owner lint
 * cannot see runtime path strings). `allowedPathPrefixes` closes the
 * class at data-validation time: the production caller passes the
 * subtrees the profile-owner knob seam is sanctioned to write
 * (`profile.` + `session.ui.` — every seeded decl targets one of
 * those). An out-of-prefix path is a startup-time loud failure per
 * ADR-0002, with structured `detail` naming the knob, the offending
 * path, and the allowed prefixes.
 *
 * The parameter is OPTIONAL and defaults to no restriction: the
 * substrate stays a domain-agnostic Band-1 library (ADR-0003), and
 * the prefix vocabulary is the GlobalStore-coupled CALLER's to
 * supply, not the substrate's to hardcode.
 *
 * Phase 1 ships with an empty registry; calling this against the
 * empty registry is a vacuous no-op. The function exists so Phase
 * 3+ promotions get validated automatically without a wiring step.
 */
export function validateRegistry(root, registry, allowedPathPrefixes) {
    for (const [key, decl] of Object.entries(registry)) {
        validateDecl(root, key, decl, registry, allowedPathPrefixes);
    }
}
function validateDecl(root, key, decl, registry, allowedPathPrefixes) {
    if (decl.id !== key) {
        throw new Error(`KnobRegistry validation: entry keyed "${key}" carries id ` +
            `"${decl.id}" (the key and the declared id must agree).`);
    }
    if (decl.inputs.length === 0) {
        throw new Error(`KnobRegistry validation: knob "${key}" declares zero input ` +
            `dimensions; every knob must have at least one input.`);
    }
    if (decl.outputs.length === 0) {
        throw new Error(`KnobRegistry validation: knob "${key}" declares zero output ` +
            `paths; every knob must drive at least one store leaf.`);
    }
    for (let i = 0; i < decl.inputs.length; i += 1) {
        const [lo, hi] = decl.inputs[i].range;
        if (!(Number.isFinite(lo) && Number.isFinite(hi) && lo < hi)) {
            throw new Error(`KnobRegistry validation: knob "${key}" input[${i}] has invalid ` +
                `range [${lo}, ${hi}] (need finite numbers with lo < hi).`);
        }
        // Cross-knob constraint: if `maxFromKnob` is set, the linked
        // knob must exist in the registry and must declare at least one
        // output path. Per ADR-0002, an unresolved reference is a
        // startup-time loud failure rather than a silent runtime
        // fallback to the static range max. Added 2026-05-15 with the
        // KataGo cadence-knob pair.
        const linked = decl.inputs[i].maxFromKnob;
        if (linked !== undefined) {
            const linkedDecl = registry[linked];
            if (!linkedDecl) {
                throw new Error(`KnobRegistry validation: knob "${key}" input[${i}] declares ` +
                    `maxFromKnob="${linked}" but no KnobDecl is registered under ` +
                    `that id. Either the linked knob's id was renamed, or this ` +
                    `decl was authored against a registry that hasn't been ` +
                    `populated yet (check the migration order).`);
            }
            if (linkedDecl.outputs.length === 0 || !linkedDecl.outputs[0]?.path) {
                throw new Error(`KnobRegistry validation: knob "${key}" input[${i}] declares ` +
                    `maxFromKnob="${linked}" but that knob has no output path ` +
                    `the substrate can read. The linked knob's stored value is ` +
                    `the source of the effective max bound; without an output ` +
                    `path there's nothing to read.`);
            }
        }
        // Absolute lower bound: if `minFloor` is set, it must be a
        // finite number and (when paired with a static range) must not
        // exceed `range[1]`. Per ADR-0002, an incoherent declaration is
        // a startup-time loud failure — a `NaN` floor or a floor above
        // the static max would otherwise silently degrade the slider
        // widget's effectiveMin computation at render time. Added
        // 2026-05-15 to support the KataGo first-report-after upstream-
        // cliff workaround.
        const floor = decl.inputs[i].minFloor;
        if (floor !== undefined) {
            if (!Number.isFinite(floor)) {
                throw new Error(`KnobRegistry validation: knob "${key}" input[${i}] declares ` +
                    `minFloor=${floor} which is not a finite number. ` +
                    `The floor is the slider's effective lower bound and ` +
                    `must be a real numeric value in the knob's native unit.`);
            }
            if (floor > hi) {
                throw new Error(`KnobRegistry validation: knob "${key}" input[${i}] declares ` +
                    `minFloor=${floor} above the static range upper bound ${hi}. ` +
                    `A floor above the static max would collapse the slider's ` +
                    `effective range to zero; either lower the floor or raise ` +
                    `the static range.`);
            }
        }
    }
    const transform = decl.transform ?? { kind: 'identity' };
    validateTransformDimensions(key, transform, decl.inputs.length, decl.outputs.length);
    for (let i = 0; i < decl.outputs.length; i += 1) {
        const out = decl.outputs[i];
        // Axis 4: path-prefix allowlist (PR #410 gate finding 3). Checked
        // BEFORE resolvability so an out-of-subtree path fails on the
        // crisper "writes a subtree it's not allowed to" reason rather than
        // on a downstream resolve error. Skipped when no allowlist is
        // supplied (the substrate stays domain-agnostic; see the function
        // docstring).
        if (allowedPathPrefixes !== undefined &&
            !allowedPathPrefixes.some((prefix) => out.path.startsWith(prefix))) {
            throw new Error(`KnobRegistry validation: knob "${key}" output[${i}] path ` +
                `"${out.path}" targets a store subtree the knob substrate is not ` +
                `permitted to write. Allowed prefixes: ` +
                `${allowedPathPrefixes.map((p) => `"${p}"`).join(', ')}. A KnobDecl ` +
                `may only drive the profile-owner knob seam's sanctioned subtrees; ` +
                `a leaf outside them must be written through that subtree's own ` +
                `owner, not the knob substrate (ADR-0002, PR #410 gate finding 3).`);
        }
        try {
            readKnob(root, out.path);
        }
        catch (cause) {
            throw new Error(`KnobRegistry validation: knob "${key}" output[${i}] path ` +
                `"${out.path}" failed to resolve at startup. Either the store ` +
                `leaf was renamed, or the migration that introduced this ` +
                `KnobDecl has not yet run on this profile. Underlying cause: ` +
                // readKnob only ever throws `new Error(...)`, so the caught cause is an
                // Error; narrow to read its message.
                `${cause.message}`);
        }
    }
}
function validateTransformDimensions(key, transform, N, K) {
    switch (transform.kind) {
        case 'identity':
            if (N !== K) {
                throw new Error(`KnobRegistry validation: knob "${key}" identity transform ` +
                    `requires inputs.length (${N}) === outputs.length (${K}).`);
            }
            return;
        case 'linear': {
            if (transform.coefficients.length !== K) {
                throw new Error(`KnobRegistry validation: knob "${key}" linear transform has ` +
                    `${transform.coefficients.length} coefficient rows; expected ` +
                    `outputs.length (${K}).`);
            }
            for (let k = 0; k < K; k += 1) {
                if (transform.coefficients[k].length !== N) {
                    throw new Error(`KnobRegistry validation: knob "${key}" linear transform row ` +
                        `${k} has ${transform.coefficients[k].length} columns; expected ` +
                        `inputs.length (${N}).`);
                }
            }
            return;
        }
        case 'lockstep-hue-rotate':
            if (N !== 1) {
                throw new Error(`KnobRegistry validation: knob "${key}" lockstep-hue-rotate ` +
                    `transform requires a 1-D input (got ${N}).`);
            }
            if (transform.anchors.length !== K) {
                throw new Error(`KnobRegistry validation: knob "${key}" lockstep-hue-rotate ` +
                    `transform has ${transform.anchors.length} anchors; expected ` +
                    `outputs.length (${K}).`);
            }
            return;
        case 'fixed-luminance-arc':
            if (N !== 1) {
                throw new Error(`KnobRegistry validation: knob "${key}" fixed-luminance-arc ` +
                    `transform requires a 1-D input (got ${N}).`);
            }
            if (transform.waypoints.length < 2) {
                throw new Error(`KnobRegistry validation: knob "${key}" fixed-luminance-arc ` +
                    `transform needs ≥ 2 waypoints (got ${transform.waypoints.length}).`);
            }
            if (transform.waypoints[0].length !== K) {
                throw new Error(`KnobRegistry validation: knob "${key}" fixed-luminance-arc ` +
                    `transform waypoint dimensionality ${transform.waypoints[0].length} ` +
                    `does not match outputs.length (${K}).`);
            }
            return;
        default: {
            const _never = transform;
            throw new Error(`validateTransformDimensions: unhandled transform kind ` +
                `${JSON.stringify(_never)}.`);
        }
    }
}
// ── Claim state machine ───────────────────────────────────────────
//
// Module-scope state per the plan §7. Claims are runtime-only — they
// never persist in the profile blob, and a page reload wipes the
// machine back to all-unclaimed (the SPA UI consumer is the
// default-effective writer once the page comes back up). Test
// isolation goes through `_resetClaimStateForTests`; production code
// has no API for clearing the whole map.
//
// Storage uses `Map<string, ConsumerClaim>` keyed on `KnobId` (the
// brand erases at runtime; the strings the consumer passes in are
// directly usable as Map keys). Subscribers are an `Array<ClaimChangeListener>`
// so iteration is order-stable and `splice`-on-unsubscribe is O(n).
const claims = new Map();
const listeners = [];
function emitChange(knobId, previous, next) {
    if (sameClaim(previous, next))
        return;
    const event = { knobId, previous, next };
    // Iterate over a snapshot so a listener that unsubscribes itself
    // mid-iteration doesn't shift the index out from under us.
    const snapshot = listeners.slice();
    for (const listener of snapshot) {
        listener(event);
    }
}
function sameClaim(a, b) {
    if (a === b)
        return true;
    if (a === null || b === null)
        return false;
    return (a.consumerId === b.consumerId &&
        a.policy === b.policy &&
        a.reason === b.reason);
}
/**
 * Acquire the claim on `knobId` for the requesting consumer.
 * First-come-first-served — a `rejected` result names the current
 * holder so the requesting consumer can surface the conflict in
 * its own UX (a qEUBO start dialog naming the conflicting hold,
 * etc.). Idempotent in the no-op sense: a consumer re-claiming
 * its own active claim with the same shape returns `acquired`
 * without firing a callback.
 */
export function claimKnob(knobId, claim) {
    const current = claims.get(knobId) ?? null;
    if (current !== null && current.consumerId !== claim.consumerId) {
        return {
            kind: 'rejected',
            reason: 'already-claimed',
            holder: current,
        };
    }
    claims.set(knobId, claim);
    emitChange(knobId, current, claim);
    return { kind: 'acquired' };
}
/**
 * Release the claim on `knobId`. Only the holding consumer may
 * release; an attempt by a non-holder returns a structured
 * `rejected` result so the caller knows they didn't hold the
 * claim. Releasing an unclaimed knob is itself a `rejected`
 * result (holder: null) — silent acceptance would obscure a
 * caller-side bookkeeping bug.
 */
export function releaseKnob(knobId, consumerId) {
    const current = claims.get(knobId) ?? null;
    if (current === null) {
        return { kind: 'rejected', reason: 'not-claim-holder', holder: null };
    }
    if (current.consumerId !== consumerId) {
        return {
            kind: 'rejected',
            reason: 'not-claim-holder',
            holder: current,
        };
    }
    claims.delete(knobId);
    emitChange(knobId, current, null);
    return { kind: 'released' };
}
/** Read the current claim, or null when unclaimed. */
export function currentClaim(knobId) {
    return claims.get(knobId) ?? null;
}
/**
 * Register a synchronous claim-change listener. Returns an
 * unsubscribe function. Listeners fire on every distinct
 * transition (claim, release, soft-release fallout from a
 * manual write) — but not on a re-claim that leaves the
 * claim unchanged. Throws if the same callback is registered
 * twice (ADR-0002: silent double-fire is the silent-failure
 * mode the substrate's event surface is shaped against).
 */
export function onClaimChange(callback) {
    if (listeners.includes(callback)) {
        throw new Error(`onClaimChange: the same callback is already registered. ` +
            `Each subscriber must register exactly once; unsubscribe ` +
            `the prior registration before re-registering.`);
    }
    listeners.push(callback);
    return () => {
        const i = listeners.indexOf(callback);
        if (i >= 0)
            listeners.splice(i, 1);
    };
}
/**
 * Test-only escape hatch. Clears every claim and unregisters
 * every listener. Production code never calls this; the substrate
 * has no "global reset" use case at runtime.
 */
export function _resetClaimStateForTests() {
    claims.clear();
    listeners.length = 0;
}
// ── Policy-aware write ────────────────────────────────────────────
/**
 * Write a knob's input vector through its transform to each declared
 * output path, consulting the per-knob claim state and the caller's
 * `ctx` identity. Returns a `WriteResult` naming the outcome:
 *
 *   - `unclaimed` + manual → store mutated, `{ kind: 'written' }`.
 *   - `unclaimed` + consumer → refused (consumers must claim first);
 *     `{ kind: 'refused', reason: 'consumer-not-claim-holder', activeClaim: null }`.
 *   - `claimed-hard` by Y + manual → refused; store untouched;
 *     `{ kind: 'refused', reason: 'hard-claim-held', holder: <Y> }`.
 *   - `claimed-hard` by Y + consumer Y → store mutated, `written`.
 *   - `claimed-hard` by Y + consumer X (X ≠ Y) → refused;
 *     `{ kind: 'refused', reason: 'consumer-not-claim-holder', activeClaim: <Y> }`.
 *   - `claimed-soft` by Y + manual → the substrate releases Y's
 *     claim on the user's behalf (firing the standard claim-change
 *     event), then mutates the store;
 *     `{ kind: 'written-after-soft-release', releasedHolder: <Y> }`.
 *   - `claimed-soft` by Y + consumer Y → store mutated, `written`.
 *   - `claimed-soft` by Y + consumer X → refused;
 *     `{ kind: 'refused', reason: 'consumer-not-claim-holder', activeClaim: <Y> }`.
 *
 * The transform's output dimension equals `outputs.length` per the
 * `validateRegistry` invariant; the write fans out across each
 * `outputs[k].path` in order.
 */
export function writeKnobValue(root, registry, knobId, inputVector, ctx) {
    const decl = registry[knobId];
    if (!decl) {
        throw new Error(`writeKnobValue: no KnobDecl registered for id "${knobId}". ` +
            `Either the caller is using a stale knob id, or the migration ` +
            `that introduced the decl has not yet run on this profile.`);
    }
    if (inputVector.length !== decl.inputs.length) {
        throw new Error(`writeKnobValue: knob "${knobId}" expects an input vector of ` +
            `length ${decl.inputs.length}; got ${inputVector.length}.`);
    }
    // ── Policy dispatch ──
    const current = claims.get(knobId) ?? null;
    if (current !== null && current.policy === 'hard') {
        if (ctx.kind === 'manual' || ctx.consumerId !== current.consumerId) {
            // Either a manual write against a hard claim or a non-holder
            // consumer write. Manual surfaces as 'hard-claim-held'
            // (the SPA UI should already have disabled the widget — this
            // refusal is the substrate's belt-and-braces); a non-holder
            // consumer write surfaces as 'consumer-not-claim-holder' for
            // symmetry with the soft-claim non-holder case.
            if (ctx.kind === 'manual') {
                return {
                    kind: 'refused',
                    reason: 'hard-claim-held',
                    holder: current,
                };
            }
            return {
                kind: 'refused',
                reason: 'consumer-not-claim-holder',
                activeClaim: current,
            };
        }
    }
    else if (current !== null && current.policy === 'soft') {
        if (ctx.kind === 'consumer' && ctx.consumerId !== current.consumerId) {
            return {
                kind: 'refused',
                reason: 'consumer-not-claim-holder',
                activeClaim: current,
            };
        }
        // Manual write on a soft-claimed knob → release the soft claim
        // on the user's behalf (emitting the standard claim-change
        // event) before performing the write. This is the soft policy's
        // whole point.
        if (ctx.kind === 'manual') {
            claims.delete(knobId);
            emitChange(knobId, current, null);
            const output = applyTransform(decl.transform ?? { kind: 'identity' }, inputVector);
            writeOutputs(root, decl, output);
            return { kind: 'written-after-soft-release', releasedHolder: current };
        }
    }
    else {
        // Unclaimed: only manual writes are admitted. A consumer write
        // against an unclaimed knob is a contract bug on the consumer
        // side (they should `claimKnob` first); refuse loud per ADR-0002.
        if (ctx.kind === 'consumer') {
            return {
                kind: 'refused',
                reason: 'consumer-not-claim-holder',
                activeClaim: null,
            };
        }
    }
    // Either: unclaimed + manual, hard-claimed by writer, or
    // soft-claimed by writer — proceed with the write.
    const output = applyTransform(decl.transform ?? { kind: 'identity' }, inputVector);
    writeOutputs(root, decl, output);
    return { kind: 'written' };
}
function writeOutputs(root, decl, output) {
    if (output.length !== decl.outputs.length) {
        throw new Error(`writeKnobValue: transform produced ${output.length} output(s) ` +
            `for knob "${decl.id}"; expected ${decl.outputs.length}. ` +
            `Verify the transform/outputs dimensions in the KnobDecl ` +
            `(validateRegistry catches this class of bug at startup).`);
    }
    for (let k = 0; k < decl.outputs.length; k += 1) {
        writeKnob(root, decl.outputs[k].path, output[k]);
    }
}
