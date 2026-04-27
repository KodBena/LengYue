/**
 * src/composables/useResizablePanel.ts
 * Effectful composable owning the document-level mousemove/mouseup
 * listener lifecycle and body-class toggle for the control-panel
 * resizer. The resized width lives in the store
 * (store.session.ui.controlPanelWidth); this composable mutates it
 * within a fixed clamp on each mousemove tick.
 *
 * Public API: { startResize(e: MouseEvent): void } — bind to
 * @mousedown on the resizer element.
 *
 * License: Public Domain (The Unlicense).
 */
import { ref } from 'vue';
import { store } from '../store';

export function useResizablePanel() {
  const isResizing = ref(false);
  let lastMouseX = 0;

  function startResize(e: MouseEvent) {
    e.preventDefault();
    isResizing.value = true;
    lastMouseX = e.clientX;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopResize);
    document.body.classList.add('resizing');
  }

  function onMouseMove(e: MouseEvent) {
    if (!isResizing.value) return;
    const deltaX = e.clientX - lastMouseX;
    lastMouseX = e.clientX;
    const currentWidth = store.session.ui.controlPanelWidth || 340;
    store.session.ui.controlPanelWidth = Math.max(200, Math.min(currentWidth - deltaX, 800));
  }

  function stopResize() {
    isResizing.value = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', stopResize);
    document.body.classList.remove('resizing');
  }

  return { startResize };
}
