# Audit — hydration/rebind residue (one-shot binding vs hydration ordering and identity flip)

- **Status:** Audit report (READ-ONLY analysis) — residue dispositioned; no code
  changed. Maintainer flags in §6.
- **Date:** 2026-06-10
- **Work-status item:** `hydration-rebind-residue-audit` (filed by the
  2026-06-10 SPA history-lessons audit, §3.9 / B.9 — see
  `audit-spa-history-lessons-2026-06-10.md`).
- **Scope:** The three residue surfaces the item names —
  `useQueryTelemetry`'s reconnect-rebind contract, the thumbnail caches'
  hydration axis, and `analysis-service`'s per-board interaction-time
  rebind — plus the class doc the item asks for: the failure shape named on
  both axes, the existing nets indexed, each site's ADR-0003 band recorded
  so the output doubles as the fork's inventory of hydration-coupled state.
- **Method:** Direct full reads of each surface's source (see the reading
  log); todo-DB consulted read-only. Point-in-time report per this
  directory's convention; not retro-edited.

## Reading log (ADR-0002 doc discipline)

Read end to end before citing: umbrella `CLAUDE.md`, `frontend/CLAUDE.md`,
ADR-0002, ADR-0003,
`docs/notes/consult/opus-consult-2026-06-03-knowntags-fence-and-boot-ordering.md`,
`docs/notes/postmortem/postmortem-pbo-claim-rehydration-2026-05.md`,
`docs/notes/audit/audit-spa-board-scope-consistency-2026-06-05.md`,
`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`,
`frontend/docs/notes/board-scope.md`. Read in full as primary evidence:
`src/composables/useQueryTelemetry.ts`, `src/services/analysis-service.ts`,
`src/composables/cards/useThumbnailCache.ts`,
`src/composables/cards/useCardThumbnail.ts`,
`src/composables/board/usePlayFromPosition.ts` (the match-side telemetry
registrar), `src/store/board-factory.ts`, and the net-bearing regions of
`src/store/index.ts` (`BOARD_SCOPED_STORE_CELLS`, `closeBoard`,
`IDENTITY_SCOPED_CACHES`, `resetWorkspace`, `updateFromRemote`,
`buildPersistencePayload`). Targeted verifications at HEAD: commit
`5b57d25` (knownTags move-out), the `ProfileState` invariant comment
(`types.ts:1871`), the SyncService gates
(`hydratedForUserId` / `hydrationGeneration`, `sync-service.ts:46-149`),
telemetry registrar enumeration (grep), `applySetup` caller enumeration
(grep), engine-connect trigger enumeration (grep). `FILES.md` and
`IDENTIFIERS.md` consulted as lookup references (their sanctioned mode).

---

## 1. The failure shape, on its two axes

The class this audit dispositions: **module-scope (or service-singleton)
ephemeral state that is expected to track a slower-moving truth, bound to
that truth by a one-shot imperative call rather than by a reactive
subscription, a per-read derivation, or a structural separation.** The
binding fires at the apparently-right moment; the truth moves afterwards;
nothing refires. The drift is silent — exactly the shape ADR-0002 forbids
at the binding-lifecycle layer.

The class has **two distinct axes**, and they fail differently:

- **Axis H — hydration ordering** (within one identity). The truth arrives
  *late*: `SyncService.hydrate()`'s un-awaited `/documents/{key}` GET
  resolves after a faster boot-path fetch, and `updateFromRemote` replaces
  `store.profile` / `store.session` / `store.boards`. A binding that read
  the store before that replacement ran against defaults (the PBO claim
  rehydration incident — rehydrate claimed nothing and never refired); a
  write that landed before it got clobbered (the knownTags
  tags-fetch-hydration-race — the same race in the reverse direction).
  Failure mode: stale or blind state *within the user's own session*.
  Severity calibration: the migration chain grows monotonically
  (postmortem §7.5), so any ordering that is merely
  deterministic-in-practice will eventually flip.

- **Axis I — identity flip** (across identities). The truth *changes
  owner*: logout / switch-user. State derived from the prior identity must
  be dropped or rebound, or it leaks across the tenancy boundary — the
  `tenancy-instance-cache-leak` class. Failure mode: privacy-relevant
  cross-tenant serving (raw-`CardId` collisions are the canonical
  instance), or at minimum cross-identity memory residue.

A site can be sound on one axis and unsound on the other; the two have
different nets (§2) and must be checked separately. A third, adjacent
lifecycle axis — **reconnect** of a long-lived transport (the analysis
WebSocket) — is not hydration and not identity, but has the same
one-shot-vs-refire anatomy; the item names it explicitly for
`useQueryTelemetry`, and §3.1/§3.3 treat it as a first-class column.

### What this audit is *not* re-opening

The 2026-06-03 consult already swept the boot path end to end (7 sites,
exactly one genuine hazard, fixed structurally in `5b57d25`), and the
2026-06-05 board-scope audit covered the module-scope per-board surfaces.
The history-lessons audit's verification pass deflated the original
"never-executed audit" claim accordingly (§6 there). What remained
un-dispositioned is the three named surfaces below — the honest residue.

## 2. The existing nets (index)

The codebase has converged on a small set of mechanisms; each residue
verdict in §3 names which net covers it. For the fork: nets 1–3 and 6 are
domain-agnostic machinery (Band 1 in character); nets 4–5 are the
lifecycle registries any adopter keeps.

1. **Re-firing `immediate: true` watchers** (Axis H). Read-profile →
   write-elsewhere watchers fire on the pre-hydration default and refire
   when hydration replaces `store.profile`, converging on the hydrated
   value (theme / locale / intensity / knob-registry / qeubo-reconcile;
   the PBO corrective extended the qeubo watcher to also refire
   `rehydrateExperimentClaims`). The consult's Part 2 #3/#7.

2. **Disjoint write targets** (Axis H; commit `5b57d25`). Server-derived
   caches do not live in the persisted blob: `knownTags` moved to a
   non-persisted top-level `GlobalStore` field, so
   `buildPersistencePayload` never carries it and `updateFromRemote`
   structurally cannot touch it. The invariant is documented where the
   next violation would be authored: *"the persisted profile holds
   user-authored data only"* (`types.ts:1871`). This is the structural
   form — the race is impossible, not sequenced.

3. **Identity/hydration gates on the write-back path** (Axis H, server
   side). `SyncService.scheduleSync` / `sendSync` refuse unless
   `hydratedForUserId === state.userId`; `hydrationGeneration` discards
   superseded hydrations (`sync-service.ts:46-149`). The one place that
   writes the *server* is gated even though local-store writers are not —
   the asymmetry the consult named.

4. **`IDENTITY_SCOPED_CACHES`** (Axis I; `store/index.ts:530`). The
   registered drain `resetWorkspace` runs on identity flip, with a
   tenancy completeness test asserting every row clears. Engine-stop runs
   first (ordering is load-bearing). The card-thumbnail and card-tree rows
   are the privacy-relevant ones (raw-`CardId` keys collide across
   tenants).

5. **`BOARD_SCOPED_STORE_CELLS` + `closeBoard`'s inline Class-B purges +
   the board-completeness test** (board lifecycle; `store/index.ts:309`,
   `frontend/docs/notes/board-scope.md`). Not one of the item's two axes —
   board scope is pure partitioning — but it is the teardown net the §3
   surfaces sit behind, and it bounds every "entries persist until …"
   residue below.

6. **Keying + existence ordering** (Axis H). Surfaces keyed by an
   identifier that only exists post-hydration cannot run early: the
   analysis-bundle restore watcher fires only for boards already in
   `store.boards` (consult Part 2 #4). Random per-creation ids
   (`root-`/`node-` + base36 for nodes, RFC4122 for `BoardId` /
   `clientGameId` — `board-factory.ts`, `sgf-loader.ts`) additionally make
   pre-hydration entries *orphan* rather than collide.

7. **The declined general barrier.** A `whenHydrated()` gate that boot
   writes await was **deliberately declined** on 2026-06-03 — it would add
   a serialization point and a public surface for a class with one
   instance, when the move-out (net 2) removed the instance's category
   error. Named re-trigger: *"build the gate only if a second genuine
   instance of the class appears."* §4 engages this on its own terms.

## 3. Residue sites — verdicts

Band tags are the current `frontend/FILES.md` tags; disagreements are
noted inline rather than retagged (retag is the band-conformance arc's
job, not this one's).

### 3.1 `useQueryTelemetry` — the reconnect-rebind contract. **[B1]. Sound; two residual notes.**

The PBO postmortem (§7.3) flagged it: *"rebuilt from live KataGo socket
activity; not persisted truth, but the rebind contract on reconnect could
have the same shape."* Full read says it does not:

- **Axis H: not in the class.** The singleton has **no persisted input**.
  Entries are created by `registerQuery` at submit time and only ever
  derived from live wire traffic; nothing in it mirrors a
  SyncService-hydrated slice, so there is no binding that hydration
  ordering could starve or clobber. (Net 2 by construction — telemetry
  lives entirely outside the persisted blob.)
- **Reconnect: covered by sweep + settle.** Board-scoped entries
  (registered only by `analysis-service`, the grep-verified sole
  registrar besides the match path): both the WS `onDisconnect` handler
  (`analysis-service.ts:166-168`) and user-initiated `disconnect()`
  (`:394-396`) sweep `telemetry.unregisterQuery` over every
  `activeQueries` key, and `unregisterQuery` is an idempotent no-op for
  entries the singleton already auto-cleaned on natural completion. The
  queue tooltip therefore cannot show pre-disconnect rows after a drop.
  Match-scoped entries (`boardId: null`, registered per turn inside
  `usePlayFromPosition.ts::awaitFinalPacket` **[B3]**): registration and
  unregistration are settle-bound — final packet, error packet, timeout,
  or queue-tooltip cancel all funnel through one `settle()` that
  unregisters. A match-WS death mid-turn is settled by the timeout
  channel within `perMoveTimeoutMs`, so the worst case is a stale row for
  that bounded window, then self-heal. No unbounded residue.
- **Axis I: covered transitively.** The singleton is *not* an
  `IDENTITY_SCOPED_CACHES` row; on identity flip the registry's first row
  (`stopAllBoardAnalyses`) routes every board entry through `stopQuery` →
  `unregisterQuery`, and match entries are settle-bound (the match loop
  throws `board … disappeared mid-match` on its next move once
  `resetWorkspace` replaced `store.boards`, and the in-flight turn's entry
  was already unregistered at settle). Telemetry rows carry no
  tenant-collidable keys (`QueryId`s embed `Date.now()`), so this
  transitive coverage is memory-hygiene-adequate; recording it here is the
  cheap durable carrier.

**Residual notes (recorded, no action):** (a) the `'probe'` `QueryKind`
has **zero registrars** at HEAD (`probeEngineInfo` deliberately does not
register); if one is ever added, note that the natural-completion
auto-cleanup is gated on `turnsTotal > 0`, so a probe entry's release
depends entirely on its explicit `unregisterQuery` — the docstring's
"whichever fires first" contract has only one leg there. (b) The ETA tick
interval (`ensureTickTimer`) starts on first registration and never stops
in production; it recomputes an empty `inFlight` once per second for the
rest of the session. Bounded and cosmetic; named here so it reads as known
rather than overlooked.

### 3.2 The thumbnail caches — the hydration axis. **`useThumbnailCache` [B3], `useCardThumbnail` [B3]. Not hydration-coupled; one latent invariant named.**

- **Axis H: not in the class — per-read derivation + orphaning keys.**
  `snapshotCache` is keyed by `NodeId` alone and filled lazily at read
  time by replaying the board **currently in `store.boards`**; there is no
  boot-time binding to refire. `updateFromRemote` replaces `store.boards`
  wholesale (`store/index.ts:681` — replacement, not merge), and node ids
  are random per creation (net 6), so any entry cached before hydration
  (realistically only the fresh initial board's `root-…` snapshot, since
  thumbnail consumers render post-auth on hover/preview events) is
  **orphaned, never served stale**. The orphan is a bounded memory
  residue, cleared at the next board close / identity flip.
  `lastWarmedPath` cannot short-circuit across hydration for the same
  reason (the hydrated path's ids differ). `useCardThumbnail` has no
  hydration coupling at all: cards are backend fetches, not blob content,
  and card SGF is immutable post-mint (the ACL exposes
  `updateCardMetadata` only).
- **Axis I: netted.** Both caches are `IDENTITY_SCOPED_CACHES` rows
  (`board-thumbnails` / `card-thumbnails`, audit pairs O9/O10);
  `useCardThumbnail`'s clear is the privacy-relevant one (raw integer
  `CardId` collides across tenants). Board lifecycle: `closeBoard`'s
  `purgeBoardThumbnails` walk (O4) before the splice.
- **Latent invariant, named with its trigger:** the snapshot cache's
  correctness rests on **node-content immutability under a stable
  `NodeId`** — replay(node) must be time-invariant. At HEAD that holds:
  the only code path that mutates an existing node's position-relevant
  properties is `applySetup` (`src/logic.ts:14-60`, AB/AW/AE setup-stone
  editing), and it has **zero production callers** (grep-verified; only a
  comment in `types.ts` references it). The root komi edit
  (`App.vue:235`) mutates a node but komi is not in the snapshot
  (`size`/`stones`/`lastMove`), so it cannot stale a thumbnail. **If a
  setup-edit mode ever wires `applySetup`, the snapshot cache gains an
  invalidation obligation for the edited node and its descendants** (a
  coarse `purgeBoardThumbnails(boardId)` at the commit site would be
  correct and cheap). Recorded here as the named trigger; the open
  `thumbnail-render-lifecycle-consolidation` item is the natural home if
  it fires.

### 3.3 `analysis-service`'s per-board maps — the interaction-time rebind. **[B3]. Not hydration-coupled; reconnect contract is "reconcile on next interaction", with two recorded wrinkles.**

The four maps (`activeQueries`, `activeSubscriptions`,
`restartCallbacks`, `boardToQueries`) are what the postmortem's §7.3
asked to check ("rebound from board state on each interaction; reactive
or one-shot?"). The honest answer is that the question's premise doesn't
apply:

- **Axis H: not in the class.** The maps are not a mirror of persisted
  truth — they are bookkeeping for in-flight queries, created by user
  interactions (`analyzeRange` / `analyzeActiveNode`) that are
  post-hydration by construction. No query auto-starts from persisted
  state. Even the connect-time read of the profile URL
  (`connect()`, `:131-138`) sits behind a discrete user event — the
  toolbar `toggle-engine` is the sole production trigger (grep-verified;
  the perf harness's transient override is the only other caller) — so it
  is the consult's "component-level `onMounted` not in class" shape,
  strengthened to an explicit user action.
- **Axis I: netted.** `IDENTITY_SCOPED_CACHES` row 1
  (`stopAllBoardAnalyses`) drains every per-board entry on identity flip,
  before the data caches purge (ordering documented at the registry).
  Board lifecycle: `closeBoard` → `stopBoardAnalysis` (net 5).
- **Reconnect: a deliberate, documented decision** — the `onDisconnect`
  handler intentionally does **not** clear the four maps
  (`analysis-service.ts:141-165`, tagged "audit O15"): telemetry is swept
  (user-visible surface), the closure maps are left to be reconciled by
  the next interaction (`stopPonderOnBoard` on the next ponder fire,
  `stopQuery` per-row, `stopBoardAnalysis` on close). That contract is
  self-healing for the ponder path and bounded by board lifetime.
  Engaging it on its own terms, two wrinkles are recorded rather than
  fixed (both sit in the slot that the staged
  `multi-writer-slots-get-owners` item 7(iii) — the engine-connection
  owner module — already owns; changing disconnect semantics here would
  re-litigate a recorded decision mid-arc):

  1. **Natural completion never releases the service maps.** The
     telemetry singleton auto-cleans on the last final packet, but
     `onAnalysisUpdate` has no release path — entries leave the four maps
     only via explicit stops. Consequences, each bounded: per-board map
     growth over a long session (cleared at board close); `isPondering`
     stays `true` after a ponder exhausts its ceiling (self-heals on the
     next ponder fire or spacebar toggle); and
     `store.engine.activeMode[boardId]` keeps projecting the completed
     mode — which undercuts that field's own "writes are kept honest for
     a future reader" docstring (`:1050-1058`), since a board whose range
     finished an hour ago still projects `'analyze'`. No reader consumes
     `activeMode` today, so this is a doc-vs-behaviour drift, not a live
     bug.
  2. **`restartCallbacks` outlive both completion and reconnect.** The
     O15 comment's "the closures are no-op-functional" claim holds only
     while the WS is down (`analyzeRange` early-returns on
     `status !== 'connected'`, so a thunk fired then merely cleans its
     own stale entry). After a reconnect the thunks are live again:
     `restartActiveAnalyses` (sole caller: the qEUBO toolbar-view watcher,
     `useAppBootstrap.ts:271`) will re-issue *completed and
     pre-disconnect* queries on the new connection. Within one connection
     that is arguably the intended qEUBO semantics ("re-run what the user
     considers active under the new posture"); across a
     disconnect→reconnect it means a toolbar-view toggle can resurrect
     queries the user believes dead, at engine-compute cost. Whether
     "active" should mean *not explicitly stopped* (current) or *in
     flight* is a semantics call — flagged in §6 for the maintainer, with
     the owner-module extraction as the structural landing.

### 3.4 Out-of-scope neighbours, for completeness

The DEV-only perf composables (`scenarioContext`, `autonav`,
`useAutoPopoverPerf`) consume the telemetry view read-only and register
nothing. The board-card-trees slot's multi-writer story is fully treated
in `board-scope.md` (ownership + `clear-needs-ownership` lint) and was not
re-audited.

## 4. The declined barrier, engaged on its own terms

The 2026-06-03 decline of a general `whenHydrated()` gate carried a named
re-trigger: *a second genuine instance of the one-shot
persistent-truth → ephemeral-substrate binding class appears.* This audit
looked for that instance in the three residue surfaces and **did not find
one**: telemetry and the analysis-service maps have no persisted input at
all (the binding the barrier would sequence does not exist), and the
thumbnail caches derive per-read from whatever the store currently holds,
with keys that orphan rather than collide across the hydrate boundary.
Every hydration-coupled surface found is already behind nets 1–3 and 6.

**Verdict: the re-trigger has not fired. The decline stands; no
`whenHydrated()`, no lint, no new machinery.** The operative guards remain
the `ProfileState` invariant comment (net 2's durable carrier), the two
convergent mitigation patterns (re-firing watchers, gated write-backs),
and — added by this audit — the named latent trigger in §3.2, which is the
honest form of "watch for the second instance" for the one place a future
edit could mint it.

## 5. Verdict table (the fork's hydration-coupled-state inventory)

| Surface | Band | Axis H (hydration ordering) | Axis I (identity flip) | Reconnect | Residue |
|---|---|---|---|---|---|
| `useQueryTelemetry` singleton | [B1] | not in class (no persisted input) | transitive via engine-stop + settle-bound match rows | sweep on disconnect; idempotent vs auto-cleanup | `'probe'` kind registrar-less; tick timer never stops (§3.1) |
| `usePlayFromPosition` match telemetry leg | [B3] | not in class | settle-bound; loop throws on board loss | timeout-settled within `perMoveTimeoutMs` | bounded stale row ≤ per-move timeout (§3.1) |
| `useThumbnailCache.snapshotCache` | [B3] | per-read derivation; pre-hydrate entries orphan (random ids) | netted (O9 row) | n/a | latent: node-content immutability rests on `applySetup` staying caller-less (§3.2) |
| `useCardThumbnail.cache` | [B3] | no hydration coupling (cards aren't blob content; SGF immutable) | netted (O10 row, privacy-relevant) | n/a | none |
| `analysis-service` four per-board maps | [B3] | not in class (interaction-derived; connect is user-driven) | netted (registry row 1) | deliberate no-clear (O15 tag); reconcile-on-next-interaction | completed entries persist until explicit stop; live-again restart thunks after reconnect (§3.3) |

For the generic-knowledge fork: the [B1] telemetry singleton ports as-is;
the [B3] rows are replaced wholesale with their engine/board band
(ADR-0003), and the *nets* — not the sites — are what the fork should
carry over (nets 1–4, 6 are domain-free machinery; net 5 is the
board-scope lifecycle pattern to re-instantiate for whatever the fork's
unit-of-work is).

## 6. Dispositions and maintainer flags

No code shipped by this arc: every residue is either documented-as-designed
(O15 reconcile-on-interaction), latent-with-named-trigger (`applySetup`),
bounded-and-cosmetic (tick timer, probe variant), or owned by an
already-filed item. Pointers:

1. **`multi-writer-slots-get-owners` (staged)** — §3.3's two wrinkles
   attach to its engine-connection-owner leg (7(iii)). The maintainer
   question to settle when that lands: should `restartActiveAnalyses`
   mean "not explicitly stopped" (current; thunks survive completion and
   reconnect) or "in flight"? The fix shape differs, and the current
   semantics may be intentional for qEUBO A/B re-runs.
2. **`thumbnail-render-lifecycle-consolidation` (open)** — inherits the
   §3.2 latent trigger: wiring `applySetup` (or any future mutation of an
   existing node's position content) obliges snapshot invalidation.
3. **`code-comment-stable-handles` (staged)** — the "O15" tag is used for
   two different pairs at HEAD (`analysis-service.ts:152` for the
   no-clear decision vs `closeBoard`'s cleanup #10 for
   `forestNav.selection`), and `closeBoard`'s docstring still opens with
   "Four cleanups currently fire" above a ten-entry list. Both are the
   census/handle rot that item already owns; recorded here as two more
   instances, deliberately not patched in this arc.
4. **No action** on the declined barrier (§4) — recorded so the next
   reader doesn't re-propose it without a new instance in hand.

The work-status item closes as shipped on this report per its
description ("the item closes as shipped when the residue is
dispositioned"); the close itself is left to the coordinator (this arc's
DB access was read-only).

---

## Appendix — Audit commission prompt (verbatim)

Per the standing verbatim-record discipline, the commission this audit was
executed under:

> Item: hydration-rebind-residue-audit (audit §3.9). This is an
> INVESTIGATION arc: read end to end
> docs/notes/consult/opus-consult-2026-06-03-knowntags-fence-and-boot-ordering.md
> and docs/notes/postmortem/postmortem-pbo-claim-rehydration-2026-05.md,
> then audit the named residue (useQueryTelemetry reconnect-rebind
> contract; thumbnail caches' hydration axis; analysis-service per-board
> maps), reading each surface's source fully. Deliverable: a class doc
> under docs/notes/ (pick the honest genre home per the directory READMEs
> — likely an audit note
> docs/notes/audit/audit-hydration-rebind-residue-2026-06-10.md) that
> names the failure shape on BOTH axes (hydration ordering vs
> identity-flip), indexes the existing nets, records each residue site's
> verdict WITH its ADR-0003 band tag, and engages the declined-barrier
> decision on its own terms (do not re-propose whenHydrated unless a site
> genuinely needs it — then flag for maintainer rather than building).
> SMALL code fixes are in scope only where a residue site shows a concrete
> defect and the fix is minimal-touch; otherwise record. The item closes
> as shipped when the residue is dispositioned.

The full report is this document; no sub-agents were spawned (the surface
count was small enough to read inline, and every claim above is grounded
in a file:line the auditor read directly).

License: Public Domain (The Unlicense).
