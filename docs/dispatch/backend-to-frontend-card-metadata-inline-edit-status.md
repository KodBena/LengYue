# Card-metadata inline edit — Backend → Frontend (status)

- **Date:** 2026-05-13
- **From:** backend
- **To:** frontend
- **Type:** status reply to
  `frontend-to-backend-card-metadata-inline-edit.md` (sketch +
  asks, 2026-05-13).
- **Status:** open. Contract accepted with one refinement (Ask 1
  shape) and one clarification (Ask 3); the original CA-1 and
  CA-2 counter-asks are settled by project authority (recorded
  inline below). Backend has not started implementation;
  awaiting frontend acknowledgement of the wire shape before
  either side commits code.

## TL;DR

All three asks land on shapes the backend can support. The
specific divergence from the sketch that warrants frontend
acknowledgement before either side codes:

1. **Ask 1 (tags on read):** field added unconditionally to
   `CardWithRecall`; no `include_tags=true` gate. The
   queue-fetch cost is one batched `SELECT` over the IN-set of
   card ids, not an N-row JOIN that multiplies the response.
2. **Ask 2 (PATCH):** mutable subset is `tags`, `num_moves`,
   `suspended`, `grading_parameter` (merge into `data`), plus a
   companion `reset_prior` flag that — when true — resets
   `(α, β, t)`, `last_reviewed_at`, and `num_reviews` to
   defaults atomically with the rest of the patch. `suspended`
   exposure is settled per CA-2; `num_moves` mutability with the
   `reset_prior` opt-in is settled per CA-1. Detail on
   `grading_parameter` merge semantics below.
3. **Ask 3 (`grading_parameter.data`):** the backend reads
   exactly one key from `data`: `gamma`. Everything else under
   `data` is opaque pass-through. Backend has no schema to
   publish — the frontend owns the shape, and the inline-edit
   surface can treat the rest of `data` as free-form on the
   frontend side without breaking any backend contract.

The asks are otherwise compatible with the backend's existing
shape (Clean / Hexagonal layering, tenancy spine, 404-not-403
invariant). The work splits cleanly along the five-layer recipe
in `docs/notes/tenancy.md` §"The architectural seam."

## Per-ask responses

### Ask 1 — Tags on read (accepted; unconditional, not gated)

**Wire shape:** `tags: List[str]` added to `CardWithRecall`
(strings only — plain tags, not virtual). Empty list `[]` when
the card has no tags; never `null`. Matches the dispatch's
proposed shape.

**Where the field lives on the backend side.** Tags are part of
the persisted shape of a card (rows in `card_tag` ⋈ `tag`), not
a wire-only enrichment. The field lands on `Card`
(`domain/card.py`) and `CardWithRecall` inherits it. Default
`Field(default_factory=list)` for frozen-model safety. The Port
contract (`CardRepositoryPort.get_card_by_id` and
`LineageRepositoryPort.fetch_selection`) is unchanged in shape;
the returned `Card`s simply carry a populated `tags` field.

**Implementation cost — and why no `include_tags` gate.**

- `GET /cards/{id}` and `POST /cards/{id}/review`: one extra
  `SELECT tag.name FROM card_tag JOIN tag ON … WHERE card_id =
  :id`. Single-card, low-frequency. Negligible.
- `POST /forests/query` (the queue-fetch route the dispatch
  worries about): one batched
  `SELECT card_id, tag.name FROM card_tag JOIN tag ON … WHERE
  card_id IN (:ids)`, then Python-side `group_by(card_id)` in
  the adapter before the `project_card` loop. The query is
  bounded by queue size (typically ≤50 cards), produces ~3×
  that in rows, runs in milliseconds. Not an N-row multiplication;
  not a JOIN against the materialized pool.

A query-param gate would fragment the wire contract for no real
saving. ADR-0002 applies in spirit — opt-in fields make consumer
code branch on whether they're present, which is exactly the
kind of asymmetry the codegen pipeline polices against.

**Routes the field reaches:**

- `GET /cards/{card_id}` → `CardWithRecall` with `tags`.
- `POST /cards/{card_id}/review` → `CardWithRecall` with `tags`.
- `POST /forests/query` → `List[CardWithRecall]` with `tags`.

Stats routes don't return card bodies, so they're unaffected.

### Ask 2 — `PATCH /cards/{card_id}` (accepted; mutable subset and merge semantics specified)

**Endpoint shape:** as proposed — partial update, accepted fields
listed below, returns the updated `CardWithRecall` (with the
new `tags` field per Ask 1).

**Accepted mutable subset:**

| Field                | Shape                            | Update semantics                                                         |
| -------------------- | -------------------------------- | ------------------------------------------------------------------------ |
| `tags`               | `List[str]` (optional)           | Full replacement (the new full set)                                      |
| `num_moves`          | `int > 0` (optional)             | Direct overwrite                                                         |
| `suspended`          | `bool` (optional)                | Direct overwrite                                                         |
| `grading_parameter`  | `{data: Dict[str, Any]}`         | Merge into `data` (see below)                                            |
| `reset_prior`        | `bool` (optional, default false) | When true: reset `(α, β, t)`, `last_reviewed_at`, `num_reviews` to defaults |

**`num_moves` and `reset_prior` companion semantics.** Changing
`num_moves` on an existing card means the Ebisu prior — shaped
by past reviews against a different `num_moves` value — is
attached to a task that no longer matches the future-review
shape. The discounted-sum arithmetic in
`ReviewService.process_review` (the `n_eff = (1 - γⁿ)/(1 - γ)`
step) silently shifts to a different denominator on the next
submission against the new `num_moves`. This is mathematically
coherent (the latent recall difficulty is the variable the
prior tracks; integrating new task semantics into the existing
posterior is a valid Bayesian operation) but the user is the
correct arbiter of whether the existing posterior is still
informative for the new task.

The `reset_prior: bool` flag is the explicit opt-in for the
"start the prior over" intent. When `reset_prior=true`, the
adapter resets `alpha`, `beta`, `t` to
`config.EBISU_DEFAULT_MODEL`, sets `last_reviewed_at = NULL`,
and `num_reviews = 0`, atomically with whatever other fields
the PATCH body sets. When `reset_prior` is `false` or absent,
the prior fields are untouched. The flag is independent of
`num_moves` — a user can reset the prior without changing
`num_moves` (e.g., they decided their prior was corrupted by
mistaken reviews), or change `num_moves` without resetting
(if they believe the existing posterior carries informative
signal for the new task shape).

The frontend's inline-edit UX is responsible for surfacing the
reset option clearly when the user is changing `num_moves` —
ADR-0002 in spirit: a destructive operation is acceptable when
the user opts in explicitly. Backend's role ends at "accept
the flag; perform the reset when requested."

**`suspended` exposure.** Card suspension is a natural SRS
workflow affordance — surfaced via the same PATCH endpoint
rather than carving out a separate route. The schema's
`card.suspended: Boolean` column has been dormant; this PATCH
is its first write path. Review-session and queue-fetch
treatment of suspended cards is a separate question the
frontend owns (whether suspended cards appear in pipeline
results, what the queue shows them as, etc.); the backend's
role is to honour the column's set value.

**`grading_parameter` merge semantics.** The dispatch's
shape lists `default_visits: 1500` and `gamma: 0.95` as
top-level PATCH fields, but on the wire these live nested under
`grading_parameter.data.*`. The frontend almost certainly wants
to set just `default_visits` without clobbering `analysis_config`
— so the PATCH body for `grading_parameter` is a partial
specification, not a full replacement:

```json
PATCH /cards/{card_id}
{
  "grading_parameter": {
    "data": {
      "default_visits": 1500
    }
  }
}
```

Interpretation: any keys present under `grading_parameter.data`
in the PATCH body overwrite the same-named keys on the stored
`grading_parameter.data`; keys absent in the PATCH body are
preserved untouched. This is JSON-merge-patch semantics at one
level of nesting (`data` only). The outer `grading_parameter`
wrapper itself is also merge-style — if the stored
`grading_parameter` is `null`, the PATCH constructs a new one
with the supplied `data`.

The merge depth is **deliberately one level**, not arbitrary.
Backend treats `data` as opaque (Ask 3); merging at the `data`
key level is the deepest the backend can honestly reason
about. If the frontend wants to wipe a key inside `data`, send
the new full `data` blob explicitly (overwrite-all at the
`data` level is just a complete-replacement PATCH body).

**Tags replacement.** Full replacement, not merge — `tags: []`
means "this card now has no tags." This matches the
frontend's UI affordance ("comma-separated input with
autocomplete", per the dispatch's sketch — the input value IS
the new full tag set). Implementation: delete `card_tag` rows
for this card, then re-attach via the existing
`attach_tags` Port method.

**Validation.** Per-field constraints applied via Pydantic on
the `CardPatch` request schema, with `extra="forbid"` so a
typo'd or unknown top-level key surfaces as a 422 rather than
silently dropping (ADR-0002). The validator for
`grading_parameter.data.gamma` constrains it to `(0.0, 1.0)`
(open interval) — same constraint the review service implicitly
relies on at `n_eff` computation. `num_moves` must be a
positive integer (matching `CardCreate`'s constraint).
`reset_prior` accepts no parameters — it's a flag, not a
configurable reset.

**Response.** Updated `CardWithRecall` projected at write time
(captured `now` for `current_recall`). Frontend can swap the
cached card body via `ledger.put` without a follow-up GET — as
the dispatch proposes.

**Tenancy.** Follows the five-layer recipe in
`docs/notes/tenancy.md` §"The architectural seam":

1. Schema — no new column needed.
2. Adapter — the `UPDATE card SET … WHERE id = :card_id AND
   user_id = :user_id` predicate fusion preserves 404-not-403.
   The tag replacement runs in the same transaction; the
   merge-write to `grading_parameter` is one further UPDATE.
3. Port — new `update_card_metadata(card_id, *, user_id,
   patch: CardMetadataPatch) -> Optional[Card]` method on
   `CardWriteRepositoryPort`. Returns `None` if zero rows
   affected (cross-tenant or non-existent id), the updated
   `Card` otherwise.
4. Service — new `CardService.update_card_metadata(card_id,
   patch, *, user_id)`. Raises `CardNotFoundError` on None
   return from the Port.
5. Route — `PATCH /cards/{card_id}` captures
   `user_id: UserId = Depends(get_current_user_id)`, calls the
   service, maps `CardNotFoundError → 404` and
   `InvalidInputError → 422` via the existing handlers in
   `cards.py`. Transaction boundary via `async with db.begin():`
   in the route.

**Error axes:**

- 404 — `card_id` does not exist OR belongs to a different
  tenant (404-not-403 collapse).
- 422 — Pydantic field-level validation failure OR domain
  invariant (`gamma` out of range, unknown extra key under
  PATCH body, etc.).
- No 413, no 500 specific to this path.

### Ask 3 — Authority over `grading_parameter.data` (clarification, not a change)

The backend's contract is:

- `data.gamma: float | absent` — used by
  `ReviewService.process_review` for the discounted-sum
  arithmetic. If absent, `config.SR_DEFAULT_GAMMA` is used.
  Constraint: in `(0.0, 1.0)` open interval when present.
- **All other keys under `data` are opaque pass-through.** The
  backend stores `grading_parameter` as a JSON blob, returns
  it unchanged on read, and does not introspect anything
  besides `data.gamma`.

The frontend's existing keys (`data.analysis_config`,
`data.default_visits`) are frontend-defined contracts: the
backend persists them, the SR composable on the frontend reads
them. The handoff note's
"`Record<string, any>` rough edge" is accurate — and the
inline-edit surface is exactly where the opacity bites, as the
dispatch correctly identifies.

**Two paths the frontend can take, in increasing order of
discipline:**

1. **Treat `data` as a free-form blob on the edit form.** The
   inline-edit surface offers a JSON editor (or hand-rolled
   field-per-key UI for the known keys); backend signs nothing
   off, the frontend owns the schema entirely.

2. **Frontend formalizes a typed schema for `data` and
   publishes it via the existing wire-shapes reference
   (`docs/wire-schemas.md`).** Backend can mirror the type
   into a Pydantic v2 model in `schemas/card.py` (or a new
   `schemas/grading_parameter.py`) and validate at the PATCH
   boundary against the frontend-authored schema. This is the
   long-term direction the handoff note's rough-edge entry
   points at; the inline-edit arc is a reasonable forcing
   function but not a blocker.

Backend's preference: (1) for the inline-edit ship, (2) as a
later tightening when the frontend's `data` shape has
stabilised enough to be worth pinning down. Both paths
unblock the inline-edit UI today.

## Settled by project authority (2026-05-13)

### CA-1 — `num_moves` mutability + `reset_prior` companion (settled)

Backend's initial recommendation was to push `num_moves` out
of the mutable subset and document delete+remint as the
supported workflow, on the basis that the Bayesian-prior
implications were ambiguous. Project authority overrules: the
user is the correct arbiter of whether the existing prior is
informative for the new task shape, and the SPA offers an
explicit `reset_prior` affordance for the user who wants to
start over.

Result: `num_moves` is in the mutable subset (positive int,
direct overwrite); the PATCH body's `reset_prior: bool` flag
is the explicit prior-reset opt-in, settable independently of
`num_moves`. See the Ask 2 mutable-subset table above for the
full shape.

### CA-2 — `suspended` exposure (settled)

Project authority records: card suspension is a natural
spaced-repetition workflow affordance and should be exposed.
The inline-edit PATCH is the surface.

Result: `suspended: bool` is in the mutable subset of the PATCH
body. The frontend owns the UX (where the affordance surfaces
in the inline-edit panel, how suspended cards are visually
distinguished in the queue and Browse views) and any
review-session-scheduler implications of suspended cards;
backend's contract ends at honouring the column's set value.

## Open

### CA-3 — Tag deletion fallout

The PATCH path's full-replace tag semantics means a card with
the only reference to a given tag can leave that tag row
"orphaned" (no `card_tag` rows reference it). Today, orphaned
tags don't break anything — the tag-DSL filter and stats
queries simply return zero matches against them. We leave the
tag rows in place rather than cascade-cleaning, matching the
existing `attach_tags` discipline (no cleanup on the create
path either). Surfaced for visibility; no action requested.

## Implementation sequencing

If the refinements above land cleanly, backend's intended order
is:

1. **Ask 1 alone, ships first** — additive: new field on
   `Card`, populated by adapter, surfaces on three existing
   routes. No new endpoints. Frontend can consume immediately
   (codegen pipeline picks up the field; the ACL flows it
   through unchanged).
2. **Ask 2 (PATCH)** — new endpoint, new Port method, new
   service method. Frontend's inline-edit UI consumes it.
3. **Ask 3** — no backend code; the dispatch's prose answer is
   the deliverable.

Splitting Ask 1 ahead of Ask 2 gives the frontend a useful
read-side improvement (tags visible in the queue and Browse
forest view) before the edit affordance lands; it also keeps
the PATCH branch small.

## Reply

Counter-replies on this same dispatch (revising in place per
ADR-0005 Rule 8 with a sibling revision note), or a fresh
dispatch if the merge-semantics or unconditional-tags shape
needs an arc of its own. "Refinements acknowledged" lets the
backend open the implementation branch starting with Ask 1.

The CA-1 / CA-2 questions are settled per project authority
(recorded above) and do not need frontend acknowledgement —
they are the decided wire shape, not contestable points.
