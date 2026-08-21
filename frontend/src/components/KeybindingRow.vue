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
  <tr class="keybinding-row" :class="{ 'row-capturing': state.kind === 'capturing' }">
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
  padding: var(--space-tight) var(--space-default);
  /* M5 (audit row 1251): the prior rule referenced --surface-1,
     which is near-invisible against the panel background in more
     than one theme. --border-1 is the Library table's own row-rule
     token (LibraryTable.vue's .library-row), used here for the same
     "in-repo precedent" reason the task cites. */
  border-bottom: 1px solid var(--border-1);
  vertical-align: middle;
}

/* M5: row-hover, matching LibraryTable.vue's .library-row:hover —
   same scanning aid the in-repo precedent already uses. */
.keybinding-row:hover td {
  background: var(--surface-2);
}

/* M8(c) (menus-ui audit row 1291): a row mid-capture swallows every
   keypress in the app (keybindings-capture.ts's window-level listener),
   a fact the prior rendering signalled only via 11px italic prompt
   text — no different from any other row at a glance. An opaque
   (never translucent — standing ruling) fill on the whole row gives
   the state weight proportionate to what it's actually doing; the
   accompanying app-level banner (App.vue, gated on the same
   `captureMode` this row sets) covers the case where the user's
   attention isn't on this row/tab at all. */
.keybinding-row.row-capturing td {
  background: var(--state-attention);
  /* Same established "text on a saturated chrome fill" token as
     StatusBar.vue's `.setup-mode-chip` (theme.css's --text-on-accent,
     minted for LibraryTable.vue's `.library-row.selected`) — reused
     rather than adding a new role for the same pairing. */
  color: var(--text-on-accent);
}
/* The row's own child elements (`.action-label`, `.capture-prompt`,
   `.row-btn`, …) each set their own explicit `color`, which wins over
   inheriting the `td` rule above — restate legibility against the
   attention fill explicitly for each, rather than rely on
   inheritance. */
.keybinding-row.row-capturing .action-label,
.keybinding-row.row-capturing .capture-prompt,
.keybinding-row.row-capturing .reserved-notice {
  color: var(--text-on-accent);
}
.keybinding-row.row-capturing .row-btn {
  border-color: var(--text-on-accent);
  color: var(--text-on-accent);
}

.action-label {
  text-align: left;
  color: var(--text-0);
}

.action-key {
  /* M5 (audit finding, ledger row 1251): the chord column was
     centred per-row by the surrounding per-section <table>s each
     computing independent column widths from their own content, so
     the same visual "column" landed at a different x-position per
     section. .keybindings-table below now sets a fixed, identical
     column width for every section's table (table-layout: fixed +
     explicit widths), so left-alignment here is a genuine shared
     column, not a per-row centering artifact. */
  text-align: left;
  color: var(--text-0);
  font-family: monospace;
  white-space: nowrap;
  /* Fixed, identical-across-sections column width — see
     .keybindings-table's table-layout: fixed comment. 100px fits
     the longest default chord ("ArrowRight"/"ArrowDown", 10 chars
     monospace) plus the unbound-label string. */
  width: 100px;
}

.capture-prompt {
  /* wC-contrast (F9): readable text is always --text-0; accent-primary
     measures 2.08:1 against --surface-0 in the default cluster theme.
     Not a disabled control, so no exception applies. */
  color: var(--text-0);
  font-style: italic;
}

.reserved-notice {
  display: block;
  color: var(--state-attention);
  /* Ghost-token fix (same class as M5's): --text-small/--space-tiny
     are not defined in theme.css; --text-body/--space-tight are the
     nearest real tokens. */
  font-size: var(--text-body);
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  font-style: normal;
  margin-top: var(--space-tight);
}

.conflict-text {
  color: var(--state-attention);
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}

.action-buttons {
  text-align: right;
  white-space: nowrap;
  /* Fixed, identical-across-sections column width — see
     .keybindings-table's table-layout: fixed comment. Wide enough
     for the largest button pair (Edit + Reset) at the new >=24px
     padded size. */
  width: 150px;
}

/* M5: --space-small was never a defined token (see theme.css) — the
   custom property failed to resolve, so this margin computed to 0
   and Edit/Reset abutted with zero gap next to a destructive
   action. --space-default is a real token and gives the genuine gap
   the finding asked for. */
.action-buttons .row-btn + .row-btn {
  margin-left: var(--space-default);
}

.row-btn {
  background: transparent;
  border: 1px solid var(--border-3);
  color: var(--text-0);
  /* M16 (>=24x24 pointer targets) + M5 (ghost-token fix): the prior
     padding referenced --space-tiny/--space-small, neither a
     defined token (theme.css has --space-tight/--space-default/
     --space-medium/--space-loose only), so the shorthand was invalid
     at computed-value time and padding collapsed to 0 — the audited
     ~22x11px buttons. Real tokens plus an explicit min-height floor
     bring both dimensions to >=24px regardless of font metrics. */
  padding: var(--space-default) var(--space-medium);
  min-height: 24px;
  min-width: 24px;
  border-radius: var(--radius-default);
  cursor: pointer;
  font-size: var(--text-body);
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
