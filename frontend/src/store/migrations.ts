/**
 * src/store/migrations.ts
 * Schema versioning for the persisted workspace blob.
 *
 * SyncService PUTs the full GlobalStore-shaped blob to
 * /documents/{user_workspace_01}; on hydrate it GETs the same
 * shape back. When the GlobalStore shape evolves (a field
 * renames, a default changes, an enum reshuffles, an identifier
 * is de-branded), older blobs stored before the change must be
 * brought forward to the current shape. This module owns that
 * forward migration.
 *
 * ── Versioning scheme ─────────────────────────────────────────────
 * Integers, monotonically increasing. CURRENT_SCHEMA_VERSION
 * starts at 1 (this module's introduction) and increments by 1
 * each time the blob shape changes. Each migration takes a blob
 * at version N and returns the blob at version N+1.
 *
 * ── Active vs archived ────────────────────────────────────────────
 * Pre-v1.0.0 migrations (1 → 2 through 8 → 9) live in
 * `archived-migrations.ts`, prepended into the `migrations` array
 * via spread. Active development happens in this file; the archive
 * exists to keep the migration ledger contiguous so any blob in
 * the wild can still walk forward deterministically (the
 * append-only invariant below depends on the contiguous indexing).
 *
 * ── Append-only invariant ──────────────────────────────────────────
 * Once a migration ships, it is never modified. Bugs in a
 * shipped migration are addressed by adding a NEW migration
 * later that compensates. This keeps the migration ledger a
 * stable record that any blob in the wild can be migrated
 * through deterministically.
 *
 * ── To add a migration ─────────────────────────────────────────────
 *   1. Bump CURRENT_SCHEMA_VERSION below to N+1.
 *   2. Append a function to the `migrations` array that takes
 *      the v-N blob and returns the v-N+1 blob.
 *   3. Document the migration's intent in a comment immediately
 *      above the function. Name the fields it touches and why.
 *   4. Test by: (a) constructing a synthetic v-N blob, (b)
 *      calling migrate() on it, (c) asserting the result.
 *
 * ── Missing schemaVersion (legacy blobs) ───────────────────────────
 * Treated as version 1 — the version at this framework's
 * introduction. Pre-framework blobs have the same physical
 * shape as v1 blobs by definition (the framework introduction
 * doesn't change the shape, only stamps the marker), so the
 * implicit version is exactly 1. The marker is added on the
 * next save.
 *
 * ── Failure contract (ADR-0002) ────────────────────────────────────
 * Migration failures throw rather than silently coerce. Two
 * specific failure modes:
 *
 *   - Future-version blob (rolled-back code, or schema bump that
 *     hasn't propagated): throws. Calling code (typically
 *     SyncService.hydrate via store.updateFromRemote) catches
 *     and surfaces a user-visible error message; the blob is not
 *     applied; the workspace stays at defaults; no saves fire.
 *     The user knows their workspace did not load and the
 *     too-new data on the backend is preserved unchanged.
 *
 *   - Missing migration for a required step: throws. This
 *     shouldn't happen given the append-only discipline above;
 *     the throw is a defensive check for the case where someone
 *     bumps CURRENT_SCHEMA_VERSION without registering the
 *     migration.
 *
 * License: Public Domain (The Unlicense)
 */

import { archivedMigrations, type Migration } from './archived-migrations';

/**
 * The current schema version. Bump only when the GlobalStore
 * persistence shape changes in a way that prior blobs need
 * forward-migration. Pair every bump with a new entry in the
 * migrations array below.
 */
export const CURRENT_SCHEMA_VERSION = 36;

/**
 * Append-only ordered list of migrations. `migrations[i]`
 * migrates from version `(i + 1)` to `(i + 2)`.
 *
 * The first `N` entries (currently 1 → 2 through 33 → 34) are
 * spread in from `archived-migrations.ts`; the rest live below.
 *
 * ── Rolling-archive discipline (2026-05-14) ────────────────────
 * The active body of this file keeps **exactly the latest two
 * migrations** as style anchors. When a PR adds migration
 * `N+1` (bumping `CURRENT_SCHEMA_VERSION`), the same PR moves
 * migration `N-1` from this body into `archived-migrations.ts`.
 * Steady state: two migrations live here; everything older
 * lives in the archive. Per ADR-0007 (file-size discipline);
 * the prior unified file had grown to ~50 KB / 1100+ lines,
 * well past the 200-line target the ADR calls for.
 *
 * Runtime correctness: the spread above preserves
 * `migrations[i]` indexing for `migrate()`'s `version - 1`
 * walker. Moving a migration is a pure cut-and-paste; bodies
 * are frozen as they shipped (a migration is the contract
 * with the persisted-blob population, not a refactor target).
 * ───────────────────────────────────────────────────────────────
 */
export const migrations: Migration[] = [
  ...archivedMigrations,
  // 34 → 35: Card-metadata inline-edit arc 1 backfill on persisted
  // review queues. Cards fetched FRESH from the backend always
  // carry `tags: string[]` (the ACL coerces `undefined → []` at the
  // boundary), but cards persisted in `session.reviews[boardId].queue`
  // pre-date the arc-1 wire-shape addition and lack the field
  // entirely. The inline-edit panel (arc 2 consumer) crashes on
  // `[...card.tags]` when iterating undefined — runtime symptom:
  // "can't access property Symbol.iterator, props.card.tags is
  // undefined" caught by `RootErrorBoundary` after starting a
  // review session against a pre-arc-1 persisted queue.
  //
  // Backfill: walk every active review queue's cards and set
  // `tags: []` on any card missing the field. Idempotent — an
  // existing array is preserved unchanged. Matches the ACL's
  // empty-default semantic (the card simply has no tags, which
  // is what `tags: []` says on the wire).
  (blob: any) => {
    const out = structuredClone(blob);
    const reviews = out.session?.reviews;
    if (reviews && typeof reviews === 'object') {
      for (const sessionData of Object.values(reviews as Record<string, unknown>)) {
        if (!sessionData || typeof sessionData !== 'object') continue;
        const queue = (sessionData as { queue?: unknown }).queue;
        if (!Array.isArray(queue)) continue;
        for (const card of queue) {
          if (!card || typeof card !== 'object') continue;
          if (!Array.isArray((card as { tags?: unknown }).tags)) {
            (card as { tags?: unknown }).tags = [];
          }
        }
      }
    }
    return out;
  },
  // 35 → 36: Knob-registry substrate seed (knob-registry-plan Phase 1).
  // Backfills the new `profile.settings.knobs` field with an empty
  // object on existing blobs (matching the fresh-install default in
  // `store/defaults.ts`). The substrate is the SSOT for user-
  // controllable variables — Phase 1 ships the empty registry plus
  // the type vocabulary and path-walk accessors in `src/lib/knobs.ts`;
  // Phase 3+ promotions populate the registry as scalars lift off of
  // inline literals. No consumer side-effects until then. See
  // `AppSettings.knobs` in `types.ts` and
  // `docs/notes/knob-registry-plan.md` for the design.
  //
  // Idempotent: an existing plain-object value is preserved
  // unchanged; missing / non-object gets `{}`.
  (blob: any) => {
    const out = structuredClone(blob);
    const settings = out.profile?.settings;
    if (settings && typeof settings === 'object') {
      const existing = (settings as { knobs?: unknown }).knobs;
      const isPlainObject =
        existing !== null &&
        typeof existing === 'object' &&
        !Array.isArray(existing);
      if (!isPlainObject) {
        (settings as { knobs?: unknown }).knobs = {};
      }
    }
    return out;
  },
];

/**
 * Bring a persisted blob up to CURRENT_SCHEMA_VERSION. Returns
 * the migrated blob with `schemaVersion` stamped. Throws if the
 * blob is at a future version, or if a required migration is
 * missing.
 */
export function migrate(blob: any): any {
  let version = typeof blob?.schemaVersion === 'number' ? blob.schemaVersion : 1;

  if (version > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `Persisted blob is at schemaVersion ${version}, ahead of this app's ` +
      `${CURRENT_SCHEMA_VERSION}. App code may be older than the data.`,
    );
  }

  let current = blob;
  while (version < CURRENT_SCHEMA_VERSION) {
    const m = migrations[version - 1];
    if (!m) {
      throw new Error(
        `No migration registered for schemaVersion ${version} → ${version + 1}. ` +
        `Append-only migrations must be registered before bumping CURRENT_SCHEMA_VERSION.`,
      );
    }
    current = m(current);
    version++;
  }

  return { ...current, schemaVersion: version };
}
