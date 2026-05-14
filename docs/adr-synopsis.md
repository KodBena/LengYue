# ADR Synopsis

A condensed reference to the architectural decisions and tenets that
govern this codebase. Each entry summarizes what the ADR decides and
why a contributor would care, in 1–2 paragraphs. For full context,
exceptions, and rationale, read the ADR itself.

This document is a navigational aid — primarily for LLM contributors
arriving cold and needing the codebase's architectural personality
in one read — and a quick refresher for human contributors. It is
not authoritative; the ADRs themselves are. If this synopsis disagrees
with an ADR, the ADR wins, and the synopsis needs updating.

## ADR-0001: State Mutation and `readonly` Policy

**Decision.** Vue 3 reactive state containers — `BoardState`,
`ReviewSessionData`, `UISession`, `EngineState`, `AppSettings`, and
others — drop the `readonly` annotation that was previously
aspirational. Value objects (`Move`, `Point`, `EbisuModel`,
`SystemMessage`, etc.) keep `readonly` because the codebase genuinely
doesn't mutate them. The "mutate only through named mutators"
convention (`mutateBoard`, `mutateReviewSession`) is preserved as a
code-review responsibility, not a type-system enforcement.

**Why care.** A type that claims a property the runtime doesn't hold
is a lie. ADR-0001 aligns the type declarations with actual behavior
so future annotations regain meaning. Pinia was considered as an
alternative and rejected for now (cost-benefit, blast radius); the
"Revisit when" section names the conditions that would flip the
decision.

## ADR-0002: Fail Loudly

**Decision.** When the system encounters a deviation from its stated
invariants — unexpected data, timeouts, missing resources — it
surfaces the deviation through the strongest applicable channel,
preferring compile-time errors, then build-time, then runtime
exceptions, then user-visible system messages, then console warnings,
and silent fallback only when fallback is genuinely the right answer.
Seven concrete rules: no automatic retry on real failures; type
assertions must be justified; no sentinel-instead-of-throw; ACL
boundaries validate rather than coerce; no empty catches; design-time
drift surfaces too (Rule 6, appended 2026-05-07 — extends the
principle to planning-time records and names ADR-0005's documentation
discipline as the register-specific instances); closest-match
selection surfaces too (Rule 7, appended 2026-05-15 — extends the
principle to vocabulary-fit decisions: closest-match in a closed
vocabulary that lacks a true match for the case is a silent failure,
filed visibly via sibling-note / amendment / TODO / inline-comment
when revision is out of scope. Filed under ADR-0002 with an explicit
provisional-home flag — the rule's deeper subject, refusing fuzzy
matching when sharper classification is available, is broader than
fail-loudly proper and may relocate when the wider tenet-space
articulation matures).

**Why care.** This is the most consequential single tenet in the
codebase. It is why the KataGo timeout cancels rather than retries,
why analysis persistence is designed without a silent retry queue,
why the OpenAPI codegen pipeline exists. Three documented exceptions
are listed: UI input validation fallbacks, idempotent state
transitions, and bounded-and-scheduled-for-removal compat shims. A
contribution that swallows an error or silently coerces malformed
input fights this tenet.

## ADR-0003: Frontend Portability and Domain Boundaries

**Decision.** A descriptive map of the frontend's domain coupling,
plus a forward-looking principle for new modules: "what would change
for a Chess port?" Three bands are documented — truly domain-agnostic
(store, services, generic composables; ~60-70% of the codebase),
game-tree-coupled (navigator, tree composables, review session
orchestration), and Go-bound (SGF parsing, board renderer, KataGo
wire vocabulary). The principle is applied at authoring time, not as
a refactor mandate; Ports are extracted only when a second concrete
consumer exists.

**Why care.** The principle affects how new features should be
shaped — Go-specific gating logic isolated in named functions,
storage abstractions that don't introspect their payloads, generic
seams without premature Port extraction. Following this discipline
keeps the agnostic core clean and makes a future Chess/Shogi port
viable without committing to one today.

## ADR-0004: Minimal-Touch Edits to Partially-Visible Files

**Decision.** When editing a file under conditions where the full
source isn't immediately in view, only change the specific lines
the build tool, type-checker, or linter is complaining about. A
"while I'm in here" full-file rewrite is forbidden under partial
visibility. If a broader rewrite is warranted, request the full file
first or send a minimal diff for the user to apply manually.

**Why care.** Vue SFCs have multiple API surfaces (`defineProps`,
`defineEmits`, `defineExpose`, `withDefaults`, slots, composable
dependencies, template bindings) that the type-checker only
partially polices. A reconstructed full-file output can silently
change a prop contract, an emit name, or a default value without
triggering any compile error — surfacing only as a runtime bug. This
tenet structurally prevents the silent failure mode by refusing the
authoring pattern that produces it.

## ADR-0005: Documentation Discipline

**Decision.** Eight rules for authoring documentation: (1) single
source of truth per nominal handle; (2) a shared dispatch ledger for
cross-team communications under `docs/dispatch/`; (3) reference
descriptions describe relations between documents, not content
snapshots; (4) document bodies use generic descriptors rather than
bare-named filenames for sibling references; (5) file location
reflects content, not authoring history; (6) author documentation as
you decide, not in retrospect; (7) transitional sections carry
explicit retirement plans; (8) sibling revisions over silent edits
(Rule 8, appended 2026-05-07 — the doc-graph plan's `design-note:
revised` pattern made explicit at the tenet level; the documentation
register of ADR-0002 Rule 6).

**Why care.** The umbrella restructure surfaced a recurring failure
pattern: documentation written reactively decays into low-trust
artifacts faster than the code around it. This tenet names the
discipline at the moment of authoring so reconstruction cost stays
bounded. Applies to ADRs, notes, READMEs, TODOs, HANDOFFs,
playbooks, and inter-team communications. Per ADR-0004's spirit, no
retroactive sweep — incremental retrofit when files are touched.

## ADR-0006: Source-File Headers

**Decision.** Every source file in `frontend/` and `backend/` carries
a header with three parts: pathname relative to subproject root, a
brief purpose statement, and a license declaration. For TypeScript
and `.ts` files, this is a JSDoc block at the top. For Vue SFCs, the
JSDoc lives at the top of the `<script>` block. For Python, it is
the module docstring. Generated files, configuration files, and
`__init__.py` are exempt.

**Why care.** A file pasted into a chat, a PR diff, or a code-search
result identifies itself; this composes directly with ADR-0004's
partial-visibility discipline. The license declaration matters at
the moment any single file gets vendored, copied, or reposted
outside the project. Per ADR-0004's spirit, no retroactive sweep —
headers accumulate naturally as files cycle through normal editing.

## ADR-0007: File Size and Information Density

**Decision.** Source files target soft size budgets — TypeScript
files ≤ 200 lines (≤ 300 for coherent state machines), Vue SFCs ≤
250 lines with no individual section exceeding ~150. Density
matters as much as size: the ratio of effective lines (decisions
specific to this file's purpose) to total lines should stay above
60 percent. To recover budget without structural refactor when
appropriate, formatting contracts content rarely hand-edited (CSS
aggressively, templates moderately) while leaving TypeScript
decision logic untouched. The hard prohibition: never compress
logic to fit a budget — that's code golf and inflates working
memory cost per line.

**Why care.** Large files are the condition under which ADR-0004's
reactive partial-visibility discipline has to apply; this tenet
prevents the condition. The contraction rules acknowledge that the
working-memory cost of a file isn't just line count — it's
content-aware. Refactoring oversized files is incremental, not a
sweep, composing with ADR-0004's and ADR-0006's retrofit posture.
Status as of authoring: Proposed.

## How to read these together

The five tenets form a coherent posture:

- **ADR-0002** says fail audibly when invariants break.
- **ADR-0004** says don't introduce silent failures by editing
  blind.
- **ADR-0005** says don't let documentation drift into silent
  failures of its own.
- **ADR-0006** says individual files identify themselves to reduce
  the cost of partial-visibility editing.
- **ADR-0007** says keep files small enough that partial visibility
  is the rare case, not the default.

The two decisions (ADR-0001, ADR-0003) describe specific structural
choices that shape how the tenets get applied. ADR-0001's mutator
convention is the discipline ADR-0002 verifies in code review;
ADR-0003's domain-coupling map is the structure ADR-0007's
file-size budgets and ADR-0005's documentation organization
ultimately serve.

A contribution against the grain of any one of these will cause
friction wherever it touches the others.
