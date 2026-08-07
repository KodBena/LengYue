#!/usr/bin/env node
/**
 * .claude/dispatch-reports/ui-fix-56-probe.mjs
 *
 * Live rect-probe for ui-fix-56 (Defects 5 + 6 of
 * .claude/dispatch-reports/ui-defects-investigation.md — the frozen
 * resizer past board-saturation, and the dead space left when the
 * control panel is disabled). Mirrors the investigation's own
 * WITNESSED measurement method (synthetic mouse drag + bounding-rect
 * comparison against a real Chromium via playwright-core) so the same
 * probe can be re-run once a build carrying this fix is served.
 *
 * STATUS: WITNESSED at fix-authoring time. The investigation's own
 * caveat (port 4173 on this host serves a stale *pre-fix* preview
 * build) does NOT apply to this run: `frontend/dist` was rebuilt
 * from the fixed source (`npm run build`) and served fresh via
 * `npx vite preview --port 4599`, and this script was run against
 * that port with `--executable /usr/bin/chromium` (the system
 * Chromium — no `playwright install`-managed browser is present on
 * this host; playwright-core's bundled headless-shell binary is
 * absent, see `--executable`'s doc below). Result: all three checks
 * PASS. Re-run against a different build the same way — this script
 * doesn't assume anything about the currently-running dev server on
 * port 5173/4173, only about whatever `--url` points at.
 *
 * Usage:
 *   node .claude/dispatch-reports/ui-fix-56-probe.mjs [--url URL] \
 *        [--executable PATH]
 *   (must be invoked with a CWD that resolves `playwright-core` —
 *   i.e. from inside frontend/, or with this file copied there —
 *   since the package lives in frontend/node_modules and this
 *   script's own directory, .claude/dispatch-reports/, has none.)
 *
 * Exits non-zero (and prints which assertion failed) if any check
 * doesn't hold — so this doubles as a pass/fail gate, not just a
 * measurement dump.
 *
 * License: Public Domain (The Unlicense)
 */
import { chromium } from 'playwright-core';

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
const url = flag('url', 'http://127.0.0.1:4173');
// playwright-core's own bundled headless-shell binary was absent on
// this host at authoring time (`npx playwright install` not run);
// the system Chromium at /usr/bin/chromium is what this was actually
// witnessed against. Override if your host's layout differs, or
// leave undefined to use whatever playwright-core resolves by
// default.
const executablePath = flag('executable', undefined);

function rectOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height };
  }, selector);
}

async function dragResizerTo(page, targetX) {
  const resizer = await rectOf(page, '.panel-resizer');
  if (!resizer) throw new Error('.panel-resizer not found (is #split-workspace controlsExpanded?)');
  const startX = resizer.left + resizer.width / 2;
  const startY = resizer.top + resizer.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(targetX, startY, { steps: 20 });
  await page.mouse.up();
}

let failures = 0;
function assertCheck(name, cond, detail) {
  if (cond) {
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`);
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 3840, height: 2160 } });
  await page.goto(url, { waitUntil: 'networkidle' });

  // ── Defect 6: disabling the control panel recenters #board-column ──
  const before = await rectOf(page, '#board-column');
  const controlsToggle = page.locator('button[title]', { hasText: '⚙️' });
  if ((await controlsToggle.count()) === 0) {
    console.log('SKIP  Defect 6 probe — controls-toggle button not found (selector drift?)');
  } else {
    await controlsToggle.first().click();
    await page.waitForTimeout(50); // let the v-show + reflow settle
    const after = await rectOf(page, '#board-column');
    assertCheck(
      'Defect 6: #board-column.left shifts rightward once controlsExpanded flips false',
      before && after && after.left > before.left,
      `before.left=${before?.left} after.left=${after?.left}`,
    );
    // restore state for the next probe
    await controlsToggle.first().click();
    await page.waitForTimeout(50);
  }

  // ── Defect 5: dragging the resizer past board-saturation still moves it ──
  const resizerBefore = await rectOf(page, '.panel-resizer');
  const controlPanelBefore = await rectOf(page, '#control-panel');
  await dragResizerTo(page, 3800);
  await page.waitForTimeout(50);
  const resizerAfter = await rectOf(page, '.panel-resizer');
  const controlPanelAfter = await rectOf(page, '#control-panel');
  assertCheck(
    'Defect 5: resizer bar right-edge moves after a past-saturation drag (previously frozen)',
    resizerBefore && resizerAfter && resizerAfter.right !== resizerBefore.right,
    `before.right=${resizerBefore?.right} after.right=${resizerAfter?.right}`,
  );
  assertCheck(
    'Defect 5: #control-panel width shrinks after a past-saturation drag',
    controlPanelBefore && controlPanelAfter && controlPanelAfter.width < controlPanelBefore.width,
    `before.width=${controlPanelBefore?.width} after.width=${controlPanelAfter?.width}`,
  );

  await browser.close();

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('probe crashed:', err);
  process.exit(2);
});
