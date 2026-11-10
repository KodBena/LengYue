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

## License

Public Domain (The Unlicense).
