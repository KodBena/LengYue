# Worklog — Vue lifecycle footgun guards: gate-props, module-intent state, residue checklist (2026-06-10)

> Audit trail for work-status item `vue-lifecycle-footgun-guards`,
> executing §3.12 of the 2026-06-10 history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`); branch
> `bork/tooling/vue-lifecycle-footgun-guards`, PR #380. Three legs: two
> custom lint rules mechanizing the two expressible footgun classes from
> the five paid-for investigations, a reusable omission rendering guard
> generalized from the BaseChart test, and one `frontend/CLAUDE.md`
> checklist section consolidating the three residue lessons no mechanism
> can catch.

## The change

The five investigations (worklogs: 2026-06-08 BaseChart `active`
default; 2026-06-09 MiniBoardCanvas texture scope; 2026-05-30 TreeWidget
nav cost; 2026-05-22 responsive arc; 2026-05-16 match cursor
independence) share a signature the audit named: correct-looking code
whose scope or default silently differs from the author's intent, latent
until a consumer with a different lifecycle arrives. Two of the classes
are syntactically expressible and are now lint rules; three are residue
and are now a checked CLAUDE.md section.

1. **`local/gate-prop-needs-default`**
   (`frontend/eslint-rules/gate-prop-needs-default.js`). Vue casts an
   omitted boolean-typed prop to `false`, not `undefined`, so a
   gate-named boolean prop without an explicit default silently
   suppresses for every consumer that omits it — `4756c30`'s "other
   consumers unaffected" claim, falsified by `69810e2` (blank
   intermission chart + `ecModel` crash). vue-tsc cannot police this
   even in principle: omission of an optional prop is type-legal. The
   rule keys on **name patterns** (`active` / `enabled` / `visible` as
   camelCase/snake_case word segments), never a component allowlist (the
   enumerated-blocklist failure shape). A flagged prop satisfies the
   rule with a `withDefaults` entry (any value — an explicit `false` is
   a *chosen* semantic), a runtime `default:`/`required: true`, or by
   being non-optional. Named gaps in the rule file per ADR-0002:
   imported props types and intersections unresolved; `true | false`
   literal unions unrecognised; options-API `props:` not walked.

2. **`local/module-intent-in-script-setup`**
   (`frontend/eslint-rules/module-intent-in-script-setup.js`).
   `<script setup>` compiles into `setup()`, so a top-level declaration
   claiming module intent ("loaded once", "shared across instances") is
   per-instance in reality — the MiniBoardCanvas texture-flash class
   (`463a15e`); the shipped fix's plain-`<script>` block with its "MUST
   live in a plain `<script>`" banner is the worked example the rule
   codifies. Triggers on the **claim** — curated comment patterns
   (leading, or trailing on the declaration's line) plus `shared*`
   identifier names, both configurable — and deliberately **not** on all
   top-level `let`/`Map`/`Set`: per-instance non-reactive state is a
   sanctioned idiom (the imperative-escape cached-dims pattern;
   MiniBoardCanvas's own `cssW`/`cssH` stay clean). Named gaps per
   ADR-0002 (the project's established guard posture): intent never
   written down is undetectable — the CLAUDE.md convention is the policy
   half; the pattern list is curated, extended when a new phrasing is
   paid for; nested-callback state is not examined.

3. **Reusable omission rendering guard**
   (`frontend/tests/integration/gate-prop-omission.ts`,
   `assertOmittedGatePropMeansActive`). Generalizes the omitted-prop
   rendering test that existed inline for BaseChart: mounts with the
   gate prop omitted, flushes, asserts a caller-supplied "did the gated
   work run" probe, throws up front if the caller accidentally passes
   the gate prop (a vacuous guard, ADR-0002), and registers unmount via
   `onTestFinished` (the failure-safe-teardown discipline,
   tests/CLAUDE.md). `BaseChart-collapsed-gate.test.ts`'s omission case
   now drives the helper and is its worked example; the next gate-prop
   component supplies a component, a probe, and nothing else.

4. **`frontend/CLAUDE.md` — "Vue/CSS footgun checklist (paid-for
   lessons)"**. One section, placed after the imperative-escape pattern.
   The two mechanized classes appear as pointers to the lint rules (not
   restated rationale); the three residue lessons get their consolidated
   home: `v-memo` key-stability under a churning `shallowRef`
   (2026-05-30 worklog — the source-reactivity-shape check, per-item
   over group memo), container-query self-styling (2026-05-22 worklog
   iter-16/17 — `@container` styles descendants only, silently),
   `structuredClone` vs the reactive `Proxy` (2026-05-16 worklog —
   `toRaw` strips one layer; JSON round-trip for POJO shapes). ADR-0010's
   corollary and the resource-ownership checklist are cross-linked, not
   restated — the corollary's canonical home stays the render-locality
   section/ADR-0010.

Config wiring: the two rules mount in one new `src/**/*.vue` block in
`frontend/eslint.config.js`; the per-rule rationales live in the header
(with the stock-rule assessment record) and at the block, per the
config's rule-rationale discipline. The three local rules now share one
`LOCAL_RULE_PLUGIN` constant — flat config treats two different plugin
objects under the same namespace as a redefinition error when globs
overlap, so the clear-needs-ownership block's inline object was a
future-overlap landmine; it now references the shared constant
(behaviour-preserving).

## Stock-rule assessment (measured first, per the config's posture)

Both candidate `eslint-plugin-vue` rules were run over `src/` via a
scratch config (never committed) before any custom rule was written:

- **`vue/require-default-prop` — REJECTED.** 11 hits, every one a
  non-boolean optional prop whose `undefined` is a genuine load-bearing
  sentinel (BaseChart `title`/`reservedWidth`/`reservedHeight`/
  `activeIndexAccessor`/`zoomRange`/`normalize`/`formatXAxis`/
  `formatXTooltip`/`tooltipFormatter`; ChartPreviewBox `accessor`;
  TreeWidget `gameHeadIds`). Decisively: the rule exempts boolean props
  **by design** — it treats Vue's false-cast as the sanctioned default —
  so it cannot catch the gate-prop class at all. Adopting it would
  impose 11 noise defaults and still not have caught `69810e2`.
- **`vue/no-boolean-default` — REJECTED.** 6 hits, every one a
  deliberate explicit boolean default the codebase chose
  (`showMarker: false` in MiniBoardCanvas/MiniBoardSvg/ChartPreviewBox,
  `keepMounted: false` in TabWidget, `compact: false` in KnobSlider —
  and BaseChart's `active: true`, the shipped fix itself). The rule
  encodes the **opposite** convention (boolean props must default
  falsy); adopting it would have the 2026-06-08 fix deleted. Per the
  item description's warning, not adopted.

## Measured baselines and false-positive calibration

- `gate-prop-needs-default`: exactly **1** gate-named boolean prop
  exists in `src` (BaseChart `active`), already carrying its
  `withDefaults` default ⇒ **0 hits**, clean `error` adoption.
- `module-intent-in-script-setup`: **0 hits**. Every current
  module-intent comment in `.vue` files was inspected against the
  patterns: BaseChart's "Module-scoped singleton" (`globalLegendState`)
  sits in a plain `<script>` block (out of the rule's range — correct);
  App.vue's "…not module scope" and ReviewSessionPanel's "…is
  module-scope (`pendingAnalysisAborts`…)" describe state elsewhere and
  do not match the claim shapes; KeybindingRow's header references a
  real `.ts` module; BoardWidget's "shared across all three ownership
  sub-modes" shares across *sub-modes*, not instances, and attaches to a
  function besides. `npx eslint src` exits 0 with both rules at `error`.

## Verification against the original defects

- **Gate-prop lint probe** (scratch, reverted): deleting `active: true`
  from BaseChart's `withDefaults` object — the `4756c30` defect shape —
  fires the rule at the `active?: boolean` signature (40:3). Restored;
  clean.
- **Module-intent lint probe** (scratch, reverted): reintroducing the
  shipped bug's literal shape — a "loaded once, shared across instances"
  comment + declaration and a trailing "shared across every instance"
  claim inside `<script setup>` — fires on exactly the two probe
  declarations. The first probe run caught a rule wart worth recording:
  `getCommentsBefore` attributes a previous declaration's same-line
  *trailing* comment to the next declaration, which double-reported an
  innocent neighbour; fixed (trailing comments of the previous statement
  are excluded) and re-probed before adoption. A third probe verified
  the `shared*` name trigger fires without any comment. Restored; clean.
- **Test red/green**: flipping BaseChart's default to `active: false`
  turns the helper-driven omission test red at the probe assertion
  (message names the boolean-cast footgun); restored to green. This
  re-verifies the 2026-06-08 worklog's red/green through the generalized
  helper.

## Exemptions

None. Both rules adopted at `error` on 0-hit baselines; no inline
disables introduced anywhere.

## Deviations from the item description

None material. Two scoping notes: the test helper lives at
`tests/integration/gate-prop-omission.ts` (beside `with-setup.ts`, the
existing helper precedent) — FILES.md maps `src/` only, so no FILES.md
row; and the helper deliberately covers the omission leg only (the
collapsed-gate suppression leg stays a per-component assertion — its
observable semantics are component-specific).

## Documentation audit

- **Work-status store:** read-only this session per the commission; the
  item's closure is the maintainer's call on merge.
- **frontend/CLAUDE.md:** the new checklist section (leg 3). The
  render-locality section and ADR-0010 are cross-linked unchanged — the
  corollary is not restated.
- **FILES.md / IDENTIFIERS.md / FEATURES.md / handoff:** no `src/` file
  created/moved/deleted; no new brands; no user-facing capability
  change; no orientation change. `eslint-rules/` is outside FILES.md's
  mapped tree (precedent: `clear-needs-ownership.js` has no row).
- **Doc-graph:** this worklog is a new node — regenerated via
  `node tools/doc-graph/generate.mjs` in the same change.

## Verification

`npm install` + `npm run build` green (vue-tsc + vite); `npx eslint .`
exit 0; `npm run test:run` 865 passed / 4 skipped. All probe edits were
scratch-only and reverted before commit; the scratch measurement config
was deleted before commit.

License: Public Domain (The Unlicense).
