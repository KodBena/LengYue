#!/usr/bin/env node
/**
 * Measures the tab-strip close-button clip at the maintainer's real
 * geometry: 3840x2160 viewport (4k/96dpi -> deviceScaleFactor 1), the
 * "cluster" (light/pink) theme, ~10 boards. Walks the FULL ancestor
 * chain's overflow/clip/mask/border-radius/transform, and measures all
 * FOUR edges of the close button's rect against every ancestor's rect.
 *
 * Run from `frontend/`: `node ../.claude/dispatch-reports/measure-close-btn.mjs`.
 * playwright-core is resolved relative to CWD (not this file's own path) --
 * it is a frontend devDependency, not a dependency of this reports directory.
 */
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const { chromium } = await import(pathToFileURL(join(process.cwd(), 'node_modules/playwright-core/index.mjs')).href);

const url = process.argv[2] || 'http://127.0.0.1:4601';
const boardCount = Number(process.argv[3] || 10);
const shotPrefix = process.argv[4] || null;

async function main() {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  const page = await browser.newPage({
    viewport: { width: 3840, height: 2160 },
    deviceScaleFactor: 1,
  });

  await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });

  // Force the "cluster" (light/pink) theme for a pure visual probe --
  // does not touch persisted profile settings (same pattern the
  // ui-defects-investigation.md report used for forcing dark theme).
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'cluster');
  });

  const addBtn = page.locator('.tab-add-btn');
  for (let i = 0; i < boardCount - 1; i++) { // one board exists by default
    await addBtn.click();
  }
  await page.waitForTimeout(300);

  // Activate a mid-list tab (mirrors "Board 5" in the maintainer's screenshot).
  const tabs = page.locator('.thumb-container');
  const count = await tabs.count();
  const targetIndex = Math.min(4, count - 1);
  await tabs.nth(targetIndex).click();
  await page.waitForTimeout(150);

  // Hover to reveal the close button (opacity:0 -> 1 on .tab-thumb:hover).
  await tabs.nth(targetIndex).hover();
  await page.waitForTimeout(150);

  const report = await page.evaluate((idx) => {
    const tab = document.querySelectorAll('.thumb-container')[idx];
    const btn = tab.querySelector('.close-board-btn');
    const btnRect = btn.getBoundingClientRect();

    function describe(el) {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return {
        tag: el.tagName,
        cls: el.className,
        rect: { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height },
        overflow: cs.overflow,
        overflowX: cs.overflowX,
        overflowY: cs.overflowY,
        clipPath: cs.clipPath,
        clip: cs.clip,
        mask: cs.mask && cs.mask !== 'none' ? cs.mask : undefined,
        borderRadius: cs.borderRadius,
        transform: cs.transform,
        position: cs.position,
        contain: cs.contain,
        isolation: cs.isolation,
      };
    }

    const chain = [];
    let el = btn;
    while (el && el.nodeType === 1) {
      chain.push(describe(el));
      el = el.parentElement;
    }

    const btnCS = getComputedStyle(btn);
    return {
      btnRect: { top: btnRect.top, right: btnRect.right, bottom: btnRect.bottom, left: btnRect.left, width: btnRect.width, height: btnRect.height },
      btnBorderRadius: btnCS.borderRadius,
      btnOverflow: btnCS.overflow,
      chain,
    };
  }, targetIndex);

  console.log(JSON.stringify(report, null, 2));

  if (shotPrefix) {
    const tab = tabs.nth(targetIndex);
    const box = await tab.boundingBox();
    await page.screenshot({
      path: `${shotPrefix}-full.png`,
      clip: { x: Math.max(0, box.x - 40), y: Math.max(0, box.y - 40), width: box.width + 120, height: box.height + 80 },
    });
  }

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
