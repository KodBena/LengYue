# S14 native-dialog verification (work item s14-native-prompts)

Read-only mechanical verification of merge `197320ce` ("S14+S16: in-app dialog
primitives replace 17 native prompts"), ADR-0019 audit finding S14, against
`frontend/src`. No edits made.

## Verdict: FINDINGS (locale completeness gap; native-call-site sweep is clean)

- Native-call-site count: **0** (clean)
- In-app dialog primitives: found, correctly wired, no hardcoded English strings
- Locale gap: **2 dialog-consumed keys missing from ja.json, ko.json, zh-CN.json** (present in en.json)
- Consumers: **8** feature call sites use `useAppDialogs()`; **2** additional files (the dialog components themselves) render off the primitive's exported signal but do not call `useAppDialogs()`

---

## 1. Native dialog call-site sweep

Searched `frontend/src` (`*.ts`, `*.vue`, `*.js`) for `window.prompt|window.confirm|window.alert` and bare `prompt(|confirm(|alert(`.

Every hit inspected. All are one of:
- Docstring/comment prose referencing the native APIs by name (`useAppDialogs.ts`, `AppConfirmDialog.vue`, `AppPromptDialog.vue` headers) — describing what was replaced, not a live call.
- The in-app replacement's own exported function names (`confirm()`, `alert()`, `prompt()` defined and called as `useAppDialogs().confirm/alert/prompt` — i.e. the intended new primitive, not the native global).

**No live `window.prompt`/`window.confirm`/`window.alert` call site exists in `frontend/src`.** No test/spec files matched either (checked separately, 0 hits).

**Native-call-site count: 0.**

## 2. In-app dialog primitives

- **Composable**: `frontend/src/composables/useAppDialogs.ts` — exports `useAppDialogs()` returning `{ confirm, alert, prompt }`, plus the module-scoped signal `currentDialogRequest` and settle functions `settleConfirm`/`settlePrompt`. `alert()` is implemented as a `confirm()` request with `cancelLabel: null` (single-button render), matching the documented commission ("alert = confirm with single button").
- **Render components** (mounted once at `App.vue` level, per the composable's own docstring):
  - `frontend/src/components/modals/AppConfirmDialog.vue` (confirm/alert rendering)
  - `frontend/src/components/modals/AppPromptDialog.vue` (prompt rendering, with an accessible `<label for>` fix noted in its own review-finding comment, ADR-0019 C20)

### Consumers of `useAppDialogs()` (8 feature files — call sites the S14 sweep converted)

1. `frontend/src/components/ReviewSessionPanel.vue` — 1 `confirm` call (`review.session.retryConfirm`)
2. `frontend/src/components/CardMetadataPanel.vue` — 1 `confirm` call (`cardMetadata.resetPriorStandaloneConfirm`)
3. `frontend/src/components/modals/MintCardModal.vue` — 2 `alert` calls (`mint.alert.allKnown`/`allKnownRemediation`, `mint.alert.failed`/`failedRemediation`)
4. `frontend/src/components/editors/CardSetEditor.vue` — 1 `prompt` + 1 `alert` + 1 `confirm` call
5. `frontend/src/components/editors/AnalysisControls.vue` — 2 `confirm` calls
6. `frontend/src/components/qeubo/PboPopover.vue` — 1 `prompt` call
7. `frontend/src/components/qeubo/QeuboBookmarks.vue` — 2 `prompt` calls + 1 `confirm` call
8. `frontend/src/components/editors/PaletteEditor.vue` — 4 `prompt` calls + 1 `confirm` call

`AppConfirmDialog.vue` and `AppPromptDialog.vue` also matched the `useAppDialogs` grep but only because they import `currentDialogRequest`/`settleConfirm`/`settlePrompt` from the same module (the render side of the signal) — they do not call `useAppDialogs()` itself, so they are not counted as feature consumers above.

**Consumers count: 8** (feature call sites) **+ 2** (render components, signal-only) **= 10 files reference the module total.**

## 3. Locale completeness for dialog-consumed keys

Collected every i18n key the dialog primitives actually consume: the composable's own default-label keys (`dialogs.confirm.*`, `dialogs.alert.*`, `dialogs.prompt.*`) plus every `message`/`title` key passed into a `dialogs.confirm/alert/prompt(...)` call across the 8 consumers (26 keys total). Locale files (`frontend/src/locales/{en,ja,ko,zh-CN}.json`) are flat dictionaries keyed by the full dotted string (not nested objects) — checked accordingly.

- **en.json**: 0 missing (26/26 present) — baseline/source locale.
- **ja.json**: 2 missing
  - `review.session.retryConfirm`
  - `cardMetadata.resetPriorStandaloneConfirm`
- **ko.json**: 2 missing
  - `review.session.retryConfirm`
  - `cardMetadata.resetPriorStandaloneConfirm`
- **zh-CN.json**: 2 missing
  - `review.session.retryConfirm`
  - `cardMetadata.resetPriorStandaloneConfirm`

All other 24 dialog-consumed keys are present in all four locale files.

**Context on the gap's scope** (informational, not itself in the dialog-key list): `cardMetadata.resetPrior*` has zero keys of any kind in ja/ko/zh (`resetPriorInlinePrompt`, `resetPriorInlineHint`, `resetPriorStandalone`, `resetPriorStandaloneTooltip`, `resetPriorStandaloneConfirm` — all absent), and `review.session.*` is missing 6 keys in each non-English locale (`allSuspended`, `goBack`, `goForward`, `retry`, `retryConfirm`, `reviewed`), of which only `retryConfirm` falls inside the dialog-primitive key set audited here. Both look like pre-existing translation-catalog gaps (whole feature areas under-translated) rather than something the S14 dialog-conversion merge itself introduced — the merge correctly called `t()` on the same key en.json already defines; the catalog just never got the ja/ko/zh entries for these two features. Flagged as a FINDING regardless since the task's acceptance bar is "every key exists in all four locales," which is not met.

## 4. i18n routing spot-check (no hardcoded English)

Read both dialog components end to end:

- `AppConfirmDialog.vue`: template renders only `request.title`, `request.message`, `request.cancelLabel`, `request.confirmLabel` — all populated from the `ConfirmRequest`/`AlertDialogOptions` object, whose defaults in `useAppDialogs.ts` route through `t('dialogs.confirm.defaultConfirm')` etc. No literal English string in the template.
- `AppPromptDialog.vue`: same shape, plus `inputLabel` computed with fallback chain `request.message || request.title || t('dialogs.prompt.defaultLabel')` — the fallback is itself an i18n key, not a hardcoded string. No literal English string in the template.
- Every consumer's own `message`/`title` calls in section 2 above use `t('...')` — none pass a raw string literal as `message`/`title`.

**No hardcoded English strings found inside the dialog primitives or their call sites.**

---

## Summary for commissioner

| Check | Result |
|---|---|
| Native `window.prompt/confirm/alert` call sites | 0 (clean) |
| Bare `prompt(`/`confirm(`/`alert(` live calls | 0 (clean) |
| Dialog primitives located | Yes — `useAppDialogs.ts` + `AppConfirmDialog.vue` + `AppPromptDialog.vue` |
| Feature consumers | 8 files, 17 call sites total (matches merge's "17 native prompts" claim) |
| Locale keys missing — en.json | 0 |
| Locale keys missing — ja.json | 2: `review.session.retryConfirm`, `cardMetadata.resetPriorStandaloneConfirm` |
| Locale keys missing — ko.json | 2: same two keys |
| Locale keys missing — zh-CN.json | 2: same two keys |
| Hardcoded English inside primitives | None found |

Not clean — the merge's native-dialog conversion is mechanically sound and correctly i18n-routed, but the ja/ko/zh translation catalogs are missing 2 of the 26 keys the converted dialogs depend on, so a Japanese/Korean/Chinese user hitting the "retry this card" confirm or the "reset review history" confirm will see the raw key or fall through to `vue-i18n`'s missing-key behavior rather than translated text.
