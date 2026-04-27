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
