# Onboarding — Frontend

You are working in `frontend/`, a Vue 3 + TypeScript SPA. This
note assumes you have already read the generic orientation
(`docs/onboarding/orientation.md`) and the umbrella `CLAUDE.md`.

## Read in this turn (mandatory)

1. `frontend/CLAUDE.md` — the frontend authoring posture
   (Components / Composables / Services / Store layering;
   type-driven design with branded IDs and discriminated unions;
   reactivity discipline).
2. `frontend/README.md` — the contributor entry point. The
   `npm run gen:api` section is load-bearing; read it before any
   change to code that touches the wire boundary.
3. `docs/handoff-current.md`, "The frontend" section — the
   architectural snapshot. The durable known gap is **no test
   suite yet**; earlier-named gaps (Pipeline DSL `any[]`,
   `useVariationPath` boundary cleanup) have closed. Always
   verify a "known gap" claim against `docs/TODO.md`'s
   Completed table before treating it as still open.
4. Scan `docs/dispatch/` for open requests addressed to the
   frontend (filenames containing `to-frontend` or
   `frontend-to-frontend`). Surface unaddressed ones at the start
   of the session before implementing.

That is the onboarding turn.

## Architectural shape (one-line reminder)

Components are thin renderers; Composables hold logic; Services
are the effectful boundary. The single ACL at
`src/services/backend-service.ts` is where wire shapes (snake_case,
generated in `src/types/backend.ts`) become domain types
(camelCase, branded, declared in `src/types.ts`). State lives in
`src/store/index.ts` — a single reactive `GlobalStore`, no Pinia
(see ADR-0001 for the conditions that would flip the decision).

## ADR map (frontend-relevant)

- **ADR-0001** — `readonly` policy on state containers. Reactive
  containers mutate through named mutators; types reflect this.
  Value objects keep `readonly`.
- **ADR-0003** — Domain bands (truly agnostic / game-tree-coupled
  / Go-bound). The authoring-time question for any new module.
- **ADR-0006** — JSDoc header (path + purpose + license) at the
  top of the `<script>` block in SFCs.
- **ADR-0007** — SFC budget ≤ 250 lines, no section exceeding
  ~150. Never compress logic to fit.

ADR-0002 (fail loudly), ADR-0004 (minimal-touch), and ADR-0005
(documentation discipline) bind every edit.

## Reference material (consult on demand)

- `docs/notes/frontend-backlog.md` — Raw frontend backlog (UI/UX
  items not in the canonical `docs/TODO.md`).
- `docs/archive/notes/card-tree-frontend-spec.md` — Frontend widget spec
  for the card-tree view.
- `docs/notes/qEUBO.md` — Successor-session map for qEUBO work.
  Points at canonical sources rather than substituting for them.
- Session-to-session handoffs — recent ones land in
  `docs/dispatch/frontend-to-frontend-*.md`; prior ones are
  archived under `docs/archive/dispatch/`. Read the most recent
  handoff if you are picking up an in-flight effort.
- `docs/worklog/` — Per-PR records for the current cycle. Useful
  when the task description references a specific shipped change.
  Prior-cycle entries live under `docs/archive/worklog/<cycle>/`.
- `src/types.ts` (domain), `src/types/backend.ts` (generated wire,
  do not hand-edit), `src/engine/katago/types.ts` (proxy wire).

## Skip during onboarding

- Anything backend-internal beyond the wire contract.
- Anything proxy-internal beyond `src/engine/katago/types.ts`.
- `docs/archive/`, `docs/playbooks/monorepo/`, `docs/rfcs/`,
  `docs/notes/auditor-notes.md`, `audit-reflections.md`,
  `decisions-deferred.md`, `deferred-items.md`,
  `doc-graph-discipline-plan.md`.

## Output discipline

For substantive frontend changes, structure the response as:
roadmap → interfaces (types and branded handles) → composables and
pure units → wiring (SFC bindings, service calls) → verification
(no logic in components, no wire shapes outside the ACL, no `as`
without justification). For trivial fixes, skip the structure and
make the change.

`npm run build` (running `vue-tsc -b && vite build`) is the
canonical correctness check; the strict typecheck is load-bearing
and not a fictional safety net.

## Cross-team

A wire-shape change is a dispatch to the backend
(`docs/dispatch/frontend-to-backend-*.md`), not a unilateral edit
of `src/types/backend.ts`. The generated file is regenerated from
the live `/openapi.json` via `npm run gen:api`; hand edits will be
lost on the next regeneration.
