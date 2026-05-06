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

**Cross-team status:** as of the close of v1.0.0 (2026-04-30),
no outstanding action items between teams. The locked release
scope (the seven items in
`docs/archive/release-scope-2026-04.md`) is shipped end-to-end,
including the cross-team card-tree arc (item 3) and the joint
tenancy-documentation sweep (item 26). The closure document is
`docs/notes/release-retrospective-2026-04.md`.

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

PR1 (plumbing) shipped 2026-05-06: vue-i18n wired in, schema 23 → 24
adds `appearance.locale` with browser-detected backfill, five locale
catalogs scaffolded (en source, sv pilot, zh-CN/ja/ko stubs),
contributor doc at `frontend/docs/i18n.md`. The proof-of-life line
in the Settings tab confirms the catalog round-trip end-to-end.

Remaining work — the order-of-magnitude 150-300 hardcoded user-facing
strings move through catalog keys, locale-by-feature for reviewability:

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
populated as the sweep progresses. `sv` is the project author's
verification pilot — populated alongside `en` in each PR. `zh-CN /
ja / ko` catalogs accumulate placeholder-mirrored entries during
the sweep; native-speaker review is a separate gating arc per
locale before the catalog is marked Active in the table at
`frontend/docs/i18n.md`.

Out-of-scope explicitly: DSL symbol names, wire-shape field names,
KataGo's output, file-format vocabulary, console / debug log lines,
and built-in palette IDs. The full inventory and rationale is
recorded in `docs/notes/i18n-plan.md`'s "What does NOT get
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

### Large — structural changes that introduce new abstractions

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

### Analysis persistence

Server-side storage of KataGo analyses so repeated sessions don't
re-pay the compute cost. Design captured in
`docs/notes/analysis-persistence-plan.md`:

- Separate service (`AnalysisPersistenceService`), separate
  endpoint (`POST /analysis-records`). Not a fourth channel on
  `SyncService`.
- Per-node granularity keyed by `(configHash, nodeId)` matching
  the ledger.
- User opt-in, off by default; fine-grained toggles for heavy
  channels (policy, ownership).
- Fail-loud per ADR-0002 — no silent retry.
- **Blocker:** validate the `isDuringSearch` gating rule against
  KataGo's actual behavior on terminated ponders. 15-minute
  DevTools session, not a coding task. Documented in the
  planning note with the corrected polarity (the failure mode is
  terminate-acks masquerading as final packets, not
  legitimate-but-truncated anytime-optimization estimates).

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

### Polymorphic chart renderer abstraction `[frontend]`

The frontend's chart surface is uniformly ECharts (`HeatmapChart`,
`BaseChart`, `useEChartsForestRender`, the TS chart adapters via
`themeColor()`). ECharts has known limits — most acutely, its
heatmap renderer destroys-and-recreates every `Rect` on every
`setOption`, with no cell-level diff and no working `appendData`
for grid heatmaps (confirmed against the v6 source and the
upstream issue tracker). The 2026-05-06 throttle PR
(`docs/worklog/2026-05-06-heatmap-update-throttle.md`) bounds
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

v1.0.0 shipped on 2026-04-30 (see
`docs/notes/release-retrospective-2026-04.md`); the v1 locked
scope and the post-v1 frontend backlog through 2026-05-06 are
all closed (see `docs/archive/TODO-completed-2026-05-06.md` for
the synopsis tables). Current shape of remaining work:

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
- Test coverage at the composable layer (frontend) and against
  Port shapes (backend) — the largest debt the project carries
  per the v1 retrospective.

**Future projects (when ready).**

- Analysis persistence (start with the 15-minute
  `isDuringSearch` validation).
- qEUBO end-to-end validation + transition of
  `docs/notes/qEUBO.md` to `design-note: implemented`.
- Item 27 full, if multi-tab becomes a real workflow.
- Item 32, if deployment flexibility motivates zeroconf.
