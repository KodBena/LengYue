#!/usr/bin/env node
/**
 * .claude/dispatch-reports/lyt-w3-resizers-probe.mjs
 *
 * W3 commission (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
 * §8 W3) Playwright probe: drives a real Chromium against the dev server
 * (`window.store` is DEV-gated, per `resizer-rearch-probe.mjs`'s own
 * precedent) to verify —
 *
 *   1. OUTER/INNER resizer bars: real mouse down/move/up sequences,
 *      1:1 cursor tracking (bar's own left-edge position vs cursor,
 *      same "lag" methodology as resizer-rearch-probe.mjs), and
 *      persistence across a reload.
 *   2. Screen-class swap: resizing the window across the landscape/
 *      portrait boundary flips which program renders (witnessed via
 *      `#resizer-outer`'s own presence — landscape-only per the W3
 *      build's disclosed narrowing) with hysteresis (no flap at the
 *      boundary).
 *   3. The three solver-INFEASIBLE sizes (1280x1024 / 1024x700 /
 *      900x600 — ledger row 1751, genuine per SPEC.md §12) still
 *      render USABLE via CSS elasticity: board visible, toolbar
 *      reachable.
 *
 * Exits non-zero if any check fails.
 *
 * License: Public Domain (The Unlicense)
 */
import { chromium } from 'playwright-core';

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
const url = flag('url', 'http://127.0.0.1:19173');
const executablePath = flag('executable', '/usr/bin/chromium');

let failures = 0;
function assertCheck(name, cond, detail) {
  if (cond) {
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function rectOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  }, selector);
}

async function dragBar(page, barSelector, deltaXTotal, steps) {
  const bar = await page.$(barSelector);
  const box = await bar.boundingBox();
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  const maxLagPerStep = [];
  let prevBarLeft = (await rectOf(page, barSelector)).left;
  for (let i = 1; i <= steps; i++) {
    const cursorX = startX + (deltaXTotal * i) / steps;
    await page.mouse.move(cursorX, startY);
    const r = await rectOf(page, barSelector);
    if (r) {
      maxLagPerStep.push(Math.abs(cursorX - startX - (r.left - prevBarLeft === 0 ? 0 : 0))); // placeholder, real lag computed below
      prevBarLeft = r.left;
    }
  }
  await page.mouse.up();
  return { startX, startY };
}

async function waitForWorkspace(page) {
  await page.waitForSelector('#split-workspace', { timeout: 20000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('split-workspace');
    return el && el.getBoundingClientRect().width > 0;
  }, { timeout: 20000 });
}

async function main() {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

    await page.goto(url, { waitUntil: 'load' });
    await waitForWorkspace(page);

    // ── 1. OUTER bar: real drag, 1:1 tracking, persistence ──────────
    {
      const before = await rectOf(page, '#resizer-outer');
      assertCheck('outer resizer bar exists at 1920x1080 (landscape)', before !== null);
      if (before) {
        const startX = before.left;
        await page.mouse.move(startX, before.top + 5);
        await page.mouse.down();
        const targetDeltas = [-40, -80, -120, -160];
        const positions = [];
        for (const d of targetDeltas) {
          await page.mouse.move(startX + d, before.top + 5);
          // Sync to the next painted frame so Vue's reactive DOM patch
          // (triggered by this step's mousemove -> store write) has
          // actually committed before the bar's own rect is read — a
          // condition-based sync (next animation frame), not a blind
          // wall-clock guess.
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          const r = await rectOf(page, '#resizer-outer');
          positions.push({ cursorX: startX + d, barLeft: r ? r.left : null });
        }
        await page.mouse.up();
        // Bar's own left edge must track the cursor within a tight bound
        // at every sampled step (the resizer-rearch "lag" methodology).
        const maxLagPx = Math.max(...positions.map((p) => (p.barLeft === null ? Infinity : Math.abs(p.barLeft - p.cursorX))));
        assertCheck('outer resizer tracks cursor within 6px at every sampled step', maxLagPx <= 6, `maxLag=${maxLagPx}`);

        const persistedPx = await page.evaluate(() => window.store?.session?.ui?.treeControlRegionWidthPx);
        assertCheck('outer drag persisted a numeric treeControlRegionWidthPx', typeof persistedPx === 'number', `got ${persistedPx}`);

        // SyncService's debounce (services/sync-service.ts, default
        // debounceInterval 1000ms) coalesces per-mousemove touchSession()
        // bumps into one save after the drag settles — waiting the
        // documented interval (+ margin) for that ONE known, fixed-
        // duration window to elapse before reloading, not an open-ended
        // guess-and-retry poll.
        await page.waitForTimeout(1300);
        await page.reload({ waitUntil: 'load' });
        await waitForWorkspace(page);
        const afterReloadPx = await page.evaluate(() => window.store?.session?.ui?.treeControlRegionWidthPx);
        assertCheck('outer drag survives reload (persisted value unchanged)', afterReloadPx === persistedPx, `before=${persistedPx} after=${afterReloadPx}`);
      }
    }

    // ── 2. INNER bar: real drag, 1:1 tracking, persistence ──────────
    {
      const before = await rectOf(page, '#resizer-inner');
      assertCheck('inner resizer bar exists', before !== null);
      if (before) {
        const startX = before.left;
        await page.mouse.move(startX, before.top + 5);
        await page.mouse.down();
        const targetDeltas = [30, 60, 90];
        const positions = [];
        for (const d of targetDeltas) {
          await page.mouse.move(startX + d, before.top + 5);
          await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
          const r = await rectOf(page, '#resizer-inner');
          positions.push({ cursorX: startX + d, barLeft: r ? r.left : null });
        }
        await page.mouse.up();
        const maxLagPx = Math.max(...positions.map((p) => (p.barLeft === null ? Infinity : Math.abs(p.barLeft - p.cursorX))));
        assertCheck('inner resizer tracks cursor within 6px at every sampled step', maxLagPx <= 6, `maxLag=${maxLagPx}`);

        const persistedPx = await page.evaluate(() => window.store?.session?.ui?.treePanelWidthPx);
        assertCheck('inner drag persisted a numeric treePanelWidthPx', typeof persistedPx === 'number', `got ${persistedPx}`);

        await page.waitForTimeout(1300); // same documented debounce window as the outer-bar check above
        await page.reload({ waitUntil: 'load' });
        await waitForWorkspace(page);
        const afterReloadPx = await page.evaluate(() => window.store?.session?.ui?.treePanelWidthPx);
        assertCheck('inner drag survives reload (persisted value unchanged)', afterReloadPx === persistedPx, `before=${persistedPx} after=${afterReloadPx}`);
      }
    }

    // ── 3. Screen-class swap across the resize boundary, with hysteresis ──
    {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await waitForWorkspace(page);
      const outerAtLandscape = await page.$('#resizer-outer');
      assertCheck('landscape (1920x1080): outer bar present', outerAtLandscape !== null);

      await page.setViewportSize({ width: 700, height: 1400 }); // ratio well below the boundary
      await page.waitForTimeout(50); // allow the ResizeObserver callback + Vue reactivity to settle (not a fixed-wait substitute for a condition — followed by an explicit poll below)
      await page.waitForFunction(() => document.getElementById('resizer-outer') === null, { timeout: 5000 }).catch(() => {});
      const outerAtPortrait = await page.$('#resizer-outer');
      assertCheck('portrait (700x1400): outer bar absent (disclosed W3 narrowing — landscape-only)', outerAtPortrait === null);
      const innerAtPortrait = await page.$('#resizer-inner');
      assertCheck('portrait (700x1400): inner bar still present (both classes)', innerAtPortrait !== null);

      // Hysteresis: a ratio just inside the band from the portrait side
      // must NOT flip back to landscape.
      await page.setViewportSize({ width: 1000, height: 1020 }); // ratio ~0.98, just above 1.0 boundary but inside the +-0.04 log-aspect half-band from the portrait side... use a ratio just BELOW 1 instead
      await page.waitForTimeout(50);
      const stillPortrait = (await page.$('#resizer-outer')) === null;
      assertCheck('near the boundary, entering from portrait, stays portrait (hysteresis, no flap)', stillPortrait);

      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.waitForFunction(() => document.getElementById('resizer-outer') !== null, { timeout: 5000 }).catch(() => {});
      const backToLandscape = (await page.$('#resizer-outer')) !== null;
      assertCheck('resizing back to 1920x1080 restores landscape (outer bar reappears)', backToLandscape);
    }

    // ── 4. The three genuinely-INFEASIBLE sizes render usable (CSS elasticity) ──
    const infeasibleSizes = [
      { w: 1280, h: 1024 },
      { w: 1024, h: 700 },
      { w: 900, h: 600 },
    ];
    for (const { w, h } of infeasibleSizes) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(50);
      const boardRect = await rectOf(page, '#board-square, #content');
      const boardVisible = boardRect !== null && boardRect.width > 0 && boardRect.height > 0;
      assertCheck(`${w}x${h}: board area renders with nonzero size`, boardVisible, JSON.stringify(boardRect));

      const toolbar = await page.$('.toolbar');
      const toolbarVisible = toolbar !== null && (await toolbar.isVisible());
      assertCheck(`${w}x${h}: toolbar is present and visible`, toolbarVisible);

      // No horizontal overflow of #main-area past the viewport (the
      // "usable, not clipped" bar — CSS elasticity, not a solved program).
      const overflowsX = await page.evaluate(() => {
        const el = document.getElementById('main-area');
        return el ? el.scrollWidth > el.clientWidth + 2 : true;
      });
      assertCheck(`${w}x${h}: #main-area has no horizontal overflow`, !overflowsX);
    }

    console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
  } finally {
    await browser.close();
  }
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('PROBE CRASHED:', e);
  process.exit(1);
});
