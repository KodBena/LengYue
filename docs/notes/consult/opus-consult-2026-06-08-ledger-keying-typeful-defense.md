# Opus Consult — analysis-ledger key-axis mismatch, typeful defense (design-space investigation, 2026-06-08)

Read-only Opus design-space investigation (general-purpose agent, model
`opus`, internet-enabled), commissioned after the maintainer found that board
overlays (move suggestions, ownership) blank out after a review session whose
card-palette differs from the SPA's active palette. The root cause is the
analysis ledger's single opaque key (`hashConfig(compileAnalysisDescriptor())`)
conflating three independent provenance axes — model/network, engine overrides,
palette — while the stored payload is heterogeneous: the raw KataGo fields
(`moveInfos`, `rootInfo`, `ownership`, `policy`, `pv`) depend only on
model/overrides, but `extra.*` enrichment depends additionally on the palette.
A palette-only change therefore makes the palette-independent raw data
unreachable (over-keying / false miss).

The consult was asked **not** to implement, but to: frame the bug class
precisely in the vocabulary of types and incremental computation; survey prior
art (internet, cited); lay out the TypeScript-expressible design options for
restratifying the ledger so a wrong-key read becomes a compile error; and
recommend an ADR-aligned phased path (minimal correctness fix vs. full typeful
overhaul). The maintainer flagged the ledger overhaul as overdue (one of the
oldest parts of the SPA).

**Decision in response:** none committed yet. The report is recorded here for
auditability ahead of deciding between the tactical key-split and the full
overhaul; the implementation arc, if taken, will reference this record.

Saved verbatim for auditability per the consult-record convention.
License: Public Domain (The Unlicense).

---

# Consult record: making the analysis-ledger key-axis mismatch unrepresentable

**Commissioned:** design-space investigation, no implementation. Principal-architect / formal-methods lens, applied to the LengYue frontend SPA.
**Scope read end to end:** `frontend/CLAUDE.md`; `docs/adr-synopsis.md` (ADR-0001..0010 condensed); `src/services/analysis-ledger.ts`; `src/services/analysis-config.ts`; `src/composables/board/use-move-suggestions.ts`; `src/engine/katago/types.ts`; `src/composables/analysis/useEnrichedData.ts`; `src/services/analysis-bundle.ts` (write/replay sites). Breadth-skimmed for the read pattern: `useTriangularHeatmap.ts`, `useStabilityMetrics.ts`, `BoardWidget.vue`, `ToolbarEngineMetrics.vue`, `BoardTab.vue`, `useAnalysisTimeline.ts`, `useReviewSession.ts`, the write/replay in `analysis-service.ts` + `analysis-bundle.ts`.
**Not read (firewall):** nothing under `backend/qeubo/`.

A caveat up front, in the codebase's own register: I read the consumer set by `grep` + targeted reads, not every consumer line by line. The axis-classification of each field below (raw vs. enriched) I'm confident in; the exhaustive per-consumer migration cost in §3 is an estimate, flagged where it is.

---

## 1. Problem framing

### 1.1 What the bug actually is, in precise terms

The ledger is a memoization table. Its key is one opaque `string` — `hashConfig(compileAnalysisDescriptor())` — that DJB2-collapses a **three-axis descriptor**:

- **M** — model / network (`store.engine.selectedModel`, the SELECTOR routing key)
- **O** — engine overrides (`overrideSettings`: winrate framing, symmetry, root noise, visits-shaping)
- **P** — palette (`analysis_config`: `delta_fn` / `state_fns` / `summary_fn` / parameters / symbols)

The stored value `KataAnalysisResponse` is **heterogeneous in its provenance**:

| Field | True dependency set |
|---|---|
| `moveInfos`, `rootInfo`, `ownership`, `policy`, `pv` | **M, O** only |
| `extra.state`, `extra.black`, `extra.white` (deltas, triangular, cwt) | **M, O, P** |

The key is `key = hash(M, O, P)`. The raw fields' *true* dependency set is `(M, O)`. So the raw fields are **over-keyed**: they are filed under a strictly larger key than the set they actually depend on.

This is the classic **cache-key / dependency-set mismatch**. The literature on it is blunt: "ensure that everything affecting the response is either in the cache key or not cacheable at all" ([PortSwigger / web-cache discipline, via AquilaX summary](https://aquilax.ai/blog/web-cache-poisoning-deception)). The dual rule — *nothing that does not affect a value should be in that value's key* — is the one violated here. The two failure modes are symmetric:

- **Under-keying** → **false hits / cache poisoning**: a value is served for a key whose true dependencies differ. (Not this bug, but the danger of any naïve fix that merges buckets too aggressively — see §3.)
- **Over-keying** → **false misses**: a byte-identical value is recomputed (or here, *rendered unreachable*) because the key carries an axis the value doesn't depend on. **This is the bug.** A palette-only change (P → P′) mints a fresh `key' = hash(M, O, P′)`; the `(M,O)`-only raw fields, byte-identical under `key` and `key'`, are now filed only under `key` and the board overlays blank out.

### 1.2 The deeper invariant the types fail to encode

In incremental-computation vocabulary, every memoized value should be keyed by **exactly its demanded dependency set** — the inputs it actually read during computation. Adapton calls this the *demanded computation graph*: "for each call, the DCG records the arguments, the result, and the computation's effects" ([Hammer et al., Adapton, PLDI 2014](http://matthewhammer.org/adapton/)). Salsa records, per query, "which inputs were accessed" ([salsa-rs](https://github.com/salsa-rs/salsa)). Jane Street's Incremental makes the dynamic dependency set first-class: "the dependency structure of this computation changes dynamically… the computation only depends on length and the first 7 elements" ([Introducing Incremental](https://blog.janestreet.com/introducing-incremental/)). Skip's memoizer "makes the cached value *depend on* all mutable state that function examined when it ran" ([Skip reactivity overview](https://skiplang.com/blog/2017/01/04/how-memoization-works.html)).

In every one of these systems the key *is* the dependency set, computed automatically from what the function read. The ledger's defect is that it has a **single, hand-authored, monolithic key** that is the *union* of the dependency sets of two payload partitions whose true dependency sets differ. The category error — "a field may only be keyed by the axes it actually depends on" — is exactly the invariant these frameworks enforce by construction and that the ledger's `Map<string, …>` type permits the compiler to ignore.

The TypeScript-relevant framing of "encode the invariant in the type so the wrong-key read can't be written": **make illegal states unrepresentable** ([Minsky, via the canonical write-ups](https://fsharpforfunandprofit.com/posts/designing-with-types-making-illegal-states-unrepresentable/)) and **parse, don't validate** — push the refinement to the boundary so downstream code relies on the invariant rather than re-checking it ([Alexis King, 2019](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)). The current `getRaw(string, NodeId)` is the *validate* shape at its worst: it doesn't even validate; it silently accepts any string as any kind of key.

---

## 2. Prior art (transferable ideas, and whether TS can express each)

### 2.1 Incremental-computation / memoization frameworks

**Salsa (Rust).** Queries are `K -> V` functions; the framework records per-execution which inputs were read and re-uses cached results "as appropriate" ([salsa-rs/salsa](https://github.com/salsa-rs/salsa); [rustc-dev-guide](https://rustc-dev-guide.rust-lang.org/queries/salsa.html)). The transferable idea: **stratify computation into layered queries where each layer's key is its own minimal input set, and let a derived layer depend on a base layer.** A "raw analysis" query keyed by `(M,O)` and an "enrichment" query keyed by `(M,O,P)` that *reads* the raw query is the direct analogue. TS cannot auto-track reads, but it can *encode the stratification structurally* (two stores, two key types) — which is §3(a). This is the single most transferable model for this bug.

**Adapton (OCaml/Rust).** Demand-driven: "programs only recompute computations as demanded by observers" via the DCG ([Adapton](http://matthewhammer.org/adapton/); [docs.rs/adapton](https://docs.rs/adapton)). Transferable idea: **dirtying/cleaning is per-node and demand-gated.** The ledger already has a hand-rolled version of this (per-`(hash,nodeId)` version refs + the `onLedgerFlush` changed-key set). The lesson for the overhaul: whatever key restructuring happens, the *notification granularity must remain per-node and per-layer* so the rAF-coalesced flush and the incremental accumulator in `useEnrichedData` survive. TS can't express the DCG in types, but the existing reactive surface is the runtime embodiment — don't regress it.

**Jane Street Incremental (OCaml).** Self-adjusting computation; the dependency graph is "made real in OCaml objects… pointers to each other reflecting the structure of this dependency graph" ([Introducing Incremental](https://blog.janestreet.com/introducing-incremental/); [Incrementality and the web](https://blog.janestreet.com/incrementality-and-the-web/)). Transferable: **the graph node, not the consumer, owns its dependency set.** Useful as a north star but heavier than this bug warrants — the ledger has two payload partitions and three axes, not an arbitrary dynamic graph. ADR-0003 (no premature abstraction) argues against importing the full machinery.

**Skip (Facebook, MIT).** The strongest statement of the principle: type-system-tracked side effects let the compiler *prove* what a memoized function read, so cache invalidation is correct by construction ([Why Skip?](https://skiplabs.io/blog/why-skip); [Skip memoization](https://skiplang.com/blog/2017/01/04/how-memoization-works.html)). Transferable idea, and the honest verdict: **TS cannot do this.** TS has no effect system and no way to prove a function read only `(M,O)`. The TS-expressible substitute is *structural*: separate the raw payload into its own value so it is *physically impossible* for it to be keyed by P, because the P axis isn't in scope where the raw value is stored. You replace "prove the dependency set" with "arrange the types so the wrong dependency set can't be named."

**Build systems — Bazel / Shake.** Bazel derives an action key from "a hash of the command line, inputs, environment, and other execution metadata" and guarantees correct incremental rebuilds ([bazel.build/run/build](https://bazel.build/run/build); [How Bazel Works](https://www.gocodeo.com/post/how-bazel-works-dependency-graphs-caching-and-remote-execution)). Shake's contribution (Mitchell, "A sound and optimal incremental build system with dynamic dependencies," [morning-paper summary](https://blog.acolyer.org/2015/11/12/a-sound-and-optimal-incremental-build-system-with-dynamic-dependencies/)) is *dynamic* dependencies discovered during the build, not declared up front. Transferable: **the key must contain exactly the inputs the action consumed — no more (over-keying = needless rebuilds), no less (under-keying = stale output).** This is the build-systems statement of §1.1, and it validates splitting the key by consumed-input partition.

### 2.2 Content-addressed / Merkle storage

CAS identifies data "by what it is (its content) rather than where it is," giving deduplication (identical content → identical id) and immutability ([Cloudillo](https://docs.cloudillo.org/architecture/fundamentals/merkle-tree/); [LWN: Merkle trees and build systems](https://lwn.net/Articles/821765/); Bazel CAS via [Luong](https://sluongng.hashnode.dev/bazel-caching-explained-pt-1-how-bazel-works)). Transferable idea: **if the raw payload were content-addressed by `(M,O,nodeId)` it would deduplicate automatically across palette changes** — the false-miss vanishes because the raw value's address doesn't contain P. This is essentially §3(a) re-derived from the storage angle: a `(M,O)`-addressed raw store *is* a small content-addressed layer. Full Merkle-DAG lineage is overkill here (we have three fixed axes, not arbitrary history), but the *addressing principle* — address derived from true dependencies — is exactly right and is what the recommendation rests on.

### 2.3 Type-system techniques (and TS expressibility)

- **Phantom / branded types.** A brand is "a phantom property… exists only at compile time, never at runtime," giving nominal distinctions over structurally-identical primitives ([Tiger Abrodi](https://tigerabrodi.blog/branded-types-in-typescript); [DEV: phantom types](https://dev.to/gabrielanhaia/phantom-types-in-typescript-stop-mixing-kilograms-and-pounds-at-compile-time-iem); [tey.sh phantom data](https://tey.sh/TIL/003_phantom_types_in_typescript)). **TS: yes, idiomatic** — the codebase already does this (`NodeId`, `BoardId`, the whole `IDENTIFIERS.md` namespace repository). A `RawKey = string & {__brand:'RawKey'}` vs `EnrichedKey = string & {__brand:'EnrichedKey'}` makes `getRaw(enrichedKey, …)` a compile error. This is the lowest-cost type lever and directly serves ADR-0002 ("preferring compile-time errors").

- **"Parse, don't validate."** Refine at the boundary, return the refined type, let downstream rely on it ([King, 2019](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)). **TS: yes.** The "boundary" here is `compileAnalysisDescriptor()` / `hashConfig()` — today it returns a bare `string`. A parse-step that returns `{ rawKey: RawKey; enrichedKey: EnrichedKey }` (deriving both from the structured descriptor) is the refinement; consumers receive already-correct keys instead of constructing them.

- **Make illegal states unrepresentable.** ([fsharpforfunandprofit](https://fsharpforfunandprofit.com/posts/designing-with-types-making-illegal-states-unrepresentable/); [functional-architecture.org](https://functional-architecture.org/make_illegal_states_unrepresentable/)). The strongest form for this bug: **split the value so the raw payload has no place to put P-keyed data.** A `RawAnalysis` type that simply has no `extra` field cannot be keyed by P because P never enters its world. **TS: yes** — it's just two interfaces instead of one.

- **GADTs / indexed types / type-indexed heterogeneous maps.** GADTs give "more advanced type behaviour" by letting constructors instantiate the return type ([Wikipedia: GADT](https://en.wikipedia.org/wiki/Generalized_algebraic_data_type); [Pellegrino, TS GADTs](https://www.matteopellegrino.dev/posts/ts-gadt/)). A type-indexed map where the key type determines the value type is the relevant shape: `get(k: RawKey): RawAnalysis; get(k: EnrichedKey): Enrichment`. **TS: partially.** Overload signatures + conditional/mapped types approximate it ([typescript-training mapped types](https://www.typescript-training.com/course/intermediate-v1/09-mapped-types/); [TS issue #33014, dependent-type-like functions](https://github.com/microsoft/TypeScript/issues/33014)), but it's fiddly and erases at runtime. Worth knowing; probably more machinery than ADR-0003 sanctions for two key kinds.

- **Capability / witness types.** A value carries a proof it was produced under a given axis-binding. **TS: weakly** — a brand *is* a poor-man's witness, but TS can't enforce the witness was honestly minted (the brand cast is the trust boundary, same as every branded id in the codebase today; ADR-0002 says the cast needs a justifying comment).

- **Dependent typing in TS.** "TypeScript does not provide dependent types," but unions + literal types + indexed access give "dependent-type-like functions" from the caller's view ([TS issue #33014](https://github.com/microsoft/TypeScript/issues/33014)). Verdict: don't lean on it; the brand + structural-split combo gets the guarantee without the fragility.

---

## 3. TypeScript-expressible design options for *this* ledger

I'll describe each, then weigh against the reactive surface, the changed-key listener, the merge logic, persistence/replay, and the ~12 consumer sites.

### Option (a) — Provenance-stratified stores (the Salsa/Bazel structural analogue) — *the substantive fix*

Two stores, each keyed by its true axis-subset:

- **Raw store:** `Map<RawKey, Map<NodeId, RawAnalysis>>`, where `RawKey = hash(M, O)` and `RawAnalysis = { moveInfos, rootInfo, ownership?, policy? }` (no `extra`).
- **Enrichment store:** `Map<EnrichedKey, Map<NodeId, Enrichment>>`, where `EnrichedKey = hash(M, O, P)` and `Enrichment = KataExtra`.

A consumer reading move suggestions / ownership reads the **raw store under the `(M,O)` key**, which is *invariant under palette change* — the false-miss is gone by construction. A consumer reading `extra.*` reads the enrichment store under the full key.

- **Interaction with reactive version refs:** the per-`(key,nodeId)` `ref(0)` surface generalises cleanly — two families of version refs (raw-keyed, enriched-keyed). A raw consumer subscribes only to raw bumps; a palette swap bumps *no* raw ref, so overlays don't even re-render needlessly (a latent perf win, ADR-0010-adjacent).
- **Changed-key listener:** `onLedgerFlush` currently emits `${hash}:${nodeId}`. It would need to distinguish raw vs enriched changed-keys (e.g., tagged keys, or two listener channels). `useEnrichedData` consumes enrichment changes; it would subscribe to the enriched channel. Manageable but it *is* a touch to the one genuinely subtle consumer.
- **Merge logic:** `mergeAnalysisPacket` today merges raw (visit-count gating) and `extra` (deep merge) in one call. It splits naturally: raw-merge by visits into the raw store, `mergeKataExtra` into the enrichment store. The split is arguably *clearer* than the current entangled form. **Watch out:** the visit-count gate (`incomingVisits < existingVisits → keep existing`) currently also guards `extra`; under the split, enrichment merge must decide its own staleness rule (it currently rides on the raw decision). This is a real semantic question to settle, not a mechanical move.
- **Persistence / replay (`analysis-bundle.ts`):** `listEntriesForNodes` and `replayBundleIntoLedger` round-trip `{configHash, nodeId, packet}`. Splitting means the bundle either (i) stores both stores' entries (schema bump — the bundle already versions via `BUNDLE_SCHEMA_VERSION` and *throws* on unknown versions per ADR-0002, so a migration path exists), or (ii) keeps storing the composite packet and re-splits on replay. Option (ii) is lower-blast-radius and back-compatible with existing persisted bundles. **This is the single largest cost center** and deserves its own decision.
- **Consumer migration (~12 sites):** raw-only consumers (`use-move-suggestions`, `BoardWidget` ownership, `ToolbarEngineMetrics` rootInfo, `BoardTab`/`useAnalysisTimeline` visit vectors, `wait-for-analysis`) switch to a `getRawAnalysis(rawKey, nodeId)` call. Enrichment consumers (`useTriangularHeatmap`, `useEnrichedData`, `useStabilityMetrics`'s feed, `useReviewSession`'s `extra.deltas` read) switch to `getEnrichment(enrichedKey, nodeId)`. Estimate: each is a 1–3 line change at the read site plus the key-source swap. The *risk* is not per-site size but getting the raw/enriched classification right at every site — which is exactly the judgment the type system should be made to enforce (see (b)).

### Option (b) — Phantom/branded key types — *the type lever, pairs with (a)*

`RawKey` and `EnrichedKey` as distinct brands. `getRawAnalysis(k: RawKey, …)` and `getEnrichment(k: EnrichedKey, …)`. A consumer that tries to read raw data under the palette-inclusive key gets a **compile error** — the wrong-key read becomes unrepresentable, which is the literal mandate of §1.2 and the ADR-0002 ideal ("compile-time errors first").

On its own, branding without (a) is hollow — if there's still one store and one value, the brands just decorate the same string. Branding's value is *as the enforcement layer on top of (a)*: it makes the stratification non-bypassable. The construction sites (`compileAnalysisDescriptor`, the replay-hash sites in `analysis-service.ts` and `useReviewSession.ts`) become the *only* places the brands are minted — the "parse, don't validate" boundary. Each mint is a branded cast needing the ADR-0002 justifying comment, exactly as every id in `IDENTIFIERS.md` already does.

### Option (c) — Structured key value-object, hash derived — *enabler, do regardless*

Today the axes are visible only inside `compileAnalysisDescriptor` and are immediately DJB2-collapsed to an inscrutable hex string. Keep the descriptor `{ analysis_config, overrideSettings, model }` as a *first-class value object* threaded to the ledger boundary, and derive `rawKey = hash({model, overrideSettings})` / `enrichedKey = hash({model, overrideSettings, analysis_config})` from it. Benefits: the axes are inspectable (debuggability, ADR-0002 fail-loudly when a key looks wrong), and the raw/enriched derivation lives in *one* place rather than being reconstructed at the three current hash-construction sites (`analysis-config.ts`, `analysis-service.ts:502/720`, `useReviewSession.ts:341`). This is low-cost and strictly improves the current situation even if (a) is deferred. **Watch out:** the backward-compatible hash invariant documented in `compileAnalysisDescriptorFromParts` (model-last so pre-SELECTOR hashes are byte-stable) must be preserved for the *enriched* key; the *raw* key is new and has no back-compat constraint.

### Option (d) — Split `KataAnalysisResponse` into separately-keyed values — *the same as (a), stated at the type level*

`RawAnalysis` (no `extra`) and `Enrichment` (`= KataExtra`) as distinct types. This is not really an independent option; it's the *value-side* of (a) and the precondition for (b)'s guarantee (a `RawAnalysis` with no `extra` field has nowhere to misfile P-keyed data — "make illegal states unrepresentable" in its purest form). The ACL/normalisation in `analysis-service.ts` (`ledger.record(queryInfo.hash, …)` at line 958) becomes the parse boundary: a single wire packet is *parsed into* a `RawAnalysis` + an `Enrichment`, each recorded under its own key. **Watch out:** `winrate-framing.ts` normalisation and the `moveInfos?` defensive optionality noted in `use-move-suggestions` (line 96–100) live on the raw side and travel with it.

### Option (e) — Minimal correctness patch without restructuring (surfaced for honesty, not recommended as the endpoint)

A non-typeful stopgap: on a palette-only change, *copy* the raw fields from the old bucket into the new bucket (or have `getRaw` fall back to any bucket sharing the `(M,O)` prefix). This fixes the symptom without encoding the invariant. It is **against the grain of ADR-0002 and the whole point of this consult** — it re-introduces the silent coupling as runtime logic and leaves the category error representable. Document it only as a same-day hotfix if the blanking is user-visible *now* and the overhaul is weeks out; it should be explicitly retired (ADR-0005 Rule 7 transitional-section discipline) when (a)+(b) land.

---

## 4. Recommendation (ADR-aligned), with a phased path

### Weighing against the codebase's posture

- **ADR-0002 (fail loudly, compile-time first).** Argues hard *for* branded keys (b): turn the wrong-key read into a compile error, the strongest channel. It also argues for the structured key (c): an inspectable key fails louder than an opaque hex string when something is off.
- **ADR-0003 (no premature abstraction; Port at the second consumer).** Argues *against* importing a general incremental-computation framework (Adapton/Incremental-style) or a full type-indexed-map GADT encoding. There are exactly **two** payload partitions and **three fixed** axes — a bespoke two-store split is the honest amount of structure, not a generic dependency engine. ADR-0003 *sanctions* (a)+(b)+(c)+(d) because they're concrete to the two consumers-classes that exist (raw-readers, enrichment-readers), not speculative seams.
- **ADR-0008 (honest classification; don't fabricate structure).** The raw/enriched split is not fabricated — it's a *real* provenance boundary already latent in `KataExtra` vs the rest, already documented in `analysis-config.ts`'s header (it distinguishes `compileAnalysisConfig` from `compileEngineOverrides`). Naming it in the types is honest classification, the opposite of the negative-register failure ADR-0008 guards against.
- **ADR-0010 / reactivity (`CLAUDE.md`).** The per-node version-ref + changed-key surface is load-bearing and recently perf-tuned (rAF coalescing, first-packet sync bump, the `useEnrichedData` incremental accumulator pinned byte-equal by test). Any restructuring must **preserve notification granularity** and re-run the perf regression battery (per MEMORY) — a chart/render-path change by definition.

### Recommended direction

**The full typeful overhaul is (c) + (d) + (a) + (b), in that dependency order**, because each is the precondition for the next:

1. **(c) Structured key + derived hashes**, in one place (`analysis-config.ts`). Eliminates the three scattered hash-construction sites' duplication; introduces the raw vs enriched *derivation* without yet splitting storage. Lowest blast radius, strict improvement, and it's where the back-compat hash invariant is enforced.
2. **(d) Split the value type** (`RawAnalysis` | `Enrichment`) at the `analysis-service.ts` record boundary (parse, don't validate). This is the "make illegal states unrepresentable" core.
3. **(a) Split the store** into raw-keyed `(M,O)` and enriched-keyed `(M,O,P)` layers, generalising the version-ref and changed-key surfaces. This is what actually kills the false-miss.
4. **(b) Brand the two key kinds** so the wrong-key read is a compile error — the ADR-0002 guarantee that the bug class is *unrepresentable*, not merely *fixed*.

The persistence/replay schema (`analysis-bundle.ts`) is the **largest single cost and the main risk**; I'd recommend the lower-blast-radius variant — keep persisting the composite packet, **re-split on replay** — so existing persisted bundles round-trip unchanged and the bundle schema version need not bump. Revisit only if the split stores need independent persistence later.

### Phased path

- **Phase 0 (optional, only if blanking is user-visible now):** the (e) stopgap, explicitly marked transitional per ADR-0005 Rule 7, retired when Phase 2 lands. Skip if the overhaul is near-term.
- **Phase 1 — minimal correctness fix that is *also* the foundation:** (c) + (d). Structured key, derived raw/enriched hashes, split value type at the record boundary. At the end of Phase 1 you *could* already store both payloads under their respective keys with minimal store change. This is the smallest change that encodes the invariant honestly.
- **Phase 2 — the store split + branding:** (a) + (b). Generalise version refs and `onLedgerFlush` to two layers; brand `RawKey`/`EnrichedKey`; migrate the ~12 consumers (mechanically small per site, but get the classification right — the brands will tell you at compile time if you don't). Re-run the perf regression battery; pin the incremental accumulator's byte-equality test against the new shape.

### Candid residuals

- TS cannot *prove* the raw payload read only `(M,O)` (no effect system, unlike Skip). The guarantee is *structural*, not *semantic*: the raw value has no `extra` field and the raw store has no P in its key, so misfiling is unrepresentable — but the *honesty of the brand mint* at the parse boundary is a trust point (the ADR-0002-justified cast), same as every branded id today.
- The enrichment merge's staleness rule currently rides on the raw visit-count gate; the split forces an explicit decision there. Don't paper over it.
- `winrate-framing.ts`'s residual limitation (palette `extra.*` computed proxy-side in the user's framing) is *orthogonal* to this split and not fixed by it — it lives on the enrichment side and stays a known gap.

---

### Sources

- [salsa-rs/salsa](https://github.com/salsa-rs/salsa) · [Salsa in rustc-dev-guide](https://rustc-dev-guide.rust-lang.org/queries/salsa.html)
- [Adapton (project)](http://matthewhammer.org/adapton/) · [Adapton PLDI 2014 PDF](http://matthewhammer.org/adapton/adapton-pldi2014.pdf) · [docs.rs/adapton](https://docs.rs/adapton)
- [Jane Street: Introducing Incremental](https://blog.janestreet.com/introducing-incremental/) · [Incrementality and the web](https://blog.janestreet.com/incrementality-and-the-web/)
- [Skip: Why Skip?](https://skiplabs.io/blog/why-skip) · [Skip memoization/reactivity](https://skiplang.com/blog/2017/01/04/how-memoization-works.html)
- [Bazel: build](https://bazel.build/run/build) · [How Bazel Works (deps/caching)](https://www.gocodeo.com/post/how-bazel-works-dependency-graphs-caching-and-remote-execution) · [Bazel CAS deep dive](https://sluongng.hashnode.dev/bazel-caching-explained-pt-1-how-bazel-works)
- [Shake: sound & optimal incremental build (morning paper)](https://blog.acolyer.org/2015/11/12/a-sound-and-optimal-incremental-build-system-with-dynamic-dependencies/)
- [LWN: Merkle trees and build systems](https://lwn.net/Articles/821765/) · [Cloudillo: content-addressing & Merkle trees](https://docs.cloudillo.org/architecture/fundamentals/merkle-tree/)
- [Web cache key over/under-keying (AquilaX summary)](https://aquilax.ai/blog/web-cache-poisoning-deception) · [Cloudflare cache keys](https://developers.cloudflare.com/cache/how-to/cache-keys/)
- [Alexis King: Parse, don't validate (2019)](https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/)
- [F# for fun and profit: Make illegal states unrepresentable](https://fsharpforfunandprofit.com/posts/designing-with-types-making-illegal-states-unrepresentable/) · [functional-architecture.org](https://functional-architecture.org/make_illegal_states_unrepresentable/)
- [Branded types in TS (Abrodi)](https://tigerabrodi.blog/branded-types-in-typescript) · [Phantom types in TS (DEV)](https://dev.to/gabrielanhaia/phantom-types-in-typescript-stop-mixing-kilograms-and-pounds-at-compile-time-iem) · [Phantom data types in TS/Rust](https://tey.sh/TIL/003_phantom_types_in_typescript)
- [GADT (Wikipedia)](https://en.wikipedia.org/wiki/Generalized_algebraic_data_type) · [TS GADTs (Pellegrino)](https://www.matteopellegrino.dev/posts/ts-gadt/) · [TS dependent-type-like functions (issue #33014)](https://github.com/microsoft/TypeScript/issues/33014) · [TS mapped types (training)](https://www.typescript-training.com/course/intermediate-v1/09-mapped-types/)

---

## Appendix — verbatim prompt

The exact commission given to the agent (general-purpose subagent, model `opus`, run in background with internet access):

> You are a principal-architect consult agent with a Haskell / formal-methods background, working on the LengYue Go-study SPA (`frontend/`, Vue 3 + TypeScript). Your job is NOT to write the fix. Your job is to investigate the **design space** for using the type system to make a specific class of bug **unrepresentable**, survey **prior art** (use the internet — WebSearch / WebFetch), and deliver a written design-space report with options and tradeoffs. Take your time and be thorough; this report will be recorded verbatim as a consult record and will inform a possible overhaul of one of the oldest parts of the SPA.
>
> ## Read first (end to end — this codebase enforces ADR-0002 "fail loudly" on documentation: never cite a doc you have not read in full)
>
> - `/home/bork/w/omega/frontend/CLAUDE.md` — frontend authoring posture: type-driven design (branded types as specifications, discriminated unions, "parse don't validate"), the Components/Composables/Services/Store layering, reactivity discipline.
> - `/home/bork/w/omega/docs/adr-synopsis.md` — the ten ADRs in condensed form. Especially ADR-0002 (fail loudly), ADR-0003 (domain bands / no premature abstraction — Ports extracted only at the second consumer), ADR-0008 (classification discipline). Pull full ADR text from `/home/bork/w/omega/docs/adr/` if a judgement call needs it.
>
> ## The concrete code (read these in full)
>
> - `/home/bork/w/omega/frontend/src/services/analysis-ledger.ts` — the ledger. Keyed `Map<string /*configHash*/, Map<NodeId, KataAnalysisResponse>>`, with per-(hash,nodeId) reactive version refs and a changed-key listener surface. This is "the ledger" the user wants potentially overhauled.
> - `/home/bork/w/omega/frontend/src/services/analysis-config.ts` — where `configHash` is built: `compileAnalysisDescriptor()` = `{ analysis_config (palette), overrideSettings (KataGo runtime), model (SELECTOR network) }`, DJB2-hashed by `hashConfig()` into a bare `string`. `activeConfigHash` is the reactive computed every consumer reads.
> - `/home/bork/w/omega/frontend/src/composables/board/use-move-suggestions.ts` — a representative consumer: `ledger.getRaw(activeConfigHash.value, getNodeId())`, then reads RAW fields `moveInfos` / `rootInfo`.
> - `/home/bork/w/omega/frontend/src/engine/katago/types.ts` — the `KataAnalysisResponse` shape. Note which fields are raw KataGo (`moveInfos`, `rootInfo`, `ownership`, `policy`, `pv`) vs palette-derived (`extra.state`, `extra.black|white`).
> - Skim the other consumers to see the breadth of the read pattern: `BoardWidget.vue`, `BoardHeatmapOverlay.vue`, `useEnrichedData.ts`, `useTriangularHeatmap.ts`, `useStabilityMetrics.ts`, `ToolbarEngineMetrics.vue`, `BoardTab.vue`, `useAnalysisTimeline.ts`, and the write/replay sites in `analysis-service.ts` and `analysis-bundle.ts`.
>
> Do NOT read anything under `/home/bork/w/omega/backend/qeubo/` — it is MIT-licensed and this project keeps a clean-room firewall between that source and public-domain authoring. The frontend `useQeubo.ts` is fine (it's frontend PD).
>
> ## The bug class to make unrepresentable
>
> The ledger key is one opaque `string` (DJB2 of the whole descriptor) that conflates **three independent provenance axes**: the neural-net **model/network**, the KataGo **engine overrides** (`overrideSettings` — winrate framing, symmetry, visits, root noise), and the **palette** (`analysis_config` — delta/state/summary functions, the only thing that produces `extra.*`).
>
> The stored payload is heterogeneous: part of it (`moveInfos`, `rootInfo`, `ownership`, `policy`, `pv`) depends only on **model (± engine overrides)**; part of it (`extra.*`) additionally depends on the **palette**. Because everything is bucketed under the full composite key, a palette-only change makes the palette-INDEPENDENT data unreachable even though it is byte-identical — board overlays (move suggestions, ownership) blank out after a review session whose card-palette differs from the active palette.
>
> The deeper invariant the types fail to encode: **a field may only be keyed by the axes it actually depends on.** Reading raw data under a key that includes the palette axis is a category error the compiler currently permits (bare `string` key, monolithic response value).
>
> ## Your mandate — produce a design-space report covering:
>
> 1. **Problem framing.** Name this bug class precisely in the vocabulary of types and incremental computation. Relate it to known concepts: cache-key/dependency-set mismatch, provenance/lineage tracking, over-keying vs under-keying (false misses vs false hits / cache poisoning), separating a value into the minimal sub-keys its parts depend on.
>
> 2. **Prior art (research the internet; cite sources with URLs).** How have other systems made "derived data keyed by its true dependency set" correct-by-construction or type-enforced? Survey at least: incremental-computation / memoization frameworks (Salsa in Rust, Adapton, Jane Street's Incremental, Skip, build systems like Bazel/Shake with their fine-grained dependency keys), content-addressed / Merkle storage, and the type-system techniques — phantom types / type-indexed keys, GADTs / indexed monads, branded & opaque types, "parse, don't validate", capability/witness types, dependent-typing approximations in TypeScript, and "make illegal states unrepresentable" lineage (the canonical talks/articles). For each, extract the transferable idea and whether TS can express it.
>
> 3. **The TypeScript-expressible design options.** Concretely, for THIS ledger, lay out candidate designs and their tradeoffs. At minimum consider: (a) splitting the store into provenance-stratified layers keyed by the minimal axis-subset each payload needs (a model-keyed raw store + a (model,overrides,palette)-keyed enrichment store), (b) phantom/branded key types so a `RawKey` cannot be passed where an `EnrichedKey` is expected (and vice versa), (c) typing the key as a structured value object rather than a stringified hash so the axes are inspectable and the hash is derived, (d) splitting `KataAnalysisResponse` itself so raw and enriched live in separately-keyed values, (e) anything the prior-art survey surfaces. Discuss how each interacts with the reactive version-ref surface, the changed-key listener, the merge logic, persistence/replay (`analysis-bundle.ts`), and migration cost across the ~12 consumer sites.
>
> 4. **Recommendation, ADR-aligned.** Weigh against this codebase's stated posture: ADR-0002 (the wrong-key read should fail loudly — ideally at compile time), ADR-0003 (no premature abstraction; don't extract a Port for a single consumer), ADR-0008 (honest classification; don't fabricate structure). Give a recommended direction and a phased path (what a minimal correctness fix looks like vs. the full typeful overhaul), but DO NOT implement.
>
> Be candid about uncertainty and tradeoffs — this codebase prefers "this works but watch out for X" over false confidence. Structure the report with clear headings. Cite every external source with a URL. Your entire final message is the report (it becomes the verbatim consult record), so make it self-contained.

License: Public Domain (The Unlicense)
