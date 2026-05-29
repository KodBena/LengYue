# Deferred Items — Active Ledger

- **Status:** Active. Items land here the moment they surface; they
  leave when they're addressed (with a brief note describing the
  outcome) or get promoted to `docs/TODO.md` when their priority
  rises.
- **Genre:** Working-memory offload for items that don't yet warrant
  a TODO entry, an ADR, or a deferred-decisions entry, but which
  would otherwise be lost.
- **Distinct from:**
  - `docs/TODO.md` — actively scheduled work.
  - `docs/notes/decisions-deferred.md` — decisions explicitly made
    *against* action, with revisit triggers. Items here haven't
    been decided either way; they're in the queue to *think about*.
  - `docs/adr/` — decisions that have fired.

## How to use this file

When something surfaces during work that doesn't fit anywhere else
yet — a code smell flagged in passing, an audit that should
happen but isn't scheduled, an RFC idea, an inconsistency that
needs resolving — append it here with a date and one paragraph.
Don't agonize over the wording; the goal is preventing loss, not
producing a polished record.

When an item is addressed, replace its body with a one-line
outcome and the date, leaving the entry visible as historical
record. When an item turns out to deserve a proper TODO entry, an
ADR, or a decisions-deferred entry, move it there and remove from
this file.

---

## Open items

### Adaptive-query cancellation leak (mid-adaptive `terminate` — likely proxy-side)

- **Surfaced:** 2026-05-29 (RB-3 scoping; maintainer-reported).
- **Concern:** Cancelling an adaptive range query works only if cancelled
  *before* the adaptive phase fires. Cancelled *during* the adaptive phase
  (after the original final, before adaptive completes), the proxy query is
  left running while the SPA stops caring about responses
  (`analysis-service.ts::stopQuery` sends one `terminate{terminateId}` then
  `activeQueries.delete` → the `onAnalysisUpdate` guard
  `if (!queryInfo) return` drops all further packets).
- **The SPA model is correct, per the intended contract.** The proxy
  unifies original + adaptive behind **one id**, rewriting `isDuringSearch`
  until the *whole* (adaptive-included) query is done (v1.0.20
  adaptive-reevaluate streaming refactor) and translating that single id
  back to the SPA. So "one id / one terminate / drop-on-cancel" is the
  right SPA shape — there is no adaptive *child* for the SPA to track.
  Leading hypothesis is therefore **proxy-side**: a mid-adaptive
  `terminate{terminateId: parentId}` isn't routed through the id-namespace
  chain (`client_id → internal_id → canonical_id → wire_id`, v1.0.21
  branding) to the running adaptive sub-query, or doesn't cascade across
  the original→adaptive boundary. **Not confirmed** — proxy-vs-SPA must be
  settled with runtime visibility, not wire inference (umbrella
  cross-boundary discipline).
- **Primary diagnosis step (do first):** capture proxy structured logs
  (`proxy/docs/logging.md`) for a mid-adaptive-cancel repro — the `forward`
  events + the role-tinted bind chain's `cid` / `orig` id fields — and read
  whether the `terminate`'s id resolves to the adaptive sub-query's internal
  id and whether the adaptive search actually stops. Three outcomes →
  three fixes: (1) terminate id doesn't *name* the adaptive sub-query →
  contract gap, coordinated proxy + SPA fix; (2) terminate matches but proxy
  doesn't stop → proxy bug; (3) terminate never arrives in time → SPA bug
  (wait-for-ack / re-send).
- **If proxy-side (likely):** file a dispatch under `docs/dispatch/` and a
  coordinated proxy bump (the submodule's own arc), not a frontend fix.
- **Bears on the typed-effect decision.** On the corrected
  (single-id-is-correct) understanding this does **not** fire the §5
  Effect-TS reserve trigger on the SPA side
  (`docs/notes/typed-effect-documentation-plan.md`); record the
  trigger-status there once the diagnosis confirms the side.
- **Code refs:** `src/services/analysis-service.ts` `stopQuery` (1029–1058),
  `onAnalysisUpdate` guard (895–896); wire `terminate` shape
  `src/engine/katago/types.ts` (315–320).

### `--surface-1` backgrounds (low-contrast on the default theme)

- **Surfaced:** 2026-05-29 (Phase-3 tab-editor review).
- **Concern:** `var(--surface-1)` resolves to a dark-grey on the
  default "cluster" theme; under the black default text it reads as
  low-contrast and tiring. It is almost never the right background —
  `--surface-0` is the default for content / cards / inputs, and any
  `--surface-1` should be a justified exception. The Phase-3 editor's
  `.tab-block` shipped with `--surface-1` and was fixed to `--surface-0`;
  a few other call sites still use it, unaudited.
- **Suggested next action:** `grep -rn "surface-1" frontend/src` and
  excise the non-deliberate usages (→ `--surface-0`, or annotate the
  genuine exceptions with a justification comment). Low priority —
  cosmetic/contrast, not functional. The convention is recorded in the
  assistant memory `feedback-surface-1-exception-only`.

### Scattered non-coalescing timing literals

- **Surfaced:** 2026-05-29.
- **Concern:** `frontend/src/lib/timing.ts` now centralises the
  reactivity-*coalescing* windows (debounce / throttle intervals)
  into one auditable surface. The adjacent timing literals of a
  *different* category remain scattered — each named and documented
  at its use-site, but not catalogued together: timeouts
  (`KATAGO_ANALYSIS_TIMEOUT_MS` 30 s in `useReviewSession`,
  `DEFAULT_TIMEOUT_MS` 60 s in `usePlayFromPosition`), display
  durations (`REVEAL_DURATION_MS` 8 s in `useTransientLogReveal`),
  and interaction delays (`DEFAULT_CLOSE_DELAY_MS` 150 ms in
  `useHoverPopover`). They were deliberately kept out of the
  coalescing refactor to preserve its semantic clarity — folding
  "how long before we give up" together with "how often we redraw"
  dilutes the "this is the coalescing tuning surface" reading.
- **Suggested next action:** Decide whether to (a) leave them in
  place (each is already magic-literal compliant — this is an
  auditability nicety, not a compliance gap), (b) add a sibling
  `timeouts` / `durations` catalog, or (c) extend `timing.ts` with
  clearly-sectioned categories. Low priority; the coalescing
  surface was the actual smell flagged by the user.

### ADR-effectiveness audits

- **Surfaced:** 2026-04-26.
- **Concern:** The seven ADRs (especially the four tenets:
  ADR-0002, ADR-0004, ADR-0005, ADR-0006, with ADR-0007 newly
  proposed) are policy, not mechanism. Their adoption is assumed,
  not measured. A periodic audit pass — "where in the codebase
  does this tenet not currently hold, and why" — would surface
  drift before it ossifies. ADR-0002 is the most overdue: a
  codebase-wide sweep for silent retries, swallowed errors,
  sentinel-instead-of-throw, ACL-coercion-instead-of-validate,
  and empty catches has not been done since the tenet was
  adopted. ADR-0007 will need its own audit once accepted (file
  size, density, formatting compliance). The discipline itself is
  ADR-shaped: an ADR-0008 or similar that prescribes how and when
  ADRs get audited would close the loop.
- **Suggested next action:** Decide whether the audit cadence is
  itself an ADR (likely yes) or an ad-hoc TODO item per ADR
  (likely no — too easy to forget). Probably an ADR that
  prescribes a per-tenet audit checklist, an audit ledger
  destination, and a cadence trigger (every N months, or every
  major umbrella event).

### Serial numbers on compiler-generated artifacts

- **Surfaced:** 2026-04-26.
- **Concern:** Generated files (notably `frontend/src/types/backend.ts`)
  are correlated to a known backend state only by external
  knowledge ("I just ran `npm run gen:api`, so this is current").
  When a frontend agent receives a generated file out of band,
  there's no in-file marker that says which backend revision /
  commit / build it corresponds to. A short serial — could be a
  timestamp, a content hash, a git SHA snippet, or a
  monotonically incrementing integer — embedded in a header
  comment of generated files would let downstream readers (human
  or LLM) verify they're working against the version they think
  they are.
- **Suggested next action:** Draft an RFC that proposes the
  serial format, the generation hook (where does the serial come
  from), the embedding location (header comment vs. constant
  export), and the consumer-side validation pattern. No
  implementation work until the RFC is reviewed.

### LoadAction type is dishonest (ConfirmLoadModal.vue)

- **Closed:** 2026-04-27 in C2.2 (branch
  `frontend/c2.2-use-dirty-board-guard`). `ConfirmLoadModal` now
  exposes `Promise<LoadResult>` with the structured
  `{ action, remember }` pair — the more honest shape recommended
  in the original entry. The `as LoadAction` cast is gone.

### Silent guard fail in handleLoadCardFromDatabase (App.vue)

- **Closed:** 2026-04-27 in C2.2 (branch
  `frontend/c2.2-use-dirty-board-guard`). `useDirtyBoardGuard`
  owns the policy; the silent early-return is replaced with an
  explicit `throw new Error(...)` if the modal ref is null at
  handler-call time. The handler in App.vue no longer exists;
  the contract is documented in the composable's JSDoc.

### Engine connection lifecycle on logout (deployment-model-dependent)

- **Surfaced:** 2026-04-27 (during auth-lifecycle UX planning,
  in dialogue with the user about the breakdown of "engine"
  state across user-owned vs runtime).
- **Concern:** `resetWorkspace` (added to `store/index.ts`)
  resets boards, activeBoardIndex, profile, and session on
  auth-identity loss but intentionally does NOT reset
  `store.engine` (status, metrics, activeMode, messages). The
  reasoning: under today's local-machine deployment, the
  WebSocket URL (`ws://127.0.0.1:8765/katago` per
  `defaults.ts:13`) is not user-keyed; User A's URL == User B's
  URL == default in practice, so the same physical socket
  serves both honestly. Half-resetting `store.engine` (e.g.,
  flipping `status` to `'disconnected'` while the socket is
  still open) would create a real ADR-0001 violation — runtime
  state lying about reality.
- **Trigger to revisit:** Any deployment-model shift that makes
  the WebSocket URL user-keyed. Concrete cases:
  - Cloud-compute KataGo where each user has a paid endpoint.
  - Rented per-user analysis (library / shared institution
    setting where users have distinct accounts on a
    shared-but-multi-tenant analysis service).
  - Auth-bearing analysis tokens (any setup where the
    WebSocket carries identity-specific credentials).
- **Suggested next action when triggered:** Extend
  `resetWorkspace` to also reset `store.engine` to its
  initial-construction shape (matching the literal at
  `store/index.ts:38–48`), AND wire
  `analysisService.disconnect()` (or the equivalent) into the
  reset path so the actual WebSocket tears down. The
  `analysisService` would need to expose a `disconnect()`
  method if it doesn't already; coupling the reset to the
  service is acceptable at that point because the engine
  becomes part of the user-identity dimension.
- **Adjacent observation:** The user's pushback during this
  planning that prompted the entry was structurally
  illuminating — the original framing ("machine-level vs
  user-level") didn't survive scrutiny because the user IS in
  control of connect/disconnect. The honest framing is
  user-keyed-or-not; this entry preserves that distinction
  for the future revisit.

### Remove legacy auth-key compat shim (api-client.ts)

- **Surfaced:** 2026-04-27 (during de-branding round 2).
- **Concern:** `api-client.ts` carries a one-shot compat shim
  (`migrateLegacyAuthKeys()`) that migrates from the
  pre-de-branding identifiers `'ebisu_jwt_token'` /
  `'ebisu_username'` to the canonical `'auth_token'` /
  `'auth_username'` on module init. Per ADR-0002 documented
  exception #3, it's a bounded-and-scheduled-for-removal compat
  shim. Once monitoring confirms no users still carry the
  legacy keys (or after a release cycle), the shim can be
  removed.
- **Suggested next action:** Open a small cleanup PR removing
  the function definition and its single call. ~30 lines
  deletion (function + comments). The relevant TODO Medium-tier
  entry already retired in the de-branding round 2 PR; this
  entry is the follow-on shim-removal target.

### Tags-fetch hydration race (useAppBootstrap.ts)

- **Surfaced:** 2026-04-27 (during B5 finalization / identity-aware
  SyncService rework).
- **Concern:** `useAppBootstrap.onMounted` fires
  `backendService.getTags()` concurrently with `sync.connect()`'s
  hydration. If `getTags()` wins the race, the store mutation
  `store.profile = { ...store.profile, knownTags: ... }` runs
  first; then hydration's `updateFromRemote(doc.data)` overwrites
  the entire profile, dropping `knownTags`. Pre-existing; benign
  in practice (knownTags is re-fetchable on demand and isn't
  user-authored data), but it's a real ordering bug that an audit
  should pick up. Belongs to the same general category as the
  identity bug just closed in B5 finalization (race on async
  store mutations during boot).
- **Suggested next action:** Either await `sync.connect()`'s
  initial hydration before the tags fetch (requires sync to
  expose a `whenHydrated()` promise or similar), or move
  `knownTags` to a separate composable that watches
  `store.profile` and re-applies after any identity change.
  Defer to a future B-arc-style refinement; not blocking.

### Refactoring queue from ADR-0007

- **Surfaced:** 2026-04-26 (during ADR-0007 drafting).
  **Refreshed:** 2026-05-06 with current line counts; the
  pre-refresh entry's claims about App.vue (`591 lines`,
  "first target after B5") were stale relative to ongoing
  incremental refactoring work.
- **Concern:** Files failing ADR-0007's single-view test (red
  flag, > 300 lines) need to be queued for refactoring. Current
  counts (sampled 2026-05-06):
  - `App.vue` (513 lines) — already a focus of incremental
    refactor work (down from 591 at original audit time);
    Vue SFC's "template + style" sections make trimming below
    250 hard, even after composable extractions and child-
    component splits. The "god component" framing is no longer
    accurate; it's now an orchestrator that hosts multiple
    tabs and dispatches to extracted children.
  - `PaletteEditor.vue` (531 lines).
  - `useReviewSession.ts` (483 lines) — state-machine
    exception likely applies; verify before refactoring.
  - `HorizontalTimelineVisualizer.vue` (392 lines).
  - `MintCardModal.vue` (393 lines).
  - `BaseChart.vue` (345 lines).
  - `types.ts` (953 lines) — type-catalogue exception applies;
    no action needed unless a clean domain seam appears.
  - `ForestDirectory.vue` (~335 lines post-2026-05-06 redesign;
    `useForestBrowsePolicy` extraction kept it from growing
    further past budget; further refactor is feasible but not
    high-priority).
  Yellow flag (200–300): `CardSetEditor.vue`, `TreeWidget.vue`,
  `MoveSuggestions.vue`, `BoardDisplay.vue`. Review on next touch
  per ADR-0007.
- **Suggested next action:** No batch refactor — handle
  incrementally per ADR-0004's posture. With App.vue already
  trending down from incremental work, `PaletteEditor.vue`
  (currently the largest non-App SFC) and `useReviewSession.ts`
  (the largest TS file outside type-catalogue exceptions) are
  the natural next targets when bandwidth opens up.

### Review-state convention inconsistency between App.vue and BoardTab.vue

- **Surfaced:** 2026-05-03 (during the audit pass for the
  anchor-decouple-via-alias PR).
- **Concern:** Two sites render review-session lifecycle state
  with different anchor choices for what looks like the same
  conceptual state.
  - `BoardTab.vue` `.review-complete` → `--state-success`
    (green).
  - `App.vue` review-state ternary line ~331 →
    `--accent-secondary` (orange) when
    `reviewSession.state.value === 'FINISHED'`,
    `--state-attention` (red) otherwise.

  Either the two sites mean different things (e.g., App.vue's
  "FINISHED" indicator is meant to read as "session ended, take
  next action," while BoardTab's `.review-complete` is meant to
  read as "this card's review is done"), in which case they're
  legitimately different anchors and need clearer naming; or
  they're meant to render the same state and one of them is
  off-convention.

- **Suggested next action:** Decide what each site is rendering,
  then either adopt the new `--review-active` /
  `--review-intermission` / `--review-complete` aliases on
  App.vue too (if the conceptual state matches BoardTab) or
  introduce a separate anchor for the App.vue indicator. Either
  way, the visible inconsistency is recorded for explicit
  resolution rather than silent drift.

### PV-overlay typography proportions — calibration question

- **Surfaced:** 2026-05-03 (during magic-literals audit Pass 2
  Tier-1 #3 — the geometry substrate. The audit's named
  triggering specimen was the `* 0.88` PV-stone-radius variant
  removed earlier; the geometry PR closes the `* 0.46` and
  `* 0.4` clusters by introducing `STONE_RADIUS_RATIO` and
  `MARKER_INNER_RATIO` in `engine/constants.ts`. Five
  PV-overlay-specific multipliers in `MoveSuggestions.vue`
  remain unaddressed and are the subject of this entry.)
- **Concern:** `MoveSuggestions.vue` carries five
  stoneR-relative multipliers for the suggestion / PV-preview
  overlay typography:

  | Site             | Expression          | Role                                                                |
  |------------------|---------------------|---------------------------------------------------------------------|
  | line 160         | `stoneR * 1.01`     | suggestion cluster ring radius (1% wider than stone — outline)      |
  | line 193         | `stoneR * 0.72`     | suggestion winrate-label font-size (primary text, e.g. "53%")       |
  | line 200         | `stoneR * 0.62`     | suggestion score-label vertical offset (positioning, not size)      |
  | line 202         | `stoneR * 0.58`     | suggestion score-label font-size (secondary text, e.g. "+2")        |
  | line 229         | `stoneR * 0.82`     | PV-preview move-number label font-size (overlaid on PV stones)      |

  The font-size triple (0.58 / 0.72 / 0.82) is honestly a
  typographic hierarchy: secondary text < primary text <
  PV-preview text, with the score-label offset (0.62) coupled
  to the font-size relationship. The 1.01 outline is mostly
  independent (just-larger-than-stone for the stroke). These
  values are likely **co-calibrated by eye** for the PV
  preview's visual rhythm — they're not drift, they're a tuned
  typography hierarchy.

  This is the same shape as the use-pv-animation defaults
  deferral (recorded above): the magic-literals audit's two
  working principles (snap-by-cluster and decouple-via-alias)
  don't apply. Naming them individually as constants without
  also naming the calibration would lose the context that the
  values are meant to relate to each other in a specific way.

- **Suggested next action:** When the user prioritises a
  PV-overlay typography revisit (e.g. as part of the broader
  font-size scale substrate for the Tier-2 sweep, or as a
  standalone polish pass), walk the MoveSuggestions overlay
  and decide whether to (a) name the calibration explicitly
  (e.g. a `pvTypography = { winrate: 0.72, score: 0.58, scoreOffset: 0.62, pvLabel: 0.82 }`
  object with a doc comment naming the relationships and the
  by-eye tuning rationale), (b) consolidate to the broader
  font-size scale if the PV preview's text sizes turn out to
  align with chrome typography tiers, or (c) leave inline
  with `magic-literal:` comments naming the calibration.
  The 1.01 outline can be split off cleanly as
  `SUGGESTION_OUTLINE_RATIO` if useful or left inline. Until
  investigated, the magic-literals audit's Pass 2 sequencing
  leaves these set aside (referenced in
  `magic-literals-audit-inventory.md`'s adjacent observations
  and the geometry-ratios PR's worklog).

- **Partial resolution (2026-05-22):** the `magic-literal: 60ms
  suggestion-ring/disk fade` block that previously sat alongside
  these five multipliers and referenced this entry has been
  promoted to a user-controlled knob
  (`display.move-suggestions-fade-ms`, range [0, 200] ms,
  default 60). The original deferral rationale ("calibration
  context would be lost if we extracted the value individually")
  no longer applies for that piece — the user is now the one
  choosing the calibration. The five typography multipliers
  documented above remain deferred; only the fade duration
  was promoted.

### PV-animation defaults — pairwise-calibration question

- **Surfaced:** 2026-05-03 (during magic-literals audit Pass 1
  inventory authoring; the divergence was initially flagged
  Tier-1 in PR #98 before the user surfaced the calibration
  concern).
- **Concern:** `composables/use-pv-animation.ts:95-97` declares
  its own defaults for `stepDelayMs: 350`, `windowDurationMs:
  600`, `fadeDurationMs: 150`, `pvOpacity: 1` — the same numeric
  values that `store/defaults.ts:225-227` already owns. The
  structural shape matches the gradingParameter Item-18 finding
  (two sources of truth for the same nominal handles, no
  compiler check), and the magic-literals audit's Pass 1
  inventory initially flagged "import from `defaults.ts`" as
  the consolidation move.

  The calibration concern: the four values may be **pairwise-
  calibrated** to produce the repeating-window animation's
  intended visual rhythm — `windowDurationMs` and `stepDelayMs`
  jointly determining how many PV stones are simultaneously
  visible, `fadeDurationMs` setting their on/off envelope, and
  the ensemble being tuned-by-eye rather than each value being
  independent. If they are co-tuned, "merge to one source"
  flattens an invariant the values hold; the right move is
  *naming the calibration as a calibration* (e.g., a comment
  block or a typed `PVAnimationCalibration` shape), not removing
  the duplication. A recent fix to the PV-animation code may
  have decoupled the pairwise interaction; the user is not
  certain and the magic-literals audit isn't the place to
  determine it.

  This is a **third pattern** beyond the magic-literals audit's
  two working principles: snap-by-cluster (collapse drift) and
  decouple-via-alias (separate accidental-value-matches between
  distinct roles). **Co-tuned constants** — values whose
  individual identities are subordinate to a calibrated
  relationship — neither consolidate cleanly nor decouple
  cleanly. Recording the pattern here so the same shape, when
  encountered in future audits, gets the same treatment:
  postpone consolidation until the calibration question is
  answered.

- **Suggested next action:** Walk `use-pv-animation.ts`'s
  defaults against the composable's window logic to determine
  whether the four values are pairwise-coupled (e.g., does
  `windowDurationMs` need to be ≥ `stepDelayMs *
  (windowSize - 1) + fadeDurationMs * 2` for the intended
  rhythm?) or whether the recent fix decoupled them. If
  coupled: keep as-is, document the calibration in the file
  header, treat `defaults.ts`'s names as the entry-point
  vocabulary and the composable's local declaration as the
  calibration's authoritative implementation. If decoupled:
  standard consolidate-via-import, then close as Item-18-class
  divergence. Until investigated, the magic-literals audit's
  Pass 2 sequencing leaves this set aside (referenced in
  `magic-literals-audit-inventory.md`'s adjacent observations
  and category N verdict).

### Mistake-finder un-punished-flag brittleness

- **Surfaced:** 2026-05-28.
- **Concern:** The un-punished red-flag heuristic in
  `useMistakeFinder` (Stage 2 of the mistake-finder substrate)
  uses a per-board quantile threshold (default worst 15%) to
  decide what counts as a mistake, then flags consecutive
  user-mistake → opponent-mistake pairs as un-punished. In a
  clean game with few real mistakes, the worst-15% bracket
  pulls in marginal moves that aren't mistakes in any absolute
  sense; a marginal move followed by a marginal opponent move
  then surfaces as a false-positive un-punished red flag.
- **Surfacing case (2026-05-28, project author, verbatim):**
  > there's a "not-really-a-mistake" that is marked as a
  > flagged mistake because the opponent didn't play as the
  > neural net wanted on the follow-up. In reality, my move
  > was the second preferred move for the weakest net, the
  > preferred for the strongest net, and the opponent played
  > the second-preferred move for the strongest net. So, it
  > is brittle, but that is expected — after all, it's an
  > under-explored area of knowledge acquisition.
- **Why deferred:** detecting mistakes in Go from a single
  net's terminal eval is the brittle special case, not a
  fix-able bug in the heuristic. The substrate already has —
  or is queued to grow — the equipment a future de-brittling
  arc would draw from. Stage 2's scope was to land the
  consumer-side substrate honestly; de-brittling is its own
  arc with its own design question.
- **Avenues to revisit (none on the critical path; pick
  whichever the surfacing case justifies):**
  1. **Absolute-severity floor alongside the quantile.** A
     move qualifies only if oriented-delta crosses both the
     per-board quantile AND a palette-specific absolute
     magnitude. Cheap; modest improvement; doesn't address
     marginal cross-net mistakes.
  2. **Cross-net agreement via SELECTOR routing.** The
     surfacing example is a cross-net divergence: weak-net
     and strong-net disagree on the move's ranking. The
     SELECTOR capability shipped on the proxy side (v1.0.15+);
     a frontend extension would issue parallel queries to a
     labelled model pool and treat agreement as a confidence
     signal. Substantial cross-team arc.
  3. **Within-position stability.** The stability-surface arc
     (`stability-surface-design-space.md`) is a different axis
     (V-axis within a single net's search trajectory) but
     composes: a marginal-call mistake by a single net's
     terminal eval might be unstable across V, which the
     stability surface would surface. A future un-punished
     gate could require both moves to be stably-bad.
  4. **Cross-palette agreement.** A move that quality_delta,
     scoreLead_loss, and rank_quality all flag is more
     credible than one only flagged by quality_delta. No new
     substrate; a multi-palette consumer over the existing
     per-palette outputs.
- **Glossary note (terminology surfaced in the same exchange):**
  the closest standard label for the broader question is
  *applied epistemology*; skill-domain corners include
  *deliberate practice* (Ericsson, Chase & Simon),
  *calibration* (Lichtenstein–Fischhoff, Tetlock),
  *performance epistemology* (Sosa), and chess's
  *centipawn-loss analysis* for engine-substantiated error
  attribution. The Go-equivalent vocabulary has not
  crystallised; the palette substrate is the surface where it
  would.

### Stability surface: distribution-level (information-geometric) metric

- **Surfaced:** 2026-05-28.
- **Concern:** The Stage 4 stability substrate operates on
  *categorical* extractors (`Q → packet`-mapping returning a
  primitive value like `top1_move` or `winrate_quintile`). Four
  metric variants aggregate the resulting per-V categorical
  trajectory: anchored-at-V_term, anchored-at-V_max, longest-run-
  fraction, and inverse-change-rate. None of these capture the
  user's stated intuition for what "stability" should mean —
  *"the search visit distribution is stable, integrated in some
  sense over the range of packets observed"* (project author,
  2026-05-28). That intuition is asking for a distribution-level
  metric that operates on the full visit distribution as a
  continuous probability vector, not a categorical reduction.
- **Surfacing framing (2026-05-28, project author, verbatim):**
  > my intuition on "stability" is that the search visit
  > distribution is stable, integrated in some sense over the
  > range of packets observed, I guess there's a technical term
  > that names an integral whose summands are Bayesian
  > transition functionals or something.
- **Why deferred:** different abstraction class than the v1
  substrate. The extractor framework returns scalars;
  distribution-level metrics need the full per-packet visit
  distribution (a probability vector over moveInfos entries).
  That changes the trajectory storage (changepoint compression
  doesn't apply to continuous distributions — every packet's
  vector contributes), the extractor signature (`packet →
  ProbabilityVector` not `packet → Q`), the metric registry
  (functions over distribution streams, not categorical
  changepoint lists), and the panel interpretation
  ("information traveled" reads differently from "value
  persisted"). Reasonable to ship as a parallel substrate
  alongside the v1 categorical one rather than retrofitting.
- **Technical references the substrate would draw from:**
  - **Information length** (Wootters 1981; Heseltine & Kim
    2016) — geodesic length in distribution space under the
    Fisher–Rao metric, L = ∫√I(θ)dt where I is Fisher
    information. The continuous analog of cumulative Bayesian
    surprise.
  - **Cumulative Bayesian surprise** (Itti & Baldi 2009) —
    discrete sum Σ KL(p_{i+1} ‖ p_i) over successive belief
    states. Operationally simpler than information length; same
    "did the posterior move" reading.
  - **Jensen–Shannon divergence** between adjacent packets —
    symmetric variant of KL; bounded in [0, log 2] which makes
    [0, 1] normalisation straightforward.
  - **Stein discrepancy** / **information geometry of MCMC
    convergence** for the broader framing; tangential to the
    immediate Go-search application but the same family of ideas.
- **Concrete v1 substrate shape if implemented:**
  - New extractor class: `distill: packet → ProbabilityVector`
    (alongside the existing categorical `extract: packet → Q`).
    One canonical implementation surfaces the moveInfos visit
    distribution as a probability vector over the top-K moves
    (K=10 say, padded with zeros).
  - New trajectory storage parallel to
    `StabilityTrajectory<Q>`: keeps the distribution per
    packet (no changepoint compression).
  - New metric registry: functions over distribution streams.
    Candidates: total-information-length, mean-pairwise-KL,
    max-pairwise-JS. All map to [0, 1] via 1/(1+L) or exp(-L).
  - Sibling panel (or extension of `StabilityPanel.vue`) with
    the new metric registry alongside the categorical one.
- **What this would settle:** the user's exchange flagged the
  current categorical metrics as not quite matching their
  intuition. The distribution-level metric is the canonical
  mathematical formalisation of "did the posterior actually
  move" — exactly the reading the user named. Composes
  cleanly with the existing per-turn time-series and
  cross-correlation infrastructure (the distribution metric is
  just another column in the cross-correlation matrix).

### KDE boundary bias for bounded-support palettes

- **Surfaced:** 2026-05-28.
- **Concern:** The Stage 3 distribution primitive uses standard
  fixed-bandwidth Gaussian KDE, which exhibits well-known
  *boundary bias* near the edges of a bounded support. For
  palettes whose `delta_fn` output lives on a known compact
  interval — `quality_delta` and `rank_quality` are both [0, 1]
  — the estimated density visibly extends past the support
  boundary (the project author observed nonzero density at
  x < 0 on the [0, 1]-supported quality palette). The Gaussian
  kernel has infinite support; each sample's kernel "leaks"
  mass across any bounded edge, biasing the density downward
  at the boundary itself and producing a cosmetic tail outside.
- **Surfacing question (2026-05-28, project author, verbatim):**
  > Density shows negative for this [0,1] quantity. So then
  > naturally the question becomes whether it's possible to
  > constrain the shape of the estimated density (including
  > derived uncertainty estimates? or maybe not?) if the range
  > is e.g. known to be compact (as here — it's actually an
  > exponentially smoothed visit ratio so that could tell us
  > even more I suppose) or the distribution is having certain
  > known moments or functionals etc etc.
- **Why deferred:** functional impact today is cosmetic. The
  integral over the displayed range slightly exceeds 1 by the
  leaked mass (typically <5% for moderate sample sizes); the
  density curve is readable near boundaries with the
  understanding that the tail extending past the support is a
  smoothing artefact, not a probability statement. Stage 3's
  scope was the generic distribution primitive, not per-palette
  KDE specialisation.
- **Disciplined approaches (rough order of complexity):**
  1. **Reflection method** (Schuster 1985; Silverman 1986
     §2.10). For each sample s and boundary a, add a reflected
     kernel contribution at 2a − s; same for the upper
     boundary. Effectively folds the leaked mass back inside
     the support — exactly compensates for the boundary
     loss. Output clipped to the support. ~5 lines in
     `distributions.ts`'s KDE loop; the SE formula needs a
     minor adjustment (the equivalent kernel is no longer
     Gaussian-symmetric near the boundary; effective n at the
     boundary is roughly doubled). Cheapest disciplined fix.
  2. **Boundary kernels** (Müller 1991; Jones 1993). Modified
     kernel near the boundary that integrates to 1 within
     support. More principled, more parameters to choose.
  3. **Transformation method.** Map the support to (−∞, ∞)
     (logit for [0, 1]: u = log(x/(1−x))), run standard KDE on
     the transformed samples, transform back with the Jacobian
     correction. Eliminates boundary bias by construction.
     Composes naturally with the author's observation that the
     quantity is an exponentially-smoothed visit ratio — a
     tailored transformation exploiting the visit-ratio's
     functional form could surface more structure still.
  4. **Beta-kernel KDE** (Chen 1999). Beta-distribution kernels
     are naturally [0, 1]-supported — no boundary correction
     needed. Cleanest match for the specific case but doesn't
     generalise to other supports.
- **Substrate shape if implemented:** add a per-palette
  `support?: [number, number]` field to `AnalysisPalette`
  (parallel to `delta_ordering`), threaded through to the KDE
  consumer. Only the bounded-support palettes (quality, rank)
  declare it; score-loss palettes leave it unset. The KDE
  variant of DistributionChart accepts a `support` option and
  applies the chosen method (reflection is the recommended
  default given its complexity / benefit ratio). Upper-bound
  band clipping at the support edge is a natural companion:
  a ±1.96·SE band reaching above 1 on a [0, 1] support is
  honestly informative ("the curve estimate has more
  uncertainty than the support's full width") but visually
  conflates with the (true) fact that density can exceed 1 on
  bounded intervals, so clipping to the support per convention
  is the safer call.

---

## Closed items

### ForestStat / TagStat — wire-shape passthrough at the ACL boundary

- **Surfaced:** 2026-05-03. **Closed:** 2026-05-06 in PR
  `frontend/foreststat-tagstat-acl`. Worklog:
  `docs/archive/worklog/2026-05-v1.0-to-v1.1/2026-05-06-foreststat-tagstat-acl-translator.md`.
  Pre-PR-0 of the Forest Directory hierarchical redesign arc.
- **Outcome (ForestStat — real fix):** `mapForestStat` translator
  added at `services/backend-service.ts`; `ForestStat` in
  `types.ts` rewritten to camelCase with branded ids
  (`rootCardId: CardId`, `gameSourceId: GameSourceId`); nullable
  metadata strings (`description`, `playerWhite`, `playerBlack`)
  preserved as `string | null` per ADR-0002 ("validate, not
  coerce" — consumers handle the no-metadata case at the
  presentation boundary). Five consumer sites swept:
  `useCardTreeData.ts` (one cast), `ForestDirectory.vue` (template
  + script, two casts), `card-tree-echarts.ts` (tooltip composer).
  Counts (`totalCards`, `totalReviews`, `averageRecall`) stay bare
  per the entry's own "brand the meaningful, not the trivial"
  recommendation.
- **Outcome (TagStat — structural-redundancy translator):**
  `mapTagStat` translator added even though wire and domain
  shapes are field-for-field identical (no snake_case to
  rename, no ids to brand). Documented at the type declaration
  and the translator site as a forward-looking indirection point —
  if backend ever renames `name` or adds a field, the boundary
  exists. The honesty trade-off is recorded in the worklog: a
  no-op translator is a small ADR-0002 lie of its own (looks like
  ACL work, does none). The deferred-items entry's framing of
  TagStat as a discipline gap won the call; the convention
  argument was the deciding factor.
- **Settled direction recorded:** future ACL passthroughs that
  share field shapes with the wire by accident still get a
  translator stub at the boundary, with a doc comment naming the
  redundancy explicitly so future readers don't conclude the ACL
  has nothing to do.

### Anchor role overloading in the chrome substrate

- **Surfaced:** 2026-05-02. **Closed:** 2026-05-03 in PR
  `frontend/anchor-decouple-via-alias`. Worklog:
  `docs/archive/worklog/2026-05-v1.0-to-v1.1/2026-05-03-anchor-decouple-via-alias.md`. TODO
  Completed row: under Frontend.
- **Outcome:** Strict-scope decouple-via-alias landed for the
  two named overloading patterns. Five role aliases added to
  `theme.css` and `ChromeAnchor`: `--player-black`,
  `--player-white`, `--review-active`,
  `--review-intermission`, `--review-complete`. Six chart sites
  swept to use the new player aliases (`useEnrichedData.ts`,
  `useAnalysisProjection.ts`, `AnalysisChartPanel.vue`); three
  sites swept to use the review-state aliases (`BoardTab.vue`).
  Visual unchanged at the time of the change; future tuning can
  break the aliasing without disturbing chrome.
- **Settled direction recorded:** the decouple-via-alias
  principle and the related "color-mix derivation over
  multi-tone anchor families" preference now live as a
  "Substrate evolution" section in
  `docs/archive/notes/frontend-theming-plan.md` — settled direction for
  any future substrate-tuning PR, applicable to typography /
  spacing / animation / z-index by analogy when those SSOT
  refactors arrive.
