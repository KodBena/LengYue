# Worklog — doc-graph dangling-signal cleanup (2026-06-10)

> Audit trail for work-status item `doc-graph-dangling-signal-cleanup`, from
> the SPA history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md` §3.24, maintainer
> decision points §7.6/§7.7). Before this change, ~66% of the report's "live"
> danglers were noise by the project's own conventions; the generator now
> implements the boundaries those conventions already claimed. All maintainer-
> approved defaults applied: worklogs → frozen bucket, executed playbooks → a
> third "executed" bucket, retired hubs → tombstones, everything as report
> sections with an advisory no-new-danglers ratchet — no new red-X gate.

## The change

All in `tools/doc-graph/generate.mjs` (report/index projections regenerated in
the same PR — the report structure changed, so the committed-artifact
discipline applies), plus one stale code-side pointer:

- **Frozen-boundary alignment.** The report's origin split was
  `docs/archive/**`-only; the working convention (recorded in
  `docs/notes/consolidation-xref-fallout.md` §Method) freezes completed
  worklogs too. That note even asserts "the doc-graph report already
  segregates them" — **false until this change; true after it.** The note
  itself is not edited (it is a point-in-time working artifact); this worklog
  is the record. New origin buckets: **live** / **executed**
  (`docs/playbooks/monorepo/**`, the note's "quasi-frozen" class) / **frozen**
  (`docs/archive/**` + `docs/worklog/**`).
- **Dangling target classes.** Live danglers split into **missing-on-disk**
  (genuine rot — review), **retired** (tombstoned hubs), and
  **outside-node-set** (target exists on disk but outside the scan scope —
  previously reported with the same wording as deleted files). The class is
  computed at generation time and kept **in-memory only**: `committedManifest`
  strips it (and `dir_refs`) because both depend on disk existence of files
  outside the doc-graph CI workflow's path filter — committing them would let
  an unrelated code PR strand the gate red on the next doc PR. Same
  snapshot posture as the heatmap; `manifestSkeleton` is unchanged, so the
  committed `doc-graph.json` is structurally identical to main's (verified:
  skeleton-equal; only date/bucket snapshot rows moved).
- **Tombstones.** A curated `TOMBSTONES` map; sole entry today is the retired
  deferred-items hub (28 live refs), pointing at its successor (the
  work-status store + the vestige notes under
  `docs/notes/vestige/deferred-items/`). Extensible when another hub is
  deliberately retired.
- **Directory references (judgment recorded).** `BACKTICK_PATH_RE` requires
  `.md`, so directory citations were structurally invisible. Measured ~218
  scanned directory refs after filtering — too many to add as manifest edges
  without bloating the committed artifact for no graph signal (directories are
  not nodes). Chosen handling: the sanctioned named-class option — scanned
  with the same fence-strip/placeholder filter, resolved against **disk**
  existence, missing ones surfaced in their own report section (live vs
  frozen/executed), resolved ones counted but not listed.
- **Advisory ratchet.** `NO_NEW_DANGLERS_RATCHET` — baseline **38**
  (2026-06-10) over the two genuine-rot live classes (missing-on-disk +
  retired); `outside-node-set` excluded because those targets exist on disk
  (scan-scope artifact, not rot). Report section only; exceeding the baseline
  flags loudly in text but gates nothing. Ratchet down by editing the named
  constant when the count drops.
- **Stale pointer fix.** `frontend/src/components/board/MoveSuggestions.vue`
  line 144 cited the pre-reorg audit path; now
  `docs/notes/audit/perf-audit-nav-and-pv-hover-2026-05-27.md`. Comment-only;
  frontend build + test suite + eslint run green.
- **Deliberately NOT touched:** ADR-0010's stale `render-locality/` pointer —
  it belongs to the A1 ADR-amendments arc (`adr-record-amendments-2026-06`).
  It now also surfaces mechanically in the new missing-directory section,
  which will clear when A1 lands and this PR's artifacts are regenerated on
  rebase (the coordinator handles the rebase+regenerate; this PR merges after
  A1).

## Report numbers (sanity check)

Total dangling unchanged at **371** (the change reclassifies; it deletes
nothing): live 45 = **10 missing-on-disk + 28 retired + 7 outside-node-set**;
**25 executed**; **301 frozen** (= 246 archive + 55 worklog). Cross-checked
against the audit item's figures: 55 worklog-origin ✓, 28 retired-hub ✓, ~25
playbooks ✓ (exactly 25), 83-of-125 noise = 55 + 28 ✓. Directory refs: 220
scanned (two of them this worklog's own resolved citations), 13 missing
(6 live, 7 frozen/executed). Ratchet 38 = baseline.

**Deviation (named loudly):** the item description says *four* on-disk files
were reported with deleted-file wording. Mechanically there are **five**
distinct on-disk-but-outside-node-set targets: the four named
(frontend/tests/CLAUDE.md, backend/samples/README.md, backend/qeubo/README.md,
frontend/docs/i18n.md) **plus frontend/docs/notes/board-scope.md**. Also,
backend/qeubo/README.md's referencing docs are all worklog/archive-origin, so
after the frozen-boundary alignment it appears in the frozen section (with the
distinguishing "exists on disk" wording), not the live one — the live
outside-node-set section carries the other four. All five are distinguishable
in the report, which is the requirement.

## Deferred / notes

- Widening the node-set scope to absorb the outside-node-set files (e.g.
  scanning `frontend/docs/` and frontend/tests/CLAUDE.md) is a maintainer
  decision the new report section inventories; deliberately not done here
  (ADR-0004 — the arc owns the signal split, not the scope).
- The tombstone successor text repeats per row (28×); tolerated for
  mechanical-report simplicity. If it grates, a footnote-style dedupe is a
  cosmetic follow-up.
- Per ADR-0005 Rule 6, this record is authored with the change, and per
  ADR-0002 Rule 6 the consolidation-note discrepancy is surfaced here rather
  than silently absorbed.

---

License: Public Domain (The Unlicense).
