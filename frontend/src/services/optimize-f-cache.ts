/**
 * src/services/optimize-f-cache.ts
 *
 * Per-machine cache of optimizer results, keyed by
 * `(model, cadence_bucket_50ms)`. Backed by `localStorage` rather than
 * the synced workspace because optimizer results are hardware-bound:
 * they depend on the proxy URL, the GPU, the KataGo binary version,
 * the model weights file, and ambient system load — none of which
 * SyncService can faithfully carry across machines. A user roaming
 * their workspace to a new device should NOT inherit stale F* values
 * from the old device.
 *
 * Bucket key: `floor(cadence_ms / 50) * 50`. With this width, every
 * cadence in [Bms, B+49ms] shares one cache entry. Above the eval-cost
 * regime the cliff position is roughly cadence-invariant, so a 50ms
 * bucket is more than sharp enough; below the eval-cost regime, the
 * cliff is messy enough that finer buckets just produce noisier cache
 * hits without a real improvement.
 *
 * Reactive surface: the service exposes a `readonly ref` of the entry
 * map so UI components can `watch` cache changes (e.g., to update a
 * "saved" badge next to the F slider as new entries land). All
 * mutations go through `setEntry` / `removeEntry` / `clearAll` so the
 * ref is the single source of truth.
 *
 * License: Public Domain (The Unlicense)
 */

import { ref, readonly, type Ref } from 'vue';

/**
 * One persisted cache entry. `recordedAt` is `Date.now()` at the time
 * the entry landed. `wsUrl` and `kataGoVersion` are not part of the
 * key (per the design discussion: even URL + version isn't sufficient
 * for hardware-tied scoping; the user wipes manually) but are carried
 * for traceability — a user inspecting the cache list can tell which
 * proxy / engine version produced each entry.
 */
export interface FOptimizerCacheEntry {
  readonly model: string;
  readonly cadenceBucketMs: number;
  readonly fS: number;
  readonly expectedDtMs: number;
  readonly savingsMs: number;
  readonly controlDtMs: number;
  readonly bracketLowS: number | null;
  readonly bracketHighS: number | null;
  readonly queriesTotal: number;
  readonly recordedAt: number;
  readonly wsUrl: string | null;
  readonly kataGoVersion: string | null;
}

export const F_OPTIMIZER_BUCKET_WIDTH_MS = 50;

const STORAGE_KEY = 'lengyue.fOptimizerCache.v1';

/**
 * Bucket-align a cadence in seconds. Returns the lower edge of the
 * bucket in milliseconds (so 0.075 → 50, 0.100 → 100, 0.125 → 100).
 */
export function cadenceBucketMs(cadenceS: number): number {
  return (
    Math.floor((cadenceS * 1000) / F_OPTIMIZER_BUCKET_WIDTH_MS) *
    F_OPTIMIZER_BUCKET_WIDTH_MS
  );
}

/** Cache key for `(model, cadence)` — `${model}|${bucket}`. */
export function cacheKey(model: string, cadenceS: number): string {
  return `${model}|${cadenceBucketMs(cadenceS)}`;
}

function loadFromStorage(): Record<string, FOptimizerCacheEntry> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return {};
    const parsed = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    // We do not aggressively validate each entry — a malformed payload
    // gets a `JSON.parse` throw above (caught by the outer try). If the
    // shape evolves, bump `STORAGE_KEY` (e.g. `.v2`); the old payload
    // becomes a no-op.
    return parsed as Record<string, FOptimizerCacheEntry>;
  } catch (e) {
    console.warn('[optimize-f-cache] failed to read localStorage, ignoring:', e);
    return {};
  }
}

function saveToStorage(entries: Record<string, FOptimizerCacheEntry>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (e) {
    // QuotaExceeded or storage disabled — log and continue. Failing
    // loudly here would prevent the user from using the optimizer at
    // all if their browser has localStorage disabled, which is a
    // worse UX than silently losing the cache between sessions.
    console.warn('[optimize-f-cache] failed to write localStorage:', e);
  }
}

/**
 * Per-process reactive snapshot of the cache. Mutations go through the
 * exported functions below so this stays the single source of truth
 * (and so localStorage stays in sync). The ref is initialized once
 * from localStorage on module load.
 */
const _entries: Ref<Record<string, FOptimizerCacheEntry>> = ref(
  loadFromStorage(),
);

/** Reactive read-only view; reassigns on every mutation so `watch`/`computed` fire. */
export const entries = readonly(_entries);

export function getEntry(
  model: string,
  cadenceS: number,
): FOptimizerCacheEntry | null {
  return _entries.value[cacheKey(model, cadenceS)] ?? null;
}

export function setEntry(entry: FOptimizerCacheEntry): void {
  const key = `${entry.model}|${entry.cadenceBucketMs}`;
  _entries.value = { ..._entries.value, [key]: entry };
  saveToStorage(_entries.value);
}

export function removeEntry(model: string, cadenceS: number): void {
  const key = cacheKey(model, cadenceS);
  if (!(key in _entries.value)) return;
  const { [key]: _, ...rest } = _entries.value;
  _entries.value = rest;
  saveToStorage(_entries.value);
}

export function clearAll(): void {
  _entries.value = {};
  saveToStorage(_entries.value);
}

/** Snapshot of all entries as an array, sorted by (model, bucket). */
export function listEntries(): readonly FOptimizerCacheEntry[] {
  return Object.values(_entries.value).sort((a, b) => {
    if (a.model !== b.model) return a.model.localeCompare(b.model);
    return a.cadenceBucketMs - b.cadenceBucketMs;
  });
}

/**
 * Wire-side consultation helper. Returns the cached F (in seconds) if
 * an entry exists for the given `(model, cadence)` bucket; otherwise
 * `null`, letting the call site fall back to the user's slider value.
 *
 * Tolerates `model === null` (no SELECTOR selection) by returning
 * `null` directly — without a model identifier the cache has no
 * applicable entry.
 *
 * Reads the reactive `_entries` ref under the hood, so the caller
 * naturally picks up cache updates without needing to subscribe.
 */
export function effectiveFirstReportS(
  model: string | null,
  cadenceS: number,
): number | null {
  if (model === null) return null;
  return _entries.value[cacheKey(model, cadenceS)]?.fS ?? null;
}

/**
 * Recommend a cadence (in seconds) for the given model, derived from
 * the cache history. The recommendation is "the smallest cadence
 * bucket for which the optimizer found a recommendation that saves at
 * least `minSavingsMs` over no-F". Returns `null` when:
 *   - `model` is `null` (no SELECTOR selection);
 *   - or the cache has no useful entries for this model yet.
 *
 * The midpoint of the bucket is returned (bucket + 25 ms), so applying
 * the recommendation produces a cadence solidly inside the bucket
 * rather than at its edge.
 *
 * Rationale: a cadence is "useful for this model" iff the F-optimizer
 * found a working F there that materially beat no-F. Cadences smaller
 * than the model's eval cost typically don't qualify (the cliff is
 * above F_max and the algorithm returns null); cadences larger than
 * needed waste first-paint time. The smallest useful bucket is the
 * sweet-spot heuristic this function picks.
 */
export function recommendedCadenceS(
  model: string | null,
  minSavingsMs: number = 50,
): number | null {
  if (model === null) return null;
  const candidates = Object.values(_entries.value).filter(
    (e) => e.model === model && e.savingsMs >= minSavingsMs,
  );
  if (candidates.length === 0) return null;
  const smallest = candidates.reduce((a, b) =>
    a.cadenceBucketMs < b.cadenceBucketMs ? a : b,
  );
  return (smallest.cadenceBucketMs + 25) / 1000;
}
