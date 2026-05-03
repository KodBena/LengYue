# Magic Literals Audit — Pass 1 inventory filed

- **Status:** Shipped on `docs/magic-literals-audit-inventory`,
  2026-05-03. Docs-only PR; no code changes.
- **Genre:** Audit-pass artifact — produces the Pass 1 inventory
  the design note (`docs/notes/magic-literals-audit-plan.md`)
  specified, capturing the residue across the frontend codebase
  after the color theming substrate (closed 2026-05-02) absorbed
  the color category.
- **Date:** 2026-05-03.

## Context

The 2026-05-02 color theming substrate close-out left the
broader literals-as-`as any` audit predicated on having color out
of the way first. With the substrate landed (16 base anchors + 6
chart helpers + 5 role aliases in `theme.css`, plus the typed
`ChromeAnchor` accessor in `theme-color.ts`, plus 20
`theme-exception` blocks documenting deliberate exceptions), the
color category is closed and the residue can be inventoried.

The plan's two-pass methodology is **(1) repo-wide scan and
classify, (2) cluster by nominal handle and decide
substrate-or-justify**. This PR ships (1).

## What changed

### `docs/notes/magic-literals-audit-inventory.md` (new)

The inventory artifact. Sections:

1. **Methodology applied.** The literals-as-`as any` framing
   from the plan, applied verbatim. Concrete sweeps performed
   (CSS-side categories, TS-side categories, cross-cutting
   verification of existing SSOT files).
2. **Working principle: semantic consolidation, not literal
   lifting.** Names the load-bearing authoring rule for Pass 2
   — reduce the number of *distinct semantic roles*, not the
   number of distinct addresses. Two sub-principles inherited
   from the color substrate's worked example: **snap-by-cluster**
   (collapse within-JND values that serve the same role; the
   color sweep's 23:1 consolidation is the precedent) and
   **decouple-via-alias** (when two values match by accident
   but serve distinct roles, name the second role and alias it
   — `--player-white: var(--state-error)` is the worked
   example, recorded in `deferred-items.md`'s "Anchor role
   overloading" entry). Without this discipline a Pass-2 author
   could produce a dictionary of literals (`--text-8: 8px`,
   `--text-9: 9px`, …) and consider the audit closed; with it,
   the deliverable is a vocabulary.
3. **Existing SSOT baseline.** What's already centralised
   (`engine/constants.ts`, `theme.css`, `theme-color.ts`,
   `style.css`, `config/env.ts`, `lib/utils.ts`, `defaults.ts`).
   Records that the color category is swept clean post-A4.
4. **CSS-side findings (categories A–K).** Animation durations
   and easings, opacity sub-roles, z-index strata, font-size
   scale, spacing scale (gap/padding/margin), border-radius
   scale, border-width, fixed layout sizes, letter-spacing,
   color-mix percentages.
5. **TS-side findings (categories L–T).** Geometry multipliers
   (the `cell * 0.46` triggering specimen and its second-order
   derivatives), other domain multipliers,
   setTimeout/setInterval delays, domain thresholds (`100000`
   ponder cap, `1000` defaultVisits, `999` user_order
   fallback), URL path strings, discriminated-union `kind`
   strings (NOT magic literals — disclaimed), Vue `emit()`
   names, DOM event names, migration version strings.
6. **Adjacent observations.** The two-site default divergence
   between `defaults.ts` and `use-pv-animation.ts` (initially
   flagged as same shape as gradingParameter Item-18, then set
   aside pending pairwise-calibration determination — the values
   may be co-tuned for the repeating-window animation's visual
   rhythm; recorded in `deferred-items.md`); the
   not-yet-existing `magic-literal:` comment convention; the
   already-disciplined HorizontalTimelineVisualizer
   block-exception.
7. **Cluster summary.** A 4-tier prioritisation table mapping
   each cluster to a candidate substrate shape and an estimated
   PR count.
8. **Recommended Pass 2 sequencing.** Ten ordered PRs:
   z-index ladder → TS-side defaults consolidation → animation
   duration tokens → geometry substrate → spacing scale →
   font-size scale → border-radius scale → letter-spacing
   scale → Tier-3 small substrates → Tier-4 inline-justification
   sweep (the audit's deliverable).
9. **Carve-outs and exclusions.** Backend deferred; generated
   files out of scope; trivial literals exempt; band-3 domain
   literals owned by `engine/`; block-level theme exceptions
   accepted as-is; migration-frozen strings preserved per
   ADR-0005 spirit.
10. **Verification + open Pass 2 judgement calls** — five
   per-cluster decisions deferred to substrate-PR authoring
   time (duration-tier collapse, spacing-scale stragglers,
   color-mix interpolation shape, URL path centralisation
   strategy, band-3 domain-literal substrate scope).

### `docs/notes/magic-literals-audit-plan.md`

Status header updated to reference the Pass 1 artifact and note
that Pass 2 is the in-flight work, with the inventory's
"Recommended Pass 2 sequencing" as the working order.

### `docs/TODO.md`

Magic-literals audit entry: appended a "Pass 1 inventory filed
2026-05-03" status block summarising what the inventory covers
and the tiered Pass 2 sequencing it recommends. The entry stays
in Active Large tier because the audit's deliverable (Tier-4
inline-justification sweep) is still ahead.

## What's not done

- **No substrates landed.** This PR is Pass 1 — the inventory
  is a planning artifact for Pass 2. Substrate PRs follow.
- **No code edits to absorb identified clusters.** The
  cluster_id → substrate_shape decisions are deferred to the
  per-substrate PRs in Pass 2.
- **The two-site default divergence between `defaults.ts` and
  `use-pv-animation.ts`** surfaced during the inventory was
  initially flagged as Tier-1 candidate #2 (same shape as the
  Item-18 / gradingParameter finding closed yesterday). The
  user then surfaced a hunch that the four values may be
  pairwise-calibrated for the repeating-window animation's
  visual rhythm — naming "the divergence" as a redundancy
  could flatten an invariant the values hold. The consolidation
  question is set aside pending investigation and recorded in
  `deferred-items.md`'s "PV-animation defaults — pairwise-
  calibration question" entry. Surfaces a third pattern beyond
  the audit's two working principles (snap-by-cluster,
  decouple-via-alias): **co-tuned constants** — values whose
  individual identities are subordinate to a calibrated
  relationship.

## Verification

- No code changes; `npm run build` not re-run.
- ADR-0005 satisfied: the inventory is the canonical record for
  Pass 1 findings; the plan stays the design record; the TODO
  entry's status note carries the in-flight indicator. Each
  artifact has a single nominal handle, no duplication.
- ADR-0006: doc files only; no source-file headers to retrofit.
- Methodology contract from the plan satisfied: every cluster
  captures distinct values, representative sites, candidate
  nominal handle, and verdict (SSOT candidate / one-off /
  domain / already-disciplined).

## License

Public Domain (The Unlicense).
