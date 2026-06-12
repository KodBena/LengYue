/**
 * src/engine/constants.ts
 * Board configuration and geometry.
 * Only truly constant values live here. Size-dependent geometry is computed
 * at render time in BoardDisplay based on the size prop.
 * License: Public Domain (The Unlicense)
 */
/**
 * Inner playable-area dimension (viewBox-units): the grid plus the per-side
 * cell margin (`pad = BOARD_PX / (size + 1)`, equal to one cell). The SVG
 * viewBox is `TOTAL_PX = BOARD_PX + 2 × LABEL_BAND` — the inner area lives
 * offset by `LABEL_BAND` inside the SVG, with the outer ring reserved for
 * coordinate labels.
 */
export const BOARD_PX = 600;
/**
 * Coordinate-label font size (viewBox-units). LABEL_BAND's value is
 * justified relative to this; the two should move together if either is
 * tuned.
 */
export const LABEL_FONT_SIZE = 11;
/**
 * Outer label band (viewBox-units) added on each side of the playable area
 * to host the coordinate labels (A–T columns, 1–19 rows). The label sits
 * within the strip between the SVG edge and the nearest edge-row stone
 * (see BoardDisplay's `labelOffset`); LABEL_BAND's job is to widen the SVG
 * viewBox so the strip is wide enough to position the label outside the
 * stone-clearance zone. Tune by hand for taste.
 */
export const LABEL_BAND = 9;
/**
 * Where the coordinate label sits within the strip between the SVG edge
 * and the nearest edge-row stone, as a fraction of strip width.
 *   0.0 → label hugs the SVG/board-texture edge.
 *   0.5 → label is visually centered (equal gap to edge and stone).
 *   1.0 → label hugs the nearest stone.
 * Tune by hand for taste; the underlying strip width varies with board
 * size (smaller boards have larger stones, so the strip narrows and the
 * label drifts inward proportionally — the ratio holds across sizes).
 */
export const LABEL_INSET_RATIO = 0.65;
/** SVG viewBox dimension — inner playable area plus a label band on each side. */
export const TOTAL_PX = BOARD_PX + 2 * LABEL_BAND;
/**
 * Stone radius as a fraction of cell size. The geometric foundation
 * shared by every renderer that draws stones — keep as a single
 * value across consumers to prevent the drift that surfaced this
 * audit's triggering specimen (the `* 0.88` PV-stone variant in
 * MoveSuggestions.vue, removed earlier in favor of the unified
 * ratio). Three consumer sites read this: live BoardDisplay,
 * suggestion overlay (MoveSuggestions), and the SVG-string
 * renderer (board-renderer.ts).
 */
export const STONE_RADIUS_RATIO = 0.46;
/**
 * Inner-marker radius as a fraction of stone radius. Used for the
 * small inner circle drawn on the most recent move (last-move
 * marker, BoardDisplay) and for analysis preview markers
 * (board-renderer's optional showMarker overlay). Two consumer
 * sites today.
 */
export const MARKER_INNER_RATIO = 0.4;
/**
 * Maximum number of roots whose lineage trees the Forest Directory
 * navigator will auto-load into the right pane on a game-node
 * selection. Past this cap, selecting a game shows a guidance
 * message in the right pane instead of fetching every tree —
 * `ForestDirectory.vue`'s selection watcher checks `game.roots.length`
 * against this constant before calling `tree.loadBrowseForest(...)`.
 *
 * The cap is on the FETCH side (avoid 200+ parallel
 * `fetchTreeByRoot` calls when the user's intent is to browse, not
 * display every tree); `CardTreeWidget`'s vertical-stack-with-one-
 * expanded layout handles modest trees-per-forest counts without
 * visual squeeze, but parallel fetch ceilings and per-tree CTE costs
 * make 8 a reasonable upper bound for "small game, auto-load all
 * roots." The 276-root case in the user's actual data sits well
 * past this cap and falls through to sub-selection.
 *
 * Tuning consideration: if the auto-load feels too eager at 8
 * (e.g., right pane visually crowded for 5-7 root games), drop
 * to 4. If users routinely have 15-20-root games where they want
 * "show all", raise to 16 — the bound is policy, not structural.
 */
export const MULTI_ROOT_DISPLAY_CAP = 8;
export const BOARD_COLOR = '#dcb35c';
export const LINE_COLOR = '#222';
export const LABEL_COLOR = '#444';
/** Full 19-column label sequence (I omitted per convention). Slice to board size. */
export const ALL_X_LABELS = "ABCDEFGHJKLMNOPQRST".split("");
