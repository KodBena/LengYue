/**
 * tests/unit/sidebar-widget-stacked-sgf-buttons.test.ts
 *
 * Commission row 848 ("space should not be wasted"): the LOAD SGF /
 * SAVE SGF buttons in `SidebarWidget.vue`'s `.board-actions` header
 * used to sit side by side (`flex-direction: row`, each `flex: 1`),
 * crowding two full labels into half the rail's already-narrow width.
 * They are now STACKED (`flex-direction: column`, each button full
 * width) so each label gets the rail's entire content width instead of
 * half of it.
 *
 * This is a source-text assertion (Tier 1 — no DOM, no Vue), matching
 * the established pattern for CSS-invariant claims in this codebase
 * (`tests/unit/shared-chrome-css.test.ts`,
 * `tests/unit/chart-accent-primary-lock.test.ts`): Vitest's jsdom
 * environment runs with `css: false` (`vitest.config.ts`), so a
 * `<style scoped>` block is never injected into jsdom and
 * `getComputedStyle` cannot resolve real layout — the honest artifact-
 * level fact this test can pin is "the rule declares the stacked
 * layout", not a rendered/computed one. The DOM-structural half (LOAD
 * before SAVE, both direct children of `.board-actions`) IS a genuine
 * markup fact and is asserted from the same source text via the
 * `<template>` block.
 *
 * License: Public Domain (The Unlicense)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// process.cwd() is the `frontend/` package root under Vitest's default
// config, matching shared-chrome-css.test.ts's precedent.
const SIDEBAR_WIDGET_SFC = readFileSync(
  resolve(process.cwd(), 'src/components/chrome/SidebarWidget.vue'),
  'utf-8',
);

describe('SidebarWidget.vue — LOAD SGF / SAVE SGF stacked, not side by side (commission row 848)', () => {
  it('.board-actions declares flex-direction: column (stacked), not row', () => {
    const rule = SIDEBAR_WIDGET_SFC.match(/^\.board-actions\s*\{[^}]*\}/m);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/flex-direction:\s*column/);
    expect(rule![0]).not.toMatch(/flex-direction:\s*row/);
  });

  it('.board-action-btn no longer splits the row 50/50 (no flex: 1 grow-to-share-a-row rule) — each button gets the rail\'s full content width', () => {
    const rule = SIDEBAR_WIDGET_SFC.match(/^\.board-action-btn\s*\{[^}]*\}/m);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/width:\s*100%/);
    expect(rule![0]).not.toMatch(/flex:\s*1\b/);
  });

  it('the template renders LOAD before SAVE, both as direct children of .board-actions (structural — the pairing/order a stacked layout still relies on)', () => {
    const boardActionsBlock = SIDEBAR_WIDGET_SFC.match(
      /<div class="board-actions">([\s\S]*?)<\/div>/,
    );
    expect(boardActionsBlock).not.toBeNull();
    const inner = boardActionsBlock![1];

    const loadIdx = inner.indexOf("$emit('load-sgf')");
    const saveIdx = inner.indexOf("$emit('save-sgf')");
    expect(loadIdx).toBeGreaterThan(-1);
    expect(saveIdx).toBeGreaterThan(-1);
    expect(loadIdx).toBeLessThan(saveIdx);

    // Both are <button class="board-action-btn"> — the same class the
    // stacked-layout rule above targets, confirming the markup and the
    // CSS rule are talking about the same two elements.
    const buttonMatches = inner.match(/<button class="board-action-btn"/g);
    expect(buttonMatches).not.toBeNull();
    expect(buttonMatches!.length).toBe(2);
  });

  it('#sidebar-widget rail width stays at its content-driven floor (168px, set by the docked preview box — see that rule\'s comment) rather than growing to accommodate a side-by-side button pair', () => {
    const rule = SIDEBAR_WIDGET_SFC.match(/^#sidebar-widget\s*\{[^}]*\}/m);
    expect(rule).not.toBeNull();
    expect(rule![0]).toMatch(/width:\s*168px/);
  });
});
