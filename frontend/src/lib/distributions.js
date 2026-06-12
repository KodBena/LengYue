/**
 * src/lib/distributions.ts
 *
 * Pure helpers for distribution visualisations: histogram binning
 * (integer-aware by default; Freedman–Diaconis for continuous
 * data with a bin-count cap) and Gaussian-kernel KDE with
 * Silverman's-rule bandwidth.
 *
 * Plain functions over plain arrays — no Vue reactivity, no
 * chart-library coupling. The DistributionChart component wraps
 * these into an ECharts-renderable form; tests can exercise the
 * arithmetic without mounting anything.
 *
 * The bin-strategy and bandwidth decisions are the implementing
 * arc's calls per `docs/notes/mistake-finder-pedagogy-and-followups.md`'s
 * "What this note does not settle" — linear bins, integer-aware
 * detection, Silverman's rule. Defensible defaults; consumers can
 * override per-call when they have palette-specific knowledge.
 *
 * License: Public Domain (The Unlicense)
 */
/**
 * Build a histogram from `samples`. Returns one HistogramBin per
 * non-empty bin (zero-count bins between min and max are included
 * so consumers don't draw misleading gaps in the bar chart).
 */
export function histogram(samples, options = {}) {
    if (samples.length === 0)
        return [];
    const finite = samples.filter(s => Number.isFinite(s));
    if (finite.length === 0)
        return [];
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    // Degenerate: every sample identical. Single bin centred on the value.
    if (min === max) {
        return [{ start: min, end: min, center: min, count: finite.length }];
    }
    const integerMode = options.integer ?? finite.every(s => Number.isInteger(s));
    const maxBins = options.maxBins ?? 50;
    let binWidth;
    if (options.binWidth !== undefined && options.binWidth > 0) {
        binWidth = options.binWidth;
    }
    else if (integerMode) {
        binWidth = 1;
    }
    else {
        binWidth = freedmanDiaconisBinWidth(finite);
        // Cap the bin count: if FD gives too many bins for the range,
        // widen the bins so we stay under maxBins. The "too many bins
        // on sparse data" failure mode is what the cap exists to guard.
        const range = max - min;
        if (range / binWidth > maxBins) {
            binWidth = range / maxBins;
        }
    }
    const start = integerMode ? Math.floor(min) : min;
    const end = integerMode ? Math.ceil(max + 1e-9) : max;
    const binCount = Math.max(1, Math.ceil((end - start) / binWidth));
    const bins = [];
    for (let i = 0; i < binCount; i++) {
        const binStart = start + i * binWidth;
        const binEnd = i === binCount - 1 ? end : start + (i + 1) * binWidth;
        bins.push({
            start: binStart,
            end: binEnd,
            center: (binStart + binEnd) / 2,
            count: 0,
        });
    }
    for (const s of finite) {
        let idx = Math.floor((s - start) / binWidth);
        if (idx >= binCount)
            idx = binCount - 1; // last-bin inclusivity
        if (idx < 0)
            idx = 0;
        bins[idx].count += 1;
    }
    return bins;
}
/**
 * Freedman–Diaconis bin-width heuristic: 2 * IQR / n^(1/3). Returns
 * a positive number; falls back to (max - min) / sqrt(n) (the rough
 * sqrt-choice rule) if IQR is degenerate (zero-spread quartiles on
 * heavily-tied data).
 */
function freedmanDiaconisBinWidth(samples) {
    const n = samples.length;
    if (n < 2)
        return 1;
    const sorted = [...samples].sort((a, b) => a - b);
    const q = (p) => {
        const i = (sorted.length - 1) * p;
        const lo = Math.floor(i);
        const hi = Math.ceil(i);
        return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
    };
    const iqr = q(0.75) - q(0.25);
    if (iqr > 0)
        return 2 * iqr / Math.cbrt(n);
    // Fallback: rough sqrt-choice on observed range. Saves degenerate
    // sample shapes (heavy ties) from blowing up.
    const range = sorted[n - 1] - sorted[0];
    return range > 0 ? range / Math.sqrt(n) : 1;
}
/**
 * Gaussian-kernel KDE evaluated at `resolution` points across the
 * sample range plus padding. Bandwidth defaults to Silverman's rule.
 * Returns an array of {x, density} suitable for ECharts line plots.
 */
export function kde(samples, options = {}) {
    const finite = samples.filter(s => Number.isFinite(s));
    if (finite.length === 0)
        return [];
    const resolution = options.resolution ?? 200;
    const paddingBandwidths = options.paddingBandwidths ?? 3;
    const bandwidth = options.bandwidth ?? silvermanBandwidth(finite);
    // Degenerate bandwidth (zero variance / single sample): nothing to
    // smooth. Return a singleton spike rather than dividing by zero.
    if (bandwidth <= 0) {
        const v = finite[0];
        return [{ x: v, density: finite.length }];
    }
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    const padding = bandwidth * paddingBandwidths;
    const xMin = min - padding;
    const xMax = max + padding;
    // Pre-compute the Gaussian normaliser. Density at x is the mean of
    // K((x - sᵢ) / h) / h across samples — equivalent to summing then
    // dividing by (n * h).
    const norm = 1 / (finite.length * bandwidth * Math.sqrt(2 * Math.PI));
    // Asymptotic SE factor for the Gaussian kernel: √(R(K) / (n·h))
    // where R(K) = ∫ K²(u) du = 1/(2√π). Multiplied by √f̂(x)
    // per-point to get the pointwise SE.
    const seFactor = options.withBand
        ? Math.sqrt(1 / (2 * Math.sqrt(Math.PI) * finite.length * bandwidth))
        : 0;
    const points = new Array(resolution);
    for (let i = 0; i < resolution; i++) {
        const t = resolution === 1 ? 0.5 : i / (resolution - 1);
        const x = xMin + t * (xMax - xMin);
        let sum = 0;
        for (const s of finite) {
            const u = (x - s) / bandwidth;
            sum += Math.exp(-0.5 * u * u);
        }
        const density = norm * sum;
        if (options.withBand) {
            const se = seFactor * Math.sqrt(density);
            points[i] = {
                x,
                density,
                lower: Math.max(0, density - 1.96 * se),
                upper: density + 1.96 * se,
            };
        }
        else {
            points[i] = { x, density };
        }
    }
    return points;
}
/**
 * Silverman's rule of thumb: h = 1.06 * σ̂ * n^(-1/5). Standard
 * default for Gaussian-kernel univariate KDE. Returns 0 for n < 2
 * (the caller should detect and bypass — a single sample has no
 * bandwidth).
 */
function silvermanBandwidth(samples) {
    const n = samples.length;
    if (n < 2)
        return 0;
    const mean = samples.reduce((a, b) => a + b, 0) / n;
    const variance = samples.reduce((acc, s) => acc + (s - mean) ** 2, 0) / (n - 1);
    const sd = Math.sqrt(variance);
    if (sd <= 0)
        return 0;
    return 1.06 * sd * Math.pow(n, -1 / 5);
}
/**
 * Convenience helper: consecutive gaps between sorted positions
 * (e.g., mistake-ply indices). Returns gaps[i] = positions[i+1] -
 * positions[i]. Empty if fewer than two positions.
 */
export function consecutiveGaps(positions) {
    if (positions.length < 2)
        return [];
    const sorted = [...positions].sort((a, b) => a - b);
    const out = new Array(sorted.length - 1);
    for (let i = 1; i < sorted.length; i++) {
        out[i - 1] = sorted[i] - sorted[i - 1];
    }
    return out;
}
