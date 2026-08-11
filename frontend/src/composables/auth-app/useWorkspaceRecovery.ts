/**
 * src/composables/auth-app/useWorkspaceRecovery.ts
 * Wiring for the future-version workspace-recovery UI (work item
 * `next-futureblob-recovery`, ratified program row 1937, incident
 * row 1942 — see `.claude/dispatch-reports/next-futureblob-recovery.md`
 * for the closure statement).
 *
 * `SyncService` (`services/sync-service.ts`) owns the two recovery
 * actions themselves — `continueOnDefaults()` (no confirmation
 * needed; non-destructive) and `resetServerWorkspaceToDefaults()`
 * (destructive: overwrites the server's newer blob). This composable
 * is the one place that wires the destructive action's mandatory
 * confirmation step (`useAppDialogs().confirm({ danger: true })`, the
 * codebase's sanctioned `window.confirm` replacement — ADR-0019 audit
 * S14) so `WorkspaceRecoveryGate.vue` (the blocking boot-time prompt)
 * and the persistent `workspaceSaveState === 'suppressed'` banner in
 * `App.vue` (the ongoing reminder after "continue on defaults" was
 * chosen) share one confirmation flow rather than each re-implementing
 * it — the sole shape that lets a user destructively resolve
 * suppression at either point in the session, not only at the moment
 * the blocking prompt was first shown.
 *
 * License: Public Domain (The Unlicense)
 */
import { useI18n } from 'vue-i18n';
import { useAppDialogs } from '../useAppDialogs';
import type { SyncService } from '../../services/sync-service';

export function useWorkspaceRecovery(sync: SyncService) {
  const { t } = useI18n();
  const dialogs = useAppDialogs();

  /**
   * Continue this session on in-memory defaults, persistence
   * suppressed. Non-destructive (writes nothing), so no confirmation —
   * this is the DEFAULT recovery action per the commission.
   */
  function continueOnDefaults(): void {
    sync.continueOnDefaults();
  }

  /**
   * EXPLICIT destructive recovery action: reset the server workspace
   * to defaults, overwriting the newer blob. Honest, specific wording
   * about what is lost — names both versions, per the commission's
   * "honest wording about what is lost."
   */
  async function resetServerWorkspace(blobVersion: number, appVersion: number): Promise<void> {
    const ok = await dialogs.confirm({
      title: t('sync.recovery.resetConfirmTitle'),
      message: t('sync.recovery.resetConfirmMessage', { blobVersion, appVersion }),
      confirmLabel: t('sync.recovery.resetConfirmButton'),
      danger: true,
    });
    if (!ok) return;
    sync.resetServerWorkspaceToDefaults();
  }

  return { continueOnDefaults, resetServerWorkspace };
}
