# PBO claim rehydration — make the parameter-meta → claim binding reactive

- **Status:** In flight on `KodBena/fix/pbo-claim-regression-from-pr250`.
  Fixes the existing-user PBO regression flagged in PR #251's "Known
  limitation" section.
- **Genre:** Bugfix + small architectural correction. The fix is two
  edits in two files; the load-bearing artifact for future readers is
  the companion postmortem
  `docs/notes/postmortem-pbo-claim-rehydration-2026-05.md`.
- **Date:** 2026-05-17.

## Context

Existing users (with a previously-running PBO experiment and
persisted `analysis_env.parameter_meta` carrying `qeubo_controlled:
true` entries) hit a regression after PR #250 landed: on SPA
reload, the PBO-owned parameter's slider rendered editable instead
of locked, and the toolbar Applied / A / B switching had no visible
effect. PaletteEditor's view of the same parameter agreed it was
"controlled by PBO" — disagreeing with the substrate, which had no
claim recorded. The user-side workaround was to toggle
`qeubo_controlled` off and back on in PaletteEditor; that routes
through `startNewExperiment` → `acquireExperimentClaims` and
re-establishes the claim explicitly.

The race that caused this had been latent for some time; PR #250's
migration likely tipped its timing margin (one extra
`structuredClone` over a slightly larger blob), making the race
start losing reliably for existing users. Fresh users were
unaffected — their PBO setup runs `startNewExperiment` (a user-
driven path) instead of `bootstrap()`'s rehydrate path.

The fix is architectural: the binding from `parameter_meta` to the
substrate's claim map is now reactive instead of one-shot
imperative.

## What changed

### `src/composables/useQeubo.ts`

`rehydrateExperimentClaims` gains an early-return guard:

```ts
if (_statusRef.value === null) return;
```

The guard covers two states: pre-bootstrap (the `/qeubo/status`
probe hasn't returned yet) and post-bootstrap with no active
experiment (`_statusRef` reset to null in the 404 branch). Without
the guard, the new parameter-meta watcher below would claim
`qeubo_controlled` parameters even when PBO isn't running.

The function is now exported at module level alongside the existing
`reconcileQeuboKnobs`, so `useAppBootstrap` can wire it directly.
The docstring records both call sites (the bootstrap-time one and
the watcher-driven one) and explicitly names the race the watcher
catches.

### `src/composables/auth-app/useAppBootstrap.ts`

The existing `parameter_meta` deep-watcher (Phase-6 reconcile)
gains a second responsibility — calling
`rehydrateExperimentClaims()` alongside `reconcileQeuboKnobs()`:

```ts
watch(
  () => store.profile.settings.engine.katago.analysis_env.parameter_meta,
  () => {
    reconcileQeuboKnobs();
    rehydrateExperimentClaims();
  },
  { immediate: true, deep: true },
);
```

When SyncService's hydrate completes and replaces `store.profile`,
the watcher's source re-evaluates against the new object identity
and fires. `rehydrate` then runs against the populated
`parameter_meta`, claiming the qeubo_controlled parameters that
bootstrap-time may have missed.

Idempotence is preserved by the guards already in place:
`_statusRef.value === null` early-returns when no experiment is
active; `_claimedKnobIds.has(knobId)` short-circuits already-
claimed entries; the substrate's `claimKnob` no-ops same-consumer
re-claims via `emitChange`'s `sameClaim` check. The common case
where bootstrap-time rehydrate already claimed everything is a
true no-op here.

The block's comment explicitly records the race and why the
watcher closes it, so a future reader sees the constraint at the
wiring site.

## What's deferred

- **The i18n console warning** `[intlify] Not found
  'knobRegistry.label.qeubo.alpha' key in 'en' locale messages` is
  unrelated to this regression. `KnobSlider`'s `displayLabel`
  computed tries the i18n key first and falls back to `decl.label`
  for runtime-synthesized knobs (the `qeubo.<param-name>` family) —
  no catalogue entry exists for arbitrary user-named parameters by
  construction. The fallback works correctly; the warning is
  noise. A `te()`-guarded lookup would suppress it cleanly; not in
  scope for this corrective.

- **The structuredClone-over-large-blob latency.** Each migration
  in the chain calls `structuredClone(blob)` on the full persisted
  workspace. With 44 active migrations and a growing blob, this is
  a measurable cost on cold start. The fix landed here makes the
  PBO-claim-rebinding robust to the timing variance regardless of
  whether structuredClone gets faster or slower; revisiting the
  migration chain's per-step clone cost is its own arc.

- **Reactive-binding audit of other module-scope ephemeral state.**
  The postmortem §7.3 flags that the claim map isn't the only
  module-scope state that depends on persisted SSOT — the analysis
  ledger, the thumbnail caches, and the per-board card-tree state
  all live module-scope and rely on coordinated initialization at
  the right times. A targeted audit of "module-scope state that
  rebinds from persisted truth on reload" is worth a focused
  housekeeping pass.

## Verification

- `npm run build` — passes (`vue-tsc -b && vite build`).
- `npm run test:run` — 521 passed, 3 skipped (no regressions).
- Browser smoke (confirmed by user 2026-05-17): existing-user SPA
  reload now restores the PBO claim transparently — the alpha
  slider renders locked without any manual toggling, and the
  toolbar Applied / A / B switching drives the effective values
  for analysis as expected. Fresh-user behaviour unchanged.

## Cross-references

- `docs/notes/postmortem-pbo-claim-rehydration-2026-05.md` — the
  postmortem; the load-bearing artifact here. RCA on the
  bootstrap/hydrate race, contributing factors (PR #250's timing
  tip, the imperative-vs-reactive binding gap), discipline
  recommendations.
- PR #251 ("frontend(feat): PBO popover + qEUBO→PBO user-facing
  rename") — the "Known limitation" section flagged this regression
  with a workaround note; this PR retires that limitation.
- PR #250 ("frontend(feat): persist card-forest manual-expand +
  Collapse All") — the migration whose timing tipped the race
  margin. PR #250's code is not modified by this fix; the
  regression's mechanism was a latent race, not a defect in
  Item 1's code.
- `frontend/src/lib/knobs.ts` — the substrate's claim machinery
  whose module-scope `claims` Map is the ephemeral state being
  rebound here.
- `frontend/CLAUDE.md`'s "Resource ownership at mutation sites"
  section — companion discipline for module-scope state lifecycle.

## License

Public Domain (The Unlicense).
