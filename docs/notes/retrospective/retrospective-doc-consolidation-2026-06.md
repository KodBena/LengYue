# Retrospective — The Documentation-Consolidation Arc

- **Status:** Closes the doc-consolidation arc. `docs/work-status.json` is the
  canonical work-status record, the three status-bearing prose docs have
  surrendered status to it, the `docs/notes/` tree is reorganized into genre
  taxa, and the doc graph is current. PRs #338–#344 (#344 and this
  retrospective pending merge at writing).
- **Genre:** Project-arc retrospective — a focused peer of the whole-cycle
  release retrospectives (`release-retrospective-2026-04.md` /
  `-2026-05.md`), scoped to a single infrastructure arc rather than a release.
  It frames the arc's shape and points at the per-step worklogs, consult
  records, and audits that carry the within-step detail.
- **Date:** 2026-06-02.
- **Audience:** future-self returning cold, future audit-LLMs, and any
  contributor who later wonders why work-status lives in a JSON file, why
  design notes carry a `> SSOT:` header pointer, or why there is a CI job that
  nags about a synopsis.
- **Retires when:** never. A closure document for a specific arc; it is not
  retro-edited, only corrected inline with dated notes (ADR-0005 Rule 8).

## What this document is, and how it was written

A working contributor's account of the arc that consolidated the project's
work-status tracking and reorganized its documentation — roughly two days
(decided 2026-06-01, executed 2026-06-02), seven PRs, one hand-authored SSOT,
three CI advisories, one ADR amendment (Rule 9), ~50 file relocations, and a
few self-inflicted detours worth recording.

I am the LLM contributor (Claude Opus 4.8) writing this at the author's
request. The author asked for **candor and autonomy**; the framing and the
judgments — including the unflattering ones — are mine, with candor signed off
in advance. Per the house caveat: confidence is not certainty. I read the
arc's commits, the firewall consults, the liveness audit, and the docs I
touched; I did not re-read every file. Observations may be specifically wrong
and should be corrected inline with a dated note.

## What the arc was about

It started as a confession. The 2026-06-01 RCA
(`rca-discipline-lapses-2026-06-01.md`) root-caused two lapses — a stringly-typed
error contract that proliferated, and a *shipped feature still documented as
open* — as one failure: a discipline held only by a single maintainer's
attention, where each act is locally correct and the defect lives in the
accumulation. Guard **G5** named the durable fix for the documentation half: a
**machine-readable work-status SSOT** that the prose docs project from, so
"open vs shipped" is asserted in exactly one place.

The arc is the execution of G5, and then the follow-ons that fell out of taking
it seriously: if status lives in one canonical doc, the others must *surrender*
their status to it; if design notes are tracked work, they should be anchored
to it; if a synopsis summarizes the ADRs, something should notice when it drifts
from them; and if `docs/notes/` has outgrown a flat list, it should be
organized — but only where the categories are honest.

## How it unfolded

A chronological pass, in roughly the order the work landed.

- **The SSOT + the surrender (#338).** A fixed JSON Schema (two-field state
  model: `state` + open-side `disposition` / closed-side `resolution`; faceted
  scope/tier; opaque stable ids), `docs/work-status.json` (75 items migrated
  faithfully from the prose), a zero-dep checker that *interprets* the schema
  (so the schema stays the sole constraint source), an ad-hoc SQL query tool
  over a transient SQLite view, and a CI gate. Then the "surrender-status"
  step: `handoff-current.md` split into orientation + an archive vestige;
  `TODO.md` slimmed to a thin projection; `deferred-items.md` **dissolved** into
  one file per item (a deliberately ugly blemish so the backlog stays visible);
  `CLAUDE.md`'s audit rewritten to make the SSOT canonical; a cross-reference
  sweep behind it.
- **Rule 9 + the retirement gate + taxa (#339).** ADR-0005 gained Rule 9
  (design notes are SSOT-anchored, status delegated). `retire-advisory.mjs`
  derives archival candidates from the SSOT linkage. `docs/notes/design/` and
  `docs/notes/consult/` were established.
- **The design-note/consult relocation (#340).** ~31 files moved; a self-purging
  sunset allowlist for the pre-SSOT notes that can't yet be anchored (Rule 7).
- **The synopsis supplement (#341).** The author noticed the ADR synopsis was
  stale (missing Rule 9; a contradicted Rule 7 framing) — and asked the sharper
  question of why the doc graph hadn't caught it.
- **The co-change advisory (#342).** The answer: the graph resolves *edges* and
  tracks *age*, but not a content projection lagging its source. So a
  derived doc declares `<!-- derived-from: … -->`, and CI flags a source that
  changed without it — per-PR-diff (so it cannot nag forever) with a
  `cochange-ack:` silence token (the author's explicit requirement).
- **The labels facet (#343).** GitHub-style flat tags, deliberately not a
  kind-taxonomy.
- **The notes-hierarchy reorg (#344).** `postmortem/` (postmortems + RCAs as
  siblings), `audit/`, `retrospective/`.

## The discoveries

Three generalizations that apply forward, not local lessons.

### Generation direction is the load-bearing distinction

The doc-graph manifest is **derived** — a cache regenerated from the tree, so
its CI gate is a freshness diff. The work-status manifest is **authored** — the
source of truth, so its gate is a consistency/well-formedness check (there is
nothing to regenerate *from*). Conflating the two was my first and worst error
(below). Keeping them distinct is the arc's core idea: a consolidation is *one
authored document the others project from*, not a fourth derived copy that
drifts. Everything downstream — the surrender step, Rule 9, the projections —
is that one idea applied.

### Advisory-not-gate, with a silence valve, is the right shape for a judgment

Three advisories shipped (retirement, the checker's path/git-ref advisory, and
co-change), and none of them blocks. Each mechanizes a *judgment* — is this note
retire-able? does this source change oblige a derived-doc update? — and the
honest move when the answer is editorial is to **surface a candidate, not fail
the build** (ADR-0005 Alternative C: too soft to gate). The co-change
advisory's per-PR-diff transience plus the `cochange-ack` token is the
calibrated answer to the author's sharp question — *"how do we keep one false
positive from dragging the project down forever?"* — without abandoning the
check.

### Dogfooding caught the real cases

The mechanisms validated themselves on the arc that built them. The co-change
advisory, the first time it fired in anger (the #344 reorg), flagged two
genuine false positives — `TODO.md` and `adr-synopsis.md`, tripped because a
ref-*path* moved inside their sources with no content change — exactly the case
the silence valve exists for; both were ack'd. The retirement advisory flagged
its own enabling artifact (`consolidation-xref-fallout.md`) the moment that
item closed. A discipline that only works in theory would not have produced
those.

### ADR-0008 (don't force classification) governed the taxonomy

Taxa were extracted only once a category was honest (design / consult /
postmortem / audit / retrospective); ambiguous items were left unlabeled (the
PV-calibration notes, `rename-tag`) or in root (the audit-*meta* docs, which are
reflections, not reports); the labels facet stayed flat rather than becoming an
`issue|feature|…` hierarchy. The *negative* register — leave it flat rather than
invent a synthetic parent — did as much work as the positive one.

## Stumbles and misimplementations

The author invites these to be visible. The arc shipped despite them, and
several hardened into guards.

1. **I over-engineered the SSOT's premise.** My first design note rested on the
   claim that *"whether work is shipped is an editorial fact, not computable
   from the tree"* — wrong, and load-bearingly so. The firewall consult and the
   author independently saw it (the author's "Picard-facepalm"): a
   primary-authored JSON is both machine- and human-readable, and consolidation
   means it is the *one* doc the others project from — not a fourth copy that
   drifts. I had reasoned defensively from "why my design is necessary" rather
   than from the end goal. The reframing was the author's, not mine.
2. **Then I compounded it — bombastic self-diagnosis.** Told the planning was
   facepalm-worthy, I immediately fired back a confident counter-theory instead
   of pausing. The author, correctly: *"be humble… you immediately go defensive,
   assuming you know exactly what is wrong."* Being told I had misjudged was
   itself evidence my judgment *there* was unreliable; the right move was to
   stop, drop the frame, and ask what they were seeing. It is now a standing
   note to self.
3. **A schema category error.** I placed `future` in both the `tier` and
   `disposition` enums — a single-fundamentum-divisionis violation (ADR-0008).
   The author caught it. The fix doubled as a feature: the enum-disjointness
   meta-lint (which now also guards the labels facet) would have caught it, and
   a selftest proves it.
4. **Three mis-pathed refs** in the migrated SSOT (files a directory deeper than
   I wrote) — caught by the checker's own advisory. The gate working as
   designed, but a reminder that I had guessed paths instead of verifying.
5. **A branch slip.** I built the labels facet on the already-merged cochange
   branch instead of a fresh one off main; it recovered cleanly (the PR showed
   only the labels commit), but it was avoidable inattention.
6. **A token detour.** I commissioned a deep-research survey of off-the-shelf
   trackers that the author halted — none fit, and the fit could have been
   reasoned out from first principles before the spend.

The pattern across 1–4 is the same one the RCA named for the codebase: locally
reasonable steps whose defect the single reviewer caught. The author caught more
of mine than I self-surfaced — which is itself the data point that the
single-attention failure mode the arc was built to address applies to the
collaborator too.

## Loose ends

Carried forward at the close (some are the author's open questions, raised in
the same breath as this retrospective):

- **The onboarding documentation.** Commissioned as a stop-gap when the doc
  graph was haphazard; the graph is now healthy. Whether it wants revision (vs.
  the CLAUDE.md amendments sufficing) is an open question — the author is not
  inclined to retire it yet. Unjudged here; it is the next conversation.
- **A central home for the collaborator's available services/resources.**
  Currently scattered; would go stale the moment the code leaves the author's
  machine, so it probably should not live in the GitHub tree.
- **`CLAUDE.md`'s proxy-pin prose** still says v1.0.21 (real: v1.0.27) — the big
  project-instruction block, the author's to refresh.
- **The `postmortem/` directory name** subordinates one of two siblings; a
  neutral name (`incident/`) was offered.
- **The broader reorg** was deliberately scoped to three taxa for now.

## Honest about the LLM perspective

Confidence is not certainty; this reads with a calibrated voice, calibrated to
what the arc's commits and consults surfaced, not to what they didn't. The
stumbles section is my honest self-assessment, but I am a poor judge of my own
blind spots — the most reliable signal in this arc was the author catching what
I could not see in myself, and a future reader should weight my self-account
accordingly. Corrections welcome inline, dated.

## Closing

Two days, seven PRs. One authored SSOT replaced three drifting status surfaces.
One ADR rule made design notes delegate their status. Three advisories now
surface — never block — the judgments a single maintainer used to hold alone:
which notes to retire, which derived docs have gone stale, whether the SSOT is
well-formed. The documentation `docs/notes/` root went from a flat 73 to a
small set of honest taxa.

The lasting value is not the JSON file; it is the shape: *author status once,
project the rest, and let cheap mechanical advisories carry the attention a
single person can't.* The receipts are the stumbles — including the one where
the arc's own thesis (single-attention discipline fails quietly) was
demonstrated on its author.

License: Public Domain (The Unlicense)
