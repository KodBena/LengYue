# Worklog — reactive-state modules relocated to `src/state/` (2026-06-11)

> Audit trail for work-status item `reactive-state-modules-relocation`,
> executing **step (b)** of the 2026-06-10 services-boundary arc (step (a)
> was `services-boundary-deny-by-default`, PR #378,
> `docs/worklog/2026-06-10-services-boundary-deny-by-default.md`). Branch
> `bork/refactor/reactive-state-modules-relocation`. The maintainer gave the
> separate sign-off this arc required (per the step-(a) item text) on
> 2026-06-11. This is also the named **collapse-into-one-principle pathway**
> of ADR-0010's Revisit-when #4 — see the determination below.

## The change

The three reactive-state modules moved out of `src/services/` into a new
`src/state/` directory, file names preserved:

- `src/services/analysis-ledger.ts` → `src/state/analysis-ledger.ts`
- `src/services/analysis-config.ts` → `src/state/analysis-config.ts`
- `src/services/stability-trajectory-store.ts` → `src/state/stability-trajectory-store.ts`

(`git mv`, so rename detection is preserved; the only content change to the
moved files is the ADR-0006 header pathname line.) Every import site updated
(15 ledger + 14 config + 4 trajectory import statements across components,
composables, the store, two sibling services, and the test tree). The
strict typecheck (`vue-tsc -b`) drove the net to zero.

The ESLint component→services boundary
(`@typescript-eslint/no-restricted-imports`, the deny-by-default rule from
step (a)) is now **purely directory-structural**:
`REACTIVE_STATE_EXEMPTIONS` (the gitignore-style `!` negation list that
carved the three modules back out of `**/services/**`) is **deleted**; the
pattern group is a single `['**/services/**']`. Components may not import
from `src/services/**`; `src/state/**` is importable because it simply is
not under `services/` — no carve-out, no enumeration.

### Population by predicate, not enumeration

The module set to move was defined as exactly the set named by
`REACTIVE_STATE_EXEMPTIONS` at HEAD. At HEAD that constant held:

```js
const REACTIVE_STATE_EXEMPTIONS = [
  '!**/services/analysis-ledger',
  '!**/services/analysis-config',
  '!**/services/stability-trajectory-store',
];
```

— exactly `{analysis-ledger, analysis-config, stability-trajectory-store}`,
which is the item text's enumeration. **No divergence**; the predicate and
the item's enumeration agreed, so no STOP-and-report was triggered.

## Why `src/state/` is a sibling, not a sub-directory of either

`src/state/` is placed at the same depth as `src/services/` (one level under
`src/`), which is what makes the relocation cheap: the three files' internal
imports are all `../`-relative (`../engine/...`, `../store`, `../i18n`,
`../types`, `../composables/...`, `../lib/...`) and stay valid unchanged at
the same depth. Only the *importers'* paths changed (`services/X` →
`state/X`), and the moved files' own pathname-header line.

## The machinery-vs-payload seam (the record the item names)

The item names "the machinery-vs-payload seam" as the thing this arc records,
and asks for the placement choice to be explained. The seam:

- **`src/services/` is effect machinery.** Effectful singletons: API/HTTP
  clients, the WebSocket transport, the backend ACL, debounced persistence,
  the engine-connection lifecycle owner. A component importing one of these
  is reaching past its layer to orchestrate an effect — the layering tenet's
  target.
- **`src/state/` is reactive payload.** Reactive-state modules a display
  *leaf* reads to display what it displays (ADR-0010 read-locality). No
  network, no effect orchestration; the value a leaf renders simply *lives*
  here.

Step (a) held these apart with a **lint heuristic** — an exemption list of
three module names negated out of the services-deny pattern. The objection
that list invited was structural: membership in the reactive-state *class*
was asserted by a hand-maintained negation list inside a lint, fail-open in
the same shape the step-(a) inversion was correcting one level up (a new
reactive-state module would be denied until someone remembered to add its
`!` negation). The relocation dissolves that: class membership is now
**where the module lives**. The boundary the lint enforces is the directory
boundary, and the directory boundary *is* the machinery-vs-payload seam made
physical. That is the placement rationale: the seam was already the
conceptual split step (a) annotated; this arc makes the split the file-tree's
own shape rather than a list the lint has to carry.

**Placement of this record.** The worklog is the seam record's home (the
item names it the minimum home). Two sentences earned a place beyond it as
minimal dated edits, because they describe a *standing reality* a future
reader meets at those surfaces, not a one-time event:

- `frontend/eslint.config.js` header — the component→services paragraph now
  states the seam directly ("`src/services/` is effect machinery (deny),
  `src/state/` is reactive payload a leaf may read (allow)") as the dated
  step-(b) note, because that header is where a future editor of the rule
  meets the rationale.
- `frontend/CLAUDE.md` "Architectural shape" — the Tension paragraph names
  the seam, because that is the orientation surface where the directive
  tension is documented for authors.

No fabricated home was needed; the seam has honest homes at exactly the two
surfaces that already carried the unresolved-tension annotation (ADR-0008 —
no synthetic parent invented).

## ADR-0010 Revisit-when #4 determination

Trigger text, quoted verbatim (the commission asks for precision here; this
project recently paid for an imprecise trigger-firing record):

> **The layering tenet and Rule 2 (read-locality) are reconciled, or found
> irreducibly in tension.** … That split is a working reconciliation, not a
> proven bridge. Revisit when a case appears that the split cannot cleanly
> classify — a services-layer module that is both an effectful singleton and
> a legitimate leaf-read source — or when there is bandwidth to ask whether
> the two directives collapse into one coherent principle (e.g. relocating
> reactive-state modules out of `services/`) rather than being held apart by
> a lint heuristic. Surfaced per ADR-0002; not resolved here.

The trigger has two disjuncts. The determination, kept precise about what
fired and what did not:

- **Disjunct 1** ("a case … the split cannot cleanly classify — a
  services-layer module that is both an effectful singleton and a legitimate
  leaf-read source") — **DID NOT FIRE.** No such hybrid module appeared.
  `analysis-bundle` (a pure projection — the one near-miss the step-(a) arc
  adjudicated) stayed in `src/services/` because it is not reactive state,
  exactly as the split predicts; it remains a value-import-denied,
  type-import-allowed module.
- **Disjunct 2** ("when there is bandwidth to ask whether the two directives
  collapse into one coherent principle (**e.g. relocating reactive-state
  modules out of `services/`**) …") — the **e.g. (the relocation) executed**;
  the **question it is an e.g. *of* (whether the two directives collapse into
  one coherent principle) did NOT resolve.** The relocation converts the
  working split from *heuristic* (an exemption list in a lint) to
  *structural* (where a module lives) — which is precisely what ADR-0010's
  prior record note called the *pathway*. But render-locality and the
  effect-orchestration boundary remaining two sound directives meeting at one
  seam is unchanged: `src/state/` vs `src/services/` *names* the seam more
  honestly, it does not *dissolve* it into a single principle.

**Net: the trigger stays live** on the unresolved collapse-into-one-principle
question. The relocation removes the heuristic-vs-structural objection from
that question but leaves the deeper reconciliation open. Recorded as a dated
record note under Revisit #4 plus a third Amendments-header entry in ADR-0010
(the trigger body's at-authoring exemplar phrasing — "`analysis-ledger`,
`analysis-config` in the services layer" — is left as historical phrasing
per ADR-0005 Rule 6; the new directory reality is carried in the dated note,
not by rewriting the trigger prose).

## Probe-before-trust (ADR-0011 Rule 3 — measure the rule has teeth)

After deleting `REACTIVE_STATE_EXEMPTIONS` and making the boundary
directory-structural, two scratch probes verified the rule behaves as
claimed. Both were scratch SFCs under `src/components/`, removed before any
commit.

- **Probe (a) — a component value-importing an effectful service must still
  fail.** `__probe_service_import.vue` with
  `import { analysisService } from '../services/analysis-service'`. Observed:
  `npx eslint` reported **1 error** —
  `'../services/analysis-service' import is restricted from being used by a
  pattern. Components are thin renderers: src/services/** is deny-by-default
  … The reactive-state modules live in src/state/** …`
  (`@typescript-eslint/no-restricted-imports`). The rule fired with the
  updated message. ✓
- **Probe (b) — a component importing from `src/state/` must pass.**
  `__probe_state_import.vue` with
  `import { ledger } from '../state/analysis-ledger'`. Observed: `npx eslint`
  exit **0**, zero findings. ✓

Both scratch files removed; `git status` confirms no probe artifact in the
tree.

## Verification (the commissioned gates, run from `frontend/`)

- `npm ci` — clean (added 335 packages; one pre-existing high-severity audit
  advisory, unrelated to this change).
- `npm run build` (`vue-tsc -b && vite build`) — **passes**; vue-tsc zero
  errors, 1058 modules transformed, vite built.
- `npx eslint .` — **exit 0**, zero findings (all eight custom rules; no new
  casts ⇒ no new justification-adjacency surface).
- `npm run test:run` — **978 passed / 4 skipped** (68 files passed / 3
  skipped), exit 0.

## Documentation audit (umbrella checklist)

- **`frontend/FILES.md`:** the three entries moved out of the `services/`
  section into a new `state/` section (band tags preserved `[B3]`); the
  `state/` directory line names the relocation and the ADR-0010 rationale.
  The `analysis-config.ts` line was enriched (it had been a thin "Palette
  compile + ledger hash") to name it the sole `RawKey`/`EnrichedKey` factory,
  matching the IDENTIFIERS cross-reference.
- **`frontend/IDENTIFIERS.md`:** the one path-prefixed cite (`RawKey` /
  `EnrichedKey` lead-in, `services/analysis-ledger.ts`) and the
  `deriveAnalysisKeys` construction-site cites in the `RawKey` / `EnrichedKey`
  rows updated to `state/analysis-config.ts`; the two representation-cost
  prose cites (`analysis-ledger.ts:23`, `stability-trajectory-store.ts:46,52`)
  re-prefixed to `state/`. **Line-number drift not corrected:** those `:N`
  cites were already approximate at HEAD (e.g. `analysis-ledger.ts:23` points
  at a header comment, `:46` at an import) — that drift predates this arc and
  the `git mv` did not shift line numbers (the only content change was the
  pathname-header line, no line added/removed), so per ADR-0004 minimal-touch
  I corrected the *directory* the cites point at, not the pre-existing
  line-number staleness (out of this arc's scope; `not-filed: pre-existing
  IDENTIFIERS.md line-number drift on the moved-file cites, predates this
  arc, accrues on the next touch of those rows`).
- **`frontend/CLAUDE.md`:** the "Architectural shape" layering list gained a
  **State** bullet (`src/state/*`); the "Tension with ADR-0010 read-locality"
  paragraph updated to describe the directory-structural reality with a dated
  marker (preserving the unresolved-collapse framing); the keyed-cache bullet's
  `deriveAnalysisKeys` cite re-pathed `src/services/` → `src/state/`.
- **`frontend/eslint.config.js`:** `REACTIVE_STATE_EXEMPTIONS` deleted; the
  pattern group reduced to `['**/services/**']`; the message rewritten to say
  the reactive-state modules live in `src/state/**` (importable); the header
  narrative gained a dated step-(b) note in the at-adoption historical style
  (the step-(a) reactive-state paragraph is preserved as the historical
  record of the exemption mechanism, exactly as the App.vue paragraph was
  preserved when its discharge note was appended); the components-block
  comment updated to "fall outside this glob by location, not by exemption."
- **`docs/wire-schemas.md`:** three living code pointers (a *navigation aid*
  by its own header, "relations not content snapshots" per ADR-0005 Rule 3)
  re-pathed `frontend/src/services/` → `frontend/src/state/` for
  `analysis-config.ts` (producer) and `analysis-ledger.ts` (×2,
  consumer/merge).
- **`docs/handoff-current.md`:** a minimal `src/state/*` note added beside
  the Services bullet so the orientation snapshot isn't silently wrong about
  where the reactive-state modules live.
- **`docs/adr/0010-…md`:** Revisit #4 dated record note + third
  Amendments-header entry (the determination above).
- **Source-file JSDoc cross-references:** four prose `services/X` cites in
  non-moved source files touched under full visibility, now inaccurate, were
  corrected to `state/X` (`src/types/ids.ts`, `src/engine/katago/types.ts`
  ×2, `src/lib/unhandled-rejection-backstop.ts`).
- **Capture-moment documents left untouched (deliberate):** the remaining
  live-tree `services/{module}` references all sit in **dated capture-moment
  records** — worklogs (incl. the step-(a) worklog, `2026-05-15-*`,
  `2026-06-10-*`, `2026-06-11-unhandledrejection-backstop`), postmortems
  (`postmortem-adaptive-deeper-enrichment-2026-05`), audits
  (`audit-spa-history-lessons-2026-06-10-*`, `audit-adr-corpus-2026-06-10*`),
  and consults (`opus-consult-2026-06-08-ledger-keying-typeful-defense`,
  `opus-consult-2026-06-05-board-scope-exhaustiveness`). These record the
  world as it was when written (modules in `src/services/`); rewriting their
  paths would falsify the capture, the same convention that forbids editing
  `docs/archive/`. Left as-is on purpose; named here rather than silently
  swept. (`docs/archive/` was not touched.)
- **`FEATURES.md` / `frontend/README.md`:** internal refactor, no user-facing
  change, no reference to the moved files or the deleted constant — no edit.
- **Work-status store:** read-only for this worker (no write access). The
  item stays as the maintainer left it; closure is the coordinator's call on
  merge. No SQL staged. Proposed filings are listed in the PR / report for
  coordinator curation.
- **Doc-graph:** this worklog is a new node, and FILES.md / CLAUDE.md /
  IDENTIFIERS.md / ADR-0010 / handoff / wire-schemas cross-references changed
  — a structural doc change. Regenerated via `node tools/doc-graph/generate.mjs`
  in the same change; the regenerated artifacts are committed.

## Deviations from the item text / named sources

None material. The item text's enumeration matched the live
`REACTIVE_STATE_EXEMPTIONS` set exactly, so the population-by-predicate
clause produced the same three modules. Two scope judgments worth surfacing
(neither a deviation, both within the doc-discipline the item invokes):

1. The item enumerated FILES.md / IDENTIFIERS.md / CLAUDE.md and "the live
   doc tree." I extended the doc edits to `docs/handoff-current.md` (a small
   orientation note) and to four source-file JSDoc cross-references, on the
   umbrella checklist's "does any cross-reference now describe its target
   inaccurately" clause — both are now-inaccurate pointers this arc created.
2. I left IDENTIFIERS.md pre-existing line-number drift uncorrected (filed as
   a `not-filed:` marker above) rather than widening into a line-number sweep
   the move did not cause (ADR-0004).

## Deferrals / residue (ADR-0005 Rule 10)

- Pre-existing IDENTIFIERS.md `:line` drift on the moved-file cites →
  `not-filed: pre-existing IDENTIFIERS.md line-number drift on the moved-file
  cites, predates this arc, accrues on the next touch of those rows`.
- The ADR-0010 Revisit #4 trigger stays **live** (collapse-into-one-principle
  unresolved) — this is the ADR's own open question, already a tracked
  trigger, not a new deferral; recorded in the ADR's dated note, no new
  marker needed.
- The unit test for the relocated config module stays under
  `tests/unit/services/` (the test file did not move; its subject did) →
  `not-filed: tests/unit/services tier-directory naming for relocated state
  modules — cosmetic, rename on the next touch of that test`. (Added at
  gate discharge, 2026-06-11 — the out-of-frame review surfaced it.)

## Out-of-frame review

This arc has >1 writer touching the import-boundary lint and a shared
directory-structural rule; an out-of-frame hack-rationalization pass is owed
before merge per the campaign discipline (coordinator-owned merge gate →
`not-filed: coordinator out-of-frame HRA merge-gate, not item-shaped`). This
worklog's in-frame reasoning does not discharge it.

License: Public Domain (The Unlicense).
