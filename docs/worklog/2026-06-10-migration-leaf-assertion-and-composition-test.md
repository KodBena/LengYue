# Worklog — Migration fail-loud guard: composition test + witnessed leaf assertion (2026-06-10)

> Audit trail for work-status item
> `migration-leaf-assertion-and-composition-test`, executing §3.13 of
> the history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`). The
> motivating incident: the 47 → 48 F-optimizer retirement walked
> `out.settings?.knobs` instead of `out.profile?.settings?.knobs`,
> silently no-oped on every blob, and stamped v48 anyway (caught
> pre-ship; repaired by the 48 → 49 corrective). This work extends
> Phase 1 of `docs/notes/design/migration-test-rotation-plan.md`.

## The change

- **Composition-level invariant test** (the load-bearing half) —
  `frontend/tests/integration/migration-store-roundtrip.test.ts`.
  Drives a hand-written legacy v1 blob through the real hydrate/save
  composition (`migrate()` → `updateFromRemote()` →
  `buildPersistencePayload()`) and compares the round-tripped
  payload's key set against a clean `migrate()` of the same blob.
  Both diff directions are pinned with classified expected sets: a
  new defaults-only key is the silent-backfill-no-op signature and
  fails CI. The fixture follows the rotation plan's Open Question 1
  recommendation (hand-write; never add a fixture field whose
  backfill migration exists — that hides the no-op the test exists
  to catch). Known blind spot recorded in the test header: a
  silently no-oping STRIP migration is invisible to the comparison
  (the stale key survives `deepMerge` on both sides); the witness
  helper below is the guard aimed at that half.
- **`witnessedContainer` leaf-assertion helper** — housed in the B1
  framework portion of `frontend/src/store/migrations.ts`,
  instance-free, with an independent witness: the container path is
  validated against the runtime persisted shape (assembled from
  `defaults.ts` + the `buildPersistencePayload` skeleton — the paths
  the runtime actually reads) before the blob is walked with the
  same tolerant semantics as the inline guards it replaces. A typo'd
  path now throws loudly (and fails the unit suite's end-to-end
  walk) instead of conditioning out on the same wrong walk. The
  **frozen-once-shipped caveat is documented at the helper**: shipped
  bodies make it a dependency of frozen code, so its semantics
  freeze with them; different future semantics require a new helper.
  Retrofitted into the two ACTIVE bodies only (57 → 58, 58 → 59), as
  a semantics-preserving change (the existing per-step unit fixtures
  and the end-to-end walk pin the behaviour); archived bodies are
  untouched per the bodies-only freeze.
- **Test-file header honesty fix** —
  `frontend/tests/unit/store/migrations.test.ts` no longer claims
  "one describe block per migration": the header now names the
  describe blocks as the authoritative coverage list, with the one
  known historical gap (steps 44 → 45 through 55 → 56, a fixed
  archived range) called out and pointed at the composition test for
  structural coverage. The header's stale rotation-plan path
  (`docs/notes/…` → `docs/notes/design/…`) was corrected in the same
  edit. Six new unit tests pin the helper's witness/blob-leg
  contract, including the literal 47 → 48 wrong-path shape.
- **Docs** — `frontend/FILES.md`'s `migrations.ts` row now names the
  helper (and its defaults-witness import);
  `docs/notes/design/migration-test-rotation-plan.md` gains a dated
  Phase 1 extension section recording both legs and closing its Open
  Question 1 for the composition fixture. Doc-graph regenerated for
  the new worklog node and cross-references.

## Findings surfaced (not fixed here)

- **Two further latent wrong-path no-ops in the archive**, exposed by
  the composition test's key-set diff and confirmed by reading the
  bodies: the archived **45 → 46** body walks
  `out.settings?.engine?.katago` (should be
  `out.profile?.settings?.engine?.katago`), so
  `adaptiveReevaluate.valueBinding` is never backfilled on persisted
  blobs; the archived **46 → 47** body walks
  `out.settings?.appearance`, so `appearance.moveSuggestionsFadeMs`
  is never backfilled. Both are the same incident class as 47 → 48
  but were never corrected. Runtime impact is masked today because
  `updateFromRemote`'s deepMerge supplies both leaves from defaults
  on every hydrate — but the persisted blobs never carry them, and
  any future read of the raw blob (or a defaults change) surfaces
  it. The corrective is a NEW migration (archived bodies are frozen;
  bump cadence is the maintainer's call per audit §7.5), so this is
  recorded here and in the test's pinned `[silent-no-op]` rows
  rather than fixed. **Needs a maintainer decision / work-status
  item**; this session is read-only on the todo DB.
- A handful of `[no-backfill]` defaults-only keys (the
  `fringe_first` deck, the mistake-finder leaf + KnobDecl, the two
  animation KnobDecls) are now pinned and classified in the
  composition test — recorded as found; whether any deserves a
  backfill rides the same bump-cadence question.

## Deferred / notes

- The bump-cadence relaxation (~1.38/day; an additive-default
  tier) is explicitly out of scope (audit §7.5; maintainer decision
  point 5).
- Backfilling per-step unit fixtures for the archived 44 → 56 range
  was not commissioned and is not done; the gap is now named
  honestly in the unit-test header and covered structurally by the
  composition test.
- The active-body retrofit technically edits shipped bodies; named
  loudly here rather than silently absorbed: the item description
  instructs it ("used by the ACTIVE migration bodies only"), the
  change is behaviour-preserving on every input (witness validation
  is static and the paths are correct; the blob-leg semantics are
  bit-identical to the prior inline guards, pinned by the unchanged
  unit fixtures), and the append-only invariant's purpose — a
  deterministic forward walk for blobs in the wild — is intact.
- A witnessed path is a forward commitment: a future restructuring
  arc that renames a witnessed container must revisit frozen bodies'
  witness viability in the same change (documented at the helper).

---

License: Public Domain (The Unlicense).
