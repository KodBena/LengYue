// @vitest-environment node

/**
 * tests/e2e/qeubo-smoke.test.ts
 *
 * Cross-layer end-to-end smoke for the qEUBO calibration feature. Drives
 * the real `useQeubo` composable against a real backend running with
 * `QEUBO_ENABLED=True` and Redis on `127.0.0.1:6380`. This is the
 * mechanized form of the "end-to-end UI smoke with Redis" gate the qEUBO
 * design note (`docs/archive/notes/qEUBO.md`) records as the last
 * outstanding validation step.
 *
 * What it exercises (the SPA-visible lifecycle, top to bottom):
 *   1. bootstrap()           — /qeubo/experiment/status probe; on a
 *                              QEUBO_ENABLED backend with no experiment
 *                              this resolves calibrationEnabled=true,
 *                              experimentExists=false.
 *   2. startNewExperiment()  — POST /qeubo/experiment; reads ranges from
 *                              analysis_env.parameter_meta, acquires the
 *                              substrate claims, auto-fetches the first
 *                              A/B pair (phase 'init').
 *   3. submitPreference()×N  — walks the init phase to completion; the
 *                              backend flips to 'optimization' once
 *                              total_responses reaches num_init_queries
 *                              (4 × input_dim).
 *   4. refreshBest()         — GET /qeubo/experiment/best; only valid
 *                              once fitted, so this also pins the
 *                              409-during-init → 200-after contract from
 *                              the consumer's side.
 *   5. applyEffective()      — promotes the audition (A's decoded values
 *                              overlaid on the base) into
 *                              analysis_env.parameters.
 *
 * The assertion is not statistical convergence — that lives in the
 * backend's user-driven `sanity_test.py` sweep and the slow-marked
 * service-contract test. Here we assert the wire/state lifecycle the
 * user actually walks: phases advance, points stay in [0, 1]^d, a best
 * estimate materialises after fitting, and an applied audition lands in
 * the persistent parameter store.
 *
 * Environment: `// @vitest-environment node` is load-bearing for the
 * same reason as `review-session-harness.test.ts` — jsdom's WebSocket
 * wrapper is broken; node's globals are what the api-client and store
 * expect under `tests/setup.ts`'s shims. (qEUBO itself is HTTP-only, but
 * the import chain still pulls modules that touch `window` / WebSocket.)
 *
 * Gating: skipped unless `QEUBO_E2E` is set. The backend base URL comes
 * from `VITE_API_BASE_URL` (default `http://localhost:8764`). A normal
 * `npm run test:run` is unaffected; opt in with
 *
 *     QEUBO_E2E=1 VITE_API_BASE_URL=http://127.0.0.1:8764 \
 *       npm run test:run -- tests/e2e/qeubo-smoke.test.ts
 *
 * with a backend launched as
 *
 *     QEUBO_ENABLED=True QEUBO_REDIS_URL=redis://127.0.0.1:6380 \
 *       fastapi dev backend/main.py --host 127.0.0.1 --port 8764
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { store, resetWorkspace } from '../../src/store';
import { useQeubo } from '../../src/composables/useQeubo';
import { seedTestUser } from './seed';

// ── Configuration ────────────────────────────────────────────────────────────

const ENABLED = !!process.env.QEUBO_E2E;

// The two parameters the smoke calibrates. Both get a [0, 1] range and
// `qeubo_controlled` so startNewExperiment can read their ranges and the
// substrate claim path engages exactly as it would for a real user.
const CONTROLLED = ['alpha', 'beta'] as const;

// Generous: the optimization-phase first pair triggers a GP fit on the
// backend, which can take a few seconds. The init walk is cheap. Well
// inside this bound on any reasonable host.
const PER_TEST_TIMEOUT_MS = 5 * 60 * 1000;

// Safety cap on the init walk so a backend contract drift can't spin the
// loop forever — num_init_queries is 4 × input_dim = 8 here.
const MAX_INIT_SUBMISSIONS = 64;

function mark(s: string): void {
  process.stderr.write(`[qeubo-smoke ${new Date().toISOString().slice(11, 23)}] ${s}\n`);
}

/**
 * Seed the calibrated parameters the way a real Analysis Environment
 * carries them: each gets a finite [0, 1] range + `qeubo_controlled` in
 * `parameter_meta` AND a current value in `parameters`. The current
 * value is load-bearing for `applyEffective` — the knob substrate's
 * `writeKnob` fails loudly (ADR-0002) rather than creating a missing
 * leaf, so the parameter must already exist in `parameters` before
 * qEUBO can write an audition into it.
 */
function seedControlledParameters(): void {
  const env = store.profile.settings.engine.katago.analysis_env;
  env.parameter_meta = {
    alpha: { range: [0, 1], qeubo_controlled: true },
    beta: { range: [0, 1], qeubo_controlled: true },
  };
  env.parameters = { ...env.parameters, alpha: 0.5, beta: 0.5 };
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe.skipIf(!ENABLED)(
  'qEUBO e2e smoke (real backend + Redis 6380)',
  () => {
    beforeEach(() => {
      // useQeubo is a module-scoped singleton; reset() drops its
      // operational state and releases any held substrate claims so each
      // test starts from a clean calibration view. resetWorkspace()
      // restores the profile (parameter_meta / parameters) to defaults.
      useQeubo().reset();
      localStorage.clear();
      resetWorkspace();
    });

    it(
      'walks bootstrap → start → init → optimization → best → apply',
      async () => {
        const qeubo = useQeubo();

        // 1. Fresh authenticated identity. JWT lands in localStorage and
        // the api-client threads it into every /qeubo call.
        mark('seedTestUser');
        await seedTestUser();
        seedControlledParameters();

        // 2. Bootstrap against a QEUBO_ENABLED backend with no experiment
        // yet for this brand-new user: calibration on, no experiment.
        mark('bootstrap');
        await qeubo.bootstrap();
        expect(qeubo.calibrationEnabled.value).toBe(true);
        expect(qeubo.experimentExists.value).toBe(false);

        // 3. Start the experiment. Reads the seeded ranges, acquires the
        // substrate claims, auto-fetches the first init pair.
        mark('startNewExperiment');
        await qeubo.startNewExperiment([...CONTROLLED]);
        expect(qeubo.experimentExists.value).toBe(true);
        expect(qeubo.phase.value).toBe('init');

        const firstPair = qeubo.currentPair.value;
        expect(firstPair).not.toBeNull();
        // Points live in [0, 1]^input_dim; input_dim is 2 here.
        for (const pt of [firstPair!.pointA, firstPair!.pointB]) {
          expect(pt).toHaveLength(2);
          for (const c of pt) {
            expect(c).toBeGreaterThanOrEqual(0);
            expect(c).toBeLessThanOrEqual(1);
          }
        }
        // Decoded values are keyed by the controlled-parameter names.
        for (const name of CONTROLLED) {
          expect(firstPair!.valuesA).toHaveProperty(name);
          expect(firstPair!.valuesB).toHaveProperty(name);
        }

        // 4. Walk the init phase to completion. Each submit auto-fetches
        // the next pair; the backend flips to 'optimization' once
        // total_responses reaches num_init_queries.
        let submissions = 0;
        while (qeubo.phase.value === 'init') {
          if (submissions >= MAX_INIT_SUBMISSIONS) {
            throw new Error(
              `qEUBO smoke: still in init after ${submissions} submissions; `
              + 'backend phase-flip contract may have drifted.',
            );
          }
          // Alternate the verdict; the truth function is irrelevant to the
          // smoke (we assert lifecycle, not convergence).
          await qeubo.submitPreference((submissions % 2) as 0 | 1);
          submissions++;
          mark(`submitPreference #${submissions} → phase=${qeubo.phase.value}`);
        }
        expect(qeubo.phase.value).toBe('optimization');
        // 4 × input_dim = 8 init queries; the walk should have taken
        // exactly that many submissions to flip.
        expect(submissions).toBe(8);
        // An optimization pair was auto-fetched on the flip.
        expect(qeubo.currentPair.value).not.toBeNull();

        // 5. The posterior best is only valid once fitted. From the
        // consumer's side this confirms the 200-after-init contract
        // (the 409-during-init half is the backend route test's job).
        mark('refreshBest');
        await qeubo.refreshBest();
        const best = qeubo.currentBestEstimate.value;
        expect(best).not.toBeNull();
        expect(best!.point).toHaveLength(2);
        for (const c of best!.point) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(1);
        }

        // 6. Apply the 'A' audition into the persistent parameter store.
        // effectiveParameterValues for view 'A' overlays the pair's
        // decoded valuesA onto the base; applyEffective promotes that.
        const pair = qeubo.currentPair.value!;
        qeubo.toolbarView.value = 'A';
        mark('applyEffective (view=A)');
        qeubo.applyEffective();
        // applyEffective resets the view to 'applied' on success.
        expect(qeubo.toolbarView.value).toBe('applied');

        const applied = qeubo.appliedParameterValues.value;
        for (const name of CONTROLLED) {
          expect(applied[name]).toBeCloseTo(pair.valuesA[name], 6);
        }

        // 7. Clean up the server-side experiment so the shared Redis 6380
        // doesn't accumulate per-run state.
        mark('abortExperiment');
        await qeubo.abortExperiment();
        expect(qeubo.experimentExists.value).toBe(false);
      },
      PER_TEST_TIMEOUT_MS,
    );
  },
);
