# Worklog — corrective migration for the archived wrong-path backfills (2026-06-11)

> Audit trail for work-status item `archived-migration-wrong-path-corrective`
> (maintainer-decided 2026-06-11, §7.5 resolved: no cadence relaxation — a
> routine new migration). PR: bork/fix/archived-migration-corrective.
> Found 2026-06-10 by the migration composition test (PR #370, item
> `migration-leaf-assertion-and-composition-test`). Scoped to `frontend/`.
> `frontend/CLAUDE.md` (rolling-archive section), the migrations framework
> docstrings (`src/store/migrations.ts`, `src/store/archived-migrations.ts`),
> the `witnessedContainer` helper docstring, and both migration test files
> were read end to end before any change.

## The defect

The archived `45 → 46` and `46 → 47` migration bodies were authored to backfill
two settings leaves onto persisted blobs:

- `45 → 46`: `profile.settings.engine.katago.adaptiveReevaluate.valueBinding`
  (string, default `''`) — the proxy v1.0.26 learned value-function opt-in.
- `46 → 47`: `profile.settings.appearance.moveSuggestionsFadeMs` (number,
  default `60`) — the suggestion-ring/disk fade, promoted from a hardcoded inline
  `transition: opacity 60ms`.

Both bodies walked `out.settings?.…` instead of `out.profile?.settings?.…` —
the missing `profile.` prefix, the exact `47 → 48` wrong-path class — and so
silently no-oped on every real blob while still stamping the version. The defect
was masked at runtime by `updateFromRemote`'s deepMerge against defaults (which
is why no user-visible symptom ever surfaced; the deepMerge is precisely what
hid two real defects for weeks). The store-round-trip composition test
(`tests/integration/migration-store-roundtrip.test.ts`) surfaced both on
2026-06-10 as `[silent-no-op]` defaults-only keys.

Archived bodies are frozen (the append-only invariant — a migration is the
contract with the persisted-blob population, not a refactor target), so the fix
is a NEW migration with the correct paths, not an edit to the broken bodies.

## The change

- **`src/store/migrations.ts`** — `CURRENT_SCHEMA_VERSION` 59 → 60; new migration
  `59 → 60` re-applies both backfills via `witnessedContainer` at the correct
  `profile.settings.…` paths (a typo there fails loudly at the runtime-shape
  witness instead of no-oping). Both containers are witnessed
  (`…engine.katago.adaptiveReevaluate` exists from the `29 → 30` seed;
  `…appearance` is present from v1); the blob-side leg keeps the broken bodies'
  inline non-null-object tolerance, so a partial/legacy blob no-ops as intended.
  Idempotent: a pre-existing string `valueBinding` / numeric
  `moveSuggestionsFadeMs` is preserved. The two display-domain animation KnobDecls
  the `46 → 47` body deliberately declined to inject are NOT re-applied — that
  defaults-side-seed choice is correct and remains the `[no-backfill]` posture.
- **Rolling-archive same-PR move.** The now-third-oldest active migration
  (`57 → 58`, the `profile.knownTags` strip) ages out to
  `src/store/archived-migrations.ts` verbatim, header comment travelling. The
  active body returns to its two-anchor steady state (`58 → 59`, `59 → 60`).
- **`src/store/migration-witness.ts`** (new) — `witnessedContainer` and its
  `PERSISTED_SHAPE_WITNESS` extracted here from `migrations.ts`. See the
  deviation note below for why this was forced.
- **`tests/unit/store/migrations.test.ts`** — added the `59 → 60` per-migration
  describe block (8 cases: both backfills, idempotency on string/number,
  wrong-typed replacement, partial-blob and very-legacy no-ops, end-to-end walk),
  per current per-migration-block practice.
- **`tests/integration/migration-store-roundtrip.test.ts`** — removed the two
  `[silent-no-op]` pins from `EXPECTED_DEFAULTS_ONLY_PATHS` (they now appear in
  the clean migration's keyset, so they are no longer defaults-only), and
  rewrote the `[silent-no-op]` class docstring from an open ratchet to the
  closed precedent. See the ratchet record below.
- **`frontend/FILES.md`** — new row for `migration-witness.ts`; updated the
  `migrations.ts` and `archived-migrations.ts` rows for the helper relocation
  and the archive's true scope (1→2 .. 57→58).

## The ratchet (red → green), recorded

The composition test's two `[silent-no-op]` pins are designed to go red on this
corrective and stay red until the pins are updated — the intended ratchet
direction. Observed exactly that:

- **Red:** with the `59 → 60` migration shipped but the pins un-updated, the
  composition test's `payloadOnly` no longer included
  `appearance.moveSuggestionsFadeMs` /
  `engine.katago.adaptiveReevaluate.valueBinding` (the clean `migrate()` now
  produces them), so `expect(payloadOnly).toEqual(EXPECTED_DEFAULTS_ONLY_PATHS)`
  diverged. (Confirmed by reasoning through the keyset; the same red shape also
  appeared transiently mid-edit as the moved `57 → 58` body's missing import.)
- **Green:** removing the two pins cleared the divergence. Full migration suite
  247 → 255 (the +8 new unit cases), full frontend suite 896 passed / 4
  pre-existing skips.

## Deviation from "routine new migration" (recorded loudly)

The commission framed this as a routine new migration; one structural addition
went beyond that and is named here per the campaign's deviation discipline.

**Extracted `witnessedContainer` + `PERSISTED_SHAPE_WITNESS` into a new leaf
module `migration-witness.ts`.** The mandated rolling-archive move ages the
`57 → 58` body — the first body authored *against* `witnessedContainer` — out of
`migrations.ts` into `archived-migrations.ts` verbatim. That body calls
`witnessedContainer`, so the archive now needs the helper. Importing it directly
from `migrations.ts` would close a module cycle: `migrations.ts` already imports
`archivedMigrations` from `archived-migrations.ts`, so adding the reverse edge
makes the dependency bidirectional. The two alternatives are both wrong: a cycle
is fragile, and "de-retrofit the body back to an inline guard" would silently
edit a frozen shipped migration (the append-only violation the discipline
forbids). The helper's own "FROZEN ONCE SHIPPED" docstring already anticipated
this — it speaks of paths witnessed by "active **or archived-later**" bodies — so
homing the helper in a leaf module both files import is the intended resolution,
not scope creep. `migration-witness.ts` imports only `defaults` (a true leaf);
`migrations.ts` re-exports `witnessedContainer` so the unit test's existing
`from './migrations'` import is undisturbed.

## Hack-rationalization pass

Ran the `hack-rationalization-detector` skill against the diff (treating my own
extraction rationale as the object of suspicion, not context to agree with).
Tells scanner: 0 co-occurrence hits. Writer enumeration: the migration corpus is
the sole backfill writer of these leaves onto persisted blobs (defaults.ts is the
fresh-install path; the other hits are type declarations and the broken no-oping
bodies) — not a per-writer gate, no missed producer. Verdict: **general** — the
fix is one invariant over the single producer class, and the new module
discharges a verified cycle the mandated verbatim move creates. Residual findings
surfaced (not blocking, recorded for the maintainer):

- The rolling-archive cadence now forces the same module-extraction decision
  every future cycle; documented in the new module's and both files' headers, but
  nothing *mechanically* forbids a future author re-introducing the helper inline
  in `migrations.ts` and re-creating the cycle (no import-boundary lint guards
  `archived-migrations.ts` against importing `migrations.ts`). Not filed —
  low-recurrence, documented-in-headers; flagged for maintainer judgment on
  whether a lint is warranted.
- The witness's live-`defaults` dependency means a future removal of either
  backfilled container from `defaults.ts` would make this migration's (and the
  broken bodies') witness throw at hydrate for pre-v60 blobs — the helper's
  documented forward-commitment design, captured in the `59 → 60` inline comment.

## Verification

- `npm install` — clean.
- `npm run build` (`vue-tsc -b && vite build`) — typecheck clean, build OK.
- `npx eslint .` — exit 0 (the five custom rules at error pass).
- `npm run test:run` — 896 passed, 4 pre-existing skips, 0 failures.
- Doc-graph regenerated (`node tools/doc-graph/generate.mjs`); committed
  `docs/doc-graph.json` + `docs/doc-graph.md`.

## Work-status

Todo DB is read-only for this worker. The corrective item
`archived-migration-wrong-path-corrective` is shipped by this PR; its
open → closed transition is for the coordinator to record at curation (retire on
ship), not for this worktree.
