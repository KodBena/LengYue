<script setup lang="ts">
/**
 * src/components/KeybindingRow.vue
 *
 * Per-action row in the Keybindings sub-tab (Phase 4 of the
 * archived plan, docs/archive/notes/design/keybindings-plan.md).
 * Holds the three-state UI substrate the editor needs:
 *
 *   - idle: shows current effective key + Edit / Reset buttons.
 *   - capturing: shows "Press a key..." prompt + Unbind / Cancel;
 *     a window-level keydown listener (installed only while this
 *     row is capturing) records the press, with conflict detection
 *     and reserved-key rejection.
 *   - conflict: when the captured key is already bound to another
 *     action — shows "<key> is bound to <action>" + Replace /
 *     Cancel.
 *
 * Capture-mode coordination is via the module-scoped `captureMode`
 * ref in `src/lib/keybindings-capture.ts`: starting a capture sets
 * it to this row's action id; the dispatcher early-returns on any
 * non-null captureMode; and a second row entering capture cleanly
 * cancels the first by virtue of the captureMode watch below.
 *
 * Resource ownership (per the codebase's mutation-site discipline):
 * the window-level keydown listener and the captureMode flag are
 * both released on transitions out of capturing AND on unmount,
 * so closing the Settings tab mid-capture (which unmounts the
 * row) leaves no dangling listener and no stuck mode flag.
 *
 * License: Public Domain (The Unlicense)
 */
import { computed, onUnmounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { store } from '../store';
import { effectiveKey, type KeybindingActionDecl } from '../lib/keybindings';
import { KEYBINDINGS_REGISTRY } from '../composables/keybindings-catalog';
import {
  captureMode,
  startCapture,
  cancelCapture,
  setBinding,
  resetBinding,
  hasOverride,
  isReservedKey,
  findActionByKey,
} from '../lib/keybindings-capture';

const props = defineProps<{ action: KeybindingActionDecl }>();
const { t } = useI18n();

type RowState =
  | { kind: 'idle' }
  | { kind: 'capturing'; reservedNotice: string | null }
  | { kind: 'conflict'; pendingKey: string; conflictingAction: KeybindingActionDecl };

const state = ref<RowState>({ kind: 'idle' });

// Narrowing helpers for the template — Vue templates can't always
// narrow discriminated unions via `v-if="state.kind === '…'"`
// the way TS narrows in script, so we expose pre-narrowed
// computeds and the template reads through them.
const captureState = computed(() => state.value.kind === 'capturing' ? state.value : null);
const conflictState = computed(() => state.value.kind === 'conflict' ? state.value : null);

const currentKeyDisplay = computed<string>(() => {
  const key = effectiveKey(props.action, store.profile.settings.keybindings);
  if (key === null) return t('keybindings.unbound');
  if (key === ' ') return 'Space';
  return key;
});

const canReset = computed<boolean>(() => hasOverride(props.action.id));

function pendingKeyDisplay(key: string): string {
  return key === ' ' ? 'Space' : key;
}

function handleEditClick(): void {
  // Single-capture-at-a-time: startCapture flips the module-scoped
  // flag. Any other row currently in capturing/conflict observes
  // the flag change and resets itself to idle (the captureMode
  // watch below).
  startCapture(props.action.id);
  state.value = { kind: 'capturing', reservedNotice: null };
}

function handleCancel(): void {
  state.value = { kind: 'idle' };
  cancelCapture();
}

function handleUnbind(): void {
  setBinding(props.action.id, null);
  state.value = { kind: 'idle' };
  cancelCapture();
}

function handleReset(): void {
  resetBinding(props.action.id);
}

function handleReplace(): void {
  if (state.value.kind !== 'conflict') return;
  const { pendingKey, conflictingAction } = state.value;
  // Unbind the conflicting action (its override is removed; if its
  // default key was the conflicting one, it falls back to default —
  // which IS the conflicting key — so we explicitly unbind it via
  // an explicit null entry to break the conflict in both
  // override-set and default-set cases).
  setBinding(conflictingAction.id, null);
  setBinding(props.action.id, pendingKey);
  state.value = { kind: 'idle' };
  cancelCapture();
}

function handleCaptureKeydown(e: KeyboardEvent): void {
  // Defensive: when state has already transitioned out of capturing
  // (e.g., another row stole capture via captureMode change before
  // the listener was torn down), do nothing.
  if (state.value.kind !== 'capturing') return;

  e.preventDefault();
  e.stopPropagation();

  // Escape doubles as "cancel capture" — it's a reserved key AND
  // its standard semantic is "back out of this".
  if (e.key === 'Escape') {
    handleCancel();
    return;
  }

  // Other reserved keys: stay in capturing, surface notice. The
  // notice replaces the prompt so the user knows what they hit.
  if (isReservedKey(e.key)) {
    state.value = { kind: 'capturing', reservedNotice: e.key };
    return;
  }

  // Conflict detection — does any OTHER action currently bind this
  // key? (Self-bind is a no-op semantically, so excluded.) The
  // catalog is passed explicitly — findActionByKey is
  // registry-agnostic.
  const conflict = findActionByKey(KEYBINDINGS_REGISTRY, e.key, props.action.id);
  if (conflict !== null) {
    state.value = {
      kind: 'conflict',
      pendingKey: e.key,
      conflictingAction: conflict,
    };
    return;
  }

  // Free key — commit immediately.
  setBinding(props.action.id, e.key);
  state.value = { kind: 'idle' };
  cancelCapture();
}

// Install / remove the window listener as 'capturing' enters /
// exits. Capture-phase listener (third arg `{ capture: true }`)
// runs before bubbling-phase listeners — including the dispatcher's
// keydown — so even if the dispatcher's captureMode early-return
// were somehow bypassed, this listener gets first crack at the
// event during capture.
watch(
  () => state.value.kind === 'capturing',
  (isCapturing) => {
    if (isCapturing) {
      window.addEventListener('keydown', handleCaptureKeydown, { capture: true });
    } else {
      window.removeEventListener('keydown', handleCaptureKeydown, { capture: true });
    }
  },
);

// Another row entering capture cancels this row's non-idle state
// cleanly. Don't call cancelCapture() here — the other row owns
// the mode flag now.
watch(
  () => captureMode.value,
  (newMode) => {
    if (newMode !== props.action.id && state.value.kind !== 'idle') {
      state.value = { kind: 'idle' };
    }
  },
);

// Resource ownership (mutation-site discipline): the row may unmount
// mid-capture (Settings tab close, profile reset). Release every
// owned resource:
//   1. window keydown listener — removed by transitioning state to
//      idle (which fires the watch above), plus a defensive remove
//      in case the watch hasn't flushed before unmount completes.
//   2. captureMode — cleared iff this row owns it; never overwrite
//      a flag a different row has taken since.
onUnmounted(() => {
  if (state.value.kind !== 'idle') {
    state.value = { kind: 'idle' };
  }
  if (captureMode.value === props.action.id) {
    cancelCapture();
  }
  window.removeEventListener('keydown', handleCaptureKeydown, { capture: true });
});
</script>

<template>
  <tr class="keybinding-row">
    <td class="action-label" :title="t(action.descriptionKey)">
      {{ t(action.labelKey) }}
    </td>
    <td class="action-key">
      <template v-if="state.kind === 'idle'">
        <span>{{ currentKeyDisplay }}</span>
      </template>
      <template v-else-if="captureState">
        <span class="capture-prompt">{{ t('keybindings.capture.prompt') }}</span>
        <span v-if="captureState.reservedNotice !== null" class="reserved-notice">
          {{ t('keybindings.capture.reservedNotice', { key: captureState.reservedNotice }) }}
        </span>
      </template>
      <template v-else-if="conflictState">
        <span class="conflict-text">
          {{ t('keybindings.capture.conflict', {
              key: pendingKeyDisplay(conflictState.pendingKey),
              action: t(conflictState.conflictingAction.labelKey),
          }) }}
        </span>
      </template>
    </td>
    <td class="action-buttons">
      <template v-if="state.kind === 'idle'">
        <button class="row-btn" @click="handleEditClick">{{ t('keybindings.button.edit') }}</button>
        <button class="row-btn" @click="handleReset" :disabled="!canReset">{{ t('keybindings.button.reset') }}</button>
      </template>
      <template v-else-if="captureState">
        <button class="row-btn" @click="handleUnbind">{{ t('keybindings.button.unbind') }}</button>
        <button class="row-btn" @click="handleCancel">{{ t('keybindings.button.cancel') }}</button>
      </template>
      <template v-else-if="conflictState">
        <button class="row-btn row-btn-attention" @click="handleReplace">{{ t('keybindings.button.replace') }}</button>
        <button class="row-btn" @click="handleCancel">{{ t('keybindings.button.cancel') }}</button>
      </template>
    </td>
  </tr>
</template>

<style scoped>
.keybinding-row td {
  padding: var(--space-tiny) var(--space-small);
  border-bottom: 1px solid var(--surface-1);
  vertical-align: middle;
}

.action-label {
  text-align: left;
  color: var(--text-0);
}

.action-key {
  text-align: right;
  color: var(--text-1);
  font-family: monospace;
  white-space: nowrap;
  min-width: 6ch;
}

.capture-prompt {
  color: var(--accent-primary);
  font-style: italic;
}

.reserved-notice {
  display: block;
  color: var(--state-attention);
  font-size: var(--text-small);
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-style: normal;
  margin-top: var(--space-tiny);
}

.conflict-text {
  color: var(--state-attention);
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.action-buttons {
  text-align: right;
  white-space: nowrap;
}

.action-buttons .row-btn + .row-btn {
  margin-left: var(--space-small);
}

.row-btn {
  background: transparent;
  border: 1px solid var(--border-3);
  color: var(--text-1);
  padding: var(--space-tiny) var(--space-small);
  border-radius: var(--radius-default);
  cursor: pointer;
  font-size: var(--text-small);
}

.row-btn:hover:not(:disabled) {
  background: var(--surface-3);
  color: var(--text-0);
}

.row-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.row-btn-attention {
  border-color: var(--state-attention);
  color: var(--state-attention);
}

.row-btn-attention:hover:not(:disabled) {
  background: var(--state-attention);
  color: var(--surface-1);
}
</style>
