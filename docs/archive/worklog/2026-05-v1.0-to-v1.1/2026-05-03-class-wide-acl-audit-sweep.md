# Class-wide ACL audit sweep — 2026-05-02 entry's secondary
# recommendation

- **Status:** Shipped on
  `frontend/auditor-class-wide-acl-sweep`, 2026-05-03. Docs-only
  PR; no code changes.
- **Genre:** Worklog entry — closes the secondary recommendation
  from `docs/notes/auditor-notes.md`'s 2026-05-02 entry (the
  class-wide audit pass over ACL translators); files the
  cumulative-tally artifact the 2026-05-02 "Advice for the next
  auditor" requested.
- **Date:** 2026-05-03.

## Context

The 2026-05-02 auditor-notes entry surfaced a
type-vs-implementation divergence class — typed-but-unassigned
fields at ACL boundary translators — using `gradingParameter`
on `ReviewCard` as the worked instance. The entry filed two
distinct items:

1. **Item 18 actual closure** — the immediate-action item.
   Shipped earlier today in PR #96
   (`docs/worklog/2026-05-03-item-18-grading-parameter-acl-closure.md`).
2. **Class-wide audit pass** — a sweep over `mapToReviewCard`
   and any other ACL translator with documented surfacings,
   looking for the same shape. Filed as a follow-on session;
   the user prioritised it directly after the closure landed.

The 2026-05-02 entry's "Advice for the next auditor" called
out three forward-looking expectations: (a) file findings as
a sub-numbered observation under the same entry — adapted
here to a dated follow-on entry instead, since the
established convention since 2026-04-27 has been per-session
dated entries; (b) keep a cumulative tally so the class can
be classified as chronic vs. one-off; (c) the procedure is
mechanical, ~five minutes per pass.

## What changed

### `docs/notes/auditor-notes.md`

Two edits.

**(a) New dated follow-on entry** — `## 2026-05-03 (follow-on)
— class-wide ACL audit sweep by Claude (Opus 4.7)`. Five
sections:

1. **Mechanical procedure applied** — the actual grep that
   opens the audit and the field-walk procedure for each
   domain interface produced by an ACL translator.
2. **Forward sweep — typed-but-unassigned fields** — table
   listing every ACL translator in the codebase, its domain
   types, and the verdict per translator. All clean
   post-PR-#96. The qEUBO ACL specifically called out as
   "exemplary" — `narrowPhase` enforces the discriminated
   union per ADR-0002 with a throw on contract violation, and
   every wire field maps to exactly one domain field across
   all six map-functions.
3. **Inverse sweep — TODO ↔ code drift** — the
   `git log --grep "Closes: TODO"` output (only two commits,
   both already resolved as part of the 2026-05-02 entry's
   section 4 follow-on); spot-checks of Active TODO entry
   premises against current code state (all hold).
4. **Adjacent observations** — three findings flagged for
   completeness rather than as audit-class instances: three
   shipped frontend PRs without TODO Completed table rows;
   `ForestStat` / `TagStat` wire-shape passthrough at the
   ACL boundary (filed in `deferred-items.md` for
   prioritization); `currentRecall` / `halflifeUnits` have
   no current consumers (correctly populated, just unused —
   surfacing-without-consumer is a reasonable shape).
5. **Closing recommendation** — class-wide audit recommendation
   closes as "swept clean — no further instances surfaced";
   the user's recollection of "this is not the first time"
   likely captures a chronic shape across the codebase's
   *history* rather than its current state.

Closes with an "Advice for the next auditor" subsection
carrying forward the cumulative tally and the procedural
notes for future passes.

**(b) Stale forward-reference fixed** — section 2 of the
2026-05-03 closure entry (the Item 18 closure follow-on, also
filed today) said the class-wide pass "remains as a follow-on
session — the user can elect to schedule it as its own work
unit when prioritized." That was accurate at the moment of
authoring but became stale within the same session. Updated
to "the class-wide pass was deferred at this entry's authoring
time; the user prioritised it later in the same session, and
the dated follow-on entry below records the sweep's
cumulative-tally findings." This honours the lesson the
closure entry's section 3 reinforced: when an entry's premise
shifts, fix the entry; don't let the doc graph drift.

### `docs/notes/deferred-items.md`

New Open item: **"ForestStat / TagStat — wire-shape passthrough
at the ACL boundary."** Surfaced during the audit sweep; filed
here rather than auditor-notes because it's a different class
(missing ACL translator, not type-vs-implementation divergence)
and lighter-weight than auditor-class observations. The entry
records:

- The two interfaces declare snake_case fields verbatim from
  the wire (`root_card_id: number` etc.) with no domain
  translation between `BackendService.getForestStats` /
  `BackendService.getTags` and consumers.
- The discipline gap matches the ACL convention documented in
  `frontend/CLAUDE.md` ("the ACL at backend-service.ts is the
  boundary where snake_case becomes camelCase").
- Three observed consumer sites carry inline `as CardId`
  brand-casts to bridge the un-branded wire numbers
  (`useCardTreeData.ts:65`, `ForestDirectory.vue:44, 144`).
- Suggested remediation is a small PR adding `mapForestStat`
  and `mapTagStat` paralleling `mapToReviewCard`'s shape,
  renaming the domain interfaces with camelCase, sweeping
  the three consumer sites. Defer until prioritized; no
  urgent functional issue, worth doing before a fourth
  consumer accumulates a fourth brand-laundering cast.

## What's not done

- **The three-PRs-without-Completed-rows backfill.** Mentioned
  in section 4 of the new auditor-notes entry as an adjacent
  observation. Backfill is a small docs sweep if uniformity
  is wanted; deferred to user judgement.
- **The ForestStat / TagStat ACL translator addition itself.**
  Filed in `deferred-items.md` for prioritization rather than
  shipped here.
- **No code changes.** This PR is docs-only — the audit
  finding is a clean negative result for the type-vs-impl
  class. The act of *recording* the result (so the next
  auditor doesn't repeat the sweep on the same uncertainty)
  is the deliverable.

## Verification

- No code changes; `npm run build` not re-run.
- ADR-0005 satisfied: the auditor-notes entry is the canonical
  record for the class-wide audit findings; the deferred-items
  entry is the canonical record for the ForestStat / TagStat
  observation; the worklog is the canonical record for this
  PR's edits. Each artifact has a single nominal handle, no
  duplication.
- ADR-0006: doc files only; no source-file headers to retrofit.
- The 2026-05-02 entry's three "Advice for the next auditor"
  expectations all met: (a) findings filed (in the appropriate
  conventional shape); (b) cumulative tally recorded
  ("one instance, found, closed"); (c) procedural notes for
  the next pass carried forward in the new entry's "Advice
  for the next auditor" section.

## License

Public Domain (The Unlicense).
