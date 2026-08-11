# LYT small follow-ups (rows 1984 / 1983 / 1952)

**Delivery branch:** `lyt-small-followups`, cut from `lyt-phase2` tip
`da19708f` (verified as the actual tip — HEAD had drifted to an
unrelated dependabot-merge branch at session start; corrected by
checking out fresh from `origin/lyt-phase2` before any work began).

**Orientation read (end to end, before any claim below):**
`CLAUDE.md` (umbrella root, via system context), `frontend/CLAUDE.md`,
`frontend/tests/CLAUDE.md` (via system context), `docs/adr/0000-the-
alpha-and-the-omega-type-driven-design.md`, `docs/adr/0002-fail-
loudly.md` — all full. Item-specific: `useFixedAnchoredPopover.ts`
(full), `.claude/dispatch-reports/lyt-popover-clip-class-review.md`
(full), `.claude/dispatch-reports/next-futureblob-recovery-review.md`
(full), `.claude/dispatch-reports/lyt-toolbar-reencode-review.md`
(read for its "Note 2" / path-shift sections — the file is long; the
sections read cover everything item 3 depends on, named here per the
umbrella's own honesty-about-partial-reads discipline). Three ledger
rows (1984, 1983, 1952) queried directly via `led show` and confirmed
to match this brief's own description of each item verbatim before
any work began.

---

## Item 1 — LocalePicker clip-class routing (row 1984)

**Two questions (ADR-0000 Rule 2), asked before the fix:**

**(a) What type/discipline forecloses the class?** The class —
"a toolbar-hosted popover clipped by `.lyt-toolbar-strip`'s
`overflow-y: auto`" — was already foreclosed by
`useFixedAnchoredPopover.ts` for its three prior consumers; this item
is "does the SAME type compose with a fourth interaction shape
(click-toggle) or does it need a fork." The composable's own contract
(`open: Ref<boolean>`, doc'd as "the SAME `open` ref `useHoverPopover`
**or an equivalent open/close boolean source**") is interaction-
agnostic by construction — it only ever reads `open.value`, never
inspects what wrote it. Verified this by reading the composable's
full implementation: the single `watch(open, ...)` is the only place
`open` is read, and it branches purely on the boolean, not on any
hover-specific state. No fork was needed; LocalePicker's own
`toggle()` click-handler writes the identical `Ref<boolean>` shape
`useHoverPopover`'s mouseenter/leave pair would.

**(b) What operational lapse let it happen?** None — this was not a
lapse. The prior commission (row 1968, reviewed in
`lyt-popover-clip-class-review.md`) correctly enumerated LocalePicker
as the class's 4th member, correctly identified the interaction-shape
question as unresolved, and correctly filed it (row 1984) rather than
guessing. This item's job was to answer the filed question, not to
repair an oversight.

**Delivery:** `frontend/src/components/chrome/LocalePicker.vue` now
routes `.locale-menu` through `useFixedAnchoredPopover(open, triggerEl,
popoverEl, { align: 'left' })` — `open` is the SAME ref the existing
`toggle()`/outside-click/ESC logic already owned, untouched.
`.locale-menu`'s CSS changed from `position: absolute; top: calc(100%
+ 4px); left: 0` to `position: fixed` with `top`/`left` bound from
`popoverStyle`. `frontend/FILES.md` updated for both the `LocalePicker.vue`
row and the `useFixedAnchoredPopover.ts` consumer list (also corrected
a stale "ratified program row 1937" citation on that line to "work
item row 1968" — the number the composable's own header already
carries after a prior correction; see `lyt-popover-clip-class-
review.md` Finding 1 for why 1937 was wrong for this class of
citation).

**Witness:** `frontend/tests/integration/LocalePicker-fixed-anchor.test.ts`
(new, 6 tests) — mount-level, mirrors `EngineQueueTooltip-fixed-
anchor.test.ts`'s shape but drives `click` on the trigger instead of
`mouseenter`/`mouseleave`, so the suite doubles as the witness that
the composable's contract genuinely composes with a click-toggle open
source. Covers: listener registration on open, listener release on
click-close, listener release on unmount-while-open, scroll-triggered
recompute, and a LocalePicker-specific case no hover consumer
exercises (idempotence across an outside-pointerdown-close followed by
a re-open, since LocalePicker uniquely flips `open` from two
independent event sources — the trigger click and the document-level
dismiss listener). All 6 WITNESSED green.

**Visual re-witness:** UNEXERCISED, honestly — this commission's
isolation posture (dead-pinned ports, no live app) cannot reproduce
the clip visually, the same disposition the prior commission correctly
took for `EngineQueueTooltip`/`PboPopover`. The CSS-fact test
(`.locale-menu is position: fixed, not absolute`) and the structural-
equivalence argument (same `.lyt-toolbar-strip` ancestor, same
`overflow-y: auto`, confirmed by reading `App.vue`/`ToolbarAppCluster.vue`
directly) stand in for it, per the established precedent.

**Closure statement:**
- **Invariant:** every toolbar-hosted popover mounted inside
  `.lyt-toolbar-strip`'s clip region is anchored via
  `useFixedAnchoredPopover`, regardless of what interaction opens it.
- **Quantification universe:** the class sweep (`lyt-popover-clip-
  class-review.md`, independently re-derived by that review via a
  tree-wide grep) enumerated 4 members total; all 4 are now routed.
  No further member is known; a fifth would need to surface via the
  same sweep methodology, not this item.
- **Denomination check:** the fix is denominated in the actual
  resource that detonates — DOM containing-block participation under
  an `overflow: auto` ancestor — via the same `getBoundingClientRect()`-
  anchored formula every other consumer shares (ADR-0012 P1, no second
  copy).

---

## Item 2 — Identity-transition suppression-reset test (row 1983)

**Two questions:**

**(a) What type forecloses the class?** Already foreclosed at the code
level — `onAuthStateChange()`'s reset of `persistSuppression` /
`futureVersionUserId` is unconditional, ahead of the branch dispatch,
confirmed by reading the method in full. This item's (a) is "does a
test exist that would catch a regression of that unconditionality" —
it did not, until now.

**(b) What operational lapse let it happen?** The recovery review
(`next-futureblob-recovery-review.md` §4) named this precisely: the
builder honestly filed the gap as UNEXERCISED (correct application of
the closure-statement discipline) rather than silently leaving it
unnamed, and the reviewer supplied a draft test rather than blocking
the delivery on it. The lapse, if any, was "not yet landed," not "not
noticed" — row 1983 exists exactly to close that gap.

**Delivery:** Added a new `describe` block to the existing
`frontend/tests/integration/sync-service-future-version.test.ts` (not
a new file — the existing file is this feature's Tier-3 net and the
new case is a direct extension of its scope). Adapted from the
reviewer's proposed test with one structural change: the proposal's
snippet implicitly reused a single connected `SyncService` instance
across the logout/login; I made this explicit and load-bearing in the
comment, because a NEW `SyncService` instance per login (the shape
`loginAndConnect()`'s own two other describe blocks use) would trivially
pass without exercising `onAuthStateChange`'s reset logic at all — the
real production shape is one long-lived instance whose persistent
`watch(auth.state, ...)` reacts to every transition, and the test now
says so explicitly in its own header comment.

**Witness:** `does not leak persist-suppression across a logout/login
identity transition` — WITNESSED green (9/9 tests in the file,
8 pre-existing + 1 new).

**Red-proof:** Temporarily commented out the two reset lines in
`onAuthStateChange()` (`this.persistSuppression = { kind:
'unsuppressed' }; this.futureVersionUserId = null;`), re-ran the file:
exactly the new test failed (`expected 0 to be greater than 0` — the
suppressed carol PUT never fired), the other 8 stayed green. Restored
immediately; `git diff --stat src/services/sync-service.ts` confirmed
empty afterward. This is a real witness, not a tautology.

**Closure statement:**
- **Invariant:** persist-suppression and the pending-recovery userId
  never survive an identity transition on a live `SyncService`
  instance — the SAME instance, across login → future-version →
  logout → login-as-different-user, must resume ordinary saves for
  the new identity.
- **Quantification universe:** the transition axis tested is
  logout-then-login-as-a-different-user (the review's own named
  scenario). Re-auth-as-the-same-user and the userId-less
  authenticated edge case are not separately tested here — both are
  covered by the SAME unconditional reset-before-dispatch code path
  (verified by reading `onAuthStateChange`'s structure: the reset
  happens before the `if` that distinguishes those cases), so a
  regression of the reset would fail this test too; not filed as a
  separate gap.
- **Denomination check:** the assertion is denominated in the actual
  observable of the class — network PUT count and the typed
  `workspaceLoadState`/`workspaceSaveState` fields — not a proxy
  (e.g. reading `persistSuppression` directly, which is private).

---

## Item 3 — App.vue LYT path-key regression net (row 1952)

**Two questions:**

**(a) What type forecloses the class?** The class is "a literal path
string in `App.vue` silently stops resolving against the compiled LYT
program after a `.lyt` encoding edit reshapes the tree." The type-
level answer — making the paths themselves non-literal (e.g. deriving
every DOM-id anchor from the compiler the way `controlPanelLytPath` in
this same file already derives the control-panel Exclusive's path from
`activeLytDomIdByPath` rather than a third hand-typed literal) is a
real, larger refactor: `LYT_DOM_ID_BY_PATH_LANDSCAPE`/`_PORTRAIT` and
`lytTrackStyleOverrides` are today's two remaining hand-typed literal
sites, and eliminating them (deriving DOM ids from widget id lookups
the way `controlPanelLytPath` shows is possible) is out of this item's
scope — row 1952's own text asks for a **mechanized net** (ADR-0011
Rule 2), not the type-elimination, and re-scoping upward wasn't
authorized. Filed here as the honest (a)-answer's larger form, per
ADR-0000's "filed, not buried" exception — a natural follow-up, not
committed to in this item.

**(b) What operational lapse let it happen?** Named explicitly by the
toolbar-reencode review's Note 2: the frontend Vitest suite passed
3050/3050 both before and after the actual 2.3→2.2 regression, which
was caught only by an ad hoc Playwright probe that isn't a CI gate.
The lapse was the absence of any mechanism connecting App.vue's
literals to the compiler's own path space — exactly what this item
mechanizes.

**Delivery:** `frontend/tests/unit/lyt-path-key-regression.test.ts`
(new). Both sides of the check are derived from real sources, not
hand-transcribed:
- **Real path set:** a recursive walker (`collectLytPaths`) over the
  SAME typed `LYT_LANDSCAPE`/`LYT_PORTRAIT` data `App.vue` imports
  from `lyt-layout.gen.ts`/`lyt-layout-portrait.gen.ts`, collecting
  every `path` field from both Split children and Exclusive children
  (verified `'2.2.1'` — the control-panel Exclusive node's own path —
  is real data by reading the gen file directly, not assumed).
- **Literals in use:** source-scanned out of `App.vue`'s raw text via
  regex (the same source-scan approach `LytNode-exclusive-rendering.
  test.ts`'s single-tab-implementation proof already uses as
  precedent in this tree) — the two `Record<string,string>` map
  declarations and the two remaining literal sites inside
  `lytTrackStyleOverrides` (the `treePanelPath` ternary and the
  landscape-only `'2'` OUTER-bar override key).

Five assertions: a sanity check that the walker produced a non-trivial
set (guards against a silently-vacuous pass), then one check per
literal site (LANDSCAPE map, PORTRAIT map, `treePanelPath` ternary,
OUTER-bar key) against its own class's derived path set.

**Red-proof:** Temporarily aliased `LYT_DOM_ID_BY_PATH_LANDSCAPE`'s
`'2.2'`/`'2.2.0'`/`'2.2.1'` keys back to the OLD `'2.3'`/`'2.3.0'`/
`'2.3.1'` numbering — precisely the shape of the incident this test
exists to catch. Re-ran: the LANDSCAPE-map assertion failed with a
named-path error message (`references path "2.3", which does not
exist in the compiled LYT_LANDSCAPE program`); the other 4 assertions
stayed green (they don't touch the aliased map). Restored immediately;
`git diff --stat src/App.vue` confirmed empty afterward.

**Closure statement:**
- **Invariant:** every literal LYT dotted-path string `App.vue`
  references resolves against the currently-compiled program for its
  own screen class.
- **Quantification universe:** covers the two DOM-id maps and
  `lytTrackStyleOverrides`'s two literal sites — the complete
  enumeration of `App.vue`'s own literal-path call sites as of this
  delivery (grepped: `LYT_DOM_ID_BY_PATH_PORTRAIT`,
  `LYT_DOM_ID_BY_PATH_LANDSCAPE`, `lytTrackStyleOverrides` are the only
  three declarations in the file containing a bare dotted-path string
  literal; `controlPanelLytPath`/`lytExclusiveActiveByPath` are
  correctly excluded — they're DERIVED, not literal, per the file's
  own P1 comment). A future literal path site added to App.vue is
  **not automatically covered** — named as not covered, per ADR-0000's
  2026-07-02 amendment: this net catches today's four literal
  sites reliably; a fifth added later needs its own line added to this
  test (or, better, the (a)-answer above — deriving instead of
  typing — which would foreclose the class instead of enumerating it).
- **Denomination check:** both sides of every comparison are pulled
  from real sources at test-run time (the actual `.gen.ts` data, the
  actual `App.vue` source text) — no bare literal duplicated by hand
  on either side, so a future regeneration is what the test compares
  against.

---

## Gates (foreground, memory-capped, literal exit codes, no pipes)

```
$ cd frontend && nice -n 19 npm run build
✓ 1245 modules transformed.
✓ built in 2.22s
BUILD_EXIT:0
```

```
$ cd frontend && NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2 \
    VITEST_MAX_FORKS=2 nice -n 19 npm run test:run
Test Files  253 passed | 3 skipped (256)
     Tests  3136 passed | 8 skipped (3144)
TEST_EXIT:0
```

```
$ npx eslint src/components/chrome/LocalePicker.vue \
    tests/integration/LocalePicker-fixed-anchor.test.ts \
    tests/integration/sync-service-future-version.test.ts \
    tests/unit/lyt-path-key-regression.test.ts \
    src/App.vue src/services/sync-service.ts
0 errors, 3 warnings (test files ignored by the project's eslint config
— an existing, pre-established pattern, not new)
ESLINT_EXIT:0
```

Bans swept on every touched CSS block (`git diff | grep -iE
"box-shadow|transition|blur\(|backdrop-filter|--text-0|#[0-9a-f]{3,6}"`):
no hits. No new ports contacted; no dev server, no Playwright — all
work is unit/integration-test-level, per each item's own witness
scope.

## Documentation-graph audit

- `frontend/FILES.md`: updated (LocalePicker.vue's row, the
  `useFixedAnchoredPopover.ts` consumer list + citation correction).
  No new `src/` files were created (only test files, which FILES.md
  doesn't track per its own "every TypeScript and Vue source file
  under `src/`" scope).
- `FEATURES.md`: correctly untouched — none of the three items change
  a user-facing capability (LocalePicker's clip fix is invisible
  robustness; the other two are test-only additions).
- `docs/doc-graph.json`/`.md`/`-report.md`: correctly untouched — no
  `docs/` file was added, removed, or re-cross-referenced by this
  delivery.
- Ledger rows 1984/1983/1952 left `open` — the codebase's own pattern
  (traced through every review doc read for this brief) is
  build-report → independent review → ledger close; self-closing a
  work item without a review witness isn't this session's call to
  make.

## Commit / merge-base

Committed on this worktree's own branch `lyt-small-followups`, cut
from `lyt-phase2` tip `da19708f`. Commit sha and final merge-base vs.
`lyt-phase2`'s current tip are recorded below, checked at the very end
of this session after a fresh `fetch`.
