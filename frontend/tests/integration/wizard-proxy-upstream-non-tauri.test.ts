/**
 * tests/integration/wizard-proxy-upstream-non-tauri.test.ts
 *
 * Commission constraint 5's visible half: `WizardStepEngineUri.vue`
 * must NOT render the proxy-upstream field outside Tauri. Deliberately
 * does not mock `config/env` — jsdom never sets
 * `window.__LENGYUE_PROXY_PORT__`, so `IS_TAURI` resolves to its real
 * (false) value, exercising the actual web/docker code path.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';

vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

import { i18n } from '../../src/i18n';
import { store, resetWorkspace } from '../../src/store';
import WizardStepEngineUri from '../../src/components/wizard/steps/WizardStepEngineUri.vue';
import { resetFakeAnalysisService } from '../fakes/analysis-service';
import { IS_TAURI } from '../../src/config/env';

beforeEach(() => {
  resetWorkspace();
  resetFakeAnalysisService();
  store.engine.status = 'disconnected';
  store.engine.messages = [];
});

describe('WizardStepEngineUri — proxy-upstream field absent outside Tauri', () => {
  it('IS_TAURI resolves false in plain jsdom (sanity check for this file)', () => {
    expect(IS_TAURI).toBe(false);
  });

  it('does not render the proxy-upstream label or input', () => {
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });

    expect(wrapper.find('#wizard-proxy-upstream').exists()).toBe(false);
  });

  it('still renders the pre-existing engine-URI field unaffected', () => {
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });

    expect(wrapper.find('#wizard-engine-uri').exists()).toBe(true);
  });
});
