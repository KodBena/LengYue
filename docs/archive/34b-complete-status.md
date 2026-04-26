# Ebisu API — Item 34b Complete ✅

**Status:** Merged and verified on both backend and frontend. No action required.

This note confirms the successful completion of the domain-neutral API
rename (item 34b) that we coordinated on previously. The wire contract
is now in its target post-refactor state.

## What shipped

The three-commit sequence described in the original handoff has fully
landed:

| Commit | Where it lives | Status |
|---|---|---|
| Commit 1 — Backend dual-accept / dual-emit + data migration | Ebisu backend | ✅ Merged, verified |
| Commit 2 — Frontend switchover | Frontend | ✅ Merged, verified |
| Commit 3 — Backend cleanup (tight input, permissive output) | Ebisu backend | ✅ Merged, verified |

## Current wire contract

### Request shapes

**`POST /cards/`** now accepts only the new, domain-neutral shape:

```json
{
  "raw_content": "(;GM[1]FF[4]...)",
  "num_moves": 5,
  "grading_parameter": {
    "data": {
      "default_visits": 1000,
      "gamma": 0.9,
      "analysis_config": { ... }
    }
  },
  "tags": [],
  "game_metadata": { "description": "..." }
}
```

Legacy keys (`sgf`, top-level `default_visits`) are rejected with a
422 validation error. This is the correct diagnostic behavior — any
stale client hitting the old shape gets a clear error message naming
the offending field, not a silent misbinding.

### Response shapes

**`GET /cards/{id}`**, **`POST /cards/{id}/review`**, and
**`POST /forests/query`** return responses with BOTH the canonical new
field names AND the legacy field names for backward compatibility
with any still-cached frontend bundles:

```json
{
  "id": 123,
  "canonical_content": "(;GM[1]FF[4]...)",
  "normalized_sgf":    "(;GM[1]FF[4]...)",  // ← stale-client compat
  "grading_parameter": { "data": { "default_visits": 1000, ... } },
  "default_visits": 1000,                    // ← stale-client compat
  "current_recall": 0.85,
  "halflife_units": 24.0,
  // ... other fields
}
```

The two legacy fields (`normalized_sgf`, top-level `default_visits`)
are served via Pydantic `@computed_field` properties — they're
synthesized at response time from the canonical fields
(`canonical_content` and `grading_parameter.data.default_visits`
respectively), so the values are always consistent.

### Static resources

The `/resources/{name}` endpoint is live on the Ebisu backend at the
main API base URL. The `visit-distribution` resource and any others
in the registry are served with an envelope shape
`{"name": "...", "content": {...}}`.

## Timeline for stale-client compat removal

The response-side compat shims (`normalized_sgf` and top-level
`default_visits` on GET responses) are **low-cost permanent residents**
of the backend. They're pure-computed fields with zero runtime
overhead for modern clients that read the canonical names; they only
exist to protect any user whose browser has an old JS bundle cached.

Removal is a **future optional hygiene commit** (labelled "3b" in
the original plan). No specific timeline — the backend team will
reach out when scheduling it, well in advance. At that point the
only frontend dependency will be to confirm that no code paths
still read the legacy field names. The grep targets will be:

- `raw.normalized_sgf` (in any ACL or mapping function)
- `raw.default_visits` at the top level (as opposed to
  `raw.grading_parameter?.data?.default_visits`)

If the fallback chains introduced during the 34b switchover have
been removed already, there's nothing to worry about.

## What's done for you

The following items from the earlier work are now closed and need no
further frontend action:

- ✅ Domain-neutral request/response vocabulary (`raw_content`,
  `canonical_content`)
- ✅ `default_visits` relocated into `grading_parameter.data`
- ✅ ACL mapping in `ebisu-service.ts` handles both wire shapes (can
  be simplified later if desired — see below)
- ✅ `CardCreatePayload` interface reflects the canonical shape
- ✅ `MintCardModal.vue` form binding updated
- ✅ `useMinting.ts` payload construction updated
- ✅ `/resources/{name}` endpoint live on the Ebisu backend
- ✅ `resource-service.ts` migrated to the new endpoint

## Optional cleanup (non-urgent)

Now that the response side is known to be stable and the frontend is
exclusively reading canonical names, the fallback chains in
`ebisu-service.ts::mapToReviewCard` can be simplified whenever
convenient:

**Current (post-switchover, defensive):**
```typescript
sgf: raw.canonical_content ?? raw.normalized_sgf ?? raw.sgf,
defaultVisits: raw.grading_parameter?.data?.default_visits ?? raw.default_visits ?? 1000,
```

**Simplified (after confirming tests still pass):**
```typescript
sgf: raw.canonical_content,
defaultVisits: raw.grading_parameter?.data?.default_visits ?? 1000,
```

This is safe to do any time — the backend always emits
`canonical_content`, and `grading_parameter.data.default_visits` is
guaranteed populated for every card (enforced by the pre-flight check
in the backend's Commit 3 migration). Not required; purely
housekeeping.

## Where we stand architecturally

The Ebisu backend is now a fully domain-neutral spaced-repetition
service. The Go-specific vocabulary has been moved entirely out of
the generic persistence and API layers; what remains of Go-ness lives
inside the domain-specific normalizer (SGF parsing) and the
`grading_parameter.data` JSON blob (KataGo-specific config).

The frontend, as discussed, remains a Go client — your internal
TypeScript type names (`ReviewCard.sgf`, `ReviewCard.defaultVisits`,
etc.) are unchanged, as intended. The anti-corruption layer in
`ebisu-service.ts` is where Go vocabulary meets domain-neutral
vocabulary, and it's doing its job.

## Thanks

The coordination on this one was tight and the timeline from
handoff-brief to merged-and-verified was short. Appreciated.

---

*No reply necessary. This document is confirmation, not a request.*
