# Design proposal: analysis-tab range memory + metric-experimentation ergonomics

Commissioner-facing proposal. Two independent items. Both are *proposals only* — no
code in this deliverable. Survey claims are WITNESSED-in-source (file:line);
option-space claims are design judgement, flagged as such.

---

## 1. Analysis move-range not remembered across branch switches

### 1.1 Existing-state survey (WITNESSED)

- The stored range lives as a single optional field on `BoardState`:
  `analysisRange?: [PlyIndex, PlyIndex]` — `frontend/src/types/game.ts:169`. The
  field comment (`:159-168`) states the intent plainly: "persisted across tab
  switches and board switches (BoardState survives both)." It says nothing about
  branches, and nothing in the type keys it by one.
- The sole reader/writer is `useAnalysisTimeline`
  (`frontend/src/composables/analysis/useAnalysisTimeline.ts`):
  - `stored = computed(() => board.value?.analysisRange)` (`:55`) — one slot, one
    board, full stop.
  - `setSelectionRange` writes straight into that slot (`:63-65`).
  - A `watch` on `variationPath.value.length` (`:74-97`) is the *only* reaction to
    navigation: on first non-empty path it seeds `[0, len-1]`; on every subsequent
    length change it clamps the existing endpoints into `[0, len]`. It never asks
    *whether the path is still the same line* — only how long the new one is.
  - `variationPath` is `RootToLeafPath` (`:40`) — root → the active variation's
    **leaf**, following `activeChildIndex` at every node
    (`frontend/src/types/game.ts:68-72`, sole producer `getActiveVariationPath` in
    `engine/util.ts`). It is constant across pure cursor navigation *within* the
    same line, and changes only when (a) the line is extended past its old leaf,
    or (b) some ancestor's `activeChildIndex` changes — i.e. an actual branch
    switch — which walks a *different* leaf.
- Consequence, concretely: user sets range `[10, 30]` on branch A (34 plies long).
  They switch to sibling branch B, which forks from A at ply 15 and is 25 plies
  long. `variationPath.length` goes from 34 to 25; the watch clamps `[10,30]` to
  `[10,25]` and calls it done. Plies 15–25 on branch B are **different moves**
  (different `NodeId`s) than plies 15–25 were on branch A, but the clamped range
  is presented as if it still meant the same thing. Switching back to A does not
  restore `[10,30]` — the single slot was already overwritten by the clamp.
- Nothing else in `src/state/` or `src/composables/analysis/` stores or reads a
  second copy of the range — confirmed by `grep -rn "range" src/state/
  src/composables/analysis/`; the only range-shaped state there is
  `useTimelineLogic.ts`'s local `selectionRange` ref, which is a *different*,
  disconnected composable (dead/unused by the analysis tab's live wiring — not
  reading `BoardState.analysisRange` at all) and out of scope here.

### 1.2 The subtlety, worked through

The maintainer's sketch — key by "a node's ancestral path and active path range"
— is right in spirit but under-specifies *how much* of the ancestral path should
participate in the identity. Three readings, each with a distinct user-visible
consequence:

**Candidate A — key on the full leaf path (`RootToLeafPath` hash).**
`key = variationPath.join(',')` (or a DJB2 hash of it, matching the
`RawKey`/`EnrichedKey` style). Two contexts are "the same" iff they are the
literal same leaf.
*Consequence:* every forward move — including plain mainline play with no branch
in sight — appends a new `NodeId` to the leaf, so the key changes on **every
ply**. The remembered range is reset (falls back to the default fit-to-path seed)
on essentially every move. This does not fix the reported bug; it makes the
*common* case (playing forward, never switching branches) behave as badly as the
branch-switch case does today. Rejected — too fine, no resumability gained.

**Candidate B — key on the ancestral path to the current node
(`RootToCurrentPath` hash).** This is the most literal reading of "a node's
ancestral path."
*Consequence:* `currentNodeId` advances on every ply too (both on play and on
plain forward navigation within an existing line), so this churns **at least** as
often as Candidate A — and additionally churns on pure cursor movement that
doesn't touch `activeChildIndex` at all (e.g. stepping forward through a
already-analyzed line). Same rejection as A, for a superset of the same reason.

**Candidate C — key on the "branch stem": the sequence of decision-node
choices, decision nodes only.** Walk `variationPath` root→leaf; a node
contributes to the key **only if it has more than one child**
(`GameNode.children.length > 1`, `frontend/src/types/game.ts:140`) — contribute
`${nodeId}:${chosenChildId}`. Nodes with exactly one child (the overwhelming
majority of any line) contribute nothing. Two variation paths share a key iff
they made identical choices at every point a choice existed.
*Consequence:* extending the mainline (no branch ever revisited) never touches a
decision node, so the key is stable — the existing length-based clamp keeps
working exactly as it does today, just now correctly scoped. Switching a child at
*any* ancestor — near the root or one ply from the leaf — changes the key from
that decision point forward, so branch B gets its own (initially unset → default
fit-to-path) range, and switching back to A exactly restores A's last value
because A's slot was never touched. This is the minimal-surprise generalisation
of today's single-slot behaviour: "the range I set" persists for as long as I'm
looking at variations of the same choices, and forks cleanly when a choice
diverges.

**Recommendation: Candidate C.** It is the only one of the three that actually
satisfies the maintainer's own diagnostic test — "the same range context" should
survive ordinary forward play (the case that already works today and must not
regress) while genuinely separating at the point where the game tree itself
separates. A and B both fail the survive-forward-play test, which is the
majority-case behavior today; shipping either would trade one bug for a worse
one.

### 1.3 Identity, eviction, and persistence scope

- **Cardinality / eviction.** A board can accumulate many branch stems over a
  long review session (every place the user diverges mints a new key). Cap the
  per-board map at a fixed size (proposed: 32 entries, LRU-evicted on write) so
  the persisted blob doesn't grow unboundedly across a marathon session — this is
  a bounded-leak call under the Resource-ownership checklist
  (`frontend/CLAUDE.md` "Resource ownership at mutation sites" §2/§3): unbounded
  is not acceptable, LRU-bounded is a documented, deliberate choice. Node deletion
  (pruning a variation) can orphan a stem's key permanently — accept as a
  documented bounded leak (capped by the same LRU) rather than wiring a sweep at
  every delete-variation call site; name the tradeoff at the map's declaration
  site per the same checklist §3/§4.
- **Persistence scope: per-board**, riding inside `BoardState` exactly as
  `analysisRange` does today — no new persistence channel, no sync-service
  change. The field comment's existing claim ("Wire shape unaffected: brands
  erase at JSON serialisation, so SyncService persistence is transparent") holds
  unchanged for a `Record`-shaped replacement.
- **Not session-only, not globally synced separately** — per-board is the right
  grain because a range is meaningless outside the game tree it indexes; nothing
  about "which range for which branch" generalizes across boards or across users.

### 1.4 Branded key type

Per the keyed-cache rule (`frontend/CLAUDE.md` "Type-driven design"; worked
example `RawKey`/`EnrichedKey` in `src/state/analysis-config.ts`), the brand
names every input the bucketed value depends on:

```ts
// frontend/src/types/game.ts (or a new composables/analysis/branch-range-key.ts,
// mirroring analysis-config.ts's factory-owns-the-brand shape)

// Identity of "which branch am I on" for analysis-range memory: the
// ordered sequence of (decisionNodeId, chosenChildId) pairs at every
// node along the active line that had more than one child. A node
// with exactly one child contributes nothing — so extending the
// mainline without ever revisiting a fork leaves the key unchanged.
// Legs:
//   decisionSequence [tree-positional, B2] — NodeId choices only;
//     no Go content, no palette/config dependence. A range's
//     meaning depends on WHICH POSITIONS it spans, not on how
//     they're being analyzed.
// An input the range's identity depends on but this key omits would
// surface as one branch's remembered selection silently leaking into
// an unrelated branch — the same failure class RawKey/EnrichedKey's
// under-keyed predecessor produced (2026-06-08 ledger palette-swap
// stranding).
export type BranchRangeKey = Brand<string, 'BranchRangeKey'>;

// Sole factory. O(path length); no hashing needed at this cardinality
// (≤32 entries/board post-eviction) — the joined string is small and
// human-legible, which also makes a persisted blob debuggable by eye.
export function deriveBranchRangeKey(
  path: RootToLeafPath,
  nodes: Record<NodeId, GameNode>,
): BranchRangeKey { /* ... */ }
```

`BoardState.analysisRange?: [PlyIndex, PlyIndex]` becomes:

```ts
// Analysis-chart selection ranges, keyed per branch-stem so a range
// set on one variation survives navigating away and back, and does
// not silently apply to an unrelated sibling branch (release-scope
// item 2 follow-up; see design/... for the branch-identity rationale).
// LRU-capped at 32 entries; see useAnalysisTimeline for the eviction
// policy and the documented orphan-on-prune tradeoff.
analysisRanges?: Partial<Record<BranchRangeKey, [PlyIndex, PlyIndex]>>;
```

### 1.5 Touched-file inventory

- `frontend/src/types/game.ts` — `BranchRangeKey` brand + doc comment;
  `BoardState.analysisRange` → `analysisRanges` field rename/reshape.
- `frontend/src/composables/analysis/branch-range-key.ts` (new) —
  `deriveBranchRangeKey` sole factory, LRU-eviction helper.
- `frontend/src/composables/analysis/useAnalysisTimeline.ts` — `stored` computed
  keys into the map via the current `BranchRangeKey`; `setSelectionRange` writes
  the keyed entry; the length-watch becomes a (branch-key, length) watch — reseed
  on key change (fresh fit-to-path default, same as today's first-observation
  path), clamp-in-place on length change with the same key.
- `frontend/src/store/migrations.ts` — new migration `61 → 62`: best-effort
  convert any existing `board.analysisRange` into a single entry under that
  board's *current* branch key at migration time (the only key computable from a
  frozen blob), or drop it — pick one and record the choice as a `decision` row
  (real user-visible behavior difference: "my range survives the upgrade" vs "my
  range resets once"). Same-PR archive of migration `59 → 60` into
  `archived-migrations.ts` per the rolling-archive discipline.
- `frontend/IDENTIFIERS.md` — new row for `BranchRangeKey` (band call: tree-
  positional / B2).
- `frontend/FILES.md` — new row for `branch-range-key.ts`; retag
  `useAnalysisTimeline.ts`'s summary line.
- Any other direct reader of `board.analysisRange` (none found beyond
  `useAnalysisTimeline.ts` — confirmed by the `grep -rn analysisRange` pass) — no
  other call sites to touch.

### 1.6 Acceptance handles

- Pre-registered criterion: "a range set on branch A is unaffected by visiting
  branch B and is restored exactly on return to A." Evidence shape: unit test in
  `tests/unit/` (or integration, since `mutateBoard`/store involvement pushes it
  toward `tests/integration/`) driving `useAnalysisTimeline` against a fixture
  tree with one fork; assert `selectionRange.value` before/after/after-return.
- Criterion: "extending the mainline (no fork revisited) preserves the prior
  range, clamped." Regression guard for the *existing* behavior the fix must not
  break.
- Playwright witness (manual or e2e): load a multi-branch SGF, drag the timeline
  selection to a custom range on the mainline, click a sibling variation in the
  tree widget, observe the chart's selection reset to (or reflect) that branch's
  own default span, click back to the mainline node, observe the original custom
  range re-render on the timeline strip — screenshot pair (before-switch /
  after-return) is the witnessable artifact.

### 1.7 Size estimate

Medium: one new small module, one type reshape touching a single existing
composable's internals, one schema migration (mechanical but requires the
archive-rotation cadence), a handful of test additions. No component-layer
changes — `useAnalysisTimeline`'s public `AnalysisTimelineState` interface is
unchanged, so `AnalysisTimelinePanel.vue` and other consumers need no edits.

---

## 2. Metric-experimentation ergonomics

### 2.1 Existing-state survey (WITNESSED)

- **Palette *selection* (swap which whole palette is active) already lives in the
  analysis tab.** `frontend/src/components/editors/AnalysisControls.vue:39-44`
  (`activePaletteId` writable computed) + `:239-241` (the `<select>` in the
  header row) — one click to open the dropdown, one to pick a palette. This part
  is already ergonomic; it is out of scope for the fix.
- **Palette *parameter* editing (the numeric knobs a palette's `delta_fn` /
  `summary_fn` / `state_fns` formulas reference) lives entirely in Settings.**
  `AnalysisEnvironment.parameters: Record<string, number>`
  (`frontend/src/types/analysis-env.ts:47-53`) is authored exclusively through
  `PaletteEditor.vue`, mounted only at
  `frontend/src/components/SettingsTab.vue:123` under the "Analysis Environment"
  sub-tab. `PaletteEditor.vue:80-104` (`addParameter`/`updateParameterValue`) is
  the sole mutation path, routed through `mutateProfile` — i.e. **profile-scoped
  global state**, not per-board.
- **Click/context-switch cost to tweak one parameter while reviewing a board's
  analysis, today:** (1) click the top-level "Settings" tab — this *leaves the
  board view entirely* (`SettingsTab` is a sibling of the board tabs, not nested
  inside one, per `frontend/App.vue`'s tab structure and
  `SettingsTab.vue:1-30`'s own doc header); (2) click the "Analysis Environment"
  sub-tab (`SettingsTab.vue:60-66`, `activeSubTab` local ref); (3) click the
  target parameter in `PaletteEditor`'s sidebar list (`select('parameter', name)`,
  `PaletteEditor.vue:56-59`); (4) edit the numeric input, which fires
  `updateParameterValue` per keystroke/blur (`:88-111`, including the qEUBO
  hard-claim guard). Then the user must click back to the board tab and back into
  the analysis sub-panel to see the effect. **4 clicks plus a full navigational
  round-trip out of and back into board context**, repeated per parameter per
  trial.
- **The `StabilityPanel.vue` metric/extractor dropdowns are the one place this
  problem is already solved correctly** —
  `frontend/src/components/charts/StabilityPanel.vue:56-76`: `selectedExtractor`
  / `selectedMetric` are local `ref`s bound to inline `<select>`s directly in the
  analysis-tab panel, no trip to Settings. This is *not* a config-persistence
  question (those choices are view-local, not `AppSettings`), but it is the
  in-tab-quick-control genre pattern the palette-parameter fix should match.

### 2.2 Genre and reference exemplars (ADR-0019 Rule 1)

Genre: **inline quick-settings expander over a subset of a larger config
surface**, adjacent to the content the settings affect. Reference exemplars:

- **KaTrain's in-review "Config" panel** — sliders/toggles for engine strength,
  visualization thresholds, etc. live in a collapsible panel docked next to the
  board itself; no navigation away from the game being reviewed.
- **OGS's analysis-tab AI-review controls** — the "request AI review" panel
  exposes the commonly-changed knobs (visits, which engine) inline in the game
  page; deeper account-level engine configuration lives elsewhere, but the
  frequently-tweaked subset is co-located with the thing it affects.
- **IDE quick-settings popovers** (VS Code's editor-context "quick settings"
  gear, JetBrains' inline gutter config icons) — a small, curated subset of the
  full settings tree surfaced at the point of use; the popover is explicitly
  scoped as "commonly tweaked," with a link to the full settings UI for anything
  broader.

Per Rule 1, the deviation from "config lives in one Settings surface" is
justified exactly by this genre: the convergent shape *is* co-location of
frequently-tweaked knobs with their effect, with structural/rare edits (add/
remove a parameter, edit a formula, manage palettes) staying in the full editor.

### 2.3 Design: inline expander, and the two-controls tension (ADR-0019 Rule 3 / C1 / C3)

The task's own framing is the crux: an expander in the analysis tab and
`PaletteEditor.vue`'s parameter list cannot **both** be independent editors of
`AnalysisEnvironment.parameters` — that is exactly C1's refused shape ("one slot
surfaced as two editable/mirrored controls") and exactly Rule 3's refused shape
("rendering one value under two headings — editable or as a 'convenience'
mirror — falsifies the navigation hierarchy's unique-placement claim"). This
holds even though both surfaces would bind the *same* `mutateProfile` setter and
the *same* store path — C1's bijectivity is stated over controls, not over
underlying storage; two live-mounted widgets writing one slot are two controls
regardless of whether their code is deduplicated into one shared component.

Two ways to resolve it honestly, per the task's framing:

**Option 1 — Navigation-to-the-one-home, home relocated.** Recut the topology so
`parameters` (only) is no longer a Settings fact at all: its one true home
becomes the analysis-tab expander. `PaletteEditor.vue`'s parameter list is
removed as an editing surface and replaced with a single non-mirroring pointer
("Parameters are edited from a board's Analysis tab — no value shown here, so
there is nothing to desync"). Everything else `PaletteEditor` owns today —
`symbols`, `delta_fn`/`summary_fn`/`state_fns` formula bodies,
`parameter_meta` (qEUBO range/control declarations), and palette CRUD
(add/rename/delete a whole palette) — stays exclusively in Settings, because
those *are* different facts (different slots on `AnalysisEnvironment`), not the
same fact under two headings, so relocating only `parameters` doesn't touch
them. `Tradeoff:` Settings' "Analysis Environment" sub-tab now edits nothing a
user would casually tune day-to-day (which is arguably correct — it becomes the
"structural" editor the genre calls for), but a user who lands there looking for
"where do I change the weight on X" needs the pointer to actually be findable,
and if no board is open there's nowhere to jump to (mitigate: the pointer names
the destination in words; it doesn't need a live board to be *true*, only to be
*actionable* — acceptable, since parameter tuning is meaningless without a board
to observe the effect on anyway).

**Option 2 — Sanctioned live-binding pattern (rejected here).** Keep exactly one
mounted editor at a time via `<Teleport>` — the parameter-list widget's DOM
physically renders wherever it's currently teleported to (Settings when Settings
is open, the analysis-tab expander when the expander is open), backed by one
Vue component instance, so at any instant there is exactly one control. This
technically satisfies "one control" at every point in time, but it is a
significantly more novel mechanism than the genre exemplars exhibit (none of
KaTrain / OGS / IDE quick-settings use a single-instance-teleported-between-
panels editor — they use exactly Option 1's shape, a curated subset relocated or
duplicated-as-read-only-summary at most) and it reintroduces a live "is the
control here or over there right now?" state the operator has to track, which is
its own hidden-dependency risk (Green & Petre) even though it isn't technically
a duplicate-writer bug. Named for completeness; not recommended.

**Recommendation: Option 1.** It matches the genre exemplars' own resolution of
this exact tension (curate a subset, relocate it, point from the old home to the
new one in words only), requires no new Vue mechanism, and is the only option
that is trivially C1/C3/Rule-3-clean by construction rather than by discipline
maintained across two mount sites.

### 2.4 Composable shape (logic stays out of components)

`updateParameterValue`'s qEUBO hard-claim guard currently lives inline in
`PaletteEditor.vue`'s `<script setup>` (`:88-111`) — logic in a component,
pre-existing and out of scope to fully fix here, but the new expander must not
compound it by re-inlining the same guard a second time. Extract once, consumed
once (post-relocation, only the expander needs it):

```ts
// frontend/src/composables/analysis/useAnalysisEnvParameters.ts
export interface AnalysisEnvParameter {
  name: string;
  value: number;
  meta?: ParameterMeta;
  locked: boolean;        // true when qEUBO holds a hard claim
  lockedBy?: string;      // claim.consumerId, for the disabled-state tooltip
}

export function useAnalysisEnvParameters(): {
  parameters: ComputedRef<AnalysisEnvParameter[]>;
  setParameter: (name: string, value: number) => void; // no-ops + surfaces the
                                                         // same locked message
                                                         // on a hard claim
} { /* wraps store.profile.settings.engine.katago.analysis_env.parameters via
        mutateProfile; the sole factory for this mutation, post-relocation */ }
```

The expander SFC (new, small — e.g.
`frontend/src/components/editors/AnalysisParametersExpander.vue`, mounted from
`AnalysisControls.vue` next to the existing palette-selector header row) is pure
wiring: a `<details>`/collapsible list over `useAnalysisEnvParameters().parameters`,
one number input per row bound via `setParameter`. No business logic in the SFC.

### 2.5 Touched-file inventory

- `frontend/src/composables/analysis/useAnalysisEnvParameters.ts` (new) — the
  extracted mutation/lock logic, sole factory.
- `frontend/src/components/editors/AnalysisParametersExpander.vue` (new) — the
  inline collapsible, mounted in `AnalysisControls.vue`'s header area.
- `frontend/src/components/editors/AnalysisControls.vue` — mount the expander.
- `frontend/src/components/editors/PaletteEditor.vue` — remove
  `updateParameterValue`/`addParameter`'s parameter-*value*-editing UI and its
  inline hard-claim guard (parameter *declaration*, i.e. adding a new named
  parameter with a default and `ParameterMeta`, arguably stays here as a
  structural/rare act distinct from tuning its value — name this as its own
  small decision at implementation time); replace the parameter detail pane with
  the pointer text.
- `frontend/FILES.md` — two new rows, `PaletteEditor.vue`'s line retagged for
  reduced scope.
- `frontend/IDENTIFIERS.md` — no new identifiers (no new keyed cache; reuses
  existing `KnobId`/claim machinery as-is).

### 2.6 Acceptance handles

- Criterion: "editing a parameter in the analysis-tab expander is visible in
  every other consumer of `analysis_env.parameters` (chart re-render on next
  packet, `PaletteEditor`'s remaining symbol/formula views if they reference the
  parameter name) without a page reload." Evidence: integration test binding
  `useAnalysisEnvParameters` against the real store and asserting
  `store.profile.settings.engine.katago.analysis_env.parameters[name]` updates
  synchronously.
- Criterion: "no slot is bound to two live controls" — the C1 property. Evidence:
  a grep-able invariant (only one file, post-change, calls `setParameter`/writes
  `analysis_env.parameters[...]`) rather than a runtime test, since the fix is
  structural (relocation, not simultaneous mounts).
- Playwright witness: open a board with an active palette, expand the new
  parameters panel in the analysis tab, change a value, screenshot the chart
  before/after re-render — zero navigation away from the board tab in the
  recorded interaction. Second screenshot: Settings → Analysis Environment shows
  the pointer text, not a stale/duplicate value.

### 2.7 Size estimate

Small-to-medium: one composable extraction (mechanical, low risk), one new small
SFC (well under the 250-line SFC budget), one existing SFC's parameter pane
removed and replaced with static text. No store schema change, no migration —
`analysis_env.parameters`'s shape and storage are untouched, only which
component may write it moves.
