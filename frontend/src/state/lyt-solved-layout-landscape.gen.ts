/**
 * GENERATED FILE — do not hand-edit.
 * Tool: research/lyt/emit_ts.py
 * Source encoding: research/lyt/encodings/lengyue_landscape.lyt (layout `lengyue-landscape`)
 * Solve inputs: CP-SAT lexicographic solve (research/lyt/compiler.py solve_lexicographic), board widget 'B', reach-preferred widgets auto-derived (research/lyt/runner.py _gather_reach_preferred_widgets), representative sizes research/lyt/runner.py SCREEN_SIZES.
 * Regenerate: cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_ts.py --registration lengyue_landscape+portrait
 * Phase-1 shadow mode (LYT adoption roadmap): plain data only, no behaviour, no runtime import from app code yet — see .claude/dispatch-reports/lyt-shadow-harness-build.md.
 *
 * Public Domain (The Unlicense), matching research/lyt/__init__.py's
 * license line and the umbrella's ADR-0006 per-file convention.
 */

export interface LytRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export type LytSolveStatus = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE';

export interface LytScreenClass {
  readonly id: string;
  readonly wPx: number;
  readonly hPx: number;
}

export interface LytSolvedRegistration {
  /** LYT screen-class id this size was solved against (§4.4). */
  readonly classId: string;
  /** Representative-size label, e.g. '1920x1080' (research/lyt/runner.py SCREEN_SIZES). */
  readonly label: string;
  readonly wPx: number;
  readonly hPx: number;
  readonly status: LytSolveStatus;
  /** widget id -> solved rect, viewport-relative px. Empty when status is INFEASIBLE. */
  readonly slots: Readonly<Record<string, LytRect>>;
}

export const LYT_SCREEN_CLASSES: readonly LytScreenClass[] = [
  { id: "landscape", wPx: 1920, hPx: 1080 },
  { id: "portrait", wPx: 1080, hPx: 1920 },
];

export const LYT_SOLVED_LAYOUT: readonly LytSolvedRegistration[] = [
  {
    classId: "landscape",
    label: "1920x1080",
    wPx: 1920,
    hPx: 1080,
    status: "OPTIMAL",
    slots: {
      "A_app": { x: 1100, y: 64, w: 820, h: 160 },
      "A_board": { x: 0, y: 1052, w: 1088, h: 28 },
      "A_engine": { x: 1100, y: 0, w: 820, h: 60 },
      "B": { x: 30, y: 0, w: 1028, h: 1028 },
      "CP-analysis": { x: 1214, y: 228, w: 706, h: 852 },
      "CP-cards": { x: 1214, y: 228, w: 706, h: 852 },
      "CP-library": { x: 1214, y: 228, w: 706, h: 852 },
      "CP-other": { x: 1214, y: 228, w: 706, h: 852 },
      "CP-settings": { x: 1214, y: 228, w: 706, h: 852 },
      "I_board": { x: 0, y: 1028, w: 1088, h: 24 },
      "tree": { x: 1100, y: 228, w: 110, h: 852 },
    },
  },
  {
    classId: "landscape",
    label: "2560x1440",
    wPx: 2560,
    hPx: 1440,
    status: "OPTIMAL",
    slots: {
      "A_app": { x: 1740, y: 64, w: 820, h: 160 },
      "A_board": { x: 0, y: 1412, w: 1728, h: 28 },
      "A_engine": { x: 1740, y: 0, w: 820, h: 60 },
      "B": { x: 170, y: 0, w: 1388, h: 1388 },
      "CP-analysis": { x: 1854, y: 228, w: 706, h: 1212 },
      "CP-cards": { x: 1854, y: 228, w: 706, h: 1212 },
      "CP-library": { x: 1854, y: 228, w: 706, h: 1212 },
      "CP-other": { x: 1854, y: 228, w: 706, h: 1212 },
      "CP-settings": { x: 1854, y: 228, w: 706, h: 1212 },
      "I_board": { x: 0, y: 1388, w: 1728, h: 24 },
      "tree": { x: 1740, y: 228, w: 110, h: 1212 },
    },
  },
  {
    classId: "landscape",
    label: "1280x1024",
    wPx: 1280,
    hPx: 1024,
    status: "INFEASIBLE",
    slots: {},
  },
  {
    classId: "landscape",
    label: "1080x1920-portrait",
    wPx: 1080,
    hPx: 1920,
    status: "INFEASIBLE",
    slots: {},
  },
];

export const LYT_SOLVED_BY_LABEL: Readonly<Record<string, LytSolvedRegistration>> = {
  "1920x1080": LYT_SOLVED_LAYOUT[0],
  "2560x1440": LYT_SOLVED_LAYOUT[1],
  "1280x1024": LYT_SOLVED_LAYOUT[2],
  "1080x1920-portrait": LYT_SOLVED_LAYOUT[3],
};
