# Popover hover finickiness — zero-gap + grace period; recurring-pattern audit note

- **Status:** In flight on `KodBena/fix/popover-hover-finickiness`. Two
  toolbar popovers (`ToolbarSliderPopover`, `EngineQueueTooltip`) get
  the same shape change; this worklog is the audit-trail vehicle for
  the recurring pattern the user surfaced.
- **Genre:** Bugfix + audit-pattern note. The code change is small;
  the load-bearing artifact for future auditors is §"Recurring
  pattern" below.
- **Date:** 2026-05-14.

## Context

The toolbar's quick-access slider popover (`ToolbarSliderPopover.vue`,
shipped in PR #225 and band-mismatched-and-corrected in PR #226)
required the user to move the pointer "just right" — fast enough to
cross the gap between badge and popover but not so fast that the
pointer overshoots the popover — for the popover to stay open long
enough to interact with. The user surfaced this as "extremely
annoying ... if you're the wrong person, one might think someone is
pulling your leg."

The same shape was carried by `EngineQueueTooltip.vue`, the sibling
toolbar tooltip whose docstring `ToolbarSliderPopover` explicitly
copied from. QueueTooltip had been silently exhibiting the same
behaviour, but no one had complained because it's a glance-and-move
tooltip — users don't typically need to reach *into* it.

## Diagnosis

Both popovers use the identical pattern:

```vue
<div
  class="metric ..."
  @mouseenter="open = true"
  @mouseleave="open = false"
>
  ...
  <div v-if="open" class="...-popover">...</div>
</div>
```

With CSS placing the popover at `top: calc(100% + var(--space-tight))`
(QueueTooltip) or `top: 100%; margin-top: var(--space-tight)`
(SliderPopover) — a small visible gap between badge and panel.

The popover is a DOM-descendant of `.metric`, so a `mouseleave` event
on the parent does *not* fire when the pointer is over the popover
itself. But while the pointer is in the *gap* — over neither the badge
text nor the popover — it's also outside `.metric`'s painted bounding
box. The absolute-positioned popover doesn't grow `.metric`'s box.
So `mouseleave` fires; `open` flips to false; the popover unmounts
before the pointer arrives.

The user has to make it from badge through dead zone to popover
within the time it takes Vue to reconcile the `v-if` — usually
faster than a deliberate hand movement, hence "just right."

## Fix

Zero gap + grace period, applied identically to both files:

1. **Remove the `margin-top` / `+ var(--space-tight)` offset** on
   the popover's CSS. The popover now sits flush against the badge;
   pointer-traverse from badge to popover is gap-free. This alone
   solves the common case.
2. **Add a hover-intent grace timer** in `<script setup>`:
   - `mouseleave` starts a 150ms `setTimeout` that closes the
     popover when it fires.
   - `mouseenter` cancels the timer and reopens. Since
     `mouseenter` on `.metric` fires when entering any descendant
     (including the popover), cancellation works whether the
     pointer re-enters the badge or arrives at the popover.
   - `onUnmounted` clears any pending timer per the
     resource-ownership-at-mutation-sites discipline in
     `frontend/CLAUDE.md`.

The grace period covers horizontal overshoot and any other
transient hover loss the zero-gap layout alone wouldn't catch
(e.g. the user accidentally moves the pointer past the popover's
right/left edge while scanning the list).

150ms is the standard hover-intent grace window — short enough that
intentional close feels responsive, long enough that overshoot
forgiveness is reliable. Tuneable later if the value turns out
miscalibrated for the codebase's UI rhythm.

## Recurring pattern — note for future auditors

**This shape has now appeared twice.** Both instances were authored
independently against the same naive `@mouseenter` / `@mouseleave`
+ visible-gap layout, and both exhibited the same finickiness. The
second instance (`ToolbarSliderPopover`) explicitly copied its
docstring from the first (`EngineQueueTooltip`) — *including the
sentence "Pattern mirrors `EngineQueueTooltip`"*. The pattern
propagated by imitation; the bug propagated with it.

**Auditor instruction.** When auditing the chrome layer for hover-
revealed surfaces:

- Any popover-style element rendered via `v-if="open"` inside a
  parent whose `@mouseleave` flips `open = false` is a candidate
  for this bug. Check the popover's CSS for any vertical or
  horizontal offset (`margin-top`, `margin-left`,
  `top: calc(100% + ...)`, etc.) that creates dead-zone between
  the trigger element and the panel. If present and there is no
  grace-period close timer, the popover has the finickiness bug.
- The bug is more noticeable on surfaces the user reaches *into*
  (sliders, cancel buttons) than on glance-and-move tooltips
  (where the user reads the panel without interacting). Absence
  of user complaint is not evidence the bug isn't there; it may
  just mean the surface hasn't yet been called upon to support
  interaction.

**Composable-extraction trigger.** Two instances is the codebase's
soft threshold for "duplication, fine; the third is the trigger"
(per ADR-0003's "Ports are extracted only when a second concrete
implementation exists" principle, applied loosely to UI-pattern
duplication too — duplication is cheaper than the wrong
abstraction at N=2). **If a third popover with the same shape
surfaces, that is the moment to extract a `useHoverPopover()`
composable** carrying the timer state, the lifecycle, and a
documented contract about zero-gap CSS. Until then, the two
instances stay inline with mirror-image docstrings cross-
referencing each other.

The composable's likely shape, sketched for the future implementer:

```ts
// src/composables/useHoverPopover.ts (when N=3 triggers extraction)
export function useHoverPopover(opts?: { closeDelayMs?: number }) {
  const open = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const delay = opts?.closeDelayMs ?? 150;

  function onMouseEnter() { /* ... */ }
  function onMouseLeave() { /* ... */ }
  onUnmounted(() => { if (timer !== null) clearTimeout(timer); });

  return { open, onMouseEnter, onMouseLeave };
}
```

Recording this here so the extraction is mechanical when its
moment arrives — no new design work required, the worked shape
is already in code (twice over).

## What changed

- `frontend/src/components/chrome/ToolbarSliderPopover.vue` —
  hover-intent grace timer added; `margin-top: var(--space-tight)`
  removed from `.sliders-popover`; SFC header amended to point at
  this worklog.
- `frontend/src/components/chrome/EngineQueueTooltip.vue` — same
  shape change, same header amendment.

No type or wire changes; no test surface changes (component-level
hover-interaction tests are out of scope per `tests/CLAUDE.md`,
and the timer behaviour itself is template-bound). The
disconnected/connected state-axis exercise that
`docs/notes/postmortem-knob-toolbar-popover-2026-05.md` §7.4
recommended applies here too — both popovers should be verified
under brisk pointer motion (for the zero-gap path) and deliberate
overshoot (for the grace-period path).

## Cross-references

- `docs/notes/postmortem-knob-toolbar-popover-2026-05.md` — the
  predecessor postmortem from the same arc; §7.4's "Visual
  exercise in disconnected and degraded states" recommendation
  extends naturally to "exercise hover-revealed surfaces under
  both smooth and overshoot pointer motion."
- `docs/worklog/2026-05-14-toolbar-popover-band-mismatch.md` —
  the sibling worklog from the same author session.
- `frontend/CLAUDE.md`'s "Resource ownership at mutation sites"
  section — the discipline `onUnmounted` cleanup honours.
- ADR-0002 (fail loudly) — applied here at the UX level: a
  finicky hover is a silent UX failure that surfaces only when
  the user spends mental effort wondering whether something
  *is supposed to* work the way it's working.
- ADR-0002 Rule 7 (closest-match selection surfaces too,
  appended 2026-05-15) — the §"Recurring pattern" audit
  instruction above is one operational application of the rule
  applied specifically to UI patterns: imitation of an existing
  pattern is a closest-match against the vocabulary of
  "documented patterns to copy," and the audit-trigger
  ("third instance → extract a composable") is the rule's
  visible-deviation-recording at the UI-pattern register.
- ADR-0003 — the two-instances-allowed duplication threshold
  before composable extraction is warranted.

## License

Public Domain (The Unlicense).
