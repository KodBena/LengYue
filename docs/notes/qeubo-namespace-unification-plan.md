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
and schema-based settings, plus a transform layer that lets the
qEUBO optimizer search a low-dimensional space while driving a
correspondingly larger set of correlated downstream writes.

The transform layer is the structural answer to the cardinality
problem the user has already named: 16 chrome anchors × 3 RGB
channels = 48 dimensions, far outside the regime where
GP surrogates are healthy. The strategies the user sketched
(per-cluster optimization, fixed-luminance subspaces, anchored
hue offsets) are all instances of the same shape: qEUBO sees a
small input space; the user-defined transform projects that
input upward into the larger output-path space. The user's
explicit example: a 2-dimensional qEUBO search projecting up to
5 user-meaningful parameters via a `R^2 → R^5` transform; the
optimizer never sees the 5D space directly, only the 2D
manifold the user has chosen to search.

---

## Decision — three layers

### 1. Knob registry

A top-level `profile.settings.qeuboControl: Record<KnobId, KnobDecl>`.
Each entry declares the knob's qEUBO-visible input dimensions,
the downstream output paths it writes to, the transform that
maps inputs to outputs, and whether the knob is currently under
qEUBO control.

```ts
type KnobDecl = {
  id: string;                                 // stable identifier; the wire-key prefix
  qeuboControlled: boolean;
  inputs:   { range: [number, number]; subId?: string; label?: string }[];
  outputs:  { path: string }[];               // dot-paths against GlobalStore
  transform?: KnobTransform;                  // (vec_in: number[]) => number[]
                                              // absent ⇒ identity (requires inputs.length === outputs.length)
  label?: string;
};
```

`inputs.length` is the qEUBO search dimensionality (`N`);
`outputs.length` is the downstream-path count (`K`); the
transform is a function `R^N → R^K`. Typically `N < K` (the
whole point — the optimizer searches a lower-dimensional
manifold inside the user's full parameter space). `N === K`
with no transform is the direct-knob case; `N === K === 1` is
the today-shaped scalar knob mapping.

Output paths are dot-separated against the reactive `store`,
e.g.,`'profile.settings.appearance.intensityHueShift'`,
`'profile.settings.engine.katago.analysis_env.parameters.gamma'`,
or `'profile.settings.theme.accents.0'` (the last being one
component of a vector-valued output the transform writes
several entries of in coordinated fashion).

### 2. Knob accessors

Two pure functions, `readKnob(path: string): number` and
`writeKnob(path: string, value: number): void`. Walk the store
along the path; write through Vue's reactivity so downstream
consumers (CSS variables for theme, watchers for engine config)
respond to qEUBO-driven changes the same way they respond to
manual edits.

Type-mismatched leaves throw (ADR-0002); a stale path that no
longer resolves throws at startup, not silently no-ops. The
knob accessors are deliberately scalar-keyed; the vectorization
lives one layer up in the KnobDecl, not in the path language.

### 3. Virtual knobs (the cardinality solution)

A `KnobTransform` is any function `R^N → R^K`. Three regimes
collapse onto the same shape:

- **Direct knob.** `N = 1, K = 1`, no transform (or
  `transform: 'identity'`). Today's flat
  `analysis_env.parameter_meta` entries land here after
  migration.
- **Scalar-driven virtual knob.** `N = 1, K > 1`. The user's
  originally-sketched strategies — `lockstep-hue-rotate`
  (one hue offset, K writes coordinated by a fixed delta
  table) and `fixed-luminance-arc` (one CIELab arc parameter,
  K writes preserving perceptual luminance) — are both this
  case. Transform is scalar-to-vector.
- **Matrix-projection virtual knob.** `N > 1, K > N`. The
  user's `R^2 → R^5` example: qEUBO sees a 2-dimensional
  search, the user has 5 downstream parameters, the transform
  is a `2×5` linear map (or any other vector function the user
  wants to pose). The optimizer never sees the 5D space
  directly — its GP surrogate models the 2D manifold the user
  has chosen to search inside it. Adding a third qEUBO
  dimension widens the search; it does not change the
  parameter shape on either side.

For v1, transforms are a small named library
(`'identity'`, `'linear'` (matrix-coefficient table),
`'lockstep-hue-rotate'`, `'fixed-luminance-arc'`).
User-authored transforms are out of scope: sandboxing
JS-as-string isn't worth the complexity, and the named
transforms cover both the user's three sketched strategies and
the matrix-projection case (`'linear'` with a user-supplied
coefficient table). Adding a new named transform is a frontend
code change, not a runtime config change.

`'linear'`'s coefficient table is per-KnobDecl runtime data,
not code: the editor surfaces a `K × N` matrix widget; the
transform reads its coefficients from a sibling field on the
KnobDecl. That keeps the v1 transform library small while
admitting arbitrary linear projections without code edits per
project.

---

## qEUBO bridge

`useQeubo`'s controlled-parameter list becomes a flat list of
**wire keys**, where each KnobDecl's input dimensions expand
into one wire key per dimension. Naming convention: `<knobId>`
when `inputs.length === 1` (preserves migration compat with
today's flat keys); `<knobId>:<subId>` when
`inputs.length > 1`, where `subId` defaults to the
zero-indexed position if the user didn't supply a label.

The wire payload sent via `qeubo-service.ts` is unchanged in
shape — backend's encode/decode is key-agnostic;
`controlled_parameters: string[]` and
`parameter_ranges: Record<string, [number, number]>` work just
as well with KnobDecl-derived wire keys as with bare param
names. The optimizer treats the dimensions as independent; the
GP surrogate models correlations between them naturally; the
*transform* is what reconstructs the structural relationship
on the readout side.

**No backend dispatch is needed** as long as we hold to scalar
ranges per-dimension. Range non-scalars (e.g., RGB triples as
ranges) would need backend rework; the vector-input KnobDecl
shape covers the same expressivity at frontend layer without
that cost, so scalar-per-dimension stays the v1 contract.

**Readout flow.** When the optimizer returns its
`Record<string, number>`, the frontend reassembles per-knob
input vectors: for each KnobDecl, gather `inputs.length` wire
entries (in declared order) into a `number[]`, apply the
transform to get the `K`-vector of output values, write each
output to its corresponding path via `writeKnob`. The
reassembly is the only new bookkeeping; everything downstream
of `writeKnob` is identical to today's scalar-per-parameter
flow.

`applyEffective` follows the same flow as readout but operates
on the currently-effective audition vector rather than a fresh
optimizer response.

---

## Bookmarks

`QeuboBookmark.parameters` becomes `Record<KnobId, number[]>`
— each entry is the qEUBO-visible input vector for that knob,
not the downstream output values. The output values are derived
from the inputs via the transform; storing them would duplicate
the source of truth and lose meaning if the transform were ever
edited.

Apply-bookmark walks each KnobId, runs the stored input vector
through the transform, and writes each output via `writeKnob`.
For direct knobs (`N === K === 1`, identity transform) this
collapses to the today-shape "write the scalar to the path."

Migration: existing bookmarks store `Record<string, number>`
over `analysis_env.parameters` keys; the migration maps each
key to a KnobId (the same one the parameter_meta migration
seeds) and wraps the scalar in a length-1 vector
`[scalar]`. Direct-knob shape, no transform required.

---

## Editor surface

The parameter-meta editor in `PaletteEditor.vue` is the right
scaffolding (per the parking note). It generalizes:

- **Direct-knob shorthand.** When a knob is `N = K = 1` with
  no transform, the editor presents a simplified row — one
  range, one path, no transform picker — matching today's
  ergonomic. The underlying KnobDecl is still vectorized, just
  with length-1 arrays.
- **Vector-input editor.** When the user wants `N > 1`, the
  editor opens an input-list widget (per-dimension range and
  optional label) and an output-list widget (per-path).
- **Transform picker.** A dropdown over the named library,
  plus a coefficient-table widget when `'linear'` is selected.
  The `K × N` matrix is edited in place; row/column counts
  derive from the input/output list sizes.

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

- **Cardinality warning surface.** The badge counts qEUBO
  *input* dimensions (sum of `inputs.length` across knobs with
  `qeuboControlled: true`), not output paths. A `R^2 → R^5`
  knob contributes 2, not 5 — which is the honest signal,
  since the GP surrogate sees only the input dimensions.
  Threshold remains ~6–8 (yellow above 8); the warning surfaces
  in the editor, not as a blocker.
- **Stale-path failure mode.** A KnobDecl whose output path no
  longer resolves (renamed setting, deleted bag entry) must
  throw at startup, not silently no-op (ADR-0002). The
  migration that introduces the registry should validate every
  initial entry's paths; subsequent edits go through the same
  validation.
- **Type-checking the path.** `readKnob`/`writeKnob` lose the
  type system at the path string. Worth investing in a
  TypeScript helper that compiles known paths to a discriminated
  union, like
  `Path<GlobalStore> = "profile.settings.appearance.intensityHueShift" | ...`.
  The compile-time win pays dividends on every refactor that
  renames a setting. Defer to v2 if scope is tight.
- **Transform invertibility.** The bookmark-store-input shape
  works regardless of transform invertibility. But "what is the
  current input vector for a knob whose user has been editing
  outputs directly?" has no honest answer when the transform
  isn't injective — the current outputs may not correspond to
  any input vector. The right posture: inputs are the source of
  truth for qeubo-controlled knobs; outputs are read-only-for-
  manual-edit while the knob is under qEUBO control. The editor
  enforces this with a "controlled" / "manual" gate at the
  KnobDecl level.
- **Encode/decode at the edge.** Per the qEUBO integration
  dispatch's §2.3, the runtime supports `controlled_parameters`
  + `parameter_ranges` at storage level only — the encode/decode
  (`(actual − min) / (max − min)`) lives in PD route code on the
  backend. Range-scalar-per-dimension is the constraint;
  transforms run frontend-side post-decode, so backend stays
  oblivious to the virtual-knob mechanism entirely.
- **Migration ergonomics.** Mapping existing
  `analysis_env.parameter_meta` entries to direct KnobDecls is
  mechanical — each becomes `inputs: [{ range }]`,
  `outputs: [{ path }]`, no transform. The harder question is
  preserving custom entries in `analysis_env.parameters` —
  those entries must continue to read/write at their original
  paths. The migration preserves both the bag map and adds
  KnobDecls on top.

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
  from `analysis_env.parameter_meta` (each entry → direct
  `N = K = 1` KnobDecl) and rekeying bookmarks
  (`Record<string, number>` → `Record<KnobId, number[]>`).
- New `src/lib/knobs.ts` — pure path-walk accessors and named-
  transform library; the file is the unit-test target.
- `src/composables/useQeubo.ts` — read from the registry; the
  `applyEffective` and bookmark paths route through `writeKnob`
  with vector-reassembly upstream.
- `src/services/qeubo-service.ts` — likely unchanged (wire is
  key-agnostic; the wire-key derivation lives in `useQeubo` /
  `lib/knobs.ts`, not the ACL).
- `src/components/PaletteEditor.vue` — generalized meta-editing
  panel with direct-knob shorthand and vector-input editor for
  `N > 1` cases.
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
