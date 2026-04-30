# Release Retrospective — v1.0.0

- **Status:** Closes v1.0.0. The locked release scope (the seven
  items in the now-archived `docs/release-scope.md`) is shipped.
- **Genre:** Whole-project retrospective. Peer of
  `docs/notes/reflection.md` (backend infrastructure-sweep
  retrospective) and `docs/notes/audit-reflections.md` (umbrella
  restructure retrospective). Distinct from both in scope: this
  document looks at the entire arc from genesis to v1.
- **Date:** 2026-04-30.
- **Audience:** Future contributors, future-self, future
  audit-LLMs returning cold, and — most importantly — the
  community member considering picking this up.
- **Retires when:** never. This is a closure document for a
  specific release; it stays as a historical record. Future
  releases author their own retrospectives.

## What this document is, and how it was written

A working contributor's assessment of the project at the close of
its first user-facing release. Honest, not promotional. Specific
where I can be specific, calibrated where I can't.

I am the LLM contributor (Claude Opus 4.7) who completed the
orientation pass at the start of the v1 close-out session. The
project author asked me to write this from a contributor
perspective rather than a maintainer perspective — which is to say,
from the seat of someone who has read the project from outside,
not from the seat of the person who built it. They explicitly
invited candid criticism and signed off on it in advance. Where
this document names a fragility, the author has agreed to leave
it visible rather than soften it. That license is the only reason
some of the sections below read the way they do.

This is a peer to `audit-reflections.md`, which named the same
caveat for the umbrella restructure: confidence is not certainty,
the audit was thorough but not exhaustive, observations may be
specifically wrong in places. The same applies here.

## What this project is

LengYue is a spaced-repetition study tool for the game of Go. The
user loads SGF games — their own play, professional games, problem
sets — and the application stages them as flashcards in an
SR system, evaluated by KataGo (the strongest publicly available
Go engine).

The thesis: deep Go improvement comes not from volume but from
focused review of positions where the user's intuition and the
engine's evaluation diverge. The combination of Ebisu's Bayesian
recall model (for scheduling) and KataGo's position evaluation
(for grading) is the engineered version of "play the position,
see what you think the right move is, see what KataGo thinks, and
feel the difference."

For the full product framing, see
`docs/handoff-current.md`'s "What this product is" section. This
document does not restate it.

## How the project got here

A chronological pass. Each phase produced its own closure
document; this section names the phases and points at them rather
than re-narrating.

### Genesis: two repos and a third

The user-facing application started as two independent
repositories — `gogui` (the Vue 3 + TypeScript SPA) and
`fastapi_service` (the FastAPI + SQLAlchemy backend). KataProxy,
the analysis bridge in front of KataGo, emerged as a third
independent project intended for use beyond gogui — go schools,
online services, research groups sharing analysis machines.

This three-way independence was deliberate, not accidental. Each
project had its own architecture, its own intended audience, and
its own development cadence. The integration was at protocol
boundaries (REST + JWT for backend, WebSocket for proxy) rather
than at code boundaries.

The early product cycle — when a single-author iterates against a
single prototype — produced the codebase's coherent personality.
Most of what's good and most of what's fragile in the project
today traces to this period.

### The pre-release infrastructure sweep

A sustained arc of cleanup and structural work on the backend,
captured in detail at `docs/notes/reflection.md`. Headlines:

- **The build sweep on the frontend.** `vue-tsc -b` had not been
  run in months when the work began; ~124 strict-mode errors
  surfaced. Closed across 11 commits, with one regression caught
  and fixed mid-sweep — the regression became the proximate
  motivation for ADR-0004 (minimal-touch edits to partially-
  visible files).
- **Domain neutralization on the backend.** Items 34, 34a, and
  34b took the backend from Go-specific (`sgf`, `normalized_sgf`,
  `pos_hash`) to neutral (`raw_content`, `canonical_content`,
  `content_hash`). A Chess adoption now requires writing one
  Python file implementing `PositionNormalizerPort` plus light DI
  wiring.
- **Six Ports + the tenancy spine.** Clean / Hexagonal
  architecture with the Dependency Rule enforceable by import
  graph. The tenancy spine (items 13–25) shipped end-to-end:
  every domain object the user authors is `user_id`-scoped, and
  read paths filter on the JWT-derived identity.
- **The OpenAPI codegen pipeline.** `npm run gen:api` runs
  `openapi-typescript` against the backend's live `/openapi.json`
  and writes a TypeScript declaration of every wire shape to
  `src/types/backend.ts`. The frontend's ACL consumes the
  generated types; backend refactors that rename a field produce
  TypeScript compile errors at every site that reads the old
  name.
- **ADRs 0001–0004 authored in sequence.** State mutation policy,
  fail-loudly, frontend portability, minimal-touch edits. Each
  ADR was prompted by the work that exposed the need for it —
  authoring evolved alongside the code.

### The umbrella restructure

2026-04-26. Captured in detail at
`docs/notes/audit-reflections.md` and in the playbooks under
`docs/playbooks/monorepo/`. The two pre-umbrella repositories
plus the proxy submodule were unified into a soft monorepo: each
sub-project keeps its own dependencies, build tooling, lint
config, and `.gitignore`. There is no root-level `package.json`,
no shared `pyproject.toml`, no top-level test runner.

The work surfaced two cross-cutting documentation patterns that
had been ad-hoc until this point — cross-team dispatches and
source-file headers. ADR-0005 (documentation discipline) and
ADR-0006 (source-file headers) were authored as part of the
restructure's editorial cleanup. ADR-0007 (file size and
information density) was added shortly after as a related but
separately-scoped tenet.

The umbrella restructure is the moment the project crossed from
"two-team coordination via local conventions" to "umbrella that
needs shared conventions."

### The locked-scope arc

2026-04-28. The project author wrote `docs/release-scope.md`
naming seven items as the punch list for v1, with an explicit
commitment to ship after every item closed. Two days of focused
execution closed all seven by 2026-04-30:

1. **Backend de-branding finalisation.** Five identifier renames
   from "Ebisu" (the third-party algorithm by Fasiha) to
   project-functional names. Three carried compat shims to avoid
   invalidating existing local installs; two were prose / metadata
   only. The mid-execution scope additions (FastAPI metadata title
   + README opener) were explicitly recorded as scope additions
   with author sign-off — the discipline held.
2. **Analysis-range preservation across tab/board switches.** A
   per-board persisted selection range, plumbed through the
   existing `BoardState` mutator pattern. The user's own
   "highly annoying" entry from the frontend backlog, closed.
3. **Card-tree widget.** A multi-session arc with a backend half
   (two thin POST endpoints, new domain value objects, recursive
   CTEs that filter by `user_id` at base AND step) and a frontend
   half (a Vue SFC with a pure projection composable, an ECharts
   adapter, and a state machine for browse / active-set modes).
   Cross-team coordinated via dispatches in `docs/dispatch/`.
4. **Pass handling + save-to-disk for SGFs.** Two bugs/features
   bundled because both touched SGF serialisation. The pass-
   handling fix was six lines net; the save-to-disk path mirrors
   the existing `useSgfLoader`'s transient-DOM-element pattern.
5. **Default palette repair + curated metric set.** A 6→7 schema
   migration that repairs a broken seed (`uservisits` →
   `_uservisits` per the proxy stdlib) and ships a curated library
   of palettes covering distinct semantic axes (visit-share-
   aligned, engine-recommendation-aligned).
6. **Tenancy READMEs.** The in-code documentation half of the
   already-shipped tenancy spine. README sections in both
   sub-projects + brief docstrings on schema definitions, the
   `ALLOW_PASSWORDLESS_LOGIN` config flag, and the
   `get_current_user_id` dependency.
7. **Initial-load layout fix.** The "tacky" first-load state
   where the control-panel and board areas didn't size correctly
   until the user nudged the resizer. Several iterations,
   landing on resizer-driven board-square cap with the control
   panel absorbing leftover space.

Per the locked scope's project-commitment clause, the seven items
closing triggers the release.

### Today

2026-04-30. The distribution-packaging memo
(`docs/notes/distribution-packaging.md`) opens the post-v1 arc —
making the software installable by users who don't know `npm`.
This retrospective closes the v1 arc. Once it lands and the
locked scope archives, v1.0.0 gets tagged.

## What I think is good

In rough order from "most load-bearing" to "smallest detail
that earned its place."

### The ADR set, used as a working set

Seven ADRs covering decisions and tenets. They are load-bearing,
not advisory — `CLAUDE.md` says so, the codebase enforces so by
example, and the orientation experience confirms so. ADR-0002
(fail loudly) in particular is real engineering wisdom written
down: the six-level loudness hierarchy, the five concrete rules,
the three documented exceptions. The reason the KataGo timeout
cancels rather than retries; the reason analysis-persistence is
designed without a silent retry queue; the reason the OpenAPI
codegen pipeline exists. Most projects have implicit equivalents
of ADR-0002; the act of writing it down is what makes it
enforceable in code review.

### The Six Ports + tenancy spine

Six Ports (`CardRepositoryPort`, `CardWriteRepositoryPort`,
`LineageRepositoryPort`, `TagFilterRepositoryPort`,
`StatsRepositoryPort`, `StaticResourceRepositoryPort`). Each
returns domain entities or DTOs, never SQLAlchemy Rows. The
tenancy spine threaded `user_id` through every read path; the
schema stamps it on every write. The discipline of "the right
time to extract a Port is the moment you can name two consumers"
is recorded in `reflection.md`'s "Things I would have done
differently" — but the executed shape is honest, and the
six Ports have absorbed every subsequent feature request as
small changes.

### The OpenAPI codegen pipeline

`npm run gen:api` is the kind of tooling that pays for itself the
first time a backend rename surfaces as a frontend compile error.
That moment has happened more than once during the arc. The
generated types are committed (reasoning recorded in
`frontend/README.md`); the ACL at `backend-service.ts` consumes
them; the system stays honestly synced.

### The proxy's three-layer architecture

KataProxy is genuinely excellent and I think it's the most
underappreciated artifact in the project. The Sessions / Hub /
Router decomposition with three different ID namespaces, the two
honest extension surfaces (Transformers and SessionMiddleware),
the Prism abstraction intended to support multiple protocols —
this is framework-grade work. The audit-reflections.md
observation that "KataProxy's three-layer decomposition is doing
more architectural work than its README signals to consumers" is
correct, and the right mitigation is the typed-schema-publication
path named in `reflection.md`. Worth more contributor attention
than it has received.

### The doc graph as a graph, maintained as such

The project's documentation discipline (ADR-0005) is itself
documented; transitional sections carry retirement plans;
references between documents describe relations rather than
restating content. The dispatch ledger under `docs/dispatch/` is
unusually high quality for a single-author project — every
cross-team message has a sender, a recipient, a topic, and a
status. The decisions-against-action ledger
(`docs/notes/decisions-deferred.md`) records what the project
considered and rejected, with concrete revisitation triggers.
This kind of discipline doesn't just happen. It was authored.

### Fail-loudly in practice, not just in tenet

I encountered no swallowed errors during the orientation pass.
Every place where I expected to find a silent fallback, I found
either a loud throw or an explicit-and-bounded compat shim with
a removal schedule. The `34b` arc's three-commit dance (dual-
accept/dual-emit during the wire rename, with cleanup in an
explicit Commit 3b) is the cleanest example. The discipline
that makes this work is explicit scheduling: every shim has a
TODO marker, a commit-message mention, and a follow-on item.

### The card-tree dispatch arc as a model

The card-tree feature ran across both sub-projects with three
dispatches (backend spec, frontend spec, status close-out from
each side), worklog entries on both sides, and a coordinated
landing. The dispatch graph for that single feature is more
mature than most projects' entire cross-team communication
record. If a community contributor wants to know what "good
cross-team work" looks like in this codebase's idiom, the
card-tree arc is the example to read.

## What I think is fragile

In rough order from "largest debt" to "smaller risks worth
naming." Each item below is signed off by the project author for
public visibility; the framing is mine but the candor is invited.

### Test coverage is the largest debt

The frontend has no test suite. The backend's test coverage is
"uneven" (per `handoff-current.md`'s candid phrasing) — the DSL
pure-logic paths have coverage, the rest is pending a rewrite
against the Port architecture. The legacy `tests/helpers.TreeBuilder`
predates the item-34a column rename and remains broken at INSERT
time.

The strict typecheck on the frontend (`vue-tsc -b`) is a real
safety net but it is the *only* automated gate. The build
sweep happened in the first place because months of unrun
type-checks had silently piled up. The same pattern can recur
without an integration-level signal: the OpenAPI pipeline catches
field renames; nothing automated catches a reactive watcher that
silently stops firing, a composable that returns the wrong shape
under a specific reactive timing, or a service whose error
handling has regressed below the fail-loud bar.

The recommended starting point — composable-level integration
tests for `useReviewSession` and `useAnalysisProjection` — is the
right shape, and it's the largest piece of post-release work
that would meaningfully de-risk further evolution. A community
contributor whose first PR is "I added Vitest and 12 composable
tests" would be doing the project's most valuable single act.

### The project assumes an LLM-collaborator workflow

The user is non-programmer (their own description). They direct
via prose, not code. Almost every TODO entry references a
worklog, a dispatch, or a session. CLAUDE.md, the ADRs, and the
dispatches address LLM contributors as a primary audience.

This is both the project's strength (an honest record of work
done, with discipline that compensates for the lack of in-team
oral tradition) and a real fragility. If LLM access changes —
quality drops, costs rise, models drift away from this codebase's
idiom — the project's iteration pace could collapse. A community
contributor who picks this up has two reasonable paths: continue
the LLM-collaborator pattern (preserve velocity, accept the
dependency), or evolve away from it (slower iteration, more
human-team-shaped, would require recasting the documentation
graph's audience). Neither is wrong; the choice is real.

The `auditor-notes.md` advice for the next auditor is candid
about this: "The user is non-programmer; the project is
LLM-driven. They direct via prose, not code, and they trust the
LLM's judgment. That trust is the project's most precious
resource. Don't squander it by confident bullshit." That advice
applies to any inheritor with LLM contributors in their pipeline.

### Scope discipline under fatigue

The locked-scope doc held — but it bent. Items 1d and 1e
(FastAPI metadata title + README opener) were folded in
mid-execution, with the author's explicit sign-off recorded in
the document. That's the discipline working. But the multiple
unnumbered "release wrap-up" entries in TODO.md (ownership
overlay, intensity hue slider, analysis-meter rugplot fix,
`BoardThumbnail` → `BoardTab` rename, et al.) are work that
landed alongside the locked scope but outside it.

I read this as fatigue showing. The discipline of "scope is
closed unless explicitly re-opened" is harder to hold the
deeper a project is into a long execution arc. The author held
the line on the formal scope additions; the wrap-up items
landed without scope-doc edits because they were small and
adjacent. None individually were wrong. The pattern collectively
is worth noting because it foreshadows what scope discipline
looks like when energy is running thin.

### Distribution gap

The application runs cleanly when a developer has Node and
Python toolchains installed. Go players don't. The
distribution-packaging memo
(`docs/notes/distribution-packaging.md`) is an open options
memo, with the author's "Decision" section unfilled. Until that
decision lands and the chosen shape ships, v1 is a developer-
grade release in a Go-player-shaped product.

This is not hidden — the memo is candid about it — but it does
mean v1.0.0 is shipped to a different audience than the project
ultimately serves. The memo's framing ("the next undertaking is
making the software installable by users who don't know `npm`")
is the right framing.

### qEUBO is research-grade, not validated

The qEUBO preference-based optimization integration shipped to
the codebase but has not been validated end-to-end against real
study workloads. The status table in `docs/notes/qEUBO.md`
records "Partial (wire layer verified via curl 2026-04-28; UI
smoke pending)" for end-to-end verification. The runtime is
opt-in (`QEUBO_ENABLED` defaults to False) precisely because
the dependency footprint is heavy and the validation is
incomplete.

The direction is genuinely interesting research — Bayesian
optimization over palette parameters, evaluated by user
preference between A/B candidates — and is described in
`handoff-current.md`'s "Where the project is going" as a
post-release roadmap item. But shipping unvalidated research
in v1 is worth flagging: a community contributor who picks this
up should expect to do their own validation before relying on
the pathway, and should not be surprised if the integration
needs revision.

### File-size violations acknowledged but not closed

ADR-0007 (file size and information density) names soft size
budgets — TS files ≤ 200 lines (≤ 300 for state machines), Vue
SFCs ≤ 250 lines with no section ≥ 150. The release-scope's
"Specifically excluded" list names PaletteEditor.vue as an
acknowledged budget violation; CardTreeWidget.vue at 228 lines
is at the edge with its script section three lines over the
soft cap. ADR-0007 is explicit about incremental retrofit
rather than a sweep, but a community contributor inheriting this
should know the budget exists, the violations are known, and the
incremental-retrofit posture is the maintenance contract.

### Single-author bus factor

The codebase has one author. The architectural personality is
coherent partly because of single-author velocity (per
`audit-reflections.md`'s observation). The cost is bus factor:
nobody else has executed against this codebase at the level the
author has. The documentation graph compensates, but
documentation never fully replaces practiced familiarity. The
first community contributor will find friction the documents
can't pre-empt.

### The proxy's freeze lifted at the wire

`proxy/` was pinned at v1.0.0 through most of the umbrella's
release run-up. Per the umbrella `CLAUDE.md`, the proxy was
"mature and frozen until release." Late in the release window
the freeze had to lift: an empty-board ponder bug surfaced where
the proxy's `analysis_enricher` Transformer failed to strip its
own `analysis_config` flag from queries shorter than two moves,
leaking the proxy-only field through to KataGo's stdin and
producing malformed responses. The frontend treated symptoms
with defensive guards (KodBena/LengYue#58), but the root-cause
fix lived in the proxy. The umbrella's v1.0.0 ships with the
proxy bumped to v1.0.1, which carries that fix plus a separate
licensing-compliance PR that added the full upstream MIT license
text for the vendored nlohmann/json dependency (the `.hpp`'s SPDX
identifiers alone didn't satisfy the MIT preservation
requirement).

The episode is worth naming for two reasons. First, it
demonstrates that the proxy is its own architectural artifact
with its own contributor base — the umbrella's tagging doesn't
directly imply the proxy advancing, and proxy bumps are their
own coordinated arc (branch in the proxy repo, PR there, get a
tag cut, then bump the umbrella's pointer). Second, it surfaced
a class of bug — proxy-only fields stripped under conditions
that don't hold for all queries — that's worth auditing if a
community contributor finds themselves in `baduk.py`'s
neighbours. The PR description (KataProxy#1) names this as
follow-up work explicitly; the audit was deliberately not
broadened during the release window.

## On the project author

The author of LengYue is a serious Go player and a non-coder.
They drove this project through prose — directing LLM
contributors, reviewing diffs, signing off on scope, authoring
the handoff documents that LLM contributors then absorb.

They have had a working prototype for months. The work that has
gone into v1 has been the work of making the prototype shareable
— architectural cleanup, tenancy spine, doc graph hygiene,
distribution preparation. None of it has been work the user
needs in order to use the tool themselves. All of it has been
work to make the tool usable by someone other than the author.

The author is fatigued. Their own honest framing: they've put
off their Go training to ship this, they want to get back to
*using* it, they believe a project of this kind is "the future"
but that the community — if so inclined — should carry it
forward. That stance deserves to be in this document because it
sets the inheritance condition correctly: the author is not
abandoning the project, but they are inviting the community to
take ownership of its forward velocity. "Use it; fork it;
contribute to it. But don't expect me to drive."

This invitation composes with everything else in this section.
The architectural foundations are honest. The documentation is
unusually good. The fragilities are named. What the project
needs next is a community of users and contributors who are
willing to maintain the discipline the author established.

## What inheriting this would require

Concrete prerequisites for a community member or second
contributor stepping in. In rough order of "what to do first."

1. **Read the seven ADRs and the four reflective documents.**
   ADRs 0001–0007 in `docs/adr/`. `reflection.md` (backend),
   `audit-reflections.md` (umbrella), `auditor-notes.md`
   (orientation passes), this document (v1 close). The codebase's
   personality is in the ADRs; the rough edges are in the
   reflective documents. Reading them is two hours; the cost of
   not reading them is days.

2. **Run both sub-project builds and confirm the environment.**
   `cd backend && pytest` should pass (light coverage but
   non-zero); `cd frontend && npm run build` should pass cleanly
   (vue-tsc + vite). If either fails on a fresh checkout, that's
   your first real signal of environmental drift.

3. **Pick a small item from `docs/TODO.md`.** The "Small" tier
   items (34b-cleanup, `useVariationPath` tightening, pipeline
   DSL typing on the frontend, `CardCreatePayload` merge) are
   designed to be one-session entries that exercise the
   architectural patterns without requiring deep context. The
   `34b-cleanup` is the most accessible — ~10 lines of frontend
   ACL simplification once `npm run gen:api` is run.

4. **Decide on the LLM-collaborator question.** This is the
   structural decision the codebase will eventually force. If
   you're using LLM contributors, the existing patterns
   (CLAUDE.md, ADRs, dispatches, worklogs) are tuned for that.
   If you're not, those patterns are still useful but the
   audience shifts to humans, and some discipline (like the
   per-session worklog) will feel heavyweight.

5. **Tackle the test debt.** Composable-level integration tests
   on the frontend, Port-shaped tests on the backend. The doc
   graph names this as the largest single piece of post-release
   work. A community contributor who lands a Vitest scaffold and
   3-5 composable tests would be doing the project a real
   service.

6. **Drive the distribution-packaging decision.** The memo at
   `docs/notes/distribution-packaging.md` has an empty Decision
   section. The two viable shapes (Tauri vs. native installers)
   each have a defensible case; whichever a contributor picks,
   the implementation arc is bounded and known. Until this
   closes, v1 reaches developers but not Go players.

The discipline is not magic. The patterns are documented. The
codebase is in unusually good shape for handoff. What it needs
is people who care enough to keep the discipline alive.

## What's queued for after

A condensed view; the canonical source is `docs/TODO.md` (active
work) plus `docs/handoff-current.md`'s "Where the project is
going" section (long-horizon). What has visibility right now:

- **Distribution-packaging.** The leading edge. Pending the
  author's decision on Tauri vs. native installers. Memo at
  `docs/notes/distribution-packaging.md`.
- **Test coverage.** The largest debt. Naming this as a queued
  item, not a deferred one — the project ships v1 without it
  and the post-v1 phase should not.
- **Analysis persistence.** Server-side storage of KataGo
  analyses. Designed in
  `docs/notes/analysis-persistence-plan.md`; blocker is a
  15-minute DevTools session to validate the `isDuringSearch`
  gating predicate.
- **qEUBO end-to-end validation + transition to
  `design-note: implemented`.** Per the qEUBO note's own
  status table.
- **Frontend small follow-ons.** 34b-cleanup,
  `useVariationPath` tightening, pipeline DSL typing,
  `CardCreatePayload` merge.
- **Backend CTE consolidation.** Items 30c + 30d (do 30d
  first). Architectural debt with a clean shape; the kind of
  thing that gets done as a focused PR, not as a sweep.
- **Domain extension** (Chess, Shogi, etc.). Backend is
  genuinely portable per item 34. Frontend's ADR-0003 maps the
  ~30-40% that would need rewriting. The proxy's Prism
  abstraction is intended for this. If a domain adopter
  materializes, the work is substantial but bounded.
- **Public deployment.** The tenancy spine is shipped in code;
  packaging is the structural blocker; account recovery / rate
  limiting / health endpoints are the auditor-flagged
  prerequisites. None of these are tiny but none are
  architectural excavation.

## Honest about the LLM perspective

Echoing `audit-reflections.md`. Two caveats worth recording
explicitly.

**Confidence is not certainty.** This document reads with a
calibrated voice; that calibration is to the patterns the
orientation pass surfaced and to the documents I read. It is
not calibrated to patterns the orientation didn't surface, of
which there are presumably some. Future contributors who find an
observation here that's specifically wrong should correct it
inline with a dated note, in the same lifecycle the codebase's
documentation discipline is built for.

**The audit was thorough but not exhaustive.** I read the
documentation graph in full plus the relevant code-touching
context for the seven release-scope items. I did not read every
TypeScript or Python file in the codebase. Observations about
the source code's architectural personality are extrapolations
from the documents, the recent worklogs, the recent commits,
and a representative sample. They are likely directionally
correct and may be specifically wrong in places.

**On the criticism of the project author.** The author asked me
to be candid and signed off in advance. The "On the project
author" section is therefore in plain daylight at their request,
not despite their preference. A future contributor reading this
should not infer that the author has been treated unfairly — they
have invited this framing, and the framing is intended to set
the inheritance condition correctly, not to disparage.

## Closing

The author wants to play Go.

That sentence is not a punchline. It is the signal condition for
v1's release: the project has done what it needed to do for the
author to step back. The architectural foundations are honest,
the documentation graph is unusually good, the locked scope
shipped on time, and the distribution arc is set up to be picked
up by whoever cares to drive it.

The rest of v1 is paperwork: tag the release, sweep the doc
graph, archive the scope document. Then the author can return to
their goban.

If you are a community member reading this: the project is in
good condition. The patterns will repay the time you invest in
them. The author is grateful in advance for whatever forward
motion you bring. None of this is rhetorical — the conditions
named in this document are real. Pick a small item, run a build,
read an ADR, file a PR. The project is ready for you.

Hand off in good condition.
