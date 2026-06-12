/**
 * src/lib/unhandled-rejection-backstop.ts
 *
 * Window-level `unhandledrejection` backstop. The root error boundary
 * (`components/chrome/RootErrorBoundary.vue` + `app.config.errorHandler`
 * in `main.ts`) covers errors that propagate through Vue's reactivity;
 * a promise that rejects with no `.catch` OUTSIDE Vue's render cycle
 * escapes both and reaches only the browser console — invisible to the
 * user. This module closes that gap, the deferral the root-error-boundary
 * worklog named explicitly as out-of-scope-but-worth-doing
 * (`docs/archive/worklog/2026-04-pre-v1.0/2026-04-27-root-error-boundary.md`,
 * "Out of scope" §, the `window.addEventListener('unhandledrejection')`
 * bullet).
 *
 * Posture mirrors the error boundary, per ADR-0002's loudness hierarchy:
 *   - level 5 (developer surface): `console.error` with the raw reason,
 *     on EVERY rejection.
 *   - level 4 (user surface): a `pushSystemMessage('error', …)` entry,
 *     DE-DUPLICATED so a rejection storm cannot wipe the 50-message
 *     system log (see the de-dup section below).
 *
 * Not level 3 (a throw): an unhandled rejection has already escaped; a
 * throw here would itself be an unhandled error inside an event listener,
 * compounding the failure rather than surfacing it. The error boundary
 * takes the same stance (it `console.error`s + system-messages, never
 * re-throws).
 *
 * The logic is a pure-ish factory (`createRejectionBackstop`) over
 * injected sinks so it is testable without a real `window` or store. The
 * real-dependency wiring (store `pushSystemMessage` + `i18n.global.t` +
 * `console.error`) and the `window.addEventListener('unhandledrejection')`
 * registration live in `main.ts`, the app's bootstrap/wiring surface and
 * the home of the sibling `app.config.errorHandler` backstop — keeping
 * this module dependency-free Band 1.
 *
 * Band 1 per ADR-0003 — nothing here knows about Go, game trees, or the
 * engine wire; it imports nothing; it is generic application
 * infrastructure.
 *
 * License: Public Domain (The Unlicense)
 */
const DEFAULT_MAX_DISTINCT_SURFACED = 8;
/**
 * Derive a stable de-dup key from a rejection reason. An `Error` keys on
 * its message (the repeated-loop case — the same rejection firing N times
 * — collapses to one key); a non-Error reason keys on its `String(…)`
 * form. This is deliberately the message, not the identity: two distinct
 * Error instances with the same message are the SAME failure for the
 * user's purposes, exactly as the enrichment-merge latch treats one wire
 * label as one anomaly regardless of how many packets carry it.
 */
function dedupKey(reason) {
    if (reason instanceof Error)
        return `Error: ${reason.message}`;
    return String(reason);
}
/** Human-readable reason text for the system message + console line. */
function reasonText(reason) {
    if (reason instanceof Error)
        return reason.message;
    return String(reason);
}
/**
 * Build a rejection backstop over injected sinks.
 *
 * De-dup design — generalizes the enrichment-merge latch precedent
 * (`state/analysis-ledger.ts`, the §5.5 `nestedNullEscalatedLabels`
 * Set): there, a packet flood from one mislabelled wire field surfaces
 * to the system log ONCE per workspace session, every occurrence still
 * `console.warn`s, and `purgeAll` clears the latch with the workspace.
 * The same shape here, with one addition the precedent didn't need —
 * the precedent's key space is a tiny fixed vocabulary (one wire label),
 * so a per-key Set is already bounded; a rejection reason is open-ended,
 * so an unbounded stream of DISTINCT reasons would still wipe the log
 * if every distinct reason surfaced. The `maxDistinctSurfaced` cap bounds
 * that: once the cap is hit, one final "further rejections suppressed"
 * message lands and no further distinct reason surfaces. Both gates leave
 * the level-5 `console.error` untouched — the developer surface sees
 * every rejection regardless.
 */
export function createRejectionBackstop(deps) {
    const cap = deps.maxDistinctSurfaced ?? DEFAULT_MAX_DISTINCT_SURFACED;
    // The latch: keys already surfaced to the system log this lifetime.
    const surfacedKeys = new Set();
    // Set once the cap is reached and the final suppression notice fired,
    // so the notice itself is not repeated on every subsequent rejection.
    let suppressionNoticeFired = false;
    function handle(reason) {
        // Level 5 — developer surface, EVERY rejection, never de-duplicated.
        deps.logError('[unhandledrejection] Unhandled promise rejection:', reason);
        const key = dedupKey(reason);
        // Already surfaced this exact failure — level 5 covered it above;
        // don't re-spend a system-log slot on the repeat.
        if (surfacedKeys.has(key))
            return;
        // Cap reached: the worst case (a storm of DISTINCT reasons) is held
        // off here. Fire one suppression notice, then stay silent on the
        // user surface until reset(). pushSystemMessage is mutating store
        // state; mirror the error boundary's try/catch so a push failure
        // can't itself become an unhandled rejection inside this handler.
        if (surfacedKeys.size >= cap) {
            if (!suppressionNoticeFired) {
                suppressionNoticeFired = true;
                try {
                    deps.pushSystemMessage('error', deps.translate('errors.unhandledRejectionStorm', { count: cap }));
                }
                catch (pushErr) {
                    deps.logError('[unhandledrejection] pushSystemMessage failed:', pushErr);
                }
            }
            return;
        }
        surfacedKeys.add(key);
        // Level 4 — user surface, first occurrence of this distinct reason.
        try {
            deps.pushSystemMessage('error', deps.translate('errors.unhandledRejection', { msg: reasonText(reason) }));
        }
        catch (pushErr) {
            deps.logError('[unhandledrejection] pushSystemMessage failed:', pushErr);
        }
    }
    function reset() {
        surfacedKeys.clear();
        suppressionNoticeFired = false;
    }
    return { handle, reset };
}
