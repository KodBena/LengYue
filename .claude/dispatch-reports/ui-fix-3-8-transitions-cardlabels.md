# FIX dispatch — Defect 3 (transitions) and Defect 8 (card-tree labels)

Two small, disjoint fixes per `.claude/dispatch-reports/ui-defects-investigation.md`
"Defect 3" and "Defect 8" sections, read in full before starting, alongside
`frontend/CLAUDE.md` and `frontend/tests/CLAUDE.md` (also read in full).

## Docs read

- `frontend/CLAUDE.md` — read in full.
- `frontend/tests/CLAUDE.md` — read in full.
- `.claude/dispatch-reports/ui-defects-investigation.md` — read the "Defect 3"
  and "Defect 8" sections in full (the two sections this dispatch is scoped
  to); the rest of the ~1000-line document (Defects 1, 2, 4–7, 9+, if any)
  was not read this session — out of scope for this dispatch, named per
  ADR-0002 disclosure rather than silently skipped.

## FIX 1 — transitions (Defect 3)

This fix touches `frontend/src/assets/css/theme.css`. Changed the SSOT token `--duration-default: 0.2s` → `0s` (one line;
`--duration-slow` untouched). Per the investigation report's own inventory,
all 14 always-on decorative `transition:` sites reference `--duration-default`,
so this is a one-line kill switch rather than a 14-file sweep — the
orchestrator's ledgered scope call, per the dispatch brief.

**Verified untouched, per the brief's explicit exclusions:**
- `--duration-slow` (1s) — checked its only two references:
  `PboPopover.vue:280` (`.busy-dot { animation: pulse var(--duration-slow)
  infinite; }`, a feature-carrying busy indicator) and a comment in
  `lib/timing.ts`. Neither is a decorative transition, so `--duration-slow`
  was left at 1s exactly as instructed ("if only feature animations, leave
  it").
- `ToolbarEngineMetrics.vue`'s `.watchdog-pinging` keyframe (`animation:`,
  gated off by default via `session.ui.watchdogColorTransition`) — not
  touched; it doesn't reference `--duration-default`.
- `PboPopover.vue`'s `.busy-dot` pulse — not touched, same reasoning.
- `MoveSuggestions.vue`'s `moveSuggestionsFadeMs` knob and its default —
  not touched; it's inline-justified per theme.css's own consolidation
  comment and stays outside the `--duration-default` scale.
- ECharts `animation: false` series options (`BaseChart`/`HeatmapChart`/
  `DistributionChart`) — already off, not CSS, not touched.

**Documentation:** updated theme.css's "Animation durations" consolidation
comment (~lines 273–289) so it no longer claims a live 0.2s value — it now
states the token is 0s per the 2026-08 maintainer ruling, names why
`--duration-slow` is exempt, and keeps the rest of the original snap-by-
cluster rationale (ADR-0005: no stale doc left claiming a superseded
value).

**Test status:** UNEXERCISED for a runtime assertion — no honest unit/
integration check exists for a CSS custom-property value in this suite
(confirmed via the tests/CLAUDE.md tier structure: no CSS-computed-style
tier). The maintainer-runnable check named in the investigation report
applies: `getComputedStyle(el).transitionDuration === '0s'` on any of the
14 sites, or directly `getComputedStyle(document.documentElement)
.getPropertyValue('--duration-default').trim() === '0s'`.

## FIX 2 — card-tree labels (Defect 8)

This fix touches `frontend/src/components/charts/card-tree-echarts.ts`,
`card` branch of `toEChartsNode` (~lines 101–140). Added an explicit `label: { show: true, formatter: () => String(node.cardId) }`
to the branch's base return object, mirroring the sibling `stub` (`+N`) and
`bucket` (`×N`) branches' existing `label.formatter` pattern in the same
file. `name` itself is untouched — it stays `` `Card ${node.cardId}` `` for
the tooltip (`tooltipFor`) and any future `.name`-keyed consumer. The
pre-existing `isSuspended` spread (which overrides `label` with the 💤
glyph) is unaffected: it's spread after the new base `label` key, so it
still wins for suspended cards exactly as before.

## Test (Fix 2)

`toEChartsNode` is a pure function (Tier 1 per `tests/CLAUDE.md`), so added
`frontend/tests/unit/charts/card-tree-echarts.test.ts`:

- Asserts `name` stays `"Card 3179"` while `node.label.formatter()` returns
  `"3179"` (matches `/^\d+$/`).
- Asserts `label.show === true` for a non-suspended card.

**Red/green witnessed:** stashed the production-file change (`git stash
push -- src/components/charts/card-tree-echarts.ts`), ran the new test —
both assertions failed (`typeof formatter` was `"undefined"`, `label.show`
was `undefined`), confirming the test is load-bearing against the pre-fix
shape. Restored the fix (`git stash pop`); the same test passes.

**jsdom note:** the module reads chrome-anchor colours via `themeColor()`
at construction time (an 'active'-role card's `itemStyle.color` getter),
which throws loudly per ADR-0002 when the backing CSS custom property is
empty under jsdom (jsdom doesn't load `theme.css`). The test stubs only
the two properties the 'active'-role branch reads (`--accent-primary`,
`--text-0`) directly on `document.documentElement.style`, the same
minimal-stub shape `tests/integration/render-count/jsdom-stubs.ts` uses
for the identical underlying reason — not a DOM-testing shortcut, a
side-effect of the production code's environment dependency.

## Gates (actual tails)

`cd frontend && npm run build`:
```
✓ 1080 modules transformed.
...
✓ built in 4.85s
```
(exit 0; pre-existing >500kB chunk-size warning, unrelated to this change.)

`npx eslint .`: no output, exit 0.

`npm run test:run` (full suite, after `npm ci` — worktree had no
`node_modules`):
```
 Test Files  82 passed | 3 skipped (85)
      Tests  1103 passed | 4 skipped (1107)
   Start at  13:35:47
   Duration  161.17s
EXIT_CODE:0
```
No vitest-hang symptom this run (user memory notes vite ≥8.0.12 can
deadlock vitest teardown; installed vite is 8.2.0 per `package-lock.json`
— the run exited cleanly with the correct exit code, so not exercised
here, flagged for awareness only).

## Scope discipline

Both fixes stayed within their named single files (plus the new test
file). No 14-file transition sweep, no touching the two feature-carrying
`animation:` keyframes, no touching `moveSuggestionsFadeMs`, no touching
`--duration-slow`, no touching ECharts `animation: false` options, `name`
in the card branch left unchanged.
