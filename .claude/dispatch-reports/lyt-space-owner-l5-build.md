# Space-owner cure, dispatch L5 build report — CornerStack + the overlay primitive

**Status.** Built. Commits on `worktree-agent-a384e74735fb4d353` (the
worktree's own branch, reset to LOCAL `lyt-phase2`'s tip before work per
rows 2402/2460). Ledger rows 2447/2484/2499.

**Base freshness (rows 2402/2460).** The worktree's checkout was on a
stale `main`-family tip (`3378806f`) at session start — not `lyt-phase2`
at all. `git reset --hard lyt-phase2` (local, `e1e608b3593c...`) before
any read. `feasible-layout-purity.test.ts`
(`frontend/tests/unit/state/feasible-layout-purity.test.ts`) confirmed
present — the L4 marker. `.claude/dispatch-reports/lyt-space-owner-spec.md`
confirmed present (992 lines) — the STOP-if-absent condition never
triggered.

**Reading, disclosed.** Read end to end before any claim: the full spec
(all 992 lines, not merely §1.4/§1.5/§3 step 5/§4's step-5 rows —
reading the whole file was the fastest honest path given its
cross-references); `feasible-layout.ts` (953 lines); `App.vue`'s
corner-chrome/overlay-stack template (lines ~1128–1636 pre-edit) and CSS
(~1700–1930 pre-edit) — the spec's own cited line numbers (1139/1524/
1685–1734) had drifted, confirmed by fresh grep;
`LytPresenceMenu.vue`; `SystemLogPanel.vue`; `SystemLogToggle.vue`;
`DebugMenu.vue`; `BoardRailPopoverTrigger.vue`; `useLytPresenceMenu.ts`;
`useHoverPopover.ts`; `useModalKeyboard.ts`; `useContentDemand.ts`;
`ToolbarEngineMetrics.vue`; `LocalePicker.vue` (script half; template
tail skimmed for the `pick()` call sites, not a load-bearing gap); the
L4 build report's own 223-key baseline breakdown section (lines
574–648). The two divergent modals, read in full: `LoginModal.vue`
(216 lines) and `LearnPathModal.vue` (252 lines). Every other one of
the eleven modals in `src/components/modals/` was read at least for its
own dismissal wiring (backdrop handler, `role`, `useModalKeyboard` call
site) via targeted grep + confirmation reads, not a blind sample.

**STOP-and-report events during this build.** None reached the "STOP"
threshold — every representation choice below is disclosed inline as a
narrower-than-spec gate (matching the L1–L4 dispatch chain's own
established disclosure style), not a silent fork. The one genuine
design correction mid-flight — `provide`/`inject` does not reach
slot-content components mounted from a PARENT's own template, so the
`CornerStack` clearance value is threaded via `defineExpose` + a
template ref instead — is documented in `CornerStackHost.vue`'s own
header, not hidden.

---

## 1. CornerStack (spec §1.4)

`frontend/src/state/corner-stack.ts` — `CornerAnchor`,
`CornerStackEntry<Region>`, `CornerStack<Region>` (`.build()` /
`.layout()` / `.totalHeight()`), verbatim the spec's own types, built on
`feasible-layout.ts`'s `Measured`/`Px`/`px`/`measured` (dispatch L1).
`.build()` refuses a stacking-order collision within one anchor (the
review's own "unrepresentable overlap" cure) and refuses a non-`'v'`-axis
entry.

`frontend/src/components/chrome/CornerStackHost.vue` — the ONE component
replacing `App.vue`'s former `#lyt-corner-chrome` + `#lyt-overlay-stack`
(two independent `position: fixed` divs). Three registered regions, one
anchor (`bottom-right`):

| order | region | reserves | content |
|---|---|---|---|
| 0 | `triggers` | `true` | DebugMenu, board-rail popover trigger, control-panel summon, LytPresenceMenu, SystemLogToggle |
| 1 | `log` | `false` | SystemLogPanel (`v-if` unchanged) |
| 2 | `banners` | `false` | keybinding-capture / workspace-save / workspace-suppressed banners |

Each region's own live height is `useContentDemand(el, 'v')` (dispatch
L2b's runtime measurement seam, already used for `tree`'s content
demand — reused here, not reinvented). `CornerStack.layout()` computes
every region's `bottom` offset from its neighbors' CURRENT height; the
hand-guessed `bottom: calc(var(--space-medium) + 40px)` literal and its
"a conservative estimate... rather than a swept number" apology comment
(App.vue, pre-edit) are DELETED — no `+40px` (or any hand literal)
survives anywhere in the corner-stack CSS.

`App.vue` now authors the SAME content (unchanged `v-if` gates, unchanged
markup) through `<CornerStackHost>`'s three named slots
(`#banners`/`#log`/`#triggers`) rather than two raw divs.

**The clearance fork, disclosed.** The spec's own worked sketch implies
`provide`/`inject` as the natural mechanism for threading "how much is
stacked above the trigger row" down to a trigger-row popover. Tried
first; does not work — `LytPresenceMenu`/`BoardRailPopoverTrigger`/the
control-panel-summon popover are mounted as `CornerStackHost`'s own SLOT
content, and Vue resolves `provide`/`inject` against the COMPONENT
INSTANCE tree (the slot's authoring parent, `App.vue`), not the rendered
DOM tree — a `provide()` inside `CornerStackHost` never reaches an
`inject()` in any of those three. Resolution: `CornerStackHost`
`defineExpose({ clearancePx })`; `App.vue` reads it via a template ref
(`cornerStackHostRef.value.clearancePx`) and threads it down as an
ordinary prop (`:clearance-px="cornerStackClearancePx"`). Documented in
`CornerStackHost.vue`'s own header, not silently substituted.

---

## 2. The overlay primitive (spec §1.5)

`frontend/src/state/overlay-contract.ts` — `OverlayKind`,
`OverlayDismissal`, `OverlayContract`, `overlayContract()`, verbatim the
spec's own three refusals (no dismissal channel at all; a modal without
`focusTrap`; a popover with one).

Two shared composables now construct through it:

- `useDismissiblePopover.ts` (new) — the click/outside-click/Escape
  idiom five components independently re-implemented (each one's own
  pre-dispatch header said so explicitly: "the SAME idiom... use").
  `outsideClick` is the one call-site-configurable channel (default
  `true`; `DebugMenu.vue` passes `false`, disclosed below).
- `useModalKeyboard.ts` (extended, not rewritten) — already implemented
  Escape/focus-trap/initial-focus/focus-restoration for every modal that
  called it; now also constructs `overlayContract({kind:'modal',
  focusTrap:true, ...})` once at setup, so a caller's dismissal shape is
  validated, not merely trusted.
- `useHoverPopover.ts` (extended) — the HOVER-GRACE fix; see §3.

---

## 3. HOVER-GRACE (commissioner item 3)

**The actual defect, found by reading `ToolbarEngineMetrics.vue` in
full.** `EngineQueueTooltip.vue`/`ToolbarSliderPopover.vue`/
`PboPopover.vue` already wrap trigger + popover in ONE shared hover-root
element (`@mouseenter`/`@mouseleave` on the wrapper, both descendants
inside it) — `useHoverPopover.ts`'s own header names this as the
required consumer contract. `ToolbarEngineMetrics.vue`'s `eval`/`health`
groups did NOT follow it: the popover was a DOM SIBLING of the trigger
with no hover handlers of its own. A pointer that successfully crossed
the gap and landed on the popover (to reach `EngineModelSelect`) never
renewed the grace timer — it kept counting down from the trigger's own
`mouseleave` and could close the popover out from under an actively-
hovering pointer. **Fixed**: both groups now wrap trigger + popover in
one `.metric-hover-root`, mirroring the other three components' own
shape.

**The type-boundary gap, disclosed.** None of the four hover popovers
had ANY of `overlayContract`'s three named channels — dismissal was
solely "lose hover." Rather than fork the type to add a fourth channel,
`useHoverPopover.ts` now ALSO closes on Escape (a genuine accessibility
fix — none of the four were keyboard-dismissible before) and constructs
`overlayContract({dismissal:{escape:true, outsideClick:false,
explicitCloseControl:false}})` — `outsideClick`/`explicitCloseControl`
stay explicit, disclosed `false`; the hover-loss corridor remains each
consumer's own practical dismissal mechanism, outside the type's three
named channels.

**Test.** `tests/integration/ToolbarEngineMetrics-hover-grace.test.ts` —
4 scenarios, all WITNESSED (jsdom):
1. Stepped pointer travel (6 `mousemove` steps via `document.dispatchEvent`,
   walking stubbed `getBoundingClientRect` coordinates from the trigger's
   rect to the popover's) survives; the model `<select>` inside is
   reachable, enabled, and a `setValue` genuinely changes its bound state.
2. A genuine momentary excursion outside the hover root, re-entered
   before the close delay, is forgiven (the grace corridor).
3. Control: a leave with NO re-entry genuinely closes (the window is not
   infinite).
4. Escape dismisses the popover.

jsdom performs no real hit-testing, so the test dispatches the events a
real browser WOULD dispatch at each corridor step rather than relying on
jsdom to arbitrate pointer ownership (disclosed in the test file's own
header). **The real-browser witness — an actual mouse-driven rig
confirming a real browser's DOM-ancestry mouseenter/mouseleave dispatch
never leaves `.metric-hover-root` mid-corridor — is UNEXERCISED**, per
the dispatch brief's own instruction (the follow-up rig's job).

---

## 4. Census walk — every modal and popover, old contract → new contract

Full census, not a sample, per the dispatch brief's own repeated
instruction and the spec's own risk-register row 2 for step 5.

### Modals (eleven, `src/components/modals/`)

| Modal | Old dismissal | New dismissal | Explicit false? |
|---|---|---|---|
| AppConfirmDialog.vue | `useModalKeyboard` (Escape/focus-trap/restore) + backdrop `@mousedown.self` + Cancel button | Same, now validated via `overlayContract()` inside `useModalKeyboard` — no site change | none |
| AppPromptDialog.vue | same shape | same, contract-validated | none |
| ConfirmCloseBoardModal.vue | same shape | same, contract-validated | none |
| ConfirmLoadModal.vue | same shape | same, contract-validated | none |
| EngineMatchModal.vue | same shape | same, contract-validated | none |
| HyperparamPromptModal.vue | same shape | same, contract-validated | none |
| MintCardModal.vue | same shape (own two-stage Escape: dropdown first, modal second) | same, contract-validated | none |
| PlayEngineModal.vue | same shape | same, contract-validated | none |
| ResetAllKeybindingsModal.vue | same shape | same, contract-validated | none |
| **LoginModal.vue** | `useModalKeyboard` wired (Escape/focus-trap/restore already present — NOT missing, contrary to a loose paraphrase of the review), but **markup-divergent**: `.modal-card` (not `.modal-content`), backdrop dismissed via `@click` + a hand `e.target === e.currentTarget` check | `.modal-card` → `.modal-content` (class rename only, no declaration changed); backdrop unified to `@mousedown.self="handleCancel"`, `handleBackdropClick` deleted | none |
| **LearnPathModal.vue** | **No `role="dialog"`, no `useModalKeyboard`, no Escape** — the review's own named gap. Backdrop `@mousedown.self="close"` + a footer Close button already existed. | Wired to `useModalKeyboard(modalContentRef, isOpen, close)` — Escape/focus-trap/initial-focus/restore all now present; `role="dialog"`/`aria-modal`/`aria-labelledby`/`tabindex="-1"` added to the content wrapper | none |

`SetupWizardModal.vue` (`src/components/wizard/`) is a wizard shell, not
one of the eleven — directory count confirms `src/components/modals/`
holds exactly 11 files, matching the spec's own "eleven modals" phrase;
`SetupWizardModal.vue` shares the SAME `handleBackdropClick` idiom
LoginModal used to but is out of this dispatch's named census (disclosed,
not silently migrated).

### Popovers — full census, exceeding the spec's own "six" (disclosed: the walk found eight distinct components, not a pre-counted six)

| Popover | Old contract | New contract | Explicit false? |
|---|---|---|---|
| LytPresenceMenu.vue | local `ref(false)` + own `pointerdown`(capture)/`keydown` listeners | `useDismissiblePopover()` — escape/outsideClick/explicitCloseControl all `true`; `clearancePx` prop (default 0) adds `margin-bottom` | none |
| BoardRailPopoverTrigger.vue | same shape | `useDismissiblePopover()`, same channels; `clearancePx` prop added | none |
| LocalePicker.vue | same shape (own header: "the SAME idiom `LytPresenceMenu.vue`/`LocalePicker.vue` use") | `useDismissiblePopover()`, same channels | none |
| **DebugMenu.vue** | `keydown`(Escape) only — **never had outside-click dismiss** (own pre-dispatch comment: "a plain click-toggle popover, not a modal") | `useDismissiblePopover({ outsideClick: false })` | **`outsideClick: false`**, disclosed — a dev-only pill menu that never had this channel; not silently added |
| App.vue control-panel-summon popover | local `ref(false)` + own `pointerdown`/`keydown` (near-duplicate of LytPresenceMenu's pre-dispatch shape) | `useDismissiblePopover()`; clearance applied via inline `marginBottom` style | none |
| ToolbarSliderPopover.vue | `useHoverPopover` — hover-loss only, no Escape | `useHoverPopover` now adds Escape + `overlayContract()` validation | **`outsideClick: false`, `explicitCloseControl: false`**, disclosed (hover-loss stays the practical corridor) |
| PboPopover.vue | same | same fix (shared composable) | same disclosed falses |
| EngineQueueTooltip.vue | same | same fix (shared composable) | same disclosed falses |
| ToolbarEngineMetrics.vue (`eval`+`health`) | same, PLUS the structural HOVER-GRACE bug (§3) | same composable-level fix + the shared-hover-root structural fix | same disclosed falses |

**LYT Exclusive's own P2b summon mechanism** (`LytNode.vue`'s Teleport
target, named in spec §1.5's own quantification universe): its
dismissal is entirely owned by the App.vue control-panel-summon popover
row above (the Teleport TARGET is a DOM relocation point, not an
independent dismissal site) — migrated by that row's own migration.
`LytNode.vue` itself was not re-read in full this dispatch (no dismissal
logic lives there per the spec's own text); flagged as **UNEXERCISED
re-confirmation** rather than silently assumed.

---

## 5. Baseline audit — the corner/overlay findings this step resolves

**Ran the layout-audit before AND after this dispatch's own changes**
(`npm run layout-audit`, the isolated cold-boot build).

**Findings resolved by this step: zero.** Investigated directly (not
assumed): the pre-dispatch baseline's corner/overlay-adjacent
`pointer-occlusion` findings on `#lyt-presence-menu-btn` /
`#control-panel-summon-btn` / `#system-log-toggle-btn` (visible in the
223-key baseline at 6 of 7 geometries) trace, per the report's own
`detail.interceptor` field, to `#main-area>div.modal-backdrop` — the
FIRST-RUN SETUP-WIZARD MODAL covering the entire page during the
isolated cold-boot audit run, NOT a corner-stack-internal collision.
This is the L4 build report's own already-disclosed root cause ("a
first-run wizard modal... render[s], for the first time in this
project's own audit history, because cold boot is now genuinely
backend-less" — recommended as its OWN follow-up dispatch, "cold-boot
auth/wizard surface", not this one's scope). **Ratchet does not shrink
this run** — disclosed rather than claimed.

**Structural rename, not a new finding.** 6 keys (42 finding-instances
across 7 geometries) changed selector text — `#lyt-overlay-stack>div.
system-log-panel>...` → `#corner-stack-log>div.system-log-panel>...` —
because `SystemLogPanel` now mounts inside `CornerStackHost`'s own `#log`
region instead of the retired `#lyt-overlay-stack` div. Same DOM
element, same finding, new stable-key text. Regenerated the baseline
(`node scripts/layout-audit.mjs --build --emit-baseline`, the documented
reproducible command) rather than hand-editing it:

- Pre-dispatch baseline: 223 keys.
- Post-dispatch, before regeneration: 223 total findings, **42 new vs
  baseline** (the 6 renamed keys × 7 geometries), **0 genuinely new
  defects**.
- Regenerated baseline: **223 keys** — net count UNCHANGED (a pure
  rename, not a shrink, not a growth).
- Final gate re-run against the regenerated baseline: **223 total, 0
  new**.

Per-rule counts identical before/after (`target-size 101`,
`pointer-occlusion 153`, `focus-invisible 28`, `unreachable-control 49`,
`viewport-escape 3`) — confirms no rule's own finding count moved,
consistent with "rename only."

**What this means for the L5/cure pipeline.** The corner-stacking
COLLISION defect the review witnessed (SystemLogPanel burying the
presence popover) was never independently captured as its own baseline
key in the first place (the audit's own occlusion rule fires against
whatever DOM element intercepts a click target at a snapshot moment; the
review's own witness was a live Playwright interaction, not a static
audit finding) — this dispatch's `CornerStack.layout()` mechanism closes
that collision by construction (§1's own "what this makes
unrepresentable"), but the audit ratchet has no PRE-EXISTING key to
retire for it. The cold-boot wizard-modal occlusion cluster (115+ keys
per L4's own count) remains the honest next target for a follow-up
dispatch, unchanged by this one.

---

## 6. Gates

- **eslint** (`npx eslint .`): exit `0`, no output. WITNESSED.
- **`vue-tsc -b --noEmit`**: exit `0`, no output. WITNESSED.
- **`npm run build`**: exit `0`, 1262 modules transformed, same
  pre-existing chunk-size notice, no new warnings. WITNESSED.
- **Full suite** (`NODE_OPTIONS=--max-old-space-size=2048 npx vitest run
  --maxWorkers=2`): exit `0` (foreground re-run after two composable-
  level template changes broke two source-text guards — see below),
  **274 files passed | 3 skipped (277)**, **3394 passed | 8 skipped
  (3402)**. WITNESSED. (One test net-added:
  `ToolbarEngineMetrics-hover-grace.test.ts`'s 4 cases; 3394 = pre-
  dispatch 3376 + 4 new hover-grace + corner-stack/overlay-contract unit
  tests (16) + adjustments to 3 pre-existing files that needed re-
  pinning against the new selectors, net delta consistent with the diff.)
- **`npm run layout-audit`**: exit `0`, **223 total findings, 0 new vs
  the regenerated baseline**, all seven geometries. WITNESSED.

**Two pre-existing test files needed re-pinning against the structural
rename** (disclosed, not silent):
- `tests/unit/lyt-w4-chrome.test.ts` — its own "banners + system log
  overlay stratum" describe block asserted against `#lyt-overlay-stack`
  literally; re-pinned against `CornerStackHost.vue`'s own
  `#corner-stack-banners`/`#corner-stack-log` CSS rules and App.vue's
  `<template #banners>`/`<template #log>` slot content — same invariant
  (position: fixed, the `--z-chrome-overlay` token, co-location, no
  stray in-flow copy), new anchor text.
- `tests/unit/lyt-d2-system-log-toggle.test.ts` — re-pinned against
  `<template #triggers>` in place of `#lyt-corner-chrome`, same
  assertions.
- `tests/integration/ToolbarEngineMetrics-overlap-fix.test.ts` and
  `tests/integration/render-count/ToolbarEngineMetrics.render-count.test.ts`
  — their own hover triggers moved from `.eval-summary`/`.health-summary`
  to the new `.metric-hover-root` (§3's structural fix); updated to match,
  no assertion content changed.

---

## 7. Deletions (spec's own "Deletes" framing, step 5)

- `App.vue`'s `bottom: calc(var(--space-medium) + 40px)` hand literal
  and its "a conservative estimate... rather than a swept number"
  comment — gone; `CornerStack.layout()` computes the offset live.
- `#lyt-overlay-stack` / `#lyt-corner-chrome` as two independent
  `position: fixed` containers — gone; `CornerStackHost.vue` is the one
  owner.
- `App.vue`'s hand-rolled control-panel-summon dismiss idiom (a second,
  near-duplicate copy of `LytPresenceMenu.vue`'s pre-dispatch shape) —
  gone; both now share `useDismissiblePopover()`.
- `LoginModal.vue`'s `handleBackdropClick` function and `.modal-card`
  class — gone; unified to the other ten modals' own idiom.

## 8. What survives untouched

Per spec's own "what survives" framing: the LYT compiler, `layout-model.ts`,
`useResizablePanel.ts`'s drag-input math, `LayoutClass` derivation,
`LytNode.vue`'s recursive Grid realization — none touched. `useModalKeyboard.ts`'s
own Escape/focus-trap/restore mechanism is UNCHANGED in behavior (only a
construction-time validation call added). `useHoverPopover.ts`'s own
150ms grace-timer mechanism is UNCHANGED (only Escape support added).

---

## 9. Coverage against the dispatch's own numbered scope

1. **CornerStack** — delivered, WITNESSED (unit tests + full suite +
   layout-audit). `reserves` field present per spec; two entries
   overlapping in the stacking direction unrepresentable by construction
   (`CornerStack.build`'s own collision refusal, unit-tested).
2. **Overlay primitive, full census** — delivered. Eleven modals: two
   gaps found and closed (LearnPathModal's missing Escape; LoginModal's
   markup divergence), nine already conformant, now contract-validated.
   Eight popovers (exceeding the named six): four migrated to
   `useDismissiblePopover` (one with a disclosed `outsideClick: false`
   exception), four hover popovers gained Escape + disclosed
   `outsideClick`/`explicitCloseControl: false`. Portrait
   control-panel-popover's own missing-Escape claim (spec's own §1.5
   text) — **UNEXERCISED re-confirmation**: the control-panel-summon
   popover (the one this dispatch found and migrated) IS
   screen-class-agnostic (same component, same `useDismissiblePopover()`
   call regardless of landscape/portrait), so Escape now works in both
   classes structurally; a live portrait-geometry Playwright witness
   was not run this dispatch.
3. **HOVER-GRACE** — delivered. The actual structural defect
   (`ToolbarEngineMetrics.vue`'s missing shared hover-root) found and
   fixed, not merely papered over with a longer timer. jsdom test
   WITNESSED (4 scenarios); real-browser witness UNEXERCISED per the
   brief's own instruction.
4. **Baseline enumeration** — delivered: zero findings resolved
   (disclosed, with the actual root cause identified — the cold-boot
   wizard modal, out of scope); 6 keys renamed (42 finding-instances), 0
   genuinely new; baseline regenerated via the documented
   `--emit-baseline` command; net count unchanged at 223, honestly
   reported as a rename, not a shrink.
5. **Gates** — eslint 0, vue-tsc -b 0, build 0, full suite 0
   failures, layout-audit 0 new vs the regenerated baseline. All
   WITNESSED, numbers stated above.

License: Public Domain (The Unlicense)
