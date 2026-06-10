/**
 * tests/integration/gate-prop-omission.ts
 *
 * Reusable guard for the boolean gate-prop omission class (the BaseChart
 * `active` regression, 2026-06-08): Vue casts an omitted boolean-typed prop
 * to `false`, not `undefined`, so an opt-out work-gate (`false` suppresses)
 * silently engages for every consumer that omits the prop — unless the
 * component declares an explicit default. The lint half of the guard
 * (eslint-rules/gate-prop-needs-default.js) polices that a default is
 * DECLARED; this helper verifies the declared default's runtime BEHAVIOUR —
 * that mounting with the gate prop omitted actually performs the gated work.
 *
 * Usage (BaseChart-collapsed-gate.test.ts is the worked example —
 * red/green-verified there: flipping BaseChart's default to `active: false`
 * turns the assertion red):
 *
 *   await assertOmittedGatePropMeansActive({
 *     component: BaseChart,
 *     gateProp: 'active',
 *     props: { series: SERIES },
 *     gatedWorkRan: () => spiedChart().setOption.mock.calls.length > 0,
 *   });
 *
 * The helper mounts via @vue/test-utils, flushes the microtask queue,
 * asserts the probe, and registers unmount with `onTestFinished` so
 * teardown runs on pass AND fail (the failure-safe-teardown discipline,
 * tests/CLAUDE.md). It throws up front if `props` already carries the gate
 * prop — that would make the omission assertion vacuous (ADR-0002: a guard
 * that cannot fail is worse than none).
 *
 * The probe (`gatedWorkRan`) is the per-component half: pick the observable
 * that the gate suppresses (a spy's call count, a painted canvas, a fetch)
 * and return whether it ran. Environment stubs (jsdom geometry, mocked
 * effect libraries) remain the caller's job — see the worked example's
 * ECharts mock and clientHeight stub.
 *
 * License: Public Domain (The Unlicense)
 */
import { expect, onTestFinished } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import type { Component } from 'vue';

export async function assertOmittedGatePropMeansActive(opts: {
  /** The component under guard. */
  component: Component;
  /** The boolean gate prop the mount deliberately omits. */
  gateProp: string;
  /** Every prop the mount needs EXCEPT the gate prop. */
  props: Record<string, unknown>;
  /** Probe, read after mount + flushPromises: did the gated work run? */
  gatedWorkRan: () => boolean;
}): Promise<VueWrapper> {
  if (Object.prototype.hasOwnProperty.call(opts.props, opts.gateProp)) {
    throw new Error(
      `assertOmittedGatePropMeansActive: props must OMIT '${opts.gateProp}' — ` +
        'passing it makes the omission assertion vacuous (ADR-0002).',
    );
  }
  const wrapper = mount(opts.component, { props: opts.props });
  // Failure-safe teardown (tests/CLAUDE.md): unmount on pass AND fail, so a
  // red assertion below cannot leak the mounted component into later tests.
  onTestFinished(() => wrapper.unmount());
  await flushPromises();
  expect(
    opts.gatedWorkRan(),
    `mounting with '${opts.gateProp}' omitted must still perform the gated work — ` +
      'Vue casts an omitted boolean prop to `false`, so a missing/wrong explicit default ' +
      'turns omission into permanent suppression (the BaseChart intermission-chart bug)',
  ).toBe(true);
  return wrapper;
}
