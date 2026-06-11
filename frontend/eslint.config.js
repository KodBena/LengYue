/**
 * eslint.config.js
 *
 * Flat-config ESLint host for the frontend SPA. Deliberately NOT the
 * eslint-plugin-vue "recommended" preset — enabling the broad recommended
 * set would surface hundreds of pre-existing style findings and bury the
 * signal. This config carries a small, targeted, high-value ruleset and
 * grows as the discipline matures (per ADR-0010's "Revisit when").
 *
 * Rule-rationale discipline: every rule here carries a rationale. The
 * impedance a rule imposes is NOT the code's to absorb — code is the fluid
 * ether that fills whatever gaps the architectural discipline (the
 * ADRs/tenets) and the project's concrete ambitions carve out; it conforms
 * freely and is never itself the thing in tension. The real impedance is
 * reasoning under possibly-contradictory DIRECTIVES: a rule can rest on one
 * sound rationale (e.g. CLAUDE.md's layering tenet) while another sound
 * directive on independent grounds (e.g. ADR-0010's read-locality) pulls
 * the other way. So a rationale must name not only why the rule exists but,
 * where directives meet, which ones are in tension and whether they are
 * reconciled or held unresolved. Surfacing that tension is the obligation
 * (ADR-0002) — owed even, and especially, when there is no bandwidth to
 * resolve it now; whether two directives can ultimately be bridged into one
 * coherent principle is a separate, later question. The annotation is an
 * invitation to ask, not a certification the rule is correct.
 *
 * The rationale lives in this header per rule, in a `// rationale:` comment
 * at the rule site, and — for the no-restricted-imports rules — ALSO in the
 * `message` field shown to the developer when the rule fires.
 *
 * Rules, by layer:
 *
 *   Template (Vue SFCs):
 *     - vue/no-v-html        — rationale: `v-html` writes an unescaped
 *                              string into innerHTML, bypassing Vue's
 *                              template escaping — an XSS / injection sink
 *                              for any non-constant content. The two
 *                              legitimate board-SVG string projections
 *                              (FloatingThumbnail.vue, LibraryPreviewPane.vue)
 *                              carry an inline `eslint-disable-next-line`
 *                              with a justification, so a NEW sink is still
 *                              caught. See ADR-0010.
 *     - vue/require-v-for-key — rationale: without a `:key`, Vue's list diff
 *                              falls back to in-place index patching and
 *                              reuses a DOM / component instance for a
 *                              different logical item — silently corrupting
 *                              per-item local state, focus, and transitions.
 *                              The key restores stable identity. A
 *                              correctness rule, not a style nit: the failure
 *                              is a wrong-state render.
 *
 *   Import boundaries (`.ts` + `.vue`, via no-restricted-imports and its
 *   @typescript-eslint superset):
 *     - The OpenAPI-generated wire types (`src/types/backend.ts`,
 *       snake_case) may be imported ONLY within the services layer (the
 *       ACL) and `src/types.ts` (the type-level alias boundary where wire
 *       shapes become branded domain types). Importing them anywhere in
 *       domain code is the snake_case-leaks-past-the-ACL failure ADR-0002
 *       and the layering tenet forbid. Zero violations at adoption — this
 *       codified an invariant that already held.
 *     - Components — and `src/App.vue` — may not import from
 *       `src/services/**`, deny-by-default (the layering tenet: components
 *       are thin renderers; logic lives in composables; effects live in
 *       services and are called FROM composables). Rationale, chiefly
 *       testability: the three-tier test architecture (tests/CLAUDE.md)
 *       drives a composable against service fakes WITHOUT mounting a
 *       component, so effect-orchestration living in a composable is
 *       cheaply testable — the same call embedded in a component is
 *       reachable only via the component tests the project defers as
 *       low-ROI. Secondary: the component stays a thin renderer
 *       (ADR-0007), and effect lifecycle stays co-located with the
 *       resource-ownership-at-mutation-sites discipline.
 *       Shape history: the rule began (2026-05-31) as an enumerated
 *       blocklist of four effectful singletons. That shape was incomplete
 *       from day one (sync-service, qeubo-service, api-client,
 *       resource-service — all predate the list, none ever on it) and
 *       fail-open: a NEW service was importable from components until
 *       someone remembered to enumerate it. Inverted to deny-by-default
 *       2026-06-10 (history-lessons audit §3.11; work-status item
 *       services-boundary-deny-by-default, step (a)).
 *       The exemptions, both deliberate: (1) the reactive-state class
 *       ({analysis-ledger, analysis-config, stability-trajectory-store};
 *       REACTIVE_STATE_EXEMPTIONS below) — a display LEAF reading the
 *       reactive value it displays is sanctioned by ADR-0010's
 *       read-locality rule. That effectful-vs-reactive split is the SEAM
 *       where two directives meet — CLAUDE.md's layering tenet (effects
 *       flow component→composable→service) and ADR-0010's read-locality
 *       (a display leaf reads the reactive value it displays, wherever
 *       that value lives). The split is a working reconciliation, not a
 *       proven bridge: whether the two directives fully resolve into one
 *       coherent principle, or carry residual tension, is an OPEN
 *       question — documented here per ADR-0002 and as ADR-0010's
 *       "Revisit when…" #4, deferred for bandwidth, not settled by this
 *       rule. The constant is the provisional form of a future
 *       `src/state/` directory (the item's step (b), a separate sign-off
 *       arc): relocation makes the boundary purely directory-structural
 *       and deletes the constant.
 *       (2026-06-11: step (b) landed — work-status item
 *       reactive-state-modules-relocation moved the three reactive-state
 *       modules ({analysis-ledger, analysis-config,
 *       stability-trajectory-store}) out of `src/services/` into
 *       `src/state/`, so the component→services boundary is now purely
 *       DIRECTORY-STRUCTURAL: components are denied `src/services/**` with
 *       no carve-out, and `src/state/**` is importable because it is not
 *       under `services/` — the reactive-state class is no longer an
 *       enumerated exemption but a directory the rule simply does not
 *       restrict. REACTIVE_STATE_EXEMPTIONS is deleted; the paragraph
 *       above stands as the historical record of the exemption mechanism
 *       while it was carried. The split the seam held apart is now
 *       expressed by where a module LIVES rather than by a negation list —
 *       the machinery-vs-payload seam the item names: `src/services/` is
 *       effect machinery (deny), `src/state/` is reactive payload a leaf
 *       may read (allow). The OPEN question above is unchanged by the move
 *       — whether the two directives collapse into one coherent principle
 *       is the same question; the relocation makes the working split
 *       structural instead of heuristic, which is what ADR-0010 Revisit #4
 *       named as the collapse-into-one-principle PATHWAY, not the collapse
 *       itself.) (2) Type-only imports
 *       (allowTypeImports — the reason this rule is the
 *       @typescript-eslint variant): an `import type` is compile-time-
 *       erased and carries no runtime effect coupling, so it sits outside
 *       the tenet's target. Worked case: AnalysisControls.vue's type-only
 *       import of AnalysisBundleStorageError from analysis-bundle —
 *       classified by what its header declares (pure projection, no side
 *       effects, no network): not an effectful singleton, but not a
 *       reactive leaf-read source either, so deliberately NOT exempted
 *       for value imports; its component-visible surface is type-level
 *       only.
 *       App.vue: the layering tenet covers `src/App.vue` explicitly, but
 *       the original glob covered `src/components/**` only — a named gap,
 *       closed at the inversion. App.vue's one standing violation
 *       (analysisService) carries an inline eslint-disable +
 *       justification as an annotated WIRING-FILE exemption (the
 *       vue/no-v-html model) — honest layering debt, named not
 *       sanctioned; extracting the orchestration is a separate arc. A
 *       second service import there trips the rule.
 *       (2026-06-11: that separate arc landed — work-status item
 *       app-vue-style-and-wiring-extraction moved the follow-me ponder
 *       watcher into composables/board/useFollowMePonder.ts, so App.vue
 *       now has ZERO service imports and the wiring-file exemption is
 *       retired; the paragraph above stands as the historical record of
 *       the debt while it was carried. The rule still covers App.vue —
 *       a NEW service import there trips it with no standing exemption
 *       to hide behind.)
 *       Census, historical: at the blocklist's adoption, four components
 *       violated it (ReviewSessionPanel, ForestDirectory, LibraryTab,
 *       AnalysisControls) across five import sites — all resolved
 *       2026-06-01 (routed through composables: useCardMetadata,
 *       useForestStats, useLibraryPreview, useAnalysisPersistence;
 *       commit 35c939c). At the deny-by-default inversion (2026-06-10)
 *       the widened rule measured exactly one hit on the tree — App.vue's
 *       analysisService import, triaged as the annotated wiring-file
 *       exemption above — so the inversion adopted at `error` on a
 *       fully-triaged baseline, per this config's measure-first posture.
 *
 *   Type-checked (`src/**` `.ts`, via the TS project service):
 *     - @typescript-eslint/switch-exhaustiveness-check — rationale: a switch
 *       over a union that doesn't handle every member (and has no default)
 *       silently ignores a case. The compiler-enforced form of the
 *       discriminated-union `never`-default exhaustiveness discipline. 0
 *       violations at adoption (the discipline already held) — a clean
 *       regression gate.
 *     - @typescript-eslint/no-floating-promises — rationale: an unawaited
 *       promise that can reject with no handler is the ADR-0002 silent-async
 *       class (the effect fails, nothing surfaces it). Satisfied by await /
 *       `.catch` / an explicit `void` for an intentional fire-and-forget whose
 *       callee self-handles. 7 sites at adoption, all resolved (each a
 *       verified self-handling fire-and-forget → `void` + rationale).
 *     - @typescript-eslint/only-throw-error — rationale: a thrown non-Error
 *       value carries no stack and defeats `instanceof Error` narrowing in
 *       every catch on its propagation path — the throw-side door adjacent
 *       to the G1 reparse guard below. RCA G3 rates it hygiene, explicitly
 *       NOT the Lapse-1 guard (that throw WAS an Error; the structure was
 *       lost in its message): adopted as the cheap adjacent-door close, per
 *       the 2026-06-10 E4 sign-off (deferral-harvest audit §4.2/§7: adopt,
 *       measure-first per the a75814c pattern). Measured at adoption: 1 hit
 *       on src — analysis-persistence-service's rethrowAsStorageError
 *       throwing the AnalysisBundleStorageError union — resolved as an
 *       annotated inline disable (the vue/no-v-html model): that union is
 *       DELIBERATELY structural (kind/status field narrowing, no
 *       instanceof; the type-only-import classification recorded above
 *       leans on it), so an Error-subclass conversion is a contract change
 *       across the union's four consumer files, not lint hygiene ⇒ adopted
 *       at `error` on a fully-triaged baseline. Named gaps per ADR-0002:
 *       the rule runs on its defaults (allowThrowingAny /
 *       allowThrowingUnknown / allowRethrowing), so the `throw err` rethrow
 *       idiom over unknown-typed caught values stays admitted — the rule
 *       polices constructed throws, not propagation; .vue <script> sits
 *       outside the type-checked block (type info is wired for src/**'s
 *       .ts only; 1 throw site in .vue at adoption, already a proper
 *       `new Error` by inspection); tests/** stays outside the lint
 *       surface (the later-step deferral below stands — test fakes throw
 *       deliberately, all Error-shaped at adoption).
 *
 *   Syntactic guards (`src/**` `.ts` + `.vue`, via no-restricted-syntax):
 *     - no error-message reverse-engineering — rationale: a throw site that
 *       bakes structure into an error MESSAGE, reparsed downstream by
 *       `.match`/`.includes`/regex `.test`, is a brittleness hazard — a format
 *       drift silently degrades a typed failure to "unknown error" with NO
 *       compile error (the ADR-0002 silent class, reached THROUGH the error
 *       path that should be the loud one). Fix: a structured Error subclass
 *       with fields (`ApiError { status, body }`) consumed by `instanceof` +
 *       field branch. The 2026-06-01 exhaustiveness audit found the six known
 *       reparse sites were the complete population (converted, PR #318); this
 *       rule keeps it at zero. Best-effort + syntactic: catches
 *       `err.message.includes(...)` and `/re/.test(err.message)`, NOT a message
 *       routed through an intermediate variable — the gap named per ADR-0002,
 *       not papered over. Measured 0 hits on `src/` at adoption (corroborating
 *       the audit's complete-population finding), so adopted at `error` — a
 *       future non-error `.message` read trips it and takes an inline
 *       `eslint-disable` + justification (the `vue/no-v-html` model). Guard
 *       rationale + RCA: docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md (G1).
 *     - no any-assertions (cast hygiene, stage 1) — rationale: `x as any`
 *       (and the `<any>x` / `as any[]` spellings) erases the type system at
 *       exactly the seams where checking matters most — the ADR-0002
 *       silent-coercion class, concentrated at trust boundaries per the
 *       2026-06-10 history-lessons audit (L4). The cast-justification
 *       PROSE rule (frontend/CLAUDE.md "an `as` needs a justification or
 *       it doesn't ship") held at ~50% in that audit's sample — this rule
 *       is the prose discipline's mechanization, stage 1 of work-status
 *       item cast-hygiene-lint (audit §3.10). Measured at adoption:
 *       12 any-targeted assertion sites in src (11 bare + 1 `as any[]`;
 *       the audit's ~13 included one site the resource-service arc had
 *       already retired). 9 re-typed soundly (NodeId brand minted at
 *       sgf-loader's single id-construction site; katago-client's
 *       subscribe() seam widened to the full query union; two vestige
 *       casts whose target types already declare the fields
 *       (analysis-service ×2); a BoardId assignment that needed no cast
 *       (useReviewSession); two generic-key editor writes (CardSetEditor,
 *       PaletteEditor)); 1 removed as an any→any vestige (BaseChart);
 *       2 kept as annotated inline disables (main.ts DEV-only window
 *       debug handles — the vue/no-v-html escape-hatch model) ⇒ adopted
 *       at `error` on a fully-triaged baseline. Kept-cast justification
 *       convention: name the scope of unsafety, and when the cast sits on
 *       an ADR-0003 band boundary, the band character ("Band 3 loader
 *       minting a Band 2 branded id" — sgf-loader.ts is the worked form),
 *       so the justification inventory doubles as the fork's seam map.
 *       Template expressions are covered by the same selectors via
 *       vue/no-restricted-syntax (0 template hits at adoption). Syntactic
 *       best-effort, gaps named per ADR-0002: deeper any-bearing
 *       composites (`as Record<string, any>`, double-casts through
 *       `unknown`) and annotation-position `any` are NOT caught — the
 *       former are now covered by stage 2's justification-adjacency rule
 *       (every coercion cast, including the double-hop, needs an adjacent
 *       justification; adopted 2026-06-11, see the stage-2 adoption record
 *       at the end of this header), the latter remains the no-explicit-any
 *       deferral (see the staging record at the end of this header).
 *     - no aliased profile writes through generic machinery — rationale:
 *       the store-write-needs-owner lint (below) guards dotted-path
 *       writes only; store.profile's majority writers were aliased
 *       through `updateRegistry` (handed a store.profile root) and the
 *       knob substrate (`writeKnobValue`/`writeKnob` handed the live
 *       store root) — the "fenced, not owned" finding of PR #382's
 *       out-of-frame audit. With the subtree's owner module landed
 *       (src/store/profile-owner.ts; work-status item
 *       settings-profile-mutator-owner), these selectors keep the two
 *       machinery shapes routed through it. Measured at adoption
 *       (2026-06-11): 6 call sites, all rerouted in the same change;
 *       2 annotated sanctioned sites in the owner ⇒ `error` on a
 *       fully-triaged baseline. Full rationale + named gaps at the
 *       PROFILE_ALIASED_WRITE_SELECTORS constant.
 *
 *   Vue lifecycle footgun guards (custom local rules, `.vue` files;
 *   2026-06-10 history-lessons audit §3.12, work-status item
 *   vue-lifecycle-footgun-guards):
 *     - local/gate-prop-needs-default — rationale: Vue casts an omitted
 *       boolean-typed prop to `false`, not `undefined`, so a boolean
 *       OPT-OUT gate (`false` suppresses) silently engages for every
 *       consumer that omits it — the BaseChart `active` regression
 *       (`4756c30`'s "other consumers unaffected" claim falsified by
 *       `69810e2`: blank intermission chart + ecModel crash;
 *       docs/worklog/2026-06-08-basechart-active-prop-default.md).
 *       vue-tsc cannot police author intent here even in principle —
 *       omitting an optional prop is type-legal. Stock-rule assessment,
 *       per the measure-first posture (measured on src, 2026-06-10):
 *       vue/require-default-prop — 11 hits, every one a NON-boolean
 *       optional prop whose `undefined` is a genuine load-bearing
 *       sentinel (tooltipFormatter, zoomRange, …), and the rule exempts
 *       boolean props BY DESIGN (it treats Vue's false-cast as the
 *       sanctioned default), so it cannot catch the gate-prop class at
 *       all: REJECTED. vue/no-boolean-default — 6 hits, every one a
 *       deliberate explicit boolean default INCLUDING BaseChart's
 *       `active: true`; the rule encodes the opposite convention
 *       (booleans must default falsy) and would have the shipped fix
 *       deleted: REJECTED. The custom rule keys on NAME patterns
 *       (active / enabled / visible as camelCase word segments), never a
 *       component allowlist (the enumerated-blocklist failure shape).
 *       Measured at adoption: 1 gate-named boolean prop in src
 *       (BaseChart `active`), already carrying its withDefaults default
 *       ⇒ 0 hits, clean `error` adoption. The lint polices a DECLARED
 *       default; the runtime half — the reusable omission rendering
 *       guard tests/integration/gate-prop-omission.ts — polices the
 *       declared default's behaviour. Named gaps in the rule file
 *       (imported props types, literal-union booleans, options API).
 *     - local/module-intent-in-script-setup — rationale: `<script setup>`
 *       compiles into setup(), so a top-level declaration there is
 *       per-instance; a comment claiming module intent ("loaded once",
 *       "shared across instances") is then false with nothing surfacing
 *       it — the MiniBoardCanvas texture-flash class (`463a15e`;
 *       docs/worklog/2026-06-09-mini-board-texture-scope-fix.md). The
 *       shipped fix's plain-`<script>` block (module scope made real,
 *       with the "MUST live in a plain <script>" banner) is the worked
 *       example. Triggers on the CLAIM — curated comment patterns plus
 *       `shared*` identifier names — deliberately NOT on all top-level
 *       let/Map/Set: per-instance non-reactive state is a sanctioned
 *       idiom (the imperative-escape cached-dims pattern,
 *       frontend/CLAUDE.md). Measured at adoption: 0 hits on src (the
 *       one prior instance was fixed by PR #366; the remaining
 *       module-intent comments sit in plain `<script>` blocks or
 *       describe state in real `.ts` modules) ⇒ clean `error` adoption;
 *       probe-verified by reintroducing the shipped bug's literal shape
 *       and observing it fire. Named gaps in the rule file (uncommented
 *       intent is undetectable; the pattern list is curated — extend it
 *       when a new phrasing is paid for).
 *
 * This `.ts` linting is new: the prior config parsed `.vue` only, so
 * TypeScript modules went unlinted. The `@typescript-eslint/parser` was
 * already a dependency; this wires it for `.ts` files so the import
 * boundaries have teeth in the composable / store / engine / lib layers.
 * `tests/` is ignored for now (see the ignores block): linting it surfaces
 * anticipatory `no-console` disable directives in the e2e harness that
 * await a console-policy call — extending lint to tests is a later step.
 *
 * Composition note: the forthcoming Effect-TS "lighter stack" interim
 * (see docs/notes/opus-consult-2026-05-29-effect-ts-adoption.md) lands its
 * purity-audit leg HERE — `eslint-plugin-functional` scoped via overrides
 * to a `.pure.ts`/band convention. These import-boundary rules are an
 * orthogonal foundation it sits beside; nothing here pre-commits that work.
 * Type-checked rules now run via the rules plugin + the TS project service
 * (switch-exhaustiveness-check + no-floating-promises — see "Type-checked"
 * above). Still deferred as a separate, later decision: `no-explicit-any`
 * (~152 sites) and `max-lines` (~69 files over 250) — backlog-surfacing
 * rather than clean gates, so warn-as-backlog candidates, not adopted here.
 *
 * Cast-hygiene staging record (2026-06-10; history-lessons audit §3.10;
 * work-status item cast-hygiene-lint). Stage 1 — the any-assertion ban
 * above — RE-OPENS the `no-explicit-any` deferral recorded in the
 * previous paragraph (recorded relationship per ADR-0002 Rule 6: the
 * deferral text stands as the historical record; this paragraph amends
 * by appending): the assertion-position corner of that backlog is now
 * banned at `error`, while annotation-position `any` — the bulk; 109
 * occurrences re-measured at this change, the ~152 above being the
 * stale earlier census — stays deferred exactly as before. Stage 2 —
 * a justification-adjacency requirement on ALL coercion casts (custom
 * local rule; precedent: eslint-rules/clear-needs-ownership.js) — is
 * measured here but deliberately NOT adopted, per the `a75814c`
 * measure-first pattern. Baseline (AST-grade scratch-config run over
 * src/, 2026-06-10, before stage-1 fixes → after):
 *   - `as`-assertions, script side (.ts + .vue <script>): 431 → 416
 *   - `as`-assertions in .vue <template> expressions: 37 → 37 (the
 *     population the audit's .ts-only sample never measured; 0 of
 *     them any-targeted)
 *   - `as const` subset (const assertions, not coercions — excluded
 *     from the stage-2 target): 56
 *   - stage-2 target population (coercion casts that would need an
 *     adjacent justification): 412 → 397
 *   - `as unknown as` double-casts (the brand-strip shape; the
 *     follow-on ratchet target the audit names): 28 → 25
 *   - tests/: 4 bare `as any` (one fixture file,
 *     tests/integration/hydration-knowntags.test.ts) sit OUTSIDE both
 *     this lint's scope (tests/** ignored — the later-step deferral
 *     above stands) and the vue-tsc surface (tsconfig.app.json
 *     includes src/ only; vitest does not typecheck) — which is how
 *     interface-violating fixtures survive. Named here rather than
 *     silently absorbed; the tests-lint later step inherits it.
 *
 * Stage-2 ADOPTION (2026-06-11; work-status item
 * cast-justification-adjacency-stage2; closes the staging paragraph's
 * loop, amending it by appending per ADR-0002 Rule 6 — the measurement
 * above stands as the staging record). The justification-adjacency rule
 * (eslint-rules/justification-adjacency.js) is adopted at `error` (its
 * config block below). Re-measured baseline (AST-grade, 2026-06-11; the
 * tree drifted since the staging census above): 405 coercion casts (368
 * script + 37 template), 321 unjustified. Burned to 0 outside the two
 * frozen migration files — ~16 deleted as redundant via sound typing (the
 * 25 RegistryEditor template casts collapsed into a typed `entries`
 * computed; `row.id as GameSourceId` where the row's id was already
 * branded; `currentNodeId as NodeId` / `color as 'B'|'W'` already those
 * types), the rest justified in place (ACL Band-2 brand mints; decode-
 * frontier open-record probes; ECharts tuple/param coercions). The
 * `as unknown as` double-casts re-measured at 27 (staging said 25): each
 * justified naming the brand-strip / structural-mismatch — the documented
 * IDENTIFIERS.md erosion (b) strip sites are named explicitly as
 * maintainer-directed re-brand-helper debt, not refactored here. The 68
 * casts in src/store/migrations.ts (5) + archived-migrations.ts (63) are
 * config-exempted via FROZEN_MIGRATION_FILES (the migration-body freeze
 * overrides the justification edit — directive tension surfaced at that
 * constant). Adopted at `error` on a fully-triaged baseline (ADR-0011
 * Rule 3). The two RIDERS this item carried: (a) the hand-rolled-path-walk
 * lint (eslint-rules/hand-rolled-path-walk.js, its config block below) —
 * adopted at `error`, 3 measured hits all carrying annotated inline
 * exemptions (perf/dead-code-sensitive to refactor through getPath); (b)
 * the tests-outside-typecheck gap — the 4 fixture `as any` in
 * hydration-knowntags.test.ts are fixed soundly (a single typed `remote()`
 * deep-partial seam replaces them); the tests-lint scope question is
 * recorded with its measured numbers in
 * docs/worklog/2026-06-11-cast-stage2-burndown.md (it interacts with the
 * e2e console-policy deferral, named there).
 *
 * License: Public Domain (The Unlicense)
 */

import pluginVue from 'eslint-plugin-vue';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import { clearNeedsOwnership } from './eslint-rules/clear-needs-ownership.js';
import { gatePropNeedsDefault } from './eslint-rules/gate-prop-needs-default.js';
import { moduleIntentInScriptSetup } from './eslint-rules/module-intent-in-script-setup.js';
import { storeWriteNeedsOwner } from './eslint-rules/store-write-needs-owner.js';
import { justificationAdjacency } from './eslint-rules/justification-adjacency.js';
import { handRolledPathWalk } from './eslint-rules/hand-rolled-path-walk.js';

// The wire-type boundary: backend.ts is importable only at the ACL.
// Applied everywhere EXCEPT src/services/** and src/types.ts (see block
// scoping below). Patterns are gitignore-style globs over the import
// source string, so they match the relative forms domain code uses
// (`../types/backend`, `../../types/backend`, …).
const WIRE_TYPE_PATTERN = {
  group: ['**/types/backend', '**/types/backend.ts'],
  message:
    'The OpenAPI-generated wire types (src/types/backend.ts) are the ACL ' +
    'boundary. Import them only within src/services/** or src/types.ts; ' +
    'domain code consumes the branded/camelCase domain types, never the ' +
    'snake_case wire shapes. See frontend/CLAUDE.md "Architectural shape" ' +
    '+ ADR-0002.',
};

// The component→services boundary, deny-by-default. The original shape was
// an enumerated blocklist of four effectful singletons (backend-service,
// library-service, analysis-service, analysis-persistence-service). It was
// incomplete from day one — sync-service, qeubo-service, api-client, and
// resource-service all predate the list and were never on it — and
// fail-open by shape: a NEW service module was importable from components
// until someone remembered to enumerate it. Inverted to deny-by-default
// 2026-06-10 (history-lessons audit §3.11; work-status item
// services-boundary-deny-by-default, step (a)): everything under
// src/services/** is restricted from the component layer.
//
// 2026-06-10 → 2026-06-11: step (a) carved the reactive-state class back
// in through a REACTIVE_STATE_EXEMPTIONS constant (gitignore-style `!`
// negations for analysis-ledger / analysis-config /
// stability-trajectory-store), explicitly the provisional form of a
// future `src/state/` directory. Step (b) — work-status item
// reactive-state-modules-relocation — landed that directory: the three
// modules moved out of src/services/** into src/state/**, so the boundary
// is now purely DIRECTORY-STRUCTURAL. The exemption constant is deleted;
// the group is a single `**/services/**` pattern with no negation list.
// src/state/** is importable from components not by being carved out but
// by simply not being under services/** — a display leaf reads the
// reactive value it displays (ADR-0010 read-locality), and that value now
// lives in a directory the layering boundary does not police. The header's
// component→services paragraph carries the seam discussion (the
// machinery-vs-payload split: src/services/ is effect machinery, src/state/
// is reactive payload).
//
// allowTypeImports: a type-only import is erased at compile time and
// carries no runtime effect coupling, so it sits outside the layering
// tenet's target (effect orchestration). Classification decision recorded
// per the step-(a) audit item: analysis-bundle's header declares it a pure
// projection (no side effects, no network) — NOT an effectful singleton,
// but not a reactive leaf-read source either, so it stayed in services/**
// (it is not reactive state) and is NOT importable for value imports: a
// value import of projection logic from a component is still
// logic-in-a-component. Its one component consumer (AnalysisControls.vue)
// needs only the AnalysisBundleStorageError TYPE (a structural union,
// narrowed by field checks, no instanceof), which allowTypeImports admits.
const COMPONENT_SERVICES_BOUNDARY_PATTERN = {
  group: ['**/services/**'],
  allowTypeImports: true,
  message:
    'Components are thin renderers: src/services/** is deny-by-default ' +
    'from the component layer (App.vue included) — effectful service ' +
    'calls belong in a composable, not a component. The reactive-state ' +
    'modules live in src/state/** (analysis-ledger / analysis-config / ' +
    'stability-trajectory-store), which is importable — a display leaf may ' +
    'read what it displays, per ADR-0010. Type-only imports are also ' +
    'admitted (compile-time-erased). See frontend/CLAUDE.md ' +
    '"Architectural shape".',
};

// Cast hygiene, stage 1 (work-status item cast-hygiene-lint; 2026-06-10
// history-lessons audit §3.10): ban assertions whose target type is `any`.
// Shared between the script-side core no-restricted-syntax block and the
// template-side vue/no-restricted-syntax block below. Syntactic
// best-effort, same posture as the error-message guard: the two selectors
// catch `x as any` / `<any>x` and the one-level `as any[]` / `<any[]>x`
// spellings; deeper any-bearing composites (`as Record<string, any>`, a
// double-cast through `unknown`) are now caught by stage 2's
// justification-adjacency rule (every coercion cast needs a justification,
// adopted 2026-06-11 — its config block below), and annotation-position
// `any` remains the no-explicit-any deferral (see header).
// The local custom-rule plugin, ONE shared object on purpose: flat config
// treats two different plugin objects under the same namespace as a
// redefinition error when their file globs overlap, so per-block inline
// plugin objects are a future-overlap landmine. Every block that mounts a
// `local/` rule references this constant (the clear-needs-ownership block
// and the Vue lifecycle footgun block below).
const LOCAL_RULE_PLUGIN = {
  rules: {
    'clear-needs-ownership': clearNeedsOwnership,
    'gate-prop-needs-default': gatePropNeedsDefault,
    'module-intent-in-script-setup': moduleIntentInScriptSetup,
    'store-write-needs-owner': storeWriteNeedsOwner,
    'justification-adjacency': justificationAdjacency,
    'hand-rolled-path-walk': handRolledPathWalk,
  },
};

// The two frozen migration files. `migrations.ts` carries the append-only
// invariant ("Once a migration ships, it is never modified") and
// `archived-migrations.ts` the rolling-archive freeze ("Migration bodies
// are frozen as they shipped … never edit the body during the move") — a
// migration is a contract with the persisted-blob population, not a refactor
// target (frontend/CLAUDE.md "Rolling-archive discipline"). The 68 coercion
// casts in these frozen bodies (63 archived + 5 active, measured 2026-06-11)
// CANNOT take an adjacent justification edit without breaking the freeze, so
// justification-adjacency exempts them at the config level: a directive
// tension surfaced per this header's rule-rationale discipline — the
// cast-justification discipline (one sound rationale) meets the
// freeze-the-migration-body discipline (an independent sound rationale), and
// the freeze WINS for these two files because the blob-migration contract is
// load-bearing. A NEW migration's casts, authored before the body freezes,
// are reviewed under the prose discipline at authoring time; the lint does
// not police them because the file is frozen the moment it ships.
const FROZEN_MIGRATION_FILES = ['src/store/migrations.ts', 'src/store/archived-migrations.ts'];

// ── Profile aliased-write guards (generic-machinery call shapes) ──
// rationale: PR #382's out-of-frame audit found store.profile "fenced,
// not owned" — the store-write-needs-owner lint guards the dotted-path
// write shape, but the subtree's MAJORITY writers were aliased through
// two pieces of generic machinery the rule's named gaps admit: the
// silent-create path walker (`updateRegistry` handed a store.profile
// root — the Settings registry editors' seam) and the knob substrate
// (`writeKnobValue`/`writeKnob` handed the live `store` root, whose
// KnobDecl output paths land on profile leaves). Work-status item
// settings-profile-mutator-owner gives the subtree a real owner
// (src/store/profile-owner.ts: mutateProfile / updateProfileAt /
// writeStoreKnobValue); these selectors are the net that keeps future
// writers from re-introducing the aliased shapes outside it (ADR-0011
// Rule 4 — quantify over the machinery class, not the call-site list).
// Measured at adoption (2026-06-11, scratch config over src/ BEFORE the
// reroute): 6 call sites — updateRegistry-over-profile ×3
// (SettingsTab.vue ×2, useDirtyBoardGuard.ts ×1), knob-substrate-with-
// store-root ×3 (KnobSlider.vue ×1, useQeubo.ts ×2); all rerouted
// through the owner in the same change, leaving the owner's own two
// sites as annotated inline disables (the vue/no-v-html model) ⇒
// adopted at `error` on a fully-triaged baseline. Probe-verified
// against the literal pre-change shapes (both selector families fire
// on reintroduction; scratch edits reverted). Named gaps per ADR-0002:
// name-matched callees and roots (a renamed import or an intermediate
// variable holding store.profile escapes); session.ui-rooted
// updateRegistry calls are deliberately admitted (store.session is not
// an enumerated subtree).
//
// updateRegistry-over-profile root depth (corrected 2026-06-11, PR #410
// out-of-frame gate): the original two depth-bounded selectors
// (arguments.0 at store.profile / store.profile.<x>) carried the
// rationale "esquery cannot express the recursive root walk", so a
// store.profile.settings.engine depth-3 root would escape. That strong
// reading is EMPIRICALLY REFUTED — a descendant-combinator
// over-approximation (`CallExpression[callee.name='updateRegistry']
// MemberExpression[object.name='store'][property.name='profile']`)
// fires on any store.profile member-expression at ANY depth inside an
// updateRegistry call (probe-verified: depth-1/2/3/4 all fire; zero
// firings across the whole src/ tree at HEAD). EXACT root-anchoring
// remains inexpressible in esquery — but the conservative
// over-approximation is STRICTLY STRONGER than the depth-bounded pair
// it replaces, so it is adopted in their place (ADR-0011 Rule 4:
// quantify over the class, don't enumerate the depths). The
// over-approximation's one cost, named per ADR-0002: it also fires when
// `store.profile` appears as a non-target READ argument of an
// updateRegistry call (e.g. `updateRegistry(store.session.ui, p,
// store.profile.x)`) — broader than the arguments.0-anchored selectors,
// zero such sites at HEAD; a future legitimate profile READ passed to
// updateRegistry would take an annotated inline disable (the
// vue/no-v-html model), which is the correct loud surface rather than a
// silent depth escape.
const PROFILE_ALIASED_WRITE_SELECTORS = [
  {
    selector:
      "CallExpression[callee.name='updateRegistry'] MemberExpression[object.name='store'][property.name='profile']",
    message:
      'updateRegistry over a store.profile root (any depth) is an aliased ' +
      'profile write the writer-enumeration lint cannot see. Route it ' +
      'through the profile owner (src/store/profile-owner.ts: ' +
      'updateProfileAt for dynamic paths, mutateProfile for ' +
      'statically-known writes). See eslint.config.js header.',
  },
  {
    selector:
      ":matches(CallExpression[callee.name='writeKnobValue'], CallExpression[callee.name='writeKnob'])[arguments.0.name='store']",
    message:
      'Handing the live store root to the knob substrate is an aliased ' +
      'store write (KnobDecl output paths land on profile/session leaves). ' +
      "Route it through the profile owner's writeStoreKnobValue " +
      '(src/store/profile-owner.ts). See eslint.config.js header.',
  },
];

const ANY_ASSERTION_SELECTORS = [
  {
    selector: ':matches(TSAsExpression, TSTypeAssertion) > TSAnyKeyword',
    message:
      'A bare cast to `any` erases the type system at exactly the seam ' +
      'where checking matters (ADR-0002 silent-coercion class). Type the ' +
      'seam instead — widen the parameter, mint the precise brand, use a ' +
      'generic key. If the cast is genuinely needed (untyped-library / ' +
      'untyped-global interop), keep it behind an inline ' +
      'eslint-disable-next-line with a justification naming the scope of ' +
      'unsafety — and, on an ADR-0003 band boundary, the band character ' +
      '(worked form: sgf-loader.ts). See eslint.config.js header.',
  },
  {
    selector:
      ':matches(TSAsExpression, TSTypeAssertion) > TSArrayType > TSAnyKeyword',
    message:
      'Casting to `any[]` erases the element type — the same ' +
      'silent-coercion class as a bare `as any`, and its cheapest ' +
      'circumvention. Same discipline: type the seam, or annotated ' +
      'inline disable + justification. See eslint.config.js header.',
  },
];

export default [
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'tests/**', // test-tree linting is a later step (see header).
      'src/types/backend.ts', // OpenAPI-generated; never hand-edited or linted.
    ],
  },

  // Base Vue SFC setup (registers the vue parser for <template>).
  ...pluginVue.configs['flat/base'],

  // TypeScript modules: wire the TS parser so every `.ts` file ESLint
  // touches is TS-parsed (root config files included), not just src/.
  // Without this, a non-src `.ts` falls back to the default parser and
  // chokes on TS syntax. tests/ is excluded via the ignores block above.
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
  },

  // Vue SFCs: the vue parser delegates <script lang="ts"> to the TS parser;
  // the two template rules apply here.
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      // rationale: v-html bypasses Vue's HTML-escaping → XSS sink (header).
      'vue/no-v-html': 'error',
      // rationale: a missing :key makes Vue reuse an instance for the wrong
      // list item, corrupting local state / transitions — a correctness bug,
      // not a style nit (header).
      'vue/require-v-for-key': 'error',
    },
  },

  // Wire-type boundary. rationale: backend.ts is snake_case wire shapes;
  // the ACL is the single boundary where they become branded domain types,
  // so an import anywhere else is snake_case leaking into the domain — the
  // ADR-0002 silent-divergence class. (Full message shown on fire below.)
  // Enforced across all src code EXCEPT the ACL layer (services/**) and the
  // type-level alias boundary (types.ts).
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    ignores: ['src/services/**', 'src/types.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [WIRE_TYPE_PATTERN] }],
    },
  },

  // Components — and src/App.vue: the layering tenet covers it explicitly
  // ("Components (src/components/*, src/App.vue) … No direct service
  // calls"), so the prior components-only glob was a named gap, closed at
  // the 2026-06-10 inversion — additionally may not import from
  // src/services/** at all: deny-by-default. The reactive-state modules
  // moved to src/state/** (2026-06-11, step (b)) so they fall outside this
  // glob by location, not by exemption; type-only imports stay admitted
  // (allowTypeImports). rationale: an effectful service call is
  // orchestration logic; it belongs in a composable (testable against
  // fakes per tests/CLAUDE.md; keeps the component a thin renderer per
  // ADR-0007). Full rationale + inversion history in the header;
  // dev-facing form in the message. Uses @typescript-eslint's
  // no-restricted-imports (a superset of the base rule) for its
  // allowTypeImports option. Because this block configures a DIFFERENT
  // rule name than the wire-type block above, the base
  // no-restricted-imports config from that block still applies to these
  // files un-replaced — the wire-type pattern no longer needs re-stating
  // here (the old same-rule-name shape did replace, hence the historical
  // restatement).
  {
    files: ['src/components/**/*.ts', 'src/components/**/*.vue', 'src/App.vue'],
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        { patterns: [COMPONENT_SERVICES_BOUNDARY_PATTERN] },
      ],
    },
  },

  // ── Type-checked discipline rules (src/**/*.ts; TS project service) ───
  // Three type-aware rules mechanising existing prose disciplines, adopted
  // as `error` after measuring on src — switch-exhaustiveness: 0 violations
  // (already clean); no-floating-promises: 7, all resolved (each an
  // intentional fire-and-forget whose callee self-handles, now `void`+comment);
  // only-throw-error: 1, resolved as an annotated inline disable (the
  // deliberate structural AnalysisBundleStorageError union throw).
  //   - switch-exhaustiveness-check → rationale: a switch over a union that
  //     doesn't handle every member (and lacks a default) silently ignores a
  //     case — this is the compiler-enforced form of the discriminated-union
  //     `never`-default exhaustiveness discipline (type-driven design).
  //   - no-floating-promises → rationale: an unawaited promise that can reject
  //     with no handler is the ADR-0002 silent-async class (the effect fails,
  //     nothing surfaces it). Satisfied by await / `.catch` / an explicit
  //     `void` (the last documents an intentional fire-and-forget whose callee
  //     self-handles its own errors).
  //   - only-throw-error → rationale: a thrown non-Error value carries no
  //     stack and defeats `instanceof Error` narrowing in every catch on
  //     its propagation path. RCA G3 (adjacent-door hygiene, deliberately
  //     NOT credited as the Lapse-1 guard —
  //     docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md §4);
  //     adopted 2026-06-10 per the E4 sign-off, measure-first. Defaults
  //     kept: the unknown-typed `throw err` rethrow idiom stays admitted.
  //     Full census + named gaps in the header.
  // Type info comes from the TS project service — slower than syntactic
  // linting, so it runs in `npm run lint` / CI (which don't gate the build).
  {
    files: ['src/**/*.ts'],
    plugins: { '@typescript-eslint': tsPlugin },
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/only-throw-error': 'error',
    },
  },

  // ── Brittleness guard: no reverse-engineering error-message strings ──
  // rationale: structure baked into an error MESSAGE and reparsed by string-
  // matching is the ADR-0002 silent-failure class reached through the error
  // path — a format drift degrades a typed failure to "unknown error" with no
  // compile error. Fix: a structured Error subclass with fields, consumed by
  // `instanceof` + field branch (api-client.ts's ApiError is the worked form).
  // Syntactic best-effort (catches the direct `.message.{includes,match,…}`
  // and `/re/.test(err.message)` shapes; NOT a message via an intermediate
  // variable — gap named per ADR-0002). Measured 0 hits on src at adoption →
  // adopted at `error`; a future non-error `.message` read takes an inline
  // eslint-disable + justification (the vue/no-v-html model). Full rationale
  // in the header; G1 in docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md.
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "CallExpression[callee.property.name=/^(includes|match|startsWith|endsWith|indexOf|search)$/][callee.object.property.name='message']",
          message:
            "Don't reverse-engineer structure out of an error MESSAGE string " +
            '(ADR-0002 brittleness hazard). Throw/consume a structured Error ' +
            'subclass with fields (e.g. ApiError { status, body }) and branch ' +
            'on `instanceof` + the field. See ' +
            'docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md (G1).',
        },
        {
          selector:
            "CallExpression[callee.property.name=/^(test|exec)$/][arguments.0.type='MemberExpression'][arguments.0.property.name='message']",
          message:
            "Don't match a regex against an error MESSAGE to recover structure " +
            '(ADR-0002 brittleness hazard). Use a structured Error subclass ' +
            'with fields. See docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md (G1).',
        },
        // Cast hygiene, stage 1 — script side (.ts + .vue <script>). Lives
        // in this same array because flat config replaces a rule's entire
        // entry per file rather than merging across blocks; a second
        // no-restricted-syntax block for the same files would silently
        // drop the G1 selectors above. Rationale + measured adoption in
        // the header; selector constant above.
        ...ANY_ASSERTION_SELECTORS,
        // Profile aliased-write guards — same single-block constraint;
        // rationale + measured adoption at the selector constant above.
        // The owner module (src/store/profile-owner.ts) carries the two
        // sanctioned root-supplier sites as annotated inline disables.
        ...PROFILE_ALIASED_WRITE_SELECTORS,
      ],
    },
  },

  // ── Cast hygiene, stage 1 — template side ──
  // rationale: a cast inside a <template> expression is the same
  // silent-coercion hazard as a script-side one, and SFC template casts
  // were never measured before this rule (history-lessons audit §8). The
  // core no-restricted-syntax rule walks the script AST only; the vue
  // variant applies the same selectors to <template> expressions.
  // Measured at adoption: 37 template-side casts, 0 of them any-targeted
  // ⇒ clean `error` adoption (a clean regression gate, like
  // switch-exhaustiveness-check).
  {
    files: ['src/**/*.vue'],
    rules: {
      // Template side carries the profile aliased-write guards too:
      // <script setup> exposes every top-level binding to the template,
      // so an imported updateRegistry/writeKnobValue is template-callable
      // in principle (0 template hits at adoption — a clean gate).
      'vue/no-restricted-syntax': [
        'error',
        ...ANY_ASSERTION_SELECTORS,
        ...PROFILE_ALIASED_WRITE_SELECTORS,
      ],
    },
  },

  // ── Producer-ownership guard for the card-tree slot (custom local rule) ──
  // rationale: the per-board card-tree slot has three producers (runPipeline,
  // seedFromQueue/review, loadBrowse*/navigator) and one mid-session clearer
  // (the browse policy's null-selection clearBrowse). The clearer reset() the
  // slot blind, wiping a forest a different producer owned — the
  // forest-vanishes-on-tab-away/back bug (review AND pipeline-preview). The fix
  // tags the slot with `source` and clears only what it owns; the prior fix
  // gated on a per-writer flag (isReviewActive), which covered one producer and
  // missed the next — the exact failure a per-writer guard invites. This rule
  // keeps a clearer from going blind again: a function in useCardTreeData.ts
  // that empties the slot (reset() or `.forest = []`) must reference `source`
  // or call a repopulator (populateSlotFromMatched). Best-effort + syntactic,
  // same posture as the error-message guard above (the per-function-body /
  // by-name gaps are named in the rule file, not papered over). It would have
  // caught the shipped bug's literal shape — verified by reintroducing the
  // blind clear and observing it fire. Scoped to the one slot that has this
  // shape today; the rule is configurable, so a second owned multi-writer slot
  // adds another block. See frontend/docs/notes/board-scope.md.
  {
    files: ['src/composables/cards/useCardTreeData.ts'],
    plugins: { local: LOCAL_RULE_PLUGIN },
    rules: {
      'local/clear-needs-ownership': [
        'error',
        {
          emptier: 'reset',
          emptyField: 'forest',
          ownershipField: 'source',
          repopulators: ['populateSlotFromMatched'],
        },
      ],
    },
  },

  // ── GlobalStore writer enumeration (custom local rule) ──
  // rationale: multi-writer store slots want OWNERS, not per-writer
  // gates (history-lessons audit L2 / §3.7 leg (iv); work-status item
  // multi-writer-slots-get-owners; recorded as an ADR-0001 amendment —
  // the Revisit-#3 response). ADR-0001 dropped compiler enforcement of
  // the named-mutator convention and assigned the residue to review
  // vigilance ("grep for direct `.boards[` writes during review");
  // that prose duty decayed exactly as lesson L1 predicts — at
  // measurement, store.engine had ~20 direct writers scattered through
  // analysis-service (incl. a duplicated disconnect-reset block and
  // writes bypassing the one named mutator). This rule mechanizes the
  // vigilance as a data-driven {subtree → owner files} enumeration: a
  // write to a configured subtree outside its owner files is an error;
  // a NEW writer must consciously join the enumeration or route
  // through the owner. ADR-0001's template-toggle exception is carved
  // out as config (template-context-only, session.ui prefix — the
  // exception's terms quoted in the rule file's header). Measured at
  // adoption (2026-06-10), branch-point baseline → post-fix:
  //   - store.engine: 20 unowned writes (all analysis-service.ts) → 0
  //     (collapsed into services/engine-connection.ts, the subtree's
  //     owner module).
  //   - store.boards: 0 → 0 (the mutator convention already held; the
  //     one out-of-band write — analysis-service's maxVisitsTarget —
  //     was an aliased write through `boards.find()`, outside this
  //     rule's syntactic reach; routed through mutateBoard in the same
  //     change).
  //   - store.profile: 10 → 10, all triaged as annotated exemptions
  //     (inline disable + slice-naming justification, the vue/no-v-html
  //     model). Five script sites: useLocale's locale leg, useQeubo's
  //     parameter-apply and bookmark-clear legs, scenarioContext's
  //     DEV-only save/restore pair. Five template v-models in
  //     AnalysisControls.vue, all on settings leaves: activePaletteId
  //     plus the four adaptiveReevaluate leaves (enabled /
  //     worstQuantile / extraVisits / valueBinding) — template writes
  //     to PROFILE state, outside the ADR-0001 session.ui sanction, so
  //     named as debt rather than exempted by config. (Corrected
  //     2026-06-10 per PR #382's out-of-frame audit: this comment
  //     originally said "6 → 6" and named only activePaletteId — a
  //     stale draft census; the tree carried 10 annotations at
  //     adoption, matching the worklog/PR/ADR-amendment record.)
  //     Discharge filed: work-status item settings-profile-mutator-owner
  //     (the settings-editor mutator arc the annotations point at).
  //     (Discharged 2026-06-11 — that item shipped: store.profile gained
  //     an owner module, src/store/profile-owner.ts (mutateProfile /
  //     updateProfileAt / writeStoreKnobValue), joined to the owners
  //     list below; all 10 annotated exemptions rerouted through it and
  //     removed (10 → 0); the aliased generic-machinery shapes the
  //     PR #382 audit enumerated (updateRegistry over a store.profile
  //     root; writeKnobValue/writeKnob with the store root) are now
  //     guarded by PROFILE_ALIASED_WRITE_SELECTORS above, and the
  //     keybindings-capture binding mutators — an aliased writer family
  //     that enumeration missed, found by the at-HEAD re-derivation —
  //     route through the owner too. The 2026-06-10 baseline above
  //     stands as the historical record.)
  //   ⇒ adopted at `error` on a fully-triaged baseline, per this
  //   config's measure-first posture. Named gaps in the rule file
  //   (aliased roots, method-call mutations, name-matched `store`).
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    plugins: { local: LOCAL_RULE_PLUGIN },
    rules: {
      'local/store-write-needs-owner': [
        'error',
        {
          subtrees: [
            // The boards array and its set/content mutations: the
            // named mutators + workspace orchestrators.
            { path: 'boards', owners: ['src/store/index.ts'] },
            // The analysis-provider connection subtree: the named
            // mutator + system-message actions (store) and the
            // connection-lifecycle owner module.
            {
              path: 'engine',
              owners: ['src/store/index.ts', 'src/services/engine-connection.ts'],
            },
            // The persisted profile: reset/hydrate live in the store;
            // every other writer routes through the owner module
            // (settings-profile-mutator-owner — see the census
            // appendix in the rationale comment above; the prior
            // shape's 10 annotated inline exemptions are retired).
            {
              path: 'profile',
              owners: ['src/store/index.ts', 'src/store/profile-owner.ts'],
            },
          ],
          // ADR-0001 "Exception: UI state written directly from
          // templates" — small UI toggles on store.session.ui.* may
          // write directly from <template>; quoted in full in the
          // rule file's header. Template context only; script-side
          // writes to the same paths are NOT exempt (session.ui is
          // not an enumerated subtree today, so this entry encodes
          // the sanction for the day store.session joins the map).
          templateToggleExemptPrefixes: ['session.ui'],
        },
      ],
    },
  },

  // ── Vue lifecycle footgun guards (custom local rules) ──
  // The two expressible classes from five paid-for footgun investigations
  // (2026-06-10 history-lessons audit §3.12; work-status item
  // vue-lifecycle-footgun-guards), sharing a signature: correct-looking
  // code whose scope/default silently differs from the author's intent,
  // latent until a second consumer with a different lifecycle arrives.
  //
  // rationale (gate-prop-needs-default): Vue casts an OMITTED boolean prop
  // to `false`, so a gate-named boolean prop without an explicit default
  // silently suppresses for every consumer that omits it — the BaseChart
  // `active` blank-chart + ecModel crash. Keyed on name patterns
  // (active/enabled/visible as word segments), NEVER a component
  // allowlist. Stock vue/require-default-prop and vue/no-boolean-default
  // were assessed first and rejected on measurement — full assessment
  // record + adoption baselines in the header; named gaps in the rule
  // file. Runtime half: tests/integration/gate-prop-omission.ts.
  //
  // rationale (module-intent-in-script-setup): <script setup> compiles
  // into setup(), so a top-level declaration claiming module intent
  // ("loaded once" / "shared across instances") is per-instance in
  // reality — the MiniBoardCanvas texture-flash class; its plain-<script>
  // fix is the worked example. Triggers on the CLAIM (comment patterns,
  // shared* names), deliberately NOT on all top-level let/Map/Set —
  // per-instance non-reactive state is sanctioned (the imperative-escape
  // cached-dims pattern). Full rationale in the header + rule file.
  {
    files: ['src/**/*.vue'],
    plugins: { local: LOCAL_RULE_PLUGIN },
    rules: {
      'local/gate-prop-needs-default': [
        'error',
        { gateWords: ['active', 'enabled', 'visible'] },
      ],
      'local/module-intent-in-script-setup': 'error',
    },
  },

  // ── Cast hygiene, stage 2 — justification-adjacency (custom local rule) ──
  // rationale: the cast-justification PROSE rule (frontend/CLAUDE.md "an
  // `as` needs a justification or it doesn't ship") held at ~50% in the
  // 2026-06-10 history-lessons sample (L1) — the memory-bound decay ADR-0011
  // Rule 2 converts to mechanism. Stage 1 (eslint.config.js above) banned
  // the `as any` corner; this rule covers the rest of the coercion-cast
  // population: every `x as T` / `<T>x` (excluding `as const` and the inner
  // hop of a double cast) needs an adjacent justification — a same-line
  // trailing comment, a comment on the line directly above, or an
  // eslint-disable-*-line `-- reason` hatch (the vue/no-v-html model).
  // Template-expression casts are covered via the templateBody token store
  // (the justification carrier there is an inline `/* reason */` block
  // comment; an HTML `<!-- -->` comment is markup, not a JS token — named
  // gap in the rule file). Measured at adoption (2026-06-11, AST-grade
  // scratch run over src/): 405 coercion casts (368 script + 37 template),
  // 321 unjustified at baseline; burned down to 0 outside the two frozen
  // migration files (delete via sound typing where redundant — ~16 deleted,
  // incl. the 25 RegistryEditor template casts via a typed `entries`
  // computed; justify in place otherwise — ACL Band-2 brand mints,
  // decode-frontier open-record probes, ECharts tuple/param coercions; the
  // `as unknown as` double-casts re-measured at 27, each justified naming
  // the brand-strip/structural-mismatch — the documented IDENTIFIERS.md
  // erosion (b) strips named explicitly). The 68 casts in the two frozen
  // migration files are exempted by FROZEN_MIGRATION_FILES (freeze overrides
  // the justification edit — see that constant's rationale) ⇒ adopted at
  // `error` on a fully-triaged baseline, per this config's measure-first
  // posture (ADR-0011 Rule 3). Named gaps in the rule file (line-based
  // adjacency, no quality judgment, intermediate-variable comments). Runs on
  // .ts + .vue (script and template surfaces).
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    ignores: FROZEN_MIGRATION_FILES,
    plugins: { local: LOCAL_RULE_PLUGIN },
    rules: {
      'local/justification-adjacency': 'error',
    },
  },

  // ── Branded-path guard — hand-rolled-path-walk (custom local rule) ──
  // rationale: the branded-paths arc (PR #386) routed root-to-X game-tree
  // path derivations through NAMED producers in engine/navigator.ts
  // (`getPath`, `rootToCurrentPrefix`) / engine/util.ts
  // (`getActiveVariationPath`) that mint the RootToCurrentPath /
  // RootToLeafPath brands. A brand protects only what its typed producer
  // mints; a hand-rolled `while (cur) { acc.push(cur); cur = cur.parent }`
  // re-derivation under a different name produces a bare `NodeId[]` and
  // escapes the brand — the "wrong name" leak the arc named. This rule
  // (shape predicate: a loop body that BOTH accumulates an array AND walks
  // the `.parent` chain) flags hand-rolled walks outside the producers.
  // Measured at adoption (2026-06-11, scratch run): 3 hits — useActivePath.ts
  // (ZERO consumers — dead legacy producer), BoardWidget.vue's
  // moveNumbersByCoord (render-coupled computed), useTreeExpansion.ts's
  // ensureVisible (the ADR-0010 nav-cost perf guard). All three are
  // behaviour/perf-sensitive to refactor through getPath, so each carries an
  // annotated inline exemption naming the revisit trigger (route through
  // getPath in the path-consolidation arc / delete the dead producer) ⇒
  // adopted at `error` on a fully-triaged baseline (the vue/no-v-html
  // model). The producers are a {file → fn-name} allowlist, NOT a blanket
  // file ignore, so a NEW hand-rolled walk added to navigator.ts under a
  // different name is still flagged (ADR-0011 Rule 4 deny-by-default).
  // Named gaps in the rule file (same-cursor not proven; intermediate-var
  // `.parent`; recursion not a loop node).
  {
    files: ['src/**/*.ts', 'src/**/*.vue'],
    plugins: { local: LOCAL_RULE_PLUGIN },
    rules: {
      'local/hand-rolled-path-walk': [
        'error',
        {
          producers: {
            'engine/navigator.ts': ['getPath', 'rootToCurrentPrefix'],
            'engine/util.ts': ['getActiveVariationPath'],
          },
        },
      ],
    },
  },
];
