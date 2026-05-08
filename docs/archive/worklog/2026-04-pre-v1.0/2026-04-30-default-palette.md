# Default-palette repair + curated metric set (release-scope item 5)

- **Status:** Shipped on `frontend/release-item-5-default-palette`,
  2026-04-30. `npm run build` (vue-tsc + vite) passes.
- **Genre:** Worklog entry — release-scope item 5.
- **Date:** 2026-04-30.

## Context

The dispatch
`docs/dispatch/frontend-to-frontend-default-palette-metrics-spec.md`
specifies (a) repair of a long-standing default-palette regression
(`uservisits` → `_uservisits`) and (b) replacement of the
under-developed seed with a curated metric library across two
semantic axes — robust-child alignment (visit-share-based) and
engine-recommendation alignment (`playSelectionValue`-rank-based).
Item 5 of `docs/release-scope.md` calls for both.

## Decisions taken (sign-off in session)

The dispatch's summary listed three open culling decisions; all
resolved as "ship the broader option, redirect easy":

1. **Full curated symbol library.** All 14 new symbols ship in the
   seed. They're cheap (string entries in `symbols`); the user
   toggles them via palette `state_fns` mappings.
2. **All three palettes ship** (`quality`, `score`, `rank`). The
   spec recommended this; I echoed.
3. **`activePaletteId: 'quality'`.** Per the spec's recommendation;
   matches the existing seed's intent (visit-share-aligned grading).

Two unprompted calls flagged in the pre-merge dialogue:

- **`'default'` palette retained alongside the three new ones.**
  Restored to a working composition (renamed `decisiveness` smoother,
  heuristic-oblivious `visit_ratio`). Users whose
  `activePaletteId === 'default'` and customised that palette away
  from the broken seed see no behaviour change. Removable in a
  successor release.
- **`visit_entropy` symbol kept**, but dropped from `state_fns`
  defaults in favour of the normalised `complexity`. The
  unnormalised primitive stays available for users who want it.

## Architectural shape

Two-file change.

- **`src/store/defaults.ts`** — symbol library and palette array
  rewritten. New symbols organised by context (state vs window) and
  by axis (robust-child vs engine-recommendation), with inline
  comments noting the heuristic-oblivious vs heuristic-aware
  distinction. Three new palettes added; `'default'` restored;
  `activePaletteId` now `'quality'`.
- **`src/store/migrations.ts`** — bumped `CURRENT_SCHEMA_VERSION`
  to 7 and appended the 6→7 migration. Three concerns, all under
  the "preserve user customisations, replace only broken-seed
  literals" discipline:
  - Repair `visit_ratio` only when its body matches the broken
    seed's literal `'uservisits(x[0]) / x[0]["rootInfo"]["visits"]'`.
  - `spread` → `decisiveness` rename only when `spread`'s body
    matches the broken-seed literal; on rename, rewrite `\bspread\(`
    references in every other symbol body. Custom `spread` symbols
    are left in place and `decisiveness` is added alongside (so
    the rename never overwrites a user definition).
  - Add new symbols and palettes only when absent.
    `activePaletteId` promoted from `'default'` → `'quality'` only
    when the broken-seed `'default'` palette body was actually
    repaired (customised `'default'` users keep their selection).
  - `alpha` parameter: preserve numeric value, default 0.25 if
    missing or wrong-type.

## Two semantic axes — recorded for the spec graph

| Axis | Symbols | Reference move | Question |
|---|---|---|---|
| Robust-child alignment | `visit_ratio`, `quality_delta`, `decisiveness` | most-visited (`_maxvisits`) | "How aligned is the user with the search's most-trusted child?" |
| Engine-recommendation alignment | `*_loss_topvsuser`, `user_order`, `policy_loss`, `rank_quality` | `moveInfos[0]` (`playSelectionValue`-ranked) | "How aligned is the user with what KataGo would have played?" |

Both axes correlate strongly but measure different things; shipping
both lets the user choose which dimension to grade against.

## What's NOT in scope

Per the spec's Part 8:

- **Human-policy metrics** (`humanPrior`-derived). Deliberately
  excluded — LengYue's pedagogical posture is "match strongest
  play," not "match human-of-your-rank patterns."
- **CWT-based metrics**, **move-level ownership integration**,
  **SIDETOMOVE sign-correction helper** — all noted as deferred in
  the spec; out of scope here.
- **qEUBO calibration over `alpha`** — the next phase's work,
  blocked on its own attribution discipline.

Verification deferred to user:

- **Asteval-side smoke test** (Part 7 §1) — would be a backend-
  Python-side check that every new symbol resolves to a non-fallback
  binding under `RegistryInterpreter`. Not runnable from a frontend
  session without a Python environment.
- **Live engine test** (Part 7 §2) — connect to KataGo + proxy with
  a fresh profile, confirm no `FALLBACK: no binding for key=...`
  warnings in the proxy log; confirm `extra.state[turn]`,
  `extra.{black,white}.deltas`, `extra.{black,white}.triangular` are
  all populated.
- **Migration round-trip** (Part 7 §3) — load a v6 blob with the
  broken-seed default; confirm the v6→v7 migration corrects symbol
  definitions; confirm user customisations are preserved.

## Files touched

```
frontend/src/store/defaults.ts                            (rewrite)
frontend/src/store/migrations.ts                          (CURRENT_SCHEMA_VERSION bump + 6→7 migration)
docs/worklog/2026-04-30-default-palette.md                (this file)
docs/TODO.md                                              (Completed entry)
```

## Closing

Closes release-scope item 5. The dispatch
(`docs/dispatch/frontend-to-frontend-default-palette-metrics-spec.md`)
moves to a closed state implicitly via the spec's Part 7 verification
checklist; the spec stays as the authoritative reference for the
metric library's design rationale.
