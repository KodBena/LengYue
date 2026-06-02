# Investigation — CTE consolidation (work-status 30c / 30d), 2026-06-02

Independent code/git archaeology (Opus 4.8, background agent), commissioned
after the work-status liveness audit flagged `single-cte-per-pipeline-run`
(30c) as open-but-shipped and `consolidate-recursive-cte` (30d) as uncertain.
The maintainer recalled the consolidation riding along with the tag-DSL or a
"port purification" arc and believed 30d was shipped-or-superseded; this
investigation establishes what actually happened, dates/refs, and whether the
two leftover duplicate sites warrant a new work-status item. Read-only;
candidates for the maintainer, not corrections. Saved verbatim per the
consult-record convention. License: Public Domain (The Unlicense).

The corrections it informed were applied 2026-06-02 (commit `14a40a8`): 30c →
shipped, 30d → shipped, a new `remove-dead-recursive-cte-duplicates` item.

---

# Archaeology Report: work-status items 30c / 30d (CTE consolidation)

## Dating constraint (verified)

The git history is **partially squashed**: `git log` shows 1025 commits, but the *backend CTE code* path collapses into a single pre-history commit. `git log -S '_build_selection_cte'`, `-S '_recursive_descent_cte'`, and `-S 'fetch_selection'` all bottom out at **`e5c857b "initial"` (bork, 2026-04-26)** [V]. Both helpers exist fully formed, comment-tagged "Item 30c"/"Item 30d", in `git show e5c857b:backend/repositories/lineage_repository.py` [V]. So `git blame`/`git log -L` cannot date or attribute the landing — the work predates the PR-tracked history (earliest PR is #1, merged 2026-04-27 [V via `gh`]). Dating below is recovered from worklogs, retrospectives, and the completed-TODO archive, not git.

`gh` is authenticated and working.

---

## Item 30c — `single-cte-per-pipeline-run`

**Verdict: SHIPPED.** (Confirms the prior liveness audit's "open-but-shipped, high confidence.")

Evidence (all [V]):
- `backend/domain/pipeline.py:236-246` — `PipelineExecutor.run` makes ONE `fetch_selection(selection, context_ids, ...)` call; comment: *"Item 30c: a single call covering all context ids… the per-context loop that lived here pre-30c is gone."* First-seen-by-MIN(depth) dedup is in Python (`pool_map`, lines 247-252), exactly as the item's description offered as the alternative.
- `backend/repositories/lineage_repository.py:506-544` — `_build_selection_cte` carries *"Item 30c: takes List[int]"* and generalizes each base predicate from `== context_id` to `.in_(context_ids)` (e.g. line 541, 549).

**Recommended resolution:** `shipped`.
**Recommended `closed_on`:** **2026-04-26** (the only datable evidence — the `initial` commit author-date; the code is present there). The item rode along inside the **item-32a port-purification arc** (see 30d), not a dedicated PR.
**Resolvable ship-ref:** the schema requires evidence. The cleanest *resolvable* options:
- `{kind: commit, target: "e5c857b"}` — verified to resolve (`git rev-parse` / `git show` succeed) [V]. Honest but coarse (it's the squash floor, not the true landing).
- `{kind: source, target: "backend/domain/pipeline.py:236"}` + `"backend/repositories/lineage_repository.py:506"` — the comment-tagged sites; both exist [V].
- Note for the maintainer: the `depends_on: ["consolidate-recursive-cte"]` edge is **moot** — 30c is present in the same tree as 30d's helper; the "do 30d first, then 30c is a one-liner" framing in TODO.md:629-631 is stale narration, not a live dependency.

---

## Item 30d — `consolidate-recursive-cte`

**Verdict: SHIPPED for the production goal; the item's literal four-site framing was SUPERSEDED by item 32a.**

The item proposed a helper named `_build_lineage_cte` unifying four sites: `tree_engine.fetch_lineage`, `tree_engine.build_selection_cte`, `tree_queries.get_lineage_cte`, `tree_dsl.SubtreeSelection.to_cte`.

What actually happened (all [V]):
- The helper shipped as **`_recursive_descent_cte`** (`lineage_repository.py:427`), not `_build_lineage_cte`. Its docstring: *"Item 30d: extracted from three places that previously inlined this skeleton (DescendantSelection, SubtreeSelection, fetch_lineage)."*
- It is the **single** recursive skeleton for the live path: `fetch_lineage`, `fetch_selection`/`_build_selection_cte` (DescendantSelection branch), and the card-tree `fetch_tree_by_root` all delegate to it (lines 139, 295, 548, 670).
- **Item 32a relocated and renamed the item's first two cited sites out from under it.** `tree_engine.py:4-7` states `fetch_lineage` and `build_selection_cte` *"moved to repositories/lineage_repository.py"* (32a). The completed-TODO archive (`docs/archive/TODO-completed-2026-05-06.md:117`) records 32a as shipped: *"Domain layer purified: LineageRepositoryPort, TagFilterRepositoryPort."* **This 32a "domain-layer purification" IS the "port purification" arc the maintainer half-recalled** — and it is the arc that carried the consolidation. The tag-DSL arc only *cross-references* 30c/30d as separate future work (`tag-dsl-macro-language-plan.md:334-337,700`) [V]; it did not carry it.
- **Dating corroboration:** the card-tree-backend worklog (`docs/archive/worklog/2026-04-pre-v1.0/2026-04-29-card-tree-backend.md:79`) says `fetch_tree_by_root` *"reuses the **existing** `_recursive_descent_cte`"* — so the helper **already existed before 2026-04-29**, i.e. it landed in the pre-history 32a work squashed into `initial` (2026-04-26).

So: the *production* "close the hole where a bug-fix to one variant never propagates" goal is **met** for every live site. The two remaining named sites (`tree_queries.py`, `tree_dsl.py`) were NOT folded in — they were left as dead/legacy code that 32a routed around rather than consolidated. The "four sites" framing was overtaken by the architectural relocation.

**Recommended resolution:** `shipped` (production consolidation delivered) — or `superseded` with `superseded_by` pointing at the 32a item, if the maintainer treats the literal four-site/`_build_lineage_cte` spec as the contract. I lean **`shipped`**: the item's stated *purpose* (one recursive skeleton; bug-fixes propagate) is satisfied, and the rename + three-vs-four-sites are cosmetic deviations from the proposal, not a different outcome. The residual two duplicates are a *separate* concern (next section) — not 30d's unfinished tail.
**Recommended `closed_on`:** **2026-04-26** (same squash floor; helper present in `initial`, confirmed pre-2026-04-29 by the worklog).
**Resolvable ship-ref:** `{kind: source, target: "backend/repositories/lineage_repository.py:427"}` (the `_recursive_descent_cte` definition, tagged "Item 30d") [V] — pairs well with the 32a archive entry `{kind: worklog, target: "docs/archive/TODO-completed-2026-05-06.md"}` (file exists [V]) as the arc record. The coarse `{kind: commit, target: "e5c857b"}` also resolves.

---

## The two duplicate sites — new work-status item warranted?

### `backend/domain/tree_queries.py::get_lineage_cte`
**Genuinely dead.** [V] `grep -rn` across the whole repo (`*.py`) shows `get_lineage_cte` is referenced only inside `tree_queries.py` itself (called by `select_subtree` in the same file, line 32). **Nothing — no production module, no test, no script — imports `tree_queries` or `select_subtree`.** It is an orphaned legacy DSL primitive. It also carries no ADR-0006 header (no docstring/header at all) [V], confirming it's untouched legacy.

### `backend/domain/tree_dsl.py::SubtreeSelection.to_cte` (+ `ContextSelection`, `TagFilter`)
**Test-only, and the test exercises DEAD code, not live behaviour.** [V]
- `tree_dsl` is imported in exactly one place: `tests/integration/test_cte_lineage.py` (lines 315, 360) — inside the `D-5` and `D-6` tests.
- **Important name-collision finding:** there are TWO unrelated `SubtreeSelection`/`ContextSelection` classes. The **live** ones are in `domain/pipeline_dsl.py` (Pydantic discriminated-union DSL, item 31) — used by `lineage_repository.py`, `pipeline.py`, fakes, e2e tests, scripts. The **dead** ones are in `domain/tree_dsl.py` (the legacy `.to_cte()` Protocol DSL). All the other grep hits resolve to `pipeline_dsl`, not `tree_dsl`. `tree_dsl` itself is wired into nothing in production.
- The `tree_dsl` module is also **partially broken**: `TagFilter.apply` references `func.count` and `tag.id`/`tag.c.id` without importing `func` and inconsistently — it would `NameError` if ever called. It isn't called.

### What `test_cte_lineage.py` actually does
It is a **mostly-live, partly-dead** test file:
- Tests **CTE-1 through CTE-8** (lines 53-289) exercise the LIVE `LineageRepository.fetch_lineage` (the real `_recursive_descent_cte` path). These are valuable, real regression tests over production code — keep them.
- Tests **D-5** (xfail-strict) and **D-6** (`pytest.skip`-on-confirm) (lines 292-383) document defects in the DEAD `tree_dsl` module. Per `backend/CLAUDE.md`'s xfail discipline, a `strict=True` xfail asserts post-fix behaviour and XPASS-fails CI when fixed. But the underlying module is dead — the defect will never be fixed because the code has no callers. **D-5/D-6 are documenting bugs in code that production cannot reach.** They pin nothing real.

### Recommendation: **YES — a new work-status item is warranted** (small/cleanup tier)

Reasoning:
1. **`tree_queries.py` is unambiguously dead** [V] — zero importers anywhere. Deleting it is risk-free and is exactly the kind of residual the SSOT exists to surface. Leaving dead recursive-CTE code in `domain/` directly undercuts 30d's stated goal ("the recursive machinery lives in exactly one place") — its presence means a future reader could copy/edit the stale variant.
2. **`tree_dsl.py` is dead-except-for-one-test** [V]. The test (`D-5`/`D-6`) keeps it on life-support: removing `tree_dsl` would break `test_cte_lineage.py`'s import. So this is a coupled retirement — delete `tree_dsl.py` *and* drop the D-5/D-6 tests (or re-home/delete them), keeping CTE-1…CTE-8 which test live code.
3. This is **not** part of 30d's unfinished tail — 30d's *production* goal is done. It's a distinct **"remove the dead recursive-CTE duplicates (`tree_queries.py`, `tree_dsl.py`) and retire the D-5/D-6 dead-code tests"** cleanup. Bus-factor consideration (single maintainer, sites live in one person's memory): dead duplicates of a load-bearing pattern are precisely the latent hazard the project weights as more than "someday."

Suggested item shape: `scope: backend`, `tier: small`, `disposition: active` (or `future` if the maintainer prefers), description ≈ *"Delete the orphaned legacy recursive-CTE duplicates `domain/tree_queries.py` (zero importers) and `domain/tree_dsl.py` (imported only by the D-5/D-6 tests in test_cte_lineage.py); retire those two dead-code tests, keeping CTE-1…CTE-8 which exercise the live LineageRepository.fetch_lineage path. Closes the residual 30d/32a left behind: dead variants of the now-consolidated `_recursive_descent_cte`."*

If the maintainer would rather **not** delete and instead annotate, that's defensible too — but leaving it *undocumented* is the failure the audit is meant to prevent. Either way it should appear as a tracked item, not be silently ignorable.

---

## Verified vs inferred summary
- [V] Both helpers present in `initial` (e5c857b, 2026-04-26); both comment-tagged 30c/30d; live delegation chain intact; `tree_queries`/`tree_dsl` import graphs; the two `SubtreeSelection` classes are distinct modules; 32a recorded shipped in the completed-TODO archive; card-tree worklog says `_recursive_descent_cte` pre-existed 2026-04-29; PR #43 only added card-tree methods; `gh` authenticated; no dedicated 30c/30d PR exists; dead files lack ADR-0006 headers.
- [I] That 30c/30d "rode along inside 32a" — strongly supported (the helper relocation IS 32a per `tree_engine.py:4-7` + the archive entry, and the helper pre-dates 2026-04-29) but the exact landing commit/PR is unrecoverable due to the squash. `closed_on: 2026-04-26` is the squash floor (a lower bound on "present-by"), not a proven landing date — be honest about that when filing.

---

## Appendix — verbatim prompt

The exact brief given to this background investigation agent (Opus 4.8,
independent, read-only). License: Public Domain (The Unlicense).

````text
You are an independent code/git archaeologist for LengYue (single-maintainer Go spaced-repetition study app; repo at /home/bork/w/omega; FastAPI backend under backend/; hosted on GitHub KodBena/LengYue). Read-only; reason from evidence; mark every load-bearing claim verified-by-command vs inferred.

## Background

A work-status migration encoded two backend items as OPEN; a liveness audit then flagged both as drifted:
- `single-cte-per-pipeline-run` (legacy 30c): the per-context CTE loop in PipelineExecutor.run was replaced by one CTE — `backend/domain/pipeline.py` calls `lineage_repo.fetch_selection(selection, context_ids, ...)` once; `backend/repositories/lineage_repository.py::_build_selection_cte` (comment-tagged "Item 30c") generalizes the base predicate from `== context_id` to `.in_(context_ids)`. Audit: open-but-shipped, high confidence.
- `consolidate-recursive-cte` (legacy 30d): the recursive-CTE skeleton was extracted to `backend/repositories/lineage_repository.py::_recursive_descent_cte` (comment-tagged "Item 30d"), unifying the production sites; but two duplicates remain — `backend/domain/tree_queries.py::get_lineage_cte` (imported by nothing per grep) and `backend/domain/tree_dsl.py::SubtreeSelection.to_cte` (imported only by `tests/integration/test_cte_lineage.py`). Audit: uncertain. Also note `backend/domain/tree_engine.py` says two functions "moved to repositories/lineage_repository.py (Item 32a)".

The maintainer recalls the consolidation/rename riding along with either the **tag-DSL macro-language arc** or a **"port purification" arc** (and item 32a is in the mix), and believes 30d is "either fully shipped or superseded."

## Your task — establish, with evidence:

1. **30c**: is the single-CTE consolidation shipped? In which arc/PR/commit and on what DATE? Use `git log`, `git log -S '_build_selection_cte'` (and similar), `gh pr list`/`gh pr view`, the worklogs under `docs/worklog/` and `docs/archive/worklog/`, and design notes under `docs/notes/` and `docs/archive/notes/`. Recommend a `closed_on` date and a RESOLVABLE ship-ref (a PR number, a worklog path that exists, or a commit SHA — verify it resolves). NOTE: the git history may be squashed to a single `initial` commit (`e5c857b`); if so, say so explicitly and recover the date/arc from worklogs / PRs / `gh` instead of git blame.

2. **30d**: is `_recursive_descent_cte` the consolidation the item asked for (the item proposed a helper named `_build_lineage_cte` unifying four sites)? Is it `shipped` or `superseded` (e.g. by item 32a / the port-purification / tag-DSL arc)? Recommend `closed_on` + resolution (`shipped` vs `superseded`) + a resolvable ship-ref.

3. **The two duplicate sites** (`tree_queries.py::get_lineage_cte`, `tree_dsl.py::SubtreeSelection.to_cte` + its test `tests/integration/test_cte_lineage.py`): are they genuinely dead (unimported) / test-only / superseded / still-relevant? Is that test exercising live behaviour or dead code? Does this residual warrant a NEW work-status item (e.g. "remove the dead recursive-CTE duplicates" or "retire/re-home the test"), or is it not-applicable-after-the-refactor and safely ignorable? Give a clear Y/N recommendation with evidence — the maintainer said this is precisely the part they cannot assess themselves.

## Constraints

READ-ONLY: no file edits, no git-mutating commands. Another process may touch the repo concurrently — confine yourself to reads. `gh` may need auth; if it fails, note it and fall back to git/worklogs.

## Deliverable

Return (as your final message — do not write files) a structured report: per-item (30c, 30d) shipped/superseded verdict + recommended `closed_on` + resolution + a resolvable ship-ref, with the evidence (commands/paths); then the dead-duplicate analysis with an explicit "new work-status item warranted? Y/N and why." Mark verified vs inferred; be honest about what squashed history prevents you from dating.
````

License: Public Domain (The Unlicense).
