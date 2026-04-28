# qEUBO Frontend — Parameter-Meta Editor

- **Status:** Shipped on branch
  `frontend/qeubo-parameter-meta-editor`, 2026-04-28.
  `npm run build` green; UI smoke recipe pending the user's HMR
  run.
- **Genre:** Worklog entry — fourth frontend slice. Lands the
  guided UI for editing `parameter_meta` (range + qeubo_controlled
  per parameter) so the qEUBO calibration loop is reachable
  without console-driven `parameter_meta` mutation.
- **Date:** 2026-04-28.
- **Origin:** Toolbar slice merged in PR #33; the qEUBO note's
  status table flagged "parameter-meta editor (in PaletteEditor)"
  as the next slice and the user delegated the choice between
  this and bookmarks UI.

## Context

PR #33 made the toolbar observable but left a console-driven
gap: the user had to manually mutate
`store.profile.settings.engine.katago.analysis_env.parameter_meta`
to mark a parameter as `qeubo_controlled`, since the only way
into the editor's domain was via dev console.

Per dispatch v1.2 §3.7, the PaletteEditor is the curated home
for parameter_meta editing — Analysis Environment view, not a
RegistryEditor extension. This PR lands that surface:

- Each parameter row gains a Range pair (min / max) and a
  qEUBO checkbox.
- Validation per ADR-0002: the checkbox is disabled until the
  range is valid (two finite numbers, min < max). If the user
  invalidates a range while the checkbox is on, the editor
  surfaces a validation error inline.
- Toggling qEUBO triggers `useQeubo().startNewExperiment(...)`
  with the new controlled set, or `abortExperiment()` if the
  set goes empty. Either path surfaces a system message
  describing the change.

## Approach

### `frontend/src/components/PaletteEditor.vue` (edited)

Three groups of changes inside the existing master-detail
shape:

**Imports + composable wiring.** Added `useQeubo`,
`pushSystemMessage`, and `ParameterMeta` to the import set;
instantiated the qeubo composable at module setup so its
methods are available to the new mutation handlers.

**Mutation handlers (script).** Three new functions plus two
computeds:

- `getParamMeta(name)` — pure read with `?? {}` fallback.
- `isRangeValid(meta)` — checks `range[0] < range[1]` with
  finite-number guard. Used both inline (for the checkbox's
  disabled state) and inside the toggle handler (defensive
  guard if the disabled state was bypassed).
- `selectedParamMeta`, `selectedRangeValid` — computeds over
  the currently selected parameter.
- `updateParamRange(name, side, raw)` — handles min / max
  edits independently. Preserves a partial range across
  keystrokes (e.g., editing min while max stays put) so
  the user doesn't lose half their typing. Empty input on
  both sides deletes `meta.range` entirely.
- `setParamQeuboControlled(name, checked)` — async. Writes
  the flag into parameter_meta, then derives the new
  controlled set from the just-committed `next` (not from
  `props.env`, which may not have re-rendered yet) and
  calls `qeubo.startNewExperiment(controlled)` or
  `qeubo.abortExperiment()` accordingly. Surfaces the
  outcome via `pushSystemMessage`.

The dispatch's "toggle is the trigger that recreates"
semantic is preserved exactly. Range edits are local; only
the toggle propagates to the backend. Users who want a new
range to take effect on a running experiment can untoggle and
retoggle to recreate.

**Detail-view template.** Three new rows in the Parameter
detail's `form-grid`:

- Range: a paired number input (min / max) with a `–`
  separator. The `range-half` inputs share the row width;
  invalid ranges (when qeubo_controlled is on) show a red
  border via the `.invalid` class.
- qEUBO: a `<label>`-wrapped checkbox plus a `controlled by
  qEUBO calibration` description span. Disabled until
  `selectedRangeValid && !already_checked` (the second
  conjunct lets the checkbox stay clickable to *uncheck*
  even if the range later became invalid). The disabled
  state's `title` tooltip explains why.
- Validation surface: a `validation-error` div when the
  range is invalid AND qeubo_controlled is checked
  ("experiment continues with the snapshot taken at create
   — fix the range and re-toggle to apply"); a
  `validation-hint` div otherwise telling the user to set a
  range to enable the checkbox.

**Style.** Added compact rules for the new controls: `.range-
inputs`, `.range-half`, `.range-sep`, `.dark-input.invalid`,
`.qeubo-control`, `.checkbox-label`, `.validation-error`,
`.validation-hint`. Kept the dark theme palette (#111 bg,
#333 borders, #4aaef0 accent, #ff6b6b for errors).

### `docs/notes/qEUBO.md`

Status-table updates. Toolbar row moved to Merged with PR #33
/ commit 62efec8. Parameter-meta editor row moved to "In
review". Reordered slightly so completed rows precede in-flight
ones; bookmarks-UI row moved below the editor row since the
editor is shipping first.

## Critical files

- **Edited:** `frontend/src/components/PaletteEditor.vue`
  (+ ~110 lines of script, ~40 lines of template, ~10 lines
  of style; total file 512 lines, up from 349).
- **Edited:** `docs/notes/qEUBO.md` (status-table updates).

## Reused existing surface

- `getClone()` / `commit()` — the existing PaletteEditor
  mutation pattern (deep clone, mutate, emit). The new
  parameter_meta handlers follow it identically.
- `useQeubo`'s public surface: `startNewExperiment`,
  `abortExperiment`. Already shipped in PR #32.
- `pushSystemMessage` for the user-visible feedback when an
  experiment recreates or dissolves.
- The `<label>` + checkbox + descriptive span pattern is
  not used elsewhere in the codebase but is the established
  HTML idiom for accessible checkbox UI.

## Verification

1. **Static check.** `npm run build` green
   (`vue-tsc -b && vite build`, 1.90s, 853 modules; bundle
   2,767.32 kB / +2.7 kB over PR #33). The bundle growth is
   from the new template + script in PaletteEditor; CSS bundle
   grew slightly to 50.81 kB.

2. **Mental walk-through of the controlled-set sync.**
   - Toggle alpha on (range [0, 1] valid) → controlled = [alpha]
     → `startNewExperiment(['alpha'])` → backend POST /experiment
     succeeds → composable populates statusRef and pairs → toolbar
     cluster appears (PR #33's `experimentExists` watcher).
   - Add beta with range [0, 0.5], toggle on → controlled =
     [alpha, beta] → `startNewExperiment(['alpha', 'beta'])`
     → backend deletes old, creates new with input_dim=2.
     System message: "qEUBO experiment recreated over [alpha, beta]."
   - Untoggle alpha → controlled = [beta] → `startNewExperiment(['beta'])`.
   - Untoggle beta → controlled = [] → `abortExperiment()` →
     backend DELETE → toolbar disappears (no experiment).
   - Edit alpha's range while qeubo_controlled is on (running
     experiment): parameter_meta updates locally; backend's
     experiment continues with its snapshot; the editor's
     validation-error div surfaces the divergence.

3. **UI HMR smoke (deferred to user).** Pasteable in browser
   console once the dev server is running:

   ```js
   // After login:
   // 1. Open Settings → Analysis Environment (PaletteEditor).
   // 2. Click "alpha" in the Parameters section.
   // 3. Set range to 0 and 1 in the new fields.
   // 4. Tick the qEUBO checkbox.
   // 5. Watch for system message: "qEUBO experiment recreated over [alpha]."
   // 6. Switch to the toolbar. The cluster should appear.
   // 7. Drive A/B/Applied, verdict, apply via the toolbar.
   // 8. Return to PaletteEditor, untoggle alpha. System message:
   //    "qEUBO experiment dissolved (no controlled parameters)."
   //    Toolbar cluster disappears.
   ```

## Outcomes

- The qEUBO calibration loop is now **reachable through the
  UI alone** — no console-driven `parameter_meta` mutation
  required. A user with a fresh install can:
  1. Open Settings → Analysis Environment.
  2. Add a parameter (or use the existing `alpha`).
  3. Set its range and tick qeubo_controlled.
  4. Use the toolbar's audition / verdict / apply / pin flow.
- Identity-aware: parameter_meta lives in the GlobalStore and
  is per-user. SyncService persists it; the migration 5→6
  ensures the field exists; the editor handles fresh users
  whose parameter_meta is empty.
- Validation per ADR-0002: invalid range explicitly disables
  the checkbox; if a controlled parameter's range becomes
  invalid post-hoc, the editor surfaces the divergence inline
  with a clear retry path ("fix the range and re-toggle").

## Out of scope (explicitly)

- **Bookmarks UI panel.** The remaining frontend slice. Will
  add rename / delete to `useQeubo`'s public surface, replace
  the `window.prompt` pin-name input with a proper modal, and
  expose the saved bookmarks in a list with Apply / Rename /
  Delete actions. Independent of the editor; can ship now.
- **PaletteEditor.vue size budget.** The file is 512 lines,
  over ADR-0007's 250 SFC budget. The script section is the
  bulk (~280 lines) and was already over budget pre-PR (PR
  #11 / debranding noted parameter editing as one of the
  oversize-prone clusters). Per ADR-0007's "incremental, not
  a sweep" posture, an extraction PR (likely
  `ParameterDetail.vue` + `SymbolDetail.vue` +
  `PaletteDetail.vue` sub-components, or a `usePaletteEditor`
  composable for the mutation logic) is a follow-on cleanup,
  not a precondition for this slice. Logged in the qEUBO
  note's outstanding-open-items section if useful as a
  forcing function.
- **Range-edit-triggers-recreate.** Per dispatch v1.2 §3.7,
  only `qeubo_controlled` toggles trigger experiment recreate
  — range edits are local. Users wanting a new range to
  apply on a running experiment must untoggle/retoggle. The
  editor surfaces the divergence; auto-recreation on range
  edit is out of scope.
- **Reorder controlled parameters.** The dispatch declares
  index-stability via the create-time recorded order. The
  editor doesn't currently surface a way to change ordering
  (Object.entries iteration order is the default); a
  drag-to-reorder affordance would be a future enhancement
  if users discover it matters in practice.

## Documentation follow-up

- This worklog entry.
- `docs/notes/qEUBO.md` status table updated.
- No ADR amendment.
- No `deferred-items.md` entry — the size-budget overage and
  the range-edit-recreate question are both contextualized in
  this worklog.

## Branch + PR workflow

Branched off `main` post-merge of PR #33. Single PR to main.
Editor surface is independent of the bookmarks UI; either can
follow.
