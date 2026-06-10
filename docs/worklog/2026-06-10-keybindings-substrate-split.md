# Worklog — keybindings substrate/catalog split (2026-06-10)

> Audit trail for work-status item `keybindings-substrate-catalog-split`,
> executing §3.16 of the SPA history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`). The
> [B1]-tagged `lib/keybindings.ts` fused a generic registry substrate
> with the Go-shaped action catalog (handlers dispatching
> `analysisService` / `useNavigation` / store writes); this change
> separates them and closes the two seams verification exposed, so the
> fusion does not reappear one level down.

## The change

- **`src/lib/keybindings.ts` (substrate, [B1] now honest)** — keeps the
  generic machinery only: the `KeybindingActionDecl` shape,
  `effectiveKey`, `normalizeKey`, and `validateKeybindingsRegistry`.
  Imports nothing but the `KeybindingActionId` brand. The catalog is
  *input* everywhere a catalog is needed.
- **`src/composables/keybindings-catalog.ts` (new, [B3] band-mixed)** —
  the application's catalog: `asActionId` + `ACTIONS`, the named
  `enabledWhen` predicates, and `KEYBINDINGS_REGISTRY` (decl bodies
  moved verbatim apart from the `enabledWhen` representation). Homed in
  the composables layer because the handlers are thin dispatch into
  that layer (`useNavigation` verbs, `analysisService` calls, named
  `store.session.ui` writes) — the keyboard analog of App-wiring, per
  the FILES.md layering. Structurally [B3] via the `analysis-service`
  import; entries are band-mixed *values* (nav.* is game-tree [B2];
  ponder / ownership overlays are [B3]) — single tag + values-note per
  the timing.ts precedent.

### Seam A — `enabledWhen` parameterized as catalog-supplied predicates

The substrate's `KeybindingEnabledWhen` string enum
(`'always' | 'activeBoardExists' | 'engineConnected'`) and the
store-reading `isActionEnabled` switch are gone. `enabledWhen` is now
`KeybindingEnabledPredicate = () => boolean`, supplied by the catalog;
the catalog exports the three gates as named predicates closing over
the store, read at call time (the existing handler posture). Of the two
sanctioned designs — predicate functions vs a host-capability
interface — predicates were chosen because (a) the deleted enum's own
doc comment already prescribed exactly this promotion path when the
vocabulary outgrew three cases, (b) no UI renders the gate vocabulary
(nothing needs a serializable capability *name*), and (c) a capability
interface would re-introduce a closed vocabulary for the substrate to
interpret — the coupling shape the seam exists to remove. The
substrate's `isActionEnabled` wrapper was deleted rather than kept as a
one-line forwarder: its entire body *was* the vocabulary switch, and
the dispatcher calling `action.enabledWhen()` directly is the honest
residual shape.

### Seam B — `validateKeybindingsRegistry` takes the registry

The validator no longer closes over `KEYBINDINGS_REGISTRY`; it takes
`registry: ReadonlyArray<KeybindingActionDecl>`. The `useAppBootstrap`
call site changes shape accordingly
(`validateKeybindingsRegistry(KEYBINDINGS_REGISTRY)`, with the catalog
imported there). Side benefit: the validator's two failure branches
(duplicate id, default-key conflict) are now exercisable with synthetic
registries — both have new tier-1 tests; previously only the shipped
registry's pass case was testable.

### Seam B twin — `findActionByKey` parameterized (judged extension)

**Deviation from the commission's literal importer table, recorded
loudly:** the item text has `keybindings-capture.ts` re-pointing its
`KEYBINDINGS_REGISTRY` import to the catalog. That import *is* the
Seam-B shape one file over — a [B1] helper closing over the catalog —
and leaving it would re-create the fusion the item exists to remove
(and would force the capture row's [B1] → [B3] retag, forfeiting the
discoverability the audit names as the argument for the split). So
`findActionByKey` now takes the registry as its first parameter, the
same registry-as-input posture as the validator; the capture module
imports only substrate helpers and stays honestly [B1]. The production
call site (`KeybindingRow.vue`) passes the catalog explicitly.

### Confirmed constraint — persisted action ids unchanged

Action `id` strings are keys into the persisted
`store.profile.settings.keybindings` blob; the split is pure code
motion with id strings byte-identical and no schema bump. Pinned by a
new test
(`tests/unit/composables/keybindings-catalog.test.ts`, "action id
strings are pinned to their persisted literals") that compares the
registry's ids against the twelve literal strings, and by the catalog
header's persisted-id contract (never rename; retire-and-add with a
migration).

### Importer table (re-derived at HEAD)

| Importer | Before | After |
|---|---|---|
| `composables/useUserIORegistry.ts` | registry + helpers + `isActionEnabled` from `lib/keybindings` | helpers/type from substrate; `KEYBINDINGS_REGISTRY` from catalog; `action.enabledWhen()` replaces `isActionEnabled(action)` |
| `composables/auth-app/useAppBootstrap.ts` | `validateKeybindingsRegistry` (nullary) | validator from substrate + catalog passed as argument |
| `components/KeybindingsView.vue` | registry + type from `lib/keybindings` | type from substrate; registry from catalog |
| `components/KeybindingRow.vue` | `effectiveKey` + type from `lib/keybindings` | unchanged imports from substrate; **adds** catalog import to supply `findActionByKey`'s registry argument |
| `lib/keybindings-capture.ts` | registry + helpers from `./keybindings` | helpers/type only (registry now a `findActionByKey` parameter) |
| `tests/unit/lib/keybindings.test.ts` | substrate + catalog mixed | substrate-only (synthetic registries); catalog smoke moved out |
| `tests/unit/composables/keybindings-catalog.test.ts` | — (new) | catalog smoke + predicates + persisted-id pin + shipped-registry validation |
| `tests/unit/lib/keybindings-capture.test.ts` | `ACTIONS` from `lib/keybindings` | `ACTIONS` + `KEYBINDINGS_REGISTRY` from catalog; 7 `findActionByKey` call sites gain the registry argument |
| `tests/integration/useUserIORegistry.test.ts` | `ACTIONS` from `lib/keybindings` | `ACTIONS` from catalog |

### Ride-alongs (same decay class, named in the item)

- The stale Phase-1 header claim in `lib/keybindings.ts` ("Phase 2
  rewrites the dispatcher" — Phase 2 shipped 2026-05-27) is gone with
  the header rewrite; `useUserIORegistry.ts`'s header now says all five
  plan phases shipped.
- Stale design-note paths re-pointed to
  `docs/archive/notes/design/keybindings-plan.md` in every file this
  change touches: both lib file headers, `useUserIORegistry.ts`,
  `KeybindingsView.vue`, `KeybindingRow.vue`,
  `tests/integration/useUserIORegistry.test.ts`, `types/ids.ts`,
  `store/defaults.ts`. The capture header's modifier-support deferral
  now also carries the work-status id `keybindings-deferred-extensions`
  (stable-handles convention).
- `types/ids.ts`'s `KeybindingActionId` prose re-pointed: constructor +
  catalog at `composables/keybindings-catalog.ts`, substrate at
  `lib/keybindings.ts`. Same re-point in the `schema.ts` /
  `defaults.ts` keybindings-slot comments (registry home).
- One contradictory comment pair in `useUserIORegistry.ts` fixed while
  renaming its `isActionEnabled` references: the rAF-state comment
  claimed the gate is re-checked at fire time while the callback
  comment (correct, per the Phase-5 sibling change) says it
  deliberately isn't. The former now matches the latter.

### Docs

- **FILES.md** — substrate row rewritten ([B1] is structural fact since
  the split); new catalog row ([B3] + values-note per the timing.ts
  precedent); capture row notes the registry-parameter posture;
  `KeybindingRow.vue` / `KeybindingsView.vue` rows note their catalog
  imports honestly (machinery domain-free, catalog injected/walked).
- **IDENTIFIERS.md** — `KeybindingActionId` construction sites
  re-pointed (`asActionId` at `keybindings-catalog.ts:44`, `ACTIONS` at
  `:52-65`, capture re-brand at `:183`); notes column names the
  persisted-id pin test.

## Verification

- `npm run build` (vue-tsc -b + vite build): clean.
- `npx eslint .`: clean.
- `npm run test:run`: 888 passed, 4 skipped, 0 failed (includes the new
  persisted-id pin and the validator's two new failure-branch tests).
- No runtime-behaviour change is intended anywhere in this diff; the
  integration suite (dispatch, gating, capture, overrides, lifecycle)
  runs against the moved catalog unchanged.

## Sequencing note — `keybindings-deferred-extensions`

The open umbrella item for the deferred keybindings extensions
(modifier support, chords, mouse bindings, mousewheel audit) names this
split as the structural prerequisite worth landing first. That
prerequisite is now in place: extensions add catalog entries (and, if
a gate vocabulary grows, new predicates) without touching the
substrate; substrate-side extension points (e.g. a modifier-aware
`normalizeKey`) are now changes to a catalog-agnostic module with
synthetic-registry tests.

## Deferred / notes

- `SettingsTab.vue`'s header still cites the pre-archive plan path; it
  imports only `keybindings-capture` and is otherwise untouched by this
  diff, so the one-line comment fix was left (minimal-touch). Same
  decay class as the paths fixed above; trivially fixable on next
  touch.
- `useUserIORegistry.ts` ([B2]) and the two [B1] editor components now
  *visibly* depend on the [B3] catalog — the dependency existed at HEAD
  through the fused file; the split surfaces it. Adjudicating those
  rows' band tags systematically belongs to the open
  `band-conformance-ci-check` item; this change annotates rather than
  retags.
- The `schema.ts` / `defaults.ts` comment re-points were made under
  partial visibility (comment-only edits anchored on unique exact
  strings, surrounding blocks read) — the ADR-0004 minimal-touch shape.

---

License: Public Domain (The Unlicense).
