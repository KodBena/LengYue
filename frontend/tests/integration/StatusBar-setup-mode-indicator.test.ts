/**
 * tests/integration/StatusBar-setup-mode-indicator.test.ts
 *
 * Regression guard for M8(b) (menus-ui audit row 1291): "SETUP puts
 * the board into stone-placement mode, indicated only by the
 * trigger's highlight" — a toolbar-side hue change, easy to miss once
 * the user's attention is on the board itself, where the mode is
 * actually being exercised (placing stones). StatusBar.vue now renders
 * a persistent, board-adjacent `.setup-mode-chip` naming the armed
 * tool, reading the SAME module-scope `activeTool` ref
 * SetupToolPalette.vue's trigger reads (useSetupTools.ts) — this test
 * exercises that ref directly, without mounting the palette itself.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import StatusBar from '../../src/components/board/StatusBar.vue';
import { createInitialBoard } from '../../src/store/board-factory';
import { useSetupTools } from '../../src/composables/board/useSetupTools';
import type { BoardState } from '../../src/types';

function boardWithMetadata(): { board: BoardState; metadata: { blackName: string; whiteName: string; komi: number; rules: string } } {
  return {
    board: createInitialBoard(),
    metadata: { blackName: 'Black', whiteName: 'White', komi: 6.5, rules: 'Chinese' },
  };
}

describe('StatusBar — persistent setup-mode chip (M8(b))', () => {
  let wrapper: VueWrapper | null = null;
  const { selectTool, closePalette } = useSetupTools();

  beforeEach(() => {
    closePalette(); // module-scope state — start every test from "no tool armed"
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    closePalette();
  });

  it('renders no setup-mode chip when no tool is armed', () => {
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, { props: { board, metadata, canPass: true }, global: { plugins: [i18n] } });

    expect(wrapper.find('[data-testid="setup-mode-chip"]').exists()).toBe(false);
  });

  it('renders a chip naming the armed tool once one is selected', async () => {
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, { props: { board, metadata, canPass: true }, global: { plugins: [i18n] } });

    selectTool('stone-black');
    await wrapper.vm.$nextTick();

    const chip = wrapper.find('[data-testid="setup-mode-chip"]');
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toContain('Black stone');
  });

  it('the chip tracks activeTool directly — visible while armed, gone the instant it is toggled off', async () => {
    // useSetupTools.ts's own contract (see the composable's header):
    // closing the palette ALSO clears activeTool, so a tool never stays
    // armed with the palette closed — "sticky mode" means the tool
    // survives repeated board interactions while the (necessarily
    // still-open) palette sits docked in the toolbar, which the
    // original defect (M8(b): "indicated only by the trigger's
    // highlight") made easy to miss because that highlight is toolbar-
    // side, away from where the user is actually looking (the board).
    // This chip reads the SAME `activeTool` ref, so it is exactly as
    // live as the trigger's own highlight — just board-adjacent.
    const { board, metadata } = boardWithMetadata();
    wrapper = mount(StatusBar, { props: { board, metadata, canPass: true }, global: { plugins: [i18n] } });

    selectTool('stone-white');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="setup-mode-chip"]').exists()).toBe(true);

    // Re-clicking the SAME tool toggles it off (selectTool's own
    // contract) — the chip must disappear exactly then, not before.
    selectTool('stone-white');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="setup-mode-chip"]').exists()).toBe(false);
  });
});
