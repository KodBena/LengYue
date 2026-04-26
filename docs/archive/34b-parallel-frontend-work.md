# Frontend Parallel Work — Triage Companion to TODO.md

This document is a companion to `TODO.md` and `34b-frontend-brief.md`.
It identifies which TODO items the frontend dev can work on **in
parallel with 34b** without creating merge conflicts, which items
should queue **after** 34b lands, and which depend on other items
first.

## TL;DR — safe to start today

Eight items can ship in parallel with 34b, in roughly this order
(ordered so that prerequisite items land first):

1. **Item 5** — delete the dead 404 branch in `sync-service.ts` (5 min)
2. **Item 6** — remove or populate the ghost `AppSettings` fields (10 min)
3. **Item 22** — replace hardcoded backend URLs with `import.meta.env.VITE_*` (30 min)
4. **Item 19** — apply item 22's pattern to `resource-service.ts` (15 min)
5. **Item 20** — route API and sync errors through `pushSystemMessage` (30 min)
6. **Item 21** — add timeout and reset path to the KataGo wait in `useReviewSession` (30 min)
7. **Item 27** (minimal version) — document the sync last-write-wins invariant (10 min)
8. **Item 17** — resolve the three-channel `SyncService` ambiguity (45 min; design decision required)

None of these touch the four files that 34b modifies in ways that
create merge conflicts.

## Queue behind 34b

These items touch code regions that 34b is also rewriting. Working
on them in parallel creates a three-way merge you don't want:

- **Item 18** (`current_recall` / `halflife_units`) — modifies the
  same `mapToReviewCard` function in `services/ebisu-service.ts` that
  34b updates. Do this AFTER 34b lands on the frontend side.

- **Item 29** (ACL exceptions) — touches `grading_parameter` read
  paths in both `ebisu-service.ts` and `useReviewSession.ts`. 34b
  reshapes some of those paths. Sequence it after 34b.

- **Item 28** (JWT 401 retry) — depends on item 20's
  `pushSystemMessage` plumbing for the recovery message. Do 20 first,
  then 28. Can land before or after 34b; the file overlap with 34b
  in `api-client.ts` is minor (34b doesn't actually modify
  `api-client.ts`, only types it interacts with).

## Queue after item 30 (codegen)

- **Item 30** — OpenAPI → TypeScript codegen. Worth waiting until
  34b is complete on the backend side; regenerating types mid-
  transition will produce churn because the backend wire shape is
  intentionally moving during 34b.

- **Item 31** — typed pipeline DSL on the frontend. Requires item 30
  to land first (item 30 will generate the types item 31 consumes).

## Preparation — two decisions worth locking in now

Neither requires code; both unblock faster iteration.

### Decision 1: Pick the OpenAPI codegen tool for item 30

The backend publishes an OpenAPI schema at `/openapi.json`
automatically. Three tools could consume it:

- **`openapi-typescript`** — lightweight; outputs a single `.d.ts`
  file describing the schema. No fetch client changes needed; the
  existing `ApiClient.request<T>` wrapper stays as-is. Smallest
  footprint, fastest setup.
- **`orval`** — full client generation including typed fetch
  wrappers. Heavier but richer. Requires rewriting `ApiClient`.
- **`openapi-generator`** — the most heavyweight of the three; more
  language targets than needed.

Recommended: `openapi-typescript`. It matches the current
hand-rolled shape of `types.ts` most closely, and keeps the existing
client wrapper layer in place. The other two would require more
invasive changes.

### Decision 2: Agree on the VITE_* environment variable names for item 22

Three hardcoded URLs need variables:

- `VITE_API_BASE_URL` — currently `'http://localhost:8764'` in
  `services/api-client.ts`
- `VITE_RESOURCE_BASE_URL` — currently
  `'http://127.0.0.1:8765/api/resources'` in `services/resource-service.ts`
- Possibly a WebSocket URL if that's hardcoded too

Names locked in now save naming churn during items 22 and 19.

## Per-item notes for the green-light set

Quick guidance on items with design decisions or gotchas. TODO.md
has the full context for each — these are the tips that aren't in
the TODO but that save thinking time.

### Item 5 (dead 404 branch)

The backend returns `200 {data: {}}` for a missing document, not
404. The branch `if (err.message.includes('404'))` literally cannot
fire. Delete it and add a one-line comment to `SyncService.connect()`
noting the "missing = empty" contract.

### Item 6 (ghost AppSettings fields)

Two paths:
- **Delete the fields** from `types.ts` if the app doesn't use them
  anywhere. Fastest.
- **Add defaults** to `store/defaults.ts` if the fields will be used
  soon (e.g., auto-connect to KataGo on app launch).

Grep `autoConnect` and `extensionCapabilities` across the codebase
before choosing. If only `types.ts` mentions them, delete.

### Item 22 (VITE_* env vars)

- Add `.env.example` at the repo root documenting each variable with
  a sensible local default.
- Add `.env` to `.gitignore` if not already there.
- Read the variables via `import.meta.env.VITE_API_BASE_URL` etc.
- For each URL: `const BASE_URL = import.meta.env.VITE_API_BASE_URL
  ?? 'http://localhost:8764';` — keep the fallback to preserve
  zero-config local dev.

### Item 19 (resource-service URL)

Same pattern as item 22. Add a prominent comment at the top of
`resource-service.ts`: *"This is a DIFFERENT backend than
`api-client.ts`'s — KataGo analysis side, not the Ebisu API side."*
Easy to confuse them later.

### Item 20 (pushSystemMessage wiring)

- `api-client.ts` → `pushSystemMessage('error', ...)` on non-2xx
  responses. Include the HTTP status and URL path.
- `sync-service.ts` → `pushSystemMessage('error', ...)` on sync
  failures, `pushSystemMessage('info', ...)` on successful initial
  hydration (one-shot, not on every subsequent sync).
- Use `console.error` as a SECONDARY output for debugging — don't
  remove it — but make the user-visible system log the primary
  surface.

### Item 21 (KataGo timeout)

Design the reset path carefully:
- Timeout duration: configurable via a constant at the top of
  `useReviewSession.ts` (e.g., `KATAGO_ANALYSIS_TIMEOUT_MS = 30000`).
- On timeout: unwatch the ledger, reset status to `IDLE`,
  `pushSystemMessage('warning', 'KataGo did not respond within 30s.
  Review cancelled.')`.
- Do NOT retry automatically; the user can re-trigger the review
  manually. Automatic retry can mask real engine problems.
- Add an abort signal pattern if the review session is destroyed
  (e.g., user navigates away); otherwise the setTimeout leaks.

### Item 27 minimal (sync invariant documentation)

- In `sync-service.ts`, add a block comment near `sendSync()`:
  *"Sync is last-write-wins. Assumes single-tab-per-tenant. Two
  browser tabs against the same account will silently overwrite
  each other."*
- Same comment in `api/routes/documents.py::update_document` on the
  backend.
- One-line addition to README's Sync section.

This is the "document the invariant" path, not the ETag path. The
ETag path is a multi-day change with UI implications; only pursue
if multi-tab use is actually a known workflow.

### Item 17 (SyncService three-channel)

This needs a design call before code. Two viable answers:

- **A — Collapse to a single watcher.** The three-channel structure
  is dead weight; a single watcher over the entire blob with a
  single debounce matches what `sendSync()` already does.

- **B — Split into three document keys.** Each channel gets its own
  key (`"ui-boards"`, `"ui-profile"`, `"ui-session"`) and writes
  independently. Reduces payload size per write; adds complexity in
  the join at hydration time.

Pick A unless there's a concrete reason the blob size is a problem.
Document the choice wherever the watcher setup lives.

## Suggested work sequence

Day 1 (parallel with backend Commit 1 landing):
- Morning: items 5, 6, 22 (all small; items 5 and 6 are near-instant)
- Afternoon: items 19, 20, 21 (item 19 uses 22's pattern; 20 and 21
  are independent)

Day 2 (waiting/testing 34b or 34b-free):
- Item 27-minimal (10 min)
- Item 17 (needs the design decision)

Day 3+ (after 34b lands on frontend side):
- Item 18 (dead bytes cleanup)
- Item 28 (JWT retry — needs item 20's plumbing from Day 1)
- Item 29 (ACL exceptions)

Day N (when ready for the bigger pass):
- Item 30 (codegen pipeline)
- Item 31 (typed pipeline DSL consumption)

## How this interacts with 34b

The eight parallel-safe items are deliberately picked to not touch
the four files 34b modifies:

- 34b modifies `types.ts` (only the `CardCreatePayload` interface)
- 34b modifies `composables/useMinting.ts` (only the `prepareDraft`
  function body)
- 34b modifies `components/MintCardModal.vue` (one v-model binding)
- 34b modifies `services/ebisu-service.ts` (only the
  `mapToReviewCard` function body)

Items 5, 17, 19, 20, 21, 27 touch different files entirely. Item 6
touches `types.ts` but in a different region (AppSettings, not
CardCreatePayload). Item 22 touches `api-client.ts`, which 34b
doesn't modify.

Merge conflicts should be zero if the parallel items land on
separate commits.

## Questions

If anything about this triage is unclear — or if the "day 1 / day 2"
sequencing doesn't match the frontend dev's own rhythm — let the
backend team know and it can be rearranged. The safety properties
(which items conflict with 34b) are the invariants; the ordering
between safe items is a preference, not a requirement.
