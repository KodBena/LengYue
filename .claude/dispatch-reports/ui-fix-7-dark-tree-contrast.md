# UI fix — Defect 7: dark-theme tree black-node contrast

Fix dispatch for `.claude/dispatch-reports/ui-defects-investigation.md`,
"Defect 7 — dark-theme tree background makes black nodes nearly
invisible" section, option (a) as specified there.

## Docs read (per frontend/CLAUDE.md's read-end-to-end discipline)

- `frontend/CLAUDE.md` — read in full.
- `frontend/tests/CLAUDE.md` — read in full.
- `.claude/dispatch-reports/ui-defects-investigation.md` — Defect 7's
  section read in full as this task's spec; the rest of the document
  (Defects 1-6, 8, the partition table) was read for context but is
  not load-bearing for this fix.
- `frontend/src/components/tree/TreeWidget.vue` — read in full
  (pre-edit, 395 lines).
- `frontend/src/utils/theme-color.ts` — read in full (checked whether
  a `--player-black` / `--player-white` role alias already covered
  this; they don't — those two aliases resolve to
  `--accent-primary` / `--state-error`, an unrelated chart-series
  role, not stone-fill colors).
- `frontend/src/assets/css/theme.css` — read lines 1-260 (header
  through both `[data-theme="..."]` blocks) to confirm the theme
  vocabulary (`"dark"`, `"cluster"`) and that only `"dark"`'s
  `--surface-2` (`#1a1a1a`) is the failing background; `"cluster"` is
  a light-bg theme where `#111` fill already passes easily (not
  independently re-derived here — reasoned from the literal `--surface-2`
  value in that block).

## Change

The change touches a single file, `frontend/src/components/tree/TreeWidget.vue`.

1. `nodeFill()` — the black-stone branch now returns
   `'var(--tree-node-black-fill, #111)'` instead of the literal
   `'#111'`. The white-stone branch (`'#eee'`) and the no-move branch
   (`themeColor('--border-3')`) are untouched. A comment at the call
   site states the WCAG pair/ratio derivation (below) and the
   leak-safety argument.
2. A new, deliberately **unscoped** `<style>` block (second `<style>`
   tag in the SFC, after the existing scoped one) adds:
   ```css
   [data-theme="dark"] .tree-widget-wrapper {
     --tree-node-black-fill: #707070;
   }
   ```
   This must be unscoped because `[data-theme="dark"]` lives on
   `<html>`, an ancestor outside the component's own Vue
   scope-id boundary — a scoped rule cannot key off an ancestor
   attribute. `.tree-widget-wrapper` was grep-checked
   (`grep -rn "tree-widget-wrapper" src`) and is unique in the
   codebase, so the global selector is safely specific — no other
   component's markup can be affected by this rule.

### Why CSS custom property over JS theme-sniffing

The file already threads `themeColor()` (a synchronous
`getComputedStyle` read) for chrome colors, but reaches for it only
in the no-move branch — the move-color branches are explicitly
domain-literal per the file's own header comment ("B/W stones stay
literal as domain colors per ADR-0003 plan §D"). Two options were
weighed:

- **JS theme-sniffing** (read `document.documentElement.dataset.theme`
  or add a reactive theme ref) — rejected: `nodeFill()` is called once
  per rendered node inside the `nodeList`/template loop; wiring a
  reactive theme signal into it would add a reactive read to exactly
  the render path ADR-0010 spends its render-locality corollary
  warning about (`TreeWidget`'s comment at the top of the file already
  names this component as the worked example of that trap). A `var()`
  string returned from a pure function, resolved by the browser's CSS
  cascade at paint time, adds **zero** reactive reads — `nodeFill()`
  itself is unchanged in shape (still a plain function of
  `item.move.color`, no new imports, no new refs).
- **CSS custom property, scoped to the failing theme+component pair**
  (chosen) — matches the existing idiom of chrome colors flowing
  through `var(--name)` in this file's own `<style>` block, extended
  by one conditional custom property instead of a new JS mechanism.

## WCAG contrast — computed, not asserted

Used the same sRGB relative-luminance formula the investigation report
used (verified by reproducing its own headline number first):

```
c_lin(c) = c/12.92                          if c <= 0.03928
         = ((c + 0.055) / 1.055) ^ 2.4      otherwise   (c in [0,1])
L         = c_lin (R=G=B, so all three channel weights collapse to
            the same value for a neutral gray)
contrast  = (L_lighter + 0.05) / (L_darker + 0.05)
```

- **Reproduction check** — `#111` (17,17,17) vs `#1a1a1a` (26,26,26):
  `L(#111) = 0.005600`, `L(#1a1a1a) = 0.010331`,
  contrast = `(0.010331+0.05)/(0.005600+0.05) = 1.0851`. Matches the
  report's witnessed `≈1.085` figure — confirms the formula/methodology
  before trusting it for the new pair.
- **The report's own suggestion checked and rejected**: `#3a3a3a`
  (58,58,58) vs `#1a1a1a` — `L(#3a3a3a) = 0.042313`,
  contrast = `(0.042313+0.05)/(0.010331+0.05) = 1.53:1`. Below the 3:1
  floor — the report flagged `#3a3a3a` as an illustrative "something
  like" suggestion, not a computed value, and it does not in fact
  clear C19. Not used.
- **Chosen value `#707070`** (112,112,112) vs `#1a1a1a`:
  `L(#707070) = 0.16204`,
  contrast = `(0.16204+0.05)/(0.010331+0.05) = 3.51:1`. Clears the 3:1
  floor with margin (the exact threshold color is `~#656565`, giving
  almost no margin; `#707070` was chosen instead for headroom against
  any rendering/gamma variance across browsers).
- **`#eee` (white nodes) vs `#1a1a1a`** (unchanged, confirmed not
  regressed): `L(#eee) = 0.85519`,
  contrast = `(0.85519+0.05)/(0.010331+0.05) = 15.0:1`. Trivially
  passes, as the report anticipated; stated here per the task's
  request to confirm it explicitly rather than assume it.

## Leak-safety (light / "cluster" theme)

`--tree-node-black-fill` is declared **only** inside the
`[data-theme="dark"] .tree-widget-wrapper` rule. Every other theme
(currently only `"cluster"`, a light-background theme per
`theme.css`) never sets that custom property anywhere in its cascade,
so `var(--tree-node-black-fill, #111)` resolves to the `#111` fallback
— the original domain-literal value — unchanged. The mechanism cannot
leak into a theme it wasn't written for by construction (no
theme-name branching logic anywhere; the CSS variable is simply
undefined outside the one selector that declares it).

## Render-locality / ADR-0010

No reactive reads were added. `nodeFill()`'s signature, parameters,
and call sites are unchanged; it still returns a plain string
synchronously from `item.move.color`. The dark-theme lift is resolved
entirely by the browser's CSS cascade at paint time, not by any Vue
reactivity or JS DOM query — so `TreeWidget`'s render function is not
newly coupled to `data-theme` or any other reactive/DOM state. This
was the deciding factor between the CSS-variable and JS-sniffing
options above.

## File size (ADR-0007, disclosed pre-existing state)

`TreeWidget.vue` was already 395 lines before this change — over the
ADR-0007 target of ≤250 lines for an SFC (a pre-existing condition,
not introduced or worsened in kind by this fix; several of the file's
existing sections carry similarly dense inline-comment prose, e.g. the
active-ring and viewport-centering blocks). This fix adds ~35 lines,
essentially all comment prose carrying the WCAG derivation the task
required to be in-code, plus the second `<style>` block. Flagged here
per ADR-0002 rather than silently ignored; not treated as license to
also perform an unrelated file-size contraction in this single-defect,
minimal-touch fix.

## Test

**Unit test: not written.** `nodeFill()` lives inside
`TreeWidget.vue`'s `<script setup>` block and is not exported —
`<script setup>` compiles to a per-instance `setup()`, so there is no
module-level symbol to import into a Tier-1 unit test
(`tests/unit/`) without extracting it to its own module. Extraction
was considered and rejected: the task specified "Single file expected:
frontend/src/components/tree/TreeWidget.vue" and "Minimal touch";
pulling a 20-line pure function into a new composable/util module for
the sole purpose of unit-testing one conditional branch is a larger
structural change than this one-defect fix warrants, and
`tests/CLAUDE.md`'s Tier 3 note explicitly keeps component-level
template tests out of scope except for the render-count-guard carve-out
(which measures render *frequency*, not resolved *fill color* — not
applicable here since this change adds no reactive read to guard).

Additionally, even with extraction, the interesting half of this fix
(does `var(--tree-node-black-fill, #111)` actually *resolve* to
`#707070` under `[data-theme="dark"]`, and does that resolved value
clear 3:1 against the actual rendered `--surface-2`) is a CSS-cascade
question a jsdom-less unit test cannot observe at all — `jsdom-stubs.ts`
(`tests/integration/render-count/jsdom-stubs.ts`) documents that jsdom
doesn't implement the theme CSS custom properties `themeColor()` reads
for exactly this reason.

**Maintainer-runnable check (UNEXERCISED — no browser/Playwright
available in this session):** per the original report's own
acceptance-check proposal for Defect 7, adapted to the fixed value:

```js
// Playwright, against a page with [data-theme="dark"] set on <html>
// (either via the persisted profile setting or the forced-attribute
// technique the investigation report used for its own probe).
const { fill, bg, ratio } = await page.evaluate(() => {
  const svg = document.querySelector('.tree-widget-wrapper .node-circle');
  const wrapper = document.querySelector('.tree-widget-wrapper');
  const fill = getComputedStyle(svg).fill;               // expect rgb(112, 112, 112)
  const bg = getComputedStyle(wrapper).backgroundColor;   // expect rgb(26, 26, 26)
  // ... compute the same WCAG relative-luminance ratio as above ...
  return { fill, bg, ratio };
});
expect(ratio).toBeGreaterThanOrEqual(3.0);
```

Concrete blocker: this session has no running dev/preview server with
Playwright wired (the investigation report's own environment section
documents the same local constraint — the `4173` preview build was
available to *that* session via an already-running process this
dispatch did not have, and standing up a fresh browser-driven probe
was outside this fix-dispatch's tooling). The WCAG computation above
was instead verified by hand against the documented formula and
cross-checked by reproducing the report's own `#111`/`#1a1a1a` ≈1.085
figure before applying the same formula to the new pair.

## Gates

Run from `frontend/` in the isolated worktree
(`/home/bork/w/omega/.claude/worktrees/agent-a31b81a69dbdd699c/frontend`).
`node_modules` was not present in the worktree; `npm ci` was run first
(333 packages, 3 pre-existing high-severity advisories reported by
`npm audit`, unrelated to this change — not investigated further, out
of scope for a single-file contrast fix).

- **`npm run build`** (`vue-tsc -b && vite build`) — **PASS**. Tail:
  ```
  ✓ 1081 modules transformed.
  dist/assets/index-BcLzhQhx.js   2,920.81 kB │ gzip: 1,032.36 kB
  ✓ built in 8.81s
  ```
  (One pre-existing chunk-size warning, unrelated to this change.)
- **`npx eslint .`** — **PASS**. No output, exit 0.
- **`npm run test:run`** — **PASS**. The foreground invocation hit the
  120s tool timeout and was moved to a background task (consistent
  with the known pre-existing environment issue — this worktree's
  installed `vite@8.2.0` is past the `≥8.0.12` version the umbrella
  operator's memory notes as hanging vitest's teardown, suite green
  but slow to exit); it completed independently. Tail:
  ```
   Test Files  81 passed | 3 skipped (84)
        Tests  1101 passed | 4 skipped (1105)
     Start at  13:36:55
     Duration  152.93s (transform 19.39s, setup 3.69s, import 60.62s, tests 14.65s, environment 296.06s)
  ```
  No new test file was added for this change (see "Test" above), so
  this is a no-regression confirmation, not new coverage.
