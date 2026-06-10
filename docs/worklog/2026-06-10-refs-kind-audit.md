# Worklog — `refs.kind` gains the `audit` value (2026-06-10)

> Audit trail for the small PR amending the work-status store's refs-kind
> vocabulary. The history-lessons audit (§5 of
> `docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`) surfaced the
> gap per ADR-0002 Rule 7 / ADR-0008 rather than silently absorbing it:
> audit reports under `docs/notes/audit/` had no honest `refs.kind` value
> and were filed as `design-note` by closest-match precedent. The
> maintainer approved adding the value on 2026-06-10.

## The change

- **Live store** (applied ahead of this PR, per the schema's
  closed-but-amendable-enum convention): `refs_kind_check` re-created with
  `'audit'` added; the 48 existing refs whose target lives under
  `docs/notes/audit/` re-pointed from `design-note` to `audit`.
  `work_status_violations` clean before and after.
- **`tools/work-status/schema.sql`**: the contract record amended to
  match, with a dated provenance comment at the constraint.

## Notes

- Re-pointing the audit-target refs also dissolves the ADR-0005 Rule 9
  tension the audit flagged (multiple items referencing one audit doc via
  `design-note`, brushing the one-owning-item reading): Rule 9's
  exactly-one-owner discipline now applies only to genuine design notes,
  as intended.
- Postmortem/consult/investigation targets remain under `design-note`;
  the audit named only the audit-directory gap, and widening the
  vocabulary further is a separate question for the maintainer if it ever
  bites (closest-match flagging, not silent reuse, remains the rule).
- The audit doc and the filings summary are point-in-time records and are
  not retro-edited; this worklog is the forward record.

License: Public Domain (The Unlicense).
