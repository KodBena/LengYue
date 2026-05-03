# Magic Literals Audit — Pass 1 Inventory

**Status:** Filed 2026-05-03. Pass 1 of the audit specified in
`docs/notes/magic-literals-audit-plan.md`. The plan's two passes are
**(1) Inventory — repo-wide scan, classify, capture file:line** and
**(2) Cluster and decide — group by nominal handle, build substrate or
require inline justification**. This document is the (1) artifact.

**Pass 2 closed 2026-05-03** across nine substrate PRs and a Tier-4
inline-justification sweep. The audit's contract is satisfied. See
the audit plan's status header for the full close-out summary; the
"Recommended Pass 2 sequencing" section below served as the working
order during execution.

**Predicate:** the color theming substrate (closed 2026-05-02, A1–A4
arc) had to land first; color was the largest single literal class and
the established methodology. With color in place, the residue is
tractable. See the plan's "Sequencing" section for why color was the
gate.

**Scope:** `frontend/src/`. Backend deferred per the plan. Within the
frontend, the inventory walks all `.vue` and `.ts` files (111 files
total), excluding `src/types/backend.ts` (generated wire types).

---

## Methodology applied

The plan's framing — **literals as `as any`** — applied verbatim:
each unjustified literal is a local override of the design vocabulary
that the compiler can't flag later, with the same auditability profile
as a `as any` cast. The contract is *named-and-centralised OR
explicitly justified inline*; the absence of either is the discipline
violation.

Concrete sweeps performed:

- **CSS-side** — `rg` against SFC `<style>` blocks and
  `src/assets/css/`'s three files for: animation durations and
  easings, opacity values (CSS `opacity:` and rgba alphas),
  z-index, pixel dimensions (font-size, gap, padding, margin,
  border-width, border-radius, layout widths), em values
  (letter-spacing, line-height), color-mix percentages.
- **TS-side** — `rg` against `.ts` files and SFC `<script>` blocks
  for: numeric multipliers and offsets (the `* 0.88` shape),
  `setTimeout` / `setInterval` delays, hard-coded sizes and
  coordinates, string identifiers (event names, status enums,
  registry keys, URL paths, CSS class strings referenced by JS),
  domain thresholds.
- **Cross-cutting** — verified the existing SSOT files
  (`engine/constants.ts`, `assets/css/theme.css`,
  `utils/theme-color.ts`, `config/env.ts`, `lib/utils.ts`) and
  catalogued what's already centralised. Cross-checked the
  `theme-exception` precedent established by the color substrate.

For each finding: the cluster's distinct values, representative
sites or full site list (if small), candidate nominal handle, and
verdict (SSOT candidate / one-off / domain / already-disciplined).

---

## Working principle: semantic consolidation, not literal lifting

A misreading of this inventory would be to lift each distinct
literal into its own named home — `--text-8: 8px`, `--text-9:
9px`, ..., `--text-20: 20px` for the ten font-size literals — and
conclude the audit's contract is satisfied. That shape preserves
drift; it just gives every drifting value an address. The audit's
intent is the opposite: **reduce the number of *distinct semantic
roles* the codebase carries**, not the number of distinct
addresses.

Two sub-principles inherited from the color substrate's worked
example apply uniformly to every Pass-2 substrate decision:

- **Snap-by-cluster** (the consolidation move). When surveyed
  values fall within JND of each other and serve the same role,
  collapse them. The color sweep's 380 literals → 16 base
  anchors was a 23:1 consolidation; the same shape is plausible
  for every scale category in this inventory. Ten font-sizes
  likely resolve to four or five roles (tiny / body / emphasis /
  heading-sm / heading-md) with the rest absorbed; seven
  letter-spacings to three (tight / default / wide); twenty-two
  transition durations to three or four (fast / default /
  linger / pulse). The Pass-2 substrate's job is to **answer the
  design question of how many roles the codebase actually has**,
  not to faithfully reproduce every authored-by-hand value.

- **Decouple-via-alias** (the disambiguation move). When two
  values *match by accident* but represent semantically distinct
  roles, do not merge them in the substrate. Add the role anchor
  and initially alias it to whichever existing anchor happens to
  share the value. The chrome substrate's
  `--player-white: var(--state-error)` is the worked example;
  the principle is recorded in `docs/notes/deferred-items.md`'s
  "Anchor role overloading" entry. Snap-by-cluster says *fewer
  roles when consolidation is honest*; decouple-via-alias says
  *more roles when consolidation would flatten meaning*. The two
  compose: each Pass-2 substrate first chooses the role taxonomy
  (design judgement, named explicitly), then mechanically snaps
  each inventoried literal to its nearest declared role.

The cluster summary's per-category anchor counts (~5 spacing
anchors for ~150 sites, ~7 font-size anchors for ~150 sites, 4
z-index tiers for 8 sites) assume this discipline. Without it,
the audit produces a dictionary of literals; with it, the audit
produces a vocabulary.

---

## Existing SSOT baseline (what's already centralised)

Recording the baseline so Pass 2's substrates compose with it
rather than overlap.

- **`src/engine/constants.ts`** — board geometry: `BOARD_PX = 600`,
  `LABEL_FONT_SIZE = 11`, `LABEL_BAND = 9`, `LABEL_INSET_RATIO =
  0.65`, `TOTAL_PX`. Plus the band-3 Go-bound colors `BOARD_COLOR`,
  `LINE_COLOR`, `LABEL_COLOR`. Plus `ALL_X_LABELS`. Each named with
  rationale-bearing JSDoc. The shape Pass 2's substrates should
  emulate.
- **`src/assets/css/theme.css`** — chrome color SSOT: 16 base
  anchors (4 surface / 3 border / 3 text / 2 accent / 4 semantic
  state), 6 chart-derived helpers, 5 role aliases. The plan's
  worked example.
- **`src/utils/theme-color.ts`** — runtime accessor + `ChromeAnchor`
  literal union (typed mirror of `theme.css`'s `:root`). Throws on
  missing per ADR-0002. The hand-maintained-mirror pattern with
  documented playbooks for add/rename/remove.
- **`src/assets/css/style.css`** — global chrome rules. Imports
  `palettes.css`. All chrome reads from `theme.css` via `var()`.
- **`src/config/env.ts`** — env-driven URL fallbacks
  (`API_BASE_URL`, `KATAGO_WS_URL`).
- **`src/lib/utils.ts`** — `debounce`, `isObject`, `deepMerge`. Not
  itself a substrate; a utility hub.
- **`src/store/defaults.ts`** — full default-store shape; many
  values that look like magic literals are actually *named
  defaults* here (with `stepDelayMs`, `windowDurationMs`,
  `defaultVisits`, etc. as object keys). The default declarations
  are the named handles; what's missing is reuse — composables and
  components inline the same defaults instead of importing them.
- **`store/defaults.ts:8`** `NIL_UUID` constant — single named
  reference; clean.

**Color category swept clean (post-A4).** Every hex literal outside
`theme.css` is now either (a) a named domain constant in `engine/`,
(b) a `theme-exception` block with inline rationale, or (c) inside
the band-3 board renderers (`engine/board-renderer.ts`,
`BoardWidget.vue` ownership). Twenty `theme-exception` comments
already exist as the convention's worked precedent.

---

## CSS-side findings

### A. Animation durations (transitions)

**Cluster:** four distinct values across ~25 sites.

| Value  | Site count | Representative sites                                                        |
|--------|-----------:|-----------------------------------------------------------------------------|
| `0.1s` | 2          | `TreeWidget.vue:256`, `TreeWidget.vue:259`                                  |
| `0.12s`| 4          | `style.css:68`, `:93`, `:108`; (tab-thumb transitions across the file)      |
| `0.15s`| 6          | `Toolbar.vue:79`, `QeuboToolbar.vue:170`, `:185`, `QeuboBookmarks.vue:136`, `AnalysisTimelinePanel.vue:143`, `App.vue:555` |
| `0.2s` | 9          | `App.vue:528`, `TabWidget.vue:78`, `BoardTab.vue:128`, `:151`, `ForestDirectory.vue:204`, `:219`, `StatusBar.vue:97`, `HorizontalTimelineVisualizer.vue:336`, `:353`, `CardSetEditor.vue:231` |
| `1s`   | 1          | `QeuboToolbar.vue:192` (`pulse` animation)                                  |

**Verdict:** SSOT candidate. The codebase has an unnamed three-step
duration scale (snappy / default / lingering) plus a one-off pulse.
Affordance distinction between `0.1s`, `0.12s`, `0.15s` may be
within JND — Pass 2 should decide whether to collapse to two tiers
or keep three.

**Candidate substrate:** `theme.css` extension —
`--duration-fast: 0.12s` (or 0.1s if collapsed),
`--duration-default: 0.2s` (or `0.15s`),
`--duration-slow: 1s`. CSS-side consumers via `var()`; if a TS-side
consumer needs the value, follow the `theme-color.ts` pattern
(typed accessor with `ChromeAnchor`-style union).

### B. Easing functions

**Cluster:** `ease` keyword at 2 sites (`App.vue:555`,
`BoardTab.vue:128`); default linear elsewhere. One inline TS-side
`'opacity 60ms ease'` at `MoveSuggestions.vue:166, :178` — same
shape as MoveSuggestions's PV-stone animation config.

**Verdict:** N=3 with low-distinctiveness; arguably one-off. If the
duration substrate lands, easing tokens (`--ease-default`,
`--ease-bounce`) become the natural extension.

### C. CSS opacity values

**Cluster:** twelve distinct values across ~20 sites. Three sub-roles.

**(C.1) Disabled-state alpha** — buttons in disabled state.
- `0.35` — `AnalysisTimelinePanel.vue:146`
- `0.4`  — `QeuboToolbar.vue:183, :187`; `QeuboToolbar.vue:193` (pulse keyframe trough)
- `0.5`  — `LoginModal.vue:188`, `MintCardModal.vue:345`

Three values for the same role across five SFCs; the role is
"disabled-state opacity." SSOT candidate: `--alpha-disabled` with a
single chosen value (likely 0.4 or 0.5).

**(C.2) Modal scrim alpha** — backdrop overlay opacity in modals.
Mostly via `rgba(0, 0, 0, X)` pure-black-overlay form.
- `0.5`, `0.6`, `0.7`, `0.85`, `0.9` across 6 modal sites.

By the 2026-05-02 carve-out, pure-black/white rgba is **substrate-
exempt by class** (universal CSS decoration vocabulary, not theme-
specific chrome). Listed for completeness, not as audit targets.

**(C.3) Decoration / hover alpha** — visualization, borders, dots.
- `0.05`, `0.1`, `0.15`, `0.2`, `0.3`, `0.5`, `0.8`, `0.95`
- Mixed roles: ColorDebugStrip dim (0.3), HorizontalTimelineVisualizer
  grid-lines (0.1), color-mix percentages (5/8/10/15/30/40/80%).
- Some are theme-exceptions already (HorizontalTimelineVisualizer
  block-exception); others are inline without justification.

**Verdict:** disabled-state is a clean SSOT candidate. The
decoration alphas form a partial "alpha scale" (5/10/15/30/40/80%)
that already shows up in `color-mix` percentages — a
`--alpha-{very-low,low,medium,high}` scale is plausible but may be
over-specification. Pass 2 to decide.

### D. z-index strata

**Cluster:** five distinct values across 8 sites.

| Value  | Site                                   | Role                          |
|--------|----------------------------------------|-------------------------------|
| `10`   | `MintCardModal.vue:323`                | suggestion dropdown above modal body |
| `10`   | `HorizontalTimelineVisualizer.vue:370` | brush handle above grid       |
| `50`   | `App.vue:528`                          | panel-resizer above panels    |
| `1000` | `LoginModal.vue:151`                   | login modal scrim             |
| `9999` | `ConfirmLoadModal.vue:72`              | confirm modal scrim           |
| `9999` | `MintCardModal.vue:263`                | mint modal scrim              |
| `9999` | `FloatingThumbnail.vue:28`             | drag-preview thumbnail        |
| `99999`| `RootErrorBoundary.vue:69`             | error overlay (above all)     |

**Verdict:** clean SSOT candidate — a 4-tier z-index ladder
(`--z-content`, `--z-popover`, `--z-modal`, `--z-overlay`). The
inconsistency (`1000` vs `9999` for two modal scrims) is exactly
the drift the audit names: same role, different literal, no
compiler check. Pass 2 should pick a tier per role and sweep all 8
sites.

### E. Pixel dimensions — font-size scale

**Cluster:** ten distinct values across ~150 sites.

| Value | Approx site count | Role-bearing sites                              |
|-------|------------------:|-------------------------------------------------|
| `8px` | ~5                | tiny labels (PaletteEditor:476, ColorDebugStrip)|
| `9px` | ~10               | metadata, axis labels                           |
| `10px`| ~50               | **body default** (set in `style.css:29`)        |
| `11px`| ~25               | secondary body, control-row text                |
| `12px`| ~20               | emphasised body, headings                       |
| `13px`| ~3                | small headings                                  |
| `14px`| ~10               | section headings                                |
| `16px`| ~3                | larger headings                                 |
| `18px`| ~2                | dialog titles                                   |
| `20px`| ~2                | hero text                                       |

**Verdict:** SSOT candidate. The codebase has an unnamed type
scale; the dominant body is 10px (set as inheritance default), but
~150 sites repeat the explicit value. Candidate substrate:
`--text-tiny: 8px`, `--text-small: 9px`, `--text-body: 10px`,
`--text-emphasis: 11px`, `--text-medium: 12px`, `--text-heading-sm:
14px`, `--text-heading-md: 16px`, `--text-heading-lg: 18px`. The
13px and 20px stragglers are SSOT-or-justified-inline decisions for
Pass 2.

### F. Pixel dimensions — spacing scale (gap / padding / margin)

**Cluster:** values dominated by 4 / 6 / 8 / 10 / 12 px.

Padding distribution (counts from the `padding:` shorthand):
6px (×37), 4px (×26), 8px (×24), 10px (×23), 12px (×22), 15px
(×13), 1px (×11), 2px (×6), 5px (×5), 3px (×4).

Gap distribution: 4px (×16), 6px (×9), 8px (×11), 10px (×11), 12px
(×4), 3px (×3), 15px (×2).

**Verdict:** strong SSOT candidate — the codebase has an implicit
4-step scale (4/6/8/10/12) that no file declares. Candidate
substrate: `--space-1: 4px`, `--space-2: 6px`, `--space-3: 8px`,
`--space-4: 10px`, `--space-5: 12px`, with `--space-6: 15px` for
the larger gaps that show up in StatusBar and similar. The 1/2/3/5
px stragglers (~25 sites) are the inline-justification candidates
— mostly hairline borders or fine-tuning.

### G. Pixel dimensions — border-radius scale

**Cluster:** 2 / 3 / 4 / 6 px + 50% (circle) + 0%.

Distribution: 3px (×11), 4px (×6), 2px (×4), 6px (×2), 50% (×3),
0% (×1).

**Verdict:** clean SSOT candidate — a 4-step radius scale plus a
named circle. Candidate substrate: `--radius-sm: 2px`, `--radius:
3px`, `--radius-md: 4px`, `--radius-lg: 6px`, `--radius-circle:
50%`.

### H. Pixel dimensions — border-width

**Cluster:** 1px (×63), 2px (×3 in BoardTab review-state border).
Plus `border-width: 3px` × 3 in BoardTab review-state thicker border.

**Verdict:** already disciplined — 1px is the universal default
(no value-substitution would clarify), and the 2px / 3px BoardTab
sites are a single coherent role (review-state thickness). One-off
inline-justification candidates.

### I. Pixel dimensions — fixed layout sizes

**Cluster:** layout-specific dimensions that don't fit a scale.

- `108px` — sidebar width (`style.css:47`)
- `272px` — tree panel width (`style.css:256`)
- `300px` / `200px` — tabs container width / min-width (`style.css:122-123`)
- `26px` / `28px` / `34px` — status-bar / tree-header / toolbar heights
- `88px` — tab-thumb dimensions (`style.css:62-77`, ×4)
- `17px` / `34px` — sidebar add/load button sizes (`style.css:83-99`)
- `420px` — modal width (`MintCardModal:268`, `ConfirmLoadModal:76`) — N=2 cluster
- `360px` — login modal width (`LoginModal:158`) — N=1
- `120px` — `sizePx: 120` in `defaults.ts:158`
- `340px` — `controlPanelWidth: 340` in `defaults.ts:215`

**Verdict:** Mostly one-off-justified. The two `420px` modal-width
sites are a partial cluster (with `360px` LoginModal as a near-miss);
either name a `--modal-width-default` and `--modal-width-narrow`, or
inline-justify each (modal-width is design-decision territory, not
substrate).

### J. Letter-spacing

**Cluster:** seven distinct values across ~20 sites.

| Value    | Site count | Role                                             |
|----------|-----------:|--------------------------------------------------|
| `0.05em` | 9          | toolbar buttons, secondary labels                |
| `0.06em` | 1          | status-bar (`style.css:247`)                     |
| `0.08em` | 1          | qeubo-toolbar busy-dot row                       |
| `0.1em`  | 8          | uppercase headings (charts, tabs)                |
| `0.12em` | 1          | toolbar uppercase                                |
| `0.16em` | 2          | tree-panel header, settings tab                  |
| `0.18em` | 3          | control-tab labels (`style.css:204, :213, :222`) |

**Verdict:** SSOT candidate — three dominant tiers (0.05 / 0.1 /
0.18) plus stragglers (0.06, 0.08, 0.12, 0.16). Candidate substrate:
`--tracking-tight: 0.05em`, `--tracking-default: 0.1em`,
`--tracking-wide: 0.18em`; the four straggler values are inline-
justification candidates (or fold into the nearest tier).

### K. color-mix percentages

**Cluster:** 5%, 8%, 10%, 15%, 30%, 40%, 80% across ~12 sites.

These are alpha-modulation percentages on chrome anchors, not
free-floating colors. Already a successor to the 2026-05-02 substrate
sweep (state-color rgba derivatives → `color-mix(in srgb, var(--X)
N%, transparent)`). The percentages themselves are local design
decisions.

**Verdict:** the 5% / 10% / 15% cluster (×8 sites) is a partial
SSOT candidate — `--alpha-faint: 5%`, `--alpha-low: 10%`,
`--alpha-medium: 15%` would absorb most. The 30/40/80% values are
one-off-justified. CSS-side caveat: CSS variables can't be embedded
inside `color-mix()` percentages without `calc()` — implementation
shape needs Pass 2 attention.

---

## TS-side findings

### L. Geometry multipliers — the triggering specimen

**Cluster:** the audit's named source. The "stone radius from cell"
handle expressed as `cell * 0.46` at three independent sites.

| Site                            | Code                                     | Role                       |
|---------------------------------|------------------------------------------|----------------------------|
| `engine/board-renderer.ts:21`   | `const stoneR = cell * 0.46;`            | server-side (?) renderer   |
| `components/BoardDisplay.vue:38`| `const stoneR = computed(() => cell.value * 0.46);` | live board renderer |
| `components/MoveSuggestions.vue:108`| `const stoneR = computed(() => cell.value * 0.46);` | suggestion overlay |

Plus second-order multipliers within those sites:
- `stoneR * 0.4` × 2 (`BoardDisplay.vue:210` last-move marker,
  `board-renderer.ts:48` preview marker)
- `stoneR * 1.01` (PV stone radius, `MoveSuggestions.vue:160`)
- `stoneR * 0.72` (PV order font-size, `:193`)
- `stoneR * 0.62` (PV text vertical offset, `:200`)
- `stoneR * 0.58` (PV winrate font-size, `:202`)
- `stoneR * 0.82` (PV PV-text font-size, `:229`)

**Verdict:** the named-by-the-plan SSOT candidate. The plan
recommends a `useBoardGeometry` composable + a shared `<Stone>`
component; this inventory confirms the shape. Pass 2's geometry
substrate should:
- Centralise `stoneR = cell * 0.46` in one place (composable).
- Either name the second-order multipliers (`PV_STONE_R_MULT`,
  `LAST_MOVE_MARKER_MULT`, etc.) or inline-justify them.
- Resolve whether `0.4`, `0.46`, `0.62`, `0.72` etc. are
  truly-magic or members of a typographic / proportion scale.

### M. Other geometry / projection multipliers

- `BoardWidget.vue:34` — `Math.min(0.85, mag * 0.85)` — band-3 Go-bound
  (ownership intensity ceiling). Domain literal; named via the
  existing `LIVENESS_GAMMA`-shaped pattern in `engine/`?
- `BoardWidget.vue:49` — `opacity: 0.95` — band-3 (liveness display).
- `BoardTab.vue:116` — `0.6 + energy * 0.4` — geiger-dot scale
  derivation. Inline animation tuning.
- `charts/BaseChart.vue:71` — `range * 0.1` — chart Y-axis margin.
  Cluster of one; inline-justify.

**Verdict:** mostly band-3 domain (Go-bound) — these are not chrome
literals, they're domain visualization decisions. Pass 2 should
either name them in `engine/constants.ts` (extending the BOARD_PX
shape) or accept inline justification.

### N. setTimeout / setInterval delays

**Cluster:** raw millisecond literals.

| Value (ms) | Site                                           | Role                              |
|------------|------------------------------------------------|-----------------------------------|
| `1`        | `use-pv-animation.ts:208`                      | next-tick scheduler               |
| `50`       | `useEChartsForestRender.ts:118`                | render scheduling                 |
| `100`      | `charts/BaseChart.vue:276`, `HeatmapChart.vue:134` | chart init delay (×2 — cluster) |
| `150`      | `MintCardModal.vue:122`                        | suggestions hide delay            |
| `1000`     | `analysis-service.ts:70`                       | watchdog interval                 |
| `1000`     | `sync-service.ts:210`                          | persistence debounce default      |

Plus the named values from `defaults.ts` (and duplicated in
`use-pv-animation.ts:95-97`):
- `stepDelayMs: 350`
- `windowDurationMs: 600`
- `fadeDurationMs: 150`
- `debounceInterval: 1000`

**Verdict:** mixed.

- The `100ms` chart-init delay is a clean N=2 cluster — name it
  (`CHART_INIT_DELAY_MS` or similar; inline-justify the rationale,
  which is "wait for ECharts container to lay out").
- The `defaults.ts` values are *named* but their consumers
  (`use-pv-animation.ts`) also declare local defaults of the same
  values. The structural shape matches the gradingParameter Item-18
  finding (two sources of truth, no compiler check). **However, the
  four values may be pairwise-calibrated** for the repeating-window
  animation's intended visual rhythm — naming the divergence as a
  redundancy could flatten an invariant the values hold. A recent
  fix to the PV-animation code may have decoupled the interaction;
  the determination is uncertain. **The consolidation question is
  set aside** for this audit pending investigation; recorded in
  `docs/notes/deferred-items.md`'s "PV-animation defaults —
  pairwise-calibration question" entry. This surfaces a third
  pattern beyond snap-by-cluster and decouple-via-alias: **co-tuned
  constants**, values whose individual identities are subordinate
  to a calibrated relationship.
- The one-off delays (`1`, `50`, `150` MintCardModal, `1000`
  watchdog) are inline-justification candidates.

### O. Domain thresholds

- `100000` — ponder maxVisits cap. Two sites:
  `BoardTab.vue:68` (`Math.max(target, 100000)`),
  `analysis-service.ts:220` (ponder mode `maxVisits: 100000`).
  Same role, different sites, no shared name.
- `1000` — `defaultVisits` (`defaults.ts:147`) and fallback in
  `store/index.ts:268`'s migration. Already named in
  `defaults.ts`; the migration site should reference it.
- `0.15` / `0.5` — `reportDuringSearchEvery` for ponder vs analysis
  modes (`analysis-service.ts:220`). Inline-justify (mode-specific
  cadence).
- `999` — user_order fallback in palette default expressions
  (`defaults.ts:53, :57`). Twice in the same file; the value is the
  "treat-missing-userMove as last" convention. Could be `MISSING_USER_ORDER`
  or inline-justify with the "max-rank fallback" rationale.

**Verdict:** the `100000` ponder-cap is a clean SSOT candidate
(`PONDER_MAX_VISITS` in `engine/constants.ts` or
`engine/katago/types.ts`). The defaults divergence (`use-pv-animation.ts`
duplicating `defaults.ts` values) is the most concerning instance —
identical numeric defaults declared in two files with no compiler
check. Pass 2 should sweep this.

### P. URL path strings

**Cluster:** ~15 distinct paths used as request() arguments,
scattered across services.

Paths in use (extracted from `services/api-client.ts`,
`backend-service.ts`, `qeubo-service.ts`, `sync-service.ts`):
- `/auth/register`, `/auth/token`, `/auth/me`
- `/cards/`, `/cards/{card_id}`, `/cards/{card_id}/review`
- `/forests/query`
- `/qeubo/experiment`, `/qeubo/experiment/status`,
  `/qeubo/experiment/pair`, `/qeubo/experiment/preference`,
  `/qeubo/experiment/best`, `/qeubo/experiment/history`
- `/documents/{key}` (sync-service)
- `/resources`, `/resources/{name}`

The wire types in `src/types/backend.ts` already declare these as
the keys of the `paths` object (it's the OpenAPI codegen artifact).
Consumer sites repeat them as raw string-template literals.

**Verdict:** SSOT-shaped but on the boundary — paths are wire
contract, and `types/backend.ts` is generated. Two plausible
shapes:
- (a) Hand-named `paths.ts` constants (`AUTH_TOKEN = '/auth/token'`)
  with inline justification at `request()` calls — small refactor,
  centralised reading.
- (b) Type-level extraction from `backend.ts` (e.g. `keyof paths`),
  surfaced as a typed helper. More elaborate; only worth it if
  consumer sites would benefit from auto-completion against the
  generated path set.

Defer to Pass 2 for the choice; the literals' duplication is real
either way.

### Q. Discriminated-union `kind` strings

**Cluster:** ~15 sites declaring `kind: 'literal'` in
`AuthState`, `useCardTreeProjection`'s node taxonomy, etc.

**Verdict:** **NOT magic literals.** These are the typed design
vocabulary — the literal IS the named handle, and TypeScript's
exhaustiveness checking is the compiler-level enforcement the
audit's framing demands. Listing for completeness, to disclaim.

### R. Vue `emit()` event names

**Cluster:** 17 SFCs use typed `defineEmits<{ ... }>()` with
literal-typed event names; 2 use the array form
(`BaseChart.vue:38` — `defineEmits(['index-click', 'index-hover'])`,
`RegistryEditor.vue:15` — `defineEmits(['update'])`).

**Verdict:** mostly disciplined. The two array-form sites are an
audit-adjacent typing inconsistency, not a magic-literal — emit
names are local to a parent-child SFC pair, and `defineEmits<>()`
is the typed handle. Pass 2 may sweep the two stragglers to the
typed form for uniformity, but it's not a substrate question.

### S. DOM event names (`addEventListener`)

`'mousemove'`, `'mouseup'`, `'wheel'`, `'mouseenter'`,
`'mouseleave'`, `'keydown'`, `'abort'`, `'touchmove'`, `'touchend'`,
`'click'`, etc.

**Verdict:** **NOT magic literals.** These are W3C-standard DOM
event names — the literal IS the handle. The DOM API's TypeScript
typings provide compile-time checking. Listing for completeness, to
disclaim.

### T. Migration version strings, theme IDs, palette IDs

`'ebisu-dark'`, `'ebisu-light'`, `'default_ebisu'`, `'default'`,
`'quality_delta'`, `'min_summary'`, `'visit_entropy'`, `'winrate'`,
`'score_lead'`, `'place'`, `'pass'`, `'fromCurrent'`, `'from1'`,
`'sequential'`, `'instant'`, `'window'`.

These appear in `store/migrations.ts`, `store/archived-migrations.ts`,
and `store/defaults.ts` (and at consumer call sites).

**Verdict:** mixed. Some are wire-contract values (palette `id`,
`delta_fn` field values) — the wire is the SSOT, and these are
projections of it. Some are migration-frozen strings (theme IDs
that were valid at old versions). Some are typed enums in disguise
that lack a typed declaration.

The clean ones are typed via `'instant' | 'sequential' | 'window'`
unions in domain types. The migration-frozen strings should stay
literal-and-commented (per ADR-0005's "don't rewrite migration
history" spirit). The wire-projection ones are part of the larger
"typed wire vocabulary" question — out of scope for this audit.

---

## Adjacent observations (not audit-class targets)

These surfaced during the inventory and are filed for completeness.

- **`HorizontalTimelineVisualizer.vue` chrome (slate-950 /
  slate-700 / slate-400 / sky-400)** — already documented as a
  block-level theme-exception with rationale. The 5 `rgba(56, 189,
  248, X)` sites are the slate-aligned secondary visual identity;
  whether to fold them into the chrome substrate is a separate UX
  decision (would lose the slate tint for grayscale surface
  anchors). Not an audit finding.
- **`/* magic-literal: ... */` convention does not yet exist.**
  Pass 2 will establish it (parallel to `/* theme-exception: ... */`
  from the color substrate). Suggested form:

  ```css
  /* magic-literal: <reason — why this value, why local, why not in scale> */
  ```

  And TS-side:

  ```ts
  // magic-literal: <reason>
  const RAW_NUMBER = 0.42;
  ```

- **Two-site default divergence between `defaults.ts` and
  `use-pv-animation.ts` — set aside.** The composable declares
  its own defaults for `stepDelayMs`, `windowDurationMs`,
  `fadeDurationMs`, `pvOpacity` with the same numeric values as
  `defaults.ts`. The structural shape matches the gradingParameter
  Item-18 finding (two sources of truth, no compiler check), but
  the four values may be **pairwise-calibrated** for the repeating-
  window animation's intended visual rhythm. If the values are
  co-tuned, the audit's two working principles (snap-by-cluster,
  decouple-via-alias) don't apply — "co-tuned constants" is a
  third pattern that wants the calibration named explicitly rather
  than the duplication removed. A recent fix may have decoupled
  the pairwise interaction; the determination is uncertain. The
  consolidation question is set aside pending investigation;
  recorded in `deferred-items.md`'s "PV-animation defaults —
  pairwise-calibration question" entry.

---

## Cluster summary

What wants to become a substrate, in rough priority order:

| Tier | Cluster | Sites | Substrate shape |
|------|---------|------:|-----------------|
| 1    | z-index ladder           | 8   | `theme.css` + naming convention; trivial    |
| 1    | Animation duration scale | 22  | `theme.css` extension (3-4 anchors)         |
| 1    | Geometry (cell / stoneR) | ~10 | `useBoardGeometry` composable + `<Stone>`   |
| —    | TS-side timer / defaults divergence | 4 | **Set aside** — pairwise-calibration question; see adjacent observations + `deferred-items.md` |
| 2    | Spacing scale (gap/padding/margin) | ~150 | `theme.css` extension (5 anchors)        |
| 2    | Font-size scale          | ~150| `theme.css` extension (~7 anchors)          |
| 2    | Border-radius scale      | ~30 | `theme.css` extension (4 anchors)           |
| 2    | Letter-spacing scale     | ~20 | `theme.css` extension (3 anchors)           |
| 3    | Disabled-state alpha     | 5   | Single `--alpha-disabled` anchor            |
| 3    | color-mix alpha scale    | 8   | 3-anchor alpha scale (faint/low/medium)     |
| 3    | URL path constants       | ~15 | `services/paths.ts` (or typed extraction)   |
| 3    | Ponder-cap visit count   | 2   | `engine/constants.ts` extension             |
| 4    | Modal-width pseudo-cluster | 3 | Inline-justify; partial cluster only        |
| 4    | Easing tokens            | 3   | Optional after duration scale lands         |

**Tier 1** = small, well-bounded, high signal-to-effort. The
geometry substrate is the plan's named "second worked example"
(after color); the others are similarly clean.

**Tier 2** = the bulk of the residue. Spacing, font-size,
border-radius, letter-spacing — each a single-substrate sweep that
touches every SFC. Methodology is the same as the color sweep
(survey → cluster → snap-by-cluster → sweep with explicit
exceptions).

**Tier 3** = smaller, partial-cluster substrates. Each is one
small PR's worth.

**Tier 4** = inline-justification rather than substrate. Pass 2
should establish the `magic-literal:` comment convention and apply
it to one-off literals.

---

## Recommended Pass 2 sequencing

The plan recommends "each substrate that emerges from Pass 2 lands
as its own small PR." The recommended order:

1. **z-index ladder** (Tier 1, smallest possible substrate). 4
   anchors, 8 sweep sites. Establishes the convention without
   committing to scale shapes; closes the modal-scrim drift
   (1000 vs 9999) immediately. ~1 PR.
2. **Animation duration / easing tokens** (Tier 1). Three or four
   anchors, ~25 sweep sites. ~1 PR.
3. **Geometry substrate** (Tier 1). `useBoardGeometry` composable
   + shared `<Stone>` (or named multipliers). Closes the
   `* 0.88` triggering specimen and the three-site `cell * 0.46`
   duplication. ~1-2 PRs (composable, then sweep).
4. **Spacing scale** (Tier 2). ~5 anchors, ~150 sweep sites. The
   second-largest sweep after color. ~1 PR (or 2-3 if split by
   region as the color sweep was).
5. **Font-size scale** (Tier 2). ~7 anchors, ~150 sweep sites.
   ~1-2 PRs.
6. **Border-radius scale** (Tier 2). ~4 anchors, ~30 sweep sites.
   ~1 PR.
7. **Letter-spacing scale** (Tier 2). ~3 anchors, ~20 sweep
   sites. ~1 PR.
8. **Tier 3 substrates** — disabled-alpha, color-mix alpha
   scale, URL paths, ponder-cap constant. Each ~1 small PR.
9. **Tier 4 inline-justification sweep**. Establish the
   `magic-literal:` comment convention; sweep remaining one-offs
   that don't fit any substrate. The audit's *deliverable* — the
   contract is satisfied when this sweep closes.

**Set aside, not in the sequence:** the `defaults.ts` ↔
`use-pv-animation.ts` consolidation (originally Tier-1 #2 in an
earlier draft of this section). The values may be pairwise-
calibrated for the repeating-window animation; until that's
investigated, the audit doesn't touch them. Recorded in
`deferred-items.md` and in this inventory's adjacent observations.

The scale-related substrates (Tier 2: spacing, font-size,
border-radius, letter-spacing) follow the snap-by-cluster rule
established in the color sweep's A2: snap each surveyed literal to
its closest scale-anchor by absolute distance, ties broken by
context. The within-JND collapse risk is acknowledged but bounded.

Each emerging substrate that touches `theme.css` extends the
`ChromeAnchor` literal union in `theme-color.ts` in lockstep, per
the SSOT discipline already documented there.

---

## What this inventory deliberately does not cover

- **Backend literals.** The plan defers backend scope; the
  Python idioms differ and the methodology may need adjustment.
  This audit is frontend-only.
- **Generated files.** `src/types/backend.ts` is the OpenAPI
  codegen artifact; its literal contents are not authored, they
  are projected from the backend's wire schema. Out of scope by
  construction.
- **Trivial literals.** Loop bounds (`i < n`), array-indexing
  constants (`arr[0]`, `arr[1]`), boolean-equivalents, mathematical
  identities (`Math.PI / 2`). The threshold is *could a future
  reader reasonably ask where this came from* — these values
  cannot.
- **Domain values inside band-3 modules.** `engine/`'s Go-bound
  literals (board renderer stone-fill colors, ownership colour
  thresholds, suggestion-color cluster palettes) are domain
  decisions, named at module level with rationale-bearing
  context. They are not audit targets.
- **Block-level theme exceptions** (`HorizontalTimelineVisualizer`).
  These already carry the in-scope inline-justification convention
  for the color substrate; the audit accepts them as-is.
- **Migration-frozen strings** (`'ebisu-dark'`, etc. in
  `archived-migrations.ts`). Migrations document past schema
  states; rewriting their literals would falsify the migration
  record. Per ADR-0005's spirit, leave them.

---

## Verification

The Pass 1 contract (per the plan): "for each hit, capture
file:line, the surrounding context, and a classification (which
category, which substrate it would belong in if one existed)."

This document satisfies that contract for the categories the sweep
covered. The classifications are working drafts — Pass 2 will
re-cluster as substrate decisions land.

The Pass 2 deliverable will measure against this inventory: a
final repo-wide grep for numeric/string literals outside SSOT files
and outside `magic-literal: <reason>`-commented sites should return
zero hits within the chosen scope.

**Open per-cluster judgement calls (Pass 2 to resolve):**

- Whether to collapse `0.1s` / `0.12s` / `0.15s` to a single
  fast-tier or keep two.
- Whether the spacing scale's straggler values (1, 2, 3, 5px) get
  named tiers or inline-justifications.
- Whether color-mix alpha percentages get named anchors (and how,
  given CSS variable interpolation in `color-mix()` requires
  `calc()`).
- Whether URL paths centralise as hand-named constants or as a
  typed extraction from `types/backend.ts`.
- Whether band-3 domain literals (`BoardWidget` ownership
  ceiling, suggestion-color cluster palettes) need any further
  substrate attention or are already named-at-module-level.

Each is a judgement call deferred to the substrate's own PR rather
than baked into Pass 1.

---

## License

Public Domain (The Unlicense).
