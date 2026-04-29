/**
 * src/composables/useInitialLayoutSettle.ts
 *
 * Forces one reactive re-evaluation of the control-panel-width
 * binding after initial mount, mimicking the layout-settle effect
 * the user gets by nudging the resizer manually.
 *
 * Per release-scope item 7: the smallest fix that makes initial
 * load match a post-resize state. Root cause not pinned down at
 * authoring time — likely an interaction between the
 * `#split-workspace` flex-container layout and a child's
 * async-resolved dimension (image loads, ResizeObserver firing
 * post-commit, hydration overriding visibility flags). What is
 * known: nudging the resizer by 1px reliably corrects the layout,
 * and that nudge's only effect is a write to
 * `store.session.ui.controlPanelWidth` which re-triggers the
 * `:style` binding on `#control-panel`.
 *
 * Vue 3's reactivity skips same-value writes on reactive object
 * properties (the `set` handler short-circuits when
 * `hasChanged(newValue, oldValue)` is false), so an actual delta
 * is required to re-fire the binding. The +1 / -1 dance restores
 * the user's value immediately; `nextTick` between the two writes
 * lets the +1 commit to the DOM before the restore, giving the
 * layout one additional settle cycle in a settled context.
 *
 * The intermediate +1 width is imperceptible (one DOM frame) and
 * cannot drift the persisted value: the final write is the
 * original `cw`, which is what `SyncService` debounces and saves.
 * Robust against existing clamp violations (cw out of [200, 800])
 * because the restore returns to whatever cw was, not a clamped
 * value.
 *
 * License: Public Domain (The Unlicense).
 */
import { nextTick, onMounted } from 'vue';
import { store } from '../store';

export function useInitialLayoutSettle(): void {
  onMounted(async () => {
    await nextTick();
    const cw = store.session.ui.controlPanelWidth;
    store.session.ui.controlPanelWidth = cw + 1;
    await nextTick();
    store.session.ui.controlPanelWidth = cw;
  });
}
