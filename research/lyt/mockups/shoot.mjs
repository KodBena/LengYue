#!/usr/bin/env node
/**
 * research/lyt/mockups/shoot.mjs
 *
 * Commission: lyt-cleanroom-mockups (ledger row 1703). Captures
 * screenshots of the two generated static mockup pages
 * (`research/lyt/mockups/landscape.html` / `portrait.html`, produced by
 * `research/lyt/emit_mockup.py` -- do not hand-edit those, regenerate
 * instead) at the commission's representative sizes. Two shot families,
 * per the commission's own text:
 *   - the MAIN set: presence-menu closed and open, overlay OFF, at all
 *     three representative sizes (1920x1080 / 2560x1440 landscape,
 *     1080x1920 portrait) -- "presence-menu both closed and open".
 *   - the VERIFICATION set: one overlay-ON shot per class (menu closed,
 *     so the popover doesn't cover any outline), showing solve-vs-CSS-
 *     grid agreement -- the second brief amendment's own requirement.
 *
 * Pages are self-contained (all CSS/JS inline, no external requests) --
 * loaded via `file://` URLs, per the Playwright discipline's own "or
 * file:// URLs if sufficient" allowance. No dev server, no scratch port.
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
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
const outDir = flag('out-dir', join(__dirname, 'shots'));

// One page per class, at its own representative sizes -- landscape gets
// both wide sizes (1920x1080, 2560x1440) since both nearest-neighbor to
// the 'landscape' class (runner.py's own log-aspect metric); portrait
// gets its one representative size (1080x1920). The first size listed
// per class is also the one the VERIFICATION (overlay-ON) shot uses,
// matching a size actually present in `emit_mockup.OVERLAY_SIZES` (no
// "no solve for this size" fallback text in any committed screenshot).
const TARGETS = [
  { file: 'landscape.html', label: '1920x1080', w: 1920, h: 1080, overlayShot: true },
  { file: 'landscape.html', label: '2560x1440', w: 2560, h: 1440, overlayShot: false },
  { file: 'portrait.html', label: '1080x1920', w: 1080, h: 1920, overlayShot: true },
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

async function shootClosed(browser, target) {
  const { context, page } = await newPageAt(browser, target);
  const base = target.file.replace('.html', '');
  const outPath = join(outDir, `${base}-${target.label}-menu-closed.png`);
  await page.screenshot({ path: outPath });
  await context.close();
  return outPath;
}

async function shootOpen(browser, target) {
  const { context, page } = await newPageAt(browser, target);
  // Real user action, not a synthetic style poke -- exercises the actual
  // click handler this mockup ships, the same affordance a human tester
  // would use.
  await openMenu(page);
  const base = target.file.replace('.html', '');
  const outPath = join(outDir, `${base}-${target.label}-menu-open.png`);
  await page.screenshot({ path: outPath });
  await context.close();
  return outPath;
}

async function shootOverlay(browser, target) {
  const { context, page } = await newPageAt(browser, target);
  await openMenu(page);
  await page.check('#lyt-overlay-toggle');
  await page.waitForSelector('.lyt-overlay-rect', { timeout: 5_000 });
  // Close the popover so it doesn't cover any outline in the shot's own
  // corner -- the overlay itself (drawn on #lyt-overlay-layer) persists
  // after the popover closes, since drawOverlay() already ran.
  await closeMenu(page);
  const base = target.file.replace('.html', '');
  const outPath = join(outDir, `${base}-${target.label}-overlay-verification.png`);
  await page.screenshot({ path: outPath });
  await context.close();
  return outPath;
}

async function main() {
  await mkdir(outDir, { recursive: true });
  let browser = null;
  const written = [];
  try {
    console.log('[shoot] launching chromium (headless)…');
    browser = await chromium.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: ['--js-flags=--max-old-space-size=1024'],
    });

    for (const target of TARGETS) {
      // eslint-disable-next-line no-await-in-loop -- sequential viewport sizes, not parallelizable against one browser instance
      const closedPath = await shootClosed(browser, target);
      written.push(closedPath);
      console.log(`[shoot] wrote ${closedPath}`);
      // eslint-disable-next-line no-await-in-loop
      const openPath = await shootOpen(browser, target);
      written.push(openPath);
      console.log(`[shoot] wrote ${openPath}`);
      if (target.overlayShot) {
        // eslint-disable-next-line no-await-in-loop
        const overlayPath = await shootOverlay(browser, target);
        written.push(overlayPath);
        console.log(`[shoot] wrote ${overlayPath}`);
      }
    }
  } finally {
    if (browser) await browser.close();
  }
  console.log(`[shoot] done -- ${written.length} screenshots in ${outDir}`);
}

main().catch((err) => {
  console.error('[shoot] FAILED:', err);
  process.exit(1);
});
