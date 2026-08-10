# LYT W1 skeleton — repair build (ledger row 1781)

Fresh-context repair builder. Worktree `.claude/worktrees/agent-ac8175631d45349b1`.
Base verified: `5da3f059` (matches `lyt-phase2` at session start; presence.py
confirmed present before any work). Repairs the REJECTED prior attempt
(worktree `agent-a9bb38ddb145fcc79`, commit `2d6e04f7`), fixing the three
named findings from `.claude/dispatch-reports/lyt-w1-skeleton-review.md`
against the ratified commission (`lyt-vue-realization-roadmap.md` §3/§8),
not from the prior builder's own framing.

Documents read end to end before work: `lyt-w1-skeleton-review.md`,
`lyt-vue-realization-roadmap.md`, `lyt-parity-inventory.md`,
`frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md` (surfaced mid-session by
the harness), the umbrella `CLAUDE.md`.

## Per-finding fix evidence

### Finding C — AMENDMENT 4 / presence.py preservation

**Fix:** `research/lyt/presence.py`, `SPEC-AMENDMENTS.md`'s Amendment 4
section, `README.md`'s Amendment 4 section, `test_lyt.py`'s 8 Amendment-4
tests, `runner.py`'s `default_valuation`/`common_valuations` machinery,
`errors.py`'s presence-valuation law reference, `emit_mockup.py`'s
per-valuation overlay logic, and both `.lyt` encodings' `@toggle(user,
release)` concrete syntax are **never touched** in this repair — no diff
against any of them exists in this delivery relative to `lyt-phase2` HEAD.

**WITNESSED:** `git diff lyt-phase2 -- research/lyt/presence.py
research/lyt/tests/test_lyt.py` (Amendment-4 sections)
`research/lyt/encodings/lengyue_landscape.lyt research/lyt/encodings/lengyue_portrait.lyt`
shows zero deletions of Amendment-4 content in this delivery's diff
against `lyt-phase2`. `pytest research/lyt/tests -q`: 104 passed (97 base
+ 7 new `test_emit_layout_tree.py`), including all 8 Amendment-4 tests
and the two `default_valuation`-solving tests
(`test_lengyue_landscape_default_valuation_solves_optimal`).

**Both-alive reconciliation (the emitters serve different outputs):**
`emit_layout_tree.py` (new, W1's own runtime-program emitter) is
presence-BLIND by construction — it reads only `slot.sizing`
(`@toggle` doesn't change a leaf's declared min/pref/max, only its
`presence` metadata), and its own `DEFAULT_VISIBLE_BY_PATH` table is a
hardcoded fact independent of `presence.py`'s valuation machinery. Its
docstring (which the prior attempt's version incorrectly claimed
"neither `.lyt` source file declares an `@toggle` presence") is
corrected to name this and explain why it needs no presence-aware
change. `emit_ts.py`'s `build_solved_registrations` — used by the
conformance harness — is reconciled to ALSO resolve+prune each
registration's own declared `default_valuation` before solving (mirroring
`runner.py.run_all`'s existing behavior), fixing the second-order
consequence the review's "Conformance harness" section named: the prior
attempt's reference was presence-BLIND (boardRail/previewBoard always
counted present), a real accuracy regression versus `lyt-phase2` even
though W1 has no presence menu. This is a no-op for every OTHER
registration (`ALL_PRESENT` default), verified by the full pytest suite
staying green.

### Finding B — DOM-id wiring

**Root cause (confirmed, not the review's own "best guess" — the actual
bug):** `LytNode.vue`'s recursive `<LytNode>` call never threaded the
current instance's own tree position down; every nested instance's
template read `:id="domId('')"`, looking up the SAME empty-string key.

**Fix:** added a `path` prop (default `''`, matching the program root);
every recursive `<LytNode>` call now passes `:path="group.rep.path"` (the
child wrapper's own dotted path — exactly what `LYT_DOM_ID_BY_PATH` is
keyed by); the root `<div>`'s id now reads `domId(path)` instead of the
literal `domId('')`.

**WITNESSED:** new `tests/integration/LytNode-dom-id-wiring.test.ts` (2
tests) mounts LytNode with a synthetic 2-level program and a
5-entry `domIdsByPath` map, asserting (a) every named id resolves to
exactly one element and no id repeats, (b) the root and a nested split's
ids are on distinct elements with the nested one a real DOM descendant.
**Guard verified live**: reverted the `path` prop temporarily (`domId('')`)
— both tests failed with the exact prior symptom (duplicate `id="root"`,
`#nested-split` unresolvable); restored, tests pass, `diff` against the
pre-mutation file confirmed byte-identical restoration.

Independent end-to-end confirmation (headless Chromium, production
build, all 6 representative sizes): `#split-workspace`, `#board-area`,
`#board-square`, `#tree-control-wrapper`, `#vue-tree-panel`,
`#control-panel` each resolve to exactly ONE element at every size —
zero duplicate ids (`dupIds: []` in every measurement run).

### Finding A — toolbar clipped off-viewport

**Diagnosis (measured, not guessed):** `Toolbar.vue`'s own `.toolbar`
rule declares `flex-shrink: 0` (correct for its pre-rework mount, a
full-viewport-width `.top-nav-bar` that never needed to shrink) — inside
the NEW `.lyt-toolbar-strip` mount, this pinned `.toolbar` at its own
unwrapped natural content width (measured 1532px at 1920×1080, ~2×
the ~820px grid cell), so its own `flex-wrap: wrap` never had a reason
to engage. `.toolbar-cluster`/`.engine-controls` (also deliberately
`flex-shrink: 0`, per that file's own iter-13 comment — an atomic-cluster
design assuming the OLD full-width mount) had the same problem one level
deeper: even once `.toolbar` itself could shrink, its widest cluster
(`.engine-controls`, ~779px unwrapped) still didn't fit the narrowed box
and had no way to wrap internally.

**Fix (realization layer, `App.vue`'s global `<style>` block, NOT
`Toolbar.vue` — its only other potential mount is nonexistent, but the
override is scoped to `.lyt-toolbar-strip` descendants so a future
second mount keeps the original full-width behavior):**
`.lyt-toolbar-strip .toolbar { flex: 1 1 0; min-width: 0; }` lets
`.toolbar` actually shrink to its cell and engage its OWN existing
`flex-wrap: wrap`; `.lyt-toolbar-strip .toolbar-cluster, .lyt-toolbar-strip
.engine-controls { flex-wrap: wrap; flex-shrink: 1; min-width: 0; }`
lets each cluster ALSO wrap its own buttons onto more lines rather than
overflow — every button stays full-size (no ellipsis/truncation, per
the standing design law), just distributed over more rows.

**Encoding reservation correction (disclosed, measured, re-solved within
bounds — see "Biggest concern" below):** raised the side column's
`board-priority-clamp` min from 340px to 480px and the merged
A_go/I_engine/A_common band from 28px×3 (84px) to 128px×3 (384px,
later 128px×3 stayed but see below). Width-sweep measurement (headless
Chromium, `.lyt-toolbar-strip` forced to 7 candidate widths, height
read back): 340px→533px tall, 400px→405px, 480px→341px, 560px→253px,
640px→238px, 720px→178px, 820px→178px (no further gain past ~720px).
640px (first tried) regresses `test_lengyue_landscape_default_valuation_
solves_optimal`'s 1366×768 case from OPTIMAL to INFEASIBLE — 480px is
the largest swept width that does NOT regress any of the base suite's
existing OPTIMAL pins (verified: `pytest -k
test_lengyue_landscape_default_valuation_solves_optimal` — 4/4 pass at
480px). The real running app (every component mounted, not the
width-forced sweep) measured 374px tall at 480px — 8px over the initial
366px (122px×3) reservation; raised once more to 128px×3=384px for a
real ~10px margin.

**Also fixed (found during verification, not one of the three named
findings, but load-bearing for the same mandate — "no child
overflowing"):** a real, previously-hidden structural bug in
`LytNode.vue`: a nested `.lyt-node` (a `display:grid` element inside
`.lyt-node-slot`, a PLAIN block div, not itself a grid/flex container)
never inherited its parent's height — CSS block layout does not stretch
children to fill parent height by default the way grid-item placement
does. Every NESTED LytNode instance (i.e. every Split below the root)
sized to its own content instead of its allotted cell. Invisible on the
page (clipped by an `overflow: hidden` ancestor, so nothing visibly
broke) but real: `#vue-tree-panel`'s own `getBoundingClientRect()`
measured **3248px tall** at 1920×1080 (true cell height: 684px) before
the fix — a number any ResizeObserver-driven consumer (e.g. a future
TreeWidget virtualization read) would see. Fixed with explicit
`width:100%; height:100%` on `.lyt-node` and the matching pair on
`.lyt-node-slot`'s inline style. Verified: `#vue-tree-panel` measures
684px (== its declared elastic-row share) after the fix, at every
size; the conformance harness's `tree` row now shows `match` (was
`divergent` with a 2564px delta before this fix).

**WITNESSED — toolbar measured child boxes, before/after, headless
Chromium, production build (`vite build && vite preview`), Playwright
`playwright-core` + system chromium, `systemd-run --user --scope -p
MemoryMax=4G`, `--js-flags=--max-old-space-size=1024`, one browser in
`finally`, no wall-clock waits (`waitForFunction`/`waitForSelector`
only):**

| Size | Before (prior attempt, review's own numbers) | After (this repair) |
|---|---|---|
| 1920×1080 | `.toolbar` x=1243 w=1532 (spills to x=2767, ~942px past a 1920px viewport); Connect x=2701–2767, off-viewport | `.toolbar` w=590 (within its 820px cell); Connect x=1557.6 w=66.6 → fully on-screen, `scrollWidth == clientWidth` |
| 1024×700 | not independently re-measured by the reviewer at this size, but the same `flex-shrink:0` cause applies uniformly | Connect x=798.0 w=66.6 → fully on-screen, `scrollWidth == clientWidth` |

Playwright **trial-click actionability** check (visible, stable, not
occluded, receives pointer events) on the Connect button: `1920x1080
{"ok":true, box:{x:1557.6,y:246,w:66.6,h:24}}`, `1024x700 {"ok":true,
box:{x:798.0,y:299.5,w:66.6,h:24}}`. `document.getElementById('main-area').scrollWidth
== clientWidth` at all 5 mandated sizes (1920×1080, 2560×1440,
1366×768, 1280×1024, 1024×700) — zero horizontal overflow anywhere.

## Ported-vs-rebuilt table

| Component | Disposition |
|---|---|
| `LytNode.vue` — recursive renderer, run-length merge, aspect containment | Ported verbatim from `2d6e04f7`, THEN the `path` prop / DOM-id fix and the nested-grid stretch fix layered on top (both are real behavior changes, not disclosed-verbatim) |
| `useLytTrackCss.ts` — track-shape → CSS mapping | Ported verbatim, unmodified |
| `lyt-widget-registry.ts` — leaf → mount disposition table | Ported verbatim, unmodified |
| `lyt-layout.gen.ts` — compiled program data | Regenerated from `emit_layout_tree.py` against the (presence-preserving, reservation-corrected) encoding — NOT copied from the prior attempt's committed file, though byte-identical to it before the encoding correction (confirmed via `vite-node` direct execution) |
| `emit_layout_tree.py` — W1's runtime-program emitter | Ported verbatim, docstring's incorrect "no @toggle" claim corrected |
| `test_emit_layout_tree.py` | Ported verbatim, ONE hardcoded literal (`minPx == 340.0` → `480.0`) updated to match the encoding correction, with a comment explaining why |
| `App.vue` | Ported verbatim (structure, wiring, DOM-id map) + the toolbar-fix CSS block (new) + updated script-header disclosure |
| `toolbar-stable-activation.test.ts` (G7 skip) | Ported verbatim |
| `frontend/scripts/lyt-conformance.mjs` (landscape source) | Ported verbatim (presence-independent, new capability) |
| `research/lyt/emit_ts.py` (`--class-id`) | RECONCILED, not ported verbatim: base's presence-pruning machinery kept, `--class-id` layered on top, presence-pruning APPLIED (the prior attempt's version had neither the pruning nor, obviously, needed reconciling with it) |
| `research/lyt/emit_mockup.py`, `runner.py`, `errors.py`, `SPEC-AMENDMENTS.md`, `README.md`, `presence.py`, `test_lyt.py`'s Amendment-4 tests | NOT ported — kept as base (`lyt-phase2`) verbatim; this is Finding C's fix |
| `research/lyt/encodings/lengyue_landscape.lyt` | NOT reverted (base's `@toggle` preserved) + a NEW, disclosed reservation correction (480px min, 128px×3 merged toolbar band) not present in either the prior attempt or the base |
| `LytNode.vue`'s nested-grid stretch (`width:100%;height:100%`) | NEW — neither the prior attempt nor the base has this; found during this repair's own verification pass |
| `tests/integration/LytNode-dom-id-wiring.test.ts` | NEW — the mounted-DOM uniqueness+presence test the review mandated for Finding B |

## Complete test-triage table

| Test file | Change | Judgment |
|---|---|---|
| `frontend/tests/unit/toolbar-stable-activation.test.ts` | G7 block → `describe.skip` (4 tests), ported verbatim | Legitimate subject-removal (the DOM shape it targets genuinely doesn't exist this wave); disclosed |
| `frontend/tests/integration/LytNode-dom-id-wiring.test.ts` | NEW (2 tests) | Review-mandated regression guard for Finding B; verified live (fails when the fix is reverted) |
| `research/lyt/tests/test_emit_layout_tree.py` | NEW (7 tests), one hardcoded literal (`minPx`) updated post-creation to track the encoding correction | Legitimate new coverage for the new emitter; the one edit is a grounded-value update, not a weakened assertion |
| `research/lyt/tests/test_lyt.py` | ONE hardcoded literal updated (`test_landscape_side_column_track_carries_the_board_priority_clamp`'s pinned `clamp(340px,...)` string → `clamp(480px,...)`), docstring extended to explain why | The ONLY change to this 1824-line file in this delivery; the 8 Amendment-4 tests and every other test are untouched. Full suite (104 tests) re-verified green after the edit |
| Every other frontend/backend/research test | Unchanged | N/A |

**Deletions:** zero test deletions in this delivery (the G7 block is `.skip`, not removed).

## Per-claim WITNESSED status

- Base freshness (5da3f059, presence.py present): WITNESSED, `git merge-base`/`git log`/`test -f` at session start.
- `vue-tsc -b`: WITNESSED, EXIT:0, foreground, re-run after every source-affecting change (final run clean, zero stray `.js` artifacts under `src/`).
- `npm run test:run` equivalent (`npx vitest run`): WITNESSED, foreground, 2937 passed / 8 skipped (236 files, 3 skipped) — final run, after the nested-grid stretch fix.
- `pytest research/lyt/tests -q`: WITNESSED, foreground, 104 passed (97 base + 7 new), includes all 8 Amendment-4 tests.
- DOM-id uniqueness: WITNESSED, headless Chromium, all 6 representative sizes, `dupIds: []` every time.
- Toolbar Connect reachability: WITNESSED, Playwright trial-click actionability at 1920×1080 and 1024×700 (see coordinates above).
- Nested-grid stretch bug + fix: WITNESSED, direct `getBoundingClientRect()` before (3248px) and after (684px) at 1920×1080; conformance-harness `tree` row `match` after.
- Conformance harness run (`--source landscape`): WITNESSED, ran twice (before/after the nested-grid fix) — `match=0→1, divergent=9→8`; remaining divergence is the DISCLOSED merge-judgment-call class (A_go's own encoding track vs. its actual 3-track merged mount; ~4px CP-* rounding; the board-priority-clamp CSS-approximation-vs-CP-SAT-solve gap that pre-dates this wave) — not a new defect.

## Disclosed narrowing (flag for commissioner ratification)

**The single biggest concern:** the 480px/384px encoding correction is a
measured, bounded, but NOT rigorously CP-SAT-re-solved number — I
capped it at the largest value that doesn't regress the base test
suite's EXISTING OPTIMAL pins (1920×1080/2560×1440/3440×1440/1366×768),
rather than doing a from-scratch solve that MODELS the merged-mount
reality as a real constraint. This means: (a) the toolbar's reservation
(384px) still runs ~10px tighter than ideal relative to a fully modeled
solve would produce, and (b) 1280×1024 remains genuinely INFEASIBLE for
the landscape class (unchanged from before this repair — not a
regression, but not newly fixed either). A follow-up wave with CP-SAT
re-solve budget could likely find a tighter number, or trade the
1366×768 OPTIMAL pin deliberately for a smaller reservation — a
tradeoff this repair pass declined to make unilaterally.

## Scope

No narrowing beyond W1's already-ratified exclusions (landscape-only,
no toggles/resizers/presence-menu, boardRail/previewBoard absent). The
nested-grid stretch fix and the reservation correction are IN-SCOPE
additions the mandate's own findings required, not scope creep.

## Gate results (final)

- `vue-tsc -b`: EXIT 0.
- `npx vitest run`: 236 files passed, 3 skipped; 2937 tests passed, 8 skipped.
- `pytest research/lyt/tests -q`: 104 passed.
- `frontend/scripts/lyt-conformance.mjs --source landscape`: ran clean (no crash), report at `research/lyt/divergence/2026-08-10T22-20-35-449Z-lengyue-landscape.md`.

License: Public Domain (The Unlicense).
