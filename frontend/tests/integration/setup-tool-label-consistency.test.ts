/**
 * tests/integration/setup-tool-label-consistency.test.ts
 *
 * Review remedy (ledger row 1335) for M8(b)/M8(a-adjacent) work:
 * SetupToolPalette.vue's `TOOLS` array used to re-literal the same
 * three i18n keys `SETUP_TOOL_LABEL_KEYS` (useSetupTools.ts) names —
 * a duplicate that could silently drift from the label
 * StatusBar.vue's `.setup-mode-chip` derives from that shared map.
 * The palette now reads `SETUP_TOOL_LABEL_KEYS` directly (no
 * hardcoded literal labelKey strings of its own); this test is the
 * drift witness two ways:
 *
 *   1. Source-text: the palette's `TOOLS` array contains no bare
 *      `'toolbar.setupToolkit.*'` string literals — every labelKey
 *      comes from the shared map, so there is nothing left TO drift.
 *   2. Behavioural: for every tool, the palette's own rendered label
 *      and StatusBar's chip label (once that tool is armed) are
 *      textually identical — both surfaces, live, agreeing.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { mount, type VueWrapper } from '@vue/test-utils';
import { i18n } from '../../src/i18n';
import SetupToolPalette from '../../src/components/chrome/SetupToolPalette.vue';
import StatusBar from '../../src/components/board/StatusBar.vue';
import { createInitialBoard } from '../../src/store/board-factory';
import { useSetupTools, SETUP_TOOL_LABEL_KEYS, type SetupTool } from '../../src/composables/board/useSetupTools';
import type { BoardState } from '../../src/types';

describe('SetupToolPalette.vue — no hardcoded labelKey literals (source-text)', () => {
  it('TOOLS reads every labelKey from SETUP_TOOL_LABEL_KEYS, not a re-literalled string', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/chrome/SetupToolPalette.vue'),
      'utf-8',
    );
    const toolsBlock = /const TOOLS: ReadonlyArray<[\s\S]*?> = \[[\s\S]*?\];/.exec(src);
    expect(toolsBlock).not.toBeNull();

    // The only way to name a label in this block should be
    // SETUP_TOOL_LABEL_KEYS[...] — a bare 'toolbar.setupToolkit.*'
    // string literal here would be exactly the reintroduced duplicate.
    expect(toolsBlock![0]).not.toMatch(/labelKey:\s*'toolbar\.setupToolkit\./);
    expect(toolsBlock![0]).toMatch(/labelKey: SETUP_TOOL_LABEL_KEYS\['stone-black'\]/);
    expect(toolsBlock![0]).toMatch(/labelKey: SETUP_TOOL_LABEL_KEYS\['stone-white'\]/);
    expect(toolsBlock![0]).toMatch(/labelKey: SETUP_TOOL_LABEL_KEYS\['triangle'\]/);
  });
});

function boardWithMetadata(): { board: BoardState; metadata: { blackName: string; whiteName: string; komi: number; rules: string } } {
  return {
    board: createInitialBoard(),
    metadata: { blackName: 'Black', whiteName: 'White', komi: 6.5, rules: 'Chinese' },
  };
}

describe('SetupToolPalette.vue label <-> StatusBar chip label — live agreement, every tool', () => {
  let paletteWrapper: VueWrapper;
  let statusWrapper: VueWrapper;
  const { closePalette } = useSetupTools();

  beforeEach(() => {
    closePalette(); // module-scope state — start each test from "no tool armed"

    const { board, metadata } = boardWithMetadata();
    paletteWrapper = mount(SetupToolPalette, { global: { plugins: [i18n] } });
    statusWrapper = mount(StatusBar, {
      props: { board, metadata, canPass: true },
      global: { plugins: [i18n] },
    });
  });

  afterEach(() => {
    paletteWrapper.unmount();
    statusWrapper.unmount();
    closePalette();
  });

  it.each(Object.keys(SETUP_TOOL_LABEL_KEYS) as SetupTool[])(
    'tool "%s": palette button label matches the StatusBar chip label',
    async (tool) => {
      // Open the palette (click-toggle, not hover — SetupToolPalette's
      // own header) so its TOOLS buttons render.
      await paletteWrapper.find('.setup-trigger').trigger('click');

      // Locate the specific button for this tool via its position in
      // SETUP_TOOL_LABEL_KEYS' own key order (matches TOOLS' order —
      // both are built from the same SetupTool union in declaration
      // order: stone-black, stone-white, triangle).
      const idx = (Object.keys(SETUP_TOOL_LABEL_KEYS) as SetupTool[]).indexOf(tool);
      const btn = paletteWrapper.findAll('.tool-btn')[idx];
      expect(btn).toBeDefined();
      const paletteLabel = btn.find('.tool-label').text();
      expect(paletteLabel.length).toBeGreaterThan(0);

      await btn.trigger('click'); // arms the tool — shared module-scope state
      await statusWrapper.vm.$nextTick();

      const chip = statusWrapper.find('[data-testid="setup-mode-chip"]');
      expect(chip.exists()).toBe(true);
      expect(chip.text()).toContain(paletteLabel);
    },
  );
});
