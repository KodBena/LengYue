# Audit — SPA history lessons at 1,129 commits (2026-06-10)

A whole-history review of the frontend, commissioned by the maintainer on
2026-06-09: collect lessons learned across the git log and the documentation
graph, and distill them into actionable guidance — specifically refactoring
opportunities that improve correctness and auditability-for-humans (simpler
code without losing performance; a small perf loss acceptable only for a
large auditability gain). A binding constraint arrived mid-review and was
applied to every recommendation: the maintainer intends a **generic
knowledge flash-card fork** of this SPA, so within-domain refactorings are
fine but collapsing domain-agnostic infrastructure to simplify the SPA in
the name of minimalism is not.

**Method.** Two orchestrated multi-agent passes (90 agents total, ~8.2M
sub-agent tokens). The main pass: 13 evidence miners (git churn, git
narrative, postmortems, audits, retrospectives, three worklog cycles, ADR
revisit-triggers, mechanical conformance, the work-status DB, doc-graph +
dispatch ledger, architecture ergonomics) → 121 findings → 3 lens
distillers + a merge judge → 18 candidates → 2 adversarial verifiers per
candidate (existence/evidence at HEAD; fit/value against the ADRs and the
todo DB). The generalization pass: 2 fork-lens distillers → 8 new
candidates → full verification, plus a two-sided generalization verdict on
each of the 18. All 18 main candidates survived (with substantial factual
corrections, folded in below); 7 of 8 new candidates survived; none of the
18 was refuted on generalization grounds. Every commission prompt and every
agent report is recorded verbatim in the companion appendix — split for
renderability into `audit-spa-history-lessons-2026-06-10-appendix-p1.md`
(shared prompts + harvest miners), `…-appendix-p2.md` (distillers +
verifier verdicts), and `…-appendix-p3.md` (the generalization run), same
directory — per the standing verbatim-record discipline.

Point-in-time report per this directory's convention; not retro-edited.

---

## 1. Verdict

The SPA has not devolved. The architecture — Components / Composables /
Services, the single GlobalStore with named mutators, the ACL, the engine
directory as a wholesale-replaceable band — is holding, and none of the 18
verified recommendations proposes undoing an architectural decision. What
the history shows instead is **seam-level debt with a recognizable
signature**: trust boundaries that cast instead of narrowing, state slots
with multiple writers and no named owner, prose disciplines decaying where
no mechanism polices them, and deferral records evaporating before they
reach the work-status store.

The correction machinery demonstrably converges: render-coupling recurred
roughly nine times until ADR-0010 plus the render-count harness mechanized
it, and has not been observed since; the scoped-state teardown class was
re-fixed four-to-five times before converging on registries plus
exact-set completeness tests; reverts are nearly absent; the F-optimizer
retirement deleted ~2,040 lines cleanly because every workaround surface
carried a named removal trigger. The strain concentrates in three files
(`types.ts`, `analysis-service.ts`, `App.vue`) and in process edges (cast
justification held at ~50% in sample; hand-maintained censuses rot within
weeks), all of which are addressable incrementally.

## 2. Cross-cutting lessons

**L1 — Prose disciplines decay; mechanisms stick.** The single
strongest pattern in the corpus, evidenced from both directions. Failures:
the cast-justification rule held at ~50% in a 32-site sample; the
render-coupling anti-pattern recurred after a full postmortem described it;
the closeBoard docstring census says "Four cleanups" over eleven actual
operations; the eslint rationale header asserts violations that were
resolved 2026-06-01. Successes: every RCA-minted lint (G1
message-reparse ban, `clear-needs-ownership`), the two scoped-state
registries with completeness tests, the branded-key arcs, the doc-graph
freshness gate. Corollary: correctness budget is best spent converting the
remaining prose disciplines into compile-time, lint, harness, or
DB-constraint enforcement — not writing more guidance prose.

**L2 — Multi-writer slots want owners, not per-writer gates.** The
card-tree slot's per-writer flag was re-fixed within ~3.5 hours
(`3e11c38` → `fb0159a`); the owner has held since, and the lint rule that
mechanized it records the failed-gate history in its rationale. Live
instances at HEAD: 19 direct `store.engine.*` assignments in
`analysis-service.ts` (which bypasses the one existing named engine mutator
at :192/:408, with the disconnect-reset block duplicated at ~:169-192 and
~:398-411); `showMoveSuggestions` with four writers and an unconditional
force-true on review completion that clobbers a persisted user preference;
`treeExpanded` flipped at `useReviewSession.ts:283` and never restored.

**L3 — Deferral capture leaks at authoring time.** Every deferral that
reached the todo DB is accounted for; deferrals recorded only in worklog
"What's deferred" sections, postmortem recommendations, or retro roadmaps
reliably evaporated — the module-scope rebinding audit was deferred in a
2026-05-17 worklog, never filed, and parts of the class then recurred.
Symmetrically, open items without refs to their paid-for diagnoses force
re-derivation: `pv-hover-jank-range-query` says "cause unclear" while the
2026-05-27 perf audit's undischarged causes C.2/C.3 sit one refs-row away.

**L4 — Silent failures concentrate at trust boundaries; typed narrowing
retrofits cheaply.** The subscription seam casts away the
`KataGoResponse` union (`analysis-service.ts:646`, `:836`), so error
packets — which *are* surfaced to the user at the transport layer — also
flow into the analysis path as fake responses, corrupting query telemetry
(premature auto-cleanup, a false "ponder exhausted" warning, a leaked
`activeQueries` entry). Capability metadata is `Record<string, unknown>`
read through casts, so a proxy-side field rename silently hides the
learned-VF dropdown. The outbound ACL is asymmetric on the create leg
(`useMinting.ts` hand-builds the snake_case payload). The proven cure is
the project's own: brands and discriminated unions retrofit at zero runtime
cost (`dd3b85e`: 817 tests green, no behaviour change; proxy v1.0.21).

**L5 — Hand-maintained mirrors drift mechanically.** IDENTIFIERS.md's
file:line citations have drifted (the doc self-describes a 2,233-line
types.ts; actual 2,362); ADR-0003's file inventory has ~9 of ~23 paths
stale; FILES.md still lists a file deleted on 2026-06-01
(`jquery-bridge.ts`); ChromeAnchor mirrors theme.css by hand with a
recorded drift threshold being eroded. Where the structure can be
compiler-checked (split files, brands) or generated (over-budget reports,
registries), the mirror's decaying half should be replaced, not patched.

**L6 — ADR "Revisit when" needs a sweep cadence.** Two ADRs recorded
their fired triggers properly (0005, 0009); two rotted silently: ADR-0001
still describes a `mutateBoard` re-wrap that was removed for documented
render reasons (the re-wrap bullet only; `mutateReviewSession` still
swaps), and ADR-0003's trigger #1 (second domain adopter) has now fired
twice over — the active `chess-clone` item and the fork — without a
record. ADR-0010 has carried two committed harness-envelope artifact lines
since its creation, surviving three later edits.

**L7 — The fork flips ADR-0003's load-bearing boundary.** A Chess port
partitions B3 (replace) from B1+B2 (keep); a generic knowledge fork
partitions B1 (keep) from B2+B3 (mostly replace), with B2 *splitting* —
the game-tree skeleton goes, while the SR-orchestration flow and the
generic charting machinery are exactly the seams worth keeping clean.
FILES.md's legend tests all three bands against the weaker chess axis
(78 [B1] / 39 [B2] / 97 [B3] / 1 [B?]), so B1 tags were never checked
against the criterion that now matters. The verified band erosions
(`resource-service.ts:18` importing a B3 factory; agnostic utils stranded
in `engine/util.ts`; RegistryEditor's baked vocabularies) are no longer
hygiene blemishes — they are the concrete import lines a fork author must
cut.

**L8 — The positive patterns are worth naming so they persist.**
Forward-fix culture with near-zero reverts; workarounds built
retirement-first with named upstream triggers; two-PR foundation/UI seams;
script-driven sweeps with snap-rule tables; the reciprocal
consumed-dispatch pattern (the card-metadata arc closed cleanly; the
learned-vf arc, which skipped it, left obligations dangling); in-situ
correction of analysis documents; and out-of-frame adversarial review,
which was load-bearing twice in one cycle. This review's own verification
pass deflated several of its miners' claims (§6) — same lesson, applied to
itself.

## 3. Recommendations

All prepared for filing in the work-status store as `future`-disposition
items unless marked otherwise (see §5 — the inserts are staged as a
reviewable SQL artifact, not executed); each item's refs row points back at
this audit. Fork
column: **A** advances the fork, **R** reshaped to serve it (reshape folded
into the filed description), **O** orthogonal. Verifier priority hints in
brackets where they deviated from "keep".

### A. Boundary typing and narrowing

1. **Narrow the engine subscription union** (evidence added to the open
   `silent-coercion-protocol-boundaries-audit` item; fork **R**). One
   discriminant-checking helper colocated with the union in
   `engine/katago/`, routing the error variant to per-query teardown
   (telemetry unregister, `activeQueries` cleanup) — user-facing loudness
   already fires at the transport layer, so the seam's job is correct
   failure semantics, not double-surfacing. Deletes three casts (the
   guarded one at `usePlayFromPosition.ts:187` is the in-repo worked
   example the helper generalizes). The union-erasing-cast shape widens
   the filed audit item's scope (it covered enum-vocabulary coercion only).
2. **Typed capability-metadata mirror** (`typed-capability-metadata-mirror`;
   fork **O**). Per-capability interfaces at the mirror site, validated
   once in `parseVersionResponse` (an existing cast-free, unit-tested
   seam); a mismatched known capability degrades that one capability
   loudly — it must not extend the connection-refusal surface, and unknown
   capability *names* keep passing through. The learned-vf dispatch
   instructed this type's existence; it was never created.
3. **Outbound ACL symmetry for `grading_parameter`**
   (`gradingparameter-opacity-typing` — proposed activation + widening; fork
   **A**). The PATCH leg already has an outbound mapper
   (`backend-service.ts:191-205`); the create leg is the only one without.
   Cut the type along the ADR-0003 seam (SR-generic `gamma` on the
   envelope; engine-instance keys — `analysis_config`, `overrideSettings`,
   `default_visits` — as an opaque domain-payload sub-type). The codegen
   already publishes `GradingParameterData` for the PATCH leg; reuse via
   backend dispatch rather than duplicating. Writing the wire-schemas
   section is *triggering Path 2* (a dispatch-first cross-boundary step),
   not fulfilling a broken promise — the unfulfilled promise was a
   `docs/notes/` known-keys note, and the known-keys set must include
   `overrideSettings`, which every prior enumeration missed.
4. **Branded variation-path types + the deferred call-site audit**
   (`branded-path-types`; fork **R**). The class produced three shipped
   fixes in the May match arc plus a fourth audit-found instance three
   weeks later, and a documented still-latent twin in `playEngineMoves`.
   The brand half deliberately revisits a recorded ADR-0003 N=3 deferral
   whose threshold is argued met; the audit and fixture legs (no test
   constructs `current != leaf`) were unconditional recommendations and
   stand cleanly. Mint the brands next to `NodeId` in the identifier
   vocabulary, not in `engine/`; keep the review-session state-machine
   surface path-type-free.
5. **Keyed-cache brand at construction** (`keyed-cache-brand-at-construction`;
   fork **A**). The audit half is already answered safe (the `r:`/`e:`
   prefix mints and parses in exactly one function each; legacy hashes
   cannot collide) — the deliverable is recording that conclusion plus the
   construction-time rule in `frontend/CLAUDE.md`'s Type-driven-design
   section, with each key leg carrying a one-word band call in its
   IDENTIFIERS.md row.
6. **Validate at the enrichment merge boundary**
   (`enrichment-merge-null-validation`; fork **R**). The
   `mergeRecords` inner-null sharp edge the adaptive-deeper postmortem
   named (§5.5) is still unguarded, and the 2026-06-08 stratification
   *widened* the exposure window by removing the visit gate. Guard is
   structural and instance-blind inside the Band-1 helper (object-typed
   incoming value with null-bearing fields replacing a populated leaf →
   structured loud-warn); all KataGo-specific calibration lives at the
   Go-typed call sites. Loudness terminal level (warn vs throw vs
   system-message) decided at implementation; a throw on the packet path
   for a wire-origin anomaly is probably wrong.

### B. State ownership

7. **Give the multi-writer slots owners** (`multi-writer-slots-get-owners`;
   fork **A**; [raise]). Staged: (i) move the `analysis-service.ts:463`
   board write behind the early-return guards *and* through `mutateBoard`
   (it currently fires even when the query is refused; the un-bumped write
   silently misses the debounced sync until an unrelated mutation fires
   one); (ii) a blind-mode owner in the review session — snapshot/restore a
   supplied list of session-UI pref keys on loadCard/finish/abort
   (`showMoveSuggestions` is persisted state, so the clobber survives
   reloads; whether finishCard's reveal is pedagogy is a maintainer call,
   §7.3); (iii) extract an engine-connection owner module named for the
   problem class (connect / disconnect-reset / info / selection / metrics),
   collapsing the duplicated reset — this also makes `store.engine` plus
   its owner a wholesale-replaceable unit for a fork with a different (or
   no) analysis provider, and is the natural landing for the open
   `engine-connection-lifecycle-logout` item; (iv) a data-driven ESLint
   writer-enumeration rule (`{subtree → owners}` config map) with
   ADR-0001's template-toggle exception carved out, recorded as an
   ADR-0001 amendment per Rule 6.
8. **Scoped-state registry posture** (evidence on
   `spa-board-scope-consistency-audit` and
   `thumbnail-render-lifecycle-consolidation`, not a new item; fork **A**;
   [lower]). The verification pass found the migration leg re-litigates a
   recorded decline (the 2026-06-05 consult's keep-Class-B-inline verdict,
   grounded in the audit's no-leaks finding), so it is filed as a
   maintainer question, not bug-driven work (§7.2). What stands regardless:
   fix the rotted closeBoard docstring now ("Four cleanups" over eleven
   operations, one of them unenumerated, plus a stale plan path at :416);
   adopt the birth-registration authoring rule for *new* scoped state; if
   the phase-registry is ever adopted, name phases for the problem class
   (quiesce-producers / purge-derived / abort-pending / pre-remove) and
   register at the owners so `store/index.ts` sheds its Band-2/3 imports.
9. **Hydration-rebind residue audit** (`hydration-rebind-residue-audit`;
   fork **A**; [lower — deflated]). The original "never-executed audit"
   claim was wrong: the 2026-06-03 consult swept the boot path (7 sites,
   one hazard, fixed structurally) and the board-scope audit covered the
   module-scope surfaces. The honest residue: `useQueryTelemetry`'s
   reconnect-rebind contract, the thumbnail caches' hydration axis,
   `analysis-service`'s per-board maps — plus one doc that names the
   failure shape and indexes the existing nets. A `whenHydrated()` barrier
   was *deliberately declined* on 2026-06-03 with a named re-trigger; the
   item engages that decision on its own terms rather than re-proposing
   the barrier as an open slot. Audit output records each site's band tag,
   doubling as the fork's inventory of hydration-coupled state.

### C. Mechanizations

10. **Cast-hygiene lint** (`cast-hygiene-lint`; fork **A**). Two honest
    stages: a stock ban on bare `as any` (~13 code sites — near-free,
    could go straight to error per existing adoption practice), then the
    custom justification-adjacency rule for all casts (~200-280 sites,
    measured first per the `a75814c` pattern). This re-opens a recorded
    deferral (`eslint.config.js:134-138` parks `no-explicit-any` as
    warn-as-backlog) and must say so in the rule-rationale header. The
    escape hatch is the established `vue/no-v-html` model
    (disable-next-line + justification); justification comments on band
    boundaries name the cast's band character, making the inventory double
    as the fork's seam map.
11. **Services import-boundary, deny-by-default**
    (`services-boundary-deny-by-default`; fork **A**). The enumerated
    blocklist was incomplete from day one (every unlisted service predates
    the list — authoring-time omission, not post-hoc drift) and is
    fail-open by shape. Invert: restrict `src/services/**` from components
    wholesale; exempt the reactive-state class
    ({analysis-ledger, analysis-config, stability-trajectory-store}) via
    one named constant whose comment marks it as the provisional form of a
    future `state/` directory; switch to `@typescript-eslint/`'s variant
    for type-only allowances. Two gaps the fix must not repeat: the glob
    misses `App.vue` (which imports `analysisService` today — adjudicate
    or name the gap), and the stale census header gets the
    "at adoption … resolved" historical phrasing. Files the ADR-0010
    Revisit #4 tension as work-status reality; the `state/` relocation is
    a separate sign-off arc and the natural place to record the
    machinery-vs-payload seam (ledger machinery is band-agnostic; its
    payload is Go).
12. **Vue lifecycle footgun guards** (`vue-lifecycle-footgun-guards`;
    fork **A**). The two expressible classes from five paid-for
    investigations: boolean gate-props (omission casts to false — the
    `4756c30` "other consumers safe" claim was falsified by `69810e2`;
    vue-tsc cannot police author intent even in principle, so assess
    `eslint-plugin-vue`'s prop rules first) and module-intent mutable
    state in `<script setup>` (per-instance in reality; the
    MiniBoardCanvas fix is the worked example). Keyed on name patterns,
    never component allowlists; the omitted-prop test generalizes the one
    that already exists for BaseChart. Plus one checked CLAUDE.md section
    folding in the *residue* lessons only (v-memo key-stability,
    container-query self-styling, structuredClone-vs-Proxy) — the
    render-coupling corollary already has its canonical home in ADR-0010.
13. **Migration fail-loud guard + composition test**
    (`migration-leaf-assertion-and-composition-test`; fork **A**). The
    real incident: the 47→48 retirement walked a wrong blob path,
    silently no-oped, and was caught pre-ship — but the test gap was that
    *no* per-migration fixtures existed for 44→56 (the file header still
    claims one describe block per migration), not a vacuous fixture. The
    leaf-assertion helper needs an independent witness (assert against the
    path the runtime actually reads, or realistic fixtures) or it
    conditions out on the same wrong path; the composition-level invariant
    test (hydrate legacy blob → migrate → `updateFromRemote` → save;
    key-set compare) is the load-bearing half and does not currently
    exist. The helper is authored instance-free in the B1 framework
    portion and must itself be frozen-once-shipped or inlined, or it
    becomes a mutable dependency of frozen bodies. The bump-cadence
    question (~1.38/day) is deliberately out of scope (§7.5).
14. **Band-conformance CI check** (`band-conformance-ci-check`; fork
    **A**). A doc-graph-style script enforcing `band(file) ≥ band(import)`
    from FILES.md tags + the import graph. Two design decisions found by
    verification: the literal rule drowns in ~37 additional violations via
    the two band-mixed hubs (`store/index.ts` [B3], `types.ts` [B2]) —
    scope to B3-leaf/engine imports or exempt hubs explicitly; and the
    checker forces adjudication of recorded FILES.md-vs-ADR-0003 tag
    disagreements, which is the drift surfacing loudly (it must fail on
    rows resolving to no file — one such ghost row exists today). ADR-0002
    Rule 7 already names band tags as a fail-loudly-governed vocabulary;
    this is its mechanization. Ships with an ADR-0003 amendment noting the
    structural half became mechanism (the content half stays review
    judgment) and the FILES.md legend re-keyed to the any-knowledge-domain
    test.

### D. Structure (the three strained files and the band seams)

15. **Split `types.ts` along its banner seams**
    (`refactoring-queue-adr0007` — filed as evidence + a named-deviation
    question, §7.1; fork **A**; [raise]). 2,362 lines, +117 in one week,
    co-changed with `defaults.ts` in 48 of 90 commits; ADR-0007's own
    exception text prescribes splitting "along clean domain seams" once
    they exist, and the banners are those seams. Band-aware carve per the
    generalization pass: agnostic brands + `PerBoard` in `types/ids.ts`;
    game-coupled brands (StoneColor, PlyIndex) into the Go value-object
    module; store-schema colocated with `defaults.ts`; barrel re-export so
    import sites are stable. The split retires ADR-0003's types.ts
    inventory exclusion and dissolves the "[B2] with B3 leakage"
    compromise tag into honest per-module tags. Two real costs: the barrel
    is a runtime module (one value export exists), so the circular-import
    check is load-bearing; and every `types.ts:NNN` citation in
    IDENTIFIERS.md must re-point in the same PR — the index's
    non-mechanical payload (lifetimes, soundness notes, erosion tags)
    survives and is what the doc keeps carrying.
16. **Keybindings substrate/catalog split**
    (`keybindings-substrate-catalog-split`; fork **A**). The [B1]-tagged
    `lib/keybindings.ts` fuses a generic registry substrate with a
    Go-shaped action catalog (handlers dispatch `analysisService`). The
    real work is the two seams verification exposed: the `enabledWhen`
    vocabulary is baked into the substrate's types, and
    `validateKeybindingsRegistry` closes over the catalog — both must
    parameterize or the fusion reappears one level down. Persisted action
    ids are confirmed in `store.profile`, so the split is pure code
    motion, no schema bump.
17. **Review-scoring named seam** (`review-scoring-named-seam`; fork
    **A**). ADR-0003 designed this seam in prose ("the orchestration is
    portable; the scoring extraction is not") and names `useReviewSession`
    as the Revisit #3 canary — which has tripped: the ADR says Band 2,
    FILES.md says [B3]. Extract per-move delta scoring into a named
    engine-band function taking an *enrichment accessor* as a parameter
    (the engine band is currently services-clean; importing the ledger
    would create the first engine→services edge), making the
    scan-order-sensitive logic tier-1 testable. The extraction names the
    first of roughly four Go seams in the file; annotate band-mixed rather
    than retag clean.
18. **Resource-service calibration seam**
    (`resource-service-calibration-seam`; fork **A**). The Band-1
    exemplar's only public verb is Go-specific (`loadVisitDistribution`,
    fetching as `<any>` while the typed `VisitDistributionData` interface
    already exists one import away); the generic `fetchResource<T>` is
    module-private. Invert: export the generic verb, move the
    fetch+initialize orchestration to the B3 side. The bootstrap limb
    deflated under verification: `useAppBootstrap` is band-mixed through
    three other imports regardless, so its honest fix is a retag plus
    relocating the calibration wiring, preserving the documented
    immediate-watch ordering tolerance.
19. **Re-home agnostic utils from `engine/util.ts`**
    (`rehome-agnostic-utils-engine-util`; fork **A**). `generateUUID` and
    `updateRegistry` (with private `setDeep`) are domain-free but homed in
    a [B3] module, dragging false B3 edges onto [B1] consumers including
    the generic registry write path. Land in `lib/utils.ts` (whose
    FILES.md row is itself stale — three inhabitants, not one). Verified
    non-collapse: `setDeep` and `knobs.ts`'s walkers have deliberately
    different ADR-0002 calibrations (silent-create vs fail-loud) —
    co-locate, never merge. The frozen-archive import line is a
    header-level edit, consistent with the bodies-only freeze convention.
20. **`ReviewCard.sgf` → canonical content vocabulary**
    (`reviewcard-canonical-content-rename`; fork **A**). Reframed by
    verification, and the reframe is load-bearing: 34b *deliberately
    retained* `ReviewCard.sgf` as recorded design, premised on "no second
    domain consumer" — the fork invalidates the premise, so this is a
    recorded decision whose trigger fired, not an unfinished rename.
    ~5 src sites + ~6 test files, compiler-driven; scope crisp for `sgf`
    alone (`defaultVisits`/`gamma` come from the deliberately-opaque
    grading blob and are out of scope).
21. **RegistryEditor vocabulary** — *not filed*; the candidate was refuted
    as a strict subset of the open `config-schema-projections` item, whose
    903-line design note already enumerates all four baked vocabularies
    (the candidate found three) and whose §8 explicitly anticipates a
    general-education fork. The salvage: the fork is that item's §8
    trigger materializing — grounds to raise it from `future` (§7.4) — and
    the FILES.md [B1] tag on `RegistryEditor.vue` deserves a drift
    annotation now.

### E. Documentation and process hygiene

22. **Work-status authoring hygiene** (`work-status-authoring-hygiene`;
    fork **R**; [raise]). One bounded harvest pass over the miners'
    already-compiled dangling-deferral lists (file / drop-with-dated-record
    / confirm-done); refs rows pointing the two refs-less perf items at
    the 05-27 audit (with the note that cause #1 already shipped as
    perf-fix3, so the residual is causes C.2/C.3); re-profile before
    building any lever (the dropped `rb3-packet-receive-chunking` item
    records why: a pre-refactor attribution re-measured at ~99ms vs
    ~2.35s). Going forward: every deferral bullet ends with an item id or
    a grep-able `not-filed: <reason>` marker. Fork reshape: band-annotate
    open frontend items in `extra` jsonb during the pass, and never drop a
    deferral whose rationale is generalization on single-domain grounds.
23. **ADR record amendments** (`adr-record-amendments-2026-06`, parent
    `adr-effectiveness-audits`; fork **R**). The bounded edits: ADR-0001
    trigger #2 recorded + the re-wrap bullet corrected (scoped to
    `mutateBoard`; the version-counter/invariant/grep bullets still hold);
    ADR-0003 triggers #1 and #2 recorded with the fork-axis re-cut — keep
    the band definitions, the seam analysis, and the port-sizing prose
    (FILES.md cannot carry within-file seam detail), delegate only the
    per-file listing, add the non-game sizing with B2 marked *split* (not
    "replace", which the first draft got wrong); ADR-0010's two artifact
    lines deleted + a one-line CI grep for harness-envelope strings under
    docs/; the trigger-sweep checklist folded into the filed audits item
    as cadence. The synopsis co-changes (the advisory will flag it);
    handoff-current's chess-keyed "Domain extension" prose is touched by
    the same change.
24. **Doc-graph dangling-signal cleanup**
    (`doc-graph-dangling-signal-cleanup`; fork **O**; [raise]). 83 of 125
    live danglers (~66%) are noise by the project's own conventions (55
    worklog-origin; 28 more targeting one retired hub; the consolidation
    note even *asserts* the report already segregates worklogs — currently
    false, so the convention's own record believes the tooling implements
    a boundary it doesn't). Align the frozen boundary (maintainer confirms
    the classification, §7.6), split missing-on-disk from outside-node-set
    (four on-disk files are currently reported as missing), tombstone
    retired hubs; then an advisory no-new-danglers ratchet becomes
    feasible. Separately: two verified stale code-side pointers (ADR-0010
    cites `render-locality/`, actual `render-count/`;
    `MoveSuggestions.vue:144` cites a pre-reorg audit path).
25. **Stable handles, not censuses, in code comments**
    (`code-comment-stable-handles`; fork **R**). The O12-O15 docstring
    tags extended a frozen archived plan's numbering and collided with all
    four of its definitions; the closeBoard and eslint censuses rotted.
    The convention (additive slugs; work-status ids paired with
    descriptive slugs so handles resolve in any clone without the
    maintainer's DB; counts live in registries/tests/reports) lands as a
    refinement of the existing resource-ownership prescription in
    `frontend/CLAUDE.md` — a parallel convention would itself be the
    ADR-0005 Rule 1 failure it decries. The two census fixes ride with
    items 8 and 11.

### Below the line — leads not adversarially verified

Findings the merge judge did not promote; each had one miner behind it and
no verification pass, so treat as leads: the `analyzeRange` /
`analyzeActiveNode` ~200-line near-duplication with an untested clamp
divergence (partially addressed by item 7's owner extraction); App.vue's
unscoped style block acting as a global stylesheet for six components, and
its inline grading-integrity policy (extraction candidates); a consolidated
ECharts lifecycle adapter (the Vue-reactive/ECharts-imperative seam is a
fix-chain hotspot); the auth dual-representation (single-owner auth state);
the dangling `useStabilityMetrics` accumulator follow-up ("the next step"
in its worklog, unfiled); the learned-vf dispatch's unmet closure
obligations (FEATURES.md line, locale keys, status edit — and the dispatch
still reads `Status: Open` though shipped); `distribution-packaging`
carrying disposition `future` while two release retros call it the leading
priority; the vestigial ApiError back-compat message format with zero
readers; and a mechanically generated ADR-0007 over-budget report replacing
the stale hand-maintained queue list.

## 4. Already-filed items this review strengthens

| Item | New signal |
|---|---|
| `silent-coercion-protocol-boundaries-audit` | Union-erasing casts are a second coercion shape outside its enum-witness scope; concretely traced corruption path (§3.1). |
| `gradingparameter-opacity-typing` | Active rule contradiction + the never-written known-keys note + the `overrideSettings` omission; grounds to activate rather than await "stabilization" (§3.3). |
| `refactoring-queue-adr0007` | types.ts has outgrown its parked exception on the exception's own terms (§3.15); membership of the queue is stale (heavy tail moved to services/composables). |
| `thumbnail-render-lifecycle-consolidation` | Two footgun classes outside its scope now filed separately (§3.12); shared-render findings attach here. |
| `spa-board-scope-consistency-audit` | Audit deliverable shipped; the open residual is the gated scope-handling decision — status question for the maintainer (§7.2). |
| `config-schema-projections` | The fork is its §8 trigger; raise-from-future recommended (§3.21). |
| `adr-effectiveness-audits` | One sweep instance performed by this review; two unrecorded trigger firings found; 38-trigger checklist + cadence folded in via the new child item (§3.23). |
| `chess-clone` | The fork is a second adopter on a different axis; ADR-0003's amendment should name both (§3.23). |

Updates to these existing items (description widenings, refs rows, the
config-schema-projections raise) are deliberately not staged — mutating
existing items' text and dispositions is curation, and the audit text
above specifies each edit precisely enough to author the one-line
`UPDATE`/`INSERT` when accepted.

## 5. Work-status filing record

Twenty new items are **staged, not inserted**: the full transaction
(items + refs, `state=open`, `disposition=future`) is at
`audit-spa-history-lessons-2026-06-10-filing.sql` (same directory), to be
applied with
`psql -h 192.168.122.1 -d todo -v ON_ERROR_STOP=1 -f <file>` followed by
the `work_status_violations` gate. The review's harness declined the
direct DB write as exceeding the commissioned scope — defensible, so the
inserts await maintainer execution. The staged ids: `multi-writer-slots-get-owners`,
`migration-leaf-assertion-and-composition-test`, `branded-path-types`,
`hydration-rebind-residue-audit`, `cast-hygiene-lint`,
`typed-capability-metadata-mirror`, `services-boundary-deny-by-default`,
`keyed-cache-brand-at-construction`, `work-status-authoring-hygiene`,
`doc-graph-dangling-signal-cleanup`, `code-comment-stable-handles`,
`enrichment-merge-null-validation`, `vue-lifecycle-footgun-guards`,
`adr-record-amendments-2026-06` (parent: `adr-effectiveness-audits`),
`resource-service-calibration-seam`, `rehome-agnostic-utils-engine-util`,
`keybindings-substrate-catalog-split`, `review-scoring-named-seam`,
`band-conformance-ci-check`, `reviewcard-canonical-content-rename`.

A vocabulary wrinkle, surfaced per ADR-0002 Rule 7 rather than silently
absorbed: the `refs.kind` enum has no `audit` value, and existing practice
(two prior items) files audit-doc refs under `design-note`. This review
follows that precedent; if audits keep anchoring items, the enum deserves
the value.

## 6. Claims that did not survive verification

Recorded so the deflations are as auditable as the findings: engine error
packets are **not** invisible (transport-layer `onError` →
`pushSystemMessage`; the silent failure is the secondary type-confused
flow); the migration incident's "vacuous test" never existed (the gap was
twelve consecutive uncovered migrations, and the broken draft never reached
main); the hydration audit was substantially executed piecewise, and the
`whenHydrated()` barrier was deliberately declined with a named re-trigger;
the services blocklist's absences predate the list (incomplete-from-day-one,
not drift); G1 bans message-string reparse specifically — the `r:`/`e:`
prefix is outside its letter and was a loudly-documented design choice;
`registry-editor-vocabulary-injection` duplicated a filed design that is
strictly stronger; "~215 [B1] tags" conflated the total band-tag count with
the 78 actual [B1] rows; one commit hash was misattributed (`87fbc3f`, not
`87f7dfc`); and "five match-arc recommendations dangling" overcounted by
one (the docstring leg substantially shipped). Several candidate claims
were also *strengthened* (the preference clobber survives reloads; the
telemetry corruption is worse than first described; the closeBoard census
is doubly stale).

## 7. Maintainer decision points

1. **types.ts split vs the recorded handled-on-touch policy** — the queue
   item's no-batch posture is explicit; the split is proposed as a named
   deviation on the exception's own terms (§3.15).
2. **closeBoard Class-B phase registry vs the 2026-06-05 consult's
   keep-inline verdict** — only the named-phase design plus the fork
   changes the calculus; re-litigating needs your sign-off (§3.8).
3. **`finishCard` force-enabling move suggestions** — deliberate pedagogy
   (reveal after the blind attempt) or preference clobber? The fix shape
   differs (§3.7).
4. **`spa-board-scope-consistency-audit` residual** — close, or narrow the
   description to the gated decision leg (§4).
5. **Migration bump cadence** (~1.38/day) — an additive-default-backfill
   tier would relax a deliberately chosen honest-version-marker property;
   ADR-level decision, deliberately not bundled with item §3.13.
6. **Doc-graph frozen-boundary classification** — worklogs frozen, a third
   bucket, executed playbooks (§3.24).
7. **Promotions** — verifiers suggested raising `multi-writer-slots`,
   `work-status-authoring-hygiene`, `doc-graph-dangling-signal-cleanup`,
   the types.ts question, and `config-schema-projections`; everything was
   filed `future` pending your call.
8. **`distribution-packaging` disposition** — `future` vs its standing as
   the declared next undertaking in two retros and the README.

## 8. Coverage and limits

The verbatim appendix carries each miner's full coverage statement; the
material gaps: SFC template casts were unaudited (the ~50% cast-conformance
figure is from a 32-of-224 .ts sample); FILES.md band-tag *accuracy* was
spot-checked, not swept (the band-conformance check is the systematic
answer); the narrative miner read all 1,129 subjects but bodies of only ~43
load-bearing commits; ADR-0002's user-report-dependent revisit triggers
were not assessable; ADR-0007's density metric was not measured (size
only); and "no DB item exists" claims rest on keyword sweeps over
titles+descriptions — an item worded very differently could have been
missed. Perf-adjacent statements throughout are the cited documents' own
captured claims or are framed as hypotheses; this review ran no profiles
(ADR-0009).

License: Public Domain (The Unlicense).
