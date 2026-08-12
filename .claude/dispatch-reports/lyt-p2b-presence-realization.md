Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).

# LYT presence arc P2b — the presence realization arc

Commission: P2b, `lyt-phase2`, frontend side. Base `ce6cc1e8`.

## Base freshness (FIRST ACT)

`git fetch origin` resolved `origin/lyt-phase2` to `ce6cc1e8` — exactly
the base commit named in the commission (`git merge-base --is-ancestor
ce6cc1e8 origin/lyt-phase2`, exit 0). This agent's own isolated
worktree started on an unrelated branch (`worktree-agent-
a16f4ea95c8aa862a`, tip `3378806f`, NOT an ancestor of `ce6cc1e8`). The
literal branch name `lyt-phase2` was unavailable (already checked out
in the shared main checkout, `/home/bork/w/omega`) — the same
disclosed-deviation shape every prior LYT stage report in this
directory uses — so a new branch, `lyt-phase2-p2b`, was cut directly
from `origin/lyt-phase2`. `git merge-base --is-ancestor ce6cc1e8 HEAD`
re-confirmed exit 0 immediately after.

## Orientation reading (end to end, per ADR-0002/CLAUDE.md)

`.claude/dispatch-reports/lyt-p2a-presence-contract.md` (433 lines,
full — its per-consumer audit, findings 1-3, is this session's own
work list), `lyt-p1-presence-model.md` (375 lines, full),
`lyt-boot-restoration.md` (405 lines, full — the A_setup interim
shape's own disclosed scope call), `frontend/src/components/chrome/
LytNode.vue` (596 lines pre-change, full), `frontend/src/App.vue`
(1608 lines pre-change; the presence/exclusive/corner-chrome sections
read in full, the rest consulted as needed for wiring points named by
the sections above), `frontend/src/store/defaults.ts` +
`frontend/src/store/migrations.ts` + `frontend/src/store/schema.ts`
(the `lytPresence`/migration-75-76 sections read in full),
`frontend/src/composables/chrome/useLytPresenceMenu.ts` (183 lines,
full), `frontend/src/composables/chrome/useFixedAnchoredPopover.ts`
(194 lines, full), `frontend/src/composables/chrome/
usePopoverEdgeClamp.ts` (147 lines, full — consulted once the
`useFixedAnchoredPopover` deviation below was found necessary),
`frontend/src/components/chrome/BoardRailPopoverTrigger.vue` (163
lines, full — the closest existing "trigger + popover, absent-widget"
idiom), `frontend/src/components/chrome/EngineQueueTooltip.vue` (353
lines, full — a `useFixedAnchoredPopover` consumer), `frontend/src/
components/chrome/SetupToolPalette.vue` (354 lines, full — needed to
resolve the A_setup "trigger/body split" instruction against its own
already-built internal trigger/body shape), `frontend/src/
composables/chrome/useLytProgramIndex.ts` (110 lines pre-change, full).
The umbrella `CLAUDE.md` and `frontend/CLAUDE.md` (both already in
context per this session's system prompt) were consulted for the
disciplines cited below.

## THE WORK

### 1. Class-aware presence defaults (portrait false / landscape true)

**Diagnosis, confirmed against `store/schema.ts`'s own doc comment**:
`session.ui.lytPresence: Record<string, boolean>` ALREADY encodes "user
chose X" vs. "never chose" structurally — a key's ABSENCE is not seeded
as a distinct state; every reader falls back to the widget's own
default. No new type or schema field was needed for this distinction —
it existed from day one. The bug was narrower: two call sites
UNCONDITIONALLY wrote/read a class-UNAWARE literal `true` where the
underlying fact (`controlPanel`'s own compiled `presenceDefaultVisible`)
genuinely varies by screen class since P2a (landscape `true`, portrait
`false`, repetition-first):

- `defaults.ts`'s `defaultSessionUI.lytPresence` used to SEED
  `controlPanel: true` for every brand-new session, baking a
  landscape-only fact into the persisted blob from birth — fixed by
  dropping the key entirely (`{ boardRail: false, previewBoard: false
  }`), letting it fall through to the compiled program's own per-class
  default like every other unmentioned key already does.
- `useLytPresenceMenu.ts`'s `LYT_PRESENCE_DEFAULT.controlPanel` (the
  fallback consulted when the persisted key is absent) was a hardcoded
  `true` literal. New optional `classDefaults` constructor option
  (`Ref<Partial<Record<LytPresenceTargetId, boolean>>>`), consulted
  FIRST, falling back to the static literal only for a target it
  doesn't mention — real callers (App.vue via `LytPresenceMenu.vue`'s
  new `classDefaults` prop) supply the ACTIVE class's own resolved
  default; bare callers (this file's own pre-existing unit tests) get
  the unchanged old behavior.
- New `useLytProgramIndex.ts` field, `widgetDefaultVisible: Record<
  string, boolean>` — the walk now also captures each widget's own
  wrapping `LytChild.presenceDefaultVisible`, so App.vue's
  `lytPresenceClassDefaults` computed derives the four presence-menu
  targets' per-class defaults from the SAME index `activeLytDomIdByPath`
  already resolves through (ADR-0012 P1 — one home, not a second
  derivation).

**The schema decision: NO migration for the class-aware-default half.**
The `Record<string, boolean>` shape already distinguishes "chosen" from
"unchosen" via key presence — the CLAUDE.md-mandated "think the type
through" question resolves to "the type was already right; two call
sites weren't using it correctly."

**A second, genuinely migration-shaped bug, found while auditing the
first.** Migration 75 → 76 (`lyt-w2-presence`, shipped and frozen)
itself ALSO wrote a fabricated `controlPanel: true` — `presence.
controlPanel = typeof u.controlsExpanded === 'boolean' ?
u.controlsExpanded : true` bakes `true` into EVERY already-migrated
blob whose legacy `controlsExpanded` was absent/non-boolean,
indistinguishable from a genuine choice from that point forward. Per
`migrations.ts`'s own header ("bugs in a shipped migration are
addressed by adding a NEW migration later that compensates," never by
editing the frozen body), a new **migration 76 → 77** was added:
deletes `lytPresence.controlPanel` when it is exactly `true` (restoring
the "never chose" absent-key state so the class-aware default can reach
it again), leaves it completely untouched when `false` (an unambiguous
real signal — no migration or default path ever fabricates `false`).
Disclosed, bounded cost: a genuine minority who had explicitly
re-toggled the panel back ON post-76 needs one more toggle in portrait
to restore it — accepted in exchange for the class-aware default
reaching the overwhelming common case (users who never touched the
setting). `CURRENT_SCHEMA_VERSION` bumped 76 → 77. Per the frontend's
rolling-archive discipline (exactly two migrations live in the active
body), the 74 → 75 body was moved verbatim into `archived-migrations.ts`
in the same change (a pure cut-and-paste, body frozen, header comment
traveling with it) to keep the active file at its steady-state two.
`A_setup` needed no migration at all — it was never seeded by any prior
schema version (its App.vue-level force-override, below, lived entirely
outside `session.ui.lytPresence`).

### 2. LytNode presence for Exclusives

Confirmed directly (`lyt-layout-types.ts`'s own `LytExclusiveNode`):
the compiled node already carries a representative `widget` id
(`"controlPanel"`) for DOM-id anchoring — P2a's own consumer audit
named this exact gap (finding 1): `widgetIdOf` returned `null` for BOTH
`'split'` and `'exclusive'` kinds, so `isPresent` always returned
`true` for an Exclusive regardless of `presenceOverrides`/
`presenceDefaultVisible`. Fixed: `widgetIdOf` now resolves
`child.node.widget` for every kind except `'split'` — a Split still has
no such identity (independently-addressable siblings, not
alternatives sharing one rectangle, the same distinction P1's own
`@demote` widening drew at the language layer). The Exclusive
template branch's content is now gated (`v-if="isPresent(...) ||
isExclusiveSummoned(...)"`) instead of unconditional, matching a
toggled-off leaf's own unmount-when-absent release semantics.

### 3. Control-panel popover at demoted/absent sizes

**Mechanism**: rather than duplicating the Exclusive's own tab-strip +
body markup a second time for a popover mount (ADR-0012 cancer B/E),
the SAME markup is conditionally `<Teleport>`ed. Two new LytNode props,
forwarded verbatim like every other cross-cutting prop:
`exclusivePopoverOpen: Record<string, boolean>` (widget id → summoned)
and `exclusivePopoverTarget: HTMLElement | string` (the Teleport
destination). `:disabled="isPresent(...)"` renders in place
(byte-identical to pre-P2b behavior) whenever present; when absent,
content relocates into the target ONLY while summoned — otherwise not
rendered at all (unmounted, matching a leaf's own release semantics).

**Summon affordance**: a new corner-chrome trigger button
(`#control-panel-summon-btn`, `#lyt-corner-chrome`, gated
`v-if="!controlPanelIsPresent"` so it only appears when the grid
genuinely doesn't already show the panel) opens/closes a session-local
(never persisted — "dismissal restores the demoted state" per the
commission) popover panel nested inside the trigger's own wrapper,
matching `BoardRailPopoverTrigger.vue`'s established "second popover at
this corner" shape. Dismiss: re-click the trigger, click outside
(document pointerdown, same idiom as `LocalePicker.vue`/
`LytPresenceMenu.vue`/`BoardRailPopoverTrigger.vue`), or Escape.

**Disclosed deviation from the commission's own naming, with
evidence.** The commission named `useFixedAnchoredPopover` as the
popover composable. Tried first, exactly as instructed — and
empirically FAILED at this trigger's own position, caught directly by
the screenshot witness rig: that composable's `top: triggerRect.bottom`
anchor opens the popover DOWNWARD from the trigger; since the trigger
sits at the viewport's own fixed bottom-right corner
(`#lyt-corner-chrome`), the composable's own viewport-bottom clamp then
pulled the popover back UP, directly over the trigger button itself —
`page.click('#control-panel-summon-btn')` timed out with Playwright
reporting the button occluded by its own just-opened popover (full
transcript: `/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-
af2d-e1dbe81eefc9/scratchpad/lyt-p2b-rig/shoot2.log`, not committed —
scratch). `useFixedAnchoredPopover`'s own stated purpose (escaping an
`overflow: auto` CLIPPING ANCESTOR) doesn't even apply here either:
`#lyt-corner-chrome` is already `position: fixed`, outside any such
ancestor — exactly like its two siblings at this same corner
(`BoardRailPopoverTrigger.vue`/`LytPresenceMenu.vue`), both of which
already use `usePopoverEdgeClamp` + a `bottom: 100%` CSS anchor (opens
UPWARD, away from the viewport edge) instead. Switched to that idiom;
re-ran the witness rig, which then completed the summon → tab-switch →
dismiss sequence cleanly (see "Witness" below). This is a genuine
engineering correction made on direct evidence, not a stylistic
preference — flagged prominently per this arc's own "disclosed
narrowing" discipline.

**A second popover-adjacent finding, disclosed, not fixed**: the inner
tree/control-panel resizer bar (`#resizer-inner`, the
`#exclusive-controlPanel` slot's own content) rides along with every
Teleport of the control panel's content, since LytNode's Exclusive
branch relocates the WHOLE slot, not just `TabWidget`. Its drag
affordance assumes the grid's own `#control-panel`-relative geometry,
which the popover doesn't reproduce. Fixed defensively with a narrow
CSS rule (`.control-panel-popover #resizer-inner { display: none; }`)
rather than threading a "suppress the resizer in popover mode" prop
through LytNode — grid and popover mounts are mutually exclusive by
construction, so the selector only ever hides the one instance that
exists at a time.

### 4. A_setup trigger/body split

Read `SetupToolPalette.vue` in full: it ALREADY implements its own
internal trigger (`.setup-trigger`, always rendered) + body
(`.setup-palette`, toggled via `visibility: hidden`, its own
`paletteOpen` state) split — the "reflow, FIXED" G6 fix already
established this shape; nothing about that component needed to change.
What the boot-restoration's own interim shape actually left open was
narrower: App.vue's `lytPresenceOverrides` unconditionally forced
`A_setup: true`, permanently shadowing the compiled program's own
`presenceDefaultVisible: false` (a genuine `@toggle(user, release)`
release toggle per ruling row 2108) with no way to turn it off and no
presence-menu entry — resolved by RETIRING that force-override and
wiring `A_setup` as the 4th `useLytPresenceMenu.ts` target (item 5).
The whole `A_setup` LEAF (SetupToolPalette's own trigger-and-body unit,
unchanged) now mounts/unmounts per real presence resolution, default
off in both classes (matching `boardRail`/`previewBoard`'s own
convention), sovereign to the user's own choice once made.

### 5. Presence menu — four targets, class-aware, sovereign

`LYT_PRESENCE_TARGETS` — `['boardRail', 'previewBoard', 'controlPanel',
'A_setup']`. `LytPresenceMenu.vue` gained a `classDefaults` prop
(threaded from App.vue's `lytPresenceClassDefaults`, itself derived
from `activeLytProgramIndex.widgetDefaultVisible`). New locale keys:
`app.chrome.presence.A_setup` ("Setup Tools"),
`app.chrome.presence.controlPanelSummon` ("Open Control Panel") — added
to `en.json` only; `ko`/`ja`/`zh-CN` are pre-existing partial catalogs
that fall back to English for keys they don't carry (grepped first;
confirmed this is the established pattern, not something this session
introduced).

## Screenshot witness

Isolated rig: backend `127.0.0.1:19400`, frontend dev server
`127.0.0.1:19401`, KataGo WS placeholder `19402` (pinned, never
contacted). All three probed dead (`nc -z`) before use; none of the
forbidden ports (4173/5173/5174/8764/1235/1242/195xx) were touched.

- **Backend**: the main checkout's shared venv
  (`/home/bork/w/omega/backend/venv/bin/python`; this worktree ships
  none of its own) `-m fastapi run backend/main.py --host 127.0.0.1
  --port 19400`, `DATABASE_URI=sqlite+aiosqlite:///<COPY of
  backend/samples/cards.sample.db>` (`cards.rig.db`, under this
  session's own scratch dir — never the real `cards.db`).
  `QEUBO_ENABLED=false`.
- **Theme**: the DB copy's `documents` row (`key='user_workspace_01'`)'s
  `profile.settings.appearance.theme` rewritten `'dark'` → `'cluster'`
  (the light-background theme) via a direct sqlite3/Python write,
  verified by re-reading the row after the write. Playwright's own
  `colorScheme: 'light'` context option forced the second half of the
  mandate. Every real screenshot confirms `data-theme="cluster"` and
  `background-color: rgb(255, 245, 255)` live.
- **Frontend**: `vite --port 19401 --host 127.0.0.1 --strictPort`, run
  from inside `frontend/` (the established footgun-avoidance precedent
  every prior LYT report in this directory names). `frontend/
  node_modules` symlinked from the main checkout (byte-identical
  `package-lock.json` diffed first), removed again after this
  session's gates.
- **Playwright**: `systemd-run --user --scope -p MemoryMax=4G -- nice
  -n 19 node --max-old-space-size=1024 shoot.mjs`, chromium launched
  with `executablePath: '/usr/bin/chromium'` and
  `args: ['--js-flags=--max-old-space-size=1024']`, one browser
  instance per shot, closed in a `finally`. No wall-clock waits — every
  wait is `waitForSelector`/`waitForFunction`/`waitForResponse`
  (the persisted-blob save round trip is awaited via the real
  `PUT /documents/{docKey}` response, not a fixed delay before reload).

**Captures** (saved under this session's own scratch directory,
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-
e1dbe81eefc9/scratchpad/lyt-p2b-rig/`, not committed — established LYT
convention):

- `landscape-1920x1080.png` — control panel present in-grid (Cards tab
  active, real board/tree render), no summon trigger button present.
  Unchanged from pre-arc behavior, as required.
- `portrait-768x1024.png` / `portrait-420x880.png` — board + tree +
  toolbar render; control panel genuinely ABSENT (no `#control-panel
  [role="tablist"]` in the DOM at all, confirmed via direct query, not
  merely visually hidden); the summon trigger button IS present. Tree
  panel's own live rect: `140×140` at both sizes (a pre-existing,
  disclosed, OUT-OF-SCOPE gap — see "STOP-and-report" below for why
  this isn't a horizontal rect and isn't this arc's own regression).
- `portrait-768x1024-popover-open.png` — the summon trigger clicked;
  popover open with the full tabbed control panel (Library/Cards/
  Settings/Analysis/Other) genuinely functioning — default-active tab
  is "Cards" (this rig's own seeded `session.ui.activeTab` default,
  `defaults.ts`), not a placeholder.
- `portrait-768x1024-popover-tab-switched.png` — a second tab clicked.
  Byte-identical to the prior shot: the rig's own script clicked
  `tabs[1]`, which coincided with the already-active "Cards" tab (tab
  order is library/cards/settings/analysis/other; the seeded default is
  "cards") — an uninteresting coincidence in THIS rig's own fixture
  state, not a defect. Real tab-switching is asserted directly (a
  genuinely different tab, `aria-selected` transition) in the automated
  witness — `tests/integration/App-boot.test.ts`'s own P2b describe
  block — which is the load-bearing proof for this behavior.
- `portrait-768x1024-popover-dismissed.png` — re-clicked the trigger;
  popover closed (`display: none`), demoted state restored (`#control-
  panel [role="tablist"]` absent again).
- `landscape-before-toggle.png` / `landscape-after-toggle-off.png` —
  the corner presence menu opened and `controlPanel`'s checkbox
  unchecked. The persisted PUT (`sync-service.ts:584`,
  `PUT /documents/{docKey}`) was awaited directly; **HTTP 200**.
- `landscape-after-reload-toggle-persisted.png` — full page reload;
  `#control-panel [role="tablist"]` absent, `#control-panel-summon-btn`
  present — the user's own explicit choice (now `lytPresence.
  controlPanel: false`) survives the reload and is sovereign over
  landscape's own compiled default (`true`), exactly the "user-choice
  sovereignty" the commission asked to witness. **The persisted blob
  field**: `session.ui.lytPresence.controlPanel = false` (confirmed by
  the DOM facts above — the direct backend-document read this session
  attempted to add would have required a second authenticated request
  outside this rig's own guest-session cookie jar; the DOM-level
  before/after/reload triple is the load-bearing evidence instead,
  matching the automated test suite's own assertion style).

## Gates

**Frontend `npm run build`**, literal exit code:
```
$ npm run build
✓ 1249 modules transformed, built in 1.95s
$ echo $?
0
```

**Frontend `npm run test:run`**
(`NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2
VITEST_MAX_FORKS=2 nice -n 19`):
```
Test Files  257 passed | 3 skipped (260)
     Tests  3201 passed | 8 skipped (3209)
$ echo $?
0
```
(3181 pre-existing-and-green + 20 net new across this arc's own test
edits, described below — zero failures, zero weakened assertions.)

**`tests/integration/App-boot.test.ts` in isolation**: 5 passed
(2 pre-existing boot-completeness tests + 3 new P2b tests: landscape
present/no-trigger, portrait absent/trigger-present, summon → tab
switch → dismiss round trip against the FULL real App.vue mount), exit
0.

**`research/lyt` pytest** (`/home/bork/w/vdc/venvs/generic/bin/python`,
the generic venv — NOT the backend venv, which lacks `ortools` and was
tried first by mistake, caught and corrected before trusting the
result):
```
370 passed in 4.31s
$ echo $?
0
```
Untouched-green — no `research/lyt/` file was edited this session.

## Test edits, individually justified

1. **`tests/unit/store/migrations.test.ts`**: the pre-existing "walks
   end-to-end: a v75 blob reaches CURRENT" test's expected
   `lytPresence` shape updated (`controlPanel: true` literal →
   absent-key) since the full walk now also runs the new 76 → 77
   compensation. New `'76 → 77: controlPanel-fabrication compensation'`
   describe block (6 tests): deletes-when-true, leaves-false-untouched,
   leaves-absent-untouched, no-op on absent `lytPresence`/`session.ui`,
   idempotent re-run.
2. **`tests/integration/useLytPresenceMenu.test.ts`**: `LYT_PRESENCE_
   TARGETS` tuple assertion widened to the 4-target shape. Three
   existing tests that read `store.session.ui.lytPresence.controlPanel`
   directly on a fresh store updated `.toBe(true)` → `.toBeUndefined()`
   (the persisted CELL is now honestly absent; the RESOLVED default,
   asserted alongside via `menu.targets.value`, is still `true`,
   unchanged). New `'class-aware default resolution'` describe block (5
   tests): portrait/landscape class defaults resolve correctly, a
   persisted user choice wins over EITHER class default, a live class
   swap re-resolves for an untouched target, `A_setup`'s own
   class-invariant `false` default.
3. **`tests/integration/resizer-restore-clamp.test.ts`**: one
   tangential assertion (a fresh store's `lytPresence.controlPanel`,
   incidental to that test's own resizer-cap subject) updated the same
   way, with the same disclosed rationale inline.
4. **`tests/unit/lyt-d2-system-log-toggle.test.ts`**: the source-scan
   regex extracting `#lyt-corner-chrome`'s own inner markup re-anchored
   (lazy-match to the first `</div>` broke once P2b nested new markup
   inside the cluster) — now anchored on the cluster's own known LAST
   mounted element (`<SystemLogToggle />`), robust to whatever
   precedes it.
5. **`tests/integration/LytNode-exclusive-rendering.test.ts`**: two new
   describe blocks (10 tests) — Exclusive presence (absent renders no
   tablist; `presenceOverrides` can flip either direction against the
   compiled default) and Exclusive popover summon (absent+not-summoned
   renders nothing anywhere; absent+summoned relocates into
   `exclusivePopoverTarget` via a real, live-document `Teleport`;
   present ignores `exclusivePopoverOpen` and stays in its natural
   position).
6. **`tests/integration/App-boot.test.ts`**: new describe block (3
   tests, full real-`App.vue` mount, both screen classes) — the direct,
   most-convincing witness for class-aware default resolution AND
   popover summon/dismiss, described under "Gates" above.

No test was deleted or had an assertion removed without a same-fact
replacement under its new name; no test was weakened.

## Documentation audit (per CLAUDE.md's own checklist)

- **`FEATURES.md`**: updated — "Corner presence menu" now names
  control panel + setup tool palette as toggle targets and explains
  the class-aware starting point / sovereignty; "Tabs" gained the
  popover-summon paragraph; "Setup tool palette" notes its own
  default-off + presence-menu toggle. Content-only (no doc
  added/removed/renamed, no cross-reference changed) — doc-graph
  regeneration not required per the umbrella CLAUDE.md's own rule;
  not regenerated this session, disclosed rather than silently
  skipped.
- **`frontend/FILES.md`**: updated — `LytNode.vue`, `LytPresenceMenu.
  vue`, `useLytPresenceMenu.ts`, `usePopoverEdgeClamp.ts` rows describe
  the new presence/popover facts; the `lyt-widget-registry.ts` row's
  stale "A_setup disclosed always-visible override" claim corrected
  (per ADR-0002 — a doc describing retired behavior as live is itself
  a silent failure).
- **Work-status store (`todo` DB)**: not queried/updated this
  session — this dispatch report is the deliverable the commission
  named; no ledger row id was supplied to act against. If this
  commission has a corresponding `todo` row, closing it is the
  commissioning orchestrator's own follow-up.
- **`docs/dispatch/`**: not swept — out of this commission's own
  named orientation scope (the commission's own reading list did not
  include it), named here per the "check for open dispatches"
  instruction rather than silently skipped.
- **`docs/handoff-current.md`**: not touched — this arc changes
  in-app presence/popover behavior, not the orientation-level product/
  architecture framing that document carries.

## STOP-and-report items

1. **`useFixedAnchoredPopover` → `usePopoverEdgeClamp` deviation**
   (item 3 above, "Disclosed deviation"). The commission named a
   specific composable; it was tried first and empirically failed at
   this trigger's own corner position (screenshot rig transcript is
   the evidence). Switched to the composable this codebase's own two
   siblings at the identical position already use. Flagging for
   explicit acknowledgment since it is a deviation from a specific
   instruction, even though the deviation is evidenced and the
   resulting behavior (verified: summon → tab-switch → dismiss, full
   real-App.vue integration test + screenshot rig) is correct.
2. **Tree horizontal-derivation expectation not met in the live
   screenshots** — a PRE-EXISTING, disclosed, out-of-this-arc's-scope
   gap, not a regression this session introduced. `App.vue`'s own
   `activeTreeOrientation` computed (LYT R1 PART 1, its own script
   comment read in full this session) wires `TreeWidget`'s
   `orientation` prop from the compiled program's STATIC `orientation`
   field — `'v'` in BOTH classes today, since `emit_layout_tree.py`
   never threads the derivation through `orientation.rebind`. That
   comment already discloses this is the load-time undeclared default,
   not a live per-resize derivation, and names wiring the genuine
   derivation as future, out-of-that-session's-scope work. This
   session's own commission text anticipated "tree HORIZONTAL per the
   derived orientation" as an expected screenshot outcome; the live
   rig instead shows a `140×140` (visually square, effectively
   vertical-styled) tree panel at both portrait witness sizes,
   matching the ALREADY-DISCLOSED static-'v' fact, not a fresh defect.
   No change was made to tree-orientation wiring this session — it is
   squarely outside a presence-arc commission's own scope (this arc
   never touches `orientation.py`, `emit_layout_tree.py`, or
   `activeTreeOrientation` itself).
3. **`portrait-768x1024-popover-tab-switched.png` is byte-identical to
   the "open" shot** — an artifact of this rig's OWN fixture state
   (the clicked tab coincided with the already-active default), not a
   functional gap. Real tab-switching inside the popover is asserted
   directly by the automated integration test, not merely implied by
   the screenshot pair.
4. **`#resizer-inner` inside the popover, CSS-suppressed rather than
   removed from the Teleported subtree** (item 3 above) — a narrow,
   disclosed, minimal-touch fix; a cleaner long-term shape (an
   explicit "don't render the inner resizer in popover mode" prop
   threaded through LytNode) is named but not built, left for a future
   session if the current CSS-hide approach proves insufficient (e.g.
   if the hidden element's own layout box still consumes space —
   verified visually in the screenshot witness that it does not).

## Discipline notes

- No px used as bare reasoning currency — every pixel value this
  session introduced (664px popover width, 70vh/600px height cap) is a
  realization-layer sizing choice for a NEW UI surface, not a decision
  posed in place of a model-side fact; the ONE place a model fact
  mattered (the control panel's own 664px grid track width) was
  REUSED, not re-derived, for the popover's own width.
- No wall-clock sleeps — every screenshot-rig wait is a real-condition
  `waitForSelector`/`waitForFunction`/`waitForResponse`; the
  persistence-across-reload capture specifically awaits the real
  `PUT /documents/{docKey}` response rather than a fixed delay.
- No touch to ports 4173/5173/5174/8764/1235/1242/195xx or any live
  process/DB — this session's own ports (19400/19401/19402), all
  independently verified dead before use and dead again after cleanup
  (`nc -z`, both directions); `cards.rig.db` is a COPY, `cards.db`
  itself never opened.
- Style bans: no box-shadow/transitions/blur introduced (grepped this
  session's own diff — none). All new readable text uses `--text-0`.
  **Flagged, not silently complied with**: the commission's own style-
  ban list named "--surface-0 backgrounds (rows 681/742)" as banned;
  this session's own reading of `theme.css`'s rows 681/742 (read in
  full as part of this commission) found that region describes the
  TEXT-TIER icon/glyph token-category-misuse ruling, not a surface-0
  background ban — and every existing sibling popover in this exact
  chrome region (`BoardRailPopoverTrigger.vue`, `LytPresenceMenu.vue`,
  `EngineQueueTooltip.vue`, `ToolbarSliderPopover.vue`, `PboPopover.
  vue`, `LocalePicker.vue`) uses `--surface-0` for its own popover
  background, with `LytPresenceMenu.vue`'s own header literally naming
  it "the standing occlusion law." Recent git history
  (`git log --oneline | grep surface-0`) shows multiple commits
  actively MIGRATING other elements TO `--surface-0` as the corrective
  direction, not away from it. Given the direct conflict between the
  commission's literal phrase and this codebase's own current, actively
  reinforced convention, and given the commission's OWN separate
  instruction to "reuse the existing popover CSS classes" (which is
  impossible without `--surface-0`, since that is what those classes
  use), this session followed the more specific, evidenced,
  reuse-don't-invent instruction and used `--surface-0` for the new
  `.control-panel-popover`/`.control-panel-summon-trigger` rules —
  surfaced here per ADR-0002 rather than silently complying with
  either reading.
- `A_setup`'s presence-menu label ("Setup Tools") and the summon
  trigger's label ("Open Control Panel") are this session's own
  english-only mint, disclosed above under "Documentation audit."

## Commit

Committed on this worktree's own branch, `lyt-phase2-p2b` (cut
directly from `origin/lyt-phase2` at `ce6cc1e8`, the exact commit named
in this commission — see "Base freshness" above for why a
differently-named branch was needed). Not pushed/merged by this
session — that integration step is left to the commissioning
orchestrator, per this commission's own "Commit on your worktree
branch" instruction (not "push").

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source code,
so no header is added to it).
