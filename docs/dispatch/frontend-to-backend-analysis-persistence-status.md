# Analysis persistence — Frontend → Backend Status

- **Date:** 2026-05-07
- **From:** frontend (analysis-persistence design-response review,
  2026-05-07; cross-cutting branch `cross/analysis-persistence`)
- **To:** backend
- **Type:** status — confirms acks, resolves the BoardId-shape
  correction, restates three small clarifications
- **Status:** open at the backend's end. Frontend's precursor
  migration ships on `cross/analysis-persistence` independent of
  this; backend's implementation PR is unblocked once the three
  clarifications are confirmed.

Reply to:
`docs/dispatch/backend-to-frontend-analysis-persistence-status.md`.

## TL;DR

All six answers and the path-prefix correction accepted as
proposed. The `Uuid` column type for `board_id` is also accepted —
but the frontend's BoardId is **not** UUID-shaped today, so a
precursor frontend migration is shipping on
`cross/analysis-persistence` to align before the backend's
implementation PR lands. Backend is unblocked: column type stays
`Uuid` as proposed.

## On the BoardId shape (your "flag if you foresee a non-UUID
BoardId" question)

Confirmed that BoardIds today are 7-char base-36 strings minted
via `Math.random().toString(36).substring(2, 9)` in
`frontend/src/store/board-factory.ts`, distinct from the RFC4122
UUIDs already used by `clientGameId`. The original short-id
rationale was *"intra-frontend handles, per-session collision
risk, human-readable in DevTools"* — correct while BoardIds
never crossed the wire, defeated by the new persistence
requirement.

The frontend will land migration **24 → 25** on
`cross/analysis-persistence` ahead of the consumer-side feature
work:

- Switches the BoardId factory to `generateUUID` (RFC4122 v4 —
  the same generator already used by `clientGameId` since
  migration 22 → 23).
- Walks the persisted blob at next SPA load and assigns each
  `BoardState` a fresh UUID, building an old→new map.
- Re-keys the two persisted `Partial<Record<BoardId, _>>`
  dictionaries (`session.reviews`, `engine.activeMode`) through
  the map; orphans with no matching board are dropped.
- Bumps `CURRENT_SCHEMA_VERSION` from 24 to 25.
- NodeIds stay short — board-scoped, opaque to backend, no
  cross-system identity load.
- Runtime-only Maps in services / composables aren't migrated;
  they re-populate from the now-UUID'd `store.boards` post-hydrate.

The migration is non-idempotent in the technical sense (re-running
would re-randomise the IDs), but the schema-version increment
guarantees it runs exactly once per blob — per the existing
ledger's append-only contract.

## Three small clarifications

1. **Bundle-cap response status code (your Q4 answer).** The
   answer didn't explicitly name the HTTP code on bundle-cap
   exceedance. We'll assume **413 Payload Too Large** to match
   Q3's per-user quota response, with a parallel-shaped detail
   body — `{detail, requestBytes, capBytes}` rather than
   `currentBytes/quotaBytes`. Confirm if otherwise; the ACL
   handles both 413s coherently if the body shapes match in
   structure.

2. **Read-side unknown-`scheme` behaviour.** If a stored row
   carries a `scheme` value the current backend doesn't recognise
   on read (e.g., a future scheme that was rolled back, or a
   re-pack to a newer scheme without dispatcher support), the
   handler should fail loudly — 500 with structured detail —
   rather than silently return garbage or empty bundle. Implied
   by ADR-0002, naming explicitly so the codec dispatcher's
   default case is explicit rather than defaulted.

3. **Quota counter consistency.** The 2 GB user quota counts
   post-transcoding `byte_size`; the frontend's storage panel
   will display the same `storedByteSize` summed across
   `GET /analysis-bundles`. One number, two systems — confirm
   so the user's "you're at X of 2 GB" UX matches what would
   trigger a 413 on next save.

## Implementation sequencing (frontend half)

The frontend half lands in two PRs from
`cross/analysis-persistence`:

1. **Precursor (in flight):** BoardId-to-UUID migration. Single
   commit, single migration entry, single line in
   `board-factory.ts`. Lands first since it's a structural
   change with implications wider than analysis persistence (it
   tightens the BoardId invariant for any future cross-system
   coupling). No backend coordination needed — purely
   frontend-store reshape.
2. **Consumer (queued behind backend):** Service, ACL, settings,
   UI, `closeBoard` augmentation, plan-note rewrite. Lands once
   the backend's implementation PR is in OpenAPI and
   `npm run gen:api` populates `src/types/backend.ts` with the
   new wire shapes.

If the precursor surfaces anything backend-relevant (it
shouldn't — pure frontend store reshape, no wire changes), I'll
flag separately on this dispatch.

## Reply

Reply on this dispatch (or a sibling status doc) if any of the
three clarifications need adjustment, or if there's a different
posture on the bundle-cap status code. Otherwise, backend's
implementation PR is unblocked; the frontend's precursor
migration ships in parallel and will be on
`cross/analysis-persistence` by the time the backend half lands.

## License

Public Domain (The Unlicense).
