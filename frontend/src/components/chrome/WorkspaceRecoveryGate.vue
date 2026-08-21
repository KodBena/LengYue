<script setup lang="ts">
/**
 * src/components/chrome/WorkspaceRecoveryGate.vue
 *
 * Blocking boot-time recovery prompt for `store.workspaceLoadState.kind
 * === 'future-version'` (work item `next-futureblob-recovery`, ratified
 * program row 1937, incident row 1942 — see
 * `.claude/dispatch-reports/next-futureblob-recovery.md`). Occupies the
 * same layout slot `App.vue`'s `#workspace-boot-state` loading/error
 * legs do — the workspace surfaces stay withheld until the user makes
 * an explicit choice, same gating discipline as those two legs, but
 * this state offers a two-choice recovery affordance instead of a bare
 * Retry (a Retry here would just re-throw the same
 * `FutureSchemaVersionError` — the version disagreement doesn't
 * resolve itself).
 *
 * Pure renderer: holds no SyncService reference. Emits `continue` /
 * `reset`; `App.vue` wires both to `useWorkspaceRecovery(sync)` — the
 * "components don't hold the whole service" convention `SettingsTab
 * .vue`'s `force-save` emit already established (see that file's
 * header comment).
 *
 * License: Public Domain (The Unlicense)
 */
defineProps<{
  blobVersion: number;
  appVersion: number;
}>();

defineEmits<{
  (e: 'continue'): void;
  (e: 'reset'): void;
}>();
</script>

<template>
  <div id="workspace-recovery-gate" role="alertdialog" aria-labelledby="workspace-recovery-title">
    <h2 id="workspace-recovery-title">{{ $t('sync.recovery.title') }}</h2>
    <p>{{ $t('sync.recovery.explanation', { blobVersion, appVersion }) }}</p>

    <div class="recovery-actions">
      <button
        type="button"
        class="action-btn-large"
        @click="$emit('continue')"
      >
        {{ $t('sync.recovery.continueButton') }}
      </button>
      <p class="recovery-action-note">{{ $t('sync.recovery.continueNote') }}</p>

      <button
        type="button"
        class="recovery-btn-danger"
        @click="$emit('reset')"
      >
        {{ $t('sync.recovery.resetButton') }}
      </button>
      <p class="recovery-action-note">{{ $t('sync.recovery.resetNote') }}</p>
    </div>
  </div>
</template>

<style scoped>
/* Same layout slot as App.vue's #workspace-boot-state (flex: 1 within
   #main-workspace's column), so the toolbar-then-content shape doesn't
   jump between the loading/error/future-version legs. No box-shadow,
   no transition, no blur (standing bans); --surface-0 background,
   --text-0 text, --state-error for the destructive action's border/
   text colour only (never a filled destructive background — matches
   AppConfirmDialog.vue's .btn-danger treatment). */
#workspace-recovery-gate {
  flex: 1; min-width: 0; min-height: 0;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--space-default);
  padding: var(--space-loose);
  background: var(--surface-0);
  color: var(--text-0);
  text-align: center;
}
#workspace-recovery-title { margin: 0; font-size: var(--text-heading); color: var(--text-0); }
#workspace-recovery-gate p { margin: 0; max-width: 480px; color: var(--text-0); font-size: var(--text-body); }
.recovery-actions {
  display: flex; flex-direction: column; align-items: center;
  gap: var(--space-tight);
  margin-top: var(--space-default);
  width: 340px; max-width: 92vw;
}
.recovery-action-note { font-size: var(--text-body); color: var(--text-0); }
.recovery-btn-danger {
  width: 100%;
  background: var(--surface-0); border: 1px solid var(--state-error); color: var(--state-error);
  padding: var(--space-tight) var(--space-medium);
  border-radius: var(--radius-default);
  font-weight: bold; cursor: pointer;
}
</style>
