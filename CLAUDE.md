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
- Does any ADR's "Revisit when…" section name a trigger this change
  satisfies?
- Does any cross-reference in the doc graph now describe its target
  inaccurately?
- Per ADR-0006, if files were touched under full visibility and lack
  the standard header, retrofit it.

If yes to any, propose the documentation edits as part of the same
change. Code-only PRs that have documentation implications are
incomplete deliveries.

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
rather than a frontend-only workaround. The current pin is **v1.0.15**;
later bumps follow the same coordinated arc (see the proxy's tag
annotations for each release's full changelog).

v1.0.13 was a structural release: it splits `KataGoResponse` into a
discriminated union (`AnalyzeResponse | MetadataResponse`) eliminating
the v1.0.12 `query_models` transparency bug, renames cryptic top-level
modules (`flt`/`bsa`/`baduk`/`rxp`/`reginterp`) to descriptive ones,
and surfaces Layer 1's two extension surfaces as `transformers/` and
`middleware/` directories with KataGo-specific protocol types in their
own `katago/` package outside `AbstractProxy/`. Wire-shape behaviour
to KataGo clients is unchanged for analyze responses and gains
transparency for metadata responses. See the v1.0.13 tag annotation
for the full changelog and `proxy/docs/roadmap-response-variants.md`
for the response-variants design rationale.

v1.0.14 introduces two-sided capability negotiation: a `capabilities`
dict on `query_version` responses (gated by
`PROXY_ADVERTISE_CAPABILITIES=true`, default off) and a symmetric
per-query opt-in on the analysis query payload. Three behavioural
capabilities ride the new channel — `delta_analysis` (the
`analysis_enricher` Transformer producing per-move enrichment),
`transposition` (the `transposition_enricher` Transformer producing
`clusterId`), and `adaptive_reevaluate` (the middleware that fires
deeper follow-up queries on worst-quantile turns, with a
`worst_quantile`/`extra_visits` metadata schema). Default semantics
when the per-query field is absent is legacy auto-engage —
v1.0.13-and-earlier clients continue working unchanged. The frontend
side of this contract closes a pre-existing fail-loud violation
around the registry's transposition toggle (silent no-op when the
proxy lacks `goboard_transposition`).

v1.0.15 introduces the SELECTOR role: a fourth Layer 3
`BackendRouter` peer to `LeafRouter`/`RelayRouter`/`EchoRouter` that
dispatches per-query against a labelled upstream pool. Configuration
via the `SELECTOR_MODELS` env var (`label1=ws://host1,label2=ws://host2,…`);
the wire `model: string` field on the analysis query is the routing
key. A `selector` capability appears in the version-response
advertisement so clients can feature-detect; `query_models` extends
to enumerate the labelled set as `[{label}, …]`. Failure modes are
loud per ADR-0002 (unknown label / unhealthy upstream → structured
`KataErrorResponse`; duplicate labels at startup → `SelectorStartupError`).
Together v1.0.14 and v1.0.15 enable real-time model-vs-model
analysis and the multi-weights/LLM-at-seat policies the autonomous-SR
loop note sketches.

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
