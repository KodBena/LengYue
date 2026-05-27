# Keybindings Phase 2.1 — dispatcher micro-optimizations + perf-tooling notes

- **Status:** Branch
  `frontend/keybindings-phase2.1-micro-optimizations`, stacked
  on `frontend/keybindings-phase2-dispatcher` (#283). Awaiting
  user end-to-end test before PR open.
- **Genre:** Speculative micro-optimizations to the Phase 2
  registry-driven dispatcher, prompted by a Firefox-profile
  investigation of a user-reported near-threshold jitter
  perception while holding arrow keys. Also folds in tooling
  notes for future investigations.
- **Date:** 2026-05-27.

## Background — the investigation

Post-Phase-2 testing, the user reported that holding arrow
keys "feels different" / "choppier or jittery" than scroll-
wheel navigation. The feel was at the threshold of
noticeability — the user explicitly acknowledged they might be
imagining it.

The user captured two Firefox DevTools Performance profiles
for comparison:

- `~/Firefox 2026-05-27 09.02 profile.json.gz` — arrow-key hold
  (~70 keydowns over a few seconds, 660 KB gzipped / 3.3 MB
  uncompressed).
- `~/scrollwheel_profile.json.gz` — four scroll bursts (~14
  wheel events, similar size).

The profile was markers-only (no sampled stacks); analysis
proceeded via `jq` over the columnar markers array.

### Key findings

| Metric | Arrow profile | Wheel profile | Interpretation |
|---|---|---|---|
| Per-handler `keydown` / `wheel` event duration, p50 | 0.022 ms | 0.051 ms | Phase 2 dispatcher is FASTER per event than the wheel handler |
| Per-handler duration, p99 | 1.73 ms (single outlier) | 0.147 ms | Arrow has one rare hiccup; wheel is tight |
| `RefreshObserver` (rAF tick) duration, p50 | 6.05 ms | 1.84 ms | Per-active-frame work is 3.3× heavier for arrow |
| `RefreshObserver` p99 | 16.7 ms | 24.6 ms | Wheel's extremes are actually worse |
| `LongTask` count over profile | 21 (~57 ms avg) | 12 (~64 ms avg) | Arrow has more frequent long tasks |
| `GCMinor` count / sum | 12 / 36 ms | 15 / 19 ms | Arrow's GCs are heavier each |

### Verdict

No smoking-gun Phase 2 regression in the profile data. Per-
handler work is fast (22 µs at median). The 3.3× per-frame
work difference is consistent with arrow nav doing MORE work
per second of sustained input than wheel nav (because OS key-
repeat fires continuously vs the user's burst-and-pause
scrolling), and the same downstream code path
(`nav.next() → mutateBoard → Vue reactivity → render`) is
exercised by both. The more frequent `LongTask` count for
arrow plausibly accounts for the perceived jitter — it's
inherent to sustained-input modality, not Phase 2 specific.

Without a pre-Phase-2 (= Phase 1 dispatcher) profile for
direct comparison, the marginal contribution of Phase 2's
per-dispatch overhead can't be definitively isolated.

## What this PR lands

Two defensive micro-optimizations targeting the Phase 2
dispatcher's hot path. Each is small; cumulatively they trim
the per-keydown overhead, which MAY reduce the perceived
jitter (or may not — they're speculative).

### 1. Drop redundant `isActionEnabled` recheck in rAF callback

`useUserIORegistry.ts`'s rAF callback previously re-checked
`isActionEnabled(act)` before invoking the handler. The
schedule-time check (in `handleKeyDown` before the rAF
schedule) is the load-bearing gate; the recheck was defensive
against state changes in the 16.7 ms window between schedule
and fire. In practice:

- Every current handler does its own internal context-check
  where needed (e.g., the engine-ponder handler's
  `if (!activeBoard.value) return`; `nav.next` / `nav.prev` /
  etc. check `activeBoard.value` internally before
  `mutateBoard`).
- The display toggles are state-independent (just flip a UI
  flag).

So the recheck is redundant — its absence can't introduce a
bug class the per-handler checks don't already cover.

Saves: one `Proxy` trap (reactive read of `activeBoard.value`
or `store.engine.status`) per coalesced dispatch.

### 2. Direct method references for parameterless nav handlers

Four of the registry's twelve handlers wrapped a parameterless
`nav.*` call in an arrow function:

```ts
// before:
handler: () => nav.next(),

// after:
handler: nav.next,
```

For `navNext / navPrev / navHome / navEnd`, the arrow wrapper
adds an extra call frame at `act.handler()` dispatch time.
Direct method references eliminate it.

The variation handlers stay as closures
(`() => nav.variation(-1)` / `() => nav.variation(1)`) because
they pass an argument; the engine and display handlers stay as
closures because they contain side-effectful logic, not just
a method call.

Saves: one function call per coalesced nav dispatch (four
actions affected — `navNext` / `navPrev` / `navHome` / `navEnd`
— covering 100% of nav actions during arrow-hold).

### What this PR does NOT do

- **Re-architect the dispatcher.** Phase 2's shape stays
  (registry-driven, reactive `keyToAction`). Speculative
  changes only.
- **Add Vue's `app.config.performance = true`** (see notes
  below).
- **Add `@firefox-devtools/profiler-cli`** as a tooling
  dependency (see notes below).
- **Bench-mark before vs after.** The signal we're chasing is
  at the threshold of noticeability; reproducible benchmark
  would require sustained sub-millisecond measurement across
  consistent CPU state. User-side feel is the gate. If the
  user can't distinguish before from after, the optimizations
  are still defensively sound but didn't address the
  reported feel — at which point we accept the modality-
  inherent verdict.

## Perf tooling notes — for future investigations

The user named two tools worth integrating to reduce the
ad-hoc-ness of future perf investigations. Both noted here for
the proposed performance-discipline ADR (below) to formally
evaluate.

### `@firefox-devtools/profiler-cli`

A CLI wrapper around the same profile-JSON format
`profiler.firefox.com` consumes — would standardise the
parsing this investigation did with hand-rolled `jq` (marker
phase pairing, latency calculations, per-stage breakdowns).
Plausibly reduces a multi-step `jq` reverse-engineering session
to a few canonical queries.

**Recommendation:** evaluate, likely adopt as a
documented-tool dependency. Future perf investigations would
fire `profiler-cli` queries against a captured profile rather
than re-derive the parsing logic each time.

### Vue's `app.config.performance = true`

A single-line setting in `main.ts` (typically dev-only) that
instructs Vue to emit `performance.mark()` and
`performance.measure()` points for component setup, render,
patch, and unmount. These markers surface in the same Firefox
profile as the rest of the timeline — and would have made
this investigation MUCH cheaper by attributing the per-frame
6 ms of work to specific components / composables.

**Recommendation:** add to `main.ts` gated on `import.meta.env.DEV`
in a follow-up PR. The cost is negligible in dev (zero in
prod, since the flag's a no-op when set false) and the
diagnostic value during the next perf-arc is real.

### Proposed ADR — performance-discipline tenet

The user's framing was explicit: "I really don't like ad-hoc
anything." This investigation was definitionally ad-hoc — `jq`
queries derived on the fly, no canonical metric definitions,
no shared profile-share format. The codebase has had perf
arcs (the 2026-05-27 perf-audit + four-fix arc; this Phase
2.1) but no codified posture on how to investigate, what to
measure, when to profile, or how to share findings.

A short ADR (provisionally **ADR-0009: Performance
Investigation Discipline**) would codify:

- **When to profile.** Always before claiming a perf-
  improvement landed; when investigating user-reported feel
  issues; before / after structural refactors that touch hot
  paths.
- **What tools.** Firefox DevTools Performance with
  `app.config.performance = true`; `profiler-cli` for offline
  / scripted analysis.
- **What to measure.** Canonical metrics for the project's
  perf-relevant axes — per-keydown handler duration, per-
  active-frame `RefreshObserver` duration, LongTask
  frequency, GC pauses, paint cadence. (Names + percentile
  conventions defined once, reused.)
- **How to share profiles.** Gzipped JSON in a documented
  location (e.g., `~/perf-profiles/`); profile-share via
  reference into ticket / dispatch / worklog, not via
  in-message paste.
- **Acceptance criteria** for perf-claimed changes (a
  before / after profile pair attached to the worklog or
  PR).

Not in scope for THIS PR — too much surface for a defensive-
optimization commit. Flagged here as the natural follow-up;
the user can decide whether to draft now or defer until the
next perf arc surfaces.

## Verification

- `npm run build` — clean, `vue-tsc -b` no new diagnostics.
- `npm run test:run` — 665 frontend tests pass, 3 skipped
  (unchanged from Phase 2's baseline; no test surface
  touched).

User-side validation:

1. Hold arrow keys for several seconds. Compare feel against
   the wheel-scroll nav (same parity sweep as Phase 2's
   test recipe).
2. If feel is improved → the speculative optimizations did
   something; ship.
3. If feel is unchanged → the optimizations are defensively
   sound but didn't address the reported jitter; ship anyway
   (the trims are still correct), and accept the
   modality-inherent verdict from the investigation.
4. If feel is WORSE → unlikely (the changes only trim work),
   but if it happens, flag and I'll revert and investigate.

## What follows

- **ADR-0009 (proposed): Performance Investigation Discipline**
  — separate doc PR; user-driven decision on whether to draft
  now or defer.
- **`app.config.performance = true` in dev mode** — separate
  one-line PR.
- **`@firefox-devtools/profiler-cli` evaluation** — could
  ride with the ADR, or land as a separate tooling-discovery
  note.
- **Phase 3** of the keybindings arc (Settings sub-tab
  restructure) — independent of this PR.

License: Public Domain (The Unlicense)
