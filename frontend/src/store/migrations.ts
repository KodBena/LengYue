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
 *   3. Resolve every blob container the body reads or writes
 *      through `witnessedContainer(out, 'path.to.container')`
 *      (the leaf-assertion helper, in `migration-witness.ts` and
 *      re-exported here) instead of a raw
 *      optional chain. A typo'd path then fails loudly against
 *      the runtime-shape witness instead of silently no-oping
 *      and stamping the version anyway — the 47 → 48 incident
 *      class (see the 48 → 49 corrective in
 *      `archived-migrations.ts`).
 *   4. Document the migration's intent in a comment immediately
 *      above the function. Name the fields it touches and why.
 *   5. Test by: (a) constructing a synthetic v-N blob, (b)
 *      calling migrate() on it, (c) asserting the result. The
 *      store-round-trip composition test
 *      (`tests/integration/migration-store-roundtrip.test.ts`)
 *      pins the key-set the corpus produces against the save
 *      path; a backfill migration that silently no-ops shows up
 *      there as an unexplained defaults-only key.
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
 * ── Dev-only hazard: HMR + version bump ───────────────────────────
 * In `npm run dev`, Vite hot-reloads modules in-process without
 * re-running `updateFromRemote`. If this module is hot-swapped
 * with a bumped CURRENT_SCHEMA_VERSION, the in-memory store still
 * carries un-migrated content; the next debounced save then stamps
 * the new version onto that content and poisons the persisted
 * blob (claims migrated, body wasn't). On any subsequent cold
 * hydrate the walker won't re-run because version >= target — the
 * silent failure ADR-0002 forbids, in the dev register.
 *
 * Mitigation: the `import.meta.hot.accept(() => location.reload())`
 * guard below opts this module out of in-process HMR — any edit
 * triggers a full page reload, which forces a fresh hydrate so
 * the migration runs on the un-migrated remote blob the way
 * production users will experience it. The same call lives in
 * `archived-migrations.ts` (rolling-archive moves are migration
 * edits) so the guard holds across both files.
 *
 * Recovery for a poisoned blob: SQL-demote the blob's
 * schemaVersion to the prior value (`UPDATE documents SET data =
 * json_set(data, '$.schemaVersion', N-1) WHERE ...`); the next
 * cold reload migrates correctly.
 *
 * License: Public Domain (The Unlicense)
 */

import { archivedMigrations, type Migration } from './archived-migrations';
// `witnessedContainer` and its runtime-shape witness live in their own
// leaf module (`migration-witness.ts`) so both this file's active bodies
// and `archived-migrations.ts`'s aged-out bodies can call it without a
// module cycle (the dependency arrow already runs migrations → archived).
// Re-exported below so existing importers keep `from './migrations'`.
import { witnessedContainer } from './migration-witness';
export { witnessedContainer };

// See "Dev-only hazard" above. The accept-then-reload pattern
// intercepts the HMR update and forces a full page reload
// instead. No-op in production builds — `import.meta.hot` is
// undefined when Vite emits the production bundle, so this
// guard exists only in `npm run dev`.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());

/**
 * The current schema version. Bump only when the GlobalStore
 * persistence shape changes in a way that prior blobs need
 * forward-migration. Pair every bump with a new entry in the
 * migrations array below.
 */
export const CURRENT_SCHEMA_VERSION = 72;

/**
 * Append-only ordered list of migrations. `migrations[i]`
 * migrates from version `(i + 1)` to `(i + 2)`.
 *
 * The first `N` entries (currently 1 → 2 through 69 → 70) are
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
  // 70 → 71: median-summary symbol (ledger rows 1204/1213/1229,
  // commissioner-defined) — two concerns under the discipline "add the
  // new capability, repoint only what nobody has customised away."
  //
  //  (a) Seed expansion: add the `median_summary` symbol
  //      (`float(median(x))`) to `analysis_env.symbols` only when
  //      absent — same add-if-absent shape as the 6 → 7 archived
  //      body's `mean_summary` seed-expansion precedent
  //      (`archived-migrations.ts`'s `NEW_SYMBOLS` table). `median` is
  //      curated stdlib on both sides of the bit-equivalence contract
  //      (see the doc comment above `defaults.ts`'s summary-functions
  //      block; verified against `engine/analysis-config-curation.ts`'s
  //      curated-name list), so the body is a direct `min_summary` /
  //      `mean_summary` sibling, not a bespoke formula. Add-if-absent is
  //      BY KEY, never by inferred intent (commissioner clarification,
  //      ledger row 1235): a profile that already carries a
  //      `median_summary` key — even a hand-authored one with a
  //      different body — keeps that body verbatim; a hand-written
  //      median under any OTHER key (e.g. `my_median`) simply coexists
  //      with the newly-seeded `median_summary` default, untouched and
  //      unmerged.
  //
  //  (b) Conditional repoint: the `quality` palette's `summary_fn`
  //      moves from `min_summary` to `median_summary` ONLY when it
  //      still reads exactly `min_summary` — a user who customised
  //      that palette's summary function keeps their choice untouched.
  //      Same by-id-lookup-then-conditional-field shape as the 6 → 7
  //      archived body's broken-seed detection
  //      (`archived-migrations.ts`'s `defaultPalette.summary_fn ===
  //      'min_summary'` check), scoped here to the `quality` id instead
  //      of `default`.
  //
  //  `activePaletteId` is deliberately NOT touched here: existing users
  //  keep whatever palette they're on. The default-for-fresh-profiles
  //  change (`quality` → `score`) lives only in `defaults.ts` and reaches
  //  new profiles through `defaultAppSettings()`, per the "wizard binds
  //  this cell for fresh profiles only" ratified design.
  //
  // Container witnessed against the runtime shape:
  // `profile.settings.engine.katago.analysis_env` exists from the
  // framework's introduction, so a typo'd path fails loudly here rather
  // than no-oping and stamping the version.
  //
  // Idempotent: a pre-existing `median_summary` symbol is preserved
  // unchanged; a `quality` palette whose `summary_fn` is anything other
  // than the exact string `min_summary` (including an already-repointed
  // `median_summary`, or a user's own customisation such as
  // `mean_summary`) is left untouched.
  (blob: any) => {
    const out = structuredClone(blob);
    const ae = witnessedContainer(out, 'profile.settings.engine.katago.analysis_env');
    if (ae) {
      const a = ae as { symbols?: unknown; palettes?: unknown };

      // (a) Seed expansion — add only if absent.
      if (a.symbols && typeof a.symbols === 'object') {
        const symbols = a.symbols as Record<string, unknown>;
        if (symbols.median_summary === undefined) {
          symbols.median_summary = 'float(median(x))';
        }
      }

      // (b) Conditional repoint of the `quality` palette's `summary_fn`.
      if (Array.isArray(a.palettes)) {
        const qualityPalette = a.palettes.find(
          (p: any) => p && typeof p === 'object' && p.id === 'quality',
        );
        if (qualityPalette && qualityPalette.summary_fn === 'min_summary') {
          qualityPalette.summary_fn = 'median_summary';
        }
      }
    }
    return out;
  },
  // 71 → 72: root-delta score loss (ledger rows 1380/1381/1383/1378,
  // commissioner-defined) — the same two-concern shape as 70 → 71
  // immediately above: "add the new capability, repoint only what
  // nobody has customised away."
  //
  //  (a) Seed expansion: add the `scoreLead_root_loss` symbol
  //      (`store/defaults.ts`'s derivation comment on the symbol has
  //      the full perspective derivation) to `analysis_env.symbols`
  //      only when absent — same add-if-absent-BY-KEY shape as
  //      70 → 71's `median_summary` seed (commissioner clarification,
  //      ledger row 1235, applies identically here): a profile that
  //      already carries a `scoreLead_root_loss` key — even a
  //      hand-authored one with a different body — keeps that body
  //      verbatim.
  //
  //  (b) Conditional repoint: the `score` palette's `delta_fn` moves
  //      from `scoreLead_loss_topvsuser` to `scoreLead_root_loss`
  //      ONLY when it still reads exactly `scoreLead_loss_topvsuser`
  //      — a user who repointed that palette's `delta_fn` elsewhere
  //      (via PaletteEditor) keeps their choice untouched. Same
  //      by-id-lookup-then-conditional-field shape as 70 → 71's
  //      `quality`/`summary_fn` repoint, scoped here to the `score`
  //      id and the `delta_fn` field.
  //
  //  `delta_ordering` is deliberately NOT touched: `scoreLead_root_loss`
  //  is a higher-is-worse loss form exactly like the symbol it
  //  replaces (see the derivation comment), so the `score` palette's
  //  existing `delta_ordering: 'higher_is_worse'` stays correct
  //  as-is — no migration action needed for that field.
  //
  // Container witnessed against the runtime shape:
  // `profile.settings.engine.katago.analysis_env` exists from the
  // framework's introduction, so a typo'd path fails loudly here rather
  // than no-oping and stamping the version.
  //
  // Idempotent: a pre-existing `scoreLead_root_loss` symbol is
  // preserved unchanged; a `score` palette whose `delta_fn` is
  // anything other than the exact string `scoreLead_loss_topvsuser`
  // (including an already-repointed `scoreLead_root_loss`, or a
  // user's own customisation) is left untouched.
  (blob: any) => {
    const out = structuredClone(blob);
    const ae = witnessedContainer(out, 'profile.settings.engine.katago.analysis_env');
    if (ae) {
      const a = ae as { symbols?: unknown; palettes?: unknown };

      // (a) Seed expansion — add only if absent.
      if (a.symbols && typeof a.symbols === 'object') {
        const symbols = a.symbols as Record<string, unknown>;
        if (symbols.scoreLead_root_loss === undefined) {
          symbols.scoreLead_root_loss =
            'player_sign(x[0]) * (x[1]["rootInfo"]["scoreLead"] - x[0]["rootInfo"]["scoreLead"])';
        }
      }

      // (b) Conditional repoint of the `score` palette's `delta_fn`.
      if (Array.isArray(a.palettes)) {
        const scorePalette = a.palettes.find(
          (p: any) => p && typeof p === 'object' && p.id === 'score',
        );
        if (scorePalette && scorePalette.delta_fn === 'scoreLead_loss_topvsuser') {
          scorePalette.delta_fn = 'scoreLead_root_loss';
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
