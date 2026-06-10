# Worklog — cast-hygiene lint, stage 1: the any-assertion ban (2026-06-10)

> Audit trail for work-status item `cast-hygiene-lint`, executing
> **stage 1** of §3.10 of the 2026-06-10 history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`) plus the
> stage-2 baseline measurement; branch `bork/tooling/cast-hygiene-lint`,
> PR #379. Stage 2 — the justification-adjacency rule for all coercion
> casts — is measured here but deliberately **not** adopted (the
> `a75814c` measure-first pattern); its staging record lives in the
> `frontend/eslint.config.js` rationale header.

## The change

The cast-justification rule has been prose only (`frontend/CLAUDE.md`
"Type-driven design": *a type assertion (`as`) needs a justification in
a comment or it doesn't ship*), and the audit measured it holding at
~50% in a 32-of-224 `.ts` sample — the L1 lesson (prose disciplines
decay; mechanisms stick). Stage 1 mechanizes the worst corner: an
ESLint ban on assertions whose target type is `any`.

**Mechanism** — `no-restricted-syntax` selectors (the G1
message-reparse precedent), *not* `@typescript-eslint/no-explicit-any`:

- `no-explicit-any` bans every `any` (annotations, generics, type
  arguments — 109 occurrences at this change), which is the recorded
  warn-as-backlog deferral in the config header, not a clean gate.
  Stage 1's target is the **assertion-position** subset only — the
  shape that actively erases a checked type at a seam — and a selector
  expresses exactly that subset, adoptable at `error` on a
  fully-triaged baseline per the config's established posture.
- Two selectors, shared between the script side (core
  `no-restricted-syntax`, appended to the G1 block's array — flat
  config replaces a rule's entry per file rather than merging, so a
  second block for the same files would have silently dropped the G1
  selectors) and the template side (`vue/no-restricted-syntax`, a new
  block — the core rule walks the script AST only):
  `:matches(TSAsExpression, TSTypeAssertion) > TSAnyKeyword` (bare
  `as any` / `<any>x`) and the same with `> TSArrayType >` (`as any[]`
  — the same per-element erasure and the cheapest circumvention).
- Named gaps, per ADR-0002 and the G1 posture: deeper any-bearing
  composites (`as Record<string, any>`, double-casts through
  `unknown`) and annotation-position `any` are not caught — owned by
  stage 2 and the no-explicit-any deferral respectively.

**Escape hatch** — the established `vue/no-v-html` model: inline
`eslint-disable-next-line` + a justification naming the scope of
unsafety and, when the cast sits on an ADR-0003 band boundary, the
band character (the item's fork reshape: the justification inventory
doubles as the fork's seam map).

## Measured baseline and per-site decisions

At HEAD the any-targeted assertion population in `src/` was **12 code
sites** (11 bare + 1 `as any[]`), not the audit's ~13 — one site
(`resource-service.ts`'s `<any>` fetch) had already been retired by the
R1 `resource-service-calibration-seam` arc. Plus two comment-only
mentions (not code) and 4 sites in `tests/` (below). Every site:

| Site | Shape | Decision |
|---|---|---|
| `engine/sgf-loader.ts:76,77` (`id`/`parent`) | string → NodeId via `as any` | **Fixed** — single justified brand mint at the id-construction site (`('node-'+uuid()) as NodeId`, justification names the ADR-0003 band character: Band 3 loader minting the Band 2 `NodeId` brand), threaded through `transform`/`hydrate` signatures |
| `engine/sgf-loader.ts:89` (`children.push`) | string → NodeId via `as any` | **Fixed** — same threading; the push needs no cast once `transform` returns `NodeId` |
| (consequence) `sgf-loader.ts:37,40,41` | `as unknown as BoardState[…]` | **Dropped as dead** — the brand threading makes the three double-casts unnecessary; the `BoardState['id']` mint at `:36` stays (different brand, existing justification) |
| `engine/katago/katago-client.ts:133` | `KataGoActionQuery as any` into `subscribe(KataGoAnalysisQuery)` | **Fixed** — widened `subscribe` to the full `KataGoQuery` union; both variants carry `id`, and `sendRaw` already took the union. The unused `KataGoAnalysisQuery` import dropped (`noUnusedLocals`) |
| `services/analysis-service.ts:131` | `settings.engine as any` | **Fixed** — vestige: `AppSettings` declares `engine.katago.url`; same file reads it uncast elsewhere. The defensive `?.` chain retained (guards a partially-hydrated legacy profile at runtime) |
| `services/analysis-service.ts:494` | `(board as any).maxVisitsTarget` | **Fixed** — vestige: `BoardState.maxVisitsTarget?: number` exists (`types.ts:282`) |
| `composables/review/useReviewSession.ts:262` | `parsedBoard.id = bId as any` ("Retain the tab ID") | **Fixed** — both sides are `BoardId`; plain assignment, matching the already-clean sibling at `loadIntoBoard.ts:55` |
| `components/editors/CardSetEditor.vue:127` | `(next[id] as any)[field] = val` | **Fixed** — generic key parameter `<K extends keyof CardSet>(field: K, val: CardSet[K])`; the keyed write typechecks |
| `components/editors/PaletteEditor.vue:305` | `(p as any)[field] = val` | **Fixed** — same generic-K shape over `AnalysisPalette` |
| `components/charts/BaseChart.vue:459` | `s.data as any[]` | **Removed as any→any vestige** — `s` is already `any` (`props.series: any[]`, annotation-class, the no-explicit-any backlog), so the cast added nothing. One `.find` callback gained an explicit `(d: any)` annotation (the cast had been supplying the contextual type), staying in the same recorded backlog class |
| `main.ts:16,17` | `(window as any).store` / `.Writer` | **Kept + annotated disables** — DEV-only untyped console debug handles (ADR-0002 Rule 2 interop allowance). A `declare global` Window augmentation was considered and rejected: it would advertise the debug fields tree-wide as typed surface. Not a band boundary — `window` is outside the band vocabulary. Note: the line-level disable also suppresses the G1 selectors on those lines (same rule name); the lines contain no message-reparse surface |

Adoption: after the fixes the selectors measure **0 un-disabled hits**
(the 2 main.ts disables are the triaged remainder) ⇒ `error`, per the
config's zero-or-fully-triaged posture. Template side: **0 hits** at
adoption (clean gate). A fail-loud probe (scratch edits, reverted,
never committed) verified all four shapes fire: bare `as any`,
`<any>x`, `as any[]` in script (core rule), and `as any` in a
`<template>` expression (`vue/no-restricted-syntax`).

### Stage-2 baseline (measured, not adopted)

AST-grade scratch-config run over `src/` (the scratch config was
deleted before commit; numbers recorded in the eslint.config.js
header's staging record): 431 → 416 script-side `as`-assertions
(pre→post stage-1 fixes), **37 template-side** (the population the
audit's `.ts`-only sample never measured; 0 any-targeted), 56
`as const` (excluded — const assertions, not coercions), leaving a
stage-2 target of 412 → 397 coercion casts; 28 → 25 `as unknown as`
double-casts (the brand-strip shape, the audit's named follow-on
ratchet target). `no-explicit-any` re-measured at 109 (the header's
~152 was a stale census). The header's staging record explicitly
names the **re-opening of the no-explicit-any deferral** (ADR-0002
Rule 6: the deferral paragraph stands untouched as the historical
record; the staging record amends by appending).

### The R1 lead (tests outside the typecheck surface) — confirmed

Confirmed at HEAD: `tsconfig.app.json` includes `src/**` only and no
tsconfig reference covers `tests/`, so `vue-tsc -b` never sees test
files, and vitest does not typecheck — which is how
interface-violating fixtures survive. Measured: **4 bare `as any` in
`tests/`**, all in `tests/integration/hydration-knowntags.test.ts`
(fixture objects cast into store shapes). **Decision: not extended in
this arc.** `tests/**` is globally ignored in the lint config behind
its own recorded deferral ("extending lint to tests is a later step",
named in the config header for the e2e console-policy reason), and
un-ignoring it for one rule means restructuring the ignores and
adjudicating that unrelated deferral — not the deferral this
commission re-opens, and not minimal-touch (ADR-0004). The gap is
recorded in the header's staging record so the tests-lint later step
inherits it with numbers attached.

## Deviations from the item description

Two small ones, both measurement drift rather than substance:

1. **~13 → 12 sites.** One of the audit's sites was retired by the R1
   resource-service arc before this worker ran; re-measured at HEAD
   per the commission.
2. **`eslint.config.js:134-138` → `:173-176`.** The no-explicit-any
   deferral text had moved (PR #378's header growth); content
   unchanged, so the spec held.

## Documentation audit

- **Work-status store:** read-only for this session per the
  commission; the item stays `open` (stage 2 outstanding; closure is
  the maintainer's call). No SQL staged — the item's text already
  scopes stage 2.
- **frontend/IDENTIFIERS.md:** construction-site moves updated per the
  doc's same-PR cadence — the `NodeId` row now cites the
  `sgf-loader.ts:73` justified mint (formerly the `:68` + bare-any
  trio), and the `BoardId` row's "strip the brand to retain a tab id"
  erosion example is recorded as resolved (both cited sites are clean
  assignments now; the `useDirtyBoardGuard.ts:124` citation had itself
  drifted — the code lives at `loadIntoBoard.ts:55` and was already
  fixed). Two census drifts found and corrected with provenance: the
  `as NodeId` count (recorded 32, actually 34 at HEAD, 35 after the
  loader mint) and the `useReviewSession.ts:312,323` line refs (now
  `:302,313`).
- **frontend/CLAUDE.md:** the prose rule ("an `as` needs a
  justification or it doesn't ship") stays accurate — stage 1
  mechanizes a subset of it; no edit.
- **FILES.md / FEATURES.md / handoff:** no files created, moved, or
  deleted; no band changes; no user-facing change; no orientation
  change.
- **ADR Revisit-when triggers:** none fired (checked ADR-0002,
  ADR-0003 — both read end to end this session).
- **Doc-graph:** this worklog is a new node — regenerated via
  `node tools/doc-graph/generate.mjs` in the same change.

## Verification

`npm install` + `npm run build` green (vue-tsc + vite); `npx eslint .`
exit 0; `npm run test:run` 865 passed / 4 skipped (52 files passed /
3 skipped) — identical to the pre-change baseline. The probe runs were
scratch-only and reverted before any commit.

License: Public Domain (The Unlicense).
