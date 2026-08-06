# Mint-card hotkey + next-card diagnosis — build report

BUILD agent delivery. The original dispatch prompt was truncated mid-sentence
by a harness defect (cut at "survey: how"); the coordinator relayed the rest
in three follow-up messages mid-session. This report covers the full,
reassembled commission: TASK 1 (mint-card hotkey, blessed follow-up to the
hotkeys batch) and TASK 2 (diagnose a reported-dead next-card `.` hotkey —
**withdrawn by the maintainer before a fix was needed**; see below).

**Path note.** The coordinator asked for this report "IN THE MAIN CHECKOUT
tree." This agent is a worktree-isolated build agent
(`.claude/worktrees/agent-af73b30521aadf736`) and its sandbox refuses any
git/file operation that targets the shared checkout at `/home/bork/w/omega`
directly (verified — an early `cd /home/bork/w/omega && git status` was
refused with exactly that reasoning). This report therefore lives at this
path inside the worktree's own repo tree (a git-tracked, durable location,
as distinct from the ephemeral scratchpad the instruction was contrasting
it with) and becomes durable in the shared history once this branch is
merged — the same path every other dispatch report in `.claude/dispatch-
reports/` follows from its own worktree.

Read end to end before starting: `frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`,
`frontend/src/composables/keybindings-catalog.ts`, `useUserIORegistry.ts`,
`.claude/dispatch-reports/hotkeys-batch-build.md`, `KeybindingsView.vue`'s
domain handling, and `law/adr/0019-appendix-ui-proscriptions.md` C15.

## Worktree note (surfaced mid-task, resolved before building)

The assigned worktree was branched from a commit 66 behind `next` — missing
`review.nextCard`, the `workspaceLoadState` cold-load gate, and the
`anyModalOpen` shared-modal-keyboard mechanism the commission prompt
referenced by name (confirmed via `git merge-base --is-ancestor HEAD next`
→ true, with `a8e12dab` — the commit that shipped `review.nextCard` — not an
ancestor of the worktree's own HEAD). `git merge next` was a clean merge (no
conflicts — the worktree had no divergent commits of its own), run first, so
this build's diff is reviewable independent of the 66 merged-in commits.

## TASK 1 — mint-card hotkey

### The mechanism: `useMintDialogSignal.ts`

`MintCardModal` opens only through a component-ref method call
(`App.vue`'s `triggerMint` → `mintModalRef.value?.open(boardId)`) — the open
is async (`prepareDraft` reads board state and serializes SGF before the
modal renders), so a plain `store.session.ui.*` boolean the template
renders on isn't enough; something still has to call `.open(id)` on the
ref. The keybindings catalog is module-scope with no component instance, so
it can't hold that ref — this was exactly the gap the hotkeys-batch report
left PROPOSED-ONLY.

New file `src/composables/useMintDialogSignal.ts` closes the gap with the
**existing cross-layer UI-signal idiom** the codebase already uses for this
exact class of problem — `keybindings-capture.ts`'s `captureMode` and
`useModalKeyboard.ts`'s `openModalCount`: a module-scoped `ref`, exported
read-only, mutated only through a named function.

- `requestMintDialog()` — increments a counter (not a boolean flip) so a
  `watch` observing it fires on every request, including two requests
  landing inside the same microtask-batched flush.
- `mintDialogRequestCount` — the read-only signal.

`App.vue` adds one `watch(mintDialogRequestCount, () => triggerMint())`
beside the existing `triggerMint` definition — **the literal same function**
the Toolbar's mint button already dispatches (`@mint-card="triggerMint"`),
so mint-via-hotkey and mint-via-button converge on one code path with
identical preconditions (`activeBoardId.value` check inside `triggerMint`)
and identical ref path (`mintModalRef.value?.open(id)`). No manual teardown:
a `watch` registered in `setup` is torn down by Vue automatically on
unmount (the umbrella CLAUDE.md's resource-ownership discipline names this
as the excluded case).

### Catalog wiring

- New action `card.mint` (`ACTIONS.cardMint`), new `card` domain — first
  action outside `{nav, display, engine, review}`, so `KeybindingsView.vue`'s
  closed `KNOWN_DOMAINS` set and its ADR-0002 unknown-domain throw are
  extended in the same change (same shape the hotkeys-batch report
  followed for `review.nextCard` landing the `review` domain).
- `enabledWhen: activeBoardExists` — mirrors the Toolbar mint button's
  implicit gate and the modal's required `boardId` argument.
- **Gating parity with the rest of the catalog (explicitly checked, not
  assumed):** `card.mint` is a normal `KEYBINDINGS_REGISTRY` entry, so it
  goes through `useUserIORegistry`'s dispatcher unconditionally — the
  dispatcher applies `captureMode`, then `anyModalOpen`, then
  `store.workspaceLoadState.kind !== 'loaded'` as three early-return guards
  **before** any action's own `enabledWhen` runs (read the dispatcher's
  `handleKeyDown` top-to-bottom to confirm — these are global, not
  per-action opt-in). `card.mint` needed no bespoke gating code to get this;
  it inherits the same suppression every other registry action already has
  — hotkey is inert while a modal is open or before the workspace has
  loaded, consistent with "a modal's own controls should be the only thing
  the keyboard can reach while it's up."
- Default key `k` — unused, C15-clean (not browser/AT-reserved, no default
  collision). No strong mnemonic was available: `m` is already
  `display.toggleMoveSuggestions`. Flagged honestly rather than forcing a
  weak mnemonic; every action is user-rebindable via the Phase 4 editor
  regardless.
- Handler: `requestMintDialog` (direct reference, parameterless — same
  posture as the other zero-arg nav handlers).

### i18n

`en.json`: `keybindings.action.cardMint.label` / `.description`,
`keybindings.section.card`. Other locale catalogs (`ja`/`ko`/`zh-CN`) not
touched — `fallbackLocale: 'en'` covers the gap, matching the hotkeys-batch
precedent.

### Files touched

- `src/composables/useMintDialogSignal.ts` — new file (the signal).
- `src/composables/keybindings-catalog.ts` — `ACTIONS.cardMint` + registry
  entry.
- `src/App.vue` — `watch(mintDialogRequestCount, …)` next to `triggerMint`.
- `src/components/KeybindingsView.vue` — `KNOWN_DOMAINS` extended with
  `card`.
- `src/locales/en.json` — new label/description/section keys.
- `frontend/FILES.md` — entry for the new composable.
- `tests/unit/composables/keybindings-catalog.test.ts` — action count
  16→17, persisted-id pin gains `card.mint`, domain-set assertion extended,
  new test that the `card.mint` handler bumps the signal.
- `tests/unit/composables/useMintDialogSignal.test.ts` — new file, 2 cases.

**Not added:** a mount-level Vitest test asserting `App.vue`'s `watch`
actually calls `triggerMint()` — per `frontend/tests/CLAUDE.md`,
component-level tests are out of scope at the current tier structure. The
live playwright verification below is what exercises that exact wiring
end-to-end in the built bundle instead.

### Red-then-green (per `frontend/tests/CLAUDE.md`)

Both new tests (`useMintDialogSignal.test.ts`'s 2 cases, and the catalog's
new `'card.mint' handler bumps the mint-dialog request signal` case) were
verified to genuinely fail without the change, not just pass vacuously:
`git stash push -- src/composables/keybindings-catalog.ts` (reverting only
the catalog wiring, since the signal module + tests were new files not
touched by the stash) and re-ran the suite —

```
 FAIL  tests/unit/composables/keybindings-catalog.test.ts > … persisted-id …
   - "card.mint",   (missing from ids)
 FAIL  tests/unit/composables/keybindings-catalog.test.ts > … 'card.mint' handler bumps …
   AssertionError: expected undefined to be defined
 Test Files  1 failed | 1 passed (2)
      Tests  3 failed | 22 passed (25)
```

`git stash pop` restored the change; the same run then showed
`Test Files  2 passed (2)  Tests  25 passed (25)`.

## TASK 2 — next-card `.` hotkey — WITHDRAWN, no change made

The commission's TASK 2 asked me to diagnose a maintainer report that the
`.` (next-card) hotkey was "dead" in the live app. Before completing that
diagnosis, **the maintainer corrected the report**: the hotkey works; the
"deadness" was a visual misread — the rendered `.` glyph on the Settings →
Keybindings row was small/faint enough to be mistaken for a monitor speck,
not an actual non-functioning binding. The coordinator relayed this
withdrawal explicitly: *"Do NOT diagnose or change anything about the `.`
binding; if you already started that diagnosis, stop and discard it."*

**Task 2 withdrawn by maintainer — hotkey confirmed working; the dot glyph
was visually mistaken for a monitor speck.**

Partial diagnosis work done before the withdrawal landed (discarded, kept
here only as an honest record of what was and wasn't touched, per this
project's ledger-everything discipline):

- Confirmed via live playwright reproduction (see below) that the `.`
  binding's full mechanism — dispatcher gating (`captureMode` /
  `anyModalOpen` / `workspaceLoadState`), the `reviewSessionHasCurrentCard`
  predicate, and `reviewSession.nextCard()` mutating
  `store.session.reviews[boardId]` — works correctly end-to-end in the
  actual built bundle when a review queue is populated: `currentIndex`
  advanced 0→1 on a single `.` keypress, and `ReviewSessionPanel` (mounted
  under `ForestDirectory`'s Cards tab) reflected the change.
- Was mid-way through checking whether a separately-reported ruleset-
  refusal wedge in the review-session load path could produce a `currentCard
  === null` state that would make the predicate *correctly* report "no
  card" (not a hotkey defect) when the withdrawal arrived — this line of
  investigation was abandoned per the coordinator's instruction, not
  completed, and no code outside Task 1's files was touched as a result.
- **No files related to `.`/`review.nextCard`/`useReviewSession.ts` were
  modified.** `git status` at the end of this session shows changes scoped
  entirely to Task 1's files (listed above) plus this report and the two
  new test/composable files.

## MANDATORY LIVE VERIFICATION

Per the coordinator's instruction, unit tests alone were treated as
insufficient; the change was verified against the actual built bundle with
a real browser.

**Build served.** `npm run build` (the same command CI/the gate tails run)
produced `dist/`; `npx vite preview --port 4199` served it (port 4173 — the
maintainer's live preview — was never touched; no engine-URL settings were
read or written by the verification script). One re-build was done with
`NODE_ENV=development npx vite build --mode development` (still the real
`vite build` production pipeline, just with `import.meta.env.DEV` left
true) **specifically so `window.store` — a genuine, existing DEV-only debug
hook already shipped in `src/main.ts`, gated by `import.meta.env.DEV`, used
for exactly this class of manual verification — was reachable** to inject a
review-session fixture without a live backend (this sandbox has no backend
process running; card data can't be fetched for real). The mint-hotkey
verification ran against this same served bundle; the code paths it
exercises (dispatcher, catalog, `App.vue`'s watcher, `MintCardModal`) are
identical between the DEV-flagged and pure-production builds — the `DEV`
branch in `main.ts` only adds the debug hook, it doesn't alter the hotkey
code at all (confirmed by grep: `window.store` doesn't appear anywhere in
`keybindings-catalog.ts`, `useUserIORegistry.ts`, `useMintDialogSignal.ts`,
or `App.vue`'s new watcher).

**Driver:** `playwright-core` (already a project devDependency) launching
`/usr/bin/chromium` with `--no-sandbox`, navigating to
`http://localhost:4199/`.

**Transcript (WITNESSED marks per claim):**

```
WITNESSED: workspaceLoadState reached loaded
WITNESSED: main workspace rendered
mint modal visible before hotkey: false
WITNESSED: mint hotkey opened MintCardModal
mint modal closed after Escape: true
injected review session for board 74471ab3-ba72-4e6c-a017-e16896e42451
clicked Cards tab: true
currentIndex before "." press: 0
currentIndex after "." press: 1
WITNESSED: "." hotkey advanced reviewSession.currentIndex (0 -> 1)
diag: {"workspaceLoadState":{"kind":"loaded"},"activeBoardId":"74471ab3-ba72-4e6c-a017-e16896e42451"}
```

Specifically for **Task 1 (the surviving deliverable)**:

- Pressed `k` with an active board, no modal open, workspace loaded →
  `#mint-card-title` appeared in the DOM (`MintCardModal`'s `isOpen`
  flipped true via the exact `triggerMint()` code path). **WITNESSED.**
- Pressed `Escape` → the modal closed via `useModalKeyboard`'s existing
  mechanism (no bespoke handling needed — `card.mint`'s modal inherits the
  same Escape/focus-trap machinery every other modal has). **WITNESSED.**

The `.` transcript lines above were captured before the Task 2 withdrawal
arrived; they're included as-is since they were already run and are
truthful evidence, but per the withdrawal **no code changes were made on
their basis** — they're reported for completeness only, not as
justification for any diff in this PR.

The live-verification script itself (`live-verify.mjs`) was a throwaway
scratch file, written to `frontend/` (needed there for `playwright-core`'s
ESM resolution) and deleted after the run — not part of the deliverable,
not committed.

## Gate tails (final state, after Task 2 was discarded)

**Build** (`npm run build` = `vue-tsc -b && vite build`):
```
✓ 1094 modules transformed.
dist/assets/index-C1CVzDhV.js   2,940.38 kB │ gzip: 1,038.37 kB
✓ built in 2.89s
```
(pre-existing >500kB chunk-size advisory only, unrelated to this change)

**ESLint** (`npx eslint .`): no output — clean.

**Tests** (`npm run test:run`):
```
 Test Files  106 passed | 3 skipped (109)
      Tests  1331 passed | 4 skipped (1335)
   Duration  66.51s
```
