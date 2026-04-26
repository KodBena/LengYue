# Monorepo Restructuring Plan

- **Status:** Executed (2026-04-26).
- ~~**Status:** Design locked. Phases 1–2 already executed. Phase 3 onward is the active work.~~
- **Scope:** Move three independent project repos (`gogui`,
  `fastapi_polish`, `KataProxy`) into a single umbrella repo with
  consolidated documentation.
- **Order:** Execute in the phases below, in order. Each phase
  leaves the umbrella in a working state; you can stop between
  phases without orphaned work.

## Execution state (as of the most recent action)

The umbrella has already been created. The current state is:

```
omega/
├── frontend/     ← was gogui/, moved
├── backend/      ← was fastapi_polish/, moved
└── proxy/        ← KataProxy, present (verify whether as submodule)
```

**What's done:**
- Phase 1: umbrella created; `frontend/` and `backend/` populated.
- Phase 2: `proxy/` is in place (verify it's a git submodule, not a
  copy — if a plain copy, retroactively convert via `git rm proxy &&
  git submodule add ...`).

**What remains:**
- Phase 3 onward: documentation moves into `omega/docs/`.
- Phase 4: internal reference updates.
- Phase 5: umbrella README.

**Source paths for moves** (where the playbook table says
`frontend/docs/HANDOFF.md`, the actual current location is
`omega/frontend/docs/HANDOFF.md`). Treat all source paths in the
move table as relative to the umbrella root.

**Backend HANDOFF — deviation found mid-execution:** the original
plan assumed a single backend HANDOFF document. Audit discovered
there were two — `HANDOFF.md` and `HANDOFF-companion.md` — and both
are already present in `docs/archive/` under self-referenced
`34b-*` names. See the "Backend HANDOFF deviation" note in Phase 3
below for the corrected disposition.

---

## Decisions locked

| Decision | Choice |
|---|---|
| Monorepo style | Soft monorepo: single git repo, three subdirectories, no workspace tooling |
| Subproject names | Generic: `frontend/`, `backend/`, `proxy/` |
| KataProxy integration | Git submodule (preserves independent identity and release cycle) |
| Documentation strategy | System-level docs in root `docs/`; backend-internal in `backend/docs/`; frontend has no `docs/` yet |
| TODO consolidation | Single canonical `docs/TODO.md`; raw frontend backlog separately preserved as `docs/notes/frontend-backlog.md` |

## Target structure

```
omega/                                       # umbrella; rename as you prefer
├── README.md                                # one-page orientation
├── .gitmodules                              # git submodule config (proxy/)
├── docs/
│   ├── adr/
│   │   ├── 0001-state-mutation-and-readonly.md
│   │   ├── 0002-fail-loudly.md
│   │   ├── 0003-frontend-portability-and-domain-boundaries.md
│   │   └── 0004-minimal-touch-edits-to-partially-visible-files.md
│   ├── notes/
│   │   ├── analysis-persistence-plan.md
│   │   ├── frontend-backlog.md
│   │   ├── reflection.md
│   │   └── tenancy.md
│   ├── archive/
│   │   ├── 34b-complete-status.md
│   │   ├── 34b-frontend-brief.md            # backend HANDOFF.md, archived (see Phase 3 deviation note)
│   │   ├── 34b-parallel-frontend-work.md    # backend HANDOFF-companion.md, archived (see Phase 3 deviation note)
│   │   └── handoff-2026-04-frontend-pre-umbrella.md
│   ├── handoff-current.md                   # synthesized post-umbrella state
│   └── TODO.md                              # consolidated cross-team
├── frontend/
│   ├── README.md
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig*.json
│   ├── index.html
│   ├── public/
│   └── src/
│       └── ... (everything as it is in gogui/src)
├── backend/
│   ├── README.md
│   ├── pyproject.toml or requirements.txt   # whatever exists today
│   ├── main.py
│   ├── run.sh
│   ├── docs/
│   │   └── tree-dsl.md                      # was routers/REFERENCE.md
│   ├── api/
│   ├── core/
│   ├── data/
│   ├── db/
│   ├── domain/
│   ├── repositories/
│   ├── schemas/
│   ├── scripts/
│   ├── services/
│   └── tests/
└── proxy/                                   # git submodule → KataProxy repo
    └── (KataProxy contents as the submodule resolves them)
```

## Files that move and how

### Phase 1 — Create umbrella, move two subprojects

```bash
# 1. Create umbrella.
mkdir omega && cd omega
git init

# 2. Move backend (formerly fastapi_polish) and frontend (formerly gogui).
#    Use either fresh copy or `git mv` — fresh copy is simpler and safer
#    for first-pass; the histories of the two projects can be preserved
#    via `git subtree` or `git filter-repo` later if you want unified
#    history. For now, treat the umbrella as a fresh history.
mkdir frontend backend
cp -a /path/to/gogui/.        frontend/
cp -a /path/to/fastapi_polish/. backend/

# 3. Strip stale dotfiles that would conflict at the umbrella level.
#    The frontend's .gitignore stays inside frontend/; the backend's
#    .gitignore stays inside backend/. They do not need to be merged.
#    DO NOT delete .gitignore files inside subprojects — they are
#    project-local and should remain.

# 4. Strip subproject-local .git directories (since the umbrella
#    is now the canonical history origin).
rm -rf frontend/.git backend/.git
```

### Phase 2 — Add KataProxy as a submodule

```bash
git submodule add <KataProxy-repo-url> proxy
git submodule update --init --recursive

# Pin to a specific tag if KataProxy uses tag-based release cuts.
# Otherwise the submodule tracks the default branch and is pinned
# by commit SHA in the umbrella's .gitmodules.
cd proxy
git checkout <tag-or-commit>
cd ..
git add proxy
git commit -m "Pin proxy/ to <tag-or-commit>"
```

If you decide submodule friction is too costly partway through,
revert to: `git submodule deinit proxy && git rm proxy`, and add a
plain `proxy/README-link.md` that points at the external repo.

### Phase 3 — Move documentation to umbrella `docs/`

This is the careful phase. **Do not delete any source file before
copying it to its destination.** Verify each destination file
exists at the target before removing the source.

#### Files to MOVE (source → destination)

| Source | Destination | Notes |
|---|---|---|
| `frontend/docs/adr/0001-state-mutation-and-readonly.md` | `docs/adr/0001-state-mutation-and-readonly.md` | Verbatim |
| `frontend/docs/tenets/0002-fail-loudly.md` | `docs/adr/0002-fail-loudly.md` | **Renamed from `tenets/` to `adr/`** — tenets are ADR-genre under a different label; consolidate under the ADR umbrella |
| `frontend/docs/adr/0003-frontend-portability-and-domain-boundaries.md` | `docs/adr/0003-frontend-portability-and-domain-boundaries.md` | Verbatim |
| `frontend/docs/tenets/0004-minimal-touch-edits-to-partially-visible-files.md` | `docs/adr/0004-minimal-touch-edits-to-partially-visible-files.md` | Same as 0002 |
| `frontend/docs/HANDOFF.md` | `docs/archive/handoff-2026-04-frontend-pre-umbrella.md` | Archived snapshot. The synthesis of a new `docs/handoff-current.md` is a Part B task (see "TODO merger" pattern). |
| `backend/docs/HANDOFF.md` | `docs/archive/34b-frontend-brief.md` | **Deviation.** Already at destination under its self-describing name; original is deleted via Files to DELETE. See "Backend HANDOFF deviation" note below the move table. |
| `backend/docs/HANDOFF-companion.md` | `docs/archive/34b-parallel-frontend-work.md` | **Deviation.** Already at destination under its self-describing name; original is deleted via Files to DELETE. See "Backend HANDOFF deviation" note below the move table. |
| `frontend/ANALYSIS_PERSISTENCE_PLAN.md` | `docs/notes/analysis-persistence-plan.md` | Renamed kebab-case |
| `frontend/34b-complete-status.md` | `docs/archive/34b-complete-status.md` | Verbatim; honest about archival status |
| `frontend/TODO` (no extension) | `docs/notes/frontend-backlog.md` | Renamed; preserves the dual-genre mix |
| `frontend/TODO.md` | merged into `docs/TODO.md` | See merger note below |
| `backend/TODO.md` | merged into `docs/TODO.md` | See merger note below |
| `backend/routers/REFERENCE.md` | `backend/docs/tree-dsl.md` | **Critical:** this is the tree-DSL documentation, not a routers reference. Path is misleading; do not delete based on the parent directory's name. |
| `backend/docs/notes/tenancy.md` | `docs/notes/tenancy.md` | Verbatim |
| `backend/docs/reflection.md` | `docs/notes/reflection.md` | Verbatim |

#### Backend HANDOFF deviation (recorded mid-execution)

The original plan assumed a single backend HANDOFF document and
prescribed the rename to
`docs/archive/handoff-2026-04-backend-pre-umbrella.md`. Discovery
during the audit phase changed the picture:

- There were **two** backend handoff documents:
  `backend/docs/HANDOFF.md` and `backend/docs/HANDOFF-companion.md`.
  Both were authored by the backend during the 34b project to brief
  the frontend.
- Earlier phase work had already copied both files into
  `docs/archive/` under self-descriptive 34b-prefixed names:
  `34b-frontend-brief.md` and `34b-parallel-frontend-work.md`.
  Byte-identical to the originals at the time of audit.
- The companion document's body explicitly references
  `34b-frontend-brief.md` by filename: "This document is a companion
  to `TODO.md` and `34b-frontend-brief.md`." Renaming the archive
  copies to the date-stamped pattern the table originally prescribed
  would either break that internal reference or require body surgery
  — both violate the "Verbatim" disposition prescribed elsewhere in
  this table.
- The frontend HANDOFF, by contrast, has no internal self-reference,
  so its rename to `handoff-2026-04-frontend-pre-umbrella.md`
  proceeds as originally specified.

**Corrected disposition.** Keep the 34b-named archive copies in
place as the canonical surviving versions; delete the originals
from `backend/docs/`. The asymmetry in archive naming (one
`handoff-2026-04-frontend-pre-umbrella.md` next to two `34b-*.md`
files) is intentional and reflects genuine differences in document
genre — the frontend HANDOFF is a generic state-of-the-system
orientation; the backend pair are project-specific briefings that
already named themselves after the project.

A short orientation README inside `docs/archive/` is a reasonable
Part B addition to make this asymmetry self-explanatory to future
readers.

#### Files to DELETE

| File | Reason |
|---|---|
| `frontend/CWT.md` | Confirmed by author: not coming back. Reasoning captured in his note; file no longer needs to outlive that decision. |
| `backend/routers/` (the directory, after moving REFERENCE.md) | Empty after the move; no longer serves a purpose. |
| `backend/ebisu_old.db` | Stale database backup; not under version control concerns. (Confirm before deletion — not architectural to me.) |
| `backend/docs/HANDOFF.md` | Byte-identical to `docs/archive/34b-frontend-brief.md` (already in place). The archive copy is the canonical surviving version. See "Backend HANDOFF deviation" note above. |
| `backend/docs/HANDOFF-companion.md` | Byte-identical to `docs/archive/34b-parallel-frontend-work.md` (already in place). The archive copy is the canonical surviving version. See "Backend HANDOFF deviation" note above. |

#### Files NOT to move

| File | Reason |
|---|---|
| `backend/ebisu.db` | Active database; subproject-local. Should remain in `backend/` and be in `backend/.gitignore` (verify). |
| `backend/data/visit_distribution.json` | Application data, not documentation. Stays in `backend/data/`. |
| `backend/scripts/migrate_*.py` | Migration scripts are backend-internal tooling. Stay in `backend/scripts/`. |
| KataProxy's `ARCHITECTURE.md`, `FRAMEWORK.md`, `README.md`, `goboard_transposition/COMPILATION.md` | Submodule-internal; preserved by virtue of the submodule itself. |

#### TODO merger

The two TODO.md files (`frontend/TODO.md` and `backend/TODO.md`)
need consolidation into a single `docs/TODO.md`. They overlap
substantially — both reference the same numbered items 1–34 — but
the backend's version is the canonical full narrative and the
frontend's is its slimmed active-view of the same numbering.

The merger should:

1. Use the backend's `TODO.md` as the canonical source-of-truth
   for item descriptions and rationale (longest, most complete).
2. Promote anything the frontend version had as new (item-31
   pipeline DSL discriminated unions, anything with frontend-only
   completion details).
3. Mark items that are post-spine cleanup (anything from item 25
   onward, if they're cleanup items that survived the spine
   close).
4. Section the result clearly: "Completed (do not act on)" /
   "Active" / "Future projects" / "Implementation order
   recommendation."

This merger is itself a non-trivial editorial task and is
**deferred to the Part B audit-LLM TODO**; for the move phase,
copy both files into `docs/old-todos/` (a transient subdirectory
that will be deleted after the audit) so neither is lost.

```bash
mkdir -p docs/old-todos
mv frontend/TODO.md docs/old-todos/TODO-frontend.md
mv backend/TODO.md  docs/old-todos/TODO-backend.md

# Then create docs/TODO.md as the placeholder for the Part B
# merger output.
echo "# TODO

Pending merger of:
- docs/old-todos/TODO-frontend.md
- docs/old-todos/TODO-backend.md

See Part B audit-LLM TODO." > docs/TODO.md
```

### Phase 4 — Update internal references

Once files are moved, references in the moved files break. The
following are **known reference-update sites**:

#### Inside the four ADRs

ADRs reference each other ("see ADR-0001…", "per Tenet-0002…").
After consolidation under `docs/adr/`, these references should:

- Use unified naming: "ADR-0001," "ADR-0002," "ADR-0003," "ADR-0004"
  (drop the "Tenet-" prefix; it's confusing now that 0002 and 0004
  live alongside 0001 and 0003).
- Use relative paths: `[ADR-0002](./0002-fail-loudly.md)` rather
  than absolute paths or paths to the previous frontend location.

#### Inside `docs/notes/tenancy.md`

References the four ADRs. Update the paths in the "Related"
section.

#### Inside `docs/notes/reflection.md`

Same as tenancy.md — references ADRs and (post-merger)
`handoff-current.md`. Since the synthesis is a Part B task, leave
the reference as a placeholder for now: `[handoff-current.md]
(./handoff-current.md)`. The link will resolve once Part B
produces that file.

#### Inside `docs/handoff-current.md` (post Part B synthesis)

References to "TODO.md" should point to the new consolidated
location: `docs/TODO.md` (relative: `./TODO.md`).

#### Inside subproject READMEs

`frontend/README.md` and `backend/README.md` likely reference
"see TODO.md" or "see HANDOFF.md" — update to point at
`../docs/TODO.md` and `../docs/handoff-current.md`. (The latter
will be a broken link until Part B's synthesis runs; mark it as
expected and document in the README that "the current handoff is
under construction during the umbrella transition.")

#### Inside `backend/docs/tree-dsl.md`

If REFERENCE.md mentioned "this file lives in `routers/`" or
referenced backend internals by path, update those references
to the new location.

### Phase 5 — Write the umbrella README

A first draft for `omega/README.md`:

```markdown
# Omega — Spaced-Repetition Learning System for Go

This is the umbrella repository for three coordinated projects:

- **`frontend/`** — Vue 3 + TypeScript SPA. The user interface.
- **`backend/`** — FastAPI + SQLAlchemy 2.0 service. The
  spaced-repetition core (Ebisu-based) and tenancy boundary.
- **`proxy/`** — KataProxy (git submodule). KataGo analysis
  bridge with WebSocket-based protocol multiplexing.

## Cloning

```bash
git clone <umbrella-url>
cd omega
git submodule update --init --recursive
```

## Running

Each subproject is fully self-contained with its own dependencies
and its own README. From the umbrella root:

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt   # or: pip install -e .
fastapi dev main.py --host 127.0.0.1 --port 8764

# Frontend
cd frontend
npm install
npm run dev

# Proxy (see proxy/README.md for details)
cd proxy
./run_relay.sh   # or ./run_leaf.sh
```

## Documentation

System-level documentation lives in `docs/`:

- `docs/adr/` — Architectural Decision Records. Read these first.
- `docs/handoff-current.md` — Current state of the system.
- `docs/TODO.md` — Active work list.
- `docs/notes/` — Design notes (`tenancy.md`, `reflection.md`,
  `analysis-persistence-plan.md`, `frontend-backlog.md`).
- `docs/archive/` — Historical artifacts kept for reference,
  including pre-umbrella HANDOFF snapshots.

Backend-internal documentation lives in `backend/docs/`:

- `backend/docs/tree-dsl.md` — Tree-DSL language reference for the
  pipeline executor.

## Project status

Pre-release infrastructure work is complete; see
`docs/notes/reflection.md` for an architectural retrospective and
`docs/handoff-current.md` for the current operational state.
```

## Migration order — recommended sequence

Each step is independently committable. Pause between any of them
without leaving the umbrella in an inconsistent state.

1. **Phase 1** (create umbrella + move backend/frontend): one
   commit. Validates that the move itself didn't break anything;
   `cd backend && pytest` should still pass; `cd frontend && npm
   run dev` should still serve.
2. **Phase 2** (KataProxy submodule): one commit. Validates the
   submodule wiring.
3. **Phase 3a** (move ADRs + tenets to `docs/adr/`): one commit.
   Trivial; just file moves.
4. **Phase 3b** (move design notes to `docs/notes/`): one commit.
5. **Phase 3c** (rescue `routers/REFERENCE.md` to
   `backend/docs/tree-dsl.md`): one commit. Mark this commit
   message clearly: "rescue tree-DSL doc from misnamed location."
6. **Phase 3d** (delete `CWT.md`, `routers/` directory, etc.): one
   commit per deletion or grouped commit; either is fine.
7. **Phase 3e** (TODO files into `docs/old-todos/` for later
   merger): one commit. The merger is Part B.
8. **Phase 4** (reference updates): can be one commit ("update
   internal references after relocation") or grouped per
   document. Grouped is more reviewable.
9. **Phase 5** (umbrella README): one commit. The README is the
   visible-from-outside artifact; quality matters here.

After Phase 9, the structural restructuring is complete. Part B
(the audit-LLM TODO) becomes runnable; the merger of the two
TODOs and any deeper reference cleanup happens then.

## Critical warnings for the executor

These are mistakes I (or an audit-LLM) might make and that the
plan is designed to prevent:

**1. Don't delete files based on path location alone.** The most
important reference doc on the backend
(`backend/routers/REFERENCE.md`) is in a directory whose name
suggests it's irrelevant. The directory above it was deleted; the
file inside survived deliberately. Confirm contents before
deletion. Pattern: if you're about to delete a file with a `.md`
extension, open it first.

**2. Don't merge dotfiles across subprojects.** Each subproject
has its own `.gitignore` and possibly its own `.env.example`,
`.editorconfig`, `tsconfig.json`. These are project-local and
should stay in their subproject. The umbrella does not need a
global `.gitignore` that supersedes the subproject ones.

**3. Don't try to unify build tooling.** No root-level
`pyproject.toml`, no root-level `package.json`. Each subproject
keeps its own build/lint/test setup. The "soft monorepo" choice is
deliberately about leaving project-local tooling alone.

**4. Don't preserve git history naively.** The simplest path is
to start the umbrella's git history fresh; preserving the three
projects' individual histories via `git subtree` or `git
filter-repo` is doable but adds complexity. Defer this decision —
if you ever need the histories preserved, the source repos still
exist and the techniques can be applied later.

**5. Watch for symlinks.** The backend tree shows
`backend/models -> /mnt/n4/home/bork/py/microservices/ebisu_service/models`.
This is an absolute-path symlink that won't survive the move.
Decide what `models/` should be in the umbrella context: a real
directory, a git submodule, or removed entirely. (Likely
removed; the umbrella shouldn't contain absolute filesystem
references.)

**6. Submodule pinning is intentional.** When you `git submodule
add` KataProxy, it pins to whatever commit you check out at the
time of the add. The umbrella's `.gitmodules` file records that
pin. Future `git submodule update` calls will not advance the pin
unless explicitly told to (`git submodule update --remote`). This
is the desired behavior — the umbrella references a specific
KataProxy version, and KataProxy can evolve independently without
breaking umbrella users.

## What this does NOT do

Explicitly out of scope for this restructuring, deferred to other
work:

- **TODO merger.** The two TODOs preserved in `docs/old-todos/`
  await Part B's audit cleanup.
- **Reference graph audit across all docs.** Some references
  (e.g., the archived pre-umbrella HANDOFFs mentioning specific
  item numbers from the pre-merger TODOs) will be broken after
  Phase 3e and stay broken until Part B fixes them.
- **CI/CD setup.** No GitHub Actions, no shared workflow file.
  Each subproject can keep or grow its own CI; the umbrella does
  not impose one.
- **Dependency consolidation.** No `requirements-dev.txt` at the
  umbrella level. Each subproject manages its own.
- **Top-level test runner.** No `make test` or `npm run
  test:all`. To test, `cd` into the appropriate subproject. If a
  shared test runner ever becomes important, `make` or `just` are
  reasonable additions; not now.
- **Repository renames upstream.** The KataProxy submodule
  references the existing GitHub repo; nothing on the GitHub side
  changes. The other two projects' GitHub repos either become
  archived after the umbrella absorbs their content, or stay
  active as upstream forks. That decision is yours and is not
  part of this plan.

## Validation checklist

After all phases complete, verify:

- `cd backend && pytest` passes.
- `cd frontend && npm run dev` serves the SPA.
- `cd proxy && ls AbstractProxy/` shows the proxy contents (proves
  submodule resolved).
- `docs/adr/0001-state-mutation-and-readonly.md` opens and renders.
- `docs/notes/tenancy.md` opens and renders.
- `backend/docs/tree-dsl.md` opens and renders (proves
  REFERENCE.md was rescued, not lost).
- `omega/README.md` is the first thing visible at the umbrella
  root.
- Internal references inside ADRs work (clicking ADR-0001's
  "see ADR-0002" link finds the file).
- No file is named `TODO.md` outside `docs/old-todos/` and
  `docs/TODO.md`.

If any of these fail, the migration is incomplete. Roll back the
last commit and investigate before continuing.

## Once this is done

The repo is restructured. Part B (the audit-LLM documentation
cleanup TODO) becomes the next deliverable: it walks through the
documents now sitting in their final locations, identifies and
fixes broken cross-references, performs the TODO.md merger, and
produces a final coherent documentation graph.
