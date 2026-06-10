# ADR Synopsis

A condensed reference to the architectural decisions and tenets that
govern this codebase. Each entry summarizes what the ADR decides and
why a contributor would care, in 1–2 paragraphs. For full context,
exceptions, and rationale, read the ADR itself.

This document is a navigational aid — primarily for LLM contributors
arriving cold and needing the codebase's architectural personality
in one read — and a quick refresher for human contributors. It is
not authoritative; the ADRs themselves are. If this synopsis disagrees
with an ADR, the ADR wins, and the synopsis needs updating. A co-change
advisory (`tools/doc-graph/cochange-advisory.mjs`) flags this file in CI
when an ADR changes without it.

<!-- derived-from: docs/adr/*.md -->

## ADR-0001: State Mutation and `readonly` Policy

**Decision.** Vue 3 reactive state containers — `BoardState`,
`ReviewSessionData`, `UISession`, `EngineState`, `AppSettings`, and
others — drop the `readonly` annotation that was previously
aspirational. Value objects (`Move`, `Point`, `EbisuModel`,
`SystemMessage`, etc.) keep `readonly` because the codebase genuinely
doesn't mutate them. The "mutate only through named mutators"
convention (`mutateBoard`, `mutateReviewSession`) is preserved as a
code-review responsibility, not a type-system enforcement — partially
mechanized since 2026-06-10 by the `local/store-write-needs-owner`
writer-enumeration lint over the `store.boards` / `store.engine` /
`store.profile` subtrees (the Revisit-#3 response; aliased writes
remain review's to catch).

**Why care.** A type that claims a property the runtime doesn't hold
is a lie. ADR-0001 aligns the type declarations with actual behavior
so future annotations regain meaning. The same philosophy extends to
the backend's mutable Pydantic models. Pinia was considered as an
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
when revision is out of scope. Filed under ADR-0002 as the
fail-loudly-register instance; its provisional-home flag retired 2026-05-17,
the deeper subject — refusing fuzzy matching when sharper classification is
available — having since been articulated as its own tenet, ADR-0008).

**Why care.** This is the most consequential single tenet in the
codebase. It is why the KataGo timeout cancels rather than retries,
why analysis persistence is designed without a silent retry queue,
why the proxy's cache controls are explicit flags rather than
implicit behaviour, why the OpenAPI codegen pipeline exists. Three documented exceptions
are listed: UI input validation fallbacks, idempotent state
transitions, and bounded-and-scheduled-for-removal compat shims. A
contribution that swallows an error or silently coerces malformed
input fights this tenet.

## ADR-0003: Frontend Portability and Domain Boundaries

**Decision.** A descriptive map of the frontend's domain coupling,
plus a forward-looking principle for new modules: "what would change
for a Chess port?" Three bands are defined — truly domain-agnostic
(would survive a port to any knowledge domain), game-tree-coupled
(survives any turn-based-game port; not a non-game one), and Go-bound
(wholesale replacement for any port). The per-file inventory is
delegated to `frontend/FILES.md` (2026-06-10 amendment, after the
inline listing drifted); the ADR retains the band definitions, the
band-mixed seam analysis, and the port sizings. The principle is
applied at authoring time, not as a refactor mandate; Ports are
extracted only when a second concrete consumer exists.

**Why care.** The principle affects how new features should be
shaped — Go-specific gating logic isolated in named functions,
storage abstractions that don't introspect their payloads, generic
seams without premature Port extraction. The "second domain adopter"
revisit trigger has fired (the maintainer's generic knowledge
flash-card fork), with a second prospective adopter filed on the
game-class axis (the `chess-clone` work-status item; its own
proof-of-concept gate is unmet), so the
seams the ADR documents are the extraction map real adopters read.
The 2026-06-10 amendment adds the non-game sizing: Band 2 *splits* —
the game-tree skeleton is replaced while the SR-orchestration flow
and the generic charting machinery survive.

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

**Decision.** Nine rules for authoring documentation: (1) single
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
register of ADR-0002 Rule 6); (9) design notes are SSOT-anchored (Rule 9,
appended 2026-06-02 — design notes live under `docs/notes/design/` and consult
records under `docs/notes/consult/`; each design note is referenced by exactly
one owning work-status SSOT item via a `design-note` ref and delegates status
to it, retiring the per-note `design-note: <status>` marker, and a
self-retiring advisory flags a note for archival when its item closes; the
design-note register of the work-status SSOT consolidation).

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
Accepted 2026-06-11 after six weeks of binding-in-practice operation;
the acceptance record names the two questions held open (the
never-measured density thresholds; bounded-vs-aspirational budgets).

## ADR-0008: Classification Discipline

**Decision.** When a choice involves classification — picking a
value from a closed vocabulary (enum, ADR band, chrome
neighborhood, documented pattern), placing a file in a taxonomy,
naming a category — the choice is honest only if the vocabulary or
taxonomy precisely fits the case. Two registers: the *positive*
(refuse fuzzy matches against an inadequate vocabulary; revise the
vocabulary instead of picking the closest fit) and the *negative*
(refuse to fabricate categories under ambiguity; default to flat /
top-level instead of inventing a synthetic parent or forcing a
"least-bad" home). Severity is calibrated by the substitution test:
what the same failure shape would cost on a critical surface, not
the observed instance's user-visible cost. Four concrete rules
(verify vocabulary fit, default to flat under ambiguity, surface
the gap visibly, apply the substitution test); three documented
exceptions (scheduled-for-revision misfits, prototype code,
deliberately-imprecise tags like `[experimental]` / `[B?]`).

**Why care.** ADR-0002 Rule 7 (closest-match selection surfaces
too) had filed itself with a provisional-home flag, anticipating
the broader principle would need its own tenet. This is that tenet.
The substrate is three postmortems on positive-register failures
(KnobDomain `'qeubo'` conflation, popover band/chrome-neighborhood
mismatch, popover-hover-pattern imitation) and two records on
negative-register failures (the `useNavigation` placement override,
the backend source-tree reorganization deferral). Rule 7 stays in
ADR-0002 as the fail-loudly-register instance with its
provisional-home flag retired; ADR-0008 is the home of the broader
principle.

## ADR-0009: Performance Investigation Discipline

**Decision.** A perf-property claim — improvement, regression, or
null result — is honest only when the investigation behind it is
captured in a form the next reader can reproduce. Three triggers
warrant a profile capture before work is considered complete
(before claiming improvement, when investigating user-reported
feel issues, before/after structural refactors of hot paths); a
canonical tool surface (Firefox DevTools Performance with Vue's
`app.config.performance = true` in dev, parsed by
`@firefox-devtools/profiler-cli`, for manual investigation; since the
2026-06-01 amendment, Chrome DevTools Performance captured via
CDP-over-Playwright — `frontend/scripts/perf-capture.mjs` with a
dedicated parser, since `profiler-cli` cannot ingest Chrome traces —
for automated and concurrent-load captures, plus CDP `HeapProfiler`
(`frontend/scripts/perf-heap.mjs`) for leak detection, and a pluggable
scenario harness for reproducible before/after pairs — recommended,
not mandated); a starting metric vocabulary (per-handler / per-frame
`RefreshObserver` / `LongTask` / GC / inter-arrival distributions;
per-component render+patch ranking with render ≫ patch read as
render-coupling; retained-heap tail-slope per cycle for leaks);
a user-local profile-share convention referenced by path +
timestamp + size, not pasted inline. Three exceptions: trivial
structural-by-inspection changes, unsubstantiated-by-design
speculative ships under explicit qualifier, worklog-internal
exploratory observations. Calibration on perception names three
orthogonal outcome classes (measurement-substantiates /
measurement-finds-nothing / measurement-contradicts), each with
its own correct response; the user being wrong about a perception
is itself a legitimate measurement outcome, not an investigation
failure.

**Why care.** The 2026-05-27 perf arc surfaced four sequenced
fixes shipped under perf-improvement worklogs and a Phase 2
keybindings dispatcher refactor that produced a near-threshold
user perception report — investigated ad-hoc via `jq` over
Firefox profile JSON with no canonical metric vocabulary, no
shared profile-share format, no pre-Phase-2 baseline. The same
week's side-by-side comparison (archived at
`docs/archive/notes/perf-investigation-tooling-comparison-2026-05-27.md`)
empirically substantiated the canonical-tool decision: per-
component attribution closed via Vue's flag, investigation time
30+min → 10min via `profiler-cli`. The pattern's structural root
is the unsubstantiated-claim shape ADR-0002 names at the runtime
register and ADR-0008 at the classification register — the perf
register was the missing piece and this tenet fills it.

## ADR-0010: Render Locality and Canvas for Data-Dense Visuals

**Decision.** Two named frontend-authoring rules. **Canvas rule:**
a fixed-size visual whose element count scales with the data and
that has no per-element layout/hit-test is a `<canvas>` job, not a
`v-for` of DOM/SVG nodes — the authoring question is "does this
`v-for` produce sub-pixel or non-interactive elements at realistic
data sizes?". **Read-locality rule:** a component reads a
high-frequency reactive value (per-nav cursor, per-packet
derivation, per-tick metric) only if its own job is to display it;
orchestration / chrome / composition nodes read structural or
low-frequency state and let leaves self-source (accessor `() => T`
at the boundary, or imperative escape via a `ref` + `watch`). The
distinguishing test is role, not mechanism. **Corollary (verbatim):**
*`v-memo` and "pull the element out of the loop" fix the patch, not
the render; a reactive read anywhere in a template re-runs the whole
render function; render ≫ patch is the tell.*

**Why care.** Both patterns recurred *after* the codebase had paid
to learn each once — `HeatmapChart`'s canvas precedent left
un-generalised until the `BoardTab` rugplot / timeline shipped as
~340 sub-pixel DOM nodes rebuilt per render; the render-coupling
postmortem (`postmortem-render-coupling-at-composition-nodes-2026-05-29.md`)
named the second pattern and proposed exactly this tenet as its
Recommendation 1, then `TreeWidget` reproduced it days later (a
partially-hardened component whose standalone `<circle>` still read
nav-reactive state, re-running the whole 762 ms render while `v-memo`
spared only the 59.8 ms patch). The proof that a describing-only
postmortem doesn't stop recurrence; the preventive sibling of
ADR-0009's reactive net. Backing: the green-arc audit
(`opus-audit-green-perf-arc-2026-05-31.md`, Question 2 / P1).

## How to read these together

The eight tenets form a coherent posture:

- **ADR-0002** says fail audibly when invariants break.
- **ADR-0004** says don't introduce silent failures by editing
  blind.
- **ADR-0005** says don't let documentation drift into silent
  failures of its own.
- **ADR-0006** says individual files identify themselves to reduce
  the cost of partial-visibility editing.
- **ADR-0007** says keep files small enough that partial visibility
  is the rare case, not the default.
- **ADR-0008** says refuse fuzzy matches against an inadequate
  vocabulary and refuse synthetic fabrications under ambiguity —
  classify only when the classification is honest.
- **ADR-0009** says perf claims are a closed vocabulary that must
  be substantiated by captured investigation, not author
  intuition — and perception is the legitimate trigger for
  investigation, never a substitute for it.
- **ADR-0010** says data-dense fixed-size visuals are a canvas job,
  and high-frequency reactive reads belong in the leaves that
  display them, not in the composition nodes that wire them — the
  preventive name for what ADR-0009's profile catches.

ADR-0002, ADR-0008, and ADR-0009 form a family of
unsubstantiated-claim disciplines at three intervention points:
ADR-0002 is the reactive register (when invariants break,
surface); ADR-0008 is the proactive classification register (when
categorising, refuse fuzzy matches and synthetic fabrications);
ADR-0009 is the per-domain instance for the performance
vocabulary (when asserting perf properties, attach the
substantiation). Together they cover the same family of failures
at different intervention points.

The two structural records — ADR-0001 (a decision) and ADR-0003 (a
bounded-context map) — describe specific structural
choices that shape how the tenets get applied. ADR-0001's mutator
convention is the discipline ADR-0002 verifies in code review;
ADR-0003's domain-coupling map is the structure ADR-0007's
file-size budgets and ADR-0005's documentation organization
ultimately serve.

A contribution against the grain of any one of these will cause
friction wherever it touches the others.

## How a fork consumes this corpus

*(Added 2026-06-11, per the ADR-corpus audit §6.8/§8.7.)* A fork — the
planned generic knowledge flash-card fork is the live case — inherits
`docs/adr/` wholesale as its decision history. The tenets transfer
wholesale, re-deriving instance lists where they name Go types.
ADR-0003 is the transfer map: read once for the seams and sizings, then
superseded by the fork's own band map. Decisions (ADR-0001 and kin)
re-evaluate against the fork's own context rather than transferring as
settled. Umbrella-bound infrastructure named by ADR-0005 Rules 2/9 (the
dispatch ledger, the work-status store) is re-instantiated, not
inherited — repo-resident handles resolve in any clone per the
stable-handles convention. Once the mechanization-discipline tenet
ships, its enforcement-surface declarations become the transfer
manifest: the fork checks each discipline's mechanism survived the
re-instantiation. New fork decisions continue the numbering with their
own records.
