# useUserIORegistry Context-Guard for Editable Surfaces (CodeMirror)

- **Status:** Shipped on branch `frontend/keybinding-context-guard`,
  merged via PR #19, 2026-04-28. `npm run build` green; manual smoke
  confirmed live by user (typing inside `PaletteEditor`'s and
  `CardSetEditor`'s CodeMirror surfaces no longer fires global
  handlers; outside any input, all global keys still fire as
  before).
- **Genre:** Worklog entry — closes the corresponding bullet in
  `docs/notes/frontend-backlog.md` describing keystrokes nominally
  destined for the editor leaking through to the global registry.
  Identified by the user as the second of the irreducible-minimum
  fixes before release.
- **Date:** 2026-04-28.
- **Origin:** `docs/notes/frontend-backlog.md` "Bugs or other rough
  edges" section, bullet reading: "useUserIORegistry interacts with
  keyboard handling elsewhere. For example, in the Monaco editor,
  bound keys in UserIO can not be used which is obviously a
  blocker." User confirmed during diagnosis that the symptom is
  scoped to the editor surface — other inputs (HTML form controls)
  were correctly suppressed by the existing guard.

## Context

`useUserIORegistry` attaches a `keydown` listener to `window`. Its
context guard bails if `e.target` is `instanceof HTMLInputElement`
or `instanceof HTMLTextAreaElement` — covering native form widgets.
The bullet's framing called the affected editor "Monaco," but the
codebase's actual dependency is `vue-codemirror` / CodeMirror 6
(`@codemirror/lang-python`, `@codemirror/theme-one-dark`); Monaco
is not in `package.json`. CodeMirror 6's editable surface is the
inner `.cm-content` element, which is a `<div contenteditable=`
`"true">`. The existing guard's `instanceof` checks miss it
(neither input nor textarea), so keys typed into the editor bubble
to `window`, the registry's switch fires (toggling overlays,
suspending engine mode, etc.), and the registry's
`e.preventDefault()` may further suppress the input event the
editor is waiting on.

## Approach

Single source change: extend the context guard with two additional
branches.

```ts
const target = e.target;
if (target instanceof HTMLInputElement) return;
if (target instanceof HTMLTextAreaElement) return;
if (target instanceof HTMLSelectElement) return;
if (target instanceof HTMLElement && target.isContentEditable) return;
```

`HTMLSelectElement` is added for free — native `<select>` controls
own their keystrokes the same way inputs and textareas do, and
omitting them was a latent gap.

`HTMLElement.isContentEditable` is the canonical property for the
contenteditable check: it reflects the *effective* editability
state, accounting for inheritance (so a nested `<span>` inside a
contenteditable `<div>` returns `true` without requiring an
ancestor walk). A single check on `e.target` covers any nested
element inside an editable region — CodeMirror today, Monaco if
ever added, generic contenteditable mounts.

## Critical files

- **Edited:** `frontend/src/composables/useUserIORegistry.ts` —
  four-branch guard expansion plus a comment explaining the
  CodeMirror DOM specifics.

## Reused existing surface

- The existing guard structure (early-return on context match) is
  preserved unchanged in shape; only the matched-element classes
  expand.
- No new imports, no new types, no new dependencies. The guard
  remains a single tight composable function attaching one listener
  on mount.

## Verification

1. **Static check.** `npm run build` green.

2. **Manual smoke — leak check.** In `PaletteEditor`'s symbol-edit
   CodeMirror surface, typing `c`, `d`, `l`, `m`, space, and arrow
   keys inserts characters / moves the cursor as expected without
   firing the global handlers (no ownership toggle, no move-
   suggestions toggle, no engine ponder, no board navigation).
   Same in `CardSetEditor`'s pipeline-JSON CodeMirror. ✓

3. **Manual smoke — outside-editor regression check.** Click on the
   board background, then press `c`, `d`, `l`, `m`, space, arrows.
   All global handlers fire normally — ownership sub-toggles,
   move-suggestions, engine ponder, navigation. ✓

4. **Existing-input regression check.** Login modal username/password
   fields and registry-editor numeric inputs continue to suppress
   the global handler when focused. The two new guard branches are
   purely additive; the existing branches are byte-for-byte
   unchanged. ✓

## Outcomes

- The CodeMirror typing-leak failure mode closes. Users can edit
  symbols and pipeline JSON without the global registry hijacking
  their keystrokes.
- Generalised guard handles any contenteditable surface — the fix
  is forward-compatible with Monaco-if-ever-added and any future
  rich-text mount without further changes.
- The frontend-backlog rough-edge retires.

## Out of scope (explicitly)

- **Restructuring `useUserIORegistry` into a per-action registry**
  (where other composables register their bindings with priority
  and context-awareness). The current switch-statement is small
  and readable; extending it to a real registry is YAGNI until a
  second composable wants to register bindings.
- **`window.addEventListener('keypress')` and `keyup`.** The
  registry only watches `keydown`; the same context-guard would
  apply but those events aren't currently consumed.
- **Shadow-DOM key-retargeting.** Out of scope; nothing in the
  codebase uses shadow DOM today.
- **iframe focus.** Cross-origin iframes don't propagate
  `keydown` to the parent window naturally; not a concern.

## Documentation follow-up

- This worklog entry.
- `docs/TODO.md` — Frontend Completed table gained the entry at PR
  merge time.
- `docs/notes/frontend-backlog.md` — the "useUserIORegistry
  interacts with keyboard handling elsewhere" bullet was struck
  through with closure annotation noting the actual editor was
  CodeMirror 6 and the fix mechanism (`isContentEditable`).
- No ADR amendment. The fix is a defect repair; the registry's
  shape and integration pattern are unchanged.

## Branch + PR workflow

Branched off `main` post-PR-#17 / #18 merges (`8885872` /
`542e9ec`). Single PR (#19) opened against main. Merged at
`a90b480`.
