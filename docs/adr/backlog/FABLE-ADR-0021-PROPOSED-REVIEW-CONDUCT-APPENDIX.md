# PROPOSED appendix to ADR-0021 — review conduct: the easy-to-miss checks

<!-- doc-attest-exempt: Fable-authored proposal 2026-07-25 at the maintainer's direction
("its deliverable will be a proposed appendix (separate file) of points that I will look
over and see which ones I'm willing to merge into ADR-0021 before the latter is
ratified"). NOT law; a menu. Removal condition: struck (or moved to vestigial) once the
maintainer has merged his chosen points into ADR-0021 and ratified it. -->

Commissioned purpose, in the maintainer's words: *"a useful guide for reviewers on
account of things that may otherwise be easy to miss or forget, but ideally shouldn't
be."* Each point below is one check a reviewer can run, stated as an imperative with a
one-line reason. Points 1–3 restate what the ADR-0021 draft already contains (marked
[IN DRAFT] — listed so the menu is complete, not to duplicate them); the rest generalize
from the 2026-07-23 campaign and from review craft the campaign confirmed. They are
deliberately small and independent: merge any subset.

## The artifact and its checks

1. [IN DRAFT — Rule A] **Ask what surface the check observes, and whether that is the
   surface that ships.** A gate reading the working tree while the commit embeds the
   index; a residue claim sweeping the filesystem while the write landed in the
   database; an assertion on source text where the property lives in output. A faithful
   check on the wrong surface is a green light about a road nobody drove.
2. [IN DRAFT — Rule B] **Read property-asserting comments as adversarially as code.**
   "Belt-and-suspenders", "structurally impossible", "harmless no-op" are claims. For a
   race: demand the exclusivity primitive by name; a sleep is not one.
3. [IN DRAFT — subsidiary] **When you meet a carve-out, re-derive its membership from
   its predicate.** If the justification is "added after X existed", enumerate
   everything added after X existed — the author met one member; you check the class.
4. **Break the thing a fixture claims to catch, and watch it catch it.** The cheapest
   truth-test of any fixture is one injected defect of its own advertised class. A
   fixture that has never been seen red against a live break is a hope, not a witness.
   (Four fixture generations in one axis passed everything while catching nothing.)
5. **Check that an identity assertion cannot be satisfied by the wrong subject.** When
   output "must name X", run Y and grep for X's marker — shared boilerplate, shared
   argparse prog=, and shared refusal text all satisfy naive markers. If X has a sibling
   variant (served/legacy, v1/v2, template pair), assert the sibling's marker is ABSENT,
   not merely X's present.
6. **Verify a claimed test exists before crediting it.** A docstring citing "the witness
   fixtures" is checked by opening them; a red.txt is checked by reading whether it
   records a genuine failure or a green run wearing red's name.

## State, concurrency, lifecycle

7. **For any check-then-act on shared state, ask what happens if the world changes
   between the check and the act.** Unlink-after-probe, kill-after-read-pidfile,
   reclaim-after-liveness-check — either the act is conditional on something atomic
   (O_EXCL, a bind, a rename) or the window is named in a comment with its accepted
   consequence.
8. **Follow every acquisition to its release, and check the acquisition sits inside the
   scope whose cleanup releases it.** A `serve()` one line above the `try` leaks
   everything when `serve()` itself raises — the campaign hit this twice in one file
   pair.
9. **When two layers bound the same operation, compare the bounds.** A 10-second poll
   wrapping a 65-second HTTP timeout means the outer layer's verdict can fire before
   the inner layer has spoken; whichever way that resolves, it was chosen by accident
   unless someone compared the numbers.
10. **On any ambiguous runtime state, prefer a loud "indeterminate" to a confident
    narrative.** Code that reports "our spawn lost the race" without verifying who won
    is fabricating history; the reader debugging at 3am will believe it.

## Environment and inputs

11. **For anything resolved from the environment, export a decoy and re-run.** Config
    paths, deployment records, hosts: the test is whether the code's own pinning
    (an explicit env re-set, an absolute path) defeats your decoy, not whether the happy
    path happens to resolve right.
12. **Check optional participants are folded into consistency checks, not skipped.** An
    optional member that is present but disagreeing must fail the agreement check; "
    optional" licenses absence, never contradiction.
13. **Mind range and boundary semantics in any attribution or sweep.** `A..B` excludes
    A; an exclusive endpoint quietly drops the one commit that carried the work — state
    which endpoints your sweep includes when the answer matters.

## The report and the regime

14. **A clean lap states what it attacked.** "No findings" is a claim about the
    attacks run, not about the code; a convergence verdict without an attack list is
    unfalsifiable. (The campaign's clean laps each enumerated their probes.)
15. **Ask what enforces the rule after everyone leaves.** A discipline that lives in
    review memory is one personnel change from gone; if it matters, it gets a gate — and
    then point 1 applies to the gate.
16. **Route around nothing you can see.** The standing engineering-responsibility rule,
    restated for reviewers: a hazard within reach of the diff under review is fixed or
    flagged loudly, whether or not it is in scope. (The campaign's best finds — the
    gate-chain census, the fifth template — came from reviewers refusing their own
    scope line.)

## License

Public Domain (The Unlicense).
