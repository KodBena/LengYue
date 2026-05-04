/**
 * src/store/defaults.ts
 * Pure constants — no Vue imports, no reactive state.
 */

import type { AppSettings, ProfileState, UISession, ProfileId, ThumbnailSettings, CardSet } from '../types';

export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export const defaultSettings = {
  engine: {
    katago: {
      url: 'ws://127.0.0.1:41948',
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
  appearance:  { theme: 'dark', intensityHueShift: -43 },
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
      { stage: "take", n: 10 },
      { stage: "shuffle" }
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
      { stage: "take", n: 20 },
      { stage: "shuffle" }
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
  activeTab: 'sr',
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
  // PV-preview animation defaults — kept in lockstep with
  // `composables/use-pv-animation.ts::PV_DEFAULTS` and the migration
  // 9→10 backfill. Three sources of truth that must agree.
  pvAnimation: {
    mode: 'instant',
    stepDelayMs: 350,
    windowDurationMs: 600,
    fadeDurationMs: 150,
    cycle: false,
    pvOpacity: 1,
    annotation: 'fromCurrent',
  },
  overlayLayers: {
    ownership: {
      continuous: false,
      dots: false,
      liveness: false,
    },
  },
  activeCardSetId: 'default',
  // Per-tab deck contexts. Default to `[3]` to preserve the prior
  // hardcoded behaviour against the sample database; users edit these
  // through the SR / Database tabs directly. Schema-version 11
  // backfills these fields from any pre-existing CardSet's contextIds
  // when migrating an existing blob, so this default only applies to
  // fresh installs.
  srContextIds: [3],
  databaseContextIds: [3],
  qeuboToolbarView: 'applied',
};

export const DEFAULTS = {
  profile: defaultSettings,
  session: defaultSessionUI,
} as const;
