# ADR-0001: State Mutation Model and `readonly` Policy

- **Status:** Accepted
- **Date:** 2026-04-24
- **Amendments:** 2026-06-10 — recorded that **Revisit-when #2
  (performance profiling reveals specific reactivity hot spots) has
  fired** (the 2026-05-27/28 perf audits), corrected the
  mutator-benefits re-wrap bullet (the identity re-wrap survives in
  `mutateReviewSession` only; `mutateBoard`'s was removed in the
  2026-05-28 game-scroll arc for documented render reasons), and
  corrected the Related-section claim that the mutators' docstrings
  reference this ADR (no such reference exists at HEAD). The decision
  itself is unchanged. One of the bounded ADR record repairs from the
  2026-06-10 history-lessons audit
  (`docs/notes/audit/audit-spa-history-lessons-2026-06-10.md` §3.23;
  work-status item `adr-record-amendments-2026-06`).
  Second amendment, same date — recorded the **Revisit-#3 response**:
  the review-time vigilance this ADR's Negative-consequences section
  assigned to contributors ("grep for direct `.boards[` writes during
  review") is now mechanized as a data-driven writer-enumeration lint
  (`local/store-write-needs-owner`, `frontend/eslint.config.js`) over
  the `store.boards` / `store.engine` / `store.profile` subtrees,
  with this ADR's template-toggle exception carved out as config. The
  trigger itself has **not** fired and stays live — see the note
  under Revisit-when #3. The decision is again unchanged. From the
  same audit's §3.7 leg (iv) (work-status item
  `multi-writer-slots-get-owners`).
  Third amendment, 2026-06-11 — the three retired TODO-numbering
  handles (Revisit #1, Related ×2) re-pointed to stable handles
  (the work-status item id for the live multi-tab trigger; the
  archive snapshot for the two shipped items), and a dated
  catalog-split note added in Context. No content change; per the
  stable-handles convention (history-lessons audit §3.25).
  Fourth amendment, 2026-06-11 — appended the profile-owner
  follow-on to the Revisit-#3 response note: `store.profile` now
  has an owner module joining the mutator family
  (`src/store/profile-owner.ts`; work-status item
  `settings-profile-mutator-owner`), the lint's ten profile
  exemptions are retired, and the two aliased generic-machinery
  write shapes are mechanized. The decision is again unchanged;
  the trigger stays live.
- **Decision drivers:** Vue reactivity architecture; TypeScript type-system
  semantics; performance at deep store paths; honesty of type annotations.

## Context

The frontend (`gogui`) is a Vue 3 SPA with a single reactive `GlobalStore`.
State lives in deep object graphs (`store.session.ui.X`,
`store.profile.settings.engine.katago.Y`, `store.boards[i].nodes[id].Z`),
mutated both directly by Vue templates (`@click` handlers toggling UI
state) and by named mutator functions (`mutateBoard`, `mutateReviewSession`)
in the store module.

Before this decision, `src/types.ts` marked essentially every field of
every interface as `readonly`.

*(Catalog note, 2026-06-10: the single-file catalog has since split along
its banner seams into `src/types/` domain modules plus
`src/store/schema.ts`, with `types.ts` remaining as the barrel —
history-lessons audit §3.15. The two-category `readonly` policy this ADR
sets is restated in the barrel's header; the historical claim above
describes the pre-split file.)*

The intent was likely aspirational —
signaling that state *should* be treated as immutable and mutated only
through designated mutator functions. In practice, the actual runtime
code mutated these fields pervasively through every channel available
(direct template writes, engine-internal writes, service-layer writes
to `store.engine.*`, navigator-internal writes to board state, etc.).

Running `vue-tsc --strict` — which had not been run in a long time —
surfaced ~70 compile errors for `readonly` assignment violations, out
of ~124 total build errors.

This forced an architectural question: **should the codebase adopt true
per-field immutability discipline (keeping `readonly` everywhere and
routing all writes through mutation helpers that shed the readonly
shell), or should it admit that most of its state is mutable-by-design
and remove `readonly` from fields that are genuinely written to?**

### Why this is not a minor hygiene decision

The decision interacts with three orthogonal architectural concerns:

1. **TypeScript's semantics of `readonly`.** In TypeScript, `readonly` is
   a compile-time annotation on assignment operations. It does not
   constrain the underlying runtime: the object is as mutable as any
   JavaScript object; `readonly` only tells the compiler "emit an error
   if a line of code writes to this field through this typing." Two
   references to the same object, one typed with `readonly` and one
   without, will both succeed at runtime — `readonly` is not
   `Object.freeze`.

2. **Vue 3's reactivity mechanism.** Vue's reactivity uses Proxy-based
   mutation tracking. Reads register dependencies; writes fire effects.
   The system is engineered assuming in-place mutation of existing
   objects. When code replaces an object (`store.session.ui = { ... }`),
   the old Proxy is replaced by a new one; every previously-tracked
   dependency must be re-wired. This costs real cycles, and it costs
   them at exactly the hot paths the reactive system is meant to serve
   (fast, frequent updates through deep store paths). Performance has
   been noted as a concern for this codebase historically.

3. **The difference between Haskell-style immutability and
   TypeScript-`readonly`.** In Haskell, immutability is a runtime
   property guaranteed by the language, and many useful properties
   (referential transparency, safe concurrency, structural sharing,
   equational reasoning) follow as consequences. TypeScript's `readonly`
   does not provide any of those consequences — it only prevents one
   specific syntactic pattern of write. A codebase that uses `readonly`
   pervasively does not obtain Haskell-style immutability; it obtains
   a stricter local contract policed by the compiler, which is a
   useful-but-weaker thing and which can be defeated by any cast or
   non-readonly alias.

## Decision

**Remove `readonly` from interfaces that describe mutable state
containers. Retain `readonly` on interfaces that describe true value
objects.**

Concretely:

- **State containers (lose `readonly`):** `BoardState`,
  `ReviewSessionData`, `UISession`, `EngineState`, `EngineMetrics`,
  `AppSettings` and its nested config groups (`engine`, `appearance`,
  `persistence`, `minting`, `navigation`), `GameNode`, `ProfileState`,
  `SessionState`, `GlobalStore`, `CardSet`, `AnalysisEnvironment`,
  `AnalysisPalette`, `ThumbnailSettings`.

- **Value objects (keep `readonly`):** `Move`, `Point`, `EbisuModel`,
  `ReviewCard`, `SystemMessage`, `TagStat`, `ForestStat`, `GameMetadata`,
  `NodeDelta`, branded ID types.

The rule of thumb: **if the surrounding architecture writes to it, its
type should admit that it's written to**. Fields marked `readonly` are
a claim about the codebase's behavior; the claim must be true.

### How the "mutate only through mutators" convention is still enforced

Removing `readonly` does NOT remove the convention that most state
mutations go through named mutator functions (`mutateBoard`,
`mutateReviewSession`). That convention provides real benefits:

- A single place to bump version counters (`boardsVersion.value++`) so
  that consumers of shallow-watched state get notified.
- A single place to re-wrap mutated objects to trigger Vue's
  reactivity for subscribers watching the whole record. *(Corrected
  2026-06-10 — this bullet now holds for `mutateReviewSession` only,
  which re-wraps the review record (`store/index.ts:209`).
  `mutateBoard`'s identity re-wrap (`store.boards[index] =
  { ...board }`) was removed in the 2026-05-28 game-scroll perf arc:
  the swap fired the *array* dep and re-rendered every coarse reader
  of the boards array on each navigation step, while the in-place
  mutation through the deep-reactive proxy already fires the
  fine-grained field deps. `boardsVersion` remains the explicit
  coarse signal. The rationale lives as an inline comment in
  `mutateBoard` itself, citing
  `docs/notes/audit/perf-audit-game-scroll-2026-05-28.md` Arc 1. The
  other bullets in this list hold unchanged for both mutators.)*
- A single place to enforce invariants (sanity-check indexes, clamp
  values to legal ranges, etc.).
- A grep target: anyone wanting to know "what code writes to
  BoardState" can find the mutator and read its call sites.

The convention is enforced by **code review and architectural clarity**,
not by the type system. The `readonly` annotation was never actually
enforcing it either (the mutator implementations internally used
`as any` casts to shed the readonly shell), so we lose nothing real
by dropping the annotation; we gain compile honesty.

### Exception: UI state written directly from templates

Vue templates write to `store.session.ui.*` fields directly
(`@click="store.session.ui.sidebarExpanded = !store.session.ui.sidebarExpanded"`).
This is a legitimate pattern for small UI toggles; routing every such
toggle through a mutator would be pure ceremony. `UISession` therefore
drops `readonly` and allows direct writes from templates. Future-us
may decide to collect UI state into a Pinia store with typed actions,
at which point those writes become `actions`; see the "Revisit when"
section.

## Consequences

### Positive

- **Compile passes honestly.** `npm run build` succeeds; the ~70
  `readonly` errors go away not by cheating but by aligning the types
  with reality.
- **No runtime behavior change.** No casts removed, no mutator logic
  altered, no new allocations. The runtime does exactly what it did
  before; only the type declarations change.
- **Reactivity performance preserved.** In-place mutation through
  `mutateBoard` et al. continues to work with Vue's Proxy system as
  designed. We do not pay the tax of object-replacement-style updates.
- **Future casts become unnecessary.** The `as any` escapes inside
  mutator implementations can be removed (follow-up hygiene); callers
  never needed them in the first place.
- **Type declarations are now truthful.** A field marked `readonly`
  hereafter genuinely means "this field is not written to anywhere in
  the codebase." The annotation recovers its meaning.

### Negative

- **We lose the compiler-enforced "route all writes through mutators"
  property.** A contributor can now write `store.boards[0].currentNodeId
  = ...` directly and the compiler will accept it, when previously they
  would have had to either go through `mutateBoard` or insert a cast.
  The mutator convention survives but becomes a code-review
  responsibility.
- **Templates can now silently drift from the mutator pattern.** As
  above: nothing in the type system prevents a component from doing
  `activeBoard.value.stones[coord] = 'B'` directly, bypassing both
  `mutateBoard` and Vue's board-version counter. Vigilance required;
  grep for direct `.boards[` writes during review. *(Mechanized
  2026-06-10 — the grep duty is now the `local/store-write-needs-owner`
  lint: direct dotted-path writes to `store.boards` / `store.engine` /
  `store.profile` outside each subtree's enumerated owner files are
  errors. The lint is syntactic best-effort — aliased writes like the
  `activeBoard.value.stones[coord]` example above remain review's to
  catch, a gap named in the rule file per ADR-0002.)*
- **No Haskell-style immutability guarantees.** Not a regression (we
  never had them), but newly explicit.

### Neutral

- **Value-object `readonly` continues to carry meaning.** `Move`,
  `Point`, `EbisuModel` etc. are still `readonly`; the compiler still
  rejects writes to their fields; this remains useful documentation.

## Alternatives considered

### Alternative A: Keep `readonly` everywhere; enforce through `Mutable<T>` helpers

Maintain the `readonly` shell on every interface; every mutator sheds
the shell via a `Mutable<T>` / `DeepMutable<T>` helper. Direct template
writes become illegal; every UI toggle must go through a named mutator
(e.g., `toggleSidebar()` in the store).

**Rejected because:**

- Fights Vue's reactivity grain. Many small UI toggles become store
  actions, inflating the store API surface for no clear benefit.
- Provides no runtime guarantee — `readonly` is compile-time-only;
  `Mutable<T>` is a cast. We would be maintaining an elaborate
  convention that simulates a property (immutability) that the
  runtime does not provide, policed only by the compiler's recognition
  of `readonly` on assignment. This is the shape of the type-system
  tool (compile-time annotations on syntactic writes) applied to a
  problem it isn't shaped for (runtime immutability).
- Future-contributor cost: every new mutation requires understanding
  the `Mutable<T>` helper, its compose-ability with
  `readonly`, and the discipline that calls for its use. High ceremony,
  low real guarantee.
- Does not compose with Vue's reactive Proxy behavior in any way that
  Path A doesn't also provide.

### Alternative B: Adopt an immutable-state library (Immer, Immutable.js, MobX)

Pull in a library that models state as persistent data structures with
structural sharing, and rewrite the store atop it.

**Rejected (for now) because:**

- Large blast radius: touches every store access site, every component
  binding, every composable projection.
- Vue's reactivity is not designed around persistent data structures;
  integration is non-trivial and likely requires its own abstraction
  layer.
- The problem being solved (discipline around state mutation) is
  better served by the simpler mutator-convention we already have.
- Potential future project if we find the mutator convention
  insufficient; see "Revisit when" below.

### Alternative C: Migrate store to Pinia

Pinia stores use actions for mutations, giving compiler-enforced routing
of writes through typed functions.

**Rejected for this decision because:**

- Pinia is a migration, not a typing discipline. It's orthogonal to
  the `readonly` question (a Pinia store can still use `readonly`
  liberally or not at all).
- The blast radius is substantial and the payoff is incremental — we'd
  gain typed actions but we already have named mutators doing the same
  job.

Pinia remains a reasonable future step independent of this decision;
see "Revisit when."

## Revisit when…

This decision would be worth revisiting if one or more of the following
become true:

1. **Multi-tab concurrency becomes a real workflow.** If two browser
   tabs can meaningfully edit state at the same time, we need conflict
   detection (ETag-style — parked as work-status item
   `item-27-etag-multitab`, the ETag multi-tab coordination layer;
   successor of the retired TODO numbering's item 27-full, design
   sketch in the `SyncService::sendSync()` comment) and likely a more
   disciplined mutation model. Persistent data structures (Immer or
   Immutable.js) become more attractive if we need to snapshot-and-diff
   cheaply.

2. **Performance profiling reveals specific reactivity hot spots.** If
   we discover that deep-proxy access is actually expensive in specific
   components (not just theorized), we may want to refactor those
   components to hold shallow projections of state rather than reading
   through deep reactive paths. This might or might not motivate
   revisiting `readonly`. **(Fired; recorded 2026-06-10.)** The
   2026-05-27/28 perf audits found exactly this class of hot spot. The
   response did not revisit `readonly`: the cost was `mutateBoard`'s
   object re-wrap (which coupled every coarse reader of the boards
   array to per-navigation updates), not the mutation model, and
   removing the identity swap resolved it — see the corrected
   benefits bullet above. The decision stands; the trigger stays live
   for any future hot spot the mutation model itself causes.

3. **The mutator convention starts breaking down.** If contributors
   frequently bypass `mutateBoard` / `mutateReviewSession` and produce
   state bugs that a stricter type discipline would have caught, we'd
   reconsider Alternative A or move to Pinia actions.
   **(Response recorded 2026-06-10 — trigger not fired.)** The
   2026-06-10 history-lessons audit measured the convention's edges
   rather than waiting for the breakdown: `store.boards` had zero
   out-of-convention dotted-path writers, but `store.engine` had ~20
   direct writers scattered through `analysis-service.ts` (collapsed
   into the `services/engine-connection.ts` owner module in the same
   change) and `store.profile` had 10 (triaged: every one a deliberate
   slice write, kept as annotated inline exemptions). Rather than
   escalating to Alternative A / Pinia, the response mechanizes the
   review vigilance this ADR had assigned to prose: the
   `local/store-write-needs-owner` lint enumerates each subtree's
   writer set in `eslint.config.js` ({subtree → owner files}, with the
   template-toggle exception below carved out as config), so a new
   stray writer is a lint error instead of a review hope. The trigger
   stays live on its own terms: if writers start arriving through the
   lint's named syntactic gaps (aliased roots, method-call mutations)
   and produce state bugs, Alternative A / Pinia reconsideration is
   back on the table. Audit §3.7 leg (iv); work-status item
   `multi-writer-slots-get-owners`.
   *(Follow-on recorded 2026-06-11 — trigger still not fired. The
   `store.profile` residue above ("10, kept as annotated inline
   exemptions") was discharged by work-status item
   `settings-profile-mutator-owner`: the subtree gained an owner
   module joining the mutator family (`src/store/profile-owner.ts` —
   `mutateProfile` / `updateProfileAt` / `writeStoreKnobValue`), all
   ten exemptions were rerouted through it and removed, and the two
   aliased generic-machinery write shapes the lint's gaps admit —
   `updateRegistry` handed a `store.profile` root, the knob substrate
   handed the live store root — are now `no-restricted-syntax`
   selectors in `eslint.config.js`. Arbitrary aliased writes through
   intermediate variables remain review's to catch; the trigger's
   terms are unchanged.)*

4. **A Pinia migration happens for other reasons** (better devtools
   integration, clearer domain-slicing of the store, plugin ecosystem).
   At that point Pinia's typed-action model subsumes the mutator
   convention, and the `readonly` policy can be re-derived in the new
   context.

5. **TypeScript gains a more meaningful immutability primitive.**
   Unlikely in the near term, but if the language ever grows a true
   deep-frozen-object story with runtime teeth, Path A can be
   reconsidered.

## Related

- The `mutateBoard` and `mutateReviewSession` functions in
  `src/store/index.ts` are the conventional enforcement mechanism
  referenced throughout this ADR. *(Corrected 2026-06-10: this bullet
  claimed the mutators' docstrings reference this ADR — no such
  reference exists at HEAD. `mutateBoard` carries an inline rationale
  comment citing the 2026-05-28 game-scroll perf audit;
  `mutateReviewSession` carries no docstring. The ADR-to-code linkage
  runs in this direction only.)*
- The last-write-wins single-tab invariant documented on
  `SyncService::sendSync()` (retired TODO numbering, item 27-min;
  archived record in `docs/archive/TODO-completed-2026-05-06.md`) is a
  consequence of the same "mutation-first, discipline via convention"
  model.
- The collapse of `SyncService`'s three-channel watcher into one
  (retired TODO numbering, item 17; same archive) is enabled by the
  fact that mutations all land in the same reactive tree, making a
  single watcher sufficient.

## Not goals (explicit)

- **Not adopting Haskell-style immutability.** The runtime does not
  support it and the framework does not want it.
- **Not adding `Mutable<T>` helpers.** We remove the need for them by
  making the declared types match the actual write discipline.
- **Not banning direct mutation from Vue templates** on `UISession`.
  Small UI toggles may write directly; structural state goes through
  mutators.
- **Not claiming the convention is bulletproof.** It isn't; it relies
  on code review and architectural clarity. That's a cost we accept.
