# qEUBO Namespace Unification — Design Note

**Status:** `design-note: planned`. No implementation work has
started. This document is the canonical handle for the
qEUBO-controls-anything ambition; it picks up the parking note
filed during the 2026-05-02 theme-substrate session
(`docs/dispatch/frontend-to-frontend-session-handoff-2026-05-02.md`,
"qEUBO over chrome — the user's parking note") and the matching
"qEUBO over chrome" follow-up in
`docs/worklog/2026-05-02-theme-substrate-a4.md`.

**Motivation.** The existing qEUBO surface is shaped around
`analysis_env.parameter_meta[name]`, where `name` is a flat key
indexing `analysis_env.parameters` — the engine-knob bag inside
the analysis environment. Theme colors, intensity hue shift,
animation durations, registry-editor leaves, and other settings-
tree values are all valid qEUBO targets in principle but live at
fixed schema paths, not in a bag. The unification needs a
tree-walk-keyed knob abstraction sitting above both bag-based
and schema-based settings, plus a transform layer that lets one
qEUBO scalar drive multiple correlated downstream values.

The transform layer is the structural answer to the cardinality
problem the user has already named: 16 chrome anchors × 3 RGB
channels = 48 dimensions, far outside the regime where
GP surrogates are healthy. The strategies the user sketched
(per-cluster optimization, fixed-luminance subspaces, anchored
hue offsets) are all instances of the same shape: one virtual
knob driving multiple physical writes via a deterministic
transform.

---

## Decision — three layers

### 1. Knob registry

A top-level `profile.settings.qeuboControl: Record<KnobId, KnobDecl>`.
Each entry names a path in the settings tree (or in the
engine-knob bag), its range, and whether it is currently
qeubo-controlled.

```ts
type KnobDecl = {
  id: string;                    // stable identifier; doubles as wire key
  path: string;                  // dot-path against GlobalStore
  range: [number, number];
  qeuboControlled: boolean;
  transform?: KnobTransform;     // see (3); absent ⇒ direct knob
  label?: string;
};
```

The path is dot-separated against the reactive `store`, e.g.,
`'profile.settings.appearance.intensityHueShift'`,
`'profile.settings.engine.katago.analysis_env.parameters.gamma'`,
or `'profile.settings.theme.warmness'` (the last being a virtual
knob path that doesn't exist in the underlying schema — see (3)).

### 2. Knob accessors

Two pure functions, `readKnob(path: string): number` and
`writeKnob(path: string, value: number): void`. Walk the store
along the path; write through Vue's reactivity so downstream
consumers (CSS variables for theme, watchers for engine config)
respond to qEUBO-driven changes the same way they respond to
manual edits.

Type-mismatched leaves throw (ADR-0002); a stale path that no
longer resolves throws at startup, not silently no-ops.

### 3. Virtual knobs (the cardinality solution)

A `KnobTransform` lets one qEUBO scalar drive multiple physical
writes deterministically. The user's already-sketched strategies
map cleanly onto this mechanism:

- **Anchored hue offsets.** One `theme.warmness` knob in
  `[0, 1]`. Transform writes `--accent-primary`,
  `--accent-secondary`, `--state-warning`, etc., with their hues
  offset by a fixed table of deltas. One qEUBO dimension
  controls a coordinated palette shift.
- **Fixed-luminance subspaces.** Transform projects `[0, 1]`
  onto a CIELab arc with luminance pinned. The writes preserve
  perceptual luminance while the optimizer searches hue/chroma.
- **Per-cluster optimization.** Not a transform — just selective
  `qeuboControlled: true` on a subset of knobs (e.g., the four
  state-* anchors) while others stay false. The optimizer sees
  only the subset; the rest hold their current values.

For v1, transforms are a small named library (`'identity'`,
`'linear'`, `'lockstep-hue-rotate'`, `'fixed-luminance-arc'`).
User-authored transforms are out of scope: sandboxing
JS-as-string isn't worth the complexity, and the named transforms
cover the user's three sketched strategies. Adding a new
transform is a frontend code change, not a runtime config change.

---

## qEUBO bridge

`useQeubo`'s controlled-parameter list becomes `KnobId[]` (today:
bare names from `parameter_meta`). The wire payload sent via
`qeubo-service.ts` is unchanged in shape — the backend's
encode/decode is key-agnostic; `controlled_parameters: string[]`
and `parameter_ranges: Record<string, [number, number]>` work
just as well with `KnobId`s as with bare param names.

**No backend dispatch is needed** as long as we hold to scalar
ranges per-knob. Range non-scalars (e.g., RGB triples as ranges)
would need backend rework; transforms cover the same expressivity
without that cost, so scalar-only is the v1 contract.

`applyEffective` walks each KnobId's value through `writeKnob`,
running the transform first if one is declared. For virtual
knobs, the transform expands `(knobId, scalar)` into
`Record<Path, number>`, and each entry is written via the
accessor.

---

## Bookmarks

`QeuboBookmark.parameters: Record<string, number>` becomes
`Record<KnobId, number>`. The shape is identical at the type
level; only the keying convention shifts. Apply-bookmark walks
each KnobId and calls `writeKnob`.

Migration: existing bookmarks are over `analysis_env.parameters`
keys; they map to KnobIds whose path prefix is
`profile.settings.engine.katago.analysis_env.parameters.<name>`.
The migration walks both `analysis_env.parameter_meta` (to seed
the knob registry) and the bookmark list (to rekey), preserving
existing user state.

---

## Editor surface

The parameter-meta editor in `PaletteEditor.vue` is the right
scaffolding (per the parking note). It generalizes naturally:
instead of iterating `parameter_meta` entries, it iterates the
knob registry; each row shows path / range / controlled-toggle /
transform-picker.

The Analysis Environment view continues to list bag-based knobs
under `analysis_env.parameters`. New views (Theme, Appearance,
Animation) list schema-based knobs at their fixed paths. All
views write the same registry; the layout is just a presentation
filter over the registry's contents.

A dedicated top-level `KnobRegistryEditor.vue` may be the right
place for the cross-view picture (every declared knob, every
transform, every controlled subset). Defer the call to
implementation time — the first new view will tell us whether
the existing per-domain editor pattern scales or whether a
cross-domain view is needed up front.

---

## Viability concerns

- **Cardinality warning surface.** GP surrogates degrade above
  ~6–8 dimensions. The editor should surface a live "qEUBO is
  calibrating across N parameters" badge that turns yellow above
  ~8. This is the soft pressure that nudges the user toward
  virtual knobs without forbidding ambitious experiments.
- **Stale-path failure mode.** A KnobDecl whose path no longer
  resolves (renamed setting, deleted bag entry) must throw at
  startup, not silently no-op (ADR-0002). The migration that
  introduces the registry should validate every initial entry's
  path; subsequent edits go through the same validation.
- **Type-checking the path.** `readKnob`/`writeKnob` lose the
  type system at the path string. Worth investing in a TypeScript
  helper that compiles known paths to a discriminated union, like
  `Path<GlobalStore> = "profile.settings.appearance.intensityHueShift" | ...`.
  The compile-time win pays dividends on every refactor that
  renames a setting. Defer to v2 if scope is tight.
- **Encode/decode at the edge.** Per the qEUBO integration
  dispatch's §2.3, the runtime supports `controlled_parameters`
  + `parameter_ranges` at storage level only — the encode/decode
  (`(actual − min) / (max − min)`) lives in PD route code on the
  backend. Range-scalar-only is the constraint; transforms run
  frontend-side post-decode, so backend stays oblivious to the
  virtual-knob mechanism entirely.
- **Migration ergonomics.** Mapping existing
  `analysis_env.parameter_meta` entries to knob declarations is
  mechanical. The harder question is preserving custom entries
  in `analysis_env.parameters` — those entries must continue to
  read/write at their original paths. The migration preserves
  both the bag map and adds knob declarations on top.

---

## Cross-references

- `docs/notes/qEUBO.md` — successor-session map for the qEUBO
  integration arc; the implementation status table that this
  follow-up plan sits downstream of.
- `docs/dispatch/frontend-to-backend-qeubo-integration.md` — wire
  contract for the optimizer service. The unification keeps the
  contract intact.
- `docs/dispatch/frontend-to-frontend-session-handoff-2026-05-02.md`,
  "qEUBO over chrome" section — the original parking note.
- `docs/worklog/2026-05-02-theme-substrate-a4.md`, "qEUBO over
  chrome" follow-on — the matching forward-pointer from the
  theme-substrate sweep.
- `docs/notes/frontend-theming-plan.md` — the Substrate-evolution
  section names the decouple-via-alias and color-mix-derivation
  principles that interact with the transform library
  (`fixed-luminance-arc` and `lockstep-hue-rotate` work against
  anchor families that already follow those principles).
- ADR-0002: stale-path and type-mismatch failure modes above.
- ADR-0003: band-1 placement (the abstraction is generic;
  transforms are theme-domain-specific but isolated in a clearly-
  named library).

---

## Frontend impact

Sizable. Compared to the hyperparameter harness (the sibling
plan at `docs/notes/dsl-hyperparameter-harness-plan.md`), this
project reaches further into existing surfaces.

- `src/types.ts` — `KnobId`, `KnobDecl`, `KnobTransform`,
  `KnobRegistry`.
- `src/store/migrations.ts` — one migration seeding the registry
  from `analysis_env.parameter_meta` and rekeying bookmarks.
- New `src/lib/knobs.ts` — pure path-walk accessors and named-
  transform library; the file is the unit-test target.
- `src/composables/useQeubo.ts` — read from the registry; the
  `applyEffective` and bookmark paths route through `writeKnob`.
- `src/services/qeubo-service.ts` — likely unchanged (wire is
  key-agnostic).
- `src/components/PaletteEditor.vue` — generalized meta-editing
  panel, or new sibling per-domain views (Theme, Appearance,
  Animation).
- Possibly new `src/components/KnobRegistryEditor.vue` for the
  cross-domain view.

---

## Maintenance contract

`design-note: planned`. When implementation lands, this document
transitions to `design-note: implemented` per the doc-graph
genre lifecycle: a status line at the top names the closing PR
and worklog, and the body becomes historical record. Until then,
this is the canonical handle for the planned work.

If implementation reveals the design is wrong in some
load-bearing way, file a sibling `design-note: revised` rather
than silently editing this one. The qEUBO arc is unusually
well-documented (`docs/notes/qEUBO.md`'s status table, the
backend dispatch chain, the worklogs); preserving the same
discipline here means a future reader can reconstruct what was
believed at planning time even if the implementation ended up
elsewhere.
