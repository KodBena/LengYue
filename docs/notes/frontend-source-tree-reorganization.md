# Frontend source-tree reorganization — audit and planning

- **Status:** `design-note: implemented`. Landed 2026-05-11 in the
  reorganization commit that ships alongside this transition. See
  the "Implementation outcome" section at the bottom for the
  resolved decision-points and what differed from the proposal.
- **Genre:** Design note — file-structure audit.
- **Date:** 2026-05-11 (drafted, accepted, implemented same day).
- **Author:** bork (drafted with Claude Opus 4.7, 1M-context).

## Why this exists

The umbrella `docs/notes/decisions-deferred.md` records (2026-04-26)
that **backend** tree reorganization was considered and rejected. The
"Distinction from the frontend" subsection of that entry's closing
paragraph notes:

> A separate decision — whether to reorganize the frontend's
> `composables/` and `components/` directories — is in flight at
> the time this entry is recorded, and the answer there is probably
> yes. That decision has different motivating factors:
> single-author iteration without an enforcing architectural
> discipline analogous to Hexagonal banding, and flat directories
> that have grown to a size where measurable navigation friction
> exists.

Sixteen days on, the frontend has not been reorganized and nothing
in the codebase has changed that read. The project author has
flagged the question repeatedly as nagging — flat directories at
the current scale impose navigation friction for the human
contributor. The existing precedent inside the frontend is
`components/charts/`, an 11-file cluster that earned its
subdirectory and has read cleanly since.

This note investigates whether the precedent should propagate, and
if so, in what shape.

## Current state

Tree (excluding `tests/` and built output):

```
src/
├── App.vue                        (27 KB — separate concern)
├── logic.ts
├── main.ts
├── jquery-bridge.ts
├── style.css
├── types.ts                       (58 KB — separate concern)
├── assets/
├── components/                    30 flat .vue + charts/ (11 files)
├── composables/                   42 flat .ts
├── config/
├── engine/                        11 flat .ts + analysis/ (2) + katago/ (6)
├── i18n/                          2 files
├── lib/                           1 file
├── locales/                       4 JSON
├── services/                      10 flat .ts
├── store/                         5 flat .ts
├── types/
└── utils/                         3 flat .ts
```

The two surfaces that drive the pain are unambiguous:

- **`components/`** — 30 files at one level. By eye, the natural
  clusters are: board (7), tree/forest (4), modals (4), chrome (8),
  editors (4), review (1), qEUBO (2), plus `charts/` already nested
  (11).
- **`composables/`** — 42 files at one level. By eye: board / play
  (≈10), analysis (≈9), cards / tree / forest (≈13), SGF (2),
  review (2), auth-app (3), qEUBO (1), chrome (2).

`services/` (10) is borderline; `engine/` already has the subdirs
that matter; `store/` (5) is small; the rest are healthy.

A smaller adjacent issue worth surfacing without scope-creeping
this audit: **naming-convention drift** in composables. Most files
follow `useFoo.ts` camelCase; five do not — `use-move-suggestions.ts`,
`use-pv-animation.ts`, `board-card-trees.ts`, `wait-for-analysis.ts`,
`autonomous-srs.ts`. Out of scope for this audit; flag as a
separate small arc.

## Constraints in play

### ADR-0005 Rule 5 — file location reflects content

Argues *for* organizing when content has clusterable structure;
*against* organizing for its own sake when there is no signal to
group by. At 30/42 files with eyeball-obvious clusters, the
signal is present.

### ADR-0004 — minimal-touch under partial visibility

A directory reorg is the exact shape where ADR-0004's
full-visibility exception applies: a flag-day PR that moves every
file in one atomic transaction is the correct posture; an
incremental drift where some files moved and others didn't would
be the silent-state failure ADR-0004 forbids.

### ADR-0003 — domain bands

Suggests one possible taxonomy axis (Band 1 agnostic / Band 2
tree-coupled / Band 3 Go-bound). Evaluated below in the options
section; weakly recommend against as the primary axis.

### The backend decision-against (2026-04-26)

Captures the precedent the frontend audit needs to distinguish
itself from:

> The backend is already band-organized — by Clean Architecture
> layer […]. Adding a domain-coupling axis on top would compete
> with the existing layer-axis […].

The frontend does **not** have an analogous enforcing axis. The
split into `components/` / `composables/` / `services/` / `store/`
is real and load-bearing (the frontend `CLAUDE.md` codifies the
layering as a tenet) but does not bound directory size —
`components/` and `composables/` have grown past 20 files apiece
without the discipline-driven backpressure that Hexagonal
Architecture imposes on the backend's directories. The condition
the backend cited as the reason to *not* reorganize (small
directories produced by the discipline) does not hold here.

### LLM-vs-human asymmetry

The author asked specifically whether reorganization could be
net-negative for the LLM collaborator. Honest answer: minimal
effect; slightly net-positive at one level of nesting; slightly
net-negative at two-or-more.

- *Reading a file by path:* unchanged.
- *`grep` / `glob`:* unchanged.
- *"What components exist?":* a flat list of 30 is one `ls`;
  nested one level is two `ls` calls. Cheap either way.
- *Mental clustering at orientation time:* one-level nesting
  makes domain clusters legible without having to read every
  filename — a small positive. Two-or-more-level nesting starts
  to cost depth-first walking — a small negative.

The LLM's interest aligns with the human's optimum: one level
deep, yes; deeper, no. The "do nothing" baseline is honestly fine
for the LLM in isolation. **The case for change is human-driven;
the LLM is neutral-to-mildly-supportive of a moderate
reorganization, neutral-to-mildly-opposed to a heavy one.**

## Taxonomy options

### Option A — by ADR-0003 band

`band1-agnostic/`, `band2-tree-coupled/`, `band3-go-bound/`.

Pros: mirrors an existing documented axis; sharpens the
domain-portability story for a future chess port.

Cons: band classification is fuzzy at the margins (some files
straddle); files developers naturally seek together end up in
different directories (e.g., the board renderer is Band 3
Go-bound, but visually adjacent to Band 2 board state in any task
that touches both). Cross-band navigation friction is the failure
mode this axis creates.

**Verdict:** rejected as a primary filesystem axis. Reasonable as
documentation in source headers per ADR-0006, not as a directory
shape.

### Option B — by feature surface

Clusters by the user-facing surface the file participates in:
`board/`, `tree/`, `charts/`, `modals/`, `chrome/`, `editors/`,
etc.

Pros: matches how a contributor thinks during a task ("I'm
working on the board overlays" → all board files in one place);
the `charts/` precedent already validates this shape; clusters
are eyeball-derivable from the current file list.

Cons: cross-feature components have no obvious home; small
clusters look silly as single-file subdirs.

**Verdict:** strongest primary axis, with the refinement Option E
adds below.

### Option C — by component role

`widgets/`, `modals/`, `panels/`, `overlays/`, `editors/`.

Pros: matches how components are *rendered* (the surface type).

Cons: collapses domain — `BoardWidget` and `TreeWidget` end up
adjacent despite being unrelated; finding "what's in the review
session" requires cross-dir navigation.

**Verdict:** rejected; weaker than Option B on the find-by-task
criterion.

### Option D — two-level: layer × feature

`components/board/`, `composables/board/`, OR `board/components/`,
`board/composables/`.

Pros: maximum spatial locality per feature.

Cons: doubles directory depth; competes with the existing layer
split (the frontend `CLAUDE.md` makes the layer split load-bearing
— Components are renderers, Composables are logic, Services are
effects, the line is policed by code review); LLMs walk deeper.

**Verdict:** rejected. The layer split is the codebase's existing
discipline; Option D would compete with it.

### Option E — moderate Option B (recommended)

Cluster by feature surface, but **clusters must earn their place**:

- ≥ 4 files → subdir.
- 2–3 files → judgment call (subdir if there's a cohesive
  identity; top-level if not).
- 1 file → top-level always.
- Cross-feature shared utilities → top-level of the layer
  directory itself, not a speculative `shared/` or `common/`
  subdir.

Inherits Option B's pros, addresses the small-cluster cons.

**Verdict:** recommended.

## Concrete proposal (Option E)

### `components/`

```
components/
├── ReviewSessionPanel.vue         (single-file; no review/ subdir)
├── board/                          (7)
│   ├── BoardDisplay.vue
│   ├── BoardHeatmapOverlay.vue
│   ├── BoardTab.vue
│   ├── BoardVariationsOverlay.vue
│   ├── BoardWidget.vue
│   ├── MoveSuggestions.vue
│   └── StatusBar.vue
├── charts/                         (unchanged, 11)
├── chrome/                         (8)
│   ├── FloatingThumbnail.vue
│   ├── LocalePicker.vue
│   ├── RootErrorBoundary.vue
│   ├── SidebarWidget.vue
│   ├── SystemLogPanel.vue
│   ├── TabWidget.vue
│   ├── Toolbar.vue
│   └── UserBadge.vue
├── editors/                        (4)
│   ├── AnalysisControls.vue
│   ├── CardSetEditor.vue
│   ├── PaletteEditor.vue
│   └── RegistryEditor.vue
├── modals/                         (4)
│   ├── ConfirmLoadModal.vue
│   ├── EngineMatchModal.vue
│   ├── LoginModal.vue
│   └── MintCardModal.vue
├── qeubo/                          (2)
│   ├── QeuboBookmarks.vue
│   └── QeuboToolbar.vue
└── tree/                           (4)
    ├── ForestDirectory.vue
    ├── ForestTreeNav.vue
    ├── HorizontalTimelineVisualizer.vue
    └── TreeWidget.vue
```

Result: 1 top-level .vue (`ReviewSessionPanel.vue`) + 8 subdirs,
each holding 2–11 files. No single-file subdir.
`ReviewSessionPanel.vue` sits flat honestly — there's no second
review-related component to cluster with. If the autonomous-SR
loop later adds siblings, it earns a subdir then.

`qeubo/` at 2 files is the borderline call: subdir wins because
qEUBO is a self-contained calibration feature with its own
documentation (`docs/notes/qEUBO.md`) and the cluster identity
is strong.

### `composables/`

```
composables/
├── useQeubo.ts                     (single-file; no qeubo/ subdir)
├── analysis/                       (9)
│   ├── useActivityDecay.ts
│   ├── useAnalysisProjection.ts
│   ├── useAnalysisTimeline.ts
│   ├── useChartNavigation.ts
│   ├── useEChartsForestRender.ts
│   ├── useEnrichedData.ts
│   ├── useTimelineLogic.ts
│   ├── useTriangularHeatmap.ts
│   └── wait-for-analysis.ts
├── auth-app/                       (3)
│   ├── useAppBootstrap.ts
│   ├── useAuth.ts
│   └── useMetadata.ts
├── board/                          (≈10)
│   ├── autonomous-srs.ts
│   ├── use-move-suggestions.ts
│   ├── use-pv-animation.ts
│   ├── useDirtyBoardGuard.ts
│   ├── useEngineControls.ts
│   ├── usePlayFromPosition.ts
│   ├── useScopedScroll.ts
│   ├── useTransientHint.ts
│   ├── useTransientLogReveal.ts
│   └── useUserIORegistry.ts
├── cards/                          (6, if cards/forest split)
│   ├── board-card-trees.ts
│   ├── useCardThumbnail.ts
│   ├── useCardTreeData.ts
│   ├── useCardTreeHydration.ts
│   ├── useCardTreeProjection.ts
│   └── useThumbnailCache.ts
├── chrome/                         (2)
│   ├── useLocale.ts
│   └── useResizablePanel.ts
├── forest/                         (7, if cards/forest split)
│   ├── useActivePath.ts
│   ├── useForestBrowsePolicy.ts
│   ├── useForestNavigation.ts
│   ├── useNavigation.ts
│   ├── useTreeExpansion.ts
│   ├── useTreeLayout.ts
│   └── useVariationPath.ts
├── review/                         (2)
│   ├── useMinting.ts
│   └── useReviewSession.ts
└── sgf/                            (2)
    └── useSgfDownload.ts, useSgfLoader.ts
```

Result: 1 top-level .ts (`useQeubo.ts`) + 8 subdirs. The
`cards-tree-forest` macro-cluster has been split into `cards/`
(6) and `forest/` (7), both comfortable; the combined 13 was
already past the threshold where the next reorg would have
forced the split anyway.

Marginal cases that need the author's call:

- **`useNavigation.ts`** is the cross-cutting case. Used by board
  AND tree contexts. The proposal puts it under `forest/`
  because the larger consumer surface is tree/forest navigation;
  `BoardWidget`'s use is a small fraction. Could equally live at
  the top level. Author's call.
- **`useQeubo.ts`** is shown top-level (Option E's
  "1 file → flat" rule). Could alternatively go under
  `review/` since qEUBO is calibration that serves review. Mild
  preference for top-level — keeps the qEUBO surface findable as
  a distinct concept.
- **`board/`** at ≈10 files is comfortable but broad. Could split
  into `board-render/` vs `board-input/` later if it grows; not
  yet.

### `services/`, `store/`, `engine/`, others — no changes

- **`services/`** at 10 files is large but homogeneous (all are
  effectful singletons doing API-shaped work). Splitting by
  domain (`auth/`, `analysis/`, `sync/`, `qeubo/`) is defensible
  but post-split each cluster is 1–3 files — fails Option E's
  earn-your-place rule. Leave flat.
- **`store/`** at 5 files. Below the threshold.
- **`engine/`** already has `analysis/` and `katago/`. Top-level
  11 files (rendering, rules, SGF I/O, tree, util) are mixed and
  could be sub-grouped, but the pain is smaller than
  `components/` and `composables/`. Leave for a later pass if
  warranted.
- **`lib/`** (1 file) and **`utils/`** (3 files): the
  distinction is unclear and `lib/utils.ts` is essentially
  dead-code-shaped. Out of scope for the main reorg; flag for
  a small follow-up that merges them and decides on one name.

## Honest read

The pain the author describes is real, the case for the
reorganization is, in my honest read, **yes — proceed with
Option E**. Four reasons:

1. **Two directories meaningfully exceed the size at which flat
   navigation breaks down.** 30 and 42. The backend's
   decision-against rested on no directory having hit that
   point; the frontend has, in two places.

2. **The clusters are obvious and stable.** I derived them by
   eye from the file list with effectively no domain knowledge
   of which files are conceptually related. A taxonomy that
   takes five rounds to derive is a warning sign; this one
   doesn't. The eyeball test passing is the falsification
   signal.

3. **The precedent works in the codebase.** `components/charts/`
   has not suffered under its subdirectory and nobody has tried
   to un-nest it.

4. **The deferred-decisions doc said "probably yes" 16 days ago
   and nothing has changed since to flip that read.**

But — and this is the load-bearing caveat — **don't over-organize**.
Specifically:

- Stay one level deep. Two-level nesting would actively harm
  navigability and compete with the layer split.
- Don't create a subdir below 4 files unless the cluster
  identity is strong. `qeubo/` (2 files) earns it because qEUBO
  is a distinct named surface with its own documentation;
  `review/` (2 files) earns it because review is one of the
  product's two primary modes. Don't reach for a third
  borderline case without similar justification.
- Don't apply the same taxonomy to surfaces where it doesn't
  pay. `services/`, `store/`, `engine/` are not pain points;
  leaving them flat is honest, not inconsistent. The principle
  is "organize where signal exists," not "every directory
  matches every other."
- Don't bundle the kebab-vs-camelCase composable rename into
  this PR. It's a separate, smaller, lower-risk arc.

## Risks and what NOT to do

1. **Wrong taxonomy first time.** If Option E's clusters turn
   out to be wrong, a second reorg costs roughly what the first
   one did. Mitigation: walk the proposed map with the author
   before implementing; commit only after the marginal cases
   above are resolved.

2. **Import-path churn.** Every move breaks every importer. The
   typical PR will touch 100+ import statements across the
   tree. Mitigation: a single flag-day PR; `vue-tsc -b` and
   `npm run test:run` both pass before commit. The strict
   typecheck is the safety net — a missed import will fail loud.

3. **Git blame fragmentation.** `git log --follow` handles
   renames cleanly, but `git blame` on the new path will show
   the move commit as the most-recent edit for every line,
   making archaeology slightly harder until `--follow` is
   second nature. Acceptable cost.

4. **Cross-cutting components without a home.** Option E's
   "1 file → top-level" rule handles this. Don't invent
   `shared/` or `common/` subdirs speculatively; let need
   surface them.

5. **Scope creep.** The audit will tempt expansion into:
   - The kebab→camelCase composable rename.
   - `App.vue` (27 KB) deserves component extraction.
   - `types.ts` (58 KB) deserves a typed-catalogue audit.
   - `lib/` vs `utils/` merger.
   - `engine/` sub-grouping.

   All real, all out of scope for this PR. Each is its own arc.
   Keep the reorg PR's scope to "move files, fix imports,
   verify build + tests."

## Decision points for the author

Before implementation begins, settle:

1. **Proceed with Option E?** Or stay flat? Or prefer a
   different option above?
2. **`useNavigation.ts` placement** — `forest/` (current proposal),
   `board/`, or top-level?
3. **`useQeubo.ts`** — top-level flat (current proposal) or
   under `review/`?
4. **`cards/` + `forest/` split** as proposed, or keep them as
   one `cards-tree-forest/` macro-cluster?
5. **Schedule** — flag-day PR now, or wait until other in-flight
   work calms? The strict typecheck makes the move safe at any
   time; the question is sequencing.

## Maintenance contract

`design-note: planned`. When implementation lands, this document
transitions to `design-note: implemented` per the doc-graph
genre lifecycle: a status line at the top names the closing PR
and worklog, and the body becomes historical record.

If the audit's premise is rejected (decision-against), file a
sibling entry under `docs/notes/decisions-deferred.md` recording
the rationale, and retire this note.

## Cross-references to update on landing

- `docs/notes/decisions-deferred.md` — the "Backend source-tree
  reorganization" entry's "Distinction from the frontend"
  subsection should add a forward reference to this note (and
  later, to its closing PR / worklog).
- `docs/handoff-current.md` — no change needed; the frontend
  section describes the layer split (components / composables /
  services / store), which is preserved.
- `frontend/CLAUDE.md` — no change needed; the layering tenet
  is preserved.

## Implementation outcome

Reorganization landed 2026-05-11 in the same commit that
transitions this note to `design-note: implemented`. 81 files
had imports rewritten by a one-off `/tmp/fix-imports.py`
script that walked the tree, resolved every relative import,
and repaired the broken ones via a lookup table over the
moves. Four cross-subdir-within-components edge cases the
script missed (paths starting `./` rather than `../`) were
fixed by hand. ADR-0006 source-file headers updated in-place
by a sibling `/tmp/fix-headers.py` script (62 files). The
strict `vue-tsc -b` typecheck and the 166-test Vitest suite
both passed clean after the sweep; `npm run build` produces
identical bundle output (same gzip size, same module count).

### Decision points — how they resolved

1. **Proceed with Option E?** Yes.
2. **`useNavigation.ts`** — top-level (author override of the
   proposed `forest/` placement). Rationale per the new
   feedback memory: synthetic classification under ambiguity
   is worse than honest flat placement. The same principle
   was applied to five other ambiguous composables that the
   proposal had tentatively placed in subdirs:
   `useScopedScroll` (board+tree consumers), `useUserIORegistry`
   (global hardware adapter), `useEngineControls` (engine
   cross-surface), `useTransientHint` (writer/reader split),
   `useTransientLogReveal` (App-scoped chrome utility) — all
   lifted to top-level. The principle the audit calls
   "earn-your-place" for subdirs has a per-file counterpart for
   ambiguous individual files: when classification is
   synthetic, flat is honest.
3. **`useQeubo.ts`** — top-level (singleton).
4. **`cards/` + `forest/` split** — applied as proposed.
   `useActivePath.ts` and `useVariationPath.ts` (both
   variation-path-within-game-tree concepts) joined the `board/`
   cluster, bringing it to 7 files.
5. **Schedule** — implemented immediately on author approval.

### Final shape

```
components/ — 1 top-level (ReviewSessionPanel.vue) + 7 subdirs
  board/ (7), charts/ (11, unchanged), chrome/ (8),
  editors/ (4), modals/ (4), qeubo/ (2), tree/ (4)

composables/ — 7 top-level + 8 subdirs
  top-level: useEngineControls, useNavigation, useQeubo,
             useScopedScroll, useTransientHint,
             useTransientLogReveal, useUserIORegistry
  analysis/ (9), auth-app/ (3), board/ (7), cards/ (6),
  chrome/ (2), forest/ (4), review/ (2), sgf/ (2)
```

Untouched per the audit's recommendation: `services/` (10
flat), `store/` (5), `engine/` (its existing `analysis/` and
`katago/` subdirs are sufficient), `utils/`, `lib/`, `config/`,
`i18n/`, `locales/`, `types/`.

The flagged adjacent cleanups remain out of scope and open as
their own arcs: the kebab→camelCase composable rename, App.vue
extraction, types.ts catalogue audit, lib/ vs utils/ merger,
engine/ sub-grouping (if warranted).
