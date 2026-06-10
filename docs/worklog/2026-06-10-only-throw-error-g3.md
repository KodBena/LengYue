# Worklog — RCA G3 adopted: @typescript-eslint/only-throw-error (2026-06-10)

> Audit trail for the RCA G3 adoption, maintainer-approved 2026-06-10 via
> the E4 sign-off (`docs/notes/audit/audit-deferral-harvest-2026-06-10.md`
> §4.2/§7: "adopt, measure-first per the `a75814c` pattern; adoption
> record lands in the config rationale citing the RCA, per the G1
> precedent"). Guard rationale:
> `docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md` §4 — G3 is
> rated there as adjacent-door hygiene, explicitly **not** the Lapse-1
> guard (the Lapse-1 throw WAS an `Error`; its structure was lost in the
> message — that door is G1's). Branch `bork/tooling/only-throw-error-g3`,
> PR #387.

## The change

`@typescript-eslint/only-throw-error` is adopted at `error` in
`frontend/eslint.config.js`'s existing type-checked block
(`src/**/*.ts`, TS project service — the rule is type-aware, so it can
only run where type info is wired). Rationale entries land in the
header's Type-checked section and at the rule site, in the established
"measured at adoption … resolved" register. The rule runs on its
defaults (`allowThrowingAny` / `allowThrowingUnknown` /
`allowRethrowing`): tightening any of them would break the codebase's
sanctioned `throw err` rethrow idiom over `unknown`-typed caught
values, so the rule polices *constructed* throws, not propagation —
named as a gap per ADR-0002, not papered over.

## Measured baseline (the `a75814c` measure-first pattern)

The rule ran at `warn` over the tree in a scratch config (never
committed) before severity was picked and before any annotation
existed. Every hit and every deliberately admitted population:

| Population | Result | Decision |
|---|---|---|
| `analysis-persistence-service.ts:240` — `rethrowAsStorageError` throwing the parsed `AnalysisBundleStorageError` union | **hit** (the only one on src) | exempt-with-annotation — deliberate structural-union throw (per-site record below) |
| `throw err` rethrows of `unknown`-typed caught values (useAuth ×3, qeubo-service's `rethrowAs` ×8, api-client, library-service, backend-service, useQeubo ×3, usePlayFromPosition ×2, useReviewSession, useJankTest, dsl-harness, analysis-persistence-service) | no hit | admitted by the rule's defaults — the rethrow idiom; defaults kept deliberately |
| `.vue` `<script>` throw sites | outside the rule's scope (type info is wired for `src/**`'s `.ts` only) | named gap; censused by grep at adoption: exactly 1 site (`KeybindingsView.vue:43`), a proper `new Error` — compliant by inspection |
| `tests/**` throw sites | outside the lint surface (`ignores` block) | scope kept, per the cast-hygiene staging record's tests-lint later-step deferral; censused at adoption: test fakes throw deliberately to drive error branches, all `new Error` / `Error`-subclass-shaped (`AnalysisWaitError`, `ApiError`), zero non-Error throws |

Baseline = 1 hit, fully triaged ⇒ the rule adopts at **`error`**,
matching the config's zero-or-fully-triaged posture.

## Per-site decision: the one hit

`rethrowAsStorageError` (analysis-persistence-service.ts) throws the
`AnalysisBundleStorageError` union when the api-client's `ApiError`
body matches one of the three known storage envelopes. Judged from the
site's own contracts, the non-Error throw is **deliberate**, so the
verdict is annotate-with-justification, not fix:

- The union is documented in `analysis-bundle.ts` as a structural
  discriminated union ("consumers pattern-match on `kind`"); its
  consumers narrow by field checks (`AnalysisControls.vue`'s
  `isStorageError` checks `'kind' in err && 'status' in err`), never
  `instanceof`.
- The structural choice is load-bearing in the lint architecture
  itself: the component→services deny-by-default boundary admits
  `AnalysisControls.vue`'s **type-only** import of the union via
  `allowTypeImports`, and the config header's classification record for
  analysis-bundle ("its component-visible surface is type-level only")
  leans on the no-instanceof property. An `Error`-subclass conversion
  would be a contract change across the union's four consumer files
  (analysis-bundle, analysis-persistence-service, useAutoSaveAnalyses,
  AnalysisControls.vue) — a separate arc, not lint hygiene.

The exemption is an inline `eslint-disable-next-line` + justification
(the `vue/no-v-html` escape-hatch model), with the contract spelled out
in the block comment above the function.

## Interaction check (commission point 4)

- **Custom local rules** (`clear-needs-ownership`,
  `gate-prop-needs-default`, `module-intent-in-script-setup`,
  `store-write-needs-owner`): none touch `ThrowStatement`; no selector
  or scope overlap.
- **Flat-config mechanics:** the rule joins the *existing* type-checked
  block (a third rule name alongside `switch-exhaustiveness-check` and
  `no-floating-promises`), so there is no same-rule-name replacement
  hazard and no new plugin-object mount.
- **G1 selectors** (`no-restricted-syntax` on `.message` reparse):
  different rule, different surface (read side vs throw side); the two
  guards are complementary doors on the same ADR-0002 class.
- **Tests:** `tests/**` stays in the `ignores` block — the lint-scope
  decision recorded in the cast-hygiene staging record stands; test
  fakes' deliberate throws are unaffected.

## Drive-by correction, named

The four citations of the G1 RCA in `eslint.config.js` (two header
sites, two dev-facing `message` strings) pointed at the RCA's pre-move
location (directly under `docs/notes/`, where the file no longer
exists — it lives under `docs/notes/postmortem/`). Live source
pointing developers at a 404 is the silent-failure shape G1 itself
polices, so the four paths were corrected in this change. (The dead
literal is deliberately not reproduced here — a path-mention of it
would mint a fresh dangling edge in the doc-graph report.)
Archived docs carrying the old path are point-in-time records and stay
untouched (their dangling refs are already tracked by
`docs/doc-graph-report.md`).

## Discovered while triaging — latent defect, flagged not fixed

The triage surfaced a fake-fidelity divergence in the auto-save pause
path, recorded here loudly per ADR-0002 (out of this arc's scope; the
todo DB is read-only for this session, so filing the item is the
maintainer's):

- The real `save()` path rethrows the **parsed union** via
  `rethrowAsStorageError` when a 413 storage envelope matches.
- `useAutoSaveAnalyses.ts:131` catches and re-parses with
  `parseStorageError(err)` — whose first check is
  `err instanceof ApiError` (`analysis-bundle.ts`). The thrown union is
  a plain object, so the parse returns `null` and the
  `setAutoSaveError` pause branch **cannot fire against the real
  service**.
- The integration test passes because the fake's `save` mock rejects
  with a raw `ApiError` carrying the envelope
  (`tests/integration/useAutoSaveAnalyses.test.ts:174`) — an input
  shape the real `save()` never produces.

Likely fix shape (for the follow-up arc, not done here): narrow
structurally in the composable (the `isStorageError` guard shape) *or*
have the fake reject with the union to match the real contract — plus
a regression test pinning the real throw shape.

## Documentation audit

- **Work-status store:** read-only per the commission; no writes. G3's
  adoption record lives in the config rationale per the E4 sign-off's
  own disposition ("adoption record lands in the config rationale") —
  no open item existed for G3 (the harvest audit deliberately did not
  file one, deferring to the maintainer question that E4 answered).
  The latent defect above is named for the maintainer to file.
- **FILES.md / IDENTIFIERS.md / FEATURES.md / handoff:** no files
  created, moved, or deleted; no new brands; no user-facing change; no
  orientation change.
- **ADR Revisit-when triggers:** none fire (ADR-0010's lint-growth
  posture is the home this rule joins; no trigger text names throw
  hygiene).
- **Doc-graph:** this worklog is a new node — regenerated via
  `node tools/doc-graph/generate.mjs` in the same change.

## Verification

`npm install` + `npm run build` green (vue-tsc + vite); `npx eslint .`
exit 0; `npm run test:run` 882 passed / 4 skipped (54 files passed /
3 skipped). The scratch measurement config was deleted before commit.

License: Public Domain (The Unlicense).
