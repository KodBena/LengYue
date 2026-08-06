#!/usr/bin/env node
/**
 * Screenshot pair for the ui-fix-4b deliverable: the fixed close button,
 * hovered, at the maintainer's real geometry (4k/96dpi viewport, cluster
 * light/pink theme, ~10 boards, an active mid-list tab mirroring
 * close_unresolved.png's "Board 5").
 *
 * Run from `frontend/`: `node ../.claude/dispatch-reports/shot-close-btn.mjs`.
 * playwright-core is resolved relative to CWD (not this file's own path) --
 * it is a frontend devDependency, not a dependency of this reports directory.
 */
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const { chromium } = await import(pathToFileURL(join(process.cwd(), 'node_modules/playwright-core/index.mjs')).href);

const url = process.argv[2] || 'http://127.0.0.1:4601';
const outPrefix = process.argv[3];

async function main() {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  const page = await browser.newPage({ viewport: { width: 3840, height: 2160 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'cluster'));

  const addBtn = page.locator('.tab-add-btn');
  for (let i = 0; i < 9; i++) await addBtn.click();
  await page.waitForTimeout(300);

  const tabs = page.locator('.thumb-container');
  const targetIndex = 4; // mirrors "Board 5" in close_unresolved.png
  await tabs.nth(targetIndex).click(); // make it active
  await page.waitForTimeout(150);
  await tabs.nth(targetIndex).hover();
  await page.waitForTimeout(200);

  // Wide sidebar crop (context, matches close_unresolved.png's framing)
  await page.locator('#sidebar-widget').screenshot({ path: `${outPrefix}-sidebar-context.png` });

  // Tight crop directly on the close button (matches the zoomed crops used
  // in diagnosis)
  const btnBox = await tabs.nth(targetIndex).locator('.close-board-btn').boundingBox();
  await page.screenshot({
    path: `${outPrefix}-button-zoom.png`,
    clip: { x: btnBox.x - 30, y: btnBox.y - 30, width: btnBox.width + 60, height: btnBox.height + 60 },
  });

  await browser.close();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
