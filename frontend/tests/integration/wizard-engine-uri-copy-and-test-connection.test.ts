/**
 * tests/integration/wizard-engine-uri-copy-and-test-connection.test.ts
 *
 * Two commissioned properties for `WizardStepEngineUri.vue`:
 *
 *   1. COPY REWRITE (commissioner, ledger rows 1361/1362 + audit M18) —
 *      the description leads with the user's plain-language decision,
 *      not proxy architecture; the `docs/docker.md` repo-path citation
 *      is gone from user-facing copy entirely; the architecture detail
 *      lives in a `<details>` disclosure as deployment-neutral peer
 *      cases (Docker / desktop / source).
 *   2. TEST-CONNECTION affordance (commissioner scope expansion, ledger
 *      rows 1365/1366) — a probe-only button next to the URI field with
 *      three visible states (probing/reachable/unreachable), disabled
 *      while the field is empty/invalid, and NEVER touching the app's
 *      actual engine/connection store state regardless of outcome.
 *      `lib/engine-uri-probe.ts` is mocked here so the flight/settle
 *      timing is fully controlled — no real network I/O.
 *
 * Runs outside Tauri (same posture as the sibling
 * `wizard-proxy-upstream-non-tauri.test.ts`) since neither property
 * depends on the desktop-only proxy-upstream field.
 *
 * License: Public Domain (The Unlicense)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// `vi.hoisted` — `vi.mock` factories are hoisted above all imports and
// top-level statements, so a plain `const probeMock = vi.fn()` above it
// is not actually initialized yet when the factory runs (same pattern
// the sibling `wizard-proxy-upstream-tauri-gate.test.ts` documents for
// its own hoisted `DEFAULT_UPSTREAM`).
const { probeMock } = vi.hoisted(() => ({ probeMock: vi.fn() }));

vi.mock('../../src/lib/engine-uri-probe', () => ({
  probeEngineUri: probeMock,
}));

vi.mock('../../src/services/analysis-service', async () => {
  const { fakeAnalysisService } = await import('../fakes/analysis-service');
  return { analysisService: fakeAnalysisService };
});

import { i18n } from '../../src/i18n';
import { store, resetWorkspace } from '../../src/store';
import WizardStepEngineUri from '../../src/components/wizard/steps/WizardStepEngineUri.vue';
import { resetFakeAnalysisService } from '../fakes/analysis-service';

beforeEach(() => {
  resetWorkspace();
  resetFakeAnalysisService();
  store.engine.status = 'disconnected';
  store.engine.messages = [];
  probeMock.mockReset();
});

/** A promise the test controls the settlement of, for asserting the
 *  in-flight "probing" state before resolving/rejecting it. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('WizardStepEngineUri — copy rewrite (ledger rows 1361/1362, audit M18)', () => {
  it('the repo path docs/docker.md never appears in the rendered step', () => {
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    expect(wrapper.text()).not.toContain('docs/docker.md');
  });

  it('the description leads with the plain-language decision, not proxy architecture', () => {
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    const description = wrapper.find('.step-description').text();
    expect(description).toContain('KataGo engine');
    expect(description).not.toContain('KataProxy');
    expect(description).not.toContain('ENGINE_WS_URL');
  });

  it('the hint keeps the example URI and the toolbar/Settings note, without the repo-path citation', () => {
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    const hint = wrapper.find('.field-hint').text();
    expect(hint).toContain('ws://127.0.0.1:1242');
    expect(hint).toContain('toolbar or Settings');
    expect(hint).not.toContain('docs/docker.md');
  });

  it('the architecture/packaging detail moves into a closed-by-default disclosure, as deployment-neutral peer cases', () => {
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    const details = wrapper.find('details.engine-connection-details');
    expect(details.exists()).toBe(true);
    expect((details.element as HTMLDetailsElement).open).toBe(false);

    const text = details.text();
    expect(text).toContain('If you run the Docker bundle');
    expect(text).toContain('If you use the desktop app');
    expect(text).toContain('If you run from source');
    expect(text).not.toContain('docs/docker.md');
  });
});

describe('WizardStepEngineUri — test-connection affordance (ledger rows 1365/1366)', () => {
  it('is enabled for the pre-filled default URI, disabled once the field is cleared', async () => {
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    // `editor.beginEdit()` seeds the draft from the store cell inside
    // `onMounted` — the reactive update it triggers is batched, not
    // synchronous with `mount()` returning, so the button's `:disabled`
    // binding needs a flush before it reflects the seeded value.
    await flushPromises();
    const button = wrapper.find<HTMLButtonElement>('[data-testid="wizard-engine-uri-test-button"]');
    expect(button.element.disabled).toBe(false);

    await wrapper.find('#wizard-engine-uri').setValue('');
    expect(button.element.disabled).toBe(true);
  });

  it('is disabled for a syntactically invalid URI', async () => {
    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    await flushPromises();
    await wrapper.find('#wizard-engine-uri').setValue('http://not-a-ws-uri.example');
    const button = wrapper.find<HTMLButtonElement>('[data-testid="wizard-engine-uri-test-button"]');
    expect(button.element.disabled).toBe(true);
  });

  it('shows the probing state while the probe is in flight, then reachable on success', async () => {
    const { promise, resolve } = deferred<{ ok: true }>();
    probeMock.mockReturnValue(promise);

    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    await flushPromises();
    await wrapper.find('[data-testid="wizard-engine-uri-test-button"]').trigger('click');
    await flushPromises();

    let chip = wrapper.find('[data-testid="wizard-engine-uri-test-chip"]');
    expect(chip.exists()).toBe(true);
    expect(chip.classes()).toContain('is-probing');
    expect(chip.text()).toContain('Testing');

    resolve({ ok: true });
    await flushPromises();

    chip = wrapper.find('[data-testid="wizard-engine-uri-test-chip"]');
    expect(chip.classes()).toContain('is-reachable');
    expect(chip.text()).toContain('Reachable');
  });

  it('shows unreachable with the failure reason on probe failure', async () => {
    probeMock.mockResolvedValue({ ok: false, reason: 'timeout' });

    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    await flushPromises();
    await wrapper.find('[data-testid="wizard-engine-uri-test-button"]').trigger('click');
    await flushPromises();

    const chip = wrapper.find('[data-testid="wizard-engine-uri-test-chip"]');
    expect(chip.classes()).toContain('is-unreachable');
    expect(chip.text()).toContain('Unreachable');
    expect(chip.text()).toContain('timed out');
  });

  it('an error-reason failure renders its own plain-words reason', async () => {
    probeMock.mockResolvedValue({ ok: false, reason: 'error' });

    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    await flushPromises();
    await wrapper.find('[data-testid="wizard-engine-uri-test-button"]').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="wizard-engine-uri-test-chip"]').text()).toContain('connection failed');
  });

  it('probes the CURRENTLY-TYPED draft value, never mutates the store, and never touches engine/connection state — across all three states', async () => {
    const initialUrl = store.profile.settings.engine.katago.url;
    const { promise, resolve } = deferred<{ ok: true }>();
    probeMock.mockReturnValue(promise);

    const wrapper = mount(WizardStepEngineUri, { global: { plugins: [i18n] } });
    await wrapper.find('#wizard-engine-uri').setValue('ws://typed-not-committed.example:1242');
    await wrapper.find('[data-testid="wizard-engine-uri-test-button"]').trigger('click');
    await flushPromises();

    // Probing state: store still untouched, and the probe was asked
    // about the DRAFT value, not the (unchanged) committed store cell.
    expect(probeMock).toHaveBeenCalledWith('ws://typed-not-committed.example:1242');
    expect(store.profile.settings.engine.katago.url).toBe(initialUrl);
    expect(store.engine.status).toBe('disconnected');
    expect(store.engine.messages).toEqual([]);

    resolve({ ok: true });
    await flushPromises();

    // Reachable state: still untouched — a successful probe never
    // commits the draft or opens the real connection.
    expect(store.profile.settings.engine.katago.url).toBe(initialUrl);
    expect(store.engine.status).toBe('disconnected');
    expect(store.engine.messages).toEqual([]);
  });
});
