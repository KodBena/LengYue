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
