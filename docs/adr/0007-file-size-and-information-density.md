# ADR-0007: File Size and Information Density

- **Status:** Proposed
- **Genre:** Tenet (cross-cutting authoring discipline) — the fifth
  tenet, after ADR-0002 (fail-loudly), ADR-0004 (minimal-touch),
  ADR-0005 (documentation discipline), and ADR-0006 (source-file
  headers). Sibling of ADR-0004: same failure mode, different
  intervention point.
- **Date:** 2026-04-26
- **Scope:** Source code authoring. Documentation is governed by
  ADR-0005.

## Context

ADR-0004 governs editing a partially-visible file: only touch the
flagged lines. This tenet is the prophylactic counterpart — keep
files small enough that partial visibility is rare, eliminating
the condition under which ADR-0004's reactive discipline applies.

Two metrics together do the work. **Size** caps the number of
lines a tool view has to fit. **Density** ensures those lines
carry decisions, not boilerplate. A bloated file (high size, low
density) is the worst case: tool truncations elide as much
decision content as boilerplate, and reviewers wade through noise
to find the parts that matter.

## Decision

### Size — soft thresholds

- **TypeScript / JavaScript:** target ≤ 200 lines; ≤ 300 acceptable
  for a single coherent state machine.
- **Vue SFC:** target ≤ 250 lines, with no individual section
  (`<script>`, `<template>`, `<style>`) exceeding ~150 lines.

When a file crosses the threshold, the contributor pauses and
asks whether a split is warranted before extending further. The
typical refactor moves: extract a composable (logic-heavy SFCs),
extract a child component (template-heavy SFCs), promote styles
to a shared CSS file (style-heavy SFCs).

### Density — effective lines / total lines

"Effective" lines carry decisions specific to this file's purpose
(function bodies, non-trivial computed expressions, type
declarations, conditional template branches, component-distinguishing
styles). "Boilerplate" lines do not (imports, `defineProps` without
defaults, layout wrapper elements, repeated CSS resets).

Operational thresholds at review:
- **≥ 60 percent:** healthy.
- **40–60 percent:** yellow flag — review for splitting next time
  the file is touched.
- **< 40 percent:** red flag — refactor before further extension.

### Format — content-aware contraction

Format reflects edit cadence. Content rarely hand-edited contracts
to maximize the visible budget for content that is. The discipline
is **contract the static, leave the active alone.**

| Content | Rule |
|---|---|
| **CSS** | Aggressive contraction. Single-property rules: one line. Multi-property rules under ~100 chars: one line. Longer rules: consolidated multi-line with semantically grouped properties (layout together, color together) — not one-property-per-line. |
| **Vue / HTML templates** | Moderate. Trivial elements (≤ 3 short attributes, no long expressions) one line. Up to 5 attributes if total stays under ~120 chars. Multi-line for longer or for elements with computed `:class` / event handlers / long values. |
| **TypeScript decision logic** | No contraction. Standard formatting; multi-line for clarity. |
| **TypeScript types and imports** | Contextual. Short imports and value-object interfaces may be one line; larger interfaces and import lists go multi-line. |

**Soft column cap:** ~120 characters. Beyond that, even contracted
content goes multi-line.

**The no-go.** Never contract TypeScript decision logic to fit a
size budget. Code golf in logic hides bugs behind dense lines and
inflates working-memory cost per line. If a logic file is over
budget, the answer is structural extraction, never cosmetic
compression.

## Exceptions

- **Generated artifacts** (e.g., OpenAPI codegen output) are
  exempt; size is a property of the upstream contract.
- **Coherent state machines** with density ≥ 70 percent may run to
  ~400 lines if splitting would fragment cross-line invariants.
- **Type catalogues** split along clean domain seams, not by line
  count alone.

## Consequences

**Positive.** Partial-visibility risk drops at the source. Code
review fits in working memory. Single-purpose discipline enforced
by gravity. Contraction of stable content recovers significant
budget without harming readability.

**Negative.** Some refactors are mandatory work. Discipline is
policy, not mechanism — like the other tenets, it lives in code
review. Over-fragmentation is a real risk if the rules are read
too literally.

**Neutral.** No retroactive sweep. Existing oversized files enter
a refactoring queue and are addressed when next touched
substantively, composing with the incremental-retrofit posture of
ADR-0004 and ADR-0006.

## Revisit when…

1. A linter or pre-commit hook automates the size or contraction
   rules — soft thresholds can become enforced limits.
2. Tooling context windows or truncation semantics change — the
   numerical thresholds reflect current view-tool behavior.
3. The information-density metric proves too judgmental in
   practice — replace with a more mechanical proxy.
4. A specific exception's classification turns out wrong in
   practice — the exception narrows.

## Related

- **ADR-0004** — the reactive sibling; this prevents the situation
  it mitigates.
- **ADR-0005** — the documentation analog; both compose when a
  refactor relocates and resizes simultaneously.
- **ADR-0006** — file-level companion; smaller files multiplied
  by per-file headers stay bounded as overhead.
- **ADR-0001** — file structure should match actual responsibility,
  no aspirational cohabitation.
- **ADR-0003** — smaller files make domain-coupling boundaries
  visible.

## What this tenet does NOT mean

- Not a hard line-count limit; the threshold flags, not ceilings.
- Not a mandate to split immediately; existing files retrofit
  incrementally.
- Not a critique of the Vue SFC pattern; SFCs work well when each
  section is small.
- Not a directory-organization decision; that decision is in
  flight per `decisions-deferred.md` and will produce its own ADR
  if it lands.
- Not enforced by tooling today.
