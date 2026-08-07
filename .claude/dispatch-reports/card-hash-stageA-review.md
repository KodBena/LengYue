# Review: card-position-annotations Stage A (fresh-context, MANDATORY)

Target: worktree-agent-a38295353ce9aca3c (a487876d/7606aa9a/00297471). Spec:
card-position-annotations-design.md. Build report:
card-hash-stageA-build.md. All findings WITNESSED unless marked otherwise.

## Findings

1. **Tenancy — WITNESSED.** `/positions/hash` is stateless, auth-required
   but `user_id` unused; no persistence, no leak surface. New route test
   `test_forests_query_content_hash_isolated_across_tenants_sharing_position`
   seeds two tenants sharing one `normalized_position` row and asserts
   Bob's card id never appears in Alice's `/forests/query` response — good
   adversarial angle B (shared global hash, per-tenant card-id filtering
   intact). Re-ran it: passes.
2. **Identity fidelity — WITNESSED.** `test_hash_position_matches_minted_card_content_hash`
   round-trips through the real `POST /cards/` mint path and compares
   against the predicted hash — this is the ADR-0021 Rule-1 "observe at
   the site" shape, not a proxy comparison against a second normalizer
   call. Both endpoints call the identical `PositionNormalizerPort`
   instance via DI, so drift is structurally foreclosed, not just tested.
3. **Double-hex bug — WITNESSED regression coverage.** `field_serializer(when_used="json")`
   fix is exercised by `test_forests_query_returns_descendant_pool`
   (asserts `content_hash == hashlib.sha256(...).hexdigest()` off the
   `POST /forests/query` path, which goes through `project_card`'s
   internal python-mode `model_dump()` round-trip — the exact call site
   the bug lived in). Correctly anchored on behavior, not a comment.
4. **Duplicate-warning UX — WITNESSED.** Non-blocking (`checkDuplicate`
   fired without awaiting; `commitMint` unaffected by a positive match).
   `'checking'` in-flight state is separately asserted synchronously
   before the promise resolves (C6). Matches design §4/C10.
5. **Purge-on-identity-flip — WITNESSED.** Registration itself is pinned
   by `teardown-registry-completeness.test.ts`; the end-to-end drain is
   asserted in `auth-lifecycle.test.ts` via a call-count spy on the
   `known-positions:purge` handler through the real logout/401 path —
   not merely unit-testing the module's own `purgeKnownPositions()` in
   isolation (that's covered too, separately, in `known-positions.test.ts`).
6. **Known-gaps honesty — mostly honest, one soft spot.** The bulk-endpoint
   gap, mint-only refresh, and MintCardModal's 502→554-line ADR-0007 overage
   are all disclosed plainly. The brief specifically asked whether the
   report names a card-count threshold where per-card incidental population
   starts to hurt; it doesn't — it states the qualitative caveat
   ("incomplete until fetched at least once") without a number. Minor:
   this is a Stage-A-scope question the design itself only answers for
   Stage B's viewport hashing, not Stage A's incidental population, so I
   read it as an omission worth a nit, not a misrepresentation.
7. **Gates — WITNESSED, re-run myself, all green and matching the report:**
   backend `pytest tests/ -q` → 697 passed, 2 skipped, 1 xfailed;
   frontend `npm run build` → clean; `npx eslint .` → exit 0; frontend
   `npm run test:run` → 1112 passed, 4 skipped, exited normally in 47s (no
   vitest-hang symptom despite vite having drifted to 8.2.0 on this
   branch's dependency graph — worth a watch-item, not a blocker, since it
   ran and exited cleanly here).
8. **Merge vs current `next` — one trivial conflict.** Dry-run merge against
   `next` (which has since absorbed the deck-repeat arc) conflicts only in
   `frontend/src/store/teardown-registrations.ts` — an import-list ordering
   file the module's own header says is "documentation, not enforcement"
   (import order there is non-semantic). No conflict in any Stage-A logic
   file. Trivial to resolve at merge time; not a defect in this diff.

## Verdict

**ACCEPT-WITH-NITS.**

Nits (non-blocking): (a) quantify or explicitly punt on the incidental-population
card-count question in the known-gaps section; (b) resolve the
`teardown-registrations.ts` import-order conflict against current `next`
at merge time.

## Deployment note

`content_hash` and `/positions/hash` are backend-only additive changes —
**the backend process must be restarted** to serve the new route and
widened DTO field; no migration needed (no schema change, `content_hash`
is projected from an existing column).
