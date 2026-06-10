# ADR-0004: Minimal-Touch Edits to Partially-Visible Files

- **Status:** Accepted
- **Genre:** Tenet (cross-cutting authoring discipline) — the second
  tenet in this codebase, after ADR-0002 (fail-loudly).
- **Date:** 2026-04-25
- **Amendments:** 2026-06-11 — Revisit #1 recorded as partially fired;
  policy unrelaxed.
- **Scope:** All authoring work on this codebase, especially during
  type-system sweeps and other large mechanical refactors where many
  files are touched in close succession.

## Context

A modern Vue + TypeScript file has multiple distinct API surfaces
that the type-checker only partially polices: the `defineProps`
contract (presence and required/optional status of each prop), the
`defineEmits` contract, `defineExpose`'d methods, default values
inside `withDefaults`, slot signatures, composable dependencies,
and template-side bindings. The TypeScript compiler validates *some*
of these structurally (the type of a prop, the return type of a
composable) but not *all* of them at compile time:

- **A required prop renamed or added** silently breaks the parent's
  binding without a compile error: `<Child :foo="bar" />` continues
  to satisfy whatever the type system can see, and the failure
  surfaces only at runtime when the missing prop is dereferenced.
- **A composable dependency removed** doesn't fail to compile if the
  reimplemented logic produces a value of the same shape; it fails
  at runtime when the new logic computes a different value than the
  old one did.
- **Default values changed** in `withDefaults` produce no error
  anywhere — the parent that relied on the default never knows.
- **Template event handlers reorganised** can leave Vue's runtime
  binding in an inconsistent state if the rewrite changes the
  semantics of stop-propagation or pointer-event capture.

In all four cases, the failure mode is *silent at compile time and
audible only at runtime*. This places these failures at the most
dangerous tier of the loudness hierarchy from ADR-0002 — the tier
that ADR-0002 was specifically written to keep the codebase out of.

The risk concentrates sharply during large mechanical sweeps
(type-system migrations, strict-mode adoption, framework upgrades)
where the editor's attention is on the *one specific issue* the
build tool flagged but the *whole file* is in front of them. The
temptation is to fix the flagged issue and tidy up the rest "while
I'm in here." That tidy-up, when applied to parts of the file the
editor doesn't have full visibility into, is where silent runtime
breakage gets introduced.

This codebase's recent strict-mode build sweep produced two
concrete instances of this failure mode:

- A component's prop contract was inadvertently changed during
  what was intended to be a one-line fix, turning local helper
  functions into required props. The parent never satisfied the
  new contract; the runtime threw on first render and aborted the
  containing tab. The compiler had nothing to flag because both
  the old and new prop interfaces were valid TypeScript.
- A separate component was edited similarly; in that instance the
  reconstruction happened to be structurally accurate and no
  runtime breakage resulted, but only by coincidence — there was
  no mechanism ensuring it.

The lesson is not that one of these breakages was bad and the
other good. The lesson is that the *practice* — full-file edits
without full-file visibility — is uncalibrated, and over enough
repetitions, will introduce silent runtime breakage at a non-zero
rate. The discipline below removes the uncalibrated step.

## Decision

**When editing a file under conditions where the full source is
not in immediate view, the only changes that go in are the
specific lines the build tool, type-checker, or linter is
complaining about.** A "while I'm in here" full-file rewrite
is not permitted under these conditions.

The discipline has two cases:

- **Files visible in full.** Edit freely. Full-file outputs as the
  engagement protocol requires. The editor has the context to
  reason about the whole file's API surfaces.
- **Files visible only in part.** Edit only the specific lines the
  build tool is complaining about. If a broader rewrite seems
  warranted, request the full file first; do not produce one from
  inference. Alternatively, send a minimal diff (a patch describing
  the targeted change) for the user to apply manually, leaving the
  rest of the file untouched.

## Consequences

### Positive

- **Silent prop/emit/composable-dependency drift is structurally
  prevented**, not merely caught after the fact.
- **The cost of asking for a file is paid up-front**, in the
  cheaper currency (a single conversational turn) rather than
  later in the more expensive currency (a runtime regression that
  requires a console-output-driven diagnosis to reverse).
- **The build tool's signal stays trustworthy.** When a flagged
  error gets fixed, the editor has confidence nothing else
  changed. Bisection remains useful.

### Negative

- **Sweeps take more turns.** A type-system migration that touches
  a file the editor hasn't seen in full requires either a request
  for the file or a patch-only response — both are slower than a
  speculative full rewrite.
- **The discipline is policy, not mechanism.** Like ADR-0002, it
  lives in code review and authoring habit. There is no automated
  check that catches a violation.

### Neutral

- **No code change today.** This ADR documents a discipline for
  future authoring; it does not trigger any refactoring of
  existing code.

## Revisit when…

- A tooling change makes prop-contract drift catchable at
  compile time. (Vue + TypeScript improvements to template
  type-checking, for instance, may eventually catch some of the
  cases this tenet protects against. When they do, the policy
  can relax in proportion to the new mechanical guarantee.)

  *(2026-06-10, partial — recorded by the ADR-corpus audit: the tooling
  environment moved without yet warranting relaxation. Frontend CI has gated
  `vue-tsc -b` on every PR since 2026-06-01
  (`.github/workflows/frontend-ci.yml`), and two footgun classes adjacent to
  this tenet's Context are mechanized as lints (`local/gate-prop-needs-default`,
  `local/module-intent-in-script-setup` — see `frontend/CLAUDE.md`). The
  2026-06-10 history-lessons audit assessed this trigger as partially
  satisfied, low confidence, unverified empirically; its verification pass also
  narrowed the ceiling — the boolean gate-prop omission class is type-legal by
  design, so template type-checking cannot catch it even in principle. The
  policy stands unrelaxed until someone measures what the current checker
  actually catches of the four Context cases; that measurement is the gate for
  exercising the "relax in proportion" clause.)*
- The discipline turns out to introduce its own failure mode
  that wasn't anticipated here. (Unlikely but worth flagging
  as the trigger for revisit.)

## Related

- **ADR-0002 (fail-loudly).** The failure mode this tenet
  prevents — silent runtime breakage from a change the type
  system couldn't catch — sits at the most dangerous tier of
  ADR-0002's loudness hierarchy. This tenet is ADR-0002's
  authoring-side counterpart: ADR-0002 says "when in doubt,
  fail audibly at runtime"; this one says "when in doubt about
  the file you're editing, don't introduce changes the runtime
  will be the first to discover."
- **ADR-0001 (state mutation and `readonly`).** The same general
  philosophy — *type declarations should match actual behavior,
  no aspirational annotations* — applies here at the meta-level:
  *don't write code that asserts a contract you haven't
  verified*.

## Not goals (explicit)

- **Not a prohibition on full-file outputs.** The engagement
  protocol's full-file requirement is preserved for files visible
  in full. This tenet is specifically about files visible only
  in part.
- **Not a requirement that every edit be tiny.** Substantial,
  architecturally-significant rewrites are fine — when the editor
  has the file in full and the rewrite is itself the point of the
  commit. The tenet specifically targets the *incidental* rewrite
  that happens during a sweep focused on something else.
- **Not a slowdown for trusted hot-paths.** When the codebase
  evolves to a point where certain files are stable and well-known
  enough to edit blind safely, that's a per-file judgement call,
  not a relaxation of the general policy.
