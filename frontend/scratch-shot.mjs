// Minimal playwright driver: navigate, dismiss onboarding, optional actions, screenshot.
// Usage: node scratch-shot.mjs <url> <outPath> [width] [height] [actions.json]
// actions.json: array of {type:'click', selector} | {type:'wait', ms} | {type:'mousedown',selector} |
//   {type:'mousemove', dx, dy} | {type:'mouseup'} | {type:'eval', code}
import { chromium } from 'playwright-core';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';

const url = process.argv[2];
const out = process.argv[3];
const width = parseInt(process.argv[4] || '1920', 10);
const height = parseInt(process.argv[5] || '1080', 10);
const actionsFile = process.argv[6];

const executablePath = execSync(
  "find /home/bork/.cache/ms-playwright -maxdepth 1 -iname 'chromium-*' ! -iname '*headless*' | sort | tail -1",
)
  .toString()
  .trim() + '/chrome-linux64/chrome';

const browser = await chromium.launch({ executablePath, headless: true });
try {
  const page = await browser.newPage({ viewport: { width, height } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', async (msg) => {
    if (msg.text().startsWith('[LYTDBG')) {
      consoleErrors.push(msg.text());
    }
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      if (/recursive/i.test(msg.text())) {
        for (const arg of msg.args()) {
          try {
            const detail = await arg.evaluate((v) => (v && v.stack) ? v.stack : String(v));
            consoleErrors.push('DETAIL:' + detail);
          } catch {}
        }
      }
    }
  });
  page.on('pageerror', (err) => {
    pageErrors.push(String(err && err.stack || err));
    try {
      pageErrors.push('STACK_KEYS:' + JSON.stringify(Object.getOwnPropertyNames(err)));
      pageErrors.push('STACK_RAW:' + (err.stack ?? '<none>'));
    } catch (e) { pageErrors.push('stack-inspect-failed:' + e); }
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Runtime.enable');
  cdp.on('Runtime.exceptionThrown', (e) => {
    try {
      pageErrors.push('CDP_EXCEPTION:' + JSON.stringify(e.exceptionDetails).slice(0, 4000));
    } catch {}
  });
  await cdp.send('Debugger.enable');
  await cdp.send('Debugger.setPauseOnExceptions', { state: 'all' });
  try { await cdp.send('Debugger.setAsyncCallStackDepth', { maxDepth: 32 }); } catch {}
  const scriptUrls = new Map();
  cdp.on('Debugger.scriptParsed', (e) => {
    scriptUrls.set(e.scriptId, e.url);
  });
  let matchedCount = 0;
  cdp.on('Debugger.paused', async (e) => {
    try {
      const topUrl = (e.callFrames && e.callFrames[0] && (scriptUrls.get(e.callFrames[0].location.scriptId) || '')) || '';
      const isNoise = /@sabaki|rolldown-runtime|api-client\.ts/.test(topUrl) === false ? false : true;
      if (!isNoise && matchedCount < 8) {
        matchedCount++;
        const frames = (e.callFrames || []).slice(0, 40).map((f) => ({
          fn: f.functionName || '(anonymous)',
          url: scriptUrls.get(f.location && f.location.scriptId) || f.url,
          line: f.location && f.location.lineNumber,
          col: f.location && f.location.columnNumber,
        }));
        const asyncChains = [];
        let a = e.asyncStackTrace;
        while (a) {
          asyncChains.push({
            desc: a.description || '',
            frames: (a.callFrames || []).slice(0, 15).map((f) => ({
              fn: f.functionName || '(anonymous)',
              url: f.url,
              line: f.lineNumber,
            })),
          });
          a = a.parent;
        }
        pageErrors.push('DEBUGGER_PAUSED_MATCH reason=' + e.reason + ' data=' + JSON.stringify(e.data || null).slice(0,300) + ' stack=' + JSON.stringify(frames) + ' async=' + JSON.stringify(asyncChains));
      }
    } catch (err) {
      pageErrors.push('debugger-frame-extract-failed:' + err);
    }
    try { await cdp.send('Debugger.resume'); } catch {}
  });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(600);

  // Best-effort dismiss of onboarding wizard, if present. Multi-step
  // wizard (7 steps) — click Skip repeatedly until it's gone.
  async function dismissWizard() {
    for (let i = 0; i < 8; i++) {
      const skipBtn = page.getByRole('button', { name: /^Skip$/ });
      const finishBtn = page.getByRole('button', { name: /^Finish$/ });
      if (await finishBtn.count()) {
        try {
          await finishBtn.first().click({ timeout: 1500 });
          await page.waitForTimeout(250);
        } catch {}
        break;
      } else if (await skipBtn.count()) {
        try {
          await skipBtn.first().click({ timeout: 1500 });
          await page.waitForTimeout(250);
        } catch {
          break;
        }
      } else {
        break;
      }
    }
  }
  await dismissWizard();

  if (actionsFile && existsSync(actionsFile)) {
    const actions = JSON.parse(readFileSync(actionsFile, 'utf-8'));
    for (const a of actions) {
      if (a.type === 'click') {
        await page.click(a.selector, { timeout: 5000 });
      } else if (a.type === 'wait') {
        await page.waitForTimeout(a.ms);
      } else if (a.type === 'mousemoveto') {
        const el = await page.$(a.selector);
        const box = await el.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      } else if (a.type === 'mousedown') {
        await page.mouse.down();
      } else if (a.type === 'mouseup') {
        await page.mouse.up();
      } else if (a.type === 'mousemove') {
        await page.mouse.move(a.x, a.y, { steps: a.steps || 1 });
      } else if (a.type === 'eval') {
        await page.evaluate(a.code);
      } else if (a.type === 'evallog') {
        const r = await page.evaluate(a.code);
        console.log('EVAL:', JSON.stringify(r));
      } else if (a.type === 'setfiles') {
        const input = await page.$(a.selector);
        await input.setInputFiles(a.files);
      } else if (a.type === 'clickAndSetFiles') {
        try {
          const [chooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 5000 }),
            page.click(a.selector),
          ]);
          await chooser.setFiles(a.files);
        } catch (e) {
          console.log('clickAndSetFiles failed (continuing):', e.message);
        }
      } else if (a.type === 'reload') {
        await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
      } else if (a.type === 'resize') {
        await page.setViewportSize({ width: a.width, height: a.height });
      } else if (a.type === 'dismissWizard') {
        await dismissWizard();
      } else if (a.type === 'clickAt') {
        await page.mouse.click(a.x, a.y);
      }
    }
  }

  await page.waitForTimeout(300);
  await page.screenshot({ path: out, fullPage: false });
  console.log('OK', out);
  if (consoleErrors.length) {
    console.log('CONSOLE_ERRORS:', JSON.stringify(consoleErrors.slice(0, 20)));
  }
  if (pageErrors.length) {
    console.log('PAGE_ERRORS:', JSON.stringify(pageErrors.slice(0, 20)));
  }
} finally {
  await browser.close();
}
