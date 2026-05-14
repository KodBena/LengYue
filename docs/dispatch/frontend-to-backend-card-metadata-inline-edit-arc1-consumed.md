# Card-metadata inline edit — Arc 1 consumed (tags on read)

- **Date:** 2026-05-14
- **From:** frontend
- **To:** backend
- **Type:** reciprocal consumed-status notification — arc 1 of
  the card-metadata inline-edit arc is consumed on the frontend
  side; the wire-shape change has settled end-to-end.
- **Status:** shipped to `main`. Closes the open invitation in
  `backend-to-frontend-card-metadata-inline-edit-arc1-shipped.md`
  for a reciprocal frontend dispatch.

## TL;DR

Backend arc 1 (PR #212) added `tags: List[str]` to
`CardWithRecall`. The frontend consumed it in commit
`564b3e0` ("frontend(feat): consume card-metadata arc 1 — tags
on read"), merged via PR #213's predecessor branch. The change
is purely mechanical at this layer — codegen refresh, one ACL
mapping line, one domain-type field — with downstream consumers
opting in on their own schedule. The Lineage Explorer / Browse
forest view consumption arrived later as part of the arc 2
inline-edit panel landing (PR #214).

## What changed

### Codegen

`frontend/src/types/backend.ts` regenerated via `npm run gen:api`
against the arc-1 backend. The diff picks up:

- `CardWithRecall.tags?: string[]` — Pydantic's
  `Field(default_factory=list)` projects to OpenAPI as optional,
  so the wire type is `?: string[]` even though the field is
  always serialised. The ACL coerces `undefined → []` at the
  boundary so callers don't branch on absence.

(One unrelated docstring tweak on `/resources/{name}` came along
on the same regeneration; flagged in the commit message.)

### Domain type

`frontend/src/types.ts::ReviewCard` gains `tags: readonly
string[]`. Always present on the domain side — the ACL is the
single boundary where absence is handled, so every downstream
consumer reads a guaranteed array.

### ACL

`frontend/src/services/backend-service.ts::mapToReviewCard`
gains one line:

```ts
tags: raw.tags ?? []
```

Matches the `card_source_id ?? undefined` defensive-coercion
posture already in that function. The `?? []` shape composes
with the same SyncService-persisted-queue compatibility concern
that arc-2 surfaced separately (see the arc-2-consumed
reciprocal for that fix).

## Backend-side guarantees consumed

The frontend relies on the three guarantees the arc-1 shipped
notice named:

1. **Always present** (never undefined / null) on fresh fetches.
2. **Deterministic order** (alphabetical, stable across reads).
3. **Strings only** — plain tag names, no virtual-tag DSL syntax.

(1) is honoured by the ACL's `?? []` coercion for fresh fetches,
and by the schema-migration 34 → 35 that arc-2 shipped to handle
pre-arc-1 persisted-queue cards. (2) and (3) flow through
unchanged — the frontend treats the wire array as authoritative.

## Verification

`npm run build` passes; 197/197 frontend tests pass at the
arc-1 ship.

## What's next

Arc 2 (the `PATCH /cards/{card_id}` consumer-side build) is
recorded in the sibling
`frontend-to-backend-card-metadata-inline-edit-arc2-consumed.md`.
The downstream `tags` consumers (Lineage Explorer tree, the
`CardMetadataPanel`'s chip-based editor) ship as part of arc 2,
since the inline-edit panel is where the tags surface visually
in the SPA.

## Reply

No reply requested. The chain is closed — both arcs shipped on
both sides; the wire contract is settled.
