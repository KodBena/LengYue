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

`proxy/` is KataProxy, a git submodule pinned at v1.0.0. It is
mature and frozen until release; do not propose changes to its
contents. If a change to the proxy appears necessary while working
in another sub-project, surface this as a blocker and stop. The
submodule's pinned reference is the freeze; do not advance it.

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
