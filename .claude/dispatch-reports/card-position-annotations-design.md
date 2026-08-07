# Design: card-position annotations in the game tree

Status: proposal only, no code changes. Author read end-to-end: `frontend/CLAUDE.md`,
`backend/CLAUDE.md`, `docs/handoff-current.md` (backend + de-branding sections).

**Correction to the commission's framing:** the normalizer is **Python**, not Go —
`backend/domain/normalizer.py` (Port) / `backend/domain/sgf_normalizer.py` (Go
adapter) / `backend/domain/normalization.py::normalize_sgf` (the actual algorithm,
`normalize_sgf` at `backend/domain/normalization.py:80`). "Go" in the commission
almost certainly meant the *board game* Go (the domain), not the language — the
codebase is FastAPI/SQLAlchemy end to end. Flagging per ADR-0002 rather than
silently reading past it.

## 1. IDENTITY (the crux)

**Recommendation: do not reimplement `normalize_sgf` client-side. One identity,
one home = the backend's `PositionNormalizerPort`.** Two backend dispatches
needed (below); no client-side normalization port.

Why recompute-locally is the wrong shape: `normalize_sgf`
(`backend/domain/normalization.py:80-151`) round-trips through the `sgf` Python
library's `Sgf_game` parser/serializer (`sgf.Sgf_game.from_string` →
`clean_game.serialise()`) — the exact byte-for-byte output of that serializer
(property ordering, escaping, whitespace) is not a documented spec, it's
"whatever this library emits." A hand-rolled TS reimplementation would need to
match that byte-for-byte to produce the same SHA-256, and any future bump of
the `sgf` library, or edge case in its serializer, silently drifts the two
implementations apart — exactly the "parallel identity that drifts" failure
mode the task calls out. There is also no such library on the frontend today
(`frontend/src/engine/sgf-writer.ts` is a hand-rolled writer with different
goals — see §2).

**What ships instead (two backend dispatch flags):**

1. **`content_hash` added to the `CardWithRecall` wire shape.** Trivial —
   `Card.canonical_content` already carries the string, `content_hash` is
   already stored bytes on `normalized_position` and already computed at
   mint time (`backend/domain/card.py:56-90`, `card_repository.py:199-234`).
   This is a response-shape widen only, no new logic. Every card-fetch path
   the SPA already uses (`GET /cards/{id}`, `POST /forests/query`,
   `PATCH /cards/{id}`) starts carrying the hash for free once this lands.
2. **A stateless `POST /positions/hash` (name TBD) taking `raw_content`,
   returning `content_hash`.** Calls `PositionNormalizerPort.normalize()`
   and returns only the hash — no persistence, no `CardService`, no
   `user_id` scoping needed on the call itself (identity is global, see
   §2). This is the "hash-of-my-position" endpoint the task's Q1 names as
   a fallback; recommending it as the *primary* path, not a fallback,
   because client-side recomputation isn't safely feasible per the above.

This keeps exactly one place that runs `normalize_sgf`: the backend. The SPA's
job becomes: (a) fetch and cache the per-user set of `content_hash` values
already owned (from the widened card responses, no new fetch loop needed
beyond what already populates the store — see §3), and (b) for each tree
node, ask the backend "what hash would this position get" via the stateless
endpoint, then look up that hash in the owned-set. No hashing logic client-side
at all.

Rejected alternative: "ship the normalizer's spec as a shared definition"
(the task's third option) — rejected because the spec *is* "whatever the
`sgf` library's serializer emits," which is not something crisply
specifiable outside re-running that library; a spec doc would itself drift
from the real implementation the way a TS port would.

## 2. NORMALIZATION SEMANTICS

Read directly off `normalize_sgf` (`backend/domain/normalization.py:80-151`):

- **Included in the hash:** board size (`SZ`), handicap stones (`AB`/`AW`
  setup props), handicap count (`HA`), komi (`KM`), and the **main-line move
  sequence in order** (`AB`/`AW`/`SZ`/`KM`/`HA` copied from root; the tree is
  walked via `curr[0]` — first child only — so variations/sidelines are
  dropped, `normalization.py:112-127`).
- **Excluded from the hash:** comments, ruleset (`RU`), player names,
  date/result, every other SGF property (folded into `extras` metadata,
  never into `canonical_content`).
- **No symmetry canonicalization.** No rotation, no reflection, no
  180°-rotation-equivalence, no color swap. Two SGFs that are the identical
  position under a board rotation/mirror hash *differently* — the
  normalizer treats "same position" as "identical move sequence in the
  same order from the same setup," full stop.
- **Move order is NOT canonicalized either** — the hash is over the literal
  played sequence, not the resulting board occupancy. Two games that reach
  the same stone layout via a different move order (a transposition) hash
  differently. (`clean_game.serialise()` serializes the move list, not a
  board-state snapshot.)

**Recommendation for the user-facing warning: match the backend exactly —
literal main-line move sequence + setup + komi, no symmetry, no
transposition-merging.** Building a laxer "same position" notion client-side
(e.g. board-occupancy-only, or symmetry-aware) would produce a warning that
doesn't correspond to what duplicate-minting would actually collide with:
it could warn on non-duplicates (transpositions that wouldn't actually
dedupe) or fail to warn on true dupes reached by a different move order —
either direction erodes trust in the marker. **Named gap vs. user
intuition, to disclose in the UI copy, not silently paper over:** a user
who has card A (their moves) and encounters the *mirrored* version of the
same shape in a different game will get no warning, even though "it's the
same position" is the intuitive read. Worth a one-line note near the marker
("exact move-for-move match") rather than pretending symmetry-awareness
exists.

## 3. FETCH + FRESHNESS

**Endpoint status:** no bulk "all my card hashes" endpoint exists today —
`GET /cards/{id}` and `POST /forests/query` return full `CardWithRecall`
rows (now including `content_hash` per §1) but nothing returns a bare hash
set. **Backend dispatch flag #3 (optional, size-dependent):** either (a) rely
entirely on whatever card rows the SPA already loads via existing flows
(`queryForest`, `fetchCard`) and derive the hash set from those — no new
endpoint, but incomplete until every owned card has been fetched at least
once — or (b) add a thin `GET /cards/hashes` returning `content_hash[]` for
`user_id`, for a guaranteed-complete set independent of what's been
navigated to. **Recommend (b)**: the task's ask is "no matter how they are
encountered, there is no way for the user not to see" — that's a
completeness guarantee (a) cannot make since it depends on incidental
navigation history.

**Size:** thousands of cards × 32-byte SHA-256 ≈ tens to low hundreds of KB
raw; as a JSON array of hex strings, roughly 65 bytes/entry → ~650 KB at
10,000 cards. Trivial to hold in memory and to refetch wholesale; no
pagination or incremental-diff protocol warranted at this scale.

**Refresh triggers:** login (initial hydrate), after each successful mint
(append the new hash locally — no need to refetch — see below), after card
deletion/tag changes that don't affect content_hash (no-op), and on an
explicit "my cards changed elsewhere" case there's no push channel for
today (multi-tab/multi-device drift is an accepted staleness window, same
class as any other client cache in this SPA — no existing mechanism
contradicts that).

**Layering (ADR-0010 read-locality):** a new reactive-state module,
`src/state/known-positions.ts` (sibling to `analysis-ledger.ts` /
`analysis-config.ts` / `stability-trajectory-store.ts`), holding a
`Set<ContentHash>` (or `Map<ContentHash, CardId>` — see §4, per-node
annotation wants the card id too, not just membership) plus its own
fetch/refresh function. `src/state/`, not `src/services/`, per the existing
machinery-vs-payload split — tree leaves and the mint dialog read it
directly without an intervening composable, matching how
`stability-trajectory-store` is read today. A thin composable
(`useKnownPositions.ts` under `src/composables/cards/`, mirroring
`useThumbnailCache.ts`'s split) owns the *fetch* (calling the ACL) and
mutation (append-on-mint); the state module owns the reactive payload only.

## 4. ANNOTATION RENDER

**Memoization design.** TreeWidget is render-cost-disciplined (ADR-0010);
the corollary is explicit that a template-level reactive read re-runs the
*whole* render function, so per-node hash lookup must not sit in the
template's reactive path. Per-node hash computation happens **once per
node-content-identity**, using exactly the cache shape already proven for
this exact problem: `src/composables/cards/thumbnail-render-resources.ts`'s
`BoardSnapshot` cache — keyed on `NodeId` alone, invalidated by the same
three hooks (`purgeBoardThumbnails(boardId)` on board close,
`purgeAllThumbnails()` / `IDENTITY_SCOPED_CACHES` on identity flip, and the
same caller-less `applySetup`-mutation caveat). A sibling cache,
`Map<NodeId, ContentHash>`, keyed and invalidated identically (a node's
root→node path is immutable under a stable `NodeId`, same invariant the
thumbnail cache already leans on) — **not a new invalidation model, the
existing one, reused.**

Computing the hash itself requires the stateless backend endpoint from §1:
`serializeActivePath` (`src/engine/sgf-writer.ts:139-163`) already builds
exactly the right input — it serializes **root→target-node**, not
root→leaf, driven by the branded `getPath` producer — genericized to accept
an arbitrary `NodeId` instead of always `state.currentNodeId` (a
one-parameter widening, not a rewrite; the file's own header already flags
this function's root→current shape as the load-bearing one `useMinting`
depends on, so the widening is additive, not a repurposing of the existing
call site). Per node: `serializeActivePath(state, nodeId)` → POST to
`/positions/hash` → cache the returned `ContentHash` against `nodeId` →
look it up in the known-positions `Map` from §3. **Fill lazily, not
eagerly** — see §5.

**Visual marker.** Per genre convention (ADR-0019) and the C18 no-color-only
proscription: a distinct glyph/ring on the node's existing SVG circle — not
a fill-color change (TreeWidget already uses fill color for other node
states, e.g. current-node ring per the imperative-escape pattern in
`frontend/CLAUDE.md`'s "Render locality" section, so color is already
spoken-for and a color-only marker would collide/be ambiguous with it). A
small badge glyph (e.g. a card-corner icon or asterisk-in-circle) rendered
as a second SVG element layered on the node, gated on the memoized
hash-membership lookup, is the shape consistent with the existing
active-node-ring imperative escape (§ "The imperative-escape pattern" in
`frontend/CLAUDE.md`) — a static element that reads the memoized `Map`
outside the render path, updated imperatively on cache fill rather than as
a template-reactive read.

**Mint-dialog guard.** `MintCardModal.vue` currently has no duplicate check
(confirmed — no "duplicate"/"already exists" logic in the file today,
`useMinting.ts` builds and submits the draft with no pre-check). Add: on
draft prepare (`prepareDraft`, `useMinting.ts:25-161`), hash
`draft.raw_content` via the same `/positions/hash` call, look it up in the
known-positions state; if present, surface "this position is already card
#N" in the modal before submit — not a hard block (backend
`get_or_create_position` is idempotent on the position row regardless;
minting a duplicate creates a *new card* row pointing at the same
position, which may be desired, e.g. a second card with different grading
params). **Per-user ordinal interplay:** if a parallel "per-user ordinal"
feature lands (card #N *for this user*, not a global id), the dialog's
copy naturally upgrades from "already exists" to "already card #N" without
a design change here — the guard only needs the matched `CardId`, which the
`Map<ContentHash, CardId>` shape from §3 already carries; the ordinal is a
display-layer lookup on that id, orthogonal to this design.

## 5. Cost at 250+ nodes

**Recommend on-demand-per-viewport, not eager whole-tree hashing.**
Reasoning: each hash requires a network round-trip (§1's stateless
endpoint) — 250+ nodes eagerly hashed on tree load is 250+ concurrent
requests for a tree that's mostly offscreen (TreeWidget already handles
large trees via the expansion/viewport machinery — `useTreeExpansion`,
`useViewportFollow` — collapsing/scrolling most nodes out of the rendered
set). Hashing only nodes actually rendered (or about to be, via the same
`ensureVisible` mechanism already gating other expensive per-node work,
per `docs/worklog/2026-05-30-perf-treewidget-nav-cost.md`) bounds the
request count to what's on-screen, typically tens not hundreds. A
**batched** variant of the endpoint (`POST /positions/hash-batch`
accepting `raw_content[]`) is worth folding into dispatch flag #2 if the
viewport-driven approach still produces bursts of near-simultaneous
single-node calls on fast scroll/expand — cheap to add to the same
endpoint's shape now rather than as a follow-up dispatch. Per-node
compute cost server-side is a single `sgf` parse + SHA-256, sub-millisecond;
the bottleneck is round-trip count, not server CPU — batching is the right
lever, not caching harder client-side (the cache from §4 already makes any
given node pay this cost at most once per session).

Incremental hashing "along the tree walk" (hash of parent + delta) was
considered and rejected: `normalize_sgf`'s hash is over the *whole*
serialized main-line SGF including root setup properties, not a rolling
hash with a defined combinator — there's no cheap "extend the hash by one
move" operation available without owning the normalizer's internals
client-side, which is exactly the parallel-identity risk §1 designs away
from. On-demand-per-viewport + optional batching is the only shape that
respects "one identity, one home."

## 6. Acceptance handles

**Stage A — "information fetching now" (thin slice, ships first):**
fetch + store + mint-dialog warning, no tree render integration.

- Backend dispatch #1 (`content_hash` on `CardWithRecall`) + dispatch #2
  (stateless `/positions/hash`) land first — pure backend, additive wire
  changes, no frontend coupling required to ship them.
- `src/state/known-positions.ts` + `useKnownPositions.ts` (fetch on login,
  append on mint).
- `useMinting.prepareDraft`/`MintCardModal.vue` duplicate-check wired.
- Acceptance: unit test on the known-positions state module (fetch,
  append, purge-on-identity-flip mirroring the thumbnail-cache tests);
  integration test (Tier 3) driving `useMinting` against a fake backend
  service asserting the duplicate warning surfaces for a known hash and
  does not for a novel one.
- **Size estimate: small** — one state module + one composable + one
  wire-shape widen (backend) + one modal-copy change. Comparable to a
  single-composable arc in this codebase's history (e.g. `useTags.ts`
  scale), roughly 1-2 sessions including the backend dispatch round-trip.

**Stage B — tree annotation (render integration):**

- `serializeActivePath` genericized to accept a target `NodeId`.
- Per-node hash cache (`Map<NodeId, ContentHash>`, viewport-driven fill,
  same invalidation hooks as `thumbnail-render-resources.ts`).
- TreeWidget marker (SVG badge element, imperative-escape-pattern wired,
  `onUnmounted` release if any observer/listener is added — likely none
  beyond what viewport-follow already owns).
- Playwright witness: load a fixture game containing a known card
  position (a card pre-seeded via the test backend, at a specific
  `NodeId` in a loaded SGF), assert the marker renders at that node and
  not at sibling nodes; separately, attempt a mint from that exact node
  and assert the modal shows the duplicate warning.
- Acceptance: the playwright spec above, plus a render-count/perf guard
  (per ADR-0009 discipline) confirming the marker's memoized lookup does
  not add a per-render hashing cost — assert cache-fill happens once per
  `NodeId` across repeated re-renders (nav back-and-forth over the same
  nodes triggers zero additional `/positions/hash` calls).
- **Size estimate: medium** — touches a perf-sensitive component
  (TreeWidget, currently 430 lines, already near the ADR-0007 ceiling —
  budget for extracting the marker into a small child component rather
  than growing TreeWidget's own template/script further), plus the
  viewport-driven fetch orchestration and the batch-endpoint follow-up
  from §5 if single-node bursts prove to be a problem in practice.
  Roughly 2-4 sessions, gated on Stage A's state module already existing.

Dependency: Stage B depends on Stage A's state module and the backend
endpoints; Stage A does not depend on Stage B and is independently
shippable/valuable (the mint-time warning alone satisfies a meaningful
slice of "no way not to see it's a duplicate," even before the tree shows
markers at rest).

## Touched-file inventory

**Backend (dispatch, not authored here):**
- `backend/domain/card.py` (Card/CardWithRecall — add `content_hash` field)
- `backend/repositories/card_repository.py`, `lineage_repository.py` (project
  `content_hash` into the row construction feeding `Card`)
- New route, e.g. `backend/api/routes/positions.py` (stateless hash
  endpoint) + optional `GET /cards/hashes` (dispatch flag #3) +
  optional batch variant (§5)
- `backend/schemas/card.py` / a new `schemas/positions.py` for the
  request/response DTOs

**Frontend:**
- `frontend/src/types/backend.ts` — regenerated via `npm run gen:api`
  once the backend dispatch lands (never hand-edited)
- `frontend/src/services/backend-service.ts` — ACL: map new
  `content_hash` field, add `hashPosition`/`fetchKnownPositionHashes`
  methods
- `frontend/src/state/known-positions.ts` (new)
- `frontend/src/composables/cards/useKnownPositions.ts` (new)
- `frontend/src/composables/review/useMinting.ts` — duplicate check in
  `prepareDraft`
- `frontend/src/components/modals/MintCardModal.vue` — warning copy/UI
- `frontend/src/engine/sgf-writer.ts` — genericize `serializeActivePath`
- `frontend/src/components/tree/TreeWidget.vue` — marker rendering
  (likely a small extracted child component per ADR-0007 budget)
- `frontend/src/composables/forest/useTreeExpansion.ts` /
  `useViewportFollow.ts` — viewport-driven fill trigger (read, not
  necessarily modified)
- Tests: `tests/unit/` (state module), `tests/integration/` (useMinting
  duplicate-check), a new Playwright spec for Stage B
