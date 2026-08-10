<script setup lang="ts">
/**
 * src/components/modals/ConfirmCloseBoardModal.vue
 * Confirm-before-destroy guard for board close (ADR-0019 audit S6 / C10 —
 * closing a board was previously irreversible and unconfirmed: one click
 * on a 16x16 corner button destroyed the board's tree with no undo).
 *
 * SidebarWidget.vue opens this only when the board being closed holds
 * more than its root node (the same cheap "has moves" dirtiness signal
 * `useDirtyBoardGuard.ts` already uses for the load-over-board guard) —
 * a freshly-created blank board closes immediately with no prompt, since
 * there is nothing to lose. See `useCloseBoardGuard.ts` for the policy
 * and its rationale.
 *
 * Same open/resolve shape as ConfirmLoadModal.vue (isOpen ref +
 * promise-resolve pattern) but resolves a plain boolean rather than a
 * structured action, since close has only two outcomes: confirmed or
 * cancelled. Keyboard/focus handling (Escape → Cancel, Tab focus trap,
 * initial focus, focus restoration) is `useModalKeyboard` — the shared
 * mechanism every modal in this directory uses (ADR-0019 audit S5).
 * (An earlier revision of this file, authored against a worktree whose
 * branch point predated useModalKeyboard existing, carried a small
 * self-contained Escape/focus mechanism instead; that was swapped for
 * the real composable once a merge brought S5 in — no functional loss,
 * this file is exactly the "thin dedicated component" that swap was
 * always meant to land on.)
 *
 * Backdrop is deliberately `background: transparent` — no dimming tint —
 * per the commissioner's standing instruction for this dispatch (a
 * departure from the older modals' `rgba(...)` backdrops in this same
 * directory). Card background is `var(--surface-0)`, the blessed control
 * background token. S14 note honored: this is a thin, single-purpose
 * modal, not a new generic confirm/prompt primitive.
 *
 * License: Public Domain (The Unlicense).
 */
import { ref } from 'vue';
import { useModalKeyboard } from '../../composables/useModalKeyboard';

const isOpen = ref(false);
const boardName = ref('');
const modalContentRef = ref<HTMLElement | null>(null);
let resolvePromise: ((confirmed: boolean) => void) | null = null;

defineExpose({
  open(name: string): Promise<boolean> {
    boardName.value = name;
    isOpen.value = true;
    return new Promise(resolve => {
      resolvePromise = resolve;
    });
  }
});

function handle(confirmed: boolean) {
  isOpen.value = false;
  if (resolvePromise) {
    resolvePromise(confirmed);
    resolvePromise = null;
  }
}

// Escape → same close path as Cancel (ADR-0019 S5); Tab focus trap +
// initial focus + focus restoration — all one shared mechanism, see
// useModalKeyboard.ts.
useModalKeyboard(modalContentRef, isOpen, () => handle(false));
</script>

<template>
  <div v-if="isOpen" class="modal-backdrop" @mousedown.self="handle(false)">
    <div ref="modalContentRef" class="modal-content" role="dialog" aria-modal="true" aria-labelledby="confirm-close-board-title" tabindex="-1">
      <div class="modal-header">
        <h2 id="confirm-close-board-title">{{ $t('confirmCloseBoard.title') }}</h2>
      </div>
      <div class="modal-body">
        <p>{{ $t('confirmCloseBoard.body', { name: boardName }) }}</p>
      </div>
      <div class="modal-footer">
        <button class="btn-cancel" @click="handle(false)">{{ $t('confirmCloseBoard.button.cancel') }}</button>
        <button class="btn-close" @click="handle(true)">{{ $t('confirmCloseBoard.button.close') }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Backdrop is a full-viewport click-catcher for the outside-click dismiss
   only — NO dimming/tint/blur (commissioner instruction; see script header). */
.modal-backdrop {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: transparent;
  display: flex; align-items: center; justify-content: center; z-index: var(--z-modal);
}
/* Same 420px width as ConfirmLoadModal.vue / MintCardModal.vue (shared
   modal-width convention; see ConfirmLoadModal.vue's magic-literal note). */
.modal-content {
  background: var(--surface-0); border: 1px solid var(--border-2); border-radius: var(--radius-default);
  width: 420px; box-shadow: 0 10px 30px rgba(0,0,0,0.8);
  display: flex; flex-direction: column; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
}
.modal-header { padding: var(--space-medium) var(--space-medium); border-bottom: 1px solid var(--surface-3); background: var(--surface-2); }
.modal-header h2 { margin: 0; font-size: var(--text-heading); color: var(--text-0); text-transform: uppercase; }
.modal-body { padding: var(--space-medium); color: var(--text-0); font-size: var(--text-emphasis); }
.modal-footer {
  display: flex; justify-content: flex-end; gap: var(--space-medium); padding: var(--space-medium) var(--space-medium);
  border-top: 1px solid var(--surface-3); background: var(--surface-2);
}
.btn-cancel { background: transparent; border: 1px solid var(--border-3); color: var(--text-0); padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
.btn-close { background: transparent; border: 1px solid var(--state-attention); color: var(--state-attention); padding: var(--space-default) var(--space-medium); border-radius: var(--radius-default); cursor: pointer; }
</style>
