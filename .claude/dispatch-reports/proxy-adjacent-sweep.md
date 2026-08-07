# Proxy-adjacent sweep — Mechanics #6, #7, and everything else proxy-coupled

- **Commissioned:** maintainer follow-on to the cache second opinion (same session,
  same adjudicator). Analysis only: no proxy file modified, no restart, no
  reconfiguration; passive observation of the live system's log and the existing
  dispatch evidence assets only.
- **Scope decision:** delivered as a new file (`proxy-adjacent-sweep.md`) rather than a
  section of `cache-second-opinion.md` — the second opinion is a closed adjudication
  record; this sweep is open analysis and will be superseded by fixes.
- **Inputs:** the issues page (`Notes:OmegaGo_issues`, fetched raw 2026-08-06), the full
  architecture read attested in `cache-second-opinion.md`, plus targeted code reads:
  `proxy/delta_analysis.py` (in full), `proxy/transformers/analysis_enricher.py` (in
  full), `reactive_pipeline/core.py` (Monitor), `frontend/src/engine/analysis/review-scoring.ts`,
  `frontend/src/services/analysis-service.ts` (query builders), `frontend/src/engine/util.ts`
  (`getKomi`), `frontend/src/engine/katago/komi-calibration.ts`, `frontend/src/App.vue`
  (`handleUpdateKomi`), `frontend/src/composables/analysis/useMistakeFinder.ts`,
  the specimen SGF `~/lost_games/30996072.sgf`, and the wire captures from the cache
  investigation's asset folder.

## Which issues are proxy-coupled

| Issue | Proxy-coupled? | Treated below |
|---|---|---|
| Mechanics #2 (cache) | yes | adjudicated in `cache-second-opinion.md`; not repeated |
| Mechanics #6 (off-by-one in deltas) | yes — delta *computation* is proxy-side (`delta_analysis.py`), delta *attribution* is SPA-side | §1 |
| Mechanics #7 (omitted delta on first review move) | yes — enrichment contract straddles the wire | §2 |
| Mechanics #7's komi sub-hypothesis | yes — komi crosses SPA → proxy → engine unvalidated | §3 |
| Mechanics #1 (trailing pass / turn indexing) | fixed on `next` per the issues page; its root cause (tree-index vs turn-index reconciliation) is the *same class* as one #6 hypothesis — cross-referenced in §1 | §1 (H2) |
| Mechanics #3 (handicap setup) | latently — handicap games break the proxy's color-parity assumption even before setup UI exists | §1 (H1) |
| Mechanics #9 (graph hydration Heisenbug) | no (SPA-internal), but it shares the telemetry need — the debug-discipline design in §4 covers its proxy half | §4 |
| UI #1 (model-select flicker) | resolved; was SPA-side rendering of the proxy's watchdog cadence | not treated |
| Wanted #2/#3 (per-request overrides, visit LERP) | wire-shape features, not defects; they will touch the proxy-control field family — flagged only | §5 |

---

## §1 Mechanics #6 — off-by-one in deltas during analysis

**What the proxy actually computes** (`delta_analysis.py`): packets are slotted by
`turnNumber` t (the position after t moves); `Window(-1,0)` produces
`delta[j] = delta_fn([packet[j-1], packet[j]])`, i.e. delta j is *caused by 0-indexed
move j−1*. Per-color splitting is by **parity**: under `black_first=True`,
black owns global delta indices 1,3,5,… (mapped to color-local 0,1,2,…), white owns
2,4,6,…. The wire carries only the **color-local** keys
(`extra.{black,white}.deltas["0"|"1"|…]`); the client must re-derive the algebra.
The SPA's authority is `colorMoveToPly` (`useTriangularHeatmap.ts`), applied in
`useMistakeFinder.ts:100-104` (black k → ply 2k, white k → ply 2k+1 — algebraically
consistent with the proxy under strict B/W alternation from Black).

Ranked hypotheses:

**H1 — parity vs. actual-color desynchronization (proxy-owned; my top candidate for a
*systematic* off-by-one).** The proxy *assumes* colors: `black_first=True` is the
`DeltaAnalysisState` default and `analysis_enricher.py` never overrides it, even though
the moves array it is handed carries the real colors (`[["B","Q16"],["W","D17"],…]`)
and the real first mover is one array access away. The SPA, on the other side, counts
**actual** move colors (`review-scoring.ts` counts `move.color === userColor` along the
path; `useMistakeFinder` assumes B at even plies). Any path that is not
strictly-alternating-starting-with-Black desynchronizes the two writers of this truth:

- a White-first game (handicap SGFs — `AB[]` setup then W plays first; the GoGoD
  import certainly contains them; Mechanics #3 notes setup support is absent, but
  *loading* such SGFs already works),
- consecutive same-color moves (legal SGF; teaching files),
- setup nodes mid-path.

Under desync every delta lands in the wrong color bucket and/or the local indices
shift by one — presenting exactly as "off by one in deltas," but only on the affected
game class, which makes it look intermittent. **Evidence to confirm:** analyze one
handicap (or W-first) game and compare `extra.black.deltas` keys against the actual
black moves; or unit-drive `DeltaAnalysisState` with a W-first moves list. **Owner:**
proxy (`analysis_enricher` should derive `black_first` from `moves[0][0]`; the type-
level fix per ADR-0000 is stronger — the color assignment should be *derived from the
moves array's own colors*, making the parity assumption unrepresentable; ADR-0012
P1/P7: today there are two writers of the color-assignment truth, one on each side of
the wire). Note the SGF the cache investigation used is B-first and even, so nothing
witnessed to date exonerates or convicts this path — it simply wasn't exercised.

**H2 — tree-index vs. turn-index reconciliation at the attribution seam (SPA-owned;
the Mechanics #1 class).** Mechanics #1's root cause — "the analysis range counts tree
nodes, the moves array (correctly) skips moveless nodes, and the query builder never
reconciled" — is a *class*, and per ADR-0000's closure-statement discipline its
quantification universe includes every sibling surface that maps packet turns back to
tree nodes: the enrichment accumulator, chart navigation (`useChartNavigation.ts:62`
carries a deliberate `−1`), and the heatmap/mistake-finder ply algebra. The #1 repair
("turn indices and node attribution now share one authority",
`buildMovesAndTurnIndex`) landed *after* #6 was filed, so #6 may be partially or wholly
fixed already on paths that now flow through that authority. **Evidence:** re-test #6
on current `next` with a game containing a mid-path moveless node (comment-only node,
or the trailing-pass specimen `30996027.sgf`) — deltas around the moveless node are
where the shift would survive. **Owner:** SPA.

**H3 — delta semantics ambiguity at display (SPA-owned, cosmetic register).** Proxy
delta j is the change *across* move j−1; user-facing move numbers are 1-indexed;
`useChartNavigation` deliberately subtracts one to land on "the situation the player
faced." A consumer that composes `colorMoveToPly` with (or without) that `−1`
inconsistently displays a delta against the neighboring move. **Evidence:** a single
hand-checked position: play a known blunder at move m, verify which move number the
delta renders against in each surface (mistake list, heatmap tooltip, board overlay).
**Owner:** SPA; no wire change.

**H4 — reactive-pipeline short-circuit residue (proxy-owned, low likelihood for a
*consistent* off-by-one).** `delta_analysis.py` step 3's own comment documents the
identical-D/F-packet short-circuit pathology and belt-and-braces it for the queried
slot only; triangular/CWT branches remain deltas-since-last. A short-circuited slot
mispresents as a *missing* delta, not a shifted one — relevant to #7, unlikely to
produce #6's steady ±1. Kept on the list because the maintainer named the reactive
pipeline explicitly; the decisive discriminator is whether observed #6 instances are
*shifts* (H1-H3) or *gaps* (H4/#7 class).

## §2 Mechanics #7 — omitted delta computes on first move of card review, no recovery

**The mechanism that makes it "first move, no recovery" regardless of root cause:**
`review-scoring.ts::scorePerMoveDelta` hard-depends on the proxy's per-color delta for
the just-played move; on `undefined` it returns `{kind:'missing'}` and — per its own
comment — "the caller surfaces it and cancels the session before any score is
persisted" (deliberately, replacing an older silent 0.5 substitution that corrupted
Ebisu updates). So *any* upstream cause of absent enrichment detonates at the first
scoring attempt — i.e. the first move — and ends the session. The "first move"
signature is mostly the *detonation site*, not necessarily the *cause site*.

Ranked causes of the absence:

**H1 — enrichment is best-effort on the wire but load-bearing in review (wire-contract
gap; the root defect in my reading).** `analysis_enricher.on_query` deliberately
proceeds *without* enrichment on any setup failure (RegistryInterpreter compile error
from the user's palette `analysis_config`, `DeltaAnalysisState`'s `n_moves < 2`
ValueError, dtype/range errors) — a WARNING in the proxy log and nothing on the wire.
`on_response` likewise swallows per-packet enrichment exceptions (asteval resolves
names lazily, so a palette symbol error surfaces only at the first packet — the file
says so itself). The SPA cannot distinguish "enrichment not requested" / "setup
failed" / "window not yet filled" / "short-circuited" — absence is the only signal.
That is ADR-0012 P11 verbatim: *absence carries a typed reason, NULL is never a
meaning-carrier*. The class-foreclosing fix (ADR-0000 2a): a typed `extra_status`
discriminator on every analyze response of an enrichment-requesting query
(`computed | skipped(reason) | window_unfilled | not_requested`), so review scoring
can distinguish a refusal from a not-yet and surface the real cause instead of
"missing". Enforcement (2b): the SPA refuses to *start* a review session whose first
enriched response reports `skipped`, naming the reason — plus the debug channel in §4.
**Owner:** wire contract (proxy emits, SPA consumes); dispatch-worthy.

**H2 — cold-review vs. warm-review history dependence (the Heisenbug shape; needs one
decisive log check).** The review flow settles on finals via
`Promise.all([waitForAnalysis(s_0), waitForAnalysis(s_1)])` (analysis-service.ts). If
those are **two separate wire queries**, each gets its own eid and therefore its own
per-eid `DeltaAnalysisState` (`request_cache: Dict[ClientId, …]` in
`analysis_enricher.py`) — one packet per analyzer, `Window(-1,0)` can never fire, and
*neither* response can ever carry the pair delta. Review scoring then only ever
succeeds when the enrichment **store** already holds deltas for those nodes from an
earlier *range* analysis over the same path (`scorePerMoveDelta`'s fallback scans the
whole path in the accumulated store). Determinant: invisible session history —
classic Heisenbug presentation ("works when I'd analyzed the game earlier, fails
cold"). **Decisive evidence, cheap:** run one cold card review and read the proxy log
— two `subscribe ANALYZE` events with distinct origs at review start ⇒ H2 is live;
one subscribe with `analyzeTurns=[t,t+1]` ⇒ H2 is dead and the pair-delta arrives on
whichever of the two packets came second (which the scan already handles). **Owner:**
SPA if two queries (merge into one two-turn query — also halves engine cost); proxy
docs if one (then H2 is dead and H1/H3 carry).

**H3 — komi-induced engine refusal, model-dependent (the maintainer's hypothesis;
evaluated in §3).** Short form: representable, real, but on the *witnessed* deployment
the engine **accepted** an out-of-range komi, so on this box the komi branch cannot
produce a refusal on model `14`; it remains live for stock-KataGo upstreams behind the
SELECTOR — making it *model-dependent*, another Heisenbug amplifier.

**H4 — first-move-at-game-start edge (narrow but exact).** For a card whose first
review move is the *game's* first or second position, the moves array reaching the
enricher has length ≤ 1 and the `len(q.opaque['moves']) > 1` gate (or
`DeltaAnalysisState`'s `n_moves >= 2` raise) silently disables enrichment for that
query — H1's absence, guaranteed, for this card class. **Evidence:** review a card
rooted at move 1. **Owner:** proxy gate design + H1's status field to make it loud.

**Graceful recovery (the issues page asks):** with H1's `extra_status` the SPA can
degrade honestly — offer "score without engine delta" (user-graded) or re-issue the
pair as a single two-turn query — instead of cancelling. Until then, cancelling is the
correct ADR-0002 posture; the missing piece is the *reason*, not the refusal.

## §3 The komi-range hypothesis, evaluated against the actual code paths

Where komi flows:

1. **SGF → board:** `engine/util.ts::getKomi` — `parseFloat(KM)`, silent fallback 6.5
   on missing/NaN. No range or half-integer check.
2. **User edit:** `StatusBar.vue` komi `<input>` → `App.vue::handleUpdateKomi` —
   writes *any* float straight into root `KM` (`isNaN` is the only guard). **No clamp,
   no half-integer rounding.** The out-of-range state the maintainer hypothesizes is
   freely representable here.
3. **Mint-time calibration:** `engine/katago/komi-calibration.ts` — the *one* place
   the constraint is modeled: `KOMI_MIN/MAX = ±150`, rounds to nearest 0.5, surfaces a
   `clamped` flag (ADR-0002-clean). Cards minted *before* this module's incident-driven
   hardening (katago-client.ts:122 references it as "the second of its class") may
   carry unclamped or non-half-integer komi in their stored SGF.
4. **Query build:** `analysis-service.ts` (both builders, lines ~658/~934) — komi goes
   on the wire verbatim. No validation.
5. **Proxy:** none. Komi is opaque payload; it participates in the coalescing
   `content_hash` and the replay `cache_key` (so distinct komi = distinct cache
   entries — correct, but a komi-*varying* feature would churn the cache) and is never
   range-checked. The proxy is a faithful non-validator by design (Port passes what
   the engine owns).
6. **Engine:** stock KataGo rejects non-half-integer or out-of-[-150,150] komi with an
   error response (no analyze packets → §2 H1's absence, with today's wire giving the
   SPA no typed reason).

**The live witness that reframes the hypothesis:** the cache investigation's own
captured queries (`run*-frames-trimmed.json`) sent **`komi: 300`** — for a specimen
SGF whose root says **`KM[7.5]`** (read directly from `~/lost_games/30996072.sgf`) —
and model `14` (git_hash `…-dirty`, a locally patched build) **accepted it and
analyzed normally** (497 responses, scoreLead ≈ 160, i.e. the shifted komi visibly
baked into every score). Two consequences:

- **On this deployment the komi-range refusal cannot be #7's cause on model 14** — the
  patched engine doesn't enforce the range. But the SELECTOR pool mixes models; any
  stock upstream *does* enforce it. Same card, different model ⇒ works vs. dies at
  move 1. The komi hypothesis survives specifically as a **model-dependent** cause,
  which is precisely the kind of hidden determinant that makes #7 a Heisenbug.
- **Something upstream put 300 into a 7.5 game and nothing anywhere refused it.**
  Unresolved by this sweep (candidates: a persisted board in the shared preview
  profile carrying an earlier manual komi edit via the unvalidated StatusBar path; the
  decisive check is reading the persisted board's `KM` in the preview profile's
  storage). Even where the engine accepts it, komi=300 *silently corrupts analysis
  quality*: winrate saturates toward 1.0, flattening every winrate-based palette
  function — deltas become degenerate without any error anywhere. That is an ADR-0002
  violation with three willing accomplices (SPA input, proxy pass-through, patched
  engine).

**Disposition per ADR-0000:** the class is "an engine-owned value constraint
(half-integer, |komi| ≤ 150) is enforced nowhere the value is written." The type that
forecloses it: a branded `Komi` type minted at the three write sites (SGF load, status
bar edit, calibration — calibration already is the worked example), refusing or
rounding at the boundary per ADR-0012 P2 translate-and-validate. **Owner: SPA** for
the input boundaries; **wire contract** for surfacing an engine komi *rejection* as a
typed, user-visible refusal (today it dies as §2 H1 absence). The proxy stays a
non-validator (correct per its scope: the engine owns the constraint; the SPA owns the
UX of honoring it) — though the debug channel (§4) should *capture* engine error
responses so a komi rejection is diagnosable after the fact.

## §4 Debugging discipline for the Heisenbug class (the maintainer's explicit design ask)

The class's signature (Mechanics #6, #7, #9): a seam-crossing defect whose determinant
is invisible at symptom time (session history, model identity, packet ordering, silent
enrichment skip), where reproduction destroys the evidence. The discipline that fits
is a **flight recorder**, not more logging — logging is an operator stream; this is
queryable, incident-scoped evidence (the maintainer's own analogy: core dumps).

**Proxy side — a per-session seam recorder (Layer 1-owned, design only, named sites,
nothing touched):**

- A bounded per-session ring buffer (deque; ~512 records; per-record content cap) into
  which `ClientSession` appends one compact structured record at each seam crossing:
  query received (orig_id, action, analyzeTurns count, komi/rules/model/capabilities
  fingerprint, content_hash + cache_key as computed, route taken:
  subscribe|coalesce|cache_hit), response delivered (ids at every namespace the
  session can see, turnNumber, isDuringSearch, kind, enrichment disposition), and —
  the load-bearing additions the current log cannot express —
  **enrichment lifecycle records** from `analysis_enricher`: analyzer built (or
  skipped: which gate, which exception), per-packet `push_packet` outcome
  (fired / short-circuited / raised), Monitor gate state at CWT emissions. These are
  exactly the invisible determinants of §1-H4 and §2-H1/H2.
- **Trigger surface:** a new proxy-only wire action `query_debug` (joins the
  `cache`/`lookup_cache`/`model` family: client-set, proxy-interpreted, never reaches
  the engine; `_PROXY_ONLY_FIELDS` already centralizes the strip discipline), returning
  the ring slice for a given orig_id or the whole session as a metadata response.
  Advertised as `capabilities: {debug: {}}` per the existing dict-shaped negotiation —
  absent on vanilla engines, so the SPA feature-detects it exactly like `selector`.
- **Auto-spool on anomaly (the core-dump analog):** on enrichment exception,
  parse/translation error, or an engine *error* response, dump the ring to a bounded
  on-disk spool (`PROXY_DEBUG_SPOOL_DIR`, max-files cap, JSONL named `<ts>-<cid>`),
  so evidence survives the session that produced it. ADR-0002: the anomaly is already
  logged; this preserves its *context*.
- **What is deliberately not captured by default:** full payloads (size; a capability
  parameter can opt a session into payload capture when reproducing). ADR-0021: the
  recorder observes the *property* — what crossed each boundary, when, under which
  identity in which namespace — because the ID-translation chain is the one witness
  only the proxy holds; correlating a client-side symptom to an engine-side cause
  requires exactly this chain (`client_id → internal_id → canonical_id → wire_id`).

**SPA side (the other half; #9's telemetry need):** a mirror ring of sent/received
frames + the settings fingerprint, persisted (IndexedDB) when the SPA detects its own
anomaly (a `missing` review score, a hydration failure), and — where the proxy
advertises `debug` — an automatic `query_debug` fetch for the implicated orig_id, so
one artifact holds both sides of the seam keyed by the same id. The review-scoring
`missing` branch is the natural first caller.

**Contract statuses over channels (the cheap 80%):** independent of the recorder,
§2-H1's typed `extra_status` field removes the largest ambiguity for #7 at near-zero
cost, and should ship first. The recorder is for the residue the status field cannot
explain (ordering, history, model identity).

**Enforcement honesty (ADR-0011 Rule 1):** recorder and status field are mechanisms;
the discipline "fetch the flight record before theorizing" is review-only and should
be written into the debugging playbook the maintainer asked for, with the `query_debug`
one-liner in it.

## §5 Flagged, not analyzed

- **Wanted #2/#3 (per-request overrides / visit LERP):** when these land they extend
  the client-set proxy-interpreted field family; the near-miss letter's strip-vs-hash
  decision (does the field affect `content_hash`? `cache_key`?) must be made
  explicitly per field — overrides that change engine output must hash; presentation
  hints must not. Name it in the dispatch when the time comes.
- **Mechanics #9:** SPA-internal; only its telemetry half is served by §4.
- **The komi=300 provenance question** (§3) — one unresolved witnessed anomaly, cheap
  to chase with the preview profile's persisted state in hand; recommend doing so
  before any comfort is taken in #7's komi branch being "not it on this box."

## Recommended order for the commissioner-present session

1. `extra_status` typed discriminator on enriched responses (§2-H1) — smallest wire
   change, converts #7 from Heisenbug to readable refusal; SPA review flow consumes it
   for honest recovery.
2. The one-log-read H2 check (two subscribes vs one, cold review) — free, and decides
   whether the review flow needs the two-turn-single-query merge.
3. `black_first` derivation from the moves array's actual colors (§1-H1) — one-line
   proxy fix with a unit witness; retest #6 afterwards on a W-first specimen, plus a
   moveless-node specimen for the H2 class now that Mechanics #1's authority exists.
4. Komi boundary typing at the SPA's three write sites (§3) + surface engine komi
   rejections as typed refusals; chase the komi=300 provenance.
5. The flight recorder (§4) — proxy release-arc work (own branch, own tag, umbrella
   pointer bump per the submodule discipline), capability-advertised `debug`.
