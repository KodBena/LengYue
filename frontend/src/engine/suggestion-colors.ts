/**
 * src/engine/suggestion-colors.ts
 * Pure color utilities for move suggestion overlays.
 *
 * The VisitColorFn type is the public contract for coloring non-best moves.
 * Callers treat it as a black box: they supply a visit ratio in [0, 1] and
 * receive a CSS color string. The specific implementation (palette, curve,
 * alpha) is intentionally hidden and can be swapped without touching callers.
 *
 * License: Public Domain (The Unlicense)
 */

/** The conventional cyan used to highlight the engine's top suggestion. */
export const BEST_MOVE_COLOR = '#00e5ff';

/**
 * Maps a visit ratio in [0, 1] to a CSS color string.
 * Treat this as a black box — do not branch on specific output values.
 */
export type VisitColorFn = (visitRatio: number) => string;

/**
 * src/engine/suggestion-colors.ts
 */
import { shallowRef } from 'vue';
import { big_table as TABLE } from './helper';

// ── The Factory Pattern ──────────────────────────────────────────────────────

export type IntensityColorFn = (t: number, alpha?: number) => string;

/**
 * Shape of the JSON blob consumed by `initializeIntensityFactory`. The
 * ECDF-building code only uses the `quantiles` field (a sorted array of
 * breakpoints); any additional metadata on the payload is tolerated and
 * ignored. Typing this explicitly rather than `any` makes the contract
 * between this module and whoever fetches the distribution JSON visible
 * at the type level.
 */
export interface VisitDistributionData {
  quantiles: number[];
  [key: string]: unknown;
}

/**
 * Placeholder function used until the JSON is loaded. The `_t` prefix
 * signals the parameter is intentionally unused — the placeholder ignores
 * its input and always returns the same neutral gray. Consumers poll the
 * reactive `getIntensityColor` ref, which will swap in the real function
 * once the distribution is loaded.
 */
const placeholderFn: IntensityColorFn = (_t, alpha = 1.0) => `rgba(128, 128, 128, ${alpha})`;

/**
 * The single source of truth for intensity coloring.
 * Components like BoardThumbnail.vue import this and use it.
 * Vue's reactivity will trigger a re-render when the function is replaced.
 */
export const getIntensityColor = shallowRef<IntensityColorFn>(placeholderFn);

// ── Module-level state for runtime gradient configuration ────────────────────
//
// The gradient has two configuration inputs that may change at different
// rates: the visit-distribution quantiles (loaded once from a JSON
// resource at startup) and the hue-rotation offset (a user-facing
// preference, mutated whenever the slider moves). Splitting them lets
// either be updated without re-fetching the other; each setter writes
// its respective slot then triggers a rebuild that produces a fresh
// IntensityColorFn closure.
//
// The default hue offset of -43° is a hand-applied orientation chosen
// for typical-trichromat readability; the slider lets users with
// different colour-vision profiles pick something else.
let _quantiles: number[] | null = null;
let _hueShiftDeg = -43;

/**
 * Rotate an sRGB triple by `deg` degrees around the L* axis in CIELAB.
 * Pure: no closure dependencies, cheap to call per-pixel.
 */
function rotateHueLab(r: number, g: number, b: number, deg: number): [number, number, number] {
  if (!deg) return [r, g, b];
  function lin(c: number): number { return c <= 0.04045 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); }
  function gam(c: number): number { c = Math.max(0, Math.min(1, c)); return c <= 0.0031308 ? c*12.92 : 1.055*Math.pow(c, 1/2.4) - 0.055; }
  const rl = lin(r), gl = lin(g), bl = lin(b);
  const x = 0.4124564*rl + 0.3575761*gl + 0.1804375*bl;
  const y = 0.2126729*rl + 0.7151522*gl + 0.0721750*bl;
  const z = 0.0193339*rl + 0.1191920*gl + 0.9503041*bl;
  const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
  function f(t: number): number { return t > 0.008856 ? Math.pow(t, 1/3) : 7.787*t + 16/116; }
  function fi(t: number): number { return t > 0.206897 ? t*t*t : (t - 16/116) / 7.787; }
  let fy = f(y/Yn);
  const Lab_a = 500*(f(x/Xn) - fy), Lab_b = 200*(fy - f(z/Zn));
  const Lab_L = 116*fy - 16;
  const hRad = Math.atan2(Lab_b, Lab_a) + deg * Math.PI / 180;
  const C    = Math.sqrt(Lab_a*Lab_a + Lab_b*Lab_b);
  const na = C * Math.cos(hRad), nb = C * Math.sin(hRad);
  fy = (Lab_L + 16) / 116;
  const xo = Xn*fi(na/500 + fy), yo = Yn*fi(fy), zo = Zn*fi(fy - nb/200);
  const ro =  3.2404542*xo - 1.5371385*yo - 0.4985314*zo;
  const go = -0.9692660*xo + 1.8760108*yo + 0.0415560*zo;
  const bo =  0.0556434*xo - 0.2040259*yo + 1.0572252*zo;
  return [gam(ro), gam(go), gam(bo)];
}

/**
 * Build a fresh IntensityColorFn from the current `_quantiles` and
 * `_hueShiftDeg`, and atomically swap it into `getIntensityColor`.
 * Early-returns if the distribution hasn't been loaded yet — the
 * placeholder stays in place until the resource arrives.
 *
 * The shallowRef swap is what propagates updates to consumers; they
 * read `getIntensityColor.value` (the function) and the ref's
 * reactivity triggers re-render when we replace it.
 */
function rebuildIntensityColorFn(): void {
  const quantiles = _quantiles;
  if (!quantiles) return;
  const hueShiftDeg = _hueShiftDeg;

  function ecdf(t: number): number {
    if (!quantiles || !quantiles.length) return t;
    const n = quantiles.length;
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (quantiles[mid] < t) lo = mid + 1; else hi = mid;
    }
    if (lo === 0)    return 0;
    if (lo >= n - 1) return 1;
    const t0 = quantiles[lo-1], t1 = quantiles[lo];
    return ((lo - 1) + (t1 > t0 ? (t - t0) / (t1 - t0) : 0)) / (n - 1);
  }

  // The LUT was generated by an algorithm that quotient-ed out the
  // gradient's direction (it optimised the path's perceptual shape
  // modulo orientation). The orientation we want is applied here by
  // hand: high `intensity` traverses the LUT from the *opposite* end
  // (`lookup = 1 - intensity`) while alpha ramps from the original
  // input. The two together are the symmetry the optimiser couldn't
  // fix on its own.
  const newFn: IntensityColorFn = (intensity: number, _alpha = 1.0) => {
    const lookup = 1 - intensity;
    const u = ecdf(lookup);
    const idx = u * (TABLE.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, TABLE.length - 1);
    const f = idx - lo;
    const ca = TABLE[lo], cb = TABLE[hi];
    let r = ca[0] + f * (cb[0] - ca[0]);
    let g = ca[1] + f * (cb[1] - ca[1]);
    let b = ca[2] + f * (cb[2] - ca[2]);
    if (hueShiftDeg) {
      const c = rotateHueLab(r, g, b, hueShiftDeg);
      r = c[0]; g = c[1]; b = c[2];
    }
    const a = Math.max(0, Math.min(1, intensity));
    return `rgba(${Math.floor(r*256)}, ${Math.floor(256*g)}, ${Math.floor(256*b)}, ${a})`;
  };

  getIntensityColor.value = newFn;
}

/**
 * Set the visit-distribution data backing the gradient's ECDF. Called
 * once at startup from the resource service; safe to call again if
 * the distribution is re-fetched.
 */
export function setVisitDistribution(distributionData: VisitDistributionData): void {
  _quantiles = distributionData.quantiles;
  rebuildIntensityColorFn();
}

/**
 * Set the hue-rotation offset (in degrees) applied uniformly across
 * the gradient in CIELAB space. Called by the appearance-setting
 * watcher in useAppBootstrap whenever the user moves the slider.
 */
export function setIntensityHueShift(deg: number): void {
  _hueShiftDeg = deg;
  rebuildIntensityColorFn();
}

/**
 * Backwards-compatible alias for setVisitDistribution. Existing call
 * sites (resource-service) can keep their import name; new code
 * should prefer the explicit setter.
 */
export const initializeIntensityFactory = setVisitDistribution;





// ─── Internal helpers ────────────────────────────────────────────────────────

/** Parse a 6-digit hex color into [r, g, b] components (0–255 each). */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * Linearly interpolate between two hex colors.
 * @param t  Blend factor in [0, 1]; 0 = `from`, 1 = `to`.
 * @param alpha  Shared alpha for the returned rgba string.
 */
function lerpColor(from: string, to: string, t: number, alpha: number): string {
  const [r1, g1, b1] = hexToRgb(from);
  const [r2, g2, b2] = hexToRgb(to);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgba(${r},${g},${b},${alpha})`;
}

// Low-visit anchor and high-visit anchor for the default palette.
const COLOR_LOW  = '#cc3333'; // muted red  — fewer visits, less reliable
const COLOR_HIGH = '#88cc44'; // yellow-green — many visits, high confidence
const DISK_ALPHA = 0.82;

/**
 * Default VisitColorFn implementation.
 * Returns a convex combination of COLOR_LOW and COLOR_HIGH weighted by `visitRatio`.
 * This is deliberately opaque: only the type signature is stable.
 */
export const defaultVisitColor: VisitColorFn = (visitRatio: number): string => {
  const t = Math.max(0, Math.min(1, visitRatio));
  return lerpColor(COLOR_LOW, COLOR_HIGH, t, DISK_ALPHA);
};
/**
 * f(t) -> RGBA
 * Maps a ratio [0, 1] to a smooth CSS color string.
 * This uses a "Deep Sea to Solar" gradient.
 */

export const CLUSTER_PALETTES: Record<number, string[]> = {
    2: ["#e50000", "#ff5aff", "#c4e3ae"],
    3: ["#e50000", "#ff5aff", "#c4e3ae"],
    4: ["#6091ff", "#ff0000", "#8cff00"],
    5: ["#fff5ff", "#e50000", "#005fff", "#008900"],
    6: ["#456b00", "#ff0000", "#00deff", "#ffff00", "#b71eff"],
    7: ["#ff7dff", "#00e8ff", "#a20000", "#ffff00", "#243cff", "#007900"],
    8: ["#15690a", "#f22bda", "#0065ff", "#00001d", "#d4e8ff", "#00ff00", "#ff8c00", "#740000"],
    9: ["#ffc3f9", "#ffcb00", "#fe1000", "#441d00", "#00ffe3", "#008500", "#a700ad", "#000073", "#008cff"],
    10: ["#00ffed", "#009c00", "#21007b", "#750005", "#ffcbff", "#ff720c", "#faff00", "#b600cc", "#008eff", "#002800"],
    11: ["#540030", "#002000", "#00ff00", "#000083", "#eb0039", "#00f8ff", "#52895c", "#c700ed", "#ffccf8", "#0084f9", "#ffa903"],
    12: ["#19ffe8", "#ffdcfe", "#fffe49", "#00ac00", "#ff0000", "#000027", "#580000", "#009dff", "#003c00", "#ff00df", "#7300cb", "#88746e"],
    13: ["#7a6f6d", "#00a400", "#0b001b", "#00ffdd", "#00a7ff", "#fedaf7", "#e6ff00", "#0000f4", "#ff0086", "#003500", "#af00ff", "#630000", "#ff8800"],
    14: ["#003200", "#030026", "#a2b5ff", "#420000", "#00ffe3", "#78008b", "#0020ff", "#8f6100", "#00b500", "#007f80", "#fd003c", "#ff3cfe", "#fdff00", "#ffbcab"],
    15: ["#e1ff00", "#00ab00", "#7c5800", "#002000", "#45000c", "#00ffd3", "#ff6dff", "#62b6ff", "#00726e", "#263cff", "#8b00a0", "#ff9b44", "#ffeffe", "#e0044c", "#100041"],
    16: ["#fff0fa", "#2a0000", "#003300", "#a525ff", "#000029", "#a7ff00", "#81b0ff", "#0000ff", "#169d00", "#9a005c", "#ffab37", "#ff75c8", "#00f0d2", "#ff0100", "#00767a", "#885700"],
};
