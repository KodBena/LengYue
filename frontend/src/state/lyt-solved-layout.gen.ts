/**
 * GENERATED FILE — do not hand-edit.
 * Tool: research/lyt/emit_ts.py
 * Source encoding: research/lyt/encodings/current_row_repaired.lyt (layout `current-row-repaired`)
 * Solve inputs: CP-SAT lexicographic solve (research/lyt/compiler.py solve_lexicographic), board widget 'B', reach-preferred widgets auto-derived (research/lyt/runner.py _gather_reach_preferred_widgets), representative sizes research/lyt/runner.py SCREEN_SIZES.
 * Regenerate: cd research/lyt && nice -n 19 ~/w/vdc/venvs/generic/bin/python emit_ts.py --registration current_row_repaired.lyt
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
      "B": { x: 168, y: 346, w: 710, h: 710 },
      "CP-analysis": { x: 1620, y: 346, w: 300, h: 734 },
      "CP-cards": { x: 1620, y: 346, w: 300, h: 734 },
      "CP-library": { x: 1620, y: 346, w: 300, h: 734 },
      "CP-other": { x: 1620, y: 346, w: 300, h: 734 },
      "CP-settings": { x: 1620, y: 346, w: 300, h: 734 },
      "addBoard": { x: 0, y: 892, w: 168, h: 20 },
      "autoNav": { x: 1704, y: 0, w: 32, h: 32 },
      "boardRail": { x: 0, y: 44, w: 168, h: 848 },
      "boardToggle": { x: 1824, y: 0, w: 24, h: 32 },
      "caps": { x: 728, y: 1056, w: 60, h: 24 },
      "captureBanner": { x: 168, y: 32, w: 1752, h: 32 },
      "clearCache": { x: 1672, y: 0, w: 32, h: 32 },
      "connect": { x: 1768, y: 0, w: 32, h: 32 },
      "ctrlToggle": { x: 1872, y: 0, w: 24, h: 32 },
      "engineMetrics": { x: 1180, y: 0, w: 220, h: 32 },
      "engineUri": { x: 960, y: 0, w: 220, h: 32 },
      "hintSlot": { x: 598, y: 1056, w: 74, h: 24 },
      "jankTest": { x: 0, y: 912, w: 168, h: 18 },
      "learn": { x: 1576, y: 0, w: 32, h: 32 },
      "loadSave": { x: 0, y: 0, w: 168, h: 44 },
      "locale": { x: 1896, y: 0, w: 24, h: 32 },
      "match": { x: 1640, y: 0, w: 32, h: 32 },
      "mint": { x: 1544, y: 0, w: 32, h: 32 },
      "moveBadge": { x: 258, y: 1056, w: 60, h: 24 },
      "moveNav": { x: 1448, y: 0, w: 96, h: 32 },
      "moveNumbers": { x: 700, y: 1056, w: 28, h: 24 },
      "pass": { x: 672, y: 1056, w: 28, h: 24 },
      "play": { x: 1608, y: 0, w: 32, h: 32 },
      "players": { x: 318, y: 1056, w: 120, h: 24 },
      "popStress": { x: 1736, y: 0, w: 32, h: 32 },
      "preview": { x: 0, y: 930, w: 168, h: 150 },
      "resizerInner": { x: 1616, y: 346, w: 4, h: 734 },
      "resizerOuter": { x: 878, y: 346, w: 4, h: 734 },
      "rulesKomi": { x: 438, y: 1056, w: 160, h: 24 },
      "saveBanner": { x: 168, y: 64, w: 1752, h: 32 },
      "setup": { x: 1424, y: 0, w: 24, h: 32 },
      "setupChip": { x: 168, y: 1056, w: 90, h: 24 },
      "sidebarToggle": { x: 1800, y: 0, w: 24, h: 32 },
      "sliders": { x: 1400, y: 0, w: 24, h: 32 },
      "systemLog": { x: 168, y: 96, w: 1752, h: 250 },
      "title": { x: 168, y: 0, w: 792, h: 32 },
      "tree": { x: 882, y: 346, w: 734, h: 734 },
      "treeToggle": { x: 1848, y: 0, w: 24, h: 32 },
      "userBadge": { x: 788, y: 1056, w: 90, h: 24 },
    },
  },
  {
    classId: "default",
    label: "2560x1440",
    wPx: 2560,
    hPx: 1440,
    status: "OPTIMAL",
    slots: {
      "B": { x: 168, y: 346, w: 1070, h: 1070 },
      "CP-analysis": { x: 2260, y: 346, w: 300, h: 1094 },
      "CP-cards": { x: 2260, y: 346, w: 300, h: 1094 },
      "CP-library": { x: 2260, y: 346, w: 300, h: 1094 },
      "CP-other": { x: 2260, y: 346, w: 300, h: 1094 },
      "CP-settings": { x: 2260, y: 346, w: 300, h: 1094 },
      "addBoard": { x: 0, y: 1252, w: 168, h: 20 },
      "autoNav": { x: 2344, y: 0, w: 32, h: 32 },
      "boardRail": { x: 0, y: 44, w: 168, h: 1208 },
      "boardToggle": { x: 2464, y: 0, w: 24, h: 32 },
      "caps": { x: 1088, y: 1416, w: 60, h: 24 },
      "captureBanner": { x: 168, y: 32, w: 2392, h: 32 },
      "clearCache": { x: 2312, y: 0, w: 32, h: 32 },
      "connect": { x: 2408, y: 0, w: 32, h: 32 },
      "ctrlToggle": { x: 2512, y: 0, w: 24, h: 32 },
      "engineMetrics": { x: 1820, y: 0, w: 220, h: 32 },
      "engineUri": { x: 1600, y: 0, w: 220, h: 32 },
      "hintSlot": { x: 598, y: 1416, w: 434, h: 24 },
      "jankTest": { x: 0, y: 1272, w: 168, h: 18 },
      "learn": { x: 2216, y: 0, w: 32, h: 32 },
      "loadSave": { x: 0, y: 0, w: 168, h: 44 },
      "locale": { x: 2536, y: 0, w: 24, h: 32 },
      "match": { x: 2280, y: 0, w: 32, h: 32 },
      "mint": { x: 2184, y: 0, w: 32, h: 32 },
      "moveBadge": { x: 258, y: 1416, w: 60, h: 24 },
      "moveNav": { x: 2088, y: 0, w: 96, h: 32 },
      "moveNumbers": { x: 1060, y: 1416, w: 28, h: 24 },
      "pass": { x: 1032, y: 1416, w: 28, h: 24 },
      "play": { x: 2248, y: 0, w: 32, h: 32 },
      "players": { x: 318, y: 1416, w: 120, h: 24 },
      "popStress": { x: 2376, y: 0, w: 32, h: 32 },
      "preview": { x: 0, y: 1290, w: 168, h: 150 },
      "resizerInner": { x: 2256, y: 346, w: 4, h: 1094 },
      "resizerOuter": { x: 1238, y: 346, w: 4, h: 1094 },
      "rulesKomi": { x: 438, y: 1416, w: 160, h: 24 },
      "saveBanner": { x: 168, y: 64, w: 2392, h: 32 },
      "setup": { x: 2064, y: 0, w: 24, h: 32 },
      "setupChip": { x: 168, y: 1416, w: 90, h: 24 },
      "sidebarToggle": { x: 2440, y: 0, w: 24, h: 32 },
      "sliders": { x: 2040, y: 0, w: 24, h: 32 },
      "systemLog": { x: 168, y: 96, w: 2392, h: 250 },
      "title": { x: 168, y: 0, w: 1432, h: 32 },
      "tree": { x: 1242, y: 346, w: 1014, h: 1094 },
      "treeToggle": { x: 2488, y: 0, w: 24, h: 32 },
      "userBadge": { x: 1148, y: 1416, w: 90, h: 24 },
    },
  },
  {
    classId: "default",
    label: "1280x1024",
    wPx: 1280,
    hPx: 1024,
    status: "OPTIMAL",
    slots: {
      "B": { x: 168, y: 346, w: 654, h: 654 },
      "CP-analysis": { x: 980, y: 346, w: 300, h: 678 },
      "CP-cards": { x: 980, y: 346, w: 300, h: 678 },
      "CP-library": { x: 980, y: 346, w: 300, h: 678 },
      "CP-other": { x: 980, y: 346, w: 300, h: 678 },
      "CP-settings": { x: 980, y: 346, w: 300, h: 678 },
      "addBoard": { x: 0, y: 836, w: 168, h: 20 },
      "autoNav": { x: 1064, y: 0, w: 32, h: 32 },
      "boardRail": { x: 0, y: 44, w: 168, h: 792 },
      "boardToggle": { x: 1184, y: 0, w: 24, h: 32 },
      "caps": { x: 672, y: 1000, w: 60, h: 24 },
      "captureBanner": { x: 168, y: 32, w: 1112, h: 32 },
      "clearCache": { x: 1032, y: 0, w: 32, h: 32 },
      "connect": { x: 1128, y: 0, w: 32, h: 32 },
      "ctrlToggle": { x: 1232, y: 0, w: 24, h: 32 },
      "engineMetrics": { x: 540, y: 0, w: 220, h: 32 },
      "engineUri": { x: 320, y: 0, w: 220, h: 32 },
      "hintSlot": { x: 598, y: 1000, w: 18, h: 24 },
      "jankTest": { x: 0, y: 856, w: 168, h: 18 },
      "learn": { x: 936, y: 0, w: 32, h: 32 },
      "loadSave": { x: 0, y: 0, w: 168, h: 44 },
      "locale": { x: 1256, y: 0, w: 24, h: 32 },
      "match": { x: 1000, y: 0, w: 32, h: 32 },
      "mint": { x: 904, y: 0, w: 32, h: 32 },
      "moveBadge": { x: 258, y: 1000, w: 60, h: 24 },
      "moveNav": { x: 808, y: 0, w: 96, h: 32 },
      "moveNumbers": { x: 644, y: 1000, w: 28, h: 24 },
      "pass": { x: 616, y: 1000, w: 28, h: 24 },
      "play": { x: 968, y: 0, w: 32, h: 32 },
      "players": { x: 318, y: 1000, w: 120, h: 24 },
      "popStress": { x: 1096, y: 0, w: 32, h: 32 },
      "preview": { x: 0, y: 874, w: 168, h: 150 },
      "resizerInner": { x: 976, y: 346, w: 4, h: 678 },
      "resizerOuter": { x: 822, y: 346, w: 4, h: 678 },
      "rulesKomi": { x: 438, y: 1000, w: 160, h: 24 },
      "saveBanner": { x: 168, y: 64, w: 1112, h: 32 },
      "setup": { x: 784, y: 0, w: 24, h: 32 },
      "setupChip": { x: 168, y: 1000, w: 90, h: 24 },
      "sidebarToggle": { x: 1160, y: 0, w: 24, h: 32 },
      "sliders": { x: 760, y: 0, w: 24, h: 32 },
      "systemLog": { x: 168, y: 96, w: 1112, h: 250 },
      "title": { x: 168, y: 0, w: 152, h: 32 },
      "tree": { x: 826, y: 346, w: 150, h: 678 },
      "treeToggle": { x: 1208, y: 0, w: 24, h: 32 },
      "userBadge": { x: 732, y: 1000, w: 90, h: 24 },
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
