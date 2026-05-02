# Theme substrate — A2: sweep style.css to var()

- **Status:** Shipped on `frontend/theme-sweep-stylecss`, 2026-05-02.
  `npm run build` (vue-tsc + vite) passes; CSS bundle drops from
  56.29 → 55.96 kB (dead `#debug-*` block removed).
- **Genre:** Worklog entry — Color theming substrate (Active /
  Large), step A2 of the A1–A4 arc.
- **Date:** 2026-05-02.

## Context

A1 (PR #80, commit `308f52c`) landed the substrate file
`src/assets/css/theme.css` with 16 chrome anchors and 6 chart-
derived helpers. A2 is the first sweep PR — replaces every
chrome literal in `src/assets/css/style.css` with the
corresponding `var(--name)` reference.

## What landed

One file touched.

- **`src/assets/css/style.css`** — ADR-0006 header retrofitted
  (the file was touched substantively under full visibility, so
  the retrofit is in scope per ADR-0006's natural-accumulation
  posture). Twenty-five chrome literals swept to `var()`
  references. Two dead-code blocks deleted. One block of native
  range-input styling marked `theme-exception` per the plan's
  formal escape hatch.

### Anchor mapping

The within-JND collapse the plan calls out is real but small.
Each surveyed literal maps to its closest plan anchor by
absolute distance:

| Literal | Sites | Anchor | Δ |
|---------|-------|--------|---|
| `#aaa`  | body color | `--text-1` (`#aaa`) | 0 |
| `#fff`  | toolbar-title, toolbar-btn-hover/active | `--text-0` | 0 |
| `#4aaef0` | toolbar-btn.active border, debug-resizer:hover | `--accent-primary` | 0 |
| `#363636` | ct-* tabs, tree-panel-header | `--text-2` (`#666`) | +48 |
| `#484848` | tab-btn color, status-bar | `--text-2` (`#666`) | +30 |
| `#555`   | toolbar-btn color | `--text-2` (`#666`) | +17 |
| `#7a7a7a` | tab-btn hover color | `--text-1` (`#aaa`) | +48 |
| `#4a4a4a` | toolbar-btn:hover border | `--border-3` (`#555`) | +11 |
| `#242424` | sidebar/toolbar borders | `--border-1` (`#2a2a2a`) | +6 |
| `#2e2e2e` | tab-btn / toolbar-btn borders | `--border-1` (`#2a2a2a`) | -4 |
| `#1e1e1e` | status-bar/tree-panel borders | `--border-1` (`#2a2a2a`) | +12 |
| `#0f0f0f` | scrollbar track | `--surface-1` (`#111`) | +2 |
| `#2a2a2a` | scrollbar thumb | `--surface-3` (`#222`) | -8 (semantic) |

The two notable design calls:

1. **Hover-state direction preserved.** `tab-add-btn` /
   `tab-load-btn` resting at `#484848` and hover at `#7a7a7a`
   were mapped to different anchors (`--text-2` and `--text-1`)
   so the brightening affordance is retained. Mapping both to
   the same anchor would have flattened the hover effect.

2. **Scrollbar thumb mapped semantically, not literally.** The
   thumb's `#2a2a2a` literal exactly matches `--border-1`'s
   value, but the thumb is conceptually a raised UI surface
   (above its track), so it maps to `--surface-3`. Within-JND
   tweak from `#2a2a2a` to `#222`.

### Dead code deleted

- **`#debug-resizer` + `#debug-resizer:hover`** — orphaned (no
  `#debug-resizer` selector elsewhere in `src/`). 13 lines.
- **`#debug-log` + the four nested rules** — orphaned (no
  `#debug-log` selector elsewhere in `src/`). The persistent
  log surface is `SystemLogPanel.vue`, which has its own
  scoped styles. 16 lines.
- **Body scrollbar-color experiment** — the `body { scrollbar-
  color: #eba46d #123; }` line plus its commented sibling were
  dead by virtue of `html, body { overflow: hidden; }` at the
  top of the file (the body never has a scrollbar to style).
  Plus the colors (peach + navy) didn't match anything else
  in the codebase. 2 lines.

Total: 31 lines of confirmed-dead code removed. Per CLAUDE.md
("If you are certain that something is unused, you can delete
it completely") and per ADR-0002's spirit (silent dead code is
a maintenance hazard).

### `theme-exception` blocks

One block carries the explicit exception:

- **Native `input[type="range"]` styling** (lines 305–353) —
  the lightblue track (`#add8e6`) and mid-grey thumb / focus
  ring (`#808080`) are browser-form-control aesthetics that
  don't fit the chrome anchor vocabulary. Snapping to anchors
  would either change the visual noticeably (e.g. lightblue →
  cyan accent) or distort the role taxonomy (slider thumb is
  not text or border). Justification recorded inline as the
  plan prescribes; revisit if range inputs gain a deliberate
  dark-theme treatment.

The two commented-out rules at lines 79–80
(`/* .tab-thumb:hover ... */` and `/* .tab-thumb.active ... */`)
also contain literals but are inactive CSS comments; left
untouched.

## Verification

- `npm run build` clean (vue-tsc + vite).
- CSS bundle: 56.29 → 55.96 kB. Drop comes from the deleted
  dead-code blocks; the var() references compile to identical
  output to the literals they replace.
- Repo-wide grep on `#[0-9a-fA-F]{3,8}` against `style.css`
  shows only commented-out lines and the explicit
  `theme-exception` block. No chrome literal survives outside
  the substrate.
- Visual: at this point of the arc, the chrome covered by
  `style.css` (sidebar, toolbar, status bar, tree panel, body
  defaults) reads from theme.css. SFC-level chrome is still
  literal-bound and lands in A3.

## ADR compliance

- **ADR-0006:** header retrofitted on `style.css`.
- **ADR-0004:** the file was touched under full visibility
  (read in entirety before edit) so the full-file rewrite is
  permitted; each individual change is the literal-by-literal
  swap the plan prescribes.
- **ADR-0002:** dead code deletion is the loud-failure
  posture applied to dead-code-as-silent-confusion.
- **ADR-0005 Rule 1:** every chrome decision in `style.css`
  now reads from a single source of truth.

## Next

- **A3** — sweep SFC `<style>` blocks. The bulk of the chrome
  decisions live there. Likely to split into multiple PRs.
- **A4** — sweep TS chart adapters via a new
  `themeColor()` helper.

## License

Public Domain (The Unlicense).
