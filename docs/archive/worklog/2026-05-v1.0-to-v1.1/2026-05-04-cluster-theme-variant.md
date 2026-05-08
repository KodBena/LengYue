# Cluster theme variant — chrome substrate gains a second theme

- **Status:** Shipped on `frontend/cluster-theme-variant`,
  2026-05-04. Build green. Manual UI verification deferred to the
  user (this is a visual-impact change; type-check + CSS-import
  resolution don't tell you whether the theme looks coherent).
- **Genre:** Feature — wires `appearance.theme` to actually do
  something for the first time, ships `'cluster'` as a real
  light-bg theme variant authored against the curated cluster-12
  palette. Picks up the theme-replacement-B arc parked at the
  close of the color-substrate work (see Frontend Completed
  table at TODO.md:170).
- **Date:** 2026-05-04.

## Context

Two findings shaped the work:

1. The existing `appearance.theme: 'dark' | 'light'` had been
   declared on `AppSettings`, persisted in profile blobs since
   the de-branding migration `1 → 2`, and selectable in the
   RegistryEditor's PATH_ENUMS dropdown. But it was wired to
   nothing — theme.css had a single `:root` block; no
   `[data-theme]` selector existed; no JS code mirrored the
   value onto `documentElement`. Selecting `'light'` produced no
   visible change.

2. The chrome substrate's design was forward-looking — the
   `theme.css` docstring named "a future `html.theme-X`
   variant," and `theme-color.ts`'s `themeColor()` accessor
   reads from `documentElement.getComputedStyle`, so anything
   set via `data-theme` propagates to TS-side consumers
   automatically. The substrate work had laid the groundwork; it
   just hadn't been activated.

The user wants a "non-depressing GUI" via the curated cluster-12
palette in `assets/css/palettes.css` — bg = `--cluster-12-9`
(pale pink), text = `--cluster-12-4` (deep purple), with leeway
on the rest. Plus a fallback path so a comically-bad theme can
be reverted. Both wants compose to: wire the theme switch for
the first time, ship `'cluster'` as the second theme variant
alongside `'dark'`. After the user's hands-on review of the
initial substrate landing, three small visual tweaks (toolbar
button surfaces, tab-header surface) and the default flip to
`'cluster'` rolled in as a second pass — see "Second-pass
tweaks" below.

## What changed

### `frontend/src/assets/css/theme.css`

The 16 base color anchors (4 surface + 3 border + 3 text + 2
accent + 4 state) move out of `:root` into two new theme-scoped
blocks:

- `[data-theme="dark"] { ... }` — current values verbatim.
- `[data-theme="cluster"] { ... }` — new, see mapping below.

The 6 chart-derived helpers and 5 role aliases stay in `:root`.
Reasoning: CSS resolves `var()` references at use time, not at
declaration time, so an alias `--heatmap-low: var(--surface-2)`
declared once at `:root` automatically picks up whichever
theme block's `--surface-2` is active. Per-theme alias blocks
would have been pure duplication.

The theme-invariant tokens (z-index ladder, animation
durations, spacing/font/radius/tracking scales, disabled-alpha)
also stay in `:root` — they are structural, not aesthetic, and
don't change between themes.

The file's docstring gains a "Theme variants (data-theme)"
section naming the available theme blocks, the FOUC-prevention
discipline (initial value baked into `index.html`), the
runtime-mirror site (`useAppBootstrap.ts`), and the procedure
for adding a new theme. The "Out of scope" section gains a note
that the ~14 documented `theme-exception` blocks scattered in
SFC `<style>` sections (LoginModal red error variants,
QeuboToolbar muted-cyan buttons, RegistryEditor's amber/pink
role indicators, App.vue's peach panel-resizer) are
theme-invariant by design and will read against the active
theme's surfaces but won't shift per theme — sweeping them into
substrate anchors is its own arc, conditionally worthwhile if
cluster sticks.

### Cluster mapping

The user named the canonical pair (cluster-12-9 bg,
cluster-12-4 text) and asked me to use judgment for the rest.
The mapping:

- **Surfaces (4)** progress from `--cluster-12-9` (pure pale
  pink) toward `--cluster-12-4` via `color-mix(in srgb, ...)`
  at 92% / 84% / 76% bg-weight. Same direction as dark theme
  (deepest → most-raised); the absolute values invert because
  the dark-theme deepest is `#000` (black) while the
  cluster-theme deepest is the canonical light bg.
- **Borders (3)** use the same interpolation but at more
  contrast-heavy ratios (70% / 55% / 40% bg-weight) so border
  edges remain perceptible against surface tiers.
- **Text:** `--text-0 = --cluster-12-4` (deep purple, high
  emphasis). `--text-1 = color-mix` 60% text / 40% bg (medium
  body — analogous to the dark theme's mid-gray). `--text-2 =
  --cluster-12-6` (taupe — naturally low-emphasis as a label
  color).
- **Accents:** `--accent-primary = --cluster-12-2` (sky blue,
  closest in role to the dark theme's `#4aaef0` cyan).
  `--accent-secondary = --cluster-12-11` (orange — matches the
  SR / current-card role from the dark theme).
- **Semantic state:** `success = --cluster-12-1` (bright
  green), `warning = --cluster-12-11` (orange, same as
  accent-secondary as in the dark theme),
  `error = --cluster-12-5` (dark red, conventional
  destructive/winrate-negative), `attention = --cluster-12-10`
  (hot pink — review-active stands out vividly).

Cluster entries deliberately unused in the cluster mapping:
`--cluster-12-0` (dark green) per the user's hint — its
near-black tone reads as a holdover from dark rather than
theme-coherent. `--cluster-12-3` (bright cyan/mint),
`--cluster-12-7` (bright purple), `--cluster-12-8` (yellow-
green) — saved for future role-alias overrides if a chart-helper
or role-alias resolution wants a more vivid value than the
default `var()` cascade produces.

### `frontend/index.html`

`<html lang="en">` → `<html lang="en" data-theme="dark">` with
an HTML comment explaining the FOUC-prevention discipline. The
data-theme attribute provides the stable default during cold
start before Vue mounts and `useAppBootstrap` hydrates the
persisted value.

### `frontend/src/composables/useAppBootstrap.ts`

New `watch` block (paired with the existing intensityHueShift
watcher) mirroring `store.profile.settings.appearance.theme`
onto `document.documentElement.setAttribute('data-theme', ...)`
on every change. `immediate: true` syncs at composable-setup
time so the pre-hydration store-default lands as a no-op write
matching the HTML default. Post-hydration, if the user has
saved a different theme, the attribute flips and CSS resolves
the alternative block on the next style recalc.

The block's docstring names the FOUC-prevention coupling
(index.html sets the initial value), the
themeColor()-from-getComputedStyle composition (TS-side
consumers pick up the active theme transparently — no
per-consumer rewiring), and the watcher's role.

### `frontend/src/types.ts`

`AppSettings.appearance.theme: 'dark' | 'light'` →
`'dark' | 'cluster'`. JSDoc names the data-theme wiring site,
the schema-version that introduced the cluster variant
(v15), and the procedure for adding a future theme (extend
union, add `[data-theme="X"]` block, extend RegistryEditor
PATH_ENUMS, append migration if a prior valid value retires).

`'light'` retired because it was never wired to anything —
keeping it as a phantom option in a now-functional dropdown
would mislead users picking from it.

### `frontend/src/components/RegistryEditor.vue`

`'appearance.theme': ['dark', 'light']` →
`['dark', 'cluster']`. The dropdown reflects the new union.

### `frontend/src/store/migrations.ts`

`CURRENT_SCHEMA_VERSION` bumped 14 → 15. New migration coerces
any non-{`'dark'`, `'cluster'`} `appearance.theme` value to
`'dark'`. Idempotent — pre-existing valid values preserved. The
migration's docstring names the v14 vestigial-`'light'` situation
and the most-likely transition (a user with `'light'` lands on
the `'dark'` they were de-facto seeing).

### `frontend/src/store/defaults.ts`

`defaultSettings.appearance.theme: 'dark'` →
`'cluster'`. Flipped during the second-pass review (see
"Second-pass tweaks" below): once the cluster theme had
visible-in-browser confirmation that it was coherent, the
right default for new installs became cluster rather than
dark. Existing users with `theme: 'dark'` keep `'dark'`
(the migration preserves it); only the
not-an-active-choice `'light'` value gets coerced to the
new default.

## Second-pass tweaks (after the user's hands-on review)

After the initial substrate landed and the user opened the
cluster theme in-browser, three small visual refinements
surfaced that read better in both themes simultaneously
(rather than being cluster-specific touch-ups):

1. **`.toolbar-btn` background = `var(--border-1)`** — was
   `transparent` in `style.css` (the global rule, applied
   to top-toolbar buttons in App.vue and elsewhere) and
   `var(--border-2)` in the scoped `Toolbar.vue` block. The
   `--border-1` value reads as a subtle filled-button surface
   against either theme's `--surface-2`/`--surface-3`
   chrome — distinct enough to look like an interactive
   affordance, calm enough not to compete with primary actions.
2. **`.toolbar-btn-sm` background = `var(--border-1)`** —
   was `var(--border-2)` in both the App.vue global rule and
   the AnalysisControls.vue scoped block. Same rationale; the
   sm variant sits in denser layouts where the lower-contrast
   bg helps avoid visual clutter.
3. **`.tab-header` background = `var(--surface-1)`** — was
   `var(--surface-3)` in `TabWidget.vue`. The tab-row reads as
   a quieter container, with the active tab's
   `var(--surface-3)` bg now contrast-popping against the
   surface-1 bar (in dark theme: `#222` active tab against
   `#111` bar; in cluster: less-tinted surface-1 against
   more-tinted surface-3). Hover state `var(--border-1)`
   continues to pop against either theme.

Hover states (`.toolbar-btn:hover`,
`.toolbar-btn-sm:hover`) left at their existing
`var(--border-3)` background. The base→hover jump
widens slightly (border-1 → border-3 is a 2-tier shift
where it was border-2 → border-3, a 1-tier shift), but
the resulting hover affordance reads as more emphatic
rather than jumpy. Tunable to `--border-2` if a future
review finds it too aggressive.

**Default flipped to `'cluster'`.** With cluster confirmed
coherent in-browser, the new-install default became cluster
rather than dark. The migration's coercion target updated
accordingly — non-valid values now land on `'cluster'`
rather than `'dark'`. Existing users with `theme: 'dark'`
preserve their value (no silent `'dark' → 'cluster'` flip
during upgrade — that's the "my app suddenly looks
different" failure mode the migration's docstring names).
The user (project author) flips their own dev install via
the registry dropdown.

## Why no backend dispatch

Theme is purely a frontend concern. The wire shape of the
profile blob (camelCase domain, persisted via `SyncService`) is
unaffected — `appearance.theme` is a string field that the
backend stores opaquely. No backend coordination implied.

## Verification

- `npm run build` (vue-tsc + vite build) clean. CSS imports
  resolve; the new `[data-theme="cluster"]` block parses without
  error; `var(--cluster-12-9)` and `color-mix(...)` are
  recognized.
- **Manual UI verification deferred to the user.** This change's
  correctness is visual: does the cluster theme look coherent
  against the substrate's chrome? The build only verifies that
  the substrate compiles and the wiring typechecks. The user is
  the right reviewer for "is the theme not depressing." The
  procedure: open the SPA, navigate to Settings tab → registry
  editor → appearance → theme — the dropdown shows `dark` and
  `cluster`. Pick `cluster`; the `data-theme` attribute flips on
  the `<html>` element; every consumer of substrate anchors
  re-resolves via the cascade. Pick `dark` to revert.
- **Documented theme-exception blocks** (~14 sites — LoginModal
  red error variants, QeuboToolbar muted-cyan buttons,
  RegistryEditor's amber/pink role indicators, App.vue's peach
  panel-resizer, HorizontalTimelineVisualizer's Tailwind block,
  ColorDebugStrip's debug backdrops) will look slightly
  off-substrate in cluster mode — they're theme-invariant by
  their substrate-exception design. If cluster sticks and any
  block reads as load-bearing visual mismatch, sweeping the
  affected exception into a substrate anchor is the follow-on
  pass.
- Migration sanity: a v14 blob with `theme: 'light'` migrates
  to `theme: 'dark'` (idempotent for `'dark'` and `'cluster'`).
  A v14 blob with no `appearance` object (defensive case)
  passes through unchanged.
- Non-regression: existing users with `theme: 'dark'` (the
  de-branding-migrated majority) keep their `'dark'`; the
  migration only coerces the never-effective `'light'`, and now
  coerces it to the new default `'cluster'` rather than
  `'dark'` (it was a wiring artifact, not an active choice).
  Fresh installs and freshly-reset workspaces get
  `'cluster'`. The user (project author) flips their own dev
  install via the registry dropdown — minor inconvenience for
  one person, no surprise for any field user.

## Forward notes

**User-theming as a feature.** The user named "users can share
and drop/replace themes without problems after that" as a
post-PR assumption. The static `[data-theme="X"]` block design
in theme.css doesn't preclude this — two natural extension
shapes both compose:

- **Per-anchor user overrides as profile-side data.** A new
  `profile.settings.appearance.themeOverrides:
  Record<string, ColorOverrides>` shaped as a per-theme map of
  CSS-anchor-name → color value. At bootstrap, after setting
  `data-theme`, walk the overrides for the active theme and
  call `documentElement.style.setProperty('--surface-0', ...)`
  for each. The CSS substrate provides the named-theme
  defaults; user overrides ride on top via inline-style
  precedence.
- **Custom-theme registry.** A new
  `profile.settings.appearance.customThemes:
  Record<string, ThemeDefinition>` where `ThemeDefinition` is a
  full set of color anchors. The dropdown enumerates the
  built-in names plus the registered custom-theme keys.
  Slightly more complex (each custom theme needs to install its
  own values somehow — either via `setProperty` per entry, or
  by injecting a runtime `<style>` block).

Both compose with the substrate work this PR ships. Neither
implemented today; the user's "I'll assume" framing means the
foundation should support them, not that they ship now.

**Theme-exception sweep (conditionally on cluster sticking).**
The ~14 documented theme-exception blocks (named in the A4
worklog as future-PR seeds) become visually load-bearing once
two themes ship. Whether to sweep depends on which exception
blocks read as ugly under cluster — the muted-cyan button
variants in QeuboToolbar will likely look most off (cyan against
pale pink), the amber `modified-dot` in RegistryEditor will
just read as a vivid indicator regardless of theme, the
LoginModal's red-error-variants will be neutral (red is red).
Sweep the affected blocks per ADR-0001's "alias-not-add"
discipline: name the implicit role, alias to a new substrate
anchor, define the anchor per theme.

**Theme-replacement-B status.** The TODO Frontend Completed
entry at line 170 named "Theme replacement (B — flipping the
dark default to something less depressing) parked per the
user's 'structural close only' scoping" as parked. This PR does
the structural half of B (ships the variant, wires the switch)
and, after the user's hands-on review, also flips the
new-install default to `'cluster'` (existing `'dark'` blobs
preserved by the migration). The "less depressing" question
is settled in the affirmative for new installs; existing
users opt in via the registry dropdown.
