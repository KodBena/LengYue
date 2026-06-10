# Configuration Schema & Equivariant Projections — Design Note

> SSOT: `config-schema-projections` — status lives in the work-status SSOT
> (ADR-0005 Rule 9); this note's lifecycle is that item's state.

**Status:** `design-note: planned`.

**Genre.** Architecture-and-roadmap. Names a substrate that does not
yet exist (a declarative *configuration schema*), the projection
protocol that substrate must support, and a phased, migration-aware
implementation order. Contracts and types are given before
implementation per the frontend authoring posture; no code ships
with this note.

**Date:** 2026-05-30.

**Author audience.** A future implementer of the settings/registry
refactor, and a future reader reconstructing why the configuration
surface has the shape it has. Assumes the reader has read
`docs/archive/notes/design/knob-registry-plan.md` — the closest existing substrate
and the structural template for this note — and the two postmortems
it spawned (`postmortem-knob-registry-qeubo-domain-2026-05.md`,
`postmortem-knob-toolbar-popover-2026-05.md`).

**Provenance.** The investigation behind this note was conducted
first-hand against the source tree on 2026-05-30 (three attempts to
delegate breadth to Opus sub-agents failed on a sustained upstream
overload; the file reads were done directly instead). Every code
citation below is verbatim with a `file:line` anchor. Claims about
the *internal* authoring UX of `AnalysisTabsEditor` / `PaletteEditor`
/ `CardSetEditor` are grounded in their data shapes, their seed
values in `defaults.ts`, and the migration comments — **not** in an
end-to-end read of those SFC templates; that boundary is flagged
where it matters (§7).

---

## 1. Motivation

### 1.1 The observation

The workspace configuration is surfaced to users through a set of UI
**projections** — the Settings tab's sub-tabs, the `<details>`
rolldowns, the recursive registry editor, the cross-domain knob
editor, the toolbar quick-access popover — whose mapping onto the
configuration object is **editor-driven, not topology-driven**. The
projections *overlap* rather than *partition*, the placement of a
setting in a tab/rolldown is *hand-wired* rather than *derived*, and
the per-leaf presentation knowledge is *scattered across five sites
in three label conventions* rather than declared once.

This is not a bug; it is **incompletely-factored structure** — the
same diagnosis the knob-registry plan made about user-controllable
scalars (`knob-registry-plan.md` §1: "The state is not bad — it is
**incomplete**"). The knob registry factored out the numeric-scalar
slice. This note factors out the rest.

### 1.2 The configuration is three store roots

"The workspace configuration" is not one object. The settings UI
edits three disjoint reactive roots:

- `store.profile.settings` — the `AppSettings` interface
  (`types.ts:879`).
- `store.profile.cardSets` — a *sibling* of `settings`, not under it
  (`types.ts:1759` `ProfileState`).
- `store.session.ui` — the `UISession` interface (`types.ts:1330`),
  a different store branch entirely.

`SyncService` deep-watches `store.profile` and `store.session` and
debounces a single PUT (`sync-service.ts:186-215`); the blob is
serialised by `buildPersistencePayload()` in `sendSync`
(`sync-service.ts:256-284`), and `migrate()` walks it forward on
hydrate (`migrations.ts:203`). So config shape lives in exactly these roots,
and any change to that shape is a persisted-blob concern.

### 1.3 The five fragmentation symptoms (verbatim evidence)

**(a) Presentation knowledge is an implicit schema scattered inside
`RegistryEditor.vue`.** The recursive editor decides each leaf's
widget, enum domain, tooltip, and add/remove policy by re-deriving
from runtime shape and path-string matching, through four hard-coded
tables:

- `isDynamicNode` — add/remove-key policy by string suffix
  (`RegistryEditor.vue:25-41`): matches paths ending `symbols`,
  `state_fns`, `bindings`, `parameters`, `overrideSettings`.
- `PATH_ENUMS` — path → allowed values (`RegistryEditor.vue:63-90`),
  keyed by a dot-path *relative to the editor's mount root* (the
  editor is mounted twice, on `profile.settings` and on
  `session.ui`).
- `PATH_TOOLTIPS` — path → warning string (`RegistryEditor.vue:112-155`).
- `getFieldType` — widget inference by heuristic
  (`RegistryEditor.vue:161-168`), including
  `return value.length > 40 ? 'expression' : 'scalar'`.

Labels are the raw object key: `<label class="leaf-label">{{ key }}</label>`
(`RegistryEditor.vue:240`) — so the user reads `ownershipDeadbandThreshold`,
not a localised phrase.

**(b) The label convention is split three ways.** Section/sub-tab
headers are i18n flat-keys in `src/locales/*.json`
(`en.json:35` `"settings.section.advancedRegistry": "Advanced Registry"`).
Registry *leaf* labels are raw camelCase keys (symptom (a)). Knob
labels are *literal English strings* baked into `defaults.ts`
(`defaults.ts:358` `label: 'Move-suggestion filter threshold'`). Three
conventions for the same concept ("the human name of a setting").

**(c) The projections overlap instead of partitioning.** The
"Advanced Registry" rolldown renders the *entire*
`store.profile.settings` (`SettingsTab.vue:122`
`<RegistryEditor :registry="store.profile.settings" …/>`), which
**includes** branches that *also* have dedicated editors elsewhere
in the same tab: `analysis_env` (PaletteEditor, `SettingsTab.vue:98`),
`analysisTabs` (AnalysisTabsEditor, `SettingsTab.vue:137`), and
`keybindings` (KeybindingsView, `SettingsTab.vue:142`). The registry
editor is "everything," not "everything not otherwise surfaced."
Nothing declares which projection owns a given leaf.

**(d) The two write paths have opposite fail-postures.** The registry
editor emits into `updateRegistry`, which **auto-vivifies**
missing intermediate objects (`lib/utils.ts` — re-homed from
`engine/util.ts` with the `setDeep` helper folded in, 2026-06-10:
when an intermediate `current[key]` is null or non-object it is
replaced with `{}`). The knob substrate's `writeKnob` **throws** if the leaf does not
pre-exist (`knobs.ts:122-128`: "final segment … does not exist on the
parent object. Add the leaf via the store's defaults / migration
before declaring a KnobDecl that writes to it"). One path is
permissive enough to silently grow arbitrary structure; the other is
strict per ADR-0002. A new config leaf with no `PATH_ENUMS` entry
renders as a free-text input even when it is semantically an enum —
the silent-classification failure ADR-0008 names.

**(e) No equivariance guarantee.** Nothing ensures the projections
agree. A config addition can appear in the registry editor (it
renders everything) but be absent from a dedicated editor, or render
with a different widget/label than a knob pointed at the same leaf.
The path vocabulary itself differs: `PATH_ENUMS` keys are
root-relative (`'appearance.theme'`), while `KnobDecl.outputs[].path`
are full store paths (`defaults.ts:369`
`path: 'profile.settings.appearance.ownershipOpacityCeiling'`). Two
spellings for one location.

### 1.4 What the codebase already does right (and settings is the holdout)

Every *other* configurable surface in the SPA is already
data-declarative, with a static descriptor consumed by one or more
views:

| Surface | Descriptor (data) | Consumers |
|---|---|---|
| Analysis layout | `analysisTabs: AnalysisTab[]` = `{id,label,panelIds}` (`types.ts:119`) | `AnalysisTabsEditor` (edit), `AnalysisDashboard`/`useAnalysisTabs` (render) |
| Card decks | `CardSet` with a holey pipeline DSL + typed `HyperparamDecl[]` (`types.ts:1739`) | `CardSetEditor` (edit), bind-time prompt modal, `PipelineExecutor` |
| Palette / analysis env | `AnalysisEnvironment` (symbols, params, palettes; expression strings) | `PaletteEditor` (edit), proxy-side evaluator (consume) |
| Keybindings | static `KEYBINDINGS_REGISTRY` of action-decls + sparse user-override map | `useUserIORegistry` dispatcher, `KeybindingsView` |
| User-controllable scalars | `KnobRegistry` of `KnobDecl` (`types.ts:582`) | `KnobRegistryEditor`, `ToolbarSliderPopover`, qEUBO |

The **settings taxonomy itself** is the one surface that is *not*
data-declarative: its structure lives in `SettingsTab.vue`'s template
and `RegistryEditor.vue`'s hard-coded tables. This note proposes to
close that gap by giving the configuration the same treatment the
codebase already gives layouts, decks, palettes, keybindings, and
knobs.

There is **no prior art** for this refactor in the doc graph: a
search of `docs/` for settings-taxonomy / config-schema /
declarative-settings / registry-refactor returned nothing. This is
greenfield; the knob-registry plan is the only adjacent substrate.

---

## 2. The principle — schema as SSOT, projections as pure functions

Introduce a single declarative **configuration schema** `S`: a typed
description of the configuration tree that is the **single source of
truth** for each path's structure, presentation, grouping, and
gating. From `S`, every projection is derived as a **pure function**:

- the recursive registry editor renders `S` (not the raw object), so
  it reads widget/enum/label/tooltip/dynamic-policy *from the node*,
  not from path-string matching;
- the Settings sub-tabs and rolldowns are **generated** from each
  node's declared placement + order, not hand-wired in `SettingsTab`;
- the knob editor and toolbar popover render the subset of `S` whose
  leaves delegate to a `KnobDecl`;
- any future projection — a global settings search, a command
  palette, a "pin this setting to the toolbar" affordance, or an
  end-user/LLM authoring surface (§8) — is *just another function
  over `S`*.

The configuration *values* stay exactly where they are
(`profile.settings`, `profile.cardSets`, `session.ui`). The schema is
**additive metadata describing the existing tree** — it does not move
or rename anything by itself. This is the central risk-management
decision of the whole arc (§10.1).

---

## 3. The schema node shape (contracts before implementation)

A first-cut shape. Discriminated on `kind`; a *group* has children, a
*leaf* has a widget. Paths are **full store paths** (the `KnobDecl` /
`SyncService` convention, `profile.settings.…` or `session.ui.…`) —
unifying the two path vocabularies symptom 1.3(e) names.

```ts
/** Canonical full store path, e.g. 'profile.settings.appearance.theme'. */
type ConfigPath = StorePath; // reuse the knob substrate's brand direction

type ConfigNode = ConfigGroup | ConfigLeaf;

interface ConfigGroup {
  readonly kind: 'group';
  readonly path: ConfigPath;          // the object this group describes
  readonly labelKey: I18nKey;         // unifies the three label conventions
  readonly band: Band;                // ADR-0003 B1 | B2 | B3 | B?
  readonly placement: Placement;      // where this group surfaces (§3.1)
  readonly order?: number;
  readonly children: readonly ConfigNode[];
  /** Add/remove-key policy — absorbs `isDynamicNode`. */
  readonly dynamicKeys?: DynamicKeyPolicy;
  readonly visibleWhen?: GateRef;     // declared gating — NOT mount-site inherited
}

interface ConfigLeaf {
  readonly kind: 'leaf';
  readonly path: ConfigPath;
  readonly labelKey: I18nKey;
  readonly band: Band;
  readonly widget: WidgetDecl;        // discriminated; see §3.2
  readonly tooltipKey?: I18nKey;      // absorbs `PATH_TOOLTIPS`
  readonly placement: Placement;
  readonly order?: number;
  readonly visibleWhen?: GateRef;
  readonly enabledWhen?: GateRef;
  readonly validate?: ValidatorRef;
  /**
   * Audience. `'user'` (default) → surfaced in settings projections.
   * `'internal'` → part of the persisted shape but NOT a user-facing
   * setting (navigator expansion state, current selection); excluded
   * from settings projections and exempt from a user-facing widget (§3.2).
   */
  readonly audience?: 'user' | 'internal';
  // default is NOT duplicated here — it is read from DEFAULTS at `path`
  // (the existing shadow-schema), with a startup check that the path
  // resolves (§3.3).
}
```

### 3.1 Placement — the taxonomy, declared

`Placement` is where the leaf/group surfaces. This is the piece that
makes "the taxonomy" a *declared property of the data* rather than an
artifact of `SettingsTab`'s template:

```ts
interface Placement {
  readonly section: SectionId;   // a named projection target (tab/rolldown)
  readonly subgroup?: string;    // optional within-section grouping
}
```

`SectionId` is a closed vocabulary of projection targets (e.g.
`'general'`, `'analysis'`, `'keybindings'`, `'session'`, plus a
designated `'advanced'`). The sub-tab/rolldown *structure* is itself
a small declared list of sections; the projection function buckets
nodes into sections by `placement.section` and orders within a
section by `order`. **Re-tabbing a setting is editing its
`placement`, in one place** — and every projection updates because
they all read `S`.

### 3.2 Widget descriptor — the closed, exhaustive vocabulary

```ts
type WidgetDecl =
  | { kind: 'toggle' }                                   // boolean
  | { kind: 'number'; range?: [number, number]; step?: number }
  | { kind: 'enum'; options: EnumSource }                // static list OR named dynamic resolver
  | { kind: 'text' }
  | { kind: 'expression' }                               // asteval palette string
  | { kind: 'symbol-ref' }                               // λ reference into the symbol table
  | { kind: 'knob-ref'; knobId: KnobId }                 // delegate to a KnobDecl (§6)
  | { kind: 'custom-editor'; editor: CustomEditorId }    // PaletteEditor / AnalysisTabsEditor / …
  | { kind: 'opaque' };                                  // structurally-complex / sum-typed leaf: read-only or deferred
```

Two of these resolve the symptoms directly. `enum`'s `EnumSource`
admits a **named dynamic resolver** (palette ids, card-set ids, the
active tab) — the case `PATH_ENUMS`' own comment (`RegistryEditor.vue:60`)
flags as "out of scope here — they need a per-root option resolver,
not a static table." `custom-editor` is the escape hatch: a branch
that warrants a bespoke editor (the palette, the analysis-tab layout,
keybindings, card sets) declares `{ kind: 'custom-editor', editor }`
and the projection mounts that SFC instead of recursing — so the
dedicated editors stay, but now *the schema declares where they live*
rather than `SettingsTab` hand-wiring them.

`HyperparamDecl` (`types.ts:1708-1729`) is the proof this shape is
idiomatic here: it is already a discriminated `number | string | enum`
leaf descriptor with `default` / `range` / `options` / `label`,
driving the bind-time prompt modal and the harness panel. `WidgetDecl`
is the same move generalised across all config leaf kinds.

**Not every leaf is scalar or user-facing — `session.ui` is the harder
root.** The widget vocabulary is closed and exhaustive *for scalar and
enumerable leaves*; it deliberately cannot classify a **sum-typed**
leaf such as `forestNav.selection: NavSelection | null`
(`types.ts:1510`, a discriminated `{kind:'game',…} | {kind:'root',…} |
null`), which the Session-UI registry today renders as a raw recursive
object. Such leaves take `{ kind: 'opaque' }` (read-only / structural)
or `custom-editor`; and several `session.ui` leaves (`forestNav`,
`cardTreeNav`, `overlayLayers`) are better marked `audience: 'internal'`
— they are persisted *navigator / UI state*, not user-facing settings,
and belong in no settings projection. The honest consequence: the
Phase-0 instance does **not** achieve a clean scalar-leaf-for-leaf
description of `session.ui` (the §9 Phase-0 wording is scoped
accordingly); that root is where `'opaque'` / `'internal'` /
`custom-editor` carry the weight, and the bijection test (§10.6) admits
those classifications rather than demanding a scalar widget for every
leaf.

### 3.3 Failure contract (ADR-0002), mirroring `knobs.ts`

The schema's band-1 library mirrors `knobs.ts`'s failure contract
(`knobs.ts:21-40`):

- **Startup completeness check.** Every `ConfigLeaf.path` must walk to
  an existing leaf on the live store of the asserted type (the
  `knobs.ts:338 validateRegistry` analog). A schema leaf whose path
  doesn't resolve throws at boot, naming the node.
- **Unknown leaf is loud.** A config leaf with *no* schema node is a
  loud failure surfaced by the **bijection test** (§10.6), not a
  silent free-text render. This is the inversion of `RegistryEditor`'s
  current permissive fallback.
- **Schema-authorised writes (on the configuration-projection path).**
  The unified mutator (§10.4) — the path settings projections emit
  into — writes only to (i) a path with a schema leaf, or (ii) a child
  of a node whose `dynamicKeys` policy authorises additions, and throws
  otherwise, replacing `updateRegistry`'s auto-vivify. It governs the
  projection write path, **not** bare reactive assignment from
  behavioural / command code (§4.1, class 3), which remains an ADR-0001
  convention write.

---

## 4. Equivariance — the precise property

The user named the requirement: *"we will continue to want the
equivariant projections."* Made precise:

Let the configuration state be `C` (the three store roots) and the
schema be `S`. A **projection** `P_i` is a pair of a *render*
`R_i : S × C → View_i` and an *edit-interpretation*
`E_i : Edit_i → (ConfigPath, value)`. The system is **equivariant**
iff two laws hold:

- **Law 1 — edit-commutativity (the shared action).** For one logical
  leaf `ℓ`, every projection that exposes `ℓ` interprets an edit to
  the *same canonical mutation* on the *same canonical path*:
  `E_i(edit_ℓ) = E_j(edit_ℓ) = write(path(ℓ), v)`. Editing the
  ownership-opacity ceiling via the toolbar slider, via the registry
  leaf, or via the cross-domain knob editor all reduce to
  `write('profile.settings.appearance.ownershipOpacityCeiling', v)`.
  *Today this fails:* the registry editor reduces to
  `updateRegistry` while the knob path reduces to
  `writeKnobValue` — two mutators, two fail-postures (§1.3(d)).

- **Law 2 — schema-naturality.** A schema change `δ : S → S'` (add a
  node, retag a band, move a node to another section) induces
  `R_i(S, ·) → R_i(S', ·)` for **all** `i` simultaneously, with no
  per-projection bookkeeping — because each `R_i` is a pure function
  of `S`. No projection holds its own copy of the taxonomy, so none
  can drift. *Today this fails:* the taxonomy lives in `SettingsTab`'s
  template and `RegistryEditor`'s tables, so a new leaf must be wired
  into each projection by hand, and the registry editor's "render
  everything" behaviour silently double-projects branches that
  dedicated editors already own (§1.3(c)).

The schema is the invariant object; the projections are natural
transformations over it; **correctness is the diagram commuting.**
The two laws are not abstract decoration — each is a concrete test
(§10.6): Law 1 is the "all projections of a leaf share one write" test;
Law 2 is the schema↔config bijection + "no leaf double-projected"
test.

### 4.1 Scope — configuration projections, not every reactive write

A **projection** here means a *configuration-editing surface* — a UI
whose job is to let the user view and change config. It does **not**
mean every site that mutates a config-backed reactive field. The
distinction is load-bearing, because `session.ui` is written by three
mechanisms and the equivariance laws govern only the first two:

1. **Configuration projections** — the registry editor, the knob
   editor, the toolbar popover, the generated sections. Must be
   equivariant (Laws 1–2): schema-routed, sharing one canonical write.
2. **The knob substrate** — `writeKnobValue` (`knobs.ts:702`), which
   also writes `session.ui` paths (`defaults.ts:361`
   `session.ui.moveFilterThreshold`, `:423`
   `session.ui.pvAnimation.fadeDurationMs`). Folded into Law 1 via
   `knob-ref` (§6).
3. **Behavioural / command writes** — direct reactive assignment from
   non-settings code: panel/sidebar collapse (`App.vue:373-394`),
   review-session state (`useReviewSession.ts`), keybinding command
   handlers (`keybindings.ts:217,228` toggling `showMoveSuggestions` /
   `showStoneMoveNumbers`), plus `useResizablePanel`, `StatusBar`,
   `ForestDirectory`, `useQeubo` — ~two dozen sites that set a field as
   a *side effect of normal operation*, not as an act of configuration.

**The laws bind class (1), reach class (2) via `knob-ref`, and
explicitly do NOT bind class (3).** A keybinding that toggles
`showMoveSuggestions` is a *command*, not a settings projection;
forcing it through the schema-validated mutator would be an unscoped
~two-dozen-site migration for no user-facing benefit, and "the SPA
toggled its own panel" is precisely ADR-0001's named-mutator-by-
convention write. So the schema-validated mutator (§3.3, §10.4) governs
the **configuration-projection write path**; it is not a global
interceptor of bare reactive assignment, and the earlier "everything
else throws" framing is corrected to that scope. The one caller that
blurs the line — `useDirtyBoardGuard.ts:92`, a *composable* writing
`navigation.actionOnDirtyBoard` through `updateRegistry` — is named in
§10.4 because it travels with whatever replaces `updateRegistry`.

Class (1) carries one further subtlety: a `custom-editor` projection
(e.g. PaletteEditor) owns its subtree's writes wholesale (it emits one
`update({path, value})` for the whole branch) *and* may itself consult
the knob claim machine — PaletteEditor refuses manual parameter writes
under a hard claim (PaletteEditor.vue:99-110,141-146). Law 1's "one
canonical write per leaf" holds at the projection's *boundary* (the
emitted update); the custom-editor's internal claim-coupling is a
legitimate part of that projection's edit-interpretation, not a
violation.

---

## 5. Worked example (non-abstract)

`appearance.ownershipOpacityCeiling` is reachable three ways today
and will be reachable through the schema after:

- **Now:** seeded at `defaults.ts:316` (`ownershipOpacityCeiling: 0.55`);
  rendered as a raw `number` leaf in the Advanced Registry (label
  `ownershipOpacityCeiling`); *also* a `KnobDecl`
  (`defaults.ts:364 'display.ownership-opacity-ceiling'`, range `[0,1]`,
  output path `profile.settings.appearance.ownershipOpacityCeiling`)
  rendered as a slider in `KnobRegistryEditor` and the toolbar popover.
  Two descriptors (registry leaf + KnobDecl), two label conventions
  (`ownershipOpacityCeiling` vs `'Ownership overlay opacity'`), two
  write paths.
- **After:** one `ConfigLeaf` at that path, `labelKey:
  'config.appearance.ownershipOpacityCeiling'`, `band: 'B1'`,
  `widget: { kind: 'knob-ref', knobId: 'display.ownership-opacity-ceiling' }`,
  `placement: { section: 'general', subgroup: 'display' }`. The
  registry editor, the knob editor, and the toolbar popover all
  render the same `KnobSlider` (the `knob-ref` resolves to the
  existing `KnobDecl` for range/claim) and all write the same path.
  One descriptor, one label, one write — equivariant.

(A harder case lives across mechanisms: `session.ui.showMoveSuggestions`
is written by a toolbar button *and* a keybinding command
(`keybindings.ts:217`). There Law 1 binds the settings projection that
exposes it; the keybinding remains a class-3 command write per §4.1.
The leaf is equivariant *as a setting*, not globally intercepted.)

---

## 6. Relationship to the knob registry — the fork

The single load-bearing architectural decision: does the config
schema **subsume** the knob registry (generalise `KnobDecl` to all
leaf kinds, fold claims as an optional facet) or **compose** with it
(schema owns structure + all leaf kinds; numeric/claim-bearing leaves
*delegate* to a `KnobDecl` via `knob-ref`)?

**Recommendation: compose.** Rationale:

1. **Claims are knob-specific.** The hard/soft consumer-arbitration
   state machine (`knobs.ts:535-802`) is meaningful for the handful
   of values qEUBO / autonomous-SR scenarios drive; forcing it onto
   every boolean and enum bloats its domain. Most config leaves never
   need a claim.
2. **Compose needs zero data migration.** The knob registry already
   exists and is persisted; the schema is *code describing the
   existing tree* (§2). Subsuming would require migrating the entire
   config representation into knob-decl shape — a large persisted-blob
   migration for no functional gain.
3. **ADR-0008 (classification).** "A numeric, transform-projected,
   user-tunable value" (a knob) and "any configuration field" (a
   schema node) are *different categories*. Collapsing them repeats
   the `domain: 'qeubo'` category-error shape the knob-registry arc
   already paid for (`postmortem-knob-registry-qeubo-domain-2026-05.md`):
   a consumer-flavoured concept (claims) leaking into a structural
   vocabulary.
4. **Honest cardinality.** A `KnobDecl` can fan one input through a
   transform to *K* output paths (`knobs.ts:786-802`). A config leaf
   is usually 1:1. Keeping them distinct preserves both shapes.

Under compose: the schema node for a knob-backed leaf is **thin**
(placement + `labelKey` + `knob-ref`); the `KnobDecl` keeps
range/transform/claim. **Single source per concern.** A seam test
(§10.6) asserts every `KnobDecl` output path that is also a config
leaf has exactly one schema node referencing it via `knob-ref` — no
double-projection, no orphaned knob.

*(The alternative — subsume — is recorded so the decision is durable,
not because it is recommended. Revisit only if a future need makes
claim-semantics pervasive across non-numeric leaves, which seems
unlikely.)*

---

## 7. Existing precedents this composes with

The forward-compat argument (§8) and the schema shape (§3) are
grounded in surfaces that already exist:

- **`analysisTabs` (the user's named template).** `AnalysisTab` is
  `{ readonly id; label; panelIds }` (`types.ts:119-123`); seeded at
  `defaults.ts:491`; migration `54 → 55` backfills it
  (`migrations.ts:179-194`). It is genuinely user-configurable *data*:
  the layout of the analysis area is an ordered list of named panel
  subsets, edited (per the `defaults.ts:489` comment, "The Settings
  editor (Phase 3) lets users re-tab") and consumed by
  `AnalysisDashboard` / `useAnalysisTabs`. *This is exactly
  "layout-as-data," and the proposal is "settings-taxonomy-as-data"
  by the same move.* (Characterisation from the type + seed + migration
  comment; I did not read `AnalysisTabsEditor.vue` end-to-end.)
- **Card-set holey-pipeline DSL.** `CardSet` (`types.ts:1739`) carries
  `pipeline: PipelineStageWithHoles[]` and `hyperparameters:
  HyperparamDecl[]`. A hole is `Hole = { readonly $param: string }`
  (`types.ts:1682`); `Holed<T>` (`types.ts:1693-1699`) lifts any
  wire-typed value into "primitive-or-hole" while literal
  discriminators pass through. The seed deck (`defaults.ts:509-522`)
  shows it concretely: `{ stage: "take", n: { $param: 'deck_size' } }`
  bound by `{ name: 'deck_size', type: 'number', default: 10, range:
  [1, 500], label: 'Deck size' }`. **This is the closest existing
  precedent to a declarative spec with typed, labelled, ranged
  holes** — exactly what an authorable config-taxonomy DSL needs.
- **`HyperparamDecl`** (`types.ts:1708-1729`) — the leaf-descriptor
  union (§3.2) that already drives an editor and a bind-time modal.
- **`KEYBINDINGS_REGISTRY` + sparse override map.** `useUserIORegistry`
  (`useUserIORegistry.ts`) dispatches against a static action registry
  with the user's `store.profile.settings.keybindings` as a *sparse
  override map* (absence = default, explicit `null` = unbound). The
  "static schema + sparse user values" split is precisely the
  schema/values relationship proposed here.
- **`KnobRegistry`** — the numeric slice (§6).

The claim "you already build every configurable surface this way;
settings is the holdout" is grounded in five precedents, not asserted.

---

## 8. Forward-compatibility — schema-as-data, authorable (deferred, non-committal)

The project author raised a forward-looking possibility — *not a
committed requirement*: that the end user might one day configure the
settings taxonomy itself "the same way the analysis layout can be
configured," and that if the domain expands beyond Go (e.g. general
education), a **DSL** for specifying the taxonomy could benefit LLMs
(textual) or humans (visual, as the analysis/palette designers
already are). The author has explicitly *not* decided whether to
pursue this.

This note's job is to make the architecture **not preclude** it,
cheaply, while committing to none of it. Because `S` is data (like
`analysisTabs`, palettes, card-set pipelines, keybinding overrides —
all already user-data), it admits, *if and when desired*:

- **A visual schema designer** — re-group, re-tab, relabel, hide, or
  pin settings, in the same idiom as `AnalysisTabsEditor` re-tabs the
  analysis area. Editing `placement` / `order` / `visibleWhen`.
- **A textual schema DSL** — the card-set "JSON5 + `$param` holes +
  typed `HyperparamDecl`" dialect (§7) is the existing precedent for a
  declarative spec an LLM or human can author. A config-taxonomy DSL
  is the same shape: declare nodes, widgets, groups, and holes. This
  is what makes **domain expansion tractable**: an LLM generates a
  settings taxonomy for a new domain's configuration from a schema
  DSL, instead of a contributor hand-wiring sub-tabs + `PATH_ENUMS` in
  code.

**ADR-0003 framing (the load-bearing forward-compat point).** The
schema *framework* — the node types, the projection functions, the
recursive editor — is **band-1, domain-agnostic**. The schema
*instance* for LengYue is largely **band-3** (KataGo engine settings,
Go-specific vocabulary). The separation is exactly the "what would
change for a Chess / education port?" question ADR-0003 poses: a port
authors a new schema *instance*; the framework and every projection
are reused unchanged. This is the strongest ADR-0003 alignment
available in the frontend, and it is what a general-education
expansion would lean on.

**Commitment discipline (per `knob-registry-plan.md` §8's worked
example of forward-compat-without-commitment).** Keep `ConfigNode`
open to additive fields; keep the projection functions pure in `S`.
Then the authoring surface (visual or DSL) can be added later as
*another projection* (an editor over `S`) without disturbing the
prior phases. Phase 4 (§9) is where this would land *if* the decision
is taken; phases 0–3 deliver standalone value regardless and are
forward-compatible with it by construction.

---

## 9. Roadmap

Five phases, each independently mergeable, ordered to keep the
persisted-blob blast radius near-zero until value is already banked.

### Phase 0 — schema types + the instance + the bijection test (no behaviour change)

- New band-1 lib (`src/lib/config-schema.ts`): `ConfigNode`,
  `WidgetDecl`, `Placement`, the validators. Keep it out of the
  already-oversized `types.ts` (2233 lines) and `knobs.ts` (802 lines,
  itself over the ADR-0007 budget).
- New band-3 instance (`src/config/schema.ts` or similar): a schema
  describing the **current** `AppSettings` / `UISession` / `cardSets`
  tree node-for-node — scalars as typed leaves; sum-typed and
  structural `session.ui` leaves as `opaque` / `internal` /
  `custom-editor` per §3.2 (`session.ui` is the harder root). No
  reshape.
- The **bijection test** (§10.6): every config leaf has exactly one
  schema node; every schema leaf resolves to a real config path of the
  asserted type. This is the equivariance guarantee (Law 2) in CI form
  and the ADR-0008 "surface the gap visibly" rule operationalised.
- **Deliverable:** a typed, tested *description* of today's config.
  Zero user-visible change. Zero migration.

### Phase 1 — the registry editor reads the schema

- Rewrite `RegistryEditor.vue` to render schema nodes. Delete
  `PATH_ENUMS` / `PATH_TOOLTIPS` / `isDynamicNode` / `getFieldType`
  (absorbed into nodes). Labels resolve through i18n `labelKey`
  (migrate registry-leaf and knob labels into the locale catalogs —
  additive locale-key changes, not a data migration). Unknown leaf →
  loud.
- ADR-0004: this is a full rewrite of a 361-line SFC; done under full
  visibility (we have it). The dedicated editors are untouched.
- **Deliverable:** the implicit schema becomes explicit; ADR-0002
  tightened at the editor; label convention unified.

### Phase 2 — projections generated from placement

- Generate the Settings sub-tabs / rolldowns from each node's
  `placement` + `order`, replacing `SettingsTab.vue`'s hand-wiring.
- **De-overlap:** the "Advanced Registry" projection renders only
  nodes not claimed by a `custom-editor` (or is retired in favour of
  generated sections). Symptom 1.3(c) closes.
- **Deliverable:** taxonomy = topology; the overlap is gone; Law 2
  holds across placement.

### Phase 3 — unify mutation + knob delegation (the equivariance guarantee in code)

- One canonical schema-validated mutator (§10.4); `knob-ref` leaves
  delegate to `writeKnobValue`. The seam test (§6, §10.6) and the
  Law-1 "shared write" test land here.
- **Deliverable:** Law 1 holds; the two fail-postures reconcile toward
  schema-authorised writes.

### Phase 4 — authorability (deferred; gated on a future decision)

- *If and only if* the author decides to pursue end-user/LLM
  authoring (§8): a visual schema designer and/or a schema DSL in the
  card-set JSON5+holes idiom, enabling user/LLM-authored taxonomies
  and domain ports. Prior phases are forward-compatible by
  construction; nothing here is committed by this note.

---

## 10. Fallout / blast radius (the extreme-diligence section)

### 10.1 Schema-first, not shape-change-first (the central de-risking)

The schema is **code that describes the existing tree** (§2). Adding
it requires **no data migration** — it moves and renames nothing. Only
a later, *optional* **reshape** of the config tree (e.g.
de-duplicating overlaps by physically relocating a branch) is a
persisted-blob concern. Phases 0–3 are therefore **migration-free**;
any reshape is deliberately kept *out* of them and, if ever pursued,
ships as its own append-only migration. This single separation —
"schema (code, no migration)" vs "config shape (persisted, migration)"
— is what bounds the fallout the refactor otherwise threatens.

### 10.2 Persistence + migrations

`SyncService` serialises the whole blob in `sendSync`
(`sync-service.ts:256-284`); the last-write-wins / single-tab contract
is the docstring just above (`sync-service.ts:233-247`); `migrate()`
walks it on hydrate at
`CURRENT_SCHEMA_VERSION = 55` (`migrations.ts:110`), append-only, with
a rolling two-active-migrations discipline and a 2297-line
`archived-migrations.ts`. Because phases 0–3 don't change blob shape,
this machinery is untouched. *If* a reshape is ever done: one new
append-only migration per reshape, frozen on ship, with the older
active migration aged into the archive in the same PR (the discipline
in `frontend/CLAUDE.md` and `migrations.ts:119-134`). Note the HMR
hazard (`migrations.ts:69-90`) for any schema-version work.

### 10.3 Label unification

Moving registry-leaf labels (raw keys) and knob labels (literal
English in `defaults.ts`) onto i18n `labelKey`s is **additive locale
content** in `src/locales/{en,ja,ko,zh-CN}.json` — not a data
migration. It can proceed incrementally; the bijection test can
tolerate a transition window where a node carries a literal fallback.

### 10.4 The write paths

Three write mechanisms reach config (§4.1). The refactor reconciles
the **configuration-projection** path: `updateRegistry`
(auto-vivify, `lib/utils.ts`) and `writeKnob` (strict,
`knobs.ts:94`) converge on one schema-validated mutator (§3.3) — known
leaf succeeds, `dynamicKeys`-authorised child succeeds, otherwise
throws. This tightens ADR-0002 and removes the silent-structure-growth
hazard. It does **not** police behavioural / command writes (§4.1
class 3), which stay direct assignments.

Two corrections to an earlier-too-broad framing:

- **`updateRegistry` is not editor-only.** `useDirtyBoardGuard.ts:92`
  (a composable) writes `navigation.actionOnDirtyBoard` through it.
  That call site travels with whatever replaces `updateRegistry` and
  is named here so it isn't missed.
- **`isDynamicNode`'s authorised set is smaller than it looks, and one
  entry is incidental.** The live dynamic-key namespaces are `symbols`,
  `state_fns`, `parameters` (all inside `analysis_env`) and
  `overrideSettings`. The fourth suffix, `bindings`
  (`RegistryEditor.vue:31`), matches **no** store key directly — at
  runtime `'keybindings'.endsWith('bindings')` is what it catches, so
  it incidentally grants add/remove-key affordances to the keybindings
  override map (a latent over-match the explicit `dynamicKeys` policy
  *fixes* by being declared rather than suffix-guessed). After Phase-2
  de-overlap `analysis_env` becomes a `custom-editor` and the registry
  stops recursing into it, so `symbols` / `state_fns` / `parameters`
  dynamic adds move entirely into PaletteEditor's `commit()` — leaving
  **`overrideSettings` as the only genuinely registry-rendered dynamic
  node.** The `dynamicKeys` policy thus has one live registry consumer
  post-de-overlap, a far smaller surface than the raw `isDynamicNode`
  list suggests.

### 10.5 Tests touching the surface

Existing: `tests/unit/lib/knobs.test.ts`,
`tests/unit/store/migrations.test.ts`,
`tests/integration/qeubo-knob-reconcile.test.ts`,
`tests/integration/qeubo-apply-bookmark.test.ts`,
`tests/unit/.../useUserIORegistry.test.ts`. The knob-reconcile and
bookmark suites pin the knob substrate's behaviour and must keep
passing through the `knob-ref` delegation.

### 10.6 New tests = the equivariance guarantee in CI

- **Bijection (Law 2):** every *statically-shaped* config leaf maps to
  exactly one schema node; every schema leaf-path resolves to a real
  leaf of the asserted type. Stated **modulo the dynamic-key carve-out**
  (§3.3, §10.4): a `dynamicKeys` node (e.g. `overrideSettings`)
  authorises its user-added children *en masse* rather than schematising
  each. `'opaque'` / `'internal'` leaves (§3.2) satisfy the bijection
  without a scalar widget. A new *statically-shaped* config leaf with no
  schema node fails CI.
- **No double-projection (Law 2):** no leaf is claimed by two sections
  / two projections (this is what closes symptom 1.3(c)).
- **Knob seam (§6):** every `KnobDecl` output path that is also a
  config leaf has exactly one `knob-ref` node.
- **Shared write (Law 1):** every *configuration projection* (§4.1
  class 1–2) that exposes a leaf reduces an edit to the same
  `write(path, v)`. Behavioural / command writes (class 3) are out of
  scope by construction.

### 10.7 ADR-0007 file sizes

`knobs.ts` is 802 lines (over the ≤300 state-machine budget);
`types.ts` 2233; `RegistryEditor.vue` 361 (over the ≤250 SFC budget).
Land the schema framework in *new* band-1 files rather than growing
`types.ts`/`knobs.ts`; the `RegistryEditor` rewrite *shrinks* as the
four tables are absorbed.

### 10.8 Gating / band coherence (the postmortem lesson)

`visibleWhen` / `enabledWhen` / `band` are declared **on the schema
node**, and the projection reads gating from the *schema*, not from a
DOM-ancestor's `v-if`. This structurally prevents the
toolbar-popover failure
(`postmortem-knob-toolbar-popover-2026-05.md`): a band-1 substrate
leaf cannot silently inherit an engine-connection gate from its mount
site, because its visibility is a declared property, not an
inheritance. The substitution test (that postmortem §7.5) calibrates
the discipline: the same "leaf silently mis-presented / unreachable"
shape applied to a critical leaf (the engine URL, a privacy toggle)
is severe — so the bijection + gating tests are calibrated to the
worst case, not to the observed cosmetic one.

### 10.9 Documentation-graph fallout (ADR-0005)

Deleting `PATH_ENUMS` (Phase 1) orphans author-facing comments that
tell contributors to "extend RegistryEditor's `PATH_ENUMS`" — at
`engine/katago/types.ts:27`, `engine/katago/winrate-framing.ts:64`,
and `types.ts:852,989,1180,1183,1205`. Each must be repointed at "add a
schema node / enum source" in the PR that removes the table, per
"documentation is part of the work." (The direct-assignment write
population is a *scoping* fact named in §4.1, not a migration target,
so it is not re-listed here.)

---

## 11. ADR alignment

- **ADR-0008 (the core motive).** Replaces fuzzy/closest-match
  presentation inference (`getFieldType` heuristics, path-suffix
  matching) with honest declared classification; the bijection test is
  the "surface the gap visibly" rule in CI form. Refusing the
  subsume-the-knob-registry shortcut (§6) is the positive-register
  rule (don't collapse distinct categories).
- **ADR-0002.** Loud on unknown leaf/path/widget; reconcile the
  auto-vivify-vs-throw split toward schema-authorised writes; the
  band-1 framework's failure contract mirrors `knobs.ts`.
- **ADR-0003.** Framework band-1, instance band-3; the port story
  (§8) is the principle's strongest application in the frontend.
- **ADR-0004.** Schema-first (describe the current tree) avoids blind
  reshapes; the `RegistryEditor` rewrite is done under full
  visibility.
- **ADR-0001.** The schema describes reactive containers; writes still
  flow through a named mutator; schema nodes are value objects
  (readonly).
- **ADR-0007.** New band-1 lib files rather than growing
  `types.ts`/`knobs.ts`; `RegistryEditor` shrinks.
- **ADR-0005 / "documentation is part of the work."** This note is the
  planning-time record; the maintenance contract (§13) governs its
  lifecycle. `FILES.md` gains the new lib + instance files when they
  land; `FEATURES.md` is unaffected until Phase 4 (no user-facing
  capability changes before then).

---

## 12. Open questions deferred to implementation time

1. **Section vocabulary.** The closed `SectionId` set and whether
   `'advanced'` survives Phase 2 or is fully replaced by generated
   sections. Settle when Phase 2 opens.
2. **`session.ui` vs `profile.settings` placement.** The schema spans
   both roots; whether the UI keeps the current "Session (UI)"
   separation or interleaves session and profile leaves by topic is a
   placement decision, not a structural one — defer to Phase 2.
3. **Gate vocabulary.** `GateRef` (engine-connected / authenticated /
   data-present / claim-state) — start from the four state-axes the
   toolbar-popover postmortem §7.4 enumerates; extend as needed.
4. **`cardSets` and `analysisTabs` as `custom-editor` vs first-class
   schema subtrees.** Both have their own editors and the cheap first
   cut is `custom-editor` for each — but they are *different shapes*:
   `analysisTabs` is an ordered array (`AnalysisTab[]`, `types.ts:119`)
   while `cardSets` is a string-keyed map (`Record<string, CardSet>`,
   `types.ts:1764`) — structurally a `dynamicKeys` node, not a list.
   Whether their *internal* structure should also be schema-described
   (enabling generated editors) is a Phase-4-adjacent question; if so,
   the array vs keyed-map distinction means they schematise differently
   (ordered children vs dynamic-keyed children).
5. **Path branding.** Whether to promote `ConfigPath` from
   `StorePath = string` (`types.ts:425`) to a `Path<GlobalStore>`
   literal-union — the same v2 deferral `knob-registry-plan.md` §14
   records for knob paths. Shared fate; decide once for both.

---

## 13. Maintenance contract

This is `design-note: planned`. When Phase 0 lands, the status line
transitions and Phase 0's PR + worklog are named here. When the arc
closes (through Phase 3, or closed-with-deferral on Phase 4's
optional authoring work), the status transitions to
`design-note: implemented` and the body becomes historical record.

If implementation reveals the design is wrong in a load-bearing way
(most likely candidate: the compose-vs-subsume fork in §6), file a
sibling `design-note: revised` per ADR-0005 Rule 8 rather than
silently editing this one — the worked example being
`knob-registry-plan.md`'s own relationship to its predecessor.

---

## 14. Cross-references

- `docs/archive/notes/design/knob-registry-plan.md` — the closest substrate and this
  note's structural template; the numeric slice this schema composes
  with via `knob-ref` (§6). Its §8 (declarative-vs-imperative design
  space) and §14 (deferred path-typing) are directly relevant.
- `docs/notes/postmortem/postmortem-knob-registry-qeubo-domain-2026-05.md` — the
  category-error the subsume fork would risk repeating (§6).
- `docs/notes/postmortem/postmortem-knob-toolbar-popover-2026-05.md` — the
  band/mount-site gating failure the declared `band` / `visibleWhen`
  fields prevent (§10.8); its §7.5 substitution test calibrates
  severity.
- `docs/archive/notes/dsl-hyperparameter-harness-plan.md` — the
  card-set JSON5+holes dialect that is the forward-compat DSL
  precedent (§7, §8).
- `docs/notes/consult/opus-consult-2026-05-30-config-schema-refactor.md` — the
  adversarial review of this note (citation audit + design stress);
  its findings are folded into §3.2, §4.1, §10.4, §10.6, §10.9, §12.4.
- ADR-0002, ADR-0003, ADR-0004, ADR-0007, ADR-0008 — the tenets §11
  maps.

---

## 15. License

Public Domain (The Unlicense).
