# CLAUDE.md — Umbrella

You are working on **LengYue**, a spaced-repetition study tool for the
game of Go. The codebase is a soft monorepo of three peer sub-projects:
`frontend/` (Vue 3 + TypeScript SPA), `backend/` (FastAPI + SQLAlchemy
service), and `proxy/` (KataProxy, a git submodule). Each sub-project
is independently developed; none is subordinate to the others.

For orientation, read `README.md` and `docs/handoff-current.md`. For
architectural decisions, the canonical reference is `docs/adr/`; the
condensed reference is `docs/adr-synopsis.md`. Read the synopsis
before substantive work; consult specific ADRs when the synopsis
points to one.

## Authoritative documents

The ADRs are load-bearing, not advisory. In particular:

- **ADR-0002 (fail loudly)** governs error handling everywhere.
- **ADR-0004 (minimal-touch)** governs editing under partial visibility.
- **ADR-0005 (documentation discipline)** governs how documentation
  is authored and maintained.
- **ADR-0006 (source-file headers)** governs the per-file header
  convention.

A contribution that fights any of these is wrong by default; if a
specific case appears to warrant deviation, name it explicitly and
ask before proceeding.

## ADR-0002 applies to documentation consumption (LLM collaborators)

ADR-0002 (fail loudly) applies with special force to LLM collaborators
reading documentation for orientation. **The single gravest sin against
ADR-0002 is to fail to read a piece of documentation from beginning to
end, and then make any statement that references any part within it, no
matter how small.** Failing loudly here means the user is never in the
dark about whether the collaborator has actually seen the document being
referenced. An LLM collaborator must never consume documentation
partially.

Concretely:

- Orientation documents — `README.md`, `docs/handoff-current.md`,
  `docs/adr-synopsis.md`, every ADR cited, every CLAUDE.md in scope,
  every open dispatch under `docs/dispatch/` addressed to the current
  sub-project — are read end to end before any claim about them is
  made. The same applies to any further document those orientation
  documents point at, when that document is the one being relied on.
- A `grep`, search-tool hit, code-aware-IDE preview, or other partial
  render is a pointer to read the file, not a substitute for reading
  it. Acting on a fragment is the silent failure this section names.
- If a document is too long to read in full given the immediate
  budget, say so explicitly — name what was read, what was skipped,
  and what the skipped portion might affect — and ask the user how to
  proceed. Do not paper over the gap.
- A statement that cites a section, an ADR number, a heading, a
  filename, or a sentence from a document the collaborator has not
  read end to end is itself the silent failure ADR-0002 forbids.
  Surfacing the gap audibly is the only correct move.

This composes with ADR-0004 (minimal-touch under partial visibility):
when context is missing, ask for it; when context is present but
unread, read it; either way, do not bluff.

## Documentation is part of the work

Implementation is incomplete until the documentation graph reflects
it. Before declaring a task done or filing a PR, audit:

- Does `docs/TODO.md` need updating to mark items complete or to
  record items the work surfaced?
- Does `docs/handoff-current.md` describe a surface this change
  affects, and is the description still accurate?
- Does `FEATURES.md` need a new entry, an updated description, or
  a removed entry? See "User-facing tour (FEATURES.md)" below for
  the full discipline.
- Does `frontend/FILES.md` need a new entry, a moved entry, a
  band re-tag, or a removed entry? See the frontend `CLAUDE.md`'s
  "File map" section for the full discipline.
- Does any ADR's "Revisit when…" section name a trigger this change
  satisfies?
- Does any cross-reference in the doc graph now describe its target
  inaccurately?
- Per ADR-0006, if files were touched under full visibility and lack
  the standard header, retrofit it.

If yes to any, propose the documentation edits as part of the same
change. Code-only PRs that have documentation implications are
incomplete deliveries.

## User-facing tour (FEATURES.md)

`FEATURES.md` at the umbrella root is a descriptive tour of every
user-facing surface of the application — board / analysis /
cards / browse / power-user customisation / qEUBO / workspace /
auth. It exists because the SPA's surface has outgrown the
project author's ability to enumerate features from memory, and
because prospective users (the philanthropic-mission target
audience: serious Go students who do not necessarily read code)
need a canonical "what does this do" without trawling the source
tree.

It is a **tour**, not a marketing list — descriptive, honest
about state, organised by user surface rather than by
implementation category.

### When to update it

When you ship a change that adds, removes, or materially alters
a **user-facing capability**, update FEATURES.md in the same PR.
The bar is "would a Go player reading the tour misunderstand
what the application offers if this isn't reflected?" — if yes,
update. Pure internal refactors, bug fixes that preserve
behaviour, and code-only restructures don't need FEATURES.md
edits.

### State qualifiers (the immature-feature allowance)

A feature that ships but hasn't been validated end-to-end gets
tagged `[experimental]`. One whose backend exists but whose UI
is still being wired gets `[partial]`. One the architecture
supports but which hasn't been built yet gets `[planned]`.
Untagged entries are stable, validated, ready for users.

Refining the tag as a feature firms up is expected; pretending
a feature is settled when it isn't is the failure mode the
qualifiers prevent. This parallels the
`frontend/FILES.md` immature-files allowance (the `[B?]`
unclassified band tag for files whose domain-coupling hasn't
crystallised).

### What NOT to put in FEATURES.md

- Internal architecture (Components / Composables / Services
  layering, branded types, the ACL pattern). Lives in
  `frontend/CLAUDE.md` and `docs/handoff-current.md`.
- Build / lifecycle / contributor workflow. Lives in the
  per-sub-project `README.md`.
- Architectural decisions. Live in `docs/adr/`.
- Project-level status (release retrospectives, current
  in-flight work). Lives in `docs/handoff-current.md` and
  `docs/notes/release-retrospective-*.md`.

The tour describes capabilities a user can exercise; it doesn't
describe how the team builds them.

## Dispatch ledger for cross-team work

Cross-sub-project communications are filed under `docs/dispatch/`
following the convention `{from}-to-{to}-{topic}.md`. When a piece
of work has implications for another sub-project (a needed endpoint,
a wire-shape change, an integration assumption), the right first
step is often a dispatch document — not direct implementation.
Existing dispatches in the directory are the format reference.

When starting a session, check `docs/dispatch/` for open requests
addressed to this sub-project and surface them. Do not silently
implement against a dispatch without flagging it; the user signs off
on the response, and a status dispatch back to the requester is part
of the deliverable.

## Scope discipline

Sessions are scoped to a sub-project unless the work is explicitly
umbrella-level. Do not propose changes outside the sub-project's
tree without surfacing the cross-boundary nature first.

## On the proxy submodule

`proxy/` is KataProxy, a git submodule. The pre-release freeze that
originally covered the proxy was lifted during the umbrella's v1.0.0
release window — a bug surfaced (empty-board ponder via
`analysis_config` leakage) that warranted a coordinated proxy bump
rather than a frontend-only workaround. The current pin is **v1.0.21**;
later bumps follow the same coordinated arc. The proxy's tag
annotations carry the full per-release changelog; the prose below
sketches the recent arc only deeply enough to orient cross-boundary
work.

The v1.0.13–v1.0.15 arc was structural: v1.0.13 split `KataGoResponse`
into a discriminated `AnalyzeResponse | MetadataResponse` union and
renamed the cryptic top-level modules; v1.0.14 introduced two-sided
capability negotiation (a `capabilities` dict on `query_version`
responses gated by `PROXY_ADVERTISE_CAPABILITIES`, plus a symmetric
per-query opt-in on the analysis query payload) carrying three
behavioural capabilities (`delta_analysis`, `transposition`,
`adaptive_reevaluate`); v1.0.15 added the SELECTOR role — a fourth
Layer 3 `BackendRouter` peer that dispatches per-query against a
labelled upstream pool via the wire `model: string` field, with the
`selector` capability advertised in the version response and
`query_models` extended to enumerate the labelled set. See those
tag annotations for the contracts.

The v1.0.18–v1.0.19 arc was corrective: both surfaced the heartbeat-
fanout contract documented in `proxy/CLAUDE.md`. v1.0.18 fixed
SELECTOR's `QUERY_VERSION` / `TERMINATE_ALL` / `CLEAR_CACHE` routing
to broadcast to every healthy upstream rather than the first one
(the prior shape silently broke per-session keep-alive watchdogs on
non-first models); v1.0.19 fixed the same root cause on RELAY's
hash-ring side. Both ship with regression tests and topology
diagnostics under `tests/diagnose_watchdog_*.py`. See the umbrella's
`docs/archive/notes/postmortem-selector-watchdog-2026-05.md` for the
diagnosis arc.

v1.0.20 is the institutional structured-logging release. The
proxy's log surface is rewritten end to end — closed `Event`
vocabulary with per-event required-field schemas validated at the
call site (ADR-0002 applied to logging), three formatters
(console / logfmt / JSON) selected by `PROXY_LOG_FORMAT`, role-
tinted bind chains carrying role/session/upstream/label/cid/orig as
structured fields, and demand-edge `forward` events at INFO so
operators see when each authoritative response reaches the SPA
without partial-flood noise. The release also lands an
adaptive_reevaluate streaming refactor that stops the long-standing
"ranges feel batchy" symptom: original finals now stream
immediately as `is_during_search=True` previews and promote to
authoritative `is_during_search=False` once the worst-quantile
decision is in. Operator runtime view in `proxy/docs/logging.md`;
authoring conventions in `proxy/CLAUDE.md`'s logging-conventions
section.

v1.0.21 bundles two independent arcs. The defensive corrective is
in `adaptive_reevaluate`'s sub-query enrichment path: the
user-visible symptom was deeper-analysis responses arriving with
empty `extra.state`, so SPA palette state-fns reading
`rootInfo.visits` never updated after deepening. Two interlocking
causes (a `_are_equal` short-circuit in `DeltaAnalysisState.push_packet`
that dropped identical-content D/F packets, and a destructive pop
of `analysis_config` in `analysis_enricher.on_query` that left
sub-queries un-enriched) are fixed in `delta_analysis.py` and
`transformers/analysis_enricher.py`; the regression test in
`proxy/tests/test_adaptive_cache_matrix.py` is parametrised across
all four meaningful cache flag combinations.

The structural arc in v1.0.21 is the identity-type branding
migration. The four namespaces a proxy chain crosses
(`client_id → internal_id → canonical_id → wire_id`) are now
distinct branded types (`ClientId`, `InternalId`, `CanonicalId`,
`WireId`) via `typing.NewType`, runtime-identity with `str` but
typecheck-distinct. The framework's `IdMapping`, `IdGenerator`,
`Translation`, and `ProxyLink` are parameterised on the upstream /
downstream namespace pair `(U, D)`; the brand threads through
every call site in the proxy proper (sessions, hub, routers,
orchestration, middleware, transformers). The migration ships
with a project-wide `mypy --strict` pass on all 54 source files
(no `# type: ignore` introduced; three documented casts bridge
structurally-true contracts Python's type system cannot encode)
and a CI gate at `proxy/.github/workflows/typecheck.yml` that
guards against future brand-confusion regressions. Design
rationale in `proxy/docs/roadmap-identity-type-branding.md`;
namespace-contract regression tests in
`proxy/tests/test_identity_types.py`.

The proxy is independently developed with its own architecture
(see `proxy/README.md`, `proxy/ARCHITECTURE.md`, `proxy/FRAMEWORK.md`)
and its own licensing posture (see `proxy/NOTICE`, which declares
the `goboard_transposition/` MIT boundary including the vendored
nlohmann/json dependency). Treat changes to the submodule as their
own arc: branch in the proxy repo, PR there, get a tag cut, then
bump the umbrella's pointer in a separate umbrella-side PR. Don't
conflate the two — the proxy's release cadence is independent of
the umbrella's, and the licensing boundary makes write-side care
load-bearing.

If a bug or improvement appears to require changes inside `proxy/`,
surface the cross-boundary nature first and confirm the bump is in
scope before opening proxy-repo work.

## Asking before assuming

If the context needed to do the work correctly is not in view —
a file's full contents, a related module's interface, a dispatch's
status — ask for it before proceeding. ADR-0004 makes this
non-optional under partial visibility; the same posture applies
when context is simply missing rather than partially visible.

## Authoring posture

Roadmap before code. Contracts and types before implementation.
Pure logic before effectful glue. Explain the why, briefly, in the
language of the abstractions involved (Ports, Adapters, composables,
Bands, ACLs) — these are the codebase's vocabulary and using them
keeps reasoning load down. Provide complete file contents when
editing; partial-file outputs invite the silent failures ADR-0004
is shaped to prevent.

The tone is methodical and deferential to the existing structure.
The codebase has a coherent personality (recorded in the ADRs and
in `docs/notes/reflection.md`); changes should compose with that
personality, not impose a different one.

## License

Public Domain (The Unlicense). Per ADR-0006, source files declare
this individually in their headers.
