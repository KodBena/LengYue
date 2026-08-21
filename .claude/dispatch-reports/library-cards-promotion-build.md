# Library/Cards toolbar promotion — build report

Base: `origin/lyt-phase2` @ `148899f7` (confirmed current at gate time —
`git fetch origin lyt-phase2` still reports `148899f7`, no rebase
needed; `git merge origin/lyt-phase2` reported "Already up to date").
Branch: `lyt-library-cards-promotion` (worktree
`agent-aa64269b4ced625e3`).

## Mandate delivery

1. **Control panel loses Library/Cards.** `state/lyt-layout.gen.ts` and
   `state/lyt-layout-portrait.gen.ts`: the `controlPanel` Exclusive's
   `library`/`cards` `LytExclusiveChild` entries are removed (hand-edited
   — both files' inline comments name the disclosed bypass, ledger row
   2511: the LYT DSL has no vocabulary for "a toolbar-launched surface
   that still borrows a Split's grid track," so this is realized as
   plain, honest Vue/data code rather than forcing a new DSL concept).
   `defaultTabId` moves to `settings`. `state/layout-model.ts`'s
   `CONTROL_PANEL_TAB_IDS` narrows to `['settings', 'analysis', 'other']`
   (was 5, now 3) — `computeControlPanelMinWidthPx` re-derives the floor
   automatically (300px → 188px).

2. **Toolbar-level primary entries.** `components/chrome/
   ToolbarEngineControls.vue` gains two buttons (`app.tabs.library` /
   `app.tabs.cards` labels) as plain siblings of MINT CARD(S)/LEARN
   PATH/PLAY/MATCH/CONNECT — same `.toolbar-btn` idiom, same
   `button-cluster`/`menu-path` responsive realization (the existing
   `useEngineControlsRealization` measurement composable needed no
   changes; it's generic over button count). New `activeSurface` prop
   drives a `.btn-surface-active` class (accent-bordered, `--surface-3`
   fill — same family as `TabWidget.vue`'s own `.tab-header li.active`
   accent treatment). `state/lyt-capability-registry.ts` gained
   `open-library`/`open-cards` entries in the documentation-only
   capability census (not itself load-bearing at runtime — verified
   `useEngineControlsRealization.ts` doesn't import it).

3. **Full-width right-side surface.** App.vue's new `rightPanelMode`
   computed (`'library' | 'cards' | 'controlPanel'`, derived from the
   SAME `store.session.ui.activeTab` cell — no new persisted state, no
   migration) drives an opaque overlay (`.right-panel-surface-overlay`,
   `position: absolute; inset: 0`) rendered via the pre-existing
   `#exclusive-controlPanel` slot — the EXACT box the tab strip's body
   used to give these two panes, so neither is narrower than before.
   `z-index: 5` (above the TabWidget's implicit 0, below `.lyt-resizer`'s
   10 — the tree/control-panel drag handle stays grabbable). `LibraryTab`/
   `ForestDirectory` mount with byte-identical props/events to their
   pre-relocation slot templates (verbatim relocation, ADR-0004).

4. **Coherent toggling + active-state.** One `activeTab` cell, two
   views: `rightPanelMode` (overlay) and the Exclusive's own
   `exclusiveActiveByPath` (strip highlighting) are both pure functions
   of it. Clicking Library/Cards writes `activeTab` via
   `openLibrarySurface`/`openCardsSurface`; clicking Settings/Analysis/
   Other writes it via the pre-existing `handleLytExclusiveActiveChange`
   — whichever fired last wins, by construction (single source, no
   possible split-brain). Toolbar active-state (`btn-surface-active`)
   and overlay presence are both direct functions of the same read.

5. **Writer/reader enumeration (7 total).**
   - Writers: App.vue's `activeTab` computed setter (routed through by
     `handleLytExclusiveActiveChange` AND the two new
     `openLibrarySurface`/`openCardsSurface` handlers — 3 call sites,
     1 setter); `composables/perf/autonav.ts` (dev-only perf harness,
     unaffected — still writes `'analysis'`, a surviving tab);
     `store/archived-migrations.ts`'s 16→17 migration (historical,
     one-time, unaffected).
   - Readers: App.vue's `activeTab` computed getter; `lytExclusiveActiveByPath`
     (feeds LytNode's TabWidget `v-model`); the new `rightPanelMode`
     computed (feeds the overlay `v-if` and the toolbar's
     `active-surface` prop); `store/defaults.ts`'s default seed
     (`'cards'`, unaffected — still resolves to the Cards overlay by
     construction).
   - Explicitly NOT the same state: `ForestDirectory.vue`'s own local
     `activeTab` ref (Decks/Browse sub-strip) and
     `AnalysisDashboard.vue`'s own `activeTab` (chart-tab strip) — both
     independent, unrelated identifiers a naive grep would conflate
     with the control-panel one; confirmed distinct, untouched.
   - No wizard step or SR-flow writer of `activeTab` exists in this
     codebase today (grepped `components/wizard/`) — nothing to
     re-point there; the "SR flow lands on Cards" behavior is fully
     accounted for by the unchanged `activeTab: 'cards'` default.

## Registry/test fallout (pre-existing tests tuned to the 5-tab shape)

- `lyt-widget-registry.ts`: `CP-library`/`CP-cards` entries are DEAD for
  the real compiled program (no `LytChild` references either id any
  more) but were **kept, not deleted** — `LytNode-exclusive-rendering.test.ts`
  deliberately reuses them as generic pre-registered widget-id fixtures
  (its own header says so), and deleting them would fail that suite for
  a purely cosmetic gain. Disclosed in both entries' notes.
- `tests/unit/state/layout-model.test.ts`: three assertions pinned to
  the old 5-tab shape updated (tab count 5→3; the G10 witnessed-content
  floor-clearance check re-scoped to the three surviving tabs' own
  witnessed widths, 169.1px; the 900x600 tree-panel-clamp regression
  test's historical numbers no longer force a clamp at the new, smaller
  188px floor — re-scaled to a region that still exercises the clamp
  path, since the original numbers were a genuine behavior improvement,
  not a regression, from the floor shrinking).
- `tests/integration/ToolbarEngineControls-menu-capabilities.test.ts`:
  four count/index assertions updated for the two new buttons (shadow
  count 7→9, menu-item count 5→7, "Connect is the last item" position
  fixed from `items.length-1` to the now-correct index 4, total
  `.toolbar-btn` count 12→16).

## New regression coverage

- `tests/integration/App-library-cards-promotion.test.ts` (new): mounts
  full `App.vue` (App-boot.test.ts's own preamble). Verifies: the
  control-panel strip has exactly Settings/Analysis/Other, never
  Library/Cards; default boot lands on the Cards overlay
  (`activeTab: 'cards'`); clicking Library shows `LibraryTab` full-width
  and marks the toolbar entry active; clicking Cards after Library
  swaps the overlay (one surface at a time); activating Settings while
  an overlay is showing closes it and shows Settings underneath
  (Analysis/Other remain independently reachable).
- `tests/integration/HyperparamPromptModal-teleport.test.ts` (new, rider
  2 — see below).

## Riders addressed

1. **Stray empty tab-shaped bordered cell** (Settings → Analysis
   Environment's sub-tab strip, after "Keybindings" —
   `nncache-live-acceptance.md` item 5). Root cause not conclusively
   pinned via static analysis alone (no live-rig access permitted this
   session; `TabWidget.vue`'s own template has no extra `<li>` — a
   literal phantom DOM node was ruled out by reading the whole file).
   Applied fix: `.vue-tabs--header-only .tab-header { align-self:
   flex-start; max-width: 100%; }` (`components/chrome/TabWidget.vue`)
   — the header row previously stretched to the full leaf width via
   `.vue-tabs`'s default flex `align-items: stretch`, leaving a blank,
   `.tab-header`-styled region (same background, same trailing
   `border-bottom`) past the last real tab; sizing the row to its own
   content removes that region regardless of the exact rendering
   mechanism. Scoped to `part="header"` mode only (the settings
   sub-strip), every `part="both"` consumer unaffected. **Flagging
   honestly: this is the best-available fix under this session's
   constraints, not a confirmed root-cause fix** — if it doesn't fully
   resolve the live symptom, the next session has a live rig and should
   re-diagnose from there.

2. **Pipeline modal clipped off the right viewport edge**
   (`5f94_cards_occluded_modal.png` — the `HyperparamPromptModal`
   deck-size prompt). `HyperparamPromptModal.vue`'s root wrapped in
   `<Teleport to="body">`, matching every sibling modal's own effective
   behavior (all others mount near App.vue's template root; this was
   the one modal nested deep inside ForestDirectory's own DOM subtree,
   several levels below `#control-panel`). The witnessed symptom
   (backdrop pinned to the control-panel's own box, not the true
   viewport) is the textbook signature of `position: fixed` picking up
   an ancestor-established containing block (`transform`/`filter`/
   `contain`/`will-change`) — I could not pin the SPECIFIC offending
   ancestor via static grep across the full ancestor chain (App.vue,
   LytNode.vue, ForestDirectory.vue, and every global stylesheet were
   checked; none declares one of the known containing-block-creating
   properties), so rather than leave the bug open pending that
   diagnosis, `Teleport to="body"` sidesteps the mechanism entirely —
   the canonical fix for this exact class of bug, and it makes this
   modal newly relocation-safe (it's now reachable from the toolbar-
   launched Cards overlay too, at any DOM depth). Positioning is CSS
   geometry (`position: fixed; inset` via `top/left/width/height:
   100vw/100vh`, flex-centered), not computed in JS, so no
   jsdom-expressible positioning assertion applies — the regression
   test (`HyperparamPromptModal-teleport.test.ts`) instead asserts the
   STRUCTURAL guarantee that makes the CSS correct: the backdrop lands
   as a direct child of `document.body`, not inside a deeply-nested
   trigger subtree.

3. **"Gradient Calibration" starts expanded, consumes the whole panel**
   (`5f94_gradient_takes_up_inordinate_amount_of_space...png`).
   `App.vue`'s `#leaf-otherColorDebug` slot: wrapped in a native
   `<details class="settings-section">` disclosure (shared-chrome.css's
   pre-existing idiom, same one `RegistryEditor.vue`'s branch sections
   use) — collapsed by default (no `open` attribute), matching the
   ruling ("the default is collapsed"). Per-session persistence of an
   explicit user toggle is a byproduct of the native `<details>`
   element for as long as the component stays mounted, not a new
   store-backed preference — `RegistryEditor.vue`'s own header
   documents why there is no persisted-disclosure precedent in this
   codebase to diverge from here; a durable-across-reload persisted
   choice was not built, since the ruling only requires the default.

## Gates

- `nice -n 19 npm run build` → **exit 0** (`vue-tsc -b && vite build`,
  1252 modules, no type errors).
- `NODE_OPTIONS=--max-old-space-size=2048 nice -n 19 npx vitest run
  --changed=148899f7 --maxWorkers=2` → **exit 0**, 43/43 files, 458/458
  tests. (First run surfaced 4 unhandled-rejection warnings from
  `LibraryTab`'s own fire-and-forget network reads once the new tests
  actually mount it via the toolbar click path — not present in
  `App-boot.test.ts` since its default-Cards boot never mounts
  `LibraryTab` at all; fixed by faking `library-service.ts` at the
  service boundary in the new test file, same pattern every other
  integration test in this tree uses. Re-run: clean, exit 0.)
- `git merge origin/lyt-phase2` → "Already up to date" (base unchanged
  at gate time; re-fetched immediately before this report, still
  `148899f7`).

## Disclosed narrowings

- No live-service contact this session (per brief) — the two CSS-only
  riders (stray tab cell, modal clipping) are diagnosed and fixed from
  source-reading alone; both are flagged above with the specific
  confidence level, per ADR-0002 (a plausible fix stated as fact would
  be the silent failure that tenet forbids).
- `lyt-capability-registry.ts`'s two new entries extend a
  documentation-only IR (verified not consumed by
  `useEngineControlsRealization.ts` at runtime) — cheap to add, so
  added for completeness, but this is not itself load-bearing for the
  toolbar buttons to work.
- Persisted-disclosure state for the Gradient Calibration collapse
  (surviving a page reload) was not built — the ruling's own wording
  ("may keep... thereafter") reads as optional, and the codebase has no
  existing precedent to extend; flagged for the commissioner if a
  reload-durable preference turns out to be wanted.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
