/**
 * src/lib/correlation.ts
 *
 * Pure pairwise correlation helpers. Pearson is the only
 * implementation today; Spearman / Kendall etc. would land here as
 * additional functions sharing the same NaN-pair-drop convention.
 *
 * Domain-agnostic — used by the stability cross-correlation panel
 * but knows nothing about extractors or metrics.
 *
 * License: Public Domain (The Unlicense)
 */
/**
 * Pairwise Pearson correlation over `x` and `y`, with NaN/Infinity
 * pairs dropped from both sides. Returns NaN if fewer than 2 valid
 * pairs survive or if either series has zero variance over the
 * surviving pairs (mean-centred sum-of-squares = 0 → undefined).
 *
 * `x` and `y` must be the same length — they're index-aligned
 * samples of the same underlying domain (here: turn indices along
 * a variation path).
 */
export function pearson(x, y) {
    if (x.length !== y.length) {
        throw new Error(`pearson: length mismatch (${x.length} vs ${y.length})`);
    }
    const xs = [];
    const ys = [];
    for (let i = 0; i < x.length; i++) {
        if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
            xs.push(x[i]);
            ys.push(y[i]);
        }
    }
    const n = xs.length;
    if (n < 2)
        return { value: NaN, n };
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < n; i++) {
        sumX += xs[i];
        sumY += ys[i];
    }
    const meanX = sumX / n;
    const meanY = sumY / n;
    let cov = 0;
    let varX = 0;
    let varY = 0;
    for (let i = 0; i < n; i++) {
        const dx = xs[i] - meanX;
        const dy = ys[i] - meanY;
        cov += dx * dy;
        varX += dx * dx;
        varY += dy * dy;
    }
    const denom = Math.sqrt(varX * varY);
    if (denom <= 0)
        return { value: NaN, n };
    return { value: cov / denom, n };
}
