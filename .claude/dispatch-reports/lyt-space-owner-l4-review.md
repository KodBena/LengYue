# Space-owner cure — dispatch L4 review (fresh-context, refute posture)

**Artifact.** Worktree `.claude/worktrees/agent-a1e24153901b84663`, branch
`lyt-space-owner-l4`, tip `b2d5e521f10cbf362e7e90945e263015a60bc834` —
**verified** by direct `git rev-parse HEAD`, matching the build report's
claimed SHA. Base **verified** by `git merge-base HEAD lyt-phase2` = merge-base
`e9dcc9980dacfb49cf096949bcf68e0bb2062e1e` = `git rev-parse lyt-phase2` in the
main repo — the branch is cut cleanly from `lyt-phase2`'s own tip, no stale
base. Governing documents read end to end before any claim below: the full
`lyt-space-owner-spec.md` (993 lines); ledger rows 2447, 2484, 2392 (`led
show`); the full diff (`git diff e9dcc998 b2d5e521`, 1381 lines); the full L4
purity test (`feasible-layout-purity.test.ts`, 408 new lines); the fork-closure
code (`wrapperCapacityStarvation`/`mergeWrapperCapacityDiagnostic`/
`sovereignMessage` in `feasible-layout.ts`) and its 3 dedicated tests
(`feasible-layout.test.ts`, "Branch 7"); the L3 build report's own §7/§8 (the
STOP-and-report item this dispatch resolves) and the L4 build report in full.

## Verdict: ACCEPT-WITH-CONDITIONS

## Basis (4 lines)

The purity gate is honest — 17 tests genuinely assert structural equality
against an isolated canonical value, seeded traversals are verifiably
deterministic (re-run twice, byte-identical), and every describe block
correctly discloses that content demands are held constant (a real,
witnessed gap between "the pure layer is path-independent" and "a live DOM
reading would be too"). The fork closure is a technically sound mechanism —
`StarvationDiagnostic.region` genuinely was already `string`, confirmed by
reading the pre-diff type — but the spec citation supporting it is imprecise
(misattributes §1.1's closure text to §1.2, and neither section actually
names "wrapper capacity" or "viewport" as a member of the checked
quantification universe), and no ledger row ratifies this specific
resolution the way row 2447 ratified the spec's own Q1/Q2/Q5/Q6 forks — L3
named this explicitly as a STOP-and-report item for the commissioner, and
the builder resolved it unilaterally rather than waiting. Gates are
genuinely green (eslint/vue-tsc/build/full-suite all independently
reproduced, exit 0, exact test counts matching the build report) except
`layout-audit`, which is honestly disclosed as non-clean and plausibly
root-caused to this dev host's own live backend on 8764 (independently
confirmed listening, without querying its data). Conditions: file a ledger
ratification for the fork-closure disposition (mirroring row 2447's shape)
and correct the spec-citation section number in the code comment.

---

## 1. The purity gate (obligation 1)

**What it actually asserts.** WITNESSED, by direct reading of
`feasible-layout-purity.test.ts` in full. §A/§B/§C each compute one
"canonical" value per geometry via an ISOLATED call (outside any traversal),
then for every traversal (the review's own literal 8-step order plus three
`mulberry32`-seeded traversals) assert `expect(actual).toEqual(canonical[idx])`
— a genuine structural-equality assertion over the FULL serialized shape
(`allotments`/`diagnostics`/`others`/`treePx`, sorted before comparison so
Map-iteration order can't hide a divergence), not a weaker check (no
`toMatchObject`, no partial-field comparison, no "didn't throw"). This is
strictly stronger than the spec's own literal wording ("REVISITED geometry
matches its own first visit") — comparing every visit (first or repeat)
against an isolated canonical also catches divergence between an embedded
call and a standalone one, which the spec's own weaker phrasing wouldn't
have caught. Correctly disclosed as a deliberate strengthening, not a
silent substitution.

**Determinism.** WITNESSED — ran the full purity suite twice
(`npx vitest run tests/unit/state/feasible-layout-purity.test.ts`), both
runs: 17/17 passed, identical pass set. The suite's own internal sanity
block also asserts `seededTraversal(1001)` reproduces identically on a
second in-process call — a second, independent determinism check baked
into the gate itself, also WITNESSED green.

**Content-demand constancy, stated and justified.** WITNESSED — the file
header and every one of the three `describe` blocks (§A/§B/§C) contain an
explicit "Purity claim, stated explicitly" paragraph naming exactly what is
held constant (`TREE_LIVE_CONTENT_OVERLAY`, the `others` row facts, and in
§C the persisted `treeSovereignPx`) and what varies (only the geometry / the
re-derived `wrapperWidthPx`). This is not an implicit assumption a reader
has to infer.

**The gap, named honestly by the suite itself and independently confirmed
real.** The suite explicitly disclaims proving that a REAL
`useContentDemand` DOM reading is path-independent in the live app — only
that the pure `FeasibleLayout.validate`/`resolveSideColumnLiveLayout`
functions are path-independent given FIXED inputs. Concretely, the gate
would NOT catch: (a) a `useContentDemand` reading that genuinely varies by
traversal history (e.g. a virtualized tree that has only rendered the rows
visible at the last-visited geometry, so `scrollWidth` differs by path —
named explicitly in the spec's own §4 step-4 risk row as UNEXERCISED); (b) a
`session.ui.treePanelWidthPx` persisted value that itself changes mid-session
(the store write path, not this module, owns that); (c) any divergence
introduced between `resolveSideColumnLiveLayout`'s own numeric solve and the
REAL CSS Grid solve `LytNode.vue` renders (the test suite's own numeric
solver, `feasible-layout-fixtures.ts`, is a disclosed simplification of CSS
Grid Level 1, not a browser oracle — this is the SAME disclosed scope
`feasible-layout-geometry-sweep.test.ts` already carried, verbatim-relocated,
not new to this dispatch). Named plainly: **the gate proves the validation
layer is pure; it does not and cannot prove the live app's rendered layout
is path-independent**, since the live app's real inputs (DOM measurement,
persisted store state) are outside this suite's control. This is the exact
gap the spec's own risk register predicted, and the suite's own text is
honest about it rather than implying broader coverage.

## 2. The fork closure (obligation 2)

**Mechanism, confirmed correct.** WITNESSED, by reading `feasible-layout.ts`
directly: `interface StarvationDiagnostic { readonly region: string; ... }`
(line 218 pre- and post-diff, unchanged by this dispatch) — `region` was
already an open `string`, never a closed union parameterized on a fixed
`Region` set. `wrapperCapacityStarvation` mints a `Measured<'wrapper'>`
demand and a matching candidate, and runs BOTH through the SAME
`FeasibleLayout.validate` call this module uses everywhere else — no
branch, no special-cased comparison logic, genuinely the same mechanism.
`mergeWrapperCapacityDiagnostic` folds the result into the existing
`location:'tree'` diagnostic (or synthesizes one) and `sovereignMessage`
gives `'wrapper'` its own non-render-target clause rather than
misdescribing it as "no longer permits wrapper to render." The three unit
tests in `feasible-layout.test.ts` ("Branch 7") reproduce the L3 build
report's own exact repro (`wrapperWidthPx=480, others=[], treeSovereignPx=820`)
byte-for-byte against the worked trace in the L4 build report §4, and all
three pass (confirmed in the full-suite run below). The claim "no new
TYPE" is literally true.

**Where the justification overreaches.** The code's own comment states:
"the spec's own §1.2 closure names the viewport as part of `FeasibleLayout`'s
own quantification universe" and quotes "every sibling surface... because
`Measured<Region>` is generic over `Region extends string`..." Read against
the full spec text directly: that quoted sentence is from **§1.1's** closure
statement, not §1.2's (§1.2's own closure statement instead says
"§1.1's universe, inherited" — three words, no independent claim of its
own). More substantively: §1.1's own enumerated universe is "in-flow LYT
leaves, blackbox interiors, fixed corner overlays, modal/popover boxes, and
chart containers" — every member of that list is something that RENDERS
content. `FeasibleLayout.viewport` in the spec's own §1.2 type is a plain
descriptive field (`{widthPx, heightPx}`), never itself validated against a
`Measured` entry — it is context metadata, not a member of "every region
with a Measured entry" (§1.2's own closure's literal definition of its
quantification universe). The spec text does not, on a full re-read,
actually say what the code comment claims it says. This doesn't make the
mechanism wrong — `region: string` genuinely being open is real, independent
support — but the SPECIFIC textual backing cited is weaker than presented,
and a reader trusting the comment's citation without re-checking the spec
would come away with an inflated sense of how settled this was.

**A coincidental prior-art wrinkle, not disclosed.** Independently
enumerating writers of the `region` field (not trusting the build report's
own count) turned up `useResizablePanel.ts`'s pre-existing (L3-vintage)
`outerRowSovereignDiagnostic`, which ALSO uses the literal string `'wrapper'`
as a region name — but there it denotes the sovereign, RENDERED control-region
pane itself (the drag target, analogous to L4's `'tree'`), with `'board'` as
the sibling being checked. L4's new `'wrapper'` denotes the opposite role —
the row's own non-rendering CONTAINER capacity, the thing being checked, not
the drag target. Both are legitimate in their own local scope (each
`FeasibleLayout.validate` call builds its own small, self-contained
`demands`/`candidate` maps — no runtime collision, confirmed by reading both
call sites), but the same string now carries two different domain meanings
across this file family, and neither the L4 build report nor the code
comments mention or reconcile this. A future reader grepping for `'wrapper'`
diagnostics will find two semantically distinct mechanisms under one name.
Minor, but a real naming-hygiene gap, worth a follow-up rename
(`'rowCapacity'` or similar) rather than living with the collision.

**Was a STOP owed here?** L3's own build report is unambiguous that this
was a "genuine representation-fork question the spec's own text does not
decide" and recommended it as "the concrete first item for a follow-up L4
dispatch" — language that reads as "commissioner decides, then L4 builds,"
mirroring exactly how row 2447 recorded "FORK DEFAULTS taken under the
commissioner's delegated fix authority" for the spec's own Q1/Q2/Q5/Q6
BEFORE any of those defaults were coded. Checked the ledger directly (`led
--recent 60`, `led show` on every candidate row): no entry between L3's
merge (row 2484) and this build's own dispatch ratifies "resolution (a),
reuse `region: string`, no new type" as the disposition for THIS specific
fork. Row 2447 predates the fork's own discovery (it names the SPEC's open
questions, not L3's later-surfaced gap) and row 2484 only narrates that the
fork is "parked," pending L4 — it does not resolve it. Per ADR-0000's own
"unratified design decision, normalized by subsequent construction" shape
(the exact pattern ledger row 2392's PX-PROVENANCE VERDICT names, cited by
this review's own commission as the precedent), a design-level fork that a
prior dispatch explicitly flagged as needing commissioner resolution should
carry an explicit ratification before or alongside the build that resolves
it, not only a disclosure in the resulting build report. The disclosure
here is genuinely thorough (§2 item 3, §4, §5, §8 of the L4 build report all
address it candidly, and the code's own doc comment is extensive) — this is
not a buried or minimized shortcut — but thorough after-the-fact disclosure
is not the same act as the ratify-before-build pattern this codebase already
established for structurally identical forks. **Condition:** file a ledger
decision entry naming this disposition explicitly (mirroring row 2447's own
"FORK DEFAULTS... delegated fix authority" framing), and correct the
code comment's spec citation from "§1.2 closure" to "§1.1 closure, inherited
by §1.2."

## 3. The 3 red audit findings (obligation 3)

**Reproduction, partial (by design, per the "backend 8764 forbidden"
boundary for reviewers).** The build report's own before/after methodology
(`npm run layout-audit` at L4 tip, `git stash` to L3 tip, re-run, `git stash
pop`) was not re-executed end-to-end by this review, because
`scripts/layout-audit.mjs` builds `dist/` and serves it via `vite preview`
with the app's own DEFAULT `API_BASE_URL` (`http://localhost:8764`,
`src/config/env.ts` line 61, unset by any env override in this flow) — so a
live backend on that port, if present, IS reachable from the audited page
even though the audit script's own architecture requires none. Checked
(passively, socket state only, no request made): `ss -tlnp | grep 8764`
shows a live `fastapi`/`python3` process genuinely listening on this host —
independently corroborating that the root-cause mechanism the build report
names (an ambient, previously-persisted dev backend) is real and reachable,
without querying its data. This is consistent with, not merely asserted by,
the build report.

**Root-cause claim, checked where it can be checked without the forbidden
channel.** The diff (`git diff e9dcc998 b2d5e521 --stat`) touches exactly 7
files: the build report, one `FILES.md` line, `feasible-layout.ts`, and 4
test files — `SystemLogPanel.vue` is untouched. Read `SystemLogPanel.vue`'s
own `.clear-btn`/`.dismiss-btn` CSS directly: neither declares any
min-width/min-height or padding sized toward a 24×24 CSS-px target — `
.dismiss-btn { padding: 0; ... }` in particular is exactly the shape a
`target-size` finding would flag, and pre-dates this dispatch (the class
selectors and rule are unchanged from L3). The wiring in
`resolveSideColumnLiveLayout`'s sovereign branch (read in full) computes
`totalRowClaimPx` from `treePx` plus each present sibling's own gap +
`candidatePx`, which is exactly the row's own REALIZED claim (not the
uncapped demand) — so the new diagnostic fires precisely when the row's
resolved allotment exceeds `wrapperWidthPx`, matching the build report's own
worked trace exactly (independently re-derived, not merely re-read). The
causal chain the report claims (silent gap before L4 → new diagnostic after
L4 → new system-message row → pre-existing undersized button on that new
row) is architecturally consistent with the code as read.

**Disposition, judged against the ratchet's own rule.** `layout-audit-baseline.json`
(the mechanized ratchet gate this codebase already has — `--check` fails
loudly on any finding key absent from the committed baseline) was **not**
touched by this diff (`git diff e9dcc998 b2d5e521 -- layout-audit-baseline.json`
is empty). The build report's own §6 states the gate is "NOT clean" and its
§7 recommends filing the `SystemLogPanel` sizing fix as a follow-up rather
than baselining the +3 findings or fixing them in this dispatch. Under the
ratchet's own stated rule ("a red gate cannot merge as-is"), this dispatch
as it stands would fail CI's own `--check` step on `npm run layout-audit` —
the report's own honesty about "NOT achieved, genuinely" is correct, but the
report stops short of doing either half of the ratchet's own required
resolution (baseline-with-justification, or fix). Given the finding is
demonstrably a pre-existing, out-of-scope, orthogonal CSS defect (confirmed
above by direct inspection, not merely asserted) and the codebase's own
prior precedent (L3's own build merged at row 2484 with an equivalently
disclosed, non-baselined residual) — the substantively correct move is to
extend `layout-audit-baseline.json` with the 3 new keys and a justification
comment naming the pre-existing defect and its owner (a
`SystemLogPanel`-sizing ticket), matching this codebase's own
`ratified-literals.json`-style pattern for exactly this kind of disclosed,
non-blocking residual. **Condition:** add the 3 new baseline keys with an
inline justification before merge, so the CI gate this codebase actually
runs is green, not merely "explained in a report a human has to read
instead of the gate."

## 4. Gates, self-run (obligation 4)

All run directly in the worktree, exit codes read directly (not taken from
the build report):

- **eslint** (`npx eslint .`): exit 0, no output. WITNESSED, matches report.
- **`vue-tsc -b --noEmit`**: exit 0, no output. WITNESSED, matches report.
- **`npm run build`**: exit 0, 1256 modules transformed, same pre-existing
  chunk-size notice, no new warnings. WITNESSED, matches report exactly.
- **Full suite** (`NODE_OPTIONS=--max-old-space-size=2048 npx vitest run
  --maxWorkers=2`): **271 files passed | 3 skipped (274)**, **3368 passed |
  8 skipped (3376)**, exit 0. WITNESSED, matches the build report's own
  numbers exactly (270→271 files / 3348→3368 tests, the claimed `+20` net —
  independently reproduced, not re-derived from the report's own arithmetic).
- **Purity suite, twice** (determinism): both runs 17/17 passed, identical.
  WITNESSED.
- **`layout-audit`**: not independently re-run end-to-end (see §3 —
  respecting the standing "backend 8764 forbidden" reviewer boundary, since
  the audited page's default `API_BASE_URL` would reach it). Root-cause
  claim checked by other means (socket-listening state, untouched-file
  diff, CSS inspection, direct re-derivation of the diagnostic arithmetic)
  and found consistent. REFUSED-AS-EXPECTED per the access boundary, not
  UNEXERCISED by neglect.

## 5. Per-directive coverage summary

| Directive | Status |
|---|---|
| Purity gate: structural equality, not weaker | WITNESSED |
| Purity gate: seeded traversals genuinely deterministic | WITNESSED (re-run twice) |
| Purity gate: constancy of content demands stated + justified | WITNESSED |
| Purity gate: real gap named honestly (pure layer ≠ live DOM) | WITNESSED |
| Fork closure: no new TYPE | WITNESSED |
| Fork closure: spec citation accuracy | REFUTED (misattributed section; viewport not actually in the checked universe) |
| Fork closure: pre-build commissioner ratification | REFUTED (no such ledger row found) |
| Fork closure: naming collision with prior 'wrapper' usage | FOUND, undisclosed by the build |
| 3 red findings: reproduced | PARTIAL (backend-boundary-respecting; corroborated indirectly) |
| 3 red findings: root-cause claim | PLAUSIBLE, consistent with code + host state |
| 3 red findings: ratchet disposition | INCOMPLETE (neither baselined nor fixed — report discloses but the mechanized gate itself is not satisfied) |
| eslint / vue-tsc / build / full suite | WITNESSED, exit 0, self-run |

## Conditions for ACCEPT

1. File a ledger decision ratifying the fork-closure disposition
   ("Measured<'wrapper'>, reuse of the existing open `region: string`
   field, no new type") explicitly, mirroring row 2447's "delegated fix
   authority" framing for the spec's own forks — closing the STOP L3's own
   build report opened.
2. Correct the code comment's spec citation in `feasible-layout.ts`
   (`wrapperCapacityStarvation`'s own doc block) from "§1.2 closure" to
   accurately reflect that the quoted text is §1.1's, inherited by §1.2 —
   and drop or soften the "names the viewport as part of the quantification
   universe" claim, which the spec's own text does not make.
3. Add the 3 new `layout-audit-baseline.json` keys (the `target-size`
   findings on `.system-log-panel .clear-btn`/`.dismiss-btn` at 480×900)
   with an inline justification comment naming the pre-existing defect,
   so `npm run layout-audit --check` is actually green rather than merely
   explained in a report — matching this codebase's own established
   ratchet-with-justification pattern.
4. (Optional, non-blocking) Rename one of the two `'wrapper'` region-name
   usages (`useResizablePanel.ts`'s sovereign-pane sense vs.
   `feasible-layout.ts`'s new container-capacity sense) to remove the
   naming collision before it confuses a future reader.

None of the above requires re-architecting the mechanism itself — the
purity gate and the fork-closure logic are both sound and well-tested; the
conditions are process (ratification), accuracy (citation), and a
mechanized-gate completion (baseline) the build report's own honesty already
surfaced but did not close.

License: Public Domain (The Unlicense), per ADR-0006.
