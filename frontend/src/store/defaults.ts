/**
 * src/store/defaults.ts
 * Pure constants — no Vue imports, no reactive state.
 */

import type { AppSettings, ProfileState, UISession, ProfileId, ThumbnailSettings, CardSet } from '../types';
import { detectBrowserLocale } from '../i18n/locales';

export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export const defaultSettings = {
  engine: {
    katago: {
      url: 'ws://127.0.0.1:41948',
      // Proxy replay-cache flags. All three default `false` — preserves
      // the pre-surfacing behaviour where the analyze* call sites either
      // hard-coded these (`analyzeRange`'s `cache: false, lookup_cache:
      // false`) or left them absent entirely (the proxy reads absent
      // boolean fields as `false` per its wire-default).
      // `replay_final_only` was never set explicitly anywhere; absent →
      // wire-default `false` produced full-stream replay. Wire-protocol
      // semantics documented on `KataGoAnalysisQuery` in
      // `engine/katago/types.ts`; the user toggles all three via the
      // registry editor under engine → katago.
      cache: false,
      lookup_cache: false,
      replay_final_only: false,
      // See AppSettings.engine.katago.analysisStorageEnabled for the
      // motivation. Default `true` — fresh installs surface the
      // experimental persistence panel (with its experimental tag
      // and inline tooltip) so testers find it. Users can hide the
      // panel via the registry editor; the save action is manual
      // regardless of this toggle.
      analysisStorageEnabled: true,
      // Wire-request gate for the `transposition` capability under
      // the proxy v1.0.14+ capability-negotiation contract. Default
      // `true` preserves the pre-v1.0.14 behaviour where the proxy's
      // `transposition_enricher` Transformer was unconditionally
      // engaged when wired; users who want to skip the Python↔C++
      // boundary cost can flip via the registry editor. Independent
      // of `session.ui.showTranspositionRings` (the rendering toggle)
      // — see `AppSettings.engine.katago.useTransposition` in
      // `types.ts` for the separation-of-concerns rationale and the
      // ADR-0002 surfacing path when the toggle is on but the proxy
      // doesn't advertise the capability.
      useTransposition: true,
      // User-controlled opt-in for adaptive_reevaluate (proxy
      // v1.0.14+ capability). Default off: adaptive's deeper-
      // analysis follow-ups change the visit count of resulting
      // packets, which is a surprise unless explicitly opted into.
      // worstQuantile defaults to 0.05 (more conservative than the
      // proxy's 0.25); extraVisits defaults to 800 (matches proxy
      // default, increment-not-absolute). Surfaced in the analysis
      // tab as a checkbox + two number inputs when the proxy
      // advertises the capability. See
      // `AppSettings.engine.katago.adaptiveReevaluate` in `types.ts`
      // for the full rationale.
      adaptiveReevaluate: {
        enabled: false,
        worstQuantile: 0.05,
        extraVisits: 800,
      },
      // Practical ceiling on ponder mode's maxVisits. The pre-v1.0.20
      // hardcoded ceiling of 100,000 was hit in seconds on weak
      // networks / CPU-only setups; 2,000,000 is the new default and
      // is user-tunable. See `AppSettings.engine.katago.ponderMaxVisits`
      // in `types.ts` for the three consumer sites and the v1.0.20
      // surfacing rationale.
      ponderMaxVisits: 2_000_000,
      // Engine-side runtime overrides forwarded as KataGo's
      // `overrideSettings` field on every analysis query. The seed
      // values are a sensible default analysis posture for the SR
      // study workflow:
      //   `reportAnalysisWinratesAs: 'WHITE'` — the seeded default,
      //     but no longer load-bearing for raw-packet correctness:
      //     `engine/katago/winrate-framing.ts` normalises every
      //     received packet to canonical 'WHITE' framing before the
      //     ledger.record path, so the analysis-projection
      //     consumers (liveness overlay, score series, ownership
      //     renderer) get consistent sign conventions regardless of
      //     what the user picks here. The residual concern is
      //     proxy-side palette enrichment: `extra.*` values are
      //     computed on the proxy in the wire's framing before
      //     normalisation, so user-authored state_fns reading
      //     `winrate` / `score_lead` against the raw packet produce
      //     output in the wire's framing. The registry dropdown
      //     lists all three accepted values per the `WinrateFraming`
      //     union; 'WHITE' is the configuration that's consistent
      //     end-to-end without bespoke state_fn authoring. Tracked
      //     in `docs/handoff-current.md`'s "Known gaps (frontend)";
      //   `rootNumSymmetriesToSample: 8` — average across all eight
      //     board symmetries at the root for a more stable
      //     evaluation than the single-symmetry default;
      //   `wideRootNoise: 0.02` — small Dirichlet noise at the root
      //     to surface plausible alternatives the policy head would
      //     otherwise prune.
      // Snake-case is NOT applied here; KataGo's wire vocabulary
      // for these fields is camelCase. The registry editor renders
      // this as a dynamic node (add / remove keys), so users can
      // extend with `rootPolicyTemperature`, `analysisPVLen`, etc.
      // without source edits. Wire-shape semantics documented on
      // `KataGoAnalysisQuery.overrideSettings` in
      // `engine/katago/types.ts`; the typed enum for the
      // `reportAnalysisWinratesAs` value is `WinrateFraming` in
      // the same file.
      overrideSettings: {
        reportAnalysisWinratesAs: 'WHITE',
        rootNumSymmetriesToSample: 8,
        wideRootNoise: 0.02,
      },
      analysis_env: {
        // Symbol library per docs/dispatch/frontend-to-frontend-default-palette-metrics-spec.md.
        // Two semantic axes coexist:
        //  - Robust-child alignment (`visit_ratio`, `quality_delta`,
        //    `decisiveness`) uses `_maxvisits(x)` — heuristic-oblivious,
        //    independent of KataGo's `playSelectionValue` ranking.
        //  - Engine-recommendation alignment (`*_loss_topvsuser`,
        //    `user_order`, `policy_loss`, `rank_quality`) uses
        //    `moveInfos[0]` — the move KataGo would actually play.
        // Both are useful; both ship.
        symbols: {
          // Universal helpers (kept from prior seed for compat;
          // unnormalised primitive — `complexity` is the normalised
          // form recommended for state_fns).
          visit_entropy:    'safe(entropy([mi["visits"] for mi in x["moveInfos"]]))',

          // State-context helpers (single packet).
          decisiveness:     '_maxvisits(x) / x["rootInfo"]["visits"]',
          complexity:       'safe(_visit_entropy(x) / _uniform_entropy(len(x["moveInfos"])))',
          winrate:          'x["rootInfo"]["winrate"]',
          score_lead:       'x["rootInfo"]["scoreLead"]',
          score_volatility: 'x["rootInfo"]["scoreStdev"]',
          nn_uncertainty:   'x["rootInfo"]["rawStWrError"]',
          // SIDETOMOVE-perspective sign factor: +1 when the side to
          // move at this packet is Black, -1 when White. Multiply
          // a SIDETOMOVE-framed quantity by this to normalise to a
          // black-perspective sign.
          player_sign:      '1.0 if x["rootInfo"]["currentPlayer"] == "B" else -1.0',

          // Window-context helpers (windowed pair).
          // Heuristic-oblivious: denominator is `_maxvisits(x[0])`,
          // not `moveInfos[0]["visits"]`.
          visit_ratio:      '_uservisits(x[0]) / _maxvisits(x[0])',
          quality_delta:    'visit_ratio(x) ** (decisiveness(x[0]) ** alpha)',
          scoreLead_delta:  'x[1]["rootInfo"]["scoreLead"] - x[0]["rootInfo"]["scoreLead"]',
          winrate_loss_topvsuser:
            '(x[0]["moveInfos"][0]["winrate"] - x[0]["userMoveInfo"]["winrate"]) if x[0]["userMoveInfo"] else 0',
          scoreLead_loss_topvsuser:
            'player_sign(x[0]) * ((x[0]["rootInfo"]["scoreLead"] - x[0]["userMoveInfo"]["scoreLead"]) if x[0]["userMoveInfo"] else 0)',
          // magic-literal: 999 user_order fallback — the convention for
          // "treat missing userMove as worst-rank" in the palette stdlib's
          // ordering expressions. Used twice (here and in rank_quality
          // below); both are inside the proxy's curated palette stdlib
          // expressions and aren't substrate candidates. Distinct from
          // the engine's actual rank values (typically 0 to ~50).
          user_order:       'x[0]["userMoveInfo"]["order"] if x[0]["userMoveInfo"] else 999',
          policy_loss:      'x[0]["moveInfos"][0]["prior"] - (x[0]["userMoveInfo"]["prior"] if x[0]["userMoveInfo"] else 0)',
          risk_adjusted_score_loss:
            'safe((x[0]["moveInfos"][0]["scoreLead"] - (x[0]["userMoveInfo"]["scoreLead"] if x[0]["userMoveInfo"] else x[0]["moveInfos"][0]["scoreLead"])) / x[0]["rootInfo"]["scoreStdev"])',
          // magic-literal: 999 same as user_order above — paired fallback
          // for the rank_quality formula.
          rank_quality:     '1.0 / (1 + (x[0]["userMoveInfo"]["order"] if x[0]["userMoveInfo"] else 999))',

          // Summary functions.
          //
          // ─── Bit-equivalence contract (proxy v1.0.3 curation) ───────────────
          // Bodies use the curated stdlib names (`min`, `mean`, …) rather
          // than `np.<fn>(...)` — see `proxy/reginterp.py`'s
          // `_CURATED_SYMTABLE`, the authoritative list. The wrappers are
          // drop-in for `np.<fn>` in the kwarg-free positional case (the
          // case the bodies below satisfy): `min(x) ≡ np.min(x)`,
          // `mean(x) ≡ np.mean(x)` exactly. Pre-v1.0.3 versions of these
          // bodies referenced `np.min`/`np.mean`; the migration at
          // `store/migrations.ts` (11 → 12) rewrites persisted state in
          // place via `engine/analysis-config-curation.ts`. Asymmetries
          // worth knowing about for any future bespoke body: `clip`
          // rejects array-shaped scalar bounds where `np.clip` permits
          // them; see the rewriter's docstring for the full list.
          // ─────────────────────────────────────────────────────────────────────
          min_summary:      'float(min(x))',
          mean_summary:     'float(mean(x))',
        },
        parameters: {
          alpha: 0.25,
        },
        parameter_meta: {},
        palettes: [
          // 'default' kept for compat with users who customised this
          // palette away from the broken seed. The composition is
          // restored to a working shape (the renamed `decisiveness`
          // smoother, heuristic-oblivious `visit_ratio`).
          {
            id: 'default',
            name: 'Standard Evaluation',
            delta_fn: 'quality_delta',
            summary_fn: 'min_summary',
            state_fns: {
              'Complexity':      'complexity',
              'Win Probability': 'winrate',
              'Score Advantage': 'score_lead',
            }
          },
          // Palette A — visit-share-aligned default. Emphasises user's
          // alignment with robust-child selection, calibrated by
          // position branching.
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
          // Palette B — points-loss alternative. Cleaner semantic
          // ("points left on the table at the pre-move position"), no
          // SIDETOMOVE perspective ambiguity. `mean_summary` is the
          // natural aggregator for a positive-only loss metric.
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
          // Palette C — most permissive. Hyperbolic in the user's
          // engine-rank: 1.0 for top, 0.5 for second, etc.
          {
            id: 'rank',
            name: 'Engine Rank',
            delta_fn: 'rank_quality',
            summary_fn: 'mean_summary',
            state_fns: {
              'Complexity':      'complexity',
              'Win Probability': 'winrate',
            }
          }
        ],
        activePaletteId: 'quality'
      },
    },
  },
  persistence: { debounceInterval: 1000 },
  // Locale: browser-detected at fresh-install time. `detectBrowserLocale`
  // walks `navigator.languages` (with the same prefix-dispatch rules
  // the schema 23 → 24 migration uses for legacy-blob backfill), so
  // new sign-ups land on the user's preferred locale rather than a
  // hardcoded 'en'. Existing users continue to hit the migration
  // path; both code paths now use the same resolver, so behaviour is
  // symmetric across new and existing users. The active value is
  // mirrored onto vue-i18n by useAppBootstrap's watch on this field.
  appearance:  { theme: 'cluster', intensityHueShift: -43, locale: detectBrowserLocale() },
  minting: {
    defaultVisits: 1000,
    defaultNumMoves: 1,
    defaultPaletteId: 'active',
    defaultGamma: 0.9,
  },
  navigation: {
    actionOnDirtyBoard: 'ask', // 'ask', 'new', or 'overwrite'
  }
} as const;

export const defaultThumbnailSettings: ThumbnailSettings = {
  showOnHover: true,
  sizePx: 120,
};

export const defaultCardSets: Record<string, CardSet> = {
  'default': {
    id: 'default',
    name: 'Standard',
    description: 'Breadth-first pool, sorted by spaced-repetition recall probability.',
    pipeline: [
      {
        stage: "select",
        selection: { type: "DescendantSelection" },
        ordering:  { type: "bfs_order" }
      },
      { stage: "take", n: 50 },
      { stage: "order", ordering: { type: "EbisuRecallKey" } },
      { stage: "take", n: { $param: 'deck_size' } },
      { stage: "shuffle" }
    ],
    hyperparameters: [
      { name: 'deck_size', type: 'number', default: 10, range: [1, 500], label: 'Deck size' }
    ]
  },
  'fringe_first': {
    id: 'fringe_first',
    name: 'Fringe First (Bottom-Up)',
    description: 'Learn deep leaves before shallow parent nodes.',
    pipeline: [
      {
        stage: "select",
        selection: { type: "SubtreeSelection", n: 0 },
        ordering:  { type: "fringe_first" }
      },
      { stage: "take", n: { $param: 'deck_size' } },
      { stage: "shuffle" }
    ],
    hyperparameters: [
      { name: 'deck_size', type: 'number', default: 20, range: [1, 500], label: 'Deck size' }
    ]
  },
  'centroid_coverage': {
    id: 'centroid_coverage',
    name: 'Centroid Coverage',
    description: 'Balanced subtree coverage via centroid decomposition — each card is a structurally informative sample of the tree (deep nodes and shallow nodes both surface). Pure structural; no SR weighting. Good for getting acquainted with a new game where the SR scheduler hasn\'t yet learned what to prioritize.',
    pipeline: [
      {
        stage: "select",
        selection: { type: "SubtreeSelection", n: 0 },
        ordering:  { type: "centroid_order" }
      },
      { stage: "take", n: { $param: 'deck_size' } },
      { stage: "shuffle" }
    ],
    hyperparameters: [
      { name: 'deck_size', type: 'number', default: 20, range: [1, 500], label: 'Deck size' }
    ]
  },
  'main_line_first': {
    id: 'main_line_first',
    name: 'Main Line First',
    description: 'Heavy-path DFS — principal variation before sidelines, with least-reviewed lines as tiebreak. No final shuffle, so the deck plays in narrative order: study the game as a game, not as scattered flashcards.',
    pipeline: [
      {
        stage: "select",
        selection: { type: "SubtreeSelection", n: 0 },
        ordering:  { type: "main_line_first" }
      },
      { stage: "take", n: { $param: 'deck_size' } }
    ],
    hyperparameters: [
      { name: 'deck_size', type: 'number', default: 20, range: [1, 500], label: 'Deck size' }
    ]
  },
  'balanced_overdue': {
    id: 'balanced_overdue',
    name: 'Balanced Overdue',
    description: 'Pool by centroid coverage (structurally balanced sample of the tree), then filter to the most overdue. Distinct from Standard, which BFS-pools (shallow bias) before Ebisu — this gives exposure to deep parts of the tree where SR has flagged attention needed, instead of repeatedly drilling the opening.',
    pipeline: [
      {
        stage: "select",
        selection: { type: "SubtreeSelection", n: 0 },
        ordering:  { type: "centroid_order" }
      },
      { stage: "take", n: { $param: 'pool_size' } },
      { stage: "order", ordering: { type: "EbisuRecallKey" } },
      { stage: "take", n: { $param: 'deck_size' } },
      { stage: "shuffle" }
    ],
    hyperparameters: [
      { name: 'pool_size', type: 'number', default: 30, range: [1, 500], label: 'Coverage pool size' },
      { name: 'deck_size', type: 'number', default: 10, range: [1, 500], label: 'Deck size' }
    ]
  }
};

export const defaultProfile: ProfileState = {
  id: NIL_UUID as ProfileId,
  username: 'Guest',
  settings: defaultSettings as unknown as AppSettings,
  thumbnailSettings: defaultThumbnailSettings,
  cardSets: defaultCardSets,
  knownTags: ['$mistake', '$opening', '$joseki', '$life_and_death'],
  qeuboPinnedBookmarks: [],
};

export const defaultSessionUI: UISession = {
  activeTab: 'cards',
  sidebarExpanded: true,
  treeExpanded: true,
  controlsExpanded: true,
  boardExpanded: true,
  // System-log bar default-hidden — it's a debugging surface, and
  // its 30px vertical footprint eats space the analysis dashboard
  // would rather have. Users can re-enable via the Session (UI)
  // registry.
  systemLogExpanded: false,
  controlPanelWidth: 340,
  moveFilterThreshold: 0.05,
  moveFilterExpression: 'move.order === 0 || (move.visits / root.visits) >= ui.threshold',
  analysisLayout: 'horizontal',
  showMoveSuggestions: true,
  showStoneMoveNumbers: false,
  // PV-preview animation defaults — kept in lockstep with
  // `composables/use-pv-animation.ts::PV_DEFAULTS` and the migration
  // 9→10 backfill. Three sources of truth that must agree.
  pvAnimation: {
    mode: 'instant',
    stepDelayMs: 350,
    windowDurationMs: 600,
    fadeDurationMs: 0,
    cycle: false,
    pvOpacity: 1,
    annotation: 'from1',
  },
  overlayLayers: {
    ownership: {
      continuous: false,
      dots: false,
      liveness: false,
    },
  },
  activeCardSetId: 'default',
  // Single ephemeral deck context. Default `[3]` matches the prior
  // hardcoded behaviour against the sample database. Schema-version
  // 16 collapsed the prior per-tab `srContextIds` / `databaseContextIds`
  // into this single field as part of the cards-tab-merge arc; the
  // migration seeds from `databaseContextIds` (preferred) → `srContextIds`
  // → `[3]` so existing users land on whichever value they were last
  // editing.
  cardsContextIds: [3],
  qeuboToolbarView: 'applied',
  // Board-variations overlay rendering posture. Default 'circles' is
  // the common GUI default per the user's framing (Lizzie / Sabaki /
  // KaTrain idiom): variations as stroke-only colored rings (so they
  // overlay cleanly with MoveSuggestions' filled discs and stay
  // visually distinguishable). Users wanting the SGF-style A/B/C
  // labelling switch to 'letters'; users who want the board
  // unannotated switch to 'off'. Schema-version 18 introduces the
  // field with this default.
  boardVariations: 'circles',
  // Hint marker for the next move on the active path. Default true
  // (common GUI posture). Schema-version 19 introduces the field;
  // independent of boardVariations.
  showActiveNextMove: true,
  // Transposition cluster rings on MoveSuggestions. Default true
  // preserves pre-feature behaviour (the cluster ring rendered
  // unconditionally before this field landed). Schema-version 20
  // introduces the field.
  showTranspositionRings: true,
  // Schema-version 34 introduces the watchdog-dot colour-transition
  // toggle (see AppSettings.session.ui.watchdogColorTransition's
  // doc comment in `types.ts`). Default true: the smooth fade
  // reads as less startling than the instant flip when the proxy
  // briefly lags `query_version` during concurrent analyses.
  watchdogColorTransition: true,
  // Forest Directory navigator: empty expansion + null selection
  // means a fresh user lands on a fully-collapsed tree until they
  // click. Schema-version 21 introduces the field; the migration
  // backfills existing blobs with the same empty defaults.
  forestNav: {
    expanded: [],
    selection: null,
  },
};

export const DEFAULTS = {
  profile: defaultSettings,
  session: defaultSessionUI,
} as const;
