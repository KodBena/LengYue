# Frontend Theming — Design Note

**Status:** Implemented. The structural-substrate phase (A) closed
across PRs #80–#88 on 2026-05-02 (worklog series
`2026-05-02-theme-substrate-{a1..a4,a3a..a3f}.md`); theme
replacement (B) closed 2026-05-04 with a cluster-12 second theme
variant wired through `[data-theme]` (worklog
`2026-05-04-cluster-theme-variant.md`) plus a 2026-05-05
strict-palette follow-on. The remainder of this document is the
design record at the time of authoring. The "Substrate evolution
(post-implementation)" section captures the principles that have
hardened since closure and is the part still load-bearing for
future substrate-tuning work.

**Motivation:** color decisions are scattered across **four
locations with no enforced discipline** — CSS files
(`style.css`, `palettes.css`), SFC `<style>` blocks (scoped and
unscoped), inline template styles (`:style="..."` and
`style="..."`), and TypeScript constants (board renderer, ECharts
adapters, intensity LUT). The same hex value (`#4aaef0`) appears
~88 times across these surfaces; a contributor adding a new
component has no canonical place to look up "what's the active
color" and ends up either grepping (best case) or eyeballing a
nearby component and copying (common case). Either way the result
is a fresh literal added to the codebase, drifting further from
any imagined source of truth.

This is **a discipline failure of the kind ADR-0005 Rule 1
(single source of truth per nominal handle) was authored to
prevent**, applied to color. The handle "primary cyan accent" is a
nominal concept; ~88 sites is not "one source of truth," it is 88
trust points each of which can drift independently when a future
designer wants to nudge the accent. The same logic applies to
"default panel background," "border-default," "high-emphasis
text," and so on — each is a single nominal role currently
expressed as N independent literals.

**This refactor exists primarily to close the styling-confusion
gap, not to ship any particular theme.** Theming (light / dark /
maximin / etc.) becomes cheap once the substrate exists, but the
substrate's value is independent of any theme variant: every
color decision reads from one place; touching that place changes
every consumer; every consumer is auditable for "what role is
this color playing." A future theme is a side benefit.

The same shape — surveying a scattered design vocabulary,
clustering into roles, naming a substrate, sweeping consumers — is
intended to be a model for future style consolidations
(typography, spacing scale, animation timings, z-index). Each is
its own discipline failure waiting to be filed.

This document inventories where colors are decided, clusters them
into semantic roles, proposes a substrate, and **commits to a
post-refactor SSOT contract that names exactly where any future
color decision lives**. The parked maximin palette in
`src/assets/css/palettes.css` is acknowledged but not wired in;
the substrate is designed so that experiment, or any other, can
be plugged in without re-touching consumers.

---

## Survey — where colors are decided today

### Files involved

- `src/assets/css/style.css` — application-wide chrome rules. ~363
  lines; carries one CSS variable bridge (`--default-bg`) and a
  spread of literal hexes for borders, panels, hover states.
- `src/assets/css/palettes.css` — the parked maximin-contrast
  palette. Defines `--cluster-N-K` for N ∈ {2..15 or 16} and K the
  index within the cluster. Each cluster is an N-element set of
  colors hand-optimised for maximum minimum-pairwise contrast (the
  "maximin" framing). At present, only three cluster vars are
  consumed by `style.css`:
    - `--cluster-4-3` → `--default-bg` (body / sidebar / control
      panel background, near-white but visually covered by darker
      overlay panels).
    - `--cluster-4-1` and `--cluster-4-2` → scrollbar colors.
  No other site reads from the cluster vars. Treat the file as a
  parked theming substrate — its purpose is to keep an experiment
  available for a future "try a high-contrast theme" without
  forcing a decision on whether to use it now.
- Vue SFCs under `src/components/**/*.vue` and `src/App.vue` —
  scoped and unscoped `<style>` blocks plus inline template styles.
  This is the bulk of color decisions.
- TypeScript constants — chart adapters, board renderer constants,
  intensity-color computations.

### Roles found, clustered

The naming below is the working role taxonomy this document
proposes; it is not yet reflected in the source.

#### A. Core UI palette (chrome)

| Role | Today's value(s) | Approx site count |
|---|---|---|
| `--surface-0` (deepest panel background) | `#000`, `#050505`, `#0a0a0a` | ~6 |
| `--surface-1` (default panel background) | `#111`, `#181818` | ~13 |
| `--surface-2` (raised panel background) | `#1a1a1a`, `#1e1e1e` | ~17 |
| `--surface-3` (toolbar / header strip) | `#222`, `#252525` | ~12 |
| `--border-1` (subtle divider) | `#1f1f1f`, `#222`, `#242424` | ~14 |
| `--border-2` (default border) | `#333`, `#333333` | ~10 |
| `--border-3` (active / hover border) | `#444`, `#555` | ~14 |
| `--text-0` (high-emphasis text) | `#fff`, `#eee` | ~10 |
| `--text-1` (medium-emphasis text) | `#ccc`, `#aaa` | ~22 |
| `--text-2` (low-emphasis text) | `#888`, `#666`, `#363636`, `#484848` | ~25 |

The grayscale today has ~12 distinct values where 5 or 6 would
serve. The roles above collapse them into a stepped scale; values
within a step are within JND in practice.

#### B. Accent and semantic state

| Role | Today's value | Approx site count |
|---|---|---|
| `--accent-primary` (cyan, the dominant interactive accent) | `#4aaef0` | ~88 |
| `--accent-secondary` (orange, intermission / "Start review" CTA / planned for current-card overlay) | `#f0a04a` | ~3 today, more after Cards-merge |
| `--state-active` (review-active border, latency-bad) | `#ff4a4a`, `#ff4444` | ~3 |
| `--state-success` (engine connected, complete) | `#4caf50`, `#00ff88` | ~3 |
| `--state-warning` (the "warning" log level, qEUBO toolbar) | `#f0a04a` | ~2 |
| `--state-error` (delete actions, error empty-state, winrate-negative) | `#ff6b6b`, `#f04a4a` | ~5 |

These six semantic roles are the minimum viable set; the document
treats `--accent-primary`/`--accent-secondary` as the two
non-state accents, the four `--state-*` slots as semantic.

#### C. Data visualisation

`BaseChart.vue` and ECharts series are configured site-by-site.
Most reuse the core palette: `--accent-primary` for active markers,
`--text-2` for axis labels, `--surface-2` for gridlines. Two
exceptions worth pulling out:

- **Heatmap gradient** (`HeatmapChart.vue`, `StabilityPanel.vue`,
  triangular heatmap): currently `['#1a1a1a', '#4aaef0', '#f04a4a']`
  — surface → primary accent → state-error. This is already
  expressible in terms of the palette above; no new role needed.
- **Tree node fills** (`card-tree-echarts.ts`): `#4aaef0` (active),
  `#222222` (context), `#1a1a1a` (stub), `#0a0a0a` (bucket). All
  expressible as accent + surface scale.

#### D. Domain-meaningful colors (NOT to be themed)

These encode meaning, not chrome. Theming must leave them alone.

| Role | Value | Used in |
|---|---|---|
| Black-stone gradient | `#666` → `#111` (radial) | `BoardDisplay.vue` |
| White-stone gradient | `#fff` → `#d0d0d0` (radial) | `BoardDisplay.vue` |
| Stone outlines | `#000` (B), `#aaa` (W) | `BoardDisplay.vue` |
| Last-move ring (over white stone) | `rgba(0,0,0,0.6)` | `BoardDisplay.vue` |
| Last-move ring (over black stone) | `rgba(255,255,255,0.8)` | `BoardDisplay.vue` |
| Hoshi (star points) | `#222` | `BoardDisplay.vue` |
| Board background (wood) | `#dcb35c` | `src/engine/constants.ts` |
| Board grid lines | `#222` | `src/engine/constants.ts` |
| Board coordinate labels | `#444` | `src/engine/constants.ts` |
| Ownership overlay (white owns) | `#fff` × magnitude | `BoardHeatmapOverlay.vue` etc. |
| Ownership overlay (black owns) | `#000` × magnitude | same |

The board's wood color is on the boundary — arguably a chrome
choice (some users want a pale-wood vs. darker-wood preference) —
but for a first theming substrate, treat it as domain. A
`--board-wood` slot can be added later without disturbing anything.

#### E. Runtime-computed colors — entirely out of scope for theming

These are dedicated visualisation systems, separately designed, and
**not part of the chrome theme substrate**. Neither their functions
nor their anchor colors are theme-replaceable; a theme variant must
leave them untouched.

- **Visit-intensity LUT** (`src/engine/suggestion-colors.ts`):
  perceptually-uniform CIELAB interpolation from `COLOR_LOW`
  (`#cc3333`) to `COLOR_HIGH` (`#88cc44`), with a user-tunable
  hue shift (`session.profile.settings.appearance.intensityHueShift`).
  Best-move overlay uses `#00e5ff`. The anchors and the function
  are co-tuned for perceptual uniformity and confidence-coupled
  alpha; the user already has a deliberate control surface
  (`intensityHueShift`) for adjusting it. Theme swapping the
  anchors would defeat the design.
- **`ColorDebugStrip`** (`src/components/charts/ColorDebugStrip.vue`,
  rendered in the "Other" tab) — debug visualisation of the same
  intensity LUT. Out of scope by extension; it is a window onto the
  system above, not chrome.
- **`CLUSTER_PALETTES`** (`src/engine/suggestion-colors.ts:279`):
  hand-tuned discrete palettes for move-suggestion clusters,
  indexed by cluster size 2..16. *Distinct from the
  `palettes.css` cluster system* — same maximin-contrast spirit,
  different code path, actively consumed by
  `useMoveSuggestions`. The palettes encode an information-
  theoretic property (well-separated colors at every cluster
  size) that arbitrary theme swaps would defeat.

#### F. Parked / experimental

- **`palettes.css` cluster vars** (`--cluster-N-K`) — the maximin
  palette experiment. Wired into `style.css` only via three
  references (`--default-bg`, scrollbar). Otherwise dormant. Its
  presence in the codebase is intentional — it's an option the
  user wants to keep available for a future "try this theme"
  experiment — but its current contribution is minimal. Per
  authoring instruction, this document does **not** propose to
  weave it in; it merely notes the file's purpose so future
  contributors don't strip it as dead code.

---

## Proposed substrate

A single CSS variable scope at `:root` (or a class-scoped variant
for theme variants). The values below are proposed defaults that
match the codebase's current dark theme; swapping the values to
test a different theme is a one-file edit.

### Honest count

Counting text and background as first-class modalities (not
gerrymandered into a "one decision, just a scale" sidebar), the
codebase semantically requires more than 8 distinct anchors. The
honest minimum, working from how the existing rendering actually
uses color:

- **4 surface tones.** The dark theme genuinely uses four levels
  of elevation: a deepest void (board panel, chart background),
  a default panel surface, a raised panel surface, and a
  toolbar/header strip. Collapsing below four flattens the
  layered feel that distinguishes panels from their containers.
- **3 border tones.** Subtle divider (within a panel), default
  border (panel edge / input), strong (focus, hover, active).
  Borders genuinely operate at three contrast levels against the
  surface tones; collapsing breaks either the focus signal or the
  panel-edge readability.
- **3 text emphases.** High / medium / low. The codebase uses all
  three: high for titles and primary content, medium for body
  copy, low for labels and hints. The Material-style "1 text
  anchor + 3 alpha levels" compression is available (see "Optional
  compression" below), but it adds a consumption-side rule and
  doesn't actually reduce the number of *decisions* a theme
  designer makes — they still pick the base text color and verify
  the alpha-derived emphases read correctly against every surface.
- **2 accent tones.** Primary (cyan; active/interactive) and
  secondary (orange; SR / CTA / current-card overlay). Two
  distinct roles, observed in the codebase.
- **4 semantic states.** Success, warning, error, attention.
  Warning and the secondary accent share `#f0a04a` today but
  are separate roles for theming freedom. Attention is a
  distinct role from error: hotter red, used for review-active
  border and latency-bad (where error is reserved for delete /
  destructive actions and winrate-negative).

That's **16 anchors**. Honestly counted.

If the brief's spirit ("avoid decision fatigue") is taken as
"keep the theme designer's surface manageable rather than
exactly ≤8," 16 is reasonable: it is *one* decision per
*role*, with no role redundant. If the brief's letter is held to
strictly, the 16 won't fit, and one of the compression options
below has to be taken — at the cost noted.

### Default values

```css
:root {
  /* ── Surface (4) ─────────────────────────────────────────── */
  --surface-0: #000;     /* deepest — board panel, chart bg, score-lead */
  --surface-1: #111;     /* default panel — sidebar, input, content */
  --surface-2: #1a1a1a;  /* raised panel — control bar, app frame */
  --surface-3: #222;     /* toolbar / header strip / button-default */

  /* ── Border (3) ──────────────────────────────────────────── */
  --border-1:  #2a2a2a;  /* subtle — divider within a panel */
  --border-2:  #333;     /* default — input edge, panel edge */
  --border-3:  #555;     /* strong — focus, hover, active */

  /* ── Text (3) ────────────────────────────────────────────── */
  --text-0:    #fff;     /* high emphasis — titles, primary */
  --text-1:    #aaa;     /* medium — body copy */
  --text-2:    #666;     /* low — labels, hints, axis text */

  /* ── Accent (2) ──────────────────────────────────────────── */
  --accent-primary:   #4aaef0;  /* cyan — active interactive */
  --accent-secondary: #f0a04a;  /* orange — SR / CTA / current-card */

  /* ── Semantic state (4) ──────────────────────────────────── */
  --state-success:    #4caf50;  /* engine connected, complete */
  --state-warning:    #f0a04a;  /* warnings (identical to secondary
                                    today; theme variants may split) */
  --state-error:      #f04a4a;  /* delete, destructive, winrate-negative */
  --state-attention:  #ff4a4a;  /* review-active, latency-bad — hotter
                                    than error */
}
```

### Optional compression (if a smaller budget is mandated)

If the user genuinely wants ≤8 anchors and is willing to take the
visual cost, the compressions are:

- **Collapse text emphases via alpha** (`color-mix` or `rgba()`
  derivation from a single `--text-base`). Cuts text from 3
  anchors to 1, but adds a consumption-side rule (sites must use
  `--text-emphasis-low` etc. derived helpers, not the raw anchor)
  and shifts the verification burden to "confirm every emphasis
  reads against every surface."
- **Collapse `--state-warning` into `--accent-secondary`** if the
  theme is willing to commit them to the same hue forever.
  Saves 1.
- **Collapse `--state-attention` into `--state-error`** if the
  theme can live with a single hot-red role. Loses the
  review-active vs. delete-action distinction. Saves 1.
- **Drop one surface tone** (typically `--surface-1`, merging
  panel and raised). Loses the visual layering between sidebar
  and control panel. Saves 1.

A maximally-compressed version reaches ~10. Below 10 starts
visibly flattening the codebase's dark-layered feel.

### Recommendation

Keep the 16-anchor honest set. The brief's spirit (avoid decision
fatigue) is preserved — each anchor is one role, no redundancy —
even though the literal ≤8 isn't met. The brief was authored
before the survey; the survey's evidence is that 8 doesn't cover
the codebase's actual semantic vocabulary without lying about the
count or compressing into rules that move complexity rather than
remove it.

### Domain anchors (theme-aware but not theme-replaceable freely)

```css
:root {
  --board-wood:       #dcb35c;  /* main board color */
  --board-grid:       #222;     /* grid lines */
  --board-label:      #444;     /* coordinate labels */
  --stone-black-rim:  #111;
  --stone-black-core: #666;
  --stone-white-rim:  #d0d0d0;
  --stone-white-core: #fff;
}
```

These are exposed for completeness — a future "high-contrast
board" or "real wood texture" theme might want to override them —
but the substrate's promise is that the **default** values match
today's behaviour, and a non-Go-board-aware theme variant can
ignore them entirely.

### Heatmap and chart-specific roles

These are derived from the core slots, so they don't add to the
named set:

```css
:root {
  --heatmap-low:    var(--surface-2);
  --heatmap-mid:    var(--accent-primary);
  --heatmap-high:   var(--state-error);
  --chart-grid:     var(--border-1);
  --chart-axis:     var(--text-2);
  --chart-marker:   var(--accent-primary);
}
```

---

## Post-refactor SSOT contract

After the refactor lands, every color in the codebase falls into
**exactly one of three sources of truth**, with sharp boundaries
that a contributor can verify by inspection:

### 1. Chrome — `src/assets/css/theme.css` (new)

The 16 named anchors (4 surface + 3 border + 3 text + 2 accent +
4 state) plus their derived chart helpers (`--heatmap-*`,
`--chart-*`). Every chrome color in the codebase — every CSS
file, SFC `<style>` block, inline template style, TypeScript
chart-adapter call — reads from this file via `var(--name)` (or
through the `themeColor()` helper for runtime-string consumers).
**No chrome literal hexes survive the sweep.**

### 2. Domain — `src/engine/constants.ts` (existing, expanded)

Go-specific colors: `BOARD_COLOR`, `LINE_COLOR`, `LABEL_COLOR`,
plus the stone gradient stops (`STONE_BLACK_RIM`,
`STONE_BLACK_CORE`, `STONE_WHITE_RIM`, `STONE_WHITE_CORE`,
currently inline in `BoardDisplay.vue`'s template — hoisted as
part of the refactor), and the ownership/last-move overlay
colors. Every consumer of a domain color imports from this file.
**No domain color literal hexes survive the sweep.**

### 3. Visualisation systems — `src/engine/suggestion-colors.ts` (existing)

The visit-intensity LUT anchors (`COLOR_LOW`, `COLOR_HIGH`,
best-move overlay), `CLUSTER_PALETTES`, and any future
visualisation-specific palette. The `ColorDebugStrip` reads from
this file. Per Section E, these are out of scope for theming —
their colors encode information-theoretic properties that arbitrary
swaps would defeat. **No visualisation-system literal hexes
survive the sweep.**

### Boundary rule (so a contributor knows which file to touch)

The boundary is decided by what the color *is*, not where it
appears:

| The color is… | …it lives in |
|---|---|
| A chrome decision (UI surface, border, text, accent, state) | `theme.css` |
| A domain (Go) decision (board, stones, ownership) | `engine/constants.ts` |
| A visualisation-system anchor (intensity, cluster) | `engine/suggestion-colors.ts` |

A color literal anywhere else in the codebase is a refactor
violation. ADR-0002 (fail loudly) applies in spirit: the
violation surfaces in code review, and a follow-up CI grep can
make it a build-time error if the discipline starts to drift.

### What this delivers

- **A single grep target** for "what color is the primary accent"
  — `theme.css`. Today's answer requires touching 88 sites; the
  refactor reduces it to 1.
- **A single audit point** for "did anything regress?" — diff
  `theme.css`, `engine/constants.ts`, `engine/suggestion-colors.ts`
  before and after a change. Three files, three SSOTs.
- **A clear contributor question.** "What kind of color am I
  drawing?" → answers which file to touch. No more eyeball-and-copy
  from a nearby component.
- **A model for future style consolidations.** The same survey →
  cluster → substrate → sweep pattern applies to typography
  (font families, weights, sizes), spacing (margin / padding
  rhythm), animation (durations, easings), z-index ordering. Each
  is its own potential discipline failure; this refactor's shape
  is reusable for those.

### What this does *not* deliver

- **Pixel-level identity through themes.** Theme variants (light,
  maximin, etc.) intentionally produce different output. The
  promise is *value-level identity for the default theme* — the
  refactor produces the same rendered colors as today, just
  sourced through variables.
- **Constraint enforcement against hand-typed hexes in future
  edits.** A CI grep can be added separately as a follow-up; this
  refactor establishes the canonical structure but doesn't ship
  the lint rule. The rule could be: "any `#[0-9a-fA-F]{3,8}` or
  `rgb*(...)` literal outside the three SSOT files is a build
  error unless preceded by a `// theme-exception:` comment."
- **Domain color theming.** Section D's domain colors (Go board,
  stones) stay in `engine/constants.ts` as Go-specific constants.
  A future "high-contrast board" or "wood texture" feature would
  introduce its own user setting orthogonal to the chrome theme.

---

## Refactor sketch (for a future PR, not this one)

Three phases, mechanical work:

1. **Land the substrate.** Add the variable declarations to
   `style.css` (or a new `theme.css` imported before it), without
   changing any consumer. Verify everything still renders the same
   — every variable defaults to its current literal.
2. **Sweep consumers.** Replace literal hexes in SFCs and TS with
   the named variable references. SFCs use `var(--name)`; TS
   adapters that live in JS-rendered ECharts configs read the
   variables via `getComputedStyle(document.documentElement).getPropertyValue('--name')`,
   wrapped in a small `themeColor(name: string): string` helper
   in a new module. Domain colors (`src/engine/constants.ts`,
   `BoardDisplay.vue` stone gradients) are **left alone** for the
   first pass — they're domain-meaningful.
3. **Activate theme variants (optional, separate decision).**
   Once the substrate is in place, theme variants are class-toggled
   on `:root` or `<html>` (`html.theme-light { --surface-0: ... }`).
   Whether to ship a light theme, the maximin experiment, or stay
   single-theme is a separate UX call deferrable until the
   substrate exists.

The refactor is incremental and ADR-0004-friendly: each consumer
is a localised edit ("replace `#4aaef0` with `var(--accent-primary)`"),
no full-file rewrites required. ADR-0007's file-budget pressure is
unchanged — variable references don't add lines.

---

## Why this many, and the brief

The user's brief: **≤8 colors, fewer if usage allows, to avoid
decision fatigue when later picking a theme.** Counting honestly —
text and background as first-class modalities, not gerrymandered
into a sidebar — the ~60 distinct hex values found in the codebase
collapse to **16 semantic roles**:

- **4 surface tones** (deepest / default / raised / toolbar)
- **3 border tones** (subtle / default / strong)
- **3 text emphases** (high / medium / low)
- **2 accents** (primary cyan / secondary orange)
- **4 semantic states** (success / warning / error / attention)
- Plus the domain anchors (board, stones — separate concern).

The brief's spirit (each color = one decision, no redundancy) is
preserved: 16 anchors with no role duplicated. The brief's letter
(≤8) doesn't fit the codebase's actual semantic vocabulary without
either compressing into derived helpers (which moves complexity
rather than removes it) or visibly flattening the dark-layered
feel of the UI.

The recommendation is to take the 16 as honestly counted. If a
smaller budget is required, the "Optional compression" section
above lays out the trade-offs and where each saved anchor lands.

---

## Substrate evolution (post-implementation)

The structural implementation closed across PRs #80–#88 (worklog
series `2026-05-02-theme-substrate-{a1..a4,a3a..a3f}.md`). The
principles below govern how the substrate evolves after that
closure — surfaced as the codebase encounters specific tuning
needs and intended as settled direction for any future
substrate-tuning PR.

### Decouple-via-alias for implicit handles

When a substrate refactor finds a consumer borrowing an anchor
for a semantically distinct role (e.g., `--state-error` used as
"player W identifier" because both happen to be red), the fix is
**not** to merge the roles in the chrome taxonomy. The chrome
anchor's *value* is correct; the chrome anchor's *name* lies
about what it covers. Add a new role anchor in `theme.css` that
initially aliases the existing chrome anchor:

```css
--player-white: var(--state-error);
```

Sweep consumers to use the new role anchor. Visual is unchanged
at the time of the change; the SSOT contract gains an honest
handle for the implicit role; future tuning can break the
aliasing without disturbing chrome (e.g., `--state-error` can
shift toward orange while `--player-white` stays solidly red).

Worked examples currently in the substrate: `--player-black`,
`--player-white`, `--review-active`, `--review-intermission`,
`--review-complete` (added in PR `frontend/anchor-decouple-via-alias`,
worklog `2026-05-03-anchor-decouple-via-alias.md`).

The principle generalises beyond colour. Any future SSOT
refactor — typography, spacing, animation, z-index — will face
its own version of the role-coverage gap. Pre-emptively name
implicit handles even when their values overlap existing
anchors; the decouple-via-alias pattern preserves visual
identity while keeping the role taxonomy honest.

### Color-mix derivation over multi-tone anchor families

When a button family or interactive control appears to need a
hover variant, a border variant, or a muted variant of an
existing colour, **prefer one base anchor plus CSS-side
`color-mix()` at the use site over multiple new anchors**.

Anti-pattern (substrate sprawl):

```css
--accent-primary-muted:        #1a3a4a;
--accent-primary-muted-hover:  #2a5a7a;
--accent-primary-muted-border: #2a4a5a;
```

Preferred (one base + derivation):

```css
--accent-primary-muted: #1a3a4a;
.btn       { border-color: color-mix(in srgb, var(--accent-primary-muted), black 20%); }
.btn:hover { background:   color-mix(in srgb, var(--accent-primary-muted), white 15%); }
```

Rationale. Multi-tone discrete-gradient families per role (3
anchors × N families) contradict the brief's "each colour = one
decision, no redundancy." One base + `color-mix()` keeps SSOT
honest — one anchor is the source of truth — while letting use
sites express their state-derivative needs without naming each
variant. Browser support (Chrome 111+ / Firefox 113+ / Safari
16.4+) covers the project's target.

The trigger for adding a new base anchor (rather than deriving
from an existing one) is empirical: **the desired value cannot
be expressed as a small `color-mix()` derivation of an existing
anchor.** A substantively new tone earns a base anchor; hover
and border variants of an existing tone are derivations and
stay at the use site.

This direction settles several "missing-variant" candidates that
surfaced during the 2026-05-02 substrate sweep — the muted-cyan
action variants, the lightened-accent hover, the muted-state-
error surfaces — into "leave as theme-exception" or "introduce
one base anchor + color-mix derivation," not new multi-tone
anchor families.

---

## What this document deliberately does not do

- **Does not propose a specific theme to ship.** Today's dark
  theme is the default; whether to add a light theme, wire in the
  maximin palette, or stay single-theme is left for a future
  decision.
- **Does not specify the maximin palette's role.** The user noted
  the palette "may turn out to be all ugly"; this document
  preserves the experiment without committing to it. If the
  experiment is later validated, it slots into the substrate as
  a theme variant — `html.theme-maximin { --surface-0: ...; ... }`
   — without re-touching consumers.
- **Does not refactor any code.** Implementation lands later; this
  is the design note that the implementation will execute.
- **Does not retire `CLUSTER_PALETTES`** in
  `src/engine/suggestion-colors.ts`. That system is information-
  theoretically distinct (well-separated cluster colors at every
  size) and not interchangeable with the chrome palette.
- **Does not theme the visit-intensity LUT or its debug strip.**
  Per Section E, the move-suggestion intensity gradient and the
  `ColorDebugStrip` that visualises it are dedicated systems with
  their own user-facing control (`intensityHueShift`); the theming
  substrate must leave their anchors alone.

---

## Verification checklist (for the eventual implementation PR)

- **SSOT contract enforced.** Every color literal (`#[0-9a-fA-F]{3,8}`,
  `rgb(...)`, `rgba(...)`, `hsl(...)`, `hsla(...)`) in the codebase
  lives in exactly one of: `src/assets/css/theme.css` (chrome),
  `src/engine/constants.ts` (domain), or
  `src/engine/suggestion-colors.ts` (visualisation systems).
  A repo-wide grep produces zero hits outside those three files
  (or each remaining hit carries a `// theme-exception:` comment
  with a justification — none expected).
- **`palettes.css` is left intact.** The cluster vars are
  preserved as a parked theming experiment; no change to that
  file as part of the refactor.
- **The default theme produces pixel-identical output to today.**
  Visual regression smoke on: SR review screen, card-tree
  widget, board (all stone configurations), status bar,
  toolbar, intermission chart, heatmap, timeline.
- **TS adapter sites read CSS variables via `themeColor()`**, not
  hard-coded hexes. The helper lives in a new module
  (`src/utils/theme-color.ts` or similar); single import path.
- **ADR-0006** header on any new file (`theme.css`,
  `theme-color.ts`).
- **ADR-0002** loudness: `themeColor()` throws on missing
  variable rather than returning empty string. A missing variable
  is a real error, not a fallback case.
- **ADR-0005 Rule 1** is the named rationale in the PR
  description, with this document referenced as the design note.
- **Optional CI lint rule** ready for follow-up: a grep-based
  check that fails the build if a color literal appears outside
  the three SSOT files. Not part of this refactor's scope but the
  refactor leaves the codebase in a state where the lint rule
  could be turned on without further work.
- `npm run build` green.

---

## License

Public Domain (The Unlicense).
