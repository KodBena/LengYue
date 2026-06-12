# Worklog — Settings General-tab accordion → sub-tabs (2026-06-12)

## Trigger

Work-status item `settings-accordion-to-tabs` (frontend / small / `ux`).
`SettingsTab.vue`'s General sub-tab held four native `<details>` accordion
sections — Analysis Environment, Card Sets, Advanced Registry, Session (UI).
The disclosure shape predated the per-section sub-tab strip the rest of the
Settings surface already uses; flattening each section into its own sub-tab
removes the open/collapse interaction and the General↔section nesting.

## What changed

`SettingsTab.vue` only (same SFC — no new files extracted). The TabWidget strip
grows from three tabs to six. New tab id / label list, in order:

| id                 | label key                            | content (verbatim from the old accordion) |
|--------------------|--------------------------------------|-------------------------------------------|
| `session`          | `settings.section.sessionUI`         | `RegistryEditor` over `store.session.ui`  |
| `analysisEnv`      | `settings.section.analysisEnv`       | Force Persistence button + `PaletteEditor` |
| `cardSets`         | `settings.section.cardSets`          | `CardSetEditor` (taller `registry-container` clamp) |
| `advancedRegistry` | `settings.section.advancedRegistry`  | `RegistryEditor` over `store.profile.settings` |
| `analysis`         | `settings.subtab.analysis`           | `AnalysisTabsEditor` (unchanged)          |
| `keybindings`      | `settings.subtab.keybindings`        | `KeybindingsView` (unchanged)             |

- The four `<details class="settings-section …">` wrappers and their
  `<summary><h3 class="sub-header">…</h3></summary>` headers are gone; each
  section's inner content moves verbatim into its tab slot, each section's
  wrapper styling preserved — the Card Sets `registry-container` height-clamp
  magic-literal comment travels with it, and Session (UI) / Advanced Registry
  keep their `registry-container` wrappers.
- The **Force Persistence** button moves from the Analysis Environment
  `<summary>` to the top of the new Analysis Environment tab. The `@click.stop`
  modifier is dropped (`.stop` only kept the click off the `<summary>` toggle,
  which no longer exists) — same `@click="$emit('force-save')"` wiring.
- The first tab is **only** Session (UI): the `RegistryEditor` over
  `store.session.ui` renders directly in the tab, no `<details>`/`<summary>`,
  no section header (the tab label is the header now).
- `activeSubTab` union renamed `'general'` → `'session'` and extended with the
  three new ids; default tab is `'session'`. Sub-tab state stays
  component-local (no schema migration — the file header records this).
- The capture-cancel watch (`next !== 'keybindings'` → `cancelCapture()`) is
  unchanged: it already keyed on `keybindings`, so leaving any non-keybindings
  tab releases the capture listener exactly as before.

## i18n key decisions

- **Tab labels reuse the existing `settings.section.*` keys** — `analysisEnv`,
  `cardSets`, `advancedRegistry`, `sessionUI` — which already exist in all four
  locales (they were the accordion summary labels). No new keys minted.
- **`settings.subtab.general` removed.** Grep confirmed `SettingsTab.vue` was
  its only consumer; the key lived only in `en.json` (the `settings.subtab.*`
  family was never copied into ja/ko/zh-CN — those locales fall back to en for
  it). Removed from `en.json`; nothing to remove elsewhere.
- `settings.subtab.analysis` / `settings.subtab.keybindings` retained — still
  used by the unchanged Analysis / Keybindings tabs.

No genuinely-new keys, so no `[unreviewed translation]` stubs were needed.

## Dead CSS — doubt, resolved by minimal-literal reading

The item directs removing `.settings-section` / `.section-divider` /
summary-related styles *if they become consumer-less **in this SFC** (verify by
grep within the file)*. `SettingsTab.vue` has **no `<style>` block** — those
classes are authored in `src/assets/css/shared-chrome.css`, not in the SFC. So
there is nothing to remove "within the file."

Recorded for the maintainer (left untouched per the literal scope + zero-scope-
creep directive): after this change, `.settings-section` and its
`.settings-section > summary*` rules in `shared-chrome.css` (the chevron, the
`[open]` rotation, the `> h3` / `> .toolbar-btn-sm` flex rules) are **repo-wide
consumer-less** — the Settings accordion was their sole consumer. A follow-up
could retire them. `.section-divider` is **still used** (App.vue's Other-tab
gradient-calibration and qEUBO-bookmarks headers), so it stays regardless.

## Consistency sweep

- `frontend/FILES.md`: SettingsTab row enumeration updated from "General /
  Analysis / Keybindings sub-tabs" to the new six-tab list. Band parenthetical
  (B1, named-and-owned exceptions) unchanged — the editors are still imported.
- `FEATURES.md`: no edit. Its Settings mentions describe the editors hosted and
  the unchanged "Settings → Analysis Layout" sub-tab; none described the
  General-tab accordion / disclosure shape, so nothing was content-inaccurate.
- `schema.ts` / `defaults.ts`: the "Session (UI) registry" comments are still
  accurate (Session (UI) remains a registry editor, now a top-level tab); no
  edit needed. The surviving doc/worklog "Settings → Analysis Layout" mentions
  refer to the unchanged Analysis sub-tab and were left in place.

## Verification

- `npx vue-tsc -b`: exit 0.
- `npx eslint .`: exit 0.
- `npm run test:run`: 1092 passed | 4 skipped (4 skips pre-existing; no
  SettingsTab structure test exists — the only SettingsTab-touching test,
  `profile-owner.test.ts`, exercises the unchanged `handleSettingsUpdate` seam).
- `node tools/band-conformance/check.mjs --self-test`: 2 passed.
- `node tools/band-conformance/check.mjs --check`: exit 0 — 30 advisory findings
  at the 30 baseline (2026-06-12), no structural drift, no new band leaks.
- Doc-graph regenerated (`node tools/doc-graph/generate.mjs`) — this worklog is
  a structural doc addition.

Functional parity by construction: same six editors, same wiring, same emit;
only the disclosure-vs-tab chrome and the Force Persistence button's placement
change. No behaviour claim beyond that.

License: Public Domain (The Unlicense).
