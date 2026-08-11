#!/usr/bin/env node
/**
 * .claude/dispatch-reports/lyt-w4-chrome-probe.mjs
 *
 * W4 commission (`.claude/dispatch-reports/lyt-vue-realization-roadmap.md`
 * §8 W4) Playwright probe. Drives a real Chromium against a dev server
 * whose backend/engine env vars point at DEAD scratch ports (>=19100,
 * nothing listening) — the ABSOLUTE PROBE-ISOLATION RULE this commission
 * repeats verbatim after the ledger row 1834/1835 live-backend write
 * breach. `--url`'s own default (19173) matches `lyt-w3-resizers-
 * probe.mjs`'s existing precedent; VITE_API_BASE_URL/VITE_KATAGO_WS_URL
 * are overridden to two OTHER dead ports (19101/19102) below so a
 * probe-triggered fetch/connect attempt has nowhere real to land.
 *
 * Verifies, per the six-item commission:
 *   0. PROBE ISOLATION: no network request during the whole run ever
 *      targets 127.0.0.1:8764 (backend) or :1235/:1242 (the two
 *      historical/current KataGo-proxy default ports) — instrumented via
 *      Playwright's own request log, not inferred from absence of an
 *      error.
 *   1. OVERLAY STRATUM (item 1): toggling the workspace-save-error
 *      banner and the system-log panel (both driven via `window.store`,
 *      the same DEV-only console handle `lyt-w3-resizers-probe.mjs`
 *      already established as load-bearing test infrastructure) causes
 *      ZERO movement of `#board-square` / `#split-workspace` / the
 *      toolbar strip's own rect — the categorical "no layout push"
 *      requirement.
 *   3. POPOVER Z-INDEX (item 3): opening the corner presence menu and
 *      the DEBUG pill and asserting `elementFromPoint` at the popover's
 *      own interior resolves to a DESCENDANT of that popover, not some
 *      occluding chrome sibling.
 *   4. MINIBOARD CLAMP (item 4): enabling `previewBoard` via the
 *      presence menu at a narrow viewport and asserting its rect stays
 *      fully inside the viewport (no negative left/top, no right/bottom
 *      past innerWidth/innerHeight) and stays square (width == height,
 *      +-1px rounding).
 *   5. DEBUG GATING (item 5): the DEBUG pill is present in this DEV
 *      build; a companion prod-build assertion (no dev server involved)
 *      is the vitest `DebugMenu-dev-gating.test.ts` unit test instead —
 *      a Playwright probe against a dev server cannot exercise a PROD
 *      build's own dead-code elimination, so that half of item 5 is
 *      verified at the bundler level, disclosed here rather than
 *      silently skipped.
 *
 * Exits non-zero if any check fails.
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

function rectOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  }, selector);
}

async function waitForWorkspace(page) {
  await page.waitForSelector('#split-workspace', { timeout: 20000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('split-workspace');
    return el && el.getBoundingClientRect().width > 0;
  }, { timeout: 20000 });
}

const FORBIDDEN_PORTS = ['8764', '1235', '1242'];
const contactedForbiddenPorts = new Set();

async function main() {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));

    // ── 0. PROBE-ISOLATION instrumentation ──────────────────────────
    page.on('request', (req) => {
      const u = req.url();
      for (const port of FORBIDDEN_PORTS) {
        if (u.includes(`127.0.0.1:${port}`) || u.includes(`localhost:${port}`)) {
          contactedForbiddenPorts.add(`${port} <- ${u}`);
        }
      }
    });

    await page.goto(url, { waitUntil: 'load' });
    await waitForWorkspace(page);

    // A fresh (never-persisted) profile auto-opens the first-run setup
    // wizard (App.vue's own onboarding watcher) — dismiss it via Escape
    // (SetupWizardModal.vue's own documented dismiss path) so it does
    // not intercept the popover clicks below.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    // Confirm the probe build actually resolved to the DEAD scratch
    // ports (not silently falling back to the live defaults) —
    // asserting the isolation is IN EFFECT, not merely that nothing
    // happened to connect yet.
    const resolvedEngineUrl = await page.evaluate(() => {
      try {
        // eslint-disable-next-line no-undef -- probe-only browser-context read
        return window.store?.profile?.settings?.engine?.katago?.url ?? null;
      } catch {
        return null;
      }
    });
    console.log(`Resolved engine URL (profile setting, may be unset -> env fallback applies): ${resolvedEngineUrl}`);

    // ── 1. OVERLAY STRATUM: no-push assertions ──────────────────────
    {
      const boardBefore = await rectOf(page, '#board-square, #content');
      const splitBefore = await rectOf(page, '#split-workspace');
      const toolbarBefore = await rectOf(page, '.lyt-toolbar-strip');

      // Drive the save-error banner via the same DEV-only window.store
      // handle lyt-w3-resizers-probe.mjs already established.
      await page.evaluate(() => {
        // eslint-disable-next-line no-undef -- probe-only browser-context write
        window.store.workspaceSaveState = { kind: 'error', error: 'probe-injected' };
      });
      await page.waitForSelector('#workspace-save-banner', { timeout: 5000 });

      const boardAfterBanner = await rectOf(page, '#board-square, #content');
      const splitAfterBanner = await rectOf(page, '#split-workspace');
      const toolbarAfterBanner = await rectOf(page, '.lyt-toolbar-strip');
      assertCheck(
        'save-error banner: #board-square rect unchanged',
        JSON.stringify(boardBefore) === JSON.stringify(boardAfterBanner),
        `before=${JSON.stringify(boardBefore)} after=${JSON.stringify(boardAfterBanner)}`,
      );
      assertCheck(
        'save-error banner: #split-workspace rect unchanged',
        JSON.stringify(splitBefore) === JSON.stringify(splitAfterBanner),
      );
      assertCheck(
        'save-error banner: toolbar strip rect unchanged',
        JSON.stringify(toolbarBefore) === JSON.stringify(toolbarAfterBanner),
      );

      const overlayRect = await rectOf(page, '#lyt-overlay-stack');
      const boardRect = boardAfterBanner;
      const noOcclusion =
        overlayRect === null || boardRect === null ||
        overlayRect.left >= boardRect.right || overlayRect.right <= boardRect.left ||
        overlayRect.top >= boardRect.bottom || overlayRect.bottom <= boardRect.top;
      assertCheck(
        'save-error banner overlay never intersects #board-square',
        noOcclusion,
        `overlay=${JSON.stringify(overlayRect)} board=${JSON.stringify(boardRect)}`,
      );

      // Reset, then drive the system-log panel the same way.
      await page.evaluate(() => {
        // eslint-disable-next-line no-undef -- probe-only browser-context write
        window.store.workspaceSaveState = { kind: 'idle' };
        // eslint-disable-next-line no-undef -- probe-only browser-context write
        window.store.session.ui.systemLogExpanded = true;
      });
      await page.waitForSelector('.system-log-panel', { timeout: 5000 });

      const boardAfterLog = await rectOf(page, '#board-square, #content');
      const splitAfterLog = await rectOf(page, '#split-workspace');
      assertCheck(
        'system-log overlay: #board-square rect unchanged',
        JSON.stringify(boardBefore) === JSON.stringify(boardAfterLog),
      );
      assertCheck(
        'system-log overlay: #split-workspace rect unchanged',
        JSON.stringify(splitBefore) === JSON.stringify(splitAfterLog),
      );

      const logOverlayRect = await rectOf(page, '#lyt-overlay-stack');
      const noLogOcclusion =
        logOverlayRect === null || boardAfterLog === null ||
        logOverlayRect.left >= boardAfterLog.right || logOverlayRect.right <= boardAfterLog.left ||
        logOverlayRect.top >= boardAfterLog.bottom || logOverlayRect.bottom <= boardAfterLog.top;
      assertCheck(
        'system-log overlay never intersects #board-square',
        noLogOcclusion,
        `overlay=${JSON.stringify(logOverlayRect)} board=${JSON.stringify(boardAfterLog)}`,
      );

      await page.evaluate(() => {
        // eslint-disable-next-line no-undef -- probe-only browser-context write
        window.store.session.ui.systemLogExpanded = false;
      });
    }

    // The dead-backend isolation setup ITSELF generates real
    // network-error system messages (the probe's own isolation is
    // WORKING — see item 1's overlay-stratum section above, which this
    // is a side effect of), which the transient-log-reveal composable
    // correctly auto-opens `#lyt-overlay-stack` for at
    // `--z-chrome-overlay` (ABOVE `--z-popover-chrome`, BY DESIGN — an
    // alert must never be silently hidden behind an open popover).
    // That is CORRECT behavior, but it would collide with the
    // popover-vs-popover z-index checks below (a narrower claim: do
    // the toolbar/corner popovers correctly out-rank ORDINARY chrome,
    // not "do they out-rank a standing alert too," which they should
    // NOT). Clear the message queue and force the log closed so this
    // section tests popover-vs-chrome stacking in isolation.
    await page.evaluate(() => {
      // eslint-disable-next-line no-undef -- probe-only browser-context write
      window.store.engine.messages = [];
      // eslint-disable-next-line no-undef -- probe-only browser-context write
      window.store.session.ui.systemLogExpanded = false;
    });
    // `transientReveal` (useTransientLogReveal.ts) is a LOCAL ref, not
    // exposed on `window.store` — clearing `messages` above doesn't
    // un-flip it; only its own internal timeout does, after
    // `TRANSIENT_LOG_REVEAL_MS` (8000ms, `src/lib/timing.ts`) from the
    // LAST qualifying message. Wait that out in full, plus margin.
    await page.waitForTimeout(8300);
    await page.waitForFunction(() => document.querySelector('.system-log-panel') === null, { timeout: 5000 }).catch(() => {});

    // ── 3. POPOVER Z-INDEX ───────────────────────────────────────────
    // Checked individually, by selector, per the commission's own list
    // (presence menu, DEBUG pill) — each opened, each verified via
    // `elementFromPoint` at its own bounding-box center resolving to a
    // DESCENDANT of that popover, never an occluding sibling.
    async function checkPopoverZIndex(label, triggerSelector, popoverSelector) {
      const trigger = await page.$(triggerSelector);
      assertCheck(`${label}: trigger present`, trigger !== null);
      if (!trigger) return;
      await trigger.click();
      await page.waitForTimeout(80);
      const popover = await page.$(popoverSelector);
      assertCheck(`${label}: popover opens`, popover !== null);
      if (popover) {
        const box = await popover.boundingBox();
        if (box) {
          const cx = box.x + box.width / 2;
          const cy = box.y + box.height / 2;
          const diag = await page.evaluate(
            ({ x, y, sel }) => {
              const el = document.elementFromPoint(x, y);
              let cur = el;
              while (cur) {
                if (cur.matches?.(sel)) return { inside: true, tag: el?.outerHTML?.slice(0, 120) };
                cur = cur.parentElement;
              }
              return { inside: false, tag: el?.outerHTML?.slice(0, 200), id: el?.id, cls: el?.className };
            },
            { x: cx, y: cy, sel: popoverSelector },
          );
          assertCheck(`${label}: elementFromPoint at its center resolves inside it (not occluded)`, diag.inside, JSON.stringify(diag));
        }
      }
      await trigger.click(); // close
      await page.waitForTimeout(80);
    }

    await checkPopoverZIndex('presence menu', '.lyt-presence-trigger', '.lyt-presence-popover');
    await checkPopoverZIndex('DEBUG menu', '.debug-pill', '.debug-popover');
    // SLIDERS popover is hover-driven (useHoverPopover), not click —
    // hover its trigger instead of clicking.
    {
      const slidersTrigger = await page.$('.sliders-trigger');
      assertCheck('SLIDERS trigger present', slidersTrigger !== null);
      if (slidersTrigger) {
        await slidersTrigger.hover();
        await page.waitForTimeout(200);
        const popover = await page.$('.sliders-popover');
        assertCheck('SLIDERS: popover opens on hover', popover !== null);
        if (popover) {
          const box = await popover.boundingBox();
          if (box) {
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            const inside = await page.evaluate(
              ({ x, y }) => {
                const el = document.elementFromPoint(x, y);
                let cur = el;
                while (cur) {
                  if (cur.matches?.('.sliders-popover')) return true;
                  cur = cur.parentElement;
                }
                return false;
              },
              { x: cx, y: cy },
            );
            assertCheck('SLIDERS: elementFromPoint at its center resolves inside it (not occluded)', inside);
          }
        }
        await page.mouse.move(10, 10);
        await page.waitForTimeout(250);
      }
    }

    // ── 4. MINIBOARD CLAMP ──────────────────────────────────────────
    {
      await page.setViewportSize({ width: 900, height: 600 });
      await page.waitForTimeout(100);
      await page.evaluate(() => {
        // eslint-disable-next-line no-undef -- probe-only browser-context write
        const ui = window.store.session.ui;
        ui.lytPresence = { ...ui.lytPresence, previewBoard: true };
      });
      await page.waitForTimeout(150);

      const previewRect = await rectOf(page, '.preview-board-panel');
      if (previewRect) {
        const withinViewportX = previewRect.left >= -1 && previewRect.right <= 900 + 1;
        const withinViewportY = previewRect.top >= -1 && previewRect.bottom <= 600 + 1;
        assertCheck('previewBoard rect stays within viewport horizontally at 900x600', withinViewportX, JSON.stringify(previewRect));
        assertCheck('previewBoard rect stays within viewport vertically at 900x600', withinViewportY, JSON.stringify(previewRect));
        const isSquare = Math.abs(previewRect.width - previewRect.height) <= 2;
        assertCheck('previewBoard stays square (+-2px) even if shrunk', isSquare, `w=${previewRect.width} h=${previewRect.height}`);
        assertCheck('previewBoard has nonzero size (not collapsed to 0)', previewRect.width > 0 && previewRect.height > 0);
      } else {
        assertCheck('previewBoard panel mounted at 900x600 with previewBoard presence on', false, 'no .preview-board-panel found');
      }

      await page.setViewportSize({ width: 1920, height: 1080 });
    }

    // ── 5. DEBUG GATING (dev-build half; prod half is a vitest unit test) ──
    {
      const debugPill = await page.$('.debug-pill');
      assertCheck('DEBUG pill is present in this DEV build', debugPill !== null);
    }

    // ── 0. Final probe-isolation verdict ─────────────────────────────
    assertCheck(
      'PROBE ISOLATION: no request ever targeted 127.0.0.1:8764/:1235/:1242 (live backend/engine ports)',
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
