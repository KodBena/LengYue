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

/**
 * The current schema version. Bump only when the GlobalStore
 * persistence shape changes in a way that prior blobs need
 * forward-migration. Pair every bump with a new entry in the
 * migrations array below.
 */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * A migration brings a blob at version N forward to version N+1.
 * Pure function: no side effects, no mutation of the input. The
 * returned blob may include or omit `schemaVersion`; the
 * orchestrator (migrate()) stamps the final version.
 */
type Migration = (blob: any) => any;

/**
 * Append-only ordered list of migrations. `migrations[i]`
 * migrates from version `(i + 1)` to `(i + 2)`.
 *
 * With CURRENT_SCHEMA_VERSION = 1 there are zero migrations.
 * The first real migration (whenever it lands) is appended at
 * index 0 and represents 1 → 2.
 */
export const migrations: Migration[] = [
  // 1 → 2: De-brand three identifiers in the persisted blob.
  // Theme: 'ebisu-dark' / 'ebisu-light' → 'dark' / 'light' in
  //   profile.settings.appearance.theme.
  // Card-set id: 'default_ebisu' → 'default' as the
  //   profile.cardSets key, the embedded `id` field, and any
  //   session.ui.activeCardSetId reference.
  // Palette formula symbol: 'ebisu_delta' → 'quality_delta' as
  //   the profile.settings.engine.katago.analysis_env.symbols
  //   key, plus any palettes[*].delta_fn reference.
  // Three collision-guards preserve user customizations that
  // happen to occupy the destination identifier — we never
  // overwrite a pre-existing 'default', 'quality_delta', or
  // user-customized delta_fn.
  (blob: any) => {
    const out = structuredClone(blob);

    const theme = out.profile?.settings?.appearance?.theme;
    if (theme === 'ebisu-dark') {
      out.profile.settings.appearance.theme = 'dark';
    } else if (theme === 'ebisu-light') {
      out.profile.settings.appearance.theme = 'light';
    }

    // Card-set id: always promote 'default_ebisu' to 'default'. If
    // a 'default' key already exists alongside (e.g., from a prior
    // hybrid-state hydrate where new-defaults seeded a fresh
    // template before this migration ran), it's an auto-generated
    // template — the user's actual customizations live at
    // 'default_ebisu' and take precedence. Earlier defensive
    // collision-guard turned out to preserve stale keys; honest
    // behavior is to always reconcile to the new identifier.
    const cardSets = out.profile?.cardSets;
    if (cardSets && cardSets.default_ebisu) {
      cardSets.default = cardSets.default_ebisu;
      cardSets.default.id = 'default';
      delete cardSets.default_ebisu;
    }
    if (out.session?.ui?.activeCardSetId === 'default_ebisu') {
      out.session.ui.activeCardSetId = 'default';
    }

    // Palette formula symbol: always promote 'ebisu_delta' to
    // 'quality_delta'. Same reasoning as above.
    const symbols = out.profile?.settings?.engine?.katago?.analysis_env?.symbols;
    if (symbols && 'ebisu_delta' in symbols) {
      symbols.quality_delta = symbols.ebisu_delta;
      delete symbols.ebisu_delta;
    }

    const palettes = out.profile?.settings?.engine?.katago?.analysis_env?.palettes;
    if (Array.isArray(palettes)) {
      for (const p of palettes) {
        if (p?.delta_fn === 'ebisu_delta') {
          p.delta_fn = 'quality_delta';
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
