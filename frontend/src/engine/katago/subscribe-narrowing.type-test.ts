/**
 * src/engine/katago/subscribe-narrowing.type-test.ts
 * Compile-time regression artifact for the typed `KataGoClient.subscribe`
 * API. Asserts (via `@ts-expect-error` + positive narrows) that a
 * subscriber callback receives `ResponseFor<Q>` and so MUST discriminate
 * the error variant before reading the analysis variant — the structural
 * guarantee that replaces PR #417's per-site hand-narrowing (work-status
 * item `subscribe-dispatch-structural-narrowing`).
 * License: Public Domain (The Unlicense)
 */

// This module has no runtime exports and is imported by nothing: it exists
// only so `vue-tsc -b` (which type-checks all of `src/**/*.ts`) evaluates
// the assertions below. A `@ts-expect-error` that stops erroring — because
// a future edit re-widened the callback or restored an `as`-erasing cast —
// fails the build with "Unused '@ts-expect-error' directive", which is the
// regression this file guards. The single never-called function keeps every
// assertion off any runtime path (`vite build` tree-shakes the unimported
// module), so the artifact costs nothing at runtime.
//
// Liveness contingency (the guard's own coverage is not self-guarding):
// this file is load-bearing only while (1) it stays under `src/` —
// `tsconfig.app.json`'s `include` is `src/**`, and `tests/` is outside both
// `vue-tsc -b` AND `eslint`, so moving it there would silently inert it —
// and (2) CI runs `npm run build` (`.github/workflows/frontend-ci.yml`).
// A tsconfig `include`/`exclude` change that drops this file, or removal of
// the build step, defeats the guard with no second signal. Keep it in `src/`.

import type { KataGoClient } from './katago-client';
import type {
  KataGoAnalysisQuery,
  KataGoActionQuery,
} from './types';

// Type-only handles; never constructed or invoked at runtime.
declare const client: KataGoClient;
declare const analysisQuery: KataGoAnalysisQuery;
declare const actionQuery: KataGoActionQuery;

function __subscribeNarrowingTypeAssertions(): void {
  // ── Analysis subscription ────────────────────────────────────────────
  // The callback receives `KataAnalysisResponse | KataErrorResponse`
  // (`ResponseFor<KataGoAnalysisQuery>`), never the action variant.
  client.subscribe(analysisQuery, (res) => {
    // NEGATIVE: reading an analysis-only field without discriminating the
    // error variant is a hard type error. This `@ts-expect-error` is the
    // load-bearing assertion — if `subscribe` ever stops handing the
    // narrow union (re-widened to `KataGoResponse`, or the cast restored),
    // the read below type-checks and this directive goes unused, failing
    // the build.
    // @ts-expect-error reading `turnNumber` before discriminating the error variant must not type-check
    void res.turnNumber;

    // POSITIVE: after `'error' in res`, the `else` branch narrows to
    // `KataAnalysisResponse` with NO cast.
    if ('error' in res) {
      void res.error; // KataErrorResponse branch
      return;
    }
    void res.turnNumber;      // KataAnalysisResponse — no cast needed
    void res.isDuringSearch;  // KataAnalysisResponse — no cast needed
  });

  // NEGATIVE: an analysis subscriber's callback parameter is not the
  // action variant — an action-only field is absent from the union.
  client.subscribe(analysisQuery, (res) => {
    if ('error' in res) return;
    // @ts-expect-error `action` is not a field of KataAnalysisResponse
    void res.action;
  });

  // ── Action subscription (sendCommand's one-shot path shape) ──────────
  // The callback receives `KataActionResponse | KataErrorResponse`,
  // never the analysis variant.
  client.subscribe(actionQuery, (res) => {
    if ('error' in res) {
      void res.error;
      return;
    }
    void res.action; // KataActionResponse — no cast needed

    // @ts-expect-error `turnNumber` is not a field of KataActionResponse
    void res.turnNumber;
  });
}

// Reference the function so `noUnusedLocals` is satisfied without running it;
// `false &&` makes the call statically unreachable (no runtime invocation).
export const __SUBSCRIBE_NARROWING_TYPE_TEST = false && __subscribeNarrowingTypeAssertions();
