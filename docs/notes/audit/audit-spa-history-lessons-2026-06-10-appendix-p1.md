# Appendix (part 1 of 3) — verbatim commissions and reports (SPA history-lessons review, 2026-06-09/10)

Companion to the audit note (`audit-spa-history-lessons-2026-06-10.md`, same
directory); split into three files for size. This is part 1 (shared prompt
segments + the 13 harvest miners); part 2 carries the main-run distillers,
merge, and verifier verdicts; part 3 the generalization run. Per the standing
verbatim-record discipline (the consult-record convention generalized to
multi-agent audits), every sub-agent's commission prompt and full report are
reproduced here verbatim, with one documented factoring: prompt segments that
were byte-identical across many commissions — the shared preamble/outro, the
embedded evidence/candidate JSON payloads — are printed once in §0 and
referenced from each commission by an explicit `[SHARED: ...]` marker, instead
of being duplicated dozens of times. Reports are never factored; structured
reports are reproduced as their full JSON.

Two workflow runs are recorded: the main review (13 harvest miners, 3 lens
distillers + merge, 2 adversarial verifiers per merged candidate; run
`wf_0c519f95-277`, 53 agents) and the generalization pass (2 distillers +
merge, 1 generalization verdict per confirmed candidate, 2 verifiers per new
candidate; run `wf_5548d33c-697`, 37 agents). Two earlier launches of the
generalization pass were aborted before producing any output used anywhere:
`wf_a396ddee-42b` (stopped within seconds; its `args` carried a placeholder
instead of the candidate array) and `wf_ff320f52-870` (stopped mid-distill;
the harness did not deliver `args` to the script at all, which would have
crashed the verify loop — the v2 script inlines all data instead).

License: Public Domain (The Unlicense).

---

## §0 Shared prompt segments

### §0.1 Main run — harvest preamble (`[SHARED: HARVEST-PREAMBLE]`)

````
You are one evidence-mining agent in a multi-agent retrospective review of the LengYue frontend — a Vue 3 + TypeScript SPA at /home/bork/w/omega/frontend. The umbrella repo root is /home/bork/w/omega (a git repository, ~1129 commits on main; today is undefined). The review's purpose: collect lessons learned across the git history and the documentation graph, and distill REFACTORING OPPORTUNITIES that improve CORRECTNESS and AUDITABILITY-FOR-HUMANS (simpler code without losing performance; a small perf loss is acceptable only for a large auditability gain).

You are STRICTLY READ-ONLY: do not modify any file, do not INSERT/UPDATE/DELETE in any database. Binding disciplines:
- ADR-0002 applied to documentation consumption: if you cite any document, you must have read it END TO END in this session. A grep hit or preview is a pointer to read the file, not a substitute. If you lack budget to read something fully, name the gap explicitly in your 'coverage' output field instead of papering over it.
- Do not read anything under /home/bork/w/omega/backend/qeubo/ (licensing firewall; MIT-bounded code).
- ADR-0009: never assert a performance property (improvement/regression/neutrality) without captured substantiation. Frame perf expectations as hypotheses that would need a profile.
- Cite evidence precisely: file paths with line numbers, commit hashes, document section names.
- Tone: grounded and unpretentious; state uncertainty plainly; no hype.

Exception note: frontend/FILES.md and frontend/IDENTIFIERS.md are sanctioned lookup references — partial consultation of those two is the intended mode.

YOUR SPECIFIC COMMISSION:
````

### §0.2 Main run — harvest outro (`[SHARED: HARVEST-OUTRO]`)

````


Return via StructuredOutput:
- report: your full narrative report (this is the verbatim record that will be archived in the review document's appendix; aim for thorough but disciplined, roughly 600-1100 words),
- findings: an array of specific evidenced findings (title, evidence with concrete citations, implication = the candidate lesson or refactoring opportunity it suggests, confidence),
- coverage: exactly what you read fully, what you skimmed or skipped, and what the skipped portion might affect.
````

### §0.3 Main run — evidence JSON payload (`[SHARED: EVIDENCE-JSON]`)

The payload embedded in each distiller commission is the JSON union of the
per-miner `findings` + `coverage` fields reproduced in §1 below (144416 characters); it is therefore not duplicated here.

### §0.4 Main run — merge input payload (`[SHARED: RAW-CANDIDATES-JSON]`)

The merge commission embeds the union of the three distillers' candidate
arrays (each reproduced verbatim in §2); not duplicated here.

### §0.5 Main run — verifier common segment (`[SHARED: VERIFY-COMMON]`)

````
Repo: /home/bork/w/omega (today undefined). READ-ONLY. ADR-0002 read-fully discipline: read any document you cite end to end; frontend/FILES.md and IDENTIFIERS.md are sanctioned lookup references. Do not read backend/qeubo/. ADR-0009: perf claims need substantiation — a candidate ASSERTING a perf property without measurement should be corrected to hypothesis form, not necessarily refuted. Default to refuted=true only on concrete grounds. Candidate JSON:
````

Each verifier commission ends with the merged candidate's JSON object
(reproduced verbatim in §2.4); marked `[SHARED: CANDIDATE-JSON <id>]`.

### §0.6 Generalization run — discipline preamble (`[SHARED: GEN-DISCIPLINE]`)

````
Repo: /home/bork/w/omega (today 2026-06-10; git repo, frontend SPA at frontend/). STRICTLY READ-ONLY. ADR-0002 documentation-consumption discipline: read any document you cite END TO END (frontend/FILES.md and frontend/IDENTIFIERS.md are sanctioned lookup references — partial consultation intended). Do not read backend/qeubo/ (licensing firewall). ADR-0009: no perf claims without substantiation — frame perf as hypothesis + required measurement. Cite file:line / commit hashes / doc sections. Grounded tone, no hype.
````

### §0.7 Generalization run — fork constraint (`[SHARED: FORK-CONSTRAINT]`)

````
BINDING MAINTAINER CONSTRAINT (stated 2026-06-09/10): the maintainer intends a GENERIC KNOWLEDGE FLASH-CARD FORK of this SPA — not merely another board game, a domain-generic spaced-repetition study tool sharing the agnostic infrastructure. Consequences: (a) within-domain refactorings are fine (simplifying Go-bound code, dissolving Go-specific cruft, band-internal cleanup); (b) it is NOT fine to collapse, inline, or specialize domain-agnostic/general infrastructure in order to simplify the SPA in the name of minimalism — an abstraction used once today may be exactly the seam the fork needs; "used once" is not grounds for dissolution; (c) the fork is the second concrete consumer ADR-0003 has been waiting for, which changes the calculus on seam-naming and Port extraction (though premature/speculative abstraction is still not free — ADR-0003's authoring-time judgment still applies).
````


---

## §1 Main run — harvest miners (commission + report, per miner)

### §1 · harvest:git-churn

**Commission** (= `[SHARED: HARVEST-PREAMBLE]` + the following + `[SHARED: HARVEST-OUTRO]`):

````
Quantitative git-history analysis of frontend/ (use git log / git show in /home/bork/w/omega; full history is in scope). Compute and interpret:
1. Top-churn files under frontend/src (commit-touch counts) — distinguish BY-DESIGN churn (src/store/migrations.ts rolling archive, src/locales/* i18n, src/types/backend.ts generated) from SYMPTOM churn.
2. Co-change coupling: pairs/groups of frontend files that repeatedly change in the same commit (suggesting hidden coupling or a missing seam). Compute from git log --format with --name-only over frontend/src, excluding the by-design files.
3. Fix-chains: files touched by multiple fix-flavoured commits (subjects matching fix/bug/regression/jank/leak) within short windows — subsystems that absorb disproportionate correction effort.
4. Reverts and retirements (revert/retire/remove in subjects).
5. Per-subsystem fix-to-total ratio (components/ composables/ services/ store/ engine/ lib/).
Interpret: which subsystems' correction load suggests an architectural misfit rather than ordinary iteration? Quote commit hashes.
````

**Report (verbatim):**

````
## Quantitative git-history analysis of frontend/ (2026-04-26 → 2026-06-09)

Scope: 413 commits touch `frontend/src` (390 non-merge) out of 1129 on main, over roughly 6.5 weeks — a very high cadence, so "churn" here measures weeks, not years. Methods: commit-touch counts via `git log --name-only`; co-change pairs computed per-commit excluding by-design files and excluding the 6 commits touching ≥26 files (bulk renames would swamp the pair signal); fix-flavour matched on subjects with a word-boundary regex over fix/bug/regression/jank/leak (65/390 = 17%; matching full message bodies instead gives ~202/413, but that is inflated by worklog-style bodies, so subject-only is the primary measure).

### 1. Top churn, by-design vs symptom

By-design churners, confirmed: `src/store/migrations.ts` (66 touches) plus `archived-migrations.ts` (25) — the rolling-archive discipline is documented in the file header itself (read in full; `CURRENT_SCHEMA_VERSION = 59` at line 110), so ~59 schema bumps in ~6 weeks each touch this pair by construction. `src/locales/{en,ja,ko,zh-CN}.json` (50/27/27/27) move as a four-way mirror — their fix-commit lists are literally identical. `src/types/backend.ts` (13) carries the openapi-typescript "Do not make direct changes" banner.

Symptom-flavoured churners: `src/types.ts` (90 touches, 2362 lines today — the single hottest file), `src/App.vue` (60, 718 lines), `src/store/defaults.ts` (58), `src/services/analysis-service.ts` (40, 1181 lines), `src/store/index.ts` (34). Note the mid-history directory reorganisation (components/chrome/, components/tree/, composables/auth-app/) splits logical churn across paths: Toolbar.vue is 23+19, ForestDirectory.vue 21+15, useReviewSession.ts 13+13, useAppBootstrap.ts 10+10.

### 2. Co-change coupling

The dominant pair by a factor of ~2.5 is `store/defaults.ts ↔ types.ts` (46 co-commits); 45 commits touch the full triple types.ts + defaults.ts + migrations.ts (e.g. fb78e5a, 5b57d25, 9d73d33, 9ac3b34). This is the "add a persisted setting" ceremony: interface in the 2362-line types.ts, default in defaults.ts, migration + archive-move in the migrations pair. The ceremony is deliberate (append-only migration ledger), but its hub is not: types.ts also co-changes with analysis-service.ts (18), store/index.ts (14), App.vue (7), useReviewSession (7), backend-service (8) — nearly every feature funnels through one monolithic type file. frontend/CLAUDE.md's Identifier-map section already concedes the file "mixes the identifier types in with value objects, state containers, and the GlobalStore schema," and IDENTIFIERS.md exists as a compensating index. Other notable pairs: App.vue ↔ Toolbar.vue (10 + 5 post-rename) suggests App.vue still acts as an orchestration hub; CardTreeWidget.vue ↔ card-tree-echarts.ts (7) is a component/imperative-renderer pair that moves in lockstep.

### 3. Fix-chains

- **analysis-service.ts**: 8 fix commits (20% of its touches), tightest 3-fix window 4 days. The recurring bug class is composite-key/conflated-state: 914d5e3 split one boolean `isSnapshotMode` into two independent flags; 0792f9a stratified the ledger because one composite hash keyed both palette-dependent and palette-independent data; 6cb99d3 (same day) fixed the *same* latent bug in stability-trajectory-store — a twin that 0792f9a's own body had flagged as "out of scope"; d8292a2 fixed a capture clobbering persisted state.
- **useQeubo.ts / knob-registry**: three fix commits on one day (2026-05-14: 3c8e59c, 2bf7e84, a7d337b), with 2bf7e84 explicitly closing a postmortem-documented category error (domain 'qeubo' conflated UX taxonomy with consumer identity).
- **BaseChart.vue**: 6 fix commits in four weeks at the Vue↔ECharts seam, including a same-day fix-of-a-fix (a1dd749 → 4c0c6a0, "empty-series clears via notMerge, not chartInstance.clear()") and a regression introduced by a perf change (4756c30 gated charts off the packet path; 69810e2 then had to default `active` to true).
- **auth-app/useAppBootstrap.ts**: 5 of 10 touches are fix commits (50%, the highest ratio of any file ≥10 touches) — boot ordering and hydration races; 5b57d25's resolution language is the model: "the race is structurally impossible, not just sequenced."
- **ForestDirectory / browse slot**: 3e11c38 (a per-writer gate) superseded one day later by fb0159a, whose body names the lesson: the slot had three producers and one indiscriminate clearer; "A per-writer gate covers one producer at a time; the correct shape is an owner."

### 4. Reverts and retirements

Exactly one explicit revert in frontend history (e94dfc5, a theme-variable substitution) — a forward-fix culture, consistent with the postmortem-then-remediate pattern above. Retirements are deliberate and healthy: 9ac3b34 retired the KataGo F-optimizer once upstream fixed #1197; 9c35a4b removed the legacy auth-key shim; 9949b28 dropped jQuery/jQuery-UI as dead weight (the commit claims −334 kB; per ADR-0009 that figure is the commit's, not independently verified) — notable mainly because a dead dependency survived until 2026-06-01.

### 5. Per-subsystem fix-to-total ratio

composables 33/150 (22%) > components 41/254 (16%) > services 12/81 (15%) > engine 5/39 (13%) > types.ts 9/90 (10%) > store 9/96 (9%) > `lib/` 0/22 (0%). The gradient matches the architecture's own claim that composables are "the real logic layer": stateful coordination absorbs the correction load, while the pure band (`lib/`) absorbed zero fix commits in 22 touches. Denominators are small and subject-flavour attribution is noisy, so treat as directional.

### Interpretation

Most fix load is concentrated where *shared mutable state meets multiple writers or multiple keyings*: caches keyed by composite hashes, slots with several producers, boot-time write ordering, and the reactive↔imperative ECharts seam. None of this looks like a wrong framework choice; it looks like one architectural misfit (the types.ts/defaults.ts hub coupling every feature to two monoliths) plus a recurring bug *class* (conflated keys/flags/ownership) that the codebase has repeatedly fixed point-wise and only recently begun fixing structurally (branded RawKey/EnrichedKey, slot `source` ownership, board-scope re-keying fb78e5a/87fbc3f/3e14d79).
````

**Findings (structured, verbatim):**

````json
[
 {
  "title": "types.ts is a 2362-line co-change hub coupling every feature arc",
  "evidence": "90 commit touches (top of frontend/src); co-changes with store/defaults.ts 46x, services/analysis-service.ts 18x, store/index.ts 14x; 45 commits touch the types.ts+defaults.ts+migrations.ts triple (e.g. fb78e5a, 5b57d25, 9ac3b34, 9d73d33). frontend/CLAUDE.md (Identifier map section) itself states the file 'mixes the identifier types in with value objects, state containers, and the GlobalStore schema'; IDENTIFIERS.md exists as a compensating lookup index.",
  "implication": "Refactoring opportunity: split types.ts along its existing seams (identifier brands / domain value objects / GlobalStore persisted-schema slices), ideally colocating each persisted slice's type with its default. This shrinks the blast radius of every feature diff and makes schema-affecting changes auditable per-domain instead of via a 2362-line hub. The compensating-index pattern (IDENTIFIERS.md) treats the symptom, not the structure.",
  "confidence": "high"
 },
 {
  "title": "Recurring bug class: composite keys and conflated flags on the analysis path",
  "evidence": "0792f9a (2026-06-08) stratified the analysis ledger after a single composite hash keyed palette-independent raw data, stranding overlays on palette swap; its body flagged the identical latent bug in stability-trajectory-store as out of scope, fixed same-day in 6cb99d3 ('palette-swap twin bug'). Earlier in the same file: 914d5e3 split isSnapshotMode into two independent flags; d8292a2 fixed a perf capture clobbering persisted proxy host/adaptive toggle. analysis-service.ts: 8 subject-level fix commits / 40 touches.",
  "implication": "Two lessons: (a) when a keying/conflation bug is found in one store, sweep all isomorphic per-(key,node) caches in the same arc — the twin was already named in the first commit's body; (b) refactoring opportunity: a single keyed-cache substrate (key derivation + branded key types + purge discipline in one module) rather than parallel ad-hoc stores each re-deriving keys. The branded RawKey/EnrichedKey move shows the structural fix works; the question is whether other caches still key by hand-rolled composites.",
  "confidence": "high"
 },
 {
  "title": "Multi-writer slots fixed by per-writer gates get re-fixed; owners stick",
  "evidence": "3e11c38 (2026-06-08) gated the forest browse policy on review ownership; fb0159a (2026-06-09) superseded it one day later, its body calling the gate 'the band-aid' and stating 'the per-board card-tree slot has THREE producers... but one clearer... A per-writer gate covers one producer at a time; the correct shape is an owner.' Same pattern resolved structurally in 5b57d25 ('the race is structurally impossible, not just sequenced').",
  "implication": "Candidate lesson, already partially institutionalized: for any GlobalStore cell or module cache with more than one writer, give the slot an owner/source stamp at design time rather than gating individual writers after a bug. A one-off enumeration pass over remaining multi-writer cells (the board-scope arc fb78e5a/87fbc3f/3e14d79 is this work in flight) would convert the lesson from reactive to proactive.",
  "confidence": "high"
 },
 {
  "title": "The Vue-reactive to ECharts-imperative seam is a correction hotspot",
  "evidence": "components/charts/BaseChart.vue: 6 fix commits / 23 touches (26%), including a same-day fix-of-a-fix (a1dd749 then 4c0c6a0, 'empty-series clears via notMerge, not chartInstance.clear()') and a perf change that introduced a rendering regression (4756c30 gated collapsed charts; 69810e2 restored the intermission chart by defaulting `active` to true). Sibling pair CardTreeWidget.vue <-> card-tree-echarts.ts co-changes 7x.",
  "implication": "Refactoring opportunity: consolidate the ECharts lifecycle contract (init/setOption merge semantics/clear/active-gating/dispose) into one tested adapter so each chart component stops re-negotiating notMerge/clear/active semantics individually. The fix-chain shape suggests the library boundary's semantics live in scattered call sites rather than one audited seam.",
  "confidence": "medium"
 },
 {
  "title": "Bootstrap/hydration ordering carries the highest per-file fix ratio",
  "evidence": "composables/auth-app/useAppBootstrap.ts: 5 fix commits in 10 touches (50%) — 3c8e59c, be67253, 254bf82, 5b57d25, 6cb99d3. 5b57d25 documents a fire-and-forget sync.connect() racing a getTags() write, resolved by moving server-derived cache out of the persisted profile so 'the two boot writes now target different fields'.",
  "implication": "Candidate refactoring: make boot phases an explicit ordered state machine (or at minimum document the write-ownership of each boot-time store field), and adopt 5b57d25's resolution standard — prefer making races structurally impossible (disjoint write targets, clear persisted-vs-derived classification) over sequencing them. A persisted-profile invariant ('user-authored data only') now exists; auditing remaining profile fields against it is cheap.",
  "confidence": "medium"
 },
 {
  "title": "Fix load concentrates in stateful composables; the pure band absorbed zero",
  "evidence": "Subject-level fix-touch ratios: composables 33/150 (22%), components 41/254 (16%), services 12/81 (15%), engine 5/39 (13%), store 9/96 (9%), lib 0/22 (0%). 65/390 non-merge frontend/src commits are fix-flavoured overall (17%).",
  "implication": "Directional support for the existing 'pure logic before effectful glue' posture: extracting decision logic from composables into pure, Tier-1-testable modules is the correction-load-reducing move the data favors. Caveat: small denominators and subject-flavour noise; lib/ is also younger and smaller, so this is a hypothesis to keep testing, not a proof.",
  "confidence": "medium"
 },
 {
  "title": "By-design churn is real and correctly bounded, but the schema-bump cadence is itself a signal",
  "evidence": "migrations.ts (66 touches) + archived-migrations.ts (25) implement the documented rolling archive (file header read in full; CURRENT_SCHEMA_VERSION = 59 at frontend/src/store/migrations.ts:110); locales move as a four-way mirror with identical fix lists; types/backend.ts is generated. ~59 schema versions accumulated between fc86761 (2026-04-27, schema versioning introduced) and 2026-06-08 (fb78e5a, schema 59).",
  "implication": "Exclude these files from symptom-churn dashboards, but note: ~1.4 schema bumps per day means nearly every feature mutates the persisted GlobalStore shape. That is partly the cost of persisting one whole blob; a periodic review of which state genuinely belongs in the persisted profile (5b57d25's persisted-vs-derived invariant generalized) could lower migration cadence and the per-PR archive-move ceremony without touching the append-only guarantee.",
  "confidence": "medium"
 },
 {
  "title": "Forward-fix culture with deliberate retirements; one dead dependency lingered",
  "evidence": "One explicit revert in all of frontend history (e94dfc5, theme-variable substitution). Deliberate retirements: 9ac3b34 (F-optimizer retired against upstream KataGo fix #1197), 9c35a4b (legacy auth-key shim removed), 9949b28 (jQuery/jQuery-UI dropped 2026-06-01; commit claims -334 kB — figure is the commit's, unverified per ADR-0009).",
  "implication": "Revert scarcity plus the postmortem-then-remediate chains (2bf7e84) indicate corrections land as understood fixes, not rollbacks — good for auditability. The jQuery case suggests a cheap periodic dead-dependency audit; workarounds with named retirement triggers (the F-optimizer pattern) do get retired, so naming the trigger at introduction time is the practice to keep.",
  "confidence": "high"
 }
]
````

**Coverage (verbatim):**

````
Read end to end this session: the umbrella /home/bork/w/omega/CLAUDE.md and /home/bork/w/omega/frontend/CLAUDE.md (both provided in full in context); /home/bork/w/omega/frontend/src/store/migrations.ts (all 214 lines); full commit messages of 0792f9a, 6cb99d3, 2bf7e84 (truncated at 22 lines — type-level fix and migration sections seen, tail not), 5b57d25 (first 30 lines, tail of guard section not), fb0159a (first 22 lines). Partially read (headers only, used only for their self-declared markers): frontend/src/types/backend.ts first ~40 lines (auto-generated banner). NOT read: frontend/src/types.ts content (a head command failed silently due to shell quoting — I rely only on its wc -l line count and frontend/CLAUDE.md's own characterization of it), defaults.ts, store/index.ts, analysis-service.ts, BaseChart.vue, useAppBootstrap.ts, and all docs referenced by commits (ADRs 0001-0010, handoff-current.md, the knob-registry and adaptive-deeper postmortems, board-scope.md, the ledger-keying consult note). Consequence of the gaps: my findings characterize those files/docs only through commit messages and churn metrics, not their current content — the proposed refactorings (types.ts split, ECharts adapter, keyed-cache substrate, boot state machine) are hypotheses that a content-level read could weaken or sharpen, and any ADR may already record a decision for/against one of them. Quantitative caveats: co-change pairs exclude 6 commits touching >=26 files; per-path counts undercount logical churn for files renamed mid-history (Toolbar, ForestDirectory, useReviewSession, useAppBootstrap — I report both paths where relevant); fix-flavour is subject-line based (65/390); the body-inclusive --grep figure (202/413) was computed but judged inflated. No performance properties asserted beyond figures attributed to commit messages (ADR-0009). No files modified; no database access.
````

### §1 · harvest:git-narrative

**Commission** (= `[SHARED: HARVEST-PREAMBLE]` + the following + `[SHARED: HARVEST-OUTRO]`):

````
Narrative git-history analysis. Read the FULL commit subject history (git log --oneline --reverse — about 1129 lines; read all of it). Identify the major arcs in order (e.g. pre-v1.0 sweep, tenancy, codegen, knob registry, capability negotiation, SELECTOR, perf arcs, keybindings, compression, qEUBO, doc-graph). For arcs relevant to the SPA, read the full bodies of the load-bearing commits (git log --format=full or git show). Extract:
1. Approaches tried then reworked or retired (e.g. anything named *retirement*, *rework*, *redo*, supersessions) — what does each teach?
2. Subsystems where the same conceptual problem was fixed more than once under different titles.
3. Architectural decisions that later commits had to work around (look for words like workaround, compat, shim, band-aid, interim).
4. The shape of the perf arcs: what classes of perf bug recurred, and did the structural prevention (ADR-0010) actually stop recurrence after 2026-05-31?
Quote commit hashes and subjects.
````

**Report (verbatim):**

````
NARRATIVE GIT-HISTORY ANALYSIS — LengYue frontend (1129 commits on main, 2026-04-26 → 2026-06-09)

Arcs in order. (1) Pre-v1.0 sweep (Apr 26–30): auth bootstrap (755c1f6), store-schema versioning + migration framework (fc86761), de-branding rounds with a localStorage compat shim (f319428), composable extractions (8eeb701, 5bd5d1b, 4605fc9), release-scope items 1–7, v1.0.0 close (0eec867). (2) qEUBO integration (7717332…c771f24), later renamed PBO (b35f70c) and absorbed by the knob registry. (3) Color SSOT theme arc A1–A4 (77ed65d…e2cf888) + cluster theme with one straight revert (e94dfc5). (4) Magic-literals audit Tiers 1–4 (ceddacf…952c402). (5) Resource-ownership audit O-series, PRs #118–#128, close-out 42cc073 (May 4). (6) Cards-tab merge, forest redesign, i18n, game-source dedup. (7) Analysis persistence (PR #166, 663a6a2) and the later compression v1/v2/quantized/hifi/xor ladder (670e... 6616fba, 189424e, 355b1e2). (8) Backend + frontend test arcs, Phases 0–5 each (v1.1.0). (9) Capability negotiation + SELECTOR consumption (760fe3c, May 10) with the isSnapshotMode split (914d5e3). (10) Knob registry (ab82c66…eb2ba) with two same-week postmortems (2bf7e84 domain category error; 854c0be popover band mismatch). (11) Engine-match bug pair (d62b51d, ec4cb3d, May 15). (12) F-optimizer built May 17 (9e982cd), retired May 25 against upstream KataGo #1197 (9ac3b34, ~2040 lines deleted). (13) Responsive arc, 23 iterations in one day (May 22). (14) SGF library + Alembic (d64a578, d0510af, one revert b1c6d4e). (15) The perf mega-arc: May 27 audit (c090d94) → four sequenced fixes (1e856fd, 0e9e377, 72351c2, 254bf82) → render-coupling postmortem naming a "recurring perf anti-pattern" (a437422, May 29) → analysis-panel seam Phases 0–3 → green-perf arc (throttle family, canvas rugplots, MiniBoard SSOT, memoization) → ADR-0010 named (5da97f1) and accepted with ADR-0009 (f46d35e, May 31), plus a mutation-verified render-count harness (d61b23b). (16) Keybindings Phases 1–5 (7c69abc…bb9c78f). (17) June discipline week: IO<T> effect-typing revert (3566b2c), structured ApiError ending six regex-reparse sites (5a88178) + lint guard G1 (a75814c), component→service boundary CI (35c939c), doc-graph artifact (31424f8), work-status → Postgres ACL (8d013bd), timing catalog (4fcea37). (18) Board-scope audit → forest-browse ownership bug (3e11c38), per-board forestNav re-scope (fb78e5a), teardown registry (3e14d79), ledger provenance stratification (0792f9a) + twin store fix (6cb99d3); thumbnail dock + MiniBoardCanvas texture-scope fix (2baf005, 463a15e, June 9).

Approaches tried then retired. The F-optimizer is the cleanest case: a substantial SPA-side characterization subsystem built around an upstream engine flaw, deleted wholesale when upstream fixed it — and its retirement migration itself needed a corrective step (48→49 fixing a path bug in 47→48). The IO<T> arc was reverted pre-merge after a consult found "laziness never spent (16/16 construct-and-run call sites)" — vocabulary without capability. The geiger activity dot was deleted when the capture harness measured it at ~479 renders/capture (34fa7a0). The SPA-side scoreLead kernel was removed as a duplicate of the proxy palette path, incidentally fixing a lingering-chart-chrome bug (0016fb8). Smaller: chartInstance.clear() replaced one day later by letting the general notMerge path absorb the empty case (a1dd749 → 4c0c6a0); a rAF claw-back inside 0792f9a "measured worse... and was rejected"; the work-status mechanism was reworked twice in a week (JSON+SQLite tooling → Postgres, 8d013bd, 890f57c); the merge-blocking checklist framing was tried and retracted (d83e71e). Compat shims (34b, auth-key) were bounded and actually removed on schedule (41a9c5d, 9c35a4b).

Problems fixed repeatedly under different titles. (a) Scoped-state teardown: the O-series audit (May 4), useCardThumbnail identity flip (793a832), tenancy instance-cache leak with IDENTITY_SCOPED_CACHES registry (b4df796 Bug D), then BOARD_SCOPED_STORE_CELLS (3e14d79) — hand-enumerated clears kept going incomplete until registries + completeness tests replaced them. (b) Analysis-ledger keying/cadence: rAF debounce (1c6a338), first-packet sync bump (21a3950), provenance stratification (0792f9a), and the explicitly named "palette-swap twin bug" in the stability store (6cb99d3). (c) Cursor-as-global-proxy: d62b51d and ec4cb3d (same scenario, two layers), 59365c8 (match cursor), 87f7dfc (P2 activeMainIndex). (d) Conflated dimensions / category errors: isSnapshotMode (914d5e3), domain 'qeubo'→'palette' (2bf7e84), knownTags in the persisted profile (5b57d25). (e) Hover/linger races: e3da471, b6d1cdb, 2baf005 + f1c5eb7.

Decisions later worked around. Container queries adopted in the responsive arc were partially backed out for perf (40bd22a de-CQ; ee2b652 had already patched a broken CQ with a wrapper). The keepMounted/v-show panel decision forced the collapsed-chart `active` gate (4756c30), whose own boolean-prop omission semantics broke the intermission chart (69810e2 — 4756c30's "other consumers safe" claim was wrong because Vue casts an omitted boolean prop to false). The ledger's blanket rAF coalescer needed a first-paint bypass (21a3950). `<script setup>`'s per-instance folding silently defeated "module-shared" caches (463a15e). The perf harness wrote through the production store and got an interim transient-override fix with the robust fix tracked separately (d8292a2, 2e363a0).

Perf-arc shape and ADR-0010's effect. Five recurring classes: render-coupling at composition nodes (the postmortem-named one), unthrottled subscriber projections (seven hand-rolled throttles, consolidated in a42fd54), O(N)-per-event work (0e9e377, ef48249), DOM-for-dense-visuals (canvas conversions a0b5d7a, 943cfec, 4fec6a1), and forced reflow (bcf1ac6, 40bd22a). After acceptance on 2026-05-31, no new render-coupling instance appears in the history: subsequent perf commits close pre-filed deferred items (4756c30, 40bd22a) or are validations whose messages report render/patch ≈ 1.00 batteries (0792f9a, 6cb99d3, e4b503f, 69810e2) — these are the commits' claims, not profiles I captured. However, the prevention machinery generated its own defects: the gate regression (69810e2), a first-cut forced-reflow regression caught in-PR by measurement (4fec6a1), and the texture-scope flash (463a15e). The observation window is only ~9 days, so "prevention holds" is a hypothesis with early supporting evidence, not a demonstrated property.
````

**Findings (structured, verbatim):**

````json
[
 {
  "title": "Scoped-state teardown was re-fixed four times before converging on registries + completeness tests",
  "evidence": "Resource-ownership audit O-series closed 2026-05-04 (42cc073, PRs #118–#128: 12cd38c, 3ca5fec, d79ceee, 3588d9e, c81f3f1, 2b0b91f, 18cee6e and siblings); useCardThumbnail identity flip 793a832; tenancy instance-cache leak fixed via IDENTITY_SCOPED_CACHES registry (b4df796, 2026-06-03); board-scope audit produced BOARD_SCOPED_STORE_CELLS (3e14d79, 2026-06-08) and the forestNav per-board re-scope (fb78e5a, O15).",
  "implication": "Hand-enumerated cleanup at mutation sites does not stay complete as state grows. The registry-drained-by-mutator + exact-set completeness-test pattern (3e14d79, b4df796) is the proven shape; remaining inline clears (closeBoard's board-derived purges, deliberately left inline per 3e14d79) and any new per-board/per-identity state are the next candidates. New scoped state should be born into a registry, not added to a clear list.",
  "confidence": "high"
 },
 {
  "title": "Composite-hash cache keying conflated provenance; the twin bug shows the class outlives the first fix",
  "evidence": "0792f9a (2026-06-08) stratified the analysis ledger into RawKey/EnrichedKey after palette swaps stranded byte-identical raw data; its body flags 'stability-trajectory-store has the same latent palette-swap bug', fixed next in 6cb99d3. Earlier cadence fixes to the same ledger: 1c6a338 (rAF debounce, 2026-05-03), 21a3950 (first-packet sync bump, 2026-05-15).",
  "implication": "Any (configHash, nodeId)-keyed cache should be audited for which key legs its contents actually depend on. The branded-key approach (wrong-key read = compile error) made both migrations compiler-checked and is the reusable refactoring shape — extend brands whenever a new keyed cache is added, and enumerate sibling caches at fix time (the twin was found only because 0792f9a's author looked).",
  "confidence": "high"
 },
 {
  "title": "Category-error flags recur and are expensive because they reach persisted state",
  "evidence": "914d5e3 split isSnapshotMode into hasConfigOverride + isRealtime ('baking in the false equivalence \"caller has overrides ⇒ caller doesn't want realtime\"'); 2bf7e84 corrected domain 'qeubo'→'palette' requiring migration 38→39 plus self-heal reconcile; 5b57d25 moved knownTags out of the persisted profile (server-derived cache, not user-authored data) requiring migration 57→58.",
  "implication": "Each conflation needed a schema migration to repair persisted blobs, not just a rename. Candidate discipline: when a boolean is derived from presence-of-X but gates behavior-Y, split and name both dimensions at introduction; when adding a field to a persisted slot, classify it user-authored vs server-derived first (the ProfileState invariant comment from 5b57d25 is the precedent).",
  "confidence": "high"
 },
 {
  "title": "Global cursor/active-path state used as a positional proxy caused four bugs",
  "evidence": "d62b51d (playEngineMatch counted path-length growth; descents into existing children don't grow it — 111 silent KataGo queries), ec4cb3d (buildAnalyzeQuery used root→leaf instead of root→current; same scenario, different layer, same day), 59365c8 (match cursor decoupled from user-visible cursor), 87f7dfc (P2: activeMainIndex projected from the board's own cursor).",
  "implication": "Functions that act at a position should take the position explicitly rather than reading global active-path/cursor state. ec4cb3d also notes the e2e harness only ran from fresh boards where current == leaf, so the equivalence held in tests — test fixtures should include pre-existing forward variation for any path-consuming API.",
  "confidence": "high"
 },
 {
  "title": "Perf-prevention machinery (ADR-0010) shows no render-coupling recurrence in 9 days, but generated its own defects",
  "evidence": "Post-2026-05-31 perf commits are backlog closures (4756c30, 40bd22a) or fixes shipping perf-battery null results per their messages (0792f9a, 6cb99d3, e4b503f, 69810e2: 'render/patch ≈ 1.00'). Defects from the prevention surface itself: 69810e2 — 4756c30's active gate broke the intermission chart because Vue casts an omitted boolean prop to false, contradicting 4756c30's 'other consumers safe' claim; 463a15e — MiniBoardCanvas 'module-shared' caches were actually per-instance (<script setup> folding), causing the texture flash; 4fec6a1's first cut introduced a forced-reflow regression caught in-PR by measurement.",
  "implication": "The render-count harness (d61b23b, mutation-verified) plus the before/after battery converted 'no regression' from assertion to evidenced claim — that is the auditability win to preserve. But perf escapes (canvas, gates, module caches) need their own guards: boolean-prop gates on shared components need explicit defaults + omitted-prop tests; module-scope intent in SFCs needs a runtime assertion or explicit plain <script> block. Recurrence-prevention is a hypothesis on a short window, not a settled property.",
  "confidence": "medium"
 },
 {
  "title": "Workarounds for upstream behaviour should be built retirement-first",
  "evidence": "F-optimizer: built 9e982cd (2026-05-17, adaptive bisection + persisted cache + Settings panel), retired 9ac3b34 (2026-05-25) against KataGo 1.16.5's fix of lightvector/KataGo#1197 — ~2040 lines deleted, and the retirement migration 48→49 had to correct a path bug in 47→48 that left a stamped v48 blob with the stale floor.",
  "implication": "The schema-walker made retirement feasible, but the migration defect shows retirement paths are themselves correctness surfaces. Candidate lesson: gate upstream-workaround subsystems behind a single seam (one constant/module) so deletion is a seam swap, and track the upstream issue in the work-status store at build time.",
  "confidence": "high"
 },
 {
  "title": "Abstraction-without-spent-capability gets reverted: the IO<T> arc",
  "evidence": "3566b2c (2026-06-01): IO<T>/Task<T> deferred-effect vocabulary reverted pre-merge; consult found laziness never spent at 16/16 call sites, the token contentless (no E/R/Scope), 1-of-~5-services inconsistency, and analysis-service being a stream not a task. Follow-ups declined neverthrow and Effect-TS (43e5eab, 5fe3a81) but kept the information-bearing leg: structured ApiError (5a88178) + lint guard G1 (a75814c).",
  "implication": "The decision record pattern (decided-against + revisit triggers, verbatim consult preserved) is what made the revert cheap and the surviving leg (typed errors) well-scoped. For future refactors: prefer the smallest information-bearing type change over a vocabulary migration; require at least one call site that spends the new capability before adopting it.",
  "confidence": "high"
 },
 {
  "title": "RCA-minted lint rules and CI gates are the project's effective recurrence-stoppers",
  "evidence": "a75814c (no error-message reparse, 0 hits measured before adoption at error severity), fe4b7eb (clear-needs-ownership — explicitly reversing an earlier \"not worth a lint\" call as 'lazy'; fires on the literal shape of the shipped bug, verified by reintroducing it), 35c939c (component→service boundary + CI as 'the absent reviewer'), d61b23b (render-count harness, zero-bound assertions mutation-verified), 6893996 (wire-type import boundaries).",
  "implication": "Each guard is best-effort syntactic with named gaps (per ADR-0002) and was verified against the original defect. Refactoring opportunities in this codebase should ship with a guard of this kind; conversely, recurring classes still guard-less (cursor-proxy bugs, category-error flags, per-instance-vs-module cache scope) are the obvious next lint/test targets.",
  "confidence": "high"
 },
 {
  "title": "Special cases tend to dissolve into the general path on the second fix",
  "evidence": "4c0c6a0: chartInstance.clear() special case (a1dd749, one day earlier) replaced by letting namesChanged→notMerge handle the zero-name set — 'no separate special case is needed'; 21a3950 justified its sync-bump branch by matching the existing purgeBoard/purgeAll bypass shape; a42fd54 collapsed seven hand-rolled throttles into one mechanism while keeping per-consumer logic.",
  "implication": "When patching an edge case, first check whether the general path can absorb it (or whether an existing documented bypass shape fits). The shared-mechanism extraction (a42fd54) deliberately avoided a global clock to keep fires phase-offset — consolidation of mechanism, not of timing — a good template for future de-duplication.",
  "confidence": "medium"
 },
 {
  "title": "Magic-literal/timing consolidation churned through a decision flip in 24 hours; the durable premise was 'co-location is not collapse'",
  "evidence": "9c35a4b (2026-06-03) settled scattered-timing as LEAVE; f79b1d7 (same day) re-opened it noting the inventory 'had only existed in the scouting run, not on disk' and that ADR-0008 was the wrong primary axis; 4fcea37 (2026-06-04) consolidated everything into a sectioned timing.ts catalog, collapsing only genuine duplicates. Earlier, the responsive arc needed in-arc magic-literal sweeps (eed865e iter-18, e3ce2c1 iter-19) for literals introduced in iters 1–15 of the same arc.",
  "implication": "Two lessons: decisions should be made against a durable on-disk inventory, not a one-shot search; and catalogs (timing.ts, theme tokens, z-index ladder) outlast sweep-style audits because sweeps race ongoing authoring. A lint nudge for raw literals in catalogued families would close the reintroduction loop the responsive arc demonstrated.",
  "confidence": "medium"
 },
 {
  "title": "Async show/hide UI state is a recurring race class; the fix shape is synchronous owner-state + derived rendering",
  "evidence": "b2c3a2c (hide suggestion labels on any hover), b6d1cdb (MintCardModal timer cleanup), e3da471 (popover hover finickiness — zero-gap + grace period), 2baf005 (dock the sidebar preview: 'the rendered snapshot is derived... never written asynchronously — so a leave can no longer race a late fetch', plus an 80px proximity invariant for the remaining floating thumbnail), f1c5eb7 (scroll/blur stranding backstops).",
  "implication": "Float-on-hover surfaces accumulated per-symptom patches until 2baf005 changed the architecture (docked + synchronous). Remaining floating/timed UI (tooltips, popovers) could be audited for the same shape: a single synchronous visibility owner, derived content, and one invariant-based backstop instead of stacked event-specific patches.",
  "confidence": "medium"
 },
 {
  "title": "A new stringly-typed discriminator was introduced the week after stringly contracts were banned",
  "evidence": "5a88178 + a75814c (2026-06-01) ended message-string reparsing as an ADR-0002 hazard; 0792f9a (2026-06-08) introduced persistence records discriminated by a 'self-describing configHash prefix (r:/e:)' — a string-prefix protocol on the storage path.",
  "implication": "Probably benign (single parse boundary, frontend-only), but it is the same genus the G1 RCA named: structure encoded in strings rather than types. Worth a small audit: if the prefix is parsed in more than one place or can collide with legacy hashes, promote it to a typed/versioned record shape like the v1/v2 bundle union (71005a6) used on the wire side.",
  "confidence": "low"
 }
]
````

**Coverage (verbatim):**

````
Read fully: the complete 1129-commit subject history via git log --oneline --reverse (all three segments read line-by-line, including the two persisted-output files); full commit bodies (git show -s) for 43 commits: 9ac3b34, 3566b2c, 0016fb8, 9c35a4b, 41a9c5d, e94dfc5, 890f57c, 4c0c6a0, d8292a2, 0792f9a, 6cb99d3, 3e11c38, fb78e5a, b4df796, 5b57d25, 254bf82, 21a3950, 914d5e3, ec4cb3d, d62b51d, 854c0be, 2bf7e84, c090d94, a437422, 5da97f1, f46d35e, d61b23b, a42fd54, 4756c30, 4fec6a1, 463a15e, e4b503f, 40bd22a, 4fcea37, 2baf005, 5a88178, a75814c, 35c939c, fe4b7eb, 3e14d79, 42cc073, 34fa7a0, 0e9e377, 760fe3c, 69810e2, a1a1b69, 8d013bd, e52dc4a, 1affccb, f79b1d7, 9e982cd, plus the merge subjects 663a6a2, dea289d, af9d845. Also read end-to-end: the umbrella CLAUDE.md (in-context). Skimmed/skipped: the bodies of the remaining ~1080 commits (subjects only — bodies could contain additional retired approaches or caveats I did not see); ALL referenced documents (ADR-0009, ADR-0010, the render-coupling and knob-popover postmortems, the perf audits, FILES.md, IDENTIFIERS.md, worklogs) were NOT read — every statement about them in this report is a citation of what commit messages claim, not of the documents' contents; if a postmortem's actual analysis differs from its commit summary, my characterization of the perf-arc classes and the ADR-0010 framing could be off. No source files were read, so findings name commit-level shapes, not current code state — some cited patterns may have since changed. Per ADR-0009, all quoted perf numbers (render counts, R/P ratios, percentages) are claims transcribed from commit messages, not freshly captured profiles. Nothing under backend/qeubo/ was read (subjects mentioning it were unavoidable in the log; no diffs or files opened). No files or databases were modified.
````

### §1 · harvest:postmortems

**Commission** (= `[SHARED: HARVEST-PREAMBLE]` + the following + `[SHARED: HARVEST-OUTRO]`):

````
Read EVERY file under /home/bork/w/omega/docs/notes/postmortem/ end to end (including README.md; there are ~8 files: adaptive-deeper-enrichment, knob-registry-qeubo-domain, knob-toolbar-popover, match-pre-existing-variation, pbo-claim-rehydration, render-coupling-at-composition-nodes, rca-discipline-lapses-2026-06-01). For each: the root cause; the structural fix proposed; whether that fix actually shipped (verify against current code under frontend/src, the ADRs, or the todo DB at psql -h 192.168.122.1 -d todo — read-only SELECTs only); residual risk; and the generalizable lesson. Then synthesize ACROSS them: which failure shapes recurred despite a postmortem naming them, and what does that say about which preventions work in this codebase (tenets + lint gates vs. prose recommendations)?
````

**Report (verbatim):**

````
## Postmortem corpus review — what shipped, what recurred, what prevents

### Per-document root causes and fix status

**adaptive-deeper-enrichment (2026-05-12).** Root cause: proxy-side — `analysis_enricher.on_query` popped `analysis_config` from the parent query's opaque, so adaptive sub-queries arrived unenriched; the SPA's `mergeKataExtra` correctly preserved stale `extra.state`. Fix status: the proxy fix shipped in v1.0.21 (umbrella CLAUDE.md proxy section names both interlocking causes). §5.1 wire-schema doc shipped (`docs/wire-schemas.md` exists); §5.2 runtime-visibility amendment shipped verbatim in umbrella CLAUDE.md "Asking before assuming". §5.3 wire diagnostic channel: no dispatch under `docs/dispatch/` — not pursued. §5.4 probe script: no `scripts/` dir, no `probe-wire` under `tools/` — not done. §5.5's `mergeRecords` inner-null sharp edge is still present (`frontend/src/services/analysis-ledger.ts:185-195` skips top-level null incoming values but a `{Win: null}`-bearing inner object still replaces a populated entry); additionally `mergeEnrichment` (lines 246-258) now runs with "NO visit gate" by documented tradeoff after the raw/enrichment stratification.

**knob-registry-qeubo-domain (2026-05-14).** Root cause: `'qeubo'` (a consumer identity) placed in the `KnobDomain` UX taxonomy; the implementer took the closest match through six commits. Fix shipped: `types.ts:521-526` now reads `'display'|'engine'|'review'|'palette'|'experimental'` with a comment citing the postmortem. The closest-match lesson codified as ADR-0002 Rule 7 (2026-05-15) and then ADR-0008 (2026-05-17).

**knob-toolbar-popover (2026-05-14).** Root cause: band-1 popover mounted inside the engine-gated metrics wrapper — closest-match against chrome neighbourhoods. Fix shipped: `Toolbar.vue:102` mounts `<ToolbarSliderPopover />` outside the gate, with a PR-#225-referencing comment at line 98 and a corrected SFC header. §7.3's mandatory pre-merge gate was amended same-day to a non-blocking template; `docs/pre-merge-checklist.md` shipped as a file (todo item `pre-merge-checklist-doc`, closed 2026-06-04) carrying §§7.1/7.2/7.4/7.5/7.6.

**match-pre-existing-variation (2026-05-15).** Root cause: two helpers (`getActiveVariationPath` root→leaf vs `getPath` root→current) chosen by intuition; plus a termination condition assuming path growth per iteration. Fixes + §5a docstrings shipped (`usePlayFromPosition.ts:224-236, 566-581`). §5b's codebase-wide call-site audit and the branded path types have no recorded closure (no todo item; 16 files still use `getActiveVariationPath`). §5c's rigor-proportionality rubric was never formalized anywhere — absent from the ADRs and the pre-merge checklist.

**pbo-claim-rehydration (2026-05-17).** Root cause: one-shot imperative binding from persisted `parameter_meta` to the ephemeral claims Map, racing SyncService hydrate; PR #250's migration tipped the margin. Fix shipped: `useQeubo.ts:414` guard + `useAppBootstrap.ts:179-180` watcher refire. §7.3's audit of other module-scope ephemeral state: no todo item, no worklog evidence of execution — and the same shape persisted in the same file: todo item `tags-fetch-hydration-race` (getTags racing un-awaited hydration in `useAppBootstrap`, latent since 2026-04-27) was only closed 2026-06-03, its fix options explicitly citing the qeubo watchers as "in-file precedent."

**render-coupling-at-composition-nodes (2026-05-29).** Root cause: orchestration nodes reading high-frequency reactive values; invisible at authoring/typecheck time; no named convention. Outcome is the corpus's clearest natural experiment: the postmortem alone did not prevent recurrence — `TreeWidget` reproduced the bug within days (ADR-0010 Context: "a doc that *describes* a pattern does not stop it recurring one component over"). Then Recommendation 1 shipped as ADR-0010 plus a render-count regression harness (`frontend/tests/integration/render-count/`), and Recommendation 2 shipped structurally: `AnalysisDashboard.vue` is now a provide/inject context provider whose header states it "reads no high-frequency reactive value in its own render."

**rca-discipline-lapses (2026-06-01).** Common root cause across stringly-typed errors and shipped-but-open docs: locally-reasonable acts whose defect exists only in aggregate, guarded only by one person's memory. Guards: G1 lint shipped (`eslint.config.js` `no-restricted-syntax` on `.message` reparse, adopted at `error`, 0 hits at adoption); ApiError shipped (commit `5a88178`, PR #318); G4 retire-on-ship is in CLAUDE.md; G5 shipped beyond the RCA's own proposal — a `todo` Postgres DB with CHECK constraints (`items_state_shape`) and an empty `work_status_violations` view. G2/G6 deferred per the RCA's own table; G3 (`only-throw-error`) not adopted (0 hits in eslint config).

### Synthesis — what actually prevents here

Failure shapes that recurred *after* a postmortem named them: (1) the documentation-companion/status gap — named in the qeubo postmortem, reproduced by PR #225 five days later, again in the match fixes (reactive authoring), again as Lapse 2; it stopped only when status moved into a constraint-checked database. (2) Render-coupling — recurred within days of a 300-line postmortem; stopped by tenet + harness + structural provide/inject. (3) One-shot-binding-vs-hydrate — the recommended audit was never executed and a same-shape race in the same orchestrator file outlived the postmortem by 17 days; this is the only recurring shape still without any mechanical net. (4) Closest-match — recurred within the same arc before codification; no observed recurrence after ADR-0008 + the checklist, though ADR-0008 itself concedes "there is no automated check."

The corpus's verdict on preventions is consistent: inline comments ("Brittle in principle" at reparse #1), merge-subject IOUs, and describing-only postmortems do not arrest recurrence; tenets paired with mechanical nets (lint rules, regression harnesses, DB constraints) and structural refactors that remove the tempting shape (ApiError, provide/inject context, reactive watchers, the status SSOT) do. The refactoring opportunities that follow are the named-but-unmechanized residues: branded path types for the root→leaf/root→current ambiguity, the module-scope-ephemeral-state sweep with a standard rebind idiom, a band-coherence mount-site check (ADR-0008 Revisit-when #4), the `mergeRecords` inner-null guard, and folding the rigor rubric into the existing checklist.
````

**Findings (structured, verbatim):**

````json
[
 {
  "title": "Describing-only postmortems demonstrably fail to prevent recurrence in this codebase; tenet+mechanism pairs and structural removal succeed",
  "evidence": "ADR-0010 Context (docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md, 'The render-coupling recurrence'): TreeWidget reproduced the pattern within days of docs/notes/postmortem/postmortem-render-coupling-at-composition-nodes-2026-05-29.md — 'a doc that describes a pattern does not stop it recurring one component over.' The doc-companion gap recurred at least three times after being named (qeubo postmortem -> PR #225 per popover postmortem §3.2 -> match postmortem §6 -> RCA Lapse 2). RCA §3: 'this project's characteristic failure mode is the invisible-at-authoring-time, visible-only-in-aggregate defect, against which its heavy policy discipline is structurally weak and only mechanical nets help.' Verified shipped nets: eslint no-restricted-syntax on .message reparse (frontend/eslint.config.js ~lines 293-330), render-count harness (frontend/tests/integration/render-count/), todo DB CHECK constraints + empty work_status_violations view, AnalysisDashboard.vue provide/inject refactor (header, lines 1-18).",
  "implication": "Refactoring effort aimed at correctness/auditability should be spent converting the remaining prose disciplines into compile-time, lint, harness, or DB-constraint enforcement — not on writing more guidance prose. Every prevention that worked here is either a type/structure change or a mechanical gate.",
  "confidence": "high"
 },
 {
  "title": "The one-shot-binding-vs-hydration race is the only recurring failure shape still without a mechanical or structural net, and its recommended audit was never executed",
  "evidence": "postmortem-pbo-claim-rehydration-2026-05.md §7.3 recommends auditing module-scope ephemeral state with persisted SSOT (naming analysisService maps, analysisLedger, useQueryTelemetry as candidates); no todo-DB item or worklog records that audit. The same shape persisted in the same file: todo item tags-fetch-hydration-race (closed 2026-06-03) describes getTags() racing un-awaited hydration in useAppBootstrap.ts, latent since 2026-04-27, with fix options citing 'in-file precedent: the qeubo reconcile / rehydrateExperimentClaims watchers.' The PBO fix itself shipped (useQeubo.ts:414 guard; useAppBootstrap.ts:179-180 watcher).",
  "implication": "A focused sweep of module-scope state rebound from persisted truth, plus a named idiom (reactive watch with immediate:true, or a SyncService.whenHydrated() barrier), is the highest-value open correctness refactor the corpus points at. A lint heuristic flagging store.profile reads inside one-shot bootstrap callbacks would mechanize a slice of it.",
  "confidence": "high"
 },
 {
  "title": "Postmortem recommendations that stayed prose-only did not ship: rigor rubric, ephemeral-state audit, wire diagnostic channel, probe script, G3/G6",
  "evidence": "Match postmortem §5c's four-axis rigor rubric appears in no ADR, not in docs/pre-merge-checklist.md (read in full), and only in the postmortem + its worklog (grep across docs/). Adaptive postmortem §5.3's diagnostic channel: no matching file in docs/dispatch/ (directory listed). §5.4 probe script: no scripts/ dir; tools/ contains only doc-graph and work-status. RCA G3 (only-throw-error): 0 occurrences in frontend/eslint.config.js. G2/G6 deferred per the RCA's own feasibility table.",
  "implication": "These are the live candidates for the review's refactoring backlog — but the corpus predicts they will not happen unless filed as todo-DB items or converted to mechanism. Cheapest first move: fold the rigor rubric into pre-merge-checklist.md as a section G, since the checklist is the surface trusted sessions already consult.",
  "confidence": "high"
 },
 {
  "title": "The root->leaf vs root->current path ambiguity is fixed at two call sites but unaudited codebase-wide; branded path types remain unbuilt",
  "evidence": "Fixes + warning docstrings landed in frontend/src/composables/board/usePlayFromPosition.ts (lines 224-236: buildAnalyzeQuery uses getPath with an explicit warning off getActiveVariationPath; lines 566-581: iteration-count termination). Match postmortem §5b's audit ('grep every site, name intent, replace where root->current is right') has no todo-DB closure; 16 files under frontend/src still use getActiveVariationPath. §5b's 'optional intensification' — branded RootToLeafPath / RootToCurrentPath types — was never done, despite the proxy having executed exactly this style of migration (v1.0.21 identity branding, per umbrella CLAUDE.md).",
  "implication": "Branded path types are a small, precedented type-level refactor that converts a documented intuition trap into a compile error (ADR-0002 loudness level 1). The 16-file usage list is the audit's worklist.",
  "confidence": "medium"
 },
 {
  "title": "The mergeRecords inner-null sharp edge flagged in 2026-05-12 is still present, and the enrichment merge has since lost its visit gate by documented tradeoff",
  "evidence": "Adaptive postmortem §5.5 flagged that mergeRecords guards top-level null values but not inner null-bearing objects replacing populated entries. Current frontend/src/services/analysis-ledger.ts:185-195 has the identical guard shape. The post-stratification mergeEnrichment (lines ~246-258) is documented as 'additive, last-writer-wins per leaf, NO visit gate... Acceptable because enrichment is ~monotone and the accumulator's last-path-order-wins arbitration already tolerates minor disagreement.'",
  "implication": "Candidate correctness refactor per ADR-0002 Rule 4 (validate, not coerce): reject or warn on null-bearing inner enrichment values at the merge boundary instead of silently overwriting. Low urgency (no observed incident since), but it is a named sharp edge with a 4-week paper trail and no guard.",
  "confidence": "medium"
 },
 {
  "title": "Classification discipline (closest-match) was codified twice and its fixes verified, but ADR-0008's own mechanization trigger (band-coherence mount-site check) is unbuilt",
  "evidence": "KnobDomain corrected in frontend/src/types.ts:521-526 with postmortem-citing comment; Toolbar.vue:102 mounts the popover outside the v-if='isConnected' wrapper with a rationale comment at line 98; ToolbarSliderPopover.vue header lines 8-15 record the corrected placement. ADR-0008 (read in full) Consequences: 'Discipline is policy, not mechanism... no automated check'; Revisit-when #4 names 'a band-coherence at mount sites check for Vue SFCs' as the mechanization trigger. The pre-merge checklist carries it only as a manual tick (section B).",
  "implication": "Given the corpus-wide evidence that only mechanization arrests recurrence, a lint/script that cross-references an SFC's band tag (FILES.md or header) against conditional wrappers at its mount sites is the named-but-unbuilt guard with the strongest pedigree — it would mechanize the substitution-test-calibrated worst case (an always-on surface silently gated).",
  "confidence": "high"
 },
 {
  "title": "The work-status Postgres SSOT is the corpus's validated auditability pattern: invariants as constraints adjacent to the data",
  "evidence": "RCA Lapse 2 (Findings 2a-2e) showed three prose docs independently asserting stale status and the doc-graph structurally blind to semantic staleness (commit-distance only). G5 shipped as the todo DB: items_state_shape CHECK constraint enforces open-implies-disposition / closed-implies-resolution+date; work_status_violations view returned 0 rows when queried this session; umbrella CLAUDE.md records 'RCA guard G5, now in force' and demotes docs/TODO.md to a projection.",
  "implication": "The pattern generalizes: where a doc-graph fact is checkable (status, cross-reference resolution), move it into a constraint-checked store or CI gate and let prose carry only relations. A candidate extension: record postmortem recommendations as todo-DB items at filing time, so 'recommendation made but never executed' (the §5c/§7.3 fate) becomes a queryable open item instead of buried prose.",
  "confidence": "high"
 }
]
````

**Coverage (verbatim):**

````
Read end to end this session: all 8 files under /home/bork/w/omega/docs/notes/postmortem/ (README.md, postmortem-adaptive-deeper-enrichment-2026-05.md, postmortem-knob-registry-qeubo-domain-2026-05.md, postmortem-knob-toolbar-popover-2026-05.md, postmortem-match-pre-existing-variation-2026-05.md, postmortem-pbo-claim-rehydration-2026-05.md, postmortem-render-coupling-at-composition-nodes-2026-05-29.md, rca-discipline-lapses-2026-06-01.md); docs/adr/0002-fail-loudly.md; docs/adr/0008-classification-discipline.md; docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md; docs/pre-merge-checklist.md. The umbrella CLAUDE.md was provided in full in the session context. Todo DB: schema (items table), invariant view, and targeted read-only SELECTs (not an exhaustive dump). Code files (partial, targeted verification reads, cited with line numbers from actual reads): frontend/eslint.config.js (lines ~100-330 region + greps, not whole file), frontend/src/services/analysis-ledger.ts (lines 60-260), frontend/src/composables/board/usePlayFromPosition.ts (grep + targeted lines), frontend/src/components/charts/AnalysisDashboard.vue (header + first 60 lines), frontend/src/types.ts (lines 510-530), Toolbar.vue / ToolbarSliderPopover.vue / useQeubo.ts / useAppBootstrap.ts (grep-level fix-site verification only). NOT read (named gaps): docs/wire-schemas.md (existence verified only — I make no claim about its content adequacy); frontend/CLAUDE.md (the claim that it carries a render-locality section comes from ADR-0010's Related section plus a grep hit, not my own end-to-end read); ADR-0003/0005/0009 (referenced only through what the fully-read documents say about them); the worklogs and audit/consult docs the postmortems cite (e.g. opus-audit-green-perf-arc-2026-05-31.md, the perf audits, 2026-05-17-pbo worklog); docs/handoff-current.md; FEATURES.md. What the skipped portions might affect: an unread worklog could record that the match §5b call-site audit or the PBO §7.3 ephemeral-state audit was in fact executed without a todo-DB trace, which would weaken findings 2 and 4's 'never executed' claims (I framed those as absence-of-recorded-closure); wire-schemas.md's content could be thinner than the §5.1 recommendation intended, which my 'shipped' classification would overstate. No performance properties are asserted anywhere; the one perf-adjacent claim (render-coupling fixes) is reported as the postmortem/ADR's own profiled finding, not mine. Nothing under backend/qeubo/ was read; no writes were made to any file or database.
````

### §1 · harvest:audits

**Commission** (= `[SHARED: HARVEST-PREAMBLE]` + the following + `[SHARED: HARVEST-OUTRO]`):

````
Read EVERY file under /home/bork/w/omega/docs/notes/audit/ end to end (README.md plus ~7 audits: spa-board-scope-consistency-2026-06-05, stringly-typed-contracts-2026-06-01, work-status-liveness-2026-06-02, opus-audit-green-perf-arc-2026-05-31, perf-audit-game-scroll-2026-05-28, perf-audit-nav-and-pv-hover-2026-05-27, perf-audit-range-query-nav-2026-05-29). Extract per audit: open findings vs fixed vs deferred, and any explicit follow-up that has not landed (verify against current code / the todo DB, read-only). Then synthesize the meta-lesson: WHERE does this codebase resist audit (what did the auditors have to reconstruct by hand, what was stringly-typed or implicitly coupled), since auditability-for-humans is exactly the axis this review optimizes.
````

**Report (verbatim):**

````
## Audit-corpus review: docs/notes/audit/ (8 files, all read end to end)

### Per-audit disposition

**perf-audit-nav-and-pv-hover-2026-05-27** (Bugs A/B/C, four-fix plan). All four fixes verifiably landed: rAF-coalesced keydown (`frontend/src/composables/useUserIORegistry.ts:72-126`), the O(1) `boardsById` lookup (confirmed by the 05-28 audit's ADR-0004 section), the PV fingerprint guard (`frontend/src/components/board/MoveSuggestions.vue:135-157`, citing Bug C), and per-board auto-save watchers (`useAutoSaveAnalyses.ts:100` `boardWatcherStops`, matching the audit's implementation sketch). Yet both symptom items remain open/active in the todo DB — `many-boards-open-slowness` and `pv-hover-jank-range-query` — and **neither carries a single `refs` row**; the latter's description says "cause unclear … missed during the last perf session" although a written diagnosis exists and a fix citing it shipped. The incidental finds ("Follow Me" watcher unthrottled, `scheduleWindow` timer wipe) have no visible tracking.

**perf-audit-game-scroll-2026-05-28** (regime A). Arc 1 + Arc 2 shipped (PR #294 per the 05-29 audit). The doc preserves a regime-confusion correction in situ — a recurring, healthy pattern in this corpus.

**perf-audit-range-query-nav-2026-05-29** (regime B). RB-1 and RB-2 closed/shipped in the todo DB (RB-2 via PR #329; regression test `tests/integration/BaseChart-collapsed-gate.test.ts` exists); RB-3 dropped with a measured disproof recorded inline. Parent `nav-during-range-query-perf` correctly open with an explicit residual ("re-profile wanted") and a `refs` row pointing at this audit — the model the 05-27 items lack.

**opus-audit-green-perf-arc-2026-05-31.** Its prevention agenda mostly landed: P1 → ADR-0010 exists and encodes both rules plus the "memo fixes the patch, not the render" corollary verbatim (read end to end); P2 → the imperative-escape pattern is a sanctioned section in `frontend/CLAUDE.md`; P3 → ESLint now exists (`frontend/eslint.config.js`: import boundaries, error-message-reparse guard, custom `clear-needs-ownership` rule) and gates CI; P5 → ADR-0009's metric vocabulary now carries the render+patch ranking bullet (lines 211-219; read end to end). P4 landed **partially**: `tests/integration/render-count/` covers BoardTab and TreeWidget only, not the timeline or ChartPreviewBox the audit named — and ADR-0010:169 cites the harness at `tests/integration/render-locality/`, a path that does not exist. Of the remaining levers: MiniBoard gained a canvas renderer (commit `4fec6a1`) with the lifecycle consolidation tracked open (`thumbnail-render-lifecycle-consolidation`); collapsed-charts closed; de-CQ closed/shipped; but **`useStabilityMetrics` is still the O(path)-per-recompute `computed`** (`useStabilityMetrics.ts:103`) and **no work-status item tracks it** (DB sweep for stability/accumulator/incremental items returns nothing relevant).

**audit-stringly-typed-contracts-2026-06-01.** Zero new findings; the six PR #318 sites re-verified fixed. Its residual #1 (vestigial `ApiError.message` format + missing gate) was substantially discharged: a `no-restricted-syntax` guard against `.message` reparse landed at `error` severity (`eslint.config.js:306-330`, rationale citing RCA G1), and `stringly-typed-api-errors` is closed/shipped 2026-06-01. The back-compat message string itself survives (`api-client.ts:32`) — guarded, but still a zero-reader contract.

**audit-work-status-liveness-2026-06-02.** All four recommendations applied in the (since-migrated) Postgres store: `single-cte-per-pipeline-run` closed/shipped; `classification-discipline-tenet-rule7-relocation` closed/superseded; `consolidate-recursive-cte` closed/shipped (maintainer judged the dead-code residual out of scope); the unresolvable `frontend/c2.2-use-dirty-board-guard` refs now point at commit `5bd5d1b`. `SELECT count(*) FROM work_status_violations` → 0. The audit's inherent residual stands: squash-to-`initial` history prevents dating/attributing landings — the in-code "Item 30c/30d" tags were what made liveness checkable at all.

**audit-spa-board-scope-consistency-2026-06-05.** P0 landed (schema 59 re-scopes `forestNav.selection` to `PerBoard<NavSelection>`, `types.ts:1603-1623`); P1 landed (`PerBoard<T>` at `types.ts:103`, `frontend/docs/notes/board-scope.md` exists, `BOARD_SCOPED_STORE_CELLS` at `store/index.ts:309`); P2 landed (`useAnalysisProjection.ts:43-50`, comment citing "board-scope audit P2"); the eventual fix went beyond the audit's stopgap analysis to a producer-ownership lint rule. The item is still open/active (refs include PR #357) — plausibly deliberate, but it wears the "shipped-but-open" signature the liveness audit hunts.

### Meta-lesson: where this codebase resists audit

Every audit's cost concentrated in **reconstructing implicit coupling that neither types nor names carried**: (1) reactive render topology — render-coupling is statically invisible; the green arc proved even a written postmortem didn't stop recurrence, and the analysis itself mis-ranked costs until `patch` was aggregated alongside `render`; (2) state scope — per-board vs workspace-global was folklore until the inventory table was built by hand; (3) string-encoded contracts — swept only by multi-pass grep with honestly-named blind spots; (4) work-status truth — prose-asserted, ground-truthed item-by-item against git/gh/code, with squashed history as a permanent wall. The project's consistent and demonstrably effective response is to convert audit prose into *named, greppable, mechanically-checked artifacts*: tenets (ADR-0009/0010), type aliases (`PerBoard<T>`), registries (`BOARD_SCOPED_STORE_CELLS`), lint rules, render-count tests, a constraint-checked status DB. The refactoring opportunities this corpus suggests are exactly the unfinished instances of that move: the untracked `useStabilityMetrics` lever, the half-built render-count harness, refs-less open items whose diagnoses already exist, the vestigial ApiError message format, and the rot-prone code→doc / doc→code-path references the doc-graph gate cannot see.
````

**Findings (structured, verbatim):**

````json
[
 {
  "title": "Audit-named follow-up with no tracking item: useStabilityMetrics still O(path)-per-recompute",
  "evidence": "opus-audit-green-perf-arc-2026-05-31.md §(c)#3 names it 'the same treatment applies and is the next step'; frontend/src/composables/analysis/useStabilityMetrics.ts:103 is still a computed<TurnStabilityMetric[]> walking the variation path; todo-DB sweeps (items matching stability/accumulator/incremental) return no tracking item.",
  "implication": "Either apply the proven EnrichedAccumulator pattern (equivalence-test discipline already worked once) or record an explicit drop. Meta-lesson: an audit's 'remaining levers' section needs a mechanical sweep into the work-status store, or named follow-ups silently evaporate. Any perf benefit is a hypothesis needing a profile per ADR-0009.",
  "confidence": "high"
 },
 {
  "title": "Open perf items disconnected from their written diagnoses (refs-less, 'cause unclear')",
  "evidence": "todo DB: pv-hover-jank-range-query (open/active, description 'cause unclear') and many-boards-open-slowness (open/active) have zero refs rows, while perf-audit-nav-and-pv-hover-2026-05-27.md diagnosed both (Bugs C and A) and all four planned fixes verifiably landed (useUserIORegistry.ts:72-126; MoveSuggestions.vue:135-157; useAutoSaveAnalyses.ts:100). Contrast: nav-during-range-query-perf carries a design-note ref to its audit.",
  "implication": "Re-profile the two symptoms (ADR-0009), then close or re-describe; institute a norm that an open item created near a diagnosis doc gets a refs row to it. Without the link, the next investigator re-derives a diagnosis the repo already paid for — the exact reconstruction cost this review optimizes away.",
  "confidence": "high"
 },
 {
  "title": "Prose-to-mechanism conversion is the corpus's proven high-leverage pattern — and it has unfinished instances",
  "evidence": "Landed: ADR-0010 (both rules + corollary verbatim), ADR-0009 render+patch ranking bullet (lines 211-219), ESLint host with error-message-reparse guard (eslint.config.js:306-330) and producer-ownership rule, PerBoard<T> (types.ts:103), BOARD_SCOPED_STORE_CELLS (store/index.ts:309), board-scope.md, Postgres work-status store with empty work_status_violations. Unfinished: read-locality lint heuristic (ADR-0010 Revisit #1), render-count harness covers 2 of 4 recommended components.",
  "implication": "The review's refactoring lens should prioritize completing these mechanizations (lint heuristic, harness coverage for timeline/ChartPreviewBox-or-MiniBoard) over new micro-perf work: each one converts a profile-only or folklore property into a CI-checkable one — pure auditability gain.",
  "confidence": "high"
 },
 {
  "title": "Cross-reference rot in surfaces the doc-graph gate cannot see (code→doc and doc→code-path)",
  "evidence": "ADR-0010:169 cites tests/integration/render-locality/ — actual directory is tests/integration/render-count/. MoveSuggestions.vue:~144 cites docs/notes/perf-audit-nav-and-pv-hover-2026-05-27.md — the file moved to docs/notes/audit/. The audit README declares audits are not retro-edited (archive-style), so their own outbound refs freeze by design, but inbound pointers from code and ADRs rot silently.",
  "implication": "Candidate small refactor: extend the doc-graph validator (or a lint pass) to check doc→code-path and code-comment→doc references, or adopt retrofit-on-touch for these pointers. Stale pointers are precisely what forced auditors to re-verify every file:line citation by hand.",
  "confidence": "high"
 },
 {
  "title": "Vestigial ApiError back-compat message format survives with zero readers (now lint-guarded)",
  "evidence": "audit-stringly-typed-contracts-2026-06-01.md residual #1; frontend/src/services/api-client.ts:32 still composes 'API Error <status>: <body>'; the no-restricted-syntax guard (eslint.config.js:306-330, adopted at error, 0 hits at adoption) closes the re-introduction hazard; item stringly-typed-api-errors closed/shipped 2026-06-01.",
  "implication": "Optional cleanup: demote the message to an explicitly display-only string (drop the parse-shaped format or document it as non-contractual at the throw site). Small auditability gain — removes the last 'public contract with zero in-repo readers' the audit had to reason about.",
  "confidence": "medium"
 },
 {
  "title": "Work-status liveness corrections fully applied; in-code work-item tags were the audit's strongest substrate",
  "evidence": "todo DB: single-cte-per-pipeline-run closed/shipped; classification-discipline-tenet-rule7-relocation closed/superseded; consolidate-recursive-cte closed/shipped; broken c2.2 refs now commit 5bd5d1b; work_status_violations empty. The audit's §5 records that squash-to-initial history blocked dating/attribution, and that code comments tagged 'Item 30c'/'Item 30d' were what made presence verifiable.",
  "implication": "Codify the convention the audit relied on: tag landing sites in code with the work-status item id. It is the only audit substrate that survives squashed history, and it costs one comment per landing.",
  "confidence": "high"
 },
 {
  "title": "spa-board-scope-consistency-audit open while P0/P1/P2 are verifiably shipped — the 'shipped-but-open' signature",
  "evidence": "types.ts:1603-1623 (schema 59 re-scope, P0), types.ts:103 PerBoard<T> + frontend/docs/notes/board-scope.md (P1), useAnalysisProjection.ts:43-50 with a comment citing 'board-scope audit P2'; store/index.ts:309 BOARD_SCOPED_STORE_CELLS (P1b shape). Item still open/active in the todo DB with a PR #357 ref.",
  "implication": "Possibly deliberate (residual P3/stopgap-removal or pending maintainer review), but it matches exactly the drift class the 2026-06-02 liveness audit exists to catch; worth a maintainer status check. If residuals remain, narrow the description to them.",
  "confidence": "medium"
 },
 {
  "title": "Meta: audits succeed where corrections are preserved in situ; the corpus models the practice",
  "evidence": "perf-audit-range-query-nav-2026-05-29.md keeps RB-2's 'count-effective, frame-inert' and RB-3's 'measured, NOT a bottleneck' UPDATE blocks inline; the green-arc audit documents three retrospective self-corrections preserved rather than overwritten; the 05-28 audit records its regime-confusion correction.",
  "implication": "Preserve this convention in the review's own outputs: corrections appended in place are what let a later reader audit the audit. The one timing criticism the green-arc audit makes (verdicts authored before captures) is the residual discipline gap ADR-0009's trigger list now addresses.",
  "confidence": "high"
 }
]
````

**Coverage (verbatim):**

````
Read END TO END this session: all 8 files under /home/bork/w/omega/docs/notes/audit/ (README.md; audit-spa-board-scope-consistency-2026-06-05.md; audit-stringly-typed-contracts-2026-06-01.md; audit-work-status-liveness-2026-06-02.md; opus-audit-green-perf-arc-2026-05-31.md; perf-audit-game-scroll-2026-05-28.md; perf-audit-nav-and-pv-hover-2026-05-27.md; perf-audit-range-query-nav-2026-05-29.md); docs/adr/0009-performance-investigation-discipline.md; docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md; umbrella CLAUDE.md and frontend/CLAUDE.md (provided in full in context). Partial/targeted code reads (verification greps and excerpts, not full-file reads): frontend/eslint.config.js (header + two rule blocks), src/services/api-client.ts (grep), src/components/board/MoveSuggestions.vue (lines ~120-175 + greps), src/composables/analysis/useStabilityMetrics.ts (header + grep), src/composables/analysis/useAnalysisProjection.ts (lines 30-89), src/types.ts (forestNav/PerBoard regions), useAutoSaveAnalyses.ts / useUserIORegistry.ts / store/index.ts (greps only), tests/integration listings. Todo DB consulted read-only (SELECTs on items/refs/work_status_violations). NOT read: the postmortems, RCAs, worklogs, board-scope.md, consult records, and doc-graph artifacts the audits cite — I assert only their existence/paths (filesystem facts) or what the documents I did read say about them, not their content; if the review needs their internals (e.g., the render-coupling postmortem's typing analysis, RCA G1's full guard list), those are unread gaps. I did not exhaustively confirm whether the 05-27 audit's incidental finds (Follow-Me throttle, scheduleWindow timer wipe) are still live in code — flagged as unverified. No performance property is asserted anywhere; all perf-relevant follow-ups are framed as hypotheses needing captures per ADR-0009. backend/qeubo/ untouched per the licensing firewall.
````

### §1 · harvest:retros

**Commission** (= `[SHARED: HARVEST-PREAMBLE]` + the following + `[SHARED: HARVEST-OUTRO]`):

````
Read end to end: every file under /home/bork/w/omega/docs/notes/retrospective/ (README, release-retrospective-2026-05, retrospective-doc-consolidation-2026-06, retrospective-katago-f-optimizer-2026-05, retrospective-phase3.5-learned-vf-2026-05, retrospective-phase3-policy-benchmark-2026-05), plus /home/bork/w/omega/docs/notes/green-perf-arc-retrospective-2026-05-31.md, /home/bork/w/omega/docs/notes/green-perf-arc-branch-inventory-2026-05-31.md, and /home/bork/w/omega/docs/archive/notes/release-retrospective-2026-04.md. Extract: stated lessons; intentions declared but not yet executed (verify liveness against code or the todo DB, read-only SELECTs); and any place a retrospective contradicts the current state of the tree. Focus on frontend-relevant material; proxy-internal benchmark detail only insofar as it teaches an SPA-side lesson.
````

**Report (verbatim):**

````
## Retrospective-genre evidence pass — what the retros teach, what they promised, and where they now diverge from the tree

All six files under `docs/notes/retrospective/`, the two green-perf notes, and the archived v1.0.0 retro were read end to end; declared intentions were liveness-checked against the tree and read-only SELECTs on the `todo` Postgres DB.

**Stated lessons (the durable ones).** The two release retros carry the architectural trio: fail-loudly as a cross-register tenet (ADR-0002 Rule 6 ↔ ADR-0005 Rule 8 pairing), resource-ownership at mutation sites (cleanup belongs at the mutation site, not framework GC — now codified in `frontend/CLAUDE.md` and pinned by integration spies), and "literals as `as any`" (single source per nominal handle). The v1.1.0 retro's honest reading of the frontend testing arc — zero production bugs because branded IDs + discriminated unions + the ACL already police the typecheck-able class; tests buy the *behaviour* class — is a calibration the review should preserve. The doc-consolidation retro adds: derived-vs-authored generation direction is load-bearing for what kind of CI gate a document gets, and advisory-not-gate with a silence valve is the right shape for mechanized judgments. The research retros (F-optimizer, Phase 3, Phase 3.5) teach the analytic-firewall pattern (fresh-context agent on raw data; it caught pseudo-replication, the MAX-rule misframe, and an RL goose chase), "a universal constant in a configuration-dependent space is a coin flip with bias" (the 35 ms floor was net-zero and harmful on half the measured cells), and the validation discipline that cut a 0.93–0.97 in-distribution claim to a defensible 0.85–0.90. The green-perf retro's revised verdict — per-interaction latency and sustained frame-ceiling are different axes; aggregate both `render` and `patch` marks; render≫patch is the render-coupling tell — was institutionalized verbatim into ADR-0010 and `frontend/CLAUDE.md`'s imperative-escape pattern. That lessons→ADR pipeline demonstrably works for architectural lessons.

**Intentions executed (liveness confirmed).** Frontend CI landed 2026-06-01 (`.github/workflows/frontend-ci.yml`). qEUBO e2e validation, backend CTE consolidation (3 items), and the tree-DSL hyperparameter harness (`FEATURES.md:318`, `[experimental]`) are closed/shipped in the todo DB or visible in the tour. The F-optimizer retirement executed exactly: floor = 0.001 (`frontend/src/lib/timing.ts:327`), cohort deleted. Phase 3.5's "ship learned VF as opt-in" proposal shipped (`store/defaults.ts:75-84`, `valueBinding: ''` default). The green-perf "MiniBoard/preview" lever was pursued (PRs #336/#366/#367; `de-cq-preview-hide` closed); the `useAutoSaveAnalyses` flakes were fixed (PR #319); `green-integration` merged (PR #312).

**Intentions declared but not executed — and mostly untracked.** The sharpest finding: the KeepAliveMiddleware contract revision (25 s message-level idle punishes patient clients; TCP/WS liveness proposed) is filed in *two* retrospectives "for a follow-up dispatch in `proxy/docs/dispatch/`" — that directory does not exist, no todo-DB item matches, and `proxy/middleware/keep_alive.py`'s log shows no contract change. Likewise Phase 3.5's "immediate, before SPA integration" diverse-corpus retraining never ran (`~/benchmark_allocation/` has nothing newer than 2026-05-18), the SPA integration shipped via the opt-in escape hatch instead, and neither the retraining nor the lcb_spread apples-to-apples asterisk is tracked anywhere queryable. The doc-consolidation loose ends split: proxy-pin prose fixed, the central services home executed off-tree (`services_local.gitignore`) per the retro's own reasoning, but `postmortem/`→`incident/` and the onboarding-doc question are neither done nor SSOT-tracked. Distribution packaging — the named leading edge in *both* release retros — remains open/future. The structural lesson: G5's SSOT guards status of items that *enter* the store; retrospective roadmap sections are an intention-capture surface with no gate, the inverse of the failure the 2026-06-01 RCA fixed.

**Retros contradicting the current tree.** The doc-consolidation retro's central artifact (`docs/work-status.json`) no longer exists — superseded by the `todo` Postgres DB per `tools/work-status/schema.sql` — and the retro carries no inline dated note despite its own header inviting them. The F-optimizer retirement section points at `engine/katago/limits.ts`, which is gone (constant moved to `lib/timing.ts`, plausibly by the closed `scattered-timing-literals` item). The #344 reorg left live docs pointing at the retros' pre-move paths (e.g., the retirement worklog → `docs/notes/retrospective-katago-f-optimizer-2026-05.md`, per `docs/doc-graph-report.md`), the Phase 3 retro's `(../adr/)` directory link silently broke and the validator doesn't flag directory links at all, while it *does* flag `frontend/tests/CLAUDE.md` and `frontend/docs/i18n.md` as dangling although both exist on disk — the report conflates "file missing" with "outside the node set," diluting its 125-item live-action list.

**Refactoring-opportunity distillation for the review.** (1) Add a retro-close step: every roadmap/follow-up bullet becomes an SSOT item or is explicitly declined. (2) A one-line dated-note discipline when a retro's named artifact is superseded — cheap, high auditability. (3) Improve `tools/doc-graph/generate.mjs` to distinguish missing-file from outside-node-set danglings and to resolve directory links. (4) Treat ADR-0010's render-locality/canvas rules as the correctness frame for any frontend simplification — a "simpler" reactive read in a composition node is the regression class this whole arc paid to learn. All perf statements above are the retros' captured numbers; no new performance property is asserted here (ADR-0009).
````

**Findings (structured, verbatim):**

````json
[
 {
  "title": "Retrospective follow-ups bypass the work-status SSOT (KeepAlive contract revision is tracked nowhere)",
  "evidence": "retrospective-phase3-policy-benchmark-2026-05.md §\"KeepAliveMiddleware contract revision (proxy-side)\" and retrospective-phase3.5-learned-vf-2026-05.md roadmap item 8 both file it \"for a follow-up dispatch in proxy/docs/dispatch/\". That directory does not exist; read-only SELECT over the todo DB items (title/description ILIKE keepalive/keep_alive) returns nothing; git -C proxy log -- middleware/keep_alive.py shows no contract change since the identity-types/logging refactors.",
  "implication": "Intention-capture gap: G5's SSOT guards status of items that enter the store, but retro roadmap sections have no gate. Candidate process refactor: a retro-close checklist step — every follow-up bullet becomes an SSOT item or is explicitly declined in the retro.",
  "confidence": "high"
 },
 {
  "title": "Phase 3.5's 'immediate, before SPA integration' diverse-corpus retraining was skipped; the opt-in escape shipped instead; the residual intent is untracked",
  "evidence": "retrospective-phase3.5-learned-vf-2026-05.md §Roadmap item 1 (immediate) and the lcb_spread apples-to-apples asterisk under \"Realistic SPA-side numbers\"; ~/benchmark_allocation/ contains no artifact newer than 2026-05-18 and no diverse-corpus files; frontend/src/store/defaults.ts:75-84 shows the shipped shape (adaptiveReevaluate.enabled: false, valueBinding: '' default, learned_* opt-in per the v1.0.26 comment); no todo-DB item matches learned/lightgbm.",
  "implication": "The shipped opt-in matches the retro's own mitigation proposal 1 (correct per its OOD warning), but the retraining and the apples-to-apples re-run now live only in prose and an off-repo NOTES.md — same intention-capture gap as the KeepAlive finding.",
  "confidence": "high"
 },
 {
  "title": "Doc-consolidation retro contradicts the tree on its own central artifact (work-status.json → Postgres) with no inline dated note",
  "evidence": "retrospective-doc-consolidation-2026-06.md lines 3-4, 16-17, 59-69 describe docs/work-status.json as the canonical SSOT and address \"any contributor who later wonders why work-status lives in a JSON file\"; the file is absent from the tree; tools/work-status/schema.sql's header documents the migration to the todo Postgres DB; the retro's own header (line 19) says corrections happen \"inline with dated notes\" — none present.",
  "implication": "Cheap auditability refactor: a one-line dated inline note whenever a retro's load-bearing named artifact is superseded; optionally extend the co-change advisory pattern to retros whose Status header names a canonical artifact.",
  "confidence": "high"
 },
 {
  "title": "F-optimizer retirement fully executed, but the retro's pointer to the surviving constant is stale",
  "evidence": "retrospective-katago-f-optimizer-2026-05.md §Retirement says KATAGO_FIRST_REPORT_FLOOR_S survives in frontend/src/engine/katago/limits.ts; that file no longer exists — the constant is at frontend/src/lib/timing.ts:327 with value 0.001, and no optimize-f/FOptimizer files remain under src/. The closed scattered-timing-literals item is the plausible mover. The positive lesson also verifies: the ~1300-line workaround cohort was scoped tightly enough to delete cleanly when upstream fixed lightvector/KataGo#1197.",
  "implication": "Two takeaways: (a) same dated-inline-note discipline as above; (b) the retirement is the worked model for upstream-compensation code — keep workarounds cohort-scoped and traceable to their upstream trigger so deletion is one PR.",
  "confidence": "high"
 },
 {
  "title": "Doc-graph report conflates 'target file missing' with 'target outside node set', and skips directory links — diluting the post-#344 drift signal",
  "evidence": "docs/doc-graph-report.md summary: 125 dangling refs from LIVE documents. Line 118 is genuine drift (live worklog 2026-05-25-katago-f-optimizer-retirement.md → the retro's pre-#344 path); lines 51-52 flag frontend/docs/i18n.md and frontend/tests/CLAUDE.md from release-retrospective-2026-05.md as dangling although both exist on disk (verified by ls); retrospective-phase3-policy-benchmark-2026-05.md line 19's '(../adr/)' link broke when the file moved into retrospective/ (now resolves to nonexistent docs/notes/adr/) and appears nowhere in the report.",
  "implication": "Auditability refactor on tools/doc-graph/generate.mjs: split the dangling classes (missing-on-disk vs outside-node-set) and resolve/flag directory links, so the genuine-action list stays reviewable and real breaks aren't invisible.",
  "confidence": "medium"
 },
 {
  "title": "Distribution packaging: the longest-lived declared priority, still open across both release retros",
  "evidence": "release-retrospective-2026-04.md §\"What's queued for after\" (leading edge, Decision section unfilled) and release-retrospective-2026-05.md §\"What's queued for v1.2.0+\" (\"The author's named priority\"); todo DB: distribution-packaging | open | future | both.",
  "implication": "Not a refactoring item, but the review should surface it: a month-plus open headline priority with disposition 'future' (not 'active') — either the disposition or the 'priority' framing is stale.",
  "confidence": "high"
 },
 {
  "title": "The lessons→ADR pipeline works for architectural lessons: green-perf corrections became ADR-0010 + CI",
  "evidence": "green-perf-arc-retrospective-2026-05-31.md §Correction (render≫patch tell; aggregate both render and patch marks) appears verbatim as the corollary in frontend/CLAUDE.md §\"Render locality and data-dense visuals (ADR-0010)\", with the imperative-escape pattern codified (4 uses) and onUnmounted release tied to the resource-ownership discipline; frontend/CLAUDE.md records \"CI landed 2026-06-01 (.github/workflows/frontend-ci.yml)\" (build + eslint + test:run), closing the v1.1.0 retro's queued CI item; the remaining green-perf levers are SSOT-tracked (nav-during-range-query-perf, pv-hover-jank-range-query, many-boards-open-slowness, thumbnail-render-lifecycle-consolidation all open).",
  "implication": "For the refactoring review: ADR-0010's canvas/read-locality rules are the correctness frame any frontend simplification must preserve — a 'simpler' reactive read in a composition node is precisely the paid-for regression class. Contrast with the untracked operational follow-ups (findings 1-2): architectural lessons get institutionalized, operational ones leak.",
  "confidence": "high"
 },
 {
  "title": "Phase 3 benchmark's recommended SPA default (greedy_eig + monte_carlo_sqrt + lcb_spread) never became the live default; the supersession is unrecorded in the retro",
  "evidence": "retrospective-phase3-policy-benchmark-2026-05.md headline: \"Strong, cross-model-invariant signal for the SPA default recommendation\"; frontend/src/store/defaults.ts:75-84: adaptive off by default, and when enabled valueBinding '' means \"the proxy's built-in v1.0.24 worst-quantile allocation (no Phase 3 fields sent)\" with only learned_* versions selectable from the dropdown.",
  "implication": "Either the supersession decision is recorded in a worklog this pass didn't read, or the benchmark's stated deliverable (a defensible default) was quietly shelved when Phase 3.5 landed. Either way a dated note in the Phase 3 retro or an SSOT item would close the trace — the exact reasoning-trace loss ADR-0002 Rule 6 names.",
  "confidence": "low"
 },
 {
  "title": "Research-arc methodological disciplines worth porting to frontend perf practice",
  "evidence": "Phase 3 retro §Methodological notes: cluster-robust SE / the N_rows>N_cells discipline check, oracle-definition-is-load-bearing, multi-scaling sensitivity as cheap insurance; F-optimizer retro: n≥10 before quoting numbers, the analytic-firewall pattern (caught pseudo-replication and the MAX-rule misframe); green-perf retro: the two-axes verdict revision (per-interaction latency vs sustained frame ceiling) — the first draft conflated them and undersold the arc.",
  "implication": "Candidate review discipline: perf claims in worklogs/retros should name the axis they measured and attach the capture (composes with ADR-0009 and the existing perf-battery protocol); statistical claims from any future characterization arc get a firewall pass before entering documentation.",
  "confidence": "high"
 },
 {
  "title": "Doc-consolidation loose ends: partially executed, the open remainder untracked",
  "evidence": "Retro §Loose ends vs tree: CLAUDE.md proxy-pin now reads v1.0.27 (fixed); services_local.gitignore exists as an untracked local file (the 'central home' executed in the off-tree shape the retro itself reasoned for); docs/notes/postmortem/ still so named (incident/ rename not done); docs/onboarding/ unrevised; todo-DB keyword SELECTs (onboarding, incident) return no items.",
  "implication": "Smaller-stakes instance of the intention-capture gap; folding the open loose ends into SSOT items (or explicitly declining them with a dated note) would make the retro's own 'next conversation' auditable.",
  "confidence": "medium"
 }
]
````

**Coverage (verbatim):**

````
READ END TO END (this session): all six files under docs/notes/retrospective/ (README.md, release-retrospective-2026-05.md, retrospective-doc-consolidation-2026-06.md, retrospective-katago-f-optimizer-2026-05.md, retrospective-phase3.5-learned-vf-2026-05.md, retrospective-phase3-policy-benchmark-2026-05.md); docs/notes/green-perf-arc-retrospective-2026-05-31.md; docs/notes/green-perf-arc-branch-inventory-2026-05-31.md; docs/archive/notes/release-retrospective-2026-04.md; frontend/CLAUDE.md (injected complete by the harness); umbrella CLAUDE.md (injected complete in the system context). PARTIALLY CONSULTED (flagged per ADR-0002): tools/work-status/schema.sql (header + items/deps DDL, ~80 lines — refs/labels tables and the violations view unread; could affect nothing in my claims, which rest on the items table only); docs/doc-graph-report.md (415 lines; read the 30-line header/summary and the grep-located dangling-ref lines I cite — the unread ~350 lines of listings could contain further retro-related drift instances beyond the ones cited, so my finding 5 counts are the report's own summary numbers, not my enumeration); frontend/src/store/defaults.ts (lines 55-114 only). LOOKUP/GREP ONLY (not read): FEATURES.md (one grep hit cited by line number), frontend/src/engine/katago/capability-injection.ts, frontend/src/types.ts, proxy/middleware/keep_alive.py (grep for liveness vocabulary only). DATABASE: read-only SELECTs on the todo Postgres DB (full items listing: 51 open + 38 closed rows; keyword searches; one description fetch). NOT READ AT ALL (named gaps): docs/notes/roadmap-phase3.5-spa-integration.md (exists in notes root — its contents could change my characterization of which Phase 3.5 follow-ups are 'untracked', since the roadmap doc may itself carry them; finding 2's confidence should be read with this gap in mind); docs/onboarding/* contents; the worklogs the retros cite (including 2026-05-25-katago-f-optimizer-retirement.md — a worklog could record the Phase-3-default supersession decision, which is why finding 8 is low confidence); docs/notes/consolidation-xref-fallout.md; the post-merge 'opus fresh-eyes audit of the green-perf arc' note (commit 5a02e25); proxy tag annotations. FIREWALL: nothing under backend/qeubo/ was read. PERF: no new performance property asserted; all numbers quoted are the retros' own captured measurements (ADR-0009). No file or database row was modified.
````

### §1 · harvest:adr-triggers

**Commission** (= `[SHARED: HARVEST-PREAMBLE]` + the following + `[SHARED: HARVEST-OUTRO]`):

````
Read ALL TEN ADRs under /home/bork/w/omega/docs/adr/ end to end. Enumerate EVERY "Revisit when…" trigger across them, and assess each trigger against the current state of the tree with concrete checks (wc -l on files for ADR-0007; store shape and mutator count for ADR-0001/Pinia; grep for the conditions named; todo DB read-only SELECTs where status matters). Pay particular attention to: (a) ADR-0001's conditions for reconsidering Pinia vs the current GlobalStore size (frontend/src/store/index.ts is ~789 lines; types.ts ~2362); (b) ADR-0007's budgets vs the actual size distribution under frontend/src; (c) ADR-0010 "Revisit when" #4 — the documented unresolved tension with the no-direct-service-calls layering rule (also described in frontend/CLAUDE.md); (d) ADR-0003's band map vs today's tree. For each trigger: satisfied / not satisfied / partially, with evidence. A satisfied-but-unacted trigger is exactly the kind of finding this review wants.
````

**Report (verbatim):**

````
## ADR Revisit-Trigger Audit — all ten ADRs, read end to end

Across `docs/adr/0001`–`0010` there are **38 "Revisit when…" triggers** (ADR-0001: 5, 0002: 4, 0003: 4, 0004: 2, 0005: 3, 0006: 3, 0007: 4, 0008: 4, 0009: 5, 0010: 4). Per-trigger status, with checks:

**ADR-0001 (Pinia / readonly).** #1 multi-tab: NOT satisfied — `item-27-etag-multitab` is open/future in the todo DB. #2 "profiling reveals specific reactivity hot spots": **SATISFIED AND UNRECORDED**. The 2026-05-27→31 perf arcs found exactly this — `store/index.ts:127-149` (`boardsById`, replacing O(N²) walks) and `:157-171` (the `mutateBoard` identity-swap removal, "diagnosed in docs/notes/perf-audit-game-scroll-2026-05-28.md"). Worse, ADR-0001's body now misdescribes its own enforcement mechanism: it lists "a single place to re-wrap mutated objects (`store.boards[index] = { ...board }`)" as a benefit of `mutateBoard`, but that re-wrap was deliberately removed for performance. The ADR was never amended, violating its sibling tenets' own conventions (ADR-0002 Rule 6, ADR-0005 Rule 8). #3 mutator bypass: NOT satisfied — grep found zero direct `store.boards[...] =` writes outside `src/store/`; the convention holds. #4 Pinia: NOT satisfied (no `pinia` in `frontend/package.json`). #5 TS immutability primitive: not satisfied. The store itself is 789 lines but heavily docstring-weighted, with ~15 named mutators/orchestrators plus two teardown registries (`BOARD_SCOPED_STORE_CELLS`, `IDENTITY_SCOPED_CACHES`) — the Pinia-reconsideration conditions have not arrived; what has arrived is doc drift inside the ADR.

**ADR-0002.** #1/#2 (warning spam, message collapse) are user-report-dependent; not assessable here. #3: no new silent-fallback domains found needing listing. #4 Sentry: NOT satisfied (no dependency).

**ADR-0003 (bands).** #1 second adopter: no. #2 inventory drift: **PARTIALLY SATISFIED**. 9 of 19 spot-checked inventory paths moved in the source-tree reorganisation (e.g. `composables/useReviewSession.ts` → `composables/review/`, `components/TreeWidget.vue` → `components/tree/`), and the post-April surfaces (useQeubo.ts 979 lines, lib/knobs.ts 802, analysis-persistence, auth, perf harness) are absent from the ADR's inventory. In practice `frontend/FILES.md` (215 band tags, citing ADR-0003 as "the canonical band definitions") has become the live inventory — but ADR-0003 was never amended to delegate, leaving two parallel band registries (the ADR-0005 Rule 1 drift shape). #3/#4: no evidence of a wrong band or of the Chess-port question losing utility.

**ADR-0004.** #1 tooling: **PARTIALLY** — CI (`frontend-ci.yml`, 2026-06-01 per frontend/CLAUDE.md) now gates `vue-tsc -b`, and strict template type-checking catches some of the prop-contract drift the ADR assumed uncatchable; the ADR's own wording says the policy "can relax in proportion." Deserves a deliberate assessment (low-confidence on vue-tsc's exact coverage; not verified empirically). #2: no observed failure mode.

**ADR-0005.** #2 **fired and recorded in-place** (doc-graph CI, 2026-06-01) — the model for trigger bookkeeping. Rule 4 linter / parallel-TODO checker remain open. #1/#3: no new evidence.

**ADR-0006.** #1 header linter: NOT satisfied — nothing under `tools/` checks headers; cheap candidate. #2/#3: no.

**ADR-0007 (file size).** No trigger formally fired, but the budgets are far from the tree's reality: 33/69 Vue files exceed 250 lines; 51/138 non-generated TS exceed 200 (30 exceed 300). `eslint.config.js:137` itself defers `max-lines` ("~69 files over 250 — backlog-surfacing rather than clean gates"), and the open item `refactoring-queue-adr0007` records files **growing since its own snapshot** (App.vue ~708→718, types.ts ~2245→2362). Trigger #1's prerequisite (the ESLint host) now exists; the named rule is deferred. A warn-level `max-lines` would make the backlog mechanically visible without gating.

**ADR-0008.** #4 partially: the ESLint host plus the custom `clear-needs-ownership` rule prove local-rule mechanisation is cheap; the named candidates (band-coherence at mount sites, enum-coverage) remain unbuilt. #1–#3: no evidence.

**ADR-0009.** #2 fired 2026-06-01 and amended in-place (Chrome/CDP path) — recorded properly. #4 (perf-claim CI scan) and the remaining triggers: not satisfied.

**ADR-0010.** #1: prerequisite (ESLint host, render-count harness at `tests/integration/render-count/`) built; the read-locality lint rule itself is not. #2 Vapor: no (Vue 3.5.31). #3: not assessed (needs a source census). #4 — the layering ↔ read-locality tension: **open, documented in three prose sites** (ADR-0010 #4; frontend/CLAUDE.md "Tension with ADR-0010"; eslint.config.js header), but **no work-status item tracks it** (targeted SELECTs over items/refs returned nothing). Meanwhile the eslint header's load-bearing claim "Four components violate this today … across five import sites" is **stale**: grep finds zero effectful-singleton imports in `src/components/**` (only a comment mention in MintCardModal.vue and a type-only import in AnalysisControls.vue). The debt was apparently paid without the rationale header — or any SSOT record — being updated.

**Incidental but real:** ADR-0010's committed file ends with leaked tool-call envelope lines (`</content>`, `</invoke>`) after the License section — introduced in commit 5da97f12 (2026-05-31) and surviving at least two subsequent edits to the same file (061cd81, 59aef38). Trivial to fix; a one-line CI grep over `docs/` would prevent recurrence.

**Synthesis.** The trigger system works when fired triggers are recorded in-place (ADR-0005, ADR-0009) and silently rots when they are not (ADR-0001 #2, ADR-0003 #2). The open item `adr-effectiveness-audits` already names the structural fix — a periodic per-tenet audit; folding an explicit "Revisit-when trigger sweep" into that cadence would have caught every finding above.
````

**Findings (structured, verbatim):**

````json
[
 {
  "title": "ADR-0010 ends with committed LLM tool-call artifact lines",
  "evidence": "docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md ends, after 'Public Domain (The Unlicense).', with literal lines '</content>' and '</invoke>' (verified by od -c byte dump). git blame attributes them to commit 5da97f12 (2026-05-31); the file was edited twice afterwards (061cd81, 59aef38) without anyone noticing.",
  "implication": "Fix is a two-line deletion. Lesson: tool-generated docs can leak harness envelopes into authoritative artifacts; a trivial CI grep for '</invoke>'/'</content>' over docs/ would mechanize detection — exactly the cheap-mechanisation class ADR-0005's Revisit #2 stays live for.",
  "confidence": "high"
 },
 {
  "title": "ADR-0001 Revisit trigger #2 fired (reactivity hot spots) and the ADR now misdescribes mutateBoard",
  "evidence": "ADR-0001 lines 97-107 list 'a single place to re-wrap mutated objects (store.boards[index] = { ...board })' as a benefit of the mutator convention; frontend/src/store/index.ts:157-171 documents that this identity swap was removed because it caused whole-tree re-renders (perf-audit-game-scroll-2026-05-28 Arc 1). boardsById (store/index.ts:127-149) and ADR-0010's entire existence are further proof that 'performance profiling reveals specific reactivity hot spots' (ADR-0001 Revisit #2) occurred. No amendment to ADR-0001 records any of this.",
  "implication": "Amend ADR-0001 per the project's own append-a-rule/Amendments-line convention (ADR-0002 Rule 6, ADR-0005 Rule 8): record trigger #2 as fired, and correct the mutator-benefits enumeration to match current mutateBoard semantics. A reader auditing the mutation model today is actively misled by the canonical decision record.",
  "confidence": "high"
 },
 {
  "title": "ADR-0003's band inventory is de-facto superseded by FILES.md but never delegated",
  "evidence": "9 of 19 inventory paths spot-checked have moved (e.g. composables/useReviewSession.ts -> composables/review/, components/TreeWidget.vue -> components/tree/); major post-April surfaces (useQeubo.ts 979 lines, lib/knobs.ts 802, analysis-persistence-service.ts 502) are absent from ADR-0003's inventory; frontend/FILES.md carries 215 band tags and names ADR-0003 as 'the canonical band definitions'.",
  "implication": "ADR-0003 Revisit #2 (inventory drifts substantially) is partially satisfied. The clean fix follows ADR-0005 Rule 1: amend ADR-0003 to delegate the per-file inventory to FILES.md and keep only the band definitions and the design principle, eliminating the parallel registry that is already drifting.",
  "confidence": "high"
 },
 {
  "title": "ADR-0007 budgets are exceeded by roughly half the component tree, and the deferred max-lines lint is the named-but-unbuilt mechanisation",
  "evidence": "wc -l census: 33/69 Vue files > 250 lines; 51/138 non-generated TS files > 200 (30 > 300). eslint.config.js header (~line 137) explicitly defers 'max-lines (~69 files over 250)' as a warn-as-backlog candidate. Todo item refactoring-queue-adr0007 (open/active) records files growing past its own snapshot (App.vue ~708 -> 718 now; types.ts ~2245 -> 2362 now).",
  "implication": "ADR-0007 Revisit #1's prerequisite (a lint host) now exists; the bounded-stopping posture has no mechanical backstop, so the backlog grows invisibly. A warn-level max-lines (or a CI report artifact, mirroring doc-graph-report.md) would surface growth without gating — a small auditability win at zero runtime cost.",
  "confidence": "high"
 },
 {
  "title": "ADR-0010 Revisit #4 layering tension: untracked in the work-status SSOT, and the eslint rationale header is stale",
  "evidence": "The tension is documented in ADR-0010 Revisit #4, frontend/CLAUDE.md 'Tension with ADR-0010 read-locality', and the eslint.config.js header — but read-only SELECTs over the todo DB (items + refs matching 0010/locality/layering/eslint) return no tracking item. Separately, eslint.config.js:82-86 claims 'Four components violate this today (ReviewSessionPanel, ForestDirectory, LibraryTab, AnalysisControls) across five import sites'; git grep finds zero imports of the four restricted effectful singletons anywhere under src/components/** (only a comment in MintCardModal.vue:38 and a type-only import of services/analysis-bundle in AnalysisControls.vue:17).",
  "implication": "Two corrections: (a) file a work-status item for the deferred reconciliation question so 'when there is bandwidth' has an owner (the umbrella CLAUDE.md makes the todo DB the canonical record of deferred work); (b) update the eslint header's violation census — a rationale header that asserts stale debt erodes exactly the auditability the rule-rationale discipline exists to provide. The refactoring opportunity behind the tension itself (ADR-0010 #4's own suggestion: relocate reactive-state modules out of services/) remains the candidate structural resolution.",
  "confidence": "high"
 },
 {
  "title": "Trigger bookkeeping is inconsistent across ADRs — fired triggers recorded in two, silently rotted in two",
  "evidence": "ADR-0005 Revisit #2 carries '(Fired 2026-06-01.)' in-place; ADR-0009 #2 is recorded via the 'Amended (2026-06-01)' section. ADR-0001 #2 and ADR-0003 #2 are satisfied/partially satisfied (evidence above) with no in-ADR record. Todo item adr-effectiveness-audits (open/active, umbrella) already names a 'periodic per-tenet audit' as wanted, 'ADR-0002 most overdue'.",
  "implication": "Lesson for the review: the Revisit-when mechanism only works when paired with a sweep cadence. Concretely: fold a '38-trigger sweep' checklist into the existing adr-effectiveness-audits item rather than inventing a new mechanism — the audit this commission performed is one instance of it and found two unrecorded firings.",
  "confidence": "medium"
 },
 {
  "title": "ADR-0004 Revisit #1 may be partially satisfied by CI-gated vue-tsc template checking",
  "evidence": "frontend/CLAUDE.md (Testing posture) records CI landing 2026-06-01: build (vue-tsc -b) + eslint + tests gate every frontend PR. ADR-0004's premise is that prop-contract drift is 'silent at compile time'; strict vue-tsc template type-checking catches at least the missing-required-prop case for typed SFCs.",
  "implication": "ADR-0004 itself says the policy 'can relax in proportion to the new mechanical guarantee.' Worth a deliberate, small assessment of what vue-tsc -b actually polices today (props, emits, defaults) and an ADR-0004 amendment scoping the residual class — the discipline's cost (slower sweeps) is only justified where the mechanical guarantee genuinely has gaps. Not verified empirically here.",
  "confidence": "low"
 },
 {
  "title": "Mutator convention holds at the write level — ADR-0001 trigger #3 negative result is itself evidence",
  "evidence": "git grep for 'store.boards[...] =' assignment shapes outside src/store/ returns nothing; the only out-of-store accesses found (useDirtyBoardGuard.ts:93,160; useEngineResponder.ts:124,151; usePlayFromPosition.ts:675,787; useSgfDownload.ts:37) are reads. No Pinia dependency exists; no Sentry (ADR-0002 #4) exists.",
  "implication": "No Pinia migration case has formed on ADR-0001's own terms: the convention is not breaking down, multi-tab is still future (item-27-etag-multitab open/future), and the store's 789 lines are docstring-dominated with the two teardown registries already giving the auditability a Pinia migration would promise. The honest refactoring opportunity is the documentation correction (finding 2), not the migration.",
  "confidence": "medium"
 }
]
````

**Coverage (verbatim):**

````
Read END TO END this session: all ten ADRs under docs/adr/ (0001–0010, 3352 lines total); frontend/src/store/index.ts (789 lines); frontend/CLAUDE.md (466 lines, full content injected); frontend/eslint.config.js (365 lines); tools/work-status/schema.sql (129 lines). Sanctioned partial consultation: frontend/FILES.md (header + band-tag count only). Read-only todo-DB SELECTs over items/refs (no writes). Mechanical checks: wc -l census of frontend/src; existence checks of all 19 file paths ADR-0003's inventory names; greps for Pinia/Sentry deps, direct board writes, component service imports, and the ADR-0010 trailing bytes (od -c); git blame/log on ADR-0010.

NOT read (and therefore not cited for content): docs/handoff-current.md, docs/adr-synopsis.md, the postmortems/worklogs/audits the ADRs reference (render-coupling postmortem, perf audits, knob postmortems, RCA), frontend/IDENTIFIERS.md, frontend-ci.yml, tests/CLAUDE.md, FEATURES.md. Where those documents' contents bear on a claim, I relied only on what the read documents say about them.

Gaps this leaves: (1) ADR-0002 Revisit #1/#2 are user-report-dependent and were not assessable from the tree. (2) ADR-0003 Revisit #3 (a band classification wrong in practice) would need a per-module dependency audit I did not perform; FILES.md band-tag correctness was not verified. (3) ADR-0010 Revisit #3 (new high-frequency source classes) needs a source census not performed — the stability-trajectory preview-ingestion path is an unchecked candidate. (4) The 'four layering violations resolved' inference rests on grep, not an actual eslint run; a `npm run lint` would confirm. (5) ADR-0004 #1's vue-tsc coverage claim is reasoning from the CI's existence, not an empirical test — marked low confidence accordingly. (6) Density (ADR-0007's second metric) was not measured; only size was. No performance properties are asserted anywhere in this report (ADR-0009): the max-lines-lint and registry suggestions are framed as auditability changes whose perf neutrality would need a profile only if they touched runtime code, which they do not.
````

### §1 · harvest:worklog-2026-05

**Commission** (= `[SHARED: HARVEST-PREAMBLE]` + the following + `[SHARED: HARVEST-OUTRO]`):

````
Read EVERY worklog under /home/bork/w/omega/docs/archive/worklog/2026-05-v1.0-to-v1.1/ end to end (ls it first). Extract: (1) recurring friction themes across PRs; (2) deferred follow-ups and "known gap" admissions — and whether each is filed in the todo DB (read-only SELECT) or silently dangling; (3) places where a worklog documents fighting the architecture rather than using it; (4) the arc-level shape: what did the v1.0→v1.1 cycle spend its correction budget on? List dangling follow-ups with filenames.
````

**Report (verbatim):**

````
Commission: read every worklog under docs/archive/worklog/2026-05-v1.0-to-v1.1/ (65 files, all read end to end), extract friction themes, deferred follow-ups and their filing status against the todo DB, architecture-fighting episodes, and the arc-level shape of the v1.0→v1.1 correction budget.

**1. Recurring friction themes.** (a) Forward-looking doc surfaces drifting behind a high shipping cadence. The 2026-05-06 doc-graph-staleness-sweep worklog records the user's complaint verbatim ("getting worse by the day, every day I have to point out 'well, isn't that already done?'") and shows four of five "what's likely next" items already shipped; 2026-05-06-katago-engine-info-probe.md shows the same drift in the auxiliary frontend-backlog.md, which the prior TODO audit had missed because it was out of scope. The cycle's eventual structural answers (work-status Postgres DB, doc-graph CI) confirm this was the dominant friction. (b) Verification deferred to the user. Nearly every UI PR ends with "manual UI verification deferred to the user" / "HMR smoke deferred"; the build (vue-tsc + vite) was the only pre-merge gate until tests appear (first mention: 115/115 in 2026-05-08-no-auto-restart-on-overlay-toggle.md). Direct costs: the cluster theme shipped violating the palette's maximin design property and was corrected next day (2026-05-05-cluster-theme-palette-strict.md); the context-id macro input shipped unable to accept non-digit keystrokes (2026-05-06-context-id-macro-expansion.md, "Bug fix landed on the same branch"); engine-info needed an iteration 2 for a privacy leak (model pathname visible). (c) Mental-model errors caught only by the user — the `:value` reactivity stomp ("don't trust mental models of reactivity edge cases without testing") and the color-mix/value-space conflation. (d) Inventory pre-judgment: the resource audit's "bounded; GC-eligible" disposition for O5/O11 hid two real user-visible bugs (timeout toast + reviews-row resurrection into the *new identity's* synced document) — 2026-05-04-audit-sweep-verifications.md records the lesson "frame uncertain dispositions as questions." (e) Stacked-PR base mismanagement: 2026-05-06-intermission-chart-click.md's preamble documents PRs #141/#142 merging into the PR-1 branch instead of main. (f) Schema-migration pace: eleven version bumps (12→24 minus one) in ~6 days, each idempotent and append-only — discipline held but every small setting costs a migration despite deepMerge already backfilling.

**2. Deferred follow-ups: filed vs dangling.** Filed in the todo DB (verified by SELECT): pv-animation-defaults-calibration (open/future), pv-overlay-typography-calibration (open/future), refactoring-queue-adr0007 (open/active), polymorphic-chart-renderer (open/future, from the heatmap worklog), i18n-string-sweep (open/active), card-metadata-during-review (open/future), engine-connection-lifecycle-logout (open/future), gradingparameter-opacity-typing (open/future); review-state-convention-inconsistency, foreststat-tagstat-acl, anchor-role-overloading all closed. Dangling (worklog-only; keyword sweeps over all 88 item descriptions found no match): orphan CSS in App.vue (2026-05-06-cards-tab-merge-pr2-tab-restructure.md — `.tab-padding-sr` still at App.vue:624 with zero consumers as of today); the audit-pair ID nomenclature collision (same worklog — never tidied, and worse, see finding 1); the max_nodes/CardTreeOverflowError deeper fix options a/b/c (2026-05-06-cards-tab-merge-pr3-bugfixes.md); spec retrofits "held for the next spec-touch PR" (active-stub fill, intermission-click semantics — card-tree-frontend-spec.md was archived without them); useCardThumbnail's misfiling as a composable (2026-05-04-cardthumbnail-cache-clears-on-identity-flip.md explicitly chose worklog-only recording; file still at composables/cards/); getProjectedSequence's redundant construction-time pre-create (2026-05-04-ledger-purgeboard-releases-version-refs.md); easing tokens (duration-tokens), redundant body-size declarations (~50 sites, font-size-scale), the optional chrome-literal CI lint and qEUBO-over-chrome (theme-substrate-a4); HorizontalTimelineVisualizer chrome sweep (timeline-gradient-fix); the backend gamma-default mismatch question (mint-card-gamma); the qEUBO cacheOverride parameter (cache-control-registry); macro-form persistence (context-id-macro-expansion). The "held until requested" UX items (card-level nav expansion, hover previews, modifier-click navigation, >4 variation tints, copy-id chips) are dangling by explicit design.

**3. Fighting the architecture.** The clearest episode is the cluster theme: the substrate's progressive-tier vocabulary was pushed onto a maximin-optimized palette via color-mix, silently destroying the palette's design property; the corrective accepted categorical tier collapse instead (2026-05-05). Second: pendingAnalysisAborts as a function-local Map inside a composable that was "implicitly a singleton" — the O5 fix hoisted it to module scope, conceding the composable shape was a costume (2026-05-04-audit-sweep-verifications.md); useCardThumbnail is the same costume, still unmoved. Third: store→service and store→composable imports with ES-live-binding justifications accumulate across the audit PRs; the current BOARD_SCOPED_STORE_CELLS registry in store/index.ts is the partial structural answer (give the slot an owner), but closeBoard today still mixes the registry drain with seven manually ordered cleanup calls. Fourth: ECharts' heatmap has no cell-level diff, so 2026-05-06-heatmap-update-throttle.md is mitigation around a library limit, honestly parked as polymorphic-chart-renderer.

**4. Arc-level correction budget.** The v1.0→v1.1 cycle spent its first week almost entirely on three retroactive audits: literal/SSOT consolidation (color A1–A4 plus nine substrate PRs plus Tier-4: ~477 sites + ~380 color literals into theme.css/constants.ts), resource-ownership (15 pairs, ~11 PRs, all three passes closed in one day, surfacing two real bugs and one cross-user privacy bug), and doc-graph honesty (staleness + backlog sweeps). Feature work followed (cards-tab merge, forest navigator, i18n, board variations, engine info, game-source dedup), each trailing an immediate user-feedback corrective PR. Roughly: ~40% drift consolidation, ~25% lifecycle correctness, ~20% features plus their corrective tax, ~15% documentation honesty. The cycle's meta-lesson, visible in its own artifacts: build-green was the only gate, the user was the test suite, and the audits were the deferred bill for both.
````

**Findings (structured, verbatim):**

````json
[
 {
  "title": "Audit-pair identifiers in closeBoard docstrings collide with the archived audit plan's numbering — and the collision grew after being flagged",
  "evidence": "2026-05-06-cards-tab-merge-pr2-tab-restructure.md 'Forward notes' flags that PR 1 reused 'O12' (already useResizablePanel in the plan) and says 'a future audit-plan tidy can correct this.' Today frontend/src/store/index.ts (closeBoard region, ~line 444 and the docstring above it) uses O12 (boardCardTrees), O13 (analysis-persistence discard), O14 (cardTreeNav), O15 (forestNav.selection), while docs/archive/notes/resource-ownership-audit-plan.md lines 159/161 still define O12=useResizablePanel, O14=MintCardModal setTimeout. A SELECT over all 88 todo items found no tracking item.",
  "implication": "The cleanup contract's cross-references — the audit's main auditability deliverable — now point at the wrong rows. Refactoring opportunity: replace ad-hoc O-numbers in source docstrings with stable handles (e.g., work-status item ids or descriptive slugs), or renumber once and gate new pair-ids on the plan. Cheap, pure-auditability win.",
  "confidence": "high"
 },
 {
  "title": "closeBoard/resetWorkspace cleanup is half registry-driven, half manually ordered — the audit's own recurring shape is only partially structurally fixed",
  "evidence": "Pass-1's closeout (2026-05-04-resource-audit-pass-1-inventory.md) names the recurring shape: 'per-entity Map/Set state... reliably gets a dispose/disconnect cleanup path, but inconsistently gets an entity-removal cleanup path.' Current store/index.ts has a BOARD_SCOPED_STORE_CELLS registry drain for store cells, but closeBoard still hand-sequences stopBoardAnalysis, ledger.purgeBoard, stabilityTrajectoryStore.purgeBoard, analysisPersistenceService.discard, abortBoardReview, purgeBoardThumbnails, removeBoardCardTree with prose ordering constraints.",
  "implication": "Refactoring opportunity: extend the registry pattern to all per-board owners (with an explicit ordering phase: stop-engine / purge-caches / abort / pre-splice), so adding a per-board resource requires registering its clear and closeBoard becomes a drain loop — correctness by construction instead of by docstring. The MiniBoard texture-scope bug class (todo item thumbnail-render-lifecycle-consolidation) suggests the same owner-not-flags move for shared render resources.",
  "confidence": "high"
 },
 {
  "title": "Build-green-only gating made the user the test suite; one corrective PR per feature arc was the recurring price",
  "evidence": "Cluster theme shipped violating the palette maximin property, corrected next day (2026-05-05-cluster-theme-palette-strict.md, user quote in 'Context'); context-id macro input shipped unable to accept '${' keystrokes (2026-05-06-context-id-macro-expansion.md 'Bug fix landed on the same branch', with the recorded lesson about untested reactivity mental models); cards-tab merge needed PR3 for three user-surfaced bugs including a pre-existing silent tree-fetch drop (2026-05-06-cards-tab-merge-pr3-bugfixes.md, Cause B); engine-info needed iteration 2 for a pathname privacy leak. Tests first appear at 115/115 in 2026-05-08-no-auto-restart-on-overlay-toggle.md.",
  "implication": "Lesson for the review: the defect classes that actually bit were (1) reactivity binding edge cases, (2) silent .catch/console.error swallows violating ADR-0002, (3) design-property invariants no type checker sees (palette maximin). Targeted test investment in exactly these classes (migration idempotency, composable lifecycle, ACL translators, 'no console.error-only catch' lint) buys more correctness than broad coverage.",
  "confidence": "high"
 },
 {
  "title": "Orphan CSS deferral from the cards-tab merge is still dangling a month later",
  "evidence": "2026-05-06-cards-tab-merge-pr2-tab-restructure.md 'Forward notes' defers sweeping App.vue's dead SR-tab CSS ('a small follow-up PR can sweep them'). grep today: frontend/src/App.vue:624 still defines .tab-padding-sr with zero consumers anywhere in frontend/src. No todo item matches (description sweep for 'orphan|tab-padding|dead css' returned nothing).",
  "implication": "Small concrete cleanup, plus a generalizable lesson: 'risk-removed under partial visibility' deferrals never get picked up unless filed. A dead-selector check (even a grep-based advisory) would close the class; alternatively, the pre-merge checklist's defect-recording discipline should catch worklog-only deferrals at filing time.",
  "confidence": "high"
 },
 {
  "title": "Silent worklog-only deferrals cluster around the substrate arc; several are real-but-unfiled",
  "evidence": "Unfiled after a keyword sweep over all 88 todo items: easing tokens (2026-05-03-duration-tokens.md 'What's not done'), ~50 redundant body-size declarations (2026-05-03-font-size-scale.md), the chrome-literal CI lint and qEUBO-over-chrome (2026-05-02-theme-substrate-a4.md 'What's deferred'), HorizontalTimelineVisualizer chrome sweep (2026-05-02-timeline-gradient-fix.md), useBoardGeometry consolidation across three SVG sites (2026-05-03-board-label-band.md, 2026-05-03-geometry-ratios.md), the max_nodes/CardTreeOverflowError deeper fix (2026-05-06-cards-tab-merge-pr3-bugfixes.md), backend gamma-default mismatch (2026-05-04-mint-card-gamma-control.md), qEUBO cacheOverride (2026-05-04-cache-control-registry.md), macro-form persistence (2026-05-06-context-id-macro-expansion.md). By contrast, items the sessions did file (pv-animation/pv-overlay calibration, refactoring-queue-adr0007, polymorphic-chart-renderer, card-metadata-during-review, engine-connection-lifecycle-logout, gradingparameter-opacity-typing) are all present and correctly stated in the DB.",
  "implication": "The work-status store works when used; the leak is at authoring time. Candidate discipline: a worklog 'What's not done' section must end each bullet with either a work-status item id or an explicit 'held-until-requested' marker — making the dangling state grep-able instead of prose-buried.",
  "confidence": "high"
 },
 {
  "title": "Worklogs iterated mid-PR carry internal contradictions that cost auditability",
  "evidence": "2026-05-03-board-label-band.md says labels render 'on all four sides' (lines ~88-94) while its 'What's not done' still says 'Convention here is top + left only' (lines ~154-158). 2026-05-03-spacing-scale.md deliberately keeps a wrong substrate comment ('14/15 → loose (20)') while the sweep applied 14/15 → medium, recording the divergence in the worklog instead of fixing the comment. 2026-05-06-i18n-pr1-plumbing.md describes the 23→24 migration then says 'Bumps CURRENT_SCHEMA_VERSION to 23.'",
  "implication": "For a codebase whose audit trail is its worklog ledger, mid-iteration edits should reconcile the whole document (the class-wide-ACL worklog's own lesson: 'when an entry's premise shifts, fix the entry'). A lightweight close-out re-read of the worklog before merge would catch these; the spacing-scale case argues comments should be corrected in place with the history noted, not preserved wrong.",
  "confidence": "high"
 },
 {
  "title": "Pre-judged 'benign' dispositions in audit inventories hid real bugs; the corrected framing is recorded but not codified anywhere mechanical",
  "evidence": "2026-05-04-audit-sweep-verifications.md: O5/O11 were dispositioned 'bounded; controllers GC-eligible' but verification found a 30s-late toast and resurrection of a deleted reviews row into the new identity's backend-synced document. The Pass-3 worklog (2026-05-04-resource-audit-pass-3-discipline.md) retains the lesson ('frame uncertain dispositions as questions') in prose only.",
  "implication": "Lesson worth promoting into the audit-plan template / pre-merge checklist: inventory disposition columns carry questions, never 'likely benign' answers, for any pair whose verification is non-trivial. This is the cheapest known guard against the exact failure mode that consumed unplanned correction budget.",
  "confidence": "high"
 },
 {
  "title": "ChromeAnchor is a hand-maintained mirror of theme.css with a recorded drift threshold that subsequent additions have been eroding",
  "evidence": "2026-05-02-themecolor-typed-anchors.md sets the contract: hand-derived union, codegen 'overkill at 22 anchors... revisit if the substrate churns more or grows past ~50.' 2026-05-03-anchor-decouple-via-alias.md already bumped it to ~25 and re-affirmed the threshold; later arcs (cluster theme, role aliases) keep adding anchors. The lockstep discipline lives in the file header playbooks only.",
  "implication": "Not urgent, but the review should record the trigger as live: when the anchor count approaches the threshold or a second theme-variant edit misses the union, the postcss-parse codegen (mirroring npm run gen:api) is the pre-decided answer. Treat the file-header playbook as the interim contract and check the count during any substrate-touching PR.",
  "confidence": "medium"
 },
 {
  "title": "Eleven schema migrations in six days — the bump-and-migrate discipline is sound per-instance but the aggregate cost is unexamined",
  "evidence": "Migrations 12→13 (gamma), 13→14 (cache flags), 14→15 (cluster theme), 15→16, 16→17 (cards-tab), 17→18, 18→19 (board variations), 20→21 (forestNav), 21→22 (showcase decks), 22→23 (clientGameId), 23→24 (locale) across 2026-05-04 to 2026-05-07. Several worklogs note deepMerge would already backfill the field and the migration ships anyway 'to keep the schema-version marker honest' (2026-05-04-mint-card-gamma-control.md, 2026-05-04-cache-control-registry.md).",
  "implication": "Candidate simplification: a declared distinction between 'additive default-backfill' fields (handled by one generic defaults-merge mechanism, no version bump) and genuinely shape-changing migrations (bump + handwritten migration). Would shrink the migration ledger's growth rate and the per-feature ceremony without losing the append-only audit property for real shape changes. Needs a deliberate ADR-level decision since it relaxes a recorded discipline.",
  "confidence": "medium"
 },
 {
  "title": "Spec retrofits 'held for the next spec-touch PR' were never executed and the spec is now archived",
  "evidence": "2026-05-06-cards-tab-merge-pr3-bugfixes.md ('A spec retrofit noting the active-fill convention would close the loop; held for the next spec-touch PR') and 2026-05-06-intermission-chart-click.md (same deferral for click semantics). docs/archive/notes/card-tree-frontend-spec.md contains the PR-1 orange-overlay note but no active-stub-fill or intermission-click sections (grep for 'active stub|cyan fill' returns nothing).",
  "implication": "'Held for the next X-touch PR' is a deferral shape with no owner and no trigger; both instances silently expired when the document was archived. Where a retrofit matters, file it; where it doesn't, say so — the half-state is the silent failure ADR-0002 names. The design-note-retirement-archive-gate (closed, shipped) could plausibly grow a check for unresolved 'held for' markers at archive time.",
  "confidence": "high"
 },
 {
  "title": "Two genuinely positive reusable patterns the cycle validated: script-driven sweeps with snap rules, and two-PR foundation/UI seams",
  "evidence": "The Tier-2 substrate PRs (~433 sites) all used transient Python sweep scripts with explicit snap tables and straggler skips (2026-05-03-spacing-scale.md establishes the pattern); errors were bounded and caught (the one missed glob in font-size, the one regex-skipped shorthand in border-radius — both hand-corrected and recorded). The cards-tab merge's PR1/PR2 seam ('the split is load-bearing... two PRs let the user sanity-check the foundation', 2026-05-06-cards-tab-merge-pr1) and the forest-nav PR0-PR3 chain shipped large UI changes with zero rollback.",
  "implication": "For future consolidation work, the recorded recipe (inventory → snap-rule table → transient script → straggler carve-out → grep verification) is the codified low-risk path; the review should preserve it as the named template rather than letting future sweeps reinvent it.",
  "confidence": "high"
 }
]
````

**Coverage (verbatim):**

````
Read fully, end to end: all 65 worklogs under /home/bork/w/omega/docs/archive/worklog/2026-05-v1.0-to-v1.1/ (verified count against ls; every file Read in full in this session); tools/work-status/schema.sql. Read partially (sanctioned or targeted): todo DB via read-only SELECTs — full id/state/title listing of all 88 items, full descriptions of 3 items (refactoring-queue-adr0007, thumbnail-render-lifecycle-consolidation, many-boards-open-slowness), and keyword regex sweeps over all descriptions for the dangling-candidate topics; targeted greps/sed over frontend/src/store/index.ts (closeBoard region lines ~380-470 read), frontend/src/App.vue (grep only), frontend/src/services/analysis-ledger.ts (grep only), docs/archive/notes/resource-ownership-audit-plan.md (grep only — NOT read end to end; I cite only the two grep-returned table rows verbatim), docs/archive/notes/card-tree-frontend-spec.md (grep only — cited only for presence/absence of specific strings). Directory listings of docs/notes/ and docs/notes/vestige/deferred-items/. NOT read: the deferred-item vestige files themselves (pv-animation-defaults-calibration.md etc. — I relied on the DB rows instead), the archived plan and spec in full, frontend test-coverage notes, CLAUDE.md files beyond the system-provided umbrella one, and the postmortem/RCA notes the worklogs reference. Risk from gaps: the archived audit plan may contain a later-added correction section my grep missed (would weaken the ID-collision finding); a vestige deferred-item file could cover one of the items I classified as dangling (the DB keyword sweep mitigates but does not eliminate this — the vestige directory filenames I listed show no match for the specific dangling items named); 'responsive-design-deferred' matched my 'overflow' regex and I did not read its description, so there is a small chance it covers the max_nodes tree-fetch cap (I judged this unlikely from the title and flagged that finding's claim accordingly). Per ADR-0009 I make no performance assertions; perf-adjacent worklog claims (heatmap throttle, debounce) are reported as the worklogs' claims, not verified properties.
````

### §1 · harvest:worklog-current

**Commission** (= `[SHARED: HARVEST-PREAMBLE]` + the following + `[SHARED: HARVEST-OUTRO]`):

````
Read EVERY worklog under /home/bork/w/omega/docs/worklog/ end to end (the current release cycle; ls it first — on the order of 30-60 files). Extract: (1) recurring friction themes across PRs (the same kind of fix appearing repeatedly); (2) deferred follow-ups and "known gap" admissions inside worklogs — and whether each is filed in the todo DB (read-only SELECT) or silently dangling; (3) places where a worklog documents fighting the architecture rather than using it. List every dangling follow-up you find with its worklog filename.
````

**Report (verbatim):**

````
Scope: all 91 files under /home/bork/w/omega/docs/worklog/ (2026-05-12 through 2026-06-09), each read end to end, cross-checked read-only against the `todo` Postgres work-status store (88 items: 49 open / 39 closed) and spot-checked against git history and source where a worklog's claim was verifiable cheaply.

**Recurring friction themes.**

(1) *Render-coupling at composition nodes* is the cycle's dominant repeated fix: the same anti-pattern (a high-frequency reactive value read in a container's render, re-rendering the whole subtree) was excised at least nine times — App.vue cursor (arc 2), App.vue engine metrics (RB-1), AnalysisDashboard (phase 0), Toolbar shell (metrics extraction), queue tooltip, preview-box prop threading, cursor prop threading, TreeWidget's template-bound active ring, BoardTab's template-bound rugplot. The recurrence ended only when the invariant was mechanized (R/P ≈ 1.00 per ADR-0010, render-count regression guards, frontend CI, the perf battery memory). (2) *Under-/mis-keyed caches and conflated identities*: per-board single-slot query maps (2026-05-16-per-board-multi-query), match cursor aliasing the user cursor (2026-05-16-match-cursor-independence), KnobDomain conflating UX taxonomy with consumer identity (2026-05-14-knob-registry postmortem), and the ledger/trajectory twin bug (2026-06-08-*-stratified-keying) — one composite hash over heterogeneous-provenance data. The eventual cure was uniform: branded key types with single mint sites. (3) *One-shot imperative binding vs reactive truth*: PBO claim rehydration (2026-05-17), tags-fetch hydration race and tenancy instance-cache leak (2026-06-03) are all "module-scope or instance state that rebinds from persisted/server truth at the wrong time." Notably, the 2026-05-17 worklog deferred exactly the audit that would have swept the 2026-06-03 pair — and that audit was never filed. (4) *Vue-specific footguns*, each costing an investigation: boolean-prop omission casting to false (2026-06-08-basechart-active-prop-default), `<script setup>` per-instance scoping of "shared" resources (2026-06-09-mini-board-texture-scope-fix), v-memo inert under churning shallowRef (2026-05-30-perf-treewidget-nav-cost), container query unable to style its own container (2026-05-22-responsive-arc iter-16/17), structuredClone refusing Vue proxies (2026-05-16-match-cursor-independence). (5) *Duplication past the stated threshold*: seven hand-rolled identical throttles accumulated during the perf sweep before the DRY pass (2026-05-30-refactor-shared-throttle-mechanism), against the project's own N=2/N=3 extraction discipline; the hover-popover composable, by contrast, was extracted exactly at the pre-recorded N=3 trigger (2026-05-17-pbo-popover-and-rename).

**Deferred follow-ups and filing status.** Confirmed filed: thumbnail-render-lifecycle-consolidation, knob-wire-key-derivation, responsive-design-deferred, nav-during-range-query-perf (with its re-profile residual), pv-hover-jank-range-query, many-boards-open-slowness, perceptual-event-projection, engine-connection-lifecycle-logout, i18n-string-sweep; DEBUG_PACKETS gating landed (PR #311); pre-merge-checklist, bookmark reshape, timing consolidation, qEUBO e2e all closed. Dangling items are listed per-worklog in the findings; the highest-value ones are the unfiled module-scope rebinding audit, the unfiled useStabilityMetrics O(N)-per-frame treatment (grep confirms no accumulator/throttle in the file today), the five match-arc postmortem recommendations, and the configurable rootInfo display whose tracking pointer (todo_local item 6) has since been rewritten out from under it. A structural observation: deferrals recorded only inside design notes (keybindings modifier/chord/mouse/mousewheel) or postmortems are invisible to the SSOT the umbrella CLAUDE.md declares canonical.

**Fighting the architecture.** Mostly the record shows the project catching itself: the first thumbnail-linger proposal (a per-host generation token) was rejected by an out-of-frame audit as an UNDISCHARGED-HACK and redesigned into the existing reactive-pane shape (2026-06-09-thumbnail-hover-linger-fix); the lazyUpdate and rAF-coalesce chart experiments were reverted when they fought the actual packet cadence (2026-05-29/30); the ledger claw-back was measured worse because Vue's scheduler already batched (2026-06-08-ledger-stratified-keying). Genuine architecture-fights that shipped: PR #225's band-1 popover mounted inside an engine-gated wrapper (closest-match-by-imitation, 2026-05-14-toolbar-popover-band-mismatch); `JSON.parse(JSON.stringify())` deep-cloning a reactive board rather than restructuring ownership (2026-05-16-match-cursor-independence, acknowledged); and the F-optimizer — ~2,040 lines compensating for an upstream KataGo bug, shipped 05-17 and deleted 05-25 when upstream fixed it (2026-05-25-katago-f-optimizer-retirement). The named-removal-trigger and minFloor-separate-from-range disciplines made that retirement clean, but the episode is the cycle's largest write-then-delete.

The cross-cutting lesson for correctness/auditability refactoring: every recurrence in this cycle ended when an informal discipline became a checked artifact (branded keys, render-count guards, CI lint for service imports, the IDENTITY_SCOPED_CACHES registry, work_status_violations). The candidate refactorings below follow that grain.
````

**Findings (structured, verbatim):**

````json
[
 {
  "title": "Module-scope state rebinding audit was deferred and never filed; the bug class recurred twice",
  "evidence": "docs/worklog/2026-05-17-pbo-claim-rehydration-fix.md ('What's deferred': 'A targeted audit of \"module-scope state that rebinds from persisted truth on reload\" is worth a focused housekeeping pass', citing postmortem §7.3). No matching item in the todo DB (probed descriptions for 'module-scope', 'reactive-binding'). The same class then materialized as tags-fetch-hydration-race and tenancy-instance-cache-leak (docs/worklog/2026-06-03-tags-fetch-hydration-race-fix.md, 2026-06-03-tag-mutation-and-tenancy-fixes.md), both fixed reactively.",
  "implication": "File and run the audit: enumerate module-scope and component-instance state that derives from persisted/server truth (ledger, thumbnail caches, board-card-trees, forest roots, library preview) and verify each rebinds reactively or via the IDENTITY_SCOPED_CACHES registry. The 2026-06-03 registry pattern is the structural template — extend it rather than fixing instances one at a time.",
  "confidence": "high"
 },
 {
  "title": "useStabilityMetrics O(N)-per-frame follow-up is dangling: named 'the next step', not done, not filed",
  "evidence": "docs/worklog/2026-05-31-perf-incremental-enriched-projection.md ('Pending': 'The stability-panel computed (useStabilityMetrics) has the same O(N)-per-frame shape... The same treatment applies and is the next step'). grep of frontend/src/composables/analysis/useStabilityMetrics.ts (146 lines) finds no useThrottledSnapshot/accumulator/onLedgerFlush machinery; git log since 2026-05-31 shows only the rawKey re-key (6cb99d3, dd3b85e). No todo-DB item matches (stability-surface-distribution-metric is a different, information-geometric item).",
  "implication": "Either file it or apply the existing enriched-accumulator pattern (the equivalence-tested patchNode≡rebuild shape from enriched-accumulator.ts). This is the clearest unfinished thread of the perf arc and the cheapest to close because the pattern and its test discipline already exist.",
  "confidence": "high"
 },
 {
  "title": "Five match-arc postmortem recommendations are all dangling",
  "evidence": "docs/worklog/2026-05-15-match-pre-existing-variation-fixes.md ('What this arc does NOT close'): getActiveVariationPath call-site audit (§5b), playEngineMoves regression test, branded RootToLeafPath/RootToCurrentPath types, match-system docstring tightening (§5a), rigor-proportionality rubric adoption (§5c). DB probes for 'getActiveVariationPath', 'playEngineMoves', 'rigor', 'branded path', 'match' return zero items. The sibling worklog 2026-05-16-match-cursor-independence.md additionally leaves the structurally identical cursor-conflation bug latent in playEngineMoves/usePlayFromPosition ('A separate arc can apply the same pattern if/when the self-play affordance gets a UI wire') — also unfiled.",
  "implication": "The path-helper confusion class (root→leaf vs root→current) caused two real bugs and is enforced today only by memory. The 2026-06-08 key-brand arc proved branded types retrofit cheaply here; branding the two path shapes (or at minimum filing the call-site audit) would close the class the way RawKey/EnrichedKey closed the ledger class.",
  "confidence": "high"
 },
 {
  "title": "Deferrals recorded only in design notes/postmortems are invisible to the declared SSOT",
  "evidence": "Keybindings deferred items (modifier support, chord bindings, mouse-binding overrides, mousewheel-action audit) live only in docs/notes/keybindings-plan.md per docs/worklog/2026-05-27-keybindings-phase5-tests.md; none appear in the todo DB. Same shape: proxy-topology follow-ups recorded in the revised plan note (2026-05-16-proxy-topology-testing.md 'Follow-ups recorded'), match-postmortem recommendations (above). Umbrella CLAUDE.md declares the todo DB 'the canonical record of open / shipped / deferred work status'.",
  "implication": "A one-time sweep filing design-note/postmortem deferrals as `future` items (or explicitly declaring them non-items) would make the SSOT honest. Going forward, the worklog template's 'What's deferred' section could require either a work-status id or an explicit 'not filed because…' line — the same discipline the cochange-advisory applied to derived docs.",
  "confidence": "high"
 },
 {
  "title": "Smaller dangling follow-ups, per worklog",
  "evidence": "(a) 2026-05-15-toolbar-rootinfo-slim.md — configurable rootInfo-capture display; its tracking pointer (todo_local.gitignore item 6) has since been rewritten and no longer contains it; not in DB. (b) 2026-05-16-per-board-multi-query.md — dropping store.engine.activeMode after a confidence pass; unfiled. (c) 2026-05-17-pbo-claim-rehydration-fix.md — intlify missing-key warning noise (te()-guard) and structuredClone-per-migration cold-start cost ('its own arc'); unfiled. (d) 2026-05-17-pbo-popover-and-rename.md — wire-level qeubo→pbo rename ('would land via a dispatch'); no DB item. (e) 2026-05-27-perf-fix4-per-board-watchers.md — Follow-Me watcher throttle, MoveSuggestions inline pointerEvents, use-pv-animation scheduleWindow reset; unfiled (mutateBoard dual-trigger and rIC chunking were later resolved by Arc 1 and the RB-3 closure). (f) 2026-05-27-review-intermission-move-block.md — paste-handler permissiveness asymmetry during LOADING/ANALYZING; unfiled. (g) 2026-05-27-keybindings-phase2.1 — profiler-cli evaluation, superseded de facto by the Chrome/CDP harness but never recorded as dropped. (h) 2026-05-29-perf-distribution-redraw-coalescing.md — confirming capture for the lazyUpdate revert. (i) 2026-05-29-feat-clear-cache-affordance.md — folding the lookup_cache caveat into the normalization protocol (unverified). (j) 2026-06-01-doc-graph-churn-reduction.md — deterministic edges-array sort. (k) 2026-06-01-drop-jquery.md — QA pass over auth/library/qEUBO/settings flows (unverified). (l) 2026-06-08-key-brand-tightening.md — Model brand for SELECTOR labels left bare, deliberately, untracked. (m) 2026-05-17-card-forest-navigation-persistence.md — O14 audit-pair retrofit, cursor persistence, per-(board,root) keying; partially superseded by the 2026-06-09 board-scope arc and the open spa-board-scope-consistency-audit item, but never individually dispositioned.",
  "implication": "Most are individually low-stakes; collectively they show the 'What's deferred' sections functioning as a shadow tracker. A single triage pass over this list (file / drop-with-record / confirm-done) would clear it.",
  "confidence": "high"
 },
 {
  "title": "Render-coupling recurred ~9 times before being mechanized; remaining instances should be hunted by the invariant, not by symptom",
  "evidence": "Fixes of the same anti-pattern: 2026-05-29-perf-nav-arc2-app-decouple.md, 2026-05-29-perf-nav-rb1-toolbar-metrics-decouple.md, 2026-05-29-refactor-analysis-panel-phase0-seam.md, 2026-05-30-perf-toolbar-metrics-extraction.md, 2026-05-30-perf-queue-tooltip-throttle.md, 2026-05-30-perf-chart-accessor-decoupling.md (two instances), 2026-05-31-perf-treewidget-render-decouple.md, 2026-05-31-perf-boardtab-rugplot-canvas.md. Recurrence stopped once R/P≈1.00 became a checked invariant (render-count guards + perf battery; 2026-06-01-perf-scenario-harness.md shows R/P=1.00 across the board).",
  "implication": "The auditability lesson: an anti-pattern named in a postmortem keeps recurring until a machine checks it. Candidate refactoring: a periodic battery run asserting the R/P invariant per component (it is already cheap) plus a grep-level audit for templates reading per-packet reactive values, rather than waiting for the next jank report.",
  "confidence": "high"
 },
 {
  "title": "Vue footguns cost five separate investigations; they are recorded in scattered worklogs only",
  "evidence": "Boolean-prop omission→false (2026-06-08-basechart-active-prop-default.md, including the generalized lesson: opt-out boolean gate props are a footgun); per-instance <script setup> scope on 'shared' resources (2026-06-09-mini-board-texture-scope-fix.md); v-memo inert under churning shallowRef + group-memo O(N) burst (2026-05-30-perf-treewidget-nav-cost.md 'Method lessons'); container-query self-styling never matches (2026-05-22-responsive-arc.md iter-16/17); structuredClone vs reactive Proxy (2026-05-16-match-cursor-independence.md 'Gotcha').",
  "implication": "Consolidate into one short checked reference (frontend CLAUDE.md section or a lint where expressible — e.g. an ESLint rule flagging bare boolean props whose name reads as a gate, or module-level mutable state declared inside <script setup>). The texture-scope bug shows the class stays latent until a second consumer with a different lifecycle arrives; the open thumbnail-render-lifecycle-consolidation item is the worked example to anchor it.",
  "confidence": "medium"
 },
 {
  "title": "The migration ledger's hand-walked blob paths produced a silent no-op migration and a repair migration",
  "evidence": "docs/worklog/2026-05-25-katago-f-optimizer-retirement.md: the first 47→48 draft 'walked out.settings?.knobs instead of the correct out.profile?.settings?.knobs..., silently did nothing, and stamped to v48'; 48→49 exists solely to repair blobs the broken version stamped. Related cost flag: structuredClone per migration over a growing blob (2026-05-17-pbo-claim-rehydration-fix.md), unfiled.",
  "implication": "Correctness opportunity: migrations are the one place where ADR-0002 fail-loud is structurally absent — a wrong path is indistinguishable from an absent field. A tiny typed path-accessor helper for the active migration body (or a post-migration assertion that the targeted leaf exists when the pre-image had it) would convert this silent class into a loud one without violating the append-only freeze of shipped bodies.",
  "confidence": "medium"
 },
 {
  "title": "Composite-key-over-heterogeneous-provenance is a proven bug class; one audit found no third instance, but the pattern of discovery was reactive",
  "evidence": "docs/worklog/2026-06-08-ledger-stratified-keying.md (ledger), 2026-06-08-stability-trajectory-stratified-keying.md (the twin, found only because the ledger fix flagged it in-code), 2026-06-08-key-brand-tightening.md (the follow-up audit: 'no new instance' of the dangerous class; brand-hygiene gaps fixed). Earlier members of the conflation family: per-board single-slot maps (2026-05-16-per-board-multi-query.md), match cursor (2026-05-16-match-cursor-independence.md), KnobDomain (2026-05-14-knob-registry.md postmortem).",
  "implication": "The branded-key + single-mint-site pattern demonstrably retrofits cheaply (817 tests green, zero runtime change). The candidate lesson: when introducing any new keyed cache, require the key to be a brand whose declaration names the dependency set of the value — making the 2026-06-08 audit a construction-time rule rather than a periodic sweep.",
  "confidence": "medium"
 },
 {
  "title": "Extraction-threshold discipline lapsed under perf-sweep pressure (7 hand-rolled throttles), then self-corrected",
  "evidence": "docs/worklog/2026-05-30-refactor-shared-throttle-mechanism.md: 'Seven surfaces... each hand-rolled the identical leading+trailing setTimeout boilerplate — well past this codebase's composable-extraction threshold.' Contrast: useHoverPopover extracted exactly at the pre-recorded N=3 trigger (2026-05-14-popover-hover-finickiness.md set the trigger; 2026-05-17-pbo-popover-and-rename.md honored it).",
  "implication": "The popover case shows pre-recording the extraction trigger in the N=2 worklog works; the throttle case shows that absent a recorded trigger, rapid sequential PRs replicate boilerplate. Lesson: when a second instance of a mechanism lands, record the N=3 trigger in the worklog then — it makes the eventual extraction mechanical and timely.",
  "confidence": "medium"
 },
 {
  "title": "Workaround lifecycle discipline validated by the F-optimizer arc, at the cost of ~2,040 written-then-deleted lines",
  "evidence": "2026-05-15-katago-first-report-floor-mitigation.md (minFloor deliberately separate from range[0] 'so retiring the workaround is one field drop + one schema migration'), 2026-05-17-katago-f-optimizer.md (the optimizer ships), 2026-05-25-katago-f-optimizer-retirement.md (upstream #1197 fixed; 2,040 lines deleted cleanly, floor dropped to protocol minimum, two migrations walk persisted decls forward).",
  "implication": "The retirement was clean precisely because every workaround surface carried a named removal trigger and lived in separable fields/files — worth keeping as the canonical worked example. The open question for future upstream bugs is calibration: the already-shipped 35 ms floor was arguably sufficient pending the upstream fix; the optimizer's marginal value (median 94 ms) lasted eight days. A 'how long do we expect upstream to take' check belongs in the decision to build compensation machinery.",
  "confidence": "medium"
 },
 {
  "title": "Out-of-frame adversarial review caught a hack that in-frame reasoning had rationalized — twice load-bearing in one cycle",
  "evidence": "2026-06-09-thumbnail-hover-linger-fix.md: first proposal (generation token in one of two writers) returned UNDISCHARGED-HACK; the shipped redesign removed the second imperative host entirely and was independently re-verified (verdict 'general', writer delta 2→1, appendices verbatim). 2026-05-30-perf-treewidget-nav-cost.md: 'the adversarial firewall review caught the markRaw/reference fact and the group-memo tail regression'; the user's drift-skepticism overturned a control reading that an in-frame review had accepted.",
  "implication": "For auditability-for-humans, the verbatim commission+report appendix pattern (per the consult-verbatim memory) plus out-of-frame review for >1-writer state is earning its cost. Candidate process refactoring: make the writer-enumeration step a standing requirement for any fix touching shared visible/cache state, not just when suspicion arises.",
  "confidence": "high"
 },
 {
  "title": "Perf measurement methodology consolidated from ad-hoc to disciplined; the key transferable lessons are recorded but scattered",
  "evidence": "Arc: ad-hoc jq (2026-05-27-keybindings-phase2.1) → ADR-0009 proposal → counts-not-wallclock and load-normalization (2026-05-30-perf-queue-tooltip-throttle.md, -toolbar-metrics-throttle.md) → base-twice drift floor and control-validity (2026-05-30-perf-treewidget-nav-cost.md, -boarddisplay-memo.md) → trace-the-jank-not-the-biggest-cost (2026-05-30-perf-autosave-trailing-debounce.md 'Meta — the lesson': charts were the visible cost, auto-save serialization was the jank) → render-vs-patch marks both needed (2026-05-31-perf-treewidget-render-decouple.md) → headless masks paint (2026-06-01-perf-miniboard-canvas-renderer.md) → scenario harness + battery (2026-06-01-perf-scenario-harness.md).",
  "implication": "The lessons live in ~8 worklogs plus memories. Since several 2026-05-31 worklogs still say 'Validation (pending capture)' and were only implicitly validated by later batteries, a one-page measurement-lessons digest (or ADR-0009 appendix) with the canonical pitfalls would shorten the next investigator's path and let pending-validation claims be closed explicitly.",
  "confidence": "medium"
 }
]
````

**Coverage (verbatim):**

````
Read fully (end to end, this session): all 91 worklogs under /home/bork/w/omega/docs/worklog/ (2026-05-12-dsl-hyperparameter-harness.md through 2026-06-09-thumbnail-hover-linger-fix.md, per the ls listing); /home/bork/w/omega/services_local.gitignore; /home/bork/w/omega/tools/work-status/schema.sql; /home/bork/w/omega/todo_local.gitignore. The umbrella CLAUDE.md was supplied verbatim in my context. Queried read-only: the `todo` Postgres DB (full item listing; description probes for ~30 deferred-follow-up keywords; no writes). Spot checks via git/grep: git log for useStabilityMetrics/stability-trajectory-store since 2026-05-31; git log for DEBUG_PACKETS (landed, PR #311); grep of useStabilityMetrics.ts for accumulator/throttle machinery (absent — I did not read that file in full, so my claim is limited to 'the named treatment's machinery is not referenced in it').

NOT read (named per ADR-0002 so the gaps are visible): the postmortems, design notes, retrospectives, ADRs, FILES.md/IDENTIFIERS.md, perf-capture-normalization-protocol.md, pre-merge-checklist.md, and docs/dispatch/ that the worklogs reference. Every statement I make about those documents' contents is relayed from the worklogs that cite them, not first-hand — this chiefly affects: (a) whether the keybindings plan-note deferred sections still carry the four deferred items verbatim; (b) whether the clear-cache lookup_cache caveat was folded into the normalization protocol (marked unverified); (c) whether a qeubo→pbo rename dispatch exists under docs/dispatch/ (marked unverified); (d) whether the proxy-topology revised note's two follow-ups were later actioned. I also did not read frontend/scripts or most source files, so 'dangling' verdicts rest on the todo DB plus the targeted greps above, not on exhaustive code search. Per the licensing firewall, nothing under backend/qeubo/ was read. Today's date in the environment is 2026-06-09; the worklog set is current through that date.
````

### §1 · harvest:worklog-2026-04

**Commission** (= `[SHARED: HARVEST-PREAMBLE]` + the following + `[SHARED: HARVEST-OUTRO]`):

````
Read EVERY worklog under /home/bork/w/omega/docs/archive/worklog/2026-04-pre-v1.0/ end to end (ls it first). Extract: (1) recurring friction themes across PRs in the pre-v1.0 cycle; (2) deferred follow-ups and "known gap" admissions — and whether each is filed in the todo DB (read-only SELECT), shipped since, or silently dangling; (3) architectural choices made under release pressure that the cycle itself flagged as provisional. List dangling follow-ups with filenames.
````

**Report (verbatim):**

````
## Pre-v1.0 worklog mining (2026-04-27 → 2026-04-30, 29 worklogs)

All 29 files under `docs/archive/worklog/2026-04-pre-v1.0/` were read end to end (~6,000 lines). The cycle covers six arcs: the B5 auth/identity arc, the C2 App.vue extraction arc, de-branding + schema-versioning, release wrap-up fixes (rugplot, hue slider, keybinding guard, ownership overlay), the seven-PR qEUBO arc, and the release-scope items (card-tree, pass handling, save-SGF, analysis-range, default palette).

### Recurring friction themes

1. **Identity vs. concurrency layering.** The cycle's gravest bug (silent data loss; `2026-04-27-b5-finalization-identity-aware-sync.md`) came from `ensureAuthenticated`'s silent identity substitution plus a single-shot hydration flag. The fix established identity-keyed gates + generation counters; the worklog's "ownership wants identity-keyed state, concurrency wants ETags" framing is the cycle's best transferable lesson and was correctly carried into TODO #28's design.
2. **Two physical representations of one nominal state.** `2026-04-27-todo-28-jwt-401-retry.md` diagnosed api-client's JWT lifecycle vs. `useAuth.state` as "architectural drift" and shipped a callback bridge as an explicitly partial fix, filing the structural fix as RFC-0001 open question 9.
3. **Vue reactivity + tooling footguns around template refs.** C2.2's composable-takes-ref-as-parameter lesson (vue-tsc string-ref tracking) and card-tree's "Maximum recursive updates exceeded" (ref-callback writing a `shallowRef<Map>` mid-render; fixed by imperative sync + non-reactive container + external watch) are the same family: reactive writes from render-adjacent positions.
4. **Migration/hydration interaction.** Seven schema versions shipped in four days. The round-1 de-branding collision-guard incident (`2026-04-27-debranding-round-1-store-migration.md`) showed that `deepMerge` hydration + watcher-fired saves mid-hydrate can persist hybrid states the migration author never anticipated; the "always promote, never collision-guard" rule came out of it. Migration unit tests were declined twice as premature ("trivially testable from a console"); a real suite exists now (`frontend/tests/unit/store/migrations.test.ts`).
5. **Manual user smoke as the load-bearing verification** in essentially every PR, with "mental walk-through" substituting where no UI consumer existed yet.
6. **Explore/grep blind spots**: the round-2 rename missed all `.vue` call sites (25% undercount), caught only by the build.

### Fate of deferred follow-ups

**Filed in the todo DB and still open (tracked, honest):** `engine-connection-lifecycle-logout`, `item-27-etag-multitab`, `policy-head-overlay`, `refactoring-queue-adr0007`, `adr-effectiveness-audits` (all verified by read-only SELECT).

**Shipped since:** `remove-legacy-auth-key-shim`, `tags-fetch-hydration-race`, `loadaction-type-dishonest`, `silent-guard-handleloadcard`, `stringly-typed-api-errors` (the qeubo-service `extractStatus` regex coupling — closed via typed `ApiError`, but only after an audit + RCA), `qeubo-e2e-validation`. The backend `TreeBuilder` test-helper breakage was repaired (now used by current integration tests).

**Silently dangling (no work-status record found; current-state verified):**
- `sendSync` assertion upgrade to a throw once the error boundary landed (b5-finalization "Out of scope") — boundary landed the same day; `sync-service.ts:270` still `console.error` + return.
- `unhandledrejection` backstop (root-error-boundary "worth-doing-eventually") — absent from `frontend/src`.
- Backend de-branding (`X-Ebisu-Token`, `.ebisu_secret_key`, `ebisu.db`; debranding-round-2 "Out of scope") — literals still in `backend/main.py` and `backend/core/config.py`; no DB item, no TODO.md projection entry.
- `gen:api` hardcoded `127.0.0.1:8764` (`frontend/package.json:14`) — worked around manually in two separate worklogs, never fixed or filed.
- `window.prompt`/`confirm` → proper modal ("future polish") — the idiom instead spread to three components.
- Auth-state structural fix: RFC-0001 is still **Draft**; `docs/audits/` was never created; the callback bridge (`api-client.ts:76–78, 194`) remains the live shape. Tracked only at one remove via `adr-effectiveness-audits`.

### Provisional choices flagged by the cycle itself

`overlayLayers.ownership` named-keys record as a "stepping stone" to an open-keyed overlay registry (the registry never came; policy overlay still open/future); the rugplot's 100000 target floor and the explicitly-rejected first attempt (over-aggressive alpha fade, caught by the user mid-cycle); the `'default'` palette retained "removable in a successor release" (still in `defaults.ts:234,510`); `QEUBO_ENABLED` defaulting False against dispatch v1.1's `true`; C2.3's decision to leave SyncService reading `store`/`api` from module scope. Most notably, C2.3 declared App.vue at 500 lines "the bounded-scope steady state"; it is 718 lines today, and the open `refactoring-queue-adr0007` item records that most budget-flagged files have grown since.

### Net lesson for the review

The cycle's discipline was strongest where deferrals entered a ledger (deferred-items.md → todo DB: everything tracked there either shipped or is honestly open) and weakest where they lived only in worklog "Out of scope" sections, RFC open questions, or dispatch replies — those are exactly the items that dangled. The `extractStatus` case shows the cost profile: a coupling admitted in prose at authoring time later required an audit and an RCA to close. The refactoring opportunities with the best correctness/auditability return are the auth single-owner rework (closing RFC-0001 Q9's bridge), a hydration-invariant test for the migration/deepMerge interplay, and a one-time harvest of pre-v1.0 out-of-scope admissions into the work-status store.
````

**Findings (structured, verbatim):**

````json
[
 {
  "title": "Deferrals recorded only in worklog 'Out of scope' sections dangled; ledgered ones did not",
  "evidence": "Dangling with no todo-DB record (verified by SELECT over titles+descriptions and by current-state checks): sendSync throw-upgrade (promised in docs/archive/worklog/2026-04-pre-v1.0/2026-04-27-b5-finalization-identity-aware-sync.md 'Out of scope'; frontend/src/services/sync-service.ts:270 still console.error+return), unhandledrejection backstop (2026-04-27-root-error-boundary.md; absent from frontend/src), backend de-branding (2026-04-27-debranding-round-2.md; X-Ebisu-Token still in backend/main.py and backend/core/config.py), gen:api hardcode (frontend/package.json:14, flagged in two worklogs). By contrast every deferred-items.md/TODO.md entry from the cycle is now a todo-DB row, open or shipped (e.g. engine-connection-lifecycle-logout, item-27-etag-multitab, remove-legacy-auth-key-shim, tags-fetch-hydration-race).",
  "implication": "One-time harvest pass: sweep archived worklogs' Out-of-scope sections into the work-status store (file or explicitly drop each). Going forward, treat a worklog out-of-scope admission as needing either a DB item or an explicit 'deliberately not filed' line.",
  "confidence": "high"
 },
 {
  "title": "Known-coupling admissions that ship in prose eventually cost an audit + RCA (extractStatus)",
  "evidence": "2026-04-28-qeubo-frontend-composable-and-service.md admitted the regex parse of api-client's error-message format would 'silent-fail' if the format changed ('captured as a known coupling'). Todo item stringly-typed-api-errors is closed/shipped with title 'Stringly-encoded API errors reverse-engineered downstream (audit + RCA)'; current frontend/src/services/qeubo-service.ts:68 now uses `err instanceof ApiError ? err.status : null`.",
  "implication": "Lesson: a stringly boundary acknowledged at authoring time should get the typed error class immediately (it was a ~20-line change) or a filed item — prose acknowledgment alone deferred the cost into an RCA. Candidate audit: the open silent-coercion-at-protocol-boundaries item is the right vehicle for remaining cases.",
  "confidence": "high"
 },
 {
  "title": "Auth state still has two physical representations bridged by callback; the structural fix and the audit that would catch the pattern class never executed",
  "evidence": "2026-04-27-todo-28-jwt-401-retry.md filed the structural fix as RFC-0001 open question 9. docs/rfcs/0001-adr-meta-review.md (read end to end) is still Status: Draft (dated 2026-04-27; today 2026-06-09); docs/audits/ does not exist; the bridge is live at frontend/src/services/api-client.ts:76-78,194 with registration in frontend/src/composables/auth-app/useAuth.ts. Todo item adr-effectiveness-audits (open/active) says 'the per-tenet audit cadence remains open' and 'ADR-0002 most overdue'.",
  "implication": "Refactoring opportunity with direct correctness+auditability payoff: single-owner auth state (api-client throws on 401, never mutates auth-visible state; useAuth owns all transitions), retiring the convention-only alignment. Independently, run RFC-0001 Q9's cross-module state-pair enumeration once as a bounded audit rather than waiting on the full RFC.",
  "confidence": "high"
 },
 {
  "title": "ADR-0007 bounded-stopping declarations did not hold; budget-flagged files regrew without a ratchet",
  "evidence": "2026-04-27-c2.3-extract-use-app-bootstrap.md: 'App.vue at 500 lines is the bounded-scope steady state.' Current wc: frontend/src/App.vue = 718 lines. 2026-04-28-qeubo-frontend-parameter-meta-editor.md flagged PaletteEditor at 512 ('extraction PR is a follow-on cleanup'); now frontend/src/components/editors/PaletteEditor.vue = 626. Todo item refactoring-queue-adr0007 (open/active) confirms 'most GROWN since' and records that the priority-queue framing was retired in favour of handled-on-touch.",
  "implication": "Either accept the decay openly (amend ADR-0007's target language) or add a cheap mechanized ratchet (advisory CI line-count delta on touched over-budget files, analogous to the doc-graph freshness gate). Unenforced budgets that quietly fail erode the auditability the ADR exists to provide.",
  "confidence": "high"
 },
 {
  "title": "Migration x deepMerge-hydration x watcher-fired-save interplay is the cycle's most error-prone machinery; its invariant is still untested as a composition",
  "evidence": "2026-04-27-debranding-round-1-store-migration.md documents the hybrid 3-key state persisted to the backend via a watcher-fired save mid-hydrate, the failed collision-guards, and the 'always promote' rule. Seven schema versions shipped in four days (worklogs of 04-27 through 04-30). Migration tests were declined twice as premature (2026-04-27-store-schema-versioning.md; 2026-04-28-qeubo-frontend-schema-migration.md); per-migration tests now exist (frontend/tests/unit/store/migrations.test.ts) plus frontend/src/store/archived-migrations.ts.",
  "implication": "Candidate test: a composition-level invariant ('hydrating any legacy blob through migrate + updateFromRemote + an immediately-firing save never persists a key set differing from a clean migration of the same blob') — the round-1 incident was exactly this composition, which unit tests of individual migrations don't cover. Worth checking whether the existing suite already covers it before filing.",
  "confidence": "medium"
 },
 {
  "title": "Two reusable Vue patterns earned the hard way; worth codifying so they don't get re-derived",
  "evidence": "C2.2 (2026-04-27-c2.2-extract-use-dirty-board-guard.md, 'Lessons'): composable-takes-template-ref-as-parameter beats composable-owns-ref (vue-tsc string-ref tracking + VNodeRef typing). Card-tree (2026-04-29-card-tree-frontend.md, 'Implementation iterations'): ref-callbacks writing to reactive containers mid-render loop ('Maximum recursive updates exceeded'); fix shape = imperative syncCharts + non-reactive Map + external watch with nextTick.",
  "implication": "If frontend/CLAUDE.md or a conventions note doesn't already carry these two patterns, adding them is a cheap auditability gain — both bugs were silent-until-runtime and both fixes are shape conventions a reviewer can check statically.",
  "confidence": "medium"
 },
 {
  "title": "'Stepping stone' shapes shipped under release pressure mostly held, but their promised generalisations never materialised and are not all tracked",
  "evidence": "overlayLayers.ownership named-keys record was 'a stepping stone' to an open-keyed registry (2026-04-28-ownership-map-overlay.md); policy-head-overlay is open/future in the DB but no registry item exists. The 'default' palette retained 'removable in a successor release' (2026-04-30-default-palette.md) is still in frontend/src/store/defaults.ts:234,510. window.prompt/confirm 'future polish' (2026-04-28-qeubo-frontend-bookmarks-ui.md) instead propagated to QeuboBookmarks.vue, PboPopover.vue, CardMetadataPanel.vue.",
  "implication": "Low-severity individually, but the pattern is the same ledger gap as finding 1: a provisional shape should carry either a filed follow-up or an explicit decision to keep it. The prompt/confirm idiom spreading suggests it is now de facto policy — saying so in a note would be cheaper than the implied-but-unfiled modal rework.",
  "confidence": "high"
 },
 {
  "title": "Manual user smoke was the sole verification for nearly every pre-v1.0 PR",
  "evidence": "Every one of the 29 worklogs' Verification sections lists `npm run build` plus user-confirmed manual smoke; 'mental walk-through' substitutes where no UI consumer existed yet (2026-04-28-qeubo-frontend-schema-migration.md §Verification 2; 2026-04-28-qeubo-frontend-bookmarks-ui.md §Verification 2). A frontend test tree now exists (frontend/tests/{unit,integration,e2e,fakes}).",
  "implication": "When prioritising backfill coverage, the pre-v1.0 incident record points at the highest-yield targets: sync identity gating (the B5 regression scenarios are already written as smoke scripts in the worklog and translate directly to integration tests), migrations-with-hydration, and the keybinding context guard.",
  "confidence": "medium"
 }
]
````

**Coverage (verbatim):**

````
Read fully (end to end, this session): all 29 worklogs under /home/bork/w/omega/docs/archive/worklog/2026-04-pre-v1.0/ (~6,000 lines; ls-verified count 29); docs/rfcs/0001-adr-meta-review.md (343 lines). Read partially (sanctioned or non-documentation): tools/work-status/schema.sql (first ~80 lines, used only for table/column names appearing in that portion); services_local.gitignore (first 30 lines, connection facts only); code spot-checks via grep/sed with line numbers (sync-service.ts lines 255-295, qeubo-service.ts lines 55-85, api-client.ts grep hits, package.json:14, defaults.ts grep hits, wc on App.vue/PaletteEditor.vue) — these are source files, not documentation, and were inspected only to verify current-state claims at the cited lines. Todo DB: read-only SELECTs only (full 88-row id/state/title listing plus targeted description fetches and regex searches over title+description). NOT read (named as pointers only, no content claims made): docs/notes/postmortem/* (including the stringly-typed-api-errors RCA and rca-discipline-lapses-2026-06-01), docs/archive/notes/qEUBO.md, docs/notes/{frontend-,}test-coverage-2026-05.md, docs/notes/investigation-refactoring-queue-adr0007-2026-06-02.md, dispatch files, docs/TODO.md (grepped for 'ebisu' only), the vestige deferred-items per-item notes (directory listings only), frontend/tests/unit/store/migrations.test.ts (existence only — finding 5's 'composition not covered' is therefore a hypothesis to check, not a verified gap). Caveats: 'no DB item exists' claims rest on regex searches over titles+descriptions (terms: unhandledrejection, sendSync, gen:api, openapi, prompt, TreeBuilder, migration/test, drift, auth-state, api-client, extractStatus, composite endpoint, ForestStat, default palette, X-Ebisu/ebisu/secret, debrand, card-tree, App.vue); an item phrased very differently could have been missed. The card-tree 'date in per-tree header' and 'multi-root composite endpoint' deferrals were checked only via those searches (no match) — their dispatch-reply filing was not read, so I did not list them as confirmed-dangling. backend/qeubo/ was not read (licensing firewall); the two backend qEUBO worklogs were read but no qeubo runtime source was opened. No performance properties asserted anywhere; the rugplot worklog's 'fast-mode gradient bypass' deferral is noted in the worklog itself as unprofiled and I treated it accordingly.
````

### §1 · harvest:mech-conformance

**Commission** (= `[SHARED: HARVEST-PREAMBLE]` + the following + `[SHARED: HARVEST-OUTRO]`):

````
Mechanical-conformance audit of frontend/src at HEAD. FIRST read /home/bork/w/omega/docs/notes/investigation-refactoring-queue-adr0007-2026-06-02.md end to end — an existing ADR-0007 refactoring-queue investigation; your job includes DIFFING current state against it (what grew since 2026-06-02, what was since fixed, what it missed). Then:
1. File-size posture: compute wc -l for all .ts/.vue under frontend/src; compare against ADR-0007 budgets (TS ≤200, ≤300 for coherent state machines; SFC ≤250, no section >150). Separate by-design exceptions (types/backend.ts generated; archived-migrations.ts rolling archive).
2. ACL leaks: grep for imports of types/backend outside src/services/ (the rule: only services import wire types).
3. Unjustified casts: grep for ' as ' in frontend/src .ts files (excluding 'as const' and import-as), sample ~30 hits and check each for the justification comment frontend/CLAUDE.md requires.
4. Band drift: pick ~10 files tagged [B1] (domain-agnostic) in frontend/FILES.md (lookup-reference, partial consultation sanctioned) and verify none imports from engine/katago or Go-bound modules.
5. Store mutator discipline: in frontend/src/store/index.ts (read it end to end), check whether mutations outside named mutators exist (grep for direct store field assignment in components/composables, sample-based).
Report concrete violations with file:line.
````

**Report (verbatim):**

````
## Mechanical-conformance audit of frontend/src at HEAD (2dc056e), diffed against the 2026-06-02 ADR-0007 investigation

### 1. File-size posture, and the diff against the investigation

The 2026-06-02 investigation (docs/notes/investigation-refactoring-queue-adr0007-2026-06-02.md) tracked the 8 files named in `refactoring-queue-adr0007`. One week later: App.vue 708→718, types.ts 2245→2362 (+117 in a week), BaseChart.vue 597→614, ForestDirectory.vue 500→514, MintCardModal.vue 396→404, PaletteEditor.vue 626→626, HorizontalTimelineVisualizer.vue 513→513, useReviewSession.ts 664→656 (the only shrink). The 27 frontend commits since 2026-06-02 include real refactors (timing.ts consolidation 4fcea37, brand tightening dd3b85e, teardown registry 3e14d79) but no ADR-0007 file-size work.

What the investigation's frame misses is membership, not counts. Excluding the two by-design exceptions (generated types/backend.ts at 3032; archived-migrations.ts at 2408 per the rolling-archive discipline), HEAD has **29 .ts files over the 300-line state-machine ceiling, 50 over the 200 target (of 139), and 33 of 69 SFCs over 250**. The heaviest offenders were never on the queue: services/analysis-service.ts 1181, composables/useQeubo.ts 979, composables/board/usePlayFromPosition.ts 815, lib/knobs.ts 802, store/index.ts 789, store/defaults.ts 722. Section-level (ADR-0007 §Size: no SFC section >~150): App.vue is over in all three sections (script 358, template 161, style 191); BaseChart.vue is a 590-line `<script setup>` with a **2-line template** (lines 612–614) — a composable wearing an SFC suit. The C2-era conclusion "the bulk is template + styles, not logic" does not describe today's over-budget set, which is script/service-logic-heavy — precisely the case ADR-0007 prescribes structural extraction for, with no contraction escape hatch.

### 2. ACL leaks

Inbound is clean: `types/backend` imports outside services/ occur only in types.ts:81, a commented type-only re-export seam aliasing wire shapes (CardCreatePayload etc., types.ts:2115–2130). But that comment documents an outbound asymmetry: "there is no inverse-mapper for the create flow… the composable (composables/review/useMinting.ts::prepareDraft) constructs the payload literally." Verified — useMinting.ts:108–154 builds snake_case `grading_parameter` as `Record<string, any>` with a brand-erasure cast (line 46). frontend/CLAUDE.md:60 ("The ACL is the only place wire shapes appear; no other module sees snake_case") is violated as written, openly, in a composable.

### 3. Unjustified casts

224 candidate `as`-sites in .ts (excluding `as const`, import/export-as, comments, the two exempt files). Deterministic sample of 32, each inspected with context: ~10 carry the justification comment frontend/CLAUDE.md:176–178 requires (e.g. useAnalysisProjection.ts:75, analysis-persistence-service.ts:164, sgf-loader.ts:37/41); ~5 are ACL brand-construction sites arguably sanctioned by §Type-driven design ("construction goes through the ACL"); **~17 are bare**. Notable: `as any` at engine/sgf-loader.ts:83/89 (parent/children links), katago-client.ts:133 (`this.subscribe(query as any, …)`), useReviewSession.ts:266 (`parsedBoard.id = bId as any`); a redundant cast at useReviewSession.ts:300 (`board.currentNodeId as NodeId` — already `NodeId` per types.ts:270); and the correctness-relevant pair analysis-service.ts:646/836: `res as KataAnalysisResponse` where `res` is the `KataGoResponse` union (engine/katago/types.ts:498–501) and katago-client.ts:101–104 forwards error packets to subscribers unconditionally — a `KataErrorResponse` reaches `onAnalysisUpdate` mis-typed and is silently consumed as a packet (ADR-0002 concern). Conformance to the cast rule is roughly 50% in sample.

### 4. Band drift

Of 12 [B1]-tagged files checked (FILES.md, sanctioned partial consultation), 10 are clean. Two drift: composables/auth-app/useAppBootstrap.ts:30 imports `setIntensityHueShift` from engine/suggestion-colors ([B3] per FILES.md:246) while tagged [B1] (FILES.md:175); composables/useQeubo.ts:87 imports `generateUUID` from engine/util ([B3] per FILES.md:248) while tagged [B1] (FILES.md:148). The second is a placement smell rather than real coupling — generateUUID is domain-agnostic but cohabits with Go-bound coord helpers.

### 5. Store mutator discipline

store/index.ts read end to end. The discipline holds where it matters: **zero** direct structural `store.boards` writes outside the store module. 31 external direct-write sites exist; template `session.ui` toggles (App.vue:382–403, StatusBar.vue:102, SettingsTab.vue:114) are explicitly sanctioned by ADR-0001 §"Exception: UI state written directly from templates" (read end to end — it quotes the App.vue toggle verbatim). The fray is at persisted profile state: useQeubo.ts:767 (settings write), :824–826 (push to `profile.qeuboPinnedBookmarks`), useLocale.ts:66, scenarioContext.ts:125/234, and `store.knownTags` with two external writers (useTags.ts:45, useAppBootstrap.ts:419) plus the store-internal reset (store/index.ts:652) — a multi-writer slot without a named owner. ADR-0001's stated boundary ("small UI toggles may write directly; structural state goes through mutators") leaves "persisted profile collections" undefined; ADR-0001 "Revisit when" #3 names exactly this breakdown as the trigger.

### Overall

The codebase's conventions are unusually well-documented and the structural ones (board mutators, inbound ACL, teardown registries) hold. The decay pattern is consistent: rules enforced only by review (cast comments, file-size queue, band tags, outbound ACL) drift; rules with a mechanism (ESLint import-boundary, CI typecheck, registries with tripwire tests) hold. The refactoring opportunities below mostly convert the former into the latter.
````

**Findings (structured, verbatim):**

````json
[
 {
  "title": "ADR-0007 queue is stale in membership, not just counts — the heavy tail moved to services/composables",
  "evidence": "At HEAD (2dc056e): 29 .ts files >300 lines and 33/69 SFCs >250 (excluding generated types/backend.ts and archived-migrations.ts). Top offenders absent from the queue: services/analysis-service.ts (1181), composables/useQeubo.ts (979), composables/board/usePlayFromPosition.ts (815), lib/knobs.ts (802), store/index.ts (789). Queue files since 2026-06-02 investigation: types.ts 2245→2362, App.vue 708→718, useReviewSession.ts 664→656; no size-refactor commit among the 27 frontend commits since.",
  "implication": "Hand-maintained file lists decay within weeks. If the queue stays open (the investigation's recommendation c), generate the over-budget list mechanically — a one-line wc -l script or CI report — so the work-status item tracks the posture, not a snapshot.",
  "confidence": "high"
 },
 {
  "title": "The 'bulk is template+style' lesson is over-generalized — today's over-budget SFCs are script-heavy",
  "evidence": "BaseChart.vue: 590-line <script setup> (lines 20-610) with a 2-line template (612-614). App.vue over the ~150 section cap in all three sections (script 358, template 161, style 191). PaletteEditor.vue script 331. The C2-arc conclusion (2026-04-27 worklog, quoted in the investigation doc) justified CSS-contraction-instead-of-extraction; ADR-0007 §Format's no-go forbids contracting logic.",
  "implication": "Composable extraction — the move ADR-0007 actually prescribes for logic-heavy files — is back on the table for the current offenders. BaseChart.vue is the cleanest candidate: nearly all script, so extraction is a file-type change more than a refactor, with direct auditability gain.",
  "confidence": "high"
 },
 {
  "title": "Cast-justification rule honored ~50% in sample; 'as any' survives in engine and review paths",
  "evidence": "Of 32 sampled sites (population 224): ~10 justified per frontend/CLAUDE.md:176-178, ~5 ACL brand-construction (sanctioned), ~17 bare. Worst: engine/sgf-loader.ts:83/89 (as any on tree links), katago-client.ts:133 (subscribe(query as any)), useReviewSession.ts:266 (parsedBoard.id = bId as any), redundant useReviewSession.ts:300 (currentNodeId as NodeId — already NodeId per types.ts:270).",
  "implication": "A review-only rule decays; mechanize it. ESLint already gates merges (frontend-ci since 2026-06-01): ban `as any` outright and require a comment-adjacent or helper-wrapped cast (e.g. a brand() constructor), turning the convention into the same class of mechanism as the import-boundary lint.",
  "confidence": "high"
 },
 {
  "title": "Union-erasing wire cast lets engine error responses flow silently into the analysis packet path",
  "evidence": "analysis-service.ts:646 and :836 cast subscriber payloads `res as KataAnalysisResponse`; the callback contract delivers the full KataGoResponse union including KataErrorResponse (engine/katago/types.ts:498-501, contract.ts:18-21). katago-client.ts:101-104 forwards error packets to per-id subscribers unconditionally after the onError intercept, so onAnalysisUpdate (analysis-service.ts:923) processes a mis-typed error response — telemetry.recordPacket gets undefined turnNumber and the error is swallowed on that path.",
  "implication": "Narrow with a discriminant check at the subscription boundary and fail loudly on the error variant (ADR-0002). Small diff, removes two load-bearing unjustified casts, and makes the SPA-side union handling match the proxy's discriminated-union contract.",
  "confidence": "high"
 },
 {
  "title": "Outbound ACL asymmetry: snake_case wire payloads are constructed in composables, contradicting the stated rule",
  "evidence": "frontend/CLAUDE.md:60: 'The ACL is the only place wire shapes appear; no other module sees snake_case.' But composables/review/useMinting.ts:108-154 builds the snake_case grading_parameter payload as Record<string, any> (brand-erasure cast at :46), and types.ts:2115-2130's own comment documents 'there is no inverse-mapper for the create flow' with the composable named as the construction site.",
  "implication": "Either add outbound domain→wire mappers to backend-service.ts (symmetric to the inbound mapToReviewCard family) or amend the CLAUDE.md rule to name the sanctioned outbound exception. A rule that documentation itself contradicts erodes the authority of all the sibling rules; the mapper route also retires the Record<string, any> typing.",
  "confidence": "high"
 },
 {
  "title": "Band drift in two [B1] files; band tags are review-enforced only",
  "evidence": "composables/auth-app/useAppBootstrap.ts:30 imports setIntensityHueShift from engine/suggestion-colors ([B3], FILES.md:246) while tagged [B1] (FILES.md:175). composables/useQeubo.ts:87 imports generateUUID from engine/util ([B3], FILES.md:248) while tagged [B1] (FILES.md:148). 10 other sampled B1 files clean. frontend/CLAUDE.md:103-107 names tag/dependency drift as the silent-failure mode the FILES.md discipline exists to surface — but nothing mechanizes it.",
  "implication": "Two cheap moves: re-home generateUUID to lib/ (it is domain-agnostic; its current home forces false B3 coupling on every consumer), and either retag useAppBootstrap or seam out the hue-shift call. Longer-term: the ESLint import-boundary pattern already in eslint.config.js could grow a band-aware rule, mechanizing ADR-0003 conformance.",
  "confidence": "high"
 },
 {
  "title": "Mutator discipline holds for structural state; frays for persisted profile collections and the two-writer knownTags slot",
  "evidence": "Grep over components/composables/lib/engine/App.vue: zero direct store.boards structural writes; 31 direct-write sites total, of which template session.ui toggles are sanctioned verbatim by ADR-0001 §Exception. Un-mutatored persisted writes: useQeubo.ts:767 (profile.settings), :824-826 (push to profile.qeuboPinnedBookmarks), useLocale.ts:66, scenarioContext.ts:125/234; store.knownTags written by useTags.ts:45 and useAppBootstrap.ts:419 plus the store-internal reset at store/index.ts:652.",
  "implication": "ADR-0001 'Revisit when' #3 names convention breakdown as its trigger — this is early-stage evidence, not yet breakdown. Cheap correction: named mutators for persisted profile collections (pinned bookmarks, knownTags) so each multi-writer slot has one owner, matching the existing toggleCardTreeManualExpand precedent and the project's own 'slot needs an owner' lesson; leave the sanctioned UI toggles alone.",
  "confidence": "medium"
 },
 {
  "title": "The types.ts type-catalogue exception is straining: 2362 lines, +117 in one week",
  "evidence": "types.ts at 2362 (was 953 at the queue's 2026-05-06 listing, 2245 at the 2026-06-02 investigation). ADR-0007 §Exceptions: type catalogues 'split along clean domain seams, not by line count alone.' frontend/CLAUDE.md:127-131 already concedes the file 'mixes the identifier types in with value objects, state containers, and the GlobalStore schema, making it an inconvenient place to look up' — the reason IDENTIFIERS.md exists. The file's own section banners (branding utilities, wire-type aliases at :2110) name the seams.",
  "implication": "Split along the existing banner seams (identifiers / value objects / store schema / wire aliases). The growth rate means every week of deferral raises the cost; the seams are already documented, so this is one of the rare large-file splits with low design risk and high lookup-auditability gain.",
  "confidence": "medium"
 }
]
````

**Coverage (verbatim):**

````
Read END TO END this session: docs/notes/investigation-refactoring-queue-adr0007-2026-06-02.md; docs/adr/0007-file-size-and-information-density.md; docs/adr/0001-state-mutation-and-readonly.md; frontend/CLAUDE.md; frontend/src/store/index.ts; umbrella CLAUDE.md (provided in full in context). Sanctioned partial consultation: frontend/FILES.md (B1-tagged rows, band legend line 25, rows for engine/util.ts, suggestion-colors.ts, useQeubo.ts, useAppBootstrap.ts). Code read in fragments, cited only with file:line as code evidence (not as documents): katago-client.ts (lines 1-140), engine/katago/contract.ts (1-40), engine/katago/types.ts (490-515), analysis-service.ts (windows around 646/836/923-960), types.ts (windows 70-95, 2110-2130, line 270), useMinting.ts (grep windows), useReviewSession.ts / sgf-loader.ts / projection.ts / encoder.ts / backend-service.ts and other cast-sample contexts (4-12 line windows per site). Sampled, not exhaustive: 32 of 224 cast sites inspected (deterministic shuf) — the uninspected 192 could shift the ~50% conformance estimate either way; 12 of ~60+ B1-tagged files checked for band drift — drift in unchecked B1 files would be missed; .vue files were excluded from the cast sweep per the commission's .ts scoping, so template/script casts in SFCs are unaudited. NOT read: ADR-0002/0003/0004/0005/0006/0008/0009/0010 (referenced only by name or through documents I did read end to end — I make no claims about their internal content beyond what frontend/CLAUDE.md and ADR-0001/0007 state); docs/handoff-current.md; the C2-arc worklogs (relied on only via the investigation doc's account); eslint.config.js (the import-boundary claim comes from frontend/CLAUDE.md:67-69, not from reading the config — a finding suggesting lint extensions would need that file read first); SyncService (so I could not adjudicate whether the deep-watch-needs-reassignment rationale in toggleCardTreeManualExpand's docstring is accurate). Licensing firewall respected: nothing under backend/qeubo/ was read. No perf properties asserted; the 'small diff' / 'low design risk' phrasings are scoping judgments, not performance claims.
````

### §1 · harvest:work-status

**Commission** (= `[SHARED: HARVEST-PREAMBLE]` + the following + `[SHARED: HARVEST-OUTRO]`):

````
Work-status store mining (READ-ONLY SQL; psql -h 192.168.122.1 -d todo). First read /home/bork/w/omega/tools/work-status/schema.sql end to end. Then dump: all items (with description), labels, refs, deps, and SELECT * FROM work_status_violations. Produce the already-filed map this review needs for dedupe: for every OPEN item whose subject is refactoring, correctness, auditability, architectural debt, or typing discipline (e.g. refactoring-queue-adr0007, silent-coercion-protocol-boundaries-audit, spa-board-scope-consistency-audit, semantic-clarity-refactors-effect-typing, offload-layout-to-libraries, polymorphic-chart-renderer, gradingparameter-opacity-typing, content-addressed-card-identity, many-boards-open-slowness, thumbnail-render-lifecycle-consolidation, knob-wire-key-derivation…), summarize its description, refs, deps, and disposition so a later stage can tell "new finding" from "already filed". Also flag: closed items whose resolution suggests a lesson (superseded/dropped — why?); any violations-view rows; and open items that look stale against the tree (title promises something that appears already shipped — verify with a quick code/doc check).
````

**Report (verbatim):**

````
## Work-status store mining — already-filed map for dedupe

Method: read `/home/bork/w/omega/tools/work-status/schema.sql` end to end, then dumped the `todo` Postgres store read-only (items with full descriptions for all 49 open, all 3 superseded/dropped, and all 36 shipped items; full labels, refs, deps tables; `work_status_violations`; meta). Store health: **violations view returned zero rows** (clean); schema_version 1; one deps row (thumbnail-render-lifecycle-consolidation → mini-board-texture-scope); RB-1/2/3 carry parent=nav-during-range-query-perf.

### Already-filed OPEN items in this review's scope (dedupe against these)

**Refactoring / architectural debt (frontend):**
- `refactoring-queue-adr0007` (active, medium; refs ADR-0007, C2.3 worklog) — residual file-size backlog only; operative policy is handled-on-touch + bounded-stopping, the priority-queue framing was retired. Tree check confirms the files remain over budget and mostly grown vs the item's snapshot: App.vue 718, BaseChart.vue 614, PaletteEditor.vue 626, useReviewSession.ts 656, types.ts 2362. New "split this file" findings should attach here, not re-file.
- `polymorphic-chart-renderer` (future, large) — ChartRenderer Port per ADR-0003, motivated by ECharts' destroy-and-recreate heatmap redraw; explicitly not blocking (throttle bought headroom). Open questions: seam, Port surface, theme coupling, bundle weight.
- `config-schema-projections` (future, large; design note + Opus consult refs) — one declarative schema S as SSOT for config structure/presentation; all config UIs become projections with two equivariance laws; phases P0–P3 additive, P4 deferred.
- `thumbnail-render-lifecycle-consolidation` (future, medium; depends on shipped mini-board-texture-scope) — unify the persistent vs remount-per-hover thumbnail lifecycles so the `<script setup>` per-instance shared-resource bug class becomes impossible rather than latent.
- `offload-layout-to-libraries` (future, medium) — direction unspecified; composes with `responsive-design-deferred`.
- `syncservice-suspend-resume` (future, medium) — replace per-setting capture-neutrality patches (PR #348 stop-gap) with first-class suspend/resume of SyncService persistence; deliberately deferred 2026-06-03 pending fallout analysis.
- `semantic-clarity-refactors-effect-typing` (future, medium) — (a) name the analysis-service packet multiplexer (~5 heterogeneous sinks; named-dispatch + DI may beat a generic Subject); (b) unify three multi-variant error encodings on discriminated-union + never-default — the item itself notes (b) overlaps the shipped ApiError work.

**Typing discipline:** `gradingparameter-opacity-typing` (future, small) — `Record<string,any>` confirmed still present at frontend/src/types.ts:1695; tighten only if the inner shape stabilizes. `knob-wire-key-derivation` (active, small) — derive qEUBO `controlled_parameters` wire keys from KnobDecl ids; qeubo-service.ts:88/171 still maps the field opaquely, no derivation yet. `silent-coercion-protocol-boundaries-audit` (active, medium, both) — sweep for closed-set wire vocabularies parsed with open-set defaults; cure: enum/Literal witness, one wire-string↔enum map, missing-key vs unknown-value, two-tier loudness.

**Auditability:** `content-addressed-card-identity` (future, large; investigation-only — would content_hash as primary card identity improve auditability?). `serial-numbers-generated-artifacts` (future, small; RFC-first — version markers in generated files like frontend/src/types/backend.ts). `adr-effectiveness-audits` (active, large; per-tenet drift audits, ADR-0002 named most overdue; doc-consolidation leg partly discharged). `doc-graph-svg-render-off-tree` / `doc-graph-svg-spline-failure` (doc-graph tooling residuals).

**Correctness / perf:** `many-boards-open-slowness` (active; scaling bug, distinct from regime-B). `pv-hover-jank-range-query` (active; cause unknown). `nav-during-range-query-perf` (active umbrella; RB-1/RB-2 shipped, RB-3 dropped; residual is only an ADR-0009 re-profile). `adaptive-query-cancellation-leak` (active, proxy-suspected; explicitly gated on proxy runtime visibility). `save-disconnect-clears-graph` (active; two-part fix already designed). `mistake-finder-unpunished-brittleness`, `kde-boundary-bias` (correctness-of-heuristics investigations). `pv-animation-defaults-calibration` + `pv-overlay-typography-calibration` (the co-tuned-constants pattern: name the calibration before consolidating constants).

### Closed items whose resolution is a lesson

- `rb3-packet-receive-chunking` (**dropped**): re-measurement showed onAnalysisUpdate at ~99ms total (p50 0.2ms/packet), not the ~2.35s a pre-refactor audit attributed to it. Lesson: profiles go stale across refactors; re-measure before building a lever (ADR-0009 in practice).
- `review-state-convention-inconsistency` (**superseded**, no standalone fix): dissolved incidentally when commit 21c2543 single-sourced review-state coloring into BoardTab via `--review-*` tokens. Lesson: convention drift between duplicated surfaces is often cured by removing the duplication, not by aligning the copies. The `extra.resolution_note` records this — a good auditability pattern.
- `classification-discipline-tenet-rule7-relocation` (**superseded** by ADR-0008): the literal "relocate Rule 7" was deliberately declined; the principle got its own home. Note: both superseded rows have `superseded_by=NULL` because the superseder is a document, not an item — the FK can't express that; the rationale lives only in prose.
- The shipped 2026-06-03/06-09 bug cluster (tag-mutation-ssot, tags-fetch-hydration-race, tenancy-instance-cache-leak, mint-uncommitted-tag-drop, mini-board-texture-scope) reads as one family: implicit per-instance/per-identity state with multiple writers and no registry. The shipped fixes repeatedly introduced chokepoints/registries (learnTags(), IDENTITY_SCOPED_CACHES, BOARD_SCOPED_STORE_CELLS, module-scope texture cache) — the structural cure this review should generalize rather than re-derive.

### Stale flags (open items vs tree)

- `spa-board-scope-consistency-audit` (active, large) looks **substantially delivered**: its `extra.audit_recommendations` P0 (forestNav per-board) is in the tree (`selection: PerBoard<NavSelection>` types.ts:1622, schema 59 per store/index.ts:445), P1 `PerBoard<T>` exists (types.ts:103), the convention note frontend/docs/notes/board-scope.md exists, P1b's registry (`BOARD_SCOPED_STORE_CELLS`, store/index.ts) exists, and P2's latent `activeBoard` read is absent from useAnalysisProjection.ts (grep exit 1). A worklog docs/worklog/2026-06-09-board-scope-fix-perf-diff.md exists. Candidate for closure or narrowing — verify with the maintainer.
- `nav-during-range-query-perf`: both live children resolved; residual is a re-profile to claim the win. `i18n-string-sweep`: titled work landed per its own description; residual is native-speaker review only. Both honest in prose but title-vs-residual drift; a later stage should not file "do the i18n sweep" or "fix regime-B" as new findings.

Caveat: code checks above are identifier-presence/line-count greps, not full-file reads; referenced audit docs/worklogs were verified to exist, not read.
````

**Findings (structured, verbatim):**

````json
[
 {
  "title": "Eleven-plus open items already cover the review's refactoring/typing/auditability territory",
  "evidence": "todo DB items table (read 2026-06-09): refactoring-queue-adr0007, silent-coercion-protocol-boundaries-audit, spa-board-scope-consistency-audit, semantic-clarity-refactors-effect-typing, offload-layout-to-libraries, polymorphic-chart-renderer, gradingparameter-opacity-typing, content-addressed-card-identity, many-boards-open-slowness, thumbnail-render-lifecycle-consolidation, knob-wire-key-derivation, config-schema-projections, syncservice-suspend-resume, serial-numbers-generated-artifacts, adr-effectiveness-audits — all state=open with full descriptions, labels, refs as dumped in the report.",
  "implication": "Later review stages must dedupe candidate refactoring opportunities against this map; a 'new' finding matching any of these should be filed as evidence on the existing item, not as a new lesson.",
  "confidence": "high"
 },
 {
  "title": "spa-board-scope-consistency-audit appears substantially shipped but is still open/active",
  "evidence": "Item extra.audit_recommendations names P0 forestNav re-scope, P1 PerBoard<T> + board-scope.md, P1b board-scope teardown registry, P2 useAnalysisProjection activeBoard fix. Tree: frontend/src/types.ts:103 (PerBoard<T>), :1622 (selection: PerBoard<NavSelection>); frontend/src/store/index.ts:313,445 (BOARD_SCOPED_STORE_CELLS drain, 'O15, schema 59'); frontend/docs/notes/board-scope.md exists; grep activeBoard in frontend/src/composables/analysis/useAnalysisProjection.ts exits 1 (no hits); docs/worklog/2026-06-09-board-scope-fix-perf-diff.md exists.",
  "implication": "Status-closure candidate (verify residual with maintainer); review stages should treat board-scope recommendations as largely delivered, not as open opportunities.",
  "confidence": "medium"
 },
 {
  "title": "Dropped item rb3-packet-receive-chunking encodes the stale-profile lesson",
  "evidence": "todo DB, rb3-packet-receive-chunking description: 'Re-measured on current main: onAnalysisUpdate is ~99ms total (p50 0.2ms/packet), NOT the ~2.35s the pre-refactor audit attributed to it. No bottleneck, no lever — dropped.'",
  "implication": "Lesson for the review: performance attributions from pre-refactor audits must be re-measured before any lever is built on them (ADR-0009 applied to planning, not just claiming).",
  "confidence": "high"
 },
 {
  "title": "Superseded item review-state-convention-inconsistency shows duplication removal dissolving convention drift",
  "evidence": "todo DB: resolution=superseded, extra.resolution_note: 'Resolved incidentally by the cards-tab-merge tab-restructure (commit 21c2543): review-state coloring moved out of App.vue into BoardTab, single-sourced via --review-* semantic tokens.'",
  "implication": "Candidate general lesson: when two surfaces disagree on a convention, prefer single-sourcing the surface over aligning the copies; also, the extra.resolution_note pattern is a low-cost auditability practice worth keeping.",
  "confidence": "high"
 },
 {
  "title": "The 2026-06-03/06-09 shipped bug cluster shares one root shape: unregistered per-instance/per-identity state",
  "evidence": "todo DB shipped descriptions: tag-mutation-ssot (only one of two writers updated knownTags; cure = learnTags() chokepoint), tenancy-instance-cache-leak (hand-wired O8–O13 clears replaced by IDENTITY_SCOPED_CACHES registry), mini-board-texture-scope ('shared' texture cache scoped per-instance by <script setup>; cure = module scope), tags-fetch-hydration-race (deepMerge array-replacement vs concurrent fetch). Open follow-up thumbnail-render-lifecycle-consolidation explicitly aims to make the class 'impossible rather than merely latent'.",
  "implication": "Refactoring-opportunity theme for the review: shared/scoped state needs an owning registry or chokepoint, not per-writer patches — the store already records four worked instances and one open generalization item to attach further findings to.",
  "confidence": "high"
 },
 {
  "title": "work_status_violations is empty; store integrity is clean",
  "evidence": "SELECT * FROM work_status_violations returned zero rows (2026-06-09); schema constraints per tools/work-status/schema.sql lines 102-125 (shipped-without-ship-ref, depends_on-cycle, parent-cycle).",
  "implication": "No store-hygiene findings to file; the relational ACL (schema.sql) is doing its fail-loud job.",
  "confidence": "high"
 },
 {
  "title": "superseded_by cannot point at a non-item superseder; both superseded rows carry NULL",
  "evidence": "tools/work-status/schema.sql:57 (superseded_by text REFERENCES items(id)); todo DB: classification-discipline-tenet-rule7-relocation and review-state-convention-inconsistency both resolution=superseded with superseded_by=NULL — supersession target (ADR-0008; commit 21c2543) lives only in prose/extra.",
  "implication": "Minor auditability gap: a 'superseded' resolution has no machine-readable pointer when the superseder is a document or commit; a refs-row convention (kind=adr/commit tagged as superseder) could close it cheaply. Low priority.",
  "confidence": "medium"
 },
 {
  "title": "refactoring-queue-adr0007's residual is real and growing; policy is handled-on-touch, not batch",
  "evidence": "Item description (snapshot: App.vue ~708, types.ts ~2245) vs tree on 2026-06-09: App.vue 718, BaseChart.vue 614, ForestDirectory.vue 514, HorizontalTimelineVisualizer.vue 513, MintCardModal.vue 404, types.ts 2362, PaletteEditor.vue 626, useReviewSession.ts 656 (wc -l). Description: 'Handled on touch; no batch, no named next-targets (the priority-queue framing was retired by the bounded-stopping posture).'",
  "implication": "File-size findings from other review agents should be recorded as evidence here; proposing a batch split would contradict the recorded operative policy and needs explicit maintainer sign-off.",
  "confidence": "high"
 },
 {
  "title": "Two open items carry title-vs-residual drift (work shipped, item open for a narrow residual)",
  "evidence": "todo DB: nav-during-range-query-perf ('RB-1/RB-2 shipped; RB-3 dropped. Residual: whether the regime-B frame cost is fully retired wants a re-profile'); i18n-string-sweep ('plumbing + the 150-300 hardcoded-string sweep landed... Residual: native-speaker review per locale').",
  "implication": "Dedupe hazard: a later stage scanning titles alone would re-file shipped work. Read descriptions, not titles, when matching findings to items; optionally retitle items to their residuals on next store touch.",
  "confidence": "high"
 },
 {
  "title": "semantic-clarity-refactors-effect-typing leg (b) is partially discharged by the shipped ApiError arc",
  "evidence": "Item description: '(b) unify the three multi-variant error encodings... overlaps/subsumed by the ApiError work'; stringly-typed-api-errors closed shipped 2026-06-01 (PR 318, 'six consumers... the six ARE the complete population'); class ApiError present at frontend/src/services/api-client.ts:24.",
  "implication": "Whether the other two of the 'three multi-variant error encodings' remain is unverified; a review finding on error-encoding unification should narrow this item rather than duplicate it.",
  "confidence": "medium"
 }
]
````

**Coverage (verbatim):**

````
Read end to end: /home/bork/w/omega/tools/work-status/schema.sql (130 lines). Database (read-only SELECTs against psql -h 192.168.122.1 -d todo): full items table including complete descriptions for all 49 open, all 36 shipped-closed, and all 3 superseded/dropped items; full labels, deps, and refs tables; work_status_violations (empty); meta. Partially read: services_local.gitignore (first 50 lines, for connection facts only — the standing-rule/topology content beyond that was visible and appears complete, but I did not verify the file ends there). Code spot-checks were grep/sed/wc fragments, NOT full-file reads: frontend/src/types.ts (lines around 96-103, 1622, 1655-1740), frontend/src/store/index.ts (lines 313, 391-453), frontend/src/services/api-client.ts (grep hits only), frontend/src/services/qeubo-service.ts (grep hits), frontend/src/composables/board/use-pv-animation.ts (grep hits), frontend/src/composables/analysis/useAnalysisProjection.ts (negative grep), frontend/src/lib/timing.ts (one line) — my claims about these are limited to identifier presence/absence and line counts. Verified existence only (NOT read): docs/notes/audit/audit-spa-board-scope-consistency-2026-06-05.md, docs/notes/audit/audit-stringly-typed-contracts-2026-06-01.md, docs/notes/investigation-mini-board-texture-flash-2026-06-09.md, frontend/docs/notes/board-scope.md, docs/worklog/2026-06-09-board-scope-fix-perf-diff.md. Not read at all: any ADR, README, handoff, adr-synopsis, worklogs, postmortems, dispatch files — I cite none of their contents; everything attributed to items comes verbatim from the DB descriptions. Effect of gaps: the stale-flag on spa-board-scope-consistency-audit rests on code greps plus doc existence, not on reading the audit doc — the doc may record deliberate residuals that justify keeping the item open; likewise the 'three multi-variant error encodings' count in semantic-clarity-refactors could not be verified without a deeper code read. Backend/qeubo/ untouched per the licensing firewall. No writes of any kind were made to files or the database.
````

### §1 · harvest:docgraph-dispatch

**Commission** (= `[SHARED: HARVEST-PREAMBLE]` + the following + `[SHARED: HARVEST-OUTRO]`):

````
Documentation-graph and cross-boundary evidence. Read end to end: /home/bork/w/omega/docs/doc-graph-report.md; all 14 files under /home/bork/w/omega/docs/dispatch/; /home/bork/w/omega/docs/wire-schemas.md (if present at that path — locate it if not); and /home/bork/w/omega/docs/notes/consolidation-xref-fallout.md. Treat docs/doc-graph.md and docs/doc-graph.json as data (inspect structure, summarize; no end-to-end prose read required for the generated artifacts — say so in coverage). Extract:
1. Dangling/stale cross-references and what they say about doc-graph upkeep cost.
2. Cross-boundary friction lessons from the dispatch ledger: the wire-key naming asymmetry (delta_analysis vs analysis_enricher) deferred arc; the typed-schema-publication need for the proxy wire (drift risk with src/engine/katago/types.ts); the gradingParameter.data opacity arc (Path 1 chosen, Path 2 roadmapped — and whether the promised "ledger note recording known data keys" was ever written); the open learned-vf dispatch's SPA-side obligations.
3. Auditability lessons: where does the doc graph make history reconstruction easy vs. where did it take a consolidation arc to fix?
````

**Report (verbatim):**

````
## Documentation-graph and cross-boundary evidence report

### 1. Dangling references and doc-graph upkeep cost

The generated report (`docs/doc-graph-report.md`, 416 lines, read in full) counts 125 dangling references from live documents, 246 from frozen archive, 0 ambiguous. The headline number overstates the actionable class. Of the 125 "genuine-action candidates," 55 originate from `docs/worklog/*` and 31 target `docs/notes/deferred-items.md`. Both classes are drift the project has already decided to tolerate: `docs/notes/consolidation-xref-fallout.md` (read in full) explicitly classifies `docs/worklog/**` as frozen in its own method ("Internal references point at paths as they existed at each file's capture moment; do not edit to fix"), and `deferred-items.md` was deliberately retired into `docs/notes/vestige/deferred-items/` plus the todo DB. The generator's live/frozen boundary (only `docs/archive/**` is frozen) disagrees with the project's working convention, so roughly two-thirds of the "review these" list is noise by the maintainer's own standards. The report also states (lines 5–9) that the CI gate checks artifact freshness only and "does not block merges on broken references, because existing drift would make every PR red" — a ratchet gate ("no new live danglers") only becomes feasible after the de-noising.

The dangling mass has two recognizable generators: (a) genre-consolidation moves (notes relocated into `design/`, `postmortem/`, `retrospective/`, `vestige/` subfolders) that left worklog references at old flat paths; (b) hub retirement without tombstones — every vestige file still path-mentions the dead `deferred-items.md`. A third, smaller class is promissory references: paths to documents that were never authored, e.g. `docs/dispatch/frontend-to-proxy-wire-diagnostic-channel.md` (report line 48), whose underlying idea was deferred via `docs/wire-schemas.md` §8 — the deferral is recorded, but the postmortem's pointer dangles at a never-filed file.

`docs/doc-graph.json` was inspected as data only: a dict with `node_count` 404, `edge_count` 1851, `age_buckets` (fresh/recent/aging/stale), `nodes[]` carrying `{path, genre, is_hub, first_committed, last_committed, age_bucket}`, `edges[]` carrying `{from, to, kind, site, resolved}`. `docs/doc-graph.md` (182 lines, generated) was read fully; it confirms 1480 resolved / 371 dangling and the structure-only CI scope.

### 2. Cross-boundary friction lessons (dispatch ledger, all 14 files read in full)

**Wire-key naming asymmetry.** `proxy-to-frontend-selector-and-capabilities-status.md` lines 493–502 record that the capability wire key `delta_analysis` is the only one not matching its proxy artifact (`analysis_enricher`), deferring a rename to "a future arc... no action requested." That deferral exists nowhere else: read-only queries against the `todo` work-status store found no item, and `docs/wire-schemas.md` (read in full) never flags the mismatch even though §2/§3 use the `delta_analysis` key and §4 names `analysis_enricher.py` as producer. Per the umbrella CLAUDE.md the store is the single source of truth for deferred work; a deferred coordinated arc living only in a closed dispatch's reply section is precisely the loss mode the SSOT migration was built to prevent.

**Typed-schema publication for the proxy wire.** §8 of `wire-schemas.md` defers AsyncAPI with three explicit lift conditions. Meanwhile the hand-maintained mirror is weaker than "mirror" suggests: `frontend/src/engine/katago/types.ts:276` types capability metadata as `Record<string, Record<string, unknown>>`, so the learned-vf arc's new `available_value_bindings` field entered via local casts (`capability-injection.ts:203` `as readonly string[]`; `AnalysisControls.vue:48` `as { available_value_bindings?: unknown }`) — despite `proxy-to-frontend-learned-vf.md` line 150 instructing "extend the `AdaptiveReevaluateCapability` type." There is no compile-time drift signal for capability metadata today.

**gradingParameter.data opacity.** The negotiation dispatch settled Ask 3 as Path 1 (free-form) with Path 2 (typed schema published via `wire-schemas.md`) roadmapped; the frontend reply promised "a small ledger note... recording the known keys under `data`" (`backend-to-frontend-card-metadata-inline-edit-status.md:465-469`). It was never written: the arc2-consumed dispatch itself flags it "Not done" (lines 219–223), grep finds no such note under `docs/notes/`, `wire-schemas.md` has no gradingParameter section, and the tracking store item `gradingparameter-opacity-typing` (open/future) names only `data.analysis_config`, not the full key set (`gamma`, `default_visits`, `analysis_config`). The promised "authoritative starting point rather than a grep over the codebase" does not exist.

**Open learned-vf dispatch.** The SPA half largely shipped in commit `ca687e7` (dropdown in `AnalysisControls.vue`, injection logic, migration 45→46, `en.json` keys), but: the dispatch header still reads "Status: Open"; no reciprocal consumed dispatch exists (contrast the card-metadata arc's tidy request → status → arc-shipped → arc-consumed chain); the FEATURES.md one-liner the dispatch obligates was never added (zero "learned" hits); and the i18n keys exist only in `en.json` (ja/ko/zh-CN: 0 hits) against the clarifications dispatch's four-locale commitment.

### 3. Auditability: where reconstruction is easy vs. hard

Easy: the card-metadata arc is a model — six dispatch files with commit hashes (`564b3e0`, `0f27e38`, `b870359`), PR numbers (#212–#216), and explicit honest deferrals; `wire-schemas.md`'s relation-not-content discipline plus its "dispatch carries the why, this doc carries the where" split; the proxy-to-proxy near-miss letters preserving cross-session reasoning. The typed-ACL dispatch is honestly open (proxy `delta_analysis.py:333` still `packet: Any`), and the ledger reflects that.

Hard: work-status was triple-recorded (TODO.md / deferred-items.md / handoff-current.md) until the 2026-06 consolidation arc, whose fallout note had to inventory 24+12+28 live referencers per doc before anything could move. Dispatch closure state is per-file prose with no mechanical check, so "Open" headers go stale silently. The lesson the evidence supports: the ledger works where reciprocal-notice discipline was followed and decays where a single side's PR did the contract update in passing.
````

**Findings (structured, verbatim):**

````json
[
 {
  "title": "Promised gradingParameter.data known-keys ledger note was never written",
  "evidence": "Frontend reply in docs/dispatch/backend-to-frontend-card-metadata-inline-edit-status.md:465-469 promises 'a small ledger note will be left in docs/notes/ ... recording the known keys under data'; docs/dispatch/frontend-to-backend-card-metadata-inline-edit-arc2-consumed.md:219-223 records it 'Not done'; grep over docs/notes/ finds no such note; docs/wire-schemas.md has no gradingParameter section; todo-DB item gradingparameter-opacity-typing (open/future) names only data.analysis_config, not gamma/default_visits.",
  "implication": "Add a gradingParameter.data section to docs/wire-schemas.md enumerating the known keys and their owners (gamma backend-read, default_visits and analysis_config frontend-owned). This fulfills the promise cheaply, gives the roadmapped Path-2 typed-schema arc its 'authoritative starting point rather than a grep', and turns an opaque Record<string,any> into an auditable contract.",
  "confidence": "high"
 },
 {
  "title": "Wire-key naming asymmetry (delta_analysis vs analysis_enricher) is deferred only in closed-dispatch prose, untracked in the work-status SSOT",
  "evidence": "docs/dispatch/proxy-to-frontend-selector-and-capabilities-status.md:493-502 ('Wire-key naming asymmetry (deferred, for future arc)'); read-only queries against the todo Postgres store return no matching item; docs/wire-schemas.md (read end to end) uses the delta_analysis key in §2/§3 and names transformers/analysis_enricher.py as producer in §4 without flagging the mismatch.",
  "implication": "Either record a store item plus a one-line asymmetry note in wire-schemas.md §2 (cheap, pure auditability), or schedule the coordinated rename (proxy bump + SPA bump). The cheap option preserves history at near-zero cost; the current state risks the deferral being silently lost, the exact failure the SSOT migration targeted.",
  "confidence": "high"
 },
 {
  "title": "SPA-side capability metadata is untyped; new proxy wire fields enter via local casts, defeating the hand-maintained-mirror discipline",
  "evidence": "frontend/src/engine/katago/types.ts:276 types capabilities as Record<string, Record<string, unknown>>; available_value_bindings is read via casts at frontend/src/engine/katago/capability-injection.ts:203 and frontend/src/components/editors/AnalysisControls.vue:48; docs/dispatch/proxy-to-frontend-learned-vf.md:150 explicitly instructed extending the AdaptiveReevaluateCapability type; docs/wire-schemas.md §8 defers AsyncAPI but names drift as the risk.",
  "implication": "An intermediate refactor short of AsyncAPI: typed per-capability metadata interfaces in types.ts (AdaptiveReevaluateCapabilityMeta carrying worst_quantile, extra_visits, available_value_bindings). Restores compile-time drift signal at the single mirror site instead of scattered casts. Pure type-level change; no runtime behaviour at stake.",
  "confidence": "high"
 },
 {
  "title": "Learned-vf dispatch obligations partially unmet and ledger never closed",
  "evidence": "git show ca687e7 (the SPA ship) touches AnalysisControls.vue, capability-injection.ts, migrations, en.json, but not FEATURES.md (zero 'learned' hits in FEATURES.md today); valueBinding i18n keys: en.json 4, ja/ko/zh-CN 0, against the four-locale commitment in docs/dispatch/frontend-to-proxy-learned-vf-clarifications.md:228; docs/dispatch/proxy-to-frontend-learned-vf.md:6 still reads 'Status: Open'; no reciprocal consumed dispatch exists.",
  "implication": "Close the loop: FEATURES.md one-liner, three locale key sets, a consumed dispatch or status edit. Structurally, a dispatch-closure checklist (the obligations the dispatch itself enumerates) plus a locale-key-parity test would make this class of partial delivery mechanically visible. The card-metadata arc shows the working pattern; learned-vf shows the decay when it is skipped.",
  "confidence": "high"
 },
 {
  "title": "Doc-graph 'live dangling' class is two-thirds noise by the project's own conventions",
  "evidence": "docs/doc-graph-report.md: 125 live danglers, of which 55 originate from docs/worklog/* and 31 target the retired docs/notes/deferred-items.md; docs/notes/consolidation-xref-fallout.md's method classifies docs/worklog/** as frozen ('do not edit to fix') while the generator treats only docs/archive/** as frozen; report lines 5-9 record that CI does not gate on broken references 'because existing drift would make every PR red'.",
  "implication": "Align tools/doc-graph/generate.mjs's frozen boundary with the working convention (worklog as frozen or a third bucket) and add tombstone handling for deliberately retired hubs. The genuine-action list shrinks to a reviewable size, after which a ratchet gate (no new live danglers) becomes feasible — turning the report from a passive list into an enforceable auditability invariant.",
  "confidence": "high"
 },
 {
  "title": "Hub retirement and genre-consolidation moves without tombstones or same-arc reference rewrites are the dominant dangling-reference generators",
  "evidence": "All ~19 files under docs/notes/vestige/deferred-items/ still path-mention the dead docs/notes/deferred-items.md (report lines 53-71); live worklogs reference pre-move flat paths for notes relocated to design/, postmortem/, retrospective/ (report lines 100-154, e.g. keybindings-plan.md, perf-audit-*.md, postmortem-*.md).",
  "implication": "Adopt a move discipline: inventory inbound references before relocating (the consolidation-xref-fallout note already models this), and either leave a redirect stub at the old path or rewrite live referencers in the same PR. Doc moves are cheap to execute but reference-expensive; making the cost visible up front is the fix.",
  "confidence": "high"
 },
 {
  "title": "Promissory references: live docs cite artifacts that were never authored",
  "evidence": "docs/doc-graph-report.md line 48: postmortem-adaptive-deeper-enrichment-2026-05.md references docs/dispatch/frontend-to-proxy-wire-diagnostic-channel.md, which was never filed (its substance was deferred via wire-schemas.md §8's AsyncAPI dependency); same shape as the never-written gradingParameter data-keys note.",
  "implication": "When deferring a promised artifact, re-point the referencing doc at the deferral record (the store item or wire-schemas §8) instead of leaving a pointer to a never-authored path. A small convention, but it eliminates a class of dangling references that look like drift and are actually broken promises.",
  "confidence": "medium"
 },
 {
  "title": "The reciprocal-consumed dispatch pattern is the ledger's strongest auditability mechanism — where used",
  "evidence": "Card-metadata arc: six dispatch files forming request → status(+inline reply) → arc1/arc2-shipped → arc1/arc2-consumed, with commit hashes (564b3e0, 0f27e38, b870359, 27d5ef4, c02c5ca) and PR numbers (#212-#216), plus honest open-items lists; the typed-ACL dispatch is honestly open (proxy/delta_analysis.py:333 still 'packet: Any', matching the dispatch's open status); the learned-vf arc lacks the consumed notice and its header is stale.",
  "implication": "Make the reciprocal consumed notice (or an in-place status edit) a required step of cross-boundary delivery — arguably as a pre-merge-checklist line. The contrast between the card-metadata and learned-vf arcs is direct evidence that the pattern, not the ledger's existence, is what buys reconstruction.",
  "confidence": "high"
 }
]
````

**Coverage (verbatim):**

````
Read end to end this session: docs/doc-graph-report.md (all 416 lines, across two Read calls); all 14 files under docs/dispatch/ (backend-to-frontend-card-metadata-inline-edit-{arc1-shipped,arc2-shipped,status}, frontend-to-backend-card-metadata-inline-edit{,-arc1-consumed,-arc2-consumed}, frontend-to-proxy-{delta-analysis-packet-typed-acl,learned-vf-clarifications,selector-and-capabilities}, proxy-to-frontend-{learned-vf,selector-and-capabilities-status}, proxy-to-proxy-{id-translation-near-miss,post-v1.0.13-followups,selector-canonical-key-near-miss}); docs/wire-schemas.md (622 lines); docs/notes/consolidation-xref-fallout.md (198 lines); docs/doc-graph.md (182 lines, generated — read fully even though only data inspection was required). Inspected as data, not prose-read: docs/doc-graph.json (Python structure dump: 404 nodes, 1851 edges, node/edge field shapes); the todo Postgres store via read-only SELECTs (items schema + targeted ILIKE searches — searches were keyword-based, so an item worded very differently could have been missed; this caps the 'untracked in SSOT' findings at high-but-not-certain). Targeted greps/probes only (not end-to-end reads, cited at line level only for directly observed facts): frontend/src/engine/katago/types.ts, capability-injection.ts, AnalysisControls.vue, store/defaults.ts, archived-migrations.ts, locales/*.json, proxy/delta_analysis.py, FEATURES.md, git log/show, first 20 lines of services_local.gitignore (connection facts only). Not read (named gaps): docs/handoff-current.md, the ADRs, docs/notes/roadmap-phase3.5-spa-integration.md, the postmortems, vestige notes, tools/doc-graph/generate.mjs. Effect of the gaps: the roadmap note could record the FEATURES.md/i18n learned-vf obligations as deliberately deferred (which would soften finding 4 from 'unmet' to 'deferred-and-recorded'); handoff or a postmortem could mention the wire-key asymmetry somewhere I did not search; and the live/frozen-boundary claim about the generator rests on the report's own prose plus observed output, not on the generator source. The licensing firewall (backend/qeubo/) was not touched. No performance properties are asserted anywhere in this report (ADR-0009); nothing was modified (strictly read-only session).
````

### §1 · harvest:arch-ergonomics

**Commission** (= `[SHARED: HARVEST-PREAMBLE]` + the following + `[SHARED: HARVEST-OUTRO]`):

````
Architecture-ergonomics judgment over the SPA's load-bearing files. Read END TO END: frontend/src/store/index.ts (~789 lines), frontend/src/types.ts (~2362), frontend/src/services/analysis-service.ts (~1181), frontend/src/App.vue (~718), frontend/src/store/defaults.ts (~722), frontend/src/lib/knobs.ts (~802), frontend/src/composables/review/useReviewSession.ts (~656), and frontend/CLAUDE.md. Consult frontend/FILES.md and frontend/IDENTIFIERS.md as lookup references (note IDENTIFIERS.md's "Known erosions" section — read that section fully). Assess, citing line ranges:
1. Does the single-GlobalStore + named-mutators discipline still scale at this size? Where do mutators blur (mutation outside mutators, mutators doing service work)?
2. types.ts mixes identifier types, value objects, state containers, and the GlobalStore schema — IDENTIFIERS.md exists BECAUSE of that. Is splitting it the right correctness/auditability refactor, and along which seam?
3. Is analysis-service.ts doing several jobs (WS client, ledger glue, capability injection, framing normalisation, bundle export)? What seam would make each auditable in isolation?
4. Per-board scoping: PerBoard<T>, BOARD_SCOPED_STORE_CELLS, the two teardown classes (read frontend/docs/notes/board-scope.md end to end too) — is the registry pattern coherent and complete, or is the slot-ownership story fragmented across writers?
5. The documented ADR-0010-vs-layering tension (leaf reads from reactive-state service modules; ESLint split) — propose what a true reconciliation would look like, if any.
6. App.vue at ~718 lines vs the ≤250 SFC budget — what extraction shape composes with the existing layering?
Ground every assessment in what the file actually shows; mark judgment calls as such.
````

**Report (verbatim):**

````
Architecture-ergonomics review of the LengYue SPA's load-bearing files. Everything cited below was read end to end this session: store/index.ts, types.ts, analysis-service.ts, App.vue, store/defaults.ts, lib/knobs.ts, useReviewSession.ts, frontend/CLAUDE.md, frontend/docs/notes/board-scope.md, IDENTIFIERS.md (all of it, including Known erosions), ADR-0001, ADR-0010, and eslint.config.js. FILES.md was consulted partially as sanctioned.

1. Single GlobalStore + named mutators. The pattern still scales structurally — store/index.ts:69-149 (singleton + derived computeds), the mutator block at 153-280, and the two teardown registries (309-323, 530-544) are individually legible. But ADR-0001's own revisit trigger #3 ("the mutator convention starts breaking down") has accumulating evidence. The clearest blur: analysis-service.ts:463 mutates board state directly — `if (board) (board as any).maxVisitsTarget = visits;` — bypassing `mutateBoard`, so no `boardsVersion` bump fires; the cast is unjustified (CLAUDE.md's type-driven-design rule) and unnecessary (the field is declared at types.ts:278). Second, `store.engine` has ~20 direct write sites inside analysis-service.ts (169-192, 273-280, 297, 328, 341-354, 370-375, 398-411) against exactly one named mutator (`setSelectedModel`, store/index.ts:191). In practice analysis-service *is* the engine-subtree owner; the discipline just never says so. Third, the store module's mutators do service work by design — closeBoard imports two services and three composables (lines 34-41) — a documented inversion (header, lines 1-15) that makes store/index.ts the most-coupled module in the SPA. Judgment: keep the single store (no Pinia); name the engine-subtree owner explicitly, route the maxVisitsTarget write through `mutateBoard`, and consider a writer-enumeration lint for `store.boards`/`store.engine` outside their owners.

2. Splitting types.ts. Yes — and IDENTIFIERS.md is itself the evidence. The file (2363 lines) interleaves identifier brands (84-221, 1580-1583), the ~330-line knob vocabulary (472-803), qEUBO domain types (805-900), the ~460-line AppSettings schema (956-1417), UISession (1419-1578), SR/library/card-tree domain projections, and GlobalStore (1906-1920). IDENTIFIERS.md exists to compensate (its own lines 1-9 say so), and its file:line citations have already drifted (it cites useReviewSession.ts:274/312/323 for casts now at 262/300/311; types.ts:82/1502/1493 for declarations now at 84/1591/1582) — the manual mirror decays exactly the way its "Updating this map" section warns. The right seam is the one the banner comments already draw: `types/ids.ts` (Brand + every identifier + PerBoard), `types/knobs.ts`, a store-schema module (AppSettings/UISession/GlobalStore, which pairs naturally with defaults.ts), and per-domain value-object modules near their ACLs. A barrel re-export from types.ts keeps all import sites stable; types erase at runtime so no runtime artifact changes (build-time impact unmeasured, per ADR-0009 framed as a hypothesis only). The migrations rolling-archive discipline (frontend/CLAUDE.md) is the project's worked precedent for pure cut-and-paste file splits.

3. analysis-service.ts does five jobs: WS lifecycle + identity probing + timers (130-442); query construction (451-671, 673-858); per-query bookkeeping (1029-1155); packet ingestion into ledger/stability/persistence (923-1020); telemetry glue throughout. The auditability cost is concentrated in the two analyze methods: ~200 near-duplicated lines each, with five "see analyzeRange above" comment cross-references (716, 722, 728, 771, 784) and the cadence-clamp logic written twice (615-636, 814-825). The extraction direction is already proven in-file — winrate-framing, version-probe, and capability-injection are pure modules (imports 15-27). The remaining seam: a pure `buildAnalysisQuery(descriptor) → KataGoAnalysisQuery` builder (tier-1 testable as data), leaving the methods as resolve-descriptor → register → subscribe; plus an engine-connection module owning the store.engine writes (which also resolves Q1's ownership gap).

4. Per-board scoping is coherent and deliberately partial. The Class A registry (store/index.ts:309-323) + Class B inline-ordered purges split is a documented judgment (board-scope.md "Two teardown classes") I find defensible — folding ordering-bound purges into array position would trade legibility for nothing. The honest weakness is named in board-scope.md itself: the guarantee is a test-pinned convention, not a type-level proof, and the slot-ownership lesson (the card-tree slot's `source` discriminator + the one-slot lint) is applied per-bug, not per-class. I found a live near-twin of the multi-writer-no-owner shape: `session.ui.showMoveSuggestions` has four writers (useReviewSession.ts:282/556/629 plus keybindings.ts:217), and the review session restores `true` unconditionally rather than the user's prior value — a user who keeps suggestions off gets them forced on after every review. Also, closeBoard's docstring says "Four cleanups currently fire:" then lists ten (store/index.ts:331-395) — prose enumeration rotting next to the registry that doesn't.

5. ADR-0010 vs layering. The current ESLint split is fail-open: EFFECTFUL_SERVICE_PATTERN (eslint.config.js:166-172) enumerates exactly four singletons; sync-service and qeubo-service are absent, and any new effectful service is unrestricted until someone remembers the list. A true reconciliation, in my judgment, is to make the directory match the principle ADR-0010's Revisit #4 already hints at: services/ conflates two kinds — effectful singletons and reactive-state modules (analysis-ledger, analysis-config). Relocate the reactive-state modules (e.g. src/state/), then the rule becomes structural ("components may not import src/services/**") and the two directives collapse into one: components read state, composables orchestrate effects, services perform them. The minimal-churn variant: invert the lint polarity now — deny services/** with explicit reactive-state exemptions — so new services are restricted by default.

6. App.vue: ~360-line script + ~162-line template + ~193-line style against CLAUDE.md's ≤250 / ~150-per-section budget. The composable-extraction shapes that fit the layering: (a) `useBoardMoveRouting` for handleBoardMove/handlePastePv (267-349) — the review-state gating there is grading-integrity policy, i.e. logic in a component, and extraction makes it tier-3 testable; (b) `usePlayVsEngine` for the start/end/heads cluster (142-198); (c) the follow-me watcher (209-221) as a sibling of useEngineResponder. The bigger surprise is the style block: it is an unscoped global stylesheet serving at least six other components (`.visits-override-row`/`.dark-input` → ReviewSessionPanel and modals, `.deck-selector-box` → ForestDirectory, `.settings-section`/`.registry-container` → SettingsTab, `.toolbar-btn-sm` → four files; `.tab-padding-sr` is dead). Style ownership is non-local — editing App.vue's CSS silently changes distant components. Moving the shared classes to assets/css (per the contraction options CLAUDE.md lists) is a pure auditability win with no behavior change intended.
````

**Findings (structured, verbatim):**

````json
[
 {
  "title": "Mutator discipline breached: direct board mutation with unjustified cast in analysis-service",
  "evidence": "frontend/src/services/analysis-service.ts:463 — `if (board) (board as any).maxVisitsTarget = visits;` inside analyzeRange. Bypasses mutateBoard (store/index.ts:153-173), so no boardsVersion bump fires for SyncService's debounced persistence; the `as any` carries no justifying comment (frontend/CLAUDE.md 'Type-driven design': an `as` needs a justification or it doesn't ship) and is unnecessary since BoardState.maxVisitsTarget is declared optional at types.ts:278. ADR-0001's 'Revisit when' #3 names exactly this drift class.",
  "implication": "Route the write through mutateBoard (or drop it into the caller's existing mutation) and delete the cast. More broadly: a small writer-enumeration lint for `store.boards` writes outside store/index.ts would make ADR-0001's review-only convention partially mechanical.",
  "confidence": "high"
 },
 {
  "title": "store.engine has a de facto owner (analysis-service) that the mutator discipline never names",
  "evidence": "~20 direct store.engine.* write sites in frontend/src/services/analysis-service.ts (169-192, 209, 273-280, 297, 328, 341-354, 370-375, 398-411) versus one named mutator, setSelectedModel (store/index.ts:191-193). The disconnect/onDisconnect reset block (info/selectedModel/metrics/activeMode) is duplicated at 169-192 and 398-411.",
  "implication": "Either extract an engine-connection module that owns store.engine writes (also collapsing the duplicated reset block into one function), or document analysis-service as the engine-subtree owner and lint other writers. Makes 'who writes engine state' answerable from one place.",
  "confidence": "high"
 },
 {
  "title": "analyzeRange / analyzeActiveNode are ~200-line near-duplicates held together by cross-referencing comments",
  "evidence": "frontend/src/services/analysis-service.ts:451-671 and 673-858. Five 'See analyzeRange above for the … rationale' comments (716, 722, 728, 771, 784); the first-report/cadence clamp logic appears verbatim twice (615-636, 814-825); cacheFlags, capability injection, telemetry registration, and the restart-thunk pattern are each written twice. Pure helpers already extracted (winrate-framing, version-probe, capability-injection — imports at 15-27) prove the seam works.",
  "implication": "Extract a pure `buildAnalysisQuery(descriptor)` (engine/katago band) returning the wire query from plain args, unit-testable at tier 1; the two methods reduce to descriptor-resolution + bookkeeping + subscribe. A divergence bug between the two clamp copies currently has no test that would catch it.",
  "confidence": "high"
 },
 {
  "title": "types.ts should split along its existing banner seams; IDENTIFIERS.md's drift is the proof the manual mirror doesn't hold",
  "evidence": "frontend/src/types.ts (2363 lines) mixes identifier brands (84-221, 1580-1583), the knob vocabulary (472-803), qEUBO types (805-900), AppSettings (956-1417), UISession (1419-1578), domain value objects, and GlobalStore (1906-1920). IDENTIFIERS.md:1-9 states it exists because of this mix; its citations have already drifted (useReviewSession.ts:274/312/323 → actual 262/300/311; types.ts:82/1502/1493 → actual 84/1591/1582), the failure mode its own 'Updating this map' section calls out. Two declared-dead types (CardSetKey, ReviewSessionId, types.ts:1582-1583) sit unflagged in source.",
  "implication": "Split into types/ids.ts (+ PerBoard), types/knobs.ts, a store-schema module (AppSettings/UISession/GlobalStore, pairing with defaults.ts), and per-domain value-object modules, with a barrel re-export keeping import sites stable. Compiler-checked structure replaces the half of IDENTIFIERS.md that decays; types erase at runtime so no runtime artifact changes (build-time cost is an unmeasured hypothesis per ADR-0009).",
  "confidence": "high"
 },
 {
  "title": "The effectful-singleton ESLint boundary is fail-open: an enumerated blocklist of exactly four services",
  "evidence": "frontend/eslint.config.js:166-179 lists backend-service, library-service, analysis-service, analysis-persistence-service. sync-service and qeubo-service (an ACL per types.ts:808-811) are absent; any newly added effectful service is importable from components until someone extends the list. ADR-0010 'Revisit when' #4 and the eslint header (62-86) both name the effectful-vs-reactive split as a working reconciliation, not a proven bridge.",
  "implication": "Minimal fix: invert polarity — restrict src/services/** wholesale and exempt the reactive-state modules explicitly, so new services are denied by default. Fuller reconciliation: relocate reactive-state modules (analysis-ledger, analysis-config) out of services/ into a state/ band, making the rule structural and collapsing the two directives into 'components read state, composables orchestrate effects, services perform them'.",
  "confidence": "high"
 },
 {
  "title": "App.vue's unscoped style block is a covert global stylesheet for at least six other components",
  "evidence": "Classes defined in frontend/src/App.vue:526-718 are consumed elsewhere with no local definition: .visits-override-row/.dark-input/.visits-input (ReviewSessionPanel.vue, modals, AnalysisTimelinePanel.vue), .deck-selector-box/.deck-dropdown (ForestDirectory.vue), .settings-section/.registry-container (SettingsTab.vue), .toolbar-btn-sm (four files); .tab-padding-sr (App.vue:624) matches nothing anywhere. Verified by grep across src/**/*.vue.",
  "implication": "Move shared chrome classes to assets/css (CLAUDE.md's listed contraction option) and delete the dead rule. Today an edit to App.vue's CSS silently restyles distant components — a non-local-ownership hazard — and the style section alone (~193 lines) exceeds the ~150-line section budget.",
  "confidence": "high"
 },
 {
  "title": "App.vue script carries grading-integrity policy that belongs in a composable",
  "evidence": "frontend/src/App.vue:267-349 — handleBoardMove routes moves through the review-state machine (AWAITING_MOVE → processUserMove; LOADING/ANALYZING → swallow; IDLE/FINISHED → free play + play-vs-engine head trigger) and handlePastePv enforces the AWAITING_MOVE paste ban. CLAUDE.md 'Architectural shape': logic does not live in components. The script section is ~360 lines against the ≤250-total SFC budget.",
  "implication": "Extract useBoardMoveRouting(reviewSession, engineResponder) and usePlayVsEngine (App.vue:142-198), plus the follow-me watcher (209-221). The SR-gating policy guards review-grading correctness (free play would bypass N-move discipline and grading) and becomes tier-3 testable against fakes only after extraction.",
  "confidence": "high"
 },
 {
  "title": "Live near-twin of the documented multi-writer-no-owner bug: showMoveSuggestions blind-mode toggling clobbers user preference",
  "evidence": "Four writers, no owner: useReviewSession.ts:282 (loadCard sets false, 'Blind Mode'), :556 (finishCard sets true), :629 (endSession sets true), keybindings.ts:217 (user toggle). finishCard/endSession write `true` unconditionally instead of restoring the pre-review value. board-scope.md:107-166 records the lesson ('when a per-board surface has more than one writer, give it an owner, not a per-writer guard') and itself notes the lint guard covers only the card-tree slot, leaving the class convention-guarded.",
  "implication": "A user who keeps move suggestions off has the setting force-enabled by every completed or ended review — a small but real correctness defect in stored user preference. Fix shape: a blind-mode owner that snapshots and restores the prior value (and treeExpanded, flipped at useReviewSession.ts:283 and never restored at all), mirroring the slot-ownership pattern.",
  "confidence": "high"
 },
 {
  "title": "closeBoard's prose cleanup enumeration has rotted while the registry half stays sound",
  "evidence": "frontend/src/store/index.ts:330-331 — 'Four cleanups currently fire:' immediately followed by ten enumerated items (1-10, lines 333-395). The BOARD_SCOPED_STORE_CELLS registry (309-323) and its label-tripwire test cover only the four Class A cells; board-scope.md:77-85 is explicit that registry coverage is convention + test, not a proof, and a newly added per-board cell is caught only if its author remembers both steps.",
  "implication": "Small doc fix now (the stale 'Four'). The structural lesson: enumerations that live as docstring prose decay; where ordering permits, prefer registry-plus-test (already the pattern for Class A and IDENTITY_SCOPED_CACHES). The Class B inline-ordered purges staying out of the registry is a documented, defensible judgment — keep it, but the convention-only guarantee for new PerBoard cells remains the known soft spot.",
  "confidence": "high"
 },
 {
  "title": "Review-session state is split across three locations, weakening auditability of one state machine",
  "evidence": "Per-board review rows live in store.session.reviews (types.ts:1890-1904, mutated via mutateReviewSession, store/index.ts:195-210); in-flight abort controllers live in a module-scope Map in useReviewSession.ts:67 (deliberately, so closeBoard/resetWorkspace can reach them — block comment 39-66); blind-mode side effects write workspace-global UI fields (useReviewSession.ts:282-283). The status enum, its transitions, and its cancellation tokens cannot be audited from one file.",
  "implication": "Judgment call, lower priority: a review-session service module owning row + abort registry + blind-mode snapshot would give the state machine one auditable home and shrink useReviewSession to projection + orchestration. The current shape is documented and works; this is a cohesion improvement, not a defect.",
  "confidence": "medium"
 }
]
````

**Coverage (verbatim):**

````
Read END TO END this session: frontend/src/store/index.ts (789 lines), frontend/src/types.ts (2363, two passes), frontend/src/services/analysis-service.ts (1182), frontend/src/App.vue (718), frontend/src/store/defaults.ts (723), frontend/src/lib/knobs.ts (803), frontend/src/composables/review/useReviewSession.ts (657), frontend/CLAUDE.md, frontend/docs/notes/board-scope.md, frontend/IDENTIFIERS.md (entire file, including all of 'Known erosions'), docs/adr/0001-state-mutation-and-readonly.md, docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md, frontend/eslint.config.js. Consulted partially as sanctioned lookup references: frontend/FILES.md (band rows for the commissioned files only). Verified by grep (not full reads): store-write sites across src/services/, maxVisitsTarget writers, showMoveSuggestions writers, App.vue style-class consumers. NOT read (named per ADR-0002): ADR-0002/0003/0004/0005/0006/0007/0008/0009 — their content is cited only as restated inside documents I did read (frontend/CLAUDE.md, ADR-0010, eslint.config.js header); if the restatements diverge from the ADR originals, my framing of the ≤250-line SFC budget (ADR-0007), the fail-loudly calibration (ADR-0002), and the perf-substantiation rule (ADR-0009) could be incomplete. Also not read: the render-coupling postmortem, resource-ownership-audit-plan, per-board-multi-query-model-plan, knob-registry-plan, migrations.ts/archived-migrations.ts, and the bodies of analysis-ledger.ts / analysis-config.ts / sync-service.ts / board-card-trees.ts — so claims about those modules rest on their characterization in the files I read plus grep hits, and the Q3/Q4 seam proposals could miss constraints internal to the ledger or sync service. backend/qeubo/ untouched per the licensing firewall. No perf property is asserted as measured anywhere in this report; all performance remarks are hypotheses needing a profile.
````


---

