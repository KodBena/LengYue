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

const invokeMock = vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
  if (cmd === 'get_proxy_upstream_setting') {
    return { effective: fakeStored ?? DEFAULT_UPSTREAM, stored: fakeStored, envOverrideActive: false, defaultUpstream: DEFAULT_UPSTREAM };
  }
  if (cmd === 'set_proxy_upstream_setting') {
    fakeStored = String(args?.value ?? '');
    return null;
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
