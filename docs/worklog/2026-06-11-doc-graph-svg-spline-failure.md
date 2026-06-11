# Worklog — doc-graph SVG spline-routing failure (2026-06-11)

> Work-status item `doc-graph-svg-spline-failure` (maintainer-signed).
> Branch `bork/fix/doc-graph-svg-spline-failure`, PR #<filled on push>.
> Umbrella tooling (`tools/doc-graph/generate.mjs`).

## The symptom (verbatim from the item)

> `dot -Tsvg` on the ~330-node graph exits non-zero (`routesplines:
> cannot find NORMAL edge`) while still emitting a complete SVG — a real
> layout failure for ≥1 edge, not just a warning. Non-critical (manifest
> is SoT). Stopgap tolerates the non-zero exit. Version-sensitive (CI's
> apt dot, not local 14.1.2).

The graph has since grown from ~330 to **474 nodes / 2299 edges** (1915
drawn/resolved); the failure persists at that size.

## Reproduction

The generator's own `renderSvg` swallows the non-zero exit (the stopgap),
so `node tools/doc-graph/generate.mjs` exits 0 locally and shows nothing.
Two channels gave the real picture:

1. **Local (graphviz 14.1.2, the version this worktree runs).** Dumped the
   exact `.dot` the generator builds and ran `dot -Tsvg` directly: **exit
   0, empty stderr, complete SVG**. Local `dot` does *not* raise the error
   — matching the item's "not local 14.1.2." So the bug could not be
   reproduced on the local toolchain at all; it is genuinely version-bound.

2. **CI (the failing side) — runtime visibility per the umbrella
   `CLAUDE.md` "asking before assuming" rule.** The umbrella rule says to
   get runtime visibility into the non-local side rather than infer from
   one-sided observation. The non-local side here is CI's `dot`. From a
   recent `doc-graph-ci` run log (`gh run view <id> --log`):

   ```
   Get:11 … graphviz amd64 2.42.2-9ubuntu0.1 …
   …
   Error: in routesplines, cannot find NORMAL edge
   Error: in routesplines, cannot find NORMAL edge
   [doc-graph] dot reported a non-fatal layout warning (SVG still produced):
   Error: in routesplines, cannot find NORMAL edge
   Error: in routesplines, cannot find NORMAL edge
   doc-graph: graph structure fresh (474 nodes, 2299 edges).
   ```

   So: **CI's `dot` is graphviz 2.42.2** (Ubuntu noble / `ubuntu-latest`),
   not 2.43.0 as one might guess. The error appears **twice** as `Error:`
   on the direct stream (the stopgap then re-echoes both, hence four lines
   in the log). Two errors ⇒ **two edges** fail to route. The job still
   reports *success* because the stopgap eats the non-zero exit — the
   failure is invisible at the job-status level, only in the stderr.

## Diagnosis — the offending edges and the root cause

The error is emitted by graphviz's `routesplines` (`lib/common/routespl.c`)
when the spline router walks an edge's virtual-node chain (`getmainedge`
in `lib/dotgen/dotsplines.c`: `while (ED_to_virt(le)) …; while
(ED_to_orig(le)) …`) and the chain does **not** terminate at an edge of
type `NORMAL`. That happens when **`concentrate=true`** has merged
parallel/bidirectional edges into shared virtual nodes (`spline_merge`
fires on `ND_in(n).size > 1 || ND_out(n).size > 1`): the merge can leave a
chain whose original `NORMAL` edge the router can no longer find.

The generator set `concentrate=true` in the graph attributes
(`buildDot`). Edge-topology evidence that the merge has real work to do
on this graph (counted in the emitted `.dot`): **89 bidirectional pairs**
(A→B and B→A both drawn) plus several exact-duplicate directed pairs —
exactly the multi-edge-at-a-virtual-node case the older router mishandles.

Which **specific** two edges 2.42.2 fails on is not individually
identifiable from our side: the router does not name them, and we cannot
run 2.42.2 locally to bisect (no apt, no container runtime, no older
`dot` in the openSUSE repos — only 14.1.2/15.0.0). The *class* is
nonetheless pinned: concentrate-merged virtual chains among the
bidirectional/parallel pairs. This is a known graphviz fragility around
`concentrate` (e.g. the `rails-erd` ERD-graph reports of the identical
error; upstream `concentrate`-with-clusters edge-loss/segfault issues),
fixed in later graphviz — which is precisely why local 14.1.2 is clean
and CI's 2.42.2 is not.

## The fix — two parts, primary one structural

An out-of-frame hack-rationalization pass (appendix below) caught that my
first cut — "remove `concentrate`" — dodged the symptom's *trigger* rather
than removing CI's *dependency* on the render. The corrected shape:

### 1. Primary (structural): the freshness gate no longer renders the SVG

CI runs `node tools/doc-graph/generate.mjs --check`. That gate compares
the manifest **skeleton** (nodes/edges/resolution) plus the existence of
the index/report (`checkDrift`); it explicitly does **not** require or
consume the SVG (`OUT_SVG is intentionally NOT required`). Yet `generate()`
rendered the SVG **unconditionally**, even in `--check` — so CI paid the
`dot` render cost purely as a side effect and threw the output away. That
dead render was the *only* thing exposing CI to `dot`'s version-bound
layout quirks. `generate({ renderPicture })` now skips `renderSvg` in
check mode (`main` passes `renderPicture: !checkMode`). The gate is now
robust to the **whole class** of `dot` rendering failure — this trigger
and any future one — not just the `concentrate` instance. The now-unused
Graphviz install is dropped from the workflow (`.github/workflows/
doc-graph-ci.yml`) too, removing CI's dependency on the very 2.42.2 that
caused the bug.

Proof it is dead in `--check`: with a deliberately-broken `dot` shim first
on PATH, `--check` exits **0** (never invokes dot), while a full
(non-check) run still invokes dot and **fails loudly** (the ADR-0002
"`dot` not found" throw, exit 1). So CI can no longer be silently
green-with-a-buried-error, and the local render's fail-loud-if-absent
contract is intact.

### 2. Secondary (local render hygiene): `concentrate` off

The full (non-`--check`) render still draws the SVG, and a maintainer
running the generator on an older `dot` would still hit the
`concentrate`-merge failure there. So `concentrate` is also turned **off**
in `buildDot`. Removing the merge removes the virtual chains the older
router can't trace, so 2.42.2's `routesplines` has no merged-chain edge to
fail on. The cost is purely cosmetic — parallel/bidirectional edges drawn
as separate splines rather than one merged line — on a **local-only,
`.gitignore`d** SVG. Drawn-edge count unchanged (1831 edge lines in the
`.dot` before and after); only the merge is gone. (`splines=ortho` was
considered and rejected: it hangs on a 474-node graph locally and would
not address the merge mechanism anyway.)

Honest framing of part 2 vs part 1: part 1 alone fixes the **CI gate** (the
filed symptom — the non-zero exit CI surfaced). Part 2 is not strictly
required for CI once part 1 lands; it is kept because the item is titled
*svg-spline-failure* and a local full render on an older `dot` is a real
surface the maintainer may exercise. Part 2's diagnosis (concentrate is the
2.42.2 cause) remains *asserted from upstream source + version-correlation,
not verified on 2.42.2* (see the limitation below) — but part 1 does not
depend on that diagnosis being right, so the CI fix stands regardless.

## Stopgap — kept as defense-in-depth, made loud (ADR-0002)

The item asked: with the failure fixed, the stopgap should LOUDLY report
(not silently tolerate) a future non-zero exit while still completing.
Done. Note the stopgap is now reached only on a **local full render** —
CI no longer renders, so the swallow-vs-fail question only affects a
maintainer's local browse, where "complete so the SVG is still browsable"
is the right call and is exactly what the item scoped ("loud but still
completing"). The previous message framed the non-zero exit as a
"non-fatal layout warning" — benign-sounding, the silent-failure framing
ADR-0002 forbids once the cause is fixed. The new message:

- Calls it a layout **REGRESSION**, explicitly "NOT expected" now that
  `concentrate` is off, and names that at least one edge was routed
  degenerately.
- Echoes `dot`'s exit status **and** its full stderr.
- Points the next reader at this worklog and the
  `routesplines: cannot find NORMAL edge` class to re-check against the
  current `dot` version.
- Still returns the SVG when `dot` produced one, and still re-throws when
  there is genuinely no picture (a real fatal failure). The loud report is
  the difference between defense-in-depth and tolerance.

The stale pointer in the old comment to the retired
`docs/notes/deferred-items.md` (tombstoned into the work-status store) was
replaced with the live worklog pointer.

## Verification

- **The CI gate no longer touches `dot` (the structural proof).** With a
  deliberately-broken `dot` shim first on PATH:
  `node tools/doc-graph/generate.mjs --check` → exit **0** (the fake dot is
  never invoked); a full `node tools/doc-graph/generate.mjs` → exit **1**,
  failing loudly with the ADR-0002 "`dot` not found on PATH" message. So
  `--check` (CI) is independent of `dot` entirely, and the local render's
  fail-loud-if-absent contract is intact.
- **Local full render clean (14.1.2):** `node tools/doc-graph/generate.mjs`
  → exit 0, no stopgap stderr; the regenerated `.dot` (no `concentrate`)
  runs `dot -Tsvg` directly → exit 0, empty stderr, complete SVG. (Local
  was always clean — this confirms part 2 introduces no *new* local
  breakage.)
- **Freshness gate green:** `node tools/doc-graph/generate.mjs --check` →
  exit 0, "graph structure fresh (475 nodes, 2303 edges)".
- **No structural drift from the code change:** neither part touches the
  manifest; the committed `docs/doc-graph.json` skeleton (nodes/edges/
  resolution) changes only by this worklog's new node + its 4 edges. The
  rest of the json delta is heatmap/freshness snapshot drift (a couple of
  `aging→stale` bucket shifts) — expected, not caused by the fix.

### The honest limitation — part 2's diagnosis is unverified on 2.42.2

The **CI fix (part 1) does not depend on the `concentrate` diagnosis** and
is verified above (the gate provably renders nothing). What remains
unverified is **part 2's claim** that `concentrate` specifically is the
2.42.2 cause: I cannot run graphviz 2.42.2 locally (no apt, no container
runtime, only 14.1.2 / 15.0.0 in the repos), so that rests on the upstream
source mechanism (`getmainedge`/`spline_merge`), the version-correlation
(clean on 14.1.2, failing on 2.42.2), and the edge-topology evidence (89
bidirectional pairs concentrate merges) — strong, but not a 2.42.2 repro.
If part 2's diagnosis were wrong, the only consequence is a maintainer's
**local** full render on an old `dot` might still warn (now loudly); CI is
unaffected. The real CI run on this branch (apt `dot` 2.42.2) is no longer
the closing gate for the *symptom* — `--check` is dot-free — but reading
its log still confirms green. A future `dot` change warrants a re-check of
the local render only.

## Documentation touched

- `tools/doc-graph/generate.mjs` — `generate({ renderPicture })` skips the
  SVG render in `--check` (primary fix); `concentrate` removed from
  `buildDot`'s graph attrs for local-render hygiene (part 2); `renderSvg`
  stopgap made loud per ADR-0002; stale tombstone pointer corrected.
- `.github/workflows/doc-graph-ci.yml` — dropped the now-unused Graphviz
  install (the gate no longer renders); header + step comments updated.
- This worklog (a new doc-graph node).
- Doc-graph regenerated (`docs/doc-graph.json` + `docs/doc-graph.md` +
  `docs/doc-graph-report.md`) per the structural-doc discipline (this
  worklog adds a node + edges). The SVG is `.gitignore`d and not committed.
- No FEATURES.md / IDENTIFIERS.md / ADR change: umbrella tooling, no
  user-facing surface, no new branded type; a concrete application of
  ADR-0002, not a change to the tenet.

## Deferrals

- The worktree base for this branch is one merge behind the shared `main`
  at authoring time; the regenerated heatmap reflects the worktree's HEAD.
  A rebase + regenerate against `main` before merge keeps the committed
  graph honest (the standard structural-doc rebase discipline). not-filed:
  routine merge hygiene, not a defect.
- A pre-existing working-memory vestige note for this item already exists
  (`docs/notes/vestige/deferred-items/doc-graph-svg-spline-failure.md`); it
  carries no authoritative status and moves to `docs/archive/…` when the
  item ships — the coordinator's/maintainer's closure step, not this
  arc's. Left untouched (minimal-touch). not-filed: item-disposition is
  the coordinator's.

## Appendix — out-of-frame hack-rationalization artifact (verbatim)

Run by a separate `general-purpose` subagent that did not produce the
change and was handed the raw facts + diff with the implementer's
justification framed as the object of suspicion. Its finding (the
`--check` SVG render is dead work) is what produced part 1 above; the
artifact is preserved unedited.

```
## Hack-rationalization review: doc-graph SVG spline-failure fix (staged diff in `tools/doc-graph/generate.mjs` + worklog `docs/worklog/2026-06-11-doc-graph-svg-spline-failure.md`)

FRAME CHECK: Out-of-frame. I did not produce this change and am treating the implementer's worklog/comments as the object of suspicion, not as context to agree with. Frame holds; proceeding.

GENERAL FIX:   *The CI freshness gate (`--check`) must not depend on a side effect it never consumes* — i.e. don't render the SVG in `--check` mode at all, since `generate()` discards the SVG there and `checkDrift` compares only the JSON skeleton + existence of INDEX/REPORT (`generate.mjs:1155` renders unconditionally; `1232–1235` explicitly excludes the SVG; `1245–1260` reads only `_manifest`). That makes the gate immune to *every* version-bound `dot` layout quirk, not just the one `concentrate` triggers.
PATCH SHIPPED: Removes `concentrate=true` from the single `graph [...]` attribute line in `buildDot` (`generate.mjs:705`) so the specific virtual-chain merge that crashes graphviz 2.42.2's `routesplines` is no longer constructed; and rewords the `renderSvg` catch-block from "non-fatal layout warning" to a loud "layout REGRESSION, NOT expected" message echoing dot's exit status + full stderr (still swallows the non-zero exit and returns the partial SVG).
DOWNGRADE:     No concrete cost is named for skipping the general fix — because the general fix (don't render in `--check`) is *never named in the worklog at all*. The worklog's only nod toward a more-structural fix is "render off-tree, per `doc-graph-svg-render-off-tree`," offered as a *fallback if concentrate-removal fails*, and that item addresses a different problem (GitHub line-counting the committed SVG), not the CI render-time crash. The narrowing rests on proportionality language — "marginal legibility ... not worth a degenerate-spline failure," "purely cosmetic," "removes the attribute that fails" — i.e. a mood (this is the smallest change that makes the symptom go away), not a cost that rules out the cleaner fix.
WRITER DELTA:  Claimed: 1 (the `graph` attr string in `buildDot`). Enumerated: 1 — the attribute line at `generate.mjs:705` is the sole writer of the graph-attribute slot, and `renderSvg` has exactly one caller (`generate.mjs:1155`). Single-writer slot; this is **not** a missed-producer hack. (Writers: `buildDot` graph-attr line @705; renderSvg caller @1155.)
RUNTIME:       **Unverified — derived on paper.** The implementer states plainly they cannot run graphviz 2.42.2 (no apt, no container, only 14.1.2/15.0.0 available), and the worklog's own "honest limitation" section says the decisive confirmation — that the `routesplines` errors are gone from CI's stderr — "comes only from the real `doc-graph-ci` run on this branch" and "should be read before the item is closed." Local 14.1.2 was *already clean* before the change, so the local render proves nothing about the failing version. The fix is being staged as "the fix" while verification on the only version that exhibits the bug is admittedly pending. (My environment: dot 14.1.2 — I cannot reproduce 2.42.2 either; I am not disputing the constraint, only recording that "fixed" is not yet earned.)

TELLS (Step 1): Scanner reported 0 co-occurrence tells but counted 4 minimality-terms and 4 named-fix cues in the worklog. The scanner missed the live adjacency: worklog line 156 names a more-general fix ("render off-tree") inside the same "honest limitation" paragraph that minimizes the gap ("dodged by not exercising the buggy code path"). More important is what the scanner *cannot* flag — a downgrade made silently: the genuinely general fix (skip the render in `--check`) is named nowhere, so it leaves no tell. Worklog line 87–98 ("The cost is purely cosmetic", "Proportionality: `concentrate` was the *cause*, not an innocent bystander") is the proportionality framing standing in for a cost.

VERDICT: narrower-but-justified — *with a load-bearing caveat that pushes it toward UNDISCHARGED-HACK on one axis.*
WHY: On the diagnosis it touches, the change is defensible: the slot is single-writer, `concentrate` is a plausible and source-grounded cause of the 2.42.2 `routesplines` crash, and removing it is a real structural change (the attribute that constructs the merged chains is gone), not a warning-suppression. That earns "narrower-but-justified" rather than "general." But the verdict is conditional on a diagnosis that is *asserted, not established* — it rests entirely on upstream-source reading plus version-correlation, with confirmation on the failing version openly pending — and a strictly more general fix (don't render the discarded SVG in `--check`) sits one structural step away, is never named, and would make the gate robust to this *class* of failure rather than this one instance of it.

FINDINGS BEYOND VERDICT (required):
  - **The cleanest fix for *this specific* CI failure was not considered.** `--check` mode renders the SVG purely as a side effect and throws the output away (`generate()` always calls `renderSvg` @1155; `checkDrift` @1216–1240 compares the JSON skeleton and the existence of INDEX/REPORT, and a comment @1232–1235 explicitly says the SVG is "intentionally NOT required"). Gating `renderSvg` behind `!checkMode` (or having `main()` skip it in check mode) would make CI exit 0 regardless of any version-bound `dot` layout bug, present or future. The shipped fix instead keeps rendering in CI and removes one attribute that happens to trip one router — leaving CI exposed to the *next* graphviz-2.42.2 layout quirk on a 474-node/2299-edge graph. This is the named-but-skipped more-general fix; it is more general precisely because it removes the dependency rather than the trigger.
  - **The diagnosis is one-sided and unverified on the failing version.** The whole causal chain (concentrate → `spline_merge` on shared virtual nodes → `getmainedge` can't find a NORMAL edge) is inferred from upstream C source + the fact that 14.1.2 is clean and 2.42.2 is not. That is a reasonable hypothesis, but "89 bidirectional pairs exist" is not evidence that *concentrate's merge of them* is what 2.42.2 chokes on — the same two failing edges could be a different 2.42.2 fragility that concentrate-removal incidentally perturbs. Nothing in the change discriminates the stated mechanism from "removing any graph attribute reshuffles the layout enough to dodge the two bad edges." The honest move the worklog already half-makes (CI-version confirmation is the closing gate) should be the *blocking* gate before this is called fixed, not a deferral.
  - **The tightened stopgap is an improvement but quietly contradicts the new claim.** The catch-block now declares a non-zero exit "NOT expected" with concentrate off — yet it still swallows that exit and returns the partial SVG. If the implementer's own framing is right (a non-zero exit is now a real degenerate-edge regression, not a warning), then the consistent ADR-0002 behavior would be to *fail* the render once concentrate is gone, not log-and-continue. Keeping the swallow means that if the concentrate hypothesis is wrong and 2.42.2 still emits `routesplines` errors, CI will once again report SUCCESS with the failure buried in stderr — the exact invisibility this work set out to remove. The loud message helps a human reading logs; it does not restore the job-status signal. (This is why "skip the render in `--check`" is the cleaner invariant: it removes the swallow-vs-fail dilemma entirely.)
  - **Residual fragility / recurrence:** the worklog itself states "the CI-version sensitivity itself does not disappear with this fix — it is dodged by not exercising the buggy code path." That is an accurate self-description of a symptom-dodge: a future `dot` bump on either side, or a future graph-shape change that re-introduces a merged/parallel chain, can reopen this. No invariant prevents it; only the absence of `concentrate` does, and only until layout pressure changes.
  - Not a multi-writer hack and not a fake-loud edit; the single-writer enumeration is clean and the ADR-0002 message rewrite is genuine. The hack signature here is *failed-to-generalize* (symptom-trigger removed instead of the discarded-render dependency), compounded by *claimed-fixed-while-unverified-on-the-only-failing-version* — not the per-producer-gate shape of the known cases.
```

### How the audit was discharged

The auditor's primary finding (the `--check` render is dead work) is now
**part 1** — the structural fix — and the `--check`-skips-`dot` proof
above closes its RUNTIME gap for CI: the gate is verified dot-free, so it
no longer matters whether part 2's 2.42.2 diagnosis is exactly right. The
stopgap-contradiction finding is resolved by part 1 too (CI no longer
reaches the swallow; the swallow now governs only a local browse, where
completing is the item's explicit scope). The remaining finding — part 2's
diagnosis is asserted, not 2.42.2-verified — is accepted and surfaced in
the limitation section above; it is bounded to the local render and does
not bear on the CI gate.

License: Public Domain (The Unlicense).
