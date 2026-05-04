# Resource-ownership audit — Pass 1 inventory filed

- **Status:** Shipped on the resource-audit-pass-1 branch,
  2026-05-04. Docs-only; no code changes.
- **Genre:** Audit-pass artifact — produces the Pass 1 inventory
  the audit plan (`docs/notes/resource-ownership-audit-plan.md`)
  specified. Unlike the magic-literals audit (which spun out a
  separate inventory file), this audit's inventory lives in the
  plan itself, per the plan's "the inventory itself is part of the
  deliverable" wording.
- **Date:** 2026-05-04.

## Context

The closeBoard bug closed earlier the same day
(`2026-05-04-close-board-stops-analysis.md`) was the prompting
case study for a broader audit. The audit plan (filed in the same
PR as that fix) named owner-resource as the primary framing,
acknowledged that protocol-state and subscription framings would
catch additional residue and warrant separate sweeps, and laid
out a three-pass methodology: (1) inventory, (2) per-pair
fix-or-doc one-commit-per-pair, (3) forward-authoring discipline.
This PR ships (1).

## What changed

### `docs/notes/resource-ownership-audit-plan.md`

The plan's "Seed inventory" section is renamed to "Inventory" and
its body replaced with the Pass-1 deliverable. The Status block at
the top of the file flips from "Proposed. First pass not yet
executed" to "Pass 1 closed 2026-05-04; the inventory below is the
deliverable." The framing sections (Why this exists, The pattern
named, Primary taxonomy, Pass structure, Bisect discipline,
Cross-references) are unchanged — they still apply to Passes 2
and 3.

The new Inventory section has four parts:

1. **Closed (do not re-audit).** 17 rows, up from the seed's 2.
   The seed entries (closeBoard's analysis-subscription fix and
   the HMR dispose) plus 15 cleanups verified during the walk
   that already have explicit teardown wired — auth-state
   workspace reset, qEUBO reset on identity flip, all the
   component-unmount Vue lifecycle cleanups (BaseChart,
   HeatmapChart, HorizontalTimelineVisualizer, useScopedScroll,
   useUserIORegistry, useTransientLogReveal, useActivityDecay,
   use-pv-animation, useEChartsForestRender), and a few
   in-composable lifecycle cleanups (useReviewSession's
   AbortController, KataGoClient's per-queryId subscriber map).
   Each row carries a file:line reference so future audits can
   verify the cleanup hasn't drifted.

2. **Suspected open.** 15 rows grouped by mutation site:

   - **Owner = Board (closeBoard):** O1 (ledger purge), O2
     (review-session row), O3 (activeMode key persistence), O4
     (thumbnail cache board-purge), O5 (pendingAnalysisAborts),
     O6 (KataGoClient subscribers verification).
   - **Owner = Identity / Workspace (resetWorkspace):** O7
     (analysisService per-board maps), O8 (analysisLedger), O9
     (useThumbnailCache), O10 (useCardThumbnail — privacy-
     relevant due to integer CardId cross-user collision), O11
     (pendingAnalysisAborts on workspace reset).
   - **Owner = Component lifecycle (onUnmounted absence):** O12
     (`useResizablePanel` no `onUnmounted`), O13 (`BaseChart`
     `markerTimer`), O14 (`MintCardModal` setTimeout —
     benign).
   - **Owner = Engine WS reconnect:** O15 (analysisService
     per-board bookkeeping after reconnect).

   Each row carries a Pass-2 question (the diagnostic to run when
   the pair is swept) and a Disposition hint (likely fix shape,
   or rationale for documenting/deferring). Per the plan's
   bisect discipline, each gets its own Pass-2 commit.

3. **Out-of-scope (initially).** Unchanged from the seed: backend
   resources, proxy internals, browser tab-close cleanup.

4. **Pass-1 closeout notes.** Two short subsections:
   - Doc-graph drift: the plan and `store/index.ts`'s file
     header reference a function `resetUserOwnedState`; the
     actual name is `resetWorkspace`. Inventory body uses the
     correct name; the file-header drift is named as a Pass-2
     candidate that lands alongside the O7/O8/O9/O10 commits.
   - Forward note for Pass 3: the recurring shape from the walk
     — singleton per-entity bookkeeping reliably gets a
     `dispose`/`disconnect` path but inconsistently gets an
     entity-removal path — should drive the Pass-3 inline-
     comment convention.

### `docs/TODO.md`

The Resource-ownership audit row's "Pass 1 expands this list"
sentence is rewritten in past tense — "Pass 1 closed 2026-05-04…"
— with a one-paragraph headline summary so a reader who lands on
the TODO can decide whether the open work is worth picking up
without first reading the plan. The headline names the highest-
signal open pairs: O1 (ledger purge with the `purgeBoard`
sub-finding), O7 (resetWorkspace cleanup using the existing
`stopAllBoardAnalyses`), O10 (cross-user CardId privacy), O12
(`useResizablePanel` mid-drag unmount).

## Why an in-file inventory rather than a separate inventory file

The magic-literals audit's Pass 1 produced a separate
`docs/notes/magic-literals-audit-inventory.md`. This audit's
inventory lives in the plan itself. The two choices are
defensible for different reasons:

- **Magic literals.** ~15 categories, each with prose framing,
  examples, and substrate-or-justify decisions per category.
  Splitting kept the plan readable as a methodology document and
  the inventory readable as a working artifact.
- **Resource ownership.** ~25 owner-resource pairs in compact
  tabular form, no per-pair prose framing needed. The plan was
  always intended to absorb the inventory (it explicitly says
  "the inventory itself is part of the deliverable"). Splitting
  would have produced a one-screen plan and a two-screen
  inventory file with cross-references between them — more
  artifacts to keep synchronized for marginal organizational
  gain.

The choice is documented in the plan's evolution rather than as a
separate decision; this worklog is the authoring-time record.

## What's NOT in this PR

Per the bisect discipline, no fixes ship in Pass 1. In particular:

- The `resetUserOwnedState` → `resetWorkspace` drift in
  `store/index.ts`'s file header is named as a Pass-2 candidate,
  not fixed here. It rides with whichever O7/O8/O9/O10 commit
  touches `store/index.ts` first.
- `purgeBoard`'s incomplete `nodeVersions` cleanup is named as a
  sub-finding under O1, not fixed here. Sibling commit when O1
  is swept.
- No code edits at all, beyond the doc graph.

## Verification

- The plan and TODO files render cleanly in the standard markdown
  viewer (tables and column counts consistent).
- File:line references in the inventory were spot-checked at
  authoring time against the live source; the table entries are
  copy-paste-grep-able for future verification.
- `npm run build` (vue-tsc + vite build) was not run because no
  TypeScript or Vue files changed. The frontend build is
  unaffected.

## Forward notes

Pass 2 picks up next. Recommended sequencing (drawn from the
disposition hints in the inventory, not binding):

1. **O1 (closeBoard → ledger purge) plus its sub-finding** —
   highest-signal open pair, sibling of the prompting case
   study, and surfaces the `purgeBoard` `nodeVersions` leak as
   a separate sub-commit.
2. **O7 (resetWorkspace → stopAllBoardAnalyses)** — free win
   reusing an existing method; closes the largest open pair on
   the resetWorkspace owner.
3. **O12 (useResizablePanel onUnmounted)** — trivial, mirrors a
   known-good pattern, no architectural decisions.
4. **O2/O3 (closeBoard → review-session row + activeMode key)**
   — single commit because both are SyncService payload bloat
   on the same site.
5. **O4 (closeBoard → useThumbnailCache board-purge)** — needs a
   new affordance on the composable surface; small but
   architectural.
6. **O10 (resetWorkspace → useCardThumbnail clearCache)** — the
   privacy-relevant pair; latent under single-machine
   deployment, real under multi-tenant.

The remaining rows (O5, O6, O8, O9, O11, O13, O14, O15) are
mostly verifications, deferrals, or trivial cleanups that ride
along when their owner-mutation site is touched. Pass 2's actual
ordering is at the user's discretion when they pick up the work.
