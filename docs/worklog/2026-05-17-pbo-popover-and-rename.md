# PBO popover + user-facing rename (qEUBO → PBO)

- **Status:** In flight on `KodBena/feat/pbo-popover-and-rename`.
  Closes item 5 of the post-v1.1.0 follow-up list
  (`todo_local.gitignore`).
- **Genre:** UX refactor + locale-only rename + composable
  extraction (the hover-popover audit-trigger flagged in
  `docs/worklog/2026-05-14-popover-hover-finickiness.md`).
- **Date:** 2026-05-17.

## Context

Two arcs, shipped together because they touch the same files:

**Popover shape.** The user asked for the qEUBO calibration
cluster to take the toolbar-popover shape the QUEUE and
SLIDERS surfaces already use — a single badge that opens a
hover panel rather than an inline cluster taking up toolbar
real estate even when the user isn't actively voting.

**User-facing rename.** Per the project author 2026-05-17:
PBO (preference-based Bayesian optimisation) is the
methodology the user interacts with; qEUBO is one specific
acquisition function used inside the PBO loop — an
implementation detail. The user-facing surface should say
PBO; code identifiers and the backend's `/qeubo/*` routes
should retain `qeubo` (they accurately name the library /
backend module). The original cluster, all its surrounding
strings, and several scattered system-message strings called
the methodology by its acquisition-function name. This
corrective fixes the naming honestly without flipping any
wire shape.

The composable extraction is a third, opportunistic arc: the
new `PboPopover` is the third popover in `components/chrome/`
+ `components/qeubo/` to repeat the hover-intent +
close-grace timer pattern, which is the trigger
`docs/worklog/2026-05-14-popover-hover-finickiness.md`
recorded ("if a third popover with the same shape surfaces,
that is the moment to extract a `useHoverPopover()` composable").

## What changed

### `src/composables/chrome/useHoverPopover.ts` (new)

The extracted composable. Returns
`{ open, onMouseEnter, onMouseLeave }`; encapsulates the
150 ms close-grace timer, the cancel-on-enter pattern, and
the `onUnmounted` cleanup per the resource-ownership-at-
mutation-sites discipline. Documents the layout contract the
consumer must respect (popover panel is a DOM descendant of
the hover root; flush-anchored with no `margin-top` dead
zone). Default close-delay tunable via an options parameter
for future per-call-site adjustment; no current caller
overrides the default.

ADR-0003 band 1 — pointer events and timers only; no Go
vocabulary.

### `src/components/chrome/EngineQueueTooltip.vue`

Refactored to consume `useHoverPopover`. Inline hover-handler
implementation (~30 lines) replaced by a one-line composable
call. SFC header amended to point at the composable's
extraction trigger.

### `src/components/chrome/ToolbarSliderPopover.vue`

Same shape as above — consume `useHoverPopover`, retire the
inline implementation, point the header at the trigger.

### `src/components/qeubo/PboPopover.vue` (new — replaces `QeuboToolbar.vue`)

The new popover. Renders as a single "PBO" badge carrying
the current phase indicator (`init done/total`, `iter n`, or
`—`) plus a busy dot when a request is in flight; hover
opens a floating panel with the audition toggle
(Applied / A / B), verdict pair, apply, pin, debug toggle,
and an about-PBO `?` chip carrying the long phase tooltip
(retained from the legacy cluster).

The header records the band-coherence rationale explicitly:
the popover is band 1, self-gates on
`calibrationEnabled && experimentExists` (a legitimate
feature constraint, not an inherited lifecycle from a sibling
chrome neighbourhood), and the mount in `Toolbar.vue` sits as
a sibling of `engine-metrics-bar` — not nested inside.
References `docs/notes/postmortem-knob-toolbar-popover-2026-05.md`
so a future reader sees the discipline this placement
respects.

Also records the naming distinction: user-facing surface is
PBO; code identifiers retain `qeubo` because they accurately
name the library and backend routes (`useQeubo`,
`qeubo-service.ts`, `/qeubo/*`). The wire-level rename is
deferred — a cross-team arc requiring coordinated
backend / env-var / deploy changes.

### `src/components/qeubo/QeuboToolbar.vue` (removed)

The inline cluster the popover replaces. `git rm`'d in this
PR; the SFC's behaviour is preserved in `PboPopover.vue`
modulo the inline → hover-popover shape change.

### `src/components/chrome/Toolbar.vue`

Import rename (`QeuboToolbar` → `PboPopover`) and the mount
site's comment amended to describe the new shape and naming
distinction. The mount location (sibling of
`engine-metrics-bar`) is unchanged.

### `src/locales/{en,ja,ko,zh-CN}.json`

Mass value-side rename of "qEUBO" → "PBO" (26 occurrences
per file × 4 files). Key paths (`qeubo.*`, `qeuboBookmarks.*`,
`qeuboInternal.*`, `palette.param.qeubo*`, `palette.systemMessage.qeubo*`)
stay unchanged so call sites do not need touching. New key
`toolbar.metric.pbo` ("PBO" in all four locales) for the
badge label, consistent with the existing
`toolbar.metric.queue` / `toolbar.metric.sliders` shape.

### `src/composables/useQeubo.ts` + `src/services/qeubo-service.ts` + `src/components/editors/PaletteEditor.vue`

Quoted-string-literal `qEUBO` → `PBO` replacements (14
strings across the three files): thrown-error messages and
status-message lookups that surface to the user via the
system log. Comments referring to the algorithm at the code
level are preserved unchanged — `useQeubo` *does* use the
qEUBO acquisition function; the code comments describing
that are technically accurate.

The `PaletteEditor.vue` line 250 hardcoded English string
("PBO experiment dissolved...") is left as a literal — it
violates the standing i18n discipline, but extracting it to
a key is out of scope for this corrective per the
incremental-retrofit posture. Flagged here in case a future
i18n housekeeping pass wants to sweep up loose hardcoded
strings.

### `frontend/FILES.md`

- New entry: `composables/chrome/useHoverPopover.ts` [B1].
- Renamed entry: `components/qeubo/QeuboToolbar.vue` →
  `components/qeubo/PboPopover.vue`, with the one-liner
  updated to describe the new shape (badge + hover popover,
  consumes useHoverPopover).
- Directory header for `qeubo/` now records the
  user-facing/code-identifier naming split so a future
  reader doesn't read the directory name as a contradiction
  of the user-visible labels.

## What's deferred

- **Wire-level rename (qeubo → pbo on the backend).** Out of
  scope per the original split of item 5. Touches
  `app.include_router(qeubo.router)`, the `/qeubo/*` route
  prefix, `QEUBO_ENABLED` env var, `app.state.qeubo_service`,
  and the corresponding frontend OpenAPI regeneration.
  Cross-team arc — would land via a dispatch under
  `docs/dispatch/` if pursued. The current PBO/qeubo split
  is honest (PBO is the methodology, qeubo is the library /
  backend module name); the deferral is a tradeoff between
  surface consistency and coordination cost.

- **i18n hygiene sweep for hardcoded English strings.** The
  PaletteEditor inline string flipped in this PR is one
  instance; there may be others scattered in the codebase
  that should ideally route through `vue-i18n`. Out of
  scope; flagged for a future housekeeping arc.

- **PR #225 redux audit.** With three popovers now using the
  extracted composable, the band-coherence discipline from
  the PR #225 corrective has one additional surface to apply
  to. The PboPopover's SFC header records its compliance
  explicitly; no follow-up audit needed on the popover
  itself, but the discipline note in
  `docs/notes/postmortem-knob-toolbar-popover-2026-05.md`
  §7.1 could grow a "now applied to PboPopover" line on its
  next housekeeping pass.

## Verification

- `npm run build` — passes (`vue-tsc -b && vite build`).
  Module count: 941 → 942 (the new `useHoverPopover`
  composable).
- `npm run test:run` — 521 passed, 3 skipped (no
  regressions). The tests don't exercise component-level
  hover behaviour or i18n string values directly; the strict
  typecheck is the safety net for the import-rename surface.
- Browser smoke (pending user): with `QEUBO_ENABLED=True` on
  the backend and an active PBO experiment, the PBO badge
  appears in the toolbar; hover opens the panel; clicking
  Applied/A/B, voting, applying, pinning all behave the same
  as the legacy cluster. State-axis exercise per
  postmortem-knob-toolbar-popover-2026-05 §7.4: connected /
  disconnected (popover self-gates on PBO state, not
  engine), with / without a calibration experiment, with /
  without a pending pair.

## Cross-references

- `todo_local.gitignore` — item 5 of the post-v1.1.0
  follow-up list, source of this corrective.
- `docs/worklog/2026-05-14-popover-hover-finickiness.md` —
  the worklog that pre-recorded the composable-extraction
  trigger ("third instance"); this PR fulfills it.
- `docs/notes/postmortem-knob-toolbar-popover-2026-05.md` —
  the band-coherence discipline `PboPopover.vue`'s header
  records compliance with.
- `docs/notes/postmortem-knob-registry-qeubo-domain-2026-05.md` —
  the sibling postmortem from the same arc; recorded the
  PBO/qEUBO category split at the `KnobDomain` enum level
  (renamed to `'palette'` for the same reason this PR
  renames the user-facing label).
- `frontend/CLAUDE.md`'s "Resource ownership at mutation
  sites" section — the `onUnmounted` cleanup in
  `useHoverPopover` honours this discipline.

## License

Public Domain (The Unlicense).
