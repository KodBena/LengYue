# Opus Consult — SPA board-scope exhaustiveness (typed scoping / registry-as-capability, 2026-06-05)

Firewalled second-opinion consult (background Opus `general-purpose` agent, no
peek at the orchestrator's own answer) commissioned during the SPA board-scope
consistency audit (`docs/notes/audit/audit-spa-board-scope-consistency-2026-06-05.md`),
on whether strong typing can give an exhaustiveness check over scoping and
whether the `IDENTITY_SCOPED_CACHES` registry-as-capability framing exposes a
refactor. The maintainer's questions: (1) can TypeScript give an enum-like
exhaustiveness check that every scoped surface is registered/torn down — for both
the board and identity scopes, ideally under one generic convention; (2) is the
registry best understood as a *capability* ("the only way to hold scoped state is
to go through the registry, which confers — and obligates — teardown"), and can
that be made structural rather than conventional; (3) most importantly, does
pursuing this expose a code-removing refactor, or is it more machinery than it's
worth?

The verdict, in brief: TypeScript reaches the *handling* half (a `never`-default
switch forces every listed surface to be handled) but **not** the *registration*
half (it cannot enumerate "every scoped surface" to demand each is registered),
so the guarantee the maintainer pictures comes from a completeness **test**, not
the type system. The board teardown sites are not homogeneous — Class A
(board-*keyed* containers, `delete map[boardId]`) versus Class B (board-*derived*
node-walk purges, ordering-bound to the `store.boards` splice) — so no uniform
`Scoped<BoardId, T>` covers them; and the persisted store members cannot leave
the reactive/migration graph. The modest, real win is `PerBoard<T>` + a board
completeness test + an optional Class-A-only teardown registry; the capability /
lattice / phantom-type forms are over-engineering for a scope with no leak.

**Supersession note.** The audit's **P1b** supersedes this report's "Class A
only" verdict on the *Class B* point: a per-board cleanup *closure* `(boardId) =>
void` covers board-derived data too — the "can't cover" objection applies only to
a typed per-board storage *cell*, not to a teardown closure. The report's other
conclusions stand.

This consult was originally embedded as Appendices B and C of the board-scope
audit (`docs/notes/audit/audit-spa-board-scope-consistency-2026-06-05.md`); it is
extracted here per the consult-record convention so the report renders as
readable markdown. Reproduced verbatim (HTML entities un-escaped). Per ADR-0005's
archive-style convention it is point-in-time and not retro-edited.

---

# Design memo — scoping as a typed capability in the LengYue SPA

**For:** maintainer · **Posture:** independent second opinion, read-only · **Grounding:** `frontend/src/store/index.ts`, `src/types.ts`, `src/composables/cards/board-card-trees.ts`, `src/services/analysis-service.ts`, `src/services/analysis-ledger.ts`, `src/composables/review/useReviewSession.ts`, and the board-scope audit (`docs/notes/audit/audit-spa-board-scope-consistency-2026-06-05.md`).

## 0. The one fact the whole question turns on

The maintainer's instinct — "`IDENTITY_SCOPED_CACHES` suggests a mapping, an arrow, a pair of types; it confers a capability; you have to go through the registry" — is correct about the *identity* scope and is the right lens. But before reaching for it on the board scope, the decisive observation is that **the board-scoped teardown sites are not homogeneous**, and the heterogeneity is exactly the thing a single registry has to either absorb or refuse. Two genuinely different shapes hide under the audit's flat "O1–O14" list:

**Class A — board-*keyed* containers.** Teardown is literally `delete container[boardId]`. The key *is* `BoardId`. These are:
- `store.session.reviews` (`index.ts:397`, `Partial<Record<BoardId, …>>`)
- `store.engine.activeMode` (`index.ts:398`)
- `store.session.ui.cardTreeNav` (`index.ts:399`)
- (post-P0) `store.session.ui.forestNav`
- `boardCardTrees` module map (`board-card-trees.ts:64`, `removeBoardCardTree`)
- `analysisService.boardToQueries` and its dependent maps (`analysis-service.ts:117`)
- `useReviewSession.pendingAnalysisAborts` (`useReviewSession.ts:68`)

**Class B — board-*derived* purges.** The container is **not** keyed on `BoardId` at all — it is keyed on `(configHash, nodeId)` (the ledger, `analysis-ledger.ts:255-258`) or `(hash, extractor, nodeId)` (stability, `stability-trajectory-store.ts:168-171`) or `NodeId` (thumbnails). Teardown does **not** index by board; it *walks `board.nodes`* to compute the node set to evict, and therefore **must run while the board is still in `store.boards`** — the ordering comment at `index.ts:407-409` and the explicit "before the splice" requirement at `index.ts:355-357` exist for exactly this. The "arrow" here is not `BoardId → cell`; it is `BoardId → (look the board up, read its nodes, evict a node-keyed family)`.

This is the single most important thing the obvious framing misses. **`IDENTITY_SCOPED_CACHES` works as a flat `{label, clear: () => void}` list precisely because identity teardown is `clear()` with no argument and no ordering subtlety beyond "engine first."** The board scope has both an *argument* (`boardId`) and a *live ordering constraint against `store.boards`*. Any board registry must carry `clear: (boardId) => void` and must run before the splice. That's still expressible — but it means a board registry is not a copy of the identity registry; it's a second, differently-typed thing. Whether unifying them under "one generic scoping convention" pays depends entirely on whether you're willing to model Class B honestly or paper over it.

## 1. The spectrum of mechanisms (and where each bites)

### Tier 0 — naming + the `PerBoard<T>` alias (the audit's P1)

```ts
export type PerBoard<T> = Partial<Record<BoardId, T>>;
```

This is pure spec, zero runtime. It makes scope a *named, greppable property of the type* — `grep 'PerBoard<'` enumerates Class A's store-resident members. **Where it bites:** review-time legibility and the `forestNav`/`cardTreeNav` adjacency that produced the seed bug (`types.ts:1487` vs `1500`). **Where it can't reach:** it says nothing about teardown — a `PerBoard<T>` field with no `closeBoard` clause typechecks fine. It also can't tag Class B at all (those aren't `BoardId`-keyed), nor the module-scope `Map<BoardId, …>` members (those aren't `Partial<Record>`, they're `Map`; a `PerBoardMap<T> = Map<BoardId, T>` sibling would, but now you have two aliases). Verdict: cheap, real, do it — but it is *labelling*, not *enforcement*. The maintainer asked specifically whether typing can give exhaustiveness; this tier explicitly cannot.

### Tier 1 — the registry + completeness test (the identity scope's existing form, generalized = P1b)

This is `IDENTITY_SCOPED_CACHES` (`index.ts:477-485`) plus the test that drains it. Generalized to the board scope:

```ts
const BOARD_SCOPED_TEARDOWNS: ReadonlyArray<{ label: string; clear: (b: BoardId) => void }> = [
  { label: 'analysis:board-queries', clear: b => analysisService.stopBoardAnalysis(b) },
  { label: 'analysis-ledger',        clear: b => ledger.purgeBoard(b) },        // Class B
  { label: 'stability-trajectories', clear: b => stabilityTrajectoryStore.purgeBoard(b) }, // Class B
  { label: 'board-thumbnails',       clear: b => purgeBoardThumbnails(b) },     // Class B
  { label: 'reviews',                clear: b => { delete store.session.reviews[b]; } },
  { label: 'engine:active-mode',     clear: b => { delete store.engine.activeMode[b]; } },
  { label: 'ui:card-tree-nav',       clear: b => { delete store.session.ui.cardTreeNav[b]; } },
  // … forestNav post-P0, boardCardTrees, pendingAnalysisAborts …
];
```

`closeBoard` drains this list instead of hand-wiring O1–O14; `resetWorkspace` could iterate it over `store.boards.map(b => b.id)` before resetting.

**The catch that the identity scope doesn't have:** ordering. The list above is *correct only if it preserves* (a) engine-stop before ledger-purge (`index.ts:374-377`), and (b) every Class B entry runs before `store.boards.splice` (`index.ts:429`). The identity registry encodes ordering by a one-line comment ("engine first") and a stable array order; that's adequate there because the only constraint is engine-first. For the board scope you'd be relying on array order to encode *two* constraints, one of which (the splice barrier) is a relationship to code *outside* the list. That's a real fragility: a future contributor appends a Class B purge to the *bottom* of the array, after some `delete`s, and it's still before the splice (fine) — but if anyone ever reorders the drain relative to the splice, every Class B purge silently evicts nothing (the board is already gone, `board.nodes` is unreachable). The registry **moves** the ordering knowledge from inline comments into an array's element order, which is *less* legible than the current heavily-documented inline sequence, not more.

**Where Tier 1 genuinely bites (the win):** "you forgot to register a new per-board surface." A new module-scope `Map<BoardId, …>` added next year, whose author forgets the `closeBoard` clause, leaks. The registry *plus the completeness test* is the only mechanism here that can mechanically catch that — but, crucially, **only the same way the identity test does**: the test must *enumerate the surfaces independently* and assert each is registered. The identity test can do this because it can, e.g., populate each cache, run `resetWorkspace`, and assert empty. A board test would have to create N boards, populate every per-board surface, close one, and assert that board's cells (and only that board's) are gone across all surfaces. That's a good test to have regardless of the registry — and it's worth noting **the test, not the registry, is what provides the guarantee.** The registry is just the drain site the test points at.

### Tier 2 — compile-time exhaustiveness over a closed key set

The maintainer's sharpest question: can the *compiler* (not a test) guarantee every scoped surface is handled? TypeScript's only exhaustiveness primitive is the `never`-default over a discriminated union (the codebase already uses it — `AuthState`, `frontend/CLAUDE.md:165-167`). To get exhaustiveness over *scoped surfaces*, you need the surfaces to be a **closed union you switch over**. Sketch:

```ts
type BoardSurface = 'reviews' | 'activeMode' | 'cardTreeNav' | 'forestNav'
                  | 'cardTrees' | 'ledger' | 'stability' | 'thumbnails'
                  | 'analysisQueries' | 'reviewAborts';

function tearDownSurface(s: BoardSurface, b: BoardId): void {
  switch (s) {
    case 'reviews':   delete store.session.reviews[b]; return;
    case 'ledger':    ledger.purgeBoard(b); return;
    // …
    default: { const _: never = s; void _; return; } // compiler forces every case
  }
}
const ALL_BOARD_SURFACES: readonly BoardSurface[] = [/* every literal */];
```

**Where this bites:** if a new surface is added to the `BoardSurface` union, the `switch` fails to compile until a case is added — genuine compile-time exhaustiveness on the *handling* side. **Where it can't reach — and this is fatal to the framing:** nothing forces the *new surface itself* to be added to the union. The union is a hand-maintained list of string literals; adding `store.session.ui.someNewNav` as a `PerBoard<T>` field does *not* make TS demand a `BoardSurface` entry. So the compiler checks "every listed surface is handled," never "every actual surface is listed." That second half — the one the maintainer actually wants ("every scoped surface is registered") — **is not reachable by TypeScript's type system at all**, because TS cannot enumerate "every field of every module that happens to be board-keyed." It has no reflection over the program's scoped-state population. This is the hard wall. The runtime-registry-plus-test (Tier 1) is strictly *more* capable here than the type system, because the test can do the enumeration the compiler can't.

So the honest answer to question 1 is: **partial yes on the handling side (the `never`-switch), hard no on the registration side.** The "enum-like exhaustiveness on scoping" the maintainer pictures — compiler guarantees *every scoped surface is registered* — is not achievable in TS for either scope. The closest real guarantee is the registry + completeness test, and that's a *test*, not a typecheck.

### Tier 3 — capability / make-illegal-states-unrepresentable

The maintainer's framing: "the only way to hold scoped state is to go through the registry, which confers — and obligates — its teardown." Can "scoped state without teardown" be made *unrepresentable* rather than merely *conventionally caught*?

The structural move is a **`Scoped<K, T>` handle that bundles storage with teardown and is the only constructor of per-board state**:

```ts
class Scoped<K, T> {
  private readonly cells = new Map<K, T>();
  constructor(private readonly init: () => T, registry: Scoped<K, unknown>[]) {
    registry.push(this);                       // registration is the constructor
  }
  getOrCreate(k: K): T { /* … */ }
  get(k: K): T | undefined { return this.cells.get(k); }
  teardown(k: K): void { this.cells.delete(k); } // teardown comes for free
}

const boardRegistry: Scoped<BoardId, unknown>[] = [];
const reviews = new Scoped<BoardId, ReviewSessionData>(emptyReview, boardRegistry);
// closeBoard: for (const s of boardRegistry) s.teardown(boardId);
```

Now "a per-board cell that nobody tears down" is genuinely unrepresentable for **anything constructed through `Scoped`** — registration is a constructor side-effect, teardown is a method the registry calls uniformly. This is the real "capability": holding the cell *is* holding the teardown obligation, structurally. It's the cleanest answer to question 2 in the abstract.

**But here is where it collides with this codebase's reality, and the collision is decisive:**

1. **Class B doesn't fit `Scoped<BoardId, T>` at all.** The ledger and stability store are *not* `Map<BoardId, T>` — they are `Map<`${hash}:${nodeId}`, T>`, and their teardown is "walk `board.nodes`, evict matching node entries, *before the splice*." You cannot model them as a `Scoped<BoardId, T>` cell because there is no per-board cell — the board's data is *scattered across a node-keyed family by configHash*. To fold them in you'd need `Scoped` to carry a `teardown: (boardId) => void` callback that does the walk, at which point `Scoped` is no longer "storage + teardown" — it's just the Tier-1 registry entry wearing a class. The "storage" half is a fiction for half the members.

2. **The store-resident Class A members can't move into a `Scoped` class without breaking persistence.** `reviews`, `activeMode`, `cardTreeNav`, `forestNav` live inside `GlobalStore` because **SyncService deep-watches `store.session` / `store.engine` and PUTs them**, and **`migrations.ts` migrates their shape** (schema-45 introduced `cardTreeNav`; P0's `forestNav` re-scope needs a migration, audit §6). A `Scoped<BoardId, T>` instance holding a private `Map` is *not* in the reactive persistence graph and *not* reachable by a schema migration. You'd be choosing between (a) keeping them in the store and excluding them from the capability (so the capability covers only the non-persisted module caches — i.e. only Class A's `boardCardTrees`, `pendingAnalysisAborts`, `analysisService`'s maps), or (b) moving persisted state out of the store into opaque handles and rebuilding the persistence + migration machinery around them. (b) is a large, risky refactor that fights ADR-0001's "one reactive `GlobalStore`" and the whole `migrations.ts` discipline (`frontend/CLAUDE.md:360-401`). It would *remove* the hand-wired `delete`s and *add* a serialization/migration shim — almost certainly a net code increase and a net coherence loss.

So the capability is real and beautiful *for the subset that is non-persisted, board-*keyed* module state* — and that subset is small (three or four members), already correctly torn down today, and not where the bugs are. The seed bug was a *misscoping* (`forestNav` global), not a *forgotten teardown*. The capability solves the teardown-forgetting problem, which **is not the problem the audit found.** The audit's §4 is explicit: "No leaks found in the PB data surfaces… this is the codebase's strongest area and is not the problem."

## 2. Partitioning-completeness vs visibility/trust (don't conflate — audit §8)

The audit §8 (and its closing) already lands the load-bearing distinction, and it's worth holding it firmly against the capability temptation:

- **Partitioning-completeness** = "is every board's cell torn down." This is the teardown-exhaustiveness question. It is the *only* thing a board registry/capability would address.
- **Visibility/trust** = "may board A observe board B's cell." For boards this is **a non-question** — boards are all one user's own data; there is no adversary, no `WHERE user_id =` analog. The one visibility-grade obligation in the SPA (clear-on-identity-flip, the `tenancy-instance-cache-leak` class) is the *identity* scope, and it is *already* handled by `IDENTITY_SCOPED_CACHES` + its test.

The trap a `Scoped<S, T>` lattice/functor invites (the external consult's framing the audit already declined) is importing visibility machinery — phantom types tying a value to a scope cell so a value from board A can't be read in board B's context — into a place with no trust boundary. That is pure cost: it would constrain perfectly legitimate cross-board reads (the tab strip iterating all boards, `boardsById`) with a guarantee that protects against nothing. **Branding board cells with a phantom `BoardId` lifetime (e.g. `Cell<B extends BoardId, T>`) is the novel angle the obvious framing reaches for — and for the board scope it's a solution to a problem the scope doesn't have.** Worth naming so it can be explicitly declined: it belongs to the *identity/tenant* trust boundary (which lives in the backend, in SQL, per audit §8's "board and tenant cannot share one functor here"), not here.

## 3. Novel angles worth recording (most for completeness, one with teeth)

- **Derive shape + reset + teardown from one closed key set.** The genuinely attractive "remove duplication" idea: if `BoardSurface` (Tier 2's union) were the *single source* from which the store shape, the `defaultSessionUI` reset, and the `closeBoard` drain were all generated, the three-places-to-edit problem (audit §6 P0 lists `types.ts` + `defaults.ts` + `closeBoard` + migration as the four edit sites for `forestNav`) would collapse to one. **But it can't be, for the same reason as Tier 2:** the persisted members need named struct fields (for migrations and the OpenAPI-adjacent typed store), not a generic `Record<Surface, …>`; and Class B isn't board-keyed. The closed-key-set generation works only for non-persisted, board-keyed module caches — again the small, already-clean subset.
- **Phantom/branded scope-lifetime types** — declined above; identity-scope concept, not board.
- **Effect/linear-type emulation of "obligation"** (a teardown you're forced to discharge) — TS has no linear types; the closest emulation is the `Scoped` constructor-registers pattern (Tier 3), whose limits are above. Not worth more machinery.
- **The one with teeth — a lint, not a type.** The registration half that TS can't check (Tier 2's wall) *is* checkable by a custom ESLint rule, the same way the codebase already gates the import-boundary (`eslint.config.js`, `frontend/CLAUDE.md:67-74`) and render-count. A rule "any property typed `PerBoard<T>` / `Map<BoardId, …>` must have a corresponding `closeBoard` teardown" is mechanically writable against the AST and would catch the forgotten-teardown case at lint time — the exhaustiveness the maintainer wants, delivered by the tool the project already uses for exactly this class of structural guard. This is the only mechanism that reaches the registration half *without* the persistence-refactor cost of Tier 3. It's still more machinery than `PerBoard<T>` + a test, and it's only worth it if forgotten-teardown is judged a live risk (it isn't today). Recording it because it's the honest answer to "can a *lint* guarantee it" — yes, where the type system can't.

## 4. Blunt verdict

**Is there a real, code-removing refactor here?** A small one, yes — and it is exactly the audit's P1b, *bounded to Class A and read honestly*: a `BOARD_SCOPED_TEARDOWNS` registry that collapses the `delete store.session.reviews[b]` / `delete store.engine.activeMode[b]` / `delete store.session.ui.cardTreeNav[b]` / `removeBoardCardTree` / `pendingAnalysisAborts` / `analysisService` clears into one drained list, mirroring `IDENTITY_SCOPED_CACHES`. That removes the hand-wired enumeration and unifies the two teardown disciplines under one shape. It's worth doing **only if** you accept two compromises stated plainly:

1. **Class B (ledger, stability, thumbnails) stays out of the registry, or enters it only as opaque `clear: (b) => void` callbacks with the splice-ordering constraint preserved by a comment** — because they're node-keyed, board-*derived*, and ordering-bound to `store.boards`. Folding them in does not simplify them; it relocates their ordering knowledge from well-documented inline code into array position, which is a legibility *regression*. My recommendation: keep Class B as explicitly-ordered inline calls in `closeBoard` (as today), and let the registry cover only Class A. That's a smaller, honest win.
2. **The guarantee comes from the completeness *test*, not the registry or the types.** Add the board analog of the identity tenancy test (create boards, populate every Class A surface, close one, assert its cells gone). That test is worth writing *whether or not* you build the registry — and it, not any type, is what makes "forgot a teardown" catchable.

**What would be over-engineering** (say it plainly): the `Scoped<S, T>` capability class that makes scoped-state-without-teardown unrepresentable; any phantom/branded `BoardId`-lifetime type; deriving the store shape from a closed key set; and most of all *any* attempt to unify board and identity under one generic `Scoped`/`PerScope` functor. All of them founder on the same two rocks — **persisted store members can't leave the reactive/migration graph, and Class B isn't board-keyed** — and all of them add abstraction to solve a forgotten-teardown problem the audit found *does not exist* in this codebase (§4: "the codebase's strongest area"). The capability is elegant in the abstract and a poor fit for these specific surfaces.

**The honest bottom line, in the maintainer's own terms:** the registry-as-capability instinct is right *as a reading* of `IDENTITY_SCOPED_CACHES` — it is an arrow `label → clear`, and going through it *does* confer-and-obligate teardown. But generalizing it to the board scope buys legibility, not safety, and only for a minority of the surfaces; the safety the maintainer pictures (compile-time "every scoped surface registered") is unreachable in TS and is, in any case, guarding a door no leak walks through here. Do `PerBoard<T>` (Tier 0, free), add the board completeness test (the real guarantee), and adopt the Class-A-only registry (P1b) if and only if you find the hand-wired `delete`s actively annoying — not because it prevents a bug, but because it reads better. Stop there. Everything past that is more machinery than this codebase repays.

---

**Memo complete.** Key grounding files (all absolute): `/home/bork/w/omega/frontend/src/store/index.ts` (closeBoard `:371-438`, `IDENTITY_SCOPED_CACHES` `:477-485`, resetWorkspace `:573-608`), `/home/bork/w/omega/frontend/src/types.ts` (`UISession` `:1342-1501`, `PerBoard`-shaped members `reviews` `:1815` / `activeMode` `:1886` / `cardTreeNav` `:1500`), `/home/bork/w/omega/frontend/src/composables/cards/board-card-trees.ts`, `/home/bork/w/omega/frontend/src/services/analysis-ledger.ts` (`purgeBoard` `:255-258`, the Class B board-derived shape), `/home/bork/w/omega/frontend/src/services/analysis-service.ts` (`boardToQueries` `:117`), `/home/bork/w/omega/frontend/src/composables/review/useReviewSession.ts` (`pendingAnalysisAborts` `:68`).

The single load-bearing finding: the board scope's teardown sites split into **board-keyed containers** (registry-able) and **board-derived node-keyed purges** (not — they walk `board.nodes` and are ordering-bound to the splice), so no uniform `Scoped<BoardId, T>` covers them; combined with the fact that the persisted members can't leave the reactive/migration graph, the capability/unrepresentable-states framing is more machinery than it repays. The real, modest win is `PerBoard<T>` + a board completeness test + an optional Class-A-only teardown registry — and the guarantee the maintainer wants comes from the test, not the type system (which cannot enumerate "every scoped surface" to check registration).

---

## Appendix — commission prompt

The prompt the consultant was commissioned with, reproduced verbatim:

You are an independent architecture consultant for the LengYue SPA (Vue 3 + TypeScript) at `/home/bork/w/omega/frontend` (umbrella repo `/home/bork/w/omega`). READ-ONLY — do not modify code or run git. This is a firewalled second opinion: reason independently and from first principles; outside-the-box thinking is explicitly wanted, even if it comes to nothing.

## Required context (read end to end first)
- `/home/bork/w/omega/docs/notes/audit/audit-spa-board-scope-consistency-2026-06-05.md` — a board-scope consistency audit. Key facts you'll need: the SPA has per-board (`BoardId`), per-node (`NodeId`/`configHash`), and per-identity (user) scopes; per-board *data* is keyed on `BoardId` and torn down at `closeBoard` (a hand-wired numbered "O1–O14" owner→cleanup list) / `resetWorkspace`; the **identity** scope already has a registry form of teardown, `IDENTITY_SCOPED_CACHES` (`src/store/index.ts`), which `resetWorkspace` drains and a completeness *test* asserts; the audit's recommendations include P1 (`PerBoard<T>` alias + a board-scope convention note) and P1b (generalize `IDENTITY_SCOPED_CACHES` to a board-scope teardown registry). Read the whole audit, including §8 (partitioning vs visibility/trust) and the appendix.
- Ground yourself in the actual code: `src/store/index.ts` (`closeBoard`, `resetWorkspace`, `IDENTITY_SCOPED_CACHES`), `src/types.ts` (the per-board store shapes: `reviews`, `activeMode`, `cardTreeNav`, `forestNav`), `src/composables/cards/board-card-trees.ts`, and the per-board composables. Honor the project's doc-reading discipline (umbrella + `frontend/CLAUDE.md`, ADR-0001/0003/0010); ground claims in `file:line`.

## The question
The maintainer observes that `IDENTITY_SCOPED_CACHES` "suggests a mapping — an arrow, hence a pair of types," and that it "confers a certain capability and you have to go through the registry." Questions:
1. Can strong (TypeScript) typing give an **enum-like exhaustiveness check on scoping** — i.e., the compiler (or a lint) guarantees that every scoped surface is registered/torn down, and that every scope variant is handled — for **both** the board and identity scopes, and ideally under **one generic scoping convention**?
2. Is the registry best understood as a **capability** ("the only way to hold scoped state is to go through the registry, which confers — and obligates — its teardown"), and if so, can that be made structural (make "scoped state without teardown" unrepresentable) rather than conventional?
3. Most importantly: does pursuing this **expose a serendipitous refactoring/simplification opportunity** in this codebase? The maintainer's strongest interest is refactoring that *removes* code and duplication, not adding framework. If the honest answer is "more machinery than it's worth," say so plainly.

## What to produce
An independent design memo. Cover: the spectrum of mechanisms (runtime registry+test → compile-time exhaustiveness → capability/make-illegal-states-unrepresentable), with concrete TypeScript sketches grounded in THIS codebase's actual surfaces and their real differences (module-scope caches vs the SyncService-persisted store maps with schema migrations — these may not be funnel-able the same way). Be specific about where each mechanism bites and where it can't reach. Distinguish partitioning-completeness (teardown exhaustiveness) from visibility/trust (don't conflate — see audit §8). Name any genuinely novel angle the obvious framings miss (e.g. phantom/branded types tying a value to its scope lifetime, effect/linear-type emulation, deriving store shape + teardown + reset from one closed key set, etc.). End with a blunt verdict: is there a real, code-removing refactor here, what is it concretely, and what would be over-engineering.

Note: the Agent/Task tool is not exposed to you in this harness, so you cannot fork sub-agents — do the analysis inline (full coverage of the above is feasible solo). Do NOT write any files and do NOT run git; RETURN the full memo as your final message.

---

License: Public Domain (The Unlicense).
