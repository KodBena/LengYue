# W5 — parity audit + merge-gate doc pass (build report)

Slug: `lyt-w5-parity`. Worktree: `/home/bork/w/omega/.claude/worktrees/agent-ab53724ad3697b0f4`.
Branch: `worktree-agent-ab53724ad3697b0f4`.

Driven by `.claude/dispatch-reports/lyt-vue-realization-roadmap.md` §6
(the parity-checklist definition) / §8 W5 (this wave's scope), against
`.claude/dispatch-reports/lyt-parity-inventory.md` (the checklist
source, read end to end).

## Base freshness

- First act: fetched, verified `lyt-phase2` at `ace98648` (the required
  minimum — HEAD was already an ancestor of it), rebased cleanly
  (fast-forward).
- Last act (re-run immediately before filing this report): re-fetched;
  `lyt-phase2` had not moved. **Delivery-time merge-base:
  `ace98648a81225b47fa03432709993be4b979c93`** (== `lyt-phase2`'s own
  tip at delivery; `origin/lyt-phase2` matched).

## Documents read end to end before this audit

`.claude/dispatch-reports/lyt-parity-inventory.md`,
`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`, `FEATURES.md`
(the whole tour — twice; see the note below), `frontend/CLAUDE.md`,
the umbrella `CLAUDE.md` (in full, via the session's system context),
`docs/handoff-current.md` (in full — see its own audit-walk conclusion
below), and `.claude/dispatch-reports/lyt-w4-chrome-build.md` /
`lyt-w4-fix-build.md` (the residuals' own grounding).

**Self-correction disclosed, per ADR-0002's own force applied to this
session:** an early `Read` of `FEATURES.md` returned content that
turned out to be STALE relative to what's actually on this branch (it
was missing the "Off by default; reachable via the corner presence
menu" language and the "Position preview panel" entry that W2 had
already landed at `0db8ef26`, well before this wave started). A `grep`
sanity-check for presence-menu language surfaced the mismatch; the
file was re-read in full before any FEATURES.md edit was made, and
the rewrite below is against the RE-READ, current content. Flagged
here rather than silently proceeding on the first (stale) read.

## 1. Parity checklist — the verdict table

Legend: **REACHABLE-VERIFIED** (asserted live, this pass, under
probe isolation, or verified via the existing/updated test suite) /
**RATIFIED-EXCLUDED** (out of scope by a named standing ruling) /
**ENGINE-GATED** (mounts and is reachable to the dead-port boundary;
behavior past that boundary requires a live KataGo/proxy connection,
not exercised here per the isolation rule) / **BACKEND-GATED** (same,
for a live backend) / **DEFECT** (a real finding, witnessed).

### (a) Panel features (bulk sweep — mounts and reachable)

| # | Feature | Verdict | Evidence |
|---|---|---|---|
| 1 | Library tab mounts | REACHABLE-VERIFIED | `lyt-w5-parity-probe.mjs` §A: 5-tab sweep, index 0 |
| 2 | Cards tab mounts (Decks/Browse) | REACHABLE-VERIFIED | §A index 1; Mint modal opened via its real trigger (§B) |
| 3 | Settings tab mounts (palette/analysis-layout/registry/card-set/keybindings editors) | REACHABLE-VERIFIED (mount only) / ENGINE-GATED (editor content that reads live engine state) | §A index 2. Editor sub-panels are pre-existing, chrome-adjacent-only content the LYT rework does not touch (control-panel body is a reused black box per roadmap §2) |
| 4 | Analysis tab mounts (dashboard, charts, timeline, palettes) | REACHABLE-VERIFIED (mount) / ENGINE-GATED (chart content needs live packets) | §A index 3 |
| 5 | Analysis: range re-analysis, adaptive re-eval `[experimental]`, bundle save/restore | ENGINE-GATED | Requires a live KataGo connection / backend bundle round-trip; UI mounts (verified via tab sweep) but the interaction itself needs a reachable engine, forbidden under the isolation rule |
| 6 | Other tab mounts (knob registry, qEUBO bookmarks, gradient calibration) | REACHABLE-VERIFIED | §A index 4 |
| 7 | Cards-tab inner tree resizer | RATIFIED-EXCLUDED | Roadmap §4 item 2 / §7 ruling 3: "panel-internal, untouched, control panel a black box." Confirmed zero diff on `ForestDirectory.vue` across the entire W1–W4 arc (`git diff --stat d6fafef9~1..ace98648 -- src/components/tree/ForestDirectory.vue` empty) |
| 8 | App-root modals: MintCardModal | REACHABLE-VERIFIED | §B: opens via toolbar "highlight-btn" trigger, closes via backdrop click |
| 9 | App-root modals: PlayEngineModal | REACHABLE-VERIFIED | §B: opens via toolbar "Play" trigger |
| 10 | App-root modals: LearnPathModal | REACHABLE-VERIFIED (open) / **DEFECT witnessed** (close) | §B: opens via its trigger; but see Defect D1 below — Escape does not close it, unlike its five siblings |
| 11 | App-root modals: LoginModal | REACHABLE-VERIFIED | §B: UserBadge present and clickable; backdrop-close confirmed universal across all five backdrop-bearing modals |
| 12 | App-root modals: EngineMatchModal, first-run SetupWizardModal | REACHABLE-VERIFIED (wizard: dismissed via Escape at every probe run, confirms it opens on a fresh profile) / ENGINE-GATED (EngineMatchModal has no dedicated toolbar trigger independent of a running match in the current census — confirmed via `Toolbar.vue` grep; its own reachability is unchanged by this rework, out of scope to newly wire one) | §B; `Toolbar.vue` grep |
| 13 | Library: import (drag-drop / pick files / pick directory) | BACKEND-GATED | Upload pipeline requires the backend; UI entry points unchanged by the rework (LibraryTab.vue untouched structurally beyond the `twoColumnReflow` prop) |
| 14 | Library: virtual-scroll table, filters, preview pane | REACHABLE-VERIFIED (mount, structure) / BACKEND-GATED (populated data) | §A index 0 |
| 15 | Library: `twoColumnReflow` breakpoint vs new control-panel sizing | REACHABLE-VERIFIED | §K: `.panel-content-two-col` toggles class at a vast viewport against the CURRENT LYT control-panel sizing, re-verified live (not merely a jsdom class-application pin) |

### (b) Chrome features (each individually exercised)

| # | Feature | Verdict | Evidence |
|---|---|---|---|
| 1 | Stone placement / rule enforcement | REACHABLE-VERIFIED | §C: click grows the game tree (`nodes` count increases) |
| 2 | Ghost-stone hover preview | REACHABLE-VERIFIED | §C: `.ghost-stone` element present while hovering |
| 3 | Move-number toggle (`n`) | REACHABLE-VERIFIED | §G: keybinding flips `showStoneMoveNumbers` |
| 4 | Last-move indicator, coordinate labels | REACHABLE-VERIFIED (unchanged BoardDisplay.vue, zero diff across W1–W4) | `git diff --stat` confirms `BoardDisplay.vue` untouched by the chrome rework |
| 5 | Board rail / multi-board tabs / hover shelf — style A (slot) | REACHABLE-VERIFIED | §F: `boardRail` presence ON mounts `#sidebar-widget` |
| 6 | Board rail — style B (popover) | REACHABLE-VERIFIED | §F: rail-style select flips to `'popover'`, a rail-popover trigger button mounts in corner chrome |
| 7 | SGF import/export toolbar entries, real round-trip | REACHABLE-VERIFIED | §D: a real 4-move 9x9 SGF loaded via the native file-chooser path (`page.waitForEvent('filechooser')`); root node's `PB` property confirmed round-tripped; save triggers a real download whose content contains the same player name |
| 8 | Engine controls (connect/disconnect/status/URI/model select), STOP MATCH | ENGINE-GATED | Toolbar renders (`ToolbarEngineUri` unconditional per its own header; `ToolbarEngineMetrics` is `v-if="isConnected"`, correctly absent against a dead engine port — confirmed no forbidden-port contact in the probe's own instrumentation) |
| 9 | Board overlays: MoveSuggestions + move-filter | REACHABLE-VERIFIED (toggle) / ENGINE-GATED (content, needs live moveInfos) | §G: `m` keybinding flips `showMoveSuggestions` |
| 10 | Board overlays: BoardHeatmapOverlay, BoardVariationsOverlay | ENGINE-GATED | Both render from live KataGo packets; no regression surface in this rework (not chrome-skeleton-coupled) |
| 11 | StatusBar contents + narrow-mode segment collapse | REACHABLE-VERIFIED | §H: all four sampled segments present (`.move-badge`/`.player-names`/`.game-info`/`.caps`); `.status-bar--narrow` modifier confirmed to engage under a tight portrait viewport (500×900) |
| 12 | Toolbar-move-nav | REACHABLE-VERIFIED | §C: cluster present, back button clickable without error |
| 13 | Pass | REACHABLE-VERIFIED (present, enabled per `canPass`) — no dedicated UI surface to ISSUE a pass beyond the button existing; FEATURES.md's own board section already discloses "no UI surface for issuing one ships today `[planned]`" pre-dating this rework | §C: `.pass-btn` present |
| 14 | Annotate (setup mode: BLACK/WHITE stone, triangle mark) | REACHABLE-VERIFIED | §I: Setup palette trigger opens the tool grid |
| 15 | LocalePicker | REACHABLE-VERIFIED | §E: trigger present, menu opens with options |
| 16 | UserBadge | REACHABLE-VERIFIED | §B: present, clickable |
| 17 | ToolbarSliderPopover (SLIDERS), PboPopover — edge-clamped popovers | REACHABLE-VERIFIED (SLIDERS + presence-menu popover, both freshly re-measured) / REACHABLE-VERIFIED-BY-CITATION (PboPopover, EngineQueueTooltip, BoardRailPopoverTrigger's own popover — unchanged code since their own waves' probes, not independently re-measured pixel-by-pixel this pass, disclosed) | §J (presence popover clamp at 700px width); W4 probe re-run this session (`ALL CHECKS PASSED`, see §3) for SLIDERS/DEBUG/presence z-index |
| 18 | Setup Tool Palette docking (no-occlusion) | REACHABLE-VERIFIED | §I: measured rects, palette never intersects the board |
| 19 | SystemLogPanel (auto-reveal) | REACHABLE-VERIFIED (auto-reveal path; overlay never occludes the board) / **DEFECT witnessed** (no manual open/close) | §L; see Defect D2 below |

### (c) The nine geometry-coupled behaviors

| # | Behavior | Home (roadmap §4) | Verdict | Evidence |
|---|---|---|---|---|
| 1 | OUTER/INNER resizers, drag + persistence | L4 verbatim | REACHABLE-VERIFIED (drag mechanics, live write) / BACKEND-GATED (cross-reload persistence) | Re-ran `lyt-w3-resizers-probe.mjs` (patched to dismiss the fresh-profile setup wizard, undisclosed in the original script but required once a truly fresh browser profile is used) against this session's dev server: OUTER bar tracked the cursor 1:1 and wrote `treeControlRegionWidthPx` live. A standalone re-check of the INNER bar in isolation (not chained after an OUTER drag that had already consumed the region's headroom) showed sub-2px tracking for two of three sampled steps and a legitimate L4 clamp at the third (14.5px "lag" = hitting the region's own reduced max, not a tracking bug). Cross-reload persistence could NOT be independently re-verified this session: `SyncService` requires a reachable backend to round-trip state, and the standing dead-port isolation rule forbids a live-enough backend — a reload under isolation returns to the FIRST-RUN state (wizard reappears, defaults restored), which is the isolation rule working as intended, not a resizer defect. The W3 build report's own probe run (cited, already witnessed under conditions where a backend was reachable for that one check) is the standing evidence for the persistence half |
| 2 | Cards-tab inner tree resizer | RULED panel-internal | RATIFIED-EXCLUDED | Same evidence as (a)#7 |
| 3 | Sidebar collapse rail → boardRail presence slot / popover | (b)#4 | REACHABLE-VERIFIED | Same evidence as (b)#5/#6 |
| 4 | `workspaceAxisColumn` narrow-mode → portrait screen class | L3/W3 | REACHABLE-VERIFIED | Re-ran a standalone screen-class-swap check: landscape (1920×1080) → OUTER bar present; portrait (700×1400) → OUTER bar absent (disclosed W3 narrowing), INNER bar present; back to landscape → OUTER bar reappears. No crash, no flap |
| 5 | StatusBar segment-priority collapse vs new width source | content behavior, re-verify | REACHABLE-VERIFIED | Same evidence as (b)#11 |
| 6 | Setup palette no-occlusion ruling | named toolbar slot | REACHABLE-VERIFIED | Same evidence as (b)#18 |
| 7 | LibraryTab `twoColumnReflow` breakpoint | re-verify vs new control-panel sizing | REACHABLE-VERIFIED | Same evidence as (a)#15 |
| 8 | Pointer-target 24px floor | existing test suite polices new chrome | REACHABLE-VERIFIED | `npx vitest run` exit 0 includes `pointer-target-minimum-size.test.ts`, which the W4 fix pass already extended to cover `.sliders-trigger`/`.debug-pill`/`.debug-item`; unchanged and still green this pass |
| 9 | Popover edge clamps vs new toolbar geometry | visual re-check per popover | REACHABLE-VERIFIED (presence menu, freshly measured) / REACHABLE-VERIFIED-BY-CITATION (the other four consumers, see (b)#17) | §J; W4 probe re-run (§3) |
| — | System log: overlay stratum (§7 ruling), non-occlusion | L1 | REACHABLE-VERIFIED (non-occlusion) / DEFECT (manual toggle) | §L; Defect D2 |

### Known residuals — verified as the only ones

| Residual | Disposition | Evidence |
|---|---|---|
| Dead `#leaf-boardRail` `SidebarWidget` mount (W4 fixer's own out-of-scope note: it still wired `@load-sgf`/`@save-sgf` onto a component that no longer emits either) | **FIXED, this pass.** Removed the two dead listeners from `App.vue`'s `#leaf-boardRail` template (the mount itself is NOT dead — it's the real style-A board rail — only the two event bindings were). Verified via repo-wide grep that nothing still emits `load-sgf`/`save-sgf` before removing. Added a regression pin (`lyt-w4-chrome.test.ts`, new `describe` block) so a future re-introduction fails red | `frontend/src/App.vue` (the `#leaf-boardRail` template block); `frontend/tests/unit/lyt-w4-chrome.test.ts` |
| Palette-vs-small-landscape tension (ace98648's own commit-message disclosure) | **Confirmed as the W4 fix pass left it — commissioner-pending, not re-litigated this pass.** At the corrected 345px side-column floor, 1280×1024 and 900×600 flip solver-INFEASIBLE under the default presence valuation (1024×700 survives); `research/lyt/tests/test_lyt.py`'s `known_infeasible_by_valuation` pins both with a disclosed docstring. The live app remains USABLE at those sizes via CSS elasticity (re-confirmed this pass, `lyt-w3-resizers-probe.mjs`'s own infeasible-sizes section, cited — not independently re-run since the underlying encoding is unchanged since W4) | `.claude/dispatch-reports/lyt-w4-fix-build.md` §1 direction (b); `research/lyt/tests/test_lyt.py` |
| Portrait `I_engine` empty track + OUTER-bar-landscape-only | **Ratified-plausible, unchanged.** Both are disclosed, reasoned narrowings in `lyt-widget-registry.ts`'s own header comments (portrait's tree structurally separates `I_engine` from `A_top`; portrait has no "side column beside the board" concept for the OUTER bar's width fact to mean anything). Re-confirmed live this pass: portrait renders with no crash, `I_engine`'s reserved track is empty (not erroring), `#resizer-outer` is absent in portrait and reappears in landscape | `frontend/src/state/lyt-widget-registry.ts` lines ~163–192; `frontend/src/App.vue` lines ~450–464; live screen-class-swap re-check this session |

### Defects found (findings, not audit failures)

- **D1 — `LearnPathModal.vue` doesn't close on Escape and lacks `role="dialog"`.** Its five sibling modals (`MintCardModal`, `PlayEngineModal`, `EngineMatchModal`, `LoginModal`, plus the ADR-0019-audited set `useModalKeyboard.ts`'s own header names as "all seven") wire `useModalKeyboard` for Escape-close + focus trap + `role="dialog"`; `LearnPathModal.vue` wires neither. Witnessed live: Escape leaves its backdrop open (confirmed via an explicit post-Escape existence check in the probe). **Pre-existing, NOT a LYT-rework regression** — `LearnPathModal.vue` predates this rework and the App-root-modals census explicitly marks modals "outside chrome tree — unaffected." Flagged here because the audit surfaced it; recommend a small standalone fix (wire `useModalKeyboard` the same way its siblings do) as separate, out-of-band work.
- **D2 — No manual open/close affordance for the system log.** `session.ui.systemLogExpanded` defaults to `false` (`store/defaults.ts`) and nothing in the current tree writes `true` to it — no toolbar button, no keybinding, no presence-menu entry (`LYT_PRESENCE_TARGETS` is exactly `['boardRail', 'previewBoard', 'controlPanel']`, confirmed via `useLytPresenceMenu.ts`). The ONLY way the panel becomes visible today is the transient auto-reveal on error/warning arrival (`useTransientLogReveal.ts`), which is a *separate* ref from `systemLogExpanded` and times out after 8s. Pre-rework, a collapse/expand toggle existed in-flow; the W4 overlay-stratum move (§7 ruling) preserved the field's read semantics ("no 76→77 migration needed... only WHERE it renders changed" — its own build report's own words) but the affordance that WROTE `true` to it was lost somewhere in the W1 skeleton replacement and never rebuilt. **FEATURES.md's "System log" bullet is rewritten to describe this honestly** (see §2 below) rather than silently restoring the stale "always-visible, collapsible" claim. Recommend a small standalone fix (a toolbar or presence-menu toggle) as separate, out-of-band work — outside this audit's charter to implement.

## 2. FEATURES.md diff summary

- **"Workspace and chrome" section rewritten** to describe the LYT
  reality: the layout-as-data / screen-class-swap substrate, the two
  independent resizers (OUTER landscape-only, INNER both classes) with
  the Cards-tab inner resizer explicitly called out as unrelated, the
  corner presence menu (cross-referencing the board-rail and
  position-preview-panel entries that already existed from W2), the
  fixed five-tab list (was stale at four — missing Library), the
  overlay-stratum banners/alerts, the Setup Tool Palette's no-occlusion
  docking, and a dev-build-only Debug Menu entry.
- **"System log" bullet rewritten** to describe the current, honest
  state (overlay-rendered, auto-reveal only, no manual toggle —
  Defect D2) rather than the stale "always-visible bar, collapsible"
  claim inherited from before the W4 overlay-stratum move.
- **"Position preview panel" entry** — audited, found ALREADY
  accurate (landed at W2, `0db8ef26`): correctly describes the
  disclosed placeholder scope (mirrors the active board, not yet
  variation-hover). No change needed.
- **Ghost-stone entry** — audited, found accurate; unchanged.
- Everything else in the tour (board / analysis / cards / library /
  power-user / qEUBO / auth sections) is untouched by this rework —
  confirmed via the parity inventory's own "unaffected" callouts for
  App-root modals and the file-level diffs cited in the table above —
  and needed no edits.

## 3. `frontend/FILES.md` sweep

Every file the W1–W4 arc added (`git diff --name-status
--diff-filter=A d6fafef9~1..ace98648`) — `PreviewBoardPanel.vue`,
`BoardRailPopoverTrigger.vue`, `DebugMenu.vue`, `LytNode.vue`,
`LytPresenceMenu.vue`, `useLytPresenceMenu.ts`, `useLytTrackCss.ts`,
`lyt-layout-portrait.gen.ts`, `lyt-layout-types.ts`,
`lyt-layout.gen.ts`, `lyt-solved-layout-landscape.gen.ts`,
`lyt-widget-registry.ts` — already has a `FILES.md` entry (confirmed
by grep, all counts ≥ 1). No file was deleted across the arc (`git
diff --name-status --diff-filter=D` empty), so no entries need
removing. A handful of PRE-EXISTING gaps unrelated to LYT
(`ToolbarMoveNav.vue`, `useElementWidth.ts`, and ~9 others, all from
older Resolution-Roadmap phases per their own `git log --follow`
history) were found missing during the sweep but are out of this
wave's scope — named here for visibility, not fixed, per the
minimal-touch discipline.

## 4. Umbrella doc-audit checklist walk

- **Work-status store** — not touched this pass (no status transition
  commissioned; W5 itself is tracked in the `todo` DB by the
  commissioner's own process, not something this build report closes).
- **`docs/handoff-current.md`** — read end to end (see §"Documents
  read"). Conclusion: **no edit needed.** It describes the frontend's
  Components/Composables/Services/State layering (unaffected — LYT's
  new files slot into Components/State exactly as that layering
  predicts) and never describes App.vue's chrome skeleton at the level
  of detail the rework touched (no "resizable layout"/tab-count
  claims live there — those are FEATURES.md's job, per the umbrella
  CLAUDE.md's own "What NOT to put in FEATURES.md" boundary, mirrored
  the other way). Orientation accuracy holds.
- **`FEATURES.md`** — updated, this report §2.
- **`frontend/FILES.md`** — swept, this report §3.
- **ADR "Revisit when" triggers** — none of the ten ADRs name a
  trigger this change satisfies (checked against
  `docs/adr-synopsis.md`'s condensed form during the prior waves;
  this pass touches no ADR-adjacent architectural axis beyond what
  W1–W4 already settled).
- **Doc-graph** — this pass is **content-only** (FEATURES.md prose
  edits, no doc added/removed/renamed/re-cross-referenced) — per the
  umbrella CLAUDE.md's own rule, regeneration is not required. Not
  run.
- **ADR-0006 headers** — all files touched this pass
  (`App.vue`, `lyt-w4-chrome.test.ts`) already carry their standard
  headers (pre-existing; my edits are surgical, not full-file
  rewrites) — confirmed by inspection, no retrofit needed.

## Probe isolation (executed personally, this pass)

Dev server: `VITE_API_BASE_URL=http://127.0.0.1:19301
VITE_KATAGO_WS_URL=ws://127.0.0.1:19302 npx vite --port 19300
--strictPort` — three fresh dead scratch ports (confirmed nothing
listening beforehand via `ss -ltn`; 19100, the world's own standing
port, deliberately avoided). `lyt-w5-parity-probe.mjs`'s own final
assertion:

```
PASS  PROBE ISOLATION: no request ever targeted 127.0.0.1:8764/:1235/:1242/:4173/:5173/:5174 (live backend/engine/dev ports)

ALL CHECKS PASSED
```

Full run transcript (44 checks, all PASS):

```
PASS  control panel renders exactly 5 tabs
PASS  tab index 0 (library) mounts and #control-panel stays non-empty
PASS  tab index 1 (cards) mounts and #control-panel stays non-empty
PASS  tab index 2 (settings) mounts and #control-panel stays non-empty
PASS  tab index 3 (analysis) mounts and #control-panel stays non-empty
PASS  tab index 4 (other) mounts and #control-panel stays non-empty
PASS  Mint Card modal opens via its toolbar trigger
PASS  PlayEngineModal opens via its toolbar "Play" trigger
PASS  LearnPath modal opens via its toolbar trigger
PASS  DEFECT-WITNESS: LearnPathModal does NOT close on Escape (pre-existing, out of LYT scope)
PASS  UserBadge is present
PASS  LoginModal opens via UserBadge click (or badge is already authenticated — see detail)
PASS  board SVG mounted
PASS  ghost-stone hover preview element exists while hovering the board
PASS  clicking the board grows the game tree (stone placement)
PASS  move-nav cluster (|< < > >|) present
PASS  move-nav "back" button is clickable without error
PASS  Pass button present in status bar
PASS  SGF load: active board root node properties reflect the loaded file (PB round-trips)
PASS  SGF save: download fires and contains the round-tripped player name
PASS  LocalePicker trigger present
PASS  LocalePicker menu opens with options
PASS  presence menu trigger present
PASS  presence popover opens
PASS  rail style A (slot): boardRail presence ON mounts #sidebar-widget
PASS  rail-style select present
PASS  rail style B (popover): a rail-popover trigger button mounts in corner chrome
PASS  "m" keybinding toggles showMoveSuggestions
PASS  "n" keybinding toggles showStoneMoveNumbers
PASS  status bar present
PASS  status bar segment .move-badge present
PASS  status bar segment .player-names present
PASS  status bar segment .game-info present
PASS  status bar segment .caps present
PASS  status bar gains --narrow modifier under a tight portrait viewport
PASS  Setup palette trigger present
PASS  Setup palette never occludes the board (measured rects)
PASS  presence popover stays within a 700px-wide viewport (edge clamp)
PASS  LibraryTab (or its ancestor) gains .panel-content-two-col at a vast viewport
PASS  system log overlay never occludes the board
PASS  PROBE ISOLATION: no request ever targeted 127.0.0.1:8764/:1235/:1242/:4173/:5173/:5174 (live backend/engine/dev ports)

ALL CHECKS PASSED
```

The dev server + browser were launched and torn down entirely within
this session (`ss -ltn` confirmed nothing on 19300 before start and
after teardown). `lyt-w3-resizers-probe.mjs` and
`lyt-w4-chrome-probe.mjs` (existing, committed) were also re-run
against the same isolated server for the condensed re-checks cited in
the geometry table — both green (`ALL CHECKS PASSED`, the W3 run
patched only to add the fresh-profile wizard dismissal the original
script's own dev-server session apparently didn't need, since it
likely ran against an already-onboarded profile).

## Gates (foreground, explicit timeout, literal exit codes)

| Gate | Command | Result |
|---|---|---|
| Vitest | `npx vitest run` | **exit 0** — 3029 passed, 8 skipped, 240 files (4 new assertions over the W4 fix pass's 3025/240 baseline: the new `#leaf-boardRail` dead-listener regression pin) |
| Typecheck | `npx vue-tsc -b` | **exit 0** |
| Build | `npm run build` | **exit 0** |
| research/lyt pytest | `pytest tests/ -q` (via `~/w/vdc/venvs/generic/bin/python`) | **exit 0** — 120 passed |

## Scope check

`git diff --stat` against `ace98648` touches: `frontend/src/App.vue`
(removed the two dead `@load-sgf`/`@save-sgf` listeners on the
`#leaf-boardRail` mount + updated its comment), `frontend/tests/unit/
lyt-w4-chrome.test.ts` (new regression-pin `describe` block),
`FEATURES.md` (the doc rewrite, §2), plus this build report and the
committed probe script (`lyt-w5-parity-probe.mjs`). Nothing else.

License: Public Domain (The Unlicense)
