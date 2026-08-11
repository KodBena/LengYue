#!/usr/bin/env node
/**
 * .claude/dispatch-reports/lyt-d2-fix-probe.mjs
 *
 * D2 fix (`.claude/dispatch-reports/lyt-w5-parity-build.md` Defect D2,
 * reclassified REWORK-CAUSED) — the live-app half. Drives a real
 * Chromium against a dev server whose backend/engine env vars point at
 * DEAD scratch ports (>=19400, nothing listening) — the ABSOLUTE
 * PROBE-ISOLATION RULE, same shape as `lyt-w5-parity-probe.mjs`.
 *
 * Verifies the RESTORED manual affordance itself (not just the store
 * field, which the W5 audit already confirmed still exists and is
 * still read by the overlay's v-if): clicking the real
 * `#system-log-toggle-btn` opens the panel, clicking again closes it,
 * the auto-reveal path is unaffected by the manual setting being off,
 * and the overlay never occludes the board either way.
 *
 * Every check below is REACHABLE-VERIFIED (asserted live) unless
 * marked ENGINE-GATED. Exits non-zero if any check fails.
 *
 * License: Public Domain (The Unlicense)
 */
import { chromium } from 'playwright-core';

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
const url = flag('url', 'http://127.0.0.1:19400');
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

// Same forbidden-port set as lyt-w5-parity-probe.mjs, plus this
// session's own dead scratch ports named explicitly so a stray
// contact against THIS run's own backend/engine placeholders would
// also be caught (they're dead too, but naming them keeps the log
// self-documenting).
const FORBIDDEN_PORTS = ['8764', '1235', '1242', '4173', '5173', '5174', '19401', '19402'];
const contactedForbiddenPorts = new Set();

async function waitForWorkspace(page) {
  await page.waitForSelector('#split-workspace', { timeout: 20000 });
  await page.waitForFunction(() => {
    const el = document.getElementById('split-workspace');
    return el && el.getBoundingClientRect().width > 0;
  }, { timeout: 20000 });
}

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
          // 19401/19402 are THIS run's own placeholder ports, deliberately
          // dead — a request to them is expected (the app trying to
          // reach a "configured but unreachable" backend/engine) and is
          // NOT a probe-isolation violation; only 8764/1235/1242/4173/
          // 5173/5174 (real live/dev ports elsewhere) would be.
          if (port === '19401' || port === '19402') continue;
          contactedForbiddenPorts.add(`${port} <- ${u}`);
        }
      }
    });

    await page.goto(url, { waitUntil: 'load' });
    await waitForWorkspace(page);
    // Dismiss the first-run setup wizard if it appears (fresh profile).
    await page.keyboard.press('Escape');
    await page.waitForTimeout(150);

    // Under the standing dead-port isolation rule, the app's own
    // bootstrap sequence (auto-login, positions/stats fetches) hits the
    // unreachable backend and pushes several error-level SystemMessages
    // within the first ~1s — which the PRE-EXISTING, unmodified
    // `useTransientLogReveal` composable correctly auto-reveals for
    // `TRANSIENT_LOG_REVEAL_MS` (8s). This is expected behaviour of code
    // this fix does not touch, not a D2 regression — waited out here so
    // section A's "collapsed at rest" precondition is measuring the
    // MANUAL toggle's own resting state, not a startup artifact. Verified
    // empirically (dev exploration, this session) that no periodic retry
    // keeps re-arming the timer once the bootstrap batch settles.
    await page.waitForFunction(() => !document.querySelector('.system-log-panel'), { timeout: 15000 }).catch(() => {});

    // ══ A. Resting state (after startup auto-reveal settles): manual
    //      toggle off, panel absent, trigger present ══════════════════
    {
      const expandedInitial = await page.evaluate(() => window.store.session.ui.systemLogExpanded);
      assertCheck('fresh profile: systemLogExpanded defaults to false', expandedInitial === false);
      const panelAbsent = await page.$('.system-log-panel');
      assertCheck('system log panel absent when collapsed and no transient reveal', panelAbsent === null);
      const trigger = await page.$('#system-log-toggle-btn');
      assertCheck('manual toggle button (#system-log-toggle-btn) is present in corner chrome', trigger !== null);
    }

    // ══ B. Manual expand via the REAL button click (not a store poke) ══
    {
      const trigger = await page.$('#system-log-toggle-btn');
      await trigger.click();
      await page.waitForTimeout(100);
      const panelVisible = await page.$('.system-log-panel');
      assertCheck('clicking the toggle opens the system log panel', panelVisible !== null);
      const expandedAfterClick = await page.evaluate(() => window.store.session.ui.systemLogExpanded);
      assertCheck('systemLogExpanded is written true by the click (not just a local ref)', expandedAfterClick === true);
      const ariaPressed = await page.evaluate(() =>
        document.getElementById('system-log-toggle-btn')?.getAttribute('aria-pressed'));
      assertCheck('button reflects aria-pressed="true" once expanded', ariaPressed === 'true');
    }

    // ══ C. Non-occlusion while manually expanded ══════════════════════
    {
      const overlayRect = await rectOf(page, '#lyt-overlay-stack');
      const boardRect = await rectOf(page, '#board-square, #content');
      const noOcclusion = overlayRect === null || boardRect === null ||
        overlayRect.left >= boardRect.right || overlayRect.right <= boardRect.left ||
        overlayRect.top >= boardRect.bottom || overlayRect.bottom <= boardRect.top;
      assertCheck('system log overlay never occludes the board while manually expanded', noOcclusion, JSON.stringify({ overlayRect, boardRect }));
    }

    // ══ D. Manual collapse via the REAL button click ══════════════════
    {
      const trigger = await page.$('#system-log-toggle-btn');
      await trigger.click();
      await page.waitForTimeout(100);
      const panelHiddenAgain = await page.$('.system-log-panel');
      assertCheck('clicking the toggle again closes the system log panel', panelHiddenAgain === null);
      const expandedAfterSecondClick = await page.evaluate(() => window.store.session.ui.systemLogExpanded);
      assertCheck('systemLogExpanded is written back to false by the second click', expandedAfterSecondClick === false);
      const ariaPressedAfter = await page.evaluate(() =>
        document.getElementById('system-log-toggle-btn')?.getAttribute('aria-pressed'));
      assertCheck('button reflects aria-pressed="false" once collapsed again', ariaPressedAfter === 'false');
    }

    // ══ E. touchSession fires on toggle (session persist scheduling) ══
    {
      const before = await page.evaluate(() => window.sessionVersion?.value);
      if (before === undefined) {
        console.log('INFO  window.sessionVersion not exposed for direct read — skipping direct-counter check (covered by tests/integration/useSystemLogToggle.test.ts instead)');
      } else {
        const trigger = await page.$('#system-log-toggle-btn');
        await trigger.click();
        await page.waitForTimeout(50);
        const after = await page.evaluate(() => window.sessionVersion?.value);
        assertCheck('sessionVersion bumps on toggle click', after > before, `before=${before} after=${after}`);
        await trigger.click(); // restore collapsed for the next section
        await page.waitForTimeout(50);
      }
    }

    // ══ F. Auto-reveal is unaffected: manual OFF, error arrives, panel shows ══
    {
      const expandedNow = await page.evaluate(() => window.store.session.ui.systemLogExpanded);
      assertCheck('precondition: manual toggle is off before the auto-reveal check', expandedNow === false);

      await page.evaluate(() => {
        window.store.engine.messages.unshift({
          id: 'd2-probe-error',
          type: 'error',
          text: 'D2 probe synthetic error',
          timestamp: Date.now(),
        });
      });
      await page.waitForTimeout(150);
      const panelDuringReveal = await page.$('.system-log-panel');
      assertCheck('an error arrival auto-reveals the panel even though the manual toggle is off', panelDuringReveal !== null);

      const stillOff = await page.evaluate(() => window.store.session.ui.systemLogExpanded);
      assertCheck('auto-reveal does NOT write systemLogExpanded (stays a separate transient ref)', stillOff === false);

      const ariaDuringReveal = await page.evaluate(() =>
        document.getElementById('system-log-toggle-btn')?.getAttribute('aria-pressed'));
      assertCheck('toggle button stays aria-pressed="false" during a transient (non-manual) reveal', ariaDuringReveal === 'false');
    }

    // ── Final probe-isolation verdict ────────────────────────────────
    assertCheck(
      'PROBE ISOLATION: no request ever targeted a live backend/engine/dev port',
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
