/**
 * tests/integration/HyperparamPromptModal-teleport.test.ts
 *
 * Rider (commissioner live finding, screenshot
 * 5f94_cards_occluded_modal.png): the deck-size hyperparameter prompt
 * (launched from Cards' "Run Pipeline"/"Start Review" affordances)
 * used to mount in-place, deep inside ForestDirectory's own nested DOM
 * subtree. Its `.modal-backdrop` is `position: fixed`, which is
 * supposed to size/center against the true viewport regardless of DOM
 * depth — but that guarantee silently breaks the moment ANY ancestor
 * between the modal and `<body>` establishes a containing block for
 * fixed-position descendants (`transform`, `filter`, `contain`,
 * `will-change` naming one of those, …), which is exactly what the
 * live witness showed: the modal rendered pinned to the control
 * panel's own box, partially off the true viewport's right edge.
 *
 * `HyperparamPromptModal.vue` now wraps its root in
 * `<Teleport to="body">`, matching every sibling modal's own effective
 * behaviour (they all mount near App.vue's template root, which is
 * itself a direct-ish descendant of `<body>` — this is the one modal
 * that used to be nested deep inside a feature panel instead). This
 * test mounts the modal inside a deeply-nested wrapper tree (standing
 * in for ForestDirectory's real nesting, without needing to import
 * ForestDirectory's own heavy composable chain) and asserts that once
 * open, the modal's DOM lands as a direct child of `document.body` —
 * OUTSIDE the nested wrapper — which is the structural guarantee that
 * makes `position: fixed` sizing/centering against the true viewport
 * robust regardless of what CSS properties any ancestor of the
 * TRIGGER acquires in the future.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent } from 'vue';
import { i18n } from '../../src/i18n';
import HyperparamPromptModal from '../../src/components/modals/HyperparamPromptModal.vue';
import type { HyperparamDecl } from '../../src/types';

// Stand-in for ForestDirectory's real nesting depth
// (.forest-cq-wrapper > .forest-container > .left-panel/.tree-panel).
// Vue's real `<Teleport>` (not stubbed — @vue/test-utils only stubs it
// when `global.stubs.teleport` is explicitly set, which this test does
// not do) moves the teleported subtree's DOM nodes to the real target
// in jsdom's own document, so this nested-wrapper shape is enough to
// exercise the exact "deep in an arbitrary ancestor chain" case the
// live bug reproduced.
const DeeplyNestedHost = defineComponent({
  components: { HyperparamPromptModal },
  template: `
    <div class="outer-a"><div class="outer-b"><div class="outer-c">
      <HyperparamPromptModal ref="modalRef" />
    </div></div></div>
  `,
});

afterEach(() => {
  // The modal teleports into document.body; clean up between tests so
  // a leftover backdrop from one test doesn't leak into the next.
  document.body.querySelectorAll('.modal-backdrop').forEach((el) => el.remove());
});

describe('HyperparamPromptModal — Teleport to body (modal-clamps-to-viewport rider)', () => {
  it('mounts its backdrop as a direct child of document.body, not inside the nested trigger subtree', async () => {
    const wrapper = mount(DeeplyNestedHost, { global: { plugins: [i18n] } });

    const decls: HyperparamDecl[] = [
      { name: 'deck_size', type: 'number', default: 10, label: 'Deck size' },
    ];
    const modal = wrapper.findComponent(HyperparamPromptModal);
    void (modal.vm as unknown as { open: (d: HyperparamDecl[]) => Promise<unknown> }).open(decls);
    await flushPromises();

    // Not rendered inside the nested wrapper subtree at all.
    expect(wrapper.find('.modal-backdrop').exists()).toBe(false);

    // Rendered as a direct child of document.body (Teleport's own
    // contract for `to="body"`), which is exactly what makes
    // `.modal-backdrop`'s `position: fixed` resolve against the real
    // viewport regardless of what the trigger's own ancestors do.
    const backdrop = document.body.querySelector(':scope > .modal-backdrop');
    expect(backdrop).not.toBeNull();
    expect(backdrop?.querySelector('#harness-prompt-title')?.textContent).toContain(
      i18n.global.t('harnessPrompt.title'),
    );

    wrapper.unmount();
  });
});
