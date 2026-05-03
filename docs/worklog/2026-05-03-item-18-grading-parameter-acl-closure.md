# Item 18 — `gradingParameter` ACL surfacing (actual closure)

- **Status:** Shipped on
  `frontend/item-18-grading-parameter-acl-closure`, 2026-05-03.
  `npm run build` passes.
- **Genre:** Worklog entry — closes a type-vs-implementation
  divergence at the ACL surfaced 2026-05-02 in
  `docs/notes/auditor-notes.md`.
- **Date:** 2026-05-03.

## Context

`ReviewCard` declared three optional fields —
`gradingParameter`, `currentRecall`, `halflifeUnits` — as
part of "Item 18 surfacing (Commit 4)" during the strict-mode
build-error sweep. The TYPE landed; the IMPLEMENTATION did
not. `services/backend-service.ts::mapToReviewCard` extracted
`default_visits` and `gamma` from `raw.grading_parameter` via
`readGradingParam<T>` but never propagated the whole blob (or
the recall projections) onto the returned `ReviewCard`.

The consumer at `useReviewSession.ts:235` —

```ts
const rawConfig = currentCard.value?.gradingParameter?.data?.analysis_config;
```

— therefore read `undefined` in production. The per-card
config-override path was dormant; reviews used
`compileAnalysisConfig()` (the live env config) regardless of
what each card was minted with. TypeScript's optional-chaining
swallowed the absence; `?` on the field declaration accepted
the missing assignment as a valid empty case. The lie was
invisible to the type-checker, to the build, and to runtime —
only an audit caught it (2026-05-02 entry in
`docs/notes/auditor-notes.md`, prompted by the proxy v1.0.3
curation migration work that was operating on the assumption
that the field round-tripped through review).

The closure scope from the TODO entry was three-part:
populate the three fields at the ACL; route
`gradingParameter` through the curation rewriter so
pre-v1.0.3 cards' baked configs translate to the curated
proxy stdlib at fetch time; verify residue handling end-to-end
(proxy `NameError` → SystemMessage per ADR-0002).

## What changed

### `src/services/backend-service.ts`

Two edits in `mapToReviewCard`:

1. New import:
   ```ts
   import { rewriteGradingParameterAnalysisConfig } from '../engine/analysis-config-curation';
   ```
2. Inside the function, before the return literal, compute
   the curated blob:
   ```ts
   const curatedGradingParameter =
     rewriteGradingParameterAnalysisConfig(raw.grading_parameter)
       .gradingParameter as CardFromWire['grading_parameter'];
   ```
   The cast back to `CardFromWire['grading_parameter']` from
   the rewriter's `unknown` is justified by the rewriter's
   structural contract: it preserves the top-level shape (same
   reference for the no-op fast path; otherwise a structural
   copy with siblings kept by reference). Only
   `data.analysis_config.symbols.*` strings are touched. The
   wire shape (`{[key: string]: unknown} | null`) round-trips
   through the rewriter unchanged at the outer level. A short
   comment block above the call records the rationale and the
   residue-handling posture.
3. Three new fields appended to the returned object literal:
   ```ts
   gradingParameter: curatedGradingParameter,
   currentRecall: raw.current_recall,
   halflifeUnits: raw.halflife_units,
   ```
   `current_recall` and `halflife_units` are required `number`
   on the OpenAPI wire schema, so no fallback or coercion is
   needed.

### `src/types.ts`

The WARNING block on `ReviewCard.gradingParameter` retired —
the dormant-state warning is no longer accurate. The
introductory paragraph stays (it explains why the field
exists and what consumers do with it); the warning paragraph
is replaced with a short paragraph describing the curation
rewrite at the ACL and the residue posture. The
`Item 18 surfacing (Commit 4)` comment line trimmed to
`Item 18 surfacing` since the closure reference is no longer
just Commit 4 — the two-stage closure narrative lives in the
TODO Completed row and the auditor-notes follow-on.

### `src/engine/analysis-config-curation.ts`

The file header's "Single source for the curated names;
consumed by:" enumeration listed the ACL pass with a
parenthetical "gated on Item 18's actual closure per the
warning at `types.ts`'s `gradingParameter` declaration; not
wired today." Flipped to record that the ACL pass is now
in place alongside the migrations consumer; the migration
covers state already persisted pre-v1.0.3, the ACL covers
cards as they arrive from the backend going forward.

### `docs/TODO.md`

- Frontend Completed row #18 rewritten from the original
  one-line synopsis (which claimed closure jointly with
  Commit 4) to a longer, honest two-stage narrative pointing
  at this worklog and the auditor-notes follow-on.
- The Active Medium entry "Item 18 — `gradingParameter` ACL
  surfacing (actual closure)" replaced with a brief
  "moved to Completed" stub matching the other moved-to-
  Completed Active stubs already in the file.

### `docs/notes/auditor-notes.md`

New dated entry "2026-05-03 — Item 18 ACL closure follow-on
by Claude (Opus 4.7)" appended after the 2026-05-02 end
marker. Three subsections: what shipped, what this entry
does NOT close (the class-wide audit pass remains as a
follow-on session), and the lesson reinforced (when a
typed-but-unpopulated field is finally populated, the
documentation that warned about its dormancy retires
alongside in the same commit).

## Residue handling — verified, not implemented

The TODO entry called for residue-handling verification, not
new residue surfacing at the ACL. The existing chain is:

1. The rewriter passes residue through unchanged (any `np.*`
   reference outside the curated stdlib, attribute walks
   like `np.linalg.norm`).
2. At review time, the proxy receives the baked
   `analysis_config` and attempts evaluation. A residue body
   raises `NameError` at call time.
3. `analysis-service.ts` surfaces the error through
   `pushSystemMessage` per ADR-0002.

This path is the authoritative diagnostic for residue cards.
A pre-emptive ACL warning would be noise (residue is a
property of the user's library, not of any one card; per-card
warnings on every fetch would amplify a single library defect
into N notifications). The migration's audit at upgrade time
(11 → 12 step in `store/migrations.ts`) covers the upgrade
path; the proxy `NameError` covers post-upgrade fetches with
new bad bodies.

## Visual effect

None at fresh-mint time: the rewriter is bit-equivalent under
the wrapper contract for the kwarg-free positional case, and
all stdlib defaults satisfy that case. For pre-v1.0.3 cards in
the deployed population (~7 000+ minted before the proxy's
curated stdlib shipped), the per-card `analysis_config`
override now actually overrides — reviews of those cards are
graded against the palette they were minted with, not against
whatever the user's live env config is today. This is the
visible behavior change the closure delivers.

For cards minted post-v1.0.3 (no `np.*` references because
the proxy v1.0.3 OpenAPI emits the curated names directly),
the rewriter is a structural pass-through; the surfacing
itself is what's new.

## What's not done

- **Class-wide audit pass.** The 2026-05-02 entry's secondary
  recommendation — sweep `mapToReviewCard` and any other ACL
  translator with documented surfacings, looking for typed-
  but-unassigned fields — is not done in this PR. Recorded as
  open in the auditor-notes follow-on; ready for a future
  session.
- **`useReviewSession.ts:235` consumer cleanup.** The read
  `currentCard.value?.gradingParameter?.data?.analysis_config`
  uses the same optional-chaining pattern the dormant state
  necessitated; it works correctly post-closure (the field
  is populated when present on the wire), but a tighter
  signature could in principle reflect the now-reliable
  presence. Not in scope here — the field is genuinely
  optional in some test-construction contexts and the
  optional-chaining is the right shape.

## Verification

- `npm run build` passes; `vue-tsc -b` clean, `vite build`
  clean. (Pre-existing externalized-module warnings and
  chunk-size advisory are unchanged.)
- ADR-0002 satisfied: no swallowed errors; the rewriter's
  residue is left for proxy-time `NameError` surfacing; no
  silent coercion at the ACL beyond what `readGradingParam`
  already does for `default_visits` / `gamma`.
- ADR-0004 satisfied: each edit is localized to the lines
  the closure requires. No "while I'm in here" rewrites of
  surrounding code.
- ADR-0005 satisfied: the WARNING block at the type
  declaration site retires alongside the implementation
  edit (single source of truth per nominal handle); the
  TODO Completed row now reflects the actual two-stage
  closure rather than the original incorrect "closed
  jointly with Commit 4" claim; auditor-notes carries the
  closure follow-on.
- ADR-0006: all touched files already carry the standard
  header; no retrofit needed.

## License

Public Domain (The Unlicense).
