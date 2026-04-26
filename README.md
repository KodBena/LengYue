# Spaced-Repetition Learning System for Go

This is the umbrella repository for three coordinated projects:

- **`frontend/`** — Vue 3 + TypeScript SPA. The user-facing client.
- **`backend/`** — FastAPI + SQLAlchemy service. The spaced-repetition
  core (Ebisu-based), tree and card storage, and the tenancy boundary.
- **`proxy/`** — KataProxy, included as a git submodule. KataGo
  analysis bridge.

The "soft monorepo" choice is deliberate: each subproject keeps its
own dependencies, build tooling, lint config, and `.gitignore`.
There is no root-level `package.json`, no shared `pyproject.toml`,
no top-level test runner. To work on a subproject, `cd` into it.

## Cloning

```bash
git clone <umbrella-url>
cd <umbrella-dir>
git submodule update --init --recursive
```

The submodule step is required — without it, `proxy/` is empty.

## Running

Each subproject has its own README with full setup details. The
short version, from the umbrella root:

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
fastapi dev main.py --host 127.0.0.1 --port 8764

# Frontend (in another shell)
cd frontend
npm install
npm run dev

# Proxy (see proxy/README.md for relay vs leaf modes)
cd proxy
./run_relay.sh   # or ./run_leaf.sh
```

## Documentation

System-level documentation lives in `docs/`:

- **`docs/adr/`** — Architectural Decision Records and tenets.
  Read these first; they describe the codebase's posture, not just
  individual decisions. Especially ADR-0002 (fail loudly) and
  ADR-0004 (minimal-touch edits to partially-visible files), which
  apply to contributors as well as to code.
- **`docs/notes/`** — Design and architectural notes:
  `tenancy.md` (multi-tenant model), `reflection.md` (architectural
  retrospective at the close of the pre-release sweep),
  `analysis-persistence-plan.md` (planned feature),
  `frontend-backlog.md` (raw frontend backlog).
- **`docs/archive/`** — Historical artifacts kept for reference.
  Includes the pre-umbrella HANDOFF snapshots authored during the
  34b project: `34b-frontend-brief.md`,
  `34b-parallel-frontend-work.md`, `34b-complete-status.md`, and
  `handoff-2026-04-frontend-pre-umbrella.md`.
- **`docs/playbooks/monorepo/`** — The restructuring playbook
  (`monorepo-plan.md` and its framing memo) that produced the
  current layout. Useful for understanding why things are
  arranged the way they are.

Backend-internal documentation lives in `backend/docs/`:

- **`backend/docs/tree-dsl.md`** — Tree-DSL reference for the
  pipeline executor.

### Transitional documentation

A few documents are in a known-incomplete state pending follow-up
editorial work (tracked as Part B of the umbrella transition):

- **`docs/TODO.md`** is currently a placeholder. The pre-umbrella
  TODOs live in `docs/old-todos/` (`TODO-frontend.md`,
  `TODO-backend.md`) awaiting consolidation.
- **`docs/handoff-current.md`** does not yet exist. Notes that
  reference it (e.g., `docs/notes/tenancy.md`'s Related section)
  link to a placeholder; the link will resolve once the synthesis
  runs. Until then, the most recent state is the collective
  contents of `docs/archive/`.

## Project status

Pre-release infrastructure work is closed; see
`docs/notes/reflection.md` for the architectural retrospective.
The umbrella restructure is in progress — `docs/playbooks/monorepo/`
records the structural moves, and Part B (TODO consolidation,
handoff-current synthesis, broader cross-reference cleanup) is
the remaining work.

## License

Each subproject is licensed independently; see the subproject
READMEs (`frontend/README.md`, `backend/README.md`) and the proxy
submodule's own license for terms. Both `frontend/` and `backend/`
are released into the public domain.
