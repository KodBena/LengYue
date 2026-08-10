# lyt-docs-abc — C1 fresh-context repair pass

ADR-0017 fresh-context audit loop, pass C: repairing 20 concrete
findings three blind fresh-context (B) reviewers made against
`research/lyt/SPEC.md`, `research/lyt/README.md`, and
`research/lyt/SPEC-AMENDMENTS.md` as they stood at c58ba96a. This
session performed no independent legibility judgment — it discharged
the findings exactly as specified, plus verification of every
technical claim a repair introduced.

Base: rebased worktree onto local branch `lyt-phase2`
(`origin/lyt-phase2` == c58ba96a at rebase time; confirmed
`git merge-base --is-ancestor c58ba96a lyt-phase2`).

## Per-finding repair table

### research/lyt/SPEC.md (6 findings)

| # | Before | After |
|---|---|---|
| 1 | `disclosed direction (see §11 for the fuller discussion): the *opposite*` | `disclosed direction (see §12 for the fuller discussion): the *opposite*` |
| 2 | `tree genuinely cannot serve is a fact about the geometry (or, per §11,\nabout the language's own aspect/exact-cross-fill collision)` | same, `§11` → `§12` |
| 3 | `**The aspect / exact-cross-fill collision (§2, §11's aspect-slack\n  stage) is a genuine, unresolved spec-level tension**` | `§11's` → `§8's` |
| 4 | `Stated honestly, per this document's own standard (the fresh-context\nlegibility discipline this specification is written to — see the\nopening paragraph):` | `...written to —\n[ADR-0017, the zero-context reader](../../docs/adr/0017-the-zero-context-reader.md)):` |
| 5 | `**Decision variables.** One integer \`(w, h)\` pair per Slot, per screen\nclass, in px.` | `**Decision variables.** The compiler declares one integer \`(w, h)\` pair\nper Slot, per screen class, in px.` |
| 6 | `\`max(min, pref)\` on its presence-bearing axis, at load time` (first use, §9.3) | `\`max(min, pref)\` on its presence-bearing axis (the axis its sizing\nblock constrains under its parent's split — both axes for a \`T\`\nchild, per §8's \`along=None\` bound-application branch), at load time` |

### research/lyt/README.md (6 findings)

| # | Before | After |
|---|---|---|
| 1 | `## AMENDMENT 1 consequence: preserve reservations are now genuine, and the` / `## board sometimes has to shrink to pay for them` (two `##` lines) | joined into one `##` heading |
| 2 | `adversarial review's own OBSERVATION finding. After the amendment...` | `...OBSERVATION finding (an OBSERVATION — a\nnon-blocking note outside the review's MAJOR/MODERATE/MINOR severity\nscale). After the amendment...` |
| 3 | `collides with the tree/panels row's \`WRAPPER_MIN\` floor regardless of` | `collides with the tree/panels row's \`WRAPPER_MIN\` floor — the\ntree/panels row's own minimum-width constant, \`loader.WRAPPER_MIN_PX\`;\nsee [SPEC.md](SPEC.md) §11's infeasibility discussion — regardless of` |
| 4 | `(the board composite's own\nV-split forces an exact board size...` | `(the board composite — the\nV-split subtree containing the board leaf and its info/action strips —\nforces an exact board size...` |
| 5 | opening: title then straight into the tooling enumeration | added orienting sentence before the enumeration: `This directory holds a research prototype that checks whether a proposed\nscreen layout for LengYue's SPA is even geometrically possible, before\nanyone builds it — for a reader (human or LLM) orienting to the LYT\nproject cold.` |
| 6 | `the LYT shadow-harness's AS-IS\nconformance baseline` | `the LYT shadow-harness's (a\n"shadow" measurement rig, \`frontend/scripts/lyt-conformance.mjs\`, that\nmeasures the LIVE SPA's rendered DOM geometry and diffs it against\nLYT's solved layout, without altering the app) AS-IS\nconformance baseline` |

### research/lyt/SPEC-AMENDMENTS.md (8 findings; FROZEN-BODY POLICY)

| # | Location | Repair |
|---|---|---|
| 1 | Header line ~4 (repairable, edited in place) | `...adjudicated on the work-status ledger.` → `...adjudicated on the work-status ledger (the project's\nappend-only decision ledger, read via \`./autoharn led\`).` |
| 2 | Frozen: "the cold review", Amendment 1 line 41 | Discharged via appended `### Reader's glosses` section — names `.claude/dispatch-reports/lyt-compiler-cold-review.md`, distinguished from the earlier `lyt-compiler-prototype-review.md` |
| 3 | Frozen: "the cold review", Amendment 2 line 122 | Same appended gloss entry covers both cited locations |
| 4 | Frozen: "F10 disclosure"/"F10-era" (lines 245, 309, 346) | Appended gloss: finding 10 of `lyt-compiler-prototype-review.md`, the gap_px-unreachable disclosure |
| 5 | Frozen: "CP-SAT" (lines 86, 318) | Appended gloss: Google OR-Tools' constraint-programming solver, the engine `compiler.py` drives |
| 6 | Frozen: `1920x1080-in-portrait` / `1080x1920-in-landscape` table-row naming | Appended gloss: SIZE-in-CLASS convention, both mirror rows covered |
| 7 | Frozen: "presence-bearing axis" (Amendment 1, line 32) | Appended gloss, kept textually consistent with SPEC.md finding 6's gloss |
| 8 | Frozen: feasibility table (lines 492-507) lacking lead-in | Appended gloss stating the table's content: per-size feasibility comparison, all-present vs default valuations |

New section: `### Reader's glosses — 2026-08-11 (appended per ADR-0005
Rule 8; the amendment bodies above stand verbatim)`, inserted after
Amendment 4's own "What it touched" paragraph and before `## License`.
No word inside the four dated Amendment sections was altered.

## Verified-claims list

- **T-child both-axes claim** (SPEC.md finding 6 / SPEC-AMENDMENTS
  finding 7): read `research/lyt/loader.py`'s
  `_apply_preserve_reservation` (only ever touches the single
  `Sizing.min` scalar — consistent with SPEC.md §4.2's "1-D-per-slot"
  narrowing) and `research/lyt/compiler.py` — grepped and read
  `_constrain` around its `along=None` branch (line ~249-360), which
  SPEC.md §8 (already present, unmodified, at c58ba96a) documents as
  applying sizing bounds to *both* `w` and `h` for a `T` child /
  root slot. The gloss states what the code does (bounds apply on
  both axes for a `T` child), not an inferred intention — no
  independent code-behavior claim was invented beyond what SPEC.md §8
  itself already asserted and I re-confirmed by reading the
  `_constrain` function signature and its docstring's `along=None`
  description.
- **`WRAPPER_MIN` home** (README finding 3): grepped
  `research/lyt/loader.py` — `WRAPPER_MIN_PX = 300.0` defined at line
  87, resolved from the symbolic sentinel at line 133-134. Cited that
  file and constant name truthfully.
- **shadow-harness behavior** (README finding 6): read
  `frontend/scripts/lyt-conformance.mjs`'s header docstring (lines
  1-71) — confirmed it "measures the RENDERED bounding rectangles of
  the DOM elements the `SLOT_SELECTORS` table below maps to LYT slot
  ids, and diffs them against the solved geometry" from the generated
  module, and explicitly states "this script never edits the app to
  make the numbers agree; it reports what it measures." Gloss reflects
  this without embellishment.
- **ADR-0017 existence/path** (SPEC.md finding 4): confirmed
  `docs/adr/0017-the-zero-context-reader.md` exists via `ls`; relative
  path `../../docs/adr/...` verified correct from
  `research/lyt/SPEC.md`'s location.
- **§ numbering** (SPEC.md findings 1-3): read SPEC.md end to end;
  confirmed via `grep -n "^## "` that §8 is "The CP-SAT compilation
  contract" (home of the aspect-slack stage, stage 2 of its staged
  solve) and §12 is "Known limitations and open questions" (home of
  the aspect/cross-fill discussion); §11 is "Presence valuations
  (Amendment 4)".
- **F10 / cold-review claims** (SPEC-AMENDMENTS.md frozen findings):
  `.claude/dispatch-reports/lyt-compiler-cold-review.md` and
  `lyt-compiler-prototype-review.md` are **not present in this
  worktree** — they are untracked local dispatch-report artifacts
  (per the umbrella's original `git status`, `.claude/dispatch-reports/`
  entries are untracked) not carried by a fresh git worktree. I could
  not open either file directly to re-verify wording. The F10 gloss is
  corroborated internally: SPEC-AMENDMENTS.md's own Amendment 3 body
  (already-frozen prose, read in full) states the mechanism directly —
  "no concrete syntax in this parser... ever set it, so `loader.py`
  hardcoded `gap_px=0.0` unconditionally (the 'F10 disclosure', review
  row 1609)" — so the appended gloss restates a fact the frozen text
  itself already asserts, rather than a fact sourced only from the
  unavailable review document. The "cold review" gloss's filename and
  distinction from the prototype review were taken as given by the
  commissioning brief; this is flagged as unverified against the
  primary source, since that source is not available in this worktree.

## pytest

```
nice -n 19 ~/w/vdc/venvs/generic/bin/python -m pytest research/lyt -q
98 passed in 2.46s
EXIT:0
```

## Commit

Docs-only change, committed in the worktree (not pushed). See `git log
-1` in the worktree for the sha.
