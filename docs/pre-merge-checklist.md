# Pre-merge checklist — retroactive-corrective template

A consultation template a **trusted implementer session** works through when
filing a corrective for work that shipped under-documented or with known
defects — so the corrective is predictably shaped rather than ad hoc. It also
serves as a self-audit a trusted session can run before filing any substantive
PR.

## What this is — and what it is not

It is **not a merge-blocking gate.** That framing was tried and retracted: see
the §7.3 amendment in
`docs/notes/postmortem/postmortem-knob-toolbar-popover-2026-05.md`. The reason
is load-bearing — when the failure mode is implementer-*capability* (e.g. a
routing substitution putting an under-capable model on the work) rather than
implementer-*laziness*, a mandatory checklist does not produce discipline; it
produces **bungled** documentation instead of **missing** documentation, which
is strictly worse for future readers (a missing doc says "look elsewhere"; a
bungled one says "this is the answer" and propagates the confusion).

So the enforcement point is not "every PR blocks on this." It is "**trusted
rotation eventually files the corrective, and consults this template when it
does**." The umbrella `CLAUDE.md` "Documentation is part of the work" tenet
still stands; this file is how a capable session discharges it predictably,
not a tollgate that an under-capable session is forced through.

**Use it when:**

- A trusted session is filing a retroactive corrective for an earlier PR (the
  "(ships with bugs)" merge subject is the IOU that one is owed — see §D).
- A trusted session wants a self-audit before filing a substantive PR.

Tick what applies; note what doesn't and why. The items are disciplines that
hold for trusted sessions; they are not exhaustive.

## A. Documentation is part of the work

The umbrella `CLAUDE.md` enumeration, as a walk-through:

- [ ] **Work-status store** — does the `todo` Postgres DB need a status
  transition (open → closed), a new item, or a retire-on-ship closure?
  (`psql -h 192.168.122.1 -d todo`; cross-row gate
  `SELECT * FROM work_status_violations` empty ⇒ clean.)
- [ ] **`docs/handoff-current.md`** — does this change touch an orientation
  surface it describes (product/pedagogy framing, architecture/integration
  model, or still-open-work context), and is it still accurate?
- [ ] **`FEATURES.md`** — would a Go player misunderstand what the app offers
  if this isn't reflected? Add / update / remove an entry (with the right
  `[experimental]` / `[partial]` / `[planned]` qualifier).
- [ ] **`frontend/FILES.md`** (frontend changes only) — new entry, moved path,
  band re-tag, or removal for any `src/` file created/moved/deleted/re-banded.
- [ ] **ADRs** — does any ADR's "Revisit when…" name a trigger this change
  satisfies?
- [ ] **Doc-graph cross-references** — does any cross-reference now describe its
  target inaccurately? Consult `docs/doc-graph-report.md` for dangling refs;
  the relation-vs-content judgment (ADR-0005 Rule 3) is still yours.
- [ ] **Doc-graph structure** — did this change **add / remove / rename /
  re-cross-reference** a doc? If so, regenerate in the same change
  (`node tools/doc-graph/generate.mjs`, needs Graphviz `dot`) — the
  `doc-graph-ci` freshness gate fails otherwise. A **content-only** doc edit
  need not regenerate.
- [ ] **ADR-0006 headers** — files touched under full visibility carry the
  standard per-file header; retrofit if missing.

## B. Band-coherence at mount sites (postmortem §7.1)

- [ ] For any SFC mounted into a new chrome location: cross-reference the
  component's ADR-0003 band (its header / `frontend/FILES.md` tag) against the
  enclosing wrapper's coupling (`v-if` / `v-show` / ancestor lifecycle). A
  band-1 substrate surface must not **silently** inherit a band-2/3 wrapper's
  conditional visibility; the default for a mismatch is relocation, not
  inheritance.

## C. State-axis visual exercise (postmortem §7.4)

- [ ] Exercise the surface in **every state-axis it depends on**, not just the
  happy one. The current minimum sweep:
  - connected vs disconnected (engine state),
  - authenticated vs unauthenticated (where auth-coupled),
  - empty vs populated (where it lists things),
  - hard-claim-held vs unclaimed (where substrate-driven).
  Extend the list when a new state-axis enters the chrome.

## D. Durable defect recording (postmortem §7.2, reframed)

- [ ] If the work ships with a known defect, the defect is recorded somewhere
  **durable** — a worklog entry, a dispatch, or an issue — naming each bug and
  its expected fix arc. A "(ships with bugs)" merge subject is the *IOU that a
  worklog is owed*, not a home for the defect itself. (Shipping with a known,
  benign defect can be a sound strategic call when the implementer rotation is
  temporarily under-capable; the discipline is on the *recording*, tracked
  until trusted rotation files the corrective — not on the merging.)

## E. Severity by the substitution test (postmortem §7.5)

- [ ] Name the failure shape in its most general form, list the surfaces the
  same shape could hit, and calibrate the corrective's weight to the **worst**
  surface on that list — not to this instance's observed user-visible cost. The
  cost of *catching* a failure shape is near-constant; the cost of *missing* it
  varies wildly by which surface the next instance lands on.

## F. Closest-match check (postmortem §7.6 / ADR-0002 Rule 7)

- [ ] When the closest match in a vocabulary (an enum value, a chrome
  neighbourhood, a band) feels not-quite-right, flag it as **a missing
  category to revise**, rather than silently taking the nearest fit. Taking the
  closest match is the literal-following failure ADR-0002 forbids, applied to
  vocabulary-fit.

## Provenance

Surfaced by `docs/notes/postmortem/postmortem-knob-toolbar-popover-2026-05.md`
§7.3, which records that an earlier postmortem
(`postmortem-knob-registry-qeubo-domain-2026-05.md`) had already flagged the
same gap. The §7.3 amendment in that document is the source of the
template-not-gate framing above.

## License

Public Domain (The Unlicense).
