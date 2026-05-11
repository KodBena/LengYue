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

## What it does

The application stages SGF positions as flashcards in a
spaced-repetition system, with KataGo's evaluation as the
grader and Ebisu's Bayesian recall model as the scheduler. The
intent: forward the average capability of human Go players as a
virtue in itself.

See **[FEATURES.md](FEATURES.md)** for the canonical tour —
board, analysis, cards & SR, browse mode, power-user
customisation, qEUBO calibration, workspace, and auth — with
state qualifiers (`[experimental]` / `[partial]` / `[planned]`)
for each surface. See `docs/handoff-current.md`'s "What this
product is" section for the pedagogy that motivates the design.

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

### Optional: populate the database with a sample workspace

A fresh install starts with an empty backend database — the SPA's
database tab is blank until the user imports SGFs. To explore the
application with example content already in place:

```bash
python backend/scripts/load_sample.py
```

This is opt-in (refuses to clobber an existing `backend/cards.db`
unless `--force` is passed). See `backend/samples/README.md` for
details on what the sample contains and
`backend/scripts/make_sample_db.py` for how to regenerate it.

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

## Project status

**v1.0.0 has shipped** (2026-04-30). The locked release scope —
seven items spanning backend de-branding, analysis-range
preservation, the card-tree widget, pass handling and SGF save,
the curated default palette, the tenancy READMEs, and the
initial-load layout fix — is closed. See
`docs/archive/notes/release-retrospective-2026-04.md` for the
whole-project retrospective from a contributor perspective and
`docs/handoff-current.md` for the current operational state.
Earlier closure documents remain valid as historical record:
`docs/notes/reflection.md` (backend infrastructure-sweep
retrospective) and `docs/notes/audit-reflections.md` (umbrella
restructure retrospective).

The next undertaking is distribution packaging — making the
software installable for users who don't have Node and Python
toolchains. The options memo is at
`docs/notes/distribution-packaging.md`.

## License

Each subproject is licensed independently; see the subproject
READMEs (`frontend/README.md`, `backend/README.md`) and the proxy
submodule's own license for terms. Both `frontend/` and `backend/`
are released into the public domain.
