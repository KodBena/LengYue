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
 *   - Future-version blob (rolled-back code, a schema bump that
 *     hasn't propagated, or — the recurring case in practice —
 *     two branches sharing one backend where the OTHER branch's
 *     app already forward-migrated the shared document): throws
 *     `FutureSchemaVersionError`, a NAMED subtype of `Error`
 *     carrying `blobVersion` / `appVersion` as typed fields (not
 *     embedded only in the message string — ADR-0002's
 *     error-message-reparse ban applies to callers just as much
 *     as to the walker itself). This is a distinct, expected,
 *     typed boot outcome, not an undifferentiated throw: calling
 *     code (`SyncService.hydrate` via `updateFromRemote`)
 *     `instanceof`-narrows on it and enters a typed recovery mode
 *     (`WorkspaceLoadState.kind === 'future-version'`,
 *     `src/types/app.ts`) rather than the generic
 *     `{ kind: 'error' }` leg. See that type's doc comment for the
 *     recovery-mode contract; see `sync-service.ts`'s `hydrate()`
 *     for the catch site. The blob is not applied; the workspace
 *     stays at defaults; no saves fire until the user resolves the
 *     recovery prompt (continue on suppressed-persistence defaults,
 *     or explicitly reset the server workspace).
 *
 *   - Missing migration for a required step: throws a plain
 *     `Error`. This shouldn't happen given the append-only
 *     discipline above; the throw is a defensive check for the
 *     case where someone bumps CURRENT_SCHEMA_VERSION without
 *     registering the migration. Deliberately NOT typed as
 *     `FutureSchemaVersionError` — it is a programming-error
 *     assertion (a broken append-only invariant), not the
 *     ordinary cross-branch skew `FutureSchemaVersionError` names;
 *     conflating the two would route a real bug into the
 *     recovery-mode UI as if it were an expected condition.
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
 * Typed failure for the future-version leg of `migrate()`'s failure
 * contract (see the file header). `blobVersion` / `appVersion` are
 * declared as explicit instance fields, not parameter-property
 * shorthand — the project's tsconfig has `erasableSyntaxOnly`
 * enabled, which forbids parameter properties (they emit runtime
 * code, not pure type-level syntax); same shape as
 * `AnalysisWaitError` (`composables/analysis/wait-for-analysis.ts`).
 *
 * Why a named class rather than a generic `Error` the caller
 * string-matches: ADR-0002's error-message-reparse ban (RCA guard
 * G1) forbids recovering structured facts by parsing a message
 * string. `blobVersion` / `appVersion` are the two facts the
 * recovery-mode UI needs (`WorkspaceLoadState`'s `future-version`
 * leg, `src/types/app.ts`); carrying them as typed fields means the
 * catch site narrows with `instanceof` and reads them directly, with
 * no string parsing and no possibility of the UI silently falling
 * through to the generic `{ kind: 'error' }` leg because a message
 * format drifted.
 */
export class FutureSchemaVersionError extends Error {
  readonly blobVersion: number;
  readonly appVersion: number;

  constructor(blobVersion: number, appVersion: number) {
    super(
      `Persisted blob is at schemaVersion ${blobVersion}, ahead of this app's ` +
      `${appVersion}. App code may be older than the data.`,
    );
    this.name = 'FutureSchemaVersionError';
    this.blobVersion = blobVersion;
    this.appVersion = appVersion;
  }
}

/**
 * The current schema version. Bump only when the GlobalStore
 * persistence shape changes in a way that prior blobs need
 * forward-migration. Pair every bump with a new entry in the
 * migrations array below.
 */
export const CURRENT_SCHEMA_VERSION = 78;

/**
 * Append-only ordered list of migrations. `migrations[i]`
 * migrates from version `(i + 1)` to `(i + 2)`.
 *
 * The first `N` entries (currently 1 → 2 through 74 → 75) are
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
  // 76 → 77: compensating fix for a bug the 75 → 76 body (now archived,
  // see archived-migrations.ts) shipped with (LYT presence arc P2b,
  // `.claude/dispatch-reports/lyt-p2b-presence-realization.md` — "the
  // schema decision, and why"). Per this file's own header ("bugs in
  // a shipped migration are addressed by adding a NEW migration later
  // that compensates"), NOT by editing the frozen 75 → 76 body.
  //
  // THE BUG: 75 → 76's own `presence.controlPanel = typeof
  // u.controlsExpanded === 'boolean' ? u.controlsExpanded : true` wrote a
  // LITERAL `true` for every blob whose legacy `controlsExpanded` was
  // absent/non-boolean — indistinguishable, from that point forward, from
  // a genuine user choice (`session.ui.lytPresence`'s own schema.ts doc:
  // "a key's ABSENCE is not a distinct state... every reader falls back
  // to that widget's own default" — but `controlPanel` was never left
  // absent post-76, so that fallback path was dead for every migrated
  // blob). This only mattered once the control panel's own compiled
  // default became SCREEN-CLASS-DEPENDENT (P2a: portrait's own
  // `presenceDefaultVisible` flipped to `false` — the whole reason
  // repetition-first portrait needs the panel absent by default) — every
  // already-migrated blob's explicit `true` permanently shadows that
  // class-aware default, on EVERY screen class, regardless of the user
  // ever having expressed a preference.
  //
  // THE COMPENSATION, disclosed and bounded (per this arc's own "the
  // migration must not fabricate a user-chose state from an old
  // default" instruction): `presence.controlPanel === false` is an
  // UNAMBIGUOUS real signal — no migration or default path ever writes
  // `false` here except a genuine legacy `controlsExpanded === false`
  // (itself carried forward from a real pre-LYT-rework toggle) or an
  // explicit post-76 presence-menu uncheck — so a `false` value is left
  // completely untouched, sovereign as always. `presence.controlPanel
  // === true`, by contrast, is IRRECOVERABLY AMBIGUOUS (see "THE BUG"
  // above — it is written identically whether the user actively wanted
  // it or never touched the setting at all); this migration cannot
  // recover which case a given blob is, so it does not try — it DELETES
  // the key when true, restoring the "never chose" absent-key state, and
  // accepts the small, disclosed cost that a genuine minority who had
  // explicitly re-toggled the panel back ON now needs one more toggle in
  // portrait to get it in-grid again (a mild regression for that
  // minority, in exchange for the class-aware default reaching the
  // overwhelming common case — the many users who never touched this
  // control at all). `A_setup` needs no parallel treatment: it was never
  // seeded by ANY migration or `defaults.ts` version (its own always-on
  // App.vue-level force-override — M2 stage boot-restoration, `.claude/
  // dispatch-reports/lyt-boot-restoration.md` — lived entirely OUTSIDE
  // `session.ui.lytPresence`), so no persisted blob anywhere carries a
  // fabricated `A_setup` key to compensate for.
  //
  // Idempotent: re-running finds no `true` to delete (either already
  // deleted, or a real `false` untouched either way) and no-ops on a
  // second pass.
  (blob: any) => {
    const out = structuredClone(blob);
    const ui = witnessedContainer(out, 'session.ui');
    if (ui) {
      const u = ui as { lytPresence?: unknown };
      if (typeof u.lytPresence === 'object' && u.lytPresence !== null) {
        const presence = u.lytPresence as Record<string, unknown>;
        if (presence.controlPanel === true) {
          delete presence.controlPanel;
        }
      }
    }
    return out;
  },
  // 77 → 78: allocation-family closing arc, item 1 — card-tree
  // orientation now auto-derives from the tree/card-editor container's
  // aspect ratio (`ForestDirectory.vue`); the panel-header toggle
  // becomes an override of that derived value rather than the sole
  // source of truth. Introduces `session.ui.cardTreeOrientationOverride`
  // ('horizontal' | 'vertical' | null); see the field's doc comment on
  // `UISession` in schema.ts for the auto-vs-override contract.
  //
  // No legacy predecessor to carry forward — the pre-78 orientation
  // toggle was component-local (`ForestDirectory.vue`'s own `ref`, not
  // persisted at all), so every existing blob simply gets the field
  // backfilled to its registration default (`null`, i.e. "auto").
  //
  // Container witnessed against the runtime shape (`witnessedContainer`,
  // step 3 of the add-a-migration recipe): `session.ui` exists from the
  // original UISession seed (v1), so a typo'd path fails loudly here
  // rather than no-oping and stamping the version.
  //
  // Idempotent: a pre-existing valid value ('horizontal' | 'vertical' |
  // null) is preserved unchanged; only a missing / wrong-typed leaf is
  // backfilled to `null`.
  (blob: any) => {
    const out = structuredClone(blob);
    const ui = witnessedContainer(out, 'session.ui');
    if (ui) {
      const u = ui as { cardTreeOrientationOverride?: unknown };
      if (
        u.cardTreeOrientationOverride !== 'horizontal' &&
        u.cardTreeOrientationOverride !== 'vertical' &&
        u.cardTreeOrientationOverride !== null
      ) {
        u.cardTreeOrientationOverride = null;
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
    throw new FutureSchemaVersionError(version, CURRENT_SCHEMA_VERSION);
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
