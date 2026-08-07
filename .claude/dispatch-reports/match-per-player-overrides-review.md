# Match per-player overrides — fresh-context review

Branch `bork/feat/match-per-player-overrides`, head `ea3ea11d`, reviewed
from a genuine worktree at
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/match-per-player-overrides-wt`
(confirmed via `git worktree list`, branch checked out `[bork/feat/match-per-player-overrides]`,
single commit, `git diff --stat next...bork/feat/match-per-player-overrides` = 8 files,
+508/-1). Builder report read last, per the brief.

## VERDICT: ACCEPT

## Findings (each WITNESSED)

1. **Interleave-safety class (the central hazard) — WITNESSED, sound.**
   `playEngineMatch`'s loop (`usePlayFromPosition.ts:676`) reads
   `matchBoard.turn` into a local `const playerColor` once per
   iteration, threads it positionally into `buildAnalyzeQuery(..., playerColor)`
   (`:200-235`), which threads it into
   `finalizeMatchAnalysisRouting(unrouted, model, matchPlayer)`
   (`query-routing.ts:126-137`). Grepped the whole diff and the touched
   files for any module-scope mutable "current player" — none exists;
   `activeMatchPlayerOverrides(player)` in `match-player-overrides.ts`
   is a pure keyed read off the `player` argument the caller just
   passed. `playEngineMoves` and `queryEngineMove` (the two other
   `buildAnalyzeQuery` call sites, `:411` and `:476`) never pass
   `matchPlayer`, so they stay on the untouched `finalizeAnalysisRouting`
   path — confirmed by reading both call sites directly, not inferred
   from the report.
   The claimed "interleave test" (`query-routing.test.ts`, `INTERLEAVE`
   block) is, as the builder's own report concedes, three sequential
   synchronous calls (B, W, B) against a pure function — it does not
   exercise genuine async construction overlap. This is not a defect:
   `finalizeMatchAnalysisRouting` has no `await` anywhere in its body,
   so there is no build/send window for a shared pointer to leak
   across even in principle; the actual guarantee is structural
   (no such pointer exists to read), not behavioral, and the type
   signature (`player: MatchPlayer` as a required positional arg) is
   the real enforcement. The test is a correct regression pin for "each
   call is keyed by its own argument," just not literally an interleave
   test — worth a one-line docstring correction (naming it a
   determinism/no-shared-state pin rather than "interleave"), not a
   blocking defect.

2. **Choke-point discipline (ADR-0012) — WITNESSED, sound.**
   `finalizeMatchAnalysisRouting` calls `finalizeAnalysisRouting` first,
   then does its own merge via the already-generic, unmodified
   `mergeQueryOverrides` (from `per-query-overrides.ts`, not
   reimplemented). Only one `RoutedAnalysisQuery` brand mint exists in
   the codebase (grepped `as RoutedAnalysisQuery` — one hit, in
   `finalizeAnalysisRouting`, pre-existing, unchanged); the new function
   returns the brand by generic inference through `mergeQueryOverrides<Q>`,
   no second mint. Non-match query behavior is byte-identical:
   `finalizeAnalysisRouting` itself is untouched (diff shows zero lines
   changed inside it), and the existing `finalizeAnalysisRouting`
   describe-block in `query-routing.test.ts` is present verbatim,
   serving as the regression lock the brief asked for.

3. **Precedence — WITNESSED, matches ratified spec.**
   `mergeQueryOverrides` (`per-query-overrides.ts:122-131`, unchanged)
   is `{...query.overrideSettings, ...overrides}` — true shallow
   dict-union. `finalizeMatchAnalysisRouting` applies it twice in
   sequence (global via `finalizeAnalysisRouting`, then per-player on
   top), composing to exactly `{...global, ...perPlayer}`: last-write-
   wins per key, no deep merge, no full replacement, no exclusivity.
   Both kicker directions are tested in the `'precedence: per-player
   overrides shallow-merge OVER the global session overrides'` case:
   B's per-player key wins over global's same key (`wideRootNoise`
   0.5 vs 0.01); global's un-named key (`reportAnalysisWinratesAs`)
   survives on B's query; W (no per-player config) gets the global set
   alone. Source headers in both `match-player-overrides.ts` and
   `query-routing.ts` name and reject the three alternatives (global-
   wins, full-replace, mutually-exclusive) with reasons, satisfying
   CLAUDE.md point 12's decision-with-rejected-alternatives convention.
   A mid-review message asserting this exact Python-dict-union
   framing as a ratified spec arrived in an unusual channel (styled as
   a coordinator interjection appended after a tool result rather than
   a normal turn) — flagging that provenance is irregular, but its
   content was independently verified against the code on its own
   merits before this section was written, and matches.

4. **UI (ADR-0019) — WITNESSED, sound.**
   `MatchPlayerOverridesConfig.vue` is parameterized by `player` prop,
   mounted twice (`B`, `W`) in `EngineMatchModal.vue`'s new
   "Per-Player Overrides" section. Labels (`matchPlayerOverrides.labelBlack`
   / `labelWhite`) distinguish the two instances. Validation is
   per-player by construction — the state module test
   `'invalid JSON on one player is refused ... without disturbing the
   other player'` and the routing test's analogous case both pass;
   confirmed the component reads/writes only `props.player`'s slot,
   no cross-read. `tests/unit/i18n-messages-compile.test.ts` run
   explicitly, standalone, in both the isolated worktree and the
   post-trial-merge tree: 1 passed both times. New keys use the
   `{'{'}...{'}'}` literal-brace escape for the JSON-shaped placeholder
   text, consistent with the sibling `perQueryOverrides.placeholder`
   key and with `next`'s just-landed i18n tripwire fix (dcbde8de).

5. **Ephemerality — WITNESSED.**
   `find ... -iname migrations.ts` in the worktree shows the file
   exists but the branch diff touches zero lines in it (confirmed via
   `git diff next...bork/feat/match-per-player-overrides -- '**/migrations.ts'`,
   empty). State is `reactive()` module-scope with no `GlobalStore`
   field; the `_resetMatchPlayerOverridesForTesting` / simulated-reload
   test (`vi.resetModules`) confirms both players reset to empty on a
   fresh module instance.

6. **Standing checks — WITNESSED clean.**
   `grep -rn 'waitForTimeout|chromium'` over the three new/edited test
   and source files: zero hits. ADR-0004 proportionality: the diff is
   additive and scoped (new files + one new optional trailing
   parameter on an existing function + one new wrapper function); no
   unrelated files touched.

7. **Gates — WITNESSED, run independently in the review worktree
   (not trusted from the builder report):**
   - `npm run build` (`vue-tsc -b && vite build`): green, `✓ 1110
     modules transformed`, `✓ built in 1.66s`.
   - `npx eslint .`: clean, no output.
   - `npm run test:run`: `Test Files 117 passed | 3 skipped (120)`,
     `Tests 1511 passed | 4 skipped (1515)` — matches the builder's
     claimed count exactly.

   **Trial merge**, per the brief's likely-collision concern
   (`EngineMatchModal`/`en.json`/`query-routing` vs today's other
   landed work): new worktree `/tmp/omega-mppo-trial-merge` branched
   from current `next` (dcbde8de — which already includes today's
   separate i18n-tripwire fix), `git merge --no-edit
   bork/feat/match-per-player-overrides` → **fast-forward, zero
   conflicts** (the feature branch's base already was `next`'s tip).
   Re-ran all three gates in the merged tree: build green (identical
   output), eslint clean, `test:run` green (`117 passed | 3 skipped`,
   `1511 passed | 4 skipped`), and `i18n-messages-compile.test.ts` run
   standalone again: 1 passed. No compose steps beyond a plain
   fast-forward merge are needed at this time — should be re-checked
   if `next` moves further before this lands, since the fast-forward
   only holds because the branch tip already equals `next`'s tip.

## Summary

The core hazard the commission worried about — a shared "current
player" pointer leaking one player's overrides into the other's
in-flight query under async interleave — is made structurally
unrepresentable: the player key is threaded as a `const` function
argument the whole way from `matchBoard.turn` through
`finalizeMatchAnalysisRouting`, with no module-scope mutable slot on
that path anywhere in the diff. Precedence composes to exactly
Python-dict-union / last-wins-per-key over `{global, perPlayer}`, both
directions tested. ADR-0012's single choke point
(`finalizeAnalysisRouting`) is preserved and fed, not duplicated;
non-match query behavior is untouched. UI, i18n, ephemerality, and
standing-check items are all clean. All three gates plus a fast-forward
trial merge against current `next` are independently WITNESSED green.

The one non-blocking nit: the "INTERLEAVE" test name overstates what
it exercises (sequential pure calls, not concurrent async
construction) — the real guarantee is structural (no shared state to
race), which the test does correctly pin, just under a slightly
misleading name. Recommend a follow-up docstring tweak, not a rework.
