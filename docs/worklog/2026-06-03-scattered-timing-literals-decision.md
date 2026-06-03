# Worklog — scattered timing literals: decision (2026-06-03)

## Trigger

Work-status item `scattered-timing-literals` (frontend / small) — a **decision**
item, not an action one: `timing.ts` centralises the reactivity-coalescing
windows, but the adjacent timeouts / durations / interaction-delays
(`KATAGO_ANALYSIS_TIMEOUT_MS`, `DEFAULT_TIMEOUT_MS`, `REVEAL_DURATION_MS`,
`DEFAULT_CLOSE_DELAY_MS`, …) live scattered. The item framed three options:
**leave / sibling catalog / sectioned `timing.ts`**.

## Inventory (what's actually out there)

A sweep of `frontend/src` for non-coalescing timing literals found ~30 distinct
values across the expected categories — timeouts (analysis 30 s, play 60 s),
display duration (log reveal 8 s), interaction delays (popover / suggestion
close 150 ms), animation durations (PV step/window, chart init-retry 100 ms,
forest-render retry 50 ms), polling/cadence (telemetry 1 s, watchdog 5 s), and
dev-only perf-harness half-periods. **Every one is already magic-literal
compliant** — a named constant with a docstring, or an inline literal with a
`magic-literal:` comment. CSS-side durations (`--duration-default`,
`--duration-slow`) and user-configurable cadences (persistence debounce, KataGo
report cadence) are governed elsewhere (theme tokens / settings registry) and
are out of scope by construction.

## Decision: LEAVE in place

`timing.ts` deliberately scopes itself to **coalescing windows** (its header
says so, and names "family discipline": collapsing constants that answer to
unrelated decisions is the failure it exists to prevent). The scattered timing
literals are a *different family* — each already compliant, each living closest
to its consumer. Folding them into `timing.ts`, or minting a sibling catalog,
would manufacture a category whose only commonality is the word "time" — the
synthetic-classification failure ADR-0008 (negative register) warns against, and
the coupling `timing.ts`'s own family-discipline note forbids. The distribution
is correct, not accidental. So the consolidation work is **declined** (the SSOT
item closes `dropped`); a re-open stays available without prejudice if a concrete
need to tune them as a set ever surfaces.

## What changed (incidental cleanup)

`frontend/src/lib/timing.ts` header only: its scope paragraph pointed at the
deferred-items ledger ("Scattered non-coalescing timing literals") — dissolved
in the 2026-06-02 doc consolidation, so a dangling reference.
Replaced with the settled decision stated inline (no external pointer to go
stale). No constant, value, or runtime behaviour changed.

## Verification

`npm run build` green; `eslint` clean. Comment-only change. Closes
`scattered-timing-literals` (`dropped` — decision recorded, consolidation
declined).

License: Public Domain (The Unlicense).
