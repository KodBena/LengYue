# ADR-0006: Source-File Headers

- **Status:** Accepted
- **Genre:** Tenet (file-level authoring discipline) — the
  fourth tenet in this codebase, after ADR-0002 (fail-loudly),
  ADR-0004 (minimal-touch), and ADR-0005 (documentation
  discipline).
- **Date:** 2026-04-26
- **Scope:** All source files in `frontend/` and `backend/` (and
  any future sub-projects added to the umbrella). Submodules
  (`proxy/`) follow their own conventions.

## Context

The umbrella's two main sub-projects evolved independently and
converged on different conventions for source-file headers. The
frontend has a consistent pathname + purpose + license header
pattern, visible in (for example)
`frontend/src/composables/useTreeLayout.ts`:

```typescript
/**
 * src/composables/useTreeLayout.ts
 *
 * Pluggable Tree Layout Composable.
 *
 * ## Reactivity
 *
 * `watchEffect` is used instead of `watch` so that all reactive
 * reads made during layout computation are automatically tracked
 * as dependencies. ...
 *
 * License: Public Domain (The Unlicense)
 */
```

The backend has mixed practice: some files (e.g.,
`backend/services/card_service.py`, `backend/domain/pipeline.py`)
have content-purpose docstrings without pathname or license; some
(e.g., `backend/main.py`, `backend/repositories/card_repository.py`)
jump straight to imports with no module docstring at all.

The convergence cost of having different conventions across the
umbrella's two main subprojects is real if low-grade. New
contributors hit it as a friction the moment they cross from one
tree to the other. More importantly, the frontend's convention
earns its weight for two distinct reasons that apply equally to
the backend (and any future sub-project): self-locating files,
and per-file license declaration.

The convention's underlying disciplines are visible in two
existing tenets — ADR-0004 (minimal-touch) makes self-location
useful in partial-visibility editing, and ADR-0005 Rule 5 (file
location reflects content) is harder to violate when the file
itself declares where it lives. This tenet codifies the file-
level expression of those disciplines.

## Decision

**Every source file in `frontend/` and `backend/` carries a
header with three parts:**

1. **Pathname relative to subproject root**, as the first
   content of the header.
2. **Brief purpose statement** describing what the file is for
   (one-line minimum; multi-section commentary fine).
3. **License declaration** at the end of the header.

### Form for TypeScript and Vue files

A JSDoc block at the top of the file:

```typescript
/**
 * src/composables/useTreeLayout.ts
 *
 * Pluggable Tree Layout Composable.
 *
 * [optional: usage notes, design notes; multi-section is fine]
 *
 * License: Public Domain (The Unlicense)
 */
```

For Vue Single-File Components, the JSDoc lives at the top of
the `<script>` block, since it documents the component's
TypeScript surface.

### Form for Python files

The module docstring:

```python
"""
services/card_service.py

CardService — the create-card use case.

[optional: design notes, item references, etc.]

License: Public Domain (The Unlicense)
"""
```

Same structural shape, idiomatic in either language.

### Why pathname

A file pasted into a chat, a PR diff, or a code-search result
identifies itself. This composes directly with ADR-0004: a
contributor working with partial visibility benefits from every
file knowing where it lives. Declaring the pathname is also the
cheapest insurance against the file being moved without its
docstring being updated.

### Why license

Each file is independently identifiable as Public Domain (The
Unlicense). This matters at the moment any single file gets
vendored, copied, or reposted outside the project. Without
per-file license, only the project as a whole is identifiably
Public Domain — once a file is extracted from its repo context,
the license signal is lost.

### Composition with ADR-0004 — incremental retrofit

ADR-0004 (minimal-touch) explicitly enables incremental
retrofit. When a file is touched with full visibility, the
header gets added; when it's touched under partial visibility,
the header is left for next time. No special discipline is
required; the headers will accumulate naturally as files cycle
through normal editing.

### Exceptions

- **`__init__.py`** files (Python packages): a header is fine
  but not required. These files are often empty or contain only
  re-exports.
- **Test files** follow the same convention. The pathname
  (`tests/integration/test_pipeline_e2e.py`) is useful in PR
  diffs and test-failure output.
- **Generated files** — e.g., `frontend/src/types/backend.ts`
  (the OpenAPI codegen output) — do not carry a hand-written
  header. These files are regenerated top-to-bottom each time
  the codegen runs; any header would be lost. The codegen
  tool's own configuration is the right place for this concern.
- **Configuration files** (`.json`, `.yaml`, `.toml`) follow
  their own format conventions; a pathname comment is fine but
  not required.

## Consequences

### Positive

- **Self-locating files.** Easier to read pasted code, easier
  to navigate PRs, easier to identify files in tooling output.
  Composes with ADR-0004's partial-visibility discipline.
- **Per-file license clarity.** Vendored or extracted files
  retain their license signal.
- **Cross-subproject consistency.** A contributor crossing from
  the frontend to the backend (or vice versa) sees the same
  shape. Friction at the umbrella level reduces.

### Negative

- **Per-file ceremony.** Small but real. Especially for files
  that are essentially type definitions or short utilities.
- **Discipline is policy, not mechanism.** The tenet lives in
  authoring habit and code review. A linter could automate the
  pathname check and might be a good first step toward partial
  mechanization, but is not currently in place.

### Neutral

- **No retroactive rewrite.** Per ADR-0004, existing files
  without the header are retrofitted incrementally as they're
  touched for other reasons, not in a sweep.

## Alternatives considered

### Alternative A: Leave the inconsistency

**Rejected because:** the inconsistency creates real friction
at the umbrella level. The frontend's convention is good and
known; standardizing on it pays back across the codebase. The
cost of unifying — incremental retrofit composing with ADR-0004
— is small.

### Alternative B: Impose the convention only on new files

**Rejected because:** this is a half-measure. The benefit of
self-locating headers is most valuable on EXISTING files (which
a new contributor encounters most often), not new files (which
the contributor wrote and remembers the location of).
Incremental retrofit on existing files is the right pattern.

### Alternative C: Stricter convention (multi-line metadata, author, last-modified, etc.)

**Rejected because:** the marginal benefit is small and the
per-file cost grows with each addition. Pathname + purpose +
license is the minimum viable header. Authors who want richer
metadata (history, last-modified) have git for that.

## Revisit when…

This tenet is worth revisiting if:

1. **Tooling exists to auto-generate or auto-verify pathname
   headers.** A linter would partially mechanize the discipline,
   at which point the rule could be tightened (e.g., enforced
   rather than reviewed).
2. **The project's license posture changes.** If the project
   moves away from Public Domain, the per-file license
   declaration's specifics need updating, but the discipline
   remains.
3. **A new sub-project lands** with its own idiomatic header
   convention. The tenet's spirit (self-locating, per-file
   license) should apply; the specific form should match the
   new sub-project's idiom.

## Related

- **ADR-0004 (minimal-touch edits to partially-visible files).**
  The composition pattern: incremental retrofit during normal
  editing, no sweep. Self-locating files reduce the cost of
  partial-visibility editing.
- **ADR-0005 (documentation discipline).** The umbrella tenet
  of which file-headers are a specific instance. ADR-0005 Rule
  5 (file location reflects content) is harder to violate when
  the file declares its own location.
- **`frontend/src/composables/useTreeLayout.ts`.** The exemplar
  header that this tenet codifies.

## What this tenet does NOT mean

- **Not a requirement for documentation files** (`.md`, ADRs
  themselves). Markdown documents have their own conventions;
  ADR-0005 governs.
- **Not a requirement for blob/data files** (binary assets,
  JSON data, fixtures). The tenet applies to files that carry
  source code intended for human reading.
- **Not a license enforcement mechanism.** The license
  declaration is a signal, not a clearance. A file's actual
  license is determined by the project's overall license, not
  by what its header claims.
- **Not a substitute for git-tracked metadata.** Authorship,
  last-modified date, change history, and similar metadata live
  in git, not in headers. The header is for facts that are
  invariant across the file's lifetime.
