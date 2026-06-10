# Worklog — `ReviewCard.sgf` → `canonicalContent` (34b supersession) (2026-06-10)

> Audit trail for work-status item `reviewcard-canonical-content-rename`,
> executing §3.20 of the 2026-06-10 history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`);
> branch `bork/refactor/reviewcard-canonical-content`.

## The frame: a recorded decision whose trigger fired

This change **revisits a recorded decision**; it does not finish an
incomplete rename. The 34b wire-vocabulary arc *deliberately retained*
`ReviewCard.sgf` on the domain type: `docs/archive/34b-frontend-brief.md`
states "Internal TypeScript type names (`ReviewCard.sgf`,
`ReviewCard.defaultVisits`, etc.) **stay the same**", and
`docs/archive/34b-complete-status.md` confirms post-ship that the
internal names are "unchanged, as intended" — explicitly premised on
the frontend remaining a Go client with no second-domain consumer
("The frontend is NOT going domain-agnostic — you're still a Go app").

That premise is now invalidated: ADR-0003's Revisit-when #1 (a second
domain adopter materializes) fired twice, recorded in the ADR's
2026-06-10 amendment — the open `chess-clone` work-status item (same
game class, different instance) and the maintainer's generic knowledge
flash-card fork (a non-game adopter, the binding constraint named
during the history-lessons audit). The cross-reference to `chess-clone`
matters here because the two adopters sit on different axes: for the
chess clone the content envelope stays SGF-shaped or near; for the
generic fork the envelope's payload is arbitrary — either way the
domain type naming its content field for the Go encoding is the
instance-vocabulary leak the audit names.

Both 34b archives are **frozen** and untouched; the supersession
record lives in the `ReviewCard` doc comment in
`frontend/src/types/cards.ts` (the field's owning declaration), citing
the archives and the fired trigger — per the audit item's instruction
that prose citing the old mapping lives only in frozen archives, so
the supersession note goes at the type, not in the archive.

## The change

`ReviewCard.sgf` → `ReviewCard.canonicalContent`, matching the wire's
`canonical_content` (which the 34b arc already made domain-neutral).
The domain type's content field is now an **opaque string envelope**;
the Go *interpretation* stays at the consumers that parse it —
`sgf.parse` / `loadSgf` in `useReviewSession.loadCard` and
`loadSgfIntoBoard` behind `useDirtyBoardGuard` are engine-band calls,
exactly where ADR-0003 wants the instance vocabulary.

### Forced-site table (compiler-driven; re-verified at HEAD)

| # | Site | Role |
|---|------|------|
| 1 | `frontend/src/types/cards.ts` (`ReviewCard`) | the declaration + supersession doc comment |
| 2 | `frontend/src/services/backend-service.ts::mapToReviewCard` | ACL mapping: `canonicalContent: raw.canonical_content` (formerly `sgf:`) |
| 3 | `frontend/src/composables/review/useReviewSession.ts` (`loadCard`) | `sgf.parse(card.canonicalContent)` — the Go interpretation site |
| 4 | `frontend/src/composables/board/useDirtyBoardGuard.ts` (`handleLoadCard`) | `loadOrLog(targetBoardId, card.canonicalContent, …)` |
| 5 | `frontend/src/components/charts/card-tree-echarts.ts` (`tooltipFor`) | `getCardThumbnailSync(card.id, card.canonicalContent)` |
| 6 | `frontend/tests/integration/useReviewSession.test.ts` | `makeReviewCard` fixture (2 sites: the base fixture + the `canonicalContent: ''` parse-failure override) |
| 7 | `frontend/tests/integration/autonomous-srs.test.ts` | `makeReviewCard` fixture |
| 8 | `frontend/tests/unit/composables/autonomous-srs-policies.test.ts` | `makeStubCard` fixture |

8 forced files (5 src + 3 test), 9 edit sites. The item's predicted
radius (~5 src sites + ~3 test fixtures) held at HEAD modulo line
drift from the types.ts split (PR #384) and the review-scoring
extraction (PR #383): the declaration moved from `types.ts:1685` to
`types/cards.ts`, and the `sgf.parse` site from `useReviewSession.ts:251`
to `:274`.

### Deliberately not renamed

- **`tests/e2e/seed.ts` (`SeedTestCardOptions.sgf`)** — outside the
  forced radius: it is a seeding-harness option that feeds the wire's
  `raw_content` on the *create* leg, not a `ReviewCard` field. Its two
  callers (`review-session-harness.test.ts`,
  `autonomous-srs-loop.test.ts`) pass locally-generated SGF; renaming
  would touch three e2e files for vocabulary consistency alone.
  Left as-is (optional-consistency per the item; not trivial since
  the e2e harness is not exercisable in this verification run).
- **`getCardThumbnailSync(cardId, cardSgf)`
  (`frontend/src/composables/cards/useCardThumbnail.ts`)** — one more
  instance-vocabulary site, but a positional `string` parameter the
  compiler does not force through this rename. Noted here rather than
  renamed (minimal-touch); it is honest vocabulary today in the sense
  that the thumbnail renderer *does* interpret the string as SGF —
  it is a Go-band consumer, not an envelope.

### Scope: `sgf` alone

`defaultVisits` and `gamma` keep their names. Both are read out of the
**deliberately-opaque** `grading_parameter.data` blob
(`backend-service.ts::readGradingParam`), whose inner shape is
intentionally not captured in the OpenAPI schema — the open
`gradingparameter-opacity-typing` item owns that seam's typing
question (audit §3.3). Renaming fields whose source is an opaque
domain-payload blob is a different arc with a different owner; pulling
them into this rename would blur a crisp boundary. The scope is
principled, not lazy: the wire made `canonical_content` domain-neutral
and the domain type now matches it; the grading blob is domain payload
by design on both sides of the wire.

## Documentation

- `frontend/src/types/cards.ts` — the supersession record in the
  `ReviewCard` doc comment (the load-bearing deliverable beyond the
  rename itself).
- `frontend/FILES.md` `types/cards.ts` row — the "ReviewCard.sgf …
  carries the Go instance (the reviewcard-canonical-content-rename
  trigger)" leakage note resolves to: opaque content envelope, Go
  interpretation at the parsing consumers. Band tag stays `[B2]`
  (ReviewSessionData still holds a game-tree `NodeId`).
- Frozen archives (`docs/archive/34b-*.md`) untouched.
- ADR-0003 untouched — its amendment already records the fired
  trigger; this PR is a consumer of that record, not an editor of it.
- Doc-graph regenerated (this worklog is a new node: 430 → 431).
  One environment artifact named loudly: the regeneration ran in an
  isolated worktree where the untracked runtime directory
  `backend/data/` does not exist, so `docs/doc-graph-report.md` now
  lists one extra missing-on-disk directory-ref
  (`monorepo-plan.md → backend/data/`). Directory-refs are
  deliberately outside the CI-gated structural skeleton
  (report-snapshot posture, per `generate.mjs`'s `manifestSkeleton`
  doc); the line will flip back at the next regeneration in a
  checkout where that untracked directory exists.

## Verification

- `npm install && npm run build` (vue-tsc -b + vite build): clean —
  zero stale `.sgf` references survive the typecheck. (Note: the test
  tree is outside the `vue-tsc -b` project scope, so test-fixture
  completeness was additionally grep-verified: no `card.sgf` or
  `sgf:`-keyed `ReviewCard` construction remains outside the
  deliberately-left `seed.ts` surface.)
- `npx eslint .`: exit 0.
- `npm run test:run`: 882 passed, 4 skipped, 0 failed.
- E2e harness not run (pre-existing harness↔topology incompatibility
  recorded in `docs/worklog/2026-06-10-review-scoring-named-seam.md`;
  the e2e `sgf:` sites this PR leaves are seeding options, unaffected
  by the domain-type rename).

## Deferred / notes

- Todo DB untouched (read-only commission); closing
  `reviewcard-canonical-content-rename` is the maintainer's curation.
- `useCardThumbnail.ts`'s `cardSgf` parameter and
  `SeedTestCardOptions.sgf` remain as named instance-vocabulary
  residue (see "Deliberately not renamed") — candidates for whichever
  arc next touches those files, not items in themselves.

---

License: Public Domain (The Unlicense).
