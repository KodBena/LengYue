# Drop dead jQuery + jQuery-UI (−334 kB / −97 kB gzip)

- **Status:** Done 2026-06-01 (frontend). A bundle-weight win surfaced while
  scoping the 3.2 MB bundle the build warns about.
- **Genre:** Dead-code removal + dependency prune (measured perf win).
- **Date:** 2026-06-01.

## Finding

`jquery` + `jquery-ui-dist` were **vestigial scaffold** — present since the
`initial` commit, never wired to anything. `src/jquery-bridge.ts` force-loads
`$` / `jQuery` onto `window`, and `main.ts` side-effect-imported
`jquery-ui-dist/jquery-ui`, but exhaustive search found:

- **Zero** `$` / `jQuery` / `window.$` / `$(` usage anywhere in `src/`
  (templates included) outside those two shim files.
- **Zero** jQuery-UI widget invocations (`.dialog` / `.draggable` / `.slider`
  / … — none) and **zero** jQuery-UI CSS / `.ui-*` class usage.
- No jQuery **plugin** dependencies (nothing extends `$.fn` / expects global
  `$`); the other deps (sabaki, codemirror, echarts, lodash-es, vue) are
  modern ESM libs.
- No test usage.

So they were pure dead weight loaded into every page.

## Removal

- `main.ts`: dropped `import './jquery-bridge'` + `import 'jquery-ui-dist/jquery-ui'`.
- Deleted `src/jquery-bridge.ts`.
- `package.json`: removed `jquery`, `jquery-ui-dist`, `@types/jquery`,
  `@types/jqueryui`; `npm install` updated the lock.

### Also: unused `lodash-es` (tree hygiene, not a bundle change)

The same dead-dep sweep found `lodash-es` declared but **never imported**
(0 mentions in `src/`). Removed it too. Because nothing imported it, it was
never bundled — so the bundle is unchanged; this is dependency-tree hygiene
(one fewer install, no dead direct dep), not a further size cut.

### Kept: `buffer` (verified load-bearing)

`buffer` *looked* dead (0 `Buffer` mentions in `src/`) but is **needed** —
`vite.config.ts` aliases `buffer: 'buffer/'` to polyfill Node's `Buffer` for
`@sabaki/sgf` (its `tokenize.js` / `main.js` use it), so removing it would
break SGF parsing in the browser. Kept. (The "look before you delete" check
earning its keep — `buffer`'s consumer is a dependency, not our `src`.)

## Measured win

| | raw | gzip |
|---|---|---|
| before | 3,217.99 kB | 1,112.28 kB |
| after | 2,883.61 kB | 1,014.82 kB |
| **delta** | **−334.4 kB (−10.4%)** | **−97.5 kB (−8.8%)** |

A measured before/after on the production bundle (the honest substantiation
for a load-weight claim). Bears on the mobile-readiness bundle-weight factor
flagged in `docs/worklog/2026-06-01-memory-profiling-session.md`.

## Verification

`npm run build` clean · `eslint .` green · suite **770 / 3 skipped** ·
**runtime smoke**: the jQuery-removed app booted headless (Playwright) and
ran a `nav-only` scenario end-to-end — board create, SGF load, navigation,
analysis-tab normalization, popover hooks — with no `$`/`jQuery` errors.

## Residual risk + QA ask

Static analysis can't 100% rule out a node_module covertly using `window.$`
in a flow the smoke didn't exercise. The smoke covered board / nav /
analysis-tab / popover; a final runtime pass over **auth, library, qEUBO,
settings** flows is the recommended QA before merge. Risk is low (zero static
usage, no plugin deps, modern-ESM dependency set).

## License

Public Domain (The Unlicense).
