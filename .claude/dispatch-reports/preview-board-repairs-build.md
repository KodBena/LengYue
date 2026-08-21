# Preview-board repairs — build report

Worktree base: a **stale checkout** was corrected mid-session. The
worktree's actual `HEAD` at start was `3378806f` (an old dependabot-merge
commit, unrelated to `lyt-phase2`) — none of the SETUP-toolkit / handicap
/ Learn Path surfaces existed there, which produced a false "this UI
doesn't exist" reading during initial investigation. Re-checked out to
the correct base per the mandate: `git log --oneline -1 lyt-phase2`
(local ref, in the main repo) names `82c3306e` — detached onto that
commit (`git checkout --detach 82c3306e`) before any of the work below.
An intermediate wrong turn also fetched `origin/lyt-phase2` (`148899f7`,
an ancestor of local `lyt-phase2` that is missing several already-merged
local commits, including the S4 status-bar fix `0705b900`) — corrected
before writing any code. Flagging this explicitly per the "worktree
stale base" discipline: every dispatch brief should open with a
base-freshness check, and this one needed two corrections before landing
on the right commit.

## Items 1–3 (handicap-not-visible / preview-not-autosized /
## preview-not-showing-PV) — investigated, NOT code-changed

All three screenshots trace to the same component: **`PreviewBoardPanel.vue`**
(the LYT `previewBoard` leaf, `.claude/dispatch-reports/
lyt-vue-realization-roadmap.md` §8 W2 item 3), the small wood-texture
square docked below the GAME TREE panel — not `ChartPreviewBox`/
`SidebarWidget`'s docked preview, which are a sibling family with
separate, unrelated code paths I also read but did not need to touch.

**Item 1 (handicap not visible).** Traced the full pipeline: `applyHandicap`
(`src/engine/handicap.ts`) → `applySetup` (`src/logic.ts`) → `updateBoardState`
(`src/store/index.ts`) → `activeBoard` computed → `PreviewBoardPanel.vue`'s
own `boardSnapshot` computed, which reads `board.stones` directly (not the
node-keyed thumbnail cache the `ChartPreviewBox`/`SidebarWidget` family
uses, so `applySetup`'s documented cache-invalidation caller-obligation
doesn't even apply here — this leaf isn't a consumer of that cache).
Every link in the chain returns/propagates a fresh `BoardState` with
`stones` correctly populated (confirmed against `tests/unit/engine/handicap.test.ts`,
already green, which pins `applyHandicap`'s stone placement). SGF-loaded
handicap games are separately covered by `sgf-loader.ts`'s explicit
"Project root setup stones" step. **I could not find a code-level defect
on this path by static analysis**, and did not have live-service access
to reproduce visually (browser/rig off-limits per the brief). I did not
write a passing-by-default reproduction test for this item, since a green
test here would be weak evidence either way (it would only re-confirm
what the static trace already shows) — flagging as **UNRESOLVED /
not reproduced**, not silently closed.

**Item 2 (preview not autosized).** `previewBoard`'s LYT track is a
DECLARED, DOCUMENTED `{ kind: 'fixed', px: 160 }` width in a row it shares
with `tree`/`controlPanel`, which both span the row's full (non-square)
height — so the cell is 160px wide × row-height tall, and
`PreviewBoardPanel.vue`'s own `min(100cqw, 100cqh)` CSS (its own header
comment cites a prior "W4 item 4" fix) correctly centers a 160×160 square
inside that tall cell, leaving vertical dead space above/below by design.
This exact trade-off — "keep the leaf SQUARE and FULLY VISIBLE... whichever
axis the cell is narrower on caps BOTH dimensions" — is a standing,
reviewed decision recorded in both `LytNode.vue`'s `.lyt-board-cell`
comment and `layout-model.ts`'s track-reservation comments (a W4
consult + multiple named review passes). Changing it means touching the
LYT layout engine's track/row model — explicitly the kind of change the
prior component-shoddiness pass (`component-shoddiness-build.md`) carved
out as out-of-scope ("the layout-allocation cluster... LYT layout
engine/authority/root-split code... not touched, per the brief"), and
this dispatch's own framing is "preview-board component family," not the
layout engine. **Not attempted** — flagging as a real, identified,
narrowing decision rather than silently declaring it fixed or silently
leaving it unmentioned. If the commissioner wants the dead-space
trade-off itself revisited (e.g. giving `previewBoard` its own
square-height row instead of sharing the tree/controlPanel row's height),
that is layout-engine work needing its own dispatch.

**Item 3 (PV/best-move variation not shown).** `PreviewBoardPanel.vue`'s
own header comment explicitly documents this as a **disclosed, deliberate
W2 scope narrowing**, not a silent regression: "mounts `activeBoard`'s own
current position... Upgrading to true variation-hover content is a later,
disclosed arc." Confirmed independently: `BoardSnapshot`
(`src/engine/board-geometry.ts`) has no PV/moveInfo field at all, and
neither `MiniBoardSvg.vue` nor `MiniBoardCanvas.vue` renders one — PV
rendering exists only on the main board (`MoveSuggestions.vue` +
`use-pv-animation.ts`), never on any MiniBoard-family thumbnail.
`useMoveSuggestions(getNodeId)` does expose a real, existing
`buildPvMoves(moveIndex)` I could tap without inventing new plumbing, but
wiring it into `PreviewBoardPanel` + both MiniBoard renderers + a parity
test is a genuine feature build, not a repair — and per this repo's own
"disclosed narrowing needs ratification" discipline, I'm not silently
implementing over a documented, disclosed scope decision without the
commissioner's sign-off. **Not attempted** — flagging for ratification,
not silently building or silently leaving unflagged.

## Item 4 (occluded status-bar names) — WITNESSED

Read commit `0705b900`'s S4 hunk in full (`.status-left`/`.status-right`/
`.move-badge`/`.game-info`/`.player-names`/`.komi-input` — the
anti-overlap, never-wrap fix) before touching anything, per the mandate.

**Root cause:** S4 gave `.player-names` `display: inline-flex` +
`text-overflow: ellipsis`. CSS `text-overflow: ellipsis` is specified (and
reliably implemented across engines) against the overflow of a run of
INLINE content in a block/inline box — it is **not** guaranteed to insert
the ellipsis glyph on a flex container with multiple flex-item children
(the two `.stone-chip` spans plus the interleaved name/"vs" text runs).
Browsers instead hard-clip the last partially-visible flex item with no
ellipsis inserted — exactly the witnessed "Black vs Whi" with no "…"
affordance.

**Fix (`frontend/src/components/board/StatusBar.vue`):**
- `.player-names`: `display: inline-flex; align-items: center; gap: ...`
  → `display: inline-block; vertical-align: middle;` (keeps `flex: 1 1
  auto; min-width: 32px; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis;` unchanged) — plain inline flow is the shape
  CSS ellipsis is actually specified for.
- `.stone-chip`: gains `vertical-align: middle; margin-right:
  var(--space-tight);` — replaces the `gap` that no longer applies
  outside a flex container; the "vs"/name spacing itself still comes
  from the template's own literal whitespace between text runs.
- New `playerNamesTitle` computed + `:title="playerNamesTitle"` on
  `.player-names` — a native tooltip carrying the full, untruncated
  "Black vs White" pairing, so an elided name is discoverable, never
  silently gone (mirrors `HyperparamPromptModal.vue`'s existing
  elided-value-on-hover convention, S9 of the prior audit).
- S4's anti-overlap/never-wrap properties (`.status-left { min-width: 0
  }`, `.status-right { flex-shrink: 0 }`, `.move-badge`/`.game-info`
  nowrap+`flex-shrink: 0`) are **untouched**.

**Test:** `frontend/tests/integration/status-bar-player-names-ellipsis.test.ts`
(new). Asserts: `.player-names` is not `flex`/`inline-flex` (the
regression this fix closes); the ellipsis/nowrap/overflow declarations
still apply; a `title` attribute carries both player names and tracks the
`metadata` prop (not a stale snapshot); the S4 anti-overlap/never-wrap
invariants on `.status-left`/`.status-right`/`.move-badge`/`.game-info`
are preserved (the "wrap-vs-clip trade cannot silently flip back"); the
narrow-mode `max-width: 90px` ceiling still applies. Follows the existing
`status-bar-hint-no-reflow.test.ts` convention of reading the real
`<style scoped>` block off disk and installing it before mounting, so
`getComputedStyle` reflects the actual project CSS.

**Evidentiary status: WITNESSED.**

## Discipline checks

- No `box-shadow`, `transition`, or `blur` introduced.
- Text stays `--text-0`; no new backgrounds introduced (item 4's fix is
  layout-only).
- `StatusBar.vue` already carried its ADR-0006 header; unchanged.
- Items 1–3: no code touched, so no FILES.md/header discipline applies.
  No documentation-graph implications from item 4 (component-local CSS +
  test fix, no user-facing capability change, no doc-structure change).

## Verification (WITNESSED, literal exit codes)

```
$ npm run build                                                    → exit 0
$ npx vitest run --changed=82c3306e04c3be64cdc5a6d67592bea493486d7a \
    --maxWorkers=2   (NODE_OPTIONS=--max-old-space-size=2048)       → exit 0
  (7 files, 41 tests passed)
```

No live-service contact was made (ports 4173/5173/5174/8764,
192.168.122.68:1235 all untouched) — verification is build + targeted-test
based, per the brief's accelerated-policy gate (not the full suite).

## Summary for the coordinator

Item 4 is a real, witnessed fix with its own regression test. Items 1–3
are investigated but **not code-changed**: item 1 found no reproducible
defect on the live-board→preview path by static trace (worth a live-rig
re-check before assuming the screenshot is stale); item 2 is a
standing, deliberately-reviewed LYT layout trade-off, out of this
dispatch's component-local scope; item 3 is an already-disclosed,
not-yet-ratified scope narrowing documented in the component's own
header. None of the three should be read as "fixed" — narrowing this
build to item 4 alone is itself the disclosure this report makes,
surfaced rather than silently absorbed.
