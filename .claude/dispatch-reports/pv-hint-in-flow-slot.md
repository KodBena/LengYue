# Dispatch report — PV-paste hint becomes a permanent in-flow slot (ledger row 837)

## Commission (verbatim, ledger row 837)

"Ctrl+click to paste PV" transient hint in `frontend/src/components/board/StatusBar.vue`
has been through two defective states, both commissioner-witnessed:

1. Original: an in-flow flex-sibling that appeared on hover, growing the status
   bar and resizing the board.
2. Current at commission time (a prior fix, `ddfa0145`): `position: absolute;
   left: 0; bottom: 100%` on `.transient-hint` with `.status-right { position:
   relative }` — floating the hint OVER the board's bottom-right corner
   (occluding edge coordinates) and letting an ancestor clip it mid-word into
   an illegible "Ctrl+cli…" box (screenshots `~/occluded.png`,
   `~/occluded2.png`).

Required mechanism (commission-directed, not this builder's to redesign): a
permanently-present in-flow flex slot in the existing dead gap between the
komi field and the Pass button — always rendered in both states (no `v-if`
insertion/removal), `flex: 1 1 0; min-width: 0; overflow: hidden;
text-overflow: ellipsis; white-space: nowrap;`. Empty content when no hint is
active. Remove the previous fix's absolute/relative positioning machinery and
correct its now-wrong comments (ADR-0005). Ensure `.caps` cannot wrap in
either state.

## Worktree freshness (first action, before reading code)

`pwd` confirmed the isolated worktree
(`/home/bork/w/omega/.claude/worktrees/agent-a1e5184a3655baa21`). HEAD was
`3378806f`, which turned out to be **diverged from, not simply behind**,
`origin/next` (95e85b0d): the worktree carried 10 dependabot-merge commits
`origin/next` lacked, while `origin/next` carried 5 commits (the tab-strip
virtualization arc) the worktree lacked. Merging `origin/next` alone would
have missed the local `next` branch's tip, `8d8ed48f` (one further commit
ahead of `origin/next`, itself the merge that lands `ddfa0145` — the very
"current defective state" the commission describes). Two merges were run in
sequence: `git merge --no-ff origin/next`, then `git merge --no-ff next`. Both
completed with **no conflicts**; the second confirmed
`frontend/src/components/board/StatusBar.vue` on disk after both merges
matched the commission's description of state 2 exactly (`.transient-hint {
position: absolute; ... }`, `.status-right { position: relative; ... }`)
before any edit was made. Disclosed per the task's freshness instruction; HEAD
after both merges is `68f35f4b`.

## What the overlay approach (state 2, `ddfa0145`) missed

The overlay fix correctly solved reflow (taking the hint out of flow makes
mount/unmount geometry-inert) but traded one defect for two new ones, both
consequences of "out of flow" as a mechanism:

- **Occlusion.** `position: absolute; bottom: 100%` floats the hint above
  `.status-right`, which sits at the bar's right edge — directly over the
  board's bottom-right corner in the actual layout (the status bar sits
  immediately below the board). An out-of-flow element floats *over*
  whatever content is behind it in the stacking context; there is no way to
  make an absolutely-positioned overlay definitionally unable to cover
  content, because covering content *is* what taking something out of flow
  does. Occlusion of board edge coordinates was not an edge case of state 2 —
  it fell directly out of the "float above the bar" strategy the moment the
  bar sits adjacent to the board (which it always does in this app).
- **Mid-word clipping.** State 2's `.transient-hint` had `white-space:
  nowrap` but no `max-width` or `overflow`/`text-overflow` — an
  absolutely-positioned element with `white-space: nowrap` and no
  containing-block width constraint has no reason to clip at all under
  normal circumstances, but an ancestor with `overflow: hidden` (the
  reported screenshots show a board/chrome ancestor clipping it) clips
  whatever pixels of it fall outside that ancestor's box, mid-character,
  with no ellipsis — because nothing in the state-2 CSS declared a clip
  boundary of its own with `text-overflow: ellipsis`. The overlay had no
  owned boundary; whatever bounded it was accidental (an ancestor's
  `overflow: hidden` written for an unrelated reason), so the clip point was
  wherever that ancestor's box happened to end, not a controlled ellipsis.

The commissioned mechanism (a permanent in-flow flex slot) closes both by
construction: in-flow means the slot can only ever displace its own flex
siblings inside the bar, never anything outside it — occlusion of the board
is impossible, not merely unlikely. And the slot owns its own overflow
boundary (`overflow: hidden; text-overflow: ellipsis`) at a flex-basis it
controls (`min-width: 0` + `flex-shrink: 1`), so clipping is always a
controlled ellipsis at the slot's own edge, never an accidental ancestor
clip mid-word.

## Fix

`frontend/src/components/board/StatusBar.vue`, CSS-and-template only:

- **Template.** `.transient-hint` moved out of `.status-right` to a sibling
  position between `.status-left` and `.status-right` inside `.status-bar`
  (the bar's existing dead gap — `.status-bar` is `justify-content:
  space-between`, and the new slot's `flex-grow: 1` claims exactly that
  spare width). The `v-if="hint"` guard was **removed**: the span is now
  always rendered, with `{{ hint }}` (empty string when `hint` is `null`)
  as its only content. No component logic changed — `hint` was already the
  same `useTransientHint()` read used before.
- **`.status-right`** lost `position: relative` (no longer an anchor for
  anything) and its now-wrong comment.
- **`.transient-hint`** lost `position: absolute; left: 0; bottom: 100%;
  margin-bottom; padding; background; border; border-radius;
  pointer-events: none` (all overlay-only machinery) and gained
  `flex-grow: 1; flex-shrink: 1; flex-basis: 0; min-width: 0; overflow:
  hidden; text-overflow: ellipsis; white-space: nowrap`. Longhand `flex-*`
  properties rather than the `flex: 1 1 0` shorthand — see the "jsdom
  shorthand" note below. The block comment was rewritten end to end (not
  patched) to describe the current mechanism and both defective priors, per
  ADR-0005 (the old comment described a mechanism no longer present).
- **`.caps`** gained `white-space: nowrap`, with a short comment. The
  permanent slot's `flex-grow` already absorbs the bar's free space so
  `.caps` shouldn't need to wrap in practice, but the commission asked for
  this explicitly as a second line of defense against the original
  reflow mechanism (an unconstrained sibling wrapping and growing the bar's
  `min-height`).

No i18n text changed. No composable or store code changed —
`useTransientHint` (`src/composables/useTransientHint.ts`) was read in full;
its only other caller is `MoveSuggestions.vue` (`setHint`/`clearHint`, the
write side), which needed no change since the read side (`hint`) is
unchanged in shape. The permanent slot serves that caller (and any future
`setHint` caller) the same way the old `v-if` slot did — one shared
module-scope ref, one render surface.

### jsdom shorthand note (test-authoring finding, not a product bug)

While authoring the test, `flex: 1 1 0` (shorthand) computed back as
`flexGrow: '0'` under jsdom's `getComputedStyle`, despite being applied
correctly in real browsers (verified against the CSS spec's shorthand
expansion — `flex: 1 1 0` is `flex-grow: 1; flex-shrink: 1; flex-basis: 0`
verbatim). jsdom's CSSOM does not expand this particular shorthand into its
longhand computed values. The CSS was written in longhand (`flex-grow: 1;
flex-shrink: 1; flex-basis: 0;`) instead — behaviourally identical in a real
browser, but legible to both the browser and jsdom's `getComputedStyle`,
which is what the regression test needs to assert against. This is called
out with a comment at the declaration site so a future maintainer doesn't
"simplify" it back to the shorthand and silently break the test's ability to
observe it.

## Tests

`frontend/tests/integration/status-bar-hint-no-reflow.test.ts` was rewritten
end to end (not patched) to pin the new invariant instead of the superseded
`position: absolute` one. Four assertions, each independently verified:

1. **WITNESSED** — `.transient-hint` exists in the DOM with empty text when
   no hint is published. This is the structural claim that most directly
   falsifies a `v-if`-based mechanism: a `v-if="hint"` guard would make this
   assertion fail (`hintEl.exists()` would be `false`).
2. **WITNESSED** — after `setHint(...)`, the same element (element count
   stays at exactly 1 across the mount) now has the hint's text. This
   asserts the element is never inserted/removed, only its text content
   changes.
3. **WITNESSED** — the load-bearing style assertions: `position` is never
   `'absolute'` (regression guard against state 2 recurring), plus
   `flex-grow: 1`, `flex-shrink: 1`, `min-width: 0px`, `overflow: hidden`,
   `text-overflow: ellipsis`, `white-space: nowrap` on the computed style.
4. **WITNESSED** — `.caps` computes `white-space: nowrap`.

Per the task's instruction, the fix was verified red-without-fix and
green-with-fix using a **scratch copy**, not `git stash` (hard constraint):
`cp StatusBar.vue StatusBar.vue.scratch-bak`, then `Edit` reverted the file's
template (`.transient-hint` back inside `.status-right` under `v-if="hint"`)
in place, ran the test, then `mv` restored the saved copy over the edited
file. Observed failures with the reverted (state-2-shaped, `v-if`) template:

```
× renders .transient-hint even when no hint is published — it is NOT v-if-inserted
  AssertionError: expected false to be true
× renders the same .transient-hint element (with text) once a hint is published
  AssertionError: expected +0 to be 1
```

(Tests 3 and 4, the style-declaration and `.caps` assertions, still passed
under the reverted template since the CSS block itself wasn't touched in
that scratch revert — only the two structural/`v-if` assertions are sensitive
to the template change, which is exactly the invariant they exist to pin.)
With the saved copy restored, all four tests passed again (verified,
reported in the Gate results below).

An intermediate debugging pass (not part of the final suite) also confirmed
the jsdom-shorthand finding above by asserting on the raw computed-style
string before settling on the longhand fix; that scratch test file
(`tests/integration/zzdebug.test.ts`) was deleted before the final gate run
and is not part of this commit.

## Gate results (all WITNESSED)

- `npx vue-tsc --noEmit` — **exit 0**, no output.
- `npx vitest run --silent=true tests/integration/status-bar-hint-no-reflow.test.ts`
  — **exit 0**: 1 file, 4 tests, all passed.
- `npx vitest run --silent=true` (full suite, `nice -n 19` +
  `NODE_OPTIONS=--max-old-space-size=2048` + `VITEST_MAX_THREADS=2
  VITEST_MAX_FORKS=2`) — **exit 0**: 153 test files passed, 3 skipped (156
  total); 1828 tests passed, 4 skipped (1832 total). The 4 skips are
  pre-existing and unrelated to this change (not investigated further — out
  of scope for a status-bar CSS/template fix).

## Deviations / notable facts

- `frontend/node_modules` did not exist in this worktree checkout — `npm
  install` was run once (5s, 335 packages added) before either gate could
  execute at all. `package-lock.json` was not modified; `git status`
  afterward shows no lockfile diff.
- The worktree's HEAD required **two** merges (`origin/next`, then local
  `next`), not one, because the local `next` branch was itself ahead of
  `origin/next` by the exact commit (`8d8ed48f`) that lands the state-2 fix
  this commission supersedes. Both are disclosed above under "Worktree
  freshness."
- No sub-agents were spawned, per the hard constraint.
- Live ports 4173/5173/5174/8764/19080/19081 were never touched — only
  `vue-tsc`, `vitest`, and `npm install` ran (no dev server, no preview
  server).
- No scope reduction was applied at any point. The full commissioned
  mechanism (permanent in-flow flex slot, removed absolute/relative
  machinery, corrected comments, `.caps` nowrap, rewritten test) was
  delivered as specified.

## Branch and commit

Branch: `worktree-agent-a1e5184a3655baa21`. Commit SHA is recorded below
after committing (see final reply for the authoritative value).
