#!/usr/bin/env node
/**
 * .claude/dispatch-reports/lyt-w4-fix-floor-sweep-probe.mjs
 *
 * W4 fix pass (clearing `.claude/dispatch-reports/lyt-w4-chrome-review.md`
 * item 6, the side-column floor defect). Reproduces the review's own
 * measured width-sweep methodology against a real running dev app, at the
 * CORRECTED floor (345px, was 280px), to verify BOTH directions the fix
 * commission required:
 *
 *   (a) no clipping of the side column's deepest children (including
 *       `SetupToolPalette.vue`'s permanently-reserved `.setup-toolkit`)
 *       at any forced width down to the new 345px floor.
 *   (b) informational: continues the sweep a little below 345px too, so
 *       the report can show the corrected floor sits inside the
 *       clip-free region with the intended ~10px margin over the
 *       measured 335px true floor, not just AT the edge.
 *
 * Same probe-isolation posture as `lyt-w4-chrome-probe.mjs`: dev server
 * pointed at DEAD scratch ports, every network request instrumented,
 * FAIL if any forbidden port is ever contacted.
 *
 * Methodology (matches the review's own, so the numbers are directly
 * comparable): find `.lyt-toolbar-strip`, walk up to its closest
 * `.lyt-node` ancestor (the side column's own grid-track element), force
 * that element's `width`/`max-width` via inline style at each width in
 * the sweep, then walk every descendant for the widest right-edge
 * overflow past the container's own right edge -- via `getBoundingClientRect`
 * comparison, not the outer element's own `scrollWidth - clientWidth`.
 *
 * IMPORTANT, discovered while building this probe: the outer `.lyt-node`'s
 * own `scrollWidth - clientWidth` is NOT a usable proxy for this
 * specific item's overflow -- `.lyt-toolbar-strip` itself declares
 * `overflow-y: auto`, which per spec computes `overflow-x` to `auto` too
 * (an explicit `visible` on one axis is not honored when the other axis
 * is not `visible`), so it becomes its OWN scroll container and does
 * NOT propagate its content's overflow up into the side column's
 * `scrollWidth`. What DOES leak into the side column's own `scrollWidth`
 * is the SIBLING row below the toolbar strip (the tree/T-node/
 * previewBoard `H(...)`, an entirely different, out-of-scope concern the
 * review itself explicitly declined to re-sweep). A first draft of this
 * probe used the outer `scrollWidth` delta and got numbers that didn't
 * match the review's own table at all (49px "overflow" at 345px, 64px at
 * 330px) -- direct DOM inspection traced it to that sibling row, not
 * `.setup-toolkit`. Measuring `.setup-toolkit`'s own `getBoundingClientRect()`
 * against the forced container's right edge directly (this version)
 * reproduces the review's own numbers almost exactly (0px at 335px,
 * ~2px at 330px), confirming the technique now matches theirs.
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

const FORBIDDEN_PORTS = ['8764', '1235', '1242', '4173', '5173', '5174'];
const contactedForbiddenPorts = new Set();

// Descending sweep: a superset of the review's own table, extended down
// through the corrected 345px floor so the margin over the measured
// 335px true floor is directly visible in the output.
const WIDTHS = [820, 400, 350, 346, 345, 344, 340, 335, 330, 325, 320, 300, 280, 260];

async function main() {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

    page.on('request', (req) => {
      const u = req.url();
      for (const port of FORBIDDEN_PORTS) {
        if (u.includes(`127.0.0.1:${port}`) || u.includes(`localhost:${port}`)) {
          contactedForbiddenPorts.add(`${port} <- ${u}`);
        }
      }
    });

    await page.goto(url, { waitUntil: 'load' });
    await page.waitForSelector('#split-workspace', { timeout: 20000 });
    await page.waitForFunction(() => {
      const el = document.getElementById('split-workspace');
      return el && el.getBoundingClientRect().width > 0;
    }, { timeout: 20000 });

    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    const hasToolbar = await page.$('.lyt-toolbar-strip');
    assertCheck('toolbar strip present', hasToolbar !== null);

    console.log('\n| width | overflowPx | firstClipped |');
    console.log('|---|---|---|');

    for (const w of WIDTHS) {
      // Allow any ResizeObserver/Vue-reactive width-dependent JS (e.g.
      // SetupToolPalette's own reflow logic) to settle between forced
      // widths before measuring -- a synchronous style write followed
      // immediately by a synchronous measurement can race JS-driven
      // adjustments that land on a later frame.
      await page.waitForTimeout(60);
      const result = await page.evaluate((forcedWidth) => {
        const strip = document.querySelector('.lyt-toolbar-strip');
        if (!strip) return { error: 'no .lyt-toolbar-strip' };
        const sideCol = strip.closest('.lyt-node');
        if (!sideCol) return { error: 'no .lyt-node ancestor found' };
        sideCol.style.setProperty('width', forcedWidth + 'px', 'important');
        sideCol.style.setProperty('max-width', forcedWidth + 'px', 'important');
        sideCol.style.setProperty('flex-shrink', '0', 'important');
        // force reflow
        void sideCol.offsetWidth;
        const containerRight = sideCol.getBoundingClientRect().right;
        // Walk every descendant OF THE TOOLBAR STRIP specifically (the
        // side column's other row -- the tree/T-node/previewBoard
        // H(...) -- is a different, out-of-scope concern; see the
        // module docstring), tracking the WIDEST right-edge overflow
        // past the forced container's own right edge, not just the
        // first one found in DOM order (so a shallow ancestor box that
        // happens to sit exactly at the edge doesn't mask a deeper,
        // more-overflowing descendant).
        let worst = { overflow: 0, el: null };
        const walk = (el) => {
          const r = el.getBoundingClientRect();
          if (r.width > 0) {
            const over = r.right - containerRight;
            if (over > worst.overflow) {
              worst = { overflow: over, el };
            }
          }
          for (const child of el.children) walk(child);
        };
        walk(strip);
        const firstClipped = worst.el
          ? (worst.el.className && typeof worst.el.className === 'string' ? worst.el.className : worst.el.tagName)
          : null;
        return { overflow: Math.round(worst.overflow * 100) / 100, firstClipped };
      }, w);
      console.log(`| ${w}px | ${result.overflow ?? 'ERR'}px | ${result.firstClipped ?? (result.error ?? 'none')} |`);
      assertCheck(
        `width=${w}px: no overflow/clip below or at the corrected 345px floor is expected clip-free`,
        w < 345 ? true /* informational rows below the floor, not asserted */ : (result.overflow ?? 1) <= 0.5,
        JSON.stringify(result),
      );
    }

    // Reset the forced style so nothing lingers for later assertions.
    await page.evaluate(() => {
      const strip = document.querySelector('.lyt-toolbar-strip');
      const sideCol = strip && strip.closest('.lyt-node');
      if (sideCol) {
        sideCol.style.removeProperty('width');
        sideCol.style.removeProperty('max-width');
        sideCol.style.removeProperty('flex-shrink');
      }
    });

    assertCheck(
      'PROBE ISOLATION: no request ever targeted a live/dead-but-forbidden port',
      contactedForbiddenPorts.size === 0,
      `contacted: ${JSON.stringify([...contactedForbiddenPorts])}`,
    );

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
