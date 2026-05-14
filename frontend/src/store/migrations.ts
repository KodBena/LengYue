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
export const CURRENT_SCHEMA_VERSION = 39;

/**
 * Append-only ordered list of migrations. `migrations[i]`
 * migrates from version `(i + 1)` to `(i + 2)`.
 *
 * The first `N` entries (currently 1 → 2 through 36 → 37) are
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
  // 37 → 38: Knob-registry Phase 5 — qEUBO consumer migration. Seeds
  // a KnobDecl `qeubo.<name>` for every entry in
  // `profile.settings.engine.katago.analysis_env.parameter_meta`
  // that declares a valid `[lo, hi]` range. The seeded decl:
  //
  //   - id:           `qeubo.<name>`
  //   - label:        the param name verbatim
  //   - domain:       `'qeubo'`
  //   - inputs:       `[{ range: parameter_meta[name].range }]`
  //   - outputs:      `[{ path: 'profile.settings.engine.katago.analysis_env.parameters.<name>' }]`
  //   - transform:    omitted (defaults to `identity`; N=K=1)
  //   - qeuboControlled: mirrors `parameter_meta[name].qeubo_controlled`
  //                   (the user's current intent, preserved verbatim).
  //
  // Entries without a range are skipped — the predecessor system
  // requires a range to be qEUBO-controllable, and the new substrate
  // requires a range to validate the input vector. Skipping keeps the
  // migration honest: a parameter that wasn't reachable for qEUBO
  // control before this migration stays unreachable after.
  //
  // Idempotent: an existing entry under the same key is preserved
  // unchanged. This both protects user-customised decl metadata
  // (a future editor surface lets them rename labels, retune ranges)
  // and makes the migration safe to run repeatedly across replay
  // scenarios.
  //
  // See `useQeubo`'s `startNewExperiment` / `abortExperiment` for the
  // claim-side counterpart that exercises these decls at experiment
  // lifecycle.
  (blob: any) => {
    const out = structuredClone(blob);
    const analysisEnv =
      out.profile?.settings?.engine?.katago?.analysis_env;
    const knobs = out.profile?.settings?.knobs;
    if (
      analysisEnv &&
      typeof analysisEnv === 'object' &&
      knobs &&
      typeof knobs === 'object' &&
      !Array.isArray(knobs)
    ) {
      const parameterMeta =
        (analysisEnv as { parameter_meta?: unknown }).parameter_meta;
      if (parameterMeta && typeof parameterMeta === 'object' && !Array.isArray(parameterMeta)) {
        const meta = parameterMeta as Record<string, unknown>;
        const target = knobs as Record<string, unknown>;
        for (const name of Object.keys(meta)) {
          const knobId = `qeubo.${name}`;
          if (knobId in target) continue;
          const entry = meta[name];
          if (!entry || typeof entry !== 'object') continue;
          const range = (entry as { range?: unknown }).range;
          if (
            !Array.isArray(range) ||
            range.length !== 2 ||
            typeof range[0] !== 'number' ||
            typeof range[1] !== 'number' ||
            !Number.isFinite(range[0]) ||
            !Number.isFinite(range[1]) ||
            range[0] >= range[1]
          ) {
            continue;
          }
          const qeuboControlled =
            (entry as { qeubo_controlled?: unknown }).qeubo_controlled === true;
          target[knobId] = {
            id: knobId,
            label: name,
            domain: 'qeubo',
            inputs: [{ range: [range[0], range[1]] }],
            outputs: [{ path: `profile.settings.engine.katago.analysis_env.parameters.${name}` }],
            qeuboControlled,
          };
        }
      }
    }
    return out;
  },
  // 38 → 39: Knob-registry domain re-categorisation
  // (knob-registry-postmortem remediation). The 37 → 38 migration
  // shipped with `domain: 'qeubo'` on every analysis-env-derived
  // KnobDecl. That was a category error documented at
  // `docs/notes/postmortem-knob-registry-qeubo-domain-2026-05.md`:
  // `KnobDomain` is a UX taxonomy ("where does this knob live in
  // the user's mental model"); `'qeubo'` named a consumer identity,
  // which belongs to `ConsumerClaim.consumerId` and the
  // `KnobDecl.qeuboControlled` flag. The corrected enum drops
  // `'qeubo'` and adds `'palette'`.
  //
  // This migration rewrites the `domain` field on every
  // `qeubo.*`-prefixed KnobDecl from `'qeubo'` to `'palette'`. The
  // KnobDecl IDs themselves keep the `qeubo.` prefix — that's the
  // naming convention `useQeubo.knobIdForParam` builds, and the
  // claim machinery already keys on those strings; renaming would
  // require coordinated rewrites across `ensureKnobDecl`,
  // `reconcileQeuboKnobs`, `acquireExperimentClaims`, and the
  // claim Map's keys. The fix is the domain (the UX-presentation
  // axis), not the id (the substrate-internal handle).
  //
  // Idempotent: a decl already at `domain: 'palette'` (or any
  // non-`'qeubo'` value) is preserved unchanged. Per the
  // append-only invariant the 37 → 38 migration above is left
  // frozen as it shipped — the corrected state is reached by
  // walking forward through this migration, not by retroactively
  // editing the prior step.
  (blob: any) => {
    const out = structuredClone(blob);
    const knobs = out.profile?.settings?.knobs;
    if (knobs && typeof knobs === 'object' && !Array.isArray(knobs)) {
      const target = knobs as Record<string, unknown>;
      for (const knobId of Object.keys(target)) {
        if (!knobId.startsWith('qeubo.')) continue;
        const decl = target[knobId];
        if (!decl || typeof decl !== 'object') continue;
        if ((decl as { domain?: unknown }).domain === 'qeubo') {
          (decl as { domain?: unknown }).domain = 'palette';
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
