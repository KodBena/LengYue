# Component→service boundaries resolved + frontend CI gate

- **Status:** Done 2026-06-01 (frontend). Closes the two standing items
  agreed after the perf/memory quartet: (1) the 5 component→service
  import-boundary violations the ESLint rule (adopted in #316) was flagging,
  and (2) the absence of a frontend CI gate.
- **Genre:** Code hygiene + infrastructure. Makes the safety nets we built
  (the import-boundary lint, the render-count regression guards, the test
  suite) load-bearing instead of run-when-remembered.
- **Date:** 2026-06-01.

## Why

`npm run lint` had 5 standing `no-restricted-imports` errors — components
importing effectful service singletons directly, which the architecture
(frontend CLAUDE.md "Architectural shape") says route through composables.
They were the "existing warnings we'll come back to" from the eslint
adoption. And nothing gated any of it: lint, `vue-tsc`, the 769-test suite,
and the ADR-0010 render-count guards all ran only locally. For a
single-maintainer project (no second reviewer), an automated gate is the
substitute that catches a boundary violation / render-coupling regression /
type error before it lands — so the two items are one arc.

## Boundary fixes (all 5 → green)

Each effectful call moved into a composable (the component-specific
writeback — queue splice, tree `setCard`, etc. — stayed in the component;
only the service touch-point moved):

- **`LibraryTab`** → `useLibraryPreview.fetchGame` (the composable already
  imported `getGame` for its selection watcher; exposed it).
- **`ReviewSessionPanel` + `ForestDirectory`** (`updateCardMetadata`) → new
  `useCardMetadata` (`composables/cards/`), shared by both.
- **`ForestDirectory`** (`getForestStats`) → new `useForestStats`
  (`composables/forest/`).
- **`AnalysisControls`** (`save` / `discard` / `summaryFor` /
  `autoSaveErrorFor` / `stopBoardAnalysis`) → new `useAnalysisPersistence`
  (`composables/analysis/`), taking a `() => BoardId` getter so the
  summary/error computeds track the active board.

The ADR-0010 distinction held: `AnalysisControls`'s reactive `ledger`
read (`analysis-ledger`, the read-locality exemption — a reactive-state
module a display leaf may read directly) **stayed in the component**; only
the restricted effectful singletons moved. So the fix respects both the
boundary rule and the documented read-locality tension rather than
flattening one into the other.

## CI gate

`.github/workflows/frontend-ci.yml` — on every frontend PR (and push to
main): `npm ci` → `npm run build` (`vue-tsc -b && vite build`) → `eslint .`
→ `npm run test:run`. Scoped to `frontend/**` (the proxy submodule has its
own workflows; the backend is independent). The env-gated e2e suites skip
automatically (no live proxy in CI). Mirrors the proxy's `typecheck.yml`
posture. `frontend/CLAUDE.md` + `tests/CLAUDE.md` updated — CI is no longer
a "follow-up."

## Verification

`npm run build` clean, `eslint .` **green (0 errors)**, suite **769 passed
/ 3 skipped**. (Build flags the pre-existing 3.2 MB bundle-size warning —
the jQuery-UI + ECharts weight, noted as a mobile-readiness factor in the
memory-profiling worklog; not introduced here.)

## License

Public Domain (The Unlicense).
