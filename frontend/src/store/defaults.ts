/**
 * src/store/defaults.ts
 * Pure constants — no Vue imports, no reactive state.
 */

import type { AppSettings, ProfileState, UISession, ProfileId, ThumbnailSettings, CardSet } from '../types';

export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export const defaultSettings = {
  engine: {
    katago: {
      url: 'ws://127.0.0.1:8765/katago',
      analysis_env: {
        symbols: {
          visit_entropy: 'safe(entropy([mi["visits"] for mi in x["moveInfos"]]))',
          winrate:       'x["rootInfo"]["winrate"]',
          score_lead:    'x["rootInfo"]["scoreLead"]',
          visit_ratio:   'uservisits(x[0]) / x[0]["rootInfo"]["visits"]',
          spread:        'x[0]["moveInfos"][0]["visits"] / x[0]["rootInfo"]["visits"]',
          quality_delta: 'visit_ratio(x)**(spread(x)**alpha)',
          min_summary:   'float(np.min(x))',
        },
        parameters: {
          alpha: 0.25,
        },
        palettes: [
          {
            id: 'default',
            name: 'Standard Evaluation',
            delta_fn: 'quality_delta',
            summary_fn: 'min_summary',
            state_fns: {
              'Complexity':      'visit_entropy',
              'Win Probability': 'winrate',
              'Score Advantage': 'score_lead',
            }
          }
        ],
        activePaletteId: 'default'
      },
    },
  },
  persistence: { debounceInterval: 1000 },
  appearance:  { theme: 'dark', intensityHueShift: -43 },
  minting: {
    defaultVisits: 1000,
    defaultNumMoves: 1,
    defaultPaletteId: 'active',
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
    contextIds: [3], 
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
    contextIds: [3],
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
};

export const defaultSessionUI: UISession = {
  activeTab: 'sr',
  sidebarExpanded: true,
  treeExpanded: true,
  controlsExpanded: true,
  boardExpanded: true,
  // Persistent system-log bar visible by default. Users can uncheck
  // this box in the Session (UI) registry to hide the bar.
  systemLogExpanded: true,
  controlPanelWidth: 340,
  moveFilterThreshold: 0.05,
  moveFilterExpression: 'move.order === 0 || (move.visits / root.visits) >= ui.threshold',
  analysisLayout: 'horizontal',
  showMoveSuggestions: true,
  overlayLayers: {
    ownership: {
      continuous: false,
      dots: false,
      liveness: false,
    },
  },
  activeCardSetId: 'default',
};

export const DEFAULTS = {
  profile: defaultSettings,
  session: defaultSessionUI,
} as const;
