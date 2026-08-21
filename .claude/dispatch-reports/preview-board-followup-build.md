# Preview-board follow-up — build report

Worktree base: verified clean. `git log --oneline -1` in the worktree
already named `427153bc` (the mandate's target commit, and `lyt-phase2`'s
own tip) — `git checkout --detach 427153bc` was a no-op confirmation, not
a correction. No stale-base repair needed this time.

Read `.claude/dispatch-reports/preview-board-repairs-build.md` (the
inherited investigation) end to end before touching anything, per the
mandate.

## Item 1 — status-bar names, REOPENED

**Root cause (two independent defects, both live-witnessed).**

(a) **Starved despite available space.** `.status-left` (the flex
container holding the move-nav cluster, move badge, and `.player-names`)
never declared its own `flex-grow` — the shorthand default is `flex: 0 1
auto`. As a flex item of `.status-bar`, it therefore never claimed any
of the bar's surplus width; `.transient-hint` (`flex: 1 1 0`) was the
*only* growing child, so 100% of any spare bar width went there
regardless of whether it needed it. `.player-names`' own `flex: 1 1
auto` was consequently **inert**: a flex-grow factor can only
redistribute positive free space *within its own containing flex
context*, and `.status-left` never had any to redistribute — its
rendered width was always exactly its children's bare content sum, no
matter how much blank bar remained to the right. This matches the
commissioner's screenshots exactly: `.player-names` rendering at its own
unclamped-but-still-small content width while acres of `.status-bar`
sat empty. Live-rig confirmation (headless Chromium, 1920×1080,
`.claude/worktrees/.../frontend/scripts/repro-followup.mjs`): before the
fix, `.player-names` measured **119.75px** wide (`scrollWidth ===
clientWidth === 120`, i.e. genuinely non-clipped — the default "Black" /
"White" strings just happen to fit in that starved box). After adding
`flex: 1 1 auto` to `.status-left`, the SAME state's `.player-names`
measured **279.72px** wide — it now visibly claims real surplus.

(b) **First-takes-all tail elision** (the part of the mandate's
contract this reopens most directly). The single `.player-names` blob
carried ONE `text-overflow: ellipsis` over the whole "● Black vs ○
White" run. Under narrowing, CSS ellipsis always eats from the tail —
so Black's name (head of the run) was structurally guaranteed to
survive intact while White's name (tail) was the only one ever
truncated, all the way to nothing. That is the exact "● Black vs ○"
shape in both commissioner screenshots.

**Fix (`frontend/src/components/board/StatusBar.vue`):**

- `.status-left` gains `flex: 1 1 auto` (was bare `display: flex`) —
  now genuinely competes with `.transient-hint` for the bar's surplus;
  whatever share it wins flows into `.player-names`, its sole
  `flex-grow` child.
- `.player-names` becomes a `display: flex` ROW of two independently-
  ellipsizing children — `.player-name.player-name--black` and
  `.player-name.player-name--white`, each `flex: 1 1 0; min-width: 0`
  (equal basis, equal growth — a constrained `.player-names` width
  therefore splits EVENLY between them) and each its own plain
  `display: inline-block` (not flex — ellipsis needs inline flow, the
  same lesson the prior item-4 fix already established, now applied
  per-name instead of to the whole pairing) with its own
  `overflow:hidden; text-overflow:ellipsis; white-space:nowrap`. A new
  `.vs-text` span carries the literal "vs" text, `flex-shrink: 0`.
- `.status-bar--narrow .player-names`'s existing `max-width: 90px`
  ceiling is UNCHANGED — because `.player-names` is now a flex row of
  two equal-share children, constraining its own width automatically
  and mechanically splits the squeeze evenly, no separate per-name rule
  needed.
- `:title="playerNamesTitle"` (the full "Black vs White" tooltip) is
  unchanged, still on the outer `.player-names`.
- `.stone-chip`'s spacing comment updated to reflect that it now sits
  inside a plain-inline-block `.player-name`, not the old unified blob.

**Tests:**
- `frontend/tests/integration/status-bar-player-names-ellipsis.test.ts`
  — rewritten. New assertions: wide-width DOM text is never JS-truncated
  (contract a, the CSS-invisible-to-jsdom half); `.status-left` carries
  a non-zero `flex-grow` (closes the inert-flex-grow defect directly,
  independent of any renderer's content-width quirks); `.player-names`
  is a flex row of two children, neither itself a flex container
  (ellipsis-needs-inline-flow, per-name now); both children carry
  IDENTICAL ellipsis/flex declarations (the symmetry itself is the
  "neither name is structurally privileged" assertion — contract b);
  narrow-mode ceiling still applies, both children still ellipsize
  under it. All S4 anti-overlap/never-wrap invariants re-asserted,
  unchanged.
- `frontend/tests/integration/StatusBar-narrow-no-overflow.test.ts` —
  one test updated (`.player-names` no longer directly carries the
  ellipsis declarations itself; both `.player-name--black`/`--white`
  now do, asserted on both).
- The arithmetic no-overflow tests in that same file are untouched
  (`PLAYER_NAMES_CAPPED_PX` is about the outer box's width, unaffected
  by the internal split).

**Evidentiary status: WITNESSED, live browser, both contract halves.**
`scripts/repro-followup.mjs` (systemd-run `-p MemoryMax=4G`, `nice -n
19`, chromium `--js-flags=--max-old-space-size=1024`, one browser
closed in `finally`, condition waits only) against the built SPA on
port 19000 / isolated backend on 19001:

- **1920×1080 (ample width):** `.player-names` box **279.72px**,
  textContent `"BlackvsWhite"` fully present, both names rendered in
  full — `item1-fresh-board-wide.png`.
- **480×900 (genuinely narrow, `.status-bar--narrow` engaged for
  real via the live `ResizeObserver`):** `.player-name--black` box
  **34.31px**, `.player-name--white` box **34.33px** — effectively
  identical, both squeezed to bare ellipses ("● … vs ○…") —
  `item1-narrow-board.png`. Symmetric degradation, witnessed live, not
  just asserted in jsdom.

## Item 2 — preview-board best-move variation (build)

**Roadmap.** The prior build found `BoardSnapshot` had no PV field and
flagged the omission for ratification rather than silently building
over a disclosed narrowing. The commissioner has now filed it as a
defect. Built as: a typed `PvVariationMove` on the engine layer,
threaded through `BoardSnapshot.pv`, populated by `PreviewBoardPanel`
from the SAME analysis source the main board's PV overlay reads
(`useMoveSuggestions`), rendered by both `MiniBoard` renderers.

**Interfaces.**
- `frontend/src/engine/board-geometry.ts`: new `PvVariationMove {x, y,
  color, moveNumber}`, and `BoardSnapshot.pv?: readonly
  PvVariationMove[]`. Homed at the ENGINE layer (below `composables/`
  in this codebase's layering, `frontend/CLAUDE.md` "Architectural
  shape") because `BoardSnapshot` itself lives there and cannot
  reference a type declared in a composable without an upward,
  layer-violating import.
- `frontend/src/composables/board/use-pv-animation.ts`: `PvMove` is now
  `export type PvMove = PvVariationMove` (re-exported, not
  re-declared) — every existing call site (`MoveSuggestions.vue`,
  `use-move-suggestions.ts`, `App.vue`) is untouched, one definition,
  engine-owned.
- `frontend/src/composables/board/use-move-suggestions.ts`:
  `useMoveSuggestions`'s `getNodeId` accessor widened from `() =>
  NodeId` to `() => NodeId | null` — `PreviewBoardPanel` is a
  genuinely optional caller (`activeBoard` can be null), and `null`
  short-circuits `packet` to "no analysis" rather than forcing a
  synthetic placeholder `NodeId` cast into the ledger lookup. Existing
  callers (`BoardWidget`/`MoveSuggestions.vue`,
  `BoardVariationsOverlay.vue`) are unaffected — a `() => NodeId`
  closure is still assignable where `() => NodeId | null` is expected.

**Wiring.**
- `frontend/src/components/board/PreviewBoardPanel.vue`: taps
  `useMoveSuggestions(currentNodeId)` (accessor reading
  `activeBoard.value?.currentNodeId ?? null`), finds the best-move
  suggestion (`suggestions.value.find(s => s.isBest)`, KataGo `order
  === 0`), and calls `buildPvMoves(best.moveIndex)` — the exact same
  function `MoveSuggestions.vue` calls for its own hover-driven PV. No
  new engine demand, no new analysis plumbing — a second reader of
  state that already existed. `pv` is set to `undefined` (never `[]`)
  when there's no PV to show — the honest empty state.
- `frontend/src/components/board/MiniBoardSvg.vue` /
  `MiniBoardCanvas.vue`: both renderers gain PV-stone rendering —
  reduced-opacity (`0.55`) gradient stones with move-number labels, the
  static-thumbnail analog of `MoveSuggestions.vue`'s own animated PV
  stones (this thumbnail has no hover surface to animate off of; a
  fixed always-visible variation IS the preview). Each `.player-name`-
  style stone carries `data-testid="mini-board-pv-stone"` for test
  addressing. PV rendering is additive — a real stone at a PV
  coordinate is unaffected, both layers paint.

**Tests (jsdom):**
- `frontend/tests/integration/MiniBoardSvg-pv.test.ts` — render half:
  N pv entries → N rendered PV stones with the right move-number
  labels; no `pv` on the snapshot → zero PV stones (honest empty,
  never fabricated); explicit `pv: []` degrades the same way; a real
  stone at a PV coordinate still renders its own circle alongside the
  PV overlay.
- `frontend/tests/integration/PreviewBoardPanel-pv.test.ts` — data
  half: seeding the analysis ledger with a packet covering the active
  node renders the best move's PV (3-move fixture, `order: 0`); no
  packet covering the node renders zero PV stones while the board
  itself still shows normally; no active board at all leaves the
  pre-existing `.preview-board-empty` state untouched.
- `frontend/tests/integration/MiniBoardSvg.parity.test.ts` (pre-
  existing, unmodified) still passes — the PV block renders zero DOM
  nodes when `pv` is absent, so the frozen pre-split reference
  comparison is untouched. (One iteration snag, caught before landing:
  a stray static `<!-- comment -->` in the new template block rendered
  unconditionally regardless of `v-for` length and broke this parity
  test; removed, rationale kept in the `<script>` block instead.)

**Evidentiary status: WITNESSED via jsdom tests (21 assertions across
the two new files, all green).** NOT live-witnessed visually in the
browser: populating a REAL best-move PV requires an actual KataGo
analysis packet, which requires an engine connection — out of this
dispatch's "no engine needed" scope for item 3 and not attempted here
either, to stay consistent with that constraint. The live rig DID
confirm the surrounding machinery is intact (preview panel toggled
visible via the presence menu, mounted, rendered the board correctly —
`item3-preview-board-crop.png`) with no PV shown, which is the correct,
honest empty state for a session with no engine attached — not a
regression the fix should have closed.

**Discovered during authoring, corrected before landing (worth
naming):** an early draft of the `PreviewBoardPanel-pv.test.ts` fixture
used SGF-style two-letter move strings (`'pd'`, `'dp'`, `'dd'`) instead
of GTP notation (`'Q16'`, `'D4'`, `'D16'`) — `gtpToBoard`'s
`parseInt(gtp.slice(1))` on a non-numeric second character silently
returns `NaN`, so every entry dropped out of `suggestions` via
`flatMap(() => [])` with no error. Caught by a throwaway debug probe
(`ledger.getRaw` returning the packet correctly, `suggestions.value`
still empty) before it could land as a false-negative test; the
corrected fixture and the reason are left as an inline comment in the
test file itself, not just here.

## Item 3 — handicap stones invisible

**Live repro, no engine.** Backend: fresh isolated venv
(`backend/.venv-repro`, gitignored) + fresh SQLite
(`/tmp/repro-cards.db`), `ALLOW_PASSWORDLESS_LOGIN=True`, served on
**127.0.0.1:19001** (`fastapi run main.py --port 19001`). Frontend:
`npm run build` with `VITE_API_BASE_URL=http://127.0.0.1:19001`, served
via `vite preview --port 19000 --strictPort`. Ports 4173/5173/5174/8764
and the rig engine (192.168.122.68:1235) were never touched. No engine
was connected for any part of this item's repro.

**Procedure (`scripts/repro-followup.mjs`):** the Setup-tool palette
and the Preview-board panel are BOTH `presenceDefaultVisible: false`
by default now (Presence arc P2b, `useLytPresenceMenu.ts`'s
`LYT_PRESENCE_TARGETS`/`A_setup: false` — a standing, unrelated
default this dispatch didn't need to touch, just discover) — toggled on
via the "Panels" presence-menu popover before either is reachable.
Opened Setup → Handicap… → clicked the first available count (2) on a
fresh 19×19 board.

**Result: correct rendering, both boards, live-witnessed.** The main
board showed two black stones at the standard 2-handicap points
(D16/Q4) — `item3-after-handicap-fullpage.png`,
`item3-main-board-crop.png`. The preview board panel, once made
visible, showed the SAME two stones at the same relative positions,
correctly scaled down — `item3-preview-board-crop.png`. This matches
the prior investigation's static trace (`applyHandicap` → `applySetup`
→ `updateBoardState` → `boardSnapshot`, no defect found) and now has a
live witness confirming the trace was right: **no code-level defect
exists on this path.**

**On the commissioner's screenshot (`~/xs/handicap_not_visible.png`).**
That screenshot is NOT the no-engine base case this mandate scoped item
3 to. It shows `ENGINE URI ws://192.168.122.68:1235`, `DISCONNECT`
(connected), `HEALTH 0pps`, `EVAL 50.0%/-0.3` — an actively connected,
analyzing engine — and the board shows clusters of NUMBERED analysis-
suggestion circles (gray/red-outlined/green-outlined disks labeled
"239"/"426"/"237", KataGo visit-count-shaped numbers) clustered at each
corner's star-point pair, with no clean solid-black handicap stone
visible underneath any of them. `MoveSuggestions.vue`'s suggestion-disk
layer (`.suggestions-overlay`, `position: absolute`, painted as a DOM
sibling AFTER the stone layer) is drawn independent of whether a
suggested coordinate coincides with an already-placed stone — if the
engine suggests a move AT a handicap point (plausible; handicap points
are natural early analysis candidates), the suggestion disk's own fill
would visually sit on top of, and could read as replacing, the actual
black stone underneath. That preview board is ALSO empty in that
screenshot, consistent with "no PV/analysis reaches the preview panel
yet" (item 2, addressed above) rather than a second handicap defect.

**Repro recipe needed, disclosed rather than silently absorbed:**
reproduce with a live KataGo engine connected and analysis actively
running on a handicap position, and check whether
`MoveSuggestions.vue`'s suggestion-disk z-order/opacity ever occludes a
real stone's solid-black appearance at a coordinate the engine also
suggests. That is a genuinely different, engine-dependent code path
(`MoveSuggestions.vue`) from the one this mandate scoped item 3 to
(`applyHandicap` → `boardSnapshot`), and per the umbrella's "asking
before assuming" discipline on cross-boundary/engine-dependent bugs,
warrants its own live-engine-connected investigation rather than a
guess made without runtime visibility into that path.

**Evidentiary status: WITNESSED CORRECT (no-engine base case); the
commissioner's shot needs a repro recipe (engine-attached, analysis
running on a handicap position) — not attempted here per the "no
engine needed" scope.**

## Item 4 — unlimited passing (coordinator mid-flight addition, ledger
## row 2540)

**Roadmap.** The SPA enforced "Game ended — two consecutive passes" —
wrong by genre (Sabaki/KaTrain/OGS all permit unlimited passing; this
is not a game server, and pass-interpretation is a game-server
concern). Removed outright, not merely unwired, per the mandate.

**Investigation before removal.** Read `getGameEndStatus`'s full call
graph before touching it: its **only** consumer anywhere in `src/` was
`StatusBar.vue`'s `gameStatus` computed, driving the removed badge.
Read `useBoardMoveRouting.ts`'s `handlePass` in full — it never
consulted `getGameEndStatus`/`GameStatus` at any point; passing is
unconditional in every board state (AWAITING_MOVE/IDLE/FINISHED) except
the transient SR gates (LOADING/ANALYZING/REVIEWED), which are about
review-session lifecycle, not pass-pass counting. Read
`useEngineResponder.ts` in full — no mention of "pass" anywhere; the
play-vs-engine flow does not gate on pass count either. **No other
consumer, anywhere, reads pass-ended state** — there is no
"play-vs-engine flow with its own protocol" to preserve internally, so
the removal is total, not partial.

**Fix.**
- `frontend/src/engine/util.ts`: `GameStatus`/`getGameEndStatus`
  removed outright (was ~45 lines including its doc comment), replaced
  with a short comment naming the removal and its ledger row for future
  readers.
- `frontend/src/components/board/StatusBar.vue`: the `gameStatus`
  computed, the `getPath`/`getGameEndStatus` imports, and the
  `.game-end-badge` span + its CSS rule all removed.
- `frontend/src/locales/en.json`: `statusBar.gameEndedByPass` key
  removed (only present in `en.json`; the other three locale files
  never carried it).
- `frontend/tests/unit/engine/util.test.ts`: the `getGameEndStatus`
  describe block (truth-table, ~115 lines) removed along with its
  now-unused imports (`applyGoMove`/`applyPass`/`getPath`/`GameNode`).

**Test.** `frontend/tests/integration/useBoardMoveRouting.test.ts`, new
case: 5 consecutive `handlePass()` calls, asserting the turn keeps
flipping (B→W→B→W→B, no stone ever placed), a 6th pass is accepted
identically to the first (never refused, never a no-op past some
count), and a genuine move still applies normally afterward — passing
never transitions the board into a state that refuses further
mutation.

**Evidentiary status: WITNESSED, both jsdom and live.** jsdom: the new
`useBoardMoveRouting` test, green. Live (same rig as item 3, same
built SPA, same session as item 1's screenshots): clicked Pass ×4 on a
board already carrying two handicap stones — `.game-end-badge` count
**0** (the element no longer exists at all, not just hidden), `Pass`
button `disabled === false` after all four, and the game tree visibly
grew four chained nodes with the board still fully interactive —
`item4-after-four-passes.png`.

## Discipline checks

- No `box-shadow`, `transition`, or `blur` introduced anywhere in this
  build.
- Text stays `--text-0`; `.vs-text` (new) uses the same token; no new
  backgrounds.
- All touched/new files under `src/` already carried ADR-0006 headers
  or had them retrofitted (`PreviewBoardPanel.vue`'s existing header
  extended in place, not replaced).
- `frontend/FILES.md`: no new `src/` files were created (all edits are
  to existing files); no entries needed.
- `frontend/IDENTIFIERS.md`: no new branded identifier type introduced
  (`PvVariationMove` is a plain value-object interface, not an
  identifier).
- `FEATURES.md`: updated — the "Position preview panel" entry now
  describes the best-move-variation overlay, keeping the
  `[experimental]` tag and the still-accurate "planned upgrade" note
  about cursor-following (unrelated to this build, left as-is).
- Doc-graph: content-only edit to `FEATURES.md` (no doc added, removed,
  renamed, or re-cross-referenced) — no structural regeneration
  required per the umbrella `CLAUDE.md`'s doc-graph discipline.
- `docs/dispatch/`: no open dispatch addressed to the frontend found
  at session start.
- Work-status store: per the umbrella file's live annotation, status
  belongs on the autoharn ledger, not the retired `todo` Postgres DB —
  no write attempted here; the coordinator's own ledger rows (2540 for
  item 4, 2535/2537 named in the base commit for item 1's prior arc)
  are the record this build's report cites, not a new row minted by
  this build itself.

## Verification (WITNESSED, literal exit codes, captured synchronously
## against the final diff)

```
$ VITE_API_BASE_URL=http://127.0.0.1:19001 NODE_OPTIONS=--max-old-space-size=2048 \
    nice -n 19 npm run build
  ...
  ✓ built in 4.17s
  $ echo BUILD_EXIT_CODE=$?
  BUILD_EXIT_CODE=0

$ NODE_OPTIONS=--max-old-space-size=2048 nice -n 19 npx vitest run \
    --changed=427153bc --maxWorkers=2
  Test Files  165 passed | 3 skipped (168)
       Tests  1330 passed | 4 skipped (1334)
  $ echo VITEST_EXIT_CODE=$?
  VITEST_EXIT_CODE=0
```

Both literal exit codes captured via `echo …=$?` immediately after each
command, on the FINAL diff (after item 2's authoring and item 1/4's
live-rig confirmation passes) — not on an intermediate state, and not
inferred from a summary line alone. The 3 skipped files / 4 skipped
tests are pre-existing skips, unrelated to this build (unchanged count
from the base commit's own `--changed=427153bc` run before this
dispatch started).

## Summary for the coordinator

All four items closed with evidence:

- **Item 1** (REOPENED): both defects found and fixed — the inert
  `flex-grow` starving `.player-names` despite free bar width, and the
  first-takes-all tail elision. Live-witnessed at both wide (279.72px,
  full names) and genuinely narrow (34.31px/34.33px, symmetric to
  0.02px) widths via a real `ResizeObserver`-driven `.status-bar--narrow`
  flip, not just jsdom CSS-shape assertions.
- **Item 2** (build): the disclosed W2 narrowing is closed. A typed
  `BoardSnapshot.pv`, populated from the same analysis source the main
  board reads, rendered by both MiniBoard renderers. jsdom-witnessed
  (21 new assertions); not live-witnessed visually, since that needs an
  engine connection out of scope here — the surrounding machinery
  (panel toggle, mount, empty state) IS live-witnessed and correct.
- **Item 3**: no code-level defect — live-witnessed correct on both
  main and preview boards, no-engine base case. The commissioner's
  screenshot is an engine-attached, active-analysis scenario this
  mandate explicitly scoped out; the specific repro recipe needed
  (engine connected, analysis running on a handicap position, check
  `MoveSuggestions.vue`'s suggestion-disk z-order against real stones)
  is named rather than silently left unresolved.
- **Item 4** (coordinator mid-flight addition): unlimited passing is
  now structural, not threshold-tuned — the enforcement code is
  removed outright, confirmed to have exactly one consumer before
  removal, tested at both tiers.
