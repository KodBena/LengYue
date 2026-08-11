# lyt-sliders-popover-defects — build report

Commission: two live defects in the Sliders popover (`src/components/chrome/ToolbarSliderPopover.vue`),
reported by the commissioner 2026-08-11 with screenshots on his wiki, against
branch `lyt-phase2` (base commit `cb15d69c`, the post-toolbar-restructure state —
`Toolbar.vue` retired, the sliders trigger now lives under `ToolbarAppCluster.vue`).
A prior builder session had started D1's diagnosis and left a partial diff at
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/sliders-partial-diff.patch`
but died before committing; this session owns the commission fresh, verifying that
diff's claims against the current tree rather than trusting it.

## Isolation assertion

Worktree HEAD was rebased onto `lyt-phase2` tip (`cb15d69c782cdbf93d3f37f361bca51829d01e50`)
before any work — the worktree branch started one merge-base behind. Dead-port probes,
run before starting the isolated dev server:

```
$ timeout 2 bash -c 'echo > /dev/tcp/127.0.0.1/19190' ; echo "exit:$?"
bash: connect: Connection refused
bash: line 1: /dev/tcp/127.0.0.1/19190: Connection refused
exit:1

$ timeout 2 bash -c 'echo > /dev/tcp/127.0.0.1/19191' ; echo "exit:$?"
bash: connect: Connection refused
bash: line 1: /dev/tcp/127.0.0.1/19191: Connection refused
exit:1

$ timeout 2 bash -c 'echo > /dev/tcp/127.0.0.1/19100' ; echo "19100 exit:$?"
bash: connect: Connection refused
bash: line 1: /dev/tcp/127.0.0.1/19100: Connection refused
19100 exit:1
```

19190/19191 confirmed unreachable before being pinned as `VITE_API_BASE_URL` /
`VITE_KATAGO_WS_URL`; 19100 confirmed free before being claimed as the dev-server
port. Server was launched as:

```
VITE_API_BASE_URL=http://127.0.0.1:19190 VITE_KATAGO_WS_URL=ws://127.0.0.1:19191 \
  nice -n 19 npx vite --port 19100 --strictPort
```

No contact was made with 4173/5173/5174/8764/1235/1242 at any point. The server was
killed and the port reconfirmed unreachable at session end.

## D1 — occlusion (WITNESSED, fixed)

### ADR-0000 two questions (asked before the fix)

**(a) What type/structure forecloses the class?** The defect is a positioning-scheme
mismatch: an absolutely-positioned popover's containing block is its nearest
positioned ancestor, and any ancestor between it and that containing block that sets
`overflow: auto`/`hidden`/`scroll` clips the popover's paint regardless of z-index —
CSS gives no type-level guard against this, only a *positioning-scheme choice*.
`position: fixed` establishes the containing block at the viewport (absent a
`transform`/`filter`/`perspective`/`contain`/`will-change: transform` ancestor,
verified none exist on this chain), which is the structural fix: it removes the
popover from the ancestor-clip's participation set entirely rather than guarding
against clipping after the fact.

**(b) What operational lapse let it recur?** `usePopoverEdgeClamp`'s own docstring
frames its `position: absolute` + `transform: translateX` contract as the house
style for "toolbar-shaped hover popovers" without naming the ancestor-overflow
precondition that contract silently depends on. The LYT toolbar ontology reencode
(2026-08-11, ledger rows 1930/1931) introduced `.lyt-toolbar-strip { overflow-y:
auto }` as a *correct* fix for a different problem (the toolbar's own wrapped
content must stay scrollable, not silently clipped, at narrow heights) without an
explicit check of what else lives inside that leaf and how each is positioned — the
composable's consumers were not walked at that time. No mechanism connects "an
ancestor gains `overflow: auto`" to "audit descendant popovers anchored via
`position: absolute` inside it"; this is currently review-only, per ADR-0000 Rule 2's
own honest admission that the reflex is review-only until a recurrence mints a
mechanism (Rule 2(b), Revisit #3).

### Diagnosis

**Verdict on the prior session's diff: confirmed correct, adapted rather than
applied verbatim** (the toolbar restructure had changed surrounding code — the
`<div class="sliders-metric">` root moved from a direct `Toolbar.vue`-mounted
`.metric` sibling to `ToolbarAppCluster.vue`'s `toolbar-cluster`, and the trigger
had already been promoted from `<div>` to `<button>` under W4 item 2, none of which
the patch's line-context anticipated, but its causal claim held unchanged).

`.sliders-popover` was `position: absolute; top: 100%; right: 0` inside
`.sliders-metric` (`position: relative`), itself nested inside `App.vue`'s
`.lyt-toolbar-strip` (`#leaf-A_app`), which carries `overflow-y: auto` — added in
the LYT toolbar ontology reencode so the toolbar strip's *own* wrapped content stays
reachable by scroll rather than clipped. That ancestor clip applies to every
painted descendant regardless of `z-index`, including an absolutely-positioned
popover child. `--z-popover-chrome` was already correct — this was never a
stacking-order problem.

Confirmed via the witness script's own diagnostic capture (`.sliders-popover`'s
`position: fixed` bottom edge reaches 364–377px while `.lyt-toolbar-strip`'s own
bottom sits at 60px — had the popover remained `position: absolute`, its box would
have been clipped at that 60px boundary, cutting off all but the first knob row,
consistent with the commissioner's "~17px past the strip's bottom edge at 1400x900"
report for the shallower pre-full-registry state).

### Fix

`position: fixed` on `.sliders-popover`, escaping `.lyt-toolbar-strip`'s clip
entirely (a `fixed` box's containing block is the viewport, confirmed no ancestor
sets `transform`/`filter`/`perspective`/`contain`/`will-change: transform`). DOM
location is unchanged (no Teleport) — `useHoverPopover`'s contract requires the
popover stay a DOM descendant of the hover root so `mouseenter` re-entry from the
popover itself is caught. Anchor math moved into `<script>`: a `watch(open, ...)`
computes `top`/`left` from the trigger's `getBoundingClientRect()` once the popover
mounts (`nextTick`), right-aligned to the trigger (matching the prior `right: 0`
anchor) with a 4px viewport-edge clamp on `left` — this subsumes
`usePopoverEdgeClamp`'s horizontal-clamp duty for this one consumer, since that
composable's `transform: translateX` contract doesn't apply to a `fixed` consumer.
`ToolbarSliderPopover.vue` no longer imports `usePopoverEdgeClamp`;
`useHoverPopover` is untouched.

File: `frontend/src/components/chrome/ToolbarSliderPopover.vue`.
`frontend/src/composables/chrome/usePopoverEdgeClamp.ts`'s header docstring updated
to drop `ToolbarSliderPopover` from its consumer list and name why (the file's
behaviour is otherwise untouched — still serves `EngineQueueTooltip` / `PboPopover`
unchanged).

### Class question — sibling popovers/overlays sitting inside the same clipping ancestor

Enumerated, not fixed (commission scope: fix only D1's instance unless another is
*also witnessed-broken*):

| Component | Mounts inside `.lyt-toolbar-strip`? | Positioning | Shares `usePopoverEdgeClamp`? | Witnessed broken? |
|---|---|---|---|---|
| `EngineQueueTooltip.vue` | Yes (`ToolbarEngineMetrics` → `ToolbarEngineCluster` → `#leaf-A_engine`) | `position: absolute` (line 237) | Yes | **UNEXERCISED** — not driven this session; same structural shape as D1 pre-fix (absolute popover, clipping ancestor), so same-class risk, but not visually confirmed |
| `PboPopover.vue` | Yes (`ToolbarAppCluster` → `#leaf-A_app`, sibling of the fixed component) | `position: absolute` (line 290) | Yes | **UNEXERCISED** — same reasoning as above |
| `SetupToolPalette.vue` | Yes (same leaf as `PboPopover`) | `position: static`, docked in normal flow (commissioner ruling, ledger rows 603/604) — explicitly rejected `position: absolute` as an anchor shape for this component | No | Not applicable — structurally not a member of this class; never floats |

`EngineQueueTooltip` and `PboPopover` are the two real candidates for the same
defect class (absolutely-positioned popover, `usePopoverEdgeClamp` consumer,
mounted inside a `.lyt-toolbar-strip` leaf). Neither was driven visually this
session — per the commission's stop-and-report instruction, they are named here
rather than fixed. Both are smaller-content popovers than the Sliders panel (a
single tooltip card / a fixed-size PBO panel vs. an 11-knob list), so they may not
reach the ancestor's clip boundary in practice, but that is an unverified
assumption, not a witnessed finding — flagging it as such rather than asserting
either way.

### Closure statement (ADR-0000, 2026-07-02 amendment)

- **Invariant:** an absolutely- or relatively-anchored floating overlay's rendered
  box must never be truncated by an ancestor's `overflow: auto|hidden|scroll` short
  of the overlay's own content bounds; where such an ancestor is structurally
  necessary (as `.lyt-toolbar-strip`'s is, for its own wrapped-content reachability),
  the overlay must use a positioning scheme whose containing block is *not* that
  ancestor.
- **Quantification universe:** the axis here is "which chrome overlays are
  descendants of a `overflow: auto` LYT leaf and anchored via `position: absolute`
  relative to something inside it." Enumerated instances: `ToolbarSliderPopover`
  (fixed, this commission), `EngineQueueTooltip` and `PboPopover` (same shape,
  **named as not covered** — unwitnessed, out of this commission's scope per its own
  stop-and-report instruction). `SetupToolPalette` is not in this universe (never
  floats, by standing commissioner ruling). No other toolbar-adjacent floating
  overlay was found sitting inside `.lyt-toolbar-strip`'s subtree — `LytPresenceMenu`,
  `BoardRailPopoverTrigger`'s panel, and `DebugMenu` mount elsewhere in `App.vue`,
  outside `.lyt-toolbar-strip` (not audited in depth for their own ancestor chains,
  since they're structurally outside this defect's universe).
- **Denomination check:** the fix's bound (the popover's positioning scheme) is
  denominated in the actual mechanism that causes clipping (containing-block
  resolution under CSS's positioning rules), not a proxy (e.g., "give the toolbar
  strip a taller `min-height`" would have been a proxy fix that shifts the clip
  boundary without removing it).

## D2 — non-theme-aware label (WITNESSED, fixed)

### ADR-0000 two questions (asked before the fix)

**(a) What type/structure forecloses the class?** "Readable text is ALWAYS
`--text-0`" is a project-wide standing rule (per user memory / project convention),
but CSS has no type-level mechanism that enforces "every text-bearing element
inherits or declares a themed color" — inheritance is the *usual* delivery
mechanism, and it silently breaks at any UA-default-color element (`<button>`,
`<input>`, `<select>`) that doesn't explicitly re-declare `color`. The foreclosing
discipline is therefore a **construction-site convention**: every interactive
control that introduces a new inheritance boundary (a `<button>`/`<input>`/`<select>`
promoted from a non-form element) must explicitly set `color: var(--text-0)` at
that boundary, the same way `BoardRailPopoverTrigger.vue`'s `.board-rail-trigger`
already does. This is not mechanically enforceable in CSS itself; a lint rule
flagging a `<button>`/`<input>` selector block with no `color` declaration in its
own scoped `<style>` is the nearest mechanical analogue, named here as a possible
Rule 2(b) answer but not built (see below).
**(b) What operational lapse let it recur?** The W4 item 2 div-to-button promotion
(commissioner-directed, "a real labeled button not raw text") changed the element's
inheritance behavior as a side effect of a semantics-motivated change, and nothing
in that review pass re-checked color inheritance at the new form-control boundary —
the same class of "correct-looking code whose scope silently differs from intent,
latent until a consumer with a different lifecycle arrives" the frontend
`CLAUDE.md`'s "Vue/CSS footgun checklist" already names for other cases, but this
specific shape (element-type promotion breaking color inheritance) isn't on that
checklist. No mechanism catches it; it is review-only.

### Diagnosis

`.sliders-trigger` is a `<button>` (promoted from `<div>` in W4 item 2, same
commit range). Browsers apply a UA-stylesheet default (`color: buttontext`,
effectively black) to form controls unless overridden; `.sliders-trigger .m-val`
had its own `color: var(--text-0)` rule, but nothing set `color` on
`.sliders-trigger` itself or on `.m-lbl` (the "SLIDERS" text), so the label
silently rendered at the UA black default — invisible against `--surface-0`
(near-black in the dark theme) and simply wrong-per-standing-rule in every other
theme.

**Pre-existing verdict: NOT pre-existing as a *visible* defect — a lyt-phase2
regression.** Read-only diff against `next` (`git show
next:frontend/src/components/chrome/ToolbarSliderPopover.vue`) shows the same root
carried as `<div class="metric sliders-metric">` with a bare `<span class="m-lbl">`
— no button, no UA form-control color reset. The `color` gap on `.m-lbl` was
already latent on `next` (same missing declaration), but a `<div>`/`<span>` chain
inherits ambient `color` from context rather than resetting to a UA default, so it
never surfaced visibly there. The div-to-button promotion on `lyt-phase2` (W4 item
2) turned the latent gap into a visible defect — confirmed, not assumed.

### Fix

`color: var(--text-0);` added to `.sliders-trigger` (covers `.m-lbl` and any future
text child, not just `.m-lbl` alone — same convention
`BoardRailPopoverTrigger.vue`'s `.board-rail-trigger` uses). No new hardcoded
color introduced; the fix is a token reference.

### Closure statement

- **Invariant:** every text-bearing interactive control declares (directly or via
  an unbroken inheritance chain from a declaring ancestor) `color: var(--text-0)`
  somewhere between itself and the nearest UA-default-resetting boundary.
- **Quantification universe:** the axis is "form-control elements
  (`<button>`/`<input>`/`<select>`/`<textarea>`) promoted from a non-form element or
  newly authored, whose scoped stylesheet doesn't declare `color`." This commission
  did not sweep the tree for other instances of this specific shape (div-to-button
  promotions elsewhere) — **named as not covered**, filed here as a gap rather than
  silently left; the broader census below covers the *sibling* axis (hardcoded
  color literals generally), which is a related but distinct axis from "missing
  color declaration on a form control."
- **Denomination check:** the fix sets `color` to the actual token the standing
  rule names (`--text-0`), not a literal color value that happens to look right in
  one theme.

## Census — hardcoded color literals styling readable text/backgrounds (frontend/src, excluding generated files, tests, theme.css)

Per commission: report only, fix only the D2 instance above. No sweeping refactor
proposed.

| File:line | Literal | What it styles | Notes |
|---|---|---|---|
| `components/chrome/RootErrorBoundary.vue:80` | `#ff7070` | `.reb-title` — error boundary panel heading text | Already carries an explicit `theme-exception` doc comment (lightened-attention variant, no substrate anchor) |
| `components/chrome/RootErrorBoundary.vue:85` | `#ff8888` | `.reb-message` — error stack-trace text | Same theme-exception family as above |
| `components/chrome/RootErrorBoundary.vue:94` | `#5bc0ff` | `.reb-reload:hover` — reload button hover background | Documented as sharing a variant with `MintCardModal`'s `btn-submit` hover |
| `components/modals/LoginModal.vue:215` | `#4a2020` / `#6a3030` / `#ffaaaa` | `.btn-danger` — sign-out button background/border/text | Documented `theme-exception`: "muted destructive-button aesthetic," no tinted-state substrate anchor yet |
| `components/editors/RegistryEditor.vue:389` | `#fbbf24` | `.modified-dot` — "field modified" indicator dot background | Documented `theme-exception` (Tailwind amber-400); note directly above (line 414) records a *prior* incident of near-identical shape to D2 — amber-400 text was unreadable on the cluster theme and was moved off text entirely onto this dot-only indicator |
| `components/editors/RegistryEditor.vue:429` | `#f472b6` | `.ref-icon` — "symbolic reference" glyph (λ) text color | Documented `theme-exception` (Tailwind pink-400); readable text, not contrast-verified against every theme in this session |
| `components/editors/RegistryEditor.vue:430` | `#f472b6` | `.ref-input` — symbolic-reference input text color, italic | Same literal/exception as above; this is the row closest in shape to D2 (a hardcoded literal on readable input text) — flagged for the commissioner's attention, not fixed here (out of scope) |
| `components/chrome/ToolbarEngineMetrics.vue:318` | `#00ff88` | `.watchdog-dot` — engine watchdog liveness indicator color | Documented magic-literal comment: "in-codebase liveness-OK convention," distinct from `--state-attention` |
| `components/chrome/ToolbarEngineMetrics.vue:346` | `#00ff88` | `@keyframes` `from { color }` — watchdog pulse animation start state | Same convention as above, animation-keyframe register |
| `components/wizard/steps/PvAnimationPreview.vue:98` | `#000` / `#fff` | `.pv-stone.is-black` — PV preview stone chip (black) background+text | Domain-representational: depicts an actual Go stone's color, not themed chrome text |
| `components/wizard/steps/PvAnimationPreview.vue:99` | `#fff` / `#000` | `.pv-stone.is-white` — PV preview stone chip (white) background+text | Same as above, white stone |
| `components/board/StatusBar.vue:368` | `#000` | `.stone-chip--black` — status-bar turn-indicator chip background | Domain-representational (Go stone color), not chrome text |
| `components/board/StatusBar.vue:369` | `#fff` | `.stone-chip--white` — status-bar turn-indicator chip background | Same as above |
| `components/chrome/SetupToolPalette.vue:343` | `#111` / `#000` | `.swatch.black` — setup-tool palette stone-color swatch background/border | Domain-representational |
| `components/chrome/SetupToolPalette.vue:344` | `#fff` / `#aaa` | `.swatch.white` — setup-tool palette stone-color swatch background/border | Domain-representational |
| `components/tree/HorizontalTimelineVisualizer.vue:430` | `#020617` | `.timeline-container` — timeline chrome background | Documented as a deliberate "slate aesthetic" chrome choice, explicitly called out as not theme-swapping |
| `components/tree/HorizontalTimelineVisualizer.vue:449` | `#94a3b8` | `.grid-line` — timeline gridline background | Same slate-aesthetic family |
| `components/tree/HorizontalTimelineVisualizer.vue:506` | `#f8bdf8` | `.handle-bar` — timeline selection-handle background | Same file, same undocumented-per-line but file-level-documented aesthetic |
| `components/charts/ColorDebugStrip.vue:116` | `#050505` | `.clean-bg` — LUT debug-strip backdrop | Documented `theme-exception`: deliberate "neutral dark" backdrop tuned for LUT readability, out of chrome-substrate scope per plan §E |
| `assets/css/style.css:195` | `#add8e6` | `input[type=range]::-webkit-slider-runnable-track` — native range-slider track background | Legacy cross-browser slider polyfill styling, not component-scoped |
| `assets/css/style.css:205` | `#808080` | `input[type=range]::-webkit-slider-thumb` — native range-slider thumb background | Same file/family |
| `assets/css/style.css:212` | `#808080` | `input[type=range]:focus::-webkit-slider-thumb` — focus outline color | Same family |
| `assets/css/style.css:219` | `#add8e6` | `input[type=range]::-moz-range-track` — Firefox range-slider track background | Same family, Firefox variant |
| `assets/css/style.css:226` | `#808080` | `input[type=range]::-moz-range-thumb` — Firefox range-slider thumb background | Same family |

**Observations for the commissioner, not rulings:** most rows already carry an
explicit `theme-exception` doc comment — a documented, deliberate deviation, distinct
in kind from D2 (which was an *undocumented, unintentional* gap). The
`RegistryEditor.vue` `.ref-input`/`.ref-icon` row is the one that reads closest to
D2's shape (a hardcoded literal directly on readable text, with a *prior* sibling
incident already recorded in the same file for `.modified-dot`'s neighbor). The
`stone-chip`/`swatch`/`pv-stone` rows are domain-representational (an actual Go
stone's black/white color), which arguably sit outside "readable text/background"
in spirit even though they matched the grep pattern — included for completeness
per the commission's literal scope, not because they're mis-styled.

## Bans compliance

No `box-shadow`, no CSS `transition`, no `blur()`/`backdrop-filter`, no new
hardcoded color literal introduced. `color: var(--text-0)` (D2) and `position:
fixed` + script-computed `top`/`left` (D1) are the only behavioral changes; both
are token references / positioning-scheme changes, not new literals.

## Visual verification

Isolated dev server, `VITE_API_BASE_URL`/`VITE_KATAGO_WS_URL` pinned to confirmed-
dead `127.0.0.1:19190`/`19191` (see Isolation assertion above). Playwright driven
via `playwright-core` (already a transitive dependency; no new package installed)
against the machine's cached chromium binary
(`~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome`), launched under:

```
systemd-run --user --scope -p MemoryMax=4G -- nice -n 19 node witness-sliders-tmp.mjs
```

with `--js-flags=--max-old-space-size=1024` passed to the chromium launch args. One
`browser.close()` in a `finally` block; no `ulimit -v`; no `waitForTimeout`/wall-clock
sleeps — waits are `waitForSelector`/`waitForFunction`/`locator...waitFor` polling on
DOM/style state (the login-modal dismiss, the popover's mount, and the fixed-position
style settling). The backend being unreachable (by design) surfaces `LoginModal.vue`
as a blocking backdrop; it was dismissed via `Escape` (its own documented dismiss
path, `useModalKeyboard`) rather than routed around.

Both themes (`'dark'` and `'cluster'` — the actual `Theme` union is `'dark' |
'cluster'`, not `'dark' | 'light'`; confirmed against
`WizardStepTheme.vue`'s `THEME_OPTIONS`) × both viewports (1400×900, 1920×1080) — 4
runs, all green:

```
RESULT theme=dark viewport=1400x900 {"popoverPosition":"fixed","popoverRect":{"top":159,"bottom":364,"left":501.1875,"right":1021.1875},"stripRect":{"top":0,"bottom":60},"viewportHeight":900,"viewportWidth":1400,"overflowsPastViewportBottom":false,"overflowsPastStripBottom":true,"labelColor":"rgb(255, 255, 255)","triggerColor":"rgb(255, 255, 255)","text0Token":"#fff","surface0Token":"#000"}
RESULT theme=dark viewport=1920x1080 {"popoverPosition":"fixed","popoverRect":{"top":172,"bottom":377,"left":855.1875,"right":1375.1875},"stripRect":{"top":0,"bottom":60},"viewportHeight":1080,"viewportWidth":1920,"overflowsPastViewportBottom":false,"overflowsPastStripBottom":true,"labelColor":"rgb(255, 255, 255)","triggerColor":"rgb(255, 255, 255)","text0Token":"#fff","surface0Token":"#000"}
RESULT theme=cluster viewport=1400x900 {"popoverPosition":"fixed","popoverRect":{"top":159,"bottom":364,"left":501.1875,"right":1021.1875},"stripRect":{"top":0,"bottom":60},"viewportHeight":900,"viewportWidth":1400,"overflowsPastViewportBottom":false,"overflowsPastStripBottom":true,"labelColor":"rgb(11, 0, 27)","triggerColor":"rgb(11, 0, 27)","text0Token":"rgba(11, 0, 27, 1)","surface0Token":"rgba(254, 218, 247, 1)"}
RESULT theme=cluster viewport=1920x1080 {"popoverPosition":"fixed","popoverRect":{"top":172,"bottom":377,"left":855.1875,"right":1375.1875},"stripRect":{"top":0,"bottom":60},"viewportHeight":1080,"viewportWidth":1920,"overflowsPastViewportBottom":false,"overflowsPastStripBottom":true,"labelColor":"rgb(11, 0, 27)","triggerColor":"rgb(11, 0, 27)","text0Token":"rgba(11, 0, 27, 1)","surface0Token":"rgba(254, 218, 247, 1)"}
```

`labelColor`/`triggerColor` equal `text0Token` in both themes (D2). `popoverPosition:
"fixed"` and `overflowsPastViewportBottom: false` in every run, while
`overflowsPastStripBottom: true` throughout — the popover's actual box (up to
377px deep) is well past where `.lyt-toolbar-strip`'s own box ends (60px), which is
exactly the clip boundary the pre-fix `position: absolute` popover would have hit
(D1). Screenshots (all four runs) at
`.claude/dispatch-reports/lyt-sliders-popover-defects-{dark,cluster}-{1400x900,1920x1080}.png`
— visually confirm the full 11-knob panel renders unclipped with a legible label in
both themes.

**Evidentiary status: WITNESSED** for both D1 and D2, at both themes and both
viewports.

## Gates

```
$ cd frontend && nice -n 19 npm run build
BUILD_EXIT:0

$ cd frontend && NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 nice -n 19 npm run test:run
TEST_EXIT:0
 Test Files  242 passed | 3 skipped (245)
      Tests  3050 passed | 8 skipped (3058)
```

Both run in the foreground, to completion, literal exit codes captured above.
(`node_modules` was not present in the fresh worktree; `npm install` was run once,
first, before either gate — no `package.json`/lockfile changes resulted.)

## Documentation-graph / FILES.md audit

No files created, moved, deleted, or re-cross-referenced; no ADR "Revisit when…"
trigger satisfied by this change; `FEATURES.md` not touched (bug fix preserving
existing behavior, not a new/altered user-facing capability per its own "when to
update" bar); `frontend/FILES.md` not touched (no band change — both touched files'
existing entries still describe them accurately: a toolbar chrome popover and a
chrome popover-geometry composable). Both touched files already carry ADR-0006
headers (an HTML-comment file header on the `.vue` file, a JSDoc header on the
`.ts` file) predating this change; both were extended in place rather than
replaced. No doc-graph structural change (no doc added/removed/re-cross-referenced).

## Files changed

- `frontend/src/components/chrome/ToolbarSliderPopover.vue` — D1 fix (`position:
  fixed` + script-computed anchor, drop `usePopoverEdgeClamp`), D2 fix (`color:
  var(--text-0)` on `.sliders-trigger`).
- `frontend/src/composables/chrome/usePopoverEdgeClamp.ts` — header docstring
  updated to drop `ToolbarSliderPopover` from its consumer list (behavior
  unchanged; still serves `EngineQueueTooltip`/`PboPopover`).

## Commit / merge-base

Committed on this worktree's own branch. Final rebase-check performed as the last
act — see the commit log below for the resulting SHA and the merge-base-vs-tip
comparison.
