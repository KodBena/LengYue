# W3 build report — resizers + screen-class swap (lyt-w3-resizers)

*Built 2026-08-11 on worktree branch `worktree-agent-a10489ad013bf9dc8`, rebased onto
`lyt-phase2` @ 28cf43cf (W2 presence menu). Delivery-time merge-base with `lyt-phase2`:
**28cf43cf** — `lyt-phase2` did not move between the base-freshness check and delivery,
so no re-rebase was needed.*

## Summary

W3 commissions two things (roadmap §8 W3, §4 items 1–2): the OUTER/INNER L4 resizer
drags, realized as grid-track drag handles in the LYT skeleton; and the portrait screen
class made real, selected by nearest-neighbor (SPEC.md §6) inside the existing
`useDeferredLayoutClass` hysteresis machinery. Both are delivered. Portrait emission
(the Python/research side: CASE B board-priority track, the shared-types refactor, the
new `lyt-layout-portrait.gen.ts`) was built by a parallel background agent under my
supervision, working in its own isolated worktree with no commits; I copied its five
output files into this worktree, fixed one `vue-tsc` regression in its emitter
(an unused-import block that tripped `noUnusedLocals` — traced to the emitter, not
hand-patched into the generated file), and regenerated both `.gen.ts` files from the
fixed emitter before building on top of them.

## Per-claim status

### 1. Resizers (roadmap §4 item 1, L4 verbatim) — WITNESSED

- **Same two persisted facts, same single-writer discipline.** `useResizablePanel.ts`'s
  pure drag-math functions (`computePaneWidthPx`, `computeTreePanelWidthPx`,
  `computeTreeControlRegionWidthPx`, `sanitizeTreeControlRegionWidthPx`,
  `computeBoardAreaMaxWidthPx`) are **untouched** — same file, same exports, same
  existing unit tests (`tests/unit/composables/chrome/useResizablePanel.test.ts`,
  unmodified, still green). `session.ui.treeControlRegionWidthPx` /
  `treePanelWidthPx` are the only two write targets; `touchSession()` fires at the
  same per-mousemove sites as before (unchanged code path).
- **Realized as grid-track drag handles, drags win verbatim.** `LytNode.vue` gained a
  `trackStyleOverrides: Record<string, string>` prop (path → literal CSS track value);
  when a path has an entry, `trackList`'s computed uses it **instead of** calling
  `trackCssValue` on the compiled program's own track shape — checked before the
  `board-priority-clamp` special case, so a drag overrides even that formula.
  App.vue's `lytTrackStyleOverrides` computed builds this map from
  `useResizablePanel`'s `effectiveTreeControlRegionWidthPx` / (new)
  `effectiveTreePanelWidthPx`. WITNESSED live via Playwright
  (`.claude/dispatch-reports/lyt-w3-resizers-probe.mjs`, kept as a build artifact):
  both bars track the cursor within 6px at every sampled step of a real
  mousedown/mousemove/mouseup sequence, and both persist across a page reload.
- **Paint 1px / grab ~4px per the standing resizer ruling.** `.lyt-resizer-vertical`
  is a 1px absolutely-positioned bar with a 4px `::before` pointer-target overhang,
  anchored inside `#vue-tree-panel` (OUTER) / `#control-panel` (INNER) — both already
  `position: relative` for this purpose.
  **Real bug found and fixed during Playwright verification, not glossed over**: a
  first draft anchored the bar OUTSIDE its container (`left: -1px`, straddling the
  boundary symmetrically). This silently failed to receive pointer events on
  `#control-panel` specifically — `assets/css/style.css`'s own pre-existing
  `#control-panel { overflow: auto; ... }` rule (kept intentionally per that file's
  own comment) clips any absolutely-positioned descendant rendered outside its padding
  box. Confirmed via `elementsFromPoint`: the bar and its `::before` never appeared in
  the hit-test stack at their own rendered coordinate; only `#control-panel` itself
  did. `#vue-tree-panel` (OUTER's anchor) carries no such rule and was unaffected —
  an inconsistency the fix removes by construction. Both bars now render `left: 0`
  (fully inside their anchor's padding box) with the pointer-target overhang extending
  inward only; see App.vue's own comment at the rule for the full diagnosis.
- **Restore-time clamp discipline carries over.** `sanitizeTreeControlRegionWidthPx`
  is unchanged; `effectiveTreeControlRegionWidthPx`'s stored-drag-precedence/clamp
  logic is unchanged (still consumed by `lytTrackStyleOverrides`, not bypassed).
- **`useResizablePanel.ts` rewired to the new skeleton's elements; the treeExpanded
  dormant read at ~line 604 resolved.** The DOM ids (`#split-workspace`,
  `#board-area`, `#tree-control-wrapper`, `#vue-tree-panel`, `#control-panel`) are
  unchanged (App.vue's own `LYT_DOM_ID_BY_PATH_LANDSCAPE`/`_PORTRAIT` still assign
  them), so the mousedown-time `getBoundingClientRect` measurement code is untouched.
  What changed: `freshTreeControlWrapperMinWidthPx`'s computed no longer reads
  `store.session.ui.treeExpanded` — it always calls
  `freshTreeControlWrapperFloorPx(true)`, since the LYT `tree` leaf is unconditionally
  `@fixed`-present in both screen classes (never toggled by chrome). The field itself
  is untouched (schema unchanged); I did not touch
  `blind-mode-prefs.ts`/`useReviewSession.ts`, per the scope boundary. A pre-existing
  integration test (`resizer-restore-clamp.test.ts`) that asserted the OLD
  treeExpanded-varies-the-floor behavior was updated to assert the new
  treeExpanded-no-longer-affects-it behavior — a real, disclosed test-contract change,
  not a deletion.

### 2. Screen-class swap (roadmap §4 item 2) — WITNESSED, with a disclosed narrowing

- **Portrait emission real, both classes' programs compiled.** `lyt-layout.gen.ts`
  (landscape) and the new `lyt-layout-portrait.gen.ts` both exist, both typed via a
  new shared, hand-written `lyt-layout-types.ts` (ADR-0012 one-home-per-fact — the
  parallel agent's own judgment call, verified: `LYT_LANDSCAPE`'s data body is
  byte-identical before/after the refactor, confirmed by `git diff` on that file
  showing only the header/type-block changed). `research/lyt`'s pytest suite:
  **113 passed**, up from the pre-W3 baseline of 105 (8 new portrait-emission tests),
  exit code 0.
- **Nearest-neighbor selection, SPEC.md §6.** `state/layout-model.ts` gained
  `LYT_SCREEN_CLASSES` (the exact two representative points
  `research/lyt/runner.py`'s own registration declares: landscape 1920×1080, portrait
  1080×1920) and `nearestScreenClassId`. SPEC.md §6 names "scale-normalized distance"
  but gives no formula — **disclosed judgment call**: distance is measured in
  log-aspect-ratio space (`log(w/h)`), the genuinely scale-invariant quantity a
  rectangle's shape carries; for exactly these two symmetric classes this reduces to
  a clean boundary at `w === h` (ratio 1.0), a principled improvement over the old
  informal 0.9 threshold, not merely a rename.
- **Wrapped in the EXISTING `useDeferredLayoutClass` machinery, derivation swapped,
  commit discipline kept.** The hysteresis/mid-drag-freeze mechanism (the `watch`
  pair, `commitIfIdle`, the `isDragging`-frozen commit) is untouched; only
  `evaluateAxis` → `evaluateScreenClassId` changed what it evaluates. `LayoutClass`
  gained a `screenClassId` field (additive); `axis` is now *derived* from it
  (`portrait → 'column'`, `landscape → 'row'`) rather than computed independently,
  preserving the existing `axis`/`width` consumer contract.
- **App.vue swaps the whole program, not a per-node branch.** `activeLytProgram`
  (`LYT_LANDSCAPE` | `LYT_PORTRAIT`) and `activeLytDomIdByPath`
  (`LYT_DOM_ID_BY_PATH_LANDSCAPE` | `_PORTRAIT`) both key off
  `layoutClass.value.screenClassId`. WITNESSED via Playwright: resizing the window
  from 1920×1080 to 700×1400 flips the rendered program (witnessed via `#resizer-outer`
  presence, see the disclosed narrowing below); resizing back restores landscape;
  a ratio just inside the hysteresis band from the portrait side does not flap back.
- **Widget registry made class-aware.** `lyt-widget-registry.ts` gained
  `LYT_WIDGET_REGISTRY_OVERRIDES_BY_CLASS` and class-aware
  `lytMountingWidgetId(widgetId, classId?)` / new `lytRegistryStatus(widgetId,
  classId?)`. This was **necessary, not optional**: portrait's own tree separates
  `I_engine` from `A_top` by the board composite (not adjacent siblings the way
  landscape merges `A_go`/`I_engine`/`A_common`), so reusing landscape's flat
  `'I_engine' → absorbed into 'A_go'` disposition for portrait would have thrown
  LytNode's own "no preceding mounting sibling" error at render time — verified by
  reasoning through the merge algorithm before shipping, not discovered live.
  `A_top` (portrait's own merged toolbar-strip leaf, no landscape counterpart) got its
  own `#leaf-A_top` mount, reusing the same Toolbar/SGF-button/LocalePicker content as
  `#leaf-A_go`.
- **DISCLOSED NARROWING — portrait's `I_engine` mounts nothing this wave.** Registered
  `status: 'absent'` (a reserved, empty 28px track) for the portrait class only —
  landscape's `I_engine` disposition (absorbed into `A_go`) is unchanged. No existing
  component satisfies a standalone engine-status readout without either splitting
  Toolbar's internals (already deferred once, in `A_go`'s own pre-existing registry
  note) or mounting a second live Toolbar instance (would duplicate every button).
  Flagged here per the standing "any narrowing is STOP-and-report" rule; this is a
  genuine scope gap, not a bug — the reserved track keeps portrait's own geometry
  matching its compiled program.
- **DISCLOSED NARROWING — the OUTER resizer bar is landscape-only.** Portrait's board
  composite is a separate ROW (not a width-contested sibling of anything), so what
  the OUTER bar's persisted `treeControlRegionWidthPx` WIDTH fact should even mean in
  a single-column stack is a genuine open design question this wave does not invent
  an answer to (the same posture the roadmap's own compact-landscape narrowing takes).
  The INNER bar (tree-panel width) works identically in both classes — its own leaf
  path differs (`'2.3.0'` landscape / `'4.0'` portrait) but the mechanism is unchanged.
  `treeControlRegionWidthPx` itself is simply never written in a portrait session, so
  returning to landscape restores the user's own prior drag exactly (verified: the
  single stored fact is untouched by the class swap, not reset).

### 3. Three-infeasible-sizes disclosure (KNOWN CONSTRAINT, roadmap) — WITNESSED, per instruction

1280×1024 / 1024×700 / 900×600 are solver-INFEASIBLE for the clean-room landscape
encoding (ledger row 1751, a genuine geometry fact per SPEC.md §12 — the board's
aspect-forced width plus the tree/panels row's structural floor exceeds the available
width). **The live app renders usably at all three via CSS elasticity, not a solved
program** — this is stated plainly, not glossed as "solved": Playwright confirms at
each of the three sizes the board area renders with nonzero size, the toolbar is
present and visible, and `#main-area` has no horizontal overflow (no viewport-clipped
content). No compact-landscape class was invented; that remains the commissioner's
open design question per the roadmap's own instruction.

### 4. Presence interplay (commission item 3) — WITNESSED, no code change needed

The corner presence menu (`useLytPresenceMenu.ts`) is keyed purely by `store.session
.ui.lytPresence[widgetId]` — no path dependency at all — and `boardRail` /
`previewBoard` / `controlPanel` are the SAME widget ids in both the landscape and
portrait compiled programs (`research/lyt/runner.py`'s own registration comment,
read in full: "widget ids are shared verbatim between the landscape and portrait
trees"). This means presence state was **already class-swap-safe by construction**
before this build touched anything — verified by inspection (no test regression, no
new plumbing needed) rather than assumed. Resizer facts remain the existing single,
non-per-class values (`treeControlRegionWidthPx`/`treePanelWidthPx`) — one value, not
per-class, matching "follow the existing single-fact shape" per the commission's own
fallback instruction, disclosed above under the OUTER-bar narrowing.

## Tests added/extended

- `tests/unit/state/layout-model.test.ts` — `nearestScreenClassId` (exact points,
  scale-invariance, boundary tie-break, non-finite defaults), `evaluateScreenClassId`
  (hysteresis band, both entry directions), `deriveAxis` re-pinned to the new
  derivation.
- `tests/integration/state/layout-model-deferred.test.ts` — updated for the
  `screenClassId` field addition (same hysteresis behavior, new shape).
- `tests/unit/useLytTrackCss.test.ts` — `board-priority-self-clamp` (CASE B) CSS
  formula, including the "no leadingReservedPx term" contrast with CASE A.
- `tests/integration/resizer-restore-clamp.test.ts` — the treeExpanded-no-longer-
  affects-the-floor contract change; new `effectiveTreePanelWidthPx` coverage
  (stored-wins-verbatim / default-fallback).
- `tests/integration/SettingsTab-vertical-orientation.test.ts` — precision fix: the
  "no other TabWidget consumer passes orientation=\"vertical\"" guard was a whole-file
  regex that collided with App.vue's new, unrelated `aria-orientation="vertical"` on
  the resizer bars; rescoped to `<TabWidget>` open tags only, which is what the test's
  own stated intent has always been.
- `research/lyt/tests/test_emit_layout_tree.py` — 8 new portrait-emission tests
  (parallel agent's work, verified via the full suite run below).
- Playwright: `.claude/dispatch-reports/lyt-w3-resizers-probe.mjs` (kept as a build
  artifact) — 21 checks, all passing on the final run: both bars' 1:1 tracking +
  reload persistence, the screen-class swap + hysteresis at the boundary, and the
  three infeasible sizes rendering usable.

## Gate results (exact commands, exact exit codes)

| Gate | Command | Result |
|---|---|---|
| vitest (full suite) | `npx vitest run --reporter=dot` (from `frontend/`) | **2990 passed, 8 skipped, 0 failed** — exit 0 |
| vue-tsc | `npx vue-tsc -b` (from `frontend/`) | exit 0, no output |
| build | `npm run build` (`vue-tsc -b && vite build`) | exit 0 — `✓ built in ~2s` |
| eslint (touched files) | `npx eslint <every W3-touched src file>` | exit 0. **Note**: a bare `npx eslint .` over the whole tree reports 22 pre-existing errors/warnings in files this build never touched (confirmed via `git stash` + re-run against the untouched `lyt-phase2` baseline — identical 22-error list, same files, same lines) — pre-existing debt, not part of this delivery. |
| pytest (research/lyt) | `~/w/vdc/venvs/generic/bin/python -m pytest -q` (from `research/lyt/`) | **113 passed** — exit 0 (baseline 105 + 8 new portrait tests) |
| Playwright probe | `node lyt-w3-resizers-probe.mjs` under `systemd-run --user --scope -p MemoryMax=4G`, single Chromium instance in try/finally, dev server on scratch port 19173 | **21/21 checks PASS** |

## Disclosed judgment calls (summary, cross-referenced above)

1. Nearest-neighbor distance metric: log-aspect-ratio (SPEC.md names the property,
   not the formula).
2. Portrait's `I_engine` leaf mounts nothing this wave (`status: 'absent'`) — a real
   scope gap, not a bug.
3. The OUTER resizer bar is landscape-only; portrait has no analogous width-contested
   side-column concept for `treeControlRegionWidthPx` to govern.
4. Widget registry made class-scoped (`LYT_WIDGET_REGISTRY_OVERRIDES_BY_CLASS`) — a
   necessary generalization the W1/W2 flat registry did not anticipate, not
   commissioned by name but required for portrait to render at all.
5. Resizer bar anchoring moved from a negative (straddling) offset to an inward-only
   offset, after a real clipping bug was found and fixed via Playwright — a build-time
   correction, disclosed in App.vue's own comment at the rule.
6. `effectiveTreePanelWidthPx` reuses the existing `computeTreePanelBoundWidth` pure
   function (its `axisColumn` leg is never actually reached from this call site, since
   axis selection is now a whole-program swap) rather than reimplementing a narrower
   copy.

## Scope not touched (per the standing law)

Banners/system-log (W4), FEATURES.md rewrite (W5). `blind-mode-prefs.ts` and
`useReviewSession.ts` were not touched — the `treeExpanded` field's remaining
semantics stay with the commissioner's pending renegotiation.

## Files changed

- `frontend/src/App.vue` — screen-class swap wiring, resizer bars + CSS, `#leaf-A_top`.
- `frontend/src/components/chrome/LytNode.vue` — `classId`/`trackStyleOverrides` props.
- `frontend/src/composables/chrome/useResizablePanel.ts` — treeExpanded read removed,
  `effectiveTreePanelWidthPx` added.
- `frontend/src/composables/chrome/useLytTrackCss.ts` — CASE B track-kind CSS.
- `frontend/src/state/layout-model.ts` — nearest-neighbor screen-class selection.
- `frontend/src/state/lyt-widget-registry.ts` — class-scoped registry overrides.
- `frontend/src/state/lyt-layout-types.ts` (new, from the parallel agent) — shared
  LYT program types.
- `frontend/src/state/lyt-layout-portrait.gen.ts` (new, from the parallel agent) —
  compiled portrait program.
- `frontend/src/state/lyt-layout.gen.ts` — regenerated (header-only diff, data body
  byte-identical) after the emitter's unused-import fix.
- `frontend/src/locales/{en,ja,ko,zh-CN}.json` — two new resizer aria-label keys.
- `research/lyt/emit_layout_tree.py` — CASE B, portrait build path, the import-block
  fix (parallel agent + my `noUnusedLocals` fix).
- `research/lyt/tests/test_emit_layout_tree.py` — portrait emission tests (parallel
  agent).
- Five test files (listed above under "Tests added/extended").
- `.claude/dispatch-reports/lyt-w3-resizers-probe.mjs` (new) — the Playwright probe,
  kept as a build artifact.

## Biggest concern for the reviewer

The resizer-anchoring bug (found via Playwright, not by inspection) is the strongest
argument that the whole resizer surface needed live verification, not just unit tests
on the pure drag math — the pure functions were always correct; the DOM/CSS
integration was not, silently, until a real mousedown/mousemove sequence exposed it.
The portrait `I_engine` gap and the OUTER-bar landscape-only narrowing are the two
open design questions most likely to need a commissioner ruling before W5's parity
audit closes the loop.
