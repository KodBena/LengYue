# High-contrast text — REVIEW verdict

Fresh-context review of branch `worktree-agent-a8ba00ad9bf95182c` (head
`29de3681`), worktree `.claude/worktrees/agent-a8ba00ad9bf95182c`. Reads
completed end to end before judging: `frontend/CLAUDE.md`, the umbrella
`CLAUDE.md`, `src/store/migrations.ts` and `archived-migrations.ts`
headers, `.claude/dispatch-reports/contrast-tokens-build.md` (full).

## Verdict: **REJECT**

## (1) OFF-state / cascade gating — WITNESSED, clean

`git diff 3378806f 29de3681 -- frontend/src/assets/css/theme.css`
inspected directly. The only new rule block is
`[data-theme="cluster"][data-contrast-text="on"] { --text-2: #685E5D;
--accent-primary: #0069A1; }`. Both attribute conditions are required
(AND, not OR); no other selector in the diff references
`data-contrast-text`; `dark` theme has no matching block. `useAppBootstrap`
mirrors the flag by attribute *presence*, not a `"off"` value string, so
OFF genuinely leaves the selector unmatchable. No cascade leak found.

## (2) Ratios — WITNESSED, recomputed independently, both PASS

`--text-2` `#685E5D` vs `--surface-0` `#fedaf7`: relative luminance
0.11746 vs 0.77958 → contrast **4.947:1** (claimed 4.95:1, matches).
`--accent-primary` `#0069A1` vs `--surface-0`: 0.12694 vs 0.77958 →
contrast **4.686:1** (claimed 4.69:1, matches). Both clear 4.5:1; the
accent value also clears the 3:1 glyph floor. Hue preserved in both
(luminance-only scale-down) — matches the "same look, readable" spec.

## (3) `--accent-primary-canonical` consumer sweep — **REJECT finding**

The CSS-var alias layer is correctly locked: `--heatmap-mid`,
`--chart-marker`, `--player-black` all re-point to
`--accent-primary-canonical` (verified in the diff, `theme.css`).

But `--accent-primary` also has **direct JS-side chart consumers** via
`themeColor('--accent-primary')` (`src/utils/theme-color.ts`, which
reads the live computed CSS custom property — confirmed by its own
docstring/type). These were **not** repointed and were not enumerated
in the build report's "Data-series lock" section:

- `frontend/src/components/charts/StabilityPanel.vue:130` —
  `color: themeColor('--accent-primary')` is the **actual series color**
  of the "Stability" line chart. Will silently darken when the flag is
  ON — this is exactly the "commissioner's palette must not shift in
  charts" case the spec forbids.
- `frontend/src/components/charts/BaseChart.vue:486` — `markPoint.itemStyle.color:
  themeColor('--accent-primary')`, a per-point chart marker (the CSS
  `--chart-marker` alias was fixed, but this JS-side marker bypasses
  that alias entirely and reads the raw anchor).
- `frontend/src/components/charts/card-tree-echarts.ts` — `colors.active` /
  `colors.stubActiveBorder` / `cAccent`, all `themeColor('--accent-primary')`,
  drive the card-tree node fill/border color for the "active" role — a
  data-encoding color in a chart, not chrome.
- Lower-severity, chrome-only (acceptable to shift): `BaseChart.vue:351`
  (axisPointer crosshair) and `useEChartsForestRender.ts:142` (tooltip
  border).

This directly contradicts the build report's claim ("Verified live...
`--heatmap-mid` / `--chart-marker` / `--player-black` stay `#00a7ff` in
both states") — that check exercised only the CSS-alias path, not these
JS read sites, so the claim is true but incomplete, and the incompleteness
is exactly the failure mode the commission's check (3) was written to
catch. This is load-bearing per the dispatch brief and is why the verdict
is REJECT rather than ACCEPT-WITH-NITS: at least one genuine data series
(`StabilityPanel`'s line color) will shift on ON.

## (4) RegistryEditor toggle — WITNESSED, honest but marginal on "discoverable"

`highContrastText` is a plain boolean leaf under `appearance`, right
after `theme`; `RegistryEditor.vue`'s generic boolean-leaf renderer
picks it up automatically (checkbox, `PATH_TOOLTIPS` entry added).
`useAppBootstrap.ts` diff shows a second `data-*` watcher mirroring the
existing `data-theme` pattern (same shape, boot-time apply + reactive
watch) — traced and correct. It writes to
`profile.settings.appearance.highContrastText`, persists via the normal
store path, no shortcut. "Next to theme" is technically true (same
object, adjacent key) but it lands inside "Settings → Advanced Registry"
generic editor, not a labeled control in a dedicated Appearance/Settings
panel a typical user would browse to — a strict reading of "a settings
toggle next to theme" is arguably not met if "theme" here means the
theme *picker* UI (which the build report itself notes has no dedicated
UI either, so this is consistent with existing precedent, not a
regression). Not a rejection ground on its own.

## (5) Migration 62→63 + archive cadence — WITNESSED, correct

`migrations.ts` tail shows migration 63 body (idempotent, uses
`witnessedContainer`, defaults `false`, preserves existing values).
`archived-migrations.ts` header confirms scope "1→2 through 59→60"
(59 entries) — consistent with steady-state-of-two (61→62 and 62→63
remain active). Cadence matches the rolling-archive discipline.

**Race note for the orchestrator:** an in-flight sibling branch
(resizer re-architecture) will also mint a migration N+1. Files a
renumber would touch: `frontend/src/store/schema.ts` (bump
`CURRENT_SCHEMA_VERSION`), `frontend/src/store/migrations.ts` (both
branches append a migration function + header comment, and the "keep
exactly two" trim moves 61→62 to the archive once a third body lands),
`frontend/src/store/defaults.ts` (only if the sibling adds a new
default leaf), `frontend/src/store/archived-migrations.ts` (receiving
end of whichever migration ages out first depending on merge order).
Whichever branch merges second must rebase its migration index onto
the first's `CURRENT_SCHEMA_VERSION` and redo the archive trim.

## (6) Gates — WITNESSED, all green, run myself in the worktree

- `npm run build` → exit 0, 1081 modules, no type errors.
- `npx eslint .` → exit 0, no output.
- `npm run test:run` → exit 0, **83 files / 1114 tests passed, 3 files /
  4 tests skipped** — matches the build report exactly.

## (7) Compose vs current `next` — not exercised

Not run: a throwaway merge against current `next` (rulesets + fixture
repair) was in scope per the brief but was skipped once (3) produced a
REJECT-grade finding — merging and re-running the suite against a
branch that needs a code change first would have been discarded work.
Recommend after the fix lands.

## Disposition

REJECT. Fix: repoint the four load-bearing JS chart read sites (at
minimum `StabilityPanel.vue:130` and `BaseChart.vue:486`; the
`card-tree-echarts.ts` role-color getters are also data-encoding and
should move too) to `themeColor('--accent-primary-canonical')` — which
requires adding `--accent-primary-canonical` to the `ChromeAnchor` union
in `theme-color.ts` (currently absent, confirmed absent from the type
literal). Chrome-only sites (`BaseChart.vue:351` axisPointer,
`useEChartsForestRender.ts:142` tooltip border) may stay on
`--accent-primary` as a documented, disclosed choice. Everything else
in this review — OFF-state gating, ratio math, migration cadence, gates
— is clean and can ship unchanged once (3) is fixed.

---

## RE-REVIEW — 2026-08-06, head `bd58cdd7`

Repair commit `bd58cdd7` (`fix(frontend): repoint JS-side chart
accent-primary reads to the canonical lock`) re-checked against branch
`worktree-agent-a8ba00ad9bf95182c`, same worktree. `git diff 29de3681
bd58cdd7` read in full before judging.

### Verdict: **ACCEPT**

### Consumer re-enumeration — WITNESSED, complete

`StabilityPanel.vue:130`, `BaseChart.vue:492` (marker), and all three
`card-tree-echarts.ts` getters/locals (`colors.active`,
`colors.stubActiveBorder`, `cAccent`) now read
`themeColor('--accent-primary-canonical')`. Repo-wide sweep for every
remaining `themeColor('--accent-primary')` literal:

```
src/composables/analysis/useEChartsForestRender.ts:149  (disclosed chrome)
src/components/charts/BaseChart.vue:360                 (disclosed chrome)
src/utils/theme-color.ts:129                            (doc-comment example, not a call site)
```

No other caller anywhere in `src/`. Also checked for **dynamically-built**
anchor names — a template-literal, string-concat, or computed-key
construction that could evade a literal grep (`themeColor(\`...\`)`,
`themeColor(someVar)`) — none exist; every call site in the codebase
passes a string literal directly. The enumeration is complete; the
builder's claim holds.

### Chrome-shift judgment — the two disclosed sites are correctly classified

`BaseChart.vue:360` (axisPointer crosshair `lineStyle.color`) and
`useEChartsForestRender.ts:149` (tooltip box `borderColor`) both encode
cursor/tooltip **chrome**, not data — neither carries series identity or
a role mapping the way `StabilityPanel`'s series color or
`card-tree-echarts`' node-role fill do. The commission's spec text
("light-theme text/glyph tokens rebound... DATA-SERIES palette...
untouched") draws the line at data-series encoding, and `--accent-primary`
is explicitly one of the two tokens meant to shift for its TEXT/CTA
role — a crosshair line and a tooltip border are exactly that CTA/chrome
role, not a data role. Judged correct, not a rejection ground.

### Guard test — WITNESSED green, WITNESSED red on revert

`npx vitest run tests/unit/chart-accent-primary-lock.test.ts` → **35/35
passed**. Revert-check: temporarily reverted
`StabilityPanel.vue`'s `--accent-primary-canonical` back to
`--accent-primary` (`sed` in place, restored after) and reran the same
guard file → **1 failed / 34 passed**, failure at line 133 exactly as
expected, with the guard's own message correctly pointing at the
undisclosed direct read. Guard is live, not a vacuous pass. File restored,
`git diff --stat` on it confirmed clean afterward.

### Gates — WITNESSED, all green, run myself

- `npm run build` → exit 0, no type errors.
- `npx eslint .` → exit 0, no output.
- `npm run test:run` → exit 0, **84 files / 1149 tests passed, 3 files /
  4 skipped** (1114 prior + 35 new guard tests = 1149, consistent).

### Compose vs current `next` — WITNESSED, expected conflict only

Local `next` (not `origin/next`, which is stale relative to it) is at
`92253af9`, carrying the hotkeys batch (`c298a9e5`) + modal keyboard
integrity (`95afd78f`) + registry collapsibles merges named in the
coordinator's message. Throwaway merge in a scratch clone
(`git merge next` onto `bd58cdd7`): auto-merged cleanly everywhere
except **`frontend/src/store/migrations.ts`**, conflicting exactly as
flagged in the first review's race note — both branches independently
claim migration **61 → 62** (this branch: `highContrastText` backfill;
`next`: `analysisRanges` reshape). This is the anticipated collision, not
a new defect; whichever branch merges second must renumber its migration
to 62 → 63, move the loser's old 61 → 62 into the active file's second
slot, and re-run the archive trim. Scratch clone discarded after the
check (no changes pushed).

### Disposition

**ACCEPT.** All items from the original REJECT are resolved: the JS-side
chart consumer leak is closed and mechanically guarded, the two
remaining direct reads are correctly classified as chrome, the guard
test is demonstrably load-bearing, and all gates are green. The
migration-number collision with `next` remains a known, disclosed
merge-time task (not a defect in this branch) — carry the race note
forward to whichever merge lands second.
