/**
 * src/store/defaults.ts
 * Pure constants — no Vue imports, no reactive state.
 */

import type { AppSettings, ProfileState, UISession, ProfileId, ThumbnailSettings, CardSet, KnobId } from '../types';
import { detectBrowserLocale } from '../i18n/locales';
import { KATAGO_FIRST_REPORT_FLOOR_S } from '../lib/timing';
// SFC-free panel-id SSOT (no Vue imports — keeps this module pure).
import { PANEL_ID } from '../components/charts/panel-ids';

export const NIL_UUID = '00000000-0000-0000-0000-000000000000';

export const defaultSettings = {
  engine: {
    katago: {
      url: 'ws://127.0.0.1:1242',
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
      // Auto-save toggle (see AppSettings.engine.katago.analysisAutoSave).
      // Default `false`: opt-in, per the experimental status of the
      // persistence feature. A user who wants continuous saves flips
      // it on via the registry editor (engine → katago →
      // analysisAutoSave), reads the inline `⚠` warning about
      // bandwidth / quota cost, and accepts the implication.
      analysisAutoSave: false,
      // Analysis-bundle wire-format choice. See
      // AppSettings.engine.katago.bundleCompressionScheme for the
      // contract. Default `'v1'` preserves the historical wire
      // shape — existing users see no behavioural change until
      // they explicitly opt into `'v2-projected'` via the
      // registry editor.
      bundleCompressionScheme: 'v1' as const,
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
        // v1.0.26 — Phase 3.5 learned-VF opt-in. Empty = the proxy's
        // built-in v1.0.24 worst-quantile allocation (no Phase 3
        // fields sent). User selects a `learned_*` version from the
        // dropdown when the proxy advertises one.
        valueBinding: '',
      },
      // Practical ceiling on ponder mode's maxVisits. The pre-v1.0.20
      // hardcoded ceiling of 100,000 was hit in seconds on weak
      // networks / CPU-only setups; 2,000,000 is the new default and
      // is user-tunable. See `AppSettings.engine.katago.ponderMaxVisits`
      // in `types.ts` for the three consumer sites and the v1.0.20
      // surfacing rationale.
      ponderMaxVisits: 2_000_000,
      // Watchdog ping-tandem animation duration (ms). Promoted from
      // the prior hardcoded 500ms keyframe in `Toolbar.vue` to a
      // registry leaf so users can tune the animation pacing. Bound
      // through the `engine.watchdog-animation-ms` KnobDecl. See
      // `AppSettings.engine.katago.watchdogAnimationMs` in `types.ts`
      // for the consumer-site reference.
      watchdogAnimationMs: 500,
      // Watchdog latency threshold (ms) — color-flip cutoff for the
      // un-animated watchdog mode. Promoted from Toolbar.vue's prior
      // `WATCHDOG_LATENCY_THRESHOLD_MS = 500` const during the
      // Phase-6 sweep. Bound through the
      // `engine.watchdog-latency-threshold-ms` KnobDecl. See
      // `AppSettings.engine.katago.watchdogLatencyThresholdMs`.
      watchdogLatencyThresholdMs: 500,
      // KataGo report-cadence registry leaves (2026-05-15 promotion).
      // The prior shape hardcoded 0.15 (ponder) and 0.5 (analyze) at
      // the two analysis-service construction sites; the single
      // registry-driven value applies to both modes per the
      // simplification choice recorded with the user. The
      // companion `firstReportDuringSearchAfter` closes the
      // perceived first-paint delay on fresh ponder queries.
      // Schema-version 41 → 42 backfills.
      reportDuringSearchEvery: 0.15,
      firstReportDuringSearchAfter: 0.05,
      // Default visit budget for mint-time komi calibration (the opt-in
      // pedagogical even-game feature). Spent on a one-shot evaluation
      // at mint time; never persisted onto the card. Prefills the
      // per-mint visits input in MintCardModal when the engine is
      // connected. Distinct from `minting.defaultVisits` (the per-card
      // analysis budget). See `AppSettings.engine.katago.calibrationVisits`
      // in `schema.ts`. Schema-version 60 → 61 introduces / backfills.
      calibrationVisits: 1000,
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
          // Perspective-naive raw root-eval swing across the move
          // boundary (spec's own documented design — see
          // `docs/archive/dispatch/frontend-to-frontend-default-palette-metrics-spec.md`
          // Part 2, "mandatory inclusion"). Alternates sign by mover
          // under the spec's assumed SIDETOMOVE framing; under this
          // profile's ACTUAL seeded framing (`overrideSettings.
          // reportAnalysisWinratesAs: 'WHITE'`, absolute White-favours-
          // positive across every packet — see the override's own
          // comment above and `engine/katago/winrate-framing.ts`'s
          // file header for the wire-framing contract this depends
          // on) it alternates sign by mover just the same, only for a
          // different mechanical reason (absolute framing, not a
          // per-packet re-origin). Left AS-SPECIFIED and dead (no
          // palette references it) rather than repointed in place —
          // see `scoreLead_root_loss` below for the corrected,
          // stably-signed sibling and its derivation.
          scoreLead_delta:  'x[1]["rootInfo"]["scoreLead"] - x[0]["rootInfo"]["scoreLead"]',
          // ── scoreLead_root_loss — the commissioner's root-delta loss (ledger rows 1380/1381/1383/1378) ──
          //
          // Rationale for existing (row 1380/1381, verbatim): "The
          // reason it *MUST* use the root deltas, is that often times
          // (especially with weaker players), the human players move
          // isn't even in the move list." `scoreLead_loss_topvsuser`
          // below reads `x[0]["userMoveInfo"]`, which is `None` (→ 0
          // loss) exactly when the user's move wasn't among the
          // engine's analysed candidates — the case a weak player's
          // move most often falls into. This symbol instead diffs the
          // ROOT eval before vs. after the move actually played, which
          // is defined for every move regardless of whether the
          // engine ever ranked it.
          //
          // Perspective derivation. `store.profile.settings.engine.
          // katago.overrideSettings.reportAnalysisWinratesAs` is
          // seeded `'WHITE'` (this file, above) — the wire framing
          // `extra.*` palette evaluation actually sees is therefore
          // ABSOLUTE (positive favours White on every packet,
          // regardless of who's to move), not the spec's assumed
          // per-packet SIDETOMOVE re-origin (see
          // `engine/katago/winrate-framing.ts`'s file-header comment:
          // "`extra.*`... are computed on the proxy in the wire's
          // framing before normalisation"). Under that ABSOLUTE
          // framing, `x[1].rootInfo.scoreLead - x[0].rootInfo.
          // scoreLead` (`scoreLead_delta` above) is the raw White-
          // signed swing caused by the move played between the two
          // packets — a "higher is worse" reading needs it corrected
          // to be positive whenever the MOVER's own position got
          // worse, for both colours:
          //
          //   - White to move (x[0].rootInfo.currentPlayer == 'W'):
          //     a bad White move REDUCES White's absolute scoreLead,
          //     so the raw swing is already negative-when-bad; loss
          //     = -(raw swing).
          //     Worked example: root.scoreLead = +5.0 (White ahead by
          //     5), White blunders, post-move root.scoreLead = +2.0.
          //     raw swing = 2.0 - 5.0 = -3.0. loss = -(-3.0) = +3.0
          //     (positive: a 3-point-worse move for White).
          //   - Black to move (x[0].rootInfo.currentPlayer == 'B'):
          //     a bad Black move INCREASES White's absolute scoreLead
          //     (Black gave ground), so the raw swing is already
          //     positive-when-bad; loss = +(raw swing).
          //     Worked example: root.scoreLead = +5.0 (White ahead by
          //     5, i.e. Black is behind and about to move), Black
          //     blunders further, post-move root.scoreLead = +8.0.
          //     raw swing = 8.0 - 5.0 = +3.0. loss = +3.0 (positive: a
          //     3-point-worse move for Black).
          //
          //   loss = -(raw swing) when White moves, +(raw swing) when
          //   Black moves — exactly `player_sign(x[0])` (defined
          //   above: +1.0 for Black to move, -1.0 for White to move)
          //   times the raw swing:
          //
          //     scoreLead_root_loss(x)
          //       = player_sign(x[0]) * (x[1].rootInfo.scoreLead - x[0].rootInfo.scoreLead)
          //
          // Minted as a NEW sibling rather than rewriting
          // `scoreLead_delta`'s body in place: `scoreLead_delta` is
          // documented spec-shipped content (Part 2, "mandatory
          // inclusion") with an intentionally perspective-naive
          // definition meant for the BSA pipeline's own per-colour
          // segregation treatment downstream — overwriting its body
          // would silently change what that documented, independently
          // named symbol means for any future consumer that reaches
          // for it by that name, for zero migration benefit (it's
          // currently dead — no `delta_fn`/`summary_fn`/`state_fn`
          // references it). A new name costs nothing (purely
          // additive seed expansion, migration 71 → 72) and reads
          // honestly on its own: "root scoreLead loss", paired
          // naturally with `scoreLead_loss_topvsuser`'s existing
          // `*_loss` naming idiom.
          scoreLead_root_loss:
            'player_sign(x[0]) * (x[1]["rootInfo"]["scoreLead"] - x[0]["rootInfo"]["scoreLead"])',
          winrate_loss_topvsuser:
            '(x[0]["moveInfos"][0]["winrate"] - x[0]["userMoveInfo"]["winrate"]) if x[0]["userMoveInfo"] else 0',
          // scoreLead_loss_topvsuser — TRUTH-IN-COMMENT (row 1383):
          // despite the `_topvsuser` name (and despite the spec's own
          // proposed body, `moveInfos[0].scoreLead - userMoveInfo.
          // scoreLead`, "top vs user" — see the spec's Part 3 Axis 1),
          // this shipped body compares the ROOT's scoreLead (the
          // pre-move position's overall evaluation) against the
          // user's OWN chosen move's predicted scoreLead
          // (`userMoveInfo`), sign-corrected by `player_sign(x[0])` —
          // i.e. "root vs user", not "top vs user". Gated entirely on
          // `x[0]["userMoveInfo"]` being present.
          // UNLISTED-MOVE BLIND: when the user's actual move wasn't
          // among the engine's analysed candidates (`userMoveInfo is
          // None` — disproportionately the case for weaker players'
          // moves, commissioner ruling rows 1380/1381), this returns
          // a flat `0`, i.e. "no loss" — indistinguishable from
          // having played the engine's own top choice. This is the
          // blind spot `scoreLead_root_loss` (above) exists to avoid;
          // the 'score' palette's `delta_fn` now points at
          // `scoreLead_root_loss` instead (migration 71 → 72). Key
          // kept as-is rather than renamed: renaming risks stranding
          // any user profile that hand-authored a palette or
          // downstream reference against this exact symbol name
          // (PaletteEditor lets users type arbitrary `delta_fn`
          // strings referencing any symbol by name); a truthful
          // comment is the cheaper honest fix and costs no migration.
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
          median_summary:   'float(median(x))',
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
            delta_ordering: 'lower_is_worse',
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
            delta_ordering: 'lower_is_worse',
            summary_fn: 'median_summary',
            state_fns: {
              'Complexity':      'complexity',
              'Win Probability': 'winrate',
              'Score Advantage': 'score_lead',
            }
          },
          // Palette B — root-delta loss (commissioner ruling, ledger
          // rows 1380/1381/1383/1378): the ROOT-EVAL swing the move
          // actually caused, correctly signed for whichever colour
          // moved (see `scoreLead_root_loss`'s derivation comment
          // above the symbol definition). Defined for every move,
          // including ones the engine's search never listed as a
          // candidate — the case `scoreLead_loss_topvsuser` reads as
          // a flat, wrong `0`. `mean_summary` is the natural
          // aggregator for a positive-only loss metric.
          {
            id: 'score',
            name: 'Score Loss',
            delta_fn: 'scoreLead_root_loss',
            delta_ordering: 'higher_is_worse',
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
            delta_ordering: 'lower_is_worse',
            summary_fn: 'mean_summary',
            state_fns: {
              'Complexity':      'complexity',
              'Win Probability': 'winrate',
            }
          }
        ],
        activePaletteId: 'score'
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
  appearance:  {
    theme: 'cluster',
    // Opt-in high-contrast text override for the cluster theme. Default
    // off — OFF state must render identically to today. See
    // `AppSettings.appearance.highContrastText` in `schema.ts` for the
    // full rationale. Schema 62 → 63 backfills `false`.
    highContrastText: false,
    // MiniBoard thumbnail renderer (analysis preview boards + heatmap preview).
    // 'svg' (default) preserves the pre-split declarative SVG; 'canvas' is the
    // ADR-0010 canvas variant (lighter paint/jank). User-selectable in the
    // RegistryEditor; MiniBoard.vue dispatches. Schema 55 → 56 backfills 'svg'.
    miniBoardRenderer: 'svg',
    intensityHueShift: -43,
    // Ceiling on the territory-overlay opacity in BoardWidget.vue's
    // `ownershipColor`. Promoted from a hardcoded 0.55 literal to a
    // registry leaf so users can tune it. Bound through the
    // `display.ownership-opacity-ceiling` KnobDecl. See
    // `AppSettings.appearance.ownershipOpacityCeiling` in `types.ts`.
    ownershipOpacityCeiling: 0.55,
    // Dead-band threshold below which the ownership overlay paints
    // transparent. Promoted from BoardWidget.vue's prior `0.05`
    // literal during the Phase-6 sweep. Bound through the
    // `display.ownership-deadband-threshold` KnobDecl.
    ownershipDeadbandThreshold: 0.05,
    // Liveness-marker threshold for the dead-stone overlay.
    // Promoted from BoardWidget.vue's prior `LIVENESS_THRESHOLD =
    // 0.3` const during the Phase-6 sweep. Bound through the
    // `display.liveness-threshold` KnobDecl.
    livenessThreshold: 0.3,
    // 60ms preserves the prior hardcoded inline `transition: opacity
    // 60ms ease` behaviour of MoveSuggestions.vue. See types.ts comment.
    moveSuggestionsFadeMs: 60,
    // Mistake-finder threshold (worst-quantile per-board). 0.15
    // shows the worst 15% of moves as dots on the delta chart.
    // Set to 0 to disable the overlay.
    mistakeFinderThresholdQuantile: 0.15,
    locale: detectBrowserLocale(),
  },
  minting: {
    defaultVisits: 1000,
    defaultNumMoves: 1,
    defaultPaletteId: 'active',
    defaultGamma: 0.9,
  },
  navigation: {
    actionOnDirtyBoard: 'ask', // 'ask', 'new', or 'overwrite'
  },
  // Knob-registry substrate (knob-registry-plan Phases 1 + 3a). The
  // four motivating-scalar KnobDecls were promoted from inline
  // literals during Phase 3a; defaults seed them here, and the
  // schema-version 36 → 37 migration backfills them on persisted
  // blobs. See `docs/notes/knob-registry-plan.md` §11 Phase 3.
  knobs: {
    // Priority ordering — smaller renders first. Move-filter
    // threshold gets 0 (the most-likely-used knob per the
    // toolbar-popover-quick-access ask 2026-05-14); the rest
    // follow in rough use-frequency order. Gaps of 10 allow
    // future knobs to slot between without renumbering.
    'display.move-filter-threshold': {
      id: 'display.move-filter-threshold',
      label: 'Move-suggestion filter threshold',
      domain: 'display',
      inputs: [{ range: [0, 1] as const }],
      outputs: [{ path: 'session.ui.moveFilterThreshold' }],
      priority: 0,
    },
    'display.ownership-opacity-ceiling': {
      id: 'display.ownership-opacity-ceiling',
      label: 'Ownership overlay opacity',
      domain: 'display',
      inputs: [{ range: [0, 1] as const }],
      outputs: [{ path: 'profile.settings.appearance.ownershipOpacityCeiling' }],
      priority: 10,
    },
    'display.ownership-deadband-threshold': {
      id: 'display.ownership-deadband-threshold',
      label: 'Ownership overlay dead-band',
      domain: 'display',
      inputs: [{ range: [0, 1] as const }],
      outputs: [{ path: 'profile.settings.appearance.ownershipDeadbandThreshold' }],
      priority: 20,
    },
    'display.liveness-threshold': {
      id: 'display.liveness-threshold',
      label: 'Liveness marker threshold',
      domain: 'display',
      inputs: [{ range: [0, 1] as const }],
      outputs: [{ path: 'profile.settings.appearance.livenessThreshold' }],
      priority: 30,
    },
    'display.hue-offset': {
      id: 'display.hue-offset',
      label: 'Hue offset',
      domain: 'display',
      inputs: [{ range: [-180, 180] as const }],
      outputs: [{ path: 'profile.settings.appearance.intensityHueShift' }],
      priority: 40,
    },
    // Animation-duration knob (promoted from an inline magic literal
    // by the user 2026-05-22). Range [0, …] permits an explicit "off"
    // position; setting to 0 disables the corresponding ease
    // transition (the CSS interprets `0ms ease` as a no-op).
    //
    // The sibling PV-fade knob (`display.pv-fade-ms`, priority 47)
    // that used to sit here was removed (wiki2-pv-fade-knob): CSS
    // transitions were banned and purged from `frontend/src`, which
    // left the knob controlling only inert JS-scheduling padding with
    // no observable effect. See `use-pv-animation.ts`'s file header.
    'display.move-suggestions-fade-ms': {
      id: 'display.move-suggestions-fade-ms',
      label: 'Move-suggestion fade (ms)',
      domain: 'display',
      inputs: [{ range: [0, 200] as const }],
      outputs: [{ path: 'profile.settings.appearance.moveSuggestionsFadeMs' }],
      priority: 45,
    },
    'display.mistake-finder-threshold': {
      id: 'display.mistake-finder-threshold',
      label: 'Mistake-finder threshold (worst-quantile)',
      domain: 'display',
      inputs: [{ range: [0, 1] as const }],
      outputs: [{ path: 'profile.settings.appearance.mistakeFinderThresholdQuantile' }],
      priority: 46,
    },
    'engine.watchdog-animation-ms': {
      id: 'engine.watchdog-animation-ms',
      label: 'Watchdog animation duration (ms)',
      domain: 'engine',
      inputs: [{ range: [50, 5000] as const }],
      outputs: [{ path: 'profile.settings.engine.katago.watchdogAnimationMs' }],
      priority: 50,
    },
    'engine.watchdog-latency-threshold-ms': {
      id: 'engine.watchdog-latency-threshold-ms',
      label: 'Watchdog latency threshold (ms)',
      domain: 'engine',
      inputs: [{ range: [50, 5000] as const }],
      outputs: [{ path: 'profile.settings.engine.katago.watchdogLatencyThresholdMs' }],
      priority: 60,
    },
    'engine.report-during-search-every': {
      id: 'engine.report-during-search-every',
      label: 'Report cadence (s)',
      domain: 'engine',
      inputs: [{ range: [0.01, 4.0] as const }],
      outputs: [{ path: 'profile.settings.engine.katago.reportDuringSearchEvery' }],
      priority: 70,
    },
    'engine.first-report-during-search-after': {
      id: 'engine.first-report-during-search-after',
      // Bounded above by the cadence knob via `maxFromKnob` —
      // semantically a first-report-after value larger than the
      // cadence would delay first-paint past what would have been
      // the second regular report. The cross-knob constraint is
      // declared at the substrate level so future widget consumers
      // see the binding directly on the KnobDecl rather than
      // having to re-derive it.
      //
      // Bounded below by `minFloor: KATAGO_FIRST_REPORT_FLOOR_S` —
      // the protocol-documented minimum from KataGo's analysis-engine
      // source. The range's lower edge matches the floor so the
      // slider can reach it; the `minFloor` is retained as the SSOT
      // for the wire-layer defence-in-depth clamp in
      // `analysis-service.ts` against direct-leaf writes below the
      // protocol minimum.
      label: 'First report after (s)',
      domain: 'engine',
      inputs: [{
        range: [0.001, 4.0] as const,
        maxFromKnob: 'engine.report-during-search-every' as KnobId, // KnobId brand mint: static `<domain>.<name>` registry-key literal
        minFloor: KATAGO_FIRST_REPORT_FLOOR_S,
      }],
      outputs: [{ path: 'profile.settings.engine.katago.firstReportDuringSearchAfter' }],
      priority: 80,
    },
  },
  // Keybindings overrides. Sparse map keyed by KeybindingActionId
  // — absence means "use the registry's default key", explicit
  // null means "user explicitly unbound this action". Fresh
  // installs serialise to `{}` (defaults rule); the catalog at
  // `src/composables/keybindings-catalog.ts::KEYBINDINGS_REGISTRY`
  // is the authoritative action list with their default keys. See
  // `docs/archive/notes/design/keybindings-plan.md` Phase 1.
  keybindings: {},
  // Default Analysis-tab layout (see AppSettings.analysisTabs). Four tabs
  // over the panel registry, Basic first (most-used). The Settings editor
  // (Phase 3) lets users re-tab; migration 54 → 55 backfills this shape on
  // legacy persisted blobs (migration 61 → 62 adds intervalSummary to an
  // already-backfilled Basic tab — see that migration's comment). Tab ids
  // are branded via the trailing `as unknown as AppSettings` cast; panelIds
  // use the PANEL_ID SSOT.
  //
  // intervalSummary leads Basic (wiki Wanted feature #6): the summary
  // analysis over the set interval is the number a Multiresolution-panel
  // hover surfaces today, but that panel is a separate tab and may not even
  // be enabled — this makes the same numbers visible by default without it.
  analysisTabs: [
    { id: 'basic', label: 'Basic', panelIds: [PANEL_ID.intervalSummary, PANEL_ID.scoreLead, PANEL_ID.mergedDelta] },
    { id: 'distributions', label: 'Distributions', panelIds: [PANEL_ID.deltaDistribution, PANEL_ID.mistakeGap] },
    { id: 'stability', label: 'Stability', panelIds: [PANEL_ID.stability, PANEL_ID.stabilityCrossCorrelation] },
    { id: 'multiresolution', label: 'Multiresolution', panelIds: [PANEL_ID.multiresolutionInterval] },
  ],
  // First-run setup wizard's "has this profile been onboarded" flag
  // (ledger slug swz-setup-wizard). `false` here is the actual trigger:
  // a fresh profile (never persisted, so this default stands untouched)
  // shows the wizard on first mount. Migration 69 → 70 backfills `true`
  // for every pre-existing persisted blob, so the wizard never surprises
  // a returning user. See `composables/useSetupWizard.ts`.
  onboarding: { completed: false },
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
  id: NIL_UUID as ProfileId, // NIL-UUID brand mint (pre-auth sentinel identity)
  username: 'Guest',
  // defaultSettings is an inferred object literal whose narrow literal types
  // (string-literal enums, tuple ranges) don't structurally match AppSettings'
  // wider field types without the unknown hop; the literal IS the seed shape.
  settings: defaultSettings as unknown as AppSettings,
  thumbnailSettings: defaultThumbnailSettings,
  cardSets: defaultCardSets,
  qeuboPinnedBookmarks: [],
};

/**
 * Seed for the non-persisted `GlobalStore.knownTags` tag dictionary
 * (a server-derived cache — see the invariant on `ProfileState`).
 * Used at store-init and re-seeded by `resetWorkspace` on identity
 * flip; overwritten by the boot-time `getTags()` fetch.
 */
export const defaultKnownTags: string[] = ['$mistake', '$opening', '$joseki', '$life_and_death'];

export const defaultSessionUI: UISession = {
  activeTab: 'cards',
  // LYT corner presence-menu defaults (W2). Mirrors `lyt-layout.gen.ts`'s
  // own `presenceDefaultVisible` for the three menu-governed widget ids —
  // `boardRail` (path '0') and `previewBoard` (path '2.3.2') both false,
  // `controlPanel` (path '2.3.1') true — see
  // `composables/chrome/useLytPresenceMenu.ts`'s own `LYT_PRESENCE_DEFAULT`
  // for the single other place this triple is named (the migration
  // 75 -> 76 fallback for a key a legacy blob never wrote at all).
  lytPresence: { boardRail: false, previewBoard: false, controlPanel: true },
  // 'slot' (style A): the presence-menu checkbox mounts SidebarWidget
  // into the boardRail LYT leaf. Roadmap §7 ruling 2's own default —
  // the user flips to 'popover' (style B) from the Session (UI) registry
  // or the presence-menu's own inline selector.
  railStyle: 'slot',
  treeExpanded: true,
  // System-log bar default-hidden — it's a debugging surface, and
  // its 30px vertical footprint eats space the analysis dashboard
  // would rather have. Users can re-enable via the Session (UI)
  // registry.
  systemLogExpanded: false,
  // controlPanelWidthPx intentionally omitted: undefined is the
  // documented default (schema.ts) — no drag has happened yet, so
  // #control-panel renders at its natural flex fill. See
  // useResizablePanel.ts.
  moveFilterThreshold: 0.05,
  moveFilterExpression: 'move.order === 0 || (move.visits / root.visits) >= ui.threshold',
  analysisLayout: 'horizontal',
  showMoveSuggestions: true,
  showStoneMoveNumbers: false,
  // Off by default — preserves the historical "land on root after
  // SGF upload" behaviour. When the user opts in via the
  // Settings (UI) registry, `useSgfLoader` post-walks the loaded
  // board to its active-variation leaf so the file-upload flow
  // lands on the final position. See useSgfLoader.ts for the
  // call-site rationale (file uploads only — card loads and
  // review-session boards intentionally start at the card's
  // recorded position).
  loadSgfAtLastNode: false,
  // PV-preview animation defaults — kept in lockstep with
  // `composables/use-pv-animation.ts::PV_DEFAULTS` and the migration
  // 9→10 backfill. Three sources of truth that must agree.
  pvAnimation: {
    mode: 'instant',
    stepDelayMs: 350,
    windowDurationMs: 600,
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
  // macro-public-id-tokens (schema-version 66): no game_source
  // ordinal tokens pending resolution by default.
  cardsContextGameSourceOrdinals: [],
  qeuboToolbarView: 'applied',
  // Delta-analysis panel's view cycle. 'shared' preserves the
  // pre-feature, only-ever-existed view — see the field's doc comment
  // in schema.ts. Schema-version 64 introduces the field.
  deltaViewMode: 'shared',
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
  // doc comment in `types.ts`). Default false — the ping-tandem
  // animation is opt-in. The default (un-animated) mode keeps
  // the historical 5000ms-sample-driven behaviour: dot flips on
  // a sample crossing the threshold and stays put until the next
  // sample. Users who want the per-ping animation flip the
  // toggle in the registry editor.
  watchdogColorTransition: false,
  // Forest Directory navigator: empty expansion (global) + empty per-board
  // selection map means a fresh user lands on a fully-collapsed tree with no
  // board selection until they click. Schema-version 21 introduces the field;
  // 59 re-scopes `selection` to a per-board map (board-scope audit P0) and its
  // migration drops the prior global selection.
  forestNav: {
    expanded: [],
    selection: {},
  },
  // Per-board card-tree navigator: empty dictionary means a fresh
  // user (or a fresh board) has no manually-expanded stubs or
  // buckets — the projection's default expansion rules govern.
  // Entries are added lazily on first stub / bucket click via
  // `toggleCardTreeManualExpand`. Schema-version 45 introduces the
  // field; the migration backfills existing blobs with the same
  // empty default.
  cardTreeNav: {},
  // Board-overlay delta+visits annotation — off by default, matching
  // showStoneMoveNumbers' posture: an opt-in overlay a user turns on via
  // the Session (UI) registry once they know it exists, rather than
  // surprising every board with new on-stone chrome. Schema-version 69
  // introduces the field.
  moveDeltaAnnotation: 'off',
  // Settings sub-tab strip orientation (ledger rows 1505/1509/1515/1516).
  // Default 'horizontal' — the commissioner's ruling keeps the vertical
  // right-rail available as a quiet opt-in rather than the shipped
  // default; see the field's doc comment on `UISession` in schema.ts.
  // Schema-version 73 introduces the field.
  settingsTabsOrientation: 'horizontal',
  // Ghost-stone hover preview (wiki2-ghost-stone). Default true — see
  // schema.ts's field comment for the on-by-default rationale and for
  // why this is registry-only (no StatusBar button). Schema-version 75
  // introduces the field.
  showGhostStone: true,
};

export const DEFAULTS = {
  profile: defaultSettings,
  session: defaultSessionUI,
} as const;
