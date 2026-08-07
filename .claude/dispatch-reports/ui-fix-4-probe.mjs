#!/usr/bin/env node
/**
 * .claude/dispatch-reports/ui-fix-4-probe.mjs
 *
 * Acceptance probe for Defect 4 (tab-strip close button clipped by
 * `.thumb-list`'s scroll/clip box — ui-defects-investigation.md, Defect 4;
 * fix in frontend/src/components/board/BoardTab.vue and
 * frontend/src/components/chrome/SidebarWidget.vue).
 *
 * Opens the running app, seeds >20 boards (so the virtualized rail actually
 * windows), then scrolls `.thumb-list` through a spread of positions —
 * including scrollTop values that land a tab EXACTLY flush against the
 * container's own top edge (the case that clips even when the tab body
 * itself is 100% visible) — and at each position measures the bounding
 * rect of the currently topmost visible tab's `.close-board-btn` against
 * `.thumb-list`'s own rect, asserting `btnRect.top >= listRect.top`.
 *
 * IMPORTANT — environment note (mirrors the investigation report): the only
 * long-running server on this host at probe-authoring time is `vite preview`
 * on http://127.0.0.1:4173, serving the PRE-FIX production bundle (the build
 * predates this session's BoardTab.vue / SidebarWidget.vue edits). This
 * script is safe to run against it to verify the PROBE ITSELF is sound
 * (finds the elements, measures rects, produces a pass/fail readout) — a run
 * against the pre-fix bundle is expected to FAIL the clippedTop assertion
 * for at least one scroll position, which confirms the probe is a live
 * guard and not a vacuously-passing one. The post-fix assertion (does the
 * fix actually close the gap) requires a fresh `npm run build && npm run
 * preview` picking up this session's source changes; this script does not
 * rebuild or restart any server itself (out of scope per the fix-agent
 * brief) — that leg is UNEXERCISED here, blocked on: no rebuild/restart of
 * the 4173 preview was performed this session.
 *
 * Usage:
 *   node .claude/dispatch-reports/ui-fix-4-probe.mjs [--url http://127.0.0.1:4173]
 *
 * Requires `playwright-core` (already a frontend devDependency) and a
 * reachable Chromium — run from `frontend/` so the workspace resolves it,
 * e.g.: `cd frontend && node ../.claude/dispatch-reports/ui-fix-4-probe.mjs`.
 *
 * License: Public Domain (The Unlicense)
 */
import { chromium } from 'playwright-core';

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? fallback : argv[i + 1];
}
const url = flag('url', 'http://127.0.0.1:4173');
const boardCount = Number(flag('boards', '25')); // >20 per the acceptance check

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const results = [];
  let boardsCreated = 0;

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

    // Seed boards via the sidebar's own "+" affordance (`.tab-add-btn`) — the
    // same in-app path a user takes, not a store-internal shortcut, so the
    // probe exercises the real virtualization wiring end-to-end.
    const addBtn = page.locator('.tab-add-btn');
    if ((await addBtn.count()) === 0) {
      throw new Error('`.tab-add-btn` not found — is this the LengYue SPA at the given --url?');
    }
    for (let i = 0; i < boardCount; i++) {
      await addBtn.click();
      boardsCreated++;
    }
    await page.waitForTimeout(200); // let the virtual-list mount/measure settle

    const listHandle = page.locator('.thumb-list');
    if ((await listHandle.count()) === 0) {
      throw new Error('`.thumb-list` not found after seeding boards.');
    }

    // scrollHeight tells us the real range to sweep.
    const { scrollHeight, clientHeight } = await listHandle.evaluate((el) => ({
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    }));
    const maxScroll = Math.max(0, scrollHeight - clientHeight);

    // Measured (not hardcoded) tab height, so the "flush" target set below
    // is correct against WHATEVER build this runs against (pre-fix h=46,
    // post-fix h=52) rather than assuming one or the other.
    const tabHeight = await page.evaluate(() => {
      const el = document.querySelector('.thumb-container');
      return el ? el.getBoundingClientRect().height : 46;
    });

    // Sweep two distinct kinds of scrollTop values, because they exercise
    // different (and differently-diagnostic) geometry:
    //   - ALIGNED (k * tabHeight): a tab sits perfectly FLUSH at the
    //     container's own top edge — 0px of the tab's own body is clipped.
    //     This is the actual bug: `scrollToIndex` in SidebarWidget.vue
    //     snaps to exactly these positions when a board is activated, so
    //     every board hits this at least once in normal use. A tab whose
    //     body is 100% visible but whose button still clips is the defect;
    //     these are the positions the assertion below is really about.
    //   - NON-ALIGNED (in-between): the topmost tab is naturally partway
    //     scrolled off — its own body is already partially clipped, so its
    //     button (which sits even further above the body) being invisible
    //     too is ordinary scrolling, not the bug. Sampled anyway and
    //     reported separately (not asserted on) so the full geometry is
    //     visible in the readout without conflating the two cases.
    const targets = new Map(); // scrollTop -> 'aligned' | 'mid-scroll'
    targets.set(0, 'aligned');
    for (let t = tabHeight; t <= maxScroll; t += tabHeight) targets.set(Math.round(t), 'aligned');
    for (let frac = 0.15; frac < 1; frac += 0.2) {
      const t = Math.round(maxScroll * frac);
      if (!targets.has(t)) targets.set(t, 'mid-scroll');
    }
    if (!targets.has(maxScroll)) targets.set(maxScroll, 'aligned');

    for (const [target, kind] of [...targets.entries()].sort((a, b) => a[0] - b[0])) {
      await listHandle.evaluate((el, t) => { el.scrollTop = t; }, target);
      await page.waitForTimeout(80); // rAF-coalesced scroll handler + repaint

      const measurement = await page.evaluate(() => {
        const list = document.querySelector('.thumb-list');
        if (!list) return null;
        const listRect = list.getBoundingClientRect();
        // The topmost visible tab: the first `.thumb-container` whose
        // bottom edge is below the list's own top edge (i.e., not yet
        // fully scrolled past) — mirrors the report's own live-measurement
        // approach.
        const tabs = [...document.querySelectorAll('.thumb-container')];
        const topmost = tabs.find((el) => el.getBoundingClientRect().bottom > listRect.top);
        if (!topmost) return { listTop: listRect.top, noTabsVisible: true };
        const btn = topmost.querySelector('.close-board-btn');
        if (!btn) return { listTop: listRect.top, noCloseButton: true };
        const btnRect = btn.getBoundingClientRect();
        const tabRect = topmost.getBoundingClientRect();
        return {
          listTop: listRect.top,
          btnTop: btnRect.top,
          tabFlush: Math.abs(tabRect.top - listRect.top) < 0.5, // 0px of the tab body itself clipped
          clippedTop: btnRect.top < listRect.top,
        };
      });

      results.push({ scrollTop: target, kind, ...measurement });
    }
  } finally {
    await browser.close();
  }

  // Only 'aligned' positions are asserted on: those are where a tab sits
  // flush (0px of its own body clipped) at the container's top edge — the
  // scrollToIndex-snap state a real user reaches by activating any board.
  // 'mid-scroll' positions are ordinary in-flight scrolling (the topmost
  // tab's own body is already partially cut), reported for visibility but
  // not a defect if their button also clips — that is normal scroll
  // clipping, not the bug this probe targets.
  const alignedResults = results.filter((r) => r.kind === 'aligned');
  const failures = alignedResults.filter((r) => r.clippedTop);
  console.log(`Probe against ${url} — ${boardsCreated} boards created, ${results.length} scroll positions sampled (${alignedResults.length} tab-flush/aligned, asserted; ${results.length - alignedResults.length} mid-scroll, informational only).`);
  for (const r of results) {
    const status = r.clippedTop ? (r.kind === 'aligned' ? 'CLIPPED (defect)' : 'clipped (expected, mid-scroll)') : 'ok';
    console.log(`  scrollTop=${String(r.scrollTop).padStart(6)}  [${r.kind}]  listTop=${r.listTop?.toFixed(2)}  btnTop=${r.btnTop?.toFixed(2)}  ${status}`);
  }
  if (failures.length > 0) {
    console.log(`\nFAIL: ${failures.length}/${alignedResults.length} tab-flush scroll positions clip the topmost tab's close button (btnRect.top < listRect.top).`);
    process.exitCode = 1;
  } else {
    console.log(`\nPASS: btnRect.top >= listRect.top held at all ${alignedResults.length} sampled tab-flush scroll positions.`);
  }
}

main().catch((err) => {
  console.error('Probe errored:', err);
  process.exitCode = 2;
});
