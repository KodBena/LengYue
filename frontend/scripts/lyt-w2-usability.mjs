#!/usr/bin/env node
/**
 * frontend/scripts/lyt-w2-usability.mjs
 *
 * W2 commission (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
 * §8 W2 item 5, "verify by playwright flow"): drives the BUILT SPA
 * through the corner presence menu's actual usability flow — open the
 * menu, toggle each panel, verify the rail's both styles, verify the
 * preview board renders — and reports WITNESSED pass/fail per assertion.
 * Not wired into CI or any npm script; invoked by hand, mirroring
 * `lyt-conformance.mjs`'s own operational shape (read that script's
 * header in full before authoring this one — the serve/launch/cleanup
 * skeleton below is a direct port of its `main()`).
 *
 * Playwright discipline (same as `lyt-conformance.mjs`):
 *   - Wrap the `node` invocation itself in `systemd-run --user --scope
 *     -p MemoryMax=4G`; this script does not self-wrap.
 *   - `--js-flags=--max-old-space-size=1024` passed to the launched
 *     Chromium.
 *   - ONE browser instance, closed in `finally`.
 *   - No wall-clock sleeps — every wait is `waitForSelector` on a real
 *     DOM condition.
 *   - Scratch port only (default 19100, refuses < 19100).
 *
 * Usage:
 *   node scripts/lyt-w2-usability.mjs [--port N] [--headed] [--build]
 *
 * License: Public Domain (The Unlicense)
 */
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = join(__dirname, '..');
const distDir = join(FRONTEND_ROOT, 'dist');

const argv = process.argv.slice(2);
function flag(name, def) {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return def;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const port = Number(flag('port', '19100'));
if (!Number.isInteger(port) || port < 19100) {
  console.error(`[lyt-w2-usability] refusing port ${port} -- scratch ports must be >= 19100`);
  process.exit(2);
}
const headed = Boolean(flag('headed', false));
const doBuild = Boolean(flag('build', false));

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: FRONTEND_ROOT, ...opts });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
    child.on('error', reject);
  });
}

async function waitForPreviewReady(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) return;
      lastErr = new Error(`preview responded ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`vite preview never became ready at ${url}: ${lastErr}`);
}

const results = [];
function record(name, pass, detail) {
  results.push({ name, pass, detail });
  console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${name}${detail ? ' — ' + detail : ''}`);
}

async function flow(page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  const url = `http://127.0.0.1:${port}/`;
  await page.goto(url, { waitUntil: 'load', timeout: 30_000 });
  await page.waitForSelector('#split-workspace', { timeout: 20_000 });

  // ── 1. corner presence menu opens ────────────────────────────────
  await page.waitForSelector('#lyt-presence-menu-btn', { timeout: 10_000 });
  await page.click('#lyt-presence-menu-btn');
  await page.waitForSelector('#lyt-presence-popover', { timeout: 10_000 });
  await page.waitForSelector('[data-lyt-presence-target="boardRail"] input[type="checkbox"]', { timeout: 10_000 });
  record('presence menu opens on click', true);

  // Stable data-attribute hooks (not text matching — "Board Rail" is a
  // substring of the rail-style-selector's own label text, "Board Rail
  // style", which made an earlier text-based locator ambiguous/racy).
  const previewCheckbox = page.locator('[data-lyt-presence-target="previewBoard"] input[type="checkbox"]');
  const railCheckbox = page.locator('[data-lyt-presence-target="boardRail"] input[type="checkbox"]');
  const controlPanelCheckbox = page.locator('[data-lyt-presence-target="controlPanel"] input[type="checkbox"]');

  // ── 2. toggle previewBoard on -> PreviewBoardPanel mounts ────────
  const previewCheckedBefore = await previewCheckbox.isChecked();
  record('previewBoard starts unchecked (default off)', previewCheckedBefore === false);
  await previewCheckbox.click();
  await page.waitForSelector('.preview-board-panel', { timeout: 10_000 });
  record('toggling previewBoard on mounts PreviewBoardPanel', await page.locator('.preview-board-panel').count() === 1);

  // ── 3. toggle boardRail on (style A, default) -> SidebarWidget mounts, multi-board rail REACHABLE ──
  await railCheckbox.click();
  await page.waitForSelector('#sidebar-widget', { timeout: 10_000 });
  const railVisible = await page.locator('#sidebar-widget').isVisible();
  record('toggling boardRail on (style A) mounts SidebarWidget — multi-board rail reachable', railVisible);
  const addBoardBtn = await page.locator('#sidebar-widget .tab-add-btn').count();
  record('SidebarWidget is functional (its own add-board control is present)', addBoardBtn >= 1);

  // ── 4. last-remaining-panel guard: uncheck everything down to one ──
  await previewCheckbox.click(); // preview off again
  await railCheckbox.click(); // rail off again — controlPanel is now the sole visible target
  await page.waitForFunction(
    () => document.querySelector('[data-lyt-presence-target="controlPanel"] input[type="checkbox"]')?.disabled === true,
    { timeout: 10_000 },
  );
  const controlPanelDisabled = await controlPanelCheckbox.isDisabled();
  record('last-remaining-panel guard disables the sole visible target\'s checkbox', controlPanelDisabled);
  const guardTitle = await page.locator('[data-lyt-presence-target="controlPanel"]').getAttribute('title');
  record('guarded checkbox carries an explanatory title (not a silent revert)', typeof guardTitle === 'string' && guardTitle.length > 0);

  // ── 5. rail style B (popover) ────────────────────────────────────
  await railCheckbox.click(); // boardRail back on (style A) so its stored preference is true
  await page.waitForSelector('#sidebar-widget', { timeout: 10_000 });
  const railStyleSelect = page.locator('#lyt-presence-popover select');
  await railStyleSelect.selectOption('popover');
  // The grid leaf's own SidebarWidget must unmount (zero standing cost
  // in popover style — App.vue's lytPresenceOverrides forces it),
  // regardless of the stored lytPresence.boardRail preference (still
  // true underneath).
  await page.waitForSelector('#sidebar-widget', { state: 'detached', timeout: 10_000 });
  record('switching to popover rail style unmounts the grid-leaf SidebarWidget', await page.locator('#sidebar-widget').count() === 0);
  await page.waitForSelector('#board-rail-popover-btn', { timeout: 10_000 });
  await page.click('#board-rail-popover-btn');
  await page.waitForSelector('#board-rail-popover #sidebar-widget', { timeout: 10_000 });
  record('board-rail popover trigger (style B) opens SidebarWidget in a popover', await page.locator('#board-rail-popover #sidebar-widget').count() === 1);
  await page.click('#board-rail-popover-btn'); // close it

  // ── 6. previewBoard renders real content (MiniBoard) once re-enabled ──
  await page.click('#lyt-presence-menu-btn'); // reopen menu (closed by outside-click during step 5's rail-popover interaction)
  await page.waitForSelector('[data-lyt-presence-target="previewBoard"] input[type="checkbox"]', { timeout: 10_000 });
  await previewCheckbox.click();
  await page.waitForSelector('.preview-board-panel canvas, .preview-board-panel svg', { timeout: 10_000 });
  const miniBoardRendered = await page.locator('.preview-board-panel canvas, .preview-board-panel svg').count();
  record('previewBoard mounts real MiniBoard content (canvas/svg)', miniBoardRendered >= 1);
}

async function main() {
  if (doBuild) {
    console.log('[lyt-w2-usability] building SPA (npm run build)…');
    await run('npm', ['run', 'build']);
  } else {
    try {
      await access(join(distDir, 'index.html'));
    } catch {
      console.error(`[lyt-w2-usability] ${distDir}/index.html not found -- run \`npm run build\` first, or pass --build`);
      process.exit(2);
    }
  }

  console.log(`[lyt-w2-usability] starting vite preview on port ${port}…`);
  const preview = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], {
    cwd: FRONTEND_ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let browser = null;
  try {
    await waitForPreviewReady(`http://127.0.0.1:${port}/`);

    console.log(`[lyt-w2-usability] launching chromium (headless=${!headed})…`);
    browser = await chromium.launch({
      executablePath: '/usr/bin/chromium',
      headless: !headed,
      args: ['--js-flags=--max-old-space-size=1024'],
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('pageerror', (e) => { consoleErrors.push(e.message); console.error('[page error]', e.message); });
    page.on('console', (msg) => { if (msg.type() === 'error') console.error('[console.error]', msg.text()); });

    await flow(page);

    await context.close();

    const nFail = results.filter((r) => !r.pass).length;
    console.log('');
    console.log(`[lyt-w2-usability] ${results.length - nFail}/${results.length} assertions passed, ${consoleErrors.length} page errors`);
    if (consoleErrors.length > 0) {
      console.log('[lyt-w2-usability] page errors:', consoleErrors);
    }
    if (nFail > 0 || consoleErrors.length > 0) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    preview.kill();
  }
}

main().catch((err) => {
  console.error('[lyt-w2-usability] fatal:', err);
  process.exitCode = 1;
});
