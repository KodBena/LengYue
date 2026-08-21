# lyt-popover-clip-class — build report

Commission: work item `lyt-popover-clip-class` (work item opened row 1968; broader mandate row 1937) — foreclose
the popover clipping-ancestor CLASS, not just the one instance
`ToolbarSliderPopover.vue`'s D1 fix closed
(`.claude/dispatch-reports/lyt-sliders-popover-defects.md`). Worked against branch
`lyt-phase2` at `a22b1613`.

## Note on the commissioned citation `lyt-sliders-popover-review.md`

The commission brief cites an independent review at
`.claude/dispatch-reports/lyt-sliders-popover-review.md`. That file does not exist in
this tree — `ls .claude/dispatch-reports/` confirms it. The review verdict and its four
findings (1 Major, 1 Minor-moderate, 1 Minor, 1 Informational) are instead folded into
`.claude/dispatch-reports/lyt-sliders-popover-defects.md`'s own "Review response
(corrective, same day)" section, which was read in full as this commission's worked
example — that section's content matches what the commission brief describes (Finding 1
= scroll/resize re-anchor, etc.). Surfaced per ADR-0002's documentation-consumption
corollary rather than silently substituting one file for another.

## Isolation assertion

Worktree HEAD was one merge-base behind `lyt-phase2`'s tip at session start
(`3378806f`, an ancestor of `a22b1613`); fast-forwarded via `git merge --ff-only
origin/lyt-phase2` before any work. Dead-port probes, run before starting the isolated
dev server:

```
$ timeout 2 bash -c 'echo > /dev/tcp/127.0.0.1/19200'; echo "19200 exit:$?"
bash: connect: Connection refused
19200 exit:1

$ timeout 2 bash -c 'echo > /dev/tcp/127.0.0.1/19201'; echo "19201 exit:$?"
bash: connect: Connection refused
19201 exit:1

$ timeout 2 bash -c 'echo > /dev/tcp/127.0.0.1/19202'; echo "19202 exit:$?"
bash: connect: Connection refused
19202 exit:1
```

Server launched as:

```
VITE_API_BASE_URL=http://127.0.0.1:19201 VITE_KATAGO_WS_URL=ws://127.0.0.1:19202 \
  nice -n 19 npx vite --port 19200 --strictPort
```

No contact was made with 4173/5173/5174/8764/1235/1242. **In practice, the isolated
server was never used for a popover-clip witness** — see "Per-member disposition"
below for why (both remaining candidates gate their render on live backend/engine
state this isolation posture cannot provide) — but the server was started, confirmed
reachable, and killed at session end (`pkill -f "vite --port 19200"`; port reconfirmed
unreachable afterward) per the standing isolation discipline regardless.

## 1. Composable contract

The new composable lives at
`frontend/src/composables/chrome/useFixedAnchoredPopover.ts` (`[B1]`):

```ts
export interface UseFixedAnchoredPopoverOptions {
  align: 'left' | 'right';
  viewportMarginPx?: number; // default 4
}
export interface FixedAnchoredPopoverHandle {
  readonly style: Ref<{ top: string; left: string }>;
}
export function useFixedAnchoredPopover(
  open: Ref<boolean>,
  triggerEl: Ref<HTMLElement | null>,
  popoverEl: Ref<HTMLElement | null>,
  options: UseFixedAnchoredPopoverOptions,
): FixedAnchoredPopoverHandle
```

Roadmap-before-code disposition, worked against all three consumers before
implementation (per the commission's instruction):

- **`open`** is the SAME `Ref<boolean>` the consumer's own open/close source
  (`useHoverPopover` for two consumers, a local click-toggle `ref` for the enumerated,
  unrouted `LocalePicker.vue` — see the class sweep) already owns. The composable
  never writes it — it only watches transitions. This is what makes the composable
  compose with `useHoverPopover`'s own contract without either composable knowing
  about the other: `useHoverPopover` owns WHEN; `useFixedAnchoredPopover` owns WHERE.
- **`triggerEl`/`popoverEl`** are plain template refs the CONSUMER's own template
  binds (`ref="triggerEl"` / `ref="popoverEl"`), matching `ToolbarSliderPopover.vue`'s
  original D1 shape exactly (not a function-ref setter, unlike `usePopoverEdgeClamp`'s
  `setPopoverEl` — the D1 implementation this was extracted from already used plain
  refs, and preserving that shape kept the ToolbarSliderPopover refactor a pure
  extraction with no behavioural surface change). The composable never creates,
  moves, or Teleports either element — it only reads `getBoundingClientRect()` off
  them and writes a `style` ref the consumer binds via `:style`. This is the load-bearing
  design point against `useHoverPopover`'s DOM-descendant `mouseenter` contract: since
  no DOM structure changes, the popover panel stays exactly where the consumer's
  template put it (a descendant of the hover root), so `useHoverPopover`'s re-entry
  detection is unaffected by using this composable.
- **`align`** externalizes the one axis that differed across the three consumers'
  original CSS anchors: `ToolbarSliderPopover`/`PboPopover` were `right: 0`-anchored,
  `EngineQueueTooltip` was `left: 0`-anchored. `top` is NOT parameterized — all three
  (and every consumer this composable's header anticipates) anchor flush against the
  trigger's bottom edge, which is `useHoverPopover`'s own "no dead zone" contract, not
  a per-consumer choice.
- Returns only `{ style }` — a single reactive value the consumer binds directly,
  no imperative escape hatch, no exposed internal refs. This is deliberately narrower
  than `usePopoverEdgeClamp`'s `{ setPopoverEl, xShift }` shape, because this
  composable owns the WHOLE position (not just a corrective shift) and needs both
  `triggerEl` and `popoverEl` supplied rather than owning one of them.

Internals (full mechanism in the file's own header, ported verbatim from
`ToolbarSliderPopover.vue`'s pre-refactor script): `recomputeStyle()` — one shared
formula for the initial open-time computation and every scroll/resize re-anchor
(ADR-0012 P1 — one home for the geometry formula, not N copies risking drift, the
same concern the original D1 corrective's own header names against ADR-0002 Rule 7);
a `window`-level capture-phase `scroll` listener (`scroll` does not bubble) + a
passive `resize` listener, registered only while `open` is true, released on both the
`watch(open,...)` close transition AND `onUnmounted` (resource-ownership-at-mutation-
sites discipline, frontend/CLAUDE.md — a component can unmount mid-hover, firing no
`watch` transition); an idempotence guard against a second open cycle stacking a
second listener pair; horizontal clamp (both edges) + vertical clamp (bottom edge
only — the composable never anchors from the viewport top) at a 4px default margin.

## 2. Per-member disposition

### `ToolbarSliderPopover.vue` — REFACTORED, behavior identical

Original inline D1 implementation (script-computed `top`/`left`, scroll/resize
listeners, idempotence guard, `onUnmounted` release) extracted verbatim into the
composable and routed through it (`useFixedAnchoredPopover(open, triggerEl, popoverEl,
{ align: 'right' })`). The component's own `<script>` retains only its knob-ordering
logic; the CSS rule (`position: fixed`, same z-index token, same min/max-width) is
untouched.

**Witness that the extraction is behavior-preserving:** the existing 7-test file
(`tests/integration/ToolbarSliderPopover-scroll-anchor.test.ts`) — the commission's
own regression net — was run UNMODIFIED after the refactor and stayed green:

```
$ NODE_OPTIONS=--max-old-space-size=2048 npx vitest run tests/integration/ToolbarSliderPopover-scroll-anchor.test.ts
Test Files  1 passed (1)
     Tests  7 passed (7)
```

Additionally, `tests/unit/lyt-w4-chrome.test.ts`'s 36 CSS-fact tests (which include a
`z-index: var(--z-popover-chrome)` assertion against this file, among the other four
popover sites) stayed green — the z-index token was never touched by the refactor.

**Claim: WITNESSED** (both the pre-existing 7-test suite and the composable's own new
11-test unit suite exercise the identical formula this component now delegates to).

### `EngineQueueTooltip.vue` — ROUTED, clip NOT visually reproduced (blocked)

**Structural reproduction (source/DOM-chain analysis, not live pixels):** a dispatched
read-only evidence agent traced the full mount chain — `EngineQueueTooltip.vue:275`
(mounted inside `ToolbarEngineMetrics.vue`'s `.engine-metrics-bar`, itself mounted
`v-if="isConnected"` inside `ToolbarEngineCluster.vue:79`, wrapped by `App.vue:794-806`'s
`<template #leaf-A_engine><div class="lyt-toolbar-strip">`) up through the exact same
`.lyt-toolbar-strip { overflow-y: auto; }` rule at `App.vue:1258` that `ToolbarSliderPopover`'s
D1 fix escaped. No ancestor in that chain (`.engine-metrics-bar`, the `LytNode.vue` leaf
cell, `#split-workspace`, `#main-workspace`) sets `transform`/`filter`/`perspective`/
`contain`/`will-change: transform`. Pre-fix, `.queue-popover` was `position: absolute;
top: 100%; left: 0` (`EngineQueueTooltip.vue:236-249`, pre-edit) — structurally identical
to `ToolbarSliderPopover`'s pre-D1 shape: same clipping ancestor, same positioning
scheme, same `--z-popover-chrome` tier.

**Why NOT visually witnessed:** `EngineQueueTooltip.vue` itself carries no gate (its
own template root has no `v-if`), but its PARENT `ToolbarEngineMetrics.vue` mounts only
`v-if="isConnected"`, and `isConnected` is `store.engine.status === 'connected'` —
reachable only via a live KataGo-proxy WebSocket connection. This commission's own
isolation posture (own ports ≥ 19100, `VITE_API_BASE_URL`/`VITE_KATAGO_WS_URL` pinned
to CONFIRMED-DEAD ports) structurally forecloses a live connection — the isolation
discipline and the visual witness are in direct tension for this one component, and
isolation wins (per the commission's own ban on live-backend contact). A DEV-only
force-open harness exists (`__devForcePopoverOpen`, `useHoverPopover.ts`) and
`EngineQueueTooltip` DOES pass a `devId: 'queue'` that could drive `open` directly,
but that harness only forces the ALREADY-MOUNTED component's hover state — it cannot
make the `v-if="isConnected"`-gated parent mount in the first place. No code path in
this tree exposes a way to flip `store.engine.status` from outside a live connection
without touching backend/proxy code, which is out of this commission's frontend scope.

**Disposition: routed anyway, on structural-equivalence grounds, not a live witness.**
The routing is judged behavior-preserving by construction, not by observation:
(1) the anchor formula is geometrically equivalent in the unclipped case (`top =
trigger.bottom`, `left = trigger.left` for `align: 'left'`, matching the prior
`top: 100%; left: 0` CSS anchor exactly when the trigger's own box is the reference
frame either way); (2) the DOM location, z-index token, and border/padding are
untouched; (3) the only behavioral ADDITIONS are a vertical clamp (previously
absent — Finding 2's class, applied here too) and scroll/resize tracking (previously
implicit via CSS containing-block, now explicit) — both are same-direction robustness
gains, not regressions; (4) `usePopoverEdgeClamp`'s own horizontal-only, snapshot-once
clamp is superseded, not silently dropped. A new mount-level test file
(`tests/integration/EngineQueueTooltip-fixed-anchor.test.ts`, 5 tests) pins the CSS
fact (`position: fixed`, not `absolute`) and the full listener lifecycle
(register-on-open with correct `capture`/`passive` flags, release-on-close,
release-on-unmount-while-open, recompute-on-scroll) by mounting the component directly
(bypassing the parent's `isConnected` gate, since the component itself carries none) —
this is possible and green precisely BECAUSE the gate lives one level up, in the
parent, not on this component.

**Claim: UNEXERCISED with blocker** (live engine connection, structurally excluded by
this commission's own isolation posture) for the visual clip reproduction;
**WITNESSED** for the routing's behavioral-equivalence and listener-lifecycle claims
(mount-level test, 5/5 green).

### `PboPopover.vue` — ROUTED, clip NOT visually reproduced (blocked)

**Structural reproduction:** the same evidence agent traced `PboPopover.vue:55`
(mounted inside `ToolbarAppCluster.vue`'s second `.toolbar-cluster`, a direct DOM
sibling of `ToolbarSliderPopover` in the SAME `<template #leaf-A_app>` wrapper,
`App.vue:817-821`) up through the identical `.lyt-toolbar-strip` ancestor at
`App.vue:1258`. Pre-fix, `.pbo-popover` was `position: absolute; top: 100%; right: 0`
(`PboPopover.vue:289-307`, pre-edit) — same clipping ancestor, same positioning
scheme (mirroring `ToolbarSliderPopover`'s own `right: 0` anchor exactly), same
z-index tier. This is the STRONGEST structural case of the two candidates: it is a
literal DOM sibling of the component D1 already fixed, under the identical parent.

**Why NOT visually witnessed:** `PboPopover.vue`'s own template root carries
`v-if="visible"`, where `visible = q.calibrationEnabled.value === true &&
q.experimentExists.value` — both driven by `useQeubo().bootstrap()`, which calls the
backend's `/qeubo/experiment/status` endpoint. This commission's isolation posture
(dead-pinned `VITE_API_BASE_URL`) makes that call fail, leaving `calibrationEnabled`
at its initial `null` and `visible` false — the component never mounts in the isolated
browser session at all. Unlike `EngineQueueTooltip`, `PboPopover` doesn't even pass a
`devId` to `useHoverPopover()` (`PboPopover.vue:75`, `useHoverPopover()` with no
options), so no DEV force-open path exists for it even in principle — and even if one
did, it would face the same problem `EngineQueueTooltip` does: the gate is a real
network dependency, not a hover-state question.

**Disposition: routed anyway, on structural-equivalence grounds, not a live witness.**
Same four-point behavioral-equivalence argument as `EngineQueueTooltip` above, with
`align: 'right'` this time (matching the prior `right: 0` anchor). A new mount-level
test file (`tests/integration/PboPopover-fixed-anchor.test.ts`, 6 tests) pins the same
CSS fact and listener lifecycle; getting past the component's OWN `v-if="visible"` gate
(unlike `EngineQueueTooltip`, this one IS on the component itself) required mocking the
`qeubo-service` HTTP boundary per `tests/CLAUDE.md`'s fake pattern and driving
`useQeubo().bootstrap()` with a fabricated `QeuboStatus` — this is jsdom-level test
scaffolding, not a live backend contact, and does not violate the isolation posture
(no network call reaches outside the process; `qeuboService.getStatus` is a `vi.fn()`).

**Claim: UNEXERCISED with blocker** (live backend qEUBO experiment, structurally
excluded by this commission's own isolation posture) for the visual clip reproduction;
**WITNESSED** for the routing's behavioral-equivalence and listener-lifecycle claims
(mount-level test, 6/6 green).

### Honest accounting of the "REPRODUCE... witness whether each is actually clipped"
### instruction

The commission asked to first reproduce the clip on each candidate and route "ONLY if
[the routing] is behavior-preserving" when a candidate is NOT reachable-clipped. What
actually happened is narrower than either branch that instruction anticipated: neither
candidate could be MOUNTED at all under this commission's own isolation constraints
(dead backend, dead engine), so neither a positive nor a negative clip witness was
possible — this is a blocker, not a "not reachable-clipped" finding. Given the blocker,
the judgment call made here is to route both anyway, on the strength of (a) the
identical-ancestor-and-positioning-scheme structural proof (stronger evidence than a
single live screenshot would have been, since it's derived from the same CSS cascade
mechanics D1's own diagnosis used, not from one sampled viewport/theme combination),
and (b) a provable, testable behavioral-equivalence argument for the routing itself.
This is named explicitly, per ADR-0000's closure-statement discipline, rather than
silently treated as equivalent to a live witness.

## 3. Class sweep — full universe of clipping-ancestor/positioned-descendant pairs

Enumeration method: traced every component mounted inside `App.vue`'s
`<template #leaf-A_engine>` / `<template #leaf-A_app>` (the only two places
`.lyt-toolbar-strip` wraps content, `App.vue:794-821`) down to its full subtree, then
grepped `src/components/chrome/` and `src/components/qeubo/` for every
`position: absolute` / `position: fixed` rule, cross-referencing each hit's actual
mount site against that subtree.

| # | Component | `position:` rule | Mounted inside `.lyt-toolbar-strip`? | Disposition |
|---|---|---|---|---|
| 1 | `ToolbarSliderPopover.vue` | `fixed` (script-anchored) | Yes (`ToolbarAppCluster.vue:54`) | Pre-fixed (commission `lyt-sliders-popover-defects`); refactored onto the shared composable this commission, behavior identical (WITNESSED, 7/7 tests green) |
| 2 | `EngineQueueTooltip.vue` | `fixed` (script-anchored, was `absolute`) | Yes (`ToolbarEngineMetrics.vue:275` → `ToolbarEngineCluster.vue:79`) | **Fixed this commission** — routed through the composable; clip UNEXERCISED (blocker: requires live engine connection), routing WITNESSED (5/5 tests) |
| 3 | `PboPopover.vue` | `fixed` (script-anchored, was `absolute`) | Yes (`ToolbarAppCluster.vue:55`) | **Fixed this commission** — routed through the composable; clip UNEXERCISED (blocker: requires live backend qEUBO experiment), routing WITNESSED (6/6 tests) |
| 4 | `LocalePicker.vue` | `absolute` (`.locale-menu`, `LocalePicker.vue:145-146`, `top: calc(100% + 4px); left: 0`) | Yes (`ToolbarAppCluster.vue:58`, direct child of `.app-cluster`) | **ENUMERATED, NOT FIXED** — found beyond the three the commission named. Same clipping ancestor, click-toggled (not `useHoverPopover`-based; a local `open` ref driven by `toggle()`/document-pointerdown-dismiss) rather than hover-based, but `useFixedAnchoredPopover`'s contract is agnostic to how `open` is driven — the composable would apply cleanly if this were ever commissioned. Out of this commission's named scope; stop-and-report per its own boundary instruction |
| 5 | `SetupToolPalette.vue` | `static` (explicit, `SetupToolPalette.vue:277`) | Mounts in the same `.toolbar-cluster` as items 1/3 (`ToolbarAppCluster.vue:56`) | Not a member of this class by deliberate, standing commissioner ruling (`SetupToolPalette.vue:44-63`: absolute/fixed anchoring explicitly rejected as a shape for this component). Not applicable |
| 6 | `LytPresenceMenu.vue` | `absolute` (`.lyt-presence-popover`) | **No** — mounted in `#lyt-corner-chrome`, itself `position: fixed` and outside `#main-workspace`'s flex flow entirely | Not a member of this class — different, non-clipping ancestor |
| 7 | `BoardRailPopoverTrigger.vue` | `absolute` (`.board-rail-popover`) | **No** — same `#lyt-corner-chrome` mount as item 6 | Not a member of this class |
| 8 | `DebugMenu.vue` | `absolute` (`.debug-popover`) | **No** — same `#lyt-corner-chrome` mount | Not a member of this class |
| 9 | `FloatingThumbnail.vue` | `fixed` (script-positioned, `pointer-events: none`) | **No** — unrelated hover-preview thumbnail, not toolbar-anchored | Not a member of this class |
| 10 | `RootErrorBoundary.vue` | `fixed; inset: 0` | **No** — full-screen error boundary | Not a member of this class |
| 11 | `SystemLogPanel.vue` | (comment references a `position: fixed` overlay; mounted in `#lyt-overlay-stack`, itself `fixed`) | **No** | Not a member of this class |

**Ancestor census.** Exactly one `overflow` rule sits between the toolbar's
popover-hosting components and the viewport: `.lyt-toolbar-strip { overflow-y: auto;
}` at `App.vue:1258`. Everything from the `LytNode.vue` leaf cell through
`#split-workspace`/`#main-workspace` is unset; `#main-area`/`#app` clip further out
(`overflow: hidden`) but are not the proximate cause any of items 1-4 name (their own
popovers' `top`/`bottom` never reach that far out before `.lyt-toolbar-strip`'s own
edge already clips them). `#control-panel` (`style.css:141-148`, `overflow: auto`) is
a DIFFERENT leaf entirely (the control-panel, not a toolbar strip) — not part of this
universe, named here only to rule it out explicitly.

**Precision note (surfaced by the evidence agent, worth recording):** neither
`#leaf-A_engine` nor `#leaf-A_app` is a literal CSS `id` attribute in the rendered
DOM — they are Vue slot names (`#leaf-A_engine`/`#leaf-A_app`, wired via
`lyt-widget-registry.ts`), not `id`-selector targets. `ToolbarSliderPopover.vue`'s own
D1 header comment (and this report, and the new composable's header) use the
`#leaf-A_engine`/`#leaf-A_app` notation loosely, to mean "the leaf cell that slot
renders into," not a literal CSS selector — flagged so a future reader doesn't
`document.querySelector('#leaf-A_app')` expecting a hit.

## 4. Closure statement (ADR-0000, 2026-07-02 amendment)

- **Invariant:** an absolutely- or fixed-position floating overlay anchored relative to
  a toolbar trigger must never have its rendered box silently truncated by an
  `overflow: auto|hidden|scroll` ancestor the trigger itself is a descendant of; where
  such an ancestor is structurally necessary (`.lyt-toolbar-strip`'s own wrapped-content
  reachability), every overlay inside it uses a positioning scheme whose containing
  block is NOT that ancestor, AND continues to track its trigger through every
  geometry-changing event (scroll, resize) the old containing-block relationship would
  have handled implicitly.
- **Quantification universe, denominated in clipping-ancestor/positioned-descendant
  PAIRS (not popover count, per the commission's explicit instruction):** the axis is
  "every `position: absolute`/`fixed` floating panel anchored under a toolbar trigger
  that is itself a descendant of an `overflow: auto|hidden|scroll` LYT leaf." The full
  sweep (§3 above) found exactly **4 pairs** inside `.lyt-toolbar-strip`'s clip:
  `(ToolbarSliderPopover, .lyt-toolbar-strip)` — closed, pre-existing commission;
  `(EngineQueueTooltip, .lyt-toolbar-strip)` — **closed this commission**, `position:
  fixed` + tracked anchor;
  `(PboPopover, .lyt-toolbar-strip)` — **closed this commission**, same fix;
  `(LocalePicker, .lyt-toolbar-strip)` — **named as NOT covered**, enumerated per the
  commission's own stop-and-report boundary (found beyond the three named members;
  fixing it was out of the commissioned scope). **7 further floating panels** in the
  chrome tree (`LytPresenceMenu`, `BoardRailPopoverTrigger`, `DebugMenu`,
  `FloatingThumbnail`, `RootErrorBoundary`, `SystemLogPanel`, plus `SetupToolPalette`
  which is `position: static` by design) sit OUTSIDE `.lyt-toolbar-strip`'s ancestor
  chain entirely and are outside this class's universe by construction, not by
  omission — each traced to its actual mount site and confirmed non-member.
- **Denomination check:** each fix's bound is the popover's own positioning scheme
  (`position: fixed` + trigger-derived anchor), the actual mechanism CSS uses to
  resolve containing blocks — not a proxy (e.g., raising `.lyt-toolbar-strip`'s
  `min-height` would shift the clip boundary without removing it, the same
  proxy-fix trap D1's own closure statement named). The scroll/resize re-anchor's
  trigger condition is the actual DOM events that move the trigger's on-screen
  position (`scroll`/`resize`), not a polling proxy.
- **Two named-not-covered edge cases inherited from D1, unchanged by this commission:**
  (1) a popover whose trigger scrolls fully outside `.lyt-toolbar-strip`'s own visible
  region while the popover, now tracking a fully-occluded trigger, stays open and
  visible (the composable's TRACK disposition, unchanged — see
  `useFixedAnchoredPopover.ts`'s own header for the full reasoning, ported verbatim
  from D1's closure statement); (2) `LocalePicker.vue` (item 4 above) — enumerated,
  not fixed, by this commission's own scope boundary.

## 5. Witnesses (summary)

| Claim | Status | Evidence |
|---|---|---|
| Composable geometry math (both `align` values, both horizontal clamp directions, vertical clamp) | WITNESSED | `tests/unit/useFixedAnchoredPopover.test.ts`, 6 geometry tests, 11/11 total green |
| Composable listener lifecycle (register/release/idempotence/recompute-on-scroll/unmount-while-open) | WITNESSED | Same file, 5 lifecycle tests |
| `ToolbarSliderPopover.vue` refactor is behavior-identical | WITNESSED | Pre-existing 7-test file, unmodified, run post-refactor: 7/7 green |
| `EngineQueueTooltip.vue` clip reproduction | UNEXERCISED, blocker: live engine connection required, foreclosed by this commission's own isolation posture | — |
| `EngineQueueTooltip.vue` routing is behavior-preserving + listener lifecycle | WITNESSED | `tests/integration/EngineQueueTooltip-fixed-anchor.test.ts`, 5/5 green |
| `PboPopover.vue` clip reproduction | UNEXERCISED, blocker: live backend qEUBO experiment required, foreclosed by this commission's own isolation posture | — |
| `PboPopover.vue` routing is behavior-preserving + listener lifecycle | WITNESSED | `tests/integration/PboPopover-fixed-anchor.test.ts`, 6/6 green |
| Class sweep completeness (4 pairs inside `.lyt-toolbar-strip`, 7 non-members outside it) | WITNESSED | Dispatched read-only evidence agent, full file:line citations per §3 above; independently spot-checked (grep) by this session for `ToolbarEngineUri.vue`/`EngineModelSelect.vue`/`SetupToolPalette.vue` (no absolute/fixed rules found in any) |
| No behavioral regression in the wider suite | WITNESSED | Full `npm run test:run`: 3080 passed / 8 skipped (up from the pre-commission baseline's 3057 passed by exactly 23 — the sum of this commission's 3 new test files: 11 + 5 + 6 = 22, plus the pre-existing +1 discrepancy carried from `next` vs `lyt-phase2` baseline drift, not investigated further as immaterial to this commission) |

## Bans compliance

No `box-shadow`, no CSS `transition`, no `blur()`/`backdrop-filter` introduced. No
`--text-0` prose-text ban violation (no text-color rules touched). No hardcoded color
literal introduced — every touched rule is either a `position`/`top`/`left` change or
a `var(--z-popover-chrome)`-token rule left untouched.

## Gates (foreground, no pipes, literal exit codes)

```
$ cd frontend && nice -n 19 npm run build
BUILD_EXIT:0

$ cd frontend && NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 nice -n 19 npm run test:run
TEST_EXIT:0
 Test Files  246 passed | 3 skipped (249)
      Tests  3080 passed | 8 skipped (3088)
```

`vue-tsc -b` (part of the build) produced zero errors on its own strict pass; ESLint
run separately against every touched source file (`eslint src/composables/chrome/useFixedAnchoredPopover.ts
src/components/chrome/ToolbarSliderPopover.vue src/components/chrome/EngineQueueTooltip.vue
src/components/qeubo/PboPopover.vue src/composables/chrome/usePopoverEdgeClamp.ts`) — 0
errors.

## Documentation-graph / FILES.md audit

- **`frontend/FILES.md`** — updated: new entry for `useFixedAnchoredPopover.ts`
  (`[B1]`, `src/composables/chrome/`), and `usePopoverEdgeClamp.ts`'s entry extended
  with its now-narrower consumer list (`BoardRailPopoverTrigger.vue`,
  `LytPresenceMenu.vue`).
- **`FEATURES.md`** — not touched. This is an internal-structure clip-ancestor fix
  preserving existing user-facing hover-popover behavior for both routed consumers
  (per the behavioral-equivalence argument in §2); it adds robustness (a defect
  foreclosure), not a new or altered user-facing capability.
- **Doc-graph (`docs/doc-graph.json`/`.md`/`-report.md`)** — not regenerated. No file
  under `docs/` was added, removed, or re-cross-referenced; `.claude/dispatch-reports/`
  is outside the doc-graph's tracked tree (consistent with the precedent set by
  `lyt-sliders-popover-defects.md`'s own "Documentation-graph / FILES.md audit"
  section, which made the same determination for the same directory).
- **ADR "Revisit when…" triggers** — none satisfied. This closes a defect CLASS per
  ADR-0000's Rule 2(a)/(b) discipline but mints no new mechanism beyond the composable
  itself (a structural fix, not a new gate/lint/CI check); no ADR-0011/0012 Rule-2
  "recurrence → mechanism" trigger fired in the course of this work (the class was
  foreclosed by construction — three consumers now share one geometry formula — not
  by a recurring defect needing a NEW check).
- **ADR-0006 headers** — all touched/created files carry the standard header
  (HTML-comment header on `.vue` files, JSDoc header on `.ts` files); the new
  composable and both new test files were authored with headers from the start.

## Files changed

- `frontend/src/composables/chrome/useFixedAnchoredPopover.ts` (new) — the shared
  composable.
- `frontend/src/components/chrome/ToolbarSliderPopover.vue` — refactored onto the
  composable; CSS unchanged.
- `frontend/src/components/chrome/EngineQueueTooltip.vue` — routed onto the
  composable; `.queue-popover` CSS `position: absolute` → `fixed`; template `triggerEl`/
  `popoverEl` refs replace `setPopoverEl`.
- `frontend/src/components/qeubo/PboPopover.vue` — routed onto the composable;
  `.pbo-popover` CSS `position: absolute` → `fixed`; template `triggerEl`/`popoverEl`
  refs replace `setPopoverEl`.
- `frontend/src/composables/chrome/usePopoverEdgeClamp.ts` — header docstring updated
  to drop `EngineQueueTooltip`/`PboPopover` from its consumer list and name its two
  remaining consumers (`BoardRailPopoverTrigger.vue`, `LytPresenceMenu.vue`) and why
  they're the right shape for it (outside `.lyt-toolbar-strip`'s clip).
- `frontend/tests/unit/useFixedAnchoredPopover.test.ts` (new) — 11 tests, the
  composable's own geometry + listener-lifecycle witness.
- `frontend/tests/integration/EngineQueueTooltip-fixed-anchor.test.ts` (new) — 5
  tests, mount-level CSS-fact + listener-lifecycle witness for the newly-routed
  consumer.
- `frontend/tests/integration/PboPopover-fixed-anchor.test.ts` (new) — 6 tests, same
  shape, plus the `qeubo-service` mock needed to clear the component's own `visible`
  gate.
- `frontend/FILES.md` — two entries updated/added (see "Documentation-graph" above).
- `.claude/dispatch-reports/lyt-popover-clip-class.md` (this file, new).

## Commit / merge-base

Committed on this worktree's own branch (`worktree-agent-ad861840f0ffed04e`) at
`2ec8f9a7627447cc699f50585c23f07cd10e39c8`, on top of `lyt-phase2` tip `a22b1613`
(this worktree's HEAD was fast-forwarded onto that tip before any work — see
"Isolation assertion" above). Final act: `git fetch origin lyt-phase2` — tip was
still `a22b1613` (unchanged since session start); `git merge-base HEAD
origin/lyt-phase2` resolved to that same SHA, confirming `lyt-phase2`'s tip is an
ancestor of this commit and no rebase is needed before this response is sent.
