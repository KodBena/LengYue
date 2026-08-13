# LYT relations-first amendment — dispatch B: BLOCKED, missing governing spec

Dispatch B of the LYT relations-first amendment (ledger rows
2396/2397/2400/2401) was commissioned to extend the .lyt grammar with
the nine ratified relational primitives, build loader-side resolution,
repair the L3 envelope path, and add tests — scope drawn from
`.claude/dispatch-reports/lyt-relations-amendment-spec.md` §2/§3.

**No code was written or committed.** This report exists to record why,
per the "scope narrowing = STOP-and-report" discipline in the brief.

## Base freshness — VERIFIED

The worktree started on a stale base (`main` @ `3378806f`, missing all
of dispatch A's work). Rebased onto `lyt-phase2` (`git rebase
lyt-phase2`), which succeeded cleanly with no conflicts (the worktree
had no prior commits of its own). HEAD is now `b632bbcc` — "merge: LYT
relations-first dispatch A — comment relocation, fixture moves, probe
harness + facts files" — confirmed present:

- `research/lyt/facts.generated.json`, `research/lyt/facts.residue.json`
- `research/lyt/fixtures/reference/{ogs.lyt,q5go.lyt}`
- `research/lyt/tests/current_row_wart_{content,l2,presence}.lyt`

## Governing spec — MISSING

`.claude/dispatch-reports/lyt-relations-amendment-spec.md` (the
document the brief names as governing, and instructs be read end to
end before any edit, with §2/§3 as this dispatch's scope) **does not
exist** anywhere I can find:

- Not present in the worktree at HEAD (`b632bbcc`, rebased onto
  `lyt-phase2`).
- Not present on `origin/lyt-phase2`, `lyt-phase2`, `main`, or any other
  local/remote branch (`git branch -a` enumerated, none carry it).
- Not introduced-then-deleted anywhere in reachable git history
  (`git log --all --diff-filter=A --name-only` for the filename:
  no hits).
- Not recoverable as a dangling/unreachable git object either (checked
  `git fsck --no-reflog --unreachable --dangling`; sandbox rules
  blocked the exhaustive per-tree grep needed to fully rule this out,
  but the more direct checks above already establish it isn't reachable
  from any ref).
- Not present anywhere else on the filesystem (`find / -xdev -iname
  '*relations-amendment-spec*'` — no hits).

Corroborating that this file is real (not a typo in the brief) and was
genuinely read by a prior agent: `research/lyt/facts.residue.json`'s
own `_comment` header cites it by this exact path — "governing spec
`.claude/dispatch-reports/lyt-relations-amendment-spec.md` §4/§5/§6
open question 5" — and dispatch A's own report
(`.claude/dispatch-reports/lyt-relations-a-relocation-probe.md`, "Documents
read end to end" section) lists it as the first document read. So the
spec existed in dispatch A's working context and was consumed there,
but was never committed to the repo — it appears to have been treated
as a commissioning brief rather than a deliverable, and dispatch A's
worktree (now presumably torn down) took its only copy with it.

## Also missing: dispatch A's review artifact

The brief also cites `lyt-relations-a-review.md` ("review: ACCEPT,
lyt-relations-a-review.md" per the merge commit subject) as a fact
source for the facts-key shape guidance ("bind to the fields, never
parse the key string"). This file is likewise absent from the repo at
HEAD and from all branches. I was able to independently verify the
facts-key shape guidance directly from `facts.generated.json` and
`facts.residue.json`'s own entry shapes (each entry carries
`component`/`state`/`axis` as sibling fields alongside `key`, not
encoded into the key string) — so this second gap did not block
verification of that one specific instruction, but it's a second
instance of the same failure and I did not treat it as licence to
proceed on the larger, unrecoverable gap above.

## Why this blocks the whole dispatch, not just a footnote

The brief is explicit that §2 (the nine-primitive inventory) and §3
(grammar sketches) of the missing spec **are** dispatch B's scope.
Without it I have no ratified source for:

- The exact syntax and arity of the nine primitives (`width-of`,
  `height-of`, `aspect-of`, `pitch-of`, `wrap-breakpoint`,
  `text-width-of`, `max-over`, `sum-of`, `pack-rows`, `read-constant` —
  the brief names these in prose, but not their grammar productions).
- The precise resolution semantics the spec's §3 sketches for each
  (e.g. exactly how `max-over(children.min)` is meant to derive the T
  floor, what `pack-rows`'s parameters are, how `read-constant` names a
  theme token vs. a facts entry).
- The L3 envelope repair's exact target shape beyond the one-sentence
  gloss in the brief (which fabricated reservation is being replaced,
  and where in `loader.py`/`compiler.py` it currently lives) — this I
  could locate independently by reading the existing code, but the
  brief ties the *replacement* shape to "spec §3(b)" and "commissioner-
  flagged ADR-0013 shape," neither of which I can read.

Inventing plausible syntax for nine new grammar primitives from the
one-line prose descriptions in the brief alone is exactly the
representation-fork risk the brief itself warns against ("where a
genuine representation fork not settled by the spec arises, STOP and
report — representation decisions are the commissioner's (row 2392
lesson)"). Every one of these primitives is a fresh fork with no
existing precedent in the current grammar (`research/lyt/parser.py`,
read for orientation only, confirms today's grammar has no relational
expression forms at all — bounds are px literals or the existing
keyed-property grammar). Guessing here risks handing dispatch C (the
encoding rewrite) a grammar it can't actually use, and risks
introducing exactly the kind of unratified decision the umbrella's
CLAUDE.md and the "disclosed narrowing needs ratification" discipline
both forbid shipping quietly.

## What's needed to unblock

Either:

1. The spec's content (`.claude/dispatch-reports/lyt-relations-
   amendment-spec.md`, at minimum §2 and §3, ideally the whole
   document per the "read end to end" instruction) placed into this
   worktree, or pasted/attached directly; or
2. Confirmation that the nine-primitive grammar sketches live somewhere
   else I haven't found (a location correction), or a fresh
   restatement of §2/§3 authoritative enough to build against.

`lyt-relations-a-review.md`'s absence is lower-severity (I could
independently verify its one cited claim) but should be corrected too
if a canonical copy exists, per the same documentation-discipline
concern.

## What I did verify, independent of the missing spec

- Worktree base freshness (rebase onto `lyt-phase2`, landing on
  `b632bbcc`) — WITNESSED.
- Dispatch A's artifacts present at HEAD — WITNESSED.
- Facts-file key shape: `(widget, method)`-flavored keys with
  `component`/`state`/`axis` as sibling fields, not string-encoded —
  WITNESSED directly from `research/lyt/facts.generated.json` and
  `research/lyt/facts.residue.json`.
- Current grammar has no relational-expression forms (`parser.py`
  skimmed for orientation, not claimed as end-to-end read since it
  wasn't load-bearing for any statement made here) — this is an
  observation about absence, not a citation of spec content.
- No spec file recoverable by filename search across worktree, all
  branches, git history, dangling objects (partial), or filesystem —
  WITNESSED (search commands and results above).

No commits were made in this worktree beyond the rebase (which is not
a content change — no diff against `lyt-phase2` at `b632bbcc`).

## Gate commands run

None — no code changes were made, so there is nothing to gate. The
existing 375-test baseline was not re-run since dispatch B made no
changes to it; re-running it here would tell us nothing about this
dispatch's (non-existent) delta.
