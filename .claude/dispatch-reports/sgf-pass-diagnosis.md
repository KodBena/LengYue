# Diagnosis: "~/lost_games/30996027.sgf has a pass at the end. SGF parser breaks"

Real specimen (digits transposed in the tracker note, per dispatch): `/home/bork/lost_games/30996072.sgf` — 250-node PlayOK game, `;B[ss];W[];B[];W[];` tail (one real corner-point move at S1, then three empty-bracket passes), then a final moveless node carrying `TW[...]TB[...]`.

## Docs read (frontend/CLAUDE.md discipline)

Read end-to-end before this work: `frontend/CLAUDE.md` (the umbrella-specializing file, injected as system context), `frontend/scripts/perf-capture.mjs` (in full, to learn the project's Playwright/CDP driving conventions and capture-neutrality discipline). Consulted (not full end-to-end, used as lookup per their own stated consumption mode): none of FILES.md/IDENTIFIERS.md were needed — the relevant files were found directly via grep and read in full themselves (`sgf-loader.ts`, `util.ts`, `navigator.ts`, `sgf-writer.ts`, `board-renderer.ts`, `useSgfLoader.ts`, `useSgfDownload.ts`, `useCardThumbnail.ts`, `analysis-service.ts` relevant sections, `scenarioContext.ts`, `keybindings-catalog.ts` relevant sections).

## METHODOLOGY NOTE — the dev server at :5173 is not this project (WITNESSED)

The dispatch said the dev server was already running at `http://127.0.0.1:5173` and instructed not to start/stop it. On connecting, the page title was **"Ledger panel"** ("WORLD experience4", an autoharn-panel admin UI) — not LengYue. `ss -ltnp` confirmed: port 5173 is bound by pid 349753, cmdline `/home/bork/w/vdc/2/autoharn-panel/frontend/node_modules/.bin/vite` — a *different* project's dev server, currently occupying that port. This is exactly the world-confusion class the umbrella `CLAUDE.md` warns about (ledger row 1147), just manifesting via a stray port bind rather than a stray `cd`.

I did **not** touch port 5173 (per instruction, and because it's someone else's session). Instead I found `frontend`'s own `vite preview` already running and idle on **port 4173** (pid 251528, cmdline `/home/bork/w/omega/frontend/node_modules/.bin/vite preview`; confirmed serving LengYue — `<title>gogui</title>`, matching `PW[ismcts]PB[yj9831]` in the loaded header). I used that instead. Caveat: this is a **production preview build** (`import.meta.env.DEV` is false), so `window.__perfScenario` / `window.store` are not installed — I drove it purely through the real UI (clicks, file chooser, keyboard) and read console/page-error events, which is the same signal the dispatch asked for. This is flagged as its own finding, not silently worked around.

**Workspace hygiene (ledger CLAUDE.md discipline, "capture-neutrality" convention borrowed from `scenarioContext.ts`):** the SPA auto-authenticates as the shared `local_user` and persists every created board. Each investigation load created a new board in that shared workspace. All were closed via each board tab's own `.close-board-btn` (×) by the end of the session; a final verification pass confirmed the board-tab count returned to its pre-investigation value of 10, with no residual specimen-named board. One test misstep along the way is disclosed under Secondary Findings.

## REPRODUCTION

Steps (Playwright + `playwright-core`, `executablePath: /usr/bin/chromium`, headless, against `http://127.0.0.1:4173`):

1. Loaded the app, waited for `networkidle`.
2. Clicked the sidebar **"Load SGF"** button (`SidebarWidget.vue`), which (per `useSgfLoader.ts`) creates a transient `<input type=file>` and calls `.click()` — intercepted via Playwright's `filechooser` event, `setFiles('/home/bork/lost_games/30996072.sgf')`.
3. **Result: load succeeded cleanly.** A new board ("Board 11" at the time) became active immediately, header read `yj9831 vs ismcts · AGA · Komi 7.5`, `MOVE 0`. **No error toast, no console error, no console warning** — WITNESSED (full console/pageerror capture was empty for this step).
4. Pressed `End` (keybinding `navEnd` → `nav.end`, per `keybindings-catalog.ts`). Board jumped to the leaf, `MOVE 245`. Clean — WITNESSED, no console output at all.
5. Stepped backward with `ArrowUp` (`navPrev`) through the pass tail and the final moveless `TW/TB` node, then forward again with `ArrowDown` (`navNext`). Confirmed via screenshot that the board correctly shows the last real stone (marked at **S1**, matching `B[ss]` at size 19: col `s`=18 → GTP `S`, row `s`=18 → row `19-18`=1) after stepping back past the three passes and the TW/TB node. **Clean at every step** — WITNESSED, no console output.
   - (Note: `ArrowLeft`/`ArrowRight` are `navVariationPrev/Next` — sibling-switch, not linear step — a no-op on this file since it has no branches at any node. `ArrowUp`/`ArrowDown` are the linear-step bindings. This distinction cost a debugging round in this investigation; flagging it in case a future report conflates them.)
6. Switched to the **Analysis** tab while positioned on the specimen board — clean, no console output.
7. Opened the **Mint Card** dialog (reads the current node/leaf to build the mint draft) — dialog opened correctly (`MINT FLASHCARD`, `BRANCH CARD`, target moves / visits / discount-γ / palette fields all populated), no console output. Did not submit (engine shows `Engine: Offline` in this preview context — submission would need a live KataGo connection, out of scope per dispatch guidance that engine connection is "likely not needed").

**Conclusion of REPRODUCTION: could not reproduce a break anywhere in load → navigate → analysis-tab → mint-dialog-open, through the real UI, on the production build.** This corroborates the already-established vite-node result (parse/load/`getActiveVariationPath`/`navigateTo` all succeed with 250 nodes / 238 stones).

Screenshots (this investigation's own artifacts): `sgf-pass-10-loaded-root.png` (fresh load, MOVE 0), `sgf-pass-11-at-leaf.png` (End → MOVE 245), `sgf-pass-12-back-through-passes.png` (stepped back to the S1 marker, past the passes), `sgf-pass-13-final-node-again.png` (stepped forward again), `sgf-pass-14-analysis-tab.png`, `sgf-pass-15-mint-dialog.png`.

## DIAGNOSIS

**No crash/parse-break site was found, live or static, on the load→navigate→display→mint-dialog-open path.** Every pass-touching site in that path already discriminates on `Move.type`:

- `engine/sgf-loader.ts::hydrate` — `if (node.move && node.move.type === 'place')` before touching `.x/.y` (sgf-pass-loader.ts:186). Correct.
- `engine/util.ts::sgfToMove` — returns `{type:'pass', color, x:0, y:0}` for an empty/whitespace coord or `tt` (util.ts:57-60). Correct, and the empty-bracket `W[]`/`B[]` PlayOK convention is exactly this branch.
- `engine/util.ts::moveToKataCoord` — `m.type === 'pass' ? 'pass' : toGtp(m.x, m.y)` (util.ts:155-157), with a docstring explicitly naming this as load-bearing for exactly the "any game with a pass in its history" case. This is the KataGo wire encoder — already fixed for the defect class the dispatch asked me to hunt for.
- `engine/navigator.ts::navigateTo` — both the undo leg (line 70: `if (node.move && node.move.type === 'place')`) and the replay leg (line 112-114: `if (node.move) { ... if (type === 'place') ... }`) discriminate correctly; a pass or a moveless node only updates `turn`/`koPoint` bookkeeping, never touches `.x/.y` ungated.
- `services/analysis-service.ts::analyzeRange` (and the sibling single-turn analyze method) — `pathUpToEnd.map(id => board.nodes[id]?.move ?? null).filter(m => !!m).map(m => moveToKataCoord(m))` (analysis-service.ts:547-550): the moveless final `TW/TB` node is filtered out before the map, and every pass node flows through `moveToKataCoord` correctly. `getInitialStones` (util.ts:203-234) similarly only reads `AB/AW` root setup, unrelated to in-tree passes.
- `engine/sgf-writer.ts::serializeBoard/serializeProperties` — re-serializes from `node.properties` directly (the raw SGF property bag), never from the decoded `Move`, so pass nodes round-trip byte-for-byte regardless of any `Move`-side handling. No defect surface here.

**One real, WITNESSED-by-code-inspection-and-execution pass-hostile defect was found, but it is cosmetic (a wrong marker, not a crash) and it is NOT on the load path — it only fires when a card's *displayed leaf* is itself a pass node:**

### Defect: `getCardThumbnailSync` / `renderBoardToSvg` draw a spurious last-move marker for a pass

- `frontend/src/composables/cards/useCardThumbnail.ts:78` — `lastMove: board.nodes[leafId].move` passes the raw `Move` (not narrowed) into `renderBoardToSvg`'s `lastMove: Point | null` parameter. `Move`'s `'pass'` arm still carries `x: 0, y: 0` (per `sgfToMove`'s pass branch), so a pass move satisfies `Point`'s shape by duck-typing.
- `frontend/src/engine/board-renderer.ts:46-49`:
  ```ts
  if (showMarker && lastMove) {
    const coords = toSVG(lastMove.x, lastMove.y);
    markerSvg += `<circle cx="${coords.x}" cy="${coords.y}" r="${stoneR * MARKER_INNER_RATIO}" fill="none"
      stroke="${stones[`${lastMove.x},${lastMove.y}`] === 'B' ? 'white' : 'black'}" stroke-width="2" opacity="0.8" />`;
  }
  ```
  guards only on truthiness, not on `.type`. For a pass `lastMove`, this draws a "last move" ring at board coordinate `(0,0)` — the `a1`/bottom-left intersection — regardless of whether a move was actually played there. If a real stone happens to occupy `(0,0)` (common: it's a real, playable point), the ring silently attaches to that unrelated stone and misleadingly marks it as "the last move."

**WITNESSED** (execution, `npx vite-node` against the real module, from `frontend/`):
```js
import { renderBoardToSvg } from './src/engine/board-renderer.ts';
const passMove = { type: 'pass', color: 'W', x: 0, y: 0 };
const svg = renderBoardToSvg({ size: 19, stones: { '0,0': 'B' }, lastMove: passMove, showMarker: true, uid: 'witness' });
```
produced the marker line:
```
<circle cx="..." cy="..." r="..." fill="none" stroke="white" stroke-width="2" opacity="0.8" />
```
— i.e., the ring *was* emitted, at `toSVG(0,0)`, attached to the unrelated black stone there, purely because the pass move's placeholder `x:0,y:0` satisfied the untyped `Point` shape.

**Applicability to this specimen**: our specimen's tree leaf (`getActiveVariationPath`'s last node) is the *moveless* `TW/TB` node, whose `.move` is `null` — `null` is falsy, so `showMarker && lastMove` is false there and no marker is drawn; `useCardThumbnail`/`useThumbnailCache` are unaffected for *this exact file's mainline leaf*. The defect fires for a card minted from (or whose recorded position is) one of the **three intermediate pass nodes** (`;W[];B[];W[];`, the second-to-fourth-from-last real tree positions) — e.g. a "branch card" minted at the `W[]` or `B[]` node, or a future/hypothetical file that *ends* on a pass rather than a moveless scoring node. Given this specimen's tracker complaint names "a pass at the end" and the actual file's true end is the TW/TB node (one hop past the passes), this is plausibly adjacent to, but not identical to, the reported symptom — flagged as a real, adjacent, unfixed defect rather than claimed as *the* fix.

### PROPOSED MINIMAL FIX

Type-driven framing: the defect class is representable because `renderBoardToSvg`'s `lastMove` parameter is typed as the *structural* `Point` (`{x, y}`) rather than the *domain* `Move` union, so a caller can hand it a `'pass'`-tagged value and the compiler has nothing to say about it — the exhaustiveness check that exists everywhere else in this codebase (`navigator.ts`, `sgf-loader.ts`) is simply absent here because the parameter's type erased the discriminant before the function body could check it.

- **Narrow at the call site**, not inside the renderer (keeps `board-renderer.ts` decoupled from `Move`, per its "Pure SVG" framing — it doesn't otherwise import domain types beyond `Point`):
  ```ts
  // useCardThumbnail.ts:78 and useThumbnailCache.ts:64 (same shape)
  const leafMove = board.nodes[leafId].move;
  lastMove: leafMove?.type === 'place' ? leafMove : null,
  ```
  This makes "a pass/absent move draws no marker" the *only* representable behavior at both of `renderBoardToSvg`'s two call sites (`useCardThumbnail.ts`, `useThumbnailCache.ts` — grep confirms these are the only two `lastMove:` producers).
- If a stronger type-level guarantee is wanted: change `renderBoardToSvg`'s signature to `lastMove?: Extract<Move, {type:'place'}> | null` (importing the discriminated union instead of the bare `Point`). This makes the erasure itself a compile error at any future call site, not just today's two — more consistent with the "exhaustiveness checks are the verification" tenet in `frontend/CLAUDE.md`'s Type-driven-design section, at the cost of a `Move`-type import into the render module.

**Unit-test witness** (`frontend/tests/unit/`, e.g. `board-renderer.test.ts`, new or extending an existing suite):
- **Red leg**: call `renderBoardToSvg({ size: 19, stones: {'0,0':'B'}, lastMove: {type:'pass', color:'W', x:0, y:0} as Point, showMarker: true, uid:'t' })` and assert the output contains **no** `opacity="0.8"` marker circle. Pre-fix, this fails because the circle *is* emitted — the failure is specifically "a marker was drawn for a pass," not an unrelated crash, satisfying the "must fail for the pass-specific reason" requirement (the same call with `lastMove: null` already passes today, so the red leg isolates exactly the discriminant-erasure bug).
- **Green leg**: same assertion after the fix (narrowing at the call site, or the `Extract<Move,...>` signature change) — the circle is absent. A second case, `lastMove: {type:'place', color:'B', x:5, y:5}`, still emits the circle (regression guard that the fix didn't just delete the whole feature).

## Secondary findings

- **Final moveless `TW`/`TB` node**: no frontend consumer reads `TW`/`TB` at all (`grep -rn "'TW'\|'TB'"` across `src/` returns zero hits outside an unrelated `orient: 'TB'` layout enum in the tree-chart code). Territory markers from an SGF's scoring node are silently unused/undisplayed rather than mis-rendered — UNEXERCISED as a "break," this is a missing-feature gap, not a defect, and out of scope for "the parser breaks." Noted since the dispatch specifically asked about this node's handling.
- **Test-methodology self-correction, disclosed per the "claims carry witnesses" convention**: an early repro attempt clicked `.board-svg` (the main board canvas) intending only to seat keyboard focus before sending `End`; this instead **played a real move** (a Go board click places a stone) at the board's center point, silently branching the specimen's tree at the root. Caught via the `assertOnSpecimen`/screenshot checks in the same run (the header still read `yj9831`, but the move counter and board state diverged from the loaded file). The affected board was closed in that same run's cleanup; a follow-up sweep (closing every board tab whose content matched `yj9831` until none remained) confirmed the shared `local_user` workspace's board-tab count returned to its pre-investigation value of 10. No lasting effect on the shared workspace beyond the transient boards, all closed.
- **`ArrowLeft`/`ArrowRight` vs `ArrowUp`/`ArrowDown`**: not a defect — `keybindings-catalog.ts` binds `ArrowLeft/Right` to sibling-variation switching (`navVariationPrev/Next`) and `ArrowUp/Down` to linear step (`navPrev/Next`). A tester (including this one, initially) reaching for arrow-left/right to "step through moves" gets a silent no-op on a non-branching file — worth a UX note if a future contributor hits the same confusion, but explicitly not filed as a bug here since it's working as designed.

## WITH-ENGINE REPRODUCTION (2026-08-06)

**REPRODUCED — WITNESSED.** This session confirms the commissioner's report: Load → Analyze **is** broken, but only with a live engine — the prior no-engine pass (above) correctly proved parse/load/navigate/mint are all clean, because the defect is specific to the KataGo wire query the analysis pipeline constructs, which nothing short of a live proxy round-trip can surface.

### Setup (WITNESSED)

- Driven with `playwright-core` (frontend devDep) + `/usr/bin/chromium`, headless, against the running `vite preview` at `http://127.0.0.1:4173` (pid unchanged from the prior session's finding — port 5173 remains a different project and was not touched).
- Engine: found the persisted `settings.engine.katago.url` (Settings tab → Advanced Registry sub-tab → `KATAGO` → `url` field) was `ws://127.0.0.1:41948` — the SPA's compiled-in default (`src/config/env.ts`/`src/store/defaults.ts`), **not** the SELECTOR proxy named in the dispatch. Per the dispatch's instruction not to persist an unwanted change: set the field to `ws://127.0.0.1:1235` for the duration of this investigation only, then **reverted it to `ws://127.0.0.1:41948`** at the end of the run — WITNESSED by re-reading the field from a fresh page load after the session closed (`final persisted engine url: ws://127.0.0.1:41948`).
- Clicked **Connect**; `query_version`/`query_models` probes succeeded (`v1.17.1`, `capabilities: {delta_analysis, adaptive_reevaluate, transposition, selector}`), confirming SELECTOR mode. The model `<select>` (`ToolbarEngineMetrics.vue`, `isSelectorMode`) listed `["14", "18 (unavailable)", "nbttrf (unavailable)", "08_01 (unavailable)", "b11c768h12nbt3tflrs"]`; selected **`14`** (healthy) via `selectOption({ label: '14' })`, confirmed via `modelSelect.inputValue() === '14'`.
- Loaded the specimen (same real UI file-input path as the prior report: sidebar **Load SGF** → intercepted `filechooser` → `setFiles('/home/bork/lost_games/30996072.sgf')`) — clean, `yj9831 vs ismcts` header, matching the prior session.

### Reproduction steps and the break (WITNESSED)

1. Switched to the **Analysis** tab. The range-selection UI (`useAnalysisTimeline.ts`) had already auto-initialized to the full game on path observation: **"249 nodes selected · turns 0–249"**, button labelled **"Analyse Selection (249)"** (screenshot `sgf-pass-engine-08-analysis-tab.png`).
2. Pressed `End` to jump to the leaf (the moveless `TW`/`TB` node, `MOVE 245` in the footer — consistent with the prior report's node-vs-move-count finding).
3. Clicked **"Analyse Selection (249)"**.
4. **Within ~1.6s, the SPA's own System Diagnostics panel raised a red error toast: `Invalid turn number: 249`** (screenshot `sgf-pass-engine-10-after-analyze-click.png`). Console corroborates, verbatim:
   ```
   [error] [katago-client] Received Error Packet: Invalid turn number: 249
   [warning] [analysis-service] error packet routed onto analysis query range-217fdf24-ba1b-4a8d-bde6-cd461c63b1db-1786016178553; surfaced via the global onError channel, releasing query bookkeeping: Invalid turn number: 249
   ```
5. Polled console/screenshots for a further 30s: no recovery, no retry, no partial results — the query's bookkeeping was released immediately (`stopQuery`) and nothing further happened. The user is left with a red toast and **zero analysis data for the entire 249-turn selection**, including the 248 turns that were individually valid.

### The exact wire query (WITNESSED — captured via CDP `Network.webSocketFrame{Sent,Received}`)

Outbound query (`sent-query-pretty.json` in this investigation's scratch, trimmed for length; every field verbatim except `moves`/`analyzeTurns` bodies):

```json
{
  "id": "range-217fdf24-ba1b-4a8d-bde6-cd461c63b1db-1786016178553",
  "moves": ["...(242 earlier pairs)...", ["B","J19"], ["W","G19"], ["B","T1"], ["W","pass"], ["B","pass"], ["W","pass"]],
  "rules": "tromp-taylor", "boardXSize": 19, "boardYSize": 19, "komi": 7.5,
  "maxVisits": 200, "cache": false, "lookup_cache": false, "replay_final_only": false,
  "reportDuringSearchEvery": 0.15, "firstReportDuringSearchAfter": 0.05,
  "analyzeTurns": [0, 1, 2, "...", 248, 249],
  "overrideSettings": { "reportAnalysisWinratesAs": "WHITE", "rootNumSymmetriesToSample": 8, "wideRootNoise": 0.02 },
  "analysis_config": { "...": "(qEUBO bindings, omitted — unrelated)" },
  "capabilities": { "delta_analysis": {}, "transposition": {} },
  "model": "14"
}
```

**`moves.length === 248`**, but **`analyzeTurns` has 250 entries spanning `0..249`.** The reply:

```json
{"id":"range-217fdf24-ba1b-4a8d-bde6-cd461c63b1db-1786016178553","error":"Invalid turn number: 249","field":"analyzeTurns"}
```

immediately followed by the client's best-effort `terminate` for the same query id (accepted). KataGo/the proxy's valid `analyzeTurns` range for a 248-move query is `0..248` inclusive (turn 0 = the empty root position, turn 248 = the position after all 248 moves) — 249 valid values. The query asked for 250 values, one past the end.

### Diagnosis: file:line

The off-by-N is a **turn-index vs. tree-node-index conflation**, and it takes exactly two cooperating sites to produce:

1. **`frontend/src/composables/analysis/useAnalysisTimeline.ts:81`** (and the re-clamp at `:90`) — the analysis-range selector initializes/clamps its upper bound to `len - 1`, where `len = variationPath.value.length` is the **tree-node count** (250 for this specimen: root + 249 tree nodes down to the leaf). This is silently assumed to equal the highest valid **turn index** (position in "moves played so far"), which only holds when every non-root node in the path carries a move. It does not hold here: the specimen's leaf (`TW`/`TB` scoring node) carries no move, so the true move count is 248, not 249 — `len - 1 = 249` overshoots the real max turn index by exactly 1 (the count of moveless non-root nodes trailing in the selected prefix, here the single `TW`/`TB` node — the three intervening pass nodes each *do* carry a move (`type: 'pass'`) and are correctly counted).
2. **`frontend/src/services/analysis-service.ts:545-554`** (`analyzeRange`) — builds `moves` by filtering the root-to-`endTurn` prefix down to nodes that actually carry a move (`.filter(m => !!m)`, dropping the root and the trailing moveless node), giving the true move count (248). It then builds `analyzeTurns` at **line 554** directly from the caller-supplied `startTurn`/`endTurn` (`Array.from({ length: endTurn - startTurn + 1 }, (_, i) => startTurn + i)`) with **no cross-check against `moves.length`** — the two derived quantities (`moves`, whose length is the wire-protocol ceiling for `analyzeTurns`, and `analyzeTurns`, built from the tree-index range) are computed independently in the same function and never reconciled before being placed on the same outbound query object (`:672-720`).

Neither site is "wrong" in isolation — `useAnalysisTimeline`'s node-index-based range selection is the natural UI notion ("select the whole tree"), and `analyzeRange`'s move-filtering is the correct wire-encoding step (this is the same filter the no-engine report already verified handles passes correctly). The bug is that nothing enforces the invariant the wire protocol actually requires: **`max(analyzeTurns) <= moves.length`**, i.e., a turn index is only valid up to and including the position reached after the last real move — a moveless trailing node (or, by the same reasoning, a moveless node anywhere that isn't the last) contributes no new valid turn index but the current arithmetic assumes it does.

### Why it breaks the whole app-visible flow, not just the trailing node

This is worse than "the scoring node itself can't be analyzed" — KataGo/the proxy rejects the **entire query at parse time**, before any turn is analyzed (WITNESSED: zero `moveInfos`/`isDuringSearch` packets arrived before the error; the very first and only response for this query id is the error packet). So a single one-past-the-end `analyzeTurns` entry, caused solely by the presence of a trailing moveless node, silently discards analysis for the other 248 perfectly-valid turns the user asked for. Any SGF whose active-path leaf lacks a `move` — a scoring/territory node (this specimen), a comment-only leaf, or any other moveless terminal — triggers this for a **full-game "Analyse Selection"**, which is very likely why the commissioner characterizes it as "Load → Analyze → broken": the natural first thing to do after loading a finished, scored game is exactly what breaks.

### Proposed minimal fix (type-driven framing)

The defect class is representable because **turn index** (bounded by `moves.length`, a wire-protocol-facing quantity) and **tree-node index** (bounded by `path.length`, a UI/tree-facing quantity) are both carried as bare `number`/`PlyIndex` and used interchangeably at the `analyzeRange` boundary — the type system has nothing to say about a `PlyIndex` that happens to exceed the actual move count. Per `frontend/CLAUDE.md`'s type-driven-design section, the boundary that should refuse this is the wire-query construction site itself:

- **Minimal, local fix** — `analysis-service.ts`'s `analyzeRange` (and the sibling single-turn `analyze*` method, which is structurally immune today only because `analyzeTurns: [currentIdx]` is a single value and the caller never lets `currentIdx` be a moveless node's tree index — worth auditing separately) clamps `analyzeTurns` against the `moves` it just computed, right after `moves` is built (`:550`, before `:554`):
  ```ts
  const maxValidTurn = moves.length; // wire ceiling: turn N = position after N real moves
  const analyzeTurns = Array.from({ length: endTurn - startTurn + 1 }, (_, i) => startTurn + i)
    .filter(t => t <= maxValidTurn);
  ```
  This makes "a moveless trailing node contributes no extra turn" the only representable outcome at the query-assembly boundary — the UI's node-index-based selection can stay exactly as it is; the invariant is enforced exactly once, at the seam that owns the wire contract.
- **Stronger type-level guarantee** — mint a branded `TurnIndex` (bounded `0..moveCount`) distinct from `PlyIndex`/tree-node index, with the sole conversion `nodeIndexToTurnIndex(path, nodeIndex): TurnIndex` performing the same move-count walk `analyzeRange` already does implicitly via its filter — so a future call site that tries to hand a raw tree index to `analyzeTurns` is a type error, not a silent off-by-N. Consistent with the file map's `IDENTIFIERS.md` convention for branded keys whose declaration names the exact quantity they bound.
- Either fix is purely additive at the `analyzeRange` boundary; `useAnalysisTimeline.ts`'s range-selection UI does not need to change (selecting "the whole tree, root to leaf" is the correct UI intent regardless of whether the leaf carries a move).

### Red-then-green test plan

Tier 3 (`tests/integration/`, following the composable-against-fakes pattern in `tests/CLAUDE.md`) is the right altitude — this is a cross-boundary (composable range-selection → service query-assembly) bug, not a pure-function one:

- **Red leg**: construct a `BoardState` fixture whose tree has N real-move nodes followed by one moveless node (mirroring the specimen's `TW`/`TB` leaf) — the fake `KataGoClient`/`AnalysisService.client` spy asserts on the `analyzeTurns` field of the query it receives. Pre-fix, `max(analyzeTurns) === N + 1` (fails the assertion `max(analyzeTurns) <= moves.length`). This isolates the exact defect (an over-range `analyzeTurns` entry caused specifically by a moveless leaf) rather than a generic crash.
- **Green leg**: same fixture, same assertion, post-fix: `max(analyzeTurns) === N` (equals `moves.length`), and a regression case — a tree with **no** moveless trailing node — still produces `analyzeTurns` spanning the full `startTurn..endTurn` unfiltered (guards against the fix over-trimming a normal all-real-move game, which is the case the prior no-engine report already verified end-to-end).
- A companion **live-engine smoke test** (out of the fake-service tier, kept manual/CI-optional given it needs a running proxy) is this session's own repro script, retained at `/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/full-repro.mjs` for reference — not committed, ephemeral scratch per the dispatch's read-only constraint, but documents the exact Playwright sequence (Settings → Advanced Registry → set engine URL → Connect → select model → Load SGF → Analysis tab → End → click "Analyse Selection" → assert no `Invalid turn number` toast) a future fix's manual verification can replay.

### Hygiene (WITNESSED)

- Engine URL: read as `ws://127.0.0.1:41948` before this session; set to `ws://127.0.0.1:1235` for the investigation; reverted to `ws://127.0.0.1:41948` at end, confirmed via a fresh page load reading the field back after the session closed.
- Board cleanup: the specimen board (last seen as "Board 12", `yj9831 vs ismcts`) was closed via its `.close-board-btn`; confirmed absent (`bodyText.includes('yj9831') === false`) in a fresh page load after cleanup.
- Screenshots (this investigation's own artifacts, `sgf-pass-engine-*.png` in this same directory): `sgf-pass-engine-04-settings-url-set.png`, `05-after-connect.png`, `06-model-selected.png`, `07-sgf-loaded.png`, `08-analysis-tab.png` (range auto-selected "turns 0–249"), `09-at-leaf.png`, `10-after-analyze-click.png` (the `Invalid turn number: 249` toast), `11-after-30s-wait.png` (no recovery), `12-final-cleanup.png`.
