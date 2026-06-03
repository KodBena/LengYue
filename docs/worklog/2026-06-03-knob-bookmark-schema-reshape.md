# Worklog — qEUBO bookmark schema reshape (2026-06-03)

## Trigger

Work-status item `knob-bookmark-schema-reshape` (frontend / small /
`refactor`) — the Phase-5-deferred follow-up named in the knob-registry arc
(`docs/worklog/2026-05-14-knob-registry.md`, "What's deferred"). qEUBO
bookmarks stored their snapshot as a flat `Record<string, number>` (bare
`analysis_env` param name → scalar), out of step with the knob-registry
substrate's own representation (branded `KnobId` keys, value *vectors*). The
reshape target was recorded as `Record<KnobId, number[]>`.

## What changed

`QeuboBookmark.parameters: Record<string, number>` → `Record<KnobId, number[]>`.
The key moves to the substrate-native `KnobId` (`qeubo.<param>`); the value
becomes the knob's value vector. qEUBO params are scalar knobs, so the vectors
are length-1 in practice — but storing the vector is what lets `applyBookmark`
hand it straight to `writeKnobValue` (no re-wrap) and what a future vector knob
would need without a second reshape.

- **`src/types.ts`** — the interface + a comment naming the shape, the
  scalar-today/vector-capable rationale, and the migrating migration.
- **`src/composables/useQeubo.ts`** —
  - New module constant `QEUBO_KNOB_PREFIX = 'qeubo.'` as the single source for
    the namespace convention; `knobIdForParam` now reads it, and the local
    `KNOB_PREFIX` in `reconcileQeuboKnobs` aliases it (de-duplicating the
    literal per the magic-literal discipline).
  - New exported `paramNameForKnobId` — the inverse bijection, for the one place
    a qEUBO-keyed bookmark writes back to `analysis_env.parameters` (keyed by
    bare name) and for the display.
  - `pinCurrent` reshapes the effective scalar-per-name view into the
    KnobId/vector shape.
  - `applyBookmark` iterates `KnobId` keys directly (the conflict check reads
    the claim straight off the key — no derivation), passes the vector to
    `writeKnobValue`, and falls through to `params[paramNameForKnobId(id)] =
    vec[0]` for keys without a KnobDecl (the legacy scalar path). The
    delete-extras semantic is preserved via a name set mapped back through
    `paramNameForKnobId`.
- **`src/components/qeubo/QeuboBookmarks.vue`** — `formatParameters` strips the
  KnobId back to the param name for display and renders a scalar (length-1) or a
  bracketed list (vector).
- **`src/store/migrations.ts` + `archived-migrations.ts`** — migration 56 → 57
  reshapes any persisted bookmarks (`{name: scalar}` → `{qeubo.name: [scalar]}`),
  idempotent (already-array values preserved), with the `qeubo.` prefix as a
  FROZEN migration literal. `CURRENT_SCHEMA_VERSION` 56 → 57; rolling-archive
  moved 54 → 55 (analysisTabs) into the archive, keeping the active body at the
  latest two. Stale archive-range comments in both files corrected to the actual
  scope (1 → 2 … 54 → 55).

## Tests

- `tests/integration/qeubo-apply-bookmark.test.ts` — the `bookmark()` helper now
  reshapes its readable `{name: scalar}` fixtures into the stored shape, so the
  six existing apply-path assertions exercise the new code unchanged (legacy
  fall-through, substrate write, whole-record-reseat delete, atomic hard-claim
  refusal ×2, soft-claim pass-through).
- `tests/unit/store/migrations.test.ts` — a 56 → 57 describe block (reshape,
  per-bookmark independence, idempotency, empty-map, two absent-container
  no-ops).

## Verification

`npm run build` (`vue-tsc -b && vite build`) green; `npm run test:run`
790 passed / 3 skipped; `eslint .` clean. The migration-array-length invariant
(`migrations.length === CURRENT_SCHEMA_VERSION - 1`) holds at 56. Doc-graph
regenerated (two new worklog nodes). No FEATURES.md / FILES.md / IDENTIFIERS.md
change — internal storage-shape refactor, no user-facing capability change, no
new file or identifier. Closes `knob-bookmark-schema-reshape`.

License: Public Domain (The Unlicense).
