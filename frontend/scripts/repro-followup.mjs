#!/usr/bin/env node
/**
 * frontend/scripts/repro-followup.mjs
 *
 * Ad-hoc live-repro script for `.claude/dispatch-reports/
 * preview-board-followup-build.md` items 1 and 3 — NOT wired into CI
 * or any npm script, run by hand against an already-running preview
 * server + backend. Mirrors `lyt-w2-usability.mjs`'s launch/cleanup
 * skeleton and playwright discipline (read that script's header
 * before touching this one):
 *
 *   - Wrap the `node` invocation itself in `systemd-run --user --scope
 *     -p MemoryMax=4G`; this script does not self-wrap.
 *   - `--js-flags=--max-old-space-size=1024` passed to the launched
 *     Chromium.
 *   - ONE browser instance, closed in `finally`.
 *   - No wall-clock sleeps — every wait is `waitForSelector` /
 *     `waitForFunction` on a real DOM condition.
 *
 * Usage:
 *   node scripts/repro-followup.mjs --url http://127.0.0.1:19000 --out /tmp/shots
 *
 * License: Public Domain (The Unlicense)
 */
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';

const argv = process.argv.slice(2);
function flag(name, def) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const url = flag('url', 'http://127.0.0.1:19000');
const outDir = flag('out', '/tmp/repro-shots');

async function main() {
  await mkdir(outDir, { recursive: true });
  let browser;
  try {
    console.log(`[repro] launching chromium against ${url}`);
    browser = await chromium.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: ['--js-flags=--max-old-space-size=1024', '--no-sandbox'],
    });
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[page console error]', msg.text());
    });
    page.on('pageerror', (err) => console.log('[page error]', err.message));
    page.on('response', (res) => {
      if (res.status() >= 400) console.log('[http]', res.status(), res.url());
    });

    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('.status-bar', { timeout: 30000 });
    await page.waitForSelector('.player-names', { timeout: 30000 });

    // Dismiss the first-run onboarding wizard if present — its own
    // `.close-btn` (×), which calls `wizard.cancel()` and unmounts the
    // whole 7-step flow in one click (unlike "Skip", which only
    // advances one step at a time).
    const wizardCloseBtn = page.locator('.wizard-card .close-btn');
    if (await wizardCloseBtn.count() > 0) {
      await wizardCloseBtn.click();
      await page.waitForSelector('.wizard-card', { state: 'detached', timeout: 10000 });
    }

    const allNamesCount = await page.locator('.player-names').count();
    console.log('[item1] .player-names element count in DOM =', allNamesCount);
    for (let i = 0; i < allNamesCount; i++) {
      const el = page.locator('.player-names').nth(i);
      const txt = await el.textContent();
      const box = await el.boundingBox();
      console.log(`[item1] .player-names[${i}] text=${JSON.stringify(txt)} box=${JSON.stringify(box)}`);
    }

    // --- Item 1: status-bar player names at ample width ---
    await page.waitForFunction(() => {
      const el = document.querySelector('.player-names');
      return !!el && el.textContent && el.textContent.includes('Black');
    }, { timeout: 15000 });
    const namesText = await page.$eval('.player-names', (el) => el.textContent);
    const namesBox = await page.$eval('.player-names', (el) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    const statusBarBox = await page.$eval('.status-bar', (el) => el.getBoundingClientRect());
    console.log('[item1] .player-names textContent =', JSON.stringify(namesText));
    console.log('[item1] .player-names box =', JSON.stringify(namesBox));
    console.log('[item1] .status-bar width =', statusBarBox.width);
    await page.screenshot({ path: `${outDir}/item1-fresh-board-wide.png` });

    // --- Item 3: handicap stones ---
    // The A_setup LYT leaf (the whole Setup-tool-palette, trigger
    // included) now defaults presenceDefaultVisible:false (Presence arc
    // P2b item 4/5, `useLytPresenceMenu.ts` — `A_setup: false` in
    // `LYT_PRESENCE_DEFAULTS`) and must be toggled on via the "Panels"
    // presence menu before its own internal trigger exists in the DOM.
    const panelsBtn = page.locator('button.lyt-presence-trigger');
    await panelsBtn.click();
    await page.waitForSelector('.lyt-presence-popover', { timeout: 10000 });
    const setupToolsRow = page.locator('[data-lyt-presence-target="A_setup"] input[type="checkbox"]');
    await setupToolsRow.check();
    // Preview Board is also presenceDefaultVisible:false by default —
    // enable it too so item 3's main-vs-preview comparison has a
    // preview panel to compare against.
    const previewBoardRow = page.locator('[data-lyt-presence-target="previewBoard"] input[type="checkbox"]');
    if (await previewBoardRow.count() > 0 && !(await previewBoardRow.isChecked())) {
      await previewBoardRow.check();
    }
    await panelsBtn.click(); // close the popover so it doesn't occlude the toolkit
    await page.waitForSelector('.lyt-presence-popover', { state: 'detached', timeout: 10000 }).catch(() => {});

    // Open the Setup toolkit.
    const setupBtn = page.locator('button.setup-trigger');
    await setupBtn.click();
    await page.waitForSelector('.setup-palette:not(.palette-closed)', { timeout: 10000 });

    const handicapTrigger = page.locator('button.handicap-trigger');
    await handicapTrigger.click();
    await page.waitForSelector('.handicap-panel', { timeout: 10000 });

    // Pick the first available handicap count button (whatever it is).
    const firstHandicapBtn = page.locator('.handicap-btn').first();
    const handicapCountText = await firstHandicapBtn.textContent();
    console.log('[item3] clicking handicap count button:', handicapCountText);
    await firstHandicapBtn.click();

    // Wait for the main board to show at least one stone. BoardWidget
    // renders stones as SVG/canvas — probe both plausible surfaces.
    await page.waitForFunction(() => {
      const svgStones = document.querySelectorAll('.board-widget-container svg circle, .board-widget-container [class*="stone"]');
      return svgStones.length > 0;
    }, { timeout: 15000 }).catch((e) => console.log('[item3] WARNING: no stone-shaped element found on main board within timeout:', e.message));

    await page.screenshot({ path: `${outDir}/item3-after-handicap-fullpage.png` });

    const mainBoardBox = await page.$('.board-widget-container').then((h) => h?.boundingBox());
    if (mainBoardBox) {
      await page.screenshot({ path: `${outDir}/item3-main-board-crop.png`, clip: mainBoardBox });
    } else {
      console.log('[item3] WARNING: .board-widget-container not found for crop');
    }

    const previewBoardHandle = await page.$('.preview-board-panel');
    if (previewBoardHandle) {
      const previewBox = await previewBoardHandle.boundingBox();
      if (previewBox) {
        await page.screenshot({ path: `${outDir}/item3-preview-board-crop.png`, clip: previewBox });
      }
      const previewHtml = await previewBoardHandle.innerHTML();
      console.log('[item3] preview-board-panel innerHTML length =', previewHtml.length);
    } else {
      console.log('[item3] WARNING: .preview-board-panel not found in DOM');
    }

    // --- Item 1, narrow width: symmetric degradation ---
    // Force `.status-bar--narrow` directly (jsdom-style manual trigger
    // is a test-only idiom; here we can just shrink the real viewport
    // and let the real ResizeObserver flip the class for real).
    await page.setViewportSize({ width: 480, height: 900 });
    await page.waitForFunction(() => {
      const el = document.querySelector('.status-bar');
      return !!el && el.classList.contains('status-bar--narrow');
    }, { timeout: 10000 }).catch((e) => console.log('[item1-narrow] WARNING: narrow class never engaged:', e.message));
    const namesBoxNarrow = await page.$eval('.player-names', (el) => el.getBoundingClientRect());
    const blackBoxNarrow = await page.$eval('.player-name--black', (el) => el.getBoundingClientRect());
    const whiteBoxNarrow = await page.$eval('.player-name--white', (el) => el.getBoundingClientRect());
    console.log('[item1-narrow] .player-names box =', JSON.stringify(namesBoxNarrow));
    console.log('[item1-narrow] .player-name--black box =', JSON.stringify(blackBoxNarrow));
    console.log('[item1-narrow] .player-name--white box =', JSON.stringify(whiteBoxNarrow));
    await page.screenshot({ path: `${outDir}/item1-narrow-board.png` });
    await page.setViewportSize({ width: 1920, height: 1080 });

    // --- Item 4: unlimited passing, no end-state message/lock ---
    for (let i = 0; i < 4; i++) {
      await page.locator('button.pass-btn').click();
    }
    const gameEndBadgeCount = await page.locator('.game-end-badge').count();
    const passDisabled = await page.locator('button.pass-btn').isDisabled();
    console.log('[item4] .game-end-badge count after 4 passes =', gameEndBadgeCount);
    console.log('[item4] pass-btn disabled after 4 passes =', passDisabled);
    await page.screenshot({ path: `${outDir}/item4-after-four-passes.png` });

    console.log('[repro] done, screenshots in', outDir);
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((err) => {
  console.error('[repro] FAILED:', err);
  process.exitCode = 1;
});
