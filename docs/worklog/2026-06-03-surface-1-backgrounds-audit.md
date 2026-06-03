# Worklog — `--surface-1` backgrounds audit (2026-06-03)

## Trigger

Work-status item `surface-1-backgrounds-audit` (frontend / small). `var(--surface-1)`
as a *background* is almost never right under the default theme; `--surface-0` is
the correct default. The Phase-3 knob editor was fixed earlier; the remaining
call sites were uncatalogued.

## Why surface-1-as-background is wrong (theme analysis)

On the **cluster theme (the default)** the four-tier surface scheme collapses:
`--surface-0/2/3` all resolve to `--cluster-12-9` (pale-pink page bg), while
`--surface-1` is the lone `--cluster-12-6` (taupe) — and `--text-2` *also*
resolves to `--cluster-12-6`, so text-2 on a surface-1 background is literally
the same colour (invisible), and dark-purple body text on taupe is low-contrast.
Panel separation on cluster comes from **borders** (`--border-1/2` = taupe), not
from a background-tone step, so moving a container's fill to surface-0 doesn't
cost separation. On the **dark theme** surface-1 (`#111`) was a legit panel tone
under light text, but the project's standing rule is theme-agnostic
(surface-1-as-background is exception-only; default to surface-0), and borders
delineate there too. The precedent was already set twice — `AnalysisTabsEditor`
(`.tab-block` → surface-0 with rationale) and `BaseChart` (tooltip → surface-0).

## What changed — flip all 20 to `--surface-0`

Per the standing rule and the precedents, every unannotated `--surface-1`
*background* became `--surface-0`. No per-site annotation is added: surface-0 is
the default and needs no justification (only surface-1 would). The 20 sites:

- **CSS `background` (19, via a `background`-anchored swap across 15 files):**
  `App.vue` (.deck-dropdown), `LocalePicker`, `SystemLogPanel`, `CardMetadataPanel`,
  `HyperparamPromptModal`, `ConfirmLoadModal`, `ResetAllKeybindingsModal`,
  `ForestTreeNav` (.root-row), `CardSetEditor` (.sidebar, .dark-input),
  `HyperparameterPanel`, `PaletteEditor` (.sidebar, .dark-input, .state-fn-row),
  `LibraryPreviewPane` ×2, `QeuboBookmarks` (.bookmark-row), `AnalysisTimelinePanel`,
  `ColorDebugStrip`.
- **TS `themeColor` (1):** `DistributionChart` tooltip `backgroundColor` — matches
  the `BaseChart` canonical tooltip (surface-0 + text-1).

## Method / safety

The CSS swap used a `background[^;]*var(--surface-1)` pattern so it could only
touch a `background`/`background-color` declaration — never the 23 remaining
surface-1 usages that are **borders (11)** or **text colours (12)**, several of
which sit on the *same compact line* as a swapped background (verified by diff:
19 insertions / 19 deletions, every changed token a background; `border-2`,
`surface-3`, `text-0` siblings untouched). Post-swap grep confirms zero
`background…var(--surface-1)` remain and the 23 border/colour usages are intact.

## Verification

`npm run build` green; `npm run test:run` 790 passed / 3 skipped (no test asserts
on colour); `eslint .` clean. **Visual QA flagged**: this changes container fills
across modals, sidebars, inputs, rows, and a chart tooltip — worth an eyeball on
both the cluster (default) and dark themes; any site that was *deliberately*
taupe chrome can be reverted to surface-1 with a `theme-exception:` annotation.
Closes `surface-1-backgrounds-audit`.

License: Public Domain (The Unlicense).
