# Worklog — Stencil-board overlay: agent field notes

- **Status:** In progress; this is the persistent process record for the stencil-board feature arc.
- **Genre:** Implementation worklog plus outside-contributor field notes. LLM-authored.
- **Started:** 2026-11-10.
- **Audience:** The maintainer and the next human or agent contributor who has to continue this feature after a context reset.
- **Scope:** Record how each independently committed part was investigated and built, which repository sources paid for the work, what friction or uncertainty surfaced, and what the contributor would change about the process. This is not a replacement for the ADRs, a protocol specification, or the work-status source of truth.

> **Update rule:** Append one dated `Part N` section for every logical implementation commit. Ordinarily, update this file in the same commit as that part. Part 1 is the exception: the request for this worklog arrived after the environment commit had already landed, so this initial record is a separate, immediately-following documentation commit. Do not rewrite earlier part records silently; correct them with a dated, visible amendment.

## Part 1 — Persisted environment for stencil cover

**Implementation commit:** [`b7bb393` — Add stencil-cover environment settings](https://github.com/KodBena/LengYue/commit/b7bb3935ae7a8f6cfa99aef73bd302d7d40b488e)

**Intent.** Establish the persistent homes and user-facing controls for the new feature without implementing or changing the proxy protocol. The maintainer chose independent computation and presentation controls. The scalar truncation setting should appear in the existing sliders deck, and the display toggle should be independently reachable from a keybinding.

### How I found the relevant shape

1. **Orient before editing.** I started from the frontend's architectural map and identifier register, then read the governing design tenets already identified as binding for this project: the root type-driven tenet, ADR-0012's structural principles, and ADR-0010's renderer-locality guidance. ADR-0005 was also consulted before writing this record, particularly its rules on authoring documentation as decisions happen and on recording deferrals.
2. **Look for an existing feature with the same split.** The transposition capability is the closest precedent for a profile-persisted proxy-computation setting that is distinct from a session-persisted rendering preference. The older ownership-overlay implementation and its no-auto-restart correction establish the other half of the contract: display toggles must not silently restart expensive analysis. This led to placing the new computation gate beside `useTransposition` in the profile's KataGo settings, while placing the rendering toggle beside the ownership display modes in session UI state.
3. **Trace the actual persistence path.** I followed the typed `AppSettings` / `UISession` shapes into their defaults, schema-version migration, and migration witness. The current schema is 78, and the migration file keeps exactly its two newest migration bodies active; adding a new step therefore also requires moving the oldest active body verbatim into the archive.
4. **Find the existing slider mechanism instead of building another one.** The toolbar slider popover reads scalar declarations from the persisted knob registry and sorts them by priority. A scalar `KnobDecl` pointing at the new profile setting is therefore sufficient to make the threshold available in the sliders deck. No edit to the popover component itself was necessary.
5. **Follow the stable keybinding contract.** The action catalog is the authoritative registry; IDs are persisted keys, so a new action needs a stable literal, a handler, labels, and a test pin. The display shortcut was made presentation-only: it flips the session preference and does not enable proxy computation.
6. **Close the persistence and identity loops.** I added a 78 → 79 backfill, migration tests for defaults / preservation / malformed values, a migration-store round-trip expectation for the defaults-seeded knob declaration, a keybinding test, the Session (UI) registry label, and the English messages. The action ID count in the identifier register was already stale relative to the catalog's test-pinned count; I updated it to 20.
7. **Commit only after checking the branch lease.** The branch was verified at the expected parent before the final tree/commit/ref update. The resulting branch head was then fetched again and confirmed to equal the new commit.

### Files and documents consulted

The list below distinguishes sources that directly shaped Part 1 from material read during the wider feature-orientation pass. Some large source files were read in full; some were inspected at the relevant definitions or excerpts. The inventory is intentionally honest about that distinction.

| Source | Why it was consulted | Value to this part |
|---|---|---|
| `frontend/FILES.md` | Frontend component / state / service map; initial path-finding. | **High.** The fastest starting point for locating owners without guessing from filenames. It is large, but it made the initial search much less blind. |
| `frontend/IDENTIFIERS.md` | Stable identifier vocabulary and construction rules. | **High.** Made the persisted keybinding-ID contract visible; also exposed the stale approximate action count that this commit corrected. |
| [ADR-0000](../adr/0000-the-alpha-and-the-omega-type-driven-design.md) | Root type-driven design posture and the requirement to look for the class-level shape, not just a local patch. | **High as governing context.** Especially relevant when the provisional scalar range is revisited against the real proxy contract. |
| [ADR-0012](../adr/0012-compositional-and-structural-hygiene.md) | P1–P11; source-of-truth, structural-boundary, and authored-content separation principles. | **High.** Helped keep proxy configuration, display preference, and implementation logic in distinct homes. |
| [ADR-0010](../adr/0010-render-locality-and-canvas.md) | Renderer locality and the conditions for choosing a canvas renderer. | **Medium for Part 1; high for later rendering work.** No renderer was changed here, but it shaped the earlier recommendation to keep high-frequency cover data in a leaf rather than make the board-composition parent subscribe to it. |
| [ADR-0005](../adr/0005-documentation-discipline.md) | Documentation lifecycle, directory fit, and the work-status requirement for deferrals. | **High for this file.** In particular Rules 5, 6, and 10. |
| `frontend/src/store/schema.ts`, `frontend/src/store/defaults.ts` | Typed persisted profile/session settings and their runtime seeds. | **High.** These are the authoritative places for the new property shapes and default values. |
| `frontend/src/store/migrations.ts`, `frontend/src/store/archived-migrations.ts`, `frontend/src/store/migration-witness.ts` | Version sequence, rolling archive, and independently witnessed container paths. | **High.** Established the required 78 → 79 backfill and the exact archive operation. |
| `frontend/src/types/analysis-env.ts` | Determine whether the stencil settings belong inside the analysis environment. | **Useful negative result.** That module owns user-authored palette formulas, symbols, and parameters; it is not the right home for proxy feature flags. |
| `frontend/src/components/chrome/ToolbarSliderPopover.vue`, `frontend/src/types/knobs.ts`, `frontend/src/lib/knobs.ts`, and a focused excerpt of `frontend/src/components/editors/RegistryEditor.vue` | Understand how persisted scalar settings become editable sliders and how the generic registry editor exposes settings. | **High.** Confirmed that a new scalar declaration, rather than a bespoke slider, is the intended extension point. |
| `frontend/src/composables/keybindings-catalog.ts`, `frontend/src/lib/keybindings.ts`, `frontend/src/lib/keybindings-capture.ts` | Action-ID construction, key resolution, capture semantics, and dispatch shape. | **High.** Showed that the action registry is the single catalogue and that IDs must be treated as persisted API. |
| `frontend/tests/unit/composables/keybindings-catalog.test.ts` | Pinned action IDs, unique default keys, and registry catalogue invariants. | **High.** The new ID was added to the pin and the expected catalogue size incremented. |
| `frontend/src/i18n/registry-labels.ts`, `frontend/src/locales/en.json`, `frontend/src/i18n/index.ts` | Human-readable Session (UI) registry labels and message-catalog conventions. | **Medium.** The new session property needs a registry label; the English catalog is the complete source catalog. |
| `frontend/tests/unit/store/migrations.test.ts`, `frontend/tests/integration/migration-store-roundtrip.test.ts` | Migration step coverage and the exact defaults-vs-migrated persistence composition. | **High.** Prevents a backfill from appearing to work in isolation while silently failing on the actual hydrate/save path. |
| `frontend/src/composables/auth-app/useAppBootstrap.ts` and the earlier overlay/analysis path (`analysis-service.ts`, `BoardWidget.vue`, `BoardDisplay.vue`, `BoardHeatmapOverlay.vue`, `BoardDeltaAnnotation.vue`, analysis config / ledger / KataGo query-routing types) | Establish the feature's later insertion points and preserve the no-automatic-reanalysis posture. | **High for feature planning; not changed in Part 1.** The earlier pass found that the continuous ownership data path currently makes the composition host carry high-frequency analysis data; a separate self-sourcing renderer leaf is the better precedent. |
| `docs/worklog/2026-05-14-knob-registry.md` and the overlay-toggle no-auto-restart worklog from 2026-05-08 | Prior implementation history for the slider substrate and overlay restart policy. | **High.** These explain why the current mechanisms have their present shape, not just where they are implemented. |
| `docs/notes/reflection.md` and `docs/notes/audit-reflections.md` | Understand the repository's distinction between ordinary change logs and candid contributor / LLM-authored reflections. | **High for this document's genre.** The latter is the closest precedent for recording an outside contributor's bounded observations. |
| `KataProxy/NOTICE` on branch `next` | Check the licensing boundary the maintainer explicitly called out before any proxy-source work. | **High as a guardrail.** The relevant transposition-enricher area is identified as Unlicense material; the separate MIT-derived subtree is not thereby cleared. No proxy implementation source was read or changed for Part 1. |

### Snags and process observations

- **Repository search was not branch-authoritative.** GitHub code-search excerpts came from its indexed/default-branch view and included results at a different commit from `gne`. I used those results as pointers only, then fetched the actual files explicitly at `ref: gne`. A future contributor should not treat a search-result excerpt as evidence of the feature branch's current contents.
- **The migration archive is a real authoring obligation, not housekeeping.** The active migration file intentionally contains two newest steps; this commit moved 76 → 77 to the archive and added 78 → 79. The archive is long, so the operation is easy to get wrong if treated as a casual append. The unit invariant that migration count equals schema version minus one is an important backstop.
- **Exact-text editing needed one correction.** My first migration-header replacement did not match because the comment's indentation differed from the guessed context. Fetching the exact range and matching the actual text resolved it; no branch change resulted from that failed attempt.
- **The remote tool has a per-execution call ceiling.** An all-in-one Code Mode write batch exceeded it. The branch head was checked and remained unchanged; the work was then prepared in smaller batches and committed as one tree/commit/ref update. Batching is safer than trying to orchestrate every Git operation in one large execution.
- **The codebase has two documents numbered ADR-0010.** I treated the indexed, framework-neutral `docs/adr/0010-render-locality-and-canvas.md` as the controlling edition; the older Vue-specific variant should not be mistaken for the current cross-framework ADR.
- **The current slider bounds are deliberately provisional.** Part 1 seeds `stencilTruncationThreshold` as a number with a 0–1 slider range and default 0 only to create the persisted living space and make it editable. The proxy semantics, units, valid interval, and meaning of zero have not yet been established from the proxy contract. This is not a claim that [0, 1] is the correct protocol range.
- **Verification was repository-side, not execution-side.** I verified the commit and branch head, and checked the English JSON syntax before creating its blob. I did not run the frontend build or test suite in a local checkout; no commit-associated workflow run was available through the queried endpoint.

### Candid contributor assessment

The project is dense, but the density is mostly purposeful rather than arbitrary. Once the correct source of truth is found, the relationships are usually explicit: persisted settings have a typed home; defaults and migrations have a stated contract; the slider deck consumes declarations rather than bespoke widgets; keybinding IDs are treated as durable API; and prior worklogs explain why expensive-analysis restarts were removed. That is a good environment for a second contributor because a design decision is often discoverable rather than dependent on oral history.

The cost is that a seemingly small preference crosses several registries and lifecycle surfaces. To add one slider-backed proxy preference and one board toggle, I had to understand the profile schema, session schema, defaults, migration corpus, rolling archive, knob registry, slider consumer, keybinding catalog, identifier register, labels, and tests. This is not necessarily overengineering: each location has a distinct owner. But there is no single short "add a persisted engine-backed display feature" path through them. `frontend/FILES.md` is an excellent map, not a worked recipe.

The knob registry is a particularly successful abstraction in this task. The new threshold did not require another slider component, new popover logic, or another editor surface. One declaration plugs it into an already-working consumer. That is precisely the kind of abstraction that makes the upfront architectural investment visible to a later feature.

The migration discipline is also unusually strong. The rolling archive is a little cumbersome to manipulate remotely, but it keeps the active file bounded and the historical migration ledger immutable. The witness helper is valuable because it makes a typo in a migration's target path fail loudly against the runtime shape rather than allowing a version stamp to conceal a no-op.

The main thing I would be stricter about in my own work is the provisional numeric range. It was expedient for an environment-only commit, but a generic `number` plus a UI range is not yet a domain contract. Once the proxy's definition is known, I would ask whether a bounded/nominal threshold representation can make invalid values unrepresentable at the relevant boundary, rather than relying only on the slider's range or a send-time clamp. That is the type-first question this project rightly trains contributors to ask.

### Maintainer-facing suggestions and open points

1. **Consider a compact feature-path recipe.** A short entry in the frontend architecture map could point to one worked chain: persisted setting → default / migration → knob declaration → keybinding action → analysis request → raw ledger → leaf renderer. It should be a pointer/recipe, not a second source of truth, and only merits adding if this pattern recurs enough to justify maintenance. `not-filed: this session had no work-status database action available; this is a process suggestion, not a separately commissioned change.`
2. **Treat the current slider range as scaffolding only.** The next protocol-facing part should settle the field's exact semantics, valid bounds, zero behavior, capability gating, and what happens when a configured proxy does not advertise the feature before wiring it into query construction. `not-filed: this is the known next step of the current feature arc, not filed as a separate work-status item in this session.`
3. **Keep computation and presentation independent all the way through.** The new display shortcut only changes `session.ui`; the proxy computation setting lives in profile settings. Later analysis plumbing should not reintroduce an overlay watcher that restarts running searches. A user toggling the visual should be able to hide the geometry without changing what the proxy computes.
4. **Do not assume the bundle path is solved by the raw ledger path.** The earlier orientation pass identified the analysis-bundle encoder / projection / decoder as a separate persistence surface that still needs an explicit check for any new optional raw cover data. This is not in Part 1's scope, but it should be included before calling the full feature complete. `not-filed: no separate work-status item was created; this is an explicit verification obligation within the feature arc.`

### What the next part should inherit

- Computation setting: `profile.settings.engine.katago.useStencilCover`.
- Threshold setting: `profile.settings.engine.katago.stencilTruncationThreshold` (range/default provisional).
- Display setting: `session.ui.overlayLayers.ownership.stencilCover`.
- Display keybinding action ID: `display.toggleOwnershipStencilCover`, default key `s` (user-rebindable).
- Threshold KnobDecl: `engine.stencil-truncation-threshold`, priority 90.
- Environment commit: [`b7bb393`](https://github.com/KodBena/LengYue/commit/b7bb3935ae7a8f6cfa99aef73bd302d7d40b488e).

For the next independently committed part, append a new section here rather than starting another feature worklog. Record what was actually inspected and verified; do not upgrade a planned check into a completed one by implication.


## Part 2 — Proxy-side stencil-cover investigation (no implementation)

**Status:** Investigation only. No source code was changed and no proxy commit was made in this part.

**Context.** The maintainer asked for a small proxy extension modelled on `transformers/transposition_enricher.py`: implement one new transformer layer and inject it alongside the existing transposition transformer (with `proxy_server.py` as the likely composition root). The stencil family should be owned by KataProxy, not exposed as a frontend editor. The maintainer also clarified that `gomecsolver` is Unlicense and subsequently added its Unlicense file.

**Time accounting.** The maintainer observed that this investigation consumed more than 30 minutes. I cannot independently measure elapsed wall-clock time from the tool trace, but agree that the amount of reconnaissance was disproportionate to the requested change. This section records both the useful findings and the avoidable scope expansion.

### What I did

1. Located the current `KataProxy/next` tree and inspected its `NOTICE` before using the transposition extension as prior art. The notice distinguishes the Unlicense proxy code from the MIT-derived `goboard_transposition/` subtree.
2. Read `transformers/transposition_enricher.py` and traced its request/response lifecycle: cache query context by client ID; enrich suitable responses; catch validation/native failures without breaking the analysis stream; remove per-query state once the `ProxyLink` mapping is complete.
3. Examined the proxy's generic transformer and capability machinery, wire parser/serializer, configuration, tests, package metadata, and server composition. This was much broader than the task required. The direct transposition implementation plus its injection site should have been the principal template; at most, the generic transformer contract needed a quick check.
4. Examined `gomecsolver` as a research reference: its family file, region and exact-cover representations, component decomposition, solver interfaces, HiGHS examples, and tests. I initially followed the SciPy/HiGHS reference path in `stencil_cover/cover.py` and `stencil_cover/solvers_builtin.py`, and incorrectly reported that I had not yet found the direct `highspy` route.
5. After the maintainer pointed to `hard_region_hunt/highs_solver.py`, inspected that file. It uses the direct `highspy.Highs()` API, adds integer columns with unit objective costs, builds sparse constraint rows, applies a time limit and optional node limit, and returns model status, incumbent count, and dual-bound information. This is the relevant direct-binding reference that should have been found during the initial, narrower solver search.
6. Proposed a provisional protocol vocabulary (`stencil_cover`) and sketched a response carrying separate positive/negative placements and solver status. That was only a proposal, not an agreed contract or an implementation. It should not be treated as frozen by this log.

### Files and documents consulted

The following inventory is intentionally grouped by repository and separates useful sources from the unnecessary breadth of the investigation.

#### KataProxy

| Source | Reason for consultation | Assessment |
|---|---|---|
| `NOTICE` | Check the boundary around the cited transposition implementation. | **Necessary and useful.** It identifies the Unlicense proxy area and the separate MIT-derived native subtree. |
| `transformers/transposition_enricher.py` | Find the direct architectural predecessor. | **Essential.** This is the implementation template and should have been the centre of the investigation. |
| `proxy_server.py` | Find where transformers are imported, composed, and capabilities advertised. | **Essential, but only the relevant wiring sections.** This is the expected second source area for the requested implementation. |
| `AbstractProxy/protocol_transformer.py` | Understand the generic transformer composition contract. | **Useful once, but not a reason to inspect the wider proxy core.** |
| `transformers/capability_gate.py`, `transformers/capabilities_advertiser.py` | Confirm that the existing opt-in gate and advertisement are generic. | **Useful background; no new gate or advertiser should be needed.** |
| `katago/katago_proxy.py`, `transformers/katago.py` | Inspect the opaque wire representation and serializer/parser. | **Over-inspection for this task.** The transposition transformer already demonstrates how to use the existing response/query opaque payloads. Revisit only if the new transformer hits a concrete serialization constraint. |
| `sproxy_config.py`, `.env.example`, `README.md`, `pyproject.toml` | Explore runtime configuration, documentation, and dependency setup. | **Mostly unnecessary.** A feature-specific family file and optional `highspy` import can be kept within the new transformer unless an actual packaging issue proves otherwise. |
| `ARCHITECTURE.md` | Understand the proxy's overall layering. | **Useful orientation, but broader than needed after the transposition template was found.** |
| `tests/test_capability_negotiation.py`, `tests/test_analysis_enricher_extra_status.py`, `tests/test_protocol_parser.py` | Inspect patterns for capability gates, response-status semantics, and wire round-trips. | **Some useful precedent, but excessive for a first pass.** The new transformer's focused tests should follow the existing transformer test style without requiring a tour of unrelated parser behavior. |

#### gomecsolver

| Source | Reason for consultation | Assessment |
|---|---|---|
| `README.md`, `stencil_cover/ARCHITECTURE.md` | Orient within the research project. | **Useful for understanding research boundaries and solver modules.** It is a research architecture, not the product contract for the proxy or frontend. |
| `family.txt`, `stencil_cover/config.py` | Understand stencil family representation and parsing. | **Useful.** Supports keeping the family file and its interpretation proxy-owned, as the maintainer requested. |
| `stencil_cover/region.py` | Understand signed ownership thresholding, legal-point masks, and connected components. | **Useful, but the study's exact experimental semantics are not product requirements.** In particular, the study's `taus` are experimental strata, not mandated GUI bounds or defaults. |
| `stencil_cover/cover.py`, `stencil_cover/stencil_cover_ref.py` | Understand the exact-cover model and a HiGHS formulation. | **Useful solver reference.** The first file's HiGHS route uses SciPy's `milp` wrapper; it is not the direct `highspy` implementation the maintainer had in mind. |
| `stencil_cover/solver_api.py`, `stencil_cover/solvers_builtin.py` | Understand the solver abstraction and HiGHS reference backend. | **Useful research context, but not a proxy integration requirement.** We do not need to port the research project's complete solver framework. |
| `tests/test_cover.py`, `tests/test_stencil_cover_ref.py`, `tests/test_defaults.py`, `tests/test_stencil_validation.py` | Explore correctness expectations and solver verification. | **Useful selectively.** The proxy transformer needs focused tests for placement validity, partition correctness, and solver status; it does not need the research harness wholesale. |
| `study.json`, `DEPENDENCY_FREEZE.md`, `hard_region_hunt/engine.py` | Investigate study defaults, research lifecycle, and solver orchestration. | **Mostly unnecessary for the proxy task.** Reading the orchestration engine was a detour. |
| `hard_region_hunt/highs_solver.py` | Direct HiGHS API example. | **Essential solver reference; found only after the maintainer supplied the path.** This omission caused my earlier answer to mischaracterize the available HiGHS implementation. |

### Corrections to the initial conclusions

- **Threshold range/default:** I wrongly suggested correcting the frontend slider to exclude 0 and/or 1 based on the research project's `(0, 1]` validation and its example `taus`. That was an invalid inference. `gomecsolver` is a research project; its experimental validation and strata do not dictate the product's UI contract. The frontend must not invent a narrower domain or an arbitrary default. The value's meaning, endpoints, default, and whether an endpoint acts as a toggle must be decided from the intended product semantics and preserved faithfully through the protocol.
- **Ownership directionality:** Ownership is signed and colour-coded. A threshold rule must treat the positive and negative ownership regions symmetrically while retaining their distinct colours/signs. It must not collapse the map to an unsigned magnitude and lose which colour a region belongs to. The precise truncation rule remains to be specified; it is not derived by copying the study's strata.
- **Stencil configuration:** The family file belongs to KataProxy. The frontend should not grow a bespoke stencil-family editor for a configuration that almost never changes.
- **Implementation boundary:** The requested proxy change should be one new transformer layer, with its injection/advertisement in `proxy_server.py`. Existing generic capability and transformer machinery should be reused. Do not modify parser, serializer, capability-gate, cache, or unrelated proxy subsystems absent a concrete demonstrated need.
- **Protocol status:** `stencil_cover` was only a candidate capability identifier. The proposed response envelope/status/placement schema was not agreed or implemented. Any final wire shape should be the smallest opaque enrichment that meets the frontend consumer's needs and the maintainer's signed-colour requirement.
- **Solver choice:** The direct `highspy` API reference is `hard_region_hunt/highs_solver.py`; the previous report overlooked it and should not be used as the basis for implementation decisions. The proxy implementation should use the shallow exact-cover formulation, not port the larger research solver framework or its benchmark apparatus.

### Documentation and process assessment

The available KataProxy source is a stronger extension guide than I initially credited: `transposition_enricher.py` is a concrete, working example of precisely the requested pattern, and `proxy_server.py` exposes the relevant injection seam. The repository-level architecture documentation helps orient a newcomer, but I did not find a concise "add one response enricher" recipe that explicitly says the normal change is (1) a new transformer module, (2) a focused transformer test module, and (3) import/composition/capability advertisement in `proxy_server.py`. That small recipe would have prevented much of my over-exploration. This is a narrow documentation improvement, not a claim that the broader architecture is undocumented.

The process mistake was not merely spending a long time reading; it was failing to stop once the direct precedent had answered the architectural question. I expanded into serializer internals, capability tests, configuration machinery, and research orchestration instead of treating the transposition transformer as the executable contract. The better sequence is: read the transformer, inspect its injection point, identify only the data the new layer needs, then implement focused tests. Consult lower-level proxy internals only when that path exposes a real obstacle.

### Gitee question

I did not intentionally query Gitee. The tool calls visible in this task used the GitHub repository connector and `github.com` / `api.github.com` URLs for `KodBena/KataProxy`, `KodBena/gomecsolver`, and `KodBena/LengYue`. I have no recorded Gitee URL, Gitee search, or Gitee-derived source in the available call history, so I cannot attribute a Gitee result the maintainer may have seen. No implementation decision in this investigation relied on Gitee material.

### Next-step scope

The next implementation part should be deliberately small:

1. Add one Unlicense transformer module to KataProxy, using `transposition_enricher.py` as the direct template.
2. Use `highspy` directly following `hard_region_hunt/highs_solver.py`, but build only the shallow exact-cover model required by this feature.
3. Keep the stencil family in a proxy-owned family file/configuration location.
4. Inject the transformer and advertise its capability in `proxy_server.py`; reuse the existing capability gate.
5. Add focused tests for signed positive/negative regions, exact placement validity, empty/disconnected regions, invalid thresholds/inputs, non-optimal solver status, and per-query cleanup.
6. Do not change KataProxy's generic parser, serializer, capability gate, cache machinery, or MIT-derived native subtree unless a tested requirement forces it.

The frontend's provisional threshold slider remains deliberately unresolved. Do not treat the research project's `taus` or validation interval as the GUI's allowable values.


## Part 3 — Proxy stencil-cover enricher

**Implementation commit:** [9a3a2fd — Add stencil-cover response enrichment](https://github.com/KodBena/KataProxy/commit/9a3a2fd241a3c5be3c2f705a55be1391c30f68ea) on KodBena/KataProxy, branch next.

**Worklog placement.** This record lives in LengYue while the implementation lives in KataProxy. A Git commit cannot contain files from both repositories, so this append is necessarily a separate documentation commit on LengYue branch gne; it is paired with, and names, the proxy implementation commit above.

### Dated correction to Part 2's highspy wording (2026-11-10)

The Part 2 account says that I "incorrectly reported that I had not yet found the direct highspy route." That gives the wrong account of what happened. The direct highspy route had already been identified and reported; the later statement that it had not yet been found contradicted that earlier report. The error was in my own later account of the investigation, not in the availability of the source or in the maintainer having to supply a missing discovery. This clarification supersedes the relevant Part 2 wording.

### Scope and files changed

This part implemented the proxy-side enrichment using the narrow extension seam identified in Part 2:

- transformers/stencil_cover_enricher.py — new Unlicense transformer.
- transformers/stencil_family.txt — proxy-owned family file, using the existing name: plus ASCII-row format. It contains the rectangle family from 1×1 through 6×3.
- proxy_server.py — imports the transformer, adds it to the existing capability-gated transformer chain, and advertises stencil_cover only when both highspy and the family file are available.
- tests/test_stencil_cover_enricher.py — nine focused tests.

No generic parser, serializer, capability-gate, cache, or protocol-transformer implementation was changed. No file in the MIT-derived goboard_transposition/ subtree was touched. The existing capability gate and capability advertiser are reused.

### First implementation contract

A query opts in explicitly through:

capabilities.stencil_cover.truncation_threshold

The transformer records the board dimensions and threshold by client ID. It deliberately ignores legacy queries that have no explicit stencil_cover capability entry, even though the shared capability wrapper auto-engages for legacy clients; that prevents this new, expensive computation from unexpectedly running for clients that did not ask for it.

Only final AnalyzeResponse packets are enriched; during-search packets pass through. The result is added to response opaque data under stencilCover. Its first wire shape is:

- version, threshold, width, and height;
- independent positive and negative covers, each with placements, tileCount, optimal, and status;
- each placement contains a stencil name and its board points as [x, y];
- top-level optimal is true only when both signed regions have proven optimal covers.

Positive and negative ownership are solved separately and remain separately identified in the response. The implementation does not reduce ownership to unsigned magnitude.

The solver builds a binary exact-cover model directly with highspy: one variable per candidate placement, unit objective cost per selected placement, and exactly-one coverage for every point in the selected region. Single-point placements are always added as a feasibility fallback. A valid time-limited incumbent is returned with optimal: false; when no valid incumbent is available, the singleton cover is returned with status: fallback and optimal: false. Empty regions are represented explicitly and do not need a solver call.

### Choices that remain provisional

- **Solver dependency:** highspy is imported optionally. I did not add it to KataProxy's required dependency set, consistent with the narrow requested file boundary. The capability is not advertised unless the optional package and family file are both present. Consequently, a normal environment without highspy will not expose this feature until the optional package is installed.
- **Threshold endpoints:** The transformer currently accepts finite values in [0, 1], based on the signed ownership value domain, not on the research study's experimental validation interval. At exactly zero, strictly positive and strictly negative points are separated and neutral zero-valued points belong to neither side. At exactly one, only values at +1 or -1 qualify. These endpoint semantics are explicit in this first implementation, but they are not yet a final product/UX decision and should be checked before frontend wiring. Part 1's slider range remains scaffolding, not a confirmed UI contract.
- **Policy input:** The transformer accepts a policy array at top-level policy or rootInfo.policy, expects -1 to mark illegal points and probabilities in [0, 1] for legal points, and ignores an optional trailing pass entry. This follows the gomecsolver research representation. I did not validate that representation against a captured live KataGo JSON response in this part; the exact wire location and encoding still need a real-packet check. If policy data is absent or malformed, enrichment is skipped rather than silently covering occupied points.
- **Solver budget:** The current hard-coded time limit is 0.25 seconds per signed region. This is a responsiveness guard, not a measured optimum or a user-configurable product setting. A result is marked unproven when the solver does not report optimality.

### Tests and verification

The new test module contains nine tests covering family parsing and connectivity, zero/one threshold semantics, candidate generation and singleton feasibility, explicit capability opt-in, final-response-only processing, preservation of positive/negative separation, missing-policy refusal, and (when highspy is installed) a small real HiGHS domino exact-cover case.

**Execution status: not run.** I attempted to clone the branch for local execution, but the container could not resolve github.com (Could not resolve host: github.com). The commit's workflow-run lookup returned no associated workflow runs. I verified the final branch head and fetched the committed source, family, tests, and proxy_server.py again; I also verified that the server import, chain injection, and runtime advertisement are present. This is repository/readback verification, not a passing test result.

The tests do not yet cover every case listed in Part 2's proposed test scope: in particular, there is no dedicated assertion for cleanup after the final link mapping disappears, nor a simulated time-limit/no-incumbent HiGHS response. Those are honest follow-up coverage gaps, not completed checks.

### What the next frontend part must do

The proxy does not modify the engine request to add analysis fields. A client using the capability must request the ownership map and policy map from KataGo, then send the explicit stencil_cover capability metadata. The frontend must consume the opaque stencilCover result while preserving the positive/negative distinction, and verify that analysis-bundle persistence keeps the enrichment. The computation preference and display preference remain separate: visibility changes should not cause analysis restarts.

### Process assessment

This implementation stayed close to the requested boundary: one transformer module, one proxy-owned family file, focused tests, and the proxy_server.py wiring. I did not need to alter generic proxy infrastructure. That validates the Part 2 conclusion that the transposition enricher was enough to reveal the extension pattern.

The two things I would tighten before calling the full feature complete are the input-contract verification against an actual KataGo response and the solver lifecycle tests (especially no-incumbent/fallback and final-ID cleanup). I would not widen the implementation into the generic parser or cache to address either; both are local to the new transformer and its tests.


## Part 4 — Connected-component decomposition and shape cache

**Implementation commit:** [d1ae670 — Decompose and cache stencil-cover components](https://github.com/KodBena/KataProxy/commit/d1ae670bff3ff78edca32bdc1b39789c82d80b97) on KodBena/KataProxy, branch next.

**Scope.** This part corrects an important algorithmic omission from Part 3: a signed ownership region must be decomposed into 4-connected components before the exact-cover solver sees it. A cache keyed by whole-board masks would not solve the combinatorial problem; repeated small component shapes are the useful unit of reuse.

### Implementation

- Added an iterative 4-neighbour connected-component splitter. Both positive and negative signed regions pass through _solve_region, which now splits them before calling the component solver. The HiGHS model therefore receives one connected component at a time, never a disconnected mask.
- This decomposition is valid for the current family because the family parser already rejects stencils that are not 4-connected. A connected stencil placement cannot bridge two distinct 4-connected components.
- Added @functools.lru_cache(maxsize=90_000) around the component solve. The key is a compact, translation-normalised component mask plus the active family and solver time budget. The family is part of the key so a changed family cannot reuse a stale result; the millisecond time budget is part of the key so a future configurable budget cannot reuse a result computed under a different limit.
- Normalisation is by translation only. I deliberately did not add rotations/reflections: those are safe cache equivalences only when the active stencil family is invariant under the relevant symmetry, and that proof is not needed to obtain useful reuse.
- Cached values are compact binary placement descriptions: stencil index, placement size, and local point indices. Candidate incidence matrices, NumPy arrays, fp32 ownership maps, and other dense solver intermediates are not retained in the cache. The cache result is translated back into board coordinates after lookup. The response continues to carry placements/coordinates rather than a dense board matrix.
- The current per-component time limit remains 250 ms. The solver function now accepts the time limit explicitly, but no GUI setting was added in this part.

**Memory note.** Python's functools.lru_cache(maxsize=...) limits the number of entries, not their total byte size. The 90,000-entry limit is an approximate 256-MB-scale design point given the packed 25×25 component key (at most 81 bytes) and the compact placement representation (at most about 2.5 KB for an all-singleton 25×25 cover), plus ordinary cache bookkeeping. It is not a strict byte ceiling; typical component entries are substantially smaller. Keeping the representation compact is part of the memory strategy, not an optional optimisation.

### Tests and verification

Four additional tests were added, bringing the focused module to 13 tests. They cover 4-connectivity (including diagonal non-connectivity), translation-normalised shape keys, decomposition before the cache/solver boundary, and the cache entry limit. The existing optional HiGHS domino test remains in place.

**Execution status: not run.** I fetched the final proxy source and test file from the committed next branch and verified the decomposition, component-cache call, compact encoding helpers, cache size, and new tests are present. The local environment still cannot resolve github.com, and there is no test workflow result available for this commit. Repository readback is not a passing test run.

### Backlog recorded from the maintainer's follow-up

1. **GUI control of the solver time budget.** The 250-ms per-component limit is currently an implementation constant. A GUI user must eventually be able to control it. This part does not add the preference or UI; it only makes the budget an explicit solver argument and cache-key dimension so that later changes remain correct.
2. **Revisit the MEC input mask and dead-stone semantics.** The present implementation uses the policy illegal-point sentinel as a mask, following the research implementation. The maintainer notes that human subitizing behaves differently: dead stones are ignored while estimating regions, then counted separately; when they form a blob, the blob is counted and its value doubled. A policy -1 mask cannot by itself express that distinction between dead stones, live occupied points, and other illegal points. The correct region/mask model is unresolved and deliberately deferred. Do not treat the current policy mask as a final product definition.

### Process assessment

The follow-up clarified that component decomposition was not merely a cache optimisation. It is a prerequisite for making the exact-cover work tractable on the natural disconnected masks produced by ownership regions. The solver and cache now share the right unit: a connected component shape. The new cache reuses a solved local shape across translations and repeated review positions without retaining the large numerical artefacts that generated it.

The 90,000 lru_cache limit is entry-based, not a literal memory quota. The chosen binary representation keeps the likely footprint in the intended range, but actual resident memory should be observed under a real game corpus before treating the estimate as an operational guarantee. A future byte-accounted cache would be warranted only if measurement shows that the entry bound is insufficient.


## License

Public Domain (The Unlicense).
