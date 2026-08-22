# toolbar-space-0c21-build

Base: `git rev-parse HEAD` after `git reset --hard 0c21780d` confirmed
`0c21780d10ee135651a6c7b7108de9d154cd4611` (the mandate's own hash,
matching commit `fix(frontend): settle-aware fit assertion — report
only violations persisting past grid-track settling (row 2591
ruling)`). This reset was a genuine correction mid-session: the
worktree's actual HEAD was `dc8e3b12` (the stale main-branch cut) until
the coordinator's mechanical base check caught it — recorded here per
that mandate, not glossed over. `origin/next` moved to `90b67af3`
during the session; checked before final gates, `git merge origin/next`
reported "Already up to date" — this branch's history already contains
everything `next`'s current tip carries (`git diff --stat origin/next
HEAD` shows this branch strictly ahead), so no regate was needed beyond
what's recorded below.

`frontend/node_modules` was a pre-existing symlink to the shared
checkout's own `node_modules`; not recreated.

## Live-diagnosis methodology (why this took the shape it did)

Item 1's own wording ("what width does the overflow-collapse logic
read vs what is actually available?") called for live evidence, not
code-reading alone. First attempt used `npm run build && vite preview`
on an ad-hoc port and drove it with Playwright (`playwright-core`,
browsers already cached at `~/.cache/ms-playwright`) — but the first
chosen port (19173) turned out to already be bound by a **different,
concurrent worktree's own `vite dev` server**, so the earliest round of
measurements were silently taken against a different codebase's live
state (confirmed by console logs showing `[vite] connecting...` HMR
client traffic and a genuinely different DOM shape). Caught this by
cross-checking a measured column width against hand-computed expected
values and finding no explanation for the mismatch; traced it to the
port collision via `ss -ltnp`. Corrected by picking a distinctively
unlikely port (27391) and re-running every measurement from scratch —
every number in this report is from that corrected rig. Named here per
ADR-0002: the first round's numbers were never reported as findings,
but the methodological failure and its correction are disclosed rather
than silently absorbed.

A second, subtler contamination surfaced next: even on the correct
port, the built SPA's own `API_BASE_URL` fell back to `http://
localhost:8764` (per `src/config/env.ts`), and a **real backend was
listening there** in this shared environment — with real, mutable
session state (an authenticated user, `boardRail` toggled visible, a
persisted `treeControlRegionWidthPx: 875` drag). This is exactly the
non-determinism `frontend/scripts/layout-audit.mjs`'s own header
documents and defends against (its "Deterministic cold boot" section):
it probes for a genuinely dead TCP port and bakes `VITE_API_BASE_URL`
to it at build time before auditing. Adopted the same discipline here
(`VITE_API_BASE_URL=http://127.0.0.1:19599` — confirmed dead via a
refused `curl` before building) for every diagnostic build. All
findings below are from that dead-backend, cold-boot rig.

## Item 1 — toolbar scrollhidden space / collapse to MORE

**Diagnosed live; NOT a stale/frozen-reading bug — the composable
correctly measures the toolbar's own real track. Hardened anyway, and
disclosed the genuine root cause.**

Reproduced the commissioner's exact symptom cold, at 1280×1024 (screenshot
`toolbar-space-0c21-witness-1280x1024.png`, saved from this session):
`MORE ▾` alone, with a visually large blank area to its right in the
same row. Measured precisely, not guessed:

- `useEngineControlsRealization`'s `containerWidthPx` (i.e.
  `.engine-controls`'s own live `getBoundingClientRect().width`)
  correctly read **185px** at this geometry — the grid track's own
  compiled `elastic minPx: 185, frWeight: 1` floor
  (`lyt-layout.gen.ts` path "2.0.0"). It is not stale: forcing the
  same element's real box wider/narrower via direct style mutation
  (bypassing both `ResizeObserver` and `window.resize` entirely) was
  picked up correctly and immediately in every trial, both directions.
- The apparent "free width" is a **different grid cell**
  (`A_engine_queue`, path "2.0.3" — the fourth of the four leaves this
  row hosts) rendering blank because the engine is disconnected, not
  width genuinely available to the collapsed controls cluster.
- Root cause, traced to the actual formula
  (`state/feasible-layout.ts::resolveRootSplitLiveLayout`, the
  `board-priority-clamp` track's live resolver): at this geometry the
  side column (`"2"`, the whole right-hand region) computed to its own
  compiled **345px floor** (`board-priority-clamp minPx`), while the
  `"2.0"` row's genuine minimum content need — two fixed 139px leaves
  (`A_engine_eval`/`A_engine_health`) + `A_engine_controls`'s own
  185px floor + 3×4px gaps — is **463px**. The row's own minimum
  exceeds its column's floor by ~118px at this width; CSS Grid never
  shrinks an explicit `minmax()` floor below its declared value, so
  the excess renders past the column's own right edge. Separately,
  `A_engine_controls` and the near-always-idle `A_engine_queue` split
  whatever elastic space remains **1:1** (`frWeight: 1` each), so even
  where the column isn't floored, controls gets no more room than an
  idle sibling that rarely needs any.
- This is the **same family** as the standing, open ledger item
  `lyt-engine-metrics-occlusion` — read via `./autoharn led work list
  --slug lyt-engine-metrics-occlusion --fields slug,title,state,
  effective_state` (title: *"engine cluster envelope does not cover
  metric-label demand"*), confirmed still `open`. Its actual fix is a
  **compiled-model change** (widening the column's floor and/or the
  controls/queue weighting in `lyt-layout.gen.ts` / the `.lyt`
  encoding) — explicitly fenced off from this build (`.lyt/.gen.ts`
  is not mine). **Not discharged here** — disclosed, not silently
  expanded into.

**What I did fix, in-fence:** `useElementWidth.ts` gained a genuine
hardening regardless — a low-frequency (`2000ms`) `setInterval`
stale-poll, decoupled from `ResizeObserver` delivery, `window.resize`,
and the existing rAF settle-burst's own short post-mount window. The
prior two defenses each have a real gap the poll closes: the settle
burst only spans the first few frames after `observe()`, and the
window-resize fallback only helps if a real `resize` DOM event fires.
Neither helps a divergence that lands well after mount with no resize
event (a presence-menu toggle changing the column's own width, or the
documented-but-jsdom-unreproducible real-browser class where a live
`ResizeObserver` simply stops delivering for a still-attached
element). The poll makes "never a stale/frozen reading" true by
construction, independent of which delivery path failed. New
regression test: `tests/integration/useElementWidth-stale-poll-
fallback.test.ts` — a fake, never-delivering `ResizeObserver` (mirroring
the existing `useElementWidth-resize-fallback.test.ts`'s own
`DeadResizeObserver` idiom) plus `vi.useFakeTimers()`, proving recovery
both directions (narrow→wide, wide→narrow), the pre-`observe()`/post-
`stop()` no-op guards, and no double-firing across a re-`observe()`.

## Item 2 — engine health label truncation while connected

**Same root cause as item 1 — traced, not separately fixed; explicitly
NOT discharging the standing `lyt-engine-metrics-occlusion` item.**

`ToolbarEngineMetrics.vue`'s own compact-badge shape (the prior
"Overlap fix," ledger row 2372) already measures the health group's
worst case at 107.09px against its own compiled 139px fixed
allotment — that allotment is generous and, taken alone, is not the
truncation's cause. Live-measured (same rig): at the exact geometry
where the row's own minimum content need (463px) exceeds the side
column's floor (345px), the health leaf's entire 139px cell is
positioned starting where the preceding siblings' floors leave off —
which, at this geometry, is **past the column's own right edge**, so
the cell (and the label inside it) renders partially or fully off the
visible column. This is not an ellipsis-truncation (no `text-overflow`
rule touches this leaf) — it's the same column/row floor mismatch as
item 1, manifesting as positional overflow rather than a collapse
decision. Verified this is the exact territory of the standing
`lyt-engine-metrics-occlusion` ledger item (title quoted above); its
"ch-derived envelope over metric states" fix is model-level, out of
this build's fence. Not discharged; no cosmetic patch attempted here
that could look like a fix without addressing the actual floor.

## Item 3 — chrome text overflowing into resize/divider bars

**Fixed and live-witnessed.** `#tree-panel-header` ("Game Tree",
`App.vue`) shares its own left edge with `#resizer-outer` by design
(the template's own comment: the tree leaf's parent split "cross-fills
the side column's full width with zero left offset," so a drag
anywhere near the boundary grabs it — the resizer paints on top via
`position: absolute; z-index: 10`). Under ample width this header's own
`padding: 0 var(--space-default)` keeps its text clear of the 4px grab
zone; at a genuinely narrow `tree` leaf, neither `overflow` nor
`white-space` was constrained, so the label wrapped onto two lines
("GAME"/"TREE") and/or ran wider than the panel's own box, bleeding
past the panel's edge (measured: `scrollWidth` 83px vs `clientWidth`
76px at 1920×1080's own narrow tree column — a 7px overflow that would
have painted straight through the resizer's transparent hit-zone
before this fix).

Fix: `overflow: hidden; white-space: nowrap; text-overflow: ellipsis;`
added to `#tree-panel-header`'s existing rule. Live re-measured
post-fix: `clientWidth` unchanged (76px), content now clipped to it —
confirmed via `getComputedStyle` (`overflow: hidden`, `white-space:
nowrap`) and a screenshot showing the label rendering cleanly inside
its own box with no visible bleed into the divider or the
control-panel side, at both 1920×1080 and the narrower 1280×1024
geometry that reproduces item 1's collapse. This is a static,
one-line panel title (not the load-bearing per-node tree content
`TreeWidget` itself renders), so trading full-text-always-visible for
containment at extreme narrowness is the correct call here, unlike
item 2's load-bearing-label discipline.

No other overflowing chrome-text element was found scoped to the
toolbar row during this diagnosis; a broader sweep of other panels
(control-panel tab strip, etc.) was out of this mandate's fence and
not attempted.

## Gates (synchronous, foreground, outputs read)

- `npx vue-tsc -b --noEmit` — clean, no output, twice (once before the
  divergence-lineage check, once after — both under the correct base).
- Targeted `npx vitest run` — 14 test files, 86 passed, 4 skipped
  (pre-existing, unrelated to this build's scope), 0 failed:
  `useElementWidth-stale-poll-fallback.test.ts` (new),
  `useElementWidth-resize-fallback.test.ts`,
  `engine-controls-realization.test.ts`,
  `ToolbarEngineMetrics-hover-grace.test.ts`,
  `ToolbarSliderPopover-scroll-anchor.test.ts`,
  `ToolbarEngineControls-menu-dismissal.test.ts`,
  `ToolbarEngineMetrics-overlap-fix.test.ts`, `ToolbarMoveNav.test.ts`,
  `forest-directory-two-col-tree-panel-grid.test.ts`,
  `ToolbarEngineControls-menu-capabilities.test.ts`,
  `ToolbarEngineControls-state-invariance.test.ts`,
  `toolbar-stable-activation.test.ts`,
  `ToolbarEngineMetrics.render-count.test.ts` (render-count guard —
  unaffected), `App-library-cards-promotion.test.ts` (the closest
  App.vue import-graph-reach coverage this tree has for the touched
  file). Re-run in a fresh process after the `next`-divergence check
  (isolation re-run per the mandate) — identical result.
- `eslint` on the three touched files: 2 pre-existing `App.vue`
  cast-hygiene errors at lines 1384/1401, confirmed via `git stash` +
  re-lint to be **present on the untouched base**, unrelated to this
  diff (my own diff is exactly the one `#tree-panel-header` CSS block,
  confirmed via `git diff --stat`). No new lint errors introduced.
- `npm run build` (`vue-tsc -b && vite build`) — clean, 1274 modules,
  `dist/` emitted, twice (once mid-session, once as the final gate).

## Ledger

`toolbar-space-0c21` opened (row 2621) and claimed from the main repo
root's `./autoharn`. Closing shipped with this report as witness;
`--review-deferred` per the honest disclosure above that items 1/2's
underlying model-level shortfall (the `lyt-engine-metrics-occlusion`
family) is NOT discharged by this build and needs its own,
out-of-fence commission.

## Not done / honestly disclosed

- Items 1 and 2's user-visible symptom (collapse-with-apparent-free-
  space; health-label positional overflow) is **not eliminated** by
  this build — it is a genuine, live-confirmed, model-level shortfall
  (compiled column floor vs. row minimum need; 1:1 elastic-weight split
  against a near-idle sibling), not a measurement bug. Fixing it needs
  `.gen.ts`/the `.lyt` encoding, out of this build's fence (explicitly
  named: "NOT yours: ... .lyt/.gen.ts"). Surfaced, not papered over.
- The standing ledger item `lyt-engine-metrics-occlusion` is **not
  discharged**. Its own title's "ADR-0000 diagnosis + fix, ch-derived
  envelope over metric states expected shape" work remains open.
- Did not attempt a realization-layer special-case reweighting the
  `A_engine_controls`/`A_engine_queue` elastic split (analogous to
  `LytNode.vue`'s existing `previewBoard` aspect-leaf clamp-recovery
  precedent) — considered it, but judged it a bespoke, widget-identity-
  keyed hack bypassing the compiled model's own numbers without a
  ratified precedent for THIS specific pair, and the standing open
  item already names the correct, principled fix shape (a compiled
  envelope change) — better left to that item's own commission than
  improvised here under time pressure.
- Fences respected: no touch to `.lyt/.gen.ts`, StatusBar/nav,
  divider/drag mechanics (the resizer DIVs themselves untouched — only
  the adjacent header's own containment), sink/store.
