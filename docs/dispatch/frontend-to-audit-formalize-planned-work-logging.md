# Frontend → Audit: Formalize approved-plan logging

- **Date:** 2026-04-27
- **From:** frontend (current session)
- **To:** audit
- **Type:** request
- **Status:** drafted; awaiting audit-side consideration
- **Suggested filing:** `docs/dispatch/frontend-to-audit-formalize-planned-work-logging.md`
  per ADR-0005's dispatch ledger convention.

## Why

Plan-mode deliberations that have been approved are currently
ephemeral. The plan file lives at a harness-internal path
(`~/.claude/plans/<slug>.md`) and the signal that *this* file was the
artifact the implementing session executed against is lost the moment
that session ends. The substance — the cross-check evidence, the
explicit scope decisions, the out-of-scope notes, the verification
plan — has the same archival value as a dispatch document: it
records *why* the change took the shape it did, in a form a future
contributor or audit-LLM can reconstruct without inferring from the
diff alone.

This session's plan for C1 (dirty-board guard restoration) is the
forcing example. The plan was substantial — Context, Approach,
Critical files, Reused surface, Verification, explicit Out-of-scope.
Without a logging discipline, the plan would have been lost at
session end and only the diff would survive. Per ADR-0005 Rule 6
("author as you decide, not in retrospect"), the plan IS the record
of the decision; it should be filed when authored, not reconstructed
later (or worse, lost).

## Proposed pattern

When a plan is approved by the user (i.e., `ExitPlanMode` succeeds
and the implementing session begins execution), file the plan at:

```
docs/worklog/<YYYY-MM-DD>-<slug>.md
```

…and commit it as part of (or alongside) the implementing commit.
Worklog entries are append-only by date; the directory is the
chronological record of approved-and-executed work, sibling to but
distinct from:

| Destination | Genre |
|---|---|
| `docs/adr/` | Architectural decisions (durable, principle-shaped) |
| `docs/notes/` | Design notes and retrospectives |
| `docs/dispatch/` | Cross-team communications |
| `docs/TODO.md` | Pre-approval queued work |
| `docs/notes/auditor-notes.md` | Orientation observations |
| `docs/worklog/` *(proposed)* | Approved-and-executed plan deliberations |

A worklog entry's genre is "what was done, why it took this shape,
and how to verify it" — capturing the deliberation, not just the
outcome. The Context section in particular preserves the forensic
trail (cross-check evidence, dispatched diagnoses verified,
prior-session claims that turned out to be true vs. false) that a
code-only commit message can't carry.

## Suggested specification

A formal codification (a proposed ADR-0008, or a tenet-shaped
addendum to ADR-0005) would name:

1. **Trigger condition** — plan-mode approval that results in
   committed code. Plans that were approved and then abandoned, or
   never exited plan-mode, do not file. (Mirrors ADR-0005's
   discipline that documentation tracks decisions that fired.)
2. **Filing convention** — `docs/worklog/<YYYY-MM-DD>-<slug>.md`
   where slug is the milestone identifier or a brief topic handle.
   Date-prefixed for chronological sort.
3. **Required sections** — Context, Approach, Verification,
   Out-of-scope. Optional: Reused surface, Documentation follow-up,
   Critical files. (These are the sections the plan-mode workflow
   already produces.)
4. **Lifecycle** — entries are not edited after filing except to
   correct factual errors or annotate post-execution outcomes (e.g.,
   "verified green; manual smoke pending" → "all manual tests
   passed"). They are not retired.
5. **Cadence trigger for the audit** — the audit role periodically
   sweeps `docs/worklog/` for pattern observations, much as it
   sweeps the doc graph for orientation gaps. Drift between
   stated-plan and actually-shipped becomes a first-class signal
   for the auditor to flag.

A first worklog entry has been filed today at
`docs/worklog/2026-04-27-c1-dirty-board-guard.md` to inaugurate the
pattern. If the audit role concurs with the proposed codification,
that entry serves as the format reference, mirroring how the two
existing dispatches in `docs/dispatch/` serve as the format
reference for that ledger.

## Aside — context for the staccato cadence

This very session, and the prior frontend session's handoff (filed at
`docs/dispatch/frontend-to-frontend-auth-ux-and-dirty-board-handoff.md`),
both reflect a transitional cadence: the project has migrated from
claude.ai to Claude Code as the primary working environment, and
session boundaries are now driven by terminal lifecycle rather than
by claude.ai chat-window state. The artifacts-vs-files distinction
that shaped the prior session's "full files in artifacts; diffs
inline" prescription is dissolving — Claude Code reads and writes
files in-place. The worklog pattern is partly a response to this:
the plan-mode deliberation that used to live in a chat session's
context window now needs an explicit filesystem destination if it's
to outlive the session.

This is also why the present interaction has had a slightly
staccato shape — a request, a plan, an approval, an execution,
each somewhat formally separated. That cadence is a feature of the
migration, not a target steady state. The worklog pattern preserves
the deliberation artifacts the staccato cadence produces, so the
overhead earns its keep.

## Estimated cost

One ADR or one tenet entry. The pattern itself is free — a naming
convention plus a discipline. Implementation cost is the
copy-from-plan-file step at execute time, which the present session
is performing manually as a forcing example.

## Reply

When the audit role processes this, an entry in
`docs/notes/auditor-notes.md` (or, if promoted, a draft
`docs/adr/0008-…` and a closing dispatch back to frontend) is
sufficient. No further action required from frontend until then.
