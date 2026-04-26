# Deferred Items — Active Ledger

- **Status:** Active. Items land here the moment they surface; they
  leave when they're addressed (with a brief note describing the
  outcome) or get promoted to `docs/TODO.md` when their priority
  rises.
- **Genre:** Working-memory offload for items that don't yet warrant
  a TODO entry, an ADR, or a deferred-decisions entry, but which
  would otherwise be lost.
- **Distinct from:**
  - `docs/TODO.md` — actively scheduled work.
  - `docs/notes/decisions-deferred.md` — decisions explicitly made
    *against* action, with revisit triggers. Items here haven't
    been decided either way; they're in the queue to *think about*.
  - `docs/adr/` — decisions that have fired.

## How to use this file

When something surfaces during work that doesn't fit anywhere else
yet — a code smell flagged in passing, an audit that should
happen but isn't scheduled, an RFC idea, an inconsistency that
needs resolving — append it here with a date and one paragraph.
Don't agonize over the wording; the goal is preventing loss, not
producing a polished record.

When an item is addressed, replace its body with a one-line
outcome and the date, leaving the entry visible as historical
record. When an item turns out to deserve a proper TODO entry, an
ADR, or a decisions-deferred entry, move it there and remove from
this file.

---

## Open items

### ADR-effectiveness audits

- **Surfaced:** 2026-04-26.
- **Concern:** The seven ADRs (especially the four tenets:
  ADR-0002, ADR-0004, ADR-0005, ADR-0006, with ADR-0007 newly
  proposed) are policy, not mechanism. Their adoption is assumed,
  not measured. A periodic audit pass — "where in the codebase
  does this tenet not currently hold, and why" — would surface
  drift before it ossifies. ADR-0002 is the most overdue: a
  codebase-wide sweep for silent retries, swallowed errors,
  sentinel-instead-of-throw, ACL-coercion-instead-of-validate,
  and empty catches has not been done since the tenet was
  adopted. ADR-0007 will need its own audit once accepted (file
  size, density, formatting compliance). The discipline itself is
  ADR-shaped: an ADR-0008 or similar that prescribes how and when
  ADRs get audited would close the loop.
- **Suggested next action:** Decide whether the audit cadence is
  itself an ADR (likely yes) or an ad-hoc TODO item per ADR
  (likely no — too easy to forget). Probably an ADR that
  prescribes a per-tenet audit checklist, an audit ledger
  destination, and a cadence trigger (every N months, or every
  major umbrella event).

### Serial numbers on compiler-generated artifacts

- **Surfaced:** 2026-04-26.
- **Concern:** Generated files (notably `frontend/src/types/backend.ts`)
  are correlated to a known backend state only by external
  knowledge ("I just ran `npm run gen:api`, so this is current").
  When a frontend agent receives a generated file out of band,
  there's no in-file marker that says which backend revision /
  commit / build it corresponds to. A short serial — could be a
  timestamp, a content hash, a git SHA snippet, or a
  monotonically incrementing integer — embedded in a header
  comment of generated files would let downstream readers (human
  or LLM) verify they're working against the version they think
  they are.
- **Suggested next action:** Draft an RFC that proposes the
  serial format, the generation hook (where does the serial come
  from), the embedding location (header comment vs. constant
  export), and the consumer-side validation pattern. No
  implementation work until the RFC is reviewed.

### LoadAction type is dishonest (ConfirmLoadModal.vue)

- **Surfaced:** 2026-04-26 (during C1 diagnosis).
- **Concern:** `ConfirmLoadModal.vue` declares
  `type LoadAction = 'new' | 'overwrite' | 'cancel'` but actually
  resolves with values like `'new-saved'` and `'overwrite-saved'`
  via an `as LoadAction` cast in `handle()`. The consumer
  (`handleLoadCardFromDatabase` in App.vue) correctly handles the
  suffixed cases — but at the type level the contract is a lie.
  Direct ADR-0001 violation (no aspirational annotations).
- **Suggested next action:** Widen the type to
  `'new' | 'overwrite' | 'cancel' | 'new-saved' | 'overwrite-saved'`,
  or split into two fields (`{ action: 'new' | 'overwrite' |
  'cancel', remember: boolean }`) which is the more honest shape.
  Apply the next time `ConfirmLoadModal.vue` is touched
  substantively (per ADR-0004's incremental-retrofit posture).

### Silent guard fail in handleLoadCardFromDatabase (App.vue)

- **Surfaced:** 2026-04-26 (during C1 diagnosis).
- **Concern:** The handler contains `if (!confirmLoadModalRef.value)
  return` — a silent early-return when the modal ref isn't bound.
  Direct ADR-0002 violation (silent fallback rather than fail-loud).
  Even after C1 restores the import, the early return remains as a
  defensive-programming residue that hides future detachments of
  the modal ref. Should at minimum be `pushSystemMessage('error',
  ...)` followed by throwing, or replaced with a typed contract
  that makes the modal mount mandatory at call time.
- **Suggested next action:** Decide whether this is a C1 follow-up
  (small enough to bundle) or a separate touch. Will resolve
  during C2 (App.vue refactor) at the latest, since the guard
  logic is the natural extraction target.

### Refactoring queue from ADR-0007

- **Surfaced:** 2026-04-26 (during ADR-0007 drafting).
- **Concern:** Files failing ADR-0007's single-view test (red
  flag, > 300 lines) need to be queued for refactoring. The
  candidates from the audit done at draft time:
  - `App.vue` (591 lines) — god component; first target after B5.
    Becomes C2 of the navigation-guard milestone sequence.
  - `HorizontalTimelineVisualizer.vue` (371 lines).
  - `useReviewSession.ts` (371 lines) — likely state-machine
    exception applies; verify before refactoring.
  - `PaletteEditor.vue` (352 lines).
  - `BaseChart.vue` (331 lines).
  - `MintCardModal.vue` (310 lines).
  - `types.ts` (387 lines) — type-catalogue exception applies; no
    action needed unless a clean domain seam appears.
  Yellow flag (200–300): `CardSetEditor.vue`, `TreeWidget.vue`,
  `MoveSuggestions.vue`, `BoardDisplay.vue`. Review on next touch
  per ADR-0007.
- **Suggested next action:** No batch refactor — handle
  incrementally per ADR-0004's posture. App.vue is the highest-
  priority target because it's the largest and because its
  contents (multiple orchestration patterns competing in one
  file) actively cause confusion during navigation-guard work.

---

## Closed items

*(none yet)*
