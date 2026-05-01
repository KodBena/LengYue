/**
 * src/store/archived-migrations.ts
 * Pre-v1.0.0 schemaVersion migrations, lifted out of `migrations.ts` to
 * keep the active maintenance file scoped to recent work.
 *
 * Why preserved (not deleted): the migration framework's `migrate()`
 * function indexes a contiguous array — `migrations[i]` carries
 * `(i+1) → (i+2)` — and ADR-0002's fail-loudly posture leans on the
 * "any blob in the wild can deterministically migrate forward"
 * guarantee. Stubbing pre-v1 entries would break that property; lifting
 * them preserves it at the cost of one indirection. The bodies here are
 * frozen exactly as they shipped.
 *
 * License: Public Domain (The Unlicense)
 */

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
];
