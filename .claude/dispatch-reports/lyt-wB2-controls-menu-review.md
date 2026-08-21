Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).

# Review — LYT finish-pass wave B2 (engine-controls menu-path realization)

Delivery: branch `worktree-agent-aba9f1f9ec838c784`, HEAD `93d907c7`
(fix commit `f6b80ef0`), atop `lyt-phase2` at `088fc0c4`.

**Reviewer note on process**: this review's own worktree (a nested
subagent with a pinned cwd) could not be redirected into the delivery
worktree's filesystem — `EnterWorktree` reports success but the Bash
sandbox continues to refuse commands resolving to that path. Since both
delivery commits are reachable git objects from this worktree's own
`.git`, the diff was read directly (`git diff 088fc0c4..93d907c7`,
`git show 93d907c7:<path>`) and the gates were run against a separate
`git worktree add` checkout of `93d907c7` under scratch (with its own
`npm ci`), not the original delivery worktree. This report is filed at
the same relative path in this worktree instead of the delivery one —
the commissioner should relocate/merge it if a single canonical copy is
needed.

## Verdict: ACCEPT WITH A MAJOR FINDING

The mechanism is competently built, honestly reasoned about in its own
comments, well-tested at the pure-logic tier, and every gate is green.
But the interaction-induced form-flip the commission asked me to trace
is **real, unguarded, and reachable in completely ordinary play** —
connect, then start a match, at 1920×1080 — not just in an exotic
worst-case corner. The builder's own report discloses the *existence*
of this case (§8) but frames it as the mechanism "correctly protect[ing]"
the session, never naming that the protection **is** the cluster
disappearing out from under an actively-engaged user mid-match. That
framing gap is itself worth flagging, independent of the mechanism's
underlying soundness.

## 1. Form-flipping: real, unguarded, traced from the code

`resolveEngineControlsRealization` (`frontend/src/state/engine-controls-realization.ts`)
is a `computed` in `useEngineControlsRealization.ts` that re-evaluates
every time `labelsKey` changes (`ToolbarEngineControls.vue`'s watcher
covers `locale`, all five button labels, so Connect→Disconnect and
Match→Stop Match both trigger it) — there is no hysteresis, hold-open,
hover-lock, or hand-off animation of any kind. The shadow clone
re-measures synchronously (`flush: 'post'`) on every such change, and
`form` recomputes from the fresh measurement. Nothing pins a session
that started in `button-cluster` form to stay there.

I derived the actual break point by hand using the exact live-measured
widths the delivered unit test itself pins (`natural widths [105.625,
90.015625, 43.21875, 51.015625, 66.609375]`, gap 4px, row height 24px)
against 1920×1080's own 150.5px column, replaying `computeWrappedRowCount`'s
sequential-pack algorithm by hand for each reachable label combination:

| State | Match label | Engine label | Rows | Height | Form |
|---|---|---|---|---|---|
| idle | Match (51.02) | Connect (66.61) | 3 | 80px | cluster (exact fit, the report's own "150.5px, 3 rows/80px, exact" claim) |
| connected only | Match (51.02) | Disconnect (90.02) | 3 | 80px | cluster (still fits — Disconnect slots into row 3 next to Match) |
| match running only | Stop Match (90.02) | Connect (66.61) | **4** | **108px** | **menu-path** |
| connected + match running | Stop Match (90.02) | Disconnect (90.02) | **4** | **108px** | **menu-path** |

Connecting alone does not flip the form (row 3 absorbs the wider
Disconnect label with room to spare). But **starting a match while
connected does**: Play(43.22)+StopMatch(90.02) no longer share a row
with room for Disconnect afterward, so a 4th row is forced and
108px > 80px reservation trips `menu-path`. This is precisely the
"connect, then play a match" flow — not a contrived edge case — at
exactly the viewport the commission's own "cluster form, byte-comparable
rendering to today" requirement names.

Concretely: a user at 1920×1080 clicks **Connect** (fine, cluster
form holds), then clicks **Match** to start a match. The instant the
label becomes "Stop Match", the whole five-button cluster —
including the button the user is mid-interaction with — unmounts and
is replaced by a compact "Engine ▾" trigger. To stop the match, the
user must now open a menu instead of clicking the button that was
there a moment ago. This is exactly the "yanking the button out from
under the user" failure mode the commission asked me to check for, and
it is unguarded.

**Was the worst-case-table rejection sound?** Only half of it. The
builder's stated reason for not using
`ENGINE_CONTROLS_WORST_CASE_BUTTON_WIDTHS_PX` as the runtime driver is
correct as far as it goes — pinning to worst-case would force
`menu-path` unconditionally at 1920/2560, which does contradict the
commission's idle-state requirement. But the worst-case table itself
proves 1920×1080's *reachable* worst case (108px) already exceeds the
80px reservation — meaning **no realization choice keeps the cluster
form stable at 1920×1080 across every reachable interaction state**;
the compiled `80px` reservation is simply too small for the full label
space at that column width. Live-measurement is a reasonable way to
maximize idle-state fidelity, but it does so by converting a static
"always compliant" property into a runtime one that can and does flip
mid-session. The honest framing would have named this tension
explicitly as a tradeoff decision needing sign-off (cluster-stability
vs. idle-state fidelity — pick one, both aren't simultaneously
achievable under the current 80px reservation), not folded it into a
"disclosed as engine-gated/unjudged" line that reads as "not yet
witnessed" rather than "known to break."

Two structural fixes worth naming (not requiring this pass to have
built them, but worth the commissioner seeing the menu of options):
(a) widen the compiled 80px reservation to cover the worst case
(184px / 4-row height, ~108px, whichever the real ceiling is) so the
cluster form is provably stable everywhere it's chosen — the `.lyt`
encoding's own re-grounding math would need revisiting; or (b) once a
session enters `menu-path` for any reason, stay there for the rest of
the session (or until an explicit width-driven recheck), i.e.
one-way/sticky hysteresis on the interaction-driven axis while still
allowing width-driven flips. Neither is implemented; nothing in the
delivered code discusses (b) at all.

## 2. Shadow clone

- **A11y**: `aria-hidden="true"` on the container, `tabindex="-1"` on
  every shadow button — unreachable by keyboard/AT, correctly excluded
  from the accessibility tree. Good.
- **Focus**: no `pointer-events` needed for keyboard focus since
  `tabindex="-1"` already removes it from the tab sequence; the parent
  container is additionally `pointer-events: none`. Confirmed no path
  to focus it.
- **Perf**: no `ResizeObserver` on the shadow itself (confirmed by
  reading `useEngineControlsRealization.ts` — the only `ResizeObserver`
  is `useElementWidth`'s, on the real root). The shadow only re-measures
  on `labelsKey` change (`watch(..., {flush:'post'})`) plus once on
  mount — not a polling loop. The clone is permanently mounted
  regardless of form (outside both `v-if`/`v-else` branches), so five
  extra always-present buttons sit in the DOM at all times — negligible
  memory/layout cost, not flagged as a real problem, but worth noting
  since "permanently mounted" was explicitly named in the commission.
- **Style drift**: shadow buttons share the exact same scoped
  `.toolbar-btn` class as the real cluster buttons (`<style scoped>`,
  confirmed at the top of the file), so font/padding/border-width are
  identical. The only classes the real buttons sometimes add
  (`.btn-connected`, `.btn-stop-match`, `.highlight-btn`) change only
  `color`/`border-color` per the component's own CSS — no
  width/padding/font delta — so their absence on the shadow clone does
  not make the measurement lie. Verified against the CSS block directly
  (`.btn-connected { border-color: ...; color: ...; }` etc., all
  `!important` color-only overrides).

No defect found in the shadow-clone mechanism itself; it does what it
claims to do faithfully.

## 3. Gates (rerun independently, not trusted from the report)

Ran against a fresh `git worktree add <scratch>/review-93d907c7 93d907c7`
checkout with its own `npm ci` (not the delivery worktree — see process
note above).

| Gate | Result |
|---|---|
| `npx eslint .` | **exit 0**, empty log — 0 errors/0 warnings |
| `npm run build` (`vue-tsc -b && vite build`) | **exit 0** — 1252 modules, `✓ built in 3.52s` |
| `npm run test:run` | **3267 passed, 8 skipped** (259/262 files; 3 pre-existing skip files) — matches the report's cited count exactly. (A first attempt raced with my own mutation-testing edits to the same file mid-run and is disregarded; the rerun above is clean and isolated.) |
| `npx vitest run tests/integration/App-boot.test.ts` (isolated) | **exit 0** — 5 passed |
| `research/lyt` in diff | Confirmed empty — `git diff 088fc0c4..93d907c7 --name-only \| grep research/lyt` and `...lyt-layout.*gen\.ts` both return nothing. No compiled-program file touched. |

## 4. Mutation testing — threshold logic

Three targeted mutations against `frontend/src/state/engine-controls-realization.ts`,
each reverted cleanly after confirming red:

1. `neededHeightPx > reservedHeightPx` → `>=` (equality direction) —
   **4 tests failed** (the explicit "stays button-cluster at exact
   equality" test plus three worst-case-table fixtures that sit exactly
   at boundaries).
2. Dropped the gap term in `computeWrappedRowCount`'s row-wrap check
   (`rowWidthPx + gapPx + w` → `rowWidthPx + w`) — **3 tests failed**.
3. Off-by-one in `computeClusterNeededHeightPx`'s row-gap count
   (`(rowCount - 1) * rowGapPx` → `rowCount * rowGapPx`) — **4 tests
   failed**.

All three mutations went red; the threshold arithmetic is genuinely
covered, not just exercised.

## 5. All-five-reachable in menu form / handler reuse (P1)

Read `ToolbarEngineControls.vue`'s menu-path template directly: every
menu item calls a thin wrapper (`onMenuMintCard`/`onMenuLearnPath`/
`onMenuPlay`/`onMenuMatch`/`onMenuToggleEngine`) that either emits the
exact same event the cluster button emits, or (for Match) calls the
**same** `onMatchClick()` function the cluster button already used —
not a reimplementation. No drift risk.

The delivered integration test
(`tests/integration/ToolbarEngineControls-menu-capabilities.test.ts`,
via the disclosed `forceForm` test-only prop, needed because jsdom has
no real flex layout) mounts the menu form and asserts all five items
render as `role="menuitem"`, are enabled, and clicking each emits the
same event the cluster form does — including a Connect-specific
hit-test (label text, click, `toggle-engine` emitted). This is a sound
substitute for live hit-testing given the jsdom constraint; I did not
additionally stand up the Playwright rig myself (the builder's own
report already screenshot-witnesses Connect at 1280×1024 and 420×880
with rect/hitTag/text evidence, and reproducing that rig was not the
better use of review time given the jsdom test already exercises the
same DOM path with real event dispatch).

## 6. Narrowings — verified against the delivered report

Read `.claude/dispatch-reports/lyt-wB2-controls-menu.md` (§9) after
completing the above independent analysis, to check against my own
findings rather than seed them. Four disclosed items, all verified
accurate as far as they go:

1. `useClickTogglePopover.ts` not retrofitted into `LocalePicker.vue`/
   `LytPresenceMenu.vue` — confirmed true by reading both files; a
   third near-identical inline click/outside-click/Escape+fixed-anchor
   implementation now exists un-consolidated. Correctly named as
   out-of-scope-adjacent cleanup, not silently left.
2. Test-count reconciliation against the commission's cited "3241"
   baseline not independently re-run on `088fc0c4` before the pass's
   edits — disclosed honestly, and the delivered total (3267) matches
   what I independently reran, so this narrowing doesn't affect
   correctness, only precision of the delta accounting.
3. Work-status store (`todo` DB) not updated — confirmed via CLAUDE.md's
   discipline that this is required; the builder's stated reason (no DB
   credentials in view for that session) is a plausible constraint, but
   the item is unresolved and should be closed by the commissioner
   before this is considered fully shipped, per the umbrella's own
   documentation-is-part-of-the-work rule.
4. `frontend/FILES.md`'s doc-graph node not regenerated — correctly
   scoped as content-only (no doc added/removed/renamed, no new
   cross-reference edge), consistent with the umbrella CLAUDE.md's own
   carve-out for content-only edits.

**Missing from the disclosed list, or at least under-characterized**:
§8's disclosure of the 1920×1080 connected+matching case. It is
technically named (engine-gated/unjudged, not screenshot-witnessed),
but its own wording — "the live-measurement mechanism handles it
structurally... would also correctly protect a 1920x1080 session that
connects and starts a match" — reads as reassurance that the case is
covered, not a flag that the covering behavior *is* a user-visible form
flip mid-match. A commissioner skimming §8 would likely read "protects"
as "no problem here" rather than "the cluster will vanish out from
under you." I'd ask that this be re-disclosed in those explicit terms
before the commissioner signs off, even though the underlying
mechanism doesn't need to change to fix the mislabeling.

## 7. Hygiene

- No conflict markers in the diff (`git diff 088fc0c4..93d907c7 | grep -F <<<<<<<|=======|>>>>>>>` — empty).
- No unused imports surfaced by eslint (0/0), and a manual read of
  `ToolbarEngineControls.vue`'s import block shows every import used.
- No style-ban violations: no `box-shadow`/`transition`/`blur`/
  `animation` added; the new `.engine-controls-menu`/`.engine-controls-trigger`/
  `.engine-controls-shadow` CSS reuses existing tokens
  (`--surface-0`, `--border-2`, `--space-tight`, `--space-default`,
  `--radius-default`, `--z-popover-chrome`, `--text-disabled`,
  `--text-tiny`) and the same `align: 'right'` / fixed-anchor idiom
  every other toolbar-strip popover already uses.
- No hardcoded hosts/ports in the diff (`grep -n "localhost\|127.0.0.1\|ws://\|http://"` over the touched frontend files — empty).
- `frontend/FILES.md` updated for all new files (`engine-controls-realization.ts`,
  `useClickTogglePopover.ts`, `useEngineControlsRealization.ts`) and the
  existing `ToolbarEngineControls.vue` entry amended — verified by
  reading the diff directly, not just trusting the report.
- The +23 tests (17 unit + 6 integration) are genuinely additive: no
  existing test's assertions were touched in the diff (confirmed — the
  two test files are both wholly new, no modifications to pre-existing
  test files appear in `git diff --stat`).
- `research/lyt` and every `*.gen.ts` compiled-program file are
  untouched (§3 above).

## Summary for the commissioner

Ship-quality engineering, sound pure-logic layer, honest test coverage,
all gates green, narrowings disclosed accurately (bar one framing
issue). The open question is a product/UX judgment call, not a code
defect: is a live-measurement mechanism that can silently swap the
engine-controls cluster for a menu **mid-interaction** (specifically:
during an active match, at the flagship 1920×1080 size the commission
asked to keep byte-comparable to today) acceptable, or does it need
hysteresis / a wider reservation / an explicit sticky-menu rule before
this ships? I'd treat this as a MAJOR finding requiring commissioner
sign-off before merge, not a blocking code defect requiring rework —
the mechanism the builder built is a legitimate design point, just one
whose consequence wasn't named plainly enough in its own disclosure.

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).
