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
