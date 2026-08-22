# Closeout — 2026-08-21, the last funded session

One page. Everything else hangs off the ledger (rows 2507–2560+) and the
reports in this directory.

## Where the code stands
- **`main` = `dc8e3b12`** — the consolidation merge: nncache feature
  (live-verified end to end; files appeared in `~/nncache`), region-owned
  presence core, Library/Cards promotion, component/status-bar/pass fixes,
  docker fix. Full suite 3529 passed at promotion.
- **`lyt-phase2` (ahead of main)** — cache-visibility surface, final-micro
  fixes, Library/Cards realization repairs, card-tree auto-orientation,
  and the divider-mechanics REVERT (re-land pending, branch `e72970bd`).
  Promote when ready: full suite green → `git checkout next && git merge
  --ff-only lyt-phase2 && git checkout main && git merge next`.
- **Preview** (`0.0.0.0:5174`): worktree `.claude/worktrees/agent-acf4…`,
  vite dev, `.env.local` points at the real backend. Roll = merge
  lyt-phase2 there; verify by ancestry + content-grep, never by log alone.

## In flight at close (their reports land in their worktrees)
- `statusbar-cards-hotfix.md` — defects (a)–(f): names elision, blank
  Cards, strip-over-Library, MORE-collapse (regression in `9ae5fb57`'s
  `useElementWidth` rewrite — timeline in ledger), card-click kills tree +
  editor clips, active-turn ring. Live-witness delivery bar.
- `layout-residue-build.md` — preview-board track autosize, board vertical
  dead space (prove-or-refute first), divider re-land (grab-and-hold =
  zero jump is the witness).
- AppImage bundle retry on `/home/bork/w/vdc/tauri-bundle` (patchelf now
  installed; only the squash step ever failed, disk then tooling).

## The honest grading of ~/xs
- **Witnessed closed**: diagnostics-toggle asymmetry, floating diagnostics
  panel, handicap-under-analysis, banned-transition hunt (all in
  `final-live-witness.md` with shots), tree horizontal scrollbar, divider
  verdict asymmetry (aa1/aa2), cold-boot no-board, presence leak.
- **Merged, partially confirmed**: names (state-dependent), auto-orient
  (blocked from view by the tree-kill defect), settings labels, komi
  target, themed slabs, passes, cache surfaces.
- **Open, owned by the two in-flight reports**: everything chrome —
  the six hotfix defects and three layout-residue items.
- **Open, unowned**: S10 chrome scaling at 2560 (design arc);
  Library/Cards IA question (button in toolbar vs content in panel —
  commissioner to rule); allocation S2/S3 residue if the layout builder
  refutes the maybe-already-fixed claim.

## Packaging
- **Docker: verified working** (3 images, smoke start, teardown; the
  container_name collision fixed in `4b4b14d2`).
- **Tauri: verified through compile + sidecars + AppDir staging.** Only
  the AppImage squash is unproven; patchelf installed; deb tree staged.

## The one lesson that would have changed today
Live witness FIRST for anything visual; jsdom-green is not evidence on
chrome surfaces (five refuted claims on one status bar). And: a filed
defect gets a dispatch the same turn — the orchestrator-authored
"handoff list" state does not exist (memory: no-orchestrator-handoff-state).

## Resume cheaply without Claude Code
The reports here + `./autoharn led --recent` + `frontend/FILES.md` are
the whole context. Any competent model (or the maintainer's own hands)
can pick any open item: each has a shot, a mechanism note, and an owner
report naming exact files. The archived relic branches are in
`/home/bork/w/omega-archive/` with MANIFEST.md.

Public domain, like everything here. It was a good day's work even where
it wasn't good enough. — the orchestrator

## Addendum at cancellation (23:58)
Both in-flight builders were ordered to bank WIP commits + report stubs
in their worktrees: `.claude/worktrees/agent-aa4fbd4e50b1a0f9f`
(statusbar/cards hotfix, defects a–f) and `agent-af4c35becc4a0fb9b`
(preview track / board height / divider re-land). NOT merged — unwitnessed
chrome does not merge, that is the day's lesson. Resume by reading their
report stubs and cherry-picking/finishing on a fresh branch.
The 5174 preview worktree (`agent-acf4bdae7edb0c794`) is the known-good
serving tree at its committed tip. lyt-phase2 is the integration truth.

## Final addendum — both builders banked (row 2562)
- `wip/statusbar-cards-hotfix` (GitHub): names + turn-ring + strip-overlap
  LIVE-WITNESSED FIXED, defensive MORE-collapse fix, defect (e) untouched.
- `wip/layout-residue` (GitHub): no fixes; witness driver + per-item
  diagnoses (divider snap likely ceiling-unification, NOT the hit-zone CSS).
- SEVERE open bug, found independently by both: LIBRARY tab + reload
  crashes the app — recursive updates in <LytNode>, pre-existing.
  First item for any resumption.
