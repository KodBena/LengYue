# wiki2 board-chrome build — report

Builder session, worktree `.claude/worktrees/agent-a446468dacebc53f3`,
branch `worktree-agent-a446468dacebc53f3`. Three commissioned items,
implemented as specified with one disclosed name substitution (item 2).

## Base freshness

Worktree HEAD (`3378806f`) was an ancestor of `origin/next`
(`c8851986`) — stale, per the standing worktree-staleness pattern.
Rebased cleanly onto `origin/next` before any work
(`git rebase origin/next`, no conflicts).

## Reading discipline (ADR-0002 corollary)

Read end-to-end before implementing: `frontend/CLAUDE.md`, the
umbrella `CLAUDE.md`, `docs/adr-synopsis.md`, `frontend/tests/CLAUDE.md`
(loaded when the pointer-target test needed extending). Checked
`docs/dispatch/` for open items addressed to frontend — the five
present (`backend-to-frontend-card-metadata-inline-edit-{status,arc1
-shipped,arc2-shipped}.md`, `proxy-to-frontend-learned-vf.md`,
`proxy-to-frontend-selector-and-capabilities-status.md`) are all
closed/acknowledged status records unrelated to board chrome — none
open, none blocking.

---

## Item 1 — `wiki2-board-action-btn-height`

**Claim: WITNESSED.** The fix is source-pinned and gate-verified below.

`SidebarWidget.vue`'s `.board-action-btn` had a literal `height: 20px`.
Replaced with the same content-derived idiom the codebase's own
`.toolbar-btn` (`Toolbar.vue`) already uses: no fixed-height
declaration, `min-height: 24px` (the WCAG 2.5.8 floor, satisfying the
standing `tests/unit/pointer-target-minimum-size.test.ts` requirement)
as the actual determinant of rendered height at this font-size/padding,
plus `display: flex; align-items: center; justify-content: center;`
for vertical centering now that height isn't fixed.

Added a matching witness block to
`tests/unit/pointer-target-minimum-size.test.ts` (source-text
assertion, Tier 1, same shape as the file's existing `.toolbar-btn`
block): asserts `min-height >= 24px` present and no bare `height:`
declaration remains (comments stripped before the regex check, after
an initial false-positive where the rule's own doc comment mentioning
the retired `height: 20px` literal tripped the assertion — fixed by
comment-stripping rather than avoiding the word in prose).

Files: `frontend/src/components/chrome/SidebarWidget.vue`,
`frontend/tests/unit/pointer-target-minimum-size.test.ts`.

---

## Item 2 — `wiki2-status-bar-reparent`

**Claim:** WITNESSED (typecheck + full suite green; visual/real-layout
claims about painted geometry are UNEXERCISED by this jsdom suite —
see the codebase's own stated jsdom-layout-is-unreliable convention).

### Disclosed name substitution (not a scope narrowing)

The commission suggested renaming `board-column` to `main-area` "or
something like that." Literally applying `main-area` **collides**:
App.vue already has a pre-existing, unrelated `id="main-area"` (the
outer app row containing the sidebar-collapse rail + `SidebarWidget` +
`#split-workspace` — line 494/1017 in the pre-change file), predating
this commission entirely. Two elements sharing one id is invalid HTML
and would make `#main-area` an ambiguous CSS/JS target.

Given the commission's own "or something like that" qualifier, I chose
**`board-area`** instead — keeps the existing `board-square` sibling's
naming register, drops the misnomer ("column") the commission objected
to, and doesn't collide. Renamed consistently: the DOM id
(`#board-column` → `#board-area`), the JS symbols
(`boardColumnMaxWidthPx` → `boardAreaMaxWidthPx`,
`computeBoardColumnMaxWidthPx` → `computeBoardAreaMaxWidthPx`), and
every prose reference (including two occurrences split across a line
wrap that a first-pass `sed` missed and a follow-up Python scan caught)
across:

- `frontend/src/App.vue`
- `frontend/src/composables/chrome/useResizablePanel.ts`
- `frontend/src/state/layout-model.ts`
- `frontend/src/components/chrome/SetupToolPalette.vue`
- `frontend/src/store/schema.ts`
- `frontend/tests/integration/resizer-restore-clamp.test.ts`
- `frontend/tests/integration/state/layout-model-deferred.test.ts`
- `frontend/tests/unit/composables/chrome/useResizablePanel.test.ts`
- `frontend/tests/unit/state/layout-model.test.ts`

Verified (grep + a comment-aware Python scan for split-across-newline
occurrences) that no `board-column` / `boardColumn` / `BoardColumn` /
"board column" spelling remains anywhere in `src/` or `tests/`, and
that the new `board-area` name collides with nothing else in the tree.

### Why the naive sibling move (the commissioner's own first attempt) doesn't work

Mechanism, stated per the task's request: `#board-area` (the renamed
`#board-column`) is `display: flex; flex-direction: column; align-items:
center;`. `align-items: center` is the CROSS-axis (horizontal, for a
column container) rule, and it applies to **every** flex child that
doesn't opt out via its own `align-self`. Before this fix,
`#board-square` was the box that carried `align-self: center` (so it
could derive its width from its own height via `aspect-ratio`, staying
a true square regardless of `#board-area`'s width). Simply cutting
`<StatusBar>` out of `#board-square` and pasting it as a sibling of
`#board-square` (still inside `#board-area`) makes StatusBar an
ordinary, non-opted-out flex child — which under `align-items: center`
shrink-wraps to its own content's intrinsic width, exactly the same
default `#board-square` itself would have if it hadn't explicitly
opted out. The bar's own width and `#board-square`'s width were never
the same conceptual quantity (one is intrinsic-content-derived, the
other is height-derived via `aspect-ratio`, and `#board-area`'s own box
is frequently WIDER than both — it absorbs freed row space up to
`boardAreaMaxWidthPx`), so a naive reparent produces a bar roughly as
narrow as its own content, not one spanning `#board-area`'s actual
available width. This is exactly what the commissioner's own diagnosis
("they're not really the same width conceptually") named without
tracing to the CSS cause.

### The actual fix (two required parts)

1. **Reparent** `<StatusBar>` in `App.vue`'s template from
   `#board-square`'s second child to `#board-area`'s second child
   (sibling of `#board-square`).
2. **Opt the bar's root element out of the center-and-shrink-wrap
   default**: `#board-area > .status-bar { align-self: stretch;
   flex-shrink: 0; }` in `App.vue`'s (unscoped) `<style>` block — the
   same "steer a child component's root class from the layout that
   positions it" idiom the codebase already uses for
   `#split-workspace.axis-column`'s descendant overrides.
   `align-self: stretch` is what actually claims `#board-area`'s full
   cross-axis width for the bar, independent of `#board-square`'s own
   (narrower, height-derived) width. `.status-bar` is unique to
   `StatusBar.vue` app-wide (checked — no other component uses the
   class), so the descendant selector is exact, not a fuzzy match.

### Height-budget consequence (not optional, discovered during implementation)

Moving the bar out of `#board-square` also changes what `100%` height
means for `#board-square`: previously it was `#board-area`'s **sole**
child, so `height: 100%` claimed all of `#board-area`'s height (the
status bar was accounted for *inside* that box, as `#board-square`'s
own second flex child below `#content`). With the bar now a sibling,
`#board-square` must instead **share** `#board-area`'s height with it.
Changed `#board-square`'s CSS from `height: 100%` to `flex: 1 1 auto;
min-height: 0;` — it now claims whatever height the status bar's own
natural/`min-height` (unchanged, `StatusBar.vue`'s own 20px floor) does
NOT need, and `aspect-ratio: 1/1` derives the square's width from that
flex-computed (still fully definite post-layout) height, same total
vertical budget as before, accounted one level higher. Without this,
the two children would either overflow `#board-area`'s box or rely on
implicit flex-shrink proportioning that happened to work by
coincidence rather than by design.

### Preserved: the 700px narrow-mode collapse

`StatusBar.vue` itself (the `STATUS_BAR_NARROW_THRESHOLD_PX = 700`
priority-collapse logic, `statusBarRef` + `useDeferredContainerBreakpoint`)
is untouched — the reparent only changes where the component mounts in
`App.vue`'s tree, not the component's own internals. The narrow-mode
`ResizeObserver` still measures the bar's own rendered width, which is
now (correctly) `#board-area`'s width rather than `#board-square`'s —
consistent with the fix's whole point.

### Axis-column (portrait/tile) mode

No behavior change needed: `#split-workspace.axis-column #board-area`
already forces `width: 100%; height: auto`, and
`#split-workspace.axis-column #board-square` already forces
`width: 100%` too — both were already the same width in that axis, so
the reparented bar's `align-self: stretch` computes to the same 100%
either way. Verified no axis-column override is required for the new
`#board-area > .status-bar` rule.

Files: `frontend/src/App.vue` (template + CSS), plus the rename set
listed above (comment/symbol consistency only, no behavior change in
those files beyond the identifier).

---

## Item 3 — `wiki2-scrollbar-color`

**Claim:** WITNESSED (source-level; real cross-browser rendering is
UNEXERCISED by this suite, same jsdom-layout-is-unreliable convention
as item 2).

Minted `--accent-peach: #eba46d` as a new theme-invariant token in
`theme.css`'s `:root` block (declared outside any `[data-theme="…"]`
block — this is a "theme-exception" accent in the same category as the
~14 other documented theme-exception blocks this file's header already
names, not a per-theme-tunable surface).

Discovered during implementation that `#eba46d` was **already** a
literal in `App.vue`'s `.panel-resizer` rule, explicitly flagged there
as a "theme-exception" — the exact same peach, already carrying a
comment explaining it. Rather than mint a second, independent copy of
the identical hex for the scrollbar (which would itself be exactly the
kind of magic-literal duplication the umbrella's no-magic-literals
mandate — the same mandate item 1's own wiki text invokes — exists to
prevent), routed `.panel-resizer`'s `background` through the new
`--accent-peach` token too, so both consumers share one named anchor.
This is a small, same-value, same-visual-result tidy directly adjacent
to the commission's own stated rationale, not unrelated scope creep;
flagged here for visibility per the "disclosed narrowing/widening needs
surfacing" discipline, even though it's a widening rather than a
narrowing.

Global scrollbar styling added to `theme.css` (outside `:root`, since
`scrollbar-color`/`::-webkit-scrollbar*` target actual elements, not
custom-property declarations):

```css
* {
  scrollbar-color: var(--accent-peach) var(--surface-1);
  scrollbar-width: thin;
}
*::-webkit-scrollbar { width: 10px; height: 10px; }
*::-webkit-scrollbar-track { background: var(--surface-1); }
*::-webkit-scrollbar-thumb { background: var(--accent-peach); border-radius: var(--radius-default); }
*::-webkit-scrollbar-thumb:hover { background: var(--accent-primary); }
```

Both mechanisms are included: `scrollbar-color` (the standard
property, honored by Firefox and current WebKit/Chromium) and the
`::-webkit-scrollbar*` pseudo-elements (the longer-standing
WebKit/Chromium-specific mechanism), since this app ships both as a
Vite/Chromium web build and as a Tauri desktop shell
(`package.json`'s `tauri:dev`/`tauri:build`, `src-tauri/`) whose
embedded webview varies by OS. I did not re-verify the exact per-OS
webview engine for this pass (would require reading `frontend/README.md`
end-to-end per this codebase's own documentation-consumption
discipline, which I deferred as out of scope for a CSS-only commission)
— named explicitly rather than silently assumed, so both mechanisms are
declared defensively instead of picking one.

Track color uses `--surface-1` (the existing default-panel surface
token) rather than a new literal, per the surface-token discipline the
rest of the file follows. Updated the file's header docstring token
census to include the new anchor (`16 base... plus 6 chart-derived
helpers, 5 role aliases, and 1 theme-invariant theme-exception literal
accent`) so the count stays accurate.

Files: `frontend/src/assets/css/theme.css`, `frontend/src/App.vue`
(`.panel-resizer` re-pointed to the token).

---

## Standing design-law check

- All readable text stays `var(--text-0)` — no new readable-text sites
  introduced by any of the three items.
- No `box-shadow`/`transition`/`blur` introduced — verified via
  `tests/unit/banned-effects.test.ts` (passing) and manual read of the
  new CSS (none present).
- No transparent overlays introduced.
- Surface tokens for backgrounds (`--surface-1`, `--surface-2`), border
  tokens where borders appear — none of the three items introduced a
  border that needed one.
- `--surface-0` not repurposed.
- 24px pointer-target floor: item 1's whole point; verified via the
  new test block. Item 2/3 introduce no new pointer targets.
- No ellipsized readable names introduced.

## Gates (run from the worktree's `frontend/`, foreground, full timeout)

Dependencies were **not present** in this worktree (`node_modules`
absent — worktrees don't inherit the main checkout's gitignored
`node_modules`); ran `npm ci` first (clean, `package-lock.json`
present, 336 packages, no errors) before either gate.

- `nice -n 19 npx vue-tsc --noEmit` — **exit 0**, empty output (clean).
- `nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048
  VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2 npm run test:run` —
  **exit 0**. `233 passed | 3 skipped (236)` test files, `2902 passed |
  4 skipped (2906)` tests. (First run caught the item-1 test's own
  comment-vs-regex false positive, described above; fixed and reran to
  green before final confirmation reruns.)

`eslint` is not in this task's mandated gate list, but I ran it as a
sanity check on the touched files: one pre-existing, unrelated error
surfaced (`src/state/layout-model.ts:540`, an unjustified `as
Ref<LayoutClass>` cast) — confirmed via `git show HEAD:...` that this
line is byte-identical to the pre-change file, i.e. not introduced by
this build. Left untouched (out of scope; not part of any of the three
commissioned items).

## Stop-and-report items

None that blocked delivery. The one judgment call (item 2's
`board-column` → `board-area` substitution instead of the literal
`main-area` suggestion) is disclosed above in full, not silently
shipped — the commission's own "or something like that" phrasing
covers it, and I did not narrow any of the three items' scope.

## Documentation-graph check (umbrella CLAUDE.md pre-merge audit)

- Work-status store: not touched (no todo-DB access available to this
  builder session; the commissioning orchestrator owns status
  transitions for the three wiki2-* items).
- `docs/handoff-current.md`: no orientation-level surface changed —
  these are internal chrome-layout/CSS fixes, not new architecture or
  integration model.
- `FEATURES.md`: no user-facing capability added, removed, or
  materially altered (button sizing, status-bar layout, and scrollbar
  color are visual polish, not new capability) — no edit.
- `frontend/FILES.md`: no file created, moved, deleted, or re-banded —
  no edit.
- No ADR "Revisit when…" trigger fired by this change.
- No documentation *structure* changed (no doc added/removed/
  re-cross-referenced) — doc-graph regeneration not required.
- ADR-0006 headers: all touched files already carry theirs; no
  retrofit needed.

## Worktree / commit info

- Worktree: `/home/bork/w/omega/.claude/worktrees/agent-a446468dacebc53f3`
- Branch: `worktree-agent-a446468dacebc53f3`
- Rebased onto `origin/next` at `c8851986` before work; see commit(s)
  below for the final sha(s) (not pushed, per instructions).
