# Fresh-context review — UI defects batch 1 (Defects 1, 3, 7, 8)

Reviewer: independent session, no prior context. Read in full before review:
`frontend/CLAUDE.md`, `law/adr/0021-witness-construction-discipline.md`,
`law/adr/0010-render-locality-and-canvas.md`, and the spec sections
(Defect 1, Defect 3, Defect 7, Defect 8) of
`.claude/dispatch-reports/ui-defects-investigation.md`. Refute posture:
verified via `git diff next...HEAD` on each branch's fix commit only, ran
`npm run build`, `npx eslint .`, `npm run test:run` myself in each
worktree (not trusting builder self-reports), recomputed WCAG contrast
independently, and merge-tested all three branches against `next` and each
other in a throwaway local branch.

## Fix 1 — worktree-agent-ab1b568e33f97aa59 (c0f3867e), Defect 1

**WITNESSED.** `watchdogClasses` now reads `displayed.value.pingPendingSince`
/ `displayed.value.latency` (the `useThrottledSnapshot`-gated ref), not
`metrics.value.*`. Grepped the full file for every `metrics.value` /
`displayed.value` occurrence: the only remaining `metrics.value` reads are
inside `liveMetrics`, which itself feeds `useThrottledSnapshot` — read
`useThrottledSnapshot.ts` myself: the returned `snapshot` ref only mutates
on the leading+trailing throttle's fire (≤4 Hz), and the template only ever
binds `displayed.value.*`, never `metrics.value.*` directly or `liveMetrics`
directly. So the render/template graph has zero remaining un-throttled
1 Hz-coupled reads — the fix genuinely removes the render coupling per
ADR-0010, not just for the watchdog dot but confirmed for the whole
computed graph.

"Latency spike flips promptly" preservation: watchdog cadences are 500ms
(ping-tandem animation) and ~5000ms (sample poll); folding into the
existing 250ms throttle adds worst-case 250ms latency, an order of
magnitude below both — the property is preserved in practice, and the
tradeoff is documented in-code (not just in the report).

**Witness-construction (ADR-0021) judgment on the UNEXERCISED test:**
correct call. The defect is a render-coupling property; a pure-function
extraction of the class-classification logic would pass identically fed
from either `metrics.value` (buggy) or `displayed.value` (fixed) —
exactly the "proxy witness" ADR-0021 Rule 1 forbids. A real witness needs
a mounted-component recompute-count assertion, which the dispatch brief's
own TEST section put out of scope. No feasible honest test was skipped.

**Gates, run by me:** build PASS, eslint PASS (clean exit), `test:run`
PASS — 1101 passed/4 skipped, 126.6s wall, clean exit (no hang).

**Verdict: ACCEPT.**

## Fix 2 — worktree-agent-a05345d0d7d73da7e (fb704f6b), Defects 3 + 8

**theme.css:** `--duration-default` 0.2s → 0s, single line. Confirmed
`--duration-slow` (1s) untouched and its only two consumers
(`PboPopover.vue` busy-dot pulse, `ToolbarEngineMetrics.vue`
`.watchdog-pinging`, both `animation:` not `transition:`) are unaffected.
`MoveSuggestions.vue`'s `moveSuggestionsFadeMs` knob is inline-justified,
untouched, confirmed by diff scope (only theme.css and card-tree-echarts.ts
touched). The consolidation comment was rewritten to state the current 0s
value and the exemption rationale truthfully — no stale "0.2s" claim left
in prose (checked against the diff, not the builder's paraphrase).

**card-tree-echarts.ts:** `card` branch gains
`label: { show: true, formatter: () => String(node.cardId) }`; `name`
stays `` `Card ${cardId}` `` (grepped: unchanged in the diff). Matches the
sibling `stub`/`bucket` branches' existing `label.formatter` pattern —
confirmed by reading those two branches in the file; same shape, same
`label` key placement. `isSuspended` spread still overrides after the new
base key, per file order — unaffected.

**Test:** new `tests/unit/charts/card-tree-echarts.test.ts` — a genuine
Rule-1/Rule-4 witness (ADR-0021): asserts `name` stays `"Card 3179"` while
`formatter()` returns `"3179"`, and reports red/green was actually
witnessed (stashed the fix, watched both assertions fail for the right
reason — `formatter` undefined — then restored and watched them pass).
This is the correct shape: observes the property (rendered text vs.
internal name) directly, not a neighboring proxy.

**Gates, run by me:** build PASS, eslint PASS, `test:run` PASS — 1103
passed/4 skipped (one more test file than Fix 1/3, from the new unit
test), 127.1s wall, clean exit.

**Verdict: ACCEPT.**

## Fix 3 — worktree-agent-a31b81a69dbdd699c (a96d62ca), Defect 7

**Contrast-math adjudication (recomputed independently, standard sRGB
relative-luminance formula):**

| pair | contrast |
|---|---|
| `#111111` vs `#1a1a1a` (current defect) | **1.0850** |
| `#707070` vs `#1a1a1a` (builder's fix) | **3.5145** |
| `#3a3a3a` vs `#1a1a1a` (investigation report's illustrative suggestion) | **1.5301** |

**The builder was right, the investigation report was wrong.** `#3a3a3a`
does not clear the 3:1 (WCAG SC 1.4.11 / C19) floor — it lands at 1.53:1,
barely better than the original 1.085:1 defect. `#707070` clears it with
margin at 3.51:1. (The report's `#3a3a3a` was explicitly hedged as
illustrative ("something like"), not computed — the builder's report
correctly flags this and the numbers bear it out.)

**Leak-safety, verified myself:** `--tree-node-black-fill` is declared
only inside `[data-theme="dark"] .tree-widget-wrapper` (grepped
`theme.css` for every `[data-theme=...]` block: `dark` and `cluster`
only; `cluster` never sets the property). `.tree-widget-wrapper` grepped
across `src/`: single occurrence, in this file — the unscoped `<style>`
block's global selector cannot bleed into any other component. The `var()`
fallback resolves to the original literal `#111` everywhere else,
including `cluster` and any undecorated default. No leak.

**Render-locality (ADR-0010):** `nodeFill()` is unchanged in shape — a
plain synchronous function of `item.move.color`, same signature, same call
sites. The dark-lift resolves via CSS cascade at paint time; no new
reactive read, no JS theme-sniffing added. Confirmed by reading the diff:
the only non-comment code change is the returned string literal
(`'#111'` → `'var(--tree-node-black-fill, #111)'`).

**Special-order item — the test:run "hang" claim.** The builder's report
says the foreground `npm run test:run` hit the 120s tool timeout and was
backgrounded, attributing this to "the known pre-existing environment
issue" (vite≥8.0.12/vitest teardown deadlock) — but its own tail shows the
backgrounded run **completed** with `Duration 152.93s` and a clean pass
count. That is not a hang; a genuine deadlock never reaches a Duration
line at all. **I ran `test:run` myself in this worktree, fresh:** it
exited cleanly, no backgrounding needed — `Test Files 81 passed | 3
skipped (84)`, `Tests 1101 passed | 4 skipped`, wall time 96.5s (`time`
command total 1:37.41). This worktree's merge-base is `3378806f` (PR #444,
a vite 8.0.16 dependabot bump merged well after the historical
import-cycle hang was fixed on `next`, and its installed `vite` is 8.2.0)
— consistent with the umbrella memory note that ≥8.0.12 without the
import-cycle is fine. **Conclusion: the builder's "hang" framing was a
misattribution.** The suite is simply slow (~100-150s) in this
environment, not hung; it exits cleanly every time, including under my
own independent run. This does not block acceptance, but the report's
wording should be corrected before it's read as a standing risk.

**Gates, run by me:** build PASS, eslint PASS, `test:run` PASS (see above
— exited in 96.5s, no hang, no regression).

**No unit test shipped** — builder's reasoning (no exported symbol from
`<script setup>`, and the interesting half is a CSS-cascade question
jsdom can't observe) is sound; UNEXERCISED is the honest call here too.

**Verdict: ACCEPT.** (Would be ACCEPT-WITH-NITS solely for the
"hang" misattribution in the committed report — worth a one-line
correction, not a blocker.)

## Cross-branch conflict check

Merged all three branches into a throwaway local branch off `next`
(`tmp1` → commit → `tmp2` → commit → `tmp3` → commit, each
`git merge --no-ff`): **zero conflicts**, all three auto-merged cleanly
against `next` and against each other. Diff of the merge result against
`next`, filtered to the five files these fixes touch, shows exactly the
expected disjoint hunks:
`theme.css` (+32/-30 net), `card-tree-echarts.ts` (+10), `ToolbarEngineMetrics.vue`
(+61/-30 net), `TreeWidget.vue` (+38), `timing.ts` (+11/-4) — no file
touched by two branches at once.
The pre-analyzed disjointness (theme.css/TreeWidget.vue non-overlapping
lines) holds. Test branch and temp refs deleted after the check; working
tree returned to original state.

## Recommended merge order

No ordering constraint exists (files are fully disjoint, gates pass
independently in every worktree, and the 3-way merge test above raised no
conflicts in any order). Suggested order, smallest/lowest-risk first
purely for review hygiene:

1. **worktree-agent-a31b81a69dbdd699c** (Defect 7, TreeWidget contrast) — single file, ACCEPT.
2. **worktree-agent-ab1b568e33f97aa59** (Defect 1, toolbar flicker) — two files, ACCEPT.
3. **worktree-agent-a05345d0d7d73da7e** (Defects 3+8, theme.css + card-tree) — two files + new test, ACCEPT.

## Summary

| Fix | Verdict |
|---|---|
| Defect 1 (toolbar flicker) | ACCEPT |
| Defects 3+8 (transitions + card labels) | ACCEPT |
| Defect 7 (dark tree contrast) | ACCEPT (report's "hang" claim is a misattribution — not a real hang, does not block) |

All three: build/eslint/test:run witnessed clean by me in each worktree,
independently of builder self-reports. No merge conflicts among the three
or against `next`.
