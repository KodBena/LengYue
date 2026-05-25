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
export const CURRENT_SCHEMA_VERSION = 49;

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
  // 46 → 47: backfill `profile.settings.appearance.moveSuggestionsFadeMs`
  // (number, default 60) and register the two new display-domain
  // animation knobs (`display.move-suggestions-fade-ms` and
  // `display.pv-fade-ms`) in the persisted knob-priorities block.
  // The new appearance field promotes the prior hardcoded inline
  // `transition: opacity 60ms ease` in MoveSuggestions.vue to a
  // user-controlled knob; the PV-fade knob just registers an entry
  // for the pre-existing `session.ui.pvAnimation.fadeDurationMs`
  // field so it surfaces in the toolbar slider popover alongside
  // the new one.
  //
  // Idempotent: pre-existing values (the appearance field, or the
  // priority entries in the knobs block) are preserved unchanged.
  // The default 60 reproduces the historical inline behaviour;
  // setting it to 0 disables the suggestion-ring/disk fade.
  (blob: any) => {
    const out = structuredClone(blob);
    const appearance = out.settings?.appearance;
    if (appearance && typeof appearance === 'object') {
      const a = appearance as { moveSuggestionsFadeMs?: unknown };
      if (typeof a.moveSuggestionsFadeMs !== 'number') {
        a.moveSuggestionsFadeMs = 60;
      }
    }
    // The knobs block in defaults.ts seeds the two new KnobDecls
    // for fresh profiles; here we only need to ensure persisted
    // priority overrides (if any) don't drop the new ids. If the
    // user has a custom priorities map under
    // `session.knobPriorityOverrides` (or similar), the registry
    // validator will accept missing ids as "use the decl's default";
    // we don't have to inject anything.
    return out;
  },
  // 47 → 48: retire the KataGo F-optimizer cohort. The optimizer
  // was an SPA-side workaround for `lightvector/KataGo#1197` — the
  // engine refusing to ship the first during-search report until
  // a cadence-aligned eval-completion tick. The bug was fixed
  // upstream against KataGo 1.16.5; this migration walks
  // pre-fix workspaces forward by:
  //
  //   1. Rewriting the persisted
  //      `engine.first-report-during-search-after` decl's
  //      `inputs[0].minFloor` from the workaround value 0.035 down
  //      to the KataGo protocol-documented minimum 0.001 (the
  //      KATAGO_FIRST_REPORT_FLOOR_S constant's current value).
  //      Idempotent — already-0.001 leaves and absent fields pass
  //      through.
  //
  //   2. Clearing the orphan `lengyue.fOptimizerCache.v1`
  //      localStorage key (per-machine cache of optimizer results;
  //      no longer read by any code path). Side-effect departure
  //      from the migration ledger's normal blob-only discipline,
  //      taken once at this retirement point. `removeItem` is
  //      idempotent and a no-op when the key is absent.
  //
  // See `docs/notes/retrospective-katago-f-optimizer-2026-05.md`
  // and `docs/worklog/2026-05-25-katago-f-optimizer-retirement.md`
  // for the arc.
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
            if (typeof f === 'number' && f > 0.001) {
              (first as { minFloor?: unknown }).minFloor = 0.001;
            }
          }
        }
      }
    }
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('lengyue.fOptimizerCache.v1');
      }
    } catch {
      // localStorage may be disabled by the browser or unavailable
      // in non-browser environments (tests, SSR). The orphan key
      // is cosmetic — not clearing it is harmless once nothing
      // reads it — so swallow the failure here.
    }
    return out;
  },
  // 48 → 49: corrective for the 47 → 48 above. The first attempt
  // at the F-optimizer-retirement migration walked
  // `out.settings?.knobs` instead of the correct
  // `out.profile?.settings?.knobs` and silently did nothing on
  // every blob, stamping to v48 without rewriting the persisted
  // `minFloor`. Caught locally by the project author before the
  // arc shipped beyond the dev branch; the in-place fix above
  // restores the v47 → v48 path for any blob still at v47, and
  // this migration catches up any v48 blob the broken version
  // ran against.
  //
  // Body is the same `minFloor: > 0.001 → 0.001` rewrite as 47 →
  // 48 above, with the correct path. localStorage cleanup is
  // not repeated — it was the one side-effect of the 47 → 48
  // migration's body that worked correctly (no path dependency),
  // and `removeItem` had already cleared the orphan cache key
  // when the v48 stamp landed.
  //
  // Idempotent: a v48 blob that was created by a fresh install
  // (i.e. populated from defaults.ts at v48, with `minFloor`
  // already at 0.001) passes through unchanged.
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
            if (typeof f === 'number' && f > 0.001) {
              (first as { minFloor?: unknown }).minFloor = 0.001;
            }
          }
        }
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
