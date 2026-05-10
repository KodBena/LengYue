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
import { generateUUID } from '../engine/util';
import {
  detectBrowserLocale,
  isSupportedLocale,
} from '../i18n/locales';
import type { SystemMessage } from '../types';

/**
 * The current schema version. Bump only when the GlobalStore
 * persistence shape changes in a way that prior blobs need
 * forward-migration. Pair every bump with a new entry in the
 * migrations array below.
 */
export const CURRENT_SCHEMA_VERSION = 31;

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
        fadeDurationMs:   typeof e?.fadeDurationMs   === 'number'  ? e.fadeDurationMs   : 0,
        cycle:            typeof e?.cycle            === 'boolean' ? e.cycle            : false,
        pvOpacity:        typeof e?.pvOpacity        === 'number'  ? e.pvOpacity        : 1,
        annotation:       validAnnotation(e?.annotation) ? e.annotation : 'from1',
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
  // the `'cluster'` theme variant, flip the default to `'cluster'`.
  // v14 had `appearance.theme: 'dark' | 'light'` declared on the
  // type union and selectable in the RegistryEditor dropdown, but
  // `'light'` had never been wired to anything (theme.css had a
  // single `:root` block with the dark values; no
  // `[data-theme="light"]` ever existed). v15 introduces the
  // data-theme wiring for the first time, narrows the type union to
  // `'dark' | 'cluster'`, ships `[data-theme="cluster"]` as a real
  // second theme, and flips the new-install default to `'cluster'`.
  //
  // Migration coerces any non-{'dark','cluster'} value to the new
  // default `'cluster'`. The most likely such case is a v14 blob
  // with the never-effective `'light'` value — those users land on
  // `'cluster'` (the new default) rather than `'dark'` (the de-facto
  // value they were seeing) because the old default was a vestigial
  // wiring artifact, not an active choice. Idempotent: a
  // pre-existing `'dark'` or `'cluster'` value is preserved.
  //
  // Existing users with `theme: 'dark'` (the de-branding-migrated
  // majority) keep their `'dark'`. The `'dark' → 'cluster'`
  // transition for those users is intentionally manual: flip the
  // registry dropdown. Reasoning: silently inverting an active-
  // looking choice during an upgrade is the failure mode that
  // produces "my app suddenly looks different" surprises; we do
  // that for `'light'` only because `'light'` was demonstrably
  // never an effective choice.
  (blob: any) => {
    const out = structuredClone(blob);
    const appearance = out.profile?.settings?.appearance;
    if (appearance && typeof appearance === 'object') {
      const valid = appearance.theme === 'dark' || appearance.theme === 'cluster';
      if (!valid) {
        appearance.theme = 'cluster';
      }
    }
    return out;
  },
  // 15 → 16: Collapse per-tab deck contexts into a single field.
  // v15 had `session.ui.srContextIds` and `session.ui.databaseContextIds`
  // — the SR tab and the Database tab each carried their own ephemeral
  // root-id list for the deck pipeline. The cards-tab-merge arc
  // (`docs/notes/cards-tab-merge-plan.md`) merges the two tabs into a
  // single Cards tab, so the per-tab split no longer corresponds to
  // anything in the UI. v16 introduces `session.ui.cardsContextIds`
  // and drops both old fields.
  //
  // Seeding rule: prefer `databaseContextIds` (the form most users
  // were using once they realized the database tab gave them the same
  // pipeline pre-execution preview), fall back to `srContextIds`,
  // fall back to `[3]`. Idempotent: a pre-existing valid
  // `cardsContextIds` array is preserved.
  //
  // The activeTab field is intentionally NOT rewritten in this
  // migration — the tab restructure that introduces the `'cards'`
  // tab id ships separately, and rewriting `activeTab` here would
  // leave users on a tab id with no matching tab if they hydrated
  // between this migration and the UI restructure shipping.
  (blob: any) => {
    const out = structuredClone(blob);
    const ui = out.session?.ui;
    if (ui && typeof ui === 'object') {
      const validArr = (v: unknown): v is number[] =>
        Array.isArray(v) && v.every(n => typeof n === 'number');
      if (!validArr(ui.cardsContextIds)) {
        if (validArr(ui.databaseContextIds) && ui.databaseContextIds.length > 0) {
          ui.cardsContextIds = [...ui.databaseContextIds];
        } else if (validArr(ui.srContextIds) && ui.srContextIds.length > 0) {
          ui.cardsContextIds = [...ui.srContextIds];
        } else {
          ui.cardsContextIds = [3];
        }
      }
      delete ui.srContextIds;
      delete ui.databaseContextIds;
    }
    return out;
  },
  // 16 → 17: Rewrite `activeTab` for the cards-tab-merge UI restructure.
  // PR 2 of the cards-tab-merge arc collapses the SR and Database tabs
  // into a single Cards tab; users on `activeTab: 'sr'` or 'database'
  // would land on a tab id with no matching tab. Both legacy values
  // rewrite to `'cards'`. Other values (settings, analysis, other) pass
  // through unchanged. Idempotent: an already-`'cards'` blob is a no-op.
  //
  // The migration is paired with the controlTabs / template restructure
  // in the same PR — the `'cards'` tab id appears in App.vue at the same
  // commit as this migration ships, so a user hydrating against the new
  // bundle lands cleanly regardless of where their pre-PR `activeTab`
  // pointed. The split from migration 15 → 16 is deliberate: the field
  // rename had to land first so users on the intermediate state had
  // working SR/Database tabs against the merged cardsContextIds field.
  (blob: any) => {
    const out = structuredClone(blob);
    const ui = out.session?.ui;
    if (ui && typeof ui === 'object') {
      if (ui.activeTab === 'sr' || ui.activeTab === 'database') {
        ui.activeTab = 'cards';
      }
    }
    return out;
  },
  // 17 → 18: Surface the board-variations overlay setting in
  // `session.ui.boardVariations`. Renders sibling variations from
  // the current node (colored rings or A/B/C letters) directly on
  // the board, controlled by a single tri-state field. Backfills
  // with `'circles'` (the common GUI default per Lizzie / Sabaki /
  // KaTrain) so existing users land on a sensible visual default
  // rather than `'off'`, which would gate the new feature behind a
  // discovery step. Idempotent: a pre-existing valid value
  // (`'off'`, `'circles'`, or `'letters'`) is preserved; any other
  // value (or absent field) gets the default.
  (blob: any) => {
    const out = structuredClone(blob);
    const ui = out.session?.ui;
    if (ui && typeof ui === 'object') {
      const v = ui.boardVariations;
      const valid = v === 'off' || v === 'circles' || v === 'letters';
      if (!valid) {
        ui.boardVariations = 'circles';
      }
    }
    return out;
  },
  // 18 → 19: Surface the active-next-move hint toggle in
  // `session.ui.showActiveNextMove`. Independent of
  // `boardVariations` per its docstring — the user can have
  // variations on without the active marker, or vice versa, or
  // both, or neither. Backfills with `true` (common GUI posture);
  // users who find the marker noisy disable it via the Session
  // (UI) registry. Idempotent: a pre-existing boolean value is
  // preserved; non-boolean or absent gets `true`.
  (blob: any) => {
    const out = structuredClone(blob);
    const ui = out.session?.ui;
    if (ui && typeof ui === 'object') {
      if (typeof ui.showActiveNextMove !== 'boolean') {
        ui.showActiveNextMove = true;
      }
    }
    return out;
  },
  // 19 → 20: Surface the transposition-ring toggle in
  // `session.ui.showTranspositionRings`. Pre-feature, the cluster
  // ring on `MoveSuggestions` rendered unconditionally whenever a
  // move was part of a multi-tenant cluster. v20 adds an explicit
  // user toggle; default `true` preserves the pre-feature
  // behaviour. Idempotent: a pre-existing boolean value is
  // preserved; non-boolean or absent gets `true`.
  (blob: any) => {
    const out = structuredClone(blob);
    const ui = out.session?.ui;
    if (ui && typeof ui === 'object') {
      if (typeof ui.showTranspositionRings !== 'boolean') {
        ui.showTranspositionRings = true;
      }
    }
    return out;
  },
  // 20 → 21: Surface the Forest Directory navigator state in
  // `session.ui.forestNav`. The navigator presents game_sources →
  // roots as a file-manager hierarchy (PR 1 of the redesign arc);
  // expanded-set and current selection persist across reloads to
  // match the file-manager idiom. Defaults: empty expanded array,
  // null selection — fresh users land on a fully-collapsed tree
  // until they click. Idempotent: a pre-existing well-shaped
  // `forestNav` (object with `expanded: array` and a `selection`
  // key) is preserved; missing or malformed gets the empty defaults.
  // Stricter validation of `expanded` entries (NavNodeId format)
  // and `selection` shape is deliberately not done here — bogus
  // entries are dead in the renderer (Set lookup never matches,
  // selection doesn't drive the right pane), and `useForestNavigation`'s
  // mutators only ever write well-shaped values forward.
  (blob: any) => {
    const out = structuredClone(blob);
    const ui = out.session?.ui;
    if (ui && typeof ui === 'object') {
      const nav = ui.forestNav;
      const valid =
        nav && typeof nav === 'object' &&
        Array.isArray(nav.expanded) &&
        'selection' in nav;
      if (!valid) {
        ui.forestNav = { expanded: [], selection: null };
      }
    }
    return out;
  },
  // 21 → 22: Three new default deck strategies showcasing distinctive
  // pipeline-DSL primitives — Centroid Coverage (centroid_order
  // structural balance), Main Line First (heavy-path DFS via the
  // main_line_first preset, no final shuffle so the deck plays in
  // narrative order), and Balanced Overdue (centroid pool → Ebisu
  // filter combo, distinct from Standard's shallow-biased BFS pool).
  // Backfilled for existing users so the new vocabulary appears in
  // their workspace; user customisations preserved (each new deck is
  // added only if its id isn't already present, so a deliberately-
  // edited entry under one of these ids is left alone).
  //
  // Deck definitions are inlined here per the append-only migration
  // discipline — `defaults.ts` may evolve later without retro-
  // affecting blobs already migrated through this step. Idempotent:
  // running on a blob that already has the three ids is a no-op.
  (blob: any) => {
    const out = structuredClone(blob);
    const cardSets = out.profile?.cardSets;
    if (!cardSets || typeof cardSets !== 'object') return out;
    if (!cardSets['centroid_coverage']) {
      cardSets['centroid_coverage'] = {
        id: 'centroid_coverage',
        name: 'Centroid Coverage',
        description: 'Balanced subtree coverage via centroid decomposition — each card is a structurally informative sample of the tree (deep nodes and shallow nodes both surface). Pure structural; no SR weighting. Good for getting acquainted with a new game where the SR scheduler hasn\'t yet learned what to prioritize.',
        pipeline: [
          {
            stage: 'select',
            selection: { type: 'SubtreeSelection', n: 0 },
            ordering:  { type: 'centroid_order' },
          },
          { stage: 'take', n: 20 },
          { stage: 'shuffle' },
        ],
      };
    }
    if (!cardSets['main_line_first']) {
      cardSets['main_line_first'] = {
        id: 'main_line_first',
        name: 'Main Line First',
        description: 'Heavy-path DFS — principal variation before sidelines, with least-reviewed lines as tiebreak. No final shuffle, so the deck plays in narrative order: study the game as a game, not as scattered flashcards.',
        pipeline: [
          {
            stage: 'select',
            selection: { type: 'SubtreeSelection', n: 0 },
            ordering:  { type: 'main_line_first' },
          },
          { stage: 'take', n: 20 },
        ],
      };
    }
    if (!cardSets['balanced_overdue']) {
      cardSets['balanced_overdue'] = {
        id: 'balanced_overdue',
        name: 'Balanced Overdue',
        description: 'Pool by centroid coverage (structurally balanced sample of the tree), then filter to the most overdue. Distinct from Standard, which BFS-pools (shallow bias) before Ebisu — this gives exposure to deep parts of the tree where SR has flagged attention needed, instead of repeatedly drilling the opening.',
        pipeline: [
          {
            stage: 'select',
            selection: { type: 'SubtreeSelection', n: 0 },
            ordering:  { type: 'centroid_order' },
          },
          { stage: 'take', n: 30 },
          { stage: 'order', ordering: { type: 'EbisuRecallKey' } },
          { stage: 'take', n: 10 },
          { stage: 'shuffle' },
        ],
      };
    }
    return out;
  },
  // 22 → 23: Surface `clientGameId` on BoardState for game-source
  // dedup. v22 had no client-side game identifier; the backend
  // unconditionally inserted a new game_source row on every mint
  // with `game_metadata`, so two mints from positions A and B on one
  // loaded SGF surfaced in the Forest Directory as two distinct
  // "Untitled Game" entries with one root each.
  //
  // v23 introduces an opaque RFC4122 v4 UUID per BoardState; the
  // mint flow sends it as `game_metadata.client_game_id` on every
  // root-mint from that board's lifetime. Backend's get-or-create
  // on `(user_id, client_game_id)` resolves subsequent mints to
  // the same game_source row, with first-mint-wins on the recorded
  // metadata. Wire change shipped on the backend's
  // `backend/game-source-dedup` PR; rationale at
  // `docs/dispatch/backend-to-frontend-game-source-dedup-status.md`.
  //
  // Backfill rule: each existing board gets its own fresh UUID. No
  // retroactive grouping — pre-rollout game_sources were created
  // with NULL client_game_id on the backend (the partial unique
  // index ignores them), and pre-rollout BoardStates have no way
  // to reconstruct which mints came from which board's lifetime.
  // The two halves match: legacy state stays isolated; new state
  // groups correctly.
  //
  // Idempotent: a pre-existing string clientGameId is preserved
  // (a hand-edited blob isn't clobbered); missing or non-string
  // gets a fresh UUID. The `Array.isArray(out.boards)` guard is
  // belt-and-braces — every prior migration has assumed
  // `out.boards` is array-shaped, but the migration ledger is the
  // load-bearing append-only invariant; defensiveness is cheap
  // here.
  (blob: any) => {
    const out = structuredClone(blob);
    if (Array.isArray(out.boards)) {
      for (const b of out.boards) {
        if (b && typeof b === 'object' && typeof b.clientGameId !== 'string') {
          b.clientGameId = generateUUID();
        }
      }
    }
    return out;
  },
  // 23 → 24: Surface UI locale in `appearance.locale`. v23 had no
  // locale field; the SPA was English-only. v24 introduces vue-i18n
  // and the per-user locale preference. Backfills existing users
  // with their user-agent's preferred locale via
  // `detectBrowserLocale()` — first-encounter rule from
  // docs/notes/i18n-plan.md ("browser-detect at first run, store in
  // user's profile thereafter"). The migration is the natural place
  // for the one-time detection: it fires exactly once per
  // workspace blob (subsequent loads see the persisted value and
  // skip the detection).
  //
  // Idempotent: pre-existing valid SupportedLocale value preserved
  // (a hand-edited blob isn't clobbered); missing or unsupported
  // value gets the browser-detected one. New fresh installs land on
  // 'en' from defaults.ts, not on the migration's detection
  // (defaults.ts runs on the in-memory store; the migration runs on
  // hydration of a stored blob); fresh-install browser-detection
  // could be added at composable cold-start if it turns out to
  // matter, but bias is to keep new installs predictable rather
  // than locale-shifting silently.
  //
  // Slot was originally authored as 22 → 23 on the parked i18n PR1
  // branch; renumbered to 23 → 24 at rebase time after the
  // game-source dedup migration took the 22 → 23 slot during the
  // arc that landed first. Append-only invariant honored at the
  // ledger level — both migrations land in their committed-to
  // positions; the renumber is purely an authoring-time
  // pre-merge fix-up.
  (blob: any) => {
    const out = structuredClone(blob);
    const appearance = out.profile?.settings?.appearance;
    if (appearance && typeof appearance === 'object') {
      if (!isSupportedLocale(appearance.locale)) {
        appearance.locale = detectBrowserLocale();
      }
    }
    return out;
  },
  // 24 → 25: Migrate BoardId from short base-36 string (~7 chars,
  // produced by `Math.random().toString(36).substring(2, 9)` in
  // `store/board-factory.ts`) to RFC4122 v4 UUID. The original
  // short-id rationale ("intra-frontend handle, per-session
  // collision risk, human-readable in DevTools") was correct while
  // BoardIds never crossed the wire; the analysis-persistence
  // feature lands BoardId as backend's UUID-typed
  // `analysis_bundles.board_id` primary-key column (per
  // `docs/dispatch/frontend-to-backend-analysis-persistence.md`
  // and the status reply on the same dispatch), and a tighter
  // column type beats DevTools friendliness at that boundary.
  // NodeIds stay short — they're board-scoped, opaque to the
  // backend, and don't participate in the new persistence shape.
  //
  // Walks `out.boards` and assigns each board a fresh UUID,
  // building an old→new map. Re-keys the two persisted
  // `Partial<Record<BoardId, _>>` dictionaries through the map:
  // `session.reviews` and `engine.activeMode`. Entries whose key
  // isn't in the map are orphans (a delete that crashed before
  // the dictionary was cleaned up); they're dropped here rather
  // than carried forward with a stale key, since the owning board
  // no longer exists.
  //
  // Non-idempotent in the technical sense (re-running would
  // re-randomise the IDs), but the schema-version increment
  // guarantees it runs exactly once per blob — the migration
  // ledger's append-only contract is what makes the
  // non-idempotency safe at the system level.
  //
  // Runtime-only state (AnalysisService.activeSubscriptions /
  // activeQueryIds / restartCallbacks, board-card-trees module-
  // scope Map, useReviewSession's pendingAnalysisAborts) is not
  // migrated — those Maps are populated post-hydrate from the
  // now-UUID'd `store.boards` and never see the old IDs.
  (blob: any) => {
    const out = structuredClone(blob);
    if (!Array.isArray(out.boards)) return out;

    const idMap = new Map<string, string>();
    for (const b of out.boards) {
      if (b && typeof b === 'object' && typeof b.id === 'string') {
        const newId = generateUUID();
        idMap.set(b.id, newId);
        b.id = newId;
      }
    }

    const reKey = <T>(dict: Record<string, T> | undefined): Record<string, T> => {
      if (!dict || typeof dict !== 'object') return {};
      const next: Record<string, T> = {};
      for (const [k, v] of Object.entries(dict)) {
        const mapped = idMap.get(k);
        if (mapped !== undefined) next[mapped] = v;
        // else: orphan — drop.
      }
      return next;
    };

    if (out.session && typeof out.session === 'object') {
      out.session.reviews = reKey(out.session.reviews);
    }
    if (out.engine && typeof out.engine === 'object') {
      out.engine.activeMode = reKey(out.engine.activeMode);
    }

    return out;
  },
  // 25 → 26: Surface the experimental analysis-persistence panel
  // visibility toggle in `engine.katago.analysisStorageEnabled`.
  // The persistence feature is in early testing; the panel carries
  // an "experimental" tag and an inline tooltip explaining the
  // storage semantics, so users discover the feature naturally
  // rather than via the registry editor (which is itself hard to
  // navigate as the settings tree grows).
  //
  // Default `true` for v25 blobs — surfaces the panel in
  // AnalysisControls.vue. Idempotent: a pre-existing boolean is
  // preserved (a hand-edited blob's deliberate `false` survives
  // this migration); non-boolean or missing field gets `true`.
  //
  // The toggle controls panel visibility only; the save action
  // itself remains manual regardless. Whether saving ever becomes
  // transparent (auto-save) is a future decision contingent on
  // operational evidence from the manual-test phase.
  (blob: any) => {
    const out = structuredClone(blob);
    const katago = out.profile?.settings?.engine?.katago;
    if (katago && typeof katago === 'object') {
      if (typeof katago.analysisStorageEnabled !== 'boolean') {
        katago.analysisStorageEnabled = true;
      }
    }
    return out;
  },
  // 26 → 27: Repair non-UUID BoardIds that the SGF-load path
  // continued to mint after migration 24 → 25 shipped. The 24 → 25
  // migration moved BoardId to RFC4122 UUID across the persisted
  // blob and `createInitialBoard()`, but missed
  // `engine/sgf-loader.ts`, which kept emitting `'sgf-' + uuid()`
  // five-character slugs. Any board the user loaded from an SGF
  // after 24 → 25 ran seeded a slug-shaped id into a v25/v26 blob,
  // where it stayed indefinitely and crashed the analysis-bundle
  // PUT path with a 422 (FastAPI types `board_id` as a UUID).
  //
  // Walks `out.boards` and assigns a fresh UUID to any `b.id` that
  // doesn't match the UUID shape. Re-keys the two persisted
  // `Partial<Record<BoardId, _>>` dictionaries (`session.reviews`
  // and `engine.activeMode`) through the slug→UUID map; entries
  // whose key is already UUID-shaped pass through unchanged. This
  // differs from 24 → 25's "drop orphans" semantics because here
  // most existing dictionary keys are UUIDs that should be
  // preserved verbatim — only the slug-shaped keys need re-keying.
  //
  // The loader fix that prevents new occurrences ships in the
  // same change as this migration.
  (blob: any) => {
    const out = structuredClone(blob);
    if (!Array.isArray(out.boards)) return out;

    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const idMap = new Map<string, string>();
    for (const b of out.boards) {
      if (b && typeof b === 'object' && typeof b.id === 'string' && !UUID_RE.test(b.id)) {
        const newId = generateUUID();
        idMap.set(b.id, newId);
        b.id = newId;
      }
    }

    if (idMap.size === 0) return out;

    const reKey = <T>(dict: Record<string, T> | undefined): Record<string, T> => {
      if (!dict || typeof dict !== 'object') return dict ?? {};
      const next: Record<string, T> = {};
      for (const [k, v] of Object.entries(dict)) {
        const mapped = idMap.get(k);
        next[mapped ?? k] = v;
      }
      return next;
    };

    if (out.session && typeof out.session === 'object') {
      out.session.reviews = reKey(out.session.reviews);
    }
    if (out.engine && typeof out.engine === 'object') {
      out.engine.activeMode = reKey(out.engine.activeMode);
    }

    return out;
  },
  // 27 → 28: Surface KataGo engine-side runtime overrides in
  // `engine.katago.overrideSettings`. v27 had no field; the analyze
  // call sites in `services/analysis-service.ts` did not send an
  // `overrideSettings` block at all, so KataGo used whatever
  // values its config file declared (typically the upstream
  // defaults — `reportAnalysisWinratesAs: 'SIDETOMOVE'`,
  // `rootNumSymmetriesToSample: 1`, no root noise). v28 introduces
  // the field with a non-empty seed:
  //   reportAnalysisWinratesAs: 'WHITE'      (stable framing)
  //   rootNumSymmetriesToSample: 8           (eight-symmetry average)
  //   wideRootNoise: 0.02                    (small Dirichlet noise)
  // The seed is a sensible default analysis posture for the SR
  // study workflow; users can extend / replace via the registry
  // editor (the path is whitelisted as a dynamic node).
  //
  // Idempotent: an existing object value is preserved verbatim
  // (a hand-edited blob's deliberate choices survive); a missing
  // or non-object field gets the seed. The non-empty default is
  // a deliberate choice — it does mean existing users see a
  // behavior change at upgrade time (their KataGo will start
  // using the eight-symmetry average instead of the single
  // symmetry, etc.). The change is small in the limit (a slightly
  // more stable evaluation) and reversible by clearing the keys
  // through the registry editor; the alternative — seeding empty
  // and only honouring the request for new installs — splits the
  // field's behaviour between cohorts in a way that drifts the
  // user-visible analysis posture without recourse.
  //
  // Wire-shape semantics documented on
  // `KataGoAnalysisQuery.overrideSettings` in
  // `engine/katago/types.ts`; type-shape on
  // `AppSettings.engine.katago.overrideSettings` in `types.ts`.
  (blob: any) => {
    const out = structuredClone(blob);
    const katago = out.profile?.settings?.engine?.katago;
    if (katago && typeof katago === 'object') {
      const existing = katago.overrideSettings;
      const isPlainObject =
        existing !== null &&
        typeof existing === 'object' &&
        !Array.isArray(existing);
      if (!isPlainObject) {
        katago.overrideSettings = {
          reportAnalysisWinratesAs: 'WHITE',
          rootNumSymmetriesToSample: 8,
          wideRootNoise: 0.02,
        };
      }
    }
    return out;
  },
  // 28 → 29: Surface the wire-request gate for the `transposition`
  // capability under the proxy v1.0.14+ capability-negotiation
  // contract. v28 had no field; the analysis-service unconditionally
  // omitted any per-query `capabilities` opt-in, falling through to
  // the proxy's legacy auto-engage path (every wired Transformer
  // engaged on every query). v29 introduces an explicit
  // `engine.katago.useTransposition: boolean` toggle that gates
  // whether the SPA injects `transposition: {}` into the per-query
  // capabilities dict.
  //
  // Default `true` preserves pre-v29 behaviour: clients hitting a
  // v1.0.14+ proxy with `PROXY_ADVERTISE_CAPABILITIES=true` will
  // continue to receive transposition-enriched packets (the
  // `clusterId` field on `KataMoveInfo` consumed by the cluster-rings
  // overlay). Users can flip via the registry editor to skip the
  // Python↔C++ boundary cost when they don't render rings.
  //
  // Idempotent: an existing boolean value is preserved verbatim
  // (a hand-edited blob's deliberate choice survives); a missing or
  // non-boolean field gets the `true` default.
  //
  // Wire-shape semantics documented on
  // `KataGoAnalysisQuery.capabilities` in `engine/katago/types.ts`;
  // type-shape on `AppSettings.engine.katago.useTransposition` in
  // `types.ts`.
  (blob: any) => {
    const out = structuredClone(blob);
    const katago = out.profile?.settings?.engine?.katago;
    if (katago && typeof katago === 'object') {
      if (typeof katago.useTransposition !== 'boolean') {
        katago.useTransposition = true;
      }
    }
    return out;
  },
  // 29 → 30: Surface user-controlled opt-in + metadata for the
  // proxy's adaptive_reevaluate middleware (proxy v1.0.14+
  // capability). v29 had no field; the SPA's wire payload either
  // omitted adaptive_reevaluate (when capabilities advertised) or
  // fell through to legacy auto-engage (when not advertised). v30
  // introduces explicit user control:
  //   - enabled (boolean, default false)
  //   - worstQuantile (number, default 0.05; proxy default is 0.25)
  //   - extraVisits (number, default 800; matches proxy default)
  //
  // Default `enabled: false` because adaptive's deeper-analysis
  // follow-ups change the visit count of resulting packets, which
  // is a surprise unless the user opts in deliberately. The UI
  // surfaces a checkbox in the analysis tab when the proxy
  // advertises adaptive_reevaluate; checking it reveals the two
  // number inputs.
  //
  // Idempotent: an existing object value is preserved verbatim
  // with per-key fallback (a hand-edited blob's deliberate choices
  // survive); missing or non-object value gets the full default.
  //
  // Wire-shape semantics documented on
  // `KataGoAnalysisQuery.capabilities` in `engine/katago/types.ts`;
  // type-shape on `AppSettings.engine.katago.adaptiveReevaluate` in
  // `types.ts`. Proxy-side metadata schema documented in
  // `proxy/middleware/adaptive_reevaluate.py`.
  (blob: any) => {
    const out = structuredClone(blob);
    const katago = out.profile?.settings?.engine?.katago;
    if (katago && typeof katago === 'object') {
      const existing = katago.adaptiveReevaluate;
      const isPlainObject =
        existing !== null &&
        typeof existing === 'object' &&
        !Array.isArray(existing);
      if (!isPlainObject) {
        katago.adaptiveReevaluate = {
          enabled: false,
          worstQuantile: 0.05,
          extraVisits: 800,
        };
      } else {
        if (typeof existing.enabled !== 'boolean') existing.enabled = false;
        if (typeof existing.worstQuantile !== 'number') existing.worstQuantile = 0.05;
        if (typeof existing.extraVisits !== 'number') existing.extraVisits = 800;
      }
    }
    return out;
  },

  // 30 → 31: Surface ponder-mode maxVisits ceiling as a user-tunable
  // registry setting. v30 hardcoded 100,000 via the `PONDER_MAX_VISITS`
  // constant in `engine/constants.ts`; on weak networks / CPU-only
  // setups the cap was hit in seconds, surprising users who expected
  // ponder to keep accumulating. v31 introduces
  // `engine.katago.ponderMaxVisits` (default 2,000,000), read by
  // `analyzeActiveNode(mode='ponder')` in the analysis service and by
  // `AnalysisTimelinePanel.vue`'s visits-input cap.
  //
  // The `PONDER_MAX_VISITS` constant remains for the rugplot's
  // intensity-gradient saturation target (a visualization scale, not
  // a wire-protocol ceiling) — see the constant's docstring.
  //
  // Idempotent: a non-number existing value is replaced; an existing
  // numeric value is preserved.
  (blob: any) => {
    const out = structuredClone(blob);
    const katago = out.profile?.settings?.engine?.katago;
    if (katago && typeof katago === 'object') {
      if (typeof katago.ponderMaxVisits !== 'number') {
        katago.ponderMaxVisits = 2_000_000;
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
