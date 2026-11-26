/**
 * frontend/tests/ci-policy.ts
 *
 * Shared test-definition policy for presentation diagnostics that remain
 * useful during local development but are not CI regression oracles.
 *
 * Keep this helper limited to presentation assertions. Behavioural,
 * accessibility-contract, and engine-geometry tests remain unconditional
 * CI tests.
 *
 * License: Public Domain (The Unlicense)
 */
import { it } from 'vitest';

/**
 * Register a presentation-only diagnostic that runs locally but is skipped
 * by CI. GitHub Actions sets CI=true; ordinary local Vitest runs do not.
 */
export const itLocalPresentation = it.skipIf(process.env.CI === 'true');
