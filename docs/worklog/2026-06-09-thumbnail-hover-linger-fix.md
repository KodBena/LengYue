# Worklog — hover-thumbnail linger / unpredictable-movement fix (2026-06-09)

> Audit trail for PR #365 (work-status item `thumbnail-hover-linger`). The
> board-tab hover preview could linger indefinitely (a `mouseleave` lost when a
> tab/toggle re-rendered under the pointer) and moved unpredictably (a
> cursor-anchored floating thumbnail). Two host surfaces drove one shared
> imperative `FloatingThumbnail` (`show()`/`hide()`): `SidebarWidget` and
> `TreeWidget`.

## The change

- **Sidebar → docked reactive pane.** `SidebarWidget` stops being an imperative
  `FloatingThumbnail` host. The visible gate is a synchronous `previewBoardId`
  ref; the displayed snapshot is *derived* from it via a `computed` that does a
  synchronous reactive cache read (`getSnapshotSync`), with a fire-and-forget
  `getSnapshot` warm. The async fetch writes only the shared cache — never the
  gate — so a late resolve cannot resurrect a cleared preview. Race-free by
  construction; nothing cursor-anchored. Rail 90→168px; idle = empty placeholder.
- **Tree → hardened in the shared seam.** `FloatingThumbnail` keeps its one
  remaining host (TreeWidget, floating, contextual to the tree — a sanctioned
  user choice) and gains a single seam-level invariant: *visible only while the
  pointer stays within 80px of the anchor it was shown at.* A lost `mouseleave`
  can no longer strand it. Composes with (does not replace) the host's
  element-level `mouseleave` fast path. Adds the missing ADR-0006 header and an
  `onUnmounted` listener release. `TreeWidget` itself is net-unchanged.
- **Cache reactivity note.** Added a load-bearing comment at `snapshotCache`
  (`useThumbnailCache.ts`): the `ref(Map)` collection-reactivity is what lets
  the docked pane (and ChartPreviewBox) fill on warm; a plain/`markRaw` Map
  would leave them never-populated. (From the audit, finding 3.)

Runtime-verified on both surfaces in Playwright (sidebar: no linger, override,
rapid-jitter; tree: show, clean-leave fast path, and backstop-clears-stranded).

## Out-of-frame hack-rationalization audit

The first proposal ("just patch the handler" — a latest-wins generation token
in one host) was audited by the hack-rationalization-detector skill and returned
**UNDISCHARGED-HACK** (fixed 1 of 2 writers; named-then-downgraded the shared
fix). That prompted the redesign. The **shipped** redesign was then re-audited
out of frame (a fresh agent that did not write it, with the implementer's claims
handed over as the object of suspicion). Verdict: **general**. The agent
independently re-enumerated writers, ran `grep_tells.py` (0 tells) /
`enumerate_writers.py`, and drove its own Playwright repro (async-resurrection +
lost-`mouseleave`). The prior finding is discharged, not relocated: the second
host was *removed* from the imperative seam (2→1), and the surviving host is
covered by a property quantifying over all callers.

### Findings beyond verdict, and disposition

1. *80px backstop rarely fires on a clean leave (by design).* The toggle `<g>`
   is ~19.5×14px, so any small move exits it and the host's element-level
   `mouseleave` hides it first; the radius is a backstop for the lost-leave case
   only. Intended composition — recorded, no change.
2. *Invariant guards a lost `mouseleave`, not `pointerout`/scroll/blur.* The
   pointer-distance backstop hides only on `pointermove` beyond radius; a window
   blur, or a tree-scroll-under-a-stationary-pointer (no subsequent move) could
   persist until the next move. **Acted on** (user decision): added companion
   seam-level watchers bound only while visible — `scroll` (capture, passive;
   the live tree grows during analysis, the realistic stationary-pointer case)
   and window `blur`. Runtime-verified both hide the thumb, with show /
   clean-leave / pointer-distance backstop unregressed. (Touch-lift remains a
   non-case for a hover-only desktop affordance.)
3. *`previewSnapshot` race-freedom depends on Vue's `ref(Map)` collection
   reactivity.* **Acted on** — load-bearing comment added at the cache
   declaration (see above).
4. *Anchor stored in plain `let` (not reactive).* Correct and intentional; the
   writer-enumeration script cannot see these. No change.
5. *No residual UNDISCHARGED-HACK.* The change pulls the sidebar into the
   already-existing `ChartPreviewBox`/`LibraryPreviewPane` reactive shape,
   reducing seam variety rather than adding a one-off.

---

## Appendix A — commission prompt (verbatim)

> You are running the hack-rationalization-detector skill OUT OF FRAME on a shipped change you did NOT write and whose reasoning you must treat as suspect. Read the skill at /home/bork/.claude/skills/hack-rationalization-detector/SKILL.md and follow its procedure exactly — including the two deterministic scripts (scripts/grep_tells.py, scripts/enumerate_writers.py) and the references/known-cases.md few-shot — and produce the skill's EXACT output template as your final message.
>
> ## The change (object of audit)
> - Worktree: /home/bork/w/omega/.claude/worktrees/thumbnail-hover-linger  (branch `bork/fix/thumbnail-hover-linger`, commit `2baf005`, PR #365; base `origin/main`).
> - Diff: `git -C /home/bork/w/omega/.claude/worktrees/thumbnail-hover-linger show 2baf005`  (or `git -C <worktree> diff origin/main...HEAD`).
> - Files changed: `frontend/src/components/chrome/FloatingThumbnail.vue`, `frontend/src/components/chrome/SidebarWidget.vue`, `FEATURES.md`. Note: `frontend/src/components/tree/TreeWidget.vue` is NET-UNCHANGED in this commit but is a relevant host — inspect it. Also read `frontend/src/composables/cards/useThumbnailCache.ts`.
>
> ## What it is supposed to fix
> A hover-thumbnail that "lingers (can linger forever)" and "moves around unpredictably." Two host surfaces drove a shared imperative `FloatingThumbnail` (`show(svg,x,y)` / `hide()`): `SidebarWidget` (board-tab hover) and `TreeWidget` (variation-toggle hover).
>
> ## History you MUST weigh
> An earlier run of THIS skill audited the implementer's FIRST proposal — "just patch the handler" with a latest-wins generation token in one host — and returned **UNDISCHARGED-HACK**: it fixed one of two writers and named-then-downgraded the shared fix. The implementer then changed approach. Your job is to determine whether the SHIPPED change genuinely discharges that finding or merely relocates it.
>
> ## The implementer's claims — OBJECT OF SUSPICION (do NOT agree by default; verify against the code)
> 1. "The sidebar docked pane is race-free BY CONSTRUCTION: the visible state is a synchronous `previewBoardId` ref; the rendered snapshot is DERIVED from it through the reactive snapshot cache and is never written asynchronously, so a late fetch cannot resurrect a cleared preview."
> 2. "`FloatingThumbnail` is hardened in the SHARED SEAM with a single invariant — visible only while the pointer stays within 80px of the anchor it was shown at — so a lost `mouseleave` cannot strand it. `TreeWidget` itself is untouched; the arbitration lives in the seam."
> 3. "The latest-wins async guard is now UNNECESSARY because there's no imperative race left to guard."
> 4. The implementer kept `TreeWidget`'s preview FLOATING (cursor-anchored) + added the backstop, instead of making it reactive/docked like the sidebar. (Context: the user EXPLICITLY chose "keep floating, hardened" when asked — factor that in when deciding whether this is a downgrade or a sanctioned decision, but verify it isn't being used to launder a skipped generalization.)
>
> ## Your tasks (per the skill)
> - State the GENERAL FIX as one invariant that quantifies over ALL writers/hosts of the shared visible state. Decide whether the shipped change IS that, or N patches.
> - Independently ENUMERATE THE WRITERS/HOSTS of (a) `FloatingThumbnail`'s visible state and (b) the sidebar's preview state. Do NOT trust the implementer's claim that `FloatingThumbnail` now has exactly one host. Use `enumerate_writers.py` plus your own reading (grep for `FloatingThumbnail`, `thumbRef`, `.show(`, `.hide(`, `previewBoardId`, `getSnapshot`). Report the WRITER DELTA.
> - Run `grep_tells.py` over the commit message, the PR #365 body (`gh pr view 365 --json body -q .body`), and the inline comments in the diff. Report TELLS.
> - Scrutinize claim #1 SPECIFICALLY: is the sidebar pane ACTUALLY race-free by construction, or is there any path where the rendered state (`previewBoardId`, or anything the `previewSnapshot` computed reads) is written from an async continuation? Read `SidebarWidget.vue` and `useThumbnailCache.ts` and trace it.
> - Scrutinize claim #2: is "visible only within radius of anchor" a genuine invariant over all hosts, or a patch for the single remaining host? Find any `FloatingThumbnail` consumers the implementer may not have accounted for.
> - RUNTIME: a dev server is running at http://localhost:5174 (system chromium `/usr/bin/chromium`, `playwright-core` in `<worktree>/frontend/node_modules`). If you want to confirm/deny "fixed" yourself rather than trust the implementer's captured Playwright runs, drive it; otherwise mark RUNTIME as relying on the implementer's evidence and say so.
>
> Return ONLY the skill's exact output template (FRAME CHECK / GENERAL FIX / PATCH SHIPPED / DOWNGRADE / WRITER DELTA / RUNTIME / TELLS / VERDICT / WHY), filled in concretely. This will be recorded verbatim in the project's audit trail, so make it self-contained.

## Appendix B — audit report (verbatim)

> ## Hack-rationalization review: PR #365 / commit 2baf005 — "dock sidebar hover preview; harden tree thumbnail vs lost-mouseleave linger"
>
> FRAME CHECK: Out of frame. I did not write this change, and I treated the implementer's four claims as the object of suspicion, verifying each against the code and the running app rather than against the PR prose. I also re-derived the writer set with `enumerate_writers.py` + my own grep, and confirmed/denied the "fixed" claim by driving Playwright myself rather than trusting the captured runs.
>
> GENERAL FIX:   *No host may leave the hover-preview's VISIBLE state writable from an async continuation, and any preview shown imperatively must hide on the first pointer movement away from its anchor — both as properties of the shared seam, quantified over all hosts.* The shipped change satisfies both halves, by different mechanisms for the two surfaces.
>
> PATCH SHIPPED: Sidebar stops being an imperative `FloatingThumbnail` host entirely — it gets a docked reactive pane whose visible gate is a synchronous `previewBoardId` ref and whose content is a `computed` `getSnapshotSync()` read (async `getSnapshot` writes only the shared cache, never the gate). `FloatingThumbnail` keeps its one remaining host (TreeWidget, floating, untouched) and gains a seam-level 80px anchor-radius backstop on `document` `pointermove`, plus the missing ADR-0006 header and an `onUnmounted` listener release.
>
> DOWNGRADE:     None used as a discharge. The one narrowing decision — TreeWidget kept floating + hardened rather than re-docked like the sidebar — is justified by a concrete reason ("contextual to the tree": a cursor-anchored variation preview is the correct affordance there) AND was a sanctioned user choice ("keep floating, hardened"), not a discipline-word laundering a skipped generalization. The seam-level invariant still covers that host, so the narrowing did not leave the bug class open.
>
> WRITER DELTA:  Prior-rejected proposal assumed/handled 1 of 2 imperative hosts (sidebar-only generation token) → was UNDISCHARGED-HACK. Shipped change: imperative `FloatingThumbnail` hosts went **2 → 1** (sidebar removed as a host; `grep -rn FloatingThumbnail|thumbRef|.show(|.hide(` confirms TreeWidget.vue is now the sole consumer). Sidebar visible-state writers: `previewBoardId` has **exactly 1** write-site pair (`onHoverEnter` set / `onHoverLeave` clear), both synchronous; the async `getSnapshot` writes only `snapshotCache`, never the gate. `FloatingThumbnail.visible` writers: `show()` and `hide()`, both now governed by the seam invariant. No missed producer; the remaining writer is covered by a property over all writers, not a per-writer gate. (The script's broad `visible` net also flagged `PboPopover.vue` and `use-pv-animation.ts` — confirmed unrelated refs, not consumers of this seam.)
>
> RUNTIME:       Reproduced + verified, independently (my own Playwright run against localhost:5174, not the implementer's captured evidence). Sidebar: idle empty → hover fills (`CANVAS.mini-board`) → leave clears → **resurrection-race test** (hover fresh tab, leave before warm resolves, wait 600ms) stayed EMPTY = no async resurrection → tab-to-tab override works. Tree: hover shows the 150px `.floating-thumb`; a clean leave hid it via the host's fast-path mouseleave; the **lost-mouseleave repro** (remove the `.toggle-group` `<g>` under a stationary pointer → thumb stays stranded, as the bug predicts) was then **cleared by the >80px backstop** — the exact failure the change targets, fixed. Console errors observed were 401-unauthenticated-backend noise, unrelated to this change.
>
> TELLS (Step 1): None. `grep_tells.py` over the commit+diff and the PR #365 body both returned 0 co-occurrence tells (0 minimality-terms, 1 incidental named-fix cue). No minimality-word sits near a named-better-fix. The prose argues the fix UP (root-cause dissolution) rather than arguing a better fix down.
>
> VERDICT: general
>
> WHY: The change removes the bug class structurally on both surfaces rather than gating producers one at a time: the sidebar's visible gate can no longer be written asynchronously (verified — the only async write lands in the shared cache, which the gate dominates), and the one remaining imperative host inherits a seam-level visible-only-within-radius-of-anchor invariant that holds for any future caller. It is the genuine discharge of the prior run's finding — the earlier proposal fixed one of two writers; this collapses the imperative seam to one host and covers it with a property over all writers, while the second host's bug-mechanism (async resurrection) is eliminated by construction. The narrowing (tree stays floating) cites a real affordance reason and a user decision, not a discipline-word.
>
> FINDINGS BEYOND VERDICT (required):
>   - **The 80px backstop rarely fires on a clean leave, and that is by design but worth recording.** Runtime showed a ~14px jitter already hid the tree thumb — because the `.toggle-group` `<g>` is only ~19.5×14px, so any small move exits it and the host's element-level `@mouseleave` (the fast path) hides it well before the 80px radius matters. The radius is therefore a *backstop for the lost-mouseleave case only*, not the primary leave path. That is the intended composition, but it means the 80px constant is essentially untested on normal use; its real exercise is the stranded-element path, which my repro did confirm works.
>   - **The seam invariant guards a lost `mouseleave`, not a `pointerout`/scroll/blur stranding.** The backstop only hides on `pointermove` beyond radius. If the pointer is removed (touch lift, window blur) or the tree scrolls the anchor away under a stationary pointer with no subsequent move, the thumb can persist until the next move. For mouse-driven desktop use (the stated target) this is fine; nothing prevents a touch/scroll stranding from recurring, and the invariant as stated ("within 80px of anchor") silently assumes a moving pointer.
>   - **`previewSnapshot` race-freedom depends on Vue's collection-reactivity of a `ref<Map>`.** The "fills in once the warm resolves" behavior relies on `snapshotCache.value.set()` triggering re-evaluation of a `getSnapshotSync()` `.get()` inside the computed. This is correct in Vue 3 (Map mutators are tracked), and runtime confirmed it fills — but it is an implicit dependency on framework reactivity semantics that the comment asserts without naming; if the cache were ever refactored to a plain `Map` or `markRaw`, the pane would silently stop filling (still race-free, just never-populated). Worth a one-line note at the cache declaration.
>   - **Anchor stored in plain `let`, not reactive — fine, but note the contract.** `anchorX/anchorY` are module-instance `let`s read only inside the listener; correct and intentional (no reactivity needed). No issue; recording it because the WRITER DELTA script cannot see these as "writers" and a future reader might mistake them for missed reactive state.
>   - **No residual UNDISCHARGED-HACK signal.** The prior finding is genuinely discharged, not relocated: the second host was not re-gated, it was removed from the imperative seam, and the surviving host is covered by a property quantifying over all callers. The change also pulls the sidebar into an *already-existing* reactive pattern (`ChartPreviewBox`/`LibraryPreviewPane` use the identical `computed` + `MiniBoard v-if` shape), so it reduces seam variety rather than adding a one-off.

---

License: Public Domain (The Unlicense).
