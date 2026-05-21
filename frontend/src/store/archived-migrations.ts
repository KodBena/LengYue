/**
 * src/store/archived-migrations.ts
 * Older schemaVersion migrations, lifted out of `migrations.ts` to
 * keep the active maintenance file scoped to the latest two
 * migrations as style anchors. See `migrations.ts`'s rolling-archive
 * discipline docstring for the per-PR cadence.
 *
 * Scope as of 2026-05-17: migrations 1 → 2 through 42 → 43 (42
 * entries). The first eight covered pre-v1.0.0 schema evolution;
 * the next thirty-four are the v1.0.x – v1.1.x active cycle. All
 * are now consolidated here under the same archive contract.
 *
 * Why preserved (not deleted): the migration framework's `migrate()`
 * function indexes a contiguous array — `migrations[i]` carries
 * `(i+1) → (i+2)` — and ADR-0002's fail-loudly posture leans on the
 * "any blob in the wild can deterministically migrate forward"
 * guarantee. Stubbing entries would break that property; lifting them
 * preserves it at the cost of one indirection. The bodies here are
 * frozen exactly as they shipped (a migration is a contract with the
 * persisted-blob population, not a refactor target).
 *
 * License: Public Domain (The Unlicense)
 */

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

export type Migration = (blob: any) => any;

export const archivedMigrations: Migration[] = [
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
  // 2 → 3: Introduce session.ui.overlayLayers, the multi-select set of
  // board-overlay metrics. Defaults to `{ ownership: false }`. Existing
  // blobs at v2 lack the field; absence is treated as opt-out (the user
  // must explicitly enable the overlay). Idempotent: leaves an
  // already-populated overlayLayers untouched, only fills in missing
  // sub-fields against the v3 default shape.
  (blob: any) => {
    const out = structuredClone(blob);
    if (out.session?.ui) {
      const existing = out.session.ui.overlayLayers;
      out.session.ui.overlayLayers = {
        ownership: typeof existing?.ownership === 'boolean' ? existing.ownership : false,
      };
    }
    return out;
  },
  // 3 → 4: Split ownership from a single boolean into three orthogonal
  // sub-modes (continuous / dots / liveness). v3 stored a single flag
  // covering "show ownership somehow"; v4 lets the user independently
  // toggle the continuous-fill territory view, the discrete confidence
  // dots, and the dead-stone liveness highlight. A v3 `true` maps to
  // `{ continuous: true, dots: false, liveness: false }` — the
  // continuous-fill style is the new canonical "ownership view," so
  // preserving the user's prior intent that way is the least surprising
  // forward path. False or missing maps to all-off.
  (blob: any) => {
    const out = structuredClone(blob);
    const layers = out.session?.ui?.overlayLayers;
    if (layers) {
      const prev = layers.ownership;
      if (typeof prev === 'boolean') {
        layers.ownership = {
          continuous: prev,
          dots: false,
          liveness: false,
        };
      } else if (prev && typeof prev === 'object') {
        layers.ownership = {
          continuous: !!prev.continuous,
          dots: !!prev.dots,
          liveness: !!prev.liveness,
        };
      } else {
        layers.ownership = { continuous: false, dots: false, liveness: false };
      }
    }
    return out;
  },
  // 4 → 5: Introduce profile.settings.appearance.intensityHueShift,
  // the user-tunable hue offset (in degrees) applied to the visit-
  // intensity gradient. Defaults to -43 — the prior hardcoded
  // constant, so nothing visually changes for users who don't
  // touch the slider. A pre-existing numeric value in the blob is
  // preserved (the user has already calibrated); anything else
  // (missing, wrong type) resets to the default.
  (blob: any) => {
    const out = structuredClone(blob);
    const appearance = out.profile?.settings?.appearance;
    if (appearance) {
      if (typeof appearance.intensityHueShift !== 'number') {
        appearance.intensityHueShift = -43;
      }
    }
    return out;
  },
  // 5 → 6: Introduce qEUBO calibration scaffolding. Three fields
  // seed alongside existing structures; v5 had no qEUBO concept,
  // so every blob arriving from v5 needs the seed:
  //
  //   - profile.settings.engine.katago.analysis_env.parameter_meta:
  //     per-parameter metadata (range + qeubo_controlled flag) read
  //     by the calibration loop. Empty dict = no parameter is yet
  //     under qEUBO control.
  //   - profile.qeuboPinnedBookmarks: user-pinned snapshots of
  //     analysis_env.parameters values. Empty list = nothing pinned.
  //   - session.ui.qeuboToolbarView: the toolbar cluster's current
  //     view. 'applied' is the only sensible default at migration
  //     time (no experiment exists yet).
  //
  // Each seed checks for "missing or malformed" rather than just
  // missing — the registry editor lets the user write arbitrary
  // values into the persisted blob, so a hand-edited corrupt value
  // is normalized here rather than crashing the consumer.
  (blob: any) => {
    const out = structuredClone(blob);

    const ae = out.profile?.settings?.engine?.katago?.analysis_env;
    if (ae) {
      const pm = ae.parameter_meta;
      if (pm === undefined || pm === null || typeof pm !== 'object' || Array.isArray(pm)) {
        ae.parameter_meta = {};
      }
    }

    if (out.profile && !Array.isArray(out.profile.qeuboPinnedBookmarks)) {
      out.profile.qeuboPinnedBookmarks = [];
    }

    if (out.session?.ui) {
      const view = out.session.ui.qeuboToolbarView;
      if (view !== 'applied' && view !== 'A' && view !== 'B') {
        out.session.ui.qeuboToolbarView = 'applied';
      }
    }

    return out;
  },
  // 6 → 7: Default-palette repair (release-scope item 5). Three
  // concerns, all under the discipline "preserve user customisations,
  // replace only the broken-seed literals." See
  // docs/dispatch/frontend-to-frontend-default-palette-metrics-spec.md
  // §6 for the rationale of every detection rule below.
  //
  //  (a) Symbol repair: the broken seed's `visit_ratio` referenced
  //      `uservisits` (the proxy stdlib provides `_uservisits`). The
  //      historical `quality_delta` referenced `spread`, which the
  //      seed defined with a heuristic-aware denominator. Both are
  //      replaced when their bodies match the broken-seed literals;
  //      user-customised bodies are left in place.
  //  (b) `spread` → `decisiveness` rename: if the symbol named
  //      `spread` matches the broken seed, rename it to `decisiveness`
  //      with the heuristic-oblivious formula. Update any formula
  //      body referencing `spread(` to `decisiveness(` IN THE SAME
  //      PASS — but only if `spread` actually got renamed (we never
  //      rewrite bodies referencing a user-customised `spread`).
  //  (c) Seed expansion: add the new symbols (`complexity`,
  //      `score_volatility`, `nn_uncertainty`, `mean_summary`, plus
  //      the engine-recommendation-axis symbols) only when absent;
  //      add the new palettes (`quality`, `score`, `rank`) only when
  //      absent. If `activePaletteId === 'default'` and we just
  //      replaced the broken default's body, promote to `'quality'`.
  //
  // The `alpha` parameter is preserved if numeric; defaulted to 0.25
  // otherwise.
  (blob: any) => {
    const out = structuredClone(blob);
    const ae = out.profile?.settings?.engine?.katago?.analysis_env;
    if (!ae || typeof ae !== 'object') return out;

    // Broken-seed literals — exact string match required to overwrite.
    const BROKEN_VISIT_RATIO = 'uservisits(x[0]) / x[0]["rootInfo"]["visits"]';
    const BROKEN_SPREAD      = 'x[0]["moveInfos"][0]["visits"] / x[0]["rootInfo"]["visits"]';
    const HISTORICAL_QUALITY = 'visit_ratio(x)**(spread(x)**alpha)';

    // New definitions.
    const NEW_VISIT_RATIO   = '_uservisits(x[0]) / _maxvisits(x[0])';
    const NEW_DECISIVENESS  = '_maxvisits(x) / x["rootInfo"]["visits"]';
    const NEW_QUALITY_DELTA = 'visit_ratio(x) ** (decisiveness(x[0]) ** alpha)';

    const symbols = ae.symbols && typeof ae.symbols === 'object' ? ae.symbols : (ae.symbols = {});

    // (a) Repair `visit_ratio` if it matches the broken literal.
    if (symbols.visit_ratio === BROKEN_VISIT_RATIO) {
      symbols.visit_ratio = NEW_VISIT_RATIO;
    }

    // (b) `spread` → `decisiveness` rename, with body-rewrite tracking.
    let renamedSpread = false;
    if (symbols.spread === BROKEN_SPREAD) {
      symbols.decisiveness = symbols.decisiveness ?? NEW_DECISIVENESS;
      delete symbols.spread;
      renamedSpread = true;
    } else if (symbols.spread !== undefined && symbols.decisiveness === undefined) {
      // User has a custom `spread` symbol AND no `decisiveness`. Add
      // `decisiveness` alongside; leave their `spread` untouched.
      symbols.decisiveness = NEW_DECISIVENESS;
    }

    // Repair `quality_delta` if it matches the historical literal.
    // The historical body referenced `spread(x)`; if we just renamed
    // `spread` → `decisiveness`, the body's `spread(` substring needs
    // updating. The new body also moves to `x[0]` indexing for the
    // smoother input (per spec §2). Both edits land via outright
    // replacement when the body matches the historical literal.
    if (symbols.quality_delta === HISTORICAL_QUALITY) {
      symbols.quality_delta = NEW_QUALITY_DELTA;
    } else if (renamedSpread && typeof symbols.quality_delta === 'string') {
      // User-customised `quality_delta` body — rewrite `spread(` to
      // `decisiveness(` so the rename doesn't break their formula.
      symbols.quality_delta = symbols.quality_delta.replace(/\bspread\(/g, 'decisiveness(');
    }

    // If we renamed `spread`, also rewrite any other user symbol
    // bodies that reference it. Bodies that DIDN'T reference the
    // renamed `spread` (i.e., the user kept their custom `spread`)
    // are left alone — that branch hit the `else if` above.
    if (renamedSpread) {
      for (const key of Object.keys(symbols)) {
        if (typeof symbols[key] === 'string' && key !== 'quality_delta') {
          symbols[key] = symbols[key].replace(/\bspread\(/g, 'decisiveness(');
        }
      }
    }

    // (c) Seed expansion — add only if absent. Order intentionally
    // mirrors defaults.ts for diff-readability.
    const NEW_SYMBOLS: Record<string, string> = {
      complexity:               'safe(_visit_entropy(x) / _uniform_entropy(len(x["moveInfos"])))',
      score_volatility:         'x["rootInfo"]["scoreStdev"]',
      nn_uncertainty:           'x["rootInfo"]["rawStWrError"]',
      scoreLead_delta:          'x[1]["rootInfo"]["scoreLead"] - x[0]["rootInfo"]["scoreLead"]',
      winrate_loss_topvsuser:
        '(x[0]["moveInfos"][0]["winrate"] - x[0]["userMoveInfo"]["winrate"]) if x[0]["userMoveInfo"] else 0',
      scoreLead_loss_topvsuser:
        '(x[0]["moveInfos"][0]["scoreLead"] - x[0]["userMoveInfo"]["scoreLead"]) if x[0]["userMoveInfo"] else 0',
      user_order:               'x[0]["userMoveInfo"]["order"] if x[0]["userMoveInfo"] else 999',
      policy_loss:              'x[0]["moveInfos"][0]["prior"] - (x[0]["userMoveInfo"]["prior"] if x[0]["userMoveInfo"] else 0)',
      risk_adjusted_score_loss:
        'safe((x[0]["moveInfos"][0]["scoreLead"] - (x[0]["userMoveInfo"]["scoreLead"] if x[0]["userMoveInfo"] else x[0]["moveInfos"][0]["scoreLead"])) / x[0]["rootInfo"]["scoreStdev"])',
      rank_quality:             '1.0 / (1 + (x[0]["userMoveInfo"]["order"] if x[0]["userMoveInfo"] else 999))',
      mean_summary:             'float(np.mean(x))',
    };
    for (const [name, body] of Object.entries(NEW_SYMBOLS)) {
      if (symbols[name] === undefined) symbols[name] = body;
    }

    // (c) Palette additions. Detect whether the historical 'default'
    // palette body matched the broken seed; if so, repair its
    // state_fns to the new shape and remember to repoint
    // activePaletteId. User-customised 'default' palettes (different
    // delta_fn / summary_fn / state_fns mapping) stay untouched —
    // we never overwrite a customised palette.
    const palettes = Array.isArray(ae.palettes) ? ae.palettes : (ae.palettes = []);
    let defaultWasBrokenSeed = false;
    const defaultPalette = palettes.find((p: any) => p?.id === 'default');
    if (defaultPalette) {
      const sf = defaultPalette.state_fns ?? {};
      const matchesBrokenSeed =
        defaultPalette.delta_fn === 'quality_delta' &&
        defaultPalette.summary_fn === 'min_summary' &&
        sf['Complexity'] === 'visit_entropy' &&
        sf['Win Probability'] === 'winrate' &&
        sf['Score Advantage'] === 'score_lead';
      if (matchesBrokenSeed) {
        defaultPalette.state_fns = {
          'Complexity':      'complexity',
          'Win Probability': 'winrate',
          'Score Advantage': 'score_lead',
        };
        defaultWasBrokenSeed = true;
      }
    }

    // Add the three new palettes only if their ids aren't already
    // present.
    const NEW_PALETTES = [
      {
        id: 'quality',
        name: 'Quality (Robust-Child Calibrated)',
        delta_fn: 'quality_delta',
        summary_fn: 'min_summary',
        state_fns: {
          'Complexity':      'complexity',
          'Win Probability': 'winrate',
          'Score Advantage': 'score_lead',
        }
      },
      {
        id: 'score',
        name: 'Score Loss',
        delta_fn: 'scoreLead_loss_topvsuser',
        summary_fn: 'mean_summary',
        state_fns: {
          'Volatility':      'score_volatility',
          'Win Probability': 'winrate',
          'Score Advantage': 'score_lead',
        }
      },
      {
        id: 'rank',
        name: 'Engine Rank',
        delta_fn: 'rank_quality',
        summary_fn: 'mean_summary',
        state_fns: {
          'Complexity':      'complexity',
          'Win Probability': 'winrate',
        }
      },
    ];
    const existingIds = new Set(palettes.map((p: any) => p?.id));
    for (const p of NEW_PALETTES) {
      if (!existingIds.has(p.id)) palettes.push(p);
    }

    // activePaletteId promotion: only when the user was on 'default'
    // AND that 'default' was the broken seed (we just repaired it).
    // Customised-default users keep their selection.
    if (defaultWasBrokenSeed && ae.activePaletteId === 'default') {
      ae.activePaletteId = 'quality';
    }

    // alpha parameter: preserve if numeric, default otherwise.
    const params = ae.parameters && typeof ae.parameters === 'object'
      ? ae.parameters
      : (ae.parameters = {});
    if (typeof params.alpha !== 'number') params.alpha = 0.25;

    return out;
  },
  // 7 → 8: Add `player_sign` (SIDETOMOVE → black-perspective sign
  // factor) to the symbol library, and rebase `scoreLead_loss_topvsuser`
  // onto it. The v7 seed's body computed top-vs-user score-points loss
  // from the engine's recommendation but didn't normalise the
  // SIDETOMOVE perspective; under that frame the sign of the value
  // alternates by mover. Multiplying by `player_sign(x[0])` normalises
  // to a black-perspective sign that's stable across the move
  // boundary.
  //
  // Detection rule (preserve user customisations): replace
  // `scoreLead_loss_topvsuser` only when its body matches the v7 seed
  // literal verbatim. Add `player_sign` only when absent.
  (blob: any) => {
    const out = structuredClone(blob);
    const ae = out.profile?.settings?.engine?.katago?.analysis_env;
    if (!ae || typeof ae !== 'object') return out;

    const symbols = ae.symbols && typeof ae.symbols === 'object'
      ? ae.symbols
      : (ae.symbols = {});

    const V7_SCORELEAD_LOSS =
      '(x[0]["moveInfos"][0]["scoreLead"] - x[0]["userMoveInfo"]["scoreLead"]) if x[0]["userMoveInfo"] else 0';
    const NEW_SCORELEAD_LOSS =
      'player_sign(x[0]) * ((x[0]["rootInfo"]["scoreLead"] - x[0]["userMoveInfo"]["scoreLead"]) if x[0]["userMoveInfo"] else 0)';
    const NEW_PLAYER_SIGN =
      '1.0 if x["rootInfo"]["currentPlayer"] == "B" else -1.0';

    if (symbols.player_sign === undefined) {
      symbols.player_sign = NEW_PLAYER_SIGN;
    }

    if (symbols.scoreLead_loss_topvsuser === V7_SCORELEAD_LOSS) {
      symbols.scoreLead_loss_topvsuser = NEW_SCORELEAD_LOSS;
    }

    return out;
  },
  // 8 → 9: Flip `systemLogExpanded` default from true to false.
  // The system-log bar's 30px vertical footprint eats space the
  // analysis dashboard would rather have, and the bar is a debugging
  // surface that few users actively read. Users on `true` are almost
  // certainly there because of the prior default rather than an
  // explicit choice (the toggle lives in the Session-UI registry,
  // not on the main UI), so unconditional flip is the right move; a
  // user who genuinely wants it visible can re-enable in one click.
  // Idempotent: if the field is missing or non-boolean (corrupt or
  // hand-edited), normalises to false.
  (blob: any) => {
    const out = structuredClone(blob);
    if (out.session?.ui) {
      out.session.ui.systemLogExpanded = false;
    }
    return out;
  },
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
  // docs/archive/notes/i18n-plan.md ("browser-detect at first run, store in
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
  // `analyzeActiveNode(mode='ponder')` in the analysis service, by
  // `AnalysisTimelinePanel.vue`'s visits-input cap, and by
  // `BoardTab.vue`'s rugplot intensity-gradient floor — the same
  // three consumer sites the removed constant served.
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
  // 31 → 32: Surface the per-stone move-number annotation toggle in
  // `session.ui.showStoneMoveNumbers`. Pre-feature, the board never
  // rendered move numbers on placed stones; users wanting that
  // affordance (common in SGF viewers when reviewing a game) had no
  // surface for it. v32 adds the boolean toggle, rendered as a "#"
  // button in StatusBar; default `false` preserves the pre-feature
  // visual (no annotation). Idempotent: a pre-existing boolean
  // value is preserved; non-boolean or absent gets `false`.
  (blob: any) => {
    const out = structuredClone(blob);
    const ui = out.session?.ui;
    if (ui && typeof ui === 'object') {
      if (typeof ui.showStoneMoveNumbers !== 'boolean') {
        ui.showStoneMoveNumbers = false;
      }
    }
    return out;
  },
  // 32 → 33: CardSet hyperparameter-harness scaffolding. Every deck
  // gains `hyperparameters: HyperparamDecl[]` alongside its existing
  // `pipeline`. Decks with no holes (the universal pre-v33 case)
  // type-check identically post-migration because `pipeline:
  // PipelineStageWithHoles[]` is a supertype of `PipelineStage[]`.
  // The harness modal opens at runtime only when the array is non-
  // empty; legacy decks therefore behave unchanged.
  //
  // Idempotent: an existing array on each card-set is preserved
  // unchanged; missing / non-array gets `[]`. See
  // `docs/archive/notes/dsl-hyperparameter-harness-plan.md` for the design.
  (blob: any) => {
    const out = structuredClone(blob);
    const cardSets = out.profile?.cardSets;
    if (cardSets && typeof cardSets === 'object') {
      for (const key of Object.keys(cardSets)) {
        const cs = cardSets[key];
        if (cs && typeof cs === 'object' && !Array.isArray(cs.hyperparameters)) {
          cs.hyperparameters = [];
        }
      }
    }
    return out;
  },
  // 33 → 34: Watchdog dot colour-transition toggle. Backfills the
  // new `session.ui.watchdogColorTransition` field with `false`
  // for existing blobs (matching the fresh-install default in
  // `store/defaults.ts`). The ping-tandem animation is opt-in;
  // existing users keep the historical sample-driven behaviour
  // until they flip the toggle. Pure UI preference — engine
  // behaviour unchanged. See
  // `AppSettings.session.ui.watchdogColorTransition` in `types.ts`
  // for the field's full doc.
  //
  // Idempotent: an existing boolean is preserved unchanged.
  (blob: any) => {
    const out = structuredClone(blob);
    const ui = out.session?.ui;
    if (ui && typeof ui === 'object') {
      if (typeof ui.watchdogColorTransition !== 'boolean') {
        ui.watchdogColorTransition = false;
      }
    }
    return out;
  },
  // 34 → 35: Card-metadata inline-edit arc 1 backfill on persisted
  // review queues. Cards fetched FRESH from the backend always
  // carry `tags: string[]` (the ACL coerces `undefined → []` at the
  // boundary), but cards persisted in `session.reviews[boardId].queue`
  // pre-date the arc-1 wire-shape addition and lack the field
  // entirely. The inline-edit panel (arc 2 consumer) crashes on
  // `[...card.tags]` when iterating undefined — runtime symptom:
  // "can't access property Symbol.iterator, props.card.tags is
  // undefined" caught by `RootErrorBoundary` after starting a
  // review session against a pre-arc-1 persisted queue.
  //
  // Backfill: walk every active review queue's cards and set
  // `tags: []` on any card missing the field. Idempotent — an
  // existing array is preserved unchanged. Matches the ACL's
  // empty-default semantic (the card simply has no tags, which
  // is what `tags: []` says on the wire).
  (blob: any) => {
    const out = structuredClone(blob);
    const reviews = out.session?.reviews;
    if (reviews && typeof reviews === 'object') {
      for (const sessionData of Object.values(reviews as Record<string, unknown>)) {
        if (!sessionData || typeof sessionData !== 'object') continue;
        const queue = (sessionData as { queue?: unknown }).queue;
        if (!Array.isArray(queue)) continue;
        for (const card of queue) {
          if (!card || typeof card !== 'object') continue;
          if (!Array.isArray((card as { tags?: unknown }).tags)) {
            (card as { tags?: unknown }).tags = [];
          }
        }
      }
    }
    return out;
  },
  // 35 → 36: Knob-registry substrate seed (knob-registry-plan Phase 1).
  // Backfills the new `profile.settings.knobs` field with an empty
  // object on existing blobs (matching the fresh-install default in
  // `store/defaults.ts`). The substrate is the SSOT for user-
  // controllable variables — Phase 1 ships the empty registry plus
  // the type vocabulary and path-walk accessors in `src/lib/knobs.ts`;
  // Phase 3+ promotions populate the registry as scalars lift off of
  // inline literals. No consumer side-effects until then. See
  // `AppSettings.knobs` in `types.ts` and
  // `docs/notes/knob-registry-plan.md` for the design.
  //
  // Idempotent: an existing plain-object value is preserved
  // unchanged; missing / non-object gets `{}`.
  (blob: any) => {
    const out = structuredClone(blob);
    const settings = out.profile?.settings;
    if (settings && typeof settings === 'object') {
      const existing = (settings as { knobs?: unknown }).knobs;
      const isPlainObject =
        existing !== null &&
        typeof existing === 'object' &&
        !Array.isArray(existing);
      if (!isPlainObject) {
        (settings as { knobs?: unknown }).knobs = {};
      }
    }
    return out;
  },
  // 36 → 37: Knob-registry Phase 3a — motivating-scalar promotions.
  // Two halves:
  //
  //  (1) Lift two new leaves that were previously hardcoded inline:
  //      - `profile.settings.appearance.ownershipOpacityCeiling`
  //        (default 0.55, matches the prior BoardWidget.vue literal)
  //      - `profile.settings.engine.katago.watchdogAnimationMs`
  //        (default 500, matches the prior Toolbar.vue keyframe).
  //
  //  (2) Seed four KnobDecls into `profile.settings.knobs` pointing
  //      at the lifted leaves plus two existing leaves already on
  //      the profile (`appearance.intensityHueShift` and
  //      `session.ui.moveFilterThreshold`):
  //      - 'display.ownership-opacity-ceiling'
  //      - 'display.move-filter-threshold'
  //      - 'display.hue-offset'
  //      - 'engine.watchdog-animation-ms'
  //
  // Decl shapes mirror the fresh-install seed in `store/defaults.ts`
  // verbatim. Each KnobDecl seed is idempotent — a pre-existing
  // entry under the same key is preserved unchanged (the user may
  // have edited it through a future editor surface).
  //
  // See `docs/notes/knob-registry-plan.md` §11 Phase 3 for the
  // promotion rationale; `BoardWidget.vue::ownershipColor` and
  // `Toolbar.vue::.watchdog-pinging` are the corresponding consumer
  // retargets in the same PR.
  (blob: any) => {
    const out = structuredClone(blob);
    const settings = out.profile?.settings;
    if (settings && typeof settings === 'object') {
      // 1a. Ownership opacity ceiling.
      const appearance = (settings as { appearance?: unknown }).appearance;
      if (appearance && typeof appearance === 'object') {
        if (typeof (appearance as { ownershipOpacityCeiling?: unknown }).ownershipOpacityCeiling !== 'number') {
          (appearance as { ownershipOpacityCeiling?: unknown }).ownershipOpacityCeiling = 0.55;
        }
      }
      // 1b. Watchdog animation duration (ms).
      const katago = (settings as { engine?: { katago?: unknown } }).engine?.katago;
      if (katago && typeof katago === 'object') {
        if (typeof (katago as { watchdogAnimationMs?: unknown }).watchdogAnimationMs !== 'number') {
          (katago as { watchdogAnimationMs?: unknown }).watchdogAnimationMs = 500;
        }
      }
      // 2. KnobDecl seeds. `knobs` is `{}` after the 35 → 36
      //    migration; idempotent on a partially-populated map.
      const knobs = (settings as { knobs?: unknown }).knobs;
      if (knobs && typeof knobs === 'object' && !Array.isArray(knobs)) {
        const seeds: Record<string, unknown> = {
          'display.ownership-opacity-ceiling': {
            id: 'display.ownership-opacity-ceiling',
            label: 'Ownership overlay opacity',
            domain: 'display',
            inputs: [{ range: [0, 1] }],
            outputs: [{ path: 'profile.settings.appearance.ownershipOpacityCeiling' }],
          },
          'display.move-filter-threshold': {
            id: 'display.move-filter-threshold',
            label: 'Move-suggestion filter threshold',
            domain: 'display',
            inputs: [{ range: [0, 1] }],
            outputs: [{ path: 'session.ui.moveFilterThreshold' }],
          },
          'display.hue-offset': {
            id: 'display.hue-offset',
            label: 'Hue offset',
            domain: 'display',
            inputs: [{ range: [-180, 180] }],
            outputs: [{ path: 'profile.settings.appearance.intensityHueShift' }],
          },
          'engine.watchdog-animation-ms': {
            id: 'engine.watchdog-animation-ms',
            label: 'Watchdog animation duration (ms)',
            domain: 'engine',
            inputs: [{ range: [50, 5000] }],
            outputs: [{ path: 'profile.settings.engine.katago.watchdogAnimationMs' }],
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
  //
  // Moved from active body to archive 2026-05-15 per the rolling-
  // archive cadence (`migrations.ts` keeps the latest two; this
  // migration was the older of two when the 42 → 43 first-report-
  // after floor migration landed).
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
  // 41 → 42: KataGo report-cadence registry promotion. Two new
  // preference-flavoured leaves under `engine.katago`, paired with
  // two new KnobDecls under the `engine` domain:
  //
  //   (1) `profile.settings.engine.katago.reportDuringSearchEvery`
  //       default 0.15 — replaces the prior hardcoded 0.15 (ponder)
  //       / 0.5 (analyze) literals in `analysis-service.ts`. Single
  //       value applies to both modes per the simplification choice
  //       recorded with the user 2026-05-15.
  //   (2) `profile.settings.engine.katago.firstReportDuringSearchAfter`
  //       default 0.05 — new wire field on `KataGoAnalysisQuery`;
  //       small default closes the perceived first-paint delay on
  //       fresh ponder / analyze queries. Bounded above by the
  //       cadence above at the registry widget level
  //       (`KnobInputDecl.maxFromKnob`) and at the wire layer
  //       (clamped in `analysis-service.ts`'s query-construction
  //       sites).
  //
  // Seeds the two KnobDecls (`engine.report-during-search-every`
  // priority 70; `engine.first-report-during-search-after`
  // priority 80) mirroring the defaults-side fresh-install seed
  // verbatim. The first-after decl's `inputs[0].maxFromKnob`
  // references the cadence knob's id; `validateRegistry` (in
  // `lib/knobs.ts`) checks the reference resolves at startup per
  // ADR-0002.
  //
  // Idempotent: each leaf-backfill preserves a pre-existing
  // number; each KnobDecl seed preserves a pre-existing entry
  // under the same key (matching the 36 → 37 motivating-scalars
  // migration's discipline so user-customised label / range edits
  // survive).
  //
  // See `analysis-service.ts::analyzeRange` and `::analyzeActiveNode`
  // for the consumer-site retargets that read these leaves and
  // apply the wire-side `min(first, cadence)` clamp; see
  // `docs/worklog/2026-05-15-katago-cadence-knobs.md` for the
  // arc record including the substrate addition of
  // `KnobInputDecl.maxFromKnob`.
  //
  // Moved from active body to archive 2026-05-15 per the rolling-
  // archive cadence (`migrations.ts` keeps the latest two; this
  // migration was the older of two when the 43 → 44 SGF-load-at-
  // last-node session-flag migration landed).
  (blob: any) => {
    const out = structuredClone(blob);
    const settings = out.profile?.settings;
    if (settings && typeof settings === 'object') {
      const katago = (settings as { engine?: { katago?: unknown } }).engine?.katago;
      if (katago && typeof katago === 'object') {
        const k = katago as {
          reportDuringSearchEvery?: unknown;
          firstReportDuringSearchAfter?: unknown;
        };
        if (typeof k.reportDuringSearchEvery !== 'number') {
          k.reportDuringSearchEvery = 0.15;
        }
        if (typeof k.firstReportDuringSearchAfter !== 'number') {
          k.firstReportDuringSearchAfter = 0.05;
        }
      }
      const knobs = (settings as { knobs?: unknown }).knobs;
      if (knobs && typeof knobs === 'object' && !Array.isArray(knobs)) {
        const seeds: Record<string, unknown> = {
          'engine.report-during-search-every': {
            id: 'engine.report-during-search-every',
            label: 'Report cadence (s)',
            domain: 'engine',
            inputs: [{ range: [0.01, 4.0] }],
            outputs: [{ path: 'profile.settings.engine.katago.reportDuringSearchEvery' }],
            priority: 70,
          },
          'engine.first-report-during-search-after': {
            id: 'engine.first-report-during-search-after',
            label: 'First report after (s)',
            domain: 'engine',
            inputs: [{
              range: [0.01, 4.0],
              maxFromKnob: 'engine.report-during-search-every',
            }],
            outputs: [{ path: 'profile.settings.engine.katago.firstReportDuringSearchAfter' }],
            priority: 80,
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
  // 42 → 43: KataGo first-report-after upstream-cliff floor. Adds
  // `inputs[0].minFloor = 0.035` to the persisted
  // `engine.first-report-during-search-after` KnobDecl so existing
  // users' slider widget enforces the floor exactly as fresh
  // installs do. Companion to the wire-side clamp in
  // `services/analysis-service.ts` that reads
  // `KATAGO_FIRST_REPORT_FLOOR_S` from `engine/katago/limits.ts`.
  //
  // The floor is the empirically-characterised SPA-side workaround
  // for an upstream KataGo cliff at ~25 ms — KataGo silently
  // substitutes the cadence value for sub-floor first-report
  // timings. Diagnosis arc and reproducers are staged at
  // `~/katago_bugreport`; the umbrella worklog at
  // `docs/worklog/2026-05-15-katago-first-report-cliff-diagnosis.md`
  // names the upstream-bug filing trigger that would let this
  // floor (and this migration's annotation) retire.
  //
  // Idempotent: a decl whose `inputs[0].minFloor` is already a
  // finite number is preserved unchanged (a user-tuned value, or
  // a forward-compat install where this migration has already
  // run). A decl whose `inputs[0]` shape doesn't match what the
  // cadence-knobs migration seeded is left alone — defensive
  // against hand-edited blobs.
  //
  // Hardcodes 0.035 (the value of `KATAGO_FIRST_REPORT_FLOOR_S`
  // at the time of authoring) rather than importing the
  // constant, per migrations.ts's append-only invariant: a
  // shipped migration's behaviour is frozen, and importing a
  // mutable constant would let a future change silently retroactively
  // alter what blobs in the wild were migrated to.
  //
  // Moved from active body to archive 2026-05-17 per the rolling-
  // archive cadence (`migrations.ts` keeps the latest two; this
  // migration was the older of two when the 44 → 45 cardTreeNav
  // session-flag migration landed).
  (blob: any) => {
    const out = structuredClone(blob);
    const knobs = out.profile?.settings?.knobs;
    if (knobs && typeof knobs === 'object' && !Array.isArray(knobs)) {
      const decl = (knobs as Record<string, unknown>)['engine.first-report-during-search-after'];
      if (decl && typeof decl === 'object') {
        const inputs = (decl as { inputs?: unknown }).inputs;
        if (Array.isArray(inputs) && inputs.length > 0) {
          const first = inputs[0];
          if (first && typeof first === 'object') {
            const f = (first as { minFloor?: unknown }).minFloor;
            if (typeof f !== 'number' || !Number.isFinite(f)) {
              (first as { minFloor?: unknown }).minFloor = 0.035;
            }
          }
        }
      }
    }
    return out;
  },
  // 43 → 44: backfill `session.ui.loadSgfAtLastNode` (boolean,
  // default false). The flag opts the user into a post-load walk
  // to the active variation's leaf in `useSgfLoader.loadFile` —
  // SGF file uploads land on the final mainline position instead
  // of the root. Defaults to false on existing blobs to preserve
  // the historical "land on root after SGF upload" behaviour.
  //
  // Idempotent: a pre-existing boolean is preserved unchanged (a
  // user who toggled the setting via the Settings registry and
  // then somehow ran a hand-edited blob through this migration
  // keeps their choice).
  (blob: any) => {
    const out = structuredClone(blob);
    const ui = out.session?.ui;
    if (ui && typeof ui === 'object') {
      const u = ui as { loadSgfAtLastNode?: unknown };
      if (typeof u.loadSgfAtLastNode !== 'boolean') {
        u.loadSgfAtLastNode = false;
      }
    }
    return out;
  },
  // 44 → 45: backfill `session.ui.cardTreeNav` (Partial<Record<BoardId,
  // CardTreeNavState>>, default {}). The field persists the
  // `CardTreeWidget`'s manual-expand axis per board so a board re-
  // opened mid-session (or after a browser reload) restores the
  // user's exploration path through the card forest. Item 1 of the
  // post-v1.1.0 follow-up list — previously the expand state lived
  // in a per-mount `ref<Set<string>>` and was lost on every
  // navigation.
  //
  // Idempotent: a pre-existing plain-object value is preserved
  // unchanged (so users who already have entries from a hand-edited
  // blob or a prior forward-compat install keep them). A
  // non-object / null / array value is replaced with `{}` — the
  // shape contract is strict.
  (blob: any) => {
    const out = structuredClone(blob);
    const ui = out.session?.ui;
    if (ui && typeof ui === 'object') {
      const u = ui as { cardTreeNav?: unknown };
      const cur = u.cardTreeNav;
      const isPlainObject =
        cur !== null && cur !== undefined &&
        typeof cur === 'object' && !Array.isArray(cur);
      if (!isPlainObject) {
        u.cardTreeNav = {};
      }
    }
    return out;
  },
];
