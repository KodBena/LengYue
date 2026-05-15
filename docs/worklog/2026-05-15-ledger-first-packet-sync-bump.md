# Ledger first-packet sync bump — close the perception-of-delay on fresh ponders

- **Status:** In flight on `KodBena/fix/ledger-first-packet-sync-bump`.
  Single-file frontend change; project author confirmed the fix shape
  before implementation began.
- **Genre:** Bugfix. The diagnosis matches the project author's
  pre-validated hypothesis ("if it's debouncing, the right move is to
  special-case the first packet"); the corrective is the minimal
  expression of that hypothesis.
- **Date:** 2026-05-15.

## Context

The project author surfaced this user-visible friction: the delay
between pressing space (or branching out of a game) and seeing the
engine's first packet rendered in the GUI is *"like a nail in the
eye, annoying but 'bearable' just at the edge of bearable."* The
natural workflow is to use space to quickly sample what the engine
thinks about an unevaluated position; perceived latency on the
first paint disrupts that.

The author invited frontend-first investigation and named the
likely shape of the corrective if it turned out to be debouncing.
This worklog records both the diagnosis and the corrective.

## Diagnosis

`AnalysisLedger.record()` in
`frontend/src/services/analysis-ledger.ts` coalesces every per-node
version-ref bump into one flush per browser frame via
`requestAnimationFrame`. Data is written synchronously to the
ledger's `Map`, but the *reactive notification* — the version-ref
increment that wakes Vue's consumers — is deferred to the next rAF
callback.

The rationale recorded in the original code is honest: NN-cache
hits and proxy replay-cache replays can produce sustained high-
frequency packet floods where every packet would otherwise re-run
every subscribed computed and re-fire every chart's `setOption`,
saturating the main thread. The coalescer earns its keep against
those floods.

But the rationale is specifically wrong for the *first packet
against an empty cache*. There is no flood — there is a single
packet, and the user is actively waiting for it. The one-frame rAF
delay (~16ms at 60Hz, more under main-thread pressure) is the
specific source of the perceived "lag" before first paint. Every
packet, first or 1,000th, paid the same delay uniformly.

The file already carried a precedent for synchronous bumping at the
*other* end of the data lifecycle: `purgeBoard` and `purgeAll`
bump version refs directly, not through the rAF queue, with the
inline comment *"intentionally bumps directly: it is a one-shot
user action that wants immediate visual feedback, not a flood
needing coalescing."* The first packet of a fresh ponder
structurally maps to that same comment — one-shot transition, no
flood, immediate feedback wanted.

## Fix

`AnalysisLedger.record()` branches on whether `existing` (the
prior cached packet for this `(hash, nodeId)`) was `undefined`:

- **First packet for this key** (`existing === undefined`): bump
  the version ref synchronously, like the purge paths do.
- **Subsequent packets**: keep the existing rAF-coalescing path,
  so the flood-protection rationale stays operational.

Data correctness is unchanged. The `Map` write happens before the
version bump in either branch; the only difference is when the
reactive notification fires.

The file-header comment block on the batched-version-bump scheduler
is extended to name both bypass cases (purge + first-packet) and
the shared rationale (one-shot transition, no flood). The branch
inside `record()` carries an inline comment explaining the
distinction.

## What this fix does NOT close

Named explicitly so future readers don't read the fix as
all-encompassing:

- **Vue effect scheduler microtask flush.** Even with the
  synchronous version bump, Vue still queues consumer re-runs as a
  microtask. Sub-millisecond, imperceptible — not a perceivable
  contributor.
- **Chart re-render time.** Once the version bump notifies consumers
  and computeds re-run, `BaseChart`'s `setOption` still has to
  reconcile the new data into echarts' render pipeline. At this
  codebase's chart sizes that's usually <10ms; unlikely to be
  perceptible alone, but a separate latency component from the rAF
  coalescing this fix targets.
- **Proxy / KataGo side contributors.** The project author
  remembered a KataGo-side special-case that they couldn't locate
  in source; that's a separate cross-boundary investigation that
  would benefit from runtime visibility into the proxy per the
  umbrella `CLAUDE.md`'s cross-boundary-bug rule. The frontend fix
  is independently valuable — closes one identified contributor —
  even if a proxy-side contribution exists.

If the perceived delay persists after this fix lands, the next
investigation step is proxy logs (`proxy/docs/logging.md`'s
demand-edge `forward` event timing) to see whether the first
packet's emission is itself delayed relative to the original query
arrival. That's a separate arc; not in scope here.

## Cross-references

- `frontend/src/services/analysis-ledger.ts` — the modified file.
  Both the file-header comment block on the rAF scheduler and the
  inline branch in `record()` document the bypass.
- `docs/notes/postmortem-knob-toolbar-popover-2026-05.md` §4 — the
  catastrophe-by-substitution test that recommends calibrating UX-
  fix urgency to the worst surface the same failure shape could
  apply to. Not directly applicable here (this is an isolated UX
  refinement, not a class-of-bug fix), but the test's spirit
  applies: per-frame rAF coalescing as a uniform default on every
  data-update path is the kind of pattern that, on a different
  surface, would produce more visible problems. Worth keeping in
  the audit register.
- `proxy/docs/logging.md` — the demand-edge `forward` event timing
  surface for any future cross-boundary investigation into proxy-
  side contributors.
- ADR-0002 (fail loudly) — applies here at the UX register: a
  perceived delay with no surfacing of "the rAF coalescer just
  delayed your first paint" is a silent UX failure of the kind
  ADR-0002 cares about. The fix is the structural correction
  rather than the loud surfacing, since the structural correction
  removes the failure mode entirely.

## License

Public Domain (The Unlicense).
