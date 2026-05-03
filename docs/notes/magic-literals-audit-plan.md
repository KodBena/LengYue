# Magic Literals Audit — Design Note

**Status:** Draft (2026-05-02); Pass 1 inventory filed 2026-05-03 at
`docs/notes/magic-literals-audit-inventory.md` (color substrate
predicate satisfied). Pass 2 (cluster + substrate-or-justify) is
the in-flight work; the inventory's "Recommended Pass 2 sequencing"
section is the working order.

**Motivation:** the codebase carries an unknown number of unjustified
literal constants — magic numbers, magic strings, magic offsets —
scattered through SFCs, composables, and engine code. Each is a
local decision frozen at authoring time without a recorded
rationale. They are functionally equivalent to `as any`: a
type-system or design-vocabulary violation accepted at one site,
visible only on review, with no compiler signal pointing at it
later. The codebase already treats `as any` as a discipline
violation (ADR-0002, the project's general posture). This document
proposes treating unjustified literals with the same suspicion.

The triggering specimen — recorded in this session's investigation
— is the PV-stone-radius `* 0.88` multiplier in
`MoveSuggestions.vue`. Three independent geometry implementations
(`BoardDisplay.vue`, `MoveSuggestions.vue`, `board-renderer.ts`) all
duplicate `stoneR = cell * 0.46`; one of them silently multiplies
by `0.88` for PV preview stones with no recorded rationale, and a
later fix engineered around the resulting size delta rather than
questioning whether the delta should exist at all. Each individual
authoring step was locally cheap; cumulatively they produced a
visible UI inconsistency whose origin is unrecoverable from the
code. The 0.88 itself is being removed in a separate fix; this
audit addresses the *class* of failure that allowed it to land
unnoticed.

The pattern is the same one named in the color-theming plan and
the cards-tab-merge plan: **a nominal handle expressed as N
independent literals, drifting because no compiler enforces
agreement, no comment captures the original decision, and no
substrate centralises the value.** Treat this as the third
instance, applied broadly, after the role-specific substrates have
landed.

---

## The framing — literals as `as any`

`as any` is suspect because it is a local override of the type
system that defeats the system's purpose at one site, with no
compiler signal pointing at it later. The codebase requires a
justifying comment for every `as any` (or omits the cast entirely),
because the cost of the override has to be visible.

A magic literal is the same shape:

- A local override of the design vocabulary (the substrate of
  named constants, role-keyed values, or shared helpers).
- Visible only on review; no compiler signal later.
- Justified or unjustified at authoring time; if unjustified, the
  rationale is unrecoverable.
- Drifts independently from sibling instances, because no
  compiler enforces that the literal at site A and the literal at
  site B describe the same nominal handle.

**The audit's contract: every literal in the codebase either lives
in a named constant in a documented location, OR carries an
inline comment at the use site explaining why it is local to
that site.** The default is "named and centralised"; the escape
hatch is "explicitly justified inline." Both are auditable. The
absence of either is the discipline violation.

---

## Sequencing — predicated on the color theming substrate

This audit depends on the color theming substrate
(`docs/notes/frontend-theming-plan.md`) landing first. Reasons:

1. **Scope cleanliness.** Color literals are the largest single
   class of magic literal in the codebase (~60 distinct values,
   many appearing dozens of times). The theming plan already names
   the substrate (three SSOT files), the role taxonomy, and the
   sweep methodology. Auditing color and "everything else"
   together would make either review impossible. The theming PR
   handles color; this audit handles the residue.
2. **Modeled methodology.** The theming plan is the worked example
   of the survey → cluster → substrate → sweep pattern this audit
   generalises. After the theming sweep ships, the same shape is
   applied — same audit-and-cluster step, same SSOT-or-justified-
   inline contract — to the remaining literal categories.
3. **A second worked example is also useful: layout / geometry.**
   The PV-stone investigation surfaced a smaller substrate-shaped
   refactor (`useBoardGeometry` + a shared `<Stone>` component)
   that is not in scope for the theming PR but follows the same
   pattern. Whether to land it as its own substrate before the
   broad audit, or as part of it, is a sequencing decision
   deferred to the audit's planning phase. Recommendation: a
   separate small substrate PR before this audit, by the same
   logic as separating color from the residue.

The audit does not block on the geometry substrate the way it
blocks on the color one — color is the largest category and the
established model; geometry is smaller and can be folded in. But
the order is: (1) color theming substrate, (2) optional layout
geometry substrate, (3) this audit.

---

## Methodology

A two-pass sweep of the frontend (and backend, scope decision
deferred to author time):

### Pass 1 — Inventory

A repo-wide scan for literal categories:

- **Numeric literals** in TS/TSX/Vue script blocks: integers and
  floats outside `0`, `1`, common math constants (e.g. `Math.PI`
  uses), and small-integer loop counters (`i < n`).
- **String literals** that encode meaningful identifiers (event
  names, registry keys, status enums, CSS class names referenced
  by JS) — distinguished from copy / labels / tooltips.
- **CSS magic numbers** in style blocks: pixel values, opacities,
  `z-index`, durations, easings — each likely a member of a
  scale that doesn't yet exist as a named substrate.
- **Magic offsets and multipliers** at use sites — the `0.88` shape
  of failure. Often look like `value * 0.X` or `value + N` with
  the constant inlined.
- **Hard-coded coordinates and sizes** — e.g. `BOARD_PX`, fixed
  panel widths, `top: -3px` fine-tuning.

For each hit: capture file:line, the surrounding context, and a
classification (which category, which substrate it would belong
in if one existed).

### Pass 2 — Cluster and decide

Group literals by nominal handle. For each cluster:

- **N > 1 with identical or near-identical values:** an SSOT
  candidate. Either define a named constant or build a small
  substrate (composable, helper module, CSS variable scope) and
  sweep consumers. The theming and geometry substrates are the
  worked examples.
- **N == 1 (truly local):** require an inline comment justifying
  the literal at the use site. The comment names the decision and
  its rationale, in the spirit of ADR-0005 Rule 6 (author as you
  decide).
- **Genuinely arbitrary (e.g. animation easing constants tuned
  by feel):** still requires the comment. "Tuned by feel during
  X session" is a valid rationale; "no comment" is not.

Each substrate that emerges from Pass 2 lands as its own small PR,
following the survey → cluster → substrate → sweep shape. The
audit's deliverable is *the absence of unjustified literals* in
the codebase — measurable by a final grep against numeric/string
literals not in an SSOT file or carrying a comment.

### Categories likely to surface (initial guess, refined during Pass 1)

Based on the existing surveys for color and the PV-stone
investigation, the residue likely includes:

- **Layout and geometry** — board geometry (covered by the
  `useBoardGeometry` substrate), panel widths, stroke widths,
  font-size multipliers. Already surveyed in the PV-stone
  investigation.
- **Animation timings** — fade durations, transition easings,
  step delays. Currently scattered as inline `${N}ms` literals.
- **Opacity scales** — `0.05`, `0.15`, `0.6`, `0.8`, `0.95` etc.
  appear inline. Likely a small named scale (3-5 values).
- **z-index ordering** — relative stacking context across panels,
  modals, overlays. Currently uncoordinated.
- **Domain thresholds** — visit minimums, recall cutoffs, score
  thresholds. Some live in `engine/constants.ts`, some are
  inline.
- **Wire-format magic strings** — registry keys, event names. The
  generated `backend.ts` covers most wire shapes; residual hand-
  written keys may remain.

---

## What this audit does *not* do

- **Does not retroactively comment trivial literals.** Loop
  bounds (`i < array.length`), boolean-equivalent literals (`0`,
  `1`, `true`, `false`), array-indexing constants, and
  mathematical identities (`Math.PI / 2`) do not require comments.
  The threshold is "could a future reader reasonably ask where
  this came from."
- **Does not introduce constants for values used once.** A literal
  used at exactly one site, with an inline comment, is the audit's
  intended steady state for genuinely local decisions. Promoting
  every one-off to a named constant would inflate the substrate
  without corresponding clarity gain.
- **Does not block on perfect categorisation.** Pass 1's
  classification is a working draft; some literals will move
  categories during Pass 2. The audit ships when the contract is
  satisfied (every literal named-or-justified), not when the
  taxonomy is canonical.
- **Does not extend to the backend by default.** Scope decision
  deferred. Python's idioms differ; the same discipline applies in
  spirit but the methodology may need adjustment.

---

## Verification

After the audit:

- A repo-wide grep for numeric literals outside SSOT files and
  outside `// magic-literal: <reason>`-commented sites returns
  zero hits in the chosen scope (frontend, with backend deferred).
- A spot check on five randomly chosen literals: each is either
  a named import from an SSOT file, or carries a one-line
  inline comment naming its rationale.
- An optional CI lint rule (parallel to the one tee'd up in the
  theming plan) can be added as a follow-up: fails the build on
  numeric or string literals matching the audit's categories
  unless the same inline-comment escape hatch is present.
- ADR-0005 Rule 1 (single source of truth per nominal handle) is
  the named rationale in each substrate-emerging PR's description.
- ADR-0005 Rule 6 (author as you decide) is the named rationale in
  the inline-comment escape hatch's design.
- The failure mode named in this note ("unjustified literals are
  `as any` for the design vocabulary") is preserved in the PR
  description as the framing.

---

## License

Public Domain (The Unlicense).
