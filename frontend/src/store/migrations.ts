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
export const CURRENT_SCHEMA_VERSION = 66;

/**
 * Append-only ordered list of migrations. `migrations[i]`
 * migrates from version `(i + 1)` to `(i + 2)`.
 *
 * The first `N` entries (currently 1 → 2 through 63 → 64) are
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
  // 64 → 65: clear `session.ui.forestNav.selection` for every board
  // (browse-leak-fix, ledger rows 417/423). `NavSelection`'s two
  // variants both changed brand/semantics on this pass:
  //   - `{ kind: 'root', rootCardId }` — was the raw internal card PK
  //     (`CardId`, a number); now `CardPublicId` (a UUID string). A
  //     persisted numeric value is simply the wrong shape.
  //   - `{ kind: 'game', gameSourceId }` — was the raw internal
  //     game_source PK (`GameSourceId`); now `GameDisplayOrdinal`, the
  //     per-user display ordinal. Still a `number`, so a stale
  //     persisted value would NOT fail loudly at the type level — it
  //     would silently select whichever game/root happens to carry
  //     that number under the NEW per-user-ordinal numbering, which
  //     is almost certainly not what the user last had selected. Per
  //     ADR-0002, a silent wrong-selection is worse than a cleared
  //     one, so both variants are cleared uniformly rather than only
  //     the type-incompatible one.
  //
  // This mirrors the reset-a-stale-slot posture `useCardTreeData::
  // reset`'s own doc comment describes for the sibling case (a
  // forest reload whose card set no longer matches the persisted
  // manual-expand keys) — the safe response to a meaning change is
  // to drop the now-untrustworthy persisted value, not attempt to
  // reinterpret it.
  //
  // Container witnessed against the runtime shape: `session.ui.
  // forestNav` is present from schema-version 21, so a typo'd path
  // fails loudly here rather than no-oping and stamping the version.
  //
  // Idempotent: a blob with no `forestNav.selection` entries, or a
  // `forestNav.selection` that's already `{}`, is a no-op.
  (blob: any) => {
    const out = structuredClone(blob);
    const forestNav = witnessedContainer(out, 'session.ui.forestNav');
    if (forestNav) {
      (forestNav as { selection?: unknown }).selection = {};
    }
    return out;
  },
  // 65 → 66: resizer-rearch — strip the two pre-rearch split-workspace
  // resizer homes. The current-model fields this rearch settled on
  // (`session.ui.treePanelWidthPx`, `session.ui.treeControlRegionWidthPx`
  // — nested-splitter amendment, ledger rows 391/414; see schema.ts)
  // are both purely additive/optional and never shipped under a prior
  // name, so this migration only needs to strip, never rename. Strips:
  //
  //   - `session.ui.boardSquareMaxWidthPx` — the pre-rearch board-
  //     width cap the resizer drag used to write (ADR-0019 audit
  //     `.claude/dispatch-reports/adr19-audit.md` S2: two writers for
  //     one conceptual fact, a discontinuous drag-start clobber, and
  //     — because it has no reliable visible effect past the board's
  //     own aspect-ratio saturation point — the persisted slot with
  //     no visible effect on reload).
  //   - `session.ui.controlPanelWidth` — a dead, never-read zombie
  //     field (ADR-0019 audit S9: "a control wired to nothing";
  //     `grep -rn "controlPanelWidth\b" src/` before this migration
  //     returned exactly the schema declaration and the default).
  //     Removed in the same migration as the board-width cap so
  //     neither pre-rearch field survives into a freshly-migrated
  //     blob, which would otherwise recreate the exact "one fact, two
  //     homes" defect class (Rule 3 / C1) this rearch exists to close.
  //
  // No value is carried forward to either current-model field.
  // `boardSquareMaxWidthPx` (a board-width cap) has no principled
  // conversion to either `treePanelWidthPx` or
  // `treeControlRegionWidthPx` without live viewport geometry — the
  // row's actual pixel width, the tree panel's current visibility,
  // the board's current height — none of which a migration body (a
  // pure function over the persisted blob, no DOM) has access to.
  // Backfilling a guessed value would be exactly the silent-narrowing
  // this codebase's ADR-0002 posture forbids; leaving both new fields
  // `undefined` (their documented default: no drag yet, natural
  // layout) is the honest choice — the user re-drags once, same as
  // any migration that resets a runtime/session-shaped preference
  // rather than fabricating a translation for it.
  //
  // Idempotent: deleting an already-absent key is a no-op.
  //
  // Container access goes through `witnessedContainer` (per step 3 of
  // the add-a-migration recipe): `session.ui` is witnessed against the
  // runtime shape, so a typo'd path fails loudly here rather than
  // no-oping and stamping the version. The blob-side resolution keeps
  // the sibling bodies' non-null-object tolerance: a partial / legacy
  // blob whose container is absent no-ops.
  (blob: any) => {
    const out = structuredClone(blob);
    const ui = witnessedContainer(out, 'session.ui');
    if (ui) {
      const u = ui as { boardSquareMaxWidthPx?: unknown; controlPanelWidth?: unknown };
      delete u.boardSquareMaxWidthPx;
      delete u.controlPanelWidth;
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
