/**
 * tests/integration/migration-store-roundtrip.test.ts
 *
 * Composition-level invariant test for the schema-migration corpus
 * (work-status item `migration-leaf-assertion-and-composition-test`,
 * audit `docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`
 * §3.13; extends Phase 1 of
 * `docs/notes/design/migration-test-rotation-plan.md`).
 *
 * The unit suite (`tests/unit/store/migrations.test.ts`) exercises
 * migration bodies in isolation; this file exercises the COMPOSITION
 * a real hydrate/save cycle runs:
 *
 *   legacy blob → migrate() → updateFromRemote() (deepMerge into the
 *   defaults-initialised store) → buildPersistencePayload() (the
 *   exact object SyncService.sendSync PUTs)
 *
 * and compares the round-tripped payload's key set against a clean
 * `migrate()` of the same blob. The invariant the comparison pins:
 *
 *   - `cleanOnly` (keys the corpus produces that the round trip
 *     drops) must equal the small documented set — at HEAD, the
 *     drained `_pendingMigrationMessages` transient and the legacy
 *     `engine.*` subtree, which `updateFromRemote` /
 *     `buildPersistencePayload` deliberately no longer carry.
 *   - `payloadOnly` (keys the round trip carries that the clean
 *     migration never produced) must equal the pinned
 *     EXPECTED_DEFAULTS_ONLY_PATHS set below. Every entry is a key
 *     the defaults provide but no migration backfills; each is
 *     classified in the pinned list. A NEW unexplained entry here is
 *     exactly the 47 → 48 incident signature — a backfill migration
 *     that silently no-oped while the version stamp advanced — and
 *     fails this test instead of shipping.
 *
 * Known blind spot, recorded honestly: a STRIP migration that
 * silently no-ops is invisible to this comparison (the stale key
 * survives `deepMerge` on the round-trip side and the clean side
 * alike). The witnessed-container helper in `src/store/migrations.ts`
 * is the guard aimed at that half of the class.
 *
 * Array values are compared as leaf paths (no index recursion):
 * `deepMerge` replaces arrays wholesale, so the round trip cannot
 * diverge inside an array the migration corpus produced.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Service mocks (network boundaries) — same preamble as
// `store-mutators.test.ts`; importing `src/store` pulls the effectful
// service singletons, which must be faked in jsdom.
vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

vi.mock('../../src/services/analysis-persistence-service', async () => {
  const { fakeAnalysisPersistenceService } = await import('../fakes/analysis-persistence-service');
  return { analysisPersistenceService: fakeAnalysisPersistenceService };
});

vi.mock('../../src/composables/cards/useCardThumbnail', () => ({
  clearCardThumbnailCache: vi.fn(),
  getCardThumbnailSync: vi.fn(() => ''),
}));

vi.mock('../../src/composables/cards/useThumbnailCache', () => ({
  useThumbnailCache: () => ({
    warmPath: vi.fn(),
  }),
}));

// The purge surface lives in its owner module (thumbnail-render-resources);
// the store calls it during resetWorkspace / closeBoard, so keep it off the
// real Map for isolation.
vi.mock('../../src/composables/cards/thumbnail-render-resources', () => ({
  purgeBoardThumbnails: vi.fn(),
  purgeAllThumbnails: vi.fn(),
}));

vi.mock('../../src/composables/cards/board-card-trees', () => ({
  removeBoardCardTree: vi.fn(),
  clearAllBoardCardTrees: vi.fn(),
  getOrCreateBoardCardTree: vi.fn(),
  getBoardCardTree: vi.fn(() => null),
}));

import {
  migrate,
  CURRENT_SCHEMA_VERSION,
  updateFromRemote,
  buildPersistencePayload,
  resetWorkspace,
} from '../../src/store';

// ── Key-path collection ─────────────────────────────────────────────

/**
 * Collects the leaf key-paths of a plain-JSON value. Arrays and
 * primitives are leaves (see the header for why); an empty object
 * records its own path so `{}` vs absent stays distinguishable.
 */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) return [prefix];
  return keys.flatMap(k => keyPaths(record[k], prefix === '' ? k : `${prefix}.${k}`));
}

// ── Legacy fixture ──────────────────────────────────────────────────

const NIL = '00000000-0000-0000-0000-000000000000';

/**
 * A schema-1 persisted blob, realistic for the fields that existed
 * pre-framework (those pass through the walker untouched and are
 * what a real v1 user's save carried) and deliberately MINIMAL for
 * everything later: any post-v1 field must be produced by its
 * backfill migration or it lands in the diff below. Authoring rule
 * (the co-tested-fixture hazard, rotation-plan Open Question 1): do
 * NOT add a field here to make the diff smaller if that field has a
 * backfill migration — that hides exactly the no-op this test
 * exists to catch.
 *
 * Dynamic-key containers (boards, session.reviews) are empty so the
 * key-set comparison stays deterministic.
 */
function legacyV1Blob(): any {
  return {
    schemaVersion: 1,
    activeBoardIndex: 0,
    boards: [],
    profile: {
      id: NIL,
      username: 'Guest',
      settings: {
        engine: {
          katago: {
            url: 'ws://127.0.0.1:41948',
            analysis_env: {
              // The v1-era broken seed, verbatim (same literals the
              // unit suite's 6 → 7 block uses) — realistic input for
              // the repair migrations.
              symbols: {
                visit_entropy: 'safe(entropy([mi["visits"] for mi in x["moveInfos"]]))',
                visit_ratio:   'uservisits(x[0]) / x[0]["rootInfo"]["visits"]',
                spread:        'x[0]["moveInfos"][0]["visits"] / x[0]["rootInfo"]["visits"]',
                quality_delta: 'visit_ratio(x)**(spread(x)**alpha)',
                winrate:       'x["rootInfo"]["winrate"]',
                score_lead:    'x["rootInfo"]["scoreLead"]',
                min_summary:   'float(np.min(x))',
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
                  },
                },
              ],
              activePaletteId: 'default',
              parameters: {},
            },
          },
        },
        persistence: { debounceInterval: 1000 },
        appearance: { theme: 'ebisu-dark' },
        minting: {
          defaultVisits: 1000,
          defaultNumMoves: 1,
          defaultPaletteId: 'active',
        },
        navigation: { actionOnDirtyBoard: 'ask' },
      },
      thumbnailSettings: { showOnHover: true, sizePx: 120 },
      cardSets: {
        default_ebisu: {
          id: 'default_ebisu',
          name: 'Standard',
          description: 'Breadth-first pool.',
          pipeline: [],
        },
      },
    },
    session: {
      id: NIL,
      profileId: NIL,
      ui: {
        activeTab: 'sr',
        sidebarExpanded: true,
        treeExpanded: true,
        controlsExpanded: true,
        boardExpanded: true,
        systemLogExpanded: true,
        controlPanelWidth: 340,
        moveFilterThreshold: 0.05,
        moveFilterExpression: 'move.order === 0 || (move.visits / root.visits) >= ui.threshold',
        analysisLayout: 'horizontal',
        showMoveSuggestions: true,
        activeCardSetId: 'default_ebisu',
      },
      reviews: {},
    },
    engine: { activeMode: {} },
  };
}

// ── Pinned expected divergences ─────────────────────────────────────

/**
 * Keys present in the round-tripped payload but NOT in the clean
 * migration of the same blob — i.e., keys only the defaults provide.
 * Every entry is classified; an unexplained addition fails the test.
 *
 * Classes:
 *   [no-backfill] — the field shipped in `defaults.ts` without a
 *       backfill migration; persisted blobs acquire it only through
 *       `updateFromRemote`'s deepMerge against defaults. Recorded as
 *       found; whether any deserves a backfill is a maintainer call
 *       (the bump-cadence question, audit §7.5, is out of scope
 *       here).
 *   [silent-no-op] — a backfill migration EXISTED but provably
 *       no-oped: the archived 45 → 46 body walks
 *       `out.settings?.engine?.katago` and the archived 46 → 47 body
 *       walks `out.settings?.appearance` — both missing the
 *       `profile.` prefix, the same wrong-path class as the
 *       corrected 47 → 48 incident, but never themselves corrected.
 *       Surfaced by this test 2026-06-10. RESOLVED 2026-06-11 (item
 *       `archived-migration-wrong-path-corrective`): the 59 → 60
 *       migration re-applies both backfills with the correct paths via
 *       `witnessedContainer`. That shipping turned this test red — the
 *       two rows (`appearance.moveSuggestionsFadeMs`,
 *       `engine.katago.adaptiveReevaluate.valueBinding`) the clean
 *       migration now produces stopped being defaults-only — and the
 *       red was cleared by removing them from the pin below, the
 *       intended ratchet direction. No `[silent-no-op]` entries remain;
 *       the class is documented here as the closed precedent.
 */
const EXPECTED_DEFAULTS_ONLY_PATHS: string[] = [
  // [no-backfill] The 'fringe_first' deck shipped in defaults
  // without a backfill migration (21 → 22 backfilled the OTHER three
  // decks: centroid_coverage / main_line_first / balanced_overdue).
  'profile.cardSets.fringe_first.description',
  'profile.cardSets.fringe_first.hyperparameters',
  'profile.cardSets.fringe_first.id',
  'profile.cardSets.fringe_first.name',
  'profile.cardSets.fringe_first.pipeline',
  // [no-backfill] Mistake-finder threshold leaf + its KnobDecl —
  // no backfill migration exists for either.
  'profile.settings.appearance.mistakeFinderThresholdQuantile',
  'profile.settings.knobs.display.mistake-finder-threshold.domain',
  'profile.settings.knobs.display.mistake-finder-threshold.id',
  'profile.settings.knobs.display.mistake-finder-threshold.inputs',
  'profile.settings.knobs.display.mistake-finder-threshold.label',
  'profile.settings.knobs.display.mistake-finder-threshold.outputs',
  'profile.settings.knobs.display.mistake-finder-threshold.priority',
  // [no-backfill] The two animation KnobDecls the 46 → 47 body
  // deliberately declined to inject (its inline comment defers to
  // the defaults-side seed for fresh profiles); persisted blobs see
  // them only via the deepMerge against defaults.
  'profile.settings.knobs.display.move-suggestions-fade-ms.domain',
  'profile.settings.knobs.display.move-suggestions-fade-ms.id',
  'profile.settings.knobs.display.move-suggestions-fade-ms.inputs',
  'profile.settings.knobs.display.move-suggestions-fade-ms.label',
  'profile.settings.knobs.display.move-suggestions-fade-ms.outputs',
  'profile.settings.knobs.display.move-suggestions-fade-ms.priority',
  'profile.settings.knobs.display.pv-fade-ms.domain',
  'profile.settings.knobs.display.pv-fade-ms.id',
  'profile.settings.knobs.display.pv-fade-ms.inputs',
  'profile.settings.knobs.display.pv-fade-ms.label',
  'profile.settings.knobs.display.pv-fade-ms.outputs',
  'profile.settings.knobs.display.pv-fade-ms.priority',
];

/**
 * Keys the clean migration carries that the round trip drops. At
 * HEAD this must be exactly:
 *
 *   - `_pendingMigrationMessages` — the designed transient: the
 *     11 → 12 curation migration queues SystemMessages on it (the
 *     fixture's `np.min` body triggers one) and `updateFromRemote`
 *     drains and deletes it post-apply.
 *   - the legacy `engine.*` subtree — `updateFromRemote` applies
 *     only boards / activeBoardIndex / profile / session, and
 *     `buildPersistencePayload` does not serialise `store.engine`;
 *     engine state is runtime-only at HEAD (old blobs carried it,
 *     which is why the 24 → 25 migration still re-keys it).
 */
const EXPECTED_DROPPED_BY_ROUNDTRIP: string[] = [
  '_pendingMigrationMessages',
  'engine.activeMode',
];

// ── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  // Installs structuredClone'd defaults so deepMerge runs against a
  // pristine, per-test store (and the shared module-level default
  // objects are never the merge target).
  resetWorkspace();
});

describe('migration corpus ∘ updateFromRemote ∘ buildPersistencePayload', () => {
  it('stamps the saved payload at CURRENT_SCHEMA_VERSION', () => {
    updateFromRemote(legacyV1Blob());
    const payload = buildPersistencePayload();
    expect(payload.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('round-trips a legacy blob with no unexplained key drift vs a clean migration', () => {
    const clean = migrate(legacyV1Blob());

    updateFromRemote(legacyV1Blob());
    const payload = buildPersistencePayload();

    const cleanPaths = new Set(keyPaths(clean));
    const payloadPaths = new Set(keyPaths(payload));

    const payloadOnly = [...payloadPaths].filter(p => !cleanPaths.has(p)).sort();
    const cleanOnly = [...cleanPaths].filter(p => !payloadPaths.has(p)).sort();

    expect(cleanOnly).toEqual([...EXPECTED_DROPPED_BY_ROUNDTRIP].sort());
    expect(payloadOnly).toEqual([...EXPECTED_DEFAULTS_ONLY_PATHS].sort());
  });
});
