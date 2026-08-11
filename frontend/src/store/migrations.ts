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
export const CURRENT_SCHEMA_VERSION = 75;

/**
 * Append-only ordered list of migrations. `migrations[i]`
 * migrates from version `(i + 1)` to `(i + 2)`.
 *
 * The first `N` entries (currently 1 → 2 through 72 → 73) are
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
  // 73 → 74: strip the dead PV-fade knob (wiki2-pv-fade-knob). CSS
  // transitions were banned and purged from `frontend/src`, which left
  // `display.pv-fade-ms` — a `KnobDecl` registered under
  // `profile.settings.knobs` targeting `session.ui.pvAnimation.fadeDurationMs`
  // — controlling only inert JS-scheduling padding with no observable
  // effect (see `use-pv-animation.ts`'s file header for the full
  // account). Both the knob's registered decl and the field it wrote
  // are removed from the persisted blob:
  //
  //   (a) `profile.settings.knobs['display.pv-fade-ms']` — the
  //       registered decl. Without this strip, a pre-existing blob's
  //       decl would survive `updateFromRemote`'s deepMerge as a stray
  //       runtime key (defaults.ts no longer seeds it), and keep
  //       getting re-persisted forever — the same "half-defeating the
  //       move" failure the 57 → 58 archived body's `knownTags` strip
  //       named for a different field.
  //
  //   (b) `session.ui.pvAnimation.fadeDurationMs` — the persisted
  //       value the knob used to write. `defaults.ts`'s `pvAnimation`
  //       default object no longer carries this leaf either, so
  //       leaving it in old blobs would be a stray key the runtime
  //       type (`PvAnimationSettings`, now without `fadeDurationMs`)
  //       doesn't describe.
  //
  // No value is carried forward from either field — there is nothing
  // downstream to migrate a fadeDurationMs number INTO now that the
  // knob and the field are both gone; we just delete the dead keys.
  //
  // Idempotent: `delete` is a no-op when a key is already absent.
  //
  // Container access goes through `witnessedContainer`: both
  // `profile.settings.knobs` and `session.ui.pvAnimation` exist from
  // well before this migration (the former seeded at the framework's
  // knob-registry introduction, the latter backfilled by the archived
  // 9 → 10 body), so a typo'd path fails loudly here rather than
  // no-oping and stamping the version.
  (blob: any) => {
    const out = structuredClone(blob);
    const knobs = witnessedContainer(out, 'profile.settings.knobs');
    if (knobs) {
      delete (knobs as Record<string, unknown>)['display.pv-fade-ms'];
    }
    const pvAnimation = witnessedContainer(out, 'session.ui.pvAnimation');
    if (pvAnimation) {
      delete (pvAnimation as { fadeDurationMs?: unknown }).fadeDurationMs;
    }
    return out;
  },
  // 74 → 75: backfill `session.ui.showGhostStone` (boolean, default
  // true) — the new toggle for the ghost-stone hover preview
  // (wiki2-ghost-stone). The leaf is read by `BoardWidget` (threaded
  // into `BoardDisplay`'s `ghost-stone-enabled` prop) and seeded in
  // `defaults.ts`; a persisted blob predating this field would
  // otherwise carry no value and rely on `updateFromRemote`'s
  // deepMerge to surface the default. Backfilling explicitly keeps
  // the persisted shape honest (the composition test pins it) rather
  // than leaning on the merge. Exposed only through the Session (UI)
  // `RegistryEditor` — see the field's doc comment on `UISession` in
  // `schema.ts` for why this toggle has no dedicated StatusBar button.
  //
  // Container witnessed against the runtime shape (`witnessedContainer`,
  // per step 3 of the add-a-migration recipe): `session.ui` exists
  // from the original UISession seed (v1), so a typo'd path fails
  // loudly here rather than no-oping and stamping the version. The
  // blob-side resolution keeps the sibling bodies' non-null-object
  // tolerance: a partial / legacy blob whose container is absent
  // no-ops.
  //
  // Idempotent: a pre-existing boolean `showGhostStone` is preserved
  // unchanged (a hand-edited or forward-compat blob keeps its value);
  // only a missing / wrong-typed leaf is backfilled to the default.
  (blob: any) => {
    const out = structuredClone(blob);
    const ui = witnessedContainer(out, 'session.ui');
    if (ui) {
      const u = ui as { showGhostStone?: unknown };
      if (typeof u.showGhostStone !== 'boolean') {
        u.showGhostStone = true;
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
