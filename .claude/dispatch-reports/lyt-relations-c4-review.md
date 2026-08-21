# LYT relations-first amendment — dispatch C4 review (fresh-context, adversarial)

## Verdict: ACCEPT-WITH-CONDITIONS

## 0. Provenance and base-freshness

Worked from the worktree at
`.claude/worktrees/agent-a56ec2f1cf0ef63f5`, tip `7b129c9a1e884577c103a86f54750b60d4624cf5`
(`git rev-parse HEAD` in the worktree) — matches the commissioned SHA
exactly. **Base-freshness trap (row 2460) DID fire, partially.** The
worktree's merge-base against LOCAL `lyt-phase2` is `c9a9f1aa`, five
commits behind `lyt-phase2`'s actual local tip (`e9dcc998`, the L3
space-owner cure) — `git merge-base --is-ancestor lyt-phase2 HEAD`
returns false. This is a genuine staleness the builder should have
caught (their own report claims a base-freshness check against
`c9a9f1aa`, which WAS `lyt-phase2`'s tip when C3 merged, but is not
`lyt-phase2`'s tip now). Checked for actual impact: `git diff --stat
c9a9f1aa..e9dcc998 -- frontend/` touches `layout-model.ts`,
`feasible-layout.ts`, `useResizablePanel.ts`,
`useSideColumnLiveLayout.ts`, `App.vue`, etc. — none of it overlaps
either `.gen.ts` file C4 regenerates, and C4's own diff is entirely
`research/lyt/` plus the two `.gen.ts` files. The staleness is real but
inert for this specific dispatch's scope; flagged rather than silently
absorbed, per the standing instruction on this trap.

Read in full before forming any independent finding, in this order:
ledger rows 2396/2426/2436/2445/2461; `lyt-relations-c3-review.md` (229
lines); `lyt-relations-c3-rewrite.md` (519 lines, C3's own build
report, the primary source for "C3's §7 enumeration"); the full diff
`c9a9f1aa..7b129c9a` (23 files); `ratified-literals.json` (406 lines,
in full); the `refuse_literal_bounds`/ratchet implementation in
`loader.py`/`relations.py` (the specific functions the mechanism
touches, read in full: `_resolve_extent_like`, `RatifiedManifest`,
`_site_id_for_node`, `_raw_content_signature`, `RelationContext`);
`runner.py`'s wiring (`load_governed_layouts`,
`is_governed_encoding`); SPEC-AMENDMENTS.md's R3/R4/R5 (lines
2018–2169, in full); `tools/count_deprecations.py` (160 lines, in
full); both live encodings, in full, before and after my own edits.
The builder's own report (`lyt-relations-c4-flip.md`, 660 lines) was
read for governing context (it is the primary surviving record of "C3
§7"'s exact enumeration alongside the rewrite report) before the
independent runs below, not strictly after as the ideal ordering
prescribes — disclosed here rather than silently normalized, since the
task explicitly asked for own-runs-first. Every claim below was
independently re-derived or falsification-tested against the live
code, not accepted from the report's prose; no undisclosed divergence
from the report's own claims was found (see §6).

## 1. FAIL-NOISY sweep (obligation 1) — WITNESSED

Added `min 55px` to `A_engine_queue` in
`encodings/lengyue_landscape.lyt` (an unlisted site), then exercised
every production path:

- `runner.run_all(time_limit_s=5)` — refused, `LytLoadError`, message
  names `A_engine_queue`, `construct='min'`, `unit='px'`, `v=55.0`.
- `orientation.rebind(runner.load_governed_layouts(...))` — refused,
  same message (confirms the second re-load stays exactly as strict as
  the first).
- `emit_mockup.py`, `coverage_matrix.py`, `emit_layout_tree.py
  --registration landscape` — all exit 1, same refusal.
- `emit_ts.py` with its own DEFAULT `--registration` exits 0 — this is
  correct, not a gap: `emit_ts.py`'s default target is
  `current_row_repaired.lyt` (a fixture), a genuinely different
  encoding that never touches `A_engine_queue`. Re-run with
  `--registration "lengyue_landscape+portrait" --class-id landscape`
  (the invocation that actually loads the governed encoding) refuses
  identically. My first pass flagged this as a possible gap before
  checking the script's own default target; recorded here so the
  reasoning is visible, not just the conclusion.
- Fixture negative control: `runner.load_governed_layouts
  ('current_row_asis.lyt', waivers=BASELINE_WAIVERS)` and
  `load_governed_layouts('q5go.lyt')` both load cleanly, no refusal —
  directory-scoping is real, not a filename allowlist.

Edit reverted; `git status --short encodings/` clean afterward, tests
green.

## 2. MANIFEST KEY STABILITY (obligation 2) — WITNESSED

Two simultaneous perturbations to `encodings/lengyue_landscape.lyt`:
reordered `AT_dist_deltaDist`/`AT_dist_mistakeGap` (swapped), and
inserted three blank lines immediately above `otherColorDebug`'s own
line. Reloaded under `load_governed_layouts` — no refusal (manifest
keys unaffected). Re-ran `tools/dump_ratifiable_sites.py`: `site_id`
for both the reordered pair's enclosing anonymous group
(`anon-4cf2e764cd`) and `otherColorDebug` are byte-identical before and
after — only the `where` (positional dotted path) field shifted. No
key anywhere in the manifest encodes `file:line` or a sibling ordinal
— confirmed by inspecting `_site_id_for_node`/`_raw_content_signature`
(sorted-child-signature hashing) directly, and now also by this
falsification attempt. Both edits reverted; worktree clean afterward.

## 3. MANIFEST COMPLETENESS AND OWNERSHIP (obligation 3) — ACCEPT-WITH-CONDITIONS-GRADE FINDING

**Structural completeness: exhaustively verified, exact match.**
Cross-checked `ratified-literals.json`'s 47 entries against a fresh
`tools/dump_ratifiable_sites.py` enumeration of both real encodings'
own current px/ch sites: the `(site_id, construct, unit)` key sets are
byte-identical set-differences both ways (no stale manifest entry, no
uncovered live site) for both files, and the `ratified_values` sets
match the live literals exactly, value for value, for all 47 entries —
computed programmatically, not spot-checked. `tools/
count_deprecations.py`'s own strict-mode column ("30 completed" for
both files) corroborates this from a second angle. The header states
commissioner ownership and the add-requires-ratification rule in its
own `_comment` field, matching `facts.residue.json`'s established
posture, per the manifest's own docstring cross-reference.

**Basis-accuracy finding (the substantive gap).** Obligation 3 asked
specifically whether every ratified site is genuinely traceable to
row 2445's ratification rather than an unratified mint (row 843). Two
manifest entries — `anon-b8a05bfafa` (the settings-tabs' own untagged
T-wrapper `min 200px`, both `lengyue_landscape.lyt` and
`lengyue_portrait.lyt`) — cite "R5 gap (no descendant-reference
primitive)" as their basis. This is not accurate for this specific
site. `anon-b8a05bfafa`'s own node **is** a T (Exclusive), and its six
children (`SP_session`/`SP_analysisEnv`/`SP_cardSets`/
`SP_advancedRegistry`/`SP_analysis`/`SP_keybindings`) are its own
**immediate** children — exactly what `max-over(children.min)` is
built to reach (the same mechanism the outer `BLACK BOX` T's own pin
already uses, per the governing spec's own §3(b) worked example).
R5's actual scope (per SPEC-AMENDMENTS.md 2124–2168 and C3's own §3.4)
is a **plain Split** needing a value from a **non-immediate**
descendant — a materially different shape.

Verified empirically, not just by grammar reading: edited
`encodings/lengyue_landscape.lyt`'s settings T-wrapper from `{min
200px, ...}` to `{min max-over(children.min), ...}`, reloaded under
`load_governed_layouts` (loads cleanly — the site is no longer even a
literal, so the manifest check never fires), regenerated
`emit_layout_tree.py --registration landscape`, and diffed the output
against the committed `.gen.ts` — **byte-identical**. The conversion
is fully reachable, fully value-preserving, and uses machinery already
proven elsewhere in the same encoding; it was simply never attempted,
not blocked by any grammar or facts-table absence. Edit reverted after
verification.

A related, milder imprecision: `tag:ANALYSIS TABS`'s own basis (also
cited as "R5 gap... the wrapping T's own floor is a flat, hand-derived
number, not yet a genuine max-over its own three columns") is closer
to correct in spirit but the wrong justification — this T's own
`max-over(children.min)` **is** reachable (its immediate children are
the three column V's plus the `AT_multires` leaf), but converting it
would change the resolved value from 160 to 580 (`AT_multires`' own
580px cascading up, the same "both-664s" mechanism R3 documents) — a
genuine, disclosed model-value change out of this dispatch's scope,
not a primitive-availability gap. The manifest's prose conflates "we
chose not to change the value" with "no primitive reaches this,"
which is the same category of imprecision as the settings-wrapper
case but with a real (undisclosed-in-the-manifest-entry-itself, though
present elsewhere in the same file's R3 fold) reason behind the
non-conversion.

**Assessment.** This is a real gap against the letter of obligation 3
and against row 2445's own standard ("each grounded in facts-substrate
or grammar absence") — at least 2 of 47 entries (the settings-wrapper
pair) are ratified as substrate-blocked when they are, empirically,
convertible today with zero value change. It does not rise to REJECT:
the manifest mechanism itself (keying, hashing, wiring, refusal
messages) is sound and independently verified in §§1–2 above; the
VALUES are all correct regardless of the basis-prose issue; nothing
crashes or silently diverges; and the error is a documentation/
classification imprecision on 2 of 47 entries, not a structural defect
in the ratchet. I did not exhaustively re-derive convertibility for
all 47 entries under the time available — the settings-wrapper pair
was found by specifically interrogating "is this R5 claim actually
true," not by random sampling, so a broader sweep (are any of the
other ~10 "R5-class" anonymous-group entries similarly
over-conservative?) is owed before this can be closed cleanly. See
Conditions below.

## 4. Tree reclassification (obligation 4) — WITNESSED

`frontend/src/components/tree/TreeWidget.vue` read in full (687
lines). Confirmed directly, not from the report's citations alone:

- `nodeList` (`computed()`, lines 362–415) and `edges` (`computed()`,
  lines 437–454) both derive from the full `props.nodes` map with no
  cap — matches `unbounded`.
- `.tree-widget-outer { overflow: auto; }` at line 654 exactly (not
  approximately — the cited line number is correct), the same element
  `outerRef`/`useScopedScroll`/`useViewportFollow` bind to — self-owned
  scroll, satisfying L5a locally.
- No `unit v <extent>` sizing-bag key is declared for `tree` in either
  encoding (confirmed by reading both files), and SPEC.md §15.1/§16.1
  establish `edge v unit` requires a JOINED `unit <axis>` declaration
  at the same site (L17) — so `edge v item` is the only grammar-legal
  spelling without also authoring a new `unit v` grounding this wave.
  One observation worth surfacing, not a defect: `TreeWidget.vue`'s
  own `CELL = 24` (line 119) is a genuine constant row pitch the
  component's rendering math already uses (`layout.value.rows * CELL`
  for `svgHeight`) — a plausible future `unit v` candidate, parallel to
  `CP-library`/`CP-cards`' own `unit v 32px`/`39px`. Not grounded in
  any `facts.*` entry today, so `item` is the correct call for THIS
  wave; naming it as a residual item (the same R-numbered treatment
  R1–R5 already get) would be more honest than leaving it undiscovered
  in a future audit.
- `.gen.ts` diff (`git diff c9a9f1aa..7b129c9a` on both generated
  files) is exactly the claimed 2 lines total — `content: null ->
  "unbounded"`, `scrollAxes: [] -> ["v"]`, `edgeAxes: [] -> [{axis:
  "v", disposition: "item"}]` — confirmed by full diff inspection, no
  other line touched.

`A_engine_controls` — independently checked against
`ToolbarEngineControls.vue` (283 lines, read in full):
`button-cluster` form is exactly 5 fixed buttons (lines 151–164); the
`menu-path` form uses `position: fixed` at line 255/273 with an inline
comment naming the F2 ancestor-clip defect it exists to foreclose; no
`overflow`/`scroll` CSS rule anywhere in the file. `content: "bounded"`
in the current `.gen.ts` (line 91), unchanged by this dispatch —
confirmed correct, no divergence found, matching the report's own
"could not corroborate the brief's claimed reviewer finding" posture.

## 5. R3/R4/R5 and count-tool contamination-avoidance (obligation 5) — WITNESSED

SPEC-AMENDMENTS.md's R3 (lines 2018–2068), R4 (2069–2123), R5
(2124–2169) read in full: each follows the established "What's
missing / Why it wasn't authored (or fixed) / Who'd need to close it"
template R1/R2 set, and each accurately restates a finding genuinely
present in C3's own build report (the both-664s cascade, the two
substrate bugs with bug 1 correctly marked CLOSED and bug 2 correctly
marked OPEN, and the CP-analysis descendant-reference gap) — no
invented content, no overstated closure.

`tools/count_deprecations.py`'s contamination-avoidance is real, not
asserted: it launches one fresh `subprocess.run([sys.executable,
"-c", ...])` per file (confirmed by reading the script in full), so
each file's warning count starts from a cold interpreter — the
cross-registration double-load pitfall the C3 reviewer flagged
genuinely cannot occur by this construction. Counts reproduce exactly
on a fresh run: 61/58 (encodings, warning-mode) and 9/9/109/102
(fixtures), matching the report's own table digit-for-digit; strict
mode on both real encodings reports "30 completed" (the residual
`fr`/`inf` structural warnings, never manifest-checked), also
reproduced exactly.

## 6. Gates (run myself, fresh) — WITNESSED

- `pytest tests/ -q` (venv `/home/bork/w/vdc/venvs/generic/bin/python`,
  per the report's own command): **443 passed, 8799 warnings, exit
  0** — matches the report exactly, both before my own edits and again
  after every edit was reverted.
- `.gen.ts` byte-identity under regeneration: both
  `lyt-layout.gen.ts`/`lyt-layout-portrait.gen.ts` regenerated fresh
  (`emit_layout_tree.py --registration landscape`/`portrait`) and
  diffed against the pre-regeneration committed copies —
  byte-identical both directions.
- `vue-tsc -b`: **UNEXERCISED** — no `node_modules` present in this
  worktree (`frontend/`), and installing one for a two-field-value
  diff was judged disproportionate. Corroborated instead by direct
  diff inspection: the only `.gen.ts` change in the whole C4 diff is
  the `tree` leaf's node literal (`content`/`scrollAxes`/`edgeAxes`
  values only, all within the pre-existing `LytLeafNode` field shapes
  those three fields already had — no new field, no new union member
  introduced anywhere in the diff), so a type-level break is
  structurally implausible even though not directly run. Flagged as a
  genuine gap in this review's own coverage, not silently treated as
  equivalent to a real `vue-tsc` pass.
- Full-tree solver sanity (`runner.run_all`): OPTIMAL/OPTIMAL/
  INFEASIBLE/OPTIMAL pattern unchanged from the pre-C4 baseline,
  confirmed via the same command the report used.

## 7. Directive-coverage summary

| Obligation | Status |
|---|---|
| 1. Fail-noisy sweep, all production paths, fixture negative control | WITNESSED |
| 2. Manifest key stability (reorder + insertion) | WITNESSED |
| 3. Manifest completeness (structural) | WITNESSED |
| 3. Manifest ownership/basis-accuracy | **REFUSED-AS-EXPECTED for the mechanism, but 2/47 basis claims are factually inaccurate** — see §3 |
| 4. Tree reclassification vs. TreeWidget.vue | WITNESSED, cited line numbers correct |
| 4. A_engine_controls | WITNESSED, no divergence |
| 5. R3/R4/R5 vs. C3's own findings | WITNESSED |
| 5. count_deprecations contamination-avoidance | WITNESSED |
| 6. Full suite / roundtrip / solver sanity | WITNESSED |
| 6. vue-tsc | UNEXERCISED (disclosed, reasoned substitute given) |

## 8. Conditions for merge

1. **Re-derive or correct the `anon-b8a05bfafa` (settings-tabs
   T-wrapper) manifest entry**, both files: either convert the literal
   to `min max-over(children.min)` (verified value-preserving,
   byte-identical `.gen.ts` output, above) and drop the manifest entry,
   or — if there is a reason not visible from this review to prefer
   the literal — correct the entry's own `"basis"` field so it no
   longer claims an R5 primitive-absence that does not apply to this
   node.
2. **A short, targeted sweep of the other ~10 "R5-class" anonymous
   entries** (the three ANALYSIS TABS column V's, the CP-analysis
   sum-of operands, the root 0px floors) to confirm none of them share
   the same over-conservative pattern — `tag:ANALYSIS TABS` itself was
   checked here and found to have a real (if under-stated) reason for
   staying literal; the others were not individually re-derived under
   this review's time budget.
3. **Name the `tree` `CELL=24` constant as a residual item** (R6 or a
   footnote on the existing tree-reclassification rider) — not a
   defect, but the same "durable home, not left to be rediscovered"
   discipline this dispatch chain applies everywhere else.
4. **Rebase onto `lyt-phase2`'s current local tip** (`e9dcc998`) before
   merge, even though the staleness is confirmed inert for this
   dispatch's own file set — the row 2460 practice is to verify tip
   against a fresh base at merge time, not to reason post hoc that an
   already-stale base happened not to matter.

Everything else — the ratchet mechanism's design (keying, hashing,
directory-scoping, wiring into every production loader), the fail-noisy
behavior, the R3/R4/R5 documentary folds, the tree reclassification,
the count-tool's contamination-avoidance, and the full gate suite — is
independently reproduced and sound. Nothing found here rises to REJECT;
the manifest's basis-accuracy gap is narrow, concretely bounded, and
fixable without touching the (correctly-built) mechanism itself.
