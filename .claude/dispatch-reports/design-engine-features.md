# Design proposal: pass support, handicap setup, ruleset selection

- **Author:** design agent (read-only survey + proposal), frontend scope only
- **Date:** 2026-08-06
- **Status:** proposal — for commissioner adjudication, nothing here is implemented
- **Scope:** `frontend/` only. Backend and proxy-side items are called out explicitly as
  dispatch boundaries per `docs/dispatch/` convention and are NOT designed in depth here.
- **Genre framing (ADR-0019):** the relevant genre is "desktop/web Go client with an
  SGF-tree review UI, board input, and an analysis engine attached." Named reference
  exemplars used throughout: **Sabaki** (SGF editor/reviewer, freeware, the closest genre
  match to this app's tree-based review model), **KaTrain** (KataGo-integrated trainer,
  closest match for AI-engine wire concerns), **OGS** (online server client, closest match
  for handicap/ruleset selection UX conventions used by a wide non-technical audience),
  **Lizzie/Sabaki-with-Leela** class tools (closest match for engine-analysis-plus-board
  UIs). Every deviation from what these four exhibit is named and justified below per
  ADR-0019 Rule 2 ("any UI structure the genre's reference exemplars do not exhibit is
  presumptively wrong" — burden of proof sits on the deviation).

All source claims below are marked **WITNESSED-in-source** with `file:line`, from a
direct read-only survey of `frontend/src/` performed for this proposal (2026-08-06).
Claims about KataGo's own ruleset vocabulary are marked **WITNESSED-external** with the
source URL.

---

## PASS SUPPORT

### Existing-state survey

**Move type already models pass.** `Move` is a discriminated union with a `type: 'place'
| 'pass'` field — WITNESSED-in-source `frontend/src/types/game.ts:112-115`:
```ts
export interface Move extends Point {
  readonly color: StoneColor;
  readonly type: 'place' | 'pass';
}
```
`sgfToMove` (SGF → domain reader) already decodes both empty-value and legacy `tt`
pass encodings into `{ type: 'pass', color, x: 0, y: 0 }` — WITNESSED-in-source
`frontend/src/engine/util.ts:57-60`. The inverse, `moveToKataCoord`, already serializes
a pass move to KataGo's wire string `'pass'` — WITNESSED-in-source
`frontend/src/engine/util.ts:155-157`. This function is exercised by both KataGo query
builders in `analysis-service.ts`, so **if a pass `GameNode` ever existed in the tree,
it would already round-trip correctly to the engine.** The gap is entirely upstream of
the wire boundary.

**Nothing can currently construct a pass move.** `applyGoMove` (the sole board-mutating
function for a played move) always writes `{ x, y, color: state.turn, type: 'place' }` —
WITNESSED-in-source `frontend/src/logic.ts:124`, called only with `(x, y)` — no pass
parameter exists on its signature (`frontend/src/logic.ts:73`). `grep -rn "applyPass"
src/` has zero hits.

**Rules engine has no pass concept.** `frontend/src/engine/rules.ts` (124 lines total) —
`validateMove(stones, koPoint, color, x, y, size)` is the sole legality export
(`:67-124`); it is a single-placement legality check with no notion of a move sequence,
no `pass` handling, and **no game-end / two-consecutive-passes logic anywhere in the
codebase** — there is no scoring or territory function at all today.

**Board input path has no pass entry point.** Click routing:
`BoardDisplay.vue:140-142` (`onBoardClick`) → `BoardWidget.vue:262` (`emit('move', x, y)`)
→ `useBoardMoveRouting.ts:67-118` (`handleBoardMove(x, y)`) → either
`useReviewSession.ts:386` (`processUserMove(x, y)`, review/quiz flow) or
`applyGoMove(activeBoard.value, x, y)` (`useBoardMoveRouting.ts:110`, free-play flow).
Every one of these takes `(x, y)` only — none has a pass-shaped call. No pass/resign
button, no keybinding: `frontend/src/composables/keybindings-catalog.ts` has zero hits
for "pass" or "resign" among its registered actions (existing actions are nav, ponder
toggle, and display toggles — `:107-228`).

**The engine self-play harness treats an engine-suggested pass as an error, not a
move**: `usePlayFromPosition.ts:409,474,681` all `throw new Error(...)` when KataGo's
suggested best move is a pass. This is a second, independent place a pass-support design
must touch (or explicitly declare out of scope) if AI self-play through a full game is
ever meant to terminate normally.

**Tree/move-list rendering cannot distinguish a pass node.** The tree is an SVG graph
(`TreeWidget.vue`), not a text list; node fill color is derived solely from
`item.move.color` (`:144-150`) — a pass node would render as an indistinguishable
black/white dot today. One defensive spot already exists: `BoardDisplay.vue:245,248`
guards the last-move marker with `lastMove.type === 'place'` and a comment "(skipped on
pass...)" — so the renderer was written pass-aware even though nothing can produce one.
`BoardVariationsOverlay.vue:184` has a similar defensive comment. `use-move-suggestions.ts:45`
already filters an engine-suggested "pass" out of the move-suggestion overlay so it isn't
drawn as a phantom stone — evidence the pass arm was anticipated but never wired to input.

### Genre convention

Sabaki: pass is a toolbar button plus a keybinding (default a dedicated key), placed
beside pass-adjacent actions (resign is separate). KaTrain and Lizzie: pass is a labeled
button on the board chrome, always visible, disabled only when not the user's turn to
act. OGS: pass is a button in the game-action row alongside resign; a pass is shown in
the move list as a distinct "Pass" label, not a stone glyph. **Convergent shape across
all four exemplars: (a) an always-visible, clearly-labeled pass control (button, not a
hidden/modifier-only hotkey), separate from resign; (b) a pass renders as a textual/
distinct marker in the move history, never as an ordinary stone; (c) two consecutive
passes is the canonical end-of-game trigger, surfaced to the user (not silently
absorbed).** This proposal follows all three; anything short of (a)-(c) would be a named
deviation requiring justification, and none is proposed.

### Option space

**A. Full pass lifecycle** — mutator + UI + tree rendering + two-pass game-end detection
(status only, no scoring).
- Pros: matches genre convention fully; makes the SGF-round-trip story (load → review →
  re-mint) honest for any game record that contains a pass, which today silently
  mis-renders. Unlocks the self-play harness fix as a natural follow-on.
- Cons: touches five layers (logic, routing, rules-adjacent game-end signal, tree
  render, keybinding catalog); largest of the three options.

**B. Pass move + UI, no game-end detection** — add the mutator, button/hotkey, and tree
label; leave "two passes ends the game" unimplemented (game simply continues, pass nodes
accumulate).
- Pros: much smaller touch surface (skips new game-end state machine); still closes the
  main complaint ("cannot play/record a pass").
- Cons: deviates from genre convention (b)/(c) partially — a pass is recordable and
  visible but the game never signals "over," which every reference exemplar does. Users
  who pass twice get no feedback, which reads as a bug rather than an intentional
  scope cut unless clearly messaged in-app.

**C. Read-only pass display only** — fix `TreeWidget.vue` to render an existing pass
node distinctly (for SGFs loaded with a pass already in them), do not add a UI affordance
to create one.
- Pros: trivial, low-risk, fixes a real display defect (pass currently renders as an
  indistinguishable stone) independent of the write-side feature.
- Cons: does not address the maintainer's actual ask ("cannot play... a pass") — only
  fixes display of pre-existing passes from external SGF sources. Should be done
  regardless of which of A/B is chosen, as a preparatory/first sub-item.

### Recommendation

**Option A**, sequenced as C → B → (game-end signal). C is small and independently
valuable (fixes a real display bug); B is the maintainer's literal ask; the two-pass
game-end signal is the piece that makes the feature match genre convention rather than
half-match it, and is a small state check once B exists (compare the last two
`GameNode.move.type` values along the active path — no new persistent state needed).
Scoring/territory computation is explicitly OUT of this recommendation — "game ends" is
a status signal only; territory scoring is a materially larger, separate feature (no
scoring code exists anywhere in the codebase today) and should be its own future
proposal if wanted.

### Type-level design (sketch)

```ts
// src/logic.ts — new mutator parallel to applyGoMove
export function applyPass(state: BoardState): BoardState { /* ... */ }
// GameNode.move is already `Move` (place | pass) — no new tree type needed.

// src/composables/board/useBoardMoveRouting.ts — new entry point
handlePass(): void  // mirrors handleBoardMove's branch structure (AWAITING_MOVE / free-play)

// src/composables/keybindings-catalog.ts — new ACTIONS.boardPass entry, same shape as
// existing enginePonderToggle etc. (:162)

// Game-end signal — discriminated union, not a boolean, per frontend/CLAUDE.md's
// branded-types/DU convention:
type GameStatus =
  | { kind: 'in-progress' }
  | { kind: 'ended-by-pass'; lastMoveColor: StoneColor };
```

### Touched-file inventory (Option A)

- `src/logic.ts` — new `applyPass`.
- `src/composables/board/useBoardMoveRouting.ts` — new `handlePass` routing branch.
- `src/composables/review/useReviewSession.ts` — pass handling in `processUserMove`-adjacent
  path (or a parallel `processUserPass`) for the review/quiz flow.
- `src/components/board/BoardWidget.vue`, `BoardDisplay.vue` — pass button/affordance.
- `src/components/board/StatusBar.vue` or a new toolbar slot — visible pass control
  placement (per genre convention, always-visible, not hidden in a menu).
- `src/composables/keybindings-catalog.ts` — new keybinding entry.
- `src/components/tree/TreeWidget.vue` — distinct pass-node rendering (label/glyph vs.
  color dot).
- `src/components/board/BoardVariationsOverlay.vue` — confirm/extend the existing `:184`
  pass-aware comment now has a real code path to handle.
- `src/composables/board/usePlayFromPosition.ts:409,474,681` — convert "engine
  recommended pass" from a thrown error to a handled terminal state (only if self-play
  through game-end is in scope; otherwise leave as a named, documented limitation).

### Acceptance criteria (handles)

1. A pass button (or equivalent always-visible control) is present on the board chrome
   whenever it is the local user's turn to move, in both free-play and review-session
   modes; disabled/absent otherwise. WITNESS: screenshot + click produces a new tree node.
2. A played pass appears in `TreeWidget.vue` visually distinct from a stone placement
   (not just a color-only distinction — ADR-0019 appendix C18, no color-only meaning).
   WITNESS: screenshot of a tree containing a pass node.
3. `moveToKataCoord` on the newly-created pass node still serializes to `'pass'` and a
   KataGo query built from a board with a pass in its move history is accepted (reuses
   existing wire path — no proxy-side change needed for this criterion).
4. Two consecutive passes surface a game-status signal in the UI (e.g. a status-bar
   message), not silent continuation. WITNESS: pass twice, observe the signal.
5. Loading an externally-authored SGF containing a pass renders it correctly in the tree
   without requiring the new write-side UI (Option C's fix, subsumed into A).

### Size estimate

- Option C alone: XS (single component, ~20-40 line diff).
- Option B: S-M (mutator + routing + button + tree render + keybinding, ~4-6 files).
- Option A (recommended): M (B plus a small game-status state machine and its UI
  surfacing; self-play-harness fix is optional/separately sizeable, S on its own).

---

## HANDICAP SETUP

### Existing-state survey

**Read path (SGF replay) is solid; write path (interactive setup) does not exist.**
`sgf-loader.ts`'s `loadSgf` projects root `AB`/`AW` setup stones into `state.stones` —
WITNESSED-in-source `frontend/src/engine/sgf-loader.ts:124-133`; `hydrate`'s
`processSetup` handles `AB`→`'B'`, `AW`→`'W'`, `AE`→`null` for every node, not just root
(`:191-206`). **`HA` (handicap-count SGF property) is never read anywhere** — `grep -n
"HA" src/engine/sgf-loader.ts` has zero hits — so there is no "handicap N" concept that
auto-derives standard placement points; only literal `AB`/`AW` coordinate lists are
consumed.

**The only mutator capable of writing `AB`/`AW`/`AE` is dead code.** `applySetup` exists
in `frontend/src/logic.ts:24-71`, and its own docstring (`:10-22`) flags it as
"caller-less at HEAD" — WITNESSED-in-source, confirmed by `grep -rn "applySetup" src/`
returning only its own declaration, a type comment, and test files. **There is no UI
control anywhere that lets a user place a setup/handicap stone.**

**Board creation is hardcoded to 19×19 with no size selector.** `createInitialBoard()`
sets `properties: { SZ: ['19'], GM: ['1'], FF: ['4'] }` unconditionally, takes no size
argument — WITNESSED-in-source `frontend/src/store/board-factory.ts:49-73` (properties
literal at `:57`). All four call sites (`useSgfLoader.ts`, `useReviewSession.ts`,
`useMinting.ts`, `store/index.ts:140,374,626,785`) call it with no size. The only way a
9×9/13×13 board reaches the app today is via an SGF file whose `SZ` already specifies it.
Board size itself is read from `SZ` independently in **four separate places**
(`util.ts:159-161`, `store/index.ts:213-218`, `useMetadata.ts:30`, and locally inside
`applyGoMove`/`applySetup` in `logic.ts:25,75`) — worth noting as a pre-existing
duplication a "new game" flow will need to key off consistently, though fixing that
duplication is not itself in scope of this feature.

**Wire type is ready to carry handicap stones as `initialStones`, distinct from
`moves`.** `KataGoAnalysisQuery` — WITNESSED-in-source
`frontend/src/engine/katago/types.ts:188-195`:
```ts
readonly moves: readonly [Player, KataCoord][];
readonly initialStones?: readonly [Player, KataCoord][];
readonly initialPlayer?: Player;   // declared, never referenced elsewhere — dead field
readonly rules: string;
readonly boardXSize: number;
readonly boardYSize: number;
readonly komi?: number;
```
Both query-builder call sites (`analysis-service.ts:672-694` and `:887-895`) already
populate `initialStones` from `getInitialStones(board)` (`util.ts:203+`, whose docstring
`:173-201` explicitly documents the initialStones-vs-moves distinction) — i.e. **the
wire mechanism for "these stones existed before move 1" already works** for any stones
present in `state.stones` at query time, which is exactly what handicap placement would
populate. `initialPlayer` is declared but unwired — a handicap game (White moves first
after Black's handicap stones) needs the board's `turn` set to `'W'` after handicap
placement; whether that alone suffices or `initialPlayer` should also be threaded is an
open question for the type-level design below.

**Komi has a working UI precedent to model a handicap-komi interaction on.** StatusBar
already has an editable komi input (`StatusBar.vue:98-102`, emits `update-komi`) wired to
`App.vue:171-179`'s `handleUpdateKomi`, which writes `KM` on the root node — a genuine
round-trippable control. Standard handicap convention (per Sabaki/KaTrain/OGS, see genre
section) sets komi to 0 or 0.5 automatically when handicap stones are placed, but leaves
it user-editable afterward — the existing komi control is directly reusable for the
"after auto-set, still editable" half of that convention.

### Genre convention

Sabaki: a "New Game" dialog with board-size selector, handicap-count selector (0, 2-9),
free-placement checkbox, and a komi field that auto-updates to the conventional
handicap-komi (usually 0.5) when handicap > 0, remaining user-editable. KaTrain: same
shape, handicap stones placed via a "Setup" mode toggle on the board (click to place/
remove before game start) in addition to a numeric handicap selector for standard
points. OGS: handicap is a game-creation-time dropdown (0-9, "auto" per board size),
server places standard points; free placement is not offered (OGS servers only ever use
fixed points). **Convergent shape: (a) handicap selection happens at game-creation time,
not mid-game; (b) a numeric handicap count auto-places standard fixed points for the
chosen board size; (c) free placement (setup-mode click-to-place, unlimited stones) is
offered as a secondary/advanced path in at least two of three exemplars (Sabaki, KaTrain)
but not OGS; (d) komi auto-adjusts on handicap selection but remains editable.**

### Option space

**A. Fixed-handicap-only, new-game dialog.** A "New Game" flow: board-size picker (9/13/
19, matching genre's discrete choices), handicap-count dropdown (0, 2-9, clamped to what
standard tables define per size), auto-placed via a `STANDARD_HANDICAP_POINTS` table
keyed by board size, auto-set komi (0.5), user-editable after. No free placement.
- Pros: closes the maintainer's stated need ("no handicap setup support") with the most
  common real-world usage pattern (OGS-style); smallest of the three; no new
  board-interaction mode required (placement is programmatic, not click-driven).
- Cons: deviates from (c) — Sabaki/KaTrain users expect free placement too. Named
  deviation, justified by smaller scope; can be Option B as a follow-on.

**B. Fixed + free placement (setup mode).** Adds a "Setup" board-input mode (toggle,
reusing `applySetup`) that lets a user click to place/remove `AB`/`AW` stones before the
game starts, in addition to A's fixed-count shortcut.
- Pros: full genre-convention match (a)-(d); `applySetup` already exists and just needs
  a caller — this is the option that finally uses the dead-code mutator flagged in the
  survey.
- Cons: needs a distinct board-input mode (setup vs. play), which is new routing state
  in `useBoardMoveRouting.ts` (a third mode alongside review/free-play) — moderate net-
  new surface. Needs a "commit setup, start game" transition (freezes `state.stones` as
  the SGF root `AB`/`AW`, sets `turn` to `'W'`).

**C. Fixed only, no dedicated dialog — inline board-size/handicap controls added to
existing chrome** (e.g. extend StatusBar or Toolbar rather than a new modal).
- Pros: even smaller than A; no new modal/dialog component.
- Cons: "new game" is conceptually a distinct action from "editing the current game's
  metadata," and none of the three exemplars conflate the two — OGS/Sabaki/KaTrain all
  use a dedicated creation step. Squeezing handicap/size pickers into the always-visible
  StatusBar would violate genre convention (a) (handicap is a creation-time decision,
  not a live-editable board property) and risks ADR-0019 appendix C2 (no editable
  derived value) confusion since board size retroactively changing an in-progress game
  is not a coherent operation. Not recommended.

### Recommendation

**Option A**, with B named as a natural, separately-ledgerable follow-on once the
maintainer confirms demand for free placement. A is the direct, minimum-genre-compliant
answer to "no handicap setup support" and reuses the existing wire mechanism
(`initialStones`) without needing `initialPlayer` wired at all — after handicap
placement, setting `state.turn = 'W'` before the first move is sufffiicient, since
`moveToKataCoord`/the query builders already derive move color from each `GameNode`'s
own `move.color`, not from a separate "starting player" field; `initialPlayer` can stay
unwired unless the proxy-side KataGo integration is found to require it explicitly (flag
this as a dispatch-boundary question, not a frontend design decision — see below).

### Type-level design (sketch)

```ts
// src/engine/handicap.ts (new, [B3] Go-bound)
export type HandicapCount = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type StandardBoardSize = 9 | 13 | 19; // handicap tables only defined for these

// Branded/keyed lookup — table keyed by the dependency set it depends on
// (size AND count), per frontend/CLAUDE.md's "keyed caches mint a branded key" rule:
export function standardHandicapPoints(
  size: StandardBoardSize,
  count: HandicapCount,
): readonly Point[];

// New-game intent as a discriminated union (not a loose options bag):
export type NewGameSetup =
  | { kind: 'even'; size: number; komi: number; rules: string }
  | { kind: 'handicap'; size: StandardBoardSize; count: HandicapCount; komi: number; rules: string };
```
`createInitialBoard` (`board-factory.ts:49`) gains a parameter of type `NewGameSetup`
(or is joined by a sibling `createHandicapBoard`), writing `SZ`, `HA`, `KM`, `AB` on the
root node and `state.stones`/`state.turn` accordingly — this is the first real consumer
of `applySetup`-equivalent logic at board-construction time (Option A does not need the
live `applySetup` mutator itself, since setup happens once at creation, not via
board-input routing — that mid-game mutator only becomes load-bearing under Option B).

### Touched-file inventory (Option A)

- `src/engine/handicap.ts` — new: standard-point tables + `NewGameSetup` type.
- `src/store/board-factory.ts` — `createInitialBoard` gains size/handicap/komi
  parameters or a sibling constructor.
- New "New Game" dialog component (e.g. `src/components/modals/NewGameModal.vue`,
  matching the existing `ResetAllKeybindingsModal.vue` pattern for modal shape).
- Wiring point in `App.vue` or wherever the current game-creation entry point lives
  (needs confirming — the "new board" action's current UI trigger, if any, was not
  located in this survey and should be confirmed before implementation).
- `src/engine/sgf-writer.ts` — confirm `HA` gets written alongside `AB`/`KM` when a
  handicap board is minted/saved (currently `sgf-loader.ts` never reads `HA`, and it's
  unconfirmed whether `sgf-writer.ts` writes it — check before implementing).
- `frontend/FILES.md` — new entries per the file-map maintenance discipline.

### Acceptance criteria (handles)

1. New-game flow offers board size (9/13/19) and handicap count (0, 2-9, clamped to the
   size's defined table) before any move is played.
2. Selecting handicap > 0 auto-places standard points as `AB` on the root and sets
   `turn` to `'W'`; komi auto-sets to the conventional handicap value (0.5) and remains
   user-editable via the existing StatusBar komi control (no new komi UI needed).
3. A KataGo query built from a freshly-created handicap board sends the handicap stones
   via `initialStones`, not `moves` (reuses existing `getInitialStones` path — WITNESS:
   inspect the assembled query object, confirm handicap stones absent from `moves`).
4. Handicap count options for a given size are visibly bounded to that size's standard
   table (no free-text count entry in Option A).
5. Board-size duplication (four independent `SZ`-reading sites) is not made worse — the
   new creation path writes exactly one root `SZ`/`HA`/`AB`/`KM` set and all four
   existing readers pick it up without needing modification (regression check, not a new
   feature).

### Size estimate

- Option C: not recommended (see above), no estimate given.
- Option A (recommended): M (new type module, board-factory changes, one new modal,
  wiring into whatever the current "new board" trigger is — that trigger itself needs
  locating, which adds modest discovery risk to the estimate).
- Option B (fixed + free placement): M-L on top of A (new board-input mode, `applySetup`
  finally gets a caller, setup-mode toggle UI, commit/start transition).

### Dispatch-boundary flag

None of the above requires backend or proxy changes — `initialStones` is an existing,
already-consumed field on the wire type, and standard handicap-point placement is pure
frontend arithmetic. The one open question that could become a dispatch item: **whether
KataGo/the proxy expects `initialPlayer` to be set explicitly for handicap games**
(rather than inferring first-mover from the absence of a Black move at index 0). This
survey did not find a `frontend/docs/wire-schemas.md` section addressing it (see
RULESETS section below on `wire-schemas.md`'s actual coverage), so if implementation
reveals KataGo silently assumes Black-always-first regardless of `initialStones`, that
becomes a `frontend-to-proxy-*.md` dispatch question, not a frontend code change.

---

## RULESETS

> **Governing constraint (commissioner ruling, ledger row 110, incorporated here
> verbatim as the section's scope boundary):** LengYue is public-domain (Unlicense);
> KataGo is MIT. Nothing from the KataGo rules documentation page is lifted or
> paraphrased-closely into this proposal or any implementation — the page is cited by
> URL as an external reference only, never quoted or summarized in fidelity. The
> commissioner has also fixed the target scope directly, superseding the open option
> space this section would otherwise have proposed:
> - Hard-coded support for exactly four named rulesets: **"AGA"**, **"Chinese"**,
>   **"Japanese"**, **"Tromp-Taylor"**.
> - A robust, case-insensitive, total normalization function from arbitrary input
>   strings (e.g. an SGF `RU` value like `"japanese"`, `"AGA"`, `"chinese"`) to one of
>   the four normalized names, with an honest, explicit fallback for unrecognized input
>   — no silent coercion.
> - Surfaced as a dropdown so the user can change the ruleset from whatever the loaded
>   SGF's `RU` said (if anything); the dropdown's value is exactly what reaches the
>   KataGo wire `rules` field.
> - **No component-rules model** (ko rule / scoring rule / suicide toggle / tax rule /
>   etc.) — explicitly out of scope by this ruling. Recorded below as
>   **rejected-by-commissioner**, not as a live option.
>
> The option space below is therefore narrower than the pass/handicap sections': the
> *what* (four presets, normalization, dropdown, no component model) is fixed by the
> ruling; the remaining design freedom is *how* the normalization function and its
> fallback behavior are shaped, and that is where the option space applies.

### Existing-state survey

**KataGo accepts named rulesets over the wire** (WITNESSED-external only — cited by URL,
not paraphrased: https://lightvector.github.io/KataGo/rules.html — per the ruling above,
no content from that page is reproduced here; the commissioner has independently fixed
the four names this proposal targets, so this proposal does not need to enumerate or
describe KataGo's own documentation content to justify them).

**The wire type already has a bare `rules: string` field, un-typed against KataGo's
vocabulary.** WITNESSED-in-source `frontend/src/engine/katago/types.ts:192`
(`readonly rules: string;`) — no `RulesString`/preset union type exists; any string is
currently accepted at the type level. The wire field itself stays a plain `string`
(that's the type already in place and is sufficient for a preset-name value); this
proposal's work is entirely on the domain side, constraining what feeds that string to
the four ruling-mandated names via a total, validated construction path.

**The value sent is hardcoded and ignores what's displayed.** Both query builders send
the literal `'tromp-taylor'` — WITNESSED-in-source `frontend/src/services/analysis-service.ts:676`
and `:891` — **regardless of the loaded SGF's `RU` property.** Meanwhile `useMetadata`
reads `RU` for display: `rules: props['RU']?.[0] || 'Japanese'` — WITNESSED-in-source
`frontend/src/composables/auth-app/useMetadata.ts:29` — and `StatusBar.vue:95` renders
that value as read-only text next to komi (`{{ metadata?.rules }} · ...`). **This is a
live display/wire mismatch, independent of the "no easy ruleset support" feature ask**:
a user loading a `RU[Japanese]` SGF today sees "Japanese" in the status bar while KataGo
silently analyzes/scores under Tromp-Taylor. This should be flagged to the maintainer
regardless of which ruleset-selection option is chosen, since it's a correctness bug
sitting underneath the feature gap.

**No UI edit control for rules exists** — komi has one (`update-komi` round-trip via
`StatusBar.vue:98-102` → `App.vue:171-179` → root `KM`), rules does not. `sgf-loader.ts`
does not read or write `RU` at all — the value flows through root `properties` purely as
inert pass-through data consumed only by the display-side `useMetadata`.

**Capability/override precedent exists for a different KataGo setting.** The
`reportAnalysisWinratesAs` setting is modeled as a typed dropdown union
(`WinrateFraming` in `types.ts`) surfaced in the "registry editor" per
`docs/handoff-current.md:176-178` and wired through `overrideSettings` in the query. This
is the closest existing precedent in the codebase for "a KataGo engine-behavior setting,
exposed as a typed dropdown, persisted, sent per-query" — a ruleset selector should
follow the same shape rather than invent a new one.

**No `RulesString` brand or component-rules type exists anywhere** in `types.ts` (full
export listing checked; confirmed absent).

### Genre convention

Sabaki: ruleset is a per-file/per-game dropdown in game info, defaulting to whatever the
loaded SGF's `RU` says, editable, persisted back to `RU` on save. KaTrain: ruleset is a
global-ish setting with a per-new-game override, exposed as a labeled dropdown of the
named presets (not raw component fields — component-level tuning is developer/config-file
territory in KaTrain, not surfaced in the main UI). OGS: ruleset is chosen at game-
creation time from a small dropdown (Japanese/Chinese/AGA/etc.), persisted with the game
record, not user-editable mid-game. **Convergent shape: (a) a dropdown of named presets
is the primary/only UI surface — no exemplar exposes raw component-rule toggles
(KoRule/TaxRule/etc.) in its main UI, that granularity is advanced/config-file-only even
in the most engine-forward tool (KaTrain); (b) the selected ruleset persists with the
game record (SGF `RU`, in this app's terms); (c) rules and komi are shown together but
edited independently (this app already does (c) for komi's half; rules needs the other
half).**

### Option space

The ruling fixes the *what* (four hard-coded presets: AGA, Chinese, Japanese,
Tromp-Taylor; case-insensitive total normalization; dropdown; wire value = dropdown
value). Remaining design freedom is the normalization function's fallback behavior for
unrecognized input, and whether a global default exists. Two axes, not independently
combinable in a meaningful third way, so presented as a single ranked option space:

**A. Fail-loud on unrecognized `RU`.** `normalizeRuleset(raw: string): RulesetName`
returns one of the four names for any recognized case-insensitive spelling (including
common aliases actually present in real SGF corpora, e.g. `"Japanese"`, `"japanese"`,
`"AGA"`, `"Chinese"`) and otherwise **does not silently default** — it returns a fourth,
explicit `'unknown'` arm (not absorbed into one of the four), and the dropdown/status UI
surfaces "ruleset not recognized, please choose one" rather than picking a value on the
user's behalf.
- Pros: matches ADR-0002 (fail loudly) squarely — a silently-defaulted ruleset changes
  scoring/analysis semantics invisibly, which is exactly the class of silent failure
  ADR-0002 exists to prevent; the user is never told a false story about what rules are
  in effect.
- Cons: an `'unknown'` arm means the KataGo wire field cannot be populated until the
  user picks — the query-sending code path needs a defined behavior for "no ruleset
  chosen yet" (e.g. block the query, or require a selection before the first query is
  built for a freshly-loaded board with a foreign `RU`). This is a small additional
  state to design (see acceptance criterion 4 below) but not a large one.

**B. Silent-default on unrecognized `RU`.** Same normalization function, but
unrecognized input coerces to one fixed default (e.g. `'Chinese'`), matching the
existing `getKomi`/`getBoardSize` convention of silently defaulting on a missing/
malformed SGF property.
- Pros: simpler call sites — the wire field always has a valid value, no `'unknown'`
  state to plumb through the query builders.
- Cons: **is the silent coercion the ruling explicitly disallows** ("do not silently
  coerce" is stated directly in the ruling's normalization requirement) — this option is
  effectively foreclosed by the ruling's own text, included here only to show the
  rejected alternative and why, per the project's "justify the space, not just
  tradeoffs" convention.

### Recommendation

**Option A (fail-loud, explicit `'unknown'` arm)** — this is not a close call: the
ruling's own text ("design and justify: refuse loudly vs. explicit 'unknown' arm; do not
silently coerce") both names this as the intended axis and forecloses B directly. A is
recommended, and is the only option consistent with the ruling as written.

**Rejected-by-commissioner (recorded per the ruling, not offered as a live option):**
full component-rules exposure (ko rule / scoring rule / suicide-legality / tax-rule /
handicap-bonus / pass-button toggles as independently settable fields, using the
`overrideSettings`/registry-editor precedent the way the `WinrateFraming` dropdown does
today). This would have been the natural "richer" option in an unconstrained design and
was the direction this survey's file-level research supports as technically
straightforward (the wire type's `rules` field and the `overrideSettings` machinery
could both carry it) — but the ruling excludes it explicitly, so it is not evaluated
further here.

### Type-level design (sketch)

```ts
// src/engine/katago/types.ts (or a new src/engine/rulesets.ts — placement TBD) —
// the four ruling-mandated names as a closed union, plus the explicit unrecognized arm:
export const RULESET_NAMES = ['AGA', 'Chinese', 'Japanese', 'Tromp-Taylor'] as const;
export type RulesetName = typeof RULESET_NAMES[number];

// Discriminated union output — normalization is TOTAL (always returns a value) but
// distinguishes "confidently resolved" from "could not resolve," per Option A:
export type RulesetResolution =
  | { kind: 'resolved'; name: RulesetName }
  | { kind: 'unknown'; raw: string };

// Total, case-insensitive normalization — sole construction site for RulesetName from
// untrusted input (SGF RU property, in this codebase's terms):
export function normalizeRuleset(raw: string | undefined): RulesetResolution { /* ... */ }

// src/engine/util.ts — new accessor, parallel in shape to getKomi/getBoardSize but
// returning the resolution type rather than defaulting silently:
export function getRulesetResolution(state: BoardState): RulesetResolution {
  const raw = state.nodes[state.rootNodeId]?.properties['RU']?.[0];
  return normalizeRuleset(raw);
}
```
`normalizeRuleset` is the single mandated construction site for `RulesetName` (mirrors
`frontend/CLAUDE.md`'s "keyed caches mint a branded key at construction" spirit applied
to a validated enum rather than a cache key) — no other module should string-compare
against the four names directly.

### Touched-file inventory (Option A)

- `src/engine/rulesets.ts` (new, `[B3]` Go-bound) — `RulesetName`, `RulesetResolution`,
  `normalizeRuleset`.
- `src/engine/util.ts` — new `getRulesetResolution` accessor (parallel in shape to
  `getKomi`/`getBoardSize`, but returning the resolution union rather than defaulting).
- `src/components/board/StatusBar.vue` — new rules dropdown next to the existing komi
  input, driven by the four `RULESET_NAMES` plus an "unrecognized" state/notice; new
  `update-rules` emit (parallel to `update-komi`, `:61`).
- `App.vue` — new `handleUpdateRules` handler (parallel to `handleUpdateKomi`,
  `:171-179`), writing `RU` on the root node using the ruling's four canonical spellings.
- `src/services/analysis-service.ts:676,891` — replace hardcoded `'tromp-taylor'` with
  the resolved `RulesetName` (query-construction must handle the `'unknown'` resolution
  case — see acceptance criterion 4).
- `frontend/FILES.md` — new entry for `src/engine/rulesets.ts` per the maintenance
  discipline.

### Acceptance criteria (handles)

1. StatusBar shows an editable ruleset dropdown with exactly the four ruling-mandated
   options (AGA, Chinese, Japanese, Tromp-Taylor), defaulting to the loaded SGF's `RU`
   normalized case-insensitively when it matches one of the four (WITNESS: load SGFs
   with `RU[japanese]`, `RU[AGA]`, `RU[Chinese]`, `RU[Tromp-Taylor]` and confirm each
   resolves to the correct dropdown selection regardless of input case).
2. Changing the dropdown writes one of the four canonical spellings to `RU` on the root
   node and the change is visible immediately in the status display (mirrors komi's
   existing round-trip).
3. A KataGo query built after changing the ruleset sends the newly-selected name in its
   `rules` field — WITNESS: inspect the assembled query object at
   `analysis-service.ts:676`/`:891`.
4. Loading an SGF with an `RU` value that does not case-insensitively match any of the
   four (e.g. `RU[New Zealand]`, `RU[]`, missing entirely) does **not** silently default
   — the UI surfaces an explicit "ruleset not recognized, please choose one" state and no
   KataGo query is sent using a guessed value until the user selects one from the
   dropdown (WITNESS: load such an SGF, confirm the notice appears and no query fires
   with an unvalidated `rules` string).
5. `normalizeRuleset` is total (returns a `RulesetResolution` for every string input,
   including empty/malformed) and case-insensitive (WITNESS: unit-test-style check
   across mixed-case variants of all four names plus garbage input).

### Size estimate

S — mirrors the existing komi pattern closely (new small module, one new accessor, one
new dropdown, one new handler, two call-site fixes), with the only addition beyond a
simple presets dropdown being the explicit `'unknown'`-resolution plumbing through the
query-construction call sites (criterion 4), which is a small, contained addition, not a
new architectural shape.

### Dispatch-boundary flag

None of this requires backend or proxy change — `rules` is already a plain string field
on the existing wire type and KataGo accepts named presets directly; this is a pure
frontend fix-and-feature. `docs/wire-schemas.md` was checked in full for existing
coverage of `rules`/`komi`/`moves`/`initialStones` (§1-§9, `docs/wire-schemas.md:27-35`)
and confirmed to cover only proxy-specific wire extensions (`analysis_config`,
capability negotiation, `extra` envelope, `model` routing, REST APIs) — the core KataGo
positional fields including `rules` are documented as living solely in
`frontend/src/engine/katago/types.ts` and upstream KataGo's own docs, not in
`wire-schemas.md`, per that document's own §8 framing. No dispatch document exists today
for `rules`/`komi`/handicap fields, and none is needed for this ruling-constrained scope
(rejected-by-commissioner component-rules exposure is the only variant that would have
raised a proxy-side `_PROXY_ONLY_FIELDS` question, and it is out of scope).
