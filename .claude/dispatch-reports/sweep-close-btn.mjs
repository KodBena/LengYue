#!/usr/bin/env node
/**
 * Full-sweep validation for the ui-fix-4b close-button clip fix.
 * Checks EVERY tab's close-button rect against EVERY ancestor's clip box
 * (any ancestor with overflow != visible on either axis) across a spread
 * of scroll positions, at a given board count and theme.
 *
 * Run from `frontend/`: `node ../.claude/dispatch-reports/sweep-close-btn.mjs`.
 * playwright-core is resolved relative to CWD (not this file's own path) --
 * it is a frontend devDependency, not a dependency of this reports directory.
 */
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const { chromium } = await import(pathToFileURL(join(process.cwd(), 'node_modules/playwright-core/index.mjs')).href);

const url = process.argv[2] || 'http://127.0.0.1:4601';
const boardCount = Number(process.argv[3] || 10);
const theme = process.argv[4] || 'cluster';

async function main() {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  const page = await browser.newPage({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);

  const addBtn = page.locator('.tab-add-btn');
  for (let i = 0; i < boardCount - 1; i++) await addBtn.click();
  await page.waitForTimeout(300);

  const listHandle = page.locator('.thumb-list');
  const { scrollHeight, clientHeight } = await listHandle.evaluate((el) => ({
    scrollHeight: el.scrollHeight, clientHeight: el.clientHeight,
  }));
  const maxScroll = Math.max(0, scrollHeight - clientHeight);
  const tabHeight = await page.evaluate(() => {
    const el = document.querySelector('.thumb-container');
    return el ? el.getBoundingClientRect().height : 52;
  });

  const scrollTargets = new Set([0, maxScroll]);
  for (let t = 0; t <= maxScroll; t += Math.max(1, tabHeight)) scrollTargets.add(Math.round(t));
  for (let frac = 0.1; frac < 1; frac += 0.15) scrollTargets.add(Math.round(maxScroll * frac));

  let totalChecks = 0;
  const failures = [];

  for (const scrollTop of [...scrollTargets].sort((a, b) => a - b)) {
    await listHandle.evaluate((el, t) => { el.scrollTop = t; }, scrollTop);
    await page.waitForTimeout(60);

    // Hover each currently-rendered tab in turn (opacity gate needs :hover)
    // and measure its close button against every clipping ancestor.
    const tabCount = await page.locator('.thumb-container').count();
    for (let i = 0; i < tabCount; i++) {
      const tab = page.locator('.thumb-container').nth(i);
      const visible = await tab.evaluate((el, listSel) => {
        const list = document.querySelector(listSel);
        const lr = list.getBoundingClientRect();
        const tr = el.getBoundingClientRect();
        return tr.bottom > lr.top && tr.top < lr.bottom;
      }, '.thumb-list');
      if (!visible) continue;

      await tab.hover();
      const result = await tab.evaluate((el) => {
        const btn = el.querySelector('.close-board-btn');
        const btnRect = btn.getBoundingClientRect();
        const chain = [];
        let anc = btn.parentElement;
        while (anc && anc.nodeType === 1) {
          const cs = getComputedStyle(anc);
          if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') {
            chain.push({ cls: anc.className || anc.tagName, rect: anc.getBoundingClientRect() });
          }
          anc = anc.parentElement;
        }
        return {
          btn: { top: btnRect.top, right: btnRect.right, bottom: btnRect.bottom, left: btnRect.left },
          chain: chain.map(c => ({
            cls: c.cls,
            rect: { top: c.rect.top, right: c.rect.right, bottom: c.rect.bottom, left: c.rect.left },
          })),
        };
      });

      totalChecks++;
      for (const anc of result.chain) {
        const clippedTop = result.btn.top < anc.rect.top - 0.5;
        const clippedRight = result.btn.right > anc.rect.right + 0.5;
        const clippedBottom = result.btn.bottom > anc.rect.bottom + 0.5;
        const clippedLeft = result.btn.left < anc.rect.left - 0.5;
        if (clippedTop || clippedRight || clippedBottom || clippedLeft) {
          failures.push({ scrollTop, tabIndex: i, ancestor: anc.cls, clippedTop, clippedRight, clippedBottom, clippedLeft });
        }
      }
    }
  }

  console.log(`boards=${boardCount} theme=${theme} scrollPositions=${scrollTargets.size} checks=${totalChecks}`);
  if (failures.length > 0) {
    console.log(`FAIL: ${failures.length} clip(s) found:`);
    for (const f of failures) console.log('  ', JSON.stringify(f));
    process.exitCode = 1;
  } else {
    console.log(`PASS: 0 clips across all ${totalChecks} tab/scroll-position checks, all edges, all ancestors.`);
  }

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(2); });
