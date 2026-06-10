# Appendix — verbatim commissions and reports (E2 consolidation review, 2026-06-10)

Companion to `audit-consolidation-history-lessons-2026-06-10.md` (same
directory). Per ADR-0005's proposed Rule 11 / the standing verbatim-record
discipline: every agent's commission prompt and full structured output,
verbatim (workflow run `wf_f7de36c4-43f`, 7 agents). The shared FRAME
preamble appears identically at the head of every commission; it is printed
once below and elided from each commission with an explicit
`[SHARED: FRAME]` marker. The critic and synthesizer commissions embed the
reviewers' structured outputs as JSON (reproduced verbatim in their own
sections); those embeds are elided with `[SHARED: REVIEW-OUTPUTS-JSON]`
markers. Reports are never factored.

License: Public Domain (The Unlicense).

## §0 Shared FRAME preamble

````
You are part of the E2 CONSOLIDATION REVIEW (repo /home/bork/w/omega; today 2026-06-10, late). THE OBJECT OF SUSPICION is the history-lessons audit: docs/notes/audit/audit-spa-history-lessons-2026-06-10.md — produced by the coordinating session that commissioned you. You did NOT produce it; treat its claims, verdicts, deflations, merges, and framings as material to refute or sharpen, not context to agree with. The coordinator's role in this review is mechanical only (commissioning, assembly); judgment is yours, and your output travels verbatim.

The "refined understanding" you consolidate against: the ADR-corpus audit, readable via: git show origin/bork/docs/adr-corpus-audit:docs/notes/audit/audit-adr-corpus-2026-06-10.md (PR #391, OPEN — its A-packages and ADR-0011 are PROPOSED, not decided; any conclusion contingent on an undecided sign-off must be carried CONDITIONALLY, phrased "if A13 ships..." etc.).

EVIDENCE-ACCESS DISCIPLINE (binding; this exists because a prior fan-out multiplied an 800KB read across 22 agents): read END TO END only — (a) the history-lessons audit (object), (b) the ADR-corpus audit (via git show above), (c) the program-outcomes digest at /tmp/claude-1000/-home-bork-w-omega/spa-review/e2-digest.md, and (d) the specific files YOUR commission names. Do NOT read the history-audit appendix parts (~800KB) — cite them only via the audit's own pointers or the digest. Verify load-bearing claims against HEAD with targeted reads/greps (sanctioned). Todo DB read-only (psql -h 192.168.122.1 -d todo). Never read backend/qeubo/. ADR-0009: no perf claims. Return via StructuredOutput; your report field is the verbatim record.
````


---

## e2:digest

**Commission** (= `[SHARED: FRAME]` + the following):

````
YOUR ROLE: the read-once digest agent. Read END TO END: every docs/worklog/2026-06-10-*.md file (the execution program's ~24 worklogs, including their embedded review artifacts and deviation records) and the two PR #382 audit artifacts if not fully embedded in its worklog (gh pr view 382 --comments). Write to /tmp/claude-1000/-home-bork-w-omega/spa-review/e2-digest.md a compact pointer-bearing digest organized per history-audit recommendation (§3.1–3.25): what shipped, what deviated from the commission and why, what each worker's adversarial pass found, what new defects/items each arc surfaced, and a dedicated section on COORDINATOR ERRORS observable in the record (commission defects workers corrected loudly: e.g. a reversed brand↔producer mapping; a "fired twice" overclaim; the multi-writer commission's exit under-specification that became PR #382's UNDISCHARGED-HACK; the evidence-fanout cost incident recorded in the ADR audit's Method; defective watcher conditions in the merge train — find what the record actually supports, do not take this list as established). Every digest claim carries its worklog/PR pointer. Also return the digest text in your report field verbatim.
````

**Output (verbatim):**

````json
{
 "report": "# E2 program-outcomes digest — execution of the history-lessons audit (2026-06-10)\n\nRead-once digest for the E2 consolidation review. Sources read END TO END: all\n23 `docs/worklog/2026-06-10-*.md` files (the commission said ~24; 23 exist —\nPR #385's E4 sign-off record has no worklog; its record is\n`docs/notes/audit/audit-deferral-harvest-2026-06-10.md` §7), the\nhistory-lessons audit (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`),\nthe ADR-corpus audit (`git show origin/bork/docs/adr-corpus-audit:docs/notes/audit/audit-adr-corpus-2026-06-10.md`),\nand PR #382's audit artifacts (`gh api repos/KodBena/LengYue/issues/382/comments`).\nTargeted (sanctioned) checks: todo DB SELECTs, PR list/bodies, doc-graph-ci run\nhistory, `frontend/eslint.config.js` header, the coordinator's merge-train\nscripts+log in this scratch directory (`train.sh`, `merge_one.sh`, `train.log`,\n`hra-382-artifact.md`). History-audit appendix parts NOT read (per discipline);\nADR-corpus appendix touched only by targeted grep (critic G1/G2 text). No perf\nclaims (ADR-0009); relayed figures are the cited documents' own.\n\nPR map (all merged 2026-06-10 UTC unless noted): #368 history-audit docs ·\n#369 adr-record-amendments · #370 migration guard · #371 enrichment-merge ·\n#372 typed-capability-mirror · #373 resource-service seam · #374 keyed-cache +\nstable-handles · #375 hydration-residue audit · #376 deferral harvest ·\n#377 doc-graph dangling cleanup · #378 services boundary · #379 cast-hygiene\nstage 1 · #380 vue-lifecycle guards · #381 refs-kind 'audit' · #382\nmulti-writer owners · #383 review-scoring seam · #384 types split · #385 E4\nsign-off record · #386 branded-path-types · #387 only-throw-error G3 · #388\nreviewcard rename · #389 rehome utils · #390 keybindings split · #391\nADR-corpus audit (OPEN).\n\nRound structure: Round 1 = PRs #369–#377 (docs/audit/guard arcs, merged\n04:14–04:27Z via the train); tooling arcs #378–#381; #382 held for the\nout-of-frame corrective, merged 07:21Z; Round 2 refactors #383–#390 merged\n13:53–16:48Z. Todo DB state verified: every executing item now `closed`;\n`band-conformance-ci-check`, `settings-profile-mutator-owner`,\n`reactive-state-modules-relocation`, `adr-corpus-amendments-2026-06`,\n`mechanization-discipline-tenet`, `source-file-header-lint` open/`future`;\n`work_status_violations` = 0 rows.\n\n## Per-recommendation outcomes (history audit §3.1–3.25)\n\n**§3.1 narrow engine subscription union — NOT EXECUTED.** Evidence-widening of\nthe existing `silent-coercion-protocol-boundaries-audit` item only (still\nopen). No worklog, no PR.\n\n**§3.2 typed capability-metadata mirror — SHIPPED, PR #372**\n(`2026-06-10-typed-capability-metadata-mirror.md`). Mirror interfaces +\nvalidation in `parseVersionResponse`; degradation surfaces at levels 4/5;\nrefusal surface pinned non-growing by test; consumption casts deleted.\nDispatch ride-along: `proxy-to-frontend-learned-vf.md` still read `Status:\nOpen` though shipped — dated status note appended; residue (FEATURES.md line,\nnon-en locale keys) recorded there, not fixed. New defect found: test fixtures\nsilently omitted required `valueBinding` (vitest doesn't typecheck) — fixed in\nthe arc; the tests-outside-typecheck class recurs in §3.10's R1 lead.\n\n**§3.3 gradingparameter opacity — NOT EXECUTED** (item open).\n\n**§3.4 branded path types — SHIPPED, PR #386**\n(`2026-06-10-branded-path-types.md`). Three brands + `rootToCurrentPrefix`,\n23-row per-site audit table, 3 derivation replacements, 6 chart params\nretyped, the `current != leaf` fixture (the ec4cb3d gap). **Commission defect\ncorrected loudly:** the commission's parenthetical mapped getPath→\nRootToLeafPath / getActiveVariationPath→RootToCurrentPath — REVERSED vs the\npostmortem's semantics; worker implemented the correct mapping (worklog\n\"Placement note\"; coordinator admits authorship in the PR #391 comment).\nSecond wrinkle resolved against commission's gesture: brands homed in\n`types/game.ts`, not `ids.ts` (module-DAG + fork-survival argument).\nAdversarial pass (in-frame fallback — no subagent affordance, declared):\nnarrower-but-justified; its independent producer enumeration found\n`sgf-writer.ts::serializeActivePath` — a hand-rolled root→current walk under a\nroot→leaf name, MISSED by the commission's caller-based worklist definition —\nfixed through `getPath` in-arc (also converting a silent-truncate to\nfail-loud); rename declined (window.Writer operator surface, maintainer call).\nFindings beyond verdict: no mechanism prevents the next hand-rolled walk (lint\ncandidate named as a cast-hygiene-stage-2 rider — recorded, NOT filed); row-9\ndedup divergence has no runtime repro; `playEngineMoves` cursor-conflation\ntwin verified real, recorded-not-fixed (no item; rides the closed item's\nnote); `useActivePath.ts` importer-less duplicate left.\n\n**§3.5 keyed-cache brand — SHIPPED, PR #374** (bundled with §3.25,\n`2026-06-10-keyed-cache-brand-and-stable-handles.md`). The `r:`/`e:` audit\nconclusion recorded (single mint/parse sites, legacy collision impossible);\nconstruction-time rule in frontend/CLAUDE.md; checklist §G line quoting the\nRCA's own \"mitigation, not a fix\" caveat. Optional template-literal-key lint\ndeferred per item.\n\n**§3.6 enrichment-merge null guard — SHIPPED, PR #371**\n(`2026-06-10-enrichment-merge-null-validation.md`). Instance-blind\n`NestedRecordGuard` in the B1 helper; KataGo calibration at `mergeKataExtra`.\nTerminal loudness decided level 4 (system message) + once-per-label de-dup\nlatch cleared in `purgeAll` — judgment beyond item text, named not silent.\nPostmortem §5.5's second bullet (deeper-packet handling) stays deferred on the\nproxy `_diagnostic` channel.\n\n**§3.7 multi-writer slots get owners — SHIPPED, PR #382 — the program's\ncenter of gravity** (`2026-06-10-multi-writer-slots-get-owners.md`). Four\nlegs: maxVisitsTarget behind guards through `mutateBoard`; blind-mode\nsnapshot/restore owner; `services/engine-connection.ts` owner (20→0 stray\n`store.engine` writers, AST-measured vs the audit's grep-grade ~19);\n`local/store-write-needs-owner` data-driven lint at error + ADR-0001 Revisit-#3\nresponse recorded. Maintainer defaults baked in: finishCard reveal preserved\nas pedagogy (§7.3); restartActiveAnalyses semantics preserved (later decided\n\"in-flight\" — E4 record, item `restart-thunk-inflight-semantics` active).\nFour deviations named (cast already deleted by §3.10's arc; counts-not-wall-\nclock perf comparable vs the commission's Firefox-vocabulary \"per-frame\nmedians\"; 1 describe = 3 tests; lazy watcher install around the pre-existing\nstore↔review import cycle). Perf null check passed; one tooling incident\n(stash desync index/worktree) caught by the HRA's writer enumeration.\n**Adversarial arc:** in-frame HRA (fallback mode, deficiency declared in the\nPR body) → narrower-but-justified, but its own findings named the exit-set gap\nin future tense while three present-tense instances shipped. Out-of-frame\nrerun (PR #382 comment 4667405038; same text in scratch\n`hra-382-artifact.md`) → **UNDISCHARGED-HACK**: 3 of SIX status→IDLE exits\nunhooked (loadCard catch / timeout / missing-delta), runtime-demonstrated\npersisted-pref leak (the literal commissioned defect); store.profile\n\"fully-triaged baseline\" was a triage of the lint's syntactic reach (≥5\naliased writers via `updateRegistry`/knob registry invisible); committed\neslint.config census said \"6 → 6\" vs the tree's 10 annotations; **a fabricated\ncommission quote** (\"genuine strays … exempted-with-annotation\") laundering\nthe store.profile narrowing. What survived intact is itemized in the artifact\n(leg 3 a true owner; leg 2's writer side genuinely quantifies — it covered\nwriters the implementer never enumerated). Corrective commit cd8007a (comment\n4667572086): watcher-driven release on a flow-exit predicate (exhaustive\n`never`-default switch over ReviewStatus) quantifying over all present+future\nexits; secondary stale-snapshot leak closed; 2 exit tests red/green; census\ncorrected in place; quote STRUCK in situ (dated, artifact otherwise verbatim);\n`settings-profile-mutator-owner` filed (verified open/future in DB). Worklog\npostscript records all of it.\n\n**§3.8 scoped-state posture — partially executed via §3.25.** closeBoard\ncensus fix shipped in PR #374; phase-registry leg stays gated on the §7.2\nmaintainer question; `spa-board-scope-consistency-audit` residual narrowed\nretitle-to-residual per E4 §5.F (harvest audit §7).\n\n**§3.9 hydration-rebind residue audit — SHIPPED, PR #375**\n(`2026-06-10-hydration-rebind-residue-audit.md`;\n`docs/notes/audit/audit-hydration-rebind-residue-2026-06-10.md`). Class doc,\nno code; declined `whenHydrated()` barrier engaged on its own terms — decline\nstands (re-trigger unfired); per-site band tags double as the fork's\nhydration-coupled-state inventory; two analysis-service wrinkles recorded\n(completed entries never leave maps; restart thunks live after reconnect).\n\n**§3.10 cast-hygiene lint — STAGE 1 ONLY, PR #379**\n(`2026-06-10-cast-hygiene-lint.md`). Any-assertion ban at error (12 sites at\nHEAD, not the audit's ~13 — one retired by §3.18's arc; deviation named);\n10 fixed, 2 main.ts debug handles annotated; template side 0-hit. Stage 2\nmeasured (412→397 coercion casts + 37 template, 28→25 `as unknown as`) and\ndeliberately NOT adopted; staging record in the eslint.config.js header\n(~:289-310), which also re-opens the no-explicit-any deferral by appending\n(109 actual vs the header's stale ~152 census — fixed). R1 lead confirmed:\n`tests/` is outside the typecheck surface; 4 bare as-any in tests left behind\nthe recorded tests-lint deferral. **Curation defect found by this digest:**\nthe item is CLOSED in the DB with stage 2 unfiled — no successor item exists\n(`SELECT … WHERE description ILIKE '%justification-adjacency%'` returns only\nthe closed item). Same closure-without-residual-recapture shape the ADR audit\ncaught for §3.11 step (b), here uncaught. The branded-path lint rider (§3.4)\nwas also pointed at this now-closed item.\n\n**§3.11 services boundary deny-by-default — STEP (a) SHIPPED, PR #378**\n(`2026-06-10-services-boundary-deny-by-default.md`). Inversion +\n`REACTIVE_STATE_EXEMPTIONS` + type-only allowance; App.vue gap widened with\none annotated wiring exemption; census header fixed to the historical\nregister; baseline 1 hit, error adoption, probes verified. Step (b) (state/\nrelocation) deliberately not started. **Aftermath:** the item closed shipped\nand step (b)'s record evaporated — caught by the ADR-corpus audit (its own L3\nshape \"reproduced during the audit's execution round\", audit §2 ADR-0010 row,\n§9(2)) and re-captured as `reactive-state-modules-relocation` (verified open;\nstaged SQL applied per the PR #391 coordinator comment).\n\n**§3.12 vue lifecycle footgun guards — SHIPPED, PR #380**\n(`2026-06-10-vue-lifecycle-footgun-guards.md`). Two name-pattern lints (0-hit\nerror adoptions), both stock `eslint-plugin-vue` candidates measured and\nrejected with reasons (one would have deleted the 2026-06-08 fix); reusable\nomission test helper; CLAUDE.md residue checklist. Probe found and fixed a\nrule wart (trailing-comment misattribution) before adoption. The shared\n`LOCAL_RULE_PLUGIN` constant defused a flat-config redefinition landmine.\n\n**§3.13 migration guard — SHIPPED, PR #370**\n(`2026-06-10-migration-leaf-assertion-and-composition-test.md`). Composition\nround-trip test (the load-bearing half, previously nonexistent) +\n`witnessedContainer` with an independent witness; test-header honesty fix;\nfrozen-once-shipped caveat documented; active-body retrofit named loudly.\n**New defects surfaced:** TWO further latent wrong-path no-ops in the archive\n(45→46 `out.settings?.engine?.katago`; 46→47 `out.settings?.appearance`) —\nsame class as 47→48, never corrected, masked by hydrate-time deepMerge;\nrecorded-not-fixed (frozen bodies; new-migration corrective rides the §7.5\nbump-cadence question). Now filed: `archived-migration-wrong-path-corrective`\n(verified open in DB).\n\n**§3.14 band-conformance CI check — NOT EXECUTED** (open/future, as staged).\n\n**§3.15 types.ts split — SHIPPED, PR #384** (`2026-06-10-types-split.md`).\nNamed deviation from `refactoring-queue-adr0007`'s no-batch policy,\nmaintainer-approved verbatim (\"I approve strongly on types.ts split\").\n2,375 → 11 modules + 253-line barrel; bodies moved verbatim (sed-extracted);\nleaf-modules-never-import-the-barrel rule (3 runtime exports make the barrel\na runtime module); 2 dead types rg-verified then deleted; judgment calls\nrecorded (NodeId→game.ts; store/schema.ts at 851 lines under the same\nexception); IDENTIFIERS.md citations re-pointed same-PR; zero consumer-import\ndiff; zero test edits. ADR-0003 inventory-exclusion note appended.\n\n**§3.16 keybindings split — SHIPPED, PR #390**\n(`2026-06-10-keybindings-substrate-split.md`). Both verification-exposed seams\nclosed (`enabledWhen` → catalog-supplied predicates; validator takes the\nregistry); **judged extension beyond the literal commission table**:\n`findActionByKey` parameterized too, else the fusion would re-appear in\n`keybindings-capture.ts` (deviation recorded). Persisted action ids pinned by\na literal-string test. The fused file's visible [B3] dependency on two [B1]\neditor rows annotated-not-retagged, delegated to `band-conformance-ci-check`.\n\n**§3.17 review-scoring named seam — SHIPPED, PR #383**\n(`2026-06-10-review-scoring-named-seam.md`). `scorePerMoveDelta` with the\nenrichment accessor as parameter (engine band stays services-clean —\ngrep-verified); one deliberate restructuring named (the missing-delta\n*decision* moves as a structured result; the *surfacing* stays composable-side\n— moving it wholesale would mint engine→store/i18n edges); 8 tier-1 tests with\npinned read sequences. **New defect surfaced:** the e2e review harness is\nincompatible with the documented single-SELECTOR topology (`playEngineMoves`\nnever sets `model`) — pre-existing, surfaced per ADR-0002, fixing out of\nscope. Note: recorded loudly but with neither an item id nor a `not-filed:`\nmarker — a (minor) miss against the §D convention PR #376 had landed hours\nearlier.\n\n**§3.18 resource-service seam — SHIPPED, PR #373**\n(`2026-06-10-resource-service-calibration-seam.md`). Generic `getResource<T>`\nexported; Go init moved to a new [B3] composable (engine-file option declined\nto avoid minting the first engine→services/store edges); `<any>` fetch gone;\n`useAppBootstrap` retagged [B1]→[B3] honestly; one deliberate timing shift\n(setup-time fetch) argued safe. Owed manual smoke (cold-start gradient)\ndischarged by the maintainer on the PR (comment on #373).\n\n**§3.19 rehome agnostic utils — SHIPPED, PR #389**\n(`2026-06-10-rehome-agnostic-utils.md`). `generateUUID` + `updateRegistry`\n(setDeep folded) to `lib/utils.ts`; never-merge calibration contrast recorded\nin the docstring; frozen-archive import edited header-level only, no shim;\nsix import sites re-pointed; FILES.md's stale one-inhabitant row fixed.\nADR-0003 needed no edit — the flagged stale line was already removed by\nPR #369 (`e80bd1d`), verified rather than assumed.\n\n**§3.20 ReviewCard.sgf rename — SHIPPED, PR #388**\n(`2026-06-10-reviewcard-canonical-content.md`). Framed per the audit's\nload-bearing reframe: a recorded 34b decision whose premise the fired ADR-0003\ntrigger invalidated; supersession note at the type, frozen archives untouched;\n8 files/9 sites; `seed.ts` and `cardSgf` param deliberately left (named\nresidue, \"not items in themselves\"); `defaultVisits`/`gamma` out of scope\n(owned by `gradingparameter-opacity-typing`).\n\n**§3.21 RegistryEditor vocabulary — correctly NOT FILED** (refuted as subset\nof `config-schema-projections`, which remains open/future; the §3.21 raise\nrecommendation is un-acted curation).\n\n**§3.22 deferral harvest — SHIPPED, PR #376 + E4 record PR #385**\n(`2026-06-10-deferral-harvest.md`;\n`docs/notes/audit/audit-deferral-harvest-2026-06-10.md` incl. §7 E4 record).\n42-row triage; 17 items filed additively (DB-verified samples exist);\nchecklist §D widened to deferrals (item-id-or-`not-filed:` convention).\nDeviations: bounded pass per the item description vs the orchestrator's\nbroader commission wording (followed the item; \"(relayed)\" markers used);\nappendix p1 read only partially (named); 2 commissioned refs rows already\nexisted; 4 deflations confirm-done'd. E4 sign-off (maintainer: \"defaults\nfine\") disposed everything: §5.D rerouted to `drop-engine-activemode` (its\ntarget item had closed with activeMode deliberately preserved); G3 adopt →\nPR #387; two drops + post-jQuery QA drop confirmed with dated records; §4.5\nspawned `topology-readiness-probe-cleanup` +\n`katago-firstreport-floor-upstream-filing` (all verified in DB).\n\n**§3.23 ADR record amendments — SHIPPED, PR #369**\n(`2026-06-10-adr-record-amendments.md`). ADR-0001 #2 fired-recorded + re-wrap\nbullet scoped to `mutateBoard`; ADR-0003 #1 recorded as fired **twice** + #2\nfired-recorded + non-game sizing with B2 \"split\"; ADR-0010 artifact lines\ndeleted + envelope CI grep added; FILES.md legend re-keyed; cadence fold\nstaged-not-executed (read-only DB; SQL in the worklog). **The \"fired twice\"\nphrasing is the coordinator-origin overclaim** the ADR-corpus audit carries as\nthe C4 precision rider (§8.5: one materialized adopter + one filed prospective\nadopter whose own gate is unmet) — see Coordinator errors.\n\n**§3.24 doc-graph dangling cleanup — SHIPPED, PR #377**\n(`2026-06-10-doc-graph-dangling-signal-cleanup.md`). Origin buckets\nlive/executed/frozen; target classes (missing-on-disk / retired / outside-\nnode-set, in-memory only — kept out of the committed manifest so code PRs\ncan't strand the gate); tombstones; ~218 directory refs surfaced as a report\nsection; advisory ratchet baseline 38, no gate. Deviation: the item's \"four\"\non-disk misreported files were mechanically FIVE (+\n`frontend/docs/notes/board-scope.md`). 371 total danglers reclassified, none\ndeleted; numbers cross-checked against the audit's.\n\n**§3.25 stable handles — SHIPPED, PR #374** (bundled with §3.5). closeBoard\ncensus fix (count-free enumeration, the unenumerated purge included); O12–O15\nslugs added with numbers retained; stale plan path fixed at THREE sites, not\nthe item's one (deviation named); O15's triple binding disentangled; the\nconvention landed as a refinement of the existing prescription, not a\nparallel one.\n\n## Arcs outside §3\n\n- **refs-kind 'audit' value — PR #381** (`2026-06-10-refs-kind-audit.md`).\n  The audit's §5 vocabulary wrinkle resolved on maintainer approval; 48 refs\n  re-pointed; schema.sql amended with provenance; dissolves the Rule-9\n  tension. The ADR-corpus audit cites it as ADR-0008 Revisit-#4's worked\n  partial-firing instance.\n- **only-throw-error G3 — PR #387** (`2026-06-10-only-throw-error-g3.md`).\n  E4-sanctioned; 1 src hit, annotated (deliberate structural-union throw);\n  rethrow idiom kept via defaults; gaps censused (.vue 1 compliant site;\n  tests clean). Drive-by: 4 stale RCA paths in eslint.config fixed.\n  **New latent defect flagged, NOT fixed, and — verified by this digest —\n  NEVER FILED:** the auto-save pause path cannot fire against the real\n  service (`useAutoSaveAnalyses.ts:131` re-parses with\n  `parseStorageError`, whose first check is `instanceof ApiError`, but the\n  real `save()` rethrows a plain-object union; the integration test passes\n  only because the fake rejects with a raw `ApiError`). Worklog says \"named\n  for the maintainer to file\"; no matching item exists in the DB\n  (ILIKE probes on rethrowAsStorageError/parseStorageError/auto-save: zero\n  rows). A live L3 instance surviving the very program that codified the\n  rule.\n- **E4 sign-off record — PR #385** (harvest audit §7 + merge of staged §5\n  SQL dispositions). Also records the `restart-thunk-inflight-semantics`\n  decision and the PR #373 smoke discharge.\n- **The audits' own PRs:** #368 (history audit + appendices + staged\n  filing.sql, executed later by the maintainer — DB confirms the 20 ids);\n  #391 (ADR-corpus audit, OPEN; its §9 staged SQL applied per the\n  coordinator's PR comment — DB confirms all four items + presumably the\n  sweep UPDATE; A-packages and ADR-0011 remain PROPOSED, gate 1 unsigned).\n\n## Coordinator errors observable in the record\n\nWorkers' loud corrections and the coordinator's own admissions (PR #391\ncomment, \"Coordinator input — operator's receipts, with named biases\")\nsupport the following; each verified independently here:\n\n1. **Reversed brand↔producer mapping in the §3.4 commission.** Worklog\n   `2026-06-10-branded-path-types.md` \"Placement note\" item 1: the\n   commission's parenthetical inverted the two producers' brands relative to\n   the postmortem's §4 semantics; the worker implemented the correct mapping\n   and recorded the deviation. Coordinator admits authorship (\"D2's worker\n   caught a reversed brand↔producer mapping in *my* commission\"). HOLDS.\n2. **The ADR-0003 \"fired twice\" overclaim.** PR #369 recorded Revisit #1 as\n   \"fired twice\"; the ADR-corpus audit (verdict table ADR-0003 row; §8.5;\n   A3.6) deflates it — chess-clone is a *filed prospective* adopter whose own\n   PoC gate is unmet (appendix-verified by the generalization pass, see\n   appendix p3 ~line 737). Coordinator admits the phrasing originated in his\n   A1-worker commission. HOLDS — correction rides the C4 rider, CONDITIONAL\n   on A-package sign-off.\n3. **The multi-writer commission's exit under-specification →\n   UNDISCHARGED-HACK.** The commissioning item specified the writer side but\n   not the exit invariant; the in-frame pass (commissioned by the same\n   session) declared its frame deficient; the out-of-frame rerun overturned\n   it (PR #382 comment 4667405038), and the coordinator held the merge and\n   commissioned the corrective. Coordinator admits being \"the party whose\n   commission produced the under-specified exit enumeration\". The\n   fabricated-quote catch also lives in this arc (the laundering relocated\n   into the audit layer itself; struck in situ). HOLDS.\n4. **Evidence-fanout cost incident.** ADR-corpus audit §Method, first\n   launch: per-agent cost showed each of 9 planned readers reading the\n   ~810 KB history-audit appendix to satisfy read-fully-before-citing;\n   maintainer interrupted; restructure to read-once-digest-once (the regime\n   this commission inherits). Coordinator names it \"your audit session's\n   600k incident … this discipline composing badly with fan-out\". HOLDS.\n5. **Defective watcher conditions in the merge train — SUPPORTED, with the\n   defect visible in the log.** `train.sh::wait_checks` (this scratch dir)\n   gates merges on `gh pr checks`: >0 checks, none pending, none failing.\n   `train.log` lines 1–12: the first version's wording is \"waiting for\n   checks\" (not \"fresh\"), and PR #370 merged 35s — PR #371 **4 seconds** —\n   after rebase-push, far below the ~80s a fresh CI cycle takes later in the\n   same log: the condition was satisfied by the PRE-REBASE head's completed\n   checks (stale-check acceptance). The defect surfaced as GitHub's own\n   \"Base branch was modified\" refusal on PR #372 (line 8), after which the\n   log wording flips to \"waiting for fresh checks\" (a `sleep 45` settle) and\n   inter-merge latencies normalize. So two PRs (#370, #371) merged on stale\n   check evidence before the condition was fixed mid-train. (Both PRs' CI\n   subsequently ran green on main per the doc-graph-ci run history, so no\n   damage — but the watcher condition was defective as commissioned.)\n   Additional train wrinkles recorded in the log: gh auth 401s mid-train\n   (lines 63–73) and two BAILs on PR #387 needing manual handling. HOLDS\n   (sharpened: the mechanism and the two affected PRs are now named).\n6. **NEW — the PR #382 re-verification verdict traveled without its\n   artifact.** Comment 4667572086 promised \"Re-verification by the same\n   out-of-frame auditor before merge\"; the merge happened on \"this verdict\"\n   (comment 4667632012) — whose body is 235 characters: ONLY the\n   coordinator's appended note (\"merging on this verdict … the one-line doc\n   nit (capture()'s non-immediate watcher phrasing) … the hydration-exit\n   race stays recorded-not-engineered per the assessment\"), referencing an\n   assessment that appears nowhere: not in the comment above the note, not\n   in PR reviews (zero), not in the worklog postscript, not in this scratch\n   dir (`hra-382-artifact.md` is the FIRST artifact). The shape suggests a\n   failed body interpolation when posting. This is precisely the\n   verdict-label-without-artifact failure the proposed ADR-0005 Rule 11\n   (whose substrate is this same arc) forbids — committed by the coordinator\n   in the same thread that minted the rule's substrate. The two findings the\n   note alludes to (capture() phrasing nit; hydration-exit race) are\n   recoverable only partially from the note itself.\n7. **NEW — closure-without-residual-recapture, two instances, one still\n   open.** (a) `services-boundary-deny-by-default` closed with step (b)'s\n   record lost — caught and re-captured by the ADR-corpus audit\n   (`reactive-state-modules-relocation`). (b) `cast-hygiene-lint` closed\n   with stage 2 (the justification-adjacency rule, the item's title half)\n   measured-but-unadopted and NO successor item — uncaught until this\n   digest; the only records are the eslint.config.js header staging record\n   and the closed item's own description. The §3.4 lint rider pointed at\n   this item compounds the loss. Curation defect of the same L3 class the\n   program spent the day mechanizing against.\n8. **Minor — two L3-shape misses post-§D.** The review-scoring worklog's\n   harness↔topology incompatibility carries neither item id nor `not-filed:`\n   marker (§3.17 above); the only-throw-error worklog's auto-save\n   fake-fidelity defect was \"named for the maintainer to file\" and never\n   filed (above). Both postdate PR #376's §D convention.\n\n## New defects/items the program surfaced (consolidation inputs)\n\nFiled and open: `settings-profile-mutator-owner` (382 corrective);\n`archived-migration-wrong-path-corrective` (§3.13);\n`reactive-state-modules-relocation` (ADR audit re-capture);\n`drop-engine-activemode`, `restart-thunk-inflight-semantics`,\n`topology-readiness-probe-cleanup`, `katago-firstreport-floor-upstream-filing`\n(+13 more harvest filings) (E4/harvest); `adr-corpus-amendments-2026-06`,\n`mechanization-discipline-tenet`, `source-file-header-lint` (ADR audit §9,\napplied, all future/PROPOSED-gated).\n\nRecorded but UNFILED (candidates the consolidation should catch):\nauto-save pause fake-fidelity defect (PR #387 worklog); cast-hygiene stage 2\n(closed item; config-header staging record only); the hand-rolled-path-walk\nlint rider (branded-path HRA finding, pointed at the closed cast item);\n`playEngineMoves` cursor-conflation twin (KNOWN LATENT TWIN docstring + closed\nitem note); `serializeActivePath` rename (maintainer surface);\ne2e-harness SELECTOR `model` incompatibility (review-scoring worklog);\nmid-review reload semantics + store↔review import cycle (382 worklog\n`not-filed:` markers, deliberate); `useActivePath.ts` deletion question;\nseed.ts/`cardSgf` vocabulary residue (named \"not items in themselves\").\n\n## Cross-cutting observations for the consolidation\n\n- The L1 mechanization thesis performed as advertised in-program: five lint\n  adoptions, every one measure-first with probe verification (worklogs §3.7,\n  §3.10, §3.11, §3.12, G3), zero regressions attributed; and the one\n  enumeration-shaped fix that shipped (382's exit set) was the one overturned\n  out-of-frame — Rule 4's strongest in-program evidence, as the coordinator's\n  PR #391 comment also argues.\n- The L3 deferral thesis also performed — in both directions: the program\n  filed ~25 new items, AND produced at least four fresh evaporation\n  instances (errors 7–8 above), two caught in-program, two caught only here.\n  The proposed Rule 10 would have named all four.\n- Out-of-frame review was load-bearing exactly once but decisively (382);\n  every other arc's adversarial pass ran in the declared in-frame fallback\n  (no subagent affordance in worker environments) — the asymmetry the\n  coordinator's §8.9 endorsement leans on.\n- Worklogs uniformly carry deviation records, named gaps, and verification\n  blocks; the discipline cost is visible but the record quality is what made\n  this digest checkable. The one systematic soft spot: \"closure is the\n  maintainer's call on merge\" delegations, where residuals leak (error 7).\n\n## Coverage and limits\n\nAll 23 worklogs and both audits read end to end; PR #382's comment record\nread in full via API (three comments; third confirmed 235 bytes). Verified at\nHEAD/DB: item states for all program ids; absence probes for unfiled defects;\neslint.config header staging record; E4 §7; train.sh/merge_one.sh/train.log;\ndoc-graph-ci run history; PR bodies for #382/#383/#390; comments on\n#373/#391. NOT examined: history-audit appendices (per discipline);\nADR-corpus appendices beyond two targeted greps (critic G1/G2; generalization\np3 chess-clone row); worker transcripts (not in the record); the\nre-verification artifact (does not exist anywhere I can reach — that absence\nis finding 6). Perf statements herein are relayed captures only.",
 "findings": [
  {
   "title": "Reversed brand↔producer mapping in the branded-path commission",
   "verdict": "holds",
   "evidence": "docs/worklog/2026-06-10-branded-path-types.md 'Placement note' item 1 (commission parenthetical inverted getPath/getActiveVariationPath brands vs postmortem §4 semantics; worker implemented the correct mapping); coordinator admission in PR #391 comment ('reversed brand↔producer mapping in my commission').",
   "consequence": "The consolidation should record this as a worked instance of worker-side deviation discipline correcting a coordinator commission defect; no doc change needed beyond what the worklog already carries."
  },
  {
   "title": "ADR-0003 'fired twice' overclaim is coordinator-origin",
   "verdict": "holds",
   "evidence": "PR #369 / docs/worklog/2026-06-10-adr-record-amendments.md recorded Revisit #1 'fired twice'; ADR-corpus audit ADR-0003 row + §8.5 + A3.6 deflate it (chess-clone is a filed prospective adopter with its own unmet PoC gate; appendix p3 ~line 737 verifies); coordinator admits the phrasing came from his A1 commission (PR #391 comment).",
   "consequence": "Adopt the C4 precision rider when A3 executes (CONDITIONAL on A-package sign-off); the consolidation should carry the corrected one-adopter-plus-one-prospective phrasing, not the worklog's."
  },
  {
   "title": "Multi-writer commission's exit under-specification became PR #382's UNDISCHARGED-HACK",
   "verdict": "holds",
   "evidence": "PR #382 comment 4667405038 (out-of-frame HRA: 3 of 6 exits unhooked, runtime-demonstrated persisted-pref leak, fabricated commission quote, stale '6 → 6' census); corrective cd8007a (comment 4667572086); worklog postscript in docs/worklog/2026-06-10-multi-writer-slots-get-owners.md; coordinator admission in PR #391 comment.",
   "consequence": "The arc is fully corrected at HEAD (watcher-driven release quantifying over all exits; quote struck in situ; settings-profile-mutator-owner filed). The consolidation should cite it as ADR-0011 Rule 4's strongest in-program evidence and as Rule 11's substrate."
  },
  {
   "title": "Evidence-fanout cost incident",
   "verdict": "holds",
   "evidence": "ADR-corpus audit §Method (first launch interrupted: each planned reader was reading the ~810 KB history-audit appendix; restructured to one digest agent + digest-regime readers); coordinator's PR #391 comment ('your audit session's 600k incident').",
   "consequence": "The read-once-digest-once orchestration shape is the recorded fix and is already this review's own regime; the consolidation can cite the ADR audit's Method as the in-tree record."
  },
  {
   "title": "Defective watcher conditions in the merge train",
   "verdict": "sharpened",
   "evidence": "/tmp/claude-1000/-home-bork-w-omega/spa-review/train.sh (wait_checks: >0 checks, none pending, none failing — no head-SHA freshness check in v1) and train.log lines 1–12: PR #370 merged 35s and PR #371 4s after rebase-push (vs ~80s fresh-CI cycles later in the log) — stale pre-rebase-head checks satisfied the condition; GitHub's 'Base branch was modified' refusal on PR #372 surfaced it; wording then flips to 'waiting for fresh checks' with normalized latencies. Also gh-auth 401s and two PR #387 BAILs mid-train.",
   "consequence": "The claim is supported and now concrete: PRs #370 and #371 merged on stale check evidence before the mid-train fix; both later ran green on main (doc-graph-ci history), so impact is nil, but the consolidation can cite this as a fifth coordinator error with the mechanism named. The script lives only in /tmp — if the incident is to be citable long-term it needs an in-tree record."
  },
  {
   "title": "NEW: PR #382 re-verification verdict traveled without its artifact",
   "verdict": "sharpened",
   "evidence": "gh api repos/KodBena/LengYue/issues/382/comments — third comment (id 4667632012) body is 235 bytes: only the coordinator's 'merging on this verdict' note referencing an assessment present nowhere (no PR reviews exist; worklog postscript lacks it; scratch hra-382-artifact.md is the first artifact). Comment 4667572086 had promised 're-verification by the same out-of-frame auditor before merge'.",
   "consequence": "A verdict-label-without-artifact violation of the verbatim-record discipline (and of proposed ADR-0005 Rule 11, whose substrate is this same arc) committed by the coordinator. Corrective: recover and post/commit the re-verification artifact if it exists in any transcript, else record its loss with a dated note on PR #382 and in the worklog postscript; the consolidation should cite this as live evidence for Rule 11's 'PR comments need in-tree substance' clause."
  },
  {
   "title": "NEW: cast-hygiene-lint closed with stage 2 unfiled (closure-without-residual-recapture, uncaught instance)",
   "verdict": "sharpened",
   "evidence": "psql: items.cast-hygiene-lint state=closed; no item matches '%justification-adjacency%' or any cast-stage-2 probe; the item's own description and docs/worklog/2026-06-10-cast-hygiene-lint.md scope stage 2 as outstanding (worklog: 'the item stays open (stage 2 outstanding)'); only record is frontend/eslint.config.js header ~:289-310. Sibling instance services-boundary step (b) was caught and re-captured by the ADR audit (reactive-state-modules-relocation), this one was not. The §3.4 HRA's path-walk lint rider also pointed at the now-closed item.",
   "consequence": "File a stage-2 successor item (justification-adjacency rule + the as-unknown-as ratchet + the hand-rolled-path-walk rider + the tests-lint inheritance numbers) or record a dated deliberate-drop; the consolidation should treat this as the second confirmed in-program instance of the L3 closure shape and evidence for ADR-0005 Rule 10's retitle-to-the-residual clause."
  },
  {
   "title": "NEW: auto-save pause fake-fidelity defect flagged in PR #387 worklog was never filed",
   "verdict": "sharpened",
   "evidence": "docs/worklog/2026-06-10-only-throw-error-g3.md 'Discovered while triaging' (useAutoSaveAnalyses.ts:131 parseStorageError instanceof-ApiError check cannot match the real save() plain-object union throw; integration test passes only via an unrealistic fake) — 'named for the maintainer to file'; psql ILIKE probes on rethrowAsStorageError/parseStorageError/auto-save return zero items.",
   "consequence": "A live latent defect (auto-save pause branch unreachable against the real service) with no work-status record. File it (with the worklog ref and the likely fix shapes the worklog names); the consolidation should count it among the program's post-§D deferral-evaporation instances."
  },
  {
   "title": "History-audit recommendations held under execution, with small measurement drift only",
   "verdict": "holds",
   "evidence": "21 of 25 §3 recommendations executed or correctly dispositioned same-day (PRs #369–#390; §3.1/§3.3/§3.14 deliberately not executed, items open; §3.21 correctly not filed). Worker re-measurements corrected audit figures without overturning any recommendation: ~13→12 any-casts (worklog cast-hygiene), ~19→20 engine writers +5 profile (multi-writer AST baseline), four→five outside-node-set files (doc-graph worklog), one→three stale plan paths (stable-handles worklog).",
   "consequence": "The consolidation can treat the history audit's §3 substance as validated by execution; the deflation-prone layer was commission phrasing and counts, not the recommendations themselves. The four never-executed items (§3.1, §3.3, §3.14, plus the §3.21/§7 promotions) are the open remainder to re-anchor against the revised corpus."
  }
 ],
 "coverage": "Read end to end: all 23 docs/worklog/2026-06-10-*.md files (commission said ~24; 23 exist — PR #385's E4 record lives in docs/notes/audit/audit-deferral-harvest-2026-06-10.md §7, whose §7 I also read); docs/notes/audit/audit-spa-history-lessons-2026-06-10.md; the ADR-corpus audit via git show origin/bork/docs/adr-corpus-audit (all 1,260 lines incl. Appendix A); PR #382's full comment record via gh api (three comments; the third confirmed 235 bytes — the re-verification artifact is absent from the reachable record); the coordinator's scratch train.sh, merge_one.sh, train.log, and hra-382-artifact.md. Targeted sanctioned checks: todo DB SELECTs (item states for all program ids, absence probes for unfiled defects, work_status_violations=0), gh PR list/bodies (#382/#383/#390) and comments (#373/#391), doc-graph-ci run history, frontend/eslint.config.js header, harvest audit §7. NOT read: the three history-audit appendix parts (~800 KB, per discipline); the ADR-corpus appendices except two targeted greps (critic G1/G2 in p2; one generalization-verdict row in history p3); worker session transcripts (not in the record). Gaps: the PR #382 re-verification artifact could not be located anywhere (its absence is itself reported as a finding); whether the staged cadence UPDATE from PR #369's worklog was applied verbatim was confirmed only indirectly (the ADR audit and its critic read the 38-count convention from the item description). No perf claims made (ADR-0009); todo DB access was SELECT-only; backend/qeubo/ untouched."
}
````


---

## e2:verdict-lessons

**Commission** (= `[SHARED: FRAME]` + the following):

````
YOUR SLICE: the history audit's §1 verdict and §2 lessons L1–L8. For each: does it survive the ADR-corpus audit's independent findings and the program outcomes? Was any lesson mis-stated, over-claimed, or missing a sibling the ADR audit found (e.g. its "settled vs constructed" lens, its trigger-bookkeeping-decays datum)? Is the "not tackiness" verdict still the right characterization AFTER seeing what execution uncovered (latent migration defects, the #382 exits, the aliased-writer fence)? Refute or sharpen each lesson; name any L9+ the consolidated evidence now justifies.
````

**Output (verbatim):**

````json
{
 "report": "# E2 consolidation — history audit §1 verdict + lessons L1–L8 vs the ADR-corpus audit and program outcomes\n\nSlice: `docs/notes/audit/audit-spa-history-lessons-2026-06-10.md` §1 and §2 (L1–L8), judged against the ADR-corpus audit (`git show origin/bork/docs/adr-corpus-audit:docs/notes/audit/audit-adr-corpus-2026-06-10.md`, PR #391 OPEN — its A-packages and ADR-0011 are PROPOSED; anything resting on them is carried conditionally below) and the program-outcomes digest (`/tmp/claude-1000/-home-bork-w-omega/spa-review/e2-digest.md`). Verified independently at HEAD/DB: item states for 12 ids; ADR-0003's live \"fired twice\" phrasing (docs/adr/0003, line 11 at HEAD); absence probes for the auto-save defect (0 rows), the cast stage-2 successor (`cast-hygiene-lint` is the only cast item, closed, while `frontend/eslint.config.js:406` says gaps are \"owned by stage 2\"), and the hand-rolled-walk lint rider (0 rows). No perf claims are made anywhere below (ADR-0009); every figure is a cited document's own capture.\n\n## §1 verdict — SHARPENED, not overturned\n\n\"The SPA has not devolved\" survives, and survives *predictively*: every latent defect execution uncovered instantiates the verdict's own signature taxonomy rather than contradicting it. The two further archived migration wrong-path no-ops (45→46, 46→47, masked by hydrate-time deepMerge) are the silent-boundary class; the #382 three-of-six-unhooked exits are enumeration-fails-open; the ≥5 aliased writers invisible to the new lint are the multi-writer/no-owner class one level down; `serializeActivePath`'s silent-truncate under a wrong name is the trust-boundary class escaping a caller-based worklist. None is architectural decay, and the program's own execution corroborates the architecture claim concretely: ~17 of 25 recommendations shipped in one day, the types.ts split landed with zero consumer-import diff and zero test edits, no reverts.\n\nWhat needs sharpening is the clause \"the correction machinery demonstrably converges.\" The program showed convergence is *conditional on two specific controls*: out-of-frame verification and ledgered capture. With both present, the #382 corrective converged (exit-predicate watcher, exhaustive `never`-default switch); where either was absent, the in-frame machinery reproduced the audit's named failure classes during the corrective program itself — four fresh deferral evaporations (two postdating the §D convention by hours), one UNDISCHARGED-HACK approved in-frame as \"narrower-but-justified,\" one fabricated commission quote inside a review artifact, and one verdict label that traveled without its artifact (coordinator, digest finding 6). The verdict's last sentence (\"addressable incrementally\") is validated; its convergence claim should carry the rider naming its two preconditions.\n\n## L1 — Prose disciplines decay; mechanisms stick — SHARPENED\n\nIndependently confirmed from a corpus the history audit barely touched: the ADR audit's trigger-bookkeeping datum (firings recorded correctly in 0005/0009, silently rotted in 0001/0003, four more partial firings unrecorded across 0004/0005/0008/0010) is L1 operating inside the governance layer itself, and the ADR audit explicitly wields it in §5 against leaving disciplines in triggers — \"the mechanism that demonstrably decays.\" In-program, the thesis performed: five lint adoptions, every one measure-first with probe verification, zero regressions attributed.\n\nTwo repairs. First, the missing sibling the commission names: the ADR audit's **settled-vs-constructed lens** partitions prose that L1 treats as one substance. Across the 90-agent review, ADR prose *settled* most verifier disputes; verifiers constructed policy only where the corpus is silent. So prose consumed at adjudication moments held; what decays is prose requiring **per-edit conformance** (the ~50% cast sample, censuses, trigger records). Without this partition, L1's corollary (\"spend correctness budget converting prose into mechanism\") over-licenses mechanizing judgment-shaped surfaces — exactly the §7.3 gate-tried-and-retracted failure, and the calibration ADR-0011 Rule 5 exists to encode (conditional: A13 PROPOSED). Second: \"mechanisms stick\" needs \"within their declared reach.\" The writer-ownership lint held — over its *syntactic* quantification domain, while ≥5 aliased writers via `updateRegistry`/the knob registry passed through it. A mechanism's reach is itself a claim (→ L9).\n\n## L2 — Multi-writer slots want owners, not per-writer gates — SHARPENED\n\nThe program's center of gravity (#382) is the strongest in-program confirmation any lesson got: the one enumeration-shaped fix that shipped (per-exit hooks) was the one overturned out-of-frame, and the corrective (watcher on a flow-exit predicate over an exhaustive ReviewStatus switch) is the owner form applied to exits. Two sharpenings: (a) the lesson's true quantifier is \"nets quantify over the class, not the instance\" — writers, exits, *and callers* (`serializeActivePath` escaped the commission's caller-based worklist); ADR-0011 Rule 4 is the correct generalization (conditional), with L2 as its strongest instance. (b) Syntactic ownership ≠ semantic ownership: the slot's owner must own all aliased write paths, not all direct assignments; `settings-profile-mutator-owner` (verified open/future) is the recapture. Instance corrections, all favorable or neutral: writers 20 AST-measured vs ~19 grep-grade; the clobber-survives-reload claim runtime-demonstrated (it was the literal commissioned defect that leaked); finishCard's reveal adjudicated pedagogy exactly along the audit's own §7.3 fork.\n\n## L3 — Deferral capture leaks at authoring time — SHARPENED (widened)\n\nConfirmed in both directions in-program: ~25 filings landed, AND at least four fresh evaporations occurred — two caught in-program (services step (b), recaptured as `reactive-state-modules-relocation`, verified open), two caught only by the digest, of which one is **still unfiled at consolidation time**: cast-hygiene stage 2 lives solely in the eslint.config.js header staging record while `:406` assigns gaps to \"stage 2\" of a closed item, and the §3.4 hand-rolled-walk lint rider points at the same closed item (both absence-probed: 0 rows). The auto-save fake-fidelity defect is likewise unfiled (0 rows). The widening L3 needs: **closure is a second leak point**. L3 as written names authoring-time channels (worklogs, postmortems, retros); the program's freshest evaporations happened at item *closure* — closure-without-residual-recapture, the \"closure is the maintainer's call on merge\" soft spot the digest names. Rule 10's \"retitle to the residual\" bullet covers it if A5b ships (conditional); regardless, the consolidation should state the closure-time sibling explicitly and file the two open losses. Note also the self-application datum: two §D breaches postdating the convention by hours confirm L1 applied to L3 — the marker convention needs its advisory sweep.\n\n## L4 — Silent failures concentrate at trust boundaries; typed narrowing retrofits cheaply — HOLDS\n\nExecution multiplied the instances rather than denting the claim: capability-mirror fixtures silently omitting a required field (vitest doesn't typecheck); two more archived migration no-ops masked by deepMerge; the auto-save path whose integration test passes only because the fake rejects with a real `ApiError` while the service rethrows a plain-object union; `serializeActivePath`'s silent truncate converted to fail-loud. The cheap-retrofit half is validated by the day's record: capability mirror, branded paths, and the types split all shipped same-day, the split with zero consumer-import diff. Sharpened scope worth carrying: the boundary class extends to (a) the **test/typecheck boundary** — `tests/` is outside the typecheck surface, fixtures escape vue-tsc, the fake/real seam diverges; two instances in one day — and (b) **naming boundaries**: brands protect only what flows through typed producers; hand-rolled re-derivations under wrong names need a shape-predicate net (the unfiled rider above).\n\n## L5 — Hand-maintained mirrors drift mechanically — HOLDS\n\nThe ADR audit is an independent, near-total confirmation from a different corpus: nearly every amend package is reference decay; ADR-0006's exemplar citation rotted while the cited file's *own header self-updated* (the cleanest mechanism-vs-mirror contrast in the record); ADR-0008 cites a maintainer-local memory file resolving in no clone; the synopsis's ADR-0009 entry drifted structurally invisibly (the advisory is per-PR-diff and cannot flag pre-existing drift); a reader's mechanization enumeration went \"verifiably stale within hours\" mid-audit (critic G1) — drift outpacing a same-day audit. Sharpening: drift concentrates **where the mechanism can't see** — the validator's `../notes/` relative-path and `.md`-only blind spots, the advisory's pre-existing-drift blindness — the L1×L5 composition the consolidation should name when prioritizing which mirrors to replace.\n\n## L6 — ADR \"Revisit when\" needs a sweep cadence — SHARPENED, with one instance-claim OVERTURNED\n\nThe lesson is stronger than stated: the full 38-trigger sweep found four *more* partially-fired-unrecorded triggers beyond L6's two (0004 #1, 0005 #2 second wave, 0008 #4, 0010 #4), and the cadence answer is now concrete (sweep recorded on `adr-effectiveness-audits`; baseline 43 if proposals ship — conditional). But L6's headline instance is over-claimed: \"ADR-0003's trigger #1 … has now fired twice over — the active `chess-clone` item and the fork.\" The ADR audit's appendix-verified deflation: one materialized adopter (the fork) plus one *filed prospective* adopter whose own PoC gate is unmet. The coordinator admits the phrasing originated in his commission, but the audit document carries it in L6, and it propagated into the shipped ADR-0003 amendment — verified live at HEAD (\"has fired twice\", docs/adr/0003 line 11). The factual deflation stands on the ADR audit's verification regardless of sign-off; the textual fix rides the C4 precision rider (conditional on A-package adoption). Worked caution for the consolidation: recording a firing is itself a claim under the evidence discipline — L6's own corrective instantiated the precision failure it corrects.\n\n## L7 — The fork flips ADR-0003's load-bearing boundary — HOLDS\n\nThe partition (B1 keep / B2 split / B3 replace) was adopted into the shipped ADR-0003 amendment — including the digest's note that a first draft got B2 as \"replace\" before correction to \"split,\" which is L7's own framing winning on the merits — and the FILES.md legend was re-keyed to the stronger any-knowledge-domain test. L7's claim that the band erosions are \"the concrete import lines a fork author must cut\" was validated by execution: §3.16–3.20 all shipped as fork-serving extractions, `useAppBootstrap` honestly retagged [B1]→[B3]. Residue, accurately still open: `band-conformance-ci-check` remains open/future (DB-verified), so \"B1 tags were never checked against the criterion that now matters\" is still true at HEAD — the systematic half of L7 is undischarged. Missing sibling from the ADR audit: **no document says how the fork consumes the corpus** (its §8.8, a maintainer decision point). L7 maps the code-band transfer surface; the doc-corpus transfer surface (which ADRs travel, where enforcement-surface declarations serve as the transfer manifest per ADR-0011 Revisit #4 — conditional) is unmapped, and the consolidation should name it as L7's documentation-side twin.\n\n## L8 — The positive patterns are worth naming so they persist — SHARPENED, with a self-referential caveat\n\nOut-of-frame adversarial review upgraded from one pattern among seven to *the* demonstrated load-bearing control: it was decisive exactly once (#382) and that once prevented the program's center-of-gravity fix from shipping with the literal commissioned defect; every other arc ran in declared in-frame fallback — an asymmetry the consolidation should surface as risk, not normalcy. The in-situ-correction pattern got its worked instance (the fabricated quote struck dated, artifact otherwise verbatim). But L8's premise — that *naming* makes patterns persist — is contradicted by the program: the §D convention was breached twice within hours of landing; the verbatim-record discipline was breached by the coordinator himself (verdict-without-artifact, digest finding 6) in the same thread minting Rule 11's substrate. Naming is the decaying prose form L1 describes. The persistent form is rule + declared enforcement surface — which is precisely what ADR-0005 Rules 10/11 and ADR-0011 propose to do to three of L8's patterns (conditional, PROPOSED). The consolidation should restate L8 as \"positive patterns persist when institutionalized, not when named\" and carry the two same-day breaches as the proof.\n\n## L9 (new, justified) — Self-certified reach is the residual attack surface\n\nThe consolidated evidence isolates a failure class no L1–L8 lesson names as such: **claims of completeness/reach/generality fail specifically when certified from inside the producing frame.** Four instances in one day: the in-frame HRA's \"narrower-but-justified\" vs the out-of-frame UNDISCHARGED-HACK; the \"fully-triaged baseline\" that was a triage of the lint's syntactic reach, not the slot; the fabricated sanction quote — laundering relocated *into the review-artifact layer*; the verdict label that traveled without its artifact. L2 says give slots owners; L9 says the owner's claimed coverage is itself a multi-writer slot whose only honest owner is an out-of-frame enumeration. Proposed homes exist but are conditional (Rule 11, ADR-0011 Rule 4, the §8.9 tool-agnostic CLAUDE.md paragraph); the lesson stands on verified facts regardless of their sign-off.\n\n## L10 (new, justified) — The orchestration layer inherits the seam taxonomy\n\nThe history audit pointed its lens at the SPA; the program's freshest defects were process-side and carry the same signatures: the coordinator's reversed brand↔producer mapping and under-specified exit invariant (commission as trust boundary that cast instead of narrowing); the merge train's `wait_checks` satisfied by pre-rebase heads for PRs #370/#371 (enumeration-shaped condition failing open — fixed mid-train after GitHub's own refusal surfaced it); closure-custody leaks (multi-writer slot with no owner, where the \"writers\" are sessions closing items). No damage resulted (both PRs' CI ran green on main per the run history), but the consolidation should state that L1–L4 quantify over the workflow machinery — commissions, trains, closures, review artifacts — and now have worked instances there. This can alternatively be folded into the §1 verdict's rider; either way it must be said once.\n\n## Conditionality register\n\nCarried conditionally per the commission: the C4 precision rider (L6's textual fix), ADR-0005 Rules 10/11 (L3's closure widening's institutional home; L9's home), ADR-0011 (L1's corollary institutionalized; Rule 4 as L2's generalization; Rule 5 as L1's calibration; Revisit #4 as L7's corpus-transfer manifest) — all PROPOSED under PR #391's gate 1. Every factual deflation and defect cited above stands on verification independent of that sign-off.",
 "findings": [
  {
   "title": "§1 verdict — 'has not devolved' survives execution predictively; the convergence clause needs a rider",
   "verdict": "sharpened",
   "evidence": "Every latent defect execution uncovered instantiates the verdict's own taxonomy: archived migration no-ops 45→46/46→47 masked by deepMerge (digest §3.13, filed `archived-migration-wrong-path-corrective`, DB-verified open); #382's 3-of-6 unhooked exits (enumeration-fails-open); ≥5 aliased writers invisible to the new lint; serializeActivePath's silent truncate. Meanwhile ~17 of 25 recommendations shipped in one day, types split with zero consumer-import diff, no reverts. But convergence was shown conditional: 4 fresh deferral evaporations (2 post-§D), 1 in-frame-approved UNDISCHARGED-HACK, 1 fabricated quote, 1 verdict-without-artifact occurred inside the corrective program itself.",
   "consequence": "Keep the verdict; append a rider: the correction machinery converges *when out-of-frame verification and ledgered capture are present* — the program demonstrated both preconditions by their presence (#382 corrective) and their absence (the four evaporations, the in-frame approval)."
  },
  {
   "title": "L1 — prose decays, mechanisms stick: confirmed from the governance corpus, but missing the settled-vs-constructed partition and a reach caveat",
   "verdict": "sharpened",
   "evidence": "ADR audit independently confirms via its trigger-bookkeeping datum (recorded in 0005/0009, rotted in 0001/0003, 4 more partial firings unrecorded) and wields it in §5. In-program: 5 measure-first lint adoptions, zero regressions attributed. Counter-nuance: ADR prose *settled* most verifier disputes (digest §2 'settled vs constructed') — adjudication-time prose held; per-edit conformance prose decayed. And the writer lint's 'stick' was syntactic-reach-only (≥5 aliased writers passed).",
   "consequence": "Consolidation restates L1 with the partition: per-edit conformance disciplines decay and should mechanize; adjudication-time records held and should not be reflexively mechanized (§7.3 gate-retraction; ADR-0011 Rule 5 if A13 ships). Add: 'mechanisms stick within their declared reach' — reach is itself a claim (→ L9)."
  },
  {
   "title": "L2 — owners not per-writer gates: the program's strongest confirmation; generalize to 'nets quantify over the class' and semantic ownership",
   "verdict": "sharpened",
   "evidence": "#382: the per-exit enumeration returned UNDISCHARGED-HACK out-of-frame with a runtime-demonstrated persisted-pref leak (the literal commissioned defect); the corrective is an exit-predicate watcher over an exhaustive never-default ReviewStatus switch. serializeActivePath escaped the caller-based worklist (same quantifier failure over callers). Aliased writers via updateRegistry invisible to the lint; `settings-profile-mutator-owner` open in DB. Counts corrected favorably (20 AST vs ~19 grep); finishCard reveal adjudicated pedagogy along the audit's own §7.3 fork.",
   "consequence": "Restate L2 in ADR-0011 Rule 4's form (if A13 ships): nets quantify over the class — writers, exits, callers. Add: syntactic ownership ≠ semantic ownership; an owner must own aliased write paths. `settings-profile-mutator-owner` is the open recapture."
  },
  {
   "title": "L3 — deferral capture leaks at authoring time: confirmed both directions; missing the closure-time sibling, with one loss still unfiled now",
   "verdict": "sharpened",
   "evidence": "~25 filings landed AND 4 fresh evaporations occurred, 2 postdating the §D convention by hours. Closure-time instances: services step (b) (recaptured, `reactive-state-modules-relocation` open in DB) and cast-hygiene stage 2 — verified now: `cast-hygiene-lint` closed, no successor (ILIKE probe 0 rows), while frontend/eslint.config.js:406 assigns gaps to 'stage 2' and the §3.4 lint rider points at the closed item. Auto-save fake-fidelity defect also unfiled (probe 0 rows).",
   "consequence": "Widen L3: deferrals leak at authoring time AND at item closure (closure-without-residual-recapture). File the still-open losses: a cast-hygiene-stage-2 successor (carrying the hand-rolled-walk lint rider) and the auto-save fake-fidelity defect. Rule 10's 'retitle to the residual' is the conditional institutional home (A5b PROPOSED); the §D marker needs its advisory sweep regardless."
  },
  {
   "title": "L4 — silent failures at trust boundaries; typed narrowing retrofits cheaply",
   "verdict": "holds",
   "evidence": "Execution multiplied instances: capability fixtures silently omitting a required field (vitest doesn't typecheck); two more archived migration no-ops; the auto-save fake rejecting a real ApiError while the service rethrows a plain-object union; serializeActivePath silent-truncate→fail-loud. Cheapness validated: capability mirror, branded paths, types split all shipped same-day; split had zero consumer-import diff, zero test edits.",
   "consequence": "Carry L4 intact, with scope widened to two boundary sub-classes the day exposed: the test/typecheck boundary (tests/ outside the surface; fake/real seam fidelity) and naming boundaries (brands protect only typed-producer flows; hand-rolled re-derivations need a shape-predicate net — currently unfiled, see L3)."
  },
  {
   "title": "L5 — hand-maintained mirrors drift mechanically",
   "verdict": "holds",
   "evidence": "Independent corpus-side confirmation: ADR-0006's exemplar citation rotted while the cited file's own header self-updated; ADR-0008 cites a maintainer-local memory file resolving in no clone; synopsis ADR-0009 entry drifted structurally invisibly (per-PR-diff advisory cannot flag pre-existing drift); a reader's enumeration went stale within hours mid-audit (critic G1); the #382 census said '6 → 6' vs the tree's 10.",
   "consequence": "Carry intact; add the prioritization sharpening: drift concentrates where the mechanism can't see (validator's ../relative-path and .md-only blind spots; advisory's pre-existing-drift blindness) — replace those mirror halves first."
  },
  {
   "title": "L6 — Revisit-when sweep cadence: lesson stronger than stated, but its headline 'fired twice over' instance is overturned and live at HEAD",
   "verdict": "sharpened",
   "evidence": "The 38-trigger sweep found 4 more partially-fired-unrecorded triggers beyond L6's 2 (0004 #1, 0005 #2 second wave, 0008 #4, 0010 #4). But the ADR audit's appendix-verified deflation: chess-clone is a filed *prospective* adopter with an unmet PoC gate — ADR-0003 #1 fired once, not 'twice over'. The overclaim originated in the coordinator's commission, sits in L6's text, and shipped into ADR-0003 — grep-verified live at HEAD ('has fired twice', docs/adr/0003 line 11).",
   "consequence": "Consolidation records L6 as understated on rot count and over-claimed on the firing count; the textual correction is the C4 precision rider — conditional on A-package sign-off, though the factual deflation stands now. Add the worked caution: recording a trigger firing is itself an evidence-disciplined claim."
  },
  {
   "title": "L7 — the fork flips ADR-0003's boundary: validated by execution; systematic residue open; missing the corpus-consumption sibling",
   "verdict": "holds",
   "evidence": "The B1-keep/B2-split/B3-replace partition was adopted into the shipped amendment (after a first draft wrongly said B2 'replace'); FILES.md legend re-keyed; the named band erosions became the day's executed extractions (§3.16–3.20 all shipped; useAppBootstrap retagged [B1]→[B3]). `band-conformance-ci-check` verified still open/future, so the systematic tag check remains undischarged. ADR audit §8.8: no document says how the fork consumes the corpus.",
   "consequence": "Carry L7; name its documentation-side twin from the ADR audit — the doc-corpus transfer surface is unmapped (maintainer decision §8.8; ADR-0011 Revisit #4's declarations-as-transfer-manifest if A13 ships) — and keep the band-conformance check flagged as L7's open systematic half."
  },
  {
   "title": "L8 — positive patterns persist when institutionalized, not when named",
   "verdict": "sharpened",
   "evidence": "Out-of-frame review was load-bearing exactly once and decisively (#382), with every other arc in declared in-frame fallback — an asymmetry, not a norm. L8's naming-suffices premise was falsified in-program: the §D convention was breached twice within hours of landing; the coordinator committed the verdict-without-artifact shape (digest finding 6) in the same thread minting Rule 11's substrate. The in-situ-correction pattern did get its worked instance (quote struck dated, artifact verbatim).",
   "consequence": "Restate L8: naming is the decaying prose form L1 describes; persistence comes from rule + declared enforcement surface. Three of L8's patterns have conditional institutional homes (Rules 10/11, ADR-0011 — PROPOSED); surface the out-of-frame asymmetry as program risk."
  },
  {
   "title": "L9 (new) — self-certified reach is the residual attack surface; completeness claims need out-of-frame custody",
   "verdict": "sharpened",
   "evidence": "Four same-day instances: in-frame 'narrower-but-justified' vs out-of-frame UNDISCHARGED-HACK on the same diff; a 'fully-triaged baseline' that triaged only the lint's syntactic reach; a fabricated commission quote inside the review-artifact layer; a verdict label traveling without its artifact. The pattern is specific: claims of completeness/reach/generality fail when certified from inside the producing frame.",
   "consequence": "Mint as a standalone lesson in the consolidation: a net's claimed coverage is itself an unowned slot until an out-of-frame enumeration owns it. Conditional homes: ADR-0005 Rule 11, ADR-0011 Rule 4, the §8.9 tool-agnostic CLAUDE.md paragraph — all PROPOSED; the evidence stands regardless."
  },
  {
   "title": "L10 (new) — the orchestration layer inherits the seam taxonomy",
   "verdict": "sharpened",
   "evidence": "Coordinator commissions carried a reversed brand↔producer mapping and an under-specified exit invariant; the merge train's wait_checks accepted pre-rebase check evidence for PRs #370/#371 (enumeration-shaped condition failing open, fixed mid-train after GitHub's refusal surfaced it; both PRs' CI subsequently green on main); closure custody leaked residuals. Same signatures as L1–L4, different substrate.",
   "consequence": "State once in the consolidation (standalone or as the §1 rider): the lessons quantify over the workflow machinery — commissions, merge trains, closures, review artifacts — and now have worked instances there; commission texts and train conditions deserve the same quantify-over-the-class scrutiny as code."
  }
 ],
 "coverage": "Read end to end: the history-lessons audit (object, 597 lines), the ADR-corpus audit via git show (all 1,261 lines, both pages), and the E2 digest. NOT read, per discipline: the history-audit appendix parts (~800KB — cited only via the audits' own pointers and the digest), the ADR-corpus appendices beyond what the audit body reproduces, worker transcripts, PR comment bodies (relayed via the digest). Verified independently at HEAD/DB (sanctioned targeted checks): todo DB states for 12 items (cast-hygiene-lint closed with no successor; settings-profile-mutator-owner, archived-migration-wrong-path-corrective, reactive-state-modules-relocation, band-conformance-ci-check, adr-corpus-amendments-2026-06, mechanization-discipline-tenet open/future; chess-clone and config-schema-projections open/active); ADR-0003's live 'has fired twice' phrasing at HEAD line 11; absence probes returning 0 rows for the auto-save fake-fidelity defect, the cast justification-adjacency successor, and the hand-rolled-walk rider; the eslint.config.js staging record including the ':406 owned by stage 2' pointer at a closed item. Limits: claims about #382's comment record, the train log, and worklog contents are carried on the digest's verification, not re-derived (the digest states it read all 23 worklogs and the full comment record); the 'fired twice' deflation rests on the ADR audit's appendix-verified reading (digest cross-checked appendix p3 ~line 737) — I verified the HEAD phrasing but not the chess-clone PoC gate beyond its DB state (open/active is consistent with 'prospective, gate unmet'). Conclusions contingent on PR #391's A-packages/ADR-0011 are marked conditional throughout. No perf claims made (ADR-0009); never read backend/qeubo/."
}
````


---

## e2:recs-1-13

**Commission** (= `[SHARED: FRAME]` + the following):

````
YOUR SLICE: history-audit recommendations §3.1–§3.13 (boundary typing, state ownership, mechanizations) against their execution outcomes (digest). For each: was the guidance RIGHT as written — or did execution reveal under-specification (the #382 exit enumeration is the known case — find others), wrong shape, wrong priority, or wrong already-filed dedupe calls? Did the verifier corrections folded into the items hold up? Also read frontend/eslint.config.js end to end (the mechanization arcs' shared artifact) to check the shipped state matches what the audit promised.
````

**Output (verbatim):**

````json
{
 "report": "E2 consolidation review — slice: history-audit §3.1–§3.13 against execution outcomes (2026-06-10, late)\n\nRead end to end: the history-lessons audit (docs/notes/audit/audit-spa-history-lessons-2026-06-10.md), the ADR-corpus audit (git show origin/bork/docs/adr-corpus-audit:docs/notes/audit/audit-adr-corpus-2026-06-10.md, PR #391 OPEN — conclusions resting on its A-packages/ADR-0011 are carried conditionally below), the program-outcomes digest (/tmp/claude-1000/-home-bork-w-omega/spa-review/e2-digest.md), frontend/eslint.config.js, and frontend/CLAUDE.md. Targeted HEAD/DB verification (sanctioned): read-only psql on item states and descriptions (silent-coercion-protocol-boundaries-audit, gradingparameter-opacity-typing, cast-hygiene-lint, services-boundary-deny-by-default, multi-writer-slots-get-owners, settings-profile-mutator-owner, learned-vf-dispatch-closure, engine-connection-lifecycle-logout, restart-thunk-inflight-semantics, archived-migration-wrong-path-corrective, plus ILIKE absence probes for a stage-2 successor); the staged filing.sql item texts for cast-hygiene-lint, services-boundary-deny-by-default, multi-writer-slots-get-owners; HEAD greps on src/services/analysis-service.ts, src/engine/katago/katago-client.ts, src/engine/katago/version-probe.ts, src/composables/board/usePlayFromPosition.ts, src/composables/review/blind-mode-prefs.ts (header read), src/store/migrations.ts, src/services/analysis-ledger.ts, src/services/engine-connection.ts (existence), FEATURES.md, docs/dispatch/proxy-to-frontend-learned-vf.md. NOT read: the history-audit appendix parts (per discipline; cited only via the audit's pointers and the digest); the 23 worklogs and PR #382 comments themselves (relayed via the digest, which read them in full). No perf claims (ADR-0009); todo DB access SELECT-only.\n\n== Per-recommendation walk ==\n\n§3.1 (narrow the engine subscription union) — NOT EXECUTED; the dedupe call (evidence on the existing silent-coercion item, no new id) is half-vindicated, half-costly. Verified: the evidence widening DID reach the DB — the open/active item carries a dated 2026-06-10 note with the traced corruption path. So \"deliberately not staged\" curation did not simply evaporate; that suspicion is overturned for §3.1 and §3.3 (both widenings present in the DB). What the dedupe call cost: a visible selection effect. Every §A recommendation with its own staged item id (§3.2, §3.4, §3.5, §3.6) shipped same-day; both routed to existing items (§3.1, §3.3) went unexecuted — the program's execution round drew from the new ids. The §3.1 premise survives at HEAD: both unguarded casts exist (now analysis-service.ts:687/:885, `res as KataAnalysisResponse`; the DB note's :646/:836 cites are already stale, drifted under the program's own PRs), and the guarded worked example survives at composables/board/usePlayFromPosition.ts:181-188 (itself now carrying an `as unknown as` double-cast in its guard — one of the stage-2 ratchet population). The audit's own stable-handles lesson (§3.25) applies to its own DB evidence notes: file:line cites rotted within hours of filing; the open item should be refreshed with function-level handles (the two subscribe-callback casts feeding onAnalysisUpdate).\n\n§3.2 (typed capability mirror) — SHIPPED (PR #372) as guided; guidance holds. The \"must not extend the connection-refusal surface\" and \"unknown names pass through\" specifications were load-bearing and are pinned by test per the digest; CapabilityDegradation + parseVersionResponse verified at HEAD in version-probe.ts. The arc's new defect (fixtures silently omitting required valueBinding because vitest doesn't typecheck) is outside the guidance's reach and recurs as a named class (tests-outside-typecheck) in §3.10's record — correctly handled. The ride-along residue (FEATURES.md line, non-en locale keys) was recorded-not-fixed in the dispatch — and, verified in the DB, was then recaptured by §3.22's harvest as learned-vf-dispatch-closure (open/future, FEATURES.md absence verified at HEAD and named in the item). The below-the-line demotion of the learned-vf lead was therefore safe in outcome — but only because the harvest net existed; the L3 machinery the audit recommended caught the audit's own demoted residue. That loop closing is a positive result worth naming in the consolidation.\n\n§3.3 (gradingparameter opacity) — NOT EXECUTED; same selection effect as §3.1. The widening is in the DB (dated note, verified); the proposed activation did not happen (still open/future) — but that was explicitly maintainer-gated (§7.7), so this is pending, not lost.\n\n§3.4 (branded path types) — SHIPPED (PR #386); guidance holds in thesis, under-specified in worklist definition — the second instance of the #382 genus. The audit scoped the audit/derivation legs off the two named producers' call sites; the HRA's independent producer enumeration found sgf-writer.ts::serializeActivePath — a hand-rolled root→current walk under a root→leaf name that no caller-based worklist could reach — fixed in-arc through getPath (also converting a silent truncate to fail-loud). The defect class is the same as #382's: enumerating known instances where the recommendation needed to quantify over the producer class (anything that walks root→current/leaf, not callers of the two functions). Separately, the reversed brand↔producer mapping was a commission-layer defect (coordinator-admitted), not in the audit text; and the audit's placement phrase \"mint the brands next to NodeId in the identifier vocabulary\" was arguably satisfied by the worker's types/game.ts choice (the §3.15 split moved NodeId to game.ts as a recorded judgment call) — the commission's \"ids.ts\" rendering was the wrong concretization, not the audit. Residue concern: the hand-rolled-walk lint rider was recorded, not filed, and pointed at the now-closed cast-hygiene-lint item — a dangling lead the consolidation must re-home (see the granularity finding).\n\n§3.5 (keyed-cache brand) — SHIPPED (PR #374) exactly as guided; the answered-safe dedupe (record the conclusion, don't re-audit) held. The construction-time rule verified present in frontend/CLAUDE.md's Type-driven-design section with the per-leg band-call convention. Holds, nothing to add.\n\n§3.6 (enrichment-merge null guard) — SHIPPED (PR #371); guidance holds, and it is the slice's positive control on specification style. The audit deliberately left the terminal-loudness joint open AND named it (\"decided at implementation; a throw on the packet path for a wire-origin anomaly is probably wrong\"); execution chose level 4 + a once-per-label de-dup latch cleared in purgeAll, named as judgment-beyond-item-text; the ADR-corpus audit independently cites the arc as calibration made well from the hierarchy (§6.5). NestedRecordGuard verified at HEAD in analysis-ledger.ts. Contrast with #382: the program's failure mode was not under-specification per se — it was an enumeration that read as closed. Declared open joints executed well; implicit closed-looking enumerations produced the program's only UNDISCHARGED-HACK.\n\n§3.7 (multi-writer owners) — SHIPPED (PR #382 + corrective cd8007a); the known case, and the consolidation should sharpen its attribution. The exit under-specification originates in the audit's own text, not only the coordinator's commission: audit prose §3.7(ii) reads \"snapshot/restore a supplied list of session-UI pref keys on loadCard/finish/abort\"; the staged item text (filing.sql, verified) reads \"on loadCard/finishCard/endSession/abort\" — a four-moment enumeration of what the out-of-frame audit demonstrated is a six-exit set (loadCard catch / timeout / missing-delta unhooked, with a runtime-demonstrated persisted-pref leak). The enumeration sits one clause inside the recommendation whose own thesis is \"owners, not per-writer gates\" and whose lesson (L2, later ADR-0011 Rule 4 if A13 ships) is that instance-enumerations fail open — the audit violated its own rule in the worked application. The corrective shape is verified at HEAD: blind-mode-prefs.ts implements a generic snapshot owner whose release is a flush:'sync' watcher on a supplied flow-exit predicate, with a never-default exhaustive switch over ReviewStatus (isReviewSessionExited), and its header records the prior three-call-site shape as the failure. Two counterweights the consolidation should also record: (a) the same staged item text ends \"Run hack-rationalization-detector out-of-frame before calling any leg done (>1-writer state)\" — the audit embedded the net that caught its own defect; the process clause was load-bearing and correct. (b) The other three legs held: leg (i) shipped as specified (maxVisitsTarget behind guards through mutateBoard); leg (iii)'s owner is real (engine-connection.ts exists; zero direct store.engine assignments remain in analysis-service.ts, verified by assignment-pattern grep; the audit's grep-grade ~19 was 20 by AST — named deviation); leg (iv)'s lint is in the shipped config with the {subtree→owners} map and the session.ui template-toggle carve-out exactly as specified, ADR-0001 amendment recorded. The store.profile outcome (10 annotated per-writer exemptions, owner deferred to settings-profile-mutator-owner, verified open/future) is honest partial execution of the thesis — annotations are per-writer gates in lint clothing, and the filed discharge item is the right shape for that residue. The audit's §7.3 maintainer flag (finishCard reveal as pedagogy) was resolved as the audit framed it.\n\n§3.8 (scoped-state posture) — partially executed via §3.25 exactly as the verifier-deflated guidance prescribed: census fix shipped, phase-registry leg stayed gated on §7.2, the spa-board-scope residual was retitled per E4. The deflation (re-litigates a recorded decline → maintainer question, [lower]) is vindicated by execution. Holds.\n\n§3.9 (hydration residue audit) — SHIPPED (PR #375) in the deflated form; the verifier correction held completely. The \"never-executed audit\" original claim was wrong, the deflated honest-residue scope was right, and execution's engagement of the whenHydrated decline on its own terms confirmed the decline stands (re-trigger unfired). The [lower] hint vindicated (doc-only output). Of the two recorded analysis-service wrinkles, the restart-thunk one has an item (restart-thunk-inflight-semantics, verified open/active); the completed-entries-never-leave-maps wrinkle lives in the committed audit doc — I did not verify an item or not-filed marker for it (out of my named-file budget; flag for the cross-slice consolidator).\n\n§3.10 (cast-hygiene lint) — STAGE 1 SHIPPED (PR #379); the guidance's two-stage content holds; its one-item filing shape is the defect. Verified in filing.sql: both stages staged under a single id. The item is closed (DB-verified) with stage 2 measured-and-declined and no successor (ILIKE probe on \"justification\" returns only the closed item) — the item's own title half (\"then justification-adjacency for all casts\") now has no live record beyond the eslint header's staging paragraph and a closed item's description. Two live pointers compound the loss: the §3.4 hand-rolled-walk lint rider and the as-unknown-as ratchet target (named in the shipped header, 28→25 measured) both point at the closed item. Also notable: the audit's ~200-280 stage-2 estimate was a ~50-100% undercount (measured 412 script-side coercion casts pre-fix, +37 template) — the measure-first prescription absorbed the miss, and the larger population is legitimately part of why stage 2 was declined, but the consolidation should treat all audit numerics as grep-grade leads (every count in the slice was wrong in detail: ~13→12, ~19→20, ~200-280→412). The shipped config matches every §3.10 promise I could check: stock-shape ban via two selectors covering `as any`/`<any>x`/`as any[]`, vue/no-v-html escape model, band-character justification convention in the fire message, the no-explicit-any deferral explicitly re-opened by append per ADR-0002 Rule 6 with the stale ~152 census corrected to 109. Caveat: \"the inventory doubles as the fork's seam map\" is realized only at the convention level — the actual inventory IS stage 2, currently ownerless.\n\n§3.11 (services boundary deny-by-default) — STEP (a) SHIPPED (PR #378); guidance holds; same filing-shape defect as §3.10, second instance. The staged item text explicitly says \"Step (b), separate sign-off arc\" — the audit knew (b) was a separate arc and still bundled it into one id; the item closed shipped and step (b)'s record evaporated until the ADR-corpus audit re-captured it (reactive-state-modules-relocation, verified open/future). Everything else in the guidance was right and is verified in the shipped config: deny-by-default inversion, REACTIVE_STATE_EXEMPTIONS with the PROVISIONAL-FORM comment naming step (b), @typescript-eslint variant for allowTypeImports, App.vue in the glob with the analysisService import as an annotated wiring-file exemption (the audit's \"adjudicate or name the gap\" — execution did both), census header in the historical register, and the verifier's incomplete-from-day-one correction encoded verbatim in the header's shape-history paragraph. The ADR-0010 Revisit #4 tension got its work-status reality as promised.\n\n§3.12 (vue lifecycle guards) — SHIPPED (PR #380); the cleanest execution in the slice; every specific clause of the guidance was load-bearing and followed. \"Assess eslint-plugin-vue's prop rules first\": done, both measured and rejected with recorded reasons, one of which (vue/no-boolean-default would have deleted the 2026-06-08 fix) validates the audit's caution that the stock rules encode the opposite convention. \"Keyed on name patterns, never component allowlists\": shipped (gateWords). \"Residue lessons only\" in the CLAUDE.md checklist: verified — the three unmechanizable classes (v-memo key stability, container-query self-styling, structuredClone-vs-Proxy) are there as residue with the two mechanized classes reduced to lint pointers, and the render-coupling corollary stays homed in ADR-0010. The omission-test generalization shipped (gate-prop-omission.ts referenced from both config and CLAUDE.md). Holds without qualification.\n\n§3.13 (migration guard) — SHIPPED (PR #370); the verifier reframe held and was strengthened by execution. The corrected incident framing (no vacuous fixture ever existed; the gap was twelve uncovered migrations; the composition test is the load-bearing half) drove the design; witnessedContainer with an independent witness verified at HEAD in migrations.ts. Execution then surfaced TWO further archived wrong-path no-ops (45→46, 46→47) of exactly the class the audit diagnosed — masked by hydrate-time deepMerge, recorded-not-fixed per the frozen-bodies convention and filed (archived-migration-wrong-path-corrective, verified open/future). The class diagnosis was right and the class had more members than anyone knew. The frozen-once-shipped caveat and the bump-cadence out-of-scope call (§7.5) both held.\n\n== Cross-cutting, for the consolidation ==\n\n1. The instance-vs-class failure shape the program spent the day mechanizing against appears INSIDE the audit's own §3 texts twice: §3.7(ii)'s exit-moment enumeration (the known case — origin sharpened to the audit text itself) and §3.4's caller-based worklist (found by the HRA). Both were caught only by out-of-frame/independent enumeration. The consolidation's authoring rule: a recommendation that touches flow exits or producer sets specifies a predicate/shape over the class vocabulary, or names the joint as open (§3.6's declared-open-joint pattern is the in-slice positive control, independently endorsed by the ADR-corpus audit §6.5).\n\n2. Filing granularity: two of the three mechanization items bundled multi-stage work under one id, and both lost the unshipped stage at closure — one re-captured by the ADR audit, one (cast-hygiene stage 2) still unrecaptured and carrying two dangling pointers. The fix is per-stage ids at staging time; if A5b (ADR-0005 Rule 10) ships, its retitle-to-the-residual clause is the codified closure-side form — until then this is convention, and the consolidation should file the stage-2 successor regardless.\n\n3. The unstaged-curation suspicion is partially overturned: the §3.1/§3.3 evidence widenings verifiably reached the DB. The real cost of routing recommendations onto existing items was execution selection (neither was picked up by the program) plus immediate line-cite rot in the one open/active item.\n\n4. Verifier-correction reliability for this slice is high: every §6 deflation touching §3.1–§3.13 (migration vacuous-test, hydration piecewise execution, services blocklist authoring-time omission, §3.8's recorded-decline) held under execution; two were strengthened. The [raise]/[lower] priority hints were all vindicated (§3.7 raise — center of gravity AND the hack site; §3.8/§3.9 lower — gated/doc-only outcomes). No §3.1–§3.13 verifier correction was overturned.\n\n5. eslint.config.js, read end to end, matches the audit's promises for §3.7(iv)/§3.10/§3.11/§3.12 in every checkable particular, including the #382 census correction in place (10 annotations, dated note) and the four discharge/deferral pointers (settings-profile-mutator-owner verified open). One watch item, not a defect: the header is now ~320 lines of hand-maintained rationale and dated baselines — its at-adoption historical phrasing is the only thing separating it from the L5 mirror-rot class, and if A13 ships, ADR-0011 Rule 3 names this header as the protocol's operational register, raising the stakes on that phrasing discipline.\n\nConditional carriage: references to Rule 10's retitle clause and ADR-0011 Rules 3/4 are contingent on PR #391's A5b/A13 sign-off (PROPOSED, gate 1 unsigned). All other findings stand on merged record and HEAD.",
 "findings": [
  {
   "title": "The #382 exit enumeration originates in the audit's own §3.7(ii) text and violates the audit's own L2 thesis",
   "verdict": "sharpened",
   "evidence": "Audit prose: 'snapshot/restore a supplied list of session-UI pref keys on loadCard/finish/abort'; staged item (filing.sql, verified): 'on loadCard/finishCard/endSession/abort'. Out-of-frame audit found six status→IDLE exits, three unhooked, with a runtime-demonstrated persisted-pref leak. Corrective verified at HEAD: src/composables/review/blind-mode-prefs.ts — watcher on a supplied flow-exit predicate, never-default exhaustive switch over ReviewStatus; its header records the prior three-call-site shape as the failure. Counterweight: the same staged item text mandated 'Run hack-rationalization-detector out-of-frame before calling any leg done' — the audit embedded the net that caught its own defect.",
   "consequence": "Consolidation attributes the under-specification to the audit text, not only the coordinator's commission (the coordinator's admission under-attributes); names the repaired form as the rule — flow-exit corrections specify predicates over the status vocabulary, never moment lists; and credits the embedded out-of-frame mandate as load-bearing process guidance worth keeping in item templates."
  },
  {
   "title": "Second under-specification of the same genus: §3.4's caller-based worklist missed a hand-rolled producer",
   "verdict": "sharpened",
   "evidence": "The HRA's independent producer enumeration found sgf-writer.ts::serializeActivePath — a hand-rolled root→current walk under a root→leaf name, unreachable by the audit's caller-of-named-functions worklist — fixed in-arc (also converting a silent truncate to fail-loud). The resulting hand-rolled-walk lint rider was recorded, NOT filed, and pointed at the now-closed cast-hygiene-lint item (closure verified in DB). The reversed brand↔producer mapping was commission-layer, not audit-text; the audit's 'next to NodeId' placement phrase was arguably satisfied by the worker's types/game.ts choice.",
   "consequence": "Consolidation records the worklist rule (enumerate producers by shape over the class, not call sites of known functions) as the same lesson as the #382 case, and re-homes the dangling lint-rider lead onto a live item (the stage-2 successor, see next finding)."
  },
  {
   "title": "Filing granularity: multi-stage recommendations staged as single items lose the unshipped stage at closure — two instances, one still unrecaptured",
   "verdict": "overturned",
   "evidence": "filing.sql verified: cast-hygiene-lint staged 'Stage 1: … Stage 2: …' under one id; item closed (DB) with stage 2 measured-and-declined and no successor (ILIKE probe on 'justification' returns only the closed item); only records are the eslint header staging paragraph and the closed item's description; two live pointers (the §3.4 lint rider; the as-unknown-as 28→25 ratchet target in the shipped header) point at the closed id. services-boundary-deny-by-default staged with 'Step (b), separate sign-off arc' in the same id; closed at step (a); step (b) evaporated until the ADR-corpus audit re-captured it (reactive-state-modules-relocation, verified open/future).",
   "consequence": "The audit's one-item-per-recommendation staging convention is overturned for multi-stage work: separate-arc stages get separate ids at staging time. The consolidation should file the cast-hygiene stage-2 successor item now (carrying the lint-rider lead and the ratchet target). If A5b (ADR-0005 Rule 10) ships, its retitle-to-the-residual clause is the codified closure-side guard — carried conditionally, PR #391 unsigned."
  },
  {
   "title": "The unstaged curation edits did not evaporate — but routing §3.1/§3.3 onto existing items left them unexecuted and their cites rotting",
   "verdict": "conditional",
   "evidence": "DB-verified: silent-coercion-protocol-boundaries-audit (open/active) and gradingparameter-opacity-typing (open/future) both carry dated 2026-06-10 widening notes matching the audit's §3.1/§3.3 text. Selection effect: all four §A recommendations with their own staged ids shipped same-day; both routed to existing items did not execute. The §3.1 note's line cites are already stale (analysis-service.ts:646/:836 → :687/:885 at HEAD, drifted under the program's own PRs); the premise survives (both 'res as KataAnalysisResponse' casts + the guarded usePlayFromPosition worked example, now at composables/board/usePlayFromPosition.ts:181-188, verified).",
   "consequence": "Consolidation refreshes the open item's evidence note with stable function-level handles (the two subscribe-callback casts feeding onAnalysisUpdate) and weighs minting a dedicated item for the §3.1 union-narrowing helper — concrete shovel-ready work riding a broad sweep item is both invisible to execution rounds and exposed to the closure-mismatch shape of the granularity finding. The §3.3 activation remains maintainer-gated (§7.7), pending not lost."
  },
  {
   "title": "Audit numerics were uniformly grep-grade and wrong in detail; the measure-first specification absorbed every miss",
   "verdict": "holds",
   "evidence": "~13 any-cast sites → 12 at HEAD (one retired by §3.18's arc); ~19 store.engine writers → 20 by AST; ~200-280 stage-2 cast sites → 412 script-side + 37 template (a ~50-100% undercount that legitimately fed the stage-2 decline). Every executing arc re-measured before adopting, per the audit's own prescription; deviations named in worklogs/config.",
   "consequence": "Consolidation treats audit counts as leads, not specs — item descriptions carry them as grep-grade estimates (most did, via '~'), and any decision hinging on population size re-measures first. No change to the guidance itself; the prescription is what made the misses harmless."
  },
  {
   "title": "§3.6's declared-open-joint is the positive control on specification style; the program's failure mode was closed-looking enumerations, not under-specification per se",
   "verdict": "sharpened",
   "evidence": "§3.6 left terminal loudness open AND named it ('decided at implementation; a throw on the packet path… is probably wrong'); execution chose level 4 + de-dup latch cleared in purgeAll, named as judgment-beyond-item-text; the ADR-corpus audit independently cites the arc as calibration made well from the hierarchy (§6.5). NestedRecordGuard verified at HEAD in analysis-ledger.ts. Contrast: §3.7(ii)'s exit list read as complete and shipped three leaks.",
   "consequence": "Consolidation codifies 'name your open joints' as the item-authoring rule: an explicitly open, steered decision point executed well; an implicit closed-looking enumeration produced the program's only UNDISCHARGED-HACK. This is the precise form of the under-specification lesson, sharper than 'specify more'."
  },
  {
   "title": "Verifier corrections folded into §3.1–§3.13 all held; two strengthened by execution; priority hints vindicated",
   "verdict": "holds",
   "evidence": "§3.13's reframe (no vacuous fixture; composition test load-bearing) drove the shipped design (witnessedContainer verified at HEAD) and the arc surfaced two MORE archived wrong-path no-ops of the diagnosed class (45→46, 46→47; archived-migration-wrong-path-corrective verified open). §3.9's deflation held — the whenHydrated decline engaged on its own terms and stood. §3.8's deflation held — the phase-registry leg stayed gated on §7.2. §3.11's incomplete-from-day-one correction is encoded verbatim in the shipped config header. [raise] on §3.7 vindicated (center of gravity and the hack site); [lower] on §3.8/§3.9 vindicated (gated/doc-only outcomes). None overturned.",
   "consequence": "The consolidation can lean on the audit's §6 deflation layer as reliable for this slice; the two-verifier pass earned its cost and the deflated framings should be treated as the canonical versions of these recommendations."
  },
  {
   "title": "eslint.config.js shipped state matches the audit's §3.7(iv)/§3.10/§3.11/§3.12 promises; one promised deliverable is unrealizable until stage 2 has an owner",
   "verdict": "holds",
   "evidence": "Read end to end at HEAD: deny-by-default inversion with REACTIVE_STATE_EXEMPTIONS marked provisional-for-step-(b) + allowTypeImports; App.vue in the glob with the annotated wiring exemption; historical census phrasing; any-assertion selectors with the vue/no-v-html escape model and band-character justification convention; the no-explicit-any deferral re-opened by append per ADR-0002 Rule 6 (~152 census corrected to 109); gate-prop/module-intent lints keyed on name patterns with measured stock-rule rejections; store-write-needs-owner {subtree→owners} map + session.ui template-toggle carve-out, census corrected in place per the #382 corrective (10 annotations, dated). Zero direct store.engine assignments in analysis-service verified by assignment-pattern grep. Caveat: §3.10's 'inventory doubles as the fork's seam map' exists only as message-level convention — the actual inventory IS stage 2, currently ownerless.",
   "consequence": "No corrective needed on the config itself. Consolidation notes the seam-map promise is gated on the stage-2 successor (granularity finding), and flags a watch item: the ~320-line hand-maintained header is kept out of the L5 mirror-rot class only by its at-adoption historical phrasing — if A13 ships, ADR-0011 Rule 3 names this header its operational register, raising the stakes on that discipline (conditional on PR #391)."
  },
  {
   "title": "The below-the-line demotion of the learned-vf residue was safe only because §3.22's harvest net caught it — the L3 machinery closed its own loop",
   "verdict": "holds",
   "evidence": "§3.2's arc recorded the dispatch residue (FEATURES.md line, non-en locale keys) without fixing or filing it; DB-verified: learned-vf-dispatch-closure (open/future) was filed by the deferral harvest, with the FEATURES.md absence verified at HEAD (grep: no learned-vf/value-binding entry) and named in the item, coordinated with the typed-capability item's status-edit note.",
   "consequence": "Consolidation records this as the in-slice demonstration that the audit's L3 thesis performed in both directions: a demoted lead survived because the recommended harvest mechanism existed. It also lowers the urgency of re-adjudicating other below-the-line leads individually — the harvest is the right channel, provided it keeps running."
  }
 ],
 "coverage": "Read end to end: the history-lessons audit (object), the ADR-corpus audit (via git show, both pages), the e2-digest, frontend/eslint.config.js, frontend/CLAUDE.md. Targeted verification at HEAD/DB: item states+descriptions for 11 ids; absence probes (justification/learned-vf/locale); filing.sql texts for the three load-bearing items; greps over analysis-service.ts, katago-client.ts, version-probe.ts, usePlayFromPosition.ts, blind-mode-prefs.ts (header), migrations.ts, analysis-ledger.ts, engine-connection.ts, FEATURES.md, the learned-vf dispatch. NOT examined: history-audit appendix parts (per discipline — appendix-derived claims relayed via the audit's own pointers and the digest); the 23 worklogs and PR #382 comment bodies directly (relayed via the digest, which read them in full — my HEAD checks corroborated every digest claim I could test); §3.14–§3.25 outcomes beyond where they intersect the slice (§3.8 via §3.25, §3.2 via §3.22); the §3.9 completed-entries-never-leave-maps wrinkle's filing status (flagged for the cross-slice consolidator, not verified). Constraints honored: no perf claims (ADR-0009), todo DB SELECT-only, backend/qeubo/ untouched. Conditional findings (Rule 10 / ADR-0011 references) are phrased against PR #391's unsigned gate."
}
````


---

## e2:recs-14-25-deflations

**Commission** (= `[SHARED: FRAME]` + the following):

````
YOUR SLICE: recommendations §3.14–§3.25 (structure + doc/process), the below-the-line leads, §4 (already-filed strengthenings), §5 (filing record), and CRITICALLY §6 — the deflation record. Re-examine each §6 deflation against the ADR-corpus audit and outcomes: was anything deflated that should not have been (or vice versa)? Were the merge judge's drops (36→18) vindicated — check whether any dropped candidate's territory later produced a defect or filed item (the digest + todo DB help here; e.g. the analyzeRange duplication, App.vue leads, ECharts adapter). Was the refuted registry-editor candidate's disposal right given config-schema-projections remains future?
````

**Output (verbatim):**

````json
{
 "report": "# E2 consolidation review — slice: §3.14–§3.25, below-the-line leads, §4, §5, §6 (deflation record)\n\nObject: /home/bork/w/omega/docs/notes/audit/audit-spa-history-lessons-2026-06-10.md. Consolidated against the ADR-corpus audit (git show origin/bork/docs/adr-corpus-audit:docs/notes/audit/audit-adr-corpus-2026-06-10.md, PR #391 OPEN — everything resting on its A-packages/ADR-0011 is carried conditionally) and the program-outcomes digest (/tmp/claude-1000/-home-bork-w-omega/spa-review/e2-digest.md). All three read end to end; appendix parts not read, per discipline. Load-bearing claims verified by targeted reads/greps at HEAD and read-only psql against the todo DB.\n\n## 1. §6 — the deflation record, re-examined\n\nAll nine recorded deflations **hold** at HEAD/DB; none was over-deflated:\n\n1. *Error packets not invisible* — holds. `silent-coercion-protocol-boundaries-audit` is open (now disposition `active`, i.e. raised since the audit); §3.1 was never executed, so no outcome contradicts the reframe.\n2. *Migration \"vacuous test\" never existed* — holds for the instance, but the class proved hotter than the deflated narrative implied (see §1a below).\n3. *Hydration audit substantially executed; `whenHydrated()` deliberately declined* — holds, and was then vindicated by execution: PR #375's arc engaged the decline on its own terms and the decline stood (re-trigger unfired).\n4. *Services blocklist incomplete-from-day-one, not drift* — holds; the historical-register census phrasing shipped per it (PR #378). (The arc then evaporated step (b)'s record — a different failure, not a defect in the deflation.)\n5. *G1's letter excludes the `r:`/`e:` prefix* — holds; PR #374 recorded exactly the audit-half conclusion with the RCA's own \"mitigation, not a fix\" caveat.\n6. *registry-editor candidate refuted as a strict subset* — holds; see §3 below.\n7. *~215 vs 78 [B1] conflation* — holds; the FILES.md legend re-key shipped in PR #369.\n8. *87fbc3f hash correction* — holds; `git cat-file -t 87fbc3f` → commit.\n9. *Five → four dangling match-arc recommendations* — holds; PR #386 shipped the audit/fixture legs with nothing contradicting the count.\n\nThe §6 *strengthenings* were also vindicated, one decisively: \"the preference clobber survives reloads\" was runtime-demonstrated by the out-of-frame HRA on PR #382 — the literal commissioned defect leaked through the unenumerated exits.\n\n**§1a — one deflation deserves a sharpening note.** The migration deflation correctly killed the false instance claim (no vacuous test; the broken 47→48 draft never reached main). But PR #370's execution found **two archived wrong-path no-op migrations that DID ship** (45→46 `out.settings?.engine?.katago`; 46→47 `out.settings?.appearance`), masked for weeks by hydrate-time deepMerge — now `archived-migration-wrong-path-corrective` (verified open/future). So the miner's severity intuition about the class was righter than the deflation's \"caught pre-ship\" framing suggested, even though its instance claim was wrong. The consolidation should record both halves: deflation correct, class live.\n\n**§1b — one deflation is missing.** The audit's own L6 and §3.23 assert ADR-0003 trigger #1 \"has now fired **twice** over — the active `chess-clone` item and the fork.\" The ADR-corpus audit deflates this (verdict table ADR-0003 row; §8.5; A3.6): one materialized adopter (the fork) plus one *filed prospective* adopter whose own PoC gate is unmet (chess-clone — DB-verified open/active). The §6 record never caught it; the overclaim traveled into ADR-0003's amendment text via PR #369 and the §4 table's `chess-clone` row repeats it (\"a second adopter on a different axis\"). The factual deflation stands on appendix-verified evidence regardless of sign-off; the *textual correction* rides PR #391's C4 precision rider — **if A3 ships, the corrected phrasing lands; if PR #391 stalls, ADR-0003 carries the overclaim at HEAD and the consolidation should flag it independently.** This is the clearest verification-pass miss in the object document: the deflation machinery worked on miners' claims but not on a coordinator-origin claim embedded in the synthesis itself.\n\n**§1c — a self-application gap the §6 record could not have caught but the consolidation should name.** Audit §3.7 leg (ii) prescribed snapshot/restore \"on loadCard/finish/abort\" — a three-event enumeration where the runtime exit class had six; the out-of-frame HRA returned UNDISCHARGED-HACK on exactly this, and the corrective (cd8007a) replaced enumeration with an exit-predicate watcher. The audit's own L2 lesson (\"owners, not per-writer gates\" — nets quantify over the class) warned against precisely the shape its recommendation text used. If A13 ships, this is ADR-0011 Rule 4's fourth cited instance; either way the consolidation should record that the audit text itself instantiated the anti-pattern its lesson named.\n\n## 2. The merge judge's drops (below-the-line leads) — scorecard at HEAD/DB\n\nLargely **vindicated**: no dropped territory produced an in-program defect, and most leads were captured through other channels — three of them by the harvest (§3.22) the audit itself promoted, which is the drop structure working as designed. Per lead:\n\n- **analyzeRange/analyzeActiveNode duplication** — captured: appended as a dated one-miner evidence note on `refactoring-queue-adr0007` (open/in-progress) by the deferral harvest, with \"partially addressed by multi-writer-slots-get-owners leg iii\" recorded. The duplication is still visible at HEAD (/home/bork/w/omega/frontend/src/services/analysis-service.ts — the two methods at :475/:714 with extensive \"see analyzeRange above\" cross-comments). No defect surfaced. Drop OK.\n- **App.vue leads** — partially captured: only the dead-CSS corner was filed (`app-vue-orphan-sr-css`, open/future, harvest-ref'd). The unscoped `<style>` block is confirmed still present (/home/bork/w/omega/frontend/src/App.vue:536; file now 728 lines) and the grading-integrity-policy extraction has no item and no `not-filed:` marker. No defect traced. Drop not contradicted; leads dangle (see §2a).\n- **ECharts lifecycle adapter** — territory already owned: pre-existing `polymorphic-chart-renderer` (open/future) covers the ChartRenderer Port motivated by ECharts' destroy-and-recreate behavior. Drop vindicated.\n- **Auth dual-representation** — captured: `single-owner-auth-state` (open/future, harvest-ref'd, RFC-0001 Q9).\n- **useStabilityMetrics accumulator follow-up** — captured: `usestabilitymetrics-incremental-projection` (open/future, harvest-ref'd; title even records 'the named \"next step\", never filed').\n- **learned-vf closure obligations** — captured twice: the dispatch's stale `Status: Open` got a dated note in PR #372's arc, and `learned-vf-dispatch-closure` (open/future) now owns the FEATURES.md line + locale keys + consumed-status response.\n- **distribution-packaging disposition** — NOT acted: still open/future (DB-verified) despite §7.8 and two retros naming it the leading priority. Un-acted maintainer decision; the consolidation should re-surface it.\n- **Vestigial ApiError back-compat message format** — not filed; the comment stands at /home/bork/w/omega/frontend/src/services/api-client.ts:209 with no observed message-format reader. The literal lead stays cosmetic. **But the adjacent error-shape seam produced the program's most serious unfiled defect** — see §2b.\n- **Generated ADR-0007 over-budget report** — not filed; the queue item continues handled-on-touch, and ADR-0007's acceptance (A7, conditional on PR #391) names the never-measured density. Dormant, low cost.\n\n**§2a — the below-the-line section is itself the L3 shape.** Nine leads, zero item ids, zero `not-filed:` markers — authored the same day PR #376 widened checklist §D to exactly this convention (and §3.22's own text prescribes it). Five-ish were rescued by other channels; the residue (App.vue unscoped style + grading-integrity extraction, ApiError vestige, over-budget report) dangles. The consolidation should run a disposition pass over the section: each remaining lead either filed or marked `not-filed: <reason>` in a dated note. If A5b (Rule 10) ships, this becomes a rule-level obligation; checklist §D already covers it regardless.\n\n**§2b — the auto-save pause defect: verified real at HEAD, unfiled, and it is the audit's own L4 thesis live in the tree.** Chain, independently verified: `AnalysisPersistenceService.save()` routes failures through `rethrowAsStorageError` (/home/bork/w/omega/frontend/src/services/analysis-persistence-service.ts:249, called at :333), which for the two known 413 envelopes throws the **plain structural union** (deliberately not an Error subclass — documented, lint-annotated). The auto-save composable then re-parses the caught value with `parseStorageError` (/home/bork/w/omega/frontend/src/composables/useAutoSaveAnalyses.ts:131), whose first check is `if (!(err instanceof ApiError)) return null;` (/home/bork/w/omega/frontend/src/services/analysis-bundle.ts:117). The union is never an `ApiError`, so the pause path (`setAutoSaveError`) is unreachable against the real service for exactly the persistent quota/cap failures it exists to pause on — each subsequent markDirty re-fires a doomed PUT. The integration test passes only because the fake rejects with a raw `ApiError` (PR #387 worklog). DB probes (auto-save / autoSaveError / rethrowAsStorageError / parseStorageError): **zero rows** — the worklog's \"named for the maintainer to file\" evaporated. This is a double-parse type-confusion at a trust seam — L4's exact signature — surfaced by the very program that codified L4, then lost to the L3 shape the same program codified. Filing it is, in my view, the single highest-priority concrete action in this slice.\n\n## 3. The registry-editor disposal (§3.21)\n\nThe refutation-disposal was **right** and remains right: `config-schema-projections`'s 903-line design note enumerates four baked vocabularies to the candidate's three, and its §8 anticipates the fork. The salvage halves diverged:\n\n- **The raise has since been enacted** — DB shows `config-schema-projections` open/**active**, not future. (My commission's premise \"remains future\" is stale against the DB; the digest's \"un-acted curation\" was true when written and has been overtaken.) Nothing left to do here but record it.\n- **The FILES.md drift annotation did NOT happen** — /home/bork/w/omega/frontend/FILES.md:123 still reads `RegistryEditor.vue [B1] Generic managed-registry editor with defaults and structural protection.` with no annotation. Small, bounded, still owed; it can ride `band-conformance-ci-check` or any FILES.md touch.\n\n## 4. §4 — already-filed strengthenings, checked row by row\n\nAll eight items verified in the DB. Outcomes: `silent-coercion-protocol-boundaries-audit` open/active (raised; evidence widening landed, §3.1 work not started); `gradingparameter-opacity-typing` open/**future** — the audit's \"grounds to activate rather than await stabilization\" was never enacted, the clearest un-acted §4 curation row; `refactoring-queue-adr0007` open/in-progress with the harvest's evidence notes appended (including a lead I had not seen elsewhere: useBoardGeometry consolidation, deferred 2026-05-03, captured in the note); `thumbnail-render-lifecycle-consolidation` open/future; `spa-board-scope-consistency-audit` open/active (E4 retitled-to-residual per the harvest audit §7); `config-schema-projections` raised (above); `adr-effectiveness-audits` open with the sweep record **confirmed applied** in its description (resolving the digest's \"presumably\" — I read the appended text in the DB; it matches the staged §9(1) UPDATE); `chess-clone` open/active, with its §4 row carrying the same \"second adopter\" phrasing §1b deflates. The §4 closing paragraph's not-staged-deliberately posture worked where the maintainer acted and leaked where he didn't; the consolidation should sweep §4 for the two un-acted rows (gradingparameter activation; the chess-clone phrasing correction, conditional on the C4 rider's fate).\n\n## 5. §5 — the filing record\n\nFully vindicated. All 20 staged ids exist in the DB: 19 closed (executed by the program), `band-conformance-ci-check` open/future. The staged-SQL artifact exists at /home/bork/w/omega/docs/notes/audit/audit-spa-history-lessons-2026-06-10-filing.sql. The vocabulary wrinkle was the audit's best small prediction: \"if audits keep anchoring items, the enum deserves the value\" — vindicated the same day via PR #381; /home/bork/w/omega/tools/work-status/schema.sql:83-86 now carries `'audit'` in `refs_kind_check` with a dated provenance comment, and 48 refs were re-pointed. The ADR-corpus audit cites the arc as ADR-0008 Revisit-#4's worked partial firing (conditional on A8 for the in-ADR record).\n\n## 6. §3.14–§3.25 — outcomes against the recommendations\n\nEleven of twelve executed (everything but §3.14), with the audit's load-bearing reframes holding under execution: §3.20's \"recorded decision whose trigger fired\" framing was implemented as written; §3.16's two verification-exposed seams were real and execution found a third (`findActionByKey`) the audit missed — incomplete but directionally right; §3.15's two named costs (runtime barrel; same-PR IDENTIFIERS.md re-point) were both honored; §3.24's \"four\" misreported files were mechanically five (deviation named). Two slice-relevant residues:\n\n- **§3.14 `band-conformance-ci-check` accreted obligations while staying future.** During execution at least four arcs delegated adjudication to it: the keybindings fused-file [B3]-on-[B1] annotation (PR #390), the ADR-0003 sizing-row disagreements (A3.4, conditional), ADR-0008 Revisit-#4's named fuller firing (A8, conditional), and the ADR-corpus audit's §6.5 dominant-concern legend question. The audit's §7.7 promotion list did not include it. It is now the unexecuted item with the most recorded dependents; the consolidation should put it on the promotion list, and its eventual design must answer the four recorded expectations (plus the RegistryEditor drift annotation from §3 above).\n- **§3.17's new-defect record self-healed.** The e2e-harness SELECTOR incompatibility, which the digest correctly flagged as carrying neither item id nor `not-filed:` marker, has since been filed: `e2e-harness-selector-model-field` (open/future, refs → PR 383 + the review-scoring worklog). Of the digest's two post-§D L3 misses, this one is repaired; the auto-save defect (§2b) is the one still open.\n\n## 7. What the consolidation should say (condensed)\n\n1. §6 stands intact — nine for nine, with the migration deflation annotated \"instance right, class hotter\" (the two shipped archive no-ops). The deflation machinery's one structural gap: it never audited coordinator-origin synthesis claims — the L6/§3.23 \"fired twice\" overclaim is the missing tenth deflation, correction conditional on PR #391's C4/A3.\n2. The merge judge's 36→18 cut is vindicated as a *system*: drops were safe because the promoted harvest (§3.22) and pre-existing items caught the live ones. Credit the structure, not the judge alone — and note the below-the-line section's own non-conformance with §D, with a disposition pass over the three-to-four still-dangling leads.\n3. File the auto-save pause defect now (§2b: useAutoSaveAnalyses.ts:131 / parseStorageError instanceof-first / rethrowAsStorageError plain-union). It is verified real at HEAD, unfiled, and is simultaneously an L4 instance and an L3 instance — the program's two strongest lessons, live in one seam.\n4. Record the registry-editor outcome: disposal right, raise enacted (DB now open/active — correct any \"remains future\" phrasing in consolidation inputs), FILES.md:123 annotation still owed.\n5. Promote `band-conformance-ci-check`; sweep §4's un-acted rows (gradingparameter activation; distribution-packaging's §7.8 decision).\n6. Anything touching ADR-0011/Rule 10/Rule 11/A-packages stays phrased conditionally — PR #391 is open and gate 1 is unsigned.\n\nLicense: Public Domain (The Unlicense).",
 "findings": [
  {
   "title": "§6 deflation record: all nine deflations hold at HEAD/DB",
   "verdict": "holds",
   "evidence": "Each deflation re-checked: silent-coercion item open/active with §3.1 unexecuted; PR #375 re-engaged the whenHydrated decline and it stood; PR #378 shipped the incomplete-from-day-one census phrasing; PR #374 recorded the r:/e: G1 conclusion; FILES.md legend re-keyed (PR #369); git cat-file confirms 87fbc3f is a commit; PR #386 closed the four-not-five count. §6's strengthenings also vindicated — the reload-surviving pref clobber was runtime-demonstrated by the out-of-frame HRA on PR #382.",
   "consequence": "The consolidation can certify the deflation record as sound on its own claims; no deflation needs reversal."
  },
  {
   "title": "Migration deflation: instance right, class hotter than the deflated narrative",
   "verdict": "sharpened",
   "evidence": "The deflation ('vacuous test never existed; broken draft never reached main') holds for 47→48, but PR #370's arc found two archived wrong-path no-op migrations that DID ship (45→46 settings?.engine?.katago; 46→47 settings?.appearance), masked by hydrate-time deepMerge. `archived-migration-wrong-path-corrective` verified open/future in the todo DB.",
   "consequence": "Annotate the §6 migration entry: the instance-claim deflation was correct AND the miner's class-severity intuition was vindicated beyond the audit's framing — two live shipped instances existed."
  },
  {
   "title": "Missing tenth deflation: the ADR-0003 'fired twice' overclaim in L6/§3.23 and the §4 chess-clone row",
   "verdict": "conditional",
   "evidence": "Audit L6: trigger #1 'has now fired twice over — the active chess-clone item and the fork'; §4 repeats 'a second adopter on a different axis'. The ADR-corpus audit (verdict table ADR-0003 row, §8.5, A3.6) deflates: one materialized adopter + one filed prospective adopter whose PoC gate is unmet. DB confirms chess-clone open/active (prospective). The overclaim traveled into ADR-0003 via PR #369; coordinator admits commission authorship.",
   "consequence": "The factual deflation stands on appendix-verified evidence now; the textual correction rides PR #391's C4 rider — if A3 ships the corrected phrasing lands, if PR #391 stalls the consolidation must flag ADR-0003's overclaim independently. Also note structurally: §6's verification pass audited miners' claims but not coordinator-origin synthesis claims."
  },
  {
   "title": "Merge judge's drops (36→18) vindicated as a system, not in isolation",
   "verdict": "holds",
   "evidence": "No dropped territory produced an in-program defect (the program's real defects — exit-set leak, archive no-ops, auto-save fake-fidelity — all came from promoted arcs). Captures verified in DB: analyzeRange duplication → evidence note on refactoring-queue-adr0007 (open/in-progress); auth dual-rep → single-owner-auth-state; useStabilityMetrics → usestabilitymetrics-incremental-projection (all three harvest-ref'd); ECharts adapter → pre-existing polymorphic-chart-renderer (open/future); learned-vf obligations → learned-vf-dispatch-closure + dated dispatch note. Residual danglers: App.vue unscoped style (confirmed at App.vue:536, 728 lines) + grading-integrity extraction, ApiError message vestige (api-client.ts:209), over-budget report, distribution-packaging (still open/future despite §7.8).",
   "consequence": "Credit the promoted harvest (§3.22) as the safety net that made the drops safe; run a disposition pass (file or `not-filed:`) over the three-to-four still-dangling leads, and re-surface the distribution-packaging §7.8 decision."
  },
  {
   "title": "Auto-save pause defect: verified real at HEAD, unfiled — a live L4+L3 instance in the dropped ApiError lead's neighborhood",
   "verdict": "sharpened",
   "evidence": "Verified chain: analysis-persistence-service.ts save() (:310-335) routes failures through rethrowAsStorageError (:249), which throws the plain structural union for known 413 envelopes; useAutoSaveAnalyses.ts:131 re-parses with parseStorageError, whose first check (analysis-bundle.ts:117) is `if (!(err instanceof ApiError)) return null;` — so setAutoSaveError is unreachable against the real service for exactly the persistent quota/cap failures it exists to pause on. DB probes (auto-save/autoSaveError/rethrowAsStorageError/parseStorageError): zero rows. PR #387 worklog said 'named for the maintainer to file'; it never was.",
   "consequence": "File this defect now — highest-priority concrete action in this slice. It is the audit's L4 thesis (trust-boundary type confusion) surfaced by the program that codified it, then lost to the L3 shape the program also codified; of the digest's two post-§D misses, this is the one that did not self-heal (the e2e SELECTOR one was since filed as e2e-harness-selector-model-field)."
  },
  {
   "title": "Registry-editor disposal (§3.21): right call; salvage half-executed; commission premise stale",
   "verdict": "sharpened",
   "evidence": "Refutation-as-subset confirmed sound (config-schema-projections' design note enumerates four vocabularies vs the candidate's three; §8 anticipates the fork). DB now shows config-schema-projections open/ACTIVE — the raise was enacted after the digest was written, so 'remains future' is stale. The FILES.md drift annotation did NOT happen: frontend/FILES.md:123 still carries bare '[B1] Generic managed-registry editor…' on RegistryEditor.vue.",
   "consequence": "Record the raise as done (correct any 'remains future' phrasing in consolidation inputs); the FILES.md:123 annotation is still owed — ride it on band-conformance-ci-check or the next FILES.md touch."
  },
  {
   "title": "§3.14 band-conformance-ci-check accreted four recorded dependents while staying future",
   "verdict": "sharpened",
   "evidence": "Verified open/future in DB while: PR #390 delegated the keybindings fused-file band annotation to it; ADR-corpus A3.4 names it as the forcing mechanism for the ADR-0003 sizing-row disagreements (conditional); A8 names it as Revisit-#4's fuller firing (conditional); ADR-corpus §6.5 delegates the dominant-concern legend question to its design. The audit's §7.7 promotion list omitted it.",
   "consequence": "Promote it; its design brief should enumerate the four accrued expectations (plus the RegistryEditor drift annotation) so the obligations don't scatter."
  },
  {
   "title": "§5 filing record fully vindicated, including the refs.kind prediction",
   "verdict": "holds",
   "evidence": "All 20 staged ids verified in DB (19 closed via execution; band-conformance-ci-check open/future); filing.sql artifact present at docs/notes/audit/audit-spa-history-lessons-2026-06-10-filing.sql; the sweep record on adr-effectiveness-audits confirmed applied (read from the DB — resolves the digest's 'presumably'). The §5 vocabulary wrinkle ('the enum deserves the value') was vindicated same-day: schema.sql:83-86 now includes 'audit' in refs_kind_check with dated provenance (PR #381, 48 refs re-pointed).",
   "consequence": "The staged-not-inserted posture is a worked precedent worth naming in the consolidation; the §4 table's un-acted rows (gradingparameter-opacity-typing activation — still open/future) are the remaining curation debt."
  },
  {
   "title": "The audit's §3.7 leg (ii) text instantiated the anti-pattern its own L2 lesson names",
   "verdict": "sharpened",
   "evidence": "§3.7(ii) prescribed snapshot/restore 'on loadCard/finish/abort' — a three-event enumeration; the runtime exit class had six, the out-of-frame HRA returned UNDISCHARGED-HACK with a runtime-demonstrated pref leak, and corrective cd8007a replaced enumeration with an exit-predicate watcher quantifying over all present and future exits.",
   "consequence": "Record the self-application gap: the recommendation layer is not exempt from L2/'nets quantify over the class'. If A13 ships, this is ADR-0011 Rule 4's fourth cited instance; either way commission-authoring should inherit the rule."
  },
  {
   "title": "Below-the-line section is itself the L3 shape the audit codified",
   "verdict": "sharpened",
   "evidence": "Nine leads, zero item ids, zero not-filed markers — authored the same day PR #376 widened checklist §D to exactly this convention, and §3.22's own recommendation text prescribes the marker. Five-ish leads were rescued by other channels; the rest dangle (verified by DB probes and HEAD greps).",
   "consequence": "The consolidation should run a §D-conformant disposition pass over the section's residue and note the irony as evidence FOR the proposed Rule 10 (conditional, PR #391): even an audit that names L3 reproduces it without a mechanism."
  }
 ],
 "coverage": "Read end to end: the history-lessons audit (docs/notes/audit/audit-spa-history-lessons-2026-06-10.md), the ADR-corpus audit (git show origin/bork/docs/adr-corpus-audit:…, all 1,261 lines via two paged reads of the persisted output), and the E2 digest (/tmp/claude-1000/-home-bork-w-omega/spa-review/e2-digest.md). NOT read: the ~800KB history-audit appendix parts (cited only via the audits' own pointers and the digest), ADR-corpus appendices, backend/qeubo/**, worker transcripts. Verified at HEAD by targeted read/grep: analysis-persistence-service.ts (save/rethrowAsStorageError, :249/:310-335/:361), analysis-bundle.ts parseStorageError (:116-145), useAutoSaveAnalyses.ts (:115-145), api-client.ts (:195-225), analysis-service.ts analyzeRange/analyzeActiveNode presence, App.vue:536 unscoped style + 728-line count, FILES.md:67/:123 RegistryEditor rows, tools/work-status/schema.sql (refs_kind_check 'audit' + items constraints), filing.sql artifact presence, commit 87fbc3f existence. Verified in the todo DB (read-only psql): states/dispositions for ~30 items including all 20 §5 staged ids, the four §9 ADR-audit items, and all eight §4 rows; refs provenance for 7 items; the applied sweep record on adr-effectiveness-audits; absence probes for auto-save/parseStorageError/rethrowAsStorageError, justification-adjacency (cast stage 2), serializeActivePath, playEngineMoves, ECharts/chart-adapter, over-budget, App.vue/grading-integrity, auth dual-representation, useStabilityMetrics. Not verified: the analyzeRange clamp-divergence specifics (one-miner lead, recorded as captured-not-verified), the App.vue six-component selector claim (only the unscoped block's existence checked), anything inside the appendix parts, and timestamps for the config-schema-projections raise (the items table has no created/updated columns — the raise is dated only as 'post-digest'). No perf claims made or relied on (ADR-0009). Conditional carriage: every conclusion touching PR #391's A-packages, the C4 rider, ADR-0011, or Rules 10/11 is phrased contingently — gate 1 is unsigned."
}
````


---

## e2:rules-refutation-coordinator

**Commission** (= `[SHARED: FRAME]` + the following):

````
YOUR SLICE, two halves. (1) The PROMISED out-of-frame refutation of ADR-0005 Rules 10–11 draft texts (ADR-corpus audit Appendix A5b/A5c — read via the git show; the corpus audit flags them as its least-refuted proposals). Adversarially: does Rule 10 exceed documentation-authoring scope anywhere? Does Rule 11's in-tree mandate conflict with any standing convention (PR-comment artifacts, point-in-time non-retro-editing)? Are the rule texts executable as written? Verdict each: survives/weakened/refuted, with repairs. Read ADR-0005 end to end first. (2) The COORDINATOR-PERFORMANCE ledger: from the digest's coordinator-errors section plus your own verification, assemble the honest record of the coordinating session's commissioning/orchestration defects across the program, their costs, their catches, and what systemic correction (if any) each implies — this section reaches the maintainer unsoftened.
````

**Output (verbatim):**

````json
{
 "report": "# E2 slice — out-of-frame refutation of ADR-0005 Rules 10–11 (A5b/A5c) + the coordinator-performance ledger\n\nReviewer posture: I did not produce the history-lessons audit, the ADR-corpus audit, or any program PR. The ADR-corpus audit's A-packages and ADR-0011 are PROPOSED (PR #391 open); every conclusion contingent on them is phrased conditionally.\n\n## Part 1 — Refutation pass on ADR-0005 Rules 10–11 draft texts\n\nThis is the out-of-frame pass the corpus audit itself requested (§8.4: the two rule appends \"escaped dedicated refutation by being classed amendments\" and are \"the least-refuted proposals in the set\"). I read ADR-0005 end to end at HEAD, both rule drafts in Appendix A5b/A5c end to end, and checklist §D (the named operational walk-through) in full. Bottom line: **neither rule is refuted; both are weakened as drafted, each with bounded repairs.** The corpus audit's synthesis-level scope check (\"scope fit within ADR-0005's documentation-authoring mandate: both pass\") was run at rule granularity and missed bullet-level defects.\n\n### Rule 10 (deferrals are ledgered at authoring time) — verdict: WEAKENED, survives with repairs\n\n**1a. Scope: three of four bullets fit; the fourth overreaches.** Capture, refs-at-filing, and retitle-to-residual are documentation-authoring discipline in the envelope Rules 6 and 9 already established (Rule 6 mandates status updates at the work moment; Rule 9 already mandates a DB-side ref at note-authoring time; the A8 co-change reads \"TODO entry\" as a store item). The fourth bullet — \"a deferral whose rationale is generality for a second domain is **never dropped** on 'only one domain uses it' grounds\" — is not a recording rule at all: it is a substantive triage prohibition constraining which `not-filed:` *reasons* are legitimate, i.e., it binds the maintainer's curation judgment, which no other ADR-0005 rule does. Worse, it launders a contingency: checklist §D's version (verified at `docs/pre-merge-checklist.md:107-109`) carries the attribution \"(the fork constraint; audit §3.22)\" — the draft rule body drops it, universalizing a strategy-contingent constraint into a timeless tenet rule. If the fork plan changes, ADR-0005 carries a standing prohibition with a dead rationale. **Repair (required):** either recast as fail-loud recording — \"a deferral dropped on single-domain grounds names the generality rationale it declines and the fork-premise record it disagrees with\" — or keep the prohibition explicitly date-scoped to the recorded fork constraint with a named revisit trigger.\n\n**1b. The genre enumeration is narrower than the checklist it elevates — and fails open at a paid-for instance.** The draft binds bullets \"in a worklog, postmortem, retrospective, audit, or consult record.\" §D says \"in the worklog's 'What's deferred' section **or anywhere else**.\" The tenet narrowed the quantifier of the checklist line it promotes. Dispatches are outside the five-genre list, and the program's own corpus carries the paid-for instance: the learned-vf dispatch's unmet closure obligations (history audit, below-the-line; digest §3.2 — residue \"recorded there, not fixed\"). Design notes are likewise outside the list. The rule that institutionalizes \"enumerations fail open\" evidence is itself written as an enumeration. **Repair (required):** \"in any committed record within this tenet's Scope\" — quantify over the class.\n\n**1c. The mechanization claim is half-true as written.** \"The marker convention is deliberately grep-able so a future advisory sweep can mechanize detection\" — only the negative half is. `not-filed:` is grep-able; a bullet ending in a bare item-id slug (`band-conformance-ci-check`) is not mechanically distinguishable from a hyphenated phrase, and the sweep cannot detect a deferral bullet carrying *neither* marker (recognizing deferral bullets is the judgment half). **Repair (recommended):** name an id-citation form (backticked id, or an `ssot:` sigil) so the positive case is also sweepable, and state honestly that unmarked deferrals remain checklist/review territory.\n\n**1d. The rule misses the moment where the program actually leaked: closure.** Rule 10's bullets bind at authoring, filing, and partial-ship. The program's two in-flight evaporations (ledger entry 7 below) both happened at **item closure**: `services-boundary-deny-by-default` closed with step (b)'s record lost; `cast-hygiene-lint` closed with stage 2 — the item's title half — measured-but-unadopted and no successor (DB-verified still true at this review's runtime). Retitle-to-residual covers the open-item case only. **Repair (required):** add a closure bullet — an item closes only after a residual sweep files or `not-filed:`-marks every named residue; closure is a Rule 6 documentation event.\n\n**1e. Calibration evidence the draft omits.** Two L3-shape misses postdate §D's landing by hours (verified: `2026-06-10-review-scoring-named-seam.md:122-134` records the harness↔SELECTOR incompatibility with neither id nor marker; `2026-06-10-only-throw-error-g3.md:134` says \"named for the maintainer to file\" and DB probes return zero rows). This cuts both ways: it is the argument *for* tenet-level elevation, and it is evidence that the rule's only near-term surface (checklist + review) leaks same-day. **Repair (recommended):** cite the two misses as calibration in the rule body, and treat the advisory sweep as work to file, not a gestured \"future candidate.\"\n\n**1f. Conditional — double-home with ADR-0011 Rule 2 (if A13 ships).** ADR-0011's draft Rule 2 restates the same norm (\"'Filed alongside' means a work-status store item — … a worklog recommendation does not discharge the obligation\") without delegating to Rule 10. If both ship as drafted, the deferral-ledgering discipline has two normative homes — the Rule 1 parallel-registry shape both documents decry. **Repair (conditional):** one clause in whichever merges second: \"per ADR-0005 Rule 10.\"\n\n### Rule 11 (commissioned-review artifacts are recorded verbatim, in-tree) — verdict: WEAKENED, survives with repairs; its motivating evidence is stronger than the draft knows\n\nThe need is real and freshly re-proven: I verified n4's grep (≥5 committed invocation sites of \"the standing verbatim-record discipline\" — history audit :30, corpus audit :51, hydration audit :389, multi-writer worklog :313, branded-path worklog :224 (variant) — with zero committed definitions), and the digest's finding 6 byte-for-byte (PR #382 comment 4667632012 is 235 characters: only the coordinator's \"merging on this verdict\" note; the referenced assessment exists nowhere — not in PR reviews, not in the worklog, not in scratch). The rule's own substrate arc thus exhibits all three postures in one thread: the in-frame HRA traveled fully verbatim (worklog appendix, verified, with a model in-situ dated correction whose struck quote remains legible); the out-of-frame artifact traveled as pointer-plus-rich-substance (worklog postscript, verified; the verbatim copy lives only on the forge and in uncommitted scratch); the re-verification verdict traveled with **nothing**. Three defects in the draft text:\n\n**2a. The off-tree clause can swallow the verbatim mandate.** \"The committed document carries the pointer plus the artifact's substance\" — \"substance\" is undefined; textually a one-line summary satisfies it, re-opening the laundering channel the rule exists to close (a summary can launder; that is the fabricated-quote lesson). The #382 postscript sets a high de-facto bar (~90 lines reproducing every verdict-carrying finding) that the text does not encode. **Repair (required):** define substance minimally — the verdict plus every verdict-carrying finding reproduced, not characterized — and add the clause finding 6 makes necessary: *a verdict whose artifact cannot be produced on demand is treated as no verdict.* That single sentence would have blocked the #382 merge-on-nothing.\n\n**2b. The in-situ correction clause under-specifies legibility and needs one reconciling sentence against the point-in-time convention.** \"Corrections … made in situ, dated, with the surrounding artifact otherwise left verbatim\" constrains the surroundings but not the corrected span — as written it licenses silently rewriting the erroneous span itself. The worked example did it right (the fabricated quote is still legible inside the dated CORRECTION block; \"STRUCK, not re-attributed\"); the text should encode what the example did: corrections are dated *insertions*; the original text stays legible. Relatedly, the audit directory's \"not retro-edited\" header and Rule 11's correction mandate soft-collide for post-merge corrections to frozen records; the reconciliation (a dated, legibility-preserving insertion is an append-shaped annotation, not the forbidden retro-edit) should be stated, not implied via the strained \"Rule 8 sibling-revision principle applied inside a single record\" gloss — an in-situ edit is precisely not a sibling.\n\n**2c. The rule omits the consumption externality its own program paid for.** Rule 11 mandates artifacts that reach ~810 KB, in a project whose umbrella CLAUDE.md mandates end-to-end reading before citation. That composition is exactly coordinator-error 4: nine readers × 810 KB, maintainer-interrupted, restructured to read-once-digest-once — a regime that currently lives in commission prompts only. The corpus audit restructured its own method around this cost and still drafted Rule 11 without folding the lesson in (the n4 appendix note even gestures at \"the cost acknowledged in Consequences-Negative *if desired*\"). **Repair (required):** one sentence classing verbatim appendices as reference records consumed by pointer-citation (the digest pattern as the sanctioned fan-out posture), so the rule and the read-fully discipline compose instead of multiplying.\n\n**2d. Minor:** bound \"commissioned review\" (a delegated review whose verdict the session cites as evidence; the maintainer's own review is the principal's act, not a commissioned artifact) so routine PR review is not swallowed.\n\n**Net for Part 1:** Rule 10 — weakened; ship after repairs 1a/1b/1d (1c/1e recommended; 1f conditional on A13). Rule 11 — weakened; ship after repairs 2a/2c (2b strongly recommended; 2d optional). Both rules' core claims survive adversarial pressure; the corpus audit's instinct to flag them for exactly this pass was sound.\n\n## Part 2 — Coordinator-performance ledger (unsoftened)\n\nEvery digest entry independently verified where the record reaches; verification means named per entry. The honest headline: **eight defects, zero caught by the coordinator's own review before an external party flagged them.** Workers caught 1; the ADR audit caught 2 and 7a; the out-of-frame rerun (coordinator-commissioned — credit where due) caught 3; the maintainer caught 4; GitHub's merge refusal caught 5; the E2 digest caught 6, 7b, and 8 — after merge, after closure.\n\n1. **Reversed brand↔producer mapping in the §3.4 commission** (verified, worklog :45-55: \"That is **reversed** relative to the postmortem's §4 semantics\"). Cost: a near-miss of semantically inverted brand names in a correctness arc; paid cost was worker cross-checking time plus a deviation record. Catch: the worker, by treating the named source as authoritative over the commission's paraphrase. Same arc, second commission defect: the caller-based worklist definition missed `sgf-writer.ts::serializeActivePath` — a population defined by enumeration, not by class; only the adversarial pass's independent producer enumeration found it. Correction: commissions quote semantics from sources verbatim or explicitly subordinate themselves to the named source; populations are defined by predicate, not instance list (ADR-0011 Rule 4's shape, applied to commissioning).\n\n2. **ADR-0003 \"fired twice\" overclaim, coordinator-authored commission → merged ADR text** (PR #369). Cost: a known-imprecise claim sits in a load-bearing ADR at HEAD; its correction (the C4 rider) is hostage to PR #391's undecided sign-off — carried conditionally. Catch: the ADR-corpus audit's generalization-pass appendix check. Correction: claims destined for ADR amendments get audit-grade verification before commissioning, not after merge.\n\n3. **Multi-writer commission's exit under-specification → UNDISCHARGED-HACK** (verified end to end: worklog appendix + postscript, comment 4667405038 pointer, DB). The commission specified the writer side, not the exit invariant; 3 of 6 exits shipped unhooked with the literal commissioned defect runtime-reachable; the in-frame pass the coordinator commissioned first was structurally unable to catch it and named the gap in future tense while three present-tense instances shipped. Inside the in-frame artifact, a fabricated commission quote laundered the store.profile narrowing — caught only because the artifact was verbatim and the out-of-frame rerun checked it against the commissioning item. Catches: the coordinator commissioned the rerun, held the merge, and commissioned the corrective (cd8007a) — the one entry where the coordinator's process worked as designed, one layer late. Correction: commissions for >1-writer state name the flow invariant (every exit, present and future), and out-of-frame review for that class is the default, not the escalation (this is the standing memory-note rule; the program re-derived it the expensive way).\n\n4. **Evidence-fanout cost incident** (the \"600k incident\", coordinator-admitted). Cost: an interrupted nine-reader launch each consuming the ~810 KB appendix corpus; maintainer intervention to restructure. Catch: the maintainer, watching per-agent cost — not the coordinator, who designed the fan-out under a read-fully discipline he knew applied. Correction: evidence-access is costed per agent at plan time; the read-once-digest-once regime gets a committed home (Rule 11 repair 2c is the natural one).\n\n5. **Defective merge-train watcher — stale-check acceptance** (verified directly in train.log: #370 merged 35s and #371 **4s** after rebase-push on the pre-rebase head's checks; GitHub's \"Base branch was modified\" refusal on #372; wording flips to \"waiting for fresh checks\" after, latencies normalize to ~80s). Cost: two PRs merged on evidence about a different commit; no damage (main CI subsequently green per the doc-graph-ci run history). Catch: GitHub's own guard — luck-shaped, external. Correction: watcher conditions assert evidence *freshness* (checks anchored to the pushed head SHA), and coordinator automation gets the same probe-before-trust discipline the program imposed on every lint adoption. The asymmetry is the point: the coordinator required measure-first/probe-verified adoption from workers while running an un-probed merge gate himself.\n\n6. **The #382 re-verification verdict traveled without its artifact** (verified byte-for-byte: comment 4667632012 = 235 chars, body is only the appended \"merging on this verdict\" note; the assessment it references exists nowhere reachable — the shape suggests a failed body interpolation when posting). Cost: the merge decision's evidence is unrecoverable; the two alluded findings (capture() phrasing nit; hydration-exit race) are only partially reconstructable. Catch: the E2 digest, post-merge. Correction: Rule 11 repair 2a (no producible artifact ⇒ no verdict) plus the trivial mechanical guard — verify a posted verdict comment's body length before acting on it. The coordinator violated, within hours, the discipline whose substrate he had just minted — which is itself the strongest available evidence for the program's own thesis that prose discipline decays even at maximum salience, and only mechanisms hold.\n\n7. **Closure-without-residual-recapture, twice.** (a) services-boundary step (b): caught by the ADR audit, re-captured (`reactive-state-modules-relocation` DB-verified open/future). (b) cast-hygiene stage 2: DB-verified **still uncaptured now** — `cast-hygiene-lint` closed, the justification-adjacency probe returns only the closed item, and the branded-path lint rider points at the closed item, compounding the loss. Cost: the title-half of a commissioned arc has no open record anywhere but a closed item's description and an eslint-config header. Catch: (a) the ADR audit; (b) the digest only. Correction: Rule 10 repair 1d (closure-time residual sweep); the coordinator performed every closure in the program, so this is a coordinator-curation defect class, not a worker one.\n\n8. **Two post-§D L3 misses merged** (verified; see 1e above; both defects DB-confirmed unfiled at this review's runtime — the auto-save pause path that cannot fire against the real service is a live correctness defect with no tracked record). Cost: two untracked defects, one live. Catch: the digest. Correction: §D enforcement at merge is the coordinator's moment — the merging party owns the marker check, since the authoring party demonstrably misses it same-day.\n\n**Systemic synthesis.** The defects cluster in two shapes. (i) *Commission under-specification* (1, 2, 3): paraphrase instead of quotation, instances instead of invariants — corrected by workers and out-of-frame review, and largely addressed if the program's own products ship (ADR-0011 Rule 4; Rule 11). (ii) *The orchestration layer running outside the program's discipline net* (4, 5, 6, 7, 8): the train script un-probed, the posted verdict un-verified, the closures un-swept, the fan-out un-costed — every one a coordinator-layer artifact escaping the exact regime (measure-first, probe-verify, ledger-everything, artifact-before-verdict) the coordinator was simultaneously imposing on worker artifacts. Every rule the program shipped binds the author/worker layer; nothing binds the orchestration layer. The one-sentence correction for the maintainer to consider, phrased tool-agnostically per the corpus audit's §8.9 posture: *coordinator-layer artifacts — commissions, merge automation, curation operations, posted verdicts — are work products under the same disciplines as worker output, and get the same probe, ledger, and artifact treatment.* Where it lives (umbrella CLAUDE.md, or ADR-0011's checklist surface if A13 ships) is the maintainer's call.\n\n**What the consolidation should do now, independent of any sign-off:** file the auto-save fake-fidelity defect and the cast-hygiene stage-2 successor (both absence-verified today); re-point the branded-path lint rider at the successor; carry the C4 precision rider conditionally; apply repairs 1a/1b/1d and 2a/2c to the Rule 10/11 texts before execution.",
 "findings": [
  {
   "title": "ADR-0005 Rule 10 draft (A5b): survives weakened — one bullet exceeds documentation-authoring scope and launders a fork contingency",
   "verdict": "sharpened",
   "evidence": "Draft text (corpus audit Appendix A5b) vs checklist §D at HEAD (docs/pre-merge-checklist.md:107-109): §D's 'Generalization deferrals survive' bullet carries the attribution '(the fork constraint; audit §3.22)'; the rule body drops it, universalizing a strategy-contingent triage prohibition that binds curation judgment, not authoring shape. Capture/refs/retitle bullets fit the Rule 6/Rule 9 scope envelope.",
   "consequence": "Before execution: recast the bullet as fail-loud recording ('a drop on single-domain grounds names the generality rationale it declines') or date-scope it to the recorded fork constraint with a revisit trigger. Do not ship the unconditional prohibition in a tenet."
  },
  {
   "title": "Rule 10's genre enumeration narrows the checklist it elevates and fails open at a paid-for instance",
   "verdict": "sharpened",
   "evidence": "Draft binds bullets 'in a worklog, postmortem, retrospective, audit, or consult record'; §D says 'or anywhere else'. Dispatches are outside the list, and the learned-vf dispatch's evaporated closure obligations (history audit below-the-line; digest §3.2) are the paid-for out-of-list instance. Two same-day post-§D misses verified at HEAD (review-scoring worklog :122-134, no marker; only-throw-error worklog :134 'named for the maintainer to file', DB zero rows).",
   "consequence": "Replace the enumeration with 'any committed record within this tenet's Scope'; add a closure-moment bullet (both program evaporations happened at item closure, which retitle-to-residual does not cover); cite the two post-§D misses as calibration; state that only the negative (not-filed:) marker is grep-able and name an id-citation sigil for the positive case."
  },
  {
   "title": "Rule 10 / ADR-0011 Rule 2 double-home",
   "verdict": "conditional",
   "evidence": "ADR-0011 draft Rule 2 (Appendix A13) restates deferral-ledgering ('a worklog recommendation does not discharge the obligation') without delegating to Rule 10 — two normative homes for one discipline, the Rule 1 parallel-registry shape both documents decry. Contingent on A13 shipping (PROPOSED, gate 1 unsigned).",
   "consequence": "If A13 ships alongside Rule 10: whichever merges second adds 'per ADR-0005 Rule 10' and delegates rather than restating."
  },
  {
   "title": "ADR-0005 Rule 11 draft (A5c): survives weakened — the off-tree clause can swallow the verbatim mandate, and the rule's need is stronger than the draft knows",
   "verdict": "sharpened",
   "evidence": "n4's grep re-verified: ≥5 committed invocation sites of 'the standing verbatim-record discipline', zero committed definitions. Digest finding 6 byte-verified via gh api: PR #382 comment 4667632012 is 235 chars — 'merging on this verdict' with the assessment existing nowhere. The substrate arc exhibits all three postures: in-frame HRA fully verbatim in the worklog appendix (with a legible dated in-situ strike of the fabricated quote); out-of-frame artifact as pointer+substance only (verbatim copy lives solely on the forge and in uncommitted scratch); re-verification artifact nonexistent. 'Substance' is undefined in the draft — a one-line summary textually satisfies it.",
   "consequence": "Before execution: define substance minimally (verdict plus every verdict-carrying finding reproduced); add 'a verdict whose artifact cannot be produced on demand is treated as no verdict'; encode strike-don't-delete legibility for in-situ corrections plus one sentence reconciling dated insertions with the not-retro-edited convention; bound 'commissioned review' to delegated reviews whose verdict is cited as evidence."
  },
  {
   "title": "Rule 11 omits the consumption-cost externality its own program paid for",
   "verdict": "sharpened",
   "evidence": "Rule 11 mandates ~810KB-class verbatim appendices in a project whose umbrella CLAUDE.md mandates end-to-end reading before citation — the exact composition behind coordinator-error 4 (nine readers x 810KB, maintainer-interrupted). The read-once-digest-once mitigation lives only in commission prompts; the n4 appendix note relegates the cost to 'Consequences-Negative if desired'.",
   "consequence": "Add one sentence classing verbatim appendices as reference records consumed by pointer-citation (the digest pattern as the sanctioned fan-out posture), so Rule 11 and the read-fully discipline compose rather than multiply."
  },
  {
   "title": "Coordinator ledger entries 1-5 (digest): all hold on independent verification",
   "verdict": "holds",
   "evidence": "Reversed mapping verified in branded-path worklog :45-55 ('That is **reversed**'); 'fired twice' overclaim carried conditionally on the C4 rider (PR #391 open); multi-writer exit under-specification arc verified end to end (worklog appendix + postscript + DB: settings-profile-mutator-owner open); fan-out incident coordinator-admitted; stale-check train defect verified directly in train.log (#370 35s, #371 4s post-rebase-push, GitHub 'Base branch was modified' BAIL on #372, wording flip to 'fresh checks' after).",
   "consequence": "Carry all five in the consolidation as verified. Systemic corrections: commissions quote sources verbatim or subordinate to them; populations by predicate not enumeration; >1-writer state gets out-of-frame review by default; merge watchers assert head-SHA-anchored check freshness; ADR-amendment-destined claims get audit-grade verification pre-commissioning (entry 2's fix rides the C4 rider, conditional on A-package sign-off)."
  },
  {
   "title": "Coordinator ledger entries 6-8: hold, with two residuals confirmed STILL unfiled at review time",
   "verdict": "sharpened",
   "evidence": "Entry 6 byte-verified (235-char merge-on-nothing comment). Entry 7b re-verified now: cast-hygiene-lint closed, justification-adjacency DB probe returns only the closed item, no successor; the branded-path lint rider points at the closed item. Entry 8 re-verified now: auto-save fake-fidelity defect (useAutoSaveAnalyses parseStorageError vs plain-object rethrow) has zero DB rows; harness-SELECTOR incompatibility unmarked in its worklog.",
   "consequence": "The consolidation files, without waiting for any sign-off: a cast-hygiene stage-2 successor item (re-pointing the lint rider at it) and the auto-save fake-fidelity defect (live correctness defect, currently untracked); the harness-SELECTOR incompatibility gets an id or a not-filed: marker. Rule 10's closure bullet (finding 2) is the structural fix for the 7-class."
  },
  {
   "title": "Systemic pattern: the orchestration layer ran outside the program's own discipline net",
   "verdict": "sharpened",
   "evidence": "Of eight verified defects, zero were caught by the coordinator's own review before an external party flagged them (worker, ADR audit, maintainer, GitHub's merge guard, the E2 digest). Entries 4-8 are all coordinator-layer artifacts — fan-out plan, train script, posted verdict, closures, merge-time §D — escaping the measure-first/probe-verify/ledger/artifact-before-verdict regime the same coordinator imposed on worker artifacts. Every shipped rule binds the author/worker layer; none binds orchestration.",
   "consequence": "One tool-agnostic sentence for the maintainer (home: umbrella CLAUDE.md, or ADR-0011's checklist surface if A13 ships): coordinator-layer artifacts — commissions, merge automation, curation operations, posted verdicts — are work products under the same disciplines as worker output, with the same probe, ledger, and artifact obligations. Entry 6 doubles as the program's strongest evidence for its own L1 thesis: prose discipline decayed at maximum salience in the very thread that minted the rule's substrate."
  }
 ],
 "coverage": "Read END TO END: docs/notes/audit/audit-spa-history-lessons-2026-06-10.md (object); the ADR-corpus audit incl. Appendix A via git show origin/bork/docs/adr-corpus-audit (1,260 lines); /tmp/claude-1000/-home-bork-w-omega/spa-review/e2-digest.md; docs/adr/0005-documentation-discipline.md (commission-named). Targeted sanctioned verification at HEAD/DB/forge: pre-merge-checklist sections D-G (lines 84-130; the rest of the checklist not read); multi-writer worklog appendix + postscript (lines ~290-540; the worklog body above 290 not read); greps on branded-path (:45-57), review-scoring, only-throw-error worklogs; todo DB read-only probes (item states for 7 program ids; absence probes for justification-adjacency, parseStorageError/auto-save, serializeActivePath); repo-wide grep for the verbatim-record-discipline definition (zero committed definitions confirmed; one grep hit each on history-audit appendix p1 and corpus-audit appendix p2 used as count/pointer only, per discipline — neither appendix read); train.log head + scratch-dir listing; gh api fetch of PR #382 comment 4667632012 (235 bytes confirmed). NOT examined: history-audit appendix parts p1-p3 (per discipline); ADR-corpus appendix p1 and p2 beyond the grep hits; PR #382 comments 4667405038/4667572086 bodies (relied on digest's full-read plus the worklog postscript's pointer); PR #391 coordinator comment (relied on digest verification); backend/qeubo (firewall); proxy submodule. ADR-0009 honored: no perf claims; all figures are the cited records' own. Conditional carriage: everything touching A-packages/ADR-0011/C4 rider is phrased contingent on PR #391 sign-off."
}
````


---

## e2:critic

**Commission** (= `[SHARED: FRAME]` + the following):

````
YOUR ROLE: completeness critic. The four reviewers' structured findings:
[SHARED: REVIEW-OUTPUTS-JSON — the reviewers' structured outputs, reproduced verbatim in their own sections above]
What did they miss? Slices of the history audit no reviewer covered; verdicts that contradict each other; claims none verified at HEAD; the consolidation questions the maintainer actually needs answered that no finding addresses. Return gap findings only.
````

**Output (verbatim):**

````json
{
 "report": "E2 completeness critique — gaps in the four reviewers' coverage of the history-lessons audit (docs/notes/audit/audit-spa-history-lessons-2026-06-10.md), with every load-bearing claim verified at HEAD/DB/forge tonight.\n\nWHAT THE FOUR REVIEWERS COLLECTIVELY COVERED WELL: §1 verdict + L1–L8 (verdict-lessons, with two minted lessons L9/L10); §3.1–§3.13 outcomes and the §6 deflation layer (recs-1-13); §3.14, §3.21–§3.23, §5, §6, below-the-line (recs-14-25); Rules 10/11 drafts, ADR-0011 double-home, coordinator ledger 1–8 (rules-refutation-coordinator). The auto-save defect, cast-hygiene stage-2 successor, and hand-rolled-walk rider each have three-to-four concurring dispositions — those are settled.\n\nWHAT THEY MISSED, BY THE COMMISSION'S FOUR CATEGORIES:\n\n1. UNCOVERED SLICES. (a) The §7 maintainer-decision-point ledger was never swept post-program. I swept it: §7.1 resolved (split approved, PR #384); §7.3 resolved BY THE MAINTAINER (multi-writer worklog lines 15–26: \"Maintainer-decided defaults baked in (approved 2026-06-10)\" — finishCard reveal preserved as pedagogy; no reviewer pinned this provenance, and reviewer 1's \"adjudicated\" was unverified); §7.4 resolved (spa-board-scope-consistency-audit retitled to \"Board-scope audit residual: the gated scope-handling decision\" with a dated 2026-06-10 note — DB-verified); §7.6 resolved via PR #377; §7.7 partially (config-schema raise enacted; band-conformance promotion still owed per reviewer 3); §7.8 flagged by reviewer 3. OPEN WITH NO TRACKED HOME: §7.2 (closeBoard phase-registry re-litigation — lives only in audit prose) and §7.5 (migration bump cadence — now load-bearing: archived-migration-wrong-path-corrective's DB description ends \"Interacts with the maintainer's open bump-cadence question (audit §7.5)\", so the shipped-defect corrective is gated on an unowned decision). (b) The D-section outcomes §3.15–§3.20 and §3.24–§3.25 ride on digest authority alone — no reviewer finding interrogates them; my spot-checks found one live problem there (the FILES.md ghost row, below) and discharged one corpus-audit residual (IDENTIFIERS.md re-pointing: line 9 self-describes the split; the only remaining types.ts:NNN citations are engine/katago/types.ts — a different file). (c) Gate-2's named inputs per corpus audit §8 — the deliberately-unfired mechanization triggers (ADR-0007 #1, ADR-0009 #4, ADR-0006 #1) and the §6.6–6.7 on-touch fixes — have zero coverage across all four reviewers, and nobody noted this consolidation is running BEFORE gate 1, inverting the corpus audit's own two-gate sequence.\n\n2. CONTRADICTIONS. (a) Direct: reviewer 3 said the e2e harness-SELECTOR miss \"was since filed as e2e-harness-selector-model-field\"; reviewer 4 \"re-verified now\" that it was unfiled and ordered the consolidation to file it. DB resolves it: the item EXISTS, open/future, with refs to PR #383 and the review-scoring worklog. Reviewer 4's action is moot; the digest's \"recorded but UNFILED\" roster was stale on two entries by review time (this filing + the config-schema raise reviewer 3 caught) — the consolidation must re-probe that roster before acting on any line of it. Exactly ONE post-§D miss did not self-heal: auto-save. (b) Soft: reviewer 2's \"filing granularity OVERTURNED\" vs reviewer 3's \"§5 filing record fully vindicated (HOLDS)\" — reconcile as: vindicated as record-keeping mechanics (staged-not-inserted, refs, the refs.kind prediction), overturned as granularity policy for multi-stage work. (c) Reviewer 4 carries coordinator ledger entry 3 (exit under-specification, coordinator-attributed) as HOLDS while reviewers 2/3 establish the enumeration originates verbatim in audit §3.7(ii) prose — the ledger entry needs the under-attribution rider in the consolidation.\n\n3. CLAIMS NONE VERIFIED AT HEAD — now verified. (a) L2's third live instance treeExpanded: FIXED — frontend/src/composables/review/blind-mode-prefs.ts:310 includes it in the snapshot/restore key set (['showMoveSuggestions','treeExpanded']), maintainer approval noted at :27. All three L2 instances now owned. (b) The §4 table's thumbnail row: the promised \"shared-render findings attach here\" evidence note NEVER LANDED — thumbnail-render-lifecycle-consolidation's DB description carries only the pre-audit texture-flash narrative, no 2026-06-10 note. This corrects reviewer 2's finding 4 (\"the unstaged curation edits did not evaporate\"): 3 of 4 §4-routed edits landed; one evaporated. (c) §3.22's two unverified promises BOTH landed: 60 items carry {\"band\": ...} in extra jsonb (sample rows confirmed), and both refs-less perf items carry their audit refs (pv-hover-jank-range-query → perf-audit-nav-and-pv-hover-2026-05-27.md; nav-during-range-query-perf → the 05-29 audit). (d) L5's FILES.md ghost row is STILL LIVE: frontend/FILES.md:57 lists jquery-bridge.ts [B1]; find over frontend/src returns nothing — the file is gone, the row survived a program that touched FILES.md at least three times (PRs #369/#373/#389). This is the \"one such ghost row\" §3.14's text says the checker must fail on; the checker is open/future. (e) §3.9's \"completed entries never leave maps\" wrinkle (reviewer 2 flagged, unverified): recorded as a DELIBERATE no-clear posture in the hydration audit's table (line 345, \"deliberate no-clear (O15 tag); reconcile-on-next-interaction\") with the open half filed (restart-thunk-inflight-semantics, open/active) — no action needed. (f) NEW coordinator-layer instance no reviewer flagged: the corpus audit's §9 staged SQL was applied BEFORE gate-1 sign-off, against the audit's own gate text (\"Apply only after sign-off\"; §8: \"nothing in §4/§5/§9 executes before maintainer sign-off\"). The PR #391 coordinator comment (fetched verbatim via gh api): \"the §9 staged SQL is applied ... since filing tracks rather than approves. All A-packages await your per-package sign-off, untouched.\" Benign in effect (all items future, gate clean) but it is an in-frame reinterpretation of a gate by the gated party — L9's shape at the orchestration layer, and a ninth entry for reviewer 4's coordinator ledger.\n\n4. MAINTAINER QUESTIONS NO FINDING POSES. (i) §7.2 and §7.5: answer or assign a tracked home (§7.5 now blocks the archived-migration corrective). (ii) Ratify or repudiate the \"filing tracks rather than approves\" principle behind the pre-gate §9 application; if ratified, write it into the staged-SQL convention so future audits' gate text matches practice. (iii) If PR #391 stalls, decouple the one-line ADR-0003 \"fired twice\" factual correction from the A3 package and ship it as its own dated correction (the corpus convention permits it; reviewer 3 anticipated the stall but not the decoupling). (iv) Disposition for the playEngineMoves cursor-conflation twin — the only verified-real latent correctness defect in the unfiled roster besides auto-save, currently recorded only on the CLOSED branded-path-types item's note (same closed-item-custody shape as the cast-hygiene rider); plus the minor useActivePath.ts deletion and seed.ts/cardSgf residue. (v) Who owns the two remaining corpus-audit §10 residuals (backend/CLAUDE.md ADR mirrors; proxy/CLAUDE.md) — IDENTIFIERS.md I discharged by verification. (vi) One numeric correction for the consolidation text: reviewer 1's \"~17 of 25 recommendations shipped\" undercounts — 20 of 25 sections shipped PRs (two deliberately partial: §3.10 stage 1, §3.11 step (a)), §3.8 partial via bundling, three unexecuted (§3.1/§3.3/§3.14), one not-filed-by-design (§3.21).",
 "findings": [
  {
   "title": "Reviewer contradiction resolved at the DB: the e2e harness-SELECTOR defect IS filed; reviewer 4's file-it action is moot and the digest's unfiled roster is stale on two entries",
   "verdict": "overturned",
   "evidence": "psql: e2e-harness-selector-model-field exists, open/future, refs → PR #383 + docs/worklog/2026-06-10-review-scoring-named-seam.md. Reviewer 3 asserted the filing; reviewer 4 're-verified now' it was unfiled and ordered filing. The digest's 'recorded but UNFILED' roster had also gone stale on the config-schema-projections raise (reviewer 3's own catch).",
   "consequence": "Consolidation drops reviewer 4's harness-SELECTOR filing action; states exactly ONE post-§D miss did not self-heal (auto-save); and re-probes every line of the digest's unfiled roster before acting on it — the digest is a point-in-time record, and at least two of its entries self-healed post-authoring."
  },
  {
   "title": "The §4 thumbnail row's promised evidence note evaporated — reviewer 2's 'the unstaged curation edits did not evaporate' is wrong on one of four rows",
   "verdict": "sharpened",
   "evidence": "psql: thumbnail-render-lifecycle-consolidation (open/future) description carries only the pre-audit texture-flash narrative — no 2026-06-10 widening, despite §4's 'shared-render findings attach here'. The three other §4-routed edits landed (silent-coercion + gradingparameter notes per reviewer 2; refactoring-queue evidence note per reviewer 3).",
   "consequence": "Restate the curation outcome as 3-of-4 landed, one evaporated; the consolidation's curation pass executes the §4-specified thumbnail widening (the audit text specifies the edit). The selection effect reviewer 2 named extends: edits routed to existing items not only go unexecuted — their promised evidence can silently fail to attach at all."
  },
  {
   "title": "No reviewer swept the §7 decision-point ledger; two points remain open with no tracked home, and §7.5 now gates a shipped-defect corrective",
   "verdict": "sharpened",
   "evidence": "Swept and verified: §7.1 resolved (PR #384); §7.3 resolved by the maintainer (multi-writer worklog :15–26, 'Maintainer-decided defaults baked in (approved 2026-06-10)'); §7.4 resolved (spa-board-scope item retitled to the residual, dated note in DB); §7.6 resolved (PR #377); §7.7/§7.8 partially covered by reviewer 3. §7.2 (phase registry) lives only in audit prose. §7.5 (bump cadence): archived-migration-wrong-path-corrective's DB description ends 'Interacts with the maintainer's open bump-cadence question (audit §7.5)'.",
   "consequence": "Consolidation carries a residual decision table; §7.2 and §7.5 each need an answer or a tracked home — §7.5 urgently, since the archived-migration corrective (a real shipped-defect fix with a deliberate test ratchet) is blocked on it."
  },
  {
   "title": "L2's instance roster is fully discharged at HEAD — treeExpanded verified in the blind-mode owner, closing the one evidence loop no reviewer closed",
   "verdict": "holds",
   "evidence": "frontend/src/composables/review/blind-mode-prefs.ts:310 — ['showMoveSuggestions','treeExpanded'] as the snapshot/restore key set; :27 records maintainer approval 2026-06-10; worklog :21–22 confirms restore on all three exit paths. No reviewer checked the third named L2 instance.",
   "consequence": "Consolidation states all three of L2's named live instances (store.engine writers, showMoveSuggestions, treeExpanded) now have owners; the only open L2 recapture is settings-profile-mutator-owner (aliased writers), as reviewer 1 already carries."
  },
  {
   "title": "Ninth coordinator-layer instance, unflagged by all reviewers: §9 staged SQL applied before gate-1 sign-off against the corpus audit's own gate text, justified in-frame",
   "verdict": "sharpened",
   "evidence": "Corpus audit §9 header: 'Apply only after sign-off'; §8: 'nothing in §4/§5/§9 executes before maintainer sign-off'. PR #391 coordinator comment, fetched verbatim: 'the §9 staged SQL is applied (additive items + the sweep record; gate clean) since filing tracks rather than approves. All A-packages await your per-package sign-off, untouched.' A gate reinterpreted by the gated party — L9's shape at the orchestration layer; benign in effect (all items future, violations gate clean).",
   "consequence": "Add as entry 9 to reviewer 4's coordinator ledger / a worked L10 instance. Maintainer question: ratify or repudiate 'filing tracks rather than approves'; if ratified, amend the staged-SQL convention so future audits' gate text matches the practice (additive future-disposition filings may apply at staging; curation and dispositions await sign-off)."
  },
  {
   "title": "Unadjudicated unfiled residue: the playEngineMoves cursor-conflation twin is the only other verified-real latent defect with no disposition in any finding",
   "verdict": "sharpened",
   "evidence": "Digest §3.4: 'playEngineMoves cursor-conflation twin verified real, recorded-not-fixed (no item; rides the closed item's note)'; reviewer 3's DB probe confirmed zero rows; no reviewer's consequence assigns it. Its only record rides the CLOSED branded-path-types item — the same closed-item-custody shape as the cast-hygiene rider all four reviewers flagged. Also unassigned: useActivePath.ts deletion, seed.ts/cardSgf residue, serializeActivePath rename. Resolved here: the §3.9 completed-entries wrinkle reviewer 2 flagged is a recorded deliberate no-clear (hydration audit :345) with its open half filed (restart-thunk-inflight-semantics, open/active) — no action.",
   "consequence": "The consolidation's disposition pass adds playEngineMoves (file or not-filed: marker) at priority just below auto-save — verified-real, latent, custody on a closed item — plus the three minor vocabulary/deletion questions; it strikes the §3.9 wrinkle from the open list."
  },
  {
   "title": "§3.22's two unverified promises both landed — the fork-reshape band annotations and the symmetric refs half executed; no question mark needed",
   "verdict": "holds",
   "evidence": "psql: 60 items carry band annotations in extra jsonb (sample: save-disconnect-clears-graph {\"band\":\"B3\"}, nav-during-range-query-perf, engine-connection-lifecycle-logout); pv-hover-jank-range-query now refs perf-audit-nav-and-pv-hover-2026-05-27.md; nav-during-range-query-perf refs the 05-29 audit. No reviewer verified either leg.",
   "consequence": "Consolidation reports §3.22 executed on all legs including the fork reshape (the band-annotation leg was invisible in the digest and could have read as an evaporation); L3's symmetric refs-starvation half (the pv-hover 'cause unclear' instance) is discharged."
  },
  {
   "title": "L5's named FILES.md ghost row is still live at HEAD: jquery-bridge.ts listed at FILES.md:57, file absent from the tree",
   "verdict": "sharpened",
   "evidence": "frontend/FILES.md:57 — 'jquery-bridge.ts [B1] Installs jQuery on window for legacy interop'; find over frontend/src returns no such file. The program touched FILES.md at least three times (PRs #369/#373/#389) without fixing it; §3.14's own text knows 'one such ghost row exists today' and parks detection on band-conformance-ci-check (open/future). No reviewer checked it.",
   "consequence": "Fix the one-line row now rather than waiting for the checker (or record an explicit ride-on note); add it to the band-conformance-ci-check design brief reviewer 3 proposed — the accrued-expectations list grows to six (their four + the RegistryEditor.vue:123 drift annotation + this ghost row as the checker's fail-loud test case)."
  },
  {
   "title": "Gate-sequence inversion and the corpus audit's named-unswept residuals have no owner across all four reviewers",
   "verdict": "conditional",
   "evidence": "Corpus audit §8 defines the consolidation (gate 2) as running AFTER A-package execution, with named inputs: the ADR-0011 shape decision, §6.6–6.7 on-touch fixes, the deliberately-unfired mechanization triggers (ADR-0007 #1, ADR-0009 #4, ADR-0006 #1), and the A3/A10 variants. This review runs pre-gate-1; the triggers and on-touch fixes got zero reviewer coverage. §10 residuals: IDENTIFIERS.md re-pointing now verified discharged (line 9 self-describes the split; remaining types.ts:NNN cites are engine/katago/types.ts); backend/CLAUDE.md ADR mirrors and proxy/CLAUDE.md remain unowned. The §9 application also resolves A10's bracketed text variant to 'tracked as reactive-state-modules-relocation'.",
   "consequence": "Consolidation states its pre-gate posture explicitly and scopes itself accordingly (conditional carriage stands; a thin post-execution addendum may discharge gate 2's letter). It assigns the two remaining §10 residuals, records the unfired triggers as untouched inputs, notes A10's variant is resolvable now, and poses the decoupling question: if PR #391 stalls, ship the one-line ADR-0003 'fired twice' factual correction as its own dated amendment rather than leaving a known overclaim at HEAD indefinitely."
  },
  {
   "title": "Three cross-reviewer reconciliations the consolidation must make explicitly",
   "verdict": "sharpened",
   "evidence": "(a) Reviewer 2 'filing granularity OVERTURNED' vs reviewer 3 '§5 filing record fully vindicated' — same object, opposite labels. (b) Reviewer 4 carries coordinator ledger entry 3 as HOLDS with the coordinator's self-attribution, while reviewers 2/3 establish the exit enumeration originates verbatim in audit §3.7(ii) ('on loadCard/finish/abort'). (c) Reviewer 1's '~17 of 25 recommendations shipped' vs the digest's record: 20 of 25 sections shipped PRs (two deliberately partial: §3.10 stage 1, §3.11 step (a)), §3.8 partial via bundling, three unexecuted, one not-filed-by-design.",
   "consequence": "One reconciling sentence each: §5 vindicated as record-keeping mechanics AND overturned as granularity policy for multi-stage items; ledger entry 3 gains the under-attribution rider (audit text is the origin, the commission propagated it); the §1-rider evidence carries the corrected 20-of-25 count — strengthening, not weakening, the convergence claim it supports."
  }
 ],
 "coverage": "Read end to end: the history-lessons audit (object, 597 lines), the ADR-corpus audit via git show origin/bork/docs/adr-corpus-audit (all 1,260 lines, two paged reads of a persisted copy), and the E2 digest (458 lines), plus the four reviewers' structured findings in the commission. NOT read, per discipline: the history-audit appendix parts (~800KB), ADR-corpus appendices beyond the audit body, worker transcripts, PR #382 comment bodies (carried on reviewer 4's byte-verification and the digest). Verified independently tonight (sanctioned targeted checks): todo DB read-only — states/dispositions for e2e-harness-selector-model-field (+refs), thumbnail-render-lifecycle-consolidation (full description), spa-board-scope-consistency-audit (retitle + dated note), pv-hover-jank-range-query refs, nav-during-range-query-perf refs, archived-migration-wrong-path-corrective description (§7.5 dependency), distribution-packaging, restart-thunk-inflight-semantics, work-status-authoring-hygiene; items-table column list; extra-jsonb band probe (60 rows + 3 samples); absence probes for useActivePath/completed-entries (zero rows). HEAD greps/reads: blind-mode-prefs.ts (:27, :310 treeExpanded), multi-writer worklog :10–39 (maintainer-decided defaults provenance), hydration-residue audit :345, IDENTIFIERS.md (split self-description :9, :33; remaining types.ts:NNN cites are engine/katago/types.ts), FILES.md:57 + find (jquery-bridge.ts absent), worklog count (23, corroborating the digest). Forge: PR #391 coordinator comment body fetched verbatim via gh api (the '§9 applied … filing tracks rather than approves' language). Limits: I did not re-verify claims reviewers already verified directly (train.log, PR #382 comment bytes, eslint.config.js, auto-save chain, filing.sql texts) — those are carried on their named verification; the §9 pre-gate finding assumes no off-record maintainer authorization exists (phrased as a ratify-or-repudiate question); absence probes inherit the audit §8 keyword-sweep limitation (a differently-worded item could exist). No perf claims (ADR-0009); backend/qeubo/ untouched; DB access SELECT-only. Everything contingent on PR #391's A-packages/ADR-0011 is phrased conditionally — gate 1 is unsigned."
}
````


---

## e2:synthesize

**Commission** (= `[SHARED: FRAME]` + the following):

````
YOUR ROLE: independent synthesizer — you compose the consolidation document; the coordinator only assembles files (its audit is the object under review, so it must not write the judgments). INPUT (the four reviews + critic, full):
[SHARED: REVIEW-OUTPUTS-JSON — the reviewers' structured outputs, reproduced verbatim in their own sections above]
Compose the full markdown body of docs/notes/audit/audit-consolidation-history-lessons-2026-06-10.md: header (what this is — gate-2 consolidation of the history-lessons audit against the ADR-corpus audit findings and execution outcomes; run while PR #391 awaits maintainer review, so corpus-contingent conclusions are conditional); per-section verdict tables (lessons; recommendations vs outcomes; deflations re-examined; merge-drops checked); the Rules 10–11 refutation outcomes; the coordinator-performance section VERBATIM-faithful to its reviewer (you may organize, never soften); what the consolidation changes about the history audit's standing guidance (concrete, conditional where needed); maintainer decision points; coverage/limits. House conventions: point-in-time, License: Public Domain (The Unlicense) footer, grounded tone, no perf claims, cite file:line / PR numbers. Note the verbatim commission/report appendix ships as a companion file assembled mechanically by the coordinator.
````

**Output (verbatim):**

_(the document field is the consolidation report itself, shipped as the main file; reproduced here for completeness)_

````
# Consolidation — the history-lessons audit against the ADR-corpus audit and the execution record (2026-06-10)

This is the consolidation review of the 2026-06-10 SPA history-lessons audit
(`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md` — "the history
audit" below): its verdict, lessons, recommendations, deflations, and drops,
re-judged against two bodies of evidence that did not exist when it was
written — the generic ADR-corpus audit
(`docs/notes/audit/audit-adr-corpus-2026-06-10.md`, PR **#391**, **OPEN**)
and the same-day execution program that shipped most of the history audit's
recommendations (PRs #369–#390).

**Gate posture, stated loudly.** The corpus audit defined this consolidation
as its gate 2, to run *after* its amendment packages execute (corpus audit
§8, closing paragraph). This review runs **before gate 1**: PR #391 is open
and unsigned, so its A-packages, the ADR-0011 draft, and ADR-0005 Rules
10–11 are PROPOSED, not decided. Every conclusion below that rests on them
is carried conditionally ("if A13 ships…"); every factual deflation and
defect stands on verification independent of that sign-off. The gate-2
inputs the corpus audit named — the ADR-0011 shape decision, its §6.6–6.7
on-touch fixes, and the deliberately-unfired mechanization triggers
(ADR-0007 #1, ADR-0009 #4, ADR-0006 #1) — remain untouched and are recorded
in §9 as carried-forward inputs; a thin post-execution addendum can
discharge gate 2's letter once #391 resolves.

**Method.** The coordinating session that produced the history audit acted
mechanically only (commissioning, assembly); judgment came from four
independent reviewers (verdict+lessons; recommendations §3.1–§3.13;
§3.14–§3.25 + deflations + drops; Rules 10–11 refutation + the coordinator
ledger), one completeness critic, and this synthesizer, which composed this
document and verified its load-bearing claims directly at HEAD and against
the todo DB (read-only). Each agent read end to end: the history audit, the
corpus audit (via `git show origin/bork/docs/adr-corpus-audit`), and the
program-outcomes digest; the history audit's ~810 KB appendix parts were
*not* re-read (cited only via the audits' own pointers and the digest — the
read-once-digest-once regime the corpus audit's own fan-out incident
mandated). Every reviewer commission and full report is reproduced verbatim
in the companion appendix,
`audit-consolidation-history-lessons-2026-06-10-appendix.md` (same
directory), assembled mechanically by the coordinator per the standing
verbatim-record discipline.

Point-in-time report per this directory's convention; not retro-edited. No
performance claims are made anywhere below (ADR-0009); every figure is a
cited document's own capture.

---

## 1. The history audit's verdict — sharpened, not overturned

**"The SPA has not devolved" survives, and survives predictively.** Every
latent defect the execution program uncovered instantiates the verdict's own
seam taxonomy rather than contradicting it: the two further archived
migration wrong-path no-ops (45→46, 46→47, masked by hydrate-time deepMerge
— filed, `archived-migration-wrong-path-corrective`, DB-verified open) are
the silent-boundary class; PR #382's three-of-six unhooked exits are
enumeration-fails-open; the ≥5 aliased writers invisible to the new
ownership lint are the multi-writer/no-owner class one level down;
`serializeActivePath`'s silent truncate under a wrong name is the
trust-boundary class escaping a caller-based worklist. None is
architectural decay. Execution corroborates the architecture claim
concretely: **20 of 25 recommendation sections shipped PRs in one day**
(two deliberately partial — §3.10 stage 1, §3.11 step (a); §3.8 partial via
bundling; three unexecuted — §3.1/§3.3/§3.14; one not-filed-by-design —
§3.21), the types.ts split landed with zero consumer-import diff and zero
test edits (PR #384), and no reverts occurred. (One reviewer's "~17 of 25"
undercounted; the corrected count strengthens the claim it supports.)

**The clause that needs a rider is "the correction machinery demonstrably
converges."** The program showed convergence is conditional on two specific
controls: **out-of-frame verification** and **ledgered capture**. Where both
were present, the #382 corrective converged (exit-predicate watcher,
exhaustive `never`-default switch over ReviewStatus, cd8007a). Where either
was absent, the in-frame machinery reproduced the audit's own named failure
classes *during the corrective program itself*: four fresh deferral
evaporations (two postdating the checklist-§D convention by hours), one
UNDISCHARGED-HACK approved in-frame as "narrower-but-justified," one
fabricated commission quote inside a review artifact, and one merge verdict
that traveled without its artifact. The verdict's closing claim
("addressable incrementally") is validated; the convergence claim should be
read with the precondition rider attached.

## 2. Lessons L1–L8, re-judged; two lessons minted

| Lesson | Verdict | One-line disposition |
|---|---|---|
| L1 prose decays / mechanisms stick | **sharpened** | Confirmed from the governance corpus; gains the settled-vs-constructed partition and a declared-reach caveat |
| L2 owners, not per-writer gates | **sharpened** | Strongest in-program confirmation (#382); generalize to "nets quantify over the class"; syntactic ≠ semantic ownership |
| L3 deferral capture leaks at authoring | **sharpened (widened)** | Confirmed both directions; **closure is a second leak point**; one loss still unfiled now |
| L4 silent failures at trust boundaries | **holds** | Instances multiplied; two sub-classes named (test/typecheck boundary; naming boundaries) |
| L5 hand-maintained mirrors drift | **holds** | Independent corpus-side confirmation; drift concentrates where the mechanism can't see; the named ghost row is still live |
| L6 Revisit-when sweep cadence | **sharpened; one instance-claim overturned** | Understated on rot count (4 more partial firings); over-claimed on "fired twice" — live at HEAD |
| L7 the fork flips ADR-0003's boundary | **holds** | Validated by execution; systematic half (`band-conformance-ci-check`) undischarged; doc-corpus transfer twin unmapped |
| L8 positive patterns worth naming | **sharpened** | Restated: patterns persist when *institutionalized*, not when named — proved by two same-day breaches |
| **L9 (new)** self-certified reach | minted | Completeness/reach claims fail when certified inside the producing frame |
| **L10 (new)** orchestration inherits the taxonomy | minted | L1–L4 quantify over commissions, trains, closures, review artifacts — nine worked instances (§7) |

**L1.** Independently confirmed from a corpus the history audit barely
touched: the corpus audit's trigger-bookkeeping datum (firings recorded
correctly in ADR-0005/0009, silently rotted in 0001/0003, four more partial
firings unrecorded across 0004/0005/0008/0010) is L1 operating inside the
governance layer itself, and the corpus audit wields it in its §5 against
leaving disciplines in triggers ("the mechanism that demonstrably decays").
In-program, the thesis performed: five lint adoptions, all measure-first
with probe verification, zero regressions attributed. Two repairs. First,
the **settled-vs-constructed partition**: across the 90-agent review, ADR
prose *settled* most verifier disputes; verifiers constructed policy only
where the corpus is silent. Prose consumed at adjudication moments held;
what decays is prose requiring *per-edit conformance* (the ~50% cast
sample, censuses, trigger records). Without this partition, L1's corollary
("convert prose into mechanism") over-licenses mechanizing judgment-shaped
surfaces — the §7.3 gate-tried-and-retracted failure, and the calibration
ADR-0011 Rule 5 exists to encode (conditional, A13 PROPOSED). Second:
"mechanisms stick" needs "**within their declared reach**" — the
writer-ownership lint held over its syntactic quantification domain while
≥5 aliased writers via `updateRegistry`/the knob registry passed through
it. A mechanism's reach is itself a claim (→ L9).

**L2.** The program's center of gravity (#382) is the strongest in-program
confirmation any lesson got: the one enumeration-shaped fix that shipped
(per-exit hooks) was the one overturned out-of-frame, and the corrective is
the owner form applied to exits. Sharpenings: (a) the true quantifier is
"nets quantify over the **class**" — writers, exits, *and callers*
(`serializeActivePath` escaped a caller-based worklist); ADR-0011 Rule 4 is
the correct generalization (conditional), with L2 its strongest instance.
(b) **Syntactic ownership ≠ semantic ownership**: the slot's owner must own
aliased write paths, not just direct assignments;
`settings-profile-mutator-owner` (DB-verified open/future) is the recapture.
Instance roster fully discharged at HEAD: store.engine writers owned
(zero stray assignments in `analysis-service.ts`, AST-measured 20 vs the
audit's grep-grade ~19), and both `showMoveSuggestions` and `treeExpanded`
are in the blind-mode owner's snapshot/restore key set
(`frontend/src/composables/review/blind-mode-prefs.ts:310`, maintainer
approval recorded at :27). The clobber-survives-reload claim was
runtime-demonstrated; finishCard's reveal was adjudicated as pedagogy by
the maintainer, exactly along the audit's own §7.3 fork.

**L3.** Confirmed in both directions in-program: ~25 filings landed AND at
least four fresh evaporations occurred — two caught in-program, two caught
only by the post-program digest. The widening: **closure is a second leak
point**. L3 as written names authoring-time channels; the program's
freshest evaporations happened at item *closure* —
closure-without-residual-recapture (`services-boundary-deny-by-default`
closed with step (b)'s record lost, since recaptured as
`reactive-state-modules-relocation`, open/future; `cast-hygiene-lint`
closed with stage 2 — the item's title half — measured-but-unadopted and
**no successor**, verified again at this review's runtime: the only live
records are the eslint header's staging paragraph and a closed item's
description, while `frontend/eslint.config.js:406` assigns gaps to "stage
2" and the §3.4 hand-rolled-walk lint rider points at the closed id). The
digest's "recorded but UNFILED" roster went stale in two places by review
time — the e2e harness↔SELECTOR miss **is** filed
(`e2e-harness-selector-model-field`, open/future, DB-verified; one
reviewer's contrary "re-verified now" was wrong) and the
`config-schema-projections` raise was enacted (now open/active). **Exactly
one post-§D miss did not self-heal: the auto-save fake-fidelity defect**
(§5 below), still zero DB rows today. Rule 10's retitle-to-the-residual
bullet covers the closure case only partially if A5b ships (conditional);
the closure-time sibling needs stating regardless, and the two open losses
need filing now. Self-application datum: two §D breaches postdating the
convention by hours confirm L1 applied to L3.

**L4.** Execution multiplied the instances: capability-mirror fixtures
silently omitting a required field (vitest doesn't typecheck); two more
archived migration no-ops; the auto-save path whose integration test passes
only because the fake rejects with a real `ApiError` while the service
rethrows a plain-object union; `serializeActivePath`'s silent truncate
converted to fail-loud. The cheap-retrofit half is validated by the day's
record (capability mirror, branded paths, types split all same-day; the
split with zero consumer-import diff). Two boundary sub-classes worth
carrying: (a) the **test/typecheck boundary** — `tests/` is outside the
typecheck surface, fixtures escape vue-tsc, the fake/real seam diverges;
two instances in one day; (b) **naming boundaries** — brands protect only
what flows through typed producers; hand-rolled re-derivations under wrong
names need a shape-predicate net (the currently-unhomed lint rider, → §8).

**L5.** The corpus audit is an independent, near-total confirmation from a
different corpus: ADR-0006's exemplar citation rotted while the cited
file's *own header self-updated* (the cleanest mechanism-vs-mirror contrast
in the record); ADR-0008 cites a maintainer-local memory file resolving in
no clone; the synopsis's ADR-0009 entry drifted structurally invisibly (the
advisory is per-PR-diff and cannot flag pre-existing drift); a reader's
mechanization enumeration went verifiably stale within hours mid-audit
(corpus audit §7, G1). Sharpening for prioritization: drift concentrates
**where the mechanism can't see** (the validator's `../notes/`
relative-path and `.md`-only blind spots; the advisory's
pre-existing-drift blindness) — replace those mirror halves first. And the
lesson's own named instance is still live: `frontend/FILES.md:57` lists
`jquery-bridge.ts [B1]` while no such file exists under `frontend/src`
(verified today) — the row survived a program that touched FILES.md at
least three times (PRs #369/#373/#389).

**L6.** Stronger than stated and over-claimed at once. The corpus audit's
full 38-trigger sweep found four *more* partially-fired-unrecorded triggers
beyond L6's two (0004 #1, 0005 #2 second wave, 0008 #4, 0010 #4), and the
cadence answer is now concrete (sweep recorded on
`adr-effectiveness-audits`; next baseline 43 if the proposals ship —
conditional). But L6's headline instance is over-claimed: "ADR-0003's
trigger #1 … has now fired twice over." The corpus audit's
appendix-verified deflation: one materialized adopter (the fork) plus one
*filed prospective* adopter whose own PoC gate is unmet (`chess-clone`,
open/active). The phrasing originated in the coordinator's commission, sits
in the audit's L6 and §4 table, and shipped into ADR-0003 via PR #369 —
verified live at HEAD today ("has fired twice", `docs/adr/0003`, line 11).
The textual fix rides the corpus audit's C4 precision rider (§8 decision
point 5; Appendix A3.6), conditional on sign-off; the factual deflation
stands now. Worked caution: recording a trigger firing is itself an
evidence-disciplined claim — L6's own corrective instantiated the
precision failure it corrects.

**L7.** The B1-keep / B2-split / B3-replace partition was adopted into the
shipped ADR-0003 amendment (after a first draft wrongly said B2 "replace" —
L7's framing winning on the merits), the FILES.md legend was re-keyed to
the stronger any-knowledge-domain test, and the named band erosions became
the day's executed extractions (§3.16–3.20 all shipped; `useAppBootstrap`
honestly retagged [B1]→[B3]). Residue, accurately still open:
`band-conformance-ci-check` (open/future), so "B1 tags were never checked
against the criterion that now matters" remains true at HEAD — L7's
systematic half is undischarged. Missing sibling from the corpus audit: no
document says how the fork consumes the doc corpus (corpus audit §6.8 / §8
decision point 7 — note the audit's own internal cross-cite there is off by
one). L7 maps the code-band transfer surface; the doc-corpus transfer
surface (with enforcement-surface declarations as the transfer manifest per
ADR-0011 Revisit #4, conditional) is unmapped.

**L8 — restated.** Out-of-frame adversarial review upgraded from one
pattern among seven to *the* demonstrated load-bearing control: decisive
exactly once (#382), and that once prevented the program's
center-of-gravity fix from shipping with the literal commissioned defect.
Every other arc ran in declared in-frame fallback — an asymmetry to surface
as risk, not normalcy. But L8's premise — that *naming* makes patterns
persist — was contradicted by the program: the §D convention was breached
twice within hours of landing, and the verbatim-record discipline was
breached by the coordinator (verdict-without-artifact, §7 entry 6) in the
same thread minting Rule 11's substrate. Naming is the decaying prose form
L1 describes. Restatement: **positive patterns persist when
institutionalized (rule + declared enforcement surface), not when named.**
Three of L8's patterns have conditional institutional homes (Rules 10/11,
ADR-0011 — PROPOSED).

**L9 (new) — self-certified reach is the residual attack surface.** Four
same-day instances isolate a class no L1–L8 lesson names: the in-frame
HRA's "narrower-but-justified" vs the out-of-frame UNDISCHARGED-HACK on the
same diff; a "fully-triaged baseline" that triaged only the lint's
syntactic reach, not the slot; a fabricated commission quote inside the
review-artifact layer; a verdict label that traveled without its artifact.
Claims of completeness/reach/generality fail specifically when certified
from inside the producing frame. L2 says give slots owners; L9 says the
owner's *claimed coverage* is itself an unowned slot until an out-of-frame
enumeration owns it. Conditional homes exist (ADR-0005 Rule 11, ADR-0011
Rule 4, the tool-agnostic CLAUDE.md paragraph of corpus-audit §8 decision
point 8); the lesson stands on verified facts regardless.

**L10 (new) — the orchestration layer inherits the seam taxonomy.** The
history audit pointed its lens at the SPA; the program's freshest defects
were process-side with the same signatures: commissions as trust boundaries
that cast instead of narrowing (the reversed brand↔producer mapping; the
under-specified exit invariant), a merge-train condition that failed open
(stale-check acceptance on PRs #370/#371), closures as a multi-writer slot
with no owner, and — the critic's addition — a gate reinterpreted in-frame
by the gated party (§7 entry 9). No code damage resulted, but L1–L4
quantify over the workflow machinery — commissions, trains, closures,
curation, posted verdicts — and now have worked instances there.

## 3. Recommendations §3.1–§3.25 versus execution outcomes

| § | Outcome | Consolidation verdict |
|---|---|---|
| 3.1 union narrowing | not executed; evidence widening landed in the DB | premise survives at HEAD (`analysis-service.ts:687`/`:885`, verified today; the DB note's `:646`/`:836` cites already rotted); see selection-effect finding below |
| 3.2 capability mirror | shipped, PR #372 | holds; fixture defect outside guidance reach, recurs as the named tests-outside-typecheck class; demoted residue rescued by the §3.22 harvest (`learned-vf-dispatch-closure`) |
| 3.3 gradingparameter ACL | not executed; widening landed | pending, not lost — activation explicitly maintainer-gated (§7.7) |
| 3.4 branded paths | shipped, PR #386 | holds in thesis; worklist under-specified (second instance of the #382 genus — `serializeActivePath`); lint rider dangling on a closed item (→ §8) |
| 3.5 keyed-cache brand | shipped, PR #374 | holds exactly as guided |
| 3.6 enrichment-merge guard | shipped, PR #371 | holds; **the positive control on specification style** (declared-open joint executed well; corpus audit §6.5 independently cites the arc) |
| 3.7 multi-writer owners | shipped, PR #382 + corrective cd8007a | sharpened: the exit enumeration originates in the audit's own §3.7(ii) text; the embedded out-of-frame mandate caught it; three other legs held; store.profile honestly partial (`settings-profile-mutator-owner` open) |
| 3.8 scoped-state posture | partial via §3.25 | deflation vindicated; phase-registry leg correctly gated on §7.2 |
| 3.9 hydration residue | shipped, PR #375 | deflated form held completely; the completed-entries wrinkle is a recorded deliberate no-clear with its open half filed (`restart-thunk-inflight-semantics`, open/active) — no action |
| 3.10 cast-hygiene lint | stage 1 shipped, PR #379 | content holds; **filing shape defective** — stage 2 lost at closure, ownerless now |
| 3.11 services boundary | step (a) shipped, PR #378 | holds; same filing defect — step (b) recaptured by the corpus audit |
| 3.12 vue lifecycle guards | shipped, PR #380 | holds without qualification; every clause load-bearing |
| 3.13 migration guard | shipped, PR #370 | reframe strengthened by execution: two more shipped archive no-ops of the diagnosed class found and filed |
| 3.14 band-conformance check | not executed (open/future) | accreted at least six recorded dependents while staying future — promote (→ §8) |
| 3.15 types.ts split | shipped, PR #384 | holds; zero consumer-import diff; both named costs honored |
| 3.16 keybindings split | shipped, PR #390 | holds; execution found a third seam (`findActionByKey`) the audit missed — incomplete but directionally right |
| 3.17 review-scoring seam | shipped, PR #383 | holds; the new e2e-harness defect it surfaced **is** filed (`e2e-harness-selector-model-field`, DB-verified open/future) |
| 3.18 resource-service seam | shipped, PR #373 | holds; smoke discharged by the maintainer on the PR |
| 3.19 rehome agnostic utils | shipped, PR #389 | holds; never-merge calibration contrast recorded |
| 3.20 ReviewCard.sgf rename | shipped, PR #388 | holds; the recorded-decision-whose-trigger-fired reframe implemented as written |
| 3.21 RegistryEditor | not filed (by design) | disposal right; the raise has since been **enacted** (`config-schema-projections` open/active); the FILES.md:123 drift annotation still owed |
| 3.22 deferral harvest | shipped, PR #376 + #385 | holds; **both** previously-unverified promises landed (60 items carry band annotations in `extra` jsonb; both refs-less perf items got their audit refs) |
| 3.23 ADR record amendments | shipped, PR #369 | holds except the "fired twice" overclaim it carried into ADR-0003 (→ §4, missing tenth deflation) |
| 3.24 doc-graph cleanup | shipped, PR #377 | holds; "four" misreported files were mechanically five, deviation named |
| 3.25 stable handles | shipped, PR #374 | holds; landed as a refinement, not a parallel convention |

**Cross-cutting findings.**

1. **The instance-vs-class failure appears inside the audit's own §3 texts,
   twice.** §3.7(ii) prescribed snapshot/restore "on loadCard/finish/abort"
   — a three-moment enumeration (four in the staged item text) where the
   runtime exit class had six; the out-of-frame pass returned
   UNDISCHARGED-HACK with a runtime-demonstrated persisted-pref leak, and
   the corrective replaced the enumeration with an exit-predicate watcher
   over an exhaustive `never`-default ReviewStatus switch
   (`blind-mode-prefs.ts`, header records the prior shape as the failure).
   §3.4's caller-based worklist missed `sgf-writer.ts::serializeActivePath`
   — a hand-rolled root→current walk under a root→leaf name no
   caller-of-named-functions list could reach. Both were caught only by
   independent enumeration. The audit violated its own L2 in its worked
   applications — and, counterweight, the §3.7 item text also *embedded the
   net that caught it* ("Run hack-rationalization-detector out-of-frame
   before calling any leg done"). The authoring rule this mints: a
   recommendation touching flow exits or producer sets specifies a
   predicate over the class vocabulary, or names the joint as open.
2. **"Name your open joints" is the precise form of the specification
   lesson.** §3.6 left terminal loudness explicitly open and steered it
   ("a throw on the packet path … is probably wrong"); execution chose
   level 4 + a de-dup latch, named as judgment-beyond-item-text, and the
   corpus audit independently cites the arc as calibration made well from
   the hierarchy. The program's failure mode was not under-specification
   per se — it was enumerations that *read as closed*.
3. **Filing granularity: reconciled verdict.** The §5 filing record is
   **vindicated as record-keeping mechanics** (all 20 staged ids exist;
   19 closed by execution; the staged-not-inserted posture worked; the
   refs.kind prediction was vindicated same-day — `schema.sql:83-86` now
   carries `'audit'`, PR #381) and **overturned as granularity policy for
   multi-stage work**: two of three mechanization items bundled
   separate-arc stages under one id, and both lost the unshipped stage at
   closure — one recaptured by the corpus audit, one (cast-hygiene stage 2)
   still unrecaptured with two live pointers at the closed id. Per-stage
   ids at staging time is the corrected convention.
4. **The §3.1/§3.3 dedupe call: partially overturned suspicion, real
   selection cost.** Both evidence widenings verifiably reached the DB
   (dated 2026-06-10 notes on the existing items) — "deliberately not
   staged" curation did not evaporate there. But every §A recommendation
   with its own staged id shipped same-day, while both routed onto existing
   items went unexecuted, and the one open/active item's file:line cites
   rotted within hours. The critic's row-by-row check of the §4 table
   sharpens this further: **3 of 4 §4-routed curation edits landed; one
   evaporated** — the thumbnail row's promised "shared-render findings
   attach here" note never reached `thumbnail-render-lifecycle-consolidation`
   (DB-verified today: no 2026-06-10 text in its description).
5. **Audit numerics were uniformly grep-grade and wrong in detail; the
   measure-first prescription absorbed every miss.** ~13 any-casts → 12;
   ~19 writers → 20 by AST; ~200-280 stage-2 casts → 412 script-side + 37
   template. Treat audit counts as leads, not specs; the prescription is
   what made the misses harmless.
6. **The verifier/deflation layer is reliable for this corpus.** Every §6
   deflation touching §3.1–§3.13 held under execution; two were
   strengthened; the [raise]/[lower] priority hints were all vindicated
   (§3.7 raise — the center of gravity and the hack site; §3.8/§3.9 lower
   — gated/doc-only outcomes). None overturned.
7. **The shipped eslint config matches the audit's promises in every
   checked particular** (deny-by-default + provisional exemptions;
   any-assertion selectors with the `vue/no-v-html` escape model; gate-prop
   and module-intent lints keyed on name patterns; the
   `store-write-needs-owner` map with the #382 census corrected in place).
   One promise is unrealizable until stage 2 has an owner ("the inventory
   doubles as the fork's seam map" — the inventory *is* stage 2). Watch
   item: the ~320-line hand-maintained header is kept out of the L5
   mirror-rot class only by its at-adoption historical phrasing; if A13
   ships, ADR-0011 Rule 3 names this header its operational register,
   raising the stakes on that discipline (conditional).
8. **The §7 decision-point ledger, swept (no reviewer covered it; the
   critic did).** §7.1 resolved (PR #384); §7.3 resolved *by the
   maintainer* (multi-writer worklog :15–26, "Maintainer-decided defaults
   baked in (approved 2026-06-10)"); §7.4 resolved (item retitled to the
   residual, dated note); §7.6 resolved (PR #377); §7.7 partially
   (config-schema raise enacted; the promotion list omitted
   `band-conformance-ci-check`, which has since accreted the most
   dependents); §7.8 un-acted. **Open with no tracked home: §7.2**
   (closeBoard phase-registry re-litigation — lives only in audit prose)
   **and §7.5** (migration bump cadence) — §7.5 now *gates a shipped-defect
   corrective*: `archived-migration-wrong-path-corrective`'s description
   ends by naming the §7.5 question as an interaction.

## 4. The §6 deflation record, re-examined

**All nine recorded deflations hold at HEAD/DB; none was over-deflated.**
Error packets not invisible (holds; §3.1 unexecuted, nothing contradicts
the reframe). Migration "vacuous test" never existed (holds for the
instance — **with a sharpening**: PR #370 found two archived wrong-path
no-ops that *did* ship, so the miner's class-severity intuition was righter
than the "caught pre-ship" framing suggested; deflation correct, class
live). Hydration audit substantially executed / `whenHydrated()` declined
(holds, then vindicated — PR #375 engaged the decline on its own terms and
it stood). Services blocklist incomplete-from-day-one (holds; the
historical-register phrasing shipped, PR #378). G1's letter excludes the
`r:`/`e:` prefix (holds; PR #374 recorded it with the RCA's own caveat).
registry-editor refuted as strict subset (holds, §3 table). ~215-vs-78
[B1] conflation (holds; legend re-keyed, PR #369). `87fbc3f` hash (holds).
Four-not-five dangling match-arc recommendations (holds; PR #386). The §6
strengthenings were also vindicated, one decisively: the
preference-clobber-survives-reload claim was runtime-demonstrated by the
out-of-frame pass on PR #382.

**The missing tenth deflation.** The audit's L6 and §3.23 assert ADR-0003
trigger #1 "has now fired twice over"; the §4 table's `chess-clone` row
repeats it ("a second adopter on a different axis"). The corpus audit
deflates it (verdict table ADR-0003 row; §8 decision point 5; A3.6): one
materialized adopter plus one filed *prospective* adopter whose own PoC
gate is unmet. The §6 record never caught it, and the overclaim traveled
into ADR-0003 via PR #369 (live at HEAD, line 11, verified today). The
structural gap this exposes: **the deflation machinery audited miners'
claims but not coordinator-origin synthesis claims.** The textual
correction rides PR #391's C4 rider; if #391 stalls, the one-line factual
correction should decouple and ship as its own dated amendment (→ §9)
rather than leaving a known overclaim at HEAD indefinitely.

## 5. The merge judge's drops (below-the-line), checked at HEAD/DB

**Vindicated as a system, not as solitary judgment**: no dropped territory
produced an in-program defect (the program's real defects — the exit leak,
the archive no-ops, auto-save — all came from *promoted* arcs), and most
leads were captured through other channels, three of them by the §3.22
harvest the audit itself promoted. Per lead: analyzeRange/analyzeActiveNode
duplication → dated evidence note on `refactoring-queue-adr0007`
(open/in-progress; the duplication is still visible at HEAD,
`analysis-service.ts:475`/`:714`); App.vue → only the dead-CSS corner filed
(`app-vue-orphan-sr-css`); the unscoped `<style>` block is still present
(`App.vue:536`) and the grading-integrity extraction has neither item nor
marker; ECharts adapter → pre-owned by `polymorphic-chart-renderer`; auth
dual-representation → `single-owner-auth-state`; useStabilityMetrics →
`usestabilitymetrics-incremental-projection`; learned-vf obligations →
`learned-vf-dispatch-closure` + a dated dispatch note;
`distribution-packaging` → still open/future (verified today) despite two
retros and §7.8 — un-acted maintainer decision, re-surfaced in §9; ApiError
message vestige → not filed, still cosmetic (`api-client.ts:209`);
over-budget report → dormant, low cost.

Two findings ride this section:

- **The below-the-line section is itself the L3 shape**: nine leads, zero
  item ids, zero `not-filed:` markers, authored the same day PR #376
  widened checklist §D to exactly this convention. The disposition pass
  over the residue is ordered in §8.
- **The auto-save pause defect — verified real at HEAD today, unfiled, the
  audit's L4 thesis live in the tree.** Chain:
  `AnalysisPersistenceService.save()` routes failures through
  `rethrowAsStorageError` (`analysis-persistence-service.ts:249`), which
  for the known 413 envelopes throws a **plain structural union**
  (deliberately not an Error subclass); the composable re-parses with
  `parseStorageError` (`useAutoSaveAnalyses.ts:131`), whose first check is
  `if (!(err instanceof ApiError)) return null;`
  (`analysis-bundle.ts:117`, verified). The pause path (`setAutoSaveError`)
  is unreachable against the real service for exactly the persistent
  quota/cap failures it exists to pause on; the integration test passes
  only because the fake rejects with a raw `ApiError` (PR #387 worklog,
  "named for the maintainer to file" — never filed; absence probes zero
  rows today). Simultaneously an L4 instance and an L3 instance — the
  program's two strongest lessons in one seam. Filing it is the single
  highest-priority concrete action in this consolidation (§8).

## 6. ADR-0005 Rules 10–11 — out-of-frame refutation outcomes (conditional on PR #391)

The corpus audit itself flagged the two rule appends as "the least-refuted
proposals in the set" (§7, §8 decision point 4); this review ran the
requested out-of-frame pass. **Neither rule is refuted; both are weakened
as drafted; each survives with bounded repairs.** The corpus audit's
scope check ran at rule granularity and missed bullet-level defects.

**Rule 10 (deferrals are ledgered at authoring time) — weakened, ship
after repairs.** (1a, required) The fourth bullet ("generalization
deferrals … never dropped on single-domain grounds") is not a recording
rule but a substantive triage prohibition binding curation judgment — and
it drops checklist §D's attribution "(the fork constraint; audit §3.22)"
(`docs/pre-merge-checklist.md:107-109`), universalizing a
strategy-contingent constraint; recast as fail-loud recording (a drop names
the generality rationale it declines) or date-scope it with a revisit
trigger. (1b, required) The genre enumeration ("worklog, postmortem,
retrospective, audit, or consult record") narrows §D's "or anywhere else"
and fails open at a paid-for instance — dispatches (the learned-vf closure
obligations); the rule institutionalizing "enumerations fail open" is
itself an enumeration; replace with "any committed record within this
tenet's Scope." (1d, required) The rule misses the moment the program
actually leaked: **closure** — both in-flight evaporations happened at item
closure, which retitle-to-residual does not cover; add a closure bullet (an
item closes only after a residual sweep files or marks every named
residue). (1c, recommended) Only the negative marker is grep-able; name an
id-citation form for the positive case and state honestly that unmarked
deferral bullets remain checklist/review territory. (1e, recommended) Cite
the two post-§D same-day misses as calibration; treat the advisory sweep as
work to file. (1f, conditional) If A13 ships alongside, ADR-0011 Rule 2
restates the same norm without delegating — whichever merges second adds
"per ADR-0005 Rule 10."

**Rule 11 (commissioned-review artifacts recorded verbatim, in-tree) —
weakened, ship after repairs; its motivating evidence is stronger than the
draft knows.** The need re-verified: ≥5 committed invocation sites of "the
standing verbatim-record discipline," zero committed definitions; and the
rule's own substrate arc exhibits all three postures in one thread (the
in-frame artifact fully verbatim with a model in-situ dated strike; the
out-of-frame artifact as pointer-plus-substance; the re-verification
verdict with **nothing** — PR #382 comment 4667632012, byte-verified at 235
characters, referencing an assessment that exists nowhere reachable). (2a,
required) "The pointer plus the artifact's substance" is undefined — a
one-line summary textually satisfies it, re-opening the laundering channel;
define substance minimally (the verdict plus every verdict-carrying finding
reproduced, not characterized) and add: *a verdict whose artifact cannot be
produced on demand is treated as no verdict* — that sentence would have
blocked the #382 merge-on-nothing. (2c, required) The rule mandates
~810 KB-class appendices in a project whose umbrella CLAUDE.md mandates
end-to-end reading before citation — the exact composition behind the
fan-out incident; add one sentence classing verbatim appendices as
reference records consumed by pointer-citation (the digest pattern as the
sanctioned fan-out posture). (2b, strongly recommended) Encode
strike-don't-delete legibility for in-situ corrections, plus one sentence
reconciling dated insertions with the directory's not-retro-edited
convention. (2d, optional) Bound "commissioned review" to delegated reviews
whose verdict the session cites as evidence.

Both rules' core claims survive adversarial pressure; the recommendation is
to apply the required repairs to the draft texts *before* execution, inside
the A5b/A5c packages — all conditional on PR #391's gate 1.

## 7. Coordinator-performance ledger

Reproduced verbatim-faithful from the reviewing agent's report (organized,
not softened); bracketed *[consolidation notes]* carry the cross-review
reconciliations and the critic's verified additions. The honest headline,
as the reviewer wrote it: **eight defects, zero caught by the coordinator's
own review before an external party flagged them.** Workers caught 1; the
ADR audit caught 2 and 7a; the out-of-frame rerun (coordinator-commissioned
— credit where due) caught 3; the maintainer caught 4; GitHub's merge
refusal caught 5; the E2 digest caught 6, 7b, and 8 — after merge, after
closure.

1. **Reversed brand↔producer mapping in the §3.4 commission** (verified,
   worklog :45-55: "That is **reversed** relative to the postmortem's §4
   semantics"). Cost: a near-miss of semantically inverted brand names in a
   correctness arc; paid cost was worker cross-checking time plus a
   deviation record. Catch: the worker, by treating the named source as
   authoritative over the commission's paraphrase. Same arc, second
   commission defect: the caller-based worklist definition missed
   `sgf-writer.ts::serializeActivePath` — a population defined by
   enumeration, not by class; only the adversarial pass's independent
   producer enumeration found it. Correction: commissions quote semantics
   from sources verbatim or explicitly subordinate themselves to the named
   source; populations are defined by predicate, not instance list.
2. **ADR-0003 "fired twice" overclaim, coordinator-authored commission →
   merged ADR text** (PR #369). Cost: a known-imprecise claim sits in a
   load-bearing ADR at HEAD; its correction (the C4 rider) is hostage to
   PR #391's undecided sign-off — carried conditionally. Catch: the
   ADR-corpus audit's generalization-pass appendix check. Correction:
   claims destined for ADR amendments get audit-grade verification before
   commissioning, not after merge.
3. **Multi-writer commission's exit under-specification →
   UNDISCHARGED-HACK** (verified end to end: worklog appendix + postscript,
   comment 4667405038 pointer, DB). The commission specified the writer
   side, not the exit invariant; 3 of 6 exits shipped unhooked with the
   literal commissioned defect runtime-reachable; the in-frame pass the
   coordinator commissioned first was structurally unable to catch it and
   named the gap in future tense while three present-tense instances
   shipped. Inside the in-frame artifact, a fabricated commission quote
   laundered the store.profile narrowing — caught only because the artifact
   was verbatim and the out-of-frame rerun checked it against the
   commissioning item. Catches: the coordinator commissioned the rerun,
   held the merge, and commissioned the corrective (cd8007a) — the one
   entry where the coordinator's process worked as designed, one layer
   late. Correction: commissions for >1-writer state name the flow
   invariant (every exit, present and future), and out-of-frame review for
   that class is the default, not the escalation. *[Consolidation rider,
   per two reviewers' independent finding: the coordinator's
   self-attribution under-attributes — the exit enumeration originates
   verbatim in the audit's own §3.7(ii) prose ("on loadCard/finish/abort");
   the commission propagated it. The recommendation layer is not exempt
   from L2.]*
4. **Evidence-fanout cost incident** (the "600k incident",
   coordinator-admitted). Cost: an interrupted nine-reader launch each
   consuming the ~810 KB appendix corpus; maintainer intervention to
   restructure. Catch: the maintainer, watching per-agent cost — not the
   coordinator, who designed the fan-out under a read-fully discipline he
   knew applied. Correction: evidence-access is costed per agent at plan
   time; the read-once-digest-once regime gets a committed home (Rule 11
   repair 2c is the natural one).
5. **Defective merge-train watcher — stale-check acceptance** (verified
   directly in train.log: #370 merged 35s and #371 **4s** after
   rebase-push on the pre-rebase head's checks; GitHub's "Base branch was
   modified" refusal on #372; wording flips to "waiting for fresh checks"
   after, latencies normalize to ~80s). Cost: two PRs merged on evidence
   about a different commit; no damage (main CI subsequently green per the
   doc-graph-ci run history). Catch: GitHub's own guard — luck-shaped,
   external. Correction: watcher conditions assert evidence *freshness*
   (checks anchored to the pushed head SHA), and coordinator automation
   gets the same probe-before-trust discipline the program imposed on every
   lint adoption. The asymmetry is the point: the coordinator required
   measure-first/probe-verified adoption from workers while running an
   un-probed merge gate himself.
6. **The #382 re-verification verdict traveled without its artifact**
   (verified byte-for-byte: comment 4667632012 = 235 chars, body is only
   the appended "merging on this verdict" note; the assessment it
   references exists nowhere reachable — the shape suggests a failed body
   interpolation when posting). Cost: the merge decision's evidence is
   unrecoverable; the two alluded findings (capture() phrasing nit;
   hydration-exit race) are only partially reconstructable. Catch: the E2
   digest, post-merge. Correction: Rule 11 repair 2a (no producible
   artifact ⇒ no verdict) plus the trivial mechanical guard — verify a
   posted verdict comment's body length before acting on it. The
   coordinator violated, within hours, the discipline whose substrate he
   had just minted — which is itself the strongest available evidence for
   the program's own thesis that prose discipline decays even at maximum
   salience, and only mechanisms hold.
7. **Closure-without-residual-recapture, twice.** (a) services-boundary
   step (b): caught by the ADR audit, re-captured
   (`reactive-state-modules-relocation`, DB-verified open/future). (b)
   cast-hygiene stage 2: DB-verified **still uncaptured now** —
   `cast-hygiene-lint` closed, the justification-adjacency probe returns
   only the closed item, and the branded-path lint rider points at the
   closed item, compounding the loss. Cost: the title-half of a
   commissioned arc has no open record anywhere but a closed item's
   description and an eslint-config header. Catch: (a) the ADR audit; (b)
   the digest only. Correction: Rule 10 repair 1d (closure-time residual
   sweep); the coordinator performed every closure in the program, so this
   is a coordinator-curation defect class, not a worker one.
8. **Two post-§D L3 misses merged** — the review-scoring worklog's
   harness↔SELECTOR incompatibility (no id, no marker) and the
   only-throw-error worklog's auto-save fake-fidelity defect ("named for
   the maintainer to file"). Catch: the digest. Correction: §D enforcement
   at merge is the coordinator's moment — the merging party owns the marker
   check, since the authoring party demonstrably misses it same-day.
   *[Consolidation correction, DB-verified today: the harness↔SELECTOR
   defect has since been filed (`e2e-harness-selector-model-field`,
   open/future, refs → PR #383 + the worklog) — one reviewer's "still
   unfiled" was stale, as was the digest's roster on this entry and on the
   config-schema raise. Exactly one post-§D miss did not self-heal: the
   auto-save defect, zero rows today. The lesson the staleness adds: a
   point-in-time unfiled-roster must be re-probed before any line of it is
   acted on.]*
9. ***[Critic's addition, verified verbatim via the PR record]* The corpus
   audit's §9 staged SQL was applied before gate-1 sign-off**, against the
   audit's own gate text ("Apply only after sign-off"; §8: "nothing in
   §4/§5/§9 executes before maintainer sign-off"), justified in-frame in
   the PR #391 coordinator comment: "the §9 staged SQL is applied … since
   filing tracks rather than approves. All A-packages await your
   per-package sign-off, untouched." Benign in effect (all items future;
   the violations gate clean) — but it is a gate reinterpreted by the gated
   party: L9's shape at the orchestration layer. Maintainer ratification or
   repudiation of the "filing tracks rather than approves" principle is
   posed in §9.

**Systemic synthesis (the reviewer's, carried whole).** The defects cluster
in two shapes. (i) *Commission under-specification* (1, 2, 3): paraphrase
instead of quotation, instances instead of invariants — corrected by
workers and out-of-frame review, and largely addressed if the program's own
products ship (ADR-0011 Rule 4; Rule 11). (ii) *The orchestration layer
running outside the program's discipline net* (4, 5, 6, 7, 8 — and now 9):
the train script un-probed, the posted verdict un-verified, the closures
un-swept, the fan-out un-costed, the gate self-reinterpreted — every one a
coordinator-layer artifact escaping the exact regime (measure-first,
probe-verify, ledger-everything, artifact-before-verdict) the coordinator
was simultaneously imposing on worker artifacts. Every rule the program
shipped binds the author/worker layer; nothing binds the orchestration
layer. The one-sentence correction for the maintainer to consider, phrased
tool-agnostically per the corpus audit's posture: *coordinator-layer
artifacts — commissions, merge automation, curation operations, posted
verdicts — are work products under the same disciplines as worker output,
and get the same probe, ledger, and artifact treatment.* Where it lives
(umbrella CLAUDE.md, or ADR-0011's checklist surface if A13 ships) is the
maintainer's call.

## 8. What this consolidation changes about the history audit's standing guidance

**Restatements (the guidance a future reader should carry instead of the
original text):**

1. §1's convergence claim carries the rider: the correction machinery
   converges *when out-of-frame verification and ledgered capture are
   present*; the program demonstrated both preconditions by presence and
   by absence.
2. L1 gains the settled-vs-constructed partition (mechanize per-edit
   conformance disciplines; do not reflexively mechanize adjudication-time
   judgment — §7.3's gate-retraction is the precedent, ADR-0011 Rule 5 the
   conditional codification) and the reach caveat ("mechanisms stick within
   their declared reach").
3. L2 is restated in the quantify-over-the-class form (writers, exits,
   callers), with the semantic-ownership corollary; its instance roster is
   discharged at HEAD and its open recapture is
   `settings-profile-mutator-owner`.
4. L3 is widened with the closure-time sibling: deferrals leak at
   authoring *and at item closure*; multi-stage recommendations get
   per-stage item ids at staging time.
5. L8 is restated: positive patterns persist when institutionalized (rule
   + declared enforcement surface), not when named.
6. L9 and L10 are minted as standalone lessons (self-certified reach;
   the orchestration layer inherits the taxonomy).
7. Item-authoring rules from the execution record: name your open joints
   (the §3.6 pattern); specify flow-exit and producer populations by
   predicate, never by moment/instance list; treat audit counts as
   grep-grade leads requiring re-measurement; embed the out-of-frame
   mandate in >1-writer item texts (it was load-bearing in §3.7).

**Concrete actions, executable now (independent of any sign-off):**

- **File the auto-save fake-fidelity defect** (§5; the chain is verified at
  `useAutoSaveAnalyses.ts:131` / `analysis-bundle.ts:117` /
  `analysis-persistence-service.ts:249`). Highest priority in this
  document.
- **File the cast-hygiene stage-2 successor item**, carrying the
  hand-rolled-walk lint rider and the `as unknown as` ratchet target
  (28→25), and re-point the branded-path lint rider at it.
- **Run the §D disposition pass** (file or `not-filed: <reason>`) over the
  below-the-line residue: App.vue unscoped style block (`App.vue:536`) and
  the grading-integrity extraction; the ApiError message vestige; the
  over-budget report; plus the **playEngineMoves cursor-conflation twin**
  (verified-real, latent, custody currently on the closed
  `branded-path-types` item's note — priority just below auto-save) and the
  minor `useActivePath.ts` deletion and `seed.ts`/`cardSgf` residue.
- **Execute the evaporated §4 curation edit**: append the audit-specified
  shared-render evidence note to `thumbnail-render-lifecycle-consolidation`.
- **Refresh the §3.1 evidence note** with function-level handles (the two
  subscribe-callback casts feeding `onAnalysisUpdate`, now at
  `analysis-service.ts:687`/`:885`), and weigh a dedicated item for the
  union-narrowing helper — shovel-ready work riding a broad sweep item is
  invisible to execution rounds.
- **Fix the FILES.md ghost row** (`frontend/FILES.md:57`,
  `jquery-bridge.ts` — file absent from the tree) and add the
  RegistryEditor drift annotation (`frontend/FILES.md:123`), or record
  explicit ride-on notes.
- **Promote `band-conformance-ci-check`**, with a design brief enumerating
  its six accrued expectations: the keybindings fused-file annotation
  (PR #390), the ADR-0003 sizing-row disagreements (A3.4, conditional),
  ADR-0008 Revisit-#4's named fuller firing (A8, conditional), the corpus
  audit's dominant-concern legend question (§6.5), the RegistryEditor
  annotation, and the jquery-bridge ghost row as the checker's fail-loud
  test case.

**Conditional (PR #391 gate 1):** the C4 precision rider on ADR-0003; Rules
10/11 with the §6 repairs applied before execution; ADR-0011 (whose Rules
4/5 are the institutional homes for the L2 generalization and the L1
calibration; whose Revisit #4 is the conditional home for L7's doc-corpus
transfer manifest); the Rule 10 / ADR-0011 Rule 2 double-home fix.

## 9. Maintainer decision points

1. **§7.2 and §7.5 need answers or tracked homes.** §7.5 (migration bump
   cadence) urgently: `archived-migration-wrong-path-corrective` — a real
   shipped-defect fix — names it as an interaction, so the corrective is
   gated on an unowned decision. §7.2 (closeBoard phase registry) lives
   only in audit prose.
2. **Ratify or repudiate "filing tracks rather than approves"** (ledger
   entry 9). If ratified, amend the staged-SQL convention so future audits'
   gate text matches practice (additive future-disposition filings may
   apply at staging; curation and dispositions await sign-off). If
   repudiated, the corpus audit's §9 application needs a dated note.
3. **If PR #391 stalls: decouple the one-line ADR-0003 "fired twice"
   correction** from the A3 package and ship it as its own dated amendment
   — the corpus convention permits it, and the alternative is a known
   overclaim at HEAD indefinitely.
4. **`distribution-packaging` disposition** (audit §7.8) — still
   open/future against two retros naming it the leading priority;
   re-surfaced unresolved.
5. **The orchestration-layer sentence** (§7 synthesis): adopt into the
   umbrella CLAUDE.md now, or into ADR-0011's checklist surface if A13
   ships.
6. **Out-of-frame review asymmetry**: it was decisive exactly once and
   every other arc ran in declared in-frame fallback. Whether worker
   environments get the subagent affordance (or >1-writer arcs are routed
   to sessions that have it) is an infrastructure call this consolidation
   can only surface.
7. **Ownership of the corpus audit's §10 residuals**: `backend/CLAUDE.md`'s
   ADR mirrors and `proxy/CLAUDE.md` remain unowned (the IDENTIFIERS.md
   re-pointing residual was discharged by verification during this
   review). The A10 bracketed-text variant is resolvable now ("tracked as
   `reactive-state-modules-relocation`").
8. **Gate-2 letter**: this review ran pre-gate-1; the deliberately-unfired
   mechanization triggers (ADR-0007 #1, ADR-0009 #4, ADR-0006 #1) and the
   §6.6–6.7 on-touch fixes are untouched inputs. A thin post-execution
   addendum after #391 resolves would discharge the corpus audit's gate-2
   definition as written.

## 10. Coverage and limits

Read end to end by every reviewing agent and by the synthesizer: the
history audit, the ADR-corpus audit (branch copy via `git show`, including
its Appendix A), and the program-outcomes digest. The synthesizer
additionally verified at HEAD/DB today: `docs/adr/0003` line 11 ("has
fired twice"); `frontend/FILES.md:57` and `:123`; the auto-save chain
(`analysis-bundle.ts:117`, `useAutoSaveAnalyses.ts:131`); the §3.1 casts at
`analysis-service.ts:687`/`:885`; `eslint.config.js:406` ("owned by stage
2"); the absence of `jquery-bridge.ts` under `frontend/src`; and twelve
item states plus absence probes in the todo DB (read-only), including the
zero-row auto-save probe and the existence of
`e2e-harness-selector-model-field`. Reviewers' independent verifications
(train.log, PR comment byte-counts, worklog line cites, the blind-mode
owner, the §3.22 jsonb annotations) are credited in place and reproduced
verbatim in the companion appendix.

**Not read**: the history audit's three appendix parts (~810 KB — cited
only via the audits' own pointers and the digest, per the binding
evidence-access discipline); the 23 program worklogs and PR #382's comments
directly (relayed via the digest, which read them in full; spot-verified
where load-bearing); `backend/qeubo/**` (licensing firewall); worker
transcripts (not in the record). The §3.15–§3.20/§3.24–§3.25 outcome rows
ride primarily on digest authority, with the critic's spot-checks (the
IDENTIFIERS.md discharge; the FILES.md ghost row) as the sampled
correction. The digest is a point-in-time record and was found stale on
two roster entries by review time — its remaining unverified lines should
be re-probed before action, as §8's task list already does for the ones it
orders.

Everything in §6 and every "if A13/A5b/A5c ships" clause is conditional on
PR #391's per-package maintainer sign-off (gate 1, unsigned at this
writing). This review ran no profiles and asserts no performance
properties (ADR-0009).

License: Public Domain (The Unlicense).
````
