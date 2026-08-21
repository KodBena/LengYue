#!/usr/bin/env node
/**
 * frontend/scripts/tree-scrollbar-repro.mjs
 *
 * Ad-hoc live-repro script, addendum item 3 (game-tree column horizontal
 * scrollbar at default layout, commissioner shot ~/xs/9440_scrollbar.png).
 * NOT wired into CI or any npm script. Mirrors `repro-followup.mjs`'s
 * launch/cleanup skeleton and playwright discipline:
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
 *   node scripts/tree-scrollbar-repro.mjs --url http://127.0.0.1:19031 --out /tmp/shots
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
const url = flag('url', 'http://127.0.0.1:19031');
const outDir = flag('out', '/tmp/repro-shots');

// A small SGF with a plain mainline (no variations) long enough to force
// the tree past a handful of rows — mirrors the commissioner's own
// screenshot, which shows a SINGLE-COLUMN chain (no branch toggle) still
// producing a horizontal scrollbar, so overflow is not gated on branch
// count.
const SGF = '(;GM[1]FF[4]SZ[19]KM[7.5]RU[Chinese]' +
  Array.from({ length: 40 }, (_, i) => {
    const col = 'abcdefghjklmnopqrs'[i % 18];
    const row = 'abcdefghjklmnopqrs'[(i * 3) % 18];
    const color = i % 2 === 0 ? 'B' : 'W';
    return `;${color}[${col}${row}]`;
  }).join('') +
  ')';

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

    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('.status-bar', { timeout: 30000 });

    // Dismiss the first-run onboarding wizard if present.
    const wizardCloseBtn = page.locator('.wizard-card .close-btn');
    if (await wizardCloseBtn.count() > 0) {
      await wizardCloseBtn.click();
      await page.waitForSelector('.wizard-card', { state: 'detached', timeout: 10000 });
    }

    await page.waitForSelector('.tree-widget-outer', { timeout: 15000 });

    // --- Baseline: fresh (empty) board's tree geometry ---
    const baseline = await page.$eval('.tree-widget-outer', (el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      offsetWidth: el.offsetWidth,
    }));
    console.log('[baseline] .tree-widget-outer =', JSON.stringify(baseline));

    // The BASELINE probe above already found scrollWidth > clientWidth on
    // a completely fresh, single-node board — so the SGF-load step (kept
    // below, commented, for a follow-up many-move probe) is not needed to
    // reproduce the defect at all. Proceed straight to the full geometry
    // probe against the fresh board's tree.
    void SGF;

    await page.screenshot({ path: `${outDir}/tree-scrollbar-before.png` });

    // --- Full geometry probe: which element overflows, and by how much ---
    const geometry = await page.evaluate(() => {
      function boxOf(el) {
        if (!el) return null;
        const cs = getComputedStyle(el);
        return {
          tag: el.tagName,
          className: el.className,
          scrollWidth: el.scrollWidth,
          clientWidth: el.clientWidth,
          offsetWidth: el.offsetWidth,
          overflowX: cs.overflowX,
          scrollbarGutter: cs.scrollbarGutter,
          boxSizing: cs.boxSizing,
          paddingLeft: cs.paddingLeft,
          paddingRight: cs.paddingRight,
          borderLeft: cs.borderLeftWidth,
          borderRight: cs.borderRightWidth,
        };
      }
      const outer = document.querySelector('.tree-widget-outer');
      const wrapper = document.querySelector('.tree-widget-wrapper');
      const svg = document.querySelector('.tree-svg');
      const svgAttrWidth = svg ? svg.getAttribute('width') : null;
      const svgRect = svg ? svg.getBoundingClientRect() : null;
      // Walk ancestors from .tree-widget-outer up to #tree-control-wrapper
      // (App.vue's own named grid area) to find who first constrains width.
      const ancestors = [];
      let cur = outer;
      let depth = 0;
      while (cur && depth < 8) {
        ancestors.push(boxOf(cur));
        cur = cur.parentElement;
        depth++;
      }
      return {
        outer: boxOf(outer),
        wrapper: boxOf(wrapper),
        svgAttrWidth,
        svgRectWidth: svgRect ? svgRect.width : null,
        ancestors,
      };
    });
    console.log('[geometry]', JSON.stringify(geometry, null, 2));

    // Does a real horizontal scrollbar actually render? (scrollWidth >
    // clientWidth is the authoritative signal — a rendered scrollbar
    // thumb is a rendering detail on top of that.)
    const overflowsX = geometry.outer.scrollWidth > geometry.outer.clientWidth;
    console.log('[verdict] .tree-widget-outer overflows on X:', overflowsX,
      `(scrollWidth=${geometry.outer.scrollWidth} clientWidth=${geometry.outer.clientWidth}, over by ${geometry.outer.scrollWidth - geometry.outer.clientWidth}px)`);

    console.log('[repro] done, screenshots in', outDir);
  } finally {
    if (browser) await browser.close();
  }
}

main().catch((err) => {
  console.error('[repro] FAILED:', err);
  process.exitCode = 1;
});
