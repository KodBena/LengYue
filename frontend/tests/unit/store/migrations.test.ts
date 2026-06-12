/**
 * tests/unit/store/migrations.test.ts
 *
 * Tier-1 (pure-logic) tests for the schema-migration corpus —
 * `src/store/migrations.ts` and `src/store/archived-migrations.ts`.
 * The corpus is the contract with the persisted-blob population in
 * the wild: a buggy migration's symptom shows up at hydrate time, not
 * at the moment the buggy code shipped. ADR-0002's fail-loudly posture
 * applies with special force — these tests are the artifact that
 * catches the bug *before* the symptom propagates forward in time.
 *
 * Phase 1 of `docs/notes/design/migration-test-rotation-plan.md`
 * (extended 2026-06-10 per work-status item
 * `migration-leaf-assertion-and-composition-test`, audit §3.13):
 *
 *   (a) Array-length invariant: `migrations.length` equals
 *       `CURRENT_SCHEMA_VERSION - 1`, catching "rotation accidentally
 *       deleted or duplicated a migration."
 *   (b) End-to-end walk: ancient (schema-1) fixture blobs through
 *       `migrate()`, asserting the final shape is a valid
 *       `CURRENT_SCHEMA_VERSION` blob.
 *   (c) Per-migration round-trip fixtures for the COVERED steps —
 *       exercising happy path + idempotency + the fallback paths the
 *       source comments name. Coverage is NOT one block per
 *       migration: the `describe` blocks below are the authoritative
 *       list, and there is one known historical gap — steps 44 → 45
 *       through 55 → 56 shipped during the rolling-archive cycle
 *       without per-step fixtures and have none here (a fixed,
 *       archived range; the prior header's "one describe block per
 *       migration" claim was stale over it). Coverage for that range
 *       is structural only: the invariants and end-to-end walk in
 *       this file, plus the store-round-trip composition test in
 *       `tests/integration/migration-store-roundtrip.test.ts`, which
 *       pins the key-set the full corpus produces against the save
 *       path (and is where a silent backfill no-op in that range
 *       surfaces).
 *   (d) Framework guards: the `witnessedContainer` leaf-assertion
 *       helper's witness/blob-leg contract (see its docstring in
 *       `src/store/migrations.ts`).
 *
 * No DOM, no fakes, no Vue reactivity — pure JS objects through
 * pure functions through assertions.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  migrations,
  migrate,
  witnessedContainer,
} from '../../../src/store/migrations';
import type { Migration } from '../../../src/store/archived-migrations';

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Returns the migration that brings a blob from `fromVersion` to
 * `fromVersion + 1`. Mirrors the `migrate()` walker's indexing
 * (`migrations[version - 1]`) so each test names the step
 * authoritatively: `step(7)(blob)` runs the `7 → 8` migration.
 */
function step(fromVersion: number): Migration {
  const m = migrations[fromVersion - 1];
  if (typeof m !== 'function') {
    throw new Error(
      `No migration registered at index ${fromVersion - 1} ` +
      `(step ${fromVersion} → ${fromVersion + 1}).`,
    );
  }
  return m;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Minimal v1 blob with every container the migrations touch present
 * and empty. Tests that need to walk the full ledger from v1 build
 * on this and assert that the result still type-checks against the
 * v-current shape.
 */
function ancientMinimalBlob(): any {
  return {
    schemaVersion: 1,
    boards: [],
    profile: {
      settings: {
        appearance: {},
        engine: {
          katago: {
            analysis_env: {
              symbols: {},
              palettes: [],
              parameters: {},
            },
          },
        },
        minting: {},
      },
      cardSets: {},
    },
    session: {
      ui: {},
      reviews: {},
    },
    engine: {
      activeMode: {},
    },
  };
}

// ── Invariants ──────────────────────────────────────────────────────

describe('migrations array — invariants', () => {
  it('contains exactly CURRENT_SCHEMA_VERSION - 1 entries', () => {
    // Catches "rotation accidentally deleted or duplicated a
    // migration" without needing per-step fixtures for the case to
    // surface. The `migrate()` walker indexes `migrations[i]` for
    // step `(i+1) → (i+2)`; the array must therefore carry one entry
    // per version step from 1 to CURRENT_SCHEMA_VERSION.
    expect(migrations.length).toBe(CURRENT_SCHEMA_VERSION - 1);
  });

  it('every entry is a function', () => {
    for (let i = 0; i < migrations.length; i++) {
      expect(typeof migrations[i]).toBe('function');
    }
  });
});

// ── Framework: witnessedContainer (leaf-assertion helper) ───────────

describe('witnessedContainer — independent-witness leaf assertion', () => {
  it('throws on a path the runtime shape does not carry (the 47 → 48 wrong-path class)', () => {
    // The exact incident shape: 'settings.knobs' instead of
    // 'profile.settings.knobs'. The blob even HAS the wrong path —
    // the witness leg must reject it regardless, because the witness
    // is the runtime shape, not the blob.
    const blob: any = { settings: { knobs: {} } };
    expect(() => witnessedContainer(blob, 'settings.knobs')).toThrow(/wrong-path class/);
  });

  it('names the failing segment in the thrown message', () => {
    expect(() => witnessedContainer({}, 'profile.settings.nonexistent.leafBlock'))
      .toThrow(/failed at segment 'nonexistent'/);
  });

  it('resolves a witnessed path present on the blob', () => {
    const blob: any = { session: { ui: { forestNav: { expanded: [], selection: null } } } };
    const nav = witnessedContainer(blob, 'session.ui.forestNav');
    expect(nav).toBe(blob.session.ui.forestNav);
  });

  it('returns undefined for a witnessed path absent from the blob (partial-blob tolerance)', () => {
    expect(witnessedContainer({}, 'session.ui.forestNav')).toBeUndefined();
    expect(witnessedContainer({ session: {} }, 'session.ui.forestNav')).toBeUndefined();
  });

  it('returns undefined when the blob carries a non-object at the witnessed path', () => {
    // Matches the inline guards the retrofit replaced: a corrupt
    // primitive where a container should be means "nothing to
    // migrate here", not a crash.
    expect(witnessedContainer({ profile: 'corrupt' }, 'profile')).toBeUndefined();
    expect(
      witnessedContainer({ session: { ui: { forestNav: 42 } } }, 'session.ui.forestNav'),
    ).toBeUndefined();
    expect(witnessedContainer({ session: 'corrupt' }, 'session.ui.forestNav')).toBeUndefined();
  });

  it('passes arrays through (typeof object — same tolerance as the prior inline guards)', () => {
    const blob: any = { profile: [] };
    expect(witnessedContainer(blob, 'profile')).toBe(blob.profile);
  });
});

// ── End-to-end walk ─────────────────────────────────────────────────

describe('migrate() — end to end', () => {
  it('walks a minimal schema-1 blob to CURRENT_SCHEMA_VERSION and stamps it', () => {
    const out = migrate(ancientMinimalBlob());
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('treats a blob with no schemaVersion as v1 and migrates it forward', () => {
    // Per the file's "Missing schemaVersion (legacy blobs)" docstring:
    // the implicit version is 1, the marker is added on the next
    // save. Pre-framework blobs have v1's physical shape by
    // definition.
    const blob = ancientMinimalBlob();
    delete blob.schemaVersion;
    const out = migrate(blob);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('passes a blob at CURRENT_SCHEMA_VERSION through (stamping the marker)', () => {
    const blob = { schemaVersion: CURRENT_SCHEMA_VERSION, profile: {}, session: {} };
    const out = migrate(blob);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('throws on a future-version blob', () => {
    // The "rolled-back code, or schema bump that hasn't propagated"
    // failure mode. SyncService.hydrate catches; the workspace stays
    // at defaults; no saves fire.
    const blob = { schemaVersion: CURRENT_SCHEMA_VERSION + 7 };
    expect(() => migrate(blob)).toThrow(/ahead of this app/);
  });

  it('walks a realistic schema-1 blob, picking up known forward transitions', () => {
    // A blob assembled to exercise several known transitions across
    // the ledger — confirms the walker composes step outputs into
    // step inputs correctly, not just that each step works in
    // isolation.
    //
    // The seeds chosen here surface specific forward-walk outcomes:
    //   1 → 2:  ebisu-dark → dark
    //  14 → 15: dark survives (not 'light', so untouched)
    //  24 → 25: BoardId base-36 → UUID; per-board clientGameId from
    //           22 → 23 is preserved
    //  32 → 33: cardSets.default gains hyperparameters: []
    const blob = ancientMinimalBlob();
    blob.profile.settings.appearance.theme = 'ebisu-dark';
    blob.profile.cardSets.default_ebisu = {
      id: 'default_ebisu',
      name: 'Standard',
      pipeline: [],
    };
    blob.boards = [{ id: 'abc1234', state: { /* opaque */ } }];

    const out = migrate(blob);

    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.profile.settings.appearance.theme).toBe('dark');
    // 1 → 2 promotes default_ebisu to default; later migrations don't
    // touch the key.
    expect(out.profile.cardSets.default).toBeDefined();
    expect(out.profile.cardSets.default_ebisu).toBeUndefined();
    expect(out.profile.cardSets.default.id).toBe('default');
    // 24 → 25 + 26 → 27 ensure every board.id is UUID-shaped by
    // walk's end.
    expect(out.boards[0].id).toMatch(UUID_RE);
    // 22 → 23 backfills clientGameId.
    expect(out.boards[0].clientGameId).toMatch(UUID_RE);
    // 32 → 33 backfills hyperparameters on each cardSet.
    expect(out.profile.cardSets.default.hyperparameters).toEqual([]);
  });
});

// ── Per-migration: 1 → 2 ────────────────────────────────────────────

describe('1 → 2: de-brand identifiers', () => {
  it("rewrites theme 'ebisu-dark' → 'dark'", () => {
    const blob: any = { profile: { settings: { appearance: { theme: 'ebisu-dark' } } } };
    const out = step(1)(blob);
    expect(out.profile.settings.appearance.theme).toBe('dark');
  });

  it("rewrites theme 'ebisu-light' → 'light'", () => {
    const blob: any = { profile: { settings: { appearance: { theme: 'ebisu-light' } } } };
    const out = step(1)(blob);
    expect(out.profile.settings.appearance.theme).toBe('light');
  });

  it('leaves an unrelated theme value untouched', () => {
    const blob: any = { profile: { settings: { appearance: { theme: 'whatever' } } } };
    const out = step(1)(blob);
    expect(out.profile.settings.appearance.theme).toBe('whatever');
  });

  it("promotes cardSets.default_ebisu to .default and stamps the id", () => {
    const blob: any = {
      profile: {
        cardSets: {
          default_ebisu: { id: 'default_ebisu', name: 'Standard', pipeline: [] },
        },
      },
    };
    const out = step(1)(blob);
    expect(out.profile.cardSets.default).toBeDefined();
    expect(out.profile.cardSets.default.id).toBe('default');
    expect(out.profile.cardSets.default.name).toBe('Standard');
    expect(out.profile.cardSets.default_ebisu).toBeUndefined();
  });

  it('overwrites an auto-template `default` when default_ebisu is also present', () => {
    // Per the source comment: in the hybrid-state hydrate case where
    // a stale 'default' exists alongside the user's actual
    // 'default_ebisu', the migration reconciles to the new identifier
    // by overwriting the stale auto-template.
    const blob: any = {
      profile: {
        cardSets: {
          default: { id: 'default', name: 'auto-template' },
          default_ebisu: { id: 'default_ebisu', name: 'user-customised', pipeline: [] },
        },
      },
    };
    const out = step(1)(blob);
    expect(out.profile.cardSets.default.name).toBe('user-customised');
    expect(out.profile.cardSets.default_ebisu).toBeUndefined();
  });

  it("rewrites session.ui.activeCardSetId 'default_ebisu' → 'default'", () => {
    const blob: any = { session: { ui: { activeCardSetId: 'default_ebisu' } } };
    const out = step(1)(blob);
    expect(out.session.ui.activeCardSetId).toBe('default');
  });

  it("renames the ebisu_delta symbol entry to quality_delta and palette refs", () => {
    const blob: any = {
      profile: {
        settings: {
          engine: {
            katago: {
              analysis_env: {
                symbols: { ebisu_delta: 'x[0]["rootInfo"]["winrate"]' },
                palettes: [{ id: 'default', delta_fn: 'ebisu_delta' }],
              },
            },
          },
        },
      },
    };
    const out = step(1)(blob);
    const symbols = out.profile.settings.engine.katago.analysis_env.symbols;
    expect(symbols.quality_delta).toBe('x[0]["rootInfo"]["winrate"]');
    expect('ebisu_delta' in symbols).toBe(false);
    expect(out.profile.settings.engine.katago.analysis_env.palettes[0].delta_fn).toBe('quality_delta');
  });

  it('is a no-op on a blob with none of the legacy identifiers', () => {
    const blob: any = {
      profile: { settings: { appearance: { theme: 'dark' } }, cardSets: {} },
      session: { ui: {} },
    };
    const out = step(1)(blob);
    expect(out.profile.settings.appearance.theme).toBe('dark');
  });
});

// ── Per-migration: 2 → 3 ────────────────────────────────────────────

describe('2 → 3: overlayLayers seed', () => {
  it('introduces overlayLayers with ownership: false', () => {
    const blob: any = { session: { ui: {} } };
    const out = step(2)(blob);
    expect(out.session.ui.overlayLayers).toEqual({ ownership: false });
  });

  it('preserves a pre-existing boolean ownership value', () => {
    const blob: any = { session: { ui: { overlayLayers: { ownership: true } } } };
    const out = step(2)(blob);
    expect(out.session.ui.overlayLayers.ownership).toBe(true);
  });

  it('coerces non-boolean ownership to false', () => {
    const blob: any = { session: { ui: { overlayLayers: { ownership: 'yes' } } } };
    const out = step(2)(blob);
    expect(out.session.ui.overlayLayers.ownership).toBe(false);
  });

  it('leaves session unset when session.ui is absent', () => {
    const blob: any = { session: {} };
    const out = step(2)(blob);
    expect(out.session.ui).toBeUndefined();
  });
});

// ── Per-migration: 3 → 4 ────────────────────────────────────────────

describe('3 → 4: ownership boolean → three-mode object', () => {
  it("maps boolean `true` to { continuous: true, dots: false, liveness: false }", () => {
    const blob: any = { session: { ui: { overlayLayers: { ownership: true } } } };
    const out = step(3)(blob);
    expect(out.session.ui.overlayLayers.ownership).toEqual({
      continuous: true,
      dots: false,
      liveness: false,
    });
  });

  it('maps boolean `false` to all-off', () => {
    const blob: any = { session: { ui: { overlayLayers: { ownership: false } } } };
    const out = step(3)(blob);
    expect(out.session.ui.overlayLayers.ownership).toEqual({
      continuous: false,
      dots: false,
      liveness: false,
    });
  });

  it('coerces a partial object to the three-key shape (idempotent under truthy preservation)', () => {
    const blob: any = {
      session: { ui: { overlayLayers: { ownership: { continuous: true, dots: true } } } },
    };
    const out = step(3)(blob);
    expect(out.session.ui.overlayLayers.ownership).toEqual({
      continuous: true,
      dots: true,
      liveness: false,
    });
  });

  it('maps absent ownership to all-off', () => {
    const blob: any = { session: { ui: { overlayLayers: {} } } };
    const out = step(3)(blob);
    expect(out.session.ui.overlayLayers.ownership).toEqual({
      continuous: false,
      dots: false,
      liveness: false,
    });
  });
});

// ── Per-migration: 4 → 5 ────────────────────────────────────────────

describe('4 → 5: intensityHueShift seed', () => {
  it('introduces intensityHueShift = -43 (the prior hardcoded constant)', () => {
    const blob: any = { profile: { settings: { appearance: {} } } };
    const out = step(4)(blob);
    expect(out.profile.settings.appearance.intensityHueShift).toBe(-43);
  });

  it('preserves a pre-existing numeric value', () => {
    const blob: any = { profile: { settings: { appearance: { intensityHueShift: 17 } } } };
    const out = step(4)(blob);
    expect(out.profile.settings.appearance.intensityHueShift).toBe(17);
  });

  it('resets non-numeric values to the default', () => {
    const blob: any = { profile: { settings: { appearance: { intensityHueShift: 'wat' } } } };
    const out = step(4)(blob);
    expect(out.profile.settings.appearance.intensityHueShift).toBe(-43);
  });
});

// ── Per-migration: 5 → 6 ────────────────────────────────────────────

describe('5 → 6: qEUBO scaffolding', () => {
  it('seeds parameter_meta / qeuboPinnedBookmarks / qeuboToolbarView from empty', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { analysis_env: {} } } } },
      session: { ui: {} },
    };
    const out = step(5)(blob);
    expect(out.profile.settings.engine.katago.analysis_env.parameter_meta).toEqual({});
    expect(out.profile.qeuboPinnedBookmarks).toEqual([]);
    expect(out.session.ui.qeuboToolbarView).toBe('applied');
  });

  it('preserves valid pre-existing values', () => {
    const blob: any = {
      profile: {
        settings: {
          engine: {
            katago: {
              analysis_env: { parameter_meta: { alpha: { qeubo_controlled: true } } },
            },
          },
        },
        qeuboPinnedBookmarks: [{ snap: 'x' }],
      },
      session: { ui: { qeuboToolbarView: 'A' } },
    };
    const out = step(5)(blob);
    expect(out.profile.settings.engine.katago.analysis_env.parameter_meta).toEqual({
      alpha: { qeubo_controlled: true },
    });
    expect(out.profile.qeuboPinnedBookmarks).toEqual([{ snap: 'x' }]);
    expect(out.session.ui.qeuboToolbarView).toBe('A');
  });

  it('normalises a hand-edited corrupt parameter_meta (array) to {}', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { analysis_env: { parameter_meta: ['oops'] } } } } },
    };
    const out = step(5)(blob);
    expect(out.profile.settings.engine.katago.analysis_env.parameter_meta).toEqual({});
  });

  it('normalises a corrupt qeuboToolbarView to applied', () => {
    const blob: any = { session: { ui: { qeuboToolbarView: 'banana' } } };
    const out = step(5)(blob);
    expect(out.session.ui.qeuboToolbarView).toBe('applied');
  });

  it("accepts the 'A' and 'B' experiment views", () => {
    const outA = step(5)({ session: { ui: { qeuboToolbarView: 'A' } } });
    const outB = step(5)({ session: { ui: { qeuboToolbarView: 'B' } } });
    expect(outA.session.ui.qeuboToolbarView).toBe('A');
    expect(outB.session.ui.qeuboToolbarView).toBe('B');
  });
});

// ── Per-migration: 6 → 7 ────────────────────────────────────────────

describe('6 → 7: default-palette repair', () => {
  const BROKEN_VISIT_RATIO = 'uservisits(x[0]) / x[0]["rootInfo"]["visits"]';
  const BROKEN_SPREAD      = 'x[0]["moveInfos"][0]["visits"] / x[0]["rootInfo"]["visits"]';
  const HISTORICAL_QUALITY = 'visit_ratio(x)**(spread(x)**alpha)';

  function envFromBroken(): any {
    return {
      profile: {
        settings: {
          engine: {
            katago: {
              analysis_env: {
                symbols: {
                  visit_ratio: BROKEN_VISIT_RATIO,
                  spread:      BROKEN_SPREAD,
                  quality_delta: HISTORICAL_QUALITY,
                },
                palettes: [
                  {
                    id: 'default',
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
        },
      },
    };
  }

  it("repairs the broken visit_ratio body literal", () => {
    const out = step(6)(envFromBroken());
    expect(out.profile.settings.engine.katago.analysis_env.symbols.visit_ratio)
      .toBe('_uservisits(x[0]) / _maxvisits(x[0])');
  });

  it("renames `spread` → `decisiveness` and rewrites quality_delta", () => {
    const out = step(6)(envFromBroken());
    const symbols = out.profile.settings.engine.katago.analysis_env.symbols;
    expect('spread' in symbols).toBe(false);
    expect(symbols.decisiveness).toBe('_maxvisits(x) / x["rootInfo"]["visits"]');
    expect(symbols.quality_delta).toBe('visit_ratio(x) ** (decisiveness(x[0]) ** alpha)');
  });

  it("rewrites a user-customised quality_delta's spread( references after rename", () => {
    const blob = envFromBroken();
    blob.profile.settings.engine.katago.analysis_env.symbols.quality_delta =
      'my_custom(spread(x)) + 1';
    const out = step(6)(blob);
    expect(out.profile.settings.engine.katago.analysis_env.symbols.quality_delta)
      .toBe('my_custom(decisiveness(x)) + 1');
  });

  it('preserves a user-customised spread and seeds decisiveness alongside', () => {
    const blob = envFromBroken();
    blob.profile.settings.engine.katago.analysis_env.symbols.spread = 'my_spread_body(x)';
    const out = step(6)(blob);
    const symbols = out.profile.settings.engine.katago.analysis_env.symbols;
    expect(symbols.spread).toBe('my_spread_body(x)');
    expect(symbols.decisiveness).toBe('_maxvisits(x) / x["rootInfo"]["visits"]');
  });

  it('expands the symbol seed with the new entries when absent', () => {
    const out = step(6)(envFromBroken());
    const symbols = out.profile.settings.engine.katago.analysis_env.symbols;
    expect(symbols.complexity).toContain('_visit_entropy(x)');
    expect(symbols.score_volatility).toBe('x["rootInfo"]["scoreStdev"]');
    expect(symbols.nn_uncertainty).toBe('x["rootInfo"]["rawStWrError"]');
    expect(symbols.mean_summary).toBe('float(np.mean(x))');
  });

  it('repairs the broken-seed default palette state_fns', () => {
    const out = step(6)(envFromBroken());
    const def = out.profile.settings.engine.katago.analysis_env.palettes
      .find((p: any) => p.id === 'default');
    expect(def.state_fns).toEqual({
      'Complexity':      'complexity',
      'Win Probability': 'winrate',
      'Score Advantage': 'score_lead',
    });
  });

  it('adds the three new palettes (quality, score, rank) when absent', () => {
    const out = step(6)(envFromBroken());
    const ids = out.profile.settings.engine.katago.analysis_env.palettes.map((p: any) => p.id);
    expect(ids).toContain('quality');
    expect(ids).toContain('score');
    expect(ids).toContain('rank');
  });

  it("promotes activePaletteId 'default' → 'quality' when default was broken-seed", () => {
    const out = step(6)(envFromBroken());
    expect(out.profile.settings.engine.katago.analysis_env.activePaletteId).toBe('quality');
  });

  it("leaves activePaletteId alone when default was user-customised", () => {
    const blob = envFromBroken();
    blob.profile.settings.engine.katago.analysis_env.palettes[0].delta_fn = 'my_delta';
    const out = step(6)(blob);
    expect(out.profile.settings.engine.katago.analysis_env.activePaletteId).toBe('default');
  });

  it('seeds alpha = 0.25 when absent and preserves an existing numeric value', () => {
    const blob = envFromBroken();
    const out1 = step(6)(blob);
    expect(out1.profile.settings.engine.katago.analysis_env.parameters.alpha).toBe(0.25);

    const blob2 = envFromBroken();
    blob2.profile.settings.engine.katago.analysis_env.parameters.alpha = 0.7;
    const out2 = step(6)(blob2);
    expect(out2.profile.settings.engine.katago.analysis_env.parameters.alpha).toBe(0.7);
  });

  it('is a no-op when analysis_env is absent', () => {
    const blob: any = { profile: { settings: { engine: { katago: {} } } } };
    const out = step(6)(blob);
    expect(out.profile.settings.engine.katago.analysis_env).toBeUndefined();
  });
});

// ── Per-migration: 7 → 8 ────────────────────────────────────────────

describe('7 → 8: player_sign + scoreLead_loss_topvsuser rebase', () => {
  const V7_SCORELEAD_LOSS =
    '(x[0]["moveInfos"][0]["scoreLead"] - x[0]["userMoveInfo"]["scoreLead"]) if x[0]["userMoveInfo"] else 0';

  it('seeds player_sign with the SIDETOMOVE → black-perspective sign formula', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { analysis_env: { symbols: {} } } } } },
    };
    const out = step(7)(blob);
    expect(out.profile.settings.engine.katago.analysis_env.symbols.player_sign)
      .toBe('1.0 if x["rootInfo"]["currentPlayer"] == "B" else -1.0');
  });

  it('preserves a user-customised player_sign body', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { analysis_env: { symbols: { player_sign: 'custom()' } } } } } },
    };
    const out = step(7)(blob);
    expect(out.profile.settings.engine.katago.analysis_env.symbols.player_sign).toBe('custom()');
  });

  it("rebases the v7 seed scoreLead_loss_topvsuser onto player_sign", () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { analysis_env: { symbols: { scoreLead_loss_topvsuser: V7_SCORELEAD_LOSS } } } } } },
    };
    const out = step(7)(blob);
    expect(out.profile.settings.engine.katago.analysis_env.symbols.scoreLead_loss_topvsuser)
      .toContain('player_sign(x[0])');
  });

  it('leaves a user-customised scoreLead_loss_topvsuser body untouched', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { analysis_env: { symbols: { scoreLead_loss_topvsuser: 'my_custom_body()' } } } } } },
    };
    const out = step(7)(blob);
    expect(out.profile.settings.engine.katago.analysis_env.symbols.scoreLead_loss_topvsuser)
      .toBe('my_custom_body()');
  });

  it('is a no-op when analysis_env is absent', () => {
    const blob: any = { profile: { settings: { engine: { katago: {} } } } };
    const out = step(7)(blob);
    expect(out.profile.settings.engine.katago.analysis_env).toBeUndefined();
  });
});

// ── Per-migration: 8 → 9 ────────────────────────────────────────────

describe('8 → 9: flip systemLogExpanded default', () => {
  it('flips systemLogExpanded to false unconditionally', () => {
    const blob: any = { session: { ui: { systemLogExpanded: true } } };
    const out = step(8)(blob);
    expect(out.session.ui.systemLogExpanded).toBe(false);
  });

  it('normalises a missing field to false', () => {
    const blob: any = { session: { ui: {} } };
    const out = step(8)(blob);
    expect(out.session.ui.systemLogExpanded).toBe(false);
  });

  it('normalises a corrupt non-boolean to false', () => {
    const blob: any = { session: { ui: { systemLogExpanded: 'open' } } };
    const out = step(8)(blob);
    expect(out.session.ui.systemLogExpanded).toBe(false);
  });
});

// ── Per-migration: 9 → 10 ───────────────────────────────────────────

describe('9 → 10: pvAnimation knobs', () => {
  it('seeds pvAnimation with the documented defaults when absent', () => {
    const blob: any = { session: { ui: {} } };
    const out = step(9)(blob);
    expect(out.session.ui.pvAnimation).toEqual({
      mode:             'instant',
      stepDelayMs:      350,
      windowDurationMs: 600,
      fadeDurationMs:   0,
      cycle:            false,
      pvOpacity:        1,
      annotation:       'from1',
    });
  });

  it('preserves all valid user values', () => {
    const blob: any = {
      session: {
        ui: {
          pvAnimation: {
            mode: 'sequential',
            stepDelayMs: 200,
            windowDurationMs: 1000,
            fadeDurationMs: 80,
            cycle: true,
            pvOpacity: 0.5,
            annotation: 'fromCurrent',
          },
        },
      },
    };
    const out = step(9)(blob);
    expect(out.session.ui.pvAnimation.mode).toBe('sequential');
    expect(out.session.ui.pvAnimation.stepDelayMs).toBe(200);
    expect(out.session.ui.pvAnimation.cycle).toBe(true);
    expect(out.session.ui.pvAnimation.pvOpacity).toBe(0.5);
    expect(out.session.ui.pvAnimation.annotation).toBe('fromCurrent');
  });

  it('normalises corrupt individual fields without clobbering valid neighbours', () => {
    const blob: any = {
      session: {
        ui: {
          pvAnimation: {
            mode: 'wat',                  // invalid → 'instant'
            stepDelayMs: 'fast',          // invalid → 350
            windowDurationMs: 999,        // valid → preserved
            fadeDurationMs: null,         // invalid → 0
            cycle: 'true',                // invalid (string) → false
            pvOpacity: 0.3,               // valid → preserved
            annotation: 'wat',            // invalid → 'from1'
          },
        },
      },
    };
    const out = step(9)(blob);
    expect(out.session.ui.pvAnimation.mode).toBe('instant');
    expect(out.session.ui.pvAnimation.stepDelayMs).toBe(350);
    expect(out.session.ui.pvAnimation.windowDurationMs).toBe(999);
    expect(out.session.ui.pvAnimation.fadeDurationMs).toBe(0);
    expect(out.session.ui.pvAnimation.cycle).toBe(false);
    expect(out.session.ui.pvAnimation.pvOpacity).toBe(0.3);
    expect(out.session.ui.pvAnimation.annotation).toBe('from1');
  });
});

// ── Per-migration: 10 → 11 ──────────────────────────────────────────

describe('10 → 11: contextIds repotting', () => {
  it('drops cardSets[*].contextIds and seeds per-tab fields from the active card-set', () => {
    const blob: any = {
      profile: {
        cardSets: {
          default: { id: 'default', contextIds: [7, 11] },
          other:   { id: 'other',   contextIds: [42] },
        },
      },
      session: { ui: { activeCardSetId: 'default' } },
    };
    const out = step(10)(blob);
    expect('contextIds' in out.profile.cardSets.default).toBe(false);
    expect('contextIds' in out.profile.cardSets.other).toBe(false);
    expect(out.session.ui.srContextIds).toEqual([7, 11]);
    expect(out.session.ui.databaseContextIds).toEqual([7, 11]);
  });

  it("falls back to any card-set's contextIds when the active id has none", () => {
    const blob: any = {
      profile: {
        cardSets: {
          default: { id: 'default' },                       // no contextIds
          other:   { id: 'other', contextIds: [99] },
        },
      },
      session: { ui: { activeCardSetId: 'default' } },
    };
    const out = step(10)(blob);
    expect(out.session.ui.srContextIds).toEqual([99]);
    expect(out.session.ui.databaseContextIds).toEqual([99]);
  });

  it('falls back to [3] when no card-set carries contextIds', () => {
    const blob: any = {
      profile: { cardSets: { default: { id: 'default' } } },
      session: { ui: { activeCardSetId: 'default' } },
    };
    const out = step(10)(blob);
    expect(out.session.ui.srContextIds).toEqual([3]);
    expect(out.session.ui.databaseContextIds).toEqual([3]);
  });

  it('preserves a pre-existing valid per-tab array', () => {
    const blob: any = {
      profile: {
        cardSets: { default: { id: 'default', contextIds: [7] } },
      },
      session: { ui: { srContextIds: [1, 2, 3], databaseContextIds: [4] } },
    };
    const out = step(10)(blob);
    expect(out.session.ui.srContextIds).toEqual([1, 2, 3]);
    expect(out.session.ui.databaseContextIds).toEqual([4]);
  });

  it('replaces a non-array per-tab field with the seed', () => {
    const blob: any = {
      profile: { cardSets: { default: { id: 'default', contextIds: [9] } } },
      session: { ui: { srContextIds: 'corrupt', databaseContextIds: [4] } },
    };
    const out = step(10)(blob);
    expect(out.session.ui.srContextIds).toEqual([9]);
    expect(out.session.ui.databaseContextIds).toEqual([4]);
  });
});

// ── Per-migration: 11 → 12 ──────────────────────────────────────────

describe('11 → 12: analysis_config curation alignment', () => {
  it('rewrites np.<curated>( → <curated>( in live profile symbols', () => {
    const blob: any = {
      profile: {
        settings: {
          engine: {
            katago: {
              analysis_env: {
                symbols: { my_mean: 'np.mean(x)', noop_body: 'x[0]["winrate"]' },
              },
            },
          },
        },
      },
    };
    const out = step(11)(blob);
    expect(out.profile.settings.engine.katago.analysis_env.symbols.my_mean).toBe('mean(x)');
    expect(out.profile.settings.engine.katago.analysis_env.symbols.noop_body).toBe('x[0]["winrate"]');
  });

  it('queues an info SystemMessage with the rewrite count', () => {
    const blob: any = {
      profile: {
        settings: {
          engine: {
            katago: {
              analysis_env: {
                symbols: { a: 'np.mean(x)', b: 'np.median(x)' },
              },
            },
          },
        },
      },
    };
    const out = step(11)(blob);
    expect(Array.isArray(out._pendingMigrationMessages)).toBe(true);
    const info = out._pendingMigrationMessages.find((m: any) => m.type === 'info');
    expect(info).toBeDefined();
    expect(info.text).toMatch(/rewrote 2 symbol/);
  });

  it('queues a warning SystemMessage when residue np.* remains', () => {
    const blob: any = {
      profile: {
        settings: {
          engine: {
            katago: {
              analysis_env: {
                // np.linalg.norm is an attribute walk — the curated
                // regex declines to touch it; it surfaces as residue.
                symbols: { norm: 'np.linalg.norm(x)' },
              },
            },
          },
        },
      },
    };
    const out = step(11)(blob);
    expect(Array.isArray(out._pendingMigrationMessages)).toBe(true);
    const warning = out._pendingMigrationMessages.find((m: any) => m.type === 'warning');
    expect(warning).toBeDefined();
    expect(warning.text).toMatch(/numpy functions outside the curated stdlib/);
  });

  it('walks cards persisted in active review queues', () => {
    const blob: any = {
      session: {
        reviews: {
          'board-a': {
            queue: [
              {
                gradingParameter: {
                  data: {
                    analysis_config: {
                      symbols: { body: 'np.mean(x)' },
                    },
                  },
                },
              },
            ],
          },
        },
      },
    };
    const out = step(11)(blob);
    expect(out.session.reviews['board-a'].queue[0].gradingParameter.data.analysis_config.symbols.body)
      .toBe('mean(x)');
  });

  it('does not touch a blob with no np.* references', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { analysis_env: { symbols: { x: 'safe_body()' } } } } } },
    };
    const out = step(11)(blob);
    expect(out.profile.settings.engine.katago.analysis_env.symbols.x).toBe('safe_body()');
    expect(out._pendingMigrationMessages).toBeUndefined();
  });
});

// ── Per-migration: 12 → 13 ──────────────────────────────────────────

describe('12 → 13: minting.defaultGamma seed', () => {
  it('seeds defaultGamma = 0.9 (matching the read-side fallback)', () => {
    const blob: any = { profile: { settings: { minting: {} } } };
    const out = step(12)(blob);
    expect(out.profile.settings.minting.defaultGamma).toBe(0.9);
  });

  it('preserves a numeric custom default', () => {
    const blob: any = { profile: { settings: { minting: { defaultGamma: 1.4 } } } };
    const out = step(12)(blob);
    expect(out.profile.settings.minting.defaultGamma).toBe(1.4);
  });

  it('replaces a non-numeric value with 0.9', () => {
    const blob: any = { profile: { settings: { minting: { defaultGamma: 'oops' } } } };
    const out = step(12)(blob);
    expect(out.profile.settings.minting.defaultGamma).toBe(0.9);
  });
});

// ── Per-migration: 13 → 14 ──────────────────────────────────────────

describe('13 → 14: proxy cache flags seed', () => {
  it('seeds cache / lookup_cache / replay_final_only as false', () => {
    const blob: any = { profile: { settings: { engine: { katago: {} } } } };
    const out = step(13)(blob);
    expect(out.profile.settings.engine.katago.cache).toBe(false);
    expect(out.profile.settings.engine.katago.lookup_cache).toBe(false);
    expect(out.profile.settings.engine.katago.replay_final_only).toBe(false);
  });

  it('preserves pre-existing boolean values per flag', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { cache: true, lookup_cache: false, replay_final_only: true } } } },
    };
    const out = step(13)(blob);
    expect(out.profile.settings.engine.katago.cache).toBe(true);
    expect(out.profile.settings.engine.katago.lookup_cache).toBe(false);
    expect(out.profile.settings.engine.katago.replay_final_only).toBe(true);
  });

  it('normalises non-boolean fields individually', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { cache: 'on', lookup_cache: true, replay_final_only: null } } } },
    };
    const out = step(13)(blob);
    expect(out.profile.settings.engine.katago.cache).toBe(false);
    expect(out.profile.settings.engine.katago.lookup_cache).toBe(true);
    expect(out.profile.settings.engine.katago.replay_final_only).toBe(false);
  });
});

// ── Per-migration: 14 → 15 ──────────────────────────────────────────

describe("14 → 15: retire 'light' theme + introduce 'cluster'", () => {
  it("preserves 'dark' (the de-facto v14 value)", () => {
    const blob: any = { profile: { settings: { appearance: { theme: 'dark' } } } };
    const out = step(14)(blob);
    expect(out.profile.settings.appearance.theme).toBe('dark');
  });

  it("preserves 'cluster' if already chosen", () => {
    const blob: any = { profile: { settings: { appearance: { theme: 'cluster' } } } };
    const out = step(14)(blob);
    expect(out.profile.settings.appearance.theme).toBe('cluster');
  });

  it("coerces 'light' (never-wired) to 'cluster' (new default)", () => {
    const blob: any = { profile: { settings: { appearance: { theme: 'light' } } } };
    const out = step(14)(blob);
    expect(out.profile.settings.appearance.theme).toBe('cluster');
  });

  it("coerces any other value to 'cluster'", () => {
    const blob: any = { profile: { settings: { appearance: { theme: 'noir' } } } };
    const out = step(14)(blob);
    expect(out.profile.settings.appearance.theme).toBe('cluster');
  });

  it("coerces a missing value to 'cluster'", () => {
    const blob: any = { profile: { settings: { appearance: {} } } };
    const out = step(14)(blob);
    expect(out.profile.settings.appearance.theme).toBe('cluster');
  });
});

// ── Per-migration: 15 → 16 ──────────────────────────────────────────

describe('15 → 16: collapse per-tab cardsContextIds', () => {
  it('prefers databaseContextIds when both are present', () => {
    const blob: any = {
      session: { ui: { srContextIds: [1], databaseContextIds: [7, 8] } },
    };
    const out = step(15)(blob);
    expect(out.session.ui.cardsContextIds).toEqual([7, 8]);
    expect('srContextIds' in out.session.ui).toBe(false);
    expect('databaseContextIds' in out.session.ui).toBe(false);
  });

  it('falls back to srContextIds when databaseContextIds is empty/missing', () => {
    const blob: any = { session: { ui: { srContextIds: [99], databaseContextIds: [] } } };
    const out = step(15)(blob);
    expect(out.session.ui.cardsContextIds).toEqual([99]);
  });

  it('falls back to [3] when neither is valid', () => {
    const blob: any = { session: { ui: {} } };
    const out = step(15)(blob);
    expect(out.session.ui.cardsContextIds).toEqual([3]);
  });

  it('preserves a pre-existing valid cardsContextIds', () => {
    const blob: any = {
      session: { ui: { cardsContextIds: [42], srContextIds: [1] } },
    };
    const out = step(15)(blob);
    expect(out.session.ui.cardsContextIds).toEqual([42]);
  });

  it('does NOT rewrite activeTab (per the source-comment split)', () => {
    const blob: any = {
      session: { ui: { activeTab: 'sr', srContextIds: [1], databaseContextIds: [2] } },
    };
    const out = step(15)(blob);
    expect(out.session.ui.activeTab).toBe('sr');
  });
});

// ── Per-migration: 16 → 17 ──────────────────────────────────────────

describe("16 → 17: rewrite activeTab to 'cards'", () => {
  it("rewrites 'sr' → 'cards'", () => {
    const blob: any = { session: { ui: { activeTab: 'sr' } } };
    const out = step(16)(blob);
    expect(out.session.ui.activeTab).toBe('cards');
  });

  it("rewrites 'database' → 'cards'", () => {
    const blob: any = { session: { ui: { activeTab: 'database' } } };
    const out = step(16)(blob);
    expect(out.session.ui.activeTab).toBe('cards');
  });

  it("leaves other values untouched", () => {
    const blob: any = { session: { ui: { activeTab: 'settings' } } };
    const out = step(16)(blob);
    expect(out.session.ui.activeTab).toBe('settings');
  });

  it('is idempotent on an already-cards blob', () => {
    const blob: any = { session: { ui: { activeTab: 'cards' } } };
    const out = step(16)(blob);
    expect(out.session.ui.activeTab).toBe('cards');
  });
});

// ── Per-migration: 17 → 18 ──────────────────────────────────────────

describe("17 → 18: boardVariations seed", () => {
  it("seeds boardVariations = 'circles' when absent", () => {
    const blob: any = { session: { ui: {} } };
    const out = step(17)(blob);
    expect(out.session.ui.boardVariations).toBe('circles');
  });

  it("preserves a valid 'off' value", () => {
    const blob: any = { session: { ui: { boardVariations: 'off' } } };
    const out = step(17)(blob);
    expect(out.session.ui.boardVariations).toBe('off');
  });

  it("preserves a valid 'letters' value", () => {
    const blob: any = { session: { ui: { boardVariations: 'letters' } } };
    const out = step(17)(blob);
    expect(out.session.ui.boardVariations).toBe('letters');
  });

  it("coerces an invalid value to 'circles'", () => {
    const blob: any = { session: { ui: { boardVariations: 'rainbow' } } };
    const out = step(17)(blob);
    expect(out.session.ui.boardVariations).toBe('circles');
  });
});

// ── Per-migration: 18 → 19 ──────────────────────────────────────────

describe('18 → 19: showActiveNextMove seed', () => {
  it('seeds showActiveNextMove = true when absent', () => {
    const blob: any = { session: { ui: {} } };
    const out = step(18)(blob);
    expect(out.session.ui.showActiveNextMove).toBe(true);
  });

  it('preserves a pre-existing boolean value', () => {
    const blob: any = { session: { ui: { showActiveNextMove: false } } };
    const out = step(18)(blob);
    expect(out.session.ui.showActiveNextMove).toBe(false);
  });

  it('coerces a non-boolean to true', () => {
    const blob: any = { session: { ui: { showActiveNextMove: 'on' } } };
    const out = step(18)(blob);
    expect(out.session.ui.showActiveNextMove).toBe(true);
  });
});

// ── Per-migration: 19 → 20 ──────────────────────────────────────────

describe('19 → 20: showTranspositionRings seed', () => {
  it('seeds showTranspositionRings = true when absent', () => {
    const blob: any = { session: { ui: {} } };
    const out = step(19)(blob);
    expect(out.session.ui.showTranspositionRings).toBe(true);
  });

  it('preserves a pre-existing boolean value', () => {
    const blob: any = { session: { ui: { showTranspositionRings: false } } };
    const out = step(19)(blob);
    expect(out.session.ui.showTranspositionRings).toBe(false);
  });

  it('coerces a non-boolean to true', () => {
    const blob: any = { session: { ui: { showTranspositionRings: 1 } } };
    const out = step(19)(blob);
    expect(out.session.ui.showTranspositionRings).toBe(true);
  });
});

// ── Per-migration: 20 → 21 ──────────────────────────────────────────

describe('20 → 21: forestNav state seed', () => {
  it('seeds forestNav = { expanded: [], selection: null } when absent', () => {
    const blob: any = { session: { ui: {} } };
    const out = step(20)(blob);
    expect(out.session.ui.forestNav).toEqual({ expanded: [], selection: null });
  });

  it('preserves a well-shaped pre-existing forestNav', () => {
    const blob: any = {
      session: { ui: { forestNav: { expanded: ['gs-1', 'gs-2'], selection: { kind: 'gameSource', id: 'gs-1' } } } },
    };
    const out = step(20)(blob);
    expect(out.session.ui.forestNav.expanded).toEqual(['gs-1', 'gs-2']);
    expect(out.session.ui.forestNav.selection).toEqual({ kind: 'gameSource', id: 'gs-1' });
  });

  it('replaces a malformed forestNav with empty defaults', () => {
    const blob: any = { session: { ui: { forestNav: { expanded: 'oops' } } } };
    const out = step(20)(blob);
    expect(out.session.ui.forestNav).toEqual({ expanded: [], selection: null });
  });
});

// ── Per-migration: 21 → 22 ──────────────────────────────────────────

describe('21 → 22: three new default decks (centroid_coverage, main_line_first, balanced_overdue)', () => {
  it('adds all three decks when absent', () => {
    const blob: any = { profile: { cardSets: { default: { id: 'default', pipeline: [] } } } };
    const out = step(21)(blob);
    expect(out.profile.cardSets.centroid_coverage).toBeDefined();
    expect(out.profile.cardSets.main_line_first).toBeDefined();
    expect(out.profile.cardSets.balanced_overdue).toBeDefined();
    expect(out.profile.cardSets.centroid_coverage.pipeline.length).toBeGreaterThan(0);
  });

  it('preserves a user-customised deck under any of the three ids', () => {
    const customDeck = { id: 'main_line_first', name: 'My Custom', pipeline: [] };
    const blob: any = { profile: { cardSets: { main_line_first: customDeck } } };
    const out = step(21)(blob);
    // Value equality (structuredClone breaks reference identity but
    // the migration's contract is "do not overwrite this entry").
    expect(out.profile.cardSets.main_line_first).toEqual(customDeck);
    // The other two should still be added.
    expect(out.profile.cardSets.centroid_coverage).toBeDefined();
    expect(out.profile.cardSets.balanced_overdue).toBeDefined();
  });

  it('is a no-op when cardSets is missing', () => {
    const blob: any = { profile: {} };
    const out = step(21)(blob);
    expect(out.profile.cardSets).toBeUndefined();
  });
});

// ── Per-migration: 22 → 23 ──────────────────────────────────────────

describe('22 → 23: clientGameId backfill on BoardState', () => {
  it('seeds a fresh UUID per board', () => {
    const blob: any = { boards: [{ id: 'a' }, { id: 'b' }] };
    const out = step(22)(blob);
    expect(out.boards[0].clientGameId).toMatch(UUID_RE);
    expect(out.boards[1].clientGameId).toMatch(UUID_RE);
    expect(out.boards[0].clientGameId).not.toBe(out.boards[1].clientGameId);
  });

  it('preserves a pre-existing string clientGameId', () => {
    const blob: any = { boards: [{ id: 'a', clientGameId: 'preserved-uuid' }] };
    const out = step(22)(blob);
    expect(out.boards[0].clientGameId).toBe('preserved-uuid');
  });

  it('replaces a non-string clientGameId with a fresh UUID', () => {
    const blob: any = { boards: [{ id: 'a', clientGameId: 42 }] };
    const out = step(22)(blob);
    expect(out.boards[0].clientGameId).toMatch(UUID_RE);
  });

  it('is a no-op when boards is not an array', () => {
    const blob: any = { boards: undefined };
    const out = step(22)(blob);
    expect(out.boards).toBeUndefined();
  });
});

// ── Per-migration: 23 → 24 ──────────────────────────────────────────

describe('23 → 24: appearance.locale seed via browser detection', () => {
  it('seeds locale via detectBrowserLocale() when absent', () => {
    const blob: any = { profile: { settings: { appearance: {} } } };
    const out = step(23)(blob);
    // We don't pin the exact detected value (test env vs user env);
    // we pin that it's now a non-empty string. Type-shape correctness
    // is asserted by the strict typecheck at compile time.
    expect(typeof out.profile.settings.appearance.locale).toBe('string');
    expect(out.profile.settings.appearance.locale.length).toBeGreaterThan(0);
  });

  it('preserves a valid supported-locale value', () => {
    const blob: any = { profile: { settings: { appearance: { locale: 'en' } } } };
    const out = step(23)(blob);
    expect(out.profile.settings.appearance.locale).toBe('en');
  });

  it('replaces an unsupported locale via detection', () => {
    const blob: any = { profile: { settings: { appearance: { locale: 'klingon' } } } };
    const out = step(23)(blob);
    expect(out.profile.settings.appearance.locale).not.toBe('klingon');
    expect(typeof out.profile.settings.appearance.locale).toBe('string');
  });
});

// ── Per-migration: 24 → 25 ──────────────────────────────────────────

describe('24 → 25: BoardId base-36 → UUID', () => {
  it('assigns each board a fresh UUID', () => {
    const blob: any = { boards: [{ id: 'short1' }, { id: 'short2' }] };
    const out = step(24)(blob);
    expect(out.boards[0].id).toMatch(UUID_RE);
    expect(out.boards[1].id).toMatch(UUID_RE);
    expect(out.boards[0].id).not.toBe(out.boards[1].id);
  });

  it('re-keys session.reviews through the old→new map', () => {
    const blob: any = {
      boards: [{ id: 'old-a' }, { id: 'old-b' }],
      session: { reviews: { 'old-a': { queue: ['card-1'] }, 'old-b': { queue: ['card-2'] } } },
    };
    const out = step(24)(blob);
    const newA = out.boards[0].id;
    const newB = out.boards[1].id;
    expect(out.session.reviews[newA]).toEqual({ queue: ['card-1'] });
    expect(out.session.reviews[newB]).toEqual({ queue: ['card-2'] });
    expect(out.session.reviews['old-a']).toBeUndefined();
    expect(out.session.reviews['old-b']).toBeUndefined();
  });

  it('re-keys engine.activeMode through the old→new map', () => {
    const blob: any = {
      boards: [{ id: 'old-a' }],
      engine: { activeMode: { 'old-a': 'analyze' } },
    };
    const out = step(24)(blob);
    const newA = out.boards[0].id;
    expect(out.engine.activeMode[newA]).toBe('analyze');
    expect(out.engine.activeMode['old-a']).toBeUndefined();
  });

  it('drops orphan dictionary entries whose key is not in the map', () => {
    const blob: any = {
      boards: [{ id: 'old-a' }],
      session: { reviews: { 'old-a': { queue: [] }, 'orphan-id': { queue: ['lost'] } } },
    };
    const out = step(24)(blob);
    expect(Object.keys(out.session.reviews).length).toBe(1);
  });

  it('is a no-op when boards is not an array', () => {
    const blob: any = { boards: 'corrupt' };
    const out = step(24)(blob);
    expect(out.boards).toBe('corrupt');
  });
});

// ── Per-migration: 25 → 26 ──────────────────────────────────────────

describe('25 → 26: analysisStorageEnabled seed', () => {
  it('seeds analysisStorageEnabled = true when absent', () => {
    const blob: any = { profile: { settings: { engine: { katago: {} } } } };
    const out = step(25)(blob);
    expect(out.profile.settings.engine.katago.analysisStorageEnabled).toBe(true);
  });

  it('preserves a deliberate false', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { analysisStorageEnabled: false } } } },
    };
    const out = step(25)(blob);
    expect(out.profile.settings.engine.katago.analysisStorageEnabled).toBe(false);
  });

  it('coerces a non-boolean to true', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { analysisStorageEnabled: 'maybe' } } } },
    };
    const out = step(25)(blob);
    expect(out.profile.settings.engine.katago.analysisStorageEnabled).toBe(true);
  });
});

// ── Per-migration: 26 → 27 ──────────────────────────────────────────

describe('26 → 27: repair non-UUID BoardIds', () => {
  it('rewrites slug-shaped board ids to UUIDs', () => {
    const blob: any = { boards: [{ id: 'sgf-abc12' }, { id: 'sgf-xyz98' }] };
    const out = step(26)(blob);
    expect(out.boards[0].id).toMatch(UUID_RE);
    expect(out.boards[1].id).toMatch(UUID_RE);
  });

  it('preserves UUID-shaped board ids verbatim', () => {
    const goodId = '12345678-1234-4321-8123-1234567890ab';
    const blob: any = { boards: [{ id: goodId }] };
    const out = step(26)(blob);
    expect(out.boards[0].id).toBe(goodId);
  });

  it('re-keys session.reviews via slug→UUID map, leaving UUID keys verbatim', () => {
    const goodId = '12345678-1234-4321-8123-1234567890ab';
    const blob: any = {
      boards: [{ id: 'sgf-foo' }, { id: goodId }],
      session: {
        reviews: { 'sgf-foo': { queue: ['x'] }, [goodId]: { queue: ['y'] } },
      },
    };
    const out = step(26)(blob);
    const newId = out.boards[0].id;
    expect(out.session.reviews[newId]).toEqual({ queue: ['x'] });
    expect(out.session.reviews[goodId]).toEqual({ queue: ['y'] });
    expect(out.session.reviews['sgf-foo']).toBeUndefined();
  });

  it('is a no-op when every board id is already UUID-shaped', () => {
    const goodId = '12345678-1234-4321-8123-1234567890ab';
    const blob: any = {
      boards: [{ id: goodId }],
      session: { reviews: { [goodId]: { queue: ['x'] } } },
    };
    const out = step(26)(blob);
    expect(out.boards[0].id).toBe(goodId);
    expect(out.session.reviews[goodId]).toEqual({ queue: ['x'] });
  });

  it('is a no-op when boards is not an array', () => {
    const blob: any = { boards: undefined };
    const out = step(26)(blob);
    expect(out.boards).toBeUndefined();
  });
});

// ── Per-migration: 27 → 28 ──────────────────────────────────────────

describe('27 → 28: overrideSettings seed', () => {
  it('seeds the documented overrideSettings defaults when absent', () => {
    const blob: any = { profile: { settings: { engine: { katago: {} } } } };
    const out = step(27)(blob);
    expect(out.profile.settings.engine.katago.overrideSettings).toEqual({
      reportAnalysisWinratesAs: 'WHITE',
      rootNumSymmetriesToSample: 8,
      wideRootNoise: 0.02,
    });
  });

  it('preserves an existing object value verbatim', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { overrideSettings: { custom: 'value' } } } } },
    };
    const out = step(27)(blob);
    expect(out.profile.settings.engine.katago.overrideSettings).toEqual({ custom: 'value' });
  });

  it('replaces a non-object value (array, null, number) with the seed', () => {
    for (const corrupt of [['list'], null, 42, 'string']) {
      const blob: any = {
        profile: { settings: { engine: { katago: { overrideSettings: corrupt } } } },
      };
      const out = step(27)(blob);
      expect(out.profile.settings.engine.katago.overrideSettings.reportAnalysisWinratesAs).toBe('WHITE');
    }
  });
});

// ── Per-migration: 28 → 29 ──────────────────────────────────────────

describe('28 → 29: useTransposition seed', () => {
  it('seeds useTransposition = true when absent', () => {
    const blob: any = { profile: { settings: { engine: { katago: {} } } } };
    const out = step(28)(blob);
    expect(out.profile.settings.engine.katago.useTransposition).toBe(true);
  });

  it('preserves a deliberate false', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { useTransposition: false } } } },
    };
    const out = step(28)(blob);
    expect(out.profile.settings.engine.katago.useTransposition).toBe(false);
  });

  it('coerces a non-boolean to true', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { useTransposition: 'on' } } } },
    };
    const out = step(28)(blob);
    expect(out.profile.settings.engine.katago.useTransposition).toBe(true);
  });
});

// ── Per-migration: 29 → 30 ──────────────────────────────────────────

describe('29 → 30: adaptiveReevaluate metadata seed', () => {
  it('seeds the documented defaults when absent', () => {
    const blob: any = { profile: { settings: { engine: { katago: {} } } } };
    const out = step(29)(blob);
    expect(out.profile.settings.engine.katago.adaptiveReevaluate).toEqual({
      enabled: false,
      worstQuantile: 0.05,
      extraVisits: 800,
    });
  });

  it('preserves an existing object value with per-key normalisation', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { adaptiveReevaluate: { enabled: true, worstQuantile: 0.1, extraVisits: 1600 } } } } },
    };
    const out = step(29)(blob);
    expect(out.profile.settings.engine.katago.adaptiveReevaluate.enabled).toBe(true);
    expect(out.profile.settings.engine.katago.adaptiveReevaluate.worstQuantile).toBe(0.1);
    expect(out.profile.settings.engine.katago.adaptiveReevaluate.extraVisits).toBe(1600);
  });

  it('normalises individual corrupt sub-fields without clobbering valid neighbours', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { adaptiveReevaluate: { enabled: 'maybe', worstQuantile: 0.1, extraVisits: null } } } } },
    };
    const out = step(29)(blob);
    expect(out.profile.settings.engine.katago.adaptiveReevaluate.enabled).toBe(false);
    expect(out.profile.settings.engine.katago.adaptiveReevaluate.worstQuantile).toBe(0.1);
    expect(out.profile.settings.engine.katago.adaptiveReevaluate.extraVisits).toBe(800);
  });

  it('replaces a non-object value (array, null) with the seed', () => {
    for (const corrupt of [['list'], null]) {
      const blob: any = {
        profile: { settings: { engine: { katago: { adaptiveReevaluate: corrupt } } } },
      };
      const out = step(29)(blob);
      expect(out.profile.settings.engine.katago.adaptiveReevaluate.enabled).toBe(false);
    }
  });
});

// ── Per-migration: 30 → 31 ──────────────────────────────────────────

describe('30 → 31: ponderMaxVisits seed', () => {
  it('seeds ponderMaxVisits = 2_000_000 when absent', () => {
    const blob: any = { profile: { settings: { engine: { katago: {} } } } };
    const out = step(30)(blob);
    expect(out.profile.settings.engine.katago.ponderMaxVisits).toBe(2_000_000);
  });

  it('preserves a numeric custom value', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { ponderMaxVisits: 5_000_000 } } } },
    };
    const out = step(30)(blob);
    expect(out.profile.settings.engine.katago.ponderMaxVisits).toBe(5_000_000);
  });

  it('replaces a non-numeric value with the default', () => {
    const blob: any = {
      profile: { settings: { engine: { katago: { ponderMaxVisits: 'infinite' } } } },
    };
    const out = step(30)(blob);
    expect(out.profile.settings.engine.katago.ponderMaxVisits).toBe(2_000_000);
  });
});

// ── Per-migration: 31 → 32 ──────────────────────────────────────────

describe('31 → 32: showStoneMoveNumbers seed', () => {
  it('seeds showStoneMoveNumbers = false when absent', () => {
    const blob: any = { session: { ui: {} } };
    const out = step(31)(blob);
    expect(out.session.ui.showStoneMoveNumbers).toBe(false);
  });

  it('preserves a pre-existing boolean value', () => {
    const blob: any = { session: { ui: { showStoneMoveNumbers: true } } };
    const out = step(31)(blob);
    expect(out.session.ui.showStoneMoveNumbers).toBe(true);
  });

  it('coerces a non-boolean to false', () => {
    const blob: any = { session: { ui: { showStoneMoveNumbers: 'yes' } } };
    const out = step(31)(blob);
    expect(out.session.ui.showStoneMoveNumbers).toBe(false);
  });
});

// ── Per-migration: 32 → 33 ──────────────────────────────────────────

describe('32 → 33: hyperparameters scaffolding on every cardSet', () => {
  it('seeds hyperparameters = [] on each cardSet that lacks it', () => {
    const blob: any = {
      profile: {
        cardSets: {
          a: { id: 'a', pipeline: [] },
          b: { id: 'b', pipeline: [], hyperparameters: [{ kind: 'continuous', name: 'x' }] },
          c: { id: 'c', pipeline: [], hyperparameters: 'oops' },
        },
      },
    };
    const out = step(32)(blob);
    expect(out.profile.cardSets.a.hyperparameters).toEqual([]);
    expect(out.profile.cardSets.b.hyperparameters).toEqual([{ kind: 'continuous', name: 'x' }]);
    expect(out.profile.cardSets.c.hyperparameters).toEqual([]);
  });

  it('is a no-op when cardSets is absent', () => {
    const blob: any = { profile: {} };
    const out = step(32)(blob);
    expect(out.profile.cardSets).toBeUndefined();
  });
});

// ── Per-migration: 33 → 34 ──────────────────────────────────────────

describe('33 → 34: watchdog colour-transition toggle', () => {
  it('seeds watchdogColorTransition = false when absent', () => {
    const blob: any = { session: { ui: {} } };
    const out = step(33)(blob);
    expect(out.session.ui.watchdogColorTransition).toBe(false);
  });

  it('preserves a pre-existing boolean value', () => {
    const blob: any = { session: { ui: { watchdogColorTransition: true } } };
    const out = step(33)(blob);
    expect(out.session.ui.watchdogColorTransition).toBe(true);
  });

  it('coerces a non-boolean to false', () => {
    const blob: any = { session: { ui: { watchdogColorTransition: 'auto' } } };
    const out = step(33)(blob);
    expect(out.session.ui.watchdogColorTransition).toBe(false);
  });
});

// ── Per-migration: 34 → 35 ──────────────────────────────────────────

describe('34 → 35: tags backfill on persisted review-queue cards', () => {
  it('seeds tags = [] on cards lacking the field', () => {
    const blob: any = {
      session: {
        reviews: {
          'board-a': {
            queue: [{ id: 'c1' }, { id: 'c2', tags: ['existing'] }],
          },
        },
      },
    };
    const out = step(34)(blob);
    expect(out.session.reviews['board-a'].queue[0].tags).toEqual([]);
    expect(out.session.reviews['board-a'].queue[1].tags).toEqual(['existing']);
  });

  it('coerces a non-array tags field to []', () => {
    const blob: any = {
      session: {
        reviews: {
          'board-a': { queue: [{ id: 'c1', tags: 'corrupt' }] },
        },
      },
    };
    const out = step(34)(blob);
    expect(out.session.reviews['board-a'].queue[0].tags).toEqual([]);
  });

  it('is a no-op when reviews is empty', () => {
    const blob: any = { session: { reviews: {} } };
    const out = step(34)(blob);
    expect(out.session.reviews).toEqual({});
  });

  it('is a no-op when a session has no queue field', () => {
    const blob: any = { session: { reviews: { 'board-a': {} } } };
    const out = step(34)(blob);
    expect(out.session.reviews['board-a']).toEqual({});
  });
});

// ── Per-migration: 35 → 36 ──────────────────────────────────────────

describe('35 → 36: knob-registry substrate seed', () => {
  it('seeds knobs = {} when the field is absent', () => {
    const blob: any = { profile: { settings: {} } };
    const out = step(35)(blob);
    expect(out.profile.settings.knobs).toEqual({});
  });

  it('preserves a pre-existing plain-object registry', () => {
    const blob: any = {
      profile: {
        settings: {
          knobs: { brightness: { id: 'brightness' } },
        },
      },
    };
    const out = step(35)(blob);
    expect(out.profile.settings.knobs).toEqual({
      brightness: { id: 'brightness' },
    });
  });

  it('coerces a non-object knobs field to {}', () => {
    const blob: any = { profile: { settings: { knobs: 'corrupt' } } };
    const out = step(35)(blob);
    expect(out.profile.settings.knobs).toEqual({});
  });

  it('coerces an array knobs field to {} (Records are not arrays)', () => {
    const blob: any = { profile: { settings: { knobs: [] } } };
    const out = step(35)(blob);
    expect(out.profile.settings.knobs).toEqual({});
  });

  it('is a no-op when profile.settings is absent (defensive)', () => {
    const blob: any = { profile: {} };
    const out = step(35)(blob);
    expect(out.profile).toEqual({});
  });
});

// ── Per-migration: 36 → 37 ──────────────────────────────────────────

describe('36 → 37: motivating-scalar promotions (knob-registry Phase 3a)', () => {
  function blobWithSettings(extra: Record<string, unknown> = {}): any {
    return {
      profile: {
        settings: {
          appearance: {},
          engine: { katago: {} },
          knobs: {},
          ...extra,
        },
      },
    };
  }

  it('seeds ownershipOpacityCeiling default 0.55 when absent', () => {
    const out = step(36)(blobWithSettings());
    expect(out.profile.settings.appearance.ownershipOpacityCeiling).toBe(0.55);
  });

  it('preserves a pre-existing ownershipOpacityCeiling value', () => {
    const blob = blobWithSettings();
    blob.profile.settings.appearance.ownershipOpacityCeiling = 0.7;
    const out = step(36)(blob);
    expect(out.profile.settings.appearance.ownershipOpacityCeiling).toBe(0.7);
  });

  it('coerces a non-number ownershipOpacityCeiling to 0.55', () => {
    const blob = blobWithSettings();
    blob.profile.settings.appearance.ownershipOpacityCeiling = 'corrupt';
    const out = step(36)(blob);
    expect(out.profile.settings.appearance.ownershipOpacityCeiling).toBe(0.55);
  });

  it('seeds watchdogAnimationMs default 500 when absent', () => {
    const out = step(36)(blobWithSettings());
    expect(out.profile.settings.engine.katago.watchdogAnimationMs).toBe(500);
  });

  it('preserves a pre-existing watchdogAnimationMs value', () => {
    const blob = blobWithSettings();
    blob.profile.settings.engine.katago.watchdogAnimationMs = 750;
    const out = step(36)(blob);
    expect(out.profile.settings.engine.katago.watchdogAnimationMs).toBe(750);
  });

  it('seeds the four KnobDecls when knobs is empty', () => {
    const out = step(36)(blobWithSettings());
    const knobs = out.profile.settings.knobs;
    expect(Object.keys(knobs).sort()).toEqual([
      'display.hue-offset',
      'display.move-filter-threshold',
      'display.ownership-opacity-ceiling',
      'engine.watchdog-animation-ms',
    ]);
  });

  it('seeds each KnobDecl with the correct output path', () => {
    const out = step(36)(blobWithSettings());
    const knobs = out.profile.settings.knobs;
    expect(knobs['display.ownership-opacity-ceiling'].outputs[0].path).toBe(
      'profile.settings.appearance.ownershipOpacityCeiling',
    );
    expect(knobs['display.move-filter-threshold'].outputs[0].path).toBe(
      'session.ui.moveFilterThreshold',
    );
    expect(knobs['display.hue-offset'].outputs[0].path).toBe(
      'profile.settings.appearance.intensityHueShift',
    );
    expect(knobs['engine.watchdog-animation-ms'].outputs[0].path).toBe(
      'profile.settings.engine.katago.watchdogAnimationMs',
    );
  });

  it('seeds each KnobDecl with the right id, domain, and range', () => {
    const out = step(36)(blobWithSettings());
    const knobs = out.profile.settings.knobs;
    expect(knobs['display.ownership-opacity-ceiling']).toMatchObject({
      id: 'display.ownership-opacity-ceiling',
      domain: 'display',
      inputs: [{ range: [0, 1] }],
    });
    expect(knobs['display.move-filter-threshold']).toMatchObject({
      domain: 'display',
      inputs: [{ range: [0, 1] }],
    });
    expect(knobs['display.hue-offset']).toMatchObject({
      domain: 'display',
      inputs: [{ range: [-180, 180] }],
    });
    expect(knobs['engine.watchdog-animation-ms']).toMatchObject({
      domain: 'engine',
      inputs: [{ range: [50, 5000] }],
    });
  });

  it('preserves a pre-existing KnobDecl entry under the same key', () => {
    const blob = blobWithSettings();
    blob.profile.settings.knobs['display.hue-offset'] = {
      id: 'display.hue-offset',
      label: 'User-customised label',
      domain: 'display',
      inputs: [{ range: [-90, 90] }],
      outputs: [{ path: 'profile.settings.appearance.intensityHueShift' }],
    };
    const out = step(36)(blob);
    expect(out.profile.settings.knobs['display.hue-offset'].label).toBe(
      'User-customised label',
    );
    expect(out.profile.settings.knobs['display.hue-offset'].inputs[0].range).toEqual([
      -90,
      90,
    ]);
    // The other three seeds still land.
    expect(
      out.profile.settings.knobs['display.ownership-opacity-ceiling'],
    ).toBeDefined();
  });

  it('is a no-op when profile.settings is absent (defensive)', () => {
    const blob: any = { profile: {} };
    const out = step(36)(blob);
    expect(out.profile).toEqual({});
  });

  it('skips knob seeds when knobs field is not a plain object', () => {
    const blob = blobWithSettings();
    blob.profile.settings.knobs = 'corrupt';
    const out = step(36)(blob);
    // Lifts still happen on the new leaves.
    expect(out.profile.settings.appearance.ownershipOpacityCeiling).toBe(0.55);
    // Knobs container stays as it was; the 35 → 36 migration is the
    // one that normalises it.
    expect(out.profile.settings.knobs).toBe('corrupt');
  });
});

// ── Per-migration: 37 → 38 ──────────────────────────────────────────

describe('37 → 38: qEUBO consumer migration (knob-registry Phase 5)', () => {
  function blobWithEnv(
    parameterMeta: Record<string, { range?: [number, number]; qeubo_controlled?: boolean }>,
    knobs: Record<string, unknown> = {},
  ): any {
    return {
      profile: {
        settings: {
          engine: {
            katago: {
              analysis_env: {
                parameters: {},
                parameter_meta: parameterMeta,
              },
            },
          },
          knobs,
        },
      },
    };
  }

  it('seeds a KnobDecl for a parameter_meta entry with a valid range', () => {
    const blob = blobWithEnv({ alpha: { range: [0, 1], qeubo_controlled: true } });
    const out = step(37)(blob);
    const decl = out.profile.settings.knobs['qeubo.alpha'];
    expect(decl).toMatchObject({
      id: 'qeubo.alpha',
      label: 'alpha',
      domain: 'qeubo',
      inputs: [{ range: [0, 1] }],
      outputs: [{ path: 'profile.settings.engine.katago.analysis_env.parameters.alpha' }],
      qeuboControlled: true,
    });
  });

  it('mirrors qeubo_controlled === false on the seeded decl', () => {
    const blob = blobWithEnv({ alpha: { range: [0, 1], qeubo_controlled: false } });
    const out = step(37)(blob);
    expect(out.profile.settings.knobs['qeubo.alpha'].qeuboControlled).toBe(false);
  });

  it('treats missing qeubo_controlled as false', () => {
    const blob = blobWithEnv({ alpha: { range: [0, 1] } });
    const out = step(37)(blob);
    expect(out.profile.settings.knobs['qeubo.alpha'].qeuboControlled).toBe(false);
  });

  it('skips a parameter_meta entry without a range', () => {
    const blob = blobWithEnv({ alpha: { qeubo_controlled: true } });
    const out = step(37)(blob);
    expect(out.profile.settings.knobs['qeubo.alpha']).toBeUndefined();
  });

  it('skips a parameter_meta entry with an inverted range (lo >= hi)', () => {
    const blob = blobWithEnv({ alpha: { range: [1, 0] } });
    const out = step(37)(blob);
    expect(out.profile.settings.knobs['qeubo.alpha']).toBeUndefined();
  });

  it('skips a parameter_meta entry with non-finite range endpoints', () => {
    const blob = blobWithEnv({
      bad1: { range: [Number.NaN, 1] as [number, number] },
      bad2: { range: [0, Number.POSITIVE_INFINITY] as [number, number] },
    });
    const out = step(37)(blob);
    expect(out.profile.settings.knobs['qeubo.bad1']).toBeUndefined();
    expect(out.profile.settings.knobs['qeubo.bad2']).toBeUndefined();
  });

  it('seeds multiple entries when several parameters declare valid ranges', () => {
    const blob = blobWithEnv({
      alpha: { range: [0, 1], qeubo_controlled: true },
      beta: { range: [-10, 10], qeubo_controlled: false },
    });
    const out = step(37)(blob);
    expect(Object.keys(out.profile.settings.knobs).sort()).toEqual([
      'qeubo.alpha',
      'qeubo.beta',
    ]);
  });

  it('preserves a pre-existing decl under the same key', () => {
    const blob = blobWithEnv(
      { alpha: { range: [0, 1], qeubo_controlled: true } },
      {
        'qeubo.alpha': {
          id: 'qeubo.alpha',
          label: 'User-customised label',
          domain: 'qeubo',
          inputs: [{ range: [0.1, 0.9] }],
          outputs: [{ path: 'profile.settings.engine.katago.analysis_env.parameters.alpha' }],
          qeuboControlled: true,
        },
      },
    );
    const out = step(37)(blob);
    expect(out.profile.settings.knobs['qeubo.alpha'].label).toBe(
      'User-customised label',
    );
    expect(out.profile.settings.knobs['qeubo.alpha'].inputs[0].range).toEqual([
      0.1,
      0.9,
    ]);
  });

  it('is a no-op when analysis_env is absent (defensive)', () => {
    const blob: any = {
      profile: { settings: { knobs: {} } },
    };
    const out = step(37)(blob);
    expect(out.profile.settings.knobs).toEqual({});
  });

  it('is a no-op when parameter_meta is absent', () => {
    const blob: any = {
      profile: {
        settings: {
          engine: { katago: { analysis_env: { parameters: {} } } },
          knobs: {},
        },
      },
    };
    const out = step(37)(blob);
    expect(out.profile.settings.knobs).toEqual({});
  });

  it('skips seeding when knobs is not a plain object', () => {
    const blob = blobWithEnv(
      { alpha: { range: [0, 1] } },
      // @ts-expect-error — testing the runtime defensive branch
      'corrupt',
    );
    const out = step(37)(blob);
    expect(out.profile.settings.knobs).toBe('corrupt');
  });
});

// ── Per-migration: 38 → 39 ──────────────────────────────────────────

describe('38 → 39: KnobDomain "qeubo" → "palette" re-categorisation', () => {
  function blobWithKnobs(knobs: Record<string, unknown>): any {
    return {
      profile: { settings: { knobs } },
    };
  }

  it('rewrites domain on a qeubo.* decl that was `domain: "qeubo"`', () => {
    const blob = blobWithKnobs({
      'qeubo.alpha': {
        id: 'qeubo.alpha',
        label: 'alpha',
        domain: 'qeubo',
        inputs: [{ range: [0, 1] }],
        outputs: [{ path: 'profile.settings.engine.katago.analysis_env.parameters.alpha' }],
        qeuboControlled: true,
      },
    });
    const out = step(38)(blob);
    expect(out.profile.settings.knobs['qeubo.alpha'].domain).toBe('palette');
  });

  it('preserves other fields on the rewritten decl', () => {
    const blob = blobWithKnobs({
      'qeubo.alpha': {
        id: 'qeubo.alpha',
        label: 'alpha-customised',
        domain: 'qeubo',
        inputs: [{ range: [0.1, 0.9] }],
        outputs: [{ path: 'profile.settings.engine.katago.analysis_env.parameters.alpha' }],
        qeuboControlled: false,
      },
    });
    const out = step(38)(blob);
    const decl = out.profile.settings.knobs['qeubo.alpha'];
    expect(decl).toEqual({
      id: 'qeubo.alpha',
      label: 'alpha-customised',
      domain: 'palette',
      inputs: [{ range: [0.1, 0.9] }],
      outputs: [{ path: 'profile.settings.engine.katago.analysis_env.parameters.alpha' }],
      qeuboControlled: false,
    });
  });

  it('leaves a qeubo.* decl alone when its domain is already "palette"', () => {
    const blob = blobWithKnobs({
      'qeubo.alpha': {
        id: 'qeubo.alpha',
        domain: 'palette',
        inputs: [{ range: [0, 1] }],
        outputs: [{ path: 'profile.settings.engine.katago.analysis_env.parameters.alpha' }],
      },
    });
    const out = step(38)(blob);
    expect(out.profile.settings.knobs['qeubo.alpha'].domain).toBe('palette');
  });

  it('leaves a qeubo.* decl alone when its domain is some other valid value', () => {
    // Defensive: future hand-edited domains shouldn't be clobbered
    // by this migration. Only the specific `'qeubo'` → `'palette'`
    // rewrite is in scope.
    const blob = blobWithKnobs({
      'qeubo.alpha': {
        id: 'qeubo.alpha',
        domain: 'experimental',
        inputs: [{ range: [0, 1] }],
        outputs: [{ path: 'profile.settings.engine.katago.analysis_env.parameters.alpha' }],
      },
    });
    const out = step(38)(blob);
    expect(out.profile.settings.knobs['qeubo.alpha'].domain).toBe('experimental');
  });

  it('does not touch non-qeubo.* decls', () => {
    const blob = blobWithKnobs({
      'display.hue-offset': {
        id: 'display.hue-offset',
        domain: 'display',
        inputs: [{ range: [-180, 180] }],
        outputs: [{ path: 'profile.settings.appearance.intensityHueShift' }],
      },
    });
    const out = step(38)(blob);
    expect(out.profile.settings.knobs['display.hue-offset'].domain).toBe('display');
  });

  it('rewrites multiple qeubo.* decls in one pass', () => {
    const blob = blobWithKnobs({
      'qeubo.alpha': {
        id: 'qeubo.alpha',
        domain: 'qeubo',
        inputs: [{ range: [0, 1] }],
        outputs: [{ path: 'profile.settings.engine.katago.analysis_env.parameters.alpha' }],
      },
      'qeubo.beta': {
        id: 'qeubo.beta',
        domain: 'qeubo',
        inputs: [{ range: [-10, 10] }],
        outputs: [{ path: 'profile.settings.engine.katago.analysis_env.parameters.beta' }],
      },
      'display.brightness': {
        id: 'display.brightness',
        domain: 'display',
        inputs: [{ range: [0, 1] }],
        outputs: [{ path: 'appearance.brightness' }],
      },
    });
    const out = step(38)(blob);
    expect(out.profile.settings.knobs['qeubo.alpha'].domain).toBe('palette');
    expect(out.profile.settings.knobs['qeubo.beta'].domain).toBe('palette');
    expect(out.profile.settings.knobs['display.brightness'].domain).toBe('display');
  });

  it('is a no-op when profile.settings.knobs is absent (defensive)', () => {
    const blob: any = { profile: { settings: {} } };
    const out = step(38)(blob);
    expect(out.profile.settings).toEqual({});
  });

  it('is a no-op when knobs is not a plain object', () => {
    const blob = blobWithKnobs([] as unknown as Record<string, unknown>);
    const out = step(38)(blob);
    expect(out.profile.settings.knobs).toEqual([]);
  });
});

// ── Per-migration: 39 → 40 ──────────────────────────────────────────

describe('39 → 40: Phase 6 magic-literals sweep (3 preference scalars)', () => {
  function blobWithSettings(extra: Record<string, unknown> = {}): any {
    return {
      profile: {
        settings: {
          appearance: {},
          engine: { katago: {} },
          knobs: {},
          ...extra,
        },
      },
    };
  }

  it('seeds ownershipDeadbandThreshold default 0.05 when absent', () => {
    const out = step(39)(blobWithSettings());
    expect(out.profile.settings.appearance.ownershipDeadbandThreshold).toBe(0.05);
  });

  it('preserves pre-existing ownershipDeadbandThreshold', () => {
    const blob = blobWithSettings();
    blob.profile.settings.appearance.ownershipDeadbandThreshold = 0.1;
    const out = step(39)(blob);
    expect(out.profile.settings.appearance.ownershipDeadbandThreshold).toBe(0.1);
  });

  it('seeds livenessThreshold default 0.3 when absent', () => {
    const out = step(39)(blobWithSettings());
    expect(out.profile.settings.appearance.livenessThreshold).toBe(0.3);
  });

  it('preserves pre-existing livenessThreshold', () => {
    const blob = blobWithSettings();
    blob.profile.settings.appearance.livenessThreshold = 0.5;
    const out = step(39)(blob);
    expect(out.profile.settings.appearance.livenessThreshold).toBe(0.5);
  });

  it('seeds watchdogLatencyThresholdMs default 500 when absent', () => {
    const out = step(39)(blobWithSettings());
    expect(out.profile.settings.engine.katago.watchdogLatencyThresholdMs).toBe(500);
  });

  it('preserves pre-existing watchdogLatencyThresholdMs', () => {
    const blob = blobWithSettings();
    blob.profile.settings.engine.katago.watchdogLatencyThresholdMs = 750;
    const out = step(39)(blob);
    expect(out.profile.settings.engine.katago.watchdogLatencyThresholdMs).toBe(750);
  });

  it('coerces non-number leaves to defaults', () => {
    const blob = blobWithSettings();
    blob.profile.settings.appearance.ownershipDeadbandThreshold = 'corrupt';
    blob.profile.settings.appearance.livenessThreshold = null;
    blob.profile.settings.engine.katago.watchdogLatencyThresholdMs = false;
    const out = step(39)(blob);
    expect(out.profile.settings.appearance.ownershipDeadbandThreshold).toBe(0.05);
    expect(out.profile.settings.appearance.livenessThreshold).toBe(0.3);
    expect(out.profile.settings.engine.katago.watchdogLatencyThresholdMs).toBe(500);
  });

  it('seeds the three KnobDecls when knobs is empty', () => {
    const out = step(39)(blobWithSettings());
    expect(Object.keys(out.profile.settings.knobs).sort()).toEqual([
      'display.liveness-threshold',
      'display.ownership-deadband-threshold',
      'engine.watchdog-latency-threshold-ms',
    ]);
  });

  it('seeds each KnobDecl with the correct path and domain', () => {
    const out = step(39)(blobWithSettings());
    const knobs = out.profile.settings.knobs;
    expect(knobs['display.ownership-deadband-threshold']).toMatchObject({
      id: 'display.ownership-deadband-threshold',
      domain: 'display',
      inputs: [{ range: [0, 1] }],
      outputs: [{ path: 'profile.settings.appearance.ownershipDeadbandThreshold' }],
    });
    expect(knobs['display.liveness-threshold']).toMatchObject({
      id: 'display.liveness-threshold',
      domain: 'display',
      inputs: [{ range: [0, 1] }],
      outputs: [{ path: 'profile.settings.appearance.livenessThreshold' }],
    });
    expect(knobs['engine.watchdog-latency-threshold-ms']).toMatchObject({
      id: 'engine.watchdog-latency-threshold-ms',
      domain: 'engine',
      inputs: [{ range: [50, 5000] }],
      outputs: [{ path: 'profile.settings.engine.katago.watchdogLatencyThresholdMs' }],
    });
  });

  it('preserves a pre-existing KnobDecl under the same key', () => {
    const blob = blobWithSettings();
    blob.profile.settings.knobs['display.liveness-threshold'] = {
      id: 'display.liveness-threshold',
      label: 'User-customised label',
      domain: 'display',
      inputs: [{ range: [0.1, 0.9] }],
      outputs: [{ path: 'profile.settings.appearance.livenessThreshold' }],
    };
    const out = step(39)(blob);
    expect(out.profile.settings.knobs['display.liveness-threshold'].label).toBe(
      'User-customised label',
    );
    // The other two seeds still land.
    expect(out.profile.settings.knobs['display.ownership-deadband-threshold']).toBeDefined();
    expect(out.profile.settings.knobs['engine.watchdog-latency-threshold-ms']).toBeDefined();
  });

  it('is a no-op when profile.settings is absent (defensive)', () => {
    const blob: any = { profile: {} };
    const out = step(39)(blob);
    expect(out.profile).toEqual({});
  });
});

// ── Per-migration: 40 → 41 ──────────────────────────────────────────

describe('40 → 41: KnobDecl priority backfill (toolbar quick-access)', () => {
  function blobWithKnobs(knobs: Record<string, unknown>): any {
    return { profile: { settings: { knobs } } };
  }

  function seededDecl(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id,
      domain: 'display',
      inputs: [{ range: [0, 1] }],
      outputs: [{ path: `profile.settings.placeholder.${id}` }],
      ...extra,
    };
  }

  it('seeds priority 0 on display.move-filter-threshold', () => {
    const blob = blobWithKnobs({
      'display.move-filter-threshold': seededDecl('display.move-filter-threshold'),
    });
    const out = step(40)(blob);
    expect(out.profile.settings.knobs['display.move-filter-threshold'].priority).toBe(0);
  });

  it('seeds priority 10 / 20 / 30 / 40 on the display siblings', () => {
    const blob = blobWithKnobs({
      'display.ownership-opacity-ceiling': seededDecl('display.ownership-opacity-ceiling'),
      'display.ownership-deadband-threshold': seededDecl('display.ownership-deadband-threshold'),
      'display.liveness-threshold': seededDecl('display.liveness-threshold'),
      'display.hue-offset': seededDecl('display.hue-offset'),
    });
    const out = step(40)(blob);
    expect(out.profile.settings.knobs['display.ownership-opacity-ceiling'].priority).toBe(10);
    expect(out.profile.settings.knobs['display.ownership-deadband-threshold'].priority).toBe(20);
    expect(out.profile.settings.knobs['display.liveness-threshold'].priority).toBe(30);
    expect(out.profile.settings.knobs['display.hue-offset'].priority).toBe(40);
  });

  it('seeds priority 50 / 60 on the engine siblings', () => {
    const blob = blobWithKnobs({
      'engine.watchdog-animation-ms': seededDecl('engine.watchdog-animation-ms'),
      'engine.watchdog-latency-threshold-ms': seededDecl('engine.watchdog-latency-threshold-ms'),
    });
    const out = step(40)(blob);
    expect(out.profile.settings.knobs['engine.watchdog-animation-ms'].priority).toBe(50);
    expect(out.profile.settings.knobs['engine.watchdog-latency-threshold-ms'].priority).toBe(60);
  });

  it('preserves a pre-existing finite priority', () => {
    const blob = blobWithKnobs({
      'display.move-filter-threshold': seededDecl('display.move-filter-threshold', {
        priority: 99,
      }),
    });
    const out = step(40)(blob);
    expect(out.profile.settings.knobs['display.move-filter-threshold'].priority).toBe(99);
  });

  it('overwrites a non-finite priority with the default', () => {
    const blob = blobWithKnobs({
      'display.move-filter-threshold': seededDecl('display.move-filter-threshold', {
        priority: 'corrupt',
      }),
    });
    const out = step(40)(blob);
    expect(out.profile.settings.knobs['display.move-filter-threshold'].priority).toBe(0);
  });

  it('leaves runtime-added knobs without priority (e.g. qeubo.<name>)', () => {
    const blob = blobWithKnobs({
      'qeubo.alpha': seededDecl('qeubo.alpha', { domain: 'palette' }),
    });
    const out = step(40)(blob);
    expect(out.profile.settings.knobs['qeubo.alpha'].priority).toBeUndefined();
  });

  it('does not touch non-knob structure on profile.settings', () => {
    const blob = blobWithKnobs({
      'display.move-filter-threshold': seededDecl('display.move-filter-threshold'),
    });
    blob.profile.settings.appearance = { ownershipOpacityCeiling: 0.7 };
    const out = step(40)(blob);
    expect(out.profile.settings.appearance.ownershipOpacityCeiling).toBe(0.7);
  });

  it('is a no-op when knobs is absent (defensive)', () => {
    const blob: any = { profile: { settings: {} } };
    const out = step(40)(blob);
    expect(out.profile.settings).toEqual({});
  });

  it('is a no-op when knobs is not a plain object', () => {
    const blob = blobWithKnobs([] as unknown as Record<string, unknown>);
    const out = step(40)(blob);
    expect(out.profile.settings.knobs).toEqual([]);
  });
});

// ── Per-migration: 41 → 42 ──────────────────────────────────────────

describe('41 → 42: KataGo report-cadence registry promotion', () => {
  function blobWithKatago(katago: Record<string, unknown>, knobs: Record<string, unknown> = {}): any {
    return { profile: { settings: { engine: { katago }, knobs } } };
  }

  it('backfills reportDuringSearchEvery default 0.15 when absent', () => {
    const blob = blobWithKatago({});
    const out = step(41)(blob);
    expect(out.profile.settings.engine.katago.reportDuringSearchEvery).toBe(0.15);
  });

  it('backfills firstReportDuringSearchAfter default 0.05 when absent', () => {
    const blob = blobWithKatago({});
    const out = step(41)(blob);
    expect(out.profile.settings.engine.katago.firstReportDuringSearchAfter).toBe(0.05);
  });

  it('preserves a pre-existing finite reportDuringSearchEvery', () => {
    const blob = blobWithKatago({ reportDuringSearchEvery: 0.4 });
    const out = step(41)(blob);
    expect(out.profile.settings.engine.katago.reportDuringSearchEvery).toBe(0.4);
  });

  it('preserves a pre-existing finite firstReportDuringSearchAfter', () => {
    const blob = blobWithKatago({ firstReportDuringSearchAfter: 0.2 });
    const out = step(41)(blob);
    expect(out.profile.settings.engine.katago.firstReportDuringSearchAfter).toBe(0.2);
  });

  it('seeds the engine.report-during-search-every KnobDecl', () => {
    const blob = blobWithKatago({});
    const out = step(41)(blob);
    const decl = out.profile.settings.knobs['engine.report-during-search-every'];
    expect(decl).toBeDefined();
    expect(decl.id).toBe('engine.report-during-search-every');
    expect(decl.domain).toBe('engine');
    expect(decl.inputs[0].range).toEqual([0.01, 4.0]);
    expect(decl.outputs[0].path).toBe('profile.settings.engine.katago.reportDuringSearchEvery');
    expect(decl.priority).toBe(70);
  });

  it('seeds the engine.first-report-during-search-after KnobDecl with maxFromKnob bound', () => {
    const blob = blobWithKatago({});
    const out = step(41)(blob);
    const decl = out.profile.settings.knobs['engine.first-report-during-search-after'];
    expect(decl).toBeDefined();
    expect(decl.id).toBe('engine.first-report-during-search-after');
    expect(decl.domain).toBe('engine');
    expect(decl.inputs[0].range).toEqual([0.01, 4.0]);
    expect(decl.inputs[0].maxFromKnob).toBe('engine.report-during-search-every');
    expect(decl.outputs[0].path).toBe('profile.settings.engine.katago.firstReportDuringSearchAfter');
    expect(decl.priority).toBe(80);
  });

  it('preserves a pre-existing KnobDecl entry verbatim (no clobber)', () => {
    const customDecl = {
      id: 'engine.report-during-search-every',
      label: 'Custom user label',
      domain: 'engine',
      inputs: [{ range: [0.05, 2.0] }],
      outputs: [{ path: 'profile.settings.engine.katago.reportDuringSearchEvery' }],
      priority: 5,
    };
    const blob = blobWithKatago({}, { 'engine.report-during-search-every': customDecl });
    const out = step(41)(blob);
    expect(out.profile.settings.knobs['engine.report-during-search-every']).toEqual(customDecl);
  });

  it('is a no-op when engine.katago is absent (defensive)', () => {
    const blob: any = { profile: { settings: {} } };
    const out = step(41)(blob);
    expect(out.profile.settings).toEqual({});
  });

  it('seeds knobs even when only katago is present (asymmetric absence)', () => {
    const blob: any = { profile: { settings: { engine: { katago: {} } } } };
    const out = step(41)(blob);
    expect(out.profile.settings.engine.katago.reportDuringSearchEvery).toBe(0.15);
    expect(out.profile.settings.engine.katago.firstReportDuringSearchAfter).toBe(0.05);
    // No knobs container -> no decls seeded
    expect(out.profile.settings.knobs).toBeUndefined();
  });
});

// ── Per-migration: 42 → 43 ──────────────────────────────────────────

describe('42 → 43: KataGo first-report-after upstream-cliff floor', () => {
  function blobWithKnobs(knobs: Record<string, unknown>): any {
    return { profile: { settings: { knobs } } };
  }

  function firstReportDecl(extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 'engine.first-report-during-search-after',
      label: 'First report after (s)',
      domain: 'engine',
      inputs: [{
        range: [0.01, 4.0],
        maxFromKnob: 'engine.report-during-search-every',
        ...extra,
      }],
      outputs: [{ path: 'profile.settings.engine.katago.firstReportDuringSearchAfter' }],
      priority: 80,
    };
  }

  it('adds minFloor=0.035 to the first-report-after decl when absent', () => {
    const blob = blobWithKnobs({
      'engine.first-report-during-search-after': firstReportDecl(),
    });
    const out = step(42)(blob);
    const inputs = out.profile.settings.knobs['engine.first-report-during-search-after'].inputs;
    expect(inputs[0].minFloor).toBe(0.035);
  });

  it('preserves a pre-existing finite minFloor (idempotency)', () => {
    const blob = blobWithKnobs({
      'engine.first-report-during-search-after': firstReportDecl({ minFloor: 0.05 }),
    });
    const out = step(42)(blob);
    const inputs = out.profile.settings.knobs['engine.first-report-during-search-after'].inputs;
    expect(inputs[0].minFloor).toBe(0.05);
  });

  it('overwrites a non-numeric minFloor (defensive against malformed blobs)', () => {
    const blob = blobWithKnobs({
      'engine.first-report-during-search-after': firstReportDecl({ minFloor: 'oops' }),
    });
    const out = step(42)(blob);
    const inputs = out.profile.settings.knobs['engine.first-report-during-search-after'].inputs;
    expect(inputs[0].minFloor).toBe(0.035);
  });

  it('overwrites a NaN minFloor (defensive against bad serialisation)', () => {
    const blob = blobWithKnobs({
      'engine.first-report-during-search-after': firstReportDecl({ minFloor: Number.NaN }),
    });
    const out = step(42)(blob);
    const inputs = out.profile.settings.knobs['engine.first-report-during-search-after'].inputs;
    expect(inputs[0].minFloor).toBe(0.035);
  });

  it('preserves the maxFromKnob and outputs on the touched decl', () => {
    const blob = blobWithKnobs({
      'engine.first-report-during-search-after': firstReportDecl(),
    });
    const out = step(42)(blob);
    const decl = out.profile.settings.knobs['engine.first-report-during-search-after'];
    expect(decl.inputs[0].maxFromKnob).toBe('engine.report-during-search-every');
    expect(decl.outputs[0].path).toBe('profile.settings.engine.katago.firstReportDuringSearchAfter');
    expect(decl.priority).toBe(80);
  });

  it('is a no-op when the first-report-after decl is absent', () => {
    const blob = blobWithKnobs({
      // A user whose cadence-knobs migration never ran (improbable
      // but possible for hand-edited blobs); the floor migration
      // has nothing to touch and leaves the registry alone.
      'engine.report-during-search-every': {
        id: 'engine.report-during-search-every',
        domain: 'engine',
        inputs: [{ range: [0.01, 4.0] }],
        outputs: [{ path: 'profile.settings.engine.katago.reportDuringSearchEvery' }],
      },
    });
    const out = step(42)(blob);
    expect(out.profile.settings.knobs['engine.first-report-during-search-after']).toBeUndefined();
    // Sibling decl untouched.
    expect(out.profile.settings.knobs['engine.report-during-search-every']).toBeDefined();
  });

  it('is a no-op when the first-report-after decl has no inputs array', () => {
    const blob = blobWithKnobs({
      'engine.first-report-during-search-after': {
        id: 'engine.first-report-during-search-after',
        domain: 'engine',
        outputs: [{ path: 'profile.settings.engine.katago.firstReportDuringSearchAfter' }],
      },
    });
    const out = step(42)(blob);
    const decl = out.profile.settings.knobs['engine.first-report-during-search-after'];
    expect((decl as { inputs?: unknown }).inputs).toBeUndefined();
  });

  it('is a no-op when the knobs container is absent (legacy blob)', () => {
    const blob: any = { profile: { settings: {} } };
    const out = step(42)(blob);
    expect(out.profile.settings.knobs).toBeUndefined();
  });

  it('does not touch unrelated decls', () => {
    const cadenceDecl = {
      id: 'engine.report-during-search-every',
      domain: 'engine',
      inputs: [{ range: [0.01, 4.0] }],
      outputs: [{ path: 'profile.settings.engine.katago.reportDuringSearchEvery' }],
      priority: 70,
    };
    const blob = blobWithKnobs({
      'engine.report-during-search-every': cadenceDecl,
      'engine.first-report-during-search-after': firstReportDecl(),
    });
    const out = step(42)(blob);
    expect(out.profile.settings.knobs['engine.report-during-search-every']).toEqual(cadenceDecl);
  });
});

// ── Per-migration: 43 → 44 ──────────────────────────────────────────

describe('43 → 44: session.ui.loadSgfAtLastNode boolean backfill', () => {
  function blobWithUi(ui: Record<string, unknown>): any {
    return { session: { ui } };
  }

  it('backfills loadSgfAtLastNode=false when absent', () => {
    const blob = blobWithUi({});
    const out = step(43)(blob);
    expect(out.session.ui.loadSgfAtLastNode).toBe(false);
  });

  it('preserves a pre-existing true value', () => {
    const blob = blobWithUi({ loadSgfAtLastNode: true });
    const out = step(43)(blob);
    expect(out.session.ui.loadSgfAtLastNode).toBe(true);
  });

  it('preserves a pre-existing false value', () => {
    const blob = blobWithUi({ loadSgfAtLastNode: false });
    const out = step(43)(blob);
    expect(out.session.ui.loadSgfAtLastNode).toBe(false);
  });

  it('overwrites a non-boolean stored value (defensive)', () => {
    const blob = blobWithUi({ loadSgfAtLastNode: 'oops' });
    const out = step(43)(blob);
    expect(out.session.ui.loadSgfAtLastNode).toBe(false);
  });

  it('does not touch sibling session.ui fields', () => {
    const blob = blobWithUi({
      showStoneMoveNumbers: true,
      moveFilterThreshold: 0.1,
    });
    const out = step(43)(blob);
    expect(out.session.ui.showStoneMoveNumbers).toBe(true);
    expect(out.session.ui.moveFilterThreshold).toBe(0.1);
    expect(out.session.ui.loadSgfAtLastNode).toBe(false);
  });

  it('is a no-op when session.ui is absent (legacy blob)', () => {
    const blob: any = { session: {} };
    const out = step(43)(blob);
    expect(out.session.ui).toBeUndefined();
  });

  it('is a no-op when session is absent (very-legacy blob)', () => {
    const blob: any = {};
    const out = step(43)(blob);
    expect(out.session).toBeUndefined();
  });
});

describe('56 → 57: qEUBO bookmark parameters Record<string,number> → Record<KnobId,number[]>', () => {
  it('reshapes a flat bookmark to qeubo-prefixed keys with length-1 vectors', () => {
    const blob: any = {
      profile: {
        qeuboPinnedBookmarks: [
          { id: 'bm-a', name: 'a', createdAt: 0, parameters: { alpha: 0.4, beta: 0.7 } },
        ],
      },
    };
    const out = step(56)(blob);
    expect(out.profile.qeuboPinnedBookmarks[0].parameters).toEqual({
      'qeubo.alpha': [0.4],
      'qeubo.beta': [0.7],
    });
  });

  it('reshapes every bookmark in the list independently', () => {
    const blob: any = {
      profile: {
        qeuboPinnedBookmarks: [
          { id: 'bm-a', name: 'a', createdAt: 0, parameters: { alpha: 0.1 } },
          { id: 'bm-b', name: 'b', createdAt: 1, parameters: { gamma: 0.9 } },
        ],
      },
    };
    const out = step(56)(blob);
    expect(out.profile.qeuboPinnedBookmarks[0].parameters).toEqual({ 'qeubo.alpha': [0.1] });
    expect(out.profile.qeuboPinnedBookmarks[1].parameters).toEqual({ 'qeubo.gamma': [0.9] });
  });

  it('is idempotent — an already-reshaped bookmark is preserved verbatim', () => {
    const blob: any = {
      profile: {
        qeuboPinnedBookmarks: [
          { id: 'bm-a', name: 'a', createdAt: 0, parameters: { 'qeubo.alpha': [0.4] } },
        ],
      },
    };
    const out = step(56)(blob);
    expect(out.profile.qeuboPinnedBookmarks[0].parameters).toEqual({ 'qeubo.alpha': [0.4] });
  });

  it('handles an empty parameters map', () => {
    const blob: any = {
      profile: {
        qeuboPinnedBookmarks: [{ id: 'bm-a', name: 'a', createdAt: 0, parameters: {} }],
      },
    };
    const out = step(56)(blob);
    expect(out.profile.qeuboPinnedBookmarks[0].parameters).toEqual({});
  });

  it('is a no-op when qeuboPinnedBookmarks is absent (legacy blob)', () => {
    const blob: any = { profile: {} };
    const out = step(56)(blob);
    expect(out.profile.qeuboPinnedBookmarks).toBeUndefined();
  });

  it('is a no-op when profile is absent (very-legacy blob)', () => {
    const blob: any = {};
    const out = step(56)(blob);
    expect(out.profile).toBeUndefined();
  });
});

describe('57 → 58: strip stale profile.knownTags (moved to non-persisted GlobalStore field)', () => {
  it('deletes profile.knownTags when present', () => {
    const blob: any = {
      profile: { username: 'u', knownTags: ['$mistake', 'fuseki'], cardSets: {} },
    };
    const out = step(57)(blob);
    expect('knownTags' in out.profile).toBe(false);
    // Sibling profile fields are preserved.
    expect(out.profile.username).toBe('u');
    expect(out.profile.cardSets).toEqual({});
  });

  it('is idempotent — a no-op when profile.knownTags is already absent', () => {
    const blob: any = { profile: { username: 'u' } };
    const out = step(57)(blob);
    expect('knownTags' in out.profile).toBe(false);
    expect(out.profile.username).toBe('u');
  });

  it('is a no-op when profile is absent (legacy/partial blob)', () => {
    const blob: any = { session: {} };
    const out = step(57)(blob);
    expect(out.profile).toBeUndefined();
  });

  it('walks end-to-end: a v57 blob with profile.knownTags reaches CURRENT with the key gone', () => {
    const blob: any = {
      schemaVersion: 57,
      profile: { username: 'u', knownTags: ['x'], cardSets: {} },
    };
    const out = migrate(blob);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect('knownTags' in out.profile).toBe(false);
  });
});

describe('58 → 59: re-scope forestNav.selection per-board (board-scope audit P0)', () => {
  it('drops a global NavSelection, replacing it with an empty per-board map', () => {
    const blob: any = {
      session: {
        ui: { forestNav: { expanded: ['game:1'], selection: { kind: 'root', rootCardId: 7 } } },
      },
    };
    const out = step(58)(blob);
    expect(out.session.ui.forestNav.selection).toEqual({});
    // The global expansion axis is untouched.
    expect(out.session.ui.forestNav.expanded).toEqual(['game:1']);
  });

  it('drops a null selection to an empty map', () => {
    const blob: any = { session: { ui: { forestNav: { expanded: [], selection: null } } } };
    const out = step(58)(blob);
    expect(out.session.ui.forestNav.selection).toEqual({});
  });

  it('is idempotent — preserves an already per-board selection map', () => {
    const perBoard = { 'board-a': { kind: 'root', rootCardId: 3 } };
    const blob: any = { session: { ui: { forestNav: { expanded: [], selection: perBoard } } } };
    const out = step(58)(blob);
    expect(out.session.ui.forestNav.selection).toEqual(perBoard);
  });

  it('is a no-op when forestNav is absent (pre-schema-21 / partial blob)', () => {
    const blob: any = { session: { ui: {} } };
    const out = step(58)(blob);
    expect(out.session.ui.forestNav).toBeUndefined();
  });

  it('walks end-to-end: a v58 blob with a global selection reaches CURRENT with a per-board map', () => {
    const blob: any = {
      schemaVersion: 58,
      session: { ui: { forestNav: { expanded: [], selection: { kind: 'game', gameSourceId: 2 } } } },
    };
    const out = migrate(blob);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.session.ui.forestNav.selection).toEqual({});
  });
});

describe('59 → 60: re-apply the wrong-path backfills (valueBinding + moveSuggestionsFadeMs)', () => {
  // The corrective for the archived 45 → 46 / 46 → 47 silent no-ops
  // (item `archived-migration-wrong-path-corrective`). Both leaves are
  // written through the witnessed parent container at the CORRECT
  // `profile.settings.…` path.
  function blobWithContainers(): any {
    return {
      profile: {
        settings: {
          appearance: {},
          engine: { katago: { adaptiveReevaluate: { enabled: false } } },
        },
      },
    };
  }

  it("backfills valueBinding = '' when the leaf is absent", () => {
    const out = step(59)(blobWithContainers());
    expect(out.profile.settings.engine.katago.adaptiveReevaluate.valueBinding).toBe('');
  });

  it('backfills moveSuggestionsFadeMs = 60 when the leaf is absent', () => {
    const out = step(59)(blobWithContainers());
    expect(out.profile.settings.appearance.moveSuggestionsFadeMs).toBe(60);
  });

  it('preserves a pre-existing string valueBinding (idempotent / hand-edited)', () => {
    const blob = blobWithContainers();
    blob.profile.settings.engine.katago.adaptiveReevaluate.valueBinding = 'learned_v1';
    const out = step(59)(blob);
    expect(out.profile.settings.engine.katago.adaptiveReevaluate.valueBinding).toBe('learned_v1');
  });

  it('preserves a pre-existing numeric moveSuggestionsFadeMs', () => {
    const blob = blobWithContainers();
    blob.profile.settings.appearance.moveSuggestionsFadeMs = 0;
    const out = step(59)(blob);
    expect(out.profile.settings.appearance.moveSuggestionsFadeMs).toBe(0);
  });

  it('replaces a non-string valueBinding / non-numeric fade with the defaults', () => {
    const blob = blobWithContainers();
    blob.profile.settings.engine.katago.adaptiveReevaluate.valueBinding = 42;
    blob.profile.settings.appearance.moveSuggestionsFadeMs = 'fast';
    const out = step(59)(blob);
    expect(out.profile.settings.engine.katago.adaptiveReevaluate.valueBinding).toBe('');
    expect(out.profile.settings.appearance.moveSuggestionsFadeMs).toBe(60);
  });

  it('is a no-op when the adaptiveReevaluate container is absent (partial blob)', () => {
    // The witnessed parent path resolves against the runtime shape, but
    // the blob-side leg returns undefined for an absent container, so the
    // body no-ops — same tolerance the broken bodies intended.
    const blob: any = { profile: { settings: { appearance: {} } } };
    const out = step(59)(blob);
    expect(out.profile.settings.engine).toBeUndefined();
    // The other backfill still runs on its present container.
    expect(out.profile.settings.appearance.moveSuggestionsFadeMs).toBe(60);
  });

  it('is a no-op when profile is absent (very-legacy blob)', () => {
    const blob: any = { session: {} };
    const out = step(59)(blob);
    expect(out.profile).toBeUndefined();
  });

  it('walks end-to-end: a v59 blob reaches CURRENT with both leaves backfilled', () => {
    const blob: any = {
      schemaVersion: 59,
      profile: {
        settings: {
          appearance: {},
          engine: { katago: { adaptiveReevaluate: { enabled: false } } },
        },
      },
    };
    const out = migrate(blob);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.profile.settings.engine.katago.adaptiveReevaluate.valueBinding).toBe('');
    expect(out.profile.settings.appearance.moveSuggestionsFadeMs).toBe(60);
  });
});

describe('60 → 61: backfill engine.katago.calibrationVisits', () => {
  // The new default visit budget for mint-time komi calibration. Written
  // through the witnessed `profile.settings.engine.katago` parent
  // container; default 1000.
  function blobWithKatago(): any {
    return {
      profile: { settings: { engine: { katago: { url: 'ws://x' } } } },
    };
  }

  it('backfills calibrationVisits = 1000 when the leaf is absent', () => {
    const out = step(60)(blobWithKatago());
    expect(out.profile.settings.engine.katago.calibrationVisits).toBe(1000);
  });

  it('preserves a pre-existing numeric calibrationVisits (idempotent / hand-edited)', () => {
    const blob = blobWithKatago();
    blob.profile.settings.engine.katago.calibrationVisits = 2500;
    const out = step(60)(blob);
    expect(out.profile.settings.engine.katago.calibrationVisits).toBe(2500);
  });

  it('replaces a non-numeric calibrationVisits with the default', () => {
    const blob = blobWithKatago();
    blob.profile.settings.engine.katago.calibrationVisits = 'lots';
    const out = step(60)(blob);
    expect(out.profile.settings.engine.katago.calibrationVisits).toBe(1000);
  });

  it('is a no-op when the katago container is absent (partial blob)', () => {
    const blob: any = { profile: { settings: { engine: {} } } };
    const out = step(60)(blob);
    expect(out.profile.settings.engine.katago).toBeUndefined();
  });

  it('is a no-op when profile is absent (very-legacy blob)', () => {
    const blob: any = { session: {} };
    const out = step(60)(blob);
    expect(out.profile).toBeUndefined();
  });

  it('walks end-to-end: a v60 blob reaches CURRENT with calibrationVisits backfilled', () => {
    const blob: any = {
      schemaVersion: 60,
      profile: { settings: { engine: { katago: { url: 'ws://x' } } } },
    };
    const out = migrate(blob);
    expect(out.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(out.profile.settings.engine.katago.calibrationVisits).toBe(1000);
  });
});
