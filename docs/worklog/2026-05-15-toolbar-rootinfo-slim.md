# Toolbar rootInfo readout — slim placeholder for the user-captured display arc

- **Status:** Landed locally. Awaits user visual test (the value
  is sourced from the active board's current-node packet via
  `ledger.getRaw`; placement is in the existing
  `engine-metrics-bar` cluster between MODEL and PPS).
- **Genre:** Feature (slim-tier UI surface addition) + deferral
  marker for a larger arc.
- **Date:** 2026-05-15.

## Context

The project author surfaced 2026-05-15:

> we probably want a configurable rootInfo display so that the
> reading for KataGo's evaluation is easy to find; right now, to
> get a sense of where the game stands, you have to activate move
> suggestions and look explicitly at the blue spot. I suggest
> that the user is allowed to capture the scalars of rootInfo
> just like in the filter expression, and have them displayed,
> probably in the toolbar or thereabouts.

…and named the slim version as "good enough to just hack a wire
with winrate and score lead and add a note that the user-capture
is a later project; doing that must be a small-tier work unit".

This worklog records the slim wire. The full user-captured arc
(a `filter-expression`-style compiler over `rootInfo` scalars,
plus a configurable display surface) stays deferred.

## What changed

### `src/components/chrome/Toolbar.vue`

- Three new computeds in `<script setup>`:
  - `rootInfo` — reads the active board's current-node packet
    through `ledger.getRaw(activeConfigHash.value, currentNodeId)`,
    returns the packet's `rootInfo` or `null`. Same read shape as
    `use-move-suggestions.ts:78` (the established precedent for
    per-node reactive reads through the ledger).
  - `winrateDisplay` — formats `winrate` as a percentage with one
    decimal, e.g. "59.3%". `—` placeholder when no packet exists.
  - `scoreLeadDisplay` — formats `scoreLead` with explicit sign,
    e.g. "+3.2" / "−1.8". `—` placeholder when no packet exists.
- Two new `.metric` slots in the template between MODEL and PPS.
  Each carries an i18n tooltip naming the W-framing convention so
  the value is unambiguous without reading the source.
- One CSS rule extended: `.eval-val` joins
  `.engine-version-val, .engine-id-val` for the `white-space:
  nowrap; cursor: help` rule.

### i18n catalogues — `src/locales/{en,ja,ko,zh-CN}.json`

Four new labels per catalogue:

- `toolbar.metric.winrate` — short row label ("WINRATE" / "勝率"
  / "승률" / "胜率").
- `toolbar.metric.scoreLead` — short row label ("LEAD" / "目数差"
  / "집 차이" / "目差").
- `toolbar.metric.winrateTooltip` — names the W-framing
  ("Win probability from White's perspective." and translations).
- `toolbar.metric.scoreLeadTooltip` — names the W-framing with
  sign convention ("Score lead in points from White's perspective
  (positive = White ahead)." and translations).

## Design choices recorded for future readers

### Why hardcoded scalars instead of starting the configurable arc

Per the project author's slim-tier framing: surfacing the engine's
evaluation prominently is the user-facing win; "the user picks
which scalars and framing" is a separate, larger arc that
deserves its own design pass (the precedent is the
`moveFilterExpression` compiler — a non-trivial surface). Landing
the slim version now closes the "where does the game stand?"
discoverability gap without absorbing the configurable arc's
scope.

### Why W-framing and not "side to move" or "winning side"

`engine/katago/winrate-framing.ts` normalises every packet to
canonical W-framing before the ledger records it. The slim
surface honours that canonical framing for two reasons:

1. **Consistency with the rest of the SPA.** The chart series,
   ownership renderer, and move-suggestion overlay all read
   through the ledger's W-framed packets. Adding a SECOND
   framing convention specifically for the toolbar would be
   inconsistent and surprising.
2. **ADR-0002 (fail loudly).** A framing choice surfaced to the
   user without explicit annotation is the silent-failure mode
   the tenet forbids — the tooltip naming "from White's
   perspective" is the loud surfacing that lets the user
   interpret the value correctly. The fuller arc's
   user-configurable framing will let users pick a different
   convention with the same kind of explicit annotation.

### Why the slim version retires when the larger arc lands

The toolbar slot itself is the right shape — a prominent
evaluation-readout cluster near engine identity. When the
configurable arc lands, the two fixed metrics retire in favour
of one or more configurable slots. The inline comment on the
new computeds names this transition so a future reader sees the
deferral as a deliberate placement marker, not as the final
form.

## What this arc does NOT close

- **The configurable scalar display.** Listed as item 6 in the
  local TODO inventory (`todo_local.gitignore`). Needs its own
  design pass — surface placement, expression-compiler shape,
  what scalars are exposed (everything in `rootInfo` plus the
  enrichment in `extra.state`? just the typed scalars?), how
  framing is configured per slot.
- **A framing toggle.** Users who prefer Black-framed display
  see W-framed values until the configurable arc lands. Tooltips
  are the mitigating discipline.
- **Component / template tests.** Per `tests/CLAUDE.md`,
  component-level tests are out of scope at this stage. The
  computeds (`rootInfo`, `winrateDisplay`, `scoreLeadDisplay`)
  are inline in the SFC; extracting them to a pure module for
  unit-testability is a slight refactor the slim tier doesn't
  warrant.

## Cross-references

- `src/components/chrome/Toolbar.vue` — the surface.
- `src/composables/board/use-move-suggestions.ts` — the
  precedent `ledger.getRaw(hash, nodeId)` reactive read shape
  this arc mirrors.
- `src/engine/katago/winrate-framing.ts` — the canonical W-framing
  the slim display honours.
- `src/services/analysis-ledger.ts` — the per-node version-ref
  reactive surface the display chains off.
- `todo_local.gitignore` — item 6 (the larger arc this slim
  version is the placeholder for).
- ADR-0002 (fail loudly) — applies to the tooltip discipline:
  the W-framing convention is surfaced explicitly rather than
  left to the user to infer.
- ADR-0003 — Toolbar.vue is band-3 (Go-bound chrome via the
  rootInfo vocabulary); the underlying ledger read is band-1
  (generic versioned-cache lookup).
- ADR-0004 (minimal-touch) — only the four edits this arc
  requires: three computeds + two template slots + one CSS rule
  extension + four i18n keys per catalogue. No restructure of
  the metrics-bar cluster.
- ADR-0007 (file-size budget) — `Toolbar.vue` now ~340 lines
  (was 323); past the 250-line soft target. Refactor candidate
  when the configurable arc lands (extract the metric-bar
  cluster into a child component, decompose the eval slot into
  its own surface). Not done in this arc to keep slim scope
  bounded.

## License

Public Domain (The Unlicense).
