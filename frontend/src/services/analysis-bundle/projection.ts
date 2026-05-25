/**
 * src/services/analysis-bundle/projection.ts
 *
 * SPA-typed-shape projection for analysis-bundle compression.
 *
 * Background. KataGo's analysis-response wire carries many fields
 * the SPA doesn't read — `scoreStdev`, `scoreMean`, `scoreSelfplay`,
 * `lcb`, `utility`, `prior`, per-move `ownership`, and others —
 * which round-trip through JSON storage as dead weight per the
 * 2026-05-25 compression research arc. The v2 wire shape strips
 * these at upload time by projecting each packet through the union
 * of the SPA's typed-shape `keyof`s declared in
 * `src/engine/katago/types.ts`. Reconstruction is lossless WITHIN
 * the SPA's read-set: nothing the SPA actually consumes is lost.
 *
 * Allow-list drift is the load-bearing failure mode. If a new field
 * is added to one of the typed-shape interfaces (e.g.
 * `KataMoveInfo`) without being added to the corresponding allow-
 * list here, the projection drops it silently and the SPA stops
 * seeing data it might expect to read. This module defends against
 * that drift with a compile-time gate: every allow-list is checked
 * against `keyof` of its companion interface, and a missing key
 * makes the build fail at `vue-tsc -b`. The user's design-note
 * amendment names this gate explicitly:
 *
 *   > "if possible there should be a CI gate that ensures the keys
 *   >  are the same as the fields that are actually used, as per
 *   >  your warning"
 *
 * Two type-level checks per shape:
 *
 *   1. `as const satisfies readonly (keyof T)[]` — every value in
 *      the array is a valid key of `T`. Catches typos.
 *   2. `Assert<[Exclude<keyof T, ARRAY[number]>] extends [never] ?
 *      true : false>` — every key of `T` is in the array. Catches
 *      drift when a field is added to `T` but forgotten here.
 *
 * The compile-time `Assert<true>` shape relies on the
 * `[X] extends [never]` "wrap in tuple to defeat distributive
 * conditionals" idiom — without the brackets, `Exclude<…> extends
 * never` evaluates separately for each union member and the check
 * loses its meaning.
 *
 * License: Public Domain (The Unlicense)
 */
import type {
  KataAnalysisResponse,
  KataExtra,
  KataMoveInfo,
  KataPlayerExtra,
  KataRootInfo,
} from '../../engine/katago/types';

// ── Compile-time drift-gate primitives ─────────────────────────────────────

type Assert<T extends true> = T;

// `[X] extends [never]` defeats TypeScript's distributive-conditional
// behaviour over union types: without the tuple wrappers, a union
// `'a' | 'b'` would distribute and evaluate per-member.
type IsEmpty<T> = [T] extends [never] ? true : false;

// ── KataAnalysisResponse (the root packet) ─────────────────────────────────

export const ALLOWED_ROOT_KEYS = [
  'id',
  'turnNumber',
  'isDuringSearch',
  'moveInfos',
  'rootInfo',
  'ownership',
  'policy',
  'extra',
] as const satisfies readonly (keyof KataAnalysisResponse)[];

// ── KataMoveInfo (per-candidate-move data) ─────────────────────────────────

export const ALLOWED_MOVE_INFO_KEYS = [
  'move',
  'visits',
  'winrate',
  'scoreLead',
  'pv',
  'order',
  'clusterId',
] as const satisfies readonly (keyof KataMoveInfo)[];

// ── KataRootInfo (position-level data) ─────────────────────────────────────

export const ALLOWED_ROOT_INFO_KEYS = [
  'winrate',
  'scoreLead',
  'visits',
  'currentPlayer',
] as const satisfies readonly (keyof KataRootInfo)[];

// ── KataExtra (proxy enrichment envelope) ──────────────────────────────────

export const ALLOWED_EXTRA_KEYS = [
  'state',
  'black',
  'white',
] as const satisfies readonly (keyof KataExtra)[];

// ── KataPlayerExtra (per-player enrichment) ────────────────────────────────

export const ALLOWED_PLAYER_EXTRA_KEYS = [
  'triangular',
  'deltas',
  'cwt',
] as const satisfies readonly (keyof KataPlayerExtra)[];

// ── Compile-time drift gate ────────────────────────────────────────────────

/**
 * The load-bearing CI gate: every allow-list above must cover its
 * companion interface's full `keyof`. A missing key flips the
 * corresponding `Assert<…>` to `Assert<false>`, which the
 * TypeScript type-checker rejects with a clear "Type 'false' does
 * not satisfy the constraint 'true'" error at the next
 * `vue-tsc -b`. Exported so it isn't trimmed as unused
 * (TS6196) — consumers should never reference this type at
 * runtime; it's a compile-time-only constraint.
 */
export type AllowListDriftGate =
  & Assert<IsEmpty<Exclude<keyof KataAnalysisResponse, typeof ALLOWED_ROOT_KEYS[number]>>>
  & Assert<IsEmpty<Exclude<keyof KataMoveInfo, typeof ALLOWED_MOVE_INFO_KEYS[number]>>>
  & Assert<IsEmpty<Exclude<keyof KataRootInfo, typeof ALLOWED_ROOT_INFO_KEYS[number]>>>
  & Assert<IsEmpty<Exclude<keyof KataExtra, typeof ALLOWED_EXTRA_KEYS[number]>>>
  & Assert<IsEmpty<Exclude<keyof KataPlayerExtra, typeof ALLOWED_PLAYER_EXTRA_KEYS[number]>>>;

// ── Runtime projection helpers ─────────────────────────────────────────────

const ROOT_KEY_SET: ReadonlySet<string> = new Set(ALLOWED_ROOT_KEYS);
const MOVE_INFO_KEY_SET: ReadonlySet<string> = new Set(ALLOWED_MOVE_INFO_KEYS);
const ROOT_INFO_KEY_SET: ReadonlySet<string> = new Set(ALLOWED_ROOT_INFO_KEYS);
const EXTRA_KEY_SET: ReadonlySet<string> = new Set(ALLOWED_EXTRA_KEYS);
const PLAYER_EXTRA_KEY_SET: ReadonlySet<string> = new Set(ALLOWED_PLAYER_EXTRA_KEYS);

function pickKeys<T extends Record<string, unknown>>(
  obj: T,
  allowed: ReadonlySet<string>,
): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(obj)) {
    if (allowed.has(k)) out[k] = obj[k];
  }
  return out as Partial<T>;
}

/**
 * Project a `KataAnalysisResponse` through the SPA's typed-shape
 * allow-list, recursively for `moveInfos[*]`, `rootInfo`, and the
 * `extra` envelope. Returns a fresh object; the input is not
 * mutated.
 *
 * Fields the runtime carries but the SPA's types don't declare are
 * dropped. Fields the SPA declares but the runtime omits (optional
 * fields like `ownership`, `policy`) pass through as `undefined`
 * and JSON-stringify back out cleanly.
 *
 * Pure function; no I/O, no shared state, no closures.
 */
export function projectPacket(
  packet: KataAnalysisResponse,
): KataAnalysisResponse {
  const projected = pickKeys(
    packet as unknown as Record<string, unknown>,
    ROOT_KEY_SET,
  ) as Record<string, unknown>;

  if (projected.rootInfo && typeof projected.rootInfo === 'object') {
    projected.rootInfo = pickKeys(
      projected.rootInfo as Record<string, unknown>,
      ROOT_INFO_KEY_SET,
    );
  }

  if (Array.isArray(projected.moveInfos)) {
    projected.moveInfos = (projected.moveInfos as Record<string, unknown>[]).map((mi) =>
      pickKeys(mi, MOVE_INFO_KEY_SET),
    );
  }

  if (projected.extra && typeof projected.extra === 'object') {
    const extra = pickKeys(
      projected.extra as Record<string, unknown>,
      EXTRA_KEY_SET,
    ) as Record<string, unknown>;
    if (extra.black && typeof extra.black === 'object') {
      extra.black = pickKeys(
        extra.black as Record<string, unknown>,
        PLAYER_EXTRA_KEY_SET,
      );
    }
    if (extra.white && typeof extra.white === 'object') {
      extra.white = pickKeys(
        extra.white as Record<string, unknown>,
        PLAYER_EXTRA_KEY_SET,
      );
    }
    projected.extra = extra;
  }

  return projected as unknown as KataAnalysisResponse;
}
