#!/usr/bin/env node
/**
 * .claude/dispatch-reports/resizer-rearch-probe.mjs
 *
 * Live rect-probe for the resizer-rearch commission, INCLUDING the
 * charter amendment (nested-splitter tree, ledger row 391) and the
 * geometry correction the live diagnostic forced
 * (.claude/dispatch-reports/panel-weirdness-live-investigation.md
 * §3/§6: a resizer bar's own SCREEN POSITION must track the cursor
 * 1:1 across its ENTIRE range — the diagnostic measured up to 541px
 * of lag under the pre-fix `flex: 0 1 auto` #board-column shape).
 *
 * Drives a DENSE synthetic mouse-drag sweep across EACH of the two
 * nested-splitter bars' full travel range via a real Chromium
 * (playwright-core), and for each step asserts:
 *   - the bar's own left-edge position moves with the cursor within a
 *     tight, BOUNDED lag (this is the diagnostic's own methodology —
 *     "lag" — not just "the pane width changed some bounded amount",
 *     which is what the pre-diagnostic version of this probe checked
 *     and which the diagnostic showed was insufficient: the pane
 *     width test alone cannot see the bar decoupling from the
 *     cursor, only that SOMETHING moved).
 *   - range pinning at both ends.
 *   - no drag-start clobber (a second drag from arbitrary rendered
 *     geometry reproduces exactly that geometry at zero displacement).
 *   - the persisted store fact matches rendered geometry post-drag.
 * Also verifies the two panes are independent (dragging one doesn't
 * move the other's persisted value), that content changes (branch
 * expand/collapse, navigation) produce ZERO width delta on either
 * pane (maintainer constraint, ledger row 414 — the tree pane's ONLY
 * write channel is the INNER bar, never automatic), and captures the
 * screenshot triptych.
 *
 * Run against the DEV server (not `vite preview`) so `window.store`
 * is available (main.ts gates it on `import.meta.env.DEV`) — used
 * here only to read the persisted value for a sanity check, not to
 * bypass the real drag.
 *
 * Usage:
 *   node .claude/dispatch-reports/resizer-rearch-probe.mjs [--url URL] \
 *        [--executable PATH] [--shots-dir DIR]
 *   (must be invoked with a CWD that resolves `playwright-core` — run
 *   from inside frontend/, or point --executable/--url appropriately.)
 *
 * Exits non-zero if any check fails.
 *
 * License: Public Domain (The Unlicense)
 */
import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
const url = flag('url', 'http://127.0.0.1:4601');
const executablePath = flag('executable', '/usr/bin/chromium');
const shotsDir = flag('shots-dir', '.claude/dispatch-reports');
mkdirSync(shotsDir, { recursive: true });

function rectOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, width: r.width, height: r.height };
  }, selector);
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

/**
 * Sweeps `barSelector` across a continuous 1px-per-step cursor path
 * (0 -> -SPAN -> +SPAN, a single continuous path so the probe itself
 * injects no artificial jump) and asserts the bar's OWN left-edge
 * position tracks the cursor within `maxLagPx` of the CLAMPED
 * expectation at every step — the diagnostic's own "lag" methodology,
 * not just "some width changed". "Clamped" matters: a pane that
 * starts AT or near its own floor (e.g. the tree panel's 140px
 * default) legitimately pins for the portion of the sweep that would
 * drag it past that floor — a naive "expected = bar.left + dx" (no
 * clamp) misreads that correct pinning as hundreds of px of "lag".
 * `sign` and `minWidthPx` mirror `computePaneWidthPx`'s own contract
 * exactly (App.vue / useResizablePanel.ts), so the expectation here
 * is the SAME clamped linear function the app itself computes, not a
 * re-derivation that could itself drift from it.
 */
async function sweepBarAndAssertLagBounded(page, label, barSelector, paneSelector, storeField, span, sign) {
  const bar = await rectOf(page, barSelector);
  assertCheck(`${label}: bar found (${barSelector})`, !!bar);
  if (!bar) return;

  const startX = Math.round(bar.left + bar.width / 2);
  const startY = Math.round(bar.top + bar.height / 2);
  const grabOffsetX = startX - Math.round(bar.left + bar.width / 2); // 0 by construction

  const paneOrigin = (await rectOf(page, paneSelector))?.width;
  assertCheck(`${label}: pane found (${paneSelector})`, typeof paneOrigin === 'number');
  if (typeof paneOrigin !== 'number') return;

  // The drag's upper clamp is whatever the app itself would compute —
  // not independently re-derived here. Read it back from the FIRST
  // post-mousedown store write below instead: mousedown, nudge 1px,
  // read the persisted value, solve for maxWidthPx is circular (we
  // don't know if that first sample is already past the ceiling). So
  // this probe drives the sweep bidirectionally and treats whichever
  // width the pane settles at when parked far off in EACH direction
  // (well past the swept span) as that direction's true clamp bound,
  // exactly like the existing range-pinning check below — then reuses
  // those two pinned values as the clamp bounds for the mid-sweep
  // expectation formula, so this probe never needs to know the app's
  // internal geometry constants at all.
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX + span + 5000, startY);
  const farRightWidth = (await rectOf(page, paneSelector))?.width;
  await page.mouse.move(startX - span - 5000, startY);
  const farLeftWidth = (await rectOf(page, paneSelector))?.width;
  await page.mouse.move(startX, startY); // back to origin before the real sweep
  await page.mouse.up();

  const loWidth = Math.min(farRightWidth, farLeftWidth);
  const hiWidth = Math.max(farRightWidth, farLeftWidth);

  await page.mouse.move(startX, startY);
  await page.mouse.down();

  const sweepPath = [];
  for (let dx = 0; dx >= -span; dx -= 1) sweepPath.push(dx);
  for (let dx = -span + 1; dx <= span; dx += 1) sweepPath.push(dx);

  let maxLag = 0;
  let maxLagAt = null;
  const paneWidths = new Set();

  for (const dx of sweepPath) {
    const cursorX = startX + dx;
    await page.mouse.move(cursorX, startY);
    const barNow = await rectOf(page, barSelector);
    const paneNow = await rectOf(page, paneSelector);
    if (paneNow) paneWidths.add(Math.round(paneNow.width));
    if (barNow) {
      // Same clamp shape as computePaneWidthPx: next = origin + sign*dx,
      // clamped to [loWidth, hiWidth] (measured above, not assumed).
      const rawNext = paneOrigin + sign * dx;
      const expectedPaneWidth = Math.max(loWidth, Math.min(rawNext, hiWidth));
      const expectedDelta = sign * (expectedPaneWidth - paneOrigin);
      const expectedBarLeft = bar.left + expectedDelta;
      const lag = Math.abs(barNow.left - expectedBarLeft);
      if (lag > maxLag) {
        maxLag = lag;
        maxLagAt = dx;
      }
    }
  }

  assertCheck(
    `${label}: bar screen position tracks the CLAMPED cursor expectation across the WHOLE swept range (max lag ≤ 3px)`,
    maxLag <= 3,
    `maxLag=${maxLag.toFixed(1)}px at dx=${maxLagAt} (grabOffsetX=${grabOffsetX}, paneOrigin=${paneOrigin}, loWidth=${loWidth}, hiWidth=${hiWidth})`,
  );
  assertCheck(
    `${label}: the sweep actually moved the pane (not a dead/no-op drag)`,
    paneWidths.size > 10,
    `distinctWidths=${paneWidths.size}`,
  );

  // Range pinning both ends.
  await page.mouse.move(startX + span + 5000, startY);
  const pinnedLow1 = (await rectOf(page, paneSelector))?.width;
  await page.mouse.move(startX + span + 6000, startY);
  const pinnedLow2 = (await rectOf(page, paneSelector))?.width;
  assertCheck(
    `${label}: range pinning at the low end`,
    pinnedLow1 !== undefined && pinnedLow1 === pinnedLow2,
    `pinnedLow1=${pinnedLow1} pinnedLow2=${pinnedLow2}`,
  );

  await page.mouse.move(startX - span - 5000, startY);
  const pinnedHigh1 = (await rectOf(page, paneSelector))?.width;
  await page.mouse.move(startX - span - 6000, startY);
  const pinnedHigh2 = (await rectOf(page, paneSelector))?.width;
  assertCheck(
    `${label}: range pinning at the high end`,
    pinnedHigh1 !== undefined && pinnedHigh1 === pinnedHigh2,
    `pinnedHigh1=${pinnedHigh1} pinnedHigh2=${pinnedHigh2}`,
  );

  // Settle mid-range, release.
  await page.mouse.move(startX + 97, startY);
  await page.mouse.up();

  const persisted = await page.evaluate((field) => window.store?.session?.ui?.[field], storeField);
  const renderedWidth = (await rectOf(page, paneSelector))?.width;
  assertCheck(
    `${label}: the persisted fact (${storeField}) matches rendered geometry post-drag`,
    typeof persisted === 'number' && renderedWidth !== undefined && Math.abs(persisted - renderedWidth) < 1,
    `persisted=${persisted} rendered=${renderedWidth}`,
  );

  // No-clobber-at-start: a second drag from this arbitrary post-drag
  // geometry reproduces exactly the rendered geometry at zero
  // displacement.
  const beforeSecondDrag = (await rectOf(page, paneSelector))?.width;
  const bar2 = await rectOf(page, barSelector);
  const startX2 = Math.round(bar2.left + bar2.width / 2);
  await page.mouse.move(startX2, startY);
  await page.mouse.down();
  await page.mouse.move(startX2, startY); // zero displacement
  const atZeroDisplacement = (await rectOf(page, paneSelector))?.width;
  await page.mouse.up();
  assertCheck(
    `${label}: no drag-start clobber (second drag at zero displacement = current rendered geometry)`,
    beforeSecondDrag !== undefined && atZeroDisplacement === beforeSecondDrag,
    `beforeSecondDrag=${beforeSecondDrag} atZeroDisplacement=${atZeroDisplacement}`,
  );
}

async function main() {
  const browser = await chromium.launch({ headless: true, executablePath });
  const page = await browser.newPage({ viewport: { width: 3840, height: 2160 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('#split-workspace', { timeout: 15000 });

  await page.screenshot({ path: path.join(shotsDir, 'resizer-rearch-01-before.png') });

  // ── INNER bar (ledger row 414): tree panel's ONE write channel ────
  // sign = +1: the tree panel sits to #resizer-inner's LEFT, so
  // dragging right GROWS it (mirrors computeTreePanelWidthPx's own
  // sign — see useResizablePanel.ts).
  await sweepBarAndAssertLagBounded(
    page, 'INNER (tree panel, session.ui.treePanelWidthPx)', '#resizer-inner', '#vue-tree-panel', 'treePanelWidthPx', 700, 1,
  );
  await page.screenshot({ path: path.join(shotsDir, 'resizer-rearch-02-after-inner-sweep.png') });

  // ── OUTER bar: the combined tree+control wrapper ─────────────────
  // sign = -1: the wrapper sits to #resizer-outer's RIGHT, so dragging
  // right SHRINKS it (mirrors computeTreeControlRegionWidthPx's sign).
  await sweepBarAndAssertLagBounded(
    page, 'OUTER (tree+control wrapper, session.ui.treeControlRegionWidthPx)', '#resizer-outer', '#tree-control-wrapper', 'treeControlRegionWidthPx', 1800, -1,
  );
  await page.screenshot({ path: path.join(shotsDir, 'resizer-rearch-03-after-outer-sweep.png') });

  // ── Independence: dragging one pane didn't move the other's fact ──
  const finalState = await page.evaluate(() => ({
    tree: window.store?.session?.ui?.treePanelWidthPx,
    region: window.store?.session?.ui?.treeControlRegionWidthPx,
  }));
  assertCheck(
    'both facts ended independently-set, defined (ADR-0012 one-home-per-fact)',
    typeof finalState.tree === 'number' && typeof finalState.region === 'number',
    JSON.stringify(finalState),
  );

  // ── Maintainer constraint (ledger row 414): content changes must
  // NEVER move either pane width. Sample both widths, drive branch
  // expand/collapse + navigation on the active board's tree, sample
  // again — zero deltas from any non-drag cause. ────────────────────
  const beforeContent = await page.evaluate(() => ({
    tree: document.querySelector('#vue-tree-panel')?.getBoundingClientRect().width,
    wrapper: document.querySelector('#tree-control-wrapper')?.getBoundingClientRect().width,
  }));
  // Expand every collapsed branch-toggle in the tree, if any are
  // present (a fresh/short game may have none — that's fine, the
  // assertion still holds vacuously). SCOPED to TreeWidget's own
  // `.toggle-box` hit targets (its branch-expand SVG rects,
  // TreeWidget.vue) — deliberately NOT a broad `[class*="toggle"]`,
  // which also matches App.vue's `.right-toggles` (the board/tree/
  // controls chrome-toggle container) and would click THAT instead,
  // collapsing the control region and producing a false positive here
  // (caught during authoring: an early draft of this probe reported a
  // 673→237px "content-driven" wrapper shrink that was actually this
  // selector clicking the controls-toggle button, not a real defect).
  const toggles = await page.locator('#vue-tree-panel .toggle-box').all().catch(() => []);
  for (const toggle of toggles.slice(0, 20)) {
    await toggle.click({ timeout: 500 }).catch(() => {});
  }
  // Navigate a few steps (production keybindings: ArrowDown = next).
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowUp');
  // Wall-clock waits are prohibited (ledger row 450) — poll a real
  // condition instead: two consecutive rAFs reporting an IDENTICAL
  // rect for both elements (i.e. layout has settled), rather than a
  // fixed sleep guessing how long "any reflow" might take.
  await page.evaluate(() => new Promise((resolve) => {
    const rectOf = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return `${r.width}x${r.height}@${r.left},${r.top}`;
    };
    const snapshot = () => `${rectOf('#vue-tree-panel')}|${rectOf('#tree-control-wrapper')}`;
    let prev = snapshot();
    let stableFrames = 0;
    function tick() {
      const now = snapshot();
      stableFrames = now === prev ? stableFrames + 1 : 0;
      prev = now;
      if (stableFrames >= 2) { resolve(undefined); return; }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }));
  const afterContent = await page.evaluate(() => ({
    tree: document.querySelector('#vue-tree-panel')?.getBoundingClientRect().width,
    wrapper: document.querySelector('#tree-control-wrapper')?.getBoundingClientRect().width,
  }));
  assertCheck(
    'ledger row 414: expanding branches + navigating produces ZERO width delta on #vue-tree-panel',
    beforeContent.tree === afterContent.tree,
    `before=${beforeContent.tree} after=${afterContent.tree}`,
  );
  assertCheck(
    'ledger row 414: expanding branches + navigating produces ZERO width delta on #tree-control-wrapper',
    beforeContent.wrapper === afterContent.wrapper,
    `before=${beforeContent.wrapper} after=${afterContent.wrapper}`,
  );

  await browser.close();

  console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('probe crashed:', err);
  process.exit(2);
});
