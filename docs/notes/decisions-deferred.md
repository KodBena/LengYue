# Deferred Decisions

Considered actions that were decided against, with rationale and
explicit triggers for revisitation. Distinct from `docs/TODO.md`
(active and queued work) and from `docs/adr/` (decisions that
fired and now shape forward authoring).

Per ADR-0005 Rule 6 (author as you decide): decisions against
action are decisions, and recording them at the moment of
deciding has the same payoff as recording the decisions that
fired. Without this record, a future contributor or future-self
reconstructs from absence — and absence is ambiguous, indistinct
between "considered and rejected" and "never thought of." The
distinction matters: the second invites speculative reopening;
the first gives the speculation an answer to argue against.

Each entry names the decision, the date, the rationale, and the
concrete conditions that would justify revisiting it. Entries
are not removed once their triggers fire — they're edited to
record the outcome of the revisit, preserving the original
rationale as context.

---

## Backend source-tree reorganization

- **Date:** 2026-04-26.
- **Considered:** Whether the backend's source tree should be
  reorganized to surface the domain-coupling axis introduced by
  ADR-0003 — for example, by partitioning files into bands
  (`core/`, `domain-agnostic/`, `domain-adapter/`, etc.) on top
  of the existing Clean-Architecture layering (`domain/`,
  `repositories/`, `services/`, `routers/`, `db/`, `core/`).
- **Decision:** No. The backend's source tree stays as-is.

### Rationale

The backend is already band-organized — by Clean Architecture
layer, with the Dependency Rule as the enforcement discipline.
Adding a domain-coupling axis on top would compete with the
existing layer-axis rather than complement it: the two
organizing principles want different things from the same
files, and layering them produces a directory tree where every
filing decision is a tradeoff between two real signals.

Beyond the conflict, the domain-coupling axis isn't currently
carrying useful information at the backend level. After items
34/34a/34b closed the wire-rename and schema-rename work, the
backend is genuinely domain-agnostic — `PositionNormalizerPort`
is the seam at which Go-specific behavior plugs in, and
"everything else" is the domain-agnostic core. Spatially
expressing this would mean a directory tree dominated by one
band (the agnostic core) and a single near-empty band (the
domain-coupled adapter). The information is real but doesn't
warrant the directory shape.

A companion concern worth recording: the failure mode opposite
to flat-subdirectory bloat is deeply-nested single-file
structures, where directories exist primarily as classification
brackets rather than as practical groupings. That failure mode
is at least as bad as flat-subdirectory bloat, and arguably
worse — flat directories slow navigation but stay legible;
deeply-nested classification brackets actively obscure what's
where. Reorganizing the backend in pursuit of an organizing
principle that doesn't have measurable per-directory pain to
justify it risks tipping toward this opposite failure for no
gain.

The discipline that's already in place — Hexagonal Architecture
imposing per-layer bounds — keeps the backend's directories
naturally limited in size. No directory currently has the
twenty-plus-files volume that ADR-0005 Rule 5's "file location
reflects content" discipline would flag for tactical
sub-organization. The architecture is doing the bounding work
that a filesystem reorganization would otherwise be required to
do.

### Triggers for revisitation

Three concrete conditions would justify reopening this
decision:

1. **A second domain implementation actually being planned.**
   Chess, Shogi, or any other concrete adopter — at that point
   the domain-coupling axis becomes a forcing function rather
   than an aesthetic choice, and spatially expressing it pays
   back across both implementations.
2. **A backend directory growing past the size threshold ADR-
   0005 Rule 5 implies worth flagging.** If `services/` or
   `repositories/` accumulates twenty files and starts feeling
   heterogeneous to navigate, tactical sub-organization becomes
   the trigger — at which point ADR-0003 banding is one of
   several organizing axes worth considering as the basis for
   the split.
3. **Measurable pain.** Bugs clustering at coupling boundaries,
   contributors confused about where to add new code, repeated
   "is this in the right directory?" review feedback. Concrete
   pain trumps speculative principle.

Absent one of these, the work consumes time without producing
visible improvement.

### Distinction from the frontend

A separate decision — whether to reorganize the frontend's
`composables/` and `components/` directories — is in flight at
the time this entry is recorded, and the answer there is
probably yes. That decision has different motivating factors:
single-author iteration without an enforcing architectural
discipline analogous to Hexagonal banding, and flat directories
that have grown to a size where measurable navigation friction
exists. If the frontend reorganization lands, the principle it
applies will likely be recorded as a new ADR.

The two decisions are independent because the two sub-projects
have different organizing pressures. The backend's Hexagonal
Architecture bounds directory size as a side-effect of the
discipline; the frontend's composable/component layering does
not.

---

## Where to document the cross-framing-consistency authoring discipline

- **Date:** 2026-04-28.
- **Considered:** Where to record the lesson surfaced by the
  `spread` → `decisiveness` rename in PR #23 — that artifacts
  authored by the LLM session can carry concealed inconsistencies
  whose discovery requires human intervention. Three channels were
  weighed for documenting a forward discipline: a paragraph in
  umbrella `CLAUDE.md` (lightest, always loaded), an entry in
  `docs/notes/auditor-notes.md` as a concrete example (medium, read
  on every orientation), and a new ADR (heaviest, durable tenet).
- **Decision:** Deferred. The lesson is judged worth carrying
  forward — possibly applicable beyond this project — and the
  policy framing that's exactly right hasn't been settled yet. The
  candidate framings are recorded here so a later session can
  return to them rather than reconstruct from absence.

### The incident

In drafting
`docs/archive/dispatch/frontend-to-frontend-default-palette-metrics-spec.md`,
the LLM author committed three statements about
the symbol `spread` to the same artifact: (1) the informal semantic
("decisive position has spread → 1"); (2) the formal definition
(`spread = max_visits / total_visits`); (3) an empirical claim
relayed from the project author ("spread and normalized entropy
tend to be very close"). Statements (1) and (2) describe top-
heaviness and are consistent. Statement (3) is consistent with (1)
and (2) only if the "spread" referenced in the empirical claim is
the *complement* of what (1) and (2) define — i.e. dispersion, not
concentration. The LLM author wrote all three into the same Part 2
paragraph, hedged the empirical claim with "closely correlated"
rather than deriving the relationship explicitly, and shipped the
artifact. The user caught it in review and flagged the inversion;
the rename followed in PR #23.

### LLM author's framing of the lesson

When an artifact describes the same concept from multiple framings
— informal semantic, formal definition, empirical observation —
the framings must be cross-checked against each other within the
artifact. The failure mode is not "missing the inconsistency
outright"; it's "noticing weak tension and softening the language
instead of resolving it." Hedges like "closely correlated," "in
practice tend to," "roughly the same as" are weak signals that
reconciliation hasn't been performed. Treat them as triggers to
derive the relationship explicitly, not as polite prose.

This framing is adjacent to ADR-0002 (fail loudly) but operates at
authoring time on documents rather than at runtime on code. It's
also adjacent to ADR-0005 Rule 1 (single source of truth) but the
inconsistency in question wasn't between two documents — it was
within one document, between framings of the same handle.

A separate-but-related failure mode worth distinguishing: the
proxy/NOTICE incident (nlohmann attribution gap) earlier in the
same session was *external incompleteness* — the LLM author worked
from a source that didn't have the full picture and the user filled
the gap. The spread/decisiveness incident is *internal
inconsistency* — the LLM author had everything needed and didn't
reconcile. Different shapes; the discipline framing should be
precise about which.

### User's objection to the LLM author's framing

The lesson is more accurately characterised as a **lack of
proactively flagging inconsistencies**, not specifically as a
failure of cross-framing reconciliation. The hedge phenomenon is
one symptom; the underlying discipline is the broader posture of
surfacing tensions rather than papering over them — applicable to
artifacts the LLM is reading, not just artifacts it's authoring.

A direct policy ("always proactively flag inconsistencies") has a
genuine architectural cost in current transformer-based LLMs:
forcing attention to dilute across the substantive task and a
parallel inconsistency-check load can deteriorate the actual task
at hand. Naive enforcement is therefore dangerous on its own.

A possible middle path — out of scope for this project but worth
recording — is inspired by KataProxy's protocol-transformer
architecture: rather than asking the task LLM to self-audit, run a
separate auditor LLM as an enrichment transformation over the task
LLM's input/output, applying interpretation that surfaces
inconsistencies the task LLM might have hedged past. The same
architectural pattern that lets KataProxy's Hub inject
`_uservisits` without the underlying KataGo binary needing to know
about it could let an audit-LLM inject inconsistency flags without
diluting the task-LLM's attention.

The user's framing is the more accurate one. The LLM author's
framing covered a subset (the within-artifact case) but missed the
broader posture and the architectural-cost concern. Recording both
preserves the audit trail.

### Triggers for revisitation

1. **A second instance of the same failure mode in a future
   session.** If a future spec/doc/code-review session has another
   hedge-papered-over inconsistency that human intervention is
   required to catch, that's evidence the pattern recurs and
   warrants formalisation.
2. **The doc-graph discipline plan ratifies (currently
   `status: draft`).** When that plan accepts and the next ADR slot
   resolves, the marginal cost of formalising this discipline as
   a co-landed tenet drops; revisit at that moment.
3. **External LLM-tooling work surfaces a transformer-aware
   policy.** If the broader community develops a discipline for
   proactive inconsistency flagging that respects the attention-
   dilution constraint — or a tooling pattern that resembles the
   user's enrichment-transformer sketch — adopt the upstream
   framing rather than reinventing it.

Absent one of these, the discipline is held informally; the
incident above is captured as the canonical example so a future
session has a concrete case to reason from.

---

## Card-tree DAG-vs-tree question (multi-parent edges in `card_source`)

- **Date:** 2026-04-29.
- **Considered:** Whether to investigate, and if necessary
  resolve, the multi-parent edge question in `card_source` before
  card-tree endpoint implementation (`docs/release-scope.md` item
  3) starts. The question — does the schema admit a card with
  multiple parents, and if so what does "subtree rooted at X"
  mean for `fetch_tree_by_root`? — is recorded as an open
  question in both the frontend and backend card-tree specs,
  with the explicit note that a single answer serves both sides.
- **Decision:** Deferred until card-tree implementation begins.
  The question is acknowledged, scoped, and parked; resolving it
  in advance of an implementation context would be premature
  investigation against a use case that's not yet under
  construction.
- **Outcome (2026-04-29, revisit):** Trigger #1 fired when the
  card-tree backend implementation session opened. The
  investigation took one file read: `backend/db/schema.py:121`
  declares `card_source.card_id` with `unique=True`, and the
  table's `check_one_source` CheckConstraint enforces that
  exactly one of `card_source_id` (parent card) or
  `game_source_id` (game-source root) is set. **Each card has
  exactly one row in `card_source`, hence exactly one parent.**
  The schema does not admit multi-parent edges; the lineage is a
  forest of trees, not a DAG. The `is_primary_source` boolean
  is a vestigial design hint that is unreachable under the
  current unique constraint — were multi-source ever to become
  a domain need, the constraint would have to be relaxed first
  and that would itself be the schema-change trigger named in
  trigger #3 below. `fetch_tree_by_root` therefore takes the
  natural tree shape; no canonicalization, no DAG return, no
  rejection branch needed. Both spec files have been updated
  to reference this resolution; the originating rationale
  above is preserved as ledger history per Rule 6.

### Rationale

The other in-flight backend arc — release-scope item 6 (tenancy
READMEs) — is independent of the answer; folding investigation
into item 6 would be scope creep. Resolving the question outside
an implementation context invites designing against a hypothetical
rather than against concrete calling code: the three-way decision
("return a tree by canonicalization," "return a DAG with explicit
edges," "reject the request") reads differently when
`fetch_tree_by_root`'s call site is sketched out than when it
remains abstract. The deferred posture preserves the question as
a known input to item 3's implementer instead of prematurely
closing it on weaker evidence than the implementer will have.

The investigation itself is bounded — read the `card_source`
table definition in `db/schema.py` to see whether the primary key
admits multi-parent edges, read the existing recursive-CTE call
sites to see whether they implicitly assume tree-shape, and ask
the project author whether multi-parent is a real domain case or
a permissiveness artifact. The work fits in a single session, but
only once there's a calling-code shape to evaluate the answer
against.

A subtler reason for deferral: even if the schema admits
multi-parent today, the *intent* of the data model may be
single-parent, in which case the right resolution is a schema
constraint plus a migration audit rather than a runtime
canonicalization. Distinguishing "current schema permits this but
the system never produces it" from "the system actually produces
it and the API must handle it" is the question that the
implementation session is best positioned to ask, because the
question is forced exactly when the answer is needed.

### Triggers for revisitation

1. **Card-tree backend implementation starts.** When the backend
   half of release-scope item 3 is picked up, resolving this
   question is the first step before sketching the new
   `LineageRepositoryPort` methods. The frontend's reciprocal
   spec adjustment falls out of the same answer.
2. **A schema audit or production incident surfaces a
   multi-parent card.** If a tenancy migration, a logs review,
   or any other audit pass finds a card with `>1` rows in
   `card_source`, the question becomes forced regardless of
   whether item 3 is in flight; address it then rather than
   continuing to defer.
3. **Any schema change touching `card_source`.** Editing the
   table for unrelated reasons (indexing, tenancy migration,
   normalization) naturally forces the multi-parent question
   into the same migration. Better to resolve once alongside the
   adjacent change than to thread ambiguity through a successor
   schema.

The frontend and backend card-tree specs each preserve their
multi-parent open-question entry, updated to reference this
ledger entry as the deferral record. Per ADR-0005 Rule 3, the
spec-side note frames this entry as the ledger that records the
deferral, not as a snapshot of the deferral's content.

---

## Effect-typing as documentation (`IO<T>`/`Task<T>` deferred-effect vocabulary)

- **Date:** 2026-06-01 (decision taken ~05:57 local).
- **Considered:** Whether to adopt an effect-typed documentation
  vocabulary at the frontend's service ACL — the lighter-stack
  alternative to full Effect-TS recommended in
  `docs/notes/opus-consult-2026-05-29-effect-ts-adoption.md`. That
  consult named two legs: a typed-error channel (`neverthrow` /
  `Result`) and "a thin branded `IO<T>`." The maintainer deferred the
  `neverthrow` leg and chose the bare-`IO<T>` leg: a branded deferred
  thunk (`IO<T> = (() => T) & brand`, `Task<T> = IO<Promise<T>>`,
  `io`/`task` constructors, `runIO`/`runTask`), adopted at the ACL to
  document "this is an effect" in the type.
- **Decision:** No (reverted). The vocabulary was built and converted
  on the canonical ACL (`backend-service.ts`) as a worked example —
  committed `90d4b40`, 2026-05-31 15:55:28 +0200, green (typecheck +
  22 tests) — then reverted in full within the same arc (branch
  `bork/refactor/effect-documentation-io` dropped; nothing reached
  `main`). Effect-typing is held in reserve; see triggers below.

### Rationale

A third, independent consult
(`docs/notes/opus-consult-2026-06-01-io-effect-deferral-at-eager-acl.md`,
written 2026-06-01 05:37 local) — requested because the maintainer and
the AI collaborator were *both* leaning the same way and wanted a
disinterested check before tearing out just-built work — found the
deferred thunk over-built for an eager ACL, on repository-verified
grounds:

- **Laziness is never spent.** All 16 call sites (11 production + 5
  test) construct-and-run on one line (`await runTask(svc.m(args))`);
  nothing stores, passes-unrun, retries, or races a `Task`. `runTask`
  is pure ceremony — it renames `await x()` to `await runTask(x())`.
- **The token is contentless.** `Task<T>` over `Promise<T>` adds a
  phantom brand and nothing else — no error channel, no dependency
  channel, no resource scope. A `Promise`-returning method *in
  `src/services/`* (the layer the architecture defines as "effectful
  singletons") already connotes "effectful"; the brand re-states a
  fact two existing signals establish, and introduces a new
  silent-failure class (an unrun `Task` never performs its effect —
  at odds with ADR-0002).
- **Consistency points at revert, not propagation.** The discipline
  had landed on 1 of ~5 effectful services; `library-service`,
  `analysis-persistence-service`, `qeubo-service`, and `api-client`
  all speak plain `Promise`.
- **`analysis-service` cannot wear `Task<T>` honestly** (verified
  against source): its hot methods (`analyzeRange` /
  `analyzeActiveNode`) are *synchronous*, return a query-id string,
  and stream results via callbacks into the ledger — a `Stream`, not
  a single deferred value (its only `Promise`-returning methods are
  `probeEngineInfo` and `clearCache`). `Task<T>` is the wrong algebra
  there, so propagation could not deliver the consistency argued for
  it.
- **The eager branded-`Promise` marker (the no-ceremony alternative)
  is disqualified, not merely leaky:** intersection-branding a
  `Promise` mis-infers under `await` specifically
  (microsoft/TypeScript#48927) — a scheme that breaks inference at
  every `await` site is the opposite of type sanity.

All three inputs (maintainer instinct, AI collaborator, independent
consult) converged on revert. The worked example was not wasted: it
produced the verified call-site census and the
`analysis-service`-is-a-`Stream` finding that turned a hunch into a
grounded decision.

### Triggers for revisitation

1. **A genuine typed-error appetite.** If documenting/handling the
   error channel becomes a felt need, adopt a `Result<T,E>` channel
   (`neverthrow` or a minimal branded `Result`) seeded from the
   failures `backend-service` already constructs by hand
   (`CardTreeOverflowError`, the 404/422 paths). This is the
   information-bearing documentation the 2026-05-29 consult named as
   the real win. **Consulted 2026-06-01**
   (`opus-consult-2026-06-01-neverthrow-overhaul.md`): a full or
   ACL-wide `neverthrow` overhaul is **declined** — ADR-0002 Rule 3
   already blesses the discriminated-union result shape
   (`{ ok, value } | { ok: false, reason }`) and the codebase already
   hand-rolls it (`AnalysisBundleStorageError`). The one categorical
   win (compiler-enforced exhaustive handling, which `try/catch`
   cannot give and ADR-0002 admits it cannot enforce) accrues only at
   the ≤4 multi-variant error spaces (`QeuboError`,
   `AnalysisBundleStorageError`, `AnalysisWaitError`,
   `CardTreeOverflowError`) and is a property of the union +
   `never`-default `switch`, not the library — no `andThen` chains
   exist, and ~32 of ~36 boundaries carry a single opaque `Error` no
   caller branches on. Residual option: a ~12-line home-grown
   `Result`/`match`, exhaustively handled at those ≤4 sites — pending
   maintainer decision, merit-gated; status quo (ADR-0002 + the
   existing typed-error classes) holds everywhere else.
2. **The first effect genuinely deferred.** The moment a service
   effect is stored, passed unrun, retried, or raced *without* being
   run immediately, a bare `IO`/`Task` begins to pay for itself —
   adopt it there, scoped to that need.
3. **Proxy fan-out concurrency / resource-scope.** This was Effect's
   one named earn-its-weight candidate (range-query fan-out,
   cancellation, subscription lifetime). **Evaluated on architectural
   merit with maturity bracketed, 2026-06-01**
   (`opus-consult-2026-06-01-effect-ts-architectural-merits.md`):
   Effect is **declined at all scopes** — over-built even here. The
   hand-rolled code reads as solid and better-fit: `Scope` owns the
   wrong axis (resources are owned by long-lived *entities* —
   `BoardId`, identity — released at *domain events*, not by
   computations over lexical extents; `resetWorkspace` deliberately
   *keeps* the live socket across an identity flip, which a
   release-on-exit `Scope` cannot express — `store/index.ts`),
   `Stream` models the wrong half (`analyzeRange`/`onAnalysisUpdate`
   fan each packet to ~5 disjoint sinks — a multiplexing subject, not
   a single-consumer back-pressured stream — `analysis-service.ts`),
   `Fiber` interruption is already delivered by `AbortController` + an
   idempotent `settle()` race (`wait-for-analysis.ts`), and the
   2026-05-04 resource-ownership audit already closed the leak class
   `Scope` would prevent. The narrowed, concrete shape-changes that
   *would* flip the verdict: (i) a real single-consumer back-pressured
   pipeline appears; (ii) N-way join-race orchestration appears; (iii)
   the codebase goes multi-author and wants compiler-enforced
   ownership. Until one of those, the existing entity-keyed `Map` +
   `AbortController` + resource-ownership discipline is the better fit.

Absent one of these, effect-typing stays out; a `Promise<T>` returned
from `src/services/` carries the "effectful" signal the architecture
already relies on.
