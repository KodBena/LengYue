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
export const CURRENT_SCHEMA_VERSION = 11;

/**
 * Append-only ordered list of migrations. `migrations[i]`
 * migrates from version `(i + 1)` to `(i + 2)`.
 *
 * Indices 0–7 are the archived pre-v1.0.0 set (1 → 2 through
 * 8 → 9), spread in from `archived-migrations.ts`. New entries
 * below; their position implicitly determines the version step.
 */
export const migrations: Migration[] = [
  ...archivedMigrations,
  // 9 → 10: Surface PV-preview animation knobs in the registry. v9 had
  // no `session.ui.pvAnimation` field; the prop on `MoveSuggestions.vue`
  // was wired but no caller ever populated it, so the composable
  // always fell back to its hard-coded defaults. v10 introduces
  // `session.ui.pvAnimation` carrying the full PvAnimationSettings
  // shape; the registry editor renders it automatically. Defaults
  // mirror `composables/use-pv-animation.ts::PV_DEFAULTS` and
  // `defaults.ts::defaultSessionUI.pvAnimation` (three sources of
  // truth that must agree). Idempotent: each field is normalised
  // individually, so a partial or hand-edited blob is filled in
  // without overwriting valid user values.
  (blob: any) => {
    const out = structuredClone(blob);
    if (out.session?.ui) {
      const e = out.session.ui.pvAnimation;
      const validMode = (v: unknown): v is 'instant' | 'sequential' | 'window' =>
        v === 'instant' || v === 'sequential' || v === 'window';
      const validAnnotation = (v: unknown): v is 'none' | 'from1' | 'fromCurrent' =>
        v === 'none' || v === 'from1' || v === 'fromCurrent';
      out.session.ui.pvAnimation = {
        mode:             validMode(e?.mode) ? e.mode : 'instant',
        stepDelayMs:      typeof e?.stepDelayMs      === 'number'  ? e.stepDelayMs      : 350,
        windowDurationMs: typeof e?.windowDurationMs === 'number'  ? e.windowDurationMs : 600,
        fadeDurationMs:   typeof e?.fadeDurationMs   === 'number'  ? e.fadeDurationMs   : 150,
        cycle:            typeof e?.cycle            === 'boolean' ? e.cycle            : false,
        pvOpacity:        typeof e?.pvOpacity        === 'number'  ? e.pvOpacity        : 1,
        annotation:       validAnnotation(e?.annotation) ? e.annotation : 'fromCurrent',
      };
    }
    return out;
  },
  // 10 → 11: Card-set context-id repotting (per-tab ephemeral context).
  // The pipeline DSL is "a strategy parameterised by context"; baking
  // `contextIds` into the CardSet itself conflated argument with
  // declaration. v11 drops `contextIds` from each `cardSets[*]` and
  // seeds two new per-tab fields:
  //
  //   session.ui.srContextIds       — used by the SR tab
  //   session.ui.databaseContextIds — used by the Database "Decks" panel
  //
  // Seeding rule: prefer the active CardSet's prior `contextIds` (best-
  // guess preservation of the user's setup); fall back to any CardSet's
  // `contextIds`; fall back to `[3]` (matches the prior hardcoded
  // default in defaults.ts). Idempotent: an existing valid array on
  // either per-tab field is preserved.
  (blob: any) => {
    const out = structuredClone(blob);

    // Determine the seed value before mutating.
    const cardSets = out.profile?.cardSets;
    const activeId = out.session?.ui?.activeCardSetId;
    let seed: number[] = [3];
    if (cardSets && typeof cardSets === 'object') {
      const cleanArray = (v: unknown): number[] | null =>
        Array.isArray(v) && v.every(n => typeof n === 'number') && v.length > 0
          ? (v as number[])
          : null;

      const fromActive = activeId ? cleanArray(cardSets[activeId]?.contextIds) : null;
      if (fromActive) {
        seed = fromActive;
      } else {
        for (const key of Object.keys(cardSets)) {
          const fromAny = cleanArray(cardSets[key]?.contextIds);
          if (fromAny) { seed = fromAny; break; }
        }
      }
    }

    // Drop contextIds from each card set.
    if (cardSets && typeof cardSets === 'object') {
      for (const key of Object.keys(cardSets)) {
        const cs = cardSets[key];
        if (cs && typeof cs === 'object' && 'contextIds' in cs) {
          delete cs.contextIds;
        }
      }
    }

    // Seed per-tab fields, preserving any pre-existing valid array.
    if (out.session?.ui) {
      const validArr = (v: unknown): v is number[] =>
        Array.isArray(v) && v.every(n => typeof n === 'number');
      if (!validArr(out.session.ui.srContextIds)) {
        out.session.ui.srContextIds = [...seed];
      }
      if (!validArr(out.session.ui.databaseContextIds)) {
        out.session.ui.databaseContextIds = [...seed];
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
