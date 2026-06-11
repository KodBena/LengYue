# Worklog — cast-justification-adjacency stage 2 burndown (2026-06-11)

> Delivery record for stage 2 of `cast-hygiene-lint` (work-status item
> `cast-justification-adjacency-stage2`): the custom local ESLint rule
> `justification-adjacency` mechanizing `frontend/CLAUDE.md`'s "an `as`
> needs a justification or it doesn't ship" prose discipline, its full
> cast-population burndown, and the two riders the item carried. Branch
> `bork/tooling/cast-stage2-burndown`; the per-rule rationale and
> measure-first adoption records live in `frontend/eslint.config.js`'s
> header (the operational register, ADR-0011 Rule 3). This worklog carries
> the category-level triage table and the recorded tests-lint scope
> question per the item's rider (b).

## The rules

- **`justification-adjacency`** (local rule #5,
  `frontend/eslint-rules/justification-adjacency.js`). Every coercion cast
  — a `TSAsExpression` (`x as T`) or `TSTypeAssertion` (`<T>x`), excluding
  `as const` and the inner hop of a double cast — must carry an adjacent
  justification: a same-line trailing comment, a comment on the line
  directly above, or an `eslint-disable-*-line ... -- reason` hatch (the
  `vue/no-v-html` escape model). Template-expression casts in `.vue` are
  covered via the vue-eslint-parser templateBody token store; the
  template-cast justification carrier is an inline `/* reason */` block
  comment (an HTML `<!-- -->` comment is markup, not a JS token, so it does
  NOT justify — a named gap). Adopted at `error`.

- **`hand-rolled-path-walk`** (local rule #6, rider (a),
  `frontend/eslint-rules/hand-rolled-path-walk.js`). A shape predicate: a
  loop whose body BOTH accumulates an array (`push`/`unshift`) AND walks the
  `.parent` chain is a hand-rolled root-to-X path derivation. Outside the
  named branded producers in `engine/navigator.ts` (`getPath`,
  `rootToCurrentPrefix`) / `engine/util.ts` (`getActiveVariationPath`) — a
  `{file → fn-name}` allowlist, not a blanket file ignore — it is reported.
  Adopted at `error`.

Both probe-verified to fire on their literal shapes (ADR-0011 Rule 3).

## Measure-first baseline (2026-06-11, AST-grade scratch run over src/)

The staging census at PR #379 (recorded in the eslint.config.js header) was
412 script + 37 template = the stage-2 target; the tree drifted since. The
re-measured baseline at this change:

| Metric | Count |
| --- | --- |
| Coercion casts (target population) | 405 |
| — script side (.ts + .vue `<script>`) | 368 |
| — template side (.vue `<template>` expressions) | 37 |
| `as const` (excluded — narrows, doesn't coerce) | 58 |
| `as unknown as` double-casts (the brand-strip ratchet shape) | 27 |
| **Unjustified at baseline (rule fires)** | **321** (284 script + 37 template) |
| Already justified (pass free) | 84 |

The 37 template casts were the population the audit's `.ts`-only sample
never measured (history-lessons audit §8); all 37 were unjustified at
baseline (the prose rule never reached them).

## Burndown triage (per-category counts, not per-site prose)

The 321 unjustified casts (321 → 0 outside the two frozen migration files):

| Category | Casts | Resolution |
| --- | ---: | --- |
| (a) Deletable via sound typing | ~16 | Deleted. The 25 `RegistryEditor.vue` template `key as string` casts collapsed into a typed `entries` computed over `Object.entries` (one sound seam); `row.id as GameSourceId` at 5 sites where the row's id was already `GameSourceId`; `currentNodeId as NodeId` / `color as 'B'\|'W'` / `moveFilterExpression as string` / `card.id as CardId` / `r.value as PipelineStageWithHoles[]` / `activeBoardId as BoardId\|null` (→ `?? null`) — all already those types. Dropped now-unused imports. |
| (b) Band-boundary casts (ACL / decode frontier) | ~120 | Justified naming the band character. ACL Band-2 brand mints (`raw.id as CardId`, `wire.id as GameSourceId`, NIL-UUID `ProfileId`/`SessionId`, `KnobId`/`NavNodeId`/`MetricId`/`RawKey`/`EnrichedKey` factory mints); decode-frontier open-record probes after a runtime `typeof === 'object'` check (a `prop()` helper collapsed the repeated `(x as {k?:unknown}).k` spelling in encoder.ts); `Object.keys(record) as Brand[]` re-brands at the documented "Category C" TS limitation (IDENTIFIERS.md NodeId row). |
| (c) Genuinely-needed casts | ~155 | Justified plainly. DOM event-target narrows (`e.target as HTMLInputElement` — bound-element rationale); ECharts tuple-literal fixes (`[a,b] as [number, number\|null]`) and loose-param narrows; readonly-ref / ReadonlySet shape coercions; literal-union → `string[]` membership widenings; inferred-literal seed casts; union-branch narrows guarded by a discriminator. |
| (d) `as unknown as` double-casts (27) | 27 | Each either a brand mint/strip or a structural-mismatch widen, justified naming why the double hop. The CardId/GameSourceId brand-strips (the documented **IDENTIFIERS.md erosion (b)** sites in useCardTreeData / useMinting / ForestDirectory) named explicitly as maintainer-directed re-brand-helper debt — justified in place, not refactored (the IDENTIFIERS.md note: "documented, not yet fixed … not a licence to refactor"). |
| Frozen migration files (config-exempted) | 68 | 63 in `archived-migrations.ts` + 5 in `migrations.ts`. Exempted at config level via `FROZEN_MIGRATION_FILES`: the migration-body freeze (rolling-archive / append-only invariant — "a migration is a contract with the persisted-blob population, not a refactor target") overrides the justification edit. A directive tension surfaced per the eslint header's rule-rationale discipline; the freeze wins. |

Adopted at `error` on a fully-triaged baseline (ADR-0011 Rule 3). The work
shipped in 8 logical commits (rule + per-file-group burndown chunks +
adoption), each typecheck-clean.

## Rider (a) — hand-rolled-walk lint

Measured 3 hits (the shape is specific enough that the conjunction
accumulate-AND-walk-parent isolated exactly the path derivations; the
non-accumulating count/find parent walks at StatusBar / PlayEngineModal /
BoardWidget's place-count loop are correctly NOT flagged):

| Site | Character | Disposition |
| --- | --- | --- |
| `useActivePath.ts:17` | **Dead** — zero consumers at HEAD; returns bare `string[]`, re-derives `getPath` exactly | Annotated inline exemption; route through `getPath` OR delete (maintainer-directed — deletion needs the FILES.md cut). |
| `BoardWidget.vue:209` (`moveNumbersByCoord`) | Render-coupled computed (ADR-0010) over a `toRaw` snapshot | Annotated inline exemption; route through `getPath` in the path-consolidation arc (the reactivity shape is load-bearing). |
| `useTreeExpansion.ts:79` (`ensureVisible`) | The ADR-0010 nav-cost perf guard; collects the strict-ancestor slice | Annotated inline exemption; derive the ancestor slice from `getPath` in the path-consolidation arc. |

All three are behaviour/perf-sensitive to refactor through `getPath`, so the
rule adopted at `error` on a fully-triaged baseline with the 3 as annotated
inline exemptions (the `vue/no-v-html` named-as-debt model), each naming the
revisit trigger. The rule guards against NEW hand-rolled walks (it caught all
3 and the producers' own walks stay exempt by the `{file → fn-name}`
allowlist). NOT a recorded decline — the AST shape proved clean enough to
deliver, per ADR-0011 Rule 2's escape (the escape was available but
unneeded).

## Rider (b) — tests-outside-typecheck gap

The 4 fixture `as any` in `tests/integration/hydration-knowntags.test.ts`
(`profile: {...} as any` ×2, the wrapping `... as any` ×2) are **fixed
soundly**: a single typed `remote()` helper over a `RemoteBlob` deep-partial
type (`Partial<Omit<GlobalStore,'profile'>> & { schemaVersion?; profile?:
Partial<ProfileState> & { knownTags? } }`) replaces all four, with ONE
justified `as` at the deep-partial → declared-parameter seam. The field names
the tests assert on (`username`, the legacy-dead `knownTags`) now type-check.
The test still passes (3/3).

**Recorded — the tests-lint scope question (not implemented).** The root
cause these fixture defects exposed: `tests/**` is OUTSIDE both lint surfaces
(the eslint `ignores` block excludes it) AND the `vue-tsc` surface
(`tsconfig.app.json` includes `src/` only; vitest does not typecheck), so
interface-violating fixtures escape both nets — which is how these four
survived (the item notes "fixture defects escaped vue-tsc twice in one day").

Measured numbers for the scope decision:

- `tests/**` `as any` occurrences at this change: **4** (all in
  hydration-knowntags.test.ts, now fixed) — re-measured `grep -rn "as any"
  tests/` returns 0 after this change.
- Extending the lint surface to `tests/**` is the **later-step deferral
  already standing** in the eslint.config.js header ("`tests/` is ignored for
  now … extending lint to tests is a later step"). It **interacts with the
  e2e console-policy deferral** also recorded there: the header notes that
  linting `tests/` "surfaces anticipatory `no-console` disable directives in
  the e2e harness that await a console-policy call" — so a tests-lint
  adoption cannot land the import-boundary / cast rules on `tests/**` without
  either resolving that console-policy call first or scoping the tests-lint
  config to exclude the e2e harness's anticipatory disables. Both deferrals
  are named here so the tests-lint arc, when scheduled, inherits the full
  picture rather than re-discovering the interaction.
- The narrower alternative — extending the `vue-tsc` typecheck surface to
  `tests/**` (a `tsconfig.test.json` or widening `include`) — would have
  caught these four at compile time without the lint-surface / console-policy
  entanglement, and is the more targeted fix for THIS defect class (fixtures
  violating production interfaces). Recorded as the candidate, not
  implemented (it is its own scoped decision: vitest's transform vs a
  separate typecheck pass, and the `import.meta.env`/`import.meta.hot`
  Vite-type-env wiring tests would need).

No work-status item filed for the tests-lint / tests-typecheck scope
question (per ADR-0005 Rule 10, this is a not-filed deferral marker — the
maintainer decides whether it warrants an item; the measured numbers and the
two interacting deferrals are recorded here as the decision input).

## Rule-design decisions

- **Adjacency is line-based, strict (`linesBefore: 1`).** A comment one line
  above justifies only the immediately-following cast; for a block of N
  consecutive casts sharing one rationale, each takes its own same-line note.
  Verbose, but it is the precise "justification AT the cast" discipline; a
  wider window would let an unrelated statement's comment justify a cast
  several lines down. A SAME-LINE trailing comment of a PREVIOUS statement is
  excluded from counting as the next cast's leading comment (the
  `gate-prop-needs-default` precedent — a true leading comment's preceding
  token ends on an earlier line).
- **Quality is not judged.** Any non-empty adjacent reason passes; policing
  that a justification is SOUND (names the band character) is review-shaped,
  the ADR-0011 Rule-5 calibration — a gate there would be miscalibrated.
- **Template coverage via the templateBody token store.** A plain rule
  visitor sees script casts only (measured); the template assertion nodes are
  reachable via `defineTemplateBodyVisitor`, and the adjacency scan is
  parameterised on the token store (`sourceCode` for script, the template
  store for template) so an inline block comment resolves in both.
- **hand-rolled-path-walk keys on shape, exempts producers by
  `{file → fn-name}`.** Not a file ignore — a new hand-rolled walk added to
  `navigator.ts` under a different name is still flagged (ADR-0011 Rule 4
  deny-by-default-with-named-exemptions).

## Verification

- `npm run build` — exit 0.
- `npx eslint .` — exit 0 (both new rules at `error`, fully-triaged baseline).
- `npm run test:run` — 917 passed, 4 skipped (pre-existing), 0 failures.
- Both rules probe-verified to fire on their literal shapes.
