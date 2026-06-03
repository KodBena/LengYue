# TODO — human index over the work-status SSOT

**Work status is no longer recorded here.** The canonical record of every
open / shipped / deferred work-actionable item is the work-status SSOT,
`docs/work-status.json` — typed status, faceted scope/tier, structured
inter-item references, and the full per-item description. This file is a
**thin human index** over it: one scannable line per open item, for a
reader who wants the lay of the land before querying.

Do not record status here. To change an item's status, edit
`docs/work-status.json` (the checker at `tools/work-status/check.mjs`,
CI-gated, validates it). This index is a hand-maintained **projection** of
the SSOT as of **2026-06-02**; it drifts the moment the SSOT changes
(the co-change advisory `tools/doc-graph/cochange-advisory.mjs` flags this
file in CI when `work-status.json` changes without it). Regenerate it from
the SSOT rather than editing item status by hand.

<!-- derived-from: docs/work-status.json -->
(Auto-generation of this projection is the tracked future step — RCA guard
G5; until then it is refreshed by hand.)

## Querying the SSOT

The SQL tool loads `docs/work-status.json` into an ephemeral in-memory
SQLite view (the JSON is the source of truth; nothing is persisted) and
runs ad-hoc SQL over `items` / `deps` / `refs`:

```bash
# every open item, by tier and scope
node tools/work-status/sql.mjs "SELECT id, tier, scope, title FROM items \
  WHERE state='open' ORDER BY tier, scope"

# what's queued right now (active / in-progress, not parked)
node tools/work-status/sql.mjs "SELECT id, title FROM items \
  WHERE state='open' AND disposition IN ('active','in-progress')"

# the schema, and the JSON shape of one item
node tools/work-status/sql.mjs --schema
node tools/work-status/sql.mjs --json "SELECT * FROM items WHERE id='chess-clone'"
```

Closed work (`state='closed'`, with `resolution` shipped / superseded /
dropped / deferred) is in the SSOT too; the shipped-feature narratives that
used to live in prose are in `docs/handoff-current.md`'s vestige
(`docs/archive/notes/handoff-current-vestige.md`) and the worklogs.

---

## Open items — index (projection of the SSOT, 2026-06-02)

Two dispositions: **Active** (queued or in progress) and **Future**
(parked, often with a design note). Within each, by tier (Small → Large)
then scope. The `id` is the SSOT key; query it for the full description and
references.

### Active (queued / in progress)

#### Small
- `remove-dead-recursive-cte-duplicates` — Remove the dead recursive-CTE duplicates + retire the D-5/D-6 dead-code tests `[backend]`
- `knob-wire-key-derivation` — Wire-key derivation from KnobDecl ids for qEUBO controlled_parameters `[both]`
- `knob-bookmark-schema-reshape` — qEUBO bookmark schema reshape `[frontend]`
- `remove-legacy-auth-key-shim` — Remove legacy auth-key compat shim (api-client.ts) `[frontend]`
- `review-state-convention-inconsistency` — Review-state convention inconsistency between App.vue and BoardTab.vue `[frontend]`
- `scattered-timing-literals` — Scattered non-coalescing timing literals `[frontend]`
- `surface-1-backgrounds-audit` — --surface-1 backgrounds (low-contrast on the default theme) `[frontend]`
- `tags-fetch-hydration-race` — Tags-fetch hydration race (useAppBootstrap.ts) `[frontend]`
- `doc-graph-svg-spline-failure` — Doc-graph SVG — Graphviz dot spline-routing layout failure `[umbrella]`
- `pre-merge-checklist-doc` — docs/pre-merge-checklist.md as an actual file `[umbrella]`

#### Medium
- `chess-clone` — Chess clone (domain port) `[both]`
- `qeubo-e2e-validation` — qEUBO palette calibration — end-to-end validation `[both]`
- `silent-coercion-protocol-boundaries-audit` — Silent-coercion-at-protocol-boundaries audit `[both]`
- `i18n-string-sweep` — Internationalization (i18n) — string sweep `[frontend]`
- `many-boards-open-slowness` — Many open boards slow the app down `[frontend]`
- `nav-during-range-query-perf` — Navigation-during-range-query perf (regime B) `[frontend]`
- `pv-hover-jank-range-query` — PV-hover jank during a live range query `[frontend]`
- `refactoring-queue-adr0007` — Refactoring queue from ADR-0007 `[frontend]`
- `responsive-design-deferred` — Responsive design — deferred items `[frontend]`
- `save-disconnect-clears-graph` — Save → disconnect clears the analysis graph; companion always-persist option `[frontend]`
- `adaptive-query-cancellation-leak` — Adaptive-query cancellation leak (mid-adaptive terminate — likely proxy-side) `[proxy]`
- `doc-graph-svg-render-off-tree` — Doc-graph SVG — render off the counted tree `[umbrella]`

#### Large
- `perceptual-event-projection` — Perceptual event projection — user-observable event-stream chart `[frontend]`
- `adr-effectiveness-audits` — ADR-effectiveness audits + doc-graph consolidation discipline `[umbrella]`

### Future projects (parked)

#### Small
- `gradingparameter-opacity-typing` — gradingParameter opacity — tighten if the inner shape stabilizes `[both]`
- `rename-tag` — Rename a tag `[both]`
- `serial-numbers-generated-artifacts` — Serial numbers on compiler-generated artifacts `[both]`
- `card-metadata-during-review` — Card metadata display during active review sessions `[frontend]`
- `policy-head-overlay` — Policy-head outputs overlay `[frontend]`
- `pv-animation-defaults-calibration` — PV-animation defaults — pairwise-calibration question `[frontend]`
- `pv-manual-scroll-stepping` — Mouse-scrollable PV stepping `[frontend]`
- `pv-overlay-typography-calibration` — PV-overlay typography proportions — calibration question `[frontend]`

#### Medium
- `browse-tag-dsl-filter` — Tag-DSL-filterable browse directory (+ fetch-all deck-DSL) `[both]`
- `library-tag-favorite` — Tag / favorite games in the library `[both]`
- `board-close-minimize-restore` — Close / minimize / restore open boards (tab-management UX) `[frontend]`
- `card-editor` — Card editor `[frontend]`
- `engine-connection-lifecycle-logout` — Engine connection lifecycle on logout (deployment-model-dependent) `[frontend]`
- `inline-analysis-config-editing` — Inline analysis_config editing in the card-metadata panel `[frontend]`
- `kde-boundary-bias` — KDE boundary bias for bounded-support palettes `[frontend]`
- `mistake-finder-unpunished-brittleness` — Mistake-finder un-punished-flag brittleness `[frontend]`
- `offload-layout-to-libraries` — Offload styling/layout to ecosystem libraries `[frontend]`
- `semantic-clarity-refactors-effect-typing` — Semantic-clarity refactors surfaced by the effect-typing consult arc `[frontend]`
- `syncservice-suspend-resume` — SyncService suspend/resume affordance (capture-neutral persistence) `[frontend]`

#### Large
- `bulk-card-management` — Bulk card management over sub-trees `[both]`
- `community-palette-library` — Community palette library `[both]`
- `content-addressed-card-identity` — Content-addressed card identity — auditability investigation `[both]`
- `distribution-packaging` — Distribution packaging `[both]`
- `item-32-zeroconf-discovery` — Item 32 — zeroconf / mDNS service discovery `[both]`
- `public-deployment` — Public deployment (hosted service) `[both]`
- `automatic-mistake-discovery` — Automatic mistake discovery `[frontend]`
- `config-schema-projections` — Configuration schema + equivariant projections `[frontend]`
- `item-27-etag-multitab` — Item 27 full — ETag-based multi-tab coordination `[frontend]`
- `polymorphic-chart-renderer` — Polymorphic chart renderer abstraction `[frontend]`
- `stability-surface-distribution-metric` — Stability surface — distribution-level (information-geometric) metric `[frontend]`

---

*55 open items as of 2026-06-03 (25 active / in-progress, 30 future). The
old multi-paragraph TODO entries, the Completed-work tables, and the
implementation-order recommendation are superseded by the SSOT; the
v1.0/v1.1 completed-work tables remain archived at
`docs/archive/TODO-completed-2026-05-06.md`.*
