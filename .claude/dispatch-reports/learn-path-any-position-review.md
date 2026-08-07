# Review — learn-path-any-position (fresh-context, REFUTE posture)

Artifact reviewed: branch `worktree-agent-ac06eda9f41b0ccbe`, fix commit `ab1af2a4`
(+ report commit `160095ed`), worktree at
`/home/bork/w/omega/.claude/worktrees/agent-ac06eda9f41b0ccbe`. No findings were
handed to this review; it was formed independently and the builder's self-report
(`.claude/dispatch-reports/learn-path-any-position.md`) was read only afterward,
per the review brief.

## Verdict: ACCEPT-WITH-NITS

## Basis

The commission (ledger row 832) rejected two v1 preconditions in
`useLearnPath.ts`'s `explore()` — `board.sourceCardId` required, cursor pinned
at the board root — as narrowing that turned "I want to learn this path" into a
door slamming shut. The delivered `resolveAnchor(boardId, tag)` deletes both
preconditions outright (not softened to a warning) and replaces them with a
single mechanism applied uniformly to any board/cursor position: hash the
current position via the real mint-draft serializer, reuse an existing card on
a hit, mint a fresh one through the real mint path on a miss. Independent
tracing (not the report's prose) confirms the mechanism is genuinely general —
`walk()` reads `state.currentNodeId` throughout, never `rootNodeId`; no UI call
site gates the "Learn this path" button on `sourceCardId` or cursor position;
the legacy fast path is reached as an instance of the general mechanism (case 1
finding the board's own card), not a dedicated branch. The load-bearing
soundness claim — that the duplicate-check hash and a manual mint's
`raw_content` cannot silently diverge — holds under independent call-graph
tracing: both `resolveAnchor`'s `checkForDuplicate(draft.raw_content)` and
`commitMint`'s `rememberMintedCard(payload.raw_content, ...)` consume the
identical `draft.raw_content` string produced by one `prepareDraft(boardId)`
call (`serializeActivePath(board)`), so there is no second serialization site
for drift to open.

Merge onto current `origin/next` (`95e85b0d`) is clean (no conflicts); the
merged tree typechecks clean and the full suite is green. Two of the four new
tests were mutation-falsified and both failed as expected when the behavior
they claim to guard was broken, so they are load-bearing, not decorative.
Failure-path tracing (independently reproduced, not just read) confirms
fail-loud behavior with no half-state: an anchor-mint failure mid-explore
rejects with the backend's own error and leaves the board's node tree
unchanged (walk() never starts); a board close during `resolveAnchor`'s own
awaits does not corrupt any other board and does not throw — it can leave a
harmless orphaned anchor card with no descendants, which is exactly what the
module header documents and the builder's report names as an accepted,
undischarged residual (not silently dropped).

The ACCEPT-WITH-NITS calibration (not a plain ACCEPT) is for one stale
documentation defect (`Toolbar.vue`'s comment) and one unclosed, low-severity
residual risk (board-close race during anchor resolution) — neither cuts the
commissioned feature or reintroduces the rejected preconditions, so neither
rises to REJECT under the substitution test.

## Findings

1. **(nit) Stale comment, `frontend/src/components/chrome/Toolbar.vue:137-141`.**
   The "Learn this path" button's comment still says the modal "self-gates on
   the loaded-card-at-root precondition" — that precondition is exactly what
   this change deleted. Not a behavioral bug (the button was already an
   unconditional click target before this change, per the same comment), but
   it is now a false statement about the code, which is the documentation
   discipline this codebase treats as part of the work. Should be updated in
   a follow-up touch to that file.
2. **(accepted residual, not a defect)** The `resolveAnchor`-phase board-close
   race (a board can close between `checkForDuplicate`'s/`commitMint`'s awaits
   and `walk()`'s first checkpoint, leaving an orphaned anchor card with no
   descendants) is undischarged. Independently reproduced (see Witnesses
   below): no corruption, no throw, no half-grown tree — the orphan-card cost
   matches the pre-existing `writeLiveBoard` abort-signal design for the
   walk phase, and is honestly documented in the module header rather than
   swept under a green suite. Untested by an automated case in the delivered
   suite, but traced and reproduced independently here.
3. **No unratified scope narrowing found.** See the extracted-restrictions
   list below — every restriction remaining in the delivery is either
   pre-existing genuine input validation the commission did not touch, or an
   honestly-documented accepted-cost residual outside the commission's ask.
   Nothing found that substitutes for, or quietly shrinks, "learn this path
   from any cursor position."
4. **Serialization-soundness claim: independently verified true**, not just
   plausible-sounding prose (see Witnesses below) — this was the single
   highest-risk claim in the delivery (a silent divergence here would make
   the dedup check permanently useless) and it traces to one shared call
   site, not a copied serializer.

## Scope restrictions extracted, with ratification status

| Restriction found in the delivery | Ratification status |
| --- | --- |
| `depth >= 1`, `topK >= 1`, non-empty `tag`, board must exist — `LearnPathPreconditionError` | Ratified: commission text explicitly reserves `LearnPathPreconditionError` for "genuinely-impossible input"; these four are the only ones remaining and none constrain WHERE the anchor may be, only that the call is well-formed. Pre-existing, untouched by this change. |
| The two `sourceCardId`/cursor-at-root preconditions | REMOVED — this is the commission's central ask, not a residual restriction. Confirmed removed by code reading, not by trusting the diff's own commit message. |
| Known-positions map can be stale (false miss, never false hit) | Ratified by precedent: the report and the module header point to `card-position-annotations-design.md`'s existing accepted-cost posture for the same map; this is not a new restriction introduced by this change, and its only cost is a redundant mint, self-correcting within the session. |
| Board-close race during `resolveAnchor`'s own awaits is not closed | Not separately ratified by name, but not a scope cut either — it is an edge-case robustness gap in a mechanism that is otherwise fully general, documented plainly rather than hidden, and matches the severity/shape of a pre-existing accepted race in the same file's walk phase. Flagged above as an accepted residual, not grounds for REJECT under the substitution test (closing it is not "the feature"; the feature is anchor-from-anywhere, which works correctly in the race-free case and fails safely, not silently, in the race case). |
| Toolbar.vue's stale "self-gates on loaded-card-at-root" comment | Not a code restriction at all (the button was never actually gated) — a documentation-accuracy nit, listed above as finding 1. |

## Per-claim verification status

- **Merge onto current `next` is clean** — WITNESSED. Fetched `ab1af2a4`'s
  history into this checkout, merged onto `origin/next` (`95e85b0d`) on a
  scratch branch; no conflicts.
- **`vue-tsc --noEmit` on the merged result** — WITNESSED. Exit clean, no
  output.
- **`vitest run --silent` on the merged result** — WITNESSED. 153 files / 1829
  tests passed, 3 files / 4 tests skipped (pre-existing, unrelated), 0 failed.
  Run memory-capped (`nice -n 19`, `NODE_OPTIONS=--max-old-space-size=2048`,
  `VITEST_MAX_THREADS=2 VITEST_MAX_FORKS=2`) per the review brief.
- **Serialization-soundness (dedup hash input == manual-mint raw_content,
  same code path, not a copied serializer)** — WITNESSED by independent call-
  graph trace: `useLearnPath.resolveAnchor` calls `useMinting.prepareDraft`
  (the same function `MintCardModal`'s manual-mint flow calls) and passes its
  `draft.raw_content` unmodified to both `checkForDuplicate` (the dedup hash
  input) and `commitMint` (the mint payload, via `{...draft, tags:[tag]}` and
  `rememberMintedCard`). Read the actual source of `prepareDraft`,
  `checkForDuplicate`, and `commitMint` in full; no divergent second
  serialization site exists.
- **Mutation-falsify at least two of the four new tests** — WITNESSED. (1)
  Neutered the anchor-reuse branch (`if (false && existingCardId !== null)`)
  — 8 of 11 tests in the file went red, including tests (a)/(b)/(c)/(d).
  Reverted. (2) Neutered the tag flow on the anchor mint (`tags: [tag]` →
  `tags: []`) — exactly tests (a) and (d) went red (the two tests that assert
  tags on an anchor mint), the rest stayed green. Reverted cleanly (verified
  `git status`/`git diff` clean on the file afterward).
- **Failure paths: anchor mint fails mid-explore; board closed during anchor
  resolution — fail loudly, no half-state, no orphan tree growth** —
  WITNESSED by an independent scratch test (not part of the delivered suite;
  written, run, and deleted during this review — not committed). (1) A
  `createCard` rejection during `resolveAnchor` propagates as a rejected
  `explore()` promise with the backend's own error message; the board's node
  count is unchanged (`walk()` never started). (2) Closing the anchor board
  itself mid-`resolveAnchor` (simulated by closing the board from inside the
  mocked `createCard` resolution) does not throw an uncaught error and does
  not corrupt any other board; `walk()`'s first `writeLiveBoard` call finds
  the board gone and aborts immediately, leaving the exploration empty — the
  orphaned-anchor-card cost documented in the module header, reproduced live
  rather than taken on faith.
- **No live ports touched, no `git stash`** — WITNESSED. All work ran against
  jsdom/fakes; no `git stash` invoked at any point (scratch branches +
  explicit revert-via-copy used instead for the mutation tests).

## Independent read of the builder's own report

Read only after the above was complete. The builder's self-report
(`.claude/dispatch-reports/learn-path-any-position.md`) independently reaches
the same verdict-relevant conclusions this review reached by its own tracing:
the same soundness argument for the serialization claim, the same two accepted
residuals (unreachable defensive branch in `resolveAnchor`; the board-close
race), and a documented rejected-alternatives list for its two central design
choices (reusing `prepareDraft` wholesale rather than mirroring
`buildSeedPayload`; making anchor resolution unconditional rather than keeping
a fast-path bypass). It also reports its own out-of-frame
`hack-rationalization-detector` audit reaching `VERDICT: general` with the same
two residual findings this review names independently. No divergence found
between the self-report's claims and this review's own witnessed evidence; the
one gap this review adds is the stale `Toolbar.vue` comment, which the
self-report does not mention.

License: Public Domain (The Unlicense)
