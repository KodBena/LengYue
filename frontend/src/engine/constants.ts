/**
 * src/engine/constants.ts
 * Board configuration and geometry.
 * Only truly constant values live here. Size-dependent geometry is computed
 * at render time in BoardDisplay based on the size prop.
 * License: Public Domain (The Unlicense)
 */

/** SVG viewBox dimension. All geometry is derived from this. */
export const BOARD_PX = 600;

export const BOARD_COLOR = '#dcb35c';
export const LINE_COLOR  = '#222';
export const LABEL_COLOR = '#444';

/** Full 19-column label sequence (I omitted per convention). Slice to board size. */
export const ALL_X_LABELS = "ABCDEFGHJKLMNOPQRST".split("");
