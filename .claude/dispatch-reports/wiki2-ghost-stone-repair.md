# wiki2-ghost-stone — repair pass report

Repair of a prior build (`d88d3151` on `worktree-agent-a3b7009163089bccc`)
done against a stale base (dependabot lineage `3378806f`, schema version 61,
no `touchSession`, ~1111-test suite). This pass rebases onto current `next`,
re-derives every store-layer artifact against schema 74 → 75, and
independently re-judges the prior attempt's design calls rather than
inheriting its framing.

## Base freshness

- `git rebase next` — clean, fast-forward-equivalent, no conflicts.
- `grep CURRENT_SCHEMA_VERSION frontend/src/store/migrations.ts` showed `74`
  before any edit — confirmed fresh base per the brief's stop condition.
- Full test run: **2925 passed | 4 skipped (2929)** — matches the expected
  ~2900-test suite, not the stale ~1111. Confirms the fresh base held
  through the whole build.

## Original commission (verbatim, restated for the record)

> The pointer over the board should be a normal pointer, except that there
> should be a "ghost stone" as in cgoban3 that shows the color and
> placement if the stone were to be put at that intersection; no affordance
> for board evaluation, hence, it should be visible whether it's a legal
> placement or not, and if it would capture anything, that capture should
> not be previewed -- hence, it is the simplest and most rudimentary stone
> placement preview imaginable. Should be optional.

## Per-claim status

| # | Claim | Status |
|---|-------|--------|
| 1 | Schema migration renumbered 74→75, rolling-archive discipline exact | **WITNESSED** — archived 72→73 into `archived-migrations.ts`, active file now holds exactly the latest two (73→74, 74→75), `CURRENT_SCHEMA_VERSION = 75`, both file headers updated. Migration + composition tests green. |
| 2 | Session writes use `touchSession()` | **WITNESSED, but not the way the brief anticipated.** The design call (see #3) routes the toggle exclusively through the generic `RegistryEditor` → `SettingsTab.vue`'s `handleSessionUpdate`, which *already* calls `touchSession()` on every write. No bespoke write site exists in my diff, so there is no site that could skip the bump — verified by reading `handleSessionUpdate`'s body rather than assuming. |
| 3 | Re-evaluate StatusBar button placement | **WITNESSED — dropped the button.** See "Design decisions" below. |
| 4 | Pure `computeGhostStone(enabled, turn, hoverPoint)`, no `BoardState` | **WITNESSED** — kept verbatim from the prior attempt; independently re-read and judged sound (no legality/occupancy parameter exists to gate on). |
| 5 | CSS `:hover`-based visibility claim re modal backdrops | **WITNESSED, independently verified.** `grep -rn "position: fixed\|pointer-events" src/components/modals/*.vue` shows all 11 modal backdrops are `position: fixed` full-viewport with no `pointer-events` override (default `auto`), confirming the claim holds against the *current* tree, not just trusted from the prior report. |
| 6 | i18n keys in all four locale files | **REFUSED-AS-EXPECTED, by design call.** Dropping the StatusBar button (per #3) removes the only string that would have needed translation (`statusBar.toggleGhostStone`'s title). `RegistryEditor` renders a leaf's label as the literal key name (`{{ key }}`, no `$t()` call — verified by reading `RegistryEditor.vue` in full), so `showGhostStone` needs zero locale entries. This sidesteps the concurrent wizard-locale-step dispatch entirely rather than needing "surgical" edits — the two dispatches now touch disjoint files. |
| 7 | Unit tests: toggle-off never renders; illegal intersection still renders; color follows side-to-move | **WITNESSED** — all three (plus a no-hover-point case) in `tests/unit/composables/ghost-stone.test.ts`, 4/4 passing. |

## Design decisions (not narrowings — the commission never specified these; each is justified below)

**Dropped the StatusBar "○" button; registry-only toggle.** Checked the
three existing precedents for board-display boolean toggles under
`session.ui`:

- `showStoneMoveNumbers` — StatusBar button **and** a keybinding
  (`keybindings-catalog.ts`).
- `showActiveNextMove` — registry-only (its own schema comment says
  "disable it via the Session (UI) registry").
- `showTranspositionRings` — registry-only, no button, no keybinding.

Two of three precedents are registry-only; `showStoneMoveNumbers` is the
outlier, plausibly because move-number annotation is toggled mid-review far
more often than a hover preview a user sets once. The commission's text
says only "should be optional" — it doesn't ask for board-chrome quick
access. Registry-only:

- Matches the majority precedent rather than the minority one.
- Sidesteps `StatusBar.vue`'s G12 narrow-mode segment-priority collapse and
  G30 24px-floor bookkeeping entirely, for a preference most users set once.
- Needs zero locale-file edits (see claim #6), avoiding any collision risk
  with the concurrent wizard-locale-step dispatch.
- Costs nothing extra: adding `showGhostStone: boolean` to `schema.ts` +
  `defaults.ts` is picked up automatically by the generic
  `RegistryEditor` mounted over `store.session.ui` in `SettingsTab.vue`
  (`<RegistryEditor :registry="store.session.ui" ... @update="handleSessionUpdate"/>`)
  — a checkbox row appears with no bespoke component code, and
  `handleSessionUpdate` already bumps `touchSession()` generically.

This is the "conservative reading" the brief itself named as the
alternative to keeping the button — taken deliberately, not by default.

**Fixed `cursor: crosshair` → `cursor: default` on `.board-svg`.** The
prior attempt (`d88d3151`) never touched this. Re-reading the commission's
first clause literally — "The pointer over the board should be a normal
pointer, except that there should be a 'ghost stone' ... that shows the
color and placement" — reads as an explicit requirement: the *system
cursor* should be the plain arrow, and the ghost stone (not a crosshair)
is what indicates placement. This was a genuine gap in the prior build,
not a narrowing on my part — restoring it is squarely inside the spec's
own words. Applies unconditionally (not gated on the toggle) since a
cursor style flipping between crosshair/default as a user checks/unchecks
a Settings-pane box mid-session would be a worse experience than a
constant normal pointer; documented inline in `BoardDisplay.vue`.

## Kept from `d88d3151` (independently re-verified, not just trusted)

- `computeGhostStone` composable shape and its docstring's core argument
  (no `BoardState` parameter ⇒ structural no-legality guarantee) — kept
  near-verbatim, light edit to the doc comment's StatusBar reference.
- The 4-case unit-test suite for `computeGhostStone` — kept verbatim,
  still exercises exactly what the pure function's signature promises.
- `resolveBoardPoint` extraction in `BoardDisplay.vue` (shared pointer →
  board-coordinate math between click and hover) — kept, sound
  refactor, no behavior change to the click path.
- The CSS-`:hover`-not-JS-flag visibility gate and its rationale — kept,
  but independently re-verified against the CURRENT modal implementation
  (see claim #5) rather than carried on trust.
- `pointer-events="none"` on the ghost `<circle>` and the opacity/no-
  transition CSS treatment — kept, consistent with the standing law
  (translucent sprite alpha ≠ banned diffuse overlay).

## Discarded from `d88d3151`

- The StatusBar `"○"` button, its CSS block, its keybinding-adjacent
  wiring, and the four locale-file `statusBar.toggleGhostStone` entries —
  superseded by the registry-only design call above.
- The migration numbering (61→62 against the stale schema-61 base) —
  fully re-derived as 74→75 against schema 74, with the accompanying
  rolling-archive move (72→73 into the archive) the stale build never
  needed to perform (its base only had two active migrations at 60→61/
  61→62 already).
- `defaults.ts`/`schema.ts` prose that cross-referenced the (now-dropped)
  StatusBar button — rewritten to state and justify the registry-only
  design instead.

## Gates (worktree `frontend/`, foreground, `timeout=600000`)

- `nice -n 19 npx vue-tsc --noEmit` → **exit 0**
- `nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 npm run test:run` → **exit 0**, `Test Files 235 passed | 3 skipped (238)`, `Tests 2925 passed | 4 skipped (2929)`
- `npx eslint` over every changed source/test file → 0 errors (2 ignore
  warnings on `*.test.ts`, matching this repo's existing eslint-ignore
  convention for the test tree).

(Note: this worktree had no `node_modules` at handoff; ran `npm ci` before
the gates. Both gates were then run to completion in the foreground per
instructions.)

## Documentation

- `frontend/FILES.md` — added `ghost-stone.ts` `[B3]` entry (alphabetical
  slot in `composables/board/`).
- `FEATURES.md` — added a "Ghost-stone hover preview" entry under "The
  board," naming the on-by-default posture and the Session (UI) toggle.
- Both are content-only edits to existing doc nodes (no new doc file, no
  cross-reference change) — per the umbrella CLAUDE.md's doc-graph
  discipline, no `node tools/doc-graph/generate.mjs` regeneration is
  required for a content-only change.
- No `docs/dispatch/` entry needed — this is a self-contained frontend
  change with no cross-sub-project wire-shape implication.

## Files touched

- `frontend/src/composables/board/ghost-stone.ts` (new)
- `frontend/tests/unit/composables/ghost-stone.test.ts` (new)
- `frontend/src/components/board/BoardDisplay.vue`
- `frontend/src/components/board/BoardWidget.vue`
- `frontend/src/store/schema.ts`
- `frontend/src/store/defaults.ts`
- `frontend/src/store/migrations.ts`
- `frontend/src/store/archived-migrations.ts`
- `frontend/tests/unit/store/migrations.test.ts`
- `frontend/FILES.md`
- `FEATURES.md`

## Stop-and-report items

None. No scope narrowing occurred; both design departures from the prior
build (registry-only toggle, cursor fix) are documented above as
justified calls within the commission's own words, not restrictions of it.
