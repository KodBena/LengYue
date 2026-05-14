# Knob registry — substrate, editor, qEUBO consumer, Phase-6 sweep

- **Status:** Shipped 2026-05-14 via PR #223
  (`KodBena/feat/knob-registry`, 14 commits, +4,897 / −128 across
  25 files). Full frontend suite green at 472 / 3 / 0 (passed /
  skipped / xfailed) at branch tip.
- **Genre:** Feature — closes the planned multi-phase arc in
  `docs/notes/knob-registry-plan.md`. Phase 4 (vector widget
  dispatch) closed unilaterally on author judgment; Phase 6
  (magic-literals promotion sweep) is partial and remains
  open-ended for further candidate-by-candidate promotions.
  Plan-note status transitions to `design-note: implemented` per
  §17 in the same closure pass.
- **Date:** 2026-05-14.

## Context

The originating riddle was the user's observation that
`BoardWidget.vue::ownershipColor`'s `0.55` opacity ceiling was a
preference, not an invariant — and the architectural reaction was
not "promote that one scalar to a registry leaf" but "if it's a
preference, where is the substrate that catalogues every
preference in the system?" The TODO entry "Unified
user-controllable-scalar surface" had been carrying this question
since the v1.1.0 cycle, paired with the predecessor
`qeubo-namespace-unification-plan.md` whose body articulated the
KnobDecl data shape under a qEUBO-driven framing.

The 2026-05-14 session reframed the question substrate-first:
**the registry is the SSOT for "which values in the system are
controllable, where they live, what range they admit, what
semantic identity they carry"**, with qEUBO as one of several
peer consumers (the SPA UI's slider chrome, autonomous-SR
scenarios, test harnesses). The substrate works regardless of
whether qEUBO is enabled; the editor surfaces it; consumers
claim against it.

The plan committed to **infrastructure-first** sequencing per
the user's explicit decision (recorded in plan §11): land the
substrate before any consumer-side code reaches a settled shape,
trading the delayed gratification on the originating riddle
(opacity ceiling slider doesn't ship until Phase 3) for the
type-sanity, migration-coherence, audit-trail-visibility, and
build-it-back-the-right-way wins the substrate-first path
delivers.

## What changed

The arc landed as 14 commits on `KodBena/feat/knob-registry`,
phased per the plan §11. The phased commit log mirrors the
delivery:

### Phase 1 — Substrate primitives (commit `ab82c66`)

Types and pure logic. No UI, no consumer migrations:

- `src/types.ts` — `KnobId` (branded), `KnobDecl`, `KnobRegistry`
  (= `Record<string, KnobDecl>`), `KnobTransform` (discriminated
  union over `identity` | `linear` | `lockstep-hue-rotate` |
  `fixed-luminance-arc` with per-kind parameters), closed
  `KnobWidget` enum, `KnobDomain`, `KnobInputDecl`,
  `KnobOutputDecl`, `StorePath`, `ConsumerClaim`, `ClaimPolicy`.
- `src/lib/knobs.ts` (new, band 1) — `readKnob` / `writeKnob`
  with ADR-0002-loud failure surfaces (missing intermediates,
  type-mismatched leaves, non-finite writes, undeclared-parent
  refusal), `applyTransform` with exhaustive dispatch and
  per-transform dimension checks, `validateRegistry` for
  startup-time coherence.
- `AppSettings.knobs: KnobRegistry` field added; defaults seed
  `{}`. Migration 35 → 36 backfills.
- 40 unit tests across `tests/unit/lib/knobs.test.ts` covering
  every failure surface plus Vue reactivity round-trip.

### Phase 2 — Ownership state machine (commit `72749de`)

Adds the claim machinery + policy-aware write entry point per
plan §7:

- `ClaimResult`, `ReleaseResult`, `WriteContext`, `WriteResult`,
  `ClaimChangeEvent`, `ClaimChangeListener`, `UnsubscribeFn` —
  discriminated by `kind` for exhaustive call-site dispatch.
- Module-scope claim Map + listener registry in
  `src/lib/knobs.ts`. First-come-first-served arbitration;
  duplicate-listener registration refused; snapshot-on-emit so
  self-unsubscribing listeners stay safe.
- `writeKnobValue` covers the 8-cell policy matrix (claim policy
  × writer kind) returning structured `WriteResult` rather than
  throwing. Soft-release-on-manual-write fires the standard
  claim-change event so holders can react.
- 26 unit tests covering the lifecycle, listener behaviour, and
  full policy dispatch matrix.

### Phase 3a — Substrate prep (commit `9caf77b`)

The first user-visible promotion batch — substrate-populated but
no new UI yet. Two new leaves and four motivating KnobDecls:

| Lifted leaf | KnobDecl id | Was |
|---|---|---|
| `appearance.ownershipOpacityCeiling` (0.55) | `display.ownership-opacity-ceiling` | inline `0.55` in `BoardWidget.vue::ownershipColor` |
| `engine.katago.watchdogAnimationMs` (500) | `engine.watchdog-animation-ms` | hardcoded 500ms keyframe in `Toolbar.vue` |
| `appearance.intensityHueShift` (already existed) | `display.hue-offset` | direct-v-model slider in App.vue Other tab |
| `session.ui.moveFilterThreshold` (already existed) | `display.move-filter-threshold` | direct-v-model slider in AnalysisControls |

`BoardWidget.vue` reads the new leaf; `Toolbar.vue` binds the
keyframe duration to a CSS custom property sourced from the
leaf. Migration 36 → 37 backfills both leaves and seeds the four
decls. Rolling-archive applied (33 → 34 to archive). 11 new
migration tests.

### Phase 3b — Editor surface (commit `004c49c`)

The originating riddle's user-visible deliverable:

- `src/components/knobs/KnobSlider.vue` (new) — the unified
  scalar widget. Reads via `readKnob`, writes via
  `writeKnobValue` with manual context, disabled state from
  `currentClaim`. Step / display precision derived from range
  span.
- `src/components/KnobRegistryEditor.vue` (new) — cross-domain
  editor; groups every scalar KnobDecl by domain, renders one
  KnobSlider per knob. Vector knobs deliberately filtered out
  per the plan §6 widget dispatch policy.
- Mounted in App.vue Other tab as a new section above Gradient
  Calibration. i18n keys across all four locales (en / ja /
  ko / zh-CN) for section header, empty-state, and domain
  labels.
- `validateRegistry` wired in `useAppBootstrap` as a deep
  watcher on `profile.settings.knobs` with `immediate: true`.
  Failures console.error'd loudly per ADR-0002 but don't throw —
  a malformed decl shouldn't take down the boot path.

### Phase 5 — qEUBO consumer migration (commit `a1dbe76`)

The predecessor plan's body becomes implementable here. `useQeubo`
becomes substrate-aware:

- `startNewExperiment` acquires hard claims on every controlled
  param BEFORE the backend call (atomic rollback on conflict so
  the substrate doesn't carry partial-acquire state).
- `abortExperiment` + `reset` release all claims.
- `bootstrap` re-claims based on `parameter_meta.qeubo_controlled`
  when an existing experiment is rediscovered after page reload
  (the claim map is in-memory only; rehydrate restores the
  substrate's view).
- `applyEffective` routes per-key writes through `writeKnobValue`
  with consumer context.
- Migration 37 → 38 seeds a `qeubo.<name>` KnobDecl for every
  `parameter_meta` entry with a valid range. `qeuboControlled`
  mirrors the param-meta flag verbatim.
- 11 new migration tests.

### Phase 6 (initial) — PaletteEditor leak closed (commit `d4eb9ac`)

The first Phase-6 candidate: PaletteEditor's Analysis Environment
value input previously edited `parameters[name]` directly,
bypassing the substrate's claim enforcement. `updateParameterValue`
gains a `currentClaim` guard; the input renders `:disabled` on
hard claim with the holder's tooltip. New i18n keys
(`palette.systemMessage.parameterLocked`,
`palette.tooltip.parameterLocked`) across all four locales.

### Phase 6 followup — Reactive reconcile (commit `3c8e59c`)

User-surfaced bug: setting a range on the default `alpha`
parameter via PaletteEditor didn't make the knob appear in the
KnobRegistryEditor. Root cause: the Phase 5 migration only
seeded `qeubo.*` KnobDecls at hydrate time; no reactive sync
existed for mid-session parameter_meta edits.

Fix: `reconcileQeuboKnobs` in `useQeubo.ts` — adds / updates /
removes `qeubo.*` decls based on `parameter_meta`. Watched by
`useAppBootstrap` with `immediate: true` + `deep: true`.
Claim-held decls survive even when their range goes invalid
(via `currentClaim` SSOT check). 12 integration tests.

### Postmortem + remediation — `domain: 'qeubo'` category error

Commits `96def23` (postmortem) and `2bf7e84` (remediation).
First user-facing exercise of the post-Phase-5 editor showed
analysis-env palette parameters under a "qEUBO" section header,
despite the parameters conceptually belonging to the palette
subsystem with qEUBO being one consumer.

Root cause at the spec level: `KnobDomain` enum conflated UX
taxonomy (where the knob lives in the user's mental model) with
claim-API consumer identity. The same `'qeubo'` string appears
in `ConsumerClaim.consumerId` per plan §7; embedding it in the
domain enum collapsed the substrate-vs-consumer split plan §2
was shaped around.

Remediation: drop `'qeubo'` from `KnobDomain`; add `'palette'`.
Migration 38 → 39 rewrites every `qeubo.*` decl's domain
idempotently. Code-site updates in `useQeubo` (the migration in
`migrations.ts:265` is frozen per append-only; the walker
reaches the corrected state at 38 → 39). i18n catalogs updated.
Plan note carries a "design-note: revised"-shaped amendment per
ADR-0005 Rule 8.

Postmortem at
`docs/notes/postmortem-knob-registry-qeubo-domain-2026-05.md`
captures both author and implementer assessments (the spec was
poorly worded + poorly audited; the implementer's
closest-match enum selection should have flagged the missing
category at Phase 5 implementation time but didn't).

### Phase 6 sweep — three preference thresholds (commit `51ead8a`)

Three preference-flavoured literals promoted with strong pairing
rationale to already-promoted siblings:

| Lifted leaf | KnobDecl id | Was | Pairs with |
|---|---|---|---|
| `appearance.ownershipDeadbandThreshold` (0.05) | `display.ownership-deadband-threshold` | inline `0.05` in `BoardWidget.vue::ownershipColor` | sibling overlay knob |
| `appearance.livenessThreshold` (0.3) | `display.liveness-threshold` | `LIVENESS_THRESHOLD = 0.3` const in `BoardWidget.vue` | sibling overlay knob |
| `engine.katago.watchdogLatencyThresholdMs` (500) | `engine.watchdog-latency-threshold-ms` | `WATCHDOG_LATENCY_THRESHOLD_MS = 500` const in `Toolbar.vue` | sibling watchdog knob |

Migration 39 → 40. Consumer retargets in `BoardWidget.vue`
(both functions) and `Toolbar.vue`. Rolling-archive applied.

### applyBookmark substrate-routed (commit `a7d337b`)

Closes the last write path that bypassed the substrate. The
prior `applyBookmark` whole-record-reseat would clobber a held
qEUBO claim. New shape: atomically refuse when any bookmarked
param maps to a hard-claimed knob (partial apply would leave
the bookmark's joint intent half-realised); otherwise per-key
write through `writeKnobValue` with manual context; preserve
the prior delete-extras semantic. 6 new integration tests.

### Dedup + i18n labels (commits `c1cb50d`, `e2dc981`)

End-of-arc cleanups:

- **AnalysisControls move-filter slider** replaced with a
  relocation notice ("Moved to Other tab → Knob Registry; a
  toolbar quick-access surface will replace both eventually").
  Value badge preserved so the current threshold reads at a
  glance without switching tabs.
- **Gradient Calibration hue-offset slider** removed; the
  `ColorDebugStrip` preview stays (it's the calibration view
  the slider feeds). Hint points at the registry above.
- **KnobDecl labels through i18n.** Same hint-or-derive
  pattern `KnobRegistryEditor.vue::domainLabel` already used:
  `knobRegistry.label.<knobId>` translated string wins;
  fallback to seeded `decl.label`; final fallback `decl.id`.
  Runtime-added `qeubo.<name>` decls skip the catalog hit
  naturally. Seven labels translated per locale. Disabled-state
  tooltip (`knobRegistry.lockedTooltip`) also brought into
  i18n.

### Plan-note closure amendment (commit `65ec83c`)

Two end-of-arc amendments per ADR-0005 Rule 8 sibling-revision
discipline:

- **Phase 4 closed on author judgment.** The vector widget
  dispatch arc had a §4 / §6 type-vs-dispatch contradiction
  (lockstep-hue-rotate declared scalar-driven N=1 but
  dispatched on `inputs.length === 2`) without a concrete
  motivating user need. Closure reclaims scope; the substrate's
  vector-knob capability is preserved by the type system
  regardless, so re-opening Phase 4 stays available without
  prejudice.
- **Phase 6 partial-sweep status.** The first batch landed;
  the sweep's stated deliverable ("every literal outside
  substrate-named SSOTs is either a controllable knob OR
  carries a `magic-literal:` justification comment") is
  explicitly NOT closed by this batch — the bulk of the audit
  inventory's residue (theme-scale anchors, geometry
  multipliers, timer constants) sits outside the knob-registry
  substrate by design.

## End-state surfaces

After the merge, the substrate is end-to-end enforcing across
every write path that can mutate a controlled value:

- **`KnobRegistryEditor`** (Phase 3b) — slider widgets disable
  on hard claim; auto-release on manual write against soft
  claim.
- **`PaletteEditor`** (leak fix) — Analysis Environment value
  input refuses on hard claim with system message + disabled
  state.
- **`useQeubo.applyEffective`** (Phase 5) — writes via
  `writeKnobValue` with consumer context.
- **`useQeubo.applyBookmark`** (`a7d337b`) — atomic conflict
  refusal; substrate-routed writes when safe.

The Other tab's Knob Registry section lists seven sliders today
(four under "Display", one each under "Engine", with palette-
domain entries appearing dynamically as users configure qEUBO
control via PaletteEditor).

## What's deferred

Explicitly out of scope, each named in the relevant commit
message + the plan note's closure amendment:

- **Toolbar-hover quick-access surface** — author's eventual
  UX vision for low-friction slider access. The AnalysisControls
  + Gradient Calibration relocation notices point at this as
  the long-term home; current state is transitional.
- **Bookmark schema reshape** (`Record<string, number>` →
  `Record<KnobId, number[]>`) — Phase 5 deferred. The flat-
  shape bookmark schema continues working.
- **Wire-key derivation from KnobDecl ids** — Phase 5 deferred.
  `qeubo-service.ts` still sends raw param names; the backend's
  encode/decode is unaffected.
- **Phase 4 (vector widget dispatch)** — closed unilaterally;
  re-open with prejudice-free if a concrete vector-knob need
  surfaces.
- **Phase 6 open-ended sweep** — further preference-flavoured
  candidates can land in their own commits when they surface
  during normal work.

## Lessons

The arc surfaced two distinct discipline gaps worth recording:

### Spec authoring (from the postmortem §7)

**Articulate what an enum is *for* before listing its members.**
`KnobDomain` shipped without §3 saying "categorises by where the
knob lives in the user's mental model; consumer identity belongs
elsewhere." Without that anchor, reviewers can't tell whether
`'qeubo'` is in or out of bounds — it just looks like another
value. Specs ship with caveats: name them, don't carry them
silently.

**When two concepts are explicitly named as separate, audit
every enum and field for cross-contamination before declaring
the spec stable.** The plan §2's substrate-vs-consumer split was
authored two paragraphs above the contradictory §3 enum; the
contradiction was visible at the document level.

### Implementation discipline (from the postmortem §7)

**Closest-match in an enum that doesn't have a true match is
itself a signal.** When Phase 5 needed a domain for analysis-env
parameters and `'qeubo'` was the closest fit, the honest move
was "the enum is wrong for this case; revise it before
committing." Taking the closest match is the literal-spec-
following failure mode that ADR-0002's loud-failure discipline
forbids in other contexts (sentinel-instead-of-throw, partial-
document-read citations). It applies equally to enum-value
selection.

**Re-inspect editor surfaces visually after each substantive
phase, not just after the final phase.** The "sliders work"
smoke test after Phase 3b was insufficient once Phase 5 added
entries; the visual check should re-run on every commit that
adds seeded data. Component / template tests are explicitly out
of scope per `tests/CLAUDE.md`, which means this class of
bug — "the labels are wrong in a way the typechecker can't
catch" — has no automated guard. Visual re-inspection
phase-by-phase is the discipline that covers the gap until / if
the test posture changes.

### Documentation discipline (this housekeeping pass)

The implementer (LLM collaborator) filed the PR without doing
the post-merge housekeeping audit the umbrella `CLAUDE.md`
explicitly requires *before* PR-filing. The user surfaced this
gap with the simple question "Have you filed the appropriate
housekeeping documentation, if any?" — answered honestly: no.
This worklog entry, the TODO closure, the handoff-current.md
update, the FEATURES.md entry, and the plan-note status
transition are the corrective.

The umbrella's "Documentation is part of the work" section is
the load-bearing tenet — implementation is incomplete until the
documentation graph reflects it. Adding the audit as a
pre-PR-filing checklist item in future arcs would harden the
discipline.

## Cross-references

- `docs/notes/knob-registry-plan.md` — the spec; status
  transitions to `design-note: implemented` in the same closure
  pass that files this worklog.
- `docs/notes/postmortem-knob-registry-qeubo-domain-2026-05.md`
  — the RCA for the category error.
- `docs/archive/notes/qeubo-namespace-unification-plan.md` —
  the predecessor design note (already at
  `design-note: revised`).
- `docs/archive/notes/magic-literals-audit-inventory.md` — the
  audit that catalogued the inventory the Phase-6 sweep drew
  candidates from.

## License

Public Domain (The Unlicense).
