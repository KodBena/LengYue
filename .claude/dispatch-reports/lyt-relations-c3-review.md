# LYT relations-first amendment — dispatch C3 review (fresh-context, adversarial)

Reviewer worked from the worktree at
`.claude/worktrees/agent-ace106549ab3f12c2` (commits `6e613b90` +
`cae3156a` on `lyt-phase2`), the governing spec
(`.claude/dispatch-reports/lyt-relations-amendment-spec.md`, read end
to end — census §1 and grammar sketch §3, plus the rest of the
628-line file since it fit budget), ledger rows 2403/2419/2426/2427/
2436, both REWRITTEN encodings in full, the OLD landscape/portrait
encodings via `git show lyt-phase2:...`, `relations.py`/`loader.py`/
`parser.py` (relevant sections), `facts.generated.json`/
`facts.residue.json` in full, both `.gen.ts` diffs in full, and
dispatch A's relocation report. The builder's own report
(`lyt-relations-c3-rewrite.md`) was read only AFTER my own findings
below were formed, to check for undisclosed divergence — none was
found; see §6.

## Verdict: ACCEPT-WITH-CONDITIONS

## 1. Semantic equivalence audit

Traced end-to-end (encoding text → facts/residue entry → resolved px
→ `.gen.ts`) for every track whose value changed plus a sample of
unchanged ones — well over 15 tracks across both files:

- **T(...)[BLACK BOX] pin** (both classes): `{pinned
  max-over(children.min)}` — WITNESSED resolves to 664px, matching
  the old hand literal. **Re-derived the "both-664s" mechanism myself**
  against `compiler.py`'s `_constrain` (Exclusive branch,
  `model.Add(sv.w[cpath] == w); model.Add(sv.h[cpath] == h)`, lines
  ~349-352): every T-child shares the parent's own w/h variables
  exactly, so a leaf several levels down needing `h >= 580`
  (`AT_multires`) propagates through every enclosing T's shared `h`
  regardless of any shallower node's own declared `min`. This is a
  genuine, re-derivable consequence of the compiler's own semantics,
  not a misattributed floor — it correctly refutes the orchestrator's
  earlier "roughly a third narrower" expectation (row 2403), and the
  report is right to present it as a finding rather than quietly
  reverting the redesign.
- **`A_app`** (landscape 160→28, portrait 66→56): WITNESSED. Verified
  directly against `facts.generated.json`'s `value_px` column (28,
  28, 28, 50, 56 across the five portrait states; max is 56) and the
  `.gen.ts` diff, which shows exactly these two numbers and nothing
  else changing on those lines.
- **A_engine_eval/A_engine_health** (both classes, `pref 1fr` →
  `pinned 139px` + populated `envelopeStates`): WITNESSED against
  facts and the `.gen.ts` diff (`elastic` → `fixed, px: 139`).
- **`value_w_px` non-consumption**: checked `relations.py` directly —
  `width-of`/`height-of` resolution reads only the generic `value_px`
  field (line ~546, `float(live[0].value_px)`), never `value_w_px`/
  `value_h_px`. Confirmed A_app's facts entries carry a contaminated
  `value_w_px` column (614/1200/768/540/420 — suspiciously equal to
  viewport widths, the disclosed C1 "swap phenomenon") that is
  correctly never read anywhere in the resolution path.
- **`SP_*` residue correction (160→200, landscape)**: verified against
  `git show lyt-phase2:research/lyt/encodings/lengyue_landscape.lyt`
  myself — the old file's own six `SP_*` lines all read `min 200px`,
  never 160. The correction is accurate; the prior residue entry was
  genuinely stale.
- **`tree` floor** (portrait `read-constant(tree)`=140,
  landscape unchanged literal 110): correct — landscape's number is a
  disclosed solver-only relaxation with no live-constant to bind to
  (confirmed: no `tree|read-constant|landscape` entry exists, only
  `...|portrait-floor`), so leaving it literal is honest, not an
  oversight. The load-bearing "DEAD for live rendering, consulted
  ONLY by the offline solver" disclosure from the old comment is
  preserved verbatim in the generated fact's own `state` field for
  the portrait sibling entry — a real, durable home, not lost.
- **`boardRail`/`previewBoard`-landscape** (168px / 160px, both stay
  bare literals): confirmed no `facts.generated.json`/
  `facts.residue.json` entry exists for either (boardRail's only
  entry is `unexercised: true`, cold-boot-absent; previewBoard has
  none at all) — leaving them literal rather than fabricating a
  relation against a nonexistent fact is the correct call, not a
  silent gap.
- **`aspect 1`** (board/previewBoard, 4 sites, all classes): confirmed
  directly in `parser.py` (`elif key == "aspect": num =
  self._expect("NUMBER")`) — the grammar extension list (lines
  115-152) enumerates exactly which sizing positions accept a
  relation call (`min`/`pref`/`max`/bare-shorthand/`pinned`/`@demote`
  threshold) and `aspect` is not among them. A bare number is the
  ONLY legal spelling here; this is a genuine, empirically-verified
  substrate limitation, not a missed conversion.
- **AT_multires, otherBand, CP-library/CP-cards, otherColorDebug,
  side-column cap, CP-analysis derived floor**: spot-checked against
  facts/residue and the encoding text; all resolve as claimed.

No resolution reached a number contradicting the model-change table,
and no site consumes an unconfirmed `value_w_px`.

## 2. Loader.py substrate changes

- **Aspect-drop fix** (`_load_sizing`'s fixed/pinned branch missing
  `aspect=rs.aspect`): confirmed via diff — a genuine one-line
  omission in the branch that handles bare-`{Npx}`/`pinned` shorthand
  sizing. Checked whether this could silently change any **other**
  encoding's pre-existing solve: grepped every `.lyt` file under
  `encodings/`/`fixtures/` for `aspect` — every other site
  (`ogs.lyt`, `q5go.lyt`, both fixture files, and the board leaves in
  both rewritten encodings) uses `{pref maximize, aspect 1}` or
  `{width 100fr, aspect 1}`, which the parser routes through the
  **general** (non-fixed) sizing branch — already correct before this
  fix. Only the new `previewBoard{pinned ..., aspect 1}` combination
  is novel. The fix is minimal, correctly scoped, and provably
  inert everywhere else. Necessary-and-minimal, with a test-visible
  before/after (`Sizing.aspect` None→1.0) — not scope arrogation.
- **Envelope/floor-free-capped-growth incompatibility**: no code
  change, documented as a genuine two-law collision (the envelope
  consistency check vs. the emitter's closed track-shape vocabulary).
  Reasonable to leave undischarged this wave; correctly named as the
  cause of the disclosed INFEASIBLE flip rather than routed around.

## 3. INFEASIBLE flip at portrait 420×880

Re-derived independently: `A_engine_eval`/`A_engine_health` each
gained a real `139px` floor for the first time (previously bare
`pref 1fr`, no min). `A_engine_controls`(185) + eval(139) +
health(139) + 3×gap(4) = 475px, exceeding 420px's own available row
width — arithmetic checks out. Read both updated tests
(`test_lyt.py`'s `known_infeasible_by_valuation` addition,
`test_emit_layout_tree.py`'s orientation-vote and envelope-null
tests) in full, old and new: each names the exact mechanism inline,
none merely relaxes an assertion without cause, and the orientation
test's remaining four sizes still agree unanimously — no gate
weakening. The flip is presented as a table row in §2 of the
builder's report, not silently absorbed.

## 4. Purge accounting

Grepped both OLD headers for the named markers; every hit resolves to
one of: dispatch A's own relocation table (verified A's report exists
and is genuine, `.claude/dispatch-reports/lyt-relations-a-relocation-
probe.md`), a `facts.generated.json`/`facts.residue.json` provenance
field (spot-checked, e.g. the tree/landscape solver-relaxation
disclosure), or SPEC-AMENDMENTS.md's "Residual items" R1/R2 (confirmed
present, lines 1734/1767). No load-bearing homeless content found.

One real gap: the CP-analysis "honest floor" derivation, the
both-664s finding, and the two substrate bugs are recorded **only**
in the C3 dispatch report itself, not in SPEC-AMENDMENTS.md — even
though SPEC-AMENDMENTS.md's own "Residual items" section is the
precedent dispatch A already established for exactly this class of
durable substrate-level finding. A dispatch report is a reasonable
interim home but is not where a future reader auditing SPEC-
AMENDMENTS.md would look. Flagged as a condition below, not a defect
in the rewrite itself.

## 5. Zero literals / zero comments

`grep -c -- '--'` returns 0 for both files — zero comments confirmed.
Zero **literals** is not fully achieved: roughly 15 sites remain bare
px (`boardRail`, `I_board`/`A_board`, landscape `tree`, `pack-rows`'s
six item widths, `timelineStrip`, `settingsSubstrip`, `otherColorDebug`,
`otherBand`'s enclosing 204, `previewBoard`-landscape, the side
column's 345px width floor, `aspect 1`×4, gap tokens). Every one I
spot-checked is honestly disclosed and grounded in a real, verifiable
absence (no facts entry, or the grammar structurally cannot carry a
relation there) rather than an oversight — `gap` literals are further
grammar-mandated (loader.py refuses anything but a constant px extent
in gap position, pre-existing law, not in scope here). This is a
genuine, disclosed shortfall against the brief's literal "zero
comments... zero px literals" framing, exhaustively enumerated in the
report's §7 rather than glossed over — but it is still a shortfall
against the letter of the commission, and row 843 ("disclosure is not
authorization") means this deserves an explicit commissioner
sign-off that "zero literals, bounded by what the current facts
substrate can reach" satisfies the mandate, rather than being treated
as tacitly closed.

## 6. Cross-check against the builder's report (read after my own pass)

No undisclosed divergence found. Every finding I made independently —
boardRail/previewBoard-landscape/tree-landscape staying literal, the
aspect-grammar limitation, the both-664s mechanism, the two loader.py
bugs, the honest test updates — is disclosed in the report in
materially the same terms, several with more precision than I
reached independently (e.g. the exact refusal message for `gap`
resolving against the wrong enclosing split in redesign 3.4). The
report's self-graded WITNESSED/UNEXERCISED claims match what I could
independently verify.

One item I could **not** cleanly reproduce: the report's "119 total
(61+58), down from 528" deprecation-warning count. My own attempt
(`build_program_for` under `warnings.catch_warnings`) returned much
higher raw counts (180/177) because `_derive_tree_orientation`
internally cross-loads the OTHER registration for independent
derivation, contaminating a naive per-file count — a methodology bug
on my end, not a demonstrated error in the report's figure. The
*qualitative* claim (which specific sites remain literal) matches my
own grep/warning-site enumeration closely. I did not find budget to
build a clean, contamination-free reproduction; this is UNEXERCISED
on my part, not a confirmed contradiction.

## 7. Gates (run myself, fresh venv)

- `pytest tests/ -q`: **421 passed, 11745 warnings, exit 0** — matches
  the report exactly.
- Regenerated both `.gen.ts` files (`emit_layout_tree.py --registration
  landscape`/`portrait`): **byte-identical** to the committed files
  (`diff -q` silent both ways).
- `.gen.ts` diff against `lyt-phase2`: exactly the four predicted
  values (A_app 160→28, 66→56; eval/health elastic→fixed 139 +
  envelopeStates), nothing else — confirmed via full `git diff`
  inspection, not just stat.
- `lyt-conformance.mjs`: correctly left UNEXERCISED (forbidden
  browser/port), consistent with dispatch discipline.

## 8. Conditions for merge

1. Commissioner sign-off that the qualified "zero literals" delivered
   (exhaustively enumerated, each site backed by a genuine facts-
   substrate or grammar absence) satisfies the C3 mandate, rather than
   this being silently treated as complete — per row 843.
2. Fold the both-664s finding, the two substrate bugs, and the
   CP-analysis derived-floor redesign into SPEC-AMENDMENTS.md's
   "Residual items"/limitations section, matching the precedent
   dispatch A already set with R1/R2 — a dispatch report is
   provenance, not the doc graph's durable home for a substrate-level
   finding.
3. An independent re-count of the deprecation-warning figures before
   citing "528→119, 77.5% reduction" as a settled number elsewhere —
   my own attempt was inconclusive due to a cross-registration
   contamination bug in my measurement script, not a demonstrated
   error, but it was not independently confirmed either.

Everything else — the rewrite's semantic correctness, the loader.py
fix's minimality and scope, the honest test updates, the purge
accounting, and the both-664s finding — is independently reproduced
and sound. Nothing found here rises to REJECT.
