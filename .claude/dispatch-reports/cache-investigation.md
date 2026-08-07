# Cache investigation — "cache isn't actually used" + SPA display

Maintainer's issue (verbatim in dispatch): possible KataProxy cache bug; the
proxy can disable caching at startup and this isn't shown in the SPA in two
places (settings toggle location, version-tooltip capabilities); the SPA
should be able to *infer* cache presence even if the proxy doesn't advertise
it.

## Docs read

`proxy/ARCHITECTURE.md` (Layer 2 / Hub section), `proxy/pubsub_hub.py`
module docstring + `CacheStore`/`LRUCacheStore`/`subscribe`/`_replay_task`
in full, `proxy/sproxy_config.py` (`HUB_CACHE_MAX`), `proxy/katago/katago_proxy.py`
(`_PROXY_ONLY_FIELDS`), `docs/wire-schemas.md` §7, `frontend/src/store/defaults.ts`,
`frontend/src/services/analysis-service.ts` (cache-flag call sites),
`frontend/src/components/chrome/ToolbarEngineMetrics.vue` (version tooltip).

## PART 1 — is the cache actually used? WITNESSED

**Verdict: conditional-on-X. The replay cache mechanism itself works
correctly (a real `cache_hit` fires on a repeat query), but the proxy's
per-message delivery path re-imposes near-real-time pacing on the replayed
stream, so the user sees essentially no latency win — the "cache isn't
actually used" symptom is real, but the defect is not a dead/bypassed cache;
it's a proxy-side pacing site downstream of the cache that erases the
cache's benefit.**

### Setup (WITNESSED)

- Running proxy: pid 460388, `python -m proxy_server`, env
  `PROXY_ROLE=SELECTOR PROXY_PORT=1235 PROXY_ADVERTISE_CAPABILITIES=true`.
  **No `PROXY_HUB_CACHE_MAX` set** → default 1024 (`sproxy_config.py:141`), i.e.
  the hub's replay-cache store is instantiated and enabled — this running
  instance was NOT started with caching disabled. (I found no env var or
  CLI flag anywhere in `proxy/` that disables the cache layer outright;
  `PROXY_HUB_CACHE_MAX=0` means *unbounded*, not disabled, per
  `LRUCacheStore`'s own docstring — worth flagging to the maintainer as a
  possible naming/expectation mismatch on "disable the caching layer.")
- Drove the production `vite preview` build at `http://127.0.0.1:4173` via
  `playwright-core` + `/usr/bin/chromium`, headless — same proven method as
  `sgf-pass-diagnosis.md`. Engine URL field was already `ws://127.0.0.1:1235`
  (unmodified). Connected, `query_version` confirmed `v1.17.1`, SELECTOR
  capabilities `{delta_analysis, adaptive_reevaluate, transposition,
  selector}` — **no `cache` capability key at all**, positive or negative.
  Selected model `14`. Loaded `/home/bork/lost_games/30996072.sgf` (the same
  specimen as the prior sgf-pass dispatch).
- Settings → Advanced Registry: `cache` and `lookup_cache` checkboxes both
  default **unchecked** (matches `defaultSettings.engine.katago.cache =
  false` / `lookup_cache = false` in `frontend/src/store/defaults.ts:28-29`).
  I checked both for the duration of the test, then **unchecked both again**
  at cleanup (verified via a fresh page load reading the checkboxes back as
  unchecked).

### Repeat-query test (WITNESSED, CDP `Network.webSocketFrame*` capture)

Ran the identical full-game analysis query (`Analyse Selection`, 249 nodes,
300 visits, model `14`) twice in the same session, back to back.

- **Run 1** (live, `cache:true lookup_cache:true`, cold): proxy log —
  `subscribe ANALYZE` at `15:14:41.641`, `cached 497 responses for
  cache_key=fc41d694e391841820ffdccf…` at `15:14:57.029`, `complete
  (16288ms)` at `15:14:57.933`. **16.3s wall time**, genuine live search
  (`isDuringSearch: true/false` interleaved, out-of-order turn numbers as
  the engine explores).
- **Run 2** (repeat, same params): proxy log shows a **real `cache_hit`**
  event: `{"event":"cache_hit","cid":"replay_4121f20ea21d3c23","orig":"range-…1786022096125","cache_key":"fc41d694e391841820ffdccffddb02ba", ...}`
  at `15:14:59.292` — same `cache_key` as run 1's saved record, confirming
  the coalescing/cache-key hash correctly recognized the repeat as
  identical. **This refutes "the cache is never consulted."**
- **But the replay is not fast.** Per the proxy's own log for the replay
  `cid` (`replay_4121f20ea21d3c23`): first `forward` at `15:14:59.368`, last
  `forward` at `15:15:11.770` — **≈12.5 seconds** to deliver the ~500
  already-recorded messages, essentially the same wall-clock cost as run 1's
  live computation. Browser-side CDP capture corroborates: 420 frames for
  the run-2 query id spanning **12.165s** (`run2-frames-trimmed.json` /
  `run2_done.png` in this report's asset folder), not the "the whole
  recorded stream arrives near-instantly" behavior a cache hit should
  produce.

### Root-cause site (proxy-side — STOP here, not fixed)

`proxy/pubsub_hub.py::_replay_task` (`pubsub_hub.py:369-408`) itself has no
throttle — it's a plain `for wire in cached_record: ... await
subscriber_queue.put(relabelled); await asyncio.sleep(0)`, i.e. the hub
drains a cache hit as fast as the event loop allows. The pacing therefore
happens **downstream**, in `proxy_server.py::ClientSession._deliver_upstream`
(`proxy_server.py:762-893`): every dequeued message — replayed or live,
`_deliver_upstream` has no branch distinguishing the two — is run back
through `self._middleware.handle_response(...)` (session middleware chain:
`middleware/session_middleware.py`, `middleware/adaptive_reevaluate.py`,
`delta_analysis.py`'s CWT pipeline with its `Monitor(cwt_throttle_ms=500)`
real-time gate) before being written to the websocket. That middleware
stack was designed to pace/react to a *live, still-computing* backend
stream; applied uninformed to an already-complete cached stream, its
timing/orchestration gates reproduce close to the original wall-clock
cadence. **This is the site**: `proxy_server.py::ClientSession._deliver_upstream`
does not know or care whether the wire it is delivering came from
`_replay_task` (cache) or a live router response, so a cache hit still
pays for the full middleware-imposed pacing. Per this dispatch's scope,
proxy fixes are commissioner-present work — named here, not touched.

### Capability advertisement (WITNESSED)

`query_version`'s `capabilities` object (captured verbatim above) carries no
`cache` key in either register — the proxy neither advertises caching is on
nor that it is off. `docs/wire-schemas.md` §7 confirms `cache`/`lookup_cache`
are proxy-only wire fields (`_PROXY_ONLY_FIELDS`), stripped before reaching
KataGo and never round-tripped back to the client as capability metadata.
So the maintainer's premise — "the proxy doesn't advertise it either way" —
is confirmed exactly as described.

### Screenshots / evidence (this report's asset folder, `.claude/dispatch-reports/cache-investigation-assets/`)

`connected.png` (version/capabilities tooltip after connect — no cache
info), `run1_done.png`, `run2_done.png` (post-run board states),
`after_close.png` (cleanup), `run1-frames-trimmed.json` /
`run2-frames-trimmed.json` (sent queries + first/last 5 received frames per
run, trimmed from the full ~4MB captures for size).

## PART 2 — SPA display design

### (a) Settings surface

Today the only place `cache` / `lookup_cache` / `replay_final_only` are
exposed is the generic Advanced Registry key/value editor
(`frontend/src/components/editors/RegistryEditor.vue`) under `engine →
katago` — three bare checkboxes with no framing, buried among ~15 unrelated
knobs (`bundleCompressionScheme`, `ponderMaxVisits`, `watchdogAnimationMs`,
...). This matches the maintainer's complaint precisely: nothing calls out
"caching" as a first-class, discoverable setting.

Proposed: promote a small "Caching" sub-section into `SettingsTab.vue`'s
**Session (UI)** or a new **Engine** settings pane (sibling to `Analysis
Environment`), with:
- A single labelled toggle group: "Record responses to cache" (`cache`),
  "Replay from cache when available" (`lookup_cache`), with inline help
  text naming the tradeoff this investigation surfaced — *"a cache hit does
  not currently arrive faster than a live query; see proxy issue [ref]"* —
  so the toggle's behavior is honestly described rather than implying an
  unearned speed benefit. `replay_final_only` stays in the registry editor
  (power-user knob, not a common toggle).
- The existing registry-editor entries remain (no removal — some users rely
  on the raw editor) but the promoted toggle and the registry checkbox
  should read/write the same `store.profile.settings.engine.katago.cache`
  field so they can't drift.

### (b) Version tooltip

`ToolbarEngineMetrics.vue`'s `versionTooltip` (line 117-122) currently
dumps only the raw `query_version` response JSON. Two additions:

1. **Advertised (if the proxy ever adds a `cache` capability key)**: render
   it verbatim from `payload.capabilities.cache`, same as the other
   capability keys — this is the "positive or negative register" case the
   maintainer names; today there is nothing to render because the field
   does not exist on the wire (confirmed above), so this is forward-looking
   only.
2. **Inferred (works today, no proxy change needed)**: append a line "Cache:
   {enabled, per your settings} — not confirmed by probe" or similar,
   sourced from the SPA's own `store.profile.settings.engine.katago.cache`
   /`lookup_cache` flags — this is not an inference about the *proxy's*
   state, only a readback of what the SPA is *asking for*. True inference
   (whether the proxy is honoring the request) needs an active signal; see
   below.

### Inference design (per C6 — inferred state renders as inferred, never as fact)

The evidence this investigation gathered supports exactly one honest
inference mechanism: **a repeat-query latency/cache_hit signal is not
observable from the wire today** — the wire's replayed stream is
byte-identical in shape to a live stream (same `isDuringSearch` progression,
no cache marker field anywhere in the KataGo response schema per
`docs/wire-schemas.md` and my captured frames), and — per Part 1's own
finding — even a genuine `cache_hit` no longer arrives conspicuously faster
than a live run, so **latency-based inference is not currently reliable
either** (the proxy-side pacing defect directly undermines the one signal
the SPA could otherwise use). Given that, the only inference honestly
supportable today is low-confidence:

- **Confidence: low.** A small connect-time probe — send the same trivial
  analysis query twice at connect (e.g. root position, 1 visit) and compare
  wall-clock latency — could detect a cache_hit if the proxy's pacing
  defect above is ever fixed, but **as measured live in this session, it
  would currently show no distinguishable signal** (12.5s replay vs 16.3s
  live is a real but modest ~25% difference at this response count, and
  would be far less distinguishable at the SPA's typical smaller queries).
  I recommend **not** shipping a latency-probe inference until the
  proxy-side pacing defect is fixed — it would frequently render "cache:
  probably off (inferred)" when the proxy-side truth is "cache: on, but
  paced," which is a worse UX than admitting "unknown."
- The SPA's best honest move today is to show what it can state as fact —
  its own `cache`/`lookup_cache` request flags (not inferred, just a
  settings readback) — and label the *proxy's actual behavior* as
  **"unknown — proxy does not advertise cache capability"**, never
  silently implying the flags are effective.

## Hygiene

Registry `cache`/`lookup_cache` checkboxes reverted to unchecked (verified
via fresh page reload). The board created for this investigation (loaded
specimen, `yj9831 vs ismcts`) was closed via its tab's `.close-board-btn`.
All scratch Playwright scripts and full-size screenshots were removed from
`frontend/`; `git status --porcelain frontend/` is clean. No proxy file was
modified, restarted, or reconfigured — read-only inspection only
(`/proc/<pid>/cmdline`, `/proc/<pid>/environ`, `~/w/vdc/proxy.log`).
