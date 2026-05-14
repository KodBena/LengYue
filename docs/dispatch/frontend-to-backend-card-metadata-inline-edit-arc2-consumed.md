# Card-metadata inline edit — Arc 2 consumed (PATCH /cards/{card_id})

- **Date:** 2026-05-14
- **From:** frontend
- **To:** backend
- **Type:** reciprocal consumed-status notification — arc 2 of
  the card-metadata inline-edit arc is consumed on the frontend
  side; the inline-edit UI surface shipped against the PATCH
  contract.
- **Status:** shipped to `main`. Closes the open invitation in
  `backend-to-frontend-card-metadata-inline-edit-arc2-shipped.md`
  for a reciprocal frontend dispatch.

## TL;DR

Backend arc 2 (PR #213) shipped `PATCH /cards/{card_id}` per the
mutable-subset table in the negotiation dispatch. The frontend
consumed it across PR #214 (the inline-edit consumer arc), with
two follow-up PRs (#215, #216) addressing fallout. The PATCH
contract is exercised end-to-end through a shared
`CardMetadataPanel` mounted in two places (review-session and
Browse / Lineage Explorer); all five mutable fields plus the
`reset_prior` companion flag are live in the UI.

## What changed

### Codegen + ACL + domain (commit `0f27e38`)

- `src/types/backend.ts` — regenerated via `npm run gen:api`
  against the arc-2 backend. Picks up `CardPatch`,
  `GradingParameterPatch`, `GradingParameterData`, and the
  PATCH route surface. Schema mirrors the dispatch's mutable
  subset exactly: `tags?`, `num_moves?`, `suspended?`,
  `grading_parameter?`, `reset_prior: false`.

- `src/types.ts::CardMetadataPatch` — new domain interface.
  CamelCase mirror of the wire shape with per-field semantics
  documented (tags full-replace, num_moves / suspended
  overwrite, gradingParameterData merge-at-one-level,
  resetPrior atomic Ebisu reset).

- `src/services/backend-service.ts::updateCardMetadata` — ACL
  method paired to `PATCH /cards/{card_id}`. Composes the wire
  body from changed fields only (absent stays absent so the
  backend's "absent → preserve" semantics apply); projects
  domain `gradingParameterData` through the one-level
  `grading_parameter.data` wire wrapper; re-projects the
  returned `CardWithRecall` through `mapToReviewCard`.

### Inline-edit panel (commit `b870359`)

`src/components/CardMetadataPanel.vue` — shared inline-edit
surface for the arc-2 PATCH endpoint. Initially mounted in
`ReviewSessionPanel`; Browse / Lineage Explorer mount followed
in the next commit (see "Browse-mount + suspended-card
visibility" below). Field-level behaviour per the dispatch's
reply commitments:

- **Tags** — chip-based input with autocomplete from
  `store.profile.knownTags` (matches the `MintCardModal`
  convention). Enter / comma commits; Backspace on empty input
  pops the last chip; full-replacement PATCH on every chip
  add/remove (matches the backend's three-way `null` / `[]` /
  `[...]` contract: the UI always sends the new full set).
- **Target moves** — number input, save-on-blur. When the field
  is dirty, an inline `reset_prior` checkbox appears with the
  worded prompt the reply committed to ("this card's review
  history was based on a different target moves value; do you
  want to start its review schedule over?"). The next blur
  sends `numMoves + resetPrior` atomically — exercising the
  backend's atomic-reset contract.
- **Gamma** — number input with local (0, 1) validation before
  the wire round-trip; mirrors the Pydantic constraint.
- **Default visits** — number input, positive int. Frontend-
  owned opaque key under `grading_parameter.data` per Ask 3
  Path 1 (free-form blob on the edit form).
- **Suspended** — toggle, fires immediately on change.
- **Analysis config** — read-only marker with a tooltip stating
  the deferral. The user wants design space around
  `data.analysis_config` editing's downstream effects before
  exposing a UI surface.
- **Standalone reset-prior button** — at the panel bottom,
  `window.confirm()`-gated, for the "prior corrupted by
  mistaken reviews" case the dispatch identified. The
  `resetPrior` flag is reachable independent of `numMoves`,
  matching the reply commitment.

The panel emits typed `CardMetadataPatch`; the mounting
component (ReviewSessionPanel or ForestDirectory) runs the ACL
round-trip, splices the returned `ReviewCard` into local state,
and surfaces 422 / network errors as system messages per
ADR-0002. The panel is `disabled` for the duration of an
in-flight save so concurrent edits can't pile up.

### Suspended-card pipeline filter (commit `b870359`)

`useReviewSession.startSession` filters `prefetchedQueue` to
drop suspended cards before entering the LOADING state. The
filter lives at the queue boundary so it applies uniformly
across the ForestDirectory deck-run path and the autonomous-SR
driver. If the deck DSL eventually grows a `~$suspended`
virtual tag (the longer-term path the reply mentioned), this
filter stays as a defensive fallback.

### Browse-mount + visibility (commit `6f4652b`)

The dispatch reply's "two surfaces" commitment was completed
here:

- **Browse-mount.** Clicking a node in the Lineage Explorer
  populates a `selectedCardId` ref on `ForestDirectory`. The
  metadata panel mounts below the tree widget when a card is
  selected, so the user can inspect / edit a card's metadata
  (suspended flag in particular) without first starting a
  review session.

- **Loud signal on all-/some-suspended `startSession`.** When
  the suspended-filter drops cards, a system message surfaces
  (ADR-0002: fail loudly):
    - All matched cards suspended → `warning`, naming the count
      and pointing the user at Browse / Lineage to unsuspend.
      Closes the silent-IDLE symptom on legacy decks where every
      card had been suspended.
    - Some cards suspended → `info`, naming the dropped count
      vs total.

  Empty `prefetchedQueue` itself keeps the silent IDLE — the
  pipeline gave nothing to act on.

### Visual indicators (commits `932edf3`, `81e9242`, `3fc901a`)

- **💤 stamp on suspended cards** in the Lineage Explorer tree
  (`position: 'inside'`, font 14). Lets the user scan a tree
  visually for what to unsuspend. Stubs and buckets aren't
  decorated even when an underlying card is suspended, since a
  stub summarises a subtree where suspension wouldn't
  necessarily apply to every descendant.

- **Selected card paints green** in the Lineage Explorer tree
  via a `selectedCardId` prop on `CardTreeWidget`. Precedence:
  `isSelected (green) > isCurrent (orange) > role default`.
  Stubs honour the same precedence with their head `cardId`.

- **Panel header names the card** ("Card metadata — Card
  {cardId}") so the user can tell at a glance which card the
  form refers to when switching between siblings in a deep
  tree.

### Post-arc fixes (PRs #215, #216)

- **Pre-arc-1 persisted-queue crash** (PR #215, commit
  `27d5ef4`). Runtime crash via RootErrorBoundary when starting
  a review session against a queue persisted before arc-1
  shipped: `props.card.tags is undefined`. Two-pronged fix:
    - **Schema migration 34 → 35** walks
      `session.reviews[*].queue[*]` and backfills `tags: []` on
      any card missing the field. Idempotent.
    - **Defensive normalisation** in `CardMetadataPanel`'s
      props handling so the panel doesn't depend on the
      migration having run.
  This is the SyncService-snapshots-whatever-was-in-memory
  failure mode applied to a wire-additive change; not a backend
  contract issue.

- **Lineage Explorer current-card overlay orange** (PR #216,
  commit `c02c5ca`). Substrate-tuning issue: the `current`
  card overlay was rendering red because `--player-white`
  resolves to `--state-error` in the dark theme — a stale
  comment misled the original choice. Fix introduces a new
  `--review-current-card` substrate alias targeted at
  `--accent-secondary` (the canonical orange CTA / current-
  card handle). Not arc-2-specific; surfaced more visibly once
  the `selectedCardId`-paints-green precedence above made the
  current-card overlay a focal point.

## Backend contract honoured

The frontend's consumer-side build honours the contract recorded
in the negotiation dispatch:

- **`grading_parameter` merge depth.** The PATCH body sends just
  the keys the user touched: `{ grading_parameter: { data: {
  <changed keys only> } } }`. Sibling `data` keys (e.g.
  `analysis_config`) are left untouched on the wire so the
  backend's one-level merge preserves them. Matches the reply
  commitment verbatim.
- **`reset_prior` opt-in.** Surfaced as an explicit affordance
  with the dispatch-committed worded prompt when `num_moves`
  changes; reachable as a standalone affordance with
  `window.confirm()` gating per the "destructive on opt-in"
  posture.
- **`suspended` toggle.** Prominent toggle in the inline panel;
  suspended cards filtered post-fetch from the review queue
  with a loud system message when the filter drops anything.
- **`tags` full-replacement.** The chip-based input sends the
  new full set on every add/remove. No merge ambiguity.
- **Ask 3 — Path 1 (free-form `data`).** Field-per-key UI for
  the known keys (`gamma`, `defaultVisits`, with
  `analysis_config` deferred). The eventual ledger note
  recording the known keys is open work; the inline-edit ship
  doesn't gate on it.

## Open / deferred (frontend-side only)

The dispatch reply called out a handful of items the frontend
explicitly deferred or left as follow-up work; recording them
here so the chain closure is honest:

- **Optimistic local update + rollback on 422.** Current shape
  is pessimistic: locally validate → PATCH → splice on response
  → 422 system message + queue unchanged. The optimistic shape
  the reply mentioned ("optimistic local update + rollback on
  422") is on the roadmap but not in this ship; the pessimistic
  shape is correct end-to-end and not the latency-sensitive
  failure mode that motivated the original commitment.
- **Inline editing of `analysis_config`.** Read-only marker
  with a tooltip until the user works out design space for the
  downstream effects.
- **Ledger note for known `grading_parameter.data` keys.** The
  reply mentioned leaving a `docs/notes/` note recording the
  known keys as a starting point for the eventual Path-2
  formalisation. Not done; flagged as the natural companion
  arc when Path 2 becomes the next move.

None of these block the inline-edit feature being live on
`main`; they are smaller polish / discipline items the user
will reach when the shape settles through use.

## Verification

`npm run build` passes; 197/197 frontend tests pass across the
arc-2 consumer ship and both follow-up PRs.

## Reply

No reply requested. The chain is closed — both arcs shipped on
both sides; the wire contract is settled end-to-end. Future
work on `grading_parameter.data` (the eventual Path-2
formalisation per Ask 3) will open its own dispatch arc.
