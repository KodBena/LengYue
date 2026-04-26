# gogui

A study application for the game of Go (Weiqi/Baduk) built on KataGo
analysis and Ebisu spaced repetition. The frontend is a Vue 3 +
TypeScript SPA; the backend is a FastAPI service that manages
spaced-repetition state and persists user workspaces.

---

## For end users

If you just want to use gogui, you don't build it from source — you
install a pre-built release. Nothing in the rest of this document
applies to you. Codegen, development servers, and type regeneration
are concerns for contributors only; they happen long before the
bundle reaches your machine.

---

## For contributors

### Prerequisites

- Node 20+ and npm.
- A running instance of the Ebisu backend (see the backend repo). The
  frontend expects it at `http://127.0.0.1:8764` by default; override
  with `VITE_API_BASE_URL` in a local `.env` file if needed
  (`.env.example` is the template).
- A KataGo analysis engine accessible over WebSocket. Default URL is
  controlled by `VITE_KATAGO_WS_URL`.

### Running the dev server

```sh
npm install
npm run dev
```

The dev server hot-reloads Vue components on save.

### Building for production

```sh
npm run build
npm run preview   # local smoke test of the built bundle
```

---

## Backend type generation — `npm run gen:api`

This is the load-bearing part of this document. Read it before making
any change to code that talks to the Ebisu backend.

### What it does

```sh
npm run gen:api
```

Runs `openapi-typescript` against the backend's live OpenAPI
description (`http://127.0.0.1:8764/openapi.json` by default) and
writes a TypeScript declaration of every wire shape to
`src/types/backend.ts`. That file is then imported at the
anti-corruption layer (currently `src/services/ebisu-service.ts`) to
type-check the boundary where the backend's responses enter the
frontend.

### Why it exists

Before codegen, `ebisu-service.ts::mapToReviewCard` took `raw: any`
and manually projected fields onto our domain types. There was no
compile-time check that the field names we read actually matched the
field names the backend sends. A backend refactor could silently
rename a field; the frontend would keep compiling; cards would
silently lose data (missing `defaultVisits` → we'd fall back to
`1000`; no warning; no crash; no diagnostic). This is the exact
failure mode — *silent data corruption at a trust boundary* — that
we are most concerned to eliminate.

With codegen in place, the wire contract is a typed, version-
controlled artifact. A backend field rename produces a TypeScript
compile error at every site that reads the old name. The compiler
becomes the change-notification channel.

### When to run it

Run `npm run gen:api` whenever:

- The backend ships a wire-contract change (field added, renamed,
  removed, or retyped).
- You pull backend changes and want to see what the wire now looks
  like.
- You're starting work on a new feature that touches an endpoint and
  want to be sure your types reflect current reality.

You do **not** need to run it:

- On every `npm install`.
- As part of `npm run build`.
- Before running `npm run dev` (unless you're specifically working
  on code that depends on new backend types).

The generated file is **committed to the repository**. Fresh clones
and CI can build without the backend running, because the types are
part of the source tree.

### Why the generated file is committed

Three reasons, in order of importance:

1. **Reproducibility.** A fresh clone with no backend available
   must still build and pass typecheck. If the file were
   `.gitignore`-d, `npm install && npm run build` would fail on any
   machine without the backend running — including CI, teammates'
   laptops, and the machine of any end user who happens to build
   from source.
2. **Review signal.** When a PR changes the wire contract, the
   generated file's diff shows *exactly* what changed. A reviewer
   looking at "backend added a `halflife_units` field" sees it
   directly in the diff, not inferred from downstream consumers.
   This is extremely valuable institutional knowledge that would be
   lost if the file were ephemeral.
3. **End-user builds.** End users building from source have no
   backend running and no way to reach one. The committed file
   means their build succeeds without any external dependency.

### What the generated file is NOT

- **Not a replacement for the ACL.** `src/services/ebisu-service.ts`
  still does the work of translating wire shapes (snake_case,
  nullable, permissive) into domain shapes (camelCase, branded IDs,
  strict). The generated types describe what arrives *on the wire*;
  the domain types in `src/types.ts` describe what the rest of the
  app consumes. The ACL is the bridge.
- **Not imported outside `src/services/`.** Vue components, stores,
  and composables read domain types from `src/types.ts` only. If a
  component ever imports from `src/types/backend.ts` directly, that's
  an ACL leak — the component should instead consume a domain type
  and let the service translate.
- **Not hand-edited, ever.** The file is regenerated top-to-bottom
  every time `npm run gen:api` runs. Any manual edit will be lost.
  If the generated shape is wrong, fix it at the source (backend
  Pydantic models, or the codegen configuration).

### Troubleshooting

**`connect ECONNREFUSED 127.0.0.1:8764`** — the backend isn't
running. Start it, then re-run `npm run gen:api`. (No way around
this: the generator pulls the live schema.)

**The generated file has hundreds of lines of diff but nothing
visibly changed** — `openapi-typescript` is deterministic in output
*content* but may vary in *ordering* when the OpenAPI source is
reordered. This is usually harmless; review the diff and commit.
If noisy re-ordering becomes a chronic problem, we can pin a
post-process sort step.

**TypeScript errors after regeneration** — this is the feature
working. Read each error: the backend changed something, and the
compiler is pointing at every frontend site that now disagrees with
the wire. Fix those sites (update the ACL mapping, update domain
types if the change is real, or remove code that referenced a
removed field). Do not suppress with `as any` — that defeats the
whole point.

---

## Architectural conventions (quick reference)

- **Domain types** (`src/types.ts`): branded IDs, immutable ADTs,
  reactive session shapes. The vocabulary the app thinks in.
- **Wire types** (`src/types/backend.ts`): generated; what the
  backend sends over HTTP. Do not hand-edit.
- **ACL** (`src/services/ebisu-service.ts`, et al.): translates
  wire → domain. Only service files import wire types.
- **Services** (`src/services/*`): effectful singletons. API calls,
  WebSocket clients, debounced persistence.
- **Store** (`src/store/index.ts`): the single reactive GlobalStore.
- **Composables** (`src/composables/*`): Vue-reactive logic layer.
  Pure-ish functions over reactive refs.
- **Components** (`src/components/*`, `src/App.vue`): SFCs.
  Presentation plus the minimum wiring to composables.

If a file does more than one of the above, it needs splitting.

---

## License

Public Domain (The Unlicense).
