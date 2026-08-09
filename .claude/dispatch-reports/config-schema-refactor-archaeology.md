# Archaeology — the config-schema refactor: what happened, where it stopped

Read-only scout report per commission (ledger rows 1314/1315), directed at the question
raised in commissioner answer row 1299: is today's M2 finding (11 facts with 2-4 editable
homes) the unfinished config-schema refactor's residue?

---

## (a) What the consult / plan prescribed

Two documents, read in full:

- `docs/notes/design/config-schema-projection-plan.md` (904 lines, 2026-05-30, `design-note: planned`) —
  the actual plan.
- `docs/notes/consult/opus-consult-2026-05-30-config-schema-refactor.md` — an adversarial
  Opus review of the plan. It found the plan's citations "citation-clean to a rare degree"
  and its main load-bearing weakness in the equivariance *scope* (§4's Law 1 silently
  narrowed to "the editors," missing ~25 direct-reactive-assignment write sites). The
  plan's current text (§3.2, §4.1, §10.4, §10.6, §10.9, §12.4) already folds the review's
  findings in — it is the *revised* plan, not a separate pending-fix document.

**The prescribed problem** (§1): the settings UI is the one configurable surface in the
SPA that is *not* data-declarative. Presentation knowledge for each config leaf is
scattered across `RegistryEditor.vue`'s four hard-coded tables (`isDynamicNode`,
`PATH_ENUMS`, `PATH_TOOLTIPS`, `getFieldType`), and — the fact directly relevant to
M2 — **"the projections overlap instead of partitioning"** (§1.3(c), verbatim):

> The "Advanced Registry" rolldown renders the *entire* `store.profile.settings`
> (`SettingsTab.vue:122`), which **includes** branches that *also* have dedicated
> editors elsewhere in the same tab: `analysis_env` (PaletteEditor), `analysisTabs`
> (AnalysisTabsEditor), and `keybindings` (KeybindingsView). ... Nothing declares
> which projection owns a given leaf.

**The prescribed cure**: one declarative `ConfigNode` schema `S` (§3) as SSOT for each
leaf's structure/presentation/grouping/gating; every projection (registry editor,
generated Settings sections, knob editor, toolbar popover) becomes a pure function of
`S`; two equivariance laws (§4) — Law 1 "every projection of a leaf shares one canonical
`write(path,v)`," Law 2 "a schema change propagates to all projections with no
per-projection bookkeeping."

**Five phases (§9), each independently mergeable, each with an explicit completion
criterion:**

| Phase | Prescribed deliverable (verbatim criterion) |
|---|---|
| **P0** | New band-1 lib `src/lib/config-schema.ts` (`ConfigNode`/`WidgetDecl`/`Placement`/validators) + new band-3 instance `src/config/schema.ts` describing the *current* tree node-for-node + **the bijection test** (§10.6: every config leaf ↔ exactly one schema node). "Deliverable: a typed, tested *description* of today's config. Zero user-visible change. Zero migration." |
| **P1** | Rewrite `RegistryEditor.vue` to render schema nodes; delete `PATH_ENUMS`/`PATH_TOOLTIPS`/`isDynamicNode`/`getFieldType`; labels via i18n `labelKey`; unknown leaf → loud. "Deliverable: the implicit schema becomes explicit." |
| **P2** | Generate Settings sub-tabs/rolldowns from each node's `placement`+`order`, replacing `SettingsTab.vue`'s hand-wiring. **"De-overlap: the Advanced Registry projection renders only nodes not claimed by a `custom-editor`... Symptom 1.3(c) closes."** — this is the phase that directly targets M2-shaped duplication. |
| **P3** | One canonical schema-validated mutator; `knob-ref` leaves delegate to `writeKnobValue`; Law-1 "shared write" test lands. "Deliverable: Law 1 holds." |
| **P4** | *Deferred, gated on a future decision* — end-user/LLM authorability (visual schema designer / DSL). Explicitly "nothing here is committed by this note." |

Maintenance contract (§13): status transitions from `design-note: planned` to
`design-note: implemented` "when the arc closes (through Phase 3, or closed-with-deferral
on Phase 4's optional authoring work)."

---

## (b) Per-stage execution status — WITNESSED evidence

| Phase | Status | Evidence |
|---|---|---|
| P0 (schema types + instance + bijection test) | **UNEXERCISED — no trace found** | WITNESSED: `find . -iname '*config-schema*'` (excluding `node_modules`, which only turns up unrelated `eslint`/`redocly` config-schema files) returns only the two doc files themselves. No `src/lib/config-schema.ts`, no `src/config/schema.ts`. `grep -rn "ConfigNode\|ConfigLeaf\|ConfigGroup\|WidgetDecl"` across the frontend tree: zero source hits. |
| P1 (RegistryEditor reads schema) | **UNEXERCISED — not started; file unchanged in kind** | WITNESSED: `frontend/src/components/editors/RegistryEditor.vue` is 421 lines today and *still contains* `isDynamicNode` (:39), `PATH_ENUMS` (:92), `PATH_TOOLTIPS` (:144), `getFieldType` (:199) — the exact four tables P1 was scoped to delete. `git log` on the file since the plan's date shows only cosmetic changes (`ddf014b1 feat(frontend): collapsible headings in Advanced Registry, knobs/analysis_env default-collapsed`, 2026-06-xx) — an incremental UI tweak layered on the un-refactored file, not the prescribed rewrite. |
| P2 (generated sections; de-overlap) | **UNEXERCISED — not started; hand-wiring continued and grew** | WITNESSED: `SettingsTab.vue` still exists and is still hand-wired (`b0b1fd3d refactor(frontend): Settings General-tab accordion → per-section sub-tabs` — a *hand-authored* re-tabbing, exactly the kind of edit P2 was meant to make unnecessary by generating sections from `placement`). The de-overlap symptom 1.3(c) names is **not closed**: the Advanced Registry still renders everything, dedicated editors still exist alongside it. |
| P3 (unified mutator + knob delegation) | **UNEXERCISED — no trace found** | WITNESSED: no canonical schema-validated mutator exists; `grep` for its described shape and for `knob-ref` widget delegation returns nothing outside the doc text. `updateRegistry` (auto-vivify) and `writeKnob` (throws) remain the two live, un-reconciled write paths the plan diagnosed. |
| P4 (authorability) | **Correctly UNEXERCISED by design** | The plan itself gates P4 on "a future decision" never taken; not a gap, a deliberate non-start. |

**Ledger corroboration (autoharn era, since 2026-08-06):** `./autoharn led --recent 20000`
surfaces the item only in the *investigation/adjudication* thread that produced this
dispatch (rows 1244, 1247, 1262, 1281, 1282, 1299, 1315) — the menus-UI audit's M1/M2
findings and the commissioner's deferral. **No row anywhere in the ledger records any P0–P3
implementation work landing.** The refactor has zero footprint in the autoharn era beyond
being *discussed*.

**Bottom line: none of Phases 0–3 demonstrably landed.** The design note's own
`design-note: planned` status line was never updated (there is no `design-note: implemented`
anywhere in the doc, and no sibling `design-note: revised` per §13's stated escape hatch
for a load-bearing design change).

---

## (c) The todo DB's testimony — verbatim, STALE (commissioner fiat)

> **COMMISSIONER FIAT, carried verbatim:** the todo db is STALE; anything mandate-like in
> it is NO LONGER A MANDATE. Everything below is a historical fact for adjudication, not a
> standing obligation.

**DB shape:** Postgres `todo` @ 192.168.122.1, 6 tables (`items`, `deps`, `labels`, `refs`,
`meta`, `audit_log`). 170 items total: 74 open / 96 closed. Of the 74 open, 25 are
`disposition=active`, 49 `disposition=future`. `audit_log` spans **2026-06-11 03:20 →
2026-06-23 01:55** (889 rows) — i.e., the DB's own change history is a two-week window
right after the migration from `docs/work-status.json`; nothing has touched *this* item
since.

**Provenance chain (verbatim from commit messages, all WITNESSED via `git log`/`git show`):**

1. `1d700148` / PR #314 (2026-05-30) — the design note itself lands in the doc tree.
2. `faed66f3` (2026-06-02) — the item is filed into `docs/work-status.json` as
   `config-schema-projections`, `state: open`, **`disposition: future`**, `tier: large`,
   refs to the plan + consult. Commit message: "The toolbar 'hierarchical options menu'
   bullet is actually the config-schema arc... rewrote it to config-schema-projections."
3. `8d013bd0` (2026-06-04) — `docs/work-status.json` migrates wholesale into the Postgres
   `todo` DB ("the JSON becomes a frozen seed"); `890f57cd` later deletes the JSON file
   from the repo.
4. `docs/notes/audit/audit-spa-history-lessons-2026-06-10.md` (commissioned 2026-06-09,
   landed 2026-06-10) — a 90-agent, whole-history audit triggered by **the maintainer's
   stated intent to fork the SPA into a generic knowledge flash-card product**. Finding
   §3.21, verbatim: *"**RegistryEditor vocabulary** — not filed; the candidate was refuted
   as a strict subset of the open `config-schema-projections` item, whose 903-line design
   note already enumerates all four baked vocabularies... The salvage: the fork is that
   item's §8 trigger materializing — grounds to raise it from `future`."* §4 table,
   verbatim: *"`config-schema-projections` | The fork is its §8 trigger; raise-from-future
   recommended (§3.21)."* §7 item 7, verbatim: *"Promotions — verifiers suggested raising
   `multi-writer-slots`, ..., and `config-schema-projections`; everything was filed
   `future` pending your call."*
5. **The DB row today**: `state=open`, **`disposition=active`** (raised from `future`),
   `tier=large`, `extra={"band":"B1"}`, with a *third* ref added beyond the original two —
   `refs.ref_id=139: kind=audit, target=docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`.
   `audit_log` shows exactly **one** row for this item: an `INSERT` tagged
   `actor=genesis-snapshot` at `2026-06-11 03:20:47` with `new_row.disposition=active` —
   i.e. the raise-from-future the audit recommended was applied essentially immediately
   (the genesis snapshot for the DB's audit trail already shows it active), and the row has
   **not been touched since** (no further `UPDATE` in the 2026-06-11→2026-06-23 audit
   window, and nothing after).

So the DB's testimony, stripped of mandate force: the item was formally recognized as
important enough to promote from `future` to `active` disposition over two months ago
(2026-06-11), on the explicit rationale that a domain-fork decision made its ADR-0003 §8
trigger fire — and then nothing touched it again, in the DB or in code, through the
autoharn transition (2026-08-06) to today.

---

## (d) The M2-residue hypothesis — VERDICT: confirmed, with one exception the consult could not have covered

**Today's M2 finding** (ledger row 1282, from the menus-UI audit, row 1244): *"at least 11
facts each have 2-4 editable addresses (theme in Registry + Session-UI select + Wizard;
engine URL in Registry + toolbar + Wizard + settings field; ownership knobs in Registry +
Knob Registry + Wizard; locale; keybindings; analysisTabs; watchdog knobs). SettingsTab.vue's
own comment asserts the one-home rule the surface breaks."*

**Test: does the consult's prescribed end-state, had P0–P3 shipped, eliminate these
duplicate homes?**

- **For the Registry/dedicated-editor overlaps (theme, ownership knobs, analysisTabs,
  keybindings, watchdog knobs) — YES, by the plan's own words.** This is precisely
  symptom 1.3(c), and P2's stated deliverable is "the overlap is gone; Law 2 holds across
  placement" via `custom-editor` claiming and de-overlap. P3 additionally collapses the
  *write*-path duplication (registry vs. knob editor vs. toolbar popover) via the
  schema-validated mutator + `knob-ref` delegation (§5's own worked example is literally
  `ownershipOpacityCeiling`, reachable three ways today, one way "after"). So for the
  Registry-vs-curated-editor axis of M2, the finished refactor is a direct, on-record fix —
  this is not a re-derived inference, it is what the plan says its own Phase 2/3 do.

- **For the toolbar/knob-editor axis — YES**, same mechanism (§5, §6 `knob-ref`).

- **For the Wizard axis — NO, not automatically, and this is the one gap worth flagging
  for adjudication.** The first-run setup wizard (`b5c2c4a6 feat(frontend): first-run setup
  wizard (swz-setup-wizard)`, **2026-08-07** — landed two months *after* the 2026-05-30
  consult, and *after* the disposition was raised to `active`) is not named anywhere in the
  plan; it did not exist when the plan or the audit were written. The plan's equivariance
  machinery only closes duplication among projections that are *built as pure functions of
  S* — a wizard step built by hand, writing the same store paths directly (as every other
  non-schema-aware surface in the app does per §4.1 class 3), would remain a fourth,
  unreconciled home unless it were *itself* re-authored as a schema projection. Nothing in
  the record shows that was considered when the wizard was built, because the schema did
  not exist yet at that time either.

**Verdict: M2's core shape (2-4 editable homes) is substantively the refactor's foretold
and unremedied residue — the consult diagnosed this exact overlap, prescribed a phased fix
whose Phase 2/3 completion criteria are worded as directly closing it, and none of it
shipped.** The Wizard is a genuinely new complication added on top after the fact, not
covered by the original diagnosis, and would need explicit inclusion in any future schema
instance/projection set rather than being assumed to fall out "for free" from finishing
Phases 0–3 as originally scoped.

---

## (e) The honest remainder — for adjudication, not as mandate

If a future arc resumes this refactor, on today's evidence it would still need to:

1. **Author Phase 0 from scratch** — nothing exists. The store shape it would describe has
   moved on since 2026-05-30 (at minimum: the Wizard; whatever else has shipped in the two
   intervening months — this scout did not do a full re-diff of `types.ts`/`defaults.ts`
   against the plan's citations, which is itself Phase-0 work, not scoped here).
2. **Re-validate every plan citation against current source** — the plan's ~40 anchors were
   verified against the 2026-05-30 tree; two months of commits (including the SettingsTab
   re-tabbing `b0b1fd3d` and the Advanced Registry collapsible-headings change `ddf014b1`)
   have touched the exact files it cites.
3. **Decide whether the Wizard is in scope** — bring it under schema projection (extra
   work the original plan never budgeted), or explicitly carve it out as a fourth
   class-3-style write surface and accept M2's Wizard-vs-Registry duplication as
   out-of-scope for this arc.
4. **Re-confirm the compose-vs-subsume fork (§6)** and the equivariance scope narrowing
   (§4.1) still hold — both were the consult's main substantive findings and both are
   assumptions the plan bakes in rather than re-derives.
5. **Decide the design-note lifecycle**: per §13, either drive it through Phase 3 to
   `design-note: implemented`, or file a sibling `design-note: revised` if the shape is now
   wrong — the note has sat at `design-note: planned` since 2026-05-30 with no update.
6. **Ledger the arc properly** — open work items per CLAUDE.md point 1, with the
   archaeology in this report as one antecedent, and the commissioner's row-1299 mandatory
   precondition ("read the consult document first") already discharged by this dispatch.

Nothing above is asserted as necessary; it is the delta between "plan as written" and
"tree as it stands today," offered for the commissioner's adjudication per the fiat above.

---

## AMENDMENT (2026-08-10) — the knob registry: the earlier, partial SSOT attempt

Follow-up per ledger row 1317: the commissioner had two efforts in mind — the config-schema
projection plan (traced above) is the *second*, never-started one. The *first* is the
**knob registry**, `docs/worklog/2026-05-14-knob-registry.md` (393 lines, read in full),
two weeks *before* the 2026-05-30 consult. Same read-only discipline (SELECT-only on the
`todo` db, no app services touched, no code edited).

### (1) What the worklog's own text asserts

**Self-declared status, verbatim, header line:** *"Status: Shipped 2026-05-14 via PR #223
(`KodBena/feat/knob-registry`, 14 commits, +4,897 / −128 across 25 files). Full frontend
suite green at 472 / 3 / 0... at branch tip."* Genre line: *"closes the planned multi-phase
arc in `docs/notes/knob-registry-plan.md`. Phase 4 ... closed unilaterally... Phase 6 ... is
partial and remains open-ended... Plan-note status transitions to `design-note: implemented`
per §17 in the same closure pass."*

**The SSOT it attempted** (verbatim, "Context" section): *"the registry is the SSOT for
'which values in the system are controllable, where they live, what range they admit, what
semantic identity they carry', with qEUBO as one of several peer consumers."* This is
explicitly a **narrower** SSOT than the later projection plan's: scoped to
**user-controllable scalars** (numeric preferences with a range/transform), not "every
config leaf." The originating riddle was one hardcoded opacity constant
(`BoardWidget.vue::ownershipColor`'s `0.55`); the architectural reaction generalized it to
"catalogue every controllable scalar," not to "catalogue the whole config tree."

**What it claims to deliver**, phase by phase (all verbatim-summarized from the worklog):
`KnobDecl`/`KnobRegistry` types + `readKnob`/`writeKnob` + `validateRegistry` (Phase 1,
`ab82c66`); the hard/soft claim-arbitration state machine (Phase 2, `72749de`); four
lifted leaves incl. the opacity ceiling (Phase 3a, `9caf77b`); the `KnobSlider.vue` +
`KnobRegistryEditor.vue` cross-domain editor surfaces, mounted in the Other tab (Phase 3b,
`004c49c`); qEUBO becomes substrate-aware via claims (Phase 5, `a1dbe76`); a
`domain: 'qeubo'` category-error found and remediated same-day (`96def23`/`2bf7e84` — its
own postmortem, `docs/notes/postmortem-knob-registry-qeubo-domain-2026-05.md`); three more
preference thresholds promoted (Phase 6 initial sweep, `51ead8a`); `applyBookmark`
substrate-routed (`a7d337b`); i18n label pass + dedup of now-redundant sliders
(`c1cb50d`/`e2dc981`); plan-note closure (`65ec83c`).

**Explicitly asserted as NOT complete** (worklog's own "What's deferred" section,
verbatim): *"Toolbar-hover quick-access surface"* (deferred UX vision); *"Bookmark schema
reshape"*; *"Wire-key derivation from KnobDecl ids"*; *"Phase 4 (vector widget dispatch)"*
(closed, not done); *"Phase 6 open-ended sweep"* — and, tellingly, the plan-note closure
amendment itself states Phase 6's stated deliverable ("every literal outside
substrate-named SSOTs is either a controllable knob OR carries a `magic-literal:`
justification comment") *"is explicitly NOT closed by this batch."* So even on its own
terms this was a **deliberately partial** SSOT: complete for the substrate + one editor
surface + one consumer (qEUBO) + a first promotion batch, explicitly open-ended for the
rest of the config surface.

### (2) Shipped vs. aspired — traced in git, WITNESSED

| Claim | Status | Evidence |
|---|---|---|
| 14-commit PR #223 landed, reachable from `next` | **WITNESSED — true** | All 14 named shas (`ab82c66`, `72749de`, `9caf77b`, `004c49c`, `a1dbe76`, `d4eb9ac`, `3c8e59c`, `96def23`, `2bf7e84`, `51ead8a`, `a7d337b`, `c1cb50d`, `e2dc981`, `65ec83c`) verified `git merge-base --is-ancestor <sha> next` — all reachable. |
| Substrate + editor surfaces still exist and are load-bearing today | **WITNESSED — true, and extended since** | `frontend/src/lib/knobs.ts` (853 lines today, up from the worklog's smaller initial cut), `frontend/src/components/KnobRegistryEditor.vue` (132 lines), `frontend/src/components/knobs/KnobSlider.vue` (425 lines) all present. `git log` on `KnobSlider.vue` alone shows continued, ongoing investment well past 2026-05-14: `3c179e8c frontend(feat): knob-registry — toolbar quick-access popover + priority field`, `a1c53fd5`/`26f61ce4` KataGo cadence-knob substrate additions, plus **very recent** menus-audit fixes (`d0d3b7e6 fix(frontend): bounded knob-slider track... (row 1290, audit M17)`, `301b41ad fix(frontend): raise sub-minimum pointer targets... (M16)`). |
| "Toolbar-hover quick-access surface" — deferred at ship time | **Later shipped, contradicting the worklog's own deferral note** | `3c179e8c` (post-2026-05-14) explicitly delivers "toolbar quick-access popover" — the exact thing the worklog's "What's deferred" section named as future work. Worth flagging: the worklog is a point-in-time record and not wrong to have deferred it, but a reader treating "What's deferred" as still-current would be misled without checking git. |
| `knob-bookmark-schema-reshape` — deferred at ship time | **Shipped separately, later** | `todo` db: `state=closed, resolution=shipped, closed_on=2026-06-03`, refs a second worklog `docs/worklog/2026-06-03-knob-bookmark-schema-reshape.md`. |
| `knob-wire-key-derivation` — deferred at ship time | **Still open today** | `todo` db: `state=open, disposition=active`, no refs — genuinely unresolved, consistent with the worklog. |
| Plan-note status transition to `design-note: implemented` | **WITNESSED — true** | `docs/archive/notes/design/knob-registry-plan.md:3`: `**Status:** \`design-note: implemented\` (transitioned 2026-05-14 per the §17 maintenance contract)`. Unlike the projection plan (still stuck at `planned`), this note's lifecycle was actually closed out. |
| Phase 6 "every literal is a knob or justified" sweep | **Genuinely partial, as asserted** | Only the named batches (three thresholds in `51ead8a`, four earlier leaves in `9caf77b`) are promoted; no evidence of a completed magic-literals sweep anywhere in the repo. |

**Verdict: unlike the projection plan, this one is a real, mostly-delivered artifact** —
14/14 commits landed, both editor surfaces exist and are still being actively extended
(including by this week's own audit-remediation wave), the design note's lifecycle was
correctly closed, and its own stated deferrals track the `todo` db's current state
(one shipped later, one still open). The one soft spot: "What's deferred" reads as if it's
still current; it isn't — the toolbar quick-access surface it names shipped after all.

### (3) The todo DB's testimony (STALE — commissioner fiat applies identically here)

> Same fiat as the main report: presented as historical fact, not standing obligation.

```
     id                    | title                                                       | state  | disposition | resolution | tier
 unified-user-controllable-scalar | Unified user-controllable-scalar surface (knob registry) | closed |            | shipped    | small*
 knob-bookmark-schema-reshape     | qEUBO bookmark schema reshape                             | closed |            | shipped    | small
 knob-wire-key-derivation         | Wire-key derivation from KnobDecl ids for qEUBO ...       | open   | active     |            | small
```
(*tier not re-checked individually; row omitted a value in the `-x` capture — immaterial to
the synthesis.)

`unified-user-controllable-scalar` (verbatim `description`): *"Knob-registry substrate
(types + path-walk accessors + named-transform library + ownership state machine), the
cross-domain KnobRegistryEditor, the qEUBO consumer migration, and the first
magic-literals promotion batch. Open follow-ups tracked as separate items."* `state=closed,
resolution=shipped, closed_on=2026-05-14`, refs `pr:223` and the worklog itself. This is
the DB's own confirmation that the arc was accepted as done-for-its-declared-scope, with
follow-ups deliberately spun out rather than left implicit — exactly the two items above.
No open item in the `todo` db asks for the knob registry to be *generalized* to cover
non-scalar config; that ask appears only in the (never-filed-as-urgent, then later raised)
`config-schema-projections` item traced in the main report.

### (4) Synthesis — relating the three artifacts

**Was the knob registry a partial SSOT the projection plan was designed to complete/generalize? Yes — explicitly, on the record, not inferred.**

The projection plan (`docs/notes/design/config-schema-projection-plan.md`) names the knob
registry as its closest and only real precedent throughout — §6 is titled *"Relationship to
the knob registry — the fork,"* posing exactly the question this synthesis was asked to
answer: does the config schema **subsume** `KnobDecl` (generalize it to every leaf kind) or
**compose** with it (schema owns structure; numeric/claim-bearing leaves *delegate* to a
`KnobDecl` via a `knob-ref` widget)? The plan's recommendation, verbatim: *"compose... The
knob registry already exists and is persisted; the schema is code describing the existing
tree... Subsuming would require migrating the entire config representation into knob-decl
shape."* §5's worked example is literally the knob registry's own originating riddle —
`ownershipOpacityCeiling` — walked through *both* states: **"Now"**: *"rendered as a raw
`number` leaf in the Advanced Registry... *also* a `KnobDecl`... rendered as a slider in
`KnobRegistryEditor`... Two descriptors... two write paths."* **"After"** (never reached):
one `ConfigLeaf` with `widget: { kind: 'knob-ref', knobId: ... }`, one descriptor, one
write. So: **the projection plan is not a parallel or competing SSOT effort — it is,
explicitly and by its own §5/§6, the generalization arc that would finish what the knob
registry started**, folding the knob registry in as the numeric-scalar special case of a
general schema rather than replacing it.

**Which of M2's 11 facts does the knob registry already single-source? None, cleanly.**
The knob registry's substrate (claims, `writeKnobValue`, validation) *is* a real SSOT for
"is this scalar controllable and what enforces its writes" — but it was never paired with
the P2-shaped de-overlap step (never built, per the main report) that would have made the
*raw* `RegistryEditor` stop rendering a leaf once it gained a `KnobDecl`. So promoting a
literal to a knob **added a UI address rather than replacing one**: the Advanced Registry
still recurses over the full `profile.settings` tree today exactly as `RegistryEditor.vue`'s
unchanged four hard-coded tables (documented in the main report, §b) always did, and now
*also* shows up, separately, wired through `KnobDecl`, in the Other tab's Knob Registry
section.

**Which of M2's 11 facts does the knob registry itself DUPLICATE — confirmed from the
menus-audit report text (`report.md:46`), not re-derived:**

| M2 fact group | Homes named by the audit | Knob-registry involvement |
|---|---|---|
| `ownershipOpacityCeiling` / `ownershipDeadbandThreshold` / `livenessThreshold` | Registry · **Knob Registry** · Wizard step 4 | Yes — these are exactly the Phase 3a/6 promoted leaves (`9caf77b`, `51ead8a`); Knob Registry is one of 3 homes. |
| `intensityHueShift` / `moveSuggestionsFadeMs` | Registry · **Knob Registry** | Yes — Phase 3a leaves; Knob Registry is one of 2 homes. |
| the four watchdog/report-engine knobs (500/500/0.15/0.05) | Registry · **Knob Registry** ENGINE group | Yes — `engine.watchdog-animation-ms` / `engine.watchdog-latency-threshold-ms` (Phase 3a/6); Knob Registry is one of 2 homes. |
| `theme` | Registry · Session-UI select · Wizard step 1 | No — not a knob. |
| `engine.katago.url` | Registry · toolbar · Wizard · ProxyUpstreamSettingField | No — not a knob (it's a string/URL, out of the closed numeric-scalar vocabulary the knob registry deliberately scoped to). |
| `locale`, `analysisTabs`, `keybindings` | (various, non-knob) | No. |

So **3 of the audit's 11 fact-groups (covering 9 individual promoted literals) have the
Knob Registry as one of their duplicate addresses** — never as the sole address. The
pattern is uniform: every fact the knob registry touches, it *adds itself to* rather than
*resolves*. This is not a flaw specific to the knob-registry arc; it is precisely the gap
the worklog's own closure text left open ("Open follow-ups tracked as separate items") and
that the projection plan's §5 diagnosed by name two weeks later, using this exact leaf as
its worked example — and then never got past `design-note: planned` to actually close.

**One-paragraph relation for the commissioner:** the knob registry (2026-05-14) is a real,
substantially-shipped, narrowly-scoped SSOT for controllable scalars — types, claims,
validated writes, one editor. It was never designed to be the *only* UI home for those
values; it was designed to compose with a general config schema that would later teach the
raw Advanced Registry to stop double-rendering anything the knob registry (or any other
dedicated editor) already claims. That general schema is the projection plan (2026-05-30),
which named the knob registry as its precedent and its `knob-ref` delegate, and which
itself never shipped past its design note. The result, measured independently by this
week's menus-UI audit: the knob registry is today one of the duplicate homes it was always
going to be *until* the plan that was supposed to de-overlap it landed — which it never
did. M2 is the visible symptom of both gaps stacked: the knob registry's own de-overlap
dependency (on the projection plan) unmet, plus the Wizard adding a third/fourth address
neither artifact anticipated.
