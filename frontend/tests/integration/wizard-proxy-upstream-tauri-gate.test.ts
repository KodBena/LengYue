/**
 * tests/integration/wizard-proxy-upstream-tauri-gate.test.ts
 *
 * Two commissioned properties for the desktop-only proxy-upstream field
 * (ledger rows 860-862):
 *
 *   1. TAURI GATE — `WizardStepEngineUri.vue` renders the proxy-upstream
 *      field only when `IS_TAURI` is true. The false-branch (field
 *      absent) lives in the sibling
 *      `wizard-proxy-upstream-non-tauri.test.ts`, which deliberately
 *      does NOT mock `config/env` so the real (false) resolution is
 *      exercised rather than a simulated one.
 *   2. ONE FACT, ONE HOME (ADR-0012) — the wizard step and a second,
 *      independent `useProxyUpstreamSetting()` instance (standing in
 *      for `SettingsTab.vue`'s Session sub-tab, which is a thin direct
 *      user of the SAME composable with no logic of its own — see its
 *      `<script setup>`) read and write the identical persisted cell,
 *      proven both directions through the stateful `invoke` fake below
 *      (the same technique `wizard-one-fact-one-home.test.ts` uses for
 *      the theme/palette/demo-board cells, here applied to a cell that
 *      lives in a Tauri-side JSON file rather than the reactive store).
 *
 * `analysis-service` is faked (same pattern as
 * `useEngineUriEditor.test.ts`) because `WizardStepEngineUri.vue` also
 * mounts the pre-existing engine-URI field, whose composable
 * transitively depends on it.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// `vi.hoisted` — see the sibling `useProxyUpstreamSetting.test.ts` for
// why a plain top-level `const` doesn't survive the `vi.mock` hoist.
const { DEFAULT_UPSTREAM } = vi.hoisted(() => ({ DEFAULT_UPSTREAM: 'ws://127.0.0.1:1242' }));

let fakeStored: string | null = null;
// mDNS discovery (ledger row 944) — empty by default so the pre-existing
// gate/one-fact-one-home/error-rendering coverage below (all written
// before discovery existed) is unaffected by the auto-discovery `load()`
// now runs whenever `fakeStored` is null. The discovery-specific
// behavior at the wizard-step level has its own `describe` block below,
// which sets this per-test.
let fakeDiscovered: Array<{ url: string; instanceName: string }> = [];

const invokeMock = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
  if (cmd === 'get_proxy_upstream_setting') {
    return { effective: fakeStored ?? DEFAULT_UPSTREAM, stored: fakeStored, envOverrideActive: false, defaultUpstream: DEFAULT_UPSTREAM };
  }
  if (cmd === 'set_proxy_upstream_setting') {
    fakeStored = String(args?.value ?? '');
    return null;
  }
  if (cmd === 'discover_upstreams') {
    return fakeDiscovered;
  }
  throw new Error(`unexpected invoke command: ${cmd}`);
});

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('../../src/config/env', () => ({
  IS_TAURI: true,
  API_BASE_URL: 'http://localhost:8764',
  KATAGO_WS_URL: DEFAULT_UPSTREAM,
}));
vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

import { i18n } from '../../src/i18n';
import { store, resetWorkspace } from '../../src/store';
import WizardStepEngineUri from '../../src/components/wizard/steps/WizardStepEngineUri.vue';
import { useProxyUpstreamSetting } from '../../src/composables/useProxyUpstreamSetting';
import { resetFakeAnalysisService } from '../fakes/analysis-service';

beforeEach(() => {
  resetWorkspace();
  resetFakeAnalysisService();
  store.engine.status = 'disconnected';
  store.engine.messages = [];
  fakeStored = null;
  fakeDiscovered = [];
  invokeMock.mockClear();
});

describe('WizardStepEngineUri — proxy-upstream field shown under Tauri', () => {
  it('renders the proxy-upstream label and input when IS_TAURI is true', async () => {
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    await flushPromises(); // flush the onMounted load()

    expect(wrapper.find('#wizard-proxy-upstream').exists()).toBe(true);
  });
});

describe('WizardStepEngineUri proxy-upstream — one fact, one home', () => {
  it('a value committed through the wizard field is visible via a second (Settings-standing-in) composable instance', async () => {
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    await flushPromises();

    await wrapper.find('#wizard-proxy-upstream').setValue('ws://shared-cell.example:1242');
    await wrapper.find('#wizard-proxy-upstream').trigger('blur');
    await flushPromises();

    // The "Settings" side — a fresh composable instance, exactly what
    // SettingsTab.vue's <script setup> constructs.
    const settingsSideInstance = useProxyUpstreamSetting();
    await settingsSideInstance.load();

    expect(settingsSideInstance.info.value?.stored).toBe('ws://shared-cell.example:1242');
  });

  it('a value saved via a standalone composable instance is visible when the wizard step next loads', async () => {
    const preSet = useProxyUpstreamSetting();
    preSet.draft.value = 'ws://pre-set.example:1242';
    const result = await preSet.save();
    expect(result).toEqual({ ok: true });

    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    await flushPromises();

    const input = wrapper.find<HTMLInputElement>('#wizard-proxy-upstream');
    expect(input.element.value).toBe('ws://pre-set.example:1242');
  });
});

describe('WizardStepEngineUri proxy-upstream — invalid input renders the error (fresh-context review blocker 2 regression)', () => {
  // Blocker 2: the wizard's error-state binding was a plain, non-reactive
  // `let saveErrorKey = ''` — reassigning it never triggered a re-render,
  // so `<p v-if="saveErrorKey">` never appeared after a failed save, even
  // though the composable's `save()` correctly reported the failure. No
  // DOM-driven test existed to catch this — the composable-level tests
  // (`useProxyUpstreamSetting.test.ts`) proved `save()` itself returns
  // the right discriminated result, but never rendered a component, so
  // the dead template binding shipped invisibly. These tests drive the
  // real DOM (mount -> type -> blur) the way a user does, which is the
  // only vantage point that would have caught the bug — proof the fix
  // (`ref('')` in `ProxyUpstreamSettingField.vue`) actually renders.

  it('typing an http:// URI and blurring shows the scheme error message in the DOM', async () => {
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    await flushPromises();

    const input = wrapper.find('#wizard-proxy-upstream');
    await input.setValue('http://example.test:1242');
    await input.trigger('blur');
    await flushPromises();

    const error = wrapper.find('[role="alert"]');
    expect(error.exists()).toBe(true);
    expect(error.text()).toBe('Upstream URI must use ws:// or wss://.');
    // And the invalid draft was never persisted.
    expect(invokeMock).not.toHaveBeenCalledWith('set_proxy_upstream_setting', expect.anything());
  });

  it('clearing the field and blurring shows the empty error message in the DOM', async () => {
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    await flushPromises();

    const input = wrapper.find('#wizard-proxy-upstream');
    await input.setValue('');
    await input.trigger('blur');
    await flushPromises();

    const error = wrapper.find('[role="alert"]');
    expect(error.exists()).toBe(true);
    expect(error.text()).toBe('Upstream URI cannot be empty.');
  });

  it('a subsequent valid save clears the error element from the DOM', async () => {
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    await flushPromises();

    const input = wrapper.find('#wizard-proxy-upstream');
    await input.setValue('not a uri');
    await input.trigger('blur');
    await flushPromises();
    expect(wrapper.find('[role="alert"]').exists()).toBe(true);

    await input.setValue('ws://recovered.example:1242');
    await input.trigger('blur');
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('[role="status"]').text()).toBe('Saved. Restart the app for the new upstream to take effect.');
  });
});

describe('WizardStepEngineUri proxy-upstream — mDNS discovery (ledger row 944)', () => {
  it('exactly one discovered upstream: prefills the field and shows the "found on your network" notice', async () => {
    fakeDiscovered = [{ url: 'ws://living-room.example:1242', instanceName: 'living-room-box' }];
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    await flushPromises();

    const input = wrapper.find<HTMLInputElement>('#wizard-proxy-upstream');
    expect(input.element.value).toBe('ws://living-room.example:1242');
    expect(wrapper.text()).toContain('Found on your network: living-room-box');
  });

  it('multiple discovered upstreams: shows a picker; choosing one persists through the existing save() path', async () => {
    fakeDiscovered = [
      { url: 'ws://box-one.example:1242', instanceName: 'box-one' },
      { url: 'ws://box-two.example:1242', instanceName: 'box-two' },
    ];
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    await flushPromises();

    const picker = wrapper.find<HTMLSelectElement>('#wizard-proxy-upstream-discovered');
    expect(picker.exists()).toBe(true);
    const optionValues = picker.findAll('option').map((o) => o.element.value);
    expect(optionValues).toEqual(['', 'ws://box-one.example:1242', 'ws://box-two.example:1242']);

    await picker.setValue('ws://box-two.example:1242');
    await flushPromises();

    expect(invokeMock).toHaveBeenCalledWith('set_proxy_upstream_setting', { value: 'ws://box-two.example:1242' });
    expect(fakeStored).toBe('ws://box-two.example:1242');
    // Persisting through the picker dismisses it — a stored value is
    // authoritative regardless of how it got there.
    expect(wrapper.find('#wizard-proxy-upstream-discovered').exists()).toBe(false);
    const input = wrapper.find<HTMLInputElement>('#wizard-proxy-upstream');
    expect(input.element.value).toBe('ws://box-two.example:1242');
  });

  it('zero discovered upstreams: no error, no notice beyond the normal hint, default-empty draft', async () => {
    fakeDiscovered = [];
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    await flushPromises();

    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    const input = wrapper.find<HTMLInputElement>('#wizard-proxy-upstream');
    expect(input.element.value).toBe('');
    expect(wrapper.text()).toContain(
      "Where the bundled local proxy forwards analysis requests to. Defaults to ws://127.0.0.1:1242",
    );
  });

  it('a value already stored: no discover_upstreams invoke at all', async () => {
    fakeStored = 'ws://already-set.example:1242';
    fakeDiscovered = [{ url: 'ws://should-not-be-seen.example:1242', instanceName: 'ignored-box' }];
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    await flushPromises();

    expect(invokeMock).not.toHaveBeenCalledWith('discover_upstreams');
    const input = wrapper.find<HTMLInputElement>('#wizard-proxy-upstream');
    expect(input.element.value).toBe('ws://already-set.example:1242');
  });

  it('"scan again" re-runs discovery on demand', async () => {
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    await flushPromises();
    expect(wrapper.find<HTMLInputElement>('#wizard-proxy-upstream').element.value).toBe('');

    fakeDiscovered = [{ url: 'ws://rescanned.example:1242', instanceName: 'rescanned-box' }];
    await wrapper.find('.proxy-upstream-field-rescan').trigger('click');
    await flushPromises();

    expect(wrapper.find<HTMLInputElement>('#wizard-proxy-upstream').element.value).toBe('ws://rescanned.example:1242');
  });
});
