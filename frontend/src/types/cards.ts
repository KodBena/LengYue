/**
 * src/types/cards.ts
 *
 * SR-card domain types: the `ReviewCard` domain projection and its
 * Ebisu model, the metadata patch shape, the deck vocabulary
 * (`CardSet`, the typed pipeline stages and the hyperparameter-hole
 * harness), the review-session state (`ReviewSessionData` /
 * `ReviewStatus` / `ReviewFeedback`), and the card-create wire-type
 * aliases the ACL forwards (`CardCreatePayload` /
 * `GameMetadataPayload`). Carved from the single-file `src/types.ts`
 * (2026-06-10, history-lessons audit §3.15); bodies are verbatim
 * from the pre-split file.
 *
 * License: Public Domain (The Unlicense)
 */

// Generated wire schemas — the single source of truth for the wire
// boundary; aliased here under domain-friendly names so consumers
// stay free of `components['schemas'][…]` boilerplate.
import type { components } from './backend';
import type { CardId } from './ids';
import type { NodeId } from './game';

// ── Value Objects (readonly preserved) — SR domain ────────────────────────────

export interface EbisuModel {
  readonly alpha: number;
  readonly beta: number;
  readonly t: number;
}

/**
 * A card surfaced to the SR session. Backend sources (`CardWithRecall` on
 * the wire) are translated through `BackendService::mapToReviewCard` into
 * this shape; everything that consumes a card downstream — the SR
 * composable, the lineage tree, the chart panels — sees only this type,
 * never the wire shape.
 *
 * ─── `gradingParameter` field (Item 18) ──────────────────────────────────────
 * The opaque grading-parameter blob carries domain-specific configuration
 * for how the card's recall is graded — for KataGo cards, this includes
 * `default_visits`, `analysis_config` (the palette payload), and
 * `gamma`. The wire shape is `Record<string, any> | null`, intentionally
 * untyped on the OpenAPI boundary because the inner shape is application-
 * defined and changes more often than the schema. Surfacing it on the
 * domain type lets the SR composable read `currentCard.gradingParameter
 * ?.data?.analysis_config` (`useReviewSession.ts:235`) to override the
 * active palette per card, without re-fetching the wire shape from
 * anywhere downstream.
 *
 * The ACL routes the wire blob through `engine/analysis-config-curation.ts
 * ::rewriteGradingParameterAnalysisConfig` before surfacing — pre-v1.0.3
 * cards carry baked configs with `np.<fn>` references that the proxy
 * v1.0.3 stdlib rejects at call time, and the bit-equivalent rewrite is
 * what keeps those cards reviewable. Residue (bodies referencing fns
 * outside the curated stdlib, attribute walks like `np.linalg.<fn>`)
 * passes through unchanged for the proxy's call-time NameError to
 * surface as a SystemMessage at review time per ADR-0002.
 *
 * `current_recall` and `halflife_units` (also part of item 18): the
 * backend computes these on every `CardWithRecall` response; surfacing
 * them lets the UI display "this card will be at 50% recall in N hours"
 * style diagnostics. Both are optional because they're snapshots at
 * read-time, not core card identity, and a card may be constructed
 * without them in test contexts.
 *
 * ─── `canonicalContent` (34b supersession, 2026-06-10) ──────────────────────
 * The card's content envelope, verbatim from the wire's
 * `canonical_content` — an opaque string from this type's point of
 * view (an SGF document for Go cards; the Go *interpretation* lives
 * at the consumers that parse it: `sgf.parse` in
 * `useReviewSession.loadCard`, `loadSgfIntoBoard` behind
 * `useDirtyBoardGuard` — engine-band calls). Until 2026-06-10 the
 * field was named `sgf`: the 34b wire rename deliberately retained
 * the Go-instance name on the domain type as recorded design
 * (`docs/archive/34b-frontend-brief.md`, "Internal TypeScript type
 * names … **stay the same**"; `docs/archive/34b-complete-status.md`,
 * "unchanged, as intended"), premised on the frontend having no
 * second-domain consumer. That premise was invalidated when
 * ADR-0003's Revisit-when #1 fired (2026-06-10 amendment: the
 * `chess-clone` work-status item plus the maintainer's generic
 * flash-card fork), so the field now carries the wire's
 * domain-neutral vocabulary. History-lessons audit §3.20;
 * work-status item `reviewcard-canonical-content-rename`.
 */
export interface ReviewCard {
  readonly id: CardId;
  readonly canonicalContent: string;
  readonly numMoves: number;
  readonly parentId?: CardId;
  readonly model: EbisuModel;
  readonly lastReviewedAt: Date | null;
  readonly numReviews: number;
  readonly suspended: boolean;
  readonly defaultVisits: number;
  readonly gamma: number;
  // ─── Item 18 surfacing ───────────────────────────────────────────────────
  readonly gradingParameter?: Record<string, any> | null;
  readonly currentRecall?: number;
  readonly halflifeUnits?: number;
  // ─── Card-metadata inline-edit arc 1 (backend tag, 2026-05-13) ───────────
  // Plain tags attached to this card (virtual `$tag` macros are a
  // deck-DSL construct, not per-card metadata; they don't appear
  // here). The wire schema marks the field optional (Pydantic
  // serialises the default `[]` when the card has no tags but
  // declares the field as having a default — which OpenAPI maps to
  // optional), so the ACL coerces `undefined → []` at the
  // boundary. Domain-side the field is always present.
  readonly tags: readonly string[];
}

/**
 * Patch shape consumed by `BackendService::updateCardMetadata`.
 * CamelCase domain projection of the wire `CardPatch`
 * (card-metadata inline-edit arc 2; see
 * `docs/dispatch/backend-to-frontend-card-metadata-inline-edit-arc2-shipped.md`).
 *
 * Every field is optional. The ACL projects each present field
 * to its snake_case wire counterpart; absent fields stay absent
 * on the wire so the backend's "absent → preserve" semantics
 * apply. Senders compose only what they intend to change.
 *
 * Semantics mirror the wire contract:
 *
 *   - `tags` — full replacement. `[]` wipes; absent preserves.
 *   - `numMoves` — direct overwrite.
 *   - `suspended` — direct overwrite.
 *   - `gradingParameterData` — JSON-merge-patch at one level
 *     against the stored `grading_parameter.data`. Keys
 *     present overwrite same-named stored keys; absent keys
 *     are preserved. The backend reads exactly `gamma`;
 *     every other key is frontend-defined pass-through.
 *   - `resetPrior` — atomic Ebisu-prior reset
 *     (`(α, β, t)` to defaults, `lastReviewedAt → null`,
 *     `numReviews → 0`). Independent of `numMoves` —
 *     settable on its own when the user decides the prior
 *     is corrupted.
 */
export interface CardMetadataPatch {
  readonly tags?:                 readonly string[];
  readonly numMoves?:             number;
  readonly suspended?:            boolean;
  readonly gradingParameterData?: Readonly<Record<string, unknown>>;
  readonly resetPrior?:           boolean;
}

// ── State Container (readonly removed) — SR domain ────────────────────────────

// Pipeline-stage discriminated union, sourced from the generated
// wire schema. Backend item 31 closed the typed-pipeline arc on
// the server side (`SelectStage | TakeStage | ShuffleStage |
// OrderStage` over `domain/pipeline_dsl.py`); this alias projects
// that union into the frontend domain so `CardSet.pipeline` is no
// longer `any[]`. The discriminant is the `stage` field
// (`"select" | "take" | "shuffle" | "order"`); each variant carries
// its own typed payload (selection + ordering for `select`, `n` for
// `take`, ordering for `order`, nothing for `shuffle`). Inner
// selection / ordering strategies are themselves wire-typed
// discriminated unions — see `types/backend.ts` for the full leaf
// vocabulary (DescendantSelection, EbisuRecallKey, BfsOrder, …).
//
// The CardSetEditor remains a free-form JSON authoring surface; the
// boundary cast there carries an ADR-0002 justification naming the
// backend's pipeline executor as the loud-failure surface for
// malformed pipelines.
export type PipelineStage =
  | components['schemas']['SelectStage']
  | components['schemas']['TakeStage']
  | components['schemas']['ShuffleStage']
  | components['schemas']['OrderStage'];

// ── Hyperparameter harness — schema-version 33 ──────────────────────
//
// Decks carry hyperparameters by nature (the n a `take` pulls, the
// expression a tag-DSL filter uses). The harness exposes chosen leaf
// values as named handles bound at pipeline-run time, leaving the
// deck declaration untouched. The disambiguator is syntactic: every
// legitimate DSL atom is either quoted or numeric, so a bare
// identifier in value position unambiguously marks a hole. See
// `docs/archive/notes/dsl-hyperparameter-harness-plan.md` for the design.

// Hole marker: a bare identifier in the authoring dialect parses to
// this shape. The `$param` field is the declared hyperparameter name
// the leaf binds to at run time.
export interface Hole {
  readonly $param: string;
}

// `Holed<T>` lifts a wire-typed value into the holey-AST shape: every
// open-primitive leaf may be replaced by a Hole, while literal types
// (the `stage` and `type` discriminators in particular) pass through
// unchanged so the union still narrows on the wire shape. Optional
// fields stay optional; arrays recurse element-wise; objects recurse
// on each value. After `substitute()` walks the AST and resolves
// holes, the result type-narrows back to `PipelineStage`.
export type Holed<T> =
  string extends T ? T | Hole :
  number extends T ? T | Hole :
  boolean extends T ? T | Hole :
  T extends ReadonlyArray<infer U> ? Holed<U>[] :
  T extends object ? { [K in keyof T]: Holed<T[K]> } :
  T;

export type PipelineStageWithHoles = Holed<PipelineStage>;

// HyperparamDecl: one entry in a deck's harness. The discriminated
// union over `type` selects which inline editor the prompt modal and
// the harness panel render. `enum` is the tag-DSL case (a fixed list
// of named filters the user maintains for that deck); `number` and
// `string` are the general cases.
export type HyperparamDecl =
  | {
      name: string;
      type: 'number';
      default: number;
      range?: [number, number];
      label?: string;
    }
  | {
      name: string;
      type: 'string';
      default: string;
      options?: string[];
      label?: string;
    }
  | {
      name: string;
      type: 'enum';
      default: string;
      options: string[];
      label?: string;
    };

// CardSet is mutated through the CardSetEditor. Decks are pure
// strategies (the DSL pipeline) — context (root card-id list) is
// supplied by the caller at execution time, lifted out of the deck
// declaration in schema-version 11. SR and Database tabs each carry
// their own context in `UISession.{sr,database}ContextIds`. Schema-
// version 33 added `hyperparameters` for the bind-time harness; the
// pipeline shape generalised from `PipelineStage[]` to the holey
// variant — decks without holes type-check identically.
export interface CardSet {
  id: string;
  name: string;
  description: string;
  pipeline: PipelineStageWithHoles[];
  hyperparameters: HyperparamDecl[];
}

export type ReviewStatus = 'IDLE' | 'LOADING' | 'AWAITING_MOVE' | 'ANALYZING' | 'FINISHED';

// ReviewSessionData is mutated through `mutateReviewSession` in store/index.ts;
// the SR session writes back queue progression, scores, override values.
export interface ReviewSessionData {
  status: ReviewStatus;
  queue: ReviewCard[];
  currentIndex: number;
  startingNodeId: NodeId | null;
  userMovesCount: number;
  userMoveScores: number[];
  // Per-card sticky visits override. `null` means "no override, use the
  // card's defaultVisits." Set by the UI; reset to `null` by loadCard
  // when a new card becomes active (each card gets its own starting
  // point). Bang-bang semantics: once set, it persists across every
  // subsequent move within the same card until the user either changes
  // it again or advances to the next card.
  visitsOverride: number | null;
}

// ── Value Object (readonly preserved) — ReviewFeedback ────────────────────────

export interface ReviewFeedback {
  readonly finished: boolean;
  readonly acc: number;
  readonly discounted: number;
  readonly visitRatio: number;
  readonly nEff: number;
}

// ── Wire types (going outbound) — no readonly, mutable construction ───────────

// ─── Card-create wire shapes ──────────────────────────────────────────────────
//
// Aliases for the generated wire types from `types/backend.ts`. The
// handwritten interfaces that previously sat here (one per shape)
// retired in favour of the codegen-sourced declarations to close a
// drift hazard — they were the same shape as the generated schemas,
// declared twice. The fields are snake_case because these are wire
// shapes, not camelCase domain projections; there is no inverse-mapper
// for the create flow analogous to `mapToReviewCard`. The composable
// (`composables/useMinting.ts::prepareDraft`) constructs the payload
// literally and the ACL (`services/backend-service.ts::createCard`)
// forwards it.
//
// 34b note: `default_visits` lives inside `grading_parameter.data`,
// not at the top level. See `composables/useMinting.ts::prepareDraft`
// for the construction site that places it there.
export type CardCreatePayload = components['schemas']['CardCreate'];
export type GameMetadataPayload = components['schemas']['GameSourceCreate'];
