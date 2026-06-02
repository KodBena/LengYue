# Release Retrospective — v1.1.0

- **Status:** Closes v1.1.0. The work between v1.0.0 (2026-04-30)
  and the v1.1.0 tag is shipped, and the doc graph is current.
- **Genre:** Whole-project retrospective. Peer of
  `docs/archive/notes/release-retrospective-2026-04.md` (the v1.0.0
  retro), and the umbrella retrospective for the cycle —
  not a substitute for the per-arc retros (`reflection.md`,
  `audit-reflections.md`, `test-coverage-2026-05.md`,
  `frontend-test-coverage-2026-05.md`, the
  resource-ownership and magic-literals audit close-outs)
  which carry the within-arc detail. This document points at
  them and frames the cycle's overall shape.
- **Date:** 2026-05-08.
- **Audience:** Future contributors, future-self returning cold,
  future audit-LLMs, and any community member tracking the
  project's post-v1 evolution.
- **Retires when:** never. Closure document for a specific
  release; future releases author their own retrospectives.

## What this document is, and how it was written

A working contributor's assessment of the project across the
v1.0.0 → v1.1.0 cycle — eight days, 289 commits on `main`, two
testing arcs, one cross-team feature, one large UX restructure,
six audit / discipline arcs, six proxy bumps, two ADR amendments,
and a comprehensive doc-graph staleness sweep. Honest, not
promotional. Specific where I can be specific.

I am the LLM contributor (Claude Opus 4.7) writing this at the
project author's request. The author asked for *comprehensive but
not pedantic*, with the architectural discoveries (the recent ADR
amendments) and the bugs / misimplementations made visible. The
author signs off in advance on the candor; the framing is mine.

Per the v1.0.0 retro's same caveat: confidence is not certainty,
the audit reading the cycle is thorough but not exhaustive,
observations may be specifically wrong in places. Future
contributors who find an inaccuracy here should correct it inline
with a dated note.

## What the cycle was about

Calendar-short, scope-substantial. Eight days that shipped the
testing maturity that v1.0.0 honestly acknowledged was missing,
closed the long-running cross-team analysis-persistence arc,
opened the door for non-English users via i18n, ran two large
discipline audits to closure (resource-ownership, magic literals),
walked the proxy through six bumps including a structural arc at
v1.0.13, and surfaced two ADR amendments that recast the
relationship between fail-loudly and the documentation graph.

The narrative shape: v1.0.0 shipped the locked scope and stopped.
v1.1.0 is what happens when the same posture is applied to the
post-release punch-list — every gap the v1.0.0 retro named gets
addressed in turn, with discipline-arc work threaded in between
because the codebase invited it.

## How the project got here, since v1.0.0

A chronological pass — in roughly the order the work landed.

### Magic-literals audit (PRs #98–#108)

Filed 2026-05-03. The framing: a literal is `as any` for the
codebase's design vocabulary. Same auditability profile — a local
override of the named substrate that the compiler can't flag
later — so the contract is "named-and-centralised OR explicitly
justified inline; the absence of either is the discipline
violation."

Pass 1 walked all 111 frontend SFCs and TS files; Pass 2 closed
across nine substrate PRs (z-index ladder, duration tokens,
geometry ratios, spacing scale, font-size scale, border-radius
scale, letter-spacing scale, disabled-state alpha, ponder-cap
constant) plus a Tier-4 inline-justification sweep. The
substrate files now own the design vocabulary; literals at call
sites either reference a token or carry an inline justification
naming why the value is local.

The audit's structural lesson is in the framing itself: ADR-0005
Rule 1 ("single source of truth per nominal handle") generalises
beyond documentation. Nominal handles in design tokens — "primary
accent," "panel surface," "modal-z," "fast-fade duration" — earn
the same single-source treatment ADRs and dispatches do. The
audit was a ratification of that generalisation.

### Color theming SSOT arc (PRs #80–#88)

Predicate to the magic-literals audit and partially overlapping.
Phase A (#80–#88, 2026-05-02): a `theme.css` chrome substrate, a
`style.css` sweep, six SFC sweeps clustered by surface area
(rail, charts, editors, modals, forest+qeubo, shell), and a TS
chart-adapter sweep via a typed `themeColor()` accessor. Phase B
(#133, #134, 2026-05-04 → 05): a cluster-12 second theme variant
wired through `[data-theme]`, with a strict-palette follow-on
that drops `color-mix()` references in favour of palette tokens
the user can tune deterministically.

The `themeColor()` signature got tightened to a `ChromeAnchor`
union along the way — the magic-literals discipline applied
recursively to the substrate's own access surface. After the
arc, every chart-tooltip, ECharts series colour, board renderer
stroke, and SFC class derived from `--surface-N` / `--text-N` /
`--accent-*` tokens. Adding a new theme is a CSS file, not a
sweep.

### Resource-ownership audit (PRs #117–#129)

Triggered 2026-05-04 by a closeBoard bug: closing a board tab
spliced the board out of `store.boards` without ever issuing a
`terminate` for the in-flight ponder query. The proxy's keep-alive
middleware couldn't help — the WebSocket was healthy because it's
shared with surviving boards — so the canonical kept running on
the LEAF for a board that no longer existed in the workspace. A
silent compute leak with no in-app symptom.

The audit named the pattern: a workspace mutation removes or
replaces an entity that owned external resources, and Vue's
reactivity graph cleans up watchers but not the resources
themselves (proxy subscriptions, ledger entries, persistence
rows, timers, listeners, KataGoClient subscriptions). Pass 1
inventoried 15 owner-resource pairs across six mutation sites
(O1–O15). Pass 2 closed all 15 across ten PRs (13 in code, 2 by
verification with explanatory comments). Pass 3 codified the
inline-comment convention and the authoring checklist that now
lives in `frontend/CLAUDE.md`'s §"Resource ownership at mutation
sites" — `closeBoard` and `resetWorkspace` in `src/store/index.ts`
are the post-audit worked examples.

The audit's structural lesson: explicit cleanup at the mutation
site beats relying on framework-level GC. Two cleanup pairs
(O10 card-thumbnail cache, O12 per-board card-tree state) were
*privacy-relevant* — both keyed by raw CardIds that collide
across users. A regression here would silently leak prior-user
data into the new identity's session. Phase 4 of the frontend
testing arc later pinned every audit pair as a record-and-verify
spy at the integration level, so the convention is tested as
well as named.

### Cards-tab merge (PRs #140–#142)

The longest user-facing UX arc of the cycle. Filed as a design
note (`docs/archive/notes/cards-tab-merge-plan.md`) on 2026-05-04;
shipped across three coordinated PRs on 2026-05-06.

The previous shape: an "SR" tab and a "Database" tab each
rendered their own deck-config form (deck dropdown + context-ids
input) driving a pipeline run; the SR form started a review
session, the Database form populated the forest. The duplication
was real DRY violation. Independently, the user wanted to see SR
progress on the fetched forest — the current review card
highlighted in orange against the existing blue active-set
rendering.

Both motivations resolved when the forest, the review queue, and
the deck-config form share a single tab. PR 1 (#140) shipped
schema migration 15 → 16, the per-board forest, composable
signature changes, and the orange overlay. PR 2 (#141) shipped
schema migration 16 → 17, the `ReviewSessionPanel` extraction,
the `ForestDirectory` host integration, and the `App.vue` tab
collapse. PR 3 (#142) was the bug-fix sweep from the first manual
exercise.

The arc demonstrated the codebase's authoring posture under a
larger UX change: contracts before implementation (the design
note named six open decisions, all resolved in the worklogs);
two-PR seam to keep diffs reviewable; explicit bug-fix PR for the
first-exercise residue. The schema migrations 15 → 16 → 17 ran
forward-compatibly on existing local installs; ADR-0005 Rule 7
("transitional documentation sunsets itself") applied with the
design note's open-questions section being annotated with the
choices actually taken.

### Forest-directory hierarchy redesign (PRs #149–#154)

Adjacent to the cards-tab merge, shipped 2026-05-06 in four PRs.
The Roots tab was a flat scrollable list; the redesign presents
the same data as a file-manager-style hierarchy
("games → roots → cards") with expand/collapse and node-level
selection. PR 0 (#151) shipped the `ForestStat` / `TagStat` ACL
translators (camelCase + branded ids) — the precondition for the
typed traversal. PR 1 (#152) shipped the `useForestNavigation`
composable + schema migration 20 → 21. PR 2 (#153) shipped the
`ForestTreeNav.vue` component. PR 3 (#154) wired everything
together with the multi-root display cap and `useForestBrowsePolicy`.

The arc paired naturally with a context-id macros feature (#156,
#157) — three DSL-showcase decks (schema migration 21 → 22) plus
input-validation fixes for macro-typing. Game-source dedup via
`clientGameId` (#160, #161) and a forest-directory id-display
sweep (#158) closed out the navigation work.

### Cross-team analysis-persistence arc (PR #166)

The largest single feature of the cycle. Designed in
`docs/archive/dispatch/frontend-to-backend-analysis-persistence.md` and
its three status replies; shipped on the `cross/analysis-persistence`
branch and merged 2026-05-07. System-level reference:
`docs/archive/notes/design/analysis-persistence-plan.md`.

The motivation: KataGo analyses cost real GPU time and are
currently held in an in-memory ledger that's lost on browser
close. The SR loop becomes meaningfully better when those
analyses persist across sessions — the user comes back to a card
and sees their prior analysis already there.

The wire-shape design landed on per-`(user_id, board_id)` bundles
with a codec envelope (`json` and `json+gzip` for compression),
atomic quota enforcement (per-user aggregate byte size cap, with
structured 413 bodies on overflow), and a manual + batched save
shape (the user clicks "Save" on the controls pane; the server
holds the bundle until the user explicitly discards or
re-saves). The original design had considered a streaming
auto-save gated on KataGo's `isDuringSearch` flag; the manual
shape is simpler, less flaky, and matches the Go-player mental
model better.

A precursor migration shipped first: BoardId moved from a short
identifier to RFC4122 v4 UUID (frontend migration 25 → 26, plus
a follow-on 26 → 27 for the SGF-load path on 2026-05-07) so the
backend's `analysis_bundles.board_id` column could be UUID-typed
end-to-end. The frontend consumer-side then shipped across
multiple PRs: the `AnalysisPersistenceService` HTTP boundary, the
analysis-bundle parser + summary type + storage-error union, the
bootstrap restore on auth+hydrate, the `closeBoard` /
`resetWorkspace` augmentations (resource-ownership audit pair
O13), the AnalysisControls Save / Discard buttons with the
reactive summary subtitle, and the experimental-tag inline
semantics tooltip.

The arc demonstrated the dispatch ledger as a working coordination
medium — the wire-shape proposal, the wire-shape ack with
answers, the BoardId resolution, the clarifications confirmed —
each as a separate dispatch file in `docs/dispatch/`. ADR-0005's
discipline made the negotiation legible without conflating it
with the implementation.

### i18n string sweep (PRs #163, #164)

Shipped 2026-05-06. PR1 (#163) wired vue-i18n in, ran the full
string sweep across `title=` / `placeholder=` / `aria-label=`
attributes, `pushSystemMessage(...)` toasts, native `alert /
confirm / prompt` calls, and inline template text. Schema
migration 23 → 24 added `appearance.locale` with browser-
detected backfill. Toolbar gained a `LocalePicker`. Contributor
doc filed at `frontend/docs/i18n.md`.

PR2 (#164) populated the zh-CN / ja / ko catalogs with LLM
drafts plus a machine-translation notice in each catalog header.
Browser-detect locale on fresh-install means a CJK user sees the
LLM-drafted strings immediately rather than English-default.
Native-speaker review for the three CJK locales remains the
gating arc before they're marked Active in the per-locale table.

The arc shipped the plumbing v1 promised but didn't include in
the locked scope — the user-facing internationalisation gate
without which "the application reaches developers but not
players" applies internationally too, not just domestically.

### Backend testing arc (PRs #167, #170, #171, #172, #173, #175)

Shipped 2026-05-07. Five phases, five PRs. Took the backend from
`145 collected, 31 pass, 76 fail, 9 xfail, 29 errors, 1
collection ImportError` to `442 passed, 1 skipped, 2 xfailed`.
Closing reflection: `docs/notes/test-coverage-2026-05.md`.

**Four production bugs surfaced** during the arc — one per
testing tier that exercised the buggy code path:

1. **Phase 2: `StatsRepository.fetch_tag_usage` cross-tenant
   leak.** A tag Bob had used showed up in Alice's view with
   Bob's count. The `LEFT OUTER JOIN` was correct; the `COUNT`
   target was wrong (`func.count(card_tag.c.card_id)` instead of
   `func.count(card.c.id)`). Phase-2 privacy fix.
2. **Phase 2: `LineageRepository.fetch_selection` for
   `SiblingSelection` was completely broken SQL.** Unreachable in
   production because no caller used SiblingSelection; the test
   would have caught it the first time the frontend tried.
3. **Phase 2: `LineageRepository.fetch_selection` for
   `AncestorSelection` off-by-one.** The recursive step
   projected the grandparent where it should have projected the
   parent. Closed D-9 (SubtreeSelection) as a side effect — it
   reuses the ancestor walk.
4. **Phase 3: `api/routes/resources.py` 404 misrouting.** The
   route raised `ResourceNotFoundError` straight through, the
   docstring claimed `main.py` mapped it to 404, but `main.py`
   registered no exception handlers. A missing resource would
   have surfaced as 500. Fixed at the route boundary.

The arc's structural artifact is the four-tier testing posture
documented in `backend/CLAUDE.md` — pure-domain unit, service
unit with Port fakes, adapter integration via in-memory SQLite,
route via httpx + ASGITransport. The Port-fake pattern is the
load-bearing pattern; 47 service tests took 10–15 minutes each
to write once the `tests/fakes/` module was in place.

### Frontend testing arc (PRs #178–#184)

Shipped 2026-05-08. Six PRs (the user merged them via the "stack
on each other" pattern; one footnote where `--delete-branch`
auto-closed PR #180 and a fresh PR #184 replaced it). 0 → 100
tests across three tiers. Closing reflection:
`docs/notes/frontend-test-coverage-2026-05.md`.

**Zero production bugs surfaced.** Two readings, both honest:
the frontend has heavier compile-time enforcement than the
backend did pre-arc — branded IDs, discriminated unions with
exhaustiveness `never`-defaults, OpenAPI-generated wire types —
and the targets in this arc were the most heavily-exercised
modules. A future arc that extends to the less-exercised
composables (`useAuth`, the card-tree composables, the tab-flow
orchestration set) is more likely to surface latent issues. The
first reading is the load-bearing one: the architectural
discipline that makes the frontend testable also makes its bugs
fewer at the typecheck-passable layer.

The fakes pattern, the `vi.importActual` partial-mock pattern,
and the stacked-PR merge sequence are the procedural artifacts
worth carrying forward. `frontend/tests/CLAUDE.md` documents
them.

### Proxy bumps (six in eight days)

The proxy walked through v1.0.1 → v1.0.13 across this cycle,
each its own coordinated arc per the umbrella's submodule
discipline (branch in the proxy repo, PR there, get a tag cut,
then bump the umbrella's pointer).

- **v1.0.1** (lifted the v1 freeze) — empty-board ponder fix:
  the `analysis_enricher` Transformer leaked the proxy-only
  `analysis_config` field through to KataGo for queries shorter
  than two moves, producing malformed responses. Plus an MIT
  licensing-compliance PR for the vendored nlohmann/json
  dependency.
- **v1.0.2** — LEAF fail-loud startup.
- **v1.0.3** — analysis_config curation alignment (the frontend
  shipped a corresponding migration).
- **v1.0.6** — incremental fixes.
- **v1.0.11** — keep-alive SessionMiddleware (the dispatch arc
  the umbrella authored at #109).
- **v1.0.12** — incremental fixes.
- **v1.0.13** — *structural release*. Splits `KataGoResponse`
  into a discriminated union (`AnalyzeResponse | MetadataResponse`)
  eliminating the v1.0.12 `query_models` transparency bug;
  renames cryptic top-level modules (`flt`/`bsa`/`baduk`/`rxp`/
  `reginterp`) to descriptive ones; surfaces Layer 1's two
  extension surfaces as `transformers/` and `middleware/`
  directories with KataGo-specific protocol types in their own
  `katago/` package outside `AbstractProxy/`. Wire-shape
  behaviour to KataGo clients is unchanged for analyze responses
  and gains transparency for metadata responses.

The v1.0.13 release is the proxy's first major maturity
milestone — the `KataGoResponse` discriminated union is the
artifact that surfaced the silent-coercion-at-protocol-boundaries
ADR-0002-amendment work below.

### ADR amendments — design-time drift surfaces too (PR #177)

Authored 2026-05-07. Two amendments, one structural insight:

**ADR-0002 Rule 6: Design-time drift surfaces too.** When a
planning-time record (a design note, an ADR, a documented
decision) is found to be wrong in a load-bearing way, surface
the deviation rather than absorb it: file a sibling marked
`design-note: revised`, or amend the ADR by appending a rule
rather than silently editing existing text. The principle
parallels the existing five rules in a different register: a
deviation that gets quietly absorbed loses its reasoning trace,
and the trace is what lets a future reader reconstruct *why* the
project ended up where it did, not just *what* it ended up doing.

**ADR-0005 Rule 8: Sibling revisions over silent edits.** The
documentation register of ADR-0002 Rule 6, in the same shape that
ADR-0005 Rule 7 ("transitional documentation sunsets itself") is
the documentation register of ADR-0002 Rule 1 ("no automatic
retry"). The two cross-tenet pairings make the relationship
between the documentation discipline and fail-loudly a
load-bearing structural fact rather than a Related-section
observation — the documentation discipline is fail-loudly applied
to the documentation graph.

The amendments came out of two parallel discoveries: the
qEUBO-namespace-unification design memo (the `KnobDecl`
vectorization revision) and the DSL-hyperparameter-harness memo
both surfaced cases where the planning-time shape was
specifically wrong in places that mattered. The right response
was to revise *visibly* — preserve the original shape as the
planning record, name the revision as a sibling. Rather than
inventing the discipline ad-hoc per memo, the amendment names it
once and applies forward.

The author specifically named these amendments as "the
architectural discoveries I'm fond of." They deserve the
billing. The structural insight — that fail-loudly applies to
the documentation graph as a co-equal register, not as a
metaphor — recasts how to read the relationship between ADR-0002
and ADR-0005 going forward.

### Doc-graph staleness sweep (PRs #149, #150)

Shipped 2026-05-04. Filed as a planning note at
`docs/notes/design/doc-graph-discipline-plan.md`; first cleanup pass
shipped at #149 retiring stale claims across the umbrella +
frontend; second pass at #150 archived completed TODO sections
and trimmed the live tracker from 773 → 426 lines. The full
TODO archive lives at `docs/archive/TODO-completed-2026-05-06.md`.

The sweep is the operational instance of ADR-0005's discipline
applied retroactively to the existing graph. Rule 7
("transitional documentation sunsets itself") implies
periodically sweeping for the trigger conditions; this was that
sweep, scoped to the period since v1.0.0.

### Other notable work

- **Resource-ownership audit's privacy fixes.** O10 and O12
  (card-thumbnail cache and per-board card-tree state) were
  the two privacy-relevant pairs surfaced. Both keyed by raw
  CardIds that collide across users; a missing cleanup at
  `resetWorkspace` would have leaked prior-user card content
  on a shared-computer flow. Closed.
- **Engine-info probe** (PR #145) — three iterations of the
  KataGo engine-info status-bar surface (split VERSION/MODEL
  slots, full model name, separate tooltips). Materially
  improves the user's awareness of which network is loaded.
- **Heatmap update throttle** (PR #139) — bounded the redraw
  rate via a `requestAnimationFrame`-debounced ledger version
  bump. Per-redraw cost still high (ECharts heatmap renderer
  destroys-and-recreates every Rect on every `setOption`); the
  polymorphic-chart-renderer Future-projects entry is the
  long-term fix.
- **PV animation rewrite** (PRs #62, #63, #64) — landed early
  in the cycle. Live PV mode changes, collapsible Settings
  sections, registry-surfaced animation knobs.
- **Settings tab CSS tightening + accordion** (#64, #70).
- **Cluster-theme strict palette compliance** (#134) — drops
  all `color-mix()` references in favour of palette tokens the
  user can tune deterministically.
- **Board-variations overlay** (PR #144) — gray variation
  rings, transposition radius matching, dashed strokes,
  letter-only mode toggle. Better board readability.
- **`useResizablePanel` onUnmounted cleanup** (#123) — pre-audit
  one-off that became part of the audit pattern.
- **HMR dispose for analysisService singleton** (#116) — dev-time
  wedge fix: HMR was destroying the singleton without disposing
  the WebSocket, leaving orphan connections.
- **Branded-handle sweep** — `BoardState.analysisRange` as
  `[PlyIndex, PlyIndex]` (#71), `PlayerPanel.activeIndex` as
  `ColorMoveIndex` (#71), `useVariationPath` tightened to
  `ComputedRef<NodeId[]>` (#72). Closes the v1.0.0 retro's
  named small follow-ons.
- **Item 18 actual closure: gradingParameter ACL surfacing**
  (#96). Brings the opaque `gradingParameter` field through
  the ACL with the minimal narrowing needed to reach
  `.data.<key>` safely; the v1.0.0 retro had named this as a
  rough edge worth closing.

## The architectural discoveries

Three insights surfaced across the cycle that warrant naming
explicitly. Each is a generalisation that applies forward, not a
local lesson.

### Discoveries register: fail-loudly is a cross-cutting tenet

The ADR-0002 + ADR-0005 amendments named what was already
implicitly true: fail-loudly is not "throw exceptions instead of
returning sentinels." It's a discipline about preserving the
trace of why something is the way it is, applied across whatever
register the work is in. The trace the discipline preserves is
what lets a future reader (LLM or human) reconstruct the
reasoning, not just the outcome.

The two registers named are *runtime* (ADR-0002 Rules 1–5:
sentinel-instead-of-throw, silent retry, coerced defaults at
ACL boundaries, swallowed catches, undocumented sentinel
returns) and *documentation* (ADR-0005 Rules 1–8: silent
documentation drift, fabricated content snapshots, bare-named
references, in-place edits to in-flight design records). The
register-pairing — ADR-0002 Rule 1 ↔ ADR-0005 Rule 7,
ADR-0002 Rule 6 ↔ ADR-0005 Rule 8 — makes the cross-tenet
relationship part of the codebase's authoring vocabulary rather
than a Related-section observation.

This is the discovery the project author specifically named. It
deserves the billing.

### Workspace mutations own external resources

The resource-ownership audit's structural lesson generalises
beyond the specific 15 audit pairs: every workspace mutation
that removes or replaces an entity must release the resources
the entity owned, and the cleanup belongs at the mutation site
in the codebase that owns the relationship — *not* in a
framework GC pass. Vue cleans up watchers; nothing cleans up
proxy subscriptions, ledger entries, persistence rows, timers,
listeners, KataGoClient subscriptions, or per-entity
`Map`/`Set` entries unless wired explicitly.

The discipline now lives in `frontend/CLAUDE.md`'s §"Resource
ownership at mutation sites" with a four-step authoring
checklist (what external state, what the leak shape would be,
fix-document-or-defer, wire with the inline-comment convention).
`closeBoard` and `resetWorkspace` are the worked examples; the
frontend testing arc's Phase 4 PR pinned every audit pair as a
spy at the integration level. The convention is named, tested,
and integrated into onboarding.

### Literals as `as any`

The magic-literals audit's framing — a literal is `as any` for
the design vocabulary — applies recursively. ADR-0005 Rule 1
("single source of truth per nominal handle") is the discipline
expressed in documentation register; the magic-literals audit
applied it to design tokens; the resource-ownership audit
applied it to mutator-cleanup pairings. The same nominal-handle
discipline shows up wherever the codebase has a vocabulary that
might drift if not centralised.

The audit's substrate files (z-index ladder, duration tokens,
geometry ratios, the spacing/font-size/border-radius/letter-
spacing scales) are the design-vocabulary register's live
artifact. New consumers either reference a token or carry an
inline justification. Drift is no longer ambient.

## Bugs and unintended misimplementations

The user invited explicit visibility on bugs and
misimplementations surfaced during the cycle. Eight of them are
worth recording — five are bugs the testing arcs caught, three
are bugs the audits surfaced.

### Bugs the backend testing arc caught

Already named in the per-arc retro; preserved here as the
release-level record:

1. **`StatsRepository.fetch_tag_usage` cross-tenant leak.**
   Privacy bug. A tag Bob had used surfaced in Alice's view with
   Bob's count due to a wrong `COUNT` target on an otherwise
   correct `LEFT OUTER JOIN`. Phase-2 fix.
2. **`LineageRepository.fetch_selection` (SiblingSelection)
   broken SQL.** Unreachable in production but would have failed
   the first time the frontend tried.
3. **`LineageRepository.fetch_selection` (AncestorSelection)
   off-by-one.** Recursive step projected grandparent instead
   of parent. Closed defect D-9 as a side effect.
4. **`api/routes/resources.py` 404 misrouting.** Missing
   resource would have surfaced as 500 because no exception
   handler was registered in `main.py`.

### Bugs the resource-ownership audit surfaced

5. **closeBoard ponder leak (the audit trigger).** Closing a
   board tab spliced it from `store.boards` without issuing a
   `terminate`; the canonical kept running on the LEAF for a
   board that no longer existed. Silent compute leak. Closed
   as the audit's first PR (O1).
6. **resetWorkspace per-board analysis bookkeeping leak.**
   Identity flip dropped boards but left the analysis service's
   per-board Maps populated with prior-identity BoardIds. Audit
   pair O7. Closed.
7. **Card-thumbnail cache cross-identity leakage (privacy).**
   The `useCardThumbnail` cache was keyed by raw CardIds, which
   collide across users; resetWorkspace did not clear it, so a
   prior user's card thumbnails could surface under the new
   identity on a shared-computer flow. Audit pair O10. Closed.
8. **Per-board card-tree state cross-identity leakage
   (privacy).** Same shape as O10 for the `boardCardTrees` map's
   hydrated-cards entries. Audit pair O12. Closed.

### Other notable misimplementations

- **Empty-board ponder via analysis_config leakage** (proxy
  v1.0.1). The `analysis_enricher` Transformer leaked a
  proxy-only field through to KataGo for queries shorter than
  two moves. Lifted the proxy freeze to fix.
- **`query_models` action dropped on the wire to KataGo**
  (proxy v1.0.13). The query parser's `action_map.get(action_str,
  KataGoAction.ANALYZE)` coerced the unknown new action to
  `ANALYZE`; the dispatch site then dropped the action on the
  wire. Hung the engine-info probe. Fixed by raising on unknown
  action and gating dispatch on closed-set membership.
- **Synthetic `isDuringSearch` / `turnNumber` on metadata
  responses** (proxy v1.0.13). Same silent-coercion shape on
  the response parser. Fixed by splitting `KataGoResponse` into
  a discriminated union.
- **PV stone radius `* 0.88` multiplier** (PR #69). Magic
  literal with no justification; surfaced through the
  pre-audit code-review pass. Removed.
- **Heatmap thumbnail hint indexed `variationPath` with a
  colour-local move number instead of an absolute ply** (PR #61).
  The `ColorMoveIndex` / `PlyIndex` brand pair was authored to
  prevent this exact bug class from recurring. Fixed alongside
  the brand pair introduction.
- **Context-id input rejecting non-digit chars** (PR #157).
  Macro-typing input was over-aggressive on input validation.
  Fixed.
- **HMR dispose for analysisService singleton** (#116). Dev-time
  wedge: HMR was destroying the singleton without disposing the
  WebSocket. Fixed.

The honest frontend-testing-arc-surfaced-zero-bugs reading
applies in light of this list: the backend's testing arc surfaced
its bugs because the SQL adapter layer is a category the
typecheck genuinely cannot police. The frontend's typecheck
discipline + ACL + branded handles caught the bug classes the
backend's pre-arc test suite would have surfaced. The audits
are what surfaced the silent-failure-shaped bugs — the leaks
that don't manifest as wrong output but as resource accumulation
or cross-identity content surfacing.

## What's queued for v1.2.0+

The post-v1.1.0 punch-list. `docs/TODO.md` is the canonical
source; `docs/handoff-current.md`'s "Where the project is going"
section is the long-horizon view.

- **Distribution packaging.** Leading edge of the post-v1
  arc; decision section in `docs/notes/distribution-packaging.md`
  still open. The author's named priority.
- **Tree-DSL hyperparameter harness.** Frontend-only construct
  for parameterising deck pipelines without hand-editing the
  declaration. Design memo at
  `docs/archive/notes/dsl-hyperparameter-harness-plan.md`. The
  author's named "creme on top" target for the next cycle.
- **qEUBO end-to-end validation.** Runtime ships behind
  `QEUBO_ENABLED=False`; UI smoke + Redis run pending. Once
  validated, transition `docs/archive/notes/qEUBO.md` to
  `design-note: implemented`.
- **CI integration.** Both testing arcs explicitly named this
  as the natural follow-up. Build pipelines (`npm run build`,
  `pytest`) don't gate on the test suites yet. A community
  contributor wiring this would close the largest remaining
  gap in the testing maturity story.
- **Backend CTE consolidation** (items 30c + 30d). Backend-
  internal architectural debt; not user-visible. Do 30d first.
- **Silent-coercion-at-protocol-boundaries audit (frontend +
  backend leg).** The proxy v1.0.13 worked examples are the
  reference shape; sibling parsers in the umbrella
  sub-projects remain to be audited.
- **Native-speaker review** of the zh-CN / ja / ko i18n stub
  catalogs.

Long-horizon (not v1.2.0-blocking): public deployment
infrastructure (account recovery, rate limiting, health
endpoints), domain extension (chess, shogi), multi-tab ETag
flow, zeroconf service discovery, tag-DSL virtual-tag macro
language, polymorphic chart renderer, file-size retrofit
candidates (PaletteEditor.vue, CardTreeWidget.vue).

## Honest about the LLM perspective

Same caveats as the v1.0.0 retro:

**Confidence is not certainty.** This document reads with a
calibrated voice; the calibration is to the patterns the
git-log walk and the doc-graph reading surfaced. It is not
calibrated to patterns those walks didn't surface, of which
there are presumably some. Future contributors who find an
observation here that's specifically wrong should correct it
inline with a dated note, in the same lifecycle the codebase's
documentation discipline (now ADR-0005 Rule 8 specifically) is
built for.

**The audit was thorough but not exhaustive.** I read the 289
commit subjects in full, the ADR amendments, the testing-arc
retros, the resource-ownership and magic-literals audit
inventories, the cards-tab and forest-redesign design notes,
the analysis-persistence system note, and the dispatch chain
that anchored the cross-team work. I did not read every
worklog entry or every modified file. Observations about the
arcs' detail are extrapolations from the design notes, the
retros, and the commit messages; they are likely directionally
correct and may be specifically wrong in places.

**On the project author.** Unlike the v1.0.0 retro, no
candor section about the author appears here. The v1.0.0
framing ("the author wants to play Go") was specific to that
release's punctuation — a stepping-back moment, an inheritance
invitation. v1.1.0 is a continuation: the author kept
building, the LLM-collaborator workflow kept producing,
discipline-arc work threaded in, the cycle delivered. The
candor section would re-tell what the v1.0.0 retro already
said; the right move is to leave it there and let v1.1.0
speak through what shipped.

## Closing

Eight days. 289 commits. Two ADR amendments. Two testing arcs.
One cross-team feature. One UX restructure. Six audit /
discipline arcs. Six proxy bumps. Internationalisation for
non-English users. Eight bugs surfaced and fixed at root.

The architectural discoveries — fail-loudly across registers,
workspace mutations own external resources, literals as `as
any` — are the cycle's lasting value. The bugs are the receipts.
The arcs are the work that compounded.

The next cycle's punch-list is named. Distribution packaging is
the user-facing leading edge; the tree-DSL hyperparameter
harness is the convenience-creme. qEUBO validation closes the
v1.0.0 partial-commitment. CI integration closes the testing
arc's last open thread.

v1.1.0 ships. The patterns held.

License: Public Domain (The Unlicense)
