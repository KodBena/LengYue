# qEUBO integration — successor-session map

This is a navigation map for sessions that need to work on the
qEUBO preference-based optimisation integration. **It is not a
substitute for the canonical sources** — the dispatch at
`docs/dispatch/frontend-to-backend-qeubo-integration.md` is the
SoT for the protocol design; `backend/qeubo/README.md` is the SoT
for the public API contract; per-PR worklog entries record what
shipped and when. This file's role is to triage *which sources to
read in what order, given your role*, plus track status, open
items, and the maintenance contract.

Per ADR-0005 Rule 1, this note describes relations between
documents; it does not restate their content. If a section here
appears to disagree with the dispatch or README, the dispatch /
README win and this file needs updating.

## Track triage — what to read by role

### Backend route-implementer (next backend qEUBO session)

You are writing `backend/api/routes/qeubo.py` and any sibling
public-domain encode/decode utility module. Read order:

1. `docs/dispatch/frontend-to-backend-qeubo-integration.md` —
   Part 1 (architecture overview), §2.3 (encode/decode in PD
   code), §2.4 (the six REST endpoints), §2.5 (server-side
   schema), Part 4 (wire contract), Part 5 verification
   checklist, revision history.
2. `backend/qeubo/README.md` — the public API contract you call
   into. **Read this INSTEAD of the runtime's `.py` source.**
3. `backend/NOTICE` — the licensing boundary you preserve.

**You must NOT read `backend/qeubo/runtime/*.py` source.** The
runtime is MIT-derivative; reading its source while authoring PD
code taints the PD code with derivative-work obligations. The
README is exhaustive enough that you don't need to.

You will:

- Add `torch`, `botorch`, `gpytorch`, `redis>=4` to
  `backend/requirements.txt` (or a qEUBO-local requirements file
  gated on `QEUBO_ENABLED`).
- Write `backend/api/routes/qeubo.py` against the README's API.
- Write encode/decode logic (plain `(actual − min) / (max − min)`)
  in PD code outside `backend/qeubo/`.
- Wire the FastAPI lifespan to construct an `ExperimentService`
  with a `ThreadPoolExecutor`, gated on `QEUBO_ENABLED`.
- Add the `user_id:`-prefix-on-experiment_id namespacing per
  dispatch §2.4.

### Frontend feature-author (next frontend qEUBO session)

You are writing the schema migration, `useQeubo` composable,
toolbar A/B cluster, bookmarks UI, and the parameter-meta editor
extension. Read order:

1. Dispatch §3 (frontend responsibilities), Part 4 (wire
   contract for the API client), Summary (resolved/open items).
2. `frontend/src/types.ts` — schema landing zone.
3. `frontend/src/store/migrations.ts` — yours becomes 5→6.
4. `frontend/src/services/api-client.ts` — JWT-threading and
   error-surfacing patterns your `qeubo-service.ts` consumes.
5. `frontend/src/composables/useReviewSession.ts` (or another
   substantial composable) — shape your `useQeubo` should follow.

You may read `backend/qeubo/README.md` to verify wire shapes
match what the dispatch claims; not strictly required since
dispatch §2.4 + §3 cover them. Do not read
`backend/qeubo/runtime/*.py` source — same rationale as above.

### User-facing reviewer (project author, post-merge)

When reviewing a successor's qEUBO PR:

1. Dispatch revision history — has the spec changed since the
   PR was opened?
2. Dispatch Summary — resolved/open items list.
3. This note's status table and open items section below.

## Status

| Track | Status | PR | Commit |
|---|---|---|---|
| Dispatch v1 (initial spec) | Merged | #24 | 3b2b0c7 |
| Dispatch v1.1 (licensing correction) | Merged | #25 | 51cabfa |
| Backend MIT wrapper | Merged | #26 | 5f0fcf9 |
| Backend REST routes + encode/decode + deps | In review | — | — |
| Backend MIT runtime compat shims (modern botorch/torch) | In review | — | — |
| Frontend schema migration 5→6 | Not started | — | — |
| Frontend `useQeubo` composable | Not started | — | — |
| Frontend toolbar A/B cluster | Not started | — | — |
| Frontend bookmarks UI | Not started | — | — |
| Frontend parameter-meta editor (in PaletteEditor) | Not started | — | — |
| End-to-end verification with KeyDB | Not started | — | — |

The two remaining halves (backend route handlers, frontend
everything) are independent and can ship in parallel sessions;
they coordinate via the wire contract in dispatch §2.4 / Part 4.

## Outstanding open items

From the dispatch's Summary review focus:

- **Bundled-apply verdict UX (still open).** Dispatch v1.1
  default: "I prefer A" both submits the qEUBO observation AND
  writes A's decoded values into `analysis_env.parameters`. If
  the verdict and apply-action should be separable instead
  (verdict = qEUBO only; a separate "Use A" button writes
  parameters), flag it before the frontend session starts. The
  bundled default's rationale is the user's "hit analyze again"
  framing, implying no second click.
- ~~Three-layer licensing structure~~ — resolved in v1.1.
- ~~Parameter-meta editor placement~~ — resolved as
  PaletteEditor / Analysis Environment view.
- **Runtime compat shims for modern botorch/torch (added).** The
  vendored qEUBO predates botorch ≥0.9's `sample_shape` strictness
  and modern torch's float32 default; `backend/qeubo/runtime/_compat.py`
  carries two import-time shims that bridge the regressions inside MIT
  scope. Documented in `backend/qeubo/README.md` "Compatibility
  envelope" subsection. Future trigger for cleanup: if upstream
  qEUBO becomes maintained again, fork-vendor with patches inlined.
- **KeyDB substituted with Redis.** KeyDB is discontinued upstream;
  the dev machine now runs Redis 8.6.2 on the same port. The wire
  substrate is interchangeable (`redis.asyncio` works against either);
  no code change implied. See `backend/docs/redis-local-resource.md`.

## Licensing discipline (short form)

- The whole `backend/qeubo/` directory tree is MIT (covers
  vendor + runtime). PD code outside this directory must not
  read its `.py` source — only the API contract in
  `backend/qeubo/README.md`.
- The "intermediary preserves obligations" pattern: the runtime
  is the intermediary. PD callers talk to it via documented
  function signatures (a non-copyrightable interface), not via
  source visibility.
- `backend/NOTICE` is the canonical declaration of the boundary,
  parallel to `proxy/NOTICE`.

For full context, see the dispatch's "Licensing" subsection plus
its "Authoring discipline (preserves the boundary)" subsection.

## Maintenance contract

This note is a `living-doc` (per the doc-graph discipline plan's
genre vocabulary, draft). Updated alongside any qEUBO-related PR:

- Status-table row added or moved to "Merged" with PR + commit.
- Open-items section trimmed when items resolve.
- Reading-order guidance updated if new artefacts (new ADRs,
  new sub-modules) become load-bearing.

If you ship qEUBO work, bumping this note's status table is part
of the same PR's documentation follow-up — alongside the worklog
entry and TODO row.

When the integration is fully shipped (every row in the status
table is "Merged"), this note transitions from `living-doc` to
`design-note: implemented` per the doc-graph plan's genre
lifecycle.
