# Investigation — the ADR-0007 file-size refactoring arc (work-status `refactoring-queue-adr0007`), 2026-06-02

Independent code/git archaeology (Opus 4.8, background agent), commissioned
after the liveness audit found the files listed in `refactoring-queue-adr0007`
had *grown* (no recent refactor), while the maintainer recalled a file-size
refactoring that *was* done long ago, with lessons-learned turned into policy
(single-line styling). This reconstructs that arc and recommends a disposition.
Read-only; candidates, not corrections. Saved verbatim per the consult-record
convention. License: Public Domain (The Unlicense).

The correction it informed was applied 2026-06-02 (commit `14a40a8`):
`refactoring-queue-adr0007` kept open and **re-framed** per recommendation (c).

---

# Reconstruction: the ADR-0007 file-size refactoring arc & `refactoring-queue-adr0007`

## Bottom line

The maintainer's recollection is **correct and well-evidenced**. A file-size / ADR-0007-driven refactoring arc happened on **2026-04-27** (the "C2 arc"). It concluded that ADR-0007's strict ≤250-line SFC target is *especially hard to hit in `.vue` files* because "the bulk is template + styles, not logic" — and that conclusion fed forward into policy. The named "single-line styling" preference lives in **ADR-0007's Format/contraction section**. Since then the cited files have all grown well past their listed counts, so the work-status item's file list is stale either way.

One important correction to prior work: the 2026-06-02 liveness audit claimed git history was squashed to a single `initial` commit. **That is false for the frontend tree** — `git log` shows 1025 commits and 59 commits touching `App.vue` alone. The C2 arc is fully recoverable from both worklogs *and* git history. (The audit likely checked only the backend path, where it cited `e5c857b`.)

---

## 1. The refactoring arc (C2 — App.vue refactor) — VERIFIED

**When:** 2026-04-27. **What:** three incremental composable extractions from `App.vue`, driven explicitly by ADR-0007's refactor queue, one extraction per commit/PR, build green between each, behaviour preserved exactly.

| Step | What was extracted | App.vue | Commit (verified) | PR |
|---|---|---|---|---|
| C1 | Restore `ConfirmLoadModal` mount (bug fix, set up clean seams) | 591→593 | `633e339` [V] | direct |
| C2.1 | `useResizablePanel` | 593→569 | `8eeb701` [V] | direct-to-main |
| C2.2 | `useDirtyBoardGuard` (+ retired 2 deferred-items: LoadAction-dishonest, silent-guard) | 569→520 | `5bd5d1b` [V] | #5 (`854c1c5`) |
| C2.3 | `useAppBootstrap`; **closes the C2 arc within bounded scope** | 520→500 | `4605fc9` [V] | #6 (`2910369`) |
| follow-up | `useResizablePanel` onUnmounted cleanup | — | `0862932` [V] | #123 (`7d538ef`) |

All three composables exist in the tree today (relocated by the later feature-surface reorg, commit `39e200d`): `frontend/src/composables/chrome/useResizablePanel.ts`, `frontend/src/composables/board/useDirtyBoardGuard.ts`, `frontend/src/composables/auth-app/useAppBootstrap.ts` [V].

**Where recorded:**
- `docs/archive/worklog/2026-04-pre-v1.0/2026-04-27-c1-dirty-board-guard.md`
- `docs/archive/worklog/2026-04-pre-v1.0/2026-04-27-c2.1-extract-use-resizable-panel.md`
- `docs/archive/worklog/2026-04-pre-v1.0/2026-04-27-c2.2-extract-use-dirty-board-guard.md`
- `docs/archive/worklog/2026-04-pre-v1.0/2026-04-27-c2.3-extract-use-app-bootstrap.md` (the closing worklog; §"Bounded-stopping evaluation")
- `docs/archive/dispatch/frontend-to-frontend-session-handoff-2026-04-27.md` (lines 25-27, 79-85: "The C2 arc closed within bounded scope … App.vue went from 593 → 500 lines via three clean composable [extractions]")

The arc did all three of ADR-0007's prescribed refactor moves over the lifecycle: composable extraction (C2.x), child-component splits and CSS, and — separately — the `migrations.ts` rolling-archive (see §2).

## 2. The "ADR-0007-is-hard-in-.vue" conclusion + the lessons-learned policy — VERIFIED

**The conclusion** is recorded in two places:

- **`docs/archive/worklog/.../2026-04-27-c2.3-extract-use-app-bootstrap.md`** §"Bounded-stopping evaluation" (lines 121-167): after the three extractions, App.vue's remaining bulk is "Template (~260 lines), Styles (~110 lines)" vs ~130 of logic. Verbatim: *"The bulk is template + styles, not logic."* and *"App.vue at 500 lines is the bounded-scope steady state. Further line reduction would require either non-C2 work (CSS/template contraction) or thin-cluster extractions that don't earn their keep."* [V]
- **`docs/notes/deferred-items.md`** "Refactoring queue from ADR-0007" entry (lines 400-406), prose added **2026-05-06** (commit `bedb957`) [V]: App.vue *"down from 591 at original audit time; Vue SFC's 'template + style' sections make trimming below 250 hard, even after composable extractions and child-component splits."*

**The lessons-learned policy artifacts** (where each lives):

1. **Single-line styling preference** — `docs/adr/0007-file-size-and-information-density.md` §"Format — content-aware contraction," the CSS row (line 64): *"Aggressive contraction. Single-property rules: one line. Multi-property rules under ~100 chars: one line."* plus the column cap (~120 chars) and the no-go (*"Never contract TypeScript decision logic to fit a size budget"*).
   - **Nuance [V]:** This Format section was present from ADR-0007's **birth on 2026-04-26** (commit `088ed4b`), *one day before* the C2 arc, and was never edited afterward. So strictly the single-line CSS rule was authored *with* the ADR, not retro-added from C2's lessons. The C2 arc *validated and exercised* it (C2.3 explicitly cites *"contract the static, leave the active alone"* as the path forward for App.vue's residual size). The maintainer's framing — that single-line styling is "fallout" from concluding strict ADR-0007 is hard in SFCs — is best read as: the ADR's Format mechanism is *the* answer to the SFC-template-and-style problem, and the C2 arc is what proved that mechanism (not logic-extraction) is what recovers SFC budget. The conclusion ("strict target is hard in .vue, contract CSS instead") is what's lessons-learned; the rule it points to predates the arc.

2. **Effective-lines / density rule + template-vs-logic distinction** — ADR-0007 §Density (lines 43-54) and §Format (the three-row table: CSS aggressive / templates moderate / TS-logic none).

3. **SFC contraction discipline (frontend-local restatement)** — `frontend/CLAUDE.md` §"Vue Single-File Components" (lines 275-279): *"SFCs target ≤ 250 lines… the contraction options are: extract a composable for the logic, extract a child component for a renderable subsection, move CSS to a separate file or compress it. Never compress logic to fit."* [V]

4. **The bounded-vs-aspirational meta-observation** — `docs/rfcs/0001-adr-meta-review.md` open question 8 (lines 264-283), which names *"The C2 (App.vue refactor) deliberation about whether ADR-0007's target is bounded (clean-seam stopping point) or aspirational (drive to ≤250)"* as a worked example and concludes *"the project's DNA favors bounded, but the ADR's language is ambiguous."* RFC-0001 is still **Status: Draft** — so the language-sharpening this implies was never folded back into ADR-0007 (which is still **Status: Proposed**). [V]

5. **Sibling structural policy (`migrations.ts` rolling-archive)** — `frontend/CLAUDE.md` §"Rolling-archive discipline" (lines 360-394): *"Per ADR-0007: the prior unified file had grown past 1100 lines… well past the 200-line target"* → keep exactly the latest two migrations active, archive the rest. A second ADR-0007-driven file-size intervention (2026-05-14), distinct from C2. [V]

## 3. Disposition for `refactoring-queue-adr0007`

**Current file counts (all GROWN since the item's 2026-05-06 list) [V]:**

| File | listed | now | path |
|---|---|---|---|
| App.vue | 513 | **708** | `frontend/src/App.vue` |
| PaletteEditor.vue | 531 | **626** | `frontend/src/components/editors/PaletteEditor.vue` |
| useReviewSession.ts | 483 | **664** | `frontend/src/composables/review/useReviewSession.ts` |
| BaseChart.vue | 345 | **597** | `frontend/src/components/charts/BaseChart.vue` |
| ForestDirectory.vue | ~335 | **500** | `frontend/src/components/tree/ForestDirectory.vue` |
| HorizontalTimelineVisualizer.vue | 392 | **513** | `frontend/src/components/tree/HorizontalTimelineVisualizer.vue` (the liveness audit said this file "not found" — it exists, at `tree/`) |
| MintCardModal.vue | 393 | **396** | `frontend/src/components/modals/MintCardModal.vue` |
| types.ts | 953 | **2245** | `frontend/src/types.ts` (type-catalogue exception still applies) |

### Recommendation: **(c) keep open, but RE-FRAME** — *not* closed.

Reasoning:

- The item is **not "shipped/closed"** (disposition a). The C2 arc shipped, but it was scoped to *App.vue only* and explicitly closed *within bounded scope at 500 lines* — it never claimed to clear the queue. The other named files (PaletteEditor, useReviewSession, BaseChart, etc.) were never touched by C2, and every file including App.vue has since grown. Closing the item as shipped would assert a completion the evidence contradicts.
- It is **not cleanly "superseded"** (disposition b) either — but this is the closest competitor, and a defensible alternative. What *was* genuinely settled is the **framing**: the "strict-queue with named next-targets" model was superseded by the **incremental-per-ADR-0004 + CSS-contraction + bounded-stopping** posture (the C2 conclusion + ADR-0007 §Format + RFC-0001 Q8). One could legitimately mark it `superseded` *by that posture*. I prefer (c) over (b) only because real over-budget files still exist and the item still usefully tracks *backlog*, whereas `superseded` implies the concern itself dissolved — it didn't; the *queue-with-priorities* concept dissolved.
- So: **keep `state: open`, but rewrite the description** to (i) record that the C2 arc shipped (App.vue 593→500 via three composable extractions, 2026-04-27, worklogs above); (ii) drop the stale per-file counts and the "PaletteEditor and useReviewSession are the natural next targets" priority framing — that framing was *explicitly retired* by the bounded-stopping posture; (iii) refresh the file list (fix the HorizontalTimelineVisualizer path, add BaseChart's growth) and state it as an *illustrative backlog snapshot, not per-file status*; (iv) cross-reference ADR-0007 §Format, the C2.3 worklog, `frontend/CLAUDE.md`'s SFC section, and RFC-0001 Q8 so the "incremental + CSS-contraction, never compress logic, bounded-not-aspirational" policy is the operative guidance.

### If you instead decide to close (alternative path)

If you read the *queue* as the unit of work and judge it superseded:
- `disposition: superseded`, `closed_on: 2026-04-27` (the C2 arc's close — the date the strict-queue framing was replaced by the bounded posture).
- Resolvable ref: `{ kind: worklog, target: "docs/archive/worklog/2026-04-pre-v1.0/2026-04-27-c2.3-extract-use-app-bootstrap.md" }` (its "Bounded-stopping evaluation" section is the canonical closure statement). Secondary ref: `{ kind: adr, target: "docs/adr/0007-file-size-and-information-density.md" }` §Format, as the policy the queue collapsed into.
- But note this leaves the genuinely-over-budget files (which *grew*) untracked — which is why I recommend (c) over this.

**Either way, the cited file list is stale** and should be corrected; and the prior liveness audit's per-file growth check (the "[V] all GROWN" evidence at its line 95) is the right factual basis — I confirmed those counts independently and additionally found HorizontalTimelineVisualizer does exist at `frontend/src/components/tree/`.

---

**Verified-by-command:** all commit SHAs (C1/C2.1/C2.2/C2.3/#123), composable file locations, current line counts of all 8 named files, ADR-0007 single-commit history (born 2026-04-26 with Format section intact), deferred-items prose added 2026-05-06, RFC-0001 Status: Draft.
**Inferred:** the precise causal framing of "single-line styling is *fallout from* the C2 conclusion" (the rule predates the arc by a day; the arc validated rather than authored it — I flagged this nuance explicitly); the recommendation of (c) over (b) is a judgment call on what "the item tracks," not a fact.

---

## Appendix — verbatim prompt

The exact brief given to this background investigation agent (Opus 4.8,
independent, read-only). License: Public Domain (The Unlicense).

````text
You are an independent code/git archaeologist for LengYue (single-maintainer Go spaced-repetition study app; repo at /home/bork/w/omega; Vue 3 + TS frontend under frontend/; ADRs at docs/adr/; hosted on GitHub KodBena/LengYue). Read-only; reason from evidence; mark every load-bearing claim verified-by-command vs inferred.

## Background

A work-status item `refactoring-queue-adr0007` is asserted OPEN/active: it lists Vue/TS files exceeding ADR-0007's ~300-line "single-view" budget (PaletteEditor.vue, useReviewSession.ts, App.vue, BaseChart.vue, MintCardModal.vue, HorizontalTimelineVisualizer.vue, ForestDirectory.vue, types.ts) and says to refactor them incrementally per ADR-0004. A liveness audit found those files have GROWN since the item was written (e.g. PaletteEditor 531→626, useReviewSession 483→664, App.vue 513→708, types.ts 953→2245) — i.e. no recent refactor.

BUT the maintainer states: a file-size refactoring WAS in fact done, a long time ago; it was concluded at the time that achieving ADR-0007's strict criteria is especially hard in `.vue` files; and lessons-learned were turned into POLICY afterwards — for example, **the preference for single-line styling** is fallout from that. "Residual evidence should be available."

## Your task — reconstruct, with evidence:

1. **The refactoring arc**: was there a file-size / ADR-0007-driven refactoring arc? When (dates), what did it do (which files, what extractions — composables pulled out, child components split, CSS contracted), and where is it recorded? Search `docs/worklog/`, `docs/archive/worklog/`, `docs/notes/`, `docs/archive/notes/`, PRs (`gh pr list`/`view`), and `git log`/`git log -S`. (Git history may be squashed to a single `initial` commit; if so, recover from worklogs/notes/PRs and say so.)

2. **The ADR-0007-in-.vue conclusion + the lessons-learned policy**: where is the conclusion that the strict budget is especially hard in `.vue` files recorded — an ADR-0007 amendment / "Revisit when" note, a design note, `frontend/CLAUDE.md`, an audit note? Find the **single-line styling** preference and any sibling policies (e.g. CSS-contraction-to-recover-budget, the effective-lines/density rule, template-vs-logic distinction) and cite where each lives. Start from `docs/adr/0007-file-size-and-information-density.md` and `frontend/CLAUDE.md`, and the deferred-items "Refactoring queue from ADR-0007" entry's own history.

3. **Bears on the work-status item**: given (1)+(2) AND that the files have since grown, how should `refactoring-queue-adr0007` be re-stated? Candidate dispositions: (a) closed/shipped (the arc + policy happened); (b) closed/superseded (the strict-queue framing was superseded by the incremental-per-ADR-0004 + CSS-contraction + density policy); (c) keep open but re-framed (an arc + policy happened, but named files remain over-budget and grew). Recommend ONE with reasoning, and note the cited file-list is stale either way. If you recommend closed, propose a `closed_on` date + a resolvable ref (worklog/PR/ADR).

## Constraints

READ-ONLY: no edits, no git-mutating commands. Concurrent process may touch the repo — reads only. `gh` may need auth; fall back to git/worklogs if it fails.

## Deliverable

Return (as your final message — do not write files) a structured report: the refactoring arc (what/when/where + evidence), the ADR-0007-in-.vue conclusion + the lessons-learned policy artifacts (where each lives), and a recommended disposition for `refactoring-queue-adr0007` (shipped / superseded / open-reframed) with reasoning + (if closed) a `closed_on` + resolvable ref. Mark verified vs inferred.
````

License: Public Domain (The Unlicense).
