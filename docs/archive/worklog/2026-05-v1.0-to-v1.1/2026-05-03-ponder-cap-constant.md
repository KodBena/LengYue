# Ponder-cap constant — magic-literals audit Pass 2 Tier-3 #2

- **Status:** Shipped on `frontend/ponder-cap-constant`,
  2026-05-03. Single-constant addition + 3-site sweep + 1 doc-
  comment update; build green.
- **Genre:** Pass-2 substrate PR — second of the audit's Tier-3
  small substrates after the disabled-alpha PR (#106).
  Cross-cuts CSS and TS — the constant is a TS-side export
  consumed by service code, an SFC script, and an SFC template
  attribute.
- **Date:** 2026-05-03.

## Context

The magic-literals audit's Pass 1 inventory
(`docs/notes/magic-literals-audit-inventory.md` Category O)
identified `100000` as the ponder visit cap — three consumer
sites sharing the same conceptual handle ("max visits during
ponder/analysis"), no shared name. Inventory's verdict: clean
SSOT candidate, name as `PONDER_MAX_VISITS` in
`engine/constants.ts`.

## What changed

### `src/engine/constants.ts`

New export added between `MARKER_INNER_RATIO` and the color
constants:

```ts
/**
 * Maximum visits during ponder / analysis mode. KataGo's
 * analysis-engine `maxVisits` parameter caps how many search
 * iterations the engine runs per query; this value is the
 * upper bound the application uses for unrestricted ponder.
 * Three consumer sites read this:
 *   - `services/analysis-service.ts` — passes it as `maxVisits`
 *     in the wire query for ponder mode.
 *   - `components/BoardTab.vue` — uses it as the floor for the
 *     analysis-meter rugplot's intensity-gradient target so the
 *     meter doesn't saturate instantly when the user hasn't
 *     specified a deeper analyzeRange target.
 *   - `components/charts/AnalysisTimelinePanel.vue` — caps the
 *     visits input's HTML `max` attribute so the user can't
 *     request a deeper analysis than the engine will deliver.
 *
 * Tuning consideration: this is the ceiling, not the default.
 * The default `defaultVisits` is 1000 (in `store/defaults.ts`).
 */
export const PONDER_MAX_VISITS = 100000;
```

### Three sweep sites

| Site                                           | Was                | Is                      |
|------------------------------------------------|--------------------|-------------------------|
| `services/analysis-service.ts:220`             | `maxVisits: 100000`| `maxVisits: PONDER_MAX_VISITS` |
| `components/BoardTab.vue:68`                   | `Math.max(target, 100000)` | `Math.max(target, PONDER_MAX_VISITS)` |
| `components/charts/AnalysisTimelinePanel.vue:68` | `max="100000"` (HTML attr) | `:max="PONDER_MAX_VISITS"` (Vue dynamic binding) |

Each consumer site got its import list extended; the literal
at the use site collapses to the named-constant reference. The
`max="100000"` HTML attribute on the visits input was converted
from a static attribute to a dynamic Vue binding (`:max="..."`) —
the alternative was leaving it static and accepting one site of
non-substrate duplication, but the dynamic binding is cleaner.

### One doc-comment update

`components/BoardTab.vue`'s rugplot-target-floor comment block
referenced "the ponder ceiling (`maxVisits: 100000` in
analysis-service)". Post-refactor, the value lives in
`engine/constants.ts` as `PONDER_MAX_VISITS`. Comment updated
to reflect the new naming and documented home — keeps the
rationale-bearing context honest.

## What's not done

- **Other domain thresholds** in inventory Category O — `1000`
  (`defaultVisits`, already named in `defaults.ts`), `0.15` /
  `0.5` (`reportDuringSearchEvery` mode-specific cadences,
  inline-justification candidates), `999` (user_order fallback,
  twice in `defaults.ts`). Each is a separate deferred Tier-3
  or Tier-4 candidate.

## Verification

- `npm run build` (vue-tsc -b && vite build): passes.
- `rg -n '\b100000\b' src/`: returns only the
  `PONDER_MAX_VISITS = 100000` declaration line in
  `engine/constants.ts`. Zero literal `100000` consumer sites
  remain.
- ADR-0002 satisfied: missing import surfaces as a TS compile
  error.
- ADR-0004: file edits stayed minimal — each consumer site was
  a 1-line value replacement plus a one-import-list extension.
- ADR-0005 Rule 1: `engine/constants.ts` is the SSOT; the JSDoc
  names the rationale, the consumer sites, and the related
  constant (`defaultVisits` = 1000 in `defaults.ts`).
- ADR-0006: source-file headers preserved.
- ADR-0007: `engine/constants.ts` now at 95 lines (was 79);
  well under any size budget.

## License

Public Domain (The Unlicense).
