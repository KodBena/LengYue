# Worklog — ForestDirectory Decks/Browse strip → shared TabWidget (2026-06-03)

## Trigger

Work-status item `forestdirectory-tabwidget-refactor` (frontend / small /
`refactor`). `ForestDirectory.vue` implemented its Decks/Browse sub-tab strip
with hand-rolled `<button>`s + a local `ref<'decks' | 'browse'>` and a custom
`.tab-switcher` style block, rather than the reusable
`components/chrome/TabWidget.vue` that every other tab strip in the app uses.

## What changed

`ForestDirectory.vue` only. The bespoke strip is replaced by `<TabWidget>`:

- The two `<button>`s + the `.panel-header.tab-switcher` wrapper become a
  `<TabWidget :tabs="tabs" v-model="activeTab">` with the two views moved into
  `#decks` / `#browse` named slots. The per-view `v-if="activeTab === …"` guards
  are dropped — TabWidget's own `v-show` + lazy-slot rule (default
  `keepMounted: false`) reproduces the prior lazy-render semantics exactly.
- `tabs` is a `computed` of `{ id, label }` pairs sourced from the existing
  `cards.tab.decks` / `cards.tab.browse` i18n keys, so a locale switch retitles
  the strip reactively (parity with the prior `$t(...)` button labels).
- The dead `.tab-switcher` CSS rules are removed. `.panel-header` stays — the
  right-hand `.tree-panel` header still uses it.

## The one tradeoff (recorded in the item)

`activeTab` widens from the literal union `'decks' | 'browse'` to `string`,
because `TabWidget`'s `update:modelValue` contract is `string`. This is the
"loses a little literal-union precision" the item explicitly sanctions in
exchange for one tab-strip implementation across the app. The two
`activeTab === 'decks'` comparisons that remain are string-vs-literal and
unaffected. A comment at the declaration names the tradeoff.

## Verification

`npm run build` (`vue-tsc -b && vite build`) green — no type errors. Functional
parity by construction: same two views, same lazy-render, same labels, same
active-tab semantics; only the strip's implementation and its (now-standardised)
chrome change. No FILES.md / FEATURES.md / handoff change — internal refactor,
no user-facing capability change, no file add/move/band-change.

License: Public Domain (The Unlicense).
