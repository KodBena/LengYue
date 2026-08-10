# History — ADR-0006's chocofarm header exemplars and the Part A/B/C anecdote

This is a frozen extraction record: chocofarm's own worked examples, moved
here verbatim out of the source ADR (ADR-0006) when that ADR was generalized
for cross-project portability. "chocofarm" names the Python-based source
project this ADR corpus was ported from before autoharn adopted it (see
ADR-0006's own Provenance field for the fuller project lineage).

> *Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
> `law/adr/0006-source-file-headers.md` at commit
> `ff691bb9bc430ad497d74ff82d580f758a969f99` under
> `design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
> retro-edited; the lessons these records teach live as rules in the parent ADR.*

The passages below are copied verbatim from the pre-refactor ADR-0006. They are
chocofarm's own worked instances of an already-converged header convention, and
the architectural-audit anecdote that motivated naming files by path rather than
by session tag.

## The chocofarm exemplar file list (pre-refactor Context)

chocofarm's source files already converge on a header pattern: a module
docstring whose first content names the module's path/area and purpose, with
a `Public Domain (The Unlicense)` declaration. Examples at HEAD:
`hp/registry.py`, `hp/schema.py`, `eval/report.py`, `model/env.py`,
`solvers/base.py`, `az/parallel.py` all carry it. The convention is good and
in use; this ADR names it so it is a stated tenet rather than an unwritten
habit, and so the few files that lack it have a rule to retrofit against.

## The Part A/B/C anecdote (pre-refactor Context)

The convention earns its weight for two reasons that the architectural audit's
findings reinforce:

1. **Self-locating files.** A file pasted into a review, a diff, or a search
   result identifies itself. This composes directly with ADR-0004
   (minimal-touch): a contributor working with partial visibility into a
   675-line `decomp.py` or a 715-line `registry.py` benefits from the file
   declaring where it lives. The audit's "Part A/B/C as load-bearing
   identifiers" finding (nine modules explaining their behavior by reference
   to ephemeral session tags) is the *opposite* failure — a header that
   names path + purpose, not a session tag, is what keeps a file readable
   standalone.
2. **Per-file license declaration.** chocofarm is Public Domain (The
   Unlicense), and the chocofarm files already declare it individually. This
   matters at the moment any single file is vendored, copied, or reposted —
   without a per-file license, only the project as a whole is identifiably
   Public Domain, and the signal is lost once a file leaves its repo context.

## Related

- **[ADR-0006](../0006-source-file-headers.md)** — the parent ADR; its
  generalized Context now carries a two-sentence summary of the reasoning above
  plus a pointer to this file. Per the maintainer's C5 ruling (the fifth entry
  of the ADR-portability refactor's adjudicated contradictions register,
  `design/MAINT-ADR-PORTABILITY-SPEC.md` §7, `./led` decision-ledger row 369),
  the per-file
  license mandate itself no longer transfers to the portable edition — the
  reasoning above is preserved as chocofarm's own historical rationale for its
  own posture, not as binding law for adopters.
