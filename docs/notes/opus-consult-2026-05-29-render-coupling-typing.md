# Opus Consult — Typing & the Render-Coupling Anti-Pattern (2026-05-29)

Analytic-firewall second opinion (Opus 4.8, independent agent with web
access), requested by the maintainer to stress-test the postmortem's claim
that TypeScript could not have prevented the
render-coupling-at-composition-nodes class
(`docs/notes/postmortem-render-coupling-at-composition-nodes-2026-05-29.md`).
The agent was given the neutral facts + the claim under review and explicitly
tasked to challenge — not defend — it, across three issues: (1) type-system /
API-design (parametric polymorphism, pub/sub abstractions); (2) whether Vue
recognizes the pattern (vuejs/core, vuejs/docs); (3) reactive-systems research
(incl. the Jane Street FRP material and the maintainer's recalled Minsky
"trilemma" from "Seven Implementations of Incremental").

Saved verbatim for auditability per the consult-record convention. The agent's
session id (for follow-up via SendMessage) was `a0684bce30da5766c`.

License: Public Domain (The Unlicense).

---

# Analytic Firewall — Second Opinion: "Could typing have prevented the render-coupling-at-composition-nodes class?"

**Consult date:** 2026-05-29
**Reviewer stance:** Independent. No stake in the postmortem's conclusion; invited to overturn.
**Subject:** The claim that the render-coupling anti-pattern (a composition/chrome component reading a high-frequency reactive value in its render, coupling its whole subtree's re-render rate to that value) could *not* have been prevented by TypeScript's type system — "typing no; convention + lint + profiling, partially."

I read the two extant sibling audits (`perf-audit-game-scroll-2026-05-28.md`, `perf-audit-range-query-nav-2026-05-29.md`) in the repo for concrete grounding; the named postmortem does not yet exist on disk. The concrete cases — `App.vue` reading `activeBoard.currentNodeId` / `turn` / `captures` / `moveNumber` in its template, and reading `engineControls.status`/`metrics` to thread into `<Toolbar>` — match the task's description exactly, and the fix (push the read down to the leaf that self-sources from the store/composables) is the same in both.

---

## Bottom line up front

**The claim is RIGHT in its narrow form and TOO STRONG in its broad form.**

- **Narrow form — RIGHT, and now empirically corroborated:** The TypeScript *type-checker* cannot catch this. Vue's render-effect granularity is per-component (confirmed against Vue's own docs, below), the coupling is a runtime property of *when and where a read fires*, and no shape-level type device (brand, discriminated union, `readonly`) makes "an eager reactive read happens in a composition node's render" a *compile error*. That sub-claim survives scrutiny.

- **Broad form — TOO STRONG:** The postmortem slides from "the type-*checker* can't catch this" to "typing: no." Those are not the same proposition, and the maintainer's instinct that "there's room for thinking around it" is correct. A **typed API shape** — specifically *passing accessors (`() => T`) / signals across component boundaries instead of eagerly-read values* — does not merely relocate the coupling; it **structurally prevents** the specific bug, because it moves the reactive read to the consumer's call site by construction. The honest framing is not "types can't help" but **"the type *checker* can't *detect* the bug, but a typed *contract* can make it *unrepresentable* — at a real cost the project may rationally decline to pay."** That distinction is the whole game, and it is the deeper take the maintainer is reaching for.

The rest of this record substantiates each leg.

---

## Issue 1 — Type-system / API-design angle

### 1a. What the checker genuinely cannot do (claim's narrow form holds)

The coupling is: *render effect E of component C subscribes to reactive source S because C's render function reads S; when S fires, E re-runs and C's subtree is patched.* Every term here is a runtime/operational fact:

- **"reads S"** — a dynamic event (the read executes inside the tracking scope of E). TypeScript erases to JS; it has no model of "this expression executes inside a reactive effect's collection phase."
- **"C is a composition node"** — a *role* (tree position / responsibility), not a type. `App.vue`'s type is not distinguishable from a leaf's by shape.
- **"S is high-frequency"** — a temporal property (25 Hz, per-packet). The type `Ref<number>` is identical whether the ref updates once or 25×/s.

No vanilla device closes this. Branded types discriminate *values* (`UserId` vs `CardId`); they say nothing about *when a value is read*. `readonly` constrains *mutation*, not *observation*. Discriminated unions constrain *which shape a value has*, not *where it is observed*. So the postmortem's literal sentences — "TS types describe shapes; they cannot encode 'this ref updates at 25 Hz' or 'this read occurs in a render at tree depth 1'" — are **correct**. A pure type-checker pass cannot flag the bug. Concede this fully.

This is the same category as "TypeScript can't catch a deadlock" or "can't catch an N+1 query": these are *operational* properties the type system is structurally blind to. The postmortem is right that branded-type maximalism (the project's usual lever) does not reach here.

### 1b. Where the claim overreaches: accessors make the read *deferred by construction*

The decisive move the postmortem misses: **change what crosses the component boundary.** Today the boundary carries an eagerly-read *value*:

```ts
// App.vue render reads NOW (subscribes App's effect), threads value down
<Toolbar :metrics="engineControls.metrics.value" />
```

The read happens in `App`'s render → `App`'s effect subscribes → whole tree re-renders. The fix the team applied (push the read into `Toolbar` via `useEngineControls()`) works, but it is *convention*: nothing stopped the eager read; a future author can re-introduce it.

Now consider the SolidJS-lineage alternative — the boundary carries an **accessor**, not a value:

```ts
type Accessor<T> = () => T            // verified: this is Solid's actual def
<Toolbar :metrics={() => store.engine.metrics} />   // pass the thunk
// inside Toolbar's own tracked scope:
metrics()                              // THE READ happens HERE, at the leaf
```

`Accessor<T> = () => T` is the literal Solid type ([signal.ts](https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/signal.ts); `Signal<T> = [get: Accessor<T>, set: Setter<T>]`). The point for *this* bug: **a function value, when passed across the boundary, is not read at the boundary.** The composition node holds an unevaluated thunk. The reactive subscription is established *only* where `metrics()` is invoked inside a tracking scope — i.e., at the leaf. The composition node's effect never subscribes to `S`, so it cannot re-render on `S`'s cadence. *The coupling is gone, not relocated* — relocation would mean the coupling reappears somewhere; instead it is dissolved, because the only subscriber is the consumer that genuinely displays the datum.

This is **type-expressible** and the type *does* do work, but in a precise and limited way:

- **What the type expresses:** the boundary's contract is `Accessor<T>`, i.e. "you are handed a way to read, not a reading." The *type signature of the prop* tells the author "this is a deferred read." An author who writes `:metrics="metrics()"` (eagerly invoking at the boundary) gets a *type error* if the prop is typed `Accessor<T>` and they pass `T` — the mismatch `T` vs `() => T` is a genuine compile error. So: **the eager read at the boundary becomes loud at the boundary.** That is materially stronger than "types can't help."
- **What the type still cannot express:** it does not *force* the consumer to read inside a tracking scope, nor forbid the consumer from doing `const v = metrics()` at module/setup top-level (un-tracked) and then reading `v` eagerly. Solid's own ecosystem documents exactly this residual footgun — **destructuring props breaks reactivity** because it "extract[s] the property value instead of preserving the getter," which is why Solid ships `splitProps`/`mergeProps` ([LogRocket: Understanding SolidJS props](https://blog.logrocket.com/understanding-solidjs-props-complete-guide/)). So the accessor pattern converts a *silent, easy* mistake into a *louder, harder* one — it raises the activation energy of the bug rather than making it literally impossible.

**Verdict on 1b:** This is the honest answer the maintainer is reaching for. The accessor/getter (and equivalently, passing an `Observable<T>`/signal handle) is a typed-*contract* device that **structurally prevents the specific coupling** by deferring the read to the consumer, and makes the eager-at-boundary mistake a *boundary-local type error*. It does not need the checker to understand "25 Hz" or "depth 1" — it sidesteps both by making "where the read happens" a property of *who invokes the thunk*, which is exactly the consumer. The postmortem's "merely relocate it?" framing is answered: **not relocated — dissolved**, with a smaller residual footgun that is itself louder than the original.

### 1c. The harder type devices — can any make it a *type error*?

The task asks whether phantom/capability types, frequency brands, effect systems, or linear/affine types can make "eager read at a composition boundary" a *type error*. Verdict, from general PL knowledge (flagged as not empirically verified — these are reasoning, not citations):

- **Phantom / capability types — partial, loud-at-boundary not error-at-read.** You can brand a source: `type HotRef<T> = Ref<T> & { readonly __hot: unique symbol }`. Then a *prop typed to reject hot refs* makes passing a hot value through that boundary a type error. This *does* let "high-frequency" exist in the type system — but only as a *manually-asserted* tag (someone must brand it; the brand is a claim, not a measurement) and only at *boundaries you typed to reject it*. It cannot see the *read*; it sees the *value flowing through a typed slot*. So: it can make "a hot value is passed eagerly into a slot declared cold" loud, which is a useful approximation, but it is enforcement-by-discipline-encoded-in-a-brand, not enforcement-by-the-checker-understanding-reads. It also has a false-positive/negative problem: frequency is contextual (a ref that's hot during streaming is cold otherwise).

- **Effect systems — yes in principle, no in TypeScript.** A row-typed effect system (Koka/Frank/Eff-style, or an `Effect`-monad encoding à la Effect-TS) *can* track "this computation performs a `Track` effect" in the type, and a function's signature could forbid the `Track` effect in a "pure composition" context. This is the *correct theoretical home* for the property: "reads a reactive cell" **is** an effect. But (i) TypeScript has no native effect system; encodings (Effect-TS) are heavyweight and invasive, and (ii) it would still not capture "in a *render* at *tree depth 1*" — it would capture "this fn performs a reactive read," which you'd then have to wire to render contexts by convention anyway. Loud-at-boundary, not free.

- **Linear / affine types — wrong tool.** Linearity governs *how many times* a resource is used and that it is eventually consumed (good for "you must dispose this subscription," which is genuinely relevant to the project's *resource-ownership-at-mutation-sites* discipline). It does not govern *where in a tree a read occurs*. Not the device for this bug.

**The precise line (the useful framing):**
- **TYPE-CHECKER enforcement:** *cannot* catch "eager reactive read in a composition node's render." The claim is right here. Effect systems could in a language that had them; TypeScript does not.
- **TYPED-CONTRACT prevention:** *can* make the anti-pattern (a) **unrepresentable for the common case** (accessor-passing dissolves it) and (b) **loud at the boundary** (capability-brand a hot source so a cold-typed slot rejects it). This is the more useful and more defensible position, and it is the one the postmortem under-states.

So the maximally honest one-liner is: **"The checker can't *detect* this bug; a typed API *contract* can make the easy version of it unrepresentable and the residual version loud — at an ergonomic cost we are choosing not to pay because Vue's idiom passes values, not accessors."** That last clause matters: the project is on idiomatic Vue, where props *are* eagerly-read values by design (see Issue 2). Adopting accessor-passing wholesale would be fighting the framework — a legitimate reason to decline, but it should be named as a *choice against an available structural fix*, not as *"types can't help."*

---

## Issue 2 — Is this a recognized issue in Vue? (Empirically verified)

**Yes — it is recognized, it is in the official docs as the canonical performance footgun, and Vue's own roadmap (Vapor/3.6) makes it structurally obsolete.** Three verified findings:

### 2a. Vue's render granularity is officially component-level — confirmed from primary docs

The crux of the whole postmortem (per-component render effects) is stated in Vue's own documentation:

- **Reactivity in Depth** ([vuejs.org](https://vuejs.org/guide/extras/reactivity-in-depth.html)) — *"each component instance creates a reactive effect to render and update the DOM."* That is exactly the mechanism the audits describe: one effect per component, subscribing to whatever its render reads.
- **Rendering Mechanism** ([vuejs.org](https://vuejs.org/guide/extras/rendering-mechanism.html)) — the mount step "is performed as a reactive effect, so it keeps track of all reactive dependencies that were used … When a dependency used during mount changes, the effect re-runs … walks the new tree, compares it with the old one, and applies necessary updates." This is the per-component re-render-and-patch the audits measured as the 11 ms `RootErrorBoundary patch`.
- Note: the *first* search hit (a Medium post) claimed Vue does "no full rerenders or overtracking." **That is wrong about render granularity** and should be discounted — it conflates Vue's *dependency tracking* (which is fine-grained — it knows precisely which refs an effect read) with its *render-effect granularity* (which is per-component — the whole render fn re-runs and the subtree is patched). The audits are correct and the Medium post is not; the primary docs back the audits.

Vue's compiler mitigations — **patch flags** and **tree flattening** ([Rendering Mechanism](https://vuejs.org/guide/extras/rendering-mechanism.html)) — reduce the *cost per re-render* (skip static nodes, traverse only dynamic descendants) but do **not** change *which component's render fn re-runs*. The render fn of the composition node still re-executes; that's the cost the audits attack by moving the read.

### 2b. The official Performance docs describe *this exact anti-pattern* — under "Props stability"

This is the strongest corroboration that the bug class is recognized. Vue's **Performance** guide ([vuejs.org/guide/best-practices/performance](https://vuejs.org/guide/best-practices/performance)) contains the *same* anti-pattern and the *same* fix as the audits, on a list example:

> *"whenever `activeId` changes, **every** `<ListItem>` in the list has to update! Ideally, only the items whose active status changed should update. We can achieve that by moving the active status computation into the parent, and make `<ListItem>` directly accept an `active` prop instead … In general, the idea is keeping the props passed to child components as stable as possible."*

This is *isomorphic* to `App.vue` reading the cursor/metrics and threading them down: a value read high → derived/stabilized → pushed down so only the leaf that needs it updates. The project independently rediscovered Vue's own documented guidance. The docs also offer the two relevant levers:
- **`v-memo`** — "conditionally skip the update of large sub-trees" ([Performance](https://vuejs.org/guide/best-practices/performance); the audit's Arc-1 rail fix uses exactly this). The docs caution it "will rarely be needed … micro-optimizations" — consistent with the audit treating it as a contained, targeted patch.
- **`shallowRef`/`shallowReactive`** — opt out of deep reactivity to cut tracking overhead (orthogonal to *this* bug but in the same toolbox).

**Crucial caveat — props stability is itself fragile (verified):** [vuejs/core issue #13157, "Props stability doesn't work as per docs"](https://github.com/vuejs/core/issues/13157) reports the docs' own advice failing. The maintainer-side explanation (commenter `jh-leong`) is precise and load-bearing for your question:

> *"The prop instability occurs because `@click="select(item.id)"` compiles to a new function on each render … As a workaround, declare the emit option in `ListItem` to skip the event props check."*

This is a direct, citable demonstration that **the convention-based fix (`stable props`) has silent footguns** — an inline handler silently destabilizes a prop, defeating the whole optimization, and you only find out by profiling or reading compiled output. This *strengthens* the "convention + lint + profiling, partially" half of the postmortem's claim: convention here is genuinely leaky, which is precisely why a *structural* (type-contract) fix is attractive. It also shows the checker is no help (the types are all valid; the bug is in runtime identity stability).

### 2c. Vapor Mode / Vue 3.6 makes the anti-pattern structurally obsolete — verified

The roadmap question — "does reading a reactive value high in the tree still re-render the subtree under signals/Vapor?" — answers **no**:

- **Vue docs, "Connection to Signals"** ([Reactivity in Depth](https://vuejs.org/guide/extras/reactivity-in-depth.html)): *"Due to the use of Virtual DOM, Vue currently relies on compilers to achieve similar optimizations. However, we are also exploring a new Solid-inspired compilation strategy, called Vapor Mode, that does not rely on Virtual DOM and takes more advantage of Vue's built-in reactivity system."* — i.e., Vue itself frames current Vue as *component-granularity-with-compiler-help* and Vapor as the *fine-grained* successor.
- **Vue 3.6.0-beta.1 release notes** ([vuejs/core release](https://github.com/vuejs/core/releases/tag/v3.6.0-beta.1)) — primary source: Vapor Mode is a real, shipping (opt-in, beta) compilation mode; it rides "a major refactor of `@vue/reactivity` based on **alien-signals**, which significantly improves the reactivity system's performance and memory usage," and "has demonstrated the same level of performance with Solid and Svelte 5 in 3rd party benchmarks." Vapor Mode is noted as having reached feature parity in the 3.6 cycle.
- **Per-binding update model** (secondary sources, consistent across several): in Vapor, "instead of re-rendering entire components, only the specific bindings that changed are updated"; the compiler "wires each reactive dependency directly to the exact DOM node it affects." ([Vue School: Preview of Vue 3.6 & Vapor Mode](https://vueschool.io/articles/news/vn-talk-evan-you-preview-of-vue-3-6-vapor-mode/); [VueMastery](https://www.vuemastery.com/blog/the-future-of-vue-vapor-mode/) describes the Solid-inspired no-VDOM direction). I could not find a *primary doc* sentence stating in so many words "a parent reading reactive state no longer re-renders children" — flagging that as inferred-from-the-model rather than quoted; but it is the *defining property* of the fine-grained model and is uncontroversially how Solid (Vapor's inspiration) behaves.

**Implication for the postmortem:** under Vapor, the bug class *largely evaporates* — a composition node reading a signal would update only the binding that reads it, not patch its subtree. This is worth stating in the postmortem because it reframes the project's current fixes as **"working around a property of the VDOM/component-granularity model that Vue's own roadmap is eliminating."** It does *not* make the fixes wasted (the SPA is on classic Vue today, and migration is opt-in/non-trivial), but it tells you the right *long-run* structural answer is "the framework's fine-grained mode," not "a clever TS type." The maintainer's "room for thinking" includes this: the durable fix is architectural/framework-level, and the type-contract fix (accessors) is the *manual emulation* of what Vapor does automatically.

---

## Issue 3 — Reactive-systems research / theory

### 3a. Fine-grained (signals) vs component-granularity (VDOM): where the coupling lives, and what it costs

The "where you read it" coupling is **a property of the update-granularity of the reactive model, not of the application code.** Precisely:

- **Component-granularity VDOM (React class/function components, Vue today):** the unit of recomputation is the *component render function*. Subscription is established at *whatever the render fn reads*, and re-execution re-runs the *entire* fn (then diffs). Therefore **the location of the read (which component's render) determines the blast radius.** Reading high → big blast radius. This is *intrinsic*: the coupling exists because the read and the recomputation-unit are coarsely tied. The audits' fix — relocate the read to a leaf — is the only lever available *within the model*: you cannot make the read cheaper, only move it to a smaller recomputation unit.

- **Fine-grained reactivity (SolidJS, Svelte 5 runes, Knockout lineage, Vue Vapor):** the unit of recomputation is the *individual binding/effect*, established at the *exact expression* that reads the signal. The component function runs *once* (setup); it is not a recomputation unit. Therefore **the location of the read no longer determines blast radius — the read *is* the blast radius (one DOM binding).** A "composition node" reading a signal subscribes only the one binding that reads it. The coupling the postmortem fights **does not exist in this model**, which is *why* passing accessors (3a-equivalent at the type level, Issue 1b) emulates it: an accessor *is* a manually-threaded fine-grained read.

**The cost (the tradeoff — this is the part the postmortem should name):** fine-grained reactivity is not free. It trades:
1. **Per-binding bookkeeping overhead** — many small reactive nodes/effects, each with subscription sets, vs. one render effect per component. For *low-frequency, large-tree* updates this can be *slower* and more memory-hungry than a single VDOM diff (this is the standard "fine-grained has high fixed per-node cost" critique).
2. **A different mental model with its own footguns** — the *destructuring-breaks-reactivity* class (Solid's `splitProps`/`mergeProps` exist precisely because reading-loses-tracking is a new, easy mistake). You trade "read locality coupling" for "read-must-stay-inside-a-tracking-scope" discipline. Vue's docs frame VDOM-vs-signals as a genuine architectural fork, not a strict improvement ([Reactivity in Depth, "Connection to Signals"](https://vuejs.org/guide/extras/reactivity-in-depth.html)).

So: **the coupling is a real, named consequence of choosing component-granularity VDOM, and it largely vanishes under fine-grained reactivity, at the cost of per-node overhead and a new discipline class.** This is the precise characterization the task asked for, and it is well-attested.

### 3b. FRP / incremental-computation theory, and the "trilemma"

I fetched the Jane Street **"Breaking Down FRP"** post ([blog.janestreet.com/breaking-down-frp](https://blog.janestreet.com/breaking-down-frp/)). **Two corrections for the maintainer, stated plainly:**

1. **It is a *four*-way tradeoff, not a trilemma.** Minsky's post identifies four desirable properties no FRP system achieves simultaneously: **history-sensitivity, efficiency (space + time), dynamism (reconfiguring the computation graph as inputs change), and ease of reasoning (clean equational semantics).** Key quoted tensions: pure monadic FRP gets dynamism+history+reasoning but "this choice forces us to remember every value generated by every input forever" (space leak); Elm's applicative FRP drops `join` to recover efficiency at the cost of dynamism; Self-Adjusting Computation (Incremental's basis) gets dynamism+reasoning but drops history (`foldp`). The headline insight: *"history is made tractable by limiting dynamism."* So the post is a *tetralemma*, and it is about FRP-for-UIs design, not specifically about render locality.

2. **I could not find a canonical written "trilemma" from the "Seven Implementations of Incremental" talk.** The talk exists ([Jane Street tech-talks](https://www.janestreet.com/tech-talks/seven-implementations-of-incremental/); [blog announcement, 2016](https://blog.janestreet.com/seven-implementations-of-incremental/); [community writeup](https://devblogs.sh/posts/seven-implementations-of-incremental) — the last 403'd to my fetcher, so I'm relying on the search-surface summary). The talk's substance is the *history of Incremental's implementations* and the *performance/semantic tradeoffs of dynamism* (`bind` gives you dynamic dependency graphs but at performance cost; static DAGs via `map`/`map2` are cheaper). **There is no well-attested, citable "trilemma" by that name.** The maintainer's recollection most plausibly conflates either (a) the four-way tradeoff in "Breaking Down FRP" above, or (b) the genuine *three*-property tension in the broader reactivity-algorithms literature (next paragraph). **Flag this in the postmortem rather than asserting a Minsky trilemma** — asserting a named trilemma that has no writeup would be exactly the kind of fragment-citation the project's ADR-0002 doc-discipline forbids.

3. **The closest *well-attested* three-way framing** is from the reactive-algorithms literature, e.g. Jonathan Frère's **"Pushing and Pulling: Three Reactivity Algorithms"** ([jonathan-frere.com](https://jonathan-frere.com/posts/reactivity-algorithms/)), which enumerates the properties a reactive system wants — **efficiency (recompute only what's needed), fine-grained updates (touch only affected cells), and glitch-freedom (no observable intermediate-inconsistent states)** — and shows push (naturally fine-grained, struggles with glitches/efficiency), pull (handles dynamism+glitches, struggles to know what needs updating, "cache invalidation"), and **push-pull** (push marks dirty, pull recomputes marked) as the hybrid that gets all of them. Its quoted core tension is the dynamism-vs-efficiency one Minsky also names: *"The more dynamism we want in our system, the harder it is to achieve efficient updates, and the more we want efficient updates, the more we need to specify our dependency graphs up-front."* (This is also the academic push-pull FRP lineage — Elliott's *Push-pull functional reactive programming*, ICFP/Haskell Symposium 2009, [ACM](https://dl.acm.org/citation.cfm?id=1596643).)

### 3c. Is "read locality" a known concern with theory, and what does theory say the structural fix is?

**Yes.** "Where computation is *observed* / where the read happens" is exactly the **granularity** axis in the dynamism-vs-efficiency tension. The theory's answer to "what's the structural fix" is consistent and clean:

- The *efficient, fine-grained* regime is **push-pull over an explicit dependency graph** where the recomputation unit is the individual derived node, not a coarse container. That is precisely what SolidJS/Vapor/Incremental implement. In that regime, **read locality stops mattering** because the graph node *is* the read — observing a value high vs. low changes which single node subscribes, not how big the recomputed region is.
- The *cost* the theory flags is the dynamism/efficiency tradeoff (3a-item-1: per-node overhead; needing the dependency graph specified up-front for max efficiency) and, in FRP specifically, the history/space-leak tension (Minsky). Fine-grained is not a free lunch; it pays in fixed per-node cost and a new correctness discipline (reads must stay inside tracking scopes).

So the theory's verdict, mapped onto the project: **the bug class is the component-granularity model's manifestation of the granularity axis of a known tradeoff. The structural fix the theory endorses is "make the recomputation unit fine-grained" — i.e., signals/Vapor, or its manual emulation, accessor-passing.** The project's actual fixes (relocate the read down) are the *correct move within the coarse-grained model* — they shrink the recomputation unit by hand, one read at a time. Convention + lint + profiling is the right *operational* answer *given* you stay on the coarse model; the *structural* answer is to change the model.

---

## Synthesis — the most defensible position for the postmortem

1. **Keep the narrow claim; it's correct and now doubly-sourced.** "The TS type-*checker* cannot catch this" is true (it's an operational property; Vue's component-granularity render-effect model is confirmed from primary docs; no shape-type device reaches a runtime read-site). State it as *"the checker cannot detect it,"* not *"typing: no."*

2. **Soften the broad claim — this is the maintainer's "room for thinking."** A *typed contract* — passing `Accessor<T> = () => T` (or a signal/observable handle) across component boundaries — **structurally prevents** the specific coupling by deferring the read to the consumer, and makes the eager-read-at-the-boundary a *boundary-local type error*. It is *not* mere relocation; it dissolves the coupling (the only subscriber becomes the leaf that invokes the thunk). The residual footgun (un-tracked destructuring) is real but *louder and harder to hit* than the original silent one — Solid's `splitProps`/`mergeProps` exist precisely to manage it. So the honest line is: **"a typed API can make the easy version unrepresentable and the residual version loud — we decline it because idiomatic Vue passes values, not accessors, and we won't fight the framework wholesale."** Naming it as a *declined available fix* is more honest than "types can't help."

3. **Cite that Vue itself recognizes this exact pattern.** Vue's Performance docs' "Props stability" example is isomorphic to the App.vue case; the project rediscovered official guidance. And [vuejs/core#13157](https://github.com/vuejs/core/issues/13157) shows that *even the documented convention is leaky* (inline handlers silently destabilize props) — which is the strongest argument *for* a structural over a conventional fix, and which the checker is blind to.

4. **Name the roadmap.** Vapor Mode / Vue 3.6 (alien-signals) makes the bug class **structurally obsolete** — per-binding updates mean a composition node reading a reactive value updates one binding, not a subtree ([Vue 3.6.0-beta.1 notes](https://github.com/vuejs/core/releases/tag/v3.6.0-beta.1); ["Connection to Signals"](https://vuejs.org/guide/extras/reactivity-in-depth.html)). The current fixes are correct *within the VDOM model*; the durable structural fix is the framework's fine-grained mode, which accessor-passing manually emulates.

5. **On the trilemma — fail loudly.** There is no citable "trilemma" from the Minsky "Seven Implementations" talk. What exists is (a) the *four*-way tradeoff in ["Breaking Down FRP"](https://blog.janestreet.com/breaking-down-frp/) — history / efficiency / dynamism / reasoning, "history is made tractable by limiting dynamism"; and (b) a genuine *three*-property tension in the reactivity-algorithms literature — efficiency / fine-grained / glitch-free, with the dynamism-vs-efficiency core ([Frère, "Three Reactivity Algorithms"](https://jonathan-frere.com/posts/reactivity-algorithms/); Elliott's push-pull FRP). The postmortem should reconstruct the *attested* framing and explicitly say the named "trilemma" couldn't be located, rather than assert it.

6. **Theory's structural verdict.** "Read locality" is the granularity axis of a known tradeoff; the theory's structural fix is "make the recomputation unit fine-grained" (signals/push-pull), which is exactly Vapor and exactly what accessor-passing emulates by hand. Coarse-grained VDOM's only lever is "relocate the read," which is what the team did — correct, but operational rather than structural.

---

## Verification status of every load-bearing claim

**Verified by primary/authoritative fetch or maintainer comment:**
- Vue render is component-level; "each component instance creates a reactive effect to render and update the DOM" — [Reactivity in Depth](https://vuejs.org/guide/extras/reactivity-in-depth.html), [Rendering Mechanism](https://vuejs.org/guide/extras/rendering-mechanism.html).
- Vue's "Props stability" anti-pattern + fix (move derivation up, push stable prop down) — [Performance guide](https://vuejs.org/guide/best-practices/performance).
- Props stability is leaky (inline handlers destabilize) — maintainer comment by `jh-leong` on [vuejs/core#13157](https://github.com/vuejs/core/issues/13157) (fetched via `gh api`).
- Vapor Mode is real, opt-in, beta, built on alien-signals refactor of `@vue/reactivity`, Solid/Svelte-5-class perf — [vuejs/core v3.6.0-beta.1 release notes](https://github.com/vuejs/core/releases/tag/v3.6.0-beta.1).
- Vue frames VDOM-vs-signals fork and Vapor as Solid-inspired — ["Connection to Signals"](https://vuejs.org/guide/extras/reactivity-in-depth.html).
- "Breaking Down FRP" is a *four*-way tradeoff (history/efficiency/dynamism/reasoning); "history is made tractable by limiting dynamism" — fetched [blog.janestreet.com/breaking-down-frp](https://blog.janestreet.com/breaking-down-frp/).
- Three-property reactivity tension + push/pull/push-pull + dynamism-vs-efficiency quote — fetched [jonathan-frere.com/posts/reactivity-algorithms](https://jonathan-frere.com/posts/reactivity-algorithms/).
- `type Accessor<T> = () => T`, `Signal<T> = [Accessor<T>, Setter<T>]` — SolidJS [signal.ts](https://github.com/solidjs/solid/blob/main/packages/solid/src/reactive/signal.ts) (via search surface).

**Verified via secondary sources (consistent across several, but not a single primary sentence):**
- Vapor's per-binding update model ("only the specific bindings that changed are updated") — [Vue School](https://vueschool.io/articles/news/vn-talk-evan-you-preview-of-vue-3-6-vapor-mode/), [VueMastery](https://www.vuemastery.com/blog/the-future-of-vue-vapor-mode/). The *specific* sentence "a parent reading reactive state no longer re-renders children" is inferred from the fine-grained model, not quoted from a primary doc.
- SolidJS props-are-getters / destructuring-breaks-reactivity / `splitProps` — [LogRocket](https://blog.logrocket.com/understanding-solidjs-props-complete-guide/), [docs.solidjs.com/concepts/components/props](https://docs.solidjs.com/concepts/components/props) (the docs page 403'd to my fetcher; relying on search summary + LogRocket).

**Could NOT verify — flagged plainly:**
- A named "trilemma" from Minsky's "Seven Implementations of Incremental." No writeup found; the talk's substance is implementation history + dynamism/efficiency tradeoffs. Treat the "trilemma" recollection as a conflation; do not cite it as Minsky's.
- The [devblogs.sh writeup](https://devblogs.sh/posts/seven-implementations-of-incremental) and SolidJS tutorial pages returned HTTP 403 to the fetcher; their content is represented here only via search-result summaries.

**Asserted from general PL knowledge, NOT empirically verified (Issue 1c):** the analysis of phantom/capability types, effect systems (row-typed effects as the theoretical home for "reads a reactive cell"), and linear/affine types being the wrong tool. These are reasoning about type-system capabilities, not citations.
