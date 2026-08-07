# Review: sgf-pass-thumbnail-fix (branch worktree-agent-a81688e34e180e731, HEAD bfa49573)

Fresh-context review, refute posture. All findings WITNESSED by my own execution in the
worktree, not the builder's self-report.

## Findings

1. **Boundary fix is at the right seam and closes the class (WITNESSED, diff read).**
   `renderBoardToSvg`'s `lastMove` param retyped `Point → Move` (`frontend/src/engine/board-renderer.ts`),
   guard changed to `showMarker && lastMove && lastMove.type === 'place'`. This is the
   diagnosis's stronger option (signature-level narrowing over per-call-site guards), so a
   *future* caller cannot reintroduce the class — no caller-side escape hatch remains.

2. **No call site is weakened.** Grepped every `renderBoardToSvg(` invocation in `frontend/src`
   (WITNESSED): only two direct callers — `useCardThumbnail.ts:75` (`lastMove:
   board.nodes[leafId].move`, already `Move | null`) and `LibraryPreviewPane.vue:35`
   (`lastMove: currentNode?.move ?? null`, same). Both were already passing `Move`-typed
   values, so the retype is a pure win, not a narrowing that could break a legitimate
   `Point`-only caller — none exists.

3. **Third call site claim verified correct.** The report's "3rd caller, diagnosis missed it"
   (`LibraryPreviewPane.vue:38`) is real (WITNESSED via grep) and already compatible — no edit
   needed there. The report's third mention, `useThumbnailCache.ts`, is *not* a direct
   `renderBoardToSvg` caller (it builds a `BoardSnapshot` consumed by `MiniBoardSvg.vue` /
   `MiniBoardCanvas.vue`) — I read both consumers and confirmed they already guard
   `lm.type === 'place'` (WITNESSED, `MiniBoardSvg.vue:65`, `MiniBoardCanvas.vue:123`), so
   correctly left untouched.

4. **Red leg fails for the right reason (WITNESSED, independently reproduced).** I restored
   the pre-fix renderer (`git show HEAD~1:...board-renderer.ts`) and reran only the new test
   file: 1 failure, specifically `expect(svg).not.toContain('opacity="0.8"')` — the diff shows
   the exact spurious `<circle ... stroke="white" ... opacity="0.8" />` at `(30,570)` = board
   `(0,0)`. Not a crash, not an unrelated assertion. Restored the file after (`git checkout --`),
   worktree clean.

5. **Marker assertion is anchored on behavior, not string coincidence (ADR-0021).**
   `opacity="0.8"` is documented in the test as the one attribute unique to the marker ring
   (stones/labels don't carry it) — read the renderer, confirmed true. A `type:'place'` sibling
   test asserts the marker still renders (regression guard against "fix by deleting the
   feature"), and a `null`-lastMove case guards the pre-existing good path.

6. **Gates, run myself in the worktree (WITNESSED):**
   - `npm run build` → exit 0, `✓ built in 2.57s` (only pre-existing chunk-size warning).
   - `npx eslint .` → clean, no output.
   - `npm run test:run` (full suite) → `Test Files 82 passed | 3 skipped (85)`, `Tests 1104
     passed | 4 skipped (1108)`, exited cleanly at 100.93s.
   All match the builder's self-report numbers.

7. **Minimal touch (ADR-0004):** only `board-renderer.ts` + the new test file changed in
   `frontend/`; `package.json`/`package-lock.json`/`backend/requirements.txt` diffs present in
   `git diff next...HEAD` are pre-existing Dependabot merges already living on this branch's
   older base, not authored by this fix — confirmed via `git log next..HEAD` showing those as
   separate prior commits, not part of `bfa49573`.

No defects found. No nits.

## Verdict: ACCEPT
