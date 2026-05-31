# Opus consult — adversarial review of `config-schema-projection-plan.md`

**Date:** 2026-05-30.
**Context:** Verbatim record of an Opus sub-agent's adversarial review
of the design note `docs/notes/config-schema-projection-plan.md`
(citation audit + design stress + missed-fallout + overclaim check).
Saved for auditability per standing practice (conversation context is
not durable across sessions). The note was revised in response; the
revisions land in §3.2 (sum-typed / `opaque` / `internal` leaves),
§4.1 (equivariance scope vs behavioural writes), §10.4 (write paths;
`bindings` correction; de-overlap), §10.6 (bijection carve-out),
§10.9 (doc-graph fallout), and §12.4 (`cardSets` is a keyed map).

---

## Verbatim review

> All type-line citations confirmed exactly. One more nuance: the note §2.4 (open question 4) calls `cardSets` and `analysisTabs` "both list-of-records." But `cardSets` is `Record<string, CardSet>` — a **keyed object**, not a list. `analysisTabs` is `AnalysisTab[]` — a genuine list. This is a minor mischaracterization in §12.4 ("Both are list-of-records"): cardSets is a keyed dict, analysisTabs is an array. They're both "collections of records" but only analysisTabs is a list/array. Minor imprecision. (Also relevant: a `Record<string, CardSet>` is exactly the `dynamicKeys` shape, while `AnalysisTab[]` is an ordered array — different enough that lumping them as "list-of-records" papers over a real shape distinction the schema would have to handle differently.)
>
> # Adversarial Review: `config-schema-projection-plan.md`
>
> I read the note end to end, then verified every `file:line` citation against source, read all five editor SFCs (Registry/Settings/AnalysisTabs/Palette/CardSet), the three store roots' types, `defaults.ts`, `migrations.ts`, `sync-service.ts`, `knobs.ts`, `engine/util.ts`, `en.json`, and grepped the consumer graph. The note is unusually careful and most citations are exact. The real problems are concentrated in §4/§10 (the equivariance claim's scope) and a handful of overclaims in §10.4/§12.4.
>
> ## 1. CITATION AUDIT
>
> Every citation the prompt flagged verified against source. RegistryEditor.vue isDynamicNode (:25-41), PATH_ENUMS (:63-90), PATH_TOOLTIPS (:112-155), getFieldType + `return value.length > 40 ? 'expression' : 'scalar'` (:161-168, verbatim line 167), `{{ key }}` (:240) — all CORRECT. engine/util.ts setDeep (:35-49) CORRECT semantically (note collapses the source's two-line `if (...) { current[key] = {}; }` into one line; faithful-but-reformatted, not verbatim). updateRegistry (:191) CORRECT. knobs.ts writeKnob (:122-128, verbatim), validateRegistry (:338), failure contract (:21-40), claim machine (:535-802, :786-802, :94) — all CORRECT. types.ts AnalysisTab (:119), StorePath (:425), KnobDecl (:582), AppSettings (:879), UISession (:1330), Hole (:1682), Holed (:1693), HyperparamDecl (:1708-1729), CardSet (:1739), ProfileState (:1759) — ALL CORRECT. defaults.ts knob decls (:350-477), ownershipOpacityCeiling (:316), label (:358), knob id (:364), output path (:369), analysisTabs seed (:491), seed deck take-stage (:517) + hyperparam decl (:521) — ALL CORRECT verbatim. migrations.ts CURRENT_SCHEMA_VERSION=55 (:110), 54→55 (:179-194), migrate() (:203-227), rolling-archive (:119-134), HMR (:69-90) — CORRECT. SettingsTab.vue bindings (:98/122/137/142) — ALL CORRECT. en.json (:35) — verbatim.
>
> **Two citation imprecisions (not wrong, but loose):**
> - **§1.2:** "serialises the whole blob on a single debounce (`sync-service.ts:186-215`)." Lines 186-215 are `startWatcher` + `scheduleSync`. The *serialise* step is `buildPersistencePayload()` inside `sendSync` at **256-284**. wrong-line for the "serialise" clause.
> - **§10.2:** "`sync-service.ts:256-284`, last-write-wins, single-tab." The last-write-wins / single-tab *contract prose* is the docstring at **233-247**, just above. Minor.
>
> **One transcription-vs-reality mismatch (feeds §2):**
> - **§10.4** asserts the dynamic-key adds "`symbols`, `state_fns`, `bindings`, `parameters`, `overrideSettings`" are all "legitimate dynamic-key adds." The list is transcribed correctly, **but `bindings` corresponds to no key in the live store**. What `pathStr.endsWith('bindings')` actually matches at runtime is **`keybindings`** (`'keybindings'.endsWith('bindings') === true`), i.e. it silently grants add/remove-key affordances to the keybindings override map (plausibly a latent bug). overclaim in §10.4.
>
> ## 2. DESIGN STRESS
>
> **"Schema-first ⇒ zero data migration" (§2, §10.1): essentially TRUE.** Checked the awkward leaves — `palettes` (array of records), `overrideSettings`/`symbols`/`parameters`/`state_fns` (dynamic-key dicts), `cardTreeNav` (`Partial<Record<BoardId,…>>`), `forestNav.selection` (discriminated `NavSelection | null`). None forces a shape change because the note routes array/dynamic-dict cases through `custom-editor` or `dynamicKeys`. The zero-migration claim holds.
>
> **The list-of-records routing sweeps two real things under the rug:**
> 1. **`custom-editor` for analysis_env resolves symptom 1.3(c) by amputation.** Once analysis_env becomes a `custom-editor` node (Phase 2), the registry stops recursing into it, so `symbols`/`state_fns`/`parameters` dynamic-key adds stop happening through the registry entirely — they only ever happen in PaletteEditor's `commit()` (PaletteEditor.vue:62-69, 281-299). The §10.4 anxiety about preserving those three is largely moot post-de-overlap. Only `overrideSettings` genuinely remains a registry-rendered dynamic node.
> 2. **`forestNav.selection: NavSelection | null`** (types.ts:1510-1512) is a *discriminated union* (`{kind:'game',gameSourceId} | {kind:'root',rootCardId} | null`). The §3 `WidgetDecl` vocabulary has no variant for a sum-typed leaf. It would have to be force-fit into `custom-editor` or left out — and today the Session-UI RegistryEditor renders it as a raw recursive object. §10.6's bijection test ("every config leaf has exactly one schema node of the asserted type") would trip on it. The note's claim that the schema describes the tree "leaf-for-leaf" (Phase 0, §9) is **overstated** for `session.ui` until sum-typed leaves get a story.
>
> **The equivariance formalism (§4): the two laws are sound but the SCOPE is silently narrowed to "the editors," which is the note's most serious substantive flaw.** Law 1 says "*every* projection that exposes ℓ interprets an edit to the same canonical mutation." The config surface has a **third write mechanism the note never accounts for: direct reactive assignment.** Dozens of sites mutate `session.ui` fields outside any mutator: `App.vue:373/388/391/394` (`store.session.ui.sidebarExpanded = !…`), `useReviewSession.ts:294/295/564/636` (`showMoveSuggestions`/`treeExpanded`), `keybindings.ts:217/228` (`showMoveSuggestions`/`showStoneMoveNumbers` toggles), `useQeubo.ts:422`, `useResizablePanel.ts:64`, `StatusBar.vue:102`, `ForestDirectory.vue:239`, `SettingsTab.vue:114`. These are "projections that expose ℓ" by any honest reading, and none reduces to `write(path, v)`. The note frames Law 1's failure today as "two mutators" and Phase 3 as reconciling those two. It is silent on the far larger population of direct assignments. Either (a) Phase 3's "everything else throws" leaves these untouched — in which case "everything else throws" is false advertising — or (b) all ~25 sites must migrate, an unscoped blast radius §10 never lists. **This is the gap most likely to bite implementation.** (`useDirtyBoardGuard.ts:92`, which writes `navigation.actionOnDirtyBoard` through `updateRegistry` from a *composable*, is a fourth case: a non-editor caller of the very mutator the note treats as editor-only.)
>
> **The compose-vs-subsume fork (§6): "compose" is correct, and the note does NOT dismiss subsume too easily.** The four rationales are sound (claims knob-specific; compose needs zero migration; ADR-0008 category separation; honest 1:K cardinality via `writeOutputs` at knobs.ts:786-802). Steelmanning subsume: `KnobDecl.label?`/`transform?` are already optional so a "thin" knob is expressible — but subsume forces every leaf to carry the claim machine's surface and forces a persisted-representation migration. The note weighs this correctly and records the revisit-trigger. Solid.
>
> ## 3. MISSED FALLOUT
>
> - **The direct-assignment write population is the headline omission** (enumerated above).
> - **The Session-UI RegistryEditor mount (`SettingsTab.vue:129`, on `store.session.ui`) is under-analyzed.** It's where the un-schematizable leaves live (`forestNav.selection` sum type; `cardTreeNav` per-BoardId dict; `overlayLayers` nested object). Phase 1 ("unknown leaf → loud") will immediately hit leaves with no clean widget unless pre-handled. session.ui is the harder root.
> - **PATH_ENUMS has no runtime readers outside RegistryEditor** (good — Phase-1 deletion is safe), **but it has documentation back-references** in `engine/katago/types.ts:27`, `winrate-framing.ts:64`, and `types.ts:852/989/1180/1183/1205` ("extend RegistryEditor's PATH_ENUMS"). Deleting it orphans those comments. Per "documentation is part of the work," belongs in the fallout list.
> - **`writeKnob` writes into `session.ui` paths too** (`defaults.ts:361` `session.ui.moveFilterThreshold`, `:423` `session.ui.pvAnimation.fadeDurationMs`). So `session.ui` is written by all three mechanisms. The §5 worked example only exercises a `profile.settings` path, never the harder cross-root cross-mechanism case.
> - **No labels-move-to-i18n consumer breakage found** — labels are display-only. The note's "additive locale content, not a migration" is correct.
>
> ## 4. OVERCLAIM / FIDELITY CHECK (the three unread SFCs)
>
> Read all three end to end. Characterizations are **FAIR, occasionally generous-but-defensible:**
> - **AnalysisTabsEditor.vue — FAIR.** Exactly the controlled "layout-as-data" editor described: add/rename/reorder/delete tabs + assign panels, emitting `update({ path: ['analysisTabs'], value })` (line 31). Its header says "relocating it is a one-line change at the mount site" — directly substantiates the §3.2 `custom-editor` claim.
> - **PaletteEditor.vue — FAIR.** Master-detail over `symbols` (CodeMirror asteval), `parameters` (qEUBO meta), `palettes`, emitting wholesale `update({ path: ['engine','katago','analysis_env'], value })` (line 50). **One thing the note misses:** PaletteEditor consults the knob claim machinery (`currentClaim`, `onClaimChange`, lines 99-110, 141-146) and refuses manual parameter writes under a hard claim. So even within a single `custom-editor`, "one canonical write" is already entangled with the knob substrate.
> - **CardSetEditor.vue — FAIR, JSON5+holes characterization if anything understated.** Free-form JSON5+`$param`-holes CodeMirror surface backed by `parse`/`validate` from `dsl-harness.ts`, plus a `HyperparameterPanel`, emitting `update({ path: ['cardSets'], value })`.
>
> **One real mischaracterization:** §12.4 calls cardSets and analysisTabs "Both list-of-records." `analysisTabs` is `AnalysisTab[]` (list); `cardSets` is `Record<string, CardSet>` (types.ts:1764) — a keyed dict, structurally a `dynamicKeys` node.
>
> ### Bottom line
> Citation-clean to a rare degree (≈40 anchors, all landing; only loose ones are two composite line-ranges in §1.2/§10.2 and the formatting-compressed setDeep quote). Compose-vs-subsume reasoning sound. The **load-bearing weakness is the equivariance scope**: §4's Law 1 and §10.4's "everything else throws" are written as if `updateRegistry` and `writeKnob` are the only writers, but the dominant write mechanism for `session.ui` is **direct reactive assignment from ~25 non-editor sites**, plus a composable caller of `updateRegistry` and the PaletteEditor↔claim coupling. Secondary: §3.2 widget vocabulary cannot classify the sum-typed `forestNav.selection`; §10.6 bijection omits the dynamic-key carve-out its own §3/§10.4 require; the §10.4 `bindings` namespace doesn't exist (incidentally matches `keybindings`); §12.4 miscalls the keyed `cardSets` dict a "list."

---

## License

Public Domain (The Unlicense).
