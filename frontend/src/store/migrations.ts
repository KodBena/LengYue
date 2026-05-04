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
import {
  rewriteSymbolBlock,
  rewriteGradingParameterAnalysisConfig,
} from '../engine/analysis-config-curation';
import type { SystemMessage } from '../types';

/**
 * The current schema version. Bump only when the GlobalStore
 * persistence shape changes in a way that prior blobs need
 * forward-migration. Pair every bump with a new entry in the
 * migrations array below.
 */
export const CURRENT_SCHEMA_VERSION = 15;

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
  // 11 → 12: `analysis_config` curation alignment per proxy v1.0.3.
  // Walks the live profile's symbol library AND any cards persisted in
  // active review queues; rewrites `np.<fn>(` → `<fn>(` whenever
  // `<fn>` is one of the curated stdlib names AND the call-site is a
  // direct invocation (not an attribute walk like `np.linalg.<fn>(`).
  // Bit-equivalent under the wrapper contract for the kwarg-free
  // positional case (the case the project's defaults satisfy).
  // Residue (anything `np.*` left after the rewrite) is named in a
  // SystemMessage at startup; the proxy's call-time `NameError`
  // remains the authoritative diagnostic for those bodies. See
  // `src/engine/analysis-config-curation.ts` for the rewriter and
  // its bit-equivalence rationale. The audit-trail SystemMessage is
  // queued via the transient `_pendingMigrationMessages` field on the
  // blob; `store/index.ts::updateFromRemote` drains it post-apply.
  (blob: any) => {
    const out = structuredClone(blob);
    let totalRewrites = 0;
    const residueLocations: string[] = [];

    // (a) Live profile's symbol library.
    const liveSymbols = out.profile?.settings?.engine?.katago?.analysis_env?.symbols;
    if (liveSymbols && typeof liveSymbols === 'object') {
      const result = rewriteSymbolBlock(liveSymbols as Record<string, unknown>);
      if (result.rewriteCount > 0) {
        out.profile.settings.engine.katago.analysis_env.symbols = result.symbols;
        totalRewrites += result.rewriteCount;
      }
      for (const r of result.residue) {
        residueLocations.push(`profile.symbols.${r.name}`);
      }
    }

    // (b) Cards persisted in active review queues, if any are in
    // flight at migration time. Defensive — most users will have no
    // active session when this runs, but the migration must handle
    // the case where a session straddles the upgrade.
    const reviews = out.session?.reviews;
    if (reviews && typeof reviews === 'object') {
      for (const [boardId, sessionData] of Object.entries(reviews as Record<string, unknown>)) {
        if (!sessionData || typeof sessionData !== 'object') continue;
        const queue = (sessionData as { queue?: unknown }).queue;
        if (!Array.isArray(queue)) continue;
        for (let cardIdx = 0; cardIdx < queue.length; cardIdx++) {
          const card = queue[cardIdx];
          if (!card || typeof card !== 'object') continue;
          const result = rewriteGradingParameterAnalysisConfig(
            (card as { gradingParameter?: unknown }).gradingParameter
          );
          if (result.rewriteCount > 0) {
            (card as { gradingParameter?: unknown }).gradingParameter = result.gradingParameter;
            totalRewrites += result.rewriteCount;
          }
          for (const r of result.residue) {
            residueLocations.push(
              `session.reviews.${boardId}.queue[${cardIdx}].symbols.${r.name}`
            );
          }
        }
      }
    }

    // (c) Audit-trail SystemMessages, queued for post-apply drain.
    const messages: { type: SystemMessage['type']; text: string }[] = [];
    if (totalRewrites > 0) {
      messages.push({
        type: 'info',
        text:
          `v1.0.3 curation alignment: rewrote ${totalRewrites} symbol body` +
          `${totalRewrites === 1 ? '' : ' instances'} (np.<fn> → <fn>) ` +
          `in persisted state. Bit-equivalent under the curated proxy ` +
          `stdlib; recall trajectories preserved.`,
      });
    }
    if (residueLocations.length > 0) {
      const head = residueLocations.slice(0, 5).join(', ');
      const tail = residueLocations.length > 5
        ? `, … and ${residueLocations.length - 5} more`
        : '';
      messages.push({
        type: 'warning',
        text:
          `v1.0.3 curation alignment: ${residueLocations.length} symbol ` +
          `body${residueLocations.length === 1 ? '' : ' instances'} reference ` +
          `numpy functions outside the curated stdlib (${head}${tail}). ` +
          `These will fail at review time with a proxy NameError; ` +
          `hand-edit to use the curated wrappers.`,
      });
    }
    if (messages.length > 0) {
      const existing = Array.isArray(out._pendingMigrationMessages)
        ? out._pendingMigrationMessages
        : [];
      out._pendingMigrationMessages = existing.concat(messages);
    }

    return out;
  },
  // 12 → 13: Surface mint-time γ control in MintingSettings. v12 had
  // no `profile.settings.minting.defaultGamma` field; gamma was only
  // ever written to a card's `grading_parameter.data.gamma` if the
  // backend or some external tool put it there, and the frontend's
  // `mapToReviewCard` read it via `?? 0.9` fallback. v13 introduces
  // `defaultGamma: 0.9` in MintingSettings; the MintCardModal opens
  // with this value and writes the user-edited value into each new
  // card's `grading_parameter.data.gamma`. Idempotent: a pre-existing
  // numeric value is preserved (a hand-edited blob with a custom
  // default isn't clobbered); non-numeric or missing field gets the
  // 0.9 default. The 0.9 matches the read-side fallback in
  // backend-service.ts so the user-facing semantics are unchanged
  // for legacy cards that lack the field.
  (blob: any) => {
    const out = structuredClone(blob);
    const minting = out.profile?.settings?.minting;
    if (minting && typeof minting === 'object') {
      if (typeof minting.defaultGamma !== 'number') {
        minting.defaultGamma = 0.9;
      }
    }
    return out;
  },
  // 13 → 14: Surface proxy replay-cache flags in engine.katago. v13
  // had no `cache` / `lookup_cache` / `replay_final_only` fields on
  // `profile.settings.engine.katago`; the analyze* call sites in
  // `services/analysis-service.ts` either hard-coded `false`
  // (`analyzeRange`'s `cache` / `lookup_cache`) or omitted the fields
  // entirely (`analyzeActiveNode`'s `cache` / `lookup_cache`, and
  // `replay_final_only` everywhere — the proxy's wire-default `false`
  // produced the same effective behavior). v14 introduces all three
  // as user-editable booleans defaulting `false`, preserving the
  // pre-surfacing behavior; the registry editor renders them
  // automatically as checkboxes. Idempotent: pre-existing boolean
  // values are preserved (a hand-edited blob isn't clobbered);
  // non-boolean or missing fields get `false`. The flags' wire-protocol
  // semantics are documented on `KataGoAnalysisQuery` in
  // `engine/katago/types.ts`.
  (blob: any) => {
    const out = structuredClone(blob);
    const katago = out.profile?.settings?.engine?.katago;
    if (katago && typeof katago === 'object') {
      if (typeof katago.cache !== 'boolean') {
        katago.cache = false;
      }
      if (typeof katago.lookup_cache !== 'boolean') {
        katago.lookup_cache = false;
      }
      if (typeof katago.replay_final_only !== 'boolean') {
        katago.replay_final_only = false;
      }
    }
    return out;
  },
  // 14 → 15: Retire the never-wired `'light'` theme value, introduce
  // the `'cluster'` theme variant. v14 had `appearance.theme: 'dark'
  // | 'light'` declared on the type union and selectable in the
  // RegistryEditor dropdown, but `'light'` had never been wired to
  // anything (theme.css had a single `:root` block with the dark
  // values; no `[data-theme="light"]` ever existed). v15 introduces
  // the data-theme wiring for the first time, narrows the type union
  // to `'dark' | 'cluster'`, and ships `[data-theme="cluster"]` as a
  // real second theme. Migration coerces any non-{'dark','cluster'}
  // value to `'dark'` (the most likely transition: a user with the
  // never-effective `'light'` lands on the never-changed `'dark'`
  // they were de-facto seeing). Idempotent: a pre-existing `'dark'`
  // or `'cluster'` value is preserved. Default stays `'dark'` for
  // minimum-surprise; users who want the new theme flip the
  // registry dropdown to `'cluster'`.
  (blob: any) => {
    const out = structuredClone(blob);
    const appearance = out.profile?.settings?.appearance;
    if (appearance && typeof appearance === 'object') {
      const valid = appearance.theme === 'dark' || appearance.theme === 'cluster';
      if (!valid) {
        appearance.theme = 'dark';
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
