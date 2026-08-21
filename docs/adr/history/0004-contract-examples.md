# History — ADR-0004's chocofarm contract examples and oversized-file list

This is a frozen extraction record: chocofarm's own worked examples, moved
here verbatim out of the source ADR (ADR-0004) when that ADR was generalized
for cross-project portability. "chocofarm" names the Python-based source
project this ADR corpus was ported from before autoharn adopted it (see
ADR-0004's own Provenance field for the fuller project lineage).

> *Point-in-time record (ADR-0005 Rule 8): extracted verbatim from
> `law/adr/0004-minimal-touch-edits-to-partially-visible-files.md` at commit
> `ff691bb9bc430ad497d74ff82d580f758a969f99` under
> `design/MAINT-ADR-PORTABILITY-SPEC.md` (tracker `adr-portability-refactor`). Not
> retro-edited; the lessons these records teach live as rules in the parent ADR.*

The passages below are copied verbatim from the pre-refactor ADR-0004. They are
chocofarm's own worked instances of the parent ADR's two-case rule (edit freely
when a file is visible in full; touch only the flagged lines when it is not) —
the four contracts a partially-visible edit can silently break, and the
specific files where partial visibility was the real hazard.

*Editorial note (added at extraction, not part of the verbatim quotation
below): the quoted passages cite "the audit" by section number ("§2.B", "L5")
without ever naming which audit — neither quoted section below identifies it
by date. The identification ("2026-06-15 architectural audit") comes from the
parent ADR's own fresh-authored Extraction Pointer summary (added at this
refactor, not part of the frozen quotation), and from
[`history/0007-oversized-file-queue.md`](0007-oversized-file-queue.md), whose
own verbatim quotation of ADR-0007 does name it explicitly. The citation here
is preserved exactly as it stood in the pre-refactor ADR-0004, per ADR-0005
Rule 8 (a point-in-time record is not retro-edited); this note supplies the
identification alongside it rather than inside it.*

## The four chocofarm contracts (pre-refactor Context)

A chocofarm source file has multiple distinct contracts that the test suite
only partially polices:

- **Numerical equivalence contracts.** The forward graph exists across
  numpy-f64, numpy-f32, and JAX backends; the jax/numpy bit-equivalence test
  (`tests/test_jax_equivalence.py`) pins that they agree. But an edit that
  changes the *order* of operations in one backend can drift the numerics
  below the test's tolerance only on inputs the test doesn't exercise — silent
  until a different input surfaces it.
- **The feature layout's positional contract.** The feature vector's block
  order is written in `features.py`, sliced by offset in `actions.py`, and
  (historically) listed a third time in `feature_response.py`. A reorder of a
  sub-block produces no error and *silently mislabels feature-importance
  rows* — the audit's sharpest landmine (its §2.B). The only guard is
  order-blind to one of the writers.
- **The belief-mechanics duality contract.** The dual bound certifies against
  the env's belief math via `env.restrict`. A change to `apply`'s semantics
  in the env that isn't reflected in the restriction path would have the
  bound certify against stale dynamics — with no test failure (the audit's
  L5: the worst duplication is the one that validates the original).
- **The episode-horizon agreement contract.** The simulator, the base-policy
  rollout, the info-relaxation bound, and the tree search must agree on the
  horizon for a value estimate to be unbiased. It is now owned in one place
  (`env.max_steps`); a change that reintroduces a bare literal in one of the
  four sites silently disagrees with the other three.

In each case the failure mode is *silent at edit time and audible only when a
specific run or input surfaces it* — exactly the most dangerous tier of
ADR-0002's loudness hierarchy.

## The named oversized-file list (pre-refactor Context)

The risk concentrates sharply during large mechanical sweeps. chocofarm's
largest files are precisely where partial visibility bites: `decomp.py`
(675 lines), `analyzer.py` (605 lines), `exit_loop.py` (510 lines),
`parallel.py` (451 lines), `registry.py` (715 lines), `mlp.py` (360 lines).
When a tool view truncates such a file, the editor's attention is on the one
issue flagged, but the whole file is nominally "in front of them." The
temptation is to fix the flagged issue and tidy the rest "while I'm in here."
That tidy-up, applied to parts the editor doesn't fully see, is where silent
breakage gets introduced.

## Related

- **[ADR-0004](../0004-minimal-touch-edits-to-partially-visible-files.md)** — the parent ADR; its
  generalized Context now carries one summary sentence per contract class plus
  a pointer to this file.
