# Card-metadata inline edit — Frontend → Backend

- **Date:** 2026-05-13
- **From:** frontend (polish-arc session, 2026-05-13)
- **To:** backend
- **Type:** new-feature wire-shape proposal — sketch + asks,
  awaiting sign-off before either side ships.
- **Status:** open. Authored as the cross-boundary surfacing
  step for a frontend-side polish item that the frontend cannot
  close unilaterally; awaiting backend acknowledgement of the
  three asks below.

## TL;DR

The mint modal collects per-card metadata (target moves,
default visits, discount γ, analysis palette, tags, lineage)
and ships it to the backend. After mint, none of that metadata
is reachable from the chrome — `ReviewSessionPanel` does not
show it during review; `ForestTreeNav`'s card-tree visualisation
shows none of it on selection; `MintCardModal` is the only
surface that knows about these fields, and it is a creation
surface, not a per-card display.

The polish ask from the frontend side is "show the metadata
whenever a card is active, and let me edit it inline at that
surface." Surveying the frontend reveals two blockers that fall
on the backend's side of the contract:

1. **Tags are write-only at mint.** `CardCreate` accepts a
   `tags` field; `CardWithRecall` (and every other card-read
   wire shape we consume) does not return one. The frontend
   cannot display tags it cannot read.
2. **No edit endpoint exists.** The card surface in the ACL
   exposes `createCard` (POST /cards/), `fetchCard`
   (GET /cards/{id}), and `submitReview`
   (POST /cards/{id}/review). There is no PUT, PATCH, or other
   verb that admits a metadata change. "Mint once, can't change
   afterward" is the current model.

This dispatch is the cross-boundary surface for the asks below.
The frontend-side inline-edit UI is the *consumer* of whatever
contract the backend signs off on; we hold off on building it
until the contract is agreed.

## Three asks

### Ask 1 — Tags on read

Add a `tags` field to `CardWithRecall` (and any other read
shape that returns the card body — the queue-fetch route, the
forest-stats route if it reaches card-level granularity).
Shape:

```json
"tags": ["joseki", "shape", "endgame"]
```

A list of strings (plain tags only — virtual tags are a
deck-pipeline DSL construct and aren't per-card metadata).
Empty list `[]` when the card has no tags; not `null`. This
mirrors `CardCreate`'s accepted `tags` field; the asymmetry
"send-only on create" is the bug shape the field-on-read fixes.

If the JOIN cost on the queue-fetch route is a concern, we can
gate the field on a query parameter (`include_tags=true`) so
the high-frequency read path is opt-in. Operational call;
either shape works on the consumer side.

### Ask 2 — PATCH /cards/{card_id} for metadata edits

A partial-update endpoint that admits the following mutable
subset:

```json
PATCH /cards/{card_id}
{
  "tags":           ["joseki", "shape"],          // optional
  "default_visits": 1500,                          // optional
  "gamma":          0.95,                          // optional
  "grading_parameter": {                           // optional
    "data": { "analysis_config": { ... } }
  },
  "num_moves":      8                              // optional
}
```

Partial-update semantics: any field absent from the body is
left unchanged. Fields explicitly set to `null` are
distinguishable from "absent" only where the schema admits
nullability (none of the above do today).

**Out of scope for this ask.** Lineage edits (`parent_id` /
`card_source_id`) — changing a card's parent has heredity-tree
ramifications we have not thought through and would surprise
the review-session scheduler. If the user wants to rebranch
the lineage, the right surface is "delete this card and mint
a new one with the right parent", not a PATCH.

Response: the updated `CardWithRecall` (with the tags field
populated per Ask 1), so the frontend can `ledger.put`-style
swap the cached card body without a follow-up GET.

Validation rules follow `CardCreate`'s today — same per-field
constraints, same 422 shape on violation. ADR-0002: no silent
coercion on the edit path either (the create path's validation
discipline applies symmetrically).

### Ask 3 — Authority over the `gradingParameter.data` shape

The frontend treats `gradingParameter.data` as an opaque dict
today; `useReviewSession.ts` reads `data.analysis_config` to
override the active palette at review time. If the backend has
a contract for what keys are valid under `data.*` (or which
ones the edit endpoint admits), surface it. Otherwise the
frontend will treat `data` as a free-form `Record<string, any>`
on the edit form, which propagates the existing opacity into
the user-edit surface — not ideal, but tolerable until the
shape firms up.

This is the same "rough edge" the handoff calls out:

> The most opaque field in the domain model —
> `Record<string, any>` because the inner shape is
> application-defined and changes frequently. … If the inner
> shape ever stabilizes enough to deserve a typed schema,
> formalize it in `types.ts` and tighten the access sites; don't
> let the `Record<string, any>` become permanent through inertia.

The inline-edit surface is exactly the kind of consumer where
the opacity bites — if the user changes their palette mid-card,
they want the field to update cleanly, not to dispatch on
internal keys the frontend has guessed at. A short note from
the backend ("the contract is X" / "still opaque, hold off")
unblocks either path.

## Frontend-side shape (what we will build against the contract)

Sketched here for visibility; will not ship until the contract
is signed off.

- **Where the metadata surfaces.** A small "Card details"
  section in `ReviewSessionPanel.vue` (visible while
  `currentCard !== null`), and a sibling section in the Browse
  forest view when a card node is selected (today's
  `NavSelection.kind === 'root'` already gives us the hook,
  but the surface is currently empty).
- **What inline-edit looks like.** Click-to-edit affordance per
  field (tags as a comma-separated input with autocomplete from
  `store.profile.knownTags`; gamma / defaultVisits as number
  inputs; palette as a dropdown over the user's palette
  catalog; numMoves as a number input). Save on blur or
  Enter, optimistic local update, ACL call. ADR-0002 applies:
  a 422 surfaces as a system-message error and reverts the
  local update; we do not silently swallow.
- **What it does NOT do.** No lineage edits (per Ask 2). No
  suspend / unsuspend (that's a separate review-lifecycle
  affordance, not metadata). No reviewing inline — the existing
  review-session state machine stays the only path to grading.

## Reply

Counter-replies on a sibling dispatch
(`backend-to-frontend-card-metadata-inline-edit-status.md`).
"Contract accepted as proposed" lets the frontend open the
inline-edit branch. Alternative wire shapes, additional
validation constraints, or pushback on any of the three asks
also pause the arc — we revise the contract before either side
commits code.

The cheapest moment to revise is now; flag anything in this
sketch that doesn't fit the backend's intuitions cleanly.
