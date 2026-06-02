# Opus consult — perf-capture automation: design-space grounding

**Date:** 2026-06-01.
**Genre:** Survey / grounding. NOT a decision. The deliverable scores the
options, recommends a direction with a concrete first step, and is explicit
that the maintainer chooses.
**Context:** A perf-capture run today is a manual rigamarole (F12 → resize
DevTools to a sliver → move above the toolbar → connect → clear engine cache →
purge analysis → warm-cache via one autonav → navigate back → start popover →
analyze → record → autonav → stop), plus a vite restart and Firefox-tab close
each run to defend against a stale SPA bundle. A prior survey found the in-app
half ~60% built (`useAutoNavigatePerf` / `useAutoPopoverPerf`). This doc grounds
the maintainer — a principal engineer, not a browser-automation expert — in the
full design space before he picks a direction.
**Saved for auditability** per standing practice (conversation context is not
durable across sessions). Verified-vs-asserted is flagged inline throughout;
the load-bearing-claims table is at the end.

The maintainer's governing principle frames every tradeoff below:
**"performance is a consequence of infrastructural excellence; no hacks for
speed; tacky code is worse than tacky perf."** The relevant corollary for
automation: a capture pipeline must be *clean durable infrastructure*, not a
brittle screen-scraper. This is a single-maintainer project (bus factor 1), so
**low bespoke-maintenance burden** and **portability as a code-hygiene signal**
weigh heavily — a path that needs constant re-fitting against browser-version
drift is disqualifying even if it works today.

---

## 0. What the codebase actually has today (verified against source)

Before surveying external tooling, here is the *verified* current state — read
end to end, not asserted from the prior survey.

### 0.1 The in-app stimulus + marker layer (~60% is accurate)

- **`src/composables/useAutoNavigatePerf.ts`** — dev-gated (`import.meta.env.DEV`
  at the Toolbar call site). On `start()` it normalises the scenario
  (`store.session.ui.activeTab = 'analysis'`, forces the Basic sub-tab via
  `__devForceActiveAnalysisTab('basic')`), then rAF-drives `useNavigation().next()`
  on a fixed-timestep accumulator pinned to `TARGET_NAV_HZ = 60` (refresh-rate
  independent) until `atLastNode()`. Emits `performance.mark('autonav:start')`,
  one `performance.mark('autonav:step', { detail })` per navigation (the detail
  carries a monotonic `step` index — the keydown-index analog — plus the live
  analysis-queue partition: `queryOnCurrentBoard` / `queryOnOtherBoard` /
  `activeQueryCount` / `queryKinds`), and `autonav:end`. Releases the forced
  sub-tab in `stop()` and in `onUnmounted` (resource-ownership discipline,
  honoured). `summarizeAnalysisQueue` is extracted as a pure, unit-testable unit.
- **`src/composables/useAutoPopoverPerf.ts`** — the popover-stress analog. Drives
  `__devForcePopoverOpen(targetId)` on a 250 ms half-period (≈2 toggles/sec),
  emitting `popover:open` / `popover:close` / `popover:stress-start` /
  `popover:stress-end` marks with the same queue-partition detail. Same
  onUnmounted release discipline.
- **`src/components/chrome/Toolbar.vue`** — wires three dev-gated buttons
  (`v-if="isDevBuild"`): CLEAR CACHE (`useEngineControls().clearCache`),
  auto-nav toggle, popover-stress toggle. All three dead-code-eliminate in prod
  (`import.meta.env.DEV` statically folded).
- **`src/main.ts`** — `app.config.performance = true` (DEV only) → Vue emits
  per-component `render` / `patch` / setup / unmount UserTiming marks. Also
  `window.store` and `window.Writer` dev globals (an automation foothold — see §2).

### 0.2 The affordances a runner would chain

- **Clear engine cache** — `useEngineControls().clearCache()` →
  `analysisService.clearCache()` sends the `clear_cache` action (broadcasts to
  all healthy upstreams on a SELECTOR proxy, verified v1.0.27). The service's
  own docstring carries the load-bearing caveat: `clear_cache` clears the
  *upstream engine* cache, NOT the proxy's analysis *replay* cache — so a true
  cold capture needs `lookup_cache` **off**, else the proxy replays a stored
  stream and silently warms a nominally-cold capture. The success
  `pushSystemMessage` is a `warning` (not `info`) when `lookup_cache` is on.
- **Purge analysis data** — `AnalysisControls.vue` `purgeLedger()`, gated by a
  `confirm()` dialog: `analysisService.stopBoardAnalysis(boardId)` then
  `ledger.purgeBoard(boardId)`. The `confirm()` is the single hardest step for
  any out-of-page driver to handle gracefully (native dialog, not DOM).
- **Connect / analyze / autonav** — all reachable via store mutations,
  `analysisService` methods, and the existing harness `start()`.

### 0.3 The analysis pipeline (the consumer the capture must feed)

- **`@firefox-devtools/profiler-cli`** (v0.2.1 latest — *verified* via npm
  registry). It is **analysis-only**: `load <file|https-URL>`, `profile info`,
  `thread markers` (+ `--list`, `--search`), `marker stack`, `thread samples`,
  `thread page-load`, etc., over a persistent daemon. **There is no record /
  start / capture command** — *verified* against the package README. It expects
  the Firefox Profiler (Gecko) profile JSON format.
- **The marker vocabulary the analysis depends on**: Vue `render`/`patch` marks
  (ADR-0009 ranks components by *both*, render≫patch ⇒ render-coupling — the
  2026-05-31 green-arc lesson), the harness `autonav:*` / `popover:*` marks, and
  the ad-hoc `rb3:handler` / `rb3:firstBump` `performance.measure` marks in
  `analysis-service.ts` / `analysis-ledger.ts` (DEV-gated). All are UserTiming
  (`performance.mark` / `performance.measure`).
- **Normalization protocol** (`docs/notes/perf-capture-normalization-protocol.md`):
  compare per-keydown / per-frame medians (`RefreshDriverTick` p50,
  `requestAnimationFrame callbacks` p50), *never* whole-capture totals; the
  `autonav:step` index is the fixed-window clip axis. Profiles land in
  `~/perf-profiles/` (ADR-0009 convention; never committed).

### 0.4 What is genuinely NOT mechanised today

Exactly two things, per the normalization note's own "what it does not
mechanize" section:

1. **The profiler record / stop** (still a manual click).
2. **The record→focus offset** at the front of the capture window (the harness
   tightens but does not eliminate it — the human still clicks record, then
   clicks the autonav button).

Everything else in the rigamarole is *already scriptable in-page* — it is the
out-of-page steps (DevTools chrome manipulation, the profiler arm, the native
`confirm()`) that the manual ritual exists for. This is the crux the survey
below organises around.

---

## 1. Framing: the rigamarole decomposed into automatable layers

The manual ritual is not one problem; it is three, with different solutions:

| Layer | Steps it covers | Where it can be automated |
|---|---|---|
| **A. In-page stimulus** | clear cache, purge, warm autonav, reset, analyze, autonav-to-leaf, popover stress | **In-app composable** — `window`-exposed, or a `useCaptureScenario` runner. No driver needed. |
| **B. Browser orchestration** | launch fresh, navigate to URL, defeat stale bundle, click the in-page buttons, dismiss `confirm()` | **Browser driver** — Playwright / Puppeteer / CDP / Selenium / xdotool |
| **C. Profiler arm/disarm** | record → … → stop, export the profile to a file the analysis pipeline reads | **The genuinely hard one** — see §4 |

The decomposition matters because the *cheapest large win* is Layer A (pure
in-page, zero new external dependency, composes with the existing harness idiom)
and the *only genuinely open problem* is Layer C. Layer B is a solved space with
a clear winner; the question there is which tool, not whether.

---

## 2. Layer A — the in-app scenario runner (`useCaptureScenario`)

### 2.1 What it is and how it works

A dev-gated composable that chains the existing affordances into one programmatic
sequence, bracketed by `performance.mark`/`measure`, so that "the whole scenario"
is a single function call rather than seven manual clicks. It is the natural
generalisation of `useAutoNavigatePerf` — same idiom, same DEV gate, same marker
discipline, same `onUnmounted` resource release. Shape:

```
async function runCaptureScenario(opts): Promise<void>
  performance.mark('scenario:start')
  await engineControls.connect()            // if not connected; await 'connected'
  await analysisService.clearCache()         // cold the upstream (lookup_cache must be off)
  ledger.purgeBoard(boardId)                 // purge WITHOUT the confirm() — see below
  performance.mark('scenario:warm-start')
  await autonav.runToLeaf()                  // warm pass (resolves a Promise on autonav:end)
  navigation.toStart()                       // reset to root
  performance.mark('scenario:measure-start')
  analysisService.analyzeRange(...)          // or analyzeActiveNode — arm the analysis
  await autonav.runToLeaf()                  // the measured pass
  performance.mark('scenario:end')
```

Two concrete refactors it implies, both clean and small:

- **`useAutoNavigatePerf.start()` should resolve a Promise on `autonav:end`** (or
  expose an `onComplete` callback). Today it is fire-and-forget; a runner needs
  to `await` the leaf. This is a pure additive change — the rAF loop already
  knows when it stops.
- **A purge path that skips the `confirm()`** for programmatic use. The
  `confirm()` in `purgeLedger()` is correct UX for the human button, but a
  runner should call `analysisService.stopBoardAnalysis` + `ledger.purgeBoard`
  directly (both are already public). This is *not* a hack — it is calling the
  underlying operations the button wraps, the same way a test would. It also
  removes the single worst out-of-page obstacle (see §3 on `confirm()`).

The runner is exposed on `window` in DEV (matching the existing `window.store` /
`window.Writer` foothold) so that any Layer-B driver can invoke the entire
scenario with one `page.evaluate(() => window.__perfScenario.run())`.

### 2.2 Pros

- **Largest coverage-per-effort of any single option.** It collapses six of the
  ~ten manual steps into one call, with zero new external dependency and no new
  failure surface outside the SPA's own code.
- **Maximally faithful to ADR-0009 and the marker discipline.** It *is* the
  marker layer; it emits exactly the `scenario:*` / `autonav:*` brackets the
  `profiler-cli` analysis already consumes. The normalization protocol's
  fixed-window clip becomes trivial (`scenario:measure-start` → `scenario:end`).
- **It is the "infrastructural excellence" answer.** It moves the scenario from
  "a ritual in the maintainer's head" to "a typed, tested, version-controlled
  composable" — exactly the posture the project's perf-is-a-consequence
  principle wants. It composes with the existing `summarizeAnalysisQueue` pure
  unit and is itself unit/integration-testable (Tier 3 against fakes).
- **Zero bus-factor cost.** It is Vue + TypeScript the maintainer already owns;
  nothing to keep in sync with an external tool's version churn.

### 2.3 Cons

- **It cannot arm the profiler** (Layer C). This is the hard limit: a composable
  runs *inside* the page; the Firefox/Chrome DevTools profiler runs *outside* it.
  An in-page scenario can emit a `scenario:measure-start` marker, but it cannot
  press "record." (The one exception is the JS Self-Profiling API — §4.2 — which
  *is* in-page, but produces a different, non-Gecko format.)
- **It does not, by itself, defeat the stale-bundle superstition** (§5) or the
  DevTools-chrome manipulation. Those are Layer B.
- **Async sequencing requires care.** "Await the analysis settling" is not the
  same as "await a fixed timeout" — the runner must key off real signals
  (`store.engine.status === 'connected'`, `autonav:end`, a packet-arrival
  predicate) rather than `setTimeout`, or it reintroduces the variable-framing
  confound ADR-0009 warns against. This is honest engineering work, not a hack,
  but it is the part most likely to be fiddly.

### 2.4 Interaction with project discipline

Strongly positive. It extends the existing `useAutoNavigatePerf` idiom verbatim,
honours the resource-ownership-at-mutation-sites discipline (every forced override
released in `onUnmounted`), respects the FILES.md/band conventions (it is a `[B?]`
or game-tree-coupled `[B2]` composable, dev-only), and the magic-literals it
introduces (cadences, the warm-vs-measure split) reference the same substrate
tokens the existing harness does. ADR-0009's "no perf *claim*" posture holds — it
is the capture harness, not a measured result.

### 2.5 Headless / CI viability

Partial: the runner works headless *if* something invokes it (Layer B). On its
own it is a foothold, not an end-to-end pipeline. But it is the foothold that
makes every other shape cheap — a `window.__perfScenario` is one `page.evaluate`
away from any driver.

---

## 3. Layer B — the browser-driver layer

These automate the *out-of-page* steps: launch a fresh browser, navigate, defeat
the stale bundle, click the dev buttons (or call `window.__perfScenario`), dismiss
the native `confirm()`. The key realisation: **once the in-app runner exists, the
driver's job shrinks to "launch fresh + invoke one function + dismiss one dialog +
(maybe) arm the profiler."** That dramatically changes the brittleness calculus —
most of these drivers are brittle *because* people use them to click through a UI;
calling one `page.evaluate` is not brittle.

### 3.1 Playwright

**What it is.** A browser-automation framework (Microsoft) driving Chromium,
Firefox, and WebKit through one API. For Chromium it speaks CDP (see §3.3); for
Firefox and WebKit it ships *patched* browser builds speaking a Playwright-custom
protocol (Firefox: "Juggler"). *Verified:* Playwright contributes a
CDP-*compatible* layer to Firefox/WebKit, but **native CDP connection is
Chromium-only** — Firefox does not expose CDP through Playwright.

**What it automates of the rigamarole.** Everything in Layer B: `browser.newContext()`
gives a fresh, isolated profile each run (no stale state); `page.goto(url)` with
cache disabled (`context` with `bypassCSP` / route interception, or CDP
`Network.setCacheDisabled` on Chromium) defeats the stale bundle *without a vite
restart*; `page.evaluate(() => window.__perfScenario.run())` fires the in-app
runner; `page.on('dialog', d => d.accept())` dismisses the `confirm()` cleanly
(this is the idiomatic Playwright dialog handler — far better than the
out-of-process drivers, which cannot see a native dialog at all).

**Eliminating the stale-bundle superstition.** A fresh `browser.newContext()` has
an empty cache by construction, and on Chromium `Network.setCacheDisabled(true)`
(via a CDP session, §3.3) guarantees no disk-cache reuse. This is the *correct*
fix for the superstition (§5) — durable, not ritual.

**Pros.** Cross-browser by design (the maintainer profiles in both Firefox and
Chrome — Playwright is the only driver that drives both). Excellent dialog/native
handling. Already available locally (an ad-hoc Python+Firefox install was used for
prior responsive audits). First-class `page.evaluate` makes the
"invoke the in-app runner" path trivial and robust. Auto-waiting reduces the
flaky-timeout failure mode.

**Cons.** For the **profiler arm** specifically, Playwright-Firefox is a dead end:
it does not expose CDP, so `browser.startTracing` (which is Chromium-only anyway)
is unavailable, and there is no Playwright API for `Services.profiler` (§4.3).
Playwright-*Chromium* can drive CDP Tracing (§3.3, §4.4), but then you are
capturing a *Chrome* trace, with the format-bridge question of §4.4. So Playwright
solves Layer B beautifully and leaves Layer C exactly where §4 leaves it.

**Bespoke-maintenance cost.** Low-to-moderate. Playwright is heavily maintained,
the API is stable, and a script that does `launch → goto → evaluate → dialog`
touches only the most stable surface. The Firefox build is pinned by the
Playwright version (Playwright ships its own patched Firefox), which is *good* for
reproducibility but means "the Firefox I profile in" is Playwright's Firefox, not
the system Firefox — a fidelity nuance worth noting (the maintainer's hand-profile
Firefox and the automated one may differ by a few versions).

**Headless/CI viability.** Excellent for Layer B. The Layer-C caveat is the gate.

### 3.2 Puppeteer

**What it is.** A Chromium (and now Firefox-via-WebDriver-BiDi) automation library
(Google). Historically Chromium-only over CDP. *Verified:* `page.tracing.start({
path })` / `page.tracing.stop()` wrap CDP `Tracing.start`/`Tracing.end` and write
a Chrome trace JSON to a file.

**What it automates.** Same Layer-B coverage as Playwright on Chromium, *plus* a
one-call trace capture (`page.tracing`) that lands a Chrome trace file — which is
the most ergonomic Layer-C path on Chromium of any option here.

**Pros.** The `page.tracing.start/stop` API is the single cleanest
"record→stop→export a file" primitive in the whole survey (Layer C in two lines).
Lightweight, well-documented.

**Cons.** **Chromium-only in practice** for tracing (its Firefox support is newer
and does not include the profiler). The maintainer profiles in *both* browsers;
Puppeteer cannot drive Firefox profiling at all. It also overlaps Playwright
entirely on Chromium while doing less (no WebKit, weaker cross-browser story), so
choosing Puppeteer over Playwright only makes sense if Chrome-trace capture is the
*sole* goal — which §4.4's format-bridge uncertainty argues against locking in.

**Bespoke-maintenance cost.** Low. But adopting it *and* Playwright is two tools
where one would do.

**Headless/CI viability.** Excellent on Chromium; the Chrome-trace format bridge
(§4.4) is the open question.

### 3.3 Raw Chrome DevTools Protocol (CDP)

**What it is.** The wire protocol Chromium exposes (over a WebSocket on
`--remote-debugging-port`) that DevTools itself speaks. Domains include `Tracing`
(timeline capture), `Profiler` (sampling CPU profile), `Network`
(`setCacheDisabled`), `Page`, `Runtime` (`evaluate`). *Verified:* `Tracing.start`
/ `Tracing.end` collect trace events, streamed back as `dataCollected` events or
to a stream (`ReturnAsStream`, JSON), terminated by `tracingComplete`.

**What it automates.** Everything Playwright/Puppeteer do, at a lower level — and
it is what they *use* under the hood for Chromium. Driving it raw means you own the
WebSocket and the JSON-RPC dance yourself.

**Pros.** Maximum control over the trace (categories, buffer size, streaming). No
framework dependency. It is the "ground truth" of the Chromium capture story.

**Cons.** **Highest bespoke-maintenance cost in the survey** — you re-implement
session management, dialog handling, navigation-settling, and trace stream
assembly that Playwright/Puppeteer give for free. This fights the
single-maintainer / low-bespoke-burden constraint directly. For this project,
raw CDP is the wrong altitude: it is what you reach for when you need a CDP
capability the framework does not expose, and Puppeteer's `page.tracing` already
exposes the one you want. **Chromium-only** (Firefox CDP lacks `Tracing.*` and
`IO.read` — *verified* via the Firefox-profiler discussion #4718).

**Headless/CI viability.** Fine, but you are maintaining plumbing.

### 3.4 Selenium / WebDriver (and WebDriver-BiDi)

**What it is.** The W3C-standard browser-automation protocol; the cross-browser,
cross-language elder of the space. WebDriver-BiDi is the newer bidirectional
successor narrowing the gap with CDP.

**What it automates.** Layer B across browsers. Crucially for *this* project,
**WebDriver can run `Services.profiler.start/stop` in a privileged context** in
Firefox (*verified* recommendation from the Firefox-profiler maintainer in
discussion #4718) — which is the *only* non-manual path to a native Firefox
profile (§4.3). That makes Selenium/Marionette uniquely relevant to the
Firefox-profiler arm, despite being otherwise heavier than Playwright.

**Pros.** The privileged-`Services.profiler` path is genuinely Firefox-native —
it would produce a real Gecko profile the `profiler-cli` ingests directly, no
format bridge. Standards-based, durable.

**Cons.** Heavier, more ceremony than Playwright for the Layer-B steps. The
privileged-context profiler path is **not a documented, supported API** — it is a
"should be possible" from the maintainer, requiring Marionette in chrome scope and
`Services.profiler` calls that are themselves Firefox-internal and version-sensitive
(*asserted*: I found no worked, maintained example of this end-to-end; it is a
known-possible, not a known-easy). This is exactly the bespoke-fragility the
project's principle warns against — but it is the *only* native-Firefox automated
path, so it earns a place if Firefox-native fidelity is non-negotiable.

**Headless/CI viability.** Possible; the privileged-profiler path is the bespoke
risk.

### 3.5 xdotool / wmctrl (the screen-coordinate path the maintainer floated)

**What it is.** X11 tools that synthesise input events (`xdotool key`,
`xdotool click`, `xdotool mousemove`) and manage windows (`wmctrl`) by OS-level
coordinates — driving the *screen*, not the *page*.

**What it automates.** In principle the literal manual ritual: move the DevTools
window, click at the pixel where "record" sits, etc.

**Assessment (fair, as requested).** The prior survey's rejection is correct, and
here is *why* in the project's own vocabulary. xdotool automates the
*screen-coordinate brittleness* rather than *removing* it. It clicks at pixel
(x, y); the moment the DevTools layout, the toolbar height, the font, the window
size, or the Firefox version shifts that pixel, the script silently clicks the
wrong thing — a **silent failure**, exactly the ADR-0002 shape the project treats
as the gravest sin. It has zero semantic understanding of "the record button"; it
knows only a coordinate. It is also display-server-coupled (X11; breaks under
Wayland without XWayland, breaks headless without a virtual framebuffer).

There is *one* narrow, honest use: arming the Firefox profiler via its **keyboard
shortcut** (`Ctrl+Shift+1` start / `Ctrl+Shift+2` stop — *verified*, these are the
Firefox-profiler default capture shortcuts, also used by the Chrome-trace
extension). `xdotool key ctrl+shift+1` is *coordinate-free* — it sends a keystroke,
not a click — and the profiler shortcut is stable across DevTools-layout changes.
That is meaningfully less brittle than clicking pixels, and it is the *only* way to
arm the **real, hand-equivalent Firefox profiler** from a script without the
privileged-`Services.profiler` bespoke path. So: reject xdotool for *navigation /
clicking*; consider `xdotool key` *solely* as the profiler-shortcut arm in a
human-in-the-loop or single-machine shape (§6c). Even then it is a local-dev
convenience, never CI infrastructure.

**Bespoke-maintenance cost.** High for clicking, low for the single keystroke.
**Headless/CI viability.** Effectively none (needs a real or virtual display +
window manager + the actual Firefox profiler UI).

---

## 4. Layer C — the profiler arm/disarm (the crux)

This is the one genuinely un-automated step, and the survey's center of gravity.
The question for each option is the same: **does it produce something the
project's existing analysis pipeline — `profiler-cli`, the normalization
protocol, the `render`/`patch`/`rb3:*`/`autonav:*` markers — can consume?**

### 4.1 Manual (status quo)

Human clicks record in Firefox DevTools, runs the scenario, clicks stop, saves
`.json.gz` to `~/perf-profiles/`. **Produces exactly what the pipeline consumes**
(it *is* the pipeline's source). The only cost is the human click and the
record→focus offset. Everything else in the rigamarole is automatable *around*
this without touching it — which is why shape (a) in §6 is viable and small.

### 4.2 JS Self-Profiling API (`new Profiler({ sampleInterval, maxBufferSize })`)

**What it is.** A W3C/WICG draft API that lets a page sample *its own* JS call
stacks programmatically: `const p = new Profiler({ sampleInterval: 10 }); … ;
const trace = await p.stop();`. In-page, no DevTools, no external driver.

**Verified facts:**
- **Chromium-only.** Available in Chrome/Edge since Chrome 94. **Firefox has NOT
  implemented it** (Bugzilla 1687857 open; Mozilla standards-position pending).
  This alone makes it useless for the Firefox-centric analysis pipeline.
- **Requires `Document-Policy: js-profiling` response header.** The dev server
  must send it. Vite can via a small middleware/plugin or `server.headers`. Easy,
  but a required precondition.
- **Sample-interval floor:** Chrome won't sample faster than ~16 ms (Windows) /
  ~10 ms (Mac/Android) — *verified*. Coarse relative to a 60 Hz (16.7 ms/frame)
  navigation cadence: you get roughly one sample per frame, which is too coarse to
  attribute per-frame render/patch cost the way the project's analysis does.
- **Output format:** a space-efficient `{ frames, resources, stacks, samples }`
  trie — *NOT* the Gecko/Firefox profile format, and *NOT* the Chrome trace-event
  format. It is its own thing.

**Feeds the pipeline?** **No, not without a custom converter.** *Verified* that
the format is distinct; *asserted* (untested) that `profiler-cli` cannot ingest it
directly — the CLI consumes Gecko-format profiles, and nothing in its README
mentions the self-profiling format. You would have to write a
self-profiling-trace → Gecko-format converter, which is real bespoke work, and even
then you would be sampling JS-only (no native RefreshDriverTick / GC / paint marks
— the very native-pipeline-floor metrics the green-arc retrospective identified as
the *dominant* cost). It also captures samples, not the UserTiming `render`/`patch`
*markers* the per-component ranking is built on.

**Verdict.** Wrong tool for this project. It is built for *RUM* (collecting JS
profiles from real end-users in production at low sample rates), not for
high-fidelity local perf investigation. The Chromium-only + format-mismatch +
coarse-interval + JS-only-stacks combination is four independent disqualifiers
against the project's Firefox-centric, marker-and-native-floor analysis. Mention
it, do not build on it.

### 4.3 Firefox Gecko profiler programmatic control

**What it is.** The Gecko profiler (the backend behind Firefox DevTools
Performance and `profiler.firefox.com`) *can* be driven without manual clicks via
two mechanisms — *verified* against the Firefox-profiler maintainer's own
recommendations (discussion #4718) and Firefox source docs:

1. **`MOZ_PROFILER_STARTUP` env vars** — set at browser launch; profiles the
   *entire* session start-to-shutdown and writes a Gecko profile on exit. Coarse
   (you cannot bracket a sub-window precisely from inside), but it produces a
   genuine Gecko profile the `profiler-cli` ingests directly.
2. **`Services.profiler.start/stop` via a privileged (chrome-scope) context** —
   driven through Marionette/WebDriver. This *can* bracket precisely. But:
   - It is **not exposed by Playwright** (*verified* — Playwright-Firefox has no
     CDP and no profiler API; the missing CDP methods are `Tracing.start`,
     `Tracing.end`, `IO.read`).
   - It is a **"should be possible," not a maintained, documented path** — I found
     no worked end-to-end example. It requires Marionette in chrome scope, which is
     Firefox-internal and version-sensitive.

**Feeds the pipeline?** **Yes, natively and losslessly** — both paths produce
Gecko-format profiles with full UserTiming markers (the `autonav:*` / `render` /
`patch` / `rb3:*` marks all survive, since they show up under "UserTiming" in the
profiler — *verified*) and the native RefreshDriverTick/GC/paint data the green
arc needs. This is the *only* automated path that produces *exactly* what the hand
workflow produces. The cost is entirely in the *driving*: env-var (coarse, easy) or
privileged-Marionette (precise, bespoke, fragile).

**Verdict.** The highest-fidelity automated Firefox path, gated by bespoke/fragile
driving. The env-var variant is a real, low-effort option for a *whole-run* capture
(acceptable because the in-app runner makes the run itself deterministic and the
`scenario:*` markers let you clip the window post-hoc — the coarseness of "profile
the whole session" is largely neutralised by having precise in-profile brackets).

### 4.4 CDP `Tracing` / `Profiler` domains (Chromium)

**What it is.** Drive Chromium's `Tracing.start` → run scenario → `Tracing.end`
→ collect the Chrome trace JSON, via Puppeteer's `page.tracing` (two lines),
Playwright-Chromium's CDP session, or raw CDP. *Verified:* produces a Chrome
trace-event-format JSON file.

**Feeds the pipeline?** **This is the load-bearing uncertainty, and I am marking
it asserted/untested, not verified.** What *is* verified:
- The Firefox Profiler **front-end** (the `profiler.firefox.com` web app and the
  DevTools panel) **does import Chrome JSON traces** — drag-and-drop, or the
  official Chrome extension (`Ctrl+Shift+1/2`) — and **UserTiming marks
  (`performance.mark`/`measure`) survive the import as markers**
  (cross-browser-standard; they appear under "UserTiming"). So a Chrome trace of
  the scenario, opened in the Firefox Profiler *UI*, would show the `autonav:*` /
  `render` / `patch` markers.
- *Asserted / untested:* whether **`profiler-cli` (the headless CLI the project's
  analysis actually uses) can ingest a Chrome trace directly.** The Chrome→Gecko
  conversion is a *front-end importer* concern (it runs in the web app at import
  time); the `profiler-cli` expects Gecko-format profiles and its README does not
  mention a Chrome-trace importer. My strong inference is that **`profiler-cli
  load chrome-trace.json` will NOT work directly** — you would need to round-trip
  through the UI importer and export a Gecko-format profile, or run a separate
  converter. **This needs a 15-minute empirical test before relying on shape (b).**
- Some Chrome-trace data (e.g. network markers) is *not fully* preserved on import
  (*verified* caveat from the Mozilla extension announcement) — not fatal for the
  render/patch/UserTiming analysis, but a fidelity asterisk.
- Whether the Vue `render`/`patch` UserTiming durations and the
  `RefreshDriverTick`-equivalent survive the cross-browser conversion *with the
  same metric semantics the normalization protocol assumes* is **untested** — the
  protocol's metric names (`RefreshDriverTick`, `requestAnimationFrame callbacks`)
  are Gecko-specific; Chrome's equivalents have different names and the
  cross-browser median comparison would need re-grounding.

**Verdict.** The fully-headless Chromium capture is *technically* the most
CI-friendly (Puppeteer/Playwright-Chromium, two lines, no display needed), and the
Chrome profiler is where the maintainer *did* see the render≫patch TreeWidget
finding — so Chrome fidelity is proven useful. But the *bridge from a Chrome trace
to the project's Firefox-`profiler-cli`-and-normalization-protocol analysis* is
unverified and likely requires a converter or a UI round-trip. Until that bridge is
tested, shape (b) is "promising but unproven," not "ready."

---

## 5. Cache-staleness elimination (retiring the vite-restart / tab-close ritual)

The maintainer restarts vite and closes the Firefox tab each run to be *sure* no
stale SPA bundle invalidates results. Here is what *actually* governs staleness
(*verified* against Vite docs and issues), so the ritual can be replaced by a
durable guarantee:

- **Vite serves source modules with `Cache-Control: no-cache` + ETag** — i.e.
  *revalidate every time*, not "cache forever." A source edit is picked up on
  reload; source modules are **not** the stale-bundle risk in normal reloads.
- **Pre-bundled dependencies are served `max-age=31536000, immutable`** (cached
  hard) — but they are only re-bundled when a dependency version changes, so they
  are not the stale-*SPA*-code risk either (they are third-party libs).
- **The real staleness vector is the bfcache / back-forward disk cache**: when you
  navigate back to a Vite-served page, the browser can serve HMR-modified modules
  from disk cache, which *are* stale until a hard reload. This is the actual
  mechanism behind the maintainer's superstition — and it is triggered by *reusing*
  a tab/session, which is exactly what the ritual (close the tab) defends against
  by brute force.

**The clean fix (no vite restart, no manual tab close):**

1. **A fresh browser context per run** (`browser.newContext()` in Playwright)
   has an empty cache by construction — no bfcache, no disk cache, no stale HMR
   module. This is the durable replacement for "close the tab."
2. **Disable cache during the session** — on Chromium, CDP
   `Network.setCacheDisabled(true)` (Playwright/Puppeteer expose this); in any
   browser, a fresh context + `page.goto(url)` with no prior history sidesteps
   bfcache. On Firefox-via-Playwright, the fresh context is the guarantee.
3. **A hard navigation** (`page.goto`, not in-page SPA routing) re-fetches
   `index.html` (served `no-cache`), which re-pulls the current module graph.
4. **No service worker** — confirm the SPA registers none (it does not appear to;
   nothing in the read surface registers one). A service worker would be a real
   staleness vector; its *absence* is what makes the above sufficient.

Net: **the vite restart is unnecessary** (source modules revalidate;
dependency cache only matters across `npm install`), and **the tab-close is
replaced by a fresh context per run.** This is a strict win the maintainer gets
*for free* the moment any Layer-B driver is in play — and it is "infrastructural
excellence," not a hack: the staleness guarantee becomes a property of the launch
procedure, not a ritual the maintainer performs from memory.

*Caveat (asserted):* if the maintainer ever sees genuinely stale behaviour with a
fresh context, the next suspect is Vite's optimized-deps cache
(`node_modules/.vite`) across a dependency change — cleared by `vite --force`,
which is a far more targeted action than a blind restart-every-run.

---

## 6. End-to-end shapes worth assembling

Each shape is Layer A (assumed: the `useCaptureScenario` runner — cheap, and
every shape benefits) + a Layer-B choice + a Layer-C choice.

### Shape (a) — In-app runner + manual profiler arm *(smallest)*

In-app `useCaptureScenario` (await-able autonav, confirm-free purge); the human
clicks Firefox record, fires `window.__perfScenario.run()` from the console (or one
dev button), watches it run to leaf, clicks stop. No driver at all.

- **Coverage:** ~8 of 10 manual steps gone (all of Layer A); only the record/stop
  clicks and the launch remain manual.
- **Brittleness:** near-zero (pure in-page Vue).
- **Bespoke burden:** near-zero (it is project code the maintainer owns).
- **ADR-0009 fidelity:** maximal — native Firefox profile, all markers, the
  `scenario:*` brackets make clipping trivial.
- **Portability:** runner is browser-agnostic; works identically whether the
  human profiles in Firefox or Chrome.
- **Stale-bundle:** still manual (the human reloads) — *unless* paired with the §5
  fresh-context guidance, which needs a driver.

### Shape (b) — In-app runner + Playwright-Chromium + CDP Tracing *(fully headless)*

Playwright-Chromium launches fresh (cache disabled), `page.goto`,
`page.evaluate(() => window.__perfScenario.run())`, CDP/Puppeteer
`page.tracing.start/stop` brackets the run, writes a Chrome trace.

- **Coverage:** 10 of 10 — fully headless, CI-able, zero human clicks.
- **Brittleness:** low (one `evaluate`, one dialog handler, one trace call).
- **Bespoke burden:** low *if* the format bridge works; **moderate-to-high if it
  doesn't** (you write/maintain a Chrome→Gecko converter).
- **ADR-0009 fidelity:** **UNVERIFIED.** The Chrome-trace → `profiler-cli` /
  normalization-protocol bridge is asserted, not tested (§4.4). UserTiming markers
  survive into the Firefox Profiler *UI*; whether `profiler-cli` ingests a Chrome
  trace, and whether the Gecko-specific metric names the protocol uses
  (`RefreshDriverTick`) map cleanly, is the open question.
- **Portability:** Chromium-only capture. Chrome fidelity is *proven useful* (the
  TreeWidget render≫patch finding came from a Chrome capture), so this is not a
  weakness for the *Chrome* half of the maintainer's two-browser practice.

### Shape (c) — Playwright-Firefox + in-app runner + keyboard profiler arm

Playwright-Firefox launches fresh, `page.evaluate` fires the runner; the profiler
is armed via the Firefox profiler keyboard shortcut (`Ctrl+Shift+1` / `2`) — either
a human keystroke (human-in-the-loop) or `xdotool key ctrl+shift+1` on a
single-machine local-dev setup (§3.5's one sanctioned xdotool use).

- **Coverage:** Layer A + B fully automated; Layer C is a coordinate-free keystroke
  (human or xdotool).
- **Brittleness:** low for the keystroke (shortcut is layout-stable); the xdotool
  variant is display-coupled (no headless).
- **Bespoke burden:** low.
- **ADR-0009 fidelity:** **maximal** — native Firefox profile, all markers,
  ingested directly by `profiler-cli`. No format bridge.
- **Portability:** Firefox-native; pairs with shape (b) for Chrome to cover both
  browsers with the *same in-app runner*.
- **Stale-bundle:** solved (fresh context).

### Shape (d) — JS-Self-Profiling in-app

Dismissed (§4.2): Chromium-only, format-mismatched, coarse, JS-only. Not viable for
this pipeline.

### Shape (e) — In-app runner + MOZ_PROFILER_STARTUP whole-run Firefox capture

Playwright-Firefox (or even a plain launch) with `MOZ_PROFILER_STARTUP` env vars
set; the in-app runner makes the *whole session* deterministic, and the
`scenario:measure-start`/`scenario:end` markers clip the window post-hoc.

- **Coverage:** high; the profiler arm is "set an env var at launch," no clicks.
- **Brittleness:** low (env vars are stable Firefox surface).
- **Bespoke burden:** low (no privileged-Marionette path; just env vars).
- **ADR-0009 fidelity:** **maximal** — native Gecko profile, all markers,
  `profiler-cli`-native. The whole-session coarseness is neutralised by the
  in-profile `scenario:*` brackets + the normalization protocol's clip.
- **Portability:** Firefox-only (Chrome covered by shape (b)).
- **Caveat (asserted):** I have not verified the exact `MOZ_PROFILER_STARTUP*`
  env-var set that writes a Gecko profile to a known path on a Playwright-launched
  Firefox; it is documented in Firefox source docs but needs a confirming run.

---

## 7. Scored comparison

Scoring 1–5 (5 best) on the axes the maintainer named. "Coverage" = fraction of the
rigamarole automated; "Fidelity" = does it feed the existing
`profiler-cli`/normalization/marker analysis *as-is*; "Portability" = cross-browser
code-hygiene signal; "Maintenance" = inverse of bespoke burden (5 = lowest burden).

| Shape | Coverage | Brittleness (5=robust) | Maintenance (5=low burden) | ADR-0009 fidelity | Portability | Notes |
|---|---|---|---|---|---|---|
| **(a) runner + manual arm** | 3.5 | 5 | 5 | **5 (verified)** | 5 | Smallest; native FF profile; human still clicks record |
| **(b) Chromium + CDP Tracing** | **5** | 4 | 3 | **2 (UNVERIFIED bridge)** | 2.5 | Fully headless; Chrome-trace→profiler-cli untested |
| **(c) PW-Firefox + keyboard arm** | 4.5 | 4 | 4.5 | **5 (verified, native)** | 4 | Native FF; coordinate-free keystroke; xdotool variant not headless |
| **(d) JS Self-Profiling** | 4 | 4 | 2 | **1** | 1 | Chromium-only, format-mismatch, coarse — dismissed |
| **(e) runner + MOZ_PROFILER_STARTUP** | 4.5 | 4.5 | 4.5 | **5 (native; env exact set asserted)** | 4 | Whole-run capture; brackets clip post-hoc; lowest-friction FF arm |

Component-layer scores (for mixing your own shape):

| Component | Coverage of its layer | Maintenance | Notes |
|---|---|---|---|
| **A. `useCaptureScenario`** | 5 (all of Layer A) | 5 | The keystone; everything else assumes it |
| **B. Playwright** | 5 | 4 | Only driver for *both* browsers; best dialog/native handling |
| **B. Puppeteer** | 4 | 4 | Chromium-only; cleanest `page.tracing` |
| **B. raw CDP** | 4 | 2 | Wrong altitude — re-implements framework plumbing |
| **B. Selenium/WebDriver** | 4 | 3 | Heavier; the *only* `Services.profiler` Firefox-native path (bespoke) |
| **B. xdotool (click)** | 2 | 1 | Automates the brittleness; silent-failure shape — reject |
| **B. xdotool (key only)** | n/a | 4 | Coordinate-free profiler-shortcut arm; local-dev only |
| **C. manual** | — | 5 | Native, verified, the pipeline's source |
| **C. CDP Tracing** | 5 | 3 | Headless; format bridge unverified |
| **C. Gecko env-var** | 4 | 4.5 | Native Gecko profile; coarse but bracketed |

---

## 8. Recommended direction (the maintainer chooses)

**A staged path that front-loads the verified, high-fidelity, low-bespoke wins and
defers the one unverified bridge until it is cheaply testable.**

**Stage 1 — Build `useCaptureScenario` (Layer A). Do this regardless of any driver
decision.** It is the keystone: highest coverage-per-effort, zero new dependency,
maximal ADR-0009 fidelity, zero bus-factor cost, and it is the "infrastructural
excellence" answer to a ritual currently living in the maintainer's head. It makes
*every* downstream shape cheap (one `page.evaluate`). The two small refactors it
needs — an await-able autonav `start()` and a confirm-free programmatic purge — are
clean additive changes that also retire the worst out-of-page obstacle (the native
`confirm()`). After Stage 1 alone, the maintainer is at shape (a): ~8 of 10 manual
steps gone, native Firefox profile, console-driven.

**Stage 2 — Add Playwright as the Layer-B driver, targeting shape (c)/(e) for
Firefox first.** Playwright is already available, drives both browsers, handles the
`confirm()` and fresh-context cache guarantee idiomatically, and `page.evaluate(()
=> window.__perfScenario.run())` is the robust (non-brittle) invocation. This
*automatically* retires the vite-restart + tab-close ritual (§5: fresh context per
run is the durable staleness guarantee). For the Firefox profiler arm, start with
the **`MOZ_PROFILER_STARTUP` whole-run capture (shape e)** — lowest-friction,
native, no clicks, and the in-app `scenario:*` brackets make the whole-run
coarseness a non-issue. The keyboard-shortcut arm (shape c) is the fallback if a
sub-window bracket is ever needed.

**Stage 3 — Treat the fully-headless Chromium path (shape b) as an explicit,
time-boxed experiment, not a commitment.** Before building it, run the
**15-minute empirical test** in the first-step below: capture a Chrome trace of the
scenario and check whether `profiler-cli load` ingests it (or whether a UI
round-trip / converter is required) and whether the marker/metric semantics survive.
If the bridge works, shape (b) becomes the CI-friendly Chrome half and the
maintainer covers both browsers headlessly. If it doesn't, the Chrome captures stay
manual (as they are today) and shape (c)/(e) carries the automated Firefox practice
— still a large net win.

This staging respects the project's principle directly: every stage that ships is
verified-fidelity and low-bespoke; the one unverified path (the Chrome-trace bridge)
is gated behind a cheap test rather than built on faith.

---

## 9. Concrete first step

**Two actions, in order, before any driver work:**

1. **Write `useCaptureScenario` (the Stage-1 keystone), with two enabling
   refactors:**
   - In `useAutoNavigatePerf.ts`: make `start()` return a `Promise<void>` that
     resolves on `autonav:end` (or add `onComplete`). Pure additive; the rAF loop
     already knows when it stops.
   - Add a programmatic, confirm-free purge entry the runner calls directly
     (`analysisService.stopBoardAnalysis(boardId)` + `ledger.purgeBoard(boardId)`
     — both already public), leaving the `confirm()`-gated button untouched for
     human use.
   - The runner chains: await-connect → `clearCache` (assert `lookup_cache` off, or
     warn loudly per the service's existing message) → confirm-free purge → warm
     autonav (await leaf) → reset to root → `analyzeRange`/`analyzeActiveNode` →
     measured autonav (await leaf), bracketed by `scenario:start` /
     `scenario:warm-start` / `scenario:measure-start` / `scenario:end` marks. Expose
     on `window.__perfScenario` in DEV (matching `window.store`). Sequence off real
     signals, never `setTimeout`. Add a FILES.md entry; unit-test
     `summarizeAnalysisQueue`-style pure parts.

   This alone delivers shape (a) and is independently valuable.

2. **The 15-minute fidelity test that decides Chrome's fate (gates Stage 3):**
   Capture a Chrome trace of one scenario run — either manually (DevTools
   Performance → record → run scenario → stop → "Save profile") or via a throwaway
   `page.tracing.start/stop` — then test the bridge:
   - `profiler-cli load <chrome-trace>.json` — does it load, or error on format?
   - If it errors: drag the trace into `profiler.firefox.com`, confirm the
     `autonav:*` / Vue `render`/`patch` markers appear under UserTiming, and check
     whether the UI can export a Gecko-format profile that `profiler-cli` *does*
     ingest.
   - Note whether the normalization protocol's metrics have Chrome equivalents
     (`RefreshDriverTick` ↔ Chrome's frame markers) and whether the per-frame
     median comparison survives.

   The outcome of this test is the single fact that turns shape (b) from
   "promising but unproven" into either "ready" or "needs a converter / stays
   manual." It costs 15 minutes and removes the survey's only load-bearing
   uncertainty.

---

## 10. Honest notes on ecosystem immaturity and bespoke risk

- **The whole "automate the profiler arm" space is genuinely immature for
  Firefox.** Chrome has CDP Tracing and JS Self-Profiling; Firefox has neither
  through Playwright, and its programmatic paths (`MOZ_PROFILER_STARTUP`,
  privileged `Services.profiler`) are "documented but not turnkey." The
  Firefox-profiler maintainer's own answer (discussion #4718) is "env vars, or
  WebDriver privileged context" — i.e. there is no clean supported API. This is
  not a gap in *this survey*; it is a gap in *the ecosystem*, and the staged
  recommendation routes around it (env-var whole-run capture) rather than into the
  fragile part (privileged Marionette).
- **The Chrome-trace → Firefox-`profiler-cli` bridge is the one place I could not
  verify the end-to-end claim.** I verified each link (Firefox Profiler UI imports
  Chrome traces; UserTiming survives; `profiler-cli` is Gecko-format,
  analysis-only) but not the composition (`profiler-cli` ingesting a raw Chrome
  trace). I am flagging it asserted, and the first-step test exists precisely to
  resolve it cheaply rather than build on the assumption.
- **xdotool-for-clicking is the one path that actively fights the project's
  principles** (silent-failure coordinate brittleness, ADR-0002 shape). The single
  keystroke-only carve-out (`Ctrl+Shift+1/2`) is the only honest use, and only for
  local single-machine dev.
- **Single-maintainer durability favours the staged path.** Stage 1 (in-app
  composable) and Stage 2 (Playwright launch + evaluate + env-var arm) touch only
  the most stable surfaces and are owned-by-the-maintainer or heavily-maintained.
  The high-bespoke options (raw CDP, privileged Marionette, a self-profiling
  converter) are explicitly deferred or rejected.

---

## Verification status of load-bearing claims

**Verified (with source):**
- `@firefox-devtools/profiler-cli` is analysis-only (load / profile info / thread
  markers / marker stack / thread samples; persistent daemon; no record/capture
  command), latest v0.2.1, loads file or `https://` URL, Gecko-format. — npm
  registry metadata + README (`registry.npmjs.org/@firefox-devtools/profiler-cli`).
- JS Self-Profiling API: Chromium-only (Chrome 94+); **not** implemented in Firefox
  (Bugzilla 1687857 open); requires `Document-Policy: js-profiling` response header;
  sample-interval floor ~16 ms (Win) / ~10 ms (Mac/Android); output is a
  `{frames, resources, stacks, samples}` trie distinct from Gecko and from
  Chrome-trace formats. — MDN, chromestatus, WICG spec, Mozilla bug.
- Playwright drives Chromium via CDP but **Firefox/WebKit via a custom protocol
  (Juggler), NOT CDP**; native CDP connection is Chromium-only;
  `browser.startTracing` is Chromium-only. — Playwright docs, BrowserType class.
- Firefox CDP lacks `Tracing.start` / `Tracing.end` / `IO.read`, so Playwright
  cannot CDP-trace Firefox. — firefox-devtools/profiler discussion #4718.
- Firefox programmatic profiling exists via `MOZ_PROFILER_STARTUP` env vars and via
  `Services.profiler.start/stop` in a privileged context driven by WebDriver; the
  latter is "should be possible," not a maintained API. — discussion #4718 (Firefox
  Profiler maintainer), Firefox source docs (profiler code overview).
- Puppeteer `page.tracing.start({path})` / `.stop()` wraps CDP `Tracing.start/end`
  and writes a Chrome trace JSON. — Puppeteer docs (puppeteer.tracing).
- CDP `Tracing` reports events as `dataCollected` or to a JSON stream
  (`ReturnAsStream`), terminated by `tracingComplete`. — chromedevtools.github.io
  Tracing domain.
- Firefox Profiler (UI / web app) imports Chrome JSON traces via drag-drop and an
  official Chrome extension (`Ctrl+Shift+1` start / `Ctrl+Shift+2` stop); some data
  (network markers) not fully preserved. — Mozilla Performance blog (2024-12-12).
- `performance.mark` / `performance.measure` (UserTiming) appear under "UserTiming"
  in the Firefox Profiler and are cross-browser-standard, surviving Chrome-trace
  import. — Firefox source docs (instrumenting-javascript), Mozilla blog.
- Vite dev server: source modules served `Cache-Control: no-cache` + ETag
  (revalidate); pre-bundled deps served `max-age=31536000, immutable`; the
  back-forward/disk-cache (bfcache) can serve stale HMR-modified modules on
  back-navigation (the real staleness vector); `vite --force` clears optimized-deps
  cache. — Vite docs (dep pre-bundling, troubleshooting), vitejs/vite issues
  #4736, #16587, #2725.
- Current in-app state: `useAutoNavigatePerf` / `useAutoPopoverPerf` marker
  contracts, the DEV-gated Toolbar buttons, `app.config.performance = true`,
  `window.store`/`window.Writer`, `clearCache`'s `lookup_cache` caveat, the
  `confirm()`-gated `purgeLedger`, the `rb3:*` measures, ADR-0009's render+patch
  ranking, the normalization protocol's per-frame-median metrics and `~/perf-profiles/`
  convention. — Read directly from source and docs (§0).

**Asserted / NOT independently verified (flagged as such inline):**
- That `profiler-cli` **cannot** ingest a raw Chrome trace directly (likely
  requiring a UI round-trip or converter) — strong inference from the CLI being
  Gecko-format and the Chrome importer being a front-end concern, but **not tested**.
  This is the survey's one load-bearing uncertainty; the §9 first-step test resolves
  it. *(This gates shape (b).)*
- Whether the normalization protocol's Gecko-specific metric names
  (`RefreshDriverTick`, `requestAnimationFrame callbacks`) have clean Chrome-trace
  equivalents that preserve the per-frame-median comparison — **untested**.
- The exact `MOZ_PROFILER_STARTUP*` env-var set that writes a Gecko profile to a
  known path on a Playwright-launched Firefox — documented in Firefox source docs
  but **not confirmed by a run** here.
- The privileged-`Services.profiler`-via-Marionette path being feasible end-to-end
  — the Firefox maintainer says "should be possible"; **no worked example found**.

---

## Appendix — verbatim prompt

> You are an Opus consult producing an **extensive design-space grounding** for the
> maintainer of a Vue 3 + TypeScript SPA (LengYue, a Go spaced-repetition study
> tool) at `frontend/`. The maintainer is a strong engineer but NOT an expert in
> browser automation or profiler tooling, and wants to be **thoroughly grounded in
> the design space without having to become one** before choosing a direction.
> Reason independently; use web search/fetch for every empirical claim about
> external tooling and **flag verified-vs-asserted** throughout (browser-API support
> and protocol details are version-sensitive — cite sources). Calibrate depth to a
> principal engineer: explain what each tool/API *is* and *how it works* concisely,
> then go deep on tradeoffs.
>
> This is a SURVEY/grounding doc, not a decision — present the space fairly, score
> options, and give a recommended direction with a concrete first step, but the
> maintainer chooses.
>
> **Target length / shape.** The maintainer estimates ~700-900 lines feels right,
> with **no hard limit either way** — comprehensive coverage over brevity, but
> don't pad. For each option: (1) what it is + how it works (non-expert-friendly),
> (2) pros, (3) cons, (4) interaction with the project's discipline (below),
> (5) headless/CI viability. End with a scored comparison + recommended direction +
> first step.
>
> **The problem being automated (the maintainer's pain, verbatim shape).** A
> perf-capture run today is a manual rigamarole, error-prone and slow: F12 → resize
> DevTools to a sliver → move it above the toolbar → connect → clear engine cache →
> purge analysis data → warm the cache by running autonav once → navigate back →
> start the popover → click "analyze" → click "record" in the profiler → start
> autonav → wait until the last node → click "stop". Plus he restarts the vite dev
> server and closes the Firefox tab each run to be *sure* no stale SPA bundle
> invalidates results.
>
> **Read the ACTUAL current state first (don't assert it).** A prior survey found
> the in-app half is ~60% built. Verify and ground in the code:
> `src/composables/useAutoNavigatePerf.ts` and
> `src/composables/useAutoPopoverPerf.ts` (the dev-gated harnesses; the
> `performance.mark`/`measure` they emit); `src/main.ts`
> (`app.config.performance = true`; `window.store` / `window.Writer`);
> `src/components/chrome/Toolbar.vue` + `src/composables/useEngineControls.ts`
> (clearCache → `analysis-service` `clear_cache`) + `src/components/editors/AnalysisControls.vue`
> (the `confirm()`-gated purge); `src/services/analysis-service.ts` (the `rb3:*`
> `performance.measure` instrumentation); `docs/notes/perf-capture-normalization-protocol.md`
> (the `@firefox-devtools/profiler-cli` is analysis-only; profiles land in
> `~/perf-profiles/`); `docs/adr/0009-performance-investigation-discipline.md`;
> `docs/notes/green-perf-arc-retrospective-2026-05-31.md`; umbrella +
> `frontend/CLAUDE.md` for discipline vocabulary, and the maintainer's principle:
> **"performance is a consequence of infrastructural excellence; no hacks for
> speed; tacky code is worse than tacky perf"** — automation must be clean
> infrastructure, not a brittle screen-scraper. Single-maintainer project (bus
> factor: prefer durable, low-bespoke-maintenance solutions). Available locally:
> Playwright, the vite dev server, the SELECTOR proxy. The maintainer profiles in
> both Firefox and Chrome.
>
> **The design space to cover.** (1) The in-app scenario runner
> (`useCaptureScenario`-style). (2) The browser-driver layer: Playwright (Firefox
> vs Chromium builds), Puppeteer, raw CDP, Selenium/WebDriver, xdotool/wmctrl
> (assess fairly). (3) The profiler arm/disarm — the one genuinely un-automated
> step, covered deeply and empirically: Manual; JS Self-Profiling API; CDP
> Tracing/Profiler domains; Firefox Gecko profiler programmatic control. Map each
> to: does it produce something the existing analysis pipeline can consume?
> (4) Cache-staleness elimination. (5) The end-to-end shapes worth assembling,
> scored on coverage / brittleness / bespoke-maintenance / ADR-0009 fidelity /
> cross-browser portability.
>
> **Deliverable.** A scored comparison and a recommended direction with a concrete
> first step, framed so the maintainer can decide without being a browser-automation
> expert. Be honest where the ecosystem is immature or a path is bespoke. Then WRITE
> the verbatim assessment to
> `docs/notes/consult/opus-consult-2026-06-01-perf-capture-automation-design-space.md` —
> self-contained, markdown with headers, verified-vs-asserted marked throughout,
> with a "Verification status of load-bearing claims" section and an "Appendix —
> verbatim prompt" + `License: Public Domain (The Unlicense).` Match the
> structure/tone of the prior consult records under `docs/notes/opus-consult-2026-*`.
> Return a short bottom-line summary.

---

## License

Public Domain (The Unlicense).
