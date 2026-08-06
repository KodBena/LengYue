# Modal keyboard/focus build — ADR-0019 audit S5

Build agent for LengYue. Source spec: `.claude/dispatch-reports/adr19-audit.md`,
finding S5 ("Every modal is keyboard-inert and dismisses by discarding your
work" — class-wide, 7/7: no modal binds Escape at the modal level, no modal
calls `.focus()` on open, Tab traverses the obscured page behind the modal).
Law applied: C17 (keyboard/focus integrity) per the ADR-0019 appendix.

Read end-to-end before implementing: `frontend/CLAUDE.md`,
`frontend/tests/CLAUDE.md`, the full adr19-audit.md report, and all seven
modal components in `src/components/modals/`.

## Modal inventory

| File | Open/close shape | DOM shape |
|---|---|---|
| `ConfirmLoadModal.vue` | local `isOpen` ref, `defineExpose({ open() })` → `Promise<LoadResult>`, close via `handle(action)` | `.modal-backdrop` > `.modal-content` |
| `HyperparamPromptModal.vue` | same shape, close via `cancel()` | `.modal-backdrop` > `.modal-content` |
| `ResetAllKeybindingsModal.vue` | same shape, close via `handle(false)` | `.modal-backdrop` > `.modal-content` |
| `MintCardModal.vue` | same shape, close via `close()` | `.modal-backdrop` > `.modal-content` |
| `EngineMatchModal.vue` | same shape, close via `close()` | `.modal-backdrop` > `.modal-content` |
| `PlayEngineModal.vue` | same shape, close via `close()` | `.modal-backdrop` > `.modal-content` |
| `LoginModal.vue` | **different**: no local `isOpen` — parent (`UserBadge.vue`) mounts it only while open via `v-if="isModalOpen"`; close via emitted `'close'` event | `.modal-backdrop` > `.modal-card` (already had `role="dialog"`/`aria-modal`) |

## Mechanism choice

A composable, `src/composables/useModalKeyboard.ts` — not a `ModalShell`
wrapper component. Six of the seven modals share `defineExpose({ open() {
isOpen.value = true; return new Promise(...) } })`, a shape that doesn't
compose cleanly with a wrapping component (the promise-resolution / caller
API lives on the modal itself, and `LoginModal`'s "mounted only while open"
shape is structurally different again). A composable that takes a
content-container ref, an `isOpen` ref/computed, and the modal's own close
callback fits all seven with the least churn — three lines added per modal
(one ref, one `useModalKeyboard(...)` call, template `ref`/`role`/
`aria-modal`/`tabindex="-1"` attributes) versus a markup rewrite of all
seven backdrop/content trees.

`useModalKeyboard` provides:
- **Escape → close**, routed to the caller-supplied `onClose`, never a
  second close implementation.
- **Tab / Shift+Tab focus trap** — a full manual cycle (every Tab keydown
  is intercepted; focus moves to the next/previous entry in an enumerated
  focusable list), not edge-wrapping over native tab order. Chosen because
  native tab order would still reach the page behind the modal mid-
  sequence (the S5 defect itself), and because owning the whole Tab
  handler is what makes the trap honestly testable under jsdom (see Tests).
- **Initial focus** — first focusable element in the container, deferred
  via Vue's `nextTick` so the `v-if`-gated content has mounted.
- **Focus restoration** — `document.activeElement` captured at open time,
  refocused at close time.
- **`anyModalOpen`** (module-scoped counter, same shape as
  `src/lib/keybindings-capture.ts`'s `captureMode`) — exported for the
  global-hotkey seam (below).

## Keybindings-catalog interaction (surveyed, fixed at the shared seam)

`useUserIORegistry.ts`'s `handleKeyDown` already had a context guard that
early-returns for `<input>`/`<textarea>`/`<select>`/`contenteditable`
targets, but **not** for a modal's own `<button>` elements — so e.g.
pressing `n` while focus sat on a modal's Cancel button would fire the
global `nav.next` action underneath the open modal (leak, not previously
suppressed). Fixed by adding `if (anyModalOpen.value) return;` right after
the existing `captureMode` guard in `useUserIORegistry.ts` — same shared
seam, same style as the pre-existing capture-mode suppression. While any
modal wired through `useModalKeyboard` is open, no registry-bound global
hotkey dispatches.

## Per-modal wiring table

| File | `onClose` passed | Notes |
|---|---|---|
| ConfirmLoadModal.vue | `() => handle('cancel')` | — |
| HyperparamPromptModal.vue | `cancel` | — |
| ResetAllKeybindingsModal.vue | `() => handle(false)` | — |
| MintCardModal.vue | `close` | Also fixed: the tag-input's own `Escape` handler (`handleTagKeydown`, closes the suggestions dropdown) now calls `e.stopPropagation()` when it fires, so a first Escape closes suggestions only and a second Escape (dropdown already closed) reaches the modal-level handler — previously undefined behaviour since no modal-level Escape existed at all. |
| EngineMatchModal.vue | `close` | — |
| PlayEngineModal.vue | `close` | — |
| LoginModal.vue | `handleCancel` (emits `'close'`) | `isOpen` passed as `computed(() => true)` since the component is mounted only while open; removed the redundant `autofocus` HTML attribute on the username input now that the composable owns initial focus (avoids two competing focus mechanisms). |

All seven content-wrapper elements now carry `role="dialog"`,
`aria-modal="true"`, an `aria-labelledby` pointing at a (newly `id`-tagged)
heading, and `tabindex="-1"` (fallback focus target when a modal has no
focusable children). `LoginModal.vue` already had `role`/`aria-modal`/
`aria-labelledby`; only `tabindex="-1"` and the template ref were added.

## Tests

- `tests/unit/composables/useModalKeyboard.test.ts` — WITNESSED. Pure-DOM
  coverage of `getFocusableElements` (button/input/link enumeration order,
  `disabled` exclusion, `tabindex="-1"` exclusion, empty container, and a
  regression guard proving the enumeration does *not* depend on
  layout-derived visibility — jsdom performs no layout, so an
  `offsetParent` filter would silently empty the list under test).
- `tests/integration/useModalKeyboard.test.ts` — WITNESSED, mounted against
  the real `ResetAllKeybindingsModal.vue` with `attachTo: document.body`
  (required for jsdom to honor `document.activeElement` on mounted
  elements):
  - initial focus lands on the first focusable control on open;
  - Tab from the last focusable wraps to the first; Shift+Tab from the
    first wraps to the last;
  - Escape resolves `open()`'s promise with `false` — the same resolution
    the Cancel button produces, proving no second close path was added —
    and restores focus to the pre-open opener element;
  - `anyModalOpen` flips true on open, false on close (global-hotkey
    suppression flag).
  Because the Tab handler is fully self-driven (not relying on native
  browser tab order) and jsdom supports `element.focus()` /
  `document.activeElement` faithfully, the full trap loop is genuinely
  witnessed here, not marked UNEXERCISED — no playwright probe was needed.

## Gates

- `npm run build` (`vue-tsc -b && vite build`) — WITNESSED, exits 0.
- `npx eslint .` — WITNESSED, exits 0 (no output).
- `npm run test:run` — WITNESSED, exits 0: 1109 passed, 4 skipped (pre-
  existing skips, unrelated), 83 files passed / 3 skipped, including the
  8 new tests above.

## Files touched

- New: `src/composables/useModalKeyboard.ts`,
  `tests/unit/composables/useModalKeyboard.test.ts`,
  `tests/integration/useModalKeyboard.test.ts`.
- Modified: all 7 `src/components/modals/*.vue`, `src/composables/useUserIORegistry.ts`,
  `frontend/FILES.md` (new-file entry for `useModalKeyboard.ts`).

License: Public Domain (The Unlicense)
