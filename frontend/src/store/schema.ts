/**
 * src/store/schema.ts
 *
 * The persisted GlobalStore schema — `AppSettings`, `UISession`, the
 * persisted-slice types they aggregate (thumbnails, minting,
 * navigation, analysis tabs, forest/card-tree navigator state), and
 * the top-level `ProfileState` / `SessionState` / `GlobalStore`
 * containers. Colocated with `store/defaults.ts` so each persisted
 * slice's type sits beside its default. Carries one runtime export
 * (`BUNDLE_COMPRESSION_SCHEMES`); every import below is type-only,
 * so this module has no runtime dependencies and the barrel
 * (`src/types.ts`) re-export graph stays acyclic. Carved from the
 * single-file `src/types.ts` (2026-06-10, history-lessons audit
 * §3.15); bodies are verbatim from the pre-split file.
 *
 * License: Public Domain (The Unlicense)
 */

import type {
  AnalysisPanelId,
  AnalysisTabId,
  CardId,
  CardTreeExpandKey,
  GameSourceId,
  KeybindingActionId,
  PerBoard,
  ProfileId,
  SessionId,
} from '../types/ids';
import type { BoardState } from '../types/game';
import type { EngineState } from '../types/engine';
import type { AnalysisEnvironment } from '../types/analysis-env';
import type { KnobRegistry } from '../types/knobs';
import type { CardSet, ReviewSessionData } from '../types/cards';
import type { QeuboBookmark } from '../types/qeubo';
// PV animation settings shape — `UISession.pvAnimation` references
// the composable-owned alias (same relationship as pre-split).
import type { PvAnimationSettings } from '../composables/board/use-pv-animation';
// i18n supported-locale union — the SSOT lives next to the catalog
// registry in `src/i18n/locales.ts`.
import type { SupportedLocale } from '../i18n/locales';

export type RegistryLeaf = string | number | boolean | null;
export interface Registry {
  [key: string]: RegistryLeaf | Registry | RegistryLeaf[];
}

// ThumbnailSettings is mutated through the registry editor.
export interface ThumbnailSettings {
  showOnHover: boolean;
  sizePx: number;
}

/**
 * A user-defined Analysis-tab: a named, ordered subset of the panel
 * registry. Persisted in `AppSettings.analysisTabs`; rendered one tab
 * at a time (inactive tabs' panels unmount). `panelIds` referencing a
 * panel no longer in the registry are dropped at resolution time
 * (ADR-0002 — a removed/renamed panel, logged not crashed).
 */
export interface AnalysisTab {
  readonly id: AnalysisTabId;
  label: string;
  panelIds: AnalysisPanelId[];
}

export interface MintingSettings {
  defaultVisits: number;
  defaultNumMoves: number;
  defaultPaletteId: 'active' | string;
  // Recall-discount γ baked into each newly-minted card's
  // `grading_parameter.data.gamma`. The MintCardModal exposes the
  // field per-card so the user can override at mint time; this
  // setting is the starting value the modal opens with. Matches the
  // `?? 0.9` fallback in `backend-service.ts::mapToReviewCard`'s
  // gamma read for legacy cards that lack the field.
  defaultGamma: number;
}

export interface NavigationSettings {
  actionOnDirtyBoard: 'ask' | 'new' | 'overwrite';
}

/**
 * Analysis-bundle wire-format choices. `'v1-json'` is the legacy
 * canonical-JSON wire (backend codec: json / json+gzip);
 * `'json-projected-v1'` is the cross/analysis-bundle-compression-v2
 * arc's lossless leaf (frontend projects + JSON-stringifies +
 * UTF-8s; backend brotli-wraps unconditionally for storage). See
 * `AppSettings.engine.katago.bundleCompressionScheme` below for
 * the contract and `services/analysis-bundle/encoder.ts` for the
 * encoder hierarchy. Tuple-then-type pattern mirrors
 * `WINRATE_FRAMINGS` in `engine/katago/types.ts`; consumers
 * (RegistryEditor's PATH_ENUMS, the auto-save composable) import
 * the const tuple directly so this declaration is the single
 * source of truth.
 */
/**
 * The user-facing registry values name the wire-format choice
 * (`'v1'` = legacy canonical-JSON, `'v2-projected'` = v2 with
 * the SPA-side projection encoder). The encoder's *internal*
 * scheme tag — the string the backend stores in
 * `format_descriptor.scheme` forever — is `'json-projected-v1'`
 * (declared in `services/analysis-bundle/encoder.ts`); the
 * registry-to-encoder mapping lives in
 * `analysis-persistence-service.ts::readCompressionScheme`.
 * Decoupling the two strings keeps the user-facing names
 * versionable (`'v2-projected'` may grow `'v2-projected-q4'`
 * later) without breaking the on-wire scheme tag's stable
 * identity.
 */
export const BUNDLE_COMPRESSION_SCHEMES = [
  'v1',
  'v2-projected',
  'v2-quantized',
  'v2-quantized-hifi',
  'v2-quantized-hifi-xor',
] as const;
export type BundleCompressionScheme = typeof BUNDLE_COMPRESSION_SCHEMES[number];

export interface AppSettings {
  engine: {
    katago: {
      url: string;
      // Proxy replay-cache control flags. Project verbatim to the
      // `cache` / `lookup_cache` / `replay_final_only` fields on
      // `KataGoAnalysisQuery` (see `engine/katago/types.ts` for the
      // authoritative wire-protocol semantics). Snake-case spelling
      // matches the wire vocabulary — the same convention `analysis_env`
      // follows for the same reason. All three default `false`: a fresh
      // install neither writes to the cache nor reads from it, and
      // observes the full anytime-optimization stream during any replay
      // it does perform. Users opt in via the registry editor:
      //   `cache: true` while running through SR queues to make
      //     re-visits cheap;
      //   `lookup_cache: true` to short-circuit known positions during
      //     qEUBO calibration sweeps;
      //   `replay_final_only: true` to suppress mid-search packets
      //     during cache replay (no effect when not replaying — i.e.
      //     when `lookup_cache: false` or on cache miss).
      // Read by `services/analysis-service.ts` at every `analyzeRange`
      // / `analyzeActiveNode` call site; closure capture is fine
      // because the restart-callback re-enters the same call path.
      cache: boolean;
      lookup_cache: boolean;
      replay_final_only: boolean;
      // Visibility toggle for the experimental analysis-persistence
      // panel (manual save / restore of analysis bundles per
      // BoardId; see services/analysis-persistence-service.ts and
      // components/AnalysisControls.vue). Camel-case rather than
      // snake_case because this is a frontend user-facing toggle,
      // not a wire-protocol field. Default `true`: the panel
      // surfaces in AnalysisControls.vue with a clearly marked
      // "experimental" tag and an inline tooltip explaining the
      // semantics, so testers can discover it without spelunking the
      // registry editor. Users who want to hide the panel — e.g.,
      // because the experimental scaffolding bothers them, or they
      // never use save/restore — can flip this to false via the
      // registry editor under engine → katago. The save action
      // itself is always manual regardless; the toggle controls only
      // the panel's visibility, not auto-save behaviour.
      analysisStorageEnabled: boolean;
      // Auto-save toggle for the experimental analysis-persistence
      // feature. When `true` AND `analysisStorageEnabled` is also
      // `true`, the SPA debounces a `PUT /analysis-bundles/{boardId}`
      // after every authoritative (final-packet) ledger record for
      // that board, so the user no longer has to click Save manually.
      // Default `false`: opt-in. The toggle is itself experimental —
      // it inherits the persistence feature's warning surface (the
      // `?` tooltip on the persist-box and the `⚠` glyph on the
      // registry-editor leaf), with an additional callout about the
      // continuous bandwidth / quota cost of continuous saving.
      //
      // Gating: auto-save is only active when both
      // `analysisStorageEnabled` AND `analysisAutoSave` are true. The
      // first is the panel-visibility / overall feature toggle; the
      // second is the manual-vs-automatic distinction. Flipping
      // `analysisStorageEnabled` off implicitly disables auto-save
      // (no save path exists for the user to see anyway).
      //
      // Trigger semantics: the auto-save composable
      // (`composables/useAutoSaveAnalyses.ts`) watches a per-BoardId
      // dirty counter (incremented by `analysis-service.ts` on every
      // `!response.isDuringSearch` ledger.record call) and debounces
      // the actual `save()` by `AUTO_SAVE_DEBOUNCE_MS` (see the
      // composable). During-search previews don't trigger saves —
      // only the authoritative finals do — so a burst of analyze
      // updates produces at most one save per debounce window.
      //
      // Failure handling: per ADR-0002's fail-loud-on-expensive-ops
      // calibration, persistent quota / too-large failures disable
      // auto-save in-memory (per board, until either a manual save
      // succeeds or the user toggles the leaf off and back on),
      // surfacing the error in the persist-box rather than
      // re-firing on every subsequent record. The toggle itself
      // stays true so the user's preference isn't silently flipped.
      analysisAutoSave: boolean;
      // Wire-format choice for analysis-bundle persistence. The
      // 'v1-json' value preserves the historical wire shape (the
      // backend's `json` / `json+gzip` codecs round-trip canonical
      // JSON record arrays). 'json-projected-v1' (the
      // cross/analysis-bundle-compression-v2 arc's lossless leaf)
      // projects each packet through the SPA's typed-shape allow-
      // list before upload, dropping fields the SPA doesn't read
      // (`scoreStdev`, `scoreMean`, per-move `ownership`, etc.) —
      // backend brotli-wraps the projected bytes unconditionally
      // for further storage win.
      //
      // Default `'v1-json'`: existing users see no behavioural
      // change until they explicitly opt into the projected scheme
      // via the registry editor. The 'v1-json' tag IS the v1 wire
      // shape; flipping to it later from 'json-projected-v1'
      // returns the SPA to verbatim canonical-JSON upload. v2-side
      // stored rows decode-on-read regardless of this toggle — the
      // server-side `format_descriptor` is the read-time discriminator.
      //
      // Loss profile of 'json-projected-v1': reconstruction is
      // bit-identical for every field the SPA's typed shape
      // declares. Fields the SPA *never reads* are dropped on
      // encode and absent on decode; the SPA's runtime path
      // therefore sees no behaviour change. A CI gate in
      // `services/analysis-bundle/projection.ts` enforces that the
      // allow-list stays in sync with the typed shape — adding a
      // key to `KataMoveInfo` (etc.) without registering it in the
      // allow-list is a build error at `vue-tsc -b`.
      //
      // Design rationale at
      // `docs/notes/analysis-bundle-compression-plan.md`. The set
      // of accepted values is exported as the const tuple
      // `BUNDLE_COMPRESSION_SCHEMES` below — the RegistryEditor's
      // `PATH_ENUMS` table imports it (the same pattern as
      // `WINRATE_FRAMINGS`) so the dropdown options stay in sync
      // with this type union without separate hand-listing.
      bundleCompressionScheme: BundleCompressionScheme;
      // Whether the analysis-service ACL injects the `transposition`
      // capability into outgoing analysis queries (proxy v1.0.14+
      // capability-negotiation contract). When the proxy advertises
      // `transposition` in its `query_version` capabilities AND this
      // toggle is on, the proxy's `transposition_enricher` Transformer
      // engages on each query, producing the `clusterId` field on
      // `KataMoveInfo` consumed by the cluster-rings overlay
      // (`MoveSuggestions.vue` gated on `session.ui.showTranspositionRings`).
      //
      // Two independent toggles by deliberate separation of concerns:
      //   - `engine.katago.useTransposition` (this one) — wire request:
      //     does the proxy do the work? Costs the Python↔C++ boundary
      //     when on. Persisted with the user's profile (a calibration
      //     concern).
      //   - `session.ui.showTranspositionRings` — rendering: does the
      //     overlay paint the rings? Pure UI; persisted with the
      //     session UI.
      //
      // Default `true` preserves pre-v1.0.14 behaviour (proxy
      // unconditionally engaged the Transformer when wired); users
      // who don't want the boundary cost can flip via the registry
      // editor.
      //
      // ADR-0002 surfacing path: when the toggle is on but the proxy
      // does NOT advertise the `transposition` capability (a v1.0.14+
      // proxy with the module not compiled in, or
      // `PROXY_ADVERTISE_CAPABILITIES=true` but the wiring absent),
      // the analysis service pushes a one-shot system message naming
      // the unmet capability so the user knows their toggle isn't
      // being honoured. Wire request is omitted in that case (no
      // point asking for what the proxy doesn't have).
      //
      // Schema-version 29 introduces this field; the migration
      // backfills `true` on existing blobs to preserve behaviour.
      useTransposition: boolean;
      // User-controlled opt-in for the proxy's adaptive_reevaluate
      // middleware (proxy v1.0.14+ capability) plus the per-query
      // metadata schema overrides. Surfaced as a checkbox + two
      // number inputs in the analysis tab, gated on the proxy
      // actually advertising `adaptive_reevaluate` (no UI noise on
      // proxies that can't honour it). When `enabled` is true and
      // the query is live + range-based, the analysis-service ACL
      // injects `adaptive_reevaluate: { worst_quantile, extra_visits }`
      // into the per-query capabilities dict. Review-session queries
      // (analyzeRange called with `forReview=true` from
      // `useReviewSession.processUserMove`) and turn-locked queries
      // (analyzeActiveNode) always omit it regardless of `enabled`,
      // because the middleware's mid-stream follow-ups would either
      // inflate the visit count beyond the card's defaultVisits
      // (corrupting review-session grading) or be structurally
      // inappropriate for a single-turn target.
      //
      // Default off — adaptive's deeper-analysis follow-ups change
      // the visit count of resulting packets in ways that surprise
      // any consumer expecting a specific maxVisits, so opt-in is
      // explicit.
      //
      // worstQuantile defaults to 0.05 (top 5% of moves get re-
      // evaluated, more conservative than the proxy's 0.25 default
      // — the SPA's review-session palettes already pick out the
      // user's worst moves separately, so a tighter quantile here
      // avoids double-attention on the same positions).
      // extraVisits defaults to 800 (matches proxy default;
      // increment-not-absolute, so KataGo's NN cache continues
      // search from where the original left off).
      //
      // Schema-version 30 introduces this field; the migration
      // backfills `{ enabled: false, worstQuantile: 0.05,
      // extraVisits: 800 }` on existing blobs.
      adaptiveReevaluate: {
        enabled: boolean;
        worstQuantile: number;
        extraVisits: number;
        // v1.0.26 — Phase 3.5 learned value-function opt-in.
        // Empty string `""` (or `"default"`) means "use the proxy's
        // built-in v1.0.24 worst-quantile allocation; no Phase 3
        // fields sent." A `learned_*` string opts into the
        // proxy-hosted LightGBM predictor with that version name
        // (e.g. `"learned_v1"`); the SPA verifies the name appears
        // in `adaptive_reevaluate.available_value_bindings` before
        // sending it, hiding the dropdown option otherwise.
        // Defaults to `""` for backward compatibility.
        //
        // Schema-version 31 introduces this field; the migration
        // backfills `""` on existing blobs.
        valueBinding: string;
      };
      // Ceiling on ponder mode's KataGo `maxVisits`. Ponder runs
      // indefinitely on the engine side; this is the practical
      // backstop that prevents a strong network on a fast GPU from
      // accumulating an unbounded visit count over a long session
      // (and, more relevantly to the default's choice, prevents the
      // pre-v1.0.20 ceiling of 100,000 from making a weak network on
      // a CPU-only setup hit the cap in seconds). User-tunable via the
      // registry editor under engine → katago; default 2,000,000.
      //
      // Single source of truth for ponder-depth across three
      // consumer sites:
      //   - `services/analysis-service.ts` — passed as `maxVisits`
      //     in the wire query for ponder mode (the actual KataGo-
      //     side ceiling on per-query search depth).
      //   - `components/charts/AnalysisTimelinePanel.vue` — caps
      //     the visits-input's HTML `max` attribute so the user
      //     cannot request a one-shot range analyze deeper than
      //     the ponder ceiling permits.
      //   - `components/BoardTab.vue` — uses it as the floor for
      //     the analysis-meter rugplot's intensity-gradient
      //     target, so the meter doesn't saturate instantly when
      //     the user hasn't run a range analysis.
      //
      // The pre-v1.0.20 shape had a hardcoded `PONDER_MAX_VISITS`
      // constant (100,000) in `engine/constants.ts` consumed by
      // the same three sites; v1.0.20 surfaces the value as a
      // registry-tunable setting and removes the constant.
      //
      // Schema-version 31 introduces this field; the migration
      // backfills 2,000,000 on existing blobs.
      ponderMaxVisits: number;
      /**
       * Watchdog ping-tandem keyframe duration in milliseconds
       * (knob-registry Phase 3a). The CSS keyframe in
       * `Toolbar.vue::.watchdog-dot.watchdog-pinging` animates
       * green → red over this duration when a ping is in flight,
       * via a `--watchdog-animation-ms` CSS custom property bound
       * to this leaf. Promoted from the hardcoded keyframe
       * duration; the `engine.watchdog-animation-ms` KnobDecl
       * drives it. Schema-version 36 → 37 backfills the field;
       * default 500.
       */
      watchdogAnimationMs: number;
      /**
       * Watchdog latency-threshold in milliseconds (knob-registry
       * Phase 6 sweep). In the un-animated watchdog mode (when
       * `session.ui.watchdogColorTransition` is false), the dot
       * flips red when the most-recent ping's round-trip latency
       * exceeds this value. In the animated mode the threshold is
       * conceptually independent — the keyframe sweeps over
       * `watchdogAnimationMs` regardless — but historically the
       * two defaulted to the same 500 ms by design, tying the
       * animation's full-saturation moment to "the engine is
       * taking long enough to be concerning." Users on slow
       * networks can raise this to avoid spurious red-flash;
       * users wanting tighter latency feedback can lower it.
       * Promoted from `Toolbar.vue`'s prior
       * `WATCHDOG_LATENCY_THRESHOLD_MS` const. Default 500;
       * range [50, 5000]. Schema-version 39 → 40 backfills.
       */
      watchdogLatencyThresholdMs: number;
      /**
       * KataGo `reportDuringSearchEvery` cadence in seconds — wire
       * field on every analyze query that streams intermediate
       * packets. Replaces the prior hardcoded 0.15 (ponder) / 0.5
       * (analyze) literals in `analysis-service.ts`; the single
       * registry-driven value applies to both modes per the user's
       * 2026-05-15 simplification choice. Bound through the
       * `engine.report-during-search-every` KnobDecl. Default 0.15;
       * range [0.01, 4.0]. Schema-version 41 → 42 backfills.
       */
      reportDuringSearchEvery: number;
      /**
       * KataGo `firstReportDuringSearchAfter` cadence in seconds —
       * wire field controlling when KataGo emits the FIRST in-
       * search report for an analyze query, independent of the
       * subsequent `reportDuringSearchEvery` cadence. A small value
       * here closes the perceived "delay until first packet"
       * friction on fresh ponder queries against unevaluated
       * positions. Bound through the
       * `engine.first-report-during-search-after` KnobDecl, whose
       * `inputs[0].maxFromKnob` constrains it to be ≤ the cadence
       * above (semantically: first-report-after a value larger
       * than the cadence would delay first-paint past what would
       * have been the second regular report). Default 0.05; range
       * [0.001, 4.0]. Schema-version 41 → 42 backfills.
       */
      firstReportDuringSearchAfter: number;
      /**
       * Default `maxVisits` for mint-time komi calibration — the
       * opt-in, maintainer-specified pedagogical feature that issues a
       * fresh bounded analysis on mint and adjusts the minted card's
       * komi so the position is even (teaching the student the correct
       * move set if the game were balanced). Prefills the per-mint
       * visits input in `MintCardModal` when the "calibrate komi"
       * checkbox is shown (engine connected); per-mint edits to the
       * field do NOT write back to this setting. Distinct from
       * `minting.defaultVisits` (the per-card *analysis* visit budget
       * the backend records on the card) — this is a one-shot evaluation
       * budget spent at mint time and never persisted. Default 1000;
       * range [1, …] (a positive visit count). Schema-version 60 → 61
       * introduces and backfills the field.
       */
      calibrationVisits: number;
      // Engine-side runtime overrides forwarded verbatim to KataGo as
      // the Analysis Engine's `overrideSettings` field. Documented at
      // the wire-shape boundary on `KataGoAnalysisQuery` in
      // `engine/katago/types.ts`; this entry is the registry-editable
      // container the user mutates. Shape is `Record<string, unknown>`
      // because the accepted-key set is engine-version-dependent and
      // the surface here is intentionally an open dynamic node in
      // RegistryEditor (add / remove keys, not a fixed-leaf form).
      //
      // A small set of keys carries frontend-side meaning and is
      // typed via dedicated unions in `engine/katago/types.ts`
      // (`WinrateFraming` for `reportAnalysisWinratesAs` is the
      // current entry); RegistryEditor's `PATH_ENUMS` table mirrors
      // these so the user gets a dropdown for the typed slots and
      // free-text for the rest. Adding a new typed key: declare its
      // union in `engine/katago/types.ts`, append a `PATH_ENUMS`
      // entry rooted at `engine.katago.overrideSettings.<key>`.
      //
      // Defaults seeded in `store/defaults.ts`; backfilled by the
      // schema-version 27 → 28 migration. Read by
      // `services/analysis-service.ts` at every analyze call site,
      // conditionally spread (an empty object is omitted from the
      // wire so the user clearing every key falls back to KataGo's
      // config-file values rather than overriding them with a no-op).
      overrideSettings: Record<string, unknown>;
      analysis_env: AnalysisEnvironment;
    };
  };
  appearance: {
    // Active chrome theme. Mirrored onto `<html data-theme="...">`
    // by useAppBootstrap, which resolves theme.css's
    // `[data-theme="X"]` block. The historical `'light'` value was
    // declared but never wired to anything; schema-version 15
    // retired it (a migration coerces existing `'light'` blobs to
    // `'dark'`) and added `'cluster'` as a real second theme
    // (cluster-12-mapped light variant). Adding a new theme:
    // extend this union, add a `[data-theme="X"]` block in
    // theme.css, extend RegistryEditor's PATH_ENUMS, append a
    // migration if a prior valid value retires.
    theme: 'dark' | 'cluster';
    /**
     * MiniBoard thumbnail renderer (the analysis-chart preview boards + the
     * multiresolution heatmap preview). `'svg'` is the declarative SVG
     * projection (default; slightly more prominent last-move ring); `'canvas'`
     * is the ADR-0010 canvas projection (lighter paint/jank at high stone
     * counts — measured in a live Firefox profile). Only the chosen renderer
     * mounts (`MiniBoard.vue` dispatches on this), so neither path's performance
     * is affected by the other. Selectable via the RegistryEditor enum dropdown
     * (extend PATH_ENUMS for a new value). Schema-version 55 → 56 backfills
     * `'svg'`.
     */
    miniBoardRenderer: 'svg' | 'canvas';
    // Hue-rotation offset (degrees) applied uniformly across the
    // intensity gradient in CIELAB space. Default -43° is a
    // hand-applied orientation chosen for typical-trichromat
    // readability; users with different colour-vision profiles can
    // adjust via the slider in the Gradient Calibration view.
    intensityHueShift: number;
    /**
     * Ceiling on the territory-overlay opacity (knob-registry Phase 3a).
     * `BoardWidget.vue::ownershipColor` caps the rendered opacity at
     * this value so even fully-owned points don't visually dominate
     * the board grid and stones beneath. Promoted from a hardcoded
     * 0.55 literal to a registry leaf; the `display.ownership-opacity-ceiling`
     * KnobDecl drives it. Default 0.55 (matches the prior literal so
     * the promotion is behaviourally invisible until the user adjusts).
     * Schema-version 36 → 37 backfills the field.
     */
    ownershipOpacityCeiling: number;
    /**
     * Dead-band threshold for the territory overlay (knob-registry
     * Phase 6 sweep). Below this absolute magnitude the engine's
     * ownership signal is too weak to render — paints transparent
     * to prevent flicker as confidence wavers around 0. Default
     * 0.05; range [0, 1]. Promoted from `BoardWidget.vue::ownershipColor`'s
     * prior `if (mag < 0.05)` literal. Schema-version 39 → 40
     * backfills the field.
     */
    ownershipDeadbandThreshold: number;
    /**
     * Liveness-marker threshold (knob-registry Phase 6 sweep).
     * Stones with engine-disagreement magnitude below this aren't
     * flagged as dead; below it the engine is genuinely undecided
     * about the region and the highlight would flicker as packets
     * arrive. Default 0.3; range [0, 1]. Promoted from
     * `BoardWidget.vue`'s prior `LIVENESS_THRESHOLD` const.
     * Schema-version 39 → 40 backfills the field.
     */
    livenessThreshold: number;
    /**
     * Mistake-finder severity quantile threshold ∈ [0, 1]. The
     * mistake-finder composable surfaces dots on the delta charts
     * for moves whose oriented `delta_fn` output (oriented by the
     * palette's `delta_ordering`) lands in the worst per-board
     * quantile: 0.15 means "show the worst 15% of moves on this
     * board". 0 disables the overlay entirely. Per-board (not
     * per-color), so a quiet game has fewer dots and a chaotic
     * game more — the threshold is a display calibration, not a
     * substrate constant. Wired through the
     * `display.mistake-finder-threshold` knob. Default 0.15.
     */
    mistakeFinderThresholdQuantile: number;
    /**
     * Fade duration (ms) for the suggestion-ring outline + suggestion-
     * disk opacity transitions in `MoveSuggestions.vue`. Promoted from
     * a hardcoded `transition: opacity 60ms ease` inline literal that
     * the magic-literals audit (Pass 2) had left deferred — the
     * calibration concern named in the pv-overlay-typography-calibration
     * work-status item is satisfied by
     * surfacing the value as a user knob (the user is now the one
     * choosing the calibration, so internal pairwise-tuning no longer
     * applies).
     *
     * Range [0, 200] ms; 0 = no animation (CSS interprets `0ms ease`
     * as a no-op — the value snaps without an intermediate frame).
     * Default 60 preserves the prior behaviour.
     *
     * Knob: `display.move-suggestions-fade-ms`.
     * Schema-version 46 → 47 backfills this field.
     */
    moveSuggestionsFadeMs: number;
    // Active UI locale. Mirrored onto `<html lang="...">` and
    // `i18n.global.locale.value` by useAppBootstrap. Schema-version
    // 24 introduces this field; the migration backfills existing
    // workspace blobs with the user-agent's preferred locale via
    // `detectBrowserLocale()`. The supported set is the union of
    // catalogs registered in src/i18n/index.ts; SUPPORTED_LOCALES
    // in src/i18n/locales.ts is the SSOT. Adding a locale: extend
    // SUPPORTED_LOCALES, add a JSON catalog under src/locales/,
    // register it in src/i18n/index.ts. Adding a value here NOT in
    // the supported set is a real ADR-0002 violation; the
    // composable's defensive resolver catches it but the type
    // should agree with the runtime contract.
    locale: SupportedLocale;
  };
  persistence: {
    debounceInterval: number;
  };
  minting: MintingSettings;
  navigation: NavigationSettings;
  /**
   * User-controllable-variable registry. Each entry is a `KnobDecl`
   * declaring the input/output vector, transform, and editor widget
   * for one controllable variable. Phase 1 of the knob-registry arc
   * seeds this empty; later phases populate it as the cross-domain
   * editor and promotion sweep land. The empty-default + idempotent
   * migration shape means existing consumers see a no-op until a
   * KnobDecl points at a path they read. See
   * `docs/notes/knob-registry-plan.md` for the design.
   */
  knobs: KnobRegistry;
  /**
   * User overrides for keybinding actions. Sparse map keyed by
   * `KeybindingActionId` — absence means "use the registry's
   * `defaultKey`"; explicit `null` means "user has unbound this
   * action even though it has a default". The registry itself
   * (`src/composables/keybindings-catalog.ts::KEYBINDINGS_REGISTRY`)
   * holds the authoritative action list with their default keys;
   * this field stores only the deltas the user has authored. Per the
   * keybindings-plan design, fresh installs serialise to `{}`
   * (defaults rule); migration 52 → 53 backfills the same on
   * legacy persisted blobs.
   */
  keybindings: Partial<Record<KeybindingActionId, string | null>>;
  /**
   * User-defined Analysis-tab layout: an ordered list of tabs, each a
   * named, ordered subset of the panel registry. The default (migration
   * 54 → 55 / `defaults.ts`) is the four-tab Basic / Distributions /
   * Stability / Multiresolution split. Phase 3's Settings editor mutates
   * this; the dashboard renders only the active tab.
   */
  analysisTabs: AnalysisTab[];
}

export interface UISession {
  activeTab: string;
  sidebarExpanded: boolean;
  treeExpanded: boolean;
  controlsExpanded: boolean;
  boardExpanded: boolean;
  // Persistent system-log bar below the top nav. Default true — hidden
  // only when the user explicitly unchecks it in the Session (UI) registry.
  systemLogExpanded: boolean;
  controlPanelWidth: number;
  // Release-scope item 7: user-controlled cap on the square board's
  // width, in pixels. The board column is height-driven via
  // aspect-ratio: 1/1; `boardSquareMaxWidthPx` puts an additional
  // upper bound, letting the user shrink the board (giving the
  // control panel more room) below the height-natural max. The
  // resizer drag mutates this. `undefined` = no cap; the board
  // saturates at column.height.
  boardSquareMaxWidthPx?: number;
  moveFilterThreshold: number;
  moveFilterExpression: string;
  analysisLayout: 'horizontal' | 'vertical';
  showMoveSuggestions: boolean;
  // Render the move-number on every placed stone in the active
  // variation. Toggled from StatusBar's "#" button; default off
  // because the numbers can crowd the board on long games.
  // Setup stones (root AB/AW properties) get no number — they
  // have no move ordinal to display.
  showStoneMoveNumbers: boolean;
  // When true, the SGF-load path (file-upload via `useSgfLoader`)
  // post-walks the freshly-loaded board to the leaf of its active
  // variation. The user lands on the final position of the
  // mainline instead of the root — natural for "open a complete
  // game from disk" exploration, opt-in because card-load flows
  // and review sessions intentionally start at a specific
  // position rather than the leaf. Default false preserves
  // pre-feature behaviour. Toggled via the Settings tab's
  // `RegistryEditor` over `store.session.ui`.
  loadSgfAtLastNode: boolean;
  // Per-board PV-preview animation settings — surfaces the knobs of
  // `usePvAnimation` (mode / timings / opacity / annotation / cycle)
  // through the registry editor. Schema-version 10 introduced the
  // field and backfills existing blobs against `PV_DEFAULTS`. The
  // composable's hard-coded fallback remains as a safety net for
  // unconfigured callers.
  pvAnimation: PvAnimationSettings;
  // Per-metric board overlays. Each metric carries its own set of
  // orthogonal sub-toggles describing the visual mode(s) the user
  // wants applied to that data; multiple sub-modes may be
  // simultaneously enabled. Mutated in place via the keyboard
  // registry. The wire-flag plumbing in analysis-service consults
  // these to decide whether to request `includeOwnership` (and later
  // `includePolicy`) — any sub-toggle being on is sufficient.
  overlayLayers: {
    ownership: {
      // Adjacent gap-less squares filling empty intersections.
      // Reads as a continuous territory map.
      continuous: boolean;
      // Small discrete confidence markers at empty intersections.
      // Less visually dominant; useful alongside MoveSuggestions.
      dots: boolean;
      // Sign-inversion overlay on stones whose own colour disagrees
      // with the predicted ownership at their position. Highlights
      // dead stones; conveys liveness without territory clutter.
      liveness: boolean;
    };
  };
  activeCardSetId: string;
  // Single ephemeral context for deck pipelines. The deck is a pure
  // strategy; the context is supplied at the call boundary. The
  // `Cards` tab (formed by merging the prior SR and Database tabs)
  // reads this for both pipeline runs and review-session starts;
  // schema-version 16 collapsed the prior per-tab `srContextIds` and
  // `databaseContextIds` into this single field as part of the tab
  // merge. Per-board scoping was considered and parked: today's
  // workflow has the user adjusting context-ids occasionally, not
  // tab-by-tab. Edited via a simple comma-separated text input in
  // the Cards tab.
  cardsContextIds: number[];
  // Which view the qEUBO toolbar cluster is currently showing.
  // 'applied' = engine sees the persistent values from
  // analysis_env.parameters; 'A' / 'B' temporarily override what
  // the engine sees with the corresponding qEUBO point's decoded
  // values, without writing to analysis_env.parameters. Default
  // 'applied'. Mutated by the toolbar; consumed by useQeubo's
  // effectiveParameterValues computed.
  qeuboToolbarView?: 'applied' | 'A' | 'B';
  // Board-overlay rendering posture for sibling variations from
  // the current node. Surfaced by `BoardVariationsOverlay.vue`.
  //   'off'     — no variation markers rendered.
  //   'circles' — each sibling variation = colored stroke-only
  //               ring, cycling through a small palette of
  //               distinct hues. Outline-only (not a filled disc)
  //               so the marker overlays cleanly with
  //               `MoveSuggestions`'s filled discs and stays
  //               visually distinguishable from them.
  //   'letters' — same colored ring as 'circles', plus a centered
  //               letter label A, B, C... in the matching tint.
  //               A is the first non-active sibling (declaration
  //               order); the active child never gets a letter.
  // Distinct from `showMoveSuggestions` (which gates KataGo's
  // analysis overlay): this is the user's own game-tree state, not
  // engine analysis. Independent of `showActiveNextMove` (below);
  // the two settings compose. Schema-version 18 introduces the
  // field.
  boardVariations: 'off' | 'circles' | 'letters';
  // Whether to render a hint marker at the next move on the active
  // path (the position the variation widget would land at if the
  // user advanced one step). When true, draws a gray stroke-only
  // ring at that intersection. Independent of `boardVariations`:
  // the user can have variations on without the active marker, or
  // vice versa, or both, or neither. Default `true` (common GUI
  // posture); users who find the marker noisy disable it via the
  // Session (UI) registry. Schema-version 19 introduces the field.
  showActiveNextMove: boolean;
  // Whether `MoveSuggestions` paints its solid colored ring around
  // moves that participate in a multi-tenant cluster (a
  // transposition — multiple distinct positions reachable via
  // different move orders that converge to the same node, surfaced
  // by the proxy's clustering pass and consumed via
  // `KataMoveInfo.clusterId`). Default `true` preserves the
  // pre-feature behaviour. Schema-version 20 introduces the field.
  // The variations overlay's dashed-stroke ring shape is chosen
  // specifically to compose with the solid transposition ring when
  // both are visible at the same intersection.
  showTranspositionRings: boolean;
  // Whether the Toolbar's WATCHDOG dot fades smoothly when its
  // colour flips (green ↔ red on the 500ms-latency threshold) or
  // switches instantly. Pure rendering preference — the watchdog
  // sampling cadence (5000ms poll of `query_version`) and the
  // threshold are unaffected. Default true (the transition is
  // less startling than the instant flip during concurrent
  // queries that briefly push proxy command-queue latency past
  // the threshold); users who find the fade distracting can
  // opt out via the registry editor. Schema-version 34
  // introduces the field.
  watchdogColorTransition: boolean;
  // Forest Directory navigator state. Two axes with different scopes:
  // `expanded` (which game nodes show their roots) is workspace-global —
  // the navigator tree is the user's whole library; `selection` (which
  // game/root each board has open in the right pane) is per-board. See the
  // `ForestNavState` declaration above for the per-axis rationale. Mutated
  // through `useForestNavigation`'s named mutators (toggle / expandAll /
  // collapseAll / select); `select` keys on the board passed to the
  // composable. Schema-version 21 introduces the field; 59 re-scopes
  // `selection` per-board (board-scope audit P0).
  forestNav: ForestNavState;
  // Per-board card-tree navigator state — persists the manual-expand
  // axis the `CardTreeWidget` mutates on stub / bucket clicks so a
  // board re-opened mid-session (or in a fresh browser session)
  // restores the user's exploration path through the card forest.
  // Schema-version 45 introduces the field. See `CardTreeNavState`
  // declaration below for the persistence shape. Per-board cleanup
  // fires from `closeBoard` (audit tag O14, card-tree-nav-slot); `resetWorkspace`
  // clears the whole dictionary via the `defaultSessionUI` reset.
  // Per-slot cleanup also fires from `useCardTreeData::reset` so the
  // user's exploration choices clear alongside the data they were
  // applied to — they are no longer meaningful against the new
  // forest.
  cardTreeNav: PerBoard<CardTreeNavState>;
}

// ── Forest Directory navigator persistence (UISession.forestNav) ─────────────
//
// String-discriminated id for navigator tree nodes. Template-literal
// type so the discriminator (`game:` / `root:`) is a structural
// property of the value, not a convention. Serializable to JSON via
// SyncService for cross-reload persistence.
export type NavNodeId = `game:${number}` | `root:${number}`;

// The user's current selection in the Forest navigator. `null` = no
// selection (right-pane shows empty state). The discriminated union
// matches the navigator's two selectable kinds; widening to add a
// `'card'` variant later will require both a schema migration and
// a composable update — the persistence and render layers stay in
// lockstep on the union shape.
export type NavSelection =
  | { readonly kind: 'game'; readonly gameSourceId: GameSourceId }
  | { readonly kind: 'root'; readonly rootCardId: CardId };

// Persisted navigator state on `session.ui.forestNav`. Schema-version
// 21 introduces this field; schema-version 59 re-scopes `selection`
// per-board (board-scope audit P0). The two axes have different scopes:
// see the field comments below and `frontend/docs/notes/board-scope.md`.
export interface ForestNavState {
  // Workspace-global. Expansion of the navigator tree — the user's whole
  // library of game sources → roots. That tree is the same regardless of
  // which board is active, so its expansion is not board-scoped; collapsing
  // a game on one board must not re-expand it on another. An array (not a
  // Set) so it JSON-round-trips through SyncService cleanly; the composable
  // projects it into a ReadonlySet for O(1) render-time lookup. Persistent —
  // collapsed games stay collapsed across reloads (file-manager idiom).
  expanded: NavNodeId[];
  // Per-board. Which game/root each board has selected, driving that board's
  // right-pane Lineage Explorer. Re-scoped from a single workspace-global
  // `NavSelection | null` to a per-board map (P0) so a null/absent selection
  // on one board can no longer clear another board's forest. Absent key = no
  // selection (the prior `null`). Cleaned up by `closeBoard` (an O-pair) and
  // reset wholesale by `resetWorkspace` via `defaultSessionUI`.
  selection: PerBoard<NavSelection>;
}

// ── Card-tree navigator persistence (UISession.cardTreeNav) ──────────────────
//
// Per-board manual-expand state for the `CardTreeWidget`. Keys come
// from the projection's two key shapes (see `useCardTreeProjection.ts`):
// `String(cardId)` for individual card expansion (cold internals
// revealed by stub-click) and `bucket:${parentCardId}` for cold-leaf
// bucket expansion. Schema-version 45 introduces the field.
//
// Array (not Set) so the value JSON-round-trips through SyncService
// cleanly; `useCardTreeData::manualExpand` projects it into a
// `ReadonlySet<string>` for the `useCardTreeProjection` contract.
export interface CardTreeNavState {
  manuallyExpanded: CardTreeExpandKey[];
}

// User-authored, persisted profile state.
//
// INVARIANT: the persisted profile holds user-authored data only.
// Server-derived caches (the tag dictionary, stats, …) must NOT live
// here — they carry no user intent, are re-fetched every boot, and
// persisting one means hydration's deepMerge races whatever wrote it
// at cold-start. Put such caches as non-persisted top-level
// `GlobalStore` fields instead (see `GlobalStore.knownTags`). A
// server-cache wedged into the profile is the category error that
// produced the boot-time hydrate-vs-fetch race
// (`tags-fetch-hydration-race`); keeping them out is what makes that
// class of race structurally impossible.
export interface ProfileState {
  id: ProfileId;
  username: string;
  settings: AppSettings;
  thumbnailSettings: ThumbnailSettings;
  cardSets: Record<string, CardSet>;
  qeuboPinnedBookmarks?: QeuboBookmark[];
}

export interface SessionState {
  id: SessionId;
  profileId: ProfileId;
  ui: UISession;
  // Per-board review-session rows. `Partial<Record<>>` (rather than
  // bare `Record<>`) reflects the runtime contract honestly: rows
  // are added by `mutateReviewSession`, deleted by `closeBoard` when
  // the owning board exits, and replaced wholesale by
  // `resetWorkspace` on identity flip. Bare `Record<>` would lie
  // about indexed reads — TS would say `ReviewSessionData`, the
  // runtime would return `undefined` after a delete. Per ADR-0001
  // (types reflect runtime reality) and ADR-0002 (type assertions
  // must be justified — bare-Record reads were unjustified).
  reviews: PerBoard<ReviewSessionData>;
}

export interface GlobalStore {
  activeBoardIndex: number;
  boards: BoardState[];
  profile: ProfileState;
  session: SessionState;
  engine: EngineState;
  // Server-derived tag dictionary for autocomplete. NON-PERSISTED:
  // excluded from `buildPersistencePayload`, untouched by
  // `updateFromRemote`, re-fetched every boot via
  // `backendService.getTags()`; `useMinting.commitMint` unions
  // just-minted tags in for the session. It lives here rather than in
  // `profile` per the ProfileState invariant — out of the persisted
  // blob, it can't be clobbered by the hydrate-vs-fetch race.
  knownTags: string[];
}
