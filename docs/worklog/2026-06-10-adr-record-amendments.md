# Worklog — ADR record amendments: fired triggers recorded, ADR-0010 artifact stripped (2026-06-10)

> Audit trail for work-status item `adr-record-amendments-2026-06`
> (parent `adr-effectiveness-audits`), executing §3.23 of the
> 2026-06-10 history-lessons audit
> (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md`). Four
> bounded record repairs — truthfulness, not redesign. Every amended
> ADR was read end to end first (ADR-0005's own requirement), and the
> amendments follow the Amendments-header + dated-in-place-note
> convention ADR-0005 and ADR-0009 set.

## The change

- **ADR-0001.** Revisit-when #2 (profiling reveals reactivity hot
  spots) recorded as fired — the 2026-05-27/28 perf audits; the
  response removed `mutateBoard`'s identity re-wrap rather than
  revisiting `readonly`, so the decision stands. The mutator-benefits
  re-wrap bullet corrected *scoped to `mutateBoard` only*: the
  re-wrap survives in `mutateReviewSession`
  (`frontend/src/store/index.ts:209`); the version-counter,
  invariant, and grep-target bullets hold unchanged for both
  mutators. The Related-section claim that the mutators' docstrings
  reference the ADR corrected (no such reference exists at HEAD).
  Code side: the stale audit path in `mutateBoard`'s inline rationale
  comment re-pointed from its pre-reorg `docs/notes/` location to the
  actual `docs/notes/audit/perf-audit-game-scroll-2026-05-28.md` — a
  comment-only change.
- **ADR-0003.** Revisit-when #1 recorded as fired **twice**: the
  `chess-clone` work-status item (open/active) and the maintainer's
  generic knowledge flash-card fork (2026-06-09/10). Revisit-when #2
  (inventory drift) recorded as fired (~9 of ~23 paths stale); the
  per-file inventory listing delegated to `frontend/FILES.md`,
  **retaining** the band definitions, the band-mixed seam analysis,
  and the port-sizing prose. A non-game fork sizing added beside the
  Chess one, with Band 2 marked **split** (game-tree skeleton
  replaced; SR-orchestration flow and generic charting kept) — not
  "replace". One Revisit-when #3 instance recorded, not adjudicated:
  `useReviewSession.ts` is Band 2 in the ADR, `[B3]` in FILES.md.
- **ADR-0010.** The two trailing harness-envelope artifact lines
  (literal `</content>` / `</invoke>`, present since creation,
  surviving three later edits) deleted, and the stale harness path
  corrected (`tests/integration/render-locality/` →
  `tests/integration/render-count/`) — one Amendments note covers
  both. A CI gate added to `.github/workflows/doc-graph-ci.yml`: a
  whole-line-anchored grep for harness-envelope strings under
  `docs/` (anchored so audit appendices that legitimately *quote*
  the strings inline keep passing; verified green at HEAD).
- **Co-changes.** `frontend/FILES.md`'s three band-legend lines
  re-keyed to the any-knowledge-domain criterion (78 `[B1]` /
  39 `[B2]` / 97 `[B3]` / 1 `[B?]` at HEAD), with an explicit note
  that existing tags were assigned under the weaker chess axis and
  have not been re-swept. `docs/adr-synopsis.md`'s ADR-0003 entry
  updated to match the amendment (the cochange advisory flags the
  synopsis on ADR changes). `docs/handoff-current.md`'s chess-keyed
  "Domain extension" bullet updated minimally to carry both fired
  adopters and the two sizings.

## Repair (4) — trigger-sweep cadence: staged, not executed (deviation)

The item's fourth repair folds the trigger-sweep checklist into the
parent item (`adr-effectiveness-audits`) as cadence. This session's
commission is **read-only on the todo DB**, so the fold is staged
here for the maintainer rather than executed — the same posture the
audit took for its own filings (§4/§5). The trigger count was
re-derived from end-to-end reads of all ten ADRs' Revisit-when
sections, per the item's instruction not to trust the miner-internal
figure: **38** (ADR-0001..0010: 5 / 4 / 4 / 2 / 3 / 3 / 4 / 4 / 5 /
4 — the re-derivation happens to confirm the miner's number). The
staged SQL:

```sql
UPDATE items
SET description = description || E'\n\nCadence (folded in from adr-record-amendments-2026-06, audit §3.23): each ADR-trigger sweep re-reads every ADR''s Revisit-when section end to end and walks each trigger against HEAD and the work-status store; the trigger count is re-derived per sweep from those reads (38 across ADR-0001..0010 at 2026-06-10: 5/4/4/2/3/3/4/4/5/4), never carried forward as a constant. A fired trigger gets an in-place record in the ADR itself — an Amendments header-line entry plus a dated note at the fired trigger — per the convention ADR-0005/ADR-0009 set; the 2026-06-10 amendments to ADR-0001/0003/0010 are the worked examples.'
WHERE id = 'adr-effectiveness-audits';
```

Followed by the usual `SELECT * FROM work_status_violations` gate.

## Notes and out-of-scope observations

- Stale audit paths of the same class as the one fixed remain at
  `frontend/src/store/index.ts:64` and `:141` (the nav-and-pv-hover
  audit cited at its pre-reorg `docs/notes/` location; actual home
  `docs/notes/audit/`), and in `TreeWidget.vue:39`,
  `StatusBar.vue:35`, `SidebarWidget.vue:133` (the game-scroll
  audit, same drift). The item scoped the fix to the mutator comment
  only; the class belongs to the audit's
  `doc-graph-dangling-signal-cleanup` /
  `code-comment-stable-handles` recommendations.
- `docs/handoff-current.md`'s "Architectural governance" section
  still describes ADR-0005 as "Seven rules" (nine at HEAD). Observed
  while reading end to end; outside this item's named surfaces, so
  left for the owning arc rather than silently absorbed here.
- No src files were created, moved, or deleted (FILES.md needs no
  row changes beyond the legend re-key); no new brands
  (IDENTIFIERS.md untouched).
- Verification: `npm run build` and `npm run test:run` green
  (comment-only code change); `npx eslint .` clean;
  `node tools/doc-graph/generate.mjs` regenerated in the same
  change (this worklog and the ADR cross-reference edits are
  structural); the new envelope grep verified green at HEAD.

License: Public Domain (The Unlicense).
