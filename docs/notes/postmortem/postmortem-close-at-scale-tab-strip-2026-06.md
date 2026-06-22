# Postmortem — Close-at-Scale Tab-Strip Storm (board-count-scaling recurrence, 2026-06)

- **Date filed:** 2026-06-22
- **Status:** Performance + memory class confirmed by a CDP trace capture on
  `main` @ `bbd4fe8b`; root causes diagnosed from the trace plus a static
  code-read; no fix shipped (this note scopes the *why-it-recurred* question
  and the mechanization proposals, not the fix).
- **Audience:** Author + LLM collaborators. The focus is why the existing
  preventive nets did not catch this class, not blame — the nets are good and
  the code that tripped them was written carefully.
- **Scope:** The `close-at-scale` perf scenario
  (`frontend/src/composables/perf/closeAtScale.ts`) opened ~230 boards (each
  forwarded to move 50) and closed them all in the heaviest order — the front
  / active board, one per frame — under a headed-Chromium CDP trace. The
  profile surfaced a board-count-scaling cost and a close-path retention leak
  that recurred despite ADR-0010, the `frontend/CLAUDE.md` footgun checklist,
  the 2026-05-29 render-coupling postmortem, and the 2026-05-31 green-arc
  audit's mechanization (the render-count harness).

---

## TL;DR

Closing one board re-rendered *every remaining* board tab. Over 230 closes
that is ∑(231…2) ≈ 26,795 `BoardTab` renders — the trace measured 26,797 —
each doing a full variation-path walk for its rugplot meter. The cost is
O(N²) in the open-board count and accounted for ~78% of close-phase CPU
(~37.8 s cumulative main-thread time to close 230 boards). The root cause is a
single token: `index` sits inside the `v-memo` key in
`SidebarWidget.vue` (line ~134-146). Closing a board reindexes every later
board, so every remaining tab's `index` changes, the memo busts for all of
them, and the whole list re-renders synchronously — exactly the "whole-group
memo over a churning list re-renders O(N) in one synchronous burst" footgun
the `frontend/CLAUDE.md` checklist names verbatim, and the same
group-memo-over-a-churning-source tail risk the TreeWidget worklog recorded
in 2026-05-30.

Two things made this slip past every net:

1. **The nets target a different signature.** ADR-0010, the prior postmortem,
   the green-arc audit, and the render-count harness all target the *render ≫
   patch* shape — render-coupling, a *per-nav / per-packet* cost where the
   render function re-runs but the patch is cheap. This case has **render ÷
   patch = 1.00** (the render genuinely produces a different list and the
   patch is real work), and it is a **per-close / per-list-mutation** storm
   that only appears **at scale (N boards)**. The canonical perf battery tops
   out at **16 boards** (`TOTAL_BOARDS = 16` in `jankSubstrate.ts`), and the
   2026-06-12 jank-extended study read *R/P = 1.00 for every component* as the
   healthy signal — which it is, at 16 boards. No net exercised the regime
   where a per-close O(N) re-render becomes O(N²).

2. **The retention leak is a different class entirely.** The DOM/listener
   accumulation on the close path is a resource-ownership-at-mutation-sites
   shape, not a render-coupling shape — and it was never audited at scale.

The `v-memo`-key-derived-from-`index` defect is precisely the
checklist's "v-memo keys must be reference-stable" item, and it shipped
anyway, because that item is *residue* — no lint, no test, no profile under 16
boards catches it.

---

## 1. The symptom, factually

The maintainer's framing: this performance + memory class "has happened
before" and was supposed to be prevented by existing ADRs, at least one prior
postmortem, and an ADR-0011-style audit — yet recurred. The trace bears out
both the recurrence and that the existing nets, read against the new
signature, would (and did) report green.

Supporting artifacts (user-local, referenced per ADR-0009's profile-share
convention):

- Trace: `~/w/vdc/chromium_profiles/close-at-scale-2026-06-22T15-31-22-384Z.json`
- Cost-vs-remaining plot: `~/plots/close-at-scale-cost-vs-remaining.png`
- CSVs: `~/plots/close-at-scale-{closes,counters}.csv`
- Scenario: `frontend/src/composables/perf/closeAtScale.ts` plus
  `setUpManyBoards` in `frontend/src/composables/perf/jankSubstrate.ts`

---

## 2. The at-scale evidence

The scenario closes board index 0 (also the active board) one per frame, which
is the strictly heaviest single-board-at-a-time teardown order: each
`store.boards.splice(0, 1)` shifts every remaining element, and closing the
active board exercises `closeBoard`'s active-index reselection every iteration
(`closeAtScale.ts`'s own header documents this choice). Three findings.

### 2.1 O(N²) close-time render storm — the dominant cost

`BoardTab` re-rendered **26,797 times** across 230 closes. The sum of "boards
remaining at each close" — ∑ from 231 down to 2 — is **26,795**. The two-render
discrepancy is noise; the match is the diagnosis: **every close re-renders
every remaining tab.**

Per-close main-thread cost fit cleanly to **36 ms fixed + 1.10 ms/board**:
~290 ms/close at 230 boards open, falling as the rail empties. Cumulative:
**~37.8 s of main-thread time** to close 230 boards. This render storm is
**~78% of close-phase CPU**.

Note the ratio: **R/P (render ÷ patch) = 1.00**. This is *not* the classic
render-coupling shape (render ≫ patch). Each remaining tab's render genuinely
produces a changed vnode tree (the rugplot recolour from a real
variation-path walk, ~1.10 ms/tab) and the patch genuinely applies it — render
and patch are both real, in equal measure. The pathology is not that a cheap
patch hides behind an expensive render; it is that the *count* of full
render+patch cycles is O(N) per close and O(N²) over the run.

### 2.2 DOM / listener accumulation — a close-path retention leak

Over the run (closing 229 of 230 boards), the `UpdateCounters` track shows:

- **Live DOM nodes:** ~6,669 (231 boards open) climbing to ~105,503 (2 boards
  open), peaking ~185,531.
- **JS event listeners:** ~1,517 climbing to ~13,857, peaking ~20,724.

Closing a board does **not** promptly reclaim its tab's DOM and listeners. Two
batch GC teardowns fire partway through, but **105k nodes remained when only 2
boards were left** — gross over-retention, since two boards' worth of tab DOM
is a few thousand nodes, not a hundred thousand.

The JS heap saw-tooths 145 → 121 MB with major GCs and only weakly correlates
with the DOM-node count, because **DOM-node memory lives Blink/C++-side, not in
the V8 heap** — so the heap trace is *not* the leak signal here; the `nodes`
and `jsEventListeners` `UpdateCounters` are. (A reader who watches only the
heap saw-tooth concludes "GC is keeping up" and misses the leak entirely;
naming which counter is load-bearing is the ADR-0002 move.)

The tab strip is also **not virtualized**: all N `BoardTab`s render
simultaneously, each ~800 DOM nodes including its mini-board / rugplot. At 230
boards that is ~185k nodes live *before* any close — the peak the counters
record. Virtualization is the structural ceiling on both the peak and, by
limiting how many detached subtrees exist to be reclaimed, the leak's blast
radius.

### 2.3 The fixed per-close floor (~22%, ~36 ms/close)

The remaining ~22% is a per-close floor, diagnosed *statically* (not split out
of the call tree), so it is presented as a floor and a list of contributors,
not as exact percentages:

- **Active-board re-render on reselection.** Closing the active board reselects
  a new active board every iteration, re-rendering the active board surface.
- **The SyncService `{ deep: true }` watcher** re-traversing per-board
  `store.session` cells on each close (`frontend/src/services/sync-service.ts`,
  the `startWatcher` deep watch over `[boardsVersion, activeBoardIndex,
  profile, session]` at ~line 188).
- **The two per-board reconcile watchers** (`useAutoSaveAnalyses`,
  `useAppBootstrap`), each fired on every `boardsSetVersion` bump.
  `closeBoard` bumps `boardsSetVersion` on *every* close (`store/index.ts:580`),
  and each reconcile loop is **O(N) on the current board set**
  (`useAutoSaveAnalyses.ts:234-239`, "the diff loop is O(N) on each set
  change") — so this floor is itself ∑O(N) = O(N²) cumulative, merely dominated
  by the render storm. It is a floor only in the sense that it is not the
  headline; it scales the same way.

---

## 3. The three findings and their root causes

### Finding 1 — `index` in the `v-memo` key (the render storm)

**Site:** `frontend/src/components/chrome/SidebarWidget.vue`, the
`thumb-list` `v-for` (template lines ~134-146):

```
<BoardTab
  v-for="(board, index) in store.boards"
  :key="board.id"
  v-memo="[board, index, store.activeBoardIndex === index, getReviewState(board.id)]"
  ... />
```

The `:key` is correct (`board.id`, reference-stable). The defect is `index`
inside the `v-memo` key. Closing any board reindexes every board after it, so
every remaining tab's `index` changes by one, every remaining tab's memo key
compares unequal to the previous render, the memo busts for all of them, and
the entire list re-renders in one synchronous burst. Each busted tab then does
a full variation-path walk for its rugplot meter (~1.10 ms), so the burst is
not free per item.

This is **not** a careless oversight, and the in-file comment proves the author
reasoned about exactly this token. The comment block at lines ~121-133 names
`index` as carrying "the 'Board N' label after a close-induced reindex" — i.e.
`index` is in the memo key *deliberately, so the displayed label updates when a
close shifts a board's position*. The author saw that the index changes on
close and put it in the key to keep the label correct; what was not visible was
that this makes the memo bust *for the entire remainder of the list* on *every*
close, turning a correctness fix for the label into an O(N²) render driver.
That invisibility — the cost being structurally hidden at authoring and
typecheck time and only emerging in aggregate at scale — is the ADR-0002
silent-failure class in the performance register (ADR-0009), and it is the same
root the render-coupling postmortem named: the cost is real, automatic, and
unobservable until a profile at the right scale runs.

The label can be kept correct without busting the memo (e.g. read the index
inside `BoardTab` from a reference-stable source, or compute the label outside
the memoised key), so the fix does not force giving up the label update. That
is the fix's shape; the postmortem stops at the diagnosis per its scope.

### Finding 2 — close-path DOM/listener over-retention (the leak)

**Class:** resource-ownership-at-mutation-sites, *not* render-coupling.

`closeBoard` (`frontend/src/store/index.ts:504-581`) is meticulous about the
**external resources keyed by `BoardId`** — it drains the
`BOARD_SCOPED_STORE_CELLS` registry inline and runs owner-registered teardown
handlers for the ledger, stability-trajectory store, thumbnails, card-trees,
analysis-persistence, review aborts, and the engine stop, all in a documented
order, all before the splice. That is the discipline `frontend/CLAUDE.md`'s
"Resource ownership at mutation sites" section codifies, and it is honoured.

But the retention finding is about a different thing entirely: the **`BoardTab`
component instances' own DOM and listeners**. Unmounting a tab is Vue's job,
driven by the `v-for` reconcile when `store.boards` shrinks — not something
`closeBoard` wires. The trace shows those detached subtrees (each tab's
canvas, its `ResizeObserver`, the hover listeners on `.thumb-container`) are
not reclaimed promptly: 105k nodes survive down to 2 boards. The likely
contributing mechanisms, in order of plausibility, are:

- **The render storm itself prolongs retention.** Re-rendering all remaining
  tabs on every close keeps the reconciler and the GC chasing a moving target;
  the just-detached tab's subtree competes with a fresh O(N) render burst for
  reclamation. Fixing Finding 1 should reduce, though not necessarily
  eliminate, the retention pressure.
- **The unvirtualized strip** holds all N tabs live at once, so the peak
  (~185k nodes) is structural and the population of detached-but-not-yet-GC'd
  subtrees at any moment is large.
- **Per-tab imperative resources** — `BoardTab` registers a `ResizeObserver`
  and disconnects it in `onUnmounted` (`BoardTab.vue:177-180`), which is
  correct; the docked-preview hover path in `SidebarWidget` clears its visible
  state synchronously. So the per-component release wiring appears present.
  The over-retention therefore points more at *batched/lagged unmount
  reclamation under the render storm* than at a missing `onUnmounted` release —
  but confirming the exact retention mechanism (detached-node retention vs a
  specific listener not released vs Blink-side lag) needs a heap-snapshot
  retainer-path read, which this static diagnosis did not do and which the fix
  work should.

The honest statement is: the leak is real and large, it is a different class
from the render storm, and it was **never audited at scale**. The
resource-ownership audit (`docs/archive/notes/resource-ownership-audit-plan.md`)
and the board-scope note examined the *board-keyed external resource* class;
neither examined "what does the DOM/listener population do when you close N
boards in sequence," because no harness ever closed N boards in sequence.

### Finding 3 — the fixed per-close floor

Covered in §2.3. Root cause: the close path does per-close work that is O(N)
in the open-board count — the SyncService deep re-traversal of `store.session`,
and the two `boardsSetVersion`-fired reconcile loops — each negligible at 16
boards and ∑O(N) = O(N²) at 230. These are correct, idiomatic constructions
(a deep watch where there is no version counter; an O(N) reconcile that is
itself the headline win over the prior global watcher) whose cost only bites
in a regime no one had run.

---

## 4. The prior art that should have prevented it

The codebase had paid, repeatedly, for lessons in this exact family. Each
relevant piece, read end to end for this postmortem:

- **ADR-0010 (render locality and canvas for data-dense visuals).** Its
  read-locality corollary is stated verbatim — *"`v-memo` and 'pull the
  element out of the loop' fix the patch, not the render; a reactive read
  anywhere in a template re-runs the whole render function; render ≫ patch is
  the tell."* The tenet is the central prior art on `v-memo` semantics. But
  its corollary is framed around *render ≫ patch* — the render-coupling
  signature — and the green-arc context that produced it (`BoardTab` rugplot,
  `TreeWidget`) was a *per-nav / per-packet* regime. The tenet's named trap is
  "memo fixes the patch not the render"; the new defect is the *adjacent*
  trap — "a group memo over a churning list re-renders the whole list O(N) per
  mutation" — which the tenet does not name (the checklist does; see below).

- **`frontend/CLAUDE.md` "Vue/CSS footgun checklist".** This already lists the
  exact item, verbatim: *"`v-memo` keys must be reference-stable — check the
  source's reactivity shape before memoising… A whole-group memo over a
  churning list is worse: it re-renders the full list O(N) in one synchronous
  burst when the array ref churns — per-item memo is the robust form."* The
  SidebarWidget memo is a per-item memo (good — the `v-for` carries one memo
  per tab), but its *key contains a value that churns across the whole list on
  one mutation* (`index`), which produces the same O(N)-synchronous-burst
  outcome the checklist warns about, by a path the checklist's phrasing
  (centred on the *array ref* churning) does not literally cover. The lesson
  was on the page; the residue nature of the checklist (next section) is why
  it did not bind.

- **The 2026-05-30 TreeWidget worklog**
  (`docs/worklog/2026-05-30-perf-treewidget-nav-cost.md`). It recorded the same
  class precisely: *"Group `v-memo` over a list is an O(N)-burst tail risk
  when the source array ref churns; per-item is robust"* — and *"`v-memo` only
  skips when its key is reference-stable… check the reactivity shape of the
  source before adding a memo."* This is the closest prior art to the present
  defect. It lived in a worklog, cited by the checklist, but not in any
  mechanized form.

- **The 2026-05-29 render-coupling postmortem.** Named the *render-coupling*
  pattern (composition node reads a high-frequency value), found four
  instances, and proposed the tenet that became ADR-0010. Its scope is
  per-nav/per-packet coupling at composition nodes; a per-list-mutation
  group-memo-bust at scale is a different instance of "cost invisible until
  profiled," not the same shape, so it is unsurprising — but worth stating —
  that this postmortem's instance sweep would not have found the SidebarWidget
  memo (the sweep keyed on high-frequency reactive *source reads*, not on memo
  *key composition*).

- **The 2026-05-31 green-arc audit**
  (`docs/notes/audit/opus-audit-green-perf-arc-2026-05-31.md`). This is the
  audit the maintainer's "ADR-0011 audit" reference most plausibly points at:
  it is the principal-engineer post-mortem that ranked the render-locality
  tenet P1 and proposed (P4) the render-count regression harness that became
  the codebase's mechanization for this family. Its P4 explicitly seeded the
  harness "with the four components this arc just fixed (TreeWidget, BoardTab,
  timeline, ChartPreviewBox) as regression guards." That scoping — *per
  component, at a single instance* — is exactly the boundary this defect fell
  outside (next section).

- **ADR-0011 (mechanization discipline).** Rule 4: *"Nets quantify over the
  class, not the instance. Enumerations of instances fail open at the next
  instance."* The render-count harness, as built, guards *named component
  instances* against the *render-coupling signature* — it is an instance-and-
  signature-scoped net, and this defect is the next instance, in a sibling
  signature, at a scale the net does not reach. That is precisely the
  fail-open Rule 4 predicts.

---

## 5. The gap analysis — why each net missed it

Stated precisely, net by net.

### 5.1 The signature gap: render ÷ patch = 1.0, not render ≫ patch

Every render-side net in the corpus keys on the **render ≫ patch** signature.
ADR-0010's corollary, ADR-0009's component-cost ranking (*"render ≫ patch is
read as render-coupling"*), the render-count harness (which "counts the
*render*, not the *patch* — which is the whole point"), and the 2026-06-12
study's verdict (*"Render÷patch ratio 1.00 for every component… no
render-coupling was introduced anywhere"*) all treat **R/P = 1.0 as the
healthy reading**.

For this defect R/P *is* 1.0 — and that is correct, because the render really
does produce a changed tree and the patch really applies it. The pathology is
not in the ratio; it is in the **count of full render+patch cycles per
list-mutation**, which is O(N), summing to O(N²) across N closes. A net that
reads R/P = 1.0 as "fine" is structurally blind to a defect whose entire cost
is *count × N*, not *render/patch imbalance*. The render-count harness counts
renders — it could in principle catch this — but it asserts a per-component
bound (`renderCount() === 0` on a high-frequency event), driven against a
*single mounted instance*. It has no notion of "the list re-rendered O(N) tabs
on one close," because it never mounts the list and never mutates it.

### 5.2 The scale gap: the battery tops out at 16 boards

The canonical perf battery is the 16-board rail (`TOTAL_BOARDS = 16`,
`jankSubstrate.ts`). The 2026-06-12 jank-extended study — the standing stress
test — validated the SPA at 16 boards (p50 ~14.7 ms, no regression) and
explicitly recorded R/P = 1.00 across the board as the null-result signal. The
`close-at-scale` scenario's own header names this: *"the close / switch path
has several costs that are negligible at 16 but scale with the open-board
count."* A per-close O(N) re-render at N = 16 costs ~16 renders; at N = 230 it
costs ~230, and the *cumulative* O(N²) only becomes a 37.8 s wall at the larger
N. **No prior net exercised a board count past 16**, so the regime where this
class becomes visible was never entered. The battery measured the wrong axis:
it varied nav/packet frequency at fixed small N, never N at fixed mutation.

### 5.3 The class gap: the retention leak was never audited at scale

The resource-ownership-at-mutation-sites discipline and its audit examined the
*board-keyed external resource* class — the cells, ledgers, thumbnails,
listeners a `closeBoard` must release. That audit is sound and `closeBoard`
honours it. But the DOM/listener over-retention of the *component instances
themselves under sequential close at scale* is a different class — a
reconcile/GC-lag-plus-unvirtualized-strip interaction — and no audit or harness
ever closed N boards in sequence to observe the DOM-node and listener counters
climb. The discipline's lens (per-mutation-site resource release) is correct
but was applied per-board, never per-N-board-sequence; the leak lives in the
aggregate the discipline did not measure.

### 5.4 The residue gap: the checklist item has no lint

The `v-memo`-keys-must-be-reference-stable item is, by the checklist's own
admission, **residue** — one of "the remaining three… no lint or test can
catch them, so this checklist is their home." A checklist item is, in ADR-0011
Rule 1 terms, **review-only** — "legitimate but presumptively decaying." It
binds only when a reviewer happens to consult it while reading the exact memo,
and it did not bind here, partly because the author's attention was correctly
on the *label-correctness* reason for putting `index` in the key, and the
checklist phrasing centres on the *array ref churning* (not on a per-item
key-leg that churns across the list on a structural mutation). Residue plus a
phrasing that does not literally cover the `index`-derived sub-case is exactly
the fail-open ADR-0011 Rule 2 says a recurrence should convert to a mechanism,
not more prose.

---

## 6. Recommendations for mechanization

Per ADR-0011 Rule 2 (recurrence converts to mechanism at the strongest
feasible-and-proportionate surface) and Rule 4 (quantify over the class).
Ordered by leverage. None are mandates; the maintainer weighs them, and each
that is adopted is filed as a work-status item (Rule 2 / ADR-0005 Rule 10).

1. **A board-count-scaling regime in the perf battery (the substrate now
   exists).** The single highest-leverage move is to make "vary N, not just
   frequency" a first-class axis. The `close-at-scale` scenario *is* exactly
   that substrate — it already exists as the at-scale close harness. Promote it
   (or a sibling) to a standing battery member alongside `jank-extended`, so
   the regime that hid this class is entered on a cadence rather than only when
   a maintainer goes looking. (ADR-0009 surface; advisory/standing-capture.)

2. **An O(N²)-render / render-count-vs-N ratchet.** A test or capture-derived
   ratchet that drives a *list mutation* (close a board) at two or more board
   counts and asserts the *total* render count scales **sub-quadratically** in
   N — i.e. that closing one board does not re-render Θ(N) tabs. This is the
   render-count harness's idea lifted from "per-instance, per-frequency" to
   "per-list, per-mutation, vs N," which is where ADR-0011 Rule 4 says the net
   should live (over the class, not the instance). It catches the present
   defect by construction and any future group-memo-key churn the same way.
   (Build/CI-gate surface, if it can be made deterministic under jsdom;
   advisory/capture otherwise.)

3. **A DOM-nodes-per-board (and listeners-per-board) ceiling.** A capture-time
   assertion that live `nodes` / `jsEventListeners` after closing down to k
   boards is within a bounded multiple of k — turning the §2.2 over-retention
   from a profile-only finding into a checkable one. Pairs naturally with (1):
   the same `close-at-scale` trace already carries the `UpdateCounters` this
   reads. (Advisory/capture surface; the counters are Blink-side, so this is a
   trace-assertion, not a unit test.)

4. **A lint for `v-memo` keys derived from a list index or other churning
   value.** A custom ESLint rule (the frontend has a flat-config host and local
   rules) that flags a `v-memo` array literal containing the `v-for` index
   binding, or a value transitively derived from it. This is the residue item
   (§5.4) converted to mechanism per ADR-0011 Rule 2 — a name/shape predicate
   over the class (Rule 4), not an instance enumeration. Measure-first per Rule
   3: census the tree for existing `v-memo` index uses before picking severity;
   adopt at `error` only on a triaged baseline. (Build/CI-gate surface.)

5. **Virtualize the tab strip (structural, lower urgency).** The unvirtualized
   strip is the ceiling on the §2.2 peak (~185k nodes at 230 boards before any
   close). Virtualization caps the live-node population to the visible window
   and shrinks the detached-subtree population the GC must chase. This is a
   refactor, not a net, and is lower urgency than (1)-(4) because the render
   storm (Finding 1) is the dominant cost and fixing it is cheaper; but it is
   the durable fix for the peak and the leak's blast radius.

---

## 7. Proposed work-status items

Proposed for the coordinator to file (this note does not write the work-status
DB). Each carries a descriptive slug so the handle resolves without the
maintainer's todo DB (per the stable-handles convention).

- **`fix-boardtab-vmemo-index-key`** — Remove the churning `index` from
  SidebarWidget's `BoardTab` `v-memo` key while preserving the "Board N" label
  update (Finding 1). The headline fix; ~78% of close-phase CPU.
- **`perf-board-count-scaling-battery`** — Promote `close-at-scale` (or a
  sibling) to a standing board-count-scaling battery member; record the
  baseline (Recommendation 1).
- **`net-render-count-vs-n-ratchet`** — A render-count-vs-N (sub-quadratic)
  ratchet over list mutations (Recommendation 2).
- **`net-dom-nodes-per-board-ceiling`** — A DOM-nodes / listeners-per-board
  trace-assertion ceiling (Recommendation 3).
- **`lint-vmemo-churning-key`** — An ESLint rule flagging `v-memo` keys derived
  from the `v-for` index or other churning values (Recommendation 4).
- **`fix-close-path-retention-leak`** — Investigate (heap-snapshot
  retainer-path read) and fix the close-path DOM/listener over-retention
  (Finding 2); may be partly subsumed by the Finding 1 fix and by tab-strip
  virtualization.
- **`perf-tabstrip-virtualization`** — Virtualize the board tab strip
  (Recommendation 5; structural, lower urgency).

---

## 8. Scope and caveats

- The render storm (Finding 1) and the at-scale counts (Findings 1-2) are
  trace-substantiated. The fixed per-close floor (Finding 3) and the precise
  retention *mechanism* (Finding 2) are **static** diagnoses — the floor was
  not call-tree-split into exact percentages, and the leak was not
  retainer-path-confirmed by heap snapshot. Both are presented as such.
- The "ADR-0011 audit" the maintainer references is read here as the
  2026-05-31 green-arc audit (the audit that ranked the render-locality tenet
  P1 and proposed the render-count harness, the codebase's mechanization for
  this family). If the maintainer meant a different audit, the gap analysis in
  §5 still holds — it turns on the harness's instance-and-signature scope, not
  on which audit named it.
- This is a point-in-time record (postmortem-dir convention): its
  cross-references reflect the state at authoring time and are not retro-edited
  to track later moves.

---

## Related

- **`docs/adr/0010-render-locality-and-canvas-for-data-dense-visuals.md`** —
  the central prior art on `v-memo` semantics; its render ≫ patch corollary is
  the signature this defect sits adjacent to (R/P = 1.0).
- **`docs/adr/0011-mechanization-discipline.md`** — Rules 2 (recurrence →
  mechanism) and 4 (quantify over the class) are the lens for §5-§6; the
  harness's instance scope is the fail-open Rule 4 predicts.
- **`docs/notes/postmortem/postmortem-render-coupling-at-composition-nodes-2026-05-29.md`**
  — the prior postmortem on the sibling (render-coupling) shape.
- **`docs/notes/audit/opus-audit-green-perf-arc-2026-05-31.md`** — the
  green-arc audit; its P4 scoped the render-count harness to named component
  instances.
- **`docs/worklog/2026-05-30-perf-treewidget-nav-cost.md`** — the closest prior
  record of the group-memo-over-a-churning-source O(N)-burst class.
- **`docs/worklog/2026-06-12-perf-jank-extended-study-results.md`** — the
  16-board standing stress study whose R/P = 1.00 null-result is the reading
  this defect hides behind.
- **`frontend/CLAUDE.md`** — the "Vue/CSS footgun checklist" (the
  reference-stable `v-memo`-key residue item) and the "Resource ownership at
  mutation sites" discipline (Finding 2's class).
- **`frontend/src/composables/perf/closeAtScale.ts`** /
  **`jankSubstrate.ts`** — the at-scale close substrate this postmortem
  recommends promoting to a standing battery member.

License: Public Domain (The Unlicense).
