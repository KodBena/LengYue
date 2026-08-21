# NN-cache-context transition-path fix — build report

Micro-repair against `.claude/dispatch-reports/nncache-live-acceptance.md`'s
Finding (item 1): live-witnessed, reproducible wedge in the attached state on
every `dumpAndDetach`-driven transition (`transition()`, `endSession()`, the
best-effort disconnect hook). Ledger row 2543 ruled the fix. Worktree reset
to `lyt-phase2` tip `427153bc` at session start (the worktree's own branch
was stale, cut from an unrelated old base with zero unique commits ahead of
the tip — confirmed via `git log --oneline <worktree-branch>..427153bc` /
`427153bc..<worktree-branch>` before resetting).

## The defect

`dumpAndDetach()` in `frontend/src/services/nncache-session.ts` sent
`cache_dump {what:'both'}` (default admission `minObservations:2`) followed
by a plain `cache_detach` — no `discardUndumped`. `cache_dump`'s admission
policy legitimately leaves single-observation evaluations off the
`.nnevals` dump even on a fully successful dump (their observation COUNT is
still written to `.nncounts` regardless). The follow-on plain detach was
then refused every time such an entry existed ("N earned entries not on
disk"), reproducing on every attempt in the live-acceptance rig and
live-locking any context switch under background engine traffic.

## The fix

Per ledger row 2543: after a SUCCESSFUL `cache_dump`, the detach leg now
sends `discardUndumped:true` — what it discards is exactly what the
admission policy itself refused to persist (single-observation evals whose
observation count is already on disk via the dump's `.nncounts` leg, so a
future session's re-observation still promotes them past the threshold —
the engine's own documented cross-session admission design, not a
workaround). A FAILED dump is unchanged: the detach leg is still sent
WITHOUT `discardUndumped`, reverting to `attached` and surfacing the
refusal — never discarding work the dump never wrote.

### Files touched

- `frontend/src/services/nncache-session.ts` — `dumpAndDetach()`'s detach
  call now carries `discardUndumped: true`; its doc comment rewritten with
  the full admission-policy rationale (citing `Analysis_Engine.md`'s
  "Persisting a model's cache across sessions" section, per the same
  external-reference citation convention already used elsewhere in this
  file — the doc itself is not checked into this repo, so this follows the
  established convention rather than a fresh read of it). The success-path
  console log now names the discard and logs
  `discardedUndumpedEntries`, matching `disable()`'s existing shape.
  `transition()`'s and `endSession()`'s doc comments updated to describe
  the conditional-discard behavior instead of the old unconditional
  "WITHOUT discarding" claim. Module header's transition-shape comment
  updated to note the conditional `discardUndumped:true`.
- `frontend/tests/integration/nncache-session.test.ts` — the existing
  `transition` "dump then detach then attach" test now asserts
  `discardUndumped: true` on the detach leg (was asserting its absence).
  Added: (a) a new `transition` test pinning that a successful dump
  followed by what would otherwise be an admission-refused plain detach
  now succeeds via the discard, with the discard logged
  (`discardedUndumpedEntries` asserted, console.info spy asserts the log
  message). The existing "a refused dump aborts the transition…" test
  already pinned scenario (b) — failed dump reverts to attached, only the
  dump call is sent, detach never attempted — left as-is (still accurate
  under the fix, since the detach leg is never reached on a dump
  refusal). The `endSession` describe block gets the same detach-leg
  assertion flip plus a new (b)-scenario test
  ("a FAILED dump keeps the current behavior exactly…") mirroring the
  transition case for that entry point.

## Gates (literal exit codes, run on the final tree)

Dependencies were not yet installed in this worktree (`vue-tsc: command not
found`); ran `nice -n 19 npm ci` first (336 packages, clean).

- `nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048 npm run build`
  (`vue-tsc -b && vite build`) — **exit 0**.
- `nice -n 19 env NODE_OPTIONS=--max-old-space-size=2048 npx vitest run
  --changed=427153bc --maxWorkers=2` — **exit 0**: `287 passed | 3 skipped`
  tests across `27 passed | 2 skipped` test files.

No wall-clock sleeps added (`grep -n 'waitForTimeout\|setTimeout'` on the
touched test file: no matches).

## Not folded in

`Analysis_Engine.md` is not present anywhere in this repo tree (checked via
a repo-wide search before writing the doc-comment citation) — it is cited
by the pre-existing code (this file's module header, and the prior
`nncache-detach-repair-build.md` dispatch) as an external KataGo reference
document the team has access to outside the repo. This fix's doc comment
follows that same established citation convention rather than reading a
file that isn't in-tree; surfaced here per ADR-0002 rather than silently
presenting the citation as backed by an in-repo read.
