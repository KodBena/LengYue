# Worklog — re-home agnostic utils from engine/util.ts (2026-06-10)

> Audit trail for work-status item `rehome-agnostic-utils-engine-util`,
> executing §3.19 of the SPA history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`). Two
> domain-free exports (`generateUUID`, `updateRegistry`) were stranded
> in the [B3] `engine/util.ts`, dragging false B3 edges onto agnostic
> consumers — including the generic registry write path. They now live
> in [B1] `lib/utils.ts`.

## The change

- **`lib/utils.ts`** — receives `generateUUID` (body byte-identical;
  its docstring's stale call-site census "currently `useQeubo`'s
  `pinCurrent`" replaced with the census-free "call sites go through
  this helper", per the stable-handles lesson, audit §3.25) and
  `updateRegistry`. The private `setDeep` helper (zero external
  consumers; its only caller was `updateRegistry`'s one-line
  delegation) was **folded into `updateRegistry`'s body** — the
  fold option the item sanctioned — preserving the exact silent-create
  semantics and the exact `<T extends object>` signature. Header
  retrofitted per ADR-0006 (the file had none; touched under full
  visibility).
- **Non-collapse, verified at HEAD, not assumed.** `lib/knobs.ts` was
  read end to end: its `walkTo` / `writeKnob` throw on missing
  intermediates, on non-object parents, and on final segments that
  don't pre-exist, and refuse non-finite values. `updateRegistry`
  (née `setDeep`) silently creates intermediates and accepts any
  value. Deliberately different ADR-0002 calibrations — **co-located,
  never merged**. The calibration contrast is now recorded in
  `updateRegistry`'s docstring so a future "simplify" pass can't
  collapse it unknowingly.
- **`engine/util.ts`** — the three definitions removed; header purpose
  line refreshed to the honest residual (coord work, active-variation
  traversal, game-name resolution) with a one-line re-home pointer.
- **Import sites re-pointed** (compiler-driven; re-derived at HEAD —
  matched the audit's six):

  | Site | Symbol | Band edge before → after |
  |---|---|---|
  | `composables/useQeubo.ts:87` | `generateUUID` | B1→B3 false edge → B1→B1 |
  | `store/archived-migrations.ts:29` | `generateUUID` | B1→B3 false edge → B1→B1 |
  | `components/SettingsTab.vue:35` | `updateRegistry` | B2→B3 false edge → B2→B1 |
  | `store/board-factory.ts:14` | `generateUUID` | B3→B3 → B3→B1 |
  | `composables/board/useDirtyBoardGuard.ts:41` | `updateRegistry` | B3→B3 → B3→B1 |
  | `engine/sgf-loader.ts:5` | `generateUUID` | B3→B3 → B3→B1 |

- **`archived-migrations.ts:29` is a header-level edit, no shim.** The
  rolling-archive convention (frontend `CLAUDE.md`) freezes migration
  *bodies* ("never edit the body during the move"); the import block
  is outside every body, and the three `generateUUID` call sites
  inside frozen bodies (`:1001`, `:1086`, `:1168`) are untouched. A
  re-export shim in `engine/util.ts` was deliberately not left —
  shims rot, and the convention as written does not require one.
- **Prose refreshes in the same motion:** `board-factory.ts`'s
  "`engine/util.ts::generateUUID`" comment → `lib/utils.ts::…`;
  `AnalysisTabsEditor.vue`'s host-applies-via-`updateRegistry` line
  now anchors the function's home (`lib/utils.ts`); the `generateUUID`
  tests moved from `tests/unit/engine/util.test.ts` to a new
  `tests/unit/lib/utils.test.ts` (following their subject; the
  remaining engine/util tests stayed put, header enumeration
  trimmed).
- **Living-doc cross-references:**
  - `FILES.md` — the stale `lib/utils.ts` row ("debounce helper (the
    only inhabitant)" — it actually held debounce, isObject,
    deepMerge) rewritten to the honest five-inhabitant description
    with the never-merge note; the `engine/util.ts` row updated to the
    residual description. The "lib/ vs utils/ merger flagged
    separately" pointer survives — that unfiled directory-naming
    follow-up (`docs/archive/notes/frontend-source-tree-reorganization.md`)
    is a different occasion this change merely composes with.
  - `IDENTIFIERS.md` — three construction-site `file:line` anchors
    shifted by this change and were re-pointed same-PR per the map's
    discipline: `RootToLeafPath`'s mint `engine/util.ts:90` → `:76`
    (setDeep's removal shifted it), `NodeId`'s loader mint
    `sgf-loader.ts:73` → `:74` (the import split added a line), and
    `AnalysisTabId`'s `AnalysisTabsEditor.vue:46`/`:44` → `:47`/`:45`
    (the comment re-wrap added a line).
  - `docs/notes/design/config-schema-projection-plan.md` (living
    `design-note: planned`, read end to end) — four anchors that
    named `setDeep` / `engine/util.ts:35[-49]` corrected to
    `updateRegistry` / `lib/utils.ts`; the verbatim behavioural
    claims (auto-vivify contrast with `writeKnob`) are unchanged and
    remain true.

## Fork-readiness note (audit L7)

This removes the false B3 edges from the agnostic consumers — the
concrete import lines a generic-knowledge-fork author would otherwise
have had to cut, and (per the audit's verification record) the path by
which a fork replacing `engine/util.ts` wholesale would have silently
lost the secure-context UUID fallback that commit `e57c90b` exists to
provide.

**ADR-0003 status, verified rather than assumed:** the stale
"`engine/util.ts` (board-state walks, captures math)" inventory line
the audit flagged as bonus drift was already removed by the
2026-06-10 amendment arc (`e80bd1d`, item
`adr-record-amendments-2026-06`), which delegated the per-file listing
to FILES.md. The one remaining `engine/util.ts` mention in ADR-0003
(the Chess-port wholesale-replacement sizing) stays accurate — more
so, now that the file's residual content is honestly all Band 3. No
ADR edit was needed in this PR.

## Verification

- `npm run build` (vue-tsc -b + vite build): clean.
- `npx eslint .`: exit 0.
- `npm run test:run`: 882 passed, 4 skipped, 0 failed (the two moved
  `generateUUID` tests run green in their new home).

## Deferred / notes (pre-existing drift, left per minimal-touch)

- `IDENTIFIERS.md`'s `BookmarkId` row cites `useQeubo.ts:782`; the
  construction site is at `:825` at HEAD. Predates this change (this
  PR's useQeubo edit is an in-place import-path swap, no line shift).
- `config-schema-projection-plan.md` cites `useDirtyBoardGuard.ts:92`
  for the composable `updateRegistry` call; it is at `:87` at HEAD.
  Also predates this change.
- `updateRegistry` / `debounce` / `isObject` / `deepMerge` remain
  uncovered at tier 1 (only the moved `generateUUID` tests exist for
  `lib/utils.ts`); adding coverage was not in this item's scope.

---

License: Public Domain (The Unlicense).
