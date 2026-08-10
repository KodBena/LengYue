/**
 * GENERATED FILE — do not hand-edit.
 * Tool: research/lyt/emit_ts.py
 * Source encoding: research/lyt/encodings/current_row_asis.lyt (layout `current-row-asis`)
 * Solve inputs: CP-SAT lexicographic solve (research/lyt/compiler.py solve_lexicographic), board widget 'B', reach-preferred widgets auto-derived (research/lyt/runner.py _gather_reach_preferred_widgets), representative sizes research/lyt/runner.py SCREEN_SIZES.
 * Loaded via the --baseline waiver mechanism (research/lyt/baseline.py BASELINE_WAIVERS) — this encoding is a disclosed, honestly non-conformant AS-IS transcription, not a design proposal; see the source .lyt file's own header.
 * Regenerate: cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_ts.py --registration current_row_asis.lyt
 * Phase 2 (lyt-constants-swap, ledger row 1687): plain data, but no longer shadow-only — layout-model.ts imports RESIZER_WIDTH_PX from this module (the one slot the conformance harness showed solved+measured geometry agreeing on exactly, at every measured size). See .claude/dispatch-reports/lyt-constants-swap-build.md.
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
  { id: "default", wPx: 1920, hPx: 1080 },
];

export const LYT_SOLVED_LAYOUT: readonly LytSolvedRegistration[] = [
  {
    classId: "default",
    label: "1920x1080",
    wPx: 1920,
    hPx: 1080,
    status: "OPTIMAL",
    slots: {
      "B": { x: 194, y: 346, w: 710, h: 710 },
      "CP-analysis": { x: 1620, y: 346, w: 300, h: 734 },
      "CP-cards": { x: 1620, y: 346, w: 300, h: 734 },
      "CP-library": { x: 1620, y: 346, w: 300, h: 734 },
      "CP-other": { x: 1620, y: 346, w: 300, h: 734 },
      "CP-settings": { x: 1620, y: 346, w: 300, h: 734 },
      "addBoard": { x: 26, y: 892, w: 20, h: 20 },
      "addBoardGap": { x: 46, y: 892, w: 148, h: 20 },
      "autoNav": { x: 1612, y: 0, w: 32, h: 32 },
      "boardRail": { x: 26, y: 44, w: 168, h: 848 },
      "boardToggle": { x: 1743, y: 0, w: 33, h: 32 },
      "caps": { x: 754, y: 1056, w: 60, h: 24 },
      "captureBanner": { x: 194, y: 32, w: 1726, h: 32 },
      "clearCache": { x: 1580, y: 0, w: 32, h: 32 },
      "connect": { x: 1676, y: 0, w: 67, h: 32 },
      "ctrlToggle": { x: 1809, y: 0, w: 33, h: 32 },
      "engineMetrics": { x: 926, y: 0, w: 220, h: 32 },
      "engineUri": { x: 706, y: 0, w: 220, h: 32 },
      "hintSlot": { x: 624, y: 1056, w: 74, h: 24 },
      "jankTest": { x: 26, y: 912, w: 168, h: 18 },
      "learn": { x: 1396, y: 0, w: 90, h: 32 },
      "loadSave": { x: 26, y: 0, w: 168, h: 44 },
      "locale": { x: 1842, y: 0, w: 78, h: 32 },
      "match": { x: 1529, y: 0, w: 51, h: 32 },
      "mint": { x: 1290, y: 0, w: 106, h: 32 },
      "moveBadge": { x: 284, y: 1056, w: 60, h: 24 },
      "moveNav": { x: 1194, y: 0, w: 96, h: 32 },
      "moveNumbers": { x: 726, y: 1056, w: 28, h: 24 },
      "pass": { x: 698, y: 1056, w: 28, h: 24 },
      "play": { x: 1486, y: 0, w: 43, h: 32 },
      "players": { x: 344, y: 1056, w: 120, h: 24 },
      "popStress": { x: 1644, y: 0, w: 32, h: 32 },
      "preview": { x: 26, y: 930, w: 168, h: 150 },
      "resizerInner": { x: 1619, y: 346, w: 1, h: 734 },
      "resizerOuter": { x: 904, y: 346, w: 1, h: 734 },
      "rulesKomi": { x: 464, y: 1056, w: 160, h: 24 },
      "saveBanner": { x: 194, y: 64, w: 1726, h: 32 },
      "setup": { x: 1170, y: 0, w: 24, h: 32 },
      "setupChip": { x: 194, y: 1056, w: 90, h: 24 },
      "sidebarToggle": { x: 0, y: 0, w: 26, h: 1080 },
      "sliders": { x: 1146, y: 0, w: 24, h: 32 },
      "systemLog": { x: 194, y: 96, w: 1726, h: 250 },
      "title": { x: 194, y: 0, w: 512, h: 32 },
      "tree": { x: 905, y: 346, w: 714, h: 734 },
      "treeToggle": { x: 1776, y: 0, w: 33, h: 32 },
      "userBadge": { x: 814, y: 1056, w: 90, h: 24 },
    },
  },
  {
    classId: "default",
    label: "2560x1440",
    wPx: 2560,
    hPx: 1440,
    status: "OPTIMAL",
    slots: {
      "B": { x: 194, y: 346, w: 1070, h: 1070 },
      "CP-analysis": { x: 2260, y: 346, w: 300, h: 1094 },
      "CP-cards": { x: 2260, y: 346, w: 300, h: 1094 },
      "CP-library": { x: 2260, y: 346, w: 300, h: 1094 },
      "CP-other": { x: 2260, y: 346, w: 300, h: 1094 },
      "CP-settings": { x: 2260, y: 346, w: 300, h: 1094 },
      "addBoard": { x: 26, y: 1252, w: 20, h: 20 },
      "addBoardGap": { x: 46, y: 1252, w: 148, h: 20 },
      "autoNav": { x: 2252, y: 0, w: 32, h: 32 },
      "boardRail": { x: 26, y: 44, w: 168, h: 1208 },
      "boardToggle": { x: 2383, y: 0, w: 33, h: 32 },
      "caps": { x: 1114, y: 1416, w: 60, h: 24 },
      "captureBanner": { x: 194, y: 32, w: 2366, h: 32 },
      "clearCache": { x: 2220, y: 0, w: 32, h: 32 },
      "connect": { x: 2316, y: 0, w: 67, h: 32 },
      "ctrlToggle": { x: 2449, y: 0, w: 33, h: 32 },
      "engineMetrics": { x: 1566, y: 0, w: 220, h: 32 },
      "engineUri": { x: 1346, y: 0, w: 220, h: 32 },
      "hintSlot": { x: 624, y: 1416, w: 434, h: 24 },
      "jankTest": { x: 26, y: 1272, w: 168, h: 18 },
      "learn": { x: 2036, y: 0, w: 90, h: 32 },
      "loadSave": { x: 26, y: 0, w: 168, h: 44 },
      "locale": { x: 2482, y: 0, w: 78, h: 32 },
      "match": { x: 2169, y: 0, w: 51, h: 32 },
      "mint": { x: 1930, y: 0, w: 106, h: 32 },
      "moveBadge": { x: 284, y: 1416, w: 60, h: 24 },
      "moveNav": { x: 1834, y: 0, w: 96, h: 32 },
      "moveNumbers": { x: 1086, y: 1416, w: 28, h: 24 },
      "pass": { x: 1058, y: 1416, w: 28, h: 24 },
      "play": { x: 2126, y: 0, w: 43, h: 32 },
      "players": { x: 344, y: 1416, w: 120, h: 24 },
      "popStress": { x: 2284, y: 0, w: 32, h: 32 },
      "preview": { x: 26, y: 1290, w: 168, h: 150 },
      "resizerInner": { x: 2259, y: 346, w: 1, h: 1094 },
      "resizerOuter": { x: 1264, y: 346, w: 1, h: 1094 },
      "rulesKomi": { x: 464, y: 1416, w: 160, h: 24 },
      "saveBanner": { x: 194, y: 64, w: 2366, h: 32 },
      "setup": { x: 1810, y: 0, w: 24, h: 32 },
      "setupChip": { x: 194, y: 1416, w: 90, h: 24 },
      "sidebarToggle": { x: 0, y: 0, w: 26, h: 1440 },
      "sliders": { x: 1786, y: 0, w: 24, h: 32 },
      "systemLog": { x: 194, y: 96, w: 2366, h: 250 },
      "title": { x: 194, y: 0, w: 1152, h: 32 },
      "tree": { x: 1265, y: 346, w: 994, h: 1094 },
      "treeToggle": { x: 2416, y: 0, w: 33, h: 32 },
      "userBadge": { x: 1174, y: 1416, w: 90, h: 24 },
    },
  },
  {
    classId: "default",
    label: "1280x1024",
    wPx: 1280,
    hPx: 1024,
    status: "OPTIMAL",
    slots: {
      "B": { x: 194, y: 356, w: 644, h: 644 },
      "CP-analysis": { x: 980, y: 356, w: 300, h: 668 },
      "CP-cards": { x: 980, y: 356, w: 300, h: 668 },
      "CP-library": { x: 980, y: 356, w: 300, h: 668 },
      "CP-other": { x: 980, y: 356, w: 300, h: 668 },
      "CP-settings": { x: 980, y: 356, w: 300, h: 668 },
      "addBoard": { x: 26, y: 836, w: 20, h: 20 },
      "addBoardGap": { x: 46, y: 836, w: 148, h: 20 },
      "autoNav": { x: 972, y: 0, w: 32, h: 42 },
      "boardRail": { x: 26, y: 44, w: 168, h: 792 },
      "boardToggle": { x: 1103, y: 0, w: 33, h: 42 },
      "caps": { x: 688, y: 1000, w: 60, h: 24 },
      "captureBanner": { x: 194, y: 42, w: 1086, h: 32 },
      "clearCache": { x: 940, y: 0, w: 32, h: 42 },
      "connect": { x: 1036, y: 0, w: 67, h: 42 },
      "ctrlToggle": { x: 1169, y: 0, w: 33, h: 42 },
      "engineMetrics": { x: 346, y: 0, w: 160, h: 42 },
      "engineUri": { x: 194, y: 0, w: 152, h: 42 },
      "hintSlot": { x: 624, y: 1000, w: 8, h: 24 },
      "jankTest": { x: 26, y: 856, w: 168, h: 18 },
      "learn": { x: 756, y: 0, w: 90, h: 42 },
      "loadSave": { x: 26, y: 0, w: 168, h: 44 },
      "locale": { x: 1202, y: 0, w: 78, h: 42 },
      "match": { x: 889, y: 0, w: 51, h: 42 },
      "mint": { x: 650, y: 0, w: 106, h: 42 },
      "moveBadge": { x: 284, y: 1000, w: 60, h: 24 },
      "moveNav": { x: 554, y: 0, w: 96, h: 42 },
      "moveNumbers": { x: 660, y: 1000, w: 28, h: 24 },
      "pass": { x: 632, y: 1000, w: 28, h: 24 },
      "play": { x: 846, y: 0, w: 43, h: 42 },
      "players": { x: 344, y: 1000, w: 120, h: 24 },
      "popStress": { x: 1004, y: 0, w: 32, h: 42 },
      "preview": { x: 26, y: 874, w: 168, h: 150 },
      "resizerInner": { x: 979, y: 356, w: 1, h: 668 },
      "resizerOuter": { x: 838, y: 356, w: 1, h: 668 },
      "rulesKomi": { x: 464, y: 1000, w: 160, h: 24 },
      "saveBanner": { x: 194, y: 74, w: 1086, h: 32 },
      "setup": { x: 530, y: 0, w: 24, h: 42 },
      "setupChip": { x: 194, y: 1000, w: 90, h: 24 },
      "sidebarToggle": { x: 0, y: 0, w: 26, h: 1024 },
      "sliders": { x: 506, y: 0, w: 24, h: 42 },
      "systemLog": { x: 194, y: 106, w: 1086, h: 250 },
      "title": { x: 194, y: 0, w: 0, h: 42 },
      "tree": { x: 839, y: 356, w: 140, h: 668 },
      "treeToggle": { x: 1136, y: 0, w: 33, h: 42 },
      "userBadge": { x: 748, y: 1000, w: 90, h: 24 },
    },
  },
  {
    classId: "default",
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
