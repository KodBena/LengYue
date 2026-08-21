# lyt-docs-abc: A-side pre-review report

**Role.** A-side checklist-driven pre-review (the +A:B:C pattern's
find-and-fix pass, run before the fresh-context B/C rounds) over the
three LYT documentation files: `research/lyt/SPEC.md`,
`research/lyt/README.md`, `research/lyt/SPEC-AMENDMENTS.md`. Findings
instrument: `/home/bork/w/vdc/1/autoharn/attestations/COMMON-DEFECT-CLASSES.md`
(read end to end). Standard the fixes serve:
`docs/adr/0017-the-zero-context-reader.md` (read end to end).

**Base.** Rebased worktree onto local branch `lyt-phase2` (verified
82e0dc76). All three target documents present.

## Per-document, per-class fixed counts

### `research/lyt/SPEC.md` (fully editable — not an append-only record)

- **bare-path-citation** (23): every bare-backtick citation of `SPEC-AMENDMENTS.md`,
  `README.md` (both the umbrella root's and the sibling's), the consult
  document (`.claude/dispatch-reports/layout-language-consult.md`, both the
  full-path and short spellings), and `.claude/dispatch-reports/lyt-spec-grammar-audit.md`
  converted to resolving relative markdown links.
- **dangling-referent** (4): "A cold review demonstrated..." (§5) named and
  linked to the actual adversarial-review report, matching README.md's own
  naming; "the commission's own words" (§11) retargeted to "Amendment 4's
  own ledger-row-1737 ruling" (the term "commission" was never defined
  anywhere in SPEC.md); "q5go/OGS comparison encodings" glossed at first
  use (§1.1) and given a full gloss at their formal introduction (§6) —
  neither term was ever explained as third-party Go client UIs.
- **ungrounded-structure** (3): §4 (Sizing stratum), §6 (Screen classes),
  and §7 (Objective) each opened directly on a code block with zero
  lead-in prose — the figure-caption rule (Rule 1c). A one-sentence
  grounding lead-in was added before each.
- **stale-or-inaccurate-reference** (7): `(§4.4)` appeared twice pointing
  at a section that does not exist in this file — both retargeted to
  `§9.4`, where Amendment 3's gap-declaration enforcement is actually
  documented; a companion `(§5.2)` (also nonexistent) retargeted to `§11`,
  where Amendment 4 is documented; "L1, §5" corrected to "L1, §4.3" (§5 is
  the L2 dominance test, not L1); a bare `(§0)` (no such heading exists)
  replaced with a plain-words pointer to the document's own unnumbered
  opening paragraph; two "the control-panel 'black box', §7" citations
  (§7 is the Objective section — it never discusses black-box domains)
  replaced with an inline gloss instead of a false pointer.

### `research/lyt/README.md` (fully editable)

- **bare-path-citation** (20): the same `SPEC.md`/`SPEC-AMENDMENTS.md`/
  consult-document pattern as SPEC.md, plus five dispatch-report
  filenames (`lyt-compiler-prototype-build.md`,
  `lyt-compiler-prototype-review.md`, `lyt-compiler-fix1-build.md`,
  `lyt-presence-valuation-solve.md`, `lyt-constants-swap-build.md`)
  converted to resolving links.
- **dangling-referent** (4): "the tree-always-visible commission's own
  build report" named and linked to
  `.claude/dispatch-reports/lyt-tree-always-visible-build.md` — the report
  was never named in README.md at all, only in SPEC-AMENDMENTS.md's
  (unfixable, dated) Amendment 4 body; "the cold review's own OBSERVATION
  finding" renamed to "the adversarial review's own..." for consistency
  with the term README.md itself uses at first mention; "q5go/OGS/the
  clean-room encodings" given an inline gloss distinguishing the
  from-scratch LengYue registrations from the as-is transcriptions; a
  stray, unexplained "invention 25" (no numbered list exists anywhere
  this could resolve to) had the bare numeral dropped — flagged below as
  a residual concern rather than a confident repair.
- **factual-self-inconsistency** (1): "Three language amendments...
  (rows 1670/1671/1715)" contradicted the document's own later "AMENDMENT
  4" section — corrected to "Four... (rows 1670/1671/1715/1737)" and the
  `lyt-gap-amendment-build` bare mention in the same paragraph was also
  linked and a forward-pointer to the Amendment 4 section added.
- **stale-or-inaccurate-reference** (1): "(§4.4)" pointing into `SPEC.md`
  at a nonexistent section, for a claim about multi-class/nearest-neighbor
  design — retargeted to `SPEC.md` §6, which is that design's actual home.

### `research/lyt/SPEC-AMENDMENTS.md` (append-only amendment RECORD —
fixes limited to non-amendment framing text per ADR-0005 Rule 8; the four
dated `## Amendment N` bodies, lines ~28-538, were not touched)

- **bare-path-citation** (9): every bare citation in the header (before
  the first `## Amendment` heading) and in the closing License section —
  `SPEC.md` (×2), `layout-language-consult.md` (×3), and four dispatch
  report filenames — converted to resolving links.
- **factual-self-inconsistency** (1): the header's "Three language
  amendments... implemented on top of that fix pass" (with build-report
  pointers for Amendments 1/2 and 3 only) contradicted the file's own
  four `## Amendment N` sections — corrected to "Four", and a build-report
  pointer for Amendment 4 (`lyt-presence-valuation-solve.md`) was added,
  matching the pattern already used for Amendments 1/2 and 3.

## Unfixable-by-policy (logged, not edited)

Eleven bare-path citations inside `SPEC-AMENDMENTS.md`'s four dated
Amendment bodies (lines 105, 225, 244, 247, 267, 321, 335, 371, 384, 459,
537) cite `README.md`, `layout-language-consult.md`, and dispatch-report
filenames as bare backtick spans rather than resolving markdown links.
These are genuine class-2 defects by the same standard applied elsewhere
in this pass, but they sit inside the dated, append-only amendment
bodies this task's own constraints forbid rewriting (ADR-0005 Rule 8).
Logged in `research/lyt/.abc/pre-review-log.jsonl`'s `unfixable_logged`
array for `SPEC-AMENDMENTS.md`, not edited.

## Flagged for the orchestrator (not a confident repair)

**README.md, "invention 25" (pre-fix line 186).** The original text read
"This compiler's own disclosed invention 25 relaxes that equality to
`<=`..." — no numbered list, footnote, or enumeration exists anywhere in
any of the three documents (or in the linked consult document, so far as
this pass checked) that "25" could resolve to. Judged this a stray
numbering artifact rather than a substantive omission, and dropped the
bare numeral (now reads "This compiler's own disclosed invention
relaxes..."), preserving the sentence's technical claim unchanged. Flagging
explicitly because the alternative reading — that "25" pointed at a real,
now-missing citation the author intended to fill in — cannot be ruled
out from the document text alone; if that's the case, the missing
citation target should be supplied, not silently dropped again next
time this section is touched.

## Scope note: source-file (`.py`) bare citations not converted to links

ADR-0017 Rule 2(b) names "a repository artifact (BACKLOG.md, an ADR, a
script)" as the class of thing owed a resolving link, which reads as
covering the ~60 bare `` `loader.py` ``/`` `compiler.py` ``/etc. citations
across these three documents as well as the `.md` document citations
fixed above. Given the pre-review's own charter ("fix what you find,
cheaply") and the volume involved (roughly 60 additional instances,
several per file, many repeated), this pass drew the line at
prose-document cross-references (`.md` files) and left source-file
identifiers as backtick code spans — they read, in context, as code
identifiers within the same directory tree rather than as documents a
reader navigates to, and are consistently unambiguous (one file per
name, no directory ambiguity). This is a disclosed scope narrowing, not
a silent one: surfacing it here for the commissioner's ratification
rather than assuming it's the right cut. If the fresh-context B round
flags source-file citations as unresolved gestures, that confirms the
narrowing should be revisited.

## Verification

`pytest research/lyt -q`: **98 passed**, exit code 0 (documentation-only
change; no code touched).

## Housekeeping note

During this pass, an early attempt to script the bare-path→link
conversion wrote directly (via a Python script, not `git`) into the
**shared checkout** (`/home/bork/w/omega/research/lyt/`) rather than this
worktree, before the mistake was caught. Those three files were restored
byte-for-byte from `git show HEAD:...` (hashes verified identical to the
pre-change originals) before any further edits proceeded. No trace of
that misstep should remain in the shared checkout; this worktree's
changes are the only real diff.
