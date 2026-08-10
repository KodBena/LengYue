#!/usr/bin/env node
/**
 * research/lyt/mockups/shoot.mjs
 *
 * Commission: lyt-cleanroom-mockups (ledger row 1703), FIX PASS re-shoot
 * (ledger row 1712, `.claude/dispatch-reports/lyt-mockups-opus-review.md`).
 * Captures screenshots of the two generated static mockup pages
 * (`research/lyt/mockups/landscape.html` / `portrait.html`, produced by
 * `research/lyt/emit_mockup.py` -- do not hand-edit those, regenerate
 * instead) AND measures the board's own `.board-square` boundingBox at
 * every one of the design review's own 14 tested viewports, so the
 * B1 (square board) and B2 (board-maximization priority) fixes are
 * verified with real numbers, not eyeballed against a screenshot.
 *
 * Shot families, per the fix-pass commission's own re-screenshot
 * discipline (same as the original, widened to the review's viewport
 * set):
 *   - the MAIN set: presence-menu closed, at every tested viewport for
 *     each class.
 *   - the MENU-OPEN set: one shot at landscape's own primary size.
 *   - the OVERLAY-VERIFICATION set: overlay ON (menu closed), at the
 *     three canned sizes the debug overlay's own OVERLAY_SIZES list
 *     always included (1920x1080 / 2560x1440 landscape, 1080x1920
 *     portrait) -- showing solve-vs-CSS-grid agreement.
 *
 * Every board-bearing screenshot's viewport ALSO gets a `.board-square`
 * boundingBox() measurement (not a visual read) -- written to
 * `shots/measurements.json` -- verifying |w-h| <= 1px at every size.
 *
 * Playwright discipline (durable rows 686/679/702/703, restated from
 * frontend/scripts/lyt-conformance.mjs's own header):
 *   - Run under `systemd-run --user --scope -p MemoryMax=4G` (wrap the
 *     `node` invocation, this script does not self-wrap):
 *       systemd-run --user --scope -p MemoryMax=4G -- \
 *         node --max-old-space-size=1024 research/lyt/mockups/shoot.mjs
 *   - `--js-flags=--max-old-space-size=1024` passed to the launched
 *     Chromium's own args below.
 *   - ONE browser instance, closed in `finally`.
 *   - No `waitForTimeout` / wall-clock sleeps -- every wait is a
 *     `waitForSelector` on real DOM state.
 *   - No scratch port needed (file:// URLs); this script never binds a
 *     server.
 *
 * Usage:
 *   node research/lyt/mockups/shoot.mjs [--out-dir DIR]
 *
 * License: Public Domain (The Unlicense), matching
 * research/lyt/__init__.py's license line and the umbrella's ADR-0006
 * per-file convention.
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
const outDir = flag('out-dir', join(__dirname, 'shots'));

// The review's own "Method" section viewport list, verbatim.
const LANDSCAPE_SIZES = [
  ['1920x1080', 1920, 1080],
  ['2560x1440', 2560, 1440],
  ['1280x1024', 1280, 1024],
  ['3440x1440', 3440, 1440],
  ['1366x768', 1366, 768],
  ['1024x700', 1024, 700],
  ['900x600', 900, 600],
  ['1080x1920', 1080, 1920],
];
const PORTRAIT_SIZES = [
  ['1080x1920', 1080, 1920],
  ['1200x1600', 1200, 1600],
  ['768x1024', 768, 1024],
  ['540x960', 540, 960],
  ['420x880', 420, 880],
  ['1920x1080', 1920, 1080],
];

const OVERLAY_SIZES = new Set(['landscape:1920x1080', 'landscape:2560x1440', 'portrait:1080x1920']);

const TARGETS = [
  ...LANDSCAPE_SIZES.map(([label, w, h]) => ({ file: 'landscape.html', class: 'landscape', label, w, h })),
  ...PORTRAIT_SIZES.map(([label, w, h]) => ({ file: 'portrait.html', class: 'portrait', label, w, h })),
];

async function openMenu(page) {
  await page.click('#lyt-menu-btn');
  await page.waitForSelector('#lyt-menu-popover', { state: 'visible', timeout: 5_000 });
}

// The `hidden` HTML attribute renders as `display:none`, which
// Playwright's own visibility model reports as element state 'hidden' --
// waiting on an attribute selector (`[hidden]`) with the default
// 'visible' state is self-contradictory (a hidden element can never
// become "visible"), which is what an earlier draft of this script timed
// out on. `state: 'hidden'` on the plain selector is the fix.
async function closeMenu(page) {
  await page.click('#lyt-menu-btn');
  await page.waitForSelector('#lyt-menu-popover', { state: 'hidden', timeout: 5_000 });
}

async function newPageAt(browser, { file, w, h }) {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  const url = pathToFileURL(join(__dirname, file)).href;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('#lyt-root', { timeout: 10_000 });
  return { context, page };
}

async function measureBoard(page) {
  const box = await page.locator('.board-square').first().boundingBox();
  if (!box) return null;
  return { x: box.x, y: box.y, w: box.width, h: box.height, deltaWH: Math.abs(box.width - box.height) };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  let browser = null;
  const written = [];
  const measurements = [];
  try {
    console.log('[shoot] launching chromium (headless)…');
    browser = await chromium.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: ['--js-flags=--max-old-space-size=1024'],
    });

    for (const target of TARGETS) {
      // eslint-disable-next-line no-await-in-loop -- sequential viewport sizes, not parallelizable against one browser instance
      const { context, page } = await newPageAt(browser, target);
      const base = target.file.replace('.html', '');
      const closedPath = join(outDir, `${base}-${target.label}.png`);
      // eslint-disable-next-line no-await-in-loop
      await page.screenshot({ path: closedPath });
      written.push(closedPath);

      // eslint-disable-next-line no-await-in-loop
      const board = await measureBoard(page);
      measurements.push({ class: target.class, label: target.label, w: target.w, h: target.h, board });
      console.log(`[shoot] ${target.class} ${target.label} board=${board ? `${board.w}x${board.h} (Δ=${board.deltaWH.toFixed(1)})` : 'MISSING'}`);

      const key = `${target.class}:${target.label}`;
      if (OVERLAY_SIZES.has(key)) {
        // eslint-disable-next-line no-await-in-loop
        await openMenu(page);
        // eslint-disable-next-line no-await-in-loop
        await page.check('#lyt-overlay-toggle');
        // eslint-disable-next-line no-await-in-loop
        await page.waitForSelector('.lyt-overlay-rect', { timeout: 5_000 });
        // eslint-disable-next-line no-await-in-loop
        await closeMenu(page);
        const overlayPath = join(outDir, `${base}-${target.label}-overlay.png`);
        // eslint-disable-next-line no-await-in-loop
        await page.screenshot({ path: overlayPath });
        written.push(overlayPath);
        console.log(`[shoot] wrote ${overlayPath}`);

        // boundingBox() diff for the 'B' overlay rect vs the live board.
        // eslint-disable-next-line no-await-in-loop
        const overlayBoxes = await page.$$eval('.lyt-overlay-rect', (nodes) =>
          nodes.map((n) => {
            const tag = n.querySelector('.lyt-overlay-tag');
            const r = n.getBoundingClientRect();
            return { widget: tag ? tag.textContent : null, x: r.x, y: r.y, w: r.width, h: r.height };
          })
        );
        const bRect = overlayBoxes.find((r) => r.widget === 'B');
        if (bRect && board) {
          const delta = { dx: bRect.x - board.x, dy: bRect.y - board.y, dw: bRect.w - board.w, dh: bRect.h - board.h };
          measurements[measurements.length - 1].overlayB = bRect;
          measurements[measurements.length - 1].overlayDelta = delta;
          console.log(`[shoot]   overlay B vs live: dx=${delta.dx.toFixed(1)} dy=${delta.dy.toFixed(1)} dw=${delta.dw.toFixed(1)} dh=${delta.dh.toFixed(1)}`);
        }
      }

      // eslint-disable-next-line no-await-in-loop
      await context.close();

      if (target.class === 'landscape' && target.label === '1920x1080') {
        // A FRESH page (not the one possibly left with the overlay
        // checkbox still on from the OVERLAY_SIZES branch above) --
        // this shot is meant to show the plain presence menu, not a
        // menu-plus-overlay composite.
        // eslint-disable-next-line no-await-in-loop
        const fresh = await newPageAt(browser, target);
        // eslint-disable-next-line no-await-in-loop
        await openMenu(fresh.page);
        const openPath = join(outDir, `${base}-${target.label}-menu-open.png`);
        // eslint-disable-next-line no-await-in-loop
        await fresh.page.screenshot({ path: openPath });
        written.push(openPath);
        // eslint-disable-next-line no-await-in-loop
        await fresh.context.close();
      }
    }
  } finally {
    if (browser) await browser.close();
  }

  await writeFile(join(outDir, 'measurements.json'), JSON.stringify(measurements, null, 2));
  console.log(`[shoot] done -- ${written.length} screenshots + measurements.json in ${outDir}`);
}

main().catch((err) => {
  console.error('[shoot] FAILED:', err);
  process.exit(1);
});
