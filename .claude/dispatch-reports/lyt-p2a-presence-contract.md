Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source
code, so no header is added to it).

# LYT presence arc P2a — closing the presence contract gap

Commission: ledger row 2358 follow-up 1. Base `dbb7d7d6` on
`lyt-phase2`.

## Base freshness (FIRST ACT)

`git fetch origin` resolved `origin/lyt-phase2` to `dbb7d7d6` — exactly
the base commit named in the commission (confirmed `git merge-base
--is-ancestor dbb7d7d6 origin/lyt-phase2`, exit 0). This agent's own
isolated worktree started on an unrelated branch
(`worktree-agent-a65523e428741f6e6`, tip `3378806f`, NOT an ancestor
of `dbb7d7d6`), so a new branch, `lyt-p2a-presence-contract`, was cut
directly from `origin/lyt-phase2` (which is itself exactly `dbb7d7d6`
— `git merge-base --is-ancestor dbb7d7d6 HEAD` now exits 0 on this
branch).

## Orientation reading (end to end, per ADR-0002/CLAUDE.md)

`.claude/dispatch-reports/lyt-p1-presence-model.md` (full, 375 lines).
Its own review artifact: searched for a separate committed review
document/ledger row (`legacy_number='2358'` in the `todo` DB — no
match; grepped `docs/`/`.claude/` for a `lyt-p1-presence-model-review`
sibling file — none exists). The commission's own "THE GAP" section,
which states it is "reviewer-confirmed," is the only artifact of that
review this session could locate; treated as the review's content
itself (read in full as part of the commission text) rather than
bluffing a citation to a document that could not be found. Also read
in full: `research/lyt/emit_layout_tree.py` (pre-change, 1074 lines),
`research/lyt/runner.py` (381 lines, in particular `valuation_for_class`
and the `lengyue_landscape+portrait` registration's
`default_valuation`/`default_valuation_by_class`),
`research/lyt/presence.py` (353 lines, in particular
`_is_named_absent`/`prune_absent`/`validate_valuation`),
`frontend/src/state/lyt-layout-types.ts` (274 lines),
`frontend/src/components/chrome/LytNode.vue` (596 lines, full —
template, script, and every doc-comment in the header), and every
`grep`-located consumer of `presenceDefaultVisible` in `frontend/src/`
(`App.vue`'s relevant sections,
`composables/chrome/useLytPresenceMenu.ts` in full,
`store/defaults.ts`/`store/schema.ts`'s relevant sections,
`ToolbarAppCluster.vue`'s header). The umbrella `CLAUDE.md` and
`frontend/CLAUDE.md` (both already in context per this session's
system prompt) were consulted for the disciplines cited below.

## THE GAP, confirmed directly against the code

(a) **Exclusive `demote` never emitted.** `_build_node`'s Leaf branch
already emitted a `demote` field off `slot.presence`
(`slot.presence.kind == "demote"`), but the Exclusive branch's four
construction sites (two `blackbox` shapes for the top-level collapsed
control panel, one inline `blackbox` for a still-collapsed TAB, one
`exclusive` shape for the genuinely-opened control panel) never did —
confirmed by grepping `"kind": "blackbox"`/`"kind": "exclusive"` in the
pre-change file: none of the four dicts had a `demote` key. Both
encodings' own control-panel `T(...)[BLACK BOX]` wrapping slot declares
`@demote(h 778px)` (landscape) / `@demote(h 808px)` (portrait) — a real,
loaded `slot.presence` fact the compiled program silently dropped.

(b) **`presenceDefaultVisible` from a hand-mirrored table, not the
model.** `DEFAULT_VISIBLE_BY_PATH`/`DEFAULT_VISIBLE_BY_PATH_PORTRAIT`
were hardcoded `Dict[Tuple[int, ...], bool]` literals, independent of
`presence.py`'s own valuation machinery (the module's own docstring
said so explicitly: "independently of `presence.py`'s valuation-solving
machinery... there is no presence MENU this wave"). P1
(`lyt-p1-presence-model.md`) added `"BLACK BOX"` to portrait's own
`default_valuation_by_class["portrait"].absent_widgets` — a genuine
model-side fact — but never touched this emitter's own table, so
`DEFAULT_VISIBLE_BY_PATH_PORTRAIT[(5, 1)]` stayed `True` even though
the model now says portrait's control panel is absent by default.
Confirmed directly: before this session's fix, portrait's compiled
program said `presenceDefaultVisible: true` for the control-panel path
while `runner.valuation_for_class(reg, "portrait").absent_widgets`
contained `"BLACK BOX"` — a real, checkable contradiction between the
model and its own compiled artifact.

## THE FIX (derive-don't-author)

1. **`presence.is_named_absent`** — `presence.py`'s own
   `_is_named_absent` (the ONE predicate `prune_absent`/
   `validate_valuation` already shared) is made public (dropped the
   leading underscore, docstring updated to name the new second
   caller) rather than reimplemented a second time in the emitter. Its
   three internal call sites updated to match.
2. **`emit_layout_tree.py`**:
   - `Registration.default_visible_by_path` field, and the two
     `DEFAULT_VISIBLE_BY_PATH*` module dicts, are RETIRED outright —
     replaced by a short pointer comment naming the retirement and its
     rationale.
   - New `_runner_registration_for_class(class_id)` /
     `_absent_widgets_for_class(class_id)` helpers resolve
     `runner.valuation_for_class`'s own `absent_widgets` for a class,
     searching `runner.REGISTRATIONS` by `layout_by_class` membership
     rather than a hardcoded index.
   - `_build_node` threads an `absent_widgets: FrozenSet[str]`
     parameter (replacing `default_visible_by_path` at every call
     site, recursive and top-level). The Split branch now computes
     `"presenceDefaultVisible": not is_named_absent(child,
     absent_widgets)` per child — a leaf's own `widget` id, or a
     tagged Exclusive's own `[TAG]`, checked against the class's own
     resolved default valuation; a plain Split child (no identity) is
     never named absent, so this is `True` for every such child,
     matching the retired table's own "every path it doesn't mention
     defaults True" convention exactly.
   - New `_demote_field(slot)` helper (the leaf branch's inline
     three-line ternary, extracted) is now also called at all four
     blackbox/exclusive construction sites — the inline collapsed-tab
     site (e.g. `CP-analysis`) reads `_demote_field(child)` (the TAB's
     own wrapping slot), the other three read `_demote_field(slot)`
     (the outer T's own wrapping slot).
   - `_ts_node`'s `blackbox`/`exclusive` TS-rendering branches gained a
     `demote` field (via a new shared `_ts_demote` helper, avoiding a
     third copy of the leaf branch's null-vs-object ternary).
   - `build_program`'s `default_visible_by_path` parameter is gone;
     `absent_widgets` is now derived once per build, internally, from
     `class_id` alone via `_absent_widgets_for_class`.
3. **`frontend/src/state/lyt-layout-types.ts`**: `LytBlackboxNode` and
   `LytExclusiveNode` both gain a `readonly demote: LytDemotion | null`
   field, doc-commented against `LytLeafNode.demote`'s own existing
   doc.
4. **Both `.gen.ts` regenerated** — `frontend/src/state/lyt-layout.gen.ts`
   / `lyt-layout-portrait.gen.ts`. Net diff, both files: `demote`
   fields added to the control-panel Exclusive node and to the two
   still-collapsed tab blackboxes (`null` for the tabs, `{axis:"h",
   belowPx:778}` landscape / `{axis:"h", belowPx:808}` portrait for the
   control panel itself); **landscape's own control-panel
   `presenceDefaultVisible` stays `true`** (row 2333's "do NOT shrink
   any desktop demand" respected — landscape's default valuation never
   named `"BLACK BOX"` absent); **portrait's own control-panel
   `presenceDefaultVisible` flips `true` → `false`** — the exact gap
   this arc closes.

## Consumer audit — the per-consumer behavioral-delta report the commission asked for

Every `grep`-located consumer of `presenceDefaultVisible` in
`frontend/src/` was traced to see what a portrait user's running app
actually does differently after this fix. **Executive finding: nothing
observable changes.** Two independent, pre-existing realization-layer
facts each fully explain why, and a third pre-existing, unrelated
model gap masks the one place a difference might otherwise have been
visible. All three are reported honestly below rather than silently
absorbed.

1. **`LytNode.vue`'s `isPresent`/`widgetIdOf` never consult
   `presenceDefaultVisible` (or `presenceOverrides`) for an
   Exclusive-kind child at all.** `widgetIdOf(child)` returns `null`
   whenever `child.node.kind === 'split' || child.node.kind ===
   'exclusive'` (`LytNode.vue:294-296`), and `isPresent` returns `true`
   unconditionally when the id is `null` (`LytNode.vue:298-303`). Both
   registrations set `open_control_panel=True`, so the control panel
   is `kind: 'exclusive'` in BOTH classes' compiled programs — this
   code path is not portrait-specific; it applies identically to
   landscape's (unchanged) `presenceDefaultVisible: true` and
   portrait's (now-fixed) `presenceDefaultVisible: false`. This is a
   disclosed, deliberate scoping in `LytNode.vue`'s own header comment
   ("A Split child has no single widget id of its own... is therefore
   always present") that pre-dates this session and was never in this
   commission's scope to change — REALIZATION work (wiring
   `isPresent`/`widgetIdOf` to also resolve an Exclusive's own
   `widget`/`tag` identity) is exactly the kind of "realization work
   beyond this contract fix" the commission named as P2b's territory,
   not P2a's.
2. **`App.vue`'s `lytPresenceOverrides` and `defaultSessionUI.lytPresence`
   hardcode `controlPanel: true` globally, independent of screen
   class.** Even setting (1) aside, `store/defaults.ts`'s
   `defaultSessionUI.lytPresence = { boardRail: false, previewBoard:
   false, controlPanel: true }` and
   `useLytPresenceMenu.ts`'s `LYT_PRESENCE_DEFAULT.controlPanel = true`
   are BOTH hand-authored literals — the same "hand-mirror" pattern
   this arc's item (b) retired at the emitter layer, but one level up,
   at the App/session layer, and explicitly disclosed there too
   (`useLytPresenceMenu.ts`'s own header: "`lyt-layout.gen.ts`'s own
   `presenceDefaultVisible` is a static `true` for `controlPanel`, with
   no distinct... signal surviving the AST → generated-TS
   compilation... Kept as a literal... NOT derived by walking
   `LYT_LANDSCAPE` at runtime"). `LytNode`'s `presenceOverrides[id] ??
   child.presenceDefaultVisible` fallback means a DEFINED override
   (which `controlPanel: true` always is, once seeded) always wins over
   the compiled program's own default — so even if (1) were fixed,
   this second, independent hardcode would still shadow portrait's own
   derived `false`. This too is realization-layer, out of P2a's scope,
   and — being screen-class-UNAWARE by construction — would itself need
   a design decision (a per-class default, or reading the compiled
   program at runtime) that is more than a contract fix.
3. **A genuine, pre-existing, UNRELATED model/realization gap**
   independently makes the control-panel row collapse to zero height
   at the two commissioned portrait screenshot sizes (768×1024 AND
   420×880 — the offline solver's own P1-disclosed finding named only
   768×1024; the LIVE CSS Grid realization, empirically, degenerates at
   both). This is the SAME row-height gap P1's own report named and
   left open ("a genuine model weakness, honestly reported rather than
   silently absorbed or unilaterally patched... a further, disclosed
   model decision this session did not make unasked") — CONFIRMED here
   as unrelated to this arc's own change (A/B screenshot: the
   PRE-P2a committed `lyt-layout-portrait.gen.ts`, temporarily restored
   and re-shot, produces the IDENTICAL `#control-panel`/`#vue-tree-panel`
   zero-height DOM measurements at both sizes — see "Screenshot
   witness" below). Confirmed independently by code inspection too:
   `LytNode.vue`'s `trackList` computed reads only `child.track`/
   `isPresent`, neither of which this arc's diff touches for the row's
   OWN height allocation (a root `V`-split partition, governed by
   sibling tracks, not by `presenceDefaultVisible`/`demote` on a
   descendant).

**Reachability**: none of the three findings above removes a surface a
portrait user could previously reach — the control panel was, and
remains, fully reachable (mounted, tabs switchable) at every portrait
size the row-height gap doesn't already independently degenerate. No
STOP-and-report-worthy reachability regression exists. What IS being
STOP-and-reported is the softer finding the commission's own item 3
anticipated as a live possibility: **the contract fix, alone, produces
no observable behavior change** — the commissioner's own gate
expectation ("if any rendered behavior changes (expected: portrait
default visibility)... the new defaults visible") is not met, and
this session did not attempt to close that gap by building the
realization work (item (1)/(2) above) that would be needed to meet
it, since doing so was named as P2b's own territory, not P2a's.

## Tests (emitter-side, `research/lyt/tests/test_emit_layout_tree.py`)

- `test_landscape_control_panel_exclusive_emits_demote_matching_encoding`
  / `test_portrait_control_panel_exclusive_emits_demote_matching_encoding`
  — new. Each asserts the emitted `demote` field against the RAW,
  independently loaded AST's own `slot.presence` (via a new
  `_find_tagged_exclusive_slot` walk helper), not against this
  emitter's own prior output.
- `test_collapsed_blackbox_tabs_carry_null_demote_when_undeclared` — new
  sanity companion: `CP-analysis`/`SP_session` (tabs that declare no
  `@demote` of their own) read `demote: null` on both classes,
  confirming the field is genuinely per-slot, not a copy of the outer
  T's value leaking down.
- `test_portrait_default_visible_by_path_matches_toggle_targets` —
  FIXED (was pinning the bug: `control_panel["presenceDefaultVisible"]
  is True`). Now asserts `is False`, checked against
  `runner.valuation_for_class`'s own `absent_widgets` directly (a fresh
  lookup into `runner.REGISTRATIONS`, not a call into the emitter's own
  private helper) — no tautology.
- `test_every_other_default_visible_path_is_true` (landscape) —
  unchanged; still asserts `True` for the control-panel path, correctly
  (landscape's own default valuation never names `"BLACK BOX"` absent).

## Gates

**`research/lyt` pytest, literal exit code:**

```
$ nice -n 19 /home/bork/w/vdc/venvs/generic/bin/python -m pytest research/lyt/tests -q
370 passed in 4.37s
$ echo $?
0
```

(367 pre-existing + 3 new; one existing assertion fixed, not weakened
— see "Tests" above.)

**Fresh-emit byte-identity**, both classes, verified by copying the
committed files aside, regenerating, and diffing:

```
$ diff /tmp/pre-regen-landscape.gen.ts frontend/src/state/lyt-layout.gen.ts && echo "landscape byte-identical"
landscape byte-identical
$ diff /tmp/pre-regen-portrait.gen.ts frontend/src/state/lyt-layout-portrait.gen.ts && echo "portrait byte-identical"
portrait byte-identical
```

**Frontend `npm run build`**: exit 0, 1249 modules transformed, 1.98s
(pre-existing "chunks larger than 500 kB" warning, unrelated).
`node_modules` symlinked from the main checkout after a byte-identical
`package-lock.json` diff (this worktree ships none of its own — same
precedent P1's own report used), removed again after this session's
gates.

**Frontend `npm run test:run`**
(`NODE_OPTIONS=--max-old-space-size=2048 VITEST_MAX_THREADS=2
VITEST_MAX_FORKS=2 nice -n 19`): exit 0 — 257 test files passed, 3
skipped (260); 3181 tests passed, 8 skipped (3189). No failures.
`tests/integration/App-boot.test.ts` confirmed green in isolation too:
2 passed, exit 0.

**Screenshot witness.** Isolated rig: backend `127.0.0.1:19310`,
frontend dev server `127.0.0.1:19311`, KataGo WS placeholder `19312`
(pinned, never contacted). All three probed dead
(`/dev/tcp` connect refused) before use; none of the forbidden ports
(4173/5173/5174/8764/1235/1242/195xx) were touched.

- **Backend**: the main checkout's shared venv
  (`/home/bork/w/omega/backend/venv/bin/python`, this worktree ships
  none of its own) `-m fastapi run backend/main.py --host 127.0.0.1
  --port 19310`, `DATABASE_URI` pointed at a COPY of
  `backend/samples/cards.sample.db` (`cards.rig.db`, under this
  session's own scratch dir — never the real `cards.db`).
  `QEUBO_ENABLED=false`.
- **Theme**: the DB copy's `documents` row
  (`key='user_workspace_01'`)'s `profile.settings.appearance.theme`
  rewritten `'dark'` → `'cluster'` (the light-background theme; `'light'`
  is not a value this codebase's `'dark' | 'cluster'` union accepts) via
  a direct sqlite3/Python write, verified by re-reading the row after
  the write. Playwright's own `colorScheme: 'light'` context option
  forced the second half of the mandate. All three real screenshots
  confirm `data-theme="cluster"` and `background-color: rgb(255, 245,
  255)` live.
- **Frontend**: `vite --port 19311 --host 127.0.0.1 --strictPort`, run
  from inside `frontend/` (a `--config`-absolute-path invocation from
  the worktree root 404'd every request — same footgun the
  boot-restoration report's own precedent named; corrected by `cd`-ing
  into `frontend/` first). `frontend/node_modules` symlinked from the
  main checkout.
- **Playwright**: `systemd-run --user --scope -p MemoryMax=4G -- nice
  -n 19 node --max-old-space-size=1024 <script>.mjs`, chromium launched
  with `executablePath: '/usr/bin/chromium'` and
  `args: ['--js-flags=--max-old-space-size=1024']`, one browser
  instance per shot, closed in a `finally`. No wall-clock waits — every
  wait is `waitForSelector('#split-workspace')` /
  `waitForFunction(() => el.children.length > 0)` /
  `waitForSelector('#board-area')`, real-condition waits on the actual
  boot signal.

**Captures** (saved under this session's own scratch directory,
`/tmp/claude-1000/-home-bork-w-omega/046517a5-6b16-43a9-af2d-e1dbe81eefc9/scratchpad/lyt-p2a-rig/`,
not committed — established LYT-session convention):

- `landscape-1920x1080.png` — **unchanged, as required.**
  `errorBoundaryPresent: false`, `dataTheme: "cluster"`. DOM:
  `#control-panel` `664×736`, visible — matches
  `presenceDefaultVisible: true` (unchanged by this arc). The open
  Session (UI) settings tab is visible in this capture, showing the
  LYTPRESENCE registry's own `controlPanel` checkbox CHECKED by
  default — direct visual confirmation of consumer-audit finding (2)
  above (the App-level default is a hardcoded `true`, independent of
  the compiled program).
- `portrait-768x1024.png` / `portrait-420x880.png` — board and toolbar
  render correctly; the tree/control-panel/preview row is not visible
  at either size. DOM: `#control-panel` `664×0` (present in the DOM,
  zero height — NOT absent, confirming finding (1): presence never
  removed it), `#vue-tree-panel` `140×0`.
- `portrait-768x1024-BEFORE.png` / `portrait-420x880-BEFORE.png` — the
  A/B control: the PRE-P2a committed `lyt-layout-portrait.gen.ts`
  (`presenceDefaultVisible: true`, no `demote` field), temporarily
  restored and reshot at the same two sizes. DOM measurements
  IDENTICAL to the AFTER shots (`#control-panel` `664×0`,
  `#vue-tree-panel` `140×0`) — direct empirical confirmation that
  finding (3) (the zero-height row) is unrelated to this arc's own
  change, not introduced or exacerbated by it. The portrait `.gen.ts`
  was regenerated back to this session's own P2a output immediately
  after this A/B check (byte-diff confirmed against the committed
  version before proceeding).

## STOP-and-report items

1. **The contract fix produces no observable runtime behavior change**
   (consumer-audit findings 1–2 above: `LytNode.vue` never consults
   presence for an Exclusive-kind child; `App.vue`/`defaults.ts`
   hardcode `controlPanel: true` at the session-default layer,
   independent of screen class). The commission's own gate language
   anticipated visible portrait behavior change as the expected
   outcome; this session found and empirically confirmed that it does
   not occur, and did NOT attempt to build the realization work that
   would make it occur (wiring `LytNode.vue`'s presence resolution to
   cover Exclusive-kind identities, and/or making the App-level
   presence default screen-class-aware) — that is explicitly P2b's
   scope (the popover/presence-menu work), not this contract fix's.
   Options for the commissioner: (a) accept the contract-only fix as
   this arc's full scope (the compiled program is now honest, even
   though nothing downstream reads the new fact yet — a legitimate,
   common "wire the data model first" sequencing) and commission the
   realization half separately; (b) fold a narrowly-scoped realization
   fix into a follow-up before this ships, if leaving the contract
   fact inert for a release cycle is undesirable.
2. **A genuine, pre-existing, unrelated realization gap**: the
   tree/control-panel/preview row collapses to zero height in the LIVE
   CSS Grid at BOTH commissioned portrait screenshot sizes (768×1024
   AND 420×880), not just the 768×1024 point P1's own report disclosed
   for the OFFLINE SOLVER. Confirmed unrelated to this arc's own change
   (A/B screenshot, above). Not touched by this session (out of scope,
   per P1's own "left open... a further, disclosed model decision" and
   this commission's own narrower scope) — named here as a live,
   now-doubly-confirmed candidate for a dedicated follow-up (the row's
   own missing `min` floor, P1's own recommendation).

## Discipline notes

- Scope held to `research/lyt/` plus the two named frontend touch
  points the commission itself named (`lyt-layout-types.ts` if the
  Exclusive node type needed the field — it did — and the two
  `.gen.ts` regenerations) plus one pre-existing test fixture
  (`LytNode-exclusive-rendering.test.ts`) updated for type-shape
  completeness (not required for any gate — `tsconfig.app.json`'s own
  `include` excludes `tests/`, confirmed directly — but correct to fix
  since a real `LytExclusiveNode` object now always carries `demote`).
  No other `frontend/src` component/composable was edited — the
  consumer audit is a READ-ONLY trace, not a fix, per the commission's
  own "do NOT build P2b here" instruction.
- No px used as bare reasoning currency — the 778/808px thresholds
  named above are P1's own, cited, not re-derived or invented here.
- No wall-clock sleeps in the screenshot rig; every wait is a
  real-condition wait. The two long-running test suites (`research/lyt`
  pytest, frontend `test:run`) were run to completion synchronously
  (the latter's own runtime exceeded the tool's foreground timeout once
  and was retried via the backgrounding mechanism, per the harness's
  own documented behavior — not a retry-in-a-sleep-loop).
- No touch to ports 4173/5173/5174/8764/1235/1242/195xx or any live
  process/DB — the isolated rig used 19310/19311/19312, all
  independently verified dead before use and torn down (processes
  killed, ports re-verified dead, `node_modules` symlink removed,
  `.jwt_secret`/`.vite` scratch artifacts from the rig's own backend/
  frontend runs cleaned up) after.
- `presence.py`'s `_is_named_absent` → `is_named_absent` rename is a
  narrow, disclosed API-surface widening (private → public) within
  `research/lyt/`, matching this arc's own "derive-don't-author"
  mandate (ADR-0012 P1/P7) — no other module needed updating (grepped
  for `_is_named_absent` importers first; none existed).
- `FEATURES.md`/`docs/handoff-current.md`: neither touched. This
  arc changes no observable user-facing capability (confirmed by the
  screenshot witness above) and `docs/handoff-current.md` does not
  currently reference the LYT presence arc at all (grepped; P1's own
  report didn't add such a reference either) — nothing to update.

## Commit

Committed on this worktree's own branch, `lyt-p2a-presence-contract`
(cut directly from `origin/lyt-phase2` at `dbb7d7d6`, the exact commit
named in this commission). Not pushed/merged by this session.

## License

Public Domain (The Unlicense), matching this repository's ADR-0006
per-file convention (this report is a dispatch record, not source code,
so no header is added to it).
