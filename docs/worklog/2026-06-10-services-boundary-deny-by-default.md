# Worklog — component→services import boundary inverted to deny-by-default (2026-06-10)

> Audit trail for work-status item `services-boundary-deny-by-default`,
> executing §3.11 **step (a)** of the 2026-06-10 history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`); branch
> `bork/tooling/services-boundary-deny-by-default`. Step (b) — the
> `state/` relocation of the reactive-state modules — is a separate
> sign-off arc and is deliberately not started here. This item is also
> the work-status record ADR-0010's Revisit-when #4 had lacked.

## The change

The component-layer service-import rule in `frontend/eslint.config.js`
was an enumerated blocklist of four effectful singletons
(backend-service, library-service, analysis-service,
analysis-persistence-service). The audit verified it was incomplete
from day one — sync-service, qeubo-service, api-client, and
resource-service all predate the list and were never on it (an
authoring-time omission, not post-hoc drift) — and fail-open by shape:
a new service module was importable from components until someone
remembered to enumerate it.

Inverted: everything under `src/services/**` is now restricted from
the component layer, with two deliberate exemption classes.

- **`REACTIVE_STATE_EXEMPTIONS`** — one named constant carrying the
  reactive-state class `{analysis-ledger, analysis-config,
  stability-trajectory-store}` as gitignore-style `!` negations. Its
  comment marks it as the **provisional form of a future `src/state/`
  directory**: step (b) relocates the modules out of `services/**`,
  the boundary becomes purely directory-structural, and the relocation
  arc reduces to deleting the constant. Membership is the
  reactive-state *class*, not "whatever some component reads today" —
  `stability-trajectory-store` has no component reader at adoption but
  belongs to the class.
- **Type-only imports** — the rule moved from the base
  `no-restricted-imports` to `@typescript-eslint/no-restricted-imports`
  for its `allowTypeImports` option: an `import type` is
  compile-time-erased and carries no runtime effect coupling, so it
  sits outside the layering tenet's target (effect orchestration).

Composition mechanics: the component block now configures a
*different rule name* than the wire-type block, so the base rule's
wire-type pattern applies to component files un-replaced — the
historical re-statement of `WIRE_TYPE_PATTERN` in the component block
(needed when both blocks configured the same rule name, which
replaces rather than merges) is gone. The block registers `tsPlugin`
itself because flat-config plugins resolve per matched file and the
existing type-checked block registers it for `src/**/*.ts` only (the
component block also matches `.vue` files); same plugin object, so no
flat-config conflict.

## Adjudications recorded (each named in the config's rationale)

1. **analysis-bundle classification.** Classified by what its header
   declares: *pure projection / replay between the AnalysisLedger and
   the persistence wire shape; no side effects, no network.* Not an
   effectful singleton — but not a reactive leaf-read source either,
   so it is deliberately **not** in `REACTIVE_STATE_EXEMPTIONS`: a
   value import of projection logic from a component is still
   logic-in-a-component. Its one component consumer
   (`AnalysisControls.vue:17`) needs only the
   `AnalysisBundleStorageError` *type* (a structural union narrowed by
   field checks at `AnalysisControls.vue` `isStorageError`, no
   `instanceof`, so no value import is latent), which
   `allowTypeImports` admits.
2. **The App.vue gap — widened, with an annotated wiring-file
   exemption.** The layering tenet covers `src/App.vue` explicitly
   ("Components (`src/components/*`, `src/App.vue`) … No direct
   service calls") but the prior glob covered `src/components/**`
   only, and `App.vue` imports `analysisService` today. Of the two
   sanctioned options (widen, or name the gap), widening proved
   proportionate: one files-glob entry plus one annotated inline
   `eslint-disable` at the single standing import. The annotation
   names it honest layering debt — a wiring-file exemption, not a
   sanctioned pattern; extraction of the orchestration is out of this
   arc's scope; a *second* service import in App.vue still trips the
   rule and needs its own adjudication.
3. **Census header refreshed** (the four-components claim, stale since
   `35c939c`, 2026-06-01) using the "at adoption … resolved"
   historical phrasing the no-floating-promises entry models: four
   components / five sites at the blocklist's adoption, all resolved
   2026-06-01 (routed through composables — useCardMetadata,
   useForestStats, useLibraryPreview, useAnalysisPersistence; commit
   `35c939c`); the inversion's own measured baseline appended in the
   same historical register. Round 1's A6 deliberately left
   `eslint.config.js` untouched; the census fix was assigned to this
   arc.

## Measured baseline (the `a75814c` measure-first pattern)

The inverted rule ran over the tree **before** severity was picked and
before any annotation existed. Every hit and every deliberately
admitted near-miss:

| Site | Import | Result | Decision |
|---|---|---|---|
| `src/App.vue:30` | `analysisService` (analysis-service) | **hit** (the only one) | exempt-with-annotation — wiring-file exemption, inline disable + justification |
| `BoardTab.vue:14,16` | `ledger`, `activeAnalysisKeys` | no hit | reactive-state class, `REACTIVE_STATE_EXEMPTIONS` |
| `BoardWidget.vue:17,18` | `ledger`, `activeAnalysisKeys` | no hit | reactive-state class |
| `ToolbarEngineMetrics.vue:21,22` | `activeAnalysisKeys`, `ledger` | no hit | reactive-state class |
| `AnalysisControls.vue:15` | `ledger` | no hit | reactive-state class |
| `AnalysisControls.vue:17` | `import type { AnalysisBundleStorageError }` | no hit | `allowTypeImports` (analysis-bundle classification above) |

Baseline = 1 hit, fully triaged ⇒ the rule adopts at **`error`**,
matching the config's established zero-or-fully-triaged posture.

A fail-loud probe (scratch edits, reverted, never committed) verified
the inversion has the teeth the blocklist lacked: a `syncService`
value import in a component — a module the old list never carried —
fires; an `analysis-bundle` *value* import fires; the same module's
*type* import passes; an `analysis-ledger` value import passes.

## Deviations from the item description

None. The description proved accurate at HEAD: the blocklist and the
stale census sat where it said (`eslint.config.js` pattern block and
header census), `App.vue:30` carried the `analysisService` import,
and `AnalysisControls.vue:17` carried the type-only import.

## Documentation audit

- **Work-status store:** read-only for this session per the
  commission; the item stays `open` (step (b) outstanding, and
  closure is the maintainer's call on merge). No SQL staged — the
  item's text already scopes step (b).
- **frontend/CLAUDE.md and ADR-0010 Revisit #4, checked
  deliberately:** both describe the seam as "effectful service
  singletons restricted in components; reactive-state modules exempt"
  — the inversion preserves and strengthens exactly that split, so
  the prose stays accurate without edits. The parenthetical
  `(analysis-ledger, analysis-config)` exemplars in both are
  exemplars, not an exhaustive register; the class's canonical
  enumeration now lives in `REACTIVE_STATE_EXEMPTIONS`. Revisit #4
  itself has not *fired* (no case the split cannot classify
  appeared); this item is the work-status record the trigger's text
  had lacked, per the audit.
- **FILES.md / IDENTIFIERS.md / FEATURES.md / handoff:** no files
  created, moved, or deleted; no new brands; no user-facing change;
  no orientation change.
- **Doc-graph:** this worklog is a new node — regenerated via
  `node tools/doc-graph/generate.mjs` in the same change. One
  environment wrinkle, named rather than silently absorbed: the first
  regeneration ran in an isolated git worktree where the gitignored
  backend data directory does not exist on disk, so the report
  snapshot transiently gained a false "directory missing" line for a
  frozen playbook's directory-ref (the generator's dir-ref scan is
  disk-coupled; deliberately excluded from the committed manifest and
  the freshness gate for exactly this reason). The directory was
  recreated in the worktree and the artifact regenerated, so the
  committed snapshot carries no worktree disk-state artifact.

## Verification

`npm install` + `npm run build` green (vue-tsc + vite); `npx eslint .`
exit 0; `npm run test:run` 865 passed / 4 skipped (52 files passed /
3 skipped). The probe runs above were scratch-only and reverted
before any commit.

License: Public Domain (The Unlicense).
