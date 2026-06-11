# Worklog — autosave-pause-unreachable: align the storage-error throw seam + fake fidelity (2026-06-11)

> Audit trail for work-status item `autosave-pause-unreachable` (the
> debt-clearing campaign's highest-priority live defect); branch
> `bork/fix/autosave-pause-unreachable`, PR #396. Fixes both halves of
> the verified defect chain: (1) the real seam so the auto-save pause
> path is reachable against the shape the service actually throws, and
> (2) fake fidelity, with a pin test so the seam cannot silently diverge
> again.

## The defect (verified at HEAD)

The auto-save composable's persistent-error pause was unreachable
against the real persistence service for exactly the quota/cap failures
it exists to pause on. The chain:

1. `AnalysisPersistenceService.save()` catches the api-client's
   `ApiError` and routes it through `rethrowAsStorageError`
   (`analysis-persistence-service.ts:249`), which calls
   `parseStorageError(err)` and **throws the already-parsed structural
   union** `AnalysisBundleStorageError` — a plain `{kind,status,…}`
   POJO, deliberately not an `Error` subclass (the contract the service
   header, `AnalysisControls.vue`'s `isStorageError`, and the
   `only-throw-error` inline-disable in `eslint.config.js` all lean on).
2. `useAutoSaveAnalyses.fireSave` caught that thrown value and called
   `parseStorageError(err)` **again** (`useAutoSaveAnalyses.ts:131`),
   whose first line is `if (!(err instanceof ApiError)) return null;`
   (`analysis-bundle.ts:117`). The thrown value is the already-parsed
   union, not an `ApiError`, so `parseStorageError` returned `null` and
   `setAutoSaveError` was never called. The board never paused; the next
   `markDirty` re-fired a save into the same wall.
3. The integration test passed only because the fake's `save` was
   configured with `mockRejectedValueOnce(new ApiError(413, …))` — a raw
   `ApiError`, a shape the real service never throws. The fake and the
   real seam diverged silently (the tests-outside-typecheck /
   fake-fidelity class).

## The seam choice (justified)

Two shapes were possible: parse the structural union the service
actually throws, or make the service throw typed `Error` subclasses end
to end. **Parsing the union is the right seam**, against a concrete cost
for the alternative — not a discipline-word:

- The structural-union throw is the *adopted contract*, recorded at
  `eslint.config.js:147-153`: converting it to an `Error` subclass is "a
  contract change across the union's four consumer files, not lint
  hygiene."
- `AnalysisControls.vue`'s `isStorageError` (the manual-save path)
  **already** consumes the union correctly by structural `kind`/`status`
  narrowing (no `instanceof`). The auto-save path was the only diverging
  consumer. Converting to Error subclasses would break a currently-
  working consumer and force it to change too.
- The type-only-import admission in the deny-by-default services
  boundary leans on the union being a plain type, not a class.

So the fix aligns the *consumer* to the contract, not the contract to
one consumer.

## The change

- **`analysis-bundle.ts` — `asStorageError()`** (new). A single
  recogniser a catch-site uses to answer "is this a typed storage
  failure?" regardless of which of the two throw shapes it got: it
  recognises the already-parsed structural union (re-validating each
  member's discriminator + required legs, symmetric with
  `parseStorageError`'s own per-kind field checks, so a malformed
  `{kind}` POJO is rejected rather than smuggled through) and falls back
  to `parseStorageError` for a raw `ApiError`. Stated as one invariant:
  *a catch-site recognises the storage-error regardless of which throw
  shape it arrives in.* The structural leg is a private helper
  `recogniseStorageUnion`; its three `as AnalysisBundleStorageError`
  casts each follow a full runtime validation of that member's fields
  and target the branded domain union, not `any` (justification inline).
- **`useAutoSaveAnalyses.ts`** — the `fireSave` catch now calls
  `asStorageError(err)` instead of `parseStorageError(err)`. One-line
  seam swap; the pause-write site is unchanged.
- **`tests/fakes/analysis-persistence-service.ts` — `realServiceStorageThrow()`**
  (new). Derives the fake's rejection value by running the **same
  production `parseStorageError`** over the **same wire body** the
  backend would send — i.e. exactly what `rethrowAsStorageError` does —
  so the fake rejects with what the real service actually throws. It
  refuses (throws loudly) a body the real parser does not recognise, so
  the fake can never reject with a bespoke POJO that masquerades as a
  real throw.
- **`tests/integration/useAutoSaveAnalyses.test.ts`** — the
  `bundle_too_large` pause test now rejects via `realServiceStorageThrow`
  instead of a hand-built raw `ApiError`, so it exercises the production
  seam.
- **`tests/integration/analysis-persistence-fake-fidelity.test.ts`**
  (new, the pin). Drives the **real** `save()` into its storage-error
  catch branch — `vi.spyOn(api, 'request')` rejecting with the wire
  `ApiError` — and asserts what the real service throws deep-equals what
  `realServiceStorageThrow` produces from the same wire inputs, across
  all three storage envelopes. If the real seam ever changes its throw
  shape, the pin goes red and the fake must move in lockstep. `vi.spyOn`
  (not `vi.mock`) is load-bearing and documented in the test header: the
  service captured the real `api` singleton at module construction, so a
  `vi.mock` factory returning a fresh `api` object does not reach the
  binding the service holds.

## Red / green

- **Red (defect reproduced):** with `useAutoSaveAnalyses` reverted to
  the old `parseStorageError` while the pause test rejects with the real
  structural-union shape, the test fails (`× pauses auto-save … on
  bundle_too_large error`) — the pause path is unreachable against the
  real throw. The other six auto-save tests stay green because they
  don't drive a storage-error rejection.
- **Green:** with `asStorageError` in place, all auto-save tests pass and
  the new fidelity pin (4 tests) passes. Full frontend suite: **892
  passed, 4 skipped, 0 failed**. `npm run build` (vue-tsc + vite) and
  `npx eslint .` both exit 0.
- **Pin liveness:** deliberately breaking `realServiceStorageThrow` to
  return a raw `ApiError` turns the pin red (4 fails) — the net catches a
  re-divergence.

## Adversarial review

Ran the hack-rationalization-detector against the diff. `grep_tells`: 0
co-occurrence tells. `enumerate_writers autoSaveErrors`: 1 owner (the
service) — the fix adds no writer and no per-writer gate, so the
multi-writer fragility signature is absent. Verdict:
**narrower-but-justified** (the general fix — one recogniser over both
throw shapes — was *shipped*, not downgraded; the deeper alternative was
declined against a documented contract cost). Residual findings carried
to the PR body and attention items.

## Deferrals

- **Union-exhaustiveness gap (pre-existing, not introduced).**
  `recogniseStorageUnion` — like `parseStorageError` and
  `AnalysisControls.vue`'s `describeError` — has no compile-time
  `never`-exhaustiveness tie to `AnalysisBundleStorageError`, so a future
  `kind` added to the union without a matching case here would silently
  fall through to `null` (the original defect in miniature, for that kind
  only). Out of this item's verified defect chain; widening to a
  three-site union-exhaustiveness guard would expand scope.
  `not-filed: pre-existing union-exhaustiveness gap shared by
  parseStorageError / describeError, out of the autosave-pause-unreachable
  defect chain`.
- **`useAutoSaveAnalyses.ts` absent from `frontend/FILES.md`**
  (pre-existing). Not introduced by this change; adding the missing row
  is unrelated map-maintenance, deferred per ADR-0004 minimal-touch.
  `not-filed: pre-existing FILES.md omission of useAutoSaveAnalyses.ts,
  unrelated to this fix`.

## Documentation audit

- Work-status store: item `autosave-pause-unreachable` stays **read-only**
  per campaign rule (the coordinator closes on ship); no DB write.
- `frontend/FILES.md`: maps `src/` only (0 `tests/` rows), so the new
  test file needs no entry. `analysis-bundle.ts`'s row ("Pure projection
  ledger ↔ wire bundle", [B3]) stays accurate — `asStorageError` is a
  pure storage-error recogniser alongside the existing `parseStorageError`;
  no band change.
- `frontend/IDENTIFIERS.md`: no new branded identifier type
  (`asStorageError` / `realServiceStorageThrow` are functions).
- `FEATURES.md`: no user-facing capability change — the pause feature
  already shipped; this makes its documented behaviour actually fire.
- Doc-graph: this worklog is a new node (structural), regenerated in the
  same change (`node tools/doc-graph/generate.mjs`).

License: Public Domain (The Unlicense)
