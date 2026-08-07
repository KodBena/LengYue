/**
 * tests/integration/useAppDialogs.test.ts
 *
 * Drives `useAppDialogs.ts` (ADR-0019 audit S14 — native
 * prompt()/confirm()/alert() replacement) end to end against its two
 * real dialog components (`AppConfirmDialog.vue`, `AppPromptDialog.vue`),
 * the same way `useModalKeyboard.test.ts` drives that composable
 * against a real modal rather than mocking it. Covers every resolve
 * path: confirm-accept, confirm-cancel (button + Escape), alert (single
 * button), prompt-value, prompt-cancel (button + Escape) — plus one
 * converted call site end to end (`CardSetEditor`'s "add deck" prompt),
 * per the commission's ask for at least one full site, not just the
 * composable in isolation.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { defineComponent, nextTick } from 'vue';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import { useAppDialogs } from '../../src/composables/useAppDialogs';
import AppConfirmDialog from '../../src/components/modals/AppConfirmDialog.vue';
import AppPromptDialog from '../../src/components/modals/AppPromptDialog.vue';
import CardSetEditor from '../../src/components/editors/CardSetEditor.vue';
import type { CardSet } from '../../src/types';

function dispatchKey(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

// Host mounts BOTH dialog components (as App.vue does) plus exposes
// the composable's request functions for the test to drive directly.
const DialogHost = defineComponent({
  components: { AppConfirmDialog, AppPromptDialog },
  setup() {
    return { dialogs: useAppDialogs() };
  },
  template: '<div><AppConfirmDialog /><AppPromptDialog /></div>',
});

type HostVm = { dialogs: ReturnType<typeof useAppDialogs> };

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('useAppDialogs — confirm()', () => {
  it('resolves true when the confirm button is clicked', async () => {
    wrapper = mount(DialogHost, { attachTo: document.body, global: { plugins: [i18n] } });
    const vm = wrapper.vm as unknown as HostVm;

    let resolved: boolean | undefined;
    void vm.dialogs.confirm({ message: 'Delete it?', danger: true }).then((v) => { resolved = v; });
    await flushPromises();
    await nextTick();

    const dialog = wrapper.get('[role="dialog"]');
    await dialog.get('.btn-danger').trigger('click');
    await flushPromises();

    expect(resolved).toBe(true);
    // Settling removes the dialog from the DOM (request cleared).
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('resolves false when the cancel button is clicked, and never rejects', async () => {
    wrapper = mount(DialogHost, { attachTo: document.body, global: { plugins: [i18n] } });
    const vm = wrapper.vm as unknown as HostVm;

    let resolved: boolean | undefined;
    void vm.dialogs.confirm({ message: 'Discard changes?' }).then((v) => { resolved = v; });
    await flushPromises();
    await nextTick();

    const dialog = wrapper.get('[role="dialog"]');
    await dialog.get('.btn-secondary').trigger('click');
    await flushPromises();

    expect(resolved).toBe(false);
  });

  it('resolves false on Escape — cancel, not a hang', async () => {
    wrapper = mount(DialogHost, { attachTo: document.body, global: { plugins: [i18n] } });
    const vm = wrapper.vm as unknown as HostVm;

    let resolved: boolean | undefined;
    void vm.dialogs.confirm({ message: 'Purge the ledger?' }).then((v) => { resolved = v; });
    await flushPromises();
    await nextTick();

    dispatchKey(window, 'Escape');
    await flushPromises();

    expect(resolved).toBe(false);
  });
});

describe('useAppDialogs — alert()', () => {
  it('renders a single button (no cancel path) and resolves on OK', async () => {
    wrapper = mount(DialogHost, { attachTo: document.body, global: { plugins: [i18n] } });
    const vm = wrapper.vm as unknown as HostVm;

    let settled = false;
    void vm.dialogs.alert({ message: 'Minting failed.' }).then(() => { settled = true; });
    await flushPromises();
    await nextTick();

    const dialog = wrapper.get('[role="dialog"]');
    // alert() is confirm() with cancelLabel: null — exactly one footer button.
    expect(dialog.findAll('.modal-footer button').length).toBe(1);

    await dialog.get('.btn-primary').trigger('click');
    await flushPromises();
    expect(settled).toBe(true);
  });
});

describe('useAppDialogs — prompt()', () => {
  it('resolves the typed value, seeded from defaultValue', async () => {
    wrapper = mount(DialogHost, { attachTo: document.body, global: { plugins: [i18n] } });
    const vm = wrapper.vm as unknown as HostVm;

    let resolved: string | null | undefined;
    void vm.dialogs.prompt({ message: 'New name?', defaultValue: 'old-name' })
      .then((v) => { resolved = v; });
    await flushPromises();
    await nextTick();

    const dialog = wrapper.get('[role="dialog"]');
    const input = dialog.get('input.dark-input');
    expect((input.element as HTMLInputElement).value).toBe('old-name');
    await input.setValue('new-name');
    await dialog.get('.btn-primary').trigger('click');
    await flushPromises();

    expect(resolved).toBe('new-name');
  });

  it('resolves null (not empty string) when cancelled — distinguishable from an empty submit', async () => {
    wrapper = mount(DialogHost, { attachTo: document.body, global: { plugins: [i18n] } });
    const vm = wrapper.vm as unknown as HostVm;

    let resolved: string | null | undefined = undefined;
    void vm.dialogs.prompt({ message: 'Bookmark name?' }).then((v) => { resolved = v; });
    await flushPromises();
    await nextTick();

    const dialog = wrapper.get('[role="dialog"]');
    await dialog.get('.btn-secondary').trigger('click');
    await flushPromises();

    expect(resolved).toBeNull();
  });

  it('resolves null on Escape, preserving no external draft state (C16 — nothing to lose here)', async () => {
    wrapper = mount(DialogHost, { attachTo: document.body, global: { plugins: [i18n] } });
    const vm = wrapper.vm as unknown as HostVm;

    let resolved: string | null | undefined = undefined;
    void vm.dialogs.prompt({ message: 'Parameter name?' }).then((v) => { resolved = v; });
    await flushPromises();
    await nextTick();

    dispatchKey(window, 'Escape');
    await flushPromises();

    expect(resolved).toBeNull();
  });
});

describe('CardSetEditor — "add deck" via the new prompt (converted call site, end to end)', () => {
  it('adds a card set keyed off the typed deck name', async () => {
    const Host = defineComponent({
      components: { CardSetEditor, AppPromptDialog, AppConfirmDialog },
      props: { cardSets: { type: Object, required: true }, activeCardSetId: { type: String, required: true } },
      emits: ['update', 'update-active'],
      template:
        '<div><CardSetEditor :card-sets="cardSets" :active-card-set-id="activeCardSetId" @update="$emit(\'update\', $event)" @update-active="$emit(\'update-active\', $event)" /><AppPromptDialog /><AppConfirmDialog /></div>',
    });

    wrapper = mount(Host, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { cardSets: {} as Record<string, CardSet>, activeCardSetId: '' },
    });

    await wrapper.get('.add-btn').trigger('click');
    await flushPromises();
    await nextTick();

    const promptDialog = wrapper.get('[role="dialog"]');
    await promptDialog.get('input.dark-input').setValue('Opening Repertoire');
    await promptDialog.get('.btn-primary').trigger('click');
    await flushPromises();

    const emitted = wrapper.emitted('update');
    expect(emitted).toBeTruthy();
    const payload = emitted![0][0] as { path: string[]; value: Record<string, CardSet> };
    expect(payload.path).toEqual(['cardSets']);
    const added = payload.value['opening_repertoire'];
    expect(added).toBeDefined();
    expect(added.name).toBe('Opening Repertoire');

    // The dialog is gone — no leftover modal, no lost draft since the
    // caller's own state (props.cardSets) is only touched on confirm.
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('cancelling the prompt leaves cardSets untouched (no update emitted)', async () => {
    const Host = defineComponent({
      components: { CardSetEditor, AppPromptDialog },
      props: { cardSets: { type: Object, required: true }, activeCardSetId: { type: String, required: true } },
      emits: ['update', 'update-active'],
      template:
        '<div><CardSetEditor :card-sets="cardSets" :active-card-set-id="activeCardSetId" @update="$emit(\'update\', $event)" @update-active="$emit(\'update-active\', $event)" /><AppPromptDialog /></div>',
    });

    wrapper = mount(Host, {
      attachTo: document.body,
      global: { plugins: [i18n] },
      props: { cardSets: {} as Record<string, CardSet>, activeCardSetId: '' },
    });

    await wrapper.get('.add-btn').trigger('click');
    await flushPromises();
    await nextTick();

    const promptDialog = wrapper.get('[role="dialog"]');
    await promptDialog.get('.btn-secondary').trigger('click');
    await flushPromises();

    expect(wrapper.emitted('update')).toBeFalsy();
  });
});
