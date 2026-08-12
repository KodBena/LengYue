Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).

# LYT finish-pass wave C — accent-text contrast violations (F9)

## 1. Base

Branch `lyt-wC-contrast`, cut from `8973e5d3` (the commit named in the
commission — verified via `git merge-base --is-ancestor 8973e5d3 HEAD`
after the worktree was created directly from that sha, so no rebase
was needed). Worktree:
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/wC-worktree`.
Main checkout was never touched. `frontend/node_modules` was
symlinked from the main checkout only for the gate runs, after
diffing `package-lock.json` byte-identical (`LOCK-IDENTICAL`); the
symlink was removed before staging/committing, so it carries no git
footprint.

## 2. Root cause

`frontend/src/assets/css/theme.css`'s `[data-theme="cluster"]` block
(the default/light theme) sets `--accent-primary: var(--cluster-12-2)`
— sky blue, `rgb(0,167,255)`. Measured against `--surface-0`
(`--cluster-12-9`, pale pink `rgb(254,218,247)`) via the WCAG 2.1
relative-luminance formula: **2.08:1** — the exact ratio F9 measured
on both named sites. The codebase's own opt-in `highContrastText`
remedy (`[data-theme="cluster"][data-contrast-text="on"]`, default
OFF) darkens `--accent-primary` to `#0069A1` (4.69:1) but only when
the user opts in — the default face of the app renders the failing
color. That override block was **not touched** by this pass, per the
commission.

The defect turned out to have two distinct shapes, both traced to the
same accent-primary/surface-0 (or accent-secondary/surface-1) color
pair, just with foreground/background swapped:

- **Class A — accent-colored text on a plain surface** (the `CLEAR
  ALL` control): `color: var(--accent-primary)` directly on the
  page/panel background. Fix: `--text-0` (the standing law — "ALL
  readable text is `--text-0` ALWAYS").
- **Class B — text-on-accent-fill using the wrong token** (the `MOVE
  95` chip): a badge/button with `background: var(--accent-primary)`
  (or `--accent-secondary`) paired with `color: var(--surface-0)` /
  `var(--surface-1)` instead of the codebase's own established
  `--text-on-accent` role token (theme.css, ledger rows 1018/1144 —
  the same token `LibraryTable.vue`'s `.library-row.selected` and
  `LibraryPreviewPane.vue`'s `.preview-btn.primary` already used
  correctly). Measured contrast for these mis-paired sites ranged
  1.84:1–2.08:1; `--text-on-accent` clears ~7.7:1 in cluster and is
  the theme-safe choice (dark theme's `--text-on-accent` is a
  different, independently-derived value for the same reason).

Class B was not discoverable by grepping for `color: var(--accent-*)`
— the accent token is the *background*, not the text, in that class —
so it was found by a second sweep: `grep` for
`background: var(--accent-primary|secondary)` and inspecting the
paired `color:`.

## 3. Enumeration

Every `color`-family (non-border) use of an accent token in
`frontend/src`, plus every accent-filled badge/button, was inspected.
Legend: **FIX** = readable text, changed; **ORNAMENT** = left as-is
(border/fill/decorative, not read as prose).

### Class A — fixed to `--text-0` (accent text on plain surface)

| File:line (post-fix) | Selector | Note |
|---|---|---|
| `chrome/SystemLogPanel.vue:98` | `.clear-btn` | **named site: CLEAR ALL** |
| `components/KeybindingRow.vue:324` | `.capture-prompt` | |
| `wizard/SetupWizardModal.vue:171` | `.btn-primary` | |
| `wizard/steps/WizardStepLocale.vue:99` | `.check` | |
| `modals/MintCardModal.vue` | `.tag-mode-toggle.active` | border stays accent |
| `modals/MintCardModal.vue` | `.tag-badge` | |
| `modals/MintCardModal.vue` | `.suggestions-list li:hover` | |
| `modals/AppConfirmDialog.vue:99` | `.btn-primary` | |
| `modals/AppPromptDialog.vue:132` | `.btn-primary` | |
| `qeubo/PboPopover.vue` | `.pbo-metric:hover .m-val` | |
| `qeubo/PboPopover.vue` | `.seg-btn.active` | |
| `qeubo/PboPopover.vue` | `.apply-btn` | border stays theme-exception `#2a5a7a` |
| `qeubo/PboPopover.vue` | `.debug-toggle.active` | |
| `qeubo/PboPopover.vue` | `.phase-help` | "?" glyph read as text; border stays |
| `library/LibraryTable.vue:613` | `.th:hover` | |
| `library/LibraryImportPanel.vue` | `.ok` | `--accent-positive` undefined → was falling back to accent-primary |
| `library/LibraryImportPanel.vue` | `.err` | `--accent-negative` undefined → was falling back to literal `#c75450` (~3.45:1, still fails) |
| `tree/ForestDirectory.vue` | `.action-btn-large` | |
| `tree/ForestDirectory.vue` | `.orient-btn` | |
| `tree/ForestDirectory.vue` | `.tree-meta` | |
| `editors/PaletteEditor.vue` | `.add-btn` | |
| `editors/PaletteEditor.vue` | `.item-list li.active` | border-left stays accent |
| `library/LibraryTab.vue` | `.library-player-row:hover` | border stays accent |
| `library/LibraryTab.vue` | `.library-player-row:hover .library-player-count` | |
| `editors/RegistryEditor.vue` | `.branch-label` | 5% tint bg + border-left stay accent |
| `editors/RegistryEditor.vue` | `.add-btn` | |
| `chrome/TabWidget.vue:336` | `.tab-header li.active` | border-bottom stays accent |
| `editors/CardSetEditor.vue` | `.add-btn` | |
| `editors/CardSetEditor.vue` | `.item-list li.active` | border-left stays accent |
| `editors/AnalysisControls.vue` | `h3` | |
| `editors/AnalysisControls.vue` | `.dark-select` | |
| `editors/AnalysisControls.vue` | `.adaptive-input` | |
| `editors/AnalysisControls.vue` | `.auto-badge` | border stays accent |
| `editors/AnalysisControls.vue` | `.value-badge` | |
| `chrome/SetupToolPalette.vue` | `.setup-trigger.tool-armed` (+`.open`) | border stays accent |
| `chrome/SetupToolPalette.vue` | `.tool-btn.active` | border stays accent |
| `chrome/SetupToolPalette.vue` | `.handicap-trigger.active` | border stays accent |
| `chrome/ToolbarEngineMetrics.vue:337` | `.m-val` | |
| `chrome/SystemLogToggle.vue:84` | `.system-log-toggle.active` | border stays accent |
| `chrome/HandicapPanel.vue:68` | `.handicap-btn:hover` | border stays accent |
| `chrome/EngineQueueTooltip.vue` | `.queue-metric.queue-active .m-val` | |
| `charts/CardTreeWidget.vue` | `.tree-header .counts` | |
| `charts/CardTreeWidget.vue` | `.collapse-all-btn` | |
| `board/BoardTab.vue:389` | `.tab-thumb-wrap.active .tab-label` | |
| `qeubo/QeuboBookmarks.vue` | `.new-btn` | |
| `qeubo/QeuboBookmarks.vue` | `.apply-btn` | border stays theme-exception |
| `editors/HyperparameterPanel.vue:265` | `.add-btn` | |
| `chrome/ToolbarSliderPopover.vue:223` | `.sliders-trigger:hover/:focus-visible .m-val` | |
| `chrome/ToolbarEngineControls.vue:90` | `.highlight-btn` | border stays theme-exception |
| `chrome/LocalePicker.vue` | `.locale-option.active`, `.active:hover`, `.check` | |
| `chrome/EngineModelSelect.vue:111` | `.m-val` | |
| `board/StatusBar.vue` | `.rules-select:focus/:hover` | border-bottom stays accent |
| `board/StatusBar.vue` | `.komi-input:focus/:hover` | border-bottom stays accent |
| `board/StatusBar.vue` | `.pass-btn:hover:not(:disabled)` | border stays accent |
| `board/StatusBar.vue` | `.game-end-badge` | |
| `board/StatusBar.vue` | `.move-numbers-btn.active` | comment updated (was misattributed to an "active state" carve-out that doesn't exist in the law) |
| `ReviewSessionPanel.vue:218` | inline `:style` (readonly branch) | the `state-attention` branch untouched — separate semantic-state token, out of the accent-token class |

### Class B — fixed to `--text-on-accent` (text directly on an accent fill)

| File:line (post-fix) | Selector | Note |
|---|---|---|
| `board/StatusBar.vue` | `.move-badge` | **named site: MOVE 95 chip** — was `--surface-0`, 2.08:1 |
| `tree/ForestDirectory.vue` | `.start-review-btn` | was `--surface-1` on `--accent-secondary`, ~2.03:1 |
| `modals/MintCardModal.vue` | `.btn-submit` | was `--surface-1`, ~1.84:1 |
| `modals/HyperparamPromptModal.vue` | `.btn-submit` | same |
| `modals/ConfirmLoadModal.vue` | `.btn-submit` | same |
| `modals/PlayEngineModal.vue` | `.btn-submit` | same |
| `modals/EngineMatchModal.vue` | `.btn-submit` | same |
| `modals/LearnPathModal.vue` | `.btn-submit` | same |
| `editors/CardSetEditor.vue` | `.active-badge` | was `--surface-0`, 2.08:1 |
| `editors/PaletteEditor.vue` | `.active-badge` | same |
| `chrome/DebugMenu.vue` | `.debug-item.running` | same |
| `CardMetadataPanel.vue` | `.tag-chip` | same |
| `library/LibraryPlayerFilter.vue` | `.filter-suggest-item:hover` | was `--surface-1`, ~1.84:1 |
| `chrome/RootErrorBoundary.vue` | `.reb-reload` | same |

### Left as ornament (ORNAMENT — not text, not touched)

- Every `border-color` / `border-*-color` / `outline` use of an
  accent token — e.g. `App.vue:1620,1683`; `MintCardModal.vue`,
  `WizardStepSgfImport.vue`, `WizardStepTheme.vue`,
  `WizardStepLocale.vue`, `WizardStepPalette.vue` card-selection
  borders; `ForestTreeNav.vue` `.game-row.selected` /
  `.root-row.selected`; `PboPopover.vue` popover border;
  `LibraryImportPanel.vue`, `LibraryPreviewPane.vue`,
  `ForestDirectory.vue` focus/hover borders; `RegistryEditor.vue`
  `.branch-label`'s border-left + 5% tint fill; `SetupToolPalette.vue`,
  `SystemLogToggle.vue`, `HandicapPanel.vue`, `TabWidget.vue`,
  `QeuboBookmarks.vue`, `ToolbarEngineControls.vue`,
  `AnalysisControls.vue` `.auto-badge` border; `StatusBar.vue`
  `:focus-visible` outlines and `.stone-chip.active`'s outline ring;
  `TreeWidget.vue`'s `.known-position-ring` / `.review-start-ring`
  SVG strokes; `LocalePicker.vue` trigger border;
  `LibraryPlayerFilter.vue:105` field-focus border. Accent color on
  borders/fills is explicitly sanctioned by the law.
- `accent-color` CSS property on native `<input type="checkbox">` /
  range sliders (`MintCardModal.vue` `.calibrate-checkbox`,
  `AnalysisControls.vue` `.checkbox-row input`, `.range-slider`) — a
  distinct CSS property that themes the native control widget, not
  text color.
- `scrollbar-color` (`theme.css:700`, `--accent-peach`) — not text.
- Chart/data-series paint routed through
  `--accent-primary-canonical` — `BaseChart.vue`, `StabilityPanel.vue`,
  `card-tree-echarts.ts`, `useEChartsForestRender.ts`,
  `ReviewSessionPanel.vue`'s `accentSecondary` chart-series color.
  `theme.css` documents this alias as deliberately locked to the raw
  palette entry and exempt from the high-contrast override — it's
  data-series identity paint, not chrome text.
- `PboPopover.vue`'s `.busy-dot` ("●", `aria-label`ed) — a decorative
  pulsing status indicator functioning as a colored fill/light, not
  read prose.
- `UserBadge.vue`'s `.dot-ok` — background-only status dot, no text.
- `KnobSlider.vue`'s slider-thumb `background` — decorative control
  chrome, no text.
- `LoginModal.vue`'s `.btn-primary` and `shared-chrome.css`'s
  `.action-btn-large` — both already pair an accent fill with
  `color: var(--text-0)`, which in the cluster theme is byte-identical
  to `--text-on-accent`'s value (~7.7:1) — correct in the audited
  theme, left untouched.
- `LibraryTable.vue`'s `.library-row.selected` and
  `LibraryPreviewPane.vue`'s `.preview-btn.primary` — already used
  `--text-on-accent` correctly; this pass brings every other
  accent-fill site up to the same standard.

### Explicitly not touched (per commission)

`theme.css`'s `[data-theme="cluster"][data-contrast-text="on"]`
override block (the `highContrastText` remedy) — unchanged, byte for
byte.

## 4. Gates (from `frontend/`)

| Gate | Command | Exit |
|---|---|---|
| Lint | `npx eslint .` | **0** |
| Build | `nice -n 19 npm run build` | **0** (vue-tsc -b && vite build; 1249 modules, no errors) |
| Tests | `NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 nice -n 19 npm run test:run` | **0** — 257 files / 3201 passed, 8 skipped (baseline 3201 matched exactly) |

## 5. Discipline notes

- Behavior-neutral: every change is a color-token swap only; no markup,
  logic, or class-name changes.
- Per-claim witness: every "FIX" row above was verified by reading the
  component's `<style>` block (and, for the Class B badges, the
  `background`-paired rule) before editing; every contrast ratio cited
  was computed with the WCAG 2.1 relative-luminance formula against
  the actual cluster-theme RGB values pulled from `palettes.css`, not
  estimated.
- No live ports touched — this was a static grep/read/edit pass plus
  the three specified gate commands; no dev server, backend, or engine
  was started.
