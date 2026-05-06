/**
 * docs/worklog/2026-05-06-doc-graph-staleness-sweep.md
 * Worklog — staleness sweep across umbrella + frontend docs.
 * License: Public Domain (The Unlicense).
 */

# Doc-graph staleness sweep — umbrella + frontend

- **Status:** Shipped on `docs/proxy-post-v1.0.13-followups-dispatch`
  (extending that branch with a docs-only follow-on). Five files
  edited; no code touched. Audit reads-only beyond those files.
- **Genre:** Documentation discipline — ADR-0005 Rule 6
  ("author documentation as you decide, not in retrospect")
  applied retroactively to a doc graph that had drifted. The
  drift surfaced during a frontend session's onboarding read
  when the assistant's "what's likely next" menu repeated stale
  claims at the user — twice in three minutes. The user named
  the failure mode ("getting worse by the day, every day I have
  to point out 'well, isn't that already done?'") and authorised
  a focused cleanup pass.
- **Date:** 2026-05-06.

## Why this exists

Recent frontend sessions have shipped at high cadence
(~30 worklog entries between 2026-05-03 and 2026-05-06). Each
PR landed cleanly and got a worklog entry, but the higher-level
surfaces — `docs/TODO.md`'s "Implementation order
recommendation," `docs/handoff-current.md`'s "Where the project
is going," `docs/onboarding/frontend.md`'s known-gaps lines —
are only refreshed when someone notices they've drifted. A new
session reading those surfaces for orientation gets a picture
several closures behind reality.

The 2026-05-02 frontend-to-frontend session-handoff dispatch
illustrated the failure mode end-to-end: its "what's likely
next" menu listed five candidates (Item 18, Pipeline DSL typing,
Cards-tab merge, substrate-tuning, theme replacement). By
2026-05-06, four of those five had shipped, but a fresh session
following the dispatch's own resumption protocol (read the
dispatch, read `handoff-current.md`, read recent worklogs, then
offer the menu) would still surface the stale list because the
TODO's "what's queued" view hadn't been corrected when each item
closed.

## What the sweep covers

Scope is umbrella-level + frontend `docs/` only. Backend-internal
docs (`backend/docs/tree-dsl.md` etc.) and proxy-internal docs
are out of scope — they're under their own teams' authoring
discipline. Within scope:

- `docs/TODO.md` — Active, Completed, and Implementation-order sections.
- `docs/handoff-current.md` — particularly "Where the project is going."
- `docs/onboarding/orientation.md` and `docs/onboarding/frontend.md`.
- `docs/notes/qEUBO.md` (status table).
- `docs/notes/frontend-theming-plan.md` (status header).
- `docs/notes/frontend-backlog.md`, `docs/notes/deferred-items.md`,
  `docs/notes/auditor-notes.md` — read-only verification (those
  three were found current on inspection).
- `frontend/CLAUDE.md`, `frontend/README.md` — read-only
  verification (both found current).

## Rules applied

The audit walked every "open / pending / parked / TODO /
deferred / in review" claim against `docs/TODO.md`'s Completed
table and the worklog series under `docs/worklog/`. Two rules
governed which surfaces got edited and which were left alone:

1. **Living docs are corrected in place.** `docs/TODO.md`,
   `docs/handoff-current.md`, `docs/onboarding/*`, and design
   notes that carry an explicit Status header are canonical
   surfaces; their accuracy at any time is the contract. A stale
   claim there is a defect, edited.
2. **Moment-in-time dispatches are left untouched.** Per
   ADR-0005's dispatch ledger convention, files under
   `docs/dispatch/` are historical records of what was true at
   authoring time. Editing a dispatch retroactively would
   destroy its ledger function. The 2026-05-02
   frontend-to-frontend session-handoff was authored before the
   four closures it implies — that is correct as a record. A
   future session reads the dispatch *and* the current
   `docs/TODO.md` together; the latter is the up-to-date filter
   over the former.

## Corrections applied

Five edits across five files.

### 1. `docs/TODO.md` — Theme-replacement parking note

The Color-theming-substrate Completed entry's closure note read:

> Theme replacement (B) — flipping the dark default to something
> less depressing — is a separate decision deferred per the
> user's "structural close only" scoping.

This was true at the moment of the substrate close (2026-05-02)
but stale by 2026-05-04 when the cluster-theme variant landed
and 2026-05-05 when the strict-palette follow-on landed. Edited
to acknowledge both shipments with worklog references.

### 2. `docs/TODO.md` — Implementation order recommendation

The "Frontend (small, independent)" and "Frontend architectural"
subsections listed four items as queued work:

- Type the pipeline DSL (closed 2026-05-04).
- Cards tab merge (closed 2026-05-06).
- Color theming substrate (closed 2026-05-02).
- Magic-literals audit (closed 2026-05-03).

All four shipped. Replaced both subsections with a single
paragraph naming the through-May closures by date and worklog
reference, plus a note that no remaining frontend architectural
arc is queued in Active — remaining tracks are coordinated
cross-team work (the silent-coercion audit's frontend leg, in
the Medium tier above), longer-horizon items in Future projects,
and whatever surfaces from `deferred-items.md` /
`frontend-backlog.md` when the user prioritises.

### 3. `docs/handoff-current.md` — qEUBO bookmarks UI

The "Where the project is going" qEUBO paragraph said:

> End-to-end UI smoke with Redis is still pending; the bookmarks
> UI is in review.

The bookmarks UI shipped 2026-04-28 (worklog
`2026-04-28-qeubo-frontend-bookmarks-ui.md`). Edited to mark
the bookmarks UI as shipped and leave the end-to-end UI smoke
as the remaining validation gate — that part is genuinely still
pending.

### 4. `docs/onboarding/frontend.md` — known-gaps line

The mandatory-reading bullet for `handoff-current.md`'s frontend
section listed three known gaps: "Pipeline DSL still typed
`any[]`; `useVariationPath` boundary cleanup; no test suite yet."
Pipeline DSL typing closed 2026-05-04 (`worklog/2026-05-04-dsl-pipeline-typing.md`).
`useVariationPath`'s signature is now `ComputedRef<NodeId[]>`
(verified at `useVariationPath.ts:22`); the boundary cleanup
shipped during the brand-pair work the 2026-05-02 auditor entry
catalogued. Only "no test suite yet" is durable.

Edited to keep the test-suite gap and to add a one-sentence
caution: always verify a "known gap" claim against
`docs/TODO.md`'s Completed table before treating it as still
open. The caution is the meta-fix for the failure mode this
sweep was triggered by.

### 5. `docs/notes/qEUBO.md` — status table row

Status table row "Frontend bookmarks UI: In review" → "Merged"
with worklog reference. The summary paragraph below the table
edited to reflect that the integration is feature-complete and
the only remaining gate is the end-to-end UI smoke with Redis.

### 6. `docs/notes/frontend-theming-plan.md` — Status header

Header read:

> **Status:** Draft (2026-05-02). Survey-and-direction document,
> not yet implemented.

Stale on two counts: the structural implementation closed
2026-05-02 (the document itself acknowledges this further down
in the "Substrate evolution (post-implementation)" section), and
theme replacement (B) closed 2026-05-04 with the strict-palette
follow-on 2026-05-05. Header edited to reflect both phases
shipped, with worklog references, and to name the
"Substrate evolution" section as the part still load-bearing
for future substrate-tuning work.

## Lesson — the dispatch / TODO drift cadence

The structural cause of the drift is asymmetric: every shipped
PR gets a worklog entry (high cadence, near-perfect compliance),
and most get a Completed-table row (high cadence, mostly
compliant — one prior auditor entry already noted three PRs
that lacked rows). But the *forward-looking* surfaces — the
"what's queued" view in TODO's Implementation-order
recommendation, the "what's likely next" menu in session-handoff
dispatches, the "known gaps" lines in onboarding — get updated
only when someone notices they've drifted. The result is that a
fresh session's first read describes a state several closures
behind reality.

Two amelioration shapes worth considering, neither implemented
in this sweep:

1. **A discipline addition to the closure dance.** When a
   shipped PR retires a TODO entry, the same commit could
   refresh the Implementation-order recommendation if that
   section names the entry. Cheap; mechanical; would prevent
   ~half the drift this sweep cleaned up.
2. **A periodic doc-graph sweep cadence.** The class-wide ACL
   audit shipped on 2026-05-03 produced an "Advice for the next
   auditor" suggesting per-release sweep cadence for
   type-vs-implementation divergence. The same logic applies to
   doc-vs-code drift: a 30-minute sweep run at every minor
   release boundary would catch most decay before it bites a
   fresh session. Filing this as a candidate addition to the
   audit ledger's standing recommendations would close the loop.

The 2026-05-02 auditor entry already named the inverse-direction
divergence (TODO ↔ code drift) as a recurring class with
mechanical detection. This sweep is the empirical confirmation
that the class is chronic, not one-off — the four closures
between 2026-05-04 and 2026-05-06 each opened a fresh drift
window and none was closed by the per-PR doc updates. The
discipline addition above is the surgical fix; the periodic
sweep is the safety net.

## Verification

`git status --short` confirms five doc files modified (plus
the pre-existing dirty `proxy` submodule pointer, unrelated).
No code paths touched. No build run needed; this is
documentation-only.

## License

Public Domain (The Unlicense).
