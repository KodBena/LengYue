# Resource-ownership audit — Pass 3 forward-authoring discipline

- **Status:** Shipped on
  `docs/resource-audit-pass-3-discipline`, 2026-05-04. Doc-only
  PR; no code changes. **Pass 3 closes the audit.**
- **Genre:** Audit-pass artifact — codifies the inline-comment
  convention and authoring checklist that future PRs apply when
  introducing new owner types or mutation functions, analogous
  to the magic-literals audit's "Comment convention" close-out.
- **Date:** 2026-05-04.

## Context

The Pass-1 inventory (PR #118) and the ten Pass-2 fix PRs
(#119–#128) closed all 15 suspected-open owner-resource pairs:
13 in code, 2 by verification with explanatory comments. Pass 3
codifies the discipline so the recurring shape Pass-1's closeout
note named — "per-entity Map/Set state in a service or composable
singleton reliably gets a dispose/disconnect cleanup path, but
inconsistently gets an entity-removal cleanup path" — doesn't
repeat in future authoring.

The audit plan (§"Pass 3") originally framed two complementary
outputs:

1. **Inline comment convention** at cleanup sites.
2. **Authoring checklist** in either a PR template or
   `frontend/CLAUDE.md`.

This PR ships both, with the PR-template-vs-CLAUDE.md choice
resolved in favor of `frontend/CLAUDE.md` (no PR template existed
at audit-close time, and the discipline is frontend-scoped).

## What changed

### `docs/notes/resource-ownership-audit-plan.md`

Three edits:

1. **Status block** updated from "Pass 1 closed; Pass 2 / 3
   pending" to "All three passes closed 2026-05-04," with a
   one-line summary of each pass's deliverable plus a pointer
   at the worklog chain.

2. **New top-level §"Comment convention and authoring
   discipline"** between the Inventory and Pass-structure
   sections. Four subsections:

   - **Inline shape — at the cleanup site.** Names the three
     things a cleanup-line comment carries (resource, failure
     mode, ordering constraint), with `closeBoard`'s
     post-audit body as the canonical worked example.
   - **Function-docstring shape — at the mutation site.** The
     four-part structure: one-line summary, enumerated
     cleanups, ordering paragraph, audit-pair-identifier
     reference. Both `closeBoard` and `resetWorkspace` are
     canonical examples.
   - **Authoring checklist — when introducing a new owner or
     mutation.** A four-step walk: identify external state
     keyed by the entity, classify the failure mode without
     cleanup (bounded leak / unbounded leak / privacy /
     user-visible misbehavior), decide fix / document /
     defer per pair, wire and document.
   - **Threshold — when does this apply?** Carve-outs for Vue
     lifecycle automatics, closure-scoped state,
     type-system-checked invariants, backend-side resources.

3. **§"Pass structure"'s Pass 3 entry** replaced with a brief
   pointer at the new convention section, naming the
   PR-template-vs-CLAUDE.md resolution.

The plan now reads as both the methodology document and the
codified discipline; the inventory is the worked-example record,
the convention section is the authoring contract going forward.

### `frontend/CLAUDE.md`

New top-level section "Resource ownership at mutation sites"
appended after "Scope boundaries." Three paragraphs plus a
condensed authoring-checklist mirror:

- **Paragraph 1.** Names the discipline ("when a function
  removes or replaces an entity that owned external resources
  …") and contrasts with Vue's automatic cleanup.
- **Paragraph 2.** Points at the audit plan as the depth
  reference; condenses the four-step authoring checklist.
- **Paragraph 3.** Names `closeBoard` and `resetWorkspace` as
  the post-audit worked examples; ties the discipline to
  ADR-0002's fail-loudly tenet.

The CLAUDE.md addition is intentionally short — enough to make
the discipline visible at the top of every contributor's
mental map, with the depth reference one click away in the
audit plan.

### `docs/TODO.md`

Two edits:

1. **New row in the Frontend Completed table.** One paragraph
   covering: Pass 1 / 2 / 3 sequence, PR ledger (#118–#128
   plus this Pass-3 close-out), substantive sub-findings
   surfaced during the work (`purgeBoard` `nodeVersions`
   leak, the closeBoard/resetWorkspace timeout-resurrect bug
   that the inventory had under-framed, the
   `Partial<Record<>>` type-honesty retrofit), final cleanup
   contracts (six on closeBoard, five on resetWorkspace,
   each enumerated with audit-pair identifiers), and
   pointers at the worklog series.

2. **Active-tier row collapsed** from its long body text to a
   "moved to Completed" header with a one-paragraph pointer,
   matching the established pattern (e.g., the magic-literals
   audit row's prior close-out).

## Why CLAUDE.md rather than a PR template

The audit plan's Pass-3 framing said "PR template (or a
`frontend/CLAUDE.md` addendum, depending on what ships in
adjacent work)." Two reasons CLAUDE.md won:

1. **No PR template exists** at the umbrella or frontend level
   (`find` for any case of `pull_request_template` returned
   only node_modules artifacts). Creating one just for this
   audit's checklist would be a heavier intervention than the
   Pass-3 deliverable warrants.
2. **The audit's domain is frontend.** The umbrella `CLAUDE.md`
   correctly stays minimal; the resource-ownership concerns
   are SPA-specific (Vue composables, module-scope caches,
   in-flight WebSocket subscriptions). Frontend-scoped
   discipline lives in `frontend/CLAUDE.md`.

The umbrella `CLAUDE.md` already names "documentation is part
of the work" as a tenet; the per-subproject CLAUDE.md is the
file where SPA-shaped authoring guidance accumulates.

If the project later grows a PR template (e.g., during the
distribution-packaging arc), the resource-ownership question
("what does this owner own?") could migrate or duplicate
there. For now, frontend/CLAUDE.md is the authoring-discipline
home.

## Pass 2 retrospective (preserved from #128's worklog)

The audit's substantive lessons, retained for future audit
walks:

- **Inventory pre-judgment is a hazard.** O5/O11's "bounded;
  controllers GC-eligible" disposition was too generous; the
  verification trace surfaced a real user-visible bug
  (timeout-resurrected reviews row 30s after closeBoard).
  Future Pass-1 walks should frame uncertain dispositions as
  questions rather than pre-supplying "likely benign" answers.
- **Sub-findings are bisect-natural in their own commits.**
  PR #119's split (`purgeBoard`'s `nodeVersions` leak as a
  pre-requisite for the main O1 fix) was the cleanest shape;
  future audit work should preserve this when sub-findings
  surface during a verification trace.
- **One-PR-per-pair is the default; pair when same-site +
  same-concern.** O2+O3 (#125), O8+O9 (#128), and O5+O11+O6+O15
  (#126) honored pairing. O13+O14 (#124) deviated from the
  default by running two commits in one PR for "finish
  lifecycle" framing — defensible at the user's call but a
  small deviation worth noting.
- **ADR-0004 minimal-touch composes well with ADR-0006
  retrofit.** The audit's PRs retrofitted file headers, type
  narrowings, and inline comments without scope creep — each
  retrofit was named in the inventory's deferred section and
  rode with a natural-touch PR.

## Verification

- All four edited files render cleanly in standard Markdown.
- The audit plan's new convention section is internally
  consistent with the Pass-1 inventory tables (audit-pair
  identifiers match across the document).
- `frontend/CLAUDE.md`'s new section composes with the
  existing structure (no header-level reshuffling, no
  conflict with prior sections).
- TODO.md row migration follows the established
  Active-tier-row → Completed-table-row pattern (e.g.,
  magic-literals audit closure).
- No code changes; `npm run build` skipped.

## Forward notes

The audit is closed. Future audit work, if any:

- **Protocol-state framing sweep.** Per Pass-1's §"Primary
  taxonomy," the audit picked owner-resource as primary while
  acknowledging that protocol-state (per-wire-action audit
  pivot) and subscription (per-service / per-API audit pivot)
  framings would catch additional residue. The codebase's
  Pass-2 fixes addressed many cases that those framings would
  have surfaced (the protocol-state lens caught O5/O11 in
  practice; the subscription lens informed O15/O6); a fresh
  walk under either framing might surface a small residue not
  covered by owner-resource. Not currently planned.
- **Re-audit on deployment-model shift.** The deferred
  `analysisService.disconnect()` and full `store.engine`
  reset on identity flip remain in
  `docs/notes/deferred-items.md` with a "revisit when"
  trigger keyed to user-keyed engine endpoints
  (cloud-compute, rented per-user analysis). When triggered,
  the audit's owner-resource framing applies to whatever new
  per-identity state the deployment model introduces.
- **New-feature-driven audits.** Future feature work (the
  Cards-tab merge, multi-tab support, the Item-32 zeroconf
  discovery) introduces new entity types and mutations.
  Each lands with the authoring-checklist walk per the
  Pass-3 discipline; if the walk surfaces a class of pairs
  rather than a few isolated ones, a focused audit-pass-1
  inventory for that class is the appropriate response shape.

The audit plan stays canonical; the worklog chain stays as
the per-PR record; the convention section is the steady-state
authoring contract. None of the three needs further updates
absent a triggering event.

Hand off in good condition.
