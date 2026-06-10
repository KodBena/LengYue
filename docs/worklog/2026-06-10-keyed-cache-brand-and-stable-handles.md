# Worklog — keyed-cache brand at construction + stable handles in code comments (2026-06-10)

> Audit trail for two bundled doc-convention items from the 2026-06-10
> SPA history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`):
> **`keyed-cache-brand-at-construction`** (audit §3.5) and
> **`code-comment-stable-handles`** (audit §3.25). Both touch
> `frontend/CLAUDE.md`; the edits are kept clearly separated below.

## The change

### Item 1 — `keyed-cache-brand-at-construction` (§3.5)

- **Recorded the already-answered `r:`/`e:` prefix audit conclusion**
  (verified again at HEAD): the prefixes mint only in
  `projectLedgerToBundle` and parse only in `replayBundleIntoLedger`
  (both in `frontend/src/services/analysis-bundle.ts`); legacy
  persisted values are bare DJB2 hex (`hashConfig`'s
  `(hash >>> 0).toString(16)`) or the literal `'default'`, neither of
  which can carry `:` at index 1, so no legacy value can match the
  `r:`/`e:` dispatch. Conclusion appended to the analysis-bundle
  prefix note and to the `RawKey` / `EnrichedKey` rows in
  `frontend/IDENTIFIERS.md`.
- **Construction-time rule codified** in `frontend/CLAUDE.md`'s
  "Type-driven design" section: any new keyed cache mints a branded
  key whose declaration names the dependency set of the value it
  buckets; each key leg carries a one-word band call (domain-bound vs
  agnostic) in its IDENTIFIERS.md row. Leg band calls added to the
  `RawKey` (`overrideSettings`, `model`) and `EnrichedKey`
  (`analysis_config`, `overrideSettings`, `model`) rows — all
  domain-bound; the keying machinery itself is agnostic.
- **Pre-merge-checklist line added** (`docs/pre-merge-checklist.md`
  §G), quoting the RCA's own caveat verbatim per the item: *"a
  checklist guarded by memory is weaker than a lint; this is a
  mitigation, not a fix"* (G4,
  `docs/notes/postmortem/rca-discipline-lapses-2026-06-01.md` §4) —
  the line is mitigation, not the fix.
- The optional lint for multi-variable template-literal Map keys is
  deferred per the item ("optional later"); not filed here.

### Item 2 — `code-comment-stable-handles` (§3.25)

- **closeBoard docstring census fixed**
  (`frontend/src/store/index.ts`): the "Four cleanups currently fire"
  lead-in — doubly stale over eleven actual operations — replaced
  with a count-free enumeration that now includes the previously
  unenumerated `stabilityTrajectoryStore.purgeBoard` (entry #3);
  internal `#N` cross-references renumbered to match.
- **Additive descriptive slugs** attached alongside the code-minted
  O-numbers wherever they appear, with the numbers retained and the
  frozen archived plan untouched: `O12 (board-card-trees)`,
  `O13 (persisted-analysis-bundles)`, `O14 (card-tree-nav-slot)`,
  `O15 (forest-nav-selection)` in `store/index.ts` /
  `types.ts` / `board-card-trees.ts` / `useAppBootstrap.ts`, and
  `O15 (autosave-watcher-timer)` in `useAutoSaveAnalyses.ts`.
  closeBoard's closing paragraph now states explicitly that tags
  numbered past the archived plan's inventory do **not** resolve
  against the plan's own O12–O15 rows and that the slug, not the
  bare number, is the stable handle.
- **Stale plan path fixed** (`docs/notes/…` →
  `docs/archive/notes/resource-ownership-audit-plan.md`) at the cite
  the item names (closeBoard's closing paragraph, formerly
  `store/index.ts:416`) and at the two further instances found at
  HEAD (see deviations).
- **Convention landed as a refinement of the existing
  resource-ownership prescription item 4** in `frontend/CLAUDE.md` —
  not a parallel convention (which would itself be the ADR-0005
  Rule 1 failure the item decries): repo-resident stable handles
  (slugs, committed-doc anchors, registry labels, test names); a
  work-status id always travels with a descriptive slug so handles
  resolve in any clone/fork without the maintainer's DB; counts live
  in registries/tests/generated reports.

## Deviations and notes (recorded loudly)

- **Census-fix routing.** The item description routes the two census
  fixes to ride with the scoped-state and services-boundary items
  (audit §3.25). The round-1 commission explicitly assigned the
  closeBoard docstring census fix to this arc, so it ships here; the
  eslint census fix stays with the services-boundary arc —
  `frontend/eslint.config.js` is deliberately untouched.
- **Stale plan path: three instances, not one.** The item names the
  cite at `store/index.ts:416` only. At HEAD the same stale path also
  appears in `resetWorkspace`'s docstring (formerly
  `store/index.ts:620`) and at
  `frontend/src/components/chrome/LocalePicker.vue:38`. All three are
  the decay class this item owns; all three fixed.
- **O15 is triply bound at HEAD**, beyond what the item summarizes:
  the archived plan's own O15 (reconnect bookkeeping) is *correctly*
  cited at `analysis-service.ts:152` (now annotated as the plan's own
  row), while two distinct code-minted meanings coexist
  (forest-nav-selection; autosave-watcher-timer). Each got its own
  slug; no number was changed.
- **O16** (`useAppBootstrap.ts` restore watchers) extends the
  numbering past the plan but collides with nothing (the plan's
  inventory ends at O15); left untouched per the item's O12–O15
  scope. The refined item-4 convention covers any future mints.
- The `IDENTITY_SCOPED_CACHES` docstring's historical "prior
  hand-wired O8–O13 clears" range cite is left as is — it describes
  a prior code state, and the registry rows beneath it now carry the
  slugs that disambiguate.
- Verification: `npm run build`, `npm run test:run` (843 passed /
  4 skipped), and `npx eslint .` all green. No src file was created,
  moved, or deleted (FILES.md unchanged); no new brand was minted
  (IDENTIFIERS.md changes are row-content edits only).

---

License: Public Domain (The Unlicense).
