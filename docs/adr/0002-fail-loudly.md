# ADR-0002: Fail Loudly

- **Status:** Accepted
- **Genre:** Tenet (cross-cutting principle) — as distinct from ADR-0001
  which was a specific technical decision. Tenets guide future decisions;
  decisions resolve specific questions. Both are filed under `docs/adr/`
  for single-location retrieval.
- **Date:** 2026-04-24
- **Scope:** Codebase-wide. Applies to the frontend (`gogui`) and, as a
  design aspiration, to coordinated choices on the Ebisu backend.

## Context

During the buildup of this project, many small and large architectural
decisions have turned out to share one hidden dependency: they each
resolve an ambiguity between "try to handle this anomaly gracefully"
and "make the anomaly visible and stop." In every such case, the
project has chosen visibility over graceful handling, and has been
better off for it. The pattern now has enough weight to be worth
naming, so that future decisions don't have to re-derive it.

Examples of decisions already made under this tenet (without having
been labeled as such):

- **KataGo analysis timeout (item 21).** A 30-second timeout surfaces
  a warning and resets review status to IDLE. No auto-retry. Rationale
  given at the time: "silent retry would mask real engine problems."
- **Analysis persistence design (planning note).** Each failed upload
  surfaces a system-log warning naming the specific `(configHash,
  nodeId)` that didn't persist. No background retry queue. Rationale:
  "silent retry masks real backend problems. A failure that silently
  recovers looks exactly like success — until the user discovers the
  data is gone weeks later."
- **Sync service error surfacing (item 20).** Hydration and save
  failures emit user-visible `pushSystemMessage` calls. HTTP error
  bodies are truncated and surfaced. Rationale: "the user should know
  their workspace will not persist this session, not discover it
  tomorrow."
- **ACL typing (items 29 + 30).** Replacing `any` with wire-typed
  `CardFromWire` at the anti-corruption layer. Rationale: "a backend
  rename becomes a compile error at every affected site, rather than
  silently miscoerced data."
- **`readonly` sweep (ADR-0001 + Commit 1a).** Removed `readonly` from
  state containers that are in fact mutated; kept it on genuine value
  objects. Rationale: "type declarations are lies when they claim
  properties the code doesn't hold. Align the type with reality, so
  future annotations actually mean something."
- **Safe-by-construction cast documentation.** When we do use `as
  NodeId` in strict mode, comments justify why the cast is honest.
  The alternative (silent `as any`) is explicitly rejected.
- **`gradingParameter` discovery (build-error sweep).** TypeScript
  flagged that `useReviewSession` read a field that didn't exist on
  the domain type. The feature had been silently broken. The tenet
  working as intended: the failure became visible, and we fix it.

The common thread: **when the system has a choice between "recover
quietly" and "fail audibly," prefer audibly**. Silent failures
accumulate into debt that is discovered late, often by a user, often
as corrupted data.

## Decision

**We adopt "Fail Loudly" as a codebase-wide tenet.** When the system
encounters a condition that deviates from its stated invariants —
unexpected data shapes, timeouts, authentication drift, missing
resources, failed network calls, violated assumptions — it should
surface the deviation through the loudest appropriate channel, not
paper over it.

### The hierarchy of loudness

Loudness is not binary. We recognize a hierarchy of mechanisms for
surfacing anomalies, from strongest to weakest:

1. **Compile-time error** (TypeScript rejects the code). Strongest;
   the anomaly can never reach production. Preferred wherever the
   type system can describe the invariant.
2. **Build-time error** (tests fail; linter rejects). Nearly as strong
   as compile-time for runtime code paths whose types don't capture
   the invariant.
3. **Runtime exception** (throws and halts the current operation).
   Strong; visible to the user or developer; breaks the offending
   code path clearly rather than continuing in an undefined state.
4. **User-visible system message** (`pushSystemMessage('error', …)`
   or `'warning'`). Visible; the user knows the operation didn't
   complete; they can take action or report it.
5. **Developer-visible console warning** (`console.warn`). Visible
   during development and to anyone looking at DevTools; invisible to
   end users. Appropriate for "this shouldn't happen, but if it does,
   the rest of the system can continue."
6. **Silent fallback or default.** Lowest. Appropriate only when the
   fallback genuinely is the right answer (e.g., `visitsOverride` of
   garbage input falls through to the card's `defaultVisits`).

The tenet: **reach for the strongest level that fits the anomaly,
not the weakest that's expedient.**

### What counts as "loud enough"

A deviation is surfaced loudly enough when one or more of the
following holds:

- **A developer running the code sees the anomaly.** (Either through
  a type error, a thrown exception, a failed test, or a console
  warning during development.)
- **A user encountering the anomaly in production sees that
  something went wrong.** (Either through a visible error message, a
  non-successful UI state transition, or a refusal to proceed.)
- **The anomaly is recorded in a way that can be retrieved later.**
  (A logged warning is retrievable; a silent fallback is not.)

A deviation is *not* surfaced loudly enough when:

- The system recovers by guessing what the caller "probably meant."
- The system retries automatically and the retry is invisible to the
  caller.
- The system returns a sentinel value (zero, empty string, empty
  array, `null`) that is indistinguishable from a legitimate empty
  result.
- The system logs a warning that is never seen because nobody looks
  at the relevant log.

### Concrete rules

1. **No automatic retry for operations that could indicate a genuine
   problem.** Timeouts, 4xx/5xx HTTP responses, failed persistence:
   surface them. If the user wants to retry, they can — explicitly.
   (Transient network retries at the TCP layer are not "automatic
   retry" in this sense; neither is HTTP/2 connection reuse.)
2. **Type assertions must be justified.** `as Foo` is allowed when
   the cast is safe-by-construction; a comment must say why. `as any`
   is strongly discouraged; when unavoidable (e.g., interop with
   untyped libraries), comment the scope of the unsafety.
3. **Sentinel-return-instead-of-throw is a red flag** and requires
   justification. Prefer `throw`, `undefined` (when the distinction
   between "no value" and "empty value" is meaningful), or a
   discriminated union result type (`{ ok: true, value } | { ok:
   false, reason }`).
4. **ACL boundaries must validate, not coerce.** The anti-corruption
   layer between wire types and domain types translates shapes; it
   does not silently fill in missing fields with defaults. Missing
   required fields produce warnings or errors, not coerced
   defaults.
5. **Error-swallowing `catch (e) {}` is never acceptable.** At
   minimum, the catch block logs or re-throws with context. A bare
   empty catch is treated as a bug during code review.

## Consequences

### Positive

- **Failures become visible on the timescale of development, not
  deployment.** A bug that surfaces at compile time costs minutes to
  fix; the same bug surfacing weeks later as "some users' data went
  missing" costs days.
- **The codebase becomes self-documenting about its invariants.**
  Every cast-with-comment, every pushSystemMessage, every
  deliberately-failing predicate is a tiny documentation of what the
  code expects. Future contributors read them like lane markings.
- **User trust improves.** A system that tells the user when
  something went wrong is more trustworthy than one that silently
  degrades. The user can decide whether to continue, retry, or
  report — they're not stuck wondering why their data looks weird.
- **Backend coordination improves.** When the ACL surfaces a
  malformed response, the frontend team can report it precisely; the
  backend team can fix it before it becomes a shipped bug.

### Negative

- **Slightly more verbose code.** A function that throws on malformed
  input is longer than one that silently returns a default. Comments
  justifying casts are lines that wouldn't exist without the tenet.
- **Occasional user-facing rough edges.** A transient network blip
  may surface to the user as "save failed" instead of being silently
  retried. This is the tenet working as intended — the user now
  knows something happened — but it costs UX smoothness in the
  transient case.
- **Developer discipline required.** The tenet is a policy, not an
  enforced mechanism. A lazy `catch (e) {}` will compile fine; only
  code review catches it.

### Neutral

- **The tenet does not prescribe implementation details.** It says
  "fail loud;" it doesn't say "always throw" or "always use
  pushSystemMessage." The appropriate mechanism depends on the
  situation and the level in the loudness hierarchy that fits.

## Exceptions

Some places deliberately do not fail loud. They are documented here
so the tenet isn't misapplied.

### UI input validation fallbacks

The `setVisitsOverride(value: number)` action silently refuses
non-finite or negative inputs. The input element has `min="1"`
client-side; the composable refuses garbage. The user experience is
"my invalid input did nothing," which is correct: making a user-
visible error for a value that the UI shouldn't have allowed in the
first place would be noise.

Rule of thumb: **when an invalid input is structurally impossible in
the normal UI flow, silently rejecting it is acceptable.** The
invalid input represents a programming error or a deliberate DOM
manipulation; neither warrants user-facing feedback.

### Idempotent state transitions

`clearTimeout` on a not-yet-set timer does nothing and does not
throw. `settle(fn)` with `settled = true` returns early silently.
These are idempotence guarantees, not failures — calling a
no-op-when-already-done function is correct usage.

Rule of thumb: **idempotence is not silent failure; it's an
invariant being preserved.** The caller is allowed to not know
whether the operation had already run.

### Backend stale-bundle compat shims

`ebisu-service.ts::mapToReviewCard` has fallback chains like
`raw.canonical_content ?? raw.normalized_sgf ?? raw.sgf` during the
34b wire-rename transition. These ARE a form of "quietly coerce
ambiguous input." The justification: the alternative (compile error
if the frontend happens to load with a stale backend response)
would fail-loud *at the wrong layer* — the user would see a broken
app when the actual problem is a transient deployment skew. The
fallback chain silently handles the skew; the 34b-cleanup TODO item
removes the fallbacks once the skew window closes.

Rule of thumb: **temporary, bounded, explicitly-scheduled-for-
removal compat shims are acceptable** if the alternative would
produce user-facing breakage for reasons the user cannot action. They
must be commented as such.

## What this tenet does NOT mean

- **Not "crash on any anomaly."** A missing optional field is not a
  crash-worthy event; a missing required field might be.
- **Not "refuse to handle edge cases."** Edge cases get handled;
  they just get handled visibly, not silently.
- **Not "spam the user with warnings."** The loudness hierarchy is
  graded; most anomalies are developer-level, not user-level.
- **Not "fail on first sign of trouble."** Operations that are
  legitimately retryable (an in-flight GET that just hit a transient
  DNS hiccup, handled by the HTTP stack's own retry) are not
  "failures" at our layer.

## Revisit when…

This tenet would be worth reconsidering if one or more of the
following happen:

1. **User-visible warnings become spammy in practice.** If real
   users report being annoyed by warnings that cry wolf, we may need
   to recalibrate which anomalies deserve user-visible surfacing vs.
   developer-only logging. (Unlikely in the near term; no user has
   been annoyed by a warning yet because no user has reported many
   warnings.)
2. **A pattern emerges where multiple unrelated anomalies collapse
   into one useless message.** E.g., if every API failure surfaces as
   "something went wrong," the tenet is being followed in letter but
   failing in spirit. The fix isn't to silence the warnings; it's to
   make them more specific.
3. **A specific domain emerges where silent fallback genuinely is the
   right answer.** New domain-specific exceptions may warrant being
   listed here alongside the three currently captured.
4. **The codebase adopts a structured error-reporting service**
   (e.g., Sentry). The loudness hierarchy may gain a new level
   between console.warn and pushSystemMessage, and rules may need
   updating.

## Related

- **ADR-0001** (State Mutation and `readonly` Policy). The decision to
  remove `readonly` from state containers was itself an application
  of this tenet: the `readonly` annotation was a lie about the
  codebase's behavior, and the tenet says "align the annotation with
  reality so the annotation means something."
- **TODO item 21** (shipped). KataGo timeout with surfaced warning
  and no auto-retry.
- **TODO item 20** (shipped). API and sync error surfacing via
  pushSystemMessage.
- **`../notes/analysis-persistence-plan.md`**. Per-record failure surfacing,
  no silent retry queue.
- **Engagement protocol** (operative throughout this project). The
  rules "if you think you are missing some code… you *must* ask for
  it before attempting to do anything; don't make any unwarranted
  assumptions based on convenience" and "abstractions are a means of
  offloading working memory" are themselves applications of the
  fail-loud tenet applied to the human-AI collaboration layer.
