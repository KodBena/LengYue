# ADR-0006: Source-File Headers

- **Status:** Accepted
- **Genre:** Tenet (file-level authoring discipline) — the
  fourth tenet in this codebase, after ADR-0002 (fail-loudly),
  ADR-0004 (minimal-touch), and ADR-0005 (documentation
  discipline).
- **Date:** 2026-04-26
- **Amendments:**
  - 2026-06-11 — corrected the exemplar path
    (`frontend/src/composables/useTreeLayout.ts` →
    `frontend/src/composables/forest/useTreeLayout.ts`; the file moved in
    a source-tree reorganisation and its own header self-updated per this
    tenet — only this ADR's citation had rotted). No content change.
  - 2026-06-11 — **Revisit #1 fired (partially): the auto-VERIFY half of the
    pathname-header tooling shipped, advisory-first.** See the
    "Revisit when…" §1 note below for the precise scope of what fired and
    what did not. Also added the vendored-third-party-trees exemption to
    §Exceptions (so the new tool's `backend/qeubo/**` data-exemption cites
    ADR text, not an analogy to the submodule clause).
- **Scope:** All source files in `frontend/` and `backend/` (and
  any future sub-projects added to the umbrella). Submodules
  (`proxy/`) follow their own conventions; vendored third-party trees
  inside a sub-project (e.g. `backend/qeubo/`, MIT) are likewise out of
  scope — see §Exceptions.

## Context

The umbrella's two main sub-projects evolved independently and
converged on different conventions for source-file headers. The
frontend has a consistent pathname + purpose + license header
pattern, visible in (for example)
`frontend/src/composables/forest/useTreeLayout.ts`:

```typescript
/**
 * src/composables/forest/useTreeLayout.ts
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
 * src/composables/forest/useTreeLayout.ts
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
  (the OpenAPI codegen output), and the Alembic migration
  templates under `backend/alembic/versions/` (whose module
  docstring is the migration message, not a path) — do not carry
  a hand-written header. These files are regenerated
  top-to-bottom each time the codegen runs; any header would be
  lost. The codegen tool's own configuration is the right place
  for this concern.
- **Configuration files** (`.json`, `.yaml`, `.toml`) follow
  their own format conventions; a pathname comment is fine but
  not required.
- **Vendored third-party trees inside a sub-project** — e.g.
  `backend/qeubo/` (MIT-licensed; Meta Platforms,
  `backend/qeubo/LICENSE`), behind the directory-scoped licensing
  firewall (`backend/qeubo/README.md`). These follow their own
  upstream conventions, exactly as a submodule does (Scope), and
  this tenet's per-file *Public Domain* license declaration would
  be actively wrong on them. They are out of scope. (Added
  2026-06-11 alongside the verify tool; previously implicit by
  analogy to the submodule clause, now explicit so the tool's
  data-exemption cites ADR text.)

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
- **Discipline is policy, with an advisory mechanism since
  2026-06-11.** The tenet lives in authoring habit and code
  review. The pathname-presence check is now partially mechanized
  by `tools/source-headers/check.mjs` — an **advisory** verify
  tool (ADR-0011 Rule 1: advisory surface), wired non-gating into
  CI. It reports per-file path-presence misses and a summary
  count; it does not gate, and the *enforced* register this bullet
  originally imagined (a lint at `error`) deliberately did NOT
  ship (see Revisit #1, fired). So the discipline remains
  policy-enforced for the placement and purpose/license parts of
  the header, with the path-presence part now measured.

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

   > **FIRED 2026-06-11 (partially) — work-status item
   > `source-file-header-lint`.** What fired: the **auto-VERIFY**
   > half. `tools/source-headers/check.mjs` ships — a zero-dep
   > Node tool that walks the two subprojects (frontend
   > `src/**/*.{ts,vue}`, backend `**/*.py`), applies this ADR's
   > exemption list (encoded as data with this ADR cited per
   > entry), and reports per-file whether the head block carries
   > the file's subproject-relative path, with a summary count.
   > It is wired non-gating into CI (the dedicated
   > `source-headers-ci.yml` workflow — its own workflow rather than
   > a `frontend-ci.yml` job, because the corpus spans both
   > subprojects while that workflow triggers on `frontend/**` only).
   >
   > What did **NOT** fire, precisely:
   > - **Not auto-GENERATE.** The tool only verifies; it writes no
   >   headers. The "auto-generate" clause of this trigger is
   >   untouched.
   > - **Not tightened to enforced.** The check is **advisory**
   >   (ADR-0011 Rule 1: advisory surface) — `--check` exits 0 on
   >   path-presence misses; only a missing-subproject-root is
   >   fatal. The "the rule could be tightened (enforced rather
   >   than reviewed)" clause is explicitly NOT exercised. This is
   >   the measure-first first step (ADR-0011 Rule 3), not the
   >   `error`-gate. Tightening to enforced remains a future,
   >   separate decision contingent on a zero-or-fully-triaged
   >   baseline.
   > - **Not a retroactive sweep.** The Consequences › Neutral
   >   "no retroactive rewrite" posture is unchanged; the tool
   >   names the misses (frontend 6, backend 37 at adoption) for
   >   the ADR-0004 incremental-retrofit path, it does not fix
   >   them.
   > - **Not a placement check.** The tool measures path
   >   *presence* in the head block, not the ADR's prescribed
   >   *placement* (for `.vue`, the `<script>` JSDoc). ~50 of 69
   >   `.vue` files carry the path in a leading HTML template
   >   comment instead; the tool counts those present and
   >   quantifies the swing in its report. A placement-strict
   >   check is a named, separate follow-up.
   >
   > Adoption baseline (measured at ship, a dated point-in-time
   > census per ADR-0011 Rule 3): frontend **224/230**
   > path-present (97.4%; 1 generated file exempt), backend
   > **83/120** (69.2%; 3 alembic-migration + 9 `__init__.py`
   > exempt, `backend/qeubo/**` exempt by license boundary). See
   > `docs/worklog/2026-06-11-source-file-header-lint.md`.

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
- **ADR-0011 (mechanization discipline).** Rule 1 (a discipline
  declares its enforcement surface) is the register under which
  the verify tool is **advisory**, and Rule 3 (measure-first) is
  the adoption protocol its dated baseline follows. The Revisit
  #1 firing above is a worked instance of Rule 1's "the existing
  per-tenet … mechanization Revisit triggers are this rule's
  pre-existing instances".
- **`tools/source-headers/check.mjs`.** The advisory verify tool
  that mechanizes this tenet's path-presence half (Revisit #1,
  fired 2026-06-11). Structural twin of
  `tools/band-conformance/check.mjs`.
- **`frontend/src/composables/forest/useTreeLayout.ts`.** The exemplar
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
