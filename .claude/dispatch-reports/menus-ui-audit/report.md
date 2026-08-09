# Menus / editors / settings UI audit (Opus, 2026-08-09)

Commission (maintainer, verbatim): "Please have another Opus run through all of the menus." Scope: every menu/editor/settings surface, mechanically enumerated (44 surfaces), ADR-0018-clean brief (no pre-identified suspects), ADR-0019 genre law. Auditor: Opus subagent; live app driven at 1920x1080 as local_user against the live backend (read-only — every cross-origin write was rejected by the backend, mechanically guaranteeing no mutation). All measured figures are DOM measurements from the running app, not source inference. Screenshots (43 PNG) committed alongside this report.

Provenance note: the auditor's harness refused the report-file write; this file was landed verbatim from the auditor's returned prose by the orchestrating session (ledger row pending). The findings text below is the auditor's own, unedited in content.

## Coverage

- Surfaces enumerated: 44. Visited: 35. Unreachable: 9, with blockers:
  HandicapPanel (nested in setup palette; opening enters board-mutation mode), SystemLogPanel (systemLogExpanded=false; expanding is a persisted write), EngineQueueTooltip (hover-only; engine Offline so no queue rows), ConfirmLoadModal + ConfirmCloseBoardModal (need a dirty-board mutation), LoginModal (already authenticated), AppConfirmDialog/AppPromptDialog (generic hosts, every trigger is a mutation), ProxyUpstreamSettingField (desktop/Tauri-only), CardMetadataPanel (needs an active review session).
- Finding count: 27 (M1–M27), worst-first.

## Per-surface verdict table

| Surface | Verdict | Top finding |
|---|---|---|
| Settings › Advanced Registry | **unusable** | M1 |
| Settings › Session (UI) | **unusable** | M1 |
| Control panel › Other | **poor** | M7 |
| Settings › Keybindings | **poor** | M5 |
| Global toolbar | **poor** | M4 |
| Settings › Analysis Environment | **poor** | M24 |
| Control panel › Analysis | **poor** | M11 |
| Settings › Card Sets (Decks) | **poor** | M12 |
| Control panel › Cards › Decks | **poor** | M13 |
| MintCardModal | **poor** | M15 |
| EngineMatchModal | **poor** | M12 |
| KnobRegistryEditor | **poor** | M17 |
| PerQueryOverrides / VisitsLerpConfig | **poor** | M12 |
| SetupToolPalette | **poor** | M22 |
| ToolbarSliderPopover | **poor** | M8 |
| KeybindingRow capture mode | **poor** | M8 |
| Settings › Analysis Layout | ok | M16 |
| Setup wizard (steps 1–7) | ok | M18 |
| Control panel › Library | ok | M6 |
| Control panel › Cards › Browse | ok | M20 |
| PlayEngine / LearnPath modals | ok | M20 |
| HyperparamPromptModal | ok | M2 |
| LocalePicker | ok | — |
| ResetAllKeybindingsModal | ok | — (correctly built) |

## Findings, worst first

**M1 — Settings is a serialized config object.** (`14-settings-advanced-registry.png`, `11-settings-session-ui-.png`, `50-advanced-registry-expanded.png`) The settings surface is a serialized config object with input widgets stapled on — 181 editable controls labelled with raw storage keys (`wideRootNoise`, `bundleCompressionScheme`, `firstReportDuringSearchAfter`), group headings that are object keys upper-cased into unreadability (`ADAPTIVEREEVALUATE`), no search, no descriptions, no ranges, and live UI state (`activeTab`, `sidebarExpanded`, `onboarding.completed`) exposed as editable preferences. Group headings float centred mid-pane, disconnected from the left-aligned fields they govern, with their disclosure triangle ~500px away at the far left. The app already has human labels — Card Sets' hyperparameter grid carries both `Name` (`deck_size`) and `Label` ("Deck size") — so they exist in the model and simply aren't used. *Genre:* Sabaki's Preferences writes "Show coordinates"; KaTrain annotates each engine parameter with help text; VS Code and Firefox both put a **search box** atop a settings tree because a tree this deep is otherwise unnavigable. ADR-0019 Rule 1.

**M2 — One fact, many editable homes.** (`2x-other.png` vs `14-…png`, identical values in two surfaces) At least 11 facts have 2–4 editable addresses: `theme` (Registry · Session UI select · Wizard step 1); `ownershipOpacityCeiling` 0.55, `ownershipDeadbandThreshold` 0.09, `livenessThreshold` 0.05 (Registry · Knob Registry · Wizard step 4); `intensityHueShift` −36, `moveSuggestionsFadeMs` 60 (Registry · Knob Registry); the four watchdog/report engine knobs 500/500/0.15/0.05 (Registry · Knob Registry ENGINE group); `engine.katago.url` (Registry · toolbar · Wizard · ProxyUpstreamSettingField); `locale`; `analysisTabs`; `keybindings`. ADR-0019 **Rule 3** calls this a **type error refused loudly at UI start**; C1 says the same over the binding registry. Nothing is refused. `SettingsTab.vue:129` even annotates the theme select "A second VIEW of… one fact, one home" — the comment asserts the rule the code breaks. *Genre:* where a raw-key escape hatch exists at all (Firefox `about:config`, `chrome://flags`) it sits behind an interstitial *outside* the settings tree, precisely so it isn't read as a peer home.

**M3 — 55% of the registry is hidden; the only painted scrollbar is the wrong axis.** Measured `clientHeight 646 / scrollHeight 1444`, `max-height: 648px`, inside a pane 1029px tall — so `APPEARANCE`, `MINTING`, `NAVIGATION`, `KNOBS`, `KEYBINDINGS`, `ONBOARDING` are in the DOM but invisible on arrival, while **~380px of panel directly below the scroller sits empty**. The only scrollbar painted at rest is horizontal. *Genre:* VS Code / Firefox / Qt all let the settings list own the full pane height.

**M4 — No menu bar.** (`01-toolbar.png`) Every global command is one ungrouped all-caps strip: `MINT CARD(S) LEARN PATH PLAY MATCH CLEAR CACHE AUTO-NAV ▶ POPOVER ⟳ CONNECT`, plus `SETUP`, nav arrows, `ENGINE URI`, `SLIDERS12`, three emoji collapse toggles, `JANK TEST`. No separators, no icons, no overflow, no mnemonics; `CLEAR CACHE` sits at identical weight one pixel-row from `AUTO-NAV`. `POPOVER ⟳` names its own widget type; `SLIDERS12` glues a noun to a count. *Genre:* Sabaki, CGoban3, q5go, KaTrain all ship File/Edit/View/Engine/Tools; a toolbar is a shortcut layer *over* menus, not a replacement.

**M5 — The keybindings table has a column that isn't a column.** (`16-settings-keybindings.png`) Chords are centred *per row*, landing at x≈811, 588, 856, 822, 834, 731, 660 — a scatter across a table whose sole purpose is scanning. Rows 14px, no striping, no rules. `Edit`/`Reset` are ~22×11px **abutting with zero gap**, putting a mis-click one pixel from a binding-destroying action; `Reset` is pale enough to read as disabled. *Genre:* VS Code keyboard shortcuts, JetBrains keymap, KaTrain — left-aligned columns, spaced controls.

**M6 — The dead gutter.** `wideRootNoise` at x=63, its value `0.02` at x=937 — 700–900px of empty pink, no leader dots, no banding, across registry/knobs/keybindings. C12: the gap is a function of viewport, so a wider window makes the form *less* legible. *Genre:* bounded two-column forms (Qt, GNOME, macOS, KaTrain).

**M7 — "Other" is a junk drawer with undefined jargon.** (`2x-other*.png`) A top-level tab named "Other" holding six unrelated surfaces. **"PBO Bookmarks"** — acronym never expanded. **"Gradient Calibration"** = two colour ramps plus "Hue offset moved to Knob Registry above (Display group)", a migration changelog shipped as UI. Three consecutive sections say "Session-only — resets on reload" in prose only, visually identical to persistent settings. Fields labelled **"Multiplier (a):"** / **"Offset (b):"**. *Genre:* no exemplar ships a "Misc" tab; developer surfaces are gated and labelled.

**M8 — Modes indicated by hue, or by nothing.** (`35-`, `34-`, `62-…png`) (a) `POPOVER ⟳` turns green and produces **no visible popover anywhere** — feedback is a hue change on the trigger (C18). (b) `SETUP` puts the board into stone-placement mode, indicated only by the trigger's highlight. (c) Keybinding capture swallows **every keypress in the app**, signalled only by "Press a key…" in ~11px italic pale-pink inside one 14px row. C29 requires a persistent always-visible indicator. *Genre:* Sabaki/CGoban3 surface edit-mode as persistent toolbar state plus a changed board cursor; VS Code's capture opens a focused modal that visibly owns the keyboard.

**M9 — Undocumented glyph vocabulary.** `*↺`, `⚠`, `×`, `•` decorate field names with no legend anywhere. The `⚠` (on `analysisAutoSave`, `bundleCompressionScheme`, `highContrastText`, `reportAnalysisWinratesAs`) tells the user something is dangerous without saying what — C8 delivered as decoration. *Genre:* VS Code's modified-gutter + explicit "Reset Setting"; warnings carry inline text.

**M10 — Per-section Save buttons.** (`2x-analysis.png`, `12-…png`) Analysis has a section-scoped `SAVE` with its own "Not saved"; Analysis Environment opens with **"Force Persistence"**. C3 refuses per-section save stores by name. "Force Persistence" is worse than a plain Save — it tells the user ordinary persistence needs a manual override, a confession rendered as a control.

**M11 — Empty charts indistinguishable from broken ones.** (`2x-analysis.png`) Two full chart frames with axes, ticks and a legend naming "Complexity / Win Probability / Score Advantage" — and **no data**, no empty state. A legend for absent series affirmatively claims data should be there. Three renderings of one absence coexist ("no data" cell + two blank framed charts). C6. Compounding: **"Engine: Offline"** — the fact explaining the whole screen — is ~10px text in the corner with no colour, icon or as-of time (C7), while `Analyse Selection (20)` still presents as available. *Genre:* Lizzie/KaTrain make engine state prominent and don't frame series they lack.

**M12 — Raw JSON, a DSL and a JS expression as primary config inputs.** Card Sets' **"TREE DSL PIPELINE (JSON5 + HOLES)"** — a JSON5 document in a **dark code block embedded in a light app**, ~7 lines tall. Session UI's `moveFilterExpression` — a live JS predicate with no variable docs, no validation, no error surface. Per-Query Overrides — free-text JSON "shallow-merged into every outgoing query", whose own help warns "Keys you set here win over the app's own computed values", with no schema or guard. Match modal's Black/White Overrides — two more JSON textareas hinted only by *placeholder* (C20). *Genre:* KaTrain exposes engine overrides as named typed documented fields; no Go app in the set requires writing JSON/JS for normal configuration.

**M13 — Entity relationships as a comma-separated list of primary keys.** (`2x-cards.png`) **"CONTEXT IDS:"** = `1062, 1032, 1051, 1066, 1034, 1035, 1057, 103…` — raw DB ids, hand-editable, clipped by the input's own width. ADR-0019 **Rule 4**: "an association renders as a selection over the entities it joins, never as free text." Those ids join to Library games that already have names, dates and players.

**M14 — Silent save failures.** Every workspace write failed all session (`[Sync] Failed to save document: TypeError: Failed to fetch`) with **zero UI change** — no banner, status, toast or indicator. C23 + C8 + C5 in one path. The app already renders a workspace-level error with Retry for the *load* path; the write path is simply missing it. (The trigger here was the auditor's dev-port CORS, but the handling is the defect and behaves identically on a real outage.)

**M15 — In-band control sentinel.** (`30-modal-mint.png`) "Press Enter or Comma to add. Prefix with **$** for dynamic queries." Two control meanings carried inside the data stream — C11 by name. A tag containing a comma or starting with `$` is unrepresentable; user data was made impossible to save a control. The instruction sits *below* the input in 10px grey-pink; the field's only in-place name is the placeholder.

**M16 — Pointer targets below minimum, throughout.** Measured `.tab-header li` = **49.7 × 18px** (`padding: 1px 6px`) — the most-touched control in the app. Edit/Reset ≈22×11px, slider thumbs ≈18×8px, Analysis Layout ↑/↓/× ≈20×18px. All under WCAG 2.5.8's 24×24 (C21), several adjacent to destructive actions.

**M17 — Unbounded measure.** (`2x-other*.png`) Knob Registry sliders span the **entire panel width** — ~1050px of travel for a 0…1 value, so precision-per-pixel silently changes on resize — with no min/max labels ("Hue offset: −36" of what range?). Help paragraphs run full-width as unbroken ~10px monospace lines. C12.

**M18 — The wizard denies the random access it offers.** (`40-wizard-step0…6.png`) Best-built surface in the app, three defects: step indicator is **bare digits 1…7 with no names**, and those digits are *themselves clickable* — random access already permitted while Back/Next presents a forced linear order (C25 answered both ways). Summary says **"Here's what you configured"** and lists values after the auditor skipped every step. Summary labels derive from *step headings*: "**CHOOSE A THEME**: Light". Step 2's help points the end user at **`docs/docker.md`**, a repo path. *Genre:* macOS Setup Assistant / Windows OOBE / JetBrains label steps by name and distinguish skipped from set.

**M19 — Three tab idioms in one app.** Top-level and Settings strips = bordered boxes with separators + bottom accent; Analysis inner strip = borderless underline; Cards strip = a third variant whose underline runs past the tabs and stops arbitrarily. Two of the three render through the *same* `TabWidget`, so the divergence is deliberate somewhere. Nielsen #4, C22.

**M20 — Modals don't dim what's behind them.** (`30-`/`33-` vs `00-boot.png`: board, sidebar, tree and library table at identical brightness with and without the modal) No scrim. Against a near-white pink background the modal's own pink surface and thin shadow give almost no figure/ground separation, over a dense high-contrast table still competing for attention.

**M21 — Labels in notation the audience doesn't read.** The most-used dialog in a flashcard app labels its third field **"DISCOUNT Γ:"** — a bare Greek gamma, no expansion, tooltip, units or range. Card Visit-Count Override names fields after its formula's coefficients.

**M22 — The setup palette is in-flow and shoves the app down.** (`34-` vs `00-boot.png`) `ENGINE URI` moves y≈15→46, board top y≈280→311 — clicking `SETUP` pushes toolbar, tree, control panel and board **~31px down**; every target the user was about to click has moved. The palette offers only Black stone / White stone / Triangle / Handicap…, against the full marker set (stone, cross, triangle, square, circle, letter/number labels, lines/arrows) Sabaki, CGoban3 and q5go all provide.

**M23 — Debug instrumentation shipped in user chrome.** A **`JANK TEST`** button permanently in the primary sidebar. "Gradient Calibration" renders the colour transfer function isolated and composited against the board texture, labelled in signal-processing terms. **`PURGE`** sits beside the Analysis palette dropdown with no statement of what it purges and no evident confirm — adjacency makes it a live hazard, not just clutter.

**M24 — Analysis Environment opens onto a dead pane.** (`12-…png`) Master = 12 raw snake_case symbols in a ~200px column; detail = **"Select an item to edit"** floating in ~85% of the surface. Nothing says what a "symbol" is or what editing one changes; the `+` sits far right of the `SYMBOLS (∧)` heading it belongs to. *Genre:* macOS System Settings, Thunderbird accounts, Sabaki's engine manager all select the first row on arrival.

**M25 — Card Sets shows the id where the name belongs.** (`13-…png`) Detail heading reads **"default"** while the Name field and list row both read **"Standard"** — one entity, two names, one screen. A redundant **"SELECTED"** badge duplicates the row highlight and is ambiguous between "selected here" and "active deck". The `Type` dropdown is narrower than its own longest option and renders **"numbe"**; `Constraints` holds two unlabelled inputs (`1`, `500`) that are two distinct facts under one heading. `Delete` carries no destructive affordance.

**M26 — Pale pink on pale pink.** Background `rgb(255,245,255)`; all secondary text — the help lines that explain the unlabelled fields — is light pink-grey at ~10px. `Reset` reads as disabled. C19 wants 4.5:1, and this is exactly the text the user most needs *because* M1 left the labels uninformative. Disabled ↑/↓ arrows differ by tint alone (C18).

**M27 — Unlabelled / placeholder-labelled controls.** DOM probe: the Analysis palette `<select>` has no `id`, no `aria-label`, no associated `<label>` (matched only by class `dark-select`) — AT announces an unnamed combobox (C20, WCAG 3.3.2) for a control governing move-quality display app-wide. Match modal override fields are named only by disappearing placeholder JSON. Library filters do carry real labels (correct), but two of three share the identical placeholder `e.g. Cho`, defeating the example's purpose.

## What's done well (so the criticism calibrates)

**ResetAllKeybindingsModal is exemplary** and should be the template: names the action, states the consequence in plain language, states irreversibility ("This cannot be undone"), offers Cancel first — C10 done right. **The setup wizard** has real structure, explanatory prose, and a live demo board letting the user *see* a setting before committing — better than anything the exemplars offer for the same settings. **Library** is the most conventional surface and needs least work. **Analysis Layout** is a genuine editor over a real structure with a correct empty state. **Learn Path / Play / Match modals** all lead with a paragraph explaining the mechanic before any field — an instinct the settings panes abandon entirely. **TabWidget** carries `role="tab"`, `aria-selected`, `tabindex` and Enter/Space activation; the keyboard contract is real, only the target size (M16) is wrong.

## Evidentiary status

All 27 findings are WITNESSED with a named screenshot. The measured ones (M3's 646/1444 geometry, M16's 49.7×18px, M1's 181 controls, M2's value equalities, M22's 31px displacement) were taken by DOM measurement in the running app, not read off images. No finding is inferred from source alone; where source is cited (M3's `max-height` clamp, M2's `SettingsTab.vue` comment) it explains a witnessed behaviour rather than substituting for one. 9 of 44 surfaces UNEXERCISED with blockers named in the Coverage section. Read-only was honoured — and mechanically guaranteed, since the backend rejected every cross-origin write from the dev port.
