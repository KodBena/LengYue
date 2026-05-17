// Node mirror of reproducer.py — same wire shape and sweep, used to
// rule out any contribution from Python/websockets in the original
// diagnosis arc. If you only want one reproducer for upstream, use
// the Python one; this is preserved as cross-stack evidence.
//
// Usage:
//     KATAGO_WS_URL=ws://host:port node reproducer_node.mjs
//
// Tested with Node 24 (built-in WebSocket; no `ws` install needed).

const WS_URL = process.env.KATAGO_WS_URL;
if (!WS_URL) {
  console.error('error: set KATAGO_WS_URL to a KataGo-protocol WS bridge');
  process.exit(2);
}

const CADENCES = [0.5, 2.0, 10.0];
const MAX_VISITS = 2_000_000;
const ANALYZE_TURNS = [39];

const MOVES = [
  ['B','D4'],['W','Q16'],['B','D17'],['W','Q4'],['B','F4'],['W','D15'],
  ['B','C15'],['W','C14'],['B','C16'],['W','D14'],['B','F17'],['W','C10'],
  ['B','R10'],['W','B4'],['B','D11'],['W','C11'],['B','C4'],['W','B5'],
  ['B','B3'],['W','C7'],['B','O3'],['W','R6'],['B','R13'],['W','R15'],
  ['B','D7'],['W','C6'],['B','C8'],['W','D8'],['B','D9'],['W','E8'],
  ['B','C9'],['W','E7'],['B','D10'],['W','B2'],['B','C3'],['W','E5'],
  ['B','F3'],['W','F15'],['B','C12'],
];

const OVERRIDE_SETTINGS = {
  reportAnalysisWinratesAs: 'WHITE',
  rootNumSymmetriesToSample: 8,
  wideRootNoise: 0.02,
};

const SWEEP = [
  0.001, 0.002, 0.005, 0.01, 0.015,
  0.02, 0.025, 0.03, 0.05, 0.1, 0.3,
];

const SETTLE_MS = 600;

function nowMs() { return performance.now(); }

async function runOne(ws, firstReportAfter, cadence, timeoutMs, handlers) {
  return new Promise((resolve) => {
    const id = `reprod-${cadence}-${firstReportAfter}-${Date.now()}`;
    const query = {
      id, moves: MOVES, analyzeTurns: ANALYZE_TURNS,
      rules: 'tromp-taylor', boardXSize: 19, boardYSize: 19, komi: 7.5,
      reportDuringSearchEvery: cadence,
      firstReportDuringSearchAfter: firstReportAfter,
      maxVisits: MAX_VISITS,
      includeOwnership: true,
      overrideSettings: OVERRIDE_SETTINGS,
    };
    let sendT0 = null, firstAt = null, firstVisits = null, timer = null;
    function finish() {
      handlers.delete(id);
      if (timer) clearTimeout(timer);
      try { ws.send(JSON.stringify({ id: `term-${Date.now()}`, action: 'terminate', terminateId: id })); } catch {}
      const dt = firstAt !== null ? (firstAt - sendT0) : null;
      const expected = firstReportAfter * 1000;
      const pct = (firstReportAfter / cadence) * 100;
      const cadMs = cadence * 1000;
      const pinned = dt !== null && dt > cadMs * 0.8 && dt < cadMs * 1.2;
      const tag = dt === null ? 'NO-PACKET' : pinned ? '≈ CADENCE' : 'fast';
      console.log(
        `  firstReportAfter=${String(firstReportAfter).padStart(6)}s (${pct.toFixed(2).padStart(5)}% of cadence)  →  ` +
        `first @ +${String(dt !== null ? dt.toFixed(0) : '---').padStart(5)} ms  ` +
        `(ratio ${dt !== null ? (dt / expected).toFixed(1).padStart(5) : ' n/a'}x)  ` +
        `visits=${String(firstVisits ?? '---').padStart(7)}  [${tag}]`
      );
      resolve();
    }
    handlers.set(id, (msg) => {
      if ('error' in msg) { console.error('  error:', msg.error); finish(); return; }
      if (firstAt === null) {
        firstAt = nowMs();
        firstVisits = msg.rootInfo?.visits ?? null;
        finish();
      }
    });
    sendT0 = nowMs();
    ws.send(JSON.stringify(query));
    timer = setTimeout(finish, timeoutMs);
  });
}

async function main() {
  console.log(`[reproducer-node] connecting to ${WS_URL}`);
  const ws = new WebSocket(WS_URL);
  const handlers = new Map();
  ws.addEventListener('message', (event) => {
    let msg; try { msg = JSON.parse(event.data); } catch { return; }
    const h = handlers.get(msg.id); if (h) h(msg);
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  console.log('[reproducer-node] ws open\n');

  for (const cadence of CADENCES) {
    console.log(`=== cadence = ${cadence}s ===`);
    const timeoutMs = Math.max(cadence * 1.3 * 1000 + 500, 1500);
    for (const v of SWEEP) {
      if (v >= cadence) continue;
      await runOne(ws, v, cadence, timeoutMs, handlers);
      await new Promise(r => setTimeout(r, SETTLE_MS));
    }
    console.log();
  }
  console.log('[reproducer-node] done; closing');
  ws.close();
}

main().catch((e) => { console.error('fatal:', e); process.exit(1); });
