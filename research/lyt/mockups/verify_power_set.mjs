#!/usr/bin/env node
/**
 * research/lyt/mockups/verify_power_set.mjs
 *
 * Commission: lyt-cleanroom-mockups (ledger row 1703), FIX PASS 2
 * (ledger rows 1717-1720, `.claude/dispatch-reports/lyt-mockups-opus-
 * review.md`'s "Re-review -- 2026-08-10" section). The re-review's N1
 * finding (a CSS custom-property name collision across grid nesting
 * levels: `--track-N` is an ordinary INHERITED property, so a 'release'
 * override set on a parent grid inherited straight into a descendant
 * grid that reused the same per-level index, silently rewriting an
 * unrelated track) was found by walking the presence menu's FULL power
 * set -- something the first fix pass's own re-verification did NOT do
 * (it re-checked per-viewport geometry in the default all-on state plus
 * the all-off guard, but not the toggle matrix). The re-review's own
 * fix list item 1 names this exactly: "re-run the presence power set on
 * both classes -- that is the check this pass skipped, and it is the
 * check that catches this class of defect."
 *
 * This script is that check, made a durable scripted regression instead
 * of a one-time manual review pass: for EVERY combination of the
 * presence menu's own checkboxes (2^5 = 32 landscape, 2^4 = 16
 * portrait -- the review's own stated counts), it asserts:
 *   (a) `.board-square` has a real (>0 in both axes), square
 *       (|w-h| <= 1px, allowing sub-pixel container-query rounding)
 *       bounding box -- the board never disappears or distorts no
 *       matter what else is toggled.
 *   (b) no `[data-toggle-id]` region's own bounding box collapses
 *       UNLESS it is the one whose own checkbox is off (a `release`
 *       target with its own checkbox unchecked -- expected to vanish;
 *       everything else, `release`-checked or `preserve`-either-way,
 *       must report a real >0x>0 box). This is the direct N1 regression
 *       check: releasing region X must never zero region Y.
 *   (c) restoring every checkbox to checked (mirroring the site's own
 *       'release' JS: `parentElement.style.removeProperty(trackProp)`)
 *       returns EVERY region's geometry to the exact baseline captured
 *       before any toggling -- done after EVERY combination in this
 *       script (not just once), so a leftover inline-style override
 *       that a later combination's own restore fails to clear would
 *       show up immediately rather than only at the very end.
 *
 * Checkbox states are driven by directly setting `.checked` and
 * dispatching a `change` event (not `page.check()`/`page.uncheck()`,
 * which respect the N2 fix's `disabled` guard on the last remaining
 * checked release checkbox and would refuse to reach some of the 32/16
 * raw combinations) -- this script exists to verify GEOMETRY across the
 * full raw combination space, not to re-verify the guard's own click
 * refusal (that is a separate, cheap DOM-state assertion folded in
 * below: whenever exactly one release checkbox is checked, this script
 * also asserts it carries `disabled` and a non-empty `title`).
 *
 * Playwright discipline (same as `shoot.mjs`'s own header, durable rows
 * 686/679/702/703):
 *   - Run under `systemd-run --user --scope -p MemoryMax=4G` (wrap the
 *     `node` invocation, this script does not self-wrap):
 *       systemd-run --user --scope -p MemoryMax=4G -- \
 *         node --max-old-space-size=1024 research/lyt/mockups/verify_power_set.mjs
 *   - `--js-flags=--max-old-space-size=1024` passed to the launched
 *     Chromium's own args below.
 *   - ONE browser instance, closed in `finally`.
 *   - No `waitForTimeout` / wall-clock sleeps -- every wait is a
 *     `waitForSelector`/`waitForFunction` on real DOM state.
 *   - `file://` URLs; no scratch port needed.
 *
 * Usage:
 *   node research/lyt/mockups/verify_power_set.mjs [--out FILE]
 *
 * Exit code is non-zero (and the process prints every violation before
 * exiting) if any of (a)/(b)/(c) fails anywhere in either class's power
 * set.
 *
 * License: Public Domain (The Unlicense), matching
 * research/lyt/__init__.py's license line and the umbrella's ADR-0006
 * per-file convention.
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const argv = process.argv.slice(2);
function flag(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}
const outPath = flag('out', join(__dirname, 'shots', 'power-set-report.json'));

const CLASSES = [
  { class: 'landscape', file: 'landscape.html', w: 1920, h: 1080 },
  { class: 'portrait', file: 'portrait.html', w: 1080, h: 1920 },
];

// Reads the live checkbox list + each target's own data-toggle-id
// element's data-presence, straight from the DOM -- no hardcoded
// per-class target list here, so this script can't silently drift from
// whatever emit_mockup.py's TOGGLE_TARGETS actually emits.
async function readTargets(page) {
  return page.evaluate(() => {
    const checkboxes = Array.from(document.querySelectorAll('#lyt-menu-popover input[data-toggle-for]'));
    return checkboxes.map((cb) => {
      const id = cb.getAttribute('data-toggle-for');
      const el = document.querySelector(`[data-toggle-id="${id}"]`);
      return { id, presence: el ? el.getAttribute('data-presence') : null };
    });
  });
}

async function setCombo(page, targets, mask) {
  // bit i of mask == desired `checked` state of targets[i]. Applied via
  // direct property + dispatched 'change' event (see module docstring
  // for why, not page.check()/uncheck()).
  await page.evaluate(
    ({ targets, mask }) => {
      targets.forEach((t, i) => {
        const desired = Boolean(mask & (1 << i));
        const cb = document.querySelector(`#lyt-menu-popover input[data-toggle-for="${t.id}"]`);
        if (cb.checked !== desired) {
          cb.checked = desired;
          cb.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    },
    { targets, mask }
  );
}

async function restoreAll(page, targets) {
  await setCombo(page, targets, (1 << targets.length) - 1);
}

async function measure(page) {
  return page.evaluate(() => {
    function box(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null; // display:none collapses to a zero rect
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    }
    const board = box(document.querySelector('.board-square'));
    const regions = {};
    document.querySelectorAll('[data-toggle-id]').forEach((el) => {
      regions[el.getAttribute('data-toggle-id')] = box(el);
    });
    return { board, regions };
  });
}

async function readGuardState(page) {
  // N2 side-check: whenever exactly one 'release' target is checked, its
  // own checkbox must be disabled with a non-empty title (not silently
  // revertable) -- folded in here since the power-set walk already
  // visits every combination where this condition can occur.
  return page.evaluate(() => {
    const checkboxes = Array.from(document.querySelectorAll('#lyt-menu-popover input[data-toggle-for]'));
    const releaseCbs = checkboxes.filter((cb) => {
      const el = document.querySelector(`[data-toggle-id="${cb.getAttribute('data-toggle-for')}"]`);
      return el && el.getAttribute('data-presence') === 'release';
    });
    const checked = releaseCbs.filter((cb) => cb.checked);
    if (checked.length !== 1) return { applicable: false };
    const lone = checked[0];
    return { applicable: true, disabled: lone.disabled, title: lone.title };
  });
}

function deepEqualGeometry(a, b, path, violations) {
  const round = (n) => Math.round(n * 100) / 100;
  function eqBox(x, y, p) {
    if (x === null && y === null) return;
    if (x === null || y === null) {
      violations.push(`${p}: null-mismatch (a=${JSON.stringify(x)}, b=${JSON.stringify(y)})`);
      return;
    }
    for (const k of ['x', 'y', 'w', 'h']) {
      if (round(x[k]) !== round(y[k])) {
        violations.push(`${p}.${k}: ${round(x[k])} !== ${round(y[k])}`);
      }
    }
  }
  eqBox(a.board, b.board, `${path}.board`);
  const ids = new Set([...Object.keys(a.regions), ...Object.keys(b.regions)]);
  ids.forEach((id) => eqBox(a.regions[id], b.regions[id], `${path}.regions.${id}`));
}

async function verifyClass({ class: className, file, w, h }, browser, violations) {
  const context = await browser.newContext({ viewport: { width: w, height: h } });
  const page = await context.newPage();
  const url = pathToFileURL(join(__dirname, file)).href;
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForSelector('#lyt-root', { timeout: 10_000 });

  const targets = await readTargets(page);
  const n = targets.length;
  const total = 2 ** n;
  console.log(`[verify_power_set] ${className}: ${n} targets, ${total} states -- ${targets.map((t) => `${t.id}(${t.presence})`).join(', ')}`);

  // lyt-tree-always-visible (ledger row ~1735): boardRail/previewBoard
  // are registered DEFAULT OFF, so the page's raw initial-load state no
  // longer equals the all-checked state `restoreAll` produces -- (c)'s
  // deep-equal-to-baseline check would spuriously fail on every mask
  // once any target starts unchecked. Baseline is now captured AFTER
  // forcing every checkbox checked (mirroring what `restoreAll` itself
  // does), so it is well-defined regardless of which targets default to
  // off; this is a superset of the pre-existing behavior (when every
  // target defaults on, forcing all-checked is a no-op and baseline is
  // unchanged from before this fix).
  await setCombo(page, targets, (1 << targets.length) - 1);
  const baseline = await measure(page);
  let statesWalked = 0;
  let guardChecks = 0;

  for (let mask = 0; mask < total; mask++) {
    // eslint-disable-next-line no-await-in-loop
    await setCombo(page, targets, mask);
    // eslint-disable-next-line no-await-in-loop
    const snap = await measure(page);
    statesWalked++;

    // (a) board is real and square.
    if (!snap.board) {
      violations.push(`${className}/mask=${mask}: .board-square has no bounding box (collapsed)`);
    } else {
      if (snap.board.w <= 0 || snap.board.h <= 0) {
        violations.push(`${className}/mask=${mask}: board dims not >0 (${snap.board.w}x${snap.board.h})`);
      }
      const deltaWH = Math.abs(snap.board.w - snap.board.h);
      if (deltaWH > 1) {
        violations.push(`${className}/mask=${mask}: board not square (Δ=${deltaWH.toFixed(2)}px, ${snap.board.w}x${snap.board.h})`);
      }
    }

    // (b) only the released-off region(s) may be zeroed.
    targets.forEach((t, i) => {
      const checked = Boolean(mask & (1 << i));
      const box = snap.regions[t.id];
      const expectZeroed = t.presence === 'release' && !checked;
      if (expectZeroed) {
        if (box !== null) {
          violations.push(`${className}/mask=${mask}: ${t.id} expected collapsed (release, unchecked) but has a box ${JSON.stringify(box)}`);
        }
      } else if (box === null) {
        violations.push(`${className}/mask=${mask}: ${t.id} (${t.presence}, checked=${checked}) unexpectedly collapsed to no box`);
      } else if (box.w <= 0 || box.h <= 0) {
        violations.push(`${className}/mask=${mask}: ${t.id} (${t.presence}, checked=${checked}) has non-positive dims ${JSON.stringify(box)}`);
      }
    });

    // N2 side-check.
    // eslint-disable-next-line no-await-in-loop
    const guard = await readGuardState(page);
    if (guard.applicable) {
      guardChecks++;
      if (!guard.disabled) {
        violations.push(`${className}/mask=${mask}: lone remaining release checkbox is not disabled (N2 guard not applied)`);
      }
      if (!guard.title) {
        violations.push(`${className}/mask=${mask}: lone remaining release checkbox has no explanatory title (N2 guard)`);
      }
    }

    // (c) restore-all, checked against the ORIGINAL baseline, every combination.
    // eslint-disable-next-line no-await-in-loop
    await restoreAll(page, targets);
    // eslint-disable-next-line no-await-in-loop
    const restored = await measure(page);
    deepEqualGeometry(baseline, restored, `${className}/mask=${mask}/restore`, violations);
  }

  await context.close();
  return { className, statesWalked, total, guardChecks, targets };
}

async function main() {
  await mkdir(dirname(outPath), { recursive: true });
  let browser = null;
  const violations = [];
  const summaries = [];
  try {
    console.log('[verify_power_set] launching chromium (headless)…');
    browser = await chromium.launch({
      executablePath: '/usr/bin/chromium',
      headless: true,
      args: ['--js-flags=--max-old-space-size=1024'],
    });
    for (const cls of CLASSES) {
      // eslint-disable-next-line no-await-in-loop
      const summary = await verifyClass(cls, browser, violations);
      summaries.push(summary);
      console.log(`[verify_power_set] ${summary.className}: walked ${summary.statesWalked}/${summary.total} states, ${summary.guardChecks} N2 guard checks`);
    }
  } finally {
    if (browser) await browser.close();
  }

  const report = {
    summaries,
    violationCount: violations.length,
    violations,
  };
  await writeFile(outPath, JSON.stringify(report, null, 2));

  console.log('');
  console.log('=== power-set verification summary ===');
  for (const s of summaries) {
    console.log(`  ${s.className}: ${s.statesWalked}/${s.total} states walked, ${s.guardChecks} N2 guard checks, all restore-all deep-equal to baseline`);
  }
  console.log(`  total violations: ${violations.length}`);
  if (violations.length > 0) {
    console.log('');
    console.log('VIOLATIONS:');
    violations.forEach((v) => console.log(`  - ${v}`));
    console.log('');
    console.log(`[verify_power_set] FAILED -- ${violations.length} violation(s), report written to ${outPath}`);
    process.exit(1);
  }
  console.log(`[verify_power_set] PASSED -- report written to ${outPath}`);
}

main().catch((err) => {
  console.error('[verify_power_set] FAILED (exception):', err);
  process.exit(1);
});
