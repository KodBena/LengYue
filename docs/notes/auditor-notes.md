# Auditor Notes

A ledger of overarching observations from auditors — Claude sessions
that have completed an orientation pass of the codebase. Each entry
is dated and signed by session.

## Genre

Auditor notes capture **overarching functional aspects the auditor
believes are missing from the existing documentation graph**. They
are the cross-cutting view from a fresh orientation: gaps in the
product's lifecycle story, architectural footguns visible only from
30,000 feet, anti-features whose absence shapes everything else.

## Distinct from

- `docs/TODO.md` — actively scheduled work. Auditor notes feed this,
  but only after the user prioritizes an item; promotion is manual.
- `docs/notes/deferred-items.md` — working-memory offload during
  active work. Auditor notes are the cross-cutting view from
  orientation, not the in-passing observation from a specific task.
- `docs/notes/reflection.md` — backend architectural retrospective
  at a closure event. Auditor notes accumulate continuously across
  sessions; they are not retrospectives.
- `docs/handoff-current.md` — orientation document for someone
  arriving cold. Auditor notes are the *output* of someone arriving
  cold, not the *input*.

## Required structure

Each dated entry consists of:

1. A header: date and signing session moniker (model + variant).
2. The observation items, numbered for cross-reference.
3. *(Optional)* The auditor's prioritization — which items they
   would file as TODO entries if forced to pick a few.
4. **An "Advice for the next auditor" section.** Required. This
   is where wisdom accumulates across sessions: short, candid,
   opinionated guidance to whoever sits in this seat next. Bend
   it, disagree with it, override it — but read it before
   starting.

## How to read this file

Entries are append-only by date, newest at the bottom. Items within
an entry are numbered for cross-reference. When an item is promoted
to `docs/TODO.md` (or addressed otherwise), replace its body with a
one-line outcome and the date, leaving the entry visible as
historical record. When an item is superseded by a later auditor's
re-observation, both stay; the duplication is itself a signal.

Items here are **observations, not commitments**. The auditor does
not own follow-through.

Auditors arriving cold should read every prior entry's "Advice for
the next auditor" section before starting. That cross-session
wisdom is what the ledger earns its keep on.

---

## 2026-04-27 — orientation by Claude (Opus 4.7)

Pre-existing TODO/ADRs/notes graph examined; testing-coverage gap
already filed and excluded by request. Items below are the gaps
the auditor noticed that did not appear elsewhere.

### 1. User-data lifecycle (export, import, delete)

The handoff names "no tenant deletion path" as a known gap; its
sister gaps are also missing — no export ("give me my cards,
palettes, SGFs as a tarball") and no import ("here's my export
from another instance"). The schema is right for it (everything
is `user_id`-scoped) but no script, no endpoint, no UI exists.
The three together are the GDPR-shaped trio and a trust signal
even pre-deployment.

### 2. Frontend store schema versioning + hydrate migrations

- **Closed:** 2026-04-27. Framework shipped on branch
  `frontend/store-schema-versioning`.
  `CURRENT_SCHEMA_VERSION = 1` and an empty append-only
  `migrations[]` array in `frontend/src/store/migrations.ts`;
  `updateFromRemote` runs `migrate()` before applying;
  `buildPersistencePayload()` stamps the version on outbound
  saves. The de-branding tier (the original forcing function)
  now has a place to land migration `1 → 2` as one principled
  migration rather than three ad-hoc shims.

### 3. Account recovery / password reset

The backend has username + password + JWT but no recovery flow.
Not a blocker for the local install; hard blocker for
multi-tenant deployment. Tied to the (also missing) story for
outbound email.

### 4. Rate limiting on the auth surface

`/auth/token`, `/auth/register`, and `/auth/me` have zero
rate limiting. Item 9c closed username-enumeration via response
shaping, which raises the bar but doesn't replace per-IP
throttling. Pre-public-deployment requirement.

### 5. Top-level frontend error boundary

- **Closed:** 2026-04-27. `RootErrorBoundary.vue` wraps App.vue's
  root content; uses Vue 3's `onErrorCaptured` to catch
  descendant render/watcher/lifecycle/event-handler errors,
  surfaces them via `pushSystemMessage('error', ...)`, and
  displays a fallback overlay with a "Reload page" button.
  `app.config.errorHandler` in `main.ts` is the last-resort
  backstop for errors that escape every component boundary
  (App.vue setup, mount-time errors).

### 6. Backend health/liveness endpoint

Standard `/health` (or `/healthz`) returning
`{status, version, db_reachable}` for whatever orchestrator runs
the public deployment. Trivial; absent.

### 7. JWT revocation / "log out everywhere"

Logout exists (commit `6be0ea7`) but is presumably client-side
only — the JWT remains valid until expiry. A revocation list
(or short-lived access + refresh) becomes important once
accounts have real value attached. Pairs with item 28's 401
retry work.

### 8. Game-source provenance

When an SGF lands in `game_source`, what it came *from* isn't
tracked beyond the user's name for it. A lightweight `origin`
field (`{kind: 'file' | 'url' | 'paste', value: string,
imported_at: Timestamp}`) buys "where did this position come
from", supports re-importing updated versions, and would be
useful when palette calibration starts referencing real-world
game distributions.

### 9. `gradingParameter` typing

The handoff calls this out as "the most opaque field in the
domain model" and warns against letting `Record<string, any>`
become permanent through inertia. Not in the TODO. Worth
promoting to "audit the inner shapes that exist today and
decide whether any deserve a typed schema." The longer it sits
the more callsites calcify around the `any`.

### 10. Cold-start seeding for new cards

Every fresh card gets the same `EBISU_DEFAULT_MODEL =
(3, 3, 1.0)` prior, regardless of user-evident difficulty. Many
SR systems let the user mark new cards "easy / medium / hard"
once at mint time to seed the prior. A small UI affordance plus
a `priorHint` parameter on `create_card` would close it;
complements the qEUBO direction (which tunes population priors)
by addressing per-card initialization.

### 11. Frontend asset version banner / reload prompt

When the SPA rolls forward, existing tabs run stale code against
a new backend until refresh. The standard answer is a small "the
app has updated; reload" toast triggered by a version mismatch
between bundled-build-id and a `/version` endpoint.
Production-deployment polish; absent.

### Auditor's prioritization

If forced to pick three to file as TODO entries today:

- **#2 (store schema versioning)** — the de-branding work will hit
  it; doing it with a frame beats doing it ad-hoc three times.
- **#1 (data lifecycle)** — overdue, trust-shaped, blocks GDPR
  posture for any public deployment.
- **#9 (`gradingParameter` typing)** — already an explicit "don't
  let this become permanent" in the handoff; every month it sits
  the cost of closing it grows.

### Advice for the next auditor

Take these as priors, not facts. The codebase has a coherent
personality; you'll calibrate quickly if you read the ADRs and
listen to the handoff.

- **The user is non-programmer; the project is LLM-driven.** They
  direct via prose, not code, and they trust the LLM's judgment.
  That trust is the project's most precious resource. Don't
  squander it by confident bullshit. Flag uncertainty, name your
  assumptions, surface trade-offs rather than pick silently —
  even when the user signals they trust you. *Especially* then.
- **The ADRs are load-bearing, not advisory.** CLAUDE.md says so
  but it's easy to read past. ADR-0002 (fail loudly), ADR-0004
  (minimal-touch), and ADR-0005 (documentation discipline) reflect
  bitter experience. Treat any contribution that fights them as
  wrong by default — including your own clever instincts.
- **`docs/handoff-current.md` is candid, not promotional.** Its
  "Rough edges to know about" sections describe ground truth.
  Trust them more than the README's optimism.
- **The Ebisu/LengYue distinction matters.** "Ebisu" is the
  third-party algorithm by Fasiha; "LengYue" is the project. The
  de-branding TODO entries (Trivial / Small / Medium tiers)
  enumerate the misnomer sites and the algorithm-correct
  references that must be preserved. A thirty-second check
  against that inventory beats an enthusiastic-but-wrong sweep.
- **Match the tone.** Methodical, deferential to the existing
  structure, no flattery, no emoji unless asked. The codebase has
  a coherent personality; impose nothing of your own. The user
  notices when output reads like LLM boilerplate and respects
  output that reads like a thoughtful colleague.
- **Don't assume prior auditors were right.** This very ledger
  can drift. If you find a contradiction in this file, in the
  codebase, or in the doc graph, surface it explicitly. Wisdom
  accumulates only if it stays honest; deference to past
  observations isn't the same as deference to truth.
- **The right answer is sometimes "no, don't add this."** The
  user values restraint over feature accretion. A clean refusal
  beats a fix that has to be retired later. If something looks
  half-baked, say so before implementing.
- **The proxy is frozen.** `proxy/` is the KataProxy submodule
  pinned at v1.0.0. It is not your concern. If you find yourself
  wanting to modify it, you've drifted out of scope. Stop and
  surface the cross-boundary nature.
- **Git hygiene is not the user's strong suit, by their own
  admission.** They appreciate it when you push back on bad
  commit messages, surfacing of generated-file hand-edits,
  unintended `.env` commits, and similar hygiene drift. They do
  *not* appreciate sycophancy. The single best signal of a good
  audit pass is whether the user's quality bar is *raised* by
  the end of the session, not lowered to meet their workflow.
- **When in doubt, ask.** ADR-0004 makes this non-optional under
  partial visibility; the same posture applies when context is
  simply missing rather than partially visible. A clarifying
  question costs one round-trip; a wrong assumption costs the
  rest of the session.

— end 2026-04-27 entry —

---

## 2026-04-27 (follow-on) — doc-graph discipline by Claude (Opus 4.7)

A narrow meta-pass on documentation-graph organization, requested
mid-session as a follow-on to the morning's orientation. Single
deliverable produced; no functional product gaps enumerated. This
entry is brief by design — primarily of interest to other auditors.

### 1. Documentation-graph opacity and LLM-onboarding efficiency

The user surfaced two conjoined concerns: human reviewers cannot
cheaply assess doc liveness across the tree (especially in flat
directories like `dispatch/` and `worklog/`, where most entries are
historical), and LLMs onboarding to a sub-project or the umbrella
waste cycles classifying which docs will improve their grasp vs.
which are time-sinks. Plan drafted at
`docs/notes/doc-graph-discipline-plan.md` (status: `draft`). It
proposes ten genres in a closed enumeration, per-genre status
vocabulary, YAML frontmatter as the single source of truth for
metadata, an optional generated `INDEX.md`, a one-time back-catalog
sweep, and a forward authoring discipline — to land as a new ADR
(proposed slot ADR-0008). Three sub-questions remained unresolved
and are logged within the plan body (Section 11), with recommended
future filing in `docs/notes/decisions-deferred.md`. The
relational-DB option was assessed and recommended against at
current scale; trigger conditions for revisitation are named in the
plan.

### Advice for the next auditor

- **The auditor seat covers structural-meta as well as
  functional-gap work.** This entry is the precedent. Don't assume
  the next pass looks like the first.
- **The meta-plan → plan cadence served the forking decisions
  well.** When the topic has multiple genuine forks, surface them
  before resolving — the user redirects cheaply at the meta layer.
- **This work is orthogonal to RFC-0001's audit discipline.** Both
  are governance, but they resolve independently. Don't bundle.

— end 2026-04-27 (follow-on) entry —

---

## 2026-05-02 — type-vs-implementation divergence at the ACL by Claude (Opus 4.7)

A narrow, mid-session discovery surfaced while implementing the
proxy v1.0.3 `analysis_config` curation migration: a documented
ACL surfacing claim turned out to be type-only. The user flagged
this as a recurring class — "this is not the first time" — and
asked it be filed for systematic audit. This entry is the filing.

### 1. The specific instance — `ReviewCard.gradingParameter`

`types.ts:438` documents `gradingParameter` as having been
"closed jointly with Commit 4 of the build-error sweep" per
TODO Item 18 — *the most opaque field in the domain model*,
the one the SR composable reads to override the active palette
per card. The TYPE landed (the field is on `ReviewCard`); the
IMPLEMENTATION did not (`services/backend-service.ts::mapTo-
ReviewCard` extracts `default_visits` and `gamma` from
`raw.grading_parameter` via `readGradingParam<T>` but never
propagates the whole blob onto the returned `ReviewCard`).
`useReviewSession.ts:235`'s `currentCard.value?.gradingParameter
?.data?.analysis_config` therefore reads `undefined` in
production today. The per-card config-override path is dormant;
reviews use `compileAnalysisConfig()` (live env config)
regardless of what the card was minted with.

The cross-team coordination during the v1.0.3 release window
operated on the (incorrect) premise that this field round-trips
through review. The frontend reply to the proxy team named the
field as part of the persistence story, the proxy team built
their card-coverage follow-up around it, and the agreed
migration design included an ACL rewrite at the boundary —
until implementation revealed there's no boundary to rewrite
at, because the field is dropped on the floor.

The 11 → 12 migration ships the live-profile half of the
curation alignment regardless. A warning comment is placed at
the type declaration site (`types.ts:438`); when Item 18's
implementation half is properly closed, the contributor must
also wire `engine/analysis-config-curation.ts::rewriteGrading-
ParameterAnalysisConfig` at the ACL or 7000+ pre-v1.0.3 cards
become unreviewable. A closing dispatch documents the discovery
to the proxy team.

### 2. The class — type-vs-implementation divergence at boundary translators

The `gradingParameter` instance is one of (per the user) at
least several. The pattern shape is:

- A type is added to a domain model declaring an optional
  field.
- A doc comment claims the field is surfaced by the relevant
  ACL / boundary translator.
- The implementation half — the code in the ACL that actually
  populates the field — is forgotten, deferred, or never
  written.
- TypeScript permits this because the field is optional;
  `undefined` is a valid value for the absent-field case.
- Consumers compose with optional-chaining (`?.`); reads
  silently return `undefined`; the consumer's logic falls
  through to its fallback path.
- The system appears functional but a documented capability
  is dormant. The lie is invisible to the type-checker, to
  the build, and to runtime — only an audit catches it.

This is structurally adjacent to but distinct from the
"signature lie" class the brand-pair work surfaced earlier
this session (e.g., `useVariationPath` declaring
`ComputedRef<string[]>` while its source was `NodeId[]`,
`StabilityPanel` emitting bare-number `selectionRange` while
the value originated as `PlyIndex`). Signature lies are
type-vs-type divergences within the type system; this class
is type-vs-implementation divergence between the type system
and the boundary code. Both produce silent gaps, both are
invisible to compile-time checks, both calcify if not
audited.

The dependency graph that makes this class load-bearing:

- ACL boundary translators are the only place wire shapes
  meet domain types in this codebase (per ADR-0003 band
  taxonomy and the architectural shape doc).
- The type system trusts the ACL to produce honest domain
  values; consumers downstream don't re-validate.
- A field that's typed-but-not-populated is a localized
  contract violation. The contract is invisible because
  optionality + structural typing accept the ACL's
  incomplete output without complaint.

### 3. Suggested audit shape

The natural locus is `services/backend-service.ts::mapTo-
ReviewCard` and any other ACL translator with documented
surfacings (search for "Item N surfacing" or similar
closure-claim comments in `types.ts`). For each documented
field:

- Verify the ACL assignment exists (the field appears in
  the returned object literal of the translator).
- Verify the assignment chains to the wire data (the field's
  value derives from `raw.<wire_field>`, not from a static
  default or undefined).
- For passthrough fields (whole-blob propagation), verify
  any defensive transformation (sanitization, normalization,
  brand-cast) is also in place.

A single-pass auditor sweep would suffice: read the
`ReviewCard` interface (and any neighbouring domain interfaces
with documented surfacings), grep `mapToReviewCard`'s body for
each field's assignment site, flag any field that's typed but
not assigned.

Other documented surfacings on `ReviewCard` to verify in the
same pass: `currentRecall`, `halflifeUnits`. Both are part of
"Item 18 surfacing (Commit 4)" per the same comment block; if
`gradingParameter` was missed, these may have been too.

### 4. Sister-class — TODO ↔ code drift (inverse-direction divergence)

Surfaced later the same day, on user prompt: "I thought 34b
was closed. Can you check?" Investigation showed that
`docs/TODO.md`'s 34b-cleanup entry was still listed under
Active (Small tier) and called out by name in the
implementation-order recommendation, despite the actual code
work having shipped on 2026-04-26 in commit `41a9c5d`
("ebisu-service: drop 34b stale-bundle compat shims") with
explicit `Closes: TODO 34b-cleanup` in the commit body. The
TODO never got the corresponding update; three stale references
accumulated (the Active entry itself, an "is now unblocked and
listed in the Small tier below" pointer in the Joint Completed
parent row, and the implementation-order recommendation).

This is the **inverse direction** of the section-1 instance.
There the implementation lagged the type/doc claim
(`gradingParameter` declared but never populated). Here the
documentation lagged the implementation (work done, TODO not
updated). Same family — claim-vs-reality desync at a doc-graph
boundary — but the asymmetry is the notable bit:

- **Type-vs-implementation divergence** is invisible to the
  type-checker (TS optionality silently accepts). It surfaces
  only when a downstream consumer *expects* the field to be
  populated. The cost is silent dormancy.
- **Doc-vs-code divergence** is invisible to any compile-time
  check at all (no machinery validates that TODO claims match
  code state). It surfaces only on human re-reading. The cost
  is recurring "didn't we do that already?" cycles, where each
  re-read pays the audit-from-scratch tax.

The audit shape generalises: any boundary between a high-level
claim (type, doc, dispatch correspondence) and a lower-level
reality (implementation, code state, current configuration) is
a candidate divergence site. The boundary translators audit in
section 3 is one specific application; a periodic doc-graph
sweep against shipped commits is the other. The 34b case
suggests a small mechanism: when a commit body declares
`Closes: TODO X`, the TODO entry retire should ride alongside
in the same commit (or the next commit on the same branch).
The `Closes:` trailer is the auditor's signal; honouring it
would close most instances of the doc-drift direction.

The 34b stale references are retired in a small docs-only
PR that lands alongside this sub-observation.

### Auditor's prioritization

- **Item 18 actual closure** — surfaces `gradingParameter`,
  `currentRecall`, `halflifeUnits` properly through `mapTo-
  ReviewCard`, with the curation rewrite at the ACL as a
  bundled requirement. Files into TODO under the Medium tier
  with a precondition note (the proxy v1.0.3 migration must
  ship first). This is the immediate-action item this entry
  surfaces.
- **A class-wide audit pass** — single sweep across the ACL
  and any other boundary translators looking for typed-but-
  unassigned fields. Filed at this entry's level rather than
  promoted to TODO; the user can elect to schedule it as its
  own session.

### Advice for the next auditor

- **The boundary-translator audit is mechanical.** Reading
  `mapToReviewCard` against the `ReviewCard` interface takes
  five minutes. It should be a periodic pass, not a wait-
  for-discovery exercise — every documented surfacing claim
  in `types.ts` is a candidate for the divergence class.
  When you do the pass, file what you find under this same
  entry as a sub-numbered observation; the class deserves a
  cumulative tally so we can see whether it's a chronic shape
  or a one-off.
- **The doc-graph ↔ code drift sweep is also mechanical.**
  `git log --all --grep "Closes: TODO"` lists every commit
  that claims to retire a TODO entry; cross-reference against
  the current `docs/TODO.md` Active sections and flag any
  claimant whose corresponding entry is still listed. The 34b-
  cleanup case (section 4 above) was a six-day-old retire that
  only surfaced on user prompt; even on that short horizon the
  re-read tax was a recurring "didn't we do that already?"
  cycle for the user. Pair this with the boundary-translator
  pass — same five-minute audit shape, opposite divergence
  direction.
- **Watch for "Commit N closes Item M" claims that mention
  type-side work but not implementation-side work.** Those
  are the highest-likelihood divergence sites. The
  `gradingParameter` instance had exactly that shape in its
  doc comment.
- **TypeScript optionality is the silent collaborator.** The
  type-system permits divergence because optional fields can
  be undefined. When you write a domain type, ask whether
  the field is *truly* optional (legitimate undefined cases
  exist) or *aspirationally* optional (the field is meant to
  always be there, optionality is just a defensive shim).
  The latter is a divergence-class trap waiting to spring.
- **The dispatch-chain ground truth check.** When a
  cross-team dispatch's premises depend on observable
  frontend behavior, verify the behavior is what the
  premises claim. The `gradingParameter` discovery would
  have been caught one round-trip earlier if I'd traced the
  read path during the original reply rather than during
  implementation.

— end 2026-05-02 entry —

---

## 2026-05-03 — Item 18 ACL closure follow-on by Claude (Opus 4.7)

A short closure note rather than a fresh observation: the
immediate-action item from the 2026-05-02 entry — "Item 18
actual closure" — shipped today, on the user's prompt. This
entry records what landed and what the broader audit pass
this surfaced is still owed.

### 1. What shipped

The closure follows the scope the 2026-05-02 entry named:

- `services/backend-service.ts::mapToReviewCard` now routes
  `raw.grading_parameter` through `engine/analysis-config-
  curation.ts::rewriteGradingParameterAnalysisConfig` before
  surfacing it on the returned `ReviewCard`. The bit-equivalent
  rewrite aligns pre-v1.0.3 cards' baked configs with the
  curated proxy stdlib so the per-card config-override path
  at `useReviewSession.ts:235` actually overrides at review
  time.
- `currentRecall` and `halflifeUnits` (the other two fields
  in the same Commit-4 batch the auditor entry called out as
  potentially missed) now propagate from `raw.current_recall`
  / `raw.halflife_units` directly. No transformation; the
  wire fields are required `number` in the OpenAPI schema.
- `types.ts`'s WARNING block on `ReviewCard.gradingParameter`
  retired (the dormant-state warning is no longer accurate).
  The `Item 18 surfacing (Commit 4)` comment line trimmed to
  `Item 18 surfacing` since "Commit 4" is no longer the
  authoritative closure reference.
- `engine/analysis-config-curation.ts` header's "not wired
  today" note flipped to record that the ACL pass is now in
  place alongside the migrations consumer.

Residue handling left as the entry recommended: the proxy's
call-time `NameError` for bodies referencing fns outside the
curated stdlib remains the authoritative diagnostic, and the
existing analysis-service → SystemMessage path surfaces it
per ADR-0002. No per-card residue warning at the ACL — that
would be noise, and the migration already covered the
upgrade-path audit.

### 2. What this entry does NOT close

The auditor entry surfaced two distinct items: the immediate-
action item (Item 18 closure, shipped here) and a class-wide
audit pass over `mapToReviewCard` and any other ACL translator
with documented surfacings, looking for typed-but-unassigned
fields. The class-wide pass was deferred at this entry's
authoring time; the user prioritised it later in the same
session, and the dated follow-on entry below records the
sweep's cumulative-tally findings (clean — no further
instances surfaced; one-off, not chronic).

### 3. Lesson reinforced

The "TS optionality is the silent collaborator" advice from
the 2026-05-02 entry was the structural enabler of the original
divergence. The closure path used here — wiring the ACL
assignment, then retiring the WARNING block at the type
declaration site — is the symmetric remediation: when a typed-
but-unpopulated field is finally populated, the documentation
that warned about its dormancy must retire alongside, or the
warning ages into a different kind of lie (claiming a state
the code no longer exhibits). The doc edit and the code edit
ship in the same commit for this reason, not as a follow-up.

— end 2026-05-03 entry —

---

## 2026-05-03 (follow-on) — class-wide ACL audit sweep by Claude (Opus 4.7)

The "class-wide audit pass" the 2026-05-02 entry filed as a
secondary recommendation, and the 2026-05-03 closure entry
defered as out of its own scope, ran in the same session. This
entry is the cumulative-tally artifact the original entry's
"Advice for the next auditor" asked future passes to file.

### 1. Mechanical procedure applied

For each domain interface in `src/types.ts` produced by an
ACL translator, walk its fields against the corresponding
translator's body. For each field: verify the assignment
exists; verify the assignment chains to wire data; for
passthrough fields, verify any defensive transformation
(sanitization, normalization, brand-cast, curation rewrite)
is in place.

The grep that opens the audit:

```
grep -rn 'Item .* surfacing\|closed jointly\|Commit .* closes\|surfaced (Commit' src/types.ts
```

After PR #96 retired the Item 18 surfacing claims, the only
match in `src/types.ts` is the `Item 18 surfacing` section
comment in `ReviewCard` itself. No other "Item N surfacing"
or "closed jointly with Commit M" claims survive in domain
types — meaning either there were no other documented
surfacings to audit (the more likely reading: closure-claim
comments were rare), or the practice itself decayed before
the divergence class was named.

### 2. Forward sweep — typed-but-unassigned fields

Every ACL translator in the codebase walked against every
field of the domain type it produces. Findings:

| Translator | Domain types | Verdict |
|---|---|---|
| `services/backend-service.ts::mapToReviewCard` | `ReviewCard` | Clean post-PR-#96. |
| `services/backend-service.ts::mapResolvedRoot` | `RootGroup` | Clean — three fields, brand-cast at boundary. |
| `services/backend-service.ts::mapTreeNode` | `CardLineageNode` | Clean — recursion handled. |
| `services/backend-service.ts` inline (`fetchTreeByRoot`) | `CardLineageTree` | Clean. |
| `services/backend-service.ts` inline (`resolveRoots`) | `ResolveRootsResult` | Clean. |
| `services/qeubo-service.ts::map{Experiment,Status,Pair,Best,PreferenceResult,History}` | `QeuboExperiment`, `QeuboStatus`, `QeuboPair`, `QeuboBest`, `QeuboPreferenceResult`, `QeuboHistory` | Exemplary — every wire field maps to exactly one domain field, `narrowPhase` enforces the discriminated union per ADR-0002 with a throw on contract violation. |
| `services/api-client.ts::getMe` → `composables/useAuth.ts` (composable-side projection) | `AuthState` constructor `{ kind: 'authenticated', username, userId }` | Clean as a translator. Drops `has_password`; the domain type doesn't model it (out of scope: wire-side surplus, not domain-side missed assignment). |

**No new typed-but-unassigned fields surface.** The `gradingParameter`
instance was a one-off in the present codebase, not the
leading edge of a chronic shape. The cumulative tally for
the class so far: one instance, found, closed.

### 3. Inverse sweep — TODO ↔ code drift

The 2026-05-02 entry's section 4 named TODO ↔ code drift as
the inverse-direction divergence class. The mechanical pass:

```
git log --all --grep "Closes: TODO"
```

Returns exactly two commits: `41a9c5d` (the original 34b
cleanup) and `d8d81b4` (the meta-commit that retired the
stale 34b TODO references — i.e., the commit the original
entry's section 4 triggered). Both resolved.

Spot-checked Active TODO entries against current code state:

- **"Type the pipeline DSL on the frontend"** —
  `CardSet.pipeline: any[]` at `types.ts:512` is still bare
  `any[]`. Premise holds.
- **"Cards tab merge"** — `srContextIds` and
  `databaseContextIds` are still separate per-tab fields at
  `types.ts:413-414`. Premise holds.
- **"Magic-literals audit"** — predicate "color theming
  substrate done first" is now satisfied (substrate shipped
  2026-05-02). Entry's own "Predicated on …" line correctly
  records this.

**No Active entries have stale premises.**

### 4. Adjacent observations (not class findings)

These surfaced during the sweep and are filed for completeness
rather than as audit findings of the class. Each is a separate
shape that the audit didn't target.

- **Three shipped frontend PRs lack rows in the Frontend
  Completed table:** PR #91 (HorizontalTimelineVisualizer
  rug-plot gradient fix), PR #92 (themeColor signature
  tightened to `ChromeAnchor` literal union), PR #94 (board
  coordinate label band). Each has a worklog entry; none has
  a TODO Completed row. Convention isn't airtight — PR #95
  got a row, those three didn't. This is a documentation-graph
  gap rather than the strict 34b-class drift (no Active entry
  exists for any of them to be retired against), but it's
  adjacent in shape: a gap between the high-level claim
  ("TODO is the canonical record of shipped frontend work")
  and lower-level reality (worklogs are the actual record).
  Not filed for backfill in this PR; the user can elect to
  do a small docs sweep if uniformity is wanted.
- **`ForestStat` and `TagStat` are wire-shape passthroughs
  in `types.ts`** (lines 653-664, 666-668) — snake_case
  fields kept as the domain type, with no ACL translator
  between `getForestStats`/`getTags` and consumers. Two
  consumer sites (`useCardTreeData.ts:65`,
  `ForestDirectory.vue:44, 144`) carry inline `as CardId`
  brand-casts because the domain type leaks `root_card_id:
  number`. Different class from this audit's target (no
  typed-but-unassigned divergence) — this is "missing ACL
  translator entirely." Filed in
  `docs/notes/deferred-items.md` for prioritization.
- **`currentRecall` / `halflifeUnits` have no current
  consumers.** Both fields are correctly populated by
  `mapToReviewCard` post-PR-#96, but no site in `src/`
  outside the ACL itself reads them. Surfacing-without-current-
  consumer is a reasonable shape if the field is intended
  for diagnostics the UI hasn't yet wired (e.g., "this card
  will be at 50% recall in N hours" tooltips). Worth
  remembering when the SR view next gets attention; not
  itself a divergence.

### 5. Closing recommendation

The 2026-05-02 entry's hypothesis was that `gradingParameter`
was "one of … at least several" instances. The mechanical
sweep does not bear this out in the current codebase. The
class-wide audit recommendation closes as **swept clean —
no further instances surfaced**. The user's recollection of
"this is not the first time" likely captures a chronic shape
across the codebase's *history* rather than across its
current state — earlier instances may have been quietly
fixed before the class was named.

The audit shape itself remains valuable as a periodic pass
even when results are clean — the procedure is mechanical,
the cost is ~30 minutes per pass, and the asymmetry between
"discover post-hoc on a dispatch round-trip" and "discover
during a scheduled sweep" favours the sweep.

### Advice for the next auditor

- **Suggested cadence: per-release sweep at minimum.** The
  audit cost is small enough that running it as part of any
  release-prep arc is cheap insurance against a divergence
  having accumulated since the last pass. The mechanical
  procedure transcribes onto a checklist.
- **The grep-for-surfacing-claims pattern is fragile.** This
  pass found very few `Item N surfacing` comments because
  the convention itself was sparse — only `ReviewCard`
  carried them, and that was the one that happened to
  diverge. A future divergence may not announce itself with
  a closure-claim comment. The structurally-honest sweep is
  walking every domain interface against its translator,
  not grepping for self-flagging instances. Trust the field
  walk; treat the grep as a hint, not a filter.
- **Optional fields are the silent collaborator (still).**
  When you see `field?:` in a domain interface, the
  audit-relevant question is: is this field genuinely
  optional (legitimate undefined cases exist) or
  aspirationally optional (the field is meant to always be
  there, the optionality is a defensive shim)? The latter
  is the divergence trap; the former isn't. Keep the
  taxonomy explicit when a new optional field is added —
  ideally in a doc comment that names the optionality
  category.
- **The inverse class generalises beyond TODO ↔ code.** Any
  boundary between a high-level claim and a lower-level
  reality is a candidate divergence site. The
  three-PRs-without-Completed-rows observation in section 4
  is one such site (TODO Completed table vs. worklog
  ledger); ForestStat/TagStat is another (declared domain
  type vs. actual ACL discipline elsewhere in the codebase).
  When you sweep the audit class proper, glance at the
  adjacent shapes and file what you see.
- **A clean negative result is itself the data point the
  cumulative tally needs.** Don't pad the entry; record the
  procedure, the verdict, and any adjacent observations.
  The next auditor reads this entry to decide what's worth
  re-checking.

— end 2026-05-03 (follow-on) entry —
