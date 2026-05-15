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
export const CURRENT_SCHEMA_VERSION = 44;

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
  // 42 → 43: KataGo first-report-after upstream-cliff floor. Adds
  // `inputs[0].minFloor = 0.035` to the persisted
  // `engine.first-report-during-search-after` KnobDecl so existing
  // users' slider widget enforces the floor exactly as fresh
  // installs do. Companion to the wire-side clamp in
  // `services/analysis-service.ts` that reads
  // `KATAGO_FIRST_REPORT_FLOOR_S` from `engine/katago/limits.ts`.
  //
  // The floor is the empirically-characterised SPA-side workaround
  // for an upstream KataGo cliff at ~25 ms — KataGo silently
  // substitutes the cadence value for sub-floor first-report
  // timings. Diagnosis arc and reproducers are staged at
  // `~/katago_bugreport`; the umbrella worklog at
  // `docs/worklog/2026-05-15-katago-first-report-cliff-diagnosis.md`
  // names the upstream-bug filing trigger that would let this
  // floor (and this migration's annotation) retire.
  //
  // Idempotent: a decl whose `inputs[0].minFloor` is already a
  // finite number is preserved unchanged (a user-tuned value, or
  // a forward-compat install where this migration has already
  // run). A decl whose `inputs[0]` shape doesn't match what the
  // cadence-knobs migration seeded is left alone — defensive
  // against hand-edited blobs.
  //
  // Hardcodes 0.035 (the value of `KATAGO_FIRST_REPORT_FLOOR_S`
  // at the time of authoring) rather than importing the
  // constant, per migrations.ts's append-only invariant: a
  // shipped migration's behaviour is frozen, and importing a
  // mutable constant would let a future change silently retroactively
  // alter what blobs in the wild were migrated to.
  (blob: any) => {
    const out = structuredClone(blob);
    const knobs = out.profile?.settings?.knobs;
    if (knobs && typeof knobs === 'object' && !Array.isArray(knobs)) {
      const decl = (knobs as Record<string, unknown>)['engine.first-report-during-search-after'];
      if (decl && typeof decl === 'object') {
        const inputs = (decl as { inputs?: unknown }).inputs;
        if (Array.isArray(inputs) && inputs.length > 0) {
          const first = inputs[0];
          if (first && typeof first === 'object') {
            const f = (first as { minFloor?: unknown }).minFloor;
            if (typeof f !== 'number' || !Number.isFinite(f)) {
              (first as { minFloor?: unknown }).minFloor = 0.035;
            }
          }
        }
      }
    }
    return out;
  },
  // 43 → 44: backfill `session.ui.loadSgfAtLastNode` (boolean,
  // default false). The flag opts the user into a post-load walk
  // to the active variation's leaf in `useSgfLoader.loadFile` —
  // SGF file uploads land on the final mainline position instead
  // of the root. Defaults to false on existing blobs to preserve
  // the historical "land on root after SGF upload" behaviour.
  //
  // Idempotent: a pre-existing boolean is preserved unchanged (a
  // user who toggled the setting via the Settings registry and
  // then somehow ran a hand-edited blob through this migration
  // keeps their choice).
  (blob: any) => {
    const out = structuredClone(blob);
    const ui = out.session?.ui;
    if (ui && typeof ui === 'object') {
      const u = ui as { loadSgfAtLastNode?: unknown };
      if (typeof u.loadSgfAtLastNode !== 'boolean') {
        u.loadSgfAtLastNode = false;
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
