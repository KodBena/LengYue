/**
 * src/engine/analysis-config-curation.ts
 *
 * Bit-equivalent rewriter for `analysis_config` symbol bodies, aligned
 * with the proxy v1.0.3 curated stdlib. Rewrites occurrences of
 * `np.<fn>(` to `<fn>(` whenever `<fn>` is one of the curated wrapper
 * names AND the call-site is a direct invocation (no attribute walk).
 *
 * The rewrite is bit-equivalent under the wrapper contract for the
 * kwarg-free positional case (the curated wrappers are drop-in for
 * `np.<fn>(...)` when no kwargs and no array-shaped scalar bounds are
 * involved). The defaults the project ships satisfy this: only
 * `np.min(x)` and `np.mean(x)` are referenced, both kwarg-free.
 *
 * Residue (any `np.*` left after the pass — fns outside the curated
 * list, attribute walks like `np.linalg.norm`, kwargs the wrapper
 * rejects) is left unchanged for the proxy's call-time `NameError` to
 * surface as a SystemMessage at review time.
 *
 * Single source for the curated names; consumed by:
 *   - `src/store/migrations.ts` (11 → 12 step, walks persisted state)
 *   - `src/services/backend-service.ts::mapToReviewCard` (ACL pass on
 *     fetched cards' baked configs — wired as part of Item 18's
 *     actual closure; the migration covers state already persisted
 *     pre-v1.0.3, the ACL covers cards as they arrive from the
 *     backend going forward)
 *
 * Coordinated with the proxy team during the v1.0.3 release window.
 * The bit-equivalence claim under the wrapper contract is the design
 * property that lets this rewriter retire pre-v1.0.3 cards' baked
 * configs without altering their computational behaviour.
 *
 * License: Public Domain (The Unlicense)
 */

// The curated stdlib name set, transcribed from the proxy v1.0.3
// curated wrapper list. The proxy's `_CURATED_SYMTABLE` in
// `proxy/reginterp.py` is the authoritative list; this set must
// mirror it for the rewrite to be sound.
//
// Note on `clip`: the proxy's `clip(x, lo, hi)` rejects array-shaped
// `lo`/`hi`, where `np.clip` permits them. The rewrite of `np.clip(`
// → `clip(` is therefore bit-equivalent only when `lo` and `hi` are
// scalars. The defaults don't reference `np.clip` so this corner
// doesn't bite in production; it's a future-maintainer note for any
// bespoke body that does use it.
const CURATED_STDLIB_NAMES: ReadonlySet<string> = new Set<string>([
  // Reductions
  'mean', 'median', 'std', 'var', 'sum', 'prod', 'min', 'max',
  'percentile', 'quantile', 'argmin', 'argmax', 'argsort',
  // Element-wise
  'log', 'exp', 'sqrt', 'abs', 'sign', 'clip',
  'isnan', 'isfinite', 'where',
  // Convolution / correlation
  'convolve', 'correlate',
  // Sliding window + higher-order
  'sliding_window', 'sliding_mean', 'sliding_median',
  'sliding_std', 'sliding_percentile', 'apply_window',
  // Stats
  'entropy', 'normalized_entropy',
  // Array construction (size-capped at proxy)
  'array', 'zeros', 'ones', 'full', 'arange', 'linspace',
  // Indexing
  'take', 'nonzero',
]);

// `\bnp\.(\w+)\(` — the regex's structural choice:
//   \b      word boundary before `np` blocks lexical edge cases like
//           `xnp.median(...)` (no boundary inside `xnp`).
//   np\.    literal namespace prefix.
//   (\w+)   capture the function name (one or more word chars).
//   \(      trailing `(` blocks attribute walks: `np.linalg.norm(`
//           does not match because `linalg` is followed by `.`, not
//           `(`. This was the precision refinement requested in the
//           proxy's Option 4 sign-off (Refinement 1).
const NP_CALL_PATTERN = /\bnp\.(\w+)\(/g;

/**
 * Rewrites `np.<fn>(` to `<fn>(` in `body` whenever `<fn>` is in the
 * curated stdlib AND followed immediately by `(`. Idempotent: a body
 * with no `np.` prefix is returned unchanged. Bit-equivalent under
 * the wrapper contract for the kwarg-free case.
 */
export function rewriteSymbolBody(body: string): string {
  return body.replace(NP_CALL_PATTERN, (match, fnName) =>
    CURATED_STDLIB_NAMES.has(fnName) ? `${fnName}(` : match
  );
}

export interface SymbolBlockRewriteResult {
  /** The rewritten symbols block (new object if any rewrite happened, same reference otherwise). */
  symbols: Record<string, unknown>;
  /** Number of bodies that changed. Zero means the input passed through. */
  rewriteCount: number;
  /** Bodies that still contain `np.<word>` after the rewrite. */
  residue: { name: string; body: string }[];
}

/**
 * Rewrites all symbol bodies in a `symbols` block.
 *
 * Returns `{symbols, rewriteCount, residue}`. When `rewriteCount` is
 * zero the original `symbols` reference is returned unchanged — the
 * caller can detect the no-op via reference equality.
 *
 * Non-string entries are passed through unchanged. The `residue`
 * collects bodies that still match `np.<word>` after the rewrite —
 * either because `<word>` isn't in the curated list, or because the
 * access path is an attribute walk the regex declined to touch.
 */
export function rewriteSymbolBlock(
  symbols: Record<string, unknown>
): SymbolBlockRewriteResult {
  let rewriteCount = 0;
  const residue: { name: string; body: string }[] = [];
  const out: Record<string, unknown> = {};

  for (const [name, body] of Object.entries(symbols)) {
    if (typeof body !== 'string') {
      out[name] = body;
      continue;
    }
    const rewritten = rewriteSymbolBody(body);
    out[name] = rewritten;
    if (rewritten !== body) rewriteCount++;
    if (/\bnp\.\w+/.test(rewritten)) {
      residue.push({ name, body: rewritten });
    }
  }

  if (rewriteCount === 0) {
    // Preserve reference identity for the no-op fast path so callers
    // can short-circuit on `result.symbols === symbols`.
    return { symbols, rewriteCount: 0, residue };
  }
  return { symbols: out, rewriteCount, residue };
}

export interface GradingParameterRewriteResult {
  /** The rewritten grading_parameter (new structural copy if rewrites happened, same reference otherwise). */
  gradingParameter: unknown;
  rewriteCount: number;
  residue: { name: string; body: string }[];
}

/**
 * Rewrites `grading_parameter.data.analysis_config.symbols` inside a
 * `grading_parameter`-shaped blob. Used at the two boundaries where
 * baked configs cross into the application (the migrations step for
 * persisted state, the ACL pass for newly-fetched cards).
 *
 * Returns reference-equality unchanged input if the path doesn't
 * exist or no body changed; otherwise a new structural copy along
 * the affected path with siblings preserved by reference.
 */
export function rewriteGradingParameterAnalysisConfig(
  gradingParameter: unknown
): GradingParameterRewriteResult {
  const noop: GradingParameterRewriteResult = {
    gradingParameter,
    rewriteCount: 0,
    residue: [],
  };

  if (!gradingParameter || typeof gradingParameter !== 'object') return noop;
  const gp = gradingParameter as Record<string, unknown>; // checked non-null object above; open-record for field reads
  const data = gp.data;
  if (!data || typeof data !== 'object') return noop;
  const dataObj = data as Record<string, unknown>; // checked non-null object above; open-record for field reads
  const config = dataObj.analysis_config;
  if (!config || typeof config !== 'object') return noop;
  const configObj = config as Record<string, unknown>; // checked non-null object above; open-record for field reads
  const symbols = configObj.symbols;
  if (!symbols || typeof symbols !== 'object') return noop;

  const result = rewriteSymbolBlock(symbols as Record<string, unknown>); // checked non-null object above; open-record for the symbol-block rewrite
  if (result.rewriteCount === 0) {
    // Path exists but nothing changed; surface the residue but keep
    // the original blob reference.
    return { gradingParameter, rewriteCount: 0, residue: result.residue };
  }
  return {
    gradingParameter: {
      ...gp,
      data: {
        ...dataObj,
        analysis_config: {
          ...configObj,
          symbols: result.symbols,
        },
      },
    },
    rewriteCount: result.rewriteCount,
    residue: result.residue,
  };
}
