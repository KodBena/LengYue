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
export const CURRENT_SCHEMA_VERSION = 51;

/**
 * Append-only ordered list of migrations. `migrations[i]`
 * migrates from version `(i + 1)` to `(i + 2)`.
 *
 * The first `N` entries (currently 1 → 2 through 38 → 39) are
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
  // 49 → 50: backfill `profile.settings.engine.katago.analysisAutoSave`
  // (boolean, default false). The auto-save policy for the
  // experimental analysis-persistence feature lands as an opt-in
  // toggle in the registry editor under engine → katago, gated on
  // the parent `analysisStorageEnabled`. See
  // `composables/useAutoSaveAnalyses.ts` for the policy and
  // `AppSettings.engine.katago.analysisAutoSave` in `types.ts` for
  // the contract.
  //
  // Idempotent: a pre-existing boolean is preserved unchanged so a
  // forward-compat install that already flipped the toggle keeps
  // its choice.
  (blob: any) => {
    const out = structuredClone(blob);
    const katago = out.profile?.settings?.engine?.katago;
    if (katago && typeof katago === 'object') {
      const k = katago as { analysisAutoSave?: unknown };
      if (typeof k.analysisAutoSave !== 'boolean') {
        k.analysisAutoSave = false;
      }
    }
    return out;
  },
  // 50 → 51: backfill
  // `profile.settings.engine.katago.bundleCompressionScheme`
  // (string enum from `BUNDLE_COMPRESSION_SCHEMES` in types.ts,
  // default 'v1'). The wire-format choice for analysis-bundle
  // persistence — the cross/analysis-bundle-compression-v2 arc's
  // lossless + lossy leaves. Default 'v1' preserves the
  // historical wire shape; users opt into 'v2-projected' (the
  // lossless projection win) or 'v2-quantized' (projection +
  // Q4 ownership + Q8-factored policy, the leader from the
  // research arc) via the registry editor. See
  // AppSettings.engine.katago.bundleCompressionScheme in
  // types.ts for the contract.
  //
  // Transition mapping the body handles (this migration is still
  // pre-merge on the cross/ branch; values weren't user-visible
  // before the dropdown landed, so an in-place body edit is
  // acceptable here rather than a sibling correction migration):
  //   - Pre-existing branch-test value 'v1-json' → 'v1'.
  //   - Pre-existing branch-test value 'json-projected-v1' →
  //     'v2-projected'.
  //   - Already-valid current values ('v1' / 'v2-projected' /
  //     'v2-quantized') → preserved unchanged.
  //   - Anything else (typo, hand-edited blob, future scheme
  //     downgraded into a present client) → reset to 'v1' (the
  //     safe default: the SPA never tries to write a wire shape
  //     it can't construct). This is the silent-default
  //     exception ADR-0002 names for non-load-bearing config
  //     drift — the user-visible effect is "your saves go via
  //     v1 instead of v2"; data integrity is preserved.
  (blob: any) => {
    const out = structuredClone(blob);
    const katago = out.profile?.settings?.engine?.katago;
    if (katago && typeof katago === 'object') {
      const k = katago as { bundleCompressionScheme?: unknown };
      const v = k.bundleCompressionScheme;
      if (v === 'v1' || v === 'v2-projected' || v === 'v2-quantized') {
        // already valid
      } else if (v === 'v1-json') {
        k.bundleCompressionScheme = 'v1';
      } else if (v === 'json-projected-v1') {
        k.bundleCompressionScheme = 'v2-projected';
      } else {
        k.bundleCompressionScheme = 'v1';
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
