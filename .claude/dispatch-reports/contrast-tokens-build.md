# High-contrast text — BUILD report

Commissioner-adjudicated (ledger rows 215-216). BUILD agent, isolated
worktree `.claude/worktrees/agent-a8ba00ad9bf95182c`, branch
`worktree-agent-a8ba00ad9bf95182c`. Reads completed end to end before
work: `frontend/CLAUDE.md`, `frontend/tests/CLAUDE.md`,
`.claude/dispatch-reports/adr19-audit.md` (full, not just §S4/§contrast),
`frontend/src/assets/css/theme.css` (full, pre-change).

## Naming decision

Working name from the commission was "new style"; shipped name is
**`appearance.highContrastText`** (schema leaf) / "high-contrast text"
(the audit's own working name, kept — it says what it does, matches the
codebase's `camelCase`-under-`appearance` idiom next to `theme`,
`intensityHueShift`, `miniBoardRenderer`). Rejected: "new style" (says
nothing about effect, and the app already has a real second *style*, the
`dark` theme — reusing that word invites confusion with theme switching,
which this is not).

## Mechanism

- `AppSettings.appearance.highContrastText: boolean` (default `false`) —
  `frontend/src/store/schema.ts`, `defaults.ts`. Migration 62 → 63
  backfills `false` on legacy blobs (`migrations.ts`); the aged-out
  60 → 61 body moved to `archived-migrations.ts` per the rolling-archive
  discipline (steady state: two active migrations).
- `useAppBootstrap.ts` gained a second `data-*` mirror watcher, same
  shape as the existing `data-theme` watcher, delegating the DOM write to
  a new pure unit — `src/composables/auth-app/contrast-text-attribute.ts`
  (`applyContrastTextAttribute`) — so the OFF-state guarantee is
  unit-testable without mounting the whole bootstrap composable. OFF
  **removes** the attribute (never writes `"off"`), so the override
  selector structurally cannot match — not a value flip, a structural
  absence.
- `theme.css`: new `[data-theme="cluster"][data-contrast-text="on"]`
  block overriding **only** `--text-2` and `--accent-primary` (the two
  tokens the audit's §S4 "shortest honest fix" named). `dark` has no
  matching block — untouched regardless of the attribute.
- **Data-series lock.** `--heatmap-mid`, `--chart-marker`, and
  `--player-black` aliased directly to `--accent-primary` before this
  change — darkening `--accent-primary` would have silently recolored
  chart series. Added `--accent-primary-canonical` (declared per-theme
  from the palette literal, never from `--accent-primary`) and repointed
  those three aliases to it. Verified live (playwright, both states):
  `--accent-primary` `#00a7ff → #0069a1` ON; `--heatmap-mid` /
  `--chart-marker` / `--player-black` stay `#00a7ff` in both states.
- Toggle surface: no new UI component. `highContrastText` is a plain
  boolean schema leaf declared immediately after `theme` under
  `appearance`; `RegistryEditor.vue`'s generic recursive editor renders
  any boolean leaf as a checkbox automatically (object insertion order
  preserved), so it appears as a checkbox directly under the theme
  picker in Settings → Advanced Registry with zero new template code —
  C1 (one control, one fact), and consistent with S9's finding that the
  theme picker itself has no dedicated UI outside this same registry.
  Added one `PATH_TOOLTIPS` entry for discoverability.

## Token table

| token | old value | new value | background | ratio (old) | ratio (new) |
|---|---|---|---|---|---|
| `--text-2` | `#7a6f6d` (cluster-12-6) | `#685e5d` | `--surface-0` `#fedaf7` | 3.84:1 | **4.95:1** |
| `--accent-primary` | `#00a7ff` (cluster-12-2) | `#0069a1` | `--surface-0` `#fedaf7` | 2.08:1 | **4.69:1** |

Both new values are the same hue as the palette entry they replace,
scaled down in luminance only (`--text-2` ≈ 85%, `--accent-primary` ≈
63% of original per-channel brightness) — no hue rotation, no
desaturation toward gray. `--text-0`/`--text-1` (cluster-12-4, deep
purple) were already ~16:1 against `--surface-0` and are untouched.
Ratios computed via the standard WCAG 2.1 relative-luminance formula;
machine-checked in `tests/unit/contrast-ratio.test.ts` (WITNESSED — see
Gates below), not just hand-computed. Full derivation and the residual
`--text-2` vs `--surface-1` (taupe-chrome) collapse — architecturally
unfixable within a text-only override, since `--surface-1` is itself too
dark to give any text 4.5:1 against it (max achievable with pure black
text is 4.32:1) — are documented in `theme.css`'s override-block
comments and `schema.ts`'s doc comment on the field.

## Naming/scope note (assumption, disclosed)

The audit's §S4 table cites two ratios, both against `--surface-0`; its
"shortest honest fix" names exactly `--text-2` and `--accent-primary` as
the two tokens to darken. Treated that as the authoritative target list
rather than re-deriving one from the raw 66/116-failing-node count,
since re-deriving would have meant re-running the audit's own
instrumentation from scratch. WITNESSED (below) that zero of the
audit's cited failing nodes (Mint Card CTA, tab labels, MOVE badge, the
taupe label class) remain failing with the flag ON, from the same
screen.

## Tests

- `tests/unit/contrast-ratio.test.ts` — WCAG math (white/black,
  self-contrast, argument-order invariance, malformed-input throw) +
  the four audit token pairs pinned in both directions (OFF fails,
  ON clears 4.5:1). WITNESSED: `npx vitest run` green, 11 tests.
- `tests/unit/contrast-text-attribute.test.ts` — the OFF-state-unchanged
  structural property: fresh element has no attribute (not `"off"`);
  toggling ON then OFF removes it rather than leaving a stale value;
  idempotent on repeat calls. WITNESSED: green, 4 tests.
- Full suite: WITNESSED, `npm run test:run` → **83 files / 1114 tests
  passed, 3 files / 4 tests skipped** (skips pre-exist this change).

## Playwright witness

4K (3840×2160, dsf 1), `chromium` headless against `vite preview` on
spare port 4599 (killed after). Script run from `frontend/`, not
committed (scratchpad only — ephemeral driver, not a deliverable).

1. Cold load: `data-theme=cluster`, `data-contrast-text` **absent**
   (`hasAttr:false`) — OFF is the true default. WITNESSED.
2. Navigated Settings → Advanced Registry (the screen holding the
   audit's worst-offender node classes) and swept 400 leaf text nodes,
   computing actual composited-background contrast client-side (same
   method as the audit): **OFF state — 192/400 fail**, top offenders
   reproduce the audit's exact findings (`Mint Card` `rgb(0,167,255)` on
   `rgb(254,218,247)` = 2.08:1; tab-rail/label class `rgb(122,111,109)`
   on same bg = 3.84:1). WITNESSED, screenshot
   `contrast-01-before-light-off.png`.
3. Clicked the real `highContrastText` checkbox in the UI (not a store
   shortcut). `data-contrast-text` becomes `"on"`. Re-swept the *same*
   screen: **32/400 fail** — a 160-node improvement, and **zero** of the
   audit's originally-cited failing nodes remain in the failing set
   (checked by substring match against `Mint Card`/`◀`/`MOVE`/`#`/`B: 0`
   — 0 hits). WITNESSED, screenshot `contrast-02-after-light-on.png`.
4. **Residual 32 failures, disclosed not fixed.** All 32 share one
   color pair, `rgb(125,135,153)` on `rgb(40-44,44-49,52-58)` — a
   numbered-gutter widget (an expression/code editor elsewhere in
   Advanced Registry) whose colors match neither the cluster-12 palette
   nor the dark-theme anchors nor either override value. Pre-existing,
   theme-independent, out of the audit's §S4 target list and out of this
   commission's scope — named here per the "claims carry witnesses"
   discipline rather than silently left out of the count.
5. Toggled back OFF via the same checkbox: `data-contrast-text`
   confirmed **absent** again (not `"off"`). WITNESSED, screenshot
   `contrast-03-reverted-light-off.png`.
6. Dark-theme isolation check (separate headless pass, forced
   `data-theme=dark` + `data-contrast-text=on`): `--text-2` and
   `--accent-primary` computed values identical with the attribute
   present or absent (`#666` / `#4aaef0` both states). WITNESSED.
7. Data-series lock check: `--accent-primary` `#00a7ff → #0069a1`
   between OFF/ON in cluster theme; `--heatmap-mid`, `--chart-marker`,
   `--player-black` all stay `#00a7ff` in both states. WITNESSED.

**Not exercised**: true pixel-diff between screenshots 1 and 3 (no
image-diff tool available in this environment) — the OFF≡OFF claim
rests on the attribute-presence check (step 5) plus the CSS selector
being structurally unable to match without the attribute, not on a
byte-level image comparison. UNEXERCISED, disclosed rather than
silently assumed.

## Gates

- `npm run build` (`vue-tsc -b && vite build`) — WITNESSED, exits 0,
  1081 modules, no type errors.
- `npx eslint .` — WITNESSED, exits 0, no output.
- `npm run test:run` — WITNESSED, exits 0, 1114 passed / 4 skipped
  (skip count unchanged from pre-existing baseline).

## Files touched

`frontend/src/store/schema.ts`, `defaults.ts`, `migrations.ts`,
`archived-migrations.ts`; `frontend/src/composables/auth-app/
useAppBootstrap.ts`; `frontend/src/assets/css/theme.css`;
`frontend/src/components/editors/RegistryEditor.vue`; `FEATURES.md`.

New files (added to `frontend/FILES.md` in the same change):
`frontend/src/composables/auth-app/contrast-text-attribute.ts`,
`frontend/src/utils/contrast-ratio.ts`,
`frontend/tests/unit/contrast-text-attribute.test.ts`,
`frontend/tests/unit/contrast-ratio.test.ts`.

No resource used from the RESOURCES registry beyond the project's own
Vitest/ESLint/Playwright-core toolchain already vendored as devDeps.

## REPAIR — 2026-08-06

Fresh-context review (`.claude/dispatch-reports/contrast-tokens-review.md`,
main checkout, same worktree/branch under review) **REJECTED** the build
on finding (3): `--accent-primary-canonical` locked the CSS-alias layer
(`--heatmap-mid`, `--chart-marker`, `--player-black`) but missed **JS-side
`themeColor('--accent-primary')` reads**, which bypass CSS `var()`
resolution entirely (`themeColor()` is its own
`getComputedStyle(...).getPropertyValue(name)` call). Three genuine
data-series/node-role sites were still reading the darkened anchor
directly. Everything else in the review — OFF-gating, ratio math,
migration cadence, gates — was WITNESSED clean and unchanged by this
repair.

**(1) Enumeration.** Every `themeColor()` call site in `src/` (43 call
sites across 10 files) was read and classified chart/data-series vs
chrome/text. Full list in the review-response below; only
`'--accent-primary'` reads needed reclassification — `'--player-black'`
/`'--player-white'`/`'--review-current-card'`/`'--state-success'` sites
already resolve through CSS aliases (`--player-black` etc.) that were
already canonical-locked in the original build, confirmed unaffected by
a live before/after check (`getComputedStyle` read, both states,
unchanged).

**(2) Repointed to `--accent-primary-canonical` (4 sites, all
data-encoding):**
- `StabilityPanel.vue:133` — the "Stability" line-chart series color.
- `BaseChart.vue:498` — the active-index `markPoint` chart marker.
- `card-tree-echarts.ts:69` (`colors.active`) and `:75`
  (`colors.stubActiveBorder`) — the card-tree's "active role" node-fill
  color, plus `:235` (`cAccent` in `tooltipFor`) — the tooltip header
  color that echoes the same active-role fill for visual consistency.

`--accent-primary-canonical` added to `theme-color.ts`'s `ChromeAnchor`
union (SSOT lockstep edit theme-color.ts's own header docstring
requires whenever the color-anchor set changes) so these sites compile
against the same type-checked vocabulary as every other `themeColor()`
call.

**Left as disclosed chrome** (per the review's item (4) suggestion,
confirmed correct on inspection — neither encodes data):
`BaseChart.vue:360` (axisPointer crosshair) and
`useEChartsForestRender.ts:149` (tooltip-box border). Both carry an
inline `contrast-tokens-review.md (4)` marker comment naming the
disclosure.

**(3) Class guard.** `tests/unit/chart-accent-primary-lock.test.ts` scans
`src/components/charts/` and `src/composables/analysis/` (the two
directories that had ANY `themeColor('--accent-primary')` call site,
verified by grep at authoring time — the guard's scope is disclosed in
its own header comment as bounded to these two directories, not all of
`src/`) and fails if a direct `'--accent-primary'` read appears without
the `contrast-tokens-review.md (4)` marker within 12 lines above it.
WITNESSED live: temporarily reverted `StabilityPanel.vue`'s fix back to
a direct `themeColor('--accent-primary')` read — the guard went red,
naming the exact line; reverted the revert — guard green again (35/35).
This is the same "verify the guard can fail" discipline
`tests/CLAUDE.md`'s render-count harness section names.

**(4) Gates — re-run in full, all green:**
- `npm run build` → exit 0, 1081 modules, no type errors.
- `npx eslint .` → exit 0, no output.
- `npm run test:run` → exit 0, **84 files / 1149 tests passed, 3 files /
  4 tests skipped** (35 new tests from the guard file; skip count
  unchanged).

**Playwright chart-token witness, re-aimed at the JS-read consumers** (not
the CSS-alias consumers the original witness sampled): a fresh headless
pass against `vite preview` on :4599 (killed after) evaluated
`getComputedStyle(document.documentElement).getPropertyValue(name)` —
the exact expression `themeColor()` executes, so this is a faithful
stand-in for every fixed call site without needing to import/execute the
Vue/ECharts modules directly — for both `--accent-primary-canonical` and
`--accent-primary`, before and after clicking the real `highContrastText`
checkbox:

```
{ "off": { "canonical": "#00a7ff", "accentPrimary": "#00a7ff" },
  "on":  { "canonical": "#00a7ff", "accentPrimary": "#0069a1" },
  "canonical_unchanged": true,
  "accentPrimary_shifted_as_expected": true }
```

WITNESSED: `--accent-primary-canonical` (every repointed chart/node-role
site) is byte-identical flag-off vs flag-on; `--accent-primary` (the two
disclosed chrome sites) shifts, confirming the override itself still
fires. **Not exercised:** live pixel sampling of an actual rendered chart
canvas (StabilityPanel/BaseChart needed loaded analysis data to draw a
real series, which the running preview didn't have — S8 in the ADR-0019
audit: charts render empty axes with no data loaded). The
`getComputedStyle`-level check is the exact mechanism `themeColor()`
uses with no intervening caching, so this is disclosed as a
mechanism-level witness, not a pixel-level one.

Commit on branch `worktree-agent-a8ba00ad9bf95182c` (same branch,
following the coordinator's instruction). Same reviewer to re-review.
