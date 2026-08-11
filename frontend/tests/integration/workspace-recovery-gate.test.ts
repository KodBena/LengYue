/**
 * tests/integration/workspace-recovery-gate.test.ts
 *
 * Drives `WorkspaceRecoveryGate.vue` + `useWorkspaceRecovery.ts`
 * (work item `next-futureblob-recovery`, ratified program row 1937,
 * incident row 1942) end to end against the REAL `AppConfirmDialog`
 * component, the same pattern `useAppDialogs.test.ts` established for
 * driving the confirm dialog against real button clicks rather than
 * mocking `dialogs.confirm` away. `SyncService` itself is a
 * lightweight fake here (two `vi.fn()`s) — this suite's job is the
 * UI-level contract ("the destructive path only fires through the
 * explicit confirmation"), not the network/store behaviour, which
 * `sync-service-future-version.test.ts` covers against the real
 * SyncService.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { defineComponent } from 'vue';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import WorkspaceRecoveryGate from '../../src/components/chrome/WorkspaceRecoveryGate.vue';
import AppConfirmDialog from '../../src/components/modals/AppConfirmDialog.vue';
import { useWorkspaceRecovery } from '../../src/composables/auth-app/useWorkspaceRecovery';
import type { SyncService } from '../../src/services/sync-service';

function fakeSync(): SyncService {
  return {
    continueOnDefaults: vi.fn(),
    resetServerWorkspaceToDefaults: vi.fn(),
  } as unknown as SyncService;
}

const BLOB_VERSION = 77;
const APP_VERSION = 75;

function mountHost(sync: SyncService): VueWrapper {
  const Host = defineComponent({
    components: { WorkspaceRecoveryGate, AppConfirmDialog },
    setup() {
      const recovery = useWorkspaceRecovery(sync);
      return { recovery };
    },
    template: `
      <div>
        <WorkspaceRecoveryGate
          :blob-version="${BLOB_VERSION}"
          :app-version="${APP_VERSION}"
          @continue="recovery.continueOnDefaults()"
          @reset="recovery.resetServerWorkspace(${BLOB_VERSION}, ${APP_VERSION})"
        />
        <AppConfirmDialog />
      </div>
    `,
  });
  return mount(Host, { attachTo: document.body, global: { plugins: [i18n] } });
}

let wrapper: VueWrapper | null = null;
afterEach(() => {
  wrapper?.unmount();
  wrapper = null;
});

describe('WorkspaceRecoveryGate — continue (default, non-destructive) action', () => {
  it('calls SyncService.continueOnDefaults() directly, with no confirmation dialog', async () => {
    const sync = fakeSync();
    wrapper = mountHost(sync);

    await wrapper.get('.action-btn-large').trigger('click');
    await flushPromises();

    expect(sync.continueOnDefaults).toHaveBeenCalledTimes(1);
    expect(sync.resetServerWorkspaceToDefaults).not.toHaveBeenCalled();
    // No dialog was ever opened for the non-destructive path.
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });
});

describe('WorkspaceRecoveryGate — reset (explicit destructive) action', () => {
  it('does NOT reset until the confirmation dialog is accepted', async () => {
    const sync = fakeSync();
    wrapper = mountHost(sync);

    await wrapper.get('.recovery-btn-danger').trigger('click');
    await flushPromises();

    // The confirm dialog is up; the destructive action has not fired yet.
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);
    expect(sync.resetServerWorkspaceToDefaults).not.toHaveBeenCalled();
  });

  it('cancelling the confirmation dialog never calls resetServerWorkspaceToDefaults()', async () => {
    const sync = fakeSync();
    wrapper = mountHost(sync);

    await wrapper.get('.recovery-btn-danger').trigger('click');
    await flushPromises();

    const dialog = wrapper.get('[role="dialog"]');
    await dialog.get('.btn-secondary').trigger('click');
    await flushPromises();

    expect(sync.resetServerWorkspaceToDefaults).not.toHaveBeenCalled();
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('accepting the confirmation dialog calls resetServerWorkspaceToDefaults() exactly once', async () => {
    const sync = fakeSync();
    wrapper = mountHost(sync);

    await wrapper.get('.recovery-btn-danger').trigger('click');
    await flushPromises();

    const dialog = wrapper.get('[role="dialog"]');
    // Destructive confirms render via .btn-danger (AppConfirmDialog's
    // `request.danger` styling) — same idiom useAppDialogs.test.ts
    // pins for the confirm-accept path.
    await dialog.get('.btn-danger').trigger('click');
    await flushPromises();

    expect(sync.resetServerWorkspaceToDefaults).toHaveBeenCalledTimes(1);
    expect(sync.continueOnDefaults).not.toHaveBeenCalled();
  });

  it("the confirmation names both versions (honest wording about what is lost)", async () => {
    const sync = fakeSync();
    wrapper = mountHost(sync);

    await wrapper.get('.recovery-btn-danger').trigger('click');
    await flushPromises();

    const dialog = wrapper.get('[role="dialog"]');
    const text = dialog.text();
    expect(text).toContain(String(BLOB_VERSION));
    expect(text).toContain(String(APP_VERSION));
  });
});

describe('WorkspaceRecoveryGate — rendering', () => {
  it('names both versions in the blocking prompt itself', () => {
    const sync = fakeSync();
    wrapper = mountHost(sync);
    const text = wrapper.text();
    expect(text).toContain(String(BLOB_VERSION));
    expect(text).toContain(String(APP_VERSION));
  });
});
