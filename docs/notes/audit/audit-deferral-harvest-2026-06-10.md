# Audit — deferral harvest into the work-status store (2026-06-10)

Executes work-status item `work-status-authoring-hygiene` (history-lessons
audit §3.22, lesson L3: "deferral capture leaks at authoring time"). One
bounded triage pass over the dangling-deferral lists the audit's miners
compiled — `audit-spa-history-lessons-2026-06-10-appendix-p1.md` §1:
worklog-current findings 1–5, worklog-2026-05 finding 5 (plus finding 4's
orphan-CSS row, named in the commission), worklog-2026-04 finding 1, retros
findings 1–2, postmortems finding 3 — plus the audit's below-the-line leads
named in the commission (useStabilityMetrics, learned-vf closure, auth
dual-representation, analyzeRange/analyzeActiveNode).

Each row gets one of three verdicts:

- **file** — a new `open`/`future` item, INSERTed (additive writes were
  explicitly sanctioned for this arc; `work_status_violations` gated after
  the transaction);
- **confirm-done / confirm-covered** — evidence recorded here, no DB write;
- **drop-with-record / stage** — recorded here with a date; anything that
  would mutate an *existing* row (description edits, retitles, band
  annotations, dispositions) is **staged as SQL in §5, not executed** — that
  is the maintainer's second sign-off (audit §4's curation boundary).

Point-in-time report per this directory's convention; not retro-edited.

## 1. Verification basis (ADR-0002, stated plainly)

- Read end to end this session: the main audit report
  (`audit-spa-history-lessons-2026-06-10.md`), the appendix-p1 sections
  §0 plus the seven miner sections through `harvest:git-narrative` and the
  five commissioned list-bearing miners (postmortems, retros,
  worklog-2026-05, worklog-current, worklog-2026-04), the filing SQL,
  `docs/pre-merge-checklist.md`, `docs/worklog/
  2026-05-31-perf-incremental-enriched-projection.md`,
  `docs/dispatch/proxy-to-frontend-learned-vf.md`, and the work-status
  schema.
- **Named gaps:** the remaining appendix-p1 miner sections (audits,
  adr-triggers, mech-conformance, work-status, docgraph-dispatch,
  arch-ergonomics) and appendices p2/p3 were **not** read (budget); they
  could carry further deferral signal beyond the commissioned lists. The
  postmortems, retrospectives, archived worklogs, and the RCA cited in
  rows below were **not re-read** — claims sourced from them are
  attributed relays of the appendix's miner reports, marked "(relayed)".
  Where a row's verdict depends on the current tree, I verified at HEAD
  myself (greps/reads of code and config — marked "verified at HEAD").
- The todo DB was queried read-only for collisions before every filing;
  no candidate id collided with an existing item.

## 2. Triage table

| # | Deferral | Source (per appendix §1) | Verdict | Disposition / evidence |
|---|---|---|---|---|
| 1 | Module-scope rebinding audit (pbo postmortem §7.3) | worklog-current f.1 | confirm-covered | `hydration-rebind-residue-audit` (filed by the audit) carries the residue, with refs to the postmortem and the 2026-06-03 consult. |
| 2 | `useStabilityMetrics` O(N)-per-frame "next step" | worklog-current f.2; commission lead | **file** | `usestabilitymetrics-incremental-projection`. Verified at HEAD: no accumulator/throttle machinery in the file. Re-profile-first clause in the description (rb3 lesson). |
| 3 | Match-arc recommendations: call-site audit, playEngineMoves twin/test, branded path types | worklog-current f.3 | confirm-covered | `branded-path-types` (filed by the audit) carries all three legs. |
| 4 | Match-arc §5a docstring leg | worklog-current f.3 | confirm-done | Audit §6 deflation: "the docstring leg substantially shipped" (usePlayFromPosition.ts:224-236, 566-581 per the postmortems miner). |
| 5 | Match-arc §5c rigor-proportionality rubric | worklog-current f.3; postmortems f.3 | **file** | `rigor-proportionality-rubric-adoption` (relayed; the implementer reads §5c end to end). |
| 6 | Keybindings deferred extensions (modifier / chord / mouse / mousewheel) | worklog-current f.4 | **file** | `keybindings-deferred-extensions` — the plan note has since been archived (verified at HEAD: `docs/archive/notes/design/keybindings-plan.md`), making the deferrals doubly invisible. |
| 7 | Proxy-topology revised-plan follow-ups | worklog-current f.4 | flag | Not verified by the miner or by this pass; needs one targeted check (read `2026-05-16-proxy-topology-testing.md` + the revised plan note). Not filed; maintainer question §4.5. |
| 8 | Configurable rootInfo display (lost tracking pointer) | worklog-current f.5a | **file** | `configurable-rootinfo-display`. |
| 9 | Drop `store.engine.activeMode` after confidence pass | worklog-current f.5b | stage | Lands with `multi-writer-slots-get-owners` leg (iii) (engine-connection owner); staged description append, §5.D. Verified at HEAD: `activeMode` still live (types.ts:1974; analysis-service.ts:170,399). |
| 10 | intlify missing-key warning noise (te()-guard) | worklog-current f.5c | not-filed | DX noise, no user-facing cost recorded; refile if it impedes work. |
| 11 | structuredClone-per-migration cold-start cost | worklog-current f.5c | not-filed | Perf lever without a profiled symptom (ADR-0009; rb3 lesson: re-measure before building). |
| 12 | Wire-level qeubo→pbo rename | worklog-current f.5d | **file** | `qeubo-pbo-wire-rename` (dispatch-first; or record keep-as-stable-contract). |
| 13 | perf-fix4 trio (Follow-Me throttle, pointerEvents, scheduleWindow reset) | worklog-current f.5e | not-filed | Perf levers without a re-profiled symptom; covered by the re-profile-first discipline now staged onto the two perf items (§5.A/B). |
| 14 | Paste-handler permissiveness asymmetry (LOADING/ANALYZING) | worklog-current f.5f | **file** | `review-paste-permissiveness-asymmetry`. |
| 15 | profiler-cli evaluation | worklog-current f.5g | drop-with-record | Superseded de facto by the Chrome/CDP capture harness (relayed); recorded dropped here, 2026-06-10. |
| 16 | Confirming capture for the lazyUpdate revert | worklog-current f.5h | drop-with-record | Implicitly validated by the later green batteries (relayed); recorded dropped here, 2026-06-10. No perf property asserted by this pass (ADR-0009). |
| 17 | lookup_cache caveat folded into normalization protocol | worklog-current f.5i | confirm-done | Verified at HEAD: `docs/notes/perf-capture-normalization-protocol.md:23-26` carries the caveat. |
| 18 | Deterministic doc-graph edges-array sort | worklog-current f.5j | confirm-done | Verified at HEAD: deterministic `localeCompare`/sort at `tools/doc-graph/generate.mjs:726, 949-952` at the emit sites. |
| 19 | Post-jQuery QA pass (auth/library/qEUBO/settings) | worklog-current f.5k | stage-for-drop | Proposed drop on soak evidence (no regression reports since 2026-06-01); maintainer confirms, §4.4. |
| 20 | `Model` brand for SELECTOR labels left bare | worklog-current f.5l | confirm-declined | Deliberate, recorded in the 2026-06-08 worklog (relayed); a future widening belongs to `silent-coercion-protocol-boundaries-audit` if its scope grows. |
| 21 | Card-forest persistence trio (O14 retrofit; cursor persistence; per-(board,root) keying) | worklog-current f.5m | confirm-covered / record | O-number handle hygiene → `code-comment-stable-handles`; the keying/persistence legs superseded by the board-scope arc; residual rides the `spa-board-scope-consistency-audit` maintainer question (§4.1). |
| 22 | Orphan CSS: `.tab-padding-sr` in App.vue | worklog-2026-05 f.4 (commission lead) | **file** | `app-vue-orphan-sr-css`. Verified at HEAD: defined at App.vue:624, zero consumers under `frontend/src`. |
| 23 | Easing tokens; ~50 redundant body-size declarations; chrome-literal CI lint; qEUBO-over-chrome; HorizontalTimelineVisualizer chrome sweep | worklog-2026-05 f.5 | **file** (consolidated) | `substrate-arc-deferral-residue` — one item, five enumerated legs, verify-each-against-HEAD clause. |
| 24 | useBoardGeometry consolidation (three SVG sites) | worklog-2026-05 f.5 | stage | Duplication-consolidation evidence; staged onto `refactoring-queue-adr0007` with the analyzeRange note, §5.C. |
| 25 | max_nodes / CardTreeOverflowError deeper fix (options a/b/c) | worklog-2026-05 f.5 | **file** | `cardtree-max-nodes-deeper-fix`. |
| 26 | Backend gamma-default mismatch question | worklog-2026-05 f.5 | **file** | `backend-gamma-default-mismatch`. |
| 27 | qEUBO cacheOverride parameter | worklog-2026-05 f.5 | **file** | `qeubo-cacheoverride-parameter` (verify post-PBO relevance first). |
| 28 | Macro-form persistence (context-id macro) | worklog-2026-05 f.5 | not-filed | UX polish with no recorded demand since 2026-05-06; refile on demand. This row is the grep-able record. |
| 29 | sendSync assertion upgrade to a throw | worklog-2026-04 f.1 | confirm-done (resolved differently) | Verified at HEAD: `sync-service.ts:260-278` now surfaces via `pushSystemMessage` + a documented defense-in-depth ADR-0002 posture; the loudness gap the deferral named is closed, deliberately not as a throw. |
| 30 | `unhandledrejection` backstop | worklog-2026-04 f.1 | **file** | `unhandledrejection-backstop`. Verified at HEAD: absent from `frontend/src`. |
| 31 | Backend de-branding (X-Ebisu-Token, .ebisu_secret_key, ebisu.db) | worklog-2026-04 f.1 | confirm-done | Verified at HEAD: no `X-Ebisu` hits anywhere under `backend/`; remaining `ebisu` literals are deliberate legacy-compat rename machinery with explanatory comments (`backend/main.py:38-57`, `backend/core/config.py:55-63,100`). |
| 32 | `gen:api` hardcoded host | worklog-2026-04 f.1 | **file** | `genapi-host-configurable`. Verified at HEAD: `frontend/package.json:14`. |
| 33 | Auth dual-representation (RFC-0001 Q9) | worklog-2026-04 f.3; below-the-line lead (commission) | **file** | `single-owner-auth-state`. Verified at HEAD: the callback bridge is live in `api-client.ts` (~:70-80, ~:191). |
| 34 | KeepAliveMiddleware contract revision | retros f.1 | **file** | `keepalive-contract-revision` (proxy scope; dispatch-first). |
| 35 | Phase 3.5 diverse-corpus retraining + lcb_spread asterisk | retros f.2 | **file** | `learned-vf-diverse-corpus-retraining`. The dispatch's Q3 calls it "filed as a separate data-collection arc" — it never was; this is the filing. |
| 36 | Learned-vf dispatch closure obligations | below-the-line lead (commission) | **file** | `learned-vf-dispatch-closure`. Verified at HEAD: FEATURES.md has no learned/value-binding entry; `valueBinding` i18n keys exist in `en.json` only; the dispatch still reads `Status: Open`. |
| 37 | Adaptive postmortem §5.3 wire diagnostic channel | postmortems f.3 | drop-with-record (proposed) | Plausibly superseded by proxy v1.0.20 structured logging (the umbrella CLAUDE.md names it the canonical runtime-visibility channel). Relayed + inference; maintainer confirms, §4.3. |
| 38 | Adaptive postmortem §5.4 probe script | postmortems f.3 | drop-with-record (proposed) | Same supersession rationale; maintainer confirms, §4.3. |
| 39 | RCA G2/G6 | postmortems f.3 | confirm-recorded | Deferred per the RCA's own feasibility table (relayed) — the dated record already exists; no action. |
| 40 | RCA G3 (`only-throw-error`) | postmortems f.3 | flag | Verified at HEAD: absent from `frontend/eslint.config.js`. Adopt-or-record-decline is a one-line maintainer question, §4.2; not filed to avoid pre-empting the RCA's own record. |
| 41 | analyzeRange / analyzeActiveNode ~200-line near-duplication | below-the-line lead (commission) | stage | Evidence note staged onto `refactoring-queue-adr0007`, §5.C (one-miner lead, not adversarially verified — say so in the note). |
| 42 | refs rows: `pv-hover-jank-range-query`, `many-boards-open-slowness` → 2026-05-27 perf audit | item description | already-satisfied + stage | **Deviation:** both refs rows already exist at HEAD (they predate the audit filing), so no INSERT; the "cause #1 shipped as perf-fix3, residual C.2/C.3, re-profile first" note is staged as description appends, §5.A/B. |

Generalization guard (audit §3.22): no row above is dropped on
single-domain grounds; every drop is supersession-, soak-, or
profile-discipline-based.

## 3. Filed items (executed, additive)

Seventeen new `open`/`future` items, one transaction (items + refs +
labels), executed 2026-06-10 with the `work_status_violations` gate run
afterwards (empty). New frontend items carry their ADR-0003 band call in
`extra.band` at filing (additive, per the fork reshape in §3.22); bands
for *pre-existing* items are staged in §5.E instead. The transaction as
executed:

```sql
BEGIN;

INSERT INTO items (id, title, description, state, disposition, scope, tier, extra) VALUES
('usestabilitymetrics-incremental-projection',
 'Apply the incremental-accumulator treatment to useStabilityMetrics (the named "next step", never filed)',
 $$Deferral harvested 2026-06-10 (work-status-authoring-hygiene). Source: docs/worklog/2026-05-31-perf-incremental-enriched-projection.md §Pending (read in full): the stability-panel computed (useStabilityMetrics) has the same O(N)-per-frame shape as the enriched projection, reading stabilityTrajectoryStore (identical per-key version refs + coalesced flush); "the same treatment applies and is the next step." Verified at HEAD 2026-06-10: no accumulator/throttle machinery in useStabilityMetrics.ts. The worked pattern is enriched-accumulator.ts with the patchNode-sequence ≡ rebuild equivalence test. Per ADR-0009 and the rb3-packet-receive-chunking drop lesson (~99 ms re-measured vs ~2.35 s attributed), RE-PROFILE the stability-panel cost on the current base before building; attach the capture to the PR.$$,
 'open', 'future', 'frontend', 'small', '{"band":"B3"}'),
('rigor-proportionality-rubric-adoption',
 'Fold the match postmortem §5c rigor-proportionality rubric into the pre-merge checklist',
 $$Deferral harvested 2026-06-10. Relayed via the history-lessons audit appendix (postmortems miner, finding 3): the match postmortem §5c four-axis rigor rubric "was never formalized anywhere — absent from the ADRs and the pre-merge checklist"; the miner's cheapest first move is folding it into docs/pre-merge-checklist.md as a new section, since the checklist is the surface trusted sessions already consult. Implementer reads §5c end to end before authoring (this filing relays the appendix, not the postmortem). Template-not-gate framing applies.$$,
 'open', 'future', 'umbrella', 'small', '{}'),
('keepalive-contract-revision',
 'KeepAliveMiddleware contract revision: message-level 25 s idle vs transport-level liveness (twice-declared, never filed)',
 $$Deferral harvested 2026-06-10. Relayed via the audit appendix (retros miner, finding 1): retrospective-phase3-policy-benchmark-2026-05.md and retrospective-phase3.5-learned-vf-2026-05.md both file this "for a follow-up dispatch in proxy/docs/dispatch/" — a directory that does not exist; no DB item matched; proxy keep_alive.py shows no contract change. Cross-boundary: follow the umbrella CLAUDE.md proxy arc — the first deliverable is a dispatch document, then proxy-repo work, tag, separate umbrella bump.$$,
 'open', 'future', 'proxy', 'small', '{}'),
('learned-vf-diverse-corpus-retraining',
 'Phase 3.5 diverse-corpus retraining (learned_v2) + the lcb_spread apples-to-apples re-run',
 $$Deferral harvested 2026-06-10. docs/dispatch/proxy-to-frontend-learned-vf.md (read in full) Q3 ships learned_v1 [experimental] with the era-OOD caveat and calls the diverse-corpus retraining "filed as a separate data-collection arc" producing learned_v2 — no work-status item existed; this is that filing. Relayed via the audit appendix (retros miner, finding 2): the phase-3.5 retro marked the retraining "immediate, before SPA integration"; ~/benchmark_allocation/ has nothing newer than 2026-05-18; the lcb_spread apples-to-apples asterisk is part of the residual. Versioned advertisement makes shipping learned_v2 additive (the SPA picks it up from available_value_bindings).$$,
 'open', 'future', 'proxy', 'medium', '{}'),
('learned-vf-dispatch-closure',
 'Close the learned-vf dispatch: FEATURES.md line, three missing locale key sets, consumed-status response',
 $$Deferral harvested 2026-06-10 (audit lesson L8: the reciprocal consumed-dispatch pattern was skipped on this arc). docs/dispatch/proxy-to-frontend-learned-vf.md (read in full) binds: a FEATURES.md one-line entry on the adaptive-reevaluate description (verified absent at HEAD — FEATURES.md mentions adaptive_reevaluate only as a capability gate at :153) and i18n keys analysis.adaptive.valueBinding.* (verified at HEAD: present in en.json only; ja/ko/zh-CN missing). The dispatch still reads Status: Open though the feature shipped — the consumed/closure response is owed. Coordinate with typed-capability-metadata-mirror, whose description also notes the status edit; it lands once.$$,
 'open', 'future', 'umbrella', 'small', '{}'),
('single-owner-auth-state',
 'Single-owner auth state: retire the api-client → useAuth callback bridge (RFC-0001 Q9)',
 $$Deferral harvested 2026-06-10. Relayed via the audit appendix (worklog-2026-04 miner, finding 3) + the audit's below-the-line lead: api-client's JWT lifecycle and useAuth.state are two physical representations of one nominal auth state, bridged by the onTokenInvalidated callback; the structural fix was parked as RFC-0001 open question 9 (RFC still Draft per the miner). Verified at HEAD 2026-06-10: the bridge is live (api-client.ts ~:70-80 callback registration, ~:191 auth-endpoint skip). Shape per the miner: api-client throws on 401 and never mutates auth-visible state; useAuth owns all transitions. This is >1-writer state — run the out-of-frame writer-enumeration review before calling it done (audit L2).$$,
 'open', 'future', 'frontend', 'medium', '{"band":"B1"}'),
('unhandledrejection-backstop',
 'window unhandledrejection backstop (root-error-boundary deferral, 2026-04-27)',
 $$Deferral harvested 2026-06-10. Relayed via the audit appendix (worklog-2026-04 miner, finding 1): the root-error-boundary worklog deferred an unhandledrejection listener as worth doing eventually. Verified at HEAD 2026-06-10: no unhandledrejection handler anywhere under frontend/src. ADR-0002: an unhandled async rejection today reaches only the console — invisible to the user. Wire to the existing system-message surface at app root, mirroring the error-boundary's posture.$$,
 'open', 'future', 'frontend', 'small', '{"band":"B1"}'),
('genapi-host-configurable',
 'gen:api hardcodes http://127.0.0.1:8764 (worked around manually twice, never filed)',
 $$Deferral harvested 2026-06-10. Relayed via the audit appendix (worklog-2026-04 miner, finding 1): the codegen host was worked around manually in two separate pre-v1.0 worklogs and never fixed or filed. Verified at HEAD 2026-06-10: frontend/package.json:14. Make the host an env-var (current value as default) so codegen runs against any deployment.$$,
 'open', 'future', 'frontend', 'small', '{"band":"B1"}'),
('app-vue-orphan-sr-css',
 'Sweep App.vue dead SR-tab CSS (.tab-padding-sr, zero consumers since the cards-tab merge)',
 $$Deferral harvested 2026-06-10. Source: the cards-tab-merge PR2 worklog deferred sweeping the dead SR-tab CSS ("a small follow-up PR can sweep them"); flagged dangling by the audit appendix (worklog-2026-05 miner, finding 4). Verified at HEAD 2026-06-10: .tab-padding-sr defined at frontend/src/App.vue:624 with zero consumers under frontend/src. Caution from the audit's below-the-line list: App.vue's unscoped style block acts as a global stylesheet for several components — verify each candidate selector's consumer set before deleting; that cross-component reach is exactly the bug shape the unscoped block invites.$$,
 'open', 'future', 'frontend', 'small', '{"band":"B2"}'),
('substrate-arc-deferral-residue',
 'Theme-substrate arc deferral residue: easing tokens, body-size redundancy, chrome-literal lint, timeline chrome sweep, qEUBO-over-chrome',
 $$Deferral harvested 2026-06-10, consolidated from the audit appendix (worklog-2026-05 miner, finding 5; relayed — current state unverified): (a) easing tokens (2026-05-03-duration-tokens.md "What's not done"); (b) ~50 redundant body-size declarations (2026-05-03-font-size-scale.md); (c) the optional chrome-literal CI lint and qEUBO-over-chrome question (2026-05-02-theme-substrate-a4.md "What's deferred"); (d) HorizontalTimelineVisualizer chrome sweep (2026-05-02-timeline-gradient-fix.md). Verify each leg against HEAD before working — the later timing/theme consolidations may have absorbed some. The recorded sweep recipe (inventory → snap-rule table → transient script → straggler carve-out → grep verification) is the low-risk path.$$,
 'open', 'future', 'frontend', 'small', '{"band":"B1"}'),
('cardtree-max-nodes-deeper-fix',
 'CardTree max_nodes / CardTreeOverflowError deeper fix (options a/b/c from the cards-tab merge)',
 $$Deferral harvested 2026-06-10. Relayed via the audit appendix (worklog-2026-05 miner, finding 5): 2026-05-06-cards-tab-merge-pr3-bugfixes.md records deeper fix options a/b/c for the tree-fetch cap beyond the shipped guard. Read that worklog end to end before scoping and verify the cap's current shape at HEAD.$$,
 'open', 'future', 'frontend', 'small', '{"band":"B2"}'),
('backend-gamma-default-mismatch',
 'Backend vs frontend gamma-default mismatch question (mint-card arc, 2026-05-04)',
 $$Deferral harvested 2026-06-10. Relayed via the audit appendix (worklog-2026-05 miner, finding 5): the mint-card-gamma worklog left a backend-vs-frontend gamma default mismatch as an open question. One bounded check: compare the backend default against the SPA minting default at HEAD; reconcile, or record the asymmetry as deliberate with a dated note.$$,
 'open', 'future', 'both', 'small', '{}'),
('qeubo-cacheoverride-parameter',
 'qEUBO cacheOverride parameter (cache-control-registry deferral, 2026-05-04)',
 $$Deferral harvested 2026-06-10. Relayed via the audit appendix (worklog-2026-05 miner, finding 5): the cache-control-registry worklog deferred a qEUBO-side cacheOverride parameter. Verify relevance at HEAD before working (the qEUBO→PBO rename and knob-registry absorption may have changed the surface); if obsolete, close dropped with a dated record.$$,
 'open', 'future', 'frontend', 'small', '{"band":"B1"}'),
('qeubo-pbo-wire-rename',
 'Wire-level qeubo → pbo rename (dispatch-first), or record keep-as-stable-contract',
 $$Deferral harvested 2026-06-10. Relayed via the audit appendix (worklog-current miner, finding 5d): the UI-level qeubo→pbo rename shipped (2026-05-17-pbo-popover-and-rename.md); the wire/backend vocabulary still reads qeubo, and the worklog says the wire rename "would land via a dispatch" — which was never filed. Two honest outcomes: a frontend↔backend dispatch pair executing the rename, or a recorded decision that the wire name is a stable contract kept as-is. Either way the half-state ends.$$,
 'open', 'future', 'both', 'small', '{}'),
('review-paste-permissiveness-asymmetry',
 'Paste-handler permissiveness asymmetry during review LOADING/ANALYZING',
 $$Deferral harvested 2026-06-10. Relayed via the audit appendix (worklog-current miner, finding 5f): 2026-05-27-review-intermission-move-block.md tightened interactive move entry during LOADING/ANALYZING but left the paste handler more permissive. Verify at HEAD; if the asymmetry stands, align the paste path with the same state gate (same failure shape, different entry point — substitution-test reasoning).$$,
 'open', 'future', 'frontend', 'small', '{"band":"B2"}'),
('configurable-rootinfo-display',
 'Configurable rootInfo-capture display (toolbar-rootinfo-slim deferral whose tracking pointer was lost)',
 $$Deferral harvested 2026-06-10. Relayed via the audit appendix (worklog-current miner, finding 5a): 2026-05-15-toolbar-rootinfo-slim.md deferred a configurable display of captured rootInfo fields; its tracking pointer (todo_local item 6) was later rewritten out from under it. Filed so the pointer loss does not recur; held as future UX until demand.$$,
 'open', 'future', 'frontend', 'small', '{"band":"B3"}'),
('keybindings-deferred-extensions',
 'Keybindings deferred extensions: modifier support, chord bindings, mouse-binding overrides, mousewheel-action audit',
 $$Deferral harvested 2026-06-10. Relayed via the audit appendix (worklog-current miner, finding 4): the four deferred keybindings items live only in the keybindings plan note — which has since been archived (verified at HEAD: docs/archive/notes/design/keybindings-plan.md), so the deferrals are doubly invisible to the store. Filed as one umbrella item; split on demand. Sequencing note: keybindings-substrate-catalog-split is the structural prerequisite worth landing first if any extension proceeds.$$,
 'open', 'future', 'frontend', 'small', '{"band":"B1"}');

INSERT INTO refs (item_id, kind, target) VALUES
('usestabilitymetrics-incremental-projection', 'worklog', 'docs/worklog/2026-05-31-perf-incremental-enriched-projection.md'),
('rigor-proportionality-rubric-adoption', 'design-note', 'docs/notes/postmortem/postmortem-match-pre-existing-variation-2026-05.md'),
('keepalive-contract-revision', 'design-note', 'docs/notes/retrospective/retrospective-phase3-policy-benchmark-2026-05.md'),
('keepalive-contract-revision', 'design-note', 'docs/notes/retrospective/retrospective-phase3.5-learned-vf-2026-05.md'),
('learned-vf-diverse-corpus-retraining', 'dispatch', 'docs/dispatch/proxy-to-frontend-learned-vf.md'),
('learned-vf-diverse-corpus-retraining', 'design-note', 'docs/notes/retrospective/retrospective-phase3.5-learned-vf-2026-05.md'),
('learned-vf-dispatch-closure', 'dispatch', 'docs/dispatch/proxy-to-frontend-learned-vf.md'),
('single-owner-auth-state', 'design-note', 'docs/rfcs/0001-adr-meta-review.md'),
('single-owner-auth-state', 'worklog', 'docs/archive/worklog/2026-04-pre-v1.0/2026-04-27-todo-28-jwt-401-retry.md'),
('unhandledrejection-backstop', 'worklog', 'docs/archive/worklog/2026-04-pre-v1.0/2026-04-27-root-error-boundary.md'),
('genapi-host-configurable', 'source', 'frontend/package.json:14'),
('app-vue-orphan-sr-css', 'worklog', 'docs/archive/worklog/2026-05-v1.0-to-v1.1/2026-05-06-cards-tab-merge-pr2-tab-restructure.md'),
('app-vue-orphan-sr-css', 'source', 'frontend/src/App.vue'),
('substrate-arc-deferral-residue', 'worklog', 'docs/archive/worklog/2026-05-v1.0-to-v1.1/2026-05-03-duration-tokens.md'),
('substrate-arc-deferral-residue', 'worklog', 'docs/archive/worklog/2026-05-v1.0-to-v1.1/2026-05-03-font-size-scale.md'),
('substrate-arc-deferral-residue', 'worklog', 'docs/archive/worklog/2026-05-v1.0-to-v1.1/2026-05-02-theme-substrate-a4.md'),
('substrate-arc-deferral-residue', 'worklog', 'docs/archive/worklog/2026-05-v1.0-to-v1.1/2026-05-02-timeline-gradient-fix.md'),
('cardtree-max-nodes-deeper-fix', 'worklog', 'docs/archive/worklog/2026-05-v1.0-to-v1.1/2026-05-06-cards-tab-merge-pr3-bugfixes.md'),
('backend-gamma-default-mismatch', 'worklog', 'docs/archive/worklog/2026-05-v1.0-to-v1.1/2026-05-04-mint-card-gamma-control.md'),
('qeubo-cacheoverride-parameter', 'worklog', 'docs/archive/worklog/2026-05-v1.0-to-v1.1/2026-05-04-cache-control-registry.md'),
('qeubo-pbo-wire-rename', 'worklog', 'docs/worklog/2026-05-17-pbo-popover-and-rename.md'),
('review-paste-permissiveness-asymmetry', 'worklog', 'docs/worklog/2026-05-27-review-intermission-move-block.md'),
('configurable-rootinfo-display', 'worklog', 'docs/worklog/2026-05-15-toolbar-rootinfo-slim.md'),
('keybindings-deferred-extensions', 'design-note', 'docs/archive/notes/design/keybindings-plan.md'),
('keybindings-deferred-extensions', 'worklog', 'docs/worklog/2026-05-27-keybindings-phase5-tests.md');

INSERT INTO refs (item_id, kind, target)
SELECT id, 'design-note', 'docs/notes/audit/audit-deferral-harvest-2026-06-10.md'
FROM items WHERE id IN (
 'usestabilitymetrics-incremental-projection','rigor-proportionality-rubric-adoption',
 'keepalive-contract-revision','learned-vf-diverse-corpus-retraining','learned-vf-dispatch-closure',
 'single-owner-auth-state','unhandledrejection-backstop','genapi-host-configurable',
 'app-vue-orphan-sr-css','substrate-arc-deferral-residue','cardtree-max-nodes-deeper-fix',
 'backend-gamma-default-mismatch','qeubo-cacheoverride-parameter','qeubo-pbo-wire-rename',
 'review-paste-permissiveness-asymmetry','configurable-rootinfo-display','keybindings-deferred-extensions');

INSERT INTO labels (item_id, label) VALUES
('usestabilitymetrics-incremental-projection', 'performance'),
('usestabilitymetrics-incremental-projection', 'refactor'),
('rigor-proportionality-rubric-adoption', 'docs'),
('keepalive-contract-revision', 'refactor'),
('learned-vf-diverse-corpus-retraining', 'investigation'),
('learned-vf-dispatch-closure', 'docs'),
('single-owner-auth-state', 'refactor'),
('single-owner-auth-state', 'architectural-cruft'),
('unhandledrejection-backstop', 'bug'),
('genapi-host-configurable', 'tooling'),
('app-vue-orphan-sr-css', 'refactor'),
('substrate-arc-deferral-residue', 'refactor'),
('cardtree-max-nodes-deeper-fix', 'ux'),
('backend-gamma-default-mismatch', 'investigation'),
('qeubo-cacheoverride-parameter', 'feature'),
('qeubo-pbo-wire-rename', 'refactor'),
('review-paste-permissiveness-asymmetry', 'bug'),
('configurable-rootinfo-display', 'ux'),
('keybindings-deferred-extensions', 'feature');

COMMIT;
```

The `refs.kind` vocabulary wrinkle from the audit's §5 recurs here:
audit/harvest docs are filed under `design-note` per the existing
precedent; if audits keep anchoring items, the enum deserves an `audit`
value (flagged, not absorbed — ADR-0002 Rule 7).

## 4. Maintainer questions

1. **`spa-board-scope-consistency-audit` residual** (audit §7.4 / §4,
   surfaced per this item's description): the audit deliverable shipped;
   the open residual is the gated scope-handling decision. Close, or
   narrow the description to the decision leg? Optional SQL for either
   outcome is in §5.F.
2. **RCA G3 (`@typescript-eslint/only-throw-error`)** — verified absent
   from `frontend/eslint.config.js` at HEAD. Adopt (measure-first per the
   `a75814c` pattern) or record-decline in the RCA's table vicinity?
3. **Adaptive postmortem §5.3 diagnostic channel / §5.4 probe script** —
   proposed drop-with-record as superseded by proxy v1.0.20 structured
   logging. Confirm (the inference relays the appendix + the umbrella
   CLAUDE.md; the postmortem was not re-read by this pass).
4. **Post-jQuery QA pass** — proposed drop on soak evidence. Confirm.
5. **Proxy-topology revised-plan follow-ups** — one targeted check needed
   (nobody has verified whether the two follow-ups were actioned).

## 5. Staged SQL — existing-row edits (second sign-off; NOT executed)

Everything below mutates existing rows and is deliberately not run.
Apply with `psql -h 192.168.122.1 -d todo -v ON_ERROR_STOP=1` after
review, then gate: `SELECT * FROM work_status_violations;` (empty ⇒
clean).

```sql
-- §5.A pv-hover residual note (item description's "noting" clause; the
-- refs row to the 05-27 audit already exists, so only the note remained).
UPDATE items SET description = description ||
 $$ [2026-06-10 deferral harvest: the 2026-05-27 perf audit (refs row) enumerated causes; cause #1 shipped as perf-fix3 (docs/worklog/2026-05-27-perf-fix3-pv-hover-watch-guard.md), so the residual is causes C.2/C.3. Re-profile the symptom on the current base before building any lever — the dropped rb3-packet-receive-chunking item records why: ~99 ms re-measured vs ~2.35 s attributed.]$$
 WHERE id = 'pv-hover-jank-range-query';

-- §5.B many-boards re-profile-first note (same discipline, same audit).
UPDATE items SET description = description ||
 $$ [2026-06-10 deferral harvest: diagnosis context lives in the 2026-05-27 perf audit (refs row). Re-profile the symptom on the current base before building any lever (rb3 lesson: ~99 ms re-measured vs ~2.35 s attributed).]$$
 WHERE id = 'many-boards-open-slowness';

-- §5.C refactoring-queue evidence note (one-miner leads, flagged as such).
UPDATE items SET description = description ||
 $$ [2026-06-10 deferral harvest, evidence notes — one-miner leads, not adversarially verified: (a) analyzeRange/analyzeActiveNode carry a ~200-line near-duplication with an untested clamp divergence (partially addressed by multi-writer-slots-get-owners leg iii); (b) useBoardGeometry consolidation across three SVG sites was deferred in the 2026-05-03 board-label-band/geometry-ratios worklogs and never filed.]$$
 WHERE id = 'refactoring-queue-adr0007';

-- §5.D multi-writer owner: fold the activeMode deferral into leg (iii).
UPDATE items SET description = description ||
 $$ [2026-06-10 deferral harvest: the 2026-05-16-per-board-multi-query.md deferral — drop store.engine.activeMode after a confidence pass — lands with leg (iii), the engine-connection owner extraction; activeMode is still live at types.ts:1974 / analysis-service.ts:170,399.]$$
 WHERE id = 'multi-writer-slots-get-owners';

-- §5.E band annotations for the 47 pre-existing open frontend items
-- (fork reshape, audit §3.22). Title-level calls by the harvest session;
-- correct freely at sign-off. B? = call not derivable from the item text.
UPDATE items SET extra = extra || '{"band":"B3"}' WHERE id IN
 ('automatic-mistake-discovery','engine-connection-lifecycle-logout','inline-analysis-config-editing',
  'mistake-finder-unpunished-brittleness','nav-during-range-query-perf','policy-head-overlay',
  'pv-animation-defaults-calibration','pv-hover-jank-range-query','pv-manual-scroll-stepping',
  'pv-overlay-typography-calibration','review-scoring-named-seam','save-disconnect-clears-graph',
  'stability-surface-distribution-metric','typed-capability-metadata-mirror','whos-ahead-drill');
UPDATE items SET extra = extra || '{"band":"B2"}' WHERE id IN
 ('board-close-minimize-restore','branded-path-types','card-editor','card-metadata-during-review',
  'i18n-string-sweep','responsive-design-deferred','reviewcard-canonical-content-rename');
UPDATE items SET extra = extra || '{"band":"B1"}' WHERE id IN
 ('band-conformance-ci-check','cast-hygiene-lint','code-comment-stable-handles','config-schema-projections',
  'enrichment-merge-null-validation','item-27-etag-multitab','kde-boundary-bias',
  'keyed-cache-brand-at-construction','migration-leaf-assertion-and-composition-test',
  'offload-layout-to-libraries','polymorphic-chart-renderer','rehome-agnostic-utils-engine-util',
  'services-boundary-deny-by-default','syncservice-suspend-resume','vue-lifecycle-footgun-guards');
UPDATE items SET extra = extra || '{"band":"B1/B3"}' WHERE id IN
 ('keybindings-substrate-catalog-split','resource-service-calibration-seam');
UPDATE items SET extra = extra || '{"band":"B2/B3"}' WHERE id = 'multi-writer-slots-get-owners';
UPDATE items SET extra = extra || '{"band":"B?"}' WHERE id IN
 ('hydration-rebind-residue-audit','many-boards-open-slowness','perceptual-event-projection',
  'refactoring-queue-adr0007','semantic-clarity-refactors-effect-typing',
  'spa-board-scope-consistency-audit','thumbnail-render-lifecycle-consolidation');

-- §5.F spa-board-scope-consistency-audit (§4.1) — pick ONE on decision:
-- (close)
-- UPDATE items SET state='closed', resolution='shipped', closed_on='2026-06-10',
--   disposition=NULL WHERE id='spa-board-scope-consistency-audit';
-- (narrow to the residual; retitle-to-residual convention)
-- UPDATE items SET title='Board-scope audit residual: the gated scope-handling decision',
--   description = description || ' [2026-06-10: audit deliverable shipped; this item now carries only the gated scope-handling decision leg.]'
--   WHERE id='spa-board-scope-consistency-audit';
```

## 6. Convention codified

`docs/pre-merge-checklist.md` §D now carries the deferral-capture
convention (same PR as this note):

- every deferral / out-of-scope / postmortem-recommendation bullet ends
  with a work-status item id **or** a grep-able `not-filed: <reason>`
  marker;
- an item filed near a diagnosis document gets its refs row at filing
  time, not later;
- on next touch, an open item whose work has partially shipped is
  retitled to its residual;
- a deferral whose rationale is generalization is never dropped on
  single-domain grounds (fork constraint, audit §3.22).

Worklogs are point-in-time documents, so the convention applies from
today forward; the historical corpus is covered by this harvest rather
than by retro-editing.

License: Public Domain (The Unlicense).
