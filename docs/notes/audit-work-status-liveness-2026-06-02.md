# Audit — Work-status SSOT liveness (`docs/work-status.json`), 2026-06-02

Independent liveness audit (Opus 4.8, background agent), requested by the
maintainer immediately after the full migration of the work-status corpus.
The migration was deliberately faithful — each item's status transcribed as
the prose source docs *asserted* it, **not** validated against reality — so
this audit is that validation: it checks each of the 59 items' asserted status
against ground truth (git, the filesystem, the code, merged PRs) and surfaces
drift. The maintainer named two suspects up front
(`single-cte-per-pipeline-run`; `classification-discipline-tenet-rule7-relocation`);
both are confirmed drifted.

Read-only by construction: the audit ran against the main tree while an
unrelated worktree task proceeded, modified nothing, and produces **candidates
for status correction — the maintainer decides** (it does not auto-correct).
The agent's verbatim report follows; HTML entities in the original output are
rendered (`<`/`>`), and the agent's "now compiling" preamble is omitted. Saved
verbatim for auditability per the consult-record convention. License: Public
Domain (The Unlicense).

---

# Liveness Audit: `docs/work-status.json` (59 items)

## 1. Bottom-line

**Verdict counts:** 56 `consistent` · 2 `likely-drifted` · 1 `uncertain`

**Headline drifts (both are the maintainer's own named suspects, both confirmed):**

1. **`single-cte-per-pipeline-run` (legacy 30c) — OPEN but already SHIPPED.** *[likely-drifted, high confidence]* The single-CTE consolidation is present in the current main tree. This is the exact "shipped but documented open" signature the SSOT was built to catch.
2. **`classification-discipline-tenet-rule7-relocation` — OPEN but DISCHARGED by ADR-0008.** *[likely-drifted, high confidence]* ADR-0008 ("Classification Discipline", dated 2026-05-17) exists and explicitly does what the item asks; ADR-0002 records the Rule 7 disposition as resolved on 2026-05-17.
3. **`consolidate-recursive-cte` (legacy 30d) — OPEN, PARTIALLY shipped.** *[uncertain]* The production call sites were consolidated (`_recursive_descent_cte`, explicitly tagged "Item 30d"); two named legacy/test-only sites remain. Genuinely-open residual exists, so this is not a clean drift — flagged for the maintainer's judgment.

All 15 closed items verify against ground truth (10 PRs all MERGED, all worklogs/notes exist, described capabilities present in code). The only closed-item blemish is a **ref-quality** issue (two unresolvable `commit`-kind targets), not a status drift.

---

## 2. Per-item findings

Format: `id | asserted | verdict | confidence | evidence`. Method-tags: **[V]** = verified by a command I ran; **[I]** = inferred.

### The drifted / uncertain items (detailed)

**`single-cte-per-pipeline-run`** (legacy 30c) | asserted: open/active | **likely-drifted** | **high**
- **[V]** `backend/domain/pipeline.py:236-246` calls `self.lineage_repo.fetch_selection(selection, context_ids, ...)` once for the whole list, with the comment *"Item 30c: a single call covering all context ids. The repository executes one CTE; the per-context loop that lived here pre-30c is gone."*
- **[V]** `backend/repositories/lineage_repository.py:118-121` — `fetch_selection` builds ONE CTE via `_build_selection_cte(selection, context_ids, ...)` (no loop); `_build_selection_cte` (line 506) carries *"Item 30c: takes List[int]"* and generalizes each base predicate from `== context_id` to `.in_(context_ids)`.
- The asserted dependency framing ("do 30d first, then this is a one-liner") is itself stale: 30c shipped without 30d being fully done.
- **False-positive risk:** low. The capability is named, commented as 30c, and structurally present. Squash-to-`initial` collapses git history, so I cannot date the landing — but the code state is unambiguous. **Recommend: close, resolution `shipped`.** (Maintainer must supply a ship ref — a worklog/commit — since the schema requires one for `shipped`.)

**`classification-discipline-tenet-rule7-relocation`** | asserted: open/future | **likely-drifted** | **high**
- **[V]** `docs/adr/0008-classification-discipline.md` exists (Status: Accepted, Date 2026-05-17), titled "Classification Discipline," articulating the principle as its own tenet with positive + negative registers + substitution-test severity calibration.
- **[V]** ADR-0008 §Related and `docs/adr/0002-fail-loudly.md:257-269` ("**Provisional-home flag retired 2026-05-17.**") record the resolution: the "standalone ADR" option was taken; Rule 7 *stays* in ADR-0002 as the fail-loudly-register instance while ADR-0008 hosts the broader principle.
- **Nuance / false-positive risk:** the item literally asks to "relocate ADR-0002 Rule 7 there." The maintainer's resolution deliberately did NOT physically move Rule 7 — it left it in place and retired the provisional-home flag. So the *spirit* is fully discharged (the tenet now has its own home) but the *literal "relocate"* was consciously declined. This is a real status drift (the work this item tracks is done/decided), but the maintainer may want resolution `superseded` rather than `shipped`. **Recommend: close, resolution `superseded` (superseded_by would need an ADR-0008 item id, or use `shipped` with the ADR ref).**

**`consolidate-recursive-cte`** (legacy 30d) | asserted: open/active | **uncertain** | **medium**
- **[V]** A 30d-style consolidation HAS partially landed: `backend/repositories/lineage_repository.py:427` `_recursive_descent_cte` is commented *"Item 30d: extracted from three places that previously inlined this skeleton (DescendantSelection, SubtreeSelection, fetch_lineage)."* The item's first three named sites are effectively unified in production.
- **[V]** BUT: the helper is named `_recursive_descent_cte`, not the item's proposed `_build_lineage_cte`; and the two remaining named sites are **dead/legacy**: `backend/domain/tree_queries.py` (`get_lineage_cte`) is imported by nothing (`grep` shows only self-reference), and `backend/domain/tree_dsl.py` (`SubtreeSelection.to_cte`) is imported only by a test (`tests/integration/test_cte_lineage.py`), not production.
- **[V]** The item's cited paths (`tree_engine.fetch_lineage`, `tree_engine.build_selection_cte`) are stale: `backend/domain/tree_engine.py:4-7` says those two functions "moved to `repositories/lineage_repository.py`" (Item 32a).
- **False-positive risk** (claiming done when it isn't): real. The "close the hole where a bug-fix to one variant never propagates" goal is only met for the live path; `tree_queries.py`/`tree_dsl.py` still hold un-consolidated recursive CTEs. **The honest read: production is consolidated; two dead/test-only duplicates persist.** I cannot settle whether the maintainer considers those in-scope. **Recommend: leave open OR narrow the description to the dead-code residual — maintainer's call.**

### The ref-quality note (closed items, not a status drift)

**`loadaction-type-dishonest`** and **`silent-guard-handleloadcard`** | asserted: closed/shipped | **consistent (capability) / flagged (ref)** | **high**
- **[V]** Capabilities present: `ConfirmLoadModal.vue` exposes `open(): Promise<LoadResult>` with `{ action, remember }` (line 15-25), no `as LoadAction` cast found; `useDirtyBoardGuard.ts` exists; `handleLoadCardFromDatabase` is absent from `App.vue`. Substantively shipped.
- **[V]** BUT both items' sole ref is `{kind: commit, target: "frontend/c2.2-use-dirty-board-guard"}`, which `git rev-parse --verify` REJECTS ("Needed a single revision") — it is a branch/work-stream label, not a resolvable SHA/commit. The schema's `shipped`-requires-evidence clause is satisfied by the *kind* but the *target* doesn't resolve. **Recommend: keep closed/shipped; fix the ref target** (point at the squashed `initial` commit, or convert to a worklog/source ref).

### Closed items — all `consistent` (terse)

| id | evidence (all **[V]**) |
|---|---|
| `byte-xor-q8-ownership` | PR #272 MERGED 2026-05-26 (title matches); `'v2-quantized-hifi-xor'` in types.ts + `byteXorDelta` param in encoder.ts; worklog exists |
| `nav-rerender-localization-app-decouple` | worklog exists; StatusBar/TreeWidget self-source pattern is the documented Arc-2 |
| `rb1-toolbar-metrics-decouple` | worklog exists; child of nav-during-range-query-perf (parent open, consistent) |
| `rb2-analysis-panel-coalescing` | PR #329 MERGED 2026-06-01 (collapsed-chart gate); panel-registry present |
| `rb3-packet-receive-chunking` | resolution `dropped`; worklog `2026-05-29-perf-rb3-diagnosis.md` exists; analysis-service.ts:49 references the dropped investigation |
| `memory-profiling-discipline` | `frontend/scripts/perf-heap.mjs` exists (dated Jun 1); ADR-0009 documents retained-heap tail-slope metric + the script; worklog exists |
| `unified-user-controllable-scalar` | PR #223 MERGED 2026-05-14; worklog exists |
| `tag-dsl-macro-language` | PRs #197/#198/#199 all MERGED 2026-05-12 (titles match arc); worklog exists |
| `analysis-customisable-subtabs` | PRs #301/#302/#304 all MERGED 2026-05-29; `migrations.ts:138` has the `54 → 55 analysisTabs` migration; AnalysisTabsEditor.vue + panel-registry.ts present |
| `de-cq-preview-hide` | worklog exists; AnalysisChartPanel.vue:58-70 has `narrow` ref + ResizeObserver + `PREVIEW_HIDE_BELOW_PX`, exactly as described |
| `doc-graph-artifact` | `docs/doc-graph.{json,md}`, `doc-graph-report.md`, `tools/doc-graph/generate.mjs` all present; worklog + plan exist |
| `foreststat-tagstat-acl` | archived worklog exists |
| `anchor-role-overloading` | archived worklog exists |

### Open items — all `consistent` (spot-checked; terse)

High-confidence open (verified the asserted-open work is genuinely NOT shipped):
- `forestdirectory-tabwidget-refactor` — **[V]** ForestDirectory.vue:323 still uses plain `<button :class="{active:...}">` + local `activeTab` ref, not TabWidget. Correctly open.
- `save-disconnect-clears-graph` — **[V]** no `alwaysPersistGraph` anywhere in frontend/src. Correctly open.
- `knob-bookmark-schema-reshape` — **[V]** `QeuboBookmark.parameters` is still `Record<string, number>` (types.ts:1768), not `Record<KnobId, number[]>`. Correctly open.
- `remove-legacy-auth-key-shim` — **[V]** `migrateLegacyAuthKeys()` still defined + called (api-client.ts:57,73). Correctly open.
- `pre-merge-checklist-doc` — **[V]** `docs/pre-merge-checklist.md` does not exist. Correctly open.
- `qeubo-e2e-validation` — **[V]** `QEUBO_ENABLED` defaults False (config.py:22); the validation gate is real. Correctly open.
- `refactoring-queue-adr0007` — **[V]** cited files have all GROWN past 300 lines (PaletteEditor 531→626, useReviewSession 483→664, App.vue 513→708, types.ts 953→2245), confirming no refactor landed. Open. *(Minor description staleness: `HorizontalTimelineVisualizer.vue` not found at the cited path; the item is a backlog list, not per-file status.)*
- `i18n-string-sweep` — **[V]** vue-i18n dep + LocalePicker.vue + en/zh-CN/ja/ko catalogs present; residual ("native-speaker review") is real. Correctly open.
- `stringly-typed-api-errors` — **[V]** `class ApiError extends Error` with `readonly status/body` IS shipped (PR #318 MERGED), but the item's open residual is "RCA drafted, pending maintainer review." Correctly open. **[I]** the asserted "six consumers / 0 new sites" audit count I did not exhaustively recount.
- `adaptive-query-cancellation-leak` — **[V]** analysis-service.ts:49 explicitly references "the adaptive-cancel investigation"; proxy-scoped, pending runtime visibility. Correctly open.

The remaining open items (`chess-clone`, `silent-coercion-protocol-boundaries-audit`, `responsive-design-deferred`, `nav-during-range-query-perf`, `perceptual-event-projection`, `knob-wire-key-derivation`, `item-27-etag-multitab`, `item-32-zeroconf-discovery`, `automatic-mistake-discovery`, `inline-analysis-config-editing`, `polymorphic-chart-renderer`, `content-addressed-card-identity`, `doc-graph-svg-spline-failure`, `doc-graph-svg-render-off-tree`, `surface-1-backgrounds-audit`, `scattered-timing-literals`, `adr-effectiveness-audits`, `serial-numbers-generated-artifacts`, `engine-connection-lifecycle-logout`, `tags-fetch-hydration-race`, `review-state-convention-inconsistency`, `pv-overlay-typography-calibration`, `pv-animation-defaults-calibration`, `mistake-finder-unpunished-brittleness`, `stability-surface-distribution-metric`, `kde-boundary-bias`, `semantic-clarity-refactors-effect-typing`, `distribution-packaging`, `public-deployment`, `community-palette-library`, `gradingparameter-opacity-typing`) — **[V]** their cited refs/files all exist where given; **[I]** these are future/research/large or low-priority backlog items with no plausible "silently shipped" signature (most are design questions, audits, or large arcs whose ship would be highly visible). I treated these as `consistent` without exhaustively reverse-engineering each — none surfaced a shipped-capability contradiction in the targeted greps. Flagged below as the heuristic residual.

---

## 3. Explicit verdicts on the two named suspects

**`single-cte-per-pipeline-run` (30c): CONFIRMED DRIFTED — open-but-shipped, high confidence.** The single CTE keyed off `card_source.card_id IN (:context_ids)` with first-seen-wins dedup in Python is exactly what the current `fetch_selection` + `_build_selection_cte` + `PipelineExecutor.run` implement, and the code comments name it as Item 30c with the pre-30c loop explicitly "gone." [V via `pipeline.py:236-246`, `lineage_repository.py:118-121,506-524`]

**`classification-discipline-tenet-rule7-relocation`: CONFIRMED DRIFTED — discharged by ADR-0008, high confidence.** ADR-0008 exists and is the standalone-ADR articulation the item describes; ADR-0002 records the provisional-home flag retired 2026-05-17 with the resolution that Rule 7 *stays put* (the literal "relocate" was a deliberate non-move). The work this item tracks is decided and done. [V via `0008-classification-discipline.md`, `0002-fail-loudly.md:257-269`]

---

## 4. Recommended status corrections (candidates only — maintainer decides)

Ranked by confidence:

1. **`single-cte-per-pipeline-run`** → `closed` / `shipped`. Supply a ship ref (worklog or the `initial` commit SHA `e5c857b`) to satisfy the schema's `shipped`-requires-evidence clause. *(Also consider: the `depends_on: ["consolidate-recursive-cte"]` edge is moot — 30c shipped without 30d complete.)*
2. **`classification-discipline-tenet-rule7-relocation`** → `closed`. Resolution likely `superseded` (the literal relocation was declined; ADR-0008 supersedes the need) — or `shipped` with an `{kind: adr, target: "docs/adr/0008-classification-discipline.md"}` ref. Maintainer picks the disposition that matches intent.
3. **`loadaction-type-dishonest`, `silent-guard-handleloadcard`** → keep closed/shipped; **fix the unresolvable `commit` ref target** `frontend/c2.2-use-dirty-board-guard` (point at a real SHA or convert to worklog/source kind). Status is right; evidence pointer is broken.
4. **`consolidate-recursive-cte`** → maintainer judgment. Either keep open with a description update (the live sites are consolidated as `_recursive_descent_cte` per "Item 30d"; the residual is the dead `tree_queries.py` + test-only `tree_dsl.py` duplicates), or close if those dead duplicates are out of scope.

## 5. Honest note on the heuristic residual

What this audit could NOT settle by ground truth:

- **Squash-to-single-commit collapses history.** The repo's only commit on the relevant path is `e5c857b "initial"`, so `git log -S` / `git log -L` cannot date or attribute the 30c/30d landing. I relied on the *current code state* + in-code item tags, which is strong for presence but blind to *when/how* the work landed and to any intermediate reverts. (PR-merge state was recoverable via `gh` — all 10 PR refs verified MERGED.)
- **The "file exists ⇒ shipped" trap (G6).** I avoided this by checking the *described capability* in each case (e.g., ForestDirectory still using plain buttons; `migrateLegacyAuthKeys` still called; bookmark shape still `Record<string,number>`), not mere file presence. But for the ~31 future/research/large backlog items in §2's last paragraph, I did targeted greps rather than exhaustive capability tracing — a feature shipped under a substantially different name/path than the item anticipates (false negative) could hide there. None surfaced a contradiction, but I cannot claim each was exhaustively reverse-engineered.
- **Audit-count residuals** (`stringly-typed-api-errors`' "the six ARE the complete population"): I verified `ApiError` shipped but did not independently re-enumerate the six consumers to confirm "0 new sites."

---

## Appendix — verbatim prompt

The exact brief given to this background liveness-audit agent (Opus 4.8,
independent, read-only), repo-relative paths preserved. License: Public Domain
(The Unlicense).

````text
You are an independent liveness auditor for LengYue, a single-maintainer Go spaced-repetition study app (soft monorepo at /home/bork/w/omega — Vue 3 + TS frontend, FastAPI backend, KataProxy submodule, hosted on GitHub: KodBena/LengYue). Reason independently; you have no stake.

## The task

A work-status SSOT (`docs/work-status.json`, 59 items; fixed schema `docs/work-status.schema.json`) was just migrated FAITHFULLY: each item's status was transcribed exactly as the prose source docs (`docs/TODO.md`, `docs/notes/deferred-items.md`, `docs/handoff-current.md`) ASSERTED it — explicitly NOT validated against reality. Your job is that validation: audit each item's asserted status against ground truth (git history, the filesystem, the code, GitHub PRs) and surface drift.

Drift classes to find, highest-value first:
- OPEN items that appear already done — the "shipped but still documented open" signature (this exact failure motivated the whole SSOT). Highest value.
- CLOSED/shipped (or dropped) items whose evidence doesn't hold — a referenced PR not actually merged, named files absent, no trace of the work.
- Mis-stated disposition/resolution where evidence suggests a different state.

## Named suspects (the maintainer's own flags — check these explicitly)

- `single-cte-per-pipeline-run` (legacy 30c): the maintainer suspects it may ALREADY be delivered. Check `backend/domain/pipeline.py` (PipelineExecutor.run) and git history for a single-CTE consolidation.
- `classification-discipline-tenet-rule7-relocation`: ADR-0008 ("Classification Discipline") may already discharge this. Read `docs/adr/` — does ADR-0008 exist, and does it cover the classification tenet + the ADR-0002 Rule 7 relocation this item asks for?

## Method (ground truth, not inference)

Per item, gather evidence: `git log` / `git log -S` / grep for the work landing; do the named source files / capabilities exist (`find`/`grep` over `frontend/` `backend/`); did referenced PRs merge (`gh pr view N --json state,mergedAt,title` — NOTE squash-merges drop the PR number from `git log`, so also grep commit messages and check `gh`); for ADR/worklog claims, read the cited doc. Each item's `refs` (kinds pr/source/worklog/design-note) are your starting evidence pointers. `git log` history is available; `gh` may need auth — if a `gh` call fails, note it and fall back to git/grep.

## Honesty (the project's own discipline — hold it firmly)

The "a file named like the item exists ⇒ it shipped" check is a HEURISTIC the codebase explicitly distrusts (RCA guard G6): a file can exist while the described capability doesn't, and a feature can ship under a different name/path than the item names (false negatives) — especially for items authored before the code. So:
- Give every item a VERDICT with explicit CONFIDENCE: `consistent` (asserted matches evidence) / `likely-drifted` (open-but-appears-shipped, or closed-but-evidence-missing) / `uncertain` (ambiguous).
- For every non-`consistent` verdict, give the EVIDENCE (the git/file/PR facts) and name the false-positive / false-negative risk.
- Do NOT auto-correct anything — the maintainer decides. You produce candidates for status correction, ranked by confidence, with evidence.

## Constraints

READ-ONLY. Do NOT modify any file and do NOT run any git-mutating command (no add/commit/checkout/worktree/stash). Just analyze and report. Another process is working in the repo concurrently in a separate worktree — confine yourself to reads of the main tree at /home/bork/w/omega.

## Deliverable

Return your full structured audit report as your final message (I will file it to disk; do not write it yourself). Structure:
1. Bottom-line: counts by verdict, and the headline drifts.
2. Per-item findings: id | asserted (state + disposition/resolution) | verdict | confidence | one-line evidence. Terse for `consistent`; detailed for the rest.
3. Explicit verdicts on the two named suspects, with evidence.
4. "Recommended status corrections" (candidates only), plus an honest note on the residual the heuristic cannot settle.
Mark each load-bearing claim verified (by a command you ran) vs inferred.
````

License: Public Domain (The Unlicense).
