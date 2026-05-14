# TODO

This list captures the integration and architectural items
identified during the joint review of the umbrella's `frontend/`
(the Vue SPA, formerly `gogui`) and `backend/` (the FastAPI
service, formerly `fastapi_service`), to be addressed before
public release.

This document is the consolidated successor to the two pre-umbrella
TODOs (`frontend/TODO.md` and `backend/TODO.md`, archived under
`docs/old-todos/` until this merger superseded them).

**Ordering principle:** items are sorted by *implementation
complexity*, not by priority or impact. The intent is that an
implementer can sweep top-down and accumulate small wins before
tackling structural work.

**Scope tags:**
- `[backend]` — touches only the FastAPI codebase
- `[frontend]` — touches only the Vue SPA codebase
- `[both]` — requires coordinated changes on both sides

**Cross-team status:** as of the close of v1.1.0 (2026-05-08),
no outstanding action items between teams. The
`cross/analysis-persistence` arc (the cycle's headline cross-team
feature) is shipped end-to-end; v1.0.0's locked release scope
(seven items in `docs/archive/release-scope-2026-04.md`) had
already shipped end-to-end at the v1.0.0 boundary including the
cross-team card-tree arc and the joint tenancy-documentation
sweep. Closure documents:
`docs/notes/release-retrospective-2026-05.md` (v1.1.0) and
`docs/archive/notes/release-retrospective-2026-04.md` (v1.0.0).

## Completed work — archived

Items shipped through 2026-05-06 (Backend / Frontend / Joint
synopsis tables, the in-place `Tenancy model — recorded for
context` block, the `Documentation (architectural records)`
reference index, and the de-branding preservation note that
scoped the now-archived Trivial / Small / Medium entries) live
at `docs/archive/TODO-completed-2026-05-06.md`. The live tracker
keeps only Active items, Future projects, and the
Implementation-order recommendation.

For the references the archived `Documentation` table indexed,
follow the source: `docs/adr/` (the seven ADRs themselves),
`docs/adr-synopsis.md` (condensed cross-tenet synopsis), and the
design notes under `docs/notes/`. For the tenancy model, the
canonical live reference is `docs/notes/tenancy.md`.

---

## Active

### Medium — touches contracts or requires coordinated changes

#### Internationalization (i18n) — string sweep `[frontend]`

PR1 (plumbing + sweep) shipped 2026-05-06: vue-i18n wired in,
schema 23 → 24 adds `appearance.locale` with browser-detected
backfill, four locale catalogs in the active roster (en source,
zh-CN/ja/ko stubs), toolbar `LocalePicker` for switching,
contributor doc at `frontend/docs/i18n.md`.

The full string sweep — moving the order-of-magnitude 150-300
hardcoded user-facing strings through catalog keys — landed inside
the same arc:

- `title=` / `placeholder=` / `aria-label=` attributes on chrome
  buttons, indicators, controls.
- `pushSystemMessage(...)` toasts. Per the (a) backend-error
  pass-through approach, the wrapper is translated; the
  interpolated `${err.message}` from the backend stays in English
  until a structured-error-code arc lands.
- Native `alert / confirm / prompt` calls (the qEUBO pin-name
  prompt and similar handful of sites).
- Inline template text: button labels, tab names, modal headers,
  empty states, settings labels.

Per-locale-tier completion: `en` is the source and ships fully
populated. `zh-CN / ja / ko` shipped LLM-drafted catalogs with a
machine-translation notice on each (PR #164, 2026-05-06); the
fallback chain (`fallbackLocale: 'en'`) still renders English on
keys absent from the LLM draft, with vue-i18n's `missingWarn`
firing in dev for every miss. Native-speaker review is the
remaining gating arc per locale before the catalog is marked
Active in the table at `frontend/docs/i18n.md`.

Out-of-scope explicitly: DSL symbol names, wire-shape field names,
KataGo's output, file-format vocabulary, console / debug log lines,
and built-in palette IDs. The full inventory and rationale is
recorded in `docs/archive/notes/i18n-plan.md`'s "What does NOT get
translated" section, mirrored into `frontend/docs/i18n.md` for
contributor reference.

Trigger: sweep PRs ship as bandwidth allows; no external blocker.
A future structured-backend-error-codes arc is its own dispatch
when wrapped-error sites accumulate enough to justify the
backend-side work.

#### Chess clone `[both]`

Per ADR-0003's domain-portability discipline on the frontend
and the "Adopting for another domain" checklist in
`backend/README.md`. Items 34 / 34a / 34b debranded the backend
wire and schema (`raw_content`, `canonical_content`,
`content_hash`, `PositionNormalizerPort`) so this becomes a
single-Port-implementation arc on the backend side.

- **Backend.** Implement `PositionNormalizerPort` for PGN, plus
  light DI wiring. Ebisu scheduling, tenancy spine, migration
  tooling, qEUBO integration — all domain-agnostic, all work
  as-is.
- **Frontend.** Replace the ~30-40% Band 3 surface (SGF
  parsing, board renderer, KataGo wire vocabulary in
  `src/engine/katago/types.ts`). Components / Composables /
  Services / Store / ACL layering doesn't move.
- **Engine bridge.** Proxy speaks KataGo; chess needs a
  Stockfish or Leela bridge through the same Sessions / Hub /
  Router architecture. The Prism abstraction is intended to
  support multiple protocols but only KataGo is implemented
  today.
- **Palette stdlib.** Substitute Go vocabulary (`visit_ratio`,
  `decisiveness`, `quality_delta`) for chess equivalents
  (centipawn loss, top-engine-move agreement, blunder
  thresholds). Palette infrastructure absorbs it without
  structural change.

Trigger: a chess-playing contributor with a proof-of-concept
comparable to what the Go version had, plus willingness to do
the engine bridge.

#### Silent-coercion-at-protocol-boundaries audit `[both]` (and proxy via dispatch)

A recurring class of bug: a closed-set wire vocabulary (an enum,
a discriminated-union tag, an `action` field) is parsed with an
*open-set* fallback that silently coerces unknown values to a
default member, then later code paths gate on that default and
strip or rewrite fields. The result is a malformed message that
hangs or fails downstream, with no log line at the parser to
point at the actual cause. This is exactly the silent coercion
ADR-0002 forbids, and it has bitten more than once.

**Two worked examples shipped in the v1.0.13 release window**
both surface this pattern from different angles:

*Query-side, proxy PR #16* — The proxy's
`katago/katago_proxy.py::parse_query_from_wire` (then at
`AbstractProxy/katago_proxy.py`) had the shape
`action_map.get(action_str, KataGoAction.ANALYZE)`. When the
frontend's engine-status-bar work added `query_models` alongside
the long-standing `query_version` probe, the unknown action
coerced to `ANALYZE`; `translate_query_to_wire`'s
`if action != ANALYZE: wire["action"] = ...` then dropped the
action on the wire to KataGo, which received `{"id": "..."}` and
hung the probe. The fix raises on unknown action and the dispatch
prism gates on closed-set membership so the receive loop's
structured ERROR log is the loud surface (audit-H-3-safe).

*Response-side, proxy PR #17* — The same pattern on the
response parser: `wire.get("isDuringSearch", False)` and
`wire.get("turnNumber", 0)` fabricated default values for the
metadata response variant (KataGo's `query_version`,
`query_models`, terminate-ack responses do not carry those
fields), then `translate_response_to_wire` emitted them
unconditionally on the way out. The frontend's status-bar
tooltip displayed the synthetic fields verbatim, surfacing the
bug end-to-end. The fix splits `KataGoResponse` into a
discriminated union (`AnalyzeResponse | MetadataResponse`)
discriminated structurally on the presence of those keys; the
parser raises on half-present fields per ADR-0002. See
`proxy/docs/roadmap-response-variants.md` for the design
rationale.

**The pattern, named.** Closed-set vocabulary parsed with an
open-set default is the silent-coercion shape. The cure has four
parts:

1. **Enum or `Literal` as the canonical witness** of the allowed
   values — not a string, not a free-form discriminator. Type
   checkers can then exhaustively check switch / match
   statements over the closed set.
2. **One source of truth for the wire-string ↔ enum map.** Lift
   it to a module-level constant; share it with the parser and
   every dispatch site. Adding a new member must require updating
   both halves, and a completeness test should fail if only one
   half is updated.
3. **Distinguish "missing key" from "unknown value."** A missing
   discriminator key may legitimately default (vanilla-protocol
   compatibility, a default branch in a tagged union); an
   *unknown value* of a present key is a protocol violation and
   must raise per ADR-0002.
4. **Two-tier loudness on parse.** Pure parsers raise on
   protocol violation (ADR-0002 in the small). Dispatch / receive
   loops that must survive a buggy peer gate-not-raise: the
   parser's raise propagates only when callers do not pre-check
   membership, and the dispatch site emits a structured ERROR
   log with the actual offending value named (the
   `proxy_server._handle_incoming` malformed-message branch is
   the canonical worked example).

**Audit pass — sites to inspect.** Three categories across the
three sub-projects:

- **Parser entry points** — every place that turns external
  input (HTTP body, WebSocket frame, DB row, JSON file) into a
  typed domain object. Look for `.get("action", ...)`,
  `.get("type", ...)`, `.get("kind", ...)`, etc. with a
  *non-None, non-sentinel* default. A real default is the smell.
- **Dispatch sites** — every `match` or `if/elif` chain over a
  discriminator. The default branch should either name the
  closed set (and raise) or be a no-match-with-loud-log
  (dispatcher-style). A silent fallback to "treat it like X"
  is the bug.
- **Wire-vocabulary maps** — every dict literal of the shape
  `{"a": MemberA, "b": MemberB, ...}` parameterising a
  `.get(s, default)`. Lift to module-level, add a completeness
  test, replace `.get(s, default)` with explicit membership
  check + raise.

**Concrete starting greps.** Run from the umbrella root:

- `grep -rn '\.get(\(["'"'"'][^"'"'"']*["'"'"'],[^,]*[A-Z]' frontend/src backend/`
  — `.get(...)` calls whose default is an enum-shaped (capitalised)
  value. Most hits will be benign (genuine optionality), but the
  parser-shaped ones stand out.
- `grep -rn 'action_map\|type_map\|kind_map\|TYPE_MAP\|ACTION_MAP'`
  — explicit wire-vocabulary maps. Each one is an audit candidate.
- For the proxy specifically, `proxy/katago/katago_proxy.py`'s
  `parse_query_from_wire` and `parse_response_from_wire` are the
  canonical reference shape (post-v1.0.13); other parsers in the
  proxy should be checked for the same pattern.

**Scope and coordination.** The audit covers frontend (e.g.,
DTO parsing in `src/services/`, KataGo wire types in
`src/engine/katago/types.ts`) and backend (e.g., pipeline-DSL
discriminator parsing, request DTOs). The proxy side has had
its two acute instances addressed in v1.0.13 (the worked
examples above); a sibling-parser sweep remains as
proxy-internal follow-up — open as a dispatch
(`docs/dispatch/`) per `proxy/CLAUDE.md`'s submodule-arc
discipline if/when the audit picks it up. The umbrella's
frontend + backend sweeps can ship as a single coordinated
`[both]` PR or as two sequential ones, contributor's choice.

**Trigger:** picked up the next time a parser-or-dispatcher
change is on the table, or proactively as a focused audit
session. Not blocking on a release.

#### Save → disconnect clears the analysis graph; companion "always persist" registry option `[frontend]`

When the user clicks "Save analyses" on a board and then
disconnects from the engine, the in-memory analysis graph
(the per-board ledger projection driving the chart cluster)
clears. The current rationale is staleness avoidance — once
the engine is gone the analysis is no longer live, and the
charts shouldn't keep rendering against a stale snapshot as
if it were. UX-unexpected nonetheless: users who just saved
their work expect to be able to keep reading the charts they
just saved without reconnecting.

Two-part fix:

1. **Default stays as-is.** The clear-on-disconnect behaviour
   is the safe default; the rationale is sound.
2. **New registry option** under
   `profile.settings.engine.katago.alwaysPersistGraphs:
   boolean` (default `false`). When `true`, the analysis
   ledger survives disconnect; reconnection reads the same
   bundle the save persisted. UI surface includes an
   `[experimental]` tag and a strong-language warning naming
   the resource cost — approximately **1 MB per
   game-worth-of-analysis**, which builds up across many
   sessions and is acutely problematic on mobile or when the
   backend is over a metered network. The warning matches the
   discipline of the `analysisStorageEnabled` toggle's existing
   `[experimental]` framing.

Trigger: user-prioritised. Companion to the inline-edit arc
in that the registry-editor visibility for the toggle is
where the warning lands.

### Large — structural changes that introduce new abstractions

#### ~~Unified user-controllable-scalar surface~~ `[frontend]` *(shipped 2026-05-14)*

Shipped via PR #223 (`KodBena/feat/knob-registry`, 14 commits).
The knob-registry substrate (types + path-walk accessors +
named-transform library + ownership state machine), the
cross-domain editor surface (`KnobRegistryEditor` mounted in the
Other tab), the qEUBO consumer migration, and the first batch
of the Phase-6 magic-literals promotion sweep all landed
together. Plan-note status transitions to
`design-note: implemented` in the same closure pass.

Worklog: `docs/worklog/2026-05-14-knob-registry.md`. Plan note:
`docs/notes/knob-registry-plan.md`. Postmortem (category error
on `KnobDomain`):
`docs/notes/postmortem-knob-registry-qeubo-domain-2026-05.md`.

Phase 4 (vector widget dispatch) was closed unilaterally on
author judgment — substrate's vector capability is preserved by
the type system regardless, and re-opening stays available if a
concrete vector-knob need surfaces. Phase 6 (magic-literals
sweep) is open-ended; further preference-flavoured candidates
can land in their own commits as they surface during normal
work — not blocking on a follow-up arc.

Explicit follow-ups deferred from this arc, not blocking future
work but worth naming:

- ~~**Toolbar-hover quick-access surface**~~ *(shipped via PR #225
  2026-05-14; band-mismatch corrective in flight on
  `KodBena/fix/knob-toolbar-popover-engine-gating`)*. The popover
  (`ToolbarSliderPopover.vue`) and the `KnobDecl.priority` field
  that orders it landed together; the popover mounted inside the
  toolbar's engine-connection v-if so band-1 substrate
  preferences silently inherited an engine gate. Postmortem:
  `docs/notes/postmortem-knob-toolbar-popover-2026-05.md`;
  corrective worklog:
  `docs/worklog/2026-05-14-toolbar-popover-band-mismatch.md`.
- **Bookmark schema reshape** (qEUBO bookmarks:
  `Record<string, number>` → `Record<KnobId, number[]>`).
- **Wire-key derivation from KnobDecl ids** for qEUBO's
  `controlled_parameters` payload. Backend coordination via
  dispatch if pursued.
- **`docs/pre-merge-checklist.md` as an actual file.** Surfaced
  by the toolbar-popover postmortem §7.3 — per that document's
  head-of-document amendment, the right framing is a *template
  trusted rotation consults when filing retroactive correctives*,
  not a gate that blocks merges regardless of implementer
  capability. The pre-merge-blocking framing was the wrong
  enforcement point; predictably-shaped retroactive correctives
  are the right one. One focused PR closes it.
- ~~**Closest-match failure-mode tenet articulation.**~~
  *(shipped 2026-05-15 as ADR-0002 Rule 7, "Closest-match
  selection surfaces too." Filed with an explicit provisional-
  home flag, since the rule's deeper principle — refusing fuzzy
  matching when sharper classification is available — is broader
  than fail-loudly proper.)*
- **Classification-discipline principle as its own tenet;
  Rule 7 relocation when ready.** Surfaced by the 2026-05-15
  filing of ADR-0002 Rule 7's provisional-home paragraph: the
  rule's deeper subject — *failing to correctly obey and adhere
  to classification on a general level; closest-match / category
  error / misclassification are instances of allowing fuzzy
  matching where sharper discipline is possible and warranted* —
  is broader than fail-loudly proper, and ADR-0002's reactive
  register is not its natural home. A future arc that articulates
  the classification-discipline principle in its own right (a
  standalone ADR, or a refactoring of the tenet space such that
  orthogonal disciplines have their own homes) is the natural
  relocation point for Rule 7. Not urgent; the provisional-home
  flag preserves the seam. The right trigger is "a fourth
  closest-match instance surfaces and it's clearly not a
  fail-loudly variant" OR "the project author has appetite for
  the tenet-space refactor on its own merits."

#### 30c. `[backend]` Single CTE per pipeline run

`domain/pipeline.py::PipelineExecutor.run` loops over
`context_ids` and issues one CTE round trip per id, then unions
the results in Python with first-seen-wins on collision. For `M`
context ids this is `M` round trips and `M` separate query
plans. Replace with a single CTE keyed off
`WHERE card_source.card_id IN (:context_ids)` (or the recursive
equivalent). The first-seen-wins collision semantics move into
`MIN(depth) GROUP BY card_id` in SQL or stay in Python on a
single `fetchall()`.

Observable behavior is identical for users; latency drops
linearly with the number of contexts. This is a contract-shaped
change to the internal CTE-builder API but no externally-visible
change.

Pairs naturally with item 30d — once the lineage CTE is
consolidated, 30c becomes a one-liner. Either order works;
doing 30d first is easier to review.

#### 30d. `[backend]` Consolidate the four recursive-CTE implementations

The same recursive lineage CTE pattern is implemented in at
least four places:

- `domain/tree_engine.py::fetch_lineage`
- `domain/tree_engine.py::build_selection_cte` (the
  `DescendantSelection` and `SubtreeSelection` branches)
- `domain/tree_queries.py::get_lineage_cte`
- `domain/tree_dsl.py::SubtreeSelection.to_cte`

Each one has its own subtle variation (column naming for the
depth literal, base-case predicate, max-depth handling). Extract
a single
`_build_lineage_cte(root_predicate, max_depth: Optional[int]) -> CTE`
helper and have all four call sites delegate to it. Keep the
four public surfaces intact — they're each used by something —
but the recursive machinery lives in exactly one place.
Bug-fixes to one variant currently never propagate to the
others; this item closes that hole.

---

## Future projects (parked with design notes)

### Item 27 full (ETag-based multi-tab)

Deferred per the item-17 reasoning: multi-tab use isn't a known
workflow, and the minimal documentation of last-write-wins (item
27-min, shipped) captures the invariant. If multi-tab usage
becomes real, the design sketch is in the comment on
`SyncService::sendSync()`.

### Item 32 (zeroconf / mDNS service discovery)

Deferred. Originally specified zeroconf service advertisement on
the backend (`_ebisu._tcp.local.` or similar) and discovery on
the frontend, replacing the fixed-URL config of item 22.
Constraints recorded in earlier discussion: no mandatory
dependencies for Linux users (no Avahi requirement), Windows out
of the box, Firefox without extensions. Large not because the
implementation is hard but because the testing matrix is wide
(three OSes × multiple browsers × with-and-without network
configurations), and the failure modes need graceful fallback to
the configured URL from item 22.

Status note: the frontend's pre-merger Completed table reused
item number 32 for the "Tree-DSL test rewrite" work, which
shipped under 32a/32a.2 in the Backend Completed table now
archived at `docs/archive/TODO-completed-2026-05-06.md`. The
zeroconf work — substantively unrelated — is preserved here
under its original number rather than silently retired.

### ~~Tag-DSL virtual-tag macro language~~ `[backend]` *(shipped 2026-05-12)*

Shipped 2026-05-12 across PRs #197 (arc 1, file split), #198
(arc 2, macro language + three caps), and #199 (user-facing
reference + REPL). The design note transitioned to
`design-note: implemented` and lives at
`docs/archive/notes/tag-dsl-macro-language-plan.md`; the
implementation outcome lives at
`docs/worklog/2026-05-12-tag-dsl-macro-language.md`. The
long-carrying `tag_dsl.py`-is-an-adapter rough-edge in
`reflection.md` was closed by arc 1 in the same commit window.

### Automatic mistake discovery `[frontend]`

Surface "mistake" candidates from a played-out game
automatically, so the user can review them without manually
scanning move-by-move. A "mistake" is engine-defined: a move
where the user's choice produces a worse position (by
palette-derived signal) than the engine's top recommendation
by some threshold. The candidates become a queue the user
can flip through.

Open design questions:

- **Mistake definition.** Delta-from-best (winrate /
  scoreLead delta beyond threshold)? Cluster-based
  (top-cluster vs played-cluster)? Palette-signal-based
  (use the user's active palette as the "what counts as bad"
  function)? Each is a different signal; the palette-driven
  shape composes best with the existing analysis-environment
  vocabulary.
- **Threshold scalar(s).** Per-card, per-deck, or
  registry-controlled? User-touchable scalar(s) overlap with
  the "Unified user-controllable-scalar surface" item above —
  whatever threshold(s) ship become `KnobDecl` candidates.
- **Affordance.** Live during analysis ("you just played a
  mistake; want to study it?"), batch ("show me my recent
  mistakes" view), or both?
- **Heredity tracking.** Should auto-discovered mistakes
  spawn child cards (linking them to the parent position
  the user faced)? Or just become standalone study targets?
  The heredity option composes with the pedagogy's
  "heredity-offload" vantage point (see
  `docs/handoff-current.md`'s pedagogy section); the
  standalone option keeps the discovery channel separate
  from the active card tree.

Useful overlap: the existing per-player delta charts
(`MergedDeltaPanel`) literally render "where each player's
deltas were largest" — auto-mistake-discovery could pluck
those peaks for its candidate queue without a separate
detection pass.

Trigger: user-prioritised. Needs the design decisions above
settled before implementation.

### Inline `analysis_config` editing in the card-metadata panel `[frontend]`

Deferred during the card-metadata inline-edit arc 2 build
(2026-05-13). The arc-2 panel surfaces every other writable
field on a card (tags, numMoves, suspended, gamma,
defaultVisits, reset_prior) but treats `analysis_config` as
read-only with a tooltip stating the deferral, pending design
thought on the design space and downstream consequences. The
backend's contract over `grading_parameter.data` is
intentionally open: backend reads only `gamma`, everything
else (including `analysis_config`) is opaque pass-through, so
the frontend owns the shape entirely. Today users edit
`analysis_config` through the registry editor's full-shape
JSON UI; the question is whether an inline-panel surface
would expose enough common-case affordances to warrant the
investment without compounding the "transparent depth" /
"every abstraction is editable" promise the registry editor
already keeps.

Trigger: user thought-time on the design space.

### Polymorphic chart renderer abstraction `[frontend]`

The frontend's chart surface is uniformly ECharts (`HeatmapChart`,
`BaseChart`, `useEChartsForestRender`, the TS chart adapters via
`themeColor()`). ECharts has known limits — most acutely, its
heatmap renderer destroys-and-recreates every `Rect` on every
`setOption`, with no cell-level diff and no working `appendData`
for grid heatmaps (confirmed against the v6 source and the
upstream issue tracker). The 2026-05-06 throttle PR
(`docs/archive/worklog/2026-05-v1.0-to-v1.1/2026-05-06-heatmap-update-throttle.md`) bounds
the redraw rate but doesn't change the per-redraw cost.

The idea here is to introduce a renderer-shaped seam — a
`ChartRenderer` Port-equivalent in ADR-0003 terms — so the chart
surface can host alternative backends without rewriting every
consumer. Candidates worth trying for the heatmap specifically:
custom canvas (fully controlled diff), D3 + canvas, Plotly.js,
SciChart.js (commercial). For the line charts, ECharts may stay;
the abstraction's value is letting each surface pick its
renderer independently.

Open questions before implementation:

- **Where the seam lives.** A per-component `renderer` prop, a
  factory pattern at module scope, or a chart-type registry. The
  registry shape composes best with ADR-0003's bands — heatmaps
  and line charts have genuinely different performance profiles
  and different rendering primitives.
- **What the Port surface is.** Init / dispose / setData /
  setRange / on(event). The minimum viable contract that lets
  `HeatmapChart` and `BaseChart` both work without leaking
  ECharts-specific concepts.
- **Theme-substrate coupling.** Current adapters thread
  `themeColor()` through ECharts' option object. Each renderer
  needs its own theme-binding shape; the substrate stays the
  source of truth.
- **Bundle weight.** Adding a second renderer doubles the chart
  surface area in the bundle. May want code-splitting / dynamic
  imports keyed on the active renderer.

Trigger: user prioritization. Not blocking any current arc; the
heatmap throttle bought enough headroom to defer indefinitely.

---

## Implementation order recommendation

v1.1.0 shipped 2026-05-08 (see
`docs/notes/release-retrospective-2026-05.md`); v1.0.0 shipped
2026-04-30 (see `docs/archive/notes/release-retrospective-2026-04.md`).
The v1.0.0 locked scope and the post-v1.0.0 frontend backlog
through 2026-05-06 are archived (see
`docs/archive/TODO-completed-2026-05-06.md` for the synopsis
tables). The v1.1.0 cycle's eleven arcs (testing, analysis
persistence, cards-tab merge, forest-directory hierarchy
redesign, i18n, audits, ADR amendments, proxy bumps) all
landed; the v1.1.0 retrospective is the consolidated record.
Current shape of remaining work:

**Frontend.** No frontend architectural arc is queued in Active.
Remaining frontend tracks are coordinated cross-team work (the
silent-coercion-at-protocol-boundaries audit's frontend leg, in
the Medium tier above), longer-horizon items in Future projects
below, and whatever surfaces from `docs/notes/deferred-items.md`
or `docs/notes/frontend-backlog.md` when the user prioritises.

**Backend architectural.** Items 30c + 30d (CTE consolidation) —
do 30d first.

**Distribution and post-v1 product work.**

- Distribution-packaging decision per
  `docs/notes/distribution-packaging.md` — the leading edge of
  the post-v1 arc.
- Frontend test coverage closed 2026-05-08 in a five-phase arc
  (PRs #178-#182 + Phase 5 docs). The frontend ships 100 tests
  across three tiers (`tests/unit/` pure logic, `tests/fakes/`
  service substitutes, `tests/integration/` composable + store
  integration); zero production bugs surfaced (the
  branded-types + ADR-0002 + OpenAPI-codegen discipline already
  catches the typecheck-passable bug class). Closing
  reflection: `docs/notes/frontend-test-coverage-2026-05.md`.
  Backend side closed in the 2026-05-07 testing arc (442 tests
  across four tiers, four production bugs fixed); see
  `docs/notes/test-coverage-2026-05.md` for the closing
  reflection. Open follow-ups: component-level / template
  tests, E2E, visual regression, CI integration (gating
  `npm run build` on the suite), and breadth across the
  remaining composables (`useAuth`, `useCardTreeData`,
  `useDirtyBoardGuard`, `useMinting`, `useSgfLoader`, the
  forest navigation set, plus the engine kernels in
  `src/engine/analysis/`).

**Future projects (when ready).**

- qEUBO end-to-end validation + transition of
  `docs/archive/notes/qEUBO.md` to `design-note: implemented`.
- Item 27 full, if multi-tab becomes a real workflow.
- Item 32, if deployment flexibility motivates zeroconf.
