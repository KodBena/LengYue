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
export const CURRENT_SCHEMA_VERSION = 41;

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
  // 39 → 40: Knob-registry Phase 6 magic-literals sweep. Three new
  // preference-flavoured leaves promoted from inline literals:
  //
  //   (1) `profile.settings.appearance.ownershipDeadbandThreshold`
  //       default 0.05 — was a `0.05` inline literal in
  //       BoardWidget.vue's `ownershipColor`. Below this magnitude,
  //       the territory overlay paints transparent to prevent
  //       flicker.
  //   (2) `profile.settings.appearance.livenessThreshold`
  //       default 0.3 — was `LIVENESS_THRESHOLD = 0.3` const in
  //       BoardWidget.vue. Stones with engine-disagreement below
  //       this aren't flagged as dead.
  //   (3) `profile.settings.engine.katago.watchdogLatencyThresholdMs`
  //       default 500 — was `WATCHDOG_LATENCY_THRESHOLD_MS = 500`
  //       const in Toolbar.vue. Latency cutoff for the un-animated
  //       watchdog's color flip.
  //
  // Seeds three corresponding KnobDecls mirroring the defaults-side
  // fresh-install seed verbatim (display.ownership-deadband-threshold,
  // display.liveness-threshold, engine.watchdog-latency-threshold-ms).
  //
  // Idempotent: each leaf-backfill preserves a pre-existing number;
  // each KnobDecl seed preserves a pre-existing entry under the
  // same key (matching the 36 → 37 motivating-scalars migration's
  // discipline so user-customised label / range edits survive).
  //
  // See `BoardWidget.vue::ownershipColor` and
  // `BoardWidget.vue::livenessColor` for the display-side consumer
  // retargets, and `Toolbar.vue` for the engine-side one — all
  // updated in the same commit.
  (blob: any) => {
    const out = structuredClone(blob);
    const settings = out.profile?.settings;
    if (settings && typeof settings === 'object') {
      const appearance = (settings as { appearance?: unknown }).appearance;
      if (appearance && typeof appearance === 'object') {
        const a = appearance as { ownershipDeadbandThreshold?: unknown; livenessThreshold?: unknown };
        if (typeof a.ownershipDeadbandThreshold !== 'number') {
          a.ownershipDeadbandThreshold = 0.05;
        }
        if (typeof a.livenessThreshold !== 'number') {
          a.livenessThreshold = 0.3;
        }
      }
      const katago = (settings as { engine?: { katago?: unknown } }).engine?.katago;
      if (katago && typeof katago === 'object') {
        const k = katago as { watchdogLatencyThresholdMs?: unknown };
        if (typeof k.watchdogLatencyThresholdMs !== 'number') {
          k.watchdogLatencyThresholdMs = 500;
        }
      }
      const knobs = (settings as { knobs?: unknown }).knobs;
      if (knobs && typeof knobs === 'object' && !Array.isArray(knobs)) {
        const seeds: Record<string, unknown> = {
          'display.ownership-deadband-threshold': {
            id: 'display.ownership-deadband-threshold',
            label: 'Ownership overlay dead-band',
            domain: 'display',
            inputs: [{ range: [0, 1] }],
            outputs: [{ path: 'profile.settings.appearance.ownershipDeadbandThreshold' }],
          },
          'display.liveness-threshold': {
            id: 'display.liveness-threshold',
            label: 'Liveness marker threshold',
            domain: 'display',
            inputs: [{ range: [0, 1] }],
            outputs: [{ path: 'profile.settings.appearance.livenessThreshold' }],
          },
          'engine.watchdog-latency-threshold-ms': {
            id: 'engine.watchdog-latency-threshold-ms',
            label: 'Watchdog latency threshold (ms)',
            domain: 'engine',
            inputs: [{ range: [50, 5000] }],
            outputs: [{ path: 'profile.settings.engine.katago.watchdogLatencyThresholdMs' }],
          },
        };
        const target = knobs as Record<string, unknown>;
        for (const key of Object.keys(seeds)) {
          if (!(key in target)) {
            target[key] = seeds[key];
          }
        }
      }
    }
    return out;
  },
  // 40 → 41: Knob-registry priority backfill (toolbar-popover
  // quick-access ask, 2026-05-14). The `KnobDecl.priority?: number`
  // field was added in the same arc so editor surfaces can sort
  // sliders by ascending render-order. This migration backfills
  // priorities on the seven seeded decls to match the values
  // `store/defaults.ts` ships for fresh installs:
  //
  //   display.move-filter-threshold       — 0  (most-likely-used)
  //   display.ownership-opacity-ceiling   — 10
  //   display.ownership-deadband-threshold — 20
  //   display.liveness-threshold          — 30
  //   display.hue-offset                  — 40
  //   engine.watchdog-animation-ms        — 50
  //   engine.watchdog-latency-threshold-ms — 60
  //
  // Idempotent: a decl whose `priority` is already a finite number
  // is preserved unchanged (a future preference-learning surface,
  // or a user who hand-tunes via a future editor, may already have
  // written a different value). Decls without a registered priority
  // here are left alone — runtime-added knobs (e.g. `qeubo.<name>`
  // for analysis-env parameters) will simply sort last via the
  // editor's `undefined → Infinity` fallback until something
  // assigns them a priority.
  //
  // See `docs/notes/knob-registry-plan.md` and the
  // KnobRegistryEditor / ToolbarSliderPopover for the consumer
  // surfaces that act on this field.
  (blob: any) => {
    const out = structuredClone(blob);
    const knobs = out.profile?.settings?.knobs;
    if (knobs && typeof knobs === 'object' && !Array.isArray(knobs)) {
      const priorities: Record<string, number> = {
        'display.move-filter-threshold': 0,
        'display.ownership-opacity-ceiling': 10,
        'display.ownership-deadband-threshold': 20,
        'display.liveness-threshold': 30,
        'display.hue-offset': 40,
        'engine.watchdog-animation-ms': 50,
        'engine.watchdog-latency-threshold-ms': 60,
      };
      const target = knobs as Record<string, unknown>;
      for (const [knobId, defaultPriority] of Object.entries(priorities)) {
        const decl = target[knobId];
        if (!decl || typeof decl !== 'object') continue;
        const current = (decl as { priority?: unknown }).priority;
        if (typeof current === 'number' && Number.isFinite(current)) continue;
        (decl as { priority?: unknown }).priority = defaultPriority;
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
