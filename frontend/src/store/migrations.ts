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
 *      (the leaf-assertion helper below) instead of a raw
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
import { defaultProfile, defaultSessionUI, NIL_UUID } from './defaults';

// See "Dev-only hazard" above. The accept-then-reload pattern
// intercepts the HMR update and forces a full page reload
// instead. No-op in production builds — `import.meta.hot` is
// undefined when Vite emits the production bundle, so this
// guard exists only in `npm run dev`.
if (import.meta.hot) import.meta.hot.accept(() => location.reload());

/**
 * Runtime-shape witness for `witnessedContainer` below: the persisted
 * blob's container skeleton, assembled from the same defaults the
 * runtime store hydrates from. `buildPersistencePayload` in
 * `store/index.ts` is the save-side mirror of this shape — these are
 * the paths the runtime actually reads, which is what makes the
 * witness *independent* of any migration body's own blob walk.
 *
 * Deliberately built from the live `defaults` module rather than a
 * frozen inline snapshot: the witness asserts that a migration's
 * target container exists in the *current* runtime shape, and new
 * containers added later must be witnessable without editing frozen
 * helper data. This is NOT the mutable-constant hazard the 42 → 43
 * archived body's freeze note warns about — that note is about a
 * migration's *output values* drifting silently; the witness is an
 * assertion input whose drift fails loudly (a throw at hydrate), the
 * opposite failure mode.
 */
const PERSISTED_SHAPE_WITNESS: Record<string, unknown> = {
  schemaVersion: 0,
  boards: [],
  activeBoardIndex: 0,
  profile: defaultProfile,
  session: {
    id: NIL_UUID,
    profileId: NIL_UUID,
    ui: defaultSessionUI,
    reviews: {},
  },
};

/**
 * Leaf-assertion helper for ACTIVE migration bodies (work-status item
 * `migration-leaf-assertion-and-composition-test`, audit
 * `docs/notes/audit/audit-spa-history-lessons-2026-06-10.md` §3.13;
 * extends Phase 1 of
 * `docs/notes/design/migration-test-rotation-plan.md`).
 *
 * Resolves a dot-separated container path on the blob in two legs:
 *
 *   1. **Witness leg (fail loud, ADR-0002).** The path must resolve
 *      against `PERSISTED_SHAPE_WITNESS` — the runtime persisted
 *      shape. A path the runtime never reads throws immediately.
 *      This is the independent witness: the 47 → 48 F-optimizer
 *      retirement walked `out.settings?.knobs` instead of
 *      `out.profile?.settings?.knobs` and silently no-oped on every
 *      blob while still stamping v48; an assertion that re-walks the
 *      body's own path would have conditioned out on the same typo.
 *   2. **Blob leg (tolerant, unchanged semantics).** The same path is
 *      walked on the blob with optional-chain semantics; returns the
 *      container when it is a non-null `typeof 'object'` value
 *      (arrays included — matching the inline guards this replaces),
 *      else `undefined`, so partial / legacy blobs no-op exactly as
 *      before. Pass the PARENT container's path, not the leaf's: a
 *      stripped or backfilled leaf is usually absent from the current
 *      shape by design; its parent is what the runtime still reads.
 *
 * ── FROZEN ONCE SHIPPED ────────────────────────────────────────────
 * Shipped migration bodies call this helper, and bodies are frozen as
 * they shipped — which makes this helper a dependency of frozen code.
 * From the first release that ships a body calling it, the helper's
 * observable semantics are frozen with those bodies: a behavioural
 * change here would silently retro-edit shipped migrations in the
 * wild, the exact failure the append-only invariant exists to
 * prevent. If different semantics are ever needed, mint a NEW helper
 * and leave this one untouched.
 *
 * Two scope rules that follow:
 *   - ACTIVE bodies only. Archived bodies keep their original inline
 *     guards verbatim; retrofitting frozen bodies is forbidden.
 *   - A witnessed path is a forward commitment: while any body
 *     (active or archived-later) witnesses it, the persisted shape
 *     must keep carrying that container, or hydration of pre-that-
 *     version blobs fails loudly. That loud failure is the design
 *     (better than a silent no-op stamp), but a future restructuring
 *     arc that renames a witnessed container must revisit the frozen
 *     bodies' witness viability in the same change.
 */
export function witnessedContainer(
  blob: unknown,
  witnessPath: string,
): Record<string, unknown> | undefined {
  const segments = witnessPath.split('.');

  // Witness leg.
  let witness: unknown = PERSISTED_SHAPE_WITNESS;
  for (const segment of segments) {
    if (witness === null || typeof witness !== 'object' || !(segment in witness)) {
      throw new Error(
        `witnessedContainer: '${witnessPath}' does not resolve against the ` +
        `runtime persisted shape (failed at segment '${segment}'). The ` +
        `migration names a container the runtime never reads — the 47 → 48 ` +
        `wrong-path class. Fix the path; do not loosen the witness.`,
      );
    }
    // Justified cast: the line above proves `witness` is a non-null
    // object carrying `segment`; TS cannot narrow `unknown` through
    // the `in` check without a wider type assertion than this one.
    witness = (witness as Record<string, unknown>)[segment];
  }

  // Blob leg.
  let current: unknown = blob;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    // Justified cast: indexing a primitive (string / number / boolean)
    // yields `undefined` for these segment names, which the next
    // iteration's null/undefined guard absorbs — same tolerance as
    // the optional-chained reads this helper replaces.
    current = (current as Record<string, unknown>)[segment];
  }
  return current !== null && typeof current === 'object'
    // Justified cast: arrays deliberately pass (typeof 'object'),
    // mirroring the `value && typeof value === 'object'` inline
    // guards the active bodies used before the retrofit.
    ? (current as Record<string, unknown>)
    : undefined;
}

/**
 * The current schema version. Bump only when the GlobalStore
 * persistence shape changes in a way that prior blobs need
 * forward-migration. Pair every bump with a new entry in the
 * migrations array below.
 */
export const CURRENT_SCHEMA_VERSION = 59;

/**
 * Append-only ordered list of migrations. `migrations[i]`
 * migrates from version `(i + 1)` to `(i + 2)`.
 *
 * The first `N` entries (currently 1 → 2 through 56 → 57) are
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
  // 57 → 58: strip the now-stale `profile.knownTags` from persisted blobs.
  // knownTags moved out of the persisted profile to a non-persisted
  // top-level `GlobalStore` field (it's a server-derived cache re-fetched
  // every boot — see the ProfileState invariant; closes the
  // tags-fetch-hydration-race). Without this strip, an old blob's
  // `profile.knownTags` would survive `updateFromRemote`'s deepMerge as a
  // stray runtime key on `store.profile` and get re-persisted forever —
  // half-defeating the move. No value is carried forward (the boot fetch
  // repopulates the new field); we just delete the dead key.
  //
  // Idempotent: `delete` is a no-op when the key is already absent.
  //
  // Container access goes through `witnessedContainer` (semantics-
  // preserving retrofit; see the helper's docstring): 'profile' is
  // witnessed against the runtime shape, and the blob-side resolution
  // keeps the prior `out.profile && typeof out.profile === 'object'`
  // tolerance.
  (blob: any) => {
    const out = structuredClone(blob);
    const profile = witnessedContainer(out, 'profile');
    if (profile) {
      delete (profile as { knownTags?: unknown }).knownTags;
    }
    return out;
  },
  // 58 → 59: re-scope `session.ui.forestNav.selection` from a single
  // workspace-global `NavSelection | null` to a per-board map
  // (`PerBoard<NavSelection>`), so a null/absent selection on one board can no
  // longer drive (or clear) the right pane of another (board-scope audit P0;
  // see `frontend/docs/notes/board-scope.md`). `forestNav.expanded` stays
  // global — the navigator tree is the user's whole library. The prior global
  // selection is transient navigator state, not user data, so it is dropped
  // rather than re-homed under a guessed active board.
  //
  // Detection: the already-migrated shape is a plain board-keyed map (object,
  // non-null, no top-level `kind`; keys are BoardId UUIDs, never `kind`). The
  // old shape is `null` or a discriminated `NavSelection` (carries `kind`).
  // Reset anything that is not already the new shape; idempotent on it.
  //
  // Container access goes through `witnessedContainer` (semantics-
  // preserving retrofit; see the helper's docstring): the
  // 'session.ui.forestNav' path is witnessed against the runtime
  // shape, and the blob-side resolution keeps the prior
  // `out.session?.ui?.forestNav` + non-null-object tolerance.
  (blob: any) => {
    const out = structuredClone(blob);
    const nav = witnessedContainer(out, 'session.ui.forestNav');
    if (nav) {
      const sel = (nav as { selection?: unknown }).selection;
      const alreadyPerBoard =
        typeof sel === 'object' && sel !== null && !('kind' in (sel as object));
      if (!alreadyPerBoard) {
        (nav as { selection: unknown }).selection = {};
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
