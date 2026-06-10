# Worklog — Review per-move delta scoring extracted to a named engine seam (2026-06-10)

> Audit trail for work-status item `review-scoring-named-seam`,
> executing §3.17 of the 2026-06-10 history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`);
> branch `bork/refactor/review-scoring-named-seam`, PR #383.
> ADR-0003 designed this seam in prose ("the orchestration is
> portable; the scoring extraction is not") and names
> `useReviewSession` as its Revisit-#3 canary (Band 2 in the ADR,
> `[B3]` in FILES.md); the extraction is the adjudication path the
> ADR's 2026-06-10 amendment points at, executed here for the first
> of the file's ~4 Go seams.

## The change

- **`engine/analysis/review-scoring.ts` (new, [B3])** —
  `scorePerMoveDelta(nodes, path, s_1_idx, s_1_id, getEnrichment)`:
  the per-colour `extra.{color}.deltas` indexing and the
  s_1-fast-path-then-path-scan lookup from
  `useReviewSession.processUserMove`, with the load-bearing lookup
  order unchanged (s_1 first; then every node on the active path in
  path order; first non-undefined wins). Returns a discriminated
  result: `{ kind: 'found', delta }` or
  `{ kind: 'missing', color, perColorIndex }`.
- **The seam constraint** — the enrichment read is a parameter
  (`EnrichmentAccessor = (nodeId) => Enrichment | null`), not a
  ledger import. The engine band was grep-verified services-clean
  before authoring (zero `engine/ → services/` imports) and stays
  so; importing the ledger would have created the band's first such
  edge. `useReviewSession` binds
  `nodeId => ledger.getEnrichment(keys.enrichedKey, nodeId)` at the
  call site, so the `EnrichedKey` binding and the ledger singleton
  both stay on the composable side — ADR-0003's
  takes-the-predicate-as-a-parameter idiom.
- **`useReviewSession.ts`** keeps queue / state machine / abort /
  submission and consults the named function. PR #382's blind-mode
  prefs owner machinery (capture / owned writes / watcher-driven
  release) is untouched — the extraction is a different region of
  `processUserMove`.

## Code-motion proof obligations

What moved **verbatim** (modulo the renames below):

- The per-colour index loop (`colorMoveCount` over `path[0..s_1_idx]`,
  `n = colorMoveCount - 1`) and its block comment.
- The two-stage lookup (`let delta = …; if (delta === undefined) { for …
  scan … break } }`) and its block comment.
- The `userColor` / `colorKey` derivation, including the `move!`
  non-null assertion (now carrying the justification comment ADR-0002
  Rule 2 asks for — it had none at the old site; the precondition is
  stated in the function doc).
- The ADR-0002 rationale prose for the missing-delta case (the 0.5
  history, the Ebisu-corruption shape).

What was **parameterized** (pure renames at the seam):

- `nextBoard.nodes` → `nodes` (param; the function's only board read).
- `newPath` → `path` (param).
- `ledger.getEnrichment(keys.enrichedKey, X)` → `getEnrichment(X)`
  (the accessor param — the band-constraint half of the item).

The **one deliberate restructuring**, recorded loudly: the item says
to extract "the ADR-0002 loud-failure branch" — but the literal
branch performs `pushSystemMessage` + `mutateReviewSession` +
`return`, and moving those wholesale would create engine→store and
engine→i18n edges, the same band-erosion class the accessor
constraint exists to prevent. The split: the *decision* (a missing
delta is a contract failure; never substitute a default score) moved
into the seam as the structured `missing` result, with the rationale
comment travelling; the *surfacing* (system message + status→IDLE +
early return) stays in the composable as the consumer of that
result. The item's own tier-1 spec ("structured failure on missing
delta — assert it does NOT silently default to 0.5") describes
exactly this shape, so the reading is grounded, but it is named here
as the place reviewer judgment applies.

Stale mirror-reference fixed in passing (named in the item): two
comments in the moved region attributed the symmetric per-colour
read to `useEnrichedData.ts`; verified it lives in
`composables/analysis/enriched-accumulator.ts` (the per-player
deltas ingestion — `extra.black?.deltas` / `extra.white?.deltas`).
Both references re-pointed; per the stable-handles convention the
new references name the file and the section, not line numbers.

## Line counts (record only — no ADR-0007 claim)

- `useReviewSession.ts`: **703 → 677** (−26).
- `engine/analysis/review-scoring.ts`: 128 (moved logic + travelling
  comments + the band-constraint header).
- `tests/unit/engine/analysis/review-scoring.test.ts`: 219 (8 tests).

## Tests

Tier-1 (`tests/unit/engine/analysis/review-scoring.test.ts`, the
coverage the seam makes possible — no store, no fakes, accessor is a
map lookup):

- per-colour indexing, black and white, each with a wrong-index decoy
  on the right colour and a right-index decoy on the wrong colour;
- wrong-colour-only enrichment is a miss (colour selection through
  the failure path);
- s_1 fast path: when s_1 carries the delta, exactly one accessor
  read (`['n3']` pinned via spy call sequence) — no scan;
- path-scan fallback: first hit in path order wins (0.25 at n1 beats
  0.75 at n2), read sequence pinned as `['n3', 'n0', 'n1']`;
- a present delta of `0` is found (the `!== undefined` comparison,
  not truthiness);
- the structured miss carries `color` + `perColorIndex`, and is
  asserted NOT to equal `{ kind: 'found', delta: 0.5 }` — the
  historical silent-corruption shape.

Regression net: the tier-3 `useReviewSession.test.ts` suites
(fast-path, path-scan, loud-failure, blind-mode ownership, abort
choreography) pass unmodified.

## Verification

- `npm run build` (vue-tsc -b + vite build): clean.
- `npx eslint .`: clean.
- `npm run test:run`: 878 passed, 4 skipped, 0 failed.
- **E2e harness not exercisable against the current topology** —
  `tests/e2e/review-session-harness.test.ts` wants a strong/weak
  proxy pair; the documented local stack
  (`services_local.gitignore`, consolidated 2026-06-03) runs a
  single SELECTOR at `127.0.0.1:1235`. Attempted with both env URLs
  pointed at the SELECTOR: both scenarios fail **upstream of this
  change**, in `playEngineMoves`
  (`composables/board/usePlayFromPosition.ts`, untouched here) with
  `missing 'model' field for SELECTOR routing` — the harness's
  position-generation client predates SELECTOR routing and never
  sets `model`. A pre-existing harness↔topology incompatibility,
  surfaced here per ADR-0002 rather than papered over; fixing the
  harness is out of this item's scope (scope discipline per the item
  description).

## Deferred / notes

- The remaining ~3 Go seams in `useReviewSession`
  (`sgf.parse` in loadCard, `applyGoMove` capture semantics,
  `gtpToBoard` best-move follow-through) are named in the FILES.md
  annotation, not extracted — the item scopes this PR to the scoring
  seam alone, and the review-session-state-split cohesion question
  is explicitly separate.
- ADR-0003 itself is not amended: its Revisit-#3 text ("the
  named-seam extraction work … is the adjudication path, not this
  amendment") remains accurate with the extraction partially
  executed — the band disagreement is narrowed, not yet adjudicated,
  while the other seams stay inline.
- Todo DB untouched (read-only commission); the item's
  evidence-recording on `refactoring-queue-adr0007` and its closure
  are the maintainer's curation.

---

License: Public Domain (The Unlicense).
